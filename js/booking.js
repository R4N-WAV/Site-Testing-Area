// BOOKING: a passport, in the style of the red Norwegian one, lying in the dark with warm light
// leaking out between its pages, as if something inside wants out.
//
// Everything is made here in code: the booklet (two covers wrapped round a spine, a block of pages
// between them), the pebbled red leather, the gold foil stamped into it (a crown over a shield
// with "51" filling it, R4N, BOOKING and the chip symbol), and the light: the page edges glow, a
// sheet of light rays streams out from the gap all round, and a bloom pass makes it bleed. Every
// few seconds the passport jolts and hops and its cover lifts a hair; the light flares with it.
//
//   const p = await createPassport(layer, { onClick })   // layer: an element covering the screen
//   p.show(animate) / await p.hide(animate) / p.setPaused(bool) / p.dispose()

import * as THREE from "three";
import { EffectComposer } from "../vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "../vendor/addons/environments/RoomEnvironment.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const BG = 0x09090b; // the site's white, inverted

// ---- the booklet, in metres-ish units: a real passport is 88 x 125 mm ----
const W = 0.88, H = 1.25;
const COVER = 0.009;          // each cover board
const PAGES = 0.04;           // the block of pages between them
const R = 0.05;               // corner radius
const INSET = 0.012;          // pages sit a little inside the covers on the open sides
const T = PAGES + 2 * COVER;  // closed thickness

// ---- the cover artwork: one canvas pixel grid for colour, finish and relief ----
const CW = 1024, CH = Math.round(1024 * H / W);
const GOLD = [208, 168, 92];
const RED = [128, 26, 32];

function roundedRect(w, h, r) {
  const s = new THREE.Shape();
  const x = -w / 2, y = -h / 2;
  s.moveTo(x + r, y);
  s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
  s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
  s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
  return s;
}

// pebbled leather: jittered cells, each a little dome, with creases where cells meet
function leatherHeight(w, h, cell, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const gx = Math.ceil(w / cell) + 2, gy = Math.ceil(h / cell) + 2;
  const px = new Float32Array(gx * gy), py = new Float32Array(gx * gy);
  for (let j = 0; j < gy; j++) for (let i = 0; i < gx; i++) {
    px[j * gx + i] = (i - 1 + 0.15 + 0.7 * rnd()) * cell;
    py[j * gx + i] = (j - 1 + 0.15 + 0.7 * rnd()) * cell;
  }
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const cj = Math.floor(y / cell) + 1;
    for (let x = 0; x < w; x++) {
      const ci = Math.floor(x / cell) + 1;
      let f1 = 1e9, f2 = 1e9;
      for (let j = cj - 1; j <= cj + 1; j++) for (let i = ci - 1; i <= ci + 1; i++) {
        const k = j * gx + i, dx = px[k] - x, dy = py[k] - y, d = dx * dx + dy * dy;
        if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
      }
      const crease = Math.min(1, (Math.sqrt(f2) - Math.sqrt(f1)) / (cell * 0.35));
      out[y * w + x] = Math.sqrt(crease) * (0.75 + 0.25 * Math.cos(Math.sqrt(f1) / cell * 2.2));
    }
  }
  return out;
}

