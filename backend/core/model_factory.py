# -*- coding: utf-8 -*-
from __future__ import annotations

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

        client = OpenAI(
            api_key=api_key or self._fallback_api_key(definition),
            base_url=definition.base_url(),
        )
        return model_cls(definition, client)

    @staticmethod
    def _requires_api_key(definition: ModelDefinition) -> bool:
        return (definition.provider or "").strip().lower() != "lmstudio"

    @staticmethod
    def _fallback_api_key(definition: ModelDefinition) -> str:
        if (definition.provider or "").strip().lower() == "lmstudio":
            return "lm-studio"
        return ""
