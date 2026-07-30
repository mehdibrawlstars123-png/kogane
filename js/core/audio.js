/**
 * Audio — синтезированные звуки терминала через WebAudio.
 * Никаких внешних файлов. По умолчанию выключено до жеста пользователя.
 */

import { storage } from '../utils/storage.js?v=6';

let ctx = null;
let enabled = storage.get('sound', false);

/** Звук — украшение интерфейса. Любой сбой аудио не должен всплывать
 *  наружу и рвать поток: политика автозапуска, отсутствие устройства
 *  вывода, закрытый контекст — всё гасится здесь. */
function ensure() {
  if (!enabled) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx.state === 'closed') return null;
    return ctx;
  } catch {
    enabled = false;
    return null;
  }
}

/** Обёртка: метод звука никогда не бросает исключение в вызывающий код */
const safe = (fn) => (...args) => {
  try { return fn(...args); } catch (e) { console.warn('[audio]', e); return undefined; }
};

function tone({ freq = 440, dur = 0.06, type = 'square', gain = 0.03, sweep = 0 }) {
  const ac = ensure();
  if (!ac) return;

  const osc = ac.createOscillator();
  const amp = ac.createGain();

  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime);
  if (sweep) osc.frequency.linearRampToValueAtTime(freq + sweep, ac.currentTime + dur);

  amp.gain.setValueAtTime(0, ac.currentTime);
  amp.gain.linearRampToValueAtTime(gain, ac.currentTime + 0.006);
  amp.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);

  osc.connect(amp).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + dur + 0.02);
}

function noise({ dur = 0.25, gain = 0.05, filter = 900 }) {
  const ac = ensure();
  if (!ac) return;

  const size = Math.floor(ac.sampleRate * dur);
  const buffer = ac.createBuffer(1, size, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < size; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / size);

  const src = ac.createBufferSource();
  src.buffer = buffer;

  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filter;

  const amp = ac.createGain();
  amp.gain.value = gain;

  src.connect(bp).connect(amp).connect(ac.destination);
  src.start();
}

export const audio = {
  get enabled() { return enabled; },

  toggle() {
    enabled = !enabled;
    storage.set('sound', enabled);
    if (enabled) this.power();
    return enabled;
  },

  /* Клавиша терминала */
  blip: safe(() => tone({ freq: 1400 + Math.random() * 500, dur: 0.018, gain: 0.012 })),

  /* Клик по интерфейсу */
  click: safe(() => tone({ freq: 720, dur: 0.05, gain: 0.03, sweep: -220 })),

  /* Наведение */
  hover: safe(() => tone({ freq: 1180, dur: 0.02, gain: 0.008 })),

  /* Подтверждение */
  ok: safe(() => {
    tone({ freq: 660, dur: 0.07, gain: 0.03 });
    setTimeout(() => tone({ freq: 990, dur: 0.09, gain: 0.03 }), 70);
  }),

  /* Отказ / ошибка */
  err: safe(() => tone({ freq: 180, dur: 0.16, type: 'sawtooth', gain: 0.04, sweep: -80 })),

  /* Уведомление Коганэ */
  notice: safe(() => {
    tone({ freq: 1320, dur: 0.05, gain: 0.025 });
    setTimeout(() => tone({ freq: 1760, dur: 0.06, gain: 0.02 }), 60);
    setTimeout(() => tone({ freq: 2200, dur: 0.05, gain: 0.015 }), 130);
  }),

  /* Включение монитора */
  power: safe(() => {
    noise({ dur: 0.22, gain: 0.05, filter: 1800 });
    tone({ freq: 60, dur: 0.4, type: 'sine', gain: 0.05, sweep: 40 });
  }),

  /* Сканирование */
  scan: safe(() => tone({ freq: 420, dur: 0.5, type: 'triangle', gain: 0.02, sweep: 900 })),

  /* Смерть */
  death: safe(() => {
    noise({ dur: 1.2, gain: 0.12, filter: 320 });
    tone({ freq: 220, dur: 1.4, type: 'sawtooth', gain: 0.06, sweep: -190 });
    setTimeout(() => tone({ freq: 90, dur: 1.8, type: 'square', gain: 0.05, sweep: -60 }), 400);
  }),
};
