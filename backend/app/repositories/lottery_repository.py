from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.repositories.write_log_repository import WriteLogRepository


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
                        table_name="draw_issue",
                        action="upsert",
                        target_key=f"period={period}",
                        summary=f"upsert draw_issue period={period}",
                    )
        except Exception as exc:
            target_key = "period=unknown"
            summary = "upsert draw_issue period=unknown"
            if current_draw is not None:
                period = str(current_draw["period"])
                target_key = f"period={period}"
                summary = f"upsert draw_issue {target_key}"
            self.log_repository.log_failure(
                table_name="draw_issue",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
            )
            raise

    def list_draws(self, limit: int | None = None, offset: int = 0) -> list[dict[str, Any]]:
        sql = """
            SELECT
                di.id AS issue_id,
                di.issue_no AS period,
                di.draw_date,
                di.updated_at,
                dr.id AS draw_result_id
            FROM draw_issue di
            LEFT JOIN draw_result dr ON dr.issue_id = di.id
            WHERE dr.id IS NOT NULL
            ORDER BY di.issue_no DESC
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
                result_ids = [row["draw_result_id"] for row in rows if row.get("draw_result_id")]
                numbers_by_result = self._fetch_draw_numbers(cursor, result_ids)

        return [self._to_draw_dict(row, numbers_by_result.get(row["draw_result_id"], [])) for row in rows]

    def count_draws(self) -> int:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT COUNT(*) AS total
                    FROM draw_issue di
                    INNER JOIN draw_result dr ON dr.issue_id = di.id
                    """
                )
                row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

    def get_draw_by_period(self, period: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        di.id AS issue_id,
                        di.issue_no AS period,
                        di.draw_date,
                        di.updated_at,
                        dr.id AS draw_result_id
                    FROM draw_issue di
                    LEFT JOIN draw_result dr ON dr.issue_id = di.id
                    WHERE di.issue_no = ?
                    LIMIT 1
                    """,
                    (period,),
                )
                row = cursor.fetchone()
                if not row or not row.get("draw_result_id"):
                    return None
                numbers_by_result = self._fetch_draw_numbers(cursor, [row["draw_result_id"]])
        return self._to_draw_dict(row, numbers_by_result.get(row["draw_result_id"], []))

    def get_latest_draw(self) -> dict[str, Any] | None:
        draws = self.list_draws(limit=1)
        return draws[0] if draws else None

    def _upsert_draw(self, draw: dict[str, Any]) -> None:
        period = str(draw["period"])
        target_key = f"period={period}"
        summary = f"upsert draw_issue {target_key}"
        try:
            with get_connection() as connection:
                self._execute_upsert(connection, draw)
                self.log_repository.log_success(
                    connection,
                    table_name="draw_issue",
                    action="upsert",
                    target_key=target_key,
                    summary=summary,
                )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="draw_issue",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
            )
            raise

    @staticmethod
    def _execute_upsert(connection, draw: dict[str, Any]) -> None:
        issue_id = _upsert_issue(connection, str(draw["period"]), draw.get("date"), "drawn")
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO draw_result (issue_id)
                VALUES (?)
                ON DUPLICATE KEY UPDATE issue_id = VALUES(issue_id)
                """,
                (issue_id,),
            )
            cursor.execute("SELECT id FROM draw_result WHERE issue_id = ?", (issue_id,))
            draw_result_id = cursor.fetchone()["id"]
            cursor.execute("DELETE FROM draw_result_number WHERE draw_result_id = ?", (draw_result_id,))
            _insert_number_rows(
                cursor,
                table_name="draw_result_number",
                owner_id_field="draw_result_id",
                owner_id=draw_result_id,
                red_balls=draw.get("red_balls", []),
                blue_balls=draw.get("blue_balls", []),
            )

    @staticmethod
    def _fetch_draw_numbers(cursor, draw_result_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not draw_result_ids:
            return {}
        placeholders = ", ".join("?" for _ in draw_result_ids)
        cursor.execute(
            f"""
            SELECT draw_result_id, ball_color, ball_position, ball_value
            FROM draw_result_number
            WHERE draw_result_id IN ({placeholders})
            ORDER BY draw_result_id, ball_color, ball_position
            """,
            tuple(draw_result_ids),
        )
        numbers_by_result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            numbers_by_result.setdefault(row["draw_result_id"], []).append(row)
        return numbers_by_result

    @staticmethod
    def _to_draw_dict(row: dict[str, Any], numbers: list[dict[str, Any]]) -> dict[str, Any]:
        red_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "red"]
        blue_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "blue"]
        draw_date = row.get("draw_date") or ""
        updated_at = row.get("updated_at")
        if isinstance(updated_at, str):
            updated_at = _parse_timestamp(updated_at)

        return {
            "period": str(row["period"]),
            "red_balls": red_balls,
            "blue_balls": blue_balls,
            "date": draw_date,
            "updated_at": updated_at,
        }


def _upsert_issue(connection, issue_no: str, draw_date: str | None, status: str) -> int:
    with connection.cursor() as cursor:
        cursor.execute(
            """
            INSERT INTO draw_issue (issue_no, draw_date, status, updated_at)
            VALUES (?, ?, ?, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE
                draw_date = VALUES(draw_date),
                status = VALUES(status),
                updated_at = CURRENT_TIMESTAMP
            """,
            (issue_no, draw_date, status),
        )
        cursor.execute("SELECT id FROM draw_issue WHERE issue_no = ?", (issue_no,))
        return int(cursor.fetchone()["id"])


def _insert_number_rows(
    cursor,
    *,
    table_name: str,
    owner_id_field: str,
    owner_id: int,
    red_balls: list[str],
    blue_balls: list[str],
) -> None:
    for index, ball in enumerate(red_balls, start=1):
        cursor.execute(
            f"""
            INSERT INTO {table_name} ({owner_id_field}, ball_color, ball_position, ball_value)
            VALUES (?, 'red', ?, ?)
            """,
            (owner_id, index, str(ball).zfill(2)),
        )
    for index, ball in enumerate(blue_balls, start=1):
        cursor.execute(
            f"""
            INSERT INTO {table_name} ({owner_id_field}, ball_color, ball_position, ball_value)
            VALUES (?, 'blue', ?, ?)
            """,
            (owner_id, index, str(ball).zfill(2)),
        )


def _parse_timestamp(value: str) -> datetime | str:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return value
