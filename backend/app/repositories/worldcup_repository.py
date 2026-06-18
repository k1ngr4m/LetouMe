from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from backend.app.db.connection import get_connection


WORLDCUP_COMPLIANCE_NOTICE = "预测仅供参考研究，不保证命中；请以线下实体店和官方公告为准，理性参与。"


class WorldCupRepository:
    PLAY_TYPES = ("win_draw_win", "handicap_win_draw_win", "total_goals", "correct_score", "half_full_time")

    def upsert_matches(self, matches: list[dict[str, Any]]) -> int:
        if not matches:
            return 0
        saved_count = 0
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for match in matches:
                    cursor.execute(
                        """
                        INSERT INTO worldcup_match (
                            match_id,
                            sporttery_match_id,
                            match_num,
                            match_num_str,
                            match_num_date,
                            tax_date_no,
                            home_team,
                            away_team,
                            kickoff_at,
                            stage,
                            league_name,
                            business_date,
                            sell_status,
                            match_status,
                            score,
                            remark,
                            data_sources_json,
                            source_updated_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            sporttery_match_id = VALUES(sporttery_match_id),
                            match_num = VALUES(match_num),
                            match_num_str = VALUES(match_num_str),
                            match_num_date = VALUES(match_num_date),
                            tax_date_no = VALUES(tax_date_no),
                            home_team = VALUES(home_team),
                            away_team = VALUES(away_team),
                            kickoff_at = VALUES(kickoff_at),
                            stage = VALUES(stage),
                            league_name = VALUES(league_name),
                            business_date = VALUES(business_date),
                            sell_status = VALUES(sell_status),
                            match_status = VALUES(match_status),
                            score = VALUES(score),
                            remark = VALUES(remark),
                            data_sources_json = VALUES(data_sources_json),
                            source_updated_at = VALUES(source_updated_at)
                        """,
                        (
                            match["match_id"],
                            match.get("sporttery_match_id"),
                            match.get("match_num"),
                            match.get("match_num_str"),
                            match.get("match_num_date"),
                            match.get("tax_date_no"),
                            match["home_team"],
                            match["away_team"],
                            match["kickoff_at"],
                            match.get("stage") or "世界杯",
                            match.get("league_name") or "世界杯",
                            match.get("business_date"),
                            match.get("sell_status"),
                            match.get("match_status") or "scheduled",
                            match.get("score"),
                            match.get("remark"),
                            json.dumps(match.get("data_sources") or ["sporttery"], ensure_ascii=False),
                            match.get("source_updated_at"),
                        ),
                    )
                    saved_count += 1
        return saved_count

    def upsert_odds_snapshots(self, odds_rows: list[dict[str, Any]]) -> int:
        if not odds_rows:
            return 0
        saved_count = 0
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for row in odds_rows:
                    cursor.execute(
                        """
                        INSERT INTO worldcup_odds_snapshot (
                            odds_id,
                            match_id,
                            play_type,
                            odds_json,
                            goal_line,
                            single_status,
                            sell_status,
                            source,
                            source_updated_at,
                            fetched_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            odds_json = VALUES(odds_json),
                            goal_line = VALUES(goal_line),
                            single_status = VALUES(single_status),
                            sell_status = VALUES(sell_status),
                            source = VALUES(source),
                            source_updated_at = VALUES(source_updated_at),
                            fetched_at = VALUES(fetched_at)
                        """,
                        (
                            row["odds_id"],
                            row["match_id"],
                            row["play_type"],
                            json.dumps(row.get("odds") or {}, ensure_ascii=False, sort_keys=True),
                            row.get("goal_line"),
                            row.get("single_status"),
                            row.get("sell_status"),
                            row.get("source") or "sporttery",
                            row.get("source_updated_at"),
                            row.get("fetched_at") or datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M:%S"),
                        ),
                    )
                    saved_count += 1
        return saved_count

    def upsert_recommendations(self, recommendations: list[dict[str, Any]]) -> int:
        if not recommendations:
            return 0
        saved_count = 0
        with get_connection() as connection:
            with connection.cursor() as cursor:
                for recommendation in recommendations:
                    cursor.execute(
                        """
                        INSERT INTO worldcup_recommendation (
                            recommendation_id,
                            match_id,
                            play_type,
                            selection,
                            odds_value,
                            implied_probability,
                            confidence_score,
                            confidence_level,
                            risk_level,
                            budget_min,
                            budget_max,
                            reason,
                            input_summary_json,
                            ai_payload_json,
                            model_code,
                            model_name,
                            model_sources_json,
                            risk_tags_json,
                            status,
                            compliance_notice
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE
                            selection = VALUES(selection),
                            odds_value = VALUES(odds_value),
                            implied_probability = VALUES(implied_probability),
                            confidence_score = VALUES(confidence_score),
                            confidence_level = VALUES(confidence_level),
                            risk_level = VALUES(risk_level),
                            budget_min = VALUES(budget_min),
                            budget_max = VALUES(budget_max),
                            reason = VALUES(reason),
                            input_summary_json = VALUES(input_summary_json),
                            ai_payload_json = VALUES(ai_payload_json),
                            model_code = VALUES(model_code),
                            model_name = VALUES(model_name),
                            model_sources_json = VALUES(model_sources_json),
                            risk_tags_json = VALUES(risk_tags_json),
                            status = VALUES(status),
                            compliance_notice = VALUES(compliance_notice),
                            updated_at = CURRENT_TIMESTAMP
                        """,
                        (
                            recommendation["recommendation_id"],
                            recommendation["match_id"],
                            recommendation["play_type"],
                            recommendation["selection"],
                            recommendation.get("odds_value"),
                            recommendation.get("implied_probability"),
                            recommendation.get("confidence_score"),
                            recommendation.get("confidence_level") or "medium",
                            recommendation.get("risk_level") or "medium",
                            int(recommendation.get("budget_min") or 0),
                            int(recommendation.get("budget_max") or 0),
                            recommendation.get("reason") or "",
                            json.dumps(recommendation.get("input_summary") or {}, ensure_ascii=False, sort_keys=True),
                            json.dumps(recommendation.get("ai_payload") or {}, ensure_ascii=False, sort_keys=True),
                            recommendation.get("model_code"),
                            recommendation.get("model_name"),
                            json.dumps(recommendation.get("model_sources") or [], ensure_ascii=False),
                            json.dumps(recommendation.get("risk_tags") or [], ensure_ascii=False),
                            recommendation.get("status") or "published",
                            recommendation.get("compliance_notice") or WORLDCUP_COMPLIANCE_NOTICE,
                        ),
                    )
                    saved_count += 1
        return saved_count

    def list_matches(
        self,
        *,
        date_start: str | None = None,
        date_end: str | None = None,
        team_query: str | None = None,
        status_filter: str = "all",
    ) -> list[dict[str, Any]]:
        conditions = ["1 = 1"]
        params: list[Any] = []
        if date_start:
            conditions.append("m.kickoff_at >= ?")
            params.append(date_start)
        if date_end:
            conditions.append("m.kickoff_at <= ?")
            params.append(date_end)
        if team_query:
            conditions.append("(m.home_team LIKE ? OR m.away_team LIKE ?)")
            keyword = f"%{team_query}%"
            params.extend([keyword, keyword])
        if status_filter != "all":
            conditions.append("m.match_status = ?")
            params.append(status_filter)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        m.match_id,
                        m.sporttery_match_id,
                        m.match_num,
                        m.match_num_str,
                        m.match_num_date,
                        m.tax_date_no,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.league_name,
                        m.business_date,
                        m.sell_status,
                        m.match_status,
                        m.score,
                        m.remark,
                        m.data_sources_json,
                        m.source_updated_at,
                        COUNT(DISTINCT recommendation.id) AS recommendation_count
                    FROM worldcup_match m
                    LEFT JOIN worldcup_recommendation recommendation
                        ON recommendation.match_id = m.match_id
                        AND recommendation.status = 'published'
                    WHERE {" AND ".join(conditions)}
                    GROUP BY
                        m.match_id,
                        m.sporttery_match_id,
                        m.match_num,
                        m.match_num_str,
                        m.match_num_date,
                        m.tax_date_no,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.league_name,
                        m.business_date,
                        m.sell_status,
                        m.match_status,
                        m.score,
                        m.remark,
                        m.data_sources_json,
                        m.source_updated_at
                    ORDER BY m.kickoff_at ASC, m.id ASC
                    """,
                    tuple(params),
                )
                rows = cursor.fetchall()
                self._attach_odds_snapshots(cursor, rows)
                return rows

    def _attach_odds_snapshots(self, cursor: Any, rows: list[dict[str, Any]]) -> None:
        match_ids = [str(row.get("match_id") or "") for row in rows if str(row.get("match_id") or "")]
        if not match_ids:
            return
        placeholders = ", ".join("?" for _ in match_ids)
        cursor.execute(
            f"""
            SELECT
                match_id,
                play_type,
                odds_json,
                goal_line,
                single_status,
                sell_status AS odds_sell_status,
                source,
                source_updated_at,
                fetched_at AS odds_fetched_at
            FROM worldcup_odds_snapshot
            WHERE match_id IN ({placeholders})
            ORDER BY
                match_id ASC,
                CASE play_type
                    WHEN 'win_draw_win' THEN 1
                    WHEN 'handicap_win_draw_win' THEN 2
                    WHEN 'total_goals' THEN 3
                    WHEN 'correct_score' THEN 4
                    WHEN 'half_full_time' THEN 5
                    ELSE 99
                END ASC,
                fetched_at DESC
            """,
            tuple(match_ids),
        )
        odds_by_match: dict[str, list[dict[str, Any]]] = {match_id: [] for match_id in match_ids}
        for odds_row in cursor.fetchall():
            odds_by_match.setdefault(str(odds_row.get("match_id") or ""), []).append(odds_row)

        for row in rows:
            snapshots = odds_by_match.get(str(row.get("match_id") or ""), [])
            row["odds_snapshots"] = snapshots
            row["odds_count"] = len(snapshots)
            fetched_values = [str(item.get("odds_fetched_at") or "") for item in snapshots if item.get("odds_fetched_at")]
            row["odds_fetched_at"] = max(fetched_values) if fetched_values else None

    def list_recommendations(
        self,
        *,
        user_id: int,
        match_id: str | None = None,
        date_start: str | None = None,
        date_end: str | None = None,
        play_type_filter: str = "all",
        risk_level_filter: str = "all",
    ) -> list[dict[str, Any]]:
        conditions = ["recommendation.status = 'published'"]
        params: list[Any] = []
        if match_id:
            conditions.append("recommendation.match_id = ?")
            params.append(match_id)
        if date_start:
            conditions.append("m.kickoff_at >= ?")
            params.append(date_start)
        if date_end:
            conditions.append("m.kickoff_at <= ?")
            params.append(date_end)
        if play_type_filter != "all":
            conditions.append("recommendation.play_type = ?")
            params.append(play_type_filter)
        if risk_level_filter != "all":
            conditions.append("recommendation.risk_level = ?")
            params.append(risk_level_filter)

        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        recommendation.*,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.league_name,
                        m.business_date,
                        m.sell_status,
                        m.match_status,
                        m.score,
                        m.remark,
                        m.source_updated_at,
                        odds.odds_json AS latest_odds_json,
                        odds.goal_line AS odds_goal_line,
                        odds.fetched_at AS odds_fetched_at,
                        CASE WHEN favorite.user_id IS NULL THEN 0 ELSE 1 END AS is_favorite
                    FROM worldcup_recommendation recommendation
                    INNER JOIN worldcup_match m ON m.match_id = recommendation.match_id
                    LEFT JOIN worldcup_favorite favorite
                        ON favorite.recommendation_id = recommendation.recommendation_id
                        AND favorite.user_id = ?
                    LEFT JOIN worldcup_odds_snapshot odds
                        ON odds.match_id = recommendation.match_id
                        AND odds.play_type = recommendation.play_type
                    WHERE {" AND ".join(conditions)}
                    ORDER BY
                        CASE recommendation.risk_level
                            WHEN 'low' THEN 1
                            WHEN 'medium' THEN 2
                            ELSE 3
                        END ASC,
                        m.kickoff_at ASC,
                        recommendation.updated_at DESC,
                        recommendation.id ASC
                    """,
                    tuple([user_id, *params]),
                )
                return cursor.fetchall()

    def list_recent_matches_with_odds(self, *, limit: int = 12, match_date: str | None = None) -> list[dict[str, Any]]:
        conditions = ["m.match_status != 'finished'"]
        params: list[Any] = []
        if match_date:
            try:
                start_at = datetime.strptime(match_date, "%Y-%m-%d")
            except ValueError as exc:
                raise ValueError("比赛日期格式必须为 YYYY-MM-DD") from exc
            end_at = start_at + timedelta(days=1)
            conditions.extend(["m.kickoff_at >= ?", "m.kickoff_at < ?"])
            params.extend([
                start_at.strftime("%Y-%m-%d %H:%M:%S"),
                end_at.strftime("%Y-%m-%d %H:%M:%S"),
            ])
        params.append(max(1, int(limit)))
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        m.*,
                        odds.play_type,
                        odds.odds_json,
                        odds.goal_line,
                        odds.single_status,
                        odds.sell_status AS odds_sell_status,
                        odds.fetched_at AS odds_fetched_at
                    FROM worldcup_match m
                    INNER JOIN worldcup_odds_snapshot odds ON odds.match_id = m.match_id
                    WHERE {" AND ".join(conditions)}
                    ORDER BY m.kickoff_at ASC, odds.play_type ASC
                    LIMIT ?
                    """,
                    tuple(params),
                )
                return cursor.fetchall()

    def get_match(self, match_id: str) -> dict[str, Any] | None:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT
                        m.*
                    FROM worldcup_match m
                    WHERE m.match_id = ?
                    LIMIT 1
                    """,
                    (match_id,),
                )
                row = cursor.fetchone()
                return row if isinstance(row, dict) else None

    def get_recommendation(self, recommendation_id: str, *, user_id: int) -> dict[str, Any] | None:
        rows = self.list_recommendations(user_id=user_id)
        return next((row for row in rows if str(row.get("recommendation_id")) == recommendation_id), None)

    def set_favorite(self, user_id: int, recommendation_id: str, favorite: bool) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                if favorite:
                    cursor.execute(
                        """
                        INSERT IGNORE INTO worldcup_favorite (user_id, recommendation_id, created_at)
                        VALUES (?, ?, CURRENT_TIMESTAMP)
                        """,
                        (user_id, recommendation_id),
                    )
                    return True
                cursor.execute(
                    "DELETE FROM worldcup_favorite WHERE user_id = ? AND recommendation_id = ?",
                    (user_id, recommendation_id),
                )
                return False

    def create_simulation_ticket(self, user_id: int, payload: dict[str, Any]) -> int:
        items = payload.get("items") or []
        if not items:
            raise ValueError("至少需要一场比赛")
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO worldcup_simulation_ticket (
                        user_id,
                        title,
                        status,
                        total_amount,
                        multiplier,
                        note,
                        source_recommendation_id
                    ) VALUES (?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        user_id,
                        payload.get("title") or "世界杯模拟方案",
                        payload.get("status") or "draft",
                        int(payload.get("total_amount") or 0),
                        int(payload.get("multiplier") or 1),
                        payload.get("note"),
                        payload.get("source_recommendation_id"),
                    ),
                )
                ticket_id = int(cursor.lastrowid)
                for item in items:
                    cursor.execute(
                        """
                        INSERT INTO worldcup_simulation_ticket_item (
                            ticket_id,
                            match_id,
                            recommendation_id,
                            play_type,
                            selection,
                            odds_value,
                            odds_snapshot_json,
                            confidence_level,
                            amount
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            ticket_id,
                            item["match_id"],
                            item.get("recommendation_id"),
                            item["play_type"],
                            item["selection"],
                            item.get("odds_value"),
                            json.dumps(item.get("odds_snapshot") or {}, ensure_ascii=False, sort_keys=True),
                            item.get("confidence_level"),
                            int(item.get("amount") or 0),
                        ),
                    )
                return ticket_id

    def list_simulation_tickets(self, user_id: int, *, status_filter: str = "all") -> list[dict[str, Any]]:
        conditions = ["ticket.user_id = ?"]
        params: list[Any] = [user_id]
        if status_filter != "all":
            conditions.append("ticket.status = ?")
            params.append(status_filter)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        ticket.id AS ticket_id,
                        ticket.title,
                        ticket.status,
                        ticket.total_amount,
                        ticket.multiplier,
                        ticket.note,
                        ticket.source_recommendation_id,
                        ticket.created_at AS ticket_created_at,
                        ticket.updated_at AS ticket_updated_at,
                        item.id AS item_id,
                        item.recommendation_id,
                        item.play_type,
                        item.selection,
                        item.odds_value,
                        item.odds_snapshot_json,
                        item.confidence_level,
                        item.amount AS item_amount,
                        m.match_id,
                        m.sporttery_match_id,
                        m.match_num_str,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.match_status,
                        m.score,
                        m.sell_status,
                        COUNT(DISTINCT recommendation.id) AS recommendation_count
                    FROM worldcup_simulation_ticket ticket
                    INNER JOIN worldcup_simulation_ticket_item item ON item.ticket_id = ticket.id
                    INNER JOIN worldcup_match m ON m.match_id = item.match_id
                    LEFT JOIN worldcup_recommendation recommendation
                        ON recommendation.match_id = m.match_id
                        AND recommendation.status = 'published'
                    WHERE {" AND ".join(conditions)}
                    GROUP BY
                        ticket.id,
                        ticket.title,
                        ticket.status,
                        ticket.total_amount,
                        ticket.multiplier,
                        ticket.note,
                        ticket.source_recommendation_id,
                        ticket.created_at,
                        ticket.updated_at,
                        item.id,
                        item.recommendation_id,
                        item.play_type,
                        item.selection,
                        item.odds_value,
                        item.odds_snapshot_json,
                        item.confidence_level,
                        item.amount,
                        m.match_id,
                        m.sporttery_match_id,
                        m.match_num_str,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.match_status,
                        m.score,
                        m.sell_status
                    ORDER BY ticket.updated_at DESC, ticket.id DESC, item.id ASC
                    """,
                    tuple(params),
                )
                return cursor.fetchall()

    def get_simulation_ticket(self, user_id: int, ticket_id: int) -> list[dict[str, Any]]:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    SELECT id
                    FROM worldcup_simulation_ticket
                    WHERE id = ? AND user_id = ?
                    """,
                    (ticket_id, user_id),
                )
                if cursor.fetchone() is None:
                    return []
        rows = self.list_simulation_tickets(user_id)
        return [row for row in rows if int(row.get("ticket_id") or 0) == ticket_id]

    def update_simulation_ticket(self, user_id: int, ticket_id: int, updates: dict[str, Any]) -> bool:
        allowed_fields = {
            "status": "status",
            "total_amount": "total_amount",
            "multiplier": "multiplier",
            "note": "note",
        }
        assignments: list[str] = []
        params: list[Any] = []
        for key, column_name in allowed_fields.items():
            if key not in updates:
                continue
            assignments.append(f"{column_name} = ?")
            params.append(updates[key])
        if not assignments:
            return True
        assignments.append("updated_at = CURRENT_TIMESTAMP")
        params.extend([ticket_id, user_id])
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    UPDATE worldcup_simulation_ticket
                    SET {", ".join(assignments)}
                    WHERE id = ? AND user_id = ?
                    """,
                    tuple(params),
                )
                return cursor.rowcount > 0

    def delete_simulation_ticket(self, user_id: int, ticket_id: int) -> bool:
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    DELETE FROM worldcup_simulation_ticket
                    WHERE id = ? AND user_id = ?
                    """,
                    (ticket_id, user_id),
                )
                return cursor.rowcount > 0

    def list_history_rows(
        self,
        *,
        user_id: int,
        date_start: str | None = None,
        date_end: str | None = None,
        status_filter: str = "all",
        play_type_filter: str = "all",
    ) -> list[dict[str, Any]]:
        conditions = ["recommendation.status = 'published'"]
        params: list[Any] = [user_id]
        if date_start:
            conditions.append("m.kickoff_at >= ?")
            params.append(date_start)
        if date_end:
            conditions.append("m.kickoff_at <= ?")
            params.append(date_end)
        if status_filter == "finished":
            conditions.append("m.match_status = 'finished'")
        elif status_filter == "pending":
            conditions.append("(m.match_status != 'finished' OR m.score IS NULL OR m.score = '')")
        if play_type_filter != "all":
            conditions.append("recommendation.play_type = ?")
            params.append(play_type_filter)
        with get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    f"""
                    SELECT
                        recommendation.*,
                        m.sporttery_match_id,
                        m.match_num_str,
                        m.home_team,
                        m.away_team,
                        m.kickoff_at,
                        m.stage,
                        m.league_name,
                        m.business_date,
                        m.sell_status,
                        m.match_status,
                        m.score,
                        m.remark,
                        m.source_updated_at,
                        odds.odds_json AS latest_odds_json,
                        odds.goal_line AS odds_goal_line,
                        odds.fetched_at AS odds_fetched_at,
                        CASE WHEN favorite.user_id IS NULL THEN 0 ELSE 1 END AS is_favorite
                    FROM worldcup_recommendation recommendation
                    INNER JOIN worldcup_match m ON m.match_id = recommendation.match_id
                    LEFT JOIN worldcup_favorite favorite
                        ON favorite.recommendation_id = recommendation.recommendation_id
                        AND favorite.user_id = ?
                    LEFT JOIN worldcup_odds_snapshot odds
                        ON odds.match_id = recommendation.match_id
                        AND odds.play_type = recommendation.play_type
                    WHERE {" AND ".join(conditions)}
                    ORDER BY m.kickoff_at DESC, recommendation.updated_at DESC, recommendation.id ASC
                    """,
                    tuple(params),
                )
                return cursor.fetchall()

    @staticmethod
    def default_window() -> tuple[str, str]:
        start = datetime(2026, 6, 11, 0, 0, 0)
        end = start + timedelta(hours=72)
        return start.strftime("%Y-%m-%d %H:%M:%S"), end.strftime("%Y-%m-%d %H:%M:%S")
