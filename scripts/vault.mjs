#!/usr/bin/env node
// The vault behind ACCESS: seals the private page and everything on it, so the site only ever
// serves ciphertext. Needs Node 18 or newer. Nothing here (or anywhere in the repo) contains the
// password or the private content in readable form.
//
//   node scripts/vault.mjs add <folder>   add a plugin, or replace one with the same id
//   node scripts/vault.mjs remove <id>    take a plugin out (its files are deleted from vault/)
//   node scripts/vault.mjs list           what's inside
//   node scripts/vault.mjs export-page <dir>   write the sealed page design (hub.js, hub.css) out to edit
//   node scripts/vault.mjs page <dir>          seal an edited page design back in
//   node scripts/vault.mjs passwd         change the password
//   node scripts/vault.mjs font <file>    the typeface for the page's headline
//
// The password is asked for (hidden), or taken from VAULT_PASSWORD. For passwd, the new one from
// VAULT_NEW_PASSWORD. Upper/lower case and surrounding spaces don't matter.
//
// A plugin folder (keep it OUTSIDE the repo, it's the readable original) holds plugin.json and the
// files it names:
//   {
//     "id": "name-in-lowercase", "name": "NAME", "script": "optional second spelling", "scriptLang": "",
//     "accent": "#rrggbb", "lamp": "#rrggbb", "font": "optional-typeface-for-the-name.ttf",
//     "summary": "one line", "version": "v1",
//     "about": ["paragraph", "paragraph"],
//     "install": ["step", "step"],
//     "controls": [["Control", "what it does"]],
//     "specs": [["Label", "value"]],
//     "shots": [{ "file": "panel.jpg", "caption": "..." }],
//     "downloads": [{ "file": "file.zip", "label": "Download", "meta": "short note" }]
//   }
//
// How it's sealed: vault/hub.bin = "R4NV" | version | PBKDF2 rounds | salt | iv | AES-256-GCM(JSON),
// with the key derived from the password (PBKDF2-SHA-256). Every file is encrypted on its own with a
// random key, stored as vault/<random>.bin; those keys live only inside the sealed hub.bin.
import { webcrypto } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import { fileURLToPath } from "node:url";

const subtle = webcrypto.subtle;
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const VAULT = path.join(ROOT, "vault");
const HUB = path.join(VAULT, "hub.bin");
const MAGIC = Buffer.from("R4NV");
const ROUNDS = 1_200_000; // each guess costs this many hashing rounds
const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".zip": "application/zip", ".exe": "application/vnd.microsoft.portable-executable", ".dmg": "application/x-apple-diskimage",
  ".pkg": "application/octet-stream", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

const normalize = (pw) => pw.normalize("NFKC").trim().toLowerCase();
const rand = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const hex = (b) => Buffer.from(b).toString("hex");

async function passwordKey(pw, salt, rounds, usage) {
  const base = await subtle.importKey("raw", new TextEncoder().encode(normalize(pw)), "PBKDF2", false, ["deriveKey"]);
  return subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt, iterations: rounds }, base, { name: "AES-GCM", length: 256 }, false, [usage]);
}

async function openHub(pw) {
  const buf = fs.readFileSync(HUB);
  if (!buf.subarray(0, 4).equals(MAGIC)) throw new Error("vault/hub.bin is not a vault");
  const rounds = buf.readUInt32BE(5);
  const salt = buf.subarray(9, 25), iv = buf.subarray(25, 37), data = buf.subarray(37);
  const key = await passwordKey(pw, salt, rounds, "decrypt");
  try {
    return JSON.parse(new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv }, key, data)));
  } catch {
    throw new Error("Wrong password.");
  }
}

// The page design lives only inside the vault too (nothing about it is readable in the repo).
// Export it to a folder outside the repo to edit it, then seal it back in with "page".
function readPage(dir) {
  const folder = path.resolve(dir);
  return {
    css: fs.readFileSync(path.join(folder, "hub.css"), "utf8"),
    js: fs.readFileSync(path.join(folder, "hub.js"), "utf8"),
  };
}

async function sealHub(pw, payload) {
  if (!payload.page) throw new Error("No page design yet: run  node scripts/vault.mjs page <dir>  first.");
  const salt = rand(16), iv = rand(12);
  const key = await passwordKey(pw, salt, ROUNDS, "encrypt");
  const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(JSON.stringify(payload))));
  const head = Buffer.alloc(9);
  MAGIC.copy(head, 0);
  head.writeUInt8(1, 4);
  head.writeUInt32BE(ROUNDS, 5);
  fs.mkdirSync(VAULT, { recursive: true });
  fs.writeFileSync(HUB, Buffer.concat([head, salt, iv, data]));
}

async function sealFile(file) {
  const plain = fs.readFileSync(file);
  const raw = rand(32), iv = rand(12);
  const key = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  const id = hex(rand(12));
  fs.writeFileSync(path.join(VAULT, `${id}.bin`), Buffer.concat([iv, data]));
  return [id, {
    key: Buffer.from(raw).toString("base64"),
    type: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
    size: plain.length,
    name: path.basename(file),
  }];
}

