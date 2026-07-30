/**
 * Общие утилиты.
 */

export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const lerp = (start, end, t) => start + (end - start) * t;

export const map = (value, inMin, inMax, outMin, outMax) =>
  ((value - inMin) * (outMax - outMin)) / (inMax - inMin) + outMin;

export const random = (min, max) => Math.random() * (max - min) + min;

export const debounce = (fn, wait = 150) => {
  let timer;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
};

export const throttle = (fn, limit = 100) => {
  let waiting = false;
  let lastArgs = null;
  return (...args) => {
    if (waiting) {
      lastArgs = args;
      return;
    }
    fn(...args);
    waiting = true;
    setTimeout(() => {
      waiting = false;
      if (lastArgs) {
        fn(...lastArgs);
        lastArgs = null;
      }
    }, limit);
  };
};

/** Вызов на каждом кадре, но не чаще одного раза за кадр */
export const rafThrottle = (fn) => {
  let scheduled = false;
  return (...args) => {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...args);
    });
  };
};

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Easing-функции для кастомных анимаций */
export const easing = {
  linear:      (t) => t,
  easeOutQuad: (t) => 1 - (1 - t) ** 2,
  easeOutCubic:(t) => 1 - (1 - t) ** 3,
  easeOutExpo: (t) => (t === 1 ? 1 : 1 - 2 ** (-10 * t)),
  easeInOutCubic: (t) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2),
};

export const formatNumber = (value, locale = 'ru-RU') =>
  new Intl.NumberFormat(locale).format(value);

export const uid = (prefix = 'id') => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
