from __future__ import annotations

import unittest
from datetime import date, datetime
from unittest.mock import Mock

from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_service import PredictionService


class LotteryHistoryPaginationTests(unittest.TestCase):
    def test_get_history_payload_returns_total_count_and_uses_limit_offset(self) -> None:
        repository = Mock()
        repository.list_draws.return_value = [
            {
                "period": "26025",
                "date": date(2026, 3, 10),
                "red_balls": ["01", "02", "03", "04", "05"],
                "blue_balls": ["06", "07"],
                "updated_at": datetime(2026, 3, 11, 8, 0, 0),
            }
        ]
        repository.count_draws.return_value = 128
        repository.get_latest_draw.return_value = {
            "period": "26025",
            "date": date(2026, 3, 10),
        }

        service = LotteryService(repository=repository)
        payload = service.get_history_payload(limit=20, offset=40)

        repository.list_draws.assert_called_once_with(limit=20, offset=40, lottery_code="dlt")
        self.assertEqual(payload["total_count"], 128)
        self.assertEqual(len(payload["data"]), 1)
        self.assertEqual(payload["data"][0]["date"], "2026-03-10")
        self.assertEqual(payload["next_draw"]["next_period"], "26026")
        self.assertEqual(payload["next_draw"]["next_date_display"], "2026年03月11日")

    def test_normalize_draw_backfills_pl3_fixed_prize_breakdown_when_missing(self) -> None:
        service = LotteryService(repository=Mock())

        payload = service.normalize_draw(
            {
                "lottery_code": "pl3",
                "period": "26042",
                "date": date(2026, 2, 11),
                "digits": ["07", "09", "05"],
                "prize_breakdown": [],
            },
            lottery_code="pl3",
        )

        self.assertEqual([item["prize_level"] for item in payload["prize_breakdown"]], ["直选", "组选3", "组选6"])
        self.assertEqual(payload["prize_breakdown"][0]["prize_amount"], 1040)
        self.assertTrue(payload["prize_breakdown_ready"])

    def test_normalize_draw_backfills_pl5_fixed_prize_breakdown_when_missing(self) -> None:
        service = LotteryService(repository=Mock())

        payload = service.normalize_draw(
            {
                "lottery_code": "pl5",
                "period": "26042",
                "date": date(2026, 2, 11),
                "digits": ["01", "02", "03", "04", "05"],
                "prize_breakdown": [],
            },
            lottery_code="pl5",
        )

        self.assertEqual([item["prize_level"] for item in payload["prize_breakdown"]], ["直选"])
        self.assertEqual(payload["prize_breakdown"][0]["prize_amount"], 100000)
        self.assertTrue(payload["prize_breakdown_ready"])

    def test_normalize_draw_backfills_qxc_breakdown_and_marks_zero_floating_prizes_incomplete(self) -> None:
        service = LotteryService(repository=Mock())

        payload = service.normalize_draw(
            {
                "lottery_code": "qxc",
                "period": "26038",
                "date": date(2026, 4, 7),
                "digits": ["00", "07", "01", "03", "00", "02", "13"],
                "prize_breakdown": [],
            },
            lottery_code="qxc",
        )

        self.assertEqual([item["prize_level"] for item in payload["prize_breakdown"]], ["一等奖", "二等奖", "三等奖", "四等奖", "五等奖", "六等奖"])
        self.assertEqual(payload["prize_breakdown"][0]["prize_amount"], 5000000)
        self.assertEqual(payload["prize_breakdown"][2]["prize_amount"], 3000)
        self.assertFalse(payload["prize_breakdown_ready"])


class PredictionHistoryPaginationTests(unittest.TestCase):
    def test_get_history_list_payload_returns_total_count_and_uses_limit_offset(self) -> None:
        repository = Mock()
        repository.list_history_record_summaries.return_value = [{"target_period": "26025", "models": []}]
        repository.list_history_record_summaries_with_metrics.return_value = {
            "records": [{"target_period": "26025", "models": []}],
            "metrics": {"db_query_ms": 1.23, "batch_count": 1, "model_run_count": 0, "group_metric_count": 0},
        }
        repository.list_history_strategy_options.return_value = []
        repository.count_history_records.return_value = 64

        service = PredictionService(prediction_repository=repository)
        payload = service.get_history_list_payload(limit=20, offset=20)

        repository.list_history_record_summaries_with_metrics.assert_called_once_with(limit=20, offset=20, lottery_code="dlt")
        self.assertEqual(payload["predictions_history"], [])
        self.assertEqual(payload["total_count"], 64)

    def test_get_history_list_payload_pushes_play_type_filters_to_repository(self) -> None:
        repository = Mock()
        repository.list_history_record_summaries_with_metrics.return_value = {
            "records": [{"target_period": "26025", "models": []}],
            "metrics": {"db_query_ms": 1.23, "batch_count": 1, "model_run_count": 0, "group_metric_count": 0},
        }
        repository.list_history_strategy_options.return_value = []
        repository.count_history_records.return_value = 64

        service = PredictionService(prediction_repository=repository)
        payload = service.get_history_list_payload(limit=20, offset=0, play_type_filters=["direct"])

        repository.list_history_record_summaries_with_metrics.assert_called_once_with(
            limit=20,
            offset=0,
            lottery_code="dlt",
            play_type_filters=["direct"],
        )
        repository.count_history_records.assert_called_once_with(lottery_code="dlt", play_type_filters=["direct"])
        self.assertEqual(payload["predictions_history"], [])
        self.assertEqual(payload["total_count"], 64)


if __name__ == "__main__":
    unittest.main()
