/**
 * Панель распорядителя игры — оркестратор разделов админки.
 */

import { $, $$, on } from '../core/dom.js?v=9';
import { store } from '../core/store.js?v=9';
import { auth } from '../core/auth.js?v=9';
import { crt } from '../core/crt.js?v=9';
import { audio } from '../core/audio.js?v=9';
import { bus, EV } from '../core/bus.js?v=9';
import { wireSounds, headTools } from '../core/ui.js?v=9';

import { dash } from '../admin/dash.js?v=9';
import { applications } from '../admin/applications.js?v=9';
import { participants } from '../admin/participants.js?v=9';
import { rulesAdmin, noticesAdmin, broadcastAdmin } from '../admin/content.js?v=9';
import { migrationAdmin, logsAdmin, baseAdmin } from '../admin/migration.js?v=9';

store.init();
crt.init();
wireSounds();

const admin = auth.guard({ need: 'admin' });
if (!admin) throw new Error('нет доступа');

const PANELS = {
  dash,
  applications,
  participants,
  rules: rulesAdmin,
  notices: noticesAdmin,
  broadcast: broadcastAdmin,
  migration: migrationAdmin,
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

on($('#navToggle'), 'click', () => $('#nav').classList.toggle('is-open'));
on($('#toSystem'), 'click', () => crt.wipeTo('system.html'));

on(window, 'hashchange', () => {
  const name = location.hash.replace('#', '') || 'dash';
  if (PANELS[name] && name !== current) go(name);
});

/* Инструменты */
$('#headTools').append(headTools({
  onLogout: () => { auth.logout(); crt.powerOff('../index.html'); },
}));

/* Часы */
const clockEl = $('#clock');
const tick = () => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU'); };
tick();
setInterval(tick, 1000);

/* Синхронизация с другими вкладками */
bus.on(EV.dbSync, () => {
  paintHead();
  if (['dash', 'applications', 'participants', 'logs'].includes(current)) {
    go(current, { announce: false });
  }
});

/* Старт */
go(current, { announce: false });
paintHead();

window.__KOGANE_ADMIN__ = { store, go, refresh };
