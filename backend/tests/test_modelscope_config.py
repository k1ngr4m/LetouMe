from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from backend.app.db.connection import ensure_schema
from backend.core.model_config import load_model_registry


class ModelScopeConfigTests(unittest.TestCase):
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
