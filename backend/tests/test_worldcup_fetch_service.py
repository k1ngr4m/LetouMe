from __future__ import annotations

import unittest

from backend.app.services.worldcup_fetch_service import WorldCupFetchService


class WorldCupFetchServiceTests(unittest.TestCase):
    def test_parse_sporttery_worldcup_matches_and_odds(self) -> None:
        service = WorldCupFetchService()
        payload = {
            "value": {
                "lastUpdateTime": "2026-06-15 11:00:00",
                "matchInfoList": [
                    {
                        "subMatchList": [
                            {
                                "matchId": 2040174,
                                "matchNum": 1013,
                                "matchNumStr": "周一013",
                                "matchNumDate": "260615",
                                "taxDateNo": "260615",
                                "leagueAllName": "世界杯",
                                "homeTeamAllName": "西班牙",
                                "awayTeamAllName": "佛得角",
                                "matchDate": "2026-06-16",
                                "matchTime": "00:00",
                                "matchStatus": "Selling",
                                "businessDate": "2026-06-15",
                                "poolList": [
                                    {"poolCode": "HHAD", "poolStatus": "Selling", "cbtSingle": 1},
                                    {"poolCode": "CRS", "poolStatus": "Selling", "cbtSingle": 1},
                                ],
                                "hhad": {"h": "1.61", "d": "4.40", "a": "3.56", "goalLine": "-2.00"},
                                "crs": {
                                    "s10": "6.00",
                                    "s90": "25.00",
                                    "s00s01": "80.00",
                                    "s1sa": "800.0",
                                    "s00s01f": "1",
                                    "s00s02": "0",
                                },
                            }
                        ]
                    }
                ],
            }
        }

        matches = service._parse_matches(payload)
        odds = service._parse_odds(payload)

        self.assertEqual(matches[0]["match_id"], "sporttery-2040174")
        self.assertEqual(matches[0]["home_team"], "西班牙")
        self.assertEqual(matches[0]["match_status"], "scheduled")
        self.assertEqual(odds[0]["play_type"], "handicap_win_draw_win")
        self.assertEqual(odds[0]["odds"]["胜"], "1.61")
        self.assertEqual(odds[0]["goal_line"], "-2.00")
        self.assertEqual(odds[1]["play_type"], "correct_score")
        self.assertEqual(odds[1]["odds"]["1:0"], "6.00")
        self.assertEqual(odds[1]["odds"]["胜其它"], "25.00")
        self.assertEqual(odds[1]["odds"]["0:1"], "80.00")
        self.assertEqual(odds[1]["odds"]["负其它"], "800.0")
        self.assertNotIn("s00s01f", odds[1]["odds"])
        self.assertNotIn("0:2", odds[1]["odds"])

    def test_merge_baidu_matches_keeps_sporttery_id_and_adds_baidu_only_schedule(self) -> None:
        service = WorldCupFetchService()
        sporttery_matches = [
            {
                "match_id": "sporttery-2040174",
                "sporttery_match_id": "2040174",
                "home_team": "西班牙",
                "away_team": "佛得角",
                "kickoff_at": "2026-06-16 00:00:00",
                "match_status": "scheduled",
                "score": None,
                "data_sources": ["sporttery"],
                "source_updated_at": "2026-06-15 11:00:00",
            }
        ]
        baidu_matches = [
            {
                "match_id": "baidu-a",
                "home_team": "西班牙",
                "away_team": "佛得角",
                "kickoff_at": "2026-06-16 00:00:00",
                "match_status": "scheduled",
                "score": None,
                "data_sources": {"sources": ["baidu_tiyu"], "baidu_tiyu": {"encoded_match_id": "encoded-a"}},
                "source_updated_at": "2026-06-16 11:00:00",
            },
            {
                "match_id": "baidu-b",
                "home_team": "法国",
                "away_team": "塞内加尔",
                "kickoff_at": "2026-06-17 03:00:00",
                "match_status": "scheduled",
                "score": None,
                "data_sources": {"sources": ["baidu_tiyu"], "baidu_tiyu": {"encoded_match_id": "encoded-b"}},
                "source_updated_at": "2026-06-16 11:00:00",
            },
        ]

        merged = service._merge_baidu_matches(sporttery_matches, baidu_matches)

        self.assertEqual(len(merged), 2)
        self.assertEqual(merged[0]["match_id"], "sporttery-2040174")
        self.assertEqual(merged[0]["data_sources"]["sources"], ["sporttery", "baidu_tiyu"])
        self.assertEqual(merged[0]["data_sources"]["baidu_tiyu"]["encoded_match_id"], "encoded-a")
        self.assertEqual(merged[1]["match_id"], "baidu-b")


if __name__ == "__main__":
    unittest.main()
