from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.models import Reminder


async def get_reminders_by_user(
    db: AsyncSession,
    user_id: str,
    active_only: bool = True,
    limit: int = 50,
    offset: int = 0,
) -> tuple[list[Reminder], int]:
    query = select(Reminder).where(Reminder.user_id == user_id)
    count_query = select(func.count()).select_from(Reminder).where(Reminder.user_id == user_id)

    if active_only:
        query = query.where(Reminder.is_active == 1)
        count_query = count_query.where(Reminder.is_active == 1)

    query = query.order_by(Reminder.next_execution).limit(limit).offset(offset)

    total_result = await db.execute(count_query)
    total = total_result.scalar_one()

    result = await db.execute(query)
    reminders = list(result.scalars().all())
    return reminders, total


async def get_reminder_by_id(db: AsyncSession, reminder_id: str) -> Reminder | None:
    result = await db.execute(select(Reminder).where(Reminder.id == reminder_id))
    return result.scalar_one_or_none()


async def get_active_reminders_for_user(db: AsyncSession, user_id: str) -> list[Reminder]:
    result = await db.execute(
        select(Reminder).where(Reminder.user_id == user_id, Reminder.is_active == 1)
    )
    return list(result.scalars().all())


async def create_reminder(db: AsyncSession, reminder: Reminder) -> Reminder:
    db.add(reminder)
    await db.flush()
    await db.refresh(reminder)
    return reminder


async def delete_reminder(db: AsyncSession, reminder: Reminder) -> None:
    await db.delete(reminder)
    await db.flush()


async def search_reminders_by_title(
    db: AsyncSession, user_id: str, title_fragment: str
) -> list[Reminder]:
    normalized = title_fragment.lower()
    result = await db.execute(
        select(Reminder).where(
            Reminder.user_id == user_id,
            Reminder.is_active == 1,
            Reminder.title_normalized.contains(normalized),
        )
    )
    return list(result.scalars().all())


async def save_reminder(db: AsyncSession, reminder: Reminder) -> Reminder:
    await db.flush()
    await db.refresh(reminder)
    return reminder
