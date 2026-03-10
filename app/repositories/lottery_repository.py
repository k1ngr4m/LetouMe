from __future__ import annotations

from datetime import date
from typing import Any

from psycopg2.extras import Json

from app.db.connection import get_connection


class LotteryRepository:
    def upsert_draw(self, draw: dict[str, Any]) -> None:
        with get_connection() as connection:
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
                        draw["period"],
                        draw.get("date"),
                        Json(draw.get("red_balls", [])),
                        Json(draw.get("blue_balls", [])),
                    ),
                )

    def upsert_draws(self, draws: list[dict[str, Any]]) -> None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for draw in draws:
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
                            draw["period"],
                            draw.get("date"),
                            Json(draw.get("red_balls", [])),
                            Json(draw.get("blue_balls", [])),
                        ),
                    )

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
