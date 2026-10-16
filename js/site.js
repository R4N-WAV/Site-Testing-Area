import * as THREE from "three";
import { loadAllReleases, PLATFORMS, escapeHTML, safeUrl, richText, yearOf } from "./data.js";
import { createShared, buildRecord, SLEEVE } from "./materials.js";

// Mostly black and white; the palette's magenta only as a faint rim light.
const BG = 0x000000;
const MAGENTA = new THREE.Color("#c03fbd");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isPhone = () => window.innerWidth <= 768;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Where the enlarged record sits when a song is open. The info text starts right under it.
function heroLayout() {
  const W = window.innerWidth, H = window.innerHeight;
  const top = isPhone() ? 72 : 88;
  const height = isPhone() ? Math.min(W * 0.78, H * 0.42) : Math.min(H * 0.52, W * 0.5, 540);
  return { top, height: Math.round(height) };
}
function applyHeroLayout() {
  const { top, height } = heroLayout();
  document.documentElement.style.setProperty("--hero-top", `${top}px`);
  document.documentElement.style.setProperty("--hero-h", `${height}px`);
}

function webglAvailable() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext && (c.getContext("webgl2") || c.getContext("webgl")));
  } catch { return false; }
}

// ============================================================
//  MOTION: critically damped springs. Everything that moves eases in
//  and settles without overshoot, at the same speed on any frame rate.
// ============================================================
function spring(state, target, omega, dt) {
  const f = 1 + 2 * dt * omega;
  const oo = omega * omega;
  const hoo = dt * oo;
  const hhoo = dt * hoo;
  const inv = 1 / (f + hhoo);
  const x = (f * state.x + dt * state.v + hhoo * target) * inv;
  state.v = (state.v + hoo * (target - state.x)) * inv;
  state.x = x;
  return x;
}
const springState = (x = 0) => ({ x, v: 0 });

