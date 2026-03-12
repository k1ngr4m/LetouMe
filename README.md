# LetouMe

LetouMe 是一个面向中国体彩超级大乐透的预测与展示项目，采用：

- `backend/`：FastAPI API、预测逻辑、抓取脚本、后端测试、后端文档
- `frontend/`：React + Vite + TypeScript 前端控制台

旧静态前端和旧 JSON 数据文件已经移除，数据库是唯一运行时数据源。

## 项目结构

- `backend/app/`
  FastAPI 后端，包含配置、数据库、repository、service、schema、api
- `backend/core/`
  模型注册表、模型工厂和 provider 适配层
- `backend/fetch_history/`
  历史开奖抓取脚本
- `backend/predict/`
  AI 预测生成脚本
- `backend/scripts/`
  后端维护脚本
- `backend/tests/`
  后端测试
- `backend/doc/`
  Prompt 和权重说明文档
- `frontend/`
  独立 React 前端

## 环境配置

项目通过根目录 `.env` 管理后端运行配置。

主要配置项：

```env
DB_PATH=letoume.db
API_HOST=0.0.0.0
API_PORT=8000
FRONTEND_ORIGIN=http://localhost:5173
```

说明：

- 默认数据库实际位置是 `backend/letoume.db`
- 如需自定义位置，可通过 `DB_PATH` 指定绝对路径
- 模型 API Key、Base URL、APP Code 通过设置页写入数据库

## 启动

### 后端 API

```bash
python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
```

### 前端

```bash
cd frontend
npm install
npm run dev
```

### 一键启动前后端

macOS / Linux:

```bash
./start_dev.sh
```

Windows:

```bat
start_dev.bat
```

启动后访问：

```text
前端: http://localhost:5173
后端 API: http://localhost:8000
```

## API

- `GET /api/lottery/history`
- `GET /api/predictions/current`
- `GET /api/predictions/history`
- `GET /api/settings/models`
- `GET /`
  返回 API 服务信息与当前允许的前端来源

## 主要脚本

### 抓取历史开奖

```bash
python backend/fetch_history/fetch_dlt_history.py
```

### 生成当期预测

```bash
python backend/predict/dlt_engine.py
```

### 重算历史预测

```bash
python backend/scripts/dlt_recalculate_history_predictions.py --start-period 26022 --end-period 26024
```

## 测试

后端：

```bash
python -m unittest discover -s backend/tests
```

前端：

```bash
cd frontend
npm run lint
npm run test
npm run build
```

## 文档

- [权重计算逻辑说明](backend/doc/WEIGHT_LOGIC.md)
- [大乐透预测 Prompt](backend/doc/dlt_prompt2.0.md)
