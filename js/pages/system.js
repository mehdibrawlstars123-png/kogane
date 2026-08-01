/**
 * Система Коганэ — оркестратор разделов.
 * Роутинг по hash, синхронизация с базой, реакция на действия админа.
 */

import { $, $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { auth } from '../core/auth.js?v=11';
import { crt } from '../core/crt.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { bus, EV } from '../core/bus.js?v=11';
import { wireSounds, headTools, wireNav, toast } from '../core/ui.js?v=11';
import { pts, esc } from '../core/format.js?v=11';
import { colonyById } from '../data/labels.js?v=11';
import { checkDeath, hideDeathScreen } from '../modules/death.js?v=11';
import { shownToasts } from '../core/notify.js?v=11';
import { events } from '../core/events.js?v=11';

import { home } from '../sections/home.js?v=11';
import { profile } from '../sections/profile.js?v=11';
import { roster } from '../sections/roster.js?v=11';
import { search } from '../sections/search.js?v=11';
import { shop } from '../sections/shop.js?v=11';
import { rules } from '../sections/rules.js?v=11';
import { notices } from '../sections/notices.js?v=11';
import { adminGate } from '../sections/admin-gate.js?v=11';

crt.init();
wireSounds();

// Состояние приходит с сервера, поэтому загрузка ожидается до отрисовки
await store.init();
events.init();   // оформление идущего ивента
store.startPolling(4000);

let user = auth.guard({ need: 'approved' });
if (!user) throw new Error('нет доступа');

// Страница закреплена за тем, кто её открыл. Если в браузере войдут под другим
// лицом, экран участника не должен молча стать чужим — уходим на вход.
const SESSION_ID = user.id;

const SECTIONS = { home, profile, roster, search, shop, rules, notices, admin: adminGate };
let currentView = (location.hash.replace('#', '') || 'home');
if (!SECTIONS[currentView]) currentView = 'home';

/* ---------------- Контекст участника ---------------- */

/**
 * Сессия оборвалась: аккаунт удалён распорядителем, срок токена вышел
 * или в этом браузере вошли под другим лицом. Уводим на экран входа один раз —
 * иначе опрос сервера будет спотыкаться о пустого участника каждые две секунды.
 */
let released = false;
function release() {
  if (released) return;
  released = true;
  store.stopPolling();
  window.location.replace('../index.html');
}

function me() {
  const fresh = store.userById(SESSION_ID);
  if (!fresh) {
    release();
    // Пустой контекст на один такт: страница уже уходит на экран входа
    return {
      id: user.id, name: user.email, nameJp: '', level: 'g4',
      points: 0, rules: 0, colony: 'tokyo1', status: 'active',
    };
  }

  user = fresh;
  const c = user.character || {};
  return {
    id: user.id,
    name: c.name || user.email,
    nameJp: c.nameJp || '',
    level: c.level || 'g4',
    points: c.points || 0,
    rules: c.rules || 0,
    colony: c.colony || 'tokyo1',
    status: c.status || 'active',
  };
}

/* ---------------- Шапка ---------------- */

function paintHead() {
  const m = me();
  $('#hName').textContent = m.name;
  $('#hPoints').textContent = pts(m.points);
  $('#hRules').textContent = pts(m.rules, 2);

  const unread = store.unreadCount(user.id);
  const badge = $('#noticeBadge');
  badge.hidden = unread === 0;
  badge.textContent = String(unread);

  const mig = store.migration();
  $('#ticker').textContent = mig.active
    ? `天元 // Миграция №${mig.number} идёт. Барьер «${colonyById(m.colony).ru}». `
      + `Участников в игре: ${store.participants().filter((p) => p.status !== 'dead').length}. `
      + 'За выбывание участника — 5 очков, за неучастника — 1 очко.'
    : `天元 // Миграция №${mig.number} завершена. Барьеры свёрнуты.`;
}

/* Состояние, с которым сверяется наблюдатель изменений */
let lastState = {
  points: me().points,
  colony: me().colony,
  level: me().level,
  status: me().status,
  noticeTs: store.notifications(user.id)[0]?.ts || 0,
  migration: store.migration().active,
};

/* ---------------- Рендер раздела ---------------- */

function renderView(name, { announce = true } = {}) {
  const section = SECTIONS[name];
  if (!section) return;

  currentView = name;
  history.replaceState(null, '', `#${name}`);

  $$('.navitem').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => { v.hidden = v.id !== `view-${name}`; });

  // me() перечитывает пользователя из базы и обновляет ссылку `user`.
  // Вызываем ДО передачи ctx, иначе после синхронизации между вкладками
  // в раздел попал бы устаревший объект пользователя.
  const snapshot = me();

  // Открытие раздела уведомлений считается прочтением
  if (name === 'notices') store.markRead().catch(() => {});

  const root = $(`#view-${name}`);
  section.render(root, { user, me: snapshot, refresh });

  if (announce) crt.glitch(root, 220);
  $('#main').scrollTo({ top: 0 });
  $('#nav').classList.remove('is-open');
  paintHead();
}

