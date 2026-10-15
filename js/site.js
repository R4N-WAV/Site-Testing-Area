import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ============================================================
//  SETTINGS
//  githubRepo: lets the site see new folders in releases/ the moment
//  they're on GitHub, even before releases/index.json is rebuilt.
//  If the site moves to another repo, change this line.
// ============================================================
const CONFIG = {
  githubRepo: "R4N-WAV/Site-Testing-Area",
  branch: "main",
  releasesDir: "releases",
};

const PLATFORMS = {
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

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);

// ============================================================
//  1. FIND THE RELEASES
// ============================================================
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
  const entries = await fetchJSON(url);
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
    artist: info.artist ? String(info.artist) : "",
    type: info.type ? String(info.type) : "",
    date: info.date ? String(info.date) : "",
    description: info.description ? String(info.description) : "",
    credits: Array.isArray(info.credits) ? info.credits : [],
    links: info.links && typeof info.links === "object" ? info.links : {},
    vinyl: /^#[0-9a-f]{6}$/i.test(info.vinyl || "") ? info.vinyl : "#111111",
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
  g.fillStyle = "#151517";
  g.fillRect(0, 0, 512, 512);
  g.fillStyle = "#f2f2f0";
  g.font = "500 34px ui-monospace, Menlo, monospace";
  g.textAlign = "center";
  g.fillText(title.toUpperCase().slice(0, 22), 256, 266);
  return c;
}

// Newest first (by date), then alphabetical.
function sortReleases(list) {
  return list.sort((a, b) => (b.date || "").localeCompare(a.date || "") || a.title.localeCompare(b.title));
}

// ============================================================
//  2. TEXT HELPERS (description supports [text](url), **bold** and new lines)
// ============================================================
function escapeHTML(s) {
  return s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch]));
}
function safeUrl(u) {
  return /^(https?:|mailto:)/i.test(String(u || "").trim()) ? String(u).trim() : null;
}
function richText(src) {
  let html = escapeHTML(src);
  html = html.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, text, url) => {
    const ok = safeUrl(url.replace(/&amp;/g, "&"));
    return ok ? `<a href="${escapeHTML(ok)}" target="_blank" rel="noopener noreferrer">${text}</a>` : text;
  });
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  return html.replace(/\n/g, "<br>");
}
function yearOf(rel) {
  return /^\d{4}/.test(rel.date) ? rel.date.slice(0, 4) : "";
}

// ============================================================
//  3. THE SPACE
// ============================================================
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return (h >>> 0) / 4294967295;
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

function makeStars(count, inner, outer) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const r = inner + Math.random() * (outer - inner);
    const th = Math.random() * Math.PI * 2;
    const ph = Math.acos(2 * Math.random() - 1);
    pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
    pos[i * 3 + 1] = r * Math.cos(ph);
    pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th);
    const b = 0.45 + Math.random() * 0.55;
    const warm = Math.random() < 0.15;
    col[i * 3] = b; col[i * 3 + 1] = b * (warm ? 0.9 : 0.97); col[i * 3 + 2] = b * (warm ? 0.8 : 1);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false });
  return new THREE.Points(geo, mat);
}

function glowTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const g = c.getContext("2d");
  const grd = g.createRadialGradient(128, 128, 0, 128, 128, 128);
  grd.addColorStop(0, "rgba(255,255,255,0.9)");
  grd.addColorStop(0.15, "rgba(255,240,225,0.35)");
  grd.addColorStop(0.5, "rgba(140,120,200,0.06)");
  grd.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = grd;
  g.fillRect(0, 0, 256, 256);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// Record face: grooves in the vinyl colour with the cover art as the centre label.
