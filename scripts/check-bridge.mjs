/**
 * Run src/bridge.js — the file as shipped — against a fake `chrome`.
 *
 *   node scripts/check-bridge.mjs
 *
 * One rule, and it cost a render to learn: **the tab a run was opened in must
 * not be closed while a write is still in flight.** The last map's picture is a
 * multi-megabyte `storage.local.set` that is still travelling when the run
 * reports finished, and the tab asking to be closed at that moment threw it
 * away — the card kept the map's own preview with nothing behind it, and the
 * run said it had rendered.
 *
 * The writes here never complete on their own: the test releases them, which is
 * the only way to be sure the closing waited rather than merely losing a race
 * slowly.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "src", "bridge.js"), "utf8");

const sent = [];
const pending = []; // set() callbacks the test releases by hand
let stored = { bulk: null, sim: null, maps: {}, renders: {}, guides: {}, keys: {}, prefs: {}, appearance: { ore: "#112233" } };
let onMessage = null;
let onChanged = null;

/**
 * Whether the tab has been closed — which is what asking to close it means.
 *
 * A write in flight when the tab goes is not a write that fails; it is a write
 * that never happens, and the acknowledgement never comes either. Modelling
 * that is what lets a test tell "closed too early" apart from "closed too early
 * but got away with it", and the bug this file is about got away with it every
 * time until it did not.
 */
let closed = false;
const reopen = () => {
  closed = false;
};

const chrome = {
  runtime: {
    lastError: null,
    getManifest: () => ({ version: "0.0.0-test" }),
    sendMessage: (message, cb) => {
      sent.push(message);
      if (message && message.type === "run-finished") closed = true;
      if (cb) cb();
    },
  },
  storage: {
    local: {
      get: (query, cb) => {
        const out = {};
        if (typeof query === "string") out[query] = stored[query];
        else if (Array.isArray(query)) query.forEach((k) => (out[k] = stored[k]));
        else Object.keys(query).forEach((k) => (out[k] = stored[k] === undefined ? query[k] : stored[k]));
        // A copy, because real storage hands back a deserialised value. Handing
        // back the live object let a caller mutate the store by reading it —
        // which quietly made every "is it stored?" check here pass whether the
        // write happened or not.
        setTimeout(() => cb(structuredClone(out)), 0);
      },
      set: (items, cb) => {
        // Applied when the test releases it, not when it is called: a write
        // lands at completion, and a tab that has gone by then takes it with it.
        pending.push(() => {
          if (closed) return; // no items, and no acknowledgement either
          Object.assign(stored, items);
          if (cb) cb();
        });
      },
      remove: (keys, cb) => {
        [].concat(keys).forEach((k) => delete stored[k]);
        if (cb) cb();
      },
    },
    // Held rather than dropped: a run is asked for by writing the `bulk` item,
    // so this listener is the only way into the code that starts one.
    onChanged: {
      addListener: (fn) => (onChanged = fn),
    },
  },
};

const posted = [];
const window = {
  addEventListener: (type, fn) => {
    if (type === "message") onMessage = fn;
  },
  postMessage(message) {
    posted.push(message);
  },
};
window.window = window;

vm.runInContext(source, vm.createContext({ ...window, window, chrome, console, setTimeout, clearTimeout }));

const say = (data) => onMessage({ source: window, data: { source: "cdc-page", ...data } });
const settle = () => new Promise((r) => setTimeout(r, 20));
const release = () => {
  while (pending.length) pending.shift()();
};

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// A render lands, then the run reports it has finished. The render's write has
// not completed: this is the exact moment the tab used to close.
say({ type: "map-render", key: "mp01.map", render: { thumb: "t", full: "F", v: 3 } });
await settle();
say({ type: "bulk-progress", done: 1, total: 1, rendered: 1, active: "", failed: [], finished: true });
await settle();

// By type, not by count: the bridge also hands log batches to the worker over
// this same wire, and "nothing was sent at all" would be a check on the log's
// batching rather than on the closing. See check-log.mjs for the log's own.
const closings = () => sent.filter((m) => m.type === "run-finished");

check("nothing asks to close the tab while a write is in flight", closings().length === 0, JSON.stringify(sent));
check("the render is queued, not dropped", pending.length > 0, `${pending.length} write(s) waiting`);

