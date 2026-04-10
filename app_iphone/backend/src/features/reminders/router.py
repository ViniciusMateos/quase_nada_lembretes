from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.features.reminders.schemas import (
    ReminderDeleteResponse,
    ReminderListResponse,
    SyncResponse,
)
from src.features.reminders.service import list_reminders, remove_reminder, sync_reminders
from src.models.models import User

router = APIRouter(prefix="/reminders", tags=["reminders"])


@router.get("", response_model=ReminderListResponse, status_code=status.HTTP_200_OK)
async def get_reminders(
    active_only: bool = Query(default=True),
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReminderListResponse:
    return await list_reminders(db, current_user.id, active_only, limit, offset)


@router.get("/sync", response_model=SyncResponse, status_code=status.HTTP_200_OK)
async def sync(
    horizon_days: int = Query(default=30, ge=1, le=365),
    max_per_reminder: int = Query(default=10, ge=1, le=100),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> SyncResponse:
    return await sync_reminders(db, current_user.id, horizon_days, max_per_reminder)


@router.delete("/{reminder_id}", response_model=ReminderDeleteResponse, status_code=status.HTTP_200_OK)
async def delete_reminder_endpoint(
    reminder_id: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> ReminderDeleteResponse:
    return await remove_reminder(db, reminder_id, current_user.id)
