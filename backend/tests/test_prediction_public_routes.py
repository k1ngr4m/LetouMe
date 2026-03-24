from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.api import routes
from backend.app.schemas.requests import PaginationPayload, PredictionsHistoryListPayload


class PredictionPublicRoutesTests(unittest.TestCase):
    def test_get_current_predictions_hides_inactive_models(self) -> None:
        with patch.object(routes.prediction_service, "get_current_payload") as mocked_get_current:
            mocked_get_current.return_value = {
                "lottery_code": "dlt",
                "prediction_date": "",
                "target_period": "",
                "models": [],
            }

            response = routes.get_current_predictions(PaginationPayload(), {})

        mocked_get_current.assert_called_once_with(lottery_code="dlt", include_inactive_models=False)
        self.assertEqual(response["lottery_code"], "dlt")

    def test_get_predictions_history_list_hides_inactive_models(self) -> None:
        with patch.object(routes.prediction_service, "get_history_list_payload") as mocked_get_history_list:
            mocked_get_history_list.return_value = {
                "lottery_code": "dlt",
                "predictions_history": [],
                "total_count": 0,
                "model_stats": [],
                "strategy_options": [],
            }

            response = routes.get_predictions_history_list(PredictionsHistoryListPayload(), {})

        mocked_get_history_list.assert_called_once_with(
            limit=None,
            offset=0,
            lottery_code="dlt",
            strategy_filters=[],
            play_type_filters=[],
            strategy_match_mode="all",
            include_inactive_models=False,
        )
        self.assertEqual(response["total_count"], 0)


if __name__ == "__main__":
    unittest.main()
