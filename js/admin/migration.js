/**
 * Админ: управление миграцией, журнал, база системы.
 */

import { $, $$, on } from '../core/dom.js?v=11';
import { store } from '../core/store.js?v=11';
import { esc, dt, dtFull, pts, ago } from '../core/format.js?v=11';
import { modal, toast } from '../core/ui.js?v=11';
import { notify } from '../core/notify.js?v=11';
import { crt } from '../core/crt.js?v=11';
import { audio } from '../core/audio.js?v=11';
import { COLONIES } from '../data/labels.js?v=11';

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
          <div class="hero-line__title">${{
            active: 'Миграция идёт',
            confirm: 'Подтверждение участия',
            neutral: 'Нейтральный период',
          }[store.phase()] || 'Миграция завершена'}</div>
          <p class="hero-line__sub">
            Начало: ${dt(mig.startedAt)}${mig.endedAt ? ` · Завершение: ${dt(mig.endedAt)}` : ''}<br />
            ${esc(mig.note || 'Распоряжений нет.')}
          </p>
        </div>
        <span class="migration__state ${mig.active ? 'migration__state--on' : 'migration__state--off'}">
          ${{ active: '進行中', confirm: '参加確認', neutral: '休止' }[store.phase()] || '終了'}
        </span>
      </div>

      <div class="astats">
        <div class="tile"><span class="tile__key">Участников</span><span class="tile__val jp">${pts(all.length)}</span></div>
        <div class="tile"><span class="tile__key">В игре</span><span class="tile__val jp">${pts(alive.length)}</span></div>
        <div class="tile"><span class="tile__key">Выбыло</span><span class="tile__val jp">${pts(all.length - alive.length)}</span></div>
        <div class="tile"><span class="tile__key">Правил в своде</span><span class="tile__val jp">${pts(store.ruleHistory().length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Подтвердили участие</span><span class="tile__val jp">${
          pts(all.filter((p) => !p.isNpc && p.joinedNo === mig.number).length, 2)}</span></div>
        <div class="tile"><span class="tile__key">На пределе пропусков</span><span class="tile__val jp">${
          pts(all.filter((p) => !p.isNpc && (p.missedStreak || 0) >= 3).length, 2)}</span></div>
      </div>

      ${store.phase() === 'confirm' ? `
        <div class="panel panel--framed mt-4" style="border-color:var(--phos-lo)">
          <div class="panel__head">
            <span class="panel__title">Идёт подтверждение участия</span>
            <span class="panel__jp jp">参加確認</span>
          </div>
          <div class="panel__body">
            <p class="fs-xs">
              У каждого участника открыто окно с одной кнопкой «Принять участие».
              Осталось <b id="confLeft">—</b>. По истечении срока миграция начнётся сама:
              подтвердившие войдут в игру, остальным зачтётся пропуск.
            </p>
            <div class="btn-row mt-3">
              <button class="btn btn--sm btn--primary" type="button" id="confNow">
                Закрыть подтверждение и начать миграцию
              </button>
            </div>
          </div>
        </div>` : ''}

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

    /* Окно подтверждения: отсчёт и досрочное закрытие */
    const left = $('#confLeft', root);
    if (left) {
      const tick = () => {
        const ms = store.confirmLeft();
        const t = Math.max(0, Math.round(ms / 1000));
        left.textContent = `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
      };
      tick();
      const timer = setInterval(() => {
        if (!document.body.contains(left)) { clearInterval(timer); return; }
        tick();
      }, 1000);
    }

    on($('#confNow', root), 'click', async () => {
      const ok = await modal.confirm({
        title: 'Начать миграцию сейчас', jp: '参加確認終了',
        text: 'Подтверждение закроется досрочно. Кто не успел нажать «Принять участие», '
            + 'получит пропуск. Продолжить?',
        okText: 'Начать',
      });
      if (!ok) return;

      let missed = 0;
      try {
        const res = await store.finishConfirm();
        missed = res.missed || 0;
      } catch (err) { toast.err('Не выполнено', err.message); return; }

      audio.ok();
      toast.ok('Миграция началась', missed ? `Пропустили: ${missed}` : 'Все подтвердили участие');
      refresh();
    });

    on($('#mNoteSave', root), 'click', async () => {
      const note = $('#mNote', root).value.trim();
      try {
        await store.setMigrationNote(note);
      } catch (err) { toast.err('Не сохранено', err.message); return; }
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

      try {
        await store.startMigration(note);
      } catch (err) { toast.err('Не удалось начать', err.message); return; }

      notify.emit('migStart', { number: store.migration().number });
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
      try {
        await store.endMigration(note);
      } catch (err) { toast.err('Не удалось завершить', err.message); return; }

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
    const npcs = store.npcs();
    const security = store.security();

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">08</span>
        <span class="sec-head__title">База системы</span>
        <span class="sec-head__jp jp">基盤</span>
      </div>

      <div class="astats">
        <div class="tile"><span class="tile__key">Аккаунтов</span><span class="tile__val jp">${pts(store.users().length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Записей реестра</span><span class="tile__val jp">${pts(npcs.length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Правил магазина</span><span class="tile__val jp">${pts(store.shopRules().length, 2)}</span></div>
        <div class="tile"><span class="tile__key">Уведомлений</span><span class="tile__val jp">${pts(store.notifications('all').length, 3)}</span></div>
        <div class="tile"><span class="tile__key">Записей журнала</span><span class="tile__val jp">${pts(store.logs().length, 3)}</span></div>
        <div class="tile"><span class="tile__key">Хранилище</span><span class="tile__val tile__val--text fs-xs">${store.storage()}</span></div>
      </div>
      ${store.storageTemporary() ? `
        <div class="panel panel--framed mt-4" style="border-color:var(--danger);color:var(--danger-ink)">
          <div class="panel__head">
            <span class="panel__title">База временная — данные сотрутся</span>
            <span class="panel__jp jp">警告</span>
          </div>
          <div class="panel__body">
            <p class="fs-xs">
              Сайт работает на файловой базе внутри контейнера, а не на PostgreSQL.
              Такой файл живёт до следующего развёртывания: при обновлении сайта
              все аккаунты участников и реестр исчезнут.
            </p>
            <p class="fs-xxs mono mt-2">
              Исправление: в Railway откройте сервис сайта → Variables → Add →
              Reference → Postgres.DATABASE_URL, затем перезапустите сервис.
              Проверить можно по адресу <b>/api/health</b>: должно быть
              <b>"database": "postgresql"</b>.
            </p>
          </div>
        </div>` : ''}

      <div class="panel panel--framed mt-4">
        <div class="panel__head">
          <span class="panel__title">Безопасность</span>
          <span class="panel__jp jp">秘密符号</span>
          <span class="panel__tools fs-xxs muted">
            ${security.codeChanged ? 'код изменён' : 'используется код по умолчанию'}
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
                <input class="field__input" id="secCode" type="password" autocomplete="new-password"
                       placeholder="не короче 4 символов" />
              </span>
            </label>
            <label class="field">
              <span class="field__label">Новый пароль распорядителя</span>
              <span class="field__wrap">
                <input class="field__input" id="secPass" type="password" autocomplete="new-password"
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
              Данные хранятся в базе PostgreSQL на сервере и общие для всех участников.
              Выгрузка снимает копию текущего состояния — на случай разбора спорных ситуаций.
            </p>
            <div class="btn-row">
              <button class="btn btn--sm btn--primary" type="button" id="dbExport">Выгрузить копию</button>
            </div>
          </div>
        </div>

        <div class="panel">
          <div class="panel__head"><span class="panel__title">Служебное</span><span class="panel__jp jp">保守</span></div>
          <div class="panel__body">
            <div class="btn-row mb-4">
              <button class="btn btn--sm btn--ghost" type="button" id="dbClearLogs">Очистить журнал</button>
              <button class="btn btn--sm btn--ghost" type="button" id="dbClearNotices">Очистить уведомления</button>
              ${npcs.length
                ? `<button class="btn btn--sm btn--ghost" type="button" id="dbClearNpcs">
                     Убрать демо-реестр (${npcs.length})
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
              <div class="danger-zone__title">Очистка реестра <span class="jp">泳者削除</span></div>
              <p class="danger-zone__text">
                Удаляет все аккаунты участников: анкеты, очки, купленные правила.
                Почты после этого снова свободны для регистрации. Свод правил,
                магазин, миграция, журнал и учётные записи распорядителей остаются.
              </p>
              <button class="btn btn--sm btn--danger" type="button" id="dbPurge">
                Удалить все аккаунты участников (${store.users().filter((u) => u.role !== 'admin').length})
              </button>
            </div>

            <div class="danger-zone mt-4">
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

      try {
        await store.setSecurity({ code: code || null, password: pass || null });
      } catch (err) { toast.err('Не сохранено', err.message); return; }

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

      let count = 0;
      try { count = await store.clearNpcs(); }
      catch (err) { toast.err('Не удалось очистить', err.message); return; }
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

      let count = 0;
      try { count = await store.loadDemoRoster(); }
      catch (err) { toast.err('Не удалось загрузить', err.message); return; }
      toast.ok('Демо-реестр загружен', `Записей: ${count}`);
      this.render(root, ctx);
    });

    on($('#dbExport', root), 'click', async () => {
      const blob = new Blob([await store.exportState()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `kogane-db-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.ok('База выгружена');
    });

    on($('#dbClearLogs', root), 'click', async () => {
      if (!await modal.confirm({ title: 'Очистка журнала', jp: '記録削除', text: 'Удалить все записи журнала?', danger: true, okText: 'Очистить' })) return;
      try { await store.clearLogs(); }
      catch (err) { toast.err('Не удалось очистить', err.message); return; }
      this.render(root, ctx);
    });

    on($('#dbClearNotices', root), 'click', async () => {
      if (!await modal.confirm({ title: 'Очистка уведомлений', jp: '通知削除', text: 'Удалить всю историю уведомлений участников?', danger: true, okText: 'Очистить' })) return;
      try { await store.clearNotices(); }
      catch (err) { toast.err('Не удалось очистить', err.message); return; }
      this.render(root, ctx);
    });

    on($('#dbPurge', root), 'click', async () => {
      const сколько = store.users().filter((u) => u.role !== 'admin').length;
      const ok = await modal.confirm({
        title: 'Очистка реестра', jp: '泳者削除', danger: true,
        text: `Будут удалены все аккаунты участников: ${сколько}. `
            + 'Вместе с ними — анкеты, очки и купленные правила. '
            + 'Почты снова станут свободными. Отменить нельзя.',
        okText: 'Удалить всех',
      });
      if (!ok) return;

      const слово = await modal.prompt({
        title: 'Подтверждение очистки', jp: '確認',
        label: 'Введите слово УДАЛИТЬ для подтверждения',
      });
      if (слово !== 'УДАЛИТЬ') { toast.err('Очистка отменена', 'Подтверждение не совпало.'); return; }

      let removed = 0;
      try {
        const res = await store.purgeUsers();
        removed = res.removed;
      } catch (err) { toast.err('Не выполнено', err.message); return; }

      crt.glitch($('.screen'), 500);
      toast.ok('Реестр очищен', `Удалено аккаунтов: ${removed}`);
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

      try { await store.resetSystem(); }
      catch (err) { toast.err('Сброс не выполнен', err.message); return; }
      crt.glitch($('.screen'), 800);
      toast.show({ type: 'migEnd', title: 'Система сброшена', text: 'База возвращена к начальному состоянию.', alert: true });
      setTimeout(() => location.replace('../index.html'), 1400);
    });

    return root;
  },
};
