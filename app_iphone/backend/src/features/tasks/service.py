import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.features.tasks.repository import (
    create_task,
    delete_task,
    get_task_by_id,
    get_tasks_for_week,
)
from src.features.tasks.schemas import (
    TaskCreate,
    TaskDeleteResponse,
    TaskListResponse,
    TaskOut,
    TaskUpdate,
)
from src.models.models import Task

VALID_PRIORITIES = {"high", "medium", "low"}
_PRIORITY_ORDER = {"high": 1, "medium": 2, "low": 3}


def _clean_priority(value: str | None, fallback: str = "medium") -> str:
    return value if value in VALID_PRIORITIES else fallback


def _sort_key(t):
    # Não-concluídas primeiro, depois por prioridade, depois pela ordem manual
    # (order_index; NULL vai pro fim), e por fim created_at como desempate estável.
    oi = t.order_index if t.order_index is not None else 1_000_000_000
    return (bool(t.completed), _PRIORITY_ORDER.get(t.priority, 9), oi, t.created_at)


async def list_tasks(db: AsyncSession, user_id: str, week_key: str) -> TaskListResponse:
    tasks = await get_tasks_for_week(db, user_id, week_key)
    tasks.sort(key=_sort_key)
    return TaskListResponse(tasks=[TaskOut.from_orm(t) for t in tasks])


async def create_task_api(db: AsyncSession, user_id: str, data: TaskCreate) -> TaskOut:
    now = datetime.now(timezone.utc).isoformat()
    task = Task(
        id=str(uuid.uuid4()),
        user_id=user_id,
        name=data.name,
        priority=_clean_priority(data.priority),
        notes=data.notes,
        completed=0,
        week_key=data.week_key,
        completed_week_key=None,
        created_at=now,
        updated_at=now,
    )
    task = await create_task(db, task)
    return TaskOut.from_orm(task)


async def _get_owned_task(db: AsyncSession, task_id: str, user_id: str) -> Task:
    task = await get_task_by_id(db, task_id)
    if not task:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail={"detail": "Tarefa não encontrada.", "code": "TASK_NOT_FOUND"},
        )
    if task.user_id != user_id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail={"detail": "Esta tarefa não pertence a você.", "code": "NOT_YOUR_TASK"},
        )
    return task


async def update_task_api(
    db: AsyncSession, task_id: str, user_id: str, data: TaskUpdate
) -> TaskOut:
    task = await _get_owned_task(db, task_id, user_id)

    if data.name is not None:
        task.name = data.name
    if data.priority is not None:
        task.priority = _clean_priority(data.priority, task.priority)
    if data.notes is not None:
        task.notes = data.notes
    if data.completed is not None:
        task.completed = 1 if data.completed else 0
        # Ao concluir, fixa a semana da conclusão (referência atual; senão a da
        # própria tarefa) para a regra de carry-over. Ao reabrir, limpa.
        task.completed_week_key = (data.week_key or task.week_key) if data.completed else None
    if data.order_index is not None:
        task.order_index = data.order_index

    task.updated_at = datetime.now(timezone.utc).isoformat()
    await db.flush()
    await db.refresh(task)
    return TaskOut.from_orm(task)


async def remove_task(db: AsyncSession, task_id: str, user_id: str) -> TaskDeleteResponse:
    task = await _get_owned_task(db, task_id, user_id)
    await delete_task(db, task)
    return TaskDeleteResponse(id=task_id, deleted=True)
