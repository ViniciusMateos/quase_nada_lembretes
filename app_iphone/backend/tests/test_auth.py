"""
Tests for auth endpoints: register and login.
Uses pytest-asyncio with httpx AsyncClient.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_auth.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters-long")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_EXPIRE_DAYS", "7")
os.environ.setdefault("GOOGLE_API_KEY", "fake-key-for-tests")
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("APP_ENV", "testing")


@pytest_asyncio.fixture(scope="module")
async def client():
    from src.core.database import engine, Base
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    from src.main import app
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await engine.dispose()
    if os.path.exists("./test_auth.db"):
        os.remove("./test_auth.db")


REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"


class TestRegister:
    async def test_register_success(self, client: AsyncClient):
        response = await client.post(REGISTER_URL, json={
            "email": "hilary@quasenada.com",
            "password": "StrongPass123",
            "name": "Hilary Hack",
        })
        assert response.status_code == 201
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["expires_in"] == 604800
        assert data["user"]["email"] == "hilary@quasenada.com"
        assert data["user"]["name"] == "Hilary Hack"
        assert "id" in data["user"]

    async def test_register_duplicate_email(self, client: AsyncClient):
        await client.post(REGISTER_URL, json={
            "email": "duplicate@quasenada.com",
            "password": "StrongPass123",
            "name": "First User",
        })
        response = await client.post(REGISTER_URL, json={
            "email": "duplicate@quasenada.com",
            "password": "AnotherPass456",
            "name": "Second User",
        })
        assert response.status_code == 409
        data = response.json()
        assert data["code"] == "EMAIL_ALREADY_EXISTS"

    async def test_register_missing_fields(self, client: AsyncClient):
        response = await client.post(REGISTER_URL, json={
            "email": "incomplete@quasenada.com",
        })
        assert response.status_code == 422
        data = response.json()
        assert data["code"] == "VALIDATION_ERROR"

    async def test_register_invalid_email(self, client: AsyncClient):
        response = await client.post(REGISTER_URL, json={
            "email": "not-an-email",
            "password": "StrongPass123",
            "name": "Test User",
        })
        assert response.status_code == 422

    async def test_register_short_password(self, client: AsyncClient):
        response = await client.post(REGISTER_URL, json={
            "email": "shortpw@quasenada.com",
            "password": "short",
            "name": "Test User",
        })
        assert response.status_code == 422


class TestLogin:
    @pytest_asyncio.fixture(autouse=True)
    async def setup_user(self, client: AsyncClient):
        await client.post(REGISTER_URL, json={
            "email": "login_test@quasenada.com",
            "password": "ValidPass999",
            "name": "Login Test",
        })

    async def test_login_success(self, client: AsyncClient):
        response = await client.post(LOGIN_URL, json={
            "email": "login_test@quasenada.com",
            "password": "ValidPass999",
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        assert data["user"]["email"] == "login_test@quasenada.com"

    async def test_login_wrong_password(self, client: AsyncClient):
        response = await client.post(LOGIN_URL, json={
            "email": "login_test@quasenada.com",
            "password": "WrongPassword",
        })
        assert response.status_code == 401
        data = response.json()
        assert data["code"] == "INVALID_CREDENTIALS"

    async def test_login_nonexistent_user(self, client: AsyncClient):
        response = await client.post(LOGIN_URL, json={
            "email": "ghost@quasenada.com",
            "password": "Password123",
        })
        assert response.status_code == 401
        data = response.json()
        assert data["code"] == "INVALID_CREDENTIALS"

    async def test_login_missing_password(self, client: AsyncClient):
        response = await client.post(LOGIN_URL, json={
            "email": "login_test@quasenada.com",
        })
        assert response.status_code == 422

    async def test_jwt_token_is_valid(self, client: AsyncClient):
        response = await client.post(LOGIN_URL, json={
            "email": "login_test@quasenada.com",
            "password": "ValidPass999",
        })
        token = response.json()["access_token"]
        import jwt as pyjwt
        payload = pyjwt.decode(
            token,
            os.environ["JWT_SECRET"],
            algorithms=[os.environ["JWT_ALGORITHM"]],
        )
        assert "sub" in payload
        assert payload["email"] == "login_test@quasenada.com"
