"""
Message orchestration service.
Classifies intent via Gemini → executes action → saves history → returns response.
"""

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from src.ai.gemini_client import chat_general, classify_intent
from src.features.messages.schemas import MessageRequest, MessageResponse
from src.features.reminders.repository import (
    delete_reminder,
    get_active_reminders_for_user,
    search_reminders_by_title,
)
from src.features.reminders.service import create_reminder_from_data, find_reminders_for_deletion, update_reminder
from src.features.reminders.schemas import ReminderUpdate
from src.features.reminders.schemas import ReminderOut
from src.features.push.sender import fetch_expo_tokens, fire_push
from src.models.models import ChatHistory, User


# Título/corpo do push de "fora do app". Só para ações que valem um aviso quando
# o usuário não está olhando (criou/editou/removeu lembrete, ou uma pergunta da
# IA). Chat comum não vira push. O TÍTULO segue o idioma do app (o cliente manda
# `lang`); o corpo é o título do lembrete (conteúdo do usuário, não traduz).
_PUSH_TITLES = {
    "pt": {
        "reminder_created": "Lembrete criado",
        "reminder_updated": "Lembrete atualizado",
        "reminder_deleted": "Lembrete removido",
    },
    "en": {
        "reminder_created": "Reminder created",
        "reminder_updated": "Reminder updated",
        "reminder_deleted": "Reminder deleted",
    },
}
_PUSH_MSG_TITLE = {"pt": "Nova mensagem", "en": "New message"}
_PUSH_MSG_FALLBACK = {"pt": "Toque para responder", "en": "Tap to reply"}


def _push_text(
    action: dict[str, Any] | None, response_text: str, lang: str | None
) -> tuple[str, str] | None:
    lng = "en" if str(lang or "pt").lower().startswith("en") else "pt"
    tipo = (action or {}).get("type")
    primeira_linha = (response_text or "").split("\n")[0].strip()
    if tipo in _PUSH_TITLES[lng]:
        reminder = (action or {}).get("reminder") or {}
        body = reminder.get("title") or primeira_linha
        return _PUSH_TITLES[lng][tipo], body
    if tipo in ("needs_time_clarification", "ambiguous"):
        return _PUSH_MSG_TITLE[lng], primeira_linha or _PUSH_MSG_FALLBACK[lng]
    return None


