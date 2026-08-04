/**
 * Ивенты — общие для всех события Смертельной миграции.
 *
 * Запускает только распорядитель. Состояние приходит в снимке с сервера,
 * поэтому событие само доходит до каждого открытого экрана: оформление
 * системы меняется, включается музыка события, показывается объявление.
 *
 * Модуль подключается на всех страницах и следит за состоянием сам.
 */

import { store } from './store.js?v=11';
import { bus, EV } from './bus.js?v=11';
import { music } from './music.js?v=11';
import { audio } from './audio.js?v=11';

export const EVENTS = {
  sukuna: {
    title: 'Сукуна в истинной форме',
    jp: '宿儺・真の姿',
    sub: 'Показатели проклятой энергии вышли за пределы шкалы. '
       + 'Система переведена в аварийное оформление.',
  },
  duel: {
    title: 'Сукуна против Годзё',
    jp: '宿儺 対 五条',
    sub: 'Столкновение двух особых уровней. '
       + 'Изображение системы рвётся между двумя источниками энергии.',
  },
  parade: {
    title: 'Парад тысячи духов',
    jp: '百鬼夜行',
    sub: 'Ночное шествие проклятий началось. '
       + 'Не покидайте укрытие до окончания парада.',
  },
};

let applied = null;   // что показано на этом экране сейчас
let layer = null;
let booted = false;   // первая отрисовка уже прошла

/* ---------------- Слой эффектов ---------------- */

/** Случайное число в промежутке — для разброса частиц */
const меж = (a, b) => a + Math.random() * (b - a);

