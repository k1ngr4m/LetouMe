# LetouMe

简体中文 | [English](README.md)

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-orange)

LetouMe 是一个面向中国彩票的 AI 预测、回测与投注管理平台，把开奖数据、模型预测、专家策略和投注记录整合到一个可运行的 Web 应用中。

## 核心特性

- **多彩种数据展示**：支持超级大乐透、排列三、排列五、七星彩等彩种的历史开奖与趋势数据。
- **AI 模型预测**：管理多模型配置，生成预测记录，并查看当前预测与历史详情。
- **专家与智能策略**：支持专家预测、智能预测任务、策略运行记录和分阶段结果追踪。
- **回测与模拟票据**：提供预测回测摘要、模拟票据创建、报价和结果分析。
- **投注记录 OCR**：通过百度 OCR 识别票据图片，沉淀个人投注记录。
- **完整管理能力**：内置 FastAPI 后端、React/Vite 前端、MySQL 存储、RBAC 权限和后台设置。

![LetouMe Demo](demo.png)

## 快速开始

### 1. 启动后端

```bash
cp .env.example .env

# 使用你偏好的 Python 工作流安装依赖。
# 例如使用 uv:
uv sync

uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

后端服务地址：

- API: `http://localhost:8000`
- Swagger 文档: `http://localhost:8000/docs`

### 2. 启动前端

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

前端访问地址：

- Frontend: `http://localhost:5173`


## 配置

复制根目录 `.env.example` 为 `.env`，并复制 `frontend/.env.example` 为 `frontend/.env`。

| 变量 | 作用域 | 说明 | 默认值 / 示例 |
| --- | --- | --- | --- |
| `DATABASE_URL` | 后端 | MySQL SQLAlchemy 兼容连接地址。 | `mysql+pymysql://root:password@127.0.0.1:3306/letoume?charset=utf8mb4` |
| `MYSQL_HOST` | 后端 | 未提供 `DATABASE_URL` 时使用的 MySQL 地址。 | `127.0.0.1` |
| `MYSQL_PORT` | 后端 | MySQL 端口。 | `3306` |
| `MYSQL_USER` | 后端 | MySQL 用户名。 | `root` |
| `MYSQL_PASSWORD` | 后端 | MySQL 密码。 | `password` |
| `MYSQL_DATABASE` | 后端 | MySQL 数据库名。 | `letoume` |
| `API_HOST` | 后端 | FastAPI 监听地址。 | `0.0.0.0` |
| `API_PORT` | 后端 | FastAPI 监听端口。 | `8000` |
| `FRONTEND_ORIGIN` | 后端 | 允许跨域访问的前端源。 | `http://localhost:5173` |
| `APP_ENV` | 后端 | 运行环境名称。 | `dev` |
| `AUTH_BOOTSTRAP_ADMIN_USERNAME` | 后端 | 启动时创建的初始管理员用户名。 | `letoume` |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | 后端 | 启动时创建的初始管理员密码。 | `letoume123` |
| `BAIDU_OCR_API_KEY` | 后端 | 百度 OCR API Key，用于票据识别。 | `your-baidu-ocr-api-key` |
| `BAIDU_OCR_SECRET_KEY` | 后端 | 百度 OCR Secret Key。 | `your-baidu-ocr-secret-key` |
| `SMTP_*` | 后端 | 用于密码重置和邮箱验证码的 SMTP 配置。 | 见 `.env.example` |
| `VITE_API_BASE_URL` | 前端 | Vite 前端访问的后端 API 地址。 | `http://localhost:8000` |

## Roadmap

- 增强更多策略模板和模型评估指标。
- 完善可视化报表与预测命中趋势分析。
- 提供 Docker Compose / 一键部署模板。

## 参与贡献

欢迎参与贡献。你可以提交 Issue 反馈问题或想法，也可以通过 Pull Request 改进功能、修复缺陷、完善 Prompt、策略、测试和文档。

提交变更前，建议运行相关检查：

```bash
# 后端测试
pytest

# 前端测试
cd frontend
npm run test
npm run lint
```

## 文档

- [大乐透预测 Prompt](backend/doc/dlt_prompt2.0.md)
- [大乐透胆拖 Prompt](backend/doc/dlt_dantuo_prompt.md)
- [排列三预测 Prompt](backend/doc/pl3_prompt.md)
- [七星彩预测 Prompt](backend/doc/qxc_prompt.md)

## License

MIT License.

如果仓库后续加入 `LICENSE` 文件，请以该文件中的完整协议文本为准。
