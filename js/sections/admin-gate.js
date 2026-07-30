/**
 * Раздел «Система администрации» внутри игрового интерфейса.
 * Игроку — отказ доступа, распорядителю — переход в панель.
 */

import { $, on } from '../core/dom.js?v=6';
import { store } from '../core/store.js?v=6';
import { crt } from '../core/crt.js?v=6';
import { audio } from '../core/audio.js?v=6';
import { esc, dt } from '../core/format.js?v=6';
import { JP } from '../data/labels.js?v=6';
import { sprite } from '../core/sprites.js?v=6';

export const adminGate = {
  id: 'admin',

  render(root, { user }) {
    if (user.role !== 'admin') {
      root.innerHTML = `
        <div class="sec-head">
          <span class="sec-head__no jp">07</span>
          <span class="sec-head__title">Система администрации</span>
          <span class="sec-head__jp jp">${JP.admin}</span>
        </div>

        <div class="panel panel--framed">
          <div class="panel__body denied">
            ${sprite('lock', { scale: 8 })}
            <div class="denied__jp jp" data-text="権限無し">権限無し</div>
            <div class="denied__text">Доступ запрещён</div>
            <p class="fs-xs mono muted" style="max-width:46ch">
              Раздел доступен только распорядителю игры. Попытка входа зафиксирована
              в журнале системы: ${esc(user.email)} · ${dt(Date.now())}
            </p>
          </div>
        </div>`;

      audio.err();
      crt.glitch(root.querySelector('.panel'), 500);
      store.log(user.email, 'access-denied', 'Попытка входа в раздел администрации.', 'warn');
      return root;
    }

    const pending = store.applications('applied').length;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">07</span>
        <span class="sec-head__title">Система администрации</span>
        <span class="sec-head__jp jp">${JP.admin}</span>
      </div>

      <div class="panel panel--framed">
        <div class="panel__body tc" style="padding:var(--sp-7)">
          <div class="jp-big">${JP.admin}</div>
          <p class="fs-xs mono muted mt-3" style="max-width:52ch;margin-inline:auto">
            Полномочия распорядителя подтверждены. Анкет в очереди: ${pending}.
          </p>
          <div class="mt-5"><button class="btn btn--primary btn--lg" id="toAdmin">Открыть панель управления →</button></div>
        </div>
      </div>`;

    on($('#toAdmin', root), 'click', () => crt.wipeTo('admin.html'));
    return root;
  },
};
