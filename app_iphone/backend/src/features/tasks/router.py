from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.features.tasks.schemas import (
    TaskCreate,
    TaskDeleteResponse,
    TaskListResponse,
    TaskOut,
    TaskUpdate,
)
from src.features.tasks.service import (
    create_task_api,
    list_tasks,
    remove_task,
    update_task_api,
)
from src.models.models import User

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse, status_code=status.HTTP_200_OK)
async def get_tasks(
    week: str = Query(..., description="Chave ISO da semana, ex: 2026-W25"),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskListResponse:
    return await list_tasks(db, current_user.id, week)


@router.post("", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
async def create_task_endpoint(
    payload: TaskCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    return await create_task_api(db, current_user.id, payload)


@router.patch("/{task_id}", response_model=TaskOut, status_code=status.HTTP_200_OK)
async def update_task_endpoint(
    task_id: str,
    payload: TaskUpdate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskOut:
    return await update_task_api(db, task_id, current_user.id, payload)


@router.delete("/{task_id}", response_model=TaskDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_task_endpoint(
    task_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> TaskDeleteResponse:
    return await remove_task(db, task_id, current_user.id)