release();
await settle();
release(); // the progress write, queued behind the render's
await settle();

check(
  "the tab asks to close once the writes have landed",
  closings().length === 1,
  JSON.stringify(sent.map((m) => m.type))
);
check("and the render is in storage", stored.renders && !!stored.renders["mp01.map"], JSON.stringify(Object.keys(stored.renders || {})));
check("with its full-size image", stored["full:mp01.map"] === "F", String(stored["full:mp01.map"]));

// Progress that is not the end of the run closes nothing.
sent.length = 0;
reopen();
say({ type: "bulk-progress", done: 1, total: 2, rendered: 1, active: "next", failed: [], finished: false });
await settle();
release();
await settle();
check("a run still going does not ask to close", closings().length === 0, JSON.stringify(sent.map((m) => m.type)));
check("and every progress write is stamped", typeof stored.bulk.patchedAt === "number", JSON.stringify(stored.bulk));

// --- the window between arriving and writing --------------------------------
//
// Every one of these operations *reads* storage before it writes, and counting
// only the `set` left the gap in between empty: a run reporting itself finished
// in that gap found silence and closed the tab before the write was made. That
// is not the hypothetical version — it is how `4_yin_yang_le.map` came to have
// a 17 MB render in storage and no catalogue card, with the run reporting a
// clean success.
//
// `say` is synchronous and the fake's `get` answers on a timer, so a message
// sent immediately after another lands squarely in that window.

sent.length = 0;
stored.maps = {};
reopen();
say({ type: "map-seen", map: { key: "gap.map", name: "Gap", thumb: "t", facts: {} } });
say({ type: "bulk-progress", done: 1, total: 1, rendered: 1, active: "", failed: [], finished: true });
await settle();
check(
  "a card that has arrived but not yet been written keeps the tab open",
  closings().length === 0,
  JSON.stringify(sent.map((m) => m.type))
);

while (pending.length) {
  release();
  await settle();
}
check("and the card is in storage", !!stored.maps["gap.map"], JSON.stringify(Object.keys(stored.maps)));
check("before the tab is asked to close", closings().length === 1, JSON.stringify(sent.map((m) => m.type)));

// --- the cap ---------------------------------------------------------------
//
// It evicts the oldest render past MAX_RENDERS, which used to include maps the
// user had written a guide for — silently. A render can be drawn again; the
// guide cannot, and "rendered once, kept" is the promise the cap was breaking.

/** Fill the store with `n` renders, oldest first, and give `guided` guides. */
function seedRenders(n, guided) {
  stored.renders = {};
  stored.guides = {};
  for (let i = 0; i < n; i++) {
    stored.renders["r" + i] = { thumb: "t", at: i, v: 1 };
    stored["full:r" + i] = "F" + i;
  }
  guided.forEach((k) => (stored.guides[k] = "notes"));
  delete stored.evicted;
}

async function storeRender(key) {
  reopen();
  say({ type: "map-render", key, render: { thumb: "t", full: "F", v: 3 } });
  await settle();
  release();
  await settle();
}

// The cap is the bridge's own number: read it back rather than restated here,
// where it would go stale the moment the constant moved.
seedRenders(200, []);
await storeRender("fresh.map");
const cap = stored.evicted && stored.evicted.cap;
check("the cap says what it is", typeof cap === "number" && cap > 0, String(cap));

// Two oldest guided, so eviction has to walk past them.
seedRenders(cap, ["r0", "r1"]);
await storeRender("newest.map");
check(
  "over the cap, the oldest render without a guide goes",
  !stored.renders.r2 && !stored["full:r2"],
  JSON.stringify({ r2: !!stored.renders.r2, full: stored["full:r2"] })
);
check(
  "and a map with a guide is kept even though it is older",
  !!stored.renders.r0 && !!stored.renders.r1,
  JSON.stringify({ r0: !!stored.renders.r0, r1: !!stored.renders.r1 })
);
check("the map just rendered is never the one evicted", !!stored.renders["newest.map"]);
check(
  "and what went is recorded, not swallowed",
  stored.evicted && stored.evicted.keys.join(",") === "r2" && typeof stored.evicted.at === "number",
  JSON.stringify(stored.evicted)
);

