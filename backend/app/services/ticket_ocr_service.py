from __future__ import annotations

import base64
import re
from datetime import datetime
from math import comb
from time import perf_counter
from typing import Any
from urllib.parse import urlparse

import requests

from backend.app.cache import runtime_cache
from backend.app.config import Settings, load_settings
from backend.app.logging_utils import get_logger
from backend.app.lotteries import normalize_lottery_code


class TicketOCRService:
    BAIDU_HIGH_ACCURACY_OCR_URL = "https://aip.baidubce.com/rest/2.0/ocr/v1/accurate_basic"

    def __init__(self, settings: Settings | None = None) -> None:
        self.settings = settings or load_settings()
        self.logger = get_logger("services.ticket_ocr")

    def recognize(self, *, lottery_code: str, image_bytes: bytes, filename: str) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code)
        self._validate_settings()
        image_url = self._upload_to_imgloc(image_bytes=image_bytes, filename=filename, lottery_code=normalized_code)
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
            "ticket_image_url": image_url,
            "ocr_text": ocr_text,
            "ocr_provider": "baidu",
            "ocr_recognized_at": parsed.get("recognized_at"),
            "target_period": parsed.get("target_period", ""),
            "lines": lines,
            "warnings": warnings,
        }

    def _validate_settings(self) -> None:
        if not self.settings.baidu_ocr_api_key or not self.settings.baidu_ocr_secret_key:
            raise ValueError("未配置百度 OCR 密钥")
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
        else:
            lines = self._parse_dlt_lines(text_lines=text_lines)
        if not target_period:
            warnings.append("未稳定识别到期号，请手动补录")
        return {
            "recognized_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "target_period": target_period,
            "lines": lines,
            "warnings": warnings,
        }

    @staticmethod
    def _extract_target_period(*, ocr_text: str) -> str:
        period_with_label = re.findall(r"第?\s*([0-9]{5,8})\s*期", ocr_text)
        if period_with_label:
            return sorted(period_with_label, key=len, reverse=True)[0]
        period_candidates = re.findall(r"(?<!\d)([0-9]{5,8})(?!\d)", ocr_text)
        if period_candidates:
            return sorted(period_candidates, key=len, reverse=True)[0]
        return ""

    def _parse_pl3_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        active_play_type = "direct"
        for line in text_lines:
            lower_line = line.lower()
            if "组选6" in line or "组六" in line:
                active_play_type = "group6"
            elif "组选3" in line or "组三" in line:
                active_play_type = "group3"
            elif "直选" in line:
                active_play_type = "direct"

            multiplier = self._extract_multiplier(line)
            number_tokens = re.findall(r"(?<!\d)(\d{3})(?!\d)", line)
            if not number_tokens:
                continue
            for number_token in number_tokens:
                digits = [f"{int(ch):02d}" for ch in number_token]
                if active_play_type == "direct":
                    parsed_lines.append(
                        {
                            "play_type": "direct",
                            "front_numbers": [],
                            "back_numbers": [],
                            "direct_hundreds": [digits[0]],
                            "direct_tens": [digits[1]],
                            "direct_units": [digits[2]],
                            "group_numbers": [],
                            "multiplier": multiplier,
                            "is_append": False,
                            "bet_count": 1,
                            "amount": 2 * multiplier,
                        }
                    )
                else:
                    group_numbers = sorted(set(digits))
                    if active_play_type == "group3" and len(group_numbers) != 2:
                        continue
                    if active_play_type == "group6" and len(group_numbers) != 3:
                        continue
                    parsed_lines.append(
                        {
                            "play_type": active_play_type,
                            "front_numbers": [],
                            "back_numbers": [],
                            "direct_hundreds": [],
                            "direct_tens": [],
                            "direct_units": [],
                            "group_numbers": group_numbers,
                            "multiplier": multiplier,
                            "is_append": False,
                            "bet_count": 1,
                            "amount": 2 * multiplier,
                        }
                    )
        return parsed_lines

    def _parse_dlt_lines(self, *, text_lines: list[str]) -> list[dict[str, Any]]:
        parsed_lines: list[dict[str, Any]] = []
        pending_front_numbers: list[str] = []
        pending_back_numbers: list[str] = []
        global_multiplier = 1
        for line in text_lines:
            global_multiplier = max(global_multiplier, self._extract_multiplier(line))

        for line in text_lines:
            compact_front = self._extract_labeled_compact_numbers(line, label="前区")
            compact_back = self._extract_labeled_compact_numbers(line, label="后区")
            if compact_front:
                pending_front_numbers = compact_front
            if compact_back:
                pending_back_numbers = compact_back
            if pending_front_numbers and pending_back_numbers:
                multiplier = self._extract_multiplier(line) or global_multiplier
                normalized_front = sorted(set(pending_front_numbers))
                normalized_back = sorted(set(pending_back_numbers))
                if len(normalized_front) >= 5 and len(normalized_back) >= 2:
                    is_append = "追加" in line
                    bet_count = comb(len(normalized_front), 5) * comb(len(normalized_back), 2)
                    amount = bet_count * 2 * multiplier + (bet_count * multiplier if is_append else 0)
                    parsed_lines.append(
                        {
                            "play_type": "dlt",
                            "front_numbers": normalized_front,
                            "back_numbers": normalized_back,
                            "direct_hundreds": [],
                            "direct_tens": [],
                            "direct_units": [],
                            "group_numbers": [],
                            "multiplier": multiplier,
                            "is_append": is_append,
                            "bet_count": bet_count,
                            "amount": amount,
                        }
                    )
                    pending_front_numbers = []
                    pending_back_numbers = []
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
            bet_count = comb(len(normalized_front), 5) * comb(len(normalized_back), 2)
            amount = bet_count * 2 * multiplier + (bet_count * multiplier if is_append else 0)
            parsed_lines.append(
                {
                    "play_type": "dlt",
                    "front_numbers": normalized_front,
                    "back_numbers": normalized_back,
                    "direct_hundreds": [],
                    "direct_tens": [],
                    "direct_units": [],
                    "group_numbers": [],
                    "multiplier": multiplier,
                    "is_append": is_append,
                    "bet_count": bet_count,
                    "amount": amount,
                }
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
    def _extract_multiplier(text: str) -> int:
        matched = re.search(r"(\d{1,2})\s*倍", text)
        if not matched:
            return 1
        value = int(matched.group(1))
        return max(1, min(99, value))
