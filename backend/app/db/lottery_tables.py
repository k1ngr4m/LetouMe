from __future__ import annotations

import re
from contextlib import contextmanager
from contextvars import ContextVar
from typing import Iterator

from backend.app.lotteries import normalize_lottery_code


LOTTERY_SCOPED_TABLES = (
    "draw_issue",
    "draw_result",
    "draw_result_number",
    "draw_result_prize",
    "prediction_batch",
    "prediction_model_run",
    "prediction_group",
    "prediction_group_number",
    "prediction_hit_summary",
    "prediction_hit_number",
    "model_batch_summary",
    "simulation_ticket",
    "my_bet_record",
    "my_bet_record_line",
    "my_bet_record_meta",
)

_lottery_scope: ContextVar[str | None] = ContextVar("lottery_scope", default=None)
_table_patterns = {
    table_name: re.compile(rf"\b{re.escape(table_name)}\b")
    for table_name in LOTTERY_SCOPED_TABLES
}


def split_table_name(table_name: str, lottery_code: str) -> str:
    return f"{normalize_lottery_code(lottery_code)}_{table_name}"


def get_lottery_table_scope() -> str | None:
    return _lottery_scope.get()


@contextmanager
def use_lottery_table_scope(lottery_code: str | None) -> Iterator[None]:
    if not lottery_code:
        yield
        return
    token = _lottery_scope.set(normalize_lottery_code(lottery_code))
    try:
        yield
    finally:
        _lottery_scope.reset(token)


def rewrite_lottery_tables(query: str, *, split_enabled: bool, lottery_code: str | None = None) -> str:
    if not split_enabled:
        return query
    scoped_code = normalize_lottery_code(lottery_code) if lottery_code else get_lottery_table_scope()
    if not scoped_code:
        return query

    rewritten = query
    for table_name, pattern in _table_patterns.items():
        target_name = split_table_name(table_name, scoped_code)
        rewritten = rewritten.replace(f"`{table_name}`", f"`{target_name}`")
        rewritten = pattern.sub(target_name, rewritten)
    return rewritten
