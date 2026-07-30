/**
 * Trace — журнал шагов интерфейса.
 *
 * Пишется в localStorage и потому переживает переходы между страницами:
 * можно воспроизвести поломку, а потом посмотреть, на каком шаге всё
 * остановилось. Читается на странице diag.html.
 */

const KEY = 'kogane:trace';
const MAX = 150;

export function trace(event, detail) {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    list.push({
      t: Date.now(),
      page: location.pathname.split('/').pop() || 'index.html',
      event,
      detail: detail === undefined ? '' : String(detail).slice(0, 200),
    });
    while (list.length > MAX) list.shift();
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch { /* хранилище недоступно — журнал не критичен */ }
}

export function traceList() {
  try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch { return []; }
}

export function traceClear() {
  try { localStorage.removeItem(KEY); } catch { /* noop */ }
}

/* Всё, что упало само по себе, тоже попадает в журнал */
window.addEventListener('error', (e) => {
  trace('ОШИБКА JS', `${e.message} @ ${e.filename}:${e.lineno}`);
});

window.addEventListener('unhandledrejection', (e) => {
  trace('ОТКАЗ ПРОМИСА', e.reason?.message || e.reason);
});

trace('страница открыта', document.title);
