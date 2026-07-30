/**
 * Полноэкранная анимация выбытия участника.
 * Экран мерцает → появляется Коганэ → большой череп → «ВЫ ПОГИБЛИ».
 */

import { create, lockScroll } from '../core/dom.js?v=7';
import { kogane, bigSkull } from '../core/sprites.js?v=7';
import { audio } from '../core/audio.js?v=7';
import { type, wait } from '../core/typewriter.js?v=7';
import { auth } from '../core/auth.js?v=7';
import { crt } from '../core/crt.js?v=7';

let shown = false;
let node = null;

/**
 * @param {object} opts
 *   final  — показ при повторном заходе (без длинной раскачки)
 *   reason — текст причины
 *   migration — номер миграции
 */
export async function deathScreen({ final = false, reason = '', migration = 1 } = {}) {
  if (shown) return;
  shown = true;

  document.documentElement.dataset.mode = 'dead';
  lockScroll();

  const el = create('div', { class: `death ${final ? 'death--final' : ''}` });
  el.innerHTML = `
    <div class="death__static" aria-hidden="true"></div>
    <div class="death__bars" aria-hidden="true"></div>
    <div class="death__flash" aria-hidden="true"></div>
    <div class="death__inner">
      ${kogane({ className: 'death__kogane' })}
      ${bigSkull(11)}
      <div class="death__jp jp">死亡</div>
      <div class="death__title">Вы погибли.</div>
      <div class="death__sub" id="deathSub"></div>
      <div class="death__actions">
        <button class="btn btn--lg" type="button" id="deathExit">Отключиться от барьера</button>
      </div>
    </div>`;

  document.body.append(el);
  node = el;

  if (!final) {
    el.classList.add('is-shaking');
    crt.glitch(document.querySelector('.screen'), 900);
  }

  audio.death();

  const sub = el.querySelector('#deathSub');
  await wait(final ? 900 : 2900);

  const text = reason
    || `Миграция №${migration} завершена распорядителем. Барьер свёрнут. `
     + 'Аккаунт неактивен до начала следующей миграции.';

  await type(sub, text, { speed: 26, caret: true, sound: false });

  el.querySelector('#deathExit').addEventListener('click', () => {
    auth.logout();
    window.location.href = '../index.html';
  });
}

/**
 * Снимает экран смерти — например, если распорядитель начал новую миграцию
 * и участник вернулся в игру. Без этого оверлей оставался бы висеть навсегда.
 */
export function hideDeathScreen() {
  if (!shown) return;
  shown = false;
  document.documentElement.dataset.mode = '';
  document.body.classList.remove('is-locked');
  document.body.style.paddingRight = '';
  node?.remove();
  node = null;
}

/**
 * Проверяет состояние участника и при необходимости показывает экран смерти.
 * @returns {boolean} true — участник выбыл
 */
export function checkDeath(user, { silentIfDead = false } = {}) {
  const dead = user?.character?.status === 'dead';
  if (!dead) return false;

  deathScreen({
    final: silentIfDead,
    migration: user.deadMigration || 1,
    reason: user.deathReason || '',
  });
  return true;
}

export const deathState = { get shown() { return shown; } };
