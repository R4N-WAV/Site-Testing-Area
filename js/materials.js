// Everything that makes a record look like a real object:
// studio lighting for reflections, a cardboard sleeve with paper grain and ring wear,
// and clear, creased shrink-wrap with a pink holo sheen sealing it.
// The shared textures are baked once (scripts/bake-textures.mjs); a new release only needs its cover art.
import * as THREE from "three";

// Real proportions: a 12" sleeve is 31.4 cm square, the disc inside 30 cm.
export const SLEEVE = 1;
export const SLEEVE_DEPTH = 0.04; // thickness at the middle, where the disc is; the board is about a third of that

// ---------- small helpers ----------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
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
//  Printed surfaces
// ============================================================
function frontCanvas(image) {
  const iw0 = image.naturalWidth || image.width;
  const S = iw0 >= 700 ? 1024 : 512; // small covers don't gain anything from a bigger texture
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
// The textures every record shares (paper grain, shrink-wrap creases) are baked into assets/tex/
// by scripts/bake-textures.mjs. Loaded once, in parallel with everything else.
const TEX = "assets/tex/";
function loadTexture(file) {
  return new Promise((resolve, reject) => {
    new THREE.TextureLoader().load(TEX + file, (t) => {
      t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
      t.flipY = false; // the files are stored bottom row first, as the generators lay them out
      t.anisotropy = 8;
      resolve(t);
    }, undefined, reject);
  });
}
export const TEXTURE_COUNT = 7;
export async function loadSharedTextures(onEach = () => {}) {
  const one = (f) => loadTexture(f).then((t) => { onEach(); return t; });
  const [paper, ...rest] = await Promise.all([
    "paper.webp",
    "wrap3-normal.webp", "wrap3-haze.webp", "wrap3-shade.webp",
    "wrap11-normal.webp", "wrap11-haze.webp", "wrap11-shade.webp",
  ].map(one));
  return { paper, wraps: [0, 3].map((k) => ({ normal: rest[k], haze: rest[k + 1], shade: rest[k + 2] })) };
}

export function createShared(renderer, textures) {
  return {
    env: makeEnvironment(renderer),
    paper: textures.paper,
    // crease texture for the reflections
    wraps: textures.wraps,
    // the back of a sleeve can never come into view (the tilt is capped), so all records share a plain one
    back: new THREE.MeshBasicMaterial({ color: 0x1a1a1c }),
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
  const paper = {
    roughness: 0.6,
    bumpMap: shared.paper,
    bumpScale: 0.45,
    specularIntensity: 0.12, // a matte print: no grey sheen over dark areas
    envMapIntensity: 0,      // the print takes no colour from the studio lights: blacks stay black, whites stay white
  };
  const front = new THREE.MeshPhysicalMaterial({ map: canvasTexture(frontCanvas(rel.image)), ...paper });
  // box faces: +x, -x, +y, -y (the rounded edges, cover print wrapped round), +z (front), -z (back)
  // the edges: the same print, without the paper bump (stretched across the thin edge it would shade dark)
  const edge = front.clone();
  edge.bumpScale = 0; // (bump switched off, not removed: same shader as the front, one less to prepare)
  const sleeve = new THREE.Mesh(shared.sleeveGeo, [edge, edge, edge, edge, front, shared.back]);
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
