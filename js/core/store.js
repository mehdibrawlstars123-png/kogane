/**
 * Store — состояние системы Коганэ.
 *
 * Данные живут в PostgreSQL на сервере. Здесь хранится только снимок,
 * полученный запросом: чтение из него мгновенное и синхронное — весь
 * интерфейс работает как раньше. Любое изменение уходит на сервер,
 * после чего снимок обновляется.
 *
 * Снимок периодически перечитывается, поэтому действия распорядителя
 * доходят до участника сами — с любого устройства.
 */

import { bus, EV } from './bus.js?v=11';
import { api } from './api.js?v=11';

const EMPTY = {
  auth: null,
  migration: { number: 1, active: false, phase: 'neutral', startedAt: Date.now(), endedAt: null, note: '' },
  event: { id: null },
  eventMusic: {},
  admins: [],
  security: { codeChanged: true },
  baseRules: [],
  shopRules: [],
  ruleHistory: [],
  participants: [],
  notifications: [],
  users: [],
  logs: [],
};

let db = { ...EMPTY };
let poller = null;
let signature = '';   // отпечаток последнего снимка — чтобы не перерисовывать зря
let visibilityWired = false;

export const store = {
  /* ---------------- Загрузка и синхронизация ---------------- */

  async init() {
    await this.refresh();
    return db;
  },

  /** Перечитывает состояние с сервера */
  async refresh({ silent = false } = {}) {
    let changed = true;

    try {
      const state = await api.get('/api/state');
      // Сообщать об изменении, только если снимок и правда другой.
      // Иначе опрос каждые четыре секунды перерисовывал бы открытую панель:
      // распорядитель выбирал уровень участника или набирал стартовые очки —
      // и поля возвращались к сохранённым значениям у него под руками.
      const next = JSON.stringify(state);
      changed = next !== signature;
      signature = next;
      db = { ...EMPTY, ...state };
    } catch (e) {
      // Сервер недоступен — оставляем прежний снимок, интерфейс не падает
      if (!silent) console.warn('[store] обновление не удалось:', e.message);
      throw e;
    }

    if (changed) {
      // dbSync перерисовывает разделы целиком, dbChange — только шапку.
      // «Тихое» обновление гасит первое, но не второе: иначе, например,
      // счётчик непрочитанных остался бы висеть после открытия уведомлений —
      // снимок уже обновлён, и следующий опрос никаких изменений не увидит.
      if (!silent) bus.emit(EV.dbSync, db);
      bus.emit(EV.dbChange, db);
    }
    return db;
  },

  /** Периодическое обновление: действия других участников видны сами */
  startPolling(ms = 4000) {
    this.stopPolling();
    poller = setInterval(() => {
      this.refresh({ silent: false }).catch(() => {});
    }, ms);

    // Возврат на вкладку — сразу свежие данные. Подписка одна на страницу,
    // сколько бы раз ни перезапускали опрос.
    if (!visibilityWired) {
      visibilityWired = true;
      document.addEventListener('visibilitychange', () => {
        if (!document.hidden) this.refresh().catch(() => {});
      });
    }
  },

  stopPolling() {
    if (poller) clearInterval(poller);
    poller = null;
  },

  get db() { return db; },

  /* ---------------- Чтение снимка ---------------- */

  auth() { return db.auth; },

  users() { return db.users || []; },

  userById(id) {
    return (db.users || []).find((u) => u.id === id)
      || (db.auth && db.auth.id === id ? db.auth : null);
  },

  userByEmail(email) {
    const e = String(email).trim().toLowerCase();
    return (db.users || []).find((u) => u.email.toLowerCase() === e) || null;
  },

  participants() { return db.participants || []; },

  participant(id) { return (db.participants || []).find((p) => p.id === id) || null; },

  /** Анкеты в нужном состоянии — доступно распорядителю */
  applications(state = 'applied') {
    return (db.users || []).filter((u) => u.state === state && u.application);
  },

  shopRules() { return db.shopRules || []; },

  ruleHistory() { return db.ruleHistory || []; },

  baseRules() { return db.baseRules || []; },

  notifications(userId = null) {
    return (db.notifications || []).filter((n) => n.target === 'all' || n.target === userId);
  },

  unreadCount(userId) {
    return this.notifications(userId).filter((n) => !(n.read || []).includes(userId)).length;
  },

  logs() { return db.logs || []; },

  migration() { return db.migration || EMPTY.migration; },

  /**
   * Фаза игры: neutral — между миграциями, confirm — окно подтверждения
   * участия, active — миграция идёт. Прежнее поле active сохранено.
   */
  phase() {
    const m = this.migration();
    return m.phase || (m.active ? 'active' : 'neutral');
  },

  /** Идёт ли миграция прямо сейчас */
  inMigration() { return this.phase() === 'active'; },

  /** Сколько миллисекунд осталось на подтверждение участия */
  confirmLeft() {
    const m = this.migration();
    if (this.phase() !== 'confirm') return 0;
    return Math.max(0, Number(m.confirmUntil || 0) - Date.now());
  },

  /** Подтвердил ли участник участие в объявленной миграции */
  confirmed(user = null) {
    const u = user || this.auth();
    return Boolean(u && u.joinedNo && u.joinedNo === this.migration().number);
  },

  security() { return db.security || EMPTY.security; },

  /** Где на самом деле лежат данные — сервер сообщает это распорядителю */
  storage() { return db.storage || 'PostgreSQL'; },

  /** Сайт выложен, а база временная — данные сотрутся при обновлении */
  storageTemporary() { return Boolean(db.storageTemporary); },

  /** Идущий ивент: { id, title, jp, startedAt, startedBy } */
  event() { return db.event || { id: null }; },

  /** Чем озвучивать события: { sukuna: {kind, url}, … } */
  eventMusic(id = null) {
    const all = db.eventMusic || {};
    if (!id) return all;
    return all[id] || { kind: 'synth', url: '' };
  },

  /** Учётные записи распорядителей (видит только распорядитель) */
  admins() { return db.admins || []; },

  /** Записи реестра без аккаунта (демонстрационные) */
  npcs() { return (db.participants || []).filter((p) => p.isNpc); },

  /**
   * Журнал ведёт сервер. Метод оставлен, чтобы старые вызовы
   * не падали, и ничего не делает.
   */
  log() { /* журналирование выполняется на сервере */ },

  /* ---------------- Участник ---------------- */

  async submitApplication(_userId, data, card = '') {
    await api.post('/api/application', { data, card });
    return this.refresh();
  },

  /** Принять участие в объявленной миграции */
  async joinMigration() {
    const res = await api.post('/api/migration/confirm');
    await this.refresh();
    return res;
  },

  async buyRule(ruleId) {
    const res = await api.post('/api/shop/buy', { ruleId });
    await this.refresh();
    return res;
  },

  async markRead() {
    await api.post('/api/notifications/read');
    return this.refresh({ silent: true });
  },

  /* ---------------- Анкеты ---------------- */

  async approve(userId, { level, colony, points }) {
    await api.post(`/api/admin/applications/${userId}/approve`, { level, colony, points });
    return this.refresh();
  },

  async reject(userId, reason) {
    await api.post(`/api/admin/applications/${userId}/reject`, { reason });
    return this.refresh();
  },

  /* ---------------- Управление участниками ---------------- */

  async updateParticipant(pid, patch) {
    await api.patch(`/api/admin/participants/${pid}`, patch);
    return this.refresh();
  },

  async changePoints(pid, { delta = null, value = null, reason = 'решение распорядителя' } = {}) {
    const res = await api.post(`/api/admin/participants/${pid}/points`, { delta, value, reason });
    await this.refresh();
    return res;
  },

  async revive(pid) {
    await api.post(`/api/admin/participants/${pid}/revive`);
    return this.refresh();
  },

  async grantRule(pid, ruleId, free = true) {
    await api.post(`/api/admin/participants/${pid}/grant`, { ruleId, free });
    return this.refresh();
  },

  async revokeRule(pid, ruleId) {
    await api.post(`/api/admin/participants/${pid}/revoke`, { ruleId });
    return this.refresh();
  },

  async deleteUser(uid) {
    await api.del(`/api/admin/users/${uid}`);
    return this.refresh();
  },

  /** Удаляет все аккаунты участников, оставляя правила и настройки */
  async purgeUsers() {
    const res = await api.post('/api/admin/users/purge');
    await this.refresh();
    return res;
  },

  async mass({ scope, action, amount = 0 }) {
    const res = await api.post('/api/admin/mass', { scope, action, amount });
    await this.refresh();
    return res;
  },

  /* ---------------- Правила магазина ---------------- */

  async addShopRule(rule) {
    await api.post('/api/admin/shop-rules', rule);
    return this.refresh();
  },

  async updateShopRule(id, patch) {
    const current = this.shopRules().find((r) => r.id === id) || {};
    await api.patch(`/api/admin/shop-rules/${id}`, { ...current, ...patch });
    return this.refresh();
  },

  async removeShopRule(id) {
    await api.del(`/api/admin/shop-rules/${id}`);
    return this.refresh();
  },

  /* ---------------- Уведомления ---------------- */

  async addNotification({ type = 'broadcast', title = '', text = '', target = 'all' }) {
    await api.post('/api/admin/notifications', { type, title, text, target });
    return this.refresh();
  },

  async broadcast({ scope = 'all', title, text }) {
    const res = await api.post('/api/admin/broadcast', { scope, title, text });
    await this.refresh();
    return res;
  },

  async clearNotices() {
    await api.post('/api/admin/notifications/clear');
    return this.refresh();
  },

  /* ---------------- Миграция ---------------- */

  async startMigration(note = '') {
    const res = await api.post('/api/admin/migration/start', { note });
    await this.refresh();
    bus.emit(EV.migrationStart, this.migration());
    return res;
  },

  async endMigration(note = '') {
    await api.post('/api/admin/migration/end', { note });
    await this.refresh();
    bus.emit(EV.migrationEnd, this.migration());
  },

  async setMigrationNote(note) {
    await api.patch('/api/admin/migration', { note });
    return this.refresh();
  },

  /* ---------------- Безопасность и обслуживание ---------------- */

  async setSecurity({ code = null, password = null }) {
    await api.post('/api/admin/security', { code, password });
    return this.refresh();
  },

  async clearLogs() {
    await api.post('/api/admin/logs/clear');
    return this.refresh();
  },

  async loadDemoRoster() {
    const res = await api.post('/api/admin/npcs/load');
    await this.refresh();
    return res.count;
  },

  async clearNpcs() {
    const res = await api.post('/api/admin/npcs/clear');
    await this.refresh();
    return res.count;
  },

  /* ---------------- Ивенты ---------------- */

  async startEvent(id) {
    await api.post('/api/admin/event/start', { id });
    return this.refresh();
  },

  async setEventMusic({ id, kind, url }) {
    await api.post('/api/admin/event/music', { id, kind, url });
    return this.refresh();
  },

  /** Закрыть окно подтверждения досрочно и начать миграцию */
  async finishConfirm() {
    const res = await api.post('/api/admin/migration/confirm-finish');
    await this.refresh();
    return res;
  },

  async stopEvent() {
    await api.post('/api/admin/event/stop');
    return this.refresh();
  },

  /* ---------------- Учётные записи распорядителей ---------------- */

  async addAdmin(data) {
    const res = await api.post('/api/admin/admins', data);
    await this.refresh();
    return res;
  },

  async updateAdmin(id, data) {
    await api.patch(`/api/admin/admins/${id}`, data);
    return this.refresh();
  },

  async removeAdmin(id) {
    await api.del(`/api/admin/admins/${id}`);
    return this.refresh();
  },

  async resetSystem() {
    await api.post('/api/admin/reset');
    return this.refresh();
  },

  /** Выгрузка состояния для резервной копии */
  async exportState() {
    const data = await api.get('/api/admin/export');
    return JSON.stringify(data, null, 2);
  },
};
