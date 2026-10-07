import json
import sqlite3
from contextlib import contextmanager
from pathlib import Path
from threading import Lock

from backend.defaults import DEFAULT_CONFIG
from backend.models import BriefingConfig


class ConfigRepository:
    def __init__(self, database_path: Path):
        self.database_path = database_path
        self.database_path.parent.mkdir(parents=True, exist_ok=True)
        self._lock = Lock()
        self._initialize()

    @contextmanager
    def _connect(self):
        connection = sqlite3.connect(self.database_path, timeout=5)
        connection.row_factory = sqlite3.Row
        try:
            with connection:
                yield connection
        finally:
            connection.close()

    def _initialize(self) -> None:
        with self._connect() as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS briefing_config (
                    id INTEGER PRIMARY KEY CHECK (id = 1),
                    payload TEXT NOT NULL,
                    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
            connection.execute(
                "INSERT OR IGNORE INTO briefing_config (id, payload) VALUES (1, ?)",
                (DEFAULT_CONFIG.model_dump_json(),),
            )

    def get(self) -> BriefingConfig:
        with self._lock, self._connect() as connection:
            row = connection.execute(
                "SELECT payload FROM briefing_config WHERE id = 1"
            ).fetchone()
        if row is None:
            return DEFAULT_CONFIG.model_copy(deep=True)
        return BriefingConfig.model_validate_json(row["payload"])

    def save(self, config: BriefingConfig) -> BriefingConfig:
        payload = json.dumps(config.model_dump(mode="json"), ensure_ascii=False)
        with self._lock, self._connect() as connection:
            connection.execute(
                """
                INSERT INTO briefing_config (id, payload, updated_at)
                VALUES (1, ?, CURRENT_TIMESTAMP)
                ON CONFLICT(id) DO UPDATE SET
                    payload = excluded.payload,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (payload,),
            )
        return config

