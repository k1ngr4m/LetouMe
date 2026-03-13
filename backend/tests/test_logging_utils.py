from __future__ import annotations

import logging
import tempfile
import unittest
from pathlib import Path

from backend.app.config import Settings
from backend.app.logging_utils import configure_logging, redact_value, sanitize_mapping


class LoggingUtilsTests(unittest.TestCase):
    def test_redact_value_masks_sensitive_value_outside_dev_plaintext(self) -> None:
        settings = Settings(
            database_url="mysql+pymysql://root:@127.0.0.1:3306/letoume?charset=utf8mb4",
            mysql_host="127.0.0.1",
            mysql_port=3306,
            mysql_user="root",
            mysql_password="secret",
            mysql_database="letoume",
            sqlite_path=Path("letoume.db"),
            app_env="prod",
            log_plaintext_sensitive=False,
        )

        self.assertEqual(redact_value("api_key", "abcdef", settings), "ab***ef")

    def test_sanitize_mapping_keeps_plaintext_in_dev_when_enabled(self) -> None:
        settings = Settings(
            database_url="mysql+pymysql://root:@127.0.0.1:3306/letoume?charset=utf8mb4",
            mysql_host="127.0.0.1",
            mysql_port=3306,
            mysql_user="root",
            mysql_password="secret",
            mysql_database="letoume",
            sqlite_path=Path("letoume.db"),
            app_env="dev",
            log_plaintext_sensitive=True,
        )

        self.assertEqual(sanitize_mapping({"api_key": "abcdef", "model_id": "glm-5"}, settings)["api_key"], "abcdef")

    def test_configure_logging_adds_file_handler(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            settings = Settings(
                database_url="mysql+pymysql://root:@127.0.0.1:3306/letoume?charset=utf8mb4",
                mysql_host="127.0.0.1",
                mysql_port=3306,
                mysql_user="root",
                mysql_password="secret",
                mysql_database="letoume",
                sqlite_path=Path("letoume.db"),
                log_dir=Path(temp_dir),
                log_to_file=True,
            )

            logger = configure_logging(settings)

            self.assertTrue(any(isinstance(handler, logging.Handler) for handler in logger.handlers))


if __name__ == "__main__":
    unittest.main()
