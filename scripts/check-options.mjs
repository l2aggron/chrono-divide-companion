/**
 * Every element src/options.js reaches for exists in src/options.html.
 *
 *   node scripts/check-options.mjs
 *
 * The options page is one file of markup and one of script, wired by name, and
 * nothing checks the wire: a renamed hook fails at run time, in a page that
 * mostly still works — the panel it belonged to just quietly does nothing. That
 * failure was found by hand last time (29 lookups read against the markup one by
 * one), which is exactly the kind of thing that should not be done by hand.
 *
 * It reads the two files as text rather than parsing them. That is enough
 * because both sides name their hooks as string literals, and a checker that
 * needed a DOM would need the extension's own storage to build the page.
 *
 * Three kinds of lookup:
 *   getElementById("x")   -> an id in the markup
 *   querySelector(".x")   -> a class in the markup
 *   q("x")                -> the panel factory's scoped lookup, `.x` inside the
 *                            ladder template
 *
 * A hook that is only ever created in script (a card's own classes, say) is not
 * looked up by name, so it never reaches this check.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const html = readFileSync(join(src, "options.html"), "utf8");
const js = readFileSync(join(src, "options.js"), "utf8");

const all = (text, re, group = 1) => [...text.matchAll(re)].map((m) => m[group]);

// The markup's own vocabulary. `class="a b"` is several names, so every
// attribute is split.
const ids = new Set(all(html, /\bid="([^"]+)"/g));
const classes = new Set(all(html, /\bclass="([^"]+)"/g).flatMap((value) => value.trim().split(/\s+/)));

const wanted = [
  ...all(js, /getElementById\("([^"]+)"\)/g).map((name) => ({ name, kind: "id" })),
  ...all(js, /querySelector\("\.([A-Za-z][\w-]*)"\)/g).map((name) => ({ name, kind: "class" })),
  ...all(js, /\bq\("([^"]+)"\)/g).map((name) => ({ name, kind: "class" })),
];

const missing = wanted.filter(({ name, kind }) => !(kind === "id" ? ids : classes).has(name));

for (const { name, kind } of missing) {
  console.error(`options.js looks up ${kind === "id" ? "#" : "."}${name}, which options.html does not have`);
}

console.log(
  `${wanted.length - missing.length}/${wanted.length} lookups resolve ` +
    `(${ids.size} ids and ${classes.size} classes in the markup)`
);

// A run that resolved nothing is a broken checker, not a clean page — the
// patterns above stopped matching, and reporting success would be worse than
// not running at all.
if (!wanted.length) {
  console.error("no lookups found in options.js — this check is no longer reading it correctly");
  process.exit(1);
}

// --- the two copies of the hotkey table --------------------------------------
//
// `DEFAULT_KEYS` is written out in both src/companion.js and src/options.js, and
// has to hold the same names in both: the game reads its own copy, the options
// page renders a row per name in *its* copy, and the bridge carries only what
// the page wrote. A key added to one and not the other is therefore either a
// hotkey with no way to rebind it, or a row that rebinds nothing — and neither
// throws. Two lists kept apart is the shape of both defects this feature has
// already had (see scripts/check-modules.mjs for the other one).

// The line that closes one of these object literals, exactly as both files
// write it. Same trick as scripts/check-modules.mjs: text, not a parse, because
// a checker that needed a real page to run would never be run.
const BOUNDARY = "\n  };";

const keyNames = (file) => {
  const at = file.indexOf("const DEFAULT_KEYS = {");
  if (at < 0) return null;
  const body = file.slice(at, file.indexOf(BOUNDARY, at));
  return [...body.matchAll(/^\s{4}(\w+):\s*\{/gm)].map((m) => m[1]);
};

const gameKeys = keyNames(readFileSync(join(src, "companion.js"), "utf8"));
const pageKeys = keyNames(js);
if (!gameKeys || !pageKeys || !gameKeys.length || !pageKeys.length) {
  console.error("could not read DEFAULT_KEYS out of both files — this check is out of date");
  process.exit(1);
}
const onlyGame = gameKeys.filter((name) => !pageKeys.includes(name));
const onlyPage = pageKeys.filter((name) => !gameKeys.includes(name));
if (onlyGame.length || onlyPage.length) {
  if (onlyGame.length) console.error(`hotkeys the game has and the options page cannot rebind: ${onlyGame.join(", ")}`);
  if (onlyPage.length) console.error(`rows the options page shows for hotkeys the game does not have: ${onlyPage.join(", ")}`);
  process.exit(1);
}

// And every one of them is labelled and explained, since renderKeys draws a row
// per name and reads both tables by it — a missing label is an unlabelled row.
const named = (table) => {
  const at = js.indexOf(`const ${table} = {`);
  const body = js.slice(at, js.indexOf(BOUNDARY, at));
  return [...body.matchAll(/^\s{4}(\w+):/gm)].map((m) => m[1]);
};
for (const table of ["KEY_LABELS", "KEY_NOTES"]) {
  const missing = pageKeys.filter((name) => !named(table).includes(name));
  if (missing.length) {
    console.error(`${table} has nothing for: ${missing.join(", ")}`);
    process.exit(1);
  }
}
// Same names is not enough: both copies carry the *descriptor*, and the game
// reads its own while the options page renders and stores the page's. Two
// copies that agree on names and disagree on a modifier are a hotkey whose
// panel says one thing and whose game does another — which is a worse bug than
// a missing row, because the panel looks right.
const keyLines = (file) => {
  const at = file.indexOf("const DEFAULT_KEYS = {");
  const body = file.slice(at, file.indexOf(BOUNDARY, at));
  const out = {};
  for (const m of body.matchAll(/^\s{4}(\w+):\s*\{([^}]*)\}/gm)) {
    // Field order and spacing are not the contract; the values are.
    out[m[1]] = m[2]
      .split(",")
      .map((part) => part.trim())
      .filter(Boolean)
      .sort()
      .join(" ");
  }
  return out;
};
const gameDesc = keyLines(readFileSync(join(src, "companion.js"), "utf8"));
const pageDesc = keyLines(js);
const disagree = pageKeys.filter((name) => gameDesc[name] !== pageDesc[name]);
if (disagree.length) {
  for (const name of disagree) {
    console.error(`DEFAULT_KEYS.${name} differs between the two files:`);
    console.error(`  companion.js: ${gameDesc[name]}`);
    console.error(`  options.js:   ${pageDesc[name]}`);
  }
  process.exit(1);
}

console.log(`${pageKeys.length} hotkeys, named and explained and identical in both files`);

// --- what a finished run says it did -----------------------------------------
//
// How much work a run did is not the state of the pool it ran over. A map the
// current renderer has already drawn is skipped, so the second run over a pool
// draws nothing and said `rendered 0 of 21` — beside a pool summary in the same
// panel saying `21/21 rendered`, which is the question the line is read to
// answer. The wording is the whole fix, so it is read out of the file and run
// rather than restated here, where the test would be of the copy.

const summary = /\r?\n {2}function runSummary\(bulk\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
const runSummary = summary ? new Function("bulk", summary[1]) : null;

const sayings = [
  [
    "a run that had nothing to redo says so",
    { total: 21, rendered: 0, skipped: 21 },
    (said) => said === "nothing to redo — all 21 already current",
  ],
  [
    "a run that drew some of them counts both",
    { total: 21, rendered: 3, skipped: 18 },
    (said) => said === "rendered 3 of 21 · 18 already current",
  ],
  ["a run that drew all of them counts once", { total: 4, rendered: 4, skipped: 0 }, (said) => said === "rendered 4 of 4"],
  [
    "a run stored before skips were counted keeps the old wording",
    { total: 21, rendered: 0 },
    (said) => said === "rendered 0 of 21",
  ],
];

const said = [];
for (const [name, bulk, ok] of sayings) {
  const out = runSummary ? runSummary(bulk) : "runSummary was not found in options.js";
  said.push([name, !!runSummary && ok(out), out]);
}
for (const [name, ok, out] of said) console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${out}`);

// --- the date a pool row shows -----------------------------------------------
//
// A row states when its map was last played, and on a live pool that is the day
// the ladder was read — on every row, which makes the one row that differs the
// hardest to find in the list. The rule is: say it only when it disagrees with
// the sample. Read out of the file and run, with `fmtDate` handed in as the
// identity so this is a test of the rule and not of date formatting.

const played = /\r?\n {2}function poolLastPlayed\(entry, sampled\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
const poolLastPlayed = played
  ? new Function("document", "fmtDate", "entry", "sampled", played[1])
  : null;

// Enough of one to build a span: the function reads back nothing it did not set.
const fakeDom = { createElement: () => ({ className: "", textContent: "", title: "" }) };
const asIs = (value) => value;
const dated = (entry, sampled) =>
  poolLastPlayed ? poolLastPlayed(fakeDom, asIs, entry, sampled) : null;

const sameDay = dated({ last: "2026-08-12" }, "2026-08-12");
const otherDay = dated({ last: "2026-08-08" }, "2026-08-12");

const rows = [
  ["a map last played on the day of the sample shows no date", !!sameDay && sameDay.length === 0, JSON.stringify(sameDay)],
  [
    "a map that stopped coming up before it shows one, coloured",
    !!otherDay && otherDay.length === 2 && otherDay[0].className === "poolage" && otherDay[0].textContent === "last 2026-08-08",
    JSON.stringify(otherDay),
  ],
  [
    "and says what the two dates are",
    !!otherDay && /2026-08-08/.test(otherDay[0].title) && /2026-08-12/.test(otherDay[0].title),
    otherDay && otherDay[0] && otherDay[0].title,
  ],
];
if (!poolLastPlayed) rows.push(["poolLastPlayed was found and read", false, "not in options.js"]);
for (const [name, ok, detail] of rows) console.log(`${ok ? "PASS" : "FAIL"} ${name} — ${detail}`);


// --- the replays tab's recents, as stored ------------------------------------
//
// The lists themselves are a page — clicking a name, a row appearing, the ×
// taking it away — and none of that can be reached from here. What can is the
// layer underneath, which is where every question with a wrong answer lives:
// what counts as the same entry, what order they come back in, what happens at
// the cap, and what a read does with the shape a previous version wrote. So
// `recentStore` is written to need nothing but a storage object, read out of
// options.js and driven against a fake one — the same trick as `poolLastPlayed`
// above, with `localStorage` handed in as a parameter rather than found in the
// page.

const kept = /\r?\n {2}function recentStore\(key, idOf\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
// Read out of the file rather than restated, so the assertions below cannot
// drift from the cap they are asserting.
const capped = Number((/const RECENT_CAP = (\d+);/.exec(js) || [])[1]);
const makeStore = kept
  ? new Function("localStorage", "console", "RECENT_CAP", "key", "idOf", kept[1])
  : null;

/** Enough of a Storage for a helper that only gets and sets one key. */
function fakeStorage(seed = {}) {
  const box = { ...seed };
  return {
    box,
    getItem: (name) => (name in box ? box[name] : null),
    setItem: (name, value) => {
      box[name] = String(value);
    },
  };
}
// Quiet: two of the cases below are meant to log, and a check that printed its
// own warnings would read as a failing run.
const mute = { warn() {} };
const KEY = "cdc.replay.recent";
const byId = (entry) => entry.gameId || "";
const openStore = (storage) => (makeStore ? makeStore(storage, mute, capped, KEY, byId) : null);
const idsOf = (list) => (list || []).map((entry) => (entry && entry.gameId) || "?").join(",");
/**
 * What a store hands back, and whether it threw doing it.
 *
 * Half the cases below feed it something it did not write, and "must not take
 * the tab down" is the claim being checked — so a throw is caught here and read
 * out as a failing line, rather than ending the run before the report below it
 * has been drawn at all.
 */
function allOf(store) {
  try {
    return { list: store ? store.all() : [], threw: "" };
  } catch (e) {
    return { list: [], threw: e.message };
  }
}

// One store over one fake storage, asked the four questions in order.
const box = fakeStorage();
const store = openStore(box);
if (store) {
  store.remember({ gameId: "a", map: "first" });
  store.remember({ gameId: "b" });
  store.remember({ gameId: "a", map: "second" });
}
const afterThree = store ? store.all() : [];
// Two stores over the same storage: the second one is what the tab reads after
// a reload, which is the whole point of writing anything down.
const reloaded = store ? openStore(box).all() : [];
if (store) store.forget({ gameId: "b" });
const afterForget = store ? openStore(box).all() : [];

const overflowed = openStore(fakeStorage());
if (overflowed) for (let i = 0; i < capped + 3; i++) overflowed.remember({ gameId: `g${i}` });

// The three shapes a stored list arrives in when it was not this code that
// wrote it: not json at all, not a list, and a list with holes in it. Entry `c`
// is the older shape this covers — one that named itself by some other field.
const junk = openStore(fakeStorage({ [KEY]: "{half a write" }));
const notAList = openStore(fakeStorage({ [KEY]: '{"gameId":"a"}' }));
const holes = openStore(fakeStorage({ [KEY]: '[{"gameId":"a"},null,7,{"map":"c"},{"gameId":""}]' }));

// A profile where storage is denied, which is a page that works without its
// shortcuts and must not be a page that fails to draw.
const denied = openStore({
  getItem() {
    throw new Error("access denied");
  },
  setItem() {
    throw new Error("quota exceeded");
  },
});
let survived = "no store";
if (denied) {
  try {
    denied.remember({ gameId: "a" });
    survived = `${denied.all().length} entries and no throw`;
  } catch (e) {
    survived = `threw ${e.message}`;
  }
}

// --- and drawn with no renderer loaded ---------------------------------------
//
// The recents are the one thing this panel draws before it has been asked
// anything, which puts them inside the file's own setup — so a throw in there
// is not a broken tab, it is every wiring line after it never running, on all
// four tabs. The date formatter belongs to src/replay-view.js, and that file
// failing to load is a state the rest of the panel survives by saying so; this
// is the path that has to survive it too. Drawn here against the same fake DOM
// the report uses — and the guard itself is read out of the file rather than
// stubbed, because the guard is the thing being asked about; what is handed in
// is the formatter it guards, as `null`.
const drawRecents = /\r?\n {2}function renderRecents\(\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
const guarded = /\r?\n {2}const playedOn = (.+);\r?\n/.exec(js);
const playedOnWith = (dates) =>
  guarded ? new Function("REPLAY_DATE", `return ${guarded[1]};`)(dates) : () => "no playedOn in options.js";
// Read out of the file, not stubbed, for the same reason the date guard above
// is: a row's columns and which pane opens are the two things asked about
// below, and a harness that supplied its own would be asking them of itself.
const cellSource = /\r?\n {2}(function matchCell\([\s\S]*?\r?\n {2}\})\r?\n/.exec(js);
const paneSource = /\r?\n {2}(function syncReplayPanes\(\)[\s\S]*?\r?\n {2}\})\r?\n/.exec(js);
const renderRecents = drawRecents
  ? new Function(
      "document",
      "playedOn",
      "matchCell",
      "syncReplayPanes",
      "recentPlayers",
      "recentReplays",
      "replayRecentNamesEl",
      "replayRecentListEl",
      "replayRecentPlayersEl",
      "replayRecentReplaysEl",
      "replayOpen",
      "forgetButton",
      drawRecents[1]
    )
  : null;

/**
 * One render of both lists, against a formatter that may or may not exist.
 *
 * Handed back are the panels it toggled and the row it drew, or the throw it
 * made — which is the whole question when the formatter is missing.
 */
function recentsDrawn(dates) {
  if (!renderRecents) return { threw: "renderRecents was not found in options.js", cells: [], chips: [] };
  if (!cellSource || !paneSource) {
    return { threw: "matchCell or syncReplayPanes was not found in options.js", cells: [], chips: [] };
  }
  const names = fakeNode("span");
  const list = fakeNode("div");
  const namesPanel = fakeNode("div");
  const listPanel = fakeNode("div");
  // The other pane and the strip that holds both. Nothing here draws into them,
  // and they are what says a shortcut has somewhere to be seen.
  const foundPanel = fakeNode("section");
  const matches = fakeNode("div");
  const panes = fakeNode("div");
  const matchCell = new Function("document", `return ${cellSource[1]};`)({ createElement: fakeNode });
  const syncReplayPanes = new Function(
    "replayRecentReplaysEl",
    "replayRecentListEl",
    "replayFoundEl",
    "replayListEl",
    "replayRecentNamesEl",
    "replayPanesEl",
    `return ${paneSource[1]};`
  )(listPanel, list, foundPanel, matches, names, panes);
  const stored = {
    player: { name: "Player_A", realm: "am-eu", ladder: "1v1", at: 2 },
    replay: {
      gameId: "5a41749b",
      url: "https://replays-eu.chronodivide.com/5a41749b.rpl",
      realm: "am-eu",
      map: "Tour of Egypt (2-6)",
      sides: ["Player_A", "P_B"],
      duration: 4,
      played: 1755300000000,
      at: 3,
    },
  };
  try {
    renderRecents(
      { createElement: fakeNode },
      playedOnWith(dates),
      matchCell,
      syncReplayPanes,
      { all: () => [stored.player] },
      { all: () => [stored.replay] },
      names,
      list,
      namesPanel,
      listPanel,
      "",
      () => fakeNode("button")
    );
  } catch (e) {
    return { threw: e.message, cells: [], chips: [] };
  }
  const row = (list.kids[0] || fakeNode("div")).kids[0] || fakeNode("button");
  return {
    threw: "",
    cells: row.kids.map((cell) => cell.textContent),
    chips: names.kids.map((chip) => (chip.kids[0] || {}).textContent),
    shown: !namesPanel.hidden && !listPanel.hidden && !foundPanel.hidden && !panes.hidden,
  };
}
// Standing in for the real Intl formatter: what is asked below is that the date
// column is filled from it at all, not how a date is spelled.
const withDates = recentsDrawn({ format: () => "17 Aug 2026, 14:00" });
const noView = recentsDrawn(null);

const recents = [
  ["recentStore was found in options.js and read", !!makeStore && capped > 0, `cap ${capped}`],
  [
    "the same thing asked for twice is one entry, at the front, in its newest form",
    idsOf(afterThree) === "a,b" && afterThree[0].map === "second",
    `${idsOf(afterThree)} — ${afterThree[0] && afterThree[0].map}`,
  ],
  ["and the list is there for the next page to read", idsOf(reloaded) === "a,b", idsOf(reloaded)],
  ["forgetting one entry takes that one, and it stays forgotten", idsOf(afterForget) === "a", idsOf(afterForget)],
  [
    "the list stops at the cap, dropping the oldest",
    !!overflowed && overflowed.all().length === capped && overflowed.all()[0].gameId === `g${capped + 2}`,
    overflowed ? `${overflowed.all().length} kept, newest ${overflowed.all()[0].gameId}` : "",
  ],
  [
    "a half-written value is started over rather than thrown",
    !allOf(junk).threw && !allOf(junk).list.length && !allOf(notAList).threw && !allOf(notAList).list.length,
    `${allOf(junk).threw || allOf(junk).list.length} / ${allOf(notAList).threw || allOf(notAList).list.length}`,
  ],
  [
    "and an entry the list cannot name — older shape, or half written — is dropped, not drawn",
    !allOf(holes).threw && idsOf(allOf(holes).list) === "a",
    allOf(holes).threw || idsOf(allOf(holes).list),
  ],
  ["storage that refuses costs the shortcuts and nothing else", survived === "0 entries and no throw", survived],
  [
    "it is localStorage that holds them, never the measured half",
    !!kept && /localStorage\./.test(kept[1]) && !/chrome\.storage/.test(kept[1]),
    "",
  ],
  // The panel's doc comment said "Nothing here is stored" for as long as that
  // was true. It is a claim about this file, so it is checked like one.
  ["and the panel no longer claims it stores nothing", !/Nothing here is stored/.test(js), ""],
  [
    "a remembered replay is drawn as the ladder's own row — date, map, both names, how long it ran",
    withDates.cells.join(" | ") === "17 Aug 2026, 14:00 | Tour of Egypt (2-6) | Player_A vs P_B | 4m" &&
      withDates.chips.join("") === "Player_A" &&
      withDates.shown === true,
    withDates.threw || withDates.cells.join(" | "),
  ],
  [
    "and with replay-view.js not loaded it loses its date and nothing else — this runs inside the page's own setup",
    !noView.threw &&
      noView.cells.join(" | ") === " | Tour of Egypt (2-6) | Player_A vs P_B | 4m" &&
      noView.chips.join("") === "Player_A",
    noView.threw ? `threw ${noView.threw}` : noView.cells.join(" | "),
  ],
];
for (const [name, ok, detail] of recents) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- the replay report, rendered ---------------------------------------------
//
// The build order itself is checked in scripts/check-replay.mjs; what is checked
// here is the half that turns it into a page, because that half is written
// against a DOM this repo has no browser to run. The real parser feeds the real
// renderer — src/replay-view.js is evaluated as shipped, not a copy of it — and
// the questions asked of the result are the ones the layout exists to answer: is
// there one clock down the middle, does each side read outwards from it, and do
// the two kinds of row stay distinguishable. A placement is a building that
// exists and an order is an intent; a report that painted them alike would be
// stating something the file does not say.
//
// It used to evaluate the `// --- replays ---` region of options.js, which is
// where the renderer lived until 2026-08-16. It is its own file now because the
// published site draws the same report, and a file is a cheaper thing to run
// than a region — the harness below no longer has to hand it the panel's
// elements, since it no longer has any.

