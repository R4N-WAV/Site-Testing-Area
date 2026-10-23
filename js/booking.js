// BOOKING: a passport, built like the red Norwegian one, lying in the dark with warm light leaking
// out between its pages, as if something inside wants out. Click it and it opens.
//
// Everything is made here in code. The booklet: a thin cover that wraps round a rounded spine
// from the front to the back, overhanging a block of white pages a little; square at the spine,
// rounded on the open side. The cover: deep crimson with a fine grain under a satin sheen, pale
// gold foil stamped into it (a crown over a shield holding STUDIO and 51, R4N, BOOKING, the chip
// symbol). The light: the page edges glow, a sheet of moving rays fans out of the gap all round,
// and a bloom pass makes it bleed. Now and then something inside shoves: small pushes on springs,
// never twice the same; the cover lifts a hair and the light flares with it.
// Open: wide screens open it like a book; tall screens open it the way a passport is shown, the
// spine across the middle and the pages on their side.
//
//   const p = await createPassport(layer)   // layer: an element covering the screen
//   p.show(animate) / await p.hide(animate) / p.setPaused(bool) / p.open() / p.close() / p.dispose()

import * as THREE from "three";
import { EffectComposer } from "../vendor/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "../vendor/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "../vendor/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "../vendor/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "../vendor/addons/environments/RoomEnvironment.js";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const BG = 0x09090b; // the site's white, inverted
// long work in small pieces, so the page keeps moving while it's done
const breathe = () => new Promise((r) => setTimeout(r, 0));

// ---- the booklet, in units of 100 mm: a passport is 88 x 125 mm, about 5.5 mm thick ----
const W = 0.88, H = 1.25;
const COVER = 0.0045;         // the cover: thin and flexible
const PAGES = 0.046;          // the block of pages
const T = PAGES + 2 * COVER;  // closed thickness
const OV = 0.011;             // the cover overhangs the pages on the open sides
const R = 0.032;              // corner radius (open side only; square at the spine)

// ---- the cover artwork ----
const CW = 1024, CH = Math.round(1024 * H / W);
const RED = [138, 19, 31];
const GOLD = [226, 199, 132];

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

// a fine tileable grain (the cover's embossed texture), as heights 0..1
function grainTile(n, cell, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const g = Math.round(n / cell);
  const px = new Float32Array(g * g), py = new Float32Array(g * g);
  for (let i = 0; i < g * g; i++) { px[i] = 0.15 + 0.7 * rnd(); py[i] = 0.15 + 0.7 * rnd(); }
  const out = new Float32Array(n * n), c = n / g;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const ci = Math.floor(x / c), cj = Math.floor(y / c);
    let f1 = 1e9, f2 = 1e9;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      const i = (ci + di + g) % g, j = (cj + dj + g) % g;
      const qx = (ci + di + px[j * g + i]) * c, qy = (cj + dj + py[j * g + i]) * c;
      const d = (qx - x) ** 2 + (qy - y) ** 2;
      if (d < f1) { f2 = f1; f1 = d; } else if (d < f2) f2 = d;
    }
    out[y * n + x] = Math.min(1, (Math.sqrt(f2) - Math.sqrt(f1)) / (c * 0.45));
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
  g.lineTo(Rr, top + h * 0.52);
  g.bezierCurveTo(Rr, top + h * 0.8, cx + w * 0.18, top + h * 0.9, cx, bottom);
  g.bezierCurveTo(cx - w * 0.18, top + h * 0.9, L, top + h * 0.8, L, top + h * 0.52);
  g.closePath();
}

