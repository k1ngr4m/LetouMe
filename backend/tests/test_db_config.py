from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from backend.app.config import load_settings


class DatabaseConfigTests(unittest.TestCase):
    def test_defaults_to_local_mysql_database(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.mysql_host, "127.0.0.1")
        self.assertEqual(settings.mysql_port, 3306)
        self.assertEqual(settings.mysql_user, "root")
        self.assertEqual(settings.mysql_database, "letoume")
        self.assertIn("mysql+pymysql://root:@127.0.0.1:3306/letoume", settings.database_url)

    def test_database_url_overrides_split_mysql_fields(self) -> None:
        with patch.dict(
            os.environ,
            {"DATABASE_URL": "mysql+pymysql://demo:secret@db.example.com:3307/sample?charset=utf8mb4"},
            clear=True,
        ):
            settings = load_settings()

        self.assertEqual(settings.mysql_host, "db.example.com")
        self.assertEqual(settings.mysql_port, 3307)
        self.assertEqual(settings.mysql_user, "demo")
        self.assertEqual(settings.mysql_password, "secret")
        self.assertEqual(settings.mysql_database, "sample")


if __name__ == "__main__":
    unittest.main()
