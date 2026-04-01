# -*- coding: utf-8 -*-
from __future__ import annotations

import httpx
from openai import OpenAI

from backend.core.model_config import ModelDefinition
from backend.core.providers import (
    AnthropicModel,
    AmazonBedrockModel,
    DeepSeekModel,
    GeminiModel,
    OpenAICompatibleModel,
    OpenAIModel,
    OpenAIResponsesModel,
)
from backend.core.providers.base import BaseModel


class ModelFactory:
    def __init__(self) -> None:
        self._provider_routes = {
            "openai": OpenAIModel,
            "gemini": GeminiModel,
            "anthropic": AnthropicModel,
            "deepseek": DeepSeekModel,
            "lmstudio": OpenAICompatibleModel,
            "openai_compatible": OpenAICompatibleModel,
        }
        self._api_format_routes = {
            "openai_responses": OpenAIResponsesModel,
            "openai_compatible": OpenAICompatibleModel,
            "anthropic": AnthropicModel,
            "amazon_bedrock": AmazonBedrockModel,
            "google_gemini": GeminiModel,
        }

    def create(self, definition: ModelDefinition) -> BaseModel:
        api_format = (definition.api_format or "").strip().lower()
        provider = (definition.provider or "").strip().lower()
        model_cls = self._api_format_routes.get(api_format) or self._provider_routes.get(provider)
        if model_cls is None:
            raise ValueError(f"Unsupported model provider: {provider}")

        api_key = definition.api_key()
        if self._requires_api_key(definition) and not api_key:
            raise EnvironmentError(f"Missing API key for model: {definition.model_id}")

        client = self.build_openai_client(
            provider=provider,
            base_url=definition.base_url(),
            api_key=api_key,
        )
        return model_cls(definition, client)

    @classmethod
    def build_openai_client(cls, *, provider: str, base_url: str, api_key: str | None) -> OpenAI:
        normalized_provider = str(provider or "").strip().lower()
        normalized_base_url = str(base_url or "").strip()
        normalized_api_key = str(api_key or "").strip() or cls._fallback_api_key_from_provider(normalized_provider)
        kwargs = {
            "api_key": normalized_api_key,
            "base_url": normalized_base_url,
        }
        if normalized_provider == "lmstudio":
            kwargs["http_client"] = httpx.Client(trust_env=False)
        return OpenAI(**kwargs)

    @staticmethod
    def _requires_api_key(definition: ModelDefinition) -> bool:
        return (definition.provider or "").strip().lower() != "lmstudio"

    @staticmethod
    def _fallback_api_key(definition: ModelDefinition) -> str:
        return ModelFactory._fallback_api_key_from_provider((definition.provider or "").strip().lower())

    @staticmethod
    def _fallback_api_key_from_provider(provider: str) -> str:
        if provider == "lmstudio":
            return "lm-studio"
        return ""