// ============================================================
//  THE SPACE
// ============================================================
function startSpace(releases, ui) {
  const canvas = $("space");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setClearColor(BG, 1);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // "Neutral" keeps cover art colours true while still handling bright reflections
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 100);
  scene.add(camera);

  const shared = createShared(renderer);
  scene.environment = shared.env;

  // ---------- light: near darkness, a soft spotlight on the record in front ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.05));
  const rim = new THREE.DirectionalLight(MAGENTA, 0.3);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xfff8fb, 6.5, 0, 0.2, 0.9, 0);
  spot.position.set(-1.6, 3.2, 4.2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(1024, 1024);
  spot.shadow.bias = -0.0004;
  spot.shadow.normalBias = 0.01;
  spot.shadow.radius = 6;
  scene.add(spot, spot.target);

  // ---------- records ----------
  const items = releases.map((rel, i) => {
    const rec = buildRecord(rel, shared, i);
    const holder = new THREE.Object3D();
    holder.add(rec.group);
    scene.add(holder);
    const seed = i * 2.399;
    return {
      rel, holder, pickables: rec.pickables,
      phase: [seed, seed * 1.7 + 1, seed * 0.6 + 2],
      hover: springState(),
      blend: springState(),
      blendTarget: 0,
      pos: new THREE.Vector3(),
      quat: new THREE.Quaternion(),
    };
  });
  const pickables = items.flatMap((it) => it.pickables);

  // darkness between the row and an enlarged record
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: BG, transparent: true, opacity: 0, depthWrite: false, depthTest: false, toneMapped: false })
  );
  const HERO_DEPTH = 1.6;
  veil.position.z = -3;
  veil.renderOrder = 10;
  camera.add(veil);

  // The opened record is drawn after the veil, so it is never dimmed or cut by it,
  // however it is tilted on its way in or out.
  function setOnTop(it, on) {
    if (it.onTop === on) return;
    it.onTop = on;
    it.holder.traverse((o) => {
      if (!o.isMesh) return;
      if (o.userData.baseOrder === undefined) o.userData.baseOrder = o.renderOrder;
      o.renderOrder = on ? 20 + o.userData.baseOrder : o.userData.baseOrder;
      for (const m of [].concat(o.material)) {
        if (m.userData.wasTransparent === undefined) m.userData.wasTransparent = m.transparent;
        m.transparent = on ? true : m.userData.wasTransparent;
      }
    });
  }

  // the enlarged record gets its own soft spotlight, carried with the camera
  const heroSpot = new THREE.SpotLight(0xfff8fb, 0, 0, 0.6, 0.85, 0);
  heroSpot.position.set(-0.8, 1.2, 0.5);
  const heroTarget = new THREE.Object3D();
  heroTarget.position.set(0, 0, -HERO_DEPTH);
  camera.add(heroSpot, heroTarget);
  heroSpot.target = heroTarget;

  // ---------- camera: straight on, a little above ----------
  function placeCamera() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = camera.aspect < 1 ? 44 : 30;
    camera.updateProjectionMatrix();
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    // the record in front fills ~40% of the height (or ~62% of a phone's width)
    const byHeight = 1 / (2 * tanV * 0.4);
    const byWidth = 1 / (2 * tanV * camera.aspect * 0.62);
    const D = PUSH_FRONT + Math.max(byHeight, camera.aspect < 1 ? byWidth : 0);
    camera.position.set(0, D * 0.07, D);
    camera.lookAt(0, 0, 0);
    camera.updateMatrixWorld();
  }

  // ---------- the push layout ----------
  // The record in focus is pushed toward you; the others step back and to the side,
  // tucking slightly behind it. `focus` glides between records on a spring.
  const PUSH_FRONT = 0.55, PUSH_BACK = -0.5, GAP = 0.98, STEP = 0.8, DEPTH_STEP = 0.32;
  placeCamera();
  function layout(d, out) {
    const a = Math.abs(d), s = Math.sign(d);
    const f = a >= 1 ? 1 : a * a * (3 - 2 * a); // smoothstep between "in front" and "behind"
    const far = Math.max(0, a - 1);
    out.set(
      s * (f * GAP + far * STEP),
      0,
      PUSH_FRONT * (1 - f) + PUSH_BACK * f - far * DEPTH_STEP
    );
    return out;
  }

  let focusIndex = 0;
  const focus = springState(0);
  let hovered = -1;
  let selected = -1;
  const clampIndex = (i) => clamp(i, 0, items.length - 1);
  function focusOn(i) {
    i = clampIndex(i);
    if (i !== focusIndex) {
      focusIndex = i;
      ui.setFocused(items[i].rel);
    }
  }

  // ---------- picking, dragging, scrolling ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.index : -1;
  }

  let drag = null;
  const pxPerRecord = () => Math.min(window.innerWidth, 900) * 0.32;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { x0: e.clientX, y0: e.clientY, last: e.clientX, lastY: e.clientY, t: performance.now(), v: 0, moved: 0, start: focus.x };
    canvas.setPointerCapture?.(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
      drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      if (drag.moved > 6) {
        // sideways drags and up/down swipes both move along the row, following the finger
        const d = Math.abs(dx) >= Math.abs(dy) ? -dx : dy;
        const now = performance.now();
        const stepD = (Math.abs(dx) >= Math.abs(dy) ? -(e.clientX - drag.last) : e.clientY - drag.lastY) / pxPerRecord();
        drag.v = drag.v * 0.6 + (stepD / Math.max(0.008, (now - drag.t) / 1000)) * 0.4;
        drag.last = e.clientX; drag.lastY = e.clientY; drag.t = now;
        focus.x = clamp(drag.start + d / pxPerRecord(), -0.35, items.length - 0.65);
        focus.v = 0;
        hovered = -1;
        document.body.classList.remove("is-hovering");
      }
      return;
    }
    if (e.pointerType !== "touch") {
      hovered = pick(e.clientX, e.clientY);
      document.body.classList.toggle("is-hovering", hovered !== -1);
    }
  });
  canvas.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const wasDrag = drag.moved > 6;
    const v = drag.v;
    drag = null;
    if (wasDrag) {
      // land on the record the flick was heading for
      focusOn(Math.round(focus.x + clamp(v * 0.18, -1.5, 1.5)));
      return;
    }
    const i = pick(e.clientX, e.clientY);
    if (i === -1) return;
    if (i === focusIndex) select(i);
    else focusOn(i);
  });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hovered = -1; document.body.classList.remove("is-hovering"); } });

  // scrolling pushes the next record forward (one record per gesture)
  let wheelAcc = 0, wheelLock = 0;
  window.addEventListener("wheel", (e) => {
    if (selected !== -1 || document.body.classList.contains("index-open")) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
    const now = performance.now();
    if (now < wheelLock) return;
    wheelAcc += delta;
    if (Math.abs(wheelAcc) > 40) {
      focusOn(focusIndex + Math.sign(wheelAcc));
      wheelAcc = 0;
      wheelLock = now + 520; // let one gesture move one record
    }
  }, { passive: true });

  function select(i) {
    selected = i;
    focusOn(i);
    items.forEach((it, k) => { it.blendTarget = k === i ? 1 : 0; });
    hovered = -1;
    heroTilt.x.x = heroTilt.y.x = heroTilt.x.v = heroTilt.y.v = 0;
    document.body.classList.remove("is-hovering");
    ui.showDetail(items[i].rel, i);
  }
  function deselect() {
    selected = -1;
    items.forEach((it) => { it.blendTarget = 0; });
  }

  // ---------- tilting the enlarged record by dragging ----------
  // Follows the pointer on a spring and eases back when let go. The tilt is capped
  // so the back of the sleeve never comes into view.
  const heroTilt = { x: springState(), y: springState() };
  const tiltGoal = new THREE.Vector2();
  let tilting = false;
  const MAX_TILT = 0.85;
  function tiltBy(dx, dy) {
    const k = 2.6 / Math.min(window.innerWidth, 800);
    tiltGoal.x += dx * k;
    tiltGoal.y += dy * k;
    if (tiltGoal.length() > MAX_TILT) tiltGoal.setLength(MAX_TILT);
  }

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeCamera();
  });

  // ---------- per-frame ----------
  const clock = new THREE.Clock();
  const rowPos = new THREE.Vector3();
  const rowQuat = new THREE.Quaternion();
  const heroPos = new THREE.Vector3();
  const heroQuat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const spotAim = new THREE.Vector3(0, 0, PUSH_FRONT);
  let heroScale = 1;
  let veilShown = 0;

  function heroTransform(t) {
    const { top, height } = heroLayout();
    const H = window.innerHeight;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const worldPerPx = (2 * HERO_DEPTH * tanV) / H;
    const cy = top + height / 2 - ui.scrollTop();
    heroPos.set(0, -(cy - H / 2) * worldPerPx, -HERO_DEPTH);
    heroTarget.position.copy(heroPos);
    camera.localToWorld(heroPos);
    heroScale = (height * worldPerPx) / SLEEVE;
    const idle = reducedMotion ? 0 : 1;
    euler.set(
      heroTilt.y.x + Math.sin(t * 0.21) * 0.03 * idle,
      heroTilt.x.x + Math.sin(t * 0.27) * 0.05 * idle,
      Math.sin(t * 0.15) * 0.012 * idle,
      "YXZ"
    );
    heroQuat.copy(camera.quaternion).multiply(q.setFromEuler(euler));
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 1 / 30);
    const t = clock.elapsedTime;
    const open = selected !== -1;

    if (!drag) spring(focus, focusIndex, reducedMotion ? 30 : 6.5, dt);
    if (!tilting) tiltGoal.multiplyScalar(Math.exp(-dt * 3.2));
    spring(heroTilt.x, tiltGoal.x, 9, dt);
    spring(heroTilt.y, tiltGoal.y, 9, dt);

    let veilTarget = 0;
    items.forEach((it, i) => {
      const b = clamp(spring(it.blend, it.blendTarget, reducedMotion ? 30 : 5.2, dt), 0, 1);
      setOnTop(it, it.blendTarget === 1 || b > 0.002);
      veilTarget = Math.max(veilTarget, b);
      const h = spring(it.hover, i === hovered && !open ? 1 : 0, 9, dt);

      // place in the row, pushed forward or back
      layout(i - focus.x, rowPos);
      rowPos.y = Math.sin(t * 0.5 + it.phase[0]) * 0.025;
      rowPos.z += h * 0.12;

      // always facing you, with a slow, slight tilt of its own
      look.lookAt(camera.position, rowPos, up);
      rowQuat.setFromRotationMatrix(look);
      const m = reducedMotion ? 0.25 : 1;
      euler.set(
        Math.sin(t * 0.17 + it.phase[0]) * 0.07 * m,
        Math.sin(t * 0.13 + it.phase[1]) * 0.11 * m,
        Math.sin(t * 0.11 + it.phase[2]) * 0.025 * m,
        "YXZ"
      );
      rowQuat.multiply(q.setFromEuler(euler));

      if (b > 0.0005) {
        heroTransform(t);
        it.holder.position.lerpVectors(rowPos, heroPos, b);
        it.holder.quaternion.slerpQuaternions(rowQuat, heroQuat, b);
        it.holder.scale.setScalar(1 + (heroScale - 1) * b);
      } else {
        it.holder.position.copy(rowPos);
        it.holder.quaternion.copy(rowQuat);
        it.holder.scale.setScalar(1);
      }
      if (i === focusIndex) spotAim.lerp(rowPos, 1 - Math.exp(-dt * 6));
    });

    spot.target.position.copy(spotAim);
    veilShown += (veilTarget - veilShown) * (1 - Math.exp(-dt * 8));
    // the room light goes out quickly when a record opens, so it never cuts across it
    spot.intensity = 6.5 * Math.pow(1 - Math.min(1, veilShown * 2.5), 2);
    heroSpot.intensity = 4 * veilShown;
    veil.material.opacity = veilShown * 0.97;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  ui.setFocused(items[0].rel);

  return {
    select,
    deselect,
    tiltStart() { tilting = true; },
    tiltBy,
    tiltEnd() { tilting = false; },
    nudge(dir) { focusOn(focusIndex + dir); },
    openFocused() { select(focusIndex); },
    // the very first frame, so the loader can wait until the scene is really on screen
    firstFrame: () => new Promise((resolve) => {
      renderer.render(scene, camera);
      requestAnimationFrame(() => { requestAnimationFrame(frame); resolve(); });
    }),
  };
}

