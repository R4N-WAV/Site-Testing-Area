// ACCESS: a private page behind a password.
//
// Nothing about the private page is in this file or anywhere else in the site's code. The page
// itself (its layout, text, images and downloads) is stored in vault/ as AES-256-GCM ciphertext.
// The key is derived from the password with PBKDF2-SHA-256 (over a million rounds, random salt),
// so the password is never stored anywhere: a wrong one simply fails to decrypt. What's unlocked
// is kept in memory only until you leave; coming back always asks for the password again.
// To change what's inside, or the password, use scripts/vault.mjs.
//
// The moment, after the dot-made endings of the Spider-Verse films: the page as it is right now
// dissolves into dots of colour in different sizes. They stream across the screen, turning into
// plain ink as they go, and settle into a halftone bar: the password field.

const VAULT = "vault/";
const BG = "#f6f6f4";
const INK = [26, 26, 28];
const FOIL = [[184, 51, 143], [255, 127, 207], [233, 92, 182], [210, 56, 159]]; // pink holo: never a rainbow
const TAU = Math.PI * 2;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// phones and tablets: an on-screen keyboard comes and goes, changing the window's height
const touchScreen = () => window.matchMedia("(hover: none), (pointer: coarse)").matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? 0 : ms));
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const ease = {
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  steps: (k) => Math.floor(k * 3) / 3, // a misprint stutter
};
const mix = (a, b, t) => a + (b - a) * t;
function foilAt(u) {
  const s = clamp(u, 0, 1) * (FOIL.length - 1), i = Math.min(FOIL.length - 2, Math.floor(s)), f = s - i;
  return FOIL[i].map((v, k) => mix(v, FOIL[i + 1][k], f));
}

