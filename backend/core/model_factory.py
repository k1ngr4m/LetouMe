# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any

from openai import OpenAI

from backend.core.model_config import ModelDefinition
from backend.core.providers import (
    AnthropicModel,
    DeepSeekModel,
    GeminiModel,
    OpenAICompatibleModel,
    OpenAIModel,
)
from backend.core.providers.base import BaseModel


class ModelFactory:
    def __init__(self) -> None:
        self._providers = {
            "openai": OpenAIModel,
            "gemini": GeminiModel,
            "anthropic": AnthropicModel,
            "deepseek": DeepSeekModel,
            "openai_compatible": OpenAICompatibleModel,
        }

    def create(self, definition: ModelDefinition) -> BaseModel:
        provider = definition.provider
        if provider not in self._providers:
            raise ValueError(f"不支持的模型供应商: {provider}")

        api_key = definition.api_key()
        if not api_key:
            raise EnvironmentError(f"模型缺少 API Key 配置: {definition.model_id}")

        base_url = definition.base_url()
        client = OpenAI(api_key=api_key, base_url=base_url)
        model_cls = self._providers[provider]
        return model_cls(definition, client)