// Everything spoken for: the store goes over the cap rather than losing notes.
seedRenders(
  cap,
  Array.from({ length: cap }, (_, i) => "r" + i)
);
await storeRender("one-more.map");
check(
  "with every candidate guided, nothing is evicted and the cap is exceeded",
  Object.keys(stored.renders).length === cap + 1 && !stored.evicted,
  `${Object.keys(stored.renders).length} renders, evicted=${JSON.stringify(stored.evicted)}`
);

// --- a run's counters are its own ------------------------------------------
//
// Every progress write spreads the item it read, which is what carries a run's
// origin through to its last line — and what makes a field left out of a patch
// keep the *previous* run's number. `nothing was ticked` finished without
// writing one, so it reported the last run's `rendered` beside its own
// `total: 0`.

/** Ask for a run the way the options page does: by writing the item. */
async function askForRun(request) {
  reopen();
  onChanged({ bulk: { newValue: { requested: true, ...request } } }, "local");
  await settle();
  release();
  await settle();
}

stored.bulk = { rendered: 7, skipped: 5, done: 12, total: 12, finishedAt: 1 };
await askForRun({ maps: [] });
check(
  "a run with nothing ticked reports no count from the run before it",
  stored.bulk.rendered === 0 && stored.bulk.skipped === 0 && stored.bulk.total === 0,
  JSON.stringify(stored.bulk)
);

stored.bulk = { rendered: 7, skipped: 5, done: 12, total: 12, finishedAt: 1 };
await askForRun({ maps: [{ title: "Map", file: "m.map" }] });
check(
  "and a run that starts clears them before its first map",
  stored.bulk.rendered === 0 && stored.bulk.skipped === 0 && stored.bulk.finishedAt === null,
  JSON.stringify(stored.bulk)
);

// A run that drew nothing because every map was already current. Nothing else
// is in flight when it finishes — there is no render write to hide behind — so
// its own last line is the one write the closing can take with it, and that
// line is the whole progress report: counts, and the fact that it finished at
// all. Without it the options page waits out STALL_MS and says the run stopped
// answering.
sent.length = 0;
reopen();
say({ type: "bulk-progress", done: 1, total: 1, rendered: 0, skipped: 1, active: "", failed: [], finished: true });
await settle();
check(
  "a run that skipped every map keeps the tab open for its own last line",
  closings().length === 0,
  JSON.stringify(sent.map((m) => m.type))
);

release();
await settle();
release(); // the log batch, queued behind it
await settle();
check(
  "a skipped map is counted as skipped, not as nothing",
  stored.bulk.skipped === 1 && stored.bulk.rendered === 0,
  JSON.stringify({ rendered: stored.bulk.rendered, skipped: stored.bulk.skipped })
);
check("and the run is written down as finished", typeof stored.bulk.finishedAt === "number", JSON.stringify(stored.bulk.finishedAt));
check("before the tab is asked to close", closings().length === 1, JSON.stringify(sent.map((m) => m.type)));

// --- a preference the game changed ------------------------------------------
//
// The swap hotkey is pressed in the page world, which has no `chrome.*`, so
// this is the only route it has to storage. Two things have to be true of that
// write, and neither is visible from the game: the settings it did not name
// must survive it — the same item holds the options page's own — and the card
// setting for the map in play must go, because that one outranks the
// preference and would swallow the swap silently.

sent.length = 0;
reopen();
stored.prefs = { preferHqPreview: true, autoRender: true, cardPreferHq: false };
stored.previewSrc = { "mp01.map": "original", "other.map": "ours" };
say({
  type: "prefs-set",
  prefs: { preferHqPreview: false },
  clearPreviewSrc: "mp01.map",
});
await settle();
release();
await settle();

check(
  "a preference set from the game is stored",
  stored.prefs.preferHqPreview === false,
  JSON.stringify(stored.prefs)
);
check(
  "and the settings it did not name survive the write",
  stored.prefs.autoRender === true && stored.prefs.cardPreferHq === false,
  JSON.stringify(stored.prefs)
);
check(
  "the card setting that outranked it is cleared",
  !("mp01.map" in stored.previewSrc),
  JSON.stringify(stored.previewSrc)
);
check(
  "and no other map's is touched",
  stored.previewSrc["other.map"] === "ours",
  JSON.stringify(stored.previewSrc)
);

