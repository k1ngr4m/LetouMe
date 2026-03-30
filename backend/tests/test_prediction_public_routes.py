from __future__ import annotations

from datetime import date
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.api import routes
from backend.app.main import create_app
from backend.app.schemas.requests import PaginationPayload, PredictionsHistoryListPayload


class PredictionPublicRoutesTests(unittest.TestCase):
    def test_predictions_history_payload_accepts_dlt_compound_filter(self) -> None:
        payload = PredictionsHistoryListPayload(play_type_filters=["dlt_compound"])

        self.assertEqual(payload.play_type_filters, ["dlt_compound"])

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

    def test_current_predictions_api_serializes_prediction_date(self) -> None:
        with (
            patch("backend.app.main.ensure_schema"),
            patch("backend.app.main.ensure_rbac_setup"),
            patch("backend.app.main.AuthService") as auth_service_mock,
            patch("backend.app.main.schedule_service.start"),
            patch(
                "backend.app.services.prediction_service.runtime_cache.get_or_set",
                side_effect=lambda _key, ttl_seconds, loader: loader(),
            ),
            patch.object(
                routes.prediction_service.prediction_repository,
                "get_current_prediction",
                return_value={
                    "lottery_code": "dlt",
                    "prediction_date": date(2026, 3, 26),
                    "target_period": "26029",
                    "models": [],
                },
            ) as mocked_get_current,
            patch.object(routes.prediction_service, "_get_current_model_score_profiles", return_value={}),
            patch.object(routes.prediction_service, "_get_active_model_codes", return_value=set()),
        ):
            auth_service_mock.return_value.ensure_bootstrap_admin.return_value = None
            app = create_app()
            app.dependency_overrides[routes.require_current_user] = lambda: {"id": 1, "username": "tester"}

            with TestClient(app) as client:
                response = client.post("/api/predictions/current", json={})

        mocked_get_current.assert_called_once_with(lottery_code="dlt")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["prediction_date"], "2026-03-26")


if __name__ == "__main__":
    unittest.main()
