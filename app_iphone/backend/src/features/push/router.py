"""
Registro de tokens de push (scaffolding — o envio de push é fase 2).
Por enquanto só persiste o token Expo/APNs do dispositivo por usuário.
"""
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.models.models import PushToken, User

router = APIRouter(prefix="/push", tags=["push"])


class PushTokenRegister(BaseModel):
    token: str
    platform: str | None = None


@router.post("/register", status_code=status.HTTP_204_NO_CONTENT)
async def register_push_token(
    payload: PushTokenRegister,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
) -> None:
    now = datetime.now(timezone.utc).isoformat()
    existing = (
        await db.execute(select(PushToken).where(PushToken.token == payload.token))
    ).scalar_one_or_none()

    if existing:
        existing.user_id = current_user.id
        existing.platform = payload.platform
        existing.updated_at = now
    else:
        db.add(
            PushToken(
                id=str(uuid.uuid4()),
                user_id=current_user.id,
                token=payload.token,
                platform=payload.platform,
                created_at=now,
                updated_at=now,
            )
        )
    # commit é feito pelo get_db ao final da requisição