// The same swap on a map with no card setting of its own: the preference moves
// and the per-map item is not rewritten at all.
const before = JSON.stringify(stored.previewSrc);
reopen();
say({ type: "prefs-set", prefs: { preferHqPreview: true }, clearPreviewSrc: null });
await settle();
release();
await settle();
check("a swap with no card setting to clear still moves the preference", stored.prefs.preferHqPreview === true);
check("and leaves the per-map settings alone", JSON.stringify(stored.previewSrc) === before, before);

// The debug pace from the options page has to reach the page world, because the
// half that plays the match has no storage to read it from. A job that names one
// carries it; a job that does not carries null, which leaves the run its own rule.
stored.sim = { requested: true, gameId: "g1", url: "https://replays-eu.chronodivide.com/g1.rpl", pace: 240 };
say({ type: "ready" });
await settle();
release();
await settle();
const runs = posted.filter((m) => m.type === "sim-run");
check("a replay job reaches the page world", runs.length === 1, JSON.stringify(runs));
check("carrying the pace it was asked for", !!runs[0] && runs[0].pace === 240, JSON.stringify(runs[0]));

// The other case — a job with no pace, which must reach the page world as
// `null` rather than as nothing — is not driven here: a tab takes **one**
// pending run (`tookPending`), so a second job needs a second bridge, and the
// operand is the same line of code either way.


// --- the build roster -------------------------------------------------------
//
// The roster is the one thing the options page cannot work out for itself: it
// has no game, so it has no rules, so the list of things a key may be bound to
// has to arrive from a game tab. Three properties, and each of them has already
// been got wrong somewhere else in this file's history:
//
//   it is stored at all              — a write that is never made
//   an empty one does not land       — a cold tab overwriting a good list with
//                                      the nothing it read before game files
//                                      existed
//   the stamp comes back in config   — without it the page re-parses rules.ini
//                                      on every load to say what is already
//                                      stored
reopen();
say({
  type: "build-roster",
  roster: {
    version: "0.83.3",
    at: 1,
    items: [
      { name: "GAPOWR", type: "building", sides: ["Allied"] },
      { name: "NAPOWR", type: "building", sides: ["Soviet"] },
    ],
  },
});
await settle();
release();
await settle();
check(
  "a build roster is stored",
  !!stored.roster && stored.roster.items && stored.roster.items.length === 2,
  JSON.stringify(stored.roster)
);

// A tab whose client has no game files yet reads nothing and must not be able
// to publish that nothing over a roster that is already good.
say({ type: "build-roster", roster: { version: "0.83.3", at: 2, items: [] } });
await settle();
release();
await settle();
check(
  "an empty roster does not overwrite a good one",
  !!stored.roster && stored.roster.items.length === 2,
  JSON.stringify(stored.roster && stored.roster.items)
);

// And what the page gets back: the bindings themselves, plus the stamp of the
// roster in storage — not the roster, which the page is the source of.
stored.builds = { Allied: [{ name: "GAPOWR", key: { code: "KeyQ", label: "Q" } }] };
posted.length = 0;
say({ type: "ready" });
await settle();
release();
await settle();
const config = posted.filter((m) => m.type === "config").pop();
check("the config push carries the build bindings", !!config && !!config.builds && !!config.builds.Allied, JSON.stringify(config && config.builds));
check(
  "and the roster's stamp rather than the roster",
  !!config && config.rosterVersion === "0.83.3" && config.roster === undefined,
  JSON.stringify(config && { rosterVersion: config.rosterVersion, roster: config.roster })
);
// The appearance table travels whole, like spriteFix and unlike the stamps: the
// renderer cannot fetch it at the moment it needs it, and the radar composites
// against it live. Left out of the push, every dial silently does nothing in a
// tab that is already open -- which is the failure mode the list below this
// comment block exists to prevent.
check(
  "the config push carries the appearance table",
  !!config && config.appearance !== undefined,
  JSON.stringify(config && config.appearance)
);

