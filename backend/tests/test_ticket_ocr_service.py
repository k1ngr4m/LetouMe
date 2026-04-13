from __future__ import annotations

import unittest
from types import SimpleNamespace
from unittest.mock import patch

import requests

from backend.app.services.my_bet_service import MyBetService
from backend.app.services.ticket_ocr_service import TicketOCRService


class TicketOCRServiceTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = TicketOCRService(
            settings=SimpleNamespace(
                baidu_ocr_api_key="demo",
                baidu_ocr_secret_key="demo",
                baidu_ocr_token_url="https://example.com/token",
                baidu_ocr_url="https://example.com/ocr",
                imgloc_api_key="demo",
                imgloc_api_url="https://example.com/upload",
            )
        )

    def test_extract_imgloc_url_supports_common_shapes(self) -> None:
        self.assertEqual(self.service._extract_imgloc_url({"url": "https://img/a.jpg"}), "https://img/a.jpg")
        self.assertEqual(self.service._extract_imgloc_url({"data": {"display_url": "https://img/b.jpg"}}), "https://img/b.jpg")
        self.assertEqual(self.service._extract_imgloc_url({"data": {"image": {"url": "https://img/c.jpg"}}}), "https://img/c.jpg")
        self.assertEqual(self.service._extract_imgloc_url({"image": {"url": "https://img/d.jpg"}}), "https://img/d.jpg")
        self.assertEqual(self.service._extract_imgloc_url({"image": "https://img/e.jpg"}), "https://img/e.jpg")

    def test_parse_pl3_lines_extracts_direct_and_group(self) -> None:
        lines = self.service._parse_pl3_lines(
            text_lines=[
                "排列3 直选 123 5倍",
                "组选3 188 2倍",
            ]
        )

        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["play_type"], "direct")
        self.assertEqual(lines[0]["direct_hundreds"], ["01"])
        self.assertEqual(lines[0]["multiplier"], 5)
        self.assertEqual(lines[1]["play_type"], "group3")
        self.assertEqual(lines[1]["group_numbers"], ["01", "08"])
        self.assertEqual(lines[1]["multiplier"], 2)

    def test_parse_pl3_lines_supports_group_single_multiline_ticket(self) -> None:
        lines = self.service._parse_pl3_lines(
            text_lines=[
                "体彩",
                "排列3",
                "组选单式票",
                "1倍",
                "①",
                "3",
                "6",
                "8",
                "②",
                "3",
                "6",
                "9",
                "③",
                "1",
                "3",
                "7",
                "④",
                "0",
                "2",
                "6",
            ]
        )

        self.assertEqual(len(lines), 4)
        self.assertTrue(all(line["play_type"] == "group6" for line in lines))
        self.assertEqual(lines[0]["group_numbers"], ["03", "06", "08"])
        self.assertEqual(lines[3]["group_numbers"], ["00", "02", "06"])

    def test_parse_pl3_lines_supports_recovered_direct_compound_from_group_ticket(self) -> None:
        lines = self.service._parse_pl3_lines(
            text_lines=[
                "体彩",
                "排列3",
                "组选单式票",
                "1倍",
                "①46",
                "7",
                "②267",
            ]
        )

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["play_type"], "direct")
        self.assertEqual(lines[0]["direct_hundreds"], ["04", "06"])
        self.assertEqual(lines[0]["direct_tens"], ["07"])
        self.assertEqual(lines[0]["direct_units"], ["02", "06", "07"])
        self.assertEqual(lines[0]["bet_count"], 6)

    def test_parse_pl3_lines_supports_direct_single_multiline_ticket(self) -> None:
        lines = self.service._parse_pl3_lines(
            text_lines=[
                "直选单式票",
                "1倍",
                "①",
                "3",
                "1",
                "7",
                "②",
                "3",
                "8",
                "2",
                "⑨",
                "5",
                "0",
                "8",
                "⑩160",
            ]
        )

        self.assertEqual(len(lines), 4)
        self.assertTrue(all(line["play_type"] == "direct" for line in lines))
        self.assertEqual(lines[0]["direct_hundreds"], ["03"])
        self.assertEqual(lines[0]["direct_tens"], ["01"])
        self.assertEqual(lines[0]["direct_units"], ["07"])
        self.assertEqual(lines[-1]["direct_hundreds"], ["01"])
        self.assertEqual(lines[-1]["direct_tens"], ["06"])
        self.assertEqual(lines[-1]["direct_units"], ["00"])

    def test_parse_pl3_lines_ignores_trailing_noise_after_direct_token(self) -> None:
        lines = self.service._parse_pl3_lines(
            text_lines=[
                "直选单式票",
                "2倍",
                "④702",
                "20",
                "⑤580",
            ]
        )

        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["direct_hundreds"], ["07"])
        self.assertEqual(lines[0]["direct_tens"], ["00"])
        self.assertEqual(lines[0]["direct_units"], ["02"])
        self.assertEqual(lines[0]["multiplier"], 2)
        self.assertEqual(lines[1]["direct_hundreds"], ["05"])
        self.assertEqual(lines[1]["direct_tens"], ["08"])
        self.assertEqual(lines[1]["direct_units"], ["00"])

    def test_parse_dlt_lines_extracts_append_and_multiplier(self) -> None:
        lines = self.service._parse_dlt_lines(text_lines=["大乐透 01 02 03 04 05 + 06 07 追加 3倍"])

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["play_type"], "dlt")
        self.assertEqual(lines[0]["front_numbers"], ["01", "02", "03", "04", "05"])
        self.assertEqual(lines[0]["back_numbers"], ["06", "07"])
        self.assertTrue(lines[0]["is_append"])
        self.assertEqual(lines[0]["multiplier"], 3)

    def test_parse_dlt_lines_extracts_compact_front_back_across_lines(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "前区050609101126",
                "后区010506",
                "1倍",
            ]
        )

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["front_numbers"], ["05", "06", "09", "10", "11", "26"])
        self.assertEqual(lines[0]["back_numbers"], ["01", "05", "06"])
        self.assertEqual(lines[0]["multiplier"], 1)
        self.assertEqual(lines[0]["bet_count"], 18)
        self.assertEqual(lines[0]["amount"], 36)

    def test_parse_dlt_lines_supports_suite_ticket_mode(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "体彩",
                "超级大乐透幸运",
                "第26033期",
                "套餐票",
                "1倍",
                "合计58元",
                "①1415263235+0307",
                "②0210131822+1011",
                "③1315162731+0512",
                "④0310161721+0609",
                "⑤0813152529+0106",
                "⑥0211152023+0112",
                "⑦0126282933+0209",
                "⑧0615162234+0210",
                "前区03050822262934",
                "后区",
                "01",
                "05",
            ]
        )

        self.assertEqual(len(lines), 9)
        for line in lines[:8]:
            self.assertEqual(line["play_type"], "dlt")
            self.assertEqual(len(line["front_numbers"]), 5)
            self.assertEqual(len(line["back_numbers"]), 2)
            self.assertEqual(line["multiplier"], 1)
            self.assertEqual(line["bet_count"], 1)
            self.assertEqual(line["amount"], 2)
        self.assertEqual(lines[-1]["front_numbers"], ["03", "05", "08", "22", "26", "29", "34"])
        self.assertEqual(lines[-1]["back_numbers"], ["01", "05"])
        self.assertEqual(lines[-1]["bet_count"], 21)
        self.assertEqual(lines[-1]["amount"], 42)

    def test_parse_dlt_lines_supports_suite_ticket_number_prefix_variants(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "1)1415263235+0307",
                "2.0210131822+1011",
            ]
        )

        self.assertEqual(len(lines), 2)
        self.assertEqual(lines[0]["front_numbers"], ["14", "15", "26", "32", "35"])
        self.assertEqual(lines[0]["back_numbers"], ["03", "07"])
        self.assertEqual(lines[1]["front_numbers"], ["02", "10", "13", "18", "22"])
        self.assertEqual(lines[1]["back_numbers"], ["10", "11"])

    def test_parse_dlt_lines_supports_compact_dantuo_ticket(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "体彩",
                "超级大乐透",
                "第26032期",
                "中国体育彩票",
                "2026年03月28日开奖",
                "910330-245161-115329-500142516935 5r23ew",
                "胆拖票",
                "1倍",
                "合计40元",
                "前区胆0715",
                "☆",
                "前区拖0923282933",
                "后区胆04",
                "后区拖0511",
                "中国体育彩票",
                "感谢您为公益事业贡献14.40元",
            ]
        )

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["play_type"], "dlt_dantuo")
        self.assertEqual(lines[0]["front_dan"], ["07", "15"])
        self.assertEqual(lines[0]["front_tuo"], ["09", "23", "28", "29", "33"])
        self.assertEqual(lines[0]["back_dan"], ["04"])
        self.assertEqual(lines[0]["back_tuo"], ["05", "11"])
        self.assertEqual(lines[0]["multiplier"], 1)
        self.assertEqual(lines[0]["bet_count"], 20)
        self.assertEqual(lines[0]["amount"], 40)

    def test_parse_dlt_lines_ignores_invalid_odd_length_compact_dantuo(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "前区胆071",
                "前区拖0923282933",
                "后区胆04",
                "后区拖0511",
            ]
        )

        self.assertEqual(lines, [])

    def test_parse_dlt_lines_supports_compound_ticket_sample_1(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "-2",
                "体彩",
                "超级大乐透",
                "第26029期",
                "2026年03月21日开奖",
                "六中国体育彩票",
                "910330-243161-115284-363099748182 d46xPg",
                "复式票",
                "1倍",
                "合计36元",
                "前区071019202629",
                "后区010609",
            ]
        )

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["play_type"], "dlt")
        self.assertEqual(lines[0]["front_numbers"], ["07", "10", "19", "20", "26", "29"])
        self.assertEqual(lines[0]["back_numbers"], ["01", "06", "09"])
        self.assertEqual(lines[0]["bet_count"], 18)
        self.assertEqual(lines[0]["amount"], 36)

    def test_parse_dlt_lines_supports_suite_and_multiline_blocks_sample_2(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "R",
                "T",
                "Y",
                "U",
                "1",
                "F",
                "G",
                "H",
                "J",
                "K",
                "C",
                "V",
                "B",
                "N",
                "M",
                "体彩",
                "超级大乐透幸运",
                "套餐",
                "第26030期",
                "2026年03月23日开奖",
                "982332-603230-000929-918020",
                "350964",
                "wExaMQ",
                "套餐票",
                "1倍",
                "合计88元",
                "①0228293035+0210",
                "②0103132933+0204",
                "③1421252629+1011",
                "④0104172126+0307",
                "⑤0709162829+0810",
                "前区",
                "01020811162224",
                "后区",
                "0212",
                "前区",
                "010225282932",
                "后区",
                "030407",
                "公益体彩",
                "乐善人生",
            ]
        )

        self.assertEqual(len(lines), 7)
        self.assertEqual(lines[5]["front_numbers"], ["01", "02", "08", "11", "16", "22", "24"])
        self.assertEqual(lines[5]["back_numbers"], ["02", "12"])
        self.assertEqual(lines[5]["bet_count"], 21)
        self.assertEqual(lines[5]["amount"], 42)
        self.assertEqual(lines[6]["front_numbers"], ["01", "02", "25", "28", "29", "32"])
        self.assertEqual(lines[6]["back_numbers"], ["03", "04", "07"])
        self.assertEqual(lines[6]["bet_count"], 18)
        self.assertEqual(lines[6]["amount"], 36)

    def test_parse_dlt_lines_supports_compound_ticket_sample_3(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "体彩",
                "超级大乐透",
                "第26030期",
                "2026年03月23日开奖",
                "910330-243961-115307-459120159222 TMTAyg",
                "复式票",
                "1倍",
                "合计36元",
                "前区050910152329",
                "后区040509",
            ]
        )

        self.assertEqual(len(lines), 1)
        self.assertEqual(lines[0]["front_numbers"], ["05", "09", "10", "15", "23", "29"])
        self.assertEqual(lines[0]["back_numbers"], ["04", "05", "09"])
        self.assertEqual(lines[0]["bet_count"], 18)
        self.assertEqual(lines[0]["amount"], 36)

    def test_parse_dlt_lines_supports_suite_and_multiple_blocks_sample_4(self) -> None:
        lines = self.service._parse_dlt_lines(
            text_lines=[
                "体彩",
                "超级大乐透幸运",
                "套",
                "26001",
                "2026年03月25日开奖",
                "体彩票",
                "982332-603250-000828-443857360365 RxLsg",
                "套餐察",
                "1倍",
                "合计88元",
                "①1011182125+0506",
                "②0405081720+0609",
                "③0616173435+0204",
                "④0406192631+0710",
                "⑤0203263233+0308",
                "中国体育彩票",
                "前区05101522262934",
                "后区0305",
                "前区",
                "011214161825",
                "后区020410",
                "公益体彩",
            ]
        )

        self.assertEqual(len(lines), 7)
        self.assertEqual(lines[5]["front_numbers"], ["05", "10", "15", "22", "26", "29", "34"])
        self.assertEqual(lines[5]["back_numbers"], ["03", "05"])
        self.assertEqual(lines[5]["bet_count"], 21)
        self.assertEqual(lines[5]["amount"], 42)
        self.assertEqual(lines[6]["front_numbers"], ["01", "12", "14", "16", "18", "25"])
        self.assertEqual(lines[6]["back_numbers"], ["02", "04", "10"])
        self.assertEqual(lines[6]["bet_count"], 18)
        self.assertEqual(lines[6]["amount"], 36)

    def test_extract_ticket_purchased_at_supports_compact_yy_datetime(self) -> None:
        purchased_at = self.service._extract_ticket_purchased_at(ocr_text="01-408168-1010000226/03/1314:04:47")
        self.assertEqual(purchased_at, 1773381887)

    def test_extract_ticket_purchased_at_returns_none_when_missing(self) -> None:
        purchased_at = self.service._extract_ticket_purchased_at(ocr_text="2026年03月14日开奖")
        self.assertIsNone(purchased_at)

    def test_parse_qxc_lines_supports_multiline_single_ticket_blocks(self) -> None:
        lines = self.service._parse_qxc_lines(
            text_lines=[
                "体彩",
                "7星彩",
                "Seven Stars",
                "第26040期",
                "2026年04月12日开奖",
                "单式票",
                "1倍",
                "合计10元",
                "①",
                "1",
                "5",
                "4",
                "2",
                "6",
                "0",
                "8",
                "②",
                "0",
                "9",
                "6",
                "9",
                "6",
                "2",
                "13",
                "③",
                "9",
                "7",
                "7",
                "5",
                "2",
                "5",
                "10",
                "④",
                "1",
                "4",
                "3",
                "2",
                "8",
                "7",
                "8",
                "⑤",
                "0",
                "8",
                "6",
                "6",
                "3",
                "2",
                "6",
            ]
        )

        self.assertEqual(len(lines), 5)
        self.assertEqual(lines[0]["play_type"], "qxc_compound")
        self.assertEqual(lines[0]["position_selections"], [["01"], ["05"], ["04"], ["02"], ["06"], ["00"], ["08"]])
        self.assertEqual(lines[1]["position_selections"], [["00"], ["09"], ["06"], ["09"], ["06"], ["02"], ["13"]])
        self.assertEqual(lines[2]["position_selections"], [["09"], ["07"], ["07"], ["05"], ["02"], ["05"], ["10"]])
        self.assertEqual(lines[3]["position_selections"], [["01"], ["04"], ["03"], ["02"], ["08"], ["07"], ["08"]])
        self.assertEqual(lines[4]["position_selections"], [["00"], ["08"], ["06"], ["06"], ["03"], ["02"], ["06"]])
        self.assertTrue(all(line["multiplier"] == 1 for line in lines))

    def test_parse_ticket_text_supports_qxc_ocr_sample(self) -> None:
        parsed = self.service._parse_ticket_text(
            ocr_text=(
                "体彩\n7星彩\nSeven Stars\n第26040期\n2026年04月12日开奖\n六中国体育彩票\n"
                "110330-250061-124192-825120023892\nMRzsxQ\n单式票\n1倍\n合计10元\n①\n1\n5\n4\n2\n6\n0\n8\n"
                "②\n0\n9\n6\n9\n6\n2\n13\n③\n9\n7\n7\n5\n2\n5\n10\n④\n1\n4\n3\n2\n8\n7\n8\n⑤\n0\n8\n6\n6\n3\n2\n6\n"
                "中国体育彩票\n感谢您为公益事业贡献3.70元\n仓兴街658号\n01-008725-101\n00105\n26/04/1219:55:19\n中国体育彩票"
            ),
            lottery_code="qxc",
        )

        self.assertEqual(parsed["target_period"], "26040")
        self.assertEqual(parsed["ticket_purchased_at"], 1775994919)
        self.assertEqual(len(parsed["lines"]), 5)
        self.assertTrue(all(line["play_type"] == "qxc_compound" for line in parsed["lines"]))

    def test_resolve_baidu_ocr_url_prefers_high_accuracy_endpoint(self) -> None:
        self.assertEqual(
            self.service._resolve_baidu_ocr_url(),
            TicketOCRService.BAIDU_HIGH_ACCURACY_OCR_URL,
        )

        standard_service = TicketOCRService(
            settings=SimpleNamespace(
                baidu_ocr_api_key="demo",
                baidu_ocr_secret_key="demo",
                baidu_ocr_token_url="https://example.com/token",
                baidu_ocr_url="https://aip.baidubce.com/rest/2.0/ocr/v1/general_basic",
                imgloc_api_key="demo",
                imgloc_api_url="https://example.com/upload",
            )
        )
        self.assertEqual(
            standard_service._resolve_baidu_ocr_url(),
            TicketOCRService.BAIDU_HIGH_ACCURACY_OCR_URL,
        )

    @patch("backend.app.services.ticket_ocr_service.requests.post")
    def test_upload_to_imgloc_returns_http_status_detail(self, mocked_post) -> None:
        mocked_post.return_value = SimpleNamespace(
            status_code=400,
            text='{"error":"bad request"}',
            headers={"content-type": "application/json"},
            content=b'{"error":"bad request"}',
        )
        with self.assertRaises(ValueError) as context:
            self.service._upload_to_imgloc(image_bytes=b"demo", filename="demo.jpg", lottery_code="pl3")
        self.assertIn("HTTP 400", str(context.exception))

    @patch("backend.app.services.ticket_ocr_service.requests.post")
    def test_upload_to_imgloc_returns_content_blocked_detail(self, mocked_post) -> None:
        mocked_post.return_value = SimpleNamespace(
            status_code=400,
            text='{"status_code":400,"error":{"message":"Suspected inappropriate content","code":403},"status_txt":"Bad Request"}',
            headers={"content-type": "application/json; charset=UTF-8"},
            content=b'{"status_code":400,"error":{"message":"Suspected inappropriate content","code":403},"status_txt":"Bad Request"}',
            json=lambda: {
                "status_code": 400,
                "error": {"message": "Suspected inappropriate content", "code": 403},
                "status_txt": "Bad Request",
            },
        )
        with self.assertRaises(ValueError) as context:
            self.service._upload_to_imgloc(image_bytes=b"demo", filename="demo.jpg", lottery_code="dlt")
        self.assertEqual(str(context.exception), "图片被图床风控拦截，请更换清晰票面；可先保存投注不上传图片")

    @patch("backend.app.services.ticket_ocr_service.requests.post")
    def test_upload_to_imgloc_returns_parse_failure_detail(self, mocked_post) -> None:
        mocked_post.return_value = SimpleNamespace(
            status_code=200,
            text="not-json",
            headers={"content-type": "text/plain"},
            content=b"not-json",
            json=lambda: (_ for _ in ()).throw(ValueError("invalid json")),
        )
        with self.assertRaises(ValueError) as context:
            self.service._upload_to_imgloc(image_bytes=b"demo", filename="demo.jpg", lottery_code="dlt")
        self.assertEqual(str(context.exception), "上传图床失败（响应解析失败）")

    @patch("backend.app.services.ticket_ocr_service.requests.post")
    def test_upload_to_imgloc_returns_missing_url_detail(self, mocked_post) -> None:
        mocked_post.return_value = SimpleNamespace(
            status_code=200,
            text='{"ok":true}',
            headers={"content-type": "application/json"},
            content=b'{"ok":true}',
            json=lambda: {"ok": True},
        )
        with self.assertRaises(ValueError) as context:
            self.service._upload_to_imgloc(image_bytes=b"demo", filename="demo.jpg", lottery_code="dlt")
        self.assertEqual(str(context.exception), "上传图床失败（未返回图片URL）")
        _, kwargs = mocked_post.call_args
        self.assertIn("files", kwargs)
        self.assertIn("source", kwargs["files"])

    @patch("backend.app.services.ticket_ocr_service.requests.post")
    def test_upload_to_imgloc_returns_network_error_detail(self, mocked_post) -> None:
        mocked_post.side_effect = requests.RequestException("timeout")
        with self.assertRaises(ValueError) as context:
            self.service._upload_to_imgloc(image_bytes=b"demo", filename="demo.jpg", lottery_code="dlt")
        self.assertEqual(str(context.exception), "上传图床失败（网络请求异常）")


