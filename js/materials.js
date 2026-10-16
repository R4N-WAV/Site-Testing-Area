// Everything that makes a record look like a real object:
// studio lighting for reflections, a cardboard sleeve with paper grain and ring wear,
// and clear, creased shrink-wrap with a pink holo sheen sealing it.
// All textures are generated here, so a new release only needs its cover art.
import * as THREE from "three";

// Real proportions: a 12" sleeve is 31.4 cm square, the disc inside 30 cm.
export const SLEEVE = 1;
export const SLEEVE_DEPTH = 0.04; // thickness at the middle, where the disc is; the board is about a third of that
const DISC_R = 0.477; // only used for the ring wear it leaves on the sleeve

// ---------- small helpers ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function blur(h, S, passes = 1) {
  const tmp = new Float32Array(h.length);
  for (let p = 0; p < passes; p++) {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        tmp[i] = (h[y * S + Math.max(0, x - 1)] + h[i] + h[y * S + Math.min(S - 1, x + 1)]) / 3;
      }
    }
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const i = y * S + x;
        h[i] = (tmp[Math.max(0, y - 1) * S + x] + tmp[i] + tmp[Math.min(S - 1, y + 1) * S + x]) / 3;
      }
    }
  }
  return h;
}

function heightToNormal(h, S, strength) {
  const out = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const dx = (h[y * S + Math.min(S - 1, x + 1)] - h[y * S + Math.max(0, x - 1)]) * strength;
      const dy = (h[Math.min(S - 1, y + 1) * S + x] - h[Math.max(0, y - 1) * S + x]) * strength;
      const len = Math.hypot(dx, dy, 1);
      const o = (y * S + x) * 4;
      out[o] = (-dx / len * 0.5 + 0.5) * 255;
      out[o + 1] = (-dy / len * 0.5 + 0.5) * 255;
      out[o + 2] = (1 / len * 0.5 + 0.5) * 255;
      out[o + 3] = 255;
    }
  }
  return out;
}

function dataTexture(bytes, S, { srgb = false } = {}) {
  const t = new THREE.DataTexture(bytes, S, S, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

function canvasTexture(canvas, { srgb = true } = {}) {
  const t = new THREE.CanvasTexture(canvas);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

function makeCanvas(w, h = w) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

function averageColor(image) {
  const c = makeCanvas(8);
  const g = c.getContext("2d");
  g.drawImage(image, 0, 0, 8, 8);
  const d = g.getImageData(0, 0, 8, 8).data;
  let r = 0, gg = 0, b = 0;
  for (let i = 0; i < d.length; i += 4) { r += d[i]; gg += d[i + 1]; b += d[i + 2]; }
  const n = d.length / 4;
  return new THREE.Color().setRGB(r / n / 255, gg / n / 255, b / n / 255, THREE.SRGBColorSpace);
}

// ============================================================
//  Studio lighting: soft boxes around a dark room, used for reflections.
//  Most light sits in front of the records (behind the viewer), the way
//  a product photographer would light them.
// ============================================================
function softboxTexture(aspect) {
  const W = 128, H = 128;
  const c = makeCanvas(W, H);
  const g = c.getContext("2d");
  // brightest along the middle, feathering to nothing at the edges (both directions)
  const across = g.createLinearGradient(0, 0, W, 0);
  across.addColorStop(0, "rgba(255,255,255,0)");
  across.addColorStop(0.3, "rgba(255,255,255,0.75)");
  across.addColorStop(0.5, "rgba(255,255,255,1)");
  across.addColorStop(0.7, "rgba(255,255,255,0.75)");
  across.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.fillStyle = across; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-in";
  const along = g.createLinearGradient(0, 0, 0, H);
  along.addColorStop(0, "rgba(0,0,0,0)");
  along.addColorStop(0.15, "rgba(0,0,0,1)");
  along.addColorStop(0.85, "rgba(0,0,0,1)");
  along.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = along; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "destination-over";
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  if (aspect > 1) { t.center.set(0.5, 0.5); t.rotation = Math.PI / 2; } // wide panels: feather top/bottom
  return t;
}

function makeEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.BoxGeometry(60, 60, 60),
    new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.BackSide })
  ));
  const panel = (w, h, intensity, color, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(color).multiplyScalar(intensity), side: THREE.DoubleSide })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // Softboxes with feathered edges: a real studio light reflects as a bright core that
  // fades out, never as a hard-edged shape. Long, narrow ones give the streaks that sweep
  // across shrink-wrap as it turns; a broad one gives the soft sheen over the bulge.
  const soft = (w, h, intensity, color, pos) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({
        map: softboxTexture(w / h),
        color: new THREE.Color(color).multiplyScalar(intensity),
        side: THREE.DoubleSide,
      })
    );
    m.position.set(...pos);
    m.lookAt(0, 0, 0);
    env.add(m);
  };
  // The plastic itself is clear and the soft light on it is neutral white. Only the narrow
  // highlight strips are pink, so pink shows up as flares that sweep across, never as a tint.
  // (set well off to the sides: seen straight on the plastic is clear; turn it and a pink flare sweeps across)
  soft(0.8, 18, 3.4, "#ffe4f2", [-11, 2, 7]);    // narrow strip, left: white with a faint pink tint
  soft(0.6, 18, 2.8, "#fbd8ec", [11, -1, 6]);    // narrow strip, right: a touch more rose
  soft(20, 0.7, 3, "#ffffff", [0, 9, 12]);       // long strip above: white
  // (no broad light: on the domed sleeve a wide light reflects as a curved, bean-shaped blob)
  panel(0.05, 10, 3, "#fbe3f0", [2, 4, 14]);     // one fine, crisp line for a sharp, pale pink glint
  panel(12, 0.6, 0.8, "#ffffff", [0, 11, -7]);   // faint rim from behind

  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.004).texture; // barely blurred: crisp, narrow highlights
  pmrem.dispose();
  return tex;
}

