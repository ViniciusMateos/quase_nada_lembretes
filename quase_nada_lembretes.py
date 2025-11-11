import asyncio
import os
import asyncio
from number_parser import parse_ordinal, parse_number
from dotenv import load_dotenv
import logging
from telegram import Update
from pytz import timezone as pytz_timezone  # Mais confiável para fusos horários
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, JobQueue, \
    ApplicationBuilder
import re
import google.generativeai as genai
# --- MUDANÇA: Importa os dois tipos de erro 429 ---
from google.api_core.exceptions import ResourceExhausted, TooManyRequests
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
    intervalo_segundos = Column(Integer, nullable=True)  # 0 para único, > 0 para recorrente
    recorrencia_str = Column(String, nullable=True)  # Para exibir (ex: "diário")


# Cria a tabela se ela não existir
Base.metadata.create_all(engine)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

genai.configure(api_key=GEMINI_API_KEY)

# --- NOVO: Configuração de Modelos Gemini e Fallback ---
MODELOS_DISPONIVEIS = [
    "models/gemini-flash-lite-latest",
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.0-flash-lite-001",
    "models/gemini-2.5-flash-lite-preview-09-2025",
    "models/gemini-2.5-flash-lite-preview-06-17",
    "models/gemini-2.0-flash-lite-preview-02-05",
    "models/gemini-2.0-flash-lite-preview",
    "gemini-2.0-flash-lite"

    # --- FALLBACKS "FLASH" (MÉDIOS) ---
    # Se todos os "Lite" falharem, ele passa para os Flash normais:

    "models/gemini-flash-latest",  # 8ª TENTATIVA: O "latest" do Flash normal
    "models/gemini-2.5-flash",  # 9ª TENTATIVA: O 2.5 Flash estável
    "models/gemini-2.0-flash",  # 10ª TENTATIVA: O 2.0 Flash estável
    "models/gemini-2.0-flash-001",
    "models/gemini-2.5-flash-preview-09-2025",  # Previews do Flash
    "models/gemini-2.5-flash-preview-05-20",
    "models/gemini-2.0-flash-exp",

    # --- FALLBACKS "PRO" (MAIS PESADOS / EMERGÊNCIA) ---
    # Se TUDO acima falhar, ele tenta os modelos "Pro" como último recurso:

    "models/gemini-pro-latest",  # 15ª TENTATIVA: O "latest" Pro
    "models/gemini-2.5-pro",  # 16ª TENTATIVA: O 2.5 Pro estável
    "models/gemini-2.5-pro-preview-06-05",  # Previews do Pro
    "models/gemini-2.5-pro-preview-05-06",
    "models/gemini-2.5-pro-preview-03-25",
    "models/gemini-2.0-pro-exp",
    "models/gemini-2.0-pro-exp-02-05"
]

INDICE_MODELO_ATUAL = 0
modelo_gemini_instancia = None  # Inicializa a instância como None por padrão

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        # --- MUDANÇA: Carrega o primeiro modelo da lista ---
        modelo_nome_inicial = MODELOS_DISPONIVEIS[INDICE_MODELO_ATUAL]
        modelo_gemini_instancia = genai.GenerativeModel(modelo_nome_inicial)
        logger.info(f"Modelo Gemini inicial '{modelo_nome_inicial}' carregado.")
    except Exception as e:
        logger.error(f"ERRO AO INICIALIZAR MODELO GEMINI INICIAL: {e}", exc_info=True)
        # Se houver erro, modelo_gemini_instancia permanece None, e será tratado nas funções
else:
    logger.warning("GEMINI_API_KEY não encontrada no arquivo .env. Funcionalidades da IA desativadas.")


# --- Funções do Bot ---

