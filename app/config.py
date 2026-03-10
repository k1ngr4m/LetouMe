from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_name: str
    db_user: str
    db_password: str
    db_sslmode: str = "require"
    api_host: str = "0.0.0.0"
    api_port: int = 8000

    @property
    def database_dsn(self) -> str:
        return " ".join(
            [
                f"host={self.db_host}",
                f"port={self.db_port}",
                f"dbname={self.db_name}",
                f"user={self.db_user}",
                f"password={self.db_password}",
                f"sslmode={self.db_sslmode}",
            ]
        )


def _require_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def load_settings() -> Settings:
    return Settings(
        db_host=_require_env("DB_HOST"),
        db_port=int(os.getenv("DB_PORT", "5432")),
        db_name=os.getenv("DB_NAME", "postgres"),
        db_user=_require_env("DB_USER"),
        db_password=_require_env("DB_PASSWORD"),
        db_sslmode=os.getenv("DB_SSLMODE", "require"),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8000")),
    )
