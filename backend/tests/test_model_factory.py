from __future__ import annotations

import unittest

from backend.core.model_config import ModelDefinition
from backend.core.model_factory import ModelFactory
from backend.core.providers.deepseek_adapter import DeepSeekModel


class ModelFactoryTests(unittest.TestCase):
    def test_create_supports_deepseek_provider(self) -> None:
        definition = ModelDefinition(
            id="deepseek-v3.2",
            name="DeepSeek-v3.2",
            provider="deepseek",
            model_id="deepseek-v3.2",
            api_model="deepseek-chat",
            api_key_value="test-key",
            base_url_value="https://api.deepseek.com",
        )

        model = ModelFactory().create(definition)

        self.assertIsInstance(model, DeepSeekModel)
        self.assertEqual(model.provider_name(), "deepseek")


if __name__ == "__main__":
    unittest.main()
