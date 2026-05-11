from __future__ import annotations

import unittest

from backend.app.dlt_rules import (
    apply_dlt_promotion_to_prize_amount,
    is_dlt_promotion_eligible,
    is_dlt_promotion_period,
    is_dlt_new_rule_period,
    resolve_dlt_fallback_prize_amount,
    resolve_dlt_fallback_prize_amount_with_promotion,
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

    def test_promotion_period_boundaries(self) -> None:
        self.assertFalse(is_dlt_promotion_period("26049"))
        self.assertTrue(is_dlt_promotion_period("26050"))
        self.assertTrue(is_dlt_promotion_period("26064"))
        self.assertFalse(is_dlt_promotion_period("26065"))

    def test_promotion_requires_ticket_amount_threshold(self) -> None:
        self.assertFalse(is_dlt_promotion_eligible("26050", 16))
        self.assertTrue(is_dlt_promotion_eligible("26050", 18))
        self.assertFalse(is_dlt_promotion_eligible("26065", 18))

    def test_promotion_applies_by_prize_level(self) -> None:
        self.assertEqual(apply_dlt_promotion_to_prize_amount("三等奖", "26050", 5000, 18), 7500)
        self.assertEqual(apply_dlt_promotion_to_prize_amount("六等奖", "26050", 15, 18), 22.5)
        self.assertEqual(apply_dlt_promotion_to_prize_amount("七等奖", "26050", 5, 18), 10)
        self.assertEqual(apply_dlt_promotion_to_prize_amount("三等奖", "26050", 5000, 16), 5000)
        self.assertEqual(apply_dlt_promotion_to_prize_amount("二等奖", "26050", 1000, 18), 1000)

    def test_fallback_prize_with_promotion_uses_jackpot_tier(self) -> None:
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("三等奖", "26050", 799_999_999, 18), 7500)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("四等奖", "26050", 799_999_999, 18), 450)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("五等奖", "26050", 799_999_999, 18), 225)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("六等奖", "26050", 799_999_999, 18), 22.5)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("七等奖", "26050", 799_999_999, 18), 10)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("三等奖", "26050", 800_000_000, 18), 9999)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("四等奖", "26050", 800_000_000, 18), 570)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("五等奖", "26050", 800_000_000, 18), 300)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("六等奖", "26050", 800_000_000, 18), 27)
        self.assertEqual(resolve_dlt_fallback_prize_amount_with_promotion("七等奖", "26050", 800_000_000, 18), 14)


if __name__ == "__main__":
    unittest.main()
