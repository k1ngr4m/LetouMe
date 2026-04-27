from __future__ import annotations

import unittest
from datetime import datetime, timezone

from backend.app.time_utils import ensure_timestamp


class TimeUtilsTests(unittest.TestCase):
    def test_ensure_timestamp_parses_compact_datetime_before_epoch_detection(self) -> None:
        timestamp = ensure_timestamp("20260427002500", assume_beijing=True)

        self.assertEqual(timestamp, int(datetime(2026, 4, 26, 16, 25, tzinfo=timezone.utc).timestamp()))

    def test_ensure_timestamp_parses_integer_compact_datetime_before_epoch_detection(self) -> None:
        timestamp = ensure_timestamp(20260427002500, assume_beijing=True)

        self.assertEqual(timestamp, int(datetime(2026, 4, 26, 16, 25, tzinfo=timezone.utc).timestamp()))

    def test_ensure_timestamp_keeps_epoch_milliseconds_support(self) -> None:
        self.assertEqual(ensure_timestamp(1_770_000_000_000), 1_770_000_000)


if __name__ == "__main__":
    unittest.main()
