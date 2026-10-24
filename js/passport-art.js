// The passport's artwork, all drawn in code on canvases: the cover (gold foil crest, R4N, BOOKING,
// the chip symbol), the page edges, and the pages inside: security paper, stamps from the trip,
// the spread of memories and the booking form. js/booking.js builds the 3D booklet out of these.
//
// Pages are drawn the way the reader sees them. On a wide screen the open passport lies like a
// book; on a tall one it's turned a quarter (the spine across the middle), so each page's drawing
// is turned to match and always reads upright. Everything placed on the open spread is given in
// spread units (the booklet's own size, x right, y up, the spine at 0), and drawn onto both pages,
// each showing its own half, so anything lying across the fold carries on across it.

export const breathe = () => new Promise((r) => setTimeout(r, 0));
export function rng(seed) {
  let s = Math.abs(Math.floor(seed)) % 2147483646 + 1;
  return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function makeCanvas(w, h) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}
const SANS = '"Helvetica Neue", Helvetica, Arial, sans-serif';
const MONO = '"OCR B", "OCR-B", ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace';
const RED = [134, 18, 30];
const GOLD = [226, 199, 132];
export const PAPER = "#ece0c4";

function spaced(g, px) { if ("letterSpacing" in g) g.letterSpacing = `${px}px`; }

// Smooth value noise, sampled at every pixel: a grid of random values `cell` pixels apart,
// blended smoothly between. Heights 0..1.
function valueNoise(w, h, cell, rnd) {
  const gw = Math.ceil(w / cell) + 2, gh = Math.ceil(h / cell) + 2;
  const v = new Float32Array(gw * gh);
  for (let i = 0; i < v.length; i++) v[i] = rnd();
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const fy = y / cell, iy = fy | 0; let ty = fy - iy; ty = ty * ty * (3 - 2 * ty);
    for (let x = 0; x < w; x++) {
      const fx = x / cell, ix = fx | 0; let tx = fx - ix; tx = tx * tx * (3 - 2 * tx);
      const r0 = iy * gw + ix, r1 = r0 + gw;
      out[y * w + x] = (v[r0] * (1 - tx) + v[r0 + 1] * tx) * (1 - ty) + (v[r1] * (1 - tx) + v[r1 + 1] * tx) * ty;
    }
  }
  return out;
}

