"""
Операции распорядителя игры: анкеты, участники, правила,
уведомления, миграция, безопасность и обслуживание базы.
"""

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Header
from sqlalchemy import select

from .api import (
    router as _base, require_admin, add_log, notify, setting, save_setting,
    find_participant, char_of, apply_char, participants, build_state,
    COLONY_NAMES, LEVEL_NAMES, STATUS_NAMES, check,
    migration_state, finish_confirmation, award, CONFIRM_MINUTES, START_POINTS,
    ApproveIn, RejectIn, PatchParticipant, PointsIn, RuleGrant, MassIn,
    ShopRuleIn, NoticeIn, BroadcastIn, MigrationIn, SecurityIn,
    EventIn, EventMusicIn, AdminIn, AdminPatch,
)
from .models import (
    User, Npc, ShopRule, RuleHistory, Notification, LogEntry, Session as UserSession,
)
from .security import hash_secret, new_id, now_ms
from .seed import DEMO_ROSTER

router = APIRouter(prefix="/api/admin")


# ==================== Анкеты ====================

@router.post("/applications/{user_id}/approve")
def approve(user_id: str, body: ApproveIn, data=Depends(require_admin)):
    admin, session = data
    user = session.get(User, user_id)
    if not user or not user.application:
        raise HTTPException(404, "Анкета не найдена")

    app = user.application
    user.state = "approved"
    user.approved_at = now_ms()
    user.reject_reason = None
    user.character = {
        "name": app.get("name", user.email),
        "nameJp": app.get("nameJp", ""),
        "roblox": app.get("roblox", ""),
        "discord": app.get("discord", ""),
        "level": check(body.level, LEVEL_NAMES, "уровень"),
        "points": max(0, body.points),
        "rules": 0,
        "colony": check(body.colony, COLONY_NAMES, "колония"),
        "status": "active",
    }

    notify(session, "approved", "Анкета одобрена",
           f"Участник «{app.get('name', '')}» внесён в реестр. "
           f"Колония: {COLONY_NAMES.get(body.colony, body.colony)}. "
           "Объявите о начале игры в течение 19 дней.", user.id)
    add_log(session, admin.email, "approve",
            f"Анкета «{app.get('name', '')}» одобрена. Колония: {COLONY_NAMES.get(body.colony)}.")
    session.commit()
    return {"ok": True}


@router.post("/applications/{user_id}/reject")
def reject(user_id: str, body: RejectIn, data=Depends(require_admin)):
    admin, session = data
    user = session.get(User, user_id)
    if not user:
        raise HTTPException(404, "Участник не найден")

    user.state = "rejected"
    user.reject_reason = body.reason
    notify(session, "rejected", "Анкета отклонена",
           f"Причина: {body.reason}" if body.reason else "Заявка не прошла проверку распорядителя.",
           user.id)
    add_log(session, admin.email, "reject",
            f"Анкета «{(user.application or {}).get('name', '')}» отклонена. {body.reason}", "warn")
    session.commit()
    return {"ok": True}


# ==================== Участники ====================

