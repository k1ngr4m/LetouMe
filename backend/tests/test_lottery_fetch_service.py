from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import Mock

from bs4 import BeautifulSoup

from backend.app.lotteries import build_qxc_prize_breakdown
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

    def test_parse_pl3_data_prefers_row_jackpot_column(self) -> None:
        html = """
        <table>
          <tbody>
            <tr>
              <td>26082</td>
              <td>2026-04-02</td>
              <td><span class="ball">0</span><span class="ball">4</span><span class="ball">8</span></td>
              <td>5139.19万</td>
              <td>1761.05万</td>
            </tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl3"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_pl3_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["jackpot_pool_balance"], 17610500)

    def test_parse_qxc_data_from_overview_block(self) -> None:
        html = """
        <div class="qxc_info">
          <h3>七星彩 第26037期</h3>
          <p>开奖日期：2026-04-05</p>
          <div class="numballs">
            <b>9</b><b>9</b><b>6</b><b>9</b><b>4</b><b>0</b><b>1</b>
          </div>
          <p>奖池累计金额：289,159,709元</p>
        </div>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        service.fetch_draw_detail = Mock(
            return_value={
                "jackpot_pool_balance": 289159709,
                "prize_breakdown": [{"prize_level": "三等奖", "prize_type": "basic", "winner_count": 23, "prize_amount": 3000, "total_amount": 69000}],
            }
        )
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_qxc_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26037")
        self.assertEqual(data[0]["digits"], ["09", "09", "06", "09", "04", "00", "01"])
        self.assertEqual(data[0]["jackpot_pool_balance"], 289159709)

    def test_parse_pl5_data_falls_back_to_detail_jackpot(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26082</td><td>0 4 8 3 8</td><td>23</td><td>25,007,612</td><td>2026-04-02</td></tr>
            <tr><td>26081</td><td>6 9 0 1 6</td><td>22</td><td>24,609,218</td><td>2026-04-01</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        service.fetch_draw_detail = Mock(side_effect=[{"jackpot_pool_balance": 25461180}, {"jackpot_pool_balance": 25000200}])
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_pl5_data(soup)

        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["jackpot_pool_balance"], 25461180)
        self.assertEqual(data[1]["jackpot_pool_balance"], 25000200)
        self.assertEqual(service.fetch_draw_detail.call_count, 2)

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

    def test_fetch_page_sets_qxc_encoding_from_apparent_encoding(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        response = Mock(status_code=200, text="<html></html>", apparent_encoding="gb2312")
        service.session = Mock()
        service.session.get.return_value = response

        soup = service.fetch_page("https://www.500.com/lottery/qxc/", retry=1)

        self.assertIsNotNone(soup)
        self.assertEqual(response.encoding, "gb2312")

    def test_parse_qxc_data_from_zj_table_rows(self) -> None:
        html = """
        <table class="zj_table">
          <thead><tr><th>时间</th><th>期号</th><th>开奖号码</th></tr></thead>
          <tbody>
            <tr><td>21:25:00</td><td><span>26037</span></td><td><em class="red">9,9,6,9,4,0,1</em></td></tr>
            <tr><td>21:25:00</td><td><span>26033</span></td><td><em class="red">1,8,9,1,9,3,14</em></td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        service.fetch_draw_detail = Mock(
            side_effect=[
                {"jackpot_pool_balance": 289159709, "prize_breakdown": build_qxc_prize_breakdown(), "draw_date": "2026-04-05"},
                {"jackpot_pool_balance": 275120000, "prize_breakdown": build_qxc_prize_breakdown(), "draw_date": "2026-03-31"},
            ]
        )
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_qxc_data(soup)

        self.assertEqual(len(data), 2)
        self.assertEqual(data[0]["period"], "26037")
        self.assertEqual(data[0]["digits"], ["09", "09", "06", "09", "04", "00", "01"])
        self.assertEqual(data[0]["date"], "2026-04-05")
        self.assertEqual(data[1]["period"], "26033")
        self.assertEqual(data[1]["digits"], ["01", "08", "09", "01", "09", "03", "14"])
        self.assertEqual(data[1]["date"], "2026-03-31")

    def test_parse_qxc_prize_breakdown_supports_td_header_table(self) -> None:
        html = """
        <table class="kj_tablelist02">
          <tr><td colspan="3">开奖详情</td></tr>
          <tr><td>奖项</td><td>中奖注数</td><td>单注奖金（元）</td></tr>
          <tr><td>一等奖</td><td>2</td><td>5,000,000</td></tr>
          <tr><td>二等奖</td><td>3</td><td>129,823</td></tr>
          <tr><td>三等奖</td><td>23</td><td>3,000</td></tr>
          <tr><td>四等奖</td><td>829</td><td>500</td></tr>
          <tr><td>五等奖</td><td>16283</td><td>30</td></tr>
          <tr><td>六等奖</td><td>739232</td><td>5</td></tr>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        soup = BeautifulSoup(html, "html.parser")

        breakdown = service.parse_qxc_prize_breakdown(soup)
        prize_map = {item["prize_level"]: item for item in breakdown}

        self.assertEqual(prize_map["一等奖"]["winner_count"], 2)
        self.assertEqual(prize_map["一等奖"]["prize_amount"], 5000000)
        self.assertEqual(prize_map["二等奖"]["winner_count"], 3)
        self.assertEqual(prize_map["二等奖"]["prize_amount"], 129823)
        self.assertEqual(prize_map["六等奖"]["winner_count"], 739232)
        self.assertEqual(prize_map["六等奖"]["prize_amount"], 5)

    def test_parse_qxc_digits_from_keyword_text(self) -> None:
        html = """
        <div>
          <p>七星彩 第26028期 开奖号码：09 01 08 06 03 04 14</p>
        </div>
        """
        soup = BeautifulSoup(html, "html.parser")

        digits = LotteryFetchService.parse_qxc_digits(soup)

        self.assertEqual(digits, ["09", "01", "08", "06", "03", "04", "14"])

    def test_parse_draw_date_supports_cn_date_format(self) -> None:
        html = """
        <div>
          <p>7星彩 第 26037 期 开奖日期：2026年4月5日</p>
        </div>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        soup = BeautifulSoup(html, "html.parser")

        draw_date = service.parse_draw_date(soup)

        self.assertEqual(draw_date, "2026-04-05")

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

    def test_fetch_and_save_qxc_backfills_to_requested_limit(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.base_url = "https://example.com"
        service.logger = Mock()
        service.fetch_page = Mock(return_value=BeautifulSoup("<html></html>", "html.parser"))
        service.parse_lottery_data = Mock(
            return_value=[
                {"period": str(26038 - index), "digits": ["01", "02", "03", "04", "05", "06", "07"], "date": "2026-04-08", "prize_breakdown": []}
                for index in range(10)
            ]
        )
        service.fetch_qxc_draw_by_period = Mock(
            side_effect=lambda period: {
                "period": period,
                "digits": ["01", "02", "03", "04", "05", "06", "07"],
                "date": "2026-03-01",
                "jackpot_pool_balance": 0,
                "prize_breakdown": [],
            }
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": str(26038 - index)} for index in range(30)]
        service.message_service = Mock()
        service.message_service.generate_messages_for_periods.return_value = 0
        service.message_service.generate_messages_for_recent_draws.return_value = 0

        result = service.fetch_and_save(limit=30)

        self.assertEqual(result["fetched_count"], 30)
        self.assertEqual(result["saved_count"], 30)
        self.assertEqual(service.fetch_qxc_draw_by_period.call_count, 20)

    def test_resolve_previous_qxc_period_rolls_year_by_draw_count_not_999(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"

        previous_period, previous_draw_date = service._resolve_previous_qxc_period("26001", date(2026, 1, 2))

        self.assertEqual(previous_period, "25156")
        self.assertEqual(previous_draw_date, date(2025, 12, 30))

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
