"""
Database initialization script.
Run once to create all tables: python init_db.py
"""

import asyncio
import os
from pathlib import Path

import aiosqlite
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.environ["DATABASE_URL"]


def extract_db_path(url: str) -> str:
    relative_prefix = "sqlite+aiosqlite:///"
    absolute_prefix = "sqlite+aiosqlite:////"

    if url == "sqlite+aiosqlite:///:memory:":
        return ":memory:"

    if url.startswith(absolute_prefix):
        # Unix absolute path: sqlite+aiosqlite:////var/data/app.db -> /var/data/app.db
        return "/" + url[len(absolute_prefix):]

    if url.startswith(relative_prefix):
        # Relative path or Windows absolute drive path:
        # sqlite+aiosqlite:///./app.db -> ./app.db
        # sqlite+aiosqlite:///C:/data/app.db -> C:/data/app.db
        return url[len(relative_prefix):]

    raise ValueError(
        "Unsupported DATABASE_URL format. Expected sqlite+aiosqlite:///path/to/file.db"
    )


DDL = """
CREATE TABLE IF NOT EXISTS users (
    id          TEXT PRIMARY KEY,
    email       TEXT NOT NULL UNIQUE,
    name        TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    is_active   INTEGER NOT NULL DEFAULT 1,
    created_at  TEXT NOT NULL,
    updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

CREATE TABLE IF NOT EXISTS reminders (
    id                  TEXT PRIMARY KEY,
    user_id             TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title               TEXT NOT NULL,
    title_normalized    TEXT NOT NULL,
    next_execution      TEXT NOT NULL,
    interval_seconds    INTEGER,
    recurrence          TEXT,
    recurrence_str      TEXT,
    end_date            TEXT,
    is_active           INTEGER NOT NULL DEFAULT 1,
    created_at          TEXT NOT NULL,
    updated_at          TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_reminders_user_id ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_next_execution ON reminders(next_execution);
CREATE INDEX IF NOT EXISTS idx_reminders_user_active ON reminders(user_id, is_active);

CREATE TABLE IF NOT EXISTS chat_history (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role        TEXT NOT NULL,
    content     TEXT NOT NULL,
    intent      TEXT,
    model_used  TEXT,
    created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_id ON chat_history(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_history_user_created ON chat_history(user_id, created_at DESC);
"""


async def init_db() -> None:
    db_path = extract_db_path(DATABASE_URL)

    if db_path != ":memory:":
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)

    async with aiosqlite.connect(db_path) as db:
        await db.executescript(DDL)
        await db.commit()
        print(f"Database initialized at: {db_path}")


if __name__ == "__main__":
    asyncio.run(init_db())
