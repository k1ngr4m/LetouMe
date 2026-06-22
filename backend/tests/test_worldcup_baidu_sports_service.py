from __future__ import annotations

import unittest

from backend.app.services.worldcup_baidu_sports_service import BAIDU_ODDS_NOTE, WorldCupBaiduSportsService


class WorldCupBaiduSportsServiceTests(unittest.TestCase):
    def test_headers_do_not_depend_on_browser_cookie(self) -> None:
        headers = WorldCupBaiduSportsService._headers("https://tiyu.baidu.com/al/match")

        self.assertNotIn("Cookie", headers)
        self.assertEqual(headers["Accept"], "application/json,text/plain,*/*")

    def test_parse_schedule_matches_maps_baidu_fields(self) -> None:
        service = WorldCupBaiduSportsService()
        payload = {
            "status": 0,
            "data": [
                {
                    "time": "2026-06-17",
                    "weekday": "明天",
                    "list": [
                        {
                            "id": "31d7e1d2c6c3cca174c61d79c201623d",
                            "matchId": "encoded-match-id",
                            "oriKey": "世界杯#2026-06-16#法国vs塞内加尔",
                            "startTime": "2026-06-17 03:00:00",
                            "status": "0",
                            "matchStatusText": "未开赛",
                            "matchStage": "小组赛I组第1轮",
                            "game": "世界杯",
                            "link": "/al/live/detail?matchId=encoded-match-id&tab=分析",
                            "leftLogo": {"name": "法国", "score": "-"},
                            "rightLogo": {"name": "塞内加尔", "score": "-"},
                            "scoreInfo": {"leftRegularScore": "0", "rightRegularScore": "0"},
                        }
                    ],
                }
            ],
        }

        rows = service.parse_schedule_matches(payload, fetched_at="2026-06-16 11:00:00")

        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["match_id"], "baidu-31d7e1d2c6c3cca174c61d79c201623d")
        self.assertEqual(rows[0]["home_team"], "法国")
        self.assertEqual(rows[0]["away_team"], "塞内加尔")
        self.assertEqual(rows[0]["match_status"], "scheduled")
        self.assertIsNone(rows[0]["score"])
        self.assertEqual(rows[0]["data_sources"]["sources"], ["baidu_tiyu"])
        self.assertEqual(rows[0]["data_sources"]["baidu_tiyu"]["encoded_match_id"], "encoded-match-id")

    def test_parse_match_context_extracts_analysis_lineup_and_index(self) -> None:
        service = WorldCupBaiduSportsService()
        analysis_payload = {
            "tplData": {
                "data": {
                    "tabsList": [
                        {
                            "data": {
                                "result": {
                                    "num": "12504",
                                    "resultfont": "赛前预测",
                                    "percentage": {"victory": "10%", "draw": "15%", "lost": "75%"},
                                    "team": [{"team": "伊拉克", "winrate": "11%"}, {"team": "挪威", "winrate": "74%"}],
                                },
                                "igence": [
                                    {
                                        "intelligencetitle": "有利情报",
                                        "intelligence": {
                                            "intelligenceTeamInfo": {"name": "伊拉克"},
                                            "intelligenceteam": [{"content": "伊拉克6场比赛4胜0平，状态出色。"}],
                                            "intelligenceteamLeaterInfo": {"name": "挪威"},
                                            "intelligenceteamleater": [{"content": "挪威近10场正赛7胜2平1负。"}],
                                        },
                                    },
                                    {
                                        "intelligencetitle": "不利情报",
                                        "intelligence": {
                                            "intelligenceTeamInfo": {"name": "伊拉克"},
                                            "intelligenceteam": [{"content": "伊拉克客场小球偏多。"}],
                                            "intelligenceteamLeaterInfo": {"name": "挪威"},
                                            "intelligenceteamleater": [{"content": "本场比赛挪威队无不利情报"}],
                                        },
                                    },
                                ],
                                "homeRecord": [
                                    {
                                        "history": {
                                            "team_name": "伊拉克",
                                            "title": "伊拉克近期战绩",
                                            "result": "2胜3负1平",
                                            "probability": [{"title": "胜率 33%"}],
                                            "list": [
                                                {
                                                    "date": "2026-06-10",
                                                    "match": "国际友谊",
                                                    "left": {"name": "伊拉克", "score": "0"},
                                                    "right": {"name": "委内瑞拉", "score": "2"},
                                                    "oddsHandicap": {"value": "-0.5", "desc": "输盘"},
                                                    "oddsTotalGoals": {"value": "2.25", "desc": "小球"},
                                                }
                                            ],
                                        }
                                    }
                                ],
                            }
                        }
                    ]
                }
            }
        }
        lineup_payload = {
            "tplData": {
                "data": {
                    "tabsList": [
                        {
                            "data": {
                                "confirmed": True,
                                "court": "波士顿体育场",
                                "referee": "皮埃尔·吉斯兰·阿乔",
                                "update_time": "1781581223",
                                "home": {"name": "伊拉克", "playerList": [{"playerId": "p1", "name": "阿里·贾西姆", "position": "前锋 17号", "age": "22"}]},
                                "away": {"name": "挪威", "playerList": [{"playerId": "p2", "name": "埃尔林·哈兰德", "position": "前锋 9号", "age": "25"}]},
                            }
                        }
                    ]
                }
            }
        }
        index_payload = {
            "tplData": {
                "data": {
                    "tabsList": [
                        {
                            "data": {
                                "tabs": ["欧赔"],
                                "list": [
                                    {
                                        "type": "欧赔",
                                        "datas": [
                                            {
                                                "initial": [{"name": "主胜", "value": "6.19"}],
                                                "now": [{"name": "主胜", "value": "15.58"}],
                                            }
                                        ],
                                    }
                                ],
                            }
                        }
                    ]
                }
            }
        }

        context = service.parse_match_context(analysis_payload=analysis_payload, lineup_payload=lineup_payload, index_payload=index_payload)

        self.assertEqual(context["status"], "available")
        self.assertEqual(context["pre_match_prediction"]["sample_count"], "12504")
        self.assertEqual(context["positive_intelligence"][0]["items"][0], "伊拉克6场比赛4胜0平，状态出色。")
        self.assertEqual(context["negative_intelligence"][1]["items"][0], "本场比赛挪威队无不利情报")
        self.assertEqual(context["recent_records"][0]["result"], "2胜3负1平")
        self.assertEqual(context["squad_status"]["status"], "阵容名单已获取，首发待确认")
        self.assertEqual(context["squad_status"]["home"]["players"][0]["name"], "阿里·贾西姆")
        self.assertEqual(context["index_reference"]["note"], BAIDU_ODDS_NOTE)

    def test_parse_half_time_score_from_scoring_incidents(self) -> None:
        payload = {
            "code": "0",
            "data": {
                "graphic_incidents": {
                    "incidents": [
                        {"goaltype": "结束", "passedTime": "90'", "text": "结束 4-0"},
                        {"goaltype": "乌龙球", "passedTime": "49'", "left": {"direction": "left", "teamName": "西班牙"}},
                        {"goaltype": "进球", "passedTime": "24'", "left": {"direction": "left", "teamName": "西班牙"}},
                        {"goaltype": "进球", "passedTime": "21'", "left": {"direction": "left", "teamName": "西班牙"}},
                        {"goaltype": "进球", "passedTime": "10'", "left": {"direction": "left", "teamName": "西班牙"}},
                    ]
                }
            },
        }

        self.assertEqual(WorldCupBaiduSportsService.parse_half_time_score(payload), "3:0")

    def test_parse_half_time_score_counts_first_half_stoppage_time_only(self) -> None:
        payload = {
            "data": {
                "graphic_incidents": {
                    "incidents": [
                        {"goaltype": "进球", "passedTime": "45+2'", "right": {"direction": "right", "teamName": "沙特阿拉伯"}},
                        {"goaltype": "进球", "passedTime": "49'", "left": {"direction": "left", "teamName": "西班牙"}},
                    ]
                }
            }
        }

        self.assertEqual(WorldCupBaiduSportsService.parse_half_time_score(payload), "0:1")

    def test_parse_half_time_score_returns_none_without_incidents(self) -> None:
        self.assertIsNone(WorldCupBaiduSportsService.parse_half_time_score({"data": {"graphic_incidents": {"incidents": []}}}))
        self.assertIsNone(WorldCupBaiduSportsService.parse_half_time_score({"data": {}}))

    def test_find_encoded_match_id_matches_schedule_by_date_and_teams(self) -> None:
        service = WorldCupBaiduSportsService()
        service.fetch_schedule_matches = lambda start_date=None: [  # type: ignore[method-assign]
            {
                "home_team": "法国",
                "away_team": "塞内加尔",
                "kickoff_at": "2026-06-17 03:00:00",
                "data_sources": {"baidu_tiyu": {"encoded_match_id": "encoded-france-senegal"}},
            }
        ]

        encoded = service.find_encoded_match_id(home_team="法国", away_team="塞内加尔", kickoff_at="2026-06-17 03:00:00")

        self.assertEqual(encoded, "encoded-france-senegal")


if __name__ == "__main__":
    unittest.main()
