/**
 * Панель ивентов: запуск и остановка общих событий.
 *
 * Событие видят все и сразу: оформление системы меняется, включается
 * музыка события, участникам приходит уведомление. Идёт до остановки.
 */

import { $, $$, on } from '../core/dom.js?v=10';
import { store } from '../core/store.js?v=10';
import { audio } from '../core/audio.js?v=10';
import { events, EVENTS } from '../core/events.js?v=10';
import { music, youtubeId } from '../core/music.js?v=10';
import { toast, modal } from '../core/ui.js?v=10';
import { dt, esc } from '../core/format.js?v=10';

/* Что показывать на карточке каждого события */
const CARDS = [
  {
    id: 'sukuna',
    no: '01',
    color: 'Багровый',
    music: 'Тяжёлая поступь, тайко, храмовый распев',
    visual: 'Люминофор выгорает в багровый, экран рассекают следы ударов',
  },
  {
    id: 'duel',
    no: '02',
    color: 'Ледяной синий',
    music: 'Быстрый пульс, переклички двух сторон, столкновения',
    visual: 'Изображение рвётся между синей и багровой энергией, вспышки',
  },
  {
    id: 'parade',
    no: '03',
    color: 'Фиолетовый сумрак',
    music: 'Шествие, колокольчики, флейта в японском ладу',
    visual: 'Ночь и фонари шествия, поднимающиеся снизу вверх',
  },
];