// ============================================================
//  Paper: fine grain + fibres + ring wear (the circle a disc presses into
//  a sleeve over the years). Used as a bump map on both sides of the sleeve.
// ============================================================
function paperBump(S = 1024) {
  const rnd = mulberry32(21);
  const h = new Float32Array(S * S);
  for (let i = 0; i < h.length; i++) h[i] = rnd();
  blur(h, S, 1);
  for (let f = 0; f < 2600; f++) { // fibres
    let x = rnd() * S, y = rnd() * S;
    const a = rnd() * Math.PI, len = 4 + rnd() * 14, amp = (rnd() - 0.5) * 0.5;
    for (let s = 0; s < len; s++) {
      const xi = x | 0, yi = y | 0;
      if (xi >= 0 && yi >= 0 && xi < S && yi < S) h[yi * S + xi] += amp;
      x += Math.cos(a); y += Math.sin(a);
    }
  }
  const R = S / 2;
  const wearR = (DISC_R / SLEEVE) * S * 0.985;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - R, y + 0.5 - R);
      const ring = Math.exp(-(((d - wearR) / 3) ** 2)) * 0.35 + Math.exp(-(((d - S * 0.165) / 3) ** 2)) * 0.12;
      // sleeve slightly bulges where the disc sits
      const bulge = d < wearR ? 0.12 * (1 - (d / wearR) ** 2) : 0;
      h[y * S + x] = h[y * S + x] * 0.55 + ring + bulge;
    }
  }
  const bytes = new Uint8Array(S * S * 4);
  let min = Infinity, max = -Infinity;
  for (const v of h) { if (v < min) min = v; if (v > max) max = v; }
  for (let i = 0; i < h.length; i++) {
    const v = ((h[i] - min) / (max - min)) * 255;
    bytes[i * 4] = bytes[i * 4 + 1] = bytes[i * 4 + 2] = v;
    bytes[i * 4 + 3] = 255;
  }
  return dataTexture(bytes, S);
}

