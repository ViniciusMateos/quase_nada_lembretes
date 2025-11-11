import asyncio
import os
from number_parser import parse_ordinal, parse_number
from dotenv import load_dotenv
import logging
from telegram import Update
from pytz import timezone as pytz_timezone  # Mais confiável para fusos horários
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, JobQueue, ApplicationBuilder
import re
import google.generativeai as genai
import json
from datetime import datetime, timedelta, timezone
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, BigInteger
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool
from keep_alive import keep_alive
import psycopg2
keep_alive()  # isso inicia o servidor web fake

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

FUSO_HORARIO_LOCAL = pytz_timezone('America/Sao_Paulo')

# Configura o log para ver o que está acontecendo
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- Configuração do Banco de Dados (NOVO) ---
DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    logger.warning("DATABASE_URL não encontrada. Usando banco de dados SQLite em memória (volátil).")
    # Se rodar local sem DB, usa SQLite em memória (não persistente)
    DATABASE_URL = "sqlite:///:memory:"

# O NullPool é importante para o Render não manter conexões abertas
engine = create_engine(DATABASE_URL, poolclass=NullPool)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)

# --- Definição da Tabela de Lembretes (NOVO) ---
class Lembrete(Base):
    __tablename__ = "lembretes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(BigInteger, nullable=False)
    titulo = Column(String, nullable=False)
    proxima_execucao = Column(DateTime(timezone=True), nullable=False)
    intervalo_segundos = Column(Integer, nullable=True) # 0 para único, > 0 para recorrente
    recorrencia_str = Column(String, nullable=True) # Para exibir (ex: "diário")

# Cria a tabela se ela não existir
Base.metadata.create_all(engine)


TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

modelo_gemini_instancia = None # Inicializa a instância como None por padrão

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        modelo_gemini = "gemini-2.0-flash-lite" # Nome recomendado para flash-lite
        modelo_gemini_instancia = genai.GenerativeModel(modelo_gemini)
        logger.info(f"Modelo Gemini '{modelo_gemini}' inicializado com sucesso.")
    except Exception as e:
        logger.error(f"ERRO AO INICIALIZAR MODELO GEMINI: {e}", exc_info=True)
        # Se houver erro, modelo_gemini_instancia permanece None, e será tratado nas funções
else:
    logger.warning("GEMINI_API_KEY não encontrada no arquivo .env. Funcionalidades da IA desativadas.")

