/**
 * Админ: управление миграцией, журнал, база системы.
 */

import { $, $$, on } from '../core/dom.js?v=7';
import { store } from '../core/store.js?v=7';
import { esc, dt, dtFull, pts, ago } from '../core/format.js?v=7';
import { modal, toast } from '../core/ui.js?v=7';
import { notify } from '../core/notify.js?v=7';
import { crt } from '../core/crt.js?v=7';
import { audio } from '../core/audio.js?v=7';
import { COLONIES } from '../data/labels.js?v=7';

/* ==================== Миграция ==================== */

export const migrationAdmin = {
  id: 'migration',
  title: 'Управление миграцией',
  jp: '回游管理',

  render(root, ctx) {
    const mig = store.migration();
    const all = store.participants();
    const alive = all.filter((p) => p.status !== 'dead');
    const refresh = () => this.render(root, ctx);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">06</span>
        <span class="sec-head__title">Управление миграцией</span>
        <span class="sec-head__jp jp">回游管理</span>
      </div>

      <div class="hero-line mb-4">
        <div class="hero-line__text">
          <div class="hero-line__jp jp chroma">死滅回游 ${mig.number}</div>
          <div class="hero-line__title">${mig.active ? 'Миграция идёт' : 'Миграция завершена'}</div>
          <p class="hero-line__sub">
            Начало: ${dt(mig.startedAt)}${mig.endedAt ? ` · Завершение: ${dt(mig.endedAt)}` : ''}<br />
            ${esc(mig.note || 'Распоряжений нет.')}
          </p>
        </div>
        <span class="migration__state ${mig.active ? 'migration__state--on' : 'migration__state--off'}">
          ${mig.active ? '進行中' : '終了'}
        </span>
      </div>

      <div class="astats">
        <div class="tile"><span class="tile__key">Участников</span><span class="tile__val jp">${pts(all.length)}</span></div>
        <div class="tile"><span class="tile__key">В игре</span><span class="tile__val jp">${pts(alive.length)}</span></div>
        <div class="tile"><span class="tile__key">Выбыло</span><span class="tile__val jp">${pts(all.length - alive.length)}</span></div>
        <div class="tile"><span class="tile__key">Правил в своде</span><span class="tile__val jp">${pts(store.ruleHistory().length, 2)}</span></div>
      </div>

      <div class="cols cols--2 mt-4">
        <div class="panel panel--framed">
          <div class="panel__head"><span class="panel__title">Действия распорядителя</span><span class="panel__jp jp">権限行使</span></div>
          <div class="panel__body">
            <p class="fs-xxs mono muted mb-4">
              Завершение миграции переводит всех участников в состояние «Погиб» и показывает им
              полноэкранное уведомление. Аккаунты остаются неактивными до начала новой миграции.
            </p>
            <div class="btn-row">
              <button class="btn btn--primary" type="button" id="mStart" ${mig.active ? 'disabled' : ''}>
                Начать новую миграцию
              </button>
              <button class="btn btn--danger" type="button" id="mEnd" ${mig.active ? '' : 'disabled'}>
                Завершить миграцию
              </button>
            </div>
            <div class="divider--dashed" style="margin:var(--sp-4) 0"></div>
            <label class="field" style="margin:0">
              <span class="field__label">Распоряжение (текст для участников)</span>
              <textarea class="field__area" id="mNote" rows="3">${esc(mig.note || '')}</textarea>
            </label>
            <button class="btn btn--sm btn--ghost mt-2" type="button" id="mNoteSave">Сохранить распоряжение</button>
          </div>
        </div>

        <div class="panel panel--framed">
          <div class="panel__head"><span class="panel__title">Распределение по барьерам</span><span class="panel__jp jp">結界分布</span></div>
          <div class="panel__body panel__body--flush">
            ${COLONIES.map((c) => {
              const inC = all.filter((p) => p.colony === c.id);
              const aliveC = inC.filter((p) => p.status !== 'dead').length;
              const width = all.length ? Math.round((inC.length / all.length) * 100) : 0;
              return `
              <div class="datarow" style="padding:8px 12px">
                <span class="datarow__key" style="min-width:150px">${c.jp} · ${esc(c.ru)}</span>
                <span class="datarow__val">
                  <div class="row"><span class="jp">${pts(aliveC, 2)}</span>
                  <span class="fs-xxs muted">из ${pts(inC.length, 2)}</span></div>
                  <div class="bar mt-1"><div class="bar__fill" style="--fill:${width}%"></div></div>
                </span>
              </div>`;
            }).join('')}
          </div>
        </div>
      </div>`;

    on($('#mNoteSave', root), 'click', () => {
      const note = $('#mNote', root).value.trim();
      store.commit((d) => { d.migration.note = note; });
      store.log(ctx.admin.email, 'migration-note', `Распоряжение обновлено: ${note}`);
      toast.ok('Распоряжение сохранено');
    });

    on($('#mStart', root), 'click', async () => {
      const note = await modal.prompt({
        title: 'Начало новой миграции', jp: '回游開始',
        label: 'Распоряжение для участников', area: true,
        value: 'Барьеры развёрнуты заново. Объявите о начале игры в течение девятнадцати дней.',
        okText: 'Начать миграцию',
      });
      if (note === null) return;

      store.startMigration(note);
      notify.emit('migStart', { number: store.migration().number, actor: ctx.admin.email }, { target: 'all' });
      store.log(ctx.admin.email, 'migration-start', `Миграция №${store.migration().number} начата.`);
      audio.ok();
      crt.tear($('.screen'));
      refresh();
    });

    on($('#mEnd', root), 'click', async () => {
      const ok = await modal.confirm({
        title: 'Завершение миграции', jp: '回游終了', danger: true,
        text: 'Все участники получат полноэкранное уведомление о выбывании, '
            + 'а их аккаунты станут неактивными до следующей миграции. Продолжить?',
        okText: 'Завершить миграцию',
      });
      if (!ok) return;

      const note = await modal.prompt({
        title: 'Причина завершения', jp: '理由',
        label: 'Текст увидят все участники', area: true,
        value: 'Барьеры свёрнуты по распоряжению распорядителя игры.',
        okText: 'Подтвердить',
      });
      if (note === null) return;

      const number = store.migration().number;
      store.endMigration(note);
      notify.emit('migEnd', { number, text: note, actor: ctx.admin.email }, { target: 'all' });
      store.log(ctx.admin.email, 'migration-end', `Миграция №${number} завершена. ${note}`, 'danger');

      audio.death();
      crt.glitch($('.screen'), 900);
      toast.show({ type: 'migEnd', title: `Миграция №${number} завершена`, text: note, alert: true });
      refresh();
    });

    return root;
  },
};

/* ==================== Журнал ==================== */

let logFilter = 'all';

export const logsAdmin = {
  id: 'logs',
  title: 'Журнал действий',
  jp: '記録',

  render(root, ctx) {
    const logs = store.logs();
    const list = logFilter === 'all' ? logs : logs.filter((l) => l.level === logFilter);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">07</span>
        <span class="sec-head__title">Журнал действий</span>
        <span class="sec-head__jp jp">記録</span>
      </div>

      <div class="roster__bar mb-4" style="border:2px solid var(--ink-line)">
        <button class="chip ${logFilter === 'all' ? 'is-active' : ''}" type="button" data-lf="all">Все записи</button>
        <button class="chip ${logFilter === 'warn' ? 'is-active' : ''}" type="button" data-lf="warn">Предупреждения</button>
        <button class="chip ${logFilter === 'danger' ? 'is-active' : ''}" type="button" data-lf="danger">Критические</button>
        <span class="push fs-xxs muted">Записей: ${pts(list.length, 3)} · хранится последние 500</span>
      </div>

      <div class="panel panel--framed">
        <div class="panel__head">
          <span class="panel__title">История системы</span>
          <span class="panel__jp jp">系統記録</span>
          <span class="panel__tools">
            <button class="btn btn--sm btn--bare" type="button" id="logCopy">скопировать</button>
          </span>
        </div>
        <div class="panel__body panel__body--flush scroll-y" style="max-height:560px">
          ${list.map((l) => `
            <div class="logline ${l.level === 'danger' ? 'logline--danger' : ''}">
              <span class="logline__ts">${dtFull(l.ts)}</span>
              <span class="logline__act">${esc(l.action)}</span>
              <span><b>${esc(l.actor)}</b> — ${esc(l.text)}</span>
            </div>`).join('') || '<div class="empty">Записей нет</div>'}
        </div>
      </div>`;

    $$('[data-lf]', root).forEach((b) => on(b, 'click', () => {
      logFilter = b.dataset.lf;
      this.render(root, ctx);
    }));

    on($('#logCopy', root), 'click', async () => {
      const text = list.map((l) => `${dtFull(l.ts)}\t${l.actor}\t${l.action}\t${l.text}`).join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast.ok('Журнал скопирован', `${list.length} записей в буфере обмена`);
      } catch {
        toast.err('Не удалось скопировать', 'Браузер отклонил доступ к буферу обмена.');
      }
    });

    return root;
  },
};

