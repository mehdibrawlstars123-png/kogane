/**
 * Шина событий системы.
 */

const map = new Map();

export const bus = {
  on(event, handler) {
    if (!map.has(event)) map.set(event, new Set());
    map.get(event).add(handler);
    return () => bus.off(event, handler);
  },

  once(event, handler) {
    const wrap = (p) => { bus.off(event, wrap); handler(p); };
    return bus.on(event, wrap);
  },

  off(event, handler) {
    map.get(event)?.delete(handler);
  },

  emit(event, payload) {
    map.get(event)?.forEach((h) => {
      try { h(payload); } catch (e) { console.error(`[bus:${event}]`, e); }
    });
  },
};

export const EV = {
  ready:        'sys:ready',
  dbChange:     'db:change',
  dbSync:       'db:sync',
  authChange:   'auth:change',
  route:        'route:change',
  notify:       'sys:notify',
  migrationEnd: 'migration:end',
  migrationStart: 'migration:start',
  death:        'player:death',
};
