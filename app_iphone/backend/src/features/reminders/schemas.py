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


class ReminderOut(BaseModel):
    id: str
    title: str
    next_execution: str
    recurrence: str | None
    recurrence_str: str | None
    days_of_week: list[int] | None = None
    end_date: str | None
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


class ReminderCreate(BaseModel):
    title: str
    scheduled_time: str  # ISO 8601
    recurrence: str | None = "once"
    days_of_week: list[int] | None = None


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
