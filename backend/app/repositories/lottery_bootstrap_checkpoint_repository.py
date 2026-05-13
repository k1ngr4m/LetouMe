from __future__ import annotations

from typing import Any

from backend.app.db.connection import get_connection
from backend.app.lotteries import normalize_lottery_code


class LotteryBootstrapCheckpointRepository:
    def get(self, lottery_code: str) -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT lottery_code, phase, last_period, base_done, detail_done, updated_at
                    FROM lottery_bootstrap_checkpoint
                    WHERE lottery_code = ?
                    LIMIT 1
                    """,
                    (normalized_code,),
                )
                row = cursor.fetchone()
        return self._serialize(row) if row else None

    def upsert(
        self,
        lottery_code: str,
        *,
        phase: str,
        last_period: str | None = None,
        base_done: bool = False,
        detail_done: bool = False,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO lottery_bootstrap_checkpoint (
                        lottery_code,
                        phase,
                        last_period,
                        base_done,
                        detail_done,
                        updated_at
                    )
                    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
                    ON DUPLICATE KEY UPDATE
                        phase = VALUES(phase),
                        last_period = VALUES(last_period),
                        base_done = VALUES(base_done),
                        detail_done = VALUES(detail_done),
                        updated_at = CURRENT_TIMESTAMP
                    """,
                    (
                        normalized_code,
                        str(phase or "base"),
                        last_period,
                        1 if base_done else 0,
                        1 if detail_done else 0,
                    ),
                )
        return {
            "lottery_code": normalized_code,
            "phase": str(phase or "base"),
            "last_period": last_period,
            "base_done": bool(base_done),
            "detail_done": bool(detail_done),
        }

    def reset(self, lottery_code: str) -> None:
        normalized_code = normalize_lottery_code(lottery_code)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("DELETE FROM lottery_bootstrap_checkpoint WHERE lottery_code = ?", (normalized_code,))

    @staticmethod
    def _serialize(row: dict[str, Any]) -> dict[str, Any]:
        return {
            "lottery_code": str(row.get("lottery_code") or ""),
            "phase": str(row.get("phase") or "base"),
            "last_period": str(row["last_period"]) if row.get("last_period") else None,
            "base_done": bool(row.get("base_done")),
            "detail_done": bool(row.get("detail_done")),
            "updated_at": row.get("updated_at"),
        }
