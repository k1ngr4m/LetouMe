from __future__ import annotations

import base64
import json
import re
from datetime import datetime
from math import comb
from time import perf_counter
from typing import Any
from urllib.parse import urlparse
from zoneinfo import ZoneInfo

import requests

from backend.app.cache import runtime_cache
from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code
from backend.app.time_utils import ensure_timestamp, now_ts

BEIJING_TIMEZONE = ZoneInfo("Asia/Shanghai")


class TicketOCRService:
    BAIDU_HIGH_ACCURACY_OCR_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()
        self.logger = get_logger("services.ticket_ocr")

    def recognize(self, *, lottery_code: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        self._validate_baidu_settings()
        ocr_text = self._recognize_text_by_baidu(image_bytes=image_bytes)
        parsed = self._parse_ticket_text(ocr_text=ocr_text, lottery_code=normalized_code)
        lines = parsed.get("lines", [])
        warnings = list(parsed.get("warnings", []))
        if not lines:
            warnings.append("未识别到可用投注号码，请手动补录")
        self.logger.info(
            "Ticket OCR parse completed",
            extra={
                "context": {
                    "lottery_code": normalized_code,
                    "line_count": len(lines),
                    "warning_count": len(warnings),
                    "target_period": parsed.get("target_period", ""),
                }
            },
        )
        return {
            "lottery_code": normalized_code,
            "ticket_image_url": "",
            "ocr_text": ocr_text,
            "ocr_provider": "baidu",
            "ocr_recognized_at": parsed.get("recognized_at"),
            "ticket_purchased_at": parsed.get("ticket_purchased_at"),
            "target_period": parsed.get("target_period", ""),
            "lines": lines,
            "warnings": warnings,
        }

    def upload_image(self, *, lottery_code: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        self._validate_imgloc_settings()
        image_url = self._upload_to_imgloc(image_bytes=image_bytes, filename=filename, lottery_code=normalized_code)
        return {"lottery_code": normalized_code, "ticket_image_url": image_url}

    def upload_profile_avatar(self, *, image_bytes: bytes, filename: str) -> str:
        self._validate_imgloc_settings()
        return self._upload_to_imgloc(image_bytes=image_bytes, filename=filename, lottery_code="profile")

    def _validate_baidu_settings(self) -> None:
        if not self.settings.baidu_ocr_api_key or not self.settings.baidu_ocr_secret_key:
            raise ValueError("未配置百度 OCR 密钥")

    def _validate_imgloc_settings(self) -> None:
        if not self.settings.imgloc_api_key:
            raise ValueError("未配置 imgloc 图床密钥")

    def _upload_to_imgloc(self, *, image_bytes: bytes, filename: str, lottery_code: str) -> str:
        started_at = perf_counter()
        resolved_filename = filename or "ticket.jpg"
        self.logger.info(
            "Uploading ticket image to imgloc",
            extra={
                "context": {
                    "lottery_code": lottery_code,
                    "filename": resolved_filename,
                    "image_size_bytes": len(image_bytes),
                    "imgloc_api_url": self.settings.imgloc_api_url,
                }
            },
        )
        files = {
            "source": (resolved_filename, image_bytes),
        }
        data = {
            "key": self.settings.imgloc_api_key,
            "format": "json",
        }
        try:
            response = requests.post(self.settings.imgloc_api_url, data=data, files=files, timeout=30)
        except requests.RequestException as exc:
            self.logger.error(
                "Imgloc upload request failed",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "error_type": exc.__class__.__name__,
                        "error_message": str(exc),
                    }
                },
            )
            raise ValueError("上传图床失败（网络请求异常）") from exc
        if response.status_code >= 400:
            response_text = self._truncate_text(response.text)
            payload: dict[str, Any] | None = None
            if response.content and callable(getattr(response, "json", None)):
                try:
                    parsed_payload = response.json()
                    if isinstance(parsed_payload, dict):
                        payload = parsed_payload
                except ValueError:
                    payload = None
            self.logger.error(
                "Imgloc upload returned non-success status",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "status_code": response.status_code,
                        "content_type": response.headers.get("content-type", ""),
                        "response_preview": response_text,
                    }
                },
            )
            if self._is_imgloc_content_blocked(
                status_code=response.status_code,
                payload=payload,
                response_text=response_text,
            ):
                raise ValueError("图片被图床风控拦截，请更换清晰票面；可先保存投注不上传图片")
            raise ValueError(f"上传图床失败（HTTP {response.status_code}）")
        try:
            payload = response.json() if response.content else {}
        except ValueError as exc:
            response_text = self._truncate_text(response.text)
            self.logger.error(
                "Imgloc upload response is not valid JSON",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "status_code": response.status_code,
                        "response_preview": response_text,
                    }
                },
            )
            raise ValueError("上传图床失败（响应解析失败）") from exc
        image_url = self._extract_imgloc_url(payload)
        if not image_url:
            payload_keys = ",".join(sorted(str(key) for key in payload.keys())) if isinstance(payload, dict) else ""
            self.logger.error(
                "Imgloc upload response missing image URL",
                extra={
                    "context": {
                        "lottery_code": lottery_code,
                        "status_code": response.status_code,
                        "payload_keys": payload_keys,
                    }
                },
            )
            raise ValueError("上传图床失败（未返回图片URL）")
        duration_ms = round((perf_counter() - started_at) * 1000, 2)
        self.logger.info(
            "Imgloc upload succeeded",
            extra={
                "context": {
                    "lottery_code": lottery_code,
                    "duration_ms": duration_ms,
                    "image_url_host": urlparse(image_url).netloc,
                }
            },
        )
        return image_url

    @staticmethod
    def _truncate_text(value: Any, *, limit: int = 300) -> str:
        text = str(value or "").replace("\n", " ").replace("\r", " ").strip()
        if len(text) <= limit:
            return text
        return f"{text[:limit]}..."

    @staticmethod
    def _extract_imgloc_url(payload: dict[str, Any]) -> str:
        if not isinstance(payload, dict):
            return ""
        for key in ("url", "image_url", "display_url"):
            value = payload.get(key)
            if isinstance(value, str) and value.strip():
                return value.strip()
        image_value = payload.get("image")
        if isinstance(image_value, str) and image_value.strip():
            return image_value.strip()
        if isinstance(image_value, dict):
            for key in ("url", "image_url", "display_url"):
                value = image_value.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
        data = payload.get("data")
        if isinstance(data, dict):
            for key in ("url", "image_url", "display_url"):
                value = data.get(key)
                if isinstance(value, str) and value.strip():
                    return value.strip()
            image = data.get("image")
            if isinstance(image, dict):
                value = image.get("url")
                if isinstance(value, str) and value.strip():
                    return value.strip()
        return ""

    @staticmethod
    def _is_imgloc_content_blocked(*, status_code: int, payload: dict[str, Any] | None, response_text: str) -> bool:
        if status_code not in {400, 403}:
            return False
        text_candidates = [str(response_text or "").lower()]
        if isinstance(payload, dict):
            text_candidates.append(json.dumps(payload, ensure_ascii=False).lower())
            error = payload.get("error")
            if isinstance(error, dict):
                error_code = str(error.get("code") or "").strip()
                error_message = str(error.get("message") or "").lower()
                if error_code == "403" and ("inappropriate" in error_message or "suspected" in error_message):
                    return True
        return any("suspected inappropriate content" in candidate for candidate in text_candidates)

    def _recognize_text_by_baidu(self, *, image_bytes: bytes) -> str:
        access_token = self._get_baidu_access_token()
        encoded_image = base64.b64encode(image_bytes).decode("utf-8")
        request_url = self._resolve_baidu_ocr_url()
        try:
            response = requests.post(
                request_url,
                params={"access_token": access_token},
                data={"image": encoded_image},
                headers={"Content-Type": "application/x-www-form-urlencoded"},
                timeout=30,
            )
        except requests.RequestException as exc:
            raise ValueError("百度 OCR 识别失败") from exc
        if response.status_code >= 400:
            raise ValueError("百度 OCR 识别失败")
        payload = response.json() if response.content else {}
        words_result = payload.get("words_result")
        if not isinstance(words_result, list):
            raise ValueError("百度 OCR 识别失败")
        self.logger.info(
            "Baidu OCR response received",
            extra={"context": {"words_result_count": len(words_result), "ocr_url": request_url}},
        )
        lines = [str(item.get("words") or "").strip() for item in words_result if isinstance(item, dict)]
        text = "\n".join([item for item in lines if item])
        if not text:
            raise ValueError("未识别到文本")
        return text

    def _resolve_baidu_ocr_url(self) -> str:
        configured = str(getattr(self.settings, "baidu_ocr_url", "") or "").strip()
        if not configured:
            return self.BAIDU_HIGH_ACCURACY_OCR_URL
        normalized = configured.lower()
        if "/accurate_basic" in normalized or "/accurate" in normalized:
            return configured
        self.logger.warning(
            "Configured OCR URL is not high-accuracy endpoint, fallback to accurate_basic",
            extra={"context": {"configured_ocr_url": configured, "fallback_ocr_url": self.BAIDU_HIGH_ACCURACY_OCR_URL}},
        )
        return self.BAIDU_HIGH_ACCURACY_OCR_URL

    def _get_baidu_access_token(self) -> str:
        cache_key = "baidu:ocr:access_token"
        cached = runtime_cache.get(cache_key)
        if isinstance(cached, str) and cached:
            return cached
        try:
            response = requests.get(
                self.settings.baidu_ocr_token_url,
                params={
                    "grant_type": "client_credentials",
                    "client_id": self.settings.baidu_ocr_api_key,
                    "client_secret": self.settings.baidu_ocr_secret_key,
                },
                timeout=20,
            )
        except requests.RequestException as exc:
            raise ValueError("百度 OCR 鉴权失败") from exc
        if response.status_code >= 400:
            raise ValueError("百度 OCR 鉴权失败")
        payload = response.json() if response.content else {}
        access_token = str(payload.get("access_token") or "").strip()
        expires_in = int(payload.get("expires_in") or 0)
        if not access_token:
            raise ValueError("百度 OCR 鉴权失败")
        ttl_seconds = max(60, expires_in - 120)
        runtime_cache.set(cache_key, access_token, ttl_seconds=ttl_seconds)
        return access_token

    def _parse_ticket_text(self, *, ocr_text: str, lottery_code: str) -> dict[str, Any]:
        text_lines = [line.strip() for line in re.split(r"[\r\n]+", ocr_text) if line.strip()]
        target_period = self._extract_target_period(ocr_text=ocr_text)
        warnings: list[str] = []
        lines: list[dict[str, Any]] = []
        if lottery_code == "pl3":
            lines = self._parse_pl3_lines(text_lines=text_lines)
        elif lottery_code == "pl5":
            lines = self._parse_pl5_lines(text_lines=text_lines)
        elif lottery_code == "qxc":
            lines = self._parse_qxc_lines(text_lines=text_lines)
        else:
            lines = self._parse_dlt_lines(text_lines=text_lines)
        if not target_period:
            warnings.append("未稳定识别到期号，请手动补录")
        return {
            "recognized_at": self._current_beijing_timestamp(),
            "ticket_purchased_at": self._extract_ticket_purchased_at(ocr_text=ocr_text),
            "target_period": target_period,
            "lines": lines,
            "warnings": warnings,
        }

    @staticmethod
    def _current_beijing_timestamp() -> int:
        return now_ts()

    @staticmethod
    def _extract_target_period(*, ocr_text: str) -> str:
        period_with_label = re.findall(r"第?\s*([0-9]{5,8})\s*期", ocr_text)
        if period_with_label:
            return sorted(period_with_label, key=len, reverse=True)[0]
        period_candidates = re.findall(r"(?<!\d)([0-9]{5,8})(?!\d)", ocr_text)
        if period_candidates:
            return sorted(period_candidates, key=len, reverse=True)[0]
        return ""

    @staticmethod
    def _extract_ticket_purchased_at(*, ocr_text: str) -> int | None:
        compact_patterns = [
            re.compile(r"(\d{2})[/-](\d{2})[/-](\d{2})\s*([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?!\d)"),
            re.compile(r"(?<!\d)(20\d{2})[\/\.-](\d{1,2})[\/\.-](\d{1,2})\s*([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)(?!\d)"),
            re.compile(r"(?<!\d)(20\d{2})年(\d{1,2})月(\d{1,2})日\s*([01]?\d|2[0-3]):([0-5]\d):([0-5]\d)(?!\d)"),
            re.compile(r"(?<!\d)(20\d{2})[\/\.-](\d{1,2})[\/\.-](\d{1,2})\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)"),
            re.compile(r"(?<!\d)(20\d{2})年(\d{1,2})月(\d{1,2})日\s*([01]?\d|2[0-3]):([0-5]\d)(?!\d)"),
        ]
        for pattern in compact_patterns:
            matched = pattern.search(ocr_text)
            if not matched:
                continue
            values = matched.groups()
            if len(values) == 6:
                year, month, day, hour, minute, second = values
            else:
                year, month, day, hour, minute = values
                second = "00"
            try:
                full_year = int(year)
                if full_year < 100:
                    full_year += 2000
                parsed = datetime(
                    year=full_year,
                    month=int(month),
                    day=int(day),
                    hour=int(hour),
                    minute=int(minute),
                    second=int(second),
                    tzinfo=BEIJING_TIMEZONE,
                )
            except ValueError:
                continue
            return ensure_timestamp(parsed, assume_beijing=True)
        return None

    def _parse_pl3_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        has_sequence_markers = any(self._is_pl3_sequence_marker(str(line).strip()) or re.match(r"^[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]\s*\d{0,3}$", str(line).strip()) for line in text_lines)
        if not has_sequence_markers:
            active_play_type = "direct"
            for line in text_lines:
                if "组选6" in line or "组六" in line:
                    active_play_type = "group6"
                elif "组选3" in line or "组三" in line:
                    active_play_type = "group3"
                elif "组选单式票" in line or "组选" in line:
                    active_play_type = "group"
                elif "直选单式票" in line or "直选" in line:
                    active_play_type = "direct"

                multiplier = self._extract_multiplier(line)
                number_tokens = re.findall(r"(?<!\d)(\d{3})(?!\d)", line)
                if not number_tokens:
                    continue
                for number_token in number_tokens:
                    if active_play_type in {"group", "group3", "group6"}:
                        recovered_group = self._build_pl3_group_line_from_tokens([number_token], multiplier=multiplier)
                        if recovered_group:
                            parsed_lines.append(recovered_group)
                        continue
                    recovered_direct = self._build_pl3_direct_line_from_tokens([number_token], multiplier=multiplier)
                    if recovered_direct:
                        parsed_lines.append(recovered_direct)
            return parsed_lines

        active_play_type = "direct"
        for line in text_lines:
            if "组选单式票" in line or "组选" in line:
                active_play_type = "group"
                break
            if "直选单式票" in line or "直选" in line:
                active_play_type = "direct"
                break

        blocks = self._split_pl3_marked_blocks(text_lines=text_lines)
        global_multiplier = 1
        for line in text_lines:
            global_multiplier = max(global_multiplier, self._extract_multiplier(line))

        if active_play_type == "group":
            recovered_direct = self._build_pl3_direct_line_from_tokens(
                [token for block in blocks for token in block],
                multiplier=global_multiplier,
                strict_positions=True,
            )
            if recovered_direct:
                return [recovered_direct]

        for block in blocks:
            multiplier = global_multiplier
            if active_play_type == "group":
                recovered_group = self._build_pl3_group_line_from_tokens(block, multiplier=multiplier)
                if recovered_group:
                    parsed_lines.append(recovered_group)
                continue
            recovered_direct = self._build_pl3_direct_line_from_tokens(block, multiplier=multiplier)
            if recovered_direct:
                parsed_lines.append(recovered_direct)
        return parsed_lines

    @staticmethod
    def _is_pl3_sequence_marker(value: str) -> bool:
        return bool(re.fullmatch(r"[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", value))

    @classmethod
    def _split_pl3_marked_blocks(cls, *, text_lines: list[str]) -> list[list[str]]:
        blocks: list[list[str]] = []
        current_block: list[str] = []
        marker_pattern = re.compile(r"^([①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳])\s*(\d{0,3})$")

        def flush_current_block() -> None:
            nonlocal current_block
            normalized = [item for item in current_block if item]
            if normalized:
                blocks.append(normalized)
            current_block = []

        for raw_line in text_lines:
            line = str(raw_line or "").strip()
            if not line:
                flush_current_block()
                continue
            matched = marker_pattern.fullmatch(line)
            if matched:
                flush_current_block()
                inline_digits = str(matched.group(2) or "").strip()
                if inline_digits:
                    current_block.append(inline_digits)
                continue
            if cls._is_pl3_sequence_marker(line):
                flush_current_block()
                continue
            if re.fullmatch(r"\d{1,3}", line):
                current_block.append(line)
                continue
            flush_current_block()
        flush_current_block()
        return blocks

    def _build_pl3_direct_line_from_tokens(
        self,
        tokens: list[str],
        *,
        multiplier: int,
        strict_positions: bool = False,
    ) -> dict[str, Any] | None:
        normalized_tokens = [str(token).strip() for token in tokens if str(token).strip()]
        if not normalized_tokens:
            return None
        if len(normalized_tokens) == 1 and len(normalized_tokens[0]) == 3:
            digits = [f"{int(ch):02d}" for ch in normalized_tokens[0]]
            return self._build_pl3_direct_line(
                hundreds=[digits[0]],
                tens=[digits[1]],
                units=[digits[2]],
                multiplier=multiplier,
            )

        positions: list[list[str]] = []
        for token in normalized_tokens:
            if not token.isdigit():
                continue
            if strict_positions and len(positions) == 2 and 1 <= len(token) <= 3:
                positions.append([f"{int(char):02d}" for char in token])
                continue
            if len(token) == 1:
                positions.append([f"{int(token):02d}"])
                continue
            if len(token) == 2:
                positions.append([f"{int(char):02d}" for char in token])
                continue
            if len(token) == 3:
                if strict_positions:
                    positions.append([f"{int(char):02d}" for char in token])
                else:
                    positions.extend([[f"{int(char):02d}"] for char in token])
            if len(positions) >= 3:
                break
        if len(positions) != 3:
            return None
        return self._build_pl3_direct_line(
            hundreds=positions[0],
            tens=positions[1],
            units=positions[2],
            multiplier=multiplier,
        )

    def _build_pl3_group_line_from_tokens(self, tokens: list[str], *, multiplier: int) -> dict[str, Any] | None:
        normalized_tokens = [str(token).strip() for token in tokens if str(token).strip()]
        if not normalized_tokens:
            return None
        if len(normalized_tokens) == 1 and len(normalized_tokens[0]) == 3:
            digits = normalized_tokens[0]
        elif len(normalized_tokens) >= 3 and all(len(token) == 1 for token in normalized_tokens[:3]):
            digits = "".join(normalized_tokens[:3])
        else:
            return None
        group_numbers = sorted({f"{int(char):02d}" for char in digits})
        if len(group_numbers) == 2:
            play_type = "group3"
        elif len(group_numbers) == 3:
            play_type = "group6"
        else:
            return None
        return {
            "play_type": play_type,
            "front_numbers": [],
            "back_numbers": [],
            "direct_hundreds": [],
            "direct_tens": [],
            "direct_units": [],
            "group_numbers": group_numbers,
            "multiplier": max(1, int(multiplier or 1)),
            "is_append": False,
            "bet_count": 1,
            "amount": 2 * max(1, int(multiplier or 1)),
        }

    @staticmethod
    def _build_pl3_direct_line(*, hundreds: list[str], tens: list[str], units: list[str], multiplier: int) -> dict[str, Any]:
        resolved_multiplier = max(1, int(multiplier or 1))
        return {
            "play_type": "direct",
            "front_numbers": [],
            "back_numbers": [],
            "direct_hundreds": hundreds,
            "direct_tens": tens,
            "direct_units": units,
            "group_numbers": [],
            "multiplier": resolved_multiplier,
            "is_append": False,
            "bet_count": max(1, len(hundreds) * len(tens) * len(units)),
            "amount": max(1, len(hundreds) * len(tens) * len(units)) * 2 * resolved_multiplier,
        }

    def _parse_pl5_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        for line in text_lines:
            multiplier = self._extract_multiplier(line)
            number_tokens = re.findall(r"(?<!\d)(\d{5})(?!\d)", line)
            if not number_tokens:
                continue
            for number_token in number_tokens:
                digits = [f"{int(ch):02d}" for ch in number_token]
                parsed_lines.append(
                    {
                        "play_type": "direct",
                        "front_numbers": [],
                        "back_numbers": [],
                        "direct_ten_thousands": [digits[0]],
                        "direct_thousands": [digits[1]],
                        "direct_hundreds": [digits[2]],
                        "direct_tens": [digits[3]],
                        "direct_units": [digits[4]],
                        "group_numbers": [],
                        "multiplier": multiplier,
                        "is_append": False,
                        "bet_count": 1,
                        "amount": 2 * multiplier,
                    }
                )
        return parsed_lines

    def _parse_qxc_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        current_digits: list[str] = []
        global_multiplier = 1
        for line in text_lines:
            global_multiplier = max(global_multiplier, self._extract_multiplier(line))

        def flush_current_digits() -> None:
            nonlocal current_digits
            if len(current_digits) != 7:
                current_digits = []
                return
            built_line = self._build_qxc_position_line(position_digits=current_digits, multiplier=global_multiplier)
            if built_line:
                parsed_lines.append(built_line)
            current_digits = []

        for line in text_lines:
            stripped = line.strip()
            if self._is_qxc_sequence_marker(stripped):
                flush_current_digits()
                continue
            exact_digit = self._extract_qxc_exact_digit(stripped)
            if exact_digit is not None:
                current_digits.append(exact_digit)
                if len(current_digits) == 7:
                    flush_current_digits()
                continue
            flush_current_digits()
            multiplier = self._extract_multiplier(line) or global_multiplier
            number_tokens = re.findall(r"(?<!\d)(\d{7,14})(?!\d)", line.replace(" ", ""))
            if not number_tokens:
                continue
            for number_token in number_tokens:
                built_line = self._build_qxc_compact_line(number_token=number_token, multiplier=multiplier)
                if built_line:
                    parsed_lines.append(built_line)
        flush_current_digits()
        return parsed_lines

    @staticmethod
    def _is_qxc_sequence_marker(value: str) -> bool:
        return bool(re.fullmatch(r"[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]", value))

    @staticmethod
    def _extract_qxc_exact_digit(value: str) -> str | None:
        if not re.fullmatch(r"\d{1,2}", value):
            return None
        number = int(value)
        if number < 0 or number > 14:
            return None
        return f"{number:02d}"

    def _build_qxc_compact_line(self, *, number_token: str, multiplier: int) -> dict[str, Any] | None:
        if len(number_token) < 7:
            return None
        front_digits = [f"{int(ch):02d}" for ch in number_token[:6]]
        if any(int(digit) > 9 for digit in front_digits):
            return None
        last_raw = number_token[6:]
        if not last_raw:
            return None
        last_value = int(last_raw)
        if last_value < 0 or last_value > 14:
            return None
        return self._build_qxc_position_line(
            position_digits=[*front_digits, f"{last_value:02d}"],
            multiplier=multiplier,
        )

    @staticmethod
    def _build_qxc_position_line(*, position_digits: list[str], multiplier: int) -> dict[str, Any] | None:
        if len(position_digits) != 7:
            return None
        try:
            front_values = [int(value) for value in position_digits[:6]]
            last_value = int(position_digits[6])
        except (TypeError, ValueError):
            return None
        if any(value < 0 or value > 9 for value in front_values):
            return None
        if last_value < 0 or last_value > 14:
            return None
        return {
            "play_type": "qxc_compound",
            "front_numbers": [],
            "back_numbers": [],
            "group_numbers": [],
            "position_selections": [[value] for value in position_digits],
            "multiplier": max(1, int(multiplier or 1)),
            "is_append": False,
            "bet_count": 1,
            "amount": 2 * max(1, int(multiplier or 1)),
        }

    def _parse_dlt_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        pending_front_numbers: list[str] = []
        pending_back_numbers: list[str] = []
        pending_front_dan: list[str] | None = None
        pending_front_tuo: list[str] | None = None
        pending_back_dan: list[str] | None = None
        pending_back_tuo: list[str] | None = None
        collecting_labeled_front_numbers = False
        collecting_labeled_back_numbers = False
        global_multiplier = 1
        for line in text_lines:
            global_multiplier = max(global_multiplier, self._extract_multiplier(line))

        for line in text_lines:
            suite_single_numbers = self._extract_suite_single_numbers(line)
            if suite_single_numbers:
                front_numbers, back_numbers = suite_single_numbers
                multiplier = self._extract_multiplier(line) or global_multiplier
                is_append = "追加" in line
                parsed_lines.append(
                    self._build_dlt_line(
                        front_numbers=front_numbers,
                        back_numbers=back_numbers,
                        multiplier=multiplier,
                        is_append=is_append,
                    )
                )
                collecting_labeled_front_numbers = False
                collecting_labeled_back_numbers = False
                continue

            dantuo_parts = self._extract_dlt_dantuo_parts(line)
            if dantuo_parts:
                if "front_dan" in dantuo_parts:
                    pending_front_dan = dantuo_parts["front_dan"]
                if "front_tuo" in dantuo_parts:
                    pending_front_tuo = dantuo_parts["front_tuo"]
                if "back_dan" in dantuo_parts:
                    pending_back_dan = dantuo_parts["back_dan"]
                if "back_tuo" in dantuo_parts:
                    pending_back_tuo = dantuo_parts["back_tuo"]
                if pending_front_tuo is not None and pending_front_dan is None:
                    pending_front_dan = []
                if pending_back_tuo is not None and pending_back_dan is None:
                    pending_back_dan = []
                if (
                    pending_front_dan is not None
                    and pending_front_tuo is not None
                    and pending_back_dan is not None
                    and pending_back_tuo is not None
                ):
                    multiplier = self._extract_multiplier(line) or global_multiplier
                    is_append = "追加" in line
                    if self._is_valid_dlt_dantuo_numbers(
                        front_dan=pending_front_dan,
                        front_tuo=pending_front_tuo,
                        back_dan=pending_back_dan,
                        back_tuo=pending_back_tuo,
                    ):
                        parsed_lines.append(
                            self._build_dlt_dantuo_line(
                                front_dan=pending_front_dan,
                                front_tuo=pending_front_tuo,
                                back_dan=pending_back_dan,
                                back_tuo=pending_back_tuo,
                                multiplier=multiplier,
                                is_append=is_append,
                            )
                        )
                    pending_front_dan = None
                    pending_front_tuo = None
                    pending_back_dan = None
                    pending_back_tuo = None
                    continue

            dantuo_numbers = self._extract_dlt_dantuo_numbers(line)
            if dantuo_numbers:
                front_dan, front_tuo, back_dan, back_tuo = dantuo_numbers
                multiplier = self._extract_multiplier(line) or global_multiplier
                is_append = "追加" in line
                if self._is_valid_dlt_dantuo_numbers(
                    front_dan=front_dan,
                    front_tuo=front_tuo,
                    back_dan=back_dan,
                    back_tuo=back_tuo,
                ):
                    parsed_lines.append(
                        self._build_dlt_dantuo_line(
                            front_dan=front_dan,
                            front_tuo=front_tuo,
                            back_dan=back_dan,
                            back_tuo=back_tuo,
                            multiplier=multiplier,
                            is_append=is_append,
                        )
                    )
                    continue

            compact_front = self._extract_labeled_compact_numbers(line, label="前区")
            compact_back = self._extract_labeled_compact_numbers(line, label="后区")
            if compact_front:
                pending_front_numbers = compact_front
                collecting_labeled_front_numbers = False
            elif "前区" in line:
                collecting_labeled_front_numbers = True
                pending_front_numbers = []
            elif collecting_labeled_front_numbers:
                inline_front_numbers = self._extract_inline_zone_numbers(line)
                if inline_front_numbers:
                    pending_front_numbers.extend(inline_front_numbers)
                elif re.search(r"[\u4e00-\u9fff]", line):
                    collecting_labeled_front_numbers = False
            if compact_back:
                pending_back_numbers = compact_back
                collecting_labeled_back_numbers = False
            elif "后区" in line:
                collecting_labeled_front_numbers = False
                collecting_labeled_back_numbers = True
                pending_back_numbers = []
            elif collecting_labeled_back_numbers:
                inline_back_numbers = self._extract_inline_zone_numbers(line)
                if inline_back_numbers:
                    pending_back_numbers.extend(inline_back_numbers)
                elif re.search(r"[\u4e00-\u9fff]", line):
                    collecting_labeled_back_numbers = False
            if pending_front_numbers and pending_back_numbers:
                multiplier = self._extract_multiplier(line) or global_multiplier
                normalized_front = sorted(set(pending_front_numbers))
                normalized_back = sorted(set(pending_back_numbers))
                if len(normalized_front) >= 5 and len(normalized_back) >= 2:
                    is_append = "追加" in line
                    parsed_lines.append(
                        self._build_dlt_line(
                            front_numbers=normalized_front,
                            back_numbers=normalized_back,
                            multiplier=multiplier,
                            is_append=is_append,
                        )
                    )
                    pending_front_numbers = []
                    pending_back_numbers = []
                    collecting_labeled_front_numbers = False
                    collecting_labeled_back_numbers = False
                continue

            segments = [segment for segment in re.split(r"[+|｜]", line) if segment.strip()]
            front_numbers = re.findall(r"(?<!\d)(\d{2})(?!\d)", segments[0]) if segments else []
            back_numbers = re.findall(r"(?<!\d)(\d{2})(?!\d)", segments[1]) if len(segments) > 1 else []
            if len(front_numbers) < 5 or len(back_numbers) < 2:
                all_numbers = re.findall(r"(?<!\d)(\d{2})(?!\d)", line)
                if len(all_numbers) >= 7:
                    front_numbers = all_numbers[:5]
                    back_numbers = all_numbers[5:7]
                else:
                    continue
            normalized_front = sorted(set(front_numbers))
            normalized_back = sorted(set(back_numbers))
            if len(normalized_front) < 5 or len(normalized_back) < 2:
                continue
            multiplier = self._extract_multiplier(line) or global_multiplier
            is_append = "追加" in line
            parsed_lines.append(
                self._build_dlt_line(
                    front_numbers=normalized_front,
                    back_numbers=normalized_back,
                    multiplier=multiplier,
                    is_append=is_append,
                )
            )
        return parsed_lines

    @staticmethod
    def _extract_labeled_compact_numbers(line: str, *, label: str) -> list[str]:
        pattern = rf"{re.escape(label)}\s*([0-9]{{4,}})"
        matched = re.search(pattern, line)
        if not matched:
            return []
        compact = matched.group(1)
        if len(compact) % 2 != 0:
            return []
        return [compact[index : index + 2] for index in range(0, len(compact), 2)]

    @staticmethod
    def _extract_inline_zone_numbers(line: str) -> list[str]:
        normalized = str(line or "").strip()
        if re.fullmatch(r"\d+", normalized):
            if len(normalized) % 2 != 0:
                return []
            return [normalized[index : index + 2] for index in range(0, len(normalized), 2)]
        return re.findall(r"(?<!\d)(\d{2})(?!\d)", normalized)

    @staticmethod
    def _extract_suite_single_numbers(line: str) -> tuple[list[str], list[str]] | None:
        normalized = str(line or "").replace("＋", "+").strip()
        normalized = re.sub(r"^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩]|[0-9]{1,2}[).、．])\s*", "", normalized)
        matched = re.search(r"(?<!\d)(\d{10})\s*\+\s*(\d{4})(?!\d)", normalized)
        if not matched:
            return None
        compact_front, compact_back = matched.groups()
        front_numbers = [compact_front[index : index + 2] for index in range(0, len(compact_front), 2)]
        back_numbers = [compact_back[index : index + 2] for index in range(0, len(compact_back), 2)]
        normalized_front = sorted(set(front_numbers))
        normalized_back = sorted(set(back_numbers))
        if len(normalized_front) != 5 or len(normalized_back) != 2:
            return None
        return normalized_front, normalized_back

    @staticmethod
    def _build_dlt_line(
        *,
        front_numbers: list[str],
        back_numbers: list[str],
        multiplier: int,
        is_append: bool,
    ) -> dict[str, Any]:
        bet_count = comb(len(front_numbers), 5) * comb(len(back_numbers), 2)
        amount = bet_count * 2 * multiplier + (bet_count * multiplier if is_append else 0)
        return {
            "play_type": "dlt",
            "front_numbers": front_numbers,
            "back_numbers": back_numbers,
            "front_dan": [],
            "front_tuo": [],
            "back_dan": [],
            "back_tuo": [],
            "direct_hundreds": [],
            "direct_tens": [],
            "direct_units": [],
            "group_numbers": [],
            "multiplier": multiplier,
            "is_append": is_append,
            "bet_count": bet_count,
            "amount": amount,
        }

    @staticmethod
    def _extract_dlt_dantuo_parts(line: str) -> dict[str, list[str]]:
        normalized = str(line or "").replace("（", "(").replace("）", ")")
        extracted: dict[str, list[str]] = {}
        candidates = [
            ("front_dan", "前", "胆"),
            ("front_tuo", "前", "拖"),
            ("back_dan", "后", "胆"),
            ("back_tuo", "后", "拖"),
        ]
        for key, zone, kind in candidates:
            if not re.search(rf"{zone}\s*区?\s*{kind}|{zone}{kind}", normalized):
                continue
            numbers = TicketOCRService._extract_dantuo_zone_numbers(normalized, zone=zone, kind=kind)
            if numbers is None:
                continue
            extracted[key] = numbers
        return extracted

    @staticmethod
    def _is_valid_dlt_dantuo_numbers(
        *,
        front_dan: list[str],
        front_tuo: list[str],
        back_dan: list[str],
        back_tuo: list[str],
    ) -> bool:
        front_pick_count = 5 - len(front_dan)
        back_pick_count = 2 - len(back_dan)
        return (
            1 <= len(front_dan) <= 4
            and len(front_tuo) >= 2
            and len(set(front_dan) & set(front_tuo)) == 0
            and len(set([*front_dan, *front_tuo])) >= 6
            and len(back_dan) <= 1
            and len(back_tuo) >= 2
            and len(set(back_dan) & set(back_tuo)) == 0
            and len(set([*back_dan, *back_tuo])) >= 3
            and len(front_tuo) >= front_pick_count
            and len(back_tuo) >= back_pick_count
        )

    @staticmethod
    def _build_dlt_dantuo_line(
        *,
        front_dan: list[str],
        front_tuo: list[str],
        back_dan: list[str],
        back_tuo: list[str],
        multiplier: int,
        is_append: bool,
    ) -> dict[str, Any]:
        front_pick_count = 5 - len(front_dan)
        back_pick_count = 2 - len(back_dan)
        bet_count = comb(len(front_tuo), front_pick_count) * comb(len(back_tuo), back_pick_count)
        amount = bet_count * 2 * multiplier + (bet_count * multiplier if is_append else 0)
        return {
            "play_type": "dlt_dantuo",
            "front_numbers": [],
            "back_numbers": [],
            "front_dan": front_dan,
            "front_tuo": front_tuo,
            "back_dan": back_dan,
            "back_tuo": back_tuo,
            "direct_hundreds": [],
            "direct_tens": [],
            "direct_units": [],
            "group_numbers": [],
            "multiplier": multiplier,
            "is_append": is_append,
            "bet_count": bet_count,
            "amount": amount,
        }

    @staticmethod
    def _extract_dlt_dantuo_numbers(line: str) -> tuple[list[str], list[str], list[str], list[str]] | None:
        normalized = str(line or "").replace("（", "(").replace("）", ")")
        if "胆" not in normalized or "拖" not in normalized:
            return None
        front_dan = TicketOCRService._extract_dantuo_zone_numbers(normalized, zone="前", kind="胆")
        front_tuo = TicketOCRService._extract_dantuo_zone_numbers(normalized, zone="前", kind="拖")
        back_dan = TicketOCRService._extract_dantuo_zone_numbers(normalized, zone="后", kind="胆")
        back_tuo = TicketOCRService._extract_dantuo_zone_numbers(normalized, zone="后", kind="拖")
        if front_dan is None or front_tuo is None or back_dan is None or back_tuo is None:
            return None
        return front_dan, front_tuo, back_dan, back_tuo

    @staticmethod
    def _extract_dantuo_zone_numbers(line: str, *, zone: str, kind: str) -> list[str] | None:
        patterns = [
            rf"{zone}\s*区?\s*{kind}\s*[:：]?\s*([0-9][0-9\s,，、/|;；]*)",
            rf"{zone}{kind}\s*[:：]?\s*([0-9][0-9\s,，、/|;；]*)",
        ]
        for pattern in patterns:
            matched = re.search(pattern, line)
            if not matched:
                continue
            raw_numbers = matched.group(1).strip()
            if re.fullmatch(r"\d+", raw_numbers):
                if len(raw_numbers) % 2 != 0:
                    return []
                tokens = [raw_numbers[index : index + 2] for index in range(0, len(raw_numbers), 2)]
            else:
                tokens = re.findall(r"(?<!\d)(\d{1,2})(?!\d)", raw_numbers)
            values = sorted({item.zfill(2) for item in tokens})
            return values
        if kind == "胆":
            return []
        return None

    @staticmethod
    def _extract_multiplier(text: str) -> int:
        matched = re.search(r"(\d{1,2})\s*倍", text)
        if not matched:
            return 1
        value = int(matched.group(1))
        return max(1, min(99, value))
