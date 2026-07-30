/**
 * CRT — оверлеи старого монитора и служебные эффекты экрана.
 * Разметка вставляется в body, чтобы не дублировать её в HTML.
 */

import { storage } from '../utils/storage.js?v=6';

const LAYERS = [
  'crt-scanlines',
  'crt-mask',
  'crt-flicker',
  'crt-sweep',
  'crt-vignette',
  'crt-noise',
];

export const crt = {
  init() {
    if (document.querySelector('.crt-scanlines')) return;

    const frag = document.createDocumentFragment();
    LAYERS.forEach((cls) => {
      const el = document.createElement('div');
      el.className = `crt-layer ${cls}`;
      frag.append(el);
    });
    document.body.append(frag);

    const mode = storage.get('crt', 'on');
    document.documentElement.dataset.crt = mode;
  },

  /** on | lite | off */
  setMode(mode) {
    document.documentElement.dataset.crt = mode;
    storage.set('crt', mode);
  },

  cycleMode() {
    const order = ['on', 'lite', 'off'];
    const cur = document.documentElement.dataset.crt || 'on';
    const next = order[(order.indexOf(cur) + 1) % order.length];
    this.setMode(next);
    return next;
  },

  /** Короткий сбой сигнала на элементе */
  glitch(el = document.querySelector('.screen'), ms = 420) {
    if (!el) return;
    el.classList.add('signal-loss');
    setTimeout(() => el.classList.remove('signal-loss'), ms);
  },

  /** Разрыв строк */
  tear(el = document.querySelector('.screen')) {
    if (!el) return;
    el.classList.add('tear');
    setTimeout(() => el.classList.remove('tear'), 520);
  },

  /** Пиксельный переход и навигация */
  wipeTo(url, delay = 380) {
    const wipe = document.createElement('div');
    wipe.className = 'pixel-wipe';
    document.body.append(wipe);
    setTimeout(() => { window.location.href = url; }, delay);
  },

  /** Выключение экрана с последующим переходом */
  powerOff(url) {
    const screen = document.querySelector('.screen');
    screen?.classList.add('is-off');
    setTimeout(() => { if (url) window.location.href = url; }, 480);
  },
};
