/**
 * Просьба приложить карточку мувсета.
 *
 * Участники, зарегистрированные до появления этого поля, карточки не имеют.
 * При входе в систему им открывается окно посреди экрана: выбрать снимок
 * карточки из Roblox Workshop и отправить. Окно закрывается само, как только
 * карточка сохранена, и больше не появляется.
 *
 * Отложить можно — окно вернётся при следующем заходе.
 */

import { $, on, create } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { toast } from '../core/ui.js?v=11';

const MAX_SIDE = 1100;
const MAX_BYTES = 1_200_000;

let el = null;
let card = '';

/* ---------------- Уменьшение снимка ---------------- */

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
  const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
  const w = Math.max(1, Math.round(img.width * scale));
  const h = Math.max(1, Math.round(img.height * scale));

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);

  for (const q of [0.86, 0.72, 0.6, 0.48]) {
    const out = canvas.toDataURL('image/jpeg', q);
    if (out.length <= MAX_BYTES) return out;
  }
  throw new Error('Изображение слишком тяжёлое даже после сжатия');
}

/* ---------------- Окно ---------------- */

function close() {
  el?.remove();
  el = null;
  card = '';
}

function paint() {
  const preview = $('#askPreview', el);
  const send = $('#askSend', el);
  if (!preview) return;

  if (card) {
    preview.innerHTML = `<img class="cardpick__img" src="${card}" alt="Карточка мувсета" />`;
    preview.classList.add('is-filled');
    send.disabled = false;
  } else {
    preview.innerHTML = '<span class="cardpick__empty jp">画像</span>'
                      + '<span class="cardpick__hint">Изображение не выбрано</span>';
    preview.classList.remove('is-filled');
    send.disabled = true;
  }
}

function build() {
  el = create('div', { class: 'joinscr' });
  el.innerHTML = `
    <div class="joinscr__win joinscr__win--wide">
      <div class="joinscr__jp jp">技表登録</div>
      <div class="joinscr__title">Приложите карточку мувсета</div>

      <p class="joinscr__text">
        Вы регистрировались до того, как система стала запрашивать карточку
        персонажа. Загрузите снимок своей карточки из Roblox Workshop —
        она появится в вашем профиле, и распорядитель увидит её рядом с анкетой.
      </p>

      <div class="cardpick__preview" id="askPreview">
        <span class="cardpick__empty jp">画像</span>
        <span class="cardpick__hint">Изображение не выбрано</span>
      </div>

      <input type="file" id="askFile" accept="image/*" hidden />
      <div class="btn-row">
        <button class="btn btn--sm" type="button" id="askPick">Выбрать изображение</button>
        <button class="btn btn--sm btn--primary" type="button" id="askSend" disabled>Отправить</button>
        <button class="btn btn--sm btn--ghost" type="button" id="askLater">Позже</button>
      </div>

      <p class="fs-xxs muted mono">
        PNG или JPG. Снимок уменьшается автоматически. Можно отложить —
        система напомнит при следующем входе.
      </p>
    </div>`;

  document.body.appendChild(el);

  const input = $('#askFile', el);
  on($('#askPick', el), 'click', () => input.click());

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
    paint();
  });

  on($('#askSend', el), 'click', async () => {
    const btn = $('#askSend', el);
    btn.classList.add('is-busy');
    btn.disabled = true;

    try {
      await store.setCard(card);
    } catch (err) {
      btn.classList.remove('is-busy');
      btn.disabled = false;
      audio.err();
      toast.err('Не сохранено', err.message);
      return;
    }

    audio.ok();
    close();
    toast.ok('Карточка сохранена', 'Она появилась в вашем профиле');
  });

  on($('#askLater', el), 'click', close);
  paint();
}

/**
 * Показывает окно, если у одобренного участника карточки нет.
 * Вызывается один раз при загрузке системы.
 */
export function askForCard() {
  const me = store.auth();
  if (!me || me.role === 'admin' || me.state !== 'approved') return;
  if (me.card) return;
  if (el) return;

  build();
  audio.notice();
}