/** Enough of a DOM for a renderer that only ever writes. */
function fakeNode(tag) {
  return {
    tag,
    className: "",
    // `el.textContent = ""` is how everything in this repo empties a container,
    // and on a real node it drops the children. A fake that kept them made a
    // redraw look like a second copy appended to the first, which is a passing
    // count of twice the right thing.
    _text: "",
    get textContent() {
      return this._text;
    },
    set textContent(value) {
      this._text = String(value);
      if (this._text === "") this.kids.length = 0;
    },
    title: "",
    hidden: false,
    // Custom properties are how the report hands geometry to the stylesheet — a
    // cameo's place in the sheet and its scale — so they are readable here the
    // same way a plain style property is.
    style: {
      setProperty(name, value) {
        this[name] = String(value);
      },
      getPropertyValue(name) {
        return this[name] ?? "";
      },
    },
    attrs: {},
    kids: [],
    // What a pane asks before deciding whether it is worth a strip of the page.
    // Everything a renderer appends here is an element, so the two counts are
    // the same number.
    get childElementCount() {
      return this.kids.length;
    },
    // Kept rather than dropped, because one thing in the report has no rendering
    // until it is clicked: a loss total opens into its parts, and the state is
    // in the DOM by design, so there is no option to re-render with instead.
    on: {},
    // **A node already here is moved, not copied.** That is what a real `append`
    // does, and the report leans on it: the running order lays the whole list of
    // charts out again to reorder them, and a fake that pushed would have
    // reported eleven charts as twenty-two rather than as rearranged.
    append(...children) {
      for (const child of children) {
        const at = this.kids.indexOf(child);
        if (at >= 0) this.kids.splice(at, 1);
        this.kids.push(child);
      }
    },
    // A row puts its cameo on the outside of the clock, which on the left side
    // means before everything already in the cell.
    prepend(...children) {
      this.kids.unshift(...children);
    },
    // Moves, like `append` above and for the same reason: it is how the running
    // order puts one chart in its new place without touching the other eight.
    // A null reference appends, which is what the real one does.
    insertBefore(child, before) {
      const had = this.kids.indexOf(child);
      if (had >= 0) this.kids.splice(had, 1);
      const at = before ? this.kids.indexOf(before) : -1;
      if (at < 0) this.kids.push(child);
      else this.kids.splice(at, 0, child);
      return child;
    },
    setAttribute(name, value) {
      this.attrs[name] = String(value);
      if (name === "class") this.className = String(value);
    },
    getAttribute(name) {
      return name in this.attrs ? this.attrs[name] : null;
    },
    addEventListener(name, fn) {
      (this.on[name] = this.on[name] || []).push(fn);
    },
    getBoundingClientRect: () => ({ left: 0, width: 640 }),
  };
}
const flat = (node) => [node, ...node.kids.flatMap(flat)];
// What a reader would actually see: a folded disclosure is drawn and not read,
// so the whole subtree under `hidden` is skipped rather than counted as text.
const seen = (node) => (node.hidden ? [] : [node, ...(node.kids || []).flatMap(seen)]);
const text = (node) =>
  seen(node)
    .map((n) => n.textContent)
    .filter(Boolean)
    .join(" ");
/** The same, run together the way it is drawn — for a line compared word for word. */
const read = (node) => (!node || node.hidden ? "" : (node.textContent || "") + (node.kids || []).map(read).join(""));

/**
 * A timeline cell as a reader sees it, left to right.
 *
 * `read` cannot do it: the fake DOM keeps `textContent` as a scalar beside a
 * list of children, so where a cell's own text sits *among* its children is not
 * expressible — and two of a row's marks are children, prepended in front of the
 * words (who did it, and the readiness a placement absorbed) while the
 * overclicks are appended behind them. So the order is reconstructed from the
 * classes, which is a claim about the renderer worth stating out loud rather
 * than a fact the harness could observe.
 */
const AHEAD = ["replaywho", "replayready"];
const rowText = (cell) => {
  const kids = cell.kids || [];
  const of = (names) => kids.filter((k) => names.includes(k.className)).map((k) => k.textContent).join("");
  // The gaps after a mark are non-breaking (see `GAP` in replay-view.js — a flex
  // item's edge whitespace is stripped, so an ordinary one would vanish). Read
  // back as ordinary here, because these assertions are about what a reader
  // sees and a reader sees a space. Which *kind* of space it is has an
  // assertion of its own, further down, and that one must not be normalised.
  return (of(AHEAD) + (cell.textContent || "") + of(["replayover"])).replace(/ /g, " ");
};

globalThis.window = globalThis;
/**
 * A `localStorage` for the renderer, which keeps the reader's chart order in one.
 *
 * Node has none, and `replay-view.js` reads it through a `typeof` guard — so
 * without this every ordering assertion below would be asking about the branch
 * where nothing is remembered, and passing. It is the shape the browser's is,
 * to the two methods that are used.
 */
const localStore = new Map();
globalThis.localStorage = {
  getItem: (key) => (localStore.has(key) ? localStore.get(key) : null),
  setItem: (key, value) => localStore.set(key, String(value)),
  removeItem: (key) => localStore.delete(key),
};
/**
 * A window that takes listeners, because the drag follows the pointer on one.
 *
 * The renderer cannot capture the pointer on the grip — reordering the list
 * moves the grip's own figure, and moving a capturing element releases the
 * capture — so it listens on the window for the length of the gesture. Node's
 * `globalThis` is not an `EventTarget`, and without this the whole gesture is
 * the branch where nothing was ever wired.
 */
const windowOn = new Map();
globalThis.addEventListener = (name, fn) => {
  if (!windowOn.has(name)) windowOn.set(name, new Set());
  windowOn.get(name).add(fn);
};
globalThis.removeEventListener = (name, fn) => {
  if (windowOn.has(name)) windowOn.get(name).delete(fn);
};
/** Every window listener of a kind, fired the way the browser would. */
const windowFire = (name, event) => {
  for (const fn of [...(windowOn.get(name) || [])]) fn(event);
};
new Function(readFileSync(join(here, "fixtures", "replay-types.js"), "utf8"))();
new Function(readFileSync(join(src, "replay.js"), "utf8"))();
// The sheet the renderer draws row icons from — loaded here so the icons are
// exercised rather than skipped. The renderer treats it as optional (a host that
// has not loaded it draws words), and that fallback is asserted separately below.
// The fixture rather than a shipped file: the extension harvests its sheet from
// the running client, so there is nothing on disk to load. It carries the real
// index and the real geometry over a 1×1 transparent stand-in, which is all
// these assertions read — see its header.
new Function(readFileSync(join(here, "fixtures", "cameo-ids.js"), "utf8"))();
const fixture = readFileSync(join(here, "fixtures", "ladder-1v1.rpl"), "utf8");
// The parsed replay is kept as well as the report: a question the fixture does
// not ask by itself is asked by adding an event to it and analysing again, which
// is a truer doctoring than editing the report — the answer then comes out of
// the queue model rather than being written in by hand.
const parsed = globalThis.__cdcReplay.parse(fixture);
const report = globalThis.__cdcReplay.analyze(parsed);
// With the harvest merged, because losses share the timeline with the build
// order and that is the half this check exists to hold still.
const harvest = JSON.parse(readFileSync(join(here, "fixtures", "sim-5a41749b.json"), "utf8"));
// The committed harvest predates the spawn, queue-status and capture events, so
// the three tracks a re-run adds are handed in by name here: deliveries, two
// buildings finishing, and two buildings changing hands — one off a player, one
// off the map's civilians, who are not a side of the match. Enough to check they
// reach the timeline as their own kinds of row.
//
// The clock runs at 60 ticks to the second, and both readiness events are aimed
// at Player_A's War Factory, which the file places at 1:02 (62.13s):
//
//   tick 3720 -> 62.0s — the same second as the placement, so there is no wait
//                to draw and the two rows are one fact printed twice
//   tick 3900 -> 65.0s — a readiness with no placement in its second, which is
//                the row the ✓ track exists for
//
// The two deliveries are nine seconds apart, which the loss window used to chain
// into one row printed at the first one's second.
globalThis.__cdcReplay.mergeSim(report, {
  ...harvest,
  produced: [
    { tick: 9000, name: "HTNK", kind: 7, owner: "Player_A" },
    { tick: 9540, name: "HTNK", kind: 7, owner: "Player_A" },
    // Two building spawns, which are the two halves of the deploy test: the
    // file places Player_A's War Factory at 62.13s, so the first is that
    // placement seen from the re-run and draws nothing extra — and nothing in
    // the file places a Construction Yard at all, so the second is an MCV
    // standing up, at 0:03, on a side that has no other row that second.
    { tick: 3730, name: "NAWEAP", kind: 2, owner: "Player_A" },
    { tick: 180, name: "NACNST", kind: 2, owner: "Player_A" },
  ],
  ready: [
    { tick: 3720, name: "NAWEAP", owner: "Player_A" },
    { tick: 3900, name: "NAWEAP", owner: "Player_A" },
  ],
  captures: [
    { tick: 6000, name: "NAREFN", kind: 2, owner: "P_B", from: "Player_A" },
    { tick: 7200, name: "CAOILD", kind: 2, owner: "Player_A", from: "Civilians" },
  ],
});

const reportEl = fakeNode("div");
// A fragment is a node that collects children and nothing else, which is all the
// renderer asks of the one it returns.
const fakeDocument = {
  createElement: fakeNode,
  createElementNS: (ns, tag) => fakeNode(tag),
  createTextNode: (value) => ({ textContent: value, kids: [] }),
  createDocumentFragment: () => fakeNode("#fragment"),
  // The cameo sheet is a data URL a couple of hundred kilobytes long, so the
  // renderer writes it onto the root element once as a custom property rather
  // than into every icon. What is kept here is *that it was written once*.
  documentElement: { style: { props: {}, setProperty(name, value) { this.props[name] = value; } } },
};
new Function("document", "window", "console", readFileSync(join(src, "replay-view.js"), "utf8"))(
  fakeDocument,
  globalThis,
  console
);
const replays = globalThis.__cdcReplayView || null;
if (replays) reportEl.append(replays.render(report, { losses: true, note: "loss for Player_A" }));

const painted = replays ? flat(reportEl) : [];

/**
 * The axis is **one** grid, not a stack of row elements, so a run's picture can
 * span the lines it braces — and a line is therefore whatever shares a grid row,
 * read out of the `grid-area` the renderer writes.
 *
 * `grid-area` is `row / column` for a cell and `row / column / span n` for a
 * picture, so the first field is the line and the second is which of the five
 * columns it sits in.
 */
// `Number("")` is 0, so an item with no `grid-area` at all — the header block,
// which is placed by the stylesheet — has to be rejected before it is parsed,
// or it joins the lines as line zero.
const gridRow = (node) => (node.style.gridArea ? Number(String(node.style.gridArea).split("/")[0].trim()) : NaN);
const gridCol = (node) => (node.style.gridArea ? Number(String(node.style.gridArea).split("/")[1].trim()) : NaN);
const gridSpan = (node) => {
  const span = /span\s+(\d+)/.exec(String(node.style.gridArea || ""));
  return span ? Number(span[1]) : 1;
};
function axisLines(nodes) {
  const axis = nodes.find((n) => n.className === "replayaxis");
  const byRow = new Map();
  for (const kid of axis ? axis.kids : []) {
    const row = gridRow(kid);
    if (!Number.isFinite(row)) continue;
    if (!byRow.has(row)) byRow.set(row, []);
    byRow.get(row).push(kid);
  }
  return [...byRow.keys()].sort((a, b) => a - b).map((row) => ({ row, items: byRow.get(row) }));
}
const axisLinesHere = axisLines(painted);
const readClock = (node) => (node ? (node.kids || []).map(read).join(" / ") : "");
const clocks = axisLinesHere.map((l) => readClock(l.items.find((k) => k.className === "replayat")));
const cellsOf = (kind) => painted.filter((n) => (n.className || "").startsWith("replaycell " + kind));
const built = cellsOf("built");
const queued = cellsOf("queued");
const lost = cellsOf("lost");
const runHolders = painted.filter((n) => (n.className || "").startsWith("replaycameorun"));

