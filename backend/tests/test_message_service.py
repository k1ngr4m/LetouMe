from __future__ import annotations

import unittest

from backend.app.services.message_service import MessageService


class _FakeMessageRepository:
    def __init__(self) -> None:
        self.created_keys: set[tuple[int, str, str, int, str]] = set()
        self.created_payloads: list[dict] = []
        self.last_list_kwargs: dict | None = None

    def create_settlement_message(self, payload: dict) -> bool:
        key = (
            int(payload.get("user_id") or 0),
            str(payload.get("lottery_code") or ""),
            str(payload.get("target_period") or ""),
            int(payload.get("my_bet_record_id") or 0),
            str(payload.get("message_type") or ""),
        )
        if key in self.created_keys:
            return False
        self.created_keys.add(key)
        self.created_payloads.append(payload)
        return True

    def list_messages(self, **kwargs):
        self.last_list_kwargs = dict(kwargs)
        return {
            "messages": [
                {
                    "id": 1,
                    "lottery_code": "dlt",
                    "target_period": "26040",
                    "my_bet_record_id": 12,
                    "message_type": "bet_settlement",
                    "title": "开奖通知",
                    "content": "示例",
                    "snapshot_json": '{"prize_level":"五等奖"}',
                    "read_at": None,
                    "created_at": "2026-04-03 10:00:00",
                }
            ],
            "total_count": 1,
        }

    def get_unread_count(self, **kwargs) -> int:
        return 7

    def mark_read(self, **kwargs) -> bool:
        return True

    def mark_all_read(self, **kwargs) -> int:
        return 3

    def delete_message(self, **kwargs) -> bool:
        return True


class _FakeMyBetRepository:
    def list_records_by_period(self, target_period: str, lottery_code: str = "dlt"):
        if target_period == "26040":
            return [
                {"id": 1, "user_id": 101, "target_period": "26040", "play_type": "dlt", "amount": 12, "discount_amount": 2},
                {"id": 2, "user_id": 102, "target_period": "26040", "play_type": "dlt", "amount": 2, "discount_amount": 0},
            ]
        return []


class _FakeLotteryRepository:
    def list_draws(self, limit: int | None = None, lottery_code: str = "dlt"):
        return [{"period": "26040", "date": "2026-04-03"}]


class _FakeMyBetService:
    def _serialize_with_settlement(self, record: dict, *, lottery_code: str):
        record_id = int(record.get("id") or 0)
        winning = 1 if record_id == 1 else 0
        return {
            "id": record_id,
            "target_period": str(record.get("target_period") or ""),
            "play_type": str(record.get("play_type") or "dlt"),
            "lottery_code": lottery_code,
            "net_amount": int(record.get("amount") or 0) - int(record.get("discount_amount") or 0),
            "winning_bet_count": winning,
            "prize_level": "五等奖" if winning else None,
            "prize_amount": 10 if winning else 0,
            "net_profit": 0 if winning else -2,
            "settlement_status": "settled",
            "settled_at": "2026-04-03T10:00:00Z",
            "actual_result": {"period": "26040"},
        }


class MessageServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = _FakeMessageRepository()
        self.service = MessageService(
            repository=self.repository,
            my_bet_repository=_FakeMyBetRepository(),
            lottery_repository=_FakeLotteryRepository(),
            my_bet_service=_FakeMyBetService(),
        )

    def test_generate_messages_for_periods_is_idempotent(self) -> None:
        created_first = self.service.generate_messages_for_periods(lottery_code="dlt", periods=["26040"])
        created_second = self.service.generate_messages_for_periods(lottery_code="dlt", periods=["26040"])

        self.assertEqual(created_first, 2)
        self.assertEqual(created_second, 0)
        self.assertEqual(len(self.repository.created_payloads), 2)
        self.assertEqual({int(item.get("user_id") or 0) for item in self.repository.created_payloads}, {101, 102})
        self.assertTrue(any("未中奖" in str(item.get("content")) for item in self.repository.created_payloads))
        self.assertTrue(any("中奖" in str(item.get("content")) for item in self.repository.created_payloads))

    def test_build_settlement_message_payload_translates_play_type_label(self) -> None:
        payload = self.service._build_settlement_message_payload(
            {
                "id": 99,
                "user_id": 1,
                "target_period": "26068",
                "play_type": "mixed",
                "amount": 10,
                "net_amount": 10,
                "winning_bet_count": 0,
                "prize_level": None,
                "prize_amount": 0,
                "net_profit": -10,
                "settlement_status": "settled",
                "settled_at": "2026-04-03T15:00:00Z",
                "actual_result": {"period": "26068"},
            },
            lottery_code="dlt",
        )
        self.assertIn("玩法：混合投注", str(payload.get("content")))

    def test_list_messages_serializes_snapshot_and_unread_count(self) -> None:
        list_payload = self.service.list_messages(user_id=1, lottery_code="dlt", status_filter="all", result_filter="won", limit=20, offset=0)
        unread_payload = self.service.get_unread_count(user_id=1, lottery_code="dlt")

        self.assertEqual(list_payload["total_count"], 1)
        self.assertEqual(list_payload["messages"][0]["snapshot"], {"prize_level": "五等奖"})
        self.assertFalse(list_payload["messages"][0]["is_read"])
        self.assertEqual(unread_payload["unread_count"], 7)
        self.assertEqual((self.repository.last_list_kwargs or {}).get("result_filter"), "won")

    def test_serialize_message_falls_back_when_created_at_invalid(self) -> None:
        payload = self.service._serialize_message(
            {
                "id": 1,
                "lottery_code": "dlt",
                "target_period": "26040",
                "my_bet_record_id": 12,
                "message_type": "bet_settlement",
                "title": "开奖通知",
                "content": "示例",
                "snapshot_json": '{"settled_at":"2026-04-03T10:00:00Z"}',
                "read_at": None,
                "created_at": "0000-00-00 00:00:00",
            }
        )
        self.assertGreater(payload["created_at"], 0)
        self.assertEqual(payload["created_at"], 1775210400)

    def test_parse_draw_date_supports_datetime_text(self) -> None:
        parsed = self.service._parse_draw_date("2026-04-07 21:46:12")
        self.assertIsNotNone(parsed)
        self.assertEqual(parsed.isoformat(), "2026-04-07")


if __name__ == "__main__":
    unittest.main()
