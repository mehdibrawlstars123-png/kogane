/**
 * Auth — вход, регистрация и ограничение доступа.
 *
 * Проверку пароля и кода делает сервер. Здесь хранится только токен
 * сессии, а текущий участник берётся из снимка состояния.
 */

import { store } from './store.js?v=11';
import { api } from './api.js?v=11';
import { bus, EV } from './bus.js?v=11';
import { trace } from './trace.js?v=11';

export const auth = {
  /** Текущий участник из снимка состояния */
  current() { return store.auth(); },

  isAdmin() { return this.current()?.role === 'admin'; },

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
  },

  /** Регистрация: почта и созданный пароль. Анкета — следующим шагом. */
  async register({ email, password, passwordConfirm }) {
    const mail = String(email || '').trim();

    if (!this.validateEmail(mail)) throw new Error('Адрес почты не распознан системой');
    if (String(password || '').length < 6) throw new Error('Пароль короче шести символов');
    if (passwordConfirm != null && password !== passwordConfirm) {
      throw new Error('Пароли не совпадают');
    }

    const res = await api.post('/api/auth/register', { email: mail, password });
    api.token = res.token;
    await store.refresh({ silent: true });

    trace('регистрация: успех', mail);
    bus.emit(EV.authChange, res.user);
    return res.user;
  },

  /** Вход участника. Распорядитель этим каналом не входит. */
  async login({ email, password }) {
    const res = await api.post('/api/auth/login', { email: String(email).trim(), password });
    api.token = res.token;
    await store.refresh({ silent: true });

    trace('вход: успех', `${res.user.email} · состояние ${res.user.state}`);
    bus.emit(EV.authChange, res.user);
    return res.user;
  },

  /** Вход распорядителя: почта, пароль и секретный код системы */
  async loginAdmin({ email, password, code }) {
    const res = await api.post('/api/auth/admin', {
      email: String(email).trim(), password, code,
    });
    api.token = res.token;
    await store.refresh({ silent: true });

    trace('вход администрации: успех', res.user.email);
    bus.emit(EV.authChange, res.user);
    return res.user;
  },

  async logout() {
    try { await api.post('/api/auth/logout'); } catch { /* сессия и так недействительна */ }
    api.token = null;
    bus.emit(EV.authChange, null);
  },

  /**
   * Проверяет доступ и при необходимости перебрасывает.
   * Вызывается после store.init(), когда снимок уже загружен.
   */
  guard({ need = 'auth', to = null } = {}) {
    const user = this.current();
    const inPages = window.location.pathname.includes('/pages/');
    const base = inPages ? '' : 'pages/';
    const root = inPages ? '../' : '';

    const go = (url, why) => {
      trace('доступ: перенаправление', `${why} → ${url}`);
      window.location.replace(url);
      return null;
    };

    if (!user) return go(to || `${root}index.html`, 'нет сессии');

    if (need === 'admin' && user.role !== 'admin') {
      return go(`${base}system.html`, 'нужен админ, а роль игрока');
    }

    if (need === 'approved' && user.state !== 'approved' && user.role !== 'admin') {
      if (user.state === 'registered') return go(`${base}application.html`, 'анкета не заполнена');
      return go(`${base}pending.html`, `состояние «${user.state}»`);
    }

    trace('доступ: разрешён', `${user.email} · состояние ${user.state}`);
    return user;
  },

  /** Куда отправить участника после входа */
  routeFor(user) {
    const inPages = window.location.pathname.includes('/pages/');
    const p = inPages ? '' : 'pages/';

    let target;
    if (!user) target = inPages ? '../index.html' : 'index.html';
    else if (user.role === 'admin') target = `${p}admin.html`;
    else if (user.state === 'registered') target = `${p}application.html`;
    else if (user.state === 'approved') target = `${p}system.html`;
    else target = `${p}pending.html`;

    trace('маршрут вычислен', `${user ? user.state : 'без пользователя'} → ${target}`);
    return target;
  },
};
