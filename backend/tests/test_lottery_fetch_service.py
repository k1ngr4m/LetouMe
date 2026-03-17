from __future__ import annotations

import unittest

from bs4 import BeautifulSoup

from backend.app.services.lottery_fetch_service import LotteryFetchService


class LotteryFetchServiceTests(unittest.TestCase):
    def test_parse_prize_breakdown_extracts_basic_and_additional_rows(self) -> None:
        html = """
        <table>
          <thead>
            <tr><th colspan="2">奖项</th><th>中奖注数</th><th>每注奖金(元)</th><th>应派奖金合计(元)</th></tr>
          </thead>
          <tbody>
            <tr><td rowspan="2">一等奖</td><td>基本</td><td>12</td><td>7,654,708</td><td>91,856,496</td></tr>
            <tr><td>追加</td><td>0</td><td>0</td><td>0</td></tr>
            <tr><td>三等奖</td><td>基本</td><td>381</td><td>10,000</td><td>3,810,000</td></tr>
            <tr><td colspan="2">合计</td><td>---</td><td>---</td><td>1.90亿</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        soup = BeautifulSoup(html, "html.parser")

        breakdown = service.parse_prize_breakdown(soup)

        self.assertEqual(breakdown[0]["prize_level"], "一等奖")
        self.assertEqual(breakdown[0]["prize_type"], "basic")
        self.assertEqual(breakdown[0]["prize_amount"], 7654708)
        self.assertEqual(breakdown[1]["prize_type"], "additional")
        self.assertEqual(breakdown[2]["prize_level"], "三等奖")
        self.assertEqual(breakdown[2]["total_amount"], 3810000)

    def test_parse_money_value_supports_wan_and_yi(self) -> None:
        self.assertEqual(LotteryFetchService.parse_money_value("1.90亿"), 190000000)
        self.assertEqual(LotteryFetchService.parse_money_value("7,654,708"), 7654708)
        self.assertEqual(LotteryFetchService.parse_money_value("3.5万"), 35000)


if __name__ == "__main__":
    unittest.main()
