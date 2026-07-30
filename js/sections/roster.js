/**
 * Раздел «Таблица участников» — 泳者一覧.
 */

import { $, $$, on } from '../core/dom.js?v=7';
import { store } from '../core/store.js?v=7';
import { pts } from '../core/format.js?v=7';
import { COLONIES, JP } from '../data/labels.js?v=7';
import { rosterRow, rosterCols, sortParticipants, openParticipant, defaultDir } from './shared.js?v=7';
import { audio } from '../core/audio.js?v=7';

let sort = { key: 'points', dir: -1 };
let filter = 'all';

export const roster = {
  id: 'roster',

  render(root, { me }) {
    const draw = () => {
      let list = store.participants();

      if (filter === 'alive') list = list.filter((p) => p.status !== 'dead');
      else if (filter === 'dead') list = list.filter((p) => p.status === 'dead');
      else if (filter === 'mine') list = list.filter((p) => p.colony === me.colony);
      else if (filter.startsWith('c:')) list = list.filter((p) => p.colony === filter.slice(2));

      list = sortParticipants(list, sort);

      const body = $('#rosterBody', root);
      const cols = $('#rosterCols', root);
      const count = $('#rosterCount', root);

      const total = store.participants().length;

      cols.innerHTML = rosterCols(sort);
      body.innerHTML = list.length
        ? list.map((p, i) => rosterRow(p, { index: i, me: me.id })).join('')
        : `<div class="empty">
             <span class="jp-big">${total ? JP.no : '空'}</span>
             ${total
               ? 'По этому условию участников нет'
               : 'Реестр пуст — вы первый участник миграции.<br />'
                 + 'Список наполняется по мере того, как новые игроки проходят регистрацию '
                 + 'и получают одобрение распорядителя.'}
           </div>`;
      count.textContent = `Записей: ${pts(list.length, 3)}`;

      // Сортировка
      $$('[data-sort]', cols).forEach((btn) => on(btn, 'click', () => {
        const key = btn.dataset.sort;
        sort = { key, dir: sort.key === key ? -sort.dir : defaultDir(key) };
        audio.click();
        draw();
      }));

      // Открытие карточки
      $$('.roster__row', body).forEach((row) => on(row, 'click', () => {
        audio.click();
        openParticipant(row.dataset.id);
      }));
    };

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">02</span>
        <span class="sec-head__title">Таблица участников</span>
        <span class="sec-head__jp jp">${JP.players}</span>
      </div>

      <div class="roster scan">
        <div class="roster__head">
          <span class="roster__title jp">${JP.players}</span>
          <span class="roster__count" id="rosterCount">—</span>
        </div>

        <div class="roster__bar">
          <button class="chip is-active" type="button" data-filter="all">Все</button>
          <button class="chip" type="button" data-filter="alive">В игре</button>
          <button class="chip" type="button" data-filter="dead">Выбывшие</button>
          <button class="chip" type="button" data-filter="mine">Моя колония</button>
          <span class="push"></span>
          <select class="field__select" id="colonyFilter" style="width:auto;padding:4px 28px 4px 8px;font-size:11px">
            <option value="all">Все барьеры</option>
            ${COLONIES.map((c) => `<option value="c:${c.id}">${c.jp} — ${c.ru}</option>`).join('')}
          </select>
        </div>

        <div id="rosterCols"></div>
        <div id="rosterBody"></div>
      </div>

      <p class="fs-xxs muted mono mt-3">
        Нажмите на строку, чтобы открыть полную карточку участника.
        Данные обновляются автоматически при изменениях в системе.
      </p>`;

    $$('[data-filter]', root).forEach((chip) => on(chip, 'click', () => {
      filter = chip.dataset.filter;
      $$('[data-filter]', root).forEach((c) => c.classList.toggle('is-active', c === chip));
      $('#colonyFilter', root).value = 'all';
      draw();
    }));

    on($('#colonyFilter', root), 'change', (e) => {
      filter = e.target.value === 'all' ? 'all' : e.target.value;
      $$('[data-filter]', root).forEach((c) => c.classList.remove('is-active'));
      draw();
    });

    draw();
    return root;
  },
};
