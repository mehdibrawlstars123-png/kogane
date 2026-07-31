/**
 * Анкета персонажа: пошаговая форма, автосохранение черновика,
 * валидация и отправка на рассмотрение распорядителю.
 */

import { $, $$, on, create } from '../core/dom.js?v=10';
import { store } from '../core/store.js?v=10';
import { auth } from '../core/auth.js?v=10';
import { crt } from '../core/crt.js?v=10';
import { audio } from '../core/audio.js?v=10';
import { toast, wireSounds, headTools } from '../core/ui.js?v=10';
import { esc } from '../core/format.js?v=10';
import { APPLICATION_SCHEMA } from '../data/seed.js?v=10';
import { levelOptions, COLONIES } from '../data/labels.js?v=10';
import { storage } from '../utils/storage.js?v=10';
import { wait } from '../core/typewriter.js?v=10';
import { debounce } from '../utils/helpers.js?v=10';

crt.init();
wireSounds();

await store.init();

const user = auth.guard({ need: 'auth' });
if (!user) throw new Error('нет доступа');

// Анкета открыта тем, кто её ещё не подавал, и тем, кому отказали:
// после отказа участник правит замечания и отправляет заново.
// Отправленную на рассмотрение и уже одобренную править нечего —
// прерываем выполнение модуля, чтобы не строить форму «в пустоту».
if (user.state !== 'registered' && user.state !== 'rejected') {
  window.location.replace(user.state === 'approved' ? 'system.html' : 'pending.html');
  throw new Error('переход на актуальный экран');
}

$('#userMail').textContent = user.email;
$('#appNo').textContent = `№ ${user.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`;
$('#headTools').append(headTools({
  onLogout: async () => { await auth.logout(); crt.powerOff('../index.html'); },
}));

const DRAFT = `draft:${user.id}`;

// Черновик, а если он пуст — прошлая заявка: после отказа распорядителя
// участник правит замечания, а не заполняет анкету с нуля.
// Пустой черновик (все поля пустые) считается отсутствующим.
const filled = (obj) => Boolean(obj) && Object.entries(obj).some(
  ([k, v]) => k !== 'submittedAt' && (typeof v === 'string' ? v.trim() !== '' : Boolean(v)),
);

const savedDraft = storage.get(DRAFT, null);
let draft = filled(savedDraft) ? savedDraft : (user.application || {});
let current = 0;

/* ---------------- Построение полей ---------------- */

