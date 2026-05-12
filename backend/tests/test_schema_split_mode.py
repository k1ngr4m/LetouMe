from __future__ import annotations

import unittest

from backend.app.db.lottery_tables import LOTTERY_SCOPED_TABLES
from backend.app.db.schema import get_schema_index_migrations, get_schema_migrations, get_schema_statements


class SchemaSplitModeTests(unittest.TestCase):
    def test_split_mode_skips_shared_lottery_tables(self) -> None:
        statements = get_schema_statements()
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_draw_issue" in statement for statement in statements))
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_simulation_ticket_number" in statement for statement in statements))
        self.assertTrue(any("CREATE TABLE IF NOT EXISTS dlt_my_bet_record_line_number" in statement for statement in statements))
        self.assertFalse(any("CREATE TABLE IF NOT EXISTS draw_issue" in statement for statement in statements))
        for table_name in LOTTERY_SCOPED_TABLES:
            self.assertNotIn(table_name, get_schema_migrations())
            self.assertNotIn(table_name, get_schema_index_migrations())


if __name__ == "__main__":
    unittest.main()
