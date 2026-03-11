from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")


@dataclass(frozen=True)
class Settings:
    db_path: Path
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_origin: str = "http://localhost:5173"

    @property
    def database_path(self) -> Path:
        if self.db_path.is_absolute():
            return self.db_path
        return PROJECT_ROOT / self.db_path


def load_settings() -> Settings:
    return Settings(
        db_path=Path(os.getenv("DB_PATH", "letoume.db")),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8000")),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
    )
