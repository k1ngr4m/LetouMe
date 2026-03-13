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

项目使用两套运行环境：

- `dev`：本地开发
- `prod`：生产部署

后端配置来源：

- 根目录 `.env`
  存放敏感配置，例如 AI API Key、MySQL 连接信息等
- 根目录 `.env.dev`
  本地开发覆盖项
- 根目录 `.env.prod`
  生产覆盖项

前端配置来源：

- `frontend/.env.development`
- `frontend/.env.production`

后端通过 `APP_ENV` 选择加载哪套覆盖配置：

```bash
APP_ENV=dev
APP_ENV=prod
```

说明：

- 运行时数据库已切换为 MySQL
- 可通过 `DATABASE_URL` 一次性配置连接，或使用 `MYSQL_HOST / MYSQL_PORT / MYSQL_USER / MYSQL_PASSWORD / MYSQL_DATABASE`
- `SQLITE_PATH` 仅用于一次性迁移旧的 SQLite 数据
- 模型 API Key、Base URL、APP Code 通过设置页写入 MySQL
- `dev` 默认允许 `http://localhost:5173`
- `prod` 默认按同域反向代理部署，公网示例地址为 `http://116.62.134.169`

## 启动

### 后端 API

```bash
APP_ENV=dev python -m uvicorn backend.app.main:app --host 0.0.0.0 --port 8000
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

## Dev / Prod 约定

### Dev

- 后端读取：`.env` + `.env.dev`
- 前端读取：`frontend/.env.development`
- 前端 API 地址：`http://localhost:8000`
- 允许来源：`http://localhost:5173`

### Prod

- 后端读取：`.env` + `.env.prod`
- 前端读取：`frontend/.env.production`
- 前端 API 地址：相对路径 `/api/...`
- 推荐由 Nginx 提供同域反向代理：
  - 页面入口：`http://116.62.134.169/`
  - `/api` 转发到 FastAPI `127.0.0.1:8000`

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

## 生产部署

推荐生产架构：

1. Vite 构建前端静态资源
2. FastAPI 仅监听服务器本机 `127.0.0.1:8000`
3. Nginx 对外提供页面并将 `/api` 反向代理到 FastAPI

### 1. 准备环境文件

根目录 `.env` 示例：

```env
AI_API_KEY=your-real-key
AI_BASE_URL=https://aihubmix.com/v1
APP_CODE=
MODELSCOPE_API_KEY=
MODELSCOPE_BASE_URL=https://api-inference.modelscope.cn/v1
DATABASE_URL=mysql+pymysql://root:password@127.0.0.1:3306/letoume?charset=utf8mb4
SQLITE_PATH=backend/letoume.db
```

根目录 `.env.prod`：

```env
API_HOST=127.0.0.1
API_PORT=8000
FRONTEND_ORIGIN=http://116.62.134.169
MYSQL_HOST=49.235.37.196
MYSQL_PORT=3306
MYSQL_USER=root
MYSQL_PASSWORD=your-real-password
MYSQL_DATABASE=letoume
```

前端生产配置已经在：

```text
frontend/.env.production
```

其中 `VITE_API_BASE_URL` 为空，表示浏览器直接使用同源 `/api/...`。

### 2. 构建前端

```bash
cd frontend
npm install
npm run build
```

构建产物在：

```text
frontend/dist
```

### 3. 启动后端

```bash
APP_ENV=prod python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

生产建议使用 `systemd`、`supervisor` 或其他进程守护方式运行。

也可以直接使用仓库内脚本：

macOS / Linux:

```bash
./start_prod.sh
```

Windows:

```bat
start_prod.bat
```

注意：上面的 `start_prod` 脚本现在会同时做两件事：

1. 构建前端生产包
2. 同时启动后端 API 和前端生产预览服务

脚本适合“单机生产预览 / 快速验收”，启动后访问：

```text
前端预览: http://116.62.134.169:4173
后端 API: http://116.62.134.169:8000
```

如果你要正式上线，仍然推荐下面的 Nginx 同域部署方式。

### SQLite 旧数据迁移到 MySQL

先确认目标 MySQL 库是空的，再执行：

```bash
APP_ENV=prod python -m backend.scripts.migrate_sqlite_to_mysql --sqlite-path backend/letoume.db
```

如果不传 `--sqlite-path`，脚本会读取 `.env` / `.env.prod` 中的 `SQLITE_PATH`。

### 4. 配置 Nginx（正式推荐）

示例：

```nginx
server {
    listen 80;
    server_name 116.62.134.169;

    root /path/to/LetouMe/frontend/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 5. 宝塔面板部署

推荐在宝塔中拆成两部分：

1. `网站`
   - 用于托管前端静态文件 `frontend/dist`
   - 对外提供页面入口 `/`
   - 通过 Nginx 将 `/api/` 反向代理到 FastAPI
2. `Python 项目`
   - 仅用于启动 FastAPI
   - 仅监听本机 `127.0.0.1:8000`

推荐目录：

```text
/www/wwwroot/LetouMe
```

#### 宝塔 Python 项目填写示例

- 项目名称：`LetouMe`
- 项目路径：`/www/wwwroot/LetouMe`
- 启动方式：`命令行启动`
- 启动用户：`www`
- 启动命令：

```bash
APP_ENV=prod /www/wwwroot/LetouMe/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

如果宝塔要求把环境变量单独填写，则：

- 环境变量：`APP_ENV=prod`
- 启动命令：

```bash
/www/wwwroot/LetouMe/.venv/bin/python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

#### 宝塔网站填写示例

- 站点域名：可以先直接填写服务器 IP，例如 `49.235.37.196`
- 网站根目录：`/www/wwwroot/LetouMe/frontend/dist`
- 运行环境：`纯静态`

站点 Nginx 配置可直接参考：

```text
deploy/baota_nginx.conf
```

生产环境变量建议：

```env
API_HOST=127.0.0.1
API_PORT=8000
FRONTEND_ORIGIN=http://49.235.37.196
MYSQL_HOST=49.235.37.196
MYSQL_PORT=3306
MYSQL_USER=letoume
MYSQL_PASSWORD=your-real-password
MYSQL_DATABASE=letoume
```

前端生产配置：

- `frontend/.env.production` 中保持 `VITE_API_BASE_URL` 为空
- 浏览器会直接请求同源 `/api/...`

部署步骤：

```bash
cd /www/wwwroot/LetouMe/frontend
npm install
npm run build
```

然后在宝塔中：

1. 启动 `Python 项目`
2. 重载 `Nginx`
3. 访问 `http://49.235.37.196/`

排查顺序：

1. 先看宝塔 Python 项目日志，确认 FastAPI 已监听 `127.0.0.1:8000`
2. 再看站点 Nginx 日志，确认 `/api/` 已反向代理到后端
3. 若页面能打开但没有数据，优先检查 `.env.prod` 与数据库权限

### 6. 生产如何使用

- 浏览器访问：

```text
http://116.62.134.169/
```

- 前端会请求同源 `/api/...`
- 不要再把生产前端指向 `http://localhost:8000`
- 在这个部署方式下，不会再出现 `5173 -> localhost:8000` 的浏览器跨域问题

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
