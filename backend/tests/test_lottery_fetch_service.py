from __future__ import annotations

import unittest
from datetime import date
from unittest.mock import Mock

from bs4 import BeautifulSoup

from backend.app.lotteries import build_pl5_prize_breakdown, build_qxc_prize_breakdown
from backend.app.services.lottery_service import LotteryService
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

    def test_parse_lskj_dlt_data_without_detail_requests(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26051</td><td>2026-05-11</td><td>13 18 28 32 33 02 11</td><td>3.56亿</td><td>7.99亿</td><td>2.75亿</td><td>4</td><td>9,612,284</td><td>135</td><td>137,851</td><td>1232</td><td>6,666</td><td>开奖信息</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26051")
        self.assertEqual(data[0]["red_balls"], ["13", "18", "28", "32", "33"])
        self.assertEqual(data[0]["blue_balls"], ["02", "11"])
        self.assertEqual(data[0]["sales_amount"], 356000000)
        self.assertEqual(data[0]["jackpot_pool_balance"], 799000000)
        self.assertEqual(data[0]["prize_total_amount"], 275000000)
        self.assertEqual(data[0]["prize_breakdown"][0]["prize_level"], "一等奖")
        self.assertEqual(data[0]["prize_breakdown"][0]["winner_count"], 4)
        self.assertEqual(data[0]["prize_breakdown"][0]["prize_amount"], 9612284)

    def test_parse_lskj_dlt_datachart_row(self) -> None:
        html = """
        <table>
          <tbody id="tdata">
            <tr><td>26056</td><td>06</td><td>07</td><td>18</td><td>21</td><td>30</td><td>01</td><td>05</td><td>767,589,410</td><td>6</td><td>7,155,614</td><td>151</td><td>114,339</td><td>368,991,091</td><td>2026-05-23</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26056")
        self.assertEqual(data[0]["red_balls"], ["06", "07", "18", "21", "30"])
        self.assertEqual(data[0]["blue_balls"], ["01", "05"])
        self.assertEqual(data[0]["date"], "2026-05-23")
        self.assertEqual(data[0]["jackpot_pool_balance"], 767589410)
        self.assertEqual(data[0]["sales_amount"], 368991091)
        self.assertEqual([item["prize_level"] for item in data[0]["prize_breakdown"]], ["一等奖", "二等奖"])
        self.assertEqual(data[0]["prize_breakdown"][0]["winner_count"], 6)
        self.assertEqual(data[0]["prize_breakdown"][0]["prize_amount"], 7155614)

    def test_parse_lskj_digit_lottery_data(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26053</td><td>2026-05-12</td><td>4 3 3 2 1 8 12</td><td>1693.60万</td><td>2.88亿</td><td>851.66万</td><td>1</td><td>5,000,000</td><td>7</td><td>75,904</td><td>20</td><td>3,000</td><td>开奖信息</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26053")
        self.assertEqual(data[0]["digits"], ["04", "03", "03", "02", "01", "08", "12"])
        self.assertEqual(data[0]["sales_amount"], 16936000)
        self.assertEqual(data[0]["jackpot_pool_balance"], 288000000)
        self.assertEqual(data[0]["prize_total_amount"], 8516600)
        self.assertEqual(data[0]["prize_breakdown"][1]["prize_amount"], 75904)

    def test_parse_lskj_qxc_datachart_row(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26058</td><td>3 7 4 1 2 3 1</td><td>21</td><td>17054062</td><td>2026-05-24</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26058")
        self.assertEqual(data[0]["digits"], ["03", "07", "04", "01", "02", "03", "01"])
        self.assertEqual(data[0]["sales_amount"], 17054062)
        self.assertEqual(data[0]["date"], "2026-05-24")

    def test_parse_lskj_pl3_data_saves_main_prize_levels(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26124</td><td>2026-05-14</td><td>07 08 05</td><td>-</td><td>-</td><td>-</td><td>12</td><td>1,040</td><td>5</td><td>346</td><td>8</td><td>173</td><td>开奖信息</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl3"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26124")
        self.assertEqual(data[0]["digits"], ["07", "08", "05"])
        self.assertEqual([item["prize_level"] for item in data[0]["prize_breakdown"]], ["直选", "组选3", "组选6"])
        self.assertEqual(data[0]["prize_breakdown"][0]["winner_count"], 12)
        self.assertEqual(data[0]["prize_breakdown"][0]["prize_amount"], 1040)
        self.assertEqual(data[0]["prize_breakdown"][1]["prize_amount"], 346)
        self.assertEqual(data[0]["prize_breakdown"][2]["prize_amount"], 173)

    def test_parse_lskj_pl3_datachart_row(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26134</td><td>5 1 5</td><td>11</td><td>38,656,728</td><td>10859</td><td>1,040</td><td>16063</td><td>346</td><td>&nbsp;</td><td>&nbsp;</td><td>2026-05-24</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl3"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26134")
        self.assertEqual(data[0]["digits"], ["05", "01", "05"])
        self.assertEqual(data[0]["date"], "2026-05-24")
        self.assertEqual(data[0]["sales_amount"], 38656728)
        self.assertEqual(data[0]["prize_breakdown"][0]["winner_count"], 10859)
        self.assertEqual(data[0]["prize_breakdown"][1]["winner_count"], 16063)

    def test_parse_lskj_pl5_data_saves_direct_prize_level(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26124</td><td>2026-05-14</td><td>07 08 05 03 02</td><td>-</td><td>7572.68万</td><td>-</td><td>6</td><td>100,000</td><td>开奖信息</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26124")
        self.assertEqual(data[0]["digits"], ["07", "08", "05", "03", "02"])
        self.assertEqual(data[0]["jackpot_pool_balance"], 75726800)
        self.assertEqual([item["prize_level"] for item in data[0]["prize_breakdown"]], ["直选"])
        self.assertEqual(data[0]["prize_breakdown"][0]["winner_count"], 6)
        self.assertEqual(data[0]["prize_breakdown"][0]["prize_amount"], 100000)

    def test_parse_lskj_pl5_datachart_row(self) -> None:
        html = """
        <table>
          <tbody>
            <tr><td>26134</td><td>5 1 5 3 3</td><td>17</td><td>21,711,392</td><td>2026-05-24</td></tr>
          </tbody>
        </table>
        """
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        soup = BeautifulSoup(html, "html.parser")

        data = service.parse_lskj_data(soup)

        self.assertEqual(len(data), 1)
        self.assertEqual(data[0]["period"], "26134")
        self.assertEqual(data[0]["digits"], ["05", "01", "05", "03", "03"])
        self.assertEqual(data[0]["sales_amount"], 21711392)
        self.assertEqual(data[0]["date"], "2026-05-24")
        self.assertEqual(data[0]["prize_breakdown"], build_pl5_prize_breakdown())

    def test_parse_sporttery_dlt_draw_extracts_numbers_and_prizes(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        row = {
            "lotteryDrawNum": "26056",
            "lotteryDrawResult": "06 07 18 21 30 01 05",
            "lotteryDrawTime": "2026-05-23",
            "totalSaleAmount": "368,991,091",
            "poolBalanceAfterdraw": "767,589,409.76",
            "prizeLevelList": [
                {
                    "prizeLevel": "一等奖",
                    "stakeCount": "6",
                    "stakeAmountFormat": "7155614",
                    "totalPrizeamount": "42,933,684",
                },
                {
                    "prizeLevel": "一等奖(追加)",
                    "stakeCount": "2",
                    "stakeAmountFormat": "5724491",
                    "totalPrizeamount": "11,448,982",
                },
            ],
        }

        data = service.parse_sporttery_draw(row)

        self.assertIsNotNone(data)
        assert data is not None
        self.assertEqual(data["period"], "26056")
        self.assertEqual(data["red_balls"], ["06", "07", "18", "21", "30"])
        self.assertEqual(data["blue_balls"], ["01", "05"])
        self.assertEqual(data["date"], "2026-05-23")
        self.assertEqual(data["sales_amount"], 368991091)
        self.assertEqual(data["jackpot_pool_balance"], 767589409)
        self.assertEqual(data["prize_total_amount"], 54382666)
        self.assertEqual(data["prize_breakdown"][1]["prize_level"], "一等奖")
        self.assertEqual(data["prize_breakdown"][1]["prize_type"], "additional")

    def test_parse_sporttery_digit_draw_uses_default_prizes_when_missing(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        row = {
            "lotteryDrawNum": "26134",
            "lotteryDrawResult": "5 1 5 3 3",
            "lotteryDrawTime": "2026-05-24 20:30:00",
            "totalSaleAmount": "21,711,392",
            "poolBalanceAfterdraw": "",
            "prizeLevelList": [],
        }

        data = service.parse_sporttery_draw(row)

        self.assertIsNotNone(data)
        assert data is not None
        self.assertEqual(data["period"], "26134")
        self.assertEqual(data["digits"], ["05", "01", "05", "03", "03"])
        self.assertEqual(data["date"], "2026-05-24")
        self.assertEqual(data["sales_amount"], 21711392)
        self.assertEqual(data["prize_breakdown"], build_pl5_prize_breakdown())

    def test_fetch_lskj_and_save_uses_sporttery_history_with_limit(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        service.fetch_history_with_fallback = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []},
            ]
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": "1"}]
        service.message_service = Mock()
        service.message_service.generate_messages_for_periods.return_value = 0
        service.message_service.generate_messages_for_recent_draws.return_value = 0

        result = service.fetch_lskj_and_save(limit=1)

        service.fetch_history_with_fallback.assert_called_once_with(limit=1)
        self.assertEqual(result["fetched_count"], 1)
        self.assertEqual(service.lottery_service.save_draws.call_args.args[0][0]["period"], "1")

    def test_fetch_history_with_fallback_uses_500_when_sporttery_empty(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "pl5"
        service.logger = Mock()
        service.fetch_sporttery_history = Mock(return_value=[])
        service.fetch_fallback_history = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []},
            ]
        )

        data = service.fetch_history_with_fallback(limit=1)

        service.fetch_sporttery_history.assert_called_once_with(limit=1)
        service.fetch_fallback_history.assert_called_once_with(limit=1, start=None, end=None)
        self.assertEqual(data[0]["period"], "1")

    def test_fetch_draw_detail_falls_back_to_500_when_sporttery_missing(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.fetch_sporttery_draw_by_period = Mock(return_value=None)
        service.fetch_fallback_draw_detail = Mock(
            return_value={
                "draw_date": "2026-04-08",
                "jackpot_pool_balance": 757000000,
                "prize_breakdown": [
                    {"prize_level": "六等奖", "prize_type": "basic", "winner_count": 1, "prize_amount": 15, "total_amount": 15},
                ],
            }
        )

        detail = service.fetch_draw_detail("26037")

        service.fetch_fallback_draw_detail.assert_called_once_with("26037")
        self.assertEqual(detail["jackpot_pool_balance"], 757000000)

    def test_fetch_qxc_draw_by_period_falls_back_to_500_detail(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.fetch_sporttery_draw_by_period = Mock(return_value=None)
        service.fetch_fallback_draw_detail = Mock(
            return_value={
                "digits": ["9", "9", "6", "9", "4", "0", "1"],
                "draw_date": "2026-04-05",
                "jackpot_pool_balance": 289159709,
                "prize_breakdown": build_qxc_prize_breakdown(),
            }
        )

        draw = service.fetch_qxc_draw_by_period("26037")

        self.assertIsNotNone(draw)
        assert draw is not None
        self.assertEqual(draw["period"], "26037")
        self.assertEqual(draw["digits"], ["09", "09", "06", "09", "04", "00", "01"])

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

        soup = service.fetch_page("https://example.test/history.html", retry=1)

        self.assertIsNotNone(soup)
        self.assertEqual(response.encoding, "gb2312")

    def test_fetch_page_sets_qxc_encoding_from_apparent_encoding(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        response = Mock(status_code=200, text="<html></html>", apparent_encoding="gb2312")
        service.session = Mock()
        service.session.get.return_value = response

        soup = service.fetch_page("https://example.test/qxc.html", retry=1)

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
        service.logger = Mock()
        service.fetch_history_with_fallback = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []},
                {"period": "2", "digits": ["02", "03", "04", "05", "06"], "date": "2026-03-02", "prize_breakdown": []},
                {"period": "3", "digits": ["03", "04", "05", "06", "07"], "date": "2026-03-03", "prize_breakdown": []},
            ]
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": "1"}, {"period": "2"}]

        result = service.fetch_and_save(limit=2)

        service.fetch_history_with_fallback.assert_called_once_with(limit=2, start=None, end=None)
        save_call_args = service.lottery_service.save_draws.call_args
        self.assertEqual(len(save_call_args.args[0]), 2)
        self.assertEqual(result["fetched_count"], 2)
        self.assertEqual(result["saved_count"], 2)

    def test_fetch_and_save_qxc_backfills_to_requested_limit(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "qxc"
        service.logger = Mock()
        service.fetch_history_with_fallback = Mock(
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
        service.logger = Mock()
        service.fetch_history_with_fallback = Mock(
            return_value=[
                {"period": "1", "digits": ["01", "02", "03", "04", "05"], "date": "2026-03-01", "prize_breakdown": []}
            ]
        )
        service.lottery_service = Mock()
        service.lottery_service.save_draws.return_value = [{"period": "1"}]

        service.fetch_and_save()

        service.fetch_history_with_fallback.assert_called_once_with(limit=30, start=None, end=None)

    def test_backfill_draw_detail_overwrites_existing_draw_with_latest_detail(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.logger = Mock()
        service.lottery_service = Mock()
        service.lottery_service.get_draw_by_period.return_value = {
            "period": "26037",
            "date": "2026-04-08",
            "red_balls": ["07", "12", "13", "28", "32"],
            "blue_balls": ["06", "08"],
            "digits": [],
            "jackpot_pool_balance": 744000000,
            "prize_breakdown": [{"prize_level": "六等奖", "prize_type": "basic", "winner_count": 0, "prize_amount": 0, "total_amount": 0}],
        }
        service.fetch_draw_detail = Mock(
            return_value={
                "draw_date": "2026-04-08",
                "jackpot_pool_balance": 757000000,
                "prize_breakdown": [
                    {"prize_level": "六等奖", "prize_type": "basic", "winner_count": 791056, "prize_amount": 15, "total_amount": 11865840},
                    {"prize_level": "七等奖", "prize_type": "basic", "winner_count": 8080274, "prize_amount": 5, "total_amount": 40401370},
                ],
            }
        )
        service.lottery_service.save_draws.return_value = [
            {
                "period": "26037",
                "date": "2026-04-08",
                "jackpot_pool_balance": 757000000,
                "prize_breakdown": [
                    {"prize_level": "六等奖", "prize_type": "basic", "winner_count": 791056, "prize_amount": 15, "total_amount": 11865840},
                    {"prize_level": "七等奖", "prize_type": "basic", "winner_count": 8080274, "prize_amount": 5, "total_amount": 40401370},
                ],
            }
        ]

        result = service.backfill_draw_detail("26037")

        save_call_args = service.lottery_service.save_draws.call_args
        self.assertEqual(save_call_args.kwargs["lottery_code"], "dlt")
        self.assertEqual(save_call_args.args[0][0]["period"], "26037")
        self.assertEqual(save_call_args.args[0][0]["jackpot_pool_balance"], 757000000)
        self.assertEqual(save_call_args.args[0][0]["prize_breakdown"][0]["prize_amount"], 15)
        self.assertEqual(result["prize_breakdown_count"], 2)

    def test_backfill_draw_detail_requires_existing_draw(self) -> None:
        service = LotteryFetchService.__new__(LotteryFetchService)
        service.lottery_code = "dlt"
        service.logger = Mock()
        service.lottery_service = Mock()
        service.lottery_service.get_draw_by_period.return_value = None

        with self.assertRaisesRegex(ValueError, "基础开奖记录"):
            service.backfill_draw_detail("26037")

    def test_is_prize_breakdown_ready_marks_dlt_all_zero_prizes_as_incomplete(self) -> None:
        self.assertFalse(
            LotteryService.is_prize_breakdown_ready(
                {
                    "lottery_code": "dlt",
                    "prize_breakdown": [
                        {"prize_level": "六等奖", "prize_type": "basic", "prize_amount": 0},
                        {"prize_level": "七等奖", "prize_type": "basic", "prize_amount": 0},
                    ],
                },
                "dlt",
            )
        )

    def test_is_prize_breakdown_ready_accepts_dlt_non_zero_basic_prize(self) -> None:
        self.assertTrue(
            LotteryService.is_prize_breakdown_ready(
                {
                    "lottery_code": "dlt",
                    "prize_breakdown": [
                        {"prize_level": "六等奖", "prize_type": "basic", "prize_amount": 15},
                        {"prize_level": "七等奖", "prize_type": "basic", "prize_amount": 5},
                    ],
                },
                "dlt",
            )
        )

    def test_is_prize_breakdown_ready_marks_qxc_zero_floating_prizes_as_incomplete(self) -> None:
        self.assertFalse(
            LotteryService.is_prize_breakdown_ready(
                {
                    "lottery_code": "qxc",
                    "prize_breakdown": [
                        {"prize_level": "一等奖", "prize_type": "basic", "prize_amount": 0},
                        {"prize_level": "二等奖", "prize_type": "basic", "prize_amount": 24089},
                        {"prize_level": "三等奖", "prize_type": "basic", "prize_amount": 3000},
                    ],
                },
                "qxc",
            )
        )

    def test_is_prize_breakdown_ready_accepts_qxc_non_zero_floating_prizes(self) -> None:
        self.assertTrue(
            LotteryService.is_prize_breakdown_ready(
                {
                    "lottery_code": "qxc",
                    "prize_breakdown": [
                        {"prize_level": "一等奖", "prize_type": "basic", "prize_amount": 5000000},
                        {"prize_level": "二等奖", "prize_type": "basic", "prize_amount": 24089},
                        {"prize_level": "三等奖", "prize_type": "basic", "prize_amount": 3000},
                    ],
                },
                "qxc",
            )
        )

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
