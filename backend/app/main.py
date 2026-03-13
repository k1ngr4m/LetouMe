from __future__ import annotations

from time import perf_counter

from fastapi import FastAPI
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware

from backend.app.api.routes import router
from backend.app.auth import AuthService
from backend.app.config import load_settings
from backend.app.db.connection import ensure_schema
from backend.app.logging_utils import configure_logging, get_logger


def create_app() -> FastAPI:
    settings = load_settings()
    configure_logging(settings)
    logger = get_logger("api")
    app = FastAPI(title="LetouMe API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    @app.middleware("http")
    async def log_requests(request: Request, call_next):
        started_at = perf_counter()
        try:
            response = await call_next(request)
        except Exception as exc:
            logger.exception(
                "Unhandled request error",
                extra={
                    "context": {
                        "method": request.method,
                        "path": request.url.path,
                        "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                        "error": type(exc).__name__,
                    }
                },
            )
            raise

        logger.info(
            "Request completed",
            extra={
                "context": {
                    "method": request.method,
                    "path": request.url.path,
                    "status_code": response.status_code,
                    "duration_ms": round((perf_counter() - started_at) * 1000, 2),
                }
            },
        )
        return response

    @app.on_event("startup")
    def on_startup() -> None:
        ensure_schema()
        AuthService(settings=settings).ensure_bootstrap_admin()
        logger.info("Application startup complete", extra={"context": {"env": settings.app_env}})


    @app.get("/")
    def read_root() -> dict[str, str]:
        return {
            "service": "LetouMe API",
            "frontend_origin": settings.frontend_origin,
            "docs": "/docs",
        }

    return app


app = create_app()
