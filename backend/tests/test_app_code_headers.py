from __future__ import annotations

import unittest
from unittest.mock import Mock

from backend.core.model_config import ModelDefinition
from backend.core.providers.base import BaseModel


class DummyModel(BaseModel):
    def provider_name(self) -> str:
        return "dummy"


class AppCodeHeaderTests(unittest.TestCase):
    def setUp(self) -> None:
        self.definition = ModelDefinition(
            id="test",
            name="Test",
            provider="openai_compatible",
            model_id="test",
            api_model="gpt-4o",
            api_key_value="test-key",
            base_url_value="https://aihubmix.com/v1",
            app_code_value="LWRY3445",
        )

    def test_request_uses_app_code_header_for_aihubmix(self) -> None:
        client = Mock()
        client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content='{"ok": true}'))]
        )

        model = DummyModel(self.definition, client)
        model.health_check()

        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertEqual(kwargs["extra_headers"], {"APP-Code": "LWRY3445"})

    def test_request_skips_app_code_header_when_missing(self) -> None:
        client = Mock()
        client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content='{"ok": true}'))]
        )

        model = DummyModel(
            ModelDefinition(
                **{
                    **self.definition.__dict__,
                    "app_code_value": "",
                }
            ),
            client,
        )
        model.health_check()

        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertNotIn("extra_headers", kwargs)

    def test_request_skips_app_code_header_for_non_aihubmix(self) -> None:
        client = Mock()
        client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content='{"ok": true}'))]
        )

        model = DummyModel(
            ModelDefinition(
                **{
                    **self.definition.__dict__,
                    "base_url_value": "https://api.openai.com/v1",
                }
            ),
            client,
        )
        model.health_check()

        kwargs = client.chat.completions.create.call_args.kwargs
        self.assertNotIn("extra_headers", kwargs)

    def test_predict_wraps_json_parse_error_with_response_preview(self) -> None:
        client = Mock()
        client.chat.completions.create.return_value = Mock(
            choices=[Mock(message=Mock(content="not-a-json-response"))]
        )

        model = DummyModel(self.definition, client)

        with self.assertRaises(ValueError) as exc:
            model.predict("预测输入")

        self.assertIn("模型响应 JSON 解析失败", str(exc.exception))
        self.assertIn("not-a-json-response", str(exc.exception))


if __name__ == "__main__":
    unittest.main()
