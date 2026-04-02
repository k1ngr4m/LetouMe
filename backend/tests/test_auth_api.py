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
        login_response = self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})
        self.assertEqual(login_response.status_code, 200)
        self.assertEqual(login_response.json()["user"]["username"], "admin")

        me_response = self.client.post("/api/auth/me", json={})
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["user"]["role"], "super_admin")

        logout_response = self.client.post("/api/auth/logout", json={})
        self.assertEqual(logout_response.status_code, 200)

        unauth_response = self.client.post("/api/predictions/current", json={})
        self.assertEqual(unauth_response.status_code, 401)

    def test_admin_can_create_user_and_user_cannot_access_settings(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})

        create_response = self.client.post(
            "/api/admin/users/create",
            json={"username": "viewer", "password": "viewer123", "role": "user", "is_active": True},
        )
        self.assertEqual(create_response.status_code, 200)

        user_client = TestClient(create_app())
        login_response = user_client.post("/api/auth/login", json={"identifier": "viewer", "password": "viewer123"})
        self.assertEqual(login_response.status_code, 200)

        settings_response = user_client.post("/api/settings/models/list", json={"include_deleted": False})
        self.assertEqual(settings_response.status_code, 403)

    def test_admin_user_list_serializes_datetime_fields(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})
        self.client.post(
            "/api/admin/users/create",
            json={"username": "viewer", "password": "viewer123", "role": "user", "is_active": True},
        )

        response = self.client.post("/api/admin/users/list", json={})

        self.assertEqual(response.status_code, 200)
        payload = response.json()["users"]
        self.assertTrue(all(user["created_at"] is None or isinstance(user["created_at"], str) for user in payload))
        self.assertTrue(all(user["last_login_at"] is None or isinstance(user["last_login_at"], str) for user in payload))

    def test_register_creates_normal_user_and_logs_in(self) -> None:
        register_response = self.client.post(
            "/api/auth/register",
            json={"username": "signup-user", "email": "signup-user@example.com", "password": "signup123"},
        )
        self.assertEqual(register_response.status_code, 200)
        self.assertEqual(register_response.json()["user"]["role"], "normal_user")

        me_response = self.client.post("/api/auth/me", json={})
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["user"]["username"], "signup-user")

        forbidden_response = self.client.post("/api/settings/models/list", json={"include_deleted": False})
        self.assertEqual(forbidden_response.status_code, 403)

        lottery_fetch_forbidden = self.client.post("/api/settings/lottery/fetch", json={})
        self.assertEqual(lottery_fetch_forbidden.status_code, 403)

    def test_register_rejects_duplicate_username(self) -> None:
        self.client.post("/api/auth/register", json={"username": "dup-user", "email": "dup-user@example.com", "password": "signup123"})
        response = self.client.post("/api/auth/register", json={"username": "dup-user", "email": "dup-user@example.com", "password": "signup123"})
        self.assertEqual(response.status_code, 400)

    def test_register_cannot_escalate_to_admin_role(self) -> None:
        response = self.client.post(
            "/api/auth/register",
            json={"username": "escalate-user", "email": "escalate-user@example.com", "password": "signup123", "role": "admin"},
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["role"], "normal_user")

    def test_role_permissions_include_description_and_can_be_updated(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})

        list_response = self.client.post("/api/admin/roles/permissions", json={})

        self.assertEqual(list_response.status_code, 200)
        permissions = list_response.json()["permissions"]
        self.assertTrue(all("permission_description" in item for item in permissions))

        update_response = self.client.post(
            "/api/admin/roles/permissions/update",
            json={
                "permission_code": "basic_profile",
                "permission_name": "基础资料",
                "permission_description": "允许用户查看账号信息并修改昵称与密码。",
            },
        )

        self.assertEqual(update_response.status_code, 200)
        updated = next(item for item in update_response.json()["permissions"] if item["permission_code"] == "basic_profile")
        self.assertEqual(updated["permission_name"], "基础资料")
        self.assertEqual(updated["permission_description"], "允许用户查看账号信息并修改昵称与密码。")

    def test_upload_profile_avatar_updates_current_user(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})

        with patch("backend.app.api.routes.profile_avatar_service.upload_profile_avatar", return_value="https://img.example/avatar.jpg"):
            response = self.client.post(
                "/api/settings/profile/avatar/upload",
                files={"image": ("avatar.png", b"mock-image-content", "image/png")},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["user"]["avatar_url"], "https://img.example/avatar.jpg")

        me_response = self.client.post("/api/auth/me", json={})
        self.assertEqual(me_response.status_code, 200)
        self.assertEqual(me_response.json()["user"]["avatar_url"], "https://img.example/avatar.jpg")

    def test_upload_profile_avatar_rejects_invalid_format(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})

        response = self.client.post(
            "/api/settings/profile/avatar/upload",
            files={"image": ("avatar.gif", b"gif89a", "image/gif")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("JPG、PNG", response.json()["detail"])

    def test_upload_profile_avatar_rejects_oversized_file(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})

        oversized_payload = b"a" * (4 * 1024 * 1024 + 512 * 1024 + 1)
        response = self.client.post(
            "/api/settings/profile/avatar/upload",
            files={"image": ("avatar.jpg", oversized_payload, "image/jpeg")},
        )

        self.assertEqual(response.status_code, 400)
        self.assertIn("4.5MB", response.json()["detail"])

    def test_oauth_start_returns_disabled_when_not_configured(self) -> None:
        response = self.client.get("/api/auth/oauth/google/start")
        self.assertEqual(response.status_code, 200)
        payload = response.json()
        self.assertFalse(payload["enabled"])
        self.assertIsNone(payload["auth_url"])

    def test_oauth_callback_redirects_to_frontend_with_error_when_missing_params(self) -> None:
        response = self.client.get("/api/auth/oauth/google/callback", follow_redirects=False)
        self.assertEqual(response.status_code, 302)
        self.assertIn("/auth/callback/google?status=error", response.headers.get("location", ""))

    def test_oauth_callback_sets_session_cookie_on_success(self) -> None:
        with patch("backend.app.api.routes.AuthService.complete_oauth_login", return_value=({"id": 1, "username": "oauth-user"}, "oauth-session-token")):
            response = self.client.get(
                "/api/auth/oauth/google/callback?code=sample-code&state=sample-state",
                follow_redirects=False,
            )
        self.assertEqual(response.status_code, 302)
        self.assertIn("/auth/callback/google?status=success", response.headers.get("location", ""))
        self.assertIn("letoume_session=oauth-session-token", response.headers.get("set-cookie", ""))


if __name__ == "__main__":
    unittest.main()
