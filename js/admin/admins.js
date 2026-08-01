/**
 * Панель учётных записей распорядителей.
 *
 * У каждой записи своя почта, свой пароль и свой секретный код —
 * вход в панель нельзя передать, назвав только почту с паролём.
 * Пароли и коды хранятся хешами: показать их система не может, только заменить.
 */

import { $, $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { toast, modal } from '../core/ui.js?v=11';
import { esc, dt } from '../core/format.js?v=11';

export const adminsAdmin = {
  render(root, ctx) {
    const refresh = () => this.render(root, ctx);
    const list = store.admins();
    const me = ctx.admin;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">10</span>
        <span class="sec-head__title">Распорядители</span>
        <span class="sec-head__jp jp">運営一覧</span>
      </div>

      <div class="panel panel--framed">
        <div class="panel__head">
          <span class="panel__title">Вход в панель</span>
          <span class="panel__jp jp">認証</span>
          <span class="panel__tools fs-xxs muted">записей: ${list.length}</span>
        </div>
        <div class="panel__body">
          <p class="fs-xs">
            Панель открывается по трём значениям: почта, пароль и секретный код.
            Код у каждой записи свой — зная чужую почту и пароль, войти всё равно нельзя.
          </p>
          <p class="fs-xxs muted mono mt-2">
            Пароли и коды хранятся только хешами. Посмотреть забытый код нельзя —
            его можно заменить кнопкой «Код» в строке записи.
          </p>
        </div>
      </div>

      <div class="panel mt-4">
        <div class="panel__head">
          <span class="panel__title">Учётные записи</span>
          <span class="panel__jp jp">一覧</span>
          <span class="panel__tools">
            <button class="btn btn--sm btn--primary" type="button" id="aNew">+ Завести запись</button>
          </span>
        </div>
        <div class="panel__body panel__body--flush scroll-y" style="max-height:520px">
          ${list.map((a) => {
            const name = a.name || (a.character || {}).name || a.email;
            const mine = a.id === me.id;
            return `
            <div class="logline logline--acct">
              <span class="logline__ts">${a.createdAt ? dt(a.createdAt) : '—'}</span>
              <span class="logline__act">${esc(name)}${mine ? ' · вы' : ''}</span>
              <span class="logline__text">
                ${esc(a.email)}
                <span class="fs-xxs muted mono">
                  · код ${a.ownCode ? 'личный' : 'общий системный'}
                </span>
              </span>
              <span class="logline__tools">
                <button class="btn btn--sm btn--bare" type="button" data-name="${a.id}">Имя</button>
                <button class="btn btn--sm btn--bare" type="button" data-pass="${a.id}">Пароль</button>
                <button class="btn btn--sm btn--bare" type="button" data-code="${a.id}">Код</button>
                ${mine ? '' : `<button class="btn btn--sm btn--bare" type="button"
                                       data-del="${a.id}" style="color:var(--danger-ink)">Удалить</button>`}
              </span>
            </div>`;
          }).join('') || '<div class="empty"><span class="jp-big">空</span>Записей нет</div>'}
        </div>
      </div>`;

    const byId = (id) => list.find((a) => a.id === id);

    /* Новая запись */
    on($('#aNew', root), 'click', async () => {
      const email = await modal.prompt({
        title: 'Новая запись распорядителя', jp: '運営追加',
        label: 'Почта для входа',
      });
      if (!email) return;

      const password = await modal.prompt({
        title: 'Пароль', jp: '合言葉', label: 'Не короче шести символов',
      });
      if (!password) return;

      const code = await modal.prompt({
        title: 'Секретный код', jp: '秘密符号', label: 'Не короче четырёх символов',
      });
      if (!code) return;

      const name = await modal.prompt({
        title: 'Как подписывать', jp: '表示名', label: 'Имя в журнале и в шапке',
        value: email.split('@')[0],
      });

      try {
        await store.addAdmin({ email, password, code, name: name || '' });
      } catch (err) { toast.err('Запись не создана', err.message); return; }

      toast.ok('Запись создана', `${email} · запишите пароль и код`);
      refresh();
    });

    /* Имя */
    $$('[data-name]', root).forEach((b) => on(b, 'click', async () => {
      const a = byId(b.dataset.name);
      const name = await modal.prompt({
        title: 'Имя распорядителя', jp: '表示名', label: a.email,
        value: a.name || '',
      });
      if (name === null) return;

      try {
        await store.updateAdmin(a.id, { name });
      } catch (err) { toast.err('Не сохранено', err.message); return; }
      toast.ok('Имя обновлено');
      refresh();
    }));

    /* Пароль */
    $$('[data-pass]', root).forEach((b) => on(b, 'click', async () => {
      const a = byId(b.dataset.pass);
      const password = await modal.prompt({
        title: 'Новый пароль', jp: '合言葉', label: `${a.email} · не короче шести символов`,
      });
      if (!password) return;

      try {
        await store.updateAdmin(a.id, { password });
      } catch (err) { toast.err('Не сохранено', err.message); return; }
      toast.ok('Пароль заменён', 'Прежние входы этой записи закрыты');
      refresh();
    }));

    /* Код */
    $$('[data-code]', root).forEach((b) => on(b, 'click', async () => {
      const a = byId(b.dataset.code);
      const code = await modal.prompt({
        title: 'Новый секретный код', jp: '秘密符号', label: `${a.email} · не короче четырёх символов`,
      });
      if (!code) return;

      try {
        await store.updateAdmin(a.id, { code });
      } catch (err) { toast.err('Не сохранено', err.message); return; }
      toast.ok('Код заменён', 'Запишите его — восстановить нельзя');
      refresh();
    }));

    /* Удаление */
    $$('[data-del]', root).forEach((b) => on(b, 'click', async () => {
      const a = byId(b.dataset.del);
      const ok = await modal.confirm({
        title: 'Удалить запись', jp: '削除', danger: true,
        text: `Учётная запись ${a.email} будет удалена, открытые вкладки под ней закроются.`,
        okText: 'Удалить',
      });
      if (!ok) return;

      try {
        await store.removeAdmin(a.id);
      } catch (err) { toast.err('Не удалено', err.message); return; }
      toast.ok('Запись удалена', a.email);
      refresh();
    }));

    return root;
  },
};
