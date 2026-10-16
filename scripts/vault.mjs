#!/usr/bin/env node
// The vault behind ACCESS: seals the private page and everything on it, so the site only ever
// serves ciphertext. Needs Node 18 or newer. Nothing here (or anywhere in the repo) contains the
// password or the private content in readable form.
//
//   node scripts/vault.mjs list                what's inside
//   node scripts/vault.mjs add <folder>        add an entry, or replace the one with the same id
//   node scripts/vault.mjs remove <id>         take an entry out (its files are deleted from vault/)
//   node scripts/vault.mjs export-page <dir>   write the sealed page design (hub.js, hub.css) out to edit
//   node scripts/vault.mjs page <dir>          seal an edited page design back in
//   node scripts/vault.mjs font <file>         the typeface for the page's headline
//   node scripts/vault.mjs passwd              change the password (every file also gets a new key)
//   node scripts/vault.mjs rekey               give every file a new key, keeping the password
//
// The password is asked for (hidden), or taken from VAULT_PASSWORD. For passwd, the new one from
// VAULT_NEW_PASSWORD. Upper/lower case and surrounding spaces don't matter.
//
// An entry is a folder (keep it OUTSIDE the repo: it's the readable original) with entry.json and
// the files it names. Which fields the page shows is up to the page design; files are named in
// "font", "shots": [{ "file" }] and "downloads": [{ "file", "filename"?, "meta"? }]. Example:
//   { "id": "lowercase-id", "name": "NAME", "font": "name.ttf",
//     "shots": [{ "file": "a.jpg", "caption": "..." }],
//     "downloads": [{ "file": "b.zip", "label": "Download", "meta": "short note" }] }
//
// How it's sealed: vault/hub.bin = "R4NV" | version | PBKDF2 rounds | salt | iv | AES-256-GCM(JSON),
// with the key derived from the password (PBKDF2-SHA-256). Every file is encrypted on its own with a
// random key, stored as vault/<random>.bin; those keys live only inside the sealed hub.bin.
// Nothing is ever deleted until the new hub.bin is safely written.
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
const ROUNDS = 1_200_000; // each password guess costs this many hashing rounds
const TYPES = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif",
  ".zip": "application/zip", ".exe": "application/vnd.microsoft.portable-executable", ".dmg": "application/x-apple-diskimage",
  ".pkg": "application/octet-stream", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2", ".pdf": "application/pdf",
};

const normalize = (pw) => pw.normalize("NFKC").trim().toLowerCase();
const rand = (n) => webcrypto.getRandomValues(new Uint8Array(n));
const hex = (b) => Buffer.from(b).toString("hex");
const binPath = (id) => path.join(VAULT, `${id}.bin`);
const outsideRepo = (p) => !path.resolve(p).startsWith(ROOT + path.sep);

// ---------------------------------------------------------------- sealing
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
  let payload;
  try {
    payload = JSON.parse(new TextDecoder().decode(await subtle.decrypt({ name: "AES-GCM", iv }, key, data)));
  } catch {
    throw new Error("Wrong password.");
  }
  payload.data.items ||= [];
  return payload;
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
  // written to a temporary file first, then swapped in: a crash never leaves a half-written vault
  fs.writeFileSync(`${HUB}.tmp`, Buffer.concat([head, salt, iv, data]));
  fs.renameSync(`${HUB}.tmp`, HUB);
}

