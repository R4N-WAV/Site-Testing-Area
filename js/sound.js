// Sounds for the whole site, made in code with the Web Audio API: nothing to download. Paper,
// card, a little wood and felt: soft, short, never louder than they need to be.
//
//   play("hover") / play("knock", { power: 0.8 })   // anywhere; silent until the first tap or click
//   setSound(on), soundOn(), onSound(fn)            // the speaker button in the top bar (js/i18n.js
//                                                   // wires the language picker; this its neighbour)
// Browsers only allow sound after the visitor has touched the page, so the first tap or key
// wakes it up. The choice to mute is remembered.

const KEY = "r4n-sound";
let enabled = (() => { try { return localStorage.getItem(KEY) !== "off"; } catch { return true; } })();
let ctx = null, out = null, noise = null;
const listeners = new Set();
const last = new Map();

function wake() {
  if (ctx) { if (ctx.state === "suspended") ctx.resume().catch(() => {}); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18; comp.ratio.value = 4;
  out = ctx.createGain();
  out.gain.value = 0.55;
  out.connect(comp).connect(ctx.destination);
  // two seconds of white noise, the raw material of every paper and card sound
  noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
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
function env(g, t, a, peak, d) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
}
// a tone: frequency (gliding to `to`), length, loudness
function tone(t, { f, to = f, dur = 0.1, gain = 0.1, type = "sine", attack = 0.004 }) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f, t);
  if (to !== f) o.frequency.exponentialRampToValueAtTime(to, t + dur);
  env(g, t, attack, gain, dur);
  o.connect(g).connect(out);
  o.start(t); o.stop(t + attack + dur + 0.05);
}
// filtered noise: a band (or low/high pass) that can sweep, with its own envelope
function hiss(t, { f = 2000, to = f, q = 1, dur = 0.1, gain = 0.1, type = "bandpass", attack = 0.003 }) {
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise;
  fl.type = type; fl.Q.value = q;
  fl.frequency.setValueAtTime(f, t);
  if (to !== f) fl.frequency.exponentialRampToValueAtTime(to, t + attack + dur);
  env(g, t, attack, gain, dur);
  s.connect(fl).connect(g).connect(out);
  s.start(t, Math.random() * 1.5); s.stop(t + attack + dur + 0.05);
}
const vary = (x, k = 0.08) => x * (1 + (Math.random() * 2 - 1) * k);

