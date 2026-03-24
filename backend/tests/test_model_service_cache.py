from __future__ import annotations

import unittest
from datetime import datetime
from unittest.mock import Mock

from backend.app.cache import runtime_cache
from backend.app.services.model_service import ModelService


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


if __name__ == "__main__":
    unittest.main()