async def _save_history(
    db: AsyncSession,
    user_id: str,
    role: str,
    content: str,
    intent: str | None = None,
    model_used: str | None = None,
    session_id: str | None = None,
) -> None:
    entry = ChatHistory(
        id=str(uuid.uuid4()),
        user_id=user_id,
        role=role,
        content=content,
        intent=intent,
        model_used=model_used,
        session_id=session_id,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    db.add(entry)
    await db.flush()


async def _get_recent_history(
    db: AsyncSession,
    user_id: str,
    session_id: str | None = None,
) -> list[dict[str, str]]:
    from sqlalchemy import select
    from src.models.models import ChatHistory as CH
    stmt = select(CH).where(CH.user_id == user_id)
    # Contexto por sessão: cada abertura do app é uma sessão nova. Sem session_id
    # (cliente antigo) cai no comportamento anterior (janela global do usuário).
    if session_id:
        stmt = stmt.where(CH.session_id == session_id)
    result = await db.execute(stmt.order_by(CH.created_at.desc()).limit(10))
    rows = list(result.scalars().all())
    rows.reverse()
    return [{"role": r.role, "content": r.content} for r in rows]


async def process_message(
    db: AsyncSession,
    user: User,
    payload: MessageRequest,
) -> MessageResponse:
    message_id = str(uuid.uuid4())

    # ── Idempotência ──────────────────────────────────────────────────────────
    # Se o cliente mandou um client_message_id e já processamos essa mensagem
    # (mesmo id), devolve o resultado guardado SEM recriar o lembrete. É isto que
    # impede o duplicado quando a fila offline reenvia uma mensagem cuja resposta
    # se perdeu (app foi pro background ao enviar).
    cid = payload.client_message_id
    if cid:
        cached = (
            await db.execute(
                text(
                    "SELECT response_json FROM message_idempotency "
                    "WHERE user_id = :u AND client_message_id = :c"
                ),
                {"u": user.id, "c": cid},
            )
        ).first()
        if cached and cached[0]:
            return MessageResponse(**json.loads(cached[0]))

    # Buscar histórico ANTES de salvar a mensagem atual para não duplicar
    history = await _get_recent_history(db, user.id, payload.session_id)

    await _save_history(db, user.id, "user", payload.content, session_id=payload.session_id)
    chat_task: asyncio.Task | None = asyncio.create_task(
        chat_general(payload.content, history)
    )

    try:
        classification = await classify_intent(
            user_message=payload.content,
            current_datetime=payload.client_timestamp,
            hour_format=payload.hour_format,
            history=history,
        )
    except Exception as e:
        if chat_task and not chat_task.done():
            chat_task.cancel()
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"detail": "Serviço de IA temporariamente indisponível.", "code": "AI_UNAVAILABLE"},
        ) from e

    intent: str = classification.get("intencao", "CHAT_GERAL")
    dados: dict[str, Any] = classification.get("dados", {})
    model_used: str = classification.get("_model_used", "unknown")
    action: dict[str, Any] | None = None
    response_text: str = ""

    # Cancelar chat especulativo se a intenção não for CHAT_GERAL
    if intent != "CHAT_GERAL" and chat_task and not chat_task.done():
        chat_task.cancel()

    # ── CRIAR_LEMBRETE com horário ambíguo (12h sem AM/PM) → pede esclarecimento ──
    if intent == "CRIAR_LEMBRETE" and dados.get("precisa_ampm"):
        hora = (dados.get("hora_ambigua") or "").strip()
        hora_label = (hora.split(":")[0] + "h") if hora else "esse horário"
        base = payload.content
        action = {
            "type": "needs_time_clarification",
            "hora": hora,
            "options": [
                {"label": f"{hora_label} da manhã", "resend": f"{base} (esclarecendo: é de manhã, AM)"},
                {"label": f"{hora_label} da noite", "resend": f"{base} (esclarecendo: é da noite, PM)"},
            ],
        }
        response_text = f"Esse horário ({hora_label}) é de manhã ou à noite?"

    # ── CRIAR_LEMBRETE sem horário → pede o horário (em vez de chutar +1h) ──
    elif intent == "CRIAR_LEMBRETE" and not (dados.get("data_hora") or "").strip():
        titulo = (dados.get("titulo") or "").strip()
        action = {
            "type": "needs_time_clarification",
            "reason": "no_time",
            "titulo": titulo,
            "options": [],
        }
        alvo = f"'{titulo}'" if titulo else "esse lembrete"
        response_text = f"Pra quando é {alvo}? Me diz o horário (ex: hoje às 18h30)."

    # ── CRIAR_LEMBRETE ──
    elif intent == "CRIAR_LEMBRETE":
        try:
            reminder = await create_reminder_from_data(db, user.id, dados)
            action = {
                "type": "reminder_created",
                "reminder": ReminderOut.from_orm(reminder).model_dump(),
            }
            proxima_execucao_dt = datetime.fromisoformat(reminder.next_execution)
            if proxima_execucao_dt.tzinfo is None:
                proxima_execucao_dt = proxima_execucao_dt.replace(tzinfo=timezone.utc)
            try:
                client_dt = datetime.fromisoformat(payload.client_timestamp)
                if client_dt.tzinfo is not None:
                    proxima_execucao_dt = proxima_execucao_dt.astimezone(client_dt.tzinfo)
            except Exception:
                pass
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

    # ── EDITAR_LEMBRETE ──
    elif intent == "EDITAR_LEMBRETE":
        titulo_busca = dados.get("titulo_busca", "")
        candidates = await find_reminders_for_deletion(db, user.id, titulo_busca)

        if not candidates:
            response_text = f"Não encontrei nenhum lembrete com '{titulo_busca}' para editar."
            action = {"type": "reminder_not_found", "titulo_busca": titulo_busca}
        elif len(candidates) > 1:
            action = {
                "type": "ambiguous",
                "candidates": [ReminderOut.from_orm(r).model_dump() for r in candidates],
            }
            nomes = ", ".join(f"'{r.title}'" for r in candidates)
            response_text = f"Encontrei mais de um lembrete: {nomes}. Qual você quer editar?"
        else:
            reminder = candidates[0]
            patch = ReminderUpdate(
                title=dados.get("novo_titulo"),
                scheduled_time=dados.get("nova_data_hora"),
            )
            try:
                updated = await update_reminder(db, reminder.id, user.id, patch)
                action = {
                    "type": "reminder_updated",
                    "reminder": updated.model_dump(),
                }
                try:
                    client_dt = datetime.fromisoformat(payload.client_timestamp)
                    exec_dt = datetime.fromisoformat(updated.next_execution)
                    if exec_dt.tzinfo is None:
                        exec_dt = exec_dt.replace(tzinfo=timezone.utc)
                    if client_dt.tzinfo is not None:
                        exec_dt = exec_dt.astimezone(client_dt.tzinfo)
                    exec_fmt = exec_dt.strftime("%d/%m/%Y às %H:%M")
                except Exception:
                    exec_fmt = updated.next_execution
                response_text = f"Lembrete atualizado!\n{updated.title.upper()}\ndata: {exec_fmt}"
            except Exception as e:
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail={"detail": "Erro ao editar lembrete.", "code": "INTERNAL_ERROR"},
                ) from e

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
        try:
            response_text, model_used = await chat_task
        except Exception as e:
            raise HTTPException(
                status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                detail={"detail": "Serviço de IA temporariamente indisponível.", "code": "AI_UNAVAILABLE"},
            ) from e
        action = None

    await _save_history(db, user.id, "assistant", response_text, intent=intent, model_used=model_used, session_id=payload.session_id)

    response = MessageResponse(
        message_id=message_id,
        response=response_text,
        intent=intent,
        action=action,
        model_used=model_used,
    )

    # Guarda o resultado para reenvios idempotentes (INSERT OR IGNORE: se dois
    # reenvios correrem juntos, o primeiro fica; o segundo lê o cache no topo).
    if cid:
        await db.execute(
            text(
                "INSERT OR IGNORE INTO message_idempotency "
                "(user_id, client_message_id, response_json, created_at) "
                "VALUES (:u, :c, :j, :t)"
            ),
            {
                "u": user.id,
                "c": cid,
                "j": response.model_dump_json(),
                "t": datetime.now(timezone.utc).isoformat(),
            },
        )

    # Commit explícito antes de retornar: garante que o reminder já está no banco
    # quando o app chamar /sync imediatamente após receber a resposta.
    await db.commit()

    # Push de fora do app (best-effort). Busca os tokens do usuário AGORA (dentro
    # da requisição) e dispara sem bloquear a resposta. Se não há token registrado
    # (build ainda sem push), não faz nada.
    push = _push_text(action, response_text, payload.lang)
    if push:
        try:
            tokens = await fetch_expo_tokens(db, user.id)
            data: dict[str, Any] = {}
            rem = (action or {}).get("reminder") or {}
            if rem.get("id"):
                data = {"reminderId": rem["id"]}
            fire_push(tokens, push[0], push[1], data)
        except Exception:  # noqa: BLE001 — push nunca derruba a resposta
            pass

    return response
