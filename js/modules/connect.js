/**
 * Анимация подключения к глобальному барьеру.
 * Показывается после входа и после регистрации.
 *
 * Экран обязан всегда доводить пользователя до системы: есть кнопка
 * пропуска, страховочный таймер и переход даже при ошибке в анимации.
 */

import { $, on } from '../core/dom.js?v=10';
import { audio } from '../core/audio.js?v=10';
import { type, wait } from '../core/typewriter.js?v=10';
import { auth } from '../core/auth.js?v=10';
import { notify } from '../core/notify.js?v=10';
import { trace } from '../core/trace.js?v=10';

const STEPS = [
  { jp: '接続中',   ru: 'Подключение к глобальному барьеру...', sub: 'TENGEN BARRIER NETWORK / HANDSHAKE', at: 22 },
  { jp: '認証',     ru: 'Проверка личности...',                 sub: 'IDENTITY VERIFICATION / KOGANE', at: 48 },
  { jp: '照合',     ru: 'Сверка реестра участников...',          sub: 'REGISTRY CROSS-CHECK / 10 COLONIES', at: 70 },
  { jp: '完了',     ru: 'Идентификация завершена.',              sub: 'ACCESS GRANTED', at: 88 },
  { jp: '死滅回游', ru: 'Добро пожаловать в Смертельную миграцию.', sub: 'WELCOME, SWIMMER', at: 100 },
];

/** Отдельная последовательность для канала администрации */
const ADMIN_STEPS = [
  { jp: '秘密符号', ru: 'Проверка секретного кода...',        sub: 'SECRET CODE / VERIFY', at: 26 },
  { jp: '認証',     ru: 'Сверка полномочий распорядителя...',  sub: 'PRIVILEGE ESCALATION', at: 56 },
  { jp: '完了',     ru: 'Полномочия подтверждены.',            sub: 'ADMIN ACCESS GRANTED', at: 84 },
  { jp: '管理者権限', ru: 'Панель распорядителя открыта.',      sub: 'KOGANE CONTROL', at: 100 },
];

/** Максимальное время показа экрана — дальше переход принудительно */
const FAILSAFE_MS = 7000;

/**
 * @param {object} opts { user, mode: 'login'|'register'|'admin' }
 */
export async function connectSequence({ user, mode = 'login' } = {}) {
  const el = $('#connect');
  const target = auth.routeFor(user);

  // Без разметки экрана просто уходим в систему
  if (!el) { window.location.href = target; return; }

  trace('подключение: запуск', `режим ${mode} → ${target}`);

  let done = false;
  const go = (why) => {
    if (done) return;
    done = true;
    trace('подключение: переход', `${why || 'по завершении'} → ${target}`);
    window.location.replace(target);
  };

  // Выходы навешиваются ДО всего остального: что бы дальше ни случилось
  // с анимацией или звуком, кнопка и клавиши уже работают.
  window.__koganeConnect = true;
  on($('#connectSkip'), 'click', () => go('нажата кнопка «Продолжить»'));
  on(el, 'click', () => go('клик по экрану'));
  on(window, 'keydown', () => go('нажата клавиша'), { once: true });

  // Страховка: анимация не держит пользователя дольше семи секунд
  const failsafe = setTimeout(() => go('сработала страховка по времени'), FAILSAFE_MS);

  el.hidden = false;

  const jp = $('#connectJp');
  const step = $('#connectStep');
  const sub = $('#connectSub');
  const fill = $('#connectFill');

  try {
    audio.power();

    if (mode === 'register') {
      notify.emit('connect', {}, { target: user.id, silent: true });
    }

    for (const s of (mode === 'admin' ? ADMIN_STEPS : STEPS)) {
      if (done) return;

      jp.textContent = s.jp;
      sub.textContent = s.sub;
      fill.style.width = `${s.at}%`;
      audio.scan();
      trace('подключение: шаг', `${s.jp} — ${s.at}%`);

      await type(step, s.ru, { speed: 14, jitter: 6, chunk: 2, caret: true, sound: true });
      await wait(s.at === 100 ? 500 : 240);
    }

    audio.ok();
    el.classList.add('is-done');
    await wait(360);
  } catch (err) {
    // Сбой анимации не должен запирать пользователя на этом экране
    console.error('[connect]', err);
    trace('подключение: СБОЙ', `${err.name}: ${err.message}`);
  } finally {
    clearTimeout(failsafe);
    go();
  }
}
