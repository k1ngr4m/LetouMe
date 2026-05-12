# LetouMe

[简体中文](README.zh-CN.md) | English

![Build Status](https://img.shields.io/badge/build-passing-brightgreen)
![License](https://img.shields.io/badge/license-MIT-blue)
![Version](https://img.shields.io/badge/version-0.1.0-orange)

LetouMe is an AI-powered lottery analytics platform for China lottery games, combining draw history, model predictions, expert strategies, backtesting, and bet tracking in one web app.

## Key Features

- **Multi-lottery data views**: Explore historical draws and trend data for Super Lotto, Pick 3, Pick 5, Seven Star Lottery, and more.
- **AI model predictions**: Manage model configurations, generate prediction records, and inspect current and historical prediction details.
- **Expert and smart strategies**: Run expert predictions, smart prediction jobs, staged workflows, and strategy history tracking.
- **Backtesting and simulated tickets**: Review prediction backtest summaries, create simulated tickets, quote combinations, and analyze outcomes.
- **Ticket OCR**: Recognize ticket images with Baidu OCR and turn them into structured personal bet records.
- **Admin-ready architecture**: Built with FastAPI, React/Vite, MySQL, RBAC permissions, and a settings console.

![LetouMe Demo](demo.png)

## Quick Start

### 1. Start the Backend

```bash
cp .env.example .env

# Install dependencies with your preferred Python workflow.
# Example with uv:
uv sync

uvicorn backend.app.main:app --reload --host 0.0.0.0 --port 8000
```

The API will be available at:

- API: `http://localhost:8000`
- Swagger Docs: `http://localhost:8000/docs`

### 2. Start the Frontend

```bash
cd frontend
cp .env.example .env
npm install
npm run dev
```

The web app will be available at:

- Frontend: `http://localhost:5173`

## Configuration

Copy `.env.example` to `.env` in the project root, and copy `frontend/.env.example` to `frontend/.env` for frontend configuration.

| Variable | Scope | Description | Default / Example |
| --- | --- | --- | --- |
| `DATABASE_URL` | Backend | MySQL SQLAlchemy-compatible connection URL. | `mysql+pymysql://root:password@127.0.0.1:3306/letoume?charset=utf8mb4` |
| `MYSQL_HOST` | Backend | MySQL host, used when `DATABASE_URL` is not provided. | `127.0.0.1` |
| `MYSQL_PORT` | Backend | MySQL port. | `3306` |
| `MYSQL_USER` | Backend | MySQL username. | `root` |
| `MYSQL_PASSWORD` | Backend | MySQL password. | `password` |
| `MYSQL_DATABASE` | Backend | MySQL database name. | `letoume` |
| `API_HOST` | Backend | FastAPI bind host. | `0.0.0.0` |
| `API_PORT` | Backend | FastAPI bind port. | `8000` |
| `FRONTEND_ORIGIN` | Backend | Allowed frontend origin for CORS. | `http://localhost:5173` |
| `APP_ENV` | Backend | Runtime environment name. | `dev` |
| `AUTH_BOOTSTRAP_ADMIN_USERNAME` | Backend | Initial admin username created at startup. | `letoume` |
| `AUTH_BOOTSTRAP_ADMIN_PASSWORD` | Backend | Initial admin password created at startup. | `letoume123` |
| `BAIDU_OCR_API_KEY` | Backend | Baidu OCR API key for ticket recognition. | `your-baidu-ocr-api-key` |
| `BAIDU_OCR_SECRET_KEY` | Backend | Baidu OCR secret key. | `your-baidu-ocr-secret-key` |
| `SMTP_*` | Backend | SMTP settings for password reset and email verification. | See `.env.example` |
| `VITE_API_BASE_URL` | Frontend | Backend API base URL consumed by the Vite app. | `http://localhost:8000` |

## Roadmap

- Add more strategy templates and model evaluation metrics.
- Improve visual reports for prediction accuracy and hit-rate trends.
- Provide Docker Compose and one-command deployment templates.

## Contributing

Contributions are welcome. You can open issues for bugs or ideas, submit pull requests for features and fixes, or improve prompts, strategies, tests, and documentation.

Before submitting a change, please run the relevant checks:

```bash
# Backend tests
pytest

# Frontend tests
cd frontend
npm run test
npm run lint
```

## Documentation

- [DLT Prediction Prompt](backend/doc/dlt_prompt2.0.md)
- [DLT DanTuo Prompt](backend/doc/dlt_dantuo_prompt.md)
- [Pick 3 Prediction Prompt](backend/doc/pl3_prompt.md)
- [Seven Star Lottery Prediction Prompt](backend/doc/qxc_prompt.md)

## License

MIT License.

If a `LICENSE` file is added to this repository, the full license text in that file should be considered authoritative.
