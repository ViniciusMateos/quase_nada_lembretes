import json
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
    save_reminder,
    search_reminders_by_title,
)
from src.features.reminders.schemas import (
    ReminderCreate,
    ReminderDeleteResponse,
    ReminderListResponse,
    ReminderOut,
    ReminderUpdate,
    ScheduledExecution,
    SyncResponse,
)
from src.models.models import Reminder

# Fuso de Brasília fixo (UTC-3). O Brasil não usa horário de verão desde 2019,
# então o offset fixo é correto e dispensa tzdata no servidor. TODO cálculo de
# "dia da semana" e "a hora já passou hoje?" precisa ser feito neste fuso —
# fazer em UTC desloca o dia quando o horário cruza a meia-noite UTC (era por
# isso que "seg a sex" começava na terça).
BRT = timezone(timedelta(hours=-3))


def _normalize(text: str) -> str:
    return text.lower().strip()


def _pre_to_storage(items) -> str | None:
    """Normaliza os pré-lembretes (dicts do app ou ints legados da IA) → JSON.
    Cada item: {"type":"offset","seconds":N} ou {"type":"day","days":D,"hour":H,"minute":M}."""
    if not isinstance(items, list) or not items:
        return None
    out = []
    for it in items:
        if isinstance(it, (int, float)) and int(it) > 0:
            out.append({"type": "offset", "seconds": int(it)})
        elif isinstance(it, dict):
            t = it.get("type")
            if t == "offset" and int(it.get("seconds", 0)) > 0:
                out.append({"type": "offset", "seconds": int(it["seconds"])})
            elif t == "day":
                out.append({
                    "type": "day",
                    "days": max(0, int(it.get("days", 1))),
                    "hour": int(it.get("hour", 9)) % 24,
                    "minute": int(it.get("minute", 0)) % 60,
                })
    return json.dumps(out) if out else None


def _pre_specs(value) -> list[dict]:
    """Parseia o pre_reminders do banco (JSON novo ou CSV legado de segundos)."""
    if not value:
        return []
    s = str(value).strip()
    if s.startswith("["):
        try:
            raw = json.loads(s)
        except Exception:
            raw = []
    else:
        raw = [int(p) for p in s.split(",") if p.strip().isdigit() and int(p) > 0]
    out = []
    for it in raw if isinstance(raw, list) else []:
        if isinstance(it, (int, float)) and int(it) > 0:
            out.append({"type": "offset", "seconds": int(it)})
        elif isinstance(it, dict) and it.get("type") == "offset" and int(it.get("seconds", 0)) > 0:
            out.append({"type": "offset", "seconds": int(it["seconds"])})
        elif isinstance(it, dict) and it.get("type") == "day":
            out.append({
                "type": "day",
                "days": max(0, int(it.get("days", 1))),
                "hour": int(it.get("hour", 9)) % 24,
                "minute": int(it.get("minute", 0)) % 60,
            })
    return out


_DIAS_ABREV = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"]


def _today_at_time(base: datetime, now: datetime) -> datetime:
    """Hoje (no fuso de Brasília) com a hora/minuto de `base`, devolvido em UTC."""
    base_brt = base.astimezone(BRT)
    cand_brt = now.astimezone(BRT).replace(
        hour=base_brt.hour, minute=base_brt.minute, second=0, microsecond=0
    )
    return cand_brt.astimezone(timezone.utc)


def _align_first_occurrence(
    recurrence: str | None,
    base: datetime,
    days: list[int],
    interval_seconds: int | None,
    now: datetime,
) -> datetime:
    """
    Primeira execução FUTURA de um lembrete, calculada no fuso de Brasília.

    `base` carrega o horário desejado (hora/minuto). A regra geral: se o horário
    de hoje ainda não passou e o dia é válido, dispara HOJE; senão avança para a
    próxima ocorrência válida. Cobre todos os tipos de recorrência.
    """
    if not recurrence or recurrence == "once":
        nxt = base
        while nxt <= now:
            nxt += timedelta(days=1)
        return nxt

    if recurrence == "weekly_days":
        ds = set(days or [])
        if not ds:
            return base
        cand = _today_at_time(base, now)
        for _ in range(8):
            if cand > now and cand.astimezone(BRT).weekday() in ds:
                return cand
            cand += timedelta(days=1)
        return cand

    if recurrence == "daily":
        cand = _today_at_time(base, now)
        if cand <= now:
            cand += timedelta(days=1)
        return cand

    if recurrence == "interval_seconds":
        step = interval_seconds or 0
        if step <= 0:
            return base
        nxt = base
        while nxt <= now:
            nxt += timedelta(seconds=step)
        return nxt

    if recurrence == "weekly":
        nxt = base
        while nxt <= now:
            nxt += timedelta(weeks=1)
        return nxt

    if recurrence in ("monthly", "day_of_month"):
        nxt = base
        while nxt <= now:
            nxt += timedelta(days=30)
        return nxt

    return base


