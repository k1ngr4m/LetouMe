from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import Mock

from backend.app.services.lottery_service import LotteryService
from backend.app.services.prediction_service import PredictionService


class LotteryHistoryPaginationTests(unittest.TestCase):
    def test_get_history_payload_returns_total_count_and_uses_limit_offset(self) -> None:
        repository = Mock()
        repository.list_draws.return_value = [
            {
                "period": "26025",
                "date": "2026-03-10",
                "red_balls": ["01", "02", "03", "04", "05"],
                "blue_balls": ["06", "07"],
                "updated_at": datetime(2026, 3, 11, 8, 0, 0),
            }
        ]
        repository.count_draws.return_value = 128
        repository.get_latest_draw.return_value = {
            "period": "26025",
            "date": "2026-03-10",
        }

        service = LotteryService(repository=repository)
        payload = service.get_history_payload(limit=20, offset=40)

        repository.list_draws.assert_called_once_with(limit=20, offset=40)
        self.assertEqual(payload["total_count"], 128)
        self.assertEqual(len(payload["data"]), 1)
        self.assertEqual(payload["next_draw"]["next_period"], "26026")


class PredictionHistoryPaginationTests(unittest.TestCase):
    def test_get_history_list_payload_returns_total_count_and_uses_limit_offset(self) -> None:
        repository = Mock()
        repository.list_history_record_summaries.return_value = [{"target_period": "26025", "models": []}]
        repository.count_history_records.return_value = 64

        service = PredictionService(prediction_repository=repository)
        payload = service.get_history_list_payload(limit=20, offset=20)

        repository.list_history_record_summaries.assert_called_once_with(limit=20, offset=20)
        self.assertEqual(payload["predictions_history"], [{"target_period": "26025", "models": []}])
        self.assertEqual(payload["total_count"], 64)


if __name__ == "__main__":
    unittest.main()