@router.patch("/participants/{pid}")
def patch_participant(pid: str, body: PatchParticipant, data=Depends(require_admin)):
    admin, session = data
    target, is_npc = find_participant(session, pid)
    before = char_of(target, is_npc)

    patch, changes = {}, []
    if body.level and body.level != before.get("level"):
        patch["level"] = check(body.level, LEVEL_NAMES, "уровень")
        changes.append(f"уровень → {LEVEL_NAMES.get(body.level, body.level)}")
    if body.colony and body.colony != before.get("colony"):
        patch["colony"] = check(body.colony, COLONY_NAMES, "колония")
        changes.append(f"колония → {COLONY_NAMES.get(body.colony, body.colony)}")
    if body.status and body.status != before.get("status"):
        patch["status"] = check(body.status, STATUS_NAMES, "статус")
        changes.append(f"статус → {body.status}")
    if body.rules is not None and body.rules != before.get("rules"):
        patch["rules"] = max(0, body.rules)
        changes.append(f"правил → {body.rules}")
    if body.points is not None and body.points != before.get("points"):
        patch["points"] = max(0, body.points)
        changes.append(f"очки → {body.points}")

    apply_char(target, is_npc, patch)

    if not is_npc:
        if "colony" in patch:
            notify(session, "colony", "Смена колонии",
                   f"Перемещение в барьер «{COLONY_NAMES.get(patch['colony'])}» подтверждено. "
                   "Срок объявления обнулён.", target.id)
        if "level" in patch:
            notify(session, "level", "Изменение уровня",
                   f"Уровень пересмотрен: {LEVEL_NAMES.get(patch['level'], patch['level'])}.", target.id)
        if patch.get("status") == "dead":
            target.death_reason = "Выбывание подтверждено распорядителем игры."
            target.dead_migration = setting(session, "migration").get("number", 1)
            notify(session, "death", "Выбытие из игры",
                   "Статус участника изменён на «Погиб». Доступ приостановлен до следующей миграции.",
                   target.id)
        elif "status" in patch and before.get("status") == "dead":
            target.death_reason = None
            target.dead_migration = None

    add_log(session, admin.email, "edit-participant",
            f"{before.get('name', pid)}: {', '.join(changes) or 'без изменений'}.")
    session.commit()
    return {"ok": True}


@router.post("/participants/{pid}/points")
def change_points(pid: str, body: PointsIn, data=Depends(require_admin)):
    admin, session = data
    target, is_npc = find_participant(session, pid)
    char = char_of(target, is_npc)
    current = int(char.get("points", 0))

    total = max(0, body.value) if body.value is not None else max(0, current + (body.delta or 0))
    delta = total - current
    apply_char(target, is_npc, {"points": total})
    if not is_npc:
        award(target, delta)

    if not is_npc and delta:
        kind = "points" if delta > 0 else "penalty"
        title = "Начисление очков" if delta > 0 else "Списание очков"
        verb = "Зачислено" if delta > 0 else "Снято"
        notify(session, kind, title,
               f"{verb} {abs(delta)} очков. Текущий счёт: {total}. Основание: {body.reason}.",
               target.id)

    add_log(session, admin.email, "points",
            f"{char.get('name', pid)}: {'+' if delta >= 0 else ''}{delta} очков → {total}.")
    session.commit()
    return {"ok": True, "points": total}


@router.post("/participants/{pid}/revive")
def revive(pid: str, data=Depends(require_admin)):
    admin, session = data
    target, is_npc = find_participant(session, pid)
    char = char_of(target, is_npc)

    apply_char(target, is_npc, {"status": "active"})
    if not is_npc:
        target.death_reason = None
        target.dead_migration = None
        notify(session, "broadcast", "Возвращение в игру",
               "Распорядитель вернул вас в Смертельную миграцию. Доступ восстановлен.", target.id)

    add_log(session, admin.email, "revive", f"{char.get('name', pid)} возвращён в игру.")
    session.commit()
    return {"ok": True}


@router.post("/participants/{pid}/grant")
def grant_rule(pid: str, body: RuleGrant, data=Depends(require_admin)):
    admin, session = data
    target, is_npc = find_participant(session, pid)
    rule = session.get(ShopRule, body.ruleId)
    if not rule:
        raise HTTPException(404, "Правило не найдено")

    char = char_of(target, is_npc)

    if is_npc:
        target.rules = int(target.rules or 0) + 1
    else:
        owned = list(target.owned_rules or [])
        if rule.id in owned:
            raise HTTPException(409, "Правило уже выдано")
        owned.append(rule.id)
        target.owned_rules = owned

        char["rules"] = int(char.get("rules", 0)) + 1
        if not body.free:
            char["points"] = max(0, int(char.get("points", 0)) - rule.cost)
        target.character = char

        notify(session, "purchase", "Правило установлено",
               f"«{rule.title}» внесено в свод правил решением распорядителя.", target.id)

    session.add(RuleHistory(
        id=new_id("rh"), ts=now_ms(), type="add", title=rule.title, jp=rule.jp,
        by=char.get("name", pid), colony=char.get("colony"), rule_id=rule.id,
    ))
    add_log(session, admin.email, "grant-rule", f"{char.get('name', pid)}: выдано «{rule.title}».")
    session.commit()
    return {"ok": True}


