import uuid
from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.security import create_access_token, hash_password, verify_password
from src.features.auth.repository import create_user, get_user_by_email
from src.features.auth.schemas import AuthResponse, LoginRequest, RegisterRequest, UserResponse
from src.models.models import User


def _build_auth_response(user: User) -> AuthResponse:
    token = create_access_token(
        {"sub": user.id, "email": user.email, "name": user.name}
    )
    return AuthResponse(
        access_token=token,
        user=UserResponse(
            id=user.id,
            email=user.email,
            name=user.name,
            created_at=user.created_at,
        ),
    )


async def register_user(db: AsyncSession, payload: RegisterRequest) -> AuthResponse:
    existing = await get_user_by_email(db, payload.email)
    if existing:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail={"detail": "E-mail já cadastrado.", "code": "EMAIL_ALREADY_EXISTS"},
        )

    now = datetime.now(timezone.utc).isoformat()
    user = User(
        id=str(uuid.uuid4()),
        email=payload.email,
        name=payload.name,
        password_hash=hash_password(payload.password),
        is_active=1,
        created_at=now,
        updated_at=now,
    )
    user = await create_user(db, user)
    return _build_auth_response(user)


async def login_user(db: AsyncSession, payload: LoginRequest) -> AuthResponse:
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "Credenciais inválidas.", "code": "INVALID_CREDENTIALS"},
        )
    if not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "Conta desativada.", "code": "INVALID_CREDENTIALS"},
        )
    return _build_auth_response(user)
