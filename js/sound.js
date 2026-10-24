// Sounds for the whole site, made in code with the Web Audio API: nothing to download, and no
// beeps. Everything is built the way real things sound:
// - a knock or a tap: a few short, unevenly spaced resonances, like wood or card struck;
// - paper: many tiny grains of filtered noise (that's what rustling is);
// - the passport's rattle: something small and loose knocking about inside it.
//
//   play("hover") / play("knock", { power: 0.8 })   // anywhere; silent until the first tap or click
//   setSound(on), soundOn(), onSound(fn)            // the speaker button in the top bar
//   renderSound(name)                               // (for checking levels: a buffer, rendered offline)
// Browsers only allow sound after the visitor has touched the page, so the first tap or key
// wakes it up. The choice to mute is remembered.

const KEY = "r4n-sound";
let enabled = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();
let A = null; // the live engine: { ctx, out, noise }
const listeners = new Set();
const last = new Map();

// an engine on any audio context (the live one, or an offline one to measure)
function engine(ctx) {
  // loud enough to hear on a phone speaker; the compressor keeps the peaks in hand
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16; comp.knee.value = 8; comp.ratio.value = 3.5; comp.attack.value = 0.002; comp.release.value = 0.12;
  const out = ctx.createGain();
  out.gain.value = 1.7;
  const makeup = ctx.createGain();
  makeup.gain.value = 1.0;
  out.connect(comp).connect(makeup).connect(ctx.destination);
  // two seconds of white noise, the raw material of every paper sound
  const noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return { ctx, out, noise };
}