@router.post("/participants/{pid}/revoke")
def revoke_rule(pid: str, body: RuleGrant, data=Depends(require_admin)):
    admin, session = data
    target, is_npc = find_participant(session, pid)
    rule = session.get(ShopRule, body.ruleId)
    if is_npc or not rule:
        raise HTTPException(400, "Отзыв доступен только у игроков")

    owned = [r for r in (target.owned_rules or []) if r != rule.id]
    target.owned_rules = owned

    char = dict(target.character or {})
    char["rules"] = max(0, int(char.get("rules", 0)) - 1)
    target.character = char

    session.add(RuleHistory(
        id=new_id("rh"), ts=now_ms(), type="del", title=rule.title, jp=rule.jp,
        by="Распорядитель", colony=char.get("colony"),
    ))
    notify(session, "ruleTaken", "Правило отозвано",
           f"«{rule.title}» исключено из вашего свода правил распорядителем.", target.id)
    add_log(session, admin.email, "revoke-rule",
            f"{char.get('name', pid)}: отозвано «{rule.title}».", "warn")
    session.commit()
    return {"ok": True}


@router.delete("/users/{uid}")
def delete_user(uid: str, data=Depends(require_admin)):
    admin, session = data
    user = session.get(User, uid)
    if not user:
        raise HTTPException(404, "Аккаунт не найден")
    if user.role == "admin":
        raise HTTPException(400, "Учётную запись распорядителя удалить нельзя")

    name = (user.character or {}).get("name", user.email)

    # Открытые вкладки удалённого участника должны сразу перестать работать
    for row in session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        session.delete(row)

    session.delete(user)
    add_log(session, admin.email, "delete-user",
            f"Аккаунт {name} ({user.email}) удалён. Почта снова свободна.", "danger")
    session.commit()
    return {"ok": True}


@router.post("/users/purge")
def purge_users(data=Depends(require_admin)):
    """
    Удаляет все аккаунты участников: анкеты, очки, купленные правила.

    В отличие от полного сброса, не трогает миграцию, свод правил, магазин,
    уведомления и журнал — только сами аккаунты. Нужно, когда реестр
    начинают с чистого листа или почта занята прежней регистрацией.
    """
    admin, session = data

    players = session.scalars(select(User).where(User.role != "admin")).all()
    for user in players:
        for row in session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
            session.delete(row)
        session.delete(user)

    add_log(session, admin.email, "users-purge",
            f"Удалены все аккаунты участников: {len(players)}. Почты снова свободны.", "danger")
    session.commit()
    return {"ok": True, "removed": len(players)}


