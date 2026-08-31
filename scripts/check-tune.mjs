/**
 * The map render's appearance table, exercised without a browser.
 *
 *   node scripts/check-tune.mjs
 *
 * The table is edited on the options page, mirrored by an in-game panel, baked
 * into a palette LUT by the renderer and applied as a canvas filter by the
 * radar. Four consumers, two of them applying the *same dial by different
 * arithmetic* — which is the whole reason src/render-tune.js exists and the
 * whole reason this file does.
 *
 * What is worth checking:
 *
 *   - **the type list against the renderer's own**, because a dial for a type
 *     the render does not have is a slider that does nothing, and a type with
 *     no dial is a hole nobody notices. Same cross-file text read as
 *     scripts/check-align-dials.mjs, for the same reason;
 *   - **that both mechanisms come off one function** — the LUT bake and the
 *     filter string must both be derived from `channel`/`dialsFor`, or they
 *     drift and the radar and the preview disagree about the same map;
 *   - **that the default is the identity**, because a fresh install must render
 *     exactly what it rendered before the dials existed. If this fails, every
 *     stored render in the catalogue goes stale on upgrade;
 *   - **that the stamp is stable**, because it decides staleness and a stamp
 *     that depends on object key order would re-render the pool at random.
 *
 * What is NOT checked here is whether a browser's own `brightness()` and
 * `contrast()` produce the same pixels as `channel()` does. That is the one
 * claim this file cannot reach — it needs a canvas — and it is recorded as the
 * live A/B in the task doc.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

const context = vm.createContext({ console });
context.window = context;
vm.runInContext(readFileSync(join(src, "render-tune.js"), "utf8"), context);
const T = context.__cdcTune;

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " — " + detail}`);

// --- the type list against the renderer's own --------------------------------
//
// SPRITE_FIX is the renderer's list of movable sprite passes. Every one of them
// is something a person can point at on a map and want darker, so every one of
// them needs a dial. `base` and `airport` are the two that are not in it: base
// is the terrain those passes are drawn onto (fixed, so it has no offset but it
// does have a colour), and airport was split out of building for its own offset.

const hq = readFileSync(join(src, "hq-preview.js"), "utf8");
// No literal newline in the pattern: this file is written with LF and the repo
// checks out CRLF, so a `\n` here would match only in the tree it was authored
// in. The entries end in `},` and the block in `};`, so a non-greedy run to the
// first `};` is both newline-agnostic and exact.
const fixBlock = /const SPRITE_FIX\s*=\s*\{([\s\S]*?)\};/.exec(hq);
const spriteTypes = [...(fixBlock ? fixBlock[1] : "").matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
const tuneKeys = T.TUNE_TYPES.map((t) => t.key);

check("the renderer's sprite types were found", spriteTypes.length > 0, spriteTypes.join(", "));
check(
  "every sprite type has a dial",
  spriteTypes.every((t) => tuneKeys.includes(t)),
  spriteTypes.filter((t) => !tuneKeys.includes(t)).join(", ") || "all present"
);
check(
  "every dial is a sprite type, base or airport",
  tuneKeys.every((k) => spriteTypes.includes(k) || k === "base" || k === "airport"),
  tuneKeys.filter((k) => !spriteTypes.includes(k) && k !== "base" && k !== "airport").join(", ") || "all accounted for"
);
check("every dial carries a label", T.TUNE_TYPES.every((t) => typeof t.label === "string" && t.label.length > 0));
check("the defaults cover every dial", tuneKeys.every((k) => T.DEFAULT_TUNE.types[k]));

// --- the renderer actually consults the table --------------------------------
//
// The bake happens deep inside the render, in a palette LUT this file cannot
// reach without a canvas and a theater. What it can reach is the wiring, and
// the wiring is where the plausible regression lives: a dial added to the table
// and never passed to a pass renders nothing different and fails nothing, which
// is the same silent shape check-align-dials.mjs was written for.

check(
  "lutFor bakes the table rather than ignoring it",
  /function lutFor\([^)]*lookType[^)]*\)/.test(hq) && /__cdcTune\.tuneLut\(/.test(hq),
  "the LUT is where per-type dials become pixels"
);
check(
  "the sprite cache is keyed by element type",
  /shpSprite\(ctx3, shp, frameNo, palette, lookType\)|lookType \|\| ""/.test(hq),
  "two types sharing a palette must not share a cached sprite"
);
const unwired = tuneKeys.filter((k) => !new RegExp('"' + k + '"').test(hq));
check(
  "every dial is named by a render pass",
  unwired.length === 0,
  unwired.length ? "no pass draws under: " + unwired.join(", ") : tuneKeys.join(", ")
);

// --- the default is the identity ---------------------------------------------

check("the default stamp is empty", T.tuneKey(T.DEFAULT_TUNE) === "", JSON.stringify(T.tuneKey(T.DEFAULT_TUNE)));
check("an absent table is the default stamp", T.tuneKey(undefined) === "");
check(
  "the default filter is none, for every type",
  tuneKeys.every((k) => T.filterString(T.DEFAULT_TUNE, k) === "none")
);

// A LUT in the renderer's own packing: little-endian ABGR, index 0 transparent.
const packed = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
const sampleLut = new Uint32Array(256);
for (let i = 1; i < 256; i++) sampleLut[i] = packed(i, 255 - i, (i * 7) % 256);

check(
  "the default LUT is returned unchanged, not copied",
  T.tuneLut(sampleLut, T.DEFAULT_TUNE, "base") === sampleLut,
  "identity must allocate nothing"
);

// --- both mechanisms come off one function -----------------------------------
//
// The LUT path and the filter path cannot be compared to each other directly
// without a canvas, so each is compared to the shared source instead: the LUT
// must be `channel` applied per component, and the filter string must carry
// exactly the numbers `dialsFor` computed. If both hold, there is one dial.

const grid = [
  { brightness: 0.2, contrast: 0.2 },
  { brightness: 0.5, contrast: 1.4 },
  { brightness: 1, contrast: 0.35 },
  { brightness: 1.7, contrast: 1 },
  { brightness: 2, contrast: 2 },
];

let lutMatches = true;
let lutDetail = "";
for (const dials of grid) {
  const tune = { types: { building: dials } };
  const out = T.tuneLut(sampleLut, tune, "building");
  for (let i = 1; i < 256; i++) {
    const v = sampleLut[i];
    const want =
      packed(
        T.channel(v & 255, dials.brightness, dials.contrast),
        T.channel((v >>> 8) & 255, dials.brightness, dials.contrast),
        T.channel((v >>> 16) & 255, dials.brightness, dials.contrast)
      ) >>> 0;
    if (out[i] !== want) {
      lutMatches = false;
      lutDetail = `b${dials.brightness} c${dials.contrast} index ${i}: ${out[i].toString(16)} != ${want.toString(16)}`;
      break;
    }
  }
  if (!lutMatches) break;
}
check("the LUT bake is channel(), per component", lutMatches, lutDetail || `${grid.length} dial pairs x 255 entries`);

let filterMatches = true;
let filterDetail = "";
for (const dials of grid) {
  const tune = { types: { terrain: dials } };
  const d = T.dialsFor(tune, "terrain");
  const want = `brightness(${d.brightness}) contrast(${d.contrast})`;
  const got = T.filterString(tune, "terrain");
  if (got !== want) {
    filterMatches = false;
    filterDetail = `${got} != ${want}`;
    break;
  }
}
check("the filter string is dialsFor(), verbatim", filterMatches, filterDetail || `${grid.length} dial pairs`);

// --- the global pair is applied once, and never baked -------------------------
//
// The free half and the baked half are two mechanisms over one picture, so the
// one thing that must not happen is both of them applying the same dial. It did:
// `dialsFor` multiplied the global pair into the per-type one, `tuneLut` baked
// the product into the palette, and `--cdc-render-filter` then applied the
// global pair a second time over the finished render. Global brightness 1.5 put
// a mid-grey at 225 instead of 150, and the client's own preview -- unbaked, and
// under the same CSS rule -- disagreed with ours under the identical dial.
//
// So the rule these three assertions pin: the global pair reaches a picture only
// as a filter over it. That is also what makes it free, which is what the
// options page promises by separating the two halves.

const globalOnly = { all: { brightness: 2, contrast: 1.5 } };

check(
  "the global pair is not folded into a per-type dial",
  tuneKeys.every((k) => T.filterString(globalOnly, k) === "none"),
  tuneKeys.filter((k) => T.filterString(globalOnly, k) !== "none").join(", ") || "no type carries it"
);

check(
  "the global pair bakes nothing into the palette",
  T.tuneLut(sampleLut, globalOnly, "base") === sampleLut,
  "the LUT must come back unchanged, not merely equal"
);

check(
  "the global pair still reaches the picture as a filter",
  T.globalFilter(globalOnly) === "brightness(2) contrast(1.5)",
  T.globalFilter(globalOnly)
);

check(
  "the global pair stays out of the stamp",
  T.tuneKey(globalOnly) === "",
  "free, so no stored render is stale because it moved -- same argument as shroudDim"
);

// The per-type dial keeps working exactly as before; only the global's second
// application is gone.
check(
  "a per-type dial is itself, alone",
  T.dialsFor({ ...globalOnly, types: { ore: { brightness: 0.5, contrast: 2 } } }, "ore").brightness === 0.5,
  "the type's own number, unmultiplied"
);

// --- the clamp between the primitives -------------------------------------
//
// A CSS filter list is a chain of separate primitives and each one's output is
// clamped to [0,1] before the next sees it. channel() has to do the same or the
// two halves of this feature disagree: the global pair is applied as a real CSS
// filter and the per-type pair is baked, and without this clamp they diverge
// wherever brightness pushes a channel past 1.
//
// Measured by scripts/probe-filter-parity.mjs against a real canvas: at
// brightness 1.6 / contrast 0.8 the unclamped chain was 26 of 255 away from
// what Chrome drew, and every other pair agreed within rounding. 230 below is
// Chrome's own answer for a full-brightness channel at those dials.

check(
  "channel clamps between brightness and contrast",
  T.channel(255, 1.6, 0.8) === 230,
  "got " + T.channel(255, 1.6, 0.8) + ", unclamped would be 255"
);
check(
  "and the clamp does not disturb dials that stay in range",
  T.channel(128, 0.6, 1) === Math.round(((128 / 255) * 0.6) * 255),
  "no clipping below 1.0, so nothing changes there"
);

// --- the LUT keeps what it must ----------------------------------------------

const dark = T.tuneLut(sampleLut, { types: { base: { brightness: 0.4, contrast: 1 } } }, "base");
check("index 0 stays transparent", dark[0] === 0, String(dark[0]));
check(
  "alpha survives a brightness dial",
  [1, 64, 200, 255].every((i) => (dark[i] >>> 24 & 255) === 255),
  "a dial that ate alpha would make a sprite translucent, not dark"
);
check("a brightness dial below 1 darkens", (dark[200] & 255) < (sampleLut[200] & 255));

// --- the stamp ----------------------------------------------------------------

const a = { ore: "#112233", types: { building: { brightness: 1.5, contrast: 1 }, base: { brightness: 0.8, contrast: 1 } } };
const b = { types: { base: { contrast: 1, brightness: 0.8 }, building: { contrast: 1, brightness: 1.5 } }, ore: "#112233" };
check("the stamp ignores key order", T.tuneKey(a) === T.tuneKey(b), `${T.tuneKey(a)} vs ${T.tuneKey(b)}`);
check("a changed dial changes the stamp", T.tuneKey(a) !== T.tuneKey({ ...a, ore: "#332211" }));
check("a non-default stamp is non-empty", T.tuneKey(a).length > 0, T.tuneKey(a));

// --- the shroud dim -------------------------------------------------------------
//
// It is the client's own 0.35 by default, so the radar clones the native three
// states out of the box. It is radar-only, applied to a live layer and never
// baked, so it must NOT reach the staleness stamp: moving it may not mark sixty
// stored renders as needing a re-render.

check(
  "a gap field dims its ground by the client's own 0.35 by default",
  T.DEFAULT_TUNE.shroudDim === 0.35,
  "Darken on OUR shroud is only ever our own field or an ally's, and a default of 0 blacked it out entirely — the round-2 complaint"
);
check("the shroud dim clamps to 0..1", T.normalise({ shroudDim: 4 }).shroudDim === 1 && T.normalise({ shroudDim: -1 }).shroudDim === 0);
check("the client's own 0.35 multiply stays reachable", T.normalise({ shroudDim: 0.35 }).shroudDim === 0.35);
check(
  "the shroud dim stays out of the stamp",
  T.tuneKey({ shroudDim: 1 }) === "",
  "radar-only, so a stored render is not stale because it moved"
);

// The shroud layer is not optional, and there is no switch for it any more.
//
// There was one, defaulting to on, and the assertion guarding it said in as many
// words that "a radar that shows what you have not seen is a maphack, so the
// switch defaults to hiding". A default is a weak place to keep that promise:
// unticking it drew the whole map, and the options page said so out loud --
// "this panel becomes a map viewer rather than a radar". Removed on the user's
// instruction, 2026-08-26: this tool is convenience, not a maphack.
//
// The switch existed as an escape hatch, because a wrong mask or a wrong pick
// buffer paints black over a map that rendered perfectly and that had twice cost
// a whole match. Closing the panel is the same escape hatch and costs nothing --
// Alt+L, the toggle the radar already has.

check(
  "there is no switch that turns the shroud off",
  !("shroud" in T.DEFAULT_TUNE) && T.normalise({ shroud: false }).shroud === undefined,
  "a table that carries the flag again is a map viewer one tick away"
);

// --- the page that owns the dials ---------------------------------------------
//
// The options page holds the canonical controls, and the way a new dial fails
// there is silent in both directions: a slider drawn but never listened to moves
// and changes nothing, and one listened to but never drawn from the stored value
// snaps back to its default every time the page opens. Neither throws and
// neither shows up in a screenshot taken right after dragging it.
//
// scripts/check-options.mjs pins that every element options.js reaches for
// exists in the markup. This is the other direction, for the dials only: every
// <input> the appearance section declares must be reached, rendered from the
// table and written back to it.

const optionsHtml = readFileSync(join(src, "options.html"), "utf8");
const optionsJs = readFileSync(join(src, "options.js"), "utf8");

// <input> alone, so the section's container, its staleness note and its reset
// button are excluded by what they are rather than by a hand-kept list -- the
// kind of list that rots the moment someone adds a row.
const dialIds = [...optionsHtml.matchAll(/<input id="(tune\w+)"/g)].map((m) => m[1]);
// id -> the name options.js holds it under, read out of the tuneEls block rather
// than derived from the id, so a field named against the convention is caught
// instead of silently skipped.
const dialField = new Map(
  [...optionsJs.matchAll(/(\w+): document\.getElementById\("(tune\w+)"\)/g)].map((m) => [m[2], m[1]])
);

check("the appearance section declares dials", dialIds.length > 0, dialIds.join(", "));

const unheld = dialIds.filter((id) => !dialField.has(id));
check(
  "every dial on the page is held by the panel",
  unheld.length === 0,
  unheld.length ? "not in tuneEls: " + unheld.join(", ") : dialIds.length + " dials"
);

const unrendered = dialIds
  .filter((id) => dialField.has(id))
  .filter((id) => {
    const f = dialField.get(id);
    return !new RegExp("setDial\\(tuneEls\\." + f + ",|tuneEls\\." + f + "\\.(value|checked) =").test(optionsJs);
  });
check(
  "and drawn from the stored table",
  unrendered.length === 0,
  unrendered.length ? "never rendered: " + unrendered.join(", ") : "all " + dialIds.length
);

const unwritten = dialIds
  .filter((id) => dialField.has(id))
  .filter((id) => !new RegExp("tuneEls\\." + dialField.get(id) + "\\.addEventListener").test(optionsJs));
check(
  "and written back when it moves",
  unwritten.length === 0,
  unwritten.length ? "no listener: " + unwritten.join(", ") : "all " + dialIds.length
);

// --- the blip pair -------------------------------------------------------------
//
// The radar's blips are the one layer in this table that is drawn as a fill
// rather than as a picture, so the two mechanisms above cannot reach them: the
// global pair is a filter over a finished composite and the blips are drawn
// after it with the filter deliberately off. Their dial therefore reaches the
// colour, through `tuneHex`, and the thing worth pinning is that it is the same
// arithmetic and not a second copy of it.

check(
  "the blips start at exactly the size and colour they had before the dial",
  T.DEFAULT_TUNE.units.size === 1 && T.DEFAULT_TUNE.units.brightness === 1,
  "a dial was asked for, not a bigger blip -- a guess that misses costs a live match"
);
check(
  "a table stored before the blip dials existed reads as identity",
  T.normalise({ oreAlpha: 0.5 }).units.size === 1 && T.normalise({ oreAlpha: 0.5 }).units.brightness === 1,
  "undefined is a missing key, not an answer"
);
check(
  "the blip size clamps to its own range, not the brightness one",
  T.normalise({ units: { size: 99 } }).units.size === T.LIMITS.unitSize[1] &&
    T.normalise({ units: { size: 0 } }).units.size === T.LIMITS.unitSize[0],
  "it multiplies a length, not a channel"
);
check(
  "and the blip brightness clamps with the other channels",
  T.normalise({ units: { brightness: 99 } }).units.brightness === T.LIMITS.brightness[1]
);
check(
  "the blip pair stays out of the stamp",
  T.tuneKey({ units: { size: 4, brightness: 2 } }) === "",
  "radar-only, like the shroud pair -- no stored render is redrawn because a blip grew"
);

check(
  "tuneHex is channel(), per component",
  T.tuneHex("#0a4bff", 1.4, 0.9) ===
    "#" +
      [0x0a, 0x4b, 0xff]
        .map((v) => T.channel(v, 1.4, 0.9).toString(16).padStart(2, "0"))
        .join(""),
  "a second copy of the arithmetic is how a blip and the layer under it stop agreeing"
);
check(
  "tuneHex hands identity straight back",
  // The uppercase one is the assertion. `channel` at 1/1 is exactly the identity,
  // so a recomputed lowercase copy would compare equal to the lowercase input and
  // this would pass on code that rebuilt the string every time. The promise is
  // that a table nobody has touched replaces nothing at all -- not even the case
  // of a colour string it was handed.
  T.tuneHex("#0000ff", 1, 1) === "#0000ff" && T.tuneHex("#00FF00", 1, 1) === "#00FF00",
  "the default install must not rewrite a single colour string"
);
check(
  "tuneHex always returns six digits",
  /^#[0-9a-f]{6}$/.test(T.tuneHex("#0a0b0c", 0.3, 1)),
  "got " + T.tuneHex("#0a0b0c", 0.3, 1) + " -- an unpadded channel is a fillStyle the canvas ignores"
);
check(
  "and a colour it cannot parse comes back untouched",
  T.tuneHex("rgb(1,2,3)", 1.5, 1) === "rgb(1,2,3)",
  "the caller read it off a live client object; a dial is not a reason to replace it"
);

// --- normalise ------------------------------------------------------------------

check("a garbage table normalises to the default", T.tuneKey(T.normalise("nonsense")) === "");
check("an out-of-range dial is clamped, not dropped", T.normalise({ all: { brightness: 99 } }).all.brightness === T.LIMITS.brightness[1]);
check("a negative dial is clamped to the floor", T.normalise({ all: { contrast: -5 } }).all.contrast === T.LIMITS.contrast[0]);
check("a missing dial fills in as 1, never 0", T.normalise({ types: { ore: {} } }).types.ore.contrast === 1);
check("an invalid colour falls back", T.normalise({ ore: "red" }).ore === T.DEFAULT_TUNE.ore);
check("a valid colour is kept, lowercased", T.normalise({ ore: "#AABBCC" }).ore === "#aabbcc");

// --- report ---------------------------------------------------------------------

for (const line of results) console.log(line);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
