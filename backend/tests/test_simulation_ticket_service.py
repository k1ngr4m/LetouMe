import unittest
from datetime import datetime

from backend.app.services.simulation_ticket_service import SimulationTicketService


class SimulationTicketServiceTests(unittest.TestCase):
    def test_build_pl3_group_sum_ticket_payload_uses_group_sum_counts(self) -> None:
        service = SimulationTicketService()
        payload = service._build_pl3_ticket_payload(
            {"play_type": "group_sum", "sum_values": ["03"], "multiplier": 1}
        )

        self.assertEqual(payload["play_type"], "group_sum")
        self.assertEqual(payload["sum_values"], "03")
        self.assertEqual(payload["bet_count"], 2)
        self.assertEqual(payload["amount"], 4)

        direct_sum_payload = service._build_pl3_ticket_payload(
            {"play_type": "direct_sum", "sum_values": ["03"], "multiplier": 1}
        )
        self.assertEqual(direct_sum_payload["bet_count"], 10)

    def test_build_pl3_group_sum_rejects_empty_or_zero_bet_sum_values(self) -> None:
        service = SimulationTicketService()

        with self.assertRaisesRegex(ValueError, "和值至少选择"):
            service._build_pl3_ticket_payload({"play_type": "group_sum", "sum_values": []})

        with self.assertRaisesRegex(ValueError, "和值投注注数计算失败"):
            service._build_pl3_ticket_payload({"play_type": "group_sum", "sum_values": ["00"]})

    def test_serialize_ticket_supports_mysql_datetime(self) -> None:
        payload = SimulationTicketService._serialize_ticket(
            {
                "id": 7,
                "lottery_code": "dlt",
                "play_type": "dlt",
                "front_numbers": "01,02,03,04,05",
                "back_numbers": "06,07",
                "bet_count": 1,
                "amount": 2,
                "created_at": datetime(2026, 4, 14, 9, 30, 0),
            }
        )

        self.assertEqual(payload["created_at"], 1776130200)

    def test_serialize_ticket_supports_mysql_datetime_text(self) -> None:
        payload = SimulationTicketService._serialize_ticket(
            {
                "id": 8,
                "lottery_code": "dlt",
                "play_type": "dlt",
                "front_numbers": "01,02,03,04,05",
                "back_numbers": "06,07",
                "bet_count": 1,
                "amount": 2,
                "created_at": "2026-04-14 09:30:00",
            }
        )

        self.assertEqual(payload["created_at"], 1776130200)


if __name__ == "__main__":
    unittest.main()