function fieldMarkup(f) {
  const id = `f-${f.key}`;
  const req = f.required ? '<span class="field__req">*</span>' : '';
  const hint = f.hint ? `<span class="field__hint"><span>${esc(f.hint)}</span>${f.max ? '<span class="field__count" data-count></span>' : ''}</span>` : '';
  const value = draft[f.key] ?? '';

  const label = `<span class="field__label">${esc(f.label)} ${req}</span>`;

  // Длинные поля и согласия занимают всю ширину сетки
  const wide = ['area', 'check'].includes(f.type) ? ' field--wide' : '';

  switch (f.type) {
    case 'area':
      return `<label class="field${wide}" data-key="${f.key}" for="${id}">
        ${label}
        <textarea class="field__area" id="${id}" name="${f.key}" maxlength="${f.max || 4000}"
          rows="${f.max > 1500 ? 8 : 5}">${esc(value)}</textarea>
        ${hint}
        <span class="field__error"></span>
      </label>`;

    case 'select':
      return `<label class="field" data-key="${f.key}" for="${id}">
        ${label}
        <select class="field__select" id="${id}" name="${f.key}">
          <option value="">— не выбрано —</option>
          ${f.options.map((o) => `<option value="${esc(o)}" ${value === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}
        </select>
        <span class="field__error"></span>
      </label>`;

    case 'level':
      return `<label class="field" data-key="${f.key}" for="${id}">
        ${label}
        <select class="field__select" id="${id}" name="${f.key}">
          <option value="">— не выбрано —</option>
          ${levelOptions().map((l) => `<option value="${l.id}" ${value === l.id ? 'selected' : ''}>${l.jp} — ${l.ru}</option>`).join('')}
        </select>
        <span class="field__error"></span>
      </label>`;

    case 'colony':
      return `<label class="field" data-key="${f.key}" for="${id}">
        ${label}
        <select class="field__select" id="${id}" name="${f.key}">
          <option value="">— не выбрано —</option>
          ${COLONIES.map((c) => `<option value="${c.id}" ${value === c.id ? 'selected' : ''}>${c.jp} — ${c.ru}</option>`).join('')}
        </select>
        <span class="field__error"></span>
      </label>`;

    case 'check':
      return `<div class="field${wide}" data-key="${f.key}">
        <label class="check">
          <input type="checkbox" name="${f.key}" id="${id}" ${value ? 'checked' : ''} />
          <span class="check__box"></span>
          <span>${esc(f.label)} ${req}</span>
        </label>
        <span class="field__error"></span>
      </div>`;

    default:
      return `<label class="field" data-key="${f.key}" for="${id}">
        ${label}
        <span class="field__wrap">
          <input class="field__input" id="${id}" name="${f.key}" type="text"
                 maxlength="${f.max || 200}" value="${esc(value)}" />
        </span>
        ${hint}
        <span class="field__error"></span>
      </label>`;
  }
}

function build() {
  const stepsEl = $('#steps');
  const wrap = $('#fieldsets');

  stepsEl.innerHTML = APPLICATION_SCHEMA
    .map((s, i) => `<span class="step ${i === 0 ? 'is-active' : ''}" data-step="${i}">${i + 1}. ${s.step}</span>`)
    .join('');

  // Поля идут в порядке схемы: раньше длинные поля выносились наверх
  // и «Согласен с правилами» оказывался перед выбором колонии.
  wrap.innerHTML = APPLICATION_SCHEMA.map((s, i) => `
    <fieldset class="fset" data-fset="${i}" ${i === 0 ? '' : 'hidden'}>
      <legend class="fset__legend">
        <span class="fset__no jp">0${i + 1}</span>
        <span class="fset__title">${s.step}</span>
        <span class="fset__jp jp">${s.jp}</span>
      </legend>
      <div class="field-grid">
        ${s.fields.map((f) => fieldMarkup(f)).join('')}
      </div>
    </fieldset>`).join('');

  // Счётчики символов
  $$('[data-count]').forEach((counter) => {
    const field = counter.closest('.field');
    const input = field.querySelector('.field__area, .field__input');
    if (!input) return;
    const max = input.getAttribute('maxlength');
    const paint = () => { counter.textContent = `${input.value.length} / ${max}`; };
    paint();
    on(input, 'input', paint);
  });
}

/* ---------------- Шаги ---------------- */

/**
 * Показ раздела анкеты. Схема может состоять из одного раздела —
 * тогда навигация по шагам не нужна и кнопки отсутствуют в разметке.
 */
function showStep(index) {
  current = Math.max(0, Math.min(index, APPLICATION_SCHEMA.length - 1));
  const last = current === APPLICATION_SCHEMA.length - 1;

  $$('.fset').forEach((f) => { f.hidden = Number(f.dataset.fset) !== current; });
  $$('.step').forEach((s, i) => {
    s.classList.toggle('is-active', i === current);
    s.classList.toggle('is-done', i < current);
  });

  const prev = $('#prevStep');
  const next = $('#nextStep');
  const submit = $('#submitApp');

  if (prev) prev.disabled = current === 0;
  if (next) next.hidden = last;
  if (submit) submit.hidden = !last;

  $('.sys-main')?.scrollTo({ top: 0, behavior: 'smooth' });
  crt.glitch($('#fieldsets'), 220);
}

/* ---------------- Валидация ---------------- */

function collect() {
  const data = {};
  APPLICATION_SCHEMA.forEach((s) => s.fields.forEach((f) => {
    const el = $(`[name="${f.key}"]`);
    if (!el) return;
    data[f.key] = f.type === 'check' ? el.checked : el.value.trim();
  }));
  return data;
}

/** Минимальная длина для содержательных полей */
const LONG_MIN = { techDesc: 40 };

function validateStep(index, { silent = false } = {}) {
  const schema = APPLICATION_SCHEMA[index];
  let ok = true;

  schema.fields.forEach((f) => {
    const wrapEl = $(`.fset[data-fset="${index}"] [data-key="${f.key}"]`);
    const el = $(`[name="${f.key}"]`);
    const errEl = wrapEl?.querySelector('.field__error');
    if (!el || !wrapEl) return;

    const value = f.type === 'check' ? el.checked : el.value.trim();
    let error = '';

    if (f.required && (f.type === 'check' ? !value : !value.length)) {
      error = f.type === 'check' ? 'Требуется согласие' : 'Поле обязательно к заполнению';
    } else if (LONG_MIN[f.key] && value.length && value.length < LONG_MIN[f.key]) {
      error = `Требуется не менее ${LONG_MIN[f.key]} символов (сейчас ${value.length})`;
    }

    if (!silent) {
      if (errEl) errEl.textContent = error;
      wrapEl.classList.toggle('has-error', Boolean(error));
    }
    if (error) ok = false;
  });

  return ok;
}

/* ---------------- Автосохранение ---------------- */

const save = debounce(() => {
  draft = collect();
  storage.set(DRAFT, draft);
  const s = $('#saveState');
  s.textContent = 'черновик сохранён';
  setTimeout(() => { s.textContent = 'черновик сохраняется автоматически'; }, 1400);
}, 700);

/* ---------------- События ---------------- */

build();
showStep(0);

on($('#appForm'), 'input', save);
on($('#appForm'), 'change', save);

/* Кнопки навигации есть только у многошаговой схемы */
on($('#nextStep'), 'click', () => {
  if (!validateStep(current)) {
    audio.err();
    toast.err('Шаг не пройден', 'Заполните обязательные поля этого раздела.');
    crt.glitch($('#fieldsets'), 300);
    return;
  }
  audio.click();
  showStep(current + 1);
});

on($('#prevStep'), 'click', () => showStep(current - 1));

$$('.step').forEach((s) => on(s, 'click', () => {
  const target = Number(s.dataset.step);
  if (target <= current || validateStep(current)) showStep(target);
}));

on($('#appForm'), 'submit', async (e) => {
  e.preventDefault();

  const bad = APPLICATION_SCHEMA.findIndex((_, i) => !validateStep(i, { silent: true }));
  if (bad !== -1) {
    showStep(bad);
    validateStep(bad);
    audio.err();
    toast.err('Анкета не отправлена', 'Есть незаполненные обязательные поля.');
    return;
  }

  const btn = $('#submitApp');
  btn.classList.add('is-busy');

  const data = collect();

  try {
    await store.submitApplication(user.id, data);
  } catch (err) {
    btn.classList.remove('is-busy');
    audio.err();
    toast.err('Анкета не отправлена', err.message);
    return;
  }

  storage.remove(DRAFT);
  audio.ok();
  toast.ok('Анкета отправлена', 'Заявка передана распорядителю игры.');
  await wait(900);
  crt.wipeTo('pending.html');
});

/* Часы */
const clockEl = $('#clock');
const tick = () => { clockEl.textContent = new Date().toLocaleTimeString('ru-RU'); };
tick();
setInterval(tick, 1000);
