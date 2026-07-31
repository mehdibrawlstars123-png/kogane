/**
 * Раздел «Профиль участника».
 * Имя, уровень, очки, количество правил, колония, статус — как на кадрах.
 */

import { $ } from '../core/dom.js?v=10';
import { store } from '../core/store.js?v=10';
import { esc, pts, dt, daysLeft, plural } from '../core/format.js?v=10';
import { colonyById, levelById, STATUSES, JP } from '../data/labels.js?v=10';
import { participantIcon, sprite } from '../core/sprites.js?v=10';
import { countTo, scramble } from '../core/typewriter.js?v=10';
import { applicationBlock } from './shared.js?v=10';

export const profile = {
  id: 'profile',

  render(root, { user, me }) {
    const colony = colonyById(me.colony);
    const level = levelById(me.level);
    const st = STATUSES[me.status] || STATUSES.active;
    const mig = store.migration();
    const declare = daysLeft(mig.startedAt, 19);

    const owned = (user.ownedRules || [])
      .map((id) => store.shopRules().find((r) => r.id === id))
      .filter(Boolean);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">01</span>
        <span class="sec-head__title">Профиль участника</span>
        <span class="sec-head__jp jp">${JP.profile}</span>
      </div>

      <!-- Главный блок — точная композиция кадра Коганэ -->
      <div class="panel panel--framed scan">
        <div class="panel__body">
          <div class="pcard__top" style="border-bottom:2px solid var(--ink-line)">
            <span class="rface">${participantIcon(me.status !== 'dead', 6)}</span>
            <span class="pcard__ident">
              <span class="pcard__jp jp chroma">${esc(me.nameJp || '—')}</span>
              <div class="pcard__name">${esc(me.name)}</div>
              <div class="fs-xxs muted mono">${esc(user.email)}</div>
            </span>
            <span class="pcard__mark">
              <span class="status ${st.cls}">${st.ru} / ${st.jp}</span>
              <div class="fs-xxs muted mt-2">ID ${user.id.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}</div>
            </span>
          </div>

          <div class="readout">
            <div class="readout__item">
              <span class="readout__key">Очки <span class="jp">${JP.points}</span></span>
              <span class="readout__val jp" id="pPoints">000</span>
            </div>
            <div class="readout__item">
              <span class="readout__key">Правил <span class="jp">${JP.ruleChange}</span></span>
              <span class="readout__val jp"><span id="pRules">00</span><small>${JP.times}</small></span>
            </div>
            <div class="readout__item">
              <span class="readout__key">Уровень <span class="jp">${JP.level}</span></span>
              <span class="readout__val readout__val--sm jp">${level.jp}<small>${esc(level.ru)}</small></span>
            </div>
            <div class="readout__item">
              <span class="readout__key">Текущая колония <span class="jp">${JP.colony}</span></span>
              <span class="readout__val readout__val--sm jp">${colony.jp}<small>${esc(colony.ru)}</small></span>
            </div>
          </div>
        </div>
      </div>

      <div class="cols cols--2 mt-4">
        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">Данные игры</span>
            <span class="panel__jp jp">回游情報</span>
          </div>
          <div class="panel__body">
            <div class="datarow">
              <span class="datarow__key">Миграция</span>
              <span class="datarow__val">№${mig.number} · ${mig.active ? 'идёт' : 'завершена'}</span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Срок объявления</span>
              <span class="datarow__val">${declare} ${plural(declare, ['день', 'дня', 'дней'])}</span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Внесён в реестр</span>
              <span class="datarow__val mono fs-xs">${dt(user.approvedAt || user.createdAt)}</span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Ник в Roblox</span>
              <span class="datarow__val fs-xs mono">${esc(user.character?.roblox || user.application?.roblox || '—')}</span>
            </div>
            <div class="datarow">
              <span class="datarow__key">Ник в Discord</span>
              <span class="datarow__val fs-xs mono">${esc(user.character?.discord || user.application?.discord || '—')}</span>
            </div>
            <div class="datarow" style="border:0">
              <span class="datarow__key">Правил куплено</span>
              <span class="datarow__val jp">${pts(owned.length, 2)}</span>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel__head">
            <span class="panel__title">Установленные правила</span>
            <span class="panel__jp jp">所持規則</span>
          </div>
          <div class="panel__body panel__body--flush">
            ${owned.length ? owned.map((r) => `
              <div class="hrow" style="grid-template-columns:70px 1fr">
                <span class="hrow__tag hrow__tag--add">${r.code}</span>
                <span>
                  <div class="fs-xs">${esc(r.title)} <span class="jp muted">${r.jp}</span></div>
                  <div class="fs-xxs muted mono">${esc(r.text)}</div>
                </span>
              </div>`).join('')
              : `<div class="empty"><span class="jp-big">${JP.no}</span>Правил не установлено</div>`}
          </div>
        </div>
      </div>

      ${user.application ? `
        <div class="panel mt-4">
          <div class="panel__head">
            <span class="panel__title">Одобренная анкета</span>
            <span class="panel__jp jp">申請内容</span>
            <span class="panel__tools fs-xxs muted">изменения — только через распорядителя</span>
          </div>
          <div class="panel__body">${applicationBlock(user.application, { omit: ['roblox', 'discord'] })}</div>
        </div>` : ''}`;

    countTo($('#pPoints', root), me.points || 0, { duration: 1100, pad: 3 });
    scramble($('#pRules', root), pts(me.rules || 0, 2), { duration: 800 });

    return root;
  },
};
