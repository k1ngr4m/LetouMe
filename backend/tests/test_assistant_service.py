from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from backend.app.services.assistant_service import AssistantChatSession, AssistantService


class AssistantServiceContextTests(unittest.TestCase):
    def test_normalize_context_keeps_my_bets_context(self) -> None:
        context = AssistantService._normalize_context(
            {
                "lottery_code": "dlt",
                "page_title": "AI 助手",
                "my_bets": {
                    "lottery_code": "dlt",
                    "target_period": "26001",
                    "record_count": 1,
                    "total_bet_count": 3,
                    "total_amount": 6,
                    "total_gross_amount": 9,
                    "total_net_amount": 6,
                    "has_append": True,
                    "append_line_count": 1,
                    "append_bet_count": 1,
                    "append_amount": 3,
                    "records": [{"id": 12, "play_type": "dlt"}],
                },
            }
        )

        self.assertEqual(context["my_bets"]["target_period"], "26001")
        self.assertEqual(context["my_bets"]["record_count"], 1)
        self.assertEqual(context["my_bets"]["total_gross_amount"], 9)
        self.assertEqual(context["my_bets"]["total_net_amount"], 6)
        self.assertTrue(context["my_bets"]["has_append"])
        self.assertEqual(context["my_bets"]["append_line_count"], 1)
        self.assertEqual(context["my_bets"]["records"][0]["id"], 12)

    def test_build_system_prompt_includes_my_bets_context(self) -> None:
        prompt = AssistantService._build_system_prompt(
            {
                "lottery_code": "dlt",
                "lottery_label": "大乐透",
                "page_title": "AI 助手",
                "route_path": "",
                "target_period": "26001",
                "chips": ["AI 助手", "我的投注"],
                "my_bets": {
                    "lottery_code": "dlt",
                    "target_period": "26001",
                    "record_count": 0,
                    "total_bet_count": 0,
                    "total_amount": 0,
                    "has_append": True,
                    "append_line_count": 5,
                    "records": [],
                },
            }
        )

        self.assertIn("我的投注上下文", prompt)
        self.assertIn('"append_line_count": 5', prompt)
        self.assertIn("records[].lines[].is_append", prompt)
        self.assertIn('"records": []', prompt)
        self.assertIn("不要编造号码或投注记录", prompt)

    def test_stream_chat_events_accumulates_and_saves_answer(self) -> None:
        service = AssistantService(repository=Mock())
        session = AssistantChatSession(
            normalized_message="你好",
            normalized_context={"lottery_code": "dlt"},
            model_def=Mock(id="model-a"),
            context_summary="大乐透 · AI 助手",
            conversation={"id": 1, "conversation_id": "asst-1"},
            history=[],
        )
        service.get_conversation_detail = Mock(return_value={"messages": [{"id": 1, "content": "你好"}]})  # type: ignore[method-assign]
        with patch.object(service, "_prepare_chat_session", return_value=session), \
            patch.object(service, "_ask_model_stream", return_value=iter(["你", "好"])), \
            patch.object(service, "_add_assistant_message") as add_message:
            events = list(service.stream_chat_events(user_id=1, message="你好", model_code="model-a"))

        self.assertEqual(events[0]["event"], "meta")
        self.assertEqual([event for event in events if event["event"] == "delta"][0]["content"], "你")
        self.assertEqual(events[-1]["event"], "done")
        add_message.assert_called_once()
        self.assertIn("你好", add_message.call_args.kwargs["content"])

    def test_stream_chat_events_reports_errors_and_saves_error_message(self) -> None:
        service = AssistantService(repository=Mock())
        session = AssistantChatSession(
            normalized_message="你好",
            normalized_context={"lottery_code": "dlt"},
            model_def=Mock(id="model-a"),
            context_summary="大乐透 · AI 助手",
            conversation={"id": 1, "conversation_id": "asst-1"},
            history=[],
        )
        with patch.object(service, "_prepare_chat_session", return_value=session), \
            patch.object(service, "_ask_model_stream", side_effect=RuntimeError("stream failed")), \
            patch.object(service, "_add_assistant_message") as add_message:
            events = list(service.stream_chat_events(user_id=1, message="你好", model_code="model-a"))

        self.assertEqual(events[-1]["event"], "error")
        self.assertEqual(events[-1]["message"], "stream failed")
        add_message.assert_called_once()
        self.assertEqual(add_message.call_args.kwargs["status"], "error")


if __name__ == "__main__":
    unittest.main()