// ============================================================
//  Shrink-wrap: creases fanning from the corners, little wrinkles along
//  the edges, and a soft pillowing across the face.
// ============================================================
function wrapNormal(S = 1024, seed = 3) {
  const rnd = mulberry32(seed);
  const h = new Float32Array(S * S);
  const stamp = (x0, y0, ang, len, width, amp) => {
    const steps = Math.ceil(len * 1.5);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = x0 + Math.cos(ang) * len * t;
      const cy = y0 + Math.sin(ang) * len * t;
      const a = amp * Math.sin(Math.PI * Math.min(1, t * 1.15)); // fades at the ends
      const w = Math.ceil(width);
      for (let oy = -w; oy <= w; oy++) {
        for (let ox = -w; ox <= w; ox++) {
          const xi = (cx + ox) | 0, yi = (cy + oy) | 0;
          if (xi < 0 || yi < 0 || xi >= S || yi >= S) continue;
          const d = Math.hypot(ox, oy) / width;
          if (d < 1) h[yi * S + xi] += a * (1 - d * d) * (1 - d * d) / steps * 6;
        }
      }
    }
  };
  // corner fans
  const corners = [[0, 0, 0], [S, 0, Math.PI / 2], [S, S, Math.PI], [0, S, -Math.PI / 2]];
  for (const [cx, cy, base] of corners) {
    for (let k = 0; k < 5; k++) {
      const ang = base + 0.12 + rnd() * (Math.PI / 2 - 0.24);
      // soft, wide folds where the plastic bunches at the corner (never thin spikes)
      stamp(cx, cy, ang, S * (0.03 + rnd() * 0.1), 7 + rnd() * 7, (rnd() < 0.5 ? -1 : 1) * (0.18 + rnd() * 0.3));
    }
  }
  // edge wrinkles
  for (let k = 0; k < 24; k++) {
    const side = (rnd() * 4) | 0, p = rnd() * S;
    const [x0, y0, inward] = [[p, 0, Math.PI / 2], [S, p, Math.PI], [p, S, -Math.PI / 2], [0, p, 0]][side];
    stamp(x0, y0, inward + (rnd() - 0.5) * 0.6, S * (0.01 + rnd() * 0.035), 6 + rnd() * 5, (rnd() - 0.5) * 0.4);
  }
  // a few long soft folds across the face
  for (let k = 0; k < 5; k++) {
    stamp(rnd() * S, rnd() * S, rnd() * Math.PI * 2, S * (0.15 + rnd() * 0.3), 10 + rnd() * 10, (rnd() - 0.5) * 0.5);
  }
  // pillowing
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / S, v = y / S;
      h[y * S + x] += 0.6 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v)
        + 0.06 * Math.sin(u * 13 + v * 5) + 0.05 * Math.sin(v * 17 - u * 7);
    }
  }
  blur(h, S, 5); // a little softer, so creases never read as flat facets

  // Haze: the plastic is milky everywhere, and goes whiter where it creases or
  // bunches up at the edges (stretched and folded film scatters more light).
  // Two maps from the same creases: ridges whiten (haze), valleys darken (shade).
  // Clear on flat plastic, so the artwork still shows through untouched.
  const haze = new Uint8Array(S * S * 4);
  const shade = new Uint8Array(S * S * 4);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const i = y * S + x;
      const lap =
        h[y * S + Math.min(S - 1, x + 2)] + h[y * S + Math.max(0, x - 2)] +
        h[Math.min(S - 1, y + 2) * S + x] + h[Math.max(0, y - 2) * S + x] - 4 * h[i];
      const edge = Math.min(x, y, S - 1 - x, S - 1 - y) / S;
      const ridge = Math.max(0, -lap), valley = Math.max(0, lap);
      // the very border of the map is left clean: sampling past the edge reads as a fake
      // fold there and draws a dark outline round the whole record
      const inside = smoothstep(0.004, 0.03, edge);
      const v = (Math.min(0.35, ridge * 12) + Math.max(0, 0.02 - edge) * 4) * Math.max(inside, 0.3);
      const d = Math.min(0.3, valley * 10) * inside;
      haze[i * 4] = haze[i * 4 + 1] = haze[i * 4 + 2] = Math.min(1, v) * 255;
      shade[i * 4] = shade[i * 4 + 1] = shade[i * 4 + 2] = d * 255;
      haze[i * 4 + 3] = shade[i * 4 + 3] = 255;
    }
  }
  return { normal: dataTexture(heightToNormal(h, S, 7), S), haze: dataTexture(haze, S), shade: dataTexture(shade, S) };
}