function recordTexture(image, vinylHex) {
  const S = 1024, R = S / 2;
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  g.fillStyle = vinylHex;
  g.beginPath(); g.arc(R, R, R, 0, Math.PI * 2); g.fill();

  for (let r = R * 0.36; r < R * 0.985; r += 2.2) {
    g.strokeStyle = Math.random() < 0.5 ? "rgba(255,255,255,0.045)" : "rgba(0,0,0,0.35)";
    g.lineWidth = 1;
    g.beginPath(); g.arc(R, R, r, 0, Math.PI * 2); g.stroke();
  }
  // a couple of track gaps
  for (const f of [0.55, 0.74]) {
    g.strokeStyle = "rgba(0,0,0,0.6)"; g.lineWidth = 4;
    g.beginPath(); g.arc(R, R, R * f, 0, Math.PI * 2); g.stroke();
  }
  // light sheen
  if (g.createConicGradient) {
    const sheen = g.createConicGradient(0.6, R, R);
    sheen.addColorStop(0, "rgba(255,255,255,0)");
    sheen.addColorStop(0.08, "rgba(255,255,255,0.13)");
    sheen.addColorStop(0.16, "rgba(255,255,255,0)");
    sheen.addColorStop(0.5, "rgba(255,255,255,0)");
    sheen.addColorStop(0.58, "rgba(255,255,255,0.1)");
    sheen.addColorStop(0.66, "rgba(255,255,255,0)");
    g.fillStyle = sheen;
    g.beginPath(); g.arc(R, R, R * 0.985, 0, Math.PI * 2); g.arc(R, R, R * 0.36, 0, Math.PI * 2, true); g.fill();
  }
  // label = cover art
  const L = R * 0.34;
  g.save();
  g.beginPath(); g.arc(R, R, L, 0, Math.PI * 2); g.clip();
  g.drawImage(image, R - L, R - L, L * 2, L * 2);
  g.restore();
  // spindle hole
  g.fillStyle = "#050506";
  g.beginPath(); g.arc(R, R, R * 0.025, 0, Math.PI * 2); g.fill();

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function startSpace(releases, ui) {
  const canvas = $("space");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x050506);
  scene.fog = new THREE.FogExp2(0x050506, 0.018);

  const camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 400);

  // lights
  scene.add(new THREE.AmbientLight(0xffffff, 0.55));
  const sunLight = new THREE.PointLight(0xfff1e0, 2.2, 0, 0);
  scene.add(sunLight);
  const key = new THREE.DirectionalLight(0xffffff, 1.4);
  key.position.set(4, 6, 8);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x8f88ff, 0.6);
  rim.position.set(-6, -2, -6);
  scene.add(rim);

  // stars + centre glow (the "sun")
  const stars = makeStars(reducedMotion ? 1200 : 2600, 35, 140);
  scene.add(stars);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  glow.scale.setScalar(3.2);
  scene.add(glow);
  const core = new THREE.Mesh(new THREE.SphereGeometry(0.09, 24, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  scene.add(core);

  // shared geometry
  const sleeveGeo = new THREE.BoxGeometry(1, 1, 0.024);
  const recordGeo = new THREE.CylinderGeometry(0.47, 0.47, 0.006, 96, 1);
  const edgeMat = new THREE.MeshStandardMaterial({ color: 0x0c0c0e, roughness: 0.8 });
  const backMat = new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.9 });

  // ---------- build each record as a planet ----------
  const GOLDEN = Math.PI * (3 - Math.sqrt(5));
  const items = releases.map((rel, i) => {
    const r = 2.1 + i * 1.1;
    const h = hash(rel.slug);

    const orbit = new THREE.Group();
    orbit.rotation.set((h - 0.5) * 0.5, h * Math.PI * 2, (hash(rel.slug + "z") - 0.5) * 0.35);
    scene.add(orbit);

    const ringPts = [];
    for (let k = 0; k <= 160; k++) {
      const a = (k / 160) * Math.PI * 2;
      ringPts.push(new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
    }
    const ring = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(ringPts),
      new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.06, depthWrite: false })
    );
    orbit.add(ring);

    const body = new THREE.Group();
    orbit.add(body);
    const pivot = new THREE.Group();
    body.add(pivot);

    const coverTex = new THREE.Texture(rel.image);
    coverTex.colorSpace = THREE.SRGBColorSpace;
    coverTex.anisotropy = 4;
    coverTex.needsUpdate = true;
    // a little self-light so the artwork reads true to colour
    const frontMat = new THREE.MeshStandardMaterial({
      map: coverTex, roughness: 0.55, metalness: 0.0,
      emissive: 0xffffff, emissiveMap: coverTex, emissiveIntensity: 0.35,
    });
    const ownEdge = edgeMat.clone();
    const ownBack = backMat.clone();
    const sleeve = new THREE.Mesh(sleeveGeo, [ownEdge, ownEdge, ownEdge, ownEdge, frontMat, ownBack]);
    pivot.add(sleeve);

    const faceMat = new THREE.MeshStandardMaterial({ map: recordTexture(rel.image, rel.vinyl), roughness: 0.32, metalness: 0.25 });
    const sideMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(rel.vinyl), roughness: 0.4 });
    const record = new THREE.Mesh(recordGeo, [sideMat, faceMat, faceMat]);
    record.rotation.x = Math.PI / 2;
    const recordSlot = new THREE.Group();
    recordSlot.position.set(0.14, 0, 0);
    recordSlot.add(record);
    pivot.add(recordSlot);

    sleeve.userData.index = i;
    record.userData.index = i;

    const label = document.createElement("div");
    label.className = "vlabel";
    label.textContent = rel.title;
    $("labels").appendChild(label);

    const materials = [frontMat, ownEdge, ownBack, faceMat, sideMat];
    materials.forEach((m) => { m.transparent = true; });

    return {
      rel, orbit, ring, body, pivot, record, recordSlot, label, materials, radius: r,
      dim: 1,
      angle: i * GOLDEN * 2.3 + h * 6,
      speed: 0.9 / Math.pow(r, 1.5),
      bob: h * 10,
      hover: 0,
      spin: 0,
    };
  });
  const pickables = items.flatMap((it) => [it.pivot.children[0], it.record]);

  // ---------- camera ----------
  const maxR = items.length ? items[items.length - 1].radius : 3;
  const tanHalf = () => Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  // records are drawn a bit larger on phones, where the whole system is further away
  const baseScale = () => (camera.aspect < 1 ? 1.5 : 1.2);
  // pull back far enough that the whole system fits, on wide and tall screens alike
  function homePosition() {
    const reach = maxR + 0.9 * baseScale();
    const byHeight = reach * 0.75 / tanHalf();
    const byWidth = reach / (tanHalf() * camera.aspect);
    const dist = Math.max(8, byHeight, byWidth) + 1;
    // phones (tall screens) look down more steeply so the orbits use the height
    const tilt = camera.aspect < 1 ? 0.95 : 0.38;
    return new THREE.Vector3(0, tilt, 1).normalize().multiplyScalar(dist);
  }
  const home = { pos: homePosition(), target: new THREE.Vector3(0, 0, 0) };
  camera.position.copy(home.pos);

  const controls = new OrbitControls(camera, canvas);
  controls.target.copy(home.target);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.enablePan = false;
  controls.rotateSpeed = 0.55;
  controls.zoomSpeed = 0.6;
  controls.minDistance = 3;
  controls.maxDistance = Math.max(30, maxR * 5);
  controls.autoRotate = !reducedMotion;
  controls.autoRotateSpeed = 0.25;

  // camera fly-to
  let flight = null;
  function flyTo(pos, target, duration = 1.2) {
    if (reducedMotion) duration = 0.01;
    flight = {
      fromPos: camera.position.clone(), fromTarget: controls.target.clone(),
      toPos: pos.clone(), toTarget: target.clone(),
      t: 0, duration,
    };
  }
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

  // ---------- selection ----------
  let selected = -1;
  let hovered = -1;
  let timeScale = 1;
  let savedView = null;

  function focusItem(i) {
    const it = items[i];
    const world = new THREE.Vector3();
    it.body.getWorldPosition(world);
    const dir = camera.position.clone().sub(world).normalize();
    const desktop = window.innerWidth > 768;
    // close enough to fill the free space, far enough that sleeve + record (~1.6 wide) fit
    const size = baseScale() * 1.18;
    const dist = desktop ? 2.5 * size : Math.max(2.6, (0.82 * size) / (tanHalf() * camera.aspect));
    const camPos = world.clone().add(dir.clone().multiplyScalar(dist));
    // shift the view so the record isn't hidden behind the panel (side on desktop, bottom sheet on phones)
    const right = new THREE.Vector3().crossVectors(dir, camera.up).normalize().negate();
    const up = new THREE.Vector3().crossVectors(right, dir).normalize().negate();
    const shift = desktop ? right.multiplyScalar(0.55 * size) : up.multiplyScalar(-0.6 * dist * tanHalf());
    flyTo(camPos.add(shift), world.clone().add(shift));
  }

  function select(i) {
    if (i === selected) return;
    if (selected === -1) savedView = { pos: camera.position.clone(), target: controls.target.clone() };
    selected = i;
    controls.enabled = false;
    controls.autoRotate = false;
    focusItem(i);
    ui.showPanel(items[i].rel, i);
  }

  function deselect() {
    if (selected === -1) return;
    selected = -1;
    const back = savedView || home;
    flyTo(back.pos, back.target, 1.0);
    controls.enabled = true;
    controls.autoRotate = !reducedMotion;
    ui.hidePanel();
  }

  // ---------- pointer ----------
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  let downAt = null;

  function pick(clientX, clientY) {
    pointer.set((clientX / window.innerWidth) * 2 - 1, -(clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.index : -1;
  }

  canvas.addEventListener("pointermove", (e) => {
    if (e.pointerType === "touch") return;
    hovered = pick(e.clientX, e.clientY);
    document.body.classList.toggle("is-hovering", hovered !== -1);
  });
  canvas.addEventListener("pointerleave", () => { hovered = -1; document.body.classList.remove("is-hovering"); });
  canvas.addEventListener("pointerdown", (e) => { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  canvas.addEventListener("pointerup", (e) => {
    if (!downAt) return;
    const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y);
    const quick = performance.now() - downAt.t < 500;
    downAt = null;
    if (moved > 6 || !quick) return;
    const i = pick(e.clientX, e.clientY);
    if (i !== -1) select(i);
    else if (selected !== -1) deselect();
  });
  canvas.addEventListener("pointerdown", () => ui.dismissHint(), { once: true });

  // ---------- resize ----------
  function onResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    home.pos.copy(homePosition());
    if (selected !== -1) focusItem(selected);
  }
  window.addEventListener("resize", onResize);

  // ---------- loop ----------
  const clock = new THREE.Clock();
  const tmp = new THREE.Vector3();
  const motion = reducedMotion ? 0.2 : 1;

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    const wantScale = selected !== -1 ? 0 : hovered !== -1 ? 0.15 : 1;
    timeScale += (wantScale - timeScale) * Math.min(1, dt * 3);

    if (flight) {
      flight.t = Math.min(1, flight.t + dt / flight.duration);
      const k = ease(flight.t);
      camera.position.lerpVectors(flight.fromPos, flight.toPos, k);
      controls.target.lerpVectors(flight.fromTarget, flight.toTarget, k);
      if (flight.t >= 1) flight = null;
    }
    controls.update();

    stars.rotation.y += dt * 0.004 * motion;
    glow.material.opacity = 0.85 + Math.sin(t * 1.3) * 0.08;

    items.forEach((it, i) => {
      it.angle += it.speed * dt * timeScale * motion;
      it.body.position.set(Math.cos(it.angle) * it.radius, Math.sin(t * 0.7 + it.bob) * 0.12 * motion, Math.sin(it.angle) * it.radius);

      const active = i === hovered || i === selected;
      it.hover += ((active ? 1 : 0) - it.hover) * Math.min(1, dt * 6);

      // face the camera, with a slight lazy tilt
      it.pivot.lookAt(camera.position);
      const wobble = (1 - it.hover) * motion;
      it.pivot.rotateY(Math.sin(t * 0.5 + it.bob) * 0.22 * wobble);
      it.pivot.rotateX(Math.cos(t * 0.4 + it.bob) * 0.1 * wobble);
      it.pivot.scale.setScalar(baseScale() * (1 + it.hover * 0.18));

      it.recordSlot.position.x = 0.14 + it.hover * 0.4;
      it.spin += dt * (0.35 + it.hover * 3.2) * (reducedMotion ? 0.3 : 1);
      it.record.rotation.y = -it.spin;

      // fade the other records while one is open
      const wantDim = selected === -1 || i === selected ? 1 : 0.06;
      it.dim += (wantDim - it.dim) * Math.min(1, dt * 4);
      for (const m of it.materials) m.opacity = it.dim;
      const ringOn = selected === -1 ? 1 : 0;
      it.ring.material.opacity += ((0.05 + it.hover * 0.12) * ringOn - it.ring.material.opacity) * Math.min(1, dt * 4);

      // floating title under the record
      it.body.getWorldPosition(tmp);
      const d = camera.position.distanceTo(tmp);
      tmp.y -= 0.72 * baseScale() * (1 + it.hover * 0.18);
      tmp.project(camera);
      const visible = tmp.z < 1 && Math.abs(tmp.x) < 1.2 && Math.abs(tmp.y) < 1.2;
      if (visible) {
        const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
        const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
        it.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
        it.label.style.opacity = String(Math.max(0.3, Math.min(1, (home.pos.length() * 1.05) / d)));
      } else {
        it.label.style.opacity = "0";
      }
      it.label.classList.toggle("is-hot", active);
    });

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { select, deselect, get selected() { return selected; }, count: items.length };
}

// ============================================================
//  4. INTERFACE
// ============================================================
function buildUI(releases) {
  const panel = $("panel");
  const indexEl = $("index");
  const indexBtn = $("indexBtn");
  let space = null;
  let current = -1;

  // index list
  const list = $("indexList");
  if (!releases.length) {
    list.innerHTML = `<li class="index__empty">NOTHING IN ORBIT YET</li>`;
  }
  releases.forEach((rel, i) => {
    const li = document.createElement("li");
    li.className = "index__item";
    li.innerHTML = `
      <button type="button">
        <img src="${escapeHTML(rel.coverUrl)}" alt="" loading="lazy">
        <span><span class="index__title">${escapeHTML(rel.title)}</span>
        <span class="index__sub" style="display:block">${escapeHTML([rel.type, rel.artist].filter(Boolean).join(" · "))}</span></span>
        <span class="index__year">${escapeHTML(yearOf(rel))}</span>
      </button>`;
    li.querySelector("button").addEventListener("click", () => {
      if (space) setIndex(false);
      open(i);
    });
    list.appendChild(li);
  });

  function setIndex(show) {
    indexEl.hidden = !show;
    indexBtn.setAttribute("aria-expanded", String(show));
  }
  indexBtn.addEventListener("click", () => setIndex(indexEl.hidden));

  function open(i) {
    if (space) space.select(i);
    else ui.showPanel(releases[i], i);
  }

  function close() {
    if (space) space.deselect();
    else ui.hidePanel();
  }

  function fill(rel) {
    $("pCover").src = rel.coverUrl;
    $("pCover").alt = `${rel.title} cover art`;
    $("pMeta").textContent = [rel.type, yearOf(rel)].filter(Boolean).join(" · ");
    $("pTitle").textContent = rel.title;
    $("pArtist").textContent = rel.artist;
    $("pDesc").innerHTML = richText(rel.description);

    const credits = $("pCredits");
    credits.innerHTML = "";
    for (const c of rel.credits) {
      if (!c || !c.role) continue;
      const people = (Array.isArray(c.people) ? c.people : []).map((p) => {
        if (typeof p === "string") return escapeHTML(p);
        const url = safeUrl(p.url);
        const name = escapeHTML(String(p.name || ""));
        return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name;
      });
      if (!people.length) continue;
      credits.insertAdjacentHTML("beforeend", `<dt>${escapeHTML(String(c.role))}</dt><dd>${people.join(", ")}</dd>`);
    }

    const links = $("pLinks");
    links.innerHTML = "";
    for (const [key, val] of Object.entries(rel.links)) {
      const url = safeUrl(val);
      if (!url) continue;
      const name = PLATFORMS[key.toLowerCase()] || key;
      links.insertAdjacentHTML("beforeend",
        `<a class="listen" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><span>Listen on ${escapeHTML(name)}</span><span aria-hidden="true">↗</span></a>`);
    }

    const showNav = releases.length > 1;
    $("pPrev").hidden = !showNav;
    $("pNext").hidden = !showNav;
  }

  const ui = {
    showPanel(rel, i) {
      current = i;
      fill(rel);
      panel.classList.add("is-open");
      panel.setAttribute("aria-hidden", "false");
      document.body.classList.add("panel-open");
      panel.querySelector(".panel__scroll").scrollTop = 0;
      history.replaceState(null, "", `#${rel.slug}`);
      ui.dismissHint();
    },
    hidePanel() {
      current = -1;
      panel.classList.remove("is-open");
      panel.setAttribute("aria-hidden", "true");
      document.body.classList.remove("panel-open");
      history.replaceState(null, "", location.pathname + location.search);
    },
    dismissHint() { $("hint").style.opacity = "0"; },
    attach(s) { space = s; },
    openBySlug(slug) {
      const i = releases.findIndex((r) => r.slug === slug);
      if (i !== -1) open(i);
    },
    showIndex: () => setIndex(true),
  };

  const step = (d) => { if (current !== -1) open((current + d + releases.length) % releases.length); };
  $("panelClose").addEventListener("click", close);
  $("pPrev").addEventListener("click", () => step(-1));
  $("pNext").addEventListener("click", () => step(1));
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!indexEl.hidden) setIndex(false); else close(); }
    if (current !== -1 && e.key === "ArrowRight") step(1);
    if (current !== -1 && e.key === "ArrowLeft") step(-1);
  });

  return ui;
}

// ============================================================
//  5. GO
// ============================================================
async function main() {
  const folders = await discoverFolders();
  const loaded = await Promise.all(folders.map((f) => loadRelease(f).catch((err) => {
    console.warn(`Skipping releases/${f}:`, err.message);
    return null;
  })));
  const releases = sortReleases(loaded.filter(Boolean));
  await Promise.all(releases.map(loadCover));

  const ui = buildUI(releases);
  if (webglAvailable()) {
    try {
      ui.attach(startSpace(releases, ui));
    } catch (err) {
      console.error(err);
      ui.showIndex();
    }
  } else {
    ui.showIndex();
  }

  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug) setTimeout(() => ui.openBySlug(slug), 400);
  $("loader").classList.add("is-done");
}

main().catch((err) => {
  console.error(err);
  $("loaderText").textContent = "SIGNAL LOST — TRY RELOADING";
});
