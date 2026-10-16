// The private page. This file is sealed into vault/hub.bin by scripts/vault.mjs, together with
// the content it shows; the live site only ever receives it encrypted.
//
// A rack: every plugin is one unit with screwed-on ears. The open unit shows the plugin's own
// panel, what it does, its controls, how to install it, and the download. Each plugin brings its
// own accent colour and (optionally) its own typeface for its name. An empty blank plate at the
// bottom leaves room for the next one.

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const GLYPHS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/%+";

// letters settle out of noise, once, when the page opens
function decode(el, text, delay = 0) {
  if (reducedMotion) { el.textContent = text; return; }
  const start = performance.now() + delay;
  const dur = 650;
  const tick = (now) => {
    const k = (now - start) / dur;
    if (k >= 1) { el.textContent = text; return; }
    el.textContent = [...text].map((ch, i) => {
      if (ch === " " || k * text.length > i + 1.5) return ch;
      return k < 0 ? " " : GLYPHS[(Math.random() * GLYPHS.length) | 0];
    }).join("");
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

function screws() {
  return `<span class="hubUnit__screw" aria-hidden="true"></span><span class="hubUnit__screw" aria-hidden="true"></span>`;
}

export function mount(root, api) {
  const plugins = api.data.plugins || [];
  const urls = []; // object URLs to free on the way out
  let openId = plugins[0]?.id;
  let lightbox = null;

  root.innerHTML = `
    <div class="hubPage">
      <header class="hubTop">
        <p class="hubTop__title">PLUGINS<sup>${String(plugins.length).padStart(2, "0")}</sup></p>
        <button class="hubTop__exit" type="button">EXIT</button>
      </header>
      <main class="hubRack">
        ${plugins.map((p) => `
          <section class="hubUnit" data-id="${esc(p.id)}" style="--accent:${esc(p.accent || "#111112")};--lamp:${esc(p.lamp || p.accent || "#111112")}">
            <div class="hubUnit__ear hubUnit__ear--l">${screws()}</div>
            <div class="hubUnit__face">
              <button class="hubUnit__head" type="button" aria-expanded="false">
                <span class="hubUnit__lamp" aria-hidden="true"></span>
                <span class="hubUnit__name" data-name="${esc(p.name)}">${esc(p.name)}</span>
                ${p.script ? `<span class="hubUnit__script" lang="${esc(p.scriptLang || "")}">${esc(p.script)}</span>` : ""}
                <span class="hubUnit__summary">${esc(p.summary)}</span>
                <span class="hubUnit__version">${esc(p.version || "")}</span>
              </button>
              <div class="hubUnit__body">
                <div class="hubUnit__inner">
                  ${p.shots?.length ? `
                    <figure class="hubShot">
                      <button class="hubShot__main" type="button" aria-label="View larger">
                        <img alt="${esc(p.shots[0].caption || p.name)}" width="${p.shots[0].w || ""}" height="${p.shots[0].h || ""}">
                      </button>
                      ${p.shots.length > 1 ? `<div class="hubShot__thumbs">${p.shots.map((s, i) => `
                        <button class="hubShot__thumb${i === 0 ? " is-on" : ""}" type="button" data-shot="${i}" aria-label="${esc(s.caption || `Screenshot ${i + 1}`)}"><img alt=""></button>`).join("")}
                      </div>` : ""}
                      <figcaption class="hubShot__caption">${esc(p.shots[0].caption || "")}</figcaption>
                    </figure>` : ""}
                  <div class="hubDownloads">
                    ${(p.downloads || []).map((d) => `
                      <button class="hubDl" type="button" data-file="${esc(d.file)}" data-filename="${esc(d.filename)}">
                        <span class="hubDl__fill" aria-hidden="true"></span>
                        <span class="hubDl__label">${esc(d.label)}</span>
                        <span class="hubDl__meta">${esc(d.meta || "")}</span>
                      </button>`).join("") || `<p class="hubText hubText--quiet">No download yet.</p>`}
                  </div>
                  <div class="hubCols">
                    <div class="hubCol">
                      ${(p.about || []).map((t) => `<p class="hubText">${esc(t)}</p>`).join("")}
                      ${p.install?.length ? `
                        <h3 class="hubHead">Install</h3>
                        <ol class="hubSteps">${p.install.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>` : ""}
                    </div>
                    <div class="hubCol">
                      ${p.controls?.length ? `
                        <h3 class="hubHead">Controls</h3>
                        <dl class="hubList">${p.controls.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
                      ${p.specs?.length ? `
                        <dl class="hubList hubList--specs">${p.specs.map(([k, v]) => `<div><dt>${esc(k)}</dt><dd>${esc(v)}</dd></div>`).join("")}</dl>` : ""}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            <div class="hubUnit__ear hubUnit__ear--r">${screws()}</div>
          </section>`).join("")}
        <div class="hubUnit hubUnit--blank" aria-hidden="true">
          <div class="hubUnit__ear hubUnit__ear--l">${screws()}</div>
          <div class="hubUnit__face"></div>
          <div class="hubUnit__ear hubUnit__ear--r">${screws()}</div>
        </div>
      </main>
    </div>`;

  // ---------- each plugin's name in its own typeface ----------
  for (const p of plugins) {
    if (!p.font) continue;
    api.file(p.font).then(async (blob) => {
      const face = new FontFace(`hubName-${p.id}`, await blob.arrayBuffer());
      await face.load();
      document.fonts.add(face);
      root.querySelector(`.hubUnit[data-id="${CSS.escape(p.id)}"] .hubUnit__name`)?.style.setProperty("font-family", `"hubName-${p.id}", var(--hub-condensed)`);
    }).catch(() => {});
  }

  // ---------- screenshots ----------
  const shotUrl = new Map();
  async function imageUrl(fileId) {
    if (!shotUrl.has(fileId)) {
      shotUrl.set(fileId, api.file(fileId).then((blob) => { const u = URL.createObjectURL(blob); urls.push(u); return u; }));
    }
    return shotUrl.get(fileId);
  }
  for (const p of plugins) {
    const unit = root.querySelector(`.hubUnit[data-id="${CSS.escape(p.id)}"]`);
    if (!unit || !p.shots?.length) continue;
    const main = unit.querySelector(".hubShot__main img");
    const caption = unit.querySelector(".hubShot__caption");
    let current = 0;
    const show = async (i) => {
      current = i;
      main.classList.add("is-loading");
      main.src = await imageUrl(p.shots[i].file);
      main.onload = () => main.classList.remove("is-loading");
      caption.textContent = p.shots[i].caption || "";
      unit.querySelectorAll(".hubShot__thumb").forEach((b, k) => b.classList.toggle("is-on", k === i));
    };
    show(0);
    unit.querySelectorAll(".hubShot__thumb").forEach((b) => {
      const i = Number(b.dataset.shot);
      imageUrl(p.shots[i].file).then((u) => { b.querySelector("img").src = u; });
      b.addEventListener("click", () => show(i));
    });
    unit.querySelector(".hubShot__main").addEventListener("click", () => openLightbox(p, current));
    // the panel leans a little toward the pointer, like turning a real unit to the light
    const fig = unit.querySelector(".hubShot__main");
    fig.addEventListener("pointermove", (e) => {
      if (reducedMotion) return;
      const r = fig.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
      fig.style.setProperty("--rx", `${(-y * 3).toFixed(2)}deg`);
      fig.style.setProperty("--ry", `${(x * 4).toFixed(2)}deg`);
      fig.style.setProperty("--gx", `${((x + 0.5) * 100).toFixed(1)}%`);
    });
    fig.addEventListener("pointerleave", () => { fig.style.setProperty("--rx", "0deg"); fig.style.setProperty("--ry", "0deg"); });
  }

  function openLightbox(p, i) {
    closeLightbox();
    const box = document.createElement("div");
    box.className = "hubBox";
    box.innerHTML = `
      <img class="hubBox__img" alt="">
      <p class="hubBox__caption"></p>
      <button class="hubBox__close" type="button">CLOSE</button>`;
    root.appendChild(box);
    lightbox = { box, p, i };
    const img = box.querySelector(".hubBox__img");
    const set = async (k) => {
      lightbox.i = (k + p.shots.length) % p.shots.length;
      img.src = await imageUrl(p.shots[lightbox.i].file);
      box.querySelector(".hubBox__caption").textContent = `${p.shots[lightbox.i].caption || ""}${p.shots.length > 1 ? `   ${lightbox.i + 1}/${p.shots.length}` : ""}`;
    };
    lightbox.step = (d) => set(lightbox.i + d);
    set(i);
    box.addEventListener("click", (e) => { if (e.target !== img || p.shots.length < 2) closeLightbox(); else lightbox.step(1); });
    requestAnimationFrame(() => box.classList.add("is-on"));
  }
  function closeLightbox() {
    if (!lightbox) return;
    const { box } = lightbox;
    lightbox = null;
    box.classList.remove("is-on");
    setTimeout(() => box.remove(), 350);
  }

  // ---------- opening a unit (with more than one plugin, one is open at a time) ----------
  function setOpen(id) {
    openId = id;
    root.querySelectorAll(".hubUnit[data-id]").forEach((u) => {
      const on = u.dataset.id === id;
      u.classList.toggle("is-open", on);
      u.querySelector(".hubUnit__head").setAttribute("aria-expanded", String(on));
    });
  }
  root.querySelectorAll(".hubUnit[data-id] .hubUnit__head").forEach((h) => {
    h.addEventListener("click", () => {
      const id = h.closest(".hubUnit").dataset.id;
      setOpen(openId === id && plugins.length > 1 ? null : id);
    });
  });
  setOpen(openId);

  // ---------- downloads: fetched, decrypted here in the browser, then saved ----------
  root.querySelectorAll(".hubDl").forEach((b) => {
    const label = b.querySelector(".hubDl__label");
    const meta = b.querySelector(".hubDl__meta");
    const original = [label.textContent, meta.textContent];
    let busy = false;
    b.addEventListener("click", async () => {
      if (busy) return;
      busy = true;
      b.classList.add("is-busy");
      label.textContent = "Downloading";
      try {
        const blob = await api.file(b.dataset.file, (k) => {
          b.style.setProperty("--p", k.toFixed(3));
          meta.textContent = `${Math.round(k * 100)} %`;
        });
        const u = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = u; a.download = b.dataset.filename || "download";
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(u), 60_000);
        label.textContent = "Saved";
        meta.textContent = b.dataset.filename || "";
      } catch {
        label.textContent = "Download failed";
        meta.textContent = "Try again";
      }
      setTimeout(() => {
        b.classList.remove("is-busy");
        b.style.setProperty("--p", "0");
        [label.textContent, meta.textContent] = original;
        busy = false;
      }, 2600);
    });
  });

  // ---------- keys ----------
  const onKey = (e) => {
    if (lightbox) {
      if (e.key === "Escape") closeLightbox();
      if (e.key === "ArrowRight") lightbox.step(1);
      if (e.key === "ArrowLeft") lightbox.step(-1);
      return;
    }
    if (e.key === "Escape") { e.preventDefault(); api.exit(); }
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && plugins.length > 1) {
      e.preventDefault();
      const i = Math.max(0, plugins.findIndex((p) => p.id === openId));
      const next = plugins[(i + (e.key === "ArrowDown" ? 1 : -1) + plugins.length) % plugins.length];
      setOpen(next.id);
      root.querySelector(`.hubUnit[data-id="${CSS.escape(next.id)}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };
  window.addEventListener("keydown", onKey);
  root.querySelector(".hubTop__exit").addEventListener("click", () => api.exit());

  // ---------- the one moment: names settle out of noise ----------
  root.querySelectorAll(".hubUnit__name").forEach((el, i) => decode(el, el.dataset.name, 250 + i * 120));
  root.scrollTop = 0;

  return {
    unmount() {
      window.removeEventListener("keydown", onKey);
      urls.forEach((u) => URL.revokeObjectURL(u));
      root.innerHTML = "";
    },
  };
}
