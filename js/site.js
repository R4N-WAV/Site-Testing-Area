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
  scene.add(new THREE.AmbientLight(0xffffff, 0.12));
  // soft front light so every cover reads in its true colours; the fog lets the far ones sink into the dark
  const key = new THREE.DirectionalLight(0xffffff, 1.5);
  key.position.set(0, 1.5, 6);
  scene.add(key);
  scene.fog = new THREE.Fog(BG, 4.5, 13);
  const rim = new THREE.DirectionalLight(MAGENTA, 0.3);
  rim.position.set(-4, 3, -5);
  scene.add(rim);
  const spot = new THREE.SpotLight(0xfff8fb, 3.2, 0, 0.26, 0.9, 0);
  spot.position.set(0, 2.6, 3.4);
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

  // ---------- the tunnel ----------
  // The centre stays empty. Records line the left and right like the walls of a tunnel,
  // alternating sides one after another, each turned in toward the middle so it's
  // presented to you. Scrolling moves you down the tunnel one record at a time; records
  // you've passed slide out past the edges. Only an opened record takes the centre.
  const phone = () => camera.aspect < 1;
  const near = () => (phone() ? 2.5 : 3.4); // distance to the record you're at
  const SPACING = 1.4;  // distance between records along the tunnel
  const wall = () => (phone() ? 0.44 : 1.12);
  const sizeOf = () => (phone() ? 0.62 : 1);
  function layout(d, i, outP, outR) {
    const side = i % 2 === 0 ? -1 : 1;           // first record on the left, then right, ...
    const dist = near() + d * SPACING;
    const passing = Math.max(0, -d);             // records behind you slide out to the side
    outP.set(
      camera.position.x + side * (wall() + passing * 0.9),
      camera.position.y - 0.05 + (i % 2 ? 0.04 : 0),
      camera.position.z - dist
    );
    // extra turn toward the centre on top of facing you
    outR.set(0.02, -side * 0.38, side * 0.03);
    return sizeOf();
  }

  // ---------- camera: standing in the tunnel, looking straight down it ----------
  function placeCamera() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.fov = phone() ? 58 : 40;
    camera.updateProjectionMatrix();
    camera.position.set(0, 0.05, 4);
    camera.lookAt(0, 0.05, -10);
    camera.updateMatrixWorld();
  }
  placeCamera();

  let focusIndex = 0;
  const focus = springState(0);
  let hovered = -1;
  let selected = -1;
  const clampIndex = (i) => clamp(i, 0, items.length - 1);
  function focusOn(i) {
    i = clampIndex(i);
    if (i !== focusIndex) {
      focusIndex = i;
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
  // how far you drag to move one record: most of the screen width on phones, so it never runs away
  const pxPerRecord = () => (window.innerWidth <= 768 ? window.innerWidth * 0.8 : Math.min(window.innerWidth, 900) * 0.45);
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
    const drag0 = drag.start;
    drag = null;
    if (wasDrag) {
      // land on the record the flick was heading for
      // a flick moves at most one record from where the drag started
      const start = Math.round(drag0);
      const target = Math.round(focus.x + clamp(v * 0.12, -0.6, 0.6));
      focusOn(clamp(target, start - 1, start + 1));
      return;
    }
    const i = pick(e.clientX, e.clientY);
    if (i === -1) return;
    select(i);
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
    // opening doesn't move you down the tunnel, so closing puts everything back as it was
    selected = i;
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
  const rowAngle = new THREE.Vector3();
  const heroPos = new THREE.Vector3();
  const heroQuat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const q = new THREE.Quaternion();
  const look = new THREE.Matrix4();
  const up = new THREE.Vector3(0, 1, 0);
  const spotAim = new THREE.Vector3(-1.1, 0, 0.6);
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

      // place on the trail, pushed forward or away
      const d = i - focus.x;
      it.holder.visible = d > -1.4 && d < 10;
      const rowScale = layout(d, i, rowPos, rowAngle) * (1 + h * 0.03);
      rowPos.y += Math.sin(t * 0.5 + it.phase[0]) * 0.02;
      rowPos.z += h * 0.1;

      // facing you, at its own angle, drifting very slightly
      look.lookAt(camera.position, rowPos, up);
      rowQuat.setFromRotationMatrix(look);
      const m = reducedMotion ? 0.25 : 1;
      euler.set(
        rowAngle.x + Math.sin(t * 0.17 + it.phase[0]) * 0.035 * m,
        rowAngle.y + Math.sin(t * 0.13 + it.phase[1]) * 0.05 * m - h * rowAngle.y * 0.4,
        rowAngle.z + Math.sin(t * 0.11 + it.phase[2]) * 0.015 * m,
        "YXZ"
      );
      rowQuat.multiply(q.setFromEuler(euler));

      if (b > 0.0005) {
        heroTransform(t);
        it.holder.position.lerpVectors(rowPos, heroPos, b);
        it.holder.quaternion.slerpQuaternions(rowQuat, heroQuat, b);
        it.holder.scale.setScalar(rowScale + (heroScale - rowScale) * b);
      } else {
        it.holder.position.copy(rowPos);
        it.holder.quaternion.copy(rowQuat);
        it.holder.scale.setScalar(rowScale);
      }
      if (i === focusIndex) spotAim.lerp(rowPos, 1 - Math.exp(-dt * 6));
    });

    spot.target.position.copy(spotAim);
    veilShown += (veilTarget - veilShown) * (1 - Math.exp(-dt * 8));
    // the room light goes out quickly when a record opens, so it never cuts across it
    spot.intensity = 3.2 * Math.pow(1 - Math.min(1, veilShown * 2.5), 2);
    key.intensity = 1.5 * (1 - veilShown);
    heroSpot.intensity = 4 * veilShown;
    veil.material.opacity = veilShown * 0.97;

    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }


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
  $("allBtn").addEventListener("click", () => {
    close();
    setIndex(true);
  });
  $("indexClose").addEventListener("click", () => setIndex(false));


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
//  LOADER: the white logo pulses softly while the page loads,
//  then fades away.
// ============================================================
function makeLoader() {
  const startedAt = performance.now();
  return {
    progress() {},
    async finish() {
      // let it pulse at least a couple of times, so it never just blinks past
      const left = (reducedMotion ? 0 : 2400) - (performance.now() - startedAt);
      if (left > 0) await wait(left);
      $("loader").classList.add("is-leaving");
      document.body.classList.add("is-loaded");
      await wait(reducedMotion ? 0 : 1300);
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
