from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    vox_host: str = "0.0.0.0"
    vox_port: int = 8000
    vox_database_path: Path = Path("data/vox.db")
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_base_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()

