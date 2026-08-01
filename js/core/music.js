/**
 * Музыка ивентов.
 *
 * Звуковых файлов в проекте нет и не будет: готовые треки защищены
 * авторским правом, выкладывать их на сайт нельзя. Поэтому каждая тема
 * собрана здесь из осцилляторов — своя музыка в настроении сцены.
 *
 * Ноты раскладываются заранее, на полсекунды вперёд: если полагаться
 * на таймер браузера, ритм спотыкается на каждой перерисовке.
 */

import { audioNode, audio } from './audio.js?v=10';

const N = {
  D1: 36.71, G1: 49.00, A1: 55.00,
  D2: 73.42, G2: 98.00,
  C3: 130.81, D3: 146.83, E3: 155.56, F3: 174.61,
  C4: 261.63, D4: 293.66, E4: 311.13, F4: 349.23, G4: 392.00, A4: 440.00, B4: 466.16,
  D5: 587.33, F5: 698.46, A5: 880.00,
};

let live = null;   // { id, bus, step, next, timer }

/* ---------------- Голоса ---------------- */

/** Протяжная нота с собственной огибающей */
function voice(at, { freq, dur, type = 'sawtooth', gain = 0.05, detune = 0, filter = 0 }) {
  const node = audioNode();
  if (!node || !live) return;

  const osc = node.ctx.createOscillator();
  const amp = node.ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, at);
  osc.detune.value = detune;

  amp.gain.setValueAtTime(0, at);
  amp.gain.linearRampToValueAtTime(gain, at + Math.min(0.05, dur / 3));
  amp.gain.setValueAtTime(gain, at + dur * 0.6);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);

  let tail = amp;
  if (filter) {
    const lp = node.ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = filter;
    amp.connect(lp);
    tail = lp;
  }

  osc.connect(amp);
  tail.connect(live.bus);
  osc.start(at);
  osc.stop(at + dur + 0.05);
}

/** Удар барабана: низкий тон плюс короткий шум */
function drum(at, { freq = 70, dur = 0.35, gain = 0.16, bright = 240 }) {
  const node = audioNode();
  if (!node || !live) return;
  const { ctx } = node;

  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(freq * 2.4, at);
  osc.frequency.exponentialRampToValueAtTime(freq, at + dur * 0.5);
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(amp).connect(live.bus);
  osc.start(at);
  osc.stop(at + dur + 0.02);

  const size = Math.floor(ctx.sampleRate * 0.12);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / size) ** 2;

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = bright;
  const namp = ctx.createGain();
  namp.gain.value = gain * 0.5;
  src.connect(bp).connect(namp).connect(live.bus);
  src.start(at);
}

/** Колокол: три обертона с разным затуханием */
function bell(at, { freq = 880, dur = 2.2, gain = 0.05 }) {
  const node = audioNode();
  if (!node || !live) return;

  [1, 2.76, 5.4].forEach((ratio, i) => {
    const osc = node.ctx.createOscillator();
    const amp = node.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq * ratio;
    amp.gain.setValueAtTime(0, at);
    amp.gain.linearRampToValueAtTime(gain / (i + 1.4), at + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, at + dur / (i + 1));
    osc.connect(amp).connect(live.bus);
    osc.start(at);
    osc.stop(at + dur + 0.05);
  });
}

/** Короткий шум — вдох, помеха, шелест */
function hiss(at, { dur = 0.4, gain = 0.05, filter = 900 }) {
  const node = audioNode();
  if (!node || !live) return;
  const { ctx } = node;

  const size = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, size, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < size; i += 1) d[i] = (Math.random() * 2 - 1) * (1 - i / size);

  const src = ctx.createBufferSource();
  src.buffer = buf;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = filter;
  const amp = ctx.createGain();
  amp.gain.value = gain;

  src.connect(bp).connect(amp).connect(live.bus);
  src.start(at);
}

/* ---------------- Темы ----------------
   Шаг — одна восьмая. Функция получает номер шага и точное время. */