function wake() {
  if (A) { if (A.ctx.state === "suspended") A.ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  A = engine(new AC());
}
for (const ev of ["pointerdown", "keydown", "touchstart"]) window.addEventListener(ev, wake, { capture: true, passive: true });

export const soundOn = () => enabled;
export function setSound(on) {
  enabled = on;
  try { localStorage.setItem(KEY, on ? "on" : "off"); } catch {}
  if (on) wake();
  listeners.forEach((fn) => fn(on));
}
export function onSound(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---- the building blocks ----
const rnd = (a, b) => a + Math.random() * (b - a);
const vary = (x, k = 0.08) => x * (1 + (Math.random() * 2 - 1) * k);

// a struck object: a few resonances (frequencies in Hz, how long each rings in s, how loud),
// set off by a click of noise, the way a knuckle sets off a board. Uneven partials, short rings:
// it reads as wood, card or plastic, never as a note.
function strike(E, t, { freqs, decays, gains = freqs.map(() => 1), gain = 0.3, bright = 4000, spread = 0.06 }) {
  const { ctx, out } = E;
  const bus = ctx.createGain();
  bus.gain.value = gain;
  bus.connect(out);
  freqs.forEach((f, i) => {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.frequency.value = vary(f, spread);
    const dec = decays[i] ?? decays[decays.length - 1];
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(gains[i], t + 0.0015);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.0015 + dec * 4);
    o.connect(g).connect(bus);
    o.start(t); o.stop(t + dec * 4 + 0.02);
  });
  click(E, t, { f: bright, q: 0.9, gain: gain * 0.6, dur: 0.004 });
}
// a tiny hard click: a sliver of noise through a resonant band
function click(E, t, { f = 3000, q = 8, gain = 0.3, dur = 0.002 }) {
  const { ctx, out, noise } = E;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(gain, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.012);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 1.8); s.stop(t + dur + 0.02);
}
// paper: grains of filtered noise scattered over `span` seconds, their pitch drifting from f to
// `to`; each grain a few milliseconds long, its own loudness. density: grains a second
function rustle(E, t, { span = 0.2, density = 220, f = 2500, to = f, q = 1.1, gain = 0.15, grain = [0.003, 0.012], shape = "even" }) {
  const n = Math.max(1, Math.round(span * density));
  for (let i = 0; i < n; i++) {
    const k = Math.random();
    // most paper sounds swell and fade: more grains, and louder, in the middle
    const env = shape === "even" ? 1 : Math.sin(Math.PI * k) ** (shape === "swell" ? 1 : 0.5);
    const at = t + k * span;
    const fq = f * Math.pow(to / f, k) * rnd(0.75, 1.3);
    grainAt(E, at, fq, q, rnd(grain[0], grain[1]), gain * env * rnd(0.4, 1));
  }
}
function grainAt(E, t, f, q, dur, gain) {
  const { ctx, out, noise } = E;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  fl.type = "bandpass"; fl.frequency.value = f; fl.Q.value = q;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 1.8); s.stop(t + dur + 0.01);
}
// air: a breath of soft noise, swept, with a slow rise and fall
function air(E, t, { f = 600, to = 3000, q = 0.6, dur = 0.6, gain = 0.2, attack = 0.25, type = "lowpass" }) {
  const { ctx, out, noise } = E;
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; s.loop = true;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  fl.frequency.exponentialRampToValueAtTime(to, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(gain, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random()); s.stop(t + dur + 0.05);
}

// ---- the sounds ----
const SOUNDS = {
  // the pointer finds something: the faintest touch of paper
  hover: (E, t) => grainAt(E, t, vary(4200, 0.2), 1.4, 0.008, 0.05),
  // a press: a fingertip on card
  click: (E, t) => strike(E, t, { freqs: [1750, 2900, 4300], decays: [0.012, 0.008, 0.005], gains: [1, 0.5, 0.3], gain: 0.22, bright: 5200 }),
  // a record going by in the tunnel: the soft rub of a sleeve
  tick: (E, t, o) => rustle(E, t, { span: 0.05, density: 300, f: 1500, to: 2600, q: 0.9, gain: 0.16 * (o.power ?? 1), shape: "swell" }),
  // a record slid out of its place, and back in
  open: (E, t) => { rustle(E, t, { span: 0.38, density: 260, f: 1100, to: 3200, q: 0.8, gain: 0.15, shape: "swell" }); strike(E, t + 0.34, { freqs: [140, 230, 370], decays: [0.05, 0.03, 0.02], gain: 0.2, bright: 1800 }); },
  close: (E, t) => { rustle(E, t, { span: 0.32, density: 260, f: 3000, to: 1100, q: 0.8, gain: 0.14, shape: "swell" }); strike(E, t + 0.3, { freqs: [120, 210, 330], decays: [0.05, 0.03, 0.02], gain: 0.19, bright: 1500 }); },
  // switching what's shown: two taps on card
  toggle: (E, t) => { strike(E, t, { freqs: [2100, 3400], decays: [0.01, 0.006], gain: 0.11 }); strike(E, t + 0.07, { freqs: [2500, 3900], decays: [0.01, 0.006], gain: 0.1 }); },
  // the letters scrambling into another language: typebars striking
  morph: (E, t) => { for (let i = 0; i < 9; i++) { const at = t + i * rnd(0.03, 0.05); click(E, at, { f: vary(3000, 0.2), q: 5, gain: 0.18 }); strike(E, at, { freqs: [vary(1300, 0.15), 2700], decays: [0.012, 0.006], gain: 0.07, bright: 3500 }); } },
  // down the tunnel, and back up out of it: a rush of air
  dive: (E, t) => air(E, t, { f: 250, to: 4200, dur: 1.0, gain: 0.55, attack: 0.55 }),
  rise: (E, t) => air(E, t, { f: 4000, to: 260, dur: 0.95, gain: 0.5, attack: 0.08 }),
  // something small and loose knocking about inside the passport: a few hard little clicks, the
  // booklet's dull body under them
  knock: (E, t, o) => {
    const p = o.power ?? 1;
    const n = 2 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) click(E, t + i * rnd(0.004, 0.011), { f: rnd(2300, 5200), q: rnd(7, 14), gain: 0.42 * p * rnd(0.5, 1) });
    strike(E, t, { freqs: [vary(190, 0.15), vary(300, 0.15), vary(470, 0.15)], decays: [0.03, 0.02, 0.012], gains: [1, 0.5, 0.3], gain: 0.22 * p, bright: 1200 });
  },
  // the cover lifting: card flexing
  cover: (E, t) => { rustle(E, t, { span: 0.26, density: 200, f: 800, to: 1600, q: 1, gain: 0.18, shape: "swell" }); strike(E, t, { freqs: [160, 260], decays: [0.04, 0.025], gain: 0.2, bright: 1400 }); },
  // a page flicking past under the thumb
  flip: (E, t) => rustle(E, t, { span: 0.04, density: 400, f: vary(3200, 0.2), to: vary(4800, 0.2), q: 1, gain: 0.17, shape: "swell" }),
  // a page turned over
  page: (E, t) => { rustle(E, t, { span: 0.34, density: 280, f: 1400, to: 4200, q: 0.9, gain: 0.22, shape: "swell" }); rustle(E, t + 0.3, { span: 0.08, density: 300, f: 2600, to: 1400, q: 1, gain: 0.14 }); },
  // a key pressed on the form
  type: (E, t) => { click(E, t, { f: vary(2700, 0.15), q: 4, gain: 0.18 }); strike(E, t, { freqs: [vary(1500, 0.1)], decays: [0.008], gain: 0.08, bright: 3000 }); },
  // a rubber stamp coming down: a dull thump, a little rubbery give
  stamp: (E, t) => {
    strike(E, t, { freqs: [92, 141, 233, 380], decays: [0.09, 0.06, 0.035, 0.02], gains: [1, 0.6, 0.35, 0.2], gain: 0.6, bright: 900 });
    air(E, t, { f: 700, to: 300, dur: 0.09, gain: 0.35, attack: 0.002 });
  },
  // a pen signing: scratchy strokes, pausing between letters
  pen: (E, t, o) => {
    const dur = o.dur ?? 1.2;
    let at = t;
    while (at < t + dur) { const stroke = rnd(0.12, 0.3); rustle(E, at, { span: stroke, density: 240, f: 4200, to: vary(5200, 0.2), q: 2, gain: 0.11, grain: [0.004, 0.01] }); at += stroke + rnd(0.04, 0.12); }
  },
  // sent: a breath of air
  send: (E, t) => air(E, t, { f: 700, to: 2600, q: 0.7, dur: 0.5, gain: 0.3, attack: 0.15, type: "bandpass" }),
  // thanks: a soft paper "thup" and a warm breath, nothing like a notification
  chime: (E, t) => { strike(E, t, { freqs: [520, 830, 1300], decays: [0.04, 0.03, 0.02], gain: 0.22, bright: 2500 }); air(E, t + 0.02, { f: 1500, to: 500, dur: 0.6, gain: 0.16, attack: 0.05 }); },
  // a card slid open
  card: (E, t) => rustle(E, t, { span: 0.16, density: 260, f: 2200, to: 3800, q: 1, gain: 0.18, shape: "swell" }),
};
// the least time between two of the same, so a quick hand never turns them into a buzz (seconds)
const GAP = { hover: 0.06, tick: 0.05, flip: 0.025, type: 0.02, knock: 0.03, morph: 0.3 };

export function play(name, opts = {}) {
  if (!enabled || !A || A.ctx.state !== "running") return;
  const f = SOUNDS[name];
  if (!f) return;
  const now = A.ctx.currentTime;
  if (now - (last.get(name) ?? -1) < (GAP[name] ?? 0)) return;
  last.set(name, now);
  f(A, now + 0.005 + (opts.delay || 0), opts);
}

// one sound, rendered offline (to check its level): resolves to an AudioBuffer
export function renderSound(name, opts = {}, seconds = 1.6) {
  const ctx = new OfflineAudioContext(1, Math.round(44100 * seconds), 44100);
  const E = engine(ctx);
  SOUNDS[name](E, 0.01, opts);
  return ctx.startRendering();
}
export const SOUND_NAMES = Object.keys(SOUNDS);

// Every button and link gets its own small sound: a touch when the pointer finds it, a tap when
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
