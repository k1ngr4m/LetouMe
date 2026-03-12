# -*- coding: utf-8 -*-
from __future__ import annotations

from backend.core.providers.base import BaseModel


class GeminiModel(BaseModel):
    def provider_name(self) -> str:
        return "gemini"
