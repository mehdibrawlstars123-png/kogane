/**
 * Раздел «Поиск участников» с анимацией сканирования 「検索中」.
 */

import { $, $$, on } from '../core/dom.js';
import { store } from '../core/store.js';
import { matches, pts } from '../core/format.js';
import { JP } from '../data/labels.js';
import { sprite } from '../core/sprites.js';
import { audio } from '../core/audio.js';
import { typeLines, wait } from '../core/typewriter.js';
import { rosterRow, openParticipant } from './shared.js';

const LOG_LINES = (q, total) => [
  { text: `> ЗАПРОС: "${q}"`, pause: 90 },
  { text: '> ОПРОС БАРЬЕРОВ: 10 колоний', pause: 110 },
  { text: `> СВЕРКА РЕЕСТРА: ${pts(total, 3)} записей`, pause: 120 },
  { text: '> КАНАЛ ТЕНГЕНА: устойчив', pause: 90 },
];

export const search = {
  id: 'search',

  render(root) {
    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">03</span>
        <span class="sec-head__title">Поиск участников</span>
        <span class="sec-head__jp jp">${JP.search}</span>
      </div>

      <div class="search">
        <form class="search__bar" id="searchForm" role="search">
          <span class="search__prompt jp">検索</span>
          <input class="search__input" id="searchInput" type="search" autocomplete="off"
                 placeholder="ИМЯ УЧАСТНИКА" aria-label="Имя участника" />
          <button class="btn btn--primary" type="submit">Искать</button>
        </form>
        <div class="search__hint">
          <span>Enter — запуск сканирования</span>
          <span>Поиск по русскому и японскому написанию</span>
          <span>Латиница распознаётся</span>
        </div>

        <div class="scanner" id="scanner">
          <div class="scanner__line" aria-hidden="true"></div>
          <div class="scanner__inner" id="scannerInner">
            <span class="scanner__jp jp chroma">${JP.search}</span>
            <span class="scanner__label">Введите имя участника</span>
            <div class="scanner__log mono muted">
              > СИСТЕМА КОГАНЭ ГОТОВА К ЗАПРОСУ<br />
              > ДОСТУПНО ЗАПИСЕЙ: ${pts(store.participants().length, 3)}
              ${store.participants().length < 2
                ? '<br />> РЕЕСТР ПОПОЛНЯЕТСЯ ПО МЕРЕ РЕГИСТРАЦИИ УЧАСТНИКОВ'
                : ''}
            </div>
          </div>
        </div>

        <div class="results" id="results"></div>
      </div>`;

    const scanner = $('#scanner', root);
    const inner = $('#scannerInner', root);
    const results = $('#results', root);
    const input = $('#searchInput', root);

    let busy = false;

    async function run(query) {
      if (busy) return;
      const q = query.trim();
      if (!q) return;

      busy = true;
      results.innerHTML = '';
      audio.scan();

      // Фаза 1: сканирование
      scanner.classList.add('is-scanning');
      inner.innerHTML = `
        <span class="scanner__jp jp chroma">${JP.searching}</span>
        <div class="scanner__row">
          ${sprite('skullWings', { scale: 5, className: 'sprite--blink' })}
        </div>
        <span class="scanner__label">Идёт поиск...</span>
        <div class="scanner__log mono" id="scanLog"></div>`;

      const all = store.participants();
      await typeLines($('#scanLog', root), LOG_LINES(q, all.length), {
        speed: 4, lineClass: '', gap: 60,
      });
      await wait(420);

      // Фаза 2: результат
      const found = all.filter((p) => matches(p.name, q) || matches(p.nameJp || '', q));
      scanner.classList.remove('is-scanning');

      if (!found.length) {
        audio.err();
        inner.innerHTML = `
          <span class="scanner__jp jp chroma" style="color:var(--danger-ink)">該当無し</span>
          <span class="scanner__label">Совпадений не найдено</span>
          <div class="scanner__log mono muted">> ЗАПРОС "${q}" НЕ ДАЛ РЕЗУЛЬТАТА<br />> УТОЧНИТЕ ИМЯ УЧАСТНИКА</div>`;
      } else {
        audio.ok();
        inner.innerHTML = `
          <span class="scanner__jp jp chroma">検索完了</span>
          <span class="scanner__label">Найдено записей: ${pts(found.length, 2)}</span>
          <div class="scanner__log mono muted">> СВЕРКА ЗАВЕРШЕНА<br />> ДАННЫЕ ВЫГРУЖЕНЫ НИЖЕ</div>`;

        results.innerHTML = `
          <div class="results__meta">
            <span>Результаты запроса</span>
            <span class="jp">検索結果</span>
            <span class="push">${pts(found.length, 2)} / ${pts(all.length, 3)}</span>
          </div>
          <div class="roster scan">
            ${found.map((p, i) => rosterRow(p, { index: i, query: q })).join('')}
          </div>`;

        $$('.roster__row', results).forEach((row) => on(row, 'click', () => {
          audio.click();
          openParticipant(row.dataset.id);
        }));
      }

      busy = false;
    }

    on($('#searchForm', root), 'submit', (e) => {
      e.preventDefault();
      run(input.value);
    });

    input.focus();
    return root;
  },
};
