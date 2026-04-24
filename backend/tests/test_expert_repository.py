from __future__ import annotations

import unittest
from datetime import datetime

from backend.app.repositories.expert_repository import ExpertRepository


class ExpertRepositoryTests(unittest.TestCase):
    def test_serialize_expert_row_treats_database_datetime_as_beijing_time(self) -> None:
        repository = ExpertRepository()

        payload = repository._serialize_expert_row(
            {
                "id": 1,
                "expert_code": "wei-rong-jie",
                "display_name": "魏荣杰",
                "bio": "",
                "model_code": "deepseek-v3.2",
                "lottery_code": "dlt",
                "history_window_count": 50,
                "is_active": 1,
                "is_deleted": 0,
                "config_json": "{}",
                "updated_at": datetime(2026, 2, 2, 10, 40, 0),
                "created_at": "2026-02-02 10:40:00",
            }
        )

        self.assertEqual(payload["updated_at"], 1_770_000_000)
        self.assertEqual(payload["created_at"], 1_770_000_000)


if __name__ == "__main__":
    unittest.main()
