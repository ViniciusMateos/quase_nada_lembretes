from fastapi import APIRouter, Depends, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from src.core.database import get_db
from src.core.dependencies import get_current_user
from src.core.limiter import limiter
from src.features.auth.schemas import AuthResponse, ChangePasswordRequest, DeleteAccountRequest, LoginRequest, RefreshRequest, RefreshResponse, RegisterRequest
from src.features.auth.service import change_password, delete_user_account, login_user, refresh_tokens, register_user
from src.models.models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=AuthResponse, status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(
    request: Request,
    payload: RegisterRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    return await register_user(db, payload)


@router.post("/login", response_model=AuthResponse, status_code=status.HTTP_200_OK)
@limiter.limit("10/minute")
async def login(
    request: Request,
    payload: LoginRequest,
    db: AsyncSession = Depends(get_db),
) -> AuthResponse:
    return await login_user(db, payload)


@router.post("/refresh", response_model=RefreshResponse, status_code=status.HTTP_200_OK)
@limiter.limit("20/minute")
async def refresh(
    request: Request,
    payload: RefreshRequest,
    db: AsyncSession = Depends(get_db),
) -> RefreshResponse:
    return await refresh_tokens(db, payload)


@router.delete("/account", status_code=status.HTTP_200_OK)
@limiter.limit("3/minute")
async def delete_account(
    request: Request,
    payload: DeleteAccountRequest,
    db: AsyncSession = Depends(get_db),
) -> dict:
    return await delete_user_account(db, payload)


@router.put("/password", status_code=status.HTTP_200_OK)
@limiter.limit("5/minute")
async def update_password(
    request: Request,
    payload: ChangePasswordRequest,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> dict:
    return await change_password(db, current_user, payload)
