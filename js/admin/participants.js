/**
 * Админ: редактирование участников — очки, уровень, колония, статус,
 * выдача и отзыв правил, удаление.
 */

import { $, $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { esc, pts } from '../core/format.js?v=11';
import { modal, toast } from '../core/ui.js?v=11';
import { notify } from '../core/notify.js?v=11';
import { levelOptions, COLONIES, STATUSES, colonyById, levelById } from '../data/labels.js?v=11';
import { participantIcon } from '../core/sprites.js?v=11';
import { participantCard } from '../sections/shared.js?v=11';
import { crt } from '../core/crt.js?v=11';

let selected = null;
let query = '';

// Охват массовых действий переживает перерисовку: иначе после первого
// действия он молча сбрасывался на «все» и следующее задевало лишних.
let massScope = 'all';
let massAmount = 5;

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

      <div class="panel panel--framed mb-4">
        <div class="panel__head">
          <span class="panel__title">Массовые действия</span>
          <span class="panel__jp jp">一斉操作</span>
          <span class="panel__tools fs-xxs muted">применяются сразу ко всем выбранным</span>
        </div>
        <div class="panel__body">
          <div class="quickops" style="margin:0">
            <select class="field__select" id="massScope" style="width:auto;padding:6px 30px 6px 10px">
              <option value="all" ${massScope === 'all' ? 'selected' : ''}>Все участники</option>
              <option value="alive" ${massScope === 'alive' ? 'selected' : ''}>Только те, кто в игре</option>
              ${COLONIES.map((c) => `<option value="c:${c.id}" ${massScope === `c:${c.id}` ? 'selected' : ''}>Колония: ${c.ru}</option>`).join('')}
            </select>
            <span class="field__wrap" style="width:96px">
              <input class="field__input" id="massPoints" type="number" min="0" value="${massAmount}" />
            </span>
            <button class="btn btn--sm btn--primary" type="button" id="massAdd">Начислить всем</button>
            <button class="btn btn--sm btn--danger" type="button" id="massSub">Списать у всех</button>
            <span class="push"></span>
            <button class="btn btn--sm btn--danger" type="button" id="massKill">Объявить выбывшими</button>
            <button class="btn btn--sm btn--ghost" type="button" id="massRevive">Вернуть в игру</button>
          </div>
          <p class="fs-xxs mono muted mt-2" id="massCount"></p>
        </div>
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
              <button class="editor__item ${p.id === selected ? 'is-active' : ''} ${
              !p.isNpc && (p.missedStreak || 0) >= 3 ? 'is-warned' : ''}" type="button" data-sel="${p.id}">
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

    wireMassOps(root, ctx, this);
    paintPane(root, ctx, this);
    return root;
  },
};

/* ---------------- Массовые действия ---------------- */

