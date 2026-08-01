"""
Подключение к базе.

На Railway адрес приходит в переменной окружения DATABASE_URL.
Если её нет (локальная разработка) — используется файл SQLite,
чтобы проект можно было запустить и проверить без PostgreSQL.
"""

import os
from pathlib import Path

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base

BASE_DIR = Path(__file__).resolve().parent.parent


def database_url() -> str:
    url = os.environ.get("DATABASE_URL", "").strip()

    if not url:
        # Локальный запуск без PostgreSQL
        return f"sqlite:///{BASE_DIR / 'kogane.db'}"

    # Railway и Heroku отдают схему postgres://, SQLAlchemy ждёт postgresql://
    if url.startswith("postgres://"):
        url = url.replace("postgres://", "postgresql://", 1)

    # Драйвер psycopg 3
    if url.startswith("postgresql://"):
        url = url.replace("postgresql://", "postgresql+psycopg://", 1)

    return url


URL = database_url()
IS_SQLITE = URL.startswith("sqlite")

engine = create_engine(
    URL,
    echo=False,
    future=True,
    # SQLite в одном процессе с несколькими потоками
    connect_args={"check_same_thread": False} if IS_SQLITE else {},
    # Соединения PostgreSQL на Railway закрываются по простою
    pool_pre_ping=not IS_SQLITE,
    pool_recycle=280 if not IS_SQLITE else -1,
)

SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False, future=True)
Base = declarative_base()


def ensure_columns() -> None:
    """
    Досоздаёт колонки, появившиеся после первого запуска.

    create_all() умеет создавать недостающие таблицы, но не колонки:
    на Railway база уже существует, и без этого шага сервер падал бы
    на первом же запросе к новому полю.
    """
    from sqlalchemy import inspect, text

    added = []
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return

    have = {c["name"] for c in inspector.get_columns("users")}
    # Собственный секретный код распорядителя: у каждого свой
    if "code_hash" not in have:
        added.append("users.code_hash")
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN code_hash VARCHAR(255)"))

    if added:
        print(f"[kogane] columns added: {', '.join(added)}", flush=True)


def get_session():
    """Зависимость FastAPI: сессия на один запрос."""
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()
