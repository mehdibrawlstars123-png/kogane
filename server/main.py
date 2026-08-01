"""
Система Коганэ — сервер.

Отдаёт статический интерфейс и API. База создаётся и наполняется
при старте: на Railway это PostgreSQL из DATABASE_URL, локально — SQLite.
"""

import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .db import Base, engine, SessionLocal, URL, IS_SQLITE, ensure_columns, deployed
from .seed import seed
from .api import router as api_router
from .admin_api import router as admin_router

ROOT = Path(__file__).resolve().parent.parent

app = FastAPI(title="Kogane System", docs_url="/api/docs", redoc_url=None)

# Интерфейс и API живут на одном домене, но CORS не мешает
# открыть страницу с другого адреса при разработке.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(api_router)
app.include_router(admin_router)


@app.on_event("startup")
def startup() -> None:
    Base.metadata.create_all(engine)
    ensure_columns()          # колонки, появившиеся после первого запуска
    session = SessionLocal()
    try:
        seed(session)
    finally:
        session.close()

    # Только латиница: консоль Windows не всегда принимает кириллицу
    kind = "SQLite (local file)" if IS_SQLITE else "PostgreSQL"
    print(f"[kogane] database: {kind}", flush=True)


@app.middleware("http")
async def no_stale_files(request, call_next):
    """
    Браузер обязан спросить сервер, изменился ли файл.

    Сборщика нет: если отдать старый модуль из кеша вместе с новой разметкой,
    интерфейс ведёт себя необъяснимо. Файлы маленькие, ответ 304 почти
    ничего не стоит.
    """
    response = await call_next(request)
    if not request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-cache")
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
    return response


@app.get("/api/health")
def health():
    """Проверка живости для Railway."""
    return {
        "ok": True,
        "database": "sqlite" if IS_SQLITE else "postgresql",
        # true — данные не переживут следующего развёртывания
        "ephemeral": bool(IS_SQLITE and deployed()),
    }


# ==================== Статический интерфейс ====================

for folder in ("css", "js", "assets", "pages"):
    path = ROOT / folder
    if path.exists():
        app.mount(f"/{folder}", StaticFiles(directory=path), name=folder)


def send(name: str, status: int = 200):
    path = ROOT / name
    if not path.exists():
        return JSONResponse({"detail": "Файл не найден"}, status_code=404)
    return FileResponse(path, status_code=status, headers={"Cache-Control": "no-cache"})


@app.get("/")
def index():
    return send("index.html")


@app.get("/index.html")
def index_html():
    return send("index.html")


@app.get("/diag.html")
def diag():
    return send("diag.html")


@app.get("/404.html")
def not_found_page():
    return send("404.html")


@app.get("/favicon.ico")
def favicon():
    return send("assets/icons/favicon.svg")


@app.exception_handler(404)
def spa_fallback(request, exc):
    """Несуществующие адреса получают оформленную страницу «сигнал потерян»."""
    if request.url.path.startswith("/api/"):
        return JSONResponse({"detail": "Адрес не найден"}, status_code=404)
    # Оформленная страница, но код ответа честный: адреса не существует
    return send("404.html", status=404)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.main:app",
        host="0.0.0.0",
        port=int(os.environ.get("PORT", 8000)),
        reload=bool(os.environ.get("DEV")),
    )
