#!/usr/bin/env node
// Bakes the textures every record shares (paper grain, shrink-wrap creases) into image files in
// assets/tex/, so the site loads them instead of computing them on every visit (seconds on a phone).
// They come out the same every time (fixed seeds), so this only needs re-running if the
// generators below change:  node scripts/bake-textures.mjs
// It writes PNGs, then converts them to (much smaller) WebP with Python's Pillow if it's installed;
// otherwise convert assets/tex/*.png to .webp with any tool (crease maps lossless, paper ~quality 72).
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "assets", "tex");
const DISC_R = 0.477, SLEEVE = 1; // keep in sync with js/materials.js
function smoothstep(a, b, x) {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
}

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
  return bytes;
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
  return { normal: heightToNormal(h, S, 7), haze, shade };
}

// ============================================================
//  Printed surfaces
// ============================================================


// ---------------------------------------------------------------- PNG out (no dependencies)
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
const crc32 = (buf) => { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; };
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
// channels: which of the RGBA bytes to keep (1 = grey, 3 = RGB)
function png(rgba, S, channels) {
  const rows = Buffer.alloc(S * (S * channels + 1));
  for (let y = 0; y < S; y++) {
    rows[y * (S * channels + 1)] = 0;
    for (let x = 0; x < S; x++) for (let c = 0; c < channels; c++) rows[y * (S * channels + 1) + 1 + x * channels + c] = rgba[(y * S + x) * 4 + c];
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(S, 0); ihdr.writeUInt32BE(S, 4); ihdr[8] = 8; ihdr[9] = channels === 1 ? 0 : 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(rows, { level: 9 })), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync(OUT, { recursive: true });
const S = 1024;
fs.writeFileSync(path.join(OUT, "paper.png"), png(paperBump(S), S, 1));
for (const seed of [3, 11]) {
  const w = wrapNormal(S, seed);
  fs.writeFileSync(path.join(OUT, `wrap${seed}-normal.png`), png(w.normal, S, 3));
  fs.writeFileSync(path.join(OUT, `wrap${seed}-haze.png`), png(w.haze, S, 1));
  fs.writeFileSync(path.join(OUT, `wrap${seed}-shade.png`), png(w.shade, S, 1));
}
try {
  execFileSync("python3", ["-c", `
import glob, os
from PIL import Image
for f in glob.glob(os.path.join(${JSON.stringify(OUT)}, "*.png")):
    im = Image.open(f)
    paper = os.path.basename(f).startswith("paper")
    im.save(f[:-4] + ".webp", "WEBP", quality=72 if paper else 100, lossless=not paper, method=6)
    os.remove(f)
`], { stdio: "inherit" });
  console.log("Baked textures into assets/tex/ (WebP)");
} catch {
  console.log("Baked PNGs into assets/tex/. Convert them to .webp (see the note at the top of this file).");
}