@router.post("/mass")
def mass_action(body: MassIn, data=Depends(require_admin)):
    """Массовые действия по охвату: все, только живые или отдельная колония."""
    admin, session = data
    everyone = participants(session)

    # Охват и действие проверяются строго: опечатка в охвате незаметно
    # расширила бы «объявить выбывшими» с одной колонии на весь реестр.
    names = {"add": "начисление", "sub": "списание", "kill": "выбывание", "revive": "возврат"}
    if body.action not in names:
        raise HTTPException(422, f"Неизвестное действие: {body.action}")

    if body.scope == "alive":
        targets = [p for p in everyone if p["status"] != "dead"]
    elif body.scope.startswith("c:"):
        check(body.scope[2:], COLONY_NAMES, "колония")
        targets = [p for p in everyone if p["colony"] == body.scope[2:]]
    elif body.scope == "all":
        targets = everyone
    else:
        raise HTTPException(422, f"Неизвестный охват: {body.scope}")

    migration_no = setting(session, "migration").get("number", 1)

    for p in targets:
        obj, is_npc = find_participant(session, p["id"])
        char = char_of(obj, is_npc)
        current = int(char.get("points", 0))

        if body.action == "add":
            total = current + body.amount
            apply_char(obj, is_npc, {"points": total})
            if not is_npc:
                award(obj, body.amount)
            if not is_npc:
                notify(session, "points", "Начисление очков",
                       f"Зачислено {body.amount} очков. Текущий счёт: {total}. "
                       "Основание: массовое начисление.", obj.id)

        elif body.action == "sub":
            total = max(0, current - body.amount)
            apply_char(obj, is_npc, {"points": total})
            if not is_npc:
                notify(session, "penalty", "Списание очков",
                       f"Снято {body.amount} очков. Текущий счёт: {total}. "
                       "Основание: массовое списание.", obj.id)

        elif body.action == "kill":
            apply_char(obj, is_npc, {"status": "dead"})
            if not is_npc:
                obj.death_reason = "Выбывание подтверждено распорядителем игры."
                obj.dead_migration = migration_no
                notify(session, "death", "Выбытие из игры",
                       "Статус участника изменён на «Погиб». "
                       "Доступ приостановлен до следующей миграции.", obj.id)

        elif body.action == "revive":
            apply_char(obj, is_npc, {"status": "active"})
            if not is_npc:
                obj.death_reason = None
                obj.dead_migration = None

    add_log(session, admin.email, f"mass-{body.action}",
            f"Массовое {names.get(body.action, body.action)} "
            f"({body.amount if body.action in ('add', 'sub') else '—'}). "
            f"Затронуто: {len(targets)}.",
            "warn" if body.action in ("kill", "sub") else "info")
    session.commit()
    return {"ok": True, "affected": len(targets)}


# ==================== Правила магазина ====================

@router.post("/shop-rules")
def create_rule(body: ShopRuleIn, data=Depends(require_admin)):
    admin, session = data
    rule = ShopRule(
        id=new_id("r"), code=body.code, title=body.title, jp=body.jp, text=body.text,
        cost=body.cost, cat=body.cat, enabled=body.enabled, sort=999,
    )
    session.add(rule)
    notify(session, "rule", "Новое правило в игре", f"Добавлено правило: «{body.title}».", "all")
    add_log(session, admin.email, "rule-create", f"Создано правило магазина «{body.title}».")
    session.commit()
    return {"ok": True, "id": rule.id}


@router.patch("/shop-rules/{rid}")
def update_rule(rid: str, body: ShopRuleIn, data=Depends(require_admin)):
    admin, session = data
    rule = session.get(ShopRule, rid)
    if not rule:
        raise HTTPException(404, "Правило не найдено")

    for field in ("code", "title", "jp", "text", "cost", "cat", "enabled"):
        setattr(rule, field, getattr(body, field))

    add_log(session, admin.email, "rule-edit", f"Правило «{rule.title}» изменено.")
    session.commit()
    return {"ok": True}


@router.delete("/shop-rules/{rid}")
def delete_rule(rid: str, data=Depends(require_admin)):
    admin, session = data
    rule = session.get(ShopRule, rid)
    if not rule:
        raise HTTPException(404, "Правило не найдено")
    title = rule.title
    session.delete(rule)
    add_log(session, admin.email, "rule-delete", f"Правило «{title}» удалено из магазина.", "warn")
    session.commit()
    return {"ok": True}


# ==================== Уведомления и рассылка ====================

@router.post("/notifications")
def create_notice(body: NoticeIn, data=Depends(require_admin)):
    admin, session = data
    notify(session, body.type, body.title or "Сообщение системы", body.text, body.target)
    add_log(session, admin.email, "notice", f"Уведомление «{body.title}» → {body.target}.")
    session.commit()
    return {"ok": True}


