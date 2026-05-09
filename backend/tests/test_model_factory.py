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

    def test_create_passes_custom_headers_to_openai_client(self) -> None:
        definition = ModelDefinition(
            id="custom-openai",
            name="Custom OpenAI",
            provider="openai_compatible",
            model_id="custom-openai",
            api_model="custom-model",
            api_key_value="test-key",
            base_url_value="https://example.com/v1",
            extra={
                "headers": {"X-Old": "old"},
                "custom_headers": {"X-App": "demo", "X-Count": 3, "": "blank"},
            },
        )
        sentinel_client = object()

        with patch("backend.core.model_factory.OpenAI", return_value=sentinel_client) as openai_client:
            model = ModelFactory().create(definition)

        self.assertIs(model.client, sentinel_client)
        openai_client.assert_called_once_with(
            api_key="test-key",
            base_url="https://example.com/v1",
            default_headers={"X-App": "demo"},
        )

    def test_create_supports_legacy_headers_option(self) -> None:
        definition = ModelDefinition(
            id="legacy-openai",
            name="Legacy OpenAI",
            provider="openai_compatible",
            model_id="legacy-openai",
            api_model="legacy-model",
            api_key_value="test-key",
            base_url_value="https://example.com/v1",
            extra={"headers": {"X-App": "demo", "X-Count": 3, " ": "blank"}},
        )

        with patch("backend.core.model_factory.OpenAI") as openai_client:
            ModelFactory().create(definition)

        openai_client.assert_called_once_with(
            api_key="test-key",
            base_url="https://example.com/v1",
            default_headers={"X-App": "demo"},
        )

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
