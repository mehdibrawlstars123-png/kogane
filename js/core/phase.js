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

/**
 * Небо позади панели — только в нейтральный период.
 *
 * Облака собираются из нескольких пятен и раскладываются по трём планам:
 * дальний идёт медленно и размыт, ближний крупный и резкий. Так у неба
 * появляется глубина, а не «кружки едут по фону».
 */
function cloud(plan, { top, scale, dur, delay, opacity }) {
  const el = document.createElement('span');
  el.className = `sky__cloud sky__cloud--${plan}`;
  el.style.cssText = `top:${top}%;width:${Math.round(220 * scale)}px;`
                   + `height:${Math.round(78 * scale)}px;opacity:${opacity};`
                   + `animation-duration:${dur}s;animation-delay:-${delay}s`;

  // Пятна: длинное основание и два-три «кома» сверху
  const пятна = [
    [0, 42, 100, 58],
    [10, 4, 46, 74],
    [42, 14, 40, 62],
    [64, 26, 34, 52],
  ];
  el.innerHTML = пятна
    .map(([x, y, w, h]) => `<i style="left:${x}%;top:${y}%;width:${w}%;height:${h}%"></i>`)
    .join('');
  return el;
}

function buildSky() {
  if (sky) return;

  sky = document.createElement('div');
  sky.className = 'sky';
  sky.setAttribute('aria-hidden', 'true');

  sky.innerHTML = '<div class="sky__rays"></div><div class="sky__sun"></div>'
                + '<div class="sky__city sky__city--far"></div>'
                + '<div class="sky__glow"></div>'
                + '<div class="sky__city"></div>'
                + '<div class="sky__birds"><b></b><b></b><b></b><b></b></div>';

  // На узком экране планов меньше: телефону хватает и трёх облаков
  const тесно = window.innerWidth < 640;
  const планы = [
    ['far',  тесно ? 2 : 4, { s: [0.55, 0.8],  d: [150, 210], t: [6, 34] }],
    ['mid',  тесно ? 2 : 4, { s: [0.85, 1.2],  d: [95, 140],  t: [14, 48] }],
    ['near', тесно ? 1 : 3, { s: [1.3, 1.9],   d: [58, 88],   t: [30, 62] }],
  ];

  планы.forEach(([plan, count, r]) => {
    for (let i = 0; i < count; i += 1) {
      const меж = (a, b) => a + Math.random() * (b - a);
      sky.appendChild(cloud(plan, {
        top: Math.round(меж(r.t[0], r.t[1])),
        scale: меж(r.s[0], r.s[1]),
        dur: меж(r.d[0], r.d[1]).toFixed(1),
        delay: (Math.random() * Number(r.d[1])).toFixed(1),
        opacity: (plan === 'far' ? 0.5 : plan === 'mid' ? 0.75 : 0.95).toFixed(2),
      }));
    }
  });

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
