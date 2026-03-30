from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.main import create_app


class SimulationTicketApiTests(unittest.TestCase):
    def setUp(self) -> None:
        database_url = os.getenv("MYSQL_TEST_DATABASE_URL")
        if not database_url:
            self.skipTest("MYSQL_TEST_DATABASE_URL is required for MySQL integration tests")
        self.temp_dir = tempfile.TemporaryDirectory()
        self.env = patch.dict(
            os.environ,
            {
                "DATABASE_URL": database_url,
                "MYSQL_DATABASE": os.getenv("MYSQL_TEST_DATABASE", "letoume_test"),
                "AUTH_BOOTSTRAP_ADMIN_USERNAME": "admin",
                "AUTH_BOOTSTRAP_ADMIN_PASSWORD": "admin123456",
            },
            clear=False,
        )
        self.env.start()
        ensure_schema()
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM simulation_ticket")
                cursor.execute("DELETE FROM user_session")
                cursor.execute("DELETE FROM app_user WHERE username != ?", ("admin",))
        self.client = TestClient(create_app())
        self.client.post("/api/auth/register", json={"username": "player-a", "password": "player12345"})

    def tearDown(self) -> None:
        self.env.stop()
        self.temp_dir.cleanup()

    def test_create_list_and_delete_ticket(self) -> None:
        create_response = self.client.post(
            "/api/simulation/tickets/create",
            json={"front_numbers": ["01", "02", "03", "04", "05", "06"], "back_numbers": ["01", "02", "03"]},
        )
        self.assertEqual(create_response.status_code, 200)
        ticket = create_response.json()["ticket"]
        self.assertEqual(ticket["bet_count"], 18)
        self.assertEqual(ticket["amount"], 36)

        list_response = self.client.post("/api/simulation/tickets/list", json={})
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["tickets"]), 1)

        delete_response = self.client.post("/api/simulation/tickets/delete", json={"ticket_id": ticket["id"]})
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["success"])

    def test_create_rejects_invalid_numbers(self) -> None:
        response = self.client.post(
            "/api/simulation/tickets/create",
            json={"front_numbers": ["01", "02", "03", "04"], "back_numbers": ["01", "02"]},
        )
        self.assertEqual(response.status_code, 400)

    def test_list_only_returns_current_user_records(self) -> None:
        self.client.post(
            "/api/simulation/tickets/create",
            json={"front_numbers": ["01", "02", "03", "04", "05"], "back_numbers": ["01", "02"]},
        )
        other_client = TestClient(create_app())
        other_client.post("/api/auth/register", json={"username": "player-b", "password": "player12345"})
        other_client.post(
            "/api/simulation/tickets/create",
            json={"front_numbers": ["06", "07", "08", "09", "10"], "back_numbers": ["03", "04"]},
        )

        response = self.client.post("/api/simulation/tickets/list", json={})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(len(response.json()["tickets"]), 1)

    def test_create_pl3_ticket_and_filter_by_lottery(self) -> None:
        create_response = self.client.post(
            "/api/simulation/tickets/create",
            json={
                "lottery_code": "pl3",
                "play_type": "direct",
                "direct_hundreds": ["01", "02"],
                "direct_tens": ["03"],
                "direct_units": ["04", "05"],
            },
        )
        self.assertEqual(create_response.status_code, 200)
        ticket = create_response.json()["ticket"]
        self.assertEqual(ticket["bet_count"], 4)
        self.assertEqual(ticket["amount"], 8)
        self.assertEqual(ticket["lottery_code"], "pl3")
        self.assertEqual(ticket["play_type"], "direct")

        dlt_list_response = self.client.post("/api/simulation/tickets/list", json={"lottery_code": "dlt"})
        self.assertEqual(dlt_list_response.status_code, 200)
        self.assertEqual(len(dlt_list_response.json()["tickets"]), 0)

        pl3_list_response = self.client.post("/api/simulation/tickets/list", json={"lottery_code": "pl3"})
        self.assertEqual(pl3_list_response.status_code, 200)
        self.assertEqual(len(pl3_list_response.json()["tickets"]), 1)

    def test_quote_ticket_returns_calculated_amounts_without_creating_record(self) -> None:
        dlt_quote_response = self.client.post(
            "/api/simulation/tickets/quote",
            json={"front_numbers": ["01", "02", "03", "04", "05", "06"], "back_numbers": ["01", "02", "03"]},
        )
        self.assertEqual(dlt_quote_response.status_code, 200)
        dlt_quote = dlt_quote_response.json()
        self.assertEqual(dlt_quote["lottery_code"], "dlt")
        self.assertEqual(dlt_quote["bet_count"], 18)
        self.assertEqual(dlt_quote["amount"], 36)

        pl3_quote_response = self.client.post(
            "/api/simulation/tickets/quote",
            json={
                "lottery_code": "pl3",
                "play_type": "group3",
                "group_numbers": ["01", "02", "03"],
            },
        )
        self.assertEqual(pl3_quote_response.status_code, 200)
        pl3_quote = pl3_quote_response.json()
        self.assertEqual(pl3_quote["lottery_code"], "pl3")
        self.assertEqual(pl3_quote["play_type"], "group3")
        self.assertEqual(pl3_quote["bet_count"], 6)
        self.assertEqual(pl3_quote["amount"], 12)

        list_response = self.client.post("/api/simulation/tickets/list", json={})
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(len(list_response.json()["tickets"]), 0)

    def test_quote_and_create_dlt_dantuo_ticket(self) -> None:
        quote_response = self.client.post(
            "/api/simulation/tickets/quote",
            json={
                "lottery_code": "dlt",
                "play_type": "dlt_dantuo",
                "front_dan": ["01"],
                "front_tuo": ["02", "03", "04", "05", "06"],
                "back_dan": ["01"],
                "back_tuo": ["07", "08"],
            },
        )
        self.assertEqual(quote_response.status_code, 200)
        quote = quote_response.json()
        self.assertEqual(quote["play_type"], "dlt_dantuo")
        self.assertEqual(quote["bet_count"], 10)
        self.assertEqual(quote["amount"], 20)

        create_response = self.client.post(
            "/api/simulation/tickets/create",
            json={
                "lottery_code": "dlt",
                "play_type": "dlt_dantuo",
                "front_dan": ["01"],
                "front_tuo": ["02", "03", "04", "05", "06"],
                "back_dan": ["01"],
                "back_tuo": ["07", "08"],
            },
        )
        self.assertEqual(create_response.status_code, 200)
        ticket = create_response.json()["ticket"]
        self.assertEqual(ticket["play_type"], "dlt_dantuo")
        self.assertEqual(ticket["front_dan"], ["01"])
        self.assertEqual(ticket["front_tuo"], ["02", "03", "04", "05", "06"])
        self.assertEqual(ticket["back_tuo"], ["07", "08"])

    def test_quote_and_create_pl3_direct_sum_ticket(self) -> None:
        quote_response = self.client.post(
            "/api/simulation/tickets/quote",
            json={
                "lottery_code": "pl3",
                "play_type": "direct_sum",
                "sum_values": ["10", "11"],
            },
        )
        self.assertEqual(quote_response.status_code, 200)
        quote = quote_response.json()
        self.assertEqual(quote["play_type"], "direct_sum")
        self.assertEqual(quote["bet_count"], 132)
        self.assertEqual(quote["amount"], 264)

        create_response = self.client.post(
            "/api/simulation/tickets/create",
            json={
                "lottery_code": "pl3",
                "play_type": "direct_sum",
                "sum_values": ["10", "11"],
            },
        )
        self.assertEqual(create_response.status_code, 200)
        ticket = create_response.json()["ticket"]
        self.assertEqual(ticket["play_type"], "direct_sum")
        self.assertEqual(ticket["sum_values"], ["10", "11"])
        self.assertEqual(ticket["bet_count"], 132)
        self.assertEqual(ticket["amount"], 264)


if __name__ == "__main__":
    unittest.main()
