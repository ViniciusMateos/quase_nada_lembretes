from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.models.models import Task


async def get_tasks_for_week(db: AsyncSession, user_id: str, week_key: str) -> list[Task]:
    """
    Tarefas visíveis na semana `week_key`, com a mesma regra de carry-over do
    site: toda tarefa desta semana ou de semanas anteriores que ainda não foi
    concluída — ou que foi concluída numa semana >= a atual — continua
    aparecendo. Tarefa concluída numa semana passada some das semanas seguintes.

    As chaves de semana são "AAAA-Www" com a semana zero-padded, então a
    comparação lexicográfica de strings ordena corretamente (inclusive na
    virada de ano).
    """
    result = await db.execute(
        select(Task).where(
            and_(
                Task.user_id == user_id,
                Task.week_key <= week_key,
                or_(
                    Task.completed == 0,
                    Task.completed_week_key >= week_key,
                ),
            )
        )
    )
    return list(result.scalars().all())


async def get_task_by_id(db: AsyncSession, task_id: str) -> Task | None:
    result = await db.execute(select(Task).where(Task.id == task_id))
    return result.scalar_one_or_none()


async def create_task(db: AsyncSession, task: Task) -> Task:
    db.add(task)
    await db.flush()
    await db.refresh(task)
    return task


async def delete_task(db: AsyncSession, task: Task) -> None:
    await db.delete(task)
    await db.flush()
