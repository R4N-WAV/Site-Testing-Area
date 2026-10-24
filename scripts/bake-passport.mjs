// Draws the passport cover's textures once and saves them as images in assets/passport/, so the
// booking page doesn't have to draw them (the slowest part) on every visit. Run it again after
// changing the cover art in js/passport-art.js:
//
//   npm i -g playwright && npx playwright install chromium   (once)
//   node scripts/bake-passport.mjs
//
// It opens the site's own code in a headless browser and saves what coverArt() draws.
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = await import("/opt/node22/lib/node_modules/playwright/index.mjs")); }

const TYPES = { ".js": "text/javascript", ".woff2": "font/woff2", ".html": "text/html" };
const browser = await chromium.launch();
const page = await browser.newPage();
await page.route("http://bake.local/**", async (route) => {
  const rel = decodeURIComponent(new URL(route.request().url()).pathname).replace(/^\/+/, "");
  if (!rel) return route.fulfill({ body: "<!doctype html><meta charset=utf-8>", contentType: "text/html" });
  try { route.fulfill({ body: await readFile(path.join(root, rel)), contentType: TYPES[path.extname(rel)] || "application/octet-stream" }); }
  catch { route.fulfill({ status: 404 }); }
});
await page.goto("http://bake.local/");
const maps = await page.evaluate(async () => {
  await Promise.all(["600", "700"].map((w) => new FontFace("Cinzel", `url(/assets/fonts/cinzel-latin-${w}-normal.woff2)`, { weight: w }).load().then((f) => document.fonts.add(f))));
  const { coverArt } = await import("/js/passport-art.js");
  const art = await coverArt(1.25 / 0.88);
  // colour a little compressed; the surface maps (relief, finish) almost not at all
  const q = { map: 0.9, backMap: 0.9, finish: 0.9, normal: 0.82, backNormal: 0.82 };
  return Object.fromEntries(Object.entries(art).map(([k, c]) => [k, c.toDataURL("image/webp", q[k])]));
});
for (const [k, url] of Object.entries(maps)) {
  const file = path.join(root, "assets/passport", `cover-${k}.webp`);
  await writeFile(file, Buffer.from(url.split(",")[1], "base64"));
  console.log(path.relative(root, file));
}
await browser.close();
