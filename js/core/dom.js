/**
 * DOM-хелперы.
 */

export const $  = (selector, scope = document) => scope.querySelector(selector);
export const $$ = (selector, scope = document) => Array.from(scope.querySelectorAll(selector));

export const on = (target, event, handler, options) => {
  if (!target?.addEventListener) return () => {};
  target.addEventListener(event, handler, options);
  return () => target.removeEventListener(event, handler, options);
};

/** Делегирование событий */
export const delegate = (root, event, selector, handler) =>
  on(root, event, (e) => {
    const match = e.target.closest(selector);
    if (match && root.contains(match)) handler(e, match);
  });

export const addClass    = (el, ...cls) => el?.classList.add(...cls);
export const removeClass = (el, ...cls) => el?.classList.remove(...cls);
export const toggleClass = (el, cls, force) => el?.classList.toggle(cls, force);
export const hasClass    = (el, cls) => Boolean(el?.classList.contains(cls));

export const setVar = (el, name, value) => el?.style.setProperty(name, value);

export const create = (tag, props = {}, ...children) => {
  const el = document.createElement(tag);
  Object.entries(props).forEach(([key, value]) => {
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      el.addEventListener(key.slice(2).toLowerCase(), value);
    } else el.setAttribute(key, value);
  });
  children.flat().forEach((child) => {
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return el;
};

/** Блокировка скролла body с компенсацией скроллбара */
let scrollbarWidth = 0;
export const lockScroll = () => {
  scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
  document.body.style.paddingRight = `${scrollbarWidth}px`;
  document.body.classList.add('is-locked');
};

export const unlockScroll = () => {
  document.body.style.paddingRight = '';
  document.body.classList.remove('is-locked');
};