# --- NOVA FUNÇÃO: Lógica de Troca de Modelo ---
def tentar_trocar_modelo_gemini() -> bool:
    """
    Tenta mudar para o próximo modelo Gemini da lista quando o atual se esgota (ResourceExhausted).
    Usa variáveis globais para rastrear o estado.
    Retorna True se a troca foi bem-sucedida, False se não há mais modelos.
    """
    global modelo_gemini_instancia, INDICE_MODELO_ATUAL, MODELOS_DISPONIVEIS

    modelo_antigo = MODELOS_DISPONIVEIS[INDICE_MODELO_ATUAL]
    logger.warning(f"Recurso esgotado (ResourceExhausted) detectado para o modelo: {modelo_antigo}")

    INDICE_MODELO_ATUAL += 1  # Tenta o próximo modelo

    if INDICE_MODELO_ATUAL >= len(MODELOS_DISPONIVEIS):
        logger.error("TODOS OS MODELOS GEMINI (QUOTAS) ESTÃO ESGOTADOS. Desativando IA.")
        modelo_gemini_instancia = None  # Desativa a IA
        return False  # Falhou, não há mais modelos

    # Tenta carregar o próximo modelo
    try:
        novo_modelo_nome = MODELOS_DISPONIVEIS[INDICE_MODELO_ATUAL]
        modelo_gemini_instancia = genai.GenerativeModel(novo_modelo_nome)
        logger.warning(f"SUCESSO NA TROCA DE QUOTA: Modelo '{novo_modelo_nome}' está agora ativo.")
        return True  # Sucesso na troca
    except Exception as e:
        logger.error(f"Falha ao tentar ativar o modelo de fallback '{novo_modelo_nome}': {e}", exc_info=True)
        # Chama recursivamente para tentar o PRÓXIMO da lista
        return tentar_trocar_modelo_gemini()


# --- FIM DA NOVA FUNÇÃO ---


