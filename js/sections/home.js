/**
 * Раздел «Главная» — сводка состояния миграции и участника.
 */

import { $, $$ } from '../core/dom.js?v=9';
import { store } from '../core/store.js?v=9';
import { esc, pts, dt, daysLeft, plural } from '../core/format.js?v=9';
import { colonyById, levelById, STATUSES, JP } from '../data/labels.js?v=9';
import { kogane, sprite } from '../core/sprites.js?v=9';
import { type, countTo, scramble } from '../core/typewriter.js?v=9';

export const home = {
  id: 'home',

  render(root, { user, me }) {
    const mig = store.migration();
    const all = store.participants();
    const alive = all.filter((p) => p.status !== 'dead');
    const inColony = all.filter((p) => p.colony === me.colony && p.status !== 'dead');
    const colony = colonyById(me.colony);
    const level = levelById(me.level);
    const st = STATUSES[me.status] || STATUSES.active;
    const declare = daysLeft(mig.startedAt, 19);

    root.innerHTML = `
      <div class="hero-line scan">
        <div class="hero-line__text">
          <div class="hero-line__jp jp chroma">死滅回游</div>
          <div class="hero-line__title">Миграция №${mig.number} — ${mig.active ? 'идёт' : 'завершена'}</div>
          <p class="hero-line__sub" id="homeIntro"></p>
        </div>
        <div>${kogane()}</div>
      </div>

      <div class="cols cols--4 mt-4">
        <div class="tile">
          <span class="tile__key">Ваши очки <span class="jp">${JP.points}</span></span>
          <span class="tile__val jp" id="tPoints">000</span>
        </div>
        <div class="tile">
          <span class="tile__key">Правил добавлено <span class="jp">${JP.ruleChange}</span></span>
          <span class="tile__val jp" id="tRules">00</span>
        </div>
        <div class="tile">
          <span class="tile__key">Ваш уровень <span class="jp">${JP.level}</span></span>
          <span class="tile__val tile__val--text jp">${level.jp} <span class="fs-xxs muted">${esc(level.ru)}</span></span>
        </div>
        <div class="tile">
          <span class="tile__key">Состояние <span class="jp">${JP.status}</span></span>
          <span class="tile__val tile__val--text"><span class="status ${st.cls}">${st.ru}</span></span>
        </div>
      </div>

      <div class="cols cols--2 mt-4">
        <div class="panel panel--framed">
          <div class="panel__head">
            <span class="panel__title">Состояние барьера</span>
            <span class="panel__jp jp">${JP.colony}</span>
          </div>
          <div class="panel__body">
            <div class="migration mb-4">
              <span class="migration__no jp">${colony.jp}</span>
              <div>
                <div class="fs-xs">${esc(colony.ru)}</div>
                <div class="fs-xxs muted">Участников внутри: ${pts(inColony.length, 2)}</div>
              </div>
              <span class="migration__state ${mig.active ? 'migration__state--on' : 'migration__state--off'} push">
                ${mig.active ? '進行中 / активен' : '終了 / свёрнут'}
              </span>
            </div>

            <div class="datarow">
              <span class="datarow__key">Срок объявления</span>
              <span class="datarow__val">
                ${declare} ${plural(declare, ['день', 'дня', 'дней'])} до истечения
                <div class="bar mt-2"><div class="bar__fill" style="--fill:${Math.round((1 - declare / 19) * 100)}%"></div></div>
              </span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Начало миграции</span>
              <span class="datarow__val mono fs-xs">${dt(mig.startedAt)}</span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Участников в игре</span>
              <span class="datarow__val jp">${pts(alive.length)} / ${pts(all.length)}</span>
            </div>
            <div class="datarow" style="border:0">
              <span class="datarow__key">Распоряжение</span>
              <span class="datarow__val fs-xs mono">${esc(mig.note || '—')}</span>
            </div>
          </div>
        </div>

        <div class="panel panel--framed">
          <div class="panel__head">
            <span class="panel__title">Последние уведомления</span>
            <span class="panel__jp jp">${JP.notice}</span>
            <span class="panel__tools">
              <button class="btn btn--sm btn--bare" type="button" data-goto="notices">все →</button>
            </span>
          </div>
          <div class="panel__body panel__body--flush">
            ${store.notifications(user.id).slice(0, 6).map((n, i) => `
              <div class="notice" style="--row-delay:${i * 60}ms">
                <span>${sprite('caret', { scale: 2 })}</span>
                <span class="notice__ts">${dt(n.ts)}</span>
                <span>
                  <span class="notice__title">${esc(n.title)}</span>
                  <span class="notice__text">${esc(n.text)}</span>
                </span>
              </div>`).join('') || '<div class="empty">Уведомлений нет</div>'}
          </div>
        </div>
      </div>

      <div class="panel panel--framed mt-4">
        <div class="panel__head">
          <span class="panel__title">Базовые правила игры</span>
          <span class="panel__jp jp">基本規則</span>
          <span class="panel__tools fs-xxs muted">не подлежат изменению</span>
        </div>
        <div class="panel__body quick-rules">
          ${store.db.baseRules.map((r) => `
            <div class="baserule">
              <span class="baserule__no jp">${r.no}</span>
              <span class="baserule__body">
                <span class="baserule__title">${esc(r.title)} <span class="jp muted">${r.jp}</span></span>
                <span class="baserule__text">${esc(r.text)}</span>
              </span>
            </div>`).join('')}
        </div>
      </div>`;

    // Анимации значений
    countTo($('#tPoints', root), me.points || 0, { pad: 3 });
    scramble($('#tRules', root), pts(me.rules || 0, 2));
    type($('#homeIntro', root),
      mig.active
        ? `Вы находитесь внутри барьера «${colony.ru}». Объявите о начале игры в отведённый срок. За выбывание участника начисляется 5 очков, за неучастника — 1 очко.`
        : 'Барьеры свёрнуты. Миграция завершена распорядителем игры. Ожидайте следующей миграции.',
      { speed: 14, caret: false, sound: false });

    return root;
  },
};
