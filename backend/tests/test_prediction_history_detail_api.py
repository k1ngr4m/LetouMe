from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi import HTTPException

from backend.app.api import routes
from backend.app.schemas.requests import PredictionHistoryDetailPayload


class PredictionHistoryDetailApiTests(unittest.TestCase):
    def test_get_predictions_history_detail_wraps_single_record(self) -> None:
        record = {
            "prediction_date": "2026-03-12",
            "target_period": "26026",
            "actual_result": {
                "period": "26026",
                "date": "2026-03-14",
                "red_balls": ["10", "11", "22", "26", "32"],
                "blue_balls": ["01", "08"],
            },
            "models": [
                {
                    "model_id": "model-a",
                    "model_name": "模型A",
                    "model_provider": "openai",
                    "predictions": [],
                    "best_group": 1,
                    "best_hit_count": 3,
                }
            ],
        }

        with patch.object(routes.prediction_service, "get_history_detail_payload", return_value=record) as mocked_get_detail:
            response = routes.get_predictions_history_detail(PredictionHistoryDetailPayload(target_period="26026"), {})

        mocked_get_detail.assert_called_once_with("26026", lottery_code="dlt", include_inactive_models=False)
        self.assertEqual(response["total_count"], 1)
        self.assertEqual(response["predictions_history"], [record])

    def test_get_predictions_history_detail_raises_404_when_missing(self) -> None:
        with patch.object(routes.prediction_service, "get_history_detail_payload", return_value=None) as mocked_get_detail:
            with self.assertRaises(HTTPException) as context:
                routes.get_predictions_history_detail(PredictionHistoryDetailPayload(target_period="99999"), {})

        mocked_get_detail.assert_called_once_with("99999", lottery_code="dlt", include_inactive_models=False)
        self.assertEqual(context.exception.status_code, 404)
        self.assertEqual(context.exception.detail, "历史记录不存在")


if __name__ == "__main__":
    unittest.main()