// 51 as a solid gold figure (bolder than the lettering), with a fine line engraved just inside its
// outline, the way the lion's details are cut. Drawn on its own canvas, 1024 x 1024.
function fiftyOne() {
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
  // the engraved line: where a blurred copy is between two levels, a band just inside the outline
  const b = document.createElement("canvas");
  b.width = b.height = 1024;
  const bt = b.getContext("2d");
  bt.filter = "blur(9px)";
  bt.drawImage(c, 0, 0);
  const A = t.getImageData(0, 0, 1024, 1024), B = bt.getImageData(0, 0, 1024, 1024).data;
  for (let i = 3; i < A.data.length; i += 4) if (A.data[i] > 250 && B[i] > 196 && B[i] < 228) A.data[i] = 0;
  t.putImageData(A, 0, 0);
  return c;
}

// the shield: a double outline, STUDIO across its top, 51 filling the rest
function drawShield(g, cx, top, w, h, fifty) {
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineJoin = "round";
  shieldPath(g, cx, top, w, h); g.lineWidth = w * 0.035; g.stroke();
  const iw = w * 0.86, ih = h * 0.92, itop = top + h * 0.04;
  shieldPath(g, cx, itop, iw, ih); g.lineWidth = w * 0.012; g.stroke();
  // STUDIO, in the band across the top, with a hairline under it
  letters(g, "STUDIO", cx, itop + ih * 0.15, w * 0.115, w * 0.03, 700);
  g.lineWidth = w * 0.01;
  g.beginPath(); g.moveTo(cx - iw * 0.36, itop + ih * 0.2); g.lineTo(cx + iw * 0.36, itop + ih * 0.2); g.stroke();
  // 51, the same size it was before STUDIO joined it
  g.save();
  shieldPath(g, cx, itop + ih * 0.035, iw * 0.95, ih * 0.93);
  g.clip();
  const bw = iw * 0.94, bh = h * 0.635;
  g.drawImage(fifty, cx - bw / 2, itop + ih * 0.225, bw, bh);
  g.restore();
  g.restore();
}

// the ICAO chip symbol, as on the passport: a gold block, a line through it, a ring in the middle
function drawChip(g, cx, cy, w) {
  const h = w * 0.5;
  g.save();
  g.fillStyle = "#fff";
  g.fillRect(cx - w / 2, cy - h / 2, w, h);
  g.globalCompositeOperation = "destination-out";
  g.fillRect(cx - w / 2, cy - h * 0.06, w, h * 0.12);
  g.beginPath(); g.arc(cx, cy, h * 0.34, 0, Math.PI * 2); g.arc(cx, cy, h * 0.2, 0, Math.PI * 2, true); g.fill();
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

// heights -> a tangent-space normal map (red right, green up), written into an ImageData
function writeNormal(out, i, nx, ny) {
  const len = Math.hypot(nx, ny, 1);
  out[i] = (nx / len * 0.5 + 0.5) * 255;
  out[i + 1] = (ny / len * 0.5 + 0.5) * 255;
  out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
  out[i + 3] = 255;
}
const texFrom = (img, srgb, repeat = false) => {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
};

// The front cover: colour, finish (green: roughness, blue: metalness) and relief, in one pass over
// the pixels, a few rows at a time. The grain is a small tile repeated; the foil is pressed in.
async function coverTextures(grain, GN) {
  const foil = document.createElement("canvas");
  foil.width = CW; foil.height = CH;
  const g = foil.getContext("2d");
  const cx = CW / 2;
  drawCrown(g, cx, CH * 0.1, CW * 0.31, CH * 0.13);
  drawShield(g, cx, CH * 0.24, CW * 0.29, CH * 0.268, fiftyOne());
  letters(g, "R4N", cx, CH * 0.635, CW * 0.165, CW * 0.022);
  letters(g, "BOOKING", cx, CH * 0.76, CW * 0.098, CW * 0.02);
  drawChip(g, cx, CH * 0.905, CW * 0.11);
  await breathe();
  const foilPx = g.getImageData(0, 0, CW, CH).data;
  const soft = document.createElement("canvas");
  soft.width = CW; soft.height = CH;
  const sg = soft.getContext("2d");
  sg.filter = "blur(1.5px)";
  sg.drawImage(foil, 0, 0);
  const sp = sg.getImageData(0, 0, CW, CH).data;
  await breathe();

  const color = new ImageData(CW, CH), finish = new ImageData(CW, CH), normal = new ImageData(CW, CH);
  const fa = (x, y) => sp[((clamp(y, 0, CH - 1)) * CW + clamp(x, 0, CW - 1)) * 4 + 3] / 255;
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x, p = i * 4;
      const f = foilPx[p + 3] / 255;
      const gx = x % GN, gy = y % GN;
      const gh = grain[gy * GN + gx];
      // colour: crimson, a touch darker in the grain's valleys; the foil pale satin gold
      const shade = 0.93 + 0.1 * gh;
      for (let c = 0; c < 3; c++) color.data[p + c] = RED[c] * shade * (1 - f) + GOLD[c] * f;
      color.data[p + 3] = 255;
      finish.data[p + 1] = (0.5 - 0.08 * gh) * (1 - f) * 255 + 0.36 * 255 * f;
      finish.data[p + 2] = 0.85 * 255 * f;
      finish.data[p + 3] = 255;
      // relief: the grain (not on the foil, which is pressed smooth), and the foil's pressed edges
      const k = 1 - fa(x, y);
      const ghx = grain[gy * GN + (gx + 1) % GN] - grain[gy * GN + (gx - 1 + GN) % GN];
      const ghy = grain[((gy + 1) % GN) * GN + gx] - grain[((gy - 1 + GN) % GN) * GN + gx];
      const fx = fa(x + 1, y) - fa(x - 1, y), fy = fa(x, y + 1) - fa(x, y - 1);
      writeNormal(normal.data, p, -ghx * 0.9 * k + fx * 1.6, ghy * 0.9 * k - fy * 1.6);
    }
    if (y % 96 === 0) await breathe();
  }
  return { map: texFrom(color, true), finish: texFrom(finish, false), normal: texFrom(normal, false) };
}