// ============================================================
//  INTERFACE
// ============================================================
function buildUI(releases) {
  const detail = $("detail");
  const scroller = $("detailScroll");
  const hero = $("detailHero");
  const indexEl = $("index");
  const indexBtn = $("indexBtn");
  let space = null;
  let current = -1;

  // ---------- index list ----------
  const list = $("indexList");
  if (!releases.length) list.innerHTML = `<li class="index__empty">NOTHING HERE YET</li>`;
  releases.forEach((rel, i) => {
    const li = document.createElement("li");
    li.className = "index__item";
    li.innerHTML = `
      <button type="button">
        <span class="index__num">${String(i + 1).padStart(2, "0")}</span>
        <img src="${escapeHTML(rel.coverUrl)}" alt="" loading="lazy">
        <span><span class="index__title">${escapeHTML(rel.title)}</span>
        <span class="index__sub">${escapeHTML([rel.type, rel.artist].filter(Boolean).join(" · "))}</span></span>
        <span class="index__year">${escapeHTML(yearOf(rel))}</span>
      </button>`;
    li.querySelector("button").addEventListener("click", () => { setIndex(false); open(i); });
    list.appendChild(li);
  });
  function setIndex(show) {
    indexEl.hidden = !show;
    indexBtn.setAttribute("aria-expanded", String(show));
    document.body.classList.toggle("index-open", show);
  }
  indexBtn.addEventListener("click", () => {
    if (current !== -1) close();
    setIndex(indexEl.hidden);
  });

  // ---------- title of the record in front ----------
  const caption = $("caption");
  caption.addEventListener("click", () => space?.openFocused());

  // ---------- detail ----------
  function open(i) {
    if (space) space.select(i);
    else ui.showDetail(releases[i], i);
  }
  function close() {
    if (current === -1) return;
    current = -1;
    space?.deselect();
    detail.classList.remove("is-open");
    detail.setAttribute("aria-hidden", "true");
    document.body.classList.remove("detail-open");
    history.replaceState(null, "", location.pathname + location.search);
  }

  function fill(rel) {
    $("dCover").src = rel.coverUrl;
    $("dCover").alt = `${rel.title} cover art`;
    $("dMeta").textContent = [rel.type, yearOf(rel)].filter(Boolean).join(" · ");
    $("dTitle").textContent = rel.title;
    $("dArtist").textContent = rel.artist;
    $("dDesc").innerHTML = richText(rel.description);

    const credits = $("dCredits");
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
      credits.insertAdjacentHTML("beforeend", `<div><dt>${escapeHTML(String(c.role))}</dt><dd>${people.join(", ")}</dd></div>`);
    }

    const links = $("dLinks");
    links.innerHTML = "";
    for (const [key, val] of Object.entries(rel.links)) {
      const url = safeUrl(val);
      if (!url) continue;
      const name = PLATFORMS[key.toLowerCase()] || key;
      links.insertAdjacentHTML("beforeend",
        `<a class="listen" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer"><span>Listen on ${escapeHTML(name)}</span><span aria-hidden="true">↗</span></a>`);
    }
    const many = releases.length > 1;
    $("dPrev").hidden = !many;
    $("dNext").hidden = !many;
  }

  // drag on the enlarged record to tilt it
  let tiltDrag = null;
  hero.addEventListener("pointerdown", (e) => {
    if (!space || current === -1) return;
    tiltDrag = { x: e.clientX, y: e.clientY };
    hero.setPointerCapture?.(e.pointerId);
    space.tiltStart();
    hero.classList.add("is-tilting");
  });
  hero.addEventListener("pointermove", (e) => {
    if (!tiltDrag) return;
    space.tiltBy(e.clientX - tiltDrag.x, e.clientY - tiltDrag.y);
    tiltDrag = { x: e.clientX, y: e.clientY };
  });
  const endTilt = () => {
    if (!tiltDrag) return;
    tiltDrag = null;
    space.tiltEnd();
    hero.classList.remove("is-tilting");
  };
  hero.addEventListener("pointerup", endTilt);
  hero.addEventListener("pointercancel", endTilt);

  const ui = {
    showDetail(rel, i) {
      current = i;
      fill(rel);
      setIndex(false);
      scroller.scrollTop = 0;
      detail.classList.add("is-open");
      detail.setAttribute("aria-hidden", "false");
      document.body.classList.add("detail-open");
      history.replaceState(null, "", `#${rel.slug}`);
    },
    setFocused(rel) {
      // cross-fade the title
      const title = $("captionTitle");
      clearTimeout(title._t);
      title.classList.add("is-out");
      title._t = setTimeout(() => {
        title.textContent = rel.title;
        title.classList.remove("is-out");
      }, 260);
    },
    scrollTop: () => scroller.scrollTop,
    attach(s) { space = s; },
    openBySlug(slug) {
      const i = releases.findIndex((r) => r.slug === slug);
      if (i !== -1) open(i);
    },
    showIndex: () => setIndex(true),
  };

  const stepDetail = (d) => { if (current !== -1) open((current + d + releases.length) % releases.length); };
  $("detailClose").addEventListener("click", close);
  $("dPrev").addEventListener("click", () => stepDetail(-1));
  $("dNext").addEventListener("click", () => stepDetail(1));
  // clicking the empty space beside the text closes it
  scroller.addEventListener("click", (e) => { if (e.target === scroller) close(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!indexEl.hidden) setIndex(false); else close(); return; }
    if (current !== -1) {
      if (e.key === "ArrowRight") stepDetail(1);
      if (e.key === "ArrowLeft") stepDetail(-1);
      return;
    }
    if (!space || !indexEl.hidden) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") space.nudge(1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") space.nudge(-1);
    if (e.key === "Enter") space.openFocused();
  });

  return ui;
}