class MyBetMultiLinePayloadTests(unittest.TestCase):
    def setUp(self) -> None:
        self.service = MyBetService()

    def test_build_payload_supports_multi_lines(self) -> None:
        payload = self.service._build_payload(
            {
                "lottery_code": "pl3",
                "target_period": "26070",
                "source_type": "ocr",
                "lines": [
                    {"play_type": "direct", "direct_hundreds": ["1"], "direct_tens": ["2"], "direct_units": ["3"], "multiplier": 1},
                    {"play_type": "group3", "group_numbers": ["1", "8"], "multiplier": 2},
                ],
            },
            lottery_code="pl3",
        )

        self.assertEqual(payload["play_type"], "mixed")
        self.assertEqual(payload["bet_count"], 3)
        self.assertEqual(payload["amount"], 10)
        self.assertEqual(len(payload["lines"]), 2)

    def test_recognize_ticket_image_falls_back_to_editable_empty_line(self) -> None:
        fake_ocr_service = SimpleNamespace(
            recognize=lambda **_: {
                "lottery_code": "dlt",
                "ticket_image_url": "https://img.test/a.jpg",
                "ocr_text": "无法结构化",
                "ocr_provider": "baidu",
                "ocr_recognized_at": "2026-03-20T15:00:00Z",
                "target_period": "",
                "lines": [],
                "warnings": ["未稳定识别到期号，请手动补录"],
            }
        )
        service = MyBetService(ticket_ocr_service=fake_ocr_service)
        draft = service.recognize_ticket_image(lottery_code="dlt", image_bytes=b"img", filename="x.jpg")

        self.assertEqual(len(draft["lines"]), 1)
        self.assertEqual(draft["lines"][0]["bet_count"], 0)
        self.assertIn("未稳定识别到期号，请手动补录", draft["warnings"])


if __name__ == "__main__":
    unittest.main()
