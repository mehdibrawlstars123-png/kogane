/**
 * Auth — регистрация, вход, сессия, ограничение доступа.
 */

import { store } from './store.js?v=6';
import { storage } from '../utils/storage.js?v=6';
import { bus, EV } from './bus.js?v=6';

const SESSION = 'session';

export const auth = {
  /** Текущий пользователь или null */
  current() {
    const id = storage.get(SESSION);
    if (!id) return null;
    const user = store.userById(id);
    if (!user) { storage.remove(SESSION); return null; }
    return user;
  },

  isAdmin() { return this.current()?.role === 'admin'; },

  validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email).trim());
  },

  /** Регистрация: почта и созданный пароль. Анкета заполняется следующим шагом. */
  register({ email, password, passwordConfirm }) {
    const mail = String(email || '').trim();

    if (!this.validateEmail(mail)) throw new Error('Адрес почты не распознан системой');
    if (String(password || '').length < 6) throw new Error('Пароль короче шести символов');
    if (passwordConfirm != null && password !== passwordConfirm) {
      throw new Error('Пароли не совпадают');
    }
    if (store.userByEmail(mail)) throw new Error('Этот адрес уже зарегистрирован в барьере');

    const user = store.createUser({ email: mail, password });
    store.log(mail, 'register', 'Новая регистрация в системе.');
    storage.set(SESSION, user.id);
    bus.emit(EV.authChange, user);
    return user;
  },

  /** Вход участника. Учётная запись распорядителя этим каналом не входит. */
  login({ email, password }) {
    const user = store.userByEmail(email);
    if (!user || user.pass !== store.hash(String(password || ''))) {
      throw new Error('Неверная почта или пароль');
    }

    if (user.role === 'admin') {
      store.log(String(email), 'login-denied', 'Попытка входа распорядителя через канал участника.', 'warn');
      throw new Error('Эта учётная запись входит только через канал администрации');
    }

    storage.set(SESSION, user.id);
    store.log(user.email, 'login', 'Вход в систему.');
    bus.emit(EV.authChange, user);
    return user;
  },

  /**
   * Вход распорядителя игры: почта, пароль и секретный код системы.
   * Код хранится хешем и меняется в самой панели.
   */
  loginAdmin({ email, password, code }) {
    const user = store.userByEmail(email);

    if (!store.checkAdminCode(code)) {
      store.log(String(email || '—'), 'code-denied', 'Неверный секретный код администрации.', 'danger');
      throw new Error('Секретный код отклонён системой');
    }

    if (!user || user.role !== 'admin' || user.pass !== store.hash(String(password || ''))) {
      store.log(String(email || '—'), 'login-denied', 'Отказ входа в администрацию.', 'warn');
      throw new Error('Неверная почта или пароль распорядителя');
    }

    storage.set(SESSION, user.id);
    store.log(user.email, 'login-admin', 'Вход распорядителя игры подтверждён кодом.');
    bus.emit(EV.authChange, user);
    return user;
  },

  logout() {
    const user = this.current();
    if (user) store.log(user.email, 'logout', 'Выход из системы.');
    storage.remove(SESSION);
    bus.emit(EV.authChange, null);
  },

  /**
   * Проверяет доступ и при необходимости перебрасывает.
   * @param {object} opts { need: 'auth'|'approved'|'admin', to: string }
   */
  guard({ need = 'auth', to = null } = {}) {
    const user = this.current();
    const base = window.location.pathname.includes('/pages/') ? '' : 'pages/';
    const root = window.location.pathname.includes('/pages/') ? '../' : '';

    const go = (url) => { window.location.replace(url); return null; };

    if (!user) return go(to || `${root}index.html`);

    if (need === 'admin' && user.role !== 'admin') {
      return go(`${base}system.html`);
    }

    if (need === 'approved' && user.state !== 'approved' && user.role !== 'admin') {
      if (user.state === 'registered') return go(`${base}application.html`);
      return go(`${base}pending.html`);
    }

    return user;
  },

  /** Куда отправить пользователя после входа */
  routeFor(user) {
    const inPages = window.location.pathname.includes('/pages/');
    const p = inPages ? '' : 'pages/';

    if (!user) return inPages ? '../index.html' : 'index.html';
    if (user.role === 'admin') return `${p}admin.html`;
    if (user.state === 'registered') return `${p}application.html`;
    if (user.state === 'approved') return `${p}system.html`;
    return `${p}pending.html`;
  },
};
