from __future__ import annotations

import json
from datetime import timedelta
from typing import Any

from backend.app.lotteries import normalize_lottery_code
from backend.app.logging_utils import get_logger
from backend.app.repositories.lottery_repository import LotteryRepository
from backend.app.repositories.message_repository import MessageRepository
from backend.app.repositories.my_bet_repository import MyBetRepository
from backend.app.services.my_bet_service import MyBetService
from backend.app.time_utils import as_beijing_datetime, ensure_timestamp, now_ts


class MessageService:
    PLAY_TYPE_LABELS = {
        "mixed": "混合投注",
        "dlt": "普通投注",
        "dlt_dantuo": "胆拖投注",
        "direct": "直选",
        "group3": "组选3",
        "group6": "组选6",
        "direct_sum": "直选和值",
        "group_sum": "组选和值",
    }

    def __init__(
        self,
        repository: MessageRepository | None = None,
        my_bet_repository: MyBetRepository | None = None,
        lottery_repository: LotteryRepository | None = None,
        my_bet_service: MyBetService | None = None,
    ) -> None:
        self.repository = repository or MessageRepository()
        self.my_bet_repository = my_bet_repository or MyBetRepository()
        self.lottery_repository = lottery_repository or LotteryRepository()
        self.my_bet_service = my_bet_service or MyBetService(repository=self.my_bet_repository, lottery_repository=self.lottery_repository)
        self.logger = get_logger("services.message")

    def list_messages(
        self,
        *,
        user_id: int,
        lottery_code: str | None = None,
        status_filter: str = "all",
        result_filter: str = "all",
        keyword: str | None = None,
        date_start: str | None = None,
        date_end: str | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict[str, Any]:
        normalized_code = normalize_lottery_code(lottery_code) if lottery_code else None
        payload = self.repository.list_messages(
            user_id=user_id,
            lottery_code=normalized_code,
            status_filter=status_filter,
            result_filter=result_filter,
            keyword=keyword,
            date_start=date_start,
            date_end=date_end,
            limit=limit,
            offset=offset,
        )
        return {
            "messages": [self._serialize_message(item) for item in payload.get("messages", [])],
            "total_count": int(payload.get("total_count") or 0),
        }

    def get_unread_count(self, *, user_id: int, lottery_code: str | None = None) -> dict[str, int]:
        normalized_code = normalize_lottery_code(lottery_code) if lottery_code else None
        return {"unread_count": self.repository.get_unread_count(user_id=user_id, lottery_code=normalized_code)}

    def mark_read(self, *, user_id: int, message_id: int) -> None:
        if not self.repository.mark_read(user_id=user_id, message_id=message_id):
            raise KeyError(message_id)

    def mark_all_read(self, *, user_id: int, lottery_code: str | None = None) -> dict[str, int]:
        normalized_code = normalize_lottery_code(lottery_code) if lottery_code else None
        affected = self.repository.mark_all_read(user_id=user_id, lottery_code=normalized_code)
        return {"affected_count": affected}

    def delete_message(self, *, user_id: int, message_id: int) -> None:
        if not self.repository.delete_message(user_id=user_id, message_id=message_id):
            raise KeyError(message_id)

    def generate_messages_for_recent_draws(
        self,
        *,
        lottery_code: str,
        recent_days: int = 30,
        limit: int = 500,
        excluded_periods: set[str] | None = None,
    ) -> int:
        normalized_code = normalize_lottery_code(lottery_code)
        draws = self.lottery_repository.list_draws(limit=limit, lottery_code=normalized_code)
        if not draws:
            return 0
        now_beijing = as_beijing_datetime(now_ts())
        cutoff_date = now_beijing.date() - timedelta(days=max(0, int(recent_days))) if now_beijing else None
        if cutoff_date is None:
            return 0
        excluded = {str(period).strip() for period in (excluded_periods or set()) if str(period).strip()}
        periods: list[str] = []
        for draw in draws:
            draw_date = self._parse_draw_date(draw.get("date"))
            if draw_date and draw_date < cutoff_date:
                continue
            period = str(draw.get("period") or "").strip()
            if period and period not in excluded:
                periods.append(period)
        return self.generate_messages_for_periods(lottery_code=normalized_code, periods=periods)

    def generate_messages_for_periods(self, *, lottery_code: str, periods: list[str]) -> int:
        normalized_code = normalize_lottery_code(lottery_code)
        normalized_periods = sorted({str(period).strip() for period in periods if str(period).strip()}, reverse=True)
        if not normalized_periods:
            return 0
        created_count = 0
        for period in normalized_periods:
            records = self.my_bet_repository.list_records_by_period(target_period=period, lottery_code=normalized_code)
            if not records:
                continue
            for record in records:
                source_user_id = int(record.get("user_id") or 0)
                settled_record = self.my_bet_service._serialize_with_settlement(record, lottery_code=normalized_code)
                settled_record["user_id"] = source_user_id
                payload = self._build_settlement_message_payload(settled_record, lottery_code=normalized_code)
                user_id = int(payload.get("user_id") or 0)
                if user_id <= 0:
                    self.logger.warning(
                        "Skip settlement message due to invalid user_id",
                        extra={
                            "context": {
                                "lottery_code": normalized_code,
                                "target_period": period,
                                "my_bet_record_id": int(payload.get("my_bet_record_id") or 0),
                                "user_id": user_id,
                            }
                        },
                    )
                    continue
                try:
                    if self.repository.create_settlement_message(payload):
                        created_count += 1
                except Exception as exc:
                    self.logger.warning(
                        "Skip settlement message due to insert failure",
                        extra={
                            "context": {
                                "lottery_code": normalized_code,
                                "target_period": period,
                                "my_bet_record_id": int(payload.get("my_bet_record_id") or 0),
                                "user_id": user_id,
                                "error": f"{type(exc).__name__}: {exc}",
                            }
                        },
                    )
        if created_count > 0:
            self.logger.info(
                "Generated settlement messages",
                extra={
                    "context": {
                        "lottery_code": normalized_code,
                        "period_count": len(normalized_periods),
                        "created_count": created_count,
                    }
                },
            )
        return created_count

    @staticmethod
    def _build_settlement_message_payload(record: dict[str, Any], *, lottery_code: str) -> dict[str, Any]:
        target_period = str(record.get("target_period") or "")
        prize_level = str(record.get("prize_level") or "").strip()
        winning_bet_count = int(record.get("winning_bet_count") or 0)
        prize_amount = int(record.get("prize_amount") or 0)
        net_profit = int(record.get("net_profit") or 0)
        amount = int(record.get("amount") or 0)
        net_amount = int(record.get("net_amount") or 0)
        play_type = str(record.get("play_type") or "dlt")
        play_type_label = MessageService.PLAY_TYPE_LABELS.get(play_type, play_type)
        hit_text = (
            f"命中 {prize_level}，中奖 {winning_bet_count} 注"
            if prize_level
            else "本期未中奖"
        )
        content = (
            f"第 {target_period} 期已开奖。"
            f"玩法：{play_type_label}；投注金额：{amount} 元（实付 {net_amount} 元）；"
            f"{hit_text}；奖金 {prize_amount} 元；盈亏 {net_profit} 元。"
        )
        snapshot = {
            "lottery_code": lottery_code,
            "target_period": target_period,
            "my_bet_record_id": int(record.get("id") or 0),
            "play_type": play_type,
            "play_type_label": play_type_label,
            "amount": amount,
            "net_amount": net_amount,
            "winning_bet_count": winning_bet_count,
            "prize_level": prize_level or None,
            "prize_amount": prize_amount,
            "net_profit": net_profit,
            "settlement_status": str(record.get("settlement_status") or "pending"),
            "settled_at": record.get("settled_at"),
            "actual_result": record.get("actual_result"),
        }
        return {
            "user_id": int(record.get("user_id") or 0),
            "lottery_code": lottery_code,
            "target_period": target_period,
            "my_bet_record_id": int(record.get("id") or 0),
            "message_type": "bet_settlement",
            "title": f"第 {target_period} 期开奖通知",
            "content": content,
            "snapshot_json": json.dumps(snapshot, ensure_ascii=False),
        }

    @staticmethod
    def _serialize_message(message: dict[str, Any]) -> dict[str, Any]:
        snapshot = message.get("snapshot_json")
        if isinstance(snapshot, (str, bytes)) and snapshot:
            try:
                snapshot = json.loads(snapshot)
            except Exception:
                snapshot = None
        elif not isinstance(snapshot, dict):
            snapshot = None
        return {
            "id": int(message.get("id") or 0),
            "lottery_code": str(message.get("lottery_code") or "dlt"),
            "target_period": str(message.get("target_period") or ""),
            "my_bet_record_id": int(message.get("my_bet_record_id") or 0),
            "message_type": str(message.get("message_type") or "bet_settlement"),
            "title": str(message.get("title") or ""),
            "content": str(message.get("content") or ""),
            "snapshot": snapshot,
            "is_read": bool(message.get("read_at")),
            "read_at": ensure_timestamp(message.get("read_at")),
            "created_at": int(ensure_timestamp(message.get("created_at")) or 0),
        }

    @staticmethod
    def _parse_draw_date(value: Any):
        text = str(value or "").strip()
        if not text:
            return None
        candidates = [text, text[:19], text[:10]]
        for raw in candidates:
            if not raw:
                continue
            for fmt in ("%Y-%m-%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
                try:
                    return datetime.strptime(raw, fmt).date()
                except ValueError:
                    continue
        return None
