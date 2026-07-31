/**
 * Клиент API системы Коганэ.
 *
 * Токен сессии хранится в браузере, сами данные — на сервере.
 * Ошибки приходят с понятным русским текстом из ответа сервера.
 */

import { storage } from '../utils/storage.js?v=10';

const TOKEN = 'token';

export const api = {
  get token() { return storage.get(TOKEN, null); },
  set token(value) {
    if (value) storage.set(TOKEN, value);
    else storage.remove(TOKEN);
  },

  /**
   * Запрос к API.
   * @throws {Error} с текстом ошибки от сервера
   */
  async request(path, { method = 'GET', body = null } = {}) {
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    if (this.token) headers.Authorization = `Bearer ${this.token}`;

    let res;
    try {
      res = await fetch(path, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        cache: 'no-store',
      });
    } catch {
      throw new Error('Нет связи с сервером системы');
    }

    if (res.status === 204) return null;

    let data = null;
    try { data = await res.json(); } catch { data = null; }

    if (!res.ok) {
      // Сессия истекла или отозвана — токен больше не нужен
      if (res.status === 401) this.token = null;
      throw new Error(data?.detail || `Ошибка системы (${res.status})`);
    }

    return data;
  },

  get(path) { return this.request(path); },
  post(path, body) { return this.request(path, { method: 'POST', body }); },
  patch(path, body) { return this.request(path, { method: 'PATCH', body }); },
  del(path) { return this.request(path, { method: 'DELETE' }); },
};
