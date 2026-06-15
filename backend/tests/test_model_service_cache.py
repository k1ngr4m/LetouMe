from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import Mock

from backend.app.cache import runtime_cache
from backend.app.services.model_service import ModelService
from backend.core.model_config import ModelDefinition


class ModelServiceCacheTests(unittest.TestCase):
    def setUp(self) -> None:
        runtime_cache.clear()

    def test_set_model_active_invalidates_prediction_cache_prefix(self) -> None:
        repository = Mock()
        repository.set_model_active.return_value = {
            "model_code": "model-a",
            "display_name": "模型A",
            "provider": "openai_compatible",
            "api_model_name": "gpt-4o",
            "version": "1",
            "tags": [],
            "base_url": "https://example.test",
            "api_key": "",
            "app_code": "dlt",
            "temperature": None,
            "is_active": False,
            "is_deleted": False,
            "lottery_codes": ["dlt"],
            "updated_at": datetime(2026, 3, 24, 10, 0, 0),
        }
        service = ModelService(repository=repository)

        runtime_cache.set("predictions:dlt:current:scored:active-models", {"models": ["model-a"]}, ttl_seconds=120)
        runtime_cache.set("predictions:dlt:history:list:v2:20:0:strategy:-:play_type:-:all:active-models", {"total_count": 1}, ttl_seconds=120)

        service.set_model_active("model-a", False)

        self.assertIsNone(runtime_cache.get("predictions:dlt:current:scored:active-models"))
        self.assertIsNone(runtime_cache.get("predictions:dlt:history:list:v2:20:0:strategy:-:play_type:-:all:active-models"))

    def test_bulk_edit_accepts_worldcup_lottery_code(self) -> None:
        repository = Mock()
        repository.get_model.return_value = {
            "model_code": "model-a",
            "display_name": "模型A",
            "provider": "openai_compatible",
            "api_model_name": "gpt-4o",
            "version": "1",
            "tags": [],
            "base_url": "https://example.test",
            "api_key": "",
            "app_code": "",
            "temperature": None,
            "extra_options": {},
            "is_active": True,
            "is_deleted": False,
            "lottery_codes": ["dlt"],
            "updated_at": datetime(2026, 3, 24, 10, 0, 0),
        }
        repository.update_model.return_value = {
            **repository.get_model.return_value,
            "lottery_codes": ["worldcup"],
        }
        service = ModelService(repository=repository)

        result = service.bulk_action(["model-a"], "edit", {"lottery_codes": ["worldcup"]})

        self.assertEqual(result["processed_count"], 1)
        update_payload = repository.update_model.call_args.args[1]
        self.assertEqual(update_payload["lottery_codes"], ["worldcup"])

    def test_model_lottery_normalization_rejects_unknown_lottery_code(self) -> None:
        with self.assertRaisesRegex(ValueError, "不支持的彩种"):
            ModelService._normalize_model_lottery_codes(["worldcup", "unknown"])

    def test_model_definition_supports_worldcup_lottery_code(self) -> None:
        model = ModelDefinition(
            id="worldcup-model",
            name="世界杯模型",
            provider="openai_compatible",
            model_id="gpt-4o",
            api_model="gpt-4o",
            lottery_codes=["worldcup"],
        )

        self.assertTrue(model.supports_lottery("worldcup"))
        self.assertFalse(model.supports_lottery("dlt"))


if __name__ == "__main__":
    unittest.main()
