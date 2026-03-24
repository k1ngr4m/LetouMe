# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any

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
            raise ValueError(f"不支持的模型供应商: {provider}")

        api_key = definition.api_key()
        if not api_key:
            raise EnvironmentError(f"模型缺少 API Key 配置: {definition.model_id}")

        base_url = definition.base_url()
        client = OpenAI(api_key=api_key, base_url=base_url)
        return model_cls(definition, client)
