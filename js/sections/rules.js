/**
 * Раздел «История правил» — свод базовых правил + журнал изменений.
 */

import { $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { esc, dt, pts } from '../core/format.js?v=11';
import { colonyById, JP } from '../data/labels.js?v=11';

const TAG = {
  base: { ru: 'Базовое', cls: 'hrow__tag--base' },
  add:  { ru: 'Добавлено', cls: 'hrow__tag--add' },
  mod:  { ru: 'Изменено', cls: 'hrow__tag--mod' },
  del:  { ru: 'Отозвано', cls: '' },
};

let mode = 'history';

export const rules = {
  id: 'rules',

  render(root) {
    const history = store.ruleHistory();
    const base = store.db.baseRules;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">05</span>
        <span class="sec-head__title">История правил</span>
        <span class="sec-head__jp jp">規則履歴</span>
      </div>

      <div class="roster__bar mb-4" style="border:2px solid var(--ink-line)">
        <button class="chip ${mode === 'history' ? 'is-active' : ''}" type="button" data-mode="history">Журнал изменений</button>
        <button class="chip ${mode === 'base' ? 'is-active' : ''}" type="button" data-mode="base">Базовый свод</button>
        <span class="push fs-xxs muted">
          Записей: ${pts(history.length, 2)} · Базовых: ${pts(base.length, 2)}
        </span>
      </div>

      ${mode === 'history' ? `
        <div class="panel panel--framed scan">
          <div class="panel__head">
            <span class="panel__title">Изменения свода правил</span>
            <span class="panel__jp jp">${JP.rules}${JP.history}</span>
          </div>
          <div class="panel__body">
            <div class="hrow" style="border-bottom:2px solid var(--ink);font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:var(--ink-soft);animation:none">
              <span>Время</span><span>Тип</span><span>Правило</span><span class="hrow__by">Кто внёс</span>
            </div>
            ${history.map((h, i) => {
              const tag = TAG[h.type] || TAG.add;
              const colony = h.colony ? colonyById(h.colony) : null;
              return `
              <div class="hrow" style="--row-delay:${Math.min(i * 34, 500)}ms">
                <span class="hrow__ts">${dt(h.ts)}</span>
                <span class="hrow__tag ${tag.cls}">${tag.ru}</span>
                <span>
                  <div class="fs-xs">${esc(h.title)} <span class="jp muted">${esc(h.jp || '')}</span></div>
                  ${colony ? `<div class="fs-xxs muted">Барьер: ${esc(colony.ru)} · ${colony.jp}</div>` : ''}
                </span>
                <span class="hrow__by">${esc(h.by || 'СИСТЕМА')}</span>
              </div>`;
            }).join('') || '<div class="empty">Изменений не зафиксировано</div>'}
          </div>
        </div>` : `
        <div class="panel panel--framed scan">
          <div class="panel__head">
            <span class="panel__title">Базовые правила Смертельной миграции</span>
            <span class="panel__jp jp">基本規則</span>
            <span class="panel__tools fs-xxs muted">изменению не подлежат</span>
          </div>
          <div class="panel__body">
            ${base.map((r) => `
              <div class="baserule">
                <span class="baserule__no jp">${r.no}</span>
                <span class="baserule__body">
                  <span class="baserule__title">${esc(r.title)} <span class="jp muted">${r.jp}</span></span>
                  <span class="baserule__text">${esc(r.text)}</span>
                </span>
              </div>`).join('')}
          </div>
        </div>`}`;

    $$('[data-mode]', root).forEach((chip) => on(chip, 'click', () => {
      mode = chip.dataset.mode;
      this.render(root);
    }));

    return root;
  },
};
