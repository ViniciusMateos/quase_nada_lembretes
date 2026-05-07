import uuid
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.config import settings
from src.core.security import (
    create_access_token,
    generate_refresh_token,
    hash_password,
    hash_refresh_token,
    verify_password,
)
from src.features.auth.repository import (
    create_user,
    get_refresh_token_by_hash,
    get_user_by_email,
    get_user_by_id,
    revoke_refresh_token,
    save_refresh_token,
)
from src.features.auth.schemas import (
    AuthResponse,
    ChangePasswordRequest,
    DeleteAccountRequest,
    LoginRequest,
    RefreshRequest,
    RefreshResponse,
    RegisterRequest,
    UserResponse,
)
from src.models.models import RefreshToken, User


async def _build_auth_response(db: AsyncSession, user: User) -> AuthResponse:
    access_token = create_access_token(
        {"sub": user.id, "email": user.email, "name": user.name}
    )
    raw_refresh = generate_refresh_token()
    expires_at = (
        datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    ).isoformat()
    token = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=expires_at,
        created_at=datetime.now(timezone.utc).isoformat(),
        revoked=0,
    )
    await save_refresh_token(db, token)
    return AuthResponse(
        access_token=access_token,
        refresh_token=raw_refresh,
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
    return await _build_auth_response(db, user)


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
    return await _build_auth_response(db, user)


async def refresh_tokens(db: AsyncSession, payload: RefreshRequest) -> RefreshResponse:
    invalid_exc = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"detail": "Refresh token inválido ou expirado.", "code": "REFRESH_TOKEN_INVALID"},
    )
    token_hash = hash_refresh_token(payload.refresh_token)
    stored = await get_refresh_token_by_hash(db, token_hash)
    if not stored:
        raise invalid_exc

    expires_at = datetime.fromisoformat(stored.expires_at)
    if expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) > expires_at:
        await revoke_refresh_token(db, stored)
        raise invalid_exc

    user = await get_user_by_id(db, stored.user_id)
    if not user or not user.is_active:
        raise invalid_exc

    # Rotate: revoke old, issue new
    await revoke_refresh_token(db, stored)

    new_access = create_access_token(
        {"sub": user.id, "email": user.email, "name": user.name}
    )
    raw_refresh = generate_refresh_token()
    new_expires_at = (
        datetime.now(timezone.utc) + timedelta(days=settings.refresh_token_expire_days)
    ).isoformat()
    new_token = RefreshToken(
        id=str(uuid.uuid4()),
        user_id=user.id,
        token_hash=hash_refresh_token(raw_refresh),
        expires_at=new_expires_at,
        created_at=datetime.now(timezone.utc).isoformat(),
        revoked=0,
    )
    await save_refresh_token(db, new_token)

    return RefreshResponse(access_token=new_access, refresh_token=raw_refresh)


async def delete_user_account(db: AsyncSession, payload: DeleteAccountRequest) -> dict:
    user = await get_user_by_email(db, payload.email)
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "Credenciais inválidas.", "code": "INVALID_CREDENTIALS"},
        )
    await db.delete(user)
    await db.commit()
    return {"message": "Conta excluída com sucesso."}


async def change_password(
    db: AsyncSession,
    user: User,
    payload: ChangePasswordRequest,
) -> dict:
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "Senha atual incorreta.", "code": "INVALID_CURRENT_PASSWORD"},
        )
    user.password_hash = hash_password(payload.new_password)
    user.updated_at = datetime.now(timezone.utc).isoformat()
    await db.commit()
    return {"message": "Senha alterada com sucesso."}
