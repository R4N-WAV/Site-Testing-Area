// Sounds for the whole site. Paper, card, a little wood and felt: soft, short, never louder than
// they need to be. The bigger ones (down the tunnel and back up, a page of records opening and
// closing, switching, the language, the thank-you, the passport's rattle) are short recordings of
// R4N's own synth, Isai, in assets/sound/; the small ones are made in code with the Web Audio API.
// Until a recording has loaded (or if it can't), its code-made sound plays instead.
//
//   play("hover") / play("knock", { power: 0.8 })   // anywhere; silent until the first tap or click
//   setSound(on), soundOn(), onSound(fn)            // the speaker button in the top bar
//   renderSound(name)                               // (for checking levels: a buffer, rendered offline)
// Browsers only allow sound after the visitor has touched the page, so the first tap or key
// wakes it up. The choice to mute is remembered.

const KEY = "r4n-sound";
let enabled = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();
let A = null; // the live engine: { ctx, out, noise, samples }
const listeners = new Set();
const last = new Map();

// the recordings, and which sound each one is
const SAMPLES = { dive: "dive", rise: "rise", chime: "chime", toggle: "toggle", morph: "morph", open: "open", close: "close", knock: "thump" };
const sampleUrl = (file) => new URL(`../assets/sound/${file}.mp3${new URL(import.meta.url).search}`, import.meta.url).href;
const files = {}; // file -> Promise<ArrayBuffer>, fetched once

// an engine on any audio context (the live one, or an offline one to measure)
function engine(ctx) {
  // loud enough to hear on a phone speaker; the compressor keeps the peaks in hand
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.knee.value = 6; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.15;
  const out = ctx.createGain();
  out.gain.value = 1.25;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.6;
  out.connect(comp).connect(makeup).connect(ctx.destination);
  // two seconds of white noise, the raw material of every paper and card sound
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { ctx, out, noise, samples: {} };
}

// decode (old Safari only knows the callback form)
function decode(ctx, data) {
  return new Promise((res, rej) => {
    const p = ctx.decodeAudioData(data.slice(0), res, rej);
    if (p && p.then) p.then(res, rej);
  });
}
function loadSamples(E) {
  return Promise.all(Object.entries(SAMPLES).map(async ([name, file]) => {
    try {
      files[file] ??= fetch(sampleUrl(file)).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); });
      E.samples[name] = await decode(E.ctx, await files[file]);
    } catch { files[file] = undefined; } // the code-made sound stays
  }));
}

