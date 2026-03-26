from __future__ import annotations

from datetime import date, datetime
import unittest

from backend.app.repositories.prediction_repository import PredictionRepository


class PredictionRepositoryTests(unittest.TestCase):
    def test_serialize_prediction_date_handles_date_like_values(self) -> None:
        repository = PredictionRepository()

        self.assertEqual(repository._serialize_prediction_date(date(2026, 3, 26)), "2026-03-26")
        self.assertEqual(
            repository._serialize_prediction_date(datetime(2026, 3, 26, 14, 16, 55)),
            "2026-03-26",
        )
        self.assertEqual(repository._serialize_prediction_date("2026-03-26"), "2026-03-26")
        self.assertEqual(repository._serialize_prediction_date(None), "")


if __name__ == "__main__":
    unittest.main()
