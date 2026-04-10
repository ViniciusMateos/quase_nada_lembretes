from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer

import jwt

from src.core.security import decode_access_token
from src.features.auth.repository import get_user_by_id
from src.core.database import get_db
from sqlalchemy.ext.asyncio import AsyncSession
from src.models.models import User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/login")


async def get_current_user(
    token: str = Depends(oauth2_scheme),
    db: AsyncSession = Depends(get_db),
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail={"detail": "Token inválido ou expirado.", "code": "TOKEN_INVALID"},
    )
    try:
        payload = decode_access_token(token)
        user_id: str = payload.get("sub")
        if not user_id:
            raise credentials_exception
    except jwt.ExpiredSignatureError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail={"detail": "Token expirado.", "code": "TOKEN_EXPIRED"},
        )
    except jwt.InvalidTokenError:
        raise credentials_exception

    user = await get_user_by_id(db, user_id)
    if user is None or not user.is_active:
        raise credentials_exception
    return user
