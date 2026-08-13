from typing import Any

from pydantic import BaseModel, Field, field_validator


class MessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    client_timestamp: str = Field(..., description="ISO 8601 timestamp from client")
    hour_format: str = Field(default="24h", description="'12h' (AM/PM) ou '24h' — formato de hora do usuário")
    session_id: str | None = Field(default=None, description="ID da sessão de chat (uma por abertura do app) — mantém o contexto da conversa por sessão")
    client_message_id: str | None = Field(default=None, description="ID idempotente gerado pelo cliente por mensagem. Reenvios (fila offline) usam o MESMO id; o backend devolve o resultado já processado em vez de recriar o lembrete.")

    @field_validator("content")
    @classmethod
    def content_must_not_be_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Message content cannot be blank.")
        return v


class MessageResponse(BaseModel):
    message_id: str
    response: str
    intent: str
    action: dict[str, Any] | None
    model_used: str
