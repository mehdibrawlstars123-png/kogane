/**
 * Общая разметка реестра: строка списка и полная карточка участника.
 * Используется в таблице, поиске и админке.
 */

import { participantIcon, sprite } from '../core/sprites.js?v=11';
import { esc, pts, highlight, dt } from '../core/format.js?v=11';
import { colonyById, levelById, STATUSES, JP } from '../data/labels.js?v=11';
import { store } from '../core/store.js?v=11';
import { modal } from '../core/ui.js?v=11';
import { APPLICATION_SCHEMA } from '../data/seed.js?v=11';

/** Строка таблицы участников — композиция как на кадре аниме */
export function rosterRow(p, { index = 0, me = null, query = '' } = {}) {
  const colony = colonyById(p.colony);
  const alive = p.status !== 'dead';

  return `
  <button class="roster__row ${me === p.id ? 'is-me' : ''} ${alive ? '' : 'is-dead'}"
          type="button" data-id="${p.id}" style="--row-delay:${Math.min(index * 26, 520)}ms">
    <span class="rface">${participantIcon(alive, 3)}</span>

    <span class="rcell rcell--name">
      <span class="rname">
        <span class="rname__ru">${highlight(p.name, query)}</span>
        <span class="rname__jp jp">${esc(p.nameJp || '—')}</span>
      </span>
    </span>

    <span class="rcell rcell--points">
      <span class="rpoints jp">${pts(p.points)}</span>
      <span class="jp muted" style="font-size:11px"> ${JP.points}</span>
    </span>

    <span class="rcell rcell--rules">
      <span class="rrules jp">${pts(p.rules, 2)}<small> ${JP.times}</small></span>
    </span>

    <span class="rcell rcell--colony">
      <span class="rcolony">
        <span>${esc(colony.ru)}</span>
        <span class="jp">${colony.jp}</span>
      </span>
    </span>
  </button>`;
}

/** Шапка колонок */
export function rosterCols(sort = { key: 'points', dir: -1 }) {
  const arrow = (key) => (sort.key === key ? (sort.dir === -1 ? ' ▼' : ' ▲') : '');
  return `
  <div class="roster__cols">
    <span></span>
    <button type="button" data-sort="name" data-dir="${arrow('name')}">Участник</button>
    <button type="button" data-sort="points" data-dir="${arrow('points')}">Очки</button>
    <button type="button" data-sort="rules" data-dir="${arrow('rules')}">Правил</button>
    <button type="button" data-sort="colony" data-dir="${arrow('colony')}">Колония</button>
  </div>`;
}

/** Полная карточка участника (как читаемый экран Коганэ) */
export function participantCard(p) {
  const colony = colonyById(p.colony);
  const level = levelById(p.level);
  const st = STATUSES[p.status] || STATUSES.active;
  const alive = p.status !== 'dead';

  const rules = (p.ownedRules || [])
    .map((id) => store.shopRules().find((r) => r.id === id))
    .filter(Boolean);

  return `
  <div class="pcard" style="border:0;padding:0">
    <div class="pcard__top">
      <span class="rface">${participantIcon(alive, 5)}</span>
      <span class="pcard__ident">
        <span class="pcard__jp jp chroma">${esc(p.nameJp || '—')}</span>
        <div class="pcard__name">${esc(p.name)}</div>
      </span>
      <span class="pcard__mark">
        <span class="status ${st.cls}">${st.ru} / ${st.jp}</span>
      </span>
    </div>

    <div class="readout">
      <div class="readout__item">
        <span class="readout__key">Очки <span class="jp">${JP.points}</span></span>
        <span class="readout__val jp">${pts(p.points)}</span>
      </div>
      <div class="readout__item">
        <span class="readout__key">Правил <span class="jp">${JP.ruleChange}</span></span>
        <span class="readout__val jp">${pts(p.rules, 2)}<small>${JP.times}</small></span>
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

    ${rules.length ? `
      <div class="mt-4">
        <div class="label mb-2">Установленные правила</div>
        ${rules.map((r) => `
          <div class="datarow">
            <span class="datarow__key">${r.code} · ${r.jp}</span>
            <span class="datarow__val fs-xs">${esc(r.title)}</span>
          </div>`).join('')}
      </div>` : ''}

    ${p.application ? applicationBlock(p.application) : `
      <p class="mt-4 fs-xxs muted mono">
        Анкета недоступна: запись внесена в реестр системой.
      </p>`}
  </div>`;
}

