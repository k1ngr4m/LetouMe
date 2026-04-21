# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import re
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
            if end == -1:
                return text[start:].strip()
            return text[start:end].strip()
        if "```" in text:
            start = text.find("```") + 3
            end = text.find("```", start)
            if end == -1:
                return text[start:].strip()
            return text[start:end].strip()
        return text

    @staticmethod
    def _trim_to_first_json_start(text: str) -> str:
        for index, char in enumerate(text):
            if char in "{[":
                return text[index:]
        return text

    @staticmethod
    def _close_unfinished_json(text: str) -> str:
        stack: list[str] = []
        in_string = False
        escape = False
        collected: list[str] = []
        for char in text:
            collected.append(char)
            if in_string:
                if escape:
                    escape = False
                    continue
                if char == "\\":
                    escape = True
                    continue
                if char == "\"":
                    in_string = False
                continue
            if char == "\"":
                in_string = True
            elif char == "{":
                stack.append("}")
            elif char == "[":
                stack.append("]")
            elif char in "}]":
                if stack and stack[-1] == char:
                    stack.pop()
        repaired = "".join(collected)
        if in_string:
            repaired += "\""
        if stack:
            repaired += "".join(reversed(stack))
        return re.sub(r",(\s*[}\]])", r"\1", repaired)

    def _parse_json_payload(self, response_text: str) -> tuple[dict[str, Any], bool]:
        extracted = self._extract_json(response_text)
        try:
            parsed = json.loads(extracted)
            if not isinstance(parsed, dict):
                raise ValueError("模型响应不是 JSON 对象")
            return parsed, False
        except Exception:
            try:
                repaired = self._close_unfinished_json(self._trim_to_first_json_start(extracted))
                parsed = json.loads(repaired)
                if not isinstance(parsed, dict):
                    raise ValueError("模型响应不是 JSON 对象")
                return parsed, True
            except Exception:
                salvaged = self._salvage_partial_payload(extracted)
                if salvaged is not None:
                    return salvaged, True
                raise

    @staticmethod
    def _salvage_partial_payload(text: str) -> dict[str, Any] | None:
        rows_key_index = text.find('"rows"')
        if rows_key_index < 0:
            return None
        array_start = text.find("[", rows_key_index)
        if array_start < 0:
            return None
        rows: list[dict[str, Any]] = []
        in_string = False
        escape = False
        object_depth = 0
        object_start = -1
        index = array_start + 1
        while index < len(text):
            char = text[index]
            if in_string:
                if escape:
                    escape = False
                elif char == "\\":
                    escape = True
                elif char == "\"":
                    in_string = False
                index += 1
                continue
            if char == "\"":
                in_string = True
            elif char == "{":
                if object_depth == 0:
                    object_start = index
                object_depth += 1
            elif char == "}":
                if object_depth > 0:
                    object_depth -= 1
                    if object_depth == 0 and object_start >= 0:
                        fragment = text[object_start : index + 1]
                        try:
                            parsed = json.loads(fragment)
                            if isinstance(parsed, dict):
                                rows.append(parsed)
                        except Exception:
                            pass
                        object_start = -1
            elif char == "]" and object_depth == 0:
                break
            index += 1
        if not rows:
            return None
        return {
            "rows": rows,
            "warnings": ["模型响应存在截断，系统已使用可解析片段进行恢复。"],
        }

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
        try:
            parsed, repaired = self._parse_json_payload(response_text)
            if repaired:
                parsed.setdefault("_meta", {})
                if isinstance(parsed["_meta"], dict):
                    parsed["_meta"]["json_repaired"] = True
            return parsed
        except Exception as exc:
            preview = self._preview_text(self._extract_json(response_text))
            raise ValueError(f"模型响应 JSON 解析失败: {preview}") from exc

    def health_check(self) -> tuple[bool, str]:
        try:
            response_text = self._chat_completion(HEALTH_CHECK_PROMPT)
            parsed, _ = self._parse_json_payload(response_text)
            if isinstance(parsed, dict) and parsed.get("ok") is True:
                return True, "ok"
            return False, "响应未包含 ok=true"
        except Exception as exc:  # pragma: no cover - best-effort health check
            return False, f"{type(exc).__name__}: {exc}"
