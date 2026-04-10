from pydantic import BaseModel


class ReminderOut(BaseModel):
    id: str
    title: str
    next_execution: str
    recurrence: str | None
    recurrence_str: str | None
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
            end_date=reminder.end_date,
            is_active=bool(reminder.is_active),
            created_at=reminder.created_at,
        )


class ReminderListResponse(BaseModel):
    reminders: list[ReminderOut]
    total: int
    limit: int
    offset: int


class ReminderDeleteResponse(BaseModel):
    id: str
    title: str
    deleted: bool = True


class ScheduledExecution(BaseModel):
    id: str
    title: str
    recurrence_str: str | None
    is_active: bool
    scheduled_executions: list[str]


class SyncResponse(BaseModel):
    synced_at: str
    reminders: list[ScheduledExecution]
