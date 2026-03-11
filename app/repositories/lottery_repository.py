from __future__ import annotations

from datetime import date
from typing import Any

from psycopg2.extras import Json

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

    def list_draws(self, limit: int | None = None) -> list[dict[str, Any]]:
        sql = """
            SELECT period, draw_date, red_balls, blue_balls, updated_at
            FROM lottery_draws
            ORDER BY period DESC
        """
        params: tuple[Any, ...] = ()
        if limit is not None:
            sql += " LIMIT %s"
            params = (limit,)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(sql, params)
                rows = cursor.fetchall()

        return [self._to_draw_dict(row) for row in rows]

    def get_draw_by_period(self, period: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT period, draw_date, red_balls, blue_balls, updated_at
                    FROM lottery_draws
                    WHERE period = %s
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
                VALUES (%s, %s, %s, %s)
                ON CONFLICT (period) DO UPDATE SET
                    draw_date = EXCLUDED.draw_date,
                    red_balls = EXCLUDED.red_balls,
                    blue_balls = EXCLUDED.blue_balls,
                    updated_at = NOW()
                """,
                (
                    str(draw["period"]),
                    draw.get("date"),
                    Json(draw.get("red_balls", [])),
                    Json(draw.get("blue_balls", [])),
                ),
            )

    @staticmethod
    def _to_draw_dict(row: dict[str, Any]) -> dict[str, Any]:
        draw_date = row.get("draw_date")
        if isinstance(draw_date, date):
            draw_date = draw_date.isoformat()

        return {
            "period": str(row["period"]),
            "red_balls": list(row.get("red_balls") or []),
            "blue_balls": list(row.get("blue_balls") or []),
            "date": draw_date or "",
            "updated_at": row.get("updated_at"),
        }
