#!/usr/bin/env python3
"""批量重算大乐透历史期数 AI 预测结果。

示例:
python scripts/dlt_recalculate_history_predictions.py \
  --start-period 26022 \
  --end-period 26024 \
  --model dlt_gpt-4o_4.1:GPT-4.1:gpt-4.1 \
  --model dlt_gemini-3-flash-preview_3_flash:Gemini-3-flash-preview:gpt-4.1-mini \
  --force
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.model_config import load_model_registry
from core.model_factory import ModelFactory
from predict import dlt_engine as dlt_ai


DEFAULT_HISTORY_PATH = Path("data/dlt_data.json")
DEFAULT_OUTPUT_PATH = Path("data/dlt_predictions_history.json")
DEFAULT_PROMPT_PATH = Path("doc/dlt_prompt2.0.md")
DEFAULT_CONTEXT_SIZE = 30


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="批量重算大乐透历史期 AI 预测")
    parser.add_argument("--start-period", required=True, help="起始目标期号（含），如 26022")
    parser.add_argument("--end-period", required=True, help="结束目标期号（含），如 26024")
    parser.add_argument("--history-file", default=str(DEFAULT_HISTORY_PATH), help="历史开奖数据 JSON 路径")
    parser.add_argument("--output-file", default=str(DEFAULT_OUTPUT_PATH), help="预测历史输出 JSON 路径")
    parser.add_argument("--prompt-file", default=str(DEFAULT_PROMPT_PATH), help="Prompt 模板路径")
    parser.add_argument("--context-size", type=int, default=DEFAULT_CONTEXT_SIZE, help="每期使用的历史开奖条数")
    parser.add_argument("--force", action="store_true", help="强制覆盖已存在的目标期+模型预测")
    parser.add_argument(
        "--config",
        default="config/models.json",
        help="模型配置文件路径（默认 config/models.json）",
    )
    parser.add_argument(
        "--models",
        default="",
        help="要使用的模型 ID，逗号分隔；为空则使用配置中的 active_models",
    )
    parser.add_argument(
        "--include-tags",
        default="",
        help="按标签筛选模型，逗号分隔，例如 reasoning,fast",
    )
    parser.add_argument(
        "--no-health-check",
        action="store_true",
        help="禁用模型健康检查（默认开启）",
    )
    return parser.parse_args()


def parse_csv(value: str) -> list[str]:
    if not value:
        return []
    return [item.strip() for item in value.split(",") if item.strip()]


def load_json(path: Path) -> Any:
    if not path.exists():
        raise FileNotFoundError(f"文件不存在: {path}")
    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def save_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def normalize_two_digit(value: str | int) -> str:
    return f"{int(value):02d}"


def build_period_map(history_data: dict[str, Any]) -> dict[str, dict[str, Any]]:
    items = history_data.get("data", [])
    if not isinstance(items, list):
        raise ValueError("history-file 格式错误: data 字段必须为数组")

    period_map: dict[str, dict[str, Any]] = {}
    for row in items:
        period = str(row["period"])
        red = sorted(normalize_two_digit(x) for x in row.get("red_balls", []))
        blue_raw = row.get("blue_balls") or row.get("blue_ball") or []
        blue = sorted(normalize_two_digit(x) for x in blue_raw)
        period_map[period] = {
            "period": period,
            "red_balls": red,
            "blue_balls": blue,
            "blue_ball": blue[0] if blue else None,
            "date": row.get("date"),
        }
    return period_map


def build_prediction_prompt(
    prompt_template: str,
    target_period: str,
    prediction_date: str,
    model_def: Any,
    history_context: list[dict[str, Any]],
) -> str:
    context_json = json.dumps(history_context, ensure_ascii=False, indent=2)
    return prompt_template.format(
        target_period=target_period,
        target_date="",
        lottery_history=context_json,
        prediction_date=prediction_date,
        model_id=model_def.model_id,
        model_name=model_def.name,
    )


def dlt_generate_ai_prediction(
    model: Any,
    prompt_template: str,
    target_period: str,
    prediction_date: str,
    model_def: Any,
    history_context: list[dict[str, Any]],
) -> dict[str, Any]:
    prompt = build_prediction_prompt(prompt_template, target_period, prediction_date, model_def, history_context)
    raw_prediction = model.predict(prompt)
    finalized = dlt_ai.finalize_prediction(raw_prediction, model_def, prediction_date, target_period)

    if not dlt_ai.validate_prediction(finalized):
        raise ValueError(f"模型 {model_def.model_id} 输出结构校验失败")

    return finalized


def make_prediction_date(target_draw_date: str | None) -> str:
    if not target_draw_date:
        return datetime.now().strftime("%Y-%m-%d")
    dt = datetime.strptime(target_draw_date, "%Y-%m-%d")
    return (dt - timedelta(days=1)).strftime("%Y-%m-%d")


def main() -> None:
    args = parse_args()
    registry = load_model_registry(args.config)
    model_ids = parse_csv(args.models)
    include_tags = parse_csv(args.include_tags)
    model_definitions = registry.select(model_ids=model_ids or None, include_tags=include_tags)

    history_path = Path(args.history_file)
    output_path = Path(args.output_file)
    prompt_path = Path(args.prompt_file)

    history_data = load_json(history_path)
    period_map = build_period_map(history_data)

    prompt_template = prompt_path.read_text(encoding="utf-8")

    if output_path.exists():
        output_data = load_json(output_path)
        if not isinstance(output_data, dict):
            raise ValueError("output-file 格式错误: 顶层必须是对象")
    else:
        output_data = {
            "历史预测记录": "本文件保存已开奖期号的大乐透 AI 预测数据，用于对比和统计",
            "predictions_history": [],
        }

    history_records = output_data.setdefault("predictions_history", [])
    if not isinstance(history_records, list):
        raise ValueError("output-file 格式错误: predictions_history 必须为数组")

    existing_by_period = {
        str(item.get("target_period")): item
        for item in history_records
        if isinstance(item, dict) and item.get("target_period")
    }

    start_period = int(args.start_period)
    end_period = int(args.end_period)
    if start_period > end_period:
        raise ValueError("start-period 不能大于 end-period")

    sorted_periods_desc = sorted((int(p), p) for p in period_map.keys())
    all_period_ints = {x[0] for x in sorted_periods_desc}

    factory = ModelFactory()
    model_instances = {}
    for model_def in model_definitions:
        try:
            model = factory.create(model_def)
        except Exception as exc:
            print(f"[跳过] 模型 {model_def.model_id} 初始化失败: {exc}")
            continue

        if not args.no_health_check:
            ok, message = model.health_check()
            if not ok:
                print(f"[跳过] 模型 {model_def.model_id} 健康检查失败: {message}")
                continue
            print(f"[通过] 模型 {model_def.model_id} 健康检查")
        model_instances[model_def.model_id] = model

    for period_int in range(start_period, end_period + 1):
        target_period = str(period_int)
        if period_int not in all_period_ints:
            print(f"[跳过] 目标期 {target_period} 不在历史开奖数据中")
            continue

        actual_result = period_map[target_period]
        prediction_date = make_prediction_date(actual_result.get("date"))

        candidate_periods = [
            p_str
            for p_int, p_str in sorted(sorted_periods_desc, reverse=True)
            if p_int < period_int
        ]
        history_context = [period_map[p] for p in candidate_periods[: args.context_size]]
        if not history_context:
            print(f"[跳过] 目标期 {target_period} 缺少可用历史上下文")
            continue

        record = existing_by_period.get(target_period)
        if record is None:
            record = {
                "prediction_date": prediction_date,
                "target_period": target_period,
                "actual_result": actual_result,
                "models": [],
            }
            existing_by_period[target_period] = record
            history_records.append(record)

        record["prediction_date"] = prediction_date
        record["actual_result"] = actual_result
        model_map = {
            m.get("model_id"): m
            for m in record.get("models", [])
            if isinstance(m, dict) and m.get("model_id")
        }

        for model_def in model_definitions:
            if model_def.model_id not in model_instances:
                print(f"[跳过] {target_period} / {model_def.model_id} 模型不可用")
                continue
            if model_def.model_id in model_map and not args.force:
                print(f"[跳过] {target_period} / {model_def.model_id} 已存在（未启用 --force）")
                continue

            model = model_instances[model_def.model_id]
            print(f"[执行] 目标期 {target_period} / 模型 {model_def.model_id}")
            prediction = dlt_generate_ai_prediction(
                model=model,
                prompt_template=prompt_template,
                target_period=target_period,
                prediction_date=prediction_date,
                model_def=model_def,
                history_context=history_context,
            )

            best_group = 1
            best_hit_count = -1
            for item in prediction["predictions"]:
                hit_result = dlt_ai.calculate_hit_result(item, actual_result)
                item["hit_result"] = hit_result
                if hit_result["total_hits"] > best_hit_count:
                    best_hit_count = hit_result["total_hits"]
                    best_group = item["group_id"]

            model_entry = {
                "model_id": model_def.model_id,
                "model_name": model_def.name,
                "model_provider": model_def.provider,
                "model_version": model_def.version,
                "model_tags": model_def.tags,
                "model_api_model": model_def.api_model,
                "predictions": prediction["predictions"],
                "best_group": best_group,
                "best_hit_count": best_hit_count,
            }
            model_map[model_def.model_id] = model_entry
            time.sleep(5)

        record["models"] = sorted(
            model_map.values(),
            key=lambda x: x.get("model_id", ""),
        )

    output_data["predictions_history"] = sorted(
        existing_by_period.values(),
        key=lambda x: int(x.get("target_period", 0)),
        reverse=True,
    )

    save_json(output_path, output_data)
    print(f"已保存: {output_path}")


if __name__ == "__main__":
    main()
