// Finds the release folders and reads their info.json + cover art.

// githubRepo lets the site see new folders in releases/ the moment they're on
// GitHub, even before releases/index.json is rebuilt. If the site moves to
// another repo, change this line.
export const CONFIG = {
  githubRepo: "R4N-WAV/Site-Testing-Area",
  branch: "main",
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

function storageGet(key) {
  try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; }
}
function storageSet(key, val) {
  try { sessionStorage.setItem(key, JSON.stringify(val)); } catch { /* private mode etc. */ }
}

// Folder names straight from GitHub, so a newly added folder shows up without a rebuild.
// Cached for 10 minutes per visitor to stay well inside GitHub's rate limit.
async function listFoldersOnGitHub() {
  if (!CONFIG.githubRepo || location.protocol === "file:") return [];
  const cacheKey = `r4n:folders:${CONFIG.githubRepo}`;
  const cached = storageGet(cacheKey);
  if (cached && Date.now() - cached.at < 10 * 60 * 1000) return cached.names;
  const url = `https://api.github.com/repos/${CONFIG.githubRepo}/contents/${CONFIG.releasesDir}?ref=${CONFIG.branch}`;
  const entries = await fetchJSON(url, 2500); // only an extra: index.json already lists every folder
  const names = entries.filter((e) => e.type === "dir").map((e) => e.name);
  storageSet(cacheKey, { at: Date.now(), names });
  return names;
}

async function discoverFolders() {
  const found = new Set();
  const [manifest, live] = await Promise.allSettled([
    fetchJSON(`${CONFIG.releasesDir}/index.json`),
    listFoldersOnGitHub(),
  ]);
  if (manifest.status === "fulfilled") (manifest.value.releases || []).forEach((n) => found.add(n));
  if (live.status === "fulfilled") live.value.forEach((n) => found.add(n));
  return [...found].filter((n) => n && !n.startsWith("_") && !n.startsWith("."));
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

export async function loadAllReleases() {
  const folders = await discoverFolders();
  const loaded = await Promise.all(folders.map((f) => loadRelease(f).catch((err) => {
    console.warn(`Skipping releases/${f}:`, err.message);
    return null;
  })));
  const releases = sortReleases(loaded.filter(Boolean));
  await Promise.all(releases.map(loadCover));
  return releases;
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
