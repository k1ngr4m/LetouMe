from __future__ import annotations

import unittest
from unittest.mock import Mock

from backend.core.model_config import ModelDefinition
from backend.core.providers.deepseek_adapter import DeepSeekModel


class DeepSeekAdapterTests(unittest.TestCase):
    def _model(self, *, api_model: str, extra: dict | None = None, temperature: float | None = 0.3) -> DeepSeekModel:
        return DeepSeekModel(
            ModelDefinition(
                id=api_model,
                name=api_model,
                provider="deepseek",
                model_id=api_model,
                api_model=api_model,
                api_key_value="test-key",
                base_url_value="https://api.deepseek.com",
                temperature=temperature,
                extra=extra or {},
            ),
            Mock(),
        )

    def test_v4_models_use_json_output_and_thinking_mode(self) -> None:
        kwargs = self._model(api_model="deepseek-v4-pro").request_kwargs()

        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        self.assertEqual(kwargs["extra_body"], {"thinking": {"type": "enabled"}})
        self.assertEqual(kwargs["reasoning_effort"], "high")
        self.assertNotIn("temperature", kwargs)

    def test_legacy_chat_alias_disables_thinking_and_keeps_temperature(self) -> None:
        kwargs = self._model(api_model="deepseek-chat", temperature=0.2).request_kwargs()

        self.assertEqual(kwargs["response_format"], {"type": "json_object"})
        self.assertEqual(kwargs["extra_body"], {"thinking": {"type": "disabled"}})
        self.assertEqual(kwargs["temperature"], 0.2)
        self.assertNotIn("reasoning_effort", kwargs)

    def test_provider_options_can_disable_thinking(self) -> None:
        kwargs = self._model(api_model="deepseek-v4-flash", extra={"thinking_type": "disabled"}).request_kwargs()

        self.assertEqual(kwargs["extra_body"], {"thinking": {"type": "disabled"}})
        self.assertIn("temperature", kwargs)
        self.assertNotIn("reasoning_effort", kwargs)

    def test_provider_options_can_request_max_reasoning_effort(self) -> None:
        kwargs = self._model(api_model="deepseek-v4-pro", extra={"reasoning_effort": "max"}).request_kwargs()

        self.assertEqual(kwargs["reasoning_effort"], "max")


if __name__ == "__main__":
    unittest.main()