@router.post("/broadcast")
def broadcast(body: BroadcastIn, data=Depends(require_admin)):
    admin, session = data
    everyone = participants(session)

    if body.scope == "all":
        notify(session, "broadcast", body.title, body.text, "all")
        count = len(everyone)
    else:
        if body.scope == "alive":
            targets = [p for p in everyone if p["status"] != "dead" and not p.get("isNpc")]
        elif body.scope.startswith("colony:"):
            cid = check(body.scope.split(":", 1)[1], COLONY_NAMES, "колония")
            targets = [p for p in everyone if p["colony"] == cid and not p.get("isNpc")]
        else:
            raise HTTPException(422, f"Неизвестный охват рассылки: {body.scope}")

        for p in targets:
            notify(session, "broadcast", body.title, body.text, p["id"])
        count = len(targets)

    add_log(session, admin.email, "broadcast", f"Рассылка «{body.title}» ({body.scope}).")
    session.commit()
    return {"ok": True, "affected": count}


@router.post("/notifications/clear")
def clear_notices(data=Depends(require_admin)):
    admin, session = data
    for n in session.scalars(select(Notification)).all():
        session.delete(n)
    add_log(session, admin.email, "db-clear-notices", "История уведомлений очищена.", "warn")
    session.commit()
    return {"ok": True}


# ==================== Миграция ====================

@router.post("/migration/start")
def start_migration(body: MigrationIn, data=Depends(require_admin)):
    admin, session = data
    mig = setting(session, "migration")
    number = int(mig.get("number", 0)) + 1
    until = now_ms() + CONFIRM_MINUTES * 60_000

    # Миграция начинается не сразу: сперва окно подтверждения участия.
    save_setting(session, "migration", {
        "number": number, "active": False, "phase": "confirm",
        "startedAt": now_ms(), "confirmUntil": until, "endedAt": None,
        "note": body.note, "startPoints": START_POINTS,
    })

    for u in session.scalars(select(User).where(User.state == "approved")).all():
        if not u.character:
            continue
        char = dict(u.character)
        if u.role == "admin":
            char["status"] = "out"
        else:
            # Счёт текущей миграции обнуляется до стартового, общий — копится
            char["status"] = "pending"
            char["points"] = START_POINTS
            char["rules"] = 0
        u.character = char
        u.owned_rules = []
        u.death_reason = None
        u.dead_migration = None
        u.joined_no = None

    for n in session.scalars(select(Npc).where(Npc.status == "frozen")).all():
        n.status = "active"

    notify(session, "migStart", f"Миграция №{number} объявлена",
           f"Подтвердите участие в течение {CONFIRM_MINUTES} минут. "
           f"Стартовый счёт — {START_POINTS} очков. "
           "Кто не подтвердит, пропускает миграцию.", "all")
    add_log(session, admin.email, "migration-start",
            f"Миграция №{number} объявлена, подтверждение {CONFIRM_MINUTES} мин.")
    session.commit()
    return {"ok": True, "number": number, "confirmUntil": until}


@router.post("/migration/confirm-finish")
def confirm_finish(data=Depends(require_admin)):
    """Закрыть окно подтверждения досрочно и начать миграцию."""
    admin, session = data
    mig = migration_state(session)
    if mig.get("phase") != "confirm":
        raise HTTPException(409, "Подтверждение сейчас не идёт")

    missed = finish_confirmation(session, mig)
    add_log(session, admin.email, "migration-confirm-force",
            f"Подтверждение закрыто досрочно. Пропустили: {missed}.", "warn")
    session.commit()
    return {"ok": True, "missed": missed}


