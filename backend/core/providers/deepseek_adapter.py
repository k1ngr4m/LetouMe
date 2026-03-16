# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.core.providers.openai_compatible_adapter import OpenAICompatibleModel


class DeepSeekModel(OpenAICompatibleModel):
    def provider_name(self) -> str:
        return "deepseek"
