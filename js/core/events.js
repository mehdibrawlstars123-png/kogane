/**
 * Ивенты — общие для всех события Смертельной миграции.
 *
 * Запускает только распорядитель. Состояние приходит в снимке с сервера,
 * поэтому событие само доходит до каждого открытого экрана: оформление
 * системы меняется, включается музыка события, показывается объявление.
 *
 * Модуль подключается на всех страницах и следит за состоянием сам.
 */

import { store } from './store.js?v=10';
import { bus, EV } from './bus.js?v=10';
import { music } from './music.js?v=10';
import { audio } from './audio.js?v=10';

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

function lamps(count) {
  let html = '';
  for (let i = 0; i < count; i += 1) {
    const left = Math.round((i / count) * 100 + (Math.random() * 6 - 3));
    const delay = (Math.random() * 9).toFixed(2);
    const dur = (7 + Math.random() * 7).toFixed(2);
    const size = 6 + Math.round(Math.random() * 10);
    html += `<span class="evfx__lamp" style="left:${left}%;width:${size}px;height:${size}px;`
          + `animation-duration:${dur}s;animation-delay:-${delay}s"></span>`;
  }
  return html;
}

function fxMarkup(id) {
  if (id === 'sukuna') {
    return '<div class="evfx__layer evfx__heat"></div>'
         + '<div class="evfx__slash"></div><div class="evfx__slash"></div>'
         + '<div class="evfx__slash"></div><div class="evfx__slash"></div>';
  }
  if (id === 'duel') {
    // Экран поделён надвое: слева багровая сторона, справа голубая
    return '<div class="evfx__half evfx__half--sukuna"></div>'
         + '<div class="evfx__half evfx__half--gojo"></div>'
         + '<div class="evfx__glow evfx__glow--sukuna"></div>'
         + '<div class="evfx__glow evfx__glow--gojo"></div>'
         + '<div class="evfx__seam"></div>'
         + '<div class="evfx__layer evfx__flash"></div>';
  }
  return '<div class="evfx__layer evfx__mist"></div>' + lamps(18);
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
