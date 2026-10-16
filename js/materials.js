// Everything that makes a record look like a real object:
// studio lighting for reflections, a cardboard sleeve with paper grain and ring wear,
// and clear, holo-tinted shrink-wrap sealing it.
// All textures are generated here, so a new release only needs its cover art.
import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Real proportions: a 12" sleeve is 31.4 cm square, the disc inside 30 cm.
export const SLEEVE = 1;
export const SLEEVE_DEPTH = 0.016; // a touch thicker than real so the edges read in 3D
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
  // Only thin strip lights: they reflect as fine streaks that the creases break up into
  // glints, instead of big shapes where you can see the light itself.
  panel(0.12, 16, 4.5, "#ffffff", [-7, 2, 12]);   // thin vertical strip, front left
  panel(0.09, 16, 3.5, "#ffffff", [8, -1, 11]);   // thin vertical strip, front right
  panel(18, 0.08, 2.5, "#ffffff", [0, 9, 12]);    // thin horizontal strip, above
  panel(0.06, 10, 2.0, "#ffffff", [2, 4, 14]);    // a fine line near the middle
  panel(12, 0.6, 0.8, "#c03fbd", [0, 11, -7]);    // faint magenta rim from behind

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
    const names = (c2.people || []).map((p) => (typeof p === "string" ? p : p.name)).join(", ");
    if (!c2.role || !names) continue;
    g.fillText(`${String(c2.role).toUpperCase()}: ${names}`.slice(0, 60), 70, y);
    y += 40;
  }
  g.fillText(`℗ ${rel.date ? rel.date.slice(0, 4) + " " : ""}R4N`, 70, S - 80);
  g.fillText("33⅓ RPM", S - 230, S - 80);
  return c;
}

function spineCanvas(rel, tint) {
  const c = makeCanvas(64, 2048);
  const g = c.getContext("2d");
  g.fillStyle = `#${tint.clone().multiplyScalar(0.55).getHexString(THREE.SRGBColorSpace)}`;
  g.fillRect(0, 0, 64, 2048);
  g.save();
  g.translate(32, 1024);
  g.rotate(-Math.PI / 2);
  g.fillStyle = "rgba(240,240,235,0.85)";
  g.font = "500 30px ui-monospace, Menlo, monospace";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillText(`${(rel.artist || "R4N").toUpperCase()}   —   ${rel.title.toUpperCase()}`, 0, 0);
  g.restore();
  return c;
}

// ============================================================
//  Clean wrap: no creases, just a gentle curve (plastic pulled taut over the
//  sleeve bulges slightly), plus a smooth thickness map for the holo shimmer.
// ============================================================
function cleanWrapMaps(S = 512, seed = 5) {
  const rnd = mulberry32(seed);
  const h = new Float32Array(S * S);
  const film = new Uint8Array(S * S * 4);
  const waves = Array.from({ length: 4 }, () => [rnd() * 6 + 2, rnd() * 6 + 2, rnd() * 6.28]);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const u = x / (S - 1), v = y / (S - 1), i = y * S + x;
      h[i] = 0.5 * Math.sin(Math.PI * u) * Math.sin(Math.PI * v);
      let f = 0.5;
      for (const [a, b, p] of waves) f += 0.12 * Math.sin(u * a + v * b + p);
      film[i * 4] = film[i * 4 + 1] = film[i * 4 + 2] = Math.max(0, Math.min(1, f)) * 255;
      film[i * 4 + 3] = 255;
    }
  }
  return { normal: dataTexture(heightToNormal(h, S, 2.2), S), film: dataTexture(film, S) };
}

// ============================================================
//  Public API
// ============================================================
export function createShared(renderer) {
  return {
    env: makeEnvironment(renderer),
    paper: paperBump(),
    wraps: [cleanWrapMaps(512, 5), cleanWrapMaps(512, 9)],
    // softly rounded edges catch a line of light, which is most of what makes it read as an object
    sleeveGeo: new RoundedBoxGeometry(SLEEVE, SLEEVE, SLEEVE_DEPTH, 3, 0.0045),
    // the wrap is a little bigger and rounder: plastic pulled over the edges
    wrapGeo: new RoundedBoxGeometry(SLEEVE + 0.01, SLEEVE + 0.01, SLEEVE_DEPTH + 0.008, 4, 0.011),
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
    sheen: 0.3,
    sheenRoughness: 0.7,
    sheenColor: new THREE.Color(0xffffff),
    envMapIntensity: 0.18,
  };
  const front = new THREE.MeshPhysicalMaterial({ map: canvasTexture(frontCanvas(rel.image)), ...paper });
  const back = new THREE.MeshPhysicalMaterial({ map: canvasTexture(backCanvas(rel, tint)), ...paper, roughness: 0.7 });
  const spine = new THREE.MeshPhysicalMaterial({ map: canvasTexture(spineCanvas(rel, tint)), roughness: 0.65, envMapIntensity: 0.18 });
  const edge = new THREE.MeshPhysicalMaterial({ color: tint.clone().multiplyScalar(0.6), roughness: 0.7, envMapIntensity: 0.18 });
  // box faces: +x (open side), -x (spine), +y, -y, +z (front), -z (back)
  const sleeve = new THREE.Mesh(shared.sleeveGeo, [edge, spine, edge, edge, front, back]);
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
  // The wrap: fully clear, no colour of its own, only reflections added on top so the
  // artwork shows through untouched. A thin-film (iridescent) coating gives the
  // reflections a holo-foil colour shift as the record turns.
  const shineMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000,
    metalness: 0,
    roughness: 0.03,
    ior: 1.5,
    specularIntensity: 1,
    iridescence: 1,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 620],
    iridescenceThicknessMap: variant(maps.film),
    normalMap: variant(maps.normal),
    normalScale: new THREE.Vector2(0.4, 0.4),
    envMapIntensity: 1.0,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const shine = new THREE.Mesh(shared.wrapGeo, shineMat);
  shine.renderOrder = 2;

  const group = new THREE.Group();
  group.add(sleeve, shine);
  for (const m of [sleeve, shine]) m.userData.index = index;
  return { group, pickables: [sleeve], materials: { front, shineMat } };
}
