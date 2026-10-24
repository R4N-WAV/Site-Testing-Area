// BOOKING: a passport, built like the red Norwegian one, lying in the dark with warm light leaking
// out between its pages, as if something inside wants out. Click it and it opens onto memories of
// a trip: stamps, a film of the show, and a way to book the next one.
//
// Everything is made here in code. The booklet: a thin cover that wraps round a rounded spine
// from the front to the back, overhanging a block of pages a little; square at the spine, rounded
// on the open side. The cover: deep crimson with a very fine grain under a satin sheen, pale gold
// foil stamped into it (a crown over a shield holding STUDIO and 51, R4N, BOOKING, the chip
// symbol). The light: the page edges glow, a sheet of moving rays fans out of the gap all round,
// and a bloom pass makes it bleed. Now and then something inside shoves: small pushes on springs,
// never twice the same; the cover lifts a hair and the light flares with it.
// Open: the cover swings over, ten pages riffle past, and it lands on a spread of warm beige paper
// where the stamps thunk down one by one. Wide screens open it like a book; tall screens open it
// the way a passport is shown, the spine across the middle and the pages on their side.
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

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;
const ease = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);
const BG = 0x09090b; // the site's white, inverted
const BOOK_URL = "mailto:r4nmusic@outlook.com?subject=Booking%20R4N";
// long work in small pieces, so the page keeps moving while it's done
const breathe = () => new Promise((r) => setTimeout(r, 0));

// ---- the booklet, in units of 100 mm: a passport is 88 x 125 mm, about 5.5 mm thick ----
const W = 0.88, H = 1.25;
const COVER = 0.0045;         // the cover: thin and flexible
const PAGES = 0.046;          // the block of pages
const T = PAGES + 2 * COVER;  // closed thickness
const OV = 0.011;             // the cover overhangs the pages on the open sides
const R = 0.032;              // corner radius (open side only; square at the spine)
const PW = W - OV, PH = H - 2 * OV, PD = PAGES * 0.97;
const LEAVES = 10;            // pages that riffle past when it opens

// ---- the cover artwork ----
const CW = 1024, CH = Math.round(1024 * H / W);
const RED = [134, 18, 30];
const GOLD = [226, 199, 132];
const PAPER = "#ece0c4";      // warm beige book paper

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

// A very fine grain over the whole cover (no tile, no grid): three octaves of smooth value noise,
// the finest about a pixel and a half across. Heights 0..1.
async function grainField(w, h, seed) {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const octaves = [[1.6, 0.5], [3.4, 0.32], [8.5, 0.18]].map(([cell, amp]) => {
    const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
    const v = new Float32Array(gw * gh);
    for (let i = 0; i < v.length; i++) v[i] = rnd();
    return { cell, amp, gw, v };
  });
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (const o of octaves) {
        const fx = x / o.cell, fy = y / o.cell, ix = fx | 0, iy = fy | 0;
        let tx = fx - ix, ty = fy - iy;
        tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty);
        const r0 = iy * o.gw + ix, r1 = r0 + o.gw;
        sum += o.amp * ((o.v[r0] * (1 - tx) + o.v[r0 + 1] * tx) * (1 - ty) + (o.v[r1] * (1 - tx) + o.v[r1 + 1] * tx) * ty);
      }
      out[y * w + x] = sum;
    }
    if (y % 160 === 0) await breathe();
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

// A word as a solid gold figure, like the lion: bolder than the lettering (outlined as well as
// filled), with a fine line engraved just inside its outline. Returns a canvas cropped to it.
function engravedFigure(text, bold) {
  const size = 600, pad = 80;
  const probe = document.createElement("canvas").getContext("2d");
  probe.font = `700 ${size}px "Cinzel"`;
  if ("letterSpacing" in probe) probe.letterSpacing = `${size * 0.04}px`;
  const m = probe.measureText(text);
  const tw = Math.ceil(m.actualBoundingBoxLeft + m.actualBoundingBoxRight), th = Math.ceil(m.actualBoundingBoxAscent + m.actualBoundingBoxDescent);
  const c = document.createElement("canvas");
  c.width = tw + pad * 2; c.height = th + pad * 2;
  const t = c.getContext("2d");
  t.font = probe.font;
  if ("letterSpacing" in t) t.letterSpacing = `${size * 0.04}px`;
  t.fillStyle = "#fff"; t.strokeStyle = "#fff"; t.lineJoin = "round"; t.lineWidth = bold;
  const x = pad + m.actualBoundingBoxLeft, y = pad + m.actualBoundingBoxAscent;
  t.fillText(text, x, y); t.strokeText(text, x, y);
  const b = document.createElement("canvas");
  b.width = c.width; b.height = c.height;
  const bt = b.getContext("2d");
  bt.filter = `blur(${Math.round(bold * 0.2)}px)`;
  bt.drawImage(c, 0, 0);
  const A = t.getImageData(0, 0, c.width, c.height), B = bt.getImageData(0, 0, c.width, c.height).data;
  for (let i = 3; i < A.data.length; i += 4) if (A.data[i] > 250 && B[i] > 196 && B[i] < 228) A.data[i] = 0;
  t.putImageData(A, 0, 0);
  return c;
}

