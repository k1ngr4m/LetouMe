from __future__ import annotations

import unittest

from backend.app.lotteries import get_lottery_definition


class LotteryDefinitionsTests(unittest.TestCase):
    def test_qxc_next_draw_follows_tue_fri_sun_schedule(self) -> None:
        definition = get_lottery_definition("qxc")

        next_draw = definition.predict_next_draw("26037", "2026-04-05")

        self.assertIsNotNone(next_draw)
        self.assertEqual(next_draw["next_period"], "26038")
        self.assertEqual(next_draw["next_date"], "2026-04-07")
        self.assertEqual(next_draw["weekday"], "周二")
        self.assertEqual(next_draw["draw_time"], "21:25")


if __name__ == "__main__":
    unittest.main()
