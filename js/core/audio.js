/**
 * Audio — синтезированные звуки терминала через WebAudio.
 * Никаких внешних файлов.
 *
 * Звук включён по умолчанию. Браузеры не дают запустить его до первого
 * действия пользователя, поэтому контекст «разблокируется» при первом
 * клике или нажатии клавиши — а дальше работает сам.
 * Громкость регулируется ползунком и сохраняется между заходами.
 */

import { storage } from '../utils/storage.js?v=10';

const DEFAULT_VOLUME = 0.55;

let ctx = null;
let master = null;      // общая громкость
let humNodes = null;    // фоновый гул монитора
let unlocked = false;

let volume = (() => {
  const v = storage.get('volume', null);
  return v === null ? DEFAULT_VOLUME : Math.min(1, Math.max(0, Number(v)));
})();

/** Звук — украшение: любой сбой аудио гасится и наружу не выходит */
const safe = (fn) => function safely(...args) {
  try { return fn.apply(this, args); } catch (e) { console.warn('[audio]', e); return undefined; }
};

function ensure() {
  if (volume <= 0) return null;
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = volume;
      master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    if (ctx.state === 'closed') return null;
    return ctx;
  } catch {
    volume = 0;
    return null;
  }
}

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

  osc.connect(amp).connect(master);
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

  src.connect(bp).connect(amp).connect(master);
  src.start();
}

/* ---------------- Фоновый гул кинескопа ---------------- */

function startHum() {
  const ac = ensure();
  if (!ac || humNodes) return;

  // Две близкие частоты дают лёгкое биение — как у живого монитора
  const g = ac.createGain();
  g.gain.value = 0.02;

  const o1 = ac.createOscillator();
  o1.type = 'sine';
  o1.frequency.value = 50;

  const o2 = ac.createOscillator();
  o2.type = 'sine';
  o2.frequency.value = 50.7;

  // Тихое шипение строчной развёртки
  const hiss = ac.createGain();
  hiss.gain.value = 0.004;

  const size = Math.floor(ac.sampleRate * 2);
  const buf = ac.createBuffer(1, size, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i += 1) d[i] = (Math.random() * 2 - 1) * 0.4;

  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;

  const hp = ac.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 6000;

  o1.connect(g); o2.connect(g); g.connect(master);
  src.connect(hp).connect(hiss).connect(master);

  o1.start(); o2.start(); src.start();
  humNodes = { o1, o2, src };
}

function stopHum() {
  if (!humNodes) return;
  try {
    humNodes.o1.stop();
    humNodes.o2.stop();
    humNodes.src.stop();
  } catch { /* уже остановлены */ }
  humNodes = null;
}

/* ---------------- Доступ для музыки ивентов ---------------- */

/**
 * Контекст и общий регулятор громкости для модуля music.js.
 * Возвращает null, если звук выключен или контекст ещё не создан —
 * тогда музыка просто не заводится.
 */
export function audioNode() {
  const ac = ensure();
  if (!ac || !master) return null;
  return { ctx: ac, master };
}

// Кому сообщить, что звук выключили: музыка ивента должна замолчать,
// а не играть в тишине, занимая процессор. И наоборот — когда звук
// вернули, музыка идущего события должна зазвучать снова.
const muteHooks = new Set();
const unmuteHooks = new Set();

/* ---------------- Публичный интерфейс ---------------- */

export const audio = {
  /** Подписка на выключение звука */
  onMute(fn) { muteHooks.add(fn); return () => muteHooks.delete(fn); },

  /** Подписка на возврат звука */
  onUnmute(fn) { unmuteHooks.add(fn); return () => unmuteHooks.delete(fn); },

  /** Включён ли звук (громкость больше нуля) */
  get enabled() { return volume > 0; },

  /** Громкость 0…1 */
  get volume() { return volume; },

  /** Разблокирован ли контекст первым действием пользователя */
  get ready() { return unlocked; },

  setVolume(v) {
    const was = volume;
    volume = Math.min(1, Math.max(0, Number(v) || 0));
    storage.set('volume', volume);

    if (volume === 0) {
      stopHum();
      muteHooks.forEach((fn) => { try { fn(); } catch { /* подписчик упал — не наша забота */ } });
      if (master) master.gain.value = 0;
      return volume;
    }

    const ac = ensure();
    if (ac && master) master.gain.value = volume;
    if (unlocked) startHum();
    if (was === 0) {
      unmuteHooks.forEach((fn) => { try { fn(); } catch { /* подписчик упал — не наша забота */ } });
    }
    return volume;
  },

  /** Мгновенное отключение и возврат к прежней громкости */
  toggle() {
    if (volume > 0) {
      storage.set('volumePrev', volume);
      this.setVolume(0);
    } else {
      this.setVolume(storage.get('volumePrev', DEFAULT_VOLUME));
    }
    return this.enabled;
  },

  /**
   * Разблокировка звука. Вызывается при первом действии пользователя:
   * до него браузер не разрешает воспроизведение.
   */
  unlock: safe(function unlock() {
    if (unlocked) return;
    const ac = ensure();
    if (!ac) return;
    unlocked = true;
    startHum();
    this.power();
  }),

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
