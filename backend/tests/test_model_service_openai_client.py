from __future__ import annotations

import unittest
from unittest.mock import patch

from backend.app.services.model_service import ModelService


class ModelServiceOpenAIClientTests(unittest.TestCase):
    def test_build_openai_client_uses_model_factory_for_lmstudio(self) -> None:
        with patch("backend.app.services.model_service.ModelFactory.build_openai_client") as build_openai_client:
            sentinel_client = object()
            build_openai_client.return_value = sentinel_client

            client = ModelService._build_openai_client(
                provider="lmstudio",
                base_url="",
                api_key="",
            )

        self.assertIs(client, sentinel_client)
        build_openai_client.assert_called_once_with(
            provider="lmstudio",
            base_url="http://127.0.0.1:1234/v1",
            api_key="",
        )

    def test_build_openai_client_requires_api_key_for_non_lmstudio(self) -> None:
        with self.assertRaisesRegex(ValueError, "API key cannot be empty"):
            ModelService._build_openai_client(
                provider="deepseek",
                base_url="https://api.deepseek.com/v1",
                api_key="",
            )


if __name__ == "__main__":
    unittest.main()
