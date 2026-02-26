import asyncio
import os
import logging
from telegram.ext import CallbackQueryHandler
from number_parser import parse_ordinal, parse_number
from dotenv import load_dotenv
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from pytz import timezone as pytz_timezone  # Mais confiável para fusos horários
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, JobQueue, \
    ApplicationBuilder
import re
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, TooManyRequests
import json
from datetime import datetime, timedelta, timezone
import sqlalchemy
from sqlalchemy import create_engine, Column, Integer, String, DateTime, Boolean, BigInteger
from sqlalchemy.orm import sessionmaker, declarative_base
from sqlalchemy.pool import NullPool

# REMOVIDO: from keep_alive import keep_alive
# REMOVIDO: keep_alive()

# Carrega as variáveis de ambiente do arquivo .env
load_dotenv()

FUSO_HORARIO_LOCAL = pytz_timezone('America/Sao_Paulo')

# Configura o log para ver o que está acontecendo
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# --- Configuração do Banco de Dados (ADAPTADO PARA PYTHONANYWHERE) ---
# Agora forçamos o uso do arquivo local lembretes.db para persistência
DATABASE_URL = "sqlite:///lembretes.db"

# O NullPool é importante para evitar problemas de travamento em arquivos SQLite locais em alguns cenários
engine = create_engine(DATABASE_URL, poolclass=NullPool)
Base = declarative_base()
SessionLocal = sessionmaker(bind=engine)


# --- Definição da Tabela de Lembretes ---
class Lembrete(Base):
    __tablename__ = "lembretes"
    id = Column(Integer, primary_key=True, autoincrement=True)
    chat_id = Column(BigInteger, nullable=False)
    titulo = Column(String, nullable=False)
    proxima_execucao = Column(DateTime(timezone=True), nullable=False)
    intervalo_segundos = Column(Integer, nullable=True)  # 0 para único, > 0 para recorrente
    recorrencia_str = Column(String, nullable=True)  # Para exibir (ex: "diário")
    data_fim = Column(DateTime(timezone=True), nullable=True)


# Cria a tabela se ela não existir (cria o arquivo lembretes.db na primeira execução)
Base.metadata.create_all(engine)

TELEGRAM_TOKEN = os.getenv("TELEGRAM_TOKEN")
GEMINI_API_KEY = os.getenv("GOOGLE_API_KEY")

# --- NOVO: Configuração de Modelos Gemini e Rotação ---
MODELOS_DISPONIVEIS = [
    # --- NIVEL 1: O QUE FUNCIONOU (PRIORIDADE MÁXIMA) ---
    "models/gemini-2.5-flash-lite",  # Esse foi o que rodou no seu log!

    # --- NIVEL 2: OUTROS DA FAMÍLIA 2.5 (Geralmente estáveis) ---
    "models/gemini-2.5-flash-lite-preview-09-2025",
    "models/gemini-2.5-flash",
    "models/gemini-flash-latest",  # Apelido genérico, costuma ser bom

    # --- NIVEL 3: DA FAMÍLIA 2.0 (Deram erro no log, ficam de reserva) ---
    "models/gemini-2.0-flash-lite-preview-02-05",  # Deu erro, mas mantemos como fallback
    "models/gemini-2.0-flash-lite-preview",
    "models/gemini-2.0-flash-lite",
    "models/gemini-2.0-flash-lite-001",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-exp",

    # --- NIVEL 4: PRO E OUTROS (Mais pesados/restritos) ---
    "models/gemini-2.5-pro",
    "models/gemini-pro-latest",

    # --- NIVEL 5: FALLBACK FINAL (GEMMA) ---
    "models/gemma-3-4b-it",
    "models/gemma-3-12b-it",
]

INDICE_MODELO_ATUAL = 0
modelo_gemini_instancia = None  # Inicializa a instância como None por padrão

if GEMINI_API_KEY:
    try:
        genai.configure(api_key=GEMINI_API_KEY)
        # Carrega o primeiro modelo da lista
        modelo_nome_inicial = MODELOS_DISPONIVEIS[INDICE_MODELO_ATUAL]
        modelo_gemini_instancia = genai.GenerativeModel(modelo_nome_inicial)
        logger.info(f"Modelo Gemini inicial '{modelo_nome_inicial}' carregado.")
    except Exception as e:
        logger.error(f"ERRO AO INICIALIZAR MODELO GEMINI INICIAL: {e}", exc_info=True)
        # Se houver erro, modelo_gemini_instancia permanece None, e será tratado nas funções
else:
    logger.warning("GEMINI_API_KEY não encontrada no arquivo .env. Funcionalidades da IA desativadas.")


# --- Funções do Bot ---

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


