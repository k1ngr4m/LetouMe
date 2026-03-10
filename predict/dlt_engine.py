# -*- coding: utf-8 -*-
"""
大乐透 AI 预测自动生成脚本
自动调用 AI 模型生成下期预测数据
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Dict, List, Optional

# 尝试导入并加载 .env 文件
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


PROJECT_ROOT = Path(__file__).resolve().parent.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from core.model_config import ModelDefinition, load_model_registry
from core.model_factory import ModelFactory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
LOTTERY_HISTORY_FILE = os.path.join(PROJECT_ROOT, "data", "dlt_data.json")
AI_PREDICTIONS_FILE = os.path.join(PROJECT_ROOT, "data", "dlt_ai_predictions.json")
PREDICTIONS_HISTORY_FILE = os.path.join(PROJECT_ROOT, "data", "dlt_predictions_history.json")
PROMPT_FILE = os.path.join(PROJECT_ROOT, "doc", "dlt_prompt2.0.md")
MODEL_CONFIG_FILE = os.path.join(PROJECT_ROOT, "config", "models.json")


def load_prompt_template() -> str:
    with open(PROMPT_FILE, "r", encoding="utf-8") as f:
        return f.read()


def normalize_blue_balls(value: Any) -> List[str]:
    if isinstance(value, list):
        return sorted(str(item).zfill(2) for item in value)
    if isinstance(value, str) and value:
        return [str(value).zfill(2)]
    return []


def normalize_draw(draw: Dict[str, Any]) -> Dict[str, Any]:
    red_balls = sorted(str(item).zfill(2) for item in draw.get("red_balls", []))
    blue_balls = normalize_blue_balls(draw.get("blue_balls", draw.get("blue_ball")))
    return {
        **draw,
        "red_balls": red_balls,
        "blue_balls": blue_balls,
        "blue_ball": blue_balls[0] if blue_balls else None,
    }


def load_lottery_history() -> Dict[str, Any]:
    with open(LOTTERY_HISTORY_FILE, "r", encoding="utf-8") as f:
        data = json.load(f)

    return {
        **data,
        "data": [normalize_draw(draw) for draw in data.get("data", [])],
    }


def validate_prediction(prediction: Dict[str, Any]) -> bool:
    try:
        required_fields = ["prediction_date", "target_period", "model_id", "model_name", "predictions"]
        for field in required_fields:
            if field not in prediction:
                print(f"    ⚠️  缺少字段: {field}")
                return False

        if len(prediction["predictions"]) != 5:
            print(f"    ⚠️  预测组数量不正确: {len(prediction['predictions'])}")
            return False

        for group in prediction["predictions"]:
            red_balls = group.get("red_balls", [])
            blue_balls = group.get("blue_balls", group.get("blue_ball", []))
            if len(red_balls) != 5:
                print(f"    ⚠️  前区数量不正确: {len(red_balls)}")
                return False
            if red_balls != sorted(red_balls):
                print(f"    ⚠️  前区未排序: {red_balls}")
                return False

            normalized_blue = normalize_blue_balls(blue_balls)
            if len(normalized_blue) != 2:
                print(f"    ⚠️  后区数量不正确: {len(normalized_blue)}")
                return False
            if normalized_blue != sorted(normalized_blue):
                print(f"    ⚠️  后区未排序: {normalized_blue}")
                return False
        return True
    except Exception as e:
        print(f"    ⚠️  验证出错: {str(e)}")
        return False


def normalize_prediction(prediction: Dict[str, Any]) -> Dict[str, Any]:
    normalized_predictions = []
    for group in prediction.get("predictions", []):
        blue_balls = normalize_blue_balls(group.get("blue_balls", group.get("blue_ball")))
        normalized_predictions.append({
            **group,
            "red_balls": sorted(str(item).zfill(2) for item in group.get("red_balls", [])),
            "blue_balls": blue_balls,
            "blue_ball": blue_balls[0] if blue_balls else None,
        })

    return {
        **prediction,
        "predictions": normalized_predictions,
    }


def calculate_hit_result(prediction_group: Dict[str, Any], actual_result: Dict[str, Any]) -> Dict[str, Any]:
    red_hits = [b for b in prediction_group["red_balls"] if b in actual_result["red_balls"]]
    blue_hits = [b for b in prediction_group["blue_balls"] if b in actual_result["blue_balls"]]
    return {
        "red_hits": red_hits,
        "red_hit_count": len(red_hits),
        "blue_hits": blue_hits,
        "blue_hit_count": len(blue_hits),
        "total_hits": len(red_hits) + len(blue_hits),
    }


def archive_old_prediction(lottery_data: Dict[str, Any]) -> None:
    try:
        if not os.path.exists(AI_PREDICTIONS_FILE):
            print("  ℹ️  没有旧预测需要归档\n")
            return

        with open(AI_PREDICTIONS_FILE, "r", encoding="utf-8") as f:
            old_predictions = json.load(f)

        old_target_period = old_predictions.get("target_period")
        if not old_target_period:
            print("  ⚠️  旧预测文件格式异常，跳过归档\n")
            return

        latest_period = lottery_data.get("data", [{}])[0].get("period")
        if not latest_period or int(old_target_period) > int(latest_period):
            print(f"  ℹ️  旧预测期号 {old_target_period} 尚未开奖，无需归档\n")
            return

        actual_result: Optional[Dict[str, Any]] = None
        for draw in lottery_data.get("data", []):
            if draw.get("period") == old_target_period:
                actual_result = draw
                break

        if not actual_result:
            print(f"  ⚠️  找不到期号 {old_target_period} 的开奖结果，跳过归档\n")
            return

        history_data = {"历史预测记录": "本文件保存已开奖期号的大乐透 AI 预测数据，用于对比和统计", "predictions_history": []}
        if os.path.exists(PREDICTIONS_HISTORY_FILE):
            with open(PREDICTIONS_HISTORY_FILE, "r", encoding="utf-8") as f:
                history_data = json.load(f)

        existing_record = next((r for r in history_data["predictions_history"] if r["target_period"] == old_target_period), None)
        if existing_record:
            print(f"  ℹ️  期号 {old_target_period} 已存在于历史记录中\n")
            return

        models_with_hits = []
        for model_data in old_predictions.get("models", []):
            predictions_with_hits = []
            for pred_group in model_data.get("predictions", []):
                normalized_group = normalize_prediction({"predictions": [pred_group]}).get("predictions", [pred_group])[0]
                pred_with_hit = normalized_group.copy()
                pred_with_hit["hit_result"] = calculate_hit_result(normalized_group, actual_result)
                predictions_with_hits.append(pred_with_hit)

            best_pred = max(predictions_with_hits, key=lambda p: p["hit_result"]["total_hits"])
            models_with_hits.append({
                "model_id": model_data.get("model_id"),
                "model_name": model_data.get("model_name"),
                "model_provider": model_data.get("model_provider"),
                "model_version": model_data.get("model_version"),
                "model_tags": model_data.get("model_tags"),
                "model_api_model": model_data.get("model_api_model"),
                "predictions": predictions_with_hits,
                "best_group": best_pred["group_id"],
                "best_hit_count": best_pred["hit_result"]["total_hits"],
            })

        new_record = {
            "prediction_date": old_predictions.get("prediction_date"),
            "target_period": old_target_period,
            "actual_result": actual_result,
            "models": models_with_hits,
        }
        history_data["predictions_history"].insert(0, new_record)

        with open(PREDICTIONS_HISTORY_FILE, "w", encoding="utf-8") as f:
            json.dump(history_data, f, ensure_ascii=False, indent=2)

        print(f"  ✅ 已将期号 {old_target_period} 的预测归档到历史记录")
        print(f"  📊 归档模型数: {len(models_with_hits)}\n")
    except Exception as e:
        print(f"  ⚠️  归档旧预测时出错: {str(e)}")
        print("  继续生成新预测...\n")


def build_prediction_prompt(
    prompt_template: str,
    target_period: str,
    target_date: str,
    prediction_date: str,
    model_def: ModelDefinition,
    history_json: str,
) -> str:
    return prompt_template.format(
        target_period=target_period,
        target_date=target_date,
        lottery_history=history_json,
        prediction_date=prediction_date,
        model_id=model_def.model_id,
        model_name=model_def.name,
    )


def prepare_models(
    model_definitions: List[ModelDefinition],
    enable_health_check: bool = True,
) -> List[Any]:
    factory = ModelFactory()
    models = []
    for model_def in model_definitions:
        try:
            model = factory.create(model_def)
        except Exception as exc:
            print(f"  ✗ 跳过 {model_def.name}: {exc}")
            continue

        if enable_health_check:
            ok, message = model.health_check()
            if not ok:
                print(f"  ✗ 健康检查失败: {model_def.name} ({message})")
                continue
            print(f"  ✓ 健康检查通过: {model_def.name}")

        models.append(model)
    return models


def finalize_prediction(
    prediction: Dict[str, Any],
    model_def: ModelDefinition,
    prediction_date: str,
    target_period: str,
) -> Dict[str, Any]:
    normalized = normalize_prediction(prediction)
    normalized["prediction_date"] = prediction_date
    normalized["target_period"] = target_period
    normalized["model_id"] = model_def.model_id
    normalized["model_name"] = model_def.name
    normalized["model_provider"] = model_def.provider
    normalized["model_version"] = model_def.version
    normalized["model_tags"] = model_def.tags
    normalized["model_api_model"] = model_def.api_model
    return normalized


def generate_predictions() -> Optional[Dict[str, Any]]:
    print("\n" + "=" * 50)
    print("🤖 大乐透 AI 预测自动生成")
    print("=" * 50 + "\n")

    prompt_template = load_prompt_template()
    lottery_data = load_lottery_history()
    archive_old_prediction(lottery_data)

    next_draw = lottery_data.get("next_draw", {})
    target_period = next_draw.get("next_period", "")
    target_date = next_draw.get("next_date_display", "")
    if not target_period:
        print("❌ 无法获取下期期号信息")
        return None

    history_data = lottery_data.get("data", [])[:30]
    history_json = json.dumps(history_data, ensure_ascii=False, indent=2)
    prediction_date = datetime.now().strftime("%Y-%m-%d")

    print(f"🎯 目标期号: {target_period}")
    print(f"📅 开奖日期: {target_date}")
    print(f"📝 历史数据: 最近 {len(history_data)} 期")
    print(f"📅 预测日期: {prediction_date}\n")

    registry = load_model_registry(MODEL_CONFIG_FILE)
    model_definitions = registry.select()
    models = prepare_models(model_definitions, enable_health_check=True)

    all_predictions = []
    for model in models:
        model_def = model.definition
        try:
            prompt = build_prediction_prompt(
                prompt_template=prompt_template,
                target_period=target_period,
                target_date=target_date,
                prediction_date=prediction_date,
                model_def=model_def,
                history_json=history_json,
            )
            raw_prediction = model.predict(prompt)
            prediction = finalize_prediction(raw_prediction, model_def, prediction_date, target_period)
            if validate_prediction(prediction):
                all_predictions.append(prediction)
                print("  ✓ 验证通过\n")
            else:
                print("  ✗ 验证失败，跳过该模型\n")
        except Exception as e:
            print(f"  ✗ 处理 {model_def.name} 时失败: {str(e)}\n")
            continue

    if not all_predictions:
        print("❌ 没有成功生成任何预测")
        return None

    return {
        "prediction_date": prediction_date,
        "target_period": target_period,
        "models": all_predictions,
    }


def save_predictions(predictions: Dict[str, Any]) -> None:
    print("💾 保存预测数据...")
    if os.path.exists(AI_PREDICTIONS_FILE):
        with open(AI_PREDICTIONS_FILE, "r", encoding="utf-8") as f:
            existing_predictions = json.load(f)

        if existing_predictions.get("target_period") == predictions.get("target_period"):
            existing_models = existing_predictions.get("models", [])
            existing_model_map = {
                model.get("model_id"): model
                for model in existing_models
                if model.get("model_id")
            }

            for model in predictions.get("models", []):
                model_id = model.get("model_id")
                if model_id:
                    existing_model_map[model_id] = model
                else:
                    existing_models.append(model)

            merged_models = []
            seen_model_ids = set()
            for model in existing_models:
                model_id = model.get("model_id")
                if model_id and model_id in existing_model_map and model_id not in seen_model_ids:
                    merged_models.append(existing_model_map[model_id])
                    seen_model_ids.add(model_id)
                elif not model_id:
                    merged_models.append(model)

            for model in predictions.get("models", []):
                model_id = model.get("model_id")
                if model_id and model_id not in seen_model_ids:
                    merged_models.append(model)
                    seen_model_ids.add(model_id)

            predictions = {
                **existing_predictions,
                "prediction_date": predictions.get("prediction_date", existing_predictions.get("prediction_date")),
                "target_period": predictions.get("target_period", existing_predictions.get("target_period")),
                "models": merged_models,
            }
            print(f"  ✓ 同一期号 {predictions['target_period']}，已合并模型预测")
        else:
            backup_file = AI_PREDICTIONS_FILE.replace(".json", f"_backup_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json")
            with open(backup_file, "w", encoding="utf-8") as f:
                json.dump(existing_predictions, f, ensure_ascii=False, indent=2)
            print(f"  ✓ 已创建备份: {os.path.basename(backup_file)}")

    with open(AI_PREDICTIONS_FILE, "w", encoding="utf-8") as f:
        json.dump(predictions, f, ensure_ascii=False, indent=2)
    print(f"  ✓ 已保存到: {AI_PREDICTIONS_FILE}\n")


def main() -> None:
    predictions = generate_predictions()
    if predictions:
        save_predictions(predictions)
        print("=" * 50)
        print("🎉 大乐透预测生成完成！")
        print("=" * 50 + "\n")
        print("📋 预测摘要:")
        print(f"  期号: {predictions['target_period']}")
        print(f"  日期: {predictions['prediction_date']}")
        print(f"  模型数量: {len(predictions['models'])}")
        for model in predictions["models"]:
            print(f"    - {model['model_name']}")
    else:
        print("❌ 大乐透预测生成失败")


if __name__ == "__main__":
    main()
