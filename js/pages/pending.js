/**
 * Экран статуса анкеты: ожидание, отказ, одобрение.
 * Слушает изменения базы — решение админа из другой вкладки приходит сразу.
 */

import { $, on } from '../core/dom.js?v=6';
import { store } from '../core/store.js?v=6';
import { auth } from '../core/auth.js?v=6';
import { crt } from '../core/crt.js?v=6';
import { audio } from '../core/audio.js?v=6';
import { wireSounds, headTools, toast } from '../core/ui.js?v=6';
import { bus, EV } from '../core/bus.js?v=6';
import { esc, dt } from '../core/format.js?v=6';
import { APPLICATION_SCHEMA } from '../data/seed.js?v=6';
import { levelById, COLONIES } from '../data/labels.js?v=6';
import { kogane } from '../core/sprites.js?v=6';
import { wait } from '../core/typewriter.js?v=6';

store.init();
crt.init();
wireSounds();

let user = auth.guard({ need: 'auth' });
if (!user) throw new Error('нет доступа');

$('#userMail').textContent = user.email;
$('#headTools').append(headTools({
  onLogout: () => { auth.logout(); crt.powerOff('../index.html'); },
}));

/* ---------------- Предпросмотр анкеты ---------------- */

function labelFor(key) {
  for (const s of APPLICATION_SCHEMA) {
    const f = s.fields.find((x) => x.key === key);
    if (f) return f.label;
  }
  return key;
}

function display(key, value) {
  if (key === 'level') return levelById(value).ru;
  if (key === 'colony') return COLONIES.find((c) => c.id === value)?.ru || value;
  if (typeof value === 'boolean') return value ? 'Да' : 'Нет';
  return value;
}

function previewMarkup(app) {
  if (!app) return '';
  const rows = Object.entries(app)
    .filter(([k, v]) => k !== 'submittedAt' && v !== '' && v != null)
    .map(([k, v]) => `
      <div class="preview__row">
        <span class="preview__key">${esc(labelFor(k))}</span>
        <span class="preview__val">${esc(String(display(k, v)))}</span>
      </div>`).join('');

  return `<div class="preview">
    <div class="panel__head"><span class="panel__title">Отправленная анкета</span><span class="panel__jp jp">申請内容</span></div>
    ${rows}
  </div>`;
}

/* ---------------- Отрисовка состояния ---------------- */

function render() {
  user = store.userById(user.id);
  if (!user) { auth.logout(); window.location.replace('../index.html'); return; }

  const el = $('#verdict');

  if (user.state === 'approved') {
    el.innerHTML = `
      <div class="verdict__jp jp chroma">承認</div>
      <div class="verdict__title">Анкета одобрена</div>
      <p class="verdict__text">
        Участник «${esc(user.character?.name || '')}» внесён в реестр Смертельной миграции.
        Доступ к системе Коганэ открыт.
      </p>
      <div class="mt-5">${kogane()}</div>
      <div class="mt-5"><button class="btn btn--primary btn--lg" id="enter">Войти в систему →</button></div>`;

    audio.ok();
    on($('#enter'), 'click', () => crt.wipeTo('system.html'));
    setTimeout(() => crt.wipeTo('system.html'), 3200);
    return;
  }

  if (user.state === 'rejected') {
    el.innerHTML = `
      <div class="verdict__jp jp chroma" style="color:var(--danger-ink)">却下</div>
      <div class="verdict__title">Анкета отклонена</div>
      <p class="verdict__text">
        ${user.rejectReason ? `Причина: ${esc(user.rejectReason)}` : 'Заявка не прошла проверку распорядителя игры.'}
        <br />Анкету можно исправить и отправить повторно.
      </p>
      <div class="mt-5">
        <button class="btn btn--primary" id="again">Заполнить заново</button>
      </div>
      ${previewMarkup(user.application)}`;

    audio.err();
    crt.glitch($('.screen'), 500);
    on($('#again'), 'click', () => {
      store.updateUser(user.id, { state: 'registered' });
      crt.wipeTo('application.html');
    });
    return;
  }

  if (user.state === 'registered') {
    el.innerHTML = `
      <div class="verdict__jp jp">未提出</div>
      <div class="verdict__title">Анкета не заполнена</div>
      <p class="verdict__text">Заявка на внесение в реестр ещё не отправлена.</p>
      <div class="mt-5"><button class="btn btn--primary" id="fill">Открыть анкету</button></div>`;
    on($('#fill'), 'click', () => crt.wipeTo('application.html'));
    return;
  }

  // applied
  el.innerHTML = `
    <div class="verdict__jp jp chroma">審査中</div>
    <div class="verdict__title">Анкета на рассмотрении</div>
    <p class="verdict__text">
      Заявка передана распорядителю игры${user.application?.submittedAt ? ` ${dt(user.application.submittedAt)}` : ''}.
      Решение появится на этом экране автоматически. Страницу можно не обновлять.
    </p>
    <div class="verdict__wait">Ожидание решения</div>
    ${previewMarkup(user.application)}`;
}

render();

/* Реакция на решение администратора.
   Наблюдение останавливается после первого решения, иначе таймер
   продолжал бы перерисовывать экран и плодить переходы. */
let lastState = user.state;
let timer = null;

const watch = () => {
  const fresh = store.userById(user.id);
  if (!fresh || fresh.state === lastState) return;

  lastState = fresh.state;
  clearInterval(timer);
  bus.off(EV.dbSync, watch);
  bus.off(EV.dbChange, watch);

  crt.tear($('.screen'));
  toast.show({
    type: fresh.state === 'approved' ? 'approved' : 'rejected',
    title: 'Решение принято',
    text: fresh.state === 'approved' ? 'Анкета одобрена распорядителем.' : 'Анкета отклонена.',
    alert: fresh.state !== 'approved',
  });
  wait(600).then(render);
};

bus.on(EV.dbSync, watch);
bus.on(EV.dbChange, watch);
timer = setInterval(watch, 2500);

/* Часы */
const clockEl = $('#clock');
const tick = () => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU'); };
tick();
setInterval(tick, 1000);