/** Угли Сукуны: искры, поднимающиеся снизу вверх */
function embers(count) {
  let html = '';
  for (let i = 0; i < count; i += 1) {
    const left = Math.round(меж(0, 100));
    const size = меж(2, 5).toFixed(1);
    const dur = меж(5, 11).toFixed(1);
    const delay = меж(0, 11).toFixed(1);
    const drift = меж(-6, 6).toFixed(1);
    html += `<span class="evfx__ember" style="left:${left}%;width:${size}px;height:${size}px;`
          + `--drift:${drift}vw;animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }
  return html;
}

/** Искры на шве столкновения: разлетаются от центра в обе стороны */
function sparks(count) {
  let html = '';
  for (let i = 0; i < count; i += 1) {
    const влево = i % 2 === 0;
    const top = Math.round(меж(8, 92));
    const dx = (меж(8, 34) * (влево ? -1 : 1)).toFixed(1);
    const dy = меж(-22, 10).toFixed(1);
    const dur = меж(0.9, 2.2).toFixed(2);
    const delay = меж(0, 2.4).toFixed(2);
    html += `<span class="evfx__spark" style="top:${top}%;--dx:${dx}vw;--dy:${dy}vh;`
          + `animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }
  return html;
}

/** Фонари и духи шествия */
function lanterns(count) {
  let html = '';
  for (let i = 0; i < count; i += 1) {
    const left = Math.round((i / count) * 100 + меж(-4, 4));
    const scale = меж(0.7, 1.6);
    const dur = меж(11, 21).toFixed(1);
    const delay = меж(0, 20).toFixed(1);
    html += `<span class="evfx__lamp" style="left:${left}%;`
          + `width:${(10 * scale).toFixed(1)}px;height:${(14 * scale).toFixed(1)}px;`
          + `animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }
  for (let i = 0; i < Math.ceil(count / 3); i += 1) {
    const left = Math.round(меж(4, 96));
    const dur = меж(20, 34).toFixed(1);
    const delay = меж(0, 30).toFixed(1);
    const scale = меж(0.8, 1.8).toFixed(2);
    html += `<span class="evfx__wisp" style="left:${left}%;transform-origin:50% 100%;`
          + `width:${(26 * scale).toFixed(0)}px;height:${(46 * scale).toFixed(0)}px;`
          + `animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }
  return html;
}

/** Слои эффекта под конкретное событие */
function fxMarkup(id) {
  // На телефоне частиц вдвое меньше: слабым устройствам тяжело,
  // а на узком экране они всё равно сливаются
  const тесно = window.innerWidth < 640;

  if (id === 'sukuna') {
    return '<div class="evfx__layer evfx__heat"></div>'
         + '<div class="evfx__shock"></div>'
         + '<div class="evfx__cut"></div><div class="evfx__cut"></div>'
         + '<div class="evfx__cut"></div><div class="evfx__cut"></div>'
         + embers(тесно ? 10 : 22);
  }

  if (id === 'duel') {
    // Экран поделён надвое: слева багровая сторона, справа голубая
    return '<div class="evfx__half evfx__half--sukuna"></div>'
         + '<div class="evfx__half evfx__half--gojo"></div>'
         + '<div class="evfx__glow evfx__glow--sukuna"></div>'
         + '<div class="evfx__glow evfx__glow--gojo"></div>'
         + '<div class="evfx__seam"></div>'
         + sparks(тесно ? 8 : 18)
         + '<div class="evfx__layer evfx__flash"></div>';
  }

  return '<div class="evfx__layer evfx__mist"></div>'
       + '<div class="evfx__march"></div>'
       + lanterns(тесно ? 8 : 16);
}

/** Объявление о начале — показывается один раз, тем, кто это застал */
function hail(id) {
  const info = EVENTS[id];
  if (!info || !layer) return;

  const el = document.createElement('div');
  el.className = 'evfx__hail';
  el.innerHTML = `
    <div class="evfx__jp jp">${info.jp}</div>
    <div class="evfx__title">${info.title}</div>
    <p class="evfx__sub">${info.sub}</p>`;
  layer.appendChild(el);

  const screen = document.querySelector('.screen');
  if (screen) {
    screen.classList.add('ev-shake');
    setTimeout(() => screen.classList.remove('ev-shake'), 1900);
  }

  setTimeout(() => el.remove(), 5600);
}

/* ---------------- Применение состояния ---------------- */

/**
 * Метка в шапке: что за событие идёт прямо сейчас.
 *
 * Разметка шапки на разных экранах разная, поэтому метку кладём рядом
 * с инструментами — в их собственного родителя, а не наугад.
 */
function badge(id) {
  const existing = document.getElementById('evBadge');
  if (!id || !EVENTS[id]) { existing?.remove(); return; }

  const tools = document.getElementById('headTools');
  const host = tools?.parentElement || document.querySelector('.sys-head__meta, .sys-head');
  if (!host) return;

  const el = existing || document.createElement('span');
  el.id = 'evBadge';
  el.className = 'ev-badge';
  el.innerHTML = `<span class="jp">${EVENTS[id].jp}</span>`
               + `<span class="hide-sm">${EVENTS[id].title}</span>`;

  if (!existing) {
    if (tools && tools.parentElement === host) host.insertBefore(el, tools);
    else host.appendChild(el);
  }
}

function apply(id, { announce = false } = {}) {
  if (id === applied) return;
  applied = id;

  if (layer) { layer.remove(); layer = null; }

  if (!id || !EVENTS[id]) {
    document.documentElement.removeAttribute('data-event');
    badge(null);
    document.getElementById('evPlay')?.remove();
    music.stop();
    return;
  }

  // Перекраска — первым делом: даже если украшения не построятся,
  // событие всё равно будет видно
  document.documentElement.setAttribute('data-event', id);
  try { badge(id); } catch { /* шапка другой формы — метка необязательна */ }

  layer = document.createElement('div');
  layer.className = `evfx evfx--${id}`;
  layer.setAttribute('aria-hidden', 'true');
  layer.innerHTML = fxMarkup(id);
  document.body.appendChild(layer);

  if (announce) hail(id);
  startMusic(id);
}

/**
 * Музыка события: сначала запись, назначенная распорядителем
 * (ссылка на YouTube или свой файл), и только если её не удалось
 * запустить — встроенная тема системы.
 */
async function startMusic(id) {
  const src = store.eventMusic(id);

  if (src && src.kind !== 'synth' && src.url) {
    const ok = await music.play({ kind: src.kind, url: src.url });
    if (ok) {
      // Браузер мог принять запуск, но не дать звук до действия пользователя
      setTimeout(() => { if (applied === id) askForGesture(id); }, 1200);
      return;
    }
  }

  if (applied === id) music.start(id);
}

/**
 * Кнопка «включить музыку».
 *
 * До первого нажатия браузер не разрешает звук — это правило самого
 * браузера, обойти его нельзя. Если запись не пошла, показываем кнопку
 * рядом с меткой события: одно нажатие, и музыка идёт.
 */
function askForGesture(id) {
  if (music.externalPlaying) { document.getElementById('evPlay')?.remove(); return; }
  if (document.getElementById('evPlay')) return;

  const badgeEl = document.getElementById('evBadge');
  if (!badgeEl) return;

  const btn = document.createElement('button');
  btn.id = 'evPlay';
  btn.type = 'button';
  btn.className = 'ev-badge ev-badge--play';
  btn.textContent = '♪ включить музыку';
  btn.addEventListener('click', () => {
    audio.unlock();
    music.resume();
    setTimeout(() => { if (music.externalPlaying) btn.remove(); }, 800);
  });
  badgeEl.insertAdjacentElement('afterend', btn);
}

/* ---------------- Слежение за состоянием ---------------- */

function currentId() {
  const ev = store.event();
  return ev && ev.id && EVENTS[ev.id] ? ev.id : null;
}

function sync() {
  const id = currentId();
  // Объявление — только когда событие сменилось при открытом экране.
  // На первой отрисовке страницы его не показываем: участник мог зайти
  // посреди события и не должен каждый раз смотреть заставку заново.
  apply(id, { announce: booted && id !== null && id !== applied });
}

export const events = {
  /**
   * Подключает слежение. Вызывается один раз при старте страницы —
   * после того, как состояние уже загружено с сервера.
   */
  init() {
    apply(currentId(), { announce: false });
    booted = true;

    bus.on(EV.dbChange, () => sync());

    // Музыка не заводится до первого действия пользователя: браузер
    // не даёт запустить звук сам. Догоняем при первом же нажатии.
    const kick = () => {
      if (!applied) return;
      // Запись уже загружена — просто снимаем запрет браузера;
      // иначе поднимаем источник заново
      if (music.source) { music.resume(); document.getElementById('evPlay')?.remove(); }
      else startMusic(applied);
    };
    window.addEventListener('pointerdown', kick, { once: true });
    window.addEventListener('keydown', kick, { once: true });

    // Вернули громкость посреди события — музыка должна зазвучать снова
    audio.onUnmute(kick);
  },

  /** Что идёт сейчас на этом экране */
  get current() { return applied; },

  /** Показать событие немедленно — распорядителю, сразу после запуска */
  announce(id) {
    apply(id, { announce: false });
    if (id) {
      audio.unlock();
      hail(id);
      startMusic(id);
    }
  },

  /** Перезапустить музыку — после смены источника в панели */
  reloadMusic() {
    music.stop();
    if (applied) startMusic(applied);
  },
};
