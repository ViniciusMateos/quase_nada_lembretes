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
# import whisper
import json
import tempfile
from datetime import datetime, timedelta, timezone
from keep_alive import keep_alive
keep_alive()  # isso inicia o servidor web fake

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()




TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

# Configura o log para ver o que está acontecendo
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

try:
    # model_whisper = whisper.load_model("medium")
    logger.info("Modelo Whisper 'medium' carregado com sucesso.")
except Exception as e:
    model_whisper = None
    logger.error(f"ERRO AO CARREGAR MODELO WHISPER: {e}", exc_info=True)
    logger.warning("Funcionalidade de transcrição de áudio pode estar desativada.")

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



# Função que responde ao comando /start
async def start(update: Update, context):
    """Envia uma mensagem quando o comando /start é emitido."""
    user = update.effective_user
    await update.message.reply_html(
        f"Olá, {user.mention_html()}! Eu sou seu bot de lembretes. Como posso ajudar?",
)

# Função para processar mensagem de voz e transcrever
async def transcrever_voz(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if update.message.voice:
        voice = update.message.voice
        with tempfile.NamedTemporaryFile(suffix=".ogg") as temp_audio:
            voice_file = await voice.get_file()
            await voice_file.download_to_drive(custom_path=temp_audio.name)

            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, model_whisper.transcribe, temp_audio.name)
            texto_transcrito = result.get("text", "").strip()

            return texto_transcrito

