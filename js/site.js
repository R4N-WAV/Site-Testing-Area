import * as THREE from "three";
import { loadAllReleases, PLATFORMS, escapeHTML, safeUrl, richText, yearOf } from "./data.js";
import { createShared, buildRecord, RECORD_WIDTH, SLEEVE } from "./materials.js";

const BG = 0x0c0c0e;   // keep in sync with --bg in css/site.css
const LOGO = 0x060607; // the big centre logo: same tone as the background, darker

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const isPhone = () => window.innerWidth <= 768;

// Where the enlarged record sits when a song is open. The info text starts right under it.
function heroLayout() {
  const W = window.innerWidth, H = window.innerHeight;
  const top = isPhone() ? 70 : 84;
  const height = isPhone()
    ? Math.min((W * 0.84) / RECORD_WIDTH, H * 0.4)
    : Math.min(H * 0.5, (W * 0.6) / RECORD_WIDTH, 560);
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
  renderer.toneMappingExposure = 1.0;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.05, 200);
  scene.add(camera);

  const shared = createShared(renderer);
  scene.environment = shared.env;
  // direct light so the artwork reads at its true brightness; reflections come from the studio map
  const key = new THREE.DirectionalLight(0xffffff, 1.55);
  key.position.set(-2.5, 3.5, 6);
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xdfe4ff, 0.5);
  fill.position.set(4, 1, 3);
  scene.add(fill);

  // ---------- ring ----------
  const n = releases.length;
  const R = Math.max(3.0, (n * 1.55) / (Math.PI * 2));

  // ---------- big centre logo, blended into the background ----------
  const logoTex = new THREE.TextureLoader().load("assets/logo-white.png", (t) => {
    const aspect = t.image.width / t.image.height;
    logo.scale.set(logoWidth, logoWidth / aspect, 1);
  });
  logoTex.colorSpace = THREE.SRGBColorSpace;
  logoTex.anisotropy = 8;
  const logoWidth = R * 1.75;
  const logo = new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1),
    new THREE.MeshBasicMaterial({ map: logoTex, color: LOGO, alphaTest: 0.35, toneMapped: false })
  );
  logo.scale.set(logoWidth, logoWidth / 2.2, 1);
  logo.position.set(0, 0.25, 0);
  scene.add(logo);

  // ---------- faint dust for depth ----------
  const dustCount = reducedMotion ? 200 : 520;
  const dustPos = new Float32Array(dustCount * 3);
  for (let i = 0; i < dustCount; i++) {
    dustPos[i * 3] = (Math.random() - 0.5) * R * 6;
    dustPos[i * 3 + 1] = (Math.random() - 0.5) * 7;
    dustPos[i * 3 + 2] = (Math.random() - 0.5) * R * 6;
  }
  const dustGeo = new THREE.BufferGeometry();
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(dustGeo, new THREE.PointsMaterial({
    color: 0xffffff, size: 0.012, transparent: true, opacity: 0.35, depthWrite: false,
  }));
  scene.add(dust);

  // ---------- records ----------
  const items = releases.map((rel, i) => {
    const rec = buildRecord(rel, shared, i);
    const holder = new THREE.Object3D();
    holder.add(rec.group);
    scene.add(holder);
    const label = document.createElement("div");
    label.className = "vlabel";
    label.textContent = rel.title;
    $("labels").appendChild(label);
    return {
      rel, holder, label, pickables: rec.pickables,
      slot: (i / Math.max(1, n)) * Math.PI * 2,
      bobPhase: i * 1.37,
      hover: 0,
      blend: 0,        // 0 = in the ring, 1 = enlarged
      blendTarget: 0,
    };
  });
  const pickables = items.flatMap((it) => it.pickables);

  // a veil between the ring and the enlarged record
  const veil = new THREE.Mesh(
    new THREE.PlaneGeometry(40, 40),
    new THREE.MeshBasicMaterial({ color: BG, transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
  );
  const HERO_DEPTH = 1.6;
  veil.position.z = -(HERO_DEPTH + 0.5);
  veil.renderOrder = 10;
  camera.add(veil);

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

  // ---------- state ----------
  let rot = 0;           // ring rotation
  let vel = 0;           // flick momentum
  let auto = reducedMotion ? 0 : 0.06;
  let hovered = -1;
  let selected = -1;
  const pointerN = new THREE.Vector2(); // -1..1, for the tilt on the enlarged record
  const tilt = new THREE.Vector2();

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
  const spinPerPx = () => (Math.PI * 1.1) / window.innerWidth;
  canvas.addEventListener("pointerdown", (e) => {
    drag = { lastX: e.clientX, lastT: performance.now(), moved: 0 };
    canvas.setPointerCapture?.(e.pointerId);
    ui.dismissHint();
  });
  canvas.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.lastX;
      const now = performance.now();
      const dt = Math.max(8, now - drag.lastT) / 1000;
      rot += dx * spinPerPx();
      vel = vel * 0.6 + ((dx * spinPerPx()) / dt) * 0.4;
      drag.moved += Math.abs(dx);
      drag.lastX = e.clientX; drag.lastT = now;
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
    if (performance.now() - drag.lastT > 90) vel = 0; // held still before letting go
    drag = null;
    if (wasClick) {
      vel = 0;
      const i = pick(e.clientX, e.clientY);
      if (i !== -1) select(i);
    }
  };
  canvas.addEventListener("pointerup", endDrag);
  canvas.addEventListener("pointercancel", () => { drag = null; });
  canvas.addEventListener("pointerleave", () => { if (!drag) { hovered = -1; document.body.classList.remove("is-hovering"); } });
  canvas.addEventListener("wheel", (e) => {
    vel += (e.deltaX + e.deltaY) * 0.0012;
    vel = clamp(vel, -3, 3);
  }, { passive: true });
  window.addEventListener("pointermove", (e) => {
    pointerN.set((e.clientX / window.innerWidth) * 2 - 1, (e.clientY / window.innerHeight) * 2 - 1);
  });

  function select(i) {
    selected = i;
    items.forEach((it, k) => { it.blendTarget = k === i ? 1 : 0; });
    hovered = -1;
    document.body.classList.remove("is-hovering");
    ui.showDetail(items[i].rel, i);
  }
  function deselect() {
    selected = -1;
    items.forEach((it) => { it.blendTarget = 0; });
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
  const tmp = new THREE.Vector3();

  function heroTransform(t) {
    const { top, height } = heroLayout();
    const W = window.innerWidth, H = window.innerHeight;
    const tanV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const worldPerPx = (2 * HERO_DEPTH * tanV) / H;
    const cy = top + height / 2 - ui.scrollTop();
    heroPos.set(0, -(cy - H / 2) * worldPerPx, -HERO_DEPTH);
    camera.localToWorld(heroPos);
    const scale = (height * worldPerPx) / SLEEVE;
    // slow sway + follows the pointer a little, so the light moves across it
    const sway = reducedMotion ? 0 : 1;
    tilt.lerp(pointerN, 0.04);
    euler.set(
      (Math.sin(t * 0.27) * 0.05 + tilt.y * 0.16) * sway,
      (Math.sin(t * 0.35) * 0.1 + tilt.x * 0.24) * sway,
      0
    );
    heroQuat.copy(camera.quaternion).multiply(new THREE.Quaternion().setFromEuler(euler));
    return scale;
  }

  function frame() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    const open = selected !== -1;

    // ring motion: slow drift, stops while hovering or when a song is open
    const wantAuto = reducedMotion || open || hovered !== -1 ? 0 : 0.06;
    auto += (wantAuto - auto) * Math.min(1, dt * 2);
    if (!drag) {
      rot += (auto + vel) * dt;
      vel *= Math.exp(-dt * 1.8);
    }

    dust.rotation.y += dt * 0.01;

    let veilTarget = 0;
    items.forEach((it, i) => {
      // blend between ring and enlarged
      const step = dt / (reducedMotion ? 0.05 : 0.95);
      it.blend = it.blendTarget > it.blend ? Math.min(it.blendTarget, it.blend + step) : Math.max(it.blendTarget, it.blend - step);
      const b = ease(it.blend);
      veilTarget = Math.max(veilTarget, b);

      const active = i === hovered && !open;
      it.hover += ((active ? 1 : 0) - it.hover) * Math.min(1, dt * 6);

      // place on the horizontal ring
      const th = it.slot + rot;
      ringPos.set(Math.sin(th) * R, Math.sin(t * 0.6 + it.bobPhase) * 0.04 + it.hover * 0.08, Math.cos(th) * R);
      const towardCam = Math.atan2(camera.position.x - ringPos.x, camera.position.z - ringPos.z);
      // mostly facing you, turning slightly outward as they swing round the sides
      euler.set(0, towardCam + Math.sin(th) * 0.45, 0);
      ringQuat.setFromEuler(euler);
      const ringScale = 1 + it.hover * 0.05;

      if (b > 0) {
        const heroScale = heroTransform(t);
        it.holder.position.lerpVectors(ringPos, heroPos, b);
        it.holder.quaternion.slerpQuaternions(ringQuat, heroQuat, b);
        it.holder.scale.setScalar(ringScale + (heroScale - ringScale) * b);
      } else {
        it.holder.position.copy(ringPos);
        it.holder.quaternion.copy(ringQuat);
        it.holder.scale.setScalar(ringScale);
      }

      // title under each record (hidden while a song is open)
      tmp.copy(ringPos);
      tmp.y -= 0.62;
      tmp.project(camera);
      const front = (Math.cos(th) + 1) / 2;
      const x = (tmp.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-tmp.y * 0.5 + 0.5) * window.innerHeight;
      it.label.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) translate(-50%, 0)`;
      // only the records on the near half of the ring show a title
      it.label.style.opacity = open || b > 0.01 ? "0" : String(clamp((front - 0.4) / 0.35, 0, 1));
      it.label.classList.toggle("is-hot", active);
    });

    veil.material.opacity = veilTarget * 0.94;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return { select, deselect };
}

// ============================================================
//  INTERFACE
// ============================================================
function buildUI(releases) {
  const detail = $("detail");
  const scroller = $("detailScroll");
  const indexEl = $("index");
  const indexBtn = $("indexBtn");
  let space = null;
  let current = -1;

  // ---------- index list ----------
  const list = $("indexList");
  if (!releases.length) list.innerHTML = `<li class="index__empty">NOTHING IN ORBIT YET</li>`;
  releases.forEach((rel, i) => {
    const li = document.createElement("li");
    li.className = "index__item";
    li.innerHTML = `
      <button type="button">
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
    scrollTop: () => scroller.scrollTop,
    dismissHint() { $("hint").style.opacity = "0"; },
    attach(s) { space = s; },
    openBySlug(slug) {
      const i = releases.findIndex((r) => r.slug === slug);
      if (i !== -1) open(i);
    },
    showIndex: () => setIndex(true),
  };

  const step = (d) => { if (current !== -1) open((current + d + releases.length) % releases.length); };
  $("detailClose").addEventListener("click", close);
  $("dPrev").addEventListener("click", () => step(-1));
  $("dNext").addEventListener("click", () => step(1));
  // clicking the empty space around the record/text closes it
  scroller.addEventListener("click", (e) => {
    if (e.target === scroller || e.target.classList.contains("detail__hero")) close();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") { if (!indexEl.hidden) setIndex(false); else close(); }
    if (current !== -1 && e.key === "ArrowRight") step(1);
    if (current !== -1 && e.key === "ArrowLeft") step(-1);
  });

  return ui;
}

// ============================================================
//  GO
// ============================================================
async function main() {
  applyHeroLayout();
  window.addEventListener("resize", applyHeroLayout);

  const releases = await loadAllReleases();
  const ui = buildUI(releases);

  let has3D = false;
  if (webglAvailable() && releases.length) {
    try {
      ui.attach(startSpace(releases, ui));
      has3D = true;
    } catch (err) {
      console.error(err);
    }
  }
  if (!has3D) {
    document.body.classList.add("no3d");
    ui.showIndex();
  }

  const slug = decodeURIComponent(location.hash.slice(1));
  if (slug) setTimeout(() => ui.openBySlug(slug), 300);
  $("loader").classList.add("is-done");
}

main().catch((err) => {
  console.error(err);
  $("loaderText").textContent = "SIGNAL LOST — TRY RELOADING";
});