async function encrypt(plain) {
  const raw = rand(32), iv = rand(12), id = hex(rand(12));
  const key = await subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt"]);
  const data = new Uint8Array(await subtle.encrypt({ name: "AES-GCM", iv }, key, plain));
  fs.mkdirSync(VAULT, { recursive: true });
  fs.writeFileSync(binPath(id), Buffer.concat([iv, data]));
  return { id, key: Buffer.from(raw).toString("base64") };
}
async function decrypt(id, meta) {
  const buf = fs.readFileSync(binPath(id));
  const key = await subtle.importKey("raw", Buffer.from(meta.key, "base64"), "AES-GCM", false, ["decrypt"]);
  return new Uint8Array(await subtle.decrypt({ name: "AES-GCM", iv: buf.subarray(0, 12) }, key, buf.subarray(12)));
}
async function sealFile(file) {
  const plain = fs.readFileSync(file);
  const { id, key } = await encrypt(plain);
  return [id, { key, type: TYPES[path.extname(file).toLowerCase()] || "application/octet-stream", size: plain.length, name: path.basename(file) }];
}

// every file id an entry refers to
const filesOf = (e) => [e.font, ...(e.shots || []).map((s) => s.file), ...(e.downloads || []).map((d) => d.file)].filter(Boolean);
const deleteBins = (ids) => ids.forEach((id) => fs.rmSync(binPath(id), { force: true }));