def _parse_days(value) -> list[int]:
    """Aceita lista de ints/strings ou CSV ('0,1,2') → lista ordenada de ints 0..6."""
    if value is None:
        return []
    if isinstance(value, str):
        parts = [p.strip() for p in value.split(",") if p.strip() != ""]
    elif isinstance(value, (list, tuple)):
        parts = value
    else:
        return []
    out: set[int] = set()
    for p in parts:
        try:
            n = int(p)
        except (ValueError, TypeError):
            continue
        if 0 <= n <= 6:
            out.add(n)
    return sorted(out)


def _weekly_days_label(days: list[int]) -> str:
    """Rótulo legível em PT-BR para um conjunto de dias da semana."""
    s = set(days)
    if not s:
        return "Dias da semana"
    if s == {0, 1, 2, 3, 4}:
        return "Dias úteis"
    if s == {5, 6}:
        return "Fim de semana"
    if len(s) == 7:
        return "Todos os dias"
    ordered = sorted(s)
    # contíguo? -> "Seg–Sex"
    if len(ordered) >= 3 and ordered == list(range(ordered[0], ordered[-1] + 1)):
        return f"{_DIAS_ABREV[ordered[0]]}–{_DIAS_ABREV[ordered[-1]]}"
    return ", ".join(_DIAS_ABREV[d] for d in ordered)


def _interval_label(seconds: int | None) -> str:
    if not seconds:
        return "Intervalo"
    if seconds % 86400 == 0:
        d = seconds // 86400
        return f"A cada {d} dia{'s' if d > 1 else ''}"
    if seconds % 3600 == 0:
        h = seconds // 3600
        return f"A cada {h}h"
    if seconds % 60 == 0:
        m = seconds // 60
        return f"A cada {m}min"
    return f"A cada {seconds}s"


def _recurrence_label(
    recurrence: str | None, days: list[int], interval_seconds: int | None
) -> str:
    mapping = {
        "once": "Único",
        "daily": "Diariamente",
        "weekly": "Semanalmente",
        "monthly": "Mensalmente",
        "day_of_month": "Todo mês neste dia",
        "interval_seconds": _interval_label(interval_seconds),
        "weekly_days": _weekly_days_label(days),
    }
    return mapping.get(recurrence or "once", recurrence or "Único")


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
    elif recurrence == "weekly_days":
        days = _parse_days(reminder.days_of_week)
        if not days:
            return None
        # próximo dia (após from_datetime) cujo weekday ∈ days, mesma hora/min.
        # weekday avaliado em BRT — em UTC o dia escorrega quando o horário
        # cruza a meia-noite UTC.
        next_dt = from_datetime + timedelta(days=1)
        for _ in range(7):
            if next_dt.astimezone(BRT).weekday() in days:
                break
            next_dt += timedelta(days=1)
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

    # Pré-lembretes: offset ("X antes") ou "dia anterior às HH:MM".
    pre_specs = _pre_specs(getattr(reminder, "pre_reminders", None))

    mains: list[datetime] = []
    current = next_exec
    while len(mains) < max_per_reminder:
        if current > horizon_end:
            break
        if end_date and current > end_date:
            break
        if current >= now:
            mains.append(current)

        next_dt = calcular_proxima_execucao(reminder, current)
        if next_dt is None:
            break
        current = next_dt

    # Junta execuções principais + pré-avisos, dedup e ordena.
    all_dts: set[datetime] = set(mains)
    for m in mains:
        for spec in pre_specs:
            if spec["type"] == "offset":
                pre = m - timedelta(seconds=spec["seconds"])
            else:  # "day": às H:M, D dias antes do disparo, no fuso de Brasília
                m_brt = m.astimezone(BRT) - timedelta(days=spec["days"])
                pre = m_brt.replace(
                    hour=spec["hour"], minute=spec["minute"], second=0, microsecond=0
                ).astimezone(timezone.utc)
            if now <= pre <= horizon_end:
                all_dts.add(pre)

    return [d.isoformat() for d in sorted(all_dts)]


