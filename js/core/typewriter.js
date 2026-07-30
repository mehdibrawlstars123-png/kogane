/**
 * Typewriter — посимвольный вывод текста с «печатью» терминала.
 */

import { audio } from './audio.js?v=6';

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Счётчик запусков печати: новый вызов отменяет предыдущий для того же
 *  элемента, иначе два цикла дописывают символы одновременно и текст
 *  перемешивается (видно при быстрой смене сообщений). */
let seq = 0;

/**
 * Печатает текст в элемент.
 * @returns {Promise<void>}
 */
export function type(el, text, {
  speed = 22,
  jitter = 14,
  caret = true,
  sound = true,
  clear = true,
  chunk = 1,      // сколько символов выводить за такт (для длинных логов)
} = {}) {
  if (!el) return Promise.resolve();

  // Отменяем предыдущую печать в этом элементе
  const token = ++seq;
  el.__typeToken = token;

  if (clear) el.textContent = '';
  if (caret) el.classList.add('caret');

  if (reduced) {
    el.textContent = text;
    el.classList.remove('caret');
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    let i = 0;

    const step = () => {
      // Печать вытеснена более новым вызовом — молча выходим
      if (el.__typeToken !== token) { resolve(); return; }

      if (i >= text.length) {
        if (caret) el.classList.remove('caret');
        resolve();
        return;
      }

      const piece = text.slice(i, i + chunk);
      el.textContent += piece;
      i += piece.length;

      if (sound && piece.trim() && i % 2 === 0) audio.blip();

      // Пауза на знаках препинания держит ритм терминала, но с потолком:
      // без ограничения строка вида «Подключение...» растягивалась на секунду.
      const last = piece[piece.length - 1];
      const pause = /[.,:;!?…]/.test(last)
        ? Math.min(speed * 5, 70)
        : speed + Math.random() * jitter;
      setTimeout(step, pause);
    };

    step();
  });
}

/** Последовательная печать нескольких строк в контейнер */
export async function typeLines(container, lines, {
  speed = 16,
  jitter = 10,
  chunk = 1,
  lineClass = 'boot__line',
  gap = 120,
  onLine,
} = {}) {
  for (const line of lines) {
    const text = typeof line === 'string' ? line : line.text;
    const cls = typeof line === 'string' ? lineClass : `${lineClass} ${line.class || ''}`;

    const el = document.createElement('div');
    el.className = cls;
    container.append(el);
    container.scrollTop = container.scrollHeight;

    onLine?.(line, el);
    await type(el, text, { speed, jitter, chunk, caret: false, clear: false });
    await wait(typeof line === 'object' && line.pause != null ? line.pause : gap);
  }
}

/** Эффект «расшифровки»: символы перебираются, затем встают на место */
export function scramble(el, text, { duration = 700, chars = '0123456789ABCDEF回点結界東京' } = {}) {
  if (!el) return Promise.resolve();
  if (reduced || document.hidden) { el.textContent = text; return Promise.resolve(); }

  const start = performance.now();

  return new Promise((resolve) => {
    const frame = (now) => {
      const t = Math.min((now - start) / duration, 1);
      const solid = Math.floor(text.length * t);

      let out = text.slice(0, solid);
      for (let i = solid; i < text.length; i += 1) {
        out += text[i] === ' ' ? ' ' : chars[(Math.random() * chars.length) | 0];
      }
      el.textContent = out;

      if (t < 1) requestAnimationFrame(frame);
      else { el.textContent = text; resolve(); }
    };
    requestAnimationFrame(frame);
  });
}

/** Числовой счётчик с «набегом» значения */
export function countTo(el, target, { duration = 900, suffix = '', pad = 0 } = {}) {
  if (!el) return;
  const from = Number(String(el.textContent).replace(/\D/g, '')) || 0;

  // Ведущие нули как на экранах Коганэ: 000 / 100
  const fmt = (n) => `${String(n).padStart(pad, '0')}${suffix}`;

  // Скрытая вкладка не рисует кадры — показываем итоговое значение сразу
  if (reduced || document.hidden) { el.textContent = fmt(target); return; }

  const start = performance.now();
  const step = (now) => {
    const t = Math.min((now - start) / duration, 1);
    const eased = 1 - (1 - t) ** 3;
    el.textContent = fmt(Math.round(from + (target - from) * eased));
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms));
