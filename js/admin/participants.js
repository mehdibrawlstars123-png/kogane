/**
 * Админ: редактирование участников — очки, уровень, колония, статус,
 * выдача и отзыв правил, удаление.
 */

import { $, $$, on } from '../core/dom.js';
import { store } from '../core/store.js';
import { esc, pts } from '../core/format.js';
import { modal, toast } from '../core/ui.js';
import { notify } from '../core/notify.js';
import { levelOptions, COLONIES, STATUSES, colonyById, levelById } from '../data/labels.js';
import { participantIcon } from '../core/sprites.js';
import { participantCard } from '../sections/shared.js';
import { crt } from '../core/crt.js';

let selected = null;
let query = '';

export const participants = {
  id: 'participants',
  title: 'Управление участниками',
  jp: '泳者管理',

  render(root, ctx) {
    const list = store.participants()
      .filter((p) => !query || p.name.toLowerCase().includes(query.toLowerCase()))
      .sort((a, b) => b.points - a.points);

    if (!selected && list.length) selected = list[0].id;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">02</span>
        <span class="sec-head__title">Управление участниками</span>
        <span class="sec-head__jp jp">泳者管理</span>
      </div>

      <div class="editor">
        <div>
          <label class="field mb-2">
            <span class="field__wrap">
              <input class="field__input" id="pSearch" placeholder="ПОИСК ПО ИМЕНИ" value="${esc(query)}" />
            </span>
          </label>
          <div class="editor__list">
            ${list.map((p) => `
              <button class="editor__item ${p.id === selected ? 'is-active' : ''}" type="button" data-sel="${p.id}">
                ${esc(p.name)}
                <small>${pts(p.points)} очк · ${colonyById(p.colony).ru} · ${p.isNpc ? 'реестр' : 'игрок'}${p.status === 'dead' ? ' · выбыл' : ''}</small>
              </button>`).join('') || '<div class="empty">Не найдено</div>'}
          </div>
        </div>

        <div class="editor__pane" id="pPane"></div>
      </div>`;

    on($('#pSearch', root), 'input', (e) => {
      query = e.target.value;
      const val = query;
      this.render(root, ctx);
      const input = $('#pSearch', root);
      input.focus();
      input.value = val;
    });

    $$('[data-sel]', root).forEach((b) => on(b, 'click', () => {
      selected = b.dataset.sel;
      this.render(root, ctx);
    }));

    paintPane(root, ctx, this);
    return root;
  },
};

/* ---------------- Панель редактирования ---------------- */

function paintPane(root, ctx, self) {
  const pane = $('#pPane', root);
  const p = store.participant(selected);

  if (!p) {
    pane.innerHTML = '<div class="empty">Выберите участника из списка</div>';
    return;
  }

  const shopRules = store.shopRules();
  const owned = p.ownedRules || [];

  pane.innerHTML = `
    <div class="row mb-4">
      <span>${participantIcon(p.status !== 'dead', 4)}</span>
      <div class="grow">
        <div class="fs-base">${esc(p.name)} <span class="jp muted">${esc(p.nameJp || '')}</span></div>
        <div class="fs-xxs muted mono">
          ${p.isNpc ? 'запись реестра (NPC)' : `игрок · ${esc(store.userById(p.id)?.email || '')}`}
        </div>
      </div>
      <button class="btn btn--sm btn--ghost" type="button" id="pCard">Карточка</button>
    </div>

    <div class="quickops">
      <span class="fs-xxs wide upper muted">Очки:</span>
      <span class="jp" style="font-size:20px" id="pPointsVal">${pts(p.points)}</span>
      <button class="btn btn--sm" type="button" data-pts="1">+1</button>
      <button class="btn btn--sm" type="button" data-pts="5">+5</button>
      <button class="btn btn--sm" type="button" data-pts="100">+100</button>
      <button class="btn btn--sm btn--danger" type="button" data-pts="-5">−5</button>
      <button class="btn btn--sm btn--danger" type="button" data-pts="-100">−100</button>
      <button class="btn btn--sm btn--ghost" type="button" id="pSetPts">Задать…</button>
    </div>

    <div class="field-row">
      <label class="field">
        <span class="field__label">Уровень <span class="jp">等級</span></span>
        <select class="field__select" id="pLevel">
          ${levelOptions().map((l) => `<option value="${l.id}" ${p.level === l.id ? 'selected' : ''}>${l.jp} — ${l.ru}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span class="field__label">Колония <span class="jp">滞在結界</span></span>
        <select class="field__select" id="pColony">
          ${COLONIES.map((c) => `<option value="${c.id}" ${p.colony === c.id ? 'selected' : ''}>${c.jp} — ${c.ru}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span class="field__label">Статус <span class="jp">状態</span></span>
        <select class="field__select" id="pStatus">
          ${Object.entries(STATUSES).map(([k, v]) => `<option value="${k}" ${p.status === k ? 'selected' : ''}>${v.jp} — ${v.ru}</option>`).join('')}
        </select>
      </label>

      <label class="field">
        <span class="field__label">Счётчик правил <span class="jp">変更回数</span></span>
        <span class="field__wrap"><input class="field__input" id="pRules" type="number" min="0" value="${p.rules || 0}" /></span>
      </label>
    </div>

    <div class="btn-row mb-4">
      <button class="btn btn--primary btn--sm" type="button" id="pSave">Сохранить изменения</button>
      <button class="btn btn--sm btn--ghost" type="button" id="pNotify">Отправить уведомление</button>
    </div>

    <div class="panel">
      <div class="panel__head">
        <span class="panel__title">Правила участника</span>
        <span class="panel__jp jp">所持規則</span>
        <span class="panel__tools">
          <button class="btn btn--sm btn--bare" type="button" id="pGrant">+ выдать правило</button>
        </span>
      </div>
      <div class="panel__body panel__body--flush">
        ${owned.length ? owned.map((id) => {
          const r = shopRules.find((x) => x.id === id);
          if (!r) return '';
          return `
          <div class="appq__item" style="grid-template-columns:70px 1fr auto">
            <span class="rule__code">${esc(r.code)}</span>
            <span>
              <div class="fs-xs">${esc(r.title)} <span class="jp muted">${r.jp}</span></div>
            </span>
            <button class="btn btn--sm btn--danger" type="button" data-revoke="${r.id}">Отозвать</button>
          </div>`;
        }).join('') : '<div class="empty">Правил нет</div>'}
      </div>
    </div>

    ${p.isNpc ? '' : `
      <div class="danger-zone mt-4">
        <div class="danger-zone__title">Опасная зона <span class="jp">危険</span></div>
        <p class="danger-zone__text">
          Удаление участника снимает аккаунт с регистрации без возможности восстановления.
        </p>
        <div class="btn-row">
          <button class="btn btn--sm btn--danger" type="button" id="pKill">Объявить выбывшим</button>
          <button class="btn btn--sm btn--danger" type="button" id="pDelete">Удалить аккаунт</button>
        </div>
      </div>`}`;

  const admin = ctx.admin;
  const refresh = () => self.render(root, ctx);

  /* Карточка */
  on($('#pCard', pane), 'click', () => modal.open({
    title: 'Карточка участника', jp: '泳者情報', wide: true,
    body: participantCard(store.participant(selected)),
    foot: '<button class="btn btn--sm btn--ghost" type="button" data-close>Закрыть</button>',
  }));

  /* Быстрые очки */
  $$('[data-pts]', pane).forEach((b) => on(b, 'click', () => {
    const delta = Number(b.dataset.pts);
    applyPoints(p, delta, admin, refresh);
  }));

  on($('#pSetPts', pane), 'click', async () => {
    const v = await modal.prompt({
      title: 'Установить очки', jp: '得点設定',
      label: `Текущее значение: ${p.points}`, value: String(p.points),
    });
    if (v === null) return;
    const total = Math.max(0, Number(v) || 0);
    store.updateParticipant(p.id, { points: total });
    store.log(admin.email, 'points-set', `${p.name}: очки установлены в ${total}.`);
    if (!p.isNpc) {
      notify.emit('points', { amount: total - p.points, total, reason: 'решение распорядителя', actor: admin.email },
        { target: p.id, silent: true });
    }
    toast.ok('Очки обновлены', `${p.name}: ${total}`);
    refresh();
  });

  /* Сохранение полей */
  on($('#pSave', pane), 'click', () => {
    const level = $('#pLevel', pane).value;
    const colony = $('#pColony', pane).value;
    const status = $('#pStatus', pane).value;
    const rules = Math.max(0, Number($('#pRules', pane).value) || 0);

    const changes = [];
    if (level !== p.level) changes.push(`уровень → ${levelById(level).ru}`);
    if (colony !== p.colony) changes.push(`колония → ${colonyById(colony).ru}`);
    if (status !== p.status) changes.push(`статус → ${STATUSES[status].ru}`);
    if (rules !== p.rules) changes.push(`правил → ${rules}`);

    store.updateParticipant(p.id, { level, colony, status, rules });

    if (!p.isNpc) {
      if (colony !== p.colony) notify.emit('colony', { colony, actor: admin.email }, { target: p.id, silent: true });
      if (level !== p.level) notify.emit('level', { level, actor: admin.email }, { target: p.id, silent: true });
      if (status === 'dead' && p.status !== 'dead') {
        notify.emit('death', { actor: admin.email }, { target: p.id, silent: true });
      }
    }

    store.log(admin.email, 'edit-participant', `${p.name}: ${changes.join(', ') || 'без изменений'}.`);
    toast.ok('Изменения применены', `${p.name} — ${changes.length} ${changes.length ? 'правок' : 'правок'}`);
    crt.glitch($('.screen'), 220);
    refresh();
  });

  /* Персональное уведомление */
  on($('#pNotify', pane), 'click', async () => {
    if (p.isNpc) { toast.err('Недоступно', 'Запись реестра не имеет аккаунта.'); return; }
    const text = await modal.prompt({
      title: 'Уведомление участнику', jp: '通知', label: `Текст для ${p.name}`, area: true,
    });
    if (!text) return;
    notify.emit('broadcast', { title: 'Сообщение распорядителя', text, actor: admin.email }, { target: p.id, silent: true });
    toast.ok('Уведомление отправлено', p.name);
  });

  /* Выдача правила */
  on($('#pGrant', pane), 'click', () => {
    const avail = shopRules.filter((r) => !owned.includes(r.id));
    if (!avail.length) { toast.err('Нет доступных правил', 'Все правила уже выданы.'); return; }

    const el = modal.open({
      title: 'Выдача правила', jp: '規則付与', narrow: true,
      body: `
        <label class="field">
          <span class="field__label">Правило</span>
          <select class="field__select" id="grantSel">
            ${avail.map((r) => `<option value="${r.id}">${r.code} — ${esc(r.title)}</option>`).join('')}
          </select>
        </label>
        <label class="check">
          <input type="checkbox" id="grantFree" checked />
          <span class="check__box"></span>
          <span>Выдать бесплатно (без списания очков)</span>
        </label>`,
      foot: `
        <button class="btn btn--sm btn--ghost" type="button" data-close>Отмена</button>
        <button class="btn btn--sm btn--primary" type="button" id="grantGo">Выдать</button>`,
    });

    on(el.querySelector('#grantGo'), 'click', () => {
      const ruleId = el.querySelector('#grantSel').value;
      const free = el.querySelector('#grantFree').checked;
      const rule = shopRules.find((r) => r.id === ruleId);

      if (p.isNpc) {
        store.updateNpc(p.id, { rules: (p.rules || 0) + 1 });
      } else {
        store.commit((d) => {
          const u = d.users.find((x) => x.id === p.id);
          u.ownedRules = [...(u.ownedRules || []), ruleId];
          u.character.rules = (u.character.rules || 0) + 1;
          if (!free) u.character.points = Math.max(0, (u.character.points || 0) - rule.cost);
        });
        notify.emit('purchase', {
          title: rule.title, cost: free ? 0 : rule.cost,
          left: store.userById(p.id).character.points, actor: admin.email,
        }, { target: p.id, silent: true });
      }

      store.pushRuleHistory({ type: 'add', title: rule.title, jp: rule.jp, by: p.name, colony: p.colony, ruleId });
      store.log(admin.email, 'grant-rule', `${p.name}: выдано правило «${rule.title}».`);
      modal.close();
      toast.ok('Правило выдано', `${p.name}: ${rule.title}`);
      refresh();
    });
  });

  /* Отзыв правила */
  $$('[data-revoke]', pane).forEach((b) => on(b, 'click', async () => {
    const rule = shopRules.find((r) => r.id === b.dataset.revoke);
    const ok = await modal.confirm({
      title: 'Отзыв правила', jp: '規則削除', danger: true,
      text: `Исключить правило «${rule.title}» из свода участника ${p.name}?`,
      okText: 'Отозвать',
    });
    if (!ok) return;

    store.commit((d) => {
      const u = d.users.find((x) => x.id === p.id);
      if (!u) return;
      u.ownedRules = (u.ownedRules || []).filter((id) => id !== rule.id);
      u.character.rules = Math.max(0, (u.character.rules || 0) - 1);
    });

    store.pushRuleHistory({ type: 'del', title: rule.title, jp: rule.jp, by: 'Распорядитель', colony: p.colony });
    notify.emit('ruleTaken', { title: rule.title, actor: admin.email }, { target: p.id, silent: true });
    store.log(admin.email, 'revoke-rule', `${p.name}: отозвано правило «${rule.title}».`, 'warn');
    refresh();
  }));

  /* Объявить выбывшим */
  const kill = $('#pKill', pane);
  if (kill) on(kill, 'click', async () => {
    const ok = await modal.confirm({
      title: 'Выбывание участника', jp: '死亡宣告', danger: true,
      text: `Объявить участника «${p.name}» выбывшим? Он получит полноэкранное уведомление, `
          + 'а доступ к системе будет приостановлен.',
      okText: 'Объявить выбывшим',
    });
    if (!ok) return;

    store.updateParticipant(p.id, { status: 'dead' });
    if (!p.isNpc) {
      store.updateUser(p.id, { deathReason: 'Выбывание подтверждено распорядителем игры.', deadMigration: store.migration().number });
      notify.emit('death', { actor: admin.email }, { target: p.id, silent: true });
    }
    store.log(admin.email, 'kill', `${p.name} объявлен выбывшим.`, 'danger');
    toast.show({ type: 'death', title: 'Участник выбыл', text: p.name, alert: true });
    refresh();
  });

  /* Удаление */
  const del = $('#pDelete', pane);
  if (del) on(del, 'click', async () => {
    const ok = await modal.confirm({
      title: 'Удаление аккаунта', jp: '削除', danger: true,
      text: `Удалить аккаунт «${p.name}» без возможности восстановления?`,
      okText: 'Удалить',
    });
    if (!ok) return;

    store.deleteUser(p.id);
    store.log(admin.email, 'delete-user', `Аккаунт ${p.name} удалён.`, 'danger');
    selected = null;
    toast.show({ type: 'rejected', title: 'Аккаунт удалён', text: p.name, alert: true });
    refresh();
  });
}

/* Быстрое изменение очков */
function applyPoints(p, delta, admin, refresh) {
  const total = Math.max(0, (p.points || 0) + delta);
  store.updateParticipant(p.id, { points: total });

  if (!p.isNpc) {
    notify.emit(delta >= 0 ? 'points' : 'penalty', {
      amount: Math.abs(delta), total, reason: 'решение распорядителя', actor: admin.email,
    }, { target: p.id, silent: true });
  }

  store.log(admin.email, delta >= 0 ? 'points-add' : 'points-sub',
    `${p.name}: ${delta >= 0 ? '+' : ''}${delta} очков → ${total}.`);
  refresh();
}
