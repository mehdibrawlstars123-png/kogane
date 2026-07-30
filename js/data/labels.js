/**
 * Японские подписи интерфейса — взяты с кадров аниме.
 */

export const JP = {
  system:      '死滅回游',        // Смертельная миграция
  kogane:      '虎杖',            // (носитель) — в шапке не используется
  manager:     '管理システム',     // система управления
  players:     '泳者一覧',        // список игроков
  player:      '泳者',            // игрок / «плывущий»
  points:      '得点',            // очки
  ruleChange:  '変更',            // изменение (правил)
  times:       '回',              // раз
  colony:      '滞在結界',        // текущий барьер пребывания
  barrier:     '結界',
  searching:   '検索中',          // идёт поиск
  search:      '検索',
  rules:       '規則',
  ruleShop:    '規則購入',
  add:         '追加',
  history:     '履歴',
  notice:      '通知',
  admin:       '管理者権限',
  profile:     '個人情報',
  home:        '基本情報',
  level:       '等級',
  status:      '状態',
  connecting:  '接続中',
  auth:        '認証',
  complete:    '完了',
  welcome:     '歓迎',
  start:       '開始',
  end:         '終了',
  death:       '死亡',
  dead:        '死滅',
  denied:      '権限無し',
  pending:     '審査中',
  approved:    '承認',
  rejected:    '却下',
  application: '登録申請',
  purchase:    '購入',
  logs:        '記録',
  broadcast:   '一斉通知',
  migration:   '回游',
  tengen:      '天元',
  yes:         '可',
  no:          '不可',
};

/**
 * Уровни магов. Порядок от младшего к старшему — в выпадающих списках
 * выводятся в обратном порядке, особый уровень первым.
 */
export const LEVELS = [
  { id: 'g4',  jp: '四級',   ru: 'Четвёртый уровень' },
  { id: 'g3',  jp: '三級',   ru: 'Третий уровень' },
  { id: 'g2',  jp: '二級',   ru: 'Второй уровень' },
  { id: 'g1s', jp: '準一級', ru: 'Предпервый уровень' },
  { id: 'g1',  jp: '一級',   ru: 'Первый уровень' },
  { id: 'gs',  jp: '特級',   ru: 'Особый уровень' },
];

/** Уровни из прежних версий базы — чтобы старые записи не ломали интерфейс */
const LEGACY_LEVELS = [
  { id: 'g2s', jp: '準二級', ru: 'Полу-второй уровень' },
];

export const levelById = (id) => LEVELS.find((l) => l.id === id)
  || LEGACY_LEVELS.find((l) => l.id === id)
  || LEVELS[0];

/** Список для выбора: особый уровень сверху */
export const levelOptions = () => [...LEVELS].reverse();

/** Статусы участника */
export const STATUSES = {
  active:  { ru: 'В игре',        jp: '参加中', cls: 'status--active' },
  pending: { ru: 'Ожидает',       jp: '審査中', cls: 'status--pending' },
  out:     { ru: 'Вне барьера',   jp: '結界外', cls: 'status--out' },
  dead:    { ru: 'Погиб',         jp: '死亡',   cls: 'status--dead' },
  frozen:  { ru: 'Неактивен',     jp: '停止',   cls: 'status--out' },
};

/** Колонии (барьеры) */
export const COLONIES = [
  { id: 'tokyo1',   ru: 'Первая токийская',  jp: '東京第1', short: '東京第1' },
  { id: 'tokyo2',   ru: 'Вторая токийская',  jp: '東京第2', short: '東京第2' },
  { id: 'sendai',   ru: 'Сендай',            jp: '仙台',    short: '仙台' },
  { id: 'sakura',   ru: 'Сакурадзима',       jp: '桜島',    short: '桜島' },
  { id: 'hokkaido', ru: 'Хоккайдо',          jp: '北海道',  short: '北海道' },
  { id: 'kobe',     ru: 'Кобе',              jp: '神戸',    short: '神戸' },
  { id: 'kyoto',    ru: 'Киото',             jp: '京都',    short: '京都' },
  { id: 'fukuoka',  ru: 'Фукуока',           jp: '福岡',    short: '福岡' },
  { id: 'okinawa',  ru: 'Окинава',           jp: '沖縄',    short: '沖縄' },
  { id: 'tottori',  ru: 'Тоттори',           jp: '鳥取',    short: '鳥取' },
];

export const colonyById = (id) => COLONIES.find((c) => c.id === id) || COLONIES[0];

/** Типы уведомлений: подпись + иконка-спрайт */
export const NOTICE_TYPES = {
  connect:    { ru: 'Подключение',        jp: '接続',   icon: 'barrier' },
  purchase:   { ru: 'Покупка правила',    jp: '購入',   icon: 'scroll' },
  approved:   { ru: 'Анкета одобрена',    jp: '承認',   icon: 'check' },
  rejected:   { ru: 'Анкета отклонена',   jp: '却下',   icon: 'alert' },
  points:     { ru: 'Начисление очков',   jp: '得点',   icon: 'point' },
  penalty:    { ru: 'Списание очков',     jp: '減点',   icon: 'alert' },
  colony:     { ru: 'Смена колонии',      jp: '結界移動', icon: 'barrier' },
  level:      { ru: 'Изменение уровня',   jp: '等級変更', icon: 'check' },
  rule:       { ru: 'Новое правило',      jp: '規則追加', icon: 'scroll' },
  ruleTaken:  { ru: 'Правило отозвано',   jp: '規則削除', icon: 'alert' },
  migStart:   { ru: 'Начало миграции',    jp: '回游開始', icon: 'skull' },
  migEnd:     { ru: 'Конец миграции',     jp: '回游終了', icon: 'faceDead' },
  broadcast:  { ru: 'Сообщение системы',  jp: '一斉通知', icon: 'alert' },
  death:      { ru: 'Выбытие',            jp: '死亡',    icon: 'faceDead' },
};
