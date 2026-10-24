// English and Norwegian. The choice is remembered; the first time, it follows the browser.
// Switching doesn't swap the words at once: every letter of what's there scrambles for a moment
// and settles into the other language, left to right.
//
//   <span data-i18n="key">…</span>           its text follows the language
//   <a data-i18n-label="key">                its aria-label does
//   t(key), lang(), setLang("no"), onLang(fn)

const STRINGS = {
  en: {
    mine: "MY SONGS", workedOn: "WORKED ON", booking: "BOOKING", index: "INDEX", access: "ACCESS",
    empty: "NOTHING HERE YET", contact: "contact", close: "CLOSE ✕", about: "ABOUT",
    prev: "← PREV", all: "ALL", next: "NEXT →", lost: "SIGNAL LOST — TRY RELOADING",
    listenOn: "Listen on", language: "Language",
    hintClick: "CLICK TO OPEN", hintTap: "TAP TO OPEN",
    back: "← BACK", name: "Your name", email: "you@example.com", message: "Date, place, what kind of gig…",
    send: "SEND", sending: "SENDING…", sent: "Sent. R4N will get back to you soon.",
    needName: "Write your name.", needEmail: "That e-mail doesn't look right.", needMessage: "Write a few words about the gig.",
    fallback: "Opening your e-mail app instead…",
  },
  no: {
    mine: "MINE LÅTER", workedOn: "JOBBET PÅ", booking: "BOOKING", index: "INDEKS", access: "TILGANG",
    empty: "INGENTING HER ENNÅ", contact: "kontakt", close: "LUKK ✕", about: "OM",
    prev: "← FORRIGE", all: "ALLE", next: "NESTE →", lost: "SIGNALET FORSVANT — PRØV Å LASTE PÅ NYTT",
    listenOn: "Lytt på", language: "Språk",
    hintClick: "KLIKK FOR Å ÅPNE", hintTap: "TRYKK FOR Å ÅPNE",
    back: "← TILBAKE", name: "Navnet ditt", email: "deg@eksempel.no", message: "Dato, sted, hva slags spillejobb…",
    send: "SEND", sending: "SENDER…", sent: "Sendt. R4N svarer deg så snart som mulig.",
    needName: "Skriv navnet ditt.", needEmail: "Den e-postadressen ser ikke riktig ut.", needMessage: "Skriv litt om spillejobben.",
    fallback: "Åpner e-postappen din i stedet…",
  },
};
const KEY = "r4n-lang";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function initial() {
  try { const saved = localStorage.getItem(KEY); if (saved in STRINGS) return saved; } catch {}
  return /^(nb|nn|no)\b/i.test(navigator.language || "") ? "no" : "en";
}
let current = initial();
const listeners = new Set();

export const lang = () => current;
export const t = (key) => STRINGS[current][key] ?? STRINGS.en[key] ?? key;
export function onLang(fn) { listeners.add(fn); return () => listeners.delete(fn); }

// ---- the morph: each letter scrambles and lands on its new one, a little after the one before ----
const GLYPHS = "ABCDEFGHIJKLMNOPRSTUVWXYZÆØÅ0123456789";
const running = new WeakMap();
export function morph(el, to, set = (s) => { el.textContent = s; }) {
  const from = running.get(el)?.to ?? el.textContent;
  cancelAnimationFrame(running.get(el)?.raf);
  if (reducedMotion || from === to) { set(to); running.delete(el); return; }
  const n = Math.max(from.length, to.length);
  const delay = Array.from({ length: n }, (_, i) => i * 32 + Math.random() * 90);
  const SPIN = 300, start = performance.now();
  const job = { to, raf: 0 };
  running.set(el, job);
  let lastSwap = -1, noise = [];
  const pick = (target) => {
    const g = GLYPHS[(Math.random() * GLYPHS.length) | 0];
    return target && target === target.toLowerCase() && target !== target.toUpperCase() ? g.toLowerCase() : g;
  };
  const step = (now) => {
    const e = now - start;
    // the scrambled letters change about 20 times a second, so they read as letters, not a blur
    if (Math.floor(e / 50) !== lastSwap) { lastSwap = Math.floor(e / 50); noise = Array.from({ length: n }, (_, i) => pick(to[i] ?? from[i])); }
    let s = "", done = true;
    for (let i = 0; i < n; i++) {
      const a = from[i] ?? "", b = to[i] ?? "";
      if (e < delay[i]) { s += a; done = false; }
      else if (e < delay[i] + SPIN) { s += b === " " || (a === " " && !b) ? b : noise[i]; done = false; }
      else s += b;
    }
    set(s);
    if (done) { set(to); running.delete(el); return; }
    job.raf = requestAnimationFrame(step);
  };
  job.raf = requestAnimationFrame(step);
}

// everything on the page marked with a key: text (and the foil's copy of it), labels
function apply(animate) {
  document.documentElement.lang = current === "no" ? "nb" : "en";
  document.querySelectorAll("[data-i18n]").forEach((el) => {
    const to = t(el.dataset.i18n);
    const set = (s) => { el.textContent = s; if ("text" in el.dataset) el.dataset.text = s; };
    if (animate && el.offsetParent !== null) morph(el, to, set); else set(to);
  });
  document.querySelectorAll("[data-i18n-label]").forEach((el) => el.setAttribute("aria-label", t(el.dataset.i18nLabel)));
}

export function setLang(l) {
  if (!(l in STRINGS) || l === current) return;
  current = l;
  try { localStorage.setItem(KEY, l); } catch {}
  apply(true);
  listeners.forEach((fn) => fn(l));
}

// the picker beside BOOKING: EN / NO, a small list that drops down
export function initLang() {
  apply(false);
  const pick = document.getElementById("langPick");
  if (!pick) return;
  const btn = pick.querySelector(".langPick__btn"), list = pick.querySelector(".langPick__list");
  const code = pick.querySelector(".langPick__code");
  const show = (open) => {
    list.hidden = !open;
    btn.setAttribute("aria-expanded", String(open));
    pick.classList.toggle("is-open", open);
  };
  const mark = () => {
    code.textContent = current.toUpperCase();
    list.querySelectorAll("[data-lang]").forEach((b) => b.setAttribute("aria-selected", String(b.dataset.lang === current)));
  };
  mark();
  btn.addEventListener("click", (e) => { e.stopPropagation(); show(list.hidden); });
  list.addEventListener("click", (e) => {
    const b = e.target.closest("[data-lang]");
    if (!b) return;
    show(false);
    if (b.dataset.lang === current) return;
    setLang(b.dataset.lang);
    morph(code, current.toUpperCase());
    mark();
  });
  document.addEventListener("click", (e) => { if (!pick.contains(e.target)) show(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") show(false); });
}
