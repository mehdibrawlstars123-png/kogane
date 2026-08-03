/**
 * Подтверждение участия в объявленной миграции.
 *
 * Распорядитель объявляет миграцию — она начинается не сразу. Сначала
 * пятнадцать минут идёт окно подтверждения: каждому участнику показывается
 * одно окно с одной кнопкой. Отказа нет — кто не нажал, тот пропустил.
 *
 * Окно закрывается само, когда участие подтверждено или окно истекло.
 */

import { $, on, create } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { toast } from '../core/ui.js?v=11';
import { crt } from '../core/crt.js?v=11';

let el = null;
let timer = null;

function mmss(ms) {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function build(number) {
  el = create('div', { class: 'joinscr' });
  el.innerHTML = `
    <div class="joinscr__win">
      <div class="joinscr__jp jp">参加確認</div>
      <div class="joinscr__title">Подтвердить участие</div>

      <p class="joinscr__text">
        Распорядитель объявил миграцию №${number}. Чтобы войти в неё,
        подтвердите участие. Стартовый счёт — 85 очков.
      </p>
      <p class="joinscr__warn">
        Если не подтвердить до конца отсчёта, миграция засчитывается
        как пропущенная. Три пропуска подряд — предел.
      </p>

      <div class="joinscr__clock" id="joinClock">--:--</div>

      <button class="btn btn--primary btn--lg" type="button" id="joinBtn">
        Принять участие
      </button>
    </div>`;

  document.body.appendChild(el);

  on($('#joinBtn', el), 'click', async () => {
    const btn = $('#joinBtn', el);
    btn.classList.add('is-busy');
    btn.disabled = true;

    try {
      await store.joinMigration();
    } catch (err) {
      btn.classList.remove('is-busy');
      btn.disabled = false;
      audio.err();
      toast.err('Не подтверждено', err.message);
      return;
    }

    audio.ok();
    close();
    toast.ok('Участие подтверждено', `Вы в миграции №${number}`);
    crt.tear($('.screen'));
  });
}

function close() {
  if (timer) { clearInterval(timer); timer = null; }
  if (el) { el.remove(); el = null; }
}

/**
 * Показывает или снимает окно по состоянию системы.
 * Вызывается при загрузке страницы и на каждом обновлении снимка.
 */
export function checkConfirm() {
  const нужно = store.phase() === 'confirm'
    && store.auth()?.state === 'approved'
    && store.auth()?.role !== 'admin'
    && !store.confirmed();

  if (!нужно) { close(); return; }
  if (el) return;

  build(store.migration().number);
  audio.notice();

  const tick = () => {
    const left = store.confirmLeft();
    const clock = el && $('#joinClock', el);
    if (clock) clock.textContent = mmss(left);
    // Время вышло — окно снимается, решение принимает сервер
    if (left <= 0) close();
  };
  tick();
  timer = setInterval(tick, 1000);
}
