/**
 * Анкета персонажа: пошаговая форма, автосохранение черновика,
 * валидация и отправка на рассмотрение распорядителю.
 */

import { $, $$, on, create } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { auth } from '../core/auth.js?v=11';
import { crt } from '../core/crt.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { toast, wireSounds, headTools } from '../core/ui.js?v=11';
import { esc } from '../core/format.js?v=11';
import { APPLICATION_SCHEMA } from '../data/seed.js?v=11';
import { levelOptions, COLONIES } from '../data/labels.js?v=11';
import { storage } from '../utils/storage.js?v=11';
import { wait } from '../core/typewriter.js?v=11';
import { events } from '../core/events.js?v=11';
import { phase } from '../core/phase.js?v=11';
import { debounce } from '../utils/helpers.js?v=11';

crt.init();
wireSounds();

await store.init();
phase.init();   // оформление под фазу игры
events.init();   // оформление идущего ивента

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

// Карточка мувсета из Workshop. Если анкету уже подавали, показываем прежнюю:
// после отказа участник правит замечания, а не ищет картинку заново.
let card = user.card || '';

/* ---------------- Карточка персонажа ----------------

   Снимок с телефона может весить десять мегабайт. Такое нельзя ни хранить
   в базе, ни отдавать в каждом ответе состояния, поэтому картинка
   уменьшается прямо в браузере: длинная сторона до 1100 точек, JPEG.  */

const CARD_MAX_SIDE = 1100;
const CARD_MAX_BYTES = 1_200_000;

function readImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Файл не похож на изображение'));
      img.src = reader.result;
    };
    reader.onerror = () => reject(new Error('Файл не прочитался'));
    reader.readAsDataURL(file);
  });
}

async function shrink(file) {
  const img = await readImage(file);
  const scale = Math.min(1, CARD_MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  // Подбираем качество, пока не уложимся в разрешённый размер
  for (const q of [0.86, 0.72, 0.6, 0.48]) {
    const out = canvas.toDataURL('image/jpeg', q);
    if (out.length <= CARD_MAX_BYTES) return out;
  }
  throw new Error('Изображение слишком тяжёлое даже после сжатия');
}

function paintCard() {
  const preview = $('#cardPreview');
  const clear = $('#cardClear');
  if (!preview) return;

  if (card) {
    preview.innerHTML = `<img class="cardpick__img" src="${card}" alt="Карточка персонажа" />`;
    preview.classList.add('is-filled');
    if (clear) clear.hidden = false;
  } else {
    preview.innerHTML = '<span class="cardpick__empty jp">画像</span>'
                      + '<span class="cardpick__hint">Карточка не выбрана</span>';
    preview.classList.remove('is-filled');
    if (clear) clear.hidden = true;
  }
}

function wireCard() {
  const input = $('#cardFile');
  if (!input) return;

  on($('#cardBtn'), 'click', () => input.click());

  on(input, 'change', async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      toast.err('Не изображение', 'Подойдёт PNG или JPG');
      return;
    }

    try {
      card = await shrink(file);
    } catch (err) {
      audio.err();
      toast.err('Карточка не принята', err.message);
      return;
    }

    audio.ok();
    paintCard();
    toast.ok('Карточка загружена', 'Распорядитель увидит её вместе с анкетой');
  });

  on($('#cardClear'), 'click', () => {
    card = '';
    paintCard();
  });

  paintCard();
}

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
    case 'card':
      // Картинка не уходит в общий сбор значений: она тяжёлая и хранится
      // отдельным полем. Здесь только предпросмотр и кнопка выбора файла.
      return `<div class="field field--wide" data-key="${f.key}">
        ${label}
        <div class="cardpick" id="cardPick">
          <div class="cardpick__preview" id="cardPreview">
            <span class="cardpick__empty jp">画像</span>
            <span class="cardpick__hint">Карточка не выбрана</span>
          </div>
          <div class="cardpick__side">
            <input type="file" id="cardFile" accept="image/*" hidden />
            <button class="btn btn--sm btn--primary" type="button" id="cardBtn">Выбрать изображение</button>
            <button class="btn btn--sm btn--ghost" type="button" id="cardClear" hidden>Убрать</button>
            <p class="fs-xxs muted mono">
              PNG или JPG. Снимок уменьшается автоматически, ничего сжимать заранее не нужно.
            </p>
          </div>
        </div>
        ${hint}
        <span class="field__error"></span>
      </div>`;

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
    if (f.type === 'card') return;   // изображение отправляется отдельным полем
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

    if (f.type === 'card') {
      const errEl = wrapEl?.querySelector('.field__error');
      const пусто = f.required && !card;
      if (errEl && !silent) errEl.textContent = пусто ? 'Загрузите карточку персонажа' : '';
      wrapEl?.classList.toggle('has-error', Boolean(пусто) && !silent);
      if (пусто) ok = false;
      return;
    }

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
wireCard();
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
    await store.submitApplication(user.id, data, card);
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
