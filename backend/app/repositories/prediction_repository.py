from __future__ import annotations

from time import perf_counter
from typing import Any

from backend.app.db.connection import get_connection
from backend.app.db.lottery_tables import use_lottery_table_scope
from backend.app.lotteries import display_period, normalize_digit_balls, normalize_group_digits, normalize_lottery_code, storage_issue_no
from backend.app.logging_utils import get_logger
from backend.app.repositories.lottery_repository import _insert_number_rows, _upsert_issue
from backend.app.repositories.write_log_repository import WriteLogRepository
from backend.core.model_config import ModelDefinition, ModelRegistry, load_model_registry


class PredictionRepository:
    def __init__(self, log_repository: WriteLogRepository | None = None) -> None:
        self.log_repository = log_repository or WriteLogRepository()
        self._registry: ModelRegistry | None = None
        self.logger = get_logger("repositories.prediction")

    def sync_model_catalog(self) -> None:
        self._registry = _load_registry()

    def get_current_prediction(self, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            pb.id,
                            pb.prediction_date,
                            di.issue_no AS target_period,
                            di.id AS target_issue_id
                        FROM prediction_batch pb
                        INNER JOIN draw_issue di ON di.id = pb.target_issue_id
                        WHERE pb.status = 'current'
                        ORDER BY di.issue_no DESC
                        LIMIT 1
                        """,
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    return self._build_batch_payload(cursor, row, lottery_code=normalized_code, include_actual_result=False)

    def get_current_prediction_by_period(self, target_period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            pb.id,
                            pb.prediction_date,
                            di.issue_no AS target_period,
                            di.id AS target_issue_id
                        FROM prediction_batch pb
                        INNER JOIN draw_issue di ON di.id = pb.target_issue_id
                        WHERE pb.status = 'current' AND di.issue_no = ?
                        LIMIT 1
                        """,
                        (storage_issue_no(normalized_code, target_period),),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    return self._build_batch_payload(cursor, row, lottery_code=normalized_code, include_actual_result=False)

    def upsert_current_prediction(self, payload: dict[str, Any]) -> None:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"upsert prediction_batch(current) {target_key}"
        try:
            with use_lottery_table_scope(lottery_code):
                with get_connection() as connection:
                    self._sync_registry(connection)
                    batch_id = self._upsert_batch(
                        connection,
                        payload=payload,
                        status="current",
                        archive_metadata=False,
                    )
                    self.log_repository.log_success(
                        connection,
                        table_name="prediction_batch",
                        action="upsert",
                        target_key=target_key,
                        summary=summary,
                        payload={
                            "target_period": target_period,
                            "lottery_code": lottery_code,
                            "prediction_date": payload.get("prediction_date"),
                            "batch_id": batch_id,
                        },
                    )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="prediction_batch",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload={"target_period": target_period},
            )
            raise

    def replace_current_prediction(self, payload: dict[str, Any]) -> None:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"replace prediction_batch(current) {target_key}"
        try:
            with use_lottery_table_scope(lottery_code):
                with get_connection() as connection:
                    self._sync_registry(connection)
                    with connection.cursor() as cursor:
                        cursor.execute("DELETE FROM prediction_batch WHERE status = 'current'")
                    batch_id = self._upsert_batch(
                        connection,
                        payload=payload,
                        status="current",
                        archive_metadata=False,
                    )
                    self.log_repository.log_success(
                        connection,
                        table_name="prediction_batch",
                        action="replace",
                        target_key=target_key,
                        summary=summary,
                        payload={
                            "target_period": target_period,
                            "lottery_code": lottery_code,
                            "prediction_date": payload.get("prediction_date"),
                            "batch_id": batch_id,
                        },
                    )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="prediction_batch",
                action="replace",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload={"target_period": target_period},
            )
            raise

    def upsert_history_record(self, payload: dict[str, Any]) -> None:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        target_period = str(payload["target_period"])
        target_key = f"target_period={target_period}"
        summary = f"upsert prediction_batch(archived) {target_key}"
        try:
            with use_lottery_table_scope(lottery_code):
                with get_connection() as connection:
                    self._sync_registry(connection)
                    batch_id = self._upsert_batch(
                        connection,
                        payload=payload,
                        status="archived",
                        archive_metadata=True,
                    )
                    self.log_repository.log_success(
                        connection,
                        table_name="prediction_batch",
                        action="upsert",
                        target_key=target_key,
                        summary=summary,
                        payload={
                            "target_period": target_period,
                            "lottery_code": lottery_code,
                            "prediction_date": payload.get("prediction_date"),
                            "batch_id": batch_id,
                        },
                    )
        except Exception as exc:
            self.log_repository.log_failure(
                table_name="prediction_batch",
                action="upsert",
                target_key=target_key,
                summary=summary,
                error_message=f"{type(exc).__name__}: {exc}",
                payload={"target_period": target_period},
            )
            raise

    def list_history_records(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
    ) -> list[dict[str, Any]]:
        normalized_code = normalize_lottery_code(lottery_code)
        sql = """
            SELECT
                pb.id,
                pb.prediction_date,
                di.issue_no AS target_period,
                di.id AS target_issue_id
            FROM prediction_batch pb
            INNER JOIN draw_issue di ON di.id = pb.target_issue_id
            WHERE pb.status = 'archived'
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
                    return [
                        self._build_batch_payload(cursor, row, lottery_code=normalized_code, include_actual_result=True)
                        for row in rows
                    ]

    def list_history_record_summaries(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
    ) -> list[dict[str, Any]]:
        return self.list_history_record_summaries_with_metrics(limit=limit, offset=offset, lottery_code=lottery_code)["records"]

    def list_history_record_summaries_with_metrics(
        self,
        limit: int | None = None,
        offset: int = 0,
        lottery_code: str = "dlt",
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        sql = """
            SELECT
                pb.id,
                pb.prediction_date,
                di.issue_no AS target_period,
                di.id AS target_issue_id
            FROM prediction_batch pb
            INNER JOIN draw_issue di ON di.id = pb.target_issue_id
            WHERE pb.status = 'archived'
            ORDER BY di.issue_no DESC
        """
        params: list[Any] = []
        if limit is not None:
            sql += " LIMIT ?"
            params.append(limit)
        if offset:
            sql += " OFFSET ?"
            params.append(offset)

        started_at = perf_counter()
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(sql, tuple(params))
                    batch_rows = cursor.fetchall()
                    batch_ids = [int(row["id"]) for row in batch_rows]
                    issue_ids = [int(row["target_issue_id"]) for row in batch_rows]
                    actual_results_by_issue = self._fetch_actual_results(cursor, issue_ids, lottery_code=normalized_code)
                    model_rows = self._fetch_model_runs_by_batch(cursor, batch_ids)
                    model_run_ids = [int(row["id"]) for row in model_rows]
                    summaries_by_run = self._fetch_model_summaries(cursor, model_run_ids)
                    groups_by_run = self._fetch_groups(cursor, model_run_ids)
                    group_metrics_by_run = self._fetch_group_metrics_by_run(cursor, model_run_ids)
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        self.logger.debug(
            "Loaded prediction history summary batches",
            extra={
                "context": {
                    "batch_count": len(batch_rows),
                    "model_run_count": len(model_rows),
                    "group_metric_count": sum(len(items) for items in group_metrics_by_run.values()),
                    "db_query_ms": duration_ms,
                }
            },
        )

        models_by_batch: dict[int, list[dict[str, Any]]] = {}
        for row in model_rows:
            batch_id = int(row["prediction_batch_id"])
            summary = summaries_by_run.get(int(row["id"]), {})
            group_metrics = group_metrics_by_run.get(int(row["id"]), [])
            groups = groups_by_run.get(int(row["id"]), [])
            merged_metrics: list[dict[str, Any]] = []
            for group in groups:
                metric = next((item for item in group_metrics if int(item.get("group_id") or 0) == int(group.get("group_id") or 0)), {})
                merged_metrics.append({**group, **metric})
            models_by_batch.setdefault(batch_id, []).append(
                {
                    "model_id": row["model_id"],
                    "prediction_play_mode": str(row.get("prediction_play_mode") or "direct"),
                    "model_name": row["model_name"],
                    "model_provider": row["model_provider"],
                    "model_version": row.get("model_version"),
                    "model_api_model": row.get("model_api_model"),
                    "best_group": summary.get("best_group"),
                    "best_hit_count": summary.get("best_hit_count"),
                    "group_metrics": merged_metrics,
                }
            )

        records = [
            {
                "lottery_code": normalized_code,
                "prediction_date": row["prediction_date"],
                "target_period": display_period(normalized_code, row["target_period"]),
                "actual_result": actual_results_by_issue.get(int(row["target_issue_id"])),
                "models": models_by_batch.get(int(row["id"]), []),
            }
            for row in batch_rows
        ]
        return {
            "records": records,
            "metrics": {
                "db_query_ms": duration_ms,
                "batch_count": len(batch_rows),
                "model_run_count": len(model_rows),
                "group_metric_count": sum(len(items) for items in group_metrics_by_run.values()),
            },
        }

    def get_history_record_detail(self, target_period: str, lottery_code: str = "dlt") -> dict[str, Any] | None:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT
                            pb.id,
                            pb.prediction_date,
                            di.issue_no AS target_period,
                            di.id AS target_issue_id
                        FROM prediction_batch pb
                        INNER JOIN draw_issue di ON di.id = pb.target_issue_id
                        WHERE pb.status = 'archived' AND di.issue_no = ?
                        LIMIT 1
                        """,
                        (storage_issue_no(normalized_code, target_period),),
                    )
                    row = cursor.fetchone()
                    if not row:
                        return None
                    return self._build_batch_payload(cursor, row, lottery_code=normalized_code, include_actual_result=True)

    def count_history_records(self, lottery_code: str = "dlt") -> int:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT COUNT(*) AS total
                        FROM prediction_batch
                        WHERE status = 'archived'
                        """,
                    )
                    row = cursor.fetchone() or {}
        return int(row.get("total") or 0)

    def list_history_strategy_options(self, lottery_code: str = "dlt") -> list[str]:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT DISTINCT COALESCE(NULLIF(TRIM(pg.strategy_text), ''), 'AI 组合策略') AS strategy_label
                        FROM prediction_batch pb
                        INNER JOIN prediction_model_run pmr ON pmr.prediction_batch_id = pb.id
                        INNER JOIN prediction_group pg ON pg.model_run_id = pmr.id
                        WHERE pb.status = 'archived'
                        ORDER BY strategy_label ASC
                        """,
                    )
                    return [str(row.get("strategy_label") or "AI 组合策略") for row in cursor.fetchall()]

    def history_record_exists(self, target_period: str, lottery_code: str = "dlt") -> bool:
        normalized_code = normalize_lottery_code(lottery_code)
        with use_lottery_table_scope(normalized_code):
            with get_connection() as connection:
                with connection.cursor() as cursor:
                    cursor.execute(
                        """
                        SELECT 1
                        FROM prediction_batch pb
                        INNER JOIN draw_issue di ON di.id = pb.target_issue_id
                        WHERE pb.status = 'archived' AND di.issue_no = ?
                        LIMIT 1
                        """,
                        (storage_issue_no(normalized_code, target_period),),
                    )
                    return cursor.fetchone() is not None

    def _sync_registry(self, connection) -> None:
        if self._registry is None:
            self._registry = _load_registry()
        return None

    def _upsert_batch(
        self,
        connection,
        *,
        payload: dict[str, Any],
        status: str,
        archive_metadata: bool,
    ) -> int:
        lottery_code = normalize_lottery_code(payload.get("lottery_code"))
        target_period = str(payload["target_period"])
        actual_result = payload.get("actual_result")
        draw_date = (actual_result or {}).get("date")
        issue_status = "drawn" if actual_result else ("current" if status == "current" else "scheduled")
        target_issue_id = _upsert_issue(connection, target_period, draw_date, issue_status, lottery_code=lottery_code)
        draw_result_id = None
        if actual_result:
            draw_result_id = self._upsert_draw_result(
                connection,
                issue_id=target_issue_id,
                actual_result=actual_result,
            )

        with connection.cursor() as cursor:
            if status == "current":
                cursor.execute(
                    """
                    UPDATE prediction_batch
                    SET status = 'superseded', updated_at = CURRENT_TIMESTAMP
                    WHERE status = 'current' AND target_issue_id <> ?
                    """,
                    (target_issue_id,),
                )
                cursor.execute(
                    """
                    SELECT id
                    FROM prediction_batch
                    WHERE status = 'current' AND target_issue_id = ?
                    LIMIT 1
                    """,
                    (target_issue_id,),
                )
            else:
                cursor.execute(
                    """
                    SELECT id
                    FROM prediction_batch
                    WHERE status = 'archived' AND target_issue_id = ?
                    LIMIT 1
                    """,
                    (target_issue_id,),
                )
            existing = cursor.fetchone()

            if existing:
                batch_id = int(existing["id"])
                cursor.execute(
                    """
                    UPDATE prediction_batch
                    SET prediction_date = ?, source_type = ?, status = ?, archived_at = ?, updated_at = CURRENT_TIMESTAMP
                    WHERE id = ?
                    """,
                    (
                        payload["prediction_date"],
                        "script",
                        status,
                        None,
                        batch_id,
                    ),
                )
                if archive_metadata:
                    cursor.execute(
                        """
                        UPDATE prediction_batch
                        SET archived_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (batch_id,),
                    )
                cursor.execute("DELETE FROM prediction_model_run WHERE prediction_batch_id = ?", (batch_id,))
            else:
                cursor.execute(
                    """
                    INSERT INTO prediction_batch (target_issue_id, prediction_date, source_type, status, archived_at)
                    VALUES (?, ?, 'script', ?, ?)
                    """,
                    (
                        target_issue_id,
                        payload["prediction_date"],
                        status,
                        None,
                    ),
                )
                batch_id = int(cursor.lastrowid)
                if archive_metadata:
                    cursor.execute(
                        """
                        UPDATE prediction_batch
                        SET archived_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                        (batch_id,),
                    )

        self._save_model_runs(
            connection,
            batch_id=batch_id,
            lottery_code=lottery_code,
            models=payload.get("models", []),
            actual_result=actual_result,
            draw_result_id=draw_result_id,
            persist_hit_details=archive_metadata,
        )
        return batch_id

    def _upsert_draw_result(self, connection, *, issue_id: int, actual_result: dict[str, Any]) -> int:
        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO draw_result (issue_id, jackpot_pool_balance)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE
                    issue_id = VALUES(issue_id),
                    jackpot_pool_balance = VALUES(jackpot_pool_balance)
                """,
                (issue_id, int(actual_result.get("jackpot_pool_balance") or 0)),
            )
            cursor.execute("SELECT id FROM draw_result WHERE issue_id = ?", (issue_id,))
            draw_result_id = int(cursor.fetchone()["id"])
            cursor.execute("DELETE FROM draw_result_number WHERE draw_result_id = ?", (draw_result_id,))
            _insert_number_rows(
                cursor,
                table_name="draw_result_number",
                owner_id_field="draw_result_id",
                owner_id=draw_result_id,
                red_balls=actual_result.get("red_balls", []),
                blue_balls=actual_result.get("blue_balls", []),
                digits=actual_result.get("digits", []),
            )
            if actual_result.get("prize_breakdown"):
                cursor.execute("DELETE FROM draw_result_prize WHERE draw_result_id = ?", (draw_result_id,))
                for prize in actual_result.get("prize_breakdown", []):
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
        return draw_result_id

    def _save_model_runs(
        self,
        connection,
        *,
        batch_id: int,
        lottery_code: str,
        models: list[dict[str, Any]],
        actual_result: dict[str, Any] | None,
        draw_result_id: int | None,
        persist_hit_details: bool,
    ) -> None:
        with connection.cursor() as cursor:
            for display_order, model_payload in enumerate(models, start=1):
                definition = self._resolve_definition(model_payload)
                model_db_id = self._upsert_model_from_payload(connection, model_payload, definition)
                cursor.execute(
                    """
                    INSERT INTO prediction_model_run (
                        prediction_batch_id,
                        model_id,
                        prediction_play_mode,
                        completed_at,
                        run_status,
                        display_order
                    )
                    VALUES (?, ?, ?, CURRENT_TIMESTAMP, 'success', ?)
                    """,
                    (
                        batch_id,
                        model_db_id,
                        str(model_payload.get("prediction_play_mode") or "direct").strip().lower() or "direct",
                        display_order,
                    ),
                )
                model_run_id = int(cursor.lastrowid)
                group_id_map: dict[int, int] = {}
                best_group_id: int | None = None

                for group in model_payload.get("predictions", []):
                    group_no = int(group.get("group_id") or 0)
                    cursor.execute(
                        """
                        INSERT INTO prediction_group (model_run_id, group_no, play_type, sum_value, strategy_text, description_text)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                        (
                            model_run_id,
                            group_no,
                            group.get("play_type"),
                            str(group.get("sum_value") or "").strip() or None,
                            group.get("strategy"),
                            group.get("description"),
                        ),
                    )
                    group_id = int(cursor.lastrowid)
                    group_id_map[group_no] = group_id
                    _insert_number_rows(
                        cursor,
                        table_name="prediction_group_number",
                        owner_id_field="prediction_group_id",
                        owner_id=group_id,
                        red_balls=group.get("red_balls", []),
                        blue_balls=group.get("blue_balls", group.get("blue_ball", [])),
                        digits=group.get("digits", []),
                    )
                    if persist_hit_details and draw_result_id and group.get("hit_result"):
                        hit_result = group.get("hit_result", {})
                        cursor.execute(
                            """
                            INSERT INTO prediction_hit_summary (
                                prediction_group_id,
                                draw_result_id,
                                red_hit_count,
                                blue_hit_count
                            )
                            VALUES (?, ?, ?, ?)
                            """,
                            (
                                group_id,
                                draw_result_id,
                                int(hit_result.get("red_hit_count") or 0),
                                int(hit_result.get("blue_hit_count") or 0),
                            ),
                        )
                        hit_summary_id = int(cursor.lastrowid)
                        for ball_color, ball_position, ball_value in self._build_hit_number_rows(
                            lottery_code=lottery_code,
                            group=group,
                            hit_result=hit_result,
                            actual_result=actual_result,
                        ):
                            cursor.execute(
                                """
                                INSERT INTO prediction_hit_number (hit_summary_id, ball_color, ball_position, ball_value)
                                VALUES (?, ?, ?, ?)
                                """,
                                (hit_summary_id, ball_color, ball_position, ball_value),
                            )

                if persist_hit_details:
                    best_group_no = model_payload.get("best_group")
                    if best_group_no is not None:
                        best_group_id = group_id_map.get(int(best_group_no))
                    cursor.execute(
                        """
                        INSERT INTO model_batch_summary (model_run_id, best_group_id)
                        VALUES (?, ?)
                        """,
                        (model_run_id, best_group_id),
                    )

    @staticmethod
    def _build_hit_number_rows(
        *,
        lottery_code: str,
        group: dict[str, Any],
        hit_result: dict[str, Any],
        actual_result: dict[str, Any] | None,
    ) -> list[tuple[str, int | None, str]]:
        normalized_code = normalize_lottery_code(lottery_code)
        if normalized_code == "dlt":
            rows: list[tuple[str, int | None, str]] = []
            for ball_color, field_name in (("red", "red_balls"), ("blue", "blue_balls")):
                predicted_values = [str(value).zfill(2) for value in group.get(field_name, [])]
                hit_values = {str(value).zfill(2) for value in hit_result.get(f"{ball_color}_hits", [])}
                for index, value in enumerate(predicted_values, start=1):
                    if value in hit_values:
                        rows.append((ball_color, index, value))
            return rows

        play_type = str(group.get("play_type") or "direct").strip().lower()
        if normalized_code == "pl5" or play_type == "direct":
            predicted_digits = normalize_digit_balls(group.get("digits", group.get("red_balls", [])))
            actual_digits = normalize_digit_balls((actual_result or {}).get("digits", (actual_result or {}).get("red_balls", [])))
            return [
                ("digit", index, predicted_digit)
                for index, (predicted_digit, actual_digit) in enumerate(zip(predicted_digits, actual_digits), start=1)
                if predicted_digit == actual_digit
            ]

        hit_values = [str(value).zfill(2) for value in hit_result.get("digit_hits", [])]
        if play_type == "direct_sum":
            return [("digit", index, value) for index, value in enumerate(hit_values, start=1)]

        remaining_hits = list(hit_values)
        predicted_group = normalize_group_digits(group.get("digits", group.get("red_balls", [])))
        rows: list[tuple[str, int | None, str]] = []
        for index, value in enumerate(predicted_group, start=1):
            if value in remaining_hits:
                rows.append(("digit", index, value))
                remaining_hits.remove(value)
        return rows

    def _upsert_model_from_payload(
        self,
        connection,
        model_payload: dict[str, Any],
        definition: ModelDefinition | None,
    ) -> int:
        provider_code = str(
            model_payload.get("model_provider")
            or (definition.provider if definition else "openai_compatible")
        )
        provider_name = "DeepSeek" if provider_code == "deepseek" else provider_code.replace("_", " ").title()
        model_code = str(model_payload.get("model_id") or (definition.model_id if definition else ""))
        display_name = str(model_payload.get("model_name") or (definition.name if definition else model_code))
        api_model_name = str(model_payload.get("model_api_model") or (definition.api_model if definition else ""))
        version = model_payload.get("model_version") or (definition.version if definition else None)
        tags = model_payload.get("model_tags") or (definition.tags if definition else [])
        lottery_codes = model_payload.get("lottery_codes") or (definition.lottery_codes if definition else ["dlt"])

        with connection.cursor() as cursor:
            cursor.execute(
                """
                INSERT INTO model_provider (provider_code, provider_name)
                VALUES (?, ?)
                ON DUPLICATE KEY UPDATE provider_name = VALUES(provider_name)
                """,
                (provider_code, provider_name),
            )
            cursor.execute("SELECT id FROM model_provider WHERE provider_code = ?", (provider_code,))
            provider_id = int(cursor.fetchone()["id"])
            provider_model_name = api_model_name or model_code
            cursor.execute(
                """
                SELECT id
                FROM provider_model_config
                WHERE provider_id = ? AND model_id = ?
                LIMIT 1
                """,
                (provider_id, provider_model_name),
            )
            provider_model_row = cursor.fetchone()
            if provider_model_row:
                provider_model_id = int(provider_model_row["id"])
            else:
                cursor.execute("SELECT COALESCE(MAX(sort_order), 0) AS sort_order FROM provider_model_config WHERE provider_id = ?", (provider_id,))
                sort_order = int((cursor.fetchone() or {}).get("sort_order") or 0) + 1
                cursor.execute(
                    """
                    INSERT INTO provider_model_config (provider_id, model_id, display_name, sort_order, is_deleted)
                    VALUES (?, ?, ?, ?, 0)
                    """,
                    (provider_id, provider_model_name, display_name or provider_model_name, sort_order),
                )
                provider_model_id = int(cursor.lastrowid)
            cursor.execute(
                """
                INSERT INTO ai_model (
                    model_code,
                    display_name,
                    provider_model_id,
                    api_model_name,
                    version,
                    is_active,
                    updated_at
                )
                VALUES (?, ?, ?, ?, ?, 1, CURRENT_TIMESTAMP)
                ON DUPLICATE KEY UPDATE
                    display_name = VALUES(display_name),
                    provider_model_id = VALUES(provider_model_id),
                    api_model_name = VALUES(api_model_name),
                    version = VALUES(version),
                    updated_at = CURRENT_TIMESTAMP
                """,
                (model_code, display_name, provider_model_id, api_model_name, version),
            )
            cursor.execute("SELECT id FROM ai_model WHERE model_code = ?", (model_code,))
            model_db_id = int(cursor.fetchone()["id"])
            cursor.execute("DELETE FROM ai_model_tag WHERE model_id = ?", (model_db_id,))
            for tag in tags:
                tag_code = str(tag)
                cursor.execute(
                    """
                    INSERT INTO model_tag (tag_code, tag_name)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE tag_name = VALUES(tag_name)
                    """,
                    (tag_code, tag_code),
                )
                cursor.execute("SELECT id FROM model_tag WHERE tag_code = ?", (tag_code,))
                tag_id = int(cursor.fetchone()["id"])
                cursor.execute(
                    """
                    INSERT INTO ai_model_tag (model_id, tag_id)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE model_id = VALUES(model_id)
                    """,
                    (model_db_id, tag_id),
                )
            cursor.execute("DELETE FROM ai_model_lottery WHERE model_id = ?", (model_db_id,))
            for lottery_code in lottery_codes:
                cursor.execute(
                    """
                    INSERT INTO ai_model_lottery (model_id, lottery_code)
                    VALUES (?, ?)
                    ON DUPLICATE KEY UPDATE lottery_code = VALUES(lottery_code)
                    """,
                    (model_db_id, normalize_lottery_code(str(lottery_code))),
                )
            return model_db_id

    def _upsert_model_definition(self, connection, definition: ModelDefinition) -> None:
        self._upsert_model_from_payload(
            connection,
            {
                "model_id": definition.model_id,
                "model_name": definition.name,
                "model_provider": definition.provider,
                "model_version": definition.version,
                "model_tags": definition.tags,
                "lottery_codes": definition.lottery_codes,
                "model_api_model": definition.api_model,
            },
            definition,
        )

    def _resolve_definition(self, model_payload: dict[str, Any]) -> ModelDefinition | None:
        if self._registry is None:
            self._registry = _load_registry()
        if not self._registry:
            return None
        model_code = str(model_payload.get("model_id") or "")
        try:
            return self._registry.get(model_code)
        except KeyError:
            return None

    def _build_batch_payload(
        self,
        cursor,
        batch_row: dict[str, Any],
        *,
        lottery_code: str,
        include_actual_result: bool,
    ) -> dict[str, Any]:
        batch_id = int(batch_row["id"])
        cursor.execute(
            """
            SELECT
                pmr.id,
                pmr.display_order,
                pmr.prediction_play_mode,
                am.model_code AS model_id,
                am.display_name AS model_name,
                mp.provider_code AS model_provider,
                am.version AS model_version,
                am.api_model_name AS model_api_model
            FROM prediction_model_run pmr
            INNER JOIN ai_model am ON am.id = pmr.model_id
            INNER JOIN provider_model_config pmc ON pmc.id = am.provider_model_id
            INNER JOIN model_provider mp ON mp.id = pmc.provider_id
            WHERE pmr.prediction_batch_id = ?
            ORDER BY pmr.display_order ASC, pmr.id ASC
            """,
            (batch_id,),
        )
        model_rows = cursor.fetchall()
        model_run_ids = [int(row["id"]) for row in model_rows]
        model_id_map = {int(row["id"]): row for row in model_rows}

        tags_by_model_code = self._fetch_tags(cursor, [row["model_id"] for row in model_rows])
        groups_by_run = self._fetch_groups(cursor, model_run_ids)
        summaries_by_run = self._fetch_model_summaries(cursor, model_run_ids)
        actual_result = (
            self._fetch_actual_result(cursor, int(batch_row["target_issue_id"]), lottery_code=lottery_code)
            if include_actual_result
            else None
        )

        models: list[dict[str, Any]] = []
        for model_run_id in model_run_ids:
            model_row = model_id_map[model_run_id]
            groups = groups_by_run.get(model_run_id, [])
            summary = summaries_by_run.get(model_run_id, {})
            models.append(
                {
                    "model_id": model_row["model_id"],
                    "prediction_play_mode": str(model_row.get("prediction_play_mode") or "direct"),
                    "model_name": model_row["model_name"],
                    "model_provider": model_row["model_provider"],
                    "model_version": model_row.get("model_version"),
                    "model_tags": tags_by_model_code.get(model_row["model_id"], []),
                    "model_api_model": model_row.get("model_api_model"),
                    "predictions": groups,
                    "best_group": summary.get("best_group"),
                    "best_hit_count": summary.get("best_hit_count"),
                }
            )

        payload = {
            "lottery_code": lottery_code,
            "prediction_date": batch_row["prediction_date"],
            "target_period": display_period(lottery_code, batch_row["target_period"]),
            "models": models,
        }
        if include_actual_result:
            payload["actual_result"] = actual_result
        return payload

    @staticmethod
    def _fetch_model_runs_by_batch(cursor, batch_ids: list[int]) -> list[dict[str, Any]]:
        if not batch_ids:
            return []
        placeholders = ", ".join("?" for _ in batch_ids)
        cursor.execute(
            f"""
            SELECT
                pmr.id,
                pmr.prediction_batch_id,
                pmr.display_order,
                pmr.prediction_play_mode,
                am.model_code AS model_id,
                am.display_name AS model_name,
                mp.provider_code AS model_provider,
                am.version AS model_version,
                am.api_model_name AS model_api_model
            FROM prediction_model_run pmr
            INNER JOIN ai_model am ON am.id = pmr.model_id
            INNER JOIN provider_model_config pmc ON pmc.id = am.provider_model_id
            INNER JOIN model_provider mp ON mp.id = pmc.provider_id
            WHERE pmr.prediction_batch_id IN ({placeholders})
            ORDER BY pmr.prediction_batch_id ASC, pmr.display_order ASC, pmr.id ASC
            """,
            tuple(batch_ids),
        )
        return cursor.fetchall()

    @staticmethod
    def _fetch_tags(cursor, model_codes: list[str]) -> dict[str, list[str]]:
        if not model_codes:
            return {}
        placeholders = ", ".join("?" for _ in model_codes)
        cursor.execute(
            f"""
            SELECT am.model_code, mt.tag_code
            FROM ai_model am
            INNER JOIN ai_model_tag amt ON amt.model_id = am.id
            INNER JOIN model_tag mt ON mt.id = amt.tag_id
            WHERE am.model_code IN ({placeholders})
            ORDER BY mt.tag_code ASC
            """,
            tuple(model_codes),
        )
        result: dict[str, list[str]] = {}
        for row in cursor.fetchall():
            result.setdefault(row["model_code"], []).append(row["tag_code"])
        return result

    def _fetch_groups(self, cursor, model_run_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not model_run_ids:
            return {}
        placeholders = ", ".join("?" for _ in model_run_ids)
        cursor.execute(
            f"""
            SELECT id, model_run_id, group_no, play_type, sum_value, strategy_text, description_text
            FROM prediction_group
            WHERE model_run_id IN ({placeholders})
            ORDER BY model_run_id ASC, group_no ASC
            """,
            tuple(model_run_ids),
        )
        group_rows = cursor.fetchall()
        group_ids = [int(row["id"]) for row in group_rows]
        numbers_by_group = self._fetch_group_numbers(cursor, group_ids)
        hit_by_group = self._fetch_hit_summaries(cursor, group_ids)

        groups_by_run: dict[int, list[dict[str, Any]]] = {}
        for row in group_rows:
            group_id = int(row["id"])
            numbers = numbers_by_group.get(group_id, [])
            red_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "red"]
            blue_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "blue"]
            digits = [item["ball_value"] for item in numbers if item["ball_color"] == "digit"]
            hit_result = hit_by_group.get(group_id)
            groups_by_run.setdefault(int(row["model_run_id"]), []).append(
                {
                    "group_id": int(row["group_no"]),
                    "play_type": row.get("play_type"),
                    "sum_value": row.get("sum_value"),
                    "strategy": row.get("strategy_text"),
                    "description": row.get("description_text"),
                    "red_balls": red_balls or digits,
                    "blue_balls": blue_balls,
                    "blue_ball": blue_balls[0] if blue_balls else None,
                    "digits": digits,
                    **({"hit_result": hit_result} if hit_result else {}),
                }
            )
        return groups_by_run

    @staticmethod
    def _fetch_group_metrics_by_run(cursor, model_run_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not model_run_ids:
            return {}
        placeholders = ", ".join("?" for _ in model_run_ids)
        cursor.execute(
            f"""
            SELECT
                pg.model_run_id,
                pg.group_no,
                COALESCE(phs.red_hit_count, 0) AS red_hit_count,
                COALESCE(phs.blue_hit_count, 0) AS blue_hit_count,
                COUNT(phn.id) AS total_hit_count
            FROM prediction_group pg
            LEFT JOIN prediction_hit_summary phs ON phs.prediction_group_id = pg.id
            LEFT JOIN prediction_hit_number phn ON phn.hit_summary_id = phs.id
            WHERE pg.model_run_id IN ({placeholders})
            GROUP BY pg.model_run_id, pg.group_no, phs.red_hit_count, phs.blue_hit_count
            ORDER BY pg.model_run_id ASC, pg.group_no ASC
            """,
            tuple(model_run_ids),
        )
        result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            result.setdefault(int(row["model_run_id"]), []).append(
                {
                    "group_id": int(row["group_no"]),
                    "red_hit_count": int(row.get("red_hit_count") or 0),
                    "blue_hit_count": int(row.get("blue_hit_count") or 0),
                    "total_hits": int(row.get("total_hit_count") or 0),
                }
            )
        return result

    @staticmethod
    def _fetch_group_numbers(cursor, group_ids: list[int]) -> dict[int, list[dict[str, Any]]]:
        if not group_ids:
            return {}
        placeholders = ", ".join("?" for _ in group_ids)
        cursor.execute(
            f"""
            SELECT prediction_group_id, ball_color, ball_position, ball_value
            FROM prediction_group_number
            WHERE prediction_group_id IN ({placeholders})
            ORDER BY prediction_group_id ASC, ball_color ASC, ball_position ASC
            """,
            tuple(group_ids),
        )
        result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            result.setdefault(int(row["prediction_group_id"]), []).append(row)
        return result

    @staticmethod
    def _fetch_hit_summaries(cursor, group_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not group_ids:
            return {}
        placeholders = ", ".join("?" for _ in group_ids)
        cursor.execute(
            f"""
            SELECT id, prediction_group_id, red_hit_count, blue_hit_count
            FROM prediction_hit_summary
            WHERE prediction_group_id IN ({placeholders})
            """,
            tuple(group_ids),
        )
        summary_rows = cursor.fetchall()
        if not summary_rows:
            return {}

        summary_ids = [int(row["id"]) for row in summary_rows]
        placeholders = ", ".join("?" for _ in summary_ids)
        cursor.execute(
            f"""
            SELECT hit_summary_id, ball_color, ball_position, ball_value
            FROM prediction_hit_number
            WHERE hit_summary_id IN ({placeholders})
            ORDER BY hit_summary_id ASC, ball_color ASC, ball_position ASC, ball_value ASC
            """,
            tuple(summary_ids),
        )
        hits_by_summary: dict[int, dict[str, list[str]]] = {}
        for row in cursor.fetchall():
            entry = hits_by_summary.setdefault(int(row["hit_summary_id"]), {"red": [], "blue": [], "digit": []})
            entry[row["ball_color"]].append(row["ball_value"])

        result: dict[int, dict[str, Any]] = {}
        for row in summary_rows:
            summary_id = int(row["id"])
            hit_values = hits_by_summary.get(summary_id, {"red": [], "blue": [], "digit": []})
            result[int(row["prediction_group_id"])] = {
                "red_hits": hit_values["red"],
                "red_hit_count": int(row["red_hit_count"]),
                "blue_hits": hit_values["blue"],
                "blue_hit_count": int(row["blue_hit_count"]),
                "digit_hits": hit_values["digit"],
                "digit_hit_count": len(hit_values["digit"]),
                "total_hits": len(hit_values["red"]) + len(hit_values["blue"]) + len(hit_values["digit"]),
            }
        return result

    @staticmethod
    def _fetch_model_summaries(cursor, model_run_ids: list[int]) -> dict[int, dict[str, Any]]:
        if not model_run_ids:
            return {}
        placeholders = ", ".join("?" for _ in model_run_ids)
        cursor.execute(
            f"""
            SELECT
                mbs.model_run_id,
                pg.group_no AS best_group,
                COUNT(phn.id) AS best_hit_count
            FROM model_batch_summary mbs
            LEFT JOIN prediction_group pg ON pg.id = mbs.best_group_id
            LEFT JOIN prediction_hit_summary phs ON phs.prediction_group_id = mbs.best_group_id
            LEFT JOIN prediction_hit_number phn ON phn.hit_summary_id = phs.id
            WHERE mbs.model_run_id IN ({placeholders})
            GROUP BY mbs.model_run_id, pg.group_no
            """,
            tuple(model_run_ids),
        )
        return {
            int(row["model_run_id"]): {
                "best_group": row.get("best_group"),
                "best_hit_count": int(row.get("best_hit_count") or 0),
            }
            for row in cursor.fetchall()
        }

    @staticmethod
    def _fetch_actual_result(cursor, target_issue_id: int, *, lottery_code: str) -> dict[str, Any] | None:
        return PredictionRepository._fetch_actual_results(cursor, [target_issue_id], lottery_code=lottery_code).get(target_issue_id)

    @staticmethod
    def _fetch_actual_results(cursor, target_issue_ids: list[int], *, lottery_code: str) -> dict[int, dict[str, Any]]:
        if not target_issue_ids:
            return {}
        placeholders = ", ".join("?" for _ in target_issue_ids)
        cursor.execute(
            """
            SELECT dr.id AS draw_result_id, dr.issue_id, dr.jackpot_pool_balance, di.issue_no AS period, di.draw_date
            FROM draw_result dr
            INNER JOIN draw_issue di ON di.id = dr.issue_id
            WHERE dr.issue_id IN ("""
            + placeholders
            + ")",
            tuple(target_issue_ids),
        )
        rows = cursor.fetchall()
        if not rows:
            return {}
        draw_result_ids = [int(row["draw_result_id"]) for row in rows]
        placeholders = ", ".join("?" for _ in draw_result_ids)
        cursor.execute(
            f"""
            SELECT draw_result_id, ball_color, ball_position, ball_value
            FROM draw_result_number
            WHERE draw_result_id IN ({placeholders})
            ORDER BY draw_result_id ASC, ball_color ASC, ball_position ASC
            """,
            tuple(draw_result_ids),
        )
        numbers_by_result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            numbers_by_result.setdefault(int(row["draw_result_id"]), []).append(row)

        placeholders = ", ".join("?" for _ in draw_result_ids)
        cursor.execute(
            f"""
            SELECT draw_result_id, prize_level, prize_type, winner_count, prize_amount, total_amount
            FROM draw_result_prize
            WHERE draw_result_id IN ({placeholders})
            ORDER BY draw_result_id ASC, id ASC
            """,
            tuple(draw_result_ids),
        )
        prizes_by_result: dict[int, list[dict[str, Any]]] = {}
        for row in cursor.fetchall():
            prizes_by_result.setdefault(int(row["draw_result_id"]), []).append(
                {
                    "prize_level": row["prize_level"],
                    "prize_type": row["prize_type"],
                    "winner_count": int(row.get("winner_count") or 0),
                    "prize_amount": int(row.get("prize_amount") or 0),
                    "total_amount": int(row.get("total_amount") or 0),
                }
            )

        result: dict[int, dict[str, Any]] = {}
        for row in rows:
            numbers = numbers_by_result.get(int(row["draw_result_id"]), [])
            normalized_code = normalize_lottery_code(lottery_code)
            red_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "red"]
            blue_balls = [item["ball_value"] for item in numbers if item["ball_color"] == "blue"]
            digits = [item["ball_value"] for item in numbers if item["ball_color"] == "digit"]
            result[int(row["issue_id"])] = {
                "lottery_code": normalized_code,
                "period": display_period(normalized_code, row["period"]),
                "date": row.get("draw_date") or "",
                "red_balls": red_balls or digits,
                "blue_balls": blue_balls,
                "blue_ball": blue_balls[0] if blue_balls else None,
                "digits": digits,
                "jackpot_pool_balance": int(row.get("jackpot_pool_balance") or 0),
                "prize_breakdown": prizes_by_result.get(int(row["draw_result_id"]), []),
            }
        return result


def _load_registry() -> ModelRegistry | None:
    try:
        return load_model_registry()
    except Exception:
        return None