// ---- the sounds ----
const SOUNDS = {
  // the pointer finds something: a tiny dry tick
  hover: (t) => { tone(t, { f: vary(2100), dur: 0.03, gain: 0.025 }); hiss(t, { f: 5200, q: 3, dur: 0.02, gain: 0.02 }); },
  // a press: a soft click with a little body
  click: (t) => { hiss(t, { f: 3000, q: 2, dur: 0.018, gain: 0.07 }); tone(t, { f: vary(540), to: 400, dur: 0.07, gain: 0.06, type: "triangle" }); },
  // a record going by in the tunnel: a short wooden tick
  tick: (t, o) => hiss(t, { f: vary(1300, 0.15), q: 9, dur: 0.035, gain: 0.05 * (o.power ?? 1) }),
  // a record pulled out of its place, and put back
  open: (t) => { hiss(t, { f: 380, to: 2400, q: 0.8, dur: 0.32, gain: 0.07, type: "lowpass", attack: 0.06 }); tone(t + 0.05, { f: 95, to: 60, dur: 0.18, gain: 0.08 }); },
  close: (t) => { hiss(t, { f: 2400, to: 300, q: 0.8, dur: 0.28, gain: 0.06, type: "lowpass", attack: 0.02 }); tone(t + 0.2, { f: 80, to: 55, dur: 0.12, gain: 0.06 }); },
  // switching what's shown
  toggle: (t) => { tone(t, { f: 660, dur: 0.06, gain: 0.05, type: "triangle" }); tone(t + 0.06, { f: 990, dur: 0.09, gain: 0.045, type: "triangle" }); },
  // the letters scrambling into another language: a run of little typebar ticks
  morph: (t) => { for (let i = 0; i < 12; i++) hiss(t + i * 0.035 + Math.random() * 0.015, { f: vary(3800, 0.25), q: 6, dur: 0.012, gain: 0.04 }); },
  // down the tunnel (and back up out of it)
  dive: (t) => { hiss(t, { f: 200, to: 4200, q: 0.7, dur: 0.85, gain: 0.11, type: "lowpass", attack: 0.25 }); tone(t + 0.55, { f: 70, to: 38, dur: 0.6, gain: 0.12 }); },
  rise: (t) => { hiss(t, { f: 4200, to: 220, q: 0.7, dur: 0.85, gain: 0.1, type: "lowpass", attack: 0.05 }); tone(t, { f: 46, to: 80, dur: 0.5, gain: 0.08 }); },
  // something knocking about inside the passport
  knock: (t, o) => { const p = o.power ?? 1; tone(t, { f: vary(150, 0.2), to: 90, dur: 0.06, gain: 0.07 * p }); hiss(t, { f: vary(900, 0.3), q: 4, dur: 0.03, gain: 0.05 * p }); },
  // the cover lifting, and the pages riffling under the thumb
  cover: (t) => { hiss(t, { f: 260, to: 700, q: 2, dur: 0.3, gain: 0.05, attack: 0.04 }); tone(t, { f: 120, to: 80, dur: 0.12, gain: 0.05 }); },
  flip: (t) => hiss(t, { f: vary(3200, 0.25), to: vary(1800), q: 1.2, dur: 0.045, gain: 0.05 }),
  page: (t) => { hiss(t, { f: 1200, to: 4000, q: 0.9, dur: 0.22, gain: 0.07, attack: 0.03 }); hiss(t + 0.18, { f: 2500, to: 900, q: 1, dur: 0.16, gain: 0.04 }); },
  // a key on the form
  type: (t) => hiss(t, { f: vary(2600, 0.2), q: 5, dur: 0.014, gain: 0.03 }),
  // a rubber stamp coming down
  stamp: (t) => { tone(t, { f: 120, to: 55, dur: 0.14, gain: 0.16 }); hiss(t, { f: 700, q: 0.8, dur: 0.06, gain: 0.12, type: "lowpass" }); hiss(t + 0.01, { f: 3000, q: 1, dur: 0.03, gain: 0.03 }); },
  // a pen signing: scratchy strokes
  pen: (t, o) => {
    const dur = o.dur ?? 1.1;
    for (let i = 0; i < dur / 0.06; i++) hiss(t + i * 0.06 + Math.random() * 0.02, { f: vary(4200, 0.3), q: 2.5, dur: 0.04 + Math.random() * 0.03, gain: 0.02 + Math.random() * 0.02 });
  },
  // sent: a breath of air and a small bell
  send: (t) => { hiss(t, { f: 600, to: 5000, q: 0.6, dur: 0.4, gain: 0.05, attack: 0.08 }); },
  chime: (t) => { tone(t, { f: 880, dur: 1.1, gain: 0.05 }); tone(t + 0.09, { f: 1320, dur: 1.0, gain: 0.035 }); tone(t + 0.18, { f: 1760, dur: 0.9, gain: 0.02 }); },
  // a card opening / a note popping up
  card: (t) => { hiss(t, { f: 1800, to: 3600, q: 1, dur: 0.12, gain: 0.05, attack: 0.02 }); tone(t + 0.02, { f: 760, dur: 0.12, gain: 0.03, type: "triangle" }); },
};
// the least time between two of the same, so a quick hand never turns them into a buzz (seconds)
const GAP = { hover: 0.05, tick: 0.045, flip: 0.025, type: 0.02, knock: 0.03, morph: 0.3 };

export function play(name, opts = {}) {
  if (!enabled || !ctx || ctx.state !== "running") return;
  const f = SOUNDS[name];
  if (!f) return;
  const now = ctx.currentTime;
  if (now - (last.get(name) ?? -1) < (GAP[name] ?? 0)) return;
  last.set(name, now);
  f(now + (opts.delay || 0), opts);
}

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