// New keys for every file: returns the ids of the old copies, to delete once the new hub.bin is written.
async function rekeyFiles(payload) {
  const renamed = new Map();
  for (const [oldId, meta] of Object.entries(payload.files)) {
    const { id, key } = await encrypt(await decrypt(oldId, meta));
    renamed.set(oldId, [id, { ...meta, key }]);
  }
  const swap = (id) => renamed.get(id)?.[0] ?? id;
  for (const e of payload.data.items) {
    if (e.font) e.font = swap(e.font);
    for (const s of e.shots || []) s.file = swap(s.file);
    for (const d of e.downloads || []) d.file = swap(d.file);
  }
  if (payload.data.titleFont) payload.data.titleFont = swap(payload.data.titleFont);
  payload.files = Object.fromEntries(renamed.values());
  return [...renamed.keys()];
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
function readPage(dir) {
  return {
    css: fs.readFileSync(path.join(path.resolve(dir), "hub.css"), "utf8"),
    js: fs.readFileSync(path.join(path.resolve(dir), "hub.js"), "utf8"),
  };
}

// ---------------------------------------------------------------- password input
function ask(question, hidden = false) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    if (hidden) rl._writeToOutput = (s) => rl.output.write(s.includes(question) ? question : "");
    rl.question(question, (answer) => { rl.close(); if (hidden) process.stdout.write("\n"); resolve(answer); });
  });
}
const currentPassword = async () => process.env.VAULT_PASSWORD ?? (await ask("Password: ", true));
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
  if (cmd === "list") {
    const payload = await openHub(await currentPassword());
    for (const e of payload.data.items) console.log(`${e.id}\t${e.name}\t${e.version || ""}\t${filesOf(e).length} file(s)`);
    if (!payload.data.items.length) console.log("(empty)");
  } else if (cmd === "add") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs add <folder>");
    const folder = path.resolve(arg);
    if (!outsideRepo(folder)) throw new Error("Keep the readable folder outside the repo, so it never gets committed.");
    const entry = JSON.parse(fs.readFileSync(path.join(folder, "entry.json"), "utf8"));
    if (!entry.id || !entry.name) throw new Error("entry.json needs at least an id and a name.");
    const named = [entry.font, ...(entry.shots || []).map((s) => s.file), ...(entry.downloads || []).map((d) => d.file)].filter(Boolean);
    const missing = named.filter((f) => !fs.existsSync(path.join(folder, f)));
    if (missing.length) throw new Error(`entry.json names files that aren't in the folder: ${missing.join(", ")}`);
    let pw, payload;
    if (fs.existsSync(HUB)) { pw = await currentPassword(); payload = await openHub(pw); }
    else {
      if (!process.env.VAULT_PAGE_DIR) throw new Error("No vault yet. Set VAULT_PAGE_DIR to a folder with hub.js and hub.css for the page design.");
      console.log("No vault yet: choose its password.");
      pw = await newPassword();
      payload = { v: 1, page: readPage(process.env.VAULT_PAGE_DIR), data: { items: [] }, files: {} };
    }
    const old = payload.data.items.find((e) => e.id === entry.id);
    const seal = async (name) => {
      const [id, meta] = await sealFile(path.join(folder, name));
      payload.files[id] = meta;
      return [id, meta];
    };
    if (entry.font) entry.font = (await seal(entry.font))[0];
    for (const s of entry.shots || []) Object.assign(s, imageSize(path.join(folder, s.file)), { file: (await seal(s.file))[0] });
    for (const d of entry.downloads || []) {
      const [id, meta] = await seal(d.file);
      Object.assign(d, { file: id, filename: d.filename || meta.name, meta: [d.meta, size(meta.size)].filter(Boolean).join(", ") });
    }
    const stale = old ? filesOf(old) : [];
    stale.forEach((id) => delete payload.files[id]);
    if (old) payload.data.items[payload.data.items.indexOf(old)] = entry;
    else payload.data.items.push(entry);
    await sealHub(pw, payload);
    deleteBins(stale);
    console.log(`${old ? "Replaced" : "Added"} ${entry.name}. Commit the vault/ folder to publish it.`);
  } else if (cmd === "remove") {
    const pw = await currentPassword();
    const payload = await openHub(pw);
    const e = payload.data.items.find((x) => x.id === arg);
    if (!e) throw new Error(`Nothing with id "${arg}".`);
    const stale = filesOf(e);
    stale.forEach((id) => delete payload.files[id]);
    payload.data.items = payload.data.items.filter((x) => x !== e);
    await sealHub(pw, payload);
    deleteBins(stale);
    console.log(`Removed ${e.name}.`);
  } else if (cmd === "export-page") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs export-page <folder>");
    if (!outsideRepo(arg)) throw new Error("Export it outside the repo, so it never gets committed.");
    const payload = await openHub(await currentPassword());
    const folder = path.resolve(arg);
    fs.mkdirSync(folder, { recursive: true });
    fs.writeFileSync(path.join(folder, "hub.js"), payload.page.js);
    fs.writeFileSync(path.join(folder, "hub.css"), payload.page.css);
    console.log(`Page design written to ${folder}`);
  } else if (cmd === "page") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs page <folder with hub.js and hub.css>");
    const pw = await currentPassword();
    const payload = await openHub(pw);
    payload.page = readPage(arg);
    await sealHub(pw, payload);
    console.log("Sealed the page design.");
  } else if (cmd === "font") {
    if (!arg) throw new Error("Usage: node scripts/vault.mjs font <file.ttf>");
    if (!fs.existsSync(arg)) throw new Error(`No such file: ${arg}`);
    const pw = await currentPassword();
    const payload = await openHub(pw);
    const stale = payload.data.titleFont ? [payload.data.titleFont] : [];
    stale.forEach((id) => delete payload.files[id]);
    const [id, meta] = await sealFile(path.resolve(arg));
    payload.files[id] = meta;
    payload.data.titleFont = id;
    await sealHub(pw, payload);
    deleteBins(stale);
    console.log("Headline typeface sealed.");
  } else if (cmd === "rekey" || cmd === "passwd") {
    const pw = await currentPassword();
    const payload = await openHub(pw);
    const next = cmd === "passwd" ? await newPassword() : pw;
    const stale = await rekeyFiles(payload);
    await sealHub(next, payload);
    deleteBins(stale);
    console.log(cmd === "passwd"
      ? `Password changed, and ${stale.length} file(s) re-encrypted with new keys.`
      : `Re-encrypted ${stale.length} file(s) with new keys.`);
  } else {
    const head = fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1);
    console.log(head.slice(0, head.findIndex((l) => !l.startsWith("//"))).map((l) => l.replace(/^\/\/ ?/, "")).join("\n"));
  }
} catch (err) {
  console.error(err.message);
  process.exit(1);
}
