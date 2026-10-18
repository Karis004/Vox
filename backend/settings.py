from functools import lru_cache
import os
import secrets
from pathlib import Path
from urllib.parse import urlsplit

from dotenv import dotenv_values
from pydantic import PrivateAttr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    _ai_config_id: str = PrivateAttr(default_factory=lambda: secrets.token_hex(6))
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


def env_path() -> Path:
    return Path(os.environ.get('VOX_ENV_FILE', '.env'))


@lru_cache
def _startup_settings() -> Settings:
    return Settings(_env_file=env_path())


_reloaded_settings: Settings | None = None


def get_settings() -> Settings:
    return _reloaded_settings or _startup_settings()


def reload_ai_settings() -> Settings:
    global _reloaded_settings
    # Only AI values may change without restarting the application. File values
    # deliberately override the process environment left over from container startup.
    path = env_path()
    with path.open(encoding='utf-8-sig') as stream:
        values = dotenv_values(stream=stream, interpolate=False)
    defaults = Settings(_env_file=None, openai_api_key='', openai_model='gpt-4o-mini', openai_base_url='')
    updates = {name: values.get(name.upper(), getattr(defaults, name)) or ''
               for name in ('openai_api_key', 'openai_model', 'openai_base_url')}
    candidate = get_settings().model_copy(update=updates)
    if not ai_configuration(candidate)['configured']:
        raise ValueError('AI配置不完整或URL无效')
    candidate._ai_config_id = secrets.token_hex(6)
    _reloaded_settings = candidate
    return candidate


def ai_configuration(settings: Settings) -> dict:
    """Expose model and endpoint, never the token or URL credentials."""
    endpoint = settings.openai_base_url.strip()
    safe_endpoint = 'https://api.openai.com/v1' if not endpoint else ''
    try:
        parsed = urlsplit(endpoint)
        endpoint_valid = not endpoint or bool(
            parsed.scheme in ('http', 'https') and parsed.hostname and
            not parsed.username and not parsed.password and not parsed.query and not parsed.fragment)
        if endpoint:
            parsed.port  # Validate malformed ports without echoing the input.
            safe_endpoint = parsed._replace(netloc=parsed.netloc.rsplit('@', 1)[-1], query='', fragment='').geturl()
    except ValueError:
        endpoint_valid = False
    key_present = bool(settings.openai_api_key.strip())
    model_present = bool(settings.openai_model.strip())
    model = settings.openai_model.strip()
    token = settings.openai_api_key.strip()
    if token:
        safe_endpoint = safe_endpoint.replace(token, '••••')
        model = model.replace(token, '••••')
    return dict(configured=key_present and model_present and endpoint_valid,
                key_present=key_present, model_present=model_present,
                endpoint_valid=endpoint_valid, endpoint_mode='custom' if endpoint else 'default',
                model=model, base_url=safe_endpoint, configuration_id=settings._ai_config_id)

