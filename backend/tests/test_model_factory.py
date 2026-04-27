from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.core.model_config import ModelDefinition
from backend.core.model_factory import ModelFactory
from backend.core.providers.deepseek_adapter import DeepSeekModel
from backend.core.providers.openai_compatible_adapter import OpenAICompatibleModel


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

    def test_create_supports_lmstudio_without_api_key(self) -> None:
        definition = ModelDefinition(
            id="lmstudio-qwen",
            name="LM Studio Qwen",
            provider="lmstudio",
            model_id="lmstudio-qwen",
            api_model="letou_qwen_7b",
            api_format="openai_compatible",
            api_key_value="",
            base_url_value="http://127.0.0.1:1234/v1",
        )

        model = ModelFactory().create(definition)

        self.assertIsInstance(model, OpenAICompatibleModel)
        self.assertEqual(model.provider_name(), "openai_compatible")

    def test_build_openai_client_disables_trust_env_for_lmstudio(self) -> None:
        with (
            patch("backend.core.model_factory.httpx.Client") as httpx_client,
            patch("backend.core.model_factory.OpenAI") as openai_client,
        ):
            sentinel_http_client = object()
            httpx_client.return_value = sentinel_http_client

            ModelFactory.build_openai_client(
                provider="lmstudio",
                base_url="http://127.0.0.1:1234/v1",
                api_key="",
            )

        httpx_client.assert_called_once_with(trust_env=False)
        openai_client.assert_called_once_with(
            api_key="lm-studio",
            base_url="http://127.0.0.1:1234/v1",
            http_client=sentinel_http_client,
        )

    def test_build_openai_client_keeps_default_transport_for_non_lmstudio(self) -> None:
        with (
            patch("backend.core.model_factory.httpx.Client") as httpx_client,
            patch("backend.core.model_factory.OpenAI") as openai_client,
        ):
            ModelFactory.build_openai_client(
                provider="deepseek",
                base_url="https://api.deepseek.com",
                api_key="test-key",
            )

        httpx_client.assert_not_called()
        openai_client.assert_called_once_with(
            api_key="test-key",
            base_url="https://api.deepseek.com",
        )


if __name__ == "__main__":
    unittest.main()
