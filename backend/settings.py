from functools import lru_cache
from pathlib import Path
from urllib.parse import urlsplit

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


def ai_configuration(settings: Settings) -> dict:
    """Report the running process configuration without disclosing any values."""
    endpoint = settings.openai_base_url.strip()
    try:
        parsed = urlsplit(endpoint)
        endpoint_valid = not endpoint or bool(
            parsed.scheme in ('http', 'https') and parsed.hostname and
            not parsed.username and not parsed.password and not parsed.query and not parsed.fragment)
        if endpoint:
            parsed.port  # Validate malformed ports without echoing the input.
    except ValueError:
        endpoint_valid = False
    key_present = bool(settings.openai_api_key.strip())
    model_present = bool(settings.openai_model.strip())
    return dict(configured=key_present and model_present and endpoint_valid,
                key_present=key_present, model_present=model_present,
                endpoint_valid=endpoint_valid, endpoint_mode='custom' if endpoint else 'default')

