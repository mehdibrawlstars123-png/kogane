/**
 * Оформление под фазу игры.
 *
 * neutral — между миграциями: небо, облака, стеклянные панели
 * confirm — миграция объявлена, идёт подтверждение участия
 * active  — миграция идёт: тёмный, серьёзный вид
 *
 * Работает как модуль событий: ставит признак на корень документа,
 * а перекраску делает CSS. Следит за состоянием сам.
 */

import { store } from './store.js?v=11';
import { bus, EV } from './bus.js?v=11';

let applied = null;
let sky = null;

/** Небо с облаками позади панели — только в нейтральный период */
function buildSky() {
  if (sky) return;

  sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');

  // Немного облаков разного размера и скорости: на узком экране меньше
  const count = window.innerWidth < 640 ? 4 : 7;
  let html = '<div class="sky__glow"></div><div class="sky__city"></div>';

  for (let i = 0; i < count; i += 1) {
    const w = 180 + Math.round(Math.random() * 320);
    const h = Math.round(w * (0.32 + Math.random() * 0.2));
    const top = Math.round(6 + Math.random() * 55);
    const dur = (46 + Math.random() * 60).toFixed(1);
    const delay = (Math.random() * 60).toFixed(1);
    const op = (0.45 + Math.random() * 0.4).toFixed(2);
    html += `<span class="sky__cloud" style="width:${w}px;height:${h}px;top:${top}%;`
          + `opacity:${op};animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }

  sky.innerHTML = html;
  document.body.prepend(sky);
}

function dropSky() {
  if (!sky) return;
  sky.remove();
  sky = null;
}

function apply(phase) {
  if (phase === applied) return;
  applied = phase;

  document.documentElement.setAttribute('data-phase', phase);

  if (phase === 'neutral') buildSky();
  else dropSky();
}

export const phase = {
  /** Что сейчас на экране */
  get current() { return applied; },

  /**
   * Включает слежение. Вызывается после загрузки состояния —
   * оформление меняется вместе с фазой, без перезагрузки страницы.
   */
  init() {
    apply(store.phase());
    bus.on(EV.dbChange, () => apply(store.phase()));
  },
};
