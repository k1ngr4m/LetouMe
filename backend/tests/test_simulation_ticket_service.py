import unittest
from datetime import datetime

from backend.app.services.simulation_ticket_service import SimulationTicketService


class SimulationTicketServiceTests(unittest.TestCase):
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
