"""
API системы Коганэ.

Правило разделения: всё, что меняет состояние игры, делает сервер.
Клиент только показывает данные и отправляет намерения.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from pydantic import BaseModel, Field
from sqlalchemy import select, delete
from sqlalchemy.orm import Session as OrmSession

from .db import get_session, IS_SQLITE, deployed
from .models import (
    User, Npc, ShopRule, BaseRule, RuleHistory, Notification, LogEntry, Setting, Session as UserSession,
)
from .security import hash_secret, verify_secret, new_token, new_id, now_ms
from .seed import DEMO_ROSTER

router = APIRouter(prefix="/api")

COLONY_NAMES = {
    "tokyo1": "Первая токийская", "tokyo2": "Вторая токийская", "sendai": "Сендай",
    "sakura": "Сакурадзима", "hokkaido": "Хоккайдо", "kobe": "Кобе",
    "kyoto": "Киото", "fukuoka": "Фукуока", "okinawa": "Окинава", "tottori": "Тоттори",
}

LEVEL_NAMES = {
    "g4": "Четвёртый уровень", "g3": "Третий уровень", "g2": "Второй уровень",
    "g2s": "Полу-второй уровень", "g1s": "Предпервый уровень",
    "g1": "Первый уровень", "gs": "Особый уровень",
}


STATUS_NAMES = {
    "active": "В игре", "pending": "Ожидает", "out": "Вне барьера",
    "dead": "Погиб", "frozen": "Неактивен",
}


def check(value: str, allowed: dict, what: str) -> str:
    """
    Сверяет значение со справочником.

    В интерфейсе это выпадающие списки, но запрос можно отправить и мимо него —
    тогда в базе осело бы значение, которого нет в справочнике, и участник
    навсегда показывался бы с чужим уровнем.
    """
    if value not in allowed:
        raise HTTPException(422, f"Неизвестное значение поля «{what}»: {value}")
    return value


# ==================== Служебное ====================

def setting(session: OrmSession, key: str) -> dict:
    row = session.get(Setting, key)
    return dict(row.value) if row else {}


def save_setting(session: OrmSession, key: str, value: dict) -> None:
    row = session.get(Setting, key)
    if row:
        row.value = value
        # JSON-поле меняется целиком, иначе SQLAlchemy не заметит правку
        session.merge(row)
    else:
        session.add(Setting(key=key, value=value))


def add_log(session: OrmSession, actor: str, action: str, text: str, level: str = "info") -> None:
    session.add(LogEntry(id=new_id("lg"), ts=now_ms(), actor=actor, action=action, text=text, level=level))

    # Держим журнал в разумных размерах
    total = session.scalar(select(LogEntry.id).order_by(LogEntry.ts.desc()).offset(500).limit(1))
    if total:
        old = session.scalars(select(LogEntry).order_by(LogEntry.ts.desc()).offset(500)).all()
        for entry in old:
            session.delete(entry)


def notify(session: OrmSession, kind: str, title: str, text: str, target: str = "all") -> Notification:
    item = Notification(
        id=new_id("nt"), ts=now_ms(), type=kind, title=title, text=text, target=target, read=[],
    )
    session.add(item)
    return item


def current_user(session: OrmSession, authorization: Optional[str]) -> Optional[User]:
    if not authorization or not authorization.lower().startswith("bearer "):
        return None
    token = authorization[7:].strip()
    row = session.get(UserSession, token)
    if not row:
        return None
    return session.get(User, row.user_id)


def auth_dep(
    authorization: Optional[str] = Header(default=None),
    session: OrmSession = Depends(get_session),
):
    return current_user(session, authorization), session


def require_user(data=Depends(auth_dep)) -> tuple:
    user, session = data
    if not user:
        raise HTTPException(401, "Требуется вход в систему")
    return user, session


def require_admin(data=Depends(auth_dep)) -> tuple:
    user, session = data
    if not user or user.role != "admin":
        raise HTTPException(403, "Доступ только для распорядителя игры")
    return user, session


def participants(session: OrmSession) -> list:
    """Единый реестр: одобренные игроки и демонстрационные записи."""
    out = []

    users = session.scalars(
        select(User).where(User.state == "approved", User.role != "admin")
    ).all()

    for u in users:
        c = u.character or {}
        out.append({
            "id": u.id, "userId": u.id, "isNpc": False,
            "name": c.get("name") or u.email,
            "nameJp": c.get("nameJp", ""),
            "level": c.get("level", "g4"),
            "points": c.get("points", 0),
            "rules": c.get("rules", 0),
            "colony": c.get("colony", "tokyo1"),
            "status": c.get("status", "active"),
            "application": u.application,
            "ownedRules": u.owned_rules or [],
        })

    for n in session.scalars(select(Npc)).all():
        out.append(n.public())

    return out


def build_state(session: OrmSession, user: Optional[User]) -> dict:
    """Снимок состояния для интерфейса. Состав зависит от роли."""
    is_admin = bool(user and user.role == "admin")

    security = setting(session, "security")
    state = {
        "auth": user.public(full=True) if user else None,
        "migration": setting(session, "migration"),
        "security": {"codeChanged": bool(security.get("codeChanged"))},
        # Ивент виден всем, включая экран входа: оформление меняется у каждого
        "event": setting(session, "event") or {"id": None},
        "eventMusic": setting(session, "event_music"),
        "baseRules": [r.public() for r in session.scalars(
            select(BaseRule).order_by(BaseRule.sort)).all()],
        "shopRules": [], "ruleHistory": [], "participants": [],
        "notifications": [], "users": [], "logs": [],
    }

    if not user:
        return state

    state["shopRules"] = [r.public() for r in session.scalars(
        select(ShopRule).order_by(ShopRule.sort, ShopRule.code)).all()]
    state["ruleHistory"] = [r.public() for r in session.scalars(
        select(RuleHistory).order_by(RuleHistory.ts.desc()).limit(200)).all()]
    state["participants"] = participants(session)

    notes = session.scalars(select(Notification).order_by(Notification.ts.desc()).limit(300)).all()
    state["notifications"] = [
        n.public() for n in notes if n.target == "all" or n.target == user.id or is_admin
    ]

    if is_admin:
        # Распорядителю видно, где на самом деле лежат данные: на Railway это
        # PostgreSQL, локально — файл SQLite. Плитка «Хранилище» берёт значение
        # отсюда, а не пишет PostgreSQL вслепую.
        state["storage"] = "SQLite (локально)" if IS_SQLITE else "PostgreSQL"
        # Сайт выложен, а база временная — аккаунты сотрутся при обновлении
        state["storageTemporary"] = bool(IS_SQLITE and deployed())
        state["users"] = [u.public(full=True) for u in session.scalars(select(User)).all()]
        state["admins"] = [u.public(full=True) for u in session.scalars(
            select(User).where(User.role == "admin").order_by(User.created_at)).all()]
        state["logs"] = [l.public() for l in session.scalars(
            select(LogEntry).order_by(LogEntry.ts.desc()).limit(300)).all()]
        # Демо-записи считать отдельно не нужно: они уже лежат
        # в participants с признаком isNpc, панель берёт их оттуда.
    else:
        state["users"] = [user.public(full=True)]

    return state


def find_participant(session: OrmSession, pid: str):
    """Возвращает (объект, признак NPC). Работает и для игрока, и для записи реестра."""
    npc = session.get(Npc, pid)
    if npc:
        return npc, True
    user = session.get(User, pid)
    if user:
        return user, False
    raise HTTPException(404, "Участник не найден")


def char_of(target, is_npc: bool) -> dict:
    if is_npc:
        return {
            "name": target.name, "level": target.level, "points": target.points or 0,
            "rules": target.rules or 0, "colony": target.colony, "status": target.status,
        }
    return dict(target.character or {})


def apply_char(target, is_npc: bool, patch: dict) -> None:
    if is_npc:
        for key in ("level", "points", "rules", "colony", "status"):
            if key in patch:
                setattr(target, key, patch[key])
        return
    char = dict(target.character or {})
    char.update(patch)
    target.character = char


# ==================== Схемы запросов ====================

class Credentials(BaseModel):
    email: str = ""
    password: str = ""


class AdminCredentials(Credentials):
    code: str = ""


class ApplicationIn(BaseModel):
    data: dict


class ApproveIn(BaseModel):
    level: str = "g4"
    colony: str = "tokyo1"
    points: int = 0


class RejectIn(BaseModel):
    reason: str = ""


class PatchParticipant(BaseModel):
    level: Optional[str] = None
    colony: Optional[str] = None
    status: Optional[str] = None
    rules: Optional[int] = None
    points: Optional[int] = None


class PointsIn(BaseModel):
    delta: Optional[int] = None
    value: Optional[int] = None
    reason: str = "решение распорядителя"


class RuleGrant(BaseModel):
    ruleId: str
    free: bool = True


class MassIn(BaseModel):
    scope: str = "all"          # all | alive | c:<colony>
    action: str                 # add | sub | kill | revive
    amount: int = 0


class ShopRuleIn(BaseModel):
    code: str = ""
    title: str
    jp: str = ""
    text: str = ""
    cost: int = 100
    cat: str = "Особые"
    enabled: bool = True


class NoticeIn(BaseModel):
    type: str = "broadcast"
    title: str = ""
    text: str = ""
    target: str = "all"


class BroadcastIn(BaseModel):
    scope: str = "all"
    title: str = "Сообщение системы"
    text: str = ""


class MigrationIn(BaseModel):
    note: str = ""


class EventIn(BaseModel):
    id: str


class EventMusicIn(BaseModel):
    id: str
    kind: str = "synth"      # youtube | file | synth
    url: str = ""


class AdminIn(BaseModel):
    email: str
    password: str
    code: str
    name: str = ""


class AdminPatch(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None
    code: Optional[str] = None


class SecurityIn(BaseModel):
    code: Optional[str] = None
    password: Optional[str] = None


class BuyIn(BaseModel):
    ruleId: str


# ==================== Вход и регистрация ====================

def issue_token(session: OrmSession, user: User) -> str:
    token = new_token()
    session.add(UserSession(token=token, user_id=user.id, created_at=now_ms()))
    return token


@router.post("/auth/register")
def register(body: Credentials, session: OrmSession = Depends(get_session)):
    email = body.email.strip()
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(400, "Адрес почты не распознан системой")
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль короче шести символов")
    if session.scalar(select(User).where(User.email.ilike(email))):
        raise HTTPException(409, "Этот адрес уже зарегистрирован в барьере")

    user = User(
        id=new_id("u"), email=email, pass_hash=hash_secret(body.password),
        role="player", state="registered", created_at=now_ms(), owned_rules=[],
    )
    session.add(user)
    add_log(session, email, "register", "Новая регистрация в системе.")
    token = issue_token(session, user)
    session.commit()
    return {"token": token, "user": user.public(full=True)}


@router.post("/auth/login")
def login(body: Credentials, session: OrmSession = Depends(get_session)):
    user = session.scalar(select(User).where(User.email.ilike(body.email.strip())))
    if not user or not verify_secret(body.password, user.pass_hash):
        raise HTTPException(401, "Неверная почта или пароль")

    if user.role == "admin":
        add_log(session, body.email, "login-denied",
                "Попытка входа распорядителя через канал участника.", "warn")
        session.commit()
        raise HTTPException(403, "Эта учётная запись входит только через канал администрации")

    token = issue_token(session, user)
    add_log(session, user.email, "login", "Вход в систему.")
    session.commit()
    return {"token": token, "user": user.public(full=True)}


@router.post("/auth/admin")
def login_admin(body: AdminCredentials, session: OrmSession = Depends(get_session)):
    security = setting(session, "security")
    user = session.scalar(select(User).where(User.email.ilike(body.email.strip())))

    # Код проверяется первым и по той записи, чью почту ввели: у каждого
    # распорядителя он свой. Общий код системы принимается только у записей
    # без личного — так старая учётная запись продолжает работать.
    expected = (user.code_hash if user and user.code_hash else security.get("codeHash", ""))
    if not verify_secret(body.code, expected):
        add_log(session, body.email or "—", "code-denied",
                "Неверный секретный код администрации.", "danger")
        session.commit()
        raise HTTPException(403, "Секретный код отклонён системой")

    if not user or user.role != "admin" or not verify_secret(body.password, user.pass_hash):
        add_log(session, body.email or "—", "login-denied", "Отказ входа в администрацию.", "warn")
        session.commit()
        raise HTTPException(401, "Неверная почта или пароль распорядителя")

    token = issue_token(session, user)
    add_log(session, user.email, "login-admin", "Вход распорядителя подтверждён кодом.")
    session.commit()
    return {"token": token, "user": user.public(full=True)}


@router.post("/auth/logout")
def logout(authorization: Optional[str] = Header(default=None),
           session: OrmSession = Depends(get_session)):
    if authorization and authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
        row = session.get(UserSession, token)
        if row:
            user = session.get(User, row.user_id)
            if user:
                add_log(session, user.email, "logout", "Выход из системы.")
            session.delete(row)
            session.commit()
    return {"ok": True}


@router.get("/state")
def get_state(data=Depends(auth_dep)):
    user, session = data
    return build_state(session, user)


# ==================== Участник ====================

@router.post("/application")
def submit_application(body: ApplicationIn, data=Depends(require_user)):
    user, session = data
    if user.state == "approved":
        raise HTTPException(409, "Анкета уже одобрена")

    # Анкета приходит свободным набором полей — их состав задаётся в интерфейсе
    # (APPLICATION_SCHEMA). Здесь ограничивается только размер и уровень:
    # без этого можно было бы отправить мегабайты текста, и они попадали бы
    # распорядителю в каждом ответе /api/state.
    payload = {}
    for key, value in list(dict(body.data).items())[:24]:
        if isinstance(value, str):
            payload[str(key)[:40]] = value[:2000]
        elif isinstance(value, (int, float, bool)) or value is None:
            payload[str(key)[:40]] = value

    if payload.get("level"):
        check(payload["level"], LEVEL_NAMES, "уровень")

    payload["submittedAt"] = now_ms()
    user.application = payload
    user.state = "applied"
    add_log(session, user.email, "application",
            f"Анкета «{payload.get('name', '')}» отправлена на рассмотрение.")
    session.commit()
    return {"user": user.public(full=True)}


@router.post("/shop/buy")
def buy_rule(body: BuyIn, data=Depends(require_user)):
    user, session = data
    if user.state != "approved":
        raise HTTPException(403, "Доступ к магазину только у одобренных участников")

    rule = session.get(ShopRule, body.ruleId)
    if not rule or rule.enabled is False:
        raise HTTPException(404, "Правило недоступно")

    owned = list(user.owned_rules or [])
    if rule.id in owned:
        raise HTTPException(409, "Правило уже установлено")

    char = dict(user.character or {})
    points = int(char.get("points", 0))
    if points < rule.cost:
        raise HTTPException(400, f"Недостаточно очков: требуется {rule.cost}")

    left = points - rule.cost
    char["points"] = left
    char["rules"] = int(char.get("rules", 0)) + 1
    user.character = char
    owned.append(rule.id)
    user.owned_rules = owned

    session.add(RuleHistory(
        id=new_id("rh"), ts=now_ms(), type="add", title=rule.title, jp=rule.jp,
        by=char.get("name", user.email), colony=char.get("colony"), rule_id=rule.id,
    ))
    notify(session, "purchase", "Правило установлено",
           f"«{rule.title}» внесено в свод правил. Списано {rule.cost} очков. Остаток: {left}.",
           user.id)
    add_log(session, char.get("name", user.email), "purchase",
            f"Правило «{rule.title}» внесено в свод. Списано {rule.cost}.")
    session.commit()
    return {"ok": True, "points": left}


@router.post("/notifications/read")
def mark_read(data=Depends(require_user)):
    user, session = data
    notes = session.scalars(select(Notification)).all()
    for n in notes:
        if n.target in ("all", user.id):
            read = list(n.read or [])
            if user.id not in read:
                read.append(user.id)
                n.read = read
    session.commit()
    return {"ok": True}