// ============================================================
//  Printed surfaces
// ============================================================
function frontCanvas(image) {
  const S = 1024;
  const c = makeCanvas(S);
  const g = c.getContext("2d");
  const iw = image.naturalWidth || image.width, ih = image.naturalHeight || image.height;
  const s = Math.max(S / iw, S / ih);
  g.drawImage(image, (S - iw * s) / 2, (S - ih * s) / 2, iw * s, ih * s);
  // edge and corner wear: the white board showing through
  const rnd = mulberry32((iw * 31 + ih) | 0);
  g.fillStyle = "rgba(255,255,255,0.10)";
  for (let k = 0; k < 900; k++) {
    const side = (rnd() * 4) | 0, p = rnd() * S, d = rnd() ** 3 * 7;
    const [x, y] = [[p, d], [S - d, p], [p, S - d], [d, p]][side];
    g.fillRect(x, y, 1 + rnd() * 2, 1 + rnd() * 2);
  }
  for (const [x, y] of [[0, 0], [S, 0], [0, S], [S, S]]) {
    const grd = g.createRadialGradient(x, y, 0, x, y, 22);
    grd.addColorStop(0, "rgba(255,255,255,0.22)");
    grd.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grd;
    g.fillRect(x - 22, y - 22, 44, 44);
  }
  return c;
}

function backCanvas(rel, tint) {
  const S = 1024;
  const c = makeCanvas(S);
  const g = c.getContext("2d");
  const base = tint.clone().lerp(new THREE.Color(0x111112), 0.78);
  g.fillStyle = `#${base.getHexString(THREE.SRGBColorSpace)}`;
  g.fillRect(0, 0, S, S);
  g.fillStyle = "rgba(235,235,230,0.85)";
  g.font = "500 34px ui-monospace, Menlo, monospace";
  g.fillText((rel.artist || "R4N").toUpperCase(), 70, 110);
  g.font = "500 46px ui-monospace, Menlo, monospace";
  g.fillText(rel.title.toUpperCase().slice(0, 30), 70, 170);
  g.font = "24px ui-monospace, Menlo, monospace";
  g.fillStyle = "rgba(235,235,230,0.6)";
  g.fillText("SIDE A", 70, 270);
  g.fillText(`A1  ${rel.title.toUpperCase().slice(0, 34)}`, 70, 310);
  let y = 400;
  for (const c2 of rel.credits || []) {
    const names = c2.people.map((p) => p.name).join(", ");
    if (!c2.role || !names) continue;
    g.fillText(`${String(c2.role).toUpperCase()}: ${names}`.slice(0, 60), 70, y);
    y += 40;
  }
  g.fillText(`℗ ${rel.date ? rel.date.slice(0, 4) + " " : ""}R4N`, 70, S - 80);
  g.fillText("33⅓ RPM", S - 230, S - 80);
  return c;
}