export function initAccess({ space }) {
  const btn = $("accessBtn");
  const root = $("access");
  if (!btn || !root) return;
  const canvas = $("accessCanvas");
  const g = canvas.getContext("2d");
  const form = $("accessField");
  const input = $("accessInput");
  const goBtn = $("accessGo");
  const note = $("accessNote");
  const hubEl = $("hub");

  // idle → opening → locked ⇄ checking → unlocked → entering → hub → leaving → idle
  let phase = "idle";
  let W = 0, H = 0, S = 1, touch = false;
  let snap = null, dots = [], slots = [], bar = null, spacing = 10;
  let raf = 0;
  let snapAlpha = 0, bgAlpha = 1;
  let checking = 0, checkingTarget = 0, shakeAt = -1;
  const tweens = [];
  let payload = null; // what the password unlocked: in memory only, forgotten on the way out
  let hubModule = null, hubInstance = null, hubStyle = null, headFace = null;
  let hubBytes = null;

  // ---------------------------------------------------------------- the current page, as one image
  function effectiveOpacity(el) {
    let o = 1;
    for (let e = el; e && e !== document.documentElement; e = e.parentElement) o *= parseFloat(getComputedStyle(e).opacity) || 0;
    return o;
  }
  function drawText(ctx, rootEl) {
    if (!rootEl) return;
    const walker = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT);
    for (let n; (n = walker.nextNode());) {
      const text = n.textContent.trim();
      if (!text) continue;
      const el = n.parentElement;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      const op = effectiveOpacity(el);
      if (op < 0.01) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const r = range.getBoundingClientRect();
      if (!r.width) continue;
      ctx.save();
      ctx.globalAlpha = op;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing === "normal" ? "0px" : cs.letterSpacing;
      let fill = cs.color;
      if (el.classList.contains("foil") && /rgba\(0, 0, 0, 0\)|transparent/.test(fill)) {
        fill = ctx.createLinearGradient(r.left, 0, r.right, 0);
        fill.addColorStop(0, "#b8338f"); fill.addColorStop(0.5, "#ff7fcf"); fill.addColorStop(1, "#d2389f");
      }
      ctx.fillStyle = fill;
      ctx.textBaseline = "middle";
      ctx.fillText(text, r.left, r.top + r.height / 2);
      ctx.restore();
    }
  }
  function drawLogo(ctx) {
    const img = document.querySelector("#wordmark img");
    if (!img || !img.complete) return;
    const r = img.getBoundingClientRect();
    const op = effectiveOpacity(img);
    if (!r.width || op < 0.01) return;
    const off = document.createElement("canvas");
    off.width = Math.ceil(r.width * S); off.height = Math.ceil(r.height * S);
    const og = off.getContext("2d");
    og.drawImage(img, 0, 0, off.width, off.height);
    og.globalCompositeOperation = "source-in"; // the logo file is white; the page shows it dark
    og.fillStyle = "#000";
    og.fillRect(0, 0, off.width, off.height);
    ctx.save();
    ctx.globalAlpha = op;
    ctx.drawImage(off, r.left, r.top, r.width, r.height);
    ctx.restore();
  }
  function paintBackground(ctx, alpha = 1) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    ctx.translate(W / 2, H / 2);
    ctx.scale(0.42 * W, 0.46 * H);
    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    halo.addColorStop(0, "rgba(150,200,240,0.16)");
    halo.addColorStop(0.7, "rgba(150,200,240,0)");
    ctx.fillStyle = halo;
    ctx.fillRect(-1.5, -1.5, 3, 3);
    ctx.restore();
  }
  async function makeSnapshot() {
    const c = document.createElement("canvas");
    c.width = Math.round(W * S); c.height = Math.round(H * S);
    const ctx = c.getContext("2d");
    ctx.scale(S, S);
    paintBackground(ctx);
    if (space) ctx.drawImage(await space.capture(), 0, 0, W, H);
    drawLogo(ctx);
    for (const el of document.querySelectorAll(".modeToggle, #indexBtn, #accessBtn, #emptyNote")) drawText(ctx, el);
    return c;
  }

  // ---------------------------------------------------------------- the page, as dots
  function readGrid(src, cols, rows) {
    const c = document.createElement("canvas");
    c.width = cols; c.height = rows;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(src, 0, 0, cols, rows);
    return ctx.getImageData(0, 0, cols, rows).data;
  }
  function buildDots() {
    spacing = clamp(Math.round(Math.sqrt((W * H) / 15000)), 7, 12);
    const cols = Math.ceil(W / spacing), rows = Math.ceil(H / spacing);
    const cw = W / cols, ch = H / rows, cell = Math.min(cw, ch);
    const empty = document.createElement("canvas");
    empty.width = snap.width; empty.height = snap.height;
    const eg = empty.getContext("2d");
    eg.scale(S, S);
    paintBackground(eg);
    const a = readGrid(snap, cols, rows), b = readGrid(empty, cols, rows);
    dots = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = (r * cols + c) * 4;
        const col = [a[i], a[i + 1], a[i + 2]];
        const ink = Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]);
        const content = ink > 26;
        if (!content && Math.random() > 0.14) continue; // the empty page: a sparse scatter
        const lum = (0.299 * col[0] + 0.587 * col[1] + 0.114 * col[2]) / 255;
        const hr = content
          ? Math.min(cell * 0.68, cell * 0.5 * (0.55 + 0.35 * Math.random()) * (0.8 + 0.45 * (1 - lum)))
          : cell * (0.1 + 0.16 * Math.random());
        const hx = (c + 0.5) * cw + (r % 2 ? cw * 0.25 : -cw * 0.25) + (Math.random() - 0.5) * cw * 0.3;
        const hy = (r + 0.5) * ch + (Math.random() - 0.5) * ch * 0.3;
        dots.push({
          hx, hy, hr, content,
          col: content ? col : col.map((v) => v * 0.97),
          base: null, tint: INK,
          x: hx, y: hy, r: 0, a: 0, m: 0,
          slot: null, anim: null, rnd: Math.random(),
        });
      }
    }
    for (const d of dots) d.base = d.col;
  }

  // the bar: a halftone, large dots round its edge, fine ones in the middle where the text goes.
  // On touch screens it sits higher, clear of the keyboard that comes up when you type.
  function buildBar() {
    const bw = Math.min(W - 48, clamp(W * 0.38, 340, 560)), bh = 76;
    const cy = Math.round(touch ? H * 0.36 : H / 2);
    bar = { x: (W - bw) / 2, y: cy - bh / 2, w: bw, h: bh };
    root.style.setProperty("--bar-w", `${bw}px`);
    root.style.setProperty("--bar-h", `${bh}px`);
    root.style.setProperty("--bar-cy", `${cy}px`);
    const ss = 5.4, rowH = ss * 0.866;
    const nRows = Math.floor(bh / rowH), nCols = Math.floor(bw / ss);
    const oy = bar.y + (bh - (nRows - 1) * rowH) / 2, ox = bar.x + (bw - (nCols - 0.5) * ss) / 2;
    slots = [];
    for (let r = 0; r < nRows; r++) {
      for (let c = 0; c < nCols; c++) {
        const x = ox + c * ss + (r % 2 ? ss / 2 : 0), y = oy + r * rowH;
        const u = (x - (bar.x + bw / 2)) / (bw / 2), v = (y - (bar.y + bh / 2)) / (bh / 2);
        const e = Math.pow(Math.pow(Math.abs(u), 6) + Math.pow(Math.abs(v), 6), 1 / 6); // a rounded rectangle
        slots.push({ x, y, r: 0.3 + (ss * 0.4 - 0.3) * Math.pow(smooth(0.5, 1.02, e), 1.4) });
      }
    }
  }
  function assignSlots() {
    const content = dots.filter((d) => d.content).sort((p, q) => p.hx - q.hx);
    const n = slots.length;
    let chosen;
    if (content.length >= n) {
      chosen = Array.from({ length: n }, (_, k) => content[Math.floor((k * content.length) / n)]);
    } else {
      const rest = dots.filter((d) => !d.content).sort(() => Math.random() - 0.5);
      chosen = content.concat(rest.slice(0, n - content.length));
    }
    chosen.sort((p, q) => p.hx - q.hx || p.hy - q.hy);
    const ordered = slots.slice().sort((p, q) => p.x - q.x || p.y - q.y);
    for (const d of dots) d.slot = null;
    chosen.forEach((d, i) => { d.slot = ordered[i]; });
  }

  // ---------------------------------------------------------------- motion
  function go(d, to, delay, dur, fn = ease.inOut, curve = 0) {
    const from = { x: d.x, y: d.y, r: d.r, a: d.a, m: d.m };
    let cx = null, cy = null;
    if (curve && to.x !== undefined) {
      // a curved path: the dots stream rather than travel in straight lines
      const dx = to.x - d.x, dy = to.y - d.y, len = Math.hypot(dx, dy) || 1;
      const bend = (d.rnd - 0.5) * curve * len;
      cx = (d.x + to.x) / 2 - (dy / len) * bend;
      cy = (d.y + to.y) / 2 + (dx / len) * bend;
    }
    d.anim = { from, to, t0: performance.now() + (reducedMotion ? 0 : delay), dur: reducedMotion ? 1 : dur, fn, cx, cy };
  }
  function tween(set, from, to, dur, delay = 0) {
    tweens.push({ set, from, to, t0: performance.now() + (reducedMotion ? 0 : delay), dur: reducedMotion ? 1 : dur });
    set(from);
  }
  function settled() {
    return new Promise((resolve) => {
      const check = () => (dots.some((d) => d.anim) || tweens.length ? requestAnimationFrame(check) : resolve());
      check();
    });
  }

  function draw(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      const k = clamp((now - tw.t0) / tw.dur, 0, 1);
      tw.set(mix(tw.from, tw.to, ease.inOut(k)));
      if (k >= 1) tweens.splice(i, 1);
    }
    for (const d of dots) {
      const an = d.anim;
      if (!an) continue;
      const k = clamp((now - an.t0) / an.dur, 0, 1);
      if (k <= 0) continue;
      const e = an.fn(k), f = an.from, to = an.to;
      if (to.x !== undefined) {
        if (an.cx !== null) {
          const u = 1 - e;
          d.x = u * u * f.x + 2 * u * e * an.cx + e * e * to.x;
          d.y = u * u * f.y + 2 * u * e * an.cy + e * e * to.y;
        } else { d.x = mix(f.x, to.x, e); d.y = mix(f.y, to.y, e); }
      }
      if (to.r !== undefined) d.r = mix(f.r, to.r, e);
      if (to.a !== undefined) d.a = mix(f.a, to.a, e);
      if (to.m !== undefined) d.m = mix(f.m, to.m, e);
      if (k >= 1) d.anim = null;
    }
    checking += (checkingTarget - checking) * 0.1;
    let shakeX = 0;
    if (shakeAt >= 0) {
      const dt = now - shakeAt;
      shakeX = Math.sin(dt * 0.055) * 11 * Math.exp(-dt / 170);
      if (dt > 700) shakeAt = -1;
    }
    root.style.setProperty("--shake", `${shakeX.toFixed(2)}px`);

    g.setTransform(S, 0, 0, S, 0, 0);
    g.clearRect(0, 0, W, H);
    if (bgAlpha > 0.003) paintBackground(g, bgAlpha);
    if (snapAlpha > 0.003) {
      g.globalAlpha = snapAlpha;
      g.drawImage(snap, 0, 0, W, H);
      g.globalAlpha = 1;
    }
    const inBar = phase === "locked" || phase === "checking" || phase === "unlocked";
    for (const d of dots) {
      if (d.a < 0.01 || d.r < 0.12) continue;
      let r = d.r, x = d.x;
      if (inBar && d.slot) {
        x += shakeX;
        if (checking > 0.01) {
          const w = Math.max(0, Math.sin(now * 0.011 - d.x * 0.045));
          r *= 1 + checking * 1.3 * w * w;
        }
      }
      const m = d.m, c = d.col, t = d.tint;
      g.fillStyle = colour(mix(c[0], t[0], m), mix(c[1], t[1], m), mix(c[2], t[2], m));
      g.globalAlpha = d.a;
      if (r < 0.9) g.fillRect(x - r, d.y - r, r * 2, r * 2);
      else { g.beginPath(); g.arc(x, d.y, r, 0, TAU); g.fill(); }
    }
    g.globalAlpha = 1;
    raf = requestAnimationFrame(draw);
  }
  // colours are snapped to steps of 4 (invisible) so each one's string is built once, not every frame
  const colours = new Map();
  function colour(r, g2, b) {
    const key = ((r >> 2) << 12) | ((g2 >> 2) << 6) | (b >> 2);
    let c = colours.get(key);
    if (!c) { c = `rgb(${(r >> 2) << 2},${(g2 >> 2) << 2},${(b >> 2) << 2})`; colours.set(key, c); }
    return c;
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(draw); }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  // ---------------------------------------------------------------- open / close
  async function open() {
    if (phase !== "idle") return;
    phase = "opening";
    loadHubBytes().catch(() => {});
    W = window.innerWidth; H = window.innerHeight; S = Math.min(window.devicePixelRatio || 1, 2);
    touch = touchScreen();
    canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
    canvas.style.width = `${W}px`; canvas.style.height = `${H}px`;
    snap = await makeSnapshot();
    space?.setPaused(true);
    buildDots();
    buildBar();
    assignSlots();
    bgAlpha = 1; snapAlpha = 1;
    root.hidden = false;
    root.classList.remove("is-ready");
    note.textContent = "";
    document.body.classList.add("access-open");
    startLoop();

    // 1. the page dissolves into dots of its own colours
    for (const d of dots) go(d, { r: d.hr, a: 1 }, d.rnd * 240, 320, ease.out);
    tween((v) => { snapAlpha = v; }, 1, 0, 480, 80);
    await wait(500);
    // 2. a misprint shudder
    for (const d of dots) go(d, { x: d.hx + (Math.random() - 0.5) * spacing * 0.9, y: d.hy + (Math.random() - 0.5) * spacing * 0.9 }, 0, 150, ease.steps);
    await wait(170);
    // 3. everything streams into one bar, turning to ink on the way
    for (const d of dots) {
      const delay = (d.hx / W) * 380 + d.rnd * 170;
      if (d.slot) go(d, { x: d.slot.x, y: d.slot.y, r: d.slot.r, a: 0.78, m: 1 }, delay, 1000, ease.inOut, 0.7);
      else go(d, { x: bar.x + d.rnd * bar.w, y: bar.y + bar.h / 2, r: 0, a: 0, m: 1 }, delay, 850, ease.inOut, 0.7);
    }
    await settled();
    phase = "locked";
    root.classList.add("is-ready");
    input.hidden = false;
    goBtn.hidden = true;
    input.value = "";
    // phones only bring up the keyboard for a tap, not for focus() after an animation: ask for one
    // (and leave the field unfocused, so the hint shows)
    input.placeholder = touch ? "TAP TO TYPE" : "";
    if (!touch) input.focus();
  }

  async function close() {
    if (phase !== "locked" && phase !== "unlocked") return;
    phase = "closing";
    forget();
    root.classList.remove("is-ready");
    input.blur();
    note.textContent = "";
    await scatterHome();
    finish();
  }
  // The exact reverse of the way in: the dots stream back to where they came from, regaining their
  // colour, settle, and then shrink away in the same staggered wave the page grew them in, while the
  // page itself fades back up underneath. Same timings as the opening, played backwards.
  async function scatterHome(lead = 0) {
    for (const d of dots) {
      d.col = d.base; d.tint = INK;
      go(d, { x: d.hx, y: d.hy, r: d.hr, a: 1, m: 0 }, lead + ((W - d.hx) / W) * 380 + d.rnd * 170, 1000, ease.inOut, 0.7);
    }
    await settled();
    tween((v) => { snapAlpha = v; }, 0, 1, 480);
    for (const d of dots) go(d, { r: 0, a: 0 }, 80 + d.rnd * 240, 320, ease.in);
    await settled();
  }
  function finish() {
    stopLoop();
    root.hidden = true;
    document.body.classList.remove("access-open");
    space?.setPaused(false);
    phase = "idle";
  }

  // ---------------------------------------------------------------- the password
  function loadHubBytes() {
    if (!hubBytes) {
      hubBytes = fetch(`${VAULT}hub.bin`, { cache: "no-cache" })
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("no vault"))))
        .catch((err) => { hubBytes = null; throw err; });
    }
    return hubBytes;
  }
  const normalize = (pw) => pw.normalize("NFKC").trim().toLowerCase();
  async function unlock(pw) {
    const buf = new Uint8Array(await loadHubBytes());
    const magic = [0x52, 0x34, 0x4e, 0x56]; // "R4NV"
    if (buf.length < 40 || magic.some((m, i) => buf[i] !== m)) throw new Error("not a vault");
    const iterations = new DataView(buf.buffer, buf.byteOffset).getUint32(5);
    const salt = buf.subarray(9, 25), iv = buf.subarray(25, 37), data = buf.subarray(37);
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(normalize(pw)), "PBKDF2", false, ["deriveKey"]);
    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", hash: "SHA-256", salt, iterations },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]
    );
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, data); // throws on a wrong password
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function submit() {
    if (phase !== "locked") return;
    const pw = input.value;
    if (!pw) return;
    phase = "checking";
    note.textContent = "";
    checkingTarget = 1;
    const started = performance.now();
    let result = null, missing = false;
    try { result = await unlock(pw); } catch (err) { missing = err.message === "no vault"; }
    const left = 650 - (performance.now() - started);
    if (left > 0) await wait(left);
    checkingTarget = 0;
    input.value = "";
    if (!result) {
      phase = "locked";
      shakeAt = performance.now();
      note.textContent = missing ? "NOT AVAILABLE RIGHT NOW" : "WRONG PASSWORD";
      setTimeout(() => { if (phase === "locked") note.textContent = ""; }, 2400);
      input.focus();
      return;
    }
    payload = result;
    phase = "unlocked";
    input.blur();
    input.hidden = true;
    goBtn.hidden = false;
    goBtn.focus({ preventScroll: true });
    checkingTarget = 1; // a pulse along the bar to say yes
    setTimeout(() => { checkingTarget = 0; }, 600);
  }

  // ---------------------------------------------------------------- what the password unlocked
  async function loadHub() {
    hubStyle = document.createElement("style");
    hubStyle.textContent = payload.page.css;
    document.head.appendChild(hubStyle);
    const url = URL.createObjectURL(new Blob([payload.page.js], { type: "text/javascript" }));
    try { hubModule = await import(url); } finally { URL.revokeObjectURL(url); }
    if (payload.data.titleFont) {
      try {
        const blob = await getFile(payload.data.titleFont);
        headFace = new FontFace("hubHead", await blob.arrayBuffer(), { weight: "700" });
        await headFace.load();
        document.fonts.add(headFace);
      } catch { /* falls back to a system face */ }
    }
  }
  const fileCache = new Map();
  async function getFile(id, onProgress) {
    if (!payload) throw new Error("locked");
    if (fileCache.has(id)) return fileCache.get(id);
    const meta = payload.files[id];
    if (!meta) throw new Error("missing file");
    const res = await fetch(`${VAULT}${id}.bin`);
    if (!res.ok) throw new Error("download failed");
    const total = meta.size + 28;
    let buf;
    if (res.body && onProgress) {
      const reader = res.body.getReader();
      const chunks = [];
      let got = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        got += value.length;
        onProgress(Math.min(1, got / total));
      }
      buf = new Uint8Array(got);
      let o = 0;
      for (const c of chunks) { buf.set(c, o); o += c.length; }
    } else {
      buf = new Uint8Array(await res.arrayBuffer());
    }
    const rawKey = Uint8Array.from(atob(meta.key), (ch) => ch.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", rawKey, "AES-GCM", false, ["decrypt"]);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12));
    const blob = new Blob([plain], { type: meta.type || "application/octet-stream" });
    if (meta.type && (meta.type.startsWith("image/") || meta.type.startsWith("font/"))) fileCache.set(id, blob);
    return blob;
  }
  // leaving (or closing the field) forgets everything the password unlocked
  function forget() {
    payload = null;
    fileCache.clear();
    hubModule = null;
    hubStyle?.remove(); hubStyle = null;
    if (headFace) { document.fonts.delete(headFace); headFace = null; }
  }

  // ---------------------------------------------------------------- the headline
  function makeHeadline(text) {
    const el = document.createElement("div");
    el.className = "flyTitle";
    const layer = (cls) => `<span class="flyTitle__layer ${cls}"><span class="flyTitle__words">${text.replace(/[&<>]/g, "")}</span><span class="flyTitle__mark"></span></span>`;
    el.innerHTML = layer("flyTitle__layer--foil") + layer("flyTitle__layer--plain");
    el.setAttribute("aria-hidden", "true");
    document.body.appendChild(el);
    const r = el.getBoundingClientRect();
    el.style.left = `${Math.round((W - r.width) / 2)}px`;
    el.style.top = `${Math.round((H - r.height) / 2)}px`;
    return el;
  }
  // where the dots go: the headline's own letters and logo, as points
  function headlinePoints(el) {
    const c = document.createElement("canvas");
    c.width = W; c.height = H;
    const ctx = c.getContext("2d", { willReadFrequently: true });
    const words = el.querySelector(".flyTitle__layer--foil .flyTitle__words");
    const mark = el.querySelector(".flyTitle__layer--foil .flyTitle__mark");
    const cs = getComputedStyle(words);
    const wr = words.getBoundingClientRect(), mr = mark.getBoundingClientRect();
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    if ("letterSpacing" in ctx) ctx.letterSpacing = cs.letterSpacing;
    ctx.textBaseline = "middle";
    ctx.fillStyle = "#000";
    ctx.fillText(words.textContent.toUpperCase(), wr.left, wr.top + wr.height / 2);
    const logo = document.querySelector("#wordmark img");
    if (logo?.complete) ctx.drawImage(logo, mr.left, mr.top, mr.width, mr.height);
    const st = clamp(Math.round(parseFloat(cs.fontSize) / 16), 4, 8);
    const data = ctx.getImageData(0, 0, W, H).data;
    const pts = [];
    const x0 = Math.floor(Math.min(wr.left, mr.left)), x1 = Math.ceil(Math.max(wr.right, mr.right));
    const y0 = Math.floor(Math.min(wr.top, mr.top)), y1 = Math.ceil(Math.max(wr.bottom, mr.bottom));
    for (let y = y0, row = 0; y < y1; y += st, row++) {
      for (let x = x0 + (row % 2 ? st / 2 : 0); x < x1; x += st) {
        if (data[(Math.round(y) * W + Math.round(x)) * 4 + 3] > 120) pts.push({ x, y });
      }
    }
    return { pts, r: st * 0.52, x0, x1 };
  }

  // ---------------------------------------------------------------- into the private page and back
  async function enter() {
    if (phase !== "unlocked") return;
    phase = "entering";
    root.classList.remove("is-ready");
    try { await loadHub(); } catch (err) {
      // (nothing was shown yet: undo what loaded and stay on the field)
      console.error(err);
      hubStyle?.remove(); hubStyle = null; hubModule = null;
      phase = "unlocked"; root.classList.add("is-ready");
      return;
    }
    let head = null;
    try {
      await arrive((h) => { head = h; });
    } catch (err) {
      // if anything goes wrong on the way in, the site puts itself back together instead of hanging
      console.error(err);
      head?.remove();
      try { hubInstance?.unmount(); } catch { /* already gone */ }
      hubInstance = null;
      resetHub();
      hubEl.hidden = true;
      forget();
      wantLeave = false;
      root.hidden = false; snapAlpha = 0; bgAlpha = 1;
      startLoop();
      await scatterHome();
      finish();
      return;
    }
    phase = "hub";
    if (wantLeave) { wantLeave = false; leave(); } // EXIT or Esc was pressed while the headline was landing
  }
  let wantLeave = false;
  async function arrive(keepHead) {
    // 1. the bar's dots fly into the headline, turning pink
    const head = makeHeadline(hubModule.title || "");
    keepHead(head);
    const { pts, r: pr, x0, x1 } = headlinePoints(head);
    const inBar = dots.filter((d) => d.slot).sort((p, q) => p.x - q.x);
    pts.sort((p, q) => p.x - q.x || p.y - q.y);
    const targets = pts.length > inBar.length
      ? Array.from({ length: inBar.length }, (_, k) => pts[Math.floor((k * pts.length) / inBar.length)])
      : pts;
    inBar.forEach((d, i) => {
      d.col = INK; d.m = 0;
      const t = targets[i];
      if (t) {
        d.tint = foilAt((t.x - x0) / Math.max(1, x1 - x0));
        go(d, { x: t.x, y: t.y, r: pr * (0.8 + 0.4 * d.rnd), a: 1, m: 1 }, d.rnd * 220, 900, ease.inOut, 0.5);
      } else {
        go(d, { a: 0, r: 0 }, d.rnd * 200, 500);
      }
    });
    await settled();
    // 2. the headline itself appears over its dots; the private page fades in beneath
    resetHub();
    hubEl.hidden = false;
    hubEl.classList.add("is-arriving");
    hubInstance = hubModule.mount(hubEl, { data: payload.data, file: getFile, exit: leave });
    head.classList.add("is-on");
    for (const d of dots) go(d, { a: 0, r: d.r * 0.5 }, 120 + d.rnd * 220, 380);
    tween((v) => { bgAlpha = v; }, 1, 0, 650, 250);
    await settled();
    stopLoop();
    root.hidden = true;
    // 3. it settles into the corner, as the page's logo
    const to = hubInstance.logo.getBoundingClientRect();
    const from = head.getBoundingClientRect();
    head.style.transition = reducedMotion ? "none" : "transform 1.15s cubic-bezier(.65,0,.35,1)";
    head.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${to.width / from.width})`;
    head.classList.add("is-settled");
    await wait(1200);
    hubEl.classList.remove("is-arriving");
    head.remove();
  }

  async function leave() {
    if (phase === "entering") { wantLeave = true; return; }
    if (phase !== "hub") return;
    phase = "leaving";
    const logo = hubInstance?.logo?.getBoundingClientRect();
    const sameSize = W === window.innerWidth && (touch || H === window.innerHeight);
    root.hidden = false;
    root.classList.remove("is-ready");
    snapAlpha = 0;
    startLoop();
    tween((v) => { bgAlpha = v; }, 0, 1, 420);
    if (sameSize && logo && !reducedMotion) {
      // the dots pour out of the corner logo as the private page fades, and stream back into the site
      for (const d of dots) {
        d.x = logo.left + Math.random() * logo.width; d.y = logo.top + Math.random() * logo.height;
        d.r = 0.6 + Math.random() * 1.2; d.a = 0; d.m = 1; d.col = d.base; d.tint = INK;
      }
      await scatterHome(160);
    } else {
      await settled();
    }
    // taken down only once the site is fully back, so nothing hitches mid-animation
    hubInstance?.unmount();
    hubInstance = null;
    resetHub();
    hubEl.hidden = true;
    forget();
    finish();
  }

  // the private page's container starts every visit clean: whatever state it was left in
  // (an open in-depth view, a scroll position) must never carry over to the next visit
  function resetHub() {
    hubEl.innerHTML = "";
    hubEl.className = "hub";
    hubEl.removeAttribute("style");
    hubEl.scrollTop = 0;
  }

  // ---------------------------------------------------------------- wiring
  btn.addEventListener("click", open);
  form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
  goBtn.addEventListener("click", enter);
  root.addEventListener("pointerdown", (e) => {
    if (e.target === canvas && (phase === "locked" || phase === "unlocked")) {
      const inside = bar && e.clientX >= bar.x && e.clientX <= bar.x + bar.w && e.clientY >= bar.y && e.clientY <= bar.y + bar.h;
      if (!inside) close();
    }
  });
  window.addEventListener("keydown", (e) => {
    if (phase === "idle" || phase === "hub") return;
    if (e.key === "Escape") { e.preventDefault(); close(); }
    else if (e.key === "ArrowRight" && phase === "unlocked") { e.preventDefault(); enter(); }
  });
  window.addEventListener("resize", () => {
    // the dots are laid out for one window size: a resize while the field is up just closes it.
    // On touch screens only a new width counts (turning the phone): the keyboard and the browser's
    // bars change the height all the time, and the canvas keeps its size in pixels through that.
    if (phase === "locked" || phase === "unlocked") {
      if (touch && window.innerWidth === W) return;
      forget();
      for (const d of dots) d.anim = null;
      tweens.length = 0;
      root.classList.remove("is-ready");
      finish();
    }
  });
}
