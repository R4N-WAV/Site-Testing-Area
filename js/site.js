import * as THREE from "three";
import { loadAllReleases, PLATFORMS, escapeHTML, safeUrl, richText, yearOf } from "./data.js";
import { createShared, buildRecord, SLEEVE } from "./materials.js";

// Mostly black and white; the palette's magenta only as a faint rim light.
const BG = 0x000000;
const MAGENTA = new THREE.Color("#c03fbd");

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const isPhone = () => window.innerWidth <= 768;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
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

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
  scene.add(camera);

  const shared = createShared(renderer);
  scene.environment = shared.env;

  // ---------- ring layout (same perspective as before) ----------
  const n = releases.length;
  const R = Math.max(3.0, (n * 1.55) / (Math.PI * 2));
  const step = (Math.PI * 2) / Math.max(1, n);

  // ---------- light: near darkness, one spotlight on the record at the front ----------
  scene.add(new THREE.AmbientLight(0xffffff, 0.09));
  const rim = new THREE.DirectionalLight(MAGENTA, 0.35);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xfff6fa, 7, 0, 0.3, 0.75, 0);
  spot.position.set(-0.6, 4.6, R + 2.6);
  spot.target.position.set(0, 0, R);
  scene.add(spot, spot.target);

  // faint dust for depth
  const dustCount = reducedMotion ? 150 : 380;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * R * 6;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 7;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * R * 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.012, transparent: true, opacity: 0.16, depthWrite: false,
  }));
  scene.add(dust);

  // ---------- records ----------
  const items = releases.map((rel, i) => {
    const rec = buildRecord(rel, shared, i);
    const holder = new THREE.Object3D();
    holder.add(rec.group);
    scene.add(holder);
    const seed = i * 2.399;
    return {
      rel, holder, pickables: rec.pickables,
      slot: i * step,
      // each record drifts on its own slow, cinematic tilt
      phase: [seed, seed * 1.7 + 1, seed * 0.6 + 2],
      speed: [0.21 + (i % 3) * 0.03, 0.17 + (i % 2) * 0.04, 0.13],
      hover: 0,
      blend: 0,
      blendTarget: 0,
    };
  });
  const pickables = items.flatMap((it) => it.pickables);

  // darkness between the ring and an enlarged record
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: BG, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  const HERO_DEPTH = 1.6;
  veil.position.z = -(HERO_DEPTH + 0.5);
  veil.renderOrder = 10;
  camera.add(veil);

  // the enlarged record gets its own spotlight, carried with the camera
  const heroSpot = new THREE.SpotLight(0xfff6fa, 0, 0, 0.55, 0.7, 0);
  heroSpot.position.set(-0.7, 1.3, 0.4);
  const heroTarget = new THREE.Object3D();
  heroTarget.position.set(0, 0, -HERO_DEPTH);
  camera.add(heroSpot, heroTarget);
  heroSpot.target = heroTarget;

  // ---------- camera ----------
  function placeCamera() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = camera.aspect < 1 ? 52 : 38;
    camera.updateProjectionMatrix();
    const tanH = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * camera.aspect;
    const D = camera.aspect < 1 ? R + 4.2 : Math.max(R + 3.2, (R + 0.7) / tanH);
    camera.position.set(0, D * 0.15, D);
    camera.lookAt(0, -0.42, 0);
    camera.updateMatrixWorld();
  }
  placeCamera();

  // ---------- carousel physics ----------
  // rot = ring angle, vel = angular velocity. Drag, swipe, scroll and arrow keys all
  // push it; it coasts and loses energy, then settles with a record at the front.
  let rot = 0;
  let vel = 0;
  let focused = 0;
  let hovered = -1;
  let selected = -1;
  const FRICTION = 0.75;   // lower = keeps spinning longer
  const SNAP_BELOW = 0.45; // start settling below this speed (rad/s)

  const nearestSlotRot = (r) => Math.round(r / step) * step;
  let goal = null; // set by arrow keys: a specific ring angle to glide to
  function spinTo(index) {
    // the shortest way round to put this record at the front
    goal = rot + wrapAngle(-items[index].slot - rot);
  }

  // ---------- picking & dragging ----------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function pick(x, y) {
    ndc.set((x / window.innerWidth) * 2 - 1, -(y / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const hit = raycaster.intersectObjects(pickables, false)[0];
    return hit ? hit.object.userData.index : -1;
  }

  let drag = null;
  const spinPerPx = () => (Math.PI * 1.0) / Math.min(window.innerWidth, 900);
  canvas.addEventListener("pointerdown", (e) => {
    drag = { lastX: e.clientX, lastY: e.clientY, lastT: performance.now(), moved: 0 };
    goal = null;
    canvas.setPointerCapture?.(e.pointerId);
    ui.dismissHint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      // sideways drags and up/down swipes both turn the ring
      const dx = e.clientX - drag.lastX;
      const dy = e.clientY - drag.lastY;
      const d = Math.abs(dx) >= Math.abs(dy) ? dx : -dy;
      const now = performance.now();
      const dt = Math.max(8, now - drag.lastT) / 1000;
      rot += d * spinPerPx();
      vel = vel * 0.5 + ((d * spinPerPx()) / dt) * 0.5;
      drag.moved += Math.hypot(dx, dy);
      drag.lastX = e.clientX; drag.lastY = e.clientY; drag.lastT = now;
      if (drag.moved > 6) { hovered = -1; document.body.classList.remove("is-hovering"); }
      return;
    }
    if (e.pointerType !== "touch") {
      hovered = pick(e.clientX, e.clientY);
      document.body.classList.toggle("is-hovering", hovered !== -1);
    }
  });
  const endDrag = (e) => {
    if (!drag) return;
    const wasClick = drag.moved < 6;
    if (performance.now() - drag.lastT > 90) vel *= 0.2; // held still before letting go
    drag = null;
    if (wasClick) {
      const i = pick(e.clientX, e.clientY);
      if (i !== -1) select(i);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hovered = -1; document.body.classList.remove("is-hovering"); } });
  // scrolling down spins the ring further
  window.addEventListener("wheel", (e) => {
    if (selected !== -1 || document.body.classList.contains("index-open")) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY + e.deltaX;
    vel = clamp(vel - delta * 0.0022, -6, 6);
    goal = null;
    ui.dismissHint();
  }, { passive: true });

  function select(i) {
    selected = i;
    items.forEach((it, k) => { it.blendTarget = k === i ? 1 : 0; });
    hovered = -1;
    heroTilt.set(0, 0); heroTiltVel.set(0, 0);
    document.body.classList.remove("is-hovering");
    ui.showDetail(items[i].rel, i);
  }
  function deselect() {
    selected = -1;
    items.forEach((it) => { it.blendTarget = 0; });
  }

  // ---------- tilting the enlarged record by dragging ----------
  // Spring physics; total tilt is capped so the back never comes into view.
  const heroTilt = new THREE.Vector2();     // x = turn left/right, y = tip up/down (radians)
  const heroTiltVel = new THREE.Vector2();
  let tilting = false;
  const MAX_TILT = 0.95;
  function capTilt() {
    const m = heroTilt.length();
    if (m > MAX_TILT) heroTilt.multiplyScalar(MAX_TILT / m);
  }
  function tiltBy(dx, dy) {
    const k = 3.2 / Math.min(window.innerWidth, 800);
    heroTilt.x += dx * k;
    heroTilt.y += dy * k;
    capTilt();
    heroTiltVel.set(dx * k * 40, dy * k * 40);
  }

  window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    placeCamera();
  });

  // ---------- per-frame ----------
  const clock = new THREE.Clock();
  const ringPos = new THREE.Vector3();
  const ringQuat = new THREE.Quaternion();
  const heroPos = new THREE.Vector3();
  const heroQuat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  let heroScale = 1;

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
      heroTilt.y + Math.sin(t * 0.27) * 0.04 * idle,
      heroTilt.x + Math.sin(t * 0.35) * 0.07 * idle,
      Math.sin(t * 0.19) * 0.02 * idle,
      "YXZ"
    );
    heroQuat.copy(camera.quaternion).multiply(q.setFromEuler(euler));
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const open = selected !== -1;

    // carousel
    if (!drag && goal !== null) {
      vel += ((goal - rot) * 9 - vel * 6) * dt;
      rot += vel * dt;
      if (Math.abs(goal - rot) < 1e-3 && Math.abs(vel) < 0.01) { rot = goal; vel = 0; goal = null; }
    } else if (!drag) {
      rot += vel * dt;
      vel *= Math.exp(-dt * FRICTION);
      if (Math.abs(vel) < SNAP_BELOW) {
        const diff = nearestSlotRot(rot) - rot;
        vel += (diff * 10 - vel * 4.2) * dt; // gentle spring into place
        if (Math.abs(diff) < 1e-4 && Math.abs(vel) < 1e-3) { rot += diff; vel = 0; }
      }
    }

    // hero tilt spring (back to rest when not being dragged)
    if (!tilting) {
      heroTiltVel.x += (-heroTilt.x * 14 - heroTiltVel.x * 5) * dt;
      heroTiltVel.y += (-heroTilt.y * 14 - heroTiltVel.y * 5) * dt;
      heroTilt.x += heroTiltVel.x * dt;
      heroTilt.y += heroTiltVel.y * dt;
      capTilt();
    }

    dust.rotation.y += dt * 0.008;

    let veilTarget = 0;
    let best = -2, bestIdx = 0;
    items.forEach((it, i) => {
      const s = dt / (reducedMotion ? 0.05 : 0.95);
      it.blend = it.blendTarget > it.blend ? Math.min(it.blendTarget, it.blend + s) : Math.max(it.blendTarget, it.blend - s);
      const b = ease(it.blend);
      veilTarget = Math.max(veilTarget, b);

      const active = i === hovered && !open;
      it.hover += ((active ? 1 : 0) - it.hover) * Math.min(1, dt * 6);

      // position on the ring, floating gently
      const th = it.slot + rot;
      const front = Math.cos(th);
      if (front > best) { best = front; bestIdx = i; }
      ringPos.set(
        Math.sin(th) * R,
        Math.sin(t * 0.6 + it.phase[0]) * 0.05 + it.hover * 0.06,
        Math.cos(th) * R
      );

      // always facing you, with its own slow tilt in every axis, and a lean while the ring moves
      look.lookAt(camera.position, ringPos, up);
      ringQuat.setFromRotationMatrix(look);
      const m = reducedMotion ? 0.3 : 1;
      const lean = clamp(vel, -3, 3);
      euler.set(
        Math.sin(t * it.speed[0] + it.phase[0]) * 0.16 * m,
        Math.sin(t * it.speed[1] + it.phase[1]) * 0.24 * m + lean * 0.06,
        Math.sin(t * it.speed[2] + it.phase[2]) * 0.09 * m - lean * 0.035,
        "YXZ"
      );
      ringQuat.multiply(q.setFromEuler(euler));
      const ringScale = 1 + it.hover * 0.05;

      if (b > 0) {
        heroTransform(t);
        it.holder.position.lerpVectors(ringPos, heroPos, b);
        it.holder.quaternion.slerpQuaternions(ringQuat, heroQuat, b);
        it.holder.scale.setScalar(ringScale + (heroScale - ringScale) * b);
      } else {
        it.holder.position.copy(ringPos);
        it.holder.quaternion.copy(ringQuat);
        it.holder.scale.setScalar(ringScale);
      }
    });

    if (bestIdx !== focused) {
      focused = bestIdx;
      ui.setFocused(items[focused].rel, focused, items.length);
    }

    // the spotlight belongs to whichever record is at the front
    const centred = Math.pow(Math.max(0, best), 40); // 1 only when exactly at the front
    const ringLight = (1 - veilTarget);
    spot.intensity = 7 * (0.35 + 0.65 * centred) * ringLight;
    heroSpot.intensity = 4.2 * veilTarget;
    veil.material.opacity = veilTarget * 0.92;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }

  ui.setFocused(items[0].rel, 0, items.length);

  return {
    select,
    deselect,
    tiltStart() { tilting = true; heroTiltVel.set(0, 0); },
    tiltBy,
    tiltEnd() { tilting = false; },
    spinTo,
    nudge(dir) { spinTo((focused + dir + items.length) % items.length); },
    openFocused() { select(focused); },
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

  // ---------- caption for the record at the front ----------
  const caption = $("caption");
  $("captionOpen").addEventListener("click", () => space?.openFocused());

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
    $("dTitle").dataset.text = rel.title;
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
      ui.dismissHint();
    },
    setFocused(rel, i, total) {
      $("captionNum").textContent = `${String(i + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}`;
      const title = $("captionTitle");
      title.textContent = rel.title;
      title.dataset.text = rel.title;
      caption.classList.remove("is-new");
      void caption.offsetWidth; // restart the animation
      caption.classList.add("is-new");
    },
    scrollTop: () => scroller.scrollTop,
    dismissHint() { $("hint").classList.add("is-gone"); },
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
//  LOADER: the logo stamps in letter by letter while things load,
//  then flies to its place in the corner.
// ============================================================
function makeLoader() {
  const letters = [...document.querySelectorAll(".loader .lt")];
  let shown = 0;
  let lastAt = performance.now();
  const MIN_GAP = reducedMotion ? 0 : 420;
  return {
    async reveal(count) {
      while (shown < Math.min(count, letters.length)) {
        const since = performance.now() - lastAt;
        if (since < MIN_GAP) await wait(MIN_GAP - since);
        letters[shown].classList.add("is-in");
        shown++;
        lastAt = performance.now();
      }
    },
    async finish() {
      await this.reveal(letters.length);
      await wait(reducedMotion ? 0 : 520);
      const from = $("loaderLogo").getBoundingClientRect();
      const to = $("wordmark").getBoundingClientRect();
      const s = to.width / from.width;
      const logo = $("loaderLogo");
      logo.style.transform = `translate(${to.left - from.left}px, ${to.top - from.top}px) scale(${s})`;
      $("loader").classList.add("is-leaving");
      await wait(reducedMotion ? 0 : 1000);
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
  loader.reveal(1);

  const releases = await loadAllReleases();
  await loader.reveal(2);
  const ui = buildUI(releases);

  let has3D = false;
  if (webglAvailable() && releases.length) {
    try {
      const space = startSpace(releases, ui);
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
