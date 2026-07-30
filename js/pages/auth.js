/**
 * Страница входа: загрузка системы → вход/регистрация → подключение к барьеру.
 */

import { $, $$, on } from '../core/dom.js?v=6';
import { store, DEFAULT_ADMIN_CODE } from '../core/store.js?v=6';
import { auth } from '../core/auth.js?v=6';
import { crt } from '../core/crt.js?v=6';
import { audio } from '../core/audio.js?v=6';
import { kogane } from '../core/sprites.js?v=6';
import { typeLines, type, wait } from '../core/typewriter.js?v=6';
import { wireSounds } from '../core/ui.js?v=6';
import { connectSequence } from '../modules/connect.js?v=6';
import { storage } from '../utils/storage.js?v=6';

store.init();
crt.init();
wireSounds();

/* ---------------- Загрузочная последовательность ---------------- */

const BOOT = [
  { text: 'KOGANE BIOS v1.9.19  //  TENGEN BARRIER NETWORK', pause: 90 },
  { text: '死滅回游 管理システム 起動', class: 'boot__line--jp', pause: 120 },
  { text: 'Проверка целостности ядра системы', class: 'boot__line--ok', pause: 60 },
  { text: 'Инициализация люминофорного вывода', class: 'boot__line--ok', pause: 50 },
  { text: 'Загрузка свода правил: 09 базовых записей', class: 'boot__line--ok', pause: 60 },
  { text: 'Опрос барьеров: 10 колоний', class: 'boot__line--ok', pause: 70 },
  { text: 'Синхронизация реестра участников', class: 'boot__line--ok', pause: 60 },
  { text: '結界網 接続確認 完了', class: 'boot__line--jp', pause: 110 },
  { text: 'Ожидание идентификации участника...', pause: 180 },
];

async function boot() {
  const el = $('#boot');
  const log = $('#bootLog');
  const fill = $('#bootFill');

  // Повторный вход не заставляет смотреть загрузку целиком
  if (storage.get('booted', false)) {
    el.remove();
    return;
  }

  let closed = false;
  const finish = () => {
    if (closed) return;
    closed = true;
    fill.style.width = '100%';
    audio.power();
    storage.set('booted', true);
    el.classList.add('is-done');
    setTimeout(() => el.remove(), 520);
  };

  // Инициализацию можно пропустить в любой момент
  on(el, 'click', finish);
  on(window, 'keydown', finish, { once: true });

  let done = 0;
  await typeLines(log, BOOT, {
    speed: 8,
    jitter: 4,
    chunk: 3,
    onLine: () => {
      done += 1;
      fill.style.width = `${Math.round((done / BOOT.length) * 100)}%`;
    },
  });

  await wait(220);
  finish();
}

/* ---------------- Наполнение афиши ----------------
   Состав реестра и счёт участников до авторизации не раскрываются. */

function paintBrand() {
  $('#brandKogane').innerHTML = kogane();

  // Подсказка о первом входе — только пока код не сменили
  if (!store.security().codeChanged) {
    $('#admHint').innerHTML = 'Первый вход: <b>admin@kogane.jp</b> / пароль <b>kogane</b> / код '
      + `<b>${DEFAULT_ADMIN_CODE}</b>.<br />Смените пароль и код в панели: «База системы» → «Безопасность». `
      + 'Эта подсказка исчезнет после смены кода.';
  }
}

/* ---------------- Часы и бегущая строка ---------------- */

function clock() {
  const el = $('#clock');
  const tick = () => {
    const d = new Date();
    el.textContent = d.toLocaleTimeString('ru-RU');
  };
  tick();
  setInterval(tick, 1000);
}

/* ---------------- Формы ---------------- */

const msg = $('#authMsg');

function setMsg(text, kind = '') {
  msg.textContent = '';
  msg.className = `auth__msg ${kind ? `is-${kind}` : ''}`;
  if (text) type(msg, text, { speed: 10, caret: false, sound: false });
}

function fieldError(form, name, text) {
  const err = form.querySelector(`[data-err="${name}"]`);
  const field = err?.closest('.field');
  if (err) err.textContent = text || '';
  field?.classList.toggle('has-error', Boolean(text));
}

function clearErrors(form) {
  $$('.field', form).forEach((f) => f.classList.remove('has-error'));
  $$('[data-err]', form).forEach((e) => { e.textContent = ''; });
}

/* Переключение вкладок: вход / регистрация / администрация */
const FORMS = { login: '#loginForm', register: '#registerForm', admin: '#adminForm' };

$$('.auth__tab').forEach((tab) => {
  on(tab, 'click', () => {
    $$('.auth__tab').forEach((t) => t.classList.toggle('is-active', t === tab));
    const target = tab.dataset.tab;

    Object.entries(FORMS).forEach(([name, sel]) => {
      $(sel).hidden = name !== target;
    });

    setMsg('');
    crt.glitch($('.auth__panel'), 260);
  });
});

/* Индикатор пароля */
on($('#regPass'), 'input', (e) => {
  const v = e.target.value;
  const score = [v.length >= 6, v.length >= 10, /[A-ZА-Я]/.test(v), /\d|[^\wа-я]/i.test(v)]
    .filter(Boolean).length;
  $$('#pwMeter span').forEach((s, i) => s.classList.toggle('is-on', i < score));
});

/* ---------------- Шаги регистрации: почта → пароль → анкета ---------------- */

function regStep(n) {
  $$('.regpane').forEach((p) => { p.hidden = Number(p.dataset.pane) !== n; });
  $$('.regstep').forEach((s) => {
    const i = Number(s.dataset.rs);
    s.classList.toggle('is-active', i === n);
    s.classList.toggle('is-done', i < n);
  });

  if (n === 2) {
    $('#regMailEcho').textContent = `> ПОЧТА: ${$('#regEmail').value.trim()}`;
    $('#regPass').focus();
  } else {
    $('#regEmail').focus();
  }
}

