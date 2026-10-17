// Finds the release folders and reads their info.json + cover art.

// releases/index.json lists the release folders. GitHub rebuilds it by itself within a minute of
// any change to releases/ (.github/workflows/releases.yml), so it's the only list the site needs.
export const CONFIG = {
  releasesDir: "releases",
};

export const PLATFORMS = {
  spotify: "Spotify",
  apple: "Apple Music",
  youtube: "YouTube",
  youtubemusic: "YouTube Music",
  soundcloud: "SoundCloud",
  tidal: "Tidal",
  deezer: "Deezer",
  bandcamp: "Bandcamp",
  amazon: "Amazon Music",
  tiktok: "TikTok",
  instagram: "Instagram",
};

async function fetchJSON(url, timeoutMs = 6000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-cache" });
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function discoverFolders() {
  const manifest = await fetchJSON(`${CONFIG.releasesDir}/index.json`);
  return [...new Set(manifest.releases || [])].filter((n) => n && !n.startsWith("_") && !n.startsWith("."));
}

// A person (or a list of them), as written in info.json, made safe to use: always a list of
// { name, url? }. Plain text, a single { name, url }, or a list mixing both all work; anything else
// is skipped, so a typo can never break the page.
function people(raw) {
  const list = Array.isArray(raw) ? raw : raw == null || raw === "" ? [] : [raw];
  return list.map((p) => {
    if (typeof p === "string" || typeof p === "number") return { name: String(p).trim() };
    if (p && typeof p === "object") return { name: String(p.name ?? "").trim(), url: typeof p.url === "string" ? p.url : undefined };
    return { name: "" };
  }).filter((p) => p.name);
}

async function loadRelease(folder) {
  const base = `${CONFIG.releasesDir}/${encodeURIComponent(folder)}/`;
  const info = await fetchJSON(`${base}info.json`);
  if (info.hidden) return null;
  const coverCandidates = info.cover
    ? [info.cover]
    : ["cover.jpg", "cover.png", "cover.jpeg", "cover.webp"];
  return {
    slug: folder,
    title: String(info.title || folder).trim(),
    // "artist" can be plain text, one { name, url }, or a list of either, so each name links to the artist
    artists: people(info.artist),
    get artist() { return this.artists.map((a) => a.name).join(", "); },
    type: info.type ? String(info.type) : "",
    date: normalizeDate(info.date),
    description: info.description ? String(info.description) : "",
    credits: (Array.isArray(info.credits) ? info.credits : [info.credits])
      .filter((c) => c && typeof c === "object" && c.role)
      .map((c) => ({ role: String(c.role), people: people(c.people) }))
      .filter((c) => c.people.length),
    links: info.links && typeof info.links === "object" && !Array.isArray(info.links) ? info.links : {},
    // "mine" = an R4N release; "worked-on" = a song R4N worked on for someone else
    category: /^worked/i.test(String(info.category || "")) ? "worked-on" : "mine",
    coverCandidates: coverCandidates.map((c) => base + c),
    coverUrl: null,
    image: null,
  };
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`image ${url}`));
    img.src = url;
  });
}

async function loadCover(rel) {
  for (const url of rel.coverCandidates) {
    try {
      rel.image = await loadImage(url);
      rel.coverUrl = url;
      return;
    } catch { /* try next name */ }
  }
  rel.image = placeholderCover(rel.title);
  rel.coverUrl = rel.image.toDataURL("image/png");
}

function placeholderCover(title) {
  const c = document.createElement("canvas");
  c.width = c.height = 512;
  const g = c.getContext("2d");
  g.fillStyle = "#18181a";
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#e8e8e4";
  g.font = "500 30px ui-monospace, Menlo, monospace";
  g.textAlign = "center";
  g.fillText(title.toUpperCase().slice(0, 24), 256, 266);
  return c;
}

// Newest first (by date), then alphabetical.
function sortReleases(list) {
  return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));
}

// onProgress(done, total) is called as each piece arrives (the list, then each song's info and cover).
export async function loadAllReleases(onProgress = () => {}) {
  const folders = await discoverFolders();
  const total = 1 + folders.length * 2;
  let done = 1;
  onProgress(done, total);
  const tick = () => onProgress(++done, total);
  // each song's cover starts loading the moment its info arrives
  const loaded = await Promise.all(folders.map(async (f) => {
    let rel = null;
    try { rel = await loadRelease(f); } catch (err) { console.warn(`Skipping releases/${f}:`, err.message); }
    tick();
    if (rel) await loadCover(rel);
    tick();
    return rel;
  }));
  return sortReleases(loaded.filter(Boolean));
}

// ---------- text helpers (description supports [text](url), **bold** and new lines) ----------
export function escapeHTML(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
export function safeUrl(u) {
  return /^(https?:|mailto:)/i.test(String(u || "").trim()) ? String(u).trim() : null;
}
export function richText(src) {
  let html = escapeHTML(src);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const ok = safeUrl(url.replace(/&amp;/g, "&"));
    return ok ? `<a href="${escapeHTML(ok)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}
// Dates can be written as YYYY-MM-DD or DD.MM.YYYY; kept internally as YYYY-MM-DD for sorting.
function normalizeDate(raw) {
  const s = String(raw || "").trim();
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return /^\d{4}$/.test(s) ? s : "";
}
// Shown on the site as DD.MM.YYYY
export function formatDate(rel) {
  const m = String(rel.date || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return m ? `${m[3]}.${m[2]}.${m[1]}` : rel.date || "";
}
export function yearOf(rel) {
  return /^\d{4}/.test(rel.date) ? rel.date.slice(0, 4) : "";
}
