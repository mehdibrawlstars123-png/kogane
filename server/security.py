"""
Пароли, секретный код и токены сессий.

Пароли хранятся в виде PBKDF2-HMAC-SHA256 с индивидуальной солью —
без сторонних зависимостей и без обратимости.
"""

import hashlib
import hmac
import os
import secrets
import time

ITERATIONS = 200_000


def hash_secret(secret: str) -> str:
    """Возвращает строку вида pbkdf2$итерации$соль$хеш."""
    salt = secrets.token_hex(16)
    digest = hashlib.pbkdf2_hmac("sha256", secret.encode("utf-8"), bytes.fromhex(salt), ITERATIONS)
    return f"pbkdf2${ITERATIONS}${salt}${digest.hex()}"


def verify_secret(secret: str, stored: str) -> bool:
    """Сравнение за постоянное время, чтобы не подбирать по задержке."""
    try:
        algo, iterations, salt, expected = stored.split("$")
        if algo != "pbkdf2":
            return False
        digest = hashlib.pbkdf2_hmac(
            "sha256", secret.encode("utf-8"), bytes.fromhex(salt), int(iterations)
        )
        return hmac.compare_digest(digest.hex(), expected)
    except Exception:
        return False


def new_token() -> str:
    return secrets.token_urlsafe(32)


def new_id(prefix: str = "x") -> str:
    return f"{prefix}-{int(time.time() * 1000):x}-{secrets.token_hex(3)}"


def now_ms() -> int:
    return int(time.time() * 1000)


DEFAULT_ADMIN_EMAIL = os.environ.get("ADMIN_EMAIL", "admin@kogane.jp")
DEFAULT_ADMIN_PASSWORD = os.environ.get("ADMIN_PASSWORD", "kogane")
DEFAULT_ADMIN_CODE = os.environ.get("ADMIN_CODE", "KOGANE-19")
