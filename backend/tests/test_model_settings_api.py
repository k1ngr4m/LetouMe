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
        self.assertEqual(deepseek_chat["base_url"], "https://api.deepseek.com/v1")

    def test_get_model_detail_serializes_updated_at(self) -> None:
        response = self.client.post("/api/settings/model/detail", json={"model_code": "claude-sonnet-4.6"})

        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json()["updated_at"], str)

    def test_list_providers_includes_deepseek_and_lmstudio(self) -> None:
        response = self.client.post("/api/settings/providers/list", json={})

        self.assertEqual(response.status_code, 200)
        providers = response.json()["providers"]
        self.assertTrue(any(provider["code"] == "deepseek" and provider["name"] == "DeepSeek" for provider in providers))
        self.assertTrue(any(provider["code"] == "lmstudio" and provider["name"] == "LM Studio" for provider in providers))

    def test_discover_provider_models_endpoint_returns_result(self) -> None:
        with patch("backend.app.api.routes.model_service.discover_provider_models") as discover_provider_models:
            discover_provider_models.return_value = {
                "models": [
                    {"model_id": "letou_qwen_7b", "display_name": "letou_qwen_7b"},
                ]
            }

            response = self.client.post(
                "/api/settings/providers/models/discover",
                json={
                    "provider": "lmstudio",
                    "base_url": "http://127.0.0.1:1234/v1",
                    "api_key": "",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["models"][0]["model_id"], "letou_qwen_7b")
        discover_provider_models.assert_called_once()

    def test_create_update_and_delete_provider(self) -> None:
        create_response = self.client.post(
            "/api/settings/providers/create",
            json={
                "code": "custom-provider",
                "name": "Custom Provider",
                "api_format": "openai_compatible",
                "website_url": "https://example.test",
                "base_url": "https://api.example.test/v1",
                "api_key": "test-key",
                "remark": "test",
                "extra_options": {"timeout": 30},
                "model_configs": [{"model_id": "test-model", "display_name": "Test Model"}],
            },
        )
        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(create_response.json()["code"], "custom-provider")

        update_response = self.client.post(
            "/api/settings/providers/update",
            json={
                "provider_code": "custom-provider",
                "name": "Custom Provider Updated",
                "api_format": "anthropic",
                "website_url": "https://example.test",
                "base_url": "https://api.example.test/v2",
                "api_key": "test-key-2",
                "remark": "updated",
                "extra_options": {"timeout": 45},
                "model_configs": [{"model_id": "test-model-2", "display_name": "Test Model 2"}],
            },
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["name"], "Custom Provider Updated")
        self.assertEqual(update_response.json()["api_format"], "anthropic")

        delete_response = self.client.post("/api/settings/providers/delete", json={"provider_code": "custom-provider"})
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["success"])

    def test_create_update_and_soft_delete_model(self) -> None:
        create_response = self.client.post(
            "/api/settings/models/create",
            json={
                "model_code": "custom-model",
                "display_name": "Custom Model",
                "provider": "openai_compatible",
                "api_model_name": "custom-api-model",
                "base_url": "https://example.test/v1",
                "api_key": "secret-key",
                "app_code": "APP-123",
                "is_active": True,
            },
        )
        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(create_response.json()["model_code"], "custom-model")

        update_response = self.client.post(
            "/api/settings/models/update",
            json={
                "original_model_code": "custom-model",
                "model_code": "custom-model",
                "display_name": "Custom Model Updated",
                "provider": "openai",
                "api_model_name": "gpt-custom",
                "base_url": "https://api.example.test/v1",
                "api_key": "secret-key-2",
                "app_code": "APP-999",
                "is_active": False,
            },
        )
        self.assertEqual(update_response.status_code, 200)
        updated_payload = update_response.json()
        self.assertEqual(updated_payload["display_name"], "Custom Model Updated")
        self.assertEqual(updated_payload["provider"], "openai")
        self.assertFalse(updated_payload["is_active"])

        rename_response = self.client.post(
            "/api/settings/models/update",
            json={
                "original_model_code": "custom-model",
                "model_code": "custom-model-renamed",
                "display_name": "Custom Model Updated",
                "provider": "openai",
                "api_model_name": "gpt-custom",
                "base_url": "https://api.example.test/v1",
                "api_key": "secret-key-2",
                "app_code": "APP-999",
                "temperature": 0.3,
                "is_active": False,
            },
        )
        self.assertEqual(rename_response.status_code, 200)
        self.assertEqual(rename_response.json()["model_code"], "custom-model-renamed")

        delete_response = self.client.post("/api/settings/models/delete", json={"model_code": "custom-model-renamed"})
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["is_deleted"])

        list_response = self.client.post("/api/settings/models/list", json={"include_deleted": False})
        visible_codes = [model["model_code"] for model in list_response.json()["models"]]
        self.assertNotIn("custom-model", visible_codes)
        self.assertNotIn("custom-model-renamed", visible_codes)

        restore_response = self.client.post("/api/settings/models/restore", json={"model_code": "custom-model-renamed"})
        self.assertEqual(restore_response.status_code, 200)
        self.assertFalse(restore_response.json()["is_deleted"])

    def test_patch_status_toggles_active_flag(self) -> None:
        response = self.client.post(
            "/api/settings/models/status",
            json={"model_code": "claude-sonnet-4.6", "is_active": False},
        )

        self.assertEqual(response.status_code, 200)
        self.assertFalse(response.json()["is_active"])

    def test_connectivity_test_endpoint_returns_result(self) -> None:
        with patch("backend.app.api.routes.model_service.test_model_connectivity") as test_connectivity:
            test_connectivity.return_value = {"ok": True, "message": "ok", "duration_ms": 123}

            response = self.client.post(
                "/api/settings/models/connectivity-test",
                json={
                    "provider": "deepseek",
                    "api_format": "openai_compatible",
                    "api_model_name": "deepseek-chat",
                    "base_url": "https://api.deepseek.com/v1",
                    "api_key": "test-key",
                    "app_code": "",
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.json()["ok"])
        self.assertEqual(response.json()["duration_ms"], 123)
        test_connectivity.assert_called_once()

    def test_connectivity_test_endpoint_returns_error_detail(self) -> None:
        with patch("backend.app.api.routes.model_service.test_model_connectivity") as test_connectivity:
            test_connectivity.side_effect = ValueError("模型缺少 API Key 配置")
            response = self.client.post(
                "/api/settings/models/connectivity-test",
                json={
                    "provider": "deepseek",
                    "api_format": "openai_compatible",
                    "api_model_name": "deepseek-chat",
                    "base_url": "https://api.deepseek.com/v1",
                    "api_key": "",
                    "app_code": "",
                },
            )

        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.json()["detail"], "模型缺少 API Key 配置")

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
                    "completed_count": 0,
                    "failed_details": [],
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
                    "completed_count": 0,
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "processed_models": [],
                    "skipped_models": [],
                    "failed_models": [],
                    "failed_details": [],
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

    def test_generate_prediction_task_endpoint_accepts_recent_period_count(self) -> None:
        with (
            patch("backend.app.api.routes.prediction_generation_service.validate_model") as validate_model,
            patch("backend.app.api.routes.prediction_generation_task_service.create_task") as create_task,
        ):
            validate_model.return_value = {"model_code": "claude-sonnet-4.6", "is_deleted": False}
            create_task.return_value = {
                "task_id": "task-2",
                "status": "queued",
                "mode": "history",
                "model_code": "claude-sonnet-4.6",
                "created_at": "2026-03-16T00:00:00Z",
                "started_at": None,
                "finished_at": None,
                "progress_summary": {
                    "mode": "history",
                    "model_code": "claude-sonnet-4.6",
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "failed_periods": [],
                    "completed_count": 0,
                    "failed_details": [],
                },
                "error_message": None,
            }

            response = self.client.post(
                "/api/settings/models/predictions/generate",
                json={"model_code": "claude-sonnet-4.6", "mode": "history", "overwrite": False, "recent_period_count": 10},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["task_id"], "task-2")
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
        create_task.assert_called_once_with("dlt", limit=30)

    def test_fetch_lottery_logs_endpoint_returns_list_payload(self) -> None:
        with patch("backend.app.api.routes.lottery_fetch_task_service.list_logs") as list_logs:
            list_logs.return_value = {
                "logs": [
                    {
                        "id": 1,
                        "task_id": "lottery-task-1",
                        "lottery_code": "dlt",
                        "trigger_type": "manual",
                        "task_type": "lottery_fetch",
                        "mode": None,
                        "model_code": None,
                        "status": "succeeded",
                        "started_at": "2026-03-16T00:00:01Z",
                        "finished_at": "2026-03-16T00:00:03Z",
                        "fetched_count": 30,
                        "saved_count": 30,
                        "processed_count": 0,
                        "skipped_count": 0,
                        "failed_count": 0,
                        "latest_period": "26030",
                        "duration_ms": 1234.5,
                        "error_message": None,
                        "created_at": "2026-03-16T00:00:00Z",
                        "updated_at": "2026-03-16T00:00:03Z",
                    }
                ],
                "total_count": 1,
            }

            response = self.client.post("/api/settings/lottery/fetch/logs", json={"lottery_code": "dlt", "limit": 20, "offset": 0})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["total_count"], 1)
        self.assertEqual(response.json()["logs"][0]["status"], "succeeded")
        list_logs.assert_called_once_with(lottery_code="dlt", limit=20, offset=0)

    def test_schedule_task_endpoints(self) -> None:
        with (
            patch("backend.app.api.routes.schedule_service.list_tasks") as list_tasks,
            patch("backend.app.api.routes.schedule_service.create_task") as create_task,
            patch("backend.app.api.routes.schedule_service.set_task_active") as set_task_active,
            patch("backend.app.api.routes.schedule_service.run_task_now") as run_task_now,
        ):
            schedule_payload = {
                "task_code": "sched-predict-dlt",
                "task_name": "大乐透预测",
                "task_type": "prediction_generate",
                "lottery_code": "dlt",
                "model_codes": ["claude-sonnet-4.6"],
                "generation_mode": "current",
                "prediction_play_mode": "direct",
                "overwrite_existing": False,
                "schedule_mode": "preset",
                "preset_type": "daily",
                "time_of_day": "10:00",
                "weekdays": [],
                "cron_expression": None,
                "is_active": True,
                "next_run_at": "2026-03-19T02:00:00Z",
                "last_run_at": None,
                "last_run_status": None,
                "last_error_message": None,
                "last_task_id": None,
                "rule_summary": "每日 10:00",
                "created_at": "2026-03-18T02:00:00Z",
                "updated_at": "2026-03-18T02:00:00Z",
            }
            list_tasks.return_value = [schedule_payload]
            create_task.return_value = schedule_payload
            set_task_active.return_value = {**schedule_payload, "is_active": False}
            run_task_now.return_value = {**schedule_payload, "last_run_status": "queued"}

            list_response = self.client.post("/api/settings/schedules/list", json={})
            create_response = self.client.post(
                "/api/settings/schedules/create",
                json={
                    "task_name": "大乐透预测",
                    "task_type": "prediction_generate",
                    "lottery_code": "dlt",
                    "model_codes": ["claude-sonnet-4.6"],
                    "generation_mode": "current",
                    "prediction_play_mode": "direct",
                    "overwrite_existing": False,
                    "schedule_mode": "preset",
                    "preset_type": "daily",
                    "time_of_day": "10:00",
                    "weekdays": [],
                    "is_active": True,
                },
            )
            status_response = self.client.post(
                "/api/settings/schedules/status",
                json={"task_code": "sched-predict-dlt", "is_active": False},
            )
            run_response = self.client.post(
                "/api/settings/schedules/run-now",
                json={"task_code": "sched-predict-dlt"},
            )

        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.json()["tasks"][0]["task_code"], "sched-predict-dlt")
        self.assertEqual(create_response.status_code, 200)
        self.assertEqual(create_response.json()["task_name"], "大乐透预测")
        self.assertEqual(status_response.status_code, 200)
        self.assertFalse(status_response.json()["is_active"])
        self.assertEqual(run_response.status_code, 200)
        self.assertEqual(run_response.json()["last_run_status"], "queued")


if __name__ == "__main__":
    unittest.main()