// ============================================================
//  LOADER: the whole logo shows dark and brightens as the page loads,
//  then glides to its place in the corner.
// ============================================================
function makeLoader() {
  const logo = $("loaderLogo");
  const startedAt = performance.now();
  let shown = 0;
  const set = (p) => {
    shown = Math.max(shown, p);
    logo.style.setProperty("--p", shown.toFixed(3));
  };
  requestAnimationFrame(() => set(0.15));
  return {
    progress: set,
    async finish() {
      set(1);
      // give the brightening time to finish, so it never feels rushed
      const minTotal = reducedMotion ? 0 : 1900;
      const left = minTotal - (performance.now() - startedAt);
      await wait(Math.max(reducedMotion ? 0 : 900, left));
      const from = logo.getBoundingClientRect();
      const to = $("wordmark").getBoundingClientRect();
      const s = to.width / from.width;
      logo.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`;
      $("loader").classList.add("is-leaving");
      await wait(reducedMotion ? 0 : 1400);
      document.body.classList.add("is-loaded");
      $("loader").classList.add("is-done");
    },
  };
}

// ============================================================
//  GO
// ============================================================
async function main() {
  applyHeroLayout();
  window.addEventListener("resize", applyHeroLayout);
  const loader = makeLoader();

  const releases = await loadAllReleases();
  loader.progress(0.5);
  const ui = buildUI(releases);

  let has3D = false;
  if (webglAvailable() && releases.length) {
    try {
      const space = startSpace(releases, ui);
      loader.progress(0.8);
      await space.firstFrame();
      ui.attach(space);
      has3D = true;
    } catch (err) {
      console.error(err);
    }
  }
  if (!has3D) {
    document.body.classList.add("no3d");
    ui.showIndex();
  }

  await loader.finish();
  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug) ui.openBySlug(slug);
}

main().catch((err) => {
  console.error(err);
  $("loaderNote").textContent = "SIGNAL LOST — TRY RELOADING";
});
