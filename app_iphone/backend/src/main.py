import logging
from contextlib import asynccontextmanager

from apscheduler.schedulers.asyncio import AsyncIOScheduler
import pytz
from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from starlette.exceptions import HTTPException as StarletteHTTPException
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded

from src.core.config import settings
from src.core.limiter import limiter
from src.middleware.error_handler import (
    generic_exception_handler,
    http_exception_handler,
    validation_exception_handler,
)
from src.features.auth.router import router as auth_router
from src.features.messages.router import router as messages_router
from src.features.reminders.router import router as reminders_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger(__name__)

scheduler = AsyncIOScheduler(timezone=pytz.utc)


async def _process_due_reminders() -> None:
    """
    APScheduler job: advance reminders that have passed their next_execution time.
    Runs every minute.
    """
    from datetime import datetime, timezone
    from src.core.database import AsyncSessionLocal
    from src.models.models import Reminder
    from src.features.reminders.service import calcular_proxima_execucao
    from sqlalchemy import select

    now_iso = datetime.now(timezone.utc).isoformat()

    async with AsyncSessionLocal() as db:
        try:
            result = await db.execute(
                select(Reminder).where(
                    Reminder.is_active == 1,
                    Reminder.next_execution <= now_iso,
                )
            )
            due_reminders = list(result.scalars().all())

            for reminder in due_reminders:
                from_dt = datetime.fromisoformat(reminder.next_execution)
                if from_dt.tzinfo is None:
                    from_dt = from_dt.replace(tzinfo=timezone.utc)
                next_dt = calcular_proxima_execucao(reminder, from_dt)

                if next_dt is None:
                    reminder.is_active = 0
                else:
                    reminder.next_execution = next_dt.isoformat()

                reminder.updated_at = datetime.now(timezone.utc).isoformat()

            await db.commit()
            if due_reminders:
                logger.info("Processed %d due reminder(s).", len(due_reminders))
        except Exception:
            await db.rollback()
            logger.exception("Error processing due reminders.")


@asynccontextmanager
async def lifespan(app: FastAPI):
    scheduler.add_job(
        _process_due_reminders,
        trigger="interval",
        seconds=60,
        id="process_due_reminders",
        replace_existing=True,
    )
    scheduler.start()
    logger.info("APScheduler started.")
    yield
    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped.")


app = FastAPI(
    title="Quase Nada Lembretes API",
    version="1.0.0",
    description="Backend API for the Quase Nada Lembretes iOS app.",
    lifespan=lifespan,
)

# Rate limiting (OWASP A07)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS
cors_origins = settings.cors_origins_list
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(Exception, generic_exception_handler)

# Routers
API_PREFIX = "/api/v1"
app.include_router(auth_router, prefix=API_PREFIX)
app.include_router(messages_router, prefix=API_PREFIX)
app.include_router(reminders_router, prefix=API_PREFIX)


@app.get("/health", tags=["health"])
async def health_check() -> dict:
    return {"status": "ok", "env": settings.app_env}
