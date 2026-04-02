from __future__ import annotations

import smtplib
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

from backend.app.config import Settings
from backend.app.services.email_service import EmailService


def _build_settings(*, smtp_security: str) -> Settings:
    return Settings(
        database_url="mysql+pymysql://root:@127.0.0.1:3306/letoume?charset=utf8mb4",
        mysql_host="127.0.0.1",
        mysql_port=3306,
        mysql_user="root",
        mysql_password="",
        mysql_database="letoume",
        sqlite_path=Path("letoume.db"),
        smtp_host="smtp.example.com",
        smtp_port=465 if smtp_security == "ssl" else 587,
        smtp_user="mailer@example.com",
        smtp_password="secret",
        smtp_security=smtp_security,
        smtp_use_tls=True,
        smtp_from_email="mailer@example.com",
        smtp_from_name="LetouMe",
    )


class EmailServiceTests(unittest.TestCase):
    def test_send_email_uses_ssl_transport_when_configured(self) -> None:
        settings = _build_settings(smtp_security="ssl")
        service = EmailService(settings=settings)
        server = MagicMock()
        server.__enter__.return_value = server

        with patch("backend.app.services.email_service.smtplib.SMTP_SSL", return_value=server) as smtp_ssl:
            service.send_password_reset_code("user@example.com", "123456")

        smtp_ssl.assert_called_once()
        server.login.assert_called_once()
        server.sendmail.assert_called_once()
        server.starttls.assert_not_called()

    def test_send_email_uses_starttls_transport_when_configured(self) -> None:
        settings = _build_settings(smtp_security="starttls")
        service = EmailService(settings=settings)
        server = MagicMock()
        server.__enter__.return_value = server

        with patch("backend.app.services.email_service.smtplib.SMTP", return_value=server) as smtp_plain:
            service.send_password_reset_code("user@example.com", "123456")

        smtp_plain.assert_called_once()
        server.starttls.assert_called_once()
        server.login.assert_called_once()
        server.sendmail.assert_called_once()

    def test_send_email_wraps_smtp_exception_as_runtime_error(self) -> None:
        settings = _build_settings(smtp_security="ssl")
        service = EmailService(settings=settings)
        server = MagicMock()
        server.__enter__.return_value = server
        server.login.side_effect = smtplib.SMTPAuthenticationError(535, b"auth failed")

        with patch("backend.app.services.email_service.smtplib.SMTP_SSL", return_value=server):
            with self.assertRaises(RuntimeError) as exc:
                service.send_password_reset_code("user@example.com", "123456")

        self.assertIn("邮件服务暂不可用", str(exc.exception))


if __name__ == "__main__":
    unittest.main()
