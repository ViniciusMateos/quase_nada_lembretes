from pydantic import BaseModel


class TaskOut(BaseModel):
    id: str
    name: str
    priority: str
    notes: str | None
    completed: bool
    week_key: str
    completed_week_key: str | None
    order_index: int | None = None
    created_at: str

    @classmethod
    def from_orm(cls, task) -> "TaskOut":
        return cls(
            id=task.id,
            name=task.name,
            priority=task.priority,
            notes=task.notes,
            completed=bool(task.completed),
            week_key=task.week_key,
            completed_week_key=task.completed_week_key,
            order_index=getattr(task, "order_index", None),
            created_at=task.created_at,
        )


class TaskListResponse(BaseModel):
    tasks: list[TaskOut]


class TaskCreate(BaseModel):
    name: str
    priority: str = "medium"
    notes: str | None = None
    week_key: str  # chave ISO da semana, ex: "2026-W25"


class TaskUpdate(BaseModel):
    name: str | None = None
    priority: str | None = None
    notes: str | None = None
    completed: bool | None = None
    # Semana de referência atual — usada para gravar completed_week_key ao concluir
    # (regra de carry-over). None = não alterar.
    week_key: str | None = None
    # Posição manual dentro do grupo da mesma prioridade (drag-reorder).
    order_index: int | None = None


class TaskDeleteResponse(BaseModel):
    id: str
    deleted: bool = True
