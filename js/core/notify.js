/**
 * Notify — единая точка создания событий системы.
 * Каждое событие пишется в историю уведомлений, в журнал и показывается тостом.
 */

import { store } from './store.js?v=7';
import { toast } from './ui.js?v=7';
import { NOTICE_TYPES, colonyById, levelById } from '../data/labels.js?v=7';

/** Текстовые шаблоны событий Коганэ */
const TPL = {
  connect: () => ({
    title: 'Подключение установлено',
    text: 'Связь с глобальным барьером активна. Данные участника синхронизированы.',
  }),
  approved: (p) => ({
    title: 'Анкета одобрена',
    text: `Участник «${p.name}» внесён в реестр. Колония: ${colonyById(p.colony).ru}. Объявите о начале игры в течение 19 дней.`,
  }),
  rejected: (p) => ({
    title: 'Анкета отклонена',
    text: p.reason ? `Причина: ${p.reason}` : 'Заявка не прошла проверку распорядителя.',
  }),
  purchase: (p) => ({
    title: 'Правило установлено',
    text: `«${p.title}» внесено в свод правил. Списано ${p.cost} очков. Остаток: ${p.left}.`,
  }),
  points: (p) => ({
    title: 'Начисление очков',
    text: `Зачислено ${p.amount} очков. Текущий счёт: ${p.total}.${p.reason ? ` Основание: ${p.reason}.` : ''}`,
  }),
  penalty: (p) => ({
    title: 'Списание очков',
    text: `Снято ${p.amount} очков. Текущий счёт: ${p.total}.${p.reason ? ` Основание: ${p.reason}.` : ''}`,
  }),
  colony: (p) => ({
    title: 'Смена колонии',
    text: `Перемещение в барьер «${colonyById(p.colony).ru}» подтверждено. Срок объявления обнулён.`,
  }),
  level: (p) => ({
    title: 'Изменение уровня',
    text: `Уровень пересмотрен: ${levelById(p.level).ru} (${levelById(p.level).jp}).`,
  }),
  rule: (p) => ({
    title: 'Новое правило в игре',
    text: `${p.by ? `${p.by} добавил правило: ` : 'Добавлено правило: '}«${p.title}».`,
  }),
  ruleTaken: (p) => ({
    title: 'Правило отозвано',
    text: `«${p.title}» исключено из вашего свода правил распорядителем.`,
  }),
  migStart: (p) => ({
    title: `Миграция №${p.number} начата`,
    text: 'Барьеры развёрнуты. Все участники обязаны объявить о начале игры в течение 19 дней.',
  }),
  migEnd: (p) => ({
    title: `Миграция №${p.number} завершена`,
    text: 'Барьеры свёрнуты. Все участники, находившиеся внутри, признаны выбывшими.',
  }),
  broadcast: (p) => ({ title: p.title || 'Сообщение системы', text: p.text || '' }),
  death: () => ({
    title: 'Выбытие из игры',
    text: 'Статус участника изменён на «Погиб». Доступ к системе приостановлен до следующей миграции.',
  }),
};

/** Уведомления, для которых тост уже показан в этой вкладке.
 *  Нужно, чтобы наблюдатель в system.js не показывал их повторно. */
export const shownToasts = new Set();

export const notify = {
  /**
   * Создаёт уведомление.
   * @param {string} type  ключ из NOTICE_TYPES
   * @param {object} payload данные для шаблона
   * @param {object} opts  { target: 'all'|userId, silent: не показывать тост }
   *
   * payload.title участвует в шаблоне (например, название правила).
   * Чтобы заменить сам заголовок уведомления, передайте overrideTitle.
   */
  emit(type, payload = {}, { target = 'all', silent = false } = {}) {
    const meta = NOTICE_TYPES[type] || NOTICE_TYPES.broadcast;
    const tpl = (TPL[type] || TPL.broadcast)(payload);

    const item = store.addNotification({
      type,
      title: payload.overrideTitle || tpl.title,
      text: payload.text || tpl.text,
      target,
    });

    store.log(payload.actor || 'КОГАНЭ', type, `${item.title}${item.text ? ` — ${item.text}` : ''}`);

    if (!silent) {
      toast.show({
        type,
        title: item.title,
        text: item.text,
        alert: ['rejected', 'penalty', 'migEnd', 'death', 'ruleTaken'].includes(type),
      });
    }

    // Тихие уведомления тоже помечаем: адресат увидит их в истории,
    // а наблюдатель не должен всплывать ими повторно у автора события.
    shownToasts.add(item.id);

    return item;
  },

  meta(type) { return NOTICE_TYPES[type] || NOTICE_TYPES.broadcast; },
};
