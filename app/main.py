from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from app.api.routes import router
from app.db.connection import ensure_schema


PROJECT_ROOT = Path(__file__).resolve().parent.parent
app = FastAPI(title="LetouMe API")
app.include_router(router)
app.mount("/template", StaticFiles(directory=PROJECT_ROOT / "template"), name="template")


@app.on_event("startup")
def on_startup() -> None:
    # ensure_schema()
    pass

@app.get("/")
def read_index() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "index.html")


@app.get("/index.html")
def read_index_html() -> FileResponse:
    return FileResponse(PROJECT_ROOT / "index.html")