// the back cover and the spine: crimson and grain only (a small repeating tile)
function plainCover(grain, GN) {
  const color = new ImageData(GN, GN), normal = new ImageData(GN, GN);
  for (let y = 0; y < GN; y++) for (let x = 0; x < GN; x++) {
    const i = y * GN + x, p = i * 4, gh = grain[i];
    const shade = 0.93 + 0.1 * gh;
    for (let c = 0; c < 3; c++) color.data[p + c] = RED[c] * shade;
    color.data[p + 3] = 255;
    const ghx = grain[y * GN + (x + 1) % GN] - grain[y * GN + (x - 1 + GN) % GN];
    const ghy = grain[((y + 1) % GN) * GN + x] - grain[((y - 1 + GN) % GN) * GN + x];
    writeNormal(normal.data, p, -ghx * 0.9, ghy * 0.9);
  }
  return { map: texFrom(color, true, true), normal: texFrom(normal, false, true) };
}

// page edges: white paper with a cool tint, many sheets; warm light shows in the gaps between them
function pageEdges() {
  const c = document.createElement("canvas"), e = document.createElement("canvas");
  c.width = e.width = 8; c.height = e.height = 512;
  const g = c.getContext("2d"), ge = e.getContext("2d");
  ge.fillStyle = "#000"; ge.fillRect(0, 0, 8, 512);
  const sheets = 44;
  for (let i = 0; i < sheets; i++) {
    const y0 = (i / sheets) * 512, y1 = ((i + 1) / sheets) * 512;
    const v = 226 + Math.random() * 14;
    g.fillStyle = `rgb(${v - 4},${v},${v + 6})`;
    g.fillRect(0, y0, 8, y1 - y0);
    g.fillStyle = "rgba(120,130,150,0.45)";
    g.fillRect(0, y1 - 1, 8, 1);
    ge.fillStyle = "rgb(255,196,110)";
    ge.fillRect(0, y1 - 1.6, 8, 1.6);
  }
  const t = new THREE.CanvasTexture(c), te = new THREE.CanvasTexture(e);
  t.colorSpace = te.colorSpace = THREE.SRGBColorSpace;
  return { map: t, emissive: te };
}

