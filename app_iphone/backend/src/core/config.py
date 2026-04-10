from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    database_url: str = Field(..., description="SQLAlchemy async database URL")
    jwt_secret: str = Field(..., min_length=32, description="JWT signing secret (min 32 chars)")
    jwt_algorithm: str = Field(default="HS256")
    jwt_expire_days: int = Field(default=7, ge=1)
    google_api_key: str = Field(..., description="Google Gemini API key")
    # SEGURANÇA (OWASP A05): Em produção, NUNCA use "*". Defina as origens permitidas
    # explicitamente em CORS_ORIGINS, separadas por vírgula.
    cors_origins: str = Field(default="*")
    app_env: str = Field(default="production")

    @property
    def cors_origins_list(self) -> list[str]:
        if self.cors_origins == "*":
            return ["*"]
        return [origin.strip() for origin in self.cors_origins.split(",")]


settings = Settings()
