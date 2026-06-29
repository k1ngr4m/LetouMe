from __future__ import annotations

import json
import os
import tempfile
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient

from backend.app.db import connection as db_connection
from backend.app.main import create_app


class WorldCupApiTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temp_dir = tempfile.TemporaryDirectory()
        sqlite_path = os.path.join(self.temp_dir.name, "worldcup-test.sqlite3")
        self.env = patch.dict(
            os.environ,
            {
                "DB_DRIVER": "sqlite",
                "SQLITE_PATH": sqlite_path,
                "AUTH_BOOTSTRAP_ADMIN_USERNAME": "admin",
                "AUTH_BOOTSTRAP_ADMIN_PASSWORD": "admin123456",
            },
            clear=False,
        )
        self.env.start()
        db_connection._db_ready = False
        db_connection._schema_ready = False
        db_connection._ready_signature = None
        db_connection.ensure_schema()
        self.client = TestClient(create_app())
        self.client.__enter__()
        code = self._issue_register_code("worldcup-player@example.com")
        self.client.post(
            "/api/auth/register",
            json={"username": "worldcup-player", "email": "worldcup-player@example.com", "password": "player12345", "code": code},
        )
        self._insert_worldcup_fixture()

    def tearDown(self) -> None:
        self.client.__exit__(None, None, None)
        self.env.stop()
        self.temp_dir.cleanup()
        db_connection._db_ready = False
        db_connection._schema_ready = False
        db_connection._ready_signature = None

    def _issue_register_code(self, email: str) -> str:
        captured: dict[str, str] = {}

        def _capture_code(target_email: str, code: str) -> None:
            captured["email"] = target_email
            captured["code"] = code

        with patch("backend.app.auth.EmailService.send_password_reset_code", side_effect=_capture_code):
            response = self.client.post("/api/auth/register/send-code", json={"email": email})
        self.assertEqual(response.status_code, 200)
        return captured.get("code", "")

    def _insert_worldcup_fixture(self) -> None:
        with db_connection.get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute(
                    """
                    INSERT INTO worldcup_match (
                        match_id,
                        sporttery_match_id,
                        match_num_str,
                        home_team,
                        away_team,
                        kickoff_at,
                        stage,
                        league_name,
                        match_status,
                        sell_status,
                        score
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "test-worldcup-match",
                        "2040174",
                        "周一013",
                        "西班牙",
                        "佛得角",
                        "2026-06-16 00:00:00",
                        "小组赛",
                        "世界杯",
                        "scheduled",
                        "Selling",
                        None,
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO worldcup_recommendation (
                        recommendation_id,
                        match_id,
                        play_type,
                        selection,
                        odds_value,
                        confidence_score,
                        confidence_level,
                        risk_level,
                        budget_min,
                        budget_max,
                        reason,
                        model_code,
                        model_name,
                        model_sources_json,
                        risk_tags_json,
                        status,
                        compliance_notice
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "test-worldcup-rec-1",
                        "test-worldcup-match",
                        "win_draw_win",
                        "胜",
                        "1.80",
                        63,
                        "medium",
                        "low",
                        10,
                        30,
                        "测试夹具：主队状态更稳。",
                        "worldcup-model-a",
                        "世界杯模型 A",
                        '["fixture"]',
                        '["fixture"]',
                        "published",
                        "预测仅供参考研究，不保证命中；请以线下实体店和官方公告为准，理性参与。",
                    ),
                )
                cursor.execute(
                    """
                    INSERT INTO worldcup_recommendation (
                        recommendation_id,
                        match_id,
                        play_type,
                        selection,
                        confidence_level,
                        risk_level,
                        budget_min,
                        budget_max,
                        reason,
                        model_sources_json,
                        risk_tags_json,
                        status,
                        compliance_notice
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                    """,
                    (
                        "test-worldcup-rec-2",
                        "test-worldcup-match",
                        "total_goals",
                        "总进球数 1-3 球区间",
                        "medium",
                        "medium",
                        10,
                        20,
                        "测试夹具：中低进球区间。",
                        '["fixture"]',
                        '["fixture"]',
                        "published",
                        "预测仅供参考研究，不保证命中；请以线下实体店和官方公告为准，理性参与。",
                    ),
                )
                odds_rows = [
                    (
                        "test-worldcup-match-win-draw-win",
                        "test-worldcup-match",
                        "win_draw_win",
                        {"胜": "1.80", "平": "3.20", "负": "4.60"},
                        None,
                    ),
                    (
                        "test-worldcup-match-handicap",
                        "test-worldcup-match",
                        "handicap_win_draw_win",
                        {"胜": "2.10", "平": "3.55", "负": "2.90"},
                        "-1.00",
                    ),
                    (
                        "test-worldcup-match-score",
                        "test-worldcup-match",
                        "correct_score",
                        {"s10": "6.00", "s90": "25.00", "s00s01": "80.00", "s1sa": "800.0", "s00s01f": "1", "s00s02": "0"},
                        None,
                    ),
                ]
                for odds_id, match_id, play_type, odds, goal_line in odds_rows:
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
                            fetched_at
                        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                        """,
                        (
                            odds_id,
                            match_id,
                            play_type,
                            json.dumps(odds, ensure_ascii=False),
                            goal_line,
                            "1",
                            "Selling",
                            "sporttery",
                            "2026-06-15 11:00:00",
                        ),
                    )

    def test_lists_matches_and_recommendations(self) -> None:
        matches_response = self.client.post("/api/worldcup/matches/list", json={})
        self.assertEqual(matches_response.status_code, 200)
        matches = matches_response.json()["matches"]
        self.assertGreaterEqual(len(matches), 1)
        match = next(item for item in matches if item["match_id"] == "test-worldcup-match")
        self.assertIn("kickoff_at", match)
        self.assertEqual(match["latest_odds"]["胜"], "1.80")
        self.assertEqual([item["play_type"] for item in match["odds_snapshots"]], ["win_draw_win", "handicap_win_draw_win", "correct_score"])
        self.assertEqual(match["odds_snapshots"][1]["goal_line"], "-1.00")
        self.assertEqual(match["odds_snapshots"][2]["odds"]["1:0"], "6.00")
        self.assertEqual(match["odds_snapshots"][2]["odds"]["胜其它"], "25.00")
        self.assertEqual(match["odds_snapshots"][2]["odds"]["0:1"], "80.00")
        self.assertEqual(match["odds_snapshots"][2]["odds"]["负其它"], "800.0")
        self.assertNotIn("s00s01f", match["odds_snapshots"][2]["odds"])
        self.assertNotIn("0:2", match["odds_snapshots"][2]["odds"])

        recommendations_response = self.client.post("/api/worldcup/recommendations/list", json={})
        self.assertEqual(recommendations_response.status_code, 200)
        payload = recommendations_response.json()
        self.assertGreaterEqual(len(payload["recommendations"]), 1)
        self.assertIn("不保证", payload["compliance_notice"])
        win_recommendation = next(item for item in payload["recommendations"] if item["recommendation_id"] == "test-worldcup-rec-1")
        self.assertEqual(win_recommendation["model_code"], "worldcup-model-a")
        self.assertEqual(win_recommendation["model_name"], "世界杯模型 A")
        self.assertEqual(win_recommendation["latest_odds"]["胜"], "1.80")
        self.assertEqual(win_recommendation["confidence_score"], 63.0)
        self.assertLessEqual(
            max(
                sum(1 for item in payload["recommendations"] if item["match"]["match_id"] == match["match_id"])
                for match in matches
            ),
            5,
        )

    def test_detail_favorite_and_simulation_draft(self) -> None:
        list_response = self.client.post("/api/worldcup/recommendations/list", json={})
        recommendation_id = list_response.json()["recommendations"][0]["recommendation_id"]

        detail_response = self.client.post("/api/worldcup/recommendations/detail", json={"recommendation_id": recommendation_id})
        self.assertEqual(detail_response.status_code, 200)
        self.assertEqual(detail_response.json()["recommendation"]["recommendation_id"], recommendation_id)
        self.assertIn("model_code", detail_response.json()["recommendation"])
        self.assertIn("model_name", detail_response.json()["recommendation"])

        favorite_response = self.client.post(
            "/api/worldcup/recommendations/favorite",
            json={"recommendation_id": recommendation_id, "favorite": True},
        )
        self.assertEqual(favorite_response.status_code, 200)
        self.assertTrue(favorite_response.json()["is_favorite"])

        simulation_response = self.client.post(
            "/api/worldcup/recommendations/to-simulation",
            json={"recommendation_id": recommendation_id},
        )
        self.assertEqual(simulation_response.status_code, 200)
        draft = simulation_response.json()
        self.assertIn("线下实体店", draft["checklist"])
        self.assertGreaterEqual(draft["amount"], 0)
        self.assertGreater(draft["ticket_id"], 0)

    def test_worldcup_simulation_ticket_lifecycle(self) -> None:
        list_response = self.client.post("/api/worldcup/recommendations/list", json={})
        recommendation = list_response.json()["recommendations"][0]

        create_response = self.client.post(f"/api/worldcup/recommendations/{recommendation['recommendation_id']}/simulation", json={"multiplier": 2})
        self.assertEqual(create_response.status_code, 200)
        ticket = create_response.json()["ticket"]
        self.assertGreater(ticket["id"], 0)
        self.assertEqual(ticket["multiplier"], 2)
        self.assertEqual(ticket["items"][0]["recommendation_id"], recommendation["recommendation_id"])

        tickets_response = self.client.post("/api/worldcup/simulation/tickets/list", json={})
        self.assertEqual(tickets_response.status_code, 200)
        self.assertEqual(tickets_response.json()["total_count"], 1)

        update_response = self.client.post(
            "/api/worldcup/simulation/tickets/update",
            json={"ticket_id": ticket["id"], "status": "active", "note": "首版测试"},
        )
        self.assertEqual(update_response.status_code, 200)
        self.assertEqual(update_response.json()["ticket"]["status"], "active")

        delete_response = self.client.post("/api/worldcup/simulation/tickets/delete", json={"ticket_id": ticket["id"]})
        self.assertEqual(delete_response.status_code, 200)
        self.assertTrue(delete_response.json()["success"])

    def test_worldcup_history_returns_pending_and_settled_results(self) -> None:
        pending_response = self.client.post("/api/worldcup/history/list", json={})
        self.assertEqual(pending_response.status_code, 200)
        pending_records = pending_response.json()["records"]
        self.assertGreaterEqual(len(pending_records), 1)
        self.assertEqual(pending_records[0]["recommendations"][0]["result_status"], "pending")
        self.assertEqual(pending_response.json()["summary"]["settled_count"], 0)
        self.assertIsNone(pending_response.json()["summary"]["accuracy"])

        with db_connection.get_connection() as connection:
            with connection.cursor() as cursor:
                cursor.execute("UPDATE worldcup_match SET match_status = 'finished', score = '1:0' WHERE match_id = ?", ("test-worldcup-match",))

        settled_response = self.client.post("/api/worldcup/history/list", json={"status_filter": "finished"})
        self.assertEqual(settled_response.status_code, 200)
        settled_records = settled_response.json()["records"]
        self.assertGreaterEqual(len(settled_records), 1)
        result_statuses = {
            item["result_status"]
            for record in settled_records
            for item in record["recommendations"]
        }
        self.assertTrue(result_statuses.intersection({"settled", "unknown"}))
        payload = settled_response.json()
        self.assertEqual(payload["summary"]["total_count"], 2)
        self.assertEqual(payload["summary"]["settled_count"], 2)
        self.assertEqual(payload["summary"]["hit_count"], 2)
        self.assertEqual(payload["summary"]["accuracy"], 1.0)
        play_groups = {group["play_type"]: group for group in payload["play_type_groups"]}
        self.assertIn("win_draw_win", play_groups)
        self.assertIn("total_goals", play_groups)
        self.assertEqual(play_groups["win_draw_win"]["models"][0]["model_code"], "worldcup-model-a")

    def test_worldcup_prediction_generate_accepts_match_date(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})
        with patch("backend.app.api.routes.worldcup_prediction_task_service.create_task") as create_task:
            create_task.return_value = {
                "lottery_code": "worldcup",
                "task_id": "worldcup-task-1",
                "status": "queued",
                "mode": "current",
                "model_code": "worldcup-model",
                "created_at": 0,
                "started_at": None,
                "finished_at": None,
                "progress_summary": {
                    "lottery_code": "worldcup",
                    "mode": "current",
                    "model_code": "worldcup-model",
                    "match_date": "2026-06-16",
                    "match_ids": ["test-worldcup-match"],
                    "processed_count": 0,
                    "skipped_count": 0,
                    "failed_count": 0,
                    "failed_periods": [],
                },
                "error_message": None,
            }

            response = self.client.post(
                "/api/settings/worldcup/predictions/generate",
                json={
                    "model_code": "worldcup-model",
                    "play_type": "all",
                    "overwrite": False,
                    "match_date": "2026-06-16",
                    "match_ids": ["test-worldcup-match"],
                },
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["progress_summary"]["match_date"], "2026-06-16")
        create_task.assert_called_once_with(
            model_code="worldcup-model",
            model_codes=[],
            play_type="all",
            overwrite=False,
            match_date="2026-06-16",
            match_ids=["test-worldcup-match"],
            parallelism=1,
        )

    def test_prediction_task_detail_reads_worldcup_prediction_task(self) -> None:
        self.client.post("/api/auth/login", json={"identifier": "admin", "password": "admin123456"})
        task_payload = {
            "lottery_code": "worldcup",
            "task_id": "worldcup-task-1",
            "status": "running",
            "mode": "current",
            "model_code": "worldcup-model",
            "created_at": 0,
            "started_at": 1,
            "finished_at": None,
            "progress_summary": {
                "lottery_code": "worldcup",
                "mode": "current",
                "model_code": "worldcup-model",
                "match_date": "2026-06-16",
                "processed_count": 0,
                "skipped_count": 0,
                "failed_count": 0,
                "failed_periods": [],
            },
            "error_message": None,
        }
        with patch("backend.app.api.routes.prediction_generation_task_service.get_task", return_value=None), patch(
            "backend.app.api.routes.worldcup_prediction_task_service.get_task",
            return_value=task_payload,
        ):
            response = self.client.post("/api/settings/models/predictions/task-detail", json={"task_id": "worldcup-task-1"})

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["lottery_code"], "worldcup")
        self.assertEqual(response.json()["progress_summary"]["match_date"], "2026-06-16")


if __name__ == "__main__":
    unittest.main()
