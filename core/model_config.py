# -*- coding: utf-8 -*-
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Iterable, Mapping


DEFAULT_CONFIG_PATH = Path("config/models.json")
DEFAULT_BASE_URL = "https://aihubmix.com/v1"
DEFAULT_BASE_URL_ENV = "AI_BASE_URL"
DEFAULT_API_KEY_ENV = "AI_API_KEY"


@dataclass(frozen=True)
class ModelDefinition:
    id: str
    name: str
    provider: str
    model_id: str
    api_model: str
    api_key_env: str = DEFAULT_API_KEY_ENV
    base_url_env: str = DEFAULT_BASE_URL_ENV
    version: str | None = None
    tags: list[str] = field(default_factory=list)
    temperature: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def api_key(self) -> str | None:
        key = os.environ.get(self.api_key_env)
        if not key and self.api_key_env != "OPENAI_API_KEY":
            key = os.environ.get("OPENAI_API_KEY")
        return key

    def base_url(self) -> str:
        base = os.environ.get(self.base_url_env) if self.base_url_env else None
        if base:
            return base
        base = os.environ.get(DEFAULT_BASE_URL_ENV)
        return base or DEFAULT_BASE_URL

    def has_tags(self, include_tags: Iterable[str]) -> bool:
        if not include_tags:
            return True
        tags = {t.lower() for t in self.tags}
        return all(t.lower() in tags for t in include_tags)


class ModelRegistry:
    def __init__(self, definitions: Mapping[str, ModelDefinition], active_ids: list[str]):
        self._definitions = dict(definitions)
        self._active_ids = list(active_ids)

    @property
    def active_ids(self) -> list[str]:
        return list(self._active_ids)

    def get(self, model_id: str) -> ModelDefinition:
        return self._definitions[model_id]

    def select(
        self,
        model_ids: Iterable[str] | None = None,
        include_tags: Iterable[str] | None = None,
    ) -> list[ModelDefinition]:
        if model_ids:
            chosen_ids = list(model_ids)
        else:
            chosen_ids = list(self._active_ids)

        include_tags = list(include_tags or [])
        results: list[ModelDefinition] = []
        for model_id in chosen_ids:
            if model_id not in self._definitions:
                raise KeyError(f"模型配置不存在: {model_id}")
            model_def = self._definitions[model_id]
            if model_def.has_tags(include_tags):
                results.append(model_def)
        return results


def load_model_registry(config_path: Path | str = DEFAULT_CONFIG_PATH) -> ModelRegistry:
    path = Path(config_path)
    if not path.exists():
        raise FileNotFoundError(f"模型配置文件不存在: {path}")

    with path.open("r", encoding="utf-8") as f:
        data = json.load(f)

    active_models = data.get("active_models", [])
    raw_defs = data.get("model_definitions", {})
    if not isinstance(raw_defs, dict):
        raise ValueError("model_definitions 必须是对象")

    definitions: dict[str, ModelDefinition] = {}
    for model_key, raw in raw_defs.items():
        if not isinstance(raw, dict):
            raise ValueError(f"模型 {model_key} 配置格式错误")
        definitions[model_key] = ModelDefinition(
            id=model_key,
            name=str(raw.get("name", model_key)),
            provider=str(raw.get("provider", "openai_compatible")),
            model_id=str(raw.get("model_id", model_key)),
            api_model=str(raw.get("api_model", model_key)),
            api_key_env=str(raw.get("api_key_env", DEFAULT_API_KEY_ENV)),
            base_url_env=str(raw.get("base_url_env", DEFAULT_BASE_URL_ENV)),
            version=raw.get("version"),
            tags=list(raw.get("tags", [])),
            temperature=raw.get("temperature"),
            extra=dict(raw.get("extra", {})),
        )

    return ModelRegistry(definitions=definitions, active_ids=list(active_models))
