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
//   p.setVideo(url)  // the film on the spread (a stop-motion loop of the show); a placeholder till then

import * as THREE from "three";
import { EffectComposer } from "../vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "../vendor/addons/environments/RoomEnvironment.js";
import {
  coverArt, pageEdges, spreadPages, leafPages, formPages, formLayout, pressSent,
  printArt, titleArt, ticketArt, filmPlaceholder, PAD, PRINT, TITLE, TICKET,
} from "./passport-art.js";
import { t, onLang } from "./i18n.js";

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
      float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 c = vec2((box.x + box.y) * 0.5, 0.0);
        vec2 half_ = vec2((box.y - box.x) * 0.5, box.z * 0.5);
        vec2 p = vP - c;
        float d = sdBox(p, half_, ${R.toFixed(3)});
        if (d < 0.0) discard;
        float a = atan(p.y, p.x);
        float rays = noise(a * 18.0 + time * 0.3) * 0.55 + noise(a * 41.0 - time * 0.5 + 7.0) * 0.35 + noise(a * 7.0 + time * 0.12 + 3.0) * 0.3;
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

export async function createPassport(layer) {
  await Promise.all(["600", "700"].map((w) => new FontFace("Cinzel", `url(${new URL(`../assets/fonts/cinzel-latin-${w}-normal.woff2`, import.meta.url)})`, { weight: w }).load().then((f) => document.fonts.add(f))));

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
    const t2 = new THREE.CanvasTexture(c);
    if (srgb) t2.colorSpace = THREE.SRGBColorSpace;
    t2.anisotropy = Math.min(8, maxAniso);
    return t2;
  };

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
  const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 400);

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

  const art = await coverArt(H / W);

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

  // ---- inside: pages drawn for the screen (sharp enough for it), already filled ----
  const pageSize = (vertical) => {
    const long = clamp(Math.round((vertical ? window.innerWidth : window.innerHeight) * pixelRatio * 1.05), 1024, 2048);
    return [Math.round(long * PW / PH), long];
  };
  const leafRes = (() => { const [a, b] = pageSize(window.innerHeight > window.innerWidth * 1.05); return [Math.round(a * 0.55), Math.round(b * 0.55)]; })();
  const pageMat = (map, back = false) => new THREE.MeshStandardMaterial({
    map, roughness: 0.92, side: back ? THREE.BackSide : THREE.FrontSide,
    alphaTest: 0.5, emissive: 0xffb060, emissiveIntensity: 0,
  });
  // drawn for the way it was first held; drawn again (once) if it opens the other way
  const decks = { wide: null, tall: null };
  async function deck(vertical) {
    const k = vertical ? "tall" : "wide";
    if (!decks[k]) {
      decks[k] = (async () => {
        const [tw, th] = leafRes;
        const leaves = await leafPages(DIMS, tw, th, vertical, 3);
        const [sw, sh] = pageSize(vertical);
        const spread = await spreadPages(DIMS, sw, sh, vertical);
        return {
          leafL: leaves.L.map((c) => tex(c)), leafR: leaves.R.map((c) => tex(c)),
          spreadL: tex(spread.L), spreadR: tex(spread.R), form: null,
        };
      })();
    }
    return decks[k];
  }
  async function formDeck(vertical) {
    const d = await deck(vertical);
    if (!d.form) {
      d.form = (async () => {
        const [sw, sh] = pageSize(vertical);
        const f = await formPages(DIMS, sw, sh, vertical);
        return { L: tex(f.L), R: tex(f.R), canvasR: f.R };
      })();
    }
    return d.form;
  }
  let vertical = window.innerHeight > window.innerWidth * 1.05;
  let D = await deck(vertical);

  const LIFT = T / 2 + 0.0006;   // just above the spine fold, so it never shows inside
  const STEP = 0.00035;          // each leaf's thickness, as far as the eye can tell
  // the inside of the front cover: the endpaper, the size of a page (the red rim shows round it)
  const insideGeo = new THREE.ShapeGeometry(panelShape(PW, PH, R * 0.85), 10);
  {
    const uv = insideGeo.attributes.uv, pos = insideGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - pos.getX(i) / PW, pos.getY(i) / PH + 0.5);
  }
  const inside = new THREE.Mesh(insideGeo, pageMat(D.leafL[2], true));
  inside.position.z = -0.0009;
  hinge.add(inside);

  const flatPage = new THREE.ShapeGeometry(panelShape(PW, PH, R * 0.85), 10);
  {
    const uv = flatPage.attributes.uv, pos = flatPage.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / PW, pos.getY(i) / PH + 0.5);
  }
  const rightPage = new THREE.Mesh(flatPage, pageMat(D.spreadR));
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
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, z);
    pivot.add(frontLeaf, backLeaf);
    pivot.visible = false;
    body.add(pivot);
    return { pivot, geo, backGeo, frontLeaf, backLeaf, turn: -1 };
  }
  const leaves = Array.from({ length: LEAVES }, () => makeLeaf(LIFT));
  const formLeaf = makeLeaf(LIFT + STEP * (LEAVES + 3));
  function dress() { // put the pages for this way of holding it on
    inside.material.map = D.leafL[2];
    rightPage.material.map = D.spreadR;
    leaves.forEach((l, i) => {
      l.frontLeaf.material.map = D.leafR[i % 3];
      l.backLeaf.material.map = i === LEAVES - 1 ? D.spreadL : D.leafL[(i + 1) % 3];
    });
    formLeaf.frontLeaf.material.map = D.spreadR;
    for (const m of [inside, rightPage, ...leaves.flatMap((l) => [l.frontLeaf, l.backLeaf]), formLeaf.frontLeaf]) m.material.needsUpdate = true;
  }
  dress();
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
  const film = filmPlaceholder();
  const filmTex = tex(film.canvas);
  const cutout = (w, h, map, order) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w * (1 + 2 * PAD), h * (1 + 2 * PAD)), new THREE.MeshStandardMaterial({ map, transparent: true, roughness: 0.8, depthWrite: false, opacity: 1 }));
    m.renderOrder = order;
    return m;
  };
  const printMesh = cutout(PRINT.w, PRINT.h, tex(printArt()), 11);
  printMesh.position.set(0, 0.03, 0.0004); printMesh.rotation.z = -0.025;
  const [wx, wy, ww, wh] = PRINT.win;
  const filmMesh = new THREE.Mesh(new THREE.PlaneGeometry(PRINT.w * ww, PRINT.h * wh), new THREE.MeshStandardMaterial({ map: filmTex, roughness: 0.55, transparent: true }));
  filmMesh.renderOrder = 10;
  filmMesh.position.set(PRINT.w * (wx + ww / 2 - 0.5), PRINT.h * (0.5 - wy - wh / 2), -0.0002);
  printMesh.add(filmMesh);
  const titleMesh = cutout(TITLE.w, TITLE.h, tex(titleArt()), 12);
  titleMesh.position.set(-0.01, 0.405, 0.0008); titleMesh.rotation.z = 0.028;
  const ticketTex = [tex(ticketArt(false)), tex(ticketArt(true))];
  const ticket = cutout(TICKET.w, TICKET.h, ticketTex[0], 13);
  ticket.position.set(0.025, -0.335, 0.0012); ticket.rotation.z = 0.035;
  centre.add(printMesh, titleMesh, ticket);
  const centreMats = [printMesh.material, filmMesh.material, titleMesh.material, ticket.material];

  // ---- framing: never distorted (a narrow camera), sized to the screen; smooth edges ----
  // the scene is drawn into a multisampled target, so every edge and line is anti-aliased
  // (dense screens need fewer samples: their pixels are already small)
  const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType, samples: software ? 0 : window.devicePixelRatio >= 2 ? 2 : 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.6, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
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

  // ---- on top of the canvas: the hint, and the form's real fields ----
  const hint = document.createElement("p");
  hint.className = "booking__hint";
  hint.setAttribute("aria-hidden", "true");
  layer.appendChild(hint);
  const form = document.createElement("form");
  form.className = "pform";
  form.noValidate = true;
  form.innerHTML = `
    <button type="button" class="pform__back"></button>
    <input class="pform__in" name="name" autocomplete="name" maxlength="120" />
    <input class="pform__in" name="email" type="email" autocomplete="email" inputmode="email" maxlength="160" />
    <textarea class="pform__in pform__msg" name="message" maxlength="4000"></textarea>
    <input class="pform__hp" name="_honey" tabindex="-1" autocomplete="off" aria-hidden="true" />
    <button type="submit" class="pform__send"></button>
    <p class="pform__note" aria-live="polite"></p>`;
  layer.appendChild(form);
  const F = (n) => form.querySelector(n);
  const fields = { name: F('[name="name"]'), email: F('[name="email"]'), message: F('[name="message"]'), send: F(".pform__send"), back: F(".pform__back"), note: F(".pform__note") };
  function words() {
    hint.textContent = t(coarse ? "hintTap" : "hintClick");
    fields.name.placeholder = t("name"); fields.name.setAttribute("aria-label", t("name"));
    fields.email.placeholder = t("email"); fields.email.setAttribute("aria-label", "E-mail");
    fields.message.placeholder = t("message"); fields.message.setAttribute("aria-label", t("message"));
    if (!sending) fields.send.textContent = t("send");
    fields.back.textContent = t("back");
  }
  let sending = false, sentOnce = false;
  words();
  const offLang = onLang(words);

  // ---- motion ----
  // Something inside rattles it every second or two: a quick burst of jolts, side to side, each
  // smaller than the one before, on stiff springs, so it shakes and settles, never the same twice.
  const sy = spring(15, 0.3), srx = spring(19, 0.26), sry = spring(17, 0.28);
  const rz = spring(46, 0.17), rx = spring(42, 0.2);
  const lid = spring(13, 0.36);
  let nextEvent = 1.2, pending = [];
  let flare = 0, hover = 0, hoverGoal = 0, appear = 0, appearGoal = 0, depart = 0, departing = false;
  // opening is a timeline: the cover swings over, the leaves riffle past, it lands on the spread
  const COVER_END = 0.62, LEAF_START = 0.28, LEAF_GAP = 0.045, LEAF_DUR = 0.34;
  const LAND = LEAF_START + (LEAVES - 1) * LEAF_GAP + LEAF_DUR;
  const OPEN_END = LAND + 0.25;
  let openT = 0, opening = false, overTicket = false;
  // the form: the spread's right page turns over onto it
  let formT = 0, formGoal = 0, formReady = null;
  // made ahead of time, it waits without drawing until it's shown
  let paused = true, raf = 0, last = performance.now(), time = 0, filmClock = 0, shownAt = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const hitTargets = [front, back, pagesMesh, inside, rightPage, ...[...leaves, formLeaf].flatMap((l) => [l.frontLeaf, l.backLeaf]), printMesh, titleMesh, ticket];

  function jolt(m, dir) {
    const r = Math.random;
    rz.v += dir * m * (1.3 + 0.7 * r());
    rx.v += dir * m * (0.5 + 0.5 * r()) * (r() < 0.5 ? -1 : 1);
    srx.v += (r() - 0.5) * m * 0.35;
    sry.v += (r() - 0.5) * m * 0.35;
    sy.v += m * 0.05 * (r() - 0.3);
    lid.v += m * (0.12 + 0.18 * r());
  }
  function rattle(power = 1) {
    const big = Math.random() < 0.25;
    const n = (big ? 6 : 3) + Math.floor(Math.random() * 4);
    let at = 0, dir = Math.random() < 0.5 ? -1 : 1;
    const m0 = power * (big ? 1.25 : 0.8) * (0.75 + 0.5 * Math.random());
    for (let i = 0; i < n; i++) {
      pending.push({ at: time + at, m: m0 * Math.pow(0.82, i) * (0.8 + 0.4 * Math.random()), dir });
      dir = -dir;
      at += 0.04 + Math.random() * 0.045;
    }
  }

  // spread units → the screen, in CSS pixels
  const v3 = new THREE.Vector3();
  function toScreen(x, y, z) {
    v3.set(x, y, z);
    spreadFrame.localToWorld(v3);
    v3.project(camera);
    return [(v3.x * 0.5 + 0.5) * window.innerWidth, (-v3.y * 0.5 + 0.5) * window.innerHeight];
  }
  let formShown = false, layoutKey = "";
  function placeForm() {
    const L = formLayout(vertical), z = formLeaf.pivot.position.z + 0.001;
    const [ox, oy] = toScreen(0, 0, z), [ux] = toScreen(1, 0, z);
    const unit = Math.abs(ux - ox);
    const keyNow = `${ox.toFixed(1)},${oy.toFixed(1)},${unit.toFixed(2)}`;
    if (keyNow === layoutKey) return;
    layoutKey = keyNow;
    const box = (el, [x, y, w, h], top) => {
      const [sx, sy2] = toScreen(x, top ? y : y + h, z);
      Object.assign(el.style, { left: `${sx}px`, top: `${sy2}px`, width: `${w * unit}px`, height: `${h * unit}px` });
    };
    box(fields.name, L.name); box(fields.email, L.email);
    const [mx, my, mw, mh, rows] = L.message;
    box(fields.message, [mx, my, mw, mh], true);
    fields.message.style.lineHeight = `${(mh / rows) * unit}px`;
    box(fields.send, L.send); box(fields.back, L.back);
    // notes (an error, sent) just under the send button
    const [nx, ny] = toScreen(L.send[0] - 0.15, L.send[1] - 0.012, z);
    Object.assign(fields.note.style, { left: `${nx}px`, top: `${ny}px`, width: `${(L.send[2] + 0.3) * unit}px` });
    form.style.setProperty("--u", `${unit}px`);
  }

  const POSE = { x: -0.2, y: 0.16, z: -0.09 };
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const raw = (now - last) / 1000, dt = Math.min(0.05, raw);
    last = now;
    if (paused) return;
    keepSmooth(raw);
    time += dt;
    appear += (appearGoal - appear) * (1 - Math.exp(-dt * (appearGoal > appear ? 2.2 : 4)));
    hover += (hoverGoal - hover) * (1 - Math.exp(-dt * 6));
    if (departing) depart = Math.min(1, depart + dt / 1.05);
    // the form turns first; only once it's back does the passport close
    formT = clamp(formT + (formGoal ? dt : -dt) / (reducedMotion ? 0.15 : 0.75), 0, 1);
    const closingHeld = !opening && formT > 0;
    if (!closingHeld) openT = clamp(openT + (opening ? dt : -dt * 1.8) * (reducedMotion ? 6 : 1), 0, OPEN_END);
    const k = ease(clamp(openT / 0.95, 0, 1));          // pose and camera
    const coverK = ease(clamp(openT / COVER_END, 0, 1));

    // the rattling: only while closed and in view
    if (!reducedMotion && !opening && openT === 0 && appear > 0.9 && !departing) {
      nextEvent -= dt;
      if (nextEvent <= 0) { rattle(); nextEvent = 1.1 + Math.random() * 1.7; }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (time >= pending[i].at) { jolt(pending[i].m, pending[i].dir); pending.splice(i, 1); }
    const rest = openT > 0 ? 0 : 0.003 * (0.5 + 0.5 * Math.sin(time * 0.9));
    for (const s of [sy, srx, sry, rz, rx]) stepSpring(s, 0, dt);
    stepSpring(lid, rest, dt);
    const lift = Math.max(0, lid.x);

    // the leaves: each turns over in its turn, curling as it goes; light shines through them
    let riffle = 0;
    leaves.forEach((l, i) => {
      const turn = Math.PI * ease(clamp((openT - LEAF_START - i * LEAF_GAP) / LEAF_DUR, 0, 1));
      l.pivot.visible = openT > LEAF_START * 0.5;
      if (!l.pivot.visible) return;
      if (Math.abs(turn - l.turn) > 1e-4) {
        bendLeaf(l.geo, turn); bendLeaf(l.backGeo, turn);
        l.turn = turn;
      }
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
    flare += (clamp(lift * 10 + Math.abs(rz.v) * 0.06 + riffle * 0.22, 0, 1.4) - flare) * (1 - Math.exp(-dt * 10));

    // across the fold: there as the last page lands; lifted off while the form is out
    const centreIn = clamp((openT - (LAND - 0.12)) / 0.18, 0, 1) * (1 - clamp(formT * 3, 0, 1));
    centre.visible = centreIn > 0;
    for (const m of centreMats) m.opacity = centreIn;
    centre.scale.setScalar(1 + (1 - ease(centreIn)) * 0.04);
    if (centre.visible) { // the film: a few frames a second, like stop-motion
      filmClock += dt;
      if (filmClock > 0.125 && !filmTex.isVideoTexture) { filmClock = 0; film.draw(); filmTex.needsUpdate = true; }
    }

    // pose: tilted and floating when closed; flat, facing you, turned for the screen when open
    const float = Math.sin(time * 1.1) * 0.01 * (1 - k);
    const fall = depart * depart * depart;
    passport.position.set(0, float, (1 - appear) * -6 - fall * 160);
    passport.rotation.set(
      mix(POSE.x + Math.sin(time * 0.7) * 0.02 + pointer.y * 0.05 * hover, -0.02, k) + fall * 0.6,
      mix(POSE.y + Math.sin(time * 0.55) * 0.03 + pointer.x * 0.07 * hover, 0, k),
      mix(POSE.z + Math.sin(time * 0.45) * 0.01, vertical ? -Math.PI / 2 : 0, k) + fall * 0.9
    );
    body.position.set(W / 2 * k + rx.x * 0.012, sy.x, 0);
    body.rotation.set(srx.x * 0.05, sry.x * 0.05, rz.x * 0.045);
    hinge.rotation.y = -(lift * 0.9 + coverK * Math.PI);
    spine.visible = coverK < 0.6; // open, the fold must never show between the pages
    spreadFrame.rotation.z = vertical ? Math.PI / 2 : 0;

    // the camera: the closed booklet takes a good part of the screen; open, it fills it
    const closedD = distanceFor(W * 1.1, H * 1.05, 0.62, 0.56);
    const openD = vertical ? distanceFor(H, 2 * W, 1.0, 0.94) : distanceFor(2 * W, H, 0.98, 0.93);
    camera.position.set(0, 0, mix(closedD, openD, k));
    camera.lookAt(0, 0, 0);

    // the light: from the gaps of the block and from what the cover has swept as it swung, then
    // from round the whole spread and its fold
    const glow = appear * (0.85 + 0.15 * hover) * (1 - clamp((depart - 0.8) / 0.2, 0, 1));
    const u = sheet.material.uniforms;
    u.time.value = time; u.flare.value = flare + hover * 0.2; u.power.value = glow; u.opened.value = coverK;
    const swing = lift * 0.9 + coverK * Math.PI;
    u.box.value.set(-W / 2 + Math.min(0, PW * Math.cos(swing)), -W / 2 + PW, PH, 0);
    // open, the light comes from behind the whole booklet, so the cover's red rim shows round both pages
    sheet.position.z = -coverK * (T / 2 + 0.003);
    gutter.visible = coverK > 0.5;
    gutter.material.uniforms.time.value = time;
    gutter.material.uniforms.power.value = glow * clamp((coverK - 0.5) * 2, 0, 1) * (0.7 + flare * 0.6);
    pageEdgeMat.emissiveIntensity = (0.75 + flare * 1.2 + hover * 0.25) * glow;
    for (const l of glowLights) l.intensity = (0.05 + flare * 0.35) * glow * (1 - coverK);
    key.intensity = 1.15 + k * 0.55;
    bloom.strength = 0.42 + flare * 0.3 + depart * 0.5;
    canvas.style.opacity = String(clamp(appear * 1.6, 0, 1) * (1 - clamp((depart - 0.88) / 0.12, 0, 1)));

    document.documentElement.classList.toggle("passport-open", k > 0.5 && !departing);
    // the hint, if nothing's happened for a while
    hint.classList.toggle("is-on", !opening && openT === 0 && appear > 0.9 && !departing && time - shownAt > 4.5);
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
    overTicket = false; ticket.material.map = ticketTex[0];
  }
  function fromForm() {
    if (!formGoal) return;
    formGoal = 0;
    document.activeElement?.blur?.();
    // once it has turned back, the spread's page goes back under it
    const wait = () => (formT > 0 ? requestAnimationFrame(wait) : (rightPage.material.map = D.spreadR, rightPage.material.needsUpdate = true));
    requestAnimationFrame(wait);
  }
  const note = (s, bad = false) => { fields.note.textContent = s; fields.note.classList.toggle("is-bad", bad); };
  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (sending || sentOnce) return;
    const name = fields.name.value.trim(), email = fields.email.value.trim(), message = fields.message.value.trim();
    for (const el of [fields.name, fields.email, fields.message]) el.classList.remove("is-bad");
    if (!name) { fields.name.classList.add("is-bad"); fields.name.focus(); return note(t("needName"), true); }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) { fields.email.classList.add("is-bad"); fields.email.focus(); return note(t("needEmail"), true); }
    if (message.length < 4) { fields.message.classList.add("is-bad"); fields.message.focus(); return note(t("needMessage"), true); }
    sending = true;
    fields.send.textContent = t("sending");
    note("");
    try {
      const res = await fetch(SEND_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ name, email, message, _subject: `Booking: ${name}`, _replyto: email, _template: "table", _captcha: "false", _honey: F(".pform__hp").value }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok || String(j.success) !== "true") throw new Error(j.message || res.status);
      sentOnce = true;
      // SENT, pressed onto the page, and the passport jolts with it
      const f = await formReady;
      const L = formLayout(vertical);
      pressSent(f.canvasR, DIMS, vertical, [L.message[0] + L.message[2] * 0.62, L.message[1] - L.message[3] * 0.55]);
      f.R.needsUpdate = true;
      jolt(0.5, 1);
      for (const el of [fields.name, fields.email, fields.message]) el.readOnly = true;
      fields.send.textContent = "✓";
      note(t("sent"));
    } catch (err) {
      // the form service didn't take it: hand it to their own e-mail app, already written
      console.warn("booking form:", err);
      note(t("fallback"));
      const body = `${message}\n\n— ${name}\n${email}`;
      window.location.href = `mailto:${TO}?subject=${encodeURIComponent(`Booking: ${name}`)}&body=${encodeURIComponent(body)}`;
      fields.send.textContent = t("send");
    }
    sending = false;
  });
  fields.back.addEventListener("click", fromForm);

  // ---- pointer: hover warms it; a click opens it; open, the ticket turns to the form, a click
  // outside closes ----
  function hitAt(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(hitTargets, false).filter((h) => {
      let o = h.object;
      while (o) { if (!o.visible) return false; o = o.parent; }
      return true;
    })[0]?.object || null;
  }
  const onMove = (e) => {
    if (e.pointerType === "touch") return;
    const hit = hitAt(e);
    const nowOver = opening && !formGoal && hit === ticket && openT >= LAND;
    if (nowOver !== overTicket) { overTicket = nowOver; ticket.material.map = ticketTex[overTicket ? 1 : 0]; }
    hoverGoal = hit && !opening ? 1 : 0;
    canvas.style.cursor = overTicket || (hit && !opening) ? "pointer" : opening && !hit ? "zoom-out" : "";
  };
  const onLeave = () => { hoverGoal = 0; canvas.style.cursor = ""; };
  const onClick = (e) => {
    const hit = hitAt(e);
    if (!opening) { if (hit) api.open(); return; }
    if (hit === ticket && openT >= LAND && !formGoal) { toForm(); return; }
    if (!hit) api.close();
  };
  const onKey = (e) => {
    if (e.key !== "Escape" || !opening) return;
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
    show(animate = true) {
      appearGoal = 1; departing = false; depart = 0;
      if (!animate) appear = 1;
      nextEvent = 1.2; paused = false; last = performance.now(); shownAt = time;
    },
    // leaving: it falls away into the dark, smaller and smaller, its light going last
    hide(animate = true) {
      opening = false; formGoal = 0; formT = 0;
      if (!animate || reducedMotion) { appearGoal = 0; appear = 0; openT = 0; return Promise.resolve(); }
      departing = true;
      return new Promise((r) => setTimeout(() => {
        departing = false; depart = 0; appearGoal = 0; appear = 0; openT = 0;
        r();
      }, 1050));
    },
    async open() {
      if (opening) return;
      const n = ++opens;
      if (openT === 0) {
        const v = window.innerHeight > window.innerWidth * 1.05;
        if (v !== vertical) {
          const d = await deck(v);
          if (n !== opens || openT !== 0) return;
          vertical = v; D = d; dress(); formReady = null;
        }
      }
      opening = true; hoverGoal = 0; pending = [];
      // the form's pages are drawn while the spread is looked at, so BOOK NOW turns at once
      setTimeout(() => { formReady ||= formDeck(vertical); }, 1600);
    },
    close() { opening = false; formGoal = 0; document.activeElement?.blur?.(); },
    // open at the booking form (what the ticket does)
    book() { if (opening && openT >= LAND) toForm(); },
    setVideo(url) {
      const v = document.createElement("video");
      Object.assign(v, { src: url, muted: true, loop: true, playsInline: true, autoplay: true, crossOrigin: "anonymous" });
      v.play().catch(() => {});
      const vt = new THREE.VideoTexture(v);
      vt.colorSpace = THREE.SRGBColorSpace;
      filmMesh.material.map = vt;
      filmMesh.material.needsUpdate = true;
    },
    setPaused(p) { paused = p; last = performance.now(); },
    dispose() {
      cancelAnimationFrame(raf);
      offLang();
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      canvas.remove(); hint.remove(); form.remove();
    },
  };
  return api;
}
