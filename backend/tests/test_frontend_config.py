from __future__ import annotations

import os
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.config import load_settings
from backend.app.main import create_app


class FrontendConfigTests(unittest.TestCase):
    def test_frontend_origin_defaults_to_vite_port(self) -> None:
        with patch.dict(os.environ, {}, clear=True):
            settings = load_settings()

        self.assertEqual(settings.frontend_origin, "http://localhost:5173")

    def test_root_and_cors_reflect_frontend_origin(self) -> None:
        with patch.dict(os.environ, {"FRONTEND_ORIGIN": "http://localhost:5173"}, clear=False):
            client = TestClient(create_app())
            response = client.get("/", headers={"Origin": "http://localhost:5173"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["service"], "LetouMe API")
        self.assertEqual(response.headers.get("access-control-allow-origin"), "http://localhost:5173")


if __name__ == "__main__":
    unittest.main()
