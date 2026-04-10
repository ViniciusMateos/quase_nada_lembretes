from sqlalchemy import Column, ForeignKey, Index, Integer, String, Text
from sqlalchemy.orm import relationship

from src.core.database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True)
    email = Column(String, nullable=False, unique=True)
    name = Column(String, nullable=False)
    password_hash = Column(String, nullable=False)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    reminders = relationship("Reminder", back_populates="user", cascade="all, delete-orphan")
    chat_history = relationship("ChatHistory", back_populates="user", cascade="all, delete-orphan")

    __table_args__ = (Index("idx_users_email", "email"),)


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    title = Column(String, nullable=False)
    title_normalized = Column(String, nullable=False)
    next_execution = Column(String, nullable=False)
    interval_seconds = Column(Integer, nullable=True)
    recurrence = Column(String, nullable=True)
    recurrence_str = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    is_active = Column(Integer, nullable=False, default=1)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    user = relationship("User", back_populates="reminders")

    __table_args__ = (
        Index("idx_reminders_user_id", "user_id"),
        Index("idx_reminders_next_execution", "next_execution"),
        Index("idx_reminders_user_active", "user_id", "is_active"),
    )


class ChatHistory(Base):
    __tablename__ = "chat_history"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    role = Column(String, nullable=False)
    content = Column(Text, nullable=False)
    intent = Column(String, nullable=True)
    model_used = Column(String, nullable=True)
    created_at = Column(String, nullable=False)

    user = relationship("User", back_populates="chat_history")

    __table_args__ = (
        Index("idx_chat_history_user_id", "user_id"),
        Index("idx_chat_history_user_created", "user_id", "created_at"),
    )