# Handler para mensagem de voz que transcreve e repassa para a função de texto
async def lidar_com_mensagem_de_voz(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not update.message.voice:
        await update.message.reply_text("Por favor, envie uma mensagem de voz para transcrever.")
        return

    await update.message.reply_text("🔍 Transcrevendo áudio...")

    try:
        # Cria um arquivo temporário com um nome único e fecha-o imediatamente
        with tempfile.NamedTemporaryFile(suffix=".ogg", delete=False) as temp_audio:
            temp_path = temp_audio.name

        try:
            # Baixa o áudio para o arquivo
            voice_file = await update.message.voice.get_file()
            await voice_file.download_to_drive(custom_path=temp_path)

            # Transcreve usando Whisper
            loop = asyncio.get_event_loop()
            result = await loop.run_in_executor(None, model_whisper.transcribe, temp_path)
            texto_transcrito = result.get("text", "").strip()

            if not texto_transcrito:
                await update.message.reply_text("Não consegui transcrever o áudio. Pode tentar novamente?")
                return

            await update.message.reply_text(f"🎤 Transcrição: {texto_transcrito}")
            await lidar_com_mensagens_texto_geral(update, context, texto_transcrito=texto_transcrito)

        finally:
            # Garante que o arquivo temporário será removido
            try:
                os.unlink(temp_path)
            except:
                pass

    except Exception as e:
        logger.error(f"Erro ao transcrever áudio: {e}", exc_info=True)
        await update.message.reply_text("Ocorreu um erro ao processar o áudio. Tente novamente mais tarde.")
# Função para lidar com erros
async def lidar_erros(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    if update and hasattr(update, "effective_message") and update.effective_message:
        await update.effective_message.reply_text("Ocorreu um erro inesperado.")
        print("Erro fora de contexto de mensagem (provavelmente em um job):", context.error)
    else:
        print("Erro fora de contexto de mensagem (provavelmente em um job):", context.error)

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
    if not modelo_gemini:
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

# Handler para lidar com mensagens que não foram capturadas por outros handlers (conversa geral)
# --- Nova lógica para lidar com mensagens (substituindo agendar_lembrete como handler) ---
async def lidar_com_mensagens_texto_geral(update: Update, context: ContextTypes.DEFAULT_TYPE, texto_transcrito: str = None) -> None:
    """
    Lida com mensagens de texto que não são comandos.
    Tenta extrair um lembrete usando a IA; se não conseguir, responde como IA de chat geral.
    """
    id_chat = update.effective_message.chat_id
    mensagem_usuario = texto_transcrito if texto_transcrito else update.effective_message.text

    # Pré-processa a mensagem substituindo números por extenso
    mensagem_usuario_processada = substituir_numeros_por_extenso(mensagem_usuario)

    if not modelo_gemini_instancia:
        await update.effective_message.reply_text(
            "Desculpe, a funcionalidade de IA está desativada. "
            "Por favor, verifique a configuração da chave GEMINI_API_KEY."
        )
        return

    await update.effective_message.reply_text("Processando sua solicitação com a IA...")

    # Tenta extrair os detalhes do lembrete
    detalhes_lembrete = await extrair_detalhes_lembrete_com_gemini(mensagem_usuario_processada)

    # --- Lógica de Agendamento ---
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

        if segundos_relativos is not None:
            try:
                momento_agendamento = datetime.now(timezone.utc) + timedelta(seconds=float(segundos_relativos))
            except ValueError:
                await update.effective_message.reply_text(
                    "Tempo relativo inválido. Por favor, use um número para segundos/minutos/horas.")
                return
        elif hora_str and data_str:
            try:
                tz_brasilia = pytz_timezone('America/Sao_Paulo')
                momento_local = datetime.strptime(f"{data_str} {hora_str}", "%Y-%m-%d %H:%M")
                momento_local = tz_brasilia.localize(momento_local)
                momento_agendamento = momento_local.astimezone(timezone.utc)
            except ValueError:
                await update.effective_message.reply_text("Formato de data ou hora inválido. Tente AAAA-MM-DD HH:MM.")
                return
        elif hora_str:
            try:
                hora_parseada = datetime.strptime(hora_str, "%H:%M").time()
                hoje_utc = datetime.now(timezone.utc).date()
                tz_brasilia = pytz_timezone('America/Sao_Paulo')
                hoje_brasilia = datetime.now(tz_brasilia).date()
                momento_local = datetime.combine(hoje_brasilia, hora_parseada)
                momento_local = tz_brasilia.localize(momento_local)
                momento_agendamento = momento_local.astimezone(timezone.utc)

                # Corrige lembrete para o dia seguinte se horário já passou
                if momento_agendamento < datetime.now(timezone.utc):
                    momento_agendamento += timedelta(days=1)
            except ValueError:
                await update.effective_message.reply_text("Formato de hora inválido. Tente HH:MM.")
                return
        elif data_str:
            try:
                momento_agendamento = datetime.strptime(data_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
            except ValueError:
                await update.effective_message.reply_text("Formato de data inválido. Tente AAAA-MM-DD.")
                return

        # Validação final do agendamento
        if momento_agendamento and momento_agendamento < datetime.now(timezone.utc):
            await update.effective_message.reply_text(
                "Não consigo agendar lembretes no passado. Por favor, forneça uma data/hora futura.")
            return

        if not titulo:
            titulo = "Lembrete Geral"

        # --- Lógica de Recorrência ---
        intervalo = intervalo_recorrencia_em_segundos(recorrencia)

        # AQUI VOCÊ PODE DECIDIR SE QUER SEMPRE REMOVER O ANTERIOR OU SÓ SE FOR RECORRENTE
        # Por simplicidade, vamos sempre remover o anterior para o mesmo chat_id para evitar duplicação.

        if intervalo:
            # Agenda lembrete repetitivo
            # first: Se momento_agendamento existe e está no futuro, usa-o. Senão, usa o intervalo a partir de agora.
            first_run_delay = intervalo if not momento_agendamento else (
                        momento_agendamento - datetime.now(timezone.utc)).total_seconds()


            # Calcula o 'first' como um datetime UTC
            if momento_agendamento:
                primeira_execucao = momento_agendamento
            else:
                primeira_execucao = datetime.now(timezone.utc) + timedelta(seconds=intervalo)




            context.job_queue.run_repeating(
                disparar_alarme,
                interval=intervalo,  # Intervalo em segundos
                first=primeira_execucao,  # Primeira execução como datetime (UTC)
                chat_id=id_chat,
                name=str(id_chat),
                data=titulo
            )
            texto_resposta = f"Lembrete '{titulo}' agendado para repetir a cada {recorrencia}."
            if momento_agendamento:
                texto_resposta += f" A primeira execução será em {primeira_execucao.strftime('%Y-%m-%d %H:%M')}!"

            tz_brasilia = pytz_timezone('America/Sao_Paulo')
            momento_local = momento_agendamento.astimezone(tz_brasilia)
            await update.effective_message.reply_text(
                f"⏰ Lembrete '{titulo}' agendado para:\n"
                f"📅 {momento_local.strftime('%d/%m/%Y')}\n"
                f"🕒 {momento_local.strftime('%H:%M')} (horário de Brasília)\n"
                f"✅ Agendado com sucesso!"
            )

        elif momento_agendamento:
            # Agenda lembrete único
            context.job_queue.run_once(
                disparar_alarme,
                when=momento_agendamento,  # Primeira execução como datetime (UTC)
                chat_id=id_chat,
                name=str(id_chat),
                data=titulo
            )
            tz_brasilia = pytz_timezone('America/Sao_Paulo')
            momento_local = momento_agendamento.astimezone(tz_brasilia)
            await update.effective_message.reply_text(
                f"⏰ Lembrete '{titulo}' agendado para:\n"
                f"📅 {momento_local.strftime('%d/%m/%Y')}\n"
                f"🕒 {momento_local.strftime('%H:%M')} (horário de Brasília)\n"
                f"✅ Agendado com sucesso!"
            )
        else:
            # Se a IA extraiu detalhes mas não conseguiu determinar um momento, isso é um problema.
            # Deveria ser pego pelo catch-all de erro da IA de extração.
            # Se chegar aqui, significa que detalhes_lembrete não é None, mas não tem info de tempo.
            await update.effective_message.reply_text(
                "Desculpe, a IA entendeu sua intenção de lembrete, mas não conseguiu determinar um tempo ou data específicos para agendar. "
                "Por favor, seja mais explícito (ex: 'hoje às 10h', 'daqui 5 minutos', 'todo dia às 9h')."
            )

    else:  # Se detalhes_lembrete é None ou não contém informações de tempo/título
        # === CAIU AQUI: Responde como IA de chat geral ===
        resposta_ai = await obter_resposta_gemini(mensagem_usuario)
        await update.effective_message.reply_text(resposta_ai)

async def disparar_alarme(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Disparo do alarme"""
    job = context.job
    await context.bot.send_message(job.chat_id, text=f"Opa! Lembrete: {job.data}")

# --- Função Principal para Iniciar o Bot ---
async def post_init(app):
    app.job_queue.set_application(app)
    await app.job_queue.start()

def main():
    """Inicia o bot."""
    # Cria a Aplicação e passa o token do seu bot
    application = ApplicationBuilder().token(TELEGRAM_TOKEN).post_init(post_init).build()
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, lidar_com_mensagens_texto_geral))
    application.add_handler(MessageHandler(filters.VOICE, lidar_com_mensagem_de_voz))
    # Adiciona o Handler para erros
    application.add_error_handler(lidar_erros)

    # Inicia o bot (polling)
    application.run_polling(allowed_updates=Update.ALL_TYPES)

if __name__ == "__main__":
    main()
