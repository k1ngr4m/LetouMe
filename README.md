# LetouMe

LetouMe 是一个面向中国体彩超级大乐透的预测与展示项目，包含历史开奖抓取、AI 预测生成、预测归档、FastAPI 接口和前端可视化页面。

当前运行架构：
- FastAPI 提供页面和 API
- 项目根目录 SQLite 作为运行时唯一数据源
- 旧 `data/*.json` 仅作为迁移输入和历史样本

## 核心能力

- 抓取大乐透历史开奖并写入数据库
- 基于历史数据和 Prompt 规则生成多模型 AI 预测
- 将已开奖期的旧预测归档，并计算命中结果
- 在前端展示当期预测、历史开奖、历史表现和组合汇总
- 根据历史表现对模型和号码汇总结果做加权展示

## 项目结构

- `app/`
  FastAPI 后端，包含配置、数据库、repository、service、schema、api
- `fetch_history/`
  历史开奖抓取脚本
- `predict/`
  AI 预测生成脚本
- `scripts/`
  数据迁移和历史预测重算脚本
- `template/`
  前端静态资源
- `doc/`
  预测 Prompt 和说明文档

## 运行架构

系统主流程：

1. 抓取脚本拉取历史开奖
2. 开奖数据写入规范化开奖表（`draw_issue`、`draw_result`、`draw_result_number`）
3. 预测脚本读取历史开奖并调用模型生成预测
4. 当期预测写入规范化预测表（`prediction_batch`、`prediction_model_run`、`prediction_group`）
5. 当期开奖后，旧预测归档并写入命中结果表（`prediction_hit_summary` 等）
6. 前端通过 FastAPI 的 `/api/*` 接口读取数据并渲染页面

## 环境配置

项目通过 `.env` 管理运行配置，`.env.example` 仅作为模板。

主要配置项：

```env
AI_API_KEY=your-api-key-here
AI_BASE_URL=https://aihubmix.com/v1

DB_PATH=letoume.db

API_HOST=0.0.0.0
API_PORT=8000
```

注意：
- 默认数据库文件位于项目根目录
- 如需自定义位置，可将 `DB_PATH` 改为绝对路径

## 安装与启动

### 1. 安装依赖

```bash
pip install -e .
```

如果不使用 editable install，也可以直接：

```bash
pip install fastapi uvicorn python-dotenv requests bs4 openai pydantic
```

### 2. 配置 `.env`

参考 `.env.example` 创建 `.env`，填入 AI 配置；数据库默认会写入项目根目录 `letoume.db`。

### 3. 首次迁移旧 JSON 到数据库

```bash
python scripts/migrate_json_to_db.py
```

### 4. 启动服务

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

启动后访问：

```text
http://localhost:8000
```

## API

### `GET /api/lottery/history`

返回历史开奖数据，包含：
- `last_updated`
- `data`
- `next_draw`

### `GET /api/predictions/current`

返回当前预测，包含：
- `prediction_date`
- `target_period`
- `models`

### `GET /api/predictions/history`

返回历史预测归档，包含：
- `predictions_history`

## 主要脚本

### 抓取历史开奖

```bash
python fetch_history/fetch_dlt_history.py
```

作用：
- 抓取大乐透历史开奖
- 标准化数据
- 写入开奖主表和号码明细表

### 生成当期预测

```bash
python predict/dlt_engine.py
```

作用：
- 读取最近开奖历史
- 调用模型生成 5 组预测
- 写入预测批次、模型运行、预测组和号码明细表
- 若旧预测已对应到已开奖期，则归档并写入命中摘要/命中号码表

### 迁移旧 JSON

```bash
python scripts/migrate_json_to_db.py
```

作用：
- 读取旧 `data/*.json`
- 转换为当前数据库结构
- 将旧数据导入规范化 SQLite 表结构

### 重算历史预测

```bash
python scripts/dlt_recalculate_history_predictions.py --start-period 26022 --end-period 26024
```

作用：
- 对指定期号区间批量重算历史预测
- 补充或覆盖归档预测及命中结果

## 权重计算逻辑

项目中的权重计算逻辑已单独整理到文档：

[权重计算逻辑说明](doc/WEIGHT_LOGIC.md)

该文档包含：
- AI 预测阶段的选号评分权重
- 前端展示阶段的模型历史评分
- 前端号码汇总的加权逻辑

## 数据与兼容说明

- 开奖号码、预测号码、模型主数据、命中结果都已拆分为关系表，不再依赖 `payload_json`
- API 为兼容现有前端，仍会在响应中聚合出 `models`、`predictions`、`actual_result` 等嵌套结构
- 输入侧新数据统一使用 `blue_balls`
- 旧 JSON 迁移时仍允许读取历史遗留的 `blue_ball`

## 注意事项

- 本项目中的权重和评分是启发式量化规则，不代表统计显著性证明
- AI 预测结果仅供参考，不构成任何投注建议
- 前端历史评分只反映最近窗口内的命中表现，不代表长期稳定性
- Prompt 中的权重用于约束模型生成，不等同于后端存在一套完全确定性的公式引擎

## 维护建议

- 如果修改 `doc/dlt_prompt2.0.md` 中的评分公式，应同步更新 `doc/WEIGHT_LOGIC.md`
- 如果修改 `template/js/dlt_app.js` 中的评分窗口或权重常量，应同步更新 `doc/WEIGHT_LOGIC.md`
- 如果未来把 Prompt 规则真正下沉为 Python 评分器，应在文档中明确“Prompt 规则”和“服务端实际计算规则”是否一致