@router.post("/migration/end")
def end_migration(body: MigrationIn, data=Depends(require_admin)):
    admin, session = data
    mig = setting(session, "migration")
    number = int(mig.get("number", 1))

    mig.update({
        "active": False, "phase": "neutral", "endedAt": now_ms(),
        "note": body.note or mig.get("note", ""),
    })
    save_setting(session, "migration", mig)

    # Участники выходят из барьера, но не объявляются погибшими: после
    # миграции начинается нейтральный период, и сайт должен остаться
    # открытым — профиль, таблицы и уведомления доступны.
    # Экран выбывания остаётся за отдельным решением распорядителя
    # («Объявить выбывшим») и за массовым действием.
    for u in session.scalars(select(User).where(User.state == "approved")).all():
        if u.role == "admin" or not u.character:
            continue
        char = dict(u.character)
        char["status"] = "out"
        u.character = char
        u.dead_migration = None
        u.death_reason = None

    notify(session, "migEnd", f"Миграция №{number} завершена",
           "Барьеры свёрнуты. Начался нейтральный период: сайт открыт, "
           "но игровые действия закрыты до объявления следующей миграции.", "all")
    add_log(session, admin.email, "migration-end", f"Миграция №{number} завершена. {body.note}", "danger")
    session.commit()
    return {"ok": True}


@router.patch("/migration")
def update_migration(body: MigrationIn, data=Depends(require_admin)):
    admin, session = data
    mig = setting(session, "migration")
    mig["note"] = body.note
    save_setting(session, "migration", mig)
    add_log(session, admin.email, "migration-note", f"Распоряжение обновлено: {body.note}")
    session.commit()
    return {"ok": True}


# ==================== Безопасность и обслуживание ====================

@router.post("/security")
def update_security(
    body: SecurityIn,
    data=Depends(require_admin),
    authorization: Optional[str] = Header(default=None),
):
    admin, session = data
    current_token = (authorization or "")[7:].strip()

    if body.code:
        if len(body.code) < 4:
            raise HTTPException(400, "Код короче четырёх символов")
        security = setting(session, "security")
        security.update({"codeHash": hash_secret(body.code), "codeChanged": True, "updatedAt": now_ms()})
        save_setting(session, "security", security)
        add_log(session, admin.email, "code-change", "Секретный код администрации изменён.", "warn")

    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Пароль короче шести символов")
        admin_user = session.get(User, admin.id)
        admin_user.pass_hash = hash_secret(body.password)

        # Пароль меняют в том числе тогда, когда в панель кто-то зашёл.
        # Прежние входы после этого должны перестать работать — иначе чужая
        # вкладка останется открытой и смена пароля ничего не даст.
        # Текущий вход сохраняется, чтобы распорядителя не выбросило.
        закрыто = 0
        for row in session.scalars(select(UserSession).where(UserSession.user_id == admin.id)).all():
            if row.token != current_token:
                session.delete(row)
                закрыто += 1

        add_log(session, admin.email, "pass-change",
                f"Пароль распорядителя изменён. Прежних входов закрыто: {закрыто}.", "warn")

    session.commit()
    return {"ok": True}


@router.post("/logs/clear")
def clear_logs(data=Depends(require_admin)):
    admin, session = data
    for entry in session.scalars(select(LogEntry)).all():
        session.delete(entry)
    session.commit()
    add_log(session, admin.email, "db-clear-logs", "Журнал очищен.", "warn")
    session.commit()
    return {"ok": True}


@router.post("/npcs/load")
def load_demo(data=Depends(require_admin)):
    admin, session = data
    if session.scalar(select(Npc).limit(1)):
        raise HTTPException(409, "Демо-реестр уже загружен")

    for i, (name, jp, level, points, rules, colony, status) in enumerate(DEMO_ROSTER):
        session.add(Npc(
            id=f"n-{i}", name=name, name_jp=jp, level=level,
            points=points, rules=rules, colony=colony, status=status,
        ))
    add_log(session, admin.email, "db-load-npcs", f"Загружено демо-записей: {len(DEMO_ROSTER)}.")
    session.commit()
    return {"ok": True, "count": len(DEMO_ROSTER)}


@router.post("/npcs/clear")
def clear_demo(data=Depends(require_admin)):
    admin, session = data
    rows = session.scalars(select(Npc)).all()
    for n in rows:
        session.delete(n)
    add_log(session, admin.email, "db-clear-npcs", f"Удалено демо-записей: {len(rows)}.", "warn")
    session.commit()
    return {"ok": True, "count": len(rows)}


