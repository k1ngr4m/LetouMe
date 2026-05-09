from __future__ import annotations

import unittest
from unittest.mock import patch

import requests

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
                base_url="https://api.deepseek.com",
                api_key="",
            )

    def test_create_provider_allows_underscored_provider_codes(self) -> None:
        service = ModelService()
        with patch.object(service.repository, "create_provider", return_value={"code": "aihubmix_1"}) as create_provider:
            result = service.create_provider({
                "code": "aihubmix_1",
                "name": "aihubmix_1",
                "api_format": "openai_compatible",
                "base_url": "https://aihubmix.com/v1",
                "extra_options": {},
                "model_configs": [],
            })

        self.assertEqual(result["code"], "aihubmix_1")
        create_provider.assert_called_once()

    def test_discover_deepseek_models_normalizes_response(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get") as get:
            get.return_value.json.return_value = {
                "object": "list",
                "data": [
                    {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
                    {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"},
                ],
            }

            result = service.discover_provider_models({"provider": "deepseek", "api_key": "sk-test"})

        get.assert_called_once()
        self.assertEqual(get.call_args.kwargs["headers"]["Authorization"], "Bearer sk-test")
        self.assertEqual([item["model_id"] for item in result["models"]], ["deepseek-chat", "deepseek-reasoner"])
        self.assertEqual(result["models"][0]["owner"], "deepseek")

    def test_discover_deepseek_provider_alias_uses_deepseek_endpoint(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get") as get:
            get.return_value.json.return_value = {
                "object": "list",
                "data": [{"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"}],
            }

            result = service.discover_provider_models({"provider": "deepseek_1", "api_key": "sk-test"})

        get.assert_called_once()
        self.assertEqual(get.call_args.args[0], "https://api.deepseek.com/models")
        self.assertEqual(result["models"][0]["model_id"], "deepseek-chat")

    def test_discover_aihubmix_models_normalizes_extended_fields(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get") as get:
            get.return_value.json.return_value = {
                "success": True,
                "data": [
                    {
                        "model_id": "gpt-5",
                        "desc": "Flagship model",
                        "types": "llm",
                        "features": "thinking,tools",
                        "input_modalities": "text,image",
                        "max_output": 128000,
                        "context_length": 400000,
                        "pricing": {"input": 1.25, "output": 10},
                    }
                ],
            }

            result = service.discover_provider_models({"provider": "aihubmix"})

        get.assert_called_once()
        self.assertEqual(get.call_args.args[0], "https://aihubmix.com/api/v1/models")
        model = result["models"][0]
        self.assertEqual(model["model_id"], "gpt-5")
        self.assertEqual(model["description"], "Flagship model")
        self.assertEqual(model["context_length"], 400000)
        self.assertEqual(model["pricing"]["input"], 1.25)

    def test_discover_aihubmix_provider_alias_uses_aihubmix_endpoint(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get") as get:
            get.return_value.json.return_value = {
                "success": True,
                "data": [{"model_id": "gpt-5-mini", "desc": "Mini", "pricing": {}}],
            }

            result = service.discover_provider_models({"provider": "aihubmix_1"})

        get.assert_called_once()
        self.assertEqual(get.call_args.args[0], "https://aihubmix.com/api/v1/models")
        self.assertEqual(result["models"][0]["model_id"], "gpt-5-mini")

    def test_discover_provider_models_rejects_empty_model_list(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get") as get:
            get.return_value.json.return_value = {"data": []}

            with self.assertRaisesRegex(ValueError, "No available models"):
                service.discover_provider_models({"provider": "deepseek"})

    def test_discover_provider_models_reports_request_failure(self) -> None:
        service = ModelService()
        with patch("backend.app.services.model_service.requests.get", side_effect=requests.Timeout("slow")):
            with self.assertRaisesRegex(ValueError, "Provider model list request failed"):
                service.discover_provider_models({"provider": "aihubmix"})


if __name__ == "__main__":
    unittest.main()