// the shield: a double outline; STUDIO across its top and 51 filling the rest, both as figures
function drawShield(g, cx, top, w, h) {
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineJoin = "round";
  shieldPath(g, cx, top, w, h); g.lineWidth = w * 0.035; g.stroke();
  const iw = w * 0.86, ih = h * 0.92, itop = top + h * 0.04;
  shieldPath(g, cx, itop, iw, ih); g.lineWidth = w * 0.012; g.stroke();
  g.save();
  shieldPath(g, cx, itop + ih * 0.035, iw * 0.95, ih * 0.93);
  g.clip();
  const studio = engravedFigure("STUDIO", 40), fifty = engravedFigure("51", 60);
  const sw = iw * 0.8, sh = sw * studio.height / studio.width;
  g.drawImage(studio, cx - sw / 2, itop + ih * 0.06, sw, sh);
  // 51: the same size it has been (tall, filling the shield's width)
  const fw = iw * 0.94, fh = h * 0.6;
  g.drawImage(fifty, cx - fw / 2, itop + ih * 0.06 + sh + ih * 0.01, fw, fh);
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

function letters(g, text, cx, baseline, size, spacing, weight = 600, color = "#fff") {
  g.save();
  g.font = `${weight} ${size}px "Cinzel"`;
  if ("letterSpacing" in g) g.letterSpacing = `${spacing}px`;
  g.fillStyle = color;
  g.textAlign = "center";
  // letterSpacing adds after every letter, the last one too: shift back by half of it
  g.fillText(text, cx + spacing / 2, baseline);
  g.restore();
}

function writeNormal(out, i, nx, ny) {
  const len = Math.hypot(nx, ny, 1);
  out[i] = (nx / len * 0.5 + 0.5) * 255;
  out[i + 1] = (ny / len * 0.5 + 0.5) * 255;
  out[i + 2] = (1 / len * 0.5 + 0.5) * 255;
  out[i + 3] = 255;
}
function canvasTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
const texFrom = (img, srgb) => {
  const c = document.createElement("canvas");
  c.width = img.width; c.height = img.height;
  c.getContext("2d").putImageData(img, 0, 0);
  return canvasTex(c, srgb);
};

// The covers: colour, finish (green: roughness, blue: metalness) and relief for the front (with
// its foil) and the back (grain only), in one pass over the pixels, a few rows at a time.
async function coverTextures() {
  const foil = document.createElement("canvas");
  foil.width = CW; foil.height = CH;
  const g = foil.getContext("2d");
  const cx = CW / 2;
  drawCrown(g, cx, CH * 0.1, CW * 0.31, CH * 0.13);
  drawShield(g, cx, CH * 0.24, CW * 0.29, CH * 0.285);
  letters(g, "R4N", cx, CH * 0.645, CW * 0.165, CW * 0.022);
  letters(g, "BOOKING", cx, CH * 0.765, CW * 0.098, CW * 0.02);
  drawChip(g, cx, CH * 0.905, CW * 0.11);
  await breathe();
  const foilPx = g.getImageData(0, 0, CW, CH).data;
  const soft = document.createElement("canvas");
  soft.width = CW; soft.height = CH;
  const sg = soft.getContext("2d");
  sg.filter = "blur(1.5px)";
  sg.drawImage(foil, 0, 0);
  const sp = sg.getImageData(0, 0, CW, CH).data;
  const grain = await grainField(CW, CH, 424242);

  const color = new ImageData(CW, CH), finish = new ImageData(CW, CH), normal = new ImageData(CW, CH);
  const bColor = new ImageData(CW, CH), bNormal = new ImageData(CW, CH);
  const fa = (x, y) => sp[((clamp(y, 0, CH - 1)) * CW + clamp(x, 0, CW - 1)) * 4 + 3] / 255;
  const gr = (x, y) => grain[clamp(y, 0, CH - 1) * CW + clamp(x, 0, CW - 1)];
  for (let y = 0; y < CH; y++) {
    for (let x = 0; x < CW; x++) {
      const i = y * CW + x, p = i * 4;
      const f = foilPx[p + 3] / 255, gh = grain[i];
      const shade = 0.95 + 0.08 * gh;
      for (let c = 0; c < 3; c++) {
        color.data[p + c] = RED[c] * shade * (1 - f) + GOLD[c] * f;
        bColor.data[p + c] = RED[c] * shade;
      }
      color.data[p + 3] = bColor.data[p + 3] = 255;
      finish.data[p + 1] = (0.48 - 0.05 * gh) * (1 - f) * 255 + 0.36 * 255 * f;
      finish.data[p + 2] = 0.85 * 255 * f;
      finish.data[p + 3] = 255;
      const ghx = gr(x + 1, y) - gr(x - 1, y), ghy = gr(x, y + 1) - gr(x, y - 1);
      const k = 1 - fa(x, y);
      const fx = fa(x + 1, y) - fa(x - 1, y), fy = fa(x, y + 1) - fa(x, y - 1);
      writeNormal(normal.data, p, -ghx * 0.55 * k + fx * 1.6, ghy * 0.55 * k - fy * 1.6);
      writeNormal(bNormal.data, p, -ghx * 0.55, ghy * 0.55);
    }
    if (y % 96 === 0) await breathe();
  }
  return {
    map: texFrom(color, true), finish: texFrom(finish, false), normal: texFrom(normal, false),
    backMap: texFrom(bColor, true), backNormal: texFrom(bNormal, false),
  };
}

// page edges: warm paper, many sheets; light shows in the gaps between them
function pageEdges() {
  const c = document.createElement("canvas"), e = document.createElement("canvas");
  c.width = e.width = 8; c.height = e.height = 512;
  const g = c.getContext("2d"), ge = e.getContext("2d");
  ge.fillStyle = "#000"; ge.fillRect(0, 0, 8, 512);
  const sheets = 44;
  for (let i = 0; i < sheets; i++) {
    const y0 = (i / sheets) * 512, y1 = ((i + 1) / sheets) * 512;
    const v = 222 + Math.random() * 14;
    g.fillStyle = `rgb(${v + 4},${v - 4},${v - 22})`;
    g.fillRect(0, y0, 8, y1 - y0);
    g.fillStyle = "rgba(120,100,70,0.4)";
    g.fillRect(0, y1 - 1, 8, 1);
    ge.fillStyle = "rgb(255,196,110)";
    ge.fillRect(0, y1 - 1.6, 8, 1.6);
  }
  return { map: canvasTex(c), emissive: canvasTex(e) };
}

// Warm beige book paper, like an old notebook: an even tone, soft mottling, fine fibres, edges a
// shade darker. `draw` adds anything printed on it (in the page's upright reading coordinates).
let paperSeed = 7;
function paper(tw, th, draw) {
  const c = document.createElement("canvas");
  c.width = tw; c.height = th;
  const g = c.getContext("2d");
  let s = paperSeed++ * 7919;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, tw, th);
  for (let i = 0; i < 26; i++) { // mottling
    const x = rnd() * tw, y = rnd() * th, r = (0.1 + rnd() * 0.3) * tw;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() > 0.5 ? "rgba(190,160,110,0.07)" : "rgba(255,248,232,0.08)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineCap = "round";
  for (let i = 0; i < 900; i++) { // fibres
    const x = rnd() * tw, y = rnd() * th, a = rnd() * Math.PI, l = 3 + rnd() * 14;
    g.strokeStyle = rnd() > 0.5 ? `rgba(150,120,80,${0.05 + rnd() * 0.07})` : `rgba(255,252,240,${0.08 + rnd() * 0.08})`;
    g.lineWidth = 0.6 + rnd() * 0.8;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 2600; i++) { // specks
    g.fillStyle = `rgba(120,95,60,${rnd() * 0.12})`;
    g.fillRect(rnd() * tw, rnd() * th, 1 + rnd(), 1 + rnd());
  }
  const v = g.createRadialGradient(tw / 2, th / 2, Math.min(tw, th) * 0.35, tw / 2, th / 2, Math.max(tw, th) * 0.75);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(150,115,60,0.18)");
  g.fillStyle = v; g.fillRect(0, 0, tw, th);
  draw?.(g, tw, th, rnd);
  return canvasTex(c);
}

// ---------- the memories: postage stamps, rubber stamps, a film, a title, a button ----------
// a sheet of paper with a perforated (scalloped) edge, in the given colours, with art inside
function postageStamp(w, h, bg, art) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  const r = w * 0.022, step = r * 2.6;
  g.fillStyle = "#f6f0e1";
  g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-out";
  for (let x = step / 2; x < w; x += step) { g.beginPath(); g.arc(x, 0, r, 0, 7); g.arc(x, h, r, 0, 7); g.fill(); }
  for (let y = step / 2; y < h; y += step) { g.beginPath(); g.arc(0, y, r, 0, 7); g.arc(w, y, r, 0, 7); g.fill(); }
  g.globalCompositeOperation = "source-over";
  const m = w * 0.085;
  g.fillStyle = bg;
  g.fillRect(m, m, w - 2 * m, h - 2 * m);
  g.save();
  g.beginPath(); g.rect(m, m, w - 2 * m, h - 2 * m); g.clip();
  art(g, m, m, w - 2 * m, h - 2 * m);
  g.restore();
  // a little printing grain
  for (let i = 0; i < 1400; i++) { g.fillStyle = `rgba(255,255,255,${Math.random() * 0.06})`; g.fillRect(Math.random() * w, Math.random() * h, 1.5, 1.5); }
  return c;
}
function stampText(g, text, x, y, size, color, align = "left", weight = 700) {
  g.font = `${weight} ${size}px "Cinzel"`;
  g.fillStyle = color; g.textAlign = align;
  g.fillText(text, x, y);
}
const STAMPS = [
  // a record, crimson on mustard
  (W2, H2) => postageStamp(W2, H2, "#d9a73e", (g, x, y, w, h) => {
    g.fillStyle = "#1f1b1a"; g.beginPath(); g.arc(x + w * 0.55, y + h * 0.48, w * 0.36, 0, 7); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.12)"; g.lineWidth = 2;
    for (let k = 0.14; k < 0.35; k += 0.035) { g.beginPath(); g.arc(x + w * 0.55, y + h * 0.48, w * k, 0, 7); g.stroke(); }
    g.fillStyle = "#9b1c2c"; g.beginPath(); g.arc(x + w * 0.55, y + h * 0.48, w * 0.11, 0, 7); g.fill();
    stampText(g, "NORGE", x + w * 0.07, y + h * 0.12, w * 0.12, "#2a1d12");
    stampText(g, "51", x + w * 0.93, y + h * 0.94, w * 0.2, "#2a1d12", "right");
  }),
  // a microphone, cream on teal
  (W2, H2) => postageStamp(W2, H2, "#2f6f6a", (g, x, y, w, h) => {
    g.fillStyle = "#efe2c2";
    g.beginPath(); g.roundRect(x + w * 0.4, y + h * 0.16, w * 0.2, h * 0.34, w * 0.1); g.fill();
    g.strokeStyle = "#efe2c2"; g.lineWidth = w * 0.035; g.lineCap = "round";
    g.beginPath(); g.arc(x + w * 0.5, y + h * 0.38, w * 0.17, 0.15, Math.PI - 0.15); g.stroke();
    g.beginPath(); g.moveTo(x + w * 0.5, y + h * 0.56); g.lineTo(x + w * 0.5, y + h * 0.72); g.moveTo(x + w * 0.38, y + h * 0.72); g.lineTo(x + w * 0.62, y + h * 0.72); g.stroke();
    stampText(g, "LIVE", x + w * 0.5, y + h * 0.9, w * 0.17, "#efe2c2", "center");
    stampText(g, "R4N", x + w * 0.08, y + h * 0.13, w * 0.1, "#efe2c2");
  }),
  // mountains and a low sun, over a fjord
  (W2, H2) => postageStamp(W2, H2, "#bcd2d6", (g, x, y, w, h) => {
    g.fillStyle = "#e88f4a"; g.beginPath(); g.arc(x + w * 0.68, y + h * 0.42, w * 0.13, 0, 7); g.fill();
    g.fillStyle = "#3d5560";
    g.beginPath(); g.moveTo(x, y + h * 0.7); g.lineTo(x + w * 0.25, y + h * 0.38); g.lineTo(x + w * 0.42, y + h * 0.58); g.lineTo(x + w * 0.62, y + h * 0.32); g.lineTo(x + w, y + h * 0.66); g.lineTo(x + w, y + h); g.lineTo(x, y + h); g.fill();
    g.fillStyle = "#6f8c95"; g.fillRect(x, y + h * 0.74, w, h * 0.26);
    stampText(g, "OSLO", x + w * 0.08, y + h * 0.14, w * 0.12, "#22343a");
    stampText(g, "17", x + w * 0.92, y + h * 0.94, w * 0.16, "#efe2c2", "right");
  }),
  // the crown, gold on deep red
  (W2, H2) => postageStamp(W2, H2, "#7d1424", (g, x, y, w, h) => {
    const c = document.createElement("canvas"); c.width = 400; c.height = 400;
    const cg = c.getContext("2d");
    drawCrown(cg, 200, 70, 260, 260);
    cg.globalCompositeOperation = "source-in"; // the crown's shape, in gold
    cg.fillStyle = "#e3c784"; cg.fillRect(0, 0, 400, 400);
    g.drawImage(c, x + w * 0.1, y + h * 0.12, w * 0.8, w * 0.8);
    stampText(g, "STUDIO 51", x + w * 0.5, y + h * 0.9, w * 0.12, "#e3c784", "center");
  }),
];

