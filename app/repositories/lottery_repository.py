from __future__ import annotations

import json
from datetime import date
from typing import Any

from app.db.connection import get_connection
from app.repositories.write_log_repository import WriteLogRepository


class LotteryRepository:
    def __init__(self, log_repository: WriteLogRepository | None = None) -> None:
        self.log_repository = log_repository or WriteLogRepository()

    def upsert_draw(self, draw: dict[str, Any]) -> None:
        self._upsert_draw(draw)

    def upsert_draws(self, draws: list[dict[str, Any]]) -> None:
        current_draw: dict[str, Any] | None = None
        try:
            with get_connection() as connection:
                for draw in draws:
                    current_draw = draw
                    self._execute_upsert(connection, draw)
                    period = str(draw["period"])
                    self.log_repository.log_success(
                        connection,
                        table_name="lottery_draws",
                        action="upsert",
                        target_key=f"period={period}",
                        summary=f"upsert lottery_draws period={period}",
                    )
        except Exception as exc:
            target_key = "period=unknown"
            summary = "upsert lottery_draws period=unknown"
            if current_draw is not None:
                period = str(current_draw["period"])
                target_key = f"period={period}"
                summary = f"upsert lottery_draws {target_key}"
            self.log_repository.log_failure(
                table_name="lottery_draws",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
            )
            raise

    def list_draws(self, limit: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
        sql = """
            SELECT period, draw_date, red_balls, blue_balls, updated_at
            FROM lottery_draws
            ORDER BY period DESC
        """
        params: list[Any] = []
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        if offset:
            sql += " OFFSET ?"
            params.append(offset)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, tuple(params))
                rows = cursor.fetchall()

        return [self._to_draw_dict(row) for row in rows]

    def count_draws(self) -> int:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("SELECT COUNT(*) AS total FROM lottery_draws")
                row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

    def get_draw_by_period(self, period: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT period, draw_date, red_balls, blue_balls, updated_at
                    FROM lottery_draws
                    WHERE period = ?
                    """,
                    (period,),
                )
                row = cursor.fetchone()
        return self._to_draw_dict(row) if row else None

    def get_latest_draw(self) -> dict[str, Any] | None:
        draws = self.list_draws(limit=1)
        return draws[0] if draws else None

    def _upsert_draw(self, draw: dict[str, Any]) -> None:
        period = str(draw["period"])
        target_key = f"period={period}"
        summary = f"upsert lottery_draws {target_key}"
        try:
            with get_connection() as connection:
                self._execute_upsert(connection, draw)
                self.log_repository.log_success(
                    connection,
                    table_name="lottery_draws",
                    action="upsert",
                    target_key=target_key,
                    summary=summary,
                )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="lottery_draws",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
            )
            raise

    @staticmethod
    def _execute_upsert(connection, draw: dict[str, Any]) -> None:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO lottery_draws (period, draw_date, red_balls, blue_balls)
                VALUES (?, ?, ?, ?)
                ON CONFLICT (period) DO UPDATE SET
                    draw_date = excluded.draw_date,
                    red_balls = excluded.red_balls,
                    blue_balls = excluded.blue_balls,
                    updated_at = CURRENT_TIMESTAMP
                """,
                (
                    str(draw["period"]),
                    draw.get("date"),
                    json.dumps(draw.get("red_balls", []), ensure_ascii=False),
                    json.dumps(draw.get("blue_balls", []), ensure_ascii=False),
                ),
            )

    @staticmethod
    def _to_draw_dict(row: dict[str, Any]) -> dict[str, Any]:
        draw_date = row.get("draw_date")
        if isinstance(draw_date, date):
            draw_date = draw_date.isoformat()

        return {
            "period": str(row["period"]),
            "red_balls": list(_decode_json_value(row.get("red_balls")) or []),
            "blue_balls": list(_decode_json_value(row.get("blue_balls")) or []),
            "date": draw_date or "",
            "updated_at": row.get("updated_at"),
        }


def _decode_json_value(value: Any) -> Any:
    if isinstance(value, str):
        return json.loads(value)
    return value