// A sleeve with a record inside. The board is flat and thin out to the edges, with a
// gentle round dome in the middle where the disc sits. The edges are rounded like folded
// card (a half-round bullnose, not a sharp box corner), and the cover print wraps around
// them, the way the printed paper on a real sleeve folds over the board.
function pillowProfile(u, v) {
  // u, v in -0.5..0.5 across the face
  const r = Math.hypot(u, v);
  const disc = 1 - smoothstep(0.2, 0.48, r); // the dome over the disc, with a soft shoulder
  return EDGE_THICK + (1 - EDGE_THICK) * disc;
}
const EDGE_THICK = 0.36; // board thickness at the edges, as a share of the middle
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
function pillowBox(w, h, depth, seg = 64) {
  const g = new THREE.BoxGeometry(w, h, depth, seg, seg, 12);
  const pos = g.attributes.position;
  const nrm = g.attributes.normal;
  const uv = g.attributes.uv;
  const eps = 1e-6;
  const side = new Uint8Array(pos.count);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const theta = (z / (depth / 2)) * (Math.PI / 2);   // -90°..90° around the rounded edge
    const half = (depth / 2) * pillowProfile(x / w, y / h);
    const inset = half * (1 - Math.cos(theta));         // pulls the edge in to a half-round
    const onX = Math.abs(x) > w / 2 - eps, onY = Math.abs(y) > h / 2 - eps;
    pos.setXYZ(
      i,
      onX ? Math.sign(x) * (w / 2 - inset) : x,
      onY ? Math.sign(y) * (h / 2 - inset) : y,
      Math.sin(theta) * half
    );
    // side faces show the outermost strip of the cover print
    const nx = nrm.getX(i), ny = nrm.getY(i);
    if (Math.abs(nx) > 0.5) uv.setXY(i, nx > 0 ? 0.997 : 0.003, y / h + 0.5);
    else if (Math.abs(ny) > 0.5) uv.setXY(i, x / w + 0.5, ny > 0 ? 0.997 : 0.003);
    side[i] = Math.abs(nx) > 0.5 || Math.abs(ny) > 0.5 ? 1 : 0;
  }
  g.computeVertexNormals();
  // The rounded edge keeps its shape, but is shaded mostly like the face it belongs to:
  // a hard turn to the side would light it darker than the cover and draw a dark outline.
  const n = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    if (!side[i]) continue;
    n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i)).multiplyScalar(0.35);
    n.z += 0.65; // both halves: a front-lit edge never goes dark against the background
    n.normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

function flattenNormals(g, k) {
  const nrm = g.attributes.normal;
  const n = new THREE.Vector3();
  for (let i = 0; i < nrm.count; i++) {
    n.set(nrm.getX(i), nrm.getY(i), nrm.getZ(i));
    if (Math.abs(n.z) < 0.5) continue; // front and back faces only
    n.x *= 1 - k; n.y *= 1 - k;
    n.normalize();
    nrm.setXYZ(i, n.x, n.y, n.z);
  }
  return g;
}

// ============================================================
//  Public API
// ============================================================
export function createShared(renderer) {
  return {
    env: makeEnvironment(renderer),
    paper: paperBump(),
    // crease texture for the reflections
    wraps: [3, 11].map((seed) => wrapNormal(1024, seed)),
    // rounded edges catch a soft line of light, which is most of what makes it read as an object
    sleeveGeo: pillowBox(SLEEVE, SLEEVE, SLEEVE_DEPTH),
    // the wrap hugs the same shape, a hair bigger: plastic pulled tight over the edges
    wrapGeo: pillowBox(SLEEVE + 0.005, SLEEVE + 0.005, SLEEVE_DEPTH + 0.005),
    // the same wrap for the reflections, but read as almost flat: highlights run as straight
    // streaks broken up by the creases, instead of bending round the disc's dome
    shineGeo: flattenNormals(pillowBox(SLEEVE + 0.005, SLEEVE + 0.005, SLEEVE_DEPTH + 0.005), 0.9),
  };
}