@router.get("/export")
def export_db(data=Depends(require_admin)):
    """Выгрузка состояния для резервной копии."""
    admin, session = data
    return build_state(session, admin)


@router.post("/reset")
def reset_db(data=Depends(require_admin)):
    """
    Полный сброс игры: аккаунты участников, реестр, уведомления,
    журнал и история правил удаляются. Учётная запись распорядителя,
    свод правил и магазин остаются.
    """
    admin, session = data

    for model in (Npc, Notification, RuleHistory, LogEntry):
        for row in session.scalars(select(model)).all():
            session.delete(row)

    for user in session.scalars(select(User).where(User.role != "admin")).all():
        session.delete(user)

    save_setting(session, "migration", {
        "number": 1, "active": True, "startedAt": now_ms(), "endedAt": None,
        "note": "Система сброшена. Барьеры развёрнуты заново.",
    })

    session.add(RuleHistory(
        id=new_id("rh"), ts=now_ms(), type="base",
        title="Свод базовых правил утверждён", jp="基本規則制定",
        by="Распорядитель игры", colony=None,
    ))
    add_log(session, admin.email, "db-reset", "Система сброшена к начальному состоянию.", "danger")
    session.commit()
    return {"ok": True}


# ==================== Ивенты ====================
#
# Ивент — общее для всех событие: у каждого участника меняется оформление
# системы и включается своя музыка. Запускает только распорядитель,
# идёт до тех пор, пока его не остановят.

EVENTS = {
    "sukuna": {
        "title": "Сукуна в истинной форме",
        "jp": "宿儺・真の姿",
        "text": "Внутри барьера проявился Рёмэн Сукуна в истинном облике. "
                "Показатели проклятой энергии вышли за пределы шкалы. "
                "Система переведена в аварийное оформление.",
    },
    "duel": {
        "title": "Сукуна против Годзё",
        "jp": "宿儺 対 五条",
        "text": "Зафиксировано столкновение двух особых уровней. "
                "Барьер держит удар на пределе, изображение системы рвётся "
                "между двумя источниками энергии.",
    },
    "parade": {
        "title": "Парад тысячи духов",
        "jp": "百鬼夜行",
        "text": "Ночное шествие проклятий началось. "
                "Тысячи огней движутся сквозь колонии. "
                "Не покидайте укрытие до окончания парада.",
    },
}


@router.post("/event/start")
def start_event(body: EventIn, data=Depends(require_admin)):
    admin, session = data
    ev = EVENTS.get(body.id)
    if not ev:
        raise HTTPException(404, "Такого ивента нет")

    save_setting(session, "event", {
        "id": body.id,
        "title": ev["title"],
        "jp": ev["jp"],
        "startedAt": now_ms(),
        "startedBy": admin.email,
    })
    notify(session, "broadcast", ev["title"], ev["text"], "all")
    add_log(session, admin.email, "event-start", f"Запущен ивент «{ev['title']}».", "warn")
    session.commit()
    return {"ok": True, "event": body.id}


@router.post("/event/stop")
def stop_event(data=Depends(require_admin)):
    admin, session = data
    current = setting(session, "event")
    if not current.get("id"):
        raise HTTPException(409, "Сейчас ивент не идёт")

    save_setting(session, "event", {"id": None, "endedAt": now_ms()})
    notify(session, "broadcast", "Событие завершено",
           f"«{current.get('title', 'Событие')}» окончено. Система возвращена в обычный режим.", "all")
    add_log(session, admin.email, "event-stop", f"Ивент «{current.get('title')}» остановлен.")
    session.commit()
    return {"ok": True}


# ==================== Учётные записи распорядителей ====================

