from __future__ import annotations

import unittest

from backend.app.db.lottery_tables import LOTTERY_SCOPED_TABLES
from backend.app.db.schema import get_schema_index_migrations, get_schema_migrations, get_schema_statements


class SchemaSplitModeTests(unittest.TestCase):
    def test_split_mode_skips_shared_lottery_tables(self) -> None:
        statements = get_schema_statements(split_enabled=True)
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_draw_issue" in statement for statement in statements))
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_simulation_ticket_number" in statement for statement in statements))
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_my_bet_record_line_number" in statement for statement in statements))
        self.assertFalse(any("CREATE TABLE IF NOT EXISTS draw_issue" in statement for statement in statements))
        for table_name in LOTTERY_SCOPED_TABLES:
            self.assertNotIn(table_name, get_schema_migrations(split_enabled=True))
            self.assertNotIn(table_name, get_schema_index_migrations(split_enabled=True))

    def test_non_split_mode_keeps_shared_lottery_tables(self) -> None:
        statements = get_schema_statements(split_enabled=False)
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS draw_issue" in statement for statement in statements))
        self.assertIn("draw_issue", get_schema_migrations(split_enabled=False))
        self.assertIn("draw_result_number", get_schema_index_migrations(split_enabled=False))


if __name__ == "__main__":
    unittest.main()