async def list_reminders(
    db: AsyncSession,
    user_id: str,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> ReminderListResponse:
    now = datetime.now(timezone.utc)
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


async def update_reminder(
    db: AsyncSession,
    reminder_id: str,
    user_id: str,
    data: ReminderUpdate,
) -> ReminderOut:
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

    now = datetime.now(timezone.utc)
    update_values: dict = {"updated_at": now.isoformat()}

    if data.title is not None:
        update_values["title"] = data.title
        update_values["title_normalized"] = _normalize(data.title)

    if data.pre_reminders is not None:
        update_values["pre_reminders"] = _pre_to_storage(data.pre_reminders)

    # Horário base: scheduled_time enviado nesta edição, senão o next_execution atual.
    if data.scheduled_time is not None:
        try:
            base = datetime.fromisoformat(data.scheduled_time)
            base = base.replace(tzinfo=timezone.utc) if base.tzinfo is None else base.astimezone(timezone.utc)
        except ValueError:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={"detail": "Formato de data inválido. Use ISO 8601.", "code": "INVALID_DATE"},
            )
    else:
        base = datetime.fromisoformat(reminder.next_execution)
        if base.tzinfo is None:
            base = base.replace(tzinfo=timezone.utc)

    # Recorrência final = o que veio na edição, senão o estado atual. Permite:
    #   - tornar recorrente: recurrence="weekly_days"/"daily"/etc (+ days/interval)
    #   - remover recorrência: recurrence="once" (limpa dias/intervalo, vira pontual)
    #   - só mudar horário/dias: mantém o tipo atual e recalcula
    recurrence = data.recurrence if data.recurrence is not None else (reminder.recurrence or "once")
    days = _parse_days(data.days_of_week) if data.days_of_week is not None else _parse_days(reminder.days_of_week)
    interval = data.interval_seconds if data.interval_seconds is not None else reminder.interval_seconds

    if recurrence == "weekly_days" and not days:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"detail": "Selecione ao menos um dia da semana.", "code": "NO_DAYS"},
        )
    if recurrence == "interval_seconds" and not interval:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={"detail": "Informe o intervalo da recorrência.", "code": "NO_INTERVAL"},
        )

    # Recalcula o agendamento sempre que algo que o afeta muda.
    schedule_changed = (
        data.scheduled_time is not None
        or data.recurrence is not None
        or data.days_of_week is not None
        or data.interval_seconds is not None
    )
    if schedule_changed:
        next_exec = _align_first_occurrence(recurrence, base, days, interval, now)
        update_values["recurrence"] = recurrence
        update_values["recurrence_str"] = _recurrence_label(recurrence, days, interval)
        update_values["days_of_week"] = (
            ",".join(str(d) for d in days) if recurrence == "weekly_days" and days else None
        )
        update_values["interval_seconds"] = interval if recurrence == "interval_seconds" else None
        update_values["next_execution"] = next_exec.isoformat()
        update_values["is_active"] = 1

    await db.execute(
        update(Reminder)
        .where(Reminder.id == reminder_id, Reminder.user_id == user_id)
        .values(**update_values)
    )
    await db.commit()

    updated = await get_reminder_by_id(db, reminder_id)
    return ReminderOut.from_orm(updated)


async def sync_reminders(
    db: AsyncSession,
    user_id: str,
    horizon_days: int = 30,
    max_per_reminder: int = 10,
) -> SyncResponse:
    now = datetime.now(timezone.utc)
    # Grace period: só desativa 'once' que venceu há mais de 5 minutos.
    # Evita matar lembretes recém-criados antes do app agendar a notificação local.
    grace_cutoff = (now - timedelta(minutes=5)).isoformat()

    await db.execute(
        update(Reminder)
        .where(
            Reminder.user_id == user_id,
            Reminder.recurrence == "once",
            Reminder.next_execution < grace_cutoff,
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
            recurrence=r.recurrence,
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
            next_exec = next_exec.astimezone(timezone.utc)
    else:
        next_exec = now + timedelta(hours=1)

    recurrence = dados.get("recorrencia") or "once"
    interval_seconds = dados.get("interval_seconds")
    end_date_raw = dados.get("data_fim")
    titulo = dados.get("titulo", "Sem título")
    days = _parse_days(dados.get("days_of_week"))
    days_csv = ",".join(str(d) for d in days) if days else None
    pre_csv = _pre_to_storage(dados.get("pre_lembretes"))

    recurrence_str = _recurrence_label(recurrence, days, interval_seconds)

    reminder = Reminder(
        id=str(uuid.uuid4()),
        user_id=user_id,
        title=titulo,
        title_normalized=_normalize(titulo),
        next_execution=next_exec.isoformat(),
        interval_seconds=interval_seconds,
        recurrence=recurrence,
        recurrence_str=recurrence_str,
        days_of_week=days_csv,
        pre_reminders=pre_csv,
        end_date=end_date_raw,
        is_active=1,
        created_at=now_iso,
        updated_at=now_iso,
    )

    # Alinha a 1ª execução à próxima ocorrência futura no fuso de Brasília
    # (hoje se a hora ainda não passou e o dia é válido; senão avança). Cobre
    # todos os tipos, incluindo o caso comum de só um horário que já passou hoje.
    next_exec = _align_first_occurrence(
        recurrence, next_exec, days, interval_seconds, now
    )
    reminder.next_execution = next_exec.isoformat()

    return await create_reminder(db, reminder)


async def create_reminder_api(
    db: AsyncSession,
    user_id: str,
    data: "ReminderCreate",
) -> ReminderOut:
    """Criação direta de lembrete (usado pelo adiar de pontuais e por integrações)."""
    dados: dict[str, Any] = {
        "titulo": data.title,
        "data_hora": data.scheduled_time,
        "recorrencia": data.recurrence or "once",
    }
    if data.days_of_week:
        dados["days_of_week"] = data.days_of_week
    if data.pre_reminders:
        dados["pre_lembretes"] = data.pre_reminders
    reminder = await create_reminder_from_data(db, user_id, dados)
    await db.commit()
    fresh = await get_reminder_by_id(db, reminder.id)
    return ReminderOut.from_orm(fresh)


async def find_reminders_for_deletion(
    db: AsyncSession,
    user_id: str,
    titulo_busca: str,
) -> list[Reminder]:
    return await search_reminders_by_title(db, user_id, titulo_busca)
