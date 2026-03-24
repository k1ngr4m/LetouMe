from __future__ import annotations

import unittest

from backend.app.dlt_rules import (
    is_dlt_new_rule_period,
    resolve_dlt_fallback_prize_amount,
    resolve_dlt_prize_level,
)


class DltRulesTests(unittest.TestCase):
    def test_period_boundary_switches_at_26014(self) -> None:
        self.assertFalse(is_dlt_new_rule_period("26013"))
        self.assertTrue(is_dlt_new_rule_period("26014"))
        self.assertTrue(is_dlt_new_rule_period("2026014"))

    def test_prize_level_mapping_changes_for_2_plus_2(self) -> None:
        self.assertEqual(resolve_dlt_prize_level(2, 2, "26013"), "八等奖")
        self.assertEqual(resolve_dlt_prize_level(2, 2, "26014"), "六等奖")

    def test_new_rule_fixed_prize_uses_previous_pool_threshold(self) -> None:
        self.assertEqual(resolve_dlt_fallback_prize_amount("三等奖", "26014", 799_999_999), 5000)
        self.assertEqual(resolve_dlt_fallback_prize_amount("三等奖", "26014", 800_000_000), 6666)

    def test_new_rule_floating_prize_has_no_fixed_fallback(self) -> None:
        self.assertEqual(resolve_dlt_fallback_prize_amount("一等奖", "26014", 900_000_000), 0)
        self.assertEqual(resolve_dlt_fallback_prize_amount("二等奖", "26014", 100_000_000), 0)


if __name__ == "__main__":
    unittest.main()