const THEMES = {
  /* Сукуна в истинной форме: тяжёлая поступь, тайко, храмовый распев */
  sukuna: {
    step: 0.38,
    play(i, at) {
      const b = i % 16;

      if (b % 4 === 0) drum(at, { freq: 58, dur: 0.5, gain: 0.2, bright: 180 });
      if (b === 6 || b === 14) drum(at, { freq: 96, dur: 0.22, gain: 0.12, bright: 420 });

      // Основа на кварту — открытый, давящий интервал
      if (b === 0) {
        voice(at, { freq: N.D1, dur: 3.2, gain: 0.05, filter: 260 });
        voice(at, { freq: N.A1, dur: 3.2, gain: 0.03, detune: 6, filter: 300 });
      }

      // Распев: минорная пентатоника, редкие ноты — угроза, а не мелодия
      const chant = { 2: N.D3, 5: N.F3, 8: N.E3, 11: N.D3, 13: N.C3 };
      if (chant[b]) {
        voice(at, { freq: chant[b], dur: 0.9, type: 'triangle', gain: 0.045, filter: 900 });
        voice(at, { freq: chant[b] / 2, dur: 0.9, type: 'square', gain: 0.012, filter: 500 });
      }
      if (b === 15) hiss(at, { dur: 0.5, gain: 0.05, filter: 260 });
    },
  },

  /* Сукуна против Годзё: быстрый пульс и переклички двух сторон */
  duel: {
    step: 0.222,   // около 135 ударов в минуту
    play(i, at) {
      const b = i % 16;

      voice(at, { freq: b % 4 === 2 ? N.G1 : N.D1, dur: 0.2, type: 'square', gain: 0.05, filter: 420 });
      if (b % 4 === 0) drum(at, { freq: 62, dur: 0.22, gain: 0.16, bright: 300 });
      if (b % 8 === 4) drum(at, { freq: 180, dur: 0.16, gain: 0.1, bright: 1800 });
      if (b % 2 === 1) hiss(at, { dur: 0.05, gain: 0.02, filter: 7000 });

      // Холодная сторона отвечает обжигающей
      const gojo = { 0: N.A4, 3: N.G4, 6: N.D5 };
      const sukuna = { 8: N.F4, 11: N.E4, 14: N.C4 };
      if (gojo[b]) voice(at, { freq: gojo[b], dur: 0.42, gain: 0.035, filter: 2600 });
      if (sukuna[b]) voice(at, { freq: sukuna[b], dur: 0.42, type: 'square', gain: 0.03, filter: 1400 });

      // Раз в четыре такта — столкновение
      if (i % 64 === 63) {
        drum(at, { freq: 44, dur: 0.9, gain: 0.24, bright: 900 });
        hiss(at, { dur: 0.6, gain: 0.09, filter: 3000 });
      }
    },
  },

  /* Парад тысячи духов: шествие, колокольчики, флейта в ладу «инсэн» */
  parade: {
    step: 0.3,
    play(i, at) {
      const b = i % 16;

      if (b % 4 === 0) drum(at, { freq: 74, dur: 0.4, gain: 0.14, bright: 260 });
      if (b % 4 === 2) drum(at, { freq: 110, dur: 0.18, gain: 0.07, bright: 700 });

      if (b === 0) bell(at, { freq: N.A5, dur: 2.6, gain: 0.05 });
      if (b === 10) bell(at, { freq: N.F5, dur: 2.0, gain: 0.035 });

      const flute = { 1: N.D4, 3: N.E4, 6: N.G4, 9: N.A4, 12: N.B4, 14: N.A4 };
      if (flute[b]) {
        voice(at, { freq: flute[b], dur: 0.62, type: 'sine', gain: 0.05, filter: 3000 });
        voice(at, { freq: flute[b] * 2, dur: 0.5, type: 'sine', gain: 0.012, filter: 4000 });
      }
      if (b === 8) voice(at, { freq: N.D2, dur: 2.4, type: 'triangle', gain: 0.03, filter: 300 });
      if (b === 4) voice(at, { freq: N.G2, dur: 1.2, type: 'triangle', gain: 0.02, filter: 400 });
    },
  },
};


/* ---------------- Внешний источник ----------------

   Сама запись в проект не кладётся: чужие треки распространять нельзя,
   а из YouTube — ещё и запрещено правилами. Играет их встроенный
   проигрыватель YouTube по ссылке, то есть с их же серверов и с их же
   счётчиком просмотров. Свой звуковой файл (kind: file) проигрывается
   обычным <audio>.

   Браузер не даст запустить звук до первого действия пользователя —
   если запуск отклонён, наружу уходит признак blocked, и интерфейс
   показывает кнопку «включить музыку».                                */

let external = null;    // { kind, url, el, player, ready }
let ytApi = null;       // промис загрузки YouTube IFrame API

