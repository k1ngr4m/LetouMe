from __future__ import annotations

import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.main import create_app


class AppStartupTests(unittest.TestCase):
    def test_startup_bootstraps_models_once(self) -> None:
        with (
            patch("backend.app.main.ensure_schema") as ensure_schema_mock,
            patch("backend.app.main.ensure_rbac_setup") as ensure_rbac_setup_mock,
            patch("backend.app.main.bootstrap_default_models") as bootstrap_mock,
            patch("backend.app.main.AuthService") as auth_service_mock,
        ):
            auth_service_mock.return_value.ensure_bootstrap_admin.return_value = None
            with TestClient(create_app()):
                pass

        ensure_schema_mock.assert_called_once()
        ensure_rbac_setup_mock.assert_called_once()
        bootstrap_mock.assert_called_once()
        auth_service_mock.return_value.ensure_bootstrap_admin.assert_called_once()


if __name__ == "__main__":
    unittest.main()
