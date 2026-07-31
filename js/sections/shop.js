/**
 * Раздел «Магазин правил».
 * Только заранее созданные правила. Своё правило игрок написать не может.
 */

import { $, $$, on } from '../core/dom.js?v=10';
import { store } from '../core/store.js?v=10';
import { esc, pts } from '../core/format.js?v=10';
import { JP } from '../data/labels.js?v=10';
import { modal, toast } from '../core/ui.js?v=10';
import { audio } from '../core/audio.js?v=10';
import { crt } from '../core/crt.js?v=10';
import { sprite } from '../core/sprites.js?v=10';

let cat = 'all';

export const shop = {
  id: 'shop',

  render(root, { user, me, refresh }) {
    const rules = store.shopRules().filter((r) => r.enabled !== false);
    const cats = ['all', ...new Set(rules.map((r) => r.cat))];
    const owned = user.ownedRules || [];

    const list = cat === 'all' ? rules : rules.filter((r) => r.cat === cat);

    root.innerHTML = `
      <div class="sec-head">
        <span class="sec-head__no jp">04</span>
        <span class="sec-head__title">Магазин правил</span>
        <span class="sec-head__jp jp">${JP.ruleShop}</span>
      </div>

      <div class="hero-line mb-4">
        <div class="hero-line__text">
          <div class="hero-line__title">Добавление правила стоит 100 очков</div>
          <p class="hero-line__sub">
            Согласно четвёртому базовому правилу участник вправе внести в игру новое правило,
            потратив 100 очков. Составлять формулировку самостоятельно нельзя —
            система принимает только утверждённые распорядителем записи.
          </p>
        </div>
        <div class="tile" style="min-width:180px">
          <span class="tile__key">Доступно очков <span class="jp">${JP.points}</span></span>
          <span class="tile__val jp">${pts(me.points)}</span>
        </div>
      </div>

      <div class="roster__bar mb-4" style="border:2px solid var(--ink-line)">
        ${cats.map((c) => `
          <button class="chip ${c === cat ? 'is-active' : ''}" type="button" data-cat="${esc(c)}">
            ${c === 'all' ? 'Все разделы' : esc(c)}
          </button>`).join('')}
        <span class="push fs-xxs muted">Установлено: ${pts(owned.length, 2)} / ${pts(rules.length, 2)}</span>
      </div>

      <div class="cols cols--auto" id="shopGrid">
        ${list.map((r) => {
          const has = owned.includes(r.id);
          const poor = (me.points || 0) < r.cost;
          return `
          <article class="rule ${has ? 'is-owned' : ''} ${!has && poor ? 'is-locked' : ''}">
            <div class="rule__head">
              <span class="rule__code">${esc(r.code)}</span>
              <span>
                <span class="rule__title">${esc(r.title)}</span>
                <div class="rule__jp jp">${esc(r.jp)}</div>
              </span>
            </div>
            <p class="rule__text">${esc(r.text)}</p>
            <div class="rule__foot">
              <span class="rule__cost jp">${sprite('point', { scale: 2 })} ${r.cost}<small>${JP.points}</small></span>
              <span class="rule__cat">${esc(r.cat)}</span>
              <span class="rule__buy">
                ${has
                  ? '<span class="status status--active">В своде</span>'
                  : `<button class="btn btn--sm ${poor ? '' : 'btn--primary'}" type="button"
                       data-buy="${r.id}" ${poor ? 'disabled' : ''}>
                       ${poor ? 'Мало очков' : 'Приобрести'}
                     </button>`}
              </span>
            </div>
          </article>`;
        }).join('') || '<div class="empty">В этом разделе правил нет</div>'}
      </div>`;

    /* Фильтр разделов */
    $$('[data-cat]', root).forEach((chip) => on(chip, 'click', () => {
      cat = chip.dataset.cat;
      this.render(root, { user, me, refresh });
    }));

    /* Покупка */
    $$('[data-buy]', root).forEach((btn) => on(btn, 'click', async () => {
      const rule = store.shopRules().find((r) => r.id === btn.dataset.buy);
      if (!rule) return;

      const fresh = store.userById(user.id);
      if (!fresh) return; // сессия оборвалась — страница уже уходит на вход
      const points = fresh.character?.points || 0;

      if (points < rule.cost) {
        audio.err();
        toast.err('Отказ системы', `Недостаточно очков: требуется ${rule.cost}.`);
        return;
      }

      const ok = await modal.confirm({
        title: 'Подтверждение покупки',
        jp: '購入確認',
        text: `Внести правило «${rule.title}» (${rule.jp}) в свод правил игры?\n\n`
            + `${rule.text}\n\nБудет списано ${rule.cost} очков. Остаток: ${points - rule.cost}.`,
        okText: 'Внести правило',
      });
      if (!ok) return;

      btn.classList.add('is-busy');
      crt.tear($('.screen'));

      try {
        // Уведомление о покупке присылает сервер — своё не показываем,
        // иначе участник видит один и тот же тост дважды.
        await store.buyRule(rule.id);
      } catch (err) {
        btn.classList.remove('is-busy');
        audio.err();
        toast.err('Покупка не прошла', err.message);
        return;
      }

      refresh?.();
    }));

    return root;
  },
};
