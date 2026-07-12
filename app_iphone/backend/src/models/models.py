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
    refresh_tokens = relationship("RefreshToken", back_populates="user", cascade="all, delete-orphan")
    push_tokens = relationship("PushToken", back_populates="user", cascade="all, delete-orphan")
    tasks = relationship("Task", back_populates="user", cascade="all, delete-orphan")

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
    # CSV de inteiros (convenção weekday(): Seg=0..Dom=6) p/ recurrence="weekly_days".
    # Ex.: "0,1,2,3,4" = segunda a sexta. NULL para os demais tipos.
    days_of_week = Column(String, nullable=True)
    end_date = Column(String, nullable=True)
    # Pré-lembretes: CSV de offsets em SEGUNDOS antes do disparo (avisos "antes").
    # Ex.: "604800,3600,1800" = 1 semana, 1h e 30min antes. NULL = nenhum.
    pre_reminders = Column(String, nullable=True)
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
    # Sessão de chat (uma por abertura do app) — contexto da IA por sessão.
    session_id = Column(String, nullable=True)
    created_at = Column(String, nullable=False)

    user = relationship("User", back_populates="chat_history")

    __table_args__ = (
        Index("idx_chat_history_user_id", "user_id"),
        Index("idx_chat_history_user_created", "user_id", "created_at"),
        Index("idx_chat_history_session", "user_id", "session_id"),
    )


class PushToken(Base):
    """Token de push por dispositivo/usuário. Scaffolding — envio é fase 2."""
    __tablename__ = "push_tokens"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token = Column(String, nullable=False, unique=True)
    platform = Column(String, nullable=True)  # 'ios' | 'android'
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    user = relationship("User", back_populates="push_tokens")

    __table_args__ = (Index("idx_push_tokens_user_id", "user_id"),)


class RefreshToken(Base):
    __tablename__ = "refresh_tokens"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    token_hash = Column(String, nullable=False, unique=True)
    expires_at = Column(String, nullable=False)
    created_at = Column(String, nullable=False)
    revoked = Column(Integer, nullable=False, default=0)

    user = relationship("User", back_populates="refresh_tokens")

    __table_args__ = (
        Index("idx_refresh_tokens_token_hash", "token_hash"),
        Index("idx_refresh_tokens_user_id", "user_id"),
    )


class Task(Base):
    __tablename__ = "tasks"

    id = Column(String, primary_key=True)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    name = Column(String, nullable=False)
    # high | medium | low
    priority = Column(String, nullable=False, default="medium")
    notes = Column(Text, nullable=True)
    completed = Column(Integer, nullable=False, default=0)
    # Chave ISO da semana, ex: "2026-W25" — semana de origem da tarefa.
    week_key = Column(String, nullable=False)
    # Semana em que foi concluída — habilita o carry-over (tarefa pendente "rola"
    # para as semanas seguintes até ser marcada como concluída).
    completed_week_key = Column(String, nullable=True)
    # Posição manual dentro do grupo de mesma prioridade (drag-reorder).
    # NULL = ordem padrão (por created_at).
    order_index = Column(Integer, nullable=True)
    created_at = Column(String, nullable=False)
    updated_at = Column(String, nullable=False)

    user = relationship("User", back_populates="tasks")

    __table_args__ = (
        Index("idx_tasks_user_id", "user_id"),
        Index("idx_tasks_user_week", "user_id", "week_key"),
    )
