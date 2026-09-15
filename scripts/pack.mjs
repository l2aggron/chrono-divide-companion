/**
 * Build the store package: the extension, and nothing else in this repo.
 *
 *   node scripts/pack.mjs                 # dist/<name>-<version>/ + dist/<name>-<version>.zip
 *   node scripts/pack.mjs --force         # overwrite an existing build of that version
 *   node scripts/pack.mjs --dry           # run every guard, write nothing
 *
 * **The package is an allowlist, not the repo minus some ignores.** The
 * extension's root is the repository's root, so a `zip -r .` here ships the
 * whole working repository — notes, records, generator inputs, everything that
 * is not the extension — into a public store listing. That is a disclosure, not
 * a size problem, and no `.gitignore`-shaped rule catches it, because those
 * files are tracked on purpose. So the build names what goes in and refuses
 * anything it was not asked for.
 *
 * Three guards, each of which fails the build:
 *
 * 1. **Manifest sweep** — every path the manifest names must exist in the
 *    package. A missing icon is accepted by `load unpacked` with a placeholder
 *    and rejected by the store on upload, which is the worst order to find out.
 * 2. **Link sweep** — every local `src`/`href` on the options page must resolve
 *    inside the package. The page is 26 KB of markup that grew a file at a time;
 *    a script tag left pointing at a renamed file is silent until the tab is
 *    opened.
 * 3. **Leak sweep** — the shapes that carry a personal machine out of this
 *    repo, the same list the site build sweeps its output for and for the same
 *    reason. The generated sources here are built from a local game install and
 *    the stored renders are read out of a personal browser profile.
 *
 * The zip is written by hand rather than shelled out to, so that the same input
 * produces the same bytes: entries in sorted order, a fixed timestamp, no
 * directory entries. A rebuilt package that differs is then a real change, which
 * is the property the site build keeps for the same reason.
 */
import { deflateRawSync } from "node:zlib";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, posix, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");

/**
 * What ships. A directory is taken whole — `src/` is the extension and every
 * file in it is reachable from the manifest or the options page, which guard 1
 * and guard 2 between them assert.
 */
const INCLUDE = ["manifest.json", "src", "icons"];

/** Text extensions get the leak sweep; a PNG is scanned as bytes for nothing. */
const TEXT = /\.(js|mjs|json|html|css|txt|md)$/i;

// --- the shipped file list --------------------------------------------------

/** Every file under `entry`, as package-relative posix paths, sorted. */
function collect(entry) {
  const abs = join(root, entry);
  if (!existsSync(abs)) throw new Error(`${entry} is on the include list but not in the repo`);
  if (statSync(abs).isFile()) return [entry.split(/[\\/]/).join("/")];
  const out = [];
  const walk = (dir, prefix) => {
    for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      const rel = posix.join(prefix, e.name);
      if (e.isDirectory()) walk(join(dir, e.name), rel);
      else out.push(rel);
    }
  };
  walk(abs, entry);
  return out;
}

// --- guard 1: the manifest sweep --------------------------------------------

/** Every package-relative path the manifest names, in the order a reader meets them. */
function manifestPaths(manifest) {
  const paths = [];
  const icons = (set) => Object.values(set || {}).forEach((p) => paths.push(p));
  icons(manifest.icons);
  icons(manifest.action?.default_icon);
  if (manifest.action?.default_popup) paths.push(manifest.action.default_popup);
  if (manifest.background?.service_worker) paths.push(manifest.background.service_worker);
  for (const js of manifest.background?.scripts || []) paths.push(js);
  if (manifest.options_ui?.page) paths.push(manifest.options_ui.page);
  for (const cs of manifest.content_scripts || []) {
    for (const js of cs.js || []) paths.push(js);
    for (const css of cs.css || []) paths.push(css);
  }
  for (const war of manifest.web_accessible_resources || []) {
    for (const r of war.resources || []) if (!r.includes("*")) paths.push(r);
  }
  return [...new Set(paths)];
}

// --- guard 2: the link sweep ------------------------------------------------

const REMOTE = /^(?:https?:|mailto:|data:|about:|javascript:|chrome:|#)/i;

/**
 * `src=` and `href=` on every shipped HTML page, resolved against the page's own
 * directory. An absolute reference (`/src/x.js`) is a break in its own right:
 * inside an extension it resolves to the extension root by luck rather than by
 * intent, and it is the shape that stops working when a page moves.
 */
function linkSweep(files, read) {
  const broken = [];
  for (const file of files.filter((f) => f.endsWith(".html"))) {
    const html = read(file);
    for (const m of html.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/gi)) {
      const ref = m[1];
      if (REMOTE.test(ref)) continue;
      if (ref.startsWith("/")) {
        broken.push(`${file}: absolute reference "${ref}"`);
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(file), ref.split("#")[0].split("?")[0]));
      if (!files.includes(target)) broken.push(`${file}: "${ref}" resolves to ${target}, which is not in the package`);
    }
  }
  return broken;
}

// --- guard 3: the leak sweep ------------------------------------------------

/**
 * Kept deliberately identical to the site build's list: the two outputs are
 * published from the same machine and the same profile, and a shape worth
 * catching in one is worth catching in the other. The extension id pattern is
 * there because an unpacked load names one and a copied console line carries it.
 */
