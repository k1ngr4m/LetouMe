from __future__ import annotations

import os
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.config import PROJECT_ROOT, load_settings


class DatabaseConfigTests(unittest.TestCase):
    def test_defaults_to_project_root_sqlite_file(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.db_path, Path("letoume.db"))
        self.assertEqual(settings.database_path, PROJECT_ROOT / "letoume.db")

    def test_absolute_sqlite_path_is_preserved(self) -> None:
        with patch.dict(os.environ, {"DB_PATH": "/tmp/custom.db"}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.database_path, Path("/tmp/custom.db"))


if __name__ == "__main__":
    unittest.main()