// An edit in the options page has to reach a game tab that is already open —
// which is the whole reason this listener exists, and the reason it is a list is
// the reason a new item can be left out of it. The build hotkeys were: bound in
// the options page, stored, and never pushed, so a key did nothing until the
// game tab was reloaded and nothing anywhere said why.
posted.length = 0;
onChanged({ builds: { newValue: { Allied: [{ name: "GAREFN", key: { code: "KeyE", label: "E" } }] } } }, "local");
await settle();
release();
await settle();
const pushed = posted.filter((m) => m.type === "config").pop();
check(
  "a binding written in the options page reaches an open game tab",
  !!pushed && !!pushed.builds,
  JSON.stringify(posted.map((m) => m.type))
);

// The chord layouts are the same shape of item and therefore the same shape of
// omission: stored under their own key, read by the game tab, and reaching it
// only because two lists in bridge.js name them. Both are driven here.
stored.chords = { Allied: { structures: ["GAPOWR", null], units: [] } };
posted.length = 0;
say({ type: "ready" });
await settle();
release();
await settle();
const withChords = posted.filter((m) => m.type === "config").pop();
check(
  "the config push carries the chord layouts",
  !!withChords && !!withChords.chords && withChords.chords.Allied.structures[0] === "GAPOWR",
  JSON.stringify(withChords && withChords.chords)
);

posted.length = 0;
onChanged({ chords: { newValue: { Soviet: { structures: ["NAPOWR"] } } } }, "local");
await settle();
release();
await settle();
const chordPush = posted.filter((m) => m.type === "config").pop();
check(
  "a layout edited in the options page reaches an open game tab",
  !!chordPush && !!chordPush.chords,
  JSON.stringify(posted.map((m) => m.type))
);

// --- the harvested object table ---------------------------------------------
//
// Two keys for one harvest, like the cameo sheet: the table is what a replay is
// decoded with and `replayTypesVersion` is the few bytes a config push carries
// so a tab can tell whether harvesting again would change anything. The three
// properties are the roster's three, and each has been got wrong somewhere in
// this file's history:
//
//   it is stored at all, with its stamp — and in one `set`, so the stamp never
//                                         claims a table that is not there
//   an empty one does not land          — a cold tab publishing the nothing it
//                                         read over a table that is good
//   the stamp comes back in config      — without it the game tab re-reads the
//                                         client's rules on every load
reopen();
const table = {
  version: "0.83.3/1",
  at: 1,
  types: {
    building: [["GAPOWR", "Power Plant", 800, { tech: 1, side: "Allied" }]],
    infantry: [["E1", "GI", 200]],
    vehicle: [["HARV", "War Miner", 1400]],
    aircraft: [["ORCA", "Intruder", 1200]],
  },
  general: { maximumQueuedObjects: 29, buildSpeed: 0.7, multipleFactory: 0.8, padAircraft: ["ORCA"] },
  objects: 4,
  named: 4,
};
say({ type: "replay-types", replayTypes: table });
await settle();
release();
await settle();
check(
  "a harvested object table is stored",
  !!stored.replayTypes && stored.replayTypes.types.building[0][0] === "GAPOWR",
  JSON.stringify(stored.replayTypes && Object.keys(stored.replayTypes))
);
check(
  "with its stamp in the same write, so the stamp never claims a table that is not there",
  stored.replayTypesVersion === "0.83.3/1",
  JSON.stringify(stored.replayTypesVersion)
);

say({ type: "replay-types", replayTypes: { ...table, version: "0.84.0/1", types: {} } });
await settle();
release();
await settle();
check(
  "an empty object table does not overwrite a good one",
  !!stored.replayTypes && stored.replayTypes.types.building.length === 1 && stored.replayTypesVersion === "0.83.3/1",
  JSON.stringify(stored.replayTypesVersion)
);

posted.length = 0;
say({ type: "ready" });
await settle();
release();
await settle();
const withTypes = posted.filter((m) => m.type === "config").pop();
check(
  "the config push carries the table's stamp rather than the table",
  !!withTypes && withTypes.replayTypesVersion === "0.83.3/1" && withTypes.replayTypes === undefined,
  JSON.stringify(withTypes && { v: withTypes.replayTypesVersion, table: withTypes.replayTypes })
);

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