// A page of security paper, as inside a passport: pale tint, fine wavy guilloche lines, a faint
// crest. Drawn in "reading" coordinates (rw x rh, upright as the visitor sees it); `place` maps
// them onto the texture, so the same page can be shown upright on any side of the booklet.
function paperPage(tw, th, place, rw, rh, draw) {
  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  const g = c.getContext("2d");
  g.setTransform(...place);
  g.fillStyle = "#edf1ea";
  g.fillRect(0, 0, rw, rh);
  // guilloche: families of fine sine waves, slowly drifting in phase
  g.lineWidth = 1;
  for (let fam = 0; fam < 3; fam++) {
    g.strokeStyle = ["rgba(120,170,150,0.16)", "rgba(200,130,160,0.12)", "rgba(110,140,190,0.12)"][fam];
    for (let k = 0; k < 46; k++) {
      g.beginPath();
      for (let x = 0; x <= rw; x += 8) {
        const y = (k / 46) * rh * 1.1 - rh * 0.05 + Math.sin(x / rw * Math.PI * (3 + fam) + k * 0.35 + fam) * rh * 0.03
          + Math.sin(x / rw * Math.PI * 11 + k * 0.9) * rh * 0.006;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  draw(g, rw, rh);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// The light streaming out between the pages: a sheet in the page plane, larger than the passport.
// Brightness falls off with the distance from the passport's outline; rays fan out from it, drift
// and flicker; it fades to nothing well before the sheet's own edge. Less at the spine.
function lightSheet(pw, ph) {
  const SW = W * 5, SH = H * 4;
  const geo = new THREE.PlaneGeometry(SW, SH, 1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { time: { value: 0 }, flare: { value: 0 }, power: { value: 0 }, size: { value: new THREE.Vector2(pw, ph) }, sheet: { value: new THREE.Vector2(SW, SH) } },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform float time, flare, power;
      uniform vec2 size, sheet;
      float hash(float n){ return fract(sin(n) * 43758.5453); }
      float noise(float x){ float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(hash(i), hash(i + 1.0), f); }
      float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }
      void main(){
        vec2 p = vP;
        float d = sdBox(p, size * 0.5, ${R.toFixed(3)});
        if (d < 0.0) discard;
        float a = atan(p.y, p.x);
        float rays = noise(a * 18.0 + time * 0.3) * 0.55 + noise(a * 41.0 - time * 0.5 + 7.0) * 0.35 + noise(a * 7.0 + time * 0.12 + 3.0) * 0.3;
        rays = pow(rays, 2.4);
        float side = smoothstep(-0.25, 0.3, p.x / size.x + 0.5);       // the spine lets out far less
        float near = exp(-d * 46.0);
        float far = exp(-d * (8.0 - 1.5 * flare)) * rays;
        float flick = 0.9 + 0.1 * noise(time * 6.0);
        vec2 e = 0.5 * sheet - abs(p);                                  // distance to the sheet's own edge
        float edge = smoothstep(0.0, 0.35, min(e.x, e.y));
        float k = (near * 0.9 + far * 0.32) * side * flick * power * (1.0 + 1.2 * flare) * edge;
        vec3 col = mix(vec3(1.0, 0.55, 0.16), vec3(1.0, 0.86, 0.6), near);
        gl_FragColor = vec4(col * k, 1.0);
      }`,
  });
  const m = new THREE.Mesh(geo, mat);
  m.renderOrder = 2;
  return m;
}

// A small spring (underdamped: it overshoots a little and settles, like something physical)
const spring = (omega, zeta) => ({ x: 0, v: 0, omega, zeta });
function stepSpring(s, target, dt) {
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
  for (let i = 0; i < n; i++) {
    const a = -s.omega * s.omega * (s.x - target) - 2 * s.zeta * s.omega * s.v;
    s.v += a * h;
    s.x += s.v * h;
  }
}
export async function createPassport(layer) {
  await Promise.all(["600", "700"].map((w) => new FontFace("Cinzel", `url(${new URL(`../assets/fonts/cinzel-latin-${w}-normal.woff2`, import.meta.url)})`, { weight: w }).load().then((f) => document.fonts.add(f))));

  const canvas = document.createElement("canvas");
  canvas.className = "booking__canvas";
  layer.appendChild(canvas);
  const lowPower = window.matchMedia("(pointer: coarse)").matches || window.innerWidth <= 768;
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.5 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.95;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

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

  // ---- textures (made in pieces so whatever else is on screen keeps moving) ----
  const GN = 128;
  const grain = grainTile(GN, 3.2, 424242);
  await breathe();
  const tex = await coverTextures(grain, GN);
  const plain = plainCover(grain, GN);
  plain.map.repeat.set(W * CW / GN / W, H * CH / GN / H);
  plain.normal.repeat.copy(plain.map.repeat);

  // ---- the booklet ----
  const passport = new THREE.Group(); // where it is and how it's turned
  const body = new THREE.Group();     // the shoves move this, inside that
  passport.add(body);
  scene.add(passport);

  const coverSurface = { roughness: 1, metalness: 1, clearcoat: 0.35, clearcoatRoughness: 0.42, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x8a2a32) };
  const frontMat = new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.finish, metalnessMap: tex.finish, normalMap: tex.normal, ...coverSurface });
  const backMat = new THREE.MeshPhysicalMaterial({ map: plain.map, normalMap: plain.normal, ...coverSurface, roughness: 0.5, metalness: 0 });
  const edgeMat = new THREE.MeshPhysicalMaterial({ color: 0x6a1019, roughness: 0.5, sheen: 0.3, sheenColor: new THREE.Color(0x7a2028) });

  // the cover: front and back panels, joined by a rounded spine. Panel UVs: the board, exactly.
  const panelGeo = new THREE.ExtrudeGeometry(panelShape(W, H, R), { depth: COVER, bevelEnabled: true, bevelThickness: 0.0006, bevelSize: 0.0006, bevelSegments: 1, curveSegments: 10 });
  {
    const uv = panelGeo.attributes.uv, pos = panelGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W, pos.getY(i) / H + 0.5);
  }
  // the front cover hinges at the spine (it lifts a hair when shoved; it opens all the way)
  const hinge = new THREE.Group();
  hinge.position.set(-W / 2, 0, PAGES / 2);
  body.add(hinge);
  const front = new THREE.Mesh(panelGeo, [frontMat, edgeMat]);
  hinge.add(front);
  const back = new THREE.Mesh(panelGeo, [backMat, edgeMat]);
  back.position.set(-W / 2, 0, -PAGES / 2);
  back.scale.z = -1;
  body.add(back);
  {
    const sh = new THREE.Shape();
    sh.absarc(0, 0, T / 2, Math.PI / 2, Math.PI * 1.5, false);
    sh.absarc(0, 0, PAGES / 2, Math.PI * 1.5, Math.PI / 2, true);
    const g = new THREE.ExtrudeGeometry(sh, { depth: H, bevelEnabled: false, curveSegments: 20 });
    g.rotateX(Math.PI / 2);
    g.translate(-W / 2, H / 2, 0);
    const uv = g.attributes.uv, pos = g.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getZ(i) / T + 0.5, pos.getY(i) / H + 0.5);
    body.add(new THREE.Mesh(g, backMat));
  }
  // the inside of the front cover: paper, seen when it opens
  const insideGeo = new THREE.ShapeGeometry(panelShape(W, H, R), 10);
  {
    const uv = insideGeo.attributes.uv, pos = insideGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / W, pos.getY(i) / H + 0.5);
  }
  const insideMat = new THREE.MeshStandardMaterial({ color: 0xedf1ea, roughness: 0.85, side: THREE.BackSide });
  const inside = new THREE.Mesh(insideGeo, insideMat);
  inside.position.z = -0.0009;
  hinge.add(inside);

  // the pages: a block a little inside the cover on the open sides, rounded into the spine
  const PW = W - OV, PH = H - 2 * OV, PD = PAGES * 0.97;
  const pagesTex = pageEdges();
  const pageGeo = new THREE.ExtrudeGeometry(panelShape(PW, PH, R * 0.85), { depth: PD, bevelEnabled: false, curveSegments: 10 });
  pageGeo.translate(-W / 2, 0, -PD / 2);
  {
    const uv = pageGeo.attributes.uv, pos = pageGeo.attributes.position;
    const [caps, sides] = pageGeo.groups;
    for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / PW, pos.getY(i) / PH + 0.5);
    for (let i = sides.start; i < sides.start + sides.count; i++) uv.setXY(i, 0.5, pos.getZ(i) / PD + 0.5);
  }
  const firstPageMat = new THREE.MeshStandardMaterial({ color: 0xedf1ea, roughness: 0.85 });
  const pageEdgeMat = new THREE.MeshStandardMaterial({ map: pagesTex.map, emissive: 0xffffff, emissiveMap: pagesTex.emissive, emissiveIntensity: 0.8, roughness: 0.9 });
  const pagesMesh = new THREE.Mesh(pageGeo, [firstPageMat, pageEdgeMat]);
  body.add(pagesMesh);
  const pageRound = new THREE.Mesh(new THREE.CylinderGeometry(PD / 2, PD / 2, PH, 16, 1, false, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.9 }));
  pageRound.position.x = -W / 2;
  body.add(pageRound);
  const sheet = lightSheet(PW, PH);
  sheet.position.x = -W / 2 + PW / 2;
  body.add(sheet);

  // ---- what's written inside (for now) ----
  // tall screens show it the way a passport is shown: turned on its side, the spine across the
  // middle; the same page then reads along the other axis of the paper
  const TW = 1024, TH = Math.round(1024 * PH / PW);
  let insideMode = "";
  function writeInside(vertical) {
    const mode = vertical ? "v" : "h";
    if (mode === insideMode) return;
    insideMode = mode;
    firstPageMat.map?.dispose(); insideMat.map?.dispose();
    const heading = (g, x, y, size) => {
      g.fillStyle = "#c2273a";
      g.font = `700 ${size}px "Cinzel"`;
      g.fillText("R4N · BOOKING", x, y);
    };
    const firstPage = (g, rw, rh) => {
      const s = Math.min(rw, rh) / 1000;
      heading(g, rw * 0.08, rh * 0.11, 44 * s);
      g.fillStyle = "#2a2a2c";
      g.font = `600 ${74 * s}px ui-monospace, Menlo, Consolas, monospace`;
      g.textAlign = "center";
      g.fillText("broski ekke", rw / 2, rh * 0.48);
      g.fillText("klar ennå as", rw / 2, rh * 0.48 + 96 * s);
      g.font = `500 ${30 * s}px ui-monospace, Menlo, Consolas, monospace`;
      g.fillStyle = "rgba(40,40,44,0.75)";
      g.textAlign = "left";
      g.fillText("P<R4N<<BOOKING<<STUDIO<51<<<<<<<<<<<<<<<<<", rw * 0.06, rh * 0.86);
      g.fillText("R4N510000<0NOR<<<<<<<<<<<<<<<<<<<<<<<<<<00", rw * 0.06, rh * 0.86 + 42 * s);
    };
    const insideCover = (g, rw, rh) => {
      const s = Math.min(rw, rh) / 1000;
      g.globalAlpha = 0.09;
      g.strokeStyle = "#7a3a40"; g.lineWidth = 6 * s;
      shieldPath(g, rw / 2, rh * 0.3, rw * 0.28, rh * 0.36); g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = "#c2273a";
      g.font = `600 ${30 * s}px "Cinzel"`;
      g.fillText("Dette passet gjelder for alle scener", rw * 0.08, rh * 0.1);
    };
    if (vertical) {
      // the booklet is turned a quarter clockwise, so "up" on the page is towards the spine
      firstPageMat.map = paperPage(TW, TH, [0, -1, 1, 0, 0, TH], TH, TW, firstPage);
      insideMat.map = paperPage(TW, TH, [0, -1, -1, 0, TW, TH], TH, TW, insideCover);
    } else {
      firstPageMat.map = paperPage(TW, TH, [1, 0, 0, 1, 0, 0], TW, TH, firstPage);
      insideMat.map = paperPage(TW, TH, [-1, 0, 0, 1, TW, 0], TW, TH, insideCover);
    }
    firstPageMat.color.set(0xffffff); insideMat.color.set(0xffffff);
    firstPageMat.needsUpdate = insideMat.needsUpdate = true;
  }

  // ---- framing: never distorted (a narrow camera), sized to the screen ----
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.45, 0.6, 0.88);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  }
  // how far back the camera stands to show a w x h thing at the given share of the screen
  function distanceFor(w, h, shareW, shareH) {
    const t = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2);
    return Math.max(h / shareH / (2 * t), w / shareW / (2 * t * camera.aspect));
  }
  resize();
  window.addEventListener("resize", resize);

  // ---- motion ----
  // Something inside shoves now and then: a short run of one to three pushes, each of its own size
  // and direction, on springs, so it rocks, settles, and never does the same thing twice.
  const sy = spring(15, 0.3), srx = spring(19, 0.26), sry = spring(17, 0.28), srz = spring(21, 0.25);
  const lid = spring(13, 0.36);
  let nextEvent = 1.8, pending = [];
  let flare = 0, hover = 0, hoverGoal = 0, appear = 0, appearGoal = 0;
  let openK = 0, openGoal = 0, vertical = false;
  let paused = false, raf = 0, last = performance.now(), time = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const hitTargets = [front, back, pagesMesh, inside];

  function shove(m) {
    const r = Math.random;
    sy.v += m * (0.18 + 0.14 * r());
    srx.v += m * (r() - 0.5) * 0.55;
    sry.v += m * (r() - 0.5) * 0.5;
    srz.v += m * (r() - 0.5) * 0.7;
    lid.v += m * (0.35 + 0.45 * r());
  }
  function scheduleEvent(power = 1) {
    const n = 1 + Math.floor(Math.random() * Math.random() * 3.2); // mostly one or two
    let t = 0;
    for (let i = 0; i < n; i++) {
      pending.push({ at: time + t, m: power * (0.45 + 0.55 * Math.random()) * (i ? 0.75 : 1) });
      t += 0.09 + Math.random() * 0.18;
    }
  }

  const POSE = { x: -0.2, y: 0.16, z: -0.09 };
  function tick(now) {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (paused) return;
    time += dt;
    appear += (appearGoal - appear) * (1 - Math.exp(-dt * (appearGoal > appear ? 2.2 : 4)));
    hover += (hoverGoal - hover) * (1 - Math.exp(-dt * 6));
    openK += (openGoal - openK) * (1 - Math.exp(-dt * 3.2));

    // shoves: only while closed and in view
    if (!reducedMotion && openGoal === 0 && openK < 0.02 && appear > 0.9) {
      nextEvent -= dt;
      if (nextEvent <= 0) { scheduleEvent(); nextEvent = 3 + Math.random() * 2; }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (time >= pending[i].at) { shove(pending[i].m); pending.splice(i, 1); }
    // the cover breathes a hair even at rest, as if pushed from inside
    const rest = openK > 0.01 ? 0 : 0.004 * (0.5 + 0.5 * Math.sin(time * 0.9));
    for (const s of [sy, srx, sry, srz]) stepSpring(s, 0, dt);
    stepSpring(lid, rest, dt);
    const lift = Math.max(0, lid.x);
    flare += (clamp(lift * 14 + Math.abs(sy.v) * 1.2, 0, 1.2) - flare) * (1 - Math.exp(-dt * 10));

    // pose: tilted and floating when closed; flat, facing you, turned for the screen when open
    const float = Math.sin(time * 1.1) * 0.01 * (1 - openK);
    const turnZ = vertical ? -Math.PI / 2 : 0;
    passport.position.set(0, float, (1 - appear) * -6);
    passport.rotation.set(
      mix(POSE.x + Math.sin(time * 0.7) * 0.02 + pointer.y * 0.05 * hover, -0.03, openK),
      mix(POSE.y + Math.sin(time * 0.55) * 0.03 + pointer.x * 0.07 * hover, 0, openK),
      mix(POSE.z + Math.sin(time * 0.45) * 0.01, turnZ, openK)
    );
    body.position.set(W / 2 * openK, sy.x, 0);
    body.rotation.set(srx.x * 0.05, sry.x * 0.05, srz.x * 0.05);
    // the cover: lifted by the shoves; opened all the way round when open
    hinge.rotation.y = -(lift * 0.9 + openK * Math.PI);

    // the camera: the closed booklet takes a good part of the screen; open, it comes closer
    const closedD = distanceFor(W * 1.1, H * 1.05, 0.62, 0.56);
    const openD = vertical ? distanceFor(H * 1.06, 2 * W * 1.08, 0.86, 0.72) : distanceFor(2 * W * 1.06, H * 1.06, 0.8, 0.8);
    camera.position.set(0, 0, mix(closedD, openD, openK));
    camera.lookAt(0, 0, 0);

    const glow = appear * (0.85 + 0.15 * hover) * (1 - 0.7 * openK);
    sheet.material.uniforms.time.value = time;
    sheet.material.uniforms.flare.value = flare + hover * 0.2;
    sheet.material.uniforms.power.value = glow;
    pageEdgeMat.emissiveIntensity = (0.75 + flare * 1.2 + hover * 0.25) * glow;
    for (const l of glowLights) l.intensity = (0.05 + flare * 0.35) * glow * (1 - openK);
    key.intensity = 1.15 + openK * 0.6;
    bloom.strength = 0.42 + flare * 0.3;
    canvas.style.opacity = String(clamp(appear * 1.6, 0, 1));
    composer.render();
  }

  // ---- pointer: hover warms it a little; a click opens it; a click outside (or Esc) closes it ----
  function overPassport(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(hitTargets, false).length > 0;
  }
  const onMove = (e) => {
    if (e.pointerType === "touch") return;
    const on = overPassport(e);
    hoverGoal = on && openGoal === 0 ? 1 : 0;
    canvas.style.cursor = on ? (openGoal ? "zoom-out" : "pointer") : "";
  };
  const onLeave = () => { hoverGoal = 0; canvas.style.cursor = ""; };
  const onClick = (e) => {
    const on = overPassport(e);
    if (openGoal) api.close();
    else if (on) api.open();
  };
  const onKey = (e) => { if (e.key === "Escape" && openGoal) api.close(); };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey);

  // prepare every shader now, so the first frame on screen doesn't stall
  writeInside(window.innerHeight > window.innerWidth * 1.05);
  renderer.compile(scene, camera);
  raf = requestAnimationFrame(tick);

  const api = {
    canvas,
    get isOpen() { return openGoal === 1; },
    show(animate = true) { appearGoal = 1; if (!animate) appear = 1; nextEvent = 1.6; },
    hide(animate = true) {
      appearGoal = 0; openGoal = 0;
      if (!animate || reducedMotion) { appear = 0; openK = 0; return Promise.resolve(); }
      return new Promise((r) => setTimeout(r, 650));
    },
    open() {
      if (openGoal) return;
      vertical = window.innerHeight > window.innerWidth * 1.05;
      writeInside(vertical);
      openGoal = 1; hoverGoal = 0; pending = [];
    },
    close() { openGoal = 0; },
    setPaused(p) { paused = p; last = performance.now(); },
    dispose() {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      canvas.remove();
    },
  };
  return api;
}