// A very fine grain over the whole cover (no tile, no grid): three octaves of smooth value noise,
// the finest about a pixel and a half across. Heights 0..1.
async function grainField(w, h, seed) {
  const rnd = rng(seed);
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

// 51 as a solid gold figure (bolder than the lettering), with a fine line engraved just inside its
// outline, the way the lion's details are cut. Drawn on its own canvas, 1024 x 1024.
function fiftyOne() {
  const c = makeCanvas(1024, 1024);
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
  const b = makeCanvas(1024, 1024);
  const bt = b.getContext("2d");
  bt.filter = "blur(9px)";
  bt.drawImage(c, 0, 0);
  const A = t.getImageData(0, 0, 1024, 1024), B = bt.getImageData(0, 0, 1024, 1024).data;
  for (let i = 3; i < A.data.length; i += 4) if (A.data[i] > 250 && B[i] > 196 && B[i] < 228) A.data[i] = 0;
  t.putImageData(A, 0, 0);
  return c;
}

// the shield: a double outline, STUDIO across its top, 51 filling the rest (51 exactly as it was)
function drawShield(g, cx, top, w, h) {
  g.save();
  g.strokeStyle = "#fff"; g.fillStyle = "#fff"; g.lineJoin = "round";
  shieldPath(g, cx, top, w, h); g.lineWidth = w * 0.035; g.stroke();
  const iw = w * 0.86, ih = h * 0.92, itop = top + h * 0.04;
  shieldPath(g, cx, itop, iw, ih); g.lineWidth = w * 0.012; g.stroke();
  // STUDIO: heavy, filled and outlined, as wide as its band allows, with a hairline under it
  let size = w * 0.15;
  const spacing = w * 0.012;
  g.font = `700 ${size}px "Cinzel"`; spaced(g, spacing);
  const tw = g.measureText("STUDIO").width, maxW = iw * 0.8;
  if (tw > maxW) { size *= maxW / tw; g.font = `700 ${size}px "Cinzel"`; spaced(g, spacing * maxW / tw); }
  g.textAlign = "center"; g.lineWidth = size * 0.085;
  const sx = cx + spacing / 2, sy = itop + ih * 0.162;
  g.fillText("STUDIO", sx, sy); g.strokeText("STUDIO", sx, sy);
  spaced(g, 0);
  g.lineWidth = w * 0.01;
  g.beginPath(); g.moveTo(cx - iw * 0.36, itop + ih * 0.205); g.lineTo(cx + iw * 0.36, itop + ih * 0.205); g.stroke();
  g.save();
  shieldPath(g, cx, itop + ih * 0.035, iw * 0.95, ih * 0.93);
  g.clip();
  const bw = iw * 0.94, bh = h * 0.635;
  g.drawImage(fiftyOne(), cx - bw / 2, itop + ih * 0.225, bw, bh);
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
  spaced(g, spacing);
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
const toCanvas = (img) => { const c = makeCanvas(img.width, img.height); c.getContext("2d").putImageData(img, 0, 0); return c; };

// The covers: colour, finish (green: roughness, blue: metalness) and relief for the front (with
// its foil) and the back (grain only), in one pass over the pixels, a few rows at a time.
export async function coverArt(aspect) {
  const CW = 1024, CH = Math.round(1024 * aspect);
  const foil = makeCanvas(CW, CH);
  const g = foil.getContext("2d");
  const cx = CW / 2;
  drawCrown(g, cx, CH * 0.1, CW * 0.31, CH * 0.13);
  drawShield(g, cx, CH * 0.24, CW * 0.29, CH * 0.285);
  letters(g, "R4N", cx, CH * 0.645, CW * 0.165, CW * 0.022);
  letters(g, "BOOKING", cx, CH * 0.765, CW * 0.098, CW * 0.02);
  drawChip(g, cx, CH * 0.905, CW * 0.11);
  await breathe();
  const foilPx = g.getImageData(0, 0, CW, CH).data;
  const soft = makeCanvas(CW, CH);
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
    map: toCanvas(color), finish: toCanvas(finish), normal: toCanvas(normal),
    backMap: toCanvas(bColor), backNormal: toCanvas(bNormal),
  };
}

// page edges: warm paper, many sheets; light shows in the gaps between them
export function pageEdges() {
  const c = makeCanvas(8, 512), e = makeCanvas(8, 512);
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
  return { map: c, emissive: e };
}

// ---------- paper ----------
// A page's canvas, with its pen set to draw upright as the reader sees it (on a tall screen the
// passport lies turned a quarter, so the drawing is turned to match), and where its fold is.
// side "R": the page right of the fold (or below it, turned); "L": left of it (or above), which
// is always the back of a leaf, so its texture runs the other way.
function newPage(tw, th, { vertical, side, seed }) {
  const c = makeCanvas(tw, th), g = c.getContext("2d");
  const r = rng(seed);
  paperBase(g, tw, th, r);
  if (vertical) g.setTransform(0, -1, 1, 0, 0, th);
  const LW = vertical ? th : tw, LH = vertical ? tw : th;
  const spine = vertical ? (side === "R" ? "top" : "bottom") : (side === "R" ? "left" : "right");
  // a shadow's offset isn't turned with the drawing: turn it by hand
  const shadowOffset = (dx, dy) => (vertical ? [dy, -dx] : [dx, dy]);
  return { c, g, r, tw, th, LW, LH, side, vertical, spine, shadowOffset };
}

// warm beige book paper: an even tone, soft mottling, fine fibres, a few specks
function paperBase(g, tw, th, rnd) {
  const area = (tw * th) / (512 * 724);
  g.fillStyle = PAPER;
  g.fillRect(0, 0, tw, th);
  for (let i = 0; i < 30; i++) {
    const x = rnd() * tw, y = rnd() * th, r = (0.1 + rnd() * 0.3) * tw;
    const grd = g.createRadialGradient(x, y, 0, x, y, r);
    grd.addColorStop(0, rnd() > 0.5 ? "rgba(190,160,110,0.07)" : "rgba(255,248,232,0.08)");
    grd.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = grd; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  g.lineCap = "round";
  const k = Math.sqrt(area);
  for (let i = 0; i < 900 * area; i++) {
    const x = rnd() * tw, y = rnd() * th, a = rnd() * Math.PI, l = (2 + rnd() * 6) * k;
    g.strokeStyle = rnd() > 0.5 ? `rgba(150,120,80,${0.03 + rnd() * 0.04})` : `rgba(255,252,240,${0.06 + rnd() * 0.06})`;
    g.lineWidth = (0.5 + rnd() * 0.5) * k;
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
  }
  for (let i = 0; i < 2600 * area; i++) {
    g.fillStyle = `rgba(120,95,60,${rnd() * 0.12})`;
    g.fillRect(rnd() * tw, rnd() * th, (1 + rnd()) * k, (1 + rnd()) * k);
  }
}

// The fine print of a passport page: two families of wavy lines in pale ink crossing the page, a
// Norwegian landscape in hairlines (mountains over a fjord), microtext along the top,
// a page number in the outer corner; then the shade of the fold and the edges.
function securityPrint(p, { num, header, landscape = true, seed = 1 }) {
  const { g, LW, LH } = p;
  const r = rng(seed * 31 + 7);
  const u = Math.min(LW, LH) / 1000;
  g.save();
  g.lineCap = "round";
  g.lineWidth = Math.max(0.7, 1.15 * u);
  const families = [["70,112,124", 0.15, 0.05, 3.1], ["176,96,92", 0.12, -0.035, 4.3]];
  for (const [col, a, slope, freq] of families) {
    const n = 30, ph = r() * 6;
    g.strokeStyle = `rgba(${col},${a})`;
    for (let k = 0; k < n; k++) {
      const y0 = (k / (n - 1)) * LH * 1.15 - LH * 0.075;
      g.beginPath();
      for (let x = 0; x <= LW + 4 * u; x += 5 * u) {
        const t = x / LW;
        const y = y0 + slope * (x - LW / 2) + Math.sin(t * Math.PI * freq + k * 0.45 + ph) * LH * 0.013 + Math.sin(t * Math.PI * freq * 2.7 - k * 0.3) * LH * 0.005;
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
  }
  if (landscape) {
    // a ridge of mountains from a few sines, drawn as stacked hairlines that fade downwards
    const amp = [r() * 6, r() * 6, r() * 6];
    const ridge = (x) => {
      const t = x / LW;
      return LH * (0.7 - 0.09 * Math.abs(Math.sin(t * 3.1 + amp[0])) - 0.05 * Math.sin(t * 7.3 + amp[1]) - 0.025 * Math.sin(t * 17 + amp[2]));
    };
    for (let j = 0; j < 9; j++) {
      g.strokeStyle = `rgba(66,98,118,${0.2 - j * 0.018})`;
      g.beginPath();
      for (let x = 0; x <= LW; x += 6 * u) {
        const y = ridge(x) + j * LH * 0.011 * (1 + j * 0.15);
        if (x === 0) g.moveTo(x, y); else g.lineTo(x, y);
      }
      g.stroke();
    }
    // the fjord: broken level lines, like light on water
    g.strokeStyle = "rgba(66,98,118,0.14)";
    for (let k = 0; k < 9; k++) {
      const y = LH * (0.83 + k * 0.014);
      let x = r() * 40 * u;
      while (x < LW) {
        const l = (20 + r() * 120) * u;
        g.beginPath(); g.moveTo(x, y); g.lineTo(Math.min(LW, x + l), y); g.stroke();
        x += l + (8 + r() * 40) * u;
      }
    }
  }
  // microtext: a line of tiny words along the top margin
  g.fillStyle = "rgba(110,78,56,0.4)";
  g.font = `600 ${Math.max(5, 8.5 * u)}px ${SANS}`;
  g.textBaseline = "middle";
  const micro = "R4N · STUDIO 51 · BOOKING · NORGE · NOREG · ";
  const mw = g.measureText(micro).width;
  for (let x = LW * 0.06; x < LW * 0.94 - mw * 0.2; x += mw) g.fillText(micro, x, LH * 0.035);
  if (header) {
    g.fillStyle = "rgba(84,60,44,0.62)";
    g.font = `600 ${26 * u}px "Cinzel"`;
    g.textAlign = "center";
    spaced(g, 6 * u);
    g.fillText(header, LW / 2, LH * 0.085);
    spaced(g, 0);
    const hw = g.measureText(header).width / 2 + 40 * u;
    g.strokeStyle = "rgba(84,60,44,0.35)"; g.lineWidth = 1.4 * u;
    g.beginPath(); g.moveTo(LW * 0.1, LH * 0.085); g.lineTo(LW / 2 - hw, LH * 0.085); g.moveTo(LW / 2 + hw, LH * 0.085); g.lineTo(LW * 0.9, LH * 0.085); g.stroke();
  }
  if (num != null) {
    g.fillStyle = "rgba(84,60,44,0.6)";
    g.font = `600 ${30 * u}px "Cinzel"`;
    g.textBaseline = "alphabetic";
    // the outer corner: away from the fold
    const right = p.spine !== "right";
    const bottom = p.spine !== "bottom";
    g.textAlign = right ? "right" : "left";
    g.fillText(String(num), right ? LW * 0.93 : LW * 0.07, bottom ? LH * 0.965 : LH * 0.06);
  }
  g.restore();
}

// the shade where the page curves down into the fold, and the edges a shade darker
function pageShade(p) {
  const { g, LW, LH, spine } = p;
  g.save();
  const d = Math.min(LW, LH) * 0.09;
  const [x0, y0, x1, y1] = {
    left: [0, 0, d, 0], right: [LW, 0, LW - d, 0], top: [0, 0, 0, d], bottom: [0, LH, 0, LH - d],
  }[spine];
  const grd = g.createLinearGradient(x0, y0, x1, y1);
  grd.addColorStop(0, "rgba(96,64,32,0.26)");
  grd.addColorStop(0.35, "rgba(96,64,32,0.08)");
  grd.addColorStop(1, "rgba(96,64,32,0)");
  g.fillStyle = grd; g.fillRect(0, 0, LW, LH);
  const v = g.createRadialGradient(LW / 2, LH / 2, Math.min(LW, LH) * 0.4, LW / 2, LH / 2, Math.max(LW, LH) * 0.78);
  v.addColorStop(0, "rgba(0,0,0,0)");
  v.addColorStop(1, "rgba(150,115,60,0.16)");
  g.fillStyle = v; g.fillRect(0, 0, LW, LH);
  g.restore();
}

// the page's outer corners are rounded (cut in the texture: the leaves are plain rectangles)
function roundOuter(p, radiusFrac) {
  const { c, tw, th, side } = p;
  const g = c.getContext("2d");
  g.save();
  g.setTransform(1, 0, 0, 1, 0, 0);
  const r = radiusFrac * tw;
  // in the texture, the outer edge is u = 1 on a right-hand page and u = 0 on the back of a leaf
  const outerRight = side === "R";
  g.globalCompositeOperation = "destination-in";
  g.fillStyle = "#000";
  g.beginPath();
  if (outerRight) {
    g.moveTo(0, 0); g.lineTo(tw - r, 0); g.quadraticCurveTo(tw, 0, tw, r);
    g.lineTo(tw, th - r); g.quadraticCurveTo(tw, th, tw - r, th); g.lineTo(0, th);
  } else {
    g.moveTo(tw, 0); g.lineTo(r, 0); g.quadraticCurveTo(0, 0, 0, r);
    g.lineTo(0, th - r); g.quadraticCurveTo(0, th, r, th); g.lineTo(tw, th);
  }
  g.closePath(); g.fill();
  g.restore();
}

// where a page sits on the open spread, in spread units
function regionOf(dims, vertical, side) {
  const { PW, PH } = dims;
  if (!vertical) return side === "L" ? { x0: -PW, x1: 0, y0: -PH / 2, y1: PH / 2 } : { x0: 0, x1: PW, y0: -PH / 2, y1: PH / 2 };
  return side === "L" ? { x0: -PH / 2, x1: PH / 2, y0: 0, y1: PW } : { x0: -PH / 2, x1: PH / 2, y0: -PW, y1: 0 };
}

// Lay something on a page at spread position (x, y), w wide, turned by rot (anticlockwise).
// glue: a cut-out stuck on, with a soft shadow; ink: pressed into the paper (multiplied)
function place(p, reg, it) {
  const { g, LW, LH } = p;
  const k = LW / (reg.x1 - reg.x0);
  const reach = Math.hypot(it.w, it.h) / 2;
  if (it.x + reach < reg.x0 || it.x - reach > reg.x1 || it.y + reach < reg.y0 || it.y - reach > reg.y1) return;
  const lx = (it.x - reg.x0) * k, ly = (reg.y1 - it.y) * k, w = it.w * k, h = it.h * k;
  g.save();
  g.translate(lx, ly);
  g.rotate(-(it.rot || 0));
  if (it.ink) {
    g.globalCompositeOperation = "multiply";
    g.globalAlpha = it.alpha ?? 0.9;
    g.drawImage(it.canvas, -w / 2, -h / 2, w, h);
    if (it.ghost) { // a faint second strike, a hair off
      g.globalAlpha = 0.14;
      g.drawImage(it.canvas, -w / 2 + w * 0.012, -h / 2 + h * 0.018, w, h);
    }
  } else {
    const [ox, oy] = p.shadowOffset(w * 0.012, h * 0.02);
    g.shadowColor = "rgba(48,30,12,0.36)";
    g.shadowBlur = Math.max(2, w * 0.035);
    g.shadowOffsetX = ox; g.shadowOffsetY = oy;
    g.drawImage(it.canvas, -w / 2, -h / 2, w, h);
  }
  g.restore();
}

// ---------- stamps ----------
const INK = { blue: "#24378a", red: "#a12230", violet: "#4a3a86", black: "#2a2522", green: "#2c684b" };

// Ink from a rubber stamp. `shape` is white on transparent; this colours it and presses it the
// way a real one lands: heavier on one side, patchy where the rubber met the paper's grain less,
// the edges softened a little by the ink spreading into the fibres.
function ink(shape, color, seed, pressure = 1) {
  const w = shape.width, h = shape.height, r = rng(seed);
  const c = makeCanvas(w, h), g = c.getContext("2d");
  g.filter = `blur(${Math.max(0.7, w * 0.0016).toFixed(2)}px)`;
  g.drawImage(shape, 0, 0);
  g.filter = "none";
  g.drawImage(shape, 0, 0);
  const img = g.getImageData(0, 0, w, h), d = img.data;
  const ang = r() * Math.PI * 2, ax = Math.cos(ang), ay = Math.sin(ang);
  const low = valueNoise(w, h, w / 2.6, r), mid = valueNoise(w, h, w / 16, r), fine = valueNoise(w, h, 2.4, r);
  for (let i = 0, n = w * h; i < n; i++) {
    const p = i * 4;
    let a = d[p + 3] / 255;
    if (a === 0) continue;
    const x = i % w, y = (i / w) | 0;
    const tilt = ((x / w - 0.5) * ax + (y / h - 0.5) * ay) * 0.9 * pressure;
    const press = clamp(0.74 + tilt + 0.42 * (low[i] - 0.5) + 0.22 * (mid[i] - 0.5), 0.04, 1);
    if (fine[i] > press + 0.18) a *= 0.1;          // rubber that didn't touch: bare paper
    a *= 0.32 + 0.68 * press;
    d[p] = d[p + 1] = d[p + 2] = 255;
    d[p + 3] = a * 255;
  }
  g.putImageData(img, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color; g.fillRect(0, 0, w, h);
  return c;
}

function label(g, text, x, y, size, { color = "#fff", align = "left", font = SANS, weight = 800, spacing = 0, base = "alphabetic" } = {}) {
  g.save();
  g.font = `${weight} ${size}px ${font}`;
  spaced(g, spacing);
  g.fillStyle = color; g.textAlign = align; g.textBaseline = base;
  g.fillText(text, x + (align === "center" ? spacing / 2 : 0), y);
  g.restore();
}

// A postage stamp: the picture printed with a white margin round it, on paper with a perforated
// edge; printed, not drawn: a fine screen of lines and a slight grain lie over the picture.
function postage(w, h, bg, art) {
  const c = makeCanvas(w, h), g = c.getContext("2d");
  const r = w * 0.024, nx = Math.round(w / (r * 2.6)), ny = Math.round(h / (r * 2.6));
  g.fillStyle = "#f8f4ea"; g.fillRect(0, 0, w, h);
  g.globalCompositeOperation = "destination-out";
  const hole = (x, y) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); };
  for (let i = 0; i <= nx; i++) { hole((i / nx) * w, 0); hole((i / nx) * w, h); }
  for (let j = 0; j <= ny; j++) { hole(0, (j / ny) * h); hole(w, (j / ny) * h); }
  g.globalCompositeOperation = "source-over";
  const m = w * 0.08, x = m, y = m, iw = w - 2 * m, ih = h - 2 * m;
  g.save();
  g.beginPath(); g.rect(x, y, iw, ih); g.clip();
  g.fillStyle = bg; g.fillRect(x, y, iw, ih);
  art(g, x, y, iw, ih);
  g.fillStyle = "rgba(0,0,0,0.055)";
  for (let yy = y; yy < y + ih; yy += 3) g.fillRect(x, yy, iw, 1);
  const rr = rng(w * 13 + h);
  for (let i = 0; i < (iw * ih) / 70; i++) { g.fillStyle = `rgba(255,255,255,${rr() * 0.09})`; g.fillRect(x + rr() * iw, y + rr() * ih, 1.4, 1.4); }
  g.restore();
  // the paper itself: a touch of shade at the edge of the print, very faint fibres
  g.strokeStyle = "rgba(0,0,0,0.12)"; g.lineWidth = 1;
  g.strokeRect(x + 0.5, y + 0.5, iw - 1, ih - 1);
  return c;
}

const POSTAGE = {
  // a record, on mustard: "A" (the domestic rate)
  record: () => postage(400, 500, "#d6a23c", (g, x, y, w, h) => {
    const cx = x + w * 0.56, cy = y + h * 0.5, R = w * 0.38;
    g.fillStyle = "#1d1918"; g.beginPath(); g.arc(cx, cy, R, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "rgba(255,255,255,0.09)"; g.lineWidth = 1.5;
    for (let k = 0.36; k < 0.98; k += 0.045) { g.beginPath(); g.arc(cx, cy, R * k, 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = "rgba(255,240,210,0.22)"; g.lineWidth = R * 0.08;
    g.beginPath(); g.arc(cx, cy, R * 0.72, -2.4, -1.7); g.stroke();
    g.fillStyle = "#a01d2d"; g.beginPath(); g.arc(cx, cy, R * 0.32, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#d6a23c"; g.beginPath(); g.arc(cx, cy, R * 0.035, 0, Math.PI * 2); g.fill();
    label(g, "NORGE", x + w * 0.07, y + h * 0.13, w * 0.15, { color: "#1f160e" });
    label(g, "A", x + w * 0.93, y + h * 0.95, w * 0.3, { color: "#1f160e", align: "right" });
    label(g, "INNLAND", x + w * 0.93, y + h * 0.71, w * 0.065, { color: "#1f160e", align: "right", weight: 700 });
    label(g, "VINYL", x + w * 0.07, y + h * 0.95, w * 0.065, { color: "#1f160e", weight: 700, spacing: 2 });
  }),
  // mountains over a fjord, the sun low
  fjord: () => postage(400, 500, "#c2d6d8", (g, x, y, w, h) => {
    const sky = g.createLinearGradient(0, y, 0, y + h * 0.7);
    sky.addColorStop(0, "#a9c6cc"); sky.addColorStop(1, "#e8dcc0");
    g.fillStyle = sky; g.fillRect(x, y, w, h);
    g.fillStyle = "#e88f4a"; g.beginPath(); g.arc(x + w * 0.66, y + h * 0.45, w * 0.12, 0, Math.PI * 2); g.fill();
    const ridge = (col, pts) => { g.fillStyle = col; g.beginPath(); g.moveTo(x, y + h); pts.forEach(([a, b]) => g.lineTo(x + w * a, y + h * b)); g.lineTo(x + w, y + h); g.fill(); };
    ridge("#6d8b96", [[0, 0.62], [0.18, 0.46], [0.3, 0.55], [0.5, 0.4], [0.7, 0.56], [0.86, 0.47], [1, 0.58]]);
    ridge("#3f5864", [[0, 0.7], [0.22, 0.5], [0.4, 0.66], [0.6, 0.48], [0.82, 0.68], [1, 0.62]]);
    g.fillStyle = "#f2efe6";
    for (const [a, b] of [[0.22, 0.5], [0.6, 0.48]]) { g.beginPath(); g.moveTo(x + w * (a - 0.06), y + h * (b + 0.06)); g.lineTo(x + w * a, y + h * b); g.lineTo(x + w * (a + 0.06), y + h * (b + 0.065)); g.lineTo(x + w * (a + 0.02), y + h * (b + 0.05)); g.fill(); }
    g.fillStyle = "#5f7f8c"; g.fillRect(x, y + h * 0.74, w, h * 0.26);
    g.strokeStyle = "rgba(240,230,205,0.5)"; g.lineWidth = 2;
    for (let k = 0; k < 6; k++) { const yy = y + h * (0.78 + k * 0.035); g.beginPath(); g.moveTo(x + w * (0.5 + k * 0.03), yy); g.lineTo(x + w * (0.8 - k * 0.02), yy); g.stroke(); }
    label(g, "NORGE", x + w * 0.07, y + h * 0.13, w * 0.15, { color: "#1d2f36" });
    label(g, "17,00", x + w * 0.93, y + h * 0.95, w * 0.17, { color: "#f4ecd8", align: "right" });
    label(g, "OSLOFJORDEN", x + w * 0.07, y + h * 0.95, w * 0.058, { color: "#f4ecd8", weight: 700, spacing: 1 });
  }),
  // a microphone in a beam, on teal
  mic: () => postage(400, 500, "#2d6b66", (g, x, y, w, h) => {
    const beam = g.createLinearGradient(0, y, 0, y + h);
    beam.addColorStop(0, "rgba(255,236,190,0.35)"); beam.addColorStop(1, "rgba(255,236,190,0)");
    g.fillStyle = beam; g.beginPath(); g.moveTo(x + w * 0.42, y); g.lineTo(x + w * 0.58, y); g.lineTo(x + w * 0.9, y + h); g.lineTo(x + w * 0.1, y + h); g.fill();
    const cx = x + w * 0.5;
    g.fillStyle = "#efe2c2";
    g.beginPath(); g.roundRect(cx - w * 0.11, y + h * 0.2, w * 0.22, h * 0.32, w * 0.11); g.fill();
    g.strokeStyle = "#2d6b66"; g.lineWidth = 2;
    for (let k = 0; k < 7; k++) { const yy = y + h * (0.25 + k * 0.034); g.beginPath(); g.moveTo(cx - w * 0.1, yy); g.lineTo(cx + w * 0.1, yy); g.stroke(); }
    g.strokeStyle = "#efe2c2"; g.lineWidth = w * 0.035; g.lineCap = "round";
    g.beginPath(); g.arc(cx, y + h * 0.4, w * 0.17, 0.15, Math.PI - 0.15); g.stroke();
    g.beginPath(); g.moveTo(cx, y + h * 0.57); g.lineTo(cx, y + h * 0.72); g.moveTo(cx - w * 0.13, y + h * 0.72); g.lineTo(cx + w * 0.13, y + h * 0.72); g.stroke();
    label(g, "NORGE", x + w * 0.07, y + h * 0.13, w * 0.15, { color: "#efe2c2" });
    label(g, "B", x + w * 0.93, y + h * 0.95, w * 0.26, { color: "#efe2c2", align: "right" });
    label(g, "R4N LIVE", x + w * 0.07, y + h * 0.95, w * 0.075, { color: "#efe2c2", weight: 700, spacing: 1 });
  }),
  // the crown, gold on deep red
  crown: () => postage(400, 500, "#7d1424", (g, x, y, w, h) => {
    const c = makeCanvas(400, 400);
    const cg = c.getContext("2d");
    drawCrown(cg, 200, 70, 260, 260);
    cg.globalCompositeOperation = "source-in";
    cg.fillStyle = "#e3c784"; cg.fillRect(0, 0, 400, 400);
    g.drawImage(c, x + w * 0.1, y + h * 0.12, w * 0.8, w * 0.8);
    label(g, "STUDIO 51", x + w * 0.5, y + h * 0.9, w * 0.12, { color: "#e3c784", align: "center", font: '"Cinzel"', weight: 700 });
  }),
};

// rubber-stamp shapes (white; inked afterwards)
function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, rr = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
  g.closePath(); g.fill();
}
function icon(g, kind, x, y, s) {
  g.save(); g.translate(x, y); g.lineCap = "round"; g.lineJoin = "round";
  if (kind === "plane") {
    g.rotate(-0.5);
    g.beginPath();
    g.moveTo(-s, -s * 0.1); g.lineTo(s * 0.8, -s * 0.12); g.quadraticCurveTo(s * 1.05, 0, s * 0.8, s * 0.12); g.lineTo(-s, s * 0.1); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-s * 0.1, 0); g.lineTo(-s * 0.45, -s * 0.9); g.lineTo(-s * 0.2, -s * 0.9); g.lineTo(s * 0.35, 0); g.lineTo(-s * 0.2, s * 0.9); g.lineTo(-s * 0.45, s * 0.9); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(-s * 0.85, 0); g.lineTo(-s * 1.05, -s * 0.4); g.lineTo(-s * 0.9, -s * 0.4); g.lineTo(-s * 0.6, 0); g.closePath(); g.fill();
  } else if (kind === "train") {
    g.beginPath(); g.roundRect(-s * 0.8, -s * 0.8, s * 1.6, s * 1.3, s * 0.3); g.fill();
    g.globalCompositeOperation = "destination-out";
    g.fillRect(-s * 0.55, -s * 0.55, s * 1.1, s * 0.45);
    g.globalCompositeOperation = "source-over";
    g.beginPath(); g.arc(-s * 0.45, s * 0.75, s * 0.2, 0, 7); g.arc(s * 0.45, s * 0.75, s * 0.2, 0, 7); g.fill();
  } else { // a note
    g.beginPath(); g.ellipse(-s * 0.3, s * 0.55, s * 0.36, s * 0.26, -0.4, 0, 7); g.fill();
    g.lineWidth = s * 0.16; g.beginPath(); g.moveTo(s * 0.02, s * 0.5); g.lineTo(s * 0.02, -s * 0.9); g.quadraticCurveTo(s * 0.5, -s * 0.6, s * 0.6, -s * 0.1); g.stroke();
  }
  g.restore();
}
// a border-control stamp: square corners going in, rounded going out; the country in its ring
// of stars, the date large, the means of travel, the place, the stamp's number up the side
function borderStamp({ entry, place, date, kind = "plane", num = "051" }) {
  const w = 720, h = 400, c = makeCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = g.strokeStyle = "#fff";
  const lw = h * 0.045, m = lw;
  g.lineWidth = lw;
  g.beginPath(); g.roundRect(m, m, w - 2 * m, h - 2 * m, entry ? h * 0.025 : h * 0.18); g.stroke();
  const cx = m + h * 0.26, cy = m + h * 0.28;
  for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; star(g, cx + Math.cos(a) * h * 0.16, cy + Math.sin(a) * h * 0.16, h * 0.026); }
  label(g, "N", cx, cy + h * 0.075, h * 0.21, { align: "center" });
  label(g, entry ? "INNREISE" : "UTREISE", w - m - h * 0.12, m + h * 0.2, h * 0.095, { align: "right", weight: 700, spacing: 3 });
  g.lineWidth = h * 0.02;
  g.beginPath(); g.moveTo(m + h * 0.52, m + h * 0.27); g.lineTo(w - m - h * 0.12, m + h * 0.27); g.stroke();
  label(g, date, w * 0.6, h * 0.62, h * 0.21, { align: "center", weight: 700, spacing: 4 });
  icon(g, kind, m + h * 0.27, h - m - h * 0.24, h * 0.12);
  label(g, place, w * 0.6, h - m - h * 0.14, h * 0.115, { align: "center", weight: 700, spacing: 4 });
  g.save(); g.translate(w - m - h * 0.06, h * 0.62); g.rotate(-Math.PI / 2);
  label(g, num, 0, 0, h * 0.075, { align: "center", weight: 700, spacing: 2 });
  g.restore();
  return c;
}
function arcText(g, text, cx, cy, r, start, end, size, outside = true, font = SANS, weight = 800) {
  g.font = `${weight} ${size}px ${font}`;
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
// a round date stamp: the place round the top, the date across the middle
function circleStamp(top, bottom, date, middle) {
  const n = 600, c = makeCanvas(n, n), g = c.getContext("2d"), m = n / 2;
  g.fillStyle = g.strokeStyle = "#fff";
  g.lineWidth = n * 0.03; g.beginPath(); g.arc(m, m, n * 0.46, 0, 7); g.stroke();
  g.lineWidth = n * 0.014; g.beginPath(); g.arc(m, m, n * 0.31, 0, 7); g.stroke();
  arcText(g, top, m, m, n * 0.385, -Math.PI * 0.9, -Math.PI * 0.1, n * 0.085);
  arcText(g, bottom, m, m, n * 0.385, Math.PI * 0.8, Math.PI * 0.2, n * 0.07, false);
  star(g, m - n * 0.385, m, n * 0.022); star(g, m + n * 0.385, m, n * 0.022);
  g.fillRect(m - n * 0.25, m - n * 0.085, n * 0.5, n * 0.012);
  g.fillRect(m - n * 0.25, m + n * 0.075, n * 0.5, n * 0.012);
  label(g, date, m, m + n * 0.045, n * 0.11, { align: "center", weight: 700, spacing: 2 });
  if (middle) label(g, middle, m, m - n * 0.13, n * 0.06, { align: "center", weight: 700, spacing: 3 });
  return c;
}
// the post office's cancellation: wavy lines with the round date stamp at their start
function waveCancel() {
  const w = 900, h = 300, c = makeCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = g.strokeStyle = "#fff";
  const ring = circleStamp("OSLO", "POSTEN", "14.06.26");
  g.drawImage(ring, 0, 10, 280, 280);
  g.lineWidth = 9; g.lineCap = "round";
  for (let k = 0; k < 6; k++) {
    g.beginPath();
    for (let x = 300; x <= w - 10; x += 6) { const y = 50 + k * 40 + Math.sin(x * 0.028) * 13; if (x === 300) g.moveTo(x, y); else g.lineTo(x, y); }
    g.stroke();
  }
  return c;
}
function ukmShape() {
  const n = 800, c = makeCanvas(n, n), g = c.getContext("2d"), m = n / 2;
  g.strokeStyle = g.fillStyle = "#fff";
  g.lineWidth = n * 0.022; g.beginPath(); g.arc(m, m, n * 0.46, 0, 7); g.stroke();
  g.lineWidth = n * 0.01; g.beginPath(); g.arc(m, m, n * 0.425, 0, 7); g.stroke();
  g.lineWidth = n * 0.012; g.beginPath(); g.arc(m, m, n * 0.28, 0, 7); g.stroke();
  arcText(g, "UKM-FESTIVALEN", m, m, n * 0.355, -Math.PI * 0.92, -Math.PI * 0.08, n * 0.07, true, '"Cinzel"', 700);
  arcText(g, "R4N · LIVE", m, m, n * 0.355, Math.PI * 0.78, Math.PI * 0.22, n * 0.06, false, '"Cinzel"', 700);
  label(g, "UKM", m, m - n * 0.03, n * 0.1, { align: "center", font: '"Cinzel"', weight: 700 });
  label(g, "SPILT · PLAYED", m, m + n * 0.07, n * 0.05, { align: "center", font: '"Cinzel"', weight: 600 });
  for (const dx of [-0.07, 0, 0.07]) star(g, m + n * dx, m + n * 0.15, n * 0.022);
  return c;
}
// a backstage pass, stuck in like a visa: printed on white, a coloured band, a barcode
function backstagePass() {
  const w = 640, h = 420, c = makeCanvas(w, h), g = c.getContext("2d");
  g.fillStyle = "#f7f4ee";
  g.beginPath(); g.roundRect(0, 0, w, h, 26); g.fill();
  g.save(); g.beginPath(); g.roundRect(0, 0, w, h, 26); g.clip();
  g.fillStyle = "#8a1320"; g.fillRect(0, 0, w, h * 0.27);
  g.strokeStyle = "rgba(240,223,178,0.25)"; g.lineWidth = 1.5;
  for (let k = 0; k < 9; k++) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = h * 0.04 + k * 12 + Math.sin(x * 0.03 + k) * 5; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
  label(g, "BACKSTAGE", w / 2, h * 0.19, h * 0.13, { color: "#f0dfb2", align: "center", font: '"Cinzel"', weight: 700, spacing: 10 });
  label(g, "ALL ACCESS", w * 0.07, h * 0.46, h * 0.12, { color: "#1b1714", weight: 800, spacing: 3 });
  label(g, "R4N LIVE · STUDIO 51", w * 0.07, h * 0.57, h * 0.055, { color: "#4a3f36", weight: 700, spacing: 2 });
  label(g, "ARTIST", w * 0.07, h * 0.68, h * 0.05, { color: "#8a1320", weight: 800, spacing: 3 });
  const r = rng(51);
  let x = w * 0.07;
  g.fillStyle = "#1b1714";
  while (x < w * 0.62) { const bw = 2 + Math.floor(r() * 3) * 2; g.fillRect(x, h * 0.75, bw, h * 0.15); x += bw + 2 + Math.floor(r() * 3) * 2; }
  label(g, "0051 2026 0614", w * 0.07, h * 0.95, h * 0.04, { color: "#1b1714", font: MONO, weight: 600, spacing: 2 });
  // the hologram square
  const holo = g.createLinearGradient(w * 0.7, h * 0.4, w * 0.93, h * 0.9);
  ["#d9c7f0", "#bfe3dd", "#f3e2b8", "#e9c6d6"].forEach((col, i) => holo.addColorStop(i / 3, col));
  g.fillStyle = holo; g.fillRect(w * 0.7, h * 0.4, w * 0.23, h * 0.5);
  g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 2;
  for (let k = 0; k < 6; k++) { g.beginPath(); g.arc(w * 0.815, h * 0.65, 12 + k * 14, 0, 7); g.stroke(); }
  g.restore();
  return c;
}

// ---------- what's in it: the stamps, cached (several pages use them) ----------
const cache = new Map();
const once = (key, make) => { if (!cache.has(key)) cache.set(key, make()); return cache.get(key); };
const STAMP = {
  record: () => once("record", POSTAGE.record),
  fjord: () => once("fjord", POSTAGE.fjord),
  mic: () => once("mic", POSTAGE.mic),
  crown: () => once("crown", POSTAGE.crown),
  pass: () => once("pass", backstagePass),
  ukm: () => once("ukm", () => ink(ukmShape(), INK.blue, 1201)),
  cancel: () => once("cancel", () => ink(waveCancel(), INK.black, 77, 0.8)),
  inn: () => once("inn", () => ink(borderStamp({ entry: true, place: "OSLO S", date: "14.06.26", kind: "train", num: "051" }), INK.red, 3301)),
  ut: () => once("ut", () => ink(borderStamp({ entry: false, place: "GARDERMOEN", date: "16.06.26", kind: "plane", num: "017" }), INK.blue, 4409)),
  studio: () => once("studio", () => ink(circleStamp("STUDIO 51", "OSLO · NORGE", "12.06.26", "INNSPILT"), INK.violet, 5101)),
};
// stamps for the pages riffling past: other trips, other dates
const TRIPS = [
  ["inn", "BERGEN", "03.05.26", "plane", INK.red], ["ut", "BERGEN", "05.05.26", "plane", INK.blue],
  ["inn", "TRONDHEIM", "21.03.26", "train", INK.green], ["ut", "TRONDHEIM", "22.03.26", "train", INK.violet],
  ["inn", "STAVANGER", "09.08.25", "plane", INK.red], ["ut", "KRISTIANSAND", "30.08.25", "train", INK.blue],
  ["circle", "TROMSØ", "LIVE", "18.01.26", INK.violet], ["circle", "LILLEHAMMER", "UKM", "11.04.26", INK.green],
  ["circle", "OSLO", "STUDIO 51", "02.02.26", INK.red], ["inn", "OSLO S", "27.10.25", "train", INK.black],
];
function tripStamp(i) {
  const [kind, a, b, c, col] = TRIPS[i % TRIPS.length];
  return once(`trip${i % TRIPS.length}`, () => kind === "circle"
    ? { canvas: ink(circleStamp(a, "R4N · " + b, c), col, 900 + i), round: true }
    : { canvas: ink(borderStamp({ entry: kind === "inn", place: a, date: b, kind: c, num: String(100 + i * 7) }), col, 700 + i), round: false });
}

// The open spread: memories of a trip, laid out round the middle, where the film, the title and
// the ticket lie across the fold (those are their own pieces, in js/booking.js). [x, y, rot]
const SPREAD = {
  wide: [
    ["record", -0.68, 0.37, 0.2, 0.25, -0.08],
    ["fjord", -0.44, 0.41, 0.2, 0.25, 0.07],
    ["cancel", -0.5, 0.3, 0.42, 0.14, -0.04, "ink"],
    ["inn", -0.6, 0.04, 0.34, 0.19, 0.1, "ink"],
    ["ukm", -0.56, -0.32, 0.4, 0.4, -0.22, "ink"],
    ["mic", 0.66, 0.37, 0.2, 0.25, 0.11],
    ["studio", 0.73, 0.18, 0.24, 0.24, 0.3, "ink"],
    ["pass", 0.6, -0.04, 0.34, 0.223, -0.05],
    ["crown", 0.73, -0.41, 0.2, 0.25, -0.1],
    ["ut", 0.5, -0.33, 0.3, 0.167, -0.14, "ink"],
  ],
  tall: [
    ["record", -0.45, 0.68, 0.18, 0.225, -0.08],
    ["fjord", -0.18, 0.71, 0.18, 0.225, 0.06],
    ["cancel", -0.28, 0.6, 0.38, 0.127, -0.04, "ink"],
    ["inn", 0.36, 0.7, 0.3, 0.167, 0.08, "ink"],
    ["ukm", -0.47, 0.2, 0.27, 0.27, -0.2, "ink"],
    ["mic", 0.48, 0.24, 0.17, 0.2125, 0.1],
    ["pass", -0.47, -0.24, 0.24, 0.1575, 0.08],
    ["studio", 0.47, -0.2, 0.2, 0.2, 0.3, "ink"],
    ["crown", 0.42, -0.7, 0.18, 0.225, -0.1],
    ["ut", -0.3, -0.7, 0.3, 0.167, -0.12, "ink"],
  ],
};

// the open spread's two pages (L: left / top, R: right / bottom)
export async function spreadPages(dims, tw, th, vertical) {
  const out = {};
  for (const side of ["L", "R"]) {
    const p = newPage(tw, th, { vertical, side, seed: side === "L" ? 41 : 42 });
    securityPrint(p, { num: side === "L" ? 14 : 15, seed: side === "L" ? 3 : 4 });
    await breathe();
    const reg = regionOf(dims, vertical, side);
    for (const [key, x, y, w, h, rot, kind] of SPREAD[vertical ? "tall" : "wide"]) {
      place(p, reg, { canvas: STAMP[key](), x, y, w, h, rot, ink: kind === "ink", ghost: key === "inn", alpha: 0.88 });
      await breathe();
    }
    pageShade(p);
    roundOuter(p, dims.R / dims.PW);
    out[side] = p.c;
    await breathe();
  }
  return out;
}

// the pages that riffle past: visa pages from other trips (a few, used again and again)
export async function leafPages(dims, tw, th, vertical, count) {
  const pages = { L: [], R: [] };
  for (let i = 0; i < count; i++) {
    for (const side of ["L", "R"]) {
      const p = newPage(tw, th, { vertical, side, seed: 100 + i * 2 + (side === "L" ? 1 : 0) });
      securityPrint(p, { num: 4 + i * 2 + (side === "R" ? 1 : 0), header: "VISA / VISAS", seed: 10 + i });
      const r = rng(500 + i * 3 + (side === "L" ? 7 : 0));
      const n = 2 + Math.floor(r() * 2);
      for (let k = 0; k < n; k++) {
        const s = tripStamp(i * 3 + k + (side === "L" ? 5 : 0));
        const w = s.round ? 0.3 : 0.34, h = s.round ? 0.3 : 0.19;
        // somewhere on the page, roughly in rows, never quite straight
        const fx = 0.28 + r() * 0.44, fy = 0.2 + (k / n) * 0.62 + r() * 0.12;
        const reg = regionOf(dims, vertical, side);
        place(p, reg, {
          canvas: s.canvas, ink: true, alpha: 0.85, rot: (r() - 0.5) * 0.6, w, h,
          x: reg.x0 + fx * (reg.x1 - reg.x0), y: reg.y1 - fy * (reg.y1 - reg.y0),
        });
        await breathe();
      }
      pageShade(p);
      roundOuter(p, dims.R / dims.PW);
      pages[side].push(p.c);
      await breathe();
    }
  }
  return pages;
}

// ---------- the booking form: two pages like a passport's data page ----------
// Labels in both languages (as a passport has them); the writing itself happens in real fields
// js/booking.js lays over the page. Returns where those fields are, in spread units.
const FORM = {
  wide: {
    back: [-0.79, 0.53, 0.3, 0.06],
    head: [-0.435, 0.4], sub: [-0.435, 0.33],
    name: [-0.79, 0.12, 0.7, 0.075], email: [-0.79, -0.09, 0.7, 0.075],
    office: [-0.79, -0.42, 0.7, 0.13],
    message: [0.08, 0.42, 0.7, 0.56, 7], send: [0.27, -0.36, 0.32, 0.1],
    mrz: [0.06, -0.5],
  },
  tall: {
    back: [-0.56, 0.8, 0.3, 0.055],
    head: [0, 0.73], sub: [0, 0.67],
    name: [-0.5, 0.48, 1.0, 0.07], email: [-0.5, 0.28, 1.0, 0.07],
    office: [-0.5, 0.06, 1.0, 0.1],
    message: [-0.5, -0.07, 1.0, 0.4, 5], send: [-0.15, -0.63, 0.3, 0.09],
    mrz: [-0.56, -0.81],
  },
};
export function formLayout(vertical) { return FORM[vertical ? "tall" : "wide"]; }

export async function formPages(dims, tw, th, vertical) {
  const F = formLayout(vertical);
  const out = {};
  for (const side of ["L", "R"]) {
    const p = newPage(tw, th, { vertical, side, seed: side === "L" ? 61 : 62 });
    securityPrint(p, { num: side === "L" ? 16 : 17, seed: side === "L" ? 5 : 6, landscape: side === "L" });
    const reg = regionOf(dims, vertical, side);
    const { g, LW } = p;
    const k = LW / (reg.x1 - reg.x0);
    const X = (x) => (x - reg.x0) * k, Y = (y) => (reg.y1 - y) * k;
    const u = k / 1000; // pen size per 1/1000 of a unit
    const ink = "rgba(62,44,32,0.82)", pale = "rgba(62,44,32,0.5)";
    g.save();
    const text = (t, x, y, size, opts = {}) => label(g, t, X(x), Y(y), size * u * 1000, { color: ink, weight: 700, ...opts });
    const line = (x, y, w, dash) => {
      g.strokeStyle = pale; g.lineWidth = Math.max(1, 0.0018 * k);
      g.setLineDash(dash ? [6 * k / 1000, 5 * k / 1000] : []);
      g.beginPath(); g.moveTo(X(x), Y(y)); g.lineTo(X(x + w), Y(y)); g.stroke();
      g.setLineDash([]);
    };
    const field = ([x, y, w, h], n, no, en) => {
      text(`${n}. ${no} / ${en}`, x, y + h + 0.012, 0.024, { font: SANS, weight: 700, color: pale, spacing: 0.002 * k });
      line(x, y, w);
    };
    // the heading and the office box: on the first page (left, or the top one)
    if (side === "L") {
      text("BOOKINGSØKNAD", F.head[0], F.head[1], 0.05, { font: '"Cinzel"', align: "center", spacing: 0.006 * k });
      text("BOOKING APPLICATION · R4N LIVE", F.sub[0], F.sub[1], 0.022, { font: SANS, align: "center", color: pale, spacing: 0.004 * k });
      field(F.name, 1, "Navn", "Name");
      field(F.email, 2, "E-post", "E-mail");
      const [ox, oy, ow, oh] = F.office;
      g.strokeStyle = pale; g.lineWidth = 1.2 * k / 1000;
      g.strokeRect(X(ox), Y(oy + oh), ow * k, oh * k);
      text("TIL BRUK FOR R4N / FOR R4N USE", ox + 0.02, oy + oh - 0.032, 0.018, { font: SANS, color: pale, spacing: 0.002 * k });
      text("Mottatt / Received", ox + 0.02, oy + 0.025, 0.018, { font: SANS, weight: 600, color: pale });
      line(ox + 0.22, oy + 0.02, ow * 0.3, true);
      text("Svar / Reply", ox + ow * 0.58, oy + 0.025, 0.018, { font: SANS, weight: 600, color: pale });
      line(ox + ow * 0.72, oy + 0.02, ow * 0.24, true);
      // the R4N office's own stamp, faint, waiting in the corner
      place(p, reg, { canvas: STAMP.studio(), x: ox + ow * 0.86, y: oy + oh * 0.55, w: 0.16, h: 0.16, rot: 0.25, ink: true, alpha: 0.35 });
    }
    if (side === "R") {
      const [mx, my, mw, mh, rows] = F.message;
      text("3. Melding / Message", mx, my + 0.02, 0.024, { font: SANS, color: pale, spacing: 0.002 * k });
      for (let i = 1; i <= rows; i++) line(mx, my - (mh / rows) * i, mw);
      const [sx, sy] = F.send;
      text("4. Send / Submit", sx - 0.01, sy + F.send[3] + 0.04, 0.02, { font: SANS, color: pale, spacing: 0.002 * k });
    }
    // the machine-readable lines, along the foot of the second page
    if (side === "R") {
      const [zx, zy] = F.mrz;
      g.fillStyle = "rgba(40,30,24,0.78)";
      // as wide as the page allows, like the real lines (44 characters, fixed width)
      const mrz = ["P<NORR4N<<BOOKING<<STUDIO<51<<<<<<<<<<<<<<<", "R4N0000514NOR2606143<<<<<<<<<<<<<<<<<<<<06"];
      g.font = `600 ${0.024 * k}px ${MONO}`;
      const fit = Math.min(1, ((reg.x1 - zx) - 0.06) * k / g.measureText(mrz[0]).width);
      g.font = `600 ${0.024 * k * fit}px ${MONO}`;
      g.fillText(mrz[0], X(zx), Y(zy + 0.045));
      g.fillText(mrz[1], X(zx), Y(zy));
      spaced(g, 0);
    }
    g.restore();
    pageShade(p);
    roundOuter(p, dims.R / dims.PW);
    out[side] = p.c;
    await breathe();
  }
  return out;
}

// SENT: pressed onto the form when the message has gone
export function sentStamp() {
  return once("sent", () => {
    const w = 720, h = 360, c = makeCanvas(w, h), g = c.getContext("2d");
    g.fillStyle = g.strokeStyle = "#fff";
    g.lineWidth = 16; g.beginPath(); g.roundRect(14, 14, w - 28, h - 28, 30); g.stroke();
    g.lineWidth = 6; g.beginPath(); g.roundRect(40, 40, w - 80, h - 80, 18); g.stroke();
    label(g, "SENDT · SENT", w / 2, h * 0.47, h * 0.2, { align: "center", font: '"Cinzel"', weight: 700, spacing: 6 });
    label(g, "R4N · STUDIO 51", w / 2, h * 0.7, h * 0.09, { align: "center", weight: 800, spacing: 6 });
    return ink(c, INK.red, 9001, 0.7);
  });
}
// press the SENT stamp onto a form page (in place, on the canvas the page is made from)
export function pressSent(canvas, dims, vertical, at) {
  const p = { g: canvas.getContext("2d"), LW: vertical ? canvas.height : canvas.width, LH: vertical ? canvas.width : canvas.height };
  p.g.save();
  if (vertical) p.g.setTransform(0, -1, 1, 0, 0, canvas.height);
  place(p, regionOf(dims, vertical, "R"), { canvas: sentStamp(), x: at[0], y: at[1], w: 0.42, h: 0.21, rot: 0.14, ink: true, alpha: 0.92 });
  p.g.restore();
}

// ---------- across the fold: the film's print, the title, the ticket ----------
// Each drawn with room round it for its own shadow (pad, a share of the size each side).
export const PAD = 0.08;
function withPad(w, h, draw) {
  const c = makeCanvas(w * (1 + 2 * PAD), h * (1 + 2 * PAD)), g = c.getContext("2d");
  g.translate(w * PAD, h * PAD);
  g.shadowColor = "rgba(40,24,10,0.42)"; g.shadowBlur = Math.min(w, h) * 0.05;
  g.shadowOffsetX = w * 0.008; g.shadowOffsetY = h * 0.016;
  draw(g, w, h);
  return c;
}
// the print the film is in: a white border, a strip of tape across two corners. The window
// (where the film shows through) is cut out.
export const PRINT = { w: 0.48, h: 0.62, win: [0.06, 0.06, 0.88, 0.8] }; // window: x, y, w, h (shares, from top left)
export function printArt() {
  const W2 = 960, H2 = Math.round(960 * PRINT.h / PRINT.w);
  return withPad(W2, H2, (g, w, h) => {
    g.fillStyle = "#f6f2e8"; g.fillRect(0, 0, w, h);
    g.shadowColor = "rgba(0,0,0,0)";
    const [wx, wy, ww, wh] = PRINT.win;
    g.globalCompositeOperation = "destination-out";
    g.fillRect(w * wx, h * wy, w * ww, h * wh);
    g.globalCompositeOperation = "source-over";
    label(g, "R4N LIVE · UKM", w * wx, h * 0.935, h * 0.026, { color: "rgba(40,30,24,0.55)", weight: 700, font: MONO, spacing: 3 });
    label(g, "14.06.26", w * (wx + ww), h * 0.935, h * 0.026, { color: "rgba(40,30,24,0.55)", weight: 700, font: MONO, align: "right", spacing: 3 });
    // tape: translucent, its ends torn
    const tape = (x, y, a) => {
      g.save(); g.translate(x, y); g.rotate(a);
      g.fillStyle = "rgba(236,228,200,0.72)";
      const tw = w * 0.32, th = h * 0.06;
      g.beginPath(); g.moveTo(-tw / 2, -th / 2);
      for (let i = 0; i <= 6; i++) g.lineTo(-tw / 2 + (i % 2 ? 4 : 0), -th / 2 + (th * i) / 6);
      for (let i = 6; i >= 0; i--) g.lineTo(tw / 2 - (i % 2 ? 4 : 0), -th / 2 + (th * i) / 6);
      g.closePath(); g.fill();
      g.restore();
    };
    tape(w * 0.06, h * 0.03, -0.7);
    tape(w * 0.94, h * 0.97, -0.7);
  });
}
// the title: R4N LIVE in black on a strip of cream paper, cut a little unevenly
export const TITLE = { w: 0.6, h: 0.13 };
export function titleArt() {
  const W2 = 1200, H2 = Math.round(1200 * TITLE.h / TITLE.w);
  return withPad(W2, H2, (g, w, h) => {
    g.fillStyle = "#f1e9d6";
    g.beginPath();
    g.moveTo(w * 0.005, h * 0.06); g.lineTo(w * 0.995, 0); g.lineTo(w, h * 0.96); g.lineTo(0, h); g.closePath();
    g.fill();
    g.shadowColor = "rgba(0,0,0,0)";
    g.font = `700 ${h * 0.68}px "Cinzel"`;
    spaced(g, h * 0.06);
    g.fillStyle = "#16120f"; g.textAlign = "center"; g.textBaseline = "middle";
    g.fillText("R4N LIVE", w / 2 + h * 0.03, h * 0.56);
    spaced(g, 0);
  });
}
// BOOK NOW: a ticket, crimson, with its stub torn along a perforation
export const TICKET = { w: 0.46, h: 0.15 };
export function ticketArt(hover) {
  const W2 = 1100, H2 = Math.round(1100 * TICKET.h / TICKET.w);
  return withPad(W2, H2, (g, w, h) => {
    const stub = w * 0.78, nr = h * 0.09;
    g.fillStyle = hover ? "#a31a2b" : "#8a1320";
    g.beginPath();
    g.moveTo(0, 0); g.lineTo(stub - nr, 0); g.arc(stub, 0, nr, Math.PI, 0, true); g.lineTo(w, 0);
    g.lineTo(w, h); g.lineTo(stub + nr, h); g.arc(stub, h, nr, 0, Math.PI, true); g.lineTo(0, h); g.closePath();
    g.fill();
    g.shadowColor = "rgba(0,0,0,0)";
    g.save(); g.clip();
    g.strokeStyle = "rgba(240,223,178,0.13)"; g.lineWidth = 2;
    for (let k = 0; k < 14; k++) { g.beginPath(); for (let x = 0; x <= w; x += 8) { const y = k * h / 13 + Math.sin(x * 0.02 + k * 0.7) * 7; if (x === 0) g.moveTo(x, y); else g.lineTo(x, y); } g.stroke(); }
    g.restore();
    g.strokeStyle = "rgba(240,223,178,0.55)"; g.lineWidth = 3;
    g.strokeRect(h * 0.08, h * 0.08, stub - h * 0.16, h - h * 0.16);
    g.setLineDash([8, 9]); g.lineWidth = 4;
    g.beginPath(); g.moveTo(stub, nr * 1.4); g.lineTo(stub, h - nr * 1.4); g.stroke(); g.setLineDash([]);
    label(g, "R4N LIVE · ADMIT ONE · STUDIO 51", stub / 2, h * 0.28, h * 0.085, { color: "rgba(240,223,178,0.8)", align: "center", weight: 700, spacing: 4 });
    label(g, "BOOK NOW", stub / 2, h * 0.73, h * 0.36, { color: "#f3e4bb", align: "center", font: '"Cinzel"', weight: 700, spacing: 8 });
    g.save(); g.translate((stub + w) / 2, h / 2); g.rotate(-Math.PI / 2);
    label(g, "Nº 0051", 0, h * 0.045, h * 0.13, { color: "#f3e4bb", align: "center", weight: 800, spacing: 3 });
    g.restore();
  });
}

// Until the real film arrives: a stop-motion stand-in, a few frames a second of a stage in the
// dark (a figure at a mic in a cone of light), film grain and a counter.
export function filmPlaceholder() {
  const c = makeCanvas(420, 480);
  const g = c.getContext("2d");
  let frame = 0;
  function draw() {
    frame++;
    const w = c.width, h = c.height, jit = (Math.random() - 0.5) * 6;
    g.fillStyle = "#0f0c0a"; g.fillRect(0, 0, w, h);
    const cone = g.createRadialGradient(w / 2 + jit, h * 0.1, 10, w / 2, h * 0.7, h * 0.75);
    cone.addColorStop(0, "rgba(255,214,150,0.55)"); cone.addColorStop(1, "rgba(255,180,100,0)");
    g.fillStyle = cone; g.beginPath(); g.moveTo(w * 0.42, 0); g.lineTo(w * 0.58, 0); g.lineTo(w * 0.95, h); g.lineTo(w * 0.05, h); g.fill();
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
  }
  draw();
  return { canvas: c, draw };
}
