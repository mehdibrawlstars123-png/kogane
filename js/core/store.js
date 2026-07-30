/**
 * Store — состояние системы Коганэ.
 *
 * Бэкенда нет, поэтому вся «база» живёт в localStorage:
 * пользователи, анкеты, участники, правила, уведомления, журнал, миграция.
 * Изменения синхронизируются между вкладками через событие storage —
 * действия администратора видны игроку в другой вкладке сразу.
 */

import { bus, EV } from './bus.js?v=6';
import { BASE_RULES, SHOP_RULES, DEMO_ROSTER, RULE_HISTORY_SEED } from '../data/seed.js?v=6';

const KEY = 'kogane:db:v1';

const now = () => Date.now();
const uid = (p = 'x') => `${p}-${now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

/** Пароль хешируется, чтобы не лежать в открытом виде.
 *  Это не защита: вся «база» на клиенте. Для реальной системы нужен сервер. */
function hash(str) {
  let h1 = 0x811c9dc5;
  let h2 = 0x1000193;
  for (let i = 0; i < str.length; i += 1) {
    const c = str.charCodeAt(i);
    h1 = ((h1 ^ c) * 0x01000193) >>> 0;
    h2 = ((h2 + c * (i + 7)) * 0x85ebca6b) >>> 0;
  }
  return `${h1.toString(16)}${h2.toString(16)}`;
}

/** Код по умолчанию. Меняется в админке, хранится только в виде хеша. */
export const DEFAULT_ADMIN_CODE = 'KOGANE-19';

function seedDb() {
  const t = now();

  return {
    version: 1,
    createdAt: t,

    security: {
      codeHash: hash(DEFAULT_ADMIN_CODE),
      codeChanged: false,
      updatedAt: t,
    },

    migration: {
      number: 1,
      active: true,
      startedAt: t,
      endedAt: null,
      note: 'Первая миграция. Барьеры развёрнуты над десятью колониями.',
    },

    users: [
      {
        id: 'u-admin',
        email: 'admin@kogane.jp',
        pass: hash('kogane'),
        role: 'admin',
        state: 'approved',
        createdAt: t,
        character: {
          name: 'Распорядитель игры',
          nameJp: '主催者',
          level: 'gs',
          points: 0,
          rules: 0,
          colony: 'tokyo1',
          status: 'out',
        },
        application: null,
        ownedRules: [],
        notifications: [],
      },
    ],

    // Реестр стартует пустым: участники появляются только через
    // регистрацию и одобрение анкеты распорядителем.
    npcs: [],

    baseRules: BASE_RULES,
    shopRules: SHOP_RULES.map((r) => ({ ...r, enabled: true })),

    ruleHistory: RULE_HISTORY_SEED.map((r, i) => ({
      id: `rh-${i}`,
      ts: t - (RULE_HISTORY_SEED.length - i) * 3600e3 * 7,
      ...r,
    })),

    notifications: [
      {
        id: 'nt-0',
        ts: t,
        type: 'migStart',
        title: 'Первая миграция начата',
        text: 'Барьеры развёрнуты. Все участники обязаны объявить о начале игры в течение 19 дней.',
        target: 'all',
        read: [],
      },
    ],

    logs: [
      { id: 'lg-0', ts: t, actor: 'СИСТЕМА', action: 'init', text: 'База системы Коганэ развёрнута.' },
    ],
  };
}

/* ---------------------------------------------------------- */

let db = null;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
    return true;
  } catch (e) {
    console.error('[store] не удалось сохранить состояние', e);
    return false;
  }
}

export const store = {
  hash,
  uid,

  init() {
    db = read();
    if (!db || db.version !== 1) {
      db = seedDb();
      write();
    }

    // Достройка полей, появившихся после создания базы
    if (!db.security) {
      db.security = { codeHash: hash(DEFAULT_ADMIN_CODE), codeChanged: false, updatedAt: now() };
      write();
    }

    // Синхронизация между вкладками
    window.addEventListener('storage', (e) => {
      if (e.key !== KEY) return;
      db = read() || db;
      bus.emit(EV.dbSync, db);
      bus.emit(EV.dbChange, db);
    });

    return db;
  },

  get db() { return db; },

  /** Мутация состояния + сохранение + событие */
  commit(fn, { silent = false } = {}) {
    const result = fn(db);
    write();
    if (!silent) bus.emit(EV.dbChange, db);
    return result;
  },

  reset() {
    db = seedDb();
    write();
    bus.emit(EV.dbChange, db);
  },

  export() {
    return JSON.stringify(db, null, 2);
  },

  import(json) {
    const parsed = JSON.parse(json);
    if (!parsed || !parsed.users) throw new Error('Некорректный формат базы');
    db = parsed;
    write();
    bus.emit(EV.dbChange, db);
  },

  /* ---------------- Пользователи ---------------- */

  users() { return db.users; },

  userById(id) { return db.users.find((u) => u.id === id) || null; },

  userByEmail(email) {
    const e = String(email).trim().toLowerCase();
    return db.users.find((u) => u.email.toLowerCase() === e) || null;
  },

  createUser({ email, password }) {
    const user = {
      id: uid('u'),
      email: String(email).trim(),
      pass: hash(password),
      role: 'player',
      state: 'registered',        // registered → applied → approved | rejected
      createdAt: now(),
      character: null,
      application: null,
      ownedRules: [],
      notifications: [],
    };
    this.commit((d) => d.users.push(user));
    return user;
  },

  updateUser(id, patch) {
    return this.commit((d) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) return null;
      Object.assign(u, patch);
      return u;
    });
  },

  updateCharacter(id, patch) {
    return this.commit((d) => {
      const u = d.users.find((x) => x.id === id);
      if (!u) return null;
      u.character = { ...(u.character || {}), ...patch };
      return u.character;
    });
  },

  deleteUser(id) {
    this.commit((d) => { d.users = d.users.filter((u) => u.id !== id); });
  },

  /* ---------------- Секретный код администрации ---------------- */

  security() { return db.security; },

  checkAdminCode(code) {
    return db.security.codeHash === hash(String(code || '').trim());
  },

  setAdminCode(code) {
    this.commit((d) => {
      d.security.codeHash = hash(String(code).trim());
      d.security.codeChanged = true;
      d.security.updatedAt = now();
    });
  },

  setAdminPassword(password) {
    this.commit((d) => {
      const a = d.users.find((u) => u.role === 'admin');
      if (a) a.pass = hash(String(password));
    });
  },

  /* ---------------- Участники (игроки + NPC) ---------------- */

  /** Единый список для таблицы и поиска */
  participants() {
    const fromUsers = db.users
      .filter((u) => u.state === 'approved' && u.character && u.role !== 'admin')
      .map((u) => ({
        id: u.id,
        userId: u.id,
        isNpc: false,
        name: u.character.name,
        nameJp: u.character.nameJp || '',
        level: u.character.level,
        points: u.character.points || 0,
        rules: u.character.rules || 0,
        colony: u.character.colony,
        status: u.character.status || 'active',
        application: u.application,
        ownedRules: u.ownedRules || [],
      }));

    return [...fromUsers, ...db.npcs];
  },

  participant(id) {
    return this.participants().find((p) => p.id === id) || null;
  },

  /** Очистка служебных записей реестра: остаются только реальные игроки */
  clearNpcs() {
    const count = db.npcs.length;
    this.commit((d) => { d.npcs = []; });
    return count;
  },

  /** Загрузка демонстрационных записей — только для проверки вида таблицы */
  loadDemoRoster() {
    this.commit((d) => {
      d.npcs = DEMO_ROSTER.map((n, i) => ({
        id: `n-${i}`,
        isNpc: true,
        name: n.name,
        nameJp: n.jp,
        level: n.level,
        points: n.points,
        rules: n.rules,
        colony: n.colony,
        status: n.status,
      }));
    });
    return db.npcs.length;
  },

  updateNpc(id, patch) {
    return this.commit((d) => {
      const n = d.npcs.find((x) => x.id === id);
      if (!n) return null;
      Object.assign(n, patch);
      return n;
    });
  },

  /** Универсальное обновление участника — и NPC, и игрока */
  updateParticipant(id, patch) {
    if (id.startsWith('n-')) return this.updateNpc(id, patch);
    return this.updateCharacter(id, patch);
  },

  /* ---------------- Анкеты ---------------- */

  applications(state = 'applied') {
    return db.users.filter((u) => u.state === state && u.application);
  },

  submitApplication(userId, data) {
    return this.commit((d) => {
      const u = d.users.find((x) => x.id === userId);
      if (!u) return null;
      u.application = { ...data, submittedAt: now() };
      u.state = 'applied';
      return u;
    });
  },

  /* ---------------- Правила ---------------- */

  shopRules() { return db.shopRules; },

  addShopRule(rule) {
    const item = { id: uid('r'), enabled: true, cost: 100, cat: 'Особые', ...rule };
    this.commit((d) => d.shopRules.push(item));
    return item;
  },

  updateShopRule(id, patch) {
    this.commit((d) => {
      const r = d.shopRules.find((x) => x.id === id);
      if (r) Object.assign(r, patch);
    });
  },

  removeShopRule(id) {
    this.commit((d) => { d.shopRules = d.shopRules.filter((r) => r.id !== id); });
  },

  pushRuleHistory(entry) {
    const item = { id: uid('rh'), ts: now(), type: 'add', ...entry };
    this.commit((d) => d.ruleHistory.unshift(item));
    return item;
  },

  ruleHistory() { return db.ruleHistory; },

  /* ---------------- Уведомления ---------------- */

  notifications(userId = null) {
    return db.notifications.filter((n) => n.target === 'all' || n.target === userId);
  },

  addNotification({ type = 'broadcast', title, text, target = 'all' }) {
    const item = { id: uid('nt'), ts: now(), type, title, text, target, read: [] };
    this.commit((d) => d.notifications.unshift(item));
    bus.emit(EV.notify, item);
    return item;
  },

  markRead(userId) {
    this.commit((d) => {
      d.notifications.forEach((n) => {
        if ((n.target === 'all' || n.target === userId) && !n.read.includes(userId)) {
          n.read.push(userId);
        }
      });
    }, { silent: true });
  },

  unreadCount(userId) {
    return this.notifications(userId).filter((n) => !n.read.includes(userId)).length;
  },

  /* ---------------- Журнал ---------------- */

  log(actor, action, text, level = 'info') {
    const item = { id: uid('lg'), ts: now(), actor, action, text, level };
    this.commit((d) => {
      d.logs.unshift(item);
      if (d.logs.length > 500) d.logs.length = 500;
    }, { silent: true });
    return item;
  },

  logs() { return db.logs; },

  /* ---------------- Миграция ---------------- */

  migration() { return db.migration; },

  startMigration(note = '') {
    this.commit((d) => {
      d.migration = {
        number: (d.migration?.number || 0) + 1,
        active: true,
        startedAt: now(),
        endedAt: null,
        note,
      };
      // Возвращаем в игру всех, кто выбыл в прошлой миграции
      d.users.forEach((u) => {
        if (u.character && u.state === 'approved') {
          u.character.status = u.role === 'admin' ? 'out' : 'active';
          delete u.deadMigration;
          delete u.deathReason;
        }
      });
      d.npcs.forEach((n) => { if (n.status === 'frozen') n.status = 'active'; });
    });
    bus.emit(EV.migrationStart, db.migration);
  },

  endMigration(note = '') {
    this.commit((d) => {
      d.migration.active = false;
      d.migration.endedAt = now();
      d.migration.note = note || d.migration.note;
      d.users.forEach((u) => {
        if (u.role !== 'admin' && u.character && u.state === 'approved') {
          u.character.status = 'dead';
          // Номер и причина нужны экрану смерти: без них он всегда
          // сообщал бы о первой миграции.
          u.deadMigration = d.migration.number;
          u.deathReason = note
            ? `${note} Миграция №${d.migration.number} завершена.`
            : '';
        }
      });
    });
    bus.emit(EV.migrationEnd, db.migration);
  },
};
