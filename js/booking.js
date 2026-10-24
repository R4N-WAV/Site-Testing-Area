// BOOKING: a passport, built like the red Norwegian one, lying in the dark with warm light leaking
// out between its pages, as if something inside wants out. Click it and it opens onto memories of
// a trip: stamps, a film of the show, and a ticket to book the next one, which turns the page to a
// booking form.
//
// The booklet: a thin cover that wraps round a rounded spine from the front to the back,
// overhanging a block of pages a little; square at the spine, rounded on the open side. The
// light: the page edges glow, a sheet of moving rays fans out of the gaps, and a bloom pass makes
// it bleed. Every second or two something inside rattles it: a quick burst of jolts on springs,
// never twice the same. Open: the cover swings over, ten filled pages riffle past, and it lands on
// a spread already full. Wide screens open it like a book; tall screens open it the way a
// passport is shown, the spine across the middle and the pages on their side. The artwork is
// drawn in js/passport-art.js.
//
//   const p = await createPassport(layer)   // layer: an element covering the screen
//   p.show(animate) / await p.hide(animate) / p.setPaused(bool) / p.open() / p.close() / p.dispose()
//   p.setVideo(url)  // the film on the spread (assets/film/r4n-live.mp4 unless told otherwise)
//   createPassport(layer, { releases })  // releases (js/data.js) become the stamps inside

import * as THREE from "three";
import { EffectComposer } from "../vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "../vendor/addons/environments/RoomEnvironment.js";
import {
  coverArt, pageEdges, spreadPages, spreadHits, leafPages, formPages, formLayout, receivedStamp, stampForm, tabArt, TAB,
  printArt, titleArt, ticketArt, PAD, PRINT, TITLE, TICKET, PAPER,
} from "./passport-art.js";
import { t, lang, onLang, morph } from "./i18n.js";
import { play } from "./sound.js";
import { liveCard } from "./memories.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const coarse = window.matchMedia("(pointer: coarse)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const BG = 0x09090b; // the site's white, inverted
const TO = "r4nmusic@outlook.com";
const SEND_URL = `https://formsubmit.co/ajax/${TO}`;

// ---- the booklet, in units of 100 mm: a passport is 88 x 125 mm, about 5.5 mm thick ----
const W = 0.88, H = 1.25;
const COVER = 0.0045;         // the cover: thin and flexible
const PAGES = 0.046;          // the block of pages
const T = PAGES + 2 * COVER;  // closed thickness
const OV = 0.011;             // the cover overhangs the pages on the open sides
const R = 0.032;              // corner radius (open side only; square at the spine)
const PW = W - OV, PH = H - 2 * OV, PD = PAGES * 0.97;
const DIMS = { PW, PH, R: R * 0.85 };
const LEAVES = 10;            // pages that riffle past when it opens

// a panel's outline, from the spine (x = 0) to the open edge (x = w)
function panelShape(w, h, r) {
  const s = new THREE.Shape();
  s.moveTo(0, -h / 2);
  s.lineTo(w - r, -h / 2); s.quadraticCurveTo(w, -h / 2, w, -h / 2 + r);
  s.lineTo(w, h / 2 - r); s.quadraticCurveTo(w, h / 2, w - r, h / 2);
  s.lineTo(0, h / 2);
  s.closePath();
  return s;
}

