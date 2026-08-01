/**
 * Админ: сводка состояния системы.
 */

import { $, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { esc, dt, pts, ago } from '../core/format.js?v=11';
import { colonyById, NOTICE_TYPES } from '../data/labels.js?v=11';
import { kogane, sprite } from '../core/sprites.js?v=11';
import { type } from '../core/typewriter.js?v=11';

export const dash = {
  id: 'dash',
  title: 'Сводка',
  jp: '概況',

  render(root, { admin, go }) {
    const mig = store.migration();
    const all = store.participants();
    const alive = all.filter((p) => p.status !== 'dead');
    const queue = store.users().filter((u) => u.state === 'applied');
    const players = store.users().filter((u) => u.role !== 'admin' && u.state === 'approved');
    const logs = store.logs().slice(0, 12);

    const top = [...all].sort((a, b) => b.points - a.points).slice(0, 8);

    root.innerHTML = `
      <div class="hero-line scan mb-4">
        <div class="hero-line__text">
          <div class="hero-line__jp jp chroma">管理者権限</div>
          <div class="hero-line__title">Распорядитель игры · ${esc(admin.email)}</div>
          <p class="hero-line__sub" id="dashIntro"></p>
        </div>
        <div>${kogane()}</div>
      </div>

      <div class="astats">
        <div class="tile"><span class="tile__key">Миграция <span class="jp">回游</span></span>
          <span class="tile__val jp">№${mig.number}</span></div>
        <div class="tile"><span class="tile__key">Состояние</span>
          <span class="tile__val tile__val--text">
            <span class="status ${mig.active ? 'status--active' : 'status--dead'}">${mig.active ? 'идёт' : 'завершена'}</span>
          </span></div>
        <div class="tile"><span class="tile__key">Анкет в очереди <span class="jp">審査</span></span>
          <span class="tile__val jp">${pts(queue.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Игроков <span class="jp">泳者</span></span>
          <span class="tile__val jp">${pts(players.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Всего в реестре</span>
          <span class="tile__val jp">${pts(all.length, 3)}</span></div>
        <div class="tile"><span class="tile__key">В игре / выбыло</span>
          <span class="tile__val jp">${pts(alive.length, 2)}<span class="fs-xxs muted"> / ${pts(all.length - alive.length, 2)}</span></span></div>
      </div>

      <div class="cols cols--2 mt-4">
        <div class="panel panel--framed">
          <div class="panel__head">
            <span class="panel__title">Требует решения</span>
            <span class="panel__jp jp">審査待ち</span>
            <span class="panel__tools"><button class="btn btn--sm btn--bare" type="button" data-go="applications">открыть →</button></span>
          </div>
          <div class="panel__body panel__body--flush">
            ${queue.length ? queue.slice(0, 6).map((u) => `
              <div class="appq__item" style="grid-template-columns:34px 1fr auto">
                <span>${sprite('alert', { scale: 3 })}</span>
                <span>
                  <div class="appq__name">${esc(u.application?.name || u.email)}</div>
                  <div class="appq__meta">${esc(u.email)} · ${u.application?.submittedAt ? ago(u.application.submittedAt) : '—'}</div>
                </span>
                <button class="btn btn--sm btn--ghost" type="button" data-go="applications">Рассмотреть</button>
              </div>`).join('') : '<div class="empty">Очередь пуста</div>'}
          </div>
        </div>

        <div class="panel panel--framed">
          <div class="panel__head">
            <span class="panel__title">Лидеры по очкам</span>
            <span class="panel__jp jp">得点順位</span>
            <span class="panel__tools"><button class="btn btn--sm btn--bare" type="button" data-go="participants">управление →</button></span>
          </div>
          <div class="panel__body panel__body--flush">
            ${top.map((p, i) => `
              <div class="datarow" style="padding:6px 12px">
                <span class="datarow__key" style="min-width:34px">${String(i + 1).padStart(2, '0')}</span>
                <span class="datarow__val">
                  <div class="row">
                    <span class="grow fs-xs">${esc(p.name)} <span class="jp muted">${esc(p.nameJp || '')}</span></span>
                    <span class="jp" style="font-size:18px">${pts(p.points)}</span>
                  </div>
                  <div class="fs-xxs muted">${colonyById(p.colony).ru} · правил: ${pts(p.rules, 2)}</div>
                </span>
              </div>`).join('')}
          </div>
        </div>
      </div>

      <div class="panel panel--framed mt-4">
        <div class="panel__head">
          <span class="panel__title">Последние действия в системе</span>
          <span class="panel__jp jp">記録</span>
          <span class="panel__tools"><button class="btn btn--sm btn--bare" type="button" data-go="logs">весь журнал →</button></span>
        </div>
        <div class="panel__body panel__body--flush">
          ${logs.map((l) => `
            <div class="logline ${l.level === 'danger' ? 'logline--danger' : ''}">
              <span class="logline__ts">${dt(l.ts)}</span>
              <span class="logline__act">${esc(l.action)}</span>
              <span><b>${esc(l.actor)}</b> — ${esc(l.text)}</span>
            </div>`).join('') || '<div class="empty">Журнал пуст</div>'}
        </div>
      </div>`;

    type($('#dashIntro', root),
      `Полномочия подтверждены. Анкет на рассмотрении: ${queue.length}. `
      + `Участников в игре: ${alive.length} из ${all.length}. `
      + `${mig.active ? 'Миграция идёт с ' + dt(mig.startedAt) + '.' : 'Миграция завершена — запустите новую.'}`,
      { speed: 12, caret: false, sound: false });

    root.querySelectorAll('[data-go]').forEach((b) => on(b, 'click', () => go(b.dataset.go)));
    return root;
  },
};
