from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.db.connection import ensure_schema
from backend.app.main import app


class ModelSettingsApiTests(unittest.TestCase):
    def setUp(self) -> None:
        database_url = os.getenv("MYSQL_TEST_DATABASE_URL")
        if not database_url:
            self.skipTest("MYSQL_TEST_DATABASE_URL is required for MySQL integration tests")
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(
            os.environ,
            {
                "DATABASE_URL": database_url,
                "MYSQL_DATABASE": os.getenv("MYSQL_TEST_DATABASE", "letoume_test"),
                "AUTH_BOOTSTRAP_ADMIN_USERNAME": "admin",
                "AUTH_BOOTSTRAP_ADMIN_PASSWORD": "admin123456",
            },
            clear=False,
        )
        self.env.start()
        ensure_schema()
        self.client = TestClient(app)
        self.client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})

    def tearDown(self) -> None:
        self.env.stop()
        self.temp_dir.cleanup()

    def test_list_models_returns_seeded_database_models(self) -> None:
        response = self.client.post("/api/settings/models/list", json={"include_deleted": False})

        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertTrue(any(model["model_code"] == "claude-sonnet-4.6" for model in payload["models"]))
        self.assertTrue(all(isinstance(model["updated_at"], str) for model in payload["models"]))
        deepseek_chat = next(model for model in payload["models"] if model["model_code"] == "deepseek-v3.2")
        self.assertEqual(deepseek_chat["provider"], "deepseek")
        self.assertEqual(deepseek_chat["api_model_name"], "deepseek-chat")
        self.assertEqual(deepseek_chat["base_url"], "https://api.deepseek.com")

    def test_get_model_detail_serializes_updated_at(self) -> None:
        response = self.client.post("/api/settings/model/detail", json={"model_code": "claude-sonnet-4.6"})

        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json()["updated_at"], str)

    def test_list_providers_includes_deepseek(self) -> None:
        response = self.client.post("/api/settings/providers/list", json={})

        self.assertEqual(response.status_code, 200)
        providers = response.json()["providers"]
        self.assertTrue(any(provider["code"] == "deepseek" and provider["name"] == "DeepSeek" for provider in providers))

    def test_create_update_and_soft_delete_model(self) -> None:
        create_response = self.client.post(
            "/api/settings/models/create",
            json={
                "model_code": "custom-model",
                "display_name": "Custom Model",
                "provider": "openai_compatible",
                "api_model_name": "custom-api-model",
                "version": "v2",
                "tags": ["fast", "lab"],
                "base_url": "https://example.test/v1",
                "api_key": "secret-key",
                "app_code": "APP-123",
                "temperature": 0.6,
                "is_active": True,
            },
        )
        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(create_response.json()["model_code"], "custom-model")

        update_response = self.client.post(
            "/api/settings/models/update",
            json={
                "model_code": "custom-model",
                "display_name": "Custom Model Updated",
                "provider": "openai",
                "api_model_name": "gpt-custom",
                "version": "v3",
                "tags": ["reasoning"],
                "base_url": "https://api.example.test/v1",
                "api_key": "secret-key-2",
                "app_code": "APP-999",
                "temperature": 0.8,
                "is_active": False,
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated_payload = update_response.json()
        self.assertEqual(updated_payload["display_name"], "Custom Model Updated")
        self.assertEqual(updated_payload["provider"], "openai")
        self.assertFalse(updated_payload["is_active"])

        delete_response = self.client.post("/api/settings/models/delete", json={"model_code": "custom-model"})
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["is_deleted"])

        list_response = self.client.post("/api/settings/models/list", json={"include_deleted": False})
        visible_codes = [model["model_code"] for model in list_response.json()["models"]]
        self.assertNotIn("custom-model", visible_codes)

        restore_response = self.client.post("/api/settings/models/restore", json={"model_code": "custom-model"})
        self.assertEqual(restore_response.status_code, 200)
        self.assertFalse(restore_response.json()["is_deleted"])

    def test_patch_status_toggles_active_flag(self) -> None:
        response = self.client.post(
            "/api/settings/models/status",
            json={"model_code": "claude-sonnet-4.6", "is_active": False},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_generate_prediction_task_endpoint_returns_task_payload(self) -> None:
        with (
            patch("backend.app.api.routes.prediction_generation_service.validate_model") as validate_model,
            patch("backend.app.api.routes.prediction_generation_task_service.create_task") as create_task,
        ):
            validate_model.return_value = {"model_code": "claude-sonnet-4.6", "is_deleted": False}
            create_task.return_value = {
                "task_id": "task-1",
                "status": "queued",
                "mode": "current",
                "model_code": "claude-sonnet-4.6",
                "created_at": "2026-03-16T00:00:00Z",
                "started_at": None,
                "finished_at": None,
                "progress_summary": {
                    "mode": "current",
                    "model_code": "claude-sonnet-4.6",
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "failed_periods": [],
                },
                "error_message": None,
            }

            response = self.client.post(
                "/api/settings/models/predictions/generate",
                json={"model_code": "claude-sonnet-4.6", "mode": "current", "overwrite": False},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task_id"], "task-1")
        validate_model.assert_called_once_with("claude-sonnet-4.6")
        create_task.assert_called_once()

    def test_bulk_action_endpoint_returns_summary_payload(self) -> None:
        with patch("backend.app.api.routes.model_service.bulk_action") as bulk_action:
            bulk_action.return_value = {
                "selected_count": 2,
                "processed_count": 1,
                "skipped_count": 1,
                "failed_count": 0,
                "processed_models": ["claude-sonnet-4.6"],
                "skipped_models": ["deepseek-v3.2"],
                "failed_models": [],
            }

            response = self.client.post(
                "/api/settings/models/bulk-action",
                json={"model_codes": ["claude-sonnet-4.6", "deepseek-v3.2"], "action": "disable"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["processed_count"], 1)
        bulk_action.assert_called_once_with(["claude-sonnet-4.6", "deepseek-v3.2"], "disable", {})

    def test_bulk_generate_prediction_task_endpoint_returns_task_payload(self) -> None:
        with patch("backend.app.api.routes.prediction_generation_task_service.create_task") as create_task:
            create_task.return_value = {
                "task_id": "bulk-task-1",
                "status": "queued",
                "mode": "current",
                "model_code": "__bulk__",
                "created_at": "2026-03-16T00:00:00Z",
                "started_at": None,
                "finished_at": None,
                "progress_summary": {
                    "mode": "current",
                    "model_code": "__bulk__",
                    "selected_count": 2,
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "processed_models": [],
                    "skipped_models": [],
                    "failed_models": [],
                },
                "error_message": None,
            }

            response = self.client.post(
                "/api/settings/models/predictions/bulk-generate",
                json={"model_codes": ["claude-sonnet-4.6", "deepseek-v3.2"], "mode": "current", "overwrite": False},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task_id"], "bulk-task-1")
        create_task.assert_called_once()

    def test_settings_prediction_records_list_endpoint(self) -> None:
        with patch("backend.app.api.routes.prediction_service.get_settings_record_list_payload") as get_payload:
            get_payload.return_value = {
                "records": [
                    {
                        "record_type": "current",
                        "target_period": "2026033",
                        "prediction_date": "2026-03-16",
                        "actual_result": None,
                        "model_count": 2,
                        "status_label": "待开奖",
                    }
                ]
            }

            response = self.client.post("/api/settings/predictions/records/list", json={})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["records"][0]["record_type"], "current")

    def test_fetch_lottery_task_endpoint_returns_task_payload(self) -> None:
        with patch("backend.app.api.routes.lottery_fetch_task_service.create_task") as create_task:
            create_task.return_value = {
                "task_id": "lottery-task-1",
                "status": "queued",
                "created_at": "2026-03-16T00:00:00Z",
                "started_at": None,
                "finished_at": None,
                "progress_summary": {
                    "fetched_count": 0,
                    "saved_count": 0,
                    "latest_period": None,
                    "duration_ms": 0,
                },
                "error_message": None,
            }

            response = self.client.post("/api/settings/lottery/fetch", json={})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task_id"], "lottery-task-1")
        create_task.assert_called_once()


if __name__ == "__main__":
    unittest.main()