/* Шаг 1 → 2: проверяем почту до перехода */
on($('[data-rnext="2"]'), 'click', () => {
  const form = $('#registerForm');
  clearErrors(form);

  const email = $('#regEmail').value.trim();
  if (!auth.validateEmail(email)) {
    fieldError(form, 'email', 'Адрес почты не распознан');
    audio.err();
    setMsg('Проверьте адрес почты', 'error');
    return;
  }
  if (store.userByEmail(email)) {
    fieldError(form, 'email', 'Этот адрес уже зарегистрирован');
    audio.err();
    setMsg('Такой участник уже есть — войдите на вкладке «Вход»', 'error');
    return;
  }

  setMsg('');
  audio.click();
  regStep(2);
});

on($('[data-rback="1"]'), 'click', () => { setMsg(''); regStep(1); });

/* Enter в поле почты = кнопка «Далее» */
on($('#regEmail'), 'keydown', (e) => {
  if (e.key === 'Enter') { e.preventDefault(); $('[data-rnext="2"]').click(); }
});

/* Вход */
on($('#loginForm'), 'submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  clearErrors(form);

  const email = $('#loginEmail').value.trim();
  const password = $('#loginPass').value;

  if (!email) { fieldError(form, 'email', 'Укажите адрес почты'); return; }
  if (!password) { fieldError(form, 'password', 'Укажите пароль'); return; }

  const btn = form.querySelector('[type="submit"]');
  btn.classList.add('is-busy');

  try {
    const user = auth.login({ email, password });
    setMsg('Идентификация принята. Установка связи...', 'ok');
    audio.ok();
    await wait(420);
    await connectSequence({ user, mode: 'login' });
  } catch (err) {
    btn.classList.remove('is-busy');
    // Экран подключения не должен остаться поверх формы при отказе
    $('#connect').hidden = true;
    audio.err();
    setMsg(err.message, 'error');
    fieldError(form, 'password', 'Отказ системы');
    crt.glitch($('.screen'), 380);
  }
});

/* Шаг 2 → создание аккаунта и переход к анкете */
on($('#registerForm'), 'submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  clearErrors(form);

  const email = $('#regEmail').value.trim();
  const password = $('#regPass').value;
  const passwordConfirm = $('#regPass2').value;

  let bad = false;
  if (!auth.validateEmail(email)) {
    fieldError(form, 'email', 'Адрес почты не распознан');
    regStep(1);
    bad = true;
  }
  if (password.length < 6) { fieldError(form, 'password', 'Не короче шести символов'); bad = true; }
  else if (password !== passwordConfirm) { fieldError(form, 'passwordConfirm', 'Пароли не совпадают'); bad = true; }

  if (bad) { audio.err(); setMsg('Проверьте поля', 'error'); return; }

  const btn = form.querySelector('[type="submit"]');
  btn.classList.add('is-busy');

  try {
    const user = auth.register({ email, password, passwordConfirm });
    $$('.regstep').forEach((s) => s.classList.add('is-done'));
    setMsg('Аккаунт создан. Открываем анкету персонажа...', 'ok');
    audio.ok();
    await wait(380);
    await connectSequence({ user, mode: 'register' });
  } catch (err) {
    btn.classList.remove('is-busy');
    // Экран подключения не должен остаться поверх формы при отказе
    $('#connect').hidden = true;
    audio.err();
    setMsg(err.message, 'error');
    crt.glitch($('.screen'), 380);
  }
});

/* Вход администрации: почта + пароль + секретный код */
on($('#adminForm'), 'submit', async (e) => {
  e.preventDefault();
  const form = e.currentTarget;
  clearErrors(form);

  const email = $('#admEmail').value.trim();
  const password = $('#admPass').value;
  const code = $('#admCode').value;

  let bad = false;
  if (!email) { fieldError(form, 'email', 'Укажите почту распорядителя'); bad = true; }
  if (!password) { fieldError(form, 'password', 'Укажите пароль'); bad = true; }
  if (!code) { fieldError(form, 'code', 'Требуется секретный код'); bad = true; }
  if (bad) { audio.err(); setMsg('Канал администрации закрыт', 'error'); return; }

  const btn = form.querySelector('[type="submit"]');
  btn.classList.add('is-busy');

  try {
    const user = auth.loginAdmin({ email, password, code });
    setMsg('Код принят. Полномочия распорядителя подтверждены.', 'ok');
    audio.ok();
    await wait(420);
    await connectSequence({ user, mode: 'admin' });
  } catch (err) {
    btn.classList.remove('is-busy');
    // Экран подключения не должен остаться поверх формы при отказе
    $('#connect').hidden = true;
    audio.err();
    setMsg(err.message, 'error');
    if (/код/i.test(err.message)) fieldError(form, 'code', 'Код отклонён');
    else fieldError(form, 'password', 'Отказ системы');
    crt.glitch($('.screen'), 460);
    $('#admCode').value = '';
  }
});

/* CRT-переключатель */
on($('#crtToggle'), 'click', (e) => {
  const mode = crt.cycleMode();
  e.currentTarget.textContent = `CRT: ${mode}`;
});

/* ---------------- Запуск ---------------- */

paintBrand();
clock();
boot();

// Уже вошедшего пользователя сразу отправляем дальше
const existing = auth.current();
if (existing) {
  setMsg(`Активная сессия: ${existing.email}. Переход в систему...`, 'ok');
  setTimeout(() => crt.wipeTo(auth.routeFor(existing)), 900);
}
