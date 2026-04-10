from typing import Any

from pydantic import BaseModel, Field, field_validator


class MessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=2000)
    client_timestamp: str = Field(..., description="ISO 8601 timestamp from client")

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
