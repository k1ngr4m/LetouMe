from __future__ import annotations

import os
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlparse

from dotenv import load_dotenv


PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPO_ROOT = PROJECT_ROOT.parent
load_dotenv(REPO_ROOT / ".env")
APP_ENV = os.getenv("APP_ENV", "dev")
load_dotenv(REPO_ROOT / f".env.{APP_ENV}", override=True)


@dataclass(frozen=True)
class Settings:
    database_url: str
    mysql_host: str
    mysql_port: int
    mysql_user: str
    mysql_password: str
    mysql_database: str
    sqlite_path: Path
    api_host: str = "0.0.0.0"
    api_port: int = 8000
    frontend_origin: str = "http://localhost:5173"

    @property
    def sqlite_source_path(self) -> Path:
        if self.sqlite_path.is_absolute():
            return self.sqlite_path
        return PROJECT_ROOT / self.sqlite_path


def _build_database_url(
    host: str,
    port: int,
    user: str,
    password: str,
    database: str,
) -> str:
    return f"mysql+pymysql://{user}:{password}@{host}:{port}/{database}?charset=utf8mb4"


def _split_mysql_config(database_url: str) -> tuple[str, int, str, str, str]:
    parsed = urlparse(database_url)
    return (
        parsed.hostname or "127.0.0.1",
        parsed.port or 3306,
        parsed.username or "root",
        parsed.password or "",
        (parsed.path or "/letoume").lstrip("/") or "letoume",
    )


def load_settings() -> Settings:
    mysql_host = os.getenv("MYSQL_HOST", "127.0.0.1")
    mysql_port = int(os.getenv("MYSQL_PORT", "3306"))
    mysql_user = os.getenv("MYSQL_USER", "root")
    mysql_password = os.getenv("MYSQL_PASSWORD", "")
    mysql_database = os.getenv("MYSQL_DATABASE", "letoume")
    database_url = os.getenv("DATABASE_URL") or _build_database_url(
        mysql_host,
        mysql_port,
        mysql_user,
        mysql_password,
        mysql_database,
    )
    mysql_host, mysql_port, mysql_user, mysql_password, mysql_database = _split_mysql_config(database_url)

    return Settings(
        database_url=database_url,
        mysql_host=mysql_host,
        mysql_port=mysql_port,
        mysql_user=mysql_user,
        mysql_password=mysql_password,
        mysql_database=mysql_database,
        sqlite_path=Path(os.getenv("SQLITE_PATH", os.getenv("DB_PATH", "letoume.db"))),
        api_host=os.getenv("API_HOST", "0.0.0.0"),
        api_port=int(os.getenv("API_PORT", "8000")),
        frontend_origin=os.getenv("FRONTEND_ORIGIN", "http://localhost:5173"),
    )
