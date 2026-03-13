from __future__ import annotations

import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.db.connection import ensure_schema, get_connection
from backend.app.main import create_app


class AuthApiTests(unittest.TestCase):
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
                cursor.execute("DELETE FROM user_session")
                cursor.execute("DELETE FROM app_user")
        self.client = TestClient(create_app())

    def tearDown(self) -> None:
        self.env.stop()
        self.temp_dir.cleanup()

    def test_login_me_logout_flow(self) -> None:
        login_response = self.client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["user"]["username"], "admin")

        me_response = self.client.post("/api/auth/me", json={})
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["user"]["role"], "admin")

        logout_response = self.client.post("/api/auth/logout", json={})
        self.assertEqual(logout_response.status_code, 200)

        unauth_response = self.client.post("/api/predictions/current", json={})
        self.assertEqual(unauth_response.status_code, 401)

    def test_admin_can_create_user_and_user_cannot_access_settings(self) -> None:
        self.client.post("/api/auth/login", json={"username": "admin", "password": "admin123456"})

        create_response = self.client.post(
            "/api/admin/users/create",
            json={"username": "viewer", "password": "viewer123", "role": "user", "is_active": True},
        )
        self.assertEqual(create_response.status_code, 200)

        user_client = TestClient(create_app())
        login_response = user_client.post("/api/auth/login", json={"username": "viewer", "password": "viewer123"})
        self.assertEqual(login_response.status_code, 200)

        settings_response = user_client.post("/api/settings/models/list", json={"include_deleted": False})
        self.assertEqual(settings_response.status_code, 403)

    def test_register_creates_normal_user_and_logs_in(self) -> None:
        register_response = self.client.post(
            "/api/auth/register",
            json={"username": "signup-user", "password": "signup123"},
        )
        self.assertEqual(register_response.status_code, 200)
        self.assertEqual(register_response.json()["user"]["role"], "user")

        me_response = self.client.post("/api/auth/me", json={})
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["user"]["username"], "signup-user")

        forbidden_response = self.client.post("/api/settings/models/list", json={"include_deleted": False})
        self.assertEqual(forbidden_response.status_code, 403)

    def test_register_rejects_duplicate_username(self) -> None:
        self.client.post("/api/auth/register", json={"username": "dup-user", "password": "signup123"})
        response = self.client.post("/api/auth/register", json={"username": "dup-user", "password": "signup123"})
        self.assertEqual(response.status_code, 400)

    def test_register_cannot_escalate_to_admin_role(self) -> None:
        response = self.client.post(
            "/api/auth/register",
            json={"username": "escalate-user", "password": "signup123", "role": "admin"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "user")


if __name__ == "__main__":
    unittest.main()