function refresh() {
  // Уведомления, порождённые действием самого участника, уже показаны
  // ему тостом на месте — наблюдатель не должен всплывать ими повторно.
  const latest = store.notifications(user.id)[0];
  if (latest && lastState) lastState.noticeTs = Math.max(lastState.noticeTs, latest.ts);

  paintHead();
  renderView(currentView, { announce: false });
}

/* ---------------- Навигация ---------------- */

$$('.navitem').forEach((btn) => on(btn, 'click', () => {
  audio.click();
  renderView(btn.dataset.view);
}));

wireNav();   // кнопка меню, затемнение и закрытие касанием мимо

// Переходы из блоков («все →»)
on(document, 'click', (e) => {
  const goto = e.target.closest('[data-goto]');
  if (goto) renderView(goto.dataset.goto);
});

on(window, 'hashchange', () => {
  const name = location.hash.replace('#', '') || 'home';
  if (SECTIONS[name] && name !== currentView) renderView(name);
});

/* Горячие клавиши: 1…8 переключают разделы, если не набирают текст */
const ORDER = ['home', 'profile', 'roster', 'search', 'shop', 'rules', 'notices', 'admin'];

on(document, 'keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
  if (document.querySelector('.modal.is-open')) return;

  const n = Number(e.key);
  if (n >= 1 && n <= ORDER.length) {
    audio.click();
    renderView(ORDER[n - 1]);
  }
});

/* ---------------- Инструменты в шапке ---------------- */

$('#headTools').append(headTools({
  onLogout: async () => { await auth.logout(); crt.powerOff('../index.html'); },
}));

/* ---------------- Часы ---------------- */

const clockEl = $('#clock');
const tickClock = () => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU'); };
tickClock();
setInterval(tickClock, 1000);

/* ---------------- Реакция на изменения системы ---------------- */

function watch() {
  const fresh = store.auth();
  if (!fresh || fresh.id !== SESSION_ID) { release(); return; }
  user = fresh;

  const m = me();
  const mig = store.migration();

  // Новые уведомления. Сверяем по времени и по уже показанным id,
  // иначе собственная покупка правила всплывала бы тостом дважды.
  const list = store.notifications(user.id);
  const unseen = list.filter((n) => n.ts > lastState.noticeTs && !shownToasts.has(n.id));

  if (list[0] && list[0].ts > lastState.noticeTs) {
    lastState.noticeTs = list[0].ts;
    unseen.reverse().forEach((n) => {
      shownToasts.add(n.id);
      toast.show({
        type: n.type,
        title: n.title,
        text: n.text,
        alert: ['rejected', 'penalty', 'migEnd', 'death', 'ruleTaken'].includes(n.type),
      });
    });
    paintHead();
  }

  // Выбывание участника
  if (m.status === 'dead' && lastState.status !== 'dead') {
    lastState.status = 'dead';
    lastState.migration = mig.active;
    checkDeath(user, { silentIfDead: false });
    return;
  }

  // Возврат в игру решением распорядителя: экран выбывания нужно снять,
  // иначе участник остаётся заперт за ним даже с активным статусом.
  if (m.status !== 'dead' && lastState.status === 'dead') {
    lastState.status = m.status;
    hideDeathScreen();
    toast.show({
      type: 'approved',
      title: 'Возвращение в игру',
      text: 'Распорядитель вернул вас в Смертельную миграцию. Доступ восстановлен.',
    });
    refresh();
    return;
  }

  // Новая миграция: снимаем экран смерти и возвращаем участника в игру
  if (mig.active && !lastState.migration) {
    lastState.migration = true;
    lastState.status = m.status;
    hideDeathScreen();
    toast.show({ type: 'migStart', title: `Миграция №${mig.number} начата`, text: 'Барьеры развёрнуты заново. Доступ восстановлен.' });
    refresh();
    return;
  }

  if (!mig.active && lastState.migration) {
    lastState.migration = false;
    if (m.status === 'dead') { checkDeath(user); return; }
  }

  // Изменения участника администратором
  if (m.points !== lastState.points || m.colony !== lastState.colony || m.level !== lastState.level) {
    lastState = { ...lastState, points: m.points, colony: m.colony, level: m.level };
    crt.tear($('.screen'));
    refresh();
  }
}

bus.on(EV.dbSync, watch);
bus.on(EV.dbChange, () => paintHead());
setInterval(watch, 2000);

/* ---------------- Старт ---------------- */

// Игрок уже выбыл — сразу финальный экран
if (checkDeath(user, { silentIfDead: true })) {
  // Участник выбыл — разделы не отрисовываем, показан только экран выбывания
} else {
  // Непрочитанные не сбрасываем при входе — счётчик в меню должен показать,
  // что происходило, пока участник был отключён.
  renderView(currentView, { announce: false });
  paintHead();
}

window.__KOGANE__ = { store, auth, renderView, refresh };