async def lidar_com_audio_rejeitado(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Informa ao usuário que mensagens de áudio não são mais aceitas."""

    # Vamos usar HTML para colocar a primeira linha em negrito
    texto_html = (
        "🔴​<b>AVISO</b>\n\n"
        "Só consigo processar lembretes por mensagem de <B>TEXTO</b>.\n"
        "Por favor, <b>DIGITE</b> o que você precisa."
    )

    # Usamos reply_html para que o Telegram entenda a tag <b>
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
    if not modelo_gemini_instancia:
        return "Desculpe, a IA para conversa geral não está configurada ou todos os modelos se esgotaram."
    try:
        sessao_chat = modelo_gemini_instancia.start_chat(history=[])
        resposta = await sessao_chat.send_message_async(prompt)
        return resposta.text

    # --- INÍCIO DA TRATATIVA CORRIGIDA ---
    # PRIMEIRO O MAIS ESPECÍFICO (QUOTA)
    except ResourceExhausted as e:
        logger.error(f"Erro 429 (ResourceExhausted) em obter_resposta_gemini: {e}", exc_info=True)
        # Este é o ESGOTAMENTO DE QUOTA. Precisa trocar o modelo.

        if tentar_trocar_modelo_gemini():
            # Se a troca deu certo, avisa o usuário para tentar de novo
            return (
                "🚫​ <b>Quota da IA Esgotada (Erro 429)</b> 🚫\n\n"
                "O modelo de IA que estávamos usando atingiu sua quota (ResourceExhausted).\n"
                "Eu <b>troquei para um modelo de fallback</b>.\n\n"
                "Por favor, <b>envie sua mensagem novamente</b>."
            )
        else:
            # Se a troca falhou (todos esgotados)
            return (
                "🚫​ <b>TODAS AS QUOTAS ESGOTADAS (Erro 429)</b> 🚫\n\n"
                "Todos os modelos de IA disponíveis atingiram suas quotas.\n"
                "A funcionalidade de IA está temporariamente desativada.\n"
                "Por favor, tente novamente mais tarde."
            )

    # DEPOIS O MAIS GERAL (LIMITE DE TAXA)
    except TooManyRequests as e:
        logger.warning(f"Erro 429 (TooManyRequests) ao obter resposta geral: {e}", exc_info=True)
        # Este é o LIMITE DE TAXA (ex: 15 RPM). Só precisa esperar.
        return (
            "🚫​ <b>Limite de Taxa Atingido (Erro 429)</b> 🚫\n\n"
            "Muitas solicitações foram feitas muito rápido (TooManyRequests).\n"
            "Por favor, <b>aguarde cerca de 1 minuto</b> antes de tentar novamente."
        )
    # --- FIM DA TRATATIVA CORRIGIDA ---

    except Exception as e:
        logger.error(f"Erro ao interagir com a Gemini API em obter_resposta_gemini: {e}", exc_info=True)
        return "Desculpe, não consegui processar sua solicitação de conversa no momento."


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
    Usa a Gemini API para classificar a intenção e extrair detalhes de um lembrete.
    Retorna um dicionário JSON com "intencao" e "dados".
    """
    if not modelo_gemini_instancia:
        logger.warning("Modelo Gemini não configurado. Não é possível extrair detalhes.")
        return None

    momento_atual = datetime.now(timezone.utc)
    # ... (O prompt_ia gigante continua o mesmo, não precisa copiar daqui)
    prompt_ia = f"""
            Analise o pedido do usuário em português.
            Primeiro, classifique a "intencao" como "CRIAR_LEMBRETE", "LISTAR_LEMBRETES" ou "CHAT_GERAL".

            Formate a saída como um objeto JSON com "intencao" e "dados".

            Campos esperados:
            - "intencao": (string) "CRIAR_LEMBRETE", "LISTAR_LEMBRETES", ou "CHAT_GERAL".
            - "dados": (object) Detalhes para CRIAR, ou null para as outras intenções.

            Regras para "CRIAR_LEMBRETE":
            1.  **Formato de Hora:** A "hora" DEVE ser estritamente no formato HH:MM (24 horas).
            2.  **Ambiguidade AM/PM:** Se o usuário disser "às 2" ou "2h", assuma "02:00" (manhã). Se o usuário disser "2 da tarde" ou "14h", use "14:00".
            3.  **Título:** A ação ou o que deve ser lembrado.
            4.  **Data:** A data no formato AAAA-MM-DD. Se for "hoje", use {momento_atual.strftime('%Y-%m-%d')}. Se for "amanhã", use {(momento_atual + timedelta(days=1)).strftime('%Y-%m-%d')}.
            5.  **Recorrência:** Ex: "diário", "semanal", "toda terça".
            6.  **Segundos Relativos:** Se for "daqui X segundos/minutos/horas", o tempo em segundos.

            ---
            Exemplos:

            Pedido: "Me lembra de algo 2h21"
            {{ 
              "intencao": "CRIAR_LEMBRETE", 
              "dados": {{
                "titulo": "algo", 
                "hora": "02:21", 
                "data": null, 
                "recorrencia": null, 
                "segundos_relativos": null
              }}
            }}

            Pedido: "Me lembra de algo às 2 da tarde"
            {{ 
              "intencao": "CRIAR_LEMBRETE", 
              "dados": {{
                "titulo": "algo", 
                "hora": "14:00", 
                "data": null, 
                "recorrencia": null, 
                "segundos_relativos": null
              }}
            }}

            Pedido: "Me lembra de comprar pão amanhã às 7 da manhã."
            {{ 
              "intencao": "CRIAR_LEMBRETE", 
              "dados": {{
                "titulo": "comprar pão", 
                "hora": "07:00", 
                "data": "{(momento_atual + timedelta(days=1)).strftime('%Y-%m-%d')}", 
                "recorrencia": null, 
                "segundos_relativos": null
              }} 
            }}

            Pedido: "Me lista os lembretes pendentes"
            {{ 
              "intencao": "LISTAR_LEMBRETES", 
              "dados": null 
            }}

            Pedido: "oi tudo bem?"
            {{ 
              "intencao": "CHAT_GERAL", 
              "dados": null 
            }}

            Pedido: "Me lembra em 30 minutos de tirar o bolo do forno."
            {{ 
              "intencao": "CRIAR_LEMBRETE", 
              "dados": {{
                "titulo": "tirar o bolo do forno", 
                "hora": null, 
                "data": null, 
                "recorrencia": null, 
                "segundos_relativos": 1800.0
              }} 
            }}
            ---

            Pedido: "{texto_usuario}"
            """
    # ... (Fim do prompt_ia)
    try:
        sessao_chat = modelo_gemini_instancia.start_chat(history=[])
        resposta = await sessao_chat.send_message_async(prompt_ia)

        texto_resposta = resposta.text.strip()
        if texto_resposta.startswith("```json") and texto_resposta.endswith("```"):
            texto_resposta = texto_resposta[7:-3].strip()

        logger.info(f"Resposta bruta da IA para extração/classificação: {texto_resposta}")

        detalhes = json.loads(texto_resposta)
        return detalhes

    # --- INÍCIO DA TRATATIVA CORRIGIDA ---
    # PRIMEIRO O MAIS ESPECÍFICO (QUOTA)
    except ResourceExhausted as e:
        logger.error(f"Erro 429 (ResourceExhausted) ao extrair lembrete: {e}", exc_info=True)
        # Esgotamento de quota. Tenta trocar.

        if tentar_trocar_modelo_gemini():
            # Se a troca deu certo, retorna um erro especial
            return {"intencao": "ERRO_429_TROCA_MODELO"}
        else:
            # Se todos falharam, retorna o erro de quota esgotada
            return {"intencao": "ERRO_429_QUOTA_ESGOTADA"}

    # DEPOIS O MAIS GERAL (LIMITE DE TAXA)
    except TooManyRequests as e:
        logger.warning(f"Erro 429 (TooManyRequests) ao extrair lembrete: {e}", exc_info=True)
        # Limite de taxa (RPM). O handler vai tratar como "ERRO_429_RATE_LIMIT"
        return {"intencao": "ERRO_429_RATE_LIMIT"}
    # --- FIM DA TRATATIVA CORRIGIDA ---

    except json.JSONDecodeError as e:
        logger.error(
            f"Erro ao decodificar JSON da Gemini API: {e}. Resposta: {resposta.text if 'resposta' in locals() else 'N/A'}",
            exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Erro ao interagir com a Gemini API para extrair lembrete: {e}", exc_info=True)
        return None


# Handler para lidar com mensagens que não foram capturadas por outros handlers (conversa geral)
async def lidar_com_mensagens_texto_geral(update: Update, context: ContextTypes.DEFAULT_TYPE,
                                          texto_transcrito: str = None) -> None:
    """
    Lida com mensagens de texto/áudio.
    Chama a IA para classificar a intenção (CRIAR, LISTAR, CHAT) e age de acordo.
    """
    id_chat = update.effective_message.chat_id
    mensagem_usuario = texto_transcrito if texto_transcrito else update.effective_message.text
    mensagem_usuario_processada = substituir_numeros_por_extenso(mensagem_usuario)

    if not modelo_gemini_instancia:
        await update.effective_message.reply_text(
            "Desculpe, a funcionalidade de IA está desativada (nenhum modelo carregado ou todos esgotados).")
        return

    await update.effective_message.reply_text("Processando sua solicitação com a IA...")

    # 1. IA CLASSIFICA A INTENÇÃO
    resposta_ia = await extrair_detalhes_lembrete_com_gemini(mensagem_usuario_processada)

    if not resposta_ia:
        await update.effective_message.reply_text("Desculpe, a IA não conseguiu processar sua solicitação.")
        return

    intencao = resposta_ia.get("intencao")
    detalhes_lembrete = resposta_ia.get("dados")  # 'dados' agora contém o JSON do lembrete (ou null)

    # --- 2. ROTEAMENTO BASEADO NA INTENÇÃO (MUDANÇA AQUI) ---

    # === TRATATIVA DO ERRO 429 (TROCA DE MODELO BEM-SUCEDIDA) ===
    if intencao == "ERRO_429_TROCA_MODELO":
        mensagem_erro = (
            "🚫​ <b>Quota da IA Esgotada (Erro 429)</b> 🚫\n\n"
            "O modelo de IA que processa lembretes atingiu sua quota (ResourceExhausted).\n"
            "Eu <b>troquei para um modelo de fallback</b>.\n\n"
            "Por favor, <b>envie sua mensagem novamente</b>."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return  # Termina aqui

    # === TRATATIVA DO ERRO 429 (LIMITE DE TAXA / RPM) ===
    elif intencao == "ERRO_429_RATE_LIMIT":
        mensagem_erro = (
            "🚫​ <b>Limite de Taxa Atingido (Erro 429)</b> 🚫\n\n"
            "Muitas solicitações foram feitas muito rápido (TooManyRequests).\n"
            "Por favor, <b>aguarde cerca de 1 minuto</b> antes de tentar novamente."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return  # Termina aqui

    # === TRATATIVA DO ERRO 429 (TODAS AS QUOTAS ESGOTADAS) ===
    elif intencao == "ERRO_429_QUOTA_ESGOTADA" or intencao == "ERRO_429":  # Pega o antigo e o novo
        mensagem_erro = (
            "🚫​ <b>TODAS AS QUOTAS ESGOTADAS (Erro 429)</b> 🚫\n\n"
            "Todos os modelos de IA disponíveis atingiram suas quotas.\n"
            "A funcionalidade de IA está temporariamente desativada.\n"
            "Por favor, tente novamente mais tarde."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return  # Termina aqui

    # === INTENÇÃO: LISTAR LEMBRETES ===
    if intencao == "LISTAR_LEMBRETES":
        await listar_lembretes_pendentes(update, context)
        return  # Termina aqui

    # === INTENÇÃO: CRIAR LEMBRETE ===
    elif intencao == "CRIAR_LEMBRETE" and detalhes_lembrete:

        titulo = detalhes_lembrete.get("titulo").upper()
        hora_str = detalhes_lembrete.get("hora")
        data_str = detalhes_lembrete.get("data")
        recorrencia = detalhes_lembrete.get("recorrencia")
        segundos_relativos = detalhes_lembrete.get("segundos_relativos")

        # Verifica se a IA realmente extraiu alguma informação de tempo
        if not (segundos_relativos is not None or hora_str or data_str or recorrencia):
            # Se a IA achou que era CRIAR, mas não achou data/hora, cai no CHAT GERAL
            pass  # Deixa cair para o CHAT_GERAL no final
        else:
            # --- Início da Lógica de Agendamento (copiada de antes) ---
            momento_agendamento = None

            if segundos_relativos is not None:
                try:
                    momento_agendamento = datetime.now(timezone.utc) + timedelta(seconds=float(segundos_relativos))
                except ValueError:
                    await update.effective_message.reply_text("Tempo relativo inválido. Por favor, use um número.")
                    return
            elif hora_str and data_str:
                try:
                    momento_local_naive = datetime.strptime(f"{data_str} {hora_str}", "%Y-%m-%d %H:%M")
                    momento_local_aware = FUSO_HORARIO_LOCAL.localize(momento_local_naive)
                    momento_agendamento = momento_local_aware.astimezone(timezone.utc)
                except ValueError:
                    await update.effective_message.reply_text(
                        "Formato de data ou hora inválido. Tente AAAA-MM-DD HH:MM.")
                    return
            elif hora_str:
                try:
                    hora_parseada = datetime.strptime(hora_str, "%H:%M").time()
                    hoje_local = datetime.now(FUSO_HORARIO_LOCAL).date()
                    momento_local_naive = datetime.combine(hoje_local, hora_parseada)
                    momento_local_aware = FUSO_HORARIO_LOCAL.localize(momento_local_naive)
                    momento_agendamento = momento_local_aware.astimezone(timezone.utc)
                    if momento_agendamento < datetime.now(timezone.utc):
                        momento_agendamento += timedelta(days=1)
                except ValueError:
                    await update.effective_message.reply_text("Formato de hora inválido. Tente HH:MM.")
                    return
            elif data_str:
                try:
                    data_local_naive = datetime.strptime(data_str, "%Y-%m-%d")
                    momento_local_aware = FUSO_HORARIO_LOCAL.localize(data_local_naive)
                    momento_agendamento = momento_local_aware.astimezone(timezone.utc)
                except ValueError:
                    await update.effective_message.reply_text("Formato de data inválido. Tente AAAA-MM-DD.")
                    return

            if momento_agendamento and momento_agendamento < datetime.now(timezone.utc):
                await update.effective_message.reply_text("Não consigo agendar lembretes no passado.")
                return

            if not titulo:
                titulo = "Lembrete Geral"

            intervalo = intervalo_recorrencia_em_segundos(recorrencia)
            tarefa_removida = remover_tarefas_antigas(str(id_chat), context)

            if intervalo or momento_agendamento:
                if intervalo:
                    primeira_execucao_utc = momento_agendamento if momento_agendamento else datetime.now(
                        timezone.utc) + timedelta(seconds=intervalo)
                else:
                    primeira_execucao_utc = momento_agendamento

                # SALVAR NO BANCO DE DADOS
                sessao = SessionLocal()
                try:
                    novo_lembrete = Lembrete(
                        chat_id=id_chat,
                        titulo=titulo,
                        proxima_execucao=primeira_execucao_utc,
                        intervalo_segundos=intervalo,
                        recorrencia_str=recorrencia
                    )
                    sessao.add(novo_lembrete)
                    sessao.commit()
                    id_db = novo_lembrete.id
                    logger.info(f"Lembrete salvo no DB com ID: {id_db}")
                except Exception as e:
                    logger.error(f"Erro ao salvar lembrete no DB: {e}", exc_info=True)
                    sessao.rollback()
                    await update.effective_message.reply_text("Erro ao salvar o lembrete no banco de dados.")
                    return
                finally:
                    sessao.close()

                # AGENDAR NO JOBQUEUE
                context.job_queue.run_once(
                    disparar_alarme,
                    when=primeira_execucao_utc,
                    chat_id=id_chat,
                    name=str(id_db),
                    data={"titulo": titulo, "id_db": id_db}
                )

                # RESPONDER AO USUÁRIO
                momento_agendamento_local = primeira_execucao_utc.astimezone(FUSO_HORARIO_LOCAL)
                data_formatada = momento_agendamento_local.strftime('%d/%m/%Y às %H:%M')
                texto_html = ""

                if intervalo:
                    texto_html = (
                        "<b>🟢​ LEMBRETE RECORRENTE</b>\n\n"
                        f"<b>\"{titulo}\"</b> agendado para <b>{data_formatada}</b>!"
                        f"\nRecorrência: <b>{recorrencia}</b>"
                    )
                else:
                    texto_html = (
                        "<b>🟢​ LEMBRETE</b>\n\n"
                        f"<b>\"{titulo}\"</b> agendado para <b>{data_formatada}</b>!"
                    )

                if tarefa_removida:
                    texto_html += "\n\n<i>(Lembrete anterior removido.)</i>"

                await update.effective_message.reply_html(texto_html)
                return  # Termina aqui

            else:
                # Se a IA achou que era CRIAR, mas não conseguiu data/hora/intervalo
                pass  # Deixa cair para o CHAT_GERAL

    # === INTENÇÃO: CHAT GERAL (ou se os outros falharem) ===
    # Se intencao == "CHAT_GERAL" ou se intencao == "CRIAR_LEMBRETE" mas falhou em extrair dados
    resposta_ai = await obter_resposta_gemini(mensagem_usuario)
    await update.effective_message.reply_text(resposta_ai)


async def disparar_alarme(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Disparo do alarme. Agora ele interage com o banco de dados."""
    tarefa = context.job
    id_db = tarefa.name  # Pegamos o ID do banco de dados que salvamos como 'name'
    titulo = tarefa.data.get("titulo", "Lembrete")

    # --- INÍCIO DA MUDANÇA (Enviar 3 vezes) ---

    # Define a mensagem (usando HTML para o negrito que você pediu)
    texto_lembrete_html = f"<b>🟠​ LEMBRETE</b>\n<b>\"{titulo}\"</b>"

    # Loop para enviar a mensagem 3 vezes
    for i in range(3):
        try:
            await context.bot.send_message(
                tarefa.chat_id,
                text=texto_lembrete_html,
                parse_mode="HTML"  # Necessário para o <b> funcionar
            )

            # Se não for a última mensagem, espera 2 segundos
            if i < 2:
                await asyncio.sleep(1)  # Espera 1 segundo (ajuste se precisar)

        except Exception as e:
            logger.error(f"Erro ao enviar lembrete (tentativa {i + 1}): {e}", exc_info=True)
            # Se falhar o envio, espera 1s e tenta o próximo
            await asyncio.sleep(1)

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


async def listar_lembretes_pendentes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Busca no DB e lista os lembretes pendentes para o usuário."""

    id_chat = update.effective_message.chat_id
    logger.info(f"Executando ação: Listar lembretes para o chat_id: {id_chat}")

    sessao = SessionLocal()
    try:
        agora_utc = datetime.now(timezone.utc)
        lembretes_pendentes = sessao.query(Lembrete).filter(
            Lembrete.chat_id == id_chat,
            Lembrete.proxima_execucao > agora_utc
        ).order_by(Lembrete.proxima_execucao.asc()).all()

        if not lembretes_pendentes:
            await update.effective_message.reply_text("Você não tem nenhum lembrete pendente agendado. 👍")
            return

        resposta_html = ["<b>🔵​ LEMBRETES PENDENTES:</b>\n"]

        for lembrete in lembretes_pendentes:
            momento_local = lembrete.proxima_execucao.astimezone(FUSO_HORARIO_LOCAL)
            data_formatada = momento_local.strftime('%d/%m/%Y às %H:%M')

            recorrencia_info = ""
            if lembrete.recorrencia_str:
                recorrencia_info = f" <i>(Recorrência: {lembrete.recorrencia_str})</i>"

            resposta_html.append(
                "\n----------------------"
                f"\n<b>\"{lembrete.titulo}\"</b>\n"
                f"  <b>Data:</b> {data_formatada}{recorrencia_info}\n"
                "----------------------"
            )

        await update.effective_message.reply_html("\n".join(resposta_html))

    except Exception as e:
        logger.error(f"Erro ao listar lembretes do DB para o chat_id {id_chat}: {e}", exc_info=True)
        await update.effective_message.reply_text("Ocorreu um erro ao tentar buscar seus lembretes.")
    finally:
        sessao.close()


# Se for usar a remoção de tarefas antigas, adicione esta função:
def remover_tarefas_antigas(nome: str, context: ContextTypes.DEFAULT_TYPE):
    """Remove jobs antigos do JobQueue com o mesmo nome (chat_id)"""
    tarefas_atuais = context.job_queue.get_jobs_by_name(nome)
    if not tarefas_atuais:
        return False  # MUDANÇA: Retorna False se não removeu
    logger.info(f"Removendo {len(tarefas_atuais)} tarefas antigas para o chat {nome}")
    for tarefa in tarefas_atuais:
        tarefa.schedule_removal()
    return True  # MUDANÇA: Retorna True se removeu


# --- Função Principal para Iniciar o Bot ---
async def post_init(app: Application) -> None:
    """Função chamada após a inicialização do bot para re-agendar jobs do DB."""

    logger.info("Bot iniciado. Verificando lembretes pendentes no banco de dados...")

    sessao = SessionLocal()
    try:
        # Busca todos os lembretes que ainda não foram disparados e estão no futuro
        agora_utc = datetime.now(timezone.utc)
        lembretes_pendentes = sessao.query(Lembrete).filter(Lembrete.proxima_execucao > agora_utc).all()

        if not lembretes_pendentes:
            logger.info("Nenhum lembrete pendente encontrado.")
            sessao.close()  # Fecha a sessão aqui
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
        # Garante que a sessão seja fechada mesmo se 'lembretes_pendentes' for nulo
        if sessao.is_active:
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