// The stylesheet as text. Geometry cannot be checked in a fake DOM — there is no
// layout here — but *which element draws what* can be, and that is where the one
// bug this file could not otherwise catch lived: a rule drawn in two pieces by
// two different placement rules, landing half a pixel apart.
const replayCss = readFileSync(join(src, "replay-view.css"), "utf8");
// Every custom property the report's stylesheet declares, by name. The palette
// is the part of it worth asserting against — a row's colour means something
// only as long as it is the one row wearing it.
const cssVars = new Map([...replayCss.matchAll(/(--[a-z0-9-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

const cssBlocks = (selector) =>
  [...replayCss.matchAll(/([^{}]+)\{([^}]*)\}/g)]
    .filter(([, head]) => head.includes(selector))
    .map(([, , body]) => body);

// The one rule the header rows and the axis share — the five-column grid that
// puts the clock in the same place in both. Found by the variable only it names,
// since its selector list is two names and its body is the layout itself.
const axisGrid = cssBlocks(".replayaxis").find((body) => body.includes("grid-template-columns")) || "";

/**
 * Every place in one column where the same object is named on two rows running,
 * and whether one picture covers the pair.
 *
 * This is the chain rule read off the report's own output rather than
 * re-derived from the renderer: naming the same thing twice is where a run can
 * happen, and which of those pairs actually became one is the whole claim.
 *
 * "Two rows running" means running *in that column*. A line where only the other
 * side acted sits between them on the page and is not an interruption.
 */
// Every mark a row can lead with — since 0.46.0 that is every row, an order's
// `$` and a placement's `+` included — so this list is written against
// `ROW_MARK` in src/replay-view.js and has to move with it. A mark missing from
// here leaves it on the front of the name, two rows about one object stop
// looking like one object, and the chain assertions below fail on their
// own `length > 0` guard rather than passing over an empty set.
const objectOf = (text) =>
  String(text)
    .replace(/^[$+−<>✓⚑⇄\s]+/, "")
    .replace(/\s*×\d+$/, "")
    .trim();
const sameObjectPairs = (side) => {
  const rows = painted
    .filter(
      (n) =>
        (n.className || "").startsWith("replaycell ") &&
        n.className.split(" ").includes("s" + side) &&
        !n.className.split(" ").includes("empty")
    )
    .map((n) => ({ row: gridRow(n), kind: n.className.split(" ")[1], object: objectOf(rowText(n)) }))
    .sort((a, b) => a.row - b.row);
  const holders = runHolders.filter((h) => h.className.split(" ").includes("s" + side));
  const pairs = [];
  for (let i = 1; i < rows.length; i++) {
    if (rows[i - 1].object !== rows[i].object) continue;
    pairs.push({
      before: rows[i - 1],
      after: rows[i],
      joined: holders.some((h) => gridRow(h) <= rows[i - 1].row && gridRow(h) + gridSpan(h) - 1 >= rows[i].row),
    });
  }
  return pairs;
};
const chainPairs = [...sameObjectPairs(1), ...sameObjectPairs(2)];
const pairsWhere = (test) => chainPairs.filter((p) => test(p.before.kind, p.after.kind));
const saidAs = (pairs) => pairs.map((p) => `${p.before.kind}->${p.after.kind} ${p.after.object} ${p.joined ? "one" : "two"}`).join(" | ");

// Every line is [left text, clock, right text] in the middle three of the five
// columns — the clock in the third, a side's words eithered of it. That is the
// whole layout stated as an assertion, and it survived the axis becoming one
// grid: what used to be "the middle child of three" is now "column 3".
const shaped = axisLinesHere.every((line) => {
  const cells = line.items.filter((k) => (k.className || "").startsWith("replaycell"));
  const stamp = line.items.filter((k) => k.className === "replayat");
  return (
    cells.length === 2 &&
    stamp.length === 1 &&
    gridCol(stamp[0]) === 3 &&
    cells.some((c) => gridCol(c) === 2) &&
    cells.some((c) => gridCol(c) === 4)
  );
});
// Two things done in the same second share one clock reading rather than making
// two lines that look sequential.
const stamped = clocks.filter(Boolean);
const ordered = stamped.every((at, i) => i === 0 || toSeconds(stamped[i - 1]) <= toSeconds(at));
function toSeconds(mmss) {
  const [m, s] = mmss.split(":").map(Number);
  return m * 60 + s;
}

// The same report with the overclicks asked for. A second render rather than a
// tick of the box, because the fake DOM has no events — what is being checked is
// that the option reaches the rows, not that a checkbox fires.
const withOverclicks = replays ? flat(replays.render(report, { losses: true, overclicks: true })) : [];
const overRows = withOverclicks.filter((n) => n.className === "replayover");

/**
 * Every cell on the axis in the order it is drawn, each carrying the second it
 * sits under. The clock is printed once per group of rows, so a row without one
 * belongs to the last one printed — and the order inside a group is the thing
 * being asserted below: a row that explains the losses under it has to be drawn
 * above them, which nothing but this sequence can say.
 */
function timeline(nodes) {
  const out = [];
  let at = "";
  for (const line of axisLines(nodes)) {
    at = readClock(line.items.find((k) => k.className === "replayat")) || at;
    for (const cell of line.items) if ((cell.className || "").startsWith("replaycell ")) out.push({ at, cell });
  }
  return out;
}
const isKind = (entry, kind) => entry.cell.className.startsWith("replaycell " + kind);
const axisLine = timeline(painted);
const dropAt = axisLine.findIndex((entry) => isKind(entry, "dropped"));
// Every row either half of a capture drew, read off the same sequence as
// everything else: the pair landing at one second on the two sides of the clock
// is the claim, and only the drawn order can say it.
const captureLine = axisLine.filter((entry) => isKind(entry, "taken") || isKind(entry, "ceded"));
const drawnAs = (entry) => `${entry.at} ${entry.cell.className} ${rowText(entry.cell)}`;

// The committed fixture carries no resignation — its loser is dropped at 243.2,
// which is the client noticing a dead base rather than a decision — so that half
// is read off a copy of the report with one patched in. Copied shallowly and
// only in a player's own scalars: the harvest's rows are keyed by name and are
// untouched by it. 242.9 puts the resignation between Player_A's last two
// losses, so a row ordered by its timestamp would land between them too.
const quitReport = {
  ...report,
  players: report.players.map((player) => (player.name === "Player_A" ? { ...player, resigned: 242.9, dropped: 0 } : player)),
};
const quitLine = replays ? timeline(flat(replays.render(quitReport, { losses: true }))) : [];
const quitAt = quitLine.findIndex((entry) => isKind(entry, "resigned"));
const lossesUnder = quitLine
  .map((entry, i) => (isKind(entry, "lost") && entry.cell.className.includes("s1") && entry.at === "4:02" ? i : -1))
  .filter((i) => i >= 0);

// One side made deliberately longer than the other, for the width guard further
// down. An order row rather than anything cleverer: it is the one kind of row the
// file alone produces, so this doctoring survives a report with no harvest.
const LONG_LABEL = "A Label Longer Than Anything In This Match";
const widerReport = {
  ...report,
  players: report.players.map((player, index) =>
    index === 0
      ? {
          ...player,
          order: [...player.order, { at: 3, kind: "queued", object: { label: LONG_LABEL, name: "LONG" }, quantity: 1, ordered: 1, overclick: 0 }],
        }
      : player
  ),
};

// The same file with nothing merged into it. Deliveries and losses are behind a
// re-run and this row must not be: the site draws reports that have never been
// re-run at all, and a resignation is in the file either way.
const fresh = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
const freshLine = replays ? timeline(flat(replays.render(fresh))) : [];

// --- the header ---------------------------------------------------------------
//
// One row per kind of line, so the two sides cannot drift: the header used to be
// two stacked columns of different heights, bottom-aligned, which opened the
// shorter side with a blank line and put the same kind of fact at two different
// heights either side of the clock.
const axisStyle = () => (painted.find((n) => n.className === "replayaxis") || { style: {} }).style || {};
const headRows = painted.filter((n) => (n.className || "").startsWith("replayrow head"));
const headCell = (row, side) => (row ? row.kids[side === "left" ? 0 : 2] : null);
const kindOf = (row, side) => ((headCell(row, side) || {}).className || "");
const rowOfKind = (rows, kind) => rows.find((row) => kindOf(row, "left") === kind) || null;
const chipsOf = (cell) => (cell ? cell.kids.filter((k) => k.className === "replaychip").map((k) => k.textContent) : []);
const hasClass = (node, name) => ((node && node.className) || "").split(" ").includes(name);
// What a row is about is the middle column's now, said once for both sides — a
// clock reading on the name row, a label on every other. `labelOf` reads it
// whichever it is, so a row that changed kind is a wrong answer here rather than
// a missing one.
const labelOf = (row) => (row ? read(row.kids[1]) : "");
const midOf = (row) => ((row && row.kids[1].className) || "");
const rowOfLabel = (rows, label) => rows.find((row) => labelOf(row) === label) || null;
// A cell's numbers without its chips: the separators are the drawn ones, so what
// is read back is the line a reader would copy out of the header.
const numbersOf = (cell) =>
  cell
    ? (cell.kids || [])
        .filter((k) => k.className !== "replaychip")
        .flatMap((k) => (k.className === "replaycount" ? (k.kids || []).map(read) : [read(k)]))
        .filter(Boolean)
        .join(" ")
    : "";
// The one phrase in a mirrored cell that keeps its own order, read as the DOM
// holds it — the air between its three words is the cell's flex gap, not text.
const whoSaid = (row, i) => read(flat(row.kids[i]).find((k) => k.className === "replaywho") || fakeNode("i"));
const inOrder = (said, ...parts) =>
  parts.every((part, i) => said.includes(part) && (!i || said.indexOf(part) > said.indexOf(parts[i - 1])));
const nameRow = headRows[0] || null;
const statsRow = rowOfLabel(headRows, "produced");
const lostRow = rowOfKind(headRows, "replaylost");

// The split needs a resignation, and the committed fixture has none — its loser
// is *dropped* at 243.2, which the client writes when a base is already gone, so
// everything it explains happened before it and the at-defeat block is rightly
// empty. So the split is read off a doctored copy: 215 sits in the four-second
// gap between Player_A's last Sentry Gun (214.3) and their Tesla Reactor,
// which is where that base starts coming apart. Doctored is the only coverage
// this can have, since a fixture with a real resignation would be a second
// replay file.
const splitReport = {
  ...report,
  players: report.players.map((player) => (player.name === "Player_A" ? { ...player, resigned: 215, dropped: 0 } : player)),
};
const splitHead = replays ? flat(replays.render(splitReport, { losses: true })).filter((n) => (n.className || "").startsWith("replayrow head")) : [];
const inPlayRow = rowOfKind(splitHead, "replaylost");
const atDefeatRow = rowOfKind(splitHead, "replaylost atdefeat");

// The same player carrying both fields — a resignation at 215 and the drop the
// file actually records at 243.2. Nothing in either replay here has both, so the
// question is latent, and two answers to it would show up exactly one line
// apart: the verdict naming one moment and the losses splitting at the other.
const bothReport = {
  ...report,
  players: report.players.map((player) => (player.name === "Player_A" ? { ...player, resigned: 215 } : player)),
};
const bothHead = replays ? flat(replays.render(bothReport, { losses: true })).filter((n) => (n.className || "").startsWith("replayrow head")) : [];
const bothVerdict = (flat(bothHead[0] || fakeNode("div")).find((n) => n.className === "replayverdict lost") || {}).textContent;

// Neither replay in this repo cancels anything, so the cancel path is read off a
// doctored copy of the fixture: P_B's five Rhinos, cancelled twenty seconds later
// as forty. The modelled queue cannot possibly account for forty, and the part it
// cannot account for is what used to be added to the overclick count — thirty
// clicks the game was supposed to have thrown away, out of one gesture.
const rhinos = parsed.events.find((event) => event.update === "Add" && event.object && event.object.name === "HTNK");
const cancelReport = globalThis.__cdcReplay.analyze({
  ...parsed,
  events: [...parsed.events, { ...rhinos, update: "Cancel", quantity: 40, tick: rhinos.tick + 20 * parsed.ticksPerSecond }],
});
const cancelPainted = replays ? flat(replays.render(cancelReport)) : [];
const cancelCell = cancelPainted.find((n) => (n.className || "").startsWith("replaycell cancelled")) || null;

// --- a total and its parts ----------------------------------------------------
//
// Every loss total used to be a disclosure: a button that opened onto units and
// buildings, one group per row so both sides opened together. What is asserted
// now is that there is no second rendering to reach — no control anywhere in the
// header, and the parts drawn in the report a reader sees without touching it.
const controlIn = (cell) => (cell ? flat(cell).find((n) => n.tag === "button" || hasClass(n, "replaytotal")) : null);
const sideBySide = (row, how) => [how(headCell(row, "left")), how(headCell(row, "right"))].join(" / ");
const statsPair = () => sideBySide(statsRow, numbersOf);
const lostPair = () => sideBySide(lostRow, numbersOf);
const lostLedger = () => sideBySide(rowOfLabel(headRows, "lost"), numbersOf);
// The detail the source knows and the line does not carry: the units figure is
// the one place infantry, vehicles and aircraft survive.
const unitsTitle =
  ((flat(headCell(rowOfLabel(headRows, "lost"), "left")).find((n) => /\d+ units/.test(n.textContent || "")) || {}).title) || "";
// The two blocks a resignation splits the losses into — a second source, counted
// off the destroy events rather than off the counter, and the one place the two
// halves can be checked against the whole.
const splitSaid = [numbersOf(headCell(inPlayRow, "left")), numbersOf(headCell(atDefeatRow, "left"))].join(" / ");
const splitSaidRight = numbersOf(headCell(inPlayRow, "right"));

/**
 * A total read back as numbers: the number it states, and the two parts under
 * it. What is asserted is that the second two make the first — a split that does
 * not sum is a number and its parts disagreeing, which is the one thing this
 * feature must never do.
 */
function adds(said) {
  const [, total, buildings, units] = /^(\d+) total (\d+) buildings (\d+) units$/.exec(said.trim()) || [];
  return total !== undefined && Number(units) + Number(buildings) === Number(total);
}

// A harvest taken before the client was asked for the breakdown: the total is
// there and there is nothing to open it into. It has to stay a plain number —
// a control saying `0 units · 0 buildings` beside `40 lost` is exactly the
// disagreement the split exists to prevent.
const noKinds = {
  ...report,
  players: report.players.map((player) => (player.sim ? { ...player, sim: { ...player.sim, byKind: {} } } : player)),
};
const noKindsRow = replays
  ? rowOfLabel(flat(replays.render(noKinds, { losses: true })).filter((n) => (n.className || "").startsWith("replayrow head")), "lost")
  : null;

// A match nobody resigned and nobody dropped out of — won by capturing the last
// building, which is in neither the file nor the counters. The harvest is the
// only witness: `defeatedAt` is the first sample that saw the player out. Read
// off a copy of the fixture with both of the file's own witnesses removed, since
// this repo has no such replay.
const capturedReport = replays
  ? {
      ...report,
      players: report.players.map((player) =>
        player.name === "Player_A"
          ? { ...player, resigned: 0, dropped: 0, sim: { ...player.sim, defeated: true, defeatedAt: 231.5 } }
          : player
      ),
    }
  : null;
const capturedPaint = replays ? flat(replays.render(capturedReport, { losses: true })) : [];
const capturedHead = capturedPaint.filter((n) => (n.className || "").startsWith("replayrow head"));
const capturedRow = capturedPaint.filter((n) => (n.className || "").startsWith("replaycell defeated"));

const curves = replays ? replays.replayCurves(report, replays.replaySides(report)) : null;
const lines = painted.filter((n) => n.tag === "polyline");

// --- the economy charts -------------------------------------------------------
//
// The rate is read off the committed harvest untouched: `gained` is a lifetime
// counter and every sample of it is real, so nothing has to be handed in. The
// two counts are a walk of the players' objects, which that harvest predates —
// so they are handed in on a copy, and the untouched report is what says the
// charts stay away when nobody counted.
const economy = replays ? replays.simCurves(report, replays.replaySides(report)) : null;
/**
 * The property that makes the rate arithmetic checkable without trusting it:
 * income integrated back over the intervals it was measured on has to come to
 * the lifetime counter it was differenced out of. A rate scaled by the wrong
 * factor, or differenced against the wrong neighbour, cannot survive this.
 */
const integrated = (line) => {
  const samples = report.sim.samples;
  return Math.round(((line && line.points) || []).reduce((total, [at, rate], n) => total + (rate / 60) * (at - samples[n].at), 0));
};
/** Undefined-safe, so a build with no economy in it reports FAIL rather than throwing. */
const seriesOf = (curves, key) => (curves && curves[key]) || [];
/** The heights a line actually takes, ignoring the flat stretches between them. */
const distinct = (line) => [...new Set(((line && line.points) || []).map((p) => Math.round(p[1])).filter(Boolean))].sort((a, b) => a - b);
/** How many samples in a row read the same non-zero rate — one means no window was applied. */
const plateau = (line) => {
  let run = 0;
  let best = 0;
  let last = null;
  for (const [, value] of (line && line.points) || []) {
    run = value && value === last ? run + 1 : 1;
    last = value;
    if (value) best = Math.max(best, run);
  }
  return best;
};
const held = (line) => ((line && line.points) || []).filter((p) => p[1] === 1).length;
// Two miner types on one side and one on the other: a side that fields two has
// captured something that builds the other one, and its lines have to say which
// is which — while a side with no choice to make keeps its own name.
const walked = {
  ...harvest,
  samples: harvest.samples.map((row, n) => ({
    ...row,
    players: row.players.map((player) =>
      player.name === "P_B"
        ? { ...player, harvesters: n > 20 ? { HARV: 2, CMIN: 1 } : { HARV: 2 }, derricks: n > 30 ? 1 : 0 }
        : { ...player, harvesters: { HARV: 1 }, derricks: 0 }
    ),
  })),
};
const walkedReport = globalThis.__cdcReplay.mergeSim(
  globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture)),
  walked
);
const walkedCurves = replays ? replays.simCurves(walkedReport, replays.replaySides(walkedReport)) : null;

// A harvest saved mid-run — what a checkpoint is — and what the report says
// about one. The number is the point: "stopped early" told a reader nothing
// about whether the run had covered a minute of the match or all but the last
// twenty seconds.
const partialReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(partialReport, {
  ...harvest,
  complete: false,
  checkpoint: true,
  tick: 9700,
  endTick: 10000,
});
const partialEl = fakeNode("div");
if (replays) partialEl.append(replays.render(partialReport, {}));
const partialFacts = flat(partialEl)
  .filter((n) => n.className === "replayfacts")
  .map((n) => (n.kids || []).map((k) => ((k.kids || []).length ? (k.kids || []).map(read).join(" / ") : read(k))).join(" "))
  .join(" ");

// The two clocks a match has. A ladder match runs at 60 ticks a second — the wall
// clock the ladder's own record agrees with — while the client's own clock counts
// 15 a second whatever the speed, so the same 4:03 reads 16:13 on screen. A match
// played at 15 has one clock and is offered no choice.
const clocked = (mode, rate = 60) => {
  const one = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
  one.ticksPerSecond = rate;
  const el = fakeNode("div");
  if (replays) el.append(replays.render(one, { clock: mode, onClock: () => {} }));
  const nodes = flat(el);
  return {
    facts: nodes
      .filter((n) => n.className === "replayfacts")
      .map((n) => (n.kids || []).map((k) => (k.kids || []).length ? (k.kids || []).map(read).join(" / ") : read(k)).join(" "))
      .join(" "),
    picker: nodes.some((n) => n.tag === "select"),
    // One element per reading, and the axis's own column counted for them.
    readings: nodes.filter((n) => n.className === "replaytime").length,
    slash: nodes.some((n) => /\//.test(n.textContent || "")),
    column: ((nodes.find((n) => n.className === "replayaxis") || { style: {} }).style || {})["--cdc-clock-ch"] || "",
  };
};
const realClock = clocked("real");
const gameClock = clocked("game");
const bothClock = clocked("both");
const slowClock = clocked("real", 15);

const drawn = [
  ["real time is the wall clock the ladder's own record agrees with", /4:03/.test(realClock.facts) && !/\(/.test(realClock.facts), realClock.facts],
  ["the game clock is the client's own — the same ticks at 15 a second", /16:13/.test(gameClock.facts), gameClock.facts],
  // Two clocks over one moment, neither of them an aside to the other — and the
  // thing between them is a rule, so there is no character to find. Every line of
  // the axis prints the pair, so the count is per reading, not per row; the
  // column is counted for the characters and measured for the rule between them.
  [
    "both prints the pair, with a rule between them and no separator in the text",
    /4:03 \/ 16:13/.test(bothClock.facts) &&
      !bothClock.slash &&
      bothClock.readings === 2 * realClock.readings &&
      bothClock.column === "calc(9ch + 23px)",
    `${bothClock.facts} · ${bothClock.readings} readings, column ${bothClock.column}, slash in text: ${bothClock.slash}`,
  ],
  [
    "the head line holds its facts apart with a rule, not with a character",
    !/·/.test(realClock.facts) &&
      flat(reportEl).filter((n) => n.className === "replayfact").length === 5 &&
      !flat(reportEl).some((n) => /·/.test(n.textContent || "")),
    `${flat(reportEl).filter((n) => n.className === "replayfact").length} facts · ${realClock.facts}`,
  ],
  ["a match with two clocks offers the choice", realClock.picker, ""],
  ["a match played at the clock's own rate has one, and is offered none", !slowClock.picker, slowClock.facts],
  ["a harvest saved mid-run says what share of the match it covers", /covers 97% of the match/.test(partialFacts), partialFacts],
  ["and is not passed off as a finished one", !/re-run in /.test(partialFacts), partialFacts],
  ["src/replay-view.js was evaluated and published its api", !!replays, replays ? "" : "no window.__cdcReplayView"],
  ["the map is named", painted.some((n) => n.textContent === "Tour of Egypt (2-6)"), ""],
  ["one clock column, in the middle of every line", shaped && axisLinesHere.length > 0, `${axisLinesHere.length} lines`],
  ["the clock only ever goes forwards", ordered, stamped.slice(0, 4).join(" ")],
  ["every placement is a cell", built.length === 18, `${built.length} placements`],
  // Twelve unit orders and eighteen building orders — every placement above has
  // one, since a structure is now two rows: the decision and the building.
  ["and every order is one too", queued.length === 31, `${queued.length} orders`],
  ["a building ordered and never placed says so", cellsOf("queued").some((n) => n.className.includes("unplaced")), ""],
  // The three tracks a row can be: ordered (the file), came out and finished-and-
  // waiting (the re-run). A delivery is marked +, a building ready to place ✓, so
  // neither can be mistaken for the order above it.
  //
  // Two deliveries nine seconds apart are two rows: the delivery track's whole
  // worth is the second it names, so a run of them may not be folded into one.
  [
    "a delivery is its own row, one per second it landed in",
    cellsOf("made").map((n) => n.textContent).join("|") === "+Rhino Heavy Tank|+Rhino Heavy Tank",
    cellsOf("made").map((n) => n.textContent).join("|"),
  ],
  [
    "so is a building finishing, when it then had to wait",
    cellsOf("ready").map(rowText).join("|") === "✓ Soviet War Factory",
    cellsOf("ready").map(rowText).join("|"),
  ],
  // And when it did not wait at all, the pair is one row. Ready and placed in the
  // same second are one fact, and printing it twice — once bright without the
  // mark, once faint with it — says the building arrived twice.
  [
    "a building placed the second it finished is one row, and the bright one",
    built.filter((n) => n.className.includes("wasready")).map(rowText).join("|") === "✓ +Soviet War Factory",
    built.filter((n) => n.className.includes("wasready")).map(rowText).join("|"),
  ],
  [
    // The bug this exists for: `.replaycell` is a flex row, so a mark drawn as
    // its own element is a flex item, and **a flex item's edge whitespace is
    // stripped**. An ordinary space at the end of one is not narrow, it is
    // gone: the readiness mark rendered as one word from 0.46.2, and nothing
    // here noticed, because every assertion compared text this harness had
    // already joined back together.
    //
    // Asserted over *every* leading element on the axis rather than the one
    // that happens to be an element today: the failure is silent and arrives
    // whenever a mark becomes one.
    "no mark drawn as its own element ends in a space a flex row would eat",
    (() => {
      const leading = painted.flatMap((n) => (n.kids || []).filter((k) => AHEAD.includes(k.className)));
      return leading.length > 0 && leading.every((k) => !/ $/.test(k.textContent));
    })(),
    painted
      .flatMap((n) => (n.kids || []).filter((k) => AHEAD.includes(k.className)))
      .map((k) => `${k.className} ends U+${k.textContent.charCodeAt(k.textContent.length - 1).toString(16).padStart(4, "0")}`)
      .join(" | ") || "no leading element drawn",
  ],
  [
    // And the two halves are not equals. The `+` is the fact — the building is
    // there — and the `✓` is the quieter one about how it got there, so it is
    // drawn at the readiness row's own dimness. Its own element for that reason:
    // part of a text node cannot be painted, so if this stops being a span the
    // mark silently goes as bright as the row it sits on.
    "and the ✓ on it is a dim element, at the readiness row's own dimness",
    (() => {
      const merged = built.filter((n) => n.className.includes("wasready"));
      const ticks = merged.flatMap((n) => (n.kids || []).filter((k) => k.className === "replayready"));
      const dim = (selector) => (cssBlocks(selector).join("").match(/opacity:\s*([\d.]+)/) || [])[1];
      return (
        merged.length === 1 &&
        ticks.length === 1 &&
        ticks[0].textContent.replace(/ /g, " ") === "✓ " &&
        !!dim(".replayready") &&
        dim(".replayready") === dim(".replaycell.ready")
      );
    })(),
    `${built.filter((n) => n.className.includes("wasready")).flatMap((n) => (n.kids || []).map((k) => k.className)).join("+")} · ` +
      `.replayready {${cssBlocks(".replayready").join("").trim()}}`,
  ],
  [
    "and the ✓ is drawn once per building finishing, on the row that earned it",
    axisLine.filter((entry) => rowText(entry.cell).includes("✓")).map(drawnAs).join(" | ") ===
      "1:02 replaycell built s1 wasready ✓ +Soviet War Factory | " +
        "1:05 replaycell ready s1 structure ✓ Soviet War Factory",
    axisLine.filter((entry) => rowText(entry.cell).includes("✓")).map(drawnAs).join(" | "),
  ],
  // --- a base standing up -----------------------------------------------------
  //
  // The one row nobody clicked for: a building the re-run saw appear that no
  // placement in the file accounts for, which is an MCV deploying. The other
  // building spawn in the fixture lands on its own placement's second and must
  // leave the timeline exactly as it was — the pairing is the whole test, and a
  // deploy track that also fired on placements would put a second row under
  // every building in the match.
  [
    // Two sources, one kind of row. P_B's comes out of the **file** — a deploy
    // order at 0:01, before they placed anything — and Player_A's out of the
    // **re-run**, a Construction Yard spawn at 0:03 that no placement accounts
    // for. Player_A issued the file's order too, at 0:00; it is inside
    // `DEPLOY_SECONDS` of the spawn and is the same base arriving, so it does
    // not draw a second row and the spawn's own second is the one printed.
    "a base standing up is one row per side, whichever source saw it",
    axisLine.filter((e) => isKind(e, "deployed")).map(drawnAs).join(" | ") ===
      "0:01 replaycell deployed s2 structure <> Soviet Construction Yard | " +
        "0:03 replaycell deployed s1 structure <> Soviet Construction Yard",
    axisLine.filter((e) => isKind(e, "deployed")).map(drawnAs).join(" | "),
  ],
  [
    // The half that needs no harvest at all, which is what the site's Replays
    // page draws and what rescues a match whose re-run missed the opening. The
    // rule is not a likelihood: nothing can be placed until the Construction
    // Yard exists, so a deploy order before a player's first placement is that
    // player's MCV and can be nothing else.
    "and the file alone stands both bases up, with nothing re-run",
    timeline(flat(replays.render(fresh)))
      .filter((e) => isKind(e, "deployed"))
      .map(drawnAs)
      .join(" | ") ===
      "0:00 replaycell deployed s1 structure <> Soviet Construction Yard | " +
        "0:01 replaycell deployed s2 structure <> Soviet Construction Yard",
    timeline(flat(replays.render(fresh)))
      .filter((e) => isKind(e, "deployed"))
      .map(drawnAs)
      .join(" | "),
  ],
  [
    // A player presses the key twice — the fixture's P_B does, at ticks 104 and
    // 120 — and a base does not arrive twice for it.
    "one base, one row, however many times the key was pressed",
    report.players.every((player) => player.deployedAt > 0) &&
      timeline(flat(replays.render(fresh))).filter((e) => isKind(e, "deployed")).length === 2,
    report.players.map((p) => `${p.name} ${p.deployedAt.toFixed(2)}s`).join(" | "),
  ],
  [
    "and a building spawn that is its own placement draws nothing extra",
    axisLine.filter((e) => e.at === "1:02").map(drawnAs).join(" | ") ===
      "1:02 replaycell built s1 wasready ✓ +Soviet War Factory | 1:02 replaycell empty s2 ",
    axisLine.filter((e) => e.at === "1:02").map(drawnAs).join(" | "),
  ],
  [
    // And each row says which of the two saw it, because they are different
    // claims: the file has the order, the re-run has the building.
    "each row names its own source",
    axisLine
      .filter((e) => isKind(e, "deployed"))
      .map((e) => e.cell.title)
      .join(" | ") ===
      "NACNST stood up at 0:01 — P_B deployed before placing anything, which only the MCV can do | " +
        "NACNST stood up at 0:03 — a deploy: it appeared with no placement behind it, read off the re-run",
    axisLine
      .filter((e) => isKind(e, "deployed"))
      .map((e) => e.cell.title)
      .join(" | "),
  ],
  [
    // Turning the delivery track off asks to stop being told which tanks came
    // out. The base moving is not that, and it is drawn either way — the same
    // reason a capture is not gated with the losses.
    "and it survives the delivery track being turned off",
    timeline(flat(replays.render(report, { made: false })))
      .filter((e) => isKind(e, "deployed"))
      .length === 2 &&
      timeline(flat(replays.render(report, { made: false }))).filter((e) => isKind(e, "made")).length === 0,
    timeline(flat(replays.render(report, { made: false })))
      .filter((e) => isKind(e, "deployed") || isKind(e, "made"))
      .map(drawnAs)
      .join(" | "),
  ],
  [
    // A colour of its own, and the check is that it is *nobody else's*: this row
    // is rare and consequential, and painting it in a hue already spoken for
    // would make the axis say two things with one colour. Read off the
    // stylesheet's own custom properties rather than a list kept here, so a
    // later palette entry that lands on the same value is caught by this too.
    "it is painted in a colour nothing else on the axis uses",
    (() => {
      const mine = cssVars.get("--deployed");
      return (
        !!mine &&
        cssBlocks(".replaycell.deployed").join("").includes("var(--deployed)") &&
        [...cssVars].every(([name, value]) => name === "--deployed" || value !== mine)
      );
    })(),
    [...cssVars]
      .filter(([, value]) => value === cssVars.get("--deployed"))
      .map(([name, value]) => `${name}: ${value}`)
      .join(" | "),
  ],
  // --- a building changing hands ---------------------------------------------
  //
  // One event, two sides to it, so two rows at one second: the side that took it
  // and the side it came off. Everything a reader needs is on the rows — nothing
  // about a capture is anywhere else in the report, and the loss assertions
  // further down now run over a report with two captures in it, which is what
  // holds a capture out of the casualties.
  [
    "a capture is two rows at one second, one on each side of the clock",
    captureLine.filter((e) => e.at === "1:40").map(drawnAs).join(" | ") ===
      "1:40 replaycell ceded s1 ⇄ −Soviet Ore Refinery | 1:40 replaycell taken s2 ⇄ +Soviet Ore Refinery",
    captureLine.filter((e) => e.at === "1:40").map(drawnAs).join(" | "),
  ],
  [
    "and the row says it is a capture before any colour is read",
    // A glyph rather than the word, since 0.45.2 — the `+`/`−` says which way it
    // went, so this only has to say what kind of event it was, and the word it
    // replaced was the longest thing on the line in a column sized by its
    // longest line. `⚑` is not available: that is a side leaving the match.
    captureLine.length > 0 && captureLine.every((e) => /^⇄ [+−]\S/.test(rowText(e.cell))),
    captureLine.map((e) => rowText(e.cell)).join(" | "),
  ],
  [
    "the tooltip names both sides and the second",
    (captureLine.find((e) => isKind(e, "ceded")) || { cell: {} }).cell.title ===
      "NAREFN — P_B captured it at 1:40 from Player_A",
    (captureLine.find((e) => isKind(e, "ceded")) || { cell: {} }).cell.title,
  ],
  [
    "a building taken off nobody in the match draws one row and no losing side",
    captureLine.filter((e) => e.at === "2:00").map(drawnAs).join(" | ") ===
      "2:00 replaycell taken s1 ⇄ +Tech Oil Derrick",
    captureLine.filter((e) => e.at === "2:00").map(drawnAs).join(" | "),
  ],
  // The overclicks are P_B's two dropped building orders, and by default the
  // report does not mention them at all — no row, no count in a cell.
  [
    "overclicks are off unless asked for",
    !painted.some((n) => n.className === "replayover"),
    `${painted.filter((n) => n.className === "replayover").length} shown`,
  ],
  ["and the control says how many there are", painted.some((n) => (n.kids || []).some((k) => k.textContent === " overclicks (2)")), ""],
  ["asking for them puts them on the rows", overRows.length === 2, `${overRows.length} marked`],
  ["and they are counted apart from the units", overRows.every((n) => n.textContent === " +1"), overRows.map((n) => n.textContent).join(",")],
  // A cancel is not a click at a full queue. The model's occupancy is a floor
  // under the real queue, so a cancel it cannot cover says nothing about what the
  // engine took out — least of all that the game refused the click. Forty Rhinos
  // cancelled must leave the count exactly where it was.
  [
    "a cancel the modelled queue cannot cover is not an overclick",
    JSON.stringify(cancelReport.players.map((p) => p.overclicks)) === JSON.stringify(report.players.map((p) => p.overclicks)) &&
      cancelPainted.some((n) => (n.kids || []).some((k) => k.textContent === " overclicks (2)")),
    cancelReport.players.map((p) => `${p.name} ${p.overclicks}`).join(" / "),
  ],
  [
    "and the cancelled row states the ask, which is the only number a cancel has",
    !!cancelCell && rowText(cancelCell) === "$ Rhino Heavy Tank ×40" && !cancelCell.kids.some((k) => k.className === "replayover"),
    cancelCell ? rowText(cancelCell) : "no cancelled row",
  ],
  [
    "a placement names the building and no coordinates",
    built.length > 0 && rowText(built[0]) === "+Tesla Reactor" && !/\d+,/.test(rowText(built[0])),
    built.length ? rowText(built[0]) : "",
  ],
  [
    "an order carries its count",
    queued.length > 0 && queued.some((c) => rowText(c) === "$ Conscript ×8"),
    queued.length ? rowText(queued[0]) : "",
  ],
  // The row icons. What matters is not that a picture appeared but *which* one
  // and *where*: a sheet offset is a silent kind of wrong — every row would draw
  // something, and it would be the wrong unit on every one of them.
  [
    "a picture points at its own unit's place in the sheet, not at the unit next to it",
    (() => {
      // The Soviet War Factory is ordered, finishes and is placed in this match,
      // so it is a run — and `NAWEAP` is the id whose cell its picture must
      // name. An off-by-one in the sheet arithmetic is otherwise invisible:
      // every row would still draw *a* picture.
      const sheet = globalThis.__cdcCameos;
      const holder = runHolders.find((h) => (h.title || "").includes("all Soviet War Factory"));
      const icon = holder && holder.kids.find((k) => k.className === "replaycameo");
      if (!icon) return false;
      const at = sheet.index.NAWEAP;
      return (
        icon.style["--cx"] === `${(at % sheet.cols) * sheet.cell.width}px` &&
        icon.style["--cy"] === `${Math.floor(at / sheet.cols) * sheet.cell.height}px`
      );
    })(),
    (() => {
      const holder = runHolders.find((h) => (h.title || "").includes("all Soviet War Factory"));
      const icon = holder && holder.kids.find((k) => k.className === "replaycameo");
      return icon ? `${icon.style["--cx"]},${icon.style["--cy"]}` : "no War Factory run";
    })(),
  ],
  [
    "a picture's size is the ladder applied to the lines it spans — 0.5x, 1x, 2x and nothing between",
    runHolders.length > 0 &&
      runHolders.every((h) => {
        const icon = h.kids.find((k) => k.className === "replaycameo");
        const k = Number(icon.style["--k"]);
        const span = gridSpan(h);
        return k === (span >= 4 ? 2 : span >= 2 ? 1 : 0.5);
      }),
    runHolders
      .map((h) => `${gridSpan(h)}->${h.kids.find((k) => k.className === "replaycameo").style["--k"]}`)
      .slice(0, 8)
      .join(" "),
  ],
  [
    "only a run is braced, and a run is two lines or more",
    runHolders.length > 0 &&
      runHolders.some((h) => h.className.includes("braced")) &&
      runHolders.every((h) => h.className.includes("braced") === gridSpan(h) > 1),
    `${runHolders.filter((h) => h.className.includes("braced")).length} braced of ${runHolders.length}`,
  ],
  [
    "every picture leads to its rows' own words — the first and last line of a run, and nothing else",
    (() => {
      // The leader is a rule from beside the picture up to the text, and the
      // text ends wherever that row's words end — so the piece that crosses the
      // slack has to live in the cell. Which cells get one is the claim: the
      // rows the picture actually points at, and no others.
      const led = (side) =>
        painted
          .filter(
            (n) =>
              (n.className || "").startsWith("replaycell ") &&
              n.className.split(" ").includes("s" + side) &&
              (n.kids || []).some((k) => k.className === "replaylead")
          )
          .map(gridRow)
          .sort((a, b) => a - b)
          .join(",");
      const wanted = (side) =>
        [
          ...new Set(
            runHolders
              .filter((h) => h.className.split(" ").includes("s" + side))
              .flatMap((h) => [gridRow(h), gridRow(h) + gridSpan(h) - 1])
          ),
        ]
          .sort((a, b) => a - b)
          .join(",");
      return wanted(1).length > 0 && led(1) === wanted(1) && led(2) === wanted(2);
    })(),
    `${painted.filter((n) => (n.kids || []).some((k) => k.className === "replaylead")).length} rows lead of ${runHolders.length} pictures`,
  ],
  [
    "the whole horizontal is the row's own leader — the picture's holder draws no arm of its own",
    (() => {
      // It used to draw one, meeting the row's leader at the column edge. The two
      // were placed by different rules — one centred in a flex line, one offset
      // half a line from a stretched grid item — and landed 0.5px apart, so one
      // rule rounded onto two device rows at some zooms and one at others. A
      // horizontal declared on the holder again is that bug coming back.
      const holder = cssBlocks(".replaycameorun");
      return holder.length > 0 && holder.every((body) => !/border-(top|bottom)\s*:/.test(body));
    })(),
    cssBlocks(".replaycameorun")
      .flatMap((b) => b.match(/border-\w+\s*:[^;]+/g) || [])
      .join(" | ") || "no borders declared on the holder",
  ],
  [
    "and it reaches into the gutter by the same number the bracket stands at",
    // One variable, two readers: the leader's negative outward margin and the
    // width the bracket is inset by. Two literals that agreed by luck is how the
    // upright would come to stand somewhere the arms do not reach.
    cssBlocks(".replaylead").some((b) => /margin-(left|right)\s*:\s*calc\(-1 \* var\(--cdc-leader-reach\)\)/.test(b)) &&
      cssBlocks(".replaycameorun.braced::before").some((b) => /width\s*:\s*var\(--cdc-leader-reach\)/.test(b)) &&
      /--cdc-leader-reach:\s*\d/.test(replayCss),
    (/--cdc-leader-reach:\s*[^;]+/.exec(replayCss) || ["not declared"])[0],
  ],
  [
    "and the leader sits on the outward side of everything the row says",
    // Nearest the gutter: first child on the left of the clock, last on the
    // right. Anywhere else and the rule runs between the count and the clicks
    // the queue turned away — which is why this reads the render that has them.
    //
    // **It bites on the right of the clock only.** Both of the fixture's
    // overclicks are P_B's, so no cell on the left has a second child, and the
    // left half of the claim passes on a row whose only child is the leader.
    // The break it does catch is the one that matters — the same insertion on
    // both sides, which is how this would actually be got wrong.
    (() => {
      const leading = withOverclicks.filter((n) => (n.kids || []).some((k) => k.className === "replaylead"));
      return (
        leading.some((n) => n.kids.length > 1) &&
        leading.every((n) =>
          n.className.split(" ").includes("s1")
            ? n.kids[0].className === "replaylead"
            : n.kids[n.kids.length - 1].className === "replaylead"
        )
      );
    })(),
    withOverclicks
      .filter((n) => (n.kids || []).some((k) => k.className === "replaylead") && n.kids.length > 1)
      .map((n) => `${n.className.split(" ").pop()}:${n.kids.map((k) => k.className).join("+")}`)
      .join(" | "),
  ],
  // --- and a run is a chain, not a name repeated -----------------------------
  //
  // Naming the same object twice running is where a run *can* happen; whether it
  // did is the rule below. Each of these is a pair the fixture actually holds —
  // if one of them ever stops occurring the assertion says so rather than
  // passing on an empty set.
  [
    "an order that becomes a placement is one chain",
    (() => {
      const rank = { queued: 1, ready: 2, built: 3, made: 3 };
      const forward = pairsWhere((a, b) => rank[a] && rank[b] && rank[b] >= rank[a]);
      return forward.length > 0 && forward.every((p) => p.joined);
    })(),
    saidAs(pairsWhere((a, b) => ({ queued: 1, ready: 2, built: 3, made: 3 })[a] && ({ queued: 1, ready: 2, built: 3, made: 3 })[b])),
  ],
  [
    "a new order after a placement starts a new section — it is a second building, not more news about the first",
    (() => {
      const back = pairsWhere((a, b) => a === "built" && b === "queued");
      return back.length > 0 && back.every((p) => !p.joined);
    })(),
    saidAs(pairsWhere((a, b) => a === "built" && b === "queued")),
  ],
  [
    "a placement and a death of the same object are two pictures",
    (() => {
      // A stage of production against something that is not a stage of anything:
      // one picture over the pair would claim the two rows are one event.
      const stage = (k) => k === "built" || k === "made" || k === "queued" || k === "ready";
      const fate = (k) => k === "lost" || k === "taken" || k === "ceded";
      const mixed = pairsWhere((a, b) => (stage(a) && fate(b)) || (fate(a) && stage(b)));
      return mixed.length > 0 && mixed.every((p) => !p.joined);
    })(),
    saidAs(
      pairsWhere((a, b) => {
        const stage = (k) => k === "built" || k === "made" || k === "queued" || k === "ready";
        const fate = (k) => k === "lost" || k === "taken" || k === "ceded";
        return (stage(a) && fate(b)) || (fate(a) && stage(b));
      })
    ),
  ],
  [
    "but two deaths of the same object are one",
    (() => {
      const deaths = pairsWhere((a, b) => a === "lost" && b === "lost");
      return deaths.length > 0 && deaths.every((p) => p.joined);
    })(),
    saidAs(pairsWhere((a, b) => a === "lost" && b === "lost")),
  ],
  // A column per side, each its own width — and no slack. The two numbers bind
  // the two grids and put the pictures where they belong; they are counted, not
  // measured, so they can be checked exactly. Shared, the quieter column was
  // padded out to the busier one's longest line, which is the excess the reader
  // saw between a short row and its picture.
  [
    "each side's column is the longest line *that side* holds, so the pictures sit against the words",
    (() => {
      const axis = painted.find((n) => n.className === "replayaxis");
      if (!axis) return false;
      return [1, 2].every((side) => {
        const longest = Math.max(
          0,
          ...painted
            .filter((n) => (n.className || "").startsWith("replaycell ") && new RegExp(`\\bs${side}\\b`).test(n.className))
            .map((c) => read(c).length)
        );
        // Plus the ten pixels a cell keeps between its words and the clock: they
        // are part of the column, or the longest line overflows into the gutter
        // and the leader drawn there is struck through it.
        return axis.style[`--cdc-line-ch-s${side}`] === `calc(${longest}ch + 10px)`;
      });
    })(),
    [1, 2].map((s) => (painted.find((n) => n.className === "replayaxis") || { style: {} }).style[`--cdc-line-ch-s${s}`] || "not set").join(" / "),
  ],
  [
    "and the two are counted apart — one number for both would pad the quieter side out",
    // Asserted on a report doctored to make one side longer, not on the fixture.
    // The fixture's two sides drifted to the same length the moment both players
    // gained a deploy row, and a shared variable passes every assertion above
    // whenever they happen to match — so the guard cannot be left resting on a
    // coincidence it exists to detect.
    (() => {
      const axis = flat(replays.render(widerReport)).find((n) => n.className === "replayaxis");
      return (
        !!axis &&
        axis.style["--cdc-line-ch-s1"] !== axis.style["--cdc-line-ch-s2"] &&
        axis.style["--cdc-line-ch-s1"] === `calc(${("$ " + LONG_LABEL).length}ch + 10px)`
      );
    })(),
    [1, 2]
      .map((s) => (flat(replays.render(widerReport)).find((n) => n.className === "replayaxis") || { style: {} }).style[`--cdc-line-ch-s${s}`] || "not set")
      .join(" / "),
  ],
  [
    "the pictures sit in the gutter columns, outside both sides' words",
    runHolders.length > 0 && runHolders.every((h) => (h.className.includes("s1") ? gridCol(h) === 1 : gridCol(h) === 5)),
    runHolders.map((h) => `${h.className.includes("s1") ? "s1" : "s2"}@${gridCol(h)}`).slice(0, 6).join(" "),
  ],
  [
    "the clock column is as wide as the widest reading it prints, not a fixed guess",
    // 56px was the guess. It fitted `12:34` with twenty pixels to spare — a strip
    // of nothing down the middle, twice, since each side already keeps its own
    // ten pixels off the rules — and it did not fit `8:55 / 35:42`, which is what
    // the `both` clock prints, so every row of that report was two lines tall.
    (() => {
      const widest = Math.max(...clocks.map((text) => text.length));
      return axisStyle()["--cdc-clock-ch"] === `calc(${widest}ch + 10px)`;
    })(),
    `${axisStyle()["--cdc-clock-ch"] || "not set"} for ${Math.max(...clocks.map((text) => text.length))} characters`,
  ],
  [
    "the gutters take the panel's slack rather than the panel keeping it",
    // A gutter exactly as wide as its picture left the whole grid narrower than
    // the box it sits in, and centring it put the remainder down the two edges
    // where nothing could be placed. `minmax(picture, 1fr)` keeps the three
    // middle columns exact and hands the remainder to the two edges instead —
    // equally, which is what leaves the clock where centring had it.
    (axisGrid.match(/minmax\(var\(--cdc-cameo-gutter, 0px\), 1fr\)/g) || []).length === 2 &&
      !/justify-content/.test(axisGrid),
    (axisGrid.match(/grid-template-columns:[^;]+;/) || ["not declared"])[0].replace(/\s+/g, " ") +
      (/justify-content/.test(axisGrid) ? " + justify-content" : ""),
  ],
  [
    "and the header spans them, so a side's block is as wide as the panel allows",
    // The header is the half of this that the reader sees. Bound to the middle
    // column it was as wide as the longest line of the build order below, and a
    // side's losses came out as a stack of one chip per line beside two strips of
    // empty panel. The spans stop either side of the clock, so the column between
    // the two blocks is untouched.
    cssBlocks(".replayrow > :nth-child(1)").some((b) => /grid-column:\s*1\s*\/\s*3/.test(b)) &&
      cssBlocks(".replayrow > :nth-child(2)").some((b) => /grid-column:\s*3\s*;/.test(b)) &&
      cssBlocks(".replayrow > :nth-child(3)").some((b) => /grid-column:\s*4\s*\/\s*6/.test(b)),
    [1, 2, 3]
      .map((n) => `${n}:${(cssBlocks(`.replayrow > :nth-child(${n})`).join("").match(/grid-column:\s*([^;]+)/) || ["", "?"])[1]}`)
      .join(" "),
  ],
  // Which *side* of the words the icon lands on is deliberately not asserted
  // here. A cell's words are its `textContent`, a property rather than a child,
  // so in this fake DOM the icon is the only node in the cell and it is both the
  // first child and the last one — an assertion about the order would pass with
  // the sides swapped. It is a human check on the report instead.
  [
    "the sheet is written onto the document once, not into every picture",
    Object.keys(fakeDocument.documentElement.style.props).sort().join(",") ===
      "--cdc-cameo-h,--cdc-cameo-sheet,--cdc-cameo-w" &&
      painted.filter((n) => n.className === "replaycameo").every((n) => !("backgroundImage" in n.style)),
    Object.keys(fakeDocument.documentElement.style.props).join(","),
  ],
  [
    "an object the game gives no cameo draws none rather than a stand-in",
    // GAWALL has one and CAHOSP (a civilian hospital) does not — the check is
    // that the absence is in the sheet, so a row for one would draw nothing.
    globalThis.__cdcCameos.index.GAWALL !== undefined && globalThis.__cdcCameos.index.CAHOSP === undefined,
    `GAWALL=${globalThis.__cdcCameos.index.GAWALL} CAHOSP=${globalThis.__cdcCameos.index.CAHOSP}`,
  ],
  [
    "the sides are told apart by which way they are written, not only by colour",
    axisLinesHere.length > 0 && built.some((c) => c.className.endsWith("s1")) && built.some((c) => c.className.endsWith("s2")),
    "",
  ],
  [
    "each side's line is the same colour as its dot",
    // Four charts once a harvest is merged — credits, income and losses replace
    // the ordered-value proxy, and APM stays — so four lines a side. The two
    // count charts are not among them: this harvest predates the object walk.
    painted.filter((n) => (n.className || "").startsWith("replaydot")).length >= 2 &&
      lines.filter((n) => (n.attrs.class || "").includes("s1")).length === 4 &&
      lines.filter((n) => (n.attrs.class || "").includes("s2")).length === 4,
    `${lines.length} lines drawn`,
  ],
  [
    "the charts run to the end of the match and no further",
    !!curves && Math.abs(curves.end - report.duration) < 0.001 && curves.value.every((s) => s.points[s.points.length - 1][0] <= curves.end),
    curves ? `${curves.end.toFixed(1)}s` : "",
  ],
  [
    "ordered value only ever climbs",
    !!curves && curves.value.every((s) => s.points.every((p, i) => i === 0 || p[1] >= s.points[i - 1][1])),
    curves ? `up to ${Math.round(Math.max(...curves.value.flatMap((s) => s.points.map((p) => p[1]))))} credits` : "",
  ],
  [
    "and it counts a building once, not twice",
    // Player_A's nine placements at rules prices — 600 + 500 + 4x500 + 2x2000 +
    // 2000 = 9100 — plus the units ordered — 2x200 + 8x100 + 3x1400 + 3x200 +
    // 5x900 = 10500. A structure paid for both when it was queued and again when
    // it was placed would read 9100 over.
    !!curves && Math.round(curves.value[0].points[curves.value[0].points.length - 1][1]) === 19600,
    curves ? String(Math.round(curves.value[0].points[curves.value[0].points.length - 1][1])) : "",
  ],
  [
    "the axis rounds up to something readable",
    !!replays && replays.niceMax(51700) === 60000 && replays.niceMax(0) === 1 && replays.niceMax(48) === 50,
    "",
  ],
  // --- the economy: income, and what was earning it ---------------------------
  //
  // The bank chart cannot answer "who was winning the economy" — a balance falls
  // when a player spends, so a side out-mining the other can hold less all
  // match. The rate is the other question, and it is `gained` differenced.
  [
    "income is an average over the window it names, not a reading per sample",
    // Player_A mined 4000 credits in four 1000-credit dockings. Over thirty
    // seconds one docking is 2000/min and two are 4000/min — arithmetic a
    // reader can do — so those are the only two heights that line ever takes.
    // Per-sample it was four teeth of 12000/min separated by flat zero, which
    // is a picture of the sample interval rather than of an economy.
    distinct(seriesOf(economy, "income")[0]).join(",") === "2000,4000",
    distinct(seriesOf(economy, "income")[0]).join(","),
  ],
  [
    "and the comb is gone — a rate holds while the window holds it",
    // The same drop-off is inside the window for six samples, so a tooth
    // becomes a plateau. One sample wide would mean the window is not being
    // applied at all.
    plateau(seriesOf(economy, "income")[0]) === 8,
    `longest run of one rate: ${plateau(seriesOf(economy, "income")[0])} samples`,
  ],
  [
    "and it still accounts for the money, never more than there was",
    // Integrated over the intervals it was measured on, the line comes back to
    // the lifetime `gained` it was differenced out of — exactly, for a side
    // whose income stopped before the whistle (Player_A, 4000). A side still
    // earning at the end is short by the tail no trailing window has reached
    // yet (P_B, 25221 of 26350) — short, never over, which is the direction
    // that cannot hide an invented credit.
    integrated(seriesOf(economy, "income")[0]) === 4000 && integrated(seriesOf(economy, "income")[1]) === 25221,
    seriesOf(economy, "income").map((line) => `${line.label} ${integrated(line)}`).join(" | "),
  ],
  [
    "a harvest taken before the object walk draws no economy it never counted",
    // Absent, not a flat line at nought: zero miners is a claim, and this
    // harvest makes none.
    !!economy && seriesOf(economy, "harvesters").length === 0 && seriesOf(economy, "derricks").length === 0,
    `${seriesOf(economy, "harvesters").length} harvester lines, ${seriesOf(economy, "derricks").length} derrick lines`,
  ],
  [
    "a walked harvest draws one line per side and miner type",
    seriesOf(walkedCurves, "harvesters").map((line) => line.label).join(" | ") === "Player_A | P_B · Chrono Miner | P_B · War Miner",
    seriesOf(walkedCurves, "harvesters").map((line) => line.label).join(" | "),
  ],
  [
    "and names the type only on the side that had a choice of one",
    // A side fields one miner in every ordinary match, so naming the type on
    // every line would put "War Miner" under two Soviet players and say nothing
    // about which is which. It is named where a side runs two.
    seriesOf(walkedCurves, "harvesters")
      .map((line) => `${line.index}:${line.points[line.points.length - 1][1]}`)
      .join(" | ") === "0:1 | 1:1 | 1:2",
    seriesOf(walkedCurves, "harvesters").map((line) => `${line.index}:${line.points[line.points.length - 1][1]}`).join(" | "),
  ],
  [
    "a derrick is counted while it is held, from the sample it appears in",
    seriesOf(walkedCurves, "derricks").length === 2 &&
      seriesOf(walkedCurves, "derricks")[0].points.every((p) => p[1] === 0) &&
      held(seriesOf(walkedCurves, "derricks")[1]) === walkedReport.sim.samples.length - 31,
    `${held(seriesOf(walkedCurves, "derricks")[1])} of ${walkedReport.sim.samples.length} samples held one`,
  ],
  // --- losses on the same axis -----------------------------------------------
  [
    "losses share the timeline with the build order",
    // 44 deaths, grouped the way orders are: 16 rows, so a build order of 28 is
    // not buried under its own casualties.
    lost.length === 16,
    `${lost.length} loss rows`,
  ],
  [
    "a loss is marked as one before any colour is read",
    lost.length > 0 && lost.every((cell) => cell.textContent.startsWith("−")),
    lost.length ? lost[0].textContent : "",
  ],
  [
    "and it carries how many went at once",
    lost.some((cell) => cell.textContent === "−Conscript ×20"),
    lost.map((cell) => cell.textContent).join(" | ").slice(0, 100),
  ],
  [
    "a building lost reads differently from a unit lost",
    lost.some((cell) => cell.className.includes("structure") && cell.textContent === "−Soviet Construction Yard"),
    lost
      .filter((cell) => cell.className.includes("structure"))
      .map((cell) => cell.textContent)
      .join(" | "),
  ],
  [
    "and they land on the side that lost them",
    lost.filter((cell) => cell.className.includes("s1")).length === 14,
    `${lost.filter((cell) => cell.className.includes("s1")).length} of ${lost.length} on the left`,
  ],
  // --- a side leaving the match ------------------------------------------------
  //
  // The last thing that happens in a match used to be nowhere on the axis: the
  // timeline ended in a wall of losses with nothing saying why. The moment a side
  // left is a fact of the file, so it is a row like any other.
  [
    "a side leaving the match is a row of its own — a drop under the mark for one",
    cellsOf("dropped").map(rowText).join("|") === "↯ dropped out",
    cellsOf("dropped").map(rowText).join("|"),
  ],
  [
    "at the second the file records, on the side that left",
    dropAt >= 0 && axisLine[dropAt].at === "4:03" && axisLine[dropAt].cell.className.includes("s1"),
    dropAt >= 0 ? `${axisLine[dropAt].at} ${axisLine[dropAt].cell.className}` : "no row drawn",
  ],
  [
    "a resignation says so instead — a decision is not the client noticing a dead base",
    quitLine.filter((e) => isKind(e, "resigned")).map((e) => rowText(e.cell)).join("|") === "⚑ resigned" &&
      !quitLine.some((e) => isKind(e, "dropped")),
    quitLine.filter((e) => isKind(e, "resigned")).map((e) => rowText(e.cell)).join("|"),
  ],
  [
    "and it is drawn above the losses of its own second, not among them",
    quitAt >= 0 && lossesUnder.length === 2 && lossesUnder.every((i) => i > quitAt),
    `resign at ${quitAt}, losses at ${lossesUnder.join(",")}`,
  ],
  [
    "the row does not wait for a re-run — it is in the file, unlike the losses",
    !fresh.sim && freshLine.some((e) => isKind(e, "dropped")) && !freshLine.some((e) => isKind(e, "lost")),
    `${freshLine.filter((e) => isKind(e, "dropped")).length} rows with no harvest merged`,
  ],
  // --- who won -----------------------------------------------------------------
  //
  // The outcome is the first thing anyone opens a match for, and it used to be a
  // word at the end of a statistics line — and only there at all when the report
  // had been opened from the ladder's own history. It comes out of the file:
  // whoever resigned or was dropped lost.
  [
    "the match says who won, beside the name",
    painted.filter((n) => (n.className || "").startsWith("replayverdict")).length === 2,
    painted
      .filter((n) => (n.className || "").startsWith("replayverdict"))
      .map((n) => n.textContent)
      .join(" / "),
  ],
  [
    "and it is the dropped player who lost — in the word for what happened, not for how the client wrote it down",
    (painted.find((n) => n.className === "replayverdict lost") || {}).textContent === "lost" &&
      (painted.find((n) => n.className === "replayverdict won") || {}).textContent === "won",
    painted
      .filter((n) => (n.className || "").startsWith("replayverdict"))
      .map((n) => n.textContent)
      .join(" / "),
  ],
  [
    "a resignation says so instead — `lost` is what those two words were being said in aid of",
    ((flat(splitHead[0] || fakeNode("div")).find((n) => n.className === "replayverdict lost") || {}).textContent) === "resigned",
    (flat(splitHead[0] || fakeNode("div")).find((n) => (n.className || "").startsWith("replayverdict")) || {}).textContent,
  ],
  [
    "and no moment rides in it — a badge painted the colour of a defeat is no place for a fact about the match",
    !/\d+:\d\d|[()]/.test(
      flat(splitHead[0] || fakeNode("div"))
        .filter((n) => (n.className || "").startsWith("replayverdict"))
        .map((n) => n.textContent)
        .join(" ")
    ),
    flat(splitHead[0] || fakeNode("div"))
      .filter((n) => (n.className || "").startsWith("replayverdict"))
      .map((n) => n.textContent)
      .join(" / "),
  ],
  [
    "the statistics rows do not say it a second time",
    !!statsRow && !/resigned|dropped|\d+:\d\d/.test(text(statsRow)),
    statsRow ? text(statsRow) : "no statistics row",
  ],
  // --- the header lines up -----------------------------------------------------
  //
  // The alignment IS the layout: a row is one kind of line, both sides of it, so
  // neither can be a line taller or shorter than the other. Nothing else in the
  // header can hold that — two columns stacked separately drift by construction.
  [
    "the header is a row per kind of line, the same kind on both sides of the clock",
    headRows.length === 5 && headRows.every((row) => row.kids.length === 3 && kindOf(row, "left") === kindOf(row, "right")),
    headRows.map((row) => `${kindOf(row, "left")}|${kindOf(row, "right")}`).join(" / "),
  ],
  [
    "the names face each other and neither side opens with a blank line",
    kindOf(nameRow, "left") === "replayname" &&
      text(headCell(nameRow, "left")).includes("Player_A") &&
      text(headCell(nameRow, "right")).includes("P_B"),
    nameRow ? `${text(headCell(nameRow, "left"))} / ${text(headCell(nameRow, "right"))}` : "no header",
  ],
  [
    "the faction is on the nickname's line, not a line of its own",
    !!nameRow &&
      [0, 2].every((i) => flat(nameRow.kids[i]).some((k) => k.className === "replayside")) &&
      !headRows.some((row) => kindOf(row, "left") === "replayside"),
    nameRow ? text(headCell(nameRow, "left")) : "",
  ],
  [
    "the nickname, its faction and its verdict read in that order on both sides — the blocks are mirrored, the phrase is not",
    !!nameRow &&
      inOrder(whoSaid(nameRow, 0), "Player_A", "Libya") &&
      inOrder(whoSaid(nameRow, 2), "P_B", "Iraq") &&
      // And the verdict is out of the phrase, so it can sit against the clock on
      // both sides rather than at the outer edge of one of them.
      [0, 2].every((i) => !/lost|won/.test(whoSaid(nameRow, i))),
    nameRow ? [0, 2].map((i) => whoSaid(nameRow, i)).join(" / ") : "",
  ],
  [
    "how hard each side was playing rides on its name line, against the clock",
    !!nameRow &&
      [0, 2].every((i) => /^\d+ APM \d+ actions$/.test(numbersOf(flat(nameRow.kids[i]).find((k) => k.className === "replaystats")))),
    nameRow
      ? [0, 2].map((i) => numbersOf(flat(nameRow.kids[i]).find((k) => k.className === "replaystats"))).join(" / ")
      : "",
  ],
  // --- the middle column -------------------------------------------------------
  //
  // It carries the moment the match ended and then the name of every row under
  // it, and the whole point of the second is that it costs the first nothing: the
  // column is counted off clock readings, so a label may overhang it but may
  // never widen it and push the two build orders apart.
  [
    "the clock column says when the match ended, once, and is not painted the colour of a defeat",
    midOf(nameRow) === "replayat" && labelOf(nameRow) === "4:03" && headRows.slice(1).every((row) => midOf(row) === "replaylabel"),
    headRows.map((row) => `${midOf(row)}:${labelOf(row)}`).join(" | "),
  ],
  [
    "and every row under it is named there once rather than in both cells",
    headRows.slice(1).map(labelOf).join("|") === "produced|destroyed|lost|by type" &&
      !headRows.slice(1).some((row) => /produced|destroyed|by type/.test(text(headCell(row, "left")))),
    headRows.slice(1).map(labelOf).join("|"),
  ],
  [
    "a label is not a clock reading and does not widen the column the axis is measured by",
    /^calc\(4ch \+ \d+px\)$/.test(axisStyle()["--cdc-clock-ch"] || "") &&
      headRows.slice(1).every((row) => row.kids[1].className === "replaylabel"),
    `${axisStyle()["--cdc-clock-ch"]} for ${headRows.slice(1).map(labelOf).join("|")}`,
  ],
  // --- what a side lost --------------------------------------------------------
  //
  // Everything, at once. The list used to stop at six types and count the rest as
  // "+5 more", which withheld exactly the half a re-run of the match is run for.
  [
    "every type a side lost is shown, none of them counted away as a tail",
    chipsOf(headCell(lostRow, "left")).length === 11 && !/\+\d+ more/.test(text(reportEl)),
    chipsOf(headCell(lostRow, "left")).join(" · "),
  ],
  [
    "the ledger says how many went and what that was made of, in the report a reader is handed",
    lostLedger() === "40 total 10 buildings 30 units / 4 total 0 buildings 4 units" &&
      lostLedger().split(" / ").every(adds),
    lostLedger(),
  ],
  [
    "and an unsplit block of chips does not state the same total a line under it",
    numbersOf(headCell(lostRow, "left")) === "" && chipsOf(headCell(lostRow, "left")).length === 11,
    `${numbersOf(headCell(lostRow, "left"))}|${chipsOf(headCell(lostRow, "left")).length} chips`,
  ],
  // The split. A resigning player's whole base dies in one instant, so merged
  // into what it lost fighting it misreads the match: 40 lost is 13 units and a
  // base evaporating four seconds later.
  [
    "a resignation splits the losses into what went in play and what went with it",
    labelOf(inPlayRow) === "in play" && labelOf(atDefeatRow) === "at defeat",
    `${labelOf(inPlayRow)} / ${labelOf(atDefeatRow)}`,
  ],
  [
    "and each half says how many, off its own source — the events it counted",
    splitSaid === "13 total 4 buildings 9 units / 27 total 6 buildings 21 units" &&
      [splitSaid.split(" / "), [splitSaidRight]].flat().every(adds),
    `${splitSaid} || ${splitSaidRight}`,
  ],
  [
    "and each type lands in the block it belongs to",
    chipsOf(headCell(inPlayRow, "left")).join(" · ") === "Attack Dog ×5 · Sentry Gun ×4 · War Miner ×4" &&
      chipsOf(headCell(atDefeatRow, "left")).join(" · ") ===
        "Conscript ×20 · Engineer · RA2 Farmhouse · Soviet Barracks · Soviet Construction Yard · Soviet Ore Refinery · Soviet War Factory · Tesla Reactor",
    `${chipsOf(headCell(inPlayRow, "left")).join(" · ")} || ${chipsOf(headCell(atDefeatRow, "left")).join(" · ")}`,
  ],
  // --- and no second rendering of any of it ------------------------------------
  //
  // A total is one number over two very different facts: thirteen losses is a
  // skirmish if they are infantry and a base if three of them are buildings. That
  // used to be a disclosure, so what the report said depended on whether the
  // reader had clicked — and the half worth reading was the folded half.
  [
    "the ledger reads as one row per claim, the two sides of it facing across the label",
    sideBySide(rowOfLabel(headRows, "lost"), numbersOf) === "40 total 10 buildings 30 units / 4 total 0 buildings 4 units",
    sideBySide(rowOfLabel(headRows, "lost"), numbersOf),
  ],
  [
    "nothing in the header opens: there is no second rendering to reach",
    !controlIn(headCell(statsRow, "left")) &&
      !controlIn(headCell(lostRow, "left")) &&
      !flat(reportEl).some((n) => hasClass(n, "replaytotal") || hasClass(n, "replaysplit")),
    flat(reportEl).filter((n) => n.tag === "button").map((n) => n.className).join(" / ") || "no buttons in the report",
  ],
  [
    "the units figure keeps what the source knew — infantry from vehicles — as its title",
    unitsTitle === "26 infantry · 4 vehicles",
    unitsTitle,
  ],
  // --- one rule for every total ------------------------------------------------
  //
  // The counter is the number and the events are the parts, and the parts are
  // drawn only when they account for exactly that number. `killed` is the row
  // that proves the rule holds across two sources: the counter reads 4 and 29,
  // and the destroy events credited to those two players number 4 and 29.
  [
    "what a side destroyed is counted off the events that killed it, and agrees with the game's own counter",
    sideBySide(rowOfLabel(headRows, "destroyed"), numbersOf) === "4 total 0 buildings 4 units / 29 total 9 buildings 20 units" &&
      sideBySide(rowOfLabel(headRows, "destroyed"), numbersOf).split(" / ").every(adds),
    sideBySide(rowOfLabel(headRows, "destroyed"), numbersOf),
  ],
  [
    "a word that holds for a building as much as for a tank — neither `built` nor `killed` did",
    headRows.slice(1).map(labelOf).join("|") === "produced|destroyed|lost|by type",
    headRows.slice(1).map(labelOf).join("|"),
  ],
  [
    "produced is the spawn events' own reading, total and parts off one list",
    statsPair() === "4 total 2 buildings 2 units / 34 total",
    statsPair(),
  ],
  [
    "and a harvest with no spawn events in it keeps the counter and says only the total",
    // P_B is handed none, so that side falls back — which is the same rule the
    // whole committed harvest hits, having been taken before the client was
    // asked what came out of the queues.
    numbersOf(headCell(statsRow, "right")) === "34 total",
    numbersOf(headCell(statsRow, "right")),
  ],
  // --- the block's count owns its line -----------------------------------------
  //
  // Loose among the chips it was three flex items, so a chip wrapped up onto the
  // label's line and `Chrono Miner ×4` read as part of the count in front of it.
  [
    "how many went is a block of its own, so no chip can wrap onto the label's line",
    [inPlayRow, atDefeatRow].every((row) => {
      const cell = headCell(row, "left");
      const count = (cell.kids || []).find((k) => k.className === "replaycount");
      return count && cell.kids.indexOf(count) === 0 && (cell.kids || []).slice(1).every((k) => k.className === "replaychip");
    }),
    (headCell(inPlayRow, "left").kids || []).map((k) => k.className).join(" "),
  ],
  [
    "and only a row named by a word pays for one — a reading fits the column it is centred on",
    headRows.every((row) => hasClass(row, "labelled") === (row.kids[1].className === "replaylabel")),
    headRows.map((row) => `${row.className}:${row.kids[1].className}`).join(" | "),
  ],
  [
    "a kind the report cannot name is still a unit, so the parts never stop summing",
    !!replays &&
      JSON.stringify(replays.lossSplit({ buildings: 2, infantry: 3, "": 1 })) ===
        '{"buildings":2,"units":4,"detail":"3 infantry"}',
    replays ? JSON.stringify(replays.lossSplit({ buildings: 2, infantry: 3, "": 1 })) : "",
  ],
  [
    "a harvest with no breakdown in it leaves the total as a number, not a control that opens onto nothing",
    !!noKindsRow &&
      !controlIn(headCell(noKindsRow, "left")) &&
      numbersOf(headCell(noKindsRow, "left")) === "40 total",
    noKindsRow ? numbersOf(headCell(noKindsRow, "left")) : "no lost row",
  ],
  [
    "the side that stayed in the match has an at-defeat block, and it is empty",
    !!atDefeatRow && kindOf(atDefeatRow, "right") === "replaylost atdefeat" && chipsOf(headCell(atDefeatRow, "right")).length === 0,
    atDefeatRow ? `${kindOf(atDefeatRow, "right")} with ${chipsOf(headCell(atDefeatRow, "right")).length} chips` : "no at-defeat row",
  ],
  [
    "a player who both resigned and was dropped is read one way, by the resignation",
    bothVerdict === "resigned" &&
      numbersOf(headCell(rowOfKind(bothHead, "replaylost"), "left")) === "13 total 4 buildings 9 units" &&
      numbersOf(headCell(rowOfKind(bothHead, "replaylost atdefeat"), "left")) === "27 total 6 buildings 21 units" &&
      // The one moment the two of them could disagree about is now printed once,
      // in the clock column, so the verdict cannot state a second one.
      labelOf(bothHead[0]) === "3:35" &&
      !!replays &&
      JSON.stringify(replays.sideDefeat([{ resigned: 215, dropped: 243.2 }])) === '{"kind":"resigned","at":215}',
    `${bothVerdict} at ${labelOf(bothHead[0])} · ${numbersOf(headCell(rowOfKind(bothHead, "replaylost"), "left"))} · ${numbersOf(
      headCell(rowOfKind(bothHead, "replaylost atdefeat"), "left")
    )}`,
  ],
  // --- a defeat the file does not hold -----------------------------------------
  //
  // A match won by capturing the last building ends with no resignation and no
  // drop. The verdict came out of the harvest's own `defeated` flag and was drawn
  // beside the name — but the moment was read off the file, which has none, so
  // the clock column down the middle of the header was empty on exactly the
  // matches whose header a reader had most reason to check.
  [
    "a side that neither resigned nor dropped still says when it was out",
    !!replays &&
      JSON.stringify(replays.sideDefeat([{ sim: { defeatedAt: 231.5 } }])) === '{"kind":"defeated","at":231.5}' &&
      labelOf(capturedHead[0]) === "3:51",
    `${JSON.stringify(replays && replays.sideDefeat([{ sim: { defeatedAt: 231.5 } }]))} · header clock ${labelOf(
      capturedHead[0]
    )}`,
  ],
  [
    "and it is a row on the axis, under the mark for a defeat rather than for a record of one",
    capturedRow.length === 1 && rowText(capturedRow[0]) === "☠︎ lost",
    capturedRow.map(rowText).join("|") || "no row",
  ],
  [
    "the same side drawn from the file alone gets neither — a drop is what the file has, and it keeps its own mark",
    cellsOf("dropped").map(rowText).join("|") === "↯ dropped out" &&
      !painted.some((n) => (n.className || "").startsWith("replaycell defeated")),
    `${cellsOf("dropped").map(rowText).join("|")} · ${
      painted.filter((n) => (n.className || "").startsWith("replaycell defeated")).length
    } defeat rows`,
  ],
  [
    "a dropped side has no at-defeat block at all — its base died before the drop",
    !rowOfKind(headRows, "replaylost atdefeat"),
    headRows.map((row) => kindOf(row, "left")).join(" / "),
  ],
  [
    "a resignation loses the match too",
    replays && JSON.stringify(replays.sideVerdicts([[{ resigned: 90 }], [{}]])) === '["lost","won"]',
    "",
  ],
  [
    "and a match nobody left says nothing rather than guessing",
    replays &&
      JSON.stringify(replays.sideVerdicts([[{}], [{}]])) === '["",""]' &&
      JSON.stringify(replays.sideVerdicts([[{ dropped: 10 }], [{ dropped: 20 }]])) === '["",""]',
    "",
  ],
  [
    "a team is out only when all of it is",
    replays &&
      JSON.stringify(replays.sideVerdicts([[{ dropped: 10 }, {}], [{}, {}]])) === '["",""]' &&
      JSON.stringify(replays.sideVerdicts([[{ dropped: 10 }, { resigned: 20 }], [{}, {}]])) === '["lost","won"]',
    "",
  ],
  // What makes the renderer portable, asserted rather than trusted: it hands
  // back a fragment and writes into nothing it was not given. The panel around
  // it — clearing itself, settling the empty line under it — is the caller's,
  // and options.js is read for it below. What that line *says* is a question of
  // its own, in the section after this one.
  [
    "the report comes back as a fragment, not written into a panel",
    reportEl.kids.length === 1 && reportEl.kids[0].tag === "#fragment",
    reportEl.kids.map((n) => n.tag).join(","),
  ],
  [
    "and the page it is shipped in still clears its panel and settles the empty line",
    /replayReportEl\.textContent = "";/.test(js) && /replayEmptyEl\.hidden = !notice;/.test(js),
    "",
  ],
];
for (const [name, ok, detail] of drawn) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- the harvested object table, installed -----------------------------------
//
// A replay states what was built as an ordinal and nothing else, so the object
// table is what makes every row above readable. It used to ship as a committed
// file generated from a local RA2 install; it now arrives from the player's own
// client, through storage, which moves the question from "was the file
// generated" to "does the page pick the table up" — on load, and again when one
// lands while the page is already open.
//
// The second half is the one worth a check. A one-shot latch there does not
// fail: the cameo sheet met exactly this, where the sheet on the root element
// stayed the old pixels while the cell numbers came from the new index, and
// every row drew a confidently wrong picture. The same shape here is an index
// memoised off the previous table answering for ids the new one numbers
// differently — a wrong name and a wrong cost per row, with nothing thrown.
//
// Read out of options.js and driven, the same way `recentStore` above is: the
// installer takes its host as a parameter rather than finding `window`, so it
// can be pointed at something that is not the page.

const fnOf = (name, params) => {
  const found = new RegExp(
    `\\r?\\n {2}function ${name}\\(${params.join(", ")}\\) \\{\\r?\\n([\\s\\S]*?)\\r?\\n {2}\\}\\r?\\n`
  ).exec(js);
  return found ? new Function(...params, found[1]) : null;
};

const install = fnOf("installReplayTypes", ["stored", "host"]);
const noticeFor = fnOf("replayTypesNotice", ["host"]);

/**
 * `objectInfo` with its memo, and nothing else of the page.
 *
 * The two `let`s it caches in are handed in rather than read out of the file,
 * the way `RECENT_CAP` is above — what is being asked is what the body does with
 * them across a table being swapped underneath it.
 */
const infoBody = /\r?\n {2}function objectInfo\(name\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
// `memo` hands back the cache itself, which is the only way to see a rebuild
// from out here: the miss path returns a fresh `{ label: "", cost: 0 }` every
// time, so comparing two answers says nothing about whether the index behind
// them was thrown away and built again.
const objectInfoOn = (host) =>
  infoBody
    ? new Function(
        "window",
        "TYPE_LABELS",
        `let objectIndex = null; let objectIndexOf = null;
         function objectInfo(name) {${infoBody[1]}
         }
         return { ask: objectInfo, memo: () => objectIndex };`
      )(host, Object.fromEntries(named("TYPE_LABELS").map((list) => [list, list])))
    : { ask: () => ({ label: "no objectInfo in options.js" }), memo: () => null };

/** The shape src/bridge.js writes under `replayTypes`, cut to four rows. */
const harvested = {
  version: "0.87.0/1",
  at: 1,
  types: {
    building: [["GAPOWR", "Power Plant", 800]],
    infantry: [["E1", "GI", 200]],
    // Named differently from the committed table below on purpose: which of the
    // two answered is then readable off the label rather than inferred.
    vehicle: [["HTNK", "Apocalypse", 1750]],
    aircraft: [],
  },
  general: { buildSpeed: 0.7 },
};

// A page that has the committed file loaded and nothing harvested yet — which is
// every profile until the first time a game tab is opened.
const page = {
  __cdcReplayTypes: { building: [], infantry: [], vehicle: [["HTNK", "Apocalypse Tank", 1750]], aircraft: [] },
  __cdcReplayRules: { buildSpeed: 0.9 },
};
const naming = objectInfoOn(page);
// A profile with no table at all asks names too, and the index it caches has to
// be reusable — `window.__cdcReplayTypes || {}` is a different empty object on
// every call, which is a rebuild per row drawn.
const nothingHeld = objectInfoOn({});
nothingHeld.ask("HTNK");
const firstEmptyIndex = nothingHeld.memo();
nothingHeld.ask("E1");
const rebuilt = nothingHeld.memo() !== firstEmptyIndex;
// Asked before the harvest so the memo is built off the committed table, which
// is the state the latch would be invisible in.
const namedBefore = naming.ask("HTNK").label;
const installed = install ? install(harvested, page) : false;
const namedAfter = naming.ask("HTNK").label;

// A profile with nothing at all, which is what the notice exists for.
const bare = {};

// And the two writes that must not land: the bridge already refuses an empty
// table, and a page that blanked the table it is drawing from would turn a
// readable report into numbered rows on somebody else's mistake.
const holding = { __cdcReplayTypes: page.__cdcReplayTypes, __cdcReplayRules: page.__cdcReplayRules };
const keptOnEmpty = install ? install({ version: "x", types: {} }, holding) : true;
const keptOnNull = install ? install(null, holding) : true;

// The same timeline the section above drew, read with no table at all — the
// first-run state, from the reader's side.
//
// Re-**parsed**, not re-analysed: an ordinal becomes a name inside
// src/replay.js's `parse` (`objectFor` is called from the frame decoder, not
// from `analyze`), so a report's names are fixed at the moment the file was read
// and the table has to be gone before that. Restored straight after, because
// everything below reads the same globals.
const withTypes = globalThis.__cdcReplayTypes;
const withRules = globalThis.__cdcReplayRules;
globalThis.__cdcReplayTypes = null;
globalThis.__cdcReplayRules = null;
let unnamedRows = "";
try {
  const unnamed = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
  const cell = fakeNode("div");
  cell.append(replays.render(unnamed, {}));
  unnamedRows = text(cell);
} catch (e) {
  // Not swallowed: a first-run page that cannot read a replay at all is a
  // bigger finding than the one being asked about, and it reads out as this
  // line rather than as a passing run.
  unnamedRows = `reading it with no table threw ${e.message}`;
}
globalThis.__cdcReplayTypes = withTypes;
globalThis.__cdcReplayRules = withRules;
const NUMBERED = /\b(?:building|infantry|vehicle|aircraft) #\d+/;

// The three wirings, read as text — a storage listener's body and a caller are
// not reachable from here the way a helper is. Held as values so a passing line
// does not print the sentence that explains a failure.
const liveBranch = /if \(changes\.replayTypes && installReplayTypes\(changes\.replayTypes\.newValue, window\)\) \{/.test(js);
const readAgain = /if \(replayReport && replayUrl\) openReplay\(replayUrl, replayMatchRow\);/.test(js);
const noticeDrawn =
  /const notice = replayTypesNotice\(window\);/.test(js) &&
  /replayEmptyEl\.textContent = notice;/.test(js) &&
  /replayEmptyEl\.hidden = !notice;/.test(js);

const types = [
  [
    "a harvested table is installed under both globals",
    installed && page.__cdcReplayTypes === harvested.types && page.__cdcReplayRules === harvested.general,
    installed
      ? `types ${page.__cdcReplayTypes === harvested.types ? "harvested" : "not the stored one"}, ` +
        `rules ${page.__cdcReplayRules === harvested.general ? "harvested" : "not the stored one"}`
      : "installReplayTypes refused it, or options.js no longer has it",
  ],
  [
    // The committed file is about to stop being shipped; while both exist the
    // one read out of the player's own client is the one the replay was
    // recorded by.
    "the harvested table wins over the committed one",
    namedBefore === "Apocalypse Tank" && namedAfter === "Apocalypse",
    `${namedBefore} -> ${namedAfter}`,
  ],
  [
    // The live half. `objectInfo` caches, and a cache that outlives the table it
    // was built from is the defect this whole section is here for.
    "a table arriving live is what the next name is read from",
    namedAfter === "Apocalypse",
    namedAfter === namedBefore ? "still answering from the table it first indexed" : namedAfter,
  ],
  [
    "an index built from no table at all is built once",
    !rebuilt,
    rebuilt ? "rebuilt on every lookup — the empty table is a new object each time" : "",
  ],
  [
    "a table with no rows in it does not blank the one in use",
    keptOnEmpty === false && keptOnNull === false && holding.__cdcReplayTypes === page.__cdcReplayTypes,
    `empty ${keptOnEmpty}, null ${keptOnNull}`,
  ],
  [
    // The load half is two lines apart and both are needed: `get` hands back
    // only the keys it was asked for, so a missing default is a page that reads
    // `undefined` for ever and installs nothing.
    "the load asks storage for the table and installs it",
    /\r?\n {6}replayTypes: null,\r?\n/.test(js) && /installReplayTypes\(data\.replayTypes, window\)/.test(js),
    /\r?\n {6}replayTypes: null,\r?\n/.test(js) ? "" : "storage.local.get never asks for `replayTypes`",
  ],
  [
    "a table landing while the page is open is installed and redrawn",
    liveBranch,
    liveBranch ? "" : "no `changes.replayTypes` branch in the storage listener",
  ],
  [
    // A report's names are fixed while the file is *parsed*, so redrawing the
    // report on screen from what is already in memory would leave every row
    // numbered under a notice that had just gone away — worse than not reacting
    // at all. The file is read again instead, which is the only thing that
    // renames anything.
    "and the open report is read again, not just redrawn",
    readAgain,
    readAgain ? "" : "the listener redraws the report instead of re-reading it",
  ],
  [
    "a timeline with no table draws numbered rows",
    NUMBERED.test(unnamedRows),
    NUMBERED.test(unnamedRows) ? (NUMBERED.exec(unnamedRows) || [""])[0] : unnamedRows.slice(0, 120),
  ],
  [
    "and carries the line saying where the names come from",
    !!noticeFor && /your own game/.test(noticeFor(bare) || ""),
    noticeFor ? JSON.stringify(noticeFor(bare)) : "no replayTypesNotice in options.js",
  ],
  [
    // The same host the timeline above was rendered from, so this is the notice
    // against a real table rather than a stand-in for one.
    "a timeline with a table does not",
    !!noticeFor && noticeFor(globalThis) === "" && noticeFor(page) === "",
    noticeFor ? JSON.stringify(noticeFor(globalThis)) : "no replayTypesNotice in options.js",
  ],
  [
    "and the paragraph under the report is what carries it",
    noticeDrawn,
    noticeDrawn ? "" : "showReplay does not write the notice into #replayEmpty",
  ],
];
for (const [name, ok, detail] of types) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- a replay read off disk -------------------------------------------------

/**
 * The two halves of opening a `.rpl` the user handed over, driven rather than
 * grepped for.
 *
 * Both are pulled out of src/options.js by name and run here, the way `install`
 * and `objectInfo` above are: the panel around them needs a document, storage
 * and a network, and none of the three is what these two do. A `null` body is
 * an extraction that stopped matching, which is a failure and not a skip --
 * every assertion below reads `false` when there is no function to run.
 *
 * Regex literals rather than one builder over a template string: a `new RegExp`
 * of a pattern this shape needs every backslash doubled, and `infoBody` above
 * already reads the same file the same way.
 */
const probeBody = /\r?\n {2}async function findReplayOnline\(gameId\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);

const HOSTS = { "am-eu": "https://eu.test", sea: "https://sea.test" };

/**
 * `findReplayOnline` over a host that answers however the case wants.
 *
 * `asked` is the point of the harness: whether the probe short-circuits on the
 * first hit and whether it really sends a `HEAD` are both invisible in the
 * return value, and a probe that downloaded whole replays would pass a test
 * that only read what came back.
 */
const probeWith = (answer) => {
  const asked = [];
  if (!probeBody) return { run: async () => null, asked };
  const run = new Function(
    "REPLAY",
    "fetch",
    "console",
    `return async function findReplayOnline(gameId) {${probeBody[1]}\n};`
  )({ REPLAY_HOSTS: HOSTS }, async (url, init) => {
    asked.push(`${(init && init.method) || "GET"} ${url}`);
    return answer(url);
  }, { warn: () => {} });
  return { run, asked };
};

const ID = "5a41749b-26f9-4303-a69c-5938bb8b219c";
const hitOn = (host) => (url) => ({ ok: url.startsWith(host) });
const onEu = probeWith(hitOn("https://eu.test"));
const foundEu = await onEu.run(ID);
const onSea = probeWith(hitOn("https://sea.test"));
const foundSea = await onSea.run(ID);
const onNeither = probeWith(() => ({ ok: false }));
const foundNothing = await onNeither.run(ID);
const offline = probeWith(() => {
  throw new Error("net::ERR_INTERNET_DISCONNECTED");
});
const foundOffline = await offline.run(ID);

const textBody = /\r?\n {2}async function openReplayText\(text, name\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);

/**
 * `openReplayText` with the panel stubbed out around it.
 *
 * The five `let`s it writes are declared in the wrapper and handed back by
 * `read()`, which is the only way to see from out here what it decided -- the
 * function returns nothing, and everything it does is to the panel's state.
 */
const readerFinding = (found) => {
  if (!textBody) return null;
  const calls = [];
  const notes = [];
  const made = new Function(
    "REPLAY",
    "VIEW",
    "replayNote",
    "replayEmptyEl",
    "showReplay",
    "findReplayOnline",
    "rememberReplay",
    "renderReplayList",
    "renderRecents",
    "syncSimButton",
    "console",
    `let replayReport = null, replaySourceNote = "", replayMatchRow = "the ladder's row", replayOpen = "", replayUrl = "";
     return {
       run: async function openReplayText(text, name) {${textBody[1]}
       },
       read: () => ({ replayReport, replaySourceNote, replayMatchRow, replayOpen, replayUrl }),
     };`
  )(
    globalThis.__cdcReplay,
    replays,
    (text, bad) => notes.push((bad ? "BAD " : "") + text),
    { hidden: true, textContent: "" },
    () => calls.push("showReplay"),
    async () => {
      calls.push("probe");
      return found;
    },
    () => calls.push("remember"),
    () => calls.push("list"),
    () => calls.push("recents"),
    () => calls.push("sim"),
    { warn: () => {} }
  );
  return { ...made, calls, notes };
};

const served = { url: `https://eu.test/${ID}.rpl`, gameId: ID, realm: "am-eu" };
const online = readerFinding(served);
if (online) await online.run(fixture, "ladder-1v1.rpl");
const gone = readerFinding(null);
if (gone) await gone.run(fixture, "ladder-1v1.rpl");
// An exported report, which is the other thing that gets dropped on this panel.
const exported = readerFinding(null);
const exportedText = JSON.stringify(
  globalThis.__cdcReplay.exportReport(globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture)), {
    extension: "1.2.3",
  })
);
if (exported) await exported.run(exportedText, "cd-report.json");
const rubbish = readerFinding(null);
if (rubbish) await rubbish.run("this is not a replay and not a report", "notes.txt");

const disk = [
  [
    "the panel has a file input for a replay, and it takes a .rpl",
    /id="replayFile"[^>]*type="file"/.test(html) && /id="replayFile"[^>]*accept="[^"]*\.rpl/.test(html),
    /id="replayFile"/.test(html) ? "" : "no #replayFile in options.html",
  ],
  [
    "picking the same file twice is read twice — the input is cleared after a read",
    /replayFileEl\.addEventListener\("change"[\s\S]{0,240}?replayFileEl\.value = ""/.test(js),
  ],
  [
    "a replay served by a realm resolves to that realm's URL",
    !!foundEu && foundEu.url === `https://eu.test/${ID}.rpl` && foundEu.realm === "am-eu",
    foundEu ? `${foundEu.realm} ${foundEu.url}` : "nothing found",
  ],
  [
    "and the first host that answers ends it — the second is never asked",
    onEu.asked.length === 1 && onEu.asked[0] === `HEAD https://eu.test/${ID}.rpl`,
    onEu.asked.join(", "),
  ],
  [
    "a replay on the other realm is found by asking that one too",
    !!foundSea && foundSea.realm === "sea" && onSea.asked.length === 2,
    onSea.asked.join(", "),
  ],
  [
    "the ask is a HEAD, not a download of the replay",
    onSea.asked.length > 0 && onSea.asked.every((one) => one.startsWith("HEAD ")),
    onSea.asked.join(", "),
  ],
  [
    "a match no host serves is a miss, after both were asked",
    foundNothing === null && onNeither.asked.length === 2,
    `${foundNothing} after ${onNeither.asked.length}`,
  ],
  [
    "a network that is not there is a miss and not a throw",
    foundOffline === null && offline.asked.length === 2,
    `${foundOffline} after ${offline.asked.length}`,
  ],
  [
    "a dropped replay is drawn before any host is asked",
    !!online &&
      online.calls.indexOf("showReplay") >= 0 &&
      online.calls.indexOf("showReplay") < online.calls.indexOf("probe"),
    online ? online.calls.join(" -> ") : "no openReplayText in options.js",
  ],
  [
    "and it carries the file's own game id, so the rest of the panel can find it",
    !!online && online.read().replayOpen === ID && !!online.read().replayReport,
    online ? online.read().replayOpen : "",
  ],
  [
    "a served match gets the URL, is remembered, and the re-run is offered",
    !!online &&
      online.read().replayUrl === served.url &&
      online.calls.includes("remember") &&
      online.calls.includes("sim"),
    online ? `${online.read().replayUrl} · ${online.calls.join(" -> ")}` : "",
  ],
  [
    "a match no host serves still draws, keeps no URL, and says why it cannot be re-run",
    !!gone &&
      !!gone.read().replayReport &&
      gone.read().replayUrl === "" &&
      !gone.calls.includes("remember") &&
      /cannot be re-run/.test(gone.notes[gone.notes.length - 1] || ""),
    gone ? gone.notes[gone.notes.length - 1] : "",
  ],
  [
    "the ladder's row is dropped — it belonged to the match that was on screen, not to this file",
    !!online && online.read().replayMatchRow === null,
    online ? String(online.read().replayMatchRow) : "",
  ],
  [
    "an exported report is told from a replay by its content, not its name",
    !!exported && !!exported.read().replayReport && /exported report/.test(exported.read().replaySourceNote),
    exported ? exported.read().replaySourceNote : "",
  ],
  [
    "and a replay's own note names the file it came from",
    !!online && online.read().replaySourceNote === "from ladder-1v1.rpl",
    online ? online.read().replaySourceNote : "",
  ],
  [
    "a file that is neither is refused, and nothing on screen claims to be a report",
    !!rubbish &&
      rubbish.read().replayReport === null &&
      /^BAD could not read notes\.txt/.test(rubbish.notes[rubbish.notes.length - 1] || "") &&
      !rubbish.calls.includes("showReplay"),
    rubbish ? rubbish.notes[rubbish.notes.length - 1] : "",
  ],
];
for (const [name, ok, detail] of disk) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- power, outages and build tempo -----------------------------------------

/**
 * The committed harvest predates all three readings, so they are written into a
 * copy of it here — the same doctoring the spawn, readiness and capture tracks
 * above get, and for the same reason: a fixture regenerated from a real re-run
 * costs a game client and a match, and what is being asked is whether the
 * report reads a harvest that has them, not whether a client produces one.
 *
 * The story written in is deliberately one a chart cannot draw by accident:
 *
 *   0:00 - 1:00   healthy, one war factory
 *   1:00 - 1:30   short of power — produced 60 against a drain of 200
 *   1:30 - 2:00   healthy again, and a second war factory is up
 *   2:00 - 2:20   **blacked out on a surplus** — 400 produced against 200 drawn
 *                 and the client still says Low, which is a spy and is the one
 *                 case a chart of the two lines cannot show
 *   2:20 - end    healthy
 *
 * P_B never browns out and never builds a second factory, so every assertion
 * below has a side that should show the opposite.
 */
const POWERED = JSON.parse(JSON.stringify(harvest));
const TICK = 60;
for (const row of POWERED.samples) {
  const seconds = row.tick / TICK;
  const short = seconds >= 60 && seconds < 90;
  const spied = seconds >= 120 && seconds < 140;
  for (const player of row.players) {
    const mine = player.name === "Player_A";
    player.power = {
      total: mine && short ? 60 : 400,
      drain: 200,
      low: mine && (short || spied),
      blackout: mine && spied,
    };
    player.tempo = {
      speed: mine && short ? 0.55 : 1,
      factories: {
        Structures: 1,
        Infantry: 1,
        Vehicles: mine && seconds >= 90 ? 2 : 1,
        Aircraft: 0,
        Ships: 0,
      },
    };
  }
}
const poweredReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(poweredReport, POWERED);
const poweredEl = fakeNode("div");
if (replays) poweredEl.append(replays.render(poweredReport, { losses: true }));
const poweredNodes = replays ? flat(poweredEl) : [];

/**
 * One chart out of the report, by the name in its caption.
 *
 * The class is matched as a list and not as a whole string: a chart that takes
 * the full row carries `replaychart wide`, and an equality test here would have
 * reported every one of those as absent — which is a check that goes green by
 * finding nothing.
 */
const chartNamed = (nodes, title) =>
  nodes.find(
    (node) =>
      (node.className || "").split(" ").includes("replaychart") &&
      flat(node).some((kid) => kid.tag === "strong" && kid.textContent === title)
  );
const classed = (node, name) =>
  node ? flat(node).filter((kid) => (kid.className || "").split(" ").includes(name)) : [];

const powerChart = chartNamed(poweredNodes, "Power");
const brownedCells = classed(poweredEl, "browned");
const tempoChart = chartNamed(poweredNodes, "Build speed");
const powerNote = powerChart ? (flat(powerChart).find((n) => n.tag === "span" && /outage|never short/.test(n.textContent || "")) || {}).textContent || "" : "";
const bandTitles = classed(powerChart, "replayband").map(
  (rect) => (flat(rect).find((kid) => kid.tag === "title") || {}).textContent || ""
);
const tempoKeys = classed(tempoChart, "replaykey");
const keyOn = (key) => key.attrs["aria-pressed"] === "true";
// Read before the click below, which is the whole point of the click: an
// assertion about what the chart starts with, measured after a reader has
// changed it, is an assertion about nothing.
const keysOnAtFirst = tempoKeys.filter(keyOn);
// Polylines only: since the legend keys became short pieces of the line itself,
// a `.replayline` is either a series on the plot or a key above it, and the two
// have to be counted apart.
const tempoLines = () => classed(tempoChart, "replayline").filter((node) => node.tag === "polyline").length;
const linesBefore = tempoLines();
// The first key that starts switched off, turned on: the reader's own gesture.
const offKey = tempoKeys.find((key) => !keyOn(key));
// `on` holds a list per event name, the way this file's fake node records them.
for (const fn of (offKey && offKey.on.click) || []) fn();
const linesAfter = tempoLines();

// The same report with a harvest that predates the readings, which is what every
// stored run is until a match is re-run again.
const plainEl = fakeNode("div");
if (replays) plainEl.append(replays.render(report, { losses: true }));
const plainNodes = replays ? flat(plainEl) : [];

const countChart = chartNamed(poweredNodes, "Factories");
const countKeys = classed(countChart, "replaykey");
const keyNamed = (keys, name) =>
  keys.find((key) => flat(key).map((k) => k.textContent).join("").trim() === name);
/** Each drawn line on a chart, as the list of vertices it was given. */
const vertices = (chart) =>
  classed(chart, "replayline")
    .filter((node) => node.tag === "polyline")
    .map((line) =>
      (line.attrs.points || "")
        .trim()
        .split(/\s+/)
        .map((pair) => pair.split(",").map(Number))
    );
const vertexCounts = (chart) => vertices(chart).map((line) => line.length);
/**
 * Whether each line on a chart is drawn as a staircase.
 *
 * Counting the vertices is not enough and was the first version of this: a
 * corner drawn at the **new** height is the sloped line again with a doubled
 * point, and the count is identical. So the shape is asserted instead — every
 * odd vertex holds the previous reading's height and sits at the next reading's
 * moment, which is the whole of what a step is.
 */
const stepped = (chart) =>
  vertices(chart).map((line) =>
    line.every((point, i) => i % 2 === 0 || (point[1] === line[i - 1][1] && point[0] === line[i + 1][0]))
  );
/** The box a chart's SVG states for itself, which is not the size it renders. */
const viewBoxOf = (chart) => {
  const svg = chart && flat(chart).find((node) => (node.className || "") === "replayplot");
  return svg ? svg.attrs.viewBox : "";
};
/** Every chart on a report, in the order they are laid out. */
const chartFigures = (nodes) =>
  nodes.filter((node) => (node.className || "").split(" ").includes("replaychart"));
/** The one-line note under a chart's title. */
const captionOf = (chart) => {
  const said = chart && flat(chart).find((node) => node.tag === "span" && (node.textContent || "").length > 20);
  return said ? said.textContent : "";
};
const readoutOf = (chart) => classed(chart, "replayreadout")[0] || { hidden: null, kids: [] };
/** How many of a chart's crosshairs are drawn — one when it answers, none when it does not. */
const rulesAt = (chart) =>
  classed(chart, "replaycross").filter((node) => node.attrs.visibility === "visible").length;
/**
 * The pointer, put on a chart's plot at a real x.
 *
 * `fakeNode`'s rect is 640 wide against a 1080 box, so 320 lands mid-plot — the
 * arithmetic the renderer does is exercised rather than stubbed, and what is
 * being asked is whether the OTHER charts answer for the moment it works out.
 */
const hover = (chart, clientX) => {
  for (const fn of (classed(chart, "replayhit")[0] || { on: {} }).on.mousemove || []) fn({ clientX });
};
const leave = (chart) => {
  for (const fn of (classed(chart, "replayhit")[0] || { on: {} }).on.mouseleave || []) fn({});
};
/** A key pressed on a chart's grip, the way a reader moves one without a mouse. */
const press = (chart, key) => {
  for (const fn of (classed(chart, "replaygrip")[0] || { on: {} }).on.keydown || []) fn({ key, preventDefault() {} });
};
/**
 * A chart picked up by its grip: the press, then the release.
 *
 * The moves in between go to the **window**, not to the grip, and they settle
 * the list against `getBoundingClientRect` — which this fake answers with one
 * rectangle for every node, so where a chart lands is a question only a browser
 * can be asked. What is asked here is the gesture's own wiring: that a press
 * takes hold, that a release lets go and writes the order down, and that the
 * moves in between are listened for at all.
 */
const grab = (chart) => {
  for (const fn of (classed(chart, "replaygrip")[0] || { on: {} }).on.pointerdown || []) {
    fn({ button: 0, clientY: 100, preventDefault() {} });
  }
};
const letGo = () => windowFire("pointerup", {});
/** The charts of a rendered report, by name, in the order they sit in the DOM. */
const chartOrderNow = (root) =>
  (classed(root, "replaycharts")[0] || { kids: [] }).kids.map((figure) => figure.getAttribute("data-chart"));

/**
 * A harvest that counted factories but states no coefficient.
 *
 * What a profile with no harvested rules table produces: `tempoOf` writes the
 * counts it was given and deletes `rate`, because a coefficient it cannot work
 * out would be an invented one. The count is not invented — it came off the
 * client — so the report should draw the one chart and not the other, and this
 * is the fixture that says which way round.
 */
const uncountedReport = JSON.parse(JSON.stringify(poweredReport));
for (const row of uncountedReport.sim.samples) {
  for (const player of Object.values(row.players)) if (player.tempo) delete player.tempo.rate;
}
const uncountedEl = fakeNode("div");
if (replays) uncountedEl.append(replays.render(uncountedReport, { losses: true }));
const uncountedNodes = replays ? flat(uncountedEl) : [];

/**
 * How a side of two players is folded into one line, asked of the curves
 * directly.
 *
 * The rendered fixture is a 1v1, where a sum and a maximum are the same number
 * and an assertion about either is an assertion about nothing. Two players on
 * one side with a different count each is the only shape that tells them apart:
 * two war factories and one is **three factories** on the side and a build speed
 * of **1.25x**, the better of the two, because speeds do not add.
 */
const teamed = replays
  ? replays.tempoCurves(
      {
        duration: 10,
        sim: {
          samples: [
            {
              at: 0,
              players: {
                One: { tempo: { factories: { Vehicles: 2 }, rate: { Vehicles: 1.25 } } },
                Two: { tempo: { factories: { Vehicles: 1 }, rate: { Vehicles: 1 } } },
              },
            },
          ],
        },
      },
      [[{ name: "One" }, { name: "Two" }]]
    )
  : { tempo: [], counts: [] };

// The coefficient, straight out of the merged report rather than off a chart:
// two war factories at 0.8 is 1.25, and a browned-out base is its own modifier.
const rateAt = (seconds, queue) => {
  const row = poweredReport.sim.samples.reduce((best, one) =>
    Math.abs(one.at - seconds) < Math.abs(best.at - seconds) ? one : best
  );
  const player = row.players.Player_A;
  return player && player.tempo && player.tempo.rate ? player.tempo.rate[queue] : undefined;
};

const powered = [
  [
    "a re-run that read power draws a power chart, and one that did not draws none",
    !!powerChart && !chartNamed(plainNodes, "Power"),
    `${!!powerChart} with, ${!!chartNamed(plainNodes, "Power")} without`,
  ],
  [
    "the same for build speed — an old harvest gets no chart rather than a flat one",
    !!tempoChart && !chartNamed(plainNodes, "Build speed"),
    `${!!tempoChart} with, ${!!chartNamed(plainNodes, "Build speed")} without`,
  ],
  [
    "every brownout is a band, and the side that never browned out draws none",
    bandTitles.length === 2 && bandTitles.every((said) => /Player_A/.test(said)),
    bandTitles.join(" | "),
  ],
  [
    "a blackout on a surplus is named as one, not as a shortage",
    bandTitles.some((said) => /blacked out/.test(said)) && bandTitles.some((said) => /short of power/.test(said)),
    bandTitles.join(" | "),
  ],
  [
    "the outages are added up in the chart's own line — count, total and longest",
    /2 outages/.test(powerNote) && /0:50 in total/.test(powerNote) && /longest 0:30/.test(powerNote),
    powerNote,
  ],
  [
    "and the side that was never short says so rather than being left out",
    /never short of power/.test(powerNote),
    powerNote,
  ],
  [
    "a second war factory reads as 1.25x, one as 1.00x",
    rateAt(150, "Vehicles") === 1.25 && rateAt(30, "Vehicles") === 1,
    `${rateAt(30, "Vehicles")} -> ${rateAt(150, "Vehicles")}`,
  ],
  [
    "a browned-out base builds below 1, by the client's own modifier",
    rateAt(75, "Infantry") === 0.55,
    String(rateAt(75, "Infantry")),
  ],
  [
    "a queue with no factory is a gap in the line, not a speed",
    rateAt(75, "Aircraft") === null,
    String(rateAt(75, "Aircraft")),
  ],
  [
    "the build-speed legend offers every queue and starts on infantry and vehicles",
    tempoKeys.length === 10 &&
      keysOnAtFirst.length === 4 &&
      keysOnAtFirst.every((key) => /infantry|vehicles/.test(flat(key).map((k) => k.textContent).join(""))),
    `${tempoKeys.length} keys, ${keysOnAtFirst.length} on: ${keysOnAtFirst
      .map((key) => flat(key).map((k) => k.textContent).join(""))
      .join(", ")}`,
  ],
  [
    "and only the ones that are on are drawn",
    linesBefore === 4,
    String(linesBefore),
  ],
  [
    "the brownout reaches the timeline as well as the chart, down the right side's column",
    brownedCells.length > 0 &&
      brownedCells.every((cell) => (cell.className || "").split(" ").includes("s1")) &&
      brownedCells.some((cell) => (cell.className || "").split(" ").includes("blackedout")),
    `${brownedCells.length} cells, ${brownedCells.filter((c) => (c.className || "").includes("blackedout")).length} blacked out`,
  ],
  [
    "and it covers the rows that are not there, which is what makes it a band",
    brownedCells.some((cell) => (cell.className || "").split(" ").includes("empty")),
    brownedCells.filter((c) => (c.className || "").includes("empty")).length + " empty rows shaded",
  ],
  [
    "a report with no harvest shades nothing — the file holds no power",
    classed(plainEl, "browned").length === 0,
    String(classed(plainEl, "browned").length),
  ],
  [
    "clicking a key off the chart puts its line on it",
    !!offKey && linesAfter === linesBefore + 1,
    `${linesBefore} -> ${linesAfter}`,
  ],
  [
    "a factory-count chart is drawn beside the speed it explains, and not on an old harvest",
    !!countChart && !chartNamed(plainNodes, "Factories"),
    `${!!countChart} with, ${!!chartNamed(plainNodes, "Factories")} without`,
  ],
  [
    "it offers the same queues as the speed chart and starts on the same two",
    countKeys.length === tempoKeys.length && countKeys.filter(keyOn).length === 4,
    `${countKeys.length} keys, ${countKeys.filter(keyOn).length} on`,
  ],
  [
    "nought is a reading here and a gap above — a queue with no factory has a line to draw",
    !!keyNamed(countKeys, "aircraft") &&
      !keyNamed(countKeys, "aircraft").disabled &&
      !!keyNamed(tempoKeys, "aircraft") &&
      !!keyNamed(tempoKeys, "aircraft").disabled,
    `factories aircraft ${keyNamed(countKeys, "aircraft") && keyNamed(countKeys, "aircraft").disabled ? "dead" : "live"}, ` +
      `speed aircraft ${keyNamed(tempoKeys, "aircraft") && keyNamed(tempoKeys, "aircraft").disabled ? "dead" : "live"}`,
  ],
  [
    "a count is held between readings, not sloped — every corner is at the height it came from",
    stepped(countChart).length === 4 &&
      stepped(countChart).every(Boolean) &&
      vertexCounts(countChart).every((n) => n === POWERED.samples.length * 2 - 1) &&
      vertexCounts(tempoChart).every((n) => n === POWERED.samples.length),
    `factories ${vertexCounts(countChart).join("/")} vertices, ${stepped(countChart).filter(Boolean).length} of ${
      stepped(countChart).length
    } stepped; speed ${vertexCounts(tempoChart).join("/")} over ${POWERED.samples.length} readings`,
  ],
  [
    "a harvest with counts but no rules behind them draws the counts and not the coefficient",
    !!chartNamed(uncountedNodes, "Factories") && !chartNamed(uncountedNodes, "Build speed"),
    `${!!chartNamed(uncountedNodes, "Factories")} counts, ${!!chartNamed(uncountedNodes, "Build speed")} speed`,
  ],
  [
    "every chart is the same box — there is no narrow one and no special case",
    chartFigures(poweredNodes).length === 7 &&
      chartFigures(poweredNodes).every((figure) => viewBoxOf(figure) === "0 0 1080 190"),
    chartFigures(poweredNodes)
      .map((figure) => `${figure.getAttribute("data-chart")} ${viewBoxOf(figure)}`)
      .join(" | "),
  ],
  [
    "no chart draws a tooltip of the caption printed above it",
    // Every `<title>` still on the page names a band, not a chart — the outage
    // shading has nothing else to say what it is. The name a screen reader gets
    // moved to `aria-label`, which is a name and not a box that opens over the
    // plot a second after the pointer stops.
    !flat(poweredEl).some((node) => {
      const said = node.tag === "title" && (node.textContent || "");
      return said && chartFigures(poweredNodes).some((figure) => said.startsWith(figure.getAttribute("data-chart") + " —"));
    }) &&
      chartFigures(poweredNodes).every((figure) => {
        const svg = flat(figure).find((node) => (node.className || "") === "replayplot");
        return svg && svg.attrs["aria-label"] === `${figure.getAttribute("data-chart")} — ${captionOf(figure)}`;
      }),
    `${flat(poweredEl).filter((n) => n.tag === "title").length} svg titles left, all of them bands`,
  ],
  [
    "nor on a legend key that works — only on the one that cannot",
    // Both charts' keys, because the two branches live on different ones: every
    // key on Factories can be clicked, and the four dead ones are on Build
    // speed. Asked of one chart it was an assertion about one branch.
    tempoKeys.concat(countKeys).every((key) => (key.disabled ? !!key.title : !key.title)) &&
      tempoKeys.some((key) => key.disabled) &&
      countKeys.every((key) => !key.disabled),
    `${tempoKeys.concat(countKeys).filter((k) => k.title).length} of ${
      tempoKeys.length + countKeys.length
    } keys carry one, ${tempoKeys.concat(countKeys).filter((k) => k.disabled).length} are dead`,
  ],
  [
    "a moment pointed at on one chart is drawn on every chart",
    (() => {
      hover(powerChart, 320);
      return chartFigures(poweredNodes).every((figure) => rulesAt(figure) === 1 && !readoutOf(figure).hidden);
    })(),
    `${chartFigures(poweredNodes).filter((f) => rulesAt(f) === 1).length} of ${
      chartFigures(poweredNodes).length
    } charts ruled, readouts say ${readoutOf(countChart).kids.map((k) => k.textContent).join(" ").slice(0, 40)}`,
  ],
  [
    "and taking the pointer off one takes it off all of them",
    (() => {
      leave(powerChart);
      return chartFigures(poweredNodes).every((figure) => rulesAt(figure) === 0 && readoutOf(figure).hidden);
    })(),
    `${chartFigures(poweredNodes).filter((f) => rulesAt(f) === 0).length} cleared`,
  ],
  [
    "every chart carries a grip, and the arrow keys move the chart it belongs to",
    (() => {
      const was = chartOrderNow(poweredEl);
      press(chartNamed(poweredNodes, "Credits"), "ArrowDown");
      const now = chartOrderNow(poweredEl);
      return (
        chartFigures(poweredNodes).every((figure) => classed(figure, "replaygrip").length === 1) &&
        was[0] === "Credits" &&
        now[1] === "Credits" &&
        now[0] === was[1]
      );
    })(),
    chartOrderNow(poweredEl).slice(0, 3).join(" / "),
  ],
  [
    "a press on a grip takes hold of its chart and a release lets go of it",
    (() => {
      const chart = chartNamed(poweredNodes, "Power");
      grab(chart);
      const held = (chart.className || "").split(" ").includes("dragging");
      const listening = windowOn.has("pointermove") && windowOn.get("pointermove").size === 1;
      letGo();
      return (
        held &&
        listening &&
        !(chart.className || "").split(" ").includes("dragging") &&
        // Let go of, and not still listened for: a gesture that leaves its
        // window listeners behind moves charts on the next mouse move anywhere
        // on the page.
        windowOn.get("pointermove").size === 0
      );
    })(),
    `${windowOn.get("pointermove") ? windowOn.get("pointermove").size : "no"} listeners left behind`,
  ],
  [
    "the readout hangs from whichever end of the clock it is near, and is centred between them",
    (() => {
      const chart = chartNamed(poweredNodes, "Credits");
      const seen = [];
      // Left of the plot, the middle, and the far right — the crosshair's own
      // arithmetic, so the shares are of the box and not of the fake's rect.
      for (const clientX of [45, 320, 620]) {
        hover(chart, clientX);
        seen.push(readoutOf(chart).style.transform);
      }
      leave(chart);
      return seen.join(" ") === "none translateX(-50%) translateX(-100%)";
    })(),
    (() => {
      const chart = chartNamed(poweredNodes, "Credits");
      const seen = [45, 320, 620].map((x) => {
        hover(chart, x);
        return readoutOf(chart).style.transform;
      });
      leave(chart);
      return seen.join(" / ");
    })(),
  ],
  [
    "the move is remembered, and a report drawn again comes back in that order",
    (() => {
      const saved = JSON.parse(localStorage.getItem("cdc.replay.chartorder") || "null");
      const again = fakeNode("div");
      again.append(replays.render(poweredReport, { losses: true }));
      return Array.isArray(saved) && saved[1] === "Credits" && chartOrderNow(again)[1] === "Credits";
    })(),
    `stored ${(JSON.parse(localStorage.getItem("cdc.replay.chartorder") || "[]") || []).slice(0, 3).join(" / ")}`,
  ],
  [
    "a side of two players is three factories and the better of their two speeds",
    teamed.counts.length === 1 &&
      teamed.counts[0].points[0][1] === 3 &&
      teamed.tempo.length === 1 &&
      teamed.tempo[0].points[0][1] === 1.25,
    `${teamed.counts.length ? teamed.counts[0].points[0][1] : "-"} factories, ${
      teamed.tempo.length ? teamed.tempo[0].points[0][1] : "-"
    }x`,
  ],
];
for (const [name, ok, detail] of powered) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- spies ------------------------------------------------------------------

/**
 * Two infiltrations written into a copy of the harvest, one each way, because
 * the interesting half of this row is that it is drawn on both sides at once:
 * the spy leaves one column and arrives in the other at the same second, and
 * that pairing is the reading.
 *
 * The effects and the balance left behind are what a re-run records off the
 * building's own rules at the moment it happens — `AgentTrait#infiltrate`
 * branches on `rules.radar`, `rules.power`, a superweapon trait and
 * `rules.storage`, and on nothing else.
 */
const SPIED = JSON.parse(JSON.stringify(harvest));
SPIED.infiltrations = [
  // Player_A's spy into P_B's refinery: money moves, and the engine had already
  // taken it by the time the event fired, so 1500 is what P_B was left holding
  // at a half share — about 1500 taken.
  { tick: 4800, name: "NAREFN", owner: "P_B", spy: "SPY", by: "Player_A", effects: ["money"], left: 1500, share: 0.5 },
  // P_B's spy into Player_A's power plant: the base blacks out, and nothing at
  // all moves in the credit lines that a chart could show.
  { tick: 7800, name: "NAPOWR", owner: "Player_A", spy: "SPY", by: "P_B", effects: ["blackout"], left: null, share: null },
];
const spiedReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(spiedReport, SPIED);
const spiedEl = fakeNode("div");
if (replays) spiedEl.append(replays.render(spiedReport, { losses: true }));
const spiedNodes = replays ? flat(spiedEl) : [];
const spyCells = spiedNodes.filter((node) => /\b(spied|infiltrated)\b/.test(node.className || ""));
const spyHead = spiedNodes
  .filter((node) => (node.className || "") === "replayfact")
  .map((node) => node.textContent)
  .join(" | ");
const merged = spiedReport.sim.spyRows || [];

const spies = [
  [
    "an infiltration reaches the report from the harvest, both of them",
    merged.length === 2,
    String(merged.length),
  ],
  [
    "the theft is worked back from the balance the victim was left holding",
    merged[0] && merged[0].stole === 1500 && merged[1] && merged[1].stole === null,
    merged.length ? `${merged[0].stole} and ${merged[1].stole}` : "",
  ],
  [
    "each one is drawn twice — once on the side that sent it, once on the side it happened to",
    spyCells.length === 4 &&
      spyCells.filter((c) => /\bspied\b/.test(c.className)).length === 2 &&
      spyCells.filter((c) => /\binfiltrated\b/.test(c.className)).length === 2,
    spyCells.map((c) => c.className).join(" | "),
  ],
  [
    "and the two halves land on opposite sides of the clock",
    spyCells.filter((c) => /\bspied\b/.test(c.className)).some((c) => /\bs1\b/.test(c.className)) &&
      spyCells.filter((c) => /\bspied\b/.test(c.className)).some((c) => /\bs2\b/.test(c.className)),
    spyCells.filter((c) => /\bspied\b/.test(c.className)).map((c) => c.className).join(" | "),
  ],
  [
    "the row says what the spy did — on the row, not in its words, which the column is sized by",
    spyCells.some((c) => /about 1500 credits taken/.test(c.title || "")) &&
      spyCells.some((c) => /the base blacks out/.test(c.title || "")) &&
      spyCells.every((c) => !/credits taken|blacks out/.test(flat(c).map((k) => k.textContent).join(" "))),
    spyCells.map((c) => c.title).join(" | "),
  ],
  [
    "the header counts them per side that sent one, and names what was got into",
    /Player_A: 1 spy in — Soviet Ore Refinery, about 1500 credits taken/.test(spyHead) &&
      /P_B: 1 spy in — Tesla Reactor/.test(spyHead),
    spyHead,
  ],
  [
    "a match with no spies says nothing about spies rather than saying none",
    !/spy in|spies in/.test(
      poweredNodes
        .filter((node) => (node.className || "") === "replayfact")
        .map((node) => node.textContent)
        .join(" | ")
    ),
    "",
  ],
];
for (const [name, ok, detail] of spies) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- pointing a re-run at a file ---------------------------------------------

/**
 * `askForSim`, driven with the panel stubbed out around it.
 *
 * What is being asked is the pair of decisions it makes and nothing else: which
 * URL the game tab is opened at, and whether the file rides along. Both are
 * invisible from outside — one goes into storage and the other into a message to
 * the service worker — so both are captured here.
 */
const askBody = /\r?\n {2}function askForSim\(\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/.exec(js);
const askWith = (state) => {
  if (!askBody) return null;
  const stored = [];
  const sent = [];
  const run = new Function(
    "REPLAY",
    "replayOpen",
    "replayUrl",
    "replayFileText",
    "replayRealmEl",
    "replayPaceEl",
    "replayShowEl",
    "chrome",
    "replayNote",
    "syncSimButton",
    "longMatch",
    "simProgressing",
    "setTimeout",
    "SIM_NUDGE_MS",
    `return function askForSim() {${askBody[1]}\n};`
  )(
    globalThis.__cdcReplay,
    state.open,
    state.url,
    state.text,
    { value: "am-eu" },
    { value: "" },
    { checked: false },
    {
      storage: { local: { set: (patch) => stored.push(patch) } },
      runtime: { sendMessage: (message, answer) => (sent.push(message), answer({ ok: true, tabId: 1 })), lastError: null },
    },
    () => {},
    () => {},
    () => false,
    () => true,
    () => {},
    1
  );
  run();
  return { stored, sent };
};

const ID2 = "5a41749b-26f9-4303-a69c-5938bb8b219c";
const HOST = globalThis.__cdcReplay.REPLAY_HOSTS["am-eu"];
const served2 = askWith({ open: ID2, url: `${HOST}/${ID2}.rpl`, text: "RA2TSREPL_v6\nstuff" });
const local = askWith({ open: ID2, url: "", text: "RA2TSREPL_v6\nstuff" });
const neither = askWith({ open: ID2, url: "", text: "" });

const jobOf = (asked) => (asked && asked.stored[0] && asked.stored[0].sim) || null;
const tabOf = (asked) => (asked && asked.sent[0] && asked.sent[0].url) || "";

const local2 = [
  [
    "a match the hosts serve is fetched by the client, as it always has been",
    !!jobOf(served2) && jobOf(served2).text === null && jobOf(served2).url === `${HOST}/${ID2}.rpl`,
    jobOf(served2) ? `text ${jobOf(served2).text}, url ${jobOf(served2).url}` : "no job",
  ],
  [
    "a file no host serves is pointed at the URL the match would have had",
    !!jobOf(local) && jobOf(local).url === `${HOST}/${ID2}.rpl` && tabOf(local).endsWith(encodeURIComponent(`${HOST}/${ID2}.rpl`)),
    tabOf(local),
  ],
  [
    "and the file rides with the job, because nothing will answer that URL",
    !!jobOf(local) && jobOf(local).text === "RA2TSREPL_v6\nstuff",
    jobOf(local) ? String(jobOf(local).text).slice(0, 20) : "",
  ],
  [
    "a report with neither asks for nothing at all",
    !!neither && neither.stored.length === 0 && neither.sent.length === 0,
    neither ? `${neither.stored.length} stored, ${neither.sent.length} sent` : "no askForSim in options.js",
  ],
  [
    "the re-run is offered for a URL or for a file, and for an exported report neither",
    /replaySimEl\.disabled = !replayOpen \|\| \(!replayUrl && !replayFileText\)/.test(js),
  ],
  [
    "an exported report keeps no file to hand over — the client plays replays, not reports",
    /replayFileText = text\.trimStart\(\)\.startsWith\("\{"\) \? "" : text;/.test(js),
  ],
];
for (const [name, ok, detail] of local2) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- the legend, once the charts had ten lines -------------------------------

/**
 * The build-speed harvest again, this time with the Defence tab in it.
 *
 * `POWERED` above predates the factory table and names five queues; a real
 * harvest names six, because the client's `QueueType` has an `Armory` — the
 * Defence tab — and reports `BuildingType` as its factory, which is the same
 * factory `Structures` reads. Written in here so the collapse has something to
 * collapse.
 */
const WITH_ARMORY = JSON.parse(JSON.stringify(POWERED));
for (const row of WITH_ARMORY.samples) {
  for (const player of row.players) {
    player.tempo.factories = {
      Structures: player.tempo.factories.Structures,
      Armory: player.tempo.factories.Structures,
      Infantry: player.tempo.factories.Infantry,
      Vehicles: player.tempo.factories.Vehicles,
      Aircraft: 0,
      Ships: 0,
    };
    player.tempo.factoryOf = {
      Structures: "10",
      Armory: "10",
      Infantry: "12",
      Vehicles: "13",
      Aircraft: "14",
      Ships: "15",
    };
  }
}
const armoryReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(armoryReport, WITH_ARMORY);
const armoryEl = fakeNode("div");
if (replays) armoryEl.append(replays.render(armoryReport, { losses: true }));
const armoryNodes = replays ? flat(armoryEl) : [];
const armoryChart = chartNamed(armoryNodes, "Build speed");
const armoryKeys = classed(armoryChart, "replaykey").map((key) =>
  flat(key)
    .map((k) => k.textContent)
    .join("")
);

// The Power chart, which repeats a side's name twice rather than five times and
// is grouped for the same reason.
const powerRows = classed(powerChart, "replayseries");
const powerNames = classed(powerChart, "replaysidename").map((n) => n.textContent);
// A key's words live in a text node under it, not on it, so a key is read by
// joining its descendants — the same way `armoryKeys` above is.
const wordsIn = (node) => flat(node).map((k) => k.textContent).join("");
const powerKeyText = classed(powerChart, "replayseries")
  .flatMap((row) => row.kids.filter((kid) => kid !== row.kids[0]))
  .map(wordsIn);
// What the harvest handed over, so the collapse below is asserted against a
// queue that was really there rather than one that never arrived.
const armoryIn = Object.keys(armoryReport.sim.samples[0].players.Player_A.tempo.rate || {});

const legend = [
  [
    "a queue that reads the same factory as an earlier one draws no second line",
    armoryIn.includes("Armory") && armoryKeys.length === 10 && !armoryKeys.some((text) => /armory/.test(text)),
    `harvest had ${armoryIn.join("/")}, chart drew ${armoryKeys.join(", ")}`,
  ],
  [
    "and it is the Defence tab that goes, not the Structures tab it duplicates",
    armoryKeys.filter((text) => /structures/.test(text)).length === 2,
    armoryKeys.join(", "),
  ],
  [
    "a harvest with no factory table keeps every queue — one line too many is not a wrong one",
    classed(tempoChart, "replaykey").length === 10,
    String(classed(tempoChart, "replaykey").length),
  ],
  [
    "the side's name is written once per row, not once per key",
    classed(armoryChart, "replayseries").length === 2 &&
      classed(armoryChart, "replaysidename").map((n) => n.textContent).join(",") === "Player_A,P_B",
    classed(armoryChart, "replaysidename").map((n) => n.textContent).join(", "),
  ],
  [
    "so a key says only what varies",
    armoryKeys.every((text) => !/Player_A|P_B/.test(text)),
    armoryKeys.join(", "),
  ],
  [
    "and every key is a piece of the line itself, in that line's own classes",
    classed(armoryChart, "replayswatch").length === 10 &&
      classed(armoryChart, "replayswatch").every((s) => flat(s).some((k) => k.tag === "line" && /replayline/.test(k.className || ""))),
    String(classed(armoryChart, "replayswatch").length),
  ],
  [
    "no round dot is left in a chart legend — a dot cannot show a dash",
    classed(armoryChart, "replaydot").length === 0 && classed(powerChart, "replaydot").length === 0,
    `${classed(armoryChart, "replaydot").length} + ${classed(powerChart, "replaydot").length}`,
  ],
  [
    "the power chart groups too, because it repeats a name as well",
    powerRows.length === 2 && powerNames.join(",") === "Player_A,P_B",
    powerNames.join(", "),
  ],
  [
    "and its keys are produced and used, said once per side",
    powerKeyText.filter((t) => t === "produced").length === 2 && powerKeyText.filter((t) => t === "used").length === 2,
    powerKeyText.join(", "),
  ],
  [
    "a chart with one line per side is not grouped — there is nothing to say twice",
    classed(chartNamed(poweredNodes, "Credits"), "replayseries").length === 0,
    String(classed(chartNamed(poweredNodes, "Credits"), "replayseries").length),
  ],
  [
    "an end-of-line label on a grouped chart drops the side, which the legend already said",
    classed(powerChart, "replaytick").some((t) => t.textContent === "produced") &&
      !classed(powerChart, "replaytick").some((t) => /Player_A produced/.test(t.textContent || "")),
    classed(powerChart, "replaytick").map((t) => t.textContent).filter(Boolean).join(" | "),
  ],
];
for (const [name, ok, detail] of legend) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- a harvest taken before the factory was recorded -------------------------

/**
 * The state every stored run was in until 2026-08-31: the counts, no factory
 * table, and the client's own spelling of the aircraft queue.
 *
 * This is the case the first version of the collapse did not cover — it read
 * the factory off the harvest, so a harvest without one kept every queue and
 * went on drawing the Defence tab as a second copy of the Structures line. A
 * re-run would have fixed it and nobody should have to re-run a match to stop
 * seeing one line twice.
 */
const OLD_HARVEST = JSON.parse(JSON.stringify(POWERED));
for (const row of OLD_HARVEST.samples) {
  for (const player of row.players) {
    player.tempo = {
      speed: player.tempo.speed,
      factories: {
        Structures: 1,
        Armory: 1,
        Infantry: 1,
        Vehicles: player.tempo.factories.Vehicles,
        // As the client spells it, which is not how the replay file's own type
        // list spells it.
        Aircrafts: 1,
        Ships: 0,
      },
    };
  }
}
const oldReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(oldReport, OLD_HARVEST);
const oldEl = fakeNode("div");
if (replays) oldEl.append(replays.render(oldReport, { losses: true }));
const oldChart = chartNamed(replays ? flat(oldEl) : [], "Build speed");
const oldKeys = classed(oldChart, "replaykey").map(wordsIn);
const oldRate = oldReport.sim.samples[0].players.Player_A.tempo;

// The harvest's own answer has to keep winning where it has one: a client that
// moved a queue to a factory of its own must not be overruled by this file's
// copy of the mapping.
const MOVED = JSON.parse(JSON.stringify(OLD_HARVEST));
for (const row of MOVED.samples) {
  for (const player of row.players) {
    player.tempo.factoryOf = { Structures: "10", Armory: "99", Infantry: "12", Vehicles: "13", Aircrafts: "14", Ships: "15" };
  }
}
const movedReport = globalThis.__cdcReplay.analyze(globalThis.__cdcReplay.parse(fixture));
globalThis.__cdcReplay.mergeSim(movedReport, MOVED);
const movedEl = fakeNode("div");
if (replays) movedEl.append(replays.render(movedReport, { losses: true }));
const movedKeys = classed(chartNamed(replays ? flat(movedEl) : [], "Build speed"), "replaykey").map(wordsIn);

const stored = [
  [
    "a harvest taken before the factory was recorded still collapses the Defence tab",
    oldKeys.length === 10 && !oldKeys.some((text) => /armory/.test(text)),
    oldKeys.join(", "),
  ],
  [
    "and it does so without a re-run — the mapping is filled in on the way through",
    !!oldRate.factoryOf && oldRate.factoryOf.Structures === oldRate.factoryOf.Armory,
    JSON.stringify(oldRate.factoryOf),
  ],
  [
    "the client's own spelling of the aircraft queue is normalised, not carried through",
    Object.keys(oldRate.rate || {}).includes("Aircraft") && !Object.keys(oldRate.rate || {}).includes("Aircrafts"),
    Object.keys(oldRate.rate || {}).join(", "),
  ],
  [
    "so it sorts where it belongs rather than at the end as a queue nobody knows",
    oldKeys.slice(0, 4).join(",") === "structures,infantry,vehicles,aircraft",
    oldKeys.join(", "),
  ],
  [
    "a client that gave the Defence tab a factory of its own keeps both lines",
    movedKeys.length === 12 && movedKeys.some((text) => /armory/.test(text)),
    movedKeys.join(", "),
  ],
];
for (const [name, ok, detail] of stored) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);


// --- the stylesheets parse ---------------------------------------------------

// A comment that loses its opener takes the rule under it with it: the browser
// reads the orphaned text as the start of a selector, cannot parse it, and drops
// the whole rule — silently, with nothing in the console and no visible error,
// just a block of the page that is suddenly unstyled.
//
// Not hypothetical. The 0.78.0 split of options.css cut one comment through the
// middle: its first two lines stayed in options.css with no `*/`, its last three
// went to options-align.css with no `/*`, and `.alignstage` — the panel's
// clipping frame, `position: relative` and all — stopped applying. The layers
// inside it then positioned against the page instead and covered the tab strip.
//
// Counting `/*` against `*/` is not enough (`*/ … /*` balances too), so this
// walks each file.
const sheets = readdirSync(src)
  .filter((name) => name.endsWith(".css"))
  .map((file) => {
    const text = readFileSync(join(src, file), "utf8");
    let open = -1;
    let stray = -1;
    let nested = -1;
    for (let i = 0; i < text.length - 1; ) {
      const two = text.slice(i, i + 2);
      if (open < 0 && two === "/*") {
        open = i;
        i += 2;
      } else if (open < 0 && two === "*/") {
        stray = i;
        break;
      } else if (open >= 0 && two === "*/") {
        open = -1;
        i += 2;
      } else {
        // CSS comments do not nest, so a `/*` inside one means the comment above
        // lost its `*/` and is eating this one whole. The other half of the same
        // cut — and it balances, so counting would call the file fine.
        if (open >= 0 && two === "/*" && nested < 0) nested = i;
        i++;
      }
    }
    const line = (index) => text.slice(0, index).split("\n").length;
    return [
      `${file}: every comment is opened and closed`,
      open < 0 && stray < 0 && nested < 0,
      stray >= 0
        ? `a */ with nothing opening it, line ${line(stray)}`
        : open >= 0
          ? `a /* that is never closed, line ${line(open)}`
          : nested >= 0
            ? `a /* inside a comment, line ${line(nested)} — the one above it never closed`
            : "",
    ];
  });
for (const [name, ok, detail] of sheets) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

if (
  missing.length ||
  sheets.some(([, ok]) => !ok) ||
  said.some(([, ok]) => !ok) ||
  rows.some(([, ok]) => !ok) ||
  recents.some(([, ok]) => !ok) ||
  drawn.some(([, ok]) => !ok) ||
  types.some(([, ok]) => !ok) ||
  disk.some(([, ok]) => !ok) ||
  powered.some(([, ok]) => !ok) ||
  spies.some(([, ok]) => !ok) ||
  local2.some(([, ok]) => !ok) ||
  legend.some(([, ok]) => !ok) ||
  stored.some(([, ok]) => !ok)
) {
  process.exit(1);
}
