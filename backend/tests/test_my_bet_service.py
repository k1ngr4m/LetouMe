from __future__ import annotations

import unittest
from types import SimpleNamespace

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

    def test_build_pl3_dantuo_line_payload_uses_position_union_counts(self) -> None:
        payload = self.service._build_pl3_line_payload(
            {
                "play_type": "pl3_dantuo",
                "direct_hundreds_dan": ["01"],
                "direct_hundreds_tuo": ["02", "03"],
                "direct_tens_dan": [],
                "direct_tens_tuo": ["04", "05"],
                "direct_units_dan": ["06"],
                "direct_units_tuo": ["07"],
                "multiplier": 2,
            },
            multiplier=2,
        )
        self.assertEqual(payload["play_type"], "pl3_dantuo")
        self.assertEqual(payload["bet_count"], 12)
        self.assertEqual(payload["amount"], 48)

    def test_pl3_dantuo_settlement_hits_on_exact_position_match(self) -> None:
        result = self.service._calculate_pl3_line_settlement(
            line={
                "play_type": "pl3_dantuo",
                "direct_hundreds": ["01", "02"],
                "direct_tens": ["03", "04"],
                "direct_units": ["05", "06"],
                "multiplier": 1,
            },
            draw={"digits": ["02", "03", "06"]},
        )
        self.assertEqual(result["prize_level"], "直选")
        self.assertEqual(result["winning_bet_count"], 1)
        self.assertEqual(result["hit_direct_hundreds"], ["02"])

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

    def test_build_dlt_dantuo_line_payload_calculates_bet_count_and_amount(self) -> None:
        payload = self.service._build_dlt_line_payload(
            {
                "play_type": "dlt_dantuo",
                "front_dan": ["01", "02"],
                "front_tuo": ["03", "04", "05", "06"],
                "back_dan": ["01"],
                "back_tuo": ["02", "03"],
                "multiplier": 2,
                "is_append": True,
            },
            multiplier=2,
        )
        self.assertEqual(payload["play_type"], "dlt_dantuo")
        self.assertEqual(payload["bet_count"], 8)
        self.assertEqual(payload["amount"], 48)

    def test_dlt_dantuo_settlement_uses_expanded_prize_breakdown(self) -> None:
        result = self.service._calculate_dlt_line_settlement(
            line={
                "play_type": "dlt_dantuo",
                "front_dan": ["01"],
                "front_tuo": ["02", "03", "04", "05", "06"],
                "back_dan": [],
                "back_tuo": ["07", "08"],
                "multiplier": 1,
                "is_append": False,
            },
            draw={
                "period": "26014",
                "red_balls": ["01", "02", "03", "04", "05"],
                "blue_balls": ["07", "09"],
                "prize_breakdown": [
                    {"prize_level": "二等奖", "prize_type": "basic", "prize_amount": 100},
                    {"prize_level": "四等奖", "prize_type": "basic", "prize_amount": 20},
                ],
            },
        )
        self.assertEqual(result["prize_level"], "二等奖")
        self.assertEqual(result["winning_bet_count"], 5)
        self.assertEqual(result["prize_amount"], 180)

    def test_build_qxc_line_payload_calculates_compound_bet_count(self) -> None:
        payload = self.service._build_qxc_line_payload(
            {
                "play_type": "qxc_compound",
                "position_selections": [
                    ["00", "01"],
                    ["02"],
                    ["03"],
                    ["04"],
                    ["05"],
                    ["06"],
                    ["07", "08"],
                ],
            },
            multiplier=2,
        )
        self.assertEqual(payload["play_type"], "qxc_compound")
        self.assertEqual(payload["bet_count"], 4)
        self.assertEqual(payload["amount"], 16)

    def test_qxc_settlement_uses_confirmed_rule_structure(self) -> None:
        result = self.service._calculate_qxc_line_settlement(
            line={
                "play_type": "qxc_compound",
                "position_selections": [
                    ["09"],
                    ["09"],
                    ["06"],
                    ["09"],
                    ["04"],
                    ["00"],
                    ["02", "03"],
                ],
                "multiplier": 1,
            },
            draw={
                "digits": ["09", "09", "06", "09", "04", "00", "01"],
                "prize_breakdown": [
                    {"prize_level": "一等奖", "prize_type": "basic", "prize_amount": 5000000},
                    {"prize_level": "二等奖", "prize_type": "basic", "prize_amount": 129823},
                ],
            },
        )
        self.assertEqual(result["prize_level"], "二等奖")
        self.assertEqual(result["winning_bet_count"], 2)
        self.assertEqual(result["prize_amount"], 259646)

    def test_qxc_settlement_multiplies_sixth_prize_by_all_compound_wins(self) -> None:
        result = self.service._calculate_qxc_line_settlement(
            line={
                "play_type": "qxc_compound",
                "position_selections": [
                    ["01"],
                    ["08", "09"],
                    ["02", "09"],
                    ["01", "04"],
                    ["02"],
                    ["02"],
                    ["13"],
                ],
                "multiplier": 1,
            },
            draw={
                "digits": ["06", "04", "03", "07", "03", "04", "13"],
                "prize_breakdown": [
                    {"prize_level": "一等奖", "prize_type": "basic", "prize_amount": 5000000},
                    {"prize_level": "二等奖", "prize_type": "basic", "prize_amount": 0},
                ],
            },
        )

        self.assertEqual(result["prize_level"], "六等奖")
        self.assertEqual(result["winning_bet_count"], 8)
        self.assertEqual(result["prize_amount"], 40)

    def test_recognize_ticket_image_serializes_qxc_position_selections_without_python_list_strings(self) -> None:
        fake_ocr_service = SimpleNamespace(
            recognize=lambda **_: {
                "lottery_code": "qxc",
                "ticket_image_url": "",
                "ocr_text": "qxc text",
                "ocr_provider": "baidu",
                "ocr_recognized_at": 1776074095,
                "ticket_purchased_at": 1775994919,
                "target_period": "26040",
                "lines": [
                    {
                        "play_type": "qxc_compound",
                        "position_selections": [["01"], ["05"], ["04"], ["02"], ["06"], ["00"], ["08"]],
                        "multiplier": 1,
                        "is_append": False,
                        "bet_count": 1,
                        "amount": 2,
                    }
                ],
                "warnings": [],
            }
        )
        service = MyBetService(ticket_ocr_service=fake_ocr_service)

        draft = service.recognize_ticket_image(lottery_code="qxc", image_bytes=b"img", filename="x.jpg")

        self.assertEqual(len(draft["lines"]), 1)
        self.assertEqual(
            draft["lines"][0]["position_selections"],
            [["01"], ["05"], ["04"], ["02"], ["06"], ["00"], ["08"]],
        )

    def test_build_payload_accepts_discount_amount_within_total(self) -> None:
        payload = self.service._build_payload(
            {
                "target_period": "26040",
                "discount_amount": 6,
                "lines": [
                    {
                        "play_type": "dlt",
                        "front_numbers": ["01", "02", "03", "04", "05"],
                        "back_numbers": ["01", "02"],
                        "multiplier": 3,
                    }
                ],
            },
            lottery_code="dlt",
        )
        self.assertEqual(payload["amount"], 6)
        self.assertEqual(payload["discount_amount"], 6)

    def test_build_payload_rejects_discount_amount_out_of_range(self) -> None:
        with self.assertRaisesRegex(ValueError, "优惠金额不能为负数"):
            self.service._build_payload(
                {
                    "target_period": "26040",
                    "discount_amount": -1,
                    "lines": [
                        {
                            "play_type": "dlt",
                            "front_numbers": ["01", "02", "03", "04", "05"],
                            "back_numbers": ["01", "02"],
                            "multiplier": 1,
                        }
                    ],
                },
                lottery_code="dlt",
            )

        with self.assertRaisesRegex(ValueError, "优惠金额不能超过下注金额"):
            self.service._build_payload(
                {
                    "target_period": "26040",
                    "discount_amount": 100,
                    "lines": [
                        {
                            "play_type": "dlt",
                            "front_numbers": ["01", "02", "03", "04", "05"],
                            "back_numbers": ["01", "02"],
                            "multiplier": 1,
                        }
                    ],
                },
                lottery_code="dlt",
            )

    def test_serialize_with_settlement_uses_net_amount_for_pending_profit(self) -> None:
        self.service.lottery_repository = type(
            "FakeLotteryRepository",
            (),
            {
                "get_draw_by_period": staticmethod(lambda *args, **kwargs: None),
                "get_previous_draw_by_period": staticmethod(lambda *args, **kwargs: None),
            },
        )()
        record = {
            "id": 1,
            "lottery_code": "dlt",
            "target_period": "26040",
            "play_type": "dlt",
            "multiplier": 1,
            "is_append": 0,
            "bet_count": 1,
            "amount": 10,
            "discount_amount": 4,
            "source_type": "manual",
            "created_at": "2026-03-31T00:00:00Z",
            "updated_at": "2026-03-31T00:00:00Z",
            "lines": [
                {
                    "line_no": 1,
                    "play_type": "dlt",
                    "front_numbers": "01,02,03,04,05",
                    "back_numbers": "01,02",
                    "multiplier": 1,
                    "is_append": 0,
                    "bet_count": 1,
                    "amount": 10,
                }
            ],
        }
        result = self.service._serialize_with_settlement(record, lottery_code="dlt")
        self.assertEqual(result["net_amount"], 6)
        self.assertEqual(result["net_profit"], -6)

    def test_list_records_batches_draw_lookup_for_settlement(self) -> None:
        class FakeRepository:
            def list_records(self, user_id: int, lottery_code: str = "dlt"):
                return [
                    {
                        "id": 1,
                        "lottery_code": lottery_code,
                        "target_period": "26040",
                        "play_type": "dlt",
                        "multiplier": 1,
                        "is_append": 0,
                        "bet_count": 1,
                        "amount": 2,
                        "discount_amount": 0,
                        "source_type": "manual",
                        "created_at": "2026-03-31T00:00:00Z",
                        "updated_at": "2026-03-31T00:00:00Z",
                        "lines": [
                            {
                                "line_no": 1,
                                "play_type": "dlt",
                                "front_numbers": "01,02,03,04,05",
                                "back_numbers": "01,02",
                                "multiplier": 1,
                                "is_append": 0,
                                "bet_count": 1,
                                "amount": 2,
                            }
                        ],
                    },
                    {
                        "id": 2,
                        "lottery_code": lottery_code,
                        "target_period": "26040",
                        "play_type": "dlt",
                        "multiplier": 1,
                        "is_append": 0,
                        "bet_count": 1,
                        "amount": 2,
                        "discount_amount": 0,
                        "source_type": "manual",
                        "created_at": "2026-03-31T00:00:00Z",
                        "updated_at": "2026-03-31T00:00:00Z",
                        "lines": [
                            {
                                "line_no": 1,
                                "play_type": "dlt",
                                "front_numbers": "06,07,08,09,10",
                                "back_numbers": "03,04",
                                "multiplier": 1,
                                "is_append": 0,
                                "bet_count": 1,
                                "amount": 2,
                            }
                        ],
                    },
                ]

        class FakeLotteryRepository:
            def __init__(self) -> None:
                self.draw_periods: list[list[str]] = []
                self.previous_periods: list[list[str]] = []

            def list_draws_by_periods(self, periods: list[str], lottery_code: str = "dlt"):
                self.draw_periods.append(list(periods))
                return {}

            def list_previous_jackpot_pool_by_periods(self, periods: list[str], lottery_code: str = "dlt"):
                self.previous_periods.append(list(periods))
                return {}

            def get_draw_by_period(self, *args, **kwargs):
                raise AssertionError("list_records should use batched draw lookup")

            def get_previous_draw_by_period(self, *args, **kwargs):
                raise AssertionError("list_records should use batched previous jackpot lookup")

        lottery_repository = FakeLotteryRepository()
        service = MyBetService(repository=FakeRepository(), lottery_repository=lottery_repository)

        result = service.list_records(1, lottery_code="dlt")

        self.assertEqual(result["summary"]["total_count"], 2)
        self.assertEqual(lottery_repository.draw_periods, [["26040", "26040"]])
        self.assertEqual(lottery_repository.previous_periods, [["26040", "26040"]])


if __name__ == "__main__":
    unittest.main()
