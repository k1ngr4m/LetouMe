# -*- coding: utf-8 -*-
from __future__ import annotations

from typing import Any

from backend.core.providers.openai_compatible_adapter import OpenAICompatibleModel


class DeepSeekModel(OpenAICompatibleModel):
    def provider_name(self) -> str:
        return "deepseek"

    def request_kwargs(self) -> dict[str, Any]:
        kwargs = super().request_kwargs()
        kwargs.setdefault("response_format", {"type": "json_object"})

        thinking_type = self._thinking_type()
        if thinking_type:
            kwargs["extra_body"] = {
                **self._extra_body(),
                "thinking": {"type": thinking_type},
            }
        if thinking_type == "enabled":
            kwargs.pop("temperature", None)
            kwargs["reasoning_effort"] = self._reasoning_effort()
        return kwargs

    def _extra_body(self) -> dict[str, Any]:
        value = self.definition.extra.get("extra_body")
        return dict(value) if isinstance(value, dict) else {}

    def _thinking_type(self) -> str:
        raw_thinking = self.definition.extra.get("thinking")
        if isinstance(raw_thinking, dict):
            raw_value = raw_thinking.get("type")
        else:
            raw_value = raw_thinking or self.definition.extra.get("thinking_type")

        normalized = str(raw_value or "").strip().lower()
        if normalized in {"enabled", "disabled"}:
            return normalized

        api_model = self.definition.api_model.strip().lower()
        if api_model == "deepseek-chat":
            return "disabled"
        return "enabled"

    def _reasoning_effort(self) -> str:
        raw_value = str(self.definition.extra.get("reasoning_effort") or "").strip().lower()
        if raw_value in {"max", "xhigh"}:
            return "max"
        return "high"