/* ==================== База системы ==================== */

export const baseAdmin = {
  id: 'base',
  title: 'База системы',
  jp: '基盤',

  render(root, ctx) {
    const db = store.db;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">08</span>
        <span class="sec-head__title">База системы</span>
        <span class="sec-head__jp jp">基盤</span>
      </div>

      <div class="astats">
        <div class="tile"><span class="tile__key">Аккаунтов</span><span class="tile__val jp">${pts(db.users.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Записей реестра</span><span class="tile__val jp">${pts(db.npcs.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Правил магазина</span><span class="tile__val jp">${pts(db.shopRules.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Уведомлений</span><span class="tile__val jp">${pts(db.notifications.length, 3)}</span></div>
        <div class="tile"><span class="tile__key">Записей журнала</span><span class="tile__val jp">${pts(db.logs.length, 3)}</span></div>
        <div class="tile"><span class="tile__key">База создана</span><span class="tile__val tile__val--text fs-xs">${ago(db.createdAt)}</span></div>
      </div>

      <div class="panel panel--framed mt-4">
        <div class="panel__head">
          <span class="panel__title">Безопасность</span>
          <span class="panel__jp jp">秘密符号</span>
          <span class="panel__tools fs-xxs muted">
            ${db.security?.codeChanged ? `код изменён ${dt(db.security.updatedAt)}` : 'используется код по умолчанию'}
          </span>
        </div>
        <div class="panel__body">
          <p class="fs-xxs mono muted mb-4">
            Панель распорядителя открывается только при вводе секретного кода вместе
            с почтой и паролем. Смените и код, и пароль перед тем, как открывать сайт другим.
          </p>
          <div class="field-row">
            <label class="field">
              <span class="field__label">Новый секретный код</span>
              <span class="field__wrap">
                <input class="field__input" id="secCode" type="text" autocomplete="off"
                       placeholder="не короче 4 символов" />
              </span>
            </label>
            <label class="field">
              <span class="field__label">Новый пароль распорядителя</span>
              <span class="field__wrap">
                <input class="field__input" id="secPass" type="text" autocomplete="off"
                       placeholder="не короче 6 символов" />
              </span>
            </label>
          </div>
          <div class="btn-row">
            <button class="btn btn--primary btn--sm" type="button" id="secSave">Применить</button>
            <span class="fs-xxs muted" style="align-self:center">
              Код хранится только в виде хеша — восстановить его нельзя, лишь заменить.
            </span>
          </div>
        </div>
      </div>

      <div class="cols cols--2 mt-4">
        <div class="panel panel--framed">
          <div class="panel__head"><span class="panel__title">Выгрузка и загрузка</span><span class="panel__jp jp">入出力</span></div>
          <div class="panel__body">
            <p class="fs-xxs mono muted mb-4">
              База системы хранится в этом браузере (localStorage). Выгрузите её файлом,
              чтобы перенести состояние игры на другое устройство.
            </p>
            <div class="btn-row">
              <button class="btn btn--sm btn--primary" type="button" id="dbExport">Выгрузить в файл</button>
              <button class="btn btn--sm btn--ghost" type="button" id="dbImport">Загрузить из файла</button>
              <input type="file" id="dbFile" accept="application/json" hidden />
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel__head"><span class="panel__title">Служебное</span><span class="panel__jp jp">保守</span></div>
          <div class="panel__body">
            <div class="btn-row mb-4">
              <button class="btn btn--sm btn--ghost" type="button" id="dbClearLogs">Очистить журнал</button>
              <button class="btn btn--sm btn--ghost" type="button" id="dbClearNotices">Очистить уведомления</button>
              ${db.npcs.length
                ? `<button class="btn btn--sm btn--ghost" type="button" id="dbClearNpcs">
                     Убрать демо-реестр (${db.npcs.length})
                   </button>`
                : `<button class="btn btn--sm btn--ghost" type="button" id="dbLoadNpcs">
                     Загрузить демо-реестр
                   </button>`}
            </div>
            <p class="fs-xxs mono muted mb-4">
              Реестр участников наполняется теми, кто прошёл регистрацию и одобрение.
              Демо-записи (персонажи аниме) нужны только для проверки внешнего вида
              таблицы и поиска — в игре они не участвуют.
            </p>
            <div class="danger-zone">
              <div class="danger-zone__title">Полный сброс <span class="jp">初期化</span></div>
              <p class="danger-zone__text">
                Все аккаунты, анкеты, правила и журнал будут удалены. База вернётся
                к начальному состоянию с участниками из аниме.
              </p>
              <button class="btn btn--sm btn--danger" type="button" id="dbReset">Сбросить систему</button>
            </div>
          </div>
        </div>
      </div>`;

    /* Смена секретного кода и пароля */
    on($('#secSave', root), 'click', async () => {
      const code = $('#secCode', root).value.trim();
      const pass = $('#secPass', root).value.trim();

      if (!code && !pass) { toast.err('Ничего не изменено', 'Заполните хотя бы одно поле.'); return; }
      if (code && code.length < 4) { toast.err('Код отклонён', 'Не короче четырёх символов.'); return; }
      if (pass && pass.length < 6) { toast.err('Пароль отклонён', 'Не короче шести символов.'); return; }

      const ok = await modal.confirm({
        title: 'Смена доступа', jp: '変更確認',
        text: 'Новые данные потребуются при следующем входе в панель. '
            + 'Восстановить их невозможно — запишите перед подтверждением.',
        okText: 'Применить',
      });
      if (!ok) return;

      if (code) {
        store.setAdminCode(code);
        store.log(ctx.admin.email, 'code-change', 'Секретный код администрации изменён.', 'warn');
      }
      if (pass) {
        store.setAdminPassword(pass);
        store.log(ctx.admin.email, 'pass-change', 'Пароль распорядителя изменён.', 'warn');
      }

      toast.ok('Доступ обновлён', code && pass ? 'Код и пароль заменены' : (code ? 'Код заменён' : 'Пароль заменён'));
      this.render(root, ctx);
    });

    /* Демо-реестр: удаление и загрузка */
    const clearBtn = $('#dbClearNpcs', root);
    if (clearBtn) on(clearBtn, 'click', async () => {
      const ok = await modal.confirm({
        title: 'Очистка реестра', jp: '一覧削除', danger: true,
        text: 'Из таблицы участников будут удалены демонстрационные записи. '
            + 'Останутся только игроки, прошедшие регистрацию. Продолжить?',
        okText: 'Убрать записи',
      });
      if (!ok) return;

      const count = store.clearNpcs();
      store.log(ctx.admin.email, 'db-clear-npcs', `Удалено демо-записей реестра: ${count}.`, 'warn');
      toast.ok('Реестр очищен', `Удалено записей: ${count}`);
      this.render(root, ctx);
    });

    const loadBtn = $('#dbLoadNpcs', root);
    if (loadBtn) on(loadBtn, 'click', async () => {
      const ok = await modal.confirm({
        title: 'Загрузка демо-реестра', jp: '一覧読込',
        text: 'В таблицу будут добавлены демонстрационные записи (персонажи аниме) '
            + 'для проверки внешнего вида таблицы и поиска. Реальные игроки не затрагиваются.',
        okText: 'Загрузить',
      });
      if (!ok) return;

      const count = store.loadDemoRoster();
      store.log(ctx.admin.email, 'db-load-npcs', `Загружено демо-записей: ${count}.`);
      toast.ok('Демо-реестр загружен', `Записей: ${count}`);
      this.render(root, ctx);
    });

    on($('#dbExport', root), 'click', () => {
      const blob = new Blob([store.export()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kogane-db-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      store.log(ctx.admin.email, 'db-export', 'База выгружена в файл.');
      toast.ok('База выгружена');
    });

    on($('#dbImport', root), 'click', () => $('#dbFile', root).click());

    on($('#dbFile', root), 'change', async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        store.import(await file.text());
        toast.ok('База загружена', 'Состояние системы восстановлено.');
        setTimeout(() => location.reload(), 900);
      } catch (err) {
        toast.err('Ошибка загрузки', err.message);
      }
    });

    on($('#dbClearLogs', root), 'click', async () => {
      if (!await modal.confirm({ title: 'Очистка журнала', jp: '記録削除', text: 'Удалить все записи журнала?', danger: true, okText: 'Очистить' })) return;
      store.commit((d) => { d.logs = []; });
      store.log(ctx.admin.email, 'db-clear-logs', 'Журнал очищен.', 'warn');
      this.render(root, ctx);
    });

    on($('#dbClearNotices', root), 'click', async () => {
      if (!await modal.confirm({ title: 'Очистка уведомлений', jp: '通知削除', text: 'Удалить всю историю уведомлений участников?', danger: true, okText: 'Очистить' })) return;
      store.commit((d) => { d.notifications = []; });
      store.log(ctx.admin.email, 'db-clear-notices', 'История уведомлений очищена.', 'warn');
      this.render(root, ctx);
    });

    on($('#dbReset', root), 'click', async () => {
      const ok = await modal.confirm({
        title: 'Полный сброс системы', jp: '初期化', danger: true,
        text: 'Это удалит все аккаунты и анкеты без возможности восстановления. Продолжить?',
        okText: 'Сбросить',
      });
      if (!ok) return;

      const word = await modal.prompt({
        title: 'Подтверждение сброса', jp: '確認',
        label: 'Введите слово СБРОС для подтверждения',
      });
      if (word !== 'СБРОС') { toast.err('Сброс отменён', 'Подтверждение не совпало.'); return; }

      store.reset();
      crt.glitch($('.screen'), 800);
      toast.show({ type: 'migEnd', title: 'Система сброшена', text: 'База возвращена к начальному состоянию.', alert: true });
      setTimeout(() => location.replace('../index.html'), 1400);
    });

    return root;
  },
};
