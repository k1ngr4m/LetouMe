from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes import router
from app.config import load_settings
from app.db.connection import ensure_schema


def create_app() -> FastAPI:
    settings = load_settings()
    app = FastAPI(title="LetouMe API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[origin.strip() for origin in settings.frontend_origin.split(",") if origin.strip()],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.include_router(router)

    @app.on_event("startup")
    def on_startup() -> None:
        ensure_schema()


    @app.get("/")
    def read_root() -> dict[str, str]:
        return {
            "service": "LetouMe API",
            "frontend_origin": settings.frontend_origin,
            "docs": "/docs",
        }

    return app


app = create_app()