// the crown: a jewelled band with leaves standing on it, three arches rising from it to an orb
// and cross, pearls along the arches (all in gold, details cut back to the red leather)
function drawCrown(g, cx, top, w, h) {
  const bandTop = top + h * 0.7, bandH = h * 0.2, bandBot = bandTop + bandH;
  const orbR = w * 0.07, orbY = top + h * 0.13;
  g.save();
  g.fillStyle = "#fff"; g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  // the band, slightly curved like a ring seen from the front
  g.beginPath();
  g.moveTo(cx - w / 2, bandTop + bandH * 0.15);
  g.quadraticCurveTo(cx, bandTop - bandH * 0.25, cx + w / 2, bandTop + bandH * 0.15);
  g.lineTo(cx + w / 2, bandBot);
  g.quadraticCurveTo(cx, bandBot - bandH * 0.4, cx - w / 2, bandBot);
  g.closePath(); g.fill();
  // three arches: the outer two from the band's ends, the middle one straight up
  g.lineWidth = w * 0.032;
  const archTop = orbY + orbR * 0.9;
  for (const k of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + k * w * 0.44, bandTop + bandH * 0.05);
    g.bezierCurveTo(cx + k * w * 0.5, top + h * 0.28, cx + k * w * 0.2, archTop - h * 0.02, cx, archTop);
    g.stroke();
    g.beginPath();
    g.moveTo(cx + k * w * 0.2, bandTop - bandH * 0.08);
    g.bezierCurveTo(cx + k * w * 0.22, top + h * 0.4, cx + k * w * 0.1, archTop + h * 0.05, cx, archTop);
    g.stroke();
  }
  g.beginPath(); g.moveTo(cx, bandTop - bandH * 0.15); g.lineTo(cx, archTop); g.stroke();
  // pearls along the outer arches
  for (const k of [-1, 1]) for (let i = 1; i < 6; i++) {
    const t = i / 6, u = 1 - t;
    const x0 = cx + k * w * 0.44, x1 = cx + k * w * 0.5, x2 = cx + k * w * 0.2, x3 = cx;
    const y0 = bandTop + bandH * 0.05, y1 = top + h * 0.28, y2 = archTop - h * 0.02, y3 = archTop;
    const x = u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3;
    const y = u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3;
    g.beginPath(); g.arc(x, y, w * 0.026, 0, Math.PI * 2); g.fill();
  }
  // leaves standing on the band: big trefoils between small points
  const leaf = (x, s) => {
    g.beginPath(); g.ellipse(x, bandTop - s * 0.55, s * 0.22, s * 0.55, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x - s * 0.32, bandTop - s * 0.3, s * 0.18, s * 0.32, -0.7, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.ellipse(x + s * 0.32, bandTop - s * 0.3, s * 0.18, s * 0.32, 0.7, 0, Math.PI * 2); g.fill();
  };
  for (const k of [-0.4, 0, 0.4]) leaf(cx + k * w, w * 0.2);
  for (const k of [-0.2, 0.2]) { g.beginPath(); g.arc(cx + k * w, bandTop - w * 0.05, w * 0.03, 0, Math.PI * 2); g.fill(); }
  // orb and cross
  g.beginPath(); g.arc(cx, orbY, orbR, 0, Math.PI * 2); g.fill();
  g.lineWidth = w * 0.04;
  g.beginPath(); g.moveTo(cx, orbY - orbR); g.lineTo(cx, top - h * 0.07);
  g.moveTo(cx - w * 0.055, top - h * 0.015); g.lineTo(cx + w * 0.055, top - h * 0.015); g.stroke();
  // cut back to the leather: jewels in the band, a line round it, the orb's girdle
  g.globalCompositeOperation = "destination-out";
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * w * 0.13, y = bandTop + bandH * 0.55 - (1 - Math.pow(i / 4, 2)) * bandH * 0.12;
    g.beginPath();
    if (i % 2 === 0) g.ellipse(x, y, w * 0.032, bandH * 0.24, 0, 0, Math.PI * 2);
    else g.rect(x - w * 0.02, y - bandH * 0.2, w * 0.04, bandH * 0.4);
    g.fill();
  }
  g.lineWidth = w * 0.01;
  g.beginPath(); g.moveTo(cx - orbR, orbY); g.lineTo(cx + orbR, orbY); g.stroke();
  g.beginPath(); g.moveTo(cx, orbY); g.lineTo(cx, orbY + orbR); g.stroke();
  g.restore();
}

function shieldPath(g, cx, top, w, h) {
  const L = cx - w / 2, Rr = cx + w / 2, bottom = top + h;
  g.beginPath();
  g.moveTo(L, top);
  g.lineTo(Rr, top);
  g.lineTo(Rr, top + h * 0.5);
  g.bezierCurveTo(Rr, top + h * 0.8, cx + w * 0.18, top + h * 0.9, cx, bottom);
  g.bezierCurveTo(cx - w * 0.18, top + h * 0.9, L, top + h * 0.8, L, top + h * 0.5);
  g.closePath();
}

// the shield, with "51" filling it in gold, engraved with a fine line inside its outline
function drawShield(g, cx, top, w, h) {
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineJoin = "round";
  shieldPath(g, cx, top, w, h); g.lineWidth = w * 0.035; g.stroke();
  const iw = w * 0.86, ih = h * 0.9, itop = top + h * 0.05;
  shieldPath(g, cx, itop, iw, ih); g.lineWidth = w * 0.012; g.stroke();

  // 51 fills the shield like the lion does: a solid gold figure (bolder than the letters), with a
  // fine line engraved just inside its outline, the way the lion's details are cut
  const c = document.createElement("canvas");
  c.width = c.height = 1024;
  const t = c.getContext("2d");
  t.font = '700 900px "Cinzel"';
  t.textBaseline = "alphabetic";
  const m = t.measureText("51");
  const tw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight, th = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
  t.save();
  t.translate(512, 512);
  t.scale(900 / tw, 900 / th);
  t.translate(-(m.actualBoundingBoxRight - m.actualBoundingBoxLeft) / 2, (m.actualBoundingBoxAscent - m.actualBoundingBoxDescent) / 2);
  t.fillStyle = "#fff"; t.strokeStyle = "#fff"; t.lineJoin = "round"; t.lineWidth = 46;
  t.fillText("51", 0, 0); t.strokeText("51", 0, 0);
  t.restore();
  // the engraved line: where a blurred copy of the figure is between two levels, i.e. a band
  // that follows the outline a few pixels inside it
  const b = document.createElement("canvas");
  b.width = b.height = 1024;
  const bt = b.getContext("2d");
  bt.filter = "blur(9px)";
  bt.drawImage(c, 0, 0);
  const A = t.getImageData(0, 0, 1024, 1024), B = bt.getImageData(0, 0, 1024, 1024).data;
  for (let i = 3; i < A.data.length; i += 4) {
    if (A.data[i] > 250 && B[i] > 196 && B[i] < 228) A.data[i] = 0;
  }
  t.putImageData(A, 0, 0);

  g.save();
  shieldPath(g, cx, itop + ih * 0.035, iw * 0.95, ih * 0.93);
  g.clip();
  const bw = iw * 0.94, bh = ih * 0.84;
  g.drawImage(c, cx - bw / 2, itop + ih * 0.03, bw, bh);
  g.restore();
  g.restore();
}

// the ICAO chip symbol: a frame, a band through it, a circle in the middle
function drawChip(g, cx, cy, w) {
  const h = w * 0.6;
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineWidth = w * 0.06;
  g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, w * 0.06); g.stroke();
  g.fillRect(cx - w / 2, cy - h * 0.12, w, h * 0.24);
  g.globalCompositeOperation = "destination-out";
  g.beginPath(); g.arc(cx, cy, h * 0.3, 0, Math.PI * 2); g.fill();
  g.globalCompositeOperation = "source-over";
  g.lineWidth = w * 0.05;
  g.beginPath(); g.arc(cx, cy, h * 0.22, 0, Math.PI * 2); g.stroke();
  g.restore();
}

function letters(g, text, cx, baseline, size, spacing, weight = 600) {
  g.save();
  g.font = `${weight} ${size}px "Cinzel"`;
  if ("letterSpacing" in g) g.letterSpacing = `${spacing}px`;
  g.fillStyle = "#fff";
  g.textAlign = "center";
  // letterSpacing adds after every letter, the last one too: shift back by half of it
  g.fillText(text, cx + spacing / 2, baseline);
  g.restore();
}

function coverTextures() {
  // 1. where the gold foil is
  const foil = document.createElement("canvas");
  foil.width = CW; foil.height = CH;
  const g = foil.getContext("2d");
  const cx = CW / 2;
  drawCrown(g, cx, CH * 0.11, CW * 0.31, CH * 0.13);
  drawShield(g, cx, CH * 0.245, CW * 0.29, CH * 0.225);
  letters(g, "R4N", cx, CH * 0.615, CW * 0.165, CW * 0.04);
  letters(g, "BOOKING", cx, CH * 0.755, CW * 0.098, CW * 0.02);
  drawChip(g, cx, CH * 0.905, CW * 0.105);
  const foilPx = g.getImageData(0, 0, CW, CH).data;
  // a softened copy, for the edges of the stamping
  const soft = document.createElement("canvas");
  soft.width = CW; soft.height = CH;
  const sg = soft.getContext("2d");
  sg.filter = "blur(2px)";
  sg.drawImage(foil, 0, 0);
  const softPx = sg.getImageData(0, 0, CW, CH).data;

  // 2. the leather
  const hgt = leatherHeight(CW, CH, 7, 1234567);
  const color = new ImageData(CW, CH), finish = new ImageData(CW, CH), bump = new ImageData(CW, CH);
  let s = 99;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0, n = CW * CH; i < n; i++) {
    const p = i * 4;
    const f = foilPx[p + 3] / 255, fs = softPx[p + 3] / 255;
    const lh = hgt[i];
    const shade = 0.86 + 0.18 * lh + (rnd() - 0.5) * 0.05;
    const goldShade = 0.92 + 0.12 * rnd();
    for (let c = 0; c < 3; c++) color.data[p + c] = clamp(RED[c] * shade * (1 - f) + GOLD[c] * goldShade * f, 0, 255);
    color.data[p + 3] = 255;
    // green: roughness, blue: metalness (three.js reads them from these channels)
    finish.data[p] = 0;
    finish.data[p + 1] = clamp((0.62 - 0.12 * lh) * (1 - f) * 255 + 0.3 * 255 * f, 0, 255);
    finish.data[p + 2] = 255 * f;
    finish.data[p + 3] = 255;
    // relief: the grain, and the foil pressed into it (smooth, a little lower)
    const b = (0.55 + 0.35 * lh) * (1 - fs) + 0.35 * fs;
    bump.data[p] = bump.data[p + 1] = bump.data[p + 2] = clamp(b * 255, 0, 255);
    bump.data[p + 3] = 255;
  }
  const toTex = (img, srgb) => {
    const c = document.createElement("canvas");
    c.width = CW; c.height = CH;
    c.getContext("2d").putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };
  return { map: toTex(color, true), finish: toTex(finish, false), bump: toTex(bump, false) };
}

// the plain leather for the back and the spine: grain only
function leatherOnly(w, h) {
  const hgt = leatherHeight(w, h, 7, 7654321);
  const color = new ImageData(w, h), bump = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const p = i * 4, lh = hgt[i], shade = 0.86 + 0.18 * lh;
    for (let c = 0; c < 3; c++) color.data[p + c] = RED[c] * shade;
    color.data[p + 3] = 255;
    bump.data[p] = bump.data[p + 1] = bump.data[p + 2] = (0.55 + 0.35 * lh) * 255;
    bump.data[p + 3] = 255;
  }
  const mk = (img, srgb) => {
    const c = document.createElement("canvas"); c.width = w; c.height = h;
    c.getContext("2d").putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(c);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: mk(color, true), bump: mk(bump, false) };
}

