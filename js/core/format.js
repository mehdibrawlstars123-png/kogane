/**
 * Format — даты, числа, служебные строки системы.
 */

const pad = (n) => String(n).padStart(2, '0');

/** 19.04 14:07 */
export const dt = (ts) => {
  const d = new Date(ts);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** 2026.04.19 / 14:07:22 — формат журнала */
export const dtFull = (ts) => {
  const d = new Date(ts);
  return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

/** «3 дня назад» */
export const ago = (ts) => {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return 'только что';
  if (s < 3600) return `${Math.floor(s / 60)} мин назад`;
  if (s < 86400) return `${Math.floor(s / 3600)} ч назад`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d} дн назад`;
  return dt(ts);
};

/** 19 дней до истечения срока объявления */
export const daysLeft = (fromTs, span = 19) => {
  const end = fromTs + span * 86400e3;
  return Math.max(0, Math.ceil((end - Date.now()) / 86400e3));
};

/** Числа с ведущими нулями, как на кадрах: 000 / 100 */
export const pts = (n, width = 3) => String(Math.max(0, Number(n) || 0)).padStart(width, '0');

export const num = (n) => new Intl.NumberFormat('ru-RU').format(Number(n) || 0);

/** Экранирование пользовательского текста перед вставкой в innerHTML */
export const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** Подсветка совпадения при поиске */
export const highlight = (text, query) => {
  const safe = esc(text);
  if (!query) return safe;
  const q = query.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return safe.replace(new RegExp(`(${q})`, 'gi'), '<mark>$1</mark>');
};

/** Транслитерация для поиска по латинице */
const MAP = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i',
  й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't',
  у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y',
  ь: '', э: 'e', ю: 'yu', я: 'ya',
};

export const translit = (s) => String(s).toLowerCase().split('').map((c) => MAP[c] ?? c).join('');

/**
 * Приведение к «свободной» форме: система должна находить Касимо
 * и по написанию Kashimo, и по Kasimo — сравниваем упрощённые формы.
 */
export const loose = (s) => translit(s)
  .replace(/[^a-z0-9]+/g, '')
  .replace(/sh|zh|ch|th|kh/g, (m) => m[0])
  .replace(/j/g, 'y')
  .replace(/(.)\1+/g, '$1');

/** Совпадение имени по любому регистру и раскладке */
export const matches = (name, query) => {
  const n = String(name).toLowerCase();
  const q = String(query).trim().toLowerCase();
  if (!q) return true;
  if (n.includes(q)) return true;

  const lq = loose(q);
  return lq.length > 1 && loose(n).includes(lq);
};

export const plural = (n, forms) => {
  const abs = Math.abs(n) % 100;
  const d = abs % 10;
  if (abs > 10 && abs < 20) return forms[2];
  if (d > 1 && d < 5) return forms[1];
  if (d === 1) return forms[0];
  return forms[2];
};
