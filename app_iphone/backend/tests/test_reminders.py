"""
Tests for reminder endpoints: list, delete, and sync.
"""

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

import os
os.environ.setdefault("DATABASE_URL", "sqlite+aiosqlite:///./test_reminders.db")
os.environ.setdefault("JWT_SECRET", "test-secret-key-minimum-32-characters-long")
os.environ.setdefault("JWT_ALGORITHM", "HS256")
os.environ.setdefault("JWT_EXPIRE_DAYS", "7")
os.environ.setdefault("GOOGLE_API_KEY", "fake-key-for-tests")
os.environ.setdefault("CORS_ORIGINS", "*")
os.environ.setdefault("APP_ENV", "testing")

REGISTER_URL = "/api/v1/auth/register"
LOGIN_URL = "/api/v1/auth/login"
REMINDERS_URL = "/api/v1/reminders"
SYNC_URL = "/api/v1/reminders/sync"


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
    if os.path.exists("./test_reminders.db"):
        os.remove("./test_reminders.db")


@pytest_asyncio.fixture(scope="module")
async def auth_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(REGISTER_URL, json={
        "email": "reminders_user@quasenada.com",
        "password": "ReminderPass123",
        "name": "Reminder Tester",
    })
    resp = await client.post(LOGIN_URL, json={
        "email": "reminders_user@quasenada.com",
        "password": "ReminderPass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


@pytest_asyncio.fixture(scope="module")
async def other_user_headers(client: AsyncClient) -> dict[str, str]:
    await client.post(REGISTER_URL, json={
        "email": "other_user@quasenada.com",
        "password": "OtherPass123",
        "name": "Other User",
    })
    resp = await client.post(LOGIN_URL, json={
        "email": "other_user@quasenada.com",
        "password": "OtherPass123",
    })
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}


async def _create_reminder_directly(client: AsyncClient, headers: dict, title: str, recurrence: str = "once") -> dict:
    """Helper: insert a reminder directly via the DB for test setup."""
    import uuid
    from datetime import datetime, timedelta, timezone
    from src.core.database import AsyncSessionLocal
    from src.models.models import Reminder

    now = datetime.now(timezone.utc)
    async with AsyncSessionLocal() as db:
        import jwt as pyjwt
        token = headers["Authorization"].split(" ")[1]
        payload = pyjwt.decode(token, os.environ["JWT_SECRET"], algorithms=["HS256"])
        user_id = payload["sub"]

        reminder = Reminder(
            id=str(uuid.uuid4()),
            user_id=user_id,
            title=title,
            title_normalized=title.lower(),
            next_execution=(now + timedelta(hours=1)).isoformat(),
            recurrence=recurrence,
            recurrence_str=recurrence,
            interval_seconds=None,
            end_date=None,
            is_active=1,
            created_at=now.isoformat(),
            updated_at=now.isoformat(),
        )
        db.add(reminder)
        await db.commit()
        return {"id": reminder.id, "title": reminder.title}


class TestListReminders:
    async def test_list_requires_auth(self, client: AsyncClient):
        response = await client.get(REMINDERS_URL)
        assert response.status_code == 401

    async def test_list_empty(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(REMINDERS_URL, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "reminders" in data
        assert "total" in data
        assert "limit" in data
        assert "offset" in data

    async def test_list_with_reminders(self, client: AsyncClient, auth_headers: dict):
        await _create_reminder_directly(client, auth_headers, "Reunião diária", "daily")
        await _create_reminder_directly(client, auth_headers, "Tomar remédio")

        response = await client.get(REMINDERS_URL, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["total"] >= 2

    async def test_list_pagination(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(
            REMINDERS_URL,
            params={"limit": 1, "offset": 0},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["reminders"]) <= 1
        assert data["limit"] == 1


class TestDeleteReminder:
    async def test_delete_requires_auth(self, client: AsyncClient):
        response = await client.delete(f"{REMINDERS_URL}/nonexistent-id")
        assert response.status_code == 401

    async def test_delete_not_found(self, client: AsyncClient, auth_headers: dict):
        response = await client.delete(
            f"{REMINDERS_URL}/00000000-0000-0000-0000-000000000000",
            headers=auth_headers,
        )
        assert response.status_code == 404
        data = response.json()
        assert data["code"] == "REMINDER_NOT_FOUND"

    async def test_delete_success(self, client: AsyncClient, auth_headers: dict):
        reminder = await _create_reminder_directly(client, auth_headers, "Para deletar")
        response = await client.delete(
            f"{REMINDERS_URL}/{reminder['id']}",
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert data["deleted"] is True
        assert data["id"] == reminder["id"]

    async def test_delete_another_user_reminder(
        self, client: AsyncClient, auth_headers: dict, other_user_headers: dict
    ):
        reminder = await _create_reminder_directly(client, auth_headers, "Meu lembrete privado")
        response = await client.delete(
            f"{REMINDERS_URL}/{reminder['id']}",
            headers=other_user_headers,
        )
        assert response.status_code == 403
        data = response.json()
        assert data["code"] == "NOT_YOUR_REMINDER"


class TestSyncReminders:
    async def test_sync_requires_auth(self, client: AsyncClient):
        response = await client.get(SYNC_URL)
        assert response.status_code == 401

    async def test_sync_response_structure(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(SYNC_URL, headers=auth_headers)
        assert response.status_code == 200
        data = response.json()
        assert "synced_at" in data
        assert "reminders" in data
        assert isinstance(data["reminders"], list)

    async def test_sync_with_active_reminder(self, client: AsyncClient, auth_headers: dict):
        await _create_reminder_directly(client, auth_headers, "Lembrete semanal", "weekly")

        response = await client.get(
            SYNC_URL,
            params={"horizon_days": 30, "max_per_reminder": 5},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        assert len(data["reminders"]) >= 1

        for r in data["reminders"]:
            assert "id" in r
            assert "title" in r
            assert "scheduled_executions" in r
            assert isinstance(r["scheduled_executions"], list)

    async def test_sync_respects_horizon(self, client: AsyncClient, auth_headers: dict):
        response = await client.get(
            SYNC_URL,
            params={"horizon_days": 1, "max_per_reminder": 10},
            headers=auth_headers,
        )
        assert response.status_code == 200
        data = response.json()
        for r in data["reminders"]:
            assert len(r["scheduled_executions"]) <= 10
