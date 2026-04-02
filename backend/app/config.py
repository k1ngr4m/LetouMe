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
    app_env: str = "dev"
    log_level: str = "INFO"
    log_dir: Path = REPO_ROOT / "logs"
    log_to_file: bool = True
    log_plaintext_sensitive: bool = True
    auth_session_cookie_name: str = "letoume_session"
    auth_session_days: int = 7
    auth_bootstrap_admin_username: str = "admin"
    auth_bootstrap_admin_password: str = "admin123456"
    mysql_pool_size: int = 6
    lottery_split_tables_enabled: bool = True
    baidu_ocr_api_key: str = ""
    baidu_ocr_secret_key: str = ""
    baidu_ocr_token_url: str = "https://aip.baidubce.com/oauth/2.0/token"
    baidu_ocr_url: str = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"
    imgloc_api_key: str = ""
    imgloc_api_url: str = "https://imgloc.com/api/1/upload"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_use_tls: bool = True
    smtp_from_email: str = ""
    smtp_from_name: str = "LetouMe"
    auth_email_code_expire_minutes: int = 10
    auth_email_code_cooldown_seconds: int = 1
    auth_oauth_base_url: str = ""
    auth_oauth_google_client_id: str = ""
    auth_oauth_google_client_secret: str = ""
    auth_oauth_google_authorize_url: str = "https://accounts.google.com/o/oauth2/v2/auth"
    auth_oauth_google_token_url: str = "https://oauth2.googleapis.com/token"
    auth_oauth_google_userinfo_url: str = "https://openidconnect.googleapis.com/v1/userinfo"
    auth_oauth_google_redirect_uri: str = ""
    auth_oauth_github_client_id: str = ""
    auth_oauth_github_client_secret: str = ""
    auth_oauth_github_authorize_url: str = "https://github.com/login/oauth/authorize"
    auth_oauth_github_token_url: str = "https://github.com/login/oauth/access_token"
    auth_oauth_github_userinfo_url: str = "https://api.github.com/user"
    auth_oauth_github_emails_url: str = "https://api.github.com/user/emails"
    auth_oauth_github_redirect_uri: str = ""
    auth_oauth_state_ttl_seconds: int = 600

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
        app_env=APP_ENV,
        log_level=os.getenv("LOG_LEVEL", "INFO"),
        log_dir=Path(os.getenv("LOG_DIR", str(REPO_ROOT / "logs"))),
        log_to_file=os.getenv("LOG_TO_FILE", "true").lower() in {"1", "true", "yes", "on"},
        log_plaintext_sensitive=os.getenv("LOG_PLAINTEXT_SENSITIVE", "true").lower() in {"1", "true", "yes", "on"},
        auth_session_cookie_name=os.getenv("AUTH_SESSION_COOKIE_NAME", "letoume_session"),
        auth_session_days=int(os.getenv("AUTH_SESSION_DAYS", "7")),
        auth_bootstrap_admin_username=os.getenv("AUTH_BOOTSTRAP_ADMIN_USERNAME", "admin"),
        auth_bootstrap_admin_password=os.getenv("AUTH_BOOTSTRAP_ADMIN_PASSWORD", "admin123456"),
        mysql_pool_size=int(os.getenv("MYSQL_POOL_SIZE", "6")),
        lottery_split_tables_enabled=os.getenv("LOTTERY_SPLIT_TABLES_ENABLED", "true").lower() in {"1", "true", "yes", "on"},
        baidu_ocr_api_key=os.getenv("BAIDU_OCR_API_KEY", ""),
        baidu_ocr_secret_key=os.getenv("BAIDU_OCR_SECRET_KEY", ""),
        baidu_ocr_token_url=os.getenv("BAIDU_OCR_TOKEN_URL", "https://aip.baidubce.com/oauth/2.0/token"),
        baidu_ocr_url=os.getenv("BAIDU_OCR_URL", "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"),
        imgloc_api_key=os.getenv("IMGLOC_API_KEY", ""),
        imgloc_api_url=os.getenv("IMGLOC_API_URL", "https://imgloc.com/api/1/upload"),
        smtp_host=os.getenv("SMTP_HOST", ""),
        smtp_port=int(os.getenv("SMTP_PORT", "587")),
        smtp_user=os.getenv("SMTP_USER", ""),
        smtp_password=os.getenv("SMTP_PASSWORD", ""),
        smtp_use_tls=os.getenv("SMTP_USE_TLS", "true").lower() in {"1", "true", "yes", "on"},
        smtp_from_email=os.getenv("SMTP_FROM_EMAIL", ""),
        smtp_from_name=os.getenv("SMTP_FROM_NAME", "LetouMe"),
        auth_email_code_expire_minutes=int(os.getenv("AUTH_EMAIL_CODE_EXPIRE_MINUTES", "10")),
        auth_email_code_cooldown_seconds=int(os.getenv("AUTH_EMAIL_CODE_COOLDOWN_SECONDS", "60")),
        auth_oauth_base_url=os.getenv("AUTH_OAUTH_BASE_URL", ""),
        auth_oauth_google_client_id=os.getenv("AUTH_OAUTH_GOOGLE_CLIENT_ID", ""),
        auth_oauth_google_client_secret=os.getenv("AUTH_OAUTH_GOOGLE_CLIENT_SECRET", ""),
        auth_oauth_google_authorize_url=os.getenv("AUTH_OAUTH_GOOGLE_AUTHORIZE_URL", "https://accounts.google.com/o/oauth2/v2/auth"),
        auth_oauth_google_token_url=os.getenv("AUTH_OAUTH_GOOGLE_TOKEN_URL", "https://oauth2.googleapis.com/token"),
        auth_oauth_google_userinfo_url=os.getenv("AUTH_OAUTH_GOOGLE_USERINFO_URL", "https://openidconnect.googleapis.com/v1/userinfo"),
        auth_oauth_google_redirect_uri=os.getenv("AUTH_OAUTH_GOOGLE_REDIRECT_URI", ""),
        auth_oauth_github_client_id=os.getenv("AUTH_OAUTH_GITHUB_CLIENT_ID", ""),
        auth_oauth_github_client_secret=os.getenv("AUTH_OAUTH_GITHUB_CLIENT_SECRET", ""),
        auth_oauth_github_authorize_url=os.getenv("AUTH_OAUTH_GITHUB_AUTHORIZE_URL", "https://github.com/login/oauth/authorize"),
        auth_oauth_github_token_url=os.getenv("AUTH_OAUTH_GITHUB_TOKEN_URL", "https://github.com/login/oauth/access_token"),
        auth_oauth_github_userinfo_url=os.getenv("AUTH_OAUTH_GITHUB_USERINFO_URL", "https://api.github.com/user"),
        auth_oauth_github_emails_url=os.getenv("AUTH_OAUTH_GITHUB_EMAILS_URL", "https://api.github.com/user/emails"),
        auth_oauth_github_redirect_uri=os.getenv("AUTH_OAUTH_GITHUB_REDIRECT_URI", ""),
        auth_oauth_state_ttl_seconds=int(os.getenv("AUTH_OAUTH_STATE_TTL_SECONDS", "600")),
    )
