from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.config import load_settings
from backend.app.main import build_cors_origins, create_app


class FrontendConfigTests(unittest.TestCase):
    def test_frontend_origin_defaults_to_vite_port(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.frontend_origin, "http://localhost:5173")

    def test_default_cors_origins_include_loopback_aliases(self) -> None:
        self.assertEqual(
            build_cors_origins("http://localhost:5173"),
            ["http://127.0.0.1:5173", "http://localhost:5173"],
        )

    def test_cors_preflight_allows_127_vite_origin(self) -> None:
        client = TestClient(create_app())
        response = client.options(
            "/api/auth/me",
            headers={
                "Origin": "http://127.0.0.1:5173",
                "Access-Control-Request-Method": "POST",
                "Access-Control-Request-Headers": "content-type",
            },
        )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://127.0.0.1:5173")

    def test_root_and_cors_reflect_frontend_origin(self) -> None:
        database_url = os.getenv("MYSQL_TEST_DATABASE_URL")
        if not database_url:
            self.skipTest("MYSQL_TEST_DATABASE_URL is required for MySQL integration tests")

        with patch.dict(
            os.environ,
            {
                "FRONTEND_ORIGIN": "http://localhost:5173",
                "DATABASE_URL": database_url,
            },
            clear=False,
        ):
            client = TestClient(create_app())
            response = client.get("/", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "LetouMe API")
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")


if __name__ == "__main__":
    unittest.main()