/**
 * Блок с анкетой персонажа внутри карточки.
 * @param {string[]} omit ключи, которые уже показаны выше и не нужны повторно
 */
export function applicationBlock(app, { omit = [] } = {}) {
  // Порядок вывода: техника, затем контакты, затем всё прочее,
  // что могло остаться от анкет прежнего образца.
  const primary = ['technique', 'techDesc', 'roblox', 'discord'];
  const legacy = ['domain', 'extensions', 'tools', 'weakness', 'appearance',
    'character', 'bio', 'goal', 'quote', 'origin', 'age', 'gender', 'status', 'sample', 'contact'];
  const keys = [...primary, ...legacy];

  const label = (key) => {
    for (const s of APPLICATION_SCHEMA) {
      const f = s.fields.find((x) => x.key === key);
      if (f) return f.label;
    }
    const fallback = {
      roblox: 'Ник в Roblox', discord: 'Ник в Discord',
      technique: 'Проклятая техника', techDesc: 'Что делает техника',
      domain: 'Расширение территории', extensions: 'Расширения техники',
      tools: 'Проклятые инструменты', weakness: 'Слабые стороны',
      appearance: 'Внешность', character: 'Характер', bio: 'Биография',
      goal: 'Цель в миграции', quote: 'Реплика', origin: 'Происхождение',
      age: 'Возраст', gender: 'Пол', status: 'Кем является',
      sample: 'Пробный отыгрыш', contact: 'Контакт',
    };
    return fallback[key] || key;
  };

  const rows = keys
    .filter((k) => app[k] && !omit.includes(k))
    .map((k) => `
      <div class="datarow">
        <span class="datarow__key">${esc(label(k))}</span>
        <span class="datarow__val prose">${esc(String(app[k]))}</span>
      </div>`).join('');

  return `
  <div class="mt-4">
    <div class="label mb-2">Анкета персонажа <span class="jp">申請内容</span></div>
    ${rows}
    ${app.submittedAt ? `<p class="fs-xxs muted mono mt-2">Подана: ${dt(app.submittedAt)}</p>` : ''}
  </div>`;
}

/** Открыть карточку участника в модальном окне */
export function openParticipant(id) {
  const p = store.participant(id);
  if (!p) return;

  modal.open({
    title: `Карточка участника`,
    jp: '泳者情報',
    wide: true,
    body: participantCard(p),
    foot: `<button class="btn btn--sm btn--ghost" type="button" data-close>Закрыть</button>`,
  });
}

/**
 * Сортировка списка участников.
 * dir: 1 — по возрастанию (▲), -1 — по убыванию (▼).
 * Направление одинаково трактуется для чисел и строк, чтобы стрелка
 * в шапке колонки соответствовала фактическому порядку.
 */
export function sortParticipants(list, { key, dir }) {
  const out = [...list];
  out.sort((a, b) => {
    let x = a[key];
    let y = b[key];

    if (key === 'colony') { x = colonyById(a.colony).ru; y = colonyById(b.colony).ru; }

    if (typeof x === 'string') return x.localeCompare(String(y), 'ru') * dir;
    return ((x || 0) - (y || 0)) * dir;
  });
  return out;
}

/** Направление по умолчанию: имена и колонии — от А, числа — от большего */
export const defaultDir = (key) => (['name', 'colony'].includes(key) ? 1 : -1);

export { sprite };
