from functools import lru_cache
from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


BASE_DIR = Path(__file__).resolve().parents[2]
APP_DIR = BASE_DIR / "app"
STORAGE_DIR = BASE_DIR / "storage"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=BASE_DIR / ".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "Project Migrate"
    api_v1_prefix: str = "/api/v1"
    database_url: str = Field(
        default="postgresql+asyncpg://user:password@localhost:5432/project_migrate",
        alias="DATABASE_URL",
    )
    secret_key: str = Field(default="changeme", alias="SECRET_KEY")
    algorithm: str = Field(default="HS256", alias="ALGORITHM")
    access_token_expire_minutes: int = Field(default=480, alias="ACCESS_TOKEN_EXPIRE_MINUTES")
    dev_auth_bypass: bool = Field(default=False, alias="DEV_AUTH_BYPASS")
    postgres_host: str | None = Field(default=None, alias="POSTGRES_HOST")
    postgres_port: int = Field(default=5432, alias="POSTGRES_PORT")
    postgres_user: str | None = Field(default=None, alias="POSTGRES_USER")
    postgres_password: str | None = Field(default=None, alias="POSTGRES_PASSWORD")
    postgres_db: str | None = Field(default=None, alias="POSTGRES_DB")
    anthropic_api_key: str = Field(default="", alias="ANTHROPIC_API_KEY")
    deepseek_api_key: str = Field(default="", alias="DEEPSEEK_API_KEY")
    openai_api_key: str = Field(default="", alias="OPENAI_API_KEY")
    default_llm_provider: str = Field(default="deepseek", alias="DEFAULT_LLM_PROVIDER")
    cors_origins: list[str] = Field(default_factory=lambda: ["http://localhost:5173"], alias="CORS_ORIGINS")
    artifacts_dir: Path = STORAGE_DIR / "artifacts"
    uploads_dir: Path = STORAGE_DIR / "uploads"
    generated_dir: Path = STORAGE_DIR / "generated"
    prompt_dir: Path = APP_DIR / "prompts"
    signature_dir: Path = APP_DIR / "signatures"
    static_dir: Path = APP_DIR / "static"


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.postgres_host and settings.postgres_user and settings.postgres_password and settings.postgres_db:
        settings.database_url = (
            f"postgresql+asyncpg://{settings.postgres_user}:{settings.postgres_password}"
            f"@{settings.postgres_host}:{settings.postgres_port}/{settings.postgres_db}"
        )
    settings.artifacts_dir.mkdir(parents=True, exist_ok=True)
    settings.uploads_dir.mkdir(parents=True, exist_ok=True)
    settings.generated_dir.mkdir(parents=True, exist_ok=True)
    return settings