# --- Funções do Bot ---
async def lidar_com_audio_rejeitado(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Informa ao usuário que mensagens de áudio não são mais aceitas."""

    # Vamos usar HTML para colocar a primeira linha em negrito
    texto_html = (
        "🚫\n"
        "Só consigo processar lembretes por mensagem de <B>TEXTO</b>.\n"
        "Por favor, <b>DIGITE</b> o que você precisa."
        "\n🚫"
    )

    # Usamos reply_html para que o Telegram entenda a tag <b>
    await update.message.reply_html(texto_html)

    # Usamos reply_html para que o Telegram entenda a tag <center>
    await update.message.reply_html(texto_html)

# Função para lidar com erros
async def lidar_erros(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    # Use logger.error para registrar o erro de forma mais robusta
    logger.error(f'Update "%s" causou erro "%s"', update, str(context.error), exc_info=True)

    if update and hasattr(update, "effective_message") and update.effective_message:
        await update.effective_message.reply_text("Ops! Algo deu errado. Por favor, tente novamente mais tarde.")
    else:
        # Quando o erro não tem um effective_message (ex: erro em job), só logamos.
        logger.error("Erro fora de contexto de mensagem (provavelmente em um job): %s", str(context.error))

def substituir_numeros_por_extenso(texto: str) -> str:
    palavras = texto.split()
    resultado = []

    for palavra in palavras:
        try:
            numero = parse_number(palavra)
            if numero is not None:
                resultado.append(str(numero))
            else:
                resultado.append(palavra)
        except Exception:
            resultado.append(palavra)

    return ' '.join(resultado)

async def obter_resposta_gemini(prompt: str) -> str:
    """Envia um prompt para o modelo Gemini e retorna a resposta de texto."""
    try:
        # Cria uma nova sessão de chat com o modelo Gemini
        # Para conversas mais longas, você precisaria manter o estado do chat (histórico)
        # Mas para respostas simples, podemos iniciar um chat novo a cada requisição.
        chat_session = modelo_gemini_instancia.start_chat(history=[])
        response = await chat_session.send_message_async(prompt)

        # Retorna a parte de texto da resposta.
        # Pode ser necessário adicionar tratamento para respostas que não são de texto.
        return response.text
    except Exception as e:
        logger.error(f"Erro ao interagir com a Gemini API: {e}", exc_info=True)
        return "Desculpe, não consegui processar sua solicitação no momento. Minha IA está com problemas."

def intervalo_recorrencia_em_segundos(recorrencia: str | None) -> int | None:
    if not recorrencia:
        return None

    r = recorrencia.lower()

    # Exemplo: "de 2 em 2 minutos" ou "a cada 2 minutos"
    match_minutos = re.search(r"(?:de|a cada)\s*(\d+)\s*minutos?", r)
    if match_minutos:
        return int(match_minutos.group(1)) * 60

    # "diário" ou "diaria"
    if "diário" in r or "diaria" in r:
        return 24 * 3600

    # "semanal"
    if "semanal" in r:
        return 7 * 24 * 3600

    # "mensal"
    if "mensal" in r:
        return 30 * 24 * 3600

    # Se quiser, pode tentar identificar "toda terça", "toda segunda" etc e tratar depois

    return None

async def extrair_detalhes_lembrete_com_gemini(texto_usuario: str) -> dict | None:
    """
    Usa a Gemini API para extrair detalhes de um lembrete em linguagem natural.
    Retorna um dicionário com 'title', 'time', 'date', 'recurrence', 'relative_seconds' ou None se falhar.
    """
    if not modelo_gemini_instancia:
        logger.warning("Modelo Gemini não configurado. Não é possível extrair detalhes de lembretes inteligentes.")
        return None

    # Adiciona a data e hora atual ao prompt para "agora" ou "hoje"
    momento_atual = datetime.now(timezone.utc)
    # Formato do prompt para a IA
    prompt_ia = f"""
    Extraia as seguintes informações de um pedido de lembrete em português.
    Formate a saída como um objeto JSON.
    Se uma informação não for encontrada, use null.

    Campos esperados:
    - "titulo": (string) A ação ou o que deve ser lembrado. Ex: "comprar pão", "ligar para a Maria".
    - "hora": (string, opcional) A hora no formato HH:MM (24 horas). Ex: "08:00", "14:30". Se for "agora" ou "imediatamente", use a hora atual (ex: {momento_atual.strftime('%H:%M')}). Se for "daqui X tempo", calcule a hora futura a partir de agora (ex: daqui 30 minutos é {(momento_atual + timedelta(minutes=30)).strftime('%H:%M')}).
    - "data": (string, opcional) A data no formato AAAA-MM-DD. Ex: "2025-07-21". Se for "hoje", use {momento_atual.strftime('%Y-%m-%d')}. Se for "amanhã", use {(momento_atual + timedelta(days=1)).strftime('%Y-%m-%d')}. Se for "próxima segunda", calcule a data da próxima segunda-feira.
    - "recorrencia": (string, opcional) Se o lembrete se repete. Ex: "diário", "semanal", "mensal", "anual", "toda terça". Se não se repete, null.
    - "segundos_relativos": (float, opcional) Se o lembrete é para "daqui X segundos/minutos/horas", o tempo em segundos. Ex: 300.

    Exemplos:
    "Me lembre de comprar pão amanhã às 7 da manhã."
    {{ "titulo": "comprar pão", "hora": "07:00", "data": "{(momento_atual + timedelta(days=1)).strftime('%Y-%m-%d')}", "recorrencia": null, "segundos_relativos": null }}

    "Lembre-me de ir à academia toda terça-feira às 18h."
    {{ "titulo": "ir à academia", "hora": "18:00", "data": null, "recorrencia": "toda terça-feira", "segundos_relativos": null }}

    "Agendar lembrete para daqui 5 segundos para fazer algo."
    {{ "titulo": "fazer algo", "hora": null, "data": null, "recorrencia": null, "segundos_relativos": 5.0 }}

    "Me lembre em 30 minutos de tirar o bolo do forno."
    {{ "titulo": "tirar o bolo do forno", "hora": null, "data": null, "recorrencia": null, "segundos_relativos": 1800.0 }}

    "Lembre-me de pagar a conta dia 25."
    {{ "titulo": "pagar a conta", "hora": null, "data": "{momento_atual.year}-{momento_atual.month}-25", "recorrencia": null, "segundos_relativos": null }}

    "Lembrete para agora: reunião."
    {{ "titulo": "reunião", "hora": "{momento_atual.strftime('%H:%M')}", "data": "{momento_atual.strftime('%Y-%m-%d')}", "recorrencia": null, "segundos_relativos": 0.0 }}

    Pedido: "{texto_usuario}"
    """

    try:
        # Usa o modelo Gemini para gerar a resposta
        sessao_chat = modelo_gemini_instancia.start_chat()
        resposta = await sessao_chat.send_message_async(prompt_ia)

        # Tenta parsear a resposta como JSON
        texto_resposta = resposta.text.strip()
        # Remove blocos de código markdown se existirem (```json...```)
        if texto_resposta.startswith("```json") and texto_resposta.endswith("```"):
            texto_resposta = texto_resposta[7:-3].strip()

        detalhes = json.loads(texto_resposta)
        return detalhes
    except json.JSONDecodeError as e:
        logger.error(
            f"Erro ao decodificar JSON da Gemini API: {e}. Resposta: {resposta.text if 'resposta' in locals() else 'N/A'}",
            exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Erro ao interagir com a Gemini API para extrair lembrete: {e}", exc_info=True)
        return None

1# Handler para lidar com mensagens que não foram capturadas por outros handlers (conversa geral)
async def lidar_com_mensagens_texto_geral(update: Update, context: ContextTypes.DEFAULT_TYPE, ) -> None:
    """
    Lida com mensagens de texto que não são comandos.
    Tenta extrair um lembrete usando a IA; se não conseguir, responde como IA de chat geral.
    """
    id_chat = update.effective_message.chat_id
    mensagem_usuario = update.effective_message.text  # Volta a pegar o texto diretamente

    # Pré-processa a mensagem substituindo números por extenso
    mensagem_usuario_processada = substituir_numeros_por_extenso(mensagem_usuario)

    await update.effective_message.reply_text("Processando sua solicitação com a IA...")

    detalhes_lembrete = await extrair_detalhes_lembrete_com_gemini(mensagem_usuario_processada)

    if detalhes_lembrete and (detalhes_lembrete.get("segundos_relativos") is not None or
                              detalhes_lembrete.get("hora") is not None or
                              detalhes_lembrete.get("data") is not None or
                              detalhes_lembrete.get("recorrencia") is not None):

        titulo = detalhes_lembrete.get("titulo")
        hora_str = detalhes_lembrete.get("hora")
        data_str = detalhes_lembrete.get("data")
        recorrencia = detalhes_lembrete.get("recorrencia")
        segundos_relativos = detalhes_lembrete.get("segundos_relativos")

        momento_agendamento = None

        # --- (Início da lógica de cálculo de data/hora - SEM MUDANÇAS) ---
        if segundos_relativos is not None:
            try:
                momento_agendamento = datetime.now(timezone.utc) + timedelta(seconds=float(segundos_relativos))
            except ValueError:
                await update.effective_message.reply_text(
                    "Tempo relativo inválido. Por favor, use um número para segundos/minutos/horas.")
                return
        elif hora_str and data_str:
            try:
                # 1. Cria o datetime "naive" (sem fuso) a partir do que a IA extraiu
                momento_local_naive = datetime.strptime(f"{data_str} {hora_str}", "%Y-%m-%d %H:%M")
                # 2. Localiza esse datetime no fuso de Brasília (torna "aware")
                momento_local_aware = FUSO_HORARIO_LOCAL.localize(momento_local_naive)
                # 3. Converte o momento de Brasília para UTC (para o JobQueue)
                momento_agendamento = momento_local_aware.astimezone(timezone.utc)
            except ValueError:
                await update.effective_message.reply_text(
                    "Formato de data ou hora inválido. Tente AAAA-MM-DD HH:MM.")
                return
        elif hora_str:
            try:
                hora_parseada = datetime.strptime(hora_str, "%H:%M").time()
                # Pega o "hoje" no fuso de Brasília
                hoje_local = datetime.now(FUSO_HORARIO_LOCAL).date()
                # Combina a data de hoje (Brasília) com a hora (Brasília)
                momento_local_naive = datetime.combine(hoje_local, hora_parseada)
                # Localiza no fuso de Brasília
                momento_local_aware = FUSO_HORARIO_LOCAL.localize(momento_local_naive)
                # Converte para UTC
                momento_agendamento = momento_local_aware.astimezone(timezone.utc)

                # Se a hora já passou HOJE (comparando em UTC), agenda para amanhã
                if momento_agendamento < datetime.now(timezone.utc):
                    momento_agendamento += timedelta(days=1)
            except ValueError:
                await update.effective_message.reply_text("Formato de hora inválido. Tente HH:MM.")
                return
        elif data_str:
            try:
                # Assume 00:00 daquele dia no fuso local
                data_local_naive = datetime.strptime(data_str, "%Y-%m-%d")
                momento_local_aware = FUSO_HORARIO_LOCAL.localize(data_local_naive)
                momento_agendamento = momento_local_aware.astimezone(timezone.utc)
            except ValueError:
                await update.effective_message.reply_text("Formato de data inválido. Tente AAAA-MM-DD.")
                return

        if momento_agendamento and momento_agendamento < datetime.now(timezone.utc):
            await update.effective_message.reply_text(
                "Não consigo agendar lembretes no passado. Por favor, forneça uma data/hora futura.")
            return
        # --- (Fim da lógica de cálculo de data/hora) ---

        if not titulo:
            titulo = "Lembrete Geral"

        intervalo = intervalo_recorrencia_em_segundos(recorrencia)

        # --- (Início da lógica de persistência e agendamento - MUDANÇA CRÍTICA) ---

        # 1. REMOVER TAREFAS ANTIGAS (OPCIONAL, mas recomendado se você não quiser múltiplos lembretes)
        # Se você quiser que o usuário possa agendar VÁRIOS lembretes, remova esta linha.
        # Se quiser que um novo lembrete apague o antigo (para o mesmo chat_id), mantenha:
        remover_tarefas_antigas(str(id_chat), context)  # Vamos criar essa função

        if intervalo or momento_agendamento:

            # Determina a primeira execução
            if intervalo:
                primeira_execucao = momento_agendamento if momento_agendamento else datetime.now(
                    timezone.utc) + timedelta(seconds=intervalo)
            else:
                primeira_execucao = momento_agendamento

            # 2. SALVAR NO BANCO DE DADOS
            sessao = SessionLocal()
            try:
                novo_lembrete = Lembrete(
                    chat_id=id_chat,
                    titulo=titulo,
                    proxima_execucao=primeira_execucao,
                    intervalo_segundos=intervalo,
                    recorrencia_str=recorrencia
                )
                sessao.add(novo_lembrete)
                sessao.commit()
                id_db = novo_lembrete.id  # Pega o ID que o banco gerou
                logger.info(f"Lembrete salvo no DB com ID: {id_db}")
            except Exception as e:
                logger.error(f"Erro ao salvar lembrete no DB: {e}", exc_info=True)
                sessao.rollback()
                await update.effective_message.reply_text("Erro ao salvar o lembrete no banco de dados.")
                return
            finally:
                sessao.close()

            # 3. AGENDAR NO JOBQUEUE
            # Usamos o ID do banco como o 'name' do job, para ligar os dois
            context.job_queue.run_once(
                disparar_alarme,
                when=primeira_execucao,
                chat_id=id_chat,
                name=str(id_db),  # MUITO IMPORTANTE: usar o ID do DB
                data={"titulo": titulo, "id_db": id_db}  # Passa o ID do DB e o título
            )

            # 4. RESPONDER AO USUÁRIO
            fuso_horario_local_offset = timedelta(hours=-3)  # Fuso de SP
            momento_agendamento_local = (primeira_execucao + fuso_horario_local_offset)

            texto_resposta = ""
            if intervalo:
                texto_resposta = f"Lembrete '{titulo}' agendado para repetir a cada {recorrencia}."
                texto_resposta += f" A primeira execução será em {momento_agendamento_local.strftime('%Y-%m-%d %H:%M')}!"
            else:
                texto_resposta = f"Lembrete '{titulo}' agendado para {momento_agendamento_local.strftime('%Y-%m-%d %H:%M')}!"

            await update.effective_message.reply_text(texto_resposta)

        else:
            await update.effective_message.reply_text(
                "Desculpe, a IA entendeu sua intenção de lembrete, mas não conseguiu determinar um tempo ou data específicos para agendar."
            )
        # --- (Fim da lógica de persistência) ---

    else:
        # Se não é um lembrete, responde como IA de chat geral
        resposta_ai = await obter_resposta_gemini(mensagem_usuario)
        await update.effective_message.reply_text(resposta_ai)

async def disparar_alarme(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Disparo do alarme. Agora ele interage com o banco de dados."""
    tarefa = context.job
    id_db = tarefa.name  # Pegamos o ID do banco de dados que salvamos como 'name'
    titulo = tarefa.data.get("titulo", "Lembrete")

    await context.bot.send_message(tarefa.chat_id, text=f"Opa! Lembrete: {titulo}")

    sessao = SessionLocal()
    try:
        # Busca o lembrete no banco de dados
        lembrete_db = sessao.query(Lembrete).filter(Lembrete.id == int(id_db)).first()

        if not lembrete_db:
            logger.warning(f"Lembrete ID {id_db} disparado mas não encontrado no DB.")
            return

        # SE FOR RECORRENTE:
        if lembrete_db.intervalo_segundos and lembrete_db.intervalo_segundos > 0:
            # Calcula a próxima execução
            nova_proxima_execucao = lembrete_db.proxima_execucao + timedelta(seconds=lembrete_db.intervalo_segundos)

            # Atualiza o banco
            lembrete_db.proxima_execucao = nova_proxima_execucao
            sessao.commit()

            # Re-agenda o próximo 'run_once'
            context.job_queue.run_once(
                disparar_alarme,
                when=nova_proxima_execucao,
                chat_id=tarefa.chat_id,
                name=str(id_db),  # Mantém o mesmo ID do DB
                data={"titulo": titulo, "id_db": id_db}
            )
            logger.info(f"Lembrete recorrente ID {id_db} re-agendado para {nova_proxima_execucao}.")

        # SE FOR ÚNICO:
        else:
            # Deleta o lembrete do banco, pois já foi disparado
            sessao.delete(lembrete_db)
            sessao.commit()
            logger.info(f"Lembrete único ID {id_db} disparado e removido do DB.")

    except Exception as e:
        logger.error(f"Erro ao processar disparo de alarme no DB para ID {id_db}: {e}", exc_info=True)
        sessao.rollback()
    finally:
        sessao.close()

# Se for usar a remoção de tarefas antigas, adicione esta função:
def remover_tarefas_antigas(nome: str, context: ContextTypes.DEFAULT_TYPE):
    """Remove jobs antigos do JobQueue com o mesmo nome (chat_id)"""
    tarefas_atuais = context.job_queue.get_jobs_by_name(nome)
    if not tarefas_atuais:
        return
    logger.info(f"Removendo {len(tarefas_atuais)} tarefas antigas para o chat {nome}")
    for tarefa in tarefas_atuais:
        tarefa.schedule_removal()

# --- Função Principal para Iniciar o Bot ---
async def post_init(app: Application) -> None:
    """Função chamada após a inicialização do bot para re-agendar jobs do DB."""

    # Esta linha não é necessária se você usar Application.builder().job_queue(True)
    # app.job_queue.set_application(app)
    # await app.job_queue.start() # Também não é necessário, o builder já cuida disso

    logger.info("Bot iniciado. Verificando lembretes pendentes no banco de dados...")

    sessao = SessionLocal()
    try:
        # Busca todos os lembretes que ainda não foram disparados e estão no futuro
        agora_utc = datetime.now(timezone.utc)
        lembretes_pendentes = sessao.query(Lembrete).filter(Lembrete.proxima_execucao > agora_utc).all()

        if not lembretes_pendentes:
            logger.info("Nenhum lembrete pendente encontrado.")
            return

        logger.info(f"Re-agendando {len(lembretes_pendentes)} lembretes pendentes...")

        for lembrete in lembretes_pendentes:
            app.job_queue.run_once(
                disparar_alarme,
                when=lembrete.proxima_execucao,  # O horário já está em UTC
                chat_id=lembrete.chat_id,
                name=str(lembrete.id),  # O ID do DB
                data={"titulo": lembrete.titulo, "id_db": lembrete.id}
            )

    except Exception as e:
        logger.error(f"Erro ao re-agendar lembretes do DB: {e}", exc_info=True)
    finally:
        sessao.close()

    logger.info("Re-agendamento de lembretes concluído.")

def main():
    """Inicia o bot."""

    # Cria a Aplicação e passa o token do seu bot
    # O post_init(post_init) já é suficiente para o builder entender que precisa do JobQueue
    application = Application.builder().token(TELEGRAM_TOKEN).post_init(post_init).build()

    # --- (Handlers) ---
    application.add_handler(MessageHandler(filters.VOICE, lidar_com_audio_rejeitado))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, lidar_com_mensagens_texto_geral))
    application.add_error_handler(lidar_erros)

    # Inicia o bot (polling)
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()