async def lidar_com_audio_rejeitado(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Informa ao usuário que mensagens de áudio não são mais aceitas."""
    texto_html = (
        "🔴​<b>AVISO</b>\n\n"
        "Só consigo processar lembretes por mensagem de <B>TEXTO</b>.\n"
        "Por favor, <b>DIGITE</b> o que você precisa."
    )
    await update.message.reply_html(texto_html)


async def lidar_erros(update: object, context: ContextTypes.DEFAULT_TYPE) -> None:
    logger.error(f'Update "%s" causou erro "%s"', update, str(context.error), exc_info=True)

    if update and hasattr(update, "effective_message") and update.effective_message:
        await update.effective_message.reply_text("Ops! Algo deu errado. Por favor, tente novamente mais tarde.")
    else:
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
        # --- MUDANÇA: Força a resposta em PT-BR ---
        prompt_formatado = (
            "Você é um assistente pessoal brasileiro. Responda à mensagem abaixo "
            "EXCLUSIVAMENTE em Português do Brasil (PT-BR), de forma natural, "
            "informal e objetiva. Jamais responda em inglês.\n\n"
            f"Mensagem do usuário: {prompt}"
        )

        sessao_chat = modelo_gemini_instancia.start_chat(history=[])
        resposta = await sessao_chat.send_message_async(prompt_formatado)
        return resposta.text

    # --- INÍCIO DA TRATATIVA ---
    except ResourceExhausted as e:
        logger.error(f"Erro 429 (ResourceExhausted) em obter_resposta_gemini: {e}", exc_info=True)
        # Este é o ESGOTAMENTO DE QUOTA. Precisa trocar o modelo.

        if tentar_trocar_modelo_gemini():
            return (
                "🚫​ <b>Quota da IA Esgotada (Erro 429)</b> 🚫\n\n"
                "O modelo de IA que estávamos usando atingiu sua quota (ResourceExhausted).\n"
                "Eu <b>troquei para um modelo de fallback</b>.\n\n"
                "Por favor, <b>envie sua mensagem novamente</b>."
            )
        else:
            return (
                "🚫​ <b>TODAS AS QUOTAS ESGOTADAS (Erro 429)</b> 🚫\n\n"
                "Todos os modelos de IA disponíveis atingiram suas quotas.\n"
                "A funcionalidade de IA está temporariamente desativada.\n"
                "Por favor, tente novamente mais tarde."
            )

    except TooManyRequests as e:
        logger.warning(f"Erro 429 (TooManyRequests) ao obter resposta geral: {e}", exc_info=True)
        return (
            "🚫​ <b>Limite de Taxa Atingido (Erro 429)</b> 🚫\n\n"
            "Muitas solicitações foram feitas muito rápido (TooManyRequests).\n"
            "Por favor, <b>aguarde cerca de 1 minuto</b> antes de tentar novamente."
        )

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

    if "diário" in r or "diaria" in r or "todo dia" in r:
        # SE tiver um número depois de dia (ex: todo dia 15), é MENSAL
        match_dia_especifico = re.search(r"dia\s+(\d+)", r)
        if match_dia_especifico:
            return 30 * 24 * 3600  # Trata como mensal
        return 24 * 3600  # Se for só "todo dia", é diário

    if "semanal" in r or "toda" in r:  # "toda quarta" cai aqui
        return 7 * 24 * 3600

    if "mensal" in r:
        return 30 * 24 * 3600

    return None


async def extrair_detalhes_lembrete_com_gemini(texto_usuario: str) -> dict | None:
    """
    Usa a Gemini API para classificar a intenção e extrair detalhes de um lembrete.
    """
    if not modelo_gemini_instancia:
        logger.warning("Modelo Gemini não configurado. Não é possível extrair detalhes.")
        return None

    momento_atual = datetime.now(timezone.utc)

    prompt_ia = f"""
        És um sistema de extração de dados. Responda APENAS com um objeto JSON válido. Proibido qualquer texto explicativo.

        Classifique a "intencao" como: "CRIAR_LEMBRETE", "DELETAR_LEMBRETE", "LISTAR_LEMBRETES" ou "CHAT_GERAL".

        Campos obrigatórios no JSON:
        - "intencao": (string)
        - "dados": (object ou null)

        Regras para "CRIAR_LEMBRETE" (preencher no campo "dados"):
        1. **Hora**: Formato HH:MM (24 horas). Se disser "às 2" ou "2h", assuma "02:00". Se disser "2 da tarde", use "14:00".
        2. **Título**: O que deve ser lembrado.
        3. **Data**: Formato AAAA-MM-DD. Hoje é {momento_atual.strftime('%Y-%m-%d')}.
        4. **Recorrência**: (string) Ex: "diário", "toda quarta", "todo mês", "todo dia 10".
        5. **Intervalo**: "intervalo_segundos" (int). Diário=86400, Semanal=604800, Mensal=2592000.
        6. **Data Fim**: "data_fim" (string AAAA-MM-DD). Use se o usuário disser "por X dias" ou "até mês X". Se for contínuo, use null.
        7. **Relativo**: "segundos_relativos" (float) para casos como "daqui a X minutos".

        Regras para "DELETAR_LEMBRETE":
        - Extraia apenas o "titulo" da tarefa para o campo "dados".

        ---
        Exemplos de Saída:

        Usuário: "Me lembra de assistir toda quarta"
        {{ 
          "intencao": "CRIAR_LEMBRETE", 
          "dados": {{ "titulo": "assistir", "hora": "00:00", "recorrencia": "toda quarta", "intervalo_segundos": 604800, "data_fim": null }} 
        }}

        Usuário: "Tomar remédio às 8h pelos próximos 3 dias"
        {{ 
          "intencao": "CRIAR_LEMBRETE", 
          "dados": {{ "titulo": "tomar remédio", "hora": "08:00", "recorrencia": "diário", "intervalo_segundos": 86400, "data_fim": "{(momento_atual + timedelta(days=3)).strftime('%Y-%m-%d')}" }} 
        }}

        Usuário: "Todo mês dia 10 pagar o aluguel"
        {{ 
          "intencao": "CRIAR_LEMBRETE", 
          "dados": {{ "titulo": "pagar o aluguel", "hora": "09:00", "recorrencia": "todo mês", "intervalo_segundos": 2592000, "data_fim": null }} 
        }}

        Usuário: "apaga o lembrete da academia"
        {{ "intencao": "DELETAR_LEMBRETE", "dados": {{ "titulo": "academia" }} }}

        Usuário: "me lista os lembretes"
        {{ "intencao": "LISTAR_LEMBRETES", "dados": null }}

        ---
        Pedido do usuário: "{texto_usuario}"
        """

    try:
        sessao_chat = modelo_gemini_instancia.start_chat(history=[])
        resposta = await sessao_chat.send_message_async(prompt_ia)

        texto_resposta = resposta.text.strip()
        if texto_resposta.startswith("```json") and texto_resposta.endswith("```"):
            texto_resposta = texto_resposta[7:-3].strip()

        logger.info(f"Resposta bruta da IA para extração/classificação: {texto_resposta}")

        detalhes = json.loads(texto_resposta)
        return detalhes

    except ResourceExhausted as e:
        logger.error(f"Erro 429 (ResourceExhausted) ao extrair lembrete: {e}", exc_info=True)

        if tentar_trocar_modelo_gemini():
            return {"intencao": "ERRO_429_TROCA_MODELO"}
        else:
            return {"intencao": "ERRO_429_QUOTA_ESGOTADA"}

    except TooManyRequests as e:
        logger.warning(f"Erro 429 (TooManyRequests) ao extrair lembrete: {e}", exc_info=True)
        return {"intencao": "ERRO_429_RATE_LIMIT"}

    except json.JSONDecodeError as e:
        logger.error(
            f"Erro ao decodificar JSON da Gemini API: {e}. Resposta: {resposta.text if 'resposta' in locals() else 'N/A'}",
            exc_info=True)
        return None
    except Exception as e:
        logger.error(f"Erro ao interagir com a Gemini API para extrair lembrete: {e}", exc_info=True)
        return None


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
    detalhes_lembrete = resposta_ia.get("dados")

    # --- 2. ROTEAMENTO BASEADO NA INTENÇÃO ---

    # === TRATATIVA DO ERRO 429 (TROCA DE MODELO BEM-SUCEDIDA) ===
    if intencao == "ERRO_429_TROCA_MODELO":
        mensagem_erro = (
            "🚫​ <b>Quota da IA Esgotada (Erro 429)</b> 🚫\n\n"
            "O modelo de IA que processa lembretes atingiu sua quota (ResourceExhausted).\n"
            "Eu <b>troquei para um modelo de fallback</b>.\n\n"
            "Por favor, <b>envie sua mensagem novamente</b>."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return

    # === TRATATIVA DO ERRO 429 (LIMITE DE TAXA / RPM) ===
    elif intencao == "ERRO_429_RATE_LIMIT":
        mensagem_erro = (
            "🚫​ <b>Limite de Taxa Atingido (Erro 429)</b> 🚫\n\n"
            "Muitas solicitações foram feitas muito rápido (TooManyRequests).\n"
            "Por favor, <b>aguarde cerca de 1 minuto</b> antes de tentar novamente."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return

    # === TRATATIVA DO ERRO 429 (TODAS AS QUOTAS ESGOTADAS) ===
    elif intencao == "ERRO_429_QUOTA_ESGOTADA" or intencao == "ERRO_429":
        mensagem_erro = (
            "🚫​ <b>TODAS AS QUOTAS ESGOTADAS (Erro 429)</b> 🚫\n\n"
            "Todos os modelos de IA disponíveis atingiram suas quotas.\n"
            "A funcionalidade de IA está temporariamente desativada.\n"
            "Por favor, tente novamente mais tarde."
        )
        await update.effective_message.reply_html(mensagem_erro)
        return

    # === INTENÇÃO: LISTAR LEMBRETES ===
    if intencao == "LISTAR_LEMBRETES":
        await listar_lembretes_pendentes(update, context)
        return

    # === INTENÇÃO: DELETAR LEMBRETE ===
    if intencao == "DELETAR_LEMBRETE":
        titulo_para_apagar = detalhes_lembrete.get("titulo") if detalhes_lembrete else None

        if not titulo_para_apagar:
            await update.effective_message.reply_text(
                "Qual lembrete você gostaria de apagar? Não consegui identificar o nome.")
            return

        sessao = SessionLocal()
        # Busca lembretes que contenham o título que o usuário falou
        lembretes = sessao.query(Lembrete).filter(
            Lembrete.chat_id == id_chat,
            Lembrete.titulo.ilike(f"%{titulo_para_apagar}%")
        ).all()
        sessao.close()

        if not lembretes:
            await update.effective_message.reply_text(
                f"Não encontrei nenhum lembrete com o nome '{titulo_para_apagar}'.")
            return

        # Se encontrou mais de um, ou o primeiro, pede confirmação
        # Para simplificar, vamos pegar o primeiro encontrado
        alvo = lembretes[0]

        keyboard = [
            [
                InlineKeyboardButton("✅ Sim, apagar", callback_data=f"del_{alvo.id}"),
                InlineKeyboardButton("❌ Não, manter", callback_data="del_cancel")
            ]
        ]
        reply_markup = InlineKeyboardMarkup(keyboard)

        await update.effective_message.reply_html(
            f"Deseja realmente apagar o lembrete: <b>\"{alvo.titulo}\"</b>?",
            reply_markup=reply_markup
        )
        return

    # === INTENÇÃO: CRIAR LEMBRETE ===
    elif intencao == "CRIAR_LEMBRETE" and detalhes_lembrete:

        titulo = detalhes_lembrete.get("titulo").upper()
        hora_str = detalhes_lembrete.get("hora")
        data_str = detalhes_lembrete.get("data")
        recorrencia = detalhes_lembrete.get("recorrencia")
        segundos_relativos = detalhes_lembrete.get("segundos_relativos")

        momento_agendamento = None
        agora_local = datetime.now(FUSO_HORARIO_LOCAL)

        # --- LÓGICA MESTRA DE DATAS ---
        # Prioridade 1: Segundos relativos (ex: "daqui 10 min")
        if segundos_relativos is not None:
            momento_agendamento = datetime.now(timezone.utc) + timedelta(seconds=float(segundos_relativos))

        # Prioridade 2: Data Específica dada pela IA (ex: "dia 25 de dezembro")
        elif data_str and hora_str:
            try:
                momento_local_naive = datetime.strptime(f"{data_str} {hora_str}", "%Y-%m-%d %H:%M")
                momento_local_aware = FUSO_HORARIO_LOCAL.localize(momento_local_naive)
                momento_agendamento = momento_local_aware.astimezone(timezone.utc)
            except ValueError:
                pass

                # Prioridade 3: Recorrências e Horários (AQUI ESTÁ A CORREÇÃO)
        elif hora_str:
            try:
                hora_h, min_m = map(int, hora_str.split(':'))
                # Começamos assumindo HOJE no horário pedido
                candidata = agora_local.replace(hour=hora_h, minute=min_m, second=0, microsecond=0)

                recorrencia_lower = recorrencia.lower() if recorrencia else ""
                dia_semana_encontrado = False

                # --- 3.1 TRATAMENTO SEMANAL (Toda quarta, toda sexta...) ---
                # Mapa de dias: 0=Segunda, 6=Domingo
                dias_map = {
                    "segunda": 0, "terça": 1, "terca": 1, "quarta": 2,
                    "quinta": 3, "sexta": 4, "sábado": 5, "sabado": 5, "domingo": 6
                }

                for nome_dia, num_dia in dias_map.items():
                    if nome_dia in recorrencia_lower:
                        dia_semana_encontrado = True
                        dia_atual = agora_local.weekday()

                        # Calcula quantos dias faltam para chegar no dia alvo
                        dias_para_adicionar = (num_dia - dia_atual + 7) % 7

                        # Se deu 0 (é hoje) mas a hora já passou, soma 7 dias (próxima semana)
                        if dias_para_adicionar == 0 and candidata < agora_local:
                            dias_para_adicionar = 7

                        candidata += timedelta(days=dias_para_adicionar)
                        break  # Achou o dia, para o loop

                # --- 3.2 TRATAMENTO MENSAL (Todo dia 15...) ---
                if not dia_semana_encontrado and "dia" in recorrencia_lower:
                    match_dia = re.search(r"dia\s+(\d+)", recorrencia_lower)
                    if match_dia:
                        dia_alvo = int(match_dia.group(1))
                        try:
                            # Tenta fixar o dia no mês atual
                            candidata = candidata.replace(day=dia_alvo)
                            # Se ficou no passado (ex: hoje é 26, pediu dia 15), joga pra mês que vem
                            if candidata < agora_local:
                                # Soma 32 dias e ajusta o dia para garantir que pule o mês
                                candidata = (candidata + timedelta(days=32)).replace(day=dia_alvo)
                        except ValueError:
                            pass  # Ignora dia 30 em fevereiro, etc.

                # --- 3.3 TRATAMENTO DIÁRIO / PONTUAL SEM DATA ---
                # Se não era semanal nem mensal, mas a hora já passou hoje (ex: "remédio às 8h" e agora são 10h)
                if not dia_semana_encontrado and "dia" not in recorrencia_lower:
                    if candidata < agora_local:
                        candidata += timedelta(days=1)

                # Converte o resultado final para UTC
                momento_agendamento = candidata.astimezone(timezone.utc)

            except Exception as e:
                logger.error(f"Erro calculando data: {e}")
                await update.effective_message.reply_text("Erro ao calcular a data do lembrete.")
                return

        # --- SEGUIMENTO DO CÓDIGO (Validações e Banco) ---
        if not momento_agendamento:
            # Se falhou tudo acima, tenta usar só a data se tiver
            if data_str:
                try:
                    d = datetime.strptime(data_str, "%Y-%m-%d")
                    momento_agendamento = FUSO_HORARIO_LOCAL.localize(d).astimezone(timezone.utc)
                except:
                    pass

        if not momento_agendamento or momento_agendamento < datetime.now(timezone.utc):
            if not momento_agendamento:  # Só reclama se for nulo, pq se for passado a gente já tratou acima
                await update.effective_message.reply_text("Não consegui entender a data ou hora.")
                return

        if not titulo:
            titulo = "Lembrete Geral"

        intervalo = intervalo_recorrencia_em_segundos(recorrencia)

        # Correção extra: Se tem recorrência mas intervalo veio vazio
        if recorrencia and not intervalo:
            intervalo = intervalo_recorrencia_em_segundos(recorrencia)

        # Remove anteriores e Salva
        remover_tarefas_antigas(str(id_chat), context)

        primeira_execucao_utc = momento_agendamento

        data_fim_str = detalhes_lembrete.get("data_fim")
        data_fim_dt = None
        if data_fim_str:
            try:
                data_fim_naive = datetime.strptime(data_fim_str, "%Y-%m-%d")
                data_fim_dt = FUSO_HORARIO_LOCAL.localize(data_fim_naive).astimezone(timezone.utc)
            except:
                pass

        sessao = SessionLocal()
        try:
            novo_lembrete = Lembrete(
                chat_id=id_chat,
                titulo=titulo,
                proxima_execucao=primeira_execucao_utc,
                intervalo_segundos=intervalo,
                recorrencia_str=recorrencia,
                data_fim=data_fim_dt
            )
            sessao.add(novo_lembrete)
            sessao.commit()
            id_db = novo_lembrete.id
        except Exception as e:
            logger.error(f"Erro ao salvar: {e}")
            sessao.rollback()
            await update.effective_message.reply_text("Erro no banco de dados.")
            return
        finally:
            sessao.close()

        context.job_queue.run_once(
            disparar_alarme,
            when=primeira_execucao_utc,
            chat_id=id_chat,
            name=str(id_db),
            data={"titulo": titulo, "id_db": id_db}
        )

        # Resposta Formatada
        primeira_execucao_utc = primeira_execucao_utc.replace(tzinfo=timezone.utc)
        momento_local = primeira_execucao_utc.astimezone(FUSO_HORARIO_LOCAL)
        data_fmt = momento_local.strftime('%d/%m/%Y às %H:%M')

        texto_html = ""
        if intervalo or recorrencia:
            t_rec = recorrencia if recorrencia else "Recorrente"
            texto_html = (
                "<b>🟢 LEMBRETE RECORRENTE</b>\n\n"
                f"<b>\"{titulo}\"</b>\n"
                f"Próximo: <b>{data_fmt}</b>\n"
                f"Repete: <b>{t_rec}</b>"
            )
        else:
            texto_html = (
                "<b>🟢​ LEMBRETE</b>\n\n"
                f"<b>\"{titulo}\"</b>\n"
                f"Agendado para: <b>{data_fmt}</b>"
            )

        await update.effective_message.reply_html(texto_html)
        return

        # 1. DEFINE AS VARIÁVEIS PRIMEIRO (Correção do erro anterior)
        titulo = detalhes_lembrete.get("titulo").upper()
        hora_str = detalhes_lembrete.get("hora")
        data_str = detalhes_lembrete.get("data")
        recorrencia = detalhes_lembrete.get("recorrencia")
        segundos_relativos = detalhes_lembrete.get("segundos_relativos")

        # 2. AGORA SIM: CORREÇÃO DE DATA PARA "TODO DIA X"
        # Se a IA identificou recorrência e tem "dia X", verificamos se já passou
        if recorrencia and "dia" in recorrencia.lower():
            match_dia = re.search(r"dia\s+(\d+)", recorrencia, re.IGNORECASE)
            if match_dia:
                dia_alvo = int(match_dia.group(1))
                agora_local = datetime.now(FUSO_HORARIO_LOCAL)

                try:
                    # Define hora padrão 09:00 se a IA não pegou hora
                    hora_h = int(hora_str.split(':')[0]) if hora_str else 9
                    min_m = int(hora_str.split(':')[1]) if hora_str else 0

                    # Cria data candidata neste mês
                    candidata = agora_local.replace(day=dia_alvo, hour=hora_h, minute=min_m, second=0, microsecond=0)

                    # Se hoje é 26 e pediu dia 15, a data candidata ficou no passado.
                    # Jogamos para o mês que vem.
                    if candidata < agora_local:
                        proximo_mes = candidata + timedelta(days=32)
                        candidata = proximo_mes.replace(day=dia_alvo)

                    # Atualiza as variáveis que o código usará abaixo
                    data_str = candidata.strftime("%Y-%m-%d")
                    hora_str = candidata.strftime("%H:%M")

                except ValueError:
                    pass  # Ignora erros de data (ex: dia 31 em fevereiro)

        # 3. VERIFICAÇÃO SE TEM DADOS SUFICIENTES
        if not (segundos_relativos is not None or hora_str or data_str or recorrencia):
            pass  # Deixa cair para o CHAT_GERAL no final
        else:
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

            # Calcula intervalo e limpa tarefas antigas
            intervalo = intervalo_recorrencia_em_segundos(recorrencia)
            tarefa_removida = remover_tarefas_antigas(str(id_chat), context)

            if intervalo or momento_agendamento or recorrencia:
                # Se tem recorrencia mas intervalo veio vazio, tenta calcular de novo
                if recorrencia and not intervalo:
                    intervalo = intervalo_recorrencia_em_segundos(recorrencia)

                if intervalo:
                    primeira_execucao_utc = momento_agendamento if momento_agendamento else datetime.now(
                        timezone.utc) + timedelta(seconds=intervalo)
                else:
                    primeira_execucao_utc = momento_agendamento

                data_fim_str = detalhes_lembrete.get("data_fim")
                data_fim_dt = None
                if data_fim_str:
                    data_fim_naive = datetime.strptime(data_fim_str, "%Y-%m-%d")
                    data_fim_dt = FUSO_HORARIO_LOCAL.localize(data_fim_naive).astimezone(timezone.utc)

                # SALVAR NO BANCO DE DADOS
                sessao = SessionLocal()
                try:
                    novo_lembrete = Lembrete(
                        chat_id=id_chat,
                        titulo=titulo,
                        proxima_execucao=primeira_execucao_utc,
                        intervalo_segundos=intervalo,
                        recorrencia_str=recorrencia,
                        data_fim=data_fim_dt
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

                # RESPONDER AO USUÁRIO (MENSAGEM CORRIGIDA)
                if primeira_execucao_utc.tzinfo is None:
                    primeira_execucao_utc = primeira_execucao_utc.replace(tzinfo=timezone.utc)

                momento_agendamento_local = primeira_execucao_utc.astimezone(FUSO_HORARIO_LOCAL)
                data_formatada = momento_agendamento_local.strftime('%d/%m/%Y às %H:%M')

                texto_html = ""
                # Se tem intervalo OU recorrencia escrita, é recorrente
                if intervalo or recorrencia:
                    texto_recorrencia = recorrencia if recorrencia else "Recorrente"
                    texto_html = (
                        "<b>🟢 LEMBRETE RECORRENTE</b>\n\n"
                        f"<b>\"{titulo}\"</b>\n"
                        f"Próximo: <b>{data_formatada}</b>\n"
                        f"Repete: <b>{texto_recorrencia}</b>"
                    )
                else:
                    texto_html = (
                        "<b>🟢​ LEMBRETE</b>\n\n"
                        f"<b>\"{titulo}\"</b>\n"
                        f"Agendado para: <b>{data_formatada}</b>"
                    )

                if tarefa_removida:
                    texto_html += "\n\n<i>(Lembrete anterior removido.)</i>"

                await update.effective_message.reply_html(texto_html)
                return

            else:
                pass  # Deixa cair para o CHAT_GERAL

    # === INTENÇÃO: CHAT GERAL (ou fallback) ===
    resposta_ai = await obter_resposta_gemini(mensagem_usuario)
    await update.effective_message.reply_text(resposta_ai)


async def lidar_botoes_confirmacao(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Processa confirmação de exclusão e agora também o adiamento (snooze)."""
    query = update.callback_query
    await query.answer()  # Tira o reloginho do botão
    data = query.data

    # --- LÓGICA DE ADIAR (SNOOZE) ---
    if data.startswith("snz_"):
        # Formato esperado: snz_MINUTOS_ID (ex: snz_5_123)
        partes = data.split("_")
        minutos = int(partes[1])
        id_db = int(partes[2])

        sessao = SessionLocal()
        try:
            lembrete = sessao.query(Lembrete).filter(Lembrete.id == id_db).first()

            if not lembrete:
                await query.edit_message_text("❌ Erro: Lembrete não encontrado para adiar.")
                return

            # Calcula a nova hora baseada em AGORA (momento do clique)
            nova_execucao_utc = datetime.now(timezone.utc) + timedelta(minutes=minutos)

            # Atualiza o Banco de Dados
            lembrete.proxima_execucao = nova_execucao_utc
            sessao.commit()

            # Agenda o novo Job
            context.job_queue.run_once(
                disparar_alarme,
                when=nova_execucao_utc,
                chat_id=update.effective_chat.id,
                name=str(id_db),
                data={"titulo": lembrete.titulo, "id_db": id_db}
            )

            # Responde pro usuário (com negrito em HTML)
            hora_local = nova_execucao_utc.astimezone(FUSO_HORARIO_LOCAL).strftime('%H:%M')
            await query.edit_message_text(
                f"<b>Adiado!</b> Vou te lembrar de <b>\"{lembrete.titulo}\"</b> novamente às <b>{hora_local}</b>.",
                parse_mode="HTML"
            )

        except Exception as e:
            logger.error(f"Erro ao adiar lembrete: {e}")
            await query.edit_message_text("❌ Erro técnico ao tentar adiar.")
        finally:
            sessao.close()
        return

    if data == "del_cancel":
        await query.edit_message_text(
            "<b>Operação cancelada</b>. O lembrete continua <b>ativo</b>.",
            parse_mode="HTML"
        )
        return

    if data.startswith("del_"):
        id_db = data.split("_")[1]

        sessao = SessionLocal()
        try:
            lembrete = sessao.query(Lembrete).filter(Lembrete.id == int(id_db)).first()

            if lembrete:
                # 1. Remove do JobQueue (usamos o ID do DB como nome do job, lembra?)
                jobs_atuais = context.job_queue.get_jobs_by_name(str(lembrete.id))
                for job in jobs_atuais:
                    job.schedule_removal()

                # 2. Remove do Banco de Dados
                sessao.delete(lembrete)
                sessao.commit()

                await query.edit_message_text(
                    f"<b>Feito!</b> O lembrete foi <b>apagado</b> com sucesso.",
                    parse_mode="HTML"
                )
            else:
                await query.edit_message_text(
                    "Ué, não encontrei esse lembrete no banco de dados. Talvez já tenha sido apagado.")

        except Exception as e:
            logger.error(f"Erro ao deletar lembrete: {e}", exc_info=True)
            await query.edit_message_text("Erro técnico ao tentar apagar o lembrete.")
        finally:
            sessao.close()


async def disparar_alarme(context: ContextTypes.DEFAULT_TYPE) -> None:
    """Disparo do alarme insistente com botões de adiar na última mensagem."""
    tarefa = context.job
    id_db = tarefa.name
    titulo = tarefa.data.get("titulo", "Lembrete")
    texto_lembrete_html = f"<b>🟠​ LEMBRETE</b>\n\n<b>\"{titulo}\"</b>"

    # Envia a mensagem 3 vezes
    for i in range(3):
        reply_markup = None

        # --- NOVO: Só coloca os botões na TERCEIRA mensagem ---
        if i == 2:
            keyboard = [
                [
                    InlineKeyboardButton("⏰ +5 min", callback_data=f"snz_5_{id_db}"),
                    InlineKeyboardButton("⏰ +10 min", callback_data=f"snz_10_{id_db}")
                ]
            ]
            reply_markup = InlineKeyboardMarkup(keyboard)

        try:
            await context.bot.send_message(
                tarefa.chat_id,
                text=texto_lembrete_html,
                parse_mode="HTML",
                reply_markup=reply_markup  # Adiciona os botões aqui
            )
            if i < 2:
                await asyncio.sleep(2)  # Intervalo entre as insistências
        except Exception as e:
            logger.error(f"Erro no disparo {i + 1}: {e}")

    # Lógica do Banco de Dados
    sessao = SessionLocal()
    try:
        lembrete_db = sessao.query(Lembrete).filter(Lembrete.id == int(id_db)).first()
        if not lembrete_db: return

        # SE FOR RECORRENTE: Atualiza para a próxima data padrão
        if lembrete_db.intervalo_segundos and lembrete_db.intervalo_segundos > 0:
            nova_proxima_execucao = lembrete_db.proxima_execucao + timedelta(seconds=lembrete_db.intervalo_segundos)

            # --- CHECA SE O PRAZO ACABOU ---
            if lembrete_db.data_fim and nova_proxima_execucao > lembrete_db.data_fim:
                logger.info(f"Lembrete ID {id_db} finalizado pelo prazo.")
                sessao.delete(lembrete_db)  # Pode deletar se o prazo acabou
                sessao.commit()
            else:
                # Atualiza e reagenda normal
                lembrete_db.proxima_execucao = nova_proxima_execucao
                sessao.commit()

            context.job_queue.run_once(
                disparar_alarme,
                when=nova_proxima_execucao,
                chat_id=tarefa.chat_id,
                name=str(id_db),
                data={"titulo": titulo, "id_db": id_db}
            )

        # SE FOR ÚNICO: Não vamos mais deletar aqui!
        # Deixamos ele no DB para que o botão "Adiar" possa encontrá-lo.
        # Ele não aparecerá na 'lista' porque a data já passou.
        else:
            logger.info(f"Lembrete único {id_db} disparado. Mantido no DB para possível adiamento.")

    except Exception as e:
        logger.error(f"Erro no DB: {e}")
        sessao.rollback()
    finally:
        sessao.close()


async def listar_lembretes_pendentes(update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
    """Busca no DB e lista os lembretes pendentes."""

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
            data_utc = lembrete.proxima_execucao.replace(tzinfo=timezone.utc)
            momento_local = data_utc.astimezone(FUSO_HORARIO_LOCAL)

            # Formatação da repetição
            info_frequencia = ""
            if lembrete.recorrencia_str:
                prazo = f"(até {lembrete.data_fim.strftime('%d/%m')})" if lembrete.data_fim else "(contínuo)"
                info_frequencia = f"\n  <b>Repete:</b> {lembrete.recorrencia_str} {prazo}"

            resposta_html.append(
                "\n----------------------"
                f"\n<b>\"{lembrete.titulo}\"</b>\n"
                f"  <b>Próximo:</b> {momento_local.strftime('%d/%m/%Y às %H:%M')}"
                f"{info_frequencia}"  # Mostra a recorrência logo abaixo do próximo
                "\n----------------------"
            )

        await update.effective_message.reply_html("\n".join(resposta_html))

    except Exception as e:
        logger.error(f"Erro ao listar lembretes do DB para o chat_id {id_chat}: {e}", exc_info=True)
        await update.effective_message.reply_text("Ocorreu um erro ao tentar buscar seus lembretes.")
    finally:
        sessao.close()


def remover_tarefas_antigas(nome: str, context: ContextTypes.DEFAULT_TYPE):
    """Remove jobs antigos do JobQueue com o mesmo nome (chat_id)"""
    tarefas_atuais = context.job_queue.get_jobs_by_name(nome)
    if not tarefas_atuais:
        return False
    logger.info(f"Removendo {len(tarefas_atuais)} tarefas antigas para o chat {nome}")
    for tarefa in tarefas_atuais:
        tarefa.schedule_removal()
    return True


async def post_init(app: Application) -> None:
    """Função chamada após a inicialização do bot para re-agendar jobs do DB."""

    logger.info("Bot iniciado. Verificando lembretes pendentes no banco de dados...")

    sessao = SessionLocal()
    try:
        agora_utc = datetime.now(timezone.utc)
        lembretes_pendentes = sessao.query(Lembrete).filter(Lembrete.proxima_execucao > agora_utc).all()

        if not lembretes_pendentes:
            logger.info("Nenhum lembrete pendente encontrado.")
            sessao.close()
            return

        logger.info(f"Re-agendando {len(lembretes_pendentes)} lembretes pendentes...")

        for lembrete in lembretes_pendentes:
            app.job_queue.run_once(
                disparar_alarme,
                when=lembrete.proxima_execucao,
                chat_id=lembrete.chat_id,
                name=str(lembrete.id),
                data={"titulo": lembrete.titulo, "id_db": lembrete.id}
            )

    except Exception as e:
        logger.error(f"Erro ao re-agendar lembretes do DB: {e}", exc_info=True)
    finally:
        if sessao.is_active:
            sessao.close()

    logger.info("Re-agendamento de lembretes concluído.")


def main():
    """Inicia o bot."""
    application = Application.builder().token(TELEGRAM_TOKEN).post_init(post_init).build()

    application.add_handler(MessageHandler(filters.VOICE, lidar_com_audio_rejeitado))
    application.add_handler(CallbackQueryHandler(lidar_botoes_confirmacao))
    application.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, lidar_com_mensagens_texto_geral))
    application.add_error_handler(lidar_erros)

    application.run_polling(allowed_updates=Update.ALL_TYPES)


if __name__ == "__main__":
    main()