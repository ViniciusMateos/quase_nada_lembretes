import json

from pydantic import BaseModel


def _parse_days_csv(value) -> list[int] | None:
    if not value:
        return None
    out: list[int] = []
    for p in str(value).split(","):
        p = p.strip()
        if p.isdigit() and 0 <= int(p) <= 6:
            out.append(int(p))
    return out or None


def _parse_pre(value) -> list[dict] | None:
    """
    Pré-lembretes armazenados como JSON de objetos. Cada item é:
      {"type": "offset", "seconds": N}                 -> N segundos antes
      {"type": "day", "days": D, "hour": H, "minute": M} -> às H:M, D dias antes
    Compat: aceita também o formato legado (CSV de segundos = offsets).
    """
    if not value:
        return None
    s = str(value).strip()
    raw = []
    if s.startswith("["):
        try:
            raw = json.loads(s)
        except Exception:
            raw = []
    else:  # legado: CSV de offsets em segundos
        raw = [int(p) for p in s.split(",") if p.strip().isdigit() and int(p) > 0]
    out: list[dict] = []
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
    return out or None


class ReminderOut(BaseModel):
    id: str
    title: str
    next_execution: str
    recurrence: str | None
    recurrence_str: str | None
    days_of_week: list[int] | None = None
    interval_seconds: int | None = None
    end_date: str | None
    # Pré-lembretes: lista de objetos (offset OU dia anterior às HH:MM).
    pre_reminders: list[dict] | None = None
    is_active: bool
    created_at: str

    @classmethod
    def from_orm(cls, reminder) -> "ReminderOut":
        return cls(
            id=reminder.id,
            title=reminder.title,
            next_execution=reminder.next_execution,
            recurrence=reminder.recurrence,
            recurrence_str=reminder.recurrence_str,
            days_of_week=_parse_days_csv(getattr(reminder, "days_of_week", None)),
            interval_seconds=getattr(reminder, "interval_seconds", None),
            pre_reminders=_parse_pre(getattr(reminder, "pre_reminders", None)),
            end_date=reminder.end_date,
            is_active=bool(reminder.is_active),
            created_at=reminder.created_at,
        )


class ReminderListResponse(BaseModel):
    reminders: list[ReminderOut]
    total: int
    limit: int
    offset: int


class ReminderUpdate(BaseModel):
    title: str | None = None
    scheduled_time: str | None = None
    # lista de dias 0..6 (Seg..Dom) p/ lembretes weekly_days; None = não alterar
    days_of_week: list[int] | None = None
    # tipo de recorrência: once | daily | weekly | weekly_days | monthly |
    # day_of_month | interval_seconds. "once" remove a recorrência. None = não alterar.
    recurrence: str | None = None
    # intervalo em segundos p/ recurrence=interval_seconds; None = não alterar
    interval_seconds: int | None = None
    # pré-lembretes (lista de objetos); [] limpa, None = não alterar
    pre_reminders: list[dict] | None = None


class ReminderCreate(BaseModel):
    title: str
    scheduled_time: str  # ISO 8601
    recurrence: str | None = "once"
    days_of_week: list[int] | None = None
    # pré-lembretes: lista de objetos (offset OU dia anterior às HH:MM)
    pre_reminders: list[dict] | None = None


class ReminderDeleteResponse(BaseModel):
    id: str
    title: str
    deleted: bool = True


class ScheduledExecution(BaseModel):
    id: str
    title: str
    recurrence: str | None = None
    recurrence_str: str | None
    is_active: bool
    scheduled_executions: list[str]


class SyncResponse(BaseModel):
    synced_at: str
    reminders: list[ScheduledExecution]
