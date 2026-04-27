from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import MagicMock, patch

from backend.app.db.connection import ensure_schema
from backend.core.model_config import invalidate_model_registry_cache, load_model_registry


class ModelScopeConfigUnitTests(unittest.TestCase):
    def setUp(self) -> None:
        invalidate_model_registry_cache()

    def test_load_registry_does_not_bootstrap_default_models(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.return_value = []
        connection.cursor.return_value.__enter__.return_value = cursor
        connection.__enter__.return_value = connection
        with (
            patch("backend.core.model_config.bootstrap_default_models") as bootstrap_default_models,
            patch("backend.core.model_config.get_connection", return_value=connection),
        ):
            with self.assertRaisesRegex(ValueError, "数据库中没有模型配置"):
                load_model_registry()

        bootstrap_default_models.assert_not_called()

    def test_load_registry_reads_provider_options_from_phase5_tables(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            [
                {
                    "model_code": "phase5-model",
                    "display_name": "Phase5 Model",
                    "provider_code": "openai_compatible",
                    "api_format": "openai_compatible",
                    "provider_id": 7,
                    "provider_base_url": "https://example.com/v1",
                    "provider_api_key": "",
                    "api_model_name": "phase5-api-model",
                    "provider_model_name": "phase5-provider-model",
                    "version": "1",
                    "base_url": "",
                    "api_key": "",
                    "app_code": "",
                    "temperature": 0.6,
                    "is_active": 1,
                    "is_deleted": 0,
                }
            ],
            [],
            [{"model_code": "phase5-model", "lottery_code": "dlt"}],
            [
                {"provider_id": 7, "option_key": "timeout", "option_value": "30"},
                {"provider_id": 7, "option_key": "headers", "option_value": "{\"x-app\":\"demo\"}"},
            ],
        ]
        connection.cursor.return_value.__enter__.return_value = cursor
        connection.__enter__.return_value = connection

        with patch("backend.core.model_config.get_connection", return_value=connection):
            registry = load_model_registry()

        definition = registry.get("phase5-model")
        self.assertEqual(definition.provider, "openai_compatible")
        self.assertEqual(definition.api_model, "phase5-api-model")
        self.assertEqual(definition.extra, {"timeout": 30, "headers": {"x-app": "demo"}})

        executed_sql = "\n".join(str(call.args[0]) for call in cursor.execute.call_args_list)
        self.assertIn("FROM model_provider_option", executed_sql)
        self.assertNotIn("mp.extra_options_json", executed_sql)
        self.assertNotIn("am.provider_id", executed_sql)

    def test_load_registry_uses_short_ttl_cache(self) -> None:
        connection = MagicMock()
        cursor = MagicMock()
        cursor.fetchall.side_effect = [
            [
                {
                    "model_code": "cached-model",
                    "display_name": "Cached Model",
                    "provider_code": "openai_compatible",
                    "api_format": "openai_compatible",
                    "provider_id": 1,
                    "provider_base_url": "https://example.com/v1",
                    "provider_api_key": "",
                    "api_model_name": "cached-api-model",
                    "provider_model_name": "cached-provider-model",
                    "version": "1",
                    "base_url": "",
                    "api_key": "",
                    "app_code": "",
                    "temperature": 0.5,
                    "is_active": 1,
                    "is_deleted": 0,
                }
            ],
            [],
            [{"model_code": "cached-model", "lottery_code": "dlt"}],
            [],
        ]
        connection.cursor.return_value.__enter__.return_value = cursor
        connection.__enter__.return_value = connection

        with patch("backend.core.model_config.get_connection", return_value=connection) as get_connection:
            first = load_model_registry()
            second = load_model_registry()

        self.assertIs(first, second)
        self.assertEqual(get_connection.call_count, 1)


class ModelScopeConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        invalidate_model_registry_cache()
        database_url = os.getenv("MYSQL_TEST_DATABASE_URL")
        if not database_url:
            self.skipTest("MYSQL_TEST_DATABASE_URL is required for MySQL integration tests")
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(
            os.environ,
            {
                "DATABASE_URL": database_url,
                "MYSQL_DATABASE": os.getenv("MYSQL_TEST_DATABASE", "letoume_test"),
            },
            clear=False,
        )
        self.env.start()
        ensure_schema()

    def tearDown(self) -> None:
        self.env.stop()
        self.temp_dir.cleanup()

    def test_registry_loads_glm5_with_dedicated_env_names(self) -> None:
        registry = load_model_registry()

        definition = registry.get("zhipuai-glm-5")

        self.assertEqual(definition.provider, "openai_compatible")
        self.assertEqual(definition.api_model, "ZhipuAI/GLM-5")
        self.assertEqual(definition.api_key(), None)
        self.assertEqual(definition.base_url(), "https://api-inference.modelscope.cn/v1")

    def test_glm5_reads_database_config_values(self) -> None:
        registry = load_model_registry()
        definition = registry.get("zhipuai-glm-5")

        self.assertEqual(definition.api_key(), None)
        self.assertEqual(definition.base_url(), "https://api-inference.modelscope.cn/v1")

    def test_registry_loads_deepseek_models_with_official_provider(self) -> None:
        registry = load_model_registry()

        chat_definition = registry.get("deepseek-v3.2")
        reasoner_definition = registry.get("deepseek-reasoner")

        self.assertEqual(chat_definition.provider, "deepseek")
        self.assertEqual(chat_definition.api_model, "deepseek-chat")
        self.assertEqual(chat_definition.base_url(), "https://api.deepseek.com")
        self.assertEqual(reasoner_definition.provider, "deepseek")
        self.assertEqual(reasoner_definition.api_model, "deepseek-reasoner")
        self.assertEqual(reasoner_definition.base_url(), "https://api.deepseek.com")
        self.assertFalse(reasoner_definition.is_active)


if __name__ == "__main__":
    unittest.main()
