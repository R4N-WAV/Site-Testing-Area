// Scans releases/ and writes releases/index.json (the list of folders the site loads).
// Run locally with: node scripts/build-releases.mjs
// On GitHub this runs automatically (.github/workflows/releases.yml).
import { readdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const dir = "releases";
const releases = [];
const problems = [];

for (const name of readdirSync(dir, { withFileTypes: true })) {
  if (!name.isDirectory() || name.name.startsWith("_") || name.name.startsWith(".")) continue;
  const infoPath = join(dir, name.name, "info.json");
  if (!existsSync(infoPath)) { problems.push(`${name.name}: missing info.json`); continue; }
  try {
    JSON.parse(readFileSync(infoPath, "utf8"));
    releases.push(name.name);
  } catch (e) {
    problems.push(`${name.name}: info.json is not valid JSON (${e.message})`);
  }
}

releases.sort();
writeFileSync(join(dir, "index.json"), JSON.stringify({ releases }, null, 2) + "\n");
console.log(`releases/index.json: ${releases.length} release(s): ${releases.join(", ")}`);
// Problems are shown as warnings in the GitHub Actions log; the valid releases still go live.
for (const p of problems) console.log(`::warning::${p}`);