// Waking up has to happen inside the tap itself: on phones only the end of a touch (or a click or a
// key) counts, not its start. iOS also wants something played right then, so a silent sample is.
function unlock() {
  const { ctx } = A;
  if (ctx.state !== "running") ctx.resume().catch(() => {});
  try {
    const s = ctx.createBufferSource();
    s.buffer = ctx.createBuffer(1, 1, ctx.sampleRate);
    s.connect(ctx.destination);
    s.start(0);
  } catch {}
}
function wake() {
  if (A) { if (A.ctx.state !== "running") unlock(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  // play even when an iPhone's ringer is switched to silent, like a video would (iOS 17+)
  try { if (navigator.audioSession) navigator.audioSession.type = "playback"; } catch {}
  try { A = engine(new AC()); } catch { return; }
  unlock();
  loadSamples(A);
}
for (const ev of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(ev, wake, { capture: true, passive: true });
// phones put the sound to sleep when the tab goes to the background; wake it when it's back
document.addEventListener("visibilitychange", () => { if (A && !document.hidden && A.ctx.state !== "running") A.ctx.resume().catch(() => {}); });

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (on) wake();
  listeners.forEach((fn) => fn(on));
}
export function onSound(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---- the building blocks ----
const vary = (x, k = 0.08) => x * (1 + (Math.random() * 2 - 1) * k);
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
// a tone: frequency (gliding to `to`), length, loudness
function tone(E, t, { f, to = f, dur = 0.1, gain = 0.1, type = "sine", attack = 0.004 }) {
  const { ctx } = E, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, gain, dur);
  o.connect(g).connect(E.out);
  o.start(t); o.stop(t + attack + dur + 0.05);
}
// filtered noise: a band (or low/high pass) that can sweep, with its own envelope
function hiss(E, t, { f = 2000, to = f, q = 1, dur = 0.1, gain = 0.1, type = "bandpass", attack = 0.003 }) {
  const { ctx } = E, s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = E.noise;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (to !== f) fl.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  env(g, t, attack, gain, dur);
  s.connect(fl).connect(g).connect(E.out);
  s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
}
// one of the recordings: how loud, and how fast (a little faster or slower is a little higher or lower)
function sample(E, t, buf, { gain = 0.3, rate = 1 } = {}) {
  const s = E.ctx.createBufferSource(), g = E.ctx.createGain();
  s.buffer = buf; s.playbackRate.value = rate;
  g.gain.value = gain;
  s.connect(g).connect(E.out);
  s.start(t);
}

// ---- the sounds made in code ----
const SOUNDS = {
  // the pointer finds something: barely there
  hover: (E, t) => { tone(E, t, { f: vary(2100), dur: 0.03, gain: 0.012 }); hiss(E, t, { f: 5200, q: 3, dur: 0.02, gain: 0.01 }); },
  // a press: a soft click with a little body
  click: (E, t) => { hiss(E, t, { f: 3000, q: 2, dur: 0.018, gain: 0.07 }); tone(E, t, { f: vary(540), to: 400, dur: 0.07, gain: 0.06, type: "triangle" }); },
  // a record going by in the tunnel: a short wooden tick
  tick: (E, t, o) => hiss(E, t, { f: vary(1300, 0.15), q: 9, dur: 0.035, gain: 0.05 * (o.power ?? 1) }),
  // a record pulled out of its place, and put back
  open: (E, t) => { hiss(E, t, { f: 380, to: 2400, q: 0.8, dur: 0.32, gain: 0.07, type: "lowpass", attack: 0.06 }); tone(E, t + 0.05, { f: 95, to: 60, dur: 0.18, gain: 0.08 }); },
  close: (E, t) => { hiss(E, t, { f: 2400, to: 300, q: 0.8, dur: 0.28, gain: 0.06, type: "lowpass", attack: 0.02 }); tone(E, t + 0.2, { f: 80, to: 55, dur: 0.12, gain: 0.06 }); },
  // switching what's shown
  toggle: (E, t) => { tone(E, t, { f: 660, dur: 0.06, gain: 0.05, type: "triangle" }); tone(E, t + 0.06, { f: 990, dur: 0.09, gain: 0.045, type: "triangle" }); },
  // the letters scrambling into another language: a run of little typebar ticks
  morph: (E, t) => { for (let i = 0; i < 12; i++) hiss(E, t + i * 0.035 + Math.random() * 0.015, { f: vary(3800, 0.25), q: 6, dur: 0.012, gain: 0.04 }); },
  // down the tunnel (and back up out of it)
  dive: (E, t) => { hiss(E, t, { f: 200, to: 4200, q: 0.7, dur: 0.85, gain: 0.11, type: "lowpass", attack: 0.25 }); tone(E, t + 0.55, { f: 70, to: 38, dur: 0.6, gain: 0.12 }); },
  rise: (E, t) => { hiss(E, t, { f: 4200, to: 220, q: 0.7, dur: 0.85, gain: 0.1, type: "lowpass", attack: 0.05 }); tone(E, t, { f: 46, to: 80, dur: 0.5, gain: 0.08 }); },
  // something knocking about inside the passport (until its recording has loaded: nothing, rather
  // than a poor imitation)
  knock: () => {},
  // the cover lifting, and the pages riffling under the thumb
  cover: (E, t) => { hiss(E, t, { f: 260, to: 700, q: 2, dur: 0.3, gain: 0.05, attack: 0.04 }); tone(E, t, { f: 120, to: 80, dur: 0.12, gain: 0.05 }); },
  flip: (E, t) => hiss(E, t, { f: vary(3200, 0.25), to: vary(1800), q: 1.2, dur: 0.045, gain: 0.05 }),
  page: (E, t) => { hiss(E, t, { f: 1200, to: 4000, q: 0.9, dur: 0.22, gain: 0.07, attack: 0.03 }); hiss(E, t + 0.18, { f: 2500, to: 900, q: 1, dur: 0.16, gain: 0.04 }); },
  // a key on the form
  type: (E, t) => hiss(E, t, { f: vary(2600, 0.2), q: 5, dur: 0.014, gain: 0.03 }),
  // a rubber stamp coming down
  stamp: (E, t) => { tone(E, t, { f: 120, to: 55, dur: 0.14, gain: 0.16 }); hiss(E, t, { f: 700, q: 0.8, dur: 0.06, gain: 0.12, type: "lowpass" }); hiss(E, t + 0.01, { f: 3000, q: 1, dur: 0.03, gain: 0.03 }); },
  // a pen signing: scratchy strokes
  pen: (E, t, o) => {
    const dur = o.dur ?? 1.1;
    for (let i = 0; i < dur / 0.06; i++) hiss(E, t + i * 0.06 + Math.random() * 0.02, { f: vary(4200, 0.3), q: 2.5, dur: 0.04 + Math.random() * 0.03, gain: 0.02 + Math.random() * 0.02 });
  },
  // sent: a breath of air
  send: (E, t) => hiss(E, t, { f: 600, to: 5000, q: 0.6, dur: 0.4, gain: 0.05, attack: 0.08 }),
  chime: (E, t) => { tone(E, t, { f: 880, dur: 1.1, gain: 0.05 }); tone(E, t + 0.09, { f: 1320, dur: 1.0, gain: 0.035 }); tone(E, t + 0.18, { f: 1760, dur: 0.9, gain: 0.02 }); },
  // a card opening / a note popping up
  card: (E, t) => { hiss(E, t, { f: 1800, to: 3600, q: 1, dur: 0.12, gain: 0.05, attack: 0.02 }); tone(E, t + 0.02, { f: 760, dur: 0.12, gain: 0.03, type: "triangle" }); },
};
// ---- and the recorded ones: how loud each sits beside the rest ----
const RECORDED = {
  dive: (E, t, b) => sample(E, t, b, { gain: 0.17 }),
  rise: (E, t, b) => sample(E, t, b, { gain: 0.18 }),
  open: (E, t, b) => sample(E, t, b, { gain: 0.2, rate: vary(1, 0.03) }),
  close: (E, t, b) => sample(E, t, b, { gain: 0.2, rate: vary(1, 0.03) }),
  toggle: (E, t, b) => sample(E, t, b, { gain: 0.08 }),
  morph: (E, t, b) => sample(E, t, b, { gain: 0.07 }),
  chime: (E, t, b) => sample(E, t, b, { gain: 0.27 }),
  // each knock a little different: how hard, and a touch higher or lower
  knock: (E, t, b, o) => sample(E, t, b, { gain: 0.19 * Math.min(1.2, o.power ?? 1), rate: vary(1, 0.12) }),
};
// the least time between two of the same, so a quick hand never turns them into a buzz (seconds)
const GAP = { hover: 0.05, tick: 0.045, flip: 0.025, type: 0.02, knock: 0.05, morph: 0.3 };

function run(E, name, t, opts) {
  const b = E.samples[name];
  if (b && RECORDED[name]) RECORDED[name](E, t, b, opts);
  else SOUNDS[name](E, t, opts);
}
export function play(name, opts = {}) {
  if (!enabled || !A || !SOUNDS[name]) return;
  const { ctx } = A;
  const go = () => {
    const now = ctx.currentTime;
    if (now - (last.get(name) ?? -1) < (GAP[name] ?? 0)) return;
    last.set(name, now);
    run(A, name, now + 0.005 + (opts.delay || 0), opts);
  };
  if (ctx.state === "running") return go();
  // still asleep (a phone that has just been woken, or one coming back from the background): try
  // once more, and play it if that works straight away
  const asked = performance.now();
  ctx.resume().then(() => { if (performance.now() - asked < 250) go(); }).catch(() => {});
}

// one sound, rendered offline (to check its level): resolves to an AudioBuffer
export async function renderSound(name, opts = {}, seconds = 2) {
  const ctx = new OfflineAudioContext(1, Math.round(44100 * seconds), 44100);
  const E = engine(ctx);
  if (SAMPLES[name]) await loadSamples(E);
  run(E, name, 0.01, opts);
  return ctx.startRendering();
}
export const SOUND_NAMES = Object.keys(SOUNDS);

// Every button and link gets its own small sound: a tick when the pointer finds it, a click when
// it's pressed. data-sound="toggle" (or another sound's name) picks a different one; "none" none.
const UI = "button, a, summary, [role=option]";
function wireUI() {
  let over = null;
  document.addEventListener("mouseover", (e) => {
    const el = e.target.closest?.(UI);
    if (el === over) return;
    over = el;
    if (el && el.dataset.sound !== "none") play("hover");
  });
  document.addEventListener("click", (e) => {
    const el = e.target.closest?.(UI);
    if (!el || el.dataset.sound === "none") return;
    play(el.dataset.sound || "click");
  }, true);
}

// the speaker button: on / off
export function initSound() {
  wireUI();
  const btn = document.getElementById("soundBtn");
  if (!btn) return;
  const mark = () => { btn.setAttribute("aria-pressed", String(enabled)); btn.classList.toggle("is-off", !enabled); };
  mark();
  onSound(mark);
  btn.dataset.sound = "none";
  btn.addEventListener("click", () => { setSound(!enabled); if (enabled) setTimeout(() => play("toggle"), 30); });
}
