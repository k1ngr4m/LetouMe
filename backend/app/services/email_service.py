from __future__ import annotations

import smtplib
from email.mime.text import MIMEText

from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger


logger = get_logger("email")


class EmailService:
    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()

    def send_password_reset_code(self, email: str, code: str) -> None:
        subject = "LetouMe 密码重置验证码"
        body = (
            "您好，\n\n"
            f"您的 LetouMe 密码重置验证码是：{code}\n"
            f"验证码 {self.settings.auth_email_code_expire_minutes} 分钟内有效。\n"
            "如果不是您本人操作，请忽略此邮件。\n"
        )
        self.send_email(to_email=email, subject=subject, body=body)

    def send_email(self, *, to_email: str, subject: str, body: str) -> None:
        if not self.settings.smtp_host:
            raise RuntimeError("SMTP_HOST 未配置")
        if not self.settings.smtp_user:
            raise RuntimeError("SMTP_USER 未配置")
        if not self.settings.smtp_password:
            raise RuntimeError("SMTP_PASSWORD 未配置")
        if not self.settings.smtp_from_email:
            raise RuntimeError("SMTP_FROM_EMAIL 未配置")

        message = MIMEText(body, "plain", "utf-8")
        message["Subject"] = subject
        message["From"] = f"{self.settings.smtp_from_name} <{self.settings.smtp_from_email}>"
        message["To"] = to_email

        with smtplib.SMTP(self.settings.smtp_host, self.settings.smtp_port, timeout=20) as server:
            if self.settings.smtp_use_tls:
                server.starttls()
            server.login(self.settings.smtp_user, self.settings.smtp_password)
            server.sendmail(self.settings.smtp_from_email, [to_email], message.as_string())
            logger.info("Password reset email sent", extra={"context": {"to_email": to_email}})
