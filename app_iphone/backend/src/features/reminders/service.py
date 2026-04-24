import uuid
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.reminders.repository import (
    create_reminder,
    delete_reminder,
    get_active_reminders_for_user,
    get_reminder_by_id,
    get_reminders_by_user,
    search_reminders_by_title,
)
from src.features.reminders.schemas import (
    ReminderDeleteResponse,
    ReminderListResponse,
    ReminderOut,
    ScheduledExecution,
    SyncResponse,
)
from src.models.models import Reminder


def _normalize(text: str) -> str:
    return text.lower().strip()


def calcular_proxima_execucao(reminder: Reminder, from_datetime: datetime) -> datetime | None:
    """
    Calculate next execution datetime based on recurrence type.
    Returns None if the reminder should be deactivated.
    """
    if not reminder.recurrence or reminder.recurrence == "once":
        return None

    end_date: datetime | None = None
    if reminder.end_date:
        end_date = datetime.fromisoformat(reminder.end_date)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

    recurrence = reminder.recurrence

    if recurrence == "daily":
        next_dt = from_datetime + timedelta(seconds=86400)
    elif recurrence == "weekly":
        next_dt = from_datetime + timedelta(weeks=1)
    elif recurrence == "monthly":
        next_dt = from_datetime + timedelta(days=30)
    elif recurrence == "day_of_month":
        source = from_datetime
        month = source.month + 1
        year = source.year
        if month > 12:
            month = 1
            year += 1
        try:
            next_dt = source.replace(year=year, month=month)
        except ValueError:
            import calendar
            last_day = calendar.monthrange(year, month)[1]
            next_dt = source.replace(year=year, month=month, day=last_day)
    elif recurrence == "interval_seconds" and reminder.interval_seconds:
        next_dt = from_datetime + timedelta(seconds=reminder.interval_seconds)
    else:
        return None

    if end_date and next_dt > end_date:
        return None

    return next_dt


def calcular_execucoes_futuras(
    reminder: Reminder,
    horizon_days: int,
    max_per_reminder: int,
) -> list[str]:
    """
    Generate a list of future ISO 8601 execution timestamps for the /sync endpoint.
    Respects end_date and is_active flag.
    """
    if not reminder.is_active:
        return []

    now = datetime.now(timezone.utc)
    horizon_end = now + timedelta(days=horizon_days)

    end_date: datetime | None = None
    if reminder.end_date:
        end_date = datetime.fromisoformat(reminder.end_date)
        if end_date.tzinfo is None:
            end_date = end_date.replace(tzinfo=timezone.utc)

    next_exec = datetime.fromisoformat(reminder.next_execution)
    if next_exec.tzinfo is None:
        next_exec = next_exec.replace(tzinfo=timezone.utc)

    executions: list[str] = []
    current = next_exec

    while len(executions) < max_per_reminder:
        if current > horizon_end:
            break
        if end_date and current > end_date:
            break
        if current >= now:
            executions.append(current.isoformat())

        next_dt = calcular_proxima_execucao(reminder, current)
        if next_dt is None:
            break
        current = next_dt

    return executions


async def list_reminders(
    db: AsyncSession,
    user_id: str,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> ReminderListResponse:
    reminders, total = await get_reminders_by_user(db, user_id, active_only, limit, offset)
    return ReminderListResponse(
        reminders=[ReminderOut.from_orm(r) for r in reminders],
        total=total,
        limit=limit,
        offset=offset,
    )


async def remove_reminder(
    db: AsyncSession,
    reminder_id: str,
    user_id: str,
) -> ReminderDeleteResponse:
    reminder = await get_reminder_by_id(db, reminder_id)
    if not reminder:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Lembrete não encontrado.", "code": "REMINDER_NOT_FOUND"},
        )
    if reminder.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "Este lembrete não pertence a você.", "code": "NOT_YOUR_REMINDER"},
        )
    title = reminder.title
    await delete_reminder(db, reminder)
    return ReminderDeleteResponse(id=reminder_id, title=title, deleted=True)


async def sync_reminders(
    db: AsyncSession,
    user_id: str,
    horizon_days: int = 30,
    max_per_reminder: int = 10,
) -> SyncResponse:
    now = datetime.now(timezone.utc)

    # Desativa lembretes 'once' cujo horário já passou — evita spam de notificações
    await db.execute(
        update(Reminder)
        .where(
            Reminder.user_id == user_id,
            Reminder.recurrence == "once",
            Reminder.next_execution < now.isoformat(),
            Reminder.is_active == 1,
        )
        .values(is_active=0, updated_at=now.isoformat())
    )
    await db.commit()

    reminders = await get_active_reminders_for_user(db, user_id)
    scheduled = [
        ScheduledExecution(
            id=r.id,
            title=r.title,
            recurrence_str=r.recurrence_str,
            is_active=bool(r.is_active),
            scheduled_executions=calcular_execucoes_futuras(r, horizon_days, max_per_reminder),
        )
        for r in reminders
    ]
    return SyncResponse(
        synced_at=datetime.now(timezone.utc).isoformat(),
        reminders=scheduled,
    )


async def create_reminder_from_data(
    db: AsyncSession,
    user_id: str,
    dados: dict[str, Any],
) -> Reminder:
    """
    Create a Reminder ORM object from AI-extracted data dict and persist it.
    """
    now = datetime.now(timezone.utc)
    now_iso = now.isoformat()

    data_hora_raw = dados.get("data_hora")
    if data_hora_raw:
        next_exec = datetime.fromisoformat(data_hora_raw)
        if next_exec.tzinfo is None:
            next_exec = next_exec.replace(tzinfo=timezone.utc)
    else:
        next_exec = now + timedelta(hours=1)

    recurrence = dados.get("recorrencia") or "once"
    interval_seconds = dados.get("interval_seconds")
    end_date_raw = dados.get("data_fim")
    titulo = dados.get("titulo", "Sem título")

    def _interval_str(seconds: int | None) -> str:
        if not seconds:
            return "Intervalo"
        if seconds % 86400 == 0:
            days = seconds // 86400
            return f"A cada {days} dia{'s' if days > 1 else ''}"
        if seconds % 3600 == 0:
            hours = seconds // 3600
            return f"A cada {hours}h"
        if seconds % 60 == 0:
            mins = seconds // 60
            return f"A cada {mins}min"
        return f"A cada {seconds}s"

    recurrence_map = {
        "once": "Único",
        "daily": "Diariamente",
        "weekly": "Semanalmente",
        "monthly": "Mensalmente",
        "day_of_month": "Todo mês neste dia",
        "interval_seconds": _interval_str(interval_seconds),
    }
    recurrence_str = recurrence_map.get(recurrence, recurrence)

    reminder = Reminder(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=titulo,
        title_normalized=_normalize(titulo),
        next_execution=next_exec.isoformat(),
        interval_seconds=interval_seconds,
        recurrence=recurrence,
        recurrence_str=recurrence_str,
        end_date=end_date_raw,
        is_active=1,
        created_at=now_iso,
        updated_at=now_iso,
    )
    return await create_reminder(db, reminder)


async def find_reminders_for_deletion(
    db: AsyncSession,
    user_id: str,
    titulo_busca: str,
) -> list[Reminder]:
    return await search_reminders_by_title(db, user_id, titulo_busca)
