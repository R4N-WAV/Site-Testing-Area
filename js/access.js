// ACCESS: a private page behind a password (desktop only).
//
// Nothing about the private page is in this file or anywhere else in the site's code. The page
// itself (its layout, text, images and downloads) is stored in vault/ as AES-256-GCM ciphertext.
// The key is derived from the password with PBKDF2-SHA-256 (hundreds of thousands of rounds,
// random salt), so the password is never stored anywhere: a wrong one simply fails to decrypt.
// To change what's inside, or the password, use scripts/vault.mjs.
//
// The moment: the page as it is right now breaks into tiles, they shuffle, and collapse into
// a single field made of those same pieces. That field is where the password goes.

const VAULT = "vault/";
const BG = "#f6f6f4";
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const ease = {
  inOut: (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2),
  out: (k) => 1 - Math.pow(1 - k, 3),
  in: (k) => k * k * k,
  steps: (k) => Math.floor(k * 4) / 4, // a digital stutter
};

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

  let phase = "idle"; // idle → opening → locked ⇄ checking → unlocked → entering → hub → leaving → idle
  let W = 0, H = 0, S = 1;
  let snap = null;
  let tiles = [];
  let bar = null;
  let raf = 0;
  let barShown = 0, barTarget = 0;
  let shimmer = 0, shimmerTarget = 0;
  let shakeAt = -1;
  let seeThrough = false;
  let payload = null; // the decrypted private page, kept in memory only (gone on reload)
  let hubModule = null, hubInstance = null;
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
    // the logo file is white; on the page it's shown inverted (dark)
    const off = document.createElement("canvas");
    off.width = Math.ceil(r.width * S); off.height = Math.ceil(r.height * S);
    const og = off.getContext("2d");
    og.drawImage(img, 0, 0, off.width, off.height);
    og.globalCompositeOperation = "source-in";
    og.fillStyle = "#000";
    og.fillRect(0, 0, off.width, off.height);
    ctx.save();
    ctx.globalAlpha = op;
    ctx.drawImage(off, r.left, r.top, r.width, r.height);
    ctx.restore();
  }
  function paintBackground(ctx) {
    ctx.fillStyle = BG;
    ctx.fillRect(0, 0, W, H);
    // the faint sky-blue halo in the middle (same as the page background)
    ctx.save();
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
    if (space) {
      const frame = await space.capture();
      ctx.drawImage(frame, 0, 0, W, H);
    }
    drawLogo(ctx);
    for (const el of document.querySelectorAll(".modeToggle, #indexBtn, #accessBtn, #emptyNote")) drawText(ctx, el);
    return c;
  }

  // ---------------------------------------------------------------- tiles
  // how much each tile differs from the empty page behind it: covers and text count, background doesn't
  function inkMap(cols, rows, T) {
    const sample = (src) => {
      const c = document.createElement("canvas");
      c.width = Math.ceil((W / T) * 4); c.height = Math.ceil((H / T) * 4);
      const ctx = c.getContext("2d", { willReadFrequently: true });
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(src, 0, 0, c.width, c.height);
      return { data: ctx.getImageData(0, 0, c.width, c.height).data, w: c.width };
    };
    const empty = document.createElement("canvas");
    empty.width = snap.width; empty.height = snap.height;
    const eg = empty.getContext("2d");
    eg.scale(S, S);
    paintBackground(eg);
    const a = sample(snap), b = sample(empty);
    const ink = new Float32Array(cols * rows);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        let m = 0;
        for (let y = r * 4; y < r * 4 + 4; y++) {
          for (let x = c * 4; x < c * 4 + 4; x++) {
            if (x >= a.w) continue;
            const i = (y * a.w + x) * 4;
            if (i >= a.data.length) continue;
            m = Math.max(m, Math.abs(a.data[i] - b.data[i]) + Math.abs(a.data[i + 1] - b.data[i + 1]) + Math.abs(a.data[i + 2] - b.data[i + 2]));
          }
        }
        ink[r * cols + c] = m;
      }
    }
    return ink;
  }

  function buildTiles() {
    const T = Math.max(26, Math.ceil(Math.sqrt((W * H) / 1000)));
    const cols = Math.ceil(W / T), rows = Math.ceil(H / T);
    const bw = clamp(W * 0.36, 360, 560), bh = 72;
    bar = { x: (W - bw) / 2, y: (H - bh) / 2, w: bw, h: bh, cols, rows };
    root.style.setProperty("--bar-w", `${bw}px`);
    root.style.setProperty("--bar-h", `${bh}px`);
    const ink = inkMap(cols, rows, T);
    tiles = [];
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const sx = c * T, sy = r * T, sw = Math.min(T, W - sx), sh = Math.min(T, H - sy);
        const home = { x: sx, y: sy, w: sw, h: sh, r: 0 };
        tiles.push({
          sx, sy, sw, sh, col: c, row: r, home,
          ink: ink[r * cols + c] > 30,
          x: sx, y: sy, w: sw, h: sh, r: 0,
          alpha: 1, a: null, f: null, wave: 0,
          rnd: Math.random(),
        });
      }
    }
    // The field is built from the pieces that have something on them (covers, words, the logo),
    // packed edge to edge in their left-to-right order. The empty pieces are drawn in and dissolve.
    let parts = tiles.filter((t) => t.ink);
    if (parts.length < 12) parts = tiles; // (nothing much on screen: use everything)
    parts.sort((p, q) => p.home.x - q.home.x || p.home.y - q.home.y);
    const n = parts.length;
    const per = clamp(Math.round(bh / Math.sqrt((bw * bh) / n)), 1, 14); // pieces per column
    const columns = Math.ceil(n / per);
    const cw = bw / columns;
    parts.forEach((t, i) => {
      const col = Math.floor(i / per);
      const inCol = col === columns - 1 ? n - col * per : per; // the last column shares its height
      const row = i - col * per;
      const ch = bh / inCol;
      t.cell = { x: bar.x + col * cw, y: bar.y + row * ch, w: cw + 0.4, h: ch + 0.4, r: 0 };
      t.wave = col;
      t.part = true;
    });
    for (const t of tiles) {
      if (t.part) continue;
      t.cell = { x: bar.x + (t.home.x / W) * bw, y: bar.y + bh / 2, w: 1, h: 1, r: (t.rnd - 0.5) * 0.6 };
    }
  }
  function moveTo(t, to, delay, dur, fn = ease.inOut) {
    t.a = { from: { x: t.x, y: t.y, w: t.w, h: t.h, r: t.r }, to, t0: performance.now() + delay, dur: reducedMotion ? 1 : dur, fn };
  }
  function fadeTo(t, to, delay, dur) {
    t.f = { from: t.alpha, to, t0: performance.now() + delay, dur: reducedMotion ? 1 : dur };
  }
  function settled() {
    return new Promise((resolve) => {
      const check = () => (tiles.some((t) => t.a || t.f) ? requestAnimationFrame(check) : resolve());
      check();
    });
  }
  const centerDist = (t) => {
    const dx = t.home.x + t.home.w / 2 - W / 2, dy = t.home.y + t.home.h / 2 - H / 2;
    return Math.hypot(dx, dy) / Math.hypot(W / 2, H / 2);
  };

  // ---------------------------------------------------------------- drawing
  function draw(now) {
    for (const t of tiles) {
      if (t.a) {
        const k = clamp((now - t.a.t0) / t.a.dur, 0, 1);
        if (k > 0) {
          const e = t.a.fn(k), f = t.a.from, to = t.a.to;
          t.x = f.x + (to.x - f.x) * e; t.y = f.y + (to.y - f.y) * e;
          t.w = f.w + (to.w - f.w) * e; t.h = f.h + (to.h - f.h) * e;
          t.r = f.r + (to.r - f.r) * e;
          if (k >= 1) t.a = null;
        }
      }
      if (t.f) {
        const k = clamp((now - t.f.t0) / t.f.dur, 0, 1);
        if (k > 0) {
          t.alpha = t.f.from + (t.f.to - t.f.from) * ease.inOut(k);
          if (k >= 1) t.f = null;
        }
      }
    }
    barShown += (barTarget - barShown) * 0.14;
    shimmer += (shimmerTarget - shimmer) * 0.1;
    let shakeX = 0;
    if (shakeAt >= 0) {
      const dt = now - shakeAt;
      shakeX = Math.sin(dt * 0.055) * 11 * Math.exp(-dt / 170);
      if (dt > 700) shakeAt = -1;
    }
    root.style.setProperty("--shake", `${shakeX.toFixed(2)}px`);

    g.setTransform(S, 0, 0, S, 0, 0);
    if (seeThrough) g.clearRect(0, 0, W, H);
    else paintBackground(g);
    const inBar = phase === "locked" || phase === "checking" || phase === "unlocked";
    if (inBar && shakeX) g.translate(shakeX, 0);
    for (const t of tiles) {
      if (t.alpha <= 0.004) continue;
      g.globalAlpha = t.alpha;
      if (Math.abs(t.r) > 0.001) {
        g.save();
        g.translate(t.x + t.w / 2, t.y + t.h / 2);
        g.rotate(t.r);
        g.drawImage(snap, t.sx * S, t.sy * S, t.sw * S, t.sh * S, -t.w / 2, -t.h / 2, t.w, t.h);
        g.restore();
      } else {
        g.drawImage(snap, t.sx * S, t.sy * S, t.sw * S, t.sh * S, t.x, t.y, t.w, t.h);
      }
    }
    g.globalAlpha = 1;
    // checking the password: light runs along the field
    if (shimmer > 0.01) {
      for (const t of tiles) {
        if (!t.part || t.alpha < 0.05) continue;
        const wave = Math.max(0, Math.sin(now * 0.009 - t.wave * 0.32));
        g.fillStyle = `rgba(255,255,255,${(shimmer * 0.5 * wave * wave).toFixed(3)})`;
        g.fillRect(t.x, t.y, t.w, t.h);
      }
    }
    // the field itself: frosted, so what's typed reads clearly over the pieces
    if (barShown > 0.01 && bar) {
      g.fillStyle = `rgba(246,246,244,${(0.34 * barShown).toFixed(3)})`;
      g.fillRect(bar.x, bar.y, bar.w, bar.h);
      g.strokeStyle = `rgba(17,17,18,${(0.22 * barShown).toFixed(3)})`;
      g.lineWidth = 1;
      g.strokeRect(bar.x + 0.5, bar.y + 0.5, bar.w - 1, bar.h - 1);
    }
    raf = requestAnimationFrame(draw);
  }
  function startLoop() { if (!raf) raf = requestAnimationFrame(draw); }
  function stopLoop() { cancelAnimationFrame(raf); raf = 0; }

  // ---------------------------------------------------------------- open / close
  async function open() {
    if (phase !== "idle") return;
    phase = "opening";
    loadHubBytes();
    W = window.innerWidth; H = window.innerHeight; S = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.round(W * S); canvas.height = Math.round(H * S);
    snap = await makeSnapshot();
    space?.setPaused(true);
    buildTiles();
    seeThrough = false;
    barTarget = 0; barShown = 0;
    root.hidden = false;
    root.classList.remove("is-ready");
    note.textContent = "";
    document.body.classList.add("access-open");
    startLoop();

    // 1. the page stutters: rows of pieces jump sideways
    const rowShift = Array.from({ length: bar.rows }, () => (Math.random() - 0.5) * 2 * Math.pow(Math.random(), 2) * 120);
    for (const t of tiles) moveTo(t, { ...t.home, x: t.home.x + rowShift[t.row] }, 0, 170, ease.steps);
    await wait(reducedMotion ? 0 : 190);
    // 2. pieces swap places with their neighbours
    for (const t of tiles) {
      const nc = clamp(t.col + Math.round((Math.random() - 0.5) * 4), 0, bar.cols - 1);
      const nr = clamp(t.row + Math.round((Math.random() - 0.5) * 4), 0, bar.rows - 1);
      const other = tiles[nr * bar.cols + nc].home;
      moveTo(t, { x: other.x, y: other.y, w: t.home.w, h: t.home.h, r: (Math.random() - 0.5) * 0.3 }, t.rnd * 110, 300, ease.inOut);
    }
    await wait(reducedMotion ? 0 : 330);
    // 3. everything collapses into one field, made of those same pieces
    for (const t of tiles) {
      const delay = 40 + centerDist(t) * 420 * (0.7 + 0.3 * t.rnd);
      moveTo(t, t.cell, delay, 760, ease.inOut);
      if (!t.part) fadeTo(t, 0, delay + 80, 520);
    }
    await settled();
    barTarget = 1;
    root.classList.add("is-ready");
    if (payload) showUnlocked();
    else {
      phase = "locked";
      input.hidden = false;
      goBtn.hidden = true;
      input.value = "";
      input.focus();
    }
  }

  async function close() {
    if (phase !== "locked" && phase !== "unlocked") return;
    phase = "closing";
    root.classList.remove("is-ready");
    input.blur();
    barTarget = 0;
    note.textContent = "";
    for (const t of tiles) {
      const delay = (1 - centerDist(t)) * 260 * (0.7 + 0.3 * t.rnd);
      moveTo(t, t.home, delay, 700, ease.inOut);
      if (!t.part) fadeTo(t, 1, delay + 150, 500);
    }
    await settled();
    finish();
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
    shimmerTarget = 1;
    const started = performance.now();
    let result = null, missing = false;
    try { result = await unlock(pw); } catch (err) { missing = err.message === "no vault"; }
    const left = 650 - (performance.now() - started);
    if (left > 0) await wait(left);
    shimmerTarget = 0;
    if (!result) {
      phase = "locked";
      input.value = "";
      shakeAt = performance.now();
      note.textContent = missing ? "NOT AVAILABLE RIGHT NOW" : "WRONG PASSWORD";
      setTimeout(() => { if (phase === "locked") note.textContent = ""; }, 2400);
      input.focus();
      return;
    }
    payload = result;
    showUnlocked();
  }
  function showUnlocked() {
    phase = "unlocked";
    input.value = "";
    input.blur();
    input.hidden = true;
    goBtn.hidden = false;
    goBtn.focus({ preventScroll: true });
    // a wave of light along the field to say yes
    shimmerTarget = 1;
    setTimeout(() => { shimmerTarget = 0; }, 600);
  }

  // ---------------------------------------------------------------- into the private page and back
  async function loadHub() {
    if (hubModule) return;
    const style = document.createElement("style");
    style.textContent = payload.page.css;
    document.head.appendChild(style);
    const url = URL.createObjectURL(new Blob([payload.page.js], { type: "text/javascript" }));
    hubModule = await import(url);
    URL.revokeObjectURL(url);
  }
  const fileCache = new Map();
  async function getFile(id, onProgress) {
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
    if (meta.type && meta.type.startsWith("image/")) fileCache.set(id, blob); // images are reused; downloads are not kept
    return blob;
  }

  async function enter() {
    if (phase !== "unlocked") return;
    phase = "entering";
    root.classList.remove("is-ready");
    barTarget = 0;
    try { await loadHub(); } catch (err) { console.error(err); phase = "unlocked"; root.classList.add("is-ready"); barTarget = 1; return; }
    // the pieces fly back out to fill the screen...
    for (const t of tiles) {
      const delay = centerDist(t) * 200 * (0.6 + 0.4 * t.rnd);
      moveTo(t, t.home, delay, 650, ease.inOut);
      if (!t.part) fadeTo(t, 1, delay + 120, 480);
    }
    await settled();
    // ...the private page is laid in underneath, and the pieces fall away one by one to show it
    hubEl.hidden = false;
    hubInstance = hubModule.mount(hubEl, { data: payload.data, file: getFile, exit: leave });
    seeThrough = true;
    for (const t of tiles) fadeTo(t, 0, (t.rnd * 0.6 + centerDist(t) * 0.4) * 520, 260);
    await settled();
    stopLoop();
    root.hidden = true;
    phase = "hub";
  }

  async function leave() {
    if (phase !== "hub") return;
    phase = "leaving";
    // the pieces of the site fall back into place over the private page...
    root.hidden = false;
    root.classList.remove("is-ready");
    seeThrough = true;
    for (const t of tiles) { t.alpha = 0; t.x = t.home.x; t.y = t.home.y; t.w = t.home.w; t.h = t.home.h; t.r = 0; }
    startLoop();
    for (const t of tiles) fadeTo(t, 1, ((1 - t.rnd) * 0.6 + (1 - centerDist(t)) * 0.4) * 520, 260);
    await settled();
    hubInstance?.unmount?.();
    hubInstance = null;
    hubEl.hidden = true;
    hubEl.innerHTML = "";
    // ...and that's the site again, exactly as it was left
    finish();
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
    // the pieces are cut for one window size: a resize while the field is up just closes it
    if (phase === "locked" || phase === "unlocked") {
      for (const t of tiles) { t.a = null; t.f = null; }
      root.classList.remove("is-ready");
      finish();
    }
  });
}