// page edges: fine cream lines, a little light showing between them
function pageEdges() {
  const c = document.createElement("canvas");
  c.width = 16; c.height = 512;
  const g = c.getContext("2d");
  const e = document.createElement("canvas");
  e.width = 16; e.height = 512;
  const ge = e.getContext("2d");
  const pages = 32;
  for (let i = 0; i < pages; i++) {
    const y0 = (i / pages) * 512, y1 = ((i + 1) / pages) * 512;
    const v = 228 + Math.random() * 16;
    g.fillStyle = `rgb(${v},${v - 8},${v - 26})`;
    g.fillRect(0, y0, 16, y1 - y0);
    g.fillStyle = "rgba(90,60,30,0.35)";
    g.fillRect(0, y1 - 1.2, 16, 1.2);
    ge.fillStyle = "rgb(60,40,10)";
    ge.fillRect(0, y0, 16, y1 - y0);
    ge.fillStyle = "rgb(255,214,140)";
    ge.fillRect(0, y1 - 2.5, 16, 2.5); // light through the gaps between the pages
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  t.colorSpace = te.colorSpace = THREE.SRGBColorSpace;
  return { map: t, emissive: te };
}

// The light streaming out between the pages: a sheet in the page plane, much bigger than the
// passport. Brightness falls off with the distance from the passport's outline; rays fan out from
// it, drift and flicker. Brighter on the open sides than at the spine; flares on every jolt.
function lightSheet() {
  const geo = new THREE.PlaneGeometry(W * 3.6, H * 3.0, 1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, flare: { value: 0 }, power: { value: 0 }, size: { value: new THREE.Vector2(W - INSET, H - 2 * INSET) } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform float time, flare, power;
      uniform vec2 size;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      float noise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 p = vP + vec2(${(INSET / 2).toFixed(4)}, 0.0);
        float d = sdBox(p, size * 0.5, ${R.toFixed(3)});
        if (d < 0.0) discard;
        float a = atan(p.y, p.x);
        // rays: streaks fanning out from the edge, slowly turning and flickering
        float rays = 0.0;
        rays += noise(a * 18.0 + time * 0.35) * 0.55;
        rays += noise(a * 41.0 - time * 0.6 + 7.0) * 0.35;
        rays += noise(a * 7.0 + time * 0.15 + 3.0) * 0.35;
        rays = pow(rays, 2.2);
        // the spine (left) side lets out far less
        float side = smoothstep(-0.2, 0.25, p.x / size.x + 0.5);
        float near = exp(-d * 34.0);
        float far = exp(-d * (4.2 - 1.2 * flare)) * rays;
        float flick = 0.88 + 0.12 * noise(time * 7.0);
        float k = (near * 1.1 + far * 0.55) * side * flick * power * (1.0 + 1.6 * flare);
        vec3 col = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.86, 0.6), near);
        gl_FragColor = vec4(col * k, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

export async function createPassport(layer, { onClick } = {}) {
  await Promise.all(["400", "600", "700"].map((w) => new FontFace("Cinzel", `url(${new URL(`../assets/fonts/cinzel-latin-${w}-normal.woff2`, import.meta.url)})`, { weight: w }).load().then((f) => document.fonts.add(f))));

  const canvas = document.createElement("canvas");
  canvas.className = "booking__canvas";
  layer.appendChild(canvas);
  const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 1.75));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(BG);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.35;
  const camera = new THREE.PerspectiveCamera(26, window.innerWidth / window.innerHeight, 0.1, 50);

  // light: a soft key from above left, and the warm light from the pages catching the rims
  scene.add(new THREE.AmbientLight(0xffffff, 0.08));
  const key = new THREE.DirectionalLight(0xfff1e0, 1.15);
  key.position.set(-1.5, 2.5, 3);
  scene.add(key);
  const glowLights = [[0.6, 0], [-0.1, 0.75], [-0.1, -0.75], [0.45, 0.6], [0.45, -0.6]].map(([x, y]) => {
    const l = new THREE.PointLight(0xffa040, 0, 1.2, 2);
    l.position.set(x, y, 0.06);
    scene.add(l);
    return l;
  });

  // ---- the booklet ----
  const passport = new THREE.Group();   // moves and turns as a whole
  const body = new THREE.Group();       // jolts inside that
  passport.add(body);
  scene.add(passport);

  const tex = coverTextures();
  const plain = leatherOnly(512, 728);
  const leather = (map, bumpMap) => new THREE.MeshPhysicalMaterial({
    map, bumpMap, bumpScale: 1.4, roughness: 0.62, metalness: 0,
    sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x7a2a2a), clearcoat: 0.08, clearcoatRoughness: 0.6,
  });
  const frontMat = new THREE.MeshPhysicalMaterial({
    map: tex.map, roughnessMap: tex.finish, metalnessMap: tex.finish, bumpMap: tex.bump, bumpScale: 2.2,
    roughness: 1, metalness: 1, sheen: 0.25, sheenRoughness: 0.6, sheenColor: new THREE.Color(0x7a2a2a),
  });
  const backMat = leather(plain.map, plain.bump);
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x5e1216, roughness: 0.55, sheen: 0.3, sheenColor: new THREE.Color(0x6a2020) });

  const outline = roundedRect(W, H, R);
  const board = (mat) => {
    const geo = new THREE.ExtrudeGeometry(outline, { depth: COVER, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 2, curveSegments: 12 });
    // the cover picture spans the board exactly
    const uv = geo.attributes.uv, pos = geo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W + 0.5, pos.getY(i) / H + 0.5);
    return new THREE.Mesh(geo, [mat, edgeMat]);
  };
  // front cover: hinged at the spine, so it can lift a hair
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, PAGES / 2);
  body.add(hinge);
  const front = board(frontMat);
  front.position.set(W / 2, 0, 0);
  hinge.add(front);
  const back = board(backMat);
  back.rotation.y = Math.PI; // its outside faces away
  back.position.set(0, 0, -PAGES / 2);
  body.add(back);
  // the spine wraps round from one cover to the other
  const spine = new THREE.Mesh(new THREE.CylinderGeometry(T / 2, T / 2, H - 2 * R, 24, 1, true, Math.PI, Math.PI), backMat);
  spine.position.set(-W / 2, 0, 0);
  body.add(spine);
  // the pages
  const pagesTex = pageEdges();
  const pageShape = roundedRect(W - INSET, H - 2 * INSET, R * 0.8);
  const pageGeo = new THREE.ExtrudeGeometry(pageShape, { depth: PAGES * 0.96, bevelEnabled: false, curveSegments: 12 });
  pageGeo.translate(-INSET / 2, 0, -PAGES * 0.48);
  // sides: page lines run along the depth
  {
    const uv = pageGeo.attributes.uv, pos = pageGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 0.5, pos.getZ(i) / (PAGES * 0.96) + 0.5);
  }
  const pageMat = new THREE.MeshStandardMaterial({
    map: pagesTex.map, emissive: 0xffffff, emissiveMap: pagesTex.emissive, emissiveIntensity: 1.2, roughness: 0.9,
  });
  const pagesMesh = new THREE.Mesh(pageGeo, pageMat);
  body.add(pagesMesh);
  const sheet = lightSheet();
  body.add(sheet);

  // ---- framing: big, never distorted: the narrow camera keeps proportions true ----
  const POSE = new THREE.Euler(-0.2, 0.16, -0.09);
  function frame() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    // fill about 74% of the height on wide screens, about 80% of the width on tall ones
    const vFov = THREE.MathUtils.degToRad(camera.fov);
    const fitH = (H * 1.05) / 0.74 / (2 * Math.tan(vFov / 2));
    const fitW = (W * 1.08) / 0.8 / (2 * Math.tan(vFov / 2) * camera.aspect);
    camera.position.set(0, 0, Math.max(fitH, fitW));
    camera.lookAt(0, 0, 0);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.7, 0.6, 0.86);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  frame();
  window.addEventListener("resize", frame);

  // ---- motion ----
  // every 3-5 s: something inside shoves. A hop, a short shudder, the cover lifts a hair, the
  // light flares; then it settles and waits again.
  let nextKick = 1.6, kickT = -1, kickPower = 1;
  const pointer = new THREE.Vector2(9, 9);
  let hover = 0, hoverGoal = 0;
  let appear = 0, appearGoal = 0;
  let paused = false, raf = 0, last = performance.now(), time = 0;
  const raycaster = new THREE.Raycaster();
  const hit = [front, back, pagesMesh, spine];

  function kick(power = 1) { kickT = 0; kickPower = power; }
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused) return;
    time += dt;
    appear += (appearGoal - appear) * (1 - Math.exp(-dt * (appearGoal > appear ? 2.2 : 4)));
    hover += (hoverGoal - hover) * (1 - Math.exp(-dt * 6));

    if (!reducedMotion) {
      nextKick -= dt;
      if (nextKick <= 0 && appear > 0.9) { kick(0.8 + Math.random() * 0.4); nextKick = 3 + Math.random() * 2; }
    }
    let hop = 0, shudder = 0, lift = 0, flare = 0;
    if (kickT >= 0) {
      kickT += dt;
      const k = kickT;
      hop = Math.max(0, Math.sin(Math.min(1, k / 0.32) * Math.PI)) * 0.035 + Math.max(0, Math.sin(clamp((k - 0.32) / 0.16, 0, 1) * Math.PI)) * 0.008;
      shudder = Math.sin(k * 70) * Math.exp(-k * 9);
      lift = Math.sin(clamp(k / 0.42, 0, 1) * Math.PI) * 0.045 + Math.max(0, Math.sin(clamp((k - 0.5) / 0.15, 0, 1) * Math.PI)) * 0.012;
      flare = Math.exp(-Math.pow((k - 0.18) / 0.2, 2));
      if (k > 1.2) kickT = -1;
      hop *= kickPower; shudder *= kickPower; lift *= kickPower; flare *= kickPower;
    }
    // idle: floating, breathing a little
    const float = Math.sin(time * 1.1) * 0.012;
    passport.position.set(0, float + hop, (1 - appear) * -6);
    passport.rotation.set(
      POSE.x + Math.sin(time * 0.7) * 0.02 + pointer.y * 0.06 * hover,
      POSE.y + Math.sin(time * 0.55) * 0.03 + pointer.x * 0.08 * hover,
      POSE.z + Math.sin(time * 0.45) * 0.01
    );
    body.rotation.set(shudder * 0.012, shudder * 0.01, shudder * 0.02);
    body.position.x = shudder * 0.004;
    hinge.rotation.y = -lift * 0.9;   // the open edge of the cover rises

    const power = appear * (0.85 + 0.15 * hover);
    sheet.material.uniforms.time.value = time;
    sheet.material.uniforms.flare.value = flare + hover * 0.25;
    sheet.material.uniforms.power.value = power;
    pageMat.emissiveIntensity = (1.1 + flare * 1.8 + hover * 0.3) * appear;
    for (const l of glowLights) l.intensity = (0.06 + flare * 0.5) * appear;
    bloom.strength = 0.65 + flare * 0.45;
    canvas.style.opacity = String(clamp(appear * 1.6, 0, 1));
    composer.render();
  }
  raf = requestAnimationFrame(tick);

  // ---- pointer: hover lights it up a little; a click (for now) gives it a shove ----
  function overPassport(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(hit, false).length > 0;
  }
  const onMove = (e) => {
    if (e.pointerType === "touch") return;
    const on = overPassport(e);
    hoverGoal = on ? 1 : 0;
    canvas.style.cursor = on ? "pointer" : "";
  };
  const onLeave = () => { hoverGoal = 0; canvas.style.cursor = ""; };
  const onClickCanvas = (e) => {
    if (!overPassport(e)) return;
    kick(1.4);
    nextKick = 3 + Math.random() * 2;
    onClick?.();
  };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClickCanvas);

  return {
    canvas,
    show(animate = true) { appearGoal = 1; if (!animate) appear = 1; nextKick = 1.4; },
    hide(animate = true) {
      appearGoal = 0;
      if (!animate || reducedMotion) { appear = 0; return Promise.resolve(); }
      return new Promise((r) => setTimeout(r, 650));
    },
    setPaused(p) { paused = p; last = performance.now(); },
    kick,
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", frame);
      renderer.dispose();
      canvas.remove();
    },
  };
}
