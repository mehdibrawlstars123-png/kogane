"""
Таблицы системы Коганэ.

Время везде хранится числом миллисекунд (как Date.now() в браузере) —
интерфейс уже работает в этом формате, лишних преобразований не нужно.
"""

from sqlalchemy import Column, String, Integer, BigInteger, Boolean, Text, JSON

from .db import Base


class User(Base):
    __tablename__ = "users"

    id = Column(String(40), primary_key=True)
    email = Column(String(200), unique=True, nullable=False, index=True)
    pass_hash = Column(String(255), nullable=False)

    role = Column(String(20), default="player", nullable=False)      # player | admin

    # Личный секретный код распорядителя. У каждой учётной записи свой:
    # так вход в панель нельзя передать, назвав только почту и пароль.
    # Пусто — значит принимается общий код системы.
    code_hash = Column(String(255))
    state = Column(String(20), default="registered", nullable=False)  # registered|applied|approved|rejected

    created_at = Column(BigInteger, nullable=False)
    approved_at = Column(BigInteger)

    reject_reason = Column(Text)
    death_reason = Column(Text)
    dead_migration = Column(Integer)

    # Карточка мувсета из Roblox Workshop: картинка хранится строкой data:
    # прямо в базе. На Railway файловая система контейнера стирается при
    # каждом развёртывании, поэтому складывать картинки в файлы нельзя.
    card = Column(Text)

    total_points = Column(BigInteger, default=0)   # очки за всё время, между миграциями
    missed_streak = Column(Integer, default=0)     # пропущено миграций подряд
    joined_no = Column(Integer)                    # номер миграции, участие в которой подтвердил

    application = Column(JSON)     # анкета персонажа
    character = Column(JSON)       # имя, уровень, очки, колония, статус
    owned_rules = Column(JSON, default=list)

    def public(self, full: bool = False) -> dict:
        """Представление для интерфейса. full=True — для распорядителя."""
        data = {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "state": self.state,
            "createdAt": self.created_at,
            "approvedAt": self.approved_at,
            "rejectReason": self.reject_reason,
            "deathReason": self.death_reason,
            "deadMigration": self.dead_migration,
            "application": self.application,
            "character": self.character,
            "ownedRules": self.owned_rules or [],
            "card": self.card,
            "totalPoints": int(self.total_points or 0),
            "missedStreak": int(self.missed_streak or 0),
            "joinedNo": self.joined_no,
        }
        if self.role == "admin":
            data["name"] = (self.character or {}).get("name") or self.email
            data["ownCode"] = bool(self.code_hash)
        if not full:
            data.pop("rejectReason", None)
        return data


class Npc(Base):
    """Демонстрационные записи реестра (персонажи аниме)."""

    __tablename__ = "npcs"

    id = Column(String(40), primary_key=True)
    name = Column(String(120), nullable=False)
    name_jp = Column(String(60), default="")
    level = Column(String(10), default="g4")
    points = Column(Integer, default=0)
    rules = Column(Integer, default=0)
    colony = Column(String(30), default="tokyo1")
    status = Column(String(20), default="active")

    def public(self) -> dict:
        return {
            "id": self.id,
            "isNpc": True,
            "name": self.name,
            "nameJp": self.name_jp or "",
            "level": self.level,
            "points": self.points or 0,
            "rules": self.rules or 0,
            "colony": self.colony,
            "status": self.status,
        }


class ShopRule(Base):
    __tablename__ = "shop_rules"

    id = Column(String(40), primary_key=True)
    code = Column(String(20), default="")
    title = Column(String(200), nullable=False)
    jp = Column(String(60), default="")
    text = Column(Text, default="")
    cost = Column(Integer, default=100)
    cat = Column(String(60), default="Особые")
    enabled = Column(Boolean, default=True)
    sort = Column(Integer, default=0)

    def public(self) -> dict:
        return {
            "id": self.id, "code": self.code, "title": self.title, "jp": self.jp,
            "text": self.text, "cost": self.cost, "cat": self.cat, "enabled": self.enabled,
        }


class BaseRule(Base):
    """Базовый свод правил игры — не редактируется участниками."""

    __tablename__ = "base_rules"

    id = Column(String(10), primary_key=True)   # номер: 01…09
    title = Column(String(200), nullable=False)
    jp = Column(String(60), default="")
    text = Column(Text, default="")
    sort = Column(Integer, default=0)

    def public(self) -> dict:
        return {"no": self.id, "title": self.title, "jp": self.jp, "text": self.text}


class RuleHistory(Base):
    __tablename__ = "rule_history"

    id = Column(String(40), primary_key=True)
    ts = Column(BigInteger, nullable=False)
    type = Column(String(10), default="add")     # base | add | mod | del
    title = Column(String(200), default="")
    jp = Column(String(60), default="")
    by = Column(String(120), default="")
    colony = Column(String(30))
    rule_id = Column(String(40))

    def public(self) -> dict:
        return {
            "id": self.id, "ts": self.ts, "type": self.type, "title": self.title,
            "jp": self.jp, "by": self.by, "colony": self.colony, "ruleId": self.rule_id,
        }


class Notification(Base):
    __tablename__ = "notifications"

    id = Column(String(40), primary_key=True)
    ts = Column(BigInteger, nullable=False)
    type = Column(String(30), default="broadcast")
    title = Column(String(200), default="")
    text = Column(Text, default="")
    target = Column(String(40), default="all")   # 'all' или id участника
    read = Column(JSON, default=list)

    def public(self) -> dict:
        return {
            "id": self.id, "ts": self.ts, "type": self.type, "title": self.title,
            "text": self.text, "target": self.target, "read": self.read or [],
        }


class LogEntry(Base):
    __tablename__ = "logs"

    id = Column(String(40), primary_key=True)
    ts = Column(BigInteger, nullable=False)
    actor = Column(String(120), default="")
    action = Column(String(60), default="")
    text = Column(Text, default="")
    level = Column(String(10), default="info")

    def public(self) -> dict:
        return {
            "id": self.id, "ts": self.ts, "actor": self.actor,
            "action": self.action, "text": self.text, "level": self.level,
        }


class Setting(Base):
    """Одиночные записи: состояние миграции и настройки безопасности."""

    __tablename__ = "settings"

    key = Column(String(40), primary_key=True)
    value = Column(JSON, nullable=False)


class Session(Base):
    __tablename__ = "sessions"

    token = Column(String(64), primary_key=True)
    user_id = Column(String(40), nullable=False, index=True)
    created_at = Column(BigInteger, nullable=False)
