/**
 * Админ: правила магазина, создание уведомлений, рассылка.
 */

import { $, $$, on } from '../core/dom.js?v=6';
import { store } from '../core/store.js?v=6';
import { esc, dt } from '../core/format.js?v=6';
import { modal, toast } from '../core/ui.js?v=6';
import { notify } from '../core/notify.js?v=6';
import { NOTICE_TYPES, COLONIES } from '../data/labels.js?v=6';

/* ==================== Правила магазина ==================== */

export const rulesAdmin = {
  id: 'rules',
  title: 'Правила магазина',
  jp: '規則管理',

  render(root, ctx) {
    const rules = store.shopRules();
    const refresh = () => this.render(root, ctx);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">03</span>
        <span class="sec-head__title">Правила магазина</span>
        <span class="sec-head__jp jp">規則管理</span>
      </div>

      <div class="btn-row mb-4">
        <button class="btn btn--primary btn--sm" type="button" id="rNew">+ Создать правило</button>
        <span class="fs-xxs muted" style="align-self:center">
          Игрок покупает только эти записи. Свои формулировки недоступны.
        </span>
      </div>

      <div class="table-scroll">
        <table class="dtable">
          <thead>
            <tr>
              <th>Код</th><th>Название</th><th>Японское</th><th>Раздел</th>
              <th>Цена</th><th>Владельцев</th><th>Статус</th><th></th>
            </tr>
          </thead>
          <tbody>
            ${rules.map((r) => {
              const owners = store.users().filter((u) => (u.ownedRules || []).includes(r.id)).length;
              return `
              <tr>
                <td class="mono">${esc(r.code)}</td>
                <td>${esc(r.title)}</td>
                <td class="jp">${esc(r.jp)}</td>
                <td class="fs-xxs muted">${esc(r.cat)}</td>
                <td class="jp">${r.cost}</td>
                <td class="jp">${owners}</td>
                <td>${r.enabled === false ? '<span class="status status--out">скрыто</span>' : '<span class="status status--active">в продаже</span>'}</td>
                <td>
                  <span class="btn-row">
                    <button class="btn btn--sm btn--bare" type="button" data-edit="${r.id}">правка</button>
                    <button class="btn btn--sm btn--bare" type="button" data-toggle="${r.id}">${r.enabled === false ? 'вернуть' : 'скрыть'}</button>
                    <button class="btn btn--sm btn--bare" type="button" data-del="${r.id}" style="color:var(--danger-ink)">удалить</button>
                  </span>
                </td>
              </tr>`;
            }).join('')}
          </tbody>
        </table>
      </div>`;

    on($('#rNew', root), 'click', () => editRule(null, ctx, refresh));
    $$('[data-edit]', root).forEach((b) => on(b, 'click', () => editRule(b.dataset.edit, ctx, refresh)));

    $$('[data-toggle]', root).forEach((b) => on(b, 'click', () => {
      const r = store.shopRules().find((x) => x.id === b.dataset.toggle);
      store.updateShopRule(r.id, { enabled: r.enabled === false });
      store.log(ctx.admin.email, 'rule-toggle', `Правило «${r.title}» ${r.enabled === false ? 'возвращено в продажу' : 'скрыто'}.`);
      refresh();
    }));

    $$('[data-del]', root).forEach((b) => on(b, 'click', async () => {
      const r = store.shopRules().find((x) => x.id === b.dataset.del);
      const ok = await modal.confirm({
        title: 'Удаление правила', jp: '削除', danger: true,
        text: `Удалить «${r.title}» из магазина? У участников, купивших правило, оно останется в своде.`,
        okText: 'Удалить',
      });
      if (!ok) return;
      store.removeShopRule(r.id);
      store.log(ctx.admin.email, 'rule-delete', `Правило «${r.title}» удалено из магазина.`, 'warn');
      toast.show({ type: 'ruleTaken', title: 'Правило удалено', text: r.title, alert: true });
      refresh();
    }));

    return root;
  },
};

function editRule(id, ctx, refresh) {
  const r = id ? store.shopRules().find((x) => x.id === id) : null;
  const cats = [...new Set(store.shopRules().map((x) => x.cat))];

  const el = modal.open({
    title: r ? `Правка: ${r.title}` : 'Новое правило магазина',
    jp: r ? '規則編集' : '規則作成',
    body: `
      <div class="field-row">
        <label class="field">
          <span class="field__label">Код</span>
          <span class="field__wrap"><input class="field__input" id="fCode" value="${esc(r?.code || `R-${String(store.shopRules().length + 1).padStart(2, '0')}`)}" /></span>
        </label>
        <label class="field">
          <span class="field__label">Стоимость (очки)</span>
          <span class="field__wrap"><input class="field__input" id="fCost" type="number" min="0" value="${r?.cost ?? 100}" /></span>
        </label>
        <label class="field">
          <span class="field__label">Раздел</span>
          <span class="field__wrap"><input class="field__input" id="fCat" list="catList" value="${esc(r?.cat || 'Особые')}" /></span>
          <datalist id="catList">${cats.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </label>
      </div>
      <label class="field">
        <span class="field__label">Название правила</span>
        <span class="field__wrap"><input class="field__input" id="fTitle" value="${esc(r?.title || '')}" /></span>
      </label>
      <label class="field">
        <span class="field__label">Японское написание</span>
        <span class="field__wrap"><input class="field__input jp" id="fJp" value="${esc(r?.jp || '')}" /></span>
      </label>
      <label class="field">
        <span class="field__label">Формулировка правила</span>
        <textarea class="field__area" id="fText" rows="5">${esc(r?.text || '')}</textarea>
      </label>`,
    foot: `
      <button class="btn btn--sm btn--ghost" type="button" data-close>Отмена</button>
      <button class="btn btn--sm btn--primary" type="button" id="fSave">${r ? 'Сохранить' : 'Создать'}</button>`,
  });

  on(el.querySelector('#fSave'), 'click', () => {
    const data = {
      code: el.querySelector('#fCode').value.trim(),
      cost: Math.max(0, Number(el.querySelector('#fCost').value) || 0),
      cat: el.querySelector('#fCat').value.trim() || 'Особые',
      title: el.querySelector('#fTitle').value.trim(),
      jp: el.querySelector('#fJp').value.trim(),
      text: el.querySelector('#fText').value.trim(),
    };

    if (!data.title || !data.text) {
      toast.err('Не сохранено', 'Название и формулировка обязательны.');
      return;
    }

    if (r) {
      store.updateShopRule(r.id, data);
      store.log(ctx.admin.email, 'rule-edit', `Правило «${data.title}» изменено.`);
    } else {
      store.addShopRule(data);
      store.log(ctx.admin.email, 'rule-create', `Создано правило магазина «${data.title}».`);
      notify.emit('rule', { title: data.title, by: null, actor: ctx.admin.email }, { target: 'all', silent: true });
    }

    modal.close();
    toast.ok(r ? 'Правило обновлено' : 'Правило создано', data.title);
    refresh();
  });
}

/* ==================== Создание уведомлений ==================== */

export const noticesAdmin = {
  id: 'notices',
  title: 'Уведомления',
  jp: '通知作成',

  render(root, ctx) {
    const players = store.users().filter((u) => u.role !== 'admin' && u.state === 'approved');
    const all = store.db.notifications;
    const refresh = () => this.render(root, ctx);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">04</span>
        <span class="sec-head__title">Создание уведомлений</span>
        <span class="sec-head__jp jp">通知作成</span>
      </div>

      <div class="cols cols--2">
        <div class="panel panel--framed">
          <div class="panel__head"><span class="panel__title">Новое уведомление</span><span class="panel__jp jp">作成</span></div>
          <div class="panel__body">
            <div class="field-row">
              <label class="field">
                <span class="field__label">Тип события</span>
                <select class="field__select" id="nType">
                  ${Object.entries(NOTICE_TYPES).map(([k, v]) => `<option value="${k}">${v.ru} — ${v.jp}</option>`).join('')}
                </select>
              </label>
              <label class="field">
                <span class="field__label">Получатель</span>
                <select class="field__select" id="nTarget">
                  <option value="all">Все участники</option>
                  ${players.map((u) => `<option value="${u.id}">${esc(u.character?.name || u.email)}</option>`).join('')}
                </select>
              </label>
            </div>
            <label class="field">
              <span class="field__label">Заголовок</span>
              <span class="field__wrap"><input class="field__input" id="nTitle" placeholder="Оставьте пустым для стандартного" /></span>
            </label>
            <label class="field">
              <span class="field__label">Текст</span>
              <textarea class="field__area" id="nText" rows="4"></textarea>
            </label>
            <button class="btn btn--primary btn--sm" type="button" id="nSend">Отправить уведомление</button>
          </div>
        </div>

        <div class="panel panel--framed">
          <div class="panel__head">
            <span class="panel__title">Отправленные</span>
            <span class="panel__jp jp">履歴</span>
            <span class="panel__tools fs-xxs muted">${all.length}</span>
          </div>
          <div class="panel__body panel__body--flush scroll-y" style="max-height:440px">
            ${all.slice(0, 40).map((n) => {
              const target = n.target === 'all' ? 'все' : (store.userById(n.target)?.character?.name || 'участник');
              return `
              <div class="logline">
                <span class="logline__ts">${dt(n.ts)}</span>
                <span class="logline__act">${esc(NOTICE_TYPES[n.type]?.ru || n.type)}</span>
                <span>${esc(n.title)} <span class="muted">→ ${esc(target)}</span></span>
              </div>`;
            }).join('') || '<div class="empty">Нет отправленных</div>'}
          </div>
        </div>
      </div>`;

    on($('#nSend', root), 'click', () => {
      const type = $('#nType', root).value;
      const target = $('#nTarget', root).value;
      const title = $('#nTitle', root).value.trim();
      const text = $('#nText', root).value.trim();

      if (!text && !title) { toast.err('Не отправлено', 'Заполните заголовок или текст.'); return; }

      notify.emit(type, {
        overrideTitle: title || undefined, title, text, actor: ctx.admin.email,
      }, { target, silent: false });
      $('#nTitle', root).value = '';
      $('#nText', root).value = '';
      toast.ok('Уведомление отправлено', target === 'all' ? 'Всем участникам' : 'Адресно');
      refresh();
    });

    return root;
  },
};

/* ==================== Рассылка ==================== */

export const broadcastAdmin = {
  id: 'broadcast',
  title: 'Рассылка сообщений',
  jp: '一斉通知',

  render(root, ctx) {
    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">05</span>
        <span class="sec-head__title">Рассылка сообщений</span>
        <span class="sec-head__jp jp">一斉通知</span>
      </div>

      <div class="panel panel--framed">
        <div class="panel__head"><span class="panel__title">Сообщение от системы Коганэ</span><span class="panel__jp jp">通達</span></div>
        <div class="panel__body">
          <div class="field-row">
            <label class="field">
              <span class="field__label">Кому</span>
              <select class="field__select" id="bScope">
                <option value="all">Всем участникам</option>
                <option value="alive">Только тем, кто в игре</option>
                ${COLONIES.map((c) => `<option value="colony:${c.id}">Колония: ${c.ru} (${c.jp})</option>`).join('')}
              </select>
            </label>
            <label class="field">
              <span class="field__label">Заголовок</span>
              <span class="field__wrap"><input class="field__input" id="bTitle" value="Распоряжение системы" /></span>
            </label>
          </div>

          <label class="field">
            <span class="field__label">Текст рассылки</span>
            <textarea class="field__area" id="bText" rows="6"
              placeholder="Текст увидят все выбранные участники в истории уведомлений и всплывающим окном."></textarea>
          </label>

          <div class="btn-row">
            <button class="btn btn--primary" type="button" id="bSend">Разослать</button>
            <button class="btn btn--sm btn--ghost" type="button" id="bTest">Показать себе (проверка)</button>
          </div>
        </div>
      </div>

      <div class="panel mt-4">
        <div class="panel__head"><span class="panel__title">Готовые шаблоны</span><span class="panel__jp jp">定型文</span></div>
        <div class="panel__body">
          <div class="btn-row">
            <button class="btn btn--sm btn--ghost" type="button" data-tpl="declare">Напоминание о сроке объявления</button>
            <button class="btn btn--sm btn--ghost" type="button" data-tpl="barrier">Изменение барьеров</button>
            <button class="btn btn--sm btn--ghost" type="button" data-tpl="rules">Изменение свода правил</button>
            <button class="btn btn--sm btn--ghost" type="button" data-tpl="warn">Предупреждение участникам</button>
          </div>
        </div>
      </div>`;

    const TPL = {
      declare: ['Срок объявления', 'До истечения девятнадцатидневного срока осталось менее суток. Участники, не объявившие о начале игры, лишатся проклятой техники.'],
      barrier: ['Изменение барьеров', 'Конфигурация барьеров пересчитана. Перемещение между колониями возможно только по действующим правилам.'],
      rules: ['Свод правил обновлён', 'В игру внесено новое правило. Ознакомьтесь с разделом «История правил».'],
      warn: ['Предупреждение', 'Зафиксированы действия, противоречащие своду правил. Нарушители будут лишены очков.'],
    };

    $$('[data-tpl]', root).forEach((b) => on(b, 'click', () => {
      const [title, text] = TPL[b.dataset.tpl];
      $('#bTitle', root).value = title;
      $('#bText', root).value = text;
    }));

    const send = (testOnly = false) => {
      const scope = $('#bScope', root).value;
      const title = $('#bTitle', root).value.trim();
      const text = $('#bText', root).value.trim();

      if (!text) { toast.err('Не отправлено', 'Введите текст рассылки.'); return; }

      if (testOnly) {
        toast.show({ type: 'broadcast', title, text });
        return;
      }

      let targets = store.users().filter((u) => u.role !== 'admin' && u.state === 'approved');
      if (scope === 'alive') targets = targets.filter((u) => u.character?.status !== 'dead');
      if (scope.startsWith('colony:')) {
        const cid = scope.slice(7);
        targets = targets.filter((u) => u.character?.colony === cid);
      }

      if (scope === 'all') {
        notify.emit('broadcast', { title, text, actor: ctx.admin.email }, { target: 'all' });
      } else {
        targets.forEach((u) => notify.emit('broadcast', { title, text, actor: ctx.admin.email },
          { target: u.id, silent: true }));
        toast.ok('Рассылка выполнена', `Получателей: ${targets.length}`);
      }

      store.log(ctx.admin.email, 'broadcast', `Рассылка «${title}» (${scope}).`);
      $('#bText', root).value = '';
    };

    on($('#bSend', root), 'click', () => send(false));
    on($('#bTest', root), 'click', () => send(true));

    return root;
  },
};
