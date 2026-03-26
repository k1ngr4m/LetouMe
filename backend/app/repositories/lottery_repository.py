from __future__ import annotations

from datetime import datetime
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope
from backend.app.lotteries import display_period, normalize_lottery_code, storage_issue_no
from backend.app.repositories.write_log_repository import WriteLogRepository


class LotteryRepository:
    def __init__(self, log_repository: WriteLogRepository | None = None) -> None:
        self.log_repository = log_repository or WriteLogRepository()

    def upsert_draw(self, draw: dict[str, Any], lottery_code: str = "dlt") -> None:
        self._upsert_draw(draw, lottery_code=lottery_code)

    def upsert_draws(self, draws: list[dict[str, Any]], lottery_code: str = "dlt") -> None:
        normalized_code = normalize_lottery_code(lottery_code)
        current_draw: dict[str, Any] | None = None
        try:
            with use_lottery_table_scope(normalized_code):
                with get_connection() as connection:
                    for draw in draws:
                        current_draw = draw
                        self._execute_upsert(connection, draw, normalized_code)
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

    def list_draws(self, limit: int | None = None, offset: int = 0, lottery_code: str = "dlt") -> list[dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)
        sql = """
            SELECT
                di.id AS issue_id,
                di.issue_no AS period,
                di.draw_date,
                di.updated_at,
                dr.id AS draw_result_id,
                dr.jackpot_pool_balance
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

        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, tuple(params))
                    rows = cursor.fetchall()
                    result_ids = [row["draw_result_id"] for row in rows if row.get("draw_result_id")]
                    numbers_by_result = self._fetch_draw_numbers(cursor, result_ids)
                    prizes_by_result = self._fetch_draw_prizes(cursor, result_ids)

        return [
            self._to_draw_dict(
                row,
                numbers_by_result.get(row["draw_result_id"], []),
                prizes_by_result.get(row["draw_result_id"], []),
                lottery_code=normalized_code,
            )
            for row in rows
        ]

    def count_draws(self, lottery_code: str = "dlt") -> int:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COUNT(*) AS total
                        FROM draw_issue di
                        INNER JOIN draw_result dr ON dr.issue_id = di.id
                        """,
                    )
                    row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

    def get_draw_by_period(self, period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            di.id AS issue_id,
                            di.issue_no AS period,
                            di.draw_date,
                            di.updated_at,
                            dr.id AS draw_result_id,
                            dr.jackpot_pool_balance
                        FROM draw_issue di
                        LEFT JOIN draw_result dr ON dr.issue_id = di.id
                        WHERE di.issue_no = ?
                        LIMIT 1
                        """,
                        (storage_issue_no(normalized_code, period),),
                    )
                    row = cursor.fetchone()
                    if not row or not row.get("draw_result_id"):
                        return None
                    numbers_by_result = self._fetch_draw_numbers(cursor, [row["draw_result_id"]])
                    prizes_by_result = self._fetch_draw_prizes(cursor, [row["draw_result_id"]])
        return self._to_draw_dict(
            row,
            numbers_by_result.get(row["draw_result_id"], []),
            prizes_by_result.get(row["draw_result_id"], []),
            lottery_code=normalized_code,
        )

    def get_latest_draw(self, lottery_code: str = "dlt") -> dict[str, Any] | None:
        draws = self.list_draws(limit=1, lottery_code=lottery_code)
        return draws[0] if draws else None

    def get_previous_draw_by_period(self, period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        stored_period = storage_issue_no(normalized_code, period)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            di.id AS issue_id,
                            di.issue_no AS period,
                            di.draw_date,
                            di.updated_at,
                            dr.id AS draw_result_id,
                            dr.jackpot_pool_balance
                        FROM draw_issue di
                        LEFT JOIN draw_result dr ON dr.issue_id = di.id
                        WHERE di.issue_no < ? AND dr.id IS NOT NULL
                        ORDER BY di.issue_no DESC
                        LIMIT 1
                        """,
                        (stored_period,),
                    )
                    row = cursor.fetchone()
                    if not row or not row.get("draw_result_id"):
                        return None
                    numbers_by_result = self._fetch_draw_numbers(cursor, [row["draw_result_id"]])
                    prizes_by_result = self._fetch_draw_prizes(cursor, [row["draw_result_id"]])
        return self._to_draw_dict(
            row,
            numbers_by_result.get(row["draw_result_id"], []),
            prizes_by_result.get(row["draw_result_id"], []),
            lottery_code=normalized_code,
        )

    def _upsert_draw(self, draw: dict[str, Any], lottery_code: str = "dlt") -> None:
        period = str(draw["period"])
        target_key = f"period={period}"
        summary = f"upsert draw_issue {target_key}"
        try:
            normalized_code = normalize_lottery_code(lottery_code)
            with use_lottery_table_scope(normalized_code):
                with get_connection() as connection:
                    self._execute_upsert(connection, draw, normalized_code)
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
    def _execute_upsert(connection, draw: dict[str, Any], lottery_code: str) -> None:
        issue_id = _upsert_issue(connection, str(draw["period"]), draw.get("date"), "drawn", lottery_code=lottery_code)
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO draw_result (issue_id, jackpot_pool_balance)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE
                    issue_id = VALUES(issue_id),
                    jackpot_pool_balance = VALUES(jackpot_pool_balance)
                """,
                (issue_id, int(draw.get("jackpot_pool_balance") or 0)),
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
                digits=draw.get("digits", []),
            )
            cursor.execute("DELETE FROM draw_result_prize WHERE draw_result_id = ?", (draw_result_id,))
            for prize in draw.get("prize_breakdown", []):
                cursor.execute(
                    """
                    INSERT INTO draw_result_prize (
                        draw_result_id,
                        prize_level,
                        prize_type,
                        winner_count,
                        prize_amount,
                        total_amount
                    )
                    VALUES (?, ?, ?, ?, ?, ?)
                    ON DUPLICATE KEY UPDATE
                        winner_count = VALUES(winner_count),
                        prize_amount = VALUES(prize_amount),
                        total_amount = VALUES(total_amount)
                    """,
                    (
                        draw_result_id,
                        str(prize.get("prize_level") or ""),
                        str(prize.get("prize_type") or "basic"),
                        int(prize.get("winner_count") or 0),
                        int(prize.get("prize_amount") or 0),
                        int(prize.get("total_amount") or 0),
                    ),
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
    def _fetch_draw_prizes(cursor, draw_result_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not draw_result_ids:
            return {}
        placeholders = ", ".join("?" for _ in draw_result_ids)
        cursor.execute(
            f"""
            SELECT draw_result_id, prize_level, prize_type, winner_count, prize_amount, total_amount
            FROM draw_result_prize
            WHERE draw_result_id IN ({placeholders})
            """,
            tuple(draw_result_ids),
        )
        prizes_by_result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            prizes_by_result.setdefault(row["draw_result_id"], []).append(
                {
                    "prize_level": str(row.get("prize_level") or ""),
                    "prize_type": str(row.get("prize_type") or "basic"),
                    "winner_count": int(row.get("winner_count") or 0),
                    "prize_amount": int(row.get("prize_amount") or 0),
                    "total_amount": int(row.get("total_amount") or 0),
                }
            )
        return prizes_by_result

    @staticmethod
    def _to_draw_dict(
        row: dict[str, Any],
        numbers: list[dict[str, Any]],
        prizes: list[dict[str, Any]] | None = None,
        *,
        lottery_code: str,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        red_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "red"]
        blue_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "blue"]
        digits = [item["ball_value"] for item in numbers if item["ball_color"] == "digit"]
        if normalized_code in {"pl3", "pl5"} and not red_balls and digits:
            red_balls = list(digits)
        draw_date = row.get("draw_date") or ""
        updated_at = row.get("updated_at")
        if isinstance(updated_at, str):
            updated_at = _parse_timestamp(updated_at)

        return {
            "lottery_code": normalized_code,
            "period": display_period(normalized_code, str(row["period"])),
            "red_balls": red_balls,
            "blue_balls": blue_balls,
            "digits": digits,
            "jackpot_pool_balance": int(row.get("jackpot_pool_balance") or 0),
            "prize_breakdown": list(prizes or []),
            "date": draw_date,
            "updated_at": updated_at,
        }


def _upsert_issue(connection, issue_no: str, draw_date: str | None, status: str, lottery_code: str = "dlt") -> int:
    normalized_code = normalize_lottery_code(lottery_code)
    stored_issue_no = storage_issue_no(normalized_code, issue_no)
    with use_lottery_table_scope(normalized_code):
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
                (stored_issue_no, draw_date, status),
            )
            cursor.execute("SELECT id FROM draw_issue WHERE issue_no = ?", (stored_issue_no,))
            return int(cursor.fetchone()["id"])


def _insert_number_rows(
    cursor,
    *,
    table_name: str,
    owner_id_field: str,
    owner_id: int,
    red_balls: list[str],
    blue_balls: list[str],
    digits: list[str] | None = None,
    extra_number_roles: dict[str, list[str]] | None = None,
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
    for index, ball in enumerate(digits or [], start=1):
        cursor.execute(
            f"""
            INSERT INTO {table_name} ({owner_id_field}, ball_color, ball_position, ball_value)
            VALUES (?, 'digit', ?, ?)
            """,
            (owner_id, index, str(ball).zfill(2)),
        )
    for role, numbers in (extra_number_roles or {}).items():
        normalized_role = str(role or "").strip().lower()
        if not normalized_role:
            continue
        for index, ball in enumerate(numbers or [], start=1):
            cursor.execute(
                f"""
                INSERT INTO {table_name} ({owner_id_field}, ball_color, ball_position, ball_value)
                VALUES (?, ?, ?, ?)
                """,
                (owner_id, normalized_role, index, str(ball).zfill(2)),
            )


def _parse_timestamp(value: str) -> datetime | str:
    for fmt in ("%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(value, fmt)
        except ValueError:
            continue
    return value