// rubber stamps: ink, pressed unevenly (speckled, a little light at one side)
function inked(c, color, seed) {
  const g = c.getContext("2d");
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "destination-out";
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + rnd() * 0.7})`; const r = rnd() * 2.4 + 0.4; g.beginPath(); g.arc(rnd() * c.width, rnd() * c.height, r, 0, 7); g.fill(); }
  const grd = g.createLinearGradient(0, 0, c.width, c.height * 0.4);
  grd.addColorStop(0, "rgba(0,0,0,0.35)"); grd.addColorStop(0.5, "rgba(0,0,0,0)"); grd.addColorStop(1, "rgba(0,0,0,0.15)");
  g.fillStyle = grd; g.fillRect(0, 0, c.width, c.height);
  g.globalCompositeOperation = "source-over";
  return c;
}
function arcText(g, text, cx, cy, r, start, end, size, outside = true) {
  g.font = `700 ${size}px "Cinzel"`;
  g.textAlign = "center"; g.textBaseline = "middle";
  const chars = [...text], n = chars.length;
  chars.forEach((ch, i) => {
    const a = start + (end - start) * (n === 1 ? 0.5 : i / (n - 1));
    g.save();
    g.translate(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    g.rotate(a + (outside ? Math.PI / 2 : -Math.PI / 2));
    g.fillText(ch, 0, 0);
    g.restore();
  });
}
function ukmStamp(n) {
  const c = document.createElement("canvas");
  c.width = c.height = n;
  const g = c.getContext("2d"), m = n / 2;
  g.strokeStyle = g.fillStyle = "#000";
  g.lineWidth = n * 0.022; g.beginPath(); g.arc(m, m, n * 0.46, 0, 7); g.stroke();
  g.lineWidth = n * 0.01; g.beginPath(); g.arc(m, m, n * 0.425, 0, 7); g.stroke();
  g.lineWidth = n * 0.012; g.beginPath(); g.arc(m, m, n * 0.28, 0, 7); g.stroke();
  arcText(g, "UKM-FESTIVALEN", m, m, n * 0.355, -Math.PI * 0.92, -Math.PI * 0.08, n * 0.07, true);
  arcText(g, "R4N · LIVE", m, m, n * 0.355, Math.PI * 0.78, Math.PI * 0.22, n * 0.06, false);
  g.textAlign = "center"; g.textBaseline = "middle";
  g.font = `700 ${n * 0.1}px "Cinzel"`; g.fillText("UKM", m, m - n * 0.06);
  g.font = `600 ${n * 0.055}px "Cinzel"`; g.fillText("SPILT · PLAYED", m, m + n * 0.05);
  g.font = `700 ${n * 0.05}px "Cinzel"`; g.fillText("★ ★ ★", m, m + n * 0.15);
  return inked(c, "#2f3a8a", 1201);
}
function rectStamp(w, h, lines, color, seed) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  const g = c.getContext("2d");
  g.strokeStyle = g.fillStyle = "#000";
  g.lineWidth = h * 0.06; g.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
  g.lineWidth = h * 0.025; g.strokeRect(h * 0.16, h * 0.16, w - h * 0.32, h - h * 0.32);
  g.textAlign = "center"; g.textBaseline = "middle";
  lines.forEach(([text, size, dy]) => { g.font = `700 ${h * size}px "Cinzel"`; g.fillText(text, w / 2, h * dy); });
  return inked(c, color, seed);
}

// the title over the film, and the button under it
function titleArt() {
  const c = document.createElement("canvas");
  c.width = 1024; c.height = 220;
  const g = c.getContext("2d");
  g.font = '700 170px "Cinzel"';
  if ("letterSpacing" in g) g.letterSpacing = "10px";
  g.textAlign = "center"; g.textBaseline = "middle";
  g.shadowColor = "rgba(236,224,196,0.9)"; g.shadowBlur = 18;
  g.fillStyle = "#1b1714";
  g.fillText("R4N LIVE", 517, 116);
  return c;
}
function buttonArt(hover) {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 170;
  const g = c.getContext("2d");
  g.fillStyle = hover ? "#a3192a" : "#8a1320";
  g.beginPath(); g.roundRect(6, 6, 628, 158, 79); g.fill();
  g.strokeStyle = "rgba(240,223,178,0.55)"; g.lineWidth = 3;
  g.beginPath(); g.roundRect(6, 6, 628, 158, 79); g.stroke();
  g.font = '700 64px "Cinzel"';
  if ("letterSpacing" in g) g.letterSpacing = "8px";
  g.fillStyle = "#f0dfb2"; g.textAlign = "center"; g.textBaseline = "middle";
  g.fillText("BOOK NOW", 324, 90);
  return c;
}
// Until the real film arrives: a stop-motion stand-in, a few frames a second of a stage in the
// dark (a figure at a mic in a cone of light), film grain and a counter, flickering on.
function filmPlaceholder() {
  const c = document.createElement("canvas");
  c.width = 384; c.height = 512;
  const g = c.getContext("2d");
  let frame = 0;
  function draw() {
    frame++;
    const w = c.width, h = c.height, jit = (Math.random() - 0.5) * 6;
    g.fillStyle = "#0f0c0a"; g.fillRect(0, 0, w, h);
    const cone = g.createRadialGradient(w / 2 + jit, h * 0.1, 10, w / 2, h * 0.7, h * 0.75);
    cone.addColorStop(0, "rgba(255,214,150,0.55)"); cone.addColorStop(1, "rgba(255,180,100,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(w * 0.42, 0); g.lineTo(w * 0.58, 0); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.fill();
    // the figure: a head and shoulders, swaying a little from frame to frame
    const sway = Math.sin(frame * 0.9) * 8;
    g.fillStyle = "#050404";
    g.beginPath(); g.arc(w / 2 + sway, h * 0.5, w * 0.08, 0, 7); g.fill();
    g.beginPath(); g.ellipse(w / 2 + sway * 0.6, h * 0.78, w * 0.24, h * 0.2, 0, Math.PI, 0); g.fill();
    g.fillRect(w / 2 - w * 0.24 + sway * 0.6, h * 0.78, w * 0.48, h * 0.3);
    g.strokeStyle = "#050404"; g.lineWidth = 5;
    g.beginPath(); g.moveTo(w * 0.62, h * 0.53); g.lineTo(w * 0.7, h); g.stroke();
    g.beginPath(); g.ellipse(w * 0.6, h * 0.53, 9, 14, -0.5, 0, 7); g.fill();
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(255,240,220,${Math.random() * 0.12})`; g.fillRect(Math.random() * w, Math.random() * h, 2, 2); }
    g.fillStyle = "rgba(240,223,178,0.85)"; g.font = "600 15px ui-monospace, Menlo, monospace";
    g.fillText(`REC ● 00:0${frame % 10}`, 16, 28);
    g.font = "600 12px ui-monospace, Menlo, monospace";
    g.fillText("STOP-MOTION FRA KONSERTEN KOMMER", 16, 50);
  }
  draw();
  return { canvas: c, draw };
}
// The light streaming out between the pages: a sheet in the page plane, larger than the booklet.
// Brightness falls off with the distance from the outline of what's lit (the closed page block,
// or the whole open spread); rays fan out, drift and flicker; it fades to nothing well before the
// sheet's own edge. Closed, the spine side lets out less; open, the light comes from all round.
function lightSheet() {
  const SW = W * 6, SH = H * 4;
  const geo = new THREE.PlaneGeometry(SW, SH, 1, 1);
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: {
      time: { value: 0 }, flare: { value: 0 }, power: { value: 0 }, opened: { value: 0 },
      size: { value: new THREE.Vector2(PW, PH) }, sheet: { value: new THREE.Vector2(SW, SH) },
    },
    vertexShader: `varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `
      varying vec2 vP;
      uniform float time, flare, power, opened;
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
        float side = mix(smoothstep(-0.25, 0.3, p.x / size.x + 0.5), 1.0, opened);
        float near = exp(-d * 46.0);
        float far = exp(-d * (8.0 - 1.5 * flare)) * rays;
        float flick = 0.9 + 0.1 * noise(time * 6.0);
        vec2 e = 0.5 * sheet - abs(p);
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
  const n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n;
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

  const tex = await coverTextures();

  // ---- the booklet ----
  const passport = new THREE.Group(); // where it is and how it's turned
  const body = new THREE.Group();     // the shoves move this, inside that
  passport.add(body);
  scene.add(passport);

  const coverSurface = { clearcoat: 0.32, clearcoatRoughness: 0.4, sheen: 0.3, sheenRoughness: 0.55, sheenColor: new THREE.Color(0x8a2a32) };
  const frontMat = new THREE.MeshPhysicalMaterial({ map: tex.map, roughnessMap: tex.finish, metalnessMap: tex.finish, normalMap: tex.normal, roughness: 1, metalness: 1, ...coverSurface });
  const backMat = new THREE.MeshPhysicalMaterial({ map: tex.backMap, normalMap: tex.backNormal, roughness: 0.47, metalness: 0, ...coverSurface });
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
    spine = new THREE.Mesh(g, backMat);
    spine.material = backMat.clone();
    spine.material.side = THREE.DoubleSide;
    body.add(spine);
  }
  // the inside of the front cover: beige paper
  const insideGeo = new THREE.ShapeGeometry(panelShape(W, H, R), 10);
  {
    const uv = insideGeo.attributes.uv, pos = insideGeo.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, 1 - pos.getX(i) / W, pos.getY(i) / H + 0.5);
  }
  const insideMat = new THREE.MeshStandardMaterial({ map: paper(512, 724), roughness: 0.9, side: THREE.BackSide });
  const inside = new THREE.Mesh(insideGeo, insideMat);
  inside.position.z = -0.0009;
  hinge.add(inside);

  // the pages: a block a little inside the cover on the open sides, rounded into the spine
  const pagesTex = pageEdges();
  const pageGeo = new THREE.ExtrudeGeometry(panelShape(PW, PH, R * 0.85), { depth: PD, bevelEnabled: false, curveSegments: 10 });
  pageGeo.translate(-W / 2, 0, -PD / 2);
  {
    const uv = pageGeo.attributes.uv, pos = pageGeo.attributes.position;
    const [caps, sides] = pageGeo.groups;
    for (let i = caps.start; i < caps.start + caps.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / PW, pos.getY(i) / PH + 0.5);
    for (let i = sides.start; i < sides.start + sides.count; i++) uv.setXY(i, 0.5, pos.getZ(i) / PD + 0.5);
  }
  const topPageMat = new THREE.MeshStandardMaterial({ color: 0xe9ddc1, roughness: 0.9 });
  const pageEdgeMat = new THREE.MeshStandardMaterial({ map: pagesTex.map, emissive: 0xffffff, emissiveMap: pagesTex.emissive, emissiveIntensity: 0.8, roughness: 0.9 });
  const pagesMesh = new THREE.Mesh(pageGeo, [topPageMat, pageEdgeMat]);
  body.add(pagesMesh);
  const pageRound = new THREE.Mesh(new THREE.CylinderGeometry(PD / 2, PD / 2, PH, 16, 1, false, Math.PI, Math.PI), new THREE.MeshStandardMaterial({ color: 0xe6dcc4, roughness: 0.9 }));
  pageRound.position.x = -W / 2;
  body.add(pageRound);
  const sheet = lightSheet();
  body.add(sheet);

  // ---- open: the right-hand page, the leaves that riffle past, the memories ----
  const LIFT = T / 2 + 0.0006;   // just above the spine fold, so it never shows inside
  const STEP = 0.00035;          // each leaf's thickness, as far as the eye can tell
  const pageShape = panelShape(PW, PH, R * 0.85);
  const flatPage = new THREE.ShapeGeometry(pageShape, 10);
  {
    const uv = flatPage.attributes.uv, pos = flatPage.attributes.position;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, pos.getX(i) / PW, pos.getY(i) / PH + 0.5);
  }
  const rightPage = new THREE.Mesh(flatPage, new THREE.MeshStandardMaterial({ map: paper(1024, 1446), roughness: 0.92 }));
  rightPage.position.set(-W / 2, 0, LIFT);
  rightPage.visible = false;
  body.add(rightPage);

  const leafPapers = [paper(512, 724), paper(512, 724), paper(512, 724)];
  const lastLeafPaper = paper(1024, 1446);
  const leaves = [];
  for (let i = 0; i < LEAVES; i++) {
    const geo = new THREE.PlaneGeometry(PW, PH, LEAF_SEG, 1);
    geo.translate(PW / 2, 0, 0);
    const map = i === LEAVES - 1 ? lastLeafPaper : leafPapers[i % 3];
    const frontLeaf = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: leafPapers[(i + 1) % 3], roughness: 0.92, emissive: 0xffb060, emissiveIntensity: 0 }));
    // the back of a leaf reads the right way round once it has turned over
    const backGeo = geo.clone();
    { const uv = backGeo.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, 1 - uv.getX(k)); }
    const backLeaf = new THREE.Mesh(backGeo, new THREE.MeshStandardMaterial({ map, roughness: 0.92, side: THREE.BackSide, emissive: 0xffb060, emissiveIntensity: 0 }));
    const pivot = new THREE.Group();
    pivot.position.set(-W / 2, 0, LIFT);
    pivot.add(frontLeaf, backLeaf);
    pivot.visible = false;
    body.add(pivot);
    leaves.push({ pivot, geo, backGeo, frontLeaf, backLeaf, turn: -1 });
  }
  const gutter = gutterGlow();
  gutter.position.set(-W / 2, 0, LIFT + LEAVES * STEP + 0.0015);
  gutter.visible = false;
  body.add(gutter);

  // memories of a trip: placed in screen terms around the spine (x right, y up), then mapped onto
  // the spread for whichever way it opened
  const film = filmPlaceholder();
  const filmTex = canvasTex(film.canvas);
  const btnTex = [canvasTex(buttonArt(false)), canvasTex(buttonArt(true))];
  const plane = (w, h, map, opts = {}) => new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map, transparent: true, roughness: opts.rough ?? 0.85, depthWrite: false, opacity: 0, ...opts.mat }));
  const shadowTex = (() => {
    const c = document.createElement("canvas"); c.width = c.height = 128;
    const g = c.getContext("2d"); g.filter = "blur(10px)"; g.fillStyle = "rgba(40,25,10,0.55)"; g.fillRect(22, 22, 84, 84);
    return canvasTex(c);
  })();
  const memories = [];
  const memoryGroup = new THREE.Group();
  body.add(memoryGroup);
  function memory(mesh, kind, layoutH, layoutV, shadow = false) {
    const holder = new THREE.Group();
    if (shadow) {
      const s = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, opacity: 0 }));
      const p = mesh.geometry.parameters;
      s.scale.set(p.width * 1.25, p.height * 1.25, 1);
      s.position.set(0.006, -0.01, -0.0004);
      holder.add(s);
      holder.userData.shadow = s;
    }
    holder.add(mesh);
    memoryGroup.add(holder);
    memories.push({ holder, mesh, kind, layoutH, layoutV });
    return mesh;
  }
  const stampW = 0.2, stampH = 0.25;
  const stampTex = STAMPS.map((f) => canvasTex(f(400, 500)));
  // [x, y, tilt] on a wide spread (left page x < 0) and on a tall one (top page y > 0)
  memory(plane(stampW, stampH, stampTex[0]), "stamp", [-0.66, 0.38, -0.1], [-0.42, 0.62, -0.08], true);
  memory(plane(0.42, 0.42, canvasTex(ukmStamp(800)), { rough: 0.95 }), "ink", [-0.44, -0.2, -0.22], [0.0, 0.42, -0.2]);
  memory(plane(0.34, 0.17, canvasTex(rectStamp(680, 340, [["ANKOMST", 0.24, 0.42], ["ARRIVAL · SCENE 51", 0.11, 0.7]], "#9a1b2c", 3301)), { rough: 0.95 }), "ink", [-0.22, 0.13, 0.16], [0.4, 0.2, 0.12]);
  memory(plane(stampW, stampH, stampTex[2]), "stamp", [-0.18, 0.44, 0.07], [0.42, 0.66, 0.1], true);
  const filmMesh = memory(plane(0.42, 0.56, filmTex, { rough: 0.6 }), "film", [0.43, 0.12, 0], [-0.3, -0.42, 0], true);
  { // a photo print: the film sits on a cream border
    const border = new THREE.Mesh(new THREE.PlaneGeometry(0.46, 0.6), new THREE.MeshStandardMaterial({ color: 0xf4eedf, roughness: 0.6, transparent: true, opacity: 0, depthWrite: false }));
    border.position.z = -0.0002;
    filmMesh.parent.add(border);
    filmMesh.parent.userData.border = border;
  }
  memory(plane(0.62, 0.133, canvasTex(titleArt())), "title", [0.43, -0.12, 0], [0.26, -0.3, 0]);
  const button = memory(plane(0.36, 0.096, btnTex[0], { rough: 0.5 }), "button", [0.43, -0.33, 0], [0.26, -0.56, 0], true);
  memory(plane(stampW, stampH, stampTex[1]), "stamp", [0.75, 0.44, 0.14], [0.02, -0.7, 0.1], true);
  memory(plane(stampW, stampH, stampTex[3]), "stamp", [0.76, -0.42, -0.1], [0.5, -0.76, -0.08], true);
  memory(plane(0.3, 0.15, canvasTex(rectStamp(600, 300, [["UTREISE", 0.24, 0.42], ["DEPARTED · R4N", 0.11, 0.7]], "#2f3a8a", 4409)), { rough: 0.95 }), "ink", [0.18, -0.46, -0.12], [-0.4, 0.2, 0.16]);

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
  // opening is a timeline: the cover swings over, the leaves riffle past, the memories land
  const COVER_END = 0.85, LEAF_START = 0.45, LEAF_GAP = 0.07, LEAF_DUR = 0.4;
  const LAND = LEAF_START + LEAVES * LEAF_GAP + LEAF_DUR - 0.12, LAND_GAP = 0.09;
  const OPEN_END = LAND + memories.length * LAND_GAP + 0.3;
  let openT = 0, opening = false, vertical = false, overButton = false;
  // made ahead of time, it waits without drawing until it's shown
  let paused = true, raf = 0, last = performance.now(), time = 0, filmClock = 0;
  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2(9, 9);
  const hitTargets = [front, back, pagesMesh, inside, rightPage, ...leaves.flatMap((l) => [l.frontLeaf, l.backLeaf]), ...memories.map((m) => m.mesh)];

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
  function layoutMemories() {
    memories.forEach((m, i) => {
      const [sx, sy2, tilt] = vertical ? m.layoutV : m.layoutH;
      const x = vertical ? -W / 2 - sy2 : -W / 2 + sx, y = vertical ? sx : sy2;
      m.holder.position.set(x, y, LIFT + LEAVES * STEP + 0.003 + i * 0.0006);
      m.holder.rotation.z = tilt + (vertical ? Math.PI / 2 : 0);
    });
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
    openT = clamp(openT + (opening ? dt : -dt * 1.8) * (reducedMotion ? 6 : 1), 0, OPEN_END);
    const k = ease(clamp(openT / 1.2, 0, 1));          // pose and camera
    const coverK = ease(clamp(openT / COVER_END, 0, 1));

    // shoves: only while closed and in view
    if (!reducedMotion && !opening && openT === 0 && appear > 0.9) {
      nextEvent -= dt;
      if (nextEvent <= 0) { scheduleEvent(); nextEvent = 3 + Math.random() * 2; }
    }
    for (let i = pending.length - 1; i >= 0; i--) if (time >= pending[i].at) { shove(pending[i].m); pending.splice(i, 1); }
    const rest = openT > 0 ? 0 : 0.004 * (0.5 + 0.5 * Math.sin(time * 0.9));
    for (const s of [sy, srx, sry, srz]) stepSpring(s, 0, dt);
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
    flare += (clamp(lift * 14 + Math.abs(sy.v) * 1.2 + riffle * 0.22, 0, 1.4) - flare) * (1 - Math.exp(-dt * 10));

    // the memories land one by one, each pressed down onto the paper
    memories.forEach((m, i) => {
      const a = clamp((openT - LAND - i * LAND_GAP) / 0.22, 0, 1);
      m.holder.visible = a > 0;
      if (!m.holder.visible) return;
      const press = 1 - ease(a);
      m.holder.scale.setScalar(1 + press * (m.kind === "ink" ? 0.18 : 0.3));
      m.mesh.material.opacity = clamp(a * 2.5, 0, 1) * (m.kind === "ink" ? 0.88 : 1);
      if (m.holder.userData.shadow) m.holder.userData.shadow.material.opacity = clamp(a * 2.5, 0, 1) * (1 - press * 0.6);
      if (m.holder.userData.border) m.holder.userData.border.material.opacity = clamp(a * 2.5, 0, 1);
    });
    if (memories[4].holder.visible) { // the film: a few frames a second, like stop-motion
      filmClock += dt;
      if (filmClock > 0.125 && !filmTex.isVideoTexture) { filmClock = 0; film.draw(); filmTex.needsUpdate = true; }
    }

    // pose: tilted and floating when closed; flat, facing you, turned for the screen when open
    const float = Math.sin(time * 1.1) * 0.01 * (1 - k);
    passport.position.set(0, float, (1 - appear) * -6);
    passport.rotation.set(
      mix(POSE.x + Math.sin(time * 0.7) * 0.02 + pointer.y * 0.05 * hover, -0.02, k),
      mix(POSE.y + Math.sin(time * 0.55) * 0.03 + pointer.x * 0.07 * hover, 0, k),
      mix(POSE.z + Math.sin(time * 0.45) * 0.01, vertical ? -Math.PI / 2 : 0, k)
    );
    body.position.set(W / 2 * k, sy.x, 0);
    body.rotation.set(srx.x * 0.05, sry.x * 0.05, srz.x * 0.05);
    hinge.rotation.y = -(lift * 0.9 + coverK * Math.PI);
    spine.visible = coverK < 0.6; // open, the fold must never show between the pages

    // the camera: the closed booklet takes a good part of the screen; open, it fills it
    const closedD = distanceFor(W * 1.1, H * 1.05, 0.62, 0.56);
    const openD = vertical ? distanceFor(H * 1.02, 2 * W * 1.02, 0.97, 0.86) : distanceFor(2 * PW * 1.03 + OV, H * 1.02, 0.96, 0.9);
    camera.position.set(0, 0, mix(closedD, openD, k));
    camera.lookAt(0, 0, 0);

    // the light: from the closed block's edges, or from round the whole open spread and its fold
    const glow = appear * (0.85 + 0.15 * hover);
    const u = sheet.material.uniforms;
    u.time.value = time; u.flare.value = flare + hover * 0.2; u.power.value = glow; u.opened.value = coverK;
    u.size.value.set(mix(PW, 2 * PW + 0.004, coverK), PH);
    sheet.position.x = mix(-W / 2 + PW / 2, -W / 2, coverK);
    gutter.visible = coverK > 0.5;
    gutter.material.uniforms.time.value = time;
    gutter.material.uniforms.power.value = glow * clamp((coverK - 0.5) * 2, 0, 1) * (0.7 + flare * 0.6);
    pageEdgeMat.emissiveIntensity = (0.75 + flare * 1.2 + hover * 0.25) * glow;
    for (const l of glowLights) l.intensity = (0.05 + flare * 0.35) * glow * (1 - coverK);
    key.intensity = 1.15 + k * 0.55;
    bloom.strength = 0.42 + flare * 0.3;
    canvas.style.opacity = String(clamp(appear * 1.6, 0, 1));
    composer.render();
  }

  // ---- pointer: hover warms it; a click opens it; open, BOOK NOW books, a click outside closes ----
  function hitAt(e) {
    pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    raycaster.setFromCamera(pointer, camera);
    return raycaster.intersectObjects(hitTargets, false).filter((h) => h.object.visible !== false && h.object.parent?.visible !== false)[0]?.object || null;
  }
  const onMove = (e) => {
    if (e.pointerType === "touch") return;
    const hit = hitAt(e);
    const nowOverButton = opening && hit === button;
    if (nowOverButton !== overButton) { overButton = nowOverButton; button.material.map = btnTex[overButton ? 1 : 0]; }
    hoverGoal = hit && !opening ? 1 : 0;
    canvas.style.cursor = overButton || (hit && !opening) ? "pointer" : opening && !hit ? "zoom-out" : "";
  };
  const onLeave = () => { hoverGoal = 0; canvas.style.cursor = ""; };
  const onClick = (e) => {
    const hit = hitAt(e);
    if (!opening) { if (hit) api.open(); return; }
    if (hit === button && openT >= LAND) { window.location.href = BOOK_URL; return; }
    if (!hit) api.close();
  };
  const onKey = (e) => { if (e.key === "Escape" && opening) api.close(); };
  canvas.addEventListener("pointermove", onMove);
  canvas.addEventListener("pointerleave", onLeave);
  canvas.addEventListener("click", onClick);
  window.addEventListener("keydown", onKey);

  // prepare every shader now (the open parts too), so nothing stalls the first time it's seen
  for (const l of leaves) l.pivot.visible = true;
  rightPage.visible = gutter.visible = true;
  for (const m of memories) m.holder.visible = true;
  renderer.compile(scene, camera);
  for (const l of leaves) l.pivot.visible = false;
  rightPage.visible = gutter.visible = false;
  for (const m of memories) m.holder.visible = false;
  layoutMemories();
  raf = requestAnimationFrame(tick);

  const api = {
    canvas,
    get isOpen() { return opening; },
    show(animate = true) { appearGoal = 1; if (!animate) appear = 1; nextEvent = 1.6; paused = false; last = performance.now(); },
    hide(animate = true) {
      appearGoal = 0; opening = false;
      if (!animate || reducedMotion) { appear = 0; openT = 0; return Promise.resolve(); }
      return new Promise((r) => setTimeout(r, 650));
    },
    open() {
      if (opening) return;
      if (openT === 0) { vertical = window.innerHeight > window.innerWidth * 1.05; layoutMemories(); }
      opening = true; hoverGoal = 0; pending = [];
    },
    close() { opening = false; },
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
      window.removeEventListener("resize", resize);
      window.removeEventListener("keydown", onKey);
      renderer.dispose();
      canvas.remove();
    },
  };
  return api;
}