@router.post("/admins")
def create_admin(body: AdminIn, data=Depends(require_admin)):
    admin, session = data

    email = body.email.strip().lower()
    if "@" not in email or len(email) < 5:
        raise HTTPException(400, "Почта указана неверно")
    if len(body.password) < 6:
        raise HTTPException(400, "Пароль короче шести символов")
    if len(body.code) < 4:
        raise HTTPException(400, "Код короче четырёх символов")
    if session.scalar(select(User).where(User.email == email)):
        raise HTTPException(409, "Эта почта уже занята")

    user = User(
        id=new_id("u"),
        email=email,
        pass_hash=hash_secret(body.password),
        code_hash=hash_secret(body.code),
        role="admin",
        state="approved",
        created_at=now_ms(),
        character={
            "name": body.name.strip() or email, "nameJp": "主催者", "level": "gs",
            "points": 0, "rules": 0, "colony": "tokyo1", "status": "out",
        },
        owned_rules=[],
    )
    session.add(user)
    add_log(session, admin.email, "admin-create",
            f"Заведена учётная запись распорядителя: {email}.", "warn")
    session.commit()
    return {"ok": True, "id": user.id}


@router.patch("/admins/{uid}")
def patch_admin(uid: str, body: AdminPatch, data=Depends(require_admin)):
    admin, session = data
    user = session.get(User, uid)
    if not user or user.role != "admin":
        raise HTTPException(404, "Учётная запись не найдена")

    changes = []
    if body.name is not None and body.name.strip():
        char = dict(user.character or {})
        char["name"] = body.name.strip()
        user.character = char
        changes.append("имя")

    if body.password:
        if len(body.password) < 6:
            raise HTTPException(400, "Пароль короче шести символов")
        user.pass_hash = hash_secret(body.password)
        changes.append("пароль")
        # Чужие открытые вкладки этой записи закрываются
        for row in session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
            session.delete(row)

    if body.code:
        if len(body.code) < 4:
            raise HTTPException(400, "Код короче четырёх символов")
        user.code_hash = hash_secret(body.code)
        changes.append("код")

    add_log(session, admin.email, "admin-edit",
            f"{user.email}: изменено — {', '.join(changes) or 'ничего'}.", "warn")
    session.commit()
    return {"ok": True}


@router.delete("/admins/{uid}")
def delete_admin(uid: str, data=Depends(require_admin)):
    admin, session = data
    user = session.get(User, uid)
    if not user or user.role != "admin":
        raise HTTPException(404, "Учётная запись не найдена")
    if user.id == admin.id:
        raise HTTPException(409, "Нельзя удалить запись, под которой вы вошли")

    total = len(session.scalars(select(User).where(User.role == "admin")).all())
    if total <= 1:
        raise HTTPException(409, "Это последняя учётная запись распорядителя")

    for row in session.scalars(select(UserSession).where(UserSession.user_id == user.id)).all():
        session.delete(row)

    email = user.email
    session.delete(user)
    add_log(session, admin.email, "admin-delete",
            f"Удалена учётная запись распорядителя: {email}.", "danger")
    session.commit()
    return {"ok": True}


@router.post("/event/music")
def set_event_music(body: EventMusicIn, data=Depends(require_admin)):
    """
    Чем озвучивать событие: ссылкой на YouTube, своим звуковым файлом
    или встроенной темой системы.
    """
    admin, session = data
    if body.id not in EVENTS:
        raise HTTPException(404, "Такого ивента нет")
    if body.kind not in ("youtube", "file", "synth"):
        raise HTTPException(422, "Неизвестный источник музыки")

    url = body.url.strip()
    if body.kind != "synth":
        if not url.startswith(("http://", "https://")):
            raise HTTPException(400, "Ссылка должна начинаться с http:// или https://")
        if body.kind == "youtube" and "youtu" not in url:
            raise HTTPException(400, "Это не похоже на ссылку YouTube")

    current = setting(session, "event_music") or {}
    current[body.id] = {"kind": body.kind, "url": url if body.kind != "synth" else ""}
    save_setting(session, "event_music", current)

    add_log(session, admin.email, "event-music",
            f"Музыка события «{EVENTS[body.id]['title']}»: {body.kind} {url}".strip())
    session.commit()
    return {"ok": True}
