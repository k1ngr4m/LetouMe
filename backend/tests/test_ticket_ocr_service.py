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
