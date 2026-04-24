"""
Message orchestration service.
Classifies intent via Gemini → executes action → saves history → returns response.
"""

import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai.gemini_client import chat_general, classify_intent
from src.features.messages.schemas import MessageRequest, MessageResponse
from src.features.reminders.repository import (
    delete_reminder,
    get_active_reminders_for_user,
    search_reminders_by_title,
)
from src.features.reminders.service import create_reminder_from_data, find_reminders_for_deletion
from src.features.reminders.schemas import ReminderOut
from src.models.models import ChatHistory, User


async def _save_history(
    db: AsyncSession,
    user_id: str,
    role: str,
    content: str,
    intent: str | None = None,
    model_used: str | None = None,
) -> None:
    entry = ChatHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role=role,
        content=content,
        intent=intent,
        model_used=model_used,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(entry)
    await db.flush()


async def _get_recent_history(db: AsyncSession, user_id: str) -> list[dict[str, str]]:
    from sqlalchemy import select
    from src.models.models import ChatHistory as CH
    result = await db.execute(
        select(CH)
        .where(CH.user_id == user_id)
        .order_by(CH.created_at.desc())
        .limit(10)
    )
    rows = list(result.scalars().all())
    rows.reverse()
    return [{"role": r.role, "content": r.content} for r in rows]


async def process_message(
    db: AsyncSession,
    user: User,
    payload: MessageRequest,
) -> MessageResponse:
    message_id = str(uuid.uuid4())

    await _save_history(db, user.id, "user", payload.content)

    try:
        classification = await classify_intent(
            user_message=payload.content,
            current_datetime=payload.client_timestamp,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"detail": "Serviço de IA temporariamente indisponível.", "code": "AI_UNAVAILABLE"},
        ) from e

    intent: str = classification.get("intencao", "CHAT_GERAL")
    dados: dict[str, Any] = classification.get("dados", {})
    model_used: str = classification.get("_model_used", "unknown")
    action: dict[str, Any] | None = None
    response_text: str = ""

    # ── CRIAR_LEMBRETE ──
    if intent == "CRIAR_LEMBRETE":
        try:
            reminder = await create_reminder_from_data(db, user.id, dados)
            action = {
                "type": "reminder_created",
                "reminder": ReminderOut.from_orm(reminder).model_dump(),
            }
            proxima_execucao_dt = datetime.fromisoformat(reminder.next_execution)
            proxima_execucao_formatada = proxima_execucao_dt.strftime("%d/%m/%Y às %H:%M")
            if reminder.recurrence and reminder.recurrence != "once":
                response_text = f"Lembrete recorrente criado!\n{reminder.title.upper()}\na partir de: {proxima_execucao_formatada}"
            else:
                response_text = f"Lembrete criado!\n{reminder.title.upper()}\ndata: {proxima_execucao_formatada}"
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail={"detail": "Erro ao criar lembrete.", "code": "INTERNAL_ERROR"},
            ) from e

    # ── LISTAR_LEMBRETES ──
    elif intent == "LISTAR_LEMBRETES":
        from src.features.reminders.repository import get_reminders_by_user
        reminders_page, total_reminders = await get_reminders_by_user(db, user.id, active_only=True, limit=20, offset=0)
        reminder_list = [ReminderOut.from_orm(r).model_dump() for r in reminders_page]
        action = {
            "type": "reminders_listed",
            "reminders": reminder_list,
        }
        if reminders_page:
            nomes = ", ".join(r.title for r in reminders_page[:5])
            response_text = f"Você tem {total_reminders} lembrete(s) ativo(s): {nomes}."
            if len(reminders_page) > 5:
                response_text += f" E mais {len(reminders_page) - 5}..."
            if total_reminders > 20:
                response_text += f" (mostrando os primeiros 20 de {total_reminders})"
        else:
            response_text = "Você não tem lembretes ativos no momento."

    # ── DELETAR_LEMBRETE ──
    elif intent == "DELETAR_LEMBRETE":
        titulo_busca = dados.get("titulo_busca", "")
        candidates = await find_reminders_for_deletion(db, user.id, titulo_busca)

        if not candidates:
            response_text = f"Não encontrei nenhum lembrete com '{titulo_busca}' para deletar."
            action = {"type": "reminder_deleted", "reminder_id": None, "reminder_title": titulo_busca}
        elif len(candidates) == 1:
            reminder = candidates[0]
            await delete_reminder(db, reminder)
            action = {
                "type": "reminder_deleted",
                "reminder_id": reminder.id,
                "reminder_title": reminder.title,
            }
            response_text = f"Lembrete '{reminder.title}' deletado com sucesso."
        else:
            action = {
                "type": "ambiguous",
                "candidates": [ReminderOut.from_orm(r).model_dump() for r in candidates],
            }
            nomes = ", ".join(f"'{r.title}'" for r in candidates)
            response_text = f"Encontrei mais de um lembrete: {nomes}. Qual você quer deletar?"

    # ── CHAT_GERAL ──
    else:
        intent = "CHAT_GERAL"
        history = await _get_recent_history(db, user.id)
        try:
            response_text, model_used = await chat_general(payload.content, history)
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"detail": "Serviço de IA temporariamente indisponível.", "code": "AI_UNAVAILABLE"},
            ) from e
        action = None

    await _save_history(db, user.id, "assistant", response_text, intent=intent, model_used=model_used)

    return MessageResponse(
        message_id=message_id,
        response=response_text,
        intent=intent,
        action=action,
        model_used=model_used,
    )