const filesOf = (p) => [p.font, ...(p.shots || []).map((s) => s.file), ...(p.downloads || []).map((d) => d.file)].filter(Boolean);
function dropFiles(payload, p) {
  for (const id of filesOf(p)) {
    delete payload.files[id];
    fs.rmSync(path.join(VAULT, `${id}.bin`), { force: true });
  }
}
const size = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1e3))} KB`);

function imageSize(file) {
  const b = fs.readFileSync(file);
  if (b.subarray(1, 4).toString() === "PNG") return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  if (b[0] === 0xff && b[1] === 0xd8) {
    for (let i = 2; i < b.length;) {
      if (b[i] !== 0xff) { i++; continue; }
      const m = b[i + 1];
      if (m >= 0xc0 && m <= 0xcf && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) return { h: b.readUInt16BE(i + 5), w: b.readUInt16BE(i + 7) };
      i += 2 + b.readUInt16BE(i + 2);
    }
  }
  return {};
}

// ---------------------------------------------------------------- password input
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? question : "");
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}
async function currentPassword() {
  return process.env.VAULT_PASSWORD ?? (await ask("Password: ", true));
}
async function newPassword() {
  if (process.env.VAULT_NEW_PASSWORD) return process.env.VAULT_NEW_PASSWORD;
  const a = await ask("New password: ", true);
  const b = await ask("Again: ", true);
  if (a !== b) throw new Error("The two don't match.");
  if (normalize(a).length < 12) throw new Error("Use at least 12 characters (a few random words works well).");
  return a;
}

// ---------------------------------------------------------------- commands
const [cmd, arg] = process.argv.slice(2);
try {
  if (cmd === "add") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs add <folder>");
    const folder = path.resolve(arg);
    if (folder.startsWith(ROOT + path.sep)) throw new Error("Keep the readable plugin folder outside the repo, so it never gets committed.");
    const plugin = JSON.parse(fs.readFileSync(path.join(folder, "plugin.json"), "utf8"));
    if (!plugin.id || !plugin.name) throw new Error("plugin.json needs at least an id and a name.");
    let pw, payload;
    if (fs.existsSync(HUB)) { pw = await currentPassword(); payload = await openHub(pw); }
    else {
      if (!process.env.VAULT_PAGE_DIR) throw new Error("No vault yet. Set VAULT_PAGE_DIR to a folder with hub.js and hub.css for the page design.");
      console.log("No vault yet: choose its password.");
      pw = await newPassword();
      payload = { v: 1, page: readPage(process.env.VAULT_PAGE_DIR), data: { plugins: [] }, files: {} };
    }
    const old = payload.data.plugins.find((p) => p.id === plugin.id);
    if (old) dropFiles(payload, old);
    fs.mkdirSync(VAULT, { recursive: true });
    const seal = async (name) => {
      const [id, meta] = await sealFile(path.join(folder, name));
      payload.files[id] = meta;
      return [id, meta];
    };
    if (plugin.font) plugin.font = (await seal(plugin.font))[0];
    for (const s of plugin.shots || []) Object.assign(s, imageSize(path.join(folder, s.file)), { file: (await seal(s.file))[0] });
    for (const d of plugin.downloads || []) {
      const [id, meta] = await seal(d.file);
      Object.assign(d, { file: id, filename: d.filename || meta.name, meta: [d.meta, size(meta.size)].filter(Boolean).join(", ") });
    }
    if (old) payload.data.plugins[payload.data.plugins.indexOf(old)] = plugin;
    else payload.data.plugins.push(plugin);
    await sealHub(pw, payload);
    console.log(`${old ? "Replaced" : "Added"} ${plugin.name}. Commit the vault/ folder to publish it.`);
  } else if (cmd === "remove") {
    const pw = await currentPassword();
    const payload = await openHub(pw);
    const p = payload.data.plugins.find((x) => x.id === arg);
    if (!p) throw new Error(`No plugin with id "${arg}".`);
    dropFiles(payload, p);
    payload.data.plugins = payload.data.plugins.filter((x) => x !== p);
    await sealHub(pw, payload);
    console.log(`Removed ${p.name}.`);
  } else if (cmd === "list") {
    const payload = await openHub(await currentPassword());
    for (const p of payload.data.plugins) console.log(`${p.id}\t${p.name}\t${p.version || ""}\t${filesOf(p).length} file(s)`);
  } else if (cmd === "page") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs page <folder with hub.js and hub.css>");
    const pw = await currentPassword();
    const payload = await openHub(pw);
    payload.page = readPage(arg);
    await sealHub(pw, payload);
    console.log("Sealed the page design.");
  } else if (cmd === "export-page") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs export-page <folder>");
    const folder = path.resolve(arg);
    if (folder.startsWith(ROOT + path.sep)) throw new Error("Export it outside the repo, so it never gets committed.");
    const payload = await openHub(await currentPassword());
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "hub.js"), payload.page.js);
    fs.writeFileSync(path.join(folder, "hub.css"), payload.page.css);
    console.log(`Page design written to ${folder}`);
  } else if (cmd === "font") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs font <file.ttf>");
    const pw = await currentPassword();
    const payload = await openHub(pw);
    if (payload.data.titleFont) dropFiles(payload, { font: payload.data.titleFont });
    const [id, meta] = await sealFile(path.resolve(arg));
    payload.files[id] = meta;
    payload.data.titleFont = id;
    await sealHub(pw, payload);
    console.log("Headline typeface sealed.");
  } else if (cmd === "passwd") {
    const payload = await openHub(await currentPassword());
    await sealHub(await newPassword(), payload);
    console.log("Password changed. Files keep their own keys, so nothing else needed re-encrypting.");
  } else {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 9).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
