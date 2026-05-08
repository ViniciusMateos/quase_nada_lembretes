"""
Gemini AI client with model fallback support.
Handles intent classification and general chat for the Quase Nada app.
"""

import asyncio
import json
import logging
import re
import time
from typing import Any

import google.generativeai as genai

from src.core.config import settings

logger = logging.getLogger(__name__)

genai.configure(api_key=settings.google_api_key)

MODELOS_PREFERIDOS = [
    "models/gemini-2.5-flash-lite",
    "models/gemini-3.1-flash-lite",   # 500 RPD — grande reserva
    "models/gemini-2.5-flash",
    "models/gemini-3-flash",
    "models/gemini-2.0-flash",
    "models/gemini-2.0-flash-lite",
    "models/gemini-1.5-flash-8b",
    "models/gemini-1.5-flash",
    "models/gemini-2.5-pro",
    "models/gemma-3-27b-it",          # 14.4K RPD — reserva enorme
    "models/gemma-3-12b-it",
]

# Quota cache: model_name -> timestamp until which it stays blocked (1h cooldown)
_quota_blocked_until: dict[str, float] = {}
_QUOTA_COOLDOWN_SECONDS = 3600


def _is_quota_blocked(model_name: str) -> bool:
    blocked_until = _quota_blocked_until.get(model_name, 0)
    return time.monotonic() < blocked_until


def _mark_quota_exceeded(model_name: str) -> None:
    _quota_blocked_until[model_name] = time.monotonic() + _QUOTA_COOLDOWN_SECONDS
    logger.warning("Model %s quota exceeded — blocked for 1 hour.", model_name)


# Prefixo estático — nunca muda entre requisições, ativa o implicit cache do Gemini
_INTENT_PROMPT_PREFIX = """Você é um sistema de extração de dados. Responda APENAS com JSON válido, sem markdown, sem explicações.

Classifique a mensagem do usuário e extraia os dados relevantes.

A "intencao" deve ser uma das seguintes:
- "CRIAR_LEMBRETE": usuário quer criar/adicionar/agendar um lembrete
- "DELETAR_LEMBRETE": usuário quer remover/apagar/cancelar um lembrete
- "LISTAR_LEMBRETES": usuário quer ver/listar/consultar seus lembretes
- "CHAT_GERAL": qualquer outra mensagem (saudação, dúvida, conversa)

Para CRIAR_LEMBRETE, extraia:
- titulo: texto descritivo do lembrete (obrigatório)
- data_hora: data e hora no formato ISO 8601 COM OFFSET do cliente (ex: "2026-04-24T12:00:00-03:00"). Se o usuário mencionar um horário, calcule a data/hora exata. Se não mencionar, use null.
- recorrencia: OBRIGATÓRIO — escolha UMA das opções abaixo com muito cuidado:
  * "once" — evento ÚNICO, acontece UMA SÓ VEZ. Use quando: usuário mencionar data/hora específica sem padrão de repetição, ou usar "daqui X minutos/horas", ou usar "hoje", "amanhã", "na próxima semana" sem repetição.
  * "daily" — repete TODO DIA. Use SOMENTE quando o usuário disser explicitamente: "todo dia", "todos os dias", "diariamente", "cada dia".
  * "weekly" — repete toda semana em um dia específico. Use SOMENTE quando disser: "toda segunda", "toda terça", "toda quinta", "semanalmente na quarta", etc.
  * "monthly" — repete todo mês na mesma data. Use SOMENTE quando disser: "todo mês", "mensalmente", "todo dia 10", "todo primeiro do mês".
  * "day_of_month" — repete todo mês em um dia específico do mês. Use SOMENTE quando especificar dia do mês com repetição mensal.
  * "interval_seconds" — repete em intervalos fixos de segundos. Use SOMENTE quando disser: "a cada X horas", "a cada X minutos", "a cada 2 dias".
- interval_seconds: número inteiro de segundos (APENAS quando recorrencia="interval_seconds"). Exemplos: "a cada 4 horas" = 14400, "a cada 30 minutos" = 1800, "a cada 2 dias" = 172800. Para outros tipos: null.
- data_fim: data de término ISO 8601 com offset (se mencionado, senão null)

REGRA CRÍTICA SOBRE RECORRÊNCIA:
- Se a mensagem contém uma data/hora específica SEM palavras de repetição → recorrencia = "once"
- Palavras que NUNCA indicam recorrência: "daqui", "em X minutos", "em X horas", "hoje", "amanhã", "semana que vem", "mês que vem", "no dia X"
- Palavras que SÓ indicam recorrência: "todo", "toda", "todos", "todas", "cada", "diariamente", "semanalmente", "mensalmente"

Para DELETAR_LEMBRETE, extraia:
- titulo_busca: texto para buscar o lembrete a deletar

Para LISTAR_LEMBRETES: sem dados extras.
Para CHAT_GERAL: sem dados extras.

=== EXEMPLOS (few-shot, referência: 2026-04-24T12:00:00-03:00) ===

Mensagem: "me lembra de comer daqui 5 minutos"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Comer", "data_hora": "2026-04-24T12:05:00-03:00", "recorrencia": "once", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra de ligar pro médico amanhã às 10h"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Ligar pro médico", "data_hora": "2026-04-25T10:00:00-03:00", "recorrencia": "once", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra de tomar remédio todo dia às 8h"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Tomar remédio", "data_hora": "2026-04-25T08:00:00-03:00", "recorrencia": "daily", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra de ligar pra mãe toda quinta"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Ligar pra mãe", "data_hora": "2026-04-30T09:00:00-03:00", "recorrencia": "weekly", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra de pagar o aluguel todo mês dia 5"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Pagar aluguel", "data_hora": "2026-05-05T09:00:00-03:00", "recorrencia": "day_of_month", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra a cada 4 horas de beber água"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Beber água", "data_hora": "2026-04-24T16:00:00-03:00", "recorrencia": "interval_seconds", "interval_seconds": 14400, "data_fim": null}}}}

Mensagem: "me lembra de reunião hoje às 15h"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Reunião", "data_hora": "2026-04-24T15:00:00-03:00", "recorrencia": "once", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "me lembra de academia às 18h todo dia"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Academia", "data_hora": "2026-04-24T18:00:00-03:00", "recorrencia": "daily", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "a cada 30 minutos me lembra de alongar"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Alongar", "data_hora": "2026-04-24T12:30:00-03:00", "recorrencia": "interval_seconds", "interval_seconds": 1800, "data_fim": null}}}}

Mensagem: "me lembra de comer daqui 1 hora"
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Comer", "data_hora": "2026-04-24T13:00:00-03:00", "recorrencia": "once", "interval_seconds": null, "data_fim": null}}}}

Mensagem: "oi"
{{"intencao": "CHAT_GERAL", "dados": {{}}}}

Mensagem: "quais são meus lembretes?"
{{"intencao": "LISTAR_LEMBRETES", "dados": {{}}}}

Mensagem: "cancela o lembrete de academia"
{{"intencao": "DELETAR_LEMBRETE", "dados": {{"titulo_busca": "academia"}}}}

=== FIM DOS EXEMPLOS ===

"""

