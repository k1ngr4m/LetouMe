from __future__ import annotations

import unittest

from backend.app.services.my_bet_service import MyBetService


class MyBetServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = MyBetService()

    def test_build_pl3_direct_sum_line_payload_uses_sum_rule_counts(self) -> None:
        payload = self.service._build_pl3_line_payload(
            {"play_type": "direct_sum", "sum_values": ["10", "11"], "multiplier": 2},
            multiplier=2,
        )
        self.assertEqual(payload["play_type"], "direct_sum")
        self.assertEqual(payload["sum_values"], "10,11")
        self.assertEqual(payload["bet_count"], 132)
        self.assertEqual(payload["amount"], 528)

    def test_build_pl3_group_sum_line_payload_uses_group_sum_counts(self) -> None:
        payload = self.service._build_pl3_line_payload(
            {"play_type": "group_sum", "sum_values": ["10", "11"], "multiplier": 1},
            multiplier=1,
        )
        self.assertEqual(payload["play_type"], "group_sum")
        self.assertEqual(payload["sum_values"], "10,11")
        self.assertGreater(int(payload["bet_count"]), 0)
        self.assertEqual(payload["amount"], int(payload["bet_count"]) * 2)

    def test_build_pl3_sum_line_payload_rejects_invalid_sum(self) -> None:
        with self.assertRaises(ValueError):
            self.service._build_pl3_line_payload(
                {"play_type": "group_sum", "sum_values": ["28"], "multiplier": 1},
                multiplier=1,
            )

    def test_pl3_direct_sum_settlement_hits_on_matching_sum(self) -> None:
        result = self.service._calculate_pl3_line_settlement(
            line={"play_type": "direct_sum", "sum_values": ["03"], "multiplier": 1},
            draw={"digits": ["01", "01", "01"]},
        )
        self.assertEqual(result["prize_level"], "和值")
        self.assertEqual(result["winning_bet_count"], 1)
        self.assertEqual(result["hit_sum_values"], ["03"])

    def test_pl3_group_sum_settlement_excludes_baozi(self) -> None:
        baozi_result = self.service._calculate_pl3_line_settlement(
            line={"play_type": "group_sum", "sum_values": ["03"], "multiplier": 1},
            draw={"digits": ["01", "01", "01"]},
        )
        self.assertIsNone(baozi_result["prize_level"])
        self.assertEqual(baozi_result["winning_bet_count"], 0)

        hit_result = self.service._calculate_pl3_line_settlement(
            line={"play_type": "group_sum", "sum_values": ["04"], "multiplier": 1},
            draw={"digits": ["01", "01", "02"]},
        )
        self.assertEqual(hit_result["prize_level"], "和值")
        self.assertEqual(hit_result["winning_bet_count"], 1)
        self.assertEqual(hit_result["hit_sum_values"], ["04"])


if __name__ == "__main__":
    unittest.main()
