/**
 * Раздел «История уведомлений».
 */

import { $$, on } from '../core/dom.js?v=6';
import { store } from '../core/store.js?v=6';
import { esc, dt, ago, pts } from '../core/format.js?v=6';
import { NOTICE_TYPES, JP } from '../data/labels.js?v=6';
import { sprite } from '../core/sprites.js?v=6';

let kind = 'all';

export const notices = {
  id: 'notices',

  render(root, { user, refresh }) {
    const all = store.notifications(user.id);
    const kinds = ['all', ...new Set(all.map((n) => n.type))];
    const list = kind === 'all' ? all : all.filter((n) => n.type === kind);
    const unread = all.filter((n) => !n.read.includes(user.id));

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">06</span>
        <span class="sec-head__title">История уведомлений</span>
        <span class="sec-head__jp jp">${JP.notice}${JP.history}</span>
      </div>

      <div class="roster__bar mb-4" style="border:2px solid var(--ink-line)">
        ${kinds.map((k) => {
          const meta = NOTICE_TYPES[k];
          return `<button class="chip ${k === kind ? 'is-active' : ''}" type="button" data-kind="${k}">
            ${k === 'all' ? 'Все события' : esc(meta?.ru || k)}
          </button>`;
        }).join('')}
        <span class="push">
          ${unread.length ? `<button class="btn btn--sm btn--ghost" type="button" id="readAll">Отметить прочитанным (${unread.length})</button>` : '<span class="fs-xxs muted">Всё прочитано</span>'}
        </span>
      </div>

      <div class="notices scan">
        ${list.map((n, i) => {
          const meta = NOTICE_TYPES[n.type] || NOTICE_TYPES.broadcast;
          const isUnread = !n.read.includes(user.id);
          return `
          <div class="notice ${isUnread ? 'is-unread' : ''}" style="--row-delay:${Math.min(i * 30, 480)}ms">
            <span>${sprite(meta.icon, { scale: 3 })}</span>
            <span class="notice__ts">${dt(n.ts)}<br /><span class="muted">${ago(n.ts)}</span></span>
            <span>
              <span class="notice__title">${esc(n.title)} <span class="jp muted">${meta.jp}</span></span>
              <span class="notice__text">${esc(n.text)}</span>
            </span>
          </div>`;
        }).join('') || `<div class="empty"><span class="jp-big">${JP.no}</span>Уведомлений нет</div>`}
      </div>

      <p class="fs-xxs muted mono mt-3">Всего записей: ${pts(all.length, 3)}</p>`;

    $$('[data-kind]', root).forEach((chip) => on(chip, 'click', () => {
      kind = chip.dataset.kind;
      this.render(root, { user, refresh });
    }));

    const readAll = root.querySelector('#readAll');
    if (readAll) {
      on(readAll, 'click', () => {
        store.markRead(user.id);
        refresh?.();
      });
    }

    return root;
  },
};
