from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from backend.app.db.connection import ensure_schema
from backend.core.model_config import load_model_registry


class ModelScopeConfigTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        self.db_path = Path(self.temp_dir.name) / "modelscope-test.db"
        self.env = patch.dict(os.environ, {"DB_PATH": str(self.db_path)}, clear=False)
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


if __name__ == "__main__":
    unittest.main()