function wireMassOps(root, ctx, self) {
  const scope = $('#massScope', root);
  const count = $('#massCount', root);
  const refresh = () => self.render(root, ctx);

  /** Кого затрагивает выбранный охват */
  const targets = () => {
    const v = scope.value;
    let list = store.participants();
    if (v === 'alive') list = list.filter((p) => p.status !== 'dead');
    else if (v.startsWith('c:')) list = list.filter((p) => p.colony === v.slice(2));
    return list;
  };

  const paintCount = () => {
    const list = targets();
    count.textContent = `> Затронет участников: ${list.length}`
      + (list.length ? ` (${list.slice(0, 3).map((p) => p.name).join(', ')}${list.length > 3 ? '…' : ''})` : '');
  };

  on(scope, 'change', () => { massScope = scope.value; paintCount(); });
  on($('#massPoints', root), 'input', (e) => { massAmount = Math.max(0, Number(e.target.value) || 0); });
  paintCount();

  /**
   * Общая обработка: подтверждение → один запрос к серверу.
   * Сервер сам обходит участников, шлёт уведомления и пишет журнал —
   * так изменение не может остаться наполовину применённым.
   */
  const bulk = async ({ title, jp, text, okText, danger = false, action, amount = 0 }) => {
    const list = targets();
    if (!list.length) { toast.err('Никого не затронуто', 'В выбранном охвате нет участников.'); return; }

    const ok = await modal.confirm({
      title, jp, danger,
      text: `${text}\n\nЗатронет участников: ${list.length}.`,
      okText,
    });
    if (!ok) return;

    try {
      const res = await store.mass({ scope: scope.value, action, amount });
      toast.ok('Готово', `Затронуто участников: ${res.affected}`);
    } catch (err) {
      toast.err('Действие не выполнено', err.message);
      return;
    }
    refresh();
  };

  on($('#massAdd', root), 'click', () => {
    const amount = Math.max(0, Number($('#massPoints', root).value) || massAmount);
    if (!amount) { toast.err('Укажите количество очков'); return; }
    massAmount = amount;
    bulk({
      title: 'Начисление очков', jp: '一斉加点',
      text: `Начислить по ${amount} очков каждому.`,
      okText: 'Начислить', action: 'add', amount,
    });
  });

  on($('#massSub', root), 'click', () => {
    const amount = Math.max(0, Number($('#massPoints', root).value) || massAmount);
    if (!amount) { toast.err('Укажите количество очков'); return; }
    massAmount = amount;
    bulk({
      title: 'Списание очков', jp: '一斉減点', danger: true,
      text: `Списать по ${amount} очков у каждого. Ниже нуля счёт не опускается.`,
      okText: 'Списать', action: 'sub', amount,
    });
  });

  on($('#massKill', root), 'click', () => bulk({
    title: 'Массовое выбывание', jp: '一斉死亡宣告', danger: true,
    text: 'Все выбранные участники получат полноэкранное уведомление о выбывании, '
        + 'а доступ к системе им закроется.',
    okText: 'Объявить выбывшими', action: 'kill',
  }));

  on($('#massRevive', root), 'click', () => bulk({
    title: 'Массовый возврат в игру', jp: '一斉復帰',
    text: 'Выбранные участники вернутся в игру, экран выбывания у них снимется.',
    okText: 'Вернуть', action: 'revive',
  }));
}

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
          ${p.isNpc ? '' : ` · пропусков ${p.missedStreak || 0}/3`
            + (store.phase() === 'confirm'
                ? (p.joinedNo === store.migration().number ? ' · участие подтверждено' : ' · ждём подтверждения')
                : '')}
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
      ${p.status === 'dead'
        ? '<button class="btn btn--sm btn--primary" type="button" id="pRevive">Вернуть в игру</button>'
        : ''}
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

    <!-- Карточка мувсета из Workshop: распорядитель видит её прямо здесь -->
    ${p.isNpc ? '' : `
      <div class="panel mb-4">
        <div class="panel__head">
          <span class="panel__title">Карточка мувсета</span>
          <span class="panel__jp jp">技表</span>
        </div>
        <div class="panel__body">
          ${store.userById(p.id)?.card
            ? `<img class="cardshot" src="${store.userById(p.id).card}" alt="Карточка мувсета участника" />`
            : `<p class="fs-xxs muted mono">
                 Карточка не приложена — участник регистрировался до её появления.
                 Система сама попросит его загрузить карточку при входе.
               </p>`}
        </div>
      </div>`}

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
  $$('[data-pts]', pane).forEach((b) => on(b, 'click', async () => {
    try {
      await store.changePoints(p.id, { delta: Number(b.dataset.pts) });
    } catch (err) { toast.err('Не удалось изменить очки', err.message); return; }
    refresh();
  }));

  on($('#pSetPts', pane), 'click', async () => {
    const v = await modal.prompt({
      title: 'Установить очки', jp: '得点設定',
      label: `Текущее значение: ${p.points}`, value: String(p.points),
    });
    if (v === null) return;
    const total = Math.max(0, Number(v) || 0);
    try {
      await store.changePoints(p.id, { value: total });
    } catch (err) { toast.err('Не удалось задать очки', err.message); return; }
    toast.ok('Очки обновлены', `${p.name}: ${total}`);
    refresh();
  });

  /* Сохранение полей */
  on($('#pSave', pane), 'click', async () => {
    const level = $('#pLevel', pane).value;
    const colony = $('#pColony', pane).value;
    const status = $('#pStatus', pane).value;
    const rules = Math.max(0, Number($('#pRules', pane).value) || 0);

    const changes = [];
    if (level !== p.level) changes.push(`уровень → ${levelById(level).ru}`);
    if (colony !== p.colony) changes.push(`колония → ${colonyById(colony).ru}`);
    if (status !== p.status) changes.push(`статус → ${STATUSES[status].ru}`);
    if (rules !== p.rules) changes.push(`правил → ${rules}`);

    try {
      await store.updateParticipant(p.id, { level, colony, status, rules });
    } catch (err) { toast.err('Изменения не сохранены', err.message); return; }

    toast.ok('Изменения применены', `${p.name}: ${changes.join(', ') || 'без изменений'}`);
    crt.glitch($('.screen'), 220);
    refresh();
  });

  /* Возврат выбывшего участника в игру */
  const revive = $('#pRevive', pane);
  if (revive) on(revive, 'click', async () => {
    const ok = await modal.confirm({
      title: 'Возврат в игру', jp: '復帰',
      text: `Вернуть участника «${p.name}» в игру? Экран выбывания у него снимется, `
          + 'доступ к разделам восстановится.',
      okText: 'Вернуть',
    });
    if (!ok) return;

    try {
      await store.revive(p.id);
    } catch (err) { toast.err('Не удалось вернуть', err.message); return; }

    toast.ok('Участник возвращён', p.name);
    refresh();
  });

  /* Персональное уведомление */
  on($('#pNotify', pane), 'click', async () => {
    if (p.isNpc) { toast.err('Недоступно', 'Запись реестра не имеет аккаунта.'); return; }
    const text = await modal.prompt({
      title: 'Уведомление участнику', jp: '通知', label: `Текст для ${p.name}`, area: true,
    });
    if (!text) return;
    try {
      await store.addNotification({ title: 'Сообщение распорядителя', text, target: p.id });
    } catch (err) { toast.err('Не отправлено', err.message); return; }
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

    on(el.querySelector('#grantGo'), 'click', async () => {
      const ruleId = el.querySelector('#grantSel').value;
      const free = el.querySelector('#grantFree').checked;
      const rule = shopRules.find((r) => r.id === ruleId);

      try {
        await store.grantRule(p.id, ruleId, free);
      } catch (err) { toast.err('Не удалось выдать', err.message); return; }

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

    try {
      await store.revokeRule(p.id, rule.id);
    } catch (err) { toast.err('Не удалось отозвать', err.message); return; }

    toast.ok('Правило отозвано', rule.title);
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

    try {
      await store.updateParticipant(p.id, { status: 'dead' });
    } catch (err) { toast.err('Не удалось объявить выбывшим', err.message); return; }

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

    try {
      await store.deleteUser(p.id);
    } catch (err) { toast.err('Не удалось удалить', err.message); return; }

    selected = null;
    toast.show({ type: 'rejected', title: 'Аккаунт удалён', text: p.name, alert: true });
    refresh();
  });
}
