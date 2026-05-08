from __future__ import annotations

import unittest

from backend.app.services.assistant_service import AssistantService


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
                    "records": [{"id": 12, "play_type": "dlt"}],
                },
            }
        )

        self.assertEqual(context["my_bets"]["target_period"], "26001")
        self.assertEqual(context["my_bets"]["record_count"], 1)
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
                    "records": [],
                },
            }
        )

        self.assertIn("我的投注上下文", prompt)
        self.assertIn('"records": []', prompt)
        self.assertIn("不要编造号码或投注记录", prompt)


if __name__ == "__main__":
    unittest.main()
