from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.db import connection as db_connection
from backend.app.db.lottery_tables import LOTTERY_SCOPED_TABLES
from backend.app.db.schema import get_schema_statements
from backend.app.db.sqlite_schema import get_sqlite_schema_statements
from backend.app.lotteries import SUPPORTED_LOTTERY_CODES


class SchemaSplitModeTests(unittest.TestCase):
    def test_split_mode_skips_shared_lottery_tables(self) -> None:
        statements = get_schema_statements()
        for table_name in LOTTERY_SCOPED_TABLES:
            self.assertFalse(any(f"CREATE TABLE IF NOT EXISTS {table_name}" in statement for statement in statements))

        for lottery_code in SUPPORTED_LOTTERY_CODES:
            self.assertTrue(any(f"CREATE TABLE IF NOT EXISTS {lottery_code}_draw_issue" in statement for statement in statements))
            self.assertTrue(any(f"CREATE TABLE IF NOT EXISTS {lottery_code}_simulation_ticket_number" in statement for statement in statements))
            self.assertTrue(any(f"CREATE TABLE IF NOT EXISTS {lottery_code}_my_bet_record_line_number" in statement for statement in statements))

    def test_schema_omits_removed_unused_fields(self) -> None:
        schema_sql = "\n".join(get_schema_statements())
        sqlite_schema_sql = "\n".join(get_sqlite_schema_statements())

        for removed_field in ("old_value_text", "sales_close_at", "requested_at", "notes"):
            self.assertNotIn(removed_field, schema_sql)
            self.assertNotIn(removed_field, sqlite_schema_sql)

    def test_sqlite_ensure_schema_creates_database_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            sqlite_path = Path(temp_dir) / "letoume-test.sqlite3"
            db_connection._db_ready = False
            db_connection._schema_ready = False
            db_connection._ready_signature = None
            with patch.dict(os.environ, {"DB_DRIVER": "sqlite", "SQLITE_PATH": str(sqlite_path)}, clear=False):
                db_connection.ensure_schema()
                with db_connection.get_connection() as connection:
                    with connection.cursor() as cursor:
                        cursor.execute("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'app_user'")
                        self.assertEqual((cursor.fetchone() or {}).get("name"), "app_user")
                        cursor.execute("PRAGMA table_info(write_log_detail)")
                        self.assertNotIn("old_value_text", {str(row["name"]) for row in cursor.fetchall()})

            db_connection._db_ready = False
            db_connection._schema_ready = False
            db_connection._ready_signature = None


if __name__ == "__main__":
    unittest.main()
