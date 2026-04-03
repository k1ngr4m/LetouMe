from __future__ import annotations

import unittest
from unittest.mock import Mock

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
        self.assertEqual(LotteryFetchService.parse_money_value("8.34 亿"), 834000000)
        self.assertEqual(LotteryFetchService.parse_money_value("7,654,708"), 7654708)
        self.assertEqual(LotteryFetchService.parse_money_value("3.5万"), 35000)
        self.assertEqual(LotteryFetchService.parse_money_value("12,345,678元"), 12345678)

    def test_parse_jackpot_pool_balance_extracts_amount(self) -> None:
        html = """
        <div class="kj_tablelist02">
          <p>奖池滚存 8.34 亿</p>
        </div>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        soup = BeautifulSoup(html, "html.parser")

        jackpot_pool = service.parse_jackpot_pool_balance(soup)

        self.assertEqual(jackpot_pool, 834000000)

    def test_parse_pl5_data_from_datachart_table(self) -> None:
        html = """
        <div>奖池滚存 1.23 亿</div>
        <table>
          <tbody id="tdata">
            <tr><td>26071</td><td>5 5 1 5 3</td><td>2026-03-22</td></tr>
            <tr><td>26070</td><td>0 1 2 3 4</td><td>2026-03-21</td></tr>
            <tr><td>invalid</td><td>1 2 3 4 5</td><td>2026-03-20</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_pl5_data(soup)

        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["period"], "26071")
        self.assertEqual(data[0]["digits"], ["05", "05", "01", "05", "03"])
        self.assertEqual(data[0]["date"], "2026-03-22")
        self.assertEqual(data[0]["jackpot_pool_balance"], 123000000)
        self.assertEqual(data[1]["digits"], ["00", "01", "02", "03", "04"])
        self.assertEqual(data[1]["jackpot_pool_balance"], 123000000)

    def test_parse_pl3_data_contains_jackpot_pool_balance(self) -> None:
        html = """
        <div>奖池滚存 0.56 亿</div>
        <table>
          <tbody>
            <tr><td>26071</td><td>2026-03-22</td><td><span class="ball">1</span><span class="ball">2</span><span class="ball">3</span></td></tr>
            <tr><td>26070</td><td>2026-03-21</td><td><span class="ball">0</span><span class="ball">4</span><span class="ball">5</span></td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl3"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_pl3_data(soup)

        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["period"], "26071")
        self.assertEqual(data[0]["digits"], ["01", "02", "03"])
        self.assertEqual(data[0]["jackpot_pool_balance"], 56000000)
        self.assertEqual(data[1]["digits"], ["00", "04", "05"])
        self.assertEqual(data[1]["jackpot_pool_balance"], 56000000)

    def test_fetch_page_sets_pl5_encoding_from_apparent_encoding(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        response = Mock(status_code=200, text="<html></html>", apparent_encoding="gb2312")
        service.session = Mock()
        service.session.get.return_value = response

        soup = service.fetch_page("https://datachart.500.com/plw/history/inc/history.php", retry=1)

        self.assertIsNotNone(soup)
        self.assertEqual(response.encoding, "gb2312")

    def test_fetch_and_save_applies_limit(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.base_url = "https://example.com"
        service.logger = Mock()
        service.fetch_page = Mock(return_value=BeautifulSoup("<html></html>", "html.parser"))
        service.parse_lottery_data = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []},
                {"period": "2", "digits": ["02", "03", "04", "05", "06"], "date": "2026-03-02", "prize_breakdown": []},
                {"period": "3", "digits": ["03", "04", "05", "06", "07"], "date": "2026-03-03", "prize_breakdown": []},
            ]
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": "1"}, {"period": "2"}]

        result = service.fetch_and_save(limit=2)

        fetch_page_call_args = service.fetch_page.call_args
        self.assertEqual(fetch_page_call_args.args[0], "https://example.com?limit=2")
        save_call_args = service.lottery_service.save_draws.call_args
        self.assertEqual(len(save_call_args.args[0]), 2)
        self.assertEqual(result["fetched_count"], 2)
        self.assertEqual(result["saved_count"], 2)

    def test_fetch_and_save_uses_default_limit_30(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.base_url = "https://example.com"
        service.logger = Mock()
        service.fetch_page = Mock(return_value=BeautifulSoup("<html></html>", "html.parser"))
        service.parse_lottery_data = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []}
            ]
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": "1"}]

        service.fetch_and_save()

        fetch_page_call_args = service.fetch_page.call_args
        self.assertEqual(fetch_page_call_args.args[0], "https://example.com?limit=30")

    def test_parse_lottery_data_for_dlt_contains_jackpot_pool_balance(self) -> None:
        html = """
        <table>
          <tbody>
            <tr>
              <td>25001</td>
              <td>01</td><td>02</td><td>03</td><td>04</td><td>05</td>
              <td>06</td><td>07</td>
              <td>2026-01-01</td>
            </tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.logger = Mock()
        service.fetch_draw_detail = Mock(
            return_value={
                "prize_breakdown": [{"prize_level": "三等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 10000, "total_amount": 10000}],
                "jackpot_pool_balance": 1880000000,
            }
        )
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lottery_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "25001")
        self.assertEqual(data[0]["jackpot_pool_balance"], 1880000000)


if __name__ == "__main__":
    unittest.main()
