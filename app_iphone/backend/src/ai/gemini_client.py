"""
Gemini AI client with model fallback support.
Handles intent classification and general chat for the Quase Nada app.
"""

import json
import logging
import re
from typing import Any

import google.generativeai as genai

from src.core.config import settings

logger = logging.getLogger(__name__)

MODELOS_PREFERIDOS = [
    "models/gemini-2.5-flash-lite",
    "models/gemini-2.5-flash",
    "models/gemini-2.5-pro",
    "models/gemini-flash-latest",
]

INTENT_CLASSIFICATION_PROMPT = """Você é um sistema de extração de dados. Responda APENAS com JSON válido, sem markdown, sem explicações.

Classifique a mensagem do usuário e extraia os dados relevantes.

A "intencao" deve ser uma das seguintes:
- "CRIAR_LEMBRETE": usuário quer criar/adicionar/agendar um lembrete
- "DELETAR_LEMBRETE": usuário quer remover/apagar/cancelar um lembrete
- "LISTAR_LEMBRETES": usuário quer ver/listar/consultar seus lembretes
- "CHAT_GERAL": qualquer outra mensagem (saudação, dúvida, conversa)

Para CRIAR_LEMBRETE, extraia:
- titulo: texto descritivo do lembrete (obrigatório)
- data_hora: data e hora no formato ISO 8601 (se mencionado, senão null)
- recorrencia: "once", "daily", "weekly", "monthly", "day_of_month", "interval_seconds" (senão "once")
- interval_seconds: número inteiro (apenas para recorrencia=interval_seconds, senão null)
- data_fim: data de término no formato ISO 8601 (se mencionado, senão null)

Para DELETAR_LEMBRETE, extraia:
- titulo_busca: texto para buscar o lembrete a deletar

Para LISTAR_LEMBRETES: sem dados extras.
Para CHAT_GERAL: sem dados extras.

Data/hora atual (referência para interpretar "amanhã", "próxima semana", etc.): {current_datetime}

Mensagem do usuário: {user_message}

Responda SOMENTE com JSON, exemplo:
{{"intencao": "CRIAR_LEMBRETE", "dados": {{"titulo": "Reunião com cliente", "data_hora": "2026-04-10T14:00:00", "recorrencia": "once", "interval_seconds": null, "data_fim": null}}}}
"""

CHAT_SYSTEM_PROMPT = """Você é o assistente de lembretes do app Quase Nada.
Responda em português brasileiro de forma conversacional, amigável e concisa.
Ajude o usuário com dúvidas sobre o app, lembretes e organização.
Se não souber algo, seja honesto. Não invente informações."""


def _configure_client() -> None:
    genai.configure(api_key=settings.google_api_key)


def _extract_json(text: str) -> dict[str, Any]:
    """Extract JSON from model response, handling markdown code blocks."""
    cleaned = re.sub(r"```(?:json)?\s*", "", text).replace("```", "").strip()
    return json.loads(cleaned)


async def classify_intent(
    user_message: str,
    current_datetime: str,
) -> dict[str, Any]:
    """
    Classify the intent of a user message and extract relevant data.
    Returns dict with 'intencao' and 'dados' keys.
    Falls back through MODELOS_PREFERIDOS on 429/404 errors.
    """
    _configure_client()
    prompt = INTENT_CLASSIFICATION_PROMPT.format(
        user_message=user_message,
        current_datetime=current_datetime,
    )

    last_error: Exception | None = None
    model_used: str | None = None

    for model_name in MODELOS_PREFERIDOS:
        try:
            model = genai.GenerativeModel(model_name)
            response = model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.1,
                    max_output_tokens=512,
                ),
            )
            result = _extract_json(response.text)
            result["_model_used"] = model_name
            logger.info("Intent classified using model: %s", model_name)
            return result
        except json.JSONDecodeError as e:
            logger.warning("Model %s returned invalid JSON: %s", model_name, e)
            last_error = e
            continue
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str or "404" in err_str or "not found" in err_str:
                logger.warning("Model %s unavailable (%s), trying next.", model_name, e)
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
    _configure_client()
    last_error: Exception | None = None

    gemini_history = []
    if history:
        for entry in history[-10:]:
            role = "user" if entry["role"] == "user" else "model"
            gemini_history.append({"role": role, "parts": [entry["content"]]})

    for model_name in MODELOS_PREFERIDOS:
        try:
            model = genai.GenerativeModel(
                model_name,
                system_instruction=CHAT_SYSTEM_PROMPT,
            )
            chat = model.start_chat(history=gemini_history)
            response = chat.send_message(
                user_message,
                generation_config=genai.GenerationConfig(
                    temperature=0.7,
                    max_output_tokens=1024,
                ),
            )
            logger.info("Chat response generated using model: %s", model_name)
            return response.text, model_name
        except Exception as e:
            err_str = str(e).lower()
            if "429" in err_str or "quota" in err_str or "404" in err_str or "not found" in err_str:
                logger.warning("Model %s unavailable (%s), trying next.", model_name, e)
                last_error = e
                continue
            logger.error("Unexpected error with model %s: %s", model_name, e)
            last_error = e
            continue

    raise RuntimeError(f"All Gemini models failed. Last error: {last_error}")