// One record: a sealed sleeve. Returns a group centred on it.
// The sleeve takes almost no light from the studio map, so in the dark it stays dark
// and only the spotlight brings it out; the wrap keeps the reflections.
export function buildRecord(rel, shared, index) {
  const tint = averageColor(rel.image);

  const paper = {
    roughness: 0.6,
    bumpMap: shared.paper,
    bumpScale: 0.45,
    specularIntensity: 0.12, // a matte print: no grey sheen over dark areas
    envMapIntensity: 0,      // the print takes no colour from the studio lights: blacks stay black, whites stay white
  };
  const front = new THREE.MeshPhysicalMaterial({ map: canvasTexture(frontCanvas(rel.image)), ...paper });
  const back = new THREE.MeshPhysicalMaterial({ map: canvasTexture(backCanvas(rel, tint)), ...paper, roughness: 0.7 });
  // box faces: +x, -x, +y, -y (the rounded edges, cover print wrapped round), +z (front), -z (back)
  // the edges: the same print, without the paper bump (stretched across the thin edge it would shade dark)
  const edge = front.clone();
  edge.bumpMap = null;
  const sleeve = new THREE.Mesh(shared.sleeveGeo, [edge, edge, edge, edge, front, back]);
  sleeve.castShadow = true;
  sleeve.receiveShadow = true;

  const maps = shared.wraps[index % shared.wraps.length];
  const variant = (tex) => {
    const t = tex.clone();
    t.needsUpdate = true;
    t.center.set(0.5, 0.5);
    t.rotation = (index % 4) * (Math.PI / 2);
    return t;
  };
  // Layer 1: the creases. Clear on flat areas; only folds and the very edge catch a
  // little light and whiten, which is what makes the plastic read.
  const hazeMat = new THREE.MeshStandardMaterial({
    color: 0xf2f2f2,
    roughness: 0.55,
    metalness: 0,
    alphaMap: variant(maps.haze),
    normalMap: variant(maps.normal),
    normalScale: new THREE.Vector2(0.3, 0.3),
    envMapIntensity: 0.04,   // milky white from the lamps; the pink studio strips only show in the glossy reflections
    transparent: true,
    depthWrite: false,
  });
  const haze = new THREE.Mesh(shared.wrapGeo, hazeMat);
  haze.renderOrder = 1;
  // ...and the fold valleys catch a little shadow, so creases read on light covers too
  const shadeMat = new THREE.MeshBasicMaterial({
    color: 0x1a1a1f,
    alphaMap: variant(maps.shade),
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  });
  // only on the front and back: on the thin edges, seen side-on, the crease shading would
  // blur into a dark line round the record
  const none = new THREE.MeshBasicMaterial({ visible: false });
  const shadeMesh = new THREE.Mesh(shared.wrapGeo, [none, none, none, none, shadeMat, shadeMat]);
  shadeMesh.renderOrder = 1;


  // Layer 2: reflections only, added on top so the artwork shows through untouched. The plastic stays clear;
  // the narrow pink studio strips make pink holo flares that sweep across as the record turns. No thin-film: no rainbow.
  const shineMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.045,
    ior: 1.5,
    specularIntensity: 1,
    normalMap: variant(maps.normal),
    normalScale: new THREE.Vector2(0.55, 0.55), // creases break the reflections into glints
    envMapIntensity: 1.1,
    transparent: true,
    // adds light, and never touches the canvas's transparency: plain additive blending would make
    // the plastic's rim that sticks out past the sleeve opaque black, drawing an outline round the record
    blending: THREE.CustomBlending,
    blendEquation: THREE.AddEquation,
    blendSrc: THREE.SrcAlphaFactor,
    blendDst: THREE.OneFactor,
    blendSrcAlpha: THREE.ZeroFactor,
    blendDstAlpha: THREE.OneFactor,
    depthWrite: false,
  });
  // The wrap only ever shows the soft strip reflections from the studio map, never a hot
  // spot from the lamps: drop the lamps' direct contribution in its shader.
  shineMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <lights_fragment_end>",
      "#include <lights_fragment_end>\n  reflectedLight.directSpecular = vec3(0.0);\n  reflectedLight.directDiffuse = vec3(0.0);"
    );
  };
  const shine = new THREE.Mesh(shared.shineGeo, shineMat);
  shine.renderOrder = 2;

  const group = new THREE.Group();
  group.add(sleeve, shadeMesh, haze, shine);
  for (const m of [sleeve, haze, shine]) m.userData.index = index;
  return { group, pickables: [sleeve], materials: { front, hazeMat, shineMat } };
}
