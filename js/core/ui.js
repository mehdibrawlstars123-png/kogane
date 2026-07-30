/**
 * UI — тосты, модальные окна, подтверждения, общие фрагменты разметки.
 */

import { $, create, lockScroll, unlockScroll } from './dom.js?v=6';
import { sprite } from './sprites.js?v=6';
import { audio } from './audio.js?v=6';
import { NOTICE_TYPES } from '../data/labels.js?v=6';
import { type } from './typewriter.js?v=6';
import { esc } from './format.js?v=6';

/* =================== Тосты уведомлений =================== */

function box() {
  let el = $('.toasts');
  if (!el) {
    el = create('div', { class: 'toasts', 'aria-live': 'polite' });
    document.body.append(el);
  }
  return el;
}

export const toast = {
  show({ type: kind = 'broadcast', title, text, life = 6500, alert = false } = {}) {
    const meta = NOTICE_TYPES[kind] || NOTICE_TYPES.broadcast;

    const el = create('div', {
      class: `toast ${alert ? 'toast--alert' : ''}`,
      style: `--toast-life:${life}ms`,
    });

    el.innerHTML = `
      <div class="toast__icon">${sprite(meta.icon, { scale: 3 })}</div>
      <div class="toast__body">
        <div class="toast__title">
          <span>${esc(title || meta.ru)}</span>
          <span class="jp">${meta.jp}</span>
        </div>
        <div class="toast__text"></div>
      </div>
      <div class="toast__bar"></div>`;

    box().prepend(el);
    audio.notice();

    const textEl = el.querySelector('.toast__text');
    if (text) type(textEl, text, { speed: 12, caret: false, sound: false });

    const close = () => {
      el.classList.add('is-out');
      setTimeout(() => el.remove(), 320);
    };

    const timer = setTimeout(close, life);
    el.addEventListener('click', () => { clearTimeout(timer); close(); });

    return el;
  },

  ok(title, text) { audio.ok(); return this.show({ type: 'approved', title, text }); },
  err(title, text) { audio.err(); return this.show({ type: 'rejected', title, text, alert: true }); },
};

/* =================== Модальные окна =================== */

let openModal = null;

export const modal = {
  /**
   * @returns {HTMLElement} корневой элемент окна
   */
  open({ title = 'Система', jp = '', body = '', foot = '', wide = false, narrow = false } = {}) {
    this.close();

    const el = create('div', {
      class: `modal ${wide ? 'modal--wide' : ''} ${narrow ? 'modal--narrow' : ''}`,
    });

    el.innerHTML = `
      <div class="modal__veil" data-close></div>
      <div class="modal__win" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="modal__head">
          <span class="modal__title">${title}</span>
          <span class="modal__jp">${jp}</span>
          <button class="modal__close" type="button" data-close aria-label="Закрыть">✕</button>
        </div>
        <div class="modal__body">${body}</div>
        ${foot ? `<div class="modal__foot">${foot}</div>` : ''}
      </div>`;

    document.body.append(el);
    lockScroll();

    // Принудительный reflow вместо requestAnimationFrame: в фоновой вкладке
    // кадры не рисуются и окно осталось бы невидимым.
    void el.offsetWidth;
    el.classList.add('is-open');

    el.addEventListener('click', (e) => {
      if (e.target.closest('[data-close]')) this.close();
    });

    openModal = el;
    audio.click();
    return el;
  },

  close() {
    if (!openModal) return;
    const el = openModal;
    openModal = null;
    el.classList.remove('is-open');
    unlockScroll();
    setTimeout(() => el.remove(), 260);
  },

  /** Подтверждение действия. @returns {Promise<boolean>} */
  confirm({ title = 'Подтверждение', jp = '確認', text = '', okText = 'Подтвердить', danger = false }) {
    return new Promise((resolve) => {
      const el = this.open({
        title,
        jp,
        narrow: true,
        body: `<p class="mono fs-xs" style="line-height:1.8">${text}</p>`,
        foot: `
          <button class="btn btn--ghost btn--sm" type="button" data-no>Отмена</button>
          <button class="btn ${danger ? 'btn--danger' : 'btn--primary'} btn--sm" type="button" data-yes>${okText}</button>`,
      });

      el.querySelector('[data-yes]').addEventListener('click', () => { this.close(); resolve(true); });
      el.querySelector('[data-no]').addEventListener('click', () => { this.close(); resolve(false); });
      el.querySelector('.modal__veil').addEventListener('click', () => resolve(false));
    });
  },

  /** Запрос значения. @returns {Promise<string|null>} */
  prompt({ title = 'Ввод', jp = '入力', label = '', value = '', area = false, okText = 'Принять' }) {
    return new Promise((resolve) => {
      const el = this.open({
        title,
        jp,
        narrow: !area,
        body: `
          <label class="field">
            <span class="field__label">${label}</span>
            ${area
              ? `<textarea class="field__area" data-val rows="5">${value}</textarea>`
              : `<span class="field__wrap"><input class="field__input" data-val value="${String(value).replace(/"/g, '&quot;')}"></span>`}
          </label>`,
        foot: `
          <button class="btn btn--ghost btn--sm" type="button" data-no>Отмена</button>
          <button class="btn btn--primary btn--sm" type="button" data-yes>${okText}</button>`,
      });

      const input = el.querySelector('[data-val]');
      input.focus();

      const done = (v) => { this.close(); resolve(v); };
      el.querySelector('[data-yes]').addEventListener('click', () => done(input.value.trim()));
      el.querySelector('[data-no]').addEventListener('click', () => done(null));
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !area) done(input.value.trim());
      });
    });
  },
};

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') modal.close();
});

/* =================== Звук по наведению =================== */

export function wireSounds(root = document) {
  root.addEventListener('pointerenter', (e) => {
    if (e.target.closest?.('.btn, .navitem, .roster__row, .chip, .atab')) audio.hover();
  }, true);

  root.addEventListener('click', (e) => {
    if (e.target.closest?.('.btn, .navitem, .chip, .atab, .auth__tab')) audio.click();
  }, true);
}

/* =================== Переключатели в шапке =================== */

export function headTools({ onLogout } = {}) {
  const wrap = create('div', { class: 'row' });

  const sound = create('button', { class: 'btn btn--sm btn--ghost', type: 'button' });
  sound.textContent = audio.enabled ? 'Звук: вкл' : 'Звук: выкл';
  sound.addEventListener('click', () => {
    sound.textContent = audio.toggle() ? 'Звук: вкл' : 'Звук: выкл';
  });

  const exit = create('button', { class: 'btn btn--sm', type: 'button' });
  exit.textContent = 'Отключиться';
  exit.addEventListener('click', () => onLogout?.());

  wrap.append(sound, exit);
  return wrap;
}