# Sufixo dinâmico — apenas as variáveis que mudam por requisição
_INTENT_PROMPT_SUFFIX = """Data/hora atual do cliente: {current_datetime}
Mensagem do usuário: {user_message}

Responda SOMENTE com JSON válido. Nunca coloque instruções como "CALCULE:" no JSON — apenas o valor ISO 8601 calculado."""

def _build_intent_prompt(user_message: str, current_datetime: str) -> str:
    return _INTENT_PROMPT_PREFIX + _INTENT_PROMPT_SUFFIX.format(
        current_datetime=current_datetime,
        user_message=user_message,
    )

CHAT_SYSTEM_PROMPT = """Você é o assistente de lembretes do app Quase Nada.
Responda em português brasileiro de forma conversacional, amigável e concisa.
Ajude o usuário com dúvidas sobre o app, lembretes e organização.
Se não souber algo, seja honesto. Não invente informações."""


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from model response, handling markdown code blocks."""
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    return json.loads(cleaned)


def _available_models() -> list[str]:
    """Return models not currently blocked by quota."""
    return [m for m in MODELOS_PREFERIDOS if not _is_quota_blocked(m)]


async def classify_intent(
    user_message: str,
    current_datetime: str,
) -> dict[str, Any]:
    """
    Classify the intent of a user message and extract relevant data.
    Returns dict with 'intencao' and 'dados' keys.
    Falls back through MODELOS_PREFERIDOS on 429/404 errors; quota-exceeded
    models are skipped for 1 hour before being retried.
    """
    prompt = _build_intent_prompt(user_message, current_datetime)

    last_error: Exception | None = None

    for model_name in _available_models():
        try:
            model = genai.GenerativeModel(model_name)
            response = await asyncio.wait_for(
                model.generate_content_async(
                    prompt,
                    generation_config=genai.GenerationConfig(
                        temperature=0.1,
                        max_output_tokens=512,
                    ),
                    request_options={"timeout": 8, "retry": None},
                ),
                timeout=10,
            )
            result = _extract_json(response.text)
            result["_model_used"] = model_name
            logger.info("Intent classified using model: %s", model_name)
            return result
        except asyncio.TimeoutError:
            logger.warning("Model %s timed out, skipping.", model_name)
            last_error = Exception(f"Timeout on {model_name}")
            continue
        except json.JSONDecodeError as e:
            logger.warning("Model %s returned invalid JSON: %s", model_name, e)
            last_error = e
            continue
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str:
                _mark_quota_exceeded(model_name)
                last_error = e
                continue
            if "404" in err_str or "not found" in err_str:
                logger.warning("Model %s not found, skipping.", model_name)
                last_error = e
                continue
            logger.error("Unexpected error with model %s: %s", model_name, e)
            last_error = e
            continue

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")


async def chat_general(
    user_message: str,
    history: list[dict[str, str]] | None = None,
) -> tuple[str, str]:
    """
    Generate a conversational response in PT-BR.
    Returns (response_text, model_used).
    """
    last_error: Exception | None = None

    gemini_history = []
    if history:
        for entry in history[-10:]:
            role = "user" if entry["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [entry["content"]]})

    for model_name in _available_models():
        try:
            model = genai.GenerativeModel(
                model_name,
                system_instruction=CHAT_SYSTEM_PROMPT,
            )
            chat = model.start_chat(history=gemini_history)
            response = await asyncio.wait_for(
                chat.send_message_async(
                    user_message,
                    generation_config=genai.GenerationConfig(
                        temperature=0.7,
                        max_output_tokens=512,
                    ),
                    request_options={"timeout": 8, "retry": None},
                ),
                timeout=10,
            )
            logger.info("Chat response generated using model: %s", model_name)
            return response.text, model_name
        except asyncio.TimeoutError:
            logger.warning("Model %s timed out on chat, skipping.", model_name)
            last_error = Exception(f"Timeout on {model_name}")
            continue
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str:
                _mark_quota_exceeded(model_name)
                last_error = e
                continue
            if "404" in err_str or "not found" in err_str:
                logger.warning("Model %s not found, skipping.", model_name)
                last_error = e
                continue
            logger.error("Unexpected error with model %s: %s", model_name, e)
            last_error = e
            continue

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")
