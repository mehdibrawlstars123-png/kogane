/**
 * Состав анкеты персонажа — единственное, что осталось на стороне браузера.
 *
 * Правила, магазин и демо-реестр переехали в базу: их начальные значения
 * лежат в server/seed.py, а интерфейс получает их запросом /api/state.
 * Держать два списка сразу нельзя — разойдутся.
 */

/* ============ Анкета персонажа ============
   Третий шаг регистрации. Заявку рассматривает распорядитель игры:
   до одобрения участник в реестр не попадает. */
export const APPLICATION_SCHEMA = [
  {
    step: 'Анкета персонажа',
    jp: '登録申請',
    fields: [
      { key: 'name',      label: 'Имя персонажа',     type: 'text',  required: true,  max: 40,
        hint: 'Как вас будут видеть в реестре участников' },
      { key: 'level',     label: 'Уровень',           type: 'level', required: true },
      { key: 'technique', label: 'Проклятая техника', type: 'text',  required: true,  max: 80,
        hint: 'Название техники' },
      { key: 'techDesc',  label: 'Что делает техника', type: 'area', required: true,  max: 1200,
        hint: 'Как работает, что позволяет, какие ограничения' },
      { key: 'roblox',    label: 'Ник в Roblox',      type: 'text',  required: true,  max: 40 },
      { key: 'discord',   label: 'Ник в Discord',     type: 'text',  required: true,  max: 40,
        hint: 'Например: nickname или nickname#0001' },
      { key: 'nameJp',    label: 'Имя кандзи / каной', type: 'text', required: false, max: 20,
        hint: 'Необязательно. Показывается в таблице под именем' },
    ],
  },
];
