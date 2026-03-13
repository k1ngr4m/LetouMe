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


if __name__ == "__main__":
    unittest.main()
