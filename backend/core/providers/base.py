# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from abc import ABC, abstractmethod
from typing import Any

from openai import OpenAI

from backend.core.model_config import ModelDefinition


DEFAULT_SYSTEM_PROMPT = (
    "你是一个专业的彩票数据分析师，擅长基于历史数据进行模式分析和预测。"
    "请严格按照要求返回 JSON 格式数据，不要有任何额外的解释或说明。"
)

HEALTH_CHECK_PROMPT = '仅返回 JSON：{"ok": true}'


class BaseModel(ABC):
    def __init__(self, definition: ModelDefinition, client: OpenAI):
        self.definition = definition
        self.client = client

    @abstractmethod
    def provider_name(self) -> str:
        raise NotImplementedError

    def build_messages(self, prompt: str) -> list[dict[str, str]]:
        return [
            {"role": "system", "content": DEFAULT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt},
        ]

    def request_kwargs(self) -> dict[str, Any]:
        kwargs: dict[str, Any] = {}
        if self.definition.temperature is not None:
            kwargs["temperature"] = self.definition.temperature
        else:
            kwargs["temperature"] = 0
        app_code = self.definition.app_code()
        if app_code and self.definition.uses_aihubmix():
            kwargs["extra_headers"] = {"APP-Code": app_code}
        return kwargs

    def _extract_json(self, response_text: str) -> str:
        text = response_text.strip()
        if "```json" in text:
            start = text.find("```json") + 7
            end = text.find("```", start)
            return text[start:end].strip()
        if "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            return text[start:end].strip()
        return text

    def _chat_completion(self, prompt: str) -> str:
        response = self.client.chat.completions.create(
            model=self.definition.api_model,
            messages=self.build_messages(prompt),
            **self.request_kwargs(),
        )
        return (response.choices[0].message.content or "").strip()

    @staticmethod
    def _preview_text(text: str, limit: int = 800) -> str:
        compact = " ".join(str(text).split())
        if len(compact) <= limit:
            return compact
        return f"{compact[:limit]}...(truncated,{len(compact)} chars)"

    def predict(self, prompt: str) -> dict[str, Any]:
        response_text = self._chat_completion(prompt)
        extracted = self._extract_json(response_text)
        try:
            return json.loads(extracted)
        except Exception as exc:
            preview = self._preview_text(extracted)
            raise ValueError(f"模型响应 JSON 解析失败: {preview}") from exc

    def health_check(self) -> tuple[bool, str]:
        try:
            response_text = self._chat_completion(HEALTH_CHECK_PROMPT)
            parsed = json.loads(self._extract_json(response_text))
            if isinstance(parsed, dict) and parsed.get("ok") is True:
                return True, "ok"
            return False, "响应未包含 ok=true"
        except Exception as exc:  # pragma: no cover - best-effort health check
            return False, f"{type(exc).__name__}: {exc}"