const LEAKS = [
  { what: "a Windows user directory", re: /C:[\\/]+Users/i },
  { what: "an AppData path", re: /AppData/i },
  { what: "the operator's user name", re: /(?<![A-Za-z0-9])l2a(?![A-Za-z0-9])/i },
  { what: "an email address", re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/ },
  { what: "a browser-extension id", re: /(?<![a-z])[a-p]{32}(?![a-z])/ },
  { what: "a local install path", re: /[A-Za-z]:\\+Program Files/i },
];

function leakSweep(files, read) {
  const hits = [];
  for (const file of files.filter((f) => TEXT.test(f))) {
    const text = read(file);
    for (const leak of LEAKS) {
      const m = leak.re.exec(text);
      if (!m) continue;
      const at = text.slice(Math.max(0, m.index - 40), m.index + m[0].length + 40).replace(/\s+/g, " ");
      hits.push(`${file}: ${leak.what} — …${at}…`);
    }
  }
  return hits;
}

// --- the zip ----------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/**
 * A stored DOS timestamp of 1980-01-01, because the alternative is the clock:
 * two builds of identical input would differ in every entry header and the
 * question "did anything actually change" would stop having an answer.
 */
const DOS_TIME = 0;
const DOS_DATE = 33; // (1980-1980)<<9 | month 1<<5 | day 1

function zip(entries) {
  const locals = [];
  const central = [];
  let offset = 0;
  for (const { name, data } of entries) {
    const nameBuf = Buffer.from(name, "utf8");
    const deflated = deflateRawSync(data, { level: 9 });
    // A tiny or incompressible file can deflate larger than it started; storing
    // it is both smaller and what every other packer does.
    const stored = deflated.length >= data.length;
    const body = stored ? data : deflated;
    const method = stored ? 0 : 8;
    const crc = crc32(data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, body);

    const dir = Buffer.alloc(46);
    dir.writeUInt32LE(0x02014b50, 0);
    dir.writeUInt16LE(20, 4);
    dir.writeUInt16LE(20, 6);
    dir.writeUInt16LE(0, 8);
    dir.writeUInt16LE(method, 10);
    dir.writeUInt16LE(DOS_TIME, 12);
    dir.writeUInt16LE(DOS_DATE, 14);
    dir.writeUInt32LE(crc, 16);
    dir.writeUInt32LE(body.length, 20);
    dir.writeUInt32LE(data.length, 24);
    dir.writeUInt16LE(nameBuf.length, 28);
    dir.writeUInt32LE(0, 30); // extra length + comment length
    dir.writeUInt16LE(0, 34); // disk number
    dir.writeUInt16LE(0, 36); // internal attributes
    dir.writeUInt32LE(0, 38); // external attributes
    dir.writeUInt32LE(offset, 42);
    central.push(dir, nameBuf);

    offset += local.length + nameBuf.length + body.length;
  }
  const cd = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

// --- the build --------------------------------------------------------------

const force = process.argv.includes("--force");
const dry = process.argv.includes("--dry");

const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));
const slug = manifest.name
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-|-$/g, "");
const stem = `${slug}-${manifest.version}`;
const outDir = join(root, "dist", stem);
const zipPath = join(root, "dist", `${stem}.zip`);

const files = INCLUDE.flatMap(collect);
const bytes = new Map(files.map((f) => [f, readFileSync(join(root, f))]));
const read = (f) => bytes.get(f).toString("utf8");

const missing = manifestPaths(manifest).filter((p) => !files.includes(p));
const broken = linkSweep(files, read);
const leaks = leakSweep(files, read);

const total = [...bytes.values()].reduce((n, b) => n + b.length, 0);
console.log(`${manifest.name} ${manifest.version}`);
console.log(`  files    ${files.length}, ${(total / 1024).toFixed(0)} KB unpacked`);
console.log(`  manifest ${missing.length ? `${missing.length} MISSING` : "every named path is in the package"}`);
console.log(`  links    ${broken.length ? `${broken.length} BROKEN` : "every local reference resolves"}`);
console.log(`  leaks    ${leaks.length ? `${leaks.length} HIT` : "clean"} — ${LEAKS.map((l) => l.what).join(", ")}`);

const failures = [
  missing.length && `manifest sweep: ${missing.length} path(s) named but not packaged\n    ${missing.join("\n    ")}`,
  broken.length && `link sweep: ${broken.length} broken\n    ${broken.join("\n    ")}`,
  leaks.length && `leak sweep: ${leaks.length} hit(s)\n    ${leaks.join("\n    ")}`,
].filter(Boolean);

if (failures.length) {
  console.error(`\nnot packaged:\n  ${failures.join("\n  ")}`);
  process.exit(1);
}

if (dry) {
  console.log("\n--dry: guards pass, nothing written");
  process.exit(0);
}

if (existsSync(zipPath) && !force) {
  console.error(`\n${stem}.zip is already built — bump the version, or pass --force to overwrite it`);
  process.exit(1);
}

rmSync(outDir, { recursive: true, force: true });
for (const file of files) {
  const target = join(outDir, file);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, bytes.get(file));
}
const archive = zip(files.map((name) => ({ name, data: bytes.get(name) })));
writeFileSync(zipPath, archive);

console.log(`\n  dist/${stem}/       load-unpacked tree, exactly what the zip holds`);
console.log(`  dist/${stem}.zip   ${(archive.length / 1024).toFixed(0)} KB — upload this`);