export const eventsAdmin = {
  render(root, ctx) {
    const refresh = () => this.render(root, ctx);
    const now = store.event();
    const active = now && now.id ? now.id : null;

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">09</span>
        <span class="sec-head__title">Ивенты</span>
        <span class="sec-head__jp jp">催事</span>
      </div>

      <div class="panel panel--framed">
        <div class="panel__head">
          <span class="panel__title">Что это такое</span>
          <span class="panel__jp jp">説明</span>
        </div>
        <div class="panel__body">
          <p class="fs-xs">
            Ивент — общее событие для всех сразу. Пока он идёт, у каждого участника
            меняется оформление системы и играет своя музыка события, а в историю
            уведомлений приходит объявление. Запускать может только распорядитель.
          </p>
          <p class="fs-xxs muted mono mt-2">
            Музыку каждому событию можно назначить своей ссылкой — она играет
            во встроенном проигрывателе YouTube. Если ссылки нет или ролик
            не открылся, включается написанная тема системы.
            Участник со снятой громкостью увидит событие без музыки.
          </p>
          <p class="fs-xxs muted mono mt-2">
            Браузер не даёт запускать звук, пока человек ничего не нажал на странице —
            это его правило, обойти нельзя. Такому участнику система покажет
            рядом с меткой события кнопку «♪ включить музыку».
          </p>
        </div>
      </div>

      ${active ? `
        <div class="panel panel--framed mt-4" style="border-color:var(--phos-lo)">
          <div class="panel__head">
            <span class="panel__title">Идёт сейчас</span>
            <span class="panel__jp jp">進行中</span>
          </div>
          <div class="panel__body">
            <div class="astats">
              <div class="tile">
                <span class="tile__key">Событие</span>
                <span class="tile__val tile__val--text fs-xs">${EVENTS[active]?.title || active}</span>
              </div>
              <div class="tile">
                <span class="tile__key">Запустил</span>
                <span class="tile__val tile__val--text fs-xs">${now.startedBy || '—'}</span>
              </div>
              <div class="tile">
                <span class="tile__key">Звук</span>
                <span class="tile__val tile__val--text fs-xs">${
                  music.current === 'external' ? 'запись по ссылке'
                    : (music.current ? 'тема системы' : 'молчит')
                }</span>
              </div>
              <div class="tile">
                <span class="tile__key">Начало</span>
                <span class="tile__val tile__val--text fs-xs">${now.startedAt ? dt(now.startedAt) : '—'}</span>
              </div>
            </div>
            <div class="btn-row mt-3">
              <button class="btn btn--sm btn--danger" type="button" id="evStop">Остановить событие</button>
              <span class="fs-xxs muted" style="align-self:center">
                Оформление у всех вернётся к обычному в течение четырёх секунд
              </span>
            </div>
          </div>
        </div>` : ''}

      <div class="cols cols--2 mt-4">
        ${CARDS.map((c) => {
          const info = EVENTS[c.id];
          const isOn = active === c.id;
          const src = store.eventMusic(c.id);
          return `
          <div class="panel ${isOn ? 'panel--framed' : ''}">
            <div class="panel__head">
              <span class="panel__title">${c.no} ${info.title}</span>
              <span class="panel__jp jp">${info.jp}</span>
            </div>
            <div class="panel__body">
              <p class="fs-xs">${info.sub}</p>
              <div class="mt-3 fs-xxs mono muted">
                <div>Оформление: ${c.visual}</div>
                <div>Палитра: ${c.color}</div>
                <div>Своя тема: ${c.music}</div>
              </div>

              <label class="field mt-3">
                <span class="field__label">Музыка события</span>
                <select class="field__select" data-kind="${c.id}">
                  <option value="youtube" ${src.kind === 'youtube' ? 'selected' : ''}>Ссылка YouTube</option>
                  <option value="file" ${src.kind === 'file' ? 'selected' : ''}>Свой звуковой файл</option>
                  <option value="synth" ${src.kind === 'synth' ? 'selected' : ''}>Тема системы (синтез)</option>
                </select>
              </label>
              <label class="field">
                <span class="field__wrap">
                  <input class="field__input" data-url="${c.id}" placeholder="https://youtu.be/…"
                         value="${esc(src.url || '')}" ${src.kind === 'synth' ? 'disabled' : ''} />
                </span>
                <span class="field__hint"><span>${
                  src.kind === 'youtube' && src.url
                    ? (youtubeId(src.url) ? `ролик ${youtubeId(src.url)}` : 'в ссылке не найден идентификатор ролика')
                    : 'Ссылка на ролик или на звуковой файл'
                }</span></span>
              </label>
              <div class="btn-row">
                <button class="btn btn--sm btn--ghost" type="button" data-music="${c.id}">
                  Сохранить музыку
                </button>
              </div>
              <div class="btn-row mt-3">
                <button class="btn btn--sm ${isOn ? '' : 'btn--primary'}" type="button"
                        data-run="${c.id}" ${isOn ? 'disabled' : ''}>
                  ${isOn ? 'Уже идёт' : 'Запустить'}
                </button>
                <button class="btn btn--sm btn--ghost" type="button" data-try="${c.id}">
                  Посмотреть у себя
                </button>
              </div>
            </div>
          </div>`;
        }).join('')}
      </div>`;

    /* Запуск события — для всех */
    $$('[data-run]', root).forEach((b) => on(b, 'click', async () => {
      const id = b.dataset.run;
      const info = EVENTS[id];
      const ok = await modal.confirm({
        title: 'Запуск события', jp: '催事開始',
        text: `«${info.title}» начнётся у всех участников сразу: сменится оформление `
            + 'системы и включится музыка. Событие идёт, пока вы его не остановите.',
        okText: 'Запустить',
      });
      if (!ok) return;

      try {
        await store.startEvent(id);
      } catch (err) { toast.err('Событие не запущено', err.message); return; }

      audio.unlock();
      events.announce(id);
      toast.ok('Событие запущено', info.title);
      refresh();
    }));

    /* Предпросмотр — только на своём экране, другим ничего не уходит */
    $$('[data-try]', root).forEach((b) => on(b, 'click', () => {
      const id = b.dataset.try;
      audio.unlock();
      events.announce(id);
      toast.show({
        type: 'broadcast', title: 'Предпросмотр',
        text: `${EVENTS[id].title} — показано только вам. `
            + 'Обновится при следующем ответе сервера.',
      });
    }));

    /* Источник музыки */
    $$('[data-kind]', root).forEach((sel) => on(sel, 'change', () => {
      const input = $(`[data-url="${sel.dataset.kind}"]`, root);
      input.disabled = sel.value === 'synth';
    }));

    $$('[data-music]', root).forEach((b) => on(b, 'click', async () => {
      const id = b.dataset.music;
      const kind = $(`[data-kind="${id}"]`, root).value;
      const url = $(`[data-url="${id}"]`, root).value.trim();

      if (kind === 'youtube' && url && !youtubeId(url)) {
        toast.err('Ссылка не принята', 'В ней нет идентификатора ролика YouTube');
        return;
      }

      try {
        await store.setEventMusic({ id, kind, url });
      } catch (err) { toast.err('Не сохранено', err.message); return; }

      toast.ok('Музыка события сохранена',
        kind === 'synth' ? 'Будет играть тема системы' : 'Проверьте её кнопкой «Посмотреть у себя»');

      // Если это событие идёт прямо сейчас — перезапускаем звук
      if (active === id) events.reloadMusic();
      refresh();
    }));

    /* Остановка */
    const stop = $('#evStop', root);
    if (stop) {
      on(stop, 'click', async () => {
        const ok = await modal.confirm({
          title: 'Остановить событие', jp: '催事終了',
          text: 'Оформление и музыка вернутся к обычным у всех участников.',
          okText: 'Остановить', danger: true,
        });
        if (!ok) return;

        try {
          await store.stopEvent();
        } catch (err) { toast.err('Не остановлено', err.message); return; }

        events.announce(null);
        toast.ok('Событие завершено');
        refresh();
      });
    }

    return root;
  },
};