/** Достаёт идентификатор ролика из любой формы ссылки */
export function youtubeId(url) {
  const m = String(url).match(
    /(?:youtu\.be\/|v=|\/embed\/|\/shorts\/|\/live\/)([A-Za-z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

function loadYouTubeApi() {
  if (ytApi) return ytApi;

  ytApi = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };

    const tag = document.createElement('script');
    tag.src = 'https://www.youtube.com/iframe_api';
    tag.async = true;
    tag.onerror = () => reject(new Error('YouTube недоступен'));
    document.head.appendChild(tag);

    // Не ждём вечно: без сети или при блокировке возвращаемся к своей теме
    setTimeout(() => reject(new Error('YouTube не ответил')), 8000);
  });

  return ytApi;
}

function clearExternal() {
  if (!external) return;
  try {
    if (external.player) external.player.destroy();
    if (external.el) external.el.remove();
  } catch { /* уже убран */ }
  external = null;
}

/** Громкость внешнего источника подчиняется общему ползунку */
function applyExternalVolume() {
  if (!external) return;
  const v = audio.volume;
  try {
    if (external.player && external.player.setVolume) external.player.setVolume(Math.round(v * 100));
    if (external.el && external.el.tagName === 'AUDIO') external.el.volume = v;
  } catch { /* проигрыватель ещё не готов */ }
}

async function startYouTube(url) {
  const id = youtubeId(url);
  if (!id) throw new Error('В ссылке нет идентификатора ролика');

  const YT = await loadYouTubeApi();

  // Проигрыватель нужен только ради звука — прячем его с глаз
  const holder = document.createElement('div');
  holder.id = 'evMusicYT';
  holder.setAttribute('aria-hidden', 'true');
  holder.style.cssText = 'position:fixed;left:-9999px;top:0;width:320px;height:180px;opacity:0;pointer-events:none';
  document.body.appendChild(holder);

  return new Promise((resolve, reject) => {
    const player = new YT.Player(holder, {
      videoId: id,
      playerVars: { autoplay: 1, controls: 0, playsinline: 1, rel: 0, loop: 1, playlist: id },
      events: {
        onReady: (e) => {
          external = { kind: 'youtube', url, el: holder, player: e.target, ready: true };
          applyExternalVolume();
          try { e.target.playVideo(); } catch { /* попробуем после жеста */ }
          resolve(true);
        },
        onError: () => {
          clearExternal();
          reject(new Error('Ролик не воспроизводится'));
        },
      },
    });
    external = { kind: 'youtube', url, el: holder, player, ready: false };
  });
}

async function startFile(url) {
  const el = document.createElement('audio');
  el.src = url;
  el.loop = true;
  el.preload = 'auto';
  el.volume = audio.volume;
  document.body.appendChild(el);
  external = { kind: 'file', url, el, player: null, ready: true };
  await el.play();
  return true;
}

/* ---------------- Управление ---------------- */

export const music = {
  /** Что играет сейчас: идентификатор темы или 'external' */
  get current() {
    if (external) return 'external';
    return live ? live.id : null;
  },

  /** Источник внешней записи, если играет она */
  get source() { return external ? { kind: external.kind, url: external.url } : null; },

  /** Список тем — им же пользуется панель распорядителя */
  get themes() { return Object.keys(THEMES); },

  /**
   * Играет запись по ссылке: YouTube или свой звуковой файл.
   * Если не получилось — возвращает false, и вызвавший ставит свою тему.
   */
  async play({ kind, url }) {
    if (external && external.url === url && external.kind === kind) return true;
    this.stop();

    try {
      if (kind === 'youtube') return await startYouTube(url);
      if (kind === 'file') return await startFile(url);
    } catch (e) {
      clearExternal();
      console.warn('[music] внешний источник не запустился:', e.message);
      return false;
    }
    return false;
  },

  /** Повторная попытка после действия пользователя */
  resume() {
    if (!external) return false;
    try {
      if (external.player) external.player.playVideo();
      else if (external.el) external.el.play().catch(() => {});
      applyExternalVolume();
      return true;
    } catch { return false; }
  },

  /** Играет ли внешняя запись прямо сейчас */
  get externalPlaying() {
    if (!external) return false;
    if (external.player && external.player.getPlayerState) {
      return external.player.getPlayerState() === 1;   // 1 — воспроизведение
    }
    if (external.el && external.el.tagName === 'AUDIO') return !external.el.paused;
    return false;
  },

  /** Согласовать громкость внешнего источника с ползунком */
  syncVolume() { applyExternalVolume(); },

  /**
   * Включает тему ивента. Повторный вызов с тем же id ничего не делает,
   * поэтому опрос сервера можно звать хоть каждую секунду.
   */
  start(id) {
    const theme = THEMES[id];
    if (!theme) return false;
    if (live && live.id === id) return true;
    this.stop();

    const node = audioNode();
    if (!node) return false;

    const bus = node.ctx.createGain();
    bus.gain.value = 0.0001;
    bus.connect(node.master);
    // Плавный вход: музыка проступает, а не обрушивается
    bus.gain.exponentialRampToValueAtTime(0.9, node.ctx.currentTime + 1.8);

    live = { id, bus, step: 0, next: node.ctx.currentTime + 0.15, timer: null };

    live.timer = setInterval(() => {
      if (!live) return;
      const n = audioNode();
      if (!n) return;
      while (live.next < n.ctx.currentTime + 0.5) {
        theme.play(live.step, live.next);
        live.step += 1;
        live.next += theme.step;
      }
    }, 120);

    return true;
  },

  /** Останавливает музыку с коротким затуханием — без щелчка */
  stop() {
    clearExternal();
    if (!live) return;
    clearInterval(live.timer);

    const node = audioNode();
    const bus = live.bus;
    live = null;

    if (!node) return;
    try {
      bus.gain.cancelScheduledValues(node.ctx.currentTime);
      bus.gain.setValueAtTime(Math.max(bus.gain.value, 0.0001), node.ctx.currentTime);
      bus.gain.exponentialRampToValueAtTime(0.0001, node.ctx.currentTime + 0.6);
      setTimeout(() => { try { bus.disconnect(); } catch { /* уже отключён */ } }, 900);
    } catch { /* контекст закрыт — отключать нечего */ }
  },
};

// Выключенный звук глушит музыку, а не проигрывает её в тишине.
// Возвращённый — заводит тему идущего события заново: за то, какое
// событие сейчас идёт, отвечает events.js, поэтому он и переподписывается.
audio.onMute(() => music.stop());
audio.onVolume(() => applyExternalVolume());