// The light streaming out between the pages: a sheet in the page plane, larger than the booklet.
// Brightness falls off with the distance from the outline of what's lit: the page block, and as
// the cover swings open, the ground it has actually swept (so the light never stands ahead of
// the book in empty space). Rays fan out, drift and flicker; it fades well before the sheet's edge.
function lightSheet() {
  const SW = W * 6, SH = H * 4;
  const geo = new THREE.PlaneGeometry(SW, SH, 1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 }, flare: { value: 0 }, power: { value: 0 }, opened: { value: 0 },
      box: { value: new THREE.Vector4(-PW / 2, PW / 2, PH, 0) }, sheet: { value: new THREE.Vector2(SW, SH) },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform float time, flare, power, opened;
      uniform vec4 box; // x from, x to, height, -
      uniform vec2 sheet;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      float noise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      // noise round a circle: its cells wrap after n, so it joins up where the angle does
      float noiseP(float x, float n){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(mod(i, n)), hash(mod(i + 1.0, n)), f); }
      float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 c = vec2((box.x + box.y) * 0.5, 0.0);
        vec2 half_ = vec2((box.y - box.x) * 0.5, box.z * 0.5);
        vec2 p = vP - c;
        float d = sdBox(p, half_, ${R.toFixed(3)});
        if (d < 0.0) discard;
        float a = atan(p.y, p.x) / 6.2831853 + 0.5; // 0..1 round the circle
        float rays = noiseP(a * 113.0 + time * 0.3, 113.0) * 0.55 + noiseP(a * 258.0 - time * 0.5 + 7.0, 258.0) * 0.35 + noiseP(a * 44.0 + time * 0.12 + 3.0, 44.0) * 0.3;
        rays = pow(rays, 2.4);
        float side = mix(smoothstep(-0.25, 0.3, p.x / (2.0 * half_.x) + 0.5), 1.0, opened);
        float near = exp(-d * 52.0);
        float far = exp(-d * (8.5 - 1.5 * flare + 3.0 * opened)) * rays * (1.0 - 0.35 * opened);
        float flick = 0.9 + 0.1 * noise(time * 6.0);
        vec2 e = 0.5 * sheet - abs(vP);
        float edge = smoothstep(0.0, 0.35, min(e.x, e.y));
        float k = (near * 0.95 + far * 0.3) * side * flick * power * (1.0 + 1.2 * flare) * edge;
        vec3 col = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.86, 0.6), near);
        gl_FragColor = vec4(col * k, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

// open: the light also wells up out of the fold between the pages, a soft warm line
function gutterGlow() {
  const geo = new THREE.PlaneGeometry(0.16, PH * 0.98, 1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { time: { value: 0 }, power: { value: 0 } },
    vertexShader: `varying vec2 vU; void main(){ vU = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vU;
      uniform float time, power;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      float noise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      void main(){
        float x = (vU.x - 0.5) * 2.0;
        float ends = smoothstep(0.0, 0.12, vU.y) * smoothstep(1.0, 0.88, vU.y);
        float k = (exp(-x * x * 90.0) * 0.9 + exp(-x * x * 9.0) * 0.18) * ends * (0.85 + 0.15 * noise(vU.y * 9.0 + time * 1.3));
        gl_FragColor = vec4(vec3(1.0, 0.72, 0.36) * k * power, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 3;
  return m;
}

// A small spring (underdamped: it overshoots a little and settles, like something physical)
const spring = (omega, zeta) => ({ x: 0, v: 0, omega, zeta });
function stepSpring(s, target, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.006)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -s.omega * s.omega * (s.x - target) - 2 * s.zeta * s.omega * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}

// A turning page: hinged at the spine (x = 0), turned by `turn` (0 flat on the right, PI flat on the
// left). Its free edge lags behind as it goes over, so it curls; at rest it's flat.
const LEAF_SEG = 18;
function bendLeaf(geo, turn) {
  const pos = geo.attributes.position;
  const lag = 0.75 * Math.sin(turn);
  const ds = PW / LEAF_SEG;
  let x = 0, z = 0;
  const xs = [0], zs = [0];
  for (let i = 1; i <= LEAF_SEG; i++) {
    const s = (i - 0.5) / LEAF_SEG;
    const a = turn - lag * s * s; // the angle along the page: the far end turns later
    x += Math.cos(a) * ds; z += Math.sin(a) * ds;
    xs.push(x); zs.push(z);
  }
  // which column of the page each vertex is in (worked out once, from the flat page)
  const cols = (geo.userData.cols ||= Array.from({ length: pos.count }, (_, i) => Math.round((pos.getX(i) / PW) * LEAF_SEG)));
  for (let i = 0; i < pos.count; i++) { pos.setX(i, xs[cols[i]]); pos.setZ(i, zs[cols[i]]); }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
}

// The cover's textures are drawn once, ahead of time, and kept as images (assets/passport/,
// made by scripts/bake-passport.mjs), so the passport is there in a moment even on a slow phone.
// If they can't be had, they're drawn here instead.
const COVER_MAPS = ["map", "finish", "normal", "backMap", "backNormal"];
async function bakedCover() {
  const load = (name) => new Promise((res, rej) => {
    const img = new Image();
    img.decoding = "async";
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = new URL(`../assets/passport/cover-${name}.webp?v=1`, import.meta.url).href;
  });
  try {
    const imgs = await Promise.all(COVER_MAPS.map(load));
    return Object.fromEntries(COVER_MAPS.map((k, i) => [k, imgs[i]]));
  } catch {
    return coverArt(H / W);
  }
}

// the signature: R4N in a quick hand, a flourish under it (strokes in a 300 x 120 box)
const SIGNATURE = [
  "M22 92 C24 66 26 40 30 18",
  "M30 20 C48 8 74 16 64 38 C57 52 38 52 31 47 C46 60 60 80 76 94",
  "M112 20 L90 68 L132 64",
  "M120 30 C118 52 116 74 114 98",
  "M146 94 C150 70 152 46 156 22 C168 48 182 72 196 94 C200 68 204 44 210 18",
  "M26 108 C90 98 170 104 262 88 C276 85 282 79 278 72",
];

export async function createPassport(layer, { releases = [] } = {}) {
  const fontsReady = Promise.all(["600", "700"].map((w) => new FontFace("Cinzel", `url(${new URL(`../assets/fonts/cinzel-latin-${w}-normal.woff2`, import.meta.url)})`, { weight: w }).load().then((f) => document.fonts.add(f))));
  const coverReady = bakedCover();

  const canvas = document.createElement("canvas");
  canvas.className = "booking__canvas";
  layer.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" });
  // sharp on any screen, without drawing more pixels than a phone can push
  let pixelRatio = Math.min(window.devicePixelRatio, 1.5);
  renderer.setPixelRatio(pixelRatio);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  // a software renderer (no graphics card): start at the cheapest settings
  const gl = renderer.getContext(), gpuInfo = gl.getExtension("WEBGL_debug_renderer_info");
  const software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(String(gl.getParameter(gpuInfo ? gpuInfo.UNMASKED_RENDERER_WEBGL : gl.RENDERER) || ""));
  if (software) { pixelRatio = 1; renderer.setPixelRatio(1); }
  const tex = (c, srgb = true) => {
    const t2 = c instanceof HTMLImageElement ? new THREE.Texture(c) : new THREE.CanvasTexture(c);
    t2.needsUpdate = true;
    if (srgb) t2.colorSpace = THREE.SRGBColorSpace;
    t2.anisotropy = Math.min(8, maxAniso);
    return t2;
  };
  // until a page's own drawing is ready: plain paper
  const blank = (() => { const c = document.createElement("canvas"); c.width = c.height = 4; const g = c.getContext("2d"); g.fillStyle = PAPER; g.fillRect(0, 0, 4, 4); return tex(c); })();

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
  const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 50);

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.15);
  key.position.set(-1.5, 2.5, 3);
  scene.add(key);
  const glowLights = [[0.62, 0], [-0.05, 0.78], [-0.05, -0.78], [0.45, 0.62], [0.45, -0.62]].map(([x, y]) => {
    const l = new THREE.PointLight(0xffa040, 0, 1.0, 2);
    l.position.set(x, y, 0.05);
    scene.add(l);
    return l;
  });

  await fontsReady;
  const art = await coverReady;

  // ---- the booklet ----
  const passport = new THREE.Group(); // where it is and how it's turned
  const body = new THREE.Group();     // the rattling moves this, inside that
  passport.add(body);
  scene.add(passport);

  const coverSurface = { clearcoat: 0.32, clearcoatRoughness: 0.4, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x8a2a32) };
  const frontMat = new THREE.MeshPhysicalMaterial({ map: tex(art.map), roughnessMap: tex(art.finish, false), metalnessMap: tex(art.finish, false), normalMap: tex(art.normal, false), roughness: 1, metalness: 1, ...coverSurface });
  const backMat = new THREE.MeshPhysicalMaterial({ map: tex(art.backMap), normalMap: tex(art.backNormal, false), roughness: 0.47, metalness: 0, ...coverSurface });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x6a1019, roughness: 0.5, ...coverSurface });

  // the cover: front and back panels, joined by a rounded spine, all one material and one grain.
  // UVs in cover units (u across the board, v up it), so the grain is the same size everywhere.
  const panelGeo = new THREE.ExtrudeGeometry(panelShape(W, H, R), { depth: COVER, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 10 });
  {
    const uv = panelGeo.attributes.uv, pos = panelGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W, pos.getY(i) / H + 0.5);
  }
  const hinge = new THREE.Group(); // the front cover swings round the spine
  hinge.position.set(-W / 2, 0, PAGES / 2);
  body.add(hinge);
  const front = new THREE.Mesh(panelGeo, [frontMat, edgeMat]);
  hinge.add(front);
  const back = new THREE.Mesh(panelGeo, [backMat, edgeMat]);
  back.position.set(-W / 2, 0, -PAGES / 2);
  back.scale.z = -1;
  body.add(back);
  let spine;
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, T / 2, Math.PI / 2, Math.PI * 1.5, false);
    sh.absarc(0, 0, PAGES / 2, Math.PI * 1.5, Math.PI / 2, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false, curveSegments: 20 });
    g.rotateX(Math.PI / 2);
    g.translate(-W / 2, H / 2, 0);
    // u: the distance round the fold (in cover units), so it continues the boards' grain
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) {
      const a = Math.atan2(pos.getZ(i), pos.getX(i) + W / 2);
      uv.setXY(i, ((Math.PI / 2 - Math.abs(a)) * T / 2) / W + 0.02, pos.getY(i) / H + 0.5);
    }
    spine = new THREE.Mesh(g, backMat.clone());
    spine.material.side = THREE.DoubleSide;
    body.add(spine);
  }

  // the pages: a block a little inside the cover on the open sides, rounded into the spine
  const edgesArt = pageEdges();
  const pageGeo = new THREE.ExtrudeGeometry(panelShape(PW, PH, R * 0.85), { depth: PD, bevelEnabled: false, curveSegments: 10 });
  pageGeo.translate(-W / 2, 0, -PD / 2);
  {
    const uv = pageGeo.attributes.uv, pos = pageGeo.attributes.position;
    const [caps, sides] = pageGeo.groups;
    for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / PW, pos.getY(i) / PH + 0.5);
    for (let i = sides.start; i < sides.start + sides.count; i++) uv.setXY(i, 0.5, pos.getZ(i) / PD + 0.5);
  }
  const topPageMat = new THREE.MeshStandardMaterial({ color: 0xe9ddc1, roughness: 0.9 });
  const pageEdgeMat = new THREE.MeshStandardMaterial({ map: tex(edgesArt.map), emissive: 0xffffff, emissiveMap: tex(edgesArt.emissive), emissiveIntensity: 0.8, roughness: 0.9 });
  const pagesMesh = new THREE.Mesh(pageGeo, [topPageMat, pageEdgeMat]);
  body.add(pagesMesh);
  const pageRound = new THREE.Mesh(new THREE.CylinderGeometry(PD / 2, PD / 2, PH, 16, 1, false, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.9 }));
  pageRound.position.x = -W / 2;
  body.add(pageRound);
  const sheet = lightSheet();
  body.add(sheet);

  // ---- inside: pages drawn for the screen (sharp enough for it), already filled. They're
  // drawn after the passport is up, a little at a time, so it appears at once ----
  const pageSize = (vertical) => {
    const long = clamp(Math.round((vertical ? window.innerWidth : window.innerHeight) * pixelRatio * 1.05), 1024, 2048);
    return [Math.round(long * PW / PH), long];
  };
  const leafRes = (() => { const [a, b] = pageSize(window.innerHeight > window.innerWidth * 1.05); return [Math.round(a * 0.55), Math.round(b * 0.55)]; })();
  const pageMat = (map, back = false) => new THREE.MeshStandardMaterial({
    map: map || blank, roughness: 0.92, side: back ? THREE.BackSide : THREE.FrontSide,
    alphaTest: 0.5, emissive: 0xffb060, emissiveIntensity: 0,
  });
  // drawn for the way it was first held; drawn again (once) if it opens the other way
  const decks = { wide: null, tall: null };
  function deck(vertical) {
    const k = vertical ? "tall" : "wide";
    decks[k] ||= (async () => {
      const [tw, th] = leafRes;
      const leaves = await leafPages(DIMS, tw, th, vertical, 3, releases);
      const [sw, sh] = pageSize(vertical);
      const spread = await spreadPages(DIMS, sw, sh, vertical, lang());
      return {
        leafL: leaves.L.map((c) => tex(c)), leafR: leaves.R.map((c) => tex(c)),
        spreadL: tex(spread.L), spreadR: tex(spread.R), form: null,
        hits: spreadHits(vertical), lang: lang(),
      };
    })();
    return decks[k];
  }
  function formDeck(vertical) {
    return deck(vertical).then((d) => (d.form ||= (async () => {
      const [sw, sh] = pageSize(vertical);
      const f = await formPages(DIMS, sw, sh, vertical);
      // a clean copy of the first page, to start afresh after a request has been stamped and signed
      const clean = document.createElement("canvas");
      clean.width = f.L.width; clean.height = f.L.height;
      clean.getContext("2d").drawImage(f.L, 0, 0);
      return { L: tex(f.L), R: tex(f.R), canvasL: f.L, clean };
    })()));
  }
  let vertical = window.innerHeight > window.innerWidth * 1.05;
  let D = null;

  const LIFT = T / 2 + 0.0006;   // just above the spine fold, so it never shows inside
  const STEP = 0.00035;          // each leaf's thickness, as far as the eye can tell
  // the inside of the front cover: the endpaper, the size of a page (the red rim shows round it)
  const insideGeo = new THREE.ShapeGeometry(panelShape(PW, PH, R * 0.85), 10);
  {
    const uv = insideGeo.attributes.uv, pos = insideGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - pos.getX(i) / PW, pos.getY(i) / PH + 0.5);
  }
  const inside = new THREE.Mesh(insideGeo, pageMat(null, true));
  inside.position.z = -0.0009;
  hinge.add(inside);

  const flatPage = new THREE.ShapeGeometry(panelShape(PW, PH, R * 0.85), 10);
  {
    const uv = flatPage.attributes.uv, pos = flatPage.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / PW, pos.getY(i) / PH + 0.5);
  }
  const rightPage = new THREE.Mesh(flatPage, pageMat(null));
  rightPage.position.set(-W / 2, 0, LIFT);
  rightPage.visible = false;
  body.add(rightPage);

  function makeLeaf(z) {
    const geo = new THREE.PlaneGeometry(PW, PH, LEAF_SEG, 1);
    geo.translate(PW / 2, 0, 0);
    const frontLeaf = new THREE.Mesh(geo, pageMat(null));
    // the back of a leaf reads the right way round once it has turned over
    const backGeo = geo.clone();
    { const uv = backGeo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
    const backLeaf = new THREE.Mesh(backGeo, pageMat(null, true));
    // it swings from one side of the spine to the other: bounds that hold it anywhere on the way
    // (so it's never culled, and a click on it once it's over on the left still finds it)
    geo.boundingSphere = backGeo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), Math.hypot(PW, PH / 2) + 0.01);
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, z);
    pivot.add(frontLeaf, backLeaf);
    pivot.visible = false;
    body.add(pivot);
    return { pivot, geo, backGeo, frontLeaf, backLeaf, turn: -1, flipped: false };
  }
  const leaves = Array.from({ length: LEAVES }, () => makeLeaf(LIFT));
  const formLeaf = makeLeaf(LIFT + STEP * (LEAVES + 3));
  const lastLeaf = leaves[LEAVES - 1];
  function dress() { // put the pages for this way of holding it on
    const set = (m, map) => { m.material.map = map; m.material.needsUpdate = true; };
    set(inside, D.leafL[2]);
    set(rightPage, D.spreadR);
    leaves.forEach((l, i) => {
      set(l.frontLeaf, D.leafR[i % 3]);
      set(l.backLeaf, i === LEAVES - 1 ? D.spreadL : D.leafL[(i + 1) % 3]);
    });
    set(formLeaf.frontLeaf, D.spreadR);
  }
  const ready = deck(vertical).then((d) => { D = d; dress(); });
  // a new language: the spread's printed words are drawn again, and swapped in when ready
  function relang() {
    const l = lang();
    (async () => {
      for (const v of [false, true]) {
        const d = await decks[v ? "tall" : "wide"];
        if (!d || d.lang === l) continue;
        const [sw, sh] = pageSize(v);
        const spread = await spreadPages(DIMS, sw, sh, v, l);
        if (lang() !== l) return;
        const old = [d.spreadL, d.spreadR];
        d.spreadL = tex(spread.L); d.spreadR = tex(spread.R); d.lang = l;
        if (d === D) {
          const set = (m, map) => { m.material.map = map; m.material.needsUpdate = true; };
          set(lastLeaf.backLeaf, d.spreadL);
          if (!formGoal && formT === 0) set(rightPage, d.spreadR);
          set(formLeaf.frontLeaf, d.spreadR);
        }
        old.forEach((t2) => t2.dispose());
      }
    })();
  }
  const gutter = gutterGlow();
  gutter.position.set(-W / 2, 0, LIFT + STEP * (LEAVES + 4));
  gutter.visible = false;
  body.add(gutter);

  // ---- across the fold: the film in its print, the title above, the ticket below ----
  // laid out in spread units (x right, y up as seen, the spine at 0) in a frame turned with it
  const spreadFrame = new THREE.Group();
  spreadFrame.position.set(-W / 2, 0, 0);
  body.add(spreadFrame);
  const centre = new THREE.Group();
  centre.position.z = LIFT + STEP * (LEAVES + 6);
  spreadFrame.add(centre);
  const cutout = (w, h, map, order) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 + 2 * PAD), h * (1 + 2 * PAD)), new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.8, depthWrite: false, opacity: 1 }));
    m.renderOrder = order;
    return m;
  };
  const printMesh = cutout(PRINT.w, PRINT.h, tex(printArt()), 11);
  printMesh.position.set(0, 0.03, 0.0004); printMesh.rotation.z = -0.025;
  // The film: R4N live, cut up as paper stop-motion (assets/film/), shown through a little
  // grain of its own: it flickers, the gate wobbles, dust and the odd scratch.
  const posterTex = new THREE.TextureLoader().load(new URL("../assets/film/r4n-live.jpg", import.meta.url).href, (t2) => { t2.colorSpace = THREE.SRGBColorSpace; });
  posterTex.colorSpace = THREE.SRGBColorSpace;
  const filmMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { map: { value: posterTex }, time: { value: 0 }, opacity: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float time, opacity; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
      void main(){
        float fr = floor(time * 8.0);
        vec2 j = (vec2(h(vec2(fr, 1.0)), h(vec2(fr, 2.0))) - 0.5) * 0.006;
        vec3 c = texture2D(map, clamp(vUv + j, 0.002, 0.998)).rgb;
        float l = dot(c, vec3(0.299, 0.587, 0.114));
        l += (h(floor(vUv * vec2(400.0, 470.0)) + fr * 7.13) - 0.5) * 0.2;
        l += step(0.9986, h(floor(vUv * vec2(150.0, 180.0)) + fr * 3.1)) * 0.45;
        float scratch = step(0.998, h(vec2(floor(vUv.x * 520.0), fr))) * step(0.82, h(vec2(fr, 9.0)));
        l = mix(l, 0.7, scratch * 0.45);
        l *= 0.9 + 0.1 * h(vec2(fr, 3.0));
        vec2 d = vUv - 0.5; l *= 1.0 - dot(d, d) * 1.1;
        gl_FragColor = vec4(vec3(0.97, 0.94, 0.87) * clamp(l, 0.0, 1.0) * 0.92, opacity);
      }`,
  });
  const [wx, wy, ww, wh] = PRINT.win;
  const filmMesh = new THREE.Mesh(new THREE.PlaneGeometry(PRINT.w * ww, PRINT.h * wh), filmMat);
  filmMesh.renderOrder = 10;
  filmMesh.position.set(PRINT.w * (wx + ww / 2 - 0.5), PRINT.h * (0.5 - wy - wh / 2), -0.0002);
  printMesh.add(filmMesh);
  let video = null;
  function playFilm(on) {
    if (on && !video) {
      video = document.createElement("video");
      Object.assign(video, { muted: true, loop: true, playsInline: true, preload: "auto", crossOrigin: "anonymous" });
      video.setAttribute("playsinline", ""); video.setAttribute("muted", "");
      video.src = filmSrc;
      video.addEventListener("playing", () => {
        if (filmMat.uniforms.map.value.isVideoTexture) return;
        const vt = new THREE.VideoTexture(video);
        vt.colorSpace = THREE.SRGBColorSpace;
        filmMat.uniforms.map.value = vt;
      }, { once: true });
    }
    if (!video) return;
    if (on) video.play().catch(() => {}); else video.pause();
  }
  let filmSrc = new URL("../assets/film/r4n-live.mp4", import.meta.url).href;
  const titleMesh = cutout(TITLE.w, TITLE.h, tex(titleArt()), 12);
  titleMesh.position.set(-0.01, 0.405, 0.0008); titleMesh.rotation.z = 0.028;
  // the ticket glows and breathes: warm light behind it, its gold catching it
  const ticketTex = [tex(ticketArt(false)), tex(ticketArt(true))];
  const ticketHolder = new THREE.Group();
  ticketHolder.position.set(0.025, -0.375, 0.0012); ticketHolder.rotation.z = 0.035;
  const ticket = cutout(TICKET.w, TICKET.h, ticketTex[0], 13);
  ticket.material.emissive = new THREE.Color(0xffffff);
  ticket.material.emissiveMap = ticketTex[0];
  const halo = new THREE.Mesh(new THREE.PlaneGeometry(TICKET.w * 1.9, TICKET.h * 3.2), new THREE.MeshBasicMaterial({ map: tex(haloArt()), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, opacity: 0 }));
  halo.renderOrder = 12;
  halo.position.z = -0.0004;
  // a glint of light that now and then sweeps across the ticket's gold
  const glint = new THREE.Mesh(ticket.geometry, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { map: { value: ticketTex[0] }, at: { value: -1 }, opacity: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: `
      uniform sampler2D map; uniform float at, opacity; varying vec2 vUv;
      void main(){
        vec4 c = texture2D(map, vUv);
        float d = vUv.x + (vUv.y - 0.5) * 0.35 - at;
        float band = exp(-d * d * 260.0);
        float gold = smoothstep(0.45, 0.85, max(c.r, c.g)); // the lettering and frame, most of all
        gl_FragColor = vec4(vec3(1.0, 0.86, 0.6) * band * c.a * (0.25 + 0.9 * gold) * opacity, 1.0);
      }`,
  }));
  glint.renderOrder = 14;
  glint.position.z = 0.0002;
  ticketHolder.add(halo, ticket, glint);
  const kick = spring(26, 0.22), kickZ = spring(30, 0.3);
  let nextNudge = 2.5, glintT = -1;
  // the close tab: crimson paper stuck in the top right corner of the open passport
  const tabTex = [tex(tabArt(false)), tex(tabArt(true))];
  const tab = new THREE.Mesh(new THREE.PlaneGeometry(TAB.w * (1 + 2 * PAD), TAB.h * (1 + 2 * PAD)), new THREE.MeshStandardMaterial({ map: tabTex[0], transparent: true, roughness: 0.8, depthWrite: false, opacity: 0 }));
  tab.renderOrder = 15;
  spreadFrame.add(tab);
  let tabHover = 0, overTab = false;
  centre.add(printMesh, titleMesh, ticketHolder);
  const centreMats = [printMesh.material, titleMesh.material, ticket.material];

  // ---- framing: never distorted (a narrow camera), sized to the screen; smooth edges ----
  // the scene is drawn into a multisampled target, so every edge and line is anti-aliased
  // (dense screens need fewer samples: their pixels are already small)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: software ? 0 : window.devicePixelRatio >= 2 ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.6, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  // while someone types on a phone, the keyboard takes half the screen: the passport stays exactly
  // where it was (no resizing under their fingers) until the keyboard has gone again
  let frozen = false, size = [window.innerWidth, window.innerHeight];
  function resize() {
    if (frozen) return;
    const w = window.innerWidth, h = window.innerHeight;
    size = [w, h];
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setPixelRatio(pixelRatio);
    renderer.setSize(w, h);
    composer.setPixelRatio(pixelRatio);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }
  function distanceFor(w, h, shareW, shareH) {
    const tn = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return Math.max(h / shareH / (2 * tn), w / shareW / (2 * tn * camera.aspect));
  }
  resize();
  window.addEventListener("resize", resize);
  // Keep it smooth: if frames keep coming slowly, draw fewer pixels; if that's not enough, stop
  // multisampling (each step once, and only ever down)
  let slowFor = 0, quality = software ? 0 : 2;
  function keepSmooth(raw) {
    if (quality === 0 || raw > 0.25) return; // (a long gap is a hidden tab, not a slow frame)
    slowFor = raw > 1 / 32 ? slowFor + raw : Math.max(0, slowFor - raw * 0.5);
    if (slowFor < 1.5) return;
    slowFor = 0; quality--;
    if (quality === 1) pixelRatio = Math.max(1, pixelRatio * 0.75);
    else { pixelRatio = 1; for (const rt of [composer.renderTarget1, composer.renderTarget2]) { rt.samples = 0; rt.dispose(); } }
    resize();
  }

  // ---- on top of the canvas: the hint, the corner that closes it, the cards, the form ----
  const el = (tag, cls, html = "") => { const e = document.createElement(tag); e.className = cls; e.innerHTML = html; return e; };
  // the hint: a label beside the passport with a line drawn to it, like a note on a mind map
  const hint = el("div", "booking__hint", `<svg class="booking__hintLine"><path pathLength="1" /><circle r="3.2" /></svg><span class="booking__hintText"></span>`);
  hint.setAttribute("aria-hidden", "true");
  const hintText = hint.querySelector(".booking__hintText"), hintPath = hint.querySelector("path"), hintDot = hint.querySelector("circle");
  const card = el("div", "pcard", `
    <div class="pcard__paper" role="dialog" aria-modal="false">
      <button type="button" class="pcard__x" aria-label="Close">✕</button>
      <p class="pcard__meta"></p><h2 class="pcard__title"></h2>
      <p class="pcard__text"></p><p class="pcard__sub"></p>
      <a class="pcard__link" target="_blank" rel="noopener noreferrer"></a>
    </div>`);
  const form = el("form", "pform", `
    <button type="button" class="pform__back"></button>
    <input class="pform__in" name="name" autocomplete="name" maxlength="120" />
    <input class="pform__in" name="email" type="email" autocomplete="email" inputmode="email" maxlength="160" />
    <textarea class="pform__in pform__msg" name="message" maxlength="4000"></textarea>
    <input class="pform__hp" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button type="submit" class="pform__send"></button>
    <p class="pform__note" aria-live="polite"></p>
    <img class="pform__stamp" alt="" />
    <svg class="pform__sign" viewBox="0 0 300 120" aria-hidden="true">${SIGNATURE.map((d) => `<path d="${d}" pathLength="1" />`).join("")}</svg>`);
  form.noValidate = true;
  // phones: writing happens on a card at the top of the screen, the keyboard below it
  const writer = el("div", "pwrite", `
    <div class="pwrite__card">
      <label class="pwrite__label"></label>
      <input class="pwrite__in" autocomplete="off" />
      <textarea class="pwrite__in pwrite__area" rows="5"></textarea>
      <div class="pwrite__row"><button type="button" class="pwrite__done"></button></div>
    </div>`);
  writer.hidden = true;
  layer.append(hint, card, form, writer);
  // the thank-you, over everything (the page darkens behind it)
  const thanks = el("div", "bthanks", `
    <div class="bthanks__paper" role="dialog" aria-modal="true" aria-labelledby="bthanksTitle">
      <button type="button" class="bthanks__x" aria-label="Close">✕</button>
      <p class="bthanks__mark">R4N · STUDIO 51</p>
      <h2 class="bthanks__title" id="bthanksTitle"></h2><p class="bthanks__text"></p>
    </div>`);
  thanks.hidden = true;
  document.body.appendChild(thanks);

  const F = (n) => form.querySelector(n);
  const fields = { name: F('[name="name"]'), email: F('[name="email"]'), message: F('[name="message"]'), send: F(".pform__send"), back: F(".pform__back"), note: F(".pform__note"), stamp: F(".pform__stamp"), sign: F(".pform__sign") };
  let sending = false, cardShown = null;
  // the words on top of the passport; on a change of language they morph, like the rest of the site
  const say = (e, text, animate) => (animate ? morph(e, text) : (e.textContent = text));
  function words(animate = false) {
    say(hintText, t(coarse ? "hintTap" : "hintClick"), animate);
    fields.name.placeholder = t("name"); fields.name.setAttribute("aria-label", t("name"));
    fields.email.placeholder = t("email"); fields.email.setAttribute("aria-label", "E-mail");
    fields.message.placeholder = t("message"); fields.message.setAttribute("aria-label", t("message"));
    if (!sending) say(fields.send, t("send"), animate);
    say(fields.back, t("back"), animate);
    say(thanks.querySelector(".bthanks__title"), t("thanksTitle"), animate);
    say(thanks.querySelector(".bthanks__text"), t("thanksText"), animate);
    say(writer.querySelector(".pwrite__done"), t("done"), animate);
    if (cardShown) showCard(cardShown, false, animate);
  }
  words();
  const offLang = onLang(() => { words(true); relang(); });

  // ---- motion ----
  // Something inside rattles it every second or two: a burst of hard jolts, side to side, each a
  // little smaller than the one before, on stiff springs, so it shakes and settles, never the same.
  const sy = spring(15, 0.3), srx = spring(19, 0.26), sry = spring(17, 0.28);
  const rz = spring(40, 0.16), rx = spring(36, 0.18);
  const lid = spring(13, 0.36);
  let nextEvent = 1.0, pending = [];
  let flare = 0, hover = 0, hoverGoal = 0, appear = 0, appearGoal = 0, ticketHover = 0;
  // opening is a timeline: the cover swings over, the leaves riffle past, it lands on the spread
  const COVER_END = 0.62, LEAF_START = 0.28, LEAF_GAP = 0.045, LEAF_DUR = 0.34;
  const LAND = LEAF_START + (LEAVES - 1) * LEAF_GAP + LEAF_DUR;
  const OPEN_END = LAND + 0.25;
  let openT = 0, opening = false, overTicket = false, overMemory = null;
  // the form: the spread's right page turns over onto it
  let formT = 0, formGoal = 0, formReady = null;
  // made ahead of time, it waits without drawing until it's shown
  let paused = true, raf = 0, last = performance.now(), time = 0, shownAt = 0, coverSound = false;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const hitTargets = [front, back, pagesMesh, inside, rightPage, ...[...leaves, formLeaf].flatMap((l) => [l.frontLeaf, l.backLeaf]), printMesh, titleMesh, ticket, tab];

  function jolt(m, dir) {
    const r = Math.random;
    rz.v += dir * m * (3.4 + 1.6 * r());
    rx.v += dir * m * (1.4 + 1.0 * r()) * (r() < 0.5 ? -1 : 1);
    srx.v += (r() - 0.5) * m * 1.1;
    sry.v += (r() - 0.5) * m * 1.1;
    sy.v += m * 0.16 * (r() - 0.3);
    lid.v += m * (0.3 + 0.35 * r());
    play("knock", { power: clamp(m, 0.25, 1.2) });
  }
  function rattle(power = 1) {
    const big = Math.random() < 0.35;
    const n = (big ? 6 : 4) + Math.floor(Math.random() * 4);
    let at = 0, dir = Math.random() < 0.5 ? -1 : 1;
    const m0 = power * (big ? 1.25 : 0.9) * (0.8 + 0.4 * Math.random());
    for (let i = 0; i < n; i++) {
      pending.push({ at: time + at, m: m0 * Math.pow(0.86, i) * (0.8 + 0.4 * Math.random()), dir });
      dir = -dir;
      at += 0.045 + Math.random() * 0.05;
    }
  }

  // spread units ↔ the screen (CSS pixels)
  const v3 = new THREE.Vector3();
  function toScreen(x, y, z = LIFT) {
    v3.set(x, y, z);
    spreadFrame.localToWorld(v3);
    v3.project(camera);
    return [(v3.x * 0.5 + 0.5) * size[0], (-v3.y * 0.5 + 0.5) * size[1]];
  }
  const pin = (e, x, y, w, h, z) => { // an element over a box in spread units ([x, y] its top left)
    const [sx, sy2] = toScreen(x, y, z), [ex, ey] = toScreen(x + w, y - h, z);
    Object.assign(e.style, { left: `${Math.min(sx, ex)}px`, top: `${Math.min(sy2, ey)}px`, width: `${Math.abs(ex - sx)}px`, height: `${Math.abs(ey - sy2)}px` });
  };
  let formShown = false, layoutKey = "";
  function placeForm() {
    const L = formLayout(vertical), z = formLeaf.pivot.position.z + 0.001;
    const [ox, oy] = toScreen(0, 0, z), [ux] = toScreen(1, 0, z);
    const unit = Math.abs(ux - ox);
    const keyNow = `${ox.toFixed(1)},${oy.toFixed(1)},${unit.toFixed(2)}`;
    if (keyNow === layoutKey) return;
    layoutKey = keyNow;
    const box = (e, [x, y, w, h]) => pin(e, x, y + h, w, h, z);
    box(fields.name, L.name); box(fields.email, L.email);
    const [mx, my, mw, mh, rows] = L.message;
    pin(fields.message, mx, my, mw, mh, z);
    fields.message.style.lineHeight = `${(mh / rows) * unit}px`;
    box(fields.send, L.send); box(fields.back, L.back);
    // notes (an error) just under the send button
    pin(fields.note, L.send[0] - 0.15, L.send[1] - 0.012, L.send[2] + 0.3, 0.08, z);
    // R4N's box: the stamp on the left half, the signature over its line on the right
    const [ox2, oy2, ow, oh] = L.office;
    pin(fields.stamp, ox2 + ow * 0.04, oy2 + oh * 0.5 + ow * 0.1, ow * 0.36, ow * 0.2, z);
    pin(fields.sign, ox2 + ow * 0.53, oy2 + oh * 0.95, ow * 0.42, oh * 0.86, z);
    form.style.setProperty("--u", `${unit}px`);
  }
  // the hint's label and line: the label in the clear space beside the passport (below it on a
  // tall screen), the line ending in a dot on the cover
  const scr = (x, y) => { v3.set(x, y, T); body.localToWorld(v3).project(camera); return [(v3.x * 0.5 + 0.5) * size[0], (-v3.y * 0.5 + 0.5) * size[1]]; };
  function placeHint() {
    const [ax, ay] = scr(0.18, -0.12);
    let lx, ly;
    if (tall()) { const [, by] = scr(0, -H / 2); lx = size[0] / 2; ly = Math.min(size[1] - 90, by + 70); }
    else { const [ex] = scr(W / 2, 0); lx = Math.min(size[0] - 120, ex + 150); ly = ay - 70; }
    hintText.style.left = `${lx}px`; hintText.style.top = `${ly}px`;
    // the line leaves from the label's near side and bends a little on its way
    const sx = tall() ? lx : lx - hintText.offsetWidth / 2 - 10, sy = tall() ? ly - 16 : ly;
    const mx = (sx + ax) / 2 + (tall() ? 40 : 0), my = (sy + ay) / 2 - (tall() ? 0 : 40);
    hintPath.setAttribute("d", `M${sx.toFixed(1)} ${sy.toFixed(1)} Q${mx.toFixed(1)} ${my.toFixed(1)} ${ax.toFixed(1)} ${ay.toFixed(1)}`);
    hintDot.setAttribute("cx", ax.toFixed(1)); hintDot.setAttribute("cy", ay.toFixed(1));
  }
  // the close tab, stuck in the page's top right corner (inside it, so no screen edge can cut it)
  function placeTab() {
    const [x, y] = vertical ? [PH / 2, PW] : [PW, PH / 2];
    tab.position.set(x - TAB.w * 0.5 - 0.035, y - TAB.h * 0.5 - 0.03, LIFT + STEP * (LEAVES + 5) - 0.0006);
  }

  const POSE = { x: -0.2, y: 0.16, z: -0.09 };
  const tall = () => size[1] > size[0] * 1.05;
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
    last = now;
    if (paused) return;
    keepSmooth(raw);
    time += dt;
    appear += (appearGoal - appear) * (1 - Math.exp(-dt * (appearGoal > appear ? 2.4 : 5)));
    hover += (hoverGoal - hover) * (1 - Math.exp(-dt * 6));
    ticketHover += ((overTicket ? 1 : 0) - ticketHover) * (1 - Math.exp(-dt * 10));
    // the form turns first; only once it's back does the passport close
    formT = clamp(formT + (formGoal ? dt : -dt) / (reducedMotion ? 0.15 : 0.75), 0, 1);
    const closingHeld = !opening && formT > 0;
    if (!closingHeld) openT = clamp(openT + (opening ? dt : -dt * 1.8) * (reducedMotion ? 6 : 1), 0, OPEN_END);
    const k = ease(clamp(openT / 0.95, 0, 1));          // pose and camera
    const coverK = ease(clamp(openT / COVER_END, 0, 1));

    // the rattling: only while closed and in view
    if (!reducedMotion && !opening && openT === 0 && appear > 0.9 && appearGoal === 1) {
      nextEvent -= dt;
      if (nextEvent <= 0) { rattle(); nextEvent = 1.0 + Math.random() * 1.6; }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (time >= pending[i].at) { jolt(pending[i].m, pending[i].dir); pending.splice(i, 1); }
    const rest = openT > 0 ? 0 : 0.003 * (0.5 + 0.5 * Math.sin(time * 0.9));
    for (const s of [sy, srx, sry, rz, rx]) stepSpring(s, 0, dt);
    stepSpring(lid, rest, dt);
    const lift = Math.max(0, lid.x);

    // the leaves: each turns over in its turn, curling as it goes; light shines through them
    let riffle = 0;
    if (opening && openT > 0.02 && !coverSound) { coverSound = true; play("cover"); }
    if (openT === 0) coverSound = false;
    leaves.forEach((l, i) => {
      const turn = Math.PI * ease(clamp((openT - LEAF_START - i * LEAF_GAP) / LEAF_DUR, 0, 1));
      l.pivot.visible = openT > LEAF_START * 0.5;
      if (!l.pivot.visible) return;
      if (Math.abs(turn - l.turn) > 1e-4) {
        bendLeaf(l.geo, turn); bendLeaf(l.backGeo, turn);
        l.turn = turn;
      }
      const up = turn > 0.25;
      if (up !== l.flipped) { l.flipped = up; play("flip"); }
      const on = turn / Math.PI;
      l.pivot.position.z = LIFT + STEP * (1 + mix(LEAVES - i, i, on));
      const glowThrough = Math.sin(turn);
      l.frontLeaf.material.emissiveIntensity = l.backLeaf.material.emissiveIntensity = glowThrough * 0.35;
      riffle += glowThrough;
    });
    rightPage.visible = openT > LEAF_START * 0.5;
    // the page turning over to the form (and back)
    {
      const turn = Math.PI * ease(formT);
      formLeaf.pivot.visible = formT > 0;
      if (formLeaf.pivot.visible && Math.abs(turn - formLeaf.turn) > 1e-4) {
        bendLeaf(formLeaf.geo, turn); bendLeaf(formLeaf.backGeo, turn);
        formLeaf.turn = turn;
      }
      const glowThrough = Math.sin(turn);
      formLeaf.frontLeaf.material.emissiveIntensity = formLeaf.backLeaf.material.emissiveIntensity = glowThrough * 0.35;
      riffle += glowThrough;
    }
    flare += (clamp(lift * 3 + Math.abs(rz.v) * 0.01 + riffle * 0.22, 0, 1.0) - flare) * (1 - Math.exp(-dt * 10));

    // back from the form, by whatever way: the spread's page goes back under the leaf
    if (formT === 0 && formGoal === 0 && D && rightPage.material.map !== D.spreadR) { rightPage.material.map = D.spreadR; rightPage.material.needsUpdate = true; }

    // across the fold: there as the last page lands; lifted off while the form is out
    const centreIn = clamp((openT - (LAND - 0.12)) / 0.18, 0, 1) * (1 - clamp(formT * 3, 0, 1));
    centre.visible = centreIn > 0;
    for (const m of centreMats) m.opacity = centreIn;
    filmMat.uniforms.opacity.value = centreIn;
    filmMat.uniforms.time.value = time;
    centre.scale.setScalar(1 + (1 - ease(centreIn)) * 0.04);
    const pulse = 0.5 + 0.5 * Math.sin(time * 2.6);
    halo.material.opacity = centreIn * (0.35 + 0.3 * pulse + 0.45 * ticketHover);
    halo.scale.setScalar(1 + 0.06 * pulse + 0.1 * ticketHover);
    ticket.material.emissiveIntensity = 0.06 + 0.09 * pulse + 0.2 * ticketHover;
    // every few seconds the ticket gives a little nudge (it wants to be picked up), and the light
    // runs across its gold
    if (centreIn === 1 && !formGoal && !reducedMotion) {
      nextNudge -= dt;
      if (nextNudge <= 0) { nextNudge = 3.2 + Math.random() * 1.6; kick.v += (Math.random() < 0.5 ? -1 : 1) * 2.2; kickZ.v += 0.9; glintT = 0; }
    }
    stepSpring(kick, overTicket ? 0.06 : 0, dt); stepSpring(kickZ, 0, dt);
    if (glintT >= 0) { glintT += dt / 0.9; if (glintT > 1) glintT = -1; }
    glint.material.uniforms.at.value = glintT < 0 ? -1 : mix(-0.3, 1.3, glintT);
    glint.material.uniforms.opacity.value = centreIn * (overTicket ? 1.2 : 1);
    if (overTicket && glintT < 0 && Math.random() < dt * 1.2) glintT = 0;
    ticketHolder.rotation.z = 0.035 + kick.x * 0.08;
    ticketHolder.scale.setScalar(1 + 0.012 * pulse + 0.05 * ticketHover + Math.max(0, kickZ.x) * 0.04);
    ticketHolder.position.z = 0.0012 + 0.006 * ticketHover + Math.max(0, kickZ.x) * 0.01;
    // the close tab: there whenever it's open (the form too), lifting a touch under the pointer
    const tabIn = opening && appearGoal === 1 ? clamp((openT - (LAND - 0.05)) / 0.2, 0, 1) : 0;
    tabHover += ((overTab ? 1 : 0) - tabHover) * (1 - Math.exp(-dt * 10));
    tab.visible = tabIn > 0;
    tab.material.opacity = tabIn;
    if (tab.visible) { placeTab(); tab.position.y += tabHover * 0.01; tab.scale.setScalar(1 + tabHover * 0.04); }

    // pose: tilted and floating when closed; flat, facing you, turned for the screen when open.
    // On tall screens it sits a little above the middle (the hint and the links are below it).
    const float = Math.sin(time * 1.1) * 0.01 * (1 - k);
    const viewH = 2 * camera.position.z * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    passport.position.set(0, float + (tall() ? viewH * mix(0.06, 0.035, k) : 0), (1 - appear) * -5);
    passport.rotation.set(
      mix(POSE.x + Math.sin(time * 0.7) * 0.02 + pointer.y * 0.05 * hover, -0.02, k),
      mix(POSE.y + Math.sin(time * 0.55) * 0.03 + pointer.x * 0.07 * hover, 0, k),
      mix(POSE.z + Math.sin(time * 0.45) * 0.01, vertical ? -Math.PI / 2 : 0, k)
    );
    body.position.set(W / 2 * k + rx.x * 0.022, sy.x, 0);
    body.rotation.set(srx.x * 0.06, sry.x * 0.06, rz.x * 0.06);
    hinge.rotation.y = -(lift * 0.9 + coverK * Math.PI);
    spine.visible = coverK < 0.6; // open, the fold must never show between the pages
    // open, the back cover comes up to the pages, so its red rim shows round them (as the front's does)
    back.position.z = mix(-PAGES / 2, LIFT - 0.0012, coverK);
    spreadFrame.rotation.z = vertical ? Math.PI / 2 : 0;

    // the camera: the closed booklet takes a good part of the screen; open, it fills it
    const closedD = distanceFor(W * 1.1, H * 1.05, 0.62, 0.56);
    const openD = vertical ? distanceFor(H, 2 * W, 1.0, 0.9) : distanceFor(2 * W, H, 0.98, 0.93);
    camera.position.set(0, 0, mix(closedD, openD, k));
    camera.lookAt(0, 0, 0);

    // the light: from the gaps of the block and from what the cover has swept as it swung, then
    // from round the whole spread and its fold
    const glow = appear * (0.85 + 0.15 * hover);
    const u = sheet.material.uniforms;
    u.time.value = time; u.flare.value = flare + hover * 0.2; u.power.value = glow; u.opened.value = coverK;
    const swing = lift * 0.9 + coverK * Math.PI;
    u.box.value.set(-W / 2 + Math.min(0, PW * Math.cos(swing)), -W / 2 + PW, PH, 0);
    // open, the light comes from behind the whole booklet
    sheet.position.z = -coverK * (T / 2 + 0.003);
    gutter.visible = coverK > 0.5;
    gutter.material.uniforms.time.value = time;
    gutter.material.uniforms.power.value = glow * clamp((coverK - 0.5) * 2, 0, 1) * (0.7 + flare * 0.6);
    pageEdgeMat.emissiveIntensity = (0.75 + flare * 1.2 + hover * 0.25) * glow;
    for (const l of glowLights) l.intensity = (0.05 + flare * 0.35) * glow * (1 - coverK);
    key.intensity = 1.15 + k * 0.55;
    bloom.strength = 0.42 + flare * 0.3;
    canvas.style.opacity = String(clamp(appear * 1.6, 0, 1));

    document.documentElement.classList.toggle("passport-open", k > 0.5 && appearGoal === 1);
    // the hint, beside the passport, if nothing's happened for a while
    const hintOn = !opening && openT === 0 && appear > 0.9 && appearGoal === 1 && time - shownAt > 4;
    if (hintOn) placeHint();
    hint.classList.toggle("is-on", hintOn);
    if ((!opening || openT < LAND) && cardShown) hideCard();
    // the form's fields, over the pages, once the page has turned
    const showForm = formT === 1 && formGoal === 1 && openT >= OPEN_END - 0.01;
    if (showForm) placeForm();
    if (showForm !== formShown) {
      formShown = showForm;
      form.classList.toggle("is-on", showForm);
      if (!showForm) layoutKey = "";
    }
    composer.render();
  }

  // ---- the cards: what a stamp is about ----
  const cardFor = (id) => liveCard(id.split(":")[1], lang());
  function showCard(id, sound = true, animate = false) {
    const c = cardFor(id);
    if (!c) return;
    cardShown = id;
    const q = (s) => card.querySelector(s);
    say(q(".pcard__meta"), c.meta || "", animate);
    say(q(".pcard__title"), c.title, animate);
    say(q(".pcard__text"), c.text || "", animate);
    q(".pcard__sub").textContent = c.sub || "";
    q(".pcard__sub").hidden = !c.sub;
    const a = q(".pcard__link");
    a.hidden = !c.link;
    if (c.link) { a.href = c.link; a.textContent = /spotify/.test(c.link) ? t("listenSpotify") : /instagram/.test(c.link) ? "Instagram ↗" : t("more"); }
    card.classList.add("is-on");
    if (sound) play("card");
  }
  function hideCard() { cardShown = null; card.classList.remove("is-on"); }
  card.addEventListener("click", (e) => { if (e.target === card || e.target.closest(".pcard__x")) { hideCard(); play("click"); } });

  // what's under the pointer on the open spread (a stamp, say), from where it hits the page
  const hitV = new THREE.Vector3();
  function memoryAt(hit) {
    if (!hit || !D || (hit.object !== rightPage && hit.object !== lastLeaf.backLeaf)) return null;
    hitV.copy(hit.point);
    spreadFrame.worldToLocal(hitV);
    for (const m of D.hits) {
      const dx = hitV.x - m.x, dy = hitV.y - m.y, c = Math.cos(-m.rot), s = Math.sin(-m.rot);
      if (Math.abs(dx * c - dy * s) < m.w / 2 && Math.abs(dx * s + dy * c) < m.h / 2) return m.id;
    }
    return null;
  }

  // ---- the form ----
  async function toForm() {
    if (formGoal) return;
    const want = vertical;
    const f = await (formReady ||= formDeck(vertical));
    if (want !== vertical || !opening) return;
    rightPage.material.map = f.R; rightPage.material.needsUpdate = true;
    formLeaf.frontLeaf.material.map = D.spreadR;
    formLeaf.backLeaf.material.map = f.L;
    formLeaf.frontLeaf.material.needsUpdate = formLeaf.backLeaf.material.needsUpdate = true;
    formGoal = 1;
    overTicket = false;
    hideCard();
    play("page");
  }
  function fromForm() {
    if (!formGoal) return;
    formGoal = 0;
    closeWriter(false);
    document.activeElement?.blur?.();
    play("page");
    // (once it has turned back, tick() puts the spread's page back under it)
  }
  const note = (s, bad = false) => { fields.note.textContent = s; fields.note.classList.toggle("is-bad", bad); };
  const wait = (ms) => new Promise((r) => setTimeout(r, reducedMotion ? Math.min(ms, 200) : ms));
  function resetForm() {
    for (const f of [fields.name, fields.email, fields.message]) { f.value = ""; f.classList.remove("is-bad"); }
    form.classList.remove("is-stamped", "is-signed");
    fields.send.textContent = t("send");
    note("");
  }
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending) return;
    const name = fields.name.value.trim(), email = fields.email.value.trim(), message = fields.message.value.trim();
    for (const f of [fields.name, fields.email, fields.message]) f.classList.remove("is-bad");
    const bad = (f, msg) => { f.classList.add("is-bad"); if (!coarse) f.focus(); note(t(msg), true); play("knock", { power: 0.5 }); };
    if (!name) return bad(fields.name, "needName");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) return bad(fields.email, "needEmail");
    if (message.length < 4) return bad(fields.message, "needMessage");
    sending = true;
    fields.send.textContent = t("sending");
    note("");
    play("send");
    try {
      // sent straight from the page to R4N's inbox (through FormSubmit); nothing else opens
      const res = await fetch(SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, message, _subject: `Booking: ${name}`, _replyto: email, _template: "table", _captcha: "false", _honey: F(".pform__hp").value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || String(j.success) !== "true") throw new Error(j.message || res.status);
    } catch (err) {
      console.warn("booking form:", err);
      sending = false;
      fields.send.textContent = t("send");
      return note(t("sendFailed"), true);
    }
    // received: R4N's box is stamped with today's date, then signed; the passport closes and says thanks
    const d = new Date(), pad = (n) => String(n).padStart(2, "0");
    const stampCanvas = receivedStamp(`${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(2)}`);
    fields.stamp.src = stampCanvas.toDataURL("image/png");
    fields.send.textContent = "✓";
    await wait(250);
    form.classList.add("is-stamped");
    play("stamp"); jolt(0.7, 1);
    await wait(650);
    form.classList.add("is-signed");
    play("pen", { dur: 1.3 });
    await wait(1900);
    // stamp and signature onto the page itself, so they stay as it turns back
    const f = await formReady;
    stampForm(f.canvasL, DIMS, vertical, stampCanvas, SIGNATURE);
    f.L.needsUpdate = true;
    fromForm();
    await wait(800);
    api.close();
    await wait(900);
    sending = false;
    resetForm();
    // the form page clean again for next time
    f.canvasL.getContext("2d").drawImage(f.clean, 0, 0);
    f.L.needsUpdate = true;
    showThanks();
  });
  fields.back.dataset.sound = fields.send.dataset.sound = "none"; // (they make their own: a page, a breath)
  fields.back.addEventListener("click", fromForm);
  for (const f of [fields.name, fields.email, fields.message]) f.addEventListener("keydown", () => play("type"));

  function showThanks() {
    thanks.hidden = false;
    requestAnimationFrame(() => thanks.classList.add("is-on"));
    play("chime");
    thanks.querySelector(".bthanks__x").focus({ preventScroll: true });
  }
  function hideThanks() {
    thanks.classList.remove("is-on");
    setTimeout(() => { thanks.hidden = true; }, 400);
    play("click");
  }
  thanks.addEventListener("click", (e) => { if (e.target === thanks || e.target.closest(".bthanks__x")) hideThanks(); });

  // ---- phones: the writing card ----
  let writing = null;
  const wIn = writer.querySelector("input.pwrite__in"), wArea = writer.querySelector(".pwrite__area");
  function openWriter(f) {
    writing = f;
    frozen = true;
    canvas.style.height = `${size[1]}px`; // the keyboard mustn't squash it
    const area = f === fields.message;
    const input = area ? wArea : wIn;
    wIn.hidden = area; wArea.hidden = !area;
    wIn.type = f === fields.email ? "email" : "text";
    wIn.inputMode = f === fields.email ? "email" : "text";
    writer.querySelector(".pwrite__label").textContent = f === fields.name ? t("labelName") : f === fields.email ? t("labelEmail") : t("labelMessage");
    input.placeholder = f.placeholder;
    input.value = f.value;
    writer.hidden = false;
    writer.classList.add("is-on");
    input.focus({ preventScroll: true });
    window.scrollTo(0, 0);
  }
  function closeWriter(next = false) {
    if (!writing) return;
    const f = writing, area = f === fields.message;
    f.value = (area ? wArea : wIn).value;
    f.classList.remove("is-bad");
    writing = null;
    writer.classList.remove("is-on");
    writer.hidden = true;
    document.activeElement?.blur?.();
    if (next && f !== fields.message) return openWriter(f === fields.name ? fields.email : fields.message);
    // the keyboard goes away; then the passport may follow the screen again
    setTimeout(() => { frozen = false; canvas.style.height = ""; resize(); }, 350);
  }
  writer.querySelector(".pwrite__done").addEventListener("click", () => closeWriter(true));
  wIn.addEventListener("keydown", (e) => { play("type"); if (e.key === "Enter") { e.preventDefault(); closeWriter(true); } });
  wArea.addEventListener("keydown", () => play("type"));
  writer.addEventListener("click", (e) => { if (e.target === writer) closeWriter(false); });
  if (coarse) {
    for (const f of [fields.name, fields.email, fields.message]) {
      f.readOnly = true;
      f.addEventListener("click", (e) => { e.preventDefault(); openWriter(f); });
    }
  }

  // ---- pointer: hover warms it; a click opens it; open, a stamp tells its story, the ticket
  // turns to the form, the corner (or a click outside) closes it ----
  function hitAt(e) {
    pointer.set((e.clientX / size[0]) * 2 - 1, -(e.clientY / size[1]) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(hitTargets, false).find((h) => {
      let o = h.object;
      while (o) { if (!o.visible) return false; o = o.parent; }
      return true;
    }) || null;
  }
  const spreadUp = () => opening && openT >= LAND && !formGoal;
  const onMove = (e) => {
    if (e.pointerType === "touch") return;
    const hit = hitAt(e), obj = hit?.object;
    const nowOver = spreadUp() && obj === ticket;
    if (nowOver !== overTicket) { overTicket = nowOver; ticket.material.map = ticket.material.emissiveMap = ticketTex[overTicket ? 1 : 0]; if (nowOver) play("hover"); }
    const mem = spreadUp() && !nowOver ? memoryAt(hit) : null;
    if (mem !== overMemory) { overMemory = mem; if (mem) play("hover"); }
    const nowTab = opening && obj === tab;
    if (nowTab !== overTab) { overTab = nowTab; tab.material.map = tabTex[nowTab ? 1 : 0]; if (nowTab) play("hover"); }
    if (!opening && obj && hoverGoal === 0) play("hover");
    hoverGoal = obj && !opening ? 1 : 0;
    canvas.style.cursor = overTicket || mem || overTab || (obj && !opening) ? "pointer" : opening && !obj ? "zoom-out" : "";
  };
  const onLeave = () => { hoverGoal = 0; canvas.style.cursor = ""; };
  const onClick = (e) => {
    const hit = hitAt(e), obj = hit?.object;
    if (!opening) { if (obj) { play("click"); api.open(); } return; }
    if (obj === tab) { play("click"); api.close(); return; }
    if (cardShown) { hideCard(); return; }
    if (obj === ticket && spreadUp()) { play("click"); toForm(); return; }
    const mem = spreadUp() ? memoryAt(hit) : null;
    if (mem) { showCard(mem); return; }
    // a click beside it: from the form, back to the spread; from the spread, closed
    if (!obj) { if (formGoal) fromForm(); else api.close(); }
  };
  const onKey = (e) => {
    if (e.key !== "Escape") return;
    if (!thanks.hidden) return hideThanks();
    if (writing) return closeWriter(false);
    if (cardShown) return hideCard();
    if (!opening) return;
    if (formGoal) fromForm(); else api.close();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey);

  // prepare every shader now (the open parts too), so nothing stalls the first time it's seen
  for (const l of [...leaves, formLeaf]) l.pivot.visible = true;
  rightPage.visible = gutter.visible = centre.visible = true;
  renderer.compile(scene, camera);
  for (const l of [...leaves, formLeaf]) l.pivot.visible = false;
  rightPage.visible = gutter.visible = centre.visible = false;
  raf = requestAnimationFrame(tick);

  let opens = 0;
  const api = {
    canvas,
    get isOpen() { return opening; },
    get onSpread() { return spreadUp(); }, // open and settled on the spread
    show(animate = true) {
      appearGoal = 1;
      if (!animate) appear = 1;
      nextEvent = 1.0; paused = false; last = performance.now(); shownAt = time;
    },
    // leaving: it sinks straight back into the dark and fades, as it came
    hide(animate = true) {
      opening = false; formGoal = 0; appearGoal = 0;
      hideCard(); closeWriter(false); playFilm(false);
      if (!animate || reducedMotion) { appear = 0; openT = 0; formT = 0; return Promise.resolve(); }
      return new Promise((r) => setTimeout(() => { openT = 0; formT = 0; r(); }, 600));
    },
    async open() {
      if (opening) return;
      const n = ++opens;
      const v = window.innerHeight > window.innerWidth * 1.05;
      if (openT === 0 && (v !== vertical || !D)) {
        const d = await deck(v);
        if (n !== opens || openT !== 0) return;
        vertical = v; D = d; dress(); formReady = null;
      }
      opening = true; hoverGoal = 0; pending = [];
      playFilm(true);
      // the form's pages are drawn while the spread is looked at, so BOOK NOW turns at once
      setTimeout(() => { formReady ||= formDeck(vertical); }, 1600);
    },
    close() {
      if (!opening) return;
      opening = false; formGoal = 0; hideCard(); closeWriter(false);
      document.activeElement?.blur?.();
      playFilm(false);
      play("close");
    },
    // open at the booking form (what the ticket does)
    book() { if (spreadUp()) toForm(); },
    setVideo(url) { filmSrc = url; if (video) { video.src = url; video.play().catch(() => {}); } },
    setPaused(p) { paused = p; last = performance.now(); if (p) playFilm(false); else if (opening) playFilm(true); },
    ready,
    dispose() {
      cancelAnimationFrame(raf);
      offLang();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      for (const e of [canvas, hint, card, form, writer, thanks]) e.remove();
    },
  };
  return api;
}

// warm light for behind the ticket: soft at the middle, gone at the edges
function haloArt() {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  g.translate(128, 64); g.scale(1, 0.5);
  const grd = g.createRadialGradient(0, 0, 10, 0, 0, 126);
  grd.addColorStop(0, "rgba(255,170,80,0.9)"); grd.addColorStop(0.45, "rgba(255,120,50,0.35)"); grd.addColorStop(1, "rgba(255,90,40,0)");
  g.fillStyle = grd; g.beginPath(); g.arc(0, 0, 126, 0, Math.PI * 2); g.fill();
  return c;
}
