from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backend.app.config import load_settings


class DatabaseConfigTests(unittest.TestCase):
    def test_defaults_to_sqlite_database(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.db_driver, "sqlite")
        self.assertEqual(settings.sqlite_path.as_posix(), "data/letoume.sqlite3")
        self.assertTrue(settings.database_url.startswith("sqlite:///"))

    def test_sqlite_driver_ignores_mysql_environment(self) -> None:
        with patch.dict(
            os.environ,
            {
                "DB_DRIVER": "sqlite",
                "DATABASE_URL": "mysql+pymysql://demo:secret@db.example.com:3307/sample?charset=utf8mb4",
                "MYSQL_HOST": "db.example.com",
            },
            clear=True,
        ):
            settings = load_settings()

        self.assertEqual(settings.db_driver, "sqlite")
        self.assertTrue(settings.database_url.startswith("sqlite:///"))

    def test_database_url_overrides_split_mysql_fields(self) -> None:
        with patch.dict(
            os.environ,
            {"DB_DRIVER": "mysql", "DATABASE_URL": "mysql+pymysql://demo:secret@db.example.com:3307/sample?charset=utf8mb4"},
            clear=True,
        ):
            settings = load_settings()

        self.assertEqual(settings.db_driver, "mysql")
        self.assertEqual(settings.mysql_host, "db.example.com")
        self.assertEqual(settings.mysql_port, 3307)
        self.assertEqual(settings.mysql_user, "demo")
        self.assertEqual(settings.mysql_password, "secret")
        self.assertEqual(settings.mysql_database, "sample")

    def test_smtp_security_defaults_to_ssl_on_port_465(self) -> None:
        with patch.dict(os.environ, {"SMTP_PORT": "465"}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.smtp_security, "ssl")

    def test_smtp_security_prefers_explicit_env_value(self) -> None:
        with patch.dict(os.environ, {"SMTP_PORT": "465", "SMTP_SECURITY": "starttls"}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.smtp_security, "starttls")


if __name__ == "__main__":
    unittest.main()
