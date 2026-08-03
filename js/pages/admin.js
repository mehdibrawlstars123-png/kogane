/**
 * Панель распорядителя игры — оркестратор разделов админки.
 */

import { $, $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { auth } from '../core/auth.js?v=11';
import { crt } from '../core/crt.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { bus, EV } from '../core/bus.js?v=11';
import { wireSounds, headTools, wireNav } from '../core/ui.js?v=11';
import { events } from '../core/events.js?v=11';
import { phase } from '../core/phase.js?v=11';

import { dash } from '../admin/dash.js?v=11';
import { applications } from '../admin/applications.js?v=11';
import { participants } from '../admin/participants.js?v=11';
import { rulesAdmin, noticesAdmin, broadcastAdmin } from '../admin/content.js?v=11';
import { migrationAdmin, logsAdmin, baseAdmin } from '../admin/migration.js?v=11';
import { eventsAdmin } from '../admin/events.js?v=11';
import { adminsAdmin } from '../admin/admins.js?v=11';

crt.init();
wireSounds();

await store.init();
store.startPolling(5000);

const admin = auth.guard({ need: 'admin' });
if (!admin) throw new Error('нет доступа');

// Оформление идущего ивента — распорядитель видит его наравне со всеми
phase.init();   // оформление под фазу игры
events.init();

const PANELS = {
  dash,
  applications,
  participants,
  rules: rulesAdmin,
  notices: noticesAdmin,
  broadcast: broadcastAdmin,
  migration: migrationAdmin,
  events: eventsAdmin,
  admins: adminsAdmin,
  logs: logsAdmin,
  base: baseAdmin,
};

let current = location.hash.replace('#', '') || 'dash';
if (!PANELS[current]) current = 'dash';

const root = $('#panel');

function paintHead() {
  const queue = store.users().filter((u) => u.state === 'applied').length;
  const mig = store.migration();

  $('#hQueue').textContent = String(queue);
  $('#hMigration').textContent = `№${mig.number} ${mig.active ? 'идёт' : 'завершена'}`;

  const badge = $('#queueBadge');
  badge.hidden = queue === 0;
  badge.textContent = String(queue);

  $('#ticker').textContent = `管理者権限 // Все действия фиксируются в журнале. `
    + `Анкет в очереди: ${queue}. Участников: ${store.participants().length}. `
    + `${mig.active ? 'Миграция идёт.' : 'Миграция завершена — аккаунты игроков неактивны.'}`;
}

function go(name, { announce = true } = {}) {
  const panel = PANELS[name];
  if (!panel) return;

  current = name;
  history.replaceState(null, '', `#${name}`);

  $$('.navitem').forEach((b) => b.classList.toggle('is-active', b.dataset.panel === name));
  root.innerHTML = '';
  panel.render(root, { admin, refresh, go });

  if (announce) crt.glitch(root, 200);
  root.scrollTo({ top: 0 });
  $('#nav').classList.remove('is-open');
  paintHead();
}

function refresh() {
  paintHead();
  go(current, { announce: false });
}

/* Навигация */
$$('.navitem[data-panel]').forEach((btn) => on(btn, 'click', () => {
  audio.click();
  go(btn.dataset.panel);
}));

wireNav();   // кнопка меню, затемнение и закрытие касанием мимо
on($('#toSystem'), 'click', () => crt.wipeTo('system.html'));

on(window, 'hashchange', () => {
  const name = location.hash.replace('#', '') || 'dash';
  if (PANELS[name] && name !== current) go(name);
});

/* Инструменты */
$('#headTools').append(headTools({
  onLogout: async () => { await auth.logout(); crt.powerOff('../index.html'); },
}));

/* Часы */
const clockEl = $('#clock');
const tick = () => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU'); };
tick();
setInterval(tick, 1000);

/* Синхронизация с сервером */
bus.on(EV.dbSync, () => {
  // Панель закреплена за распорядителем: если сессия оборвалась или в браузере
  // вошли под участником, панель не должна остаться открытой.
  const now = store.auth();
  if (!now || now.id !== admin.id || now.role !== 'admin') {
    store.stopPolling();
    window.location.replace('../index.html');
    return;
  }

  paintHead();
  if (['dash', 'applications', 'participants', 'logs'].includes(current)) {
    go(current, { announce: false });
  }
});

/* Старт */
go(current, { announce: false });
paintHead();

window.__KOGANE_ADMIN__ = { store, go, refresh };
