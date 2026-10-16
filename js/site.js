import * as THREE from "three";
import { loadAllReleases, PLATFORMS, escapeHTML, safeUrl, richText, formatDate } from "./data.js";
import { createShared, buildRecord, SLEEVE } from "./materials.js";
import { initAccess } from "./access.js";

// Mostly black and white; the palette's magenta only as a faint rim light.
const BG = 0xf6f6f4; // white, keep in sync with --bg in css/site.css

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isPhone = () => window.innerWidth <= 768;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Where the enlarged record sits when a song is open: on top, with the details underneath.
// Sized so the whole thing fits on one screen, on any device.
function heroLayout() {
  const W = window.innerWidth, H = window.innerHeight;
  const top = H < 600 ? 50 : isPhone() ? 62 : 76;
  // the rest of the height goes to the details (~270px) and the footer (~70px), with room to breathe
  const size = Math.round(clamp(Math.min(W * 0.8, H * 0.44, H - top - 360, 460), Math.min(W * 0.5, H * 0.28), 460));
  return { top, size, cx: W / 2, cy: top + size / 2 };
}
function applyHeroLayout() {
  const { top, size } = heroLayout();
  document.documentElement.style.setProperty("--hero-top", `${top}px`);
  document.documentElement.style.setProperty("--hero-h", `${size}px`);
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
  // sharp on retina screens, but capped so big displays stay smooth
  const pixelRatio = () => Math.min(window.devicePixelRatio, 2, Math.sqrt(3.6e6 / (window.innerWidth * window.innerHeight)));
  renderer.setPixelRatio(pixelRatio());
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false; // two passes per frame: the tunnel, then the opened record on top
  renderer.setClearColor(0x000000, 0); // transparent: the page background (white + faint blue glow) shows through
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  // "Neutral" keeps cover art colours true while still handling bright reflections
  renderer.toneMapping = THREE.NeutralToneMapping;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, window.innerWidth / window.innerHeight, 0.05, 100);
  scene.add(camera);

  const shared = createShared(renderer);
  scene.environment = shared.env;

  // ---------- light: a bright white room, light from everywhere ----------
  // Every record gets the same light wherever it is in the tunnel; none is singled out.
  scene.add(new THREE.AmbientLight(0xffffff, 0.18));
  // sky fill from above, a slightly darker bounce from below: every sleeve gets a gentle gradient
  scene.add(new THREE.HemisphereLight(0xffffff, 0x9a9aa2, 0.3));
  // from the upper left: one edge of each sleeve catches the light, the other falls off a little
  const key = new THREE.DirectionalLight(0xffffff, 0.45);
  key.position.set(-2.2, 3.2, 5);
  scene.add(key);
  // Two soft lamps right beside your eyes, one a hair to the left and one a hair to the right.
  // Seen from just next to where you stand, a record in front throws only a thin, soft shadow
  // onto the inner edge of the record behind it; each lamp draws that sliver on its own side of
  // the tunnel, and nothing else in the room goes dark.
  const lamps = [-1, 1].map((side) => {
    const lamp = new THREE.SpotLight(0xffffff, 1.75, 0, THREE.MathUtils.degToRad(50), 0.7, 0);
    lamp.position.set(side * 0.2, 0.05, 4);
    lamp.target.position.set(side * 0.2, 0.05, -10);
    lamp.castShadow = true;
    lamp.shadow.mapSize.set(1024, 1024);
    lamp.shadow.camera.near = 0.5;
    lamp.shadow.camera.far = 22;
    lamp.shadow.bias = -0.0005;
    lamp.shadow.normalBias = 0.02;
    lamp.shadow.radius = 9;
    scene.add(lamp, lamp.target);
    return lamp;
  });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap; // with a radius: soft-edged
  renderer.shadowMap.autoUpdate = false; // drawn once per frame, before the first pass (not again for the second)
  scene.fog = new THREE.Fog(BG, 4.5, 13);
  const rim = new THREE.DirectionalLight(0xffffff, 0.3);
  rim.position.set(-4, 3, -5);
  scene.add(rim);

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
      off: 0,         // sideways slide when stepping PREV / NEXT (in screen widths)
      slide: null,    // the timed slide in progress
      leaving: false,
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

  // The opened record is drawn in a second pass, after the tunnel and the veil, with the
  // depth cleared in between: it is never dimmed by the veil and never cuts into another
  // record, however it is tilted on its way in or out.
  const TOP = 1;
  function setOnTop(it, on) {
    if (it.onTop === on) return;
    it.onTop = on;
    it.holder.traverse((o) => { if (o.isMesh) o.layers.set(on ? TOP : 0); });
  }

  // the enlarged record gets its own soft spotlight, carried with the camera
  const heroSpot = new THREE.SpotLight(0xffffff, 0, 0, 0.6, 0.85, 0);
  heroSpot.position.set(-0.8, 1.2, 0.5);
  const heroTarget = new THREE.Object3D();
  heroTarget.position.set(0, 0, -HERO_DEPTH);
  camera.add(heroSpot, heroTarget);
  heroSpot.target = heroTarget;
  // every light shines in both passes
  scene.traverse((o) => { if (o.isLight) o.layers.enableAll(); });

  // ---------- the tunnel ----------
  // The centre stays empty. Records line the left and right like the walls of a tunnel,
  // alternating sides one after another, each turned in toward the middle so it's
  // presented to you. Scrolling moves you down the tunnel one record at a time; records
  // you've passed slide out past the edges. Only an opened record takes the centre.
  const phone = () => camera.aspect < 1;
  const near = () => (phone() ? 2.5 : 3.4); // distance to the record you're at
  const SPACING = 1.4;  // distance between records along the tunnel
  // On tall, narrow screens the walls come in as far as needed for the nearest record to fit
  // inside the screen's edges (a fixed width cut the front record off on narrow phones).
  const wall = () => {
    if (!phone()) return 1.0;
    const halfW = near() * Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * camera.aspect;
    const halfRecord = sizeOf() * 0.5 * Math.cos(0.38) + 0.09; // plus a margin from the screen edge
    return clamp(halfW - halfRecord, 0.18, 0.44);
  };
  const sizeOf = () => (phone() ? 0.62 : 1);
  // On tall, narrow screens the tunnel is centred on what you see: the gap between the front record
  // and its edge of the screen matches the gap between the next record and the other edge. The front
  // record swaps sides as you scroll, so the shift follows, like a gentle camera sway.
  function phoneShift() {
    const tanA = Math.tan(THREE.MathUtils.degToRad(baseFov / 2)) * camera.aspect;
    const half = sizeOf() * 0.5 * Math.cos(0.38);
    const w = wall();
    const hwNear = near() * tanA, hwFar = (near() + SPACING) * tanA;
    const xNear = -(w + half), xFar = w - 0.015 + half; // outer edges: the front record, and the next one across
    const ox = -(xNear / hwNear + xFar / hwFar) / (1 / hwNear + 1 / hwFar);
    return ox * Math.cos(Math.PI * clamp(focus.x, 0, count() - 1));
  }
  function layout(d, i, outP, outR) {
    const side = i % 2 === 0 ? -1 : 1;           // first record on the left, then right, ...
    const dist = near() + d * SPACING;
    const passing = Math.max(0, -d);             // records behind you slide out to the side
    // records further down creep a little toward the middle, so they peek out from behind the one in front
    const creep = clamp(d, 0, 6) * (phone() ? 0.015 : 0.045);
    outP.set(
      camera.position.x + (phone() ? phoneShift() : 0.24) + side * (wall() - creep + passing * 0.9),
      camera.position.y - 0.05 + (i % 2 ? 0.04 : 0),
      camera.position.z - dist
    );
    // extra turn toward the centre on top of facing you
    outR.set(0.02, -side * 0.38, side * 0.03);
    return sizeOf();
  }

  let baseFov = 40;
  // ---------- camera: standing in the tunnel, looking straight down it ----------
  function placeCamera() {
    camera.aspect = window.innerWidth / window.innerHeight;
    baseFov = phone() ? 58 : 40;
    camera.fov = baseFov;
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
  // which records are shown, in tunnel order (the toggle filters this); slot = place in the tunnel
  let order = items.map((_, i) => i);
  items.forEach((it, i) => { it.slot = i; it.slotS = springState(i); });
  const count = () => Math.max(1, order.length);
  function applyOrder(visible) {
    order = visible.slice();
    items.forEach((it) => { it.slot = -1; });
    order.forEach((i, k) => { items[i].slot = k; });
  }
  let warp = null;
  const WARP_OUT = 0.42, WARP_IN = 0.9;
  const clampIndex = (i) => clamp(i, 0, count() - 1);
  let travel = 0; // where you're heading along the tunnel (in records); scroll moves it smoothly
  function focusOn(i) {
    i = clampIndex(i);
    travel = i;
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
    // only records you can see can be picked: not ones filtered out by the toggle, nor ones too far away to draw
    const hit = raycaster.intersectObjects(pickables, false).find((h) => {
      const it = items[h.object.userData.index];
      return it.slot >= 0 && it.holder.visible;
    });
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
        focus.x = clamp(drag.start + d / pxPerRecord(), -0.35, count() - 0.65);
        focus.v = 0;
        setHovered(-1);
      }
      return;
    }
    if (e.pointerType !== "touch") {
      pointer.x = e.clientX; pointer.y = e.clientY; pointer.in = true;
      setHovered(pick(e.clientX, e.clientY));
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
    if (i === -1 || warp) return;
    select(i);
  });
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { pointer.in = false; if (!drag) setHovered(-1); });

  // ---------- the song's name by the cursor, after hovering a record for a moment ----------
  const tag = $("hoverTag");
  const pointer = { x: 0, y: 0, in: false };
  let hoverSince = 0;
  const HOVER_DELAY = 0.66; // seconds
  function setHovered(i) {
    if (i !== hovered) { hoverSince = sceneTime; tag.classList.remove("is-shown"); }
    hovered = i;
    document.body.classList.toggle("is-hovering", hovered !== -1);
    if (i !== -1) {
      $("hoverTitle").textContent = items[i].rel.title;
      $("hoverArtist").textContent = items[i].rel.artist;
    }
  }
  function updateHoverTag(t, open) {
    const covered = document.body.classList.contains("index-open") || document.body.classList.contains("access-open");
    const show = hovered !== -1 && !open && !drag && !warp && !covered && t - hoverSince > HOVER_DELAY;
    if (show) tag.style.transform = `translate3d(${Math.round(pointer.x + 16)}px, ${Math.round(pointer.y + 18)}px, 0)`;
    tag.classList.toggle("is-shown", show);
  }

  // scrolling carries you down the tunnel; when you stop, it settles on the nearest record
  // Any deliberate scroll carries you at least one record in that direction, however slowly
  // the wheel or trackpad sends its ticks.
  let settleTimer = 0, scrollFrom = null;
  window.addEventListener("wheel", (e) => {
    if (selected !== -1 || document.body.classList.contains("index-open") || document.body.classList.contains("access-open")) return;
    const delta = e.deltaMode === 1 ? e.deltaY * 16 : (Math.abs(e.deltaY) > Math.abs(e.deltaX) ? e.deltaY : e.deltaX);
    if (scrollFrom === null) scrollFrom = focusIndex;
    travel = clamp(travel + clamp(delta, -120, 120) / 420, -0.3, count() - 0.7);
    clearTimeout(settleTimer);
    settleTimer = setTimeout(() => {
      const moved = travel - scrollFrom;
      let target = scrollFrom;
      if (moved > 0.08) target = Math.max(Math.round(travel), scrollFrom + 1);
      else if (moved < -0.08) target = Math.min(Math.round(travel), scrollFrom - 1);
      scrollFrom = null;
      focusOn(target);
    }, 220);
  }, { passive: true });

  // PREV / NEXT: the open record slides out one side while the next slides in from the
  // other, on a fixed timeline, both staying up front: nothing flies back through the tunnel
  const easeIn = (k) => k * k * k;
  const easeOut = (k) => 1 - Math.pow(1 - k, 3);
  function startSlide(it, from, to, dur, ease) {
    it.off = from;
    it.slide = { from, to, t0: sceneTime, dur: reducedMotion ? 0.01 : dur, ease };
  }
  function select(i, dir = 0) {
    // opening doesn't move you down the tunnel, so closing puts everything back as it was
    const prev = selected;
    selected = i;
    items.forEach((other, k) => {
      if (k === i || other.leaving) return;
      other.blendTarget = 0; other.slide = null; other.off = 0;
    });
    const it = items[i];
    it.leaving = false;
    if (dir && prev !== -1 && prev !== i && items[prev].blend.x > 0.5) {
      const old = items[prev];
      old.leaving = true;
      old.blendTarget = 1; // stays up front for the whole slide, then goes home behind the veil
      startSlide(old, old.off, -dir, 0.5, easeIn);
      // coming back while it was still on its way out: it just turns round
      if (it.blend.x > 0.5) startSlide(it, it.off, 0, 0.7, easeOut);
      else { it.blend.x = 1; it.blend.v = 0; startSlide(it, dir, 0, 0.75, easeOut); }
    } else {
      it.slide = null; it.off = 0;
    }
    it.blendTarget = 1;
    hovered = -1;
    heroTilt.x.x = heroTilt.y.x = heroTilt.x.v = heroTilt.y.v = 0;
    tiltGoal.set(0, 0);
    document.body.classList.remove("is-hovering");
    ui.showDetail(items[i].rel, i);
  }
  function deselect() {
    selected = -1;
    // a record still sliding out finishes its slide first, then goes home on its own
    items.forEach((it) => { if (!it.leaving) { it.blendTarget = 0; it.slide = null; it.off = 0; } });
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
    renderer.setPixelRatio(pixelRatio());
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
  let heroScale = 1;
  let worldPerPx = 0.001;
  const heroRight = new THREE.Vector3();
  const slidPos = new THREE.Vector3();
  const slidQuat = new THREE.Quaternion();
  let veilShown = 0;

  function heroTransform(t) {
    const { cx, cy, size } = heroLayout();
    const W = window.innerWidth, H = window.innerHeight;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    worldPerPx = (2 * HERO_DEPTH * tanV) / H;
    heroPos.set((cx - W / 2) * worldPerPx, -(cy - H / 2) * worldPerPx, -HERO_DEPTH);
    heroTarget.position.copy(heroPos);
    camera.localToWorld(heroPos);
    heroScale = (size * worldPerPx) / SLEEVE;
    const idle = reducedMotion ? 0 : 1;
    euler.set(
      heroTilt.y.x + Math.sin(t * 0.21) * 0.03 * idle,
      heroTilt.x.x + Math.sin(t * 0.27) * 0.05 * idle,
      Math.sin(t * 0.15) * 0.012 * idle,
      "YXZ"
    );
    heroQuat.copy(camera.quaternion).multiply(q.setFromEuler(euler));
  }

  // paused while the ACCESS screen covers the site; a capture hands over the next frame as an image
  let paused = false;
  let captureWaiters = [];

  // the scene's own time: it stands still while paused, so the page comes back exactly as it was left
  let sceneTime = 0;
  function frame() {
    if (paused) { clock.getDelta(); requestAnimationFrame(frame); return; }
    const dt = Math.min(clock.getDelta(), window.__maxDt || 1 / 30); // __maxDt: only set by automated tests on slow machines
    sceneTime += dt;
    const t = sceneTime;
    const open = selected !== -1;

    // switching MY SONGS / WORKED ON: rush forward through this tunnel, flash, and the new
    // tunnel flies in from the distance and settles
    let warpKick = 0, warpFlash = 0;
    if (warp) {
      warp.t += dt;
      if (warp.phase === "out") {
        const k = Math.min(1, warp.t / WARP_OUT);
        focus.x = warp.from + k * k * k * 7;       // accelerate down the tunnel
        focus.v = 0;
        warpKick = k * k;
        warpFlash = k * k * k;
        if (k >= 1) {
          applyOrder(warp.next);
          items.forEach((it) => { if (it.slot >= 0) { it.slotS.x = it.slot; it.slotS.v = 0; } });
          focus.x = -7; focus.v = 0;              // new tunnel starts far ahead...
          travel = 0; focusIndex = 0;
          warp.phase = "in"; warp.t = 0;
        }
      } else {
        const k = Math.min(1, warp.t / WARP_IN);
        warpKick = (1 - k) * (1 - k);
        warpFlash = Math.pow(1 - k, 3);
        if (k >= 1) warp = null;
      }
    }
    camera.fov = baseFov + warpKick * 22;
    camera.updateProjectionMatrix();

    if (!drag && !(warp && warp.phase === "out")) spring(focus, travel, warp ? 4.2 : (reducedMotion ? 30 : 6.5), dt);
    if (!tilting) tiltGoal.multiplyScalar(Math.exp(-dt * 3.2));
    spring(heroTilt.x, tiltGoal.x, 9, dt);
    spring(heroTilt.y, tiltGoal.y, 9, dt);

    let veilTarget = 0;
    items.forEach((it, i) => {
      // PREV / NEXT slide; once a leaving record is off screen, it quietly goes home behind the veil
      if (it.slide) {
        const k = clamp((t - it.slide.t0) / it.slide.dur, 0, 1);
        it.off = it.slide.from + (it.slide.to - it.slide.from) * it.slide.ease(k);
        if (k >= 1) {
          it.slide = null;
          if (it.leaving) {
            it.leaving = false; it.off = 0;
            it.blendTarget = 0; it.blend.x = 0; it.blend.v = 0;
          }
        }
      }

      const b = clamp(spring(it.blend, it.blendTarget, reducedMotion ? 30 : 5.2, dt), 0, 1);
      setOnTop(it, it.blendTarget === 1 || b > 0.002);
      veilTarget = Math.max(veilTarget, b);
      const h = spring(it.hover, i === hovered && !open ? 1 : 0, 9, dt);

      // place in the tunnel; when the filter changes, records glide to their new places
      const slot = spring(it.slotS, it.slot >= 0 ? it.slot : it.slotS.x, 5, dt);
      const d = slot - focus.x;
      it.holder.visible = (it.slot >= 0 && d > -1.4 && d < 10) || b > 0.002;
      const side = Math.round(slot) % 2 === 0 ? -1 : 1;
      const rowScale = layout(d, Math.round(slot), rowPos, rowAngle) * (1 + h * 0.04);
      rowPos.y += Math.sin(t * 0.5 + it.phase[0]) * 0.02;
      rowPos.z += h * 0.1;
      // when a record is opened, the rest of the tunnel parts to the sides and falls away
      // (only records on their way out of view: the one being opened never gets this push,
      // or it would jump sideways halfway through its flight)
      const clear = open && it.blendTarget === 0 && !it.leaving ? veilShown : 0;
      rowPos.x += side * clear * 2.2;
      rowPos.z -= clear * 1.5;

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
        const { size } = heroLayout();
        const travelPx = window.innerWidth / 2 + size * 0.75;
        heroRight.set(1, 0, 0).applyQuaternion(camera.quaternion);
        slidPos.copy(heroPos).addScaledVector(heroRight, it.off * travelPx * worldPerPx);
        slidQuat.copy(heroQuat).multiply(q.setFromAxisAngle(up, -it.off * 0.5));
        it.holder.position.lerpVectors(rowPos, slidPos, b);
        it.holder.quaternion.slerpQuaternions(rowQuat, slidQuat, b);
        it.holder.scale.setScalar(rowScale + (heroScale - rowScale) * b);
      } else {
        it.holder.position.copy(rowPos);
        it.holder.quaternion.copy(rowQuat);
        it.holder.scale.setScalar(rowScale);
      }
    });

    veilShown += (veilTarget - veilShown) * (1 - Math.exp(-dt * 8));
    // the room light gives way to the opened record's own light as the tunnel fades out
    key.intensity = 0.45 * (1 - veilShown);
    for (const lamp of lamps) lamp.intensity = 1.75 * (1 - veilShown);
    heroSpot.intensity = 4 * veilShown;
    veil.material.opacity = Math.max(veilShown, warpFlash * 0.85);

    renderer.clear();
    camera.layers.set(0);
    renderer.shadowMap.needsUpdate = veilShown < 0.99; // nothing to shadow while a record covers the tunnel
    renderer.render(scene, camera);
    if (items.some((it) => it.onTop)) {
      // Only while the veil hides the tunnel does the opened record ignore it. As the tunnel
      // fades back in, a record on its way home is depth-tested like any other, so it slides
      // back behind the ones in front of it instead of flying over them.
      if (veilShown > 0.93) renderer.clearDepth();
      camera.layers.set(TOP);
      renderer.render(scene, camera);
    }
    // a still mouse over a moving tunnel: what's under it changes, so check again
    if (pointer.in && !drag && !open && (Math.abs(focus.v) > 1e-3 || warp)) setHovered(pick(pointer.x, pointer.y));
    updateHoverTag(t, open);
    if (captureWaiters.length) {
      // copied straight after drawing, while the frame is still in the canvas
      const copy = document.createElement("canvas");
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext("2d").drawImage(canvas, 0, 0);
      captureWaiters.forEach((resolve) => resolve(copy));
      captureWaiters = [];
    }
    requestAnimationFrame(frame);
  }


  return {
    select,
    deselect,
    tiltStart() { tilting = true; },
    tiltBy,
    tiltEnd() { tilting = false; },
    capture: () => new Promise((resolve) => captureWaiters.push(resolve)),
    setPaused(p) { paused = p; if (p) setHovered(-1); },
    nudge(dir) { if (!warp) focusOn(focusIndex + dir); },
    openFocused() { if (order.length && !warp) select(order[focusIndex]); },
    // show only these records (item indexes, in order); the rest leave the tunnel
    setFilter(visible, animate = false) {
      if (!animate || reducedMotion) { applyOrder(visible); focusOn(0); return; }
      warp = { phase: "out", t: 0, from: focus.x, next: visible.slice() };
    },
    // the very first frame, so the loader can wait until the scene is really on screen
    firstFrame: () => new Promise((resolve) => {
      renderer.clear();
      renderer.shadowMap.needsUpdate = true;
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

  // ---------- MY SONGS / WORKED ON toggle ----------
  let mode = "mine";
  let shown = [];   // release indexes in the current mode
  const emptyNote = $("emptyNote");
  function applyMode(next, animated = false) {
    mode = next;
    shown = releases.map((r, i) => (r.category === mode ? i : -1)).filter((i) => i !== -1);
    document.querySelectorAll(".modeToggle button").forEach((b) => {
      b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
    });
    emptyNote.hidden = shown.length > 0;
    buildIndex();
    space?.setFilter(shown, animated);
  }
  document.querySelectorAll("[data-count]").forEach((el) => {
    const n = releases.filter((r) => r.category === el.dataset.count).length;
    el.textContent = String(n).padStart(2, "0");
  });
  document.querySelectorAll(".modeToggle button").forEach((b) => {
    b.addEventListener("click", () => { if (b.dataset.mode !== mode) applyMode(b.dataset.mode, true); });
  });

  // ---------- index list (follows the toggle) ----------
  const list = $("indexList");
  function buildIndex() {
    list.innerHTML = "";
    if (!shown.length) list.innerHTML = `<li class="index__empty">NOTHING HERE YET</li>`;
    shown.forEach((i, k) => {
      const rel = releases[i];
      const li = document.createElement("li");
      li.className = "index__item";
      li.style.setProperty("--k", k);
      li.innerHTML = `
        <button type="button">
          <span class="index__num">${String(k + 1).padStart(2, "0")}</span>
          <img src="${escapeHTML(rel.coverUrl)}" alt="" loading="lazy">
          <span><span class="index__title">${escapeHTML(rel.title)}</span>
          <span class="index__sub">${escapeHTML([rel.type, rel.artist].filter(Boolean).join(" · "))}</span></span>
          <span class="index__year">${escapeHTML(formatDate(rel))}</span>
        </button>`;
      li.querySelector("button").addEventListener("click", () => { setIndex(false); open(i); });
      list.appendChild(li);
    });
  }
  function setIndex(show) {
    if (!show && !space && current === -1) show = true; // without 3D, the index is the home page
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
  function open(i, dir = 0) {
    if (space) space.select(i, dir);
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
    if (!space) setIndex(true); // without 3D, the index is the home page
  }

  function fill(rel) {
    $("dCover").src = rel.coverUrl;
    $("dCover").alt = `${rel.title} cover art`;
    $("dMeta").textContent = [rel.type, formatDate(rel)].filter(Boolean).join(" · ");
    $("dTitle").textContent = rel.title;
    $("dArtist").innerHTML = rel.artists.map((a) => {
      const url = safeUrl(a.url);
      return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${escapeHTML(a.name)}</a>` : escapeHTML(a.name);
    }).join(", ");
    $("dDesc").innerHTML = richText(rel.description);
    $("dAbout").open = false;
    $("dAbout").hidden = !rel.description;

    const credits = $("dCredits");
    credits.innerHTML = "";
    for (const c of rel.credits) {
      const people = c.people.map((p) => {
        const url = safeUrl(p.url);
        const name = escapeHTML(p.name);
        return url ? `<a href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer">${name}</a>` : name;
      });
      credits.insertAdjacentHTML("beforeend", `<div><dt>${escapeHTML(c.role)}</dt><dd>${people.join(", ")}</dd></div>`);
    }

    const links = $("dLinks");
    links.innerHTML = "";
    for (const [key, val] of Object.entries(rel.links)) {
      const url = safeUrl(val);
      if (!url) continue;
      const name = PLATFORMS[key.toLowerCase()] || key;
      links.insertAdjacentHTML("beforeend",
        `<a class="listen listen--${escapeHTML(key.toLowerCase())}" href="${escapeHTML(url)}" target="_blank" rel="noopener noreferrer" aria-label="Listen on ${escapeHTML(name)}"><span>${escapeHTML(name)}</span><span aria-hidden="true">↗</span></a>`);
    }
    const many = shown.length > 1;
    $("dPrev").hidden = !many;
    $("dNext").hidden = !many;
  }

  // The details always fit on one screen: if they're taller than the space left
  // (a small phone, a long credits list, ABOUT open), they shrink to fit instead of scrolling.
  const info = $("detailInfo");
  const inner = $("detailInner");
  function fitDetail() {
    inner.style.transform = "";
    const cs = getComputedStyle(info);
    const room = info.clientHeight - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
    const need = inner.offsetHeight;
    const k = need > room && need > 0 ? Math.max(0.45, room / need) : 1;
    inner.style.transform = k < 1 ? `scale(${k.toFixed(4)})` : "";
  }
  window.addEventListener("resize", () => { if (current !== -1) fitDetail(); });
  $("dAbout").addEventListener("toggle", fitDetail);

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
      detail.classList.add("is-open");
      detail.setAttribute("aria-hidden", "false");
      document.body.classList.add("detail-open");
      history.replaceState(null, "", `#${rel.slug}`);
      fitDetail();
    },
    attach(s) { space = s; space.setFilter(shown); },
    applyMode,
    openBySlug(slug) {
      const i = releases.findIndex((r) => r.slug === slug);
      if (i === -1) return;
      if (releases[i].category !== mode) applyMode(releases[i].category);
      open(i);
    },
    showIndex: () => setIndex(true),
  };

  const stepDetail = (d) => {
    if (current === -1 || !shown.length) return;
    const k = shown.indexOf(current);
    open(shown[(k + d + shown.length) % shown.length], d);
  };
  $("detailClose").addEventListener("click", close);
  $("dPrev").addEventListener("click", () => stepDetail(-1));
  $("dNext").addEventListener("click", () => stepDetail(1));
  // clicking the empty space beside the text closes it
  scroller.addEventListener("click", (e) => { if (e.target === scroller) close(); });
  document.addEventListener("keydown", (e) => {
    if (document.body.classList.contains("access-open")) return;
    if (e.key === "Escape") { if (!indexEl.hidden) setIndex(false); else close(); return; }
    if (current !== -1) {
      if (e.key === "ArrowRight") stepDetail(1);
      if (e.key === "ArrowLeft") stepDetail(-1);
      return;
    }
    if (!space || !indexEl.hidden) return;
    // Enter or Space on a focused button or link belongs to that button, not to the tunnel
    if (e.target instanceof Element && e.target.closest("button, a, input, summary")) return;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") space.nudge(1);
    if (e.key === "ArrowLeft" || e.key === "ArrowUp") space.nudge(-1);
    if (e.key === "Enter") space.openFocused();
  });

  // Controls that are faded out can't be reached by keyboard (Tab) or screen readers either:
  // whatever covers the page (an opened record, the index, ACCESS) is the only thing you can use.
  const covered = [
    [".modeToggle", (c) => c.contains("detail-open") || c.contains("access-open")],
    ["#indexBtn", (c) => c.contains("detail-open") || c.contains("index-open") || c.contains("access-open")],
    ["#accessBtn", (c) => c.contains("detail-open") || c.contains("index-open") || c.contains("access-open")],
    [".top .logo", (c) => c.contains("access-open")],
    ["#index", (c) => c.contains("access-open")],
    ["#detail", (c) => c.contains("access-open")],
  ].map(([sel, test]) => [document.querySelector(sel), test]);
  const syncCovered = () => {
    const c = document.body.classList;
    for (const [el, test] of covered) if (el) el.inert = test(c);
  };
  new MutationObserver(syncCovered).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  syncCovered();

  applyMode("mine");
  return ui;
}

// ============================================================
//  LOADER: the white logo pulses softly while the page loads,
//  then fades away.
// ============================================================
function makeLoader() {
  const startedAt = performance.now();
  return {
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
  const ui = buildUI(releases);

  let has3D = false;
  let space = null;
  if (webglAvailable() && releases.length) {
    try {
      space = startSpace(releases, ui);
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
  initAccess({ space });
  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug) ui.openBySlug(slug);
}

main().catch((err) => {
  console.error(err);
  $("loaderNote").textContent = "SIGNAL LOST — TRY RELOADING";
});
