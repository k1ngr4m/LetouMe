from __future__ import annotations

import logging
from logging.handlers import RotatingFileHandler
from pathlib import Path
from typing import Any

from backend.app.config import Settings, load_settings


_CONFIGURED = False
_SENSITIVE_KEYS = {
    "api_key",
    "authorization",
    "cookie",
    "password",
    "secret",
    "token",
}
_DEFAULT_FORMAT = "%(asctime)s %(levelname)s [%(name)s] %(message)s"


class ContextFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        context = getattr(record, "context", None)
        if isinstance(context, dict) and context:
            rendered = " ".join(
                f"{key}={redact_value(key, value)}"
                for key, value in sorted(context.items())
            )
            record.msg = f"{record.getMessage()} | {rendered}"
            record.args = ()
        return super().format(record)


def should_log_sensitive_data(settings: Settings | None = None) -> bool:
    active_settings = settings or load_settings()
    return active_settings.app_env.lower() in {"dev", "development", "local"} and active_settings.log_plaintext_sensitive


def redact_value(key: str, value: Any, settings: Settings | None = None) -> str:
    normalized_key = key.lower()
    if value is None:
        return "None"
    if normalized_key not in _SENSITIVE_KEYS:
        return str(value)

    if should_log_sensitive_data(settings):
        return str(value)

    text = str(value)
    if len(text) <= 4:
        return "***"
    return f"{text[:2]}***{text[-2:]}"


def sanitize_mapping(payload: dict[str, Any] | None, settings: Settings | None = None) -> dict[str, str]:
    if not payload:
        return {}
    return {
        str(key): redact_value(str(key), value, settings)
        for key, value in payload.items()
        if not isinstance(value, (dict, list, tuple, set))
    }


def _build_formatter() -> logging.Formatter:
    return ContextFormatter(
        fmt=_DEFAULT_FORMAT,
        datefmt="%Y-%m-%d %H:%M:%S",
    )


def _create_file_handler(log_dir: Path) -> RotatingFileHandler:
    log_dir.mkdir(parents=True, exist_ok=True)
    handler = RotatingFileHandler(
        log_dir / "letoume.log",
        maxBytes=2 * 1024 * 1024,
        backupCount=5,
        encoding="utf-8",
    )
    handler.setFormatter(_build_formatter())
    return handler


def configure_logging(settings: Settings | None = None) -> logging.Logger:
    global _CONFIGURED

    active_settings = settings or load_settings()
    root_logger = logging.getLogger("letoume")
    root_logger.setLevel(getattr(logging, active_settings.log_level.upper(), logging.INFO))

    formatter = _build_formatter()

    if not any(isinstance(handler, logging.StreamHandler) and not isinstance(handler, RotatingFileHandler) for handler in root_logger.handlers):
        console_handler = logging.StreamHandler()
        console_handler.setFormatter(formatter)
        root_logger.addHandler(console_handler)

    log_path = active_settings.log_dir / "letoume.log"
    has_file_handler = any(
        isinstance(handler, RotatingFileHandler) and Path(getattr(handler, "baseFilename", "")) == log_path
        for handler in root_logger.handlers
    )
    if active_settings.log_to_file and not has_file_handler:
        root_logger.addHandler(_create_file_handler(active_settings.log_dir))

    root_logger.propagate = False
    _CONFIGURED = True
    return root_logger


def get_logger(name: str) -> logging.Logger:
    configure_logging()
    return logging.getLogger(f"letoume.{name}")
