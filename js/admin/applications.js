/**
 * Админ: очередь анкет — одобрение и отклонение.
 */

import { $, $$, on } from '../core/dom.js?v=10';
import { store } from '../core/store.js?v=10';
import { esc, dt, ago } from '../core/format.js?v=10';
import { modal, toast } from '../core/ui.js?v=10';
import { notify } from '../core/notify.js?v=10';
import { participantIcon } from '../core/sprites.js?v=10';
import { applicationBlock } from '../sections/shared.js?v=10';
import { colonyById, levelById, levelOptions, COLONIES } from '../data/labels.js?v=10';
import { crt } from '../core/crt.js?v=10';

let tab = 'applied';

export const applications = {
  id: 'applications',
  title: 'Анкеты участников',
  jp: '審査',

  render(root, { admin, refresh }) {
    const players = store.users().filter((u) => u.role !== 'admin');
    // Вкладка «все» показывает и тех, кто ещё не заполнил анкету:
    // если участник пропал из таблицы, здесь видно, жив ли его аккаунт
    const queue = tab === 'all'
      ? players
      : players.filter((u) => u.application && u.state === tab);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">01</span>
        <span class="sec-head__title">Анкеты участников</span>
        <span class="sec-head__jp jp">審査</span>
      </div>

      <div class="atabs">
        <button class="atab ${tab === 'applied' ? 'is-active' : ''}" type="button" data-tab="applied">
          На рассмотрении (${store.users().filter((u) => u.state === 'applied').length})
        </button>
        <button class="atab ${tab === 'approved' ? 'is-active' : ''}" type="button" data-tab="approved">
          Одобренные (${store.users().filter((u) => u.state === 'approved' && u.role !== 'admin').length})
        </button>
        <button class="atab ${tab === 'rejected' ? 'is-active' : ''}" type="button" data-tab="rejected">
          Отклонённые (${store.users().filter((u) => u.state === 'rejected').length})
        </button>
        <button class="atab ${tab === 'all' ? 'is-active' : ''}" type="button" data-tab="all">
          Все аккаунты (${players.length})
        </button>
      </div>

      ${tab === 'all' ? `
        <p class="fs-xxs muted mono mb-3">
          Здесь каждый заведённый аккаунт с его состоянием. В таблицу участников
          попадают только одобренные: если человек есть в списке, но не в таблице —
          его анкета не одобрена, и решение принимается во вкладке «На рассмотрении».
        </p>` : ''}

      <div class="appq">
        ${queue.length ? queue.map((u) => {
          const a = u.application || {};
          const STATE = {
            registered: 'анкета не заполнена', applied: 'на рассмотрении',
            approved: 'в таблице участников', rejected: 'отклонена',
          };
          return `
          <div class="appq__item" data-user="${u.id}">
            <span>${participantIcon(true, 3)}</span>
            <span>
              <div class="appq__name">${esc(a.name || '—')}
                <span class="jp muted">${esc(a.nameJp || '')}</span>
              </div>
              <div class="appq__meta">
                ${esc(u.email)} · ${levelById(a.level).ru}
                ${a.roblox ? ` · Roblox: ${esc(a.roblox)}` : ''}
                ${a.discord ? ` · Discord: ${esc(a.discord)}` : ''}
                · ${STATE[u.state] || u.state}
                ${a.submittedAt ? ` · подана ${ago(a.submittedAt)}` : ''}
              </div>
            </span>
            <span class="btn-row">
              ${u.application ? `<button class="btn btn--sm btn--ghost" type="button" data-view="${u.id}">Открыть</button>` : ''}
              ${tab === 'all' ? `
                <button class="btn btn--sm btn--bare" type="button" data-drop="${u.id}"
                        style="color:var(--danger-ink)">Удалить аккаунт</button>` : ''}
              ${u.state === 'applied' ? `
                <button class="btn btn--sm btn--primary" type="button" data-ok="${u.id}">Принять</button>
                <button class="btn btn--sm btn--danger" type="button" data-no="${u.id}">Отклонить</button>` : ''}
            </span>
          </div>`;
        }).join('') : `<div class="empty">${
          tab === 'all' ? 'Аккаунтов участников ещё нет' : 'Анкет в этом состоянии нет'
        }</div>`}
      </div>`;

    /* Удаление аккаунта: освобождает почту для повторной регистрации */
    $$('[data-drop]', root).forEach((b) => on(b, 'click', async () => {
      const u = store.users().find((x) => x.id === b.dataset.drop);
      if (!u) return;

      const ok = await modal.confirm({
        title: 'Удалить аккаунт', jp: '削除', danger: true,
        text: `Аккаунт ${u.email} будет удалён вместе с анкетой, очками и правилами. `
            + 'Почта после этого снова свободна для регистрации. Отменить нельзя.',
        okText: 'Удалить',
      });
      if (!ok) return;

      try {
        await store.deleteUser(u.id);
      } catch (err) { toast.err('Не удалено', err.message); return; }

      toast.ok('Аккаунт удалён', `${u.email} — почта свободна`);
      refresh();
    }));

    $$('[data-tab]', root).forEach((b) => on(b, 'click', () => {
      tab = b.dataset.tab;
      this.render(root, { admin, refresh });
    }));

    $$('[data-view]', root).forEach((b) => on(b, 'click', () => {
      const u = store.userById(b.dataset.view);
      openApplication(u, { admin, refresh });
    }));

    $$('[data-ok]', root).forEach((b) => on(b, 'click', () => approve(b.dataset.ok, { admin, refresh })));
    $$('[data-no]', root).forEach((b) => on(b, 'click', () => reject(b.dataset.no, { admin, refresh })));

    return root;
  },
};

/* ---------------- Просмотр анкеты ---------------- */

function openApplication(u, ctx) {
  if (!u) return;
  const a = u.application;

  const el = modal.open({
    title: `Анкета: ${a.name}`,
    jp: '申請内容',
    wide: true,
    body: `
      <div class="datarow">
        <span class="datarow__key">Почта участника</span>
        <span class="datarow__val mono fs-xs">${esc(u.email)}</span>
      </div>
      <div class="datarow">
        <span class="datarow__key">Заявленный уровень</span>
        <span class="datarow__val">${levelById(a.level).jp} — ${levelById(a.level).ru}</span>
      </div>
      ${a.nameJp ? `
      <div class="datarow">
        <span class="datarow__key">Имя кандзи / каной</span>
        <span class="datarow__val jp">${esc(a.nameJp)}</span>
      </div>` : ''}
      ${applicationBlock(a)}`,
    foot: u.state === 'applied' ? `
      <button class="btn btn--sm btn--ghost" type="button" data-close>Закрыть</button>
      <button class="btn btn--sm btn--danger" type="button" id="mReject">Отклонить</button>
      <button class="btn btn--sm btn--primary" type="button" id="mApprove">Принять в игру</button>`
      : `<button class="btn btn--sm btn--ghost" type="button" data-close>Закрыть</button>`,
  });

  const ok = el.querySelector('#mApprove');
  const no = el.querySelector('#mReject');
  if (ok) on(ok, 'click', () => { modal.close(); approve(u.id, ctx); });
  if (no) on(no, 'click', () => { modal.close(); reject(u.id, ctx); });
}

/* ---------------- Решения ---------------- */

async function approve(userId, { admin, refresh }) {
  const u = store.userById(userId);
  if (!u) return;
  const a = u.application;

  const el = modal.open({
    title: 'Принятие в игру',
    jp: '承認',
    body: `
      <p class="mono fs-xs mb-4">Участник «${esc(a.name)}» будет внесён в реестр Смертельной миграции.</p>
      <div class="field-row">
        <label class="field">
          <span class="field__label">Уровень</span>
          <select class="field__select" id="apLevel">
            ${levelOptions().map((l) => `<option value="${l.id}" ${a.level === l.id ? 'selected' : ''}>${l.jp} — ${l.ru}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Колония <span class="jp">滞在結界</span></span>
          <select class="field__select" id="apColony">
            ${COLONIES.map((c) => `<option value="${c.id}" ${a.colony === c.id ? 'selected' : ''}>${c.jp} — ${c.ru}</option>`).join('')}
          </select>
        </label>
        <label class="field">
          <span class="field__label">Стартовые очки</span>
          <span class="field__wrap"><input class="field__input" id="apPoints" type="number" min="0" value="0" /></span>
        </label>
      </div>`,
    foot: `
      <button class="btn btn--sm btn--ghost" type="button" data-close>Отмена</button>
      <button class="btn btn--sm btn--primary" type="button" id="apGo">Внести в реестр</button>`,
  });

  on(el.querySelector('#apGo'), 'click', async () => {
    const level = el.querySelector('#apLevel').value;
    const colony = el.querySelector('#apColony').value;
    const points = Math.max(0, Number(el.querySelector('#apPoints').value) || 0);

    try {
      await store.approve(userId, { level, colony, points });
    } catch (err) {
      toast.err('Не удалось одобрить', err.message);
      return;
    }

    modal.close();
    toast.ok('Анкета одобрена', `${a.name} внесён в реестр участников.`);
    refresh();
  });
}

async function reject(userId, { admin, refresh }) {
  const u = store.userById(userId);
  if (!u) return;

  const reason = await modal.prompt({
    title: 'Отклонение анкеты',
    jp: '却下',
    label: 'Причина отказа (увидит участник)',
    area: true,
    okText: 'Отклонить',
  });
  if (reason === null) return;

  try {
    await store.reject(userId, reason);
  } catch (err) {
    toast.err('Не удалось отклонить', err.message);
    return;
  }

  crt.tear($('.screen'));
  toast.show({ type: 'rejected', title: 'Анкета отклонена', text: u.application?.name || '', alert: true });
  refresh();
}
