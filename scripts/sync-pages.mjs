#!/usr/bin/env node
// booking/index.html is the same page as index.html (the site switches to the booking page by
// itself when opened at /booking/), with <base href="../"> so every path still points at the
// site's root. Run this after every change to index.html:  node scripts/sync-pages.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const marker = '<meta charset="utf-8" />';
if (!src.includes(marker)) throw new Error("index.html: no charset meta to put <base> after");
const out = src
  .replace(marker, `${marker}\n  <!-- generated from index.html by scripts/sync-pages.mjs: edit index.html, not this -->\n  <base href="../" />`)
  .replace("<title>R4N</title>", "<title>Booking — R4N</title>");
fs.mkdirSync(path.join(ROOT, "booking"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "booking", "index.html"), out);
console.log("booking/index.html written");
