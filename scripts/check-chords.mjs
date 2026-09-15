/**
 * The shipped chord layouts name real objects, in real slots, once each.
 *
 *   node scripts/check-chords.mjs
 *
 * A chord layout is a table of object ids written by hand — the one part of this
 * feature nothing else validates, because a wrong id does not throw: the grid
 * draws a tile with no picture and the key quietly does nothing in a match,
 * which looks exactly like a prerequisite that is not up yet. So the ids are
 * checked against the two committed tables that know what an object is, and the
 * geometry is checked against the key block it claims to mirror.
 *
 * What it cannot check is whether a side can actually build what its layout
 * offers: ownership is prerequisites, not the `Owner=` list, and the answer
 * lives in a running match. That is what the dimmed tile in the grid is for.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
// The object table and the cameo index are test data, not shipped files: the
// extension harvests both from the running client now, so scripts/fixtures/ is
// where these ids are checked against a real roster rather than a made-up one.
const fixtures = join(here, "fixtures");

const window = {};
new Function("window", readFileSync(join(src, "build-chords.js"), "utf8"))(window);
new Function("window", readFileSync(join(fixtures, "cameo-ids.js"), "utf8"))(window);
new Function("window", readFileSync(join(fixtures, "replay-types.js"), "utf8"))(window);

const tables = window.__cdcBuildChords;
const cameos = window.__cdcCameos;
const types = window.__cdcReplayTypes;

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

if (!tables || !cameos || !types) {
  console.error("one of the three source tables did not load — this checker is out of date");
  process.exit(1);
}

const {
  SECTIONS,
  GRID_KEYS,
  GRID_COLS,
  DEFAULT_CHORDS,
  VARIANTS,
  chordLayout,
  chordLayoutIsLegacy,
  chordOverride,
  chordKeyLabel,
  chordSlotIds,
  chordSlotKey,
  chordIsDeck,
  chordPlace,
  chordAction,
  chordPressRoute,
  menuKeyAction,
  RESERVED_CODES,
  chordQueueAction,
  chordSlotAction,
  chordKeyLockPlan,
  chordIsSuperWeapon,
  chordSuperWeaponName,
  chordSuperWeaponRow,
  SUPERWEAPONS,
  chordCancelQueue,
  chordCancelAction,
  CANCEL_MANY,
  chordGridRows,
  chordSlotShown,
  chordPlacement,
  chordResolve,
  chordBadges,
  chordBadgeWeapons,
  chordScreenBox,
} = tables;

// The key block is the whole premise: three rows of five, in the order the
// fingers find them. A grid that is not 5×3 is not the block the request named.
check(
  "the key block is the keyboard's own three rows",
  GRID_KEYS.length === 15 && GRID_COLS === 5,
  `${GRID_KEYS.length} keys in ${GRID_COLS} columns`
);
check(
  "and it is qwert/asdfg/zxcvb in that order",
  GRID_KEYS.map((k) => chordKeyLabel(GRID_KEYS.indexOf(k))).join("") === "QWERTASDFGZXCVB",
  GRID_KEYS.map((_, i) => chordKeyLabel(i)).join("")
);

const sides = Object.keys(DEFAULT_CHORDS);
check("both sides ship a layout", sides.length === 2, sides.join(", "));

/**
 * An object's row in the generated rules table, with the list it came from.
 *
 * `kind` is the rules list — building, infantry, vehicle, aircraft — and
 * `extra.cat === "combat"` is `BuildCat=Combat`, which is the whole of what
 * decides a building's sidebar tab.
 */
function objectRow(name) {
  for (const [kind, list] of Object.entries(types)) {
    if (!Array.isArray(list)) continue;
    const row = list.find((entry) => Array.isArray(entry) && entry[0] === name);
    if (row) return { kind, label: row[1], extra: row[3] || {} };
  }
  return null;
}

/**
 * Which section an object belongs in, by the client's own rule.
 *
 * `Production#getQueueTypeForObject`: a Building goes to Armory — the Defence
 * tab — when `BuildCat=Combat` and to Structures otherwise; Infantry goes to
 * Infantry; Vehicles and Aircraft both live under the Units tab. This is the
 * check 0.54.0 did not have, and it shipped four Allied and three Soviet
 * buildings on the wrong grid because of it: a superweapon on a structures key
 * does not throw, it just queues into a tab you were not looking at.
 */
function sectionFor(row) {
  if (row.kind === "building") return row.extra.cat === "combat" ? "defense" : "structures";
  if (row.kind === "infantry") return "infantry";
  return "units";
}

const missing = [];
const unpictured = [];
const overlong = [];
const duplicated = [];
const misfiled = [];
const wrongSide = [];
let slots = 0;

for (const side of sides) {
  for (const section of SECTIONS) {
    const raw = (DEFAULT_CHORDS[side] || {})[section.id];
    if (!Array.isArray(raw)) {
      overlong.push(`${side}/${section.id} has no layout at all`);
      continue;
    }
    if (raw.length > GRID_KEYS.length) {
      overlong.push(`${side}/${section.id} is ${raw.length} long, past ${chordKeyLabel(GRID_KEYS.length - 1)}`);
    }
    const seen = new Set();
    for (const [slot, value] of chordLayout({}, side, section.id).entries()) {
      const ids = chordSlotIds(value);
      if (!ids.length) continue;
      slots++;
      const where = `${side}/${section.id}/${chordKeyLabel(slot)}`;
      for (const name of ids) {
        // A superweapon slot is not an object: no rules row, no BuildCat, no
        // side. What it must have is a table entry — otherwise nothing can
        // resolve it in a match — and a picture, since the grid draws one.
        if (chordIsSuperWeapon(name)) {
          if (!chordSuperWeaponRow(name)) missing.push(`${where} ${name} (no SUPERWEAPONS row)`);
          else if (cameos.index[name] === undefined) unpictured.push(`${where} ${name}`);
          if (seen.has(name)) duplicated.push(`${where} ${name}`);
          seen.add(name);
          continue;
        }
        const row = objectRow(name);
        if (!row) {
          missing.push(`${where} ${name}`);
          continue;
        }
        if (cameos.index[name] === undefined) unpictured.push(`${where} ${name}`);
        const belongs = sectionFor(row);
        if (belongs !== section.id) misfiled.push(`${where} ${name} (${row.label}) belongs in ${belongs}`);
        // `extra.side` is resolved in the generator through the prerequisite
        // chain to one of the two construction yards, because `Owner=` lists
        // both sides for almost everything. The Ore Purifier sat on the Soviet
        // grid for exactly that reason: it needs GATECH and GACNST, which a
        // Soviet player never has.
        if (row.extra.side && row.extra.side !== side) {
          wrongSide.push(`${where} ${name} (${row.label}) is ${row.extra.side} only`);
        }
        if (seen.has(name)) duplicated.push(`${where} ${name}`);
        seen.add(name);
      }
    }
  }
}

check("every slot names an object the rules table knows", missing.length === 0, missing.join(", "));
check("every slot has a cameo to draw", unpictured.length === 0, unpictured.join(", "));
check("no layout runs past its last key", overlong.length === 0, overlong.join(", "));
check(
  "and no object is on two keys in one section",
  duplicated.length === 0,
  duplicated.length ? duplicated.join(", ") : `${slots} slots filled`
);
check(
  "every object is on the grid the game puts it on",
  misfiled.length === 0,
  misfiled.length ? misfiled.join("; ") : "BuildCat=Combat is the Defence tab, and every slot agrees"
);
check(
  "and on a side that can actually build it",
  wrongSide.length === 0,
  wrongSide.length
    ? wrongSide.join("; ")
    : "resolved through the prerequisite chain, not Owner=, which says both sides for almost everything"
);

// --- what is left of the mirror: the sea, and the country key ----------------
//
// The layouts are the player's own grids, one side at a time, and neither tech
// order nor the mirror survived contact with a hand that plays them: the two
// units grids now swap `t` and `d` against each other, and the Allied infantry
// grid is sorted by its own logic. What the two sides still share is checked
// here, and it is only what is mechanical — where the sea sits, and which key
// is your country's. The rest of the mirror was a judgement about what two
// objects are *for*, and a judgement the player has overruled is not an
// assertion.
//
// A **country unit** is one with `RequiredHouses` (the German Tank Destroyer,
// the Iraqi Desolator). A deck marked `universal` is not one — it is one object
// under two names, which everyone gets.
const isCountryUnit = (value) => {
  const ids = chordSlotIds(value);
  const variant = ids.length > 1 ? VARIANTS.find((v) => v.ids.join("+") === ids.join("+")) : null;
  if (variant) return !variant.universal;
  return ids.some((id) => (objectRow(id)?.extra.only || []).length > 0);
};

// `Naval=yes` is not in the generated rules table — nothing else needs it — so
// the ten ships are named here. That is a statement about what a Dreadnought
// *is*, not about which key it sits on, which is what keeps this a check rather
// than a second copy of the layout.
const NAVY = {
  Soviet: ["SUB", "HYD", "SAPC", "SQD", "DRED"],
  Allied: ["DEST", "AEGIS", "LCRF", "DLPH", "CARRIER"],
};
const SEA_FROM = GRID_KEYS.length - GRID_COLS;

const seaStrays = [];
for (const side of sides) {
  const fleet = NAVY[side] || [];
  const rows = chordLayout({}, side, "units");
  for (const [slot, value] of rows.entries()) {
    for (const id of chordSlotIds(value)) {
      const floats = fleet.includes(id);
      const bottom = slot >= SEA_FROM;
      if (floats && !bottom) seaStrays.push(`${side}/units/${chordKeyLabel(slot)} ${id} floats but is not on the bottom row`);
      if (bottom && !floats) seaStrays.push(`${side}/units/${chordKeyLabel(slot)} ${id} is on the bottom row but does not float`);
    }
  }
  for (const id of fleet) {
    if (!rows.some((value) => chordSlotIds(value).includes(id))) {
      seaStrays.push(`${side}/units has no key for ${id}`);
    }
  }
}
check(
  "the bottom row of the units grid is the sea, and only the sea",
  seaStrays.length === 0,
  seaStrays.length
    ? seaStrays.join("; ")
    : `five ships a side on ${Array.from({ length: GRID_COLS }, (_, i) => chordKeyLabel(SEA_FROM + i)).join("")}`
);

// The country slot ends its group rather than sitting on `b`, and it is the
// *same* key on both sides — one key to learn per section rather than one per
// grid. A section where only one side has a country unit has nothing to mirror:
// the French Grand Cannon is a turret and sits with the turrets.
const countryDrift = [];
const countryKeys = (side, sectionId) =>
  chordLayout({}, side, sectionId)
    .map((value, slot) => (isCountryUnit(value) ? slot : -1))
    .filter((slot) => slot >= 0);
for (const section of SECTIONS) {
  const [left, right] = sides;
  const here = countryKeys(left, section.id);
  const there = countryKeys(right, section.id);
  if (!here.length || !there.length) continue;
  if (here.join(",") !== there.join(",")) {
    countryDrift.push(
      `${section.id}: ${left} on ${here.map((slot) => chordKeyLabel(slot)).join("")}, ` +
        `${right} on ${there.map((slot) => chordKeyLabel(slot)).join("")}`
    );
  }
}
check(
  "a country unit is on the same key on both sides",
  countryDrift.length === 0,
  countryDrift.length
    ? countryDrift.join("; ")
    : SECTIONS.map((section) => {
        const both = sides.map((side) => countryKeys(side, section.id));
        if (both.some((slots) => !slots.length)) return null;
        return `${section.id} ${both[0].map((slot) => chordKeyLabel(slot)).join("")}`;
      })
        .filter(Boolean)
        .join(", ")
);

// A country pair is one thing under two names, so its members have to be the
// same *kind* of thing — a pair spanning two sections would be a slot that
// changes which queue it feeds depending on who you play.
//
// A superweapon in a pair is exempt from the section half of that and only that:
// it feeds no queue, so it cannot disagree with one about which tab it is on.
// It still has to be a superweapon this file knows, which is the same demand
// made of the object halves.
const brokenPairs = VARIANTS.filter((variant) => {
  const ids = variant.ids.filter((id) => !chordIsSuperWeapon(id));
  if (variant.ids.some((id) => chordIsSuperWeapon(id) && !chordSuperWeaponRow(id))) return true;
  const rows = ids.map(objectRow);
  if (rows.some((row) => !row)) return true;
  return rows.length > 1 && new Set(rows.map(sectionFor)).size !== 1;
});
check(
  "every country pair is one kind of thing",
  brokenPairs.length === 0,
  brokenPairs.length
    ? brokenPairs.map((v) => v.ids.join("/")).join(", ")
    : VARIANTS.map((v) => `${v.ids.join("/")} → ${v.label || "the object's own name"}`).join(", ")
);

// Which pairs the options page draws as a choice. A `universal` pair is one
// object under two names — the airfield, the plane — and showing it as a choice
// asks the player to know about a mechanism that exists so they need not: there
// is no country for which the key is anything other than that object. A country
// pair is the opposite, and hiding it would leave a Cuban looking at a picture
// of a Desolator they cannot build.
const deckDrift = VARIANTS.filter((variant) => chordIsDeck(variant.ids) === !!variant.universal);
check(
  "a pair is shown as a choice only when it is one",
  deckDrift.length === 0,
  deckDrift.length
    ? deckDrift.map((v) => v.ids.join("/")).join(", ")
    : VARIANTS.map((v) => `${v.ids.join("/")} ${chordIsDeck(v.ids) ? "deck" : "one object"}`).join(", ")
);
check(
  "a lone id is never a deck, whatever else it is",
  !chordIsDeck("TERROR") && !chordIsDeck(["DESO"]) && !chordIsDeck(null),
  "one id is one picture"
);

// The three the request fixed by name. They are the first three keys of the
// structures grid on both sides, and they are the reason the grid opens on `q`.
const OPENING = [
  ["Allied", ["GAPOWR", "GAPILE", "GAREFN"]],
  ["Soviet", ["NAPOWR", "NAHAND", "NAREFN"]],
];
for (const [side, want] of OPENING) {
  const got = chordLayout({}, side, "structures").slice(0, 3);
  check(
    `${side} qqq/qqw/qqe are power, barracks, refinery`,
    got.join() === want.join(),
    got.join(" ")
  );
}

// Every field of a section is read by companion.js, and each has a shape it has
// to hold: a command the client's KeyCommandType actually carries, a fallback in
// the `e.code` spelling the keydown listener compares against, and a queue that
// is either one of the client's six or null for a section nothing can block.
const QUEUES = ["Structures", "Armory", "Infantry", "Vehicles", "Aircrafts", "Ships"];
const malformed = SECTIONS.filter(
  (section) =>
    !/^[A-Za-z]+Tab$/.test(section.command || "") ||
    !/^(Key[A-Z]|Digit[0-9])$/.test(section.fallback || "") ||
    !(section.queue === null || QUEUES.includes(section.queue)) ||
    // …and the queues the cancel key acts on: at least one, all real, and the
    // blocking queue among them where there is one. A section whose Ctrl key
    // pointed at a queue its tab cannot fill would cancel something the player
    // was not looking at.
    !Array.isArray(section.queues) ||
    !section.queues.length ||
    section.queues.some((queue) => !QUEUES.includes(queue)) ||
    (section.queue !== null && !section.queues.includes(section.queue))
);
check(
  "every section is well formed — tab command, e.code fallback, real queue",
  malformed.length === 0,
  malformed.map((s) => s.id).join(", ")
);

// And companion.js still consumes all three, which is what makes them worth
// checking. A field nothing reads is a field that can rot unnoticed.
const companion = readFileSync(join(src, "companion.js"), "utf8");
const unread = ["command", "fallback", "queue", "queues"].filter(
  (field) => !companion.includes(`section.${field}`)
);
check(
  "and companion.js reads every field a section carries",
  unread.length === 0,
  unread.length ? `never read: ${unread.join(", ")}` : "command, fallback, queue, queues"
);

// --- putting something on a key ---------------------------------------------
//
// The one piece of editor behaviour with a right answer rather than a look:
// assigning an object that is already on another key has to *swap* the two, so
// the grid stays full and nothing is silently lost. Pure, so it is exercised
// here rather than by clicking through the options page.

const ROW = ["A", "B", "C", null, null];
const PAIR = ["GAAIRC", "AMRADR"];
const cases = [
  ["onto an empty key, from nowhere", chordPlace(ROW, 3, "D"), ["A", "B", "C", "D", null]],
  ["onto an empty key, from another", chordPlace(ROW, 3, "A"), [null, "B", "C", "A", null]],
  ["onto an occupied key, the two swap", chordPlace(ROW, 0, "C"), ["C", "B", "A", null, null]],
  ["onto itself, nothing moves", chordPlace(ROW, 1, "B"), ["A", "B", "C", null, null]],
  ["clearing a key leaves the rest alone", chordPlace(ROW, 1, null), ["A", null, "C", null, null]],
  ["a country pair moves as one thing", chordPlace([PAIR, "B", null], 2, PAIR), [null, "B", PAIR]],
];
for (const [name, got, want] of cases) {
  check(`place — ${name}`, JSON.stringify(got) === JSON.stringify(want), JSON.stringify(got));
}

// Never mutated in place: the editor rebuilds a side out of these rows, and the
// rows it starts from are the shipped defaults themselves.
check(
  "and the row it was handed is untouched",
  JSON.stringify(ROW) === JSON.stringify(["A", "B", "C", null, null]),
  JSON.stringify(ROW)
);

// --- which of a slot's ids is yours ------------------------------------------
//
// Wrong twice: once showing the Airforce Command no American can build (the
// fallback ignored country, because the lists it asked cannot answer it), once
// showing a German Tank Destroyer on a Korean grid (nothing fitting the country
// still resolved to something). Both are rows of a small decision table, so the
// table is exercised rather than described.

const HOUSES = {
  GAAIRC: { forbiddenHouses: ["Americans"] },
  AMRADR: { requiredHouses: ["Americans"] },
  ORCA: { forbiddenHouses: ["Alliance"] },
  BEAG: { requiredHouses: ["Alliance"] },
  TNKD: { requiredHouses: ["Germans"] },
  MTNK: {},
};
const lookup = (buildable) => (id) => ({ available: buildable.includes(id), object: HOUSES[id] });
const nothingBuiltYet = lookup([]);
const RESOLVE_CASES = [
  ["America gets the American airfield", ["GAAIRC", "AMRADR"], "Americans", nothingBuiltYet, "AMRADR"],
  ["Britain gets the ordinary one", ["GAAIRC", "AMRADR"], "British", nothingBuiltYet, "GAAIRC"],
  ["Korea gets the Black Eagle", ["ORCA", "BEAG"], "Alliance", nothingBuiltYet, "BEAG"],
  ["France gets the Intruder", ["ORCA", "BEAG"], "French", nothingBuiltYet, "ORCA"],
  ["Germany gets the Tank Destroyer", ["TNKD"], "Germans", nothingBuiltYet, "TNKD"],
  ["Korea gets an empty key, not a dimmed one", ["TNKD"], "Alliance", nothingBuiltYet, ""],
  ["outside a match, the first id stands in", ["GAAIRC", "AMRADR"], "", nothingBuiltYet, "GAAIRC"],
  ["what can be built now wins over what cannot", ["GAAIRC", "AMRADR"], "", lookup(["AMRADR"]), "AMRADR"],
  ["an empty slot resolves to nothing", [], "Americans", nothingBuiltYet, ""],
];
for (const [name, ids, country, info, want] of RESOLVE_CASES) {
  const got = chordResolve(ids, country, info);
  check(`resolve — ${name}`, got === want, JSON.stringify(got));
}

// --- a user layout is an override, not a copy --------------------------------
//
// Until 0.55.1 an edit to one key stored the whole side, which froze it against
// every later fix to the shipped layouts — and by then there had been four. The
// user's storage still held the 0.54.0 grid, so the decks, the tech order and
// the Ore Purifier correction had all been landing somewhere nothing read. What
// is stored now is only what differs from what ships.

const SIDE = "Allied";
const SECT = "units";
const shippedRow = chordLayout({}, SIDE, SECT);
check(
  "with nothing stored, a grid is what ships",
  JSON.stringify(shippedRow) === JSON.stringify(chordLayout(undefined, SIDE, SECT)),
  chordSlotIds(shippedRow[0])[0]
);
check(
  "an override moves one key and leaves the rest following the shipped layout",
  (() => {
    const row = chordLayout({ [SIDE]: { [SECT]: { 2: "AMCV" } } }, SIDE, SECT);
    return row[2] === "AMCV" && JSON.stringify(row[4]) === JSON.stringify(shippedRow[4]);
  })(),
  "slot 2 overridden, slot 4 still shipped"
);
check(
  "a key the user emptied stays empty",
  chordLayout({ [SIDE]: { [SECT]: { 0: null } } }, SIDE, SECT)[0] === null,
  "null is an override, not an absence"
);
check(
  "the old whole-section array is ignored rather than obeyed",
  (() => {
    const legacy = { [SIDE]: { [SECT]: ["ZZZ", "ZZZ", "ZZZ"] } };
    return JSON.stringify(chordLayout(legacy, SIDE, SECT)) === JSON.stringify(shippedRow) &&
      chordLayoutIsLegacy(legacy, SIDE, SECT);
  })(),
  "it is a copy of a layout that has since been corrected"
);
check(
  "an edit is stored as the difference from what ships",
  (() => {
    const moved = chordOverride({}, SIDE, SECT, 0, "MTNK");
    // A swap, so two keys differ: the one written and the one it displaced.
    const same = chordOverride({}, SIDE, SECT, 0, chordSlotIds(shippedRow[0])[0]);
    return Object.keys(moved).length === 2 && Object.keys(same).length === 0;
  })(),
  "putting a key back where it was stops overriding it"
);

// --- what a keypress means while a grid is open ------------------------------
//
// The decision table, exercised directly. Its first shipped version closed the
// grid for every key it did not recognise, and a bare `Shift` is such a key — so
// the grid shut on the way to every shifted order, and the Shift rule was
// unreachable from the grid it was written for. That row is the first case here.

const press = (over) => ({ code: "", key: "", repeat: false, ctrlKey: false, altKey: false, shiftKey: false, ...over });
const KEY_CASES = [
  [
    "a bare Shift keeps the grid open and is not swallowed",
    press({ code: "ShiftLeft", key: "Shift", shiftKey: true }),
    { act: "ignore", consume: false },
  ],
  [
    "and the shifted press that follows orders five",
    press({ code: "KeyQ", key: "Q", shiftKey: true }),
    { act: "order", consume: true, slot: 0, many: true },
  ],
  [
    "a plain slot key orders one, at the back of the queue",
    press({ code: "KeyB", key: "B" }),
    { act: "order", consume: true, slot: 14, many: false, next: false },
  ],
  ["Alt and Meta are held, not pressed", press({ code: "AltLeft", key: "Alt", altKey: true }), { act: "ignore", consume: false }],
  [
    "and so is Control, which stopped closing the grid in 0.70.0 — a Ctrl+Q arrives as this press first",
    press({ code: "ControlLeft", key: "Control", ctrlKey: true }),
    { act: "ignore", consume: false },
  ],
  [
    "Ctrl on a slot orders it next instead — the client's own AddNext, on a key",
    press({ code: "KeyQ", key: "Q", ctrlKey: true }),
    { act: "order", consume: true, slot: 0, many: false, next: true },
  ],
  [
    "and Ctrl+Shift is five of it, next",
    press({ code: "KeyQ", key: "Q", ctrlKey: true, shiftKey: true }),
    { act: "order", consume: true, slot: 0, many: true, next: true },
  ],
  ["Escape closes, and is swallowed", press({ code: "Escape", key: "Escape" }), { act: "close", consume: true }],
  [
    "a key the grid does not know closes it and goes to the game",
    press({ code: "KeyM", key: "M" }),
    { act: "close", consume: false },
  ],
  [
    "Alt on a slot cancels that slot — the tile's right click, on the key",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    { act: "cancel", consume: true, slot: 0, many: false },
  ],
  [
    "and Alt+Shift is the five of it",
    press({ code: "KeyQ", key: "Q", altKey: true, shiftKey: true }),
    { act: "cancel", consume: true, slot: 0, many: true },
  ],
  [
    "Alt on a key the grid does not have is still the game's",
    press({ code: "KeyM", key: "M", altKey: true }),
    { act: "close", consume: false },
  ],
  [
    "and Ctrl+Alt — which is what the right Alt of a non-US layout sends — is swallowed, cancelling nothing and ordering nothing",
    press({ code: "KeyQ", key: "Q", altKey: true, ctrlKey: true }),
    { act: "ignore", consume: true },
  ],
  ["a repeat is swallowed and does nothing", press({ code: "KeyQ", key: "Q", repeat: true }), { act: "hold", consume: true }],
];
for (const [name, event, want] of KEY_CASES) {
  const got = chordAction(event);
  const same = Object.entries(want).every(([k, v]) => got[k] === v);
  check(`key — ${name}`, same, JSON.stringify(got));
}

// Which of our own layers a press belongs to, before any of them looks at it.
// 0.70.0 rewrote this precedence — Ctrl stopped closing the grid and became
// "queue next", the cancel key moved to Alt and stopped outranking the grid —
// and a rewritten precedence with no table is how a layer quietly stops being
// reachable.

const routed = (over) => ({
  inMatch: true,
  gridOpen: false,
  keyLockHeld: false,
  isPrefix: false,
  menuOpen: false,
  ...over,
});
const ROUTE_CASES = [
  [
    "an open grid takes the press, cancel key and all",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    routed({ gridOpen: true, isPrefix: true }),
    "grid",
  ],
  [
    "and it takes a Ctrl press too, which is the whole of why the cancel no longer sits above it",
    press({ code: "KeyQ", key: "Q", ctrlKey: true }),
    routed({ gridOpen: true, isPrefix: true }),
    "grid",
  ],
  [
    "Alt on a tab key with no grid open cancels that tab's queue",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    routed({ isPrefix: true }),
    "cancelSection",
  ],
  [
    "Ctrl on a tab key does not — Ctrl stopped being the cancel in 0.70.0",
    press({ code: "KeyQ", key: "Q", ctrlKey: true }),
    routed({ isPrefix: true }),
    "pass",
  ],
  [
    "Ctrl+Alt is AltGr on a non-US layout and cancels nothing",
    press({ code: "KeyQ", key: "Q", altKey: true, ctrlKey: true }),
    routed({ isPrefix: true }),
    "pass",
  ],
  [
    "a repeat does not cancel again — the key is held, not pressed twice",
    press({ code: "KeyQ", key: "Q", altKey: true, repeat: true }),
    routed({ isPrefix: true }),
    "pass",
  ],
  [
    "Alt on a key that is not a tab is nobody's here",
    press({ code: "KeyZ", key: "Z", altKey: true }),
    routed({}),
    "pass",
  ],
  [
    "out of a match the cancel key is not ours either",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    routed({ inMatch: false, isPrefix: true }),
    "pass",
  ],
  [
    "a Ctrl on a code the browser keeps is left alone entirely without the lock",
    press({ code: "KeyW", key: "W", ctrlKey: true }),
    routed({ gridOpen: true }),
    "none",
  ],
  [
    "and is the grid's once the lock is held",
    press({ code: "KeyW", key: "W", ctrlKey: true }),
    routed({ gridOpen: true, keyLockHeld: true }),
    "grid",
  ],
  [
    "the same code without a Ctrl was never the browser's",
    press({ code: "KeyW", key: "W" }),
    routed({ gridOpen: true }),
    "grid",
  ],
  [
    "Meta is the browser's and the OS's, and falls through to the configured hotkeys' own rules",
    press({ code: "KeyQ", key: "Q", metaKey: true, altKey: true }),
    routed({ gridOpen: true, isPrefix: true }),
    "pass",
  ],
  [
    "an open game menu outranks an open grid — it is modal, and the client's own listener is gone",
    press({ code: "KeyQ", key: "Q" }),
    routed({ menuOpen: true, gridOpen: true, isPrefix: true }),
    "menu",
  ],
  [
    "and it outranks the cancel key, which would otherwise touch a queue behind the menu",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    routed({ menuOpen: true, isPrefix: true }),
    "menu",
  ],
  [
    "but not a Ctrl+W with no lock held: the browser has already closed the tab",
    press({ code: "KeyW", key: "W", ctrlKey: true }),
    routed({ menuOpen: true }),
    "none",
  ],
];
for (const [name, event, at, want] of ROUTE_CASES) {
  const got = chordPressRoute(event, at);
  check(`route — ${name}`, got.layer === want, JSON.stringify(got));
}

check(
  "the codes the browser keeps include the grid's own second and fifth slots",
  RESERVED_CODES.includes("KeyW") && RESERVED_CODES.includes("KeyT") &&
    GRID_KEYS[1] === "KeyW" && GRID_KEYS[4] === "KeyT",
  RESERVED_CODES.join(" ")
);

// The tab key while the grid is open, which 0.61.0 gave back its meaning. A
// building finishing under an open grid kills every slot on it — the queue
// takes nothing until the structure is down — so the key that opened the grid
// places instead of ordering the slot it happens to sit on. Nothing changes
// while the queue is not ready, and nothing changes for the two unit tabs,
// whose queues are never Ready at all.

const readyQ = { prefix: "KeyQ", ready: true };
const buildingQ = { prefix: "KeyQ", ready: false };
const READY_CASES = [
  ["the tab key places while its queue is ready", press({ code: "KeyQ", key: "Q" }), readyQ, { act: "place", consume: true }],
  [
    "and orders its slot while the queue is still building",
    press({ code: "KeyQ", key: "Q" }),
    buildingQ,
    { act: "order", consume: true, slot: 0, many: false },
  ],
  [
    "another slot key is untouched by a ready queue",
    press({ code: "KeyW", key: "W" }),
    readyQ,
    { act: "order", consume: true, slot: 1, many: false },
  ],
  [
    "Shift on the tab key is still five of the slot, not a placement",
    press({ code: "KeyQ", key: "Q", shiftKey: true }),
    readyQ,
    { act: "order", consume: true, slot: 0, many: true },
  ],
  [
    "Alt on the tab key cancels its slot rather than placing — Alt is the cancel everywhere on the grid",
    press({ code: "KeyQ", key: "Q", altKey: true }),
    readyQ,
    { act: "cancel", consume: true, slot: 0, many: false },
  ],
  [
    "Ctrl on the tab key orders its slot next rather than placing — the modifier is the intent",
    press({ code: "KeyQ", key: "Q", ctrlKey: true }),
    readyQ,
    { act: "order", consume: true, slot: 0, many: false, next: true },
  ],
  ["a repeat is still swallowed", press({ code: "KeyQ", key: "Q", repeat: true }), readyQ, { act: "hold", consume: true }],
  [
    "a tab bound to a key off the grid places all the same",
    press({ code: "KeyM", key: "M" }),
    { prefix: "KeyM", ready: true },
    { act: "place", consume: true },
  ],
  [
    "and closes the grid when its queue is not ready, as any unknown key does",
    press({ code: "KeyM", key: "M" }),
    { prefix: "KeyM", ready: false },
    { act: "close", consume: false },
  ],
];
for (const [name, event, ctx, want] of READY_CASES) {
  const got = chordAction(event, ctx);
  const same = Object.entries(want).every(([k, v]) => got[k] === v);
  check(`ready — ${name}`, same, JSON.stringify(got));
}

// --- what a right click on a tile means ---------------------------------------
//
// The mirror of the cameo click, and the half the grid did not have until
// 0.58.0. It is a table because the client's own is one, and because every row
// of it needs a running match with a queue in a particular state to exercise by
// hand — which is exactly the shape of thing that ships wrong.
//
// The rows come from `CombatantUi#handleSidebarSlotClick`, button 2, read out
// of the live v0.83.3 bundle: Active + at the head → Pause; else in the queue
// and the queue is Ready/OnHold/Active → Cancel min(queued, shift ? all : 1);
// else nothing.

const at = (over) => ({ status: "active", queued: 1, isFirst: true, ...over });
const QUEUE_CASES = [
  ["the one being built pauses its queue", at(), 1, { act: "pause" }],
  ["and Shift does not make a pause five", at({ queued: 4 }), Infinity, { act: "pause" }],
  [
    "one behind the head is cancelled, not paused — pausing is the queue's, and it is not at the queue's head",
    at({ isFirst: false, queued: 3 }),
    1,
    { act: "cancel", quantity: 1 },
  ],
  ["Shift cancels every one of them", at({ isFirst: false, queued: 3 }), Infinity, { act: "cancel", quantity: 3 }],
  [
    "a second right click on a paused item cancels it — resuming is the left click's job",
    at({ status: "onhold" }),
    1,
    { act: "cancel", quantity: 1 },
  ],
  [
    "a finished structure can be cancelled, which is the one thing a left click on it cannot do",
    at({ status: "ready" }),
    1,
    { act: "cancel", quantity: 1 },
  ],
  ["nothing queued, nothing to do", at({ queued: 0, isFirst: false }), 1, { act: "none" }],
  [
    "an idle queue is never acted on, whatever it claims to hold",
    at({ status: "idle", isFirst: false }),
    1,
    { act: "none" },
  ],
  ["and neither is a tile with no queue behind it at all", null, 1, { act: "none" }],
];
for (const [name, state, want, expect] of QUEUE_CASES) {
  const got = chordQueueAction(state, want);
  const same = Object.entries(expect).every(([k, v]) => got[k] === v);
  check(`right click — ${name}`, same, JSON.stringify(got));
}

// The quantity is serialised as a uint16 and `UpdateQueueAction#serialize`
// throws above 65535, so "all of them" has to be a number and not Infinity —
// the client writes `Math.min(queued, Infinity)` for the same reason.
check(
  "right click — cancelling all of something asks for a finite quantity",
  Number.isFinite(chordQueueAction(at({ isFirst: false, queued: 30 }), true).quantity),
  JSON.stringify(chordQueueAction(at({ isFirst: false, queued: 30 }), true))
);

// --- what a key does when the slot is, or grants, a superweapon ---------------
//
// `showTimer` is the game's own line between a superweapon and a side effect,
// and the reason the Airforce Command key goes on building airfields while the
// Chronosphere key stops building Chronospheres.
const SLOT_CASES = [
  ["an ordinary building orders, as it always did", { isSuperWeapon: false, superWeapon: null }, "order"],
  [
    "a superweapon building activates once the weapon is charged",
    { isSuperWeapon: false, superWeapon: { showTimer: true, status: "ready" } },
    "activate",
  ],
  [
    "and says so while it is still charging",
    { isSuperWeapon: false, superWeapon: { showTimer: true, status: "charging" } },
    "charging",
  ],
  [
    "a low-power base is charging too — the remedy differs, the answer to the press does not",
    { isSuperWeapon: false, superWeapon: { showTimer: true, status: "paused" } },
    "charging",
  ],
  [
    "a building whose weapon shows no timer keeps ordering — the airfield is built several times",
    { isSuperWeapon: false, superWeapon: { showTimer: false, status: "ready" } },
    "order",
  ],
  [
    "a paradrop slot activates on its own timer rule, which is no timer at all",
    { isSuperWeapon: true, superWeapon: { showTimer: false, status: "ready" } },
    "activate",
  ],
  [
    "and a paradrop nobody owns is missing rather than orderable",
    { isSuperWeapon: true, superWeapon: null },
    "missing",
  ],
];
for (const [name, at, want] of SLOT_CASES) {
  const got = chordSlotAction(at);
  check(`slot key — ${name}`, got.act === want, got.act);
}

// The two slots the layouts gained, and the one deck that is not two units.
check(
  "the airport paradrop is on the same key on both sides",
  chordLayout({}, "Allied", "defense")[9] === "sw:ParaDropSpecial" &&
    chordLayout({}, "Soviet", "defense")[9] === "sw:ParaDropSpecial",
  "defence g, both grids"
);
check(
  "the American drop shares the Grand Cannon's key, and both halves are country-locked",
  chordSlotKey(chordLayout({}, "Allied", "defense")[4]) === "GTGCAN+sw:AmericanParaDropSpecial" &&
    chordIsDeck(chordLayout({}, "Allied", "defense")[4]),
  "Allied defence t, drawn as a deck"
);
check(
  "every superweapon row names a section, a label and the building that grants it",
  SUPERWEAPONS.every(
    (row) =>
      row.id === `sw:${row.name}` && /^[A-Za-z]+$/.test(row.name) && row.label && /^[A-Z0-9]+$/.test(row.from)
  ),
  SUPERWEAPONS.map((row) => `${row.name} <- ${row.from}`).join(", ")
);
check(
  "sw: is a superweapon and an object id is not",
  chordIsSuperWeapon("sw:ParaDropSpecial") &&
    !chordIsSuperWeapon("GAWEAT") &&
    !chordIsSuperWeapon(null) &&
    chordSuperWeaponName("sw:ParaDropSpecial") === "ParaDropSpecial" &&
    chordSuperWeaponName("GAWEAT") === "",
  "the id is the trait key with three characters in front of it"
);

// --- Ctrl on a tab key --------------------------------------------------------
//
// The same press the sidebar's right click is, reached without finding a cameo:
// a queue that is running pauses, one already paused or finished is cancelled.
// The whole of the difference is Shift — five rather than everything, and the
// pause folded into the same press, because someone who asked for five gone did
// not ask to be told the queue is on hold.
const CANCEL_CASES = [
  ["a running queue pauses on the first press", at(), 1, { act: "pause" }],
  [
    "and the second press cancels what it paused",
    at({ status: "onhold" }),
    1,
    { act: "cancel", quantity: 1 },
  ],
  [
    "a finished structure cancels at once — a ready queue has nothing left to pause",
    at({ status: "ready" }),
    1,
    { act: "cancel", quantity: 1 },
  ],
  [
    "Shift on a running queue cancels five and pauses on the way",
    at({ queued: 9 }),
    CANCEL_MANY,
    { act: "cancel", quantity: 5, pauseFirst: true },
  ],
  [
    "Shift on one already paused sends no second pause",
    at({ status: "onhold", queued: 9 }),
    CANCEL_MANY,
    { act: "cancel", quantity: 5, pauseFirst: false },
  ],
  [
    "and never asks for more than is there",
    at({ status: "onhold", queued: 2 }),
    CANCEL_MANY,
    { act: "cancel", quantity: 2, pauseFirst: false },
  ],
  [
    "a held key takes the lot, and pauses on the way",
    at({ queued: 9 }),
    Infinity,
    { act: "cancel", quantity: 9, pauseFirst: true },
  ],
  [
    "holding one already paused takes the lot with no second pause",
    at({ status: "onhold", queued: 9 }),
    Infinity,
    { act: "cancel", quantity: 9, pauseFirst: false },
  ],
  ["nothing queued, nothing to do", at({ queued: 0, isFirst: false }), CANCEL_MANY, { act: "none" }],
  ["and no queue at all is the same answer", null, CANCEL_MANY, { act: "none" }],
];
for (const [name, state, want, expect] of CANCEL_CASES) {
  const got = chordCancelAction(state, want);
  const same = Object.entries(expect).every(([k, v]) => got[k] === v || (!expect[k] && !got[k]));
  check(`cancel key — ${name}`, same, JSON.stringify(got));
}

// Which queue the press lands on. A tab is not a queue — the Units tab feeds
// three — and the answer has to survive the case the whole rule exists for: the
// second press of a pause/cancel pair, when the queue it paused is no longer the
// active one.
const QUEUE_PICKS = [
  [
    "the tab's active queue wins over one merely holding something",
    [{ type: "Vehicles", status: "idle", queued: 0 }, { type: "Ships", status: "onhold", queued: 2 }, { type: "Aircrafts", status: "active", queued: 1 }],
    "Aircrafts",
  ],
  [
    "with none active, the first that holds anything — which is the queue the last press paused",
    [{ type: "Vehicles", status: "onhold", queued: 3 }, { type: "Ships", status: "active", queued: 0 }],
    "Vehicles",
  ],
  [
    "an empty queue is never picked, however early in the list it sits",
    [{ type: "Vehicles", status: "idle", queued: 0 }, { type: "Ships", status: "onhold", queued: 1 }],
    "Ships",
  ],
];
for (const [name, candidates, want] of QUEUE_PICKS) {
  const got = chordCancelQueue(candidates);
  check(`cancel key — ${name}`, !!got && got.type === want, got ? got.type : "nothing");
}
check(
  "cancel key — nothing queued anywhere is nothing to do, not the first queue by default",
  chordCancelQueue([{ type: "Vehicles", status: "idle", queued: 0 }]) === null &&
    chordCancelQueue([]) === null &&
    chordCancelQueue(undefined) === null,
  "null"
);

// Ctrl+W is the browser's until a keyboard lock says otherwise, and a press that
// cannot be held is not acted on at all: queueing something on the way out of a
// tab costs the order and the tab both. The lock is only ever asked for the keys
// a Ctrl is taken on — Escape and F11 stay the browser's, so the way out of
// fullscreen is never something this took away.
check(
  "Ctrl+W is left alone until the page holds a keyboard lock",
  RESERVED_CODES.includes("KeyW") &&
    chordPressRoute(press({ code: "KeyW", key: "W", ctrlKey: true }), routed({ gridOpen: true })).layer ===
      "none" &&
    /if \(route\.layer === "none"\) return;/.test(companion),
  "the route answers none for it, and the listener returns on that answer"
);
// --- the keyboard lock is shared, and 0.59.0 took it -------------------------
//
// One lock per page, and `keyboard.lock(codes)` REPLACES the set. The client
// locks Escape, F5, F12 and F11 on entering fullscreen so that Escape reaches
// the game; 0.59.0 locked four tab keys and released exactly that, so the next
// Escape left fullscreen — which ends the lock — and Ctrl+W went back to closing
// the tab. Every row below is that defect, from a different angle.
const CLIENT = { seen: true, all: false, codes: ["Escape", "F5", "F12", "F11"] };
const LOCK_CASES = [
  ["nobody wants anything, so nothing is locked", { seen: false, all: false, codes: [] }, [], { act: "unlock" }],
  [
    "the client's own request passes through untouched when we want nothing",
    CLIENT,
    [],
    { act: "lock", codes: ["Escape", "F5", "F12", "F11"] },
  ],
  [
    "and keeps every one of its keys when we want ours too — the whole of the 0.59.0 defect",
    CLIENT,
    ["KeyQ", "KeyW", "KeyE", "KeyR"],
    { act: "lock", codes: ["Escape", "F5", "F12", "F11", "KeyQ", "KeyW", "KeyE", "KeyR"] },
  ],
  [
    "a client holding every key is already holding ours",
    { seen: true, all: true, codes: [] },
    ["KeyW"],
    { act: "lock", all: true },
  ],
  [
    "before the client has asked for anything, Escape is added anyway — one frame without it is the bug",
    { seen: false, all: false, codes: [] },
    ["KeyW"],
    { act: "lock", codes: ["Escape", "KeyW"] },
  ],
  [
    "a key both sides want is locked once",
    { seen: true, all: false, codes: ["Escape"] },
    ["Escape", "KeyW"],
    { act: "lock", codes: ["Escape", "KeyW"] },
  ],
  [
    "the client releasing its own leaves ours, rather than unlocking the page",
    { seen: true, all: false, codes: [] },
    ["KeyW"],
    { act: "lock", codes: ["KeyW"] },
  ],
];
for (const [name, client, ours, want] of LOCK_CASES) {
  const got = chordKeyLockPlan(client, ours);
  const same =
    got.act === want.act &&
    !!got.all === !!want.all &&
    (got.codes || []).join(" ") === (want.codes || []).join(" ");
  check(`keyboard lock — ${name}`, same, JSON.stringify(got));
}
check(
  "and the union never drops a key either side asked for, over every combination of the two",
  [[], ["Escape"], ["Escape", "F11"], ["KeyW"]].every((theirs) =>
    [[], ["KeyW"], ["KeyQ", "KeyW"]].every((ours) => {
      const plan = chordKeyLockPlan({ seen: true, all: false, codes: theirs }, ours);
      const locked = plan.act === "lock" ? plan.codes || [] : [];
      return [...theirs, ...ours].every((code) => locked.includes(code));
    })
  ),
  "swept 4 client sets against 3 of ours"
);

// And the game side goes through it rather than calling the browser itself: one
// wrapped API, both wishes recorded, and an unlock that is never passed straight
// through — unlocking would drop the client's Escape with it.
// The wrapper itself, **run** rather than read. Slicing it out of companion.js —
// the same trick the options-page harness uses — is the only way to exercise a
// two-party negotiation without a browser and a running game, and this defect
// was never in either side's own code: it was in what happened when both asked.
function sliceFn(name) {
  const at = companion.indexOf(`function ${name}(`);
  if (at < 0) throw new Error(`check-chords is out of date: no function ${name} in companion.js`);
  let depth = 0;
  for (let i = companion.indexOf("{", at); i < companion.length; i++) {
    if (companion[i] === "{") depth++;
    else if (companion[i] === "}" && --depth === 0) return companion.slice(at, i + 1);
  }
  throw new Error(`unbalanced ${name}`);
}

const lockHarness = new Function(
  "CHORD_TABLES",
  "state",
  "document",
  "navigator",
  "GRID_KEYS",
  "RESERVED_CODES",
  "buildBindings",
  "note",
  `let keyLock = "not asked for";
   let clientLock = { seen: false, all: false, codes: [] };
   let nativeLock = null;
   let nativeUnlock = null;
   ${sliceFn("hookKeyboard")}
   ${sliceFn("wantKeyLock")}
   ${sliceFn("ctrlKeysToHold")}
   ${sliceFn("applyKeyLock")}
   ${sliceFn("syncKeyLock")}
   return { hookKeyboard, syncKeyLock, ctrlKeysToHold, held: () => keyLock };`
);

/** One page: the client's own lock call and ours, in whichever order. */
function lockRun(steps, prefs = { grabTabKeys: true }, bindings = new Map()) {
  const calls = [];
  const navigator = {
    keyboard: {
      lock: (codes) => {
        calls.push(codes ? [...codes] : ["*"]);
        return Promise.resolve();
      },
      unlock: () => calls.push(["unlock"]),
    },
  };
  const state = { prefs, combatant: {}, hooks: {} };
  const api = lockHarness(
    tables,
    state,
    { fullscreenElement: {} },
    navigator,
    GRID_KEYS,
    RESERVED_CODES,
    () => bindings,
    () => {}
  );
  api.hookKeyboard();
  for (const step of steps) {
    if (step === "client") navigator.keyboard.lock(["Escape", "F5", "F12", "F11"]);
    else if (step === "clientUnlock") navigator.keyboard.unlock();
    else api.syncKeyLock();
  }
  return { calls, last: calls[calls.length - 1] || [], api };
}

for (const order of [["client", "ours"], ["ours", "client"]]) {
  const { last } = lockRun(order);
  check(
    `keyboard lock, live — ${order.join(" then ")}: Escape survives and the codes Ctrl needs are added`,
    ["Escape", "F5", "F12", "F11", "KeyW", "KeyT"].every((code) => last.includes(code)),
    last.join(" ")
  );
}
check(
  "keyboard lock, live — what is asked for is the grid's reserved keys, not the tab keys",
  lockRun(["ours"]).api.ctrlKeysToHold().join(" ") === "KeyW KeyT",
  lockRun(["ours"]).api.ctrlKeysToHold().join(" ")
);
check(
  "keyboard lock, live — and a fixed binding on a reserved key is held too",
  lockRun(["ours"], { grabTabKeys: true }, new Map([["KeyN|000", "GAPILE"]]))
    .api.ctrlKeysToHold()
    .join(" ") === "KeyW KeyT KeyN",
  lockRun(["ours"], { grabTabKeys: true }, new Map([["KeyN|000", "GAPILE"]])).api.ctrlKeysToHold().join(" ")
);
check(
  "keyboard lock, live — the client re-locking on a fullscreen round trip keeps ours",
  lockRun(["ours", "client", "clientUnlock", "client"]).last.includes("KeyW"),
  lockRun(["ours", "client", "clientUnlock", "client"]).last.join(" ")
);
check(
  "keyboard lock, live — with the preference off we add nothing and take nothing",
  (() => {
    const { last, api } = lockRun(["client", "ours"], { grabTabKeys: false });
    return last.join(" ") === "Escape F5 F12 F11" && api.held() !== "held";
  })(),
  lockRun(["client", "ours"], { grabTabKeys: false }).last.join(" ")
);

// --- Firefox: the lock is an option of the fullscreen request -----------------
//
// No `navigator.keyboard`; `requestFullscreen({ keyboardLock: "browser" })`
// instead (Firefox 151). Run against a stub Element whose request reads the
// option only when `knows` says the browser has it, so "held" has to come from
// the read and not from the call having been made.
const fxHarness = new Function(
  "CHORD_TABLES",
  "state",
  "document",
  "navigator",
  "Element",
  "GRID_KEYS",
  "RESERVED_CODES",
  "buildBindings",
  "note",
  `let keyLock = "not asked for";
   let clientLock = { seen: false, all: false, codes: [] };
   let nativeLock = null;
   let nativeUnlock = null;
   ${sliceFn("wantKeyLock")}
   ${sliceFn("ctrlKeysToHold")}
   ${sliceFn("applyKeyLock")}
   ${sliceFn("syncKeyLock")}
   let fullscreenLock = false;
   ${sliceFn("hookFullscreenLock")}
   hookFullscreenLock();
   return { held: () => keyLock };`
);

async function fxRun({ prefs = { grabTabKeys: true }, knows = true, combatant = {}, clientOptions } = {}) {
  const seen = [];
  const doc = { fullscreenElement: null };
  function Element() {}
  Element.prototype.requestFullscreen = function (options) {
    seen.push({ navigationUI: options && options.navigationUI, lock: knows ? options && options.keyboardLock : undefined });
    doc.fullscreenElement = this;
    return Promise.resolve();
  };
  const state = { prefs, combatant, hooks: {} };
  const api = fxHarness(tables, state, doc, {}, Element, GRID_KEYS, RESERVED_CODES, () => new Map(), () => {});
  await new Element().requestFullscreen(clientOptions);
  await Promise.resolve();
  return { seen, state, inFullscreen: api.held() };
}

{
  const run = await fxRun({ clientOptions: { navigationUI: "hide" } });
  check(
    "Firefox lock — the client's request goes out with keyboardLock browser and its own options kept",
    run.seen.length === 1 && run.seen[0].lock === "browser" && run.seen[0].navigationUI === "hide",
    JSON.stringify(run.seen)
  );
  check("Firefox lock — held in a match once the browser has read the option", run.inFullscreen === "held", run.inFullscreen);
  check("Firefox lock — the hook reports itself", run.state.hooks.fullscreenKeyboardLock === true);

  const off = await fxRun({ prefs: { grabTabKeys: false } });
  check(
    "Firefox lock — with the preference off the request goes out untouched",
    off.seen[0].lock === undefined && off.inFullscreen !== "held",
    `${JSON.stringify(off.seen)} ${off.inFullscreen}`
  );

  const old = await fxRun({ knows: false });
  check(
    "Firefox lock — a browser that never reads the option is not reported held",
    old.inFullscreen === "not taken with this fullscreen",
    old.inFullscreen
  );

  const lobby = await fxRun({ combatant: null });
  check(
    "Firefox lock — taken outside a match, but not held for the grid there",
    lobby.inFullscreen === "taken with fullscreen, not in a match",
    lobby.inFullscreen
  );
}

check(
  "Firefox lock — Chrome keeps the Keyboard API path: the fullscreen hook stands down where navigator.keyboard exists",
  /function hookFullscreenLock\(\) \{\s*if \(navigator\.keyboard \|\|/.test(companion) && /\n  hookFullscreenLock\(\);/.test(companion),
  "hookFullscreenLock returns first when navigator.keyboard is there, and is installed"
);

check(
  "companion.js asks the browser for a lock in exactly one place, through the plan",
  /nativeLock = kb\.lock\.bind\(kb\)/.test(companion) &&
    /kb\.lock = \(codes\) =>/.test(companion) &&
    /chordKeyLockPlan\(clientLock, ours\)/.test(companion) &&
    (companion.match(/nativeLock\(/g) || []).length === 2 &&
    !/navigator\.keyboard\.lock\(/.test(companion),
  "hookKeyboard records both wishes, applyKeyLock issues the union"
);

check(
  "and only the codes a Ctrl is taken on are ever added, in a match, in the game's own fullscreen",
  /const ours = wantKeyLock\(\) \? ctrlKeysToHold\(\) : \[\]/.test(companion) &&
    /function wantKeyLock\(\)[\s\S]{0,200}state\.combatant[\s\S]{0,80}document\.fullscreenElement/.test(
      companion
    ),
  "ctrlKeysToHold, and nothing else of ours ever reaches the plan"
);

// --- what the grid draws ------------------------------------------------------
//
// Only what a press would order. The cell stays, because the grid's geometry is
// the keyboard's; the trailing row that holds nothing goes, because dropping it
// moves nothing.
const ROWS = [
  ["a full grid keeps all three rows", Array(15).fill(true), 3],
  ["an empty bottom row goes", [...Array(10).fill(true), ...Array(5).fill(false)], 2],
  ["two empty rows go", [...Array(5).fill(true), ...Array(10).fill(false)], 1],
  [
    "a gap in the middle stays, so no key moves under the hand",
    [...Array(5).fill(true), ...Array(5).fill(false), ...Array(5).fill(true)],
    3,
  ],
  ["one key on the bottom row holds the whole grid open", [...Array(14).fill(false), true], 3],
  ["nothing to draw is no rows at all", Array(15).fill(false), 0],
];
for (const [name, shown, want] of ROWS) {
  const got = chordGridRows(shown, GRID_COLS);
  check(`grid rows — ${name}`, got === want, `${got} row(s)`);
}

// --- where a grid opens -------------------------------------------------------
//
// Placement has now been wrong twice, in opposite directions, so the arithmetic
// is a function with cases rather than three lines nobody can run. Everything is
// viewport coordinates — the space a mouse event arrives in.

const VIEW = { width: 1000, height: 800 };
const GRID = { width: 400, height: 200 };
const PLACE_CASES = [
  ["under the cursor, offset off the tile", { x: 300, y: 300 }, GRID, { left: 312, top: 312 }],
  ["near the right edge it opens leftwards", { x: 960, y: 300 }, GRID, { left: 592, top: 312 }],
  ["near the bottom it opens upwards", { x: 300, y: 780 }, GRID, { left: 312, top: 592 }],
  ["in the far corner it stays wholly on screen", { x: 999, y: 799 }, GRID, { left: 592, top: 592 }],
  ["at the very top left it clears the edge", { x: 0, y: 0 }, GRID, { left: 12, top: 12 }],
  [
    "a box wider than the window sits at the margin, not off it",
    { x: 900, y: 700 },
    { width: 1200, height: 900 },
    { left: 8, top: 8 },
  ],
  ["with no pointer ever seen, it centres", null, GRID, { left: 300, top: 300 }],
];
for (const [name, pointer, size, want] of PLACE_CASES) {
  const got = chordPlacement(pointer, size, VIEW);
  check(`place at — ${name}`, got.left === want.left && got.top === want.top, JSON.stringify(got));
}

// The property behind every case above, over the whole window: whatever the
// cursor does, the box lands inside the viewport. A corner case list can miss a
// sign error; this cannot.
const escaped = [];
for (let x = -50; x <= VIEW.width + 50; x += 37) {
  for (let y = -50; y <= VIEW.height + 50; y += 31) {
    const at = chordPlacement({ x, y }, GRID, VIEW);
    if (at.left < 0 || at.top < 0 || at.left + GRID.width > VIEW.width || at.top + GRID.height > VIEW.height) {
      escaped.push(`${x},${y} -> ${at.left},${at.top}`);
    }
  }
}
check(
  "and no cursor position anywhere puts it off screen",
  escaped.length === 0,
  escaped.length ? escaped.slice(0, 3).join("; ") : "swept the window and 50px past every edge"
);

// --- the fixed hotkeys against the grid's own block ---------------------------
//
// An open grid spends **every** modifier on its fifteen letters: bare orders,
// Shift orders five, Alt cancels, and Ctrl closes on any key at all. A fixed
// hotkey on one of those letters is therefore reachable only while no grid is
// open — which is how the production panel shipped on Shift+Q, unable to order
// five of the first slot, the most obvious thing to do with a units grid.
//
// 0.63.0 emptied the block of our own keys entirely — they are the digits now,
// on the left half of a split keyboard — so this check has **no exceptions
// left** and says so: the two that used to be grandfathered in, hqSwap on
// Shift+B and hqFull on Shift+F, moved with the rest.

const keyBlock = companion.slice(
  companion.indexOf("const DEFAULT_KEYS = {"),
  companion.indexOf("\n  };", companion.indexOf("const DEFAULT_KEYS = {"))
);
const fixedKeys = [...keyBlock.matchAll(/^\s{4}(\w+):\s*\{([^}]*)\}/gm)].map(([, name, body]) => ({
  name,
  code: (body.match(/code:\s*"(\w+)"/) || [])[1] || "",
  ctrl: /ctrl:\s*true/.test(body),
  alt: /alt:\s*true/.test(body),
  shift: /shift:\s*true/.test(body),
}));
const onBlock = fixedKeys.filter((key) => GRID_KEYS.includes(key.code));
check(
  "no fixed hotkey sits on the grid's own block",
  onBlock.length === 0,
  onBlock.length
    ? onBlock.map((k) => `${k.name} on ${k.code}`).join(", ")
    : `${fixedKeys.length} fixed keys, none of them on the ${GRID_KEYS.length} the grid spends`
);
// And none of them is a Ctrl combination either: the grid answers *close* to any
// Ctrl press and keeps it, so a Ctrl hotkey is shadowed whatever key it is on.
const onCtrl = fixedKeys.filter((key) => key.ctrl);
check(
  "and none of them is a Ctrl press, which an open grid swallows whatever the key",
  onCtrl.length === 0,
  onCtrl.length ? onCtrl.map((k) => k.name).join(", ") : "no Ctrl among the fixed hotkeys"
);

// --- what the Alt defaults cost, and what they do not -------------------------
//
// 0.101.0 moved the shipped defaults off bare digits (0.66.0-0.100.0) and
// onto `Alt` + the right hand. The move is a subtraction and is checked as one.
// A bare key is taken from the game by construction — our listener is capture +
// `stopPropagation` — and the digits were the client's own team select, so a
// stock install lost it. `Alt`+letter is the only space the client's default
// table leaves empty: `Alt+M` is `ToggleMarbleMadness`, which is in the enum and
// never passed to `registerKeyCommand`, and `Alt+S` is registered only while
// cheats are on.
//
// What the arrangement stands on is that `matchesHotkey` compares the whole
// modifier state rather than ignoring extras. That is what leaves the *bare*
// letter to the client — `N` still steps to the next object — and what keeps
// AltGr off our bindings, since Chrome reports it as ctrl+alt. Exercised rather
// than asserted.

const onAlt = fixedKeys.filter((key) => key.alt && !key.ctrl && !key.shift);
check(
  "every shipped default is Alt and only Alt — no bare key is taken from the game",
  onAlt.length === fixedKeys.length,
  `${onAlt.length}/${fixedKeys.length} on a lone Alt`
);
const onDigits = fixedKeys.filter((key) => /^Digit\d$/.test(key.code));
check(
  "and none is on a digit, which is team select under every modifier the client has",
  onDigits.length === 0,
  onDigits.length ? onDigits.map((k) => k.name).join(", ") : "no digit among the fixed hotkeys"
);

const { matchesHotkey } = new Function(`${sliceFn("matchesHotkey")} return { matchesHotkey };`)();
const altLetter = { code: "KeyN", alt: true, shift: false, ctrl: false };
const pressed = (over) => ({ code: "KeyN", altKey: true, shiftKey: false, ctrlKey: false, metaKey: false, ...over });
const MODIFIED = [
  ["the Alt press is ours", pressed(), true],
  ["a bare N is the client's — NextObject still works", pressed({ altKey: false }), false],
  ["Ctrl+Alt is AltGr on a German layout, and never ours", pressed({ ctrlKey: true }), false],
  ["Alt+Shift is the Windows layout switch, likewise", pressed({ shiftKey: true }), false],
  ["Meta is never ours", pressed({ metaKey: true }), false],
  ["another letter is another key", pressed({ code: "KeyM" }), false],
];
for (const [name, event, want] of MODIFIED) {
  check(`Alt default — ${name}`, matchesHotkey(event, altLetter) === want, String(matchesHotkey(event, altLetter)));
}

// --- an overlay that is meant to be used has to be able to receive a mouse ---
//
// 0.54.0 moved both of these onto `document.body`, and they stopped taking
// clicks and drags entirely while still being perfectly visible — which is the
// worst version of the failure, because it looks like it works. The arrangement
// that does work is the one `.cdc-ig-map` has always used: inside the client's
// own root, in a layer that is transparent to the mouse, with the boxes turning
// pointer events back on. Text, not a rendered page, but it pins the three
// facts that differ between the two arrangements.

const css = readFileSync(join(src, "companion.css"), "utf8");
const rule = (selector) => {
  const at = css.indexOf(`${selector} {`);
  return at < 0 ? "" : css.slice(at, css.indexOf("}", at));
};

check(
  "the overlay layer is inside the client's root and transparent to the mouse",
  /position:\s*absolute/.test(rule(".cdc-layer")) &&
    /pointer-events:\s*none/.test(rule(".cdc-layer")) &&
    /chordLayer[\s\S]{0,400}getElementById\("ra2web-root"\)/.test(companion),
  rule(".cdc-layer") ? "declared" : "no .cdc-layer rule at all"
);
for (const box of [".cdc-chord", ".cdc-queues"]) {
  check(
    `${box} takes pointer events back`,
    /pointer-events:\s*auto/.test(rule(box)),
    rule(box) ? "declared" : "no rule at all"
  );
}
check(
  "and neither box is mounted on the body, where the mouse never reaches it",
  !/document\.body\.append\((chordEl|queuesEl)\)/.test(companion) &&
    /chordLayer\(\)\.append\(chordEl\)/.test(companion) &&
    /chordLayer\(\)\.append\(queuesEl\)/.test(companion),
  "both mounted through chordLayer()"
);

// --- the game keeps the mouse, and the overlays work around that -------------
//
// The client holds a pointer lock for most of a match: `clientX/clientY` freeze
// and no element of ours can be hit by the browser's own hit test. Two wrong
// answers have already shipped — reading the frozen coordinates (the grid opened
// in a corner), and releasing the lock so the DOM would work (which drops the OS
// cursor in the middle of the screen, away from the grid). The right one is to
// leave the lock alone and aim everything at the cursor the player can see.

//
// The *keyboard* lock is a different lock and is allowed: it takes Ctrl+W from
// the browser while the game is fullscreen and gives it back on the way out, and
// giving it back is the half that must not be forgotten. So this looks for a
// release of the pointer lock by name rather than for the word "unlock".
const dropsPointerLock =
  /exitPointerLock/.test(companion) ||
  /getPointerLock\(\)[\s\S]{0,60}?\.unlock\(\)/.test(companion) ||
  /pointerLock\.unlock\(\)/.test(companion);
check(
  "nothing takes the pointer lock away from the game",
  !dropsPointerLock,
  dropsPointerLock
    ? "companion.js releases the lock — that re-centres the OS cursor"
    : "the lock is left where it is"
);
check(
  "the cursor is read from the game while it holds the mouse",
  /function mouseCaptured\(\)[\s\S]{0,200}document\.pointerLockElement/.test(companion) &&
    /function cursorPoint\(\)[\s\S]{0,600}mouseCaptured\(\)/.test(companion) &&
    /chordPlacement\(\s*\n?\s*cursorPoint\(\)/.test(companion),
  "placement takes cursorPoint(), which prefers the client's pointer under a lock"
);
// 0.70.0 gave Ctrl to the keys and left the mouse behind: the same slot,
// clicked with Ctrl held, queued last. Both mouse paths are named here — the
// tile's own click (no lock) and the hand-aimed mousedown (locked) — because
// only one of the two runs in a given state, and a fix to whichever was under
// the cursor that day would look like it worked.
check(
  "Ctrl on a click queues next, on both mouse paths",
  /tile\.addEventListener\("click", \(e\) => \{[\s\S]{0,600}orderSlot\(section, slot, e\.shiftKey \? CHORD_MANY : 1, e\.ctrlKey\)/.test(
    companion
  ) &&
    /mouseCaptured\(\) && e\.button === 0\) \{[\s\S]{0,400}orderSlot\(state\.chord\.section, slot, e\.shiftKey \? CHORD_MANY : 1, e\.ctrlKey\)/.test(
      companion
    ),
  "the modifier is the intent, not the device it arrived on"
);
check(
  "clicks and hover are aimed by hand, not left to :hover and e.target",
  /elementFromPoint/.test(companion) &&
    /dataset\.slot/.test(companion) &&
    /classList\.add\("hovered"\)/.test(companion) &&
    /\.cdc-chord-slot\.hovered/.test(css),
  "elementFromPoint + data-slot + a drawn hover class"
);

// --- the held key -------------------------------------------------------------
//
// The one half of this feature the decision table cannot answer: a hold is the
// *absence* of a keyup, so it lives in companion.js as a timer and can only be
// read here. Three rules, each of which has a failure that looks like nothing:
// arm after acting and a building order would top up a queue nobody is looking
// at; never clear it and a grid closed mid-hold still fires; miss the blur and
// an Alt+Tab out of the game cancels a queue seconds later.
check(
  "a held slot key is armed before the press is carried out",
  /=== "order" \|\| action\.act === "cancel"\)\s*\{\s*chordHoldArm\(e\.code, section, action\.slot, action\.act, action\.next\);[\s\S]{0,400}action\.act === "cancel"\) cancelSlot/.test(
    companion
  ),
  "so a press that closes the grid takes the pending hold with it"
);
check(
  "and it means all of it — the queue's room, or the whole of what is queued",
  /chordHoldArm\(code, section, slot, act, next\)[\s\S]{0,700}cancelSlot\(section, slot, Infinity, true\)[\s\S]{0,250}orderSlot\(section, slot, Infinity, next\)/.test(
    companion
  ),
  "Infinity, which queueBuild clamps to the room and chordCancelAction to what is there"
);
check(
  "a hold is dropped by the keyup, by losing the window, and by the grid closing",
  /"keyup",[\s\S]{0,200}chordHoldClear\(\)/.test(companion) &&
    /addEventListener\("blur", chordHoldClear\)/.test(companion) &&
    /function closeChord\(\)[\s\S]{0,120}chordHoldClear\(\)/.test(companion),
  "keyup + blur + closeChord"
);

check(
  "a hidden key is drawn as a hole of its own size, not left out of the grid",
  /cdc-chord-gap/.test(companion) && /\.cdc-chord-gap/.test(css) && /height/.test(css),
  "companion.js appends .cdc-chord-gap, and the stylesheet gives it a cell"
);
// 0.71.0 turned the grid's visibility rule around: what cannot be ordered is
// dimmed, not blanked. Only *never* is a hole — a slot no id of which this
// country builds (chordResolve returns ""), and a paradrop whose building
// nobody has. Everything else draws, and .cdc-chord-off says which. 0.99.0 made
// the second half of that a setting, so the rule is a function with a truth
// table rather than four lines inside a render.
//
// `bound` false is the country hole; a `sw:` slot is drawn only with its weapon
// in hand; `uses` is a key that aims rather than orders, which is never hidden;
// and `available` is the client's own getAvailableObjects(), which answers the
// tech tree and deliberately does NOT answer a build limit — a thing you own is
// dimmed by .cdc-chord-full, not hidden.
const SHOWN = [
  ["a slot this country builds nothing of is a hole in both modes", { bound: false }, false, false],
  ["an ordinary key draws whole-grid, orderable or not", { bound: true, available: false }, true, false],
  ["and draws in either mode once it is orderable", { bound: true, available: true }, true, true],
  [
    "a sw: slot is drawn only with the weapon in hand",
    { bound: true, isSuperWeapon: true, hasWeapon: false, available: true },
    false,
    false,
  ],
  [
    "a sw: slot with the weapon draws in both modes",
    { bound: true, isSuperWeapon: true, hasWeapon: true, available: false },
    true,
    true,
  ],
  [
    "a key that aims is never hidden, whatever availability says",
    { bound: true, uses: true, available: false },
    true,
    true,
  ],
];
for (const [name, at, whole, only] of SHOWN) {
  const gotWhole = chordSlotShown({ ...at, onlyBuildable: false });
  const gotOnly = chordSlotShown({ ...at, onlyBuildable: true });
  check(
    `grid visibility — ${name}`,
    gotWhole === whole && gotOnly === only,
    `whole grid ${gotWhole}, only-buildable ${gotOnly}`
  );
}
check(
  "the render feeds that rule twice — the cells it draws, and what is visible now",
  /const drawn = names\.map\(\(_, slot\) => slotShown\(slot, false\)\);\s*const live = names\.map\(\(_, slot\) => slotShown\(slot, onlyBuildable\)\);\s*const rows = CHORD_TABLES\.chordGridRows\(live, GRID_COLS\)/.test(
    companion
  ) && /if \(!drawn\[slot\]\) \{\s*const gap = document\.createElement\("i"\)/.test(companion),
  "every cell of the whole grid is built; only the trailing rows follow the setting"
);
check(
  "a hidden tile keeps its cell and can come back without reopening the grid",
  /tile\.classList\.toggle\(\s*"cdc-chord-hidden",\s*onlyBuildable && !available\.has\(name\) && !tile\.classList\.contains\("cdc-chord-super"\)/.test(
    companion
  ) && /\.cdc-chord-hidden \{\s*visibility: hidden;/.test(css),
  "paintChordQueues toggles it every paint, and the sheet hides it without dropping the cell"
);
// The clamp the extension did not have. isAvailableForProduction never looks at
// BuildLimit — the client checks it in UpdateQueueAction as the order runs — so
// an Ore Purifier already standing stayed bright and pressed into silence.
check(
  "a build limit closes the room a press is clamped to, like the client's own",
  /room: Math\.min\(\s*at\.maxSize - at\.currentSize,\s*at\.maxItemQuantity - queued,\s*buildLimitRoom\(object, queued\)/.test(
    companion
  ) && /function buildLimitRoom\(rules, queued\)[\s\S]{0,900}Math\.max\(0, Math\.abs\(limit\) - \(built \+ queued\)\)/.test(companion),
  "queueStateFor clamps on it, so .cdc-chord-full dims a limited building"
);
check(
  "and a press that runs out of it says which nought it hit",
  /buildLimitRoom\(object, at\.queued\) <= 0[\s\S]{0,200}you have all of those you may build/.test(
    companion
  ),
  "a build limit is not a full queue, and the remedy differs"
);
check(
  "and not-orderable is painted, not rendered — it changes under an open grid",
  /const available = availableNames\(\);[\s\S]{0,2400}tile\.classList\.toggle\("cdc-chord-off", !available\.has\(name\)\)/.test(
    companion
  ) && /tile\.classList\.toggle\("cdc-chord-off", !at \|\| at\.status !== "ready"\)/.test(companion),
  "paintChordQueues re-asks availableNames(), and paintCharge dims an uncharged weapon"
);
check(
  "the dim keeps the key badge and the charge readable",
  /\.cdc-chord-off \.cdc-cameo/.test(css) && !/\.cdc-chord-off \{\s*opacity/.test(css),
  "the picture and the name carry it, not the whole tile"
);
// .cdc-chord-super.cdc-chord-off and .cdc-chord-super:hover set the same two
// properties at the same specificity, so the cascade is decided by order alone —
// and the wrong order costs a dimmed weapon its hover, which is the only sign
// the grid gives that a press is about to land on it.
check(
  "a dimmed weapon still shows its hover — the dim is written above the hover rule",
  css.indexOf(".cdc-chord-super.cdc-chord-off") > 0 &&
    css.indexOf(".cdc-chord-super.cdc-chord-off") < css.indexOf(".cdc-chord-super:hover"),
  "same specificity, so order is the whole of the cascade here"
);

// --- the cursor over our own boxes --------------------------------------------
//
// The client draws its cursor into the canvas, and under a pointer lock the
// browser draws none — so a box of ours covers the only cursor in the window.
check(
  "a cursor is drawn over our own boxes, at the position the game draws its own",
  /function drawCursor\(/.test(companion) &&
    /drawCursor\(ourBox\(target\) \? at : null\)/.test(companion) &&
    /\.cdc-cursor/.test(css) &&
    /pointer-events: none/.test(css),
  "drawCursor at cursorPoint(), over .cdc-chord and .cdc-queues only"
);

// --- the fullscreen key, moved off Alt+F --------------------------------------
//
// Alt+F is the client's own fullscreen key and `f` is the ninth slot of the
// grid, so 0.62.0 gave one press two meanings. 0.64.0 settles it: the grid keeps
// it while a grid is open, and with none open the key moves to Alt+Enter.
//
// Run rather than read, like the keyboard-lock wrapper above and for the same
// reason — what it does is send a *synthetic* key at the client, and the fields
// on that event are the whole of whether it works. A browser is not needed to
// check them, only a stub that records what was dispatched.

const constant = (name) => {
  const m = companion.match(new RegExp(`const ${name} = (\\d+);`));
  if (!m) throw new Error(`check-chords is out of date: no const ${name} in companion.js`);
  return Number(m[1]);
};
const FULLSCREEN_KEYCODE = constant("FULLSCREEN_KEYCODE");
const FULLSCREEN_SETTLE = constant("FULLSCREEN_SETTLE");

const fullscreenHarness = new Function(
  "state",
  "document",
  "KeyboardEvent",
  "setTimeout",
  "note",
  `const FULLSCREEN_KEYCODE = ${FULLSCREEN_KEYCODE};
   const FULLSCREEN_SETTLE = ${FULLSCREEN_SETTLE};
   ${sliceFn("fullscreenSwap")}
   ${sliceFn("reissueFullscreenKey")}
   return { fullscreenSwap };`
);

/**
 * One press, against a stubbed page.
 *
 * `dropsKeyCode` is a browser that ignores `keyCode` in the init dictionary —
 * the case the re-issue defends against, since the client hashes that field and
 * a zero would hash to a key it has never bound.
 */
function fullscreenRun(press, { pref = true, fullscreen = false, dropsKeyCode = false, thenFullscreen } = {}) {
  const dispatched = [];
  const notes = [];
  const page = {
    get fullscreenElement() {
      return page.now ? {} : null;
    },
    now: fullscreen,
    dispatchEvent(ev) {
      dispatched.push(ev);
      if (thenFullscreen !== undefined) page.now = thenFullscreen;
      return true;
    },
  };
  const KeyboardEventStub = function (type, init) {
    Object.assign(this, { type }, init);
    if (dropsKeyCode) {
      this.keyCode = 0;
      this.which = 0;
    }
  };
  const settle = [];
  const api = fullscreenHarness(
    { prefs: { fullscreenOnEnter: pref } },
    page,
    KeyboardEventStub,
    (fn) => settle.push(fn),
    (text, level) => notes.push({ text, level })
  );
  const ours = api.fullscreenSwap({ altKey: false, ctrlKey: false, shiftKey: false, metaKey: false, repeat: false, ...press });
  settle.forEach((fn) => fn());
  return { ours, dispatched, notes };
}

const enter = { altKey: true, code: "Enter" };

const one = fullscreenRun(enter, { thenFullscreen: true });
check(
  "Alt+Enter is taken, and goes back out as the client's own Alt+F",
  one.ours === true &&
    one.dispatched.length === 1 &&
    one.dispatched[0].type === "keydown" &&
    one.dispatched[0].code === "KeyF" &&
    one.dispatched[0].altKey === true &&
    one.dispatched[0].bubbles === true,
  `${one.dispatched.length} dispatched: ${JSON.stringify(one.dispatched[0] || null)}`
);
check(
  "and it carries the keyCode the client hashes, not just the code string",
  one.dispatched[0] && one.dispatched[0].keyCode === FULLSCREEN_KEYCODE && one.dispatched[0].which === FULLSCREEN_KEYCODE,
  `keyCode ${one.dispatched[0] && one.dispatched[0].keyCode}`
);

const dropped = fullscreenRun(enter, { dropsKeyCode: true, thenFullscreen: true });
check(
  "a browser that ignores keyCode in the init dictionary is corrected, not shipped a zero",
  dropped.dispatched[0] && dropped.dispatched[0].keyCode === FULLSCREEN_KEYCODE,
  `keyCode ${dropped.dispatched[0] && dropped.dispatched[0].keyCode}`
);

const numpad = fullscreenRun({ altKey: true, code: "NumpadEnter" }, { thenFullscreen: true });
check("the numeric keypad's Enter is the same key", numpad.ours === true && numpad.dispatched.length === 1, `${numpad.dispatched.length} dispatched`);

const swallowed = fullscreenRun({ altKey: true, code: "KeyF" });
check(
  "Alt+F is swallowed and sends nothing — the key moved, it did not double up",
  swallowed.ours === true && swallowed.dispatched.length === 0,
  `${swallowed.dispatched.length} dispatched`
);

const held = fullscreenRun({ ...enter, repeat: true });
check(
  "a held Alt+Enter is one press, not one per OS repeat",
  held.ours === true && held.dispatched.length === 0,
  `${held.dispatched.length} dispatched`
);

for (const [name, press] of [
  ["Ctrl+Alt+Enter", { ...enter, ctrlKey: true }],
  ["Alt+Shift+Enter", { ...enter, shiftKey: true }],
  ["Meta+Alt+Enter", { ...enter, metaKey: true }],
  ["a bare Enter", { code: "Enter" }],
  ["a bare F", { code: "KeyF" }],
]) {
  const got = fullscreenRun(press);
  check(`${name} is not ours`, got.ours === false && got.dispatched.length === 0, JSON.stringify(got.ours));
}

const off = fullscreenRun(enter, { pref: false });
const offF = fullscreenRun({ altKey: true, code: "KeyF" }, { pref: false });
check(
  "with the setting off both keys are the client's again",
  off.ours === false && off.dispatched.length === 0 && offF.ours === false,
  `${off.ours} / ${offF.ours}`
);

// The one failure this cannot prevent: `isTrusted` is the field a page cannot
// forge, and a client that reads it drops the re-issue in silence. Saying so is
// the whole remedy — there is no second route that does not take the keyboard
// lock out of the client's hands.
const refused = fullscreenRun(enter, { thenFullscreen: false });
check(
  "a re-issue the client ignored is reported rather than retried another way",
  refused.notes.length === 1 && refused.notes[0].level === "warn" && /synthetic key/.test(refused.notes[0].text),
  JSON.stringify(refused.notes)
);
const took = fullscreenRun(enter, { thenFullscreen: true });
check("and one it acted on says nothing", took.notes.length === 0, JSON.stringify(took.notes));

const leaving = fullscreenRun(enter, { fullscreen: true, thenFullscreen: false });
check(
  "leaving fullscreen counts as it working, not as a refusal",
  leaving.notes.length === 0,
  JSON.stringify(leaving.notes)
);

check(
  "our own re-issue is never re-read by our own listener",
  /if \(isTyping\(e\.target\)\) return;[\s\S]{0,400}if \(!e\.isTrusted\) return;/.test(companion),
  "the keydown listener drops untrusted events at the top"
);
check(
  "and the swap is consulted after the grid, so an open grid keeps Alt+F as its cancel",
  companion.indexOf("if (state.chord && !e.metaKey && chordKey(e))") < companion.indexOf("if (fullscreenSwap(e))") &&
    companion.indexOf("if (fullscreenSwap(e))") < companion.indexOf("const hit = matchesHotkey(e, state.keys.debug)"),
  "grid → fullscreen swap → the fixed hotkeys"
);

// --- the game's menu, moved off Escape ----------------------------------------
//
// Escape is the client's own key for the in-game menu (`KeyCommandType.Options`
// -> `GameMenu#open`), which is one reflex and one click from Abort Mission. It
// moves onto a key of ours, and Escape takes over closing the menu — which the
// client binds no key to at all, because opening the menu tears down its own
// keydown listener with `WorldInteraction#setEnabled(false)`.
//
// The decision is a table for the reason the route above is: every row needs a
// running match with the menu in a particular state, and "the menu opened but
// would not close" is a defect nobody can see from the source.

const menuAt = (over) => ({
  enabled: true,
  inMatch: true,
  menuOpen: false,
  deep: false,
  isMenuKey: false,
  isOptionsKey: false,
  ...over,
});
const escape = press({ code: "Escape", key: "Escape" });
const ourKey = press({ code: "KeyM", key: "m", altKey: true });
const MENU_CASES = [
  ["our key opens the menu", ourKey, menuAt({ isMenuKey: true }), { act: "open", consume: true }],
  [
    "the client's Options key does nothing at all — that is the whole feature",
    escape,
    menuAt({ isOptionsKey: true }),
    { act: "swallow", consume: true },
  ],
  [
    "our key closes the menu it opened, from any depth",
    ourKey,
    menuAt({ menuOpen: true, deep: true, isMenuKey: true }),
    { act: "close", consume: true },
  ],
  [
    "Escape closes the menu the client gives no key for",
    escape,
    menuAt({ menuOpen: true }),
    { act: "close", consume: true },
  ],
  [
    "and one screen deep it steps back instead — a press in a quit confirmation meant that dialog",
    escape,
    menuAt({ menuOpen: true, deep: true }),
    { act: "back", consume: true },
  ],
  [
    "a held Escape is one step, not one per OS repeat",
    press({ code: "Escape", key: "Escape", repeat: true }),
    menuAt({ menuOpen: true, deep: true }),
    { act: "pass", consume: true },
  ],
  [
    "a held menu key opens one menu",
    press({ code: "KeyM", key: "m", altKey: true, repeat: true }),
    menuAt({ isMenuKey: true }),
    { act: "pass", consume: true },
  ],
  [
    "Ctrl+Escape is the Start menu and means nothing here",
    press({ code: "Escape", key: "Escape", ctrlKey: true }),
    menuAt({ menuOpen: true }),
    { act: "pass", consume: false },
  ],
  [
    "Shift+Escape is Chrome's task manager, likewise",
    press({ code: "Escape", key: "Escape", shiftKey: true }),
    menuAt({ menuOpen: true }),
    { act: "pass", consume: false },
  ],
  [
    "any other key with the menu up is not ours, and there is nothing under it either",
    press({ code: "KeyQ", key: "Q" }),
    menuAt({ menuOpen: true }),
    { act: "pass", consume: false },
  ],
  [
    "out of a match Escape is nobody's",
    escape,
    menuAt({ inMatch: false, isOptionsKey: true }),
    { act: "pass", consume: false },
  ],
  // The defect 0.73.1 fixes, and the window it lives in: a match ends by
  // disposing the player UI — which takes the client's own keydown listener with
  // it — and only leaves the game screen five seconds later, with the GameMenu
  // still alive in between. An ungated key opened the menu onto a screen the
  // client had finished with.
  [
    "and the menu key opens nothing there either — the match is over, the client's listener is gone",
    ourKey,
    menuAt({ inMatch: false, isMenuKey: true }),
    { act: "pass", consume: false },
  ],
  [
    "but a menu still open when the match ended under it still closes",
    escape,
    menuAt({ inMatch: false, menuOpen: true }),
    { act: "close", consume: true },
  ],
  [
    "with the setting off Escape opens the menu again, as the game shipped it",
    escape,
    menuAt({ enabled: false, isOptionsKey: true }),
    { act: "pass", consume: false },
  ],
  [
    "and off means off in both halves: it stops closing the menu too",
    escape,
    menuAt({ enabled: false, menuOpen: true }),
    { act: "pass", consume: false },
  ],
  [
    "and our own key stops opening it",
    ourKey,
    menuAt({ enabled: false, isMenuKey: true }),
    { act: "pass", consume: false },
  ],
];
for (const [name, event, at, want] of MENU_CASES) {
  const got = menuKeyAction(event, at);
  check(`menu — ${name}`, got.act === want.act && got.consume === want.consume, JSON.stringify(got));
}

// The client's own methods, not a synthetic keypress. `GameMenu#open` and
// `#close` fire the events that unlock the pointer and re-enable the world
// interaction, so driving them keeps the client in charge of both — where a
// forged Escape would be dropped by anything reading `isTrusted`, which is the
// residual risk the fullscreen swap above still carries.
check(
  "the menu is driven through the client's own open/close/popScreen",
  /function runMenuAction\(act\)[\s\S]{0,900}menu\.open\(\)[\s\S]{0,400}menu\.close\(\)[\s\S]{0,400}menu\.controller\.popScreen\(\)/.test(
    companion
  ) && !/new KeyboardEvent\([\s\S]{0,200}Escape/.test(companion),
  "no synthetic Escape anywhere in companion.js"
);
check(
  "and the instance is captured off GameMenu#init, and dropped on its dispose",
  /Menu\.prototype\.init = function[\s\S]{0,200}state\.gameMenu = this/.test(companion) &&
    /Menu\.prototype\.dispose = function[\s\S]{0,200}state\.gameMenu === this\) state\.gameMenu = null/.test(companion),
  "so a menu key between matches reaches nothing"
);
// Order is the whole of how the two claims on Escape are settled — the full
// render closes on it, and it must keep doing so while the menu is closed.
check(
  "the modal layer is answered before the grid, and the swallow after the fixed hotkeys",
  companion.indexOf('if (layer === "menu")') < companion.indexOf('if (layer === "grid")') &&
    companion.indexOf("const hit = matchesHotkey(e, state.keys.debug)") <
      companion.indexOf("if (CHORD_TABLES && state.gameMenu)"),
  "menu → grid → … → the fixed hotkeys → the menu swap"
);
check(
  "Escape still closes the full render, which is the only other thing bound to it",
  /e\.code === "Escape" && state\.hqFullVisible/.test(companion),
  "in the hit chain, above the swallow"
);
// Two shipped defaults on one key would shadow each other silently: the chain
// above takes the first match and the second key would look dead. This is the
// check the debug-panel move (5 -> 6) needed.
{
  const seen = new Map();
  const clashes = [];
  for (const key of fixedKeys) {
    const id = `${key.code}|${key.ctrl ? 1 : 0}${key.alt ? 1 : 0}${key.shift ? 1 : 0}`;
    if (seen.has(id)) clashes.push(`${key.name} and ${seen.get(id)} are both on ${key.code}`);
    seen.set(id, key.name);
  }
  check(
    "no two shipped hotkeys sit on the same binding",
    clashes.length === 0,
    clashes.length ? clashes.join("; ") : `${seen.size} distinct bindings`
  );
}

// --- the keys drawn on the game's own sidebar ---------------------------------
//
// The badge layer reads the client's sidebar and writes a letter onto each
// cameo. Two things decide whether it says the truth: the index from an object
// name to a key, and the arithmetic that turns the client's canvas pixels into
// the viewport pixels a DOM box is placed in. Both are here; where a cameo *is*
// can only be read from a running client.

// Every id in every shipped layout is reachable by name, on the key its slot
// sits on. Checked against the layouts themselves rather than a copy of them,
// so a layout edit cannot leave this passing about the old one.
{
  const misses = [];
  for (const side of Object.keys(DEFAULT_CHORDS)) {
    const map = chordBadges({}, side);
    const seen = new Set();
    for (const section of SECTIONS) {
      chordLayout({}, side, section.id).forEach((value, slot) => {
        for (const id of chordSlotIds(value)) {
          const name = chordIsSuperWeapon(id) ? chordSuperWeaponName(id) : id;
          const at = map.get(name);
          if (seen.has(name)) return; // first section wins, by construction
          seen.add(name);
          if (!at) misses.push(`${side}/${section.id}/${slot} ${name} is not indexed`);
          else if (at.key !== chordKeyLabel(slot)) {
            misses.push(`${side} ${name} indexed as ${at.key}, sits on ${chordKeyLabel(slot)}`);
          } else if (at.section !== section.id) {
            misses.push(`${side} ${name} indexed under ${at.section}, sits in ${section.id}`);
          }
        }
      });
    }
  }
  check(
    "every object a shipped layout binds can be found by the name the sidebar uses",
    misses.length === 0,
    misses.length ? misses.slice(0, 3).join("; ") : `${Object.keys(DEFAULT_CHORDS).length} sides, every id on its own key`
  );
}

// A superweapon is stored as `sw:NukeSpecial` and arrives on the sidebar as a
// rules object whose name is `NukeSpecial`. Indexing the stored form would put a
// badge on nothing at all, and nothing would say so.
{
  const sw = SUPERWEAPONS[0];
  const map = chordBadges({ Allied: { structures: { 0: sw.id } } }, "Allied");
  check(
    "a superweapon is indexed under the name the client gives it, not the stored `sw:` form",
    map.has(sw.name) && !map.has(sw.id) && map.get(sw.name).key === "Q",
    `${sw.id} → ${sw.name} on ${map.get(sw.name) ? map.get(sw.name).key : "nothing"}`
  );
}

// Both halves of a country pair, because only one of them is ever on the
// sidebar and which one is the country's business.
{
  const pair = VARIANTS.find((variant) => variant.ids.length === 2 && !chordIsSuperWeapon(variant.ids[1]));
  const map = chordBadges({ Soviet: { infantry: { 4: pair.ids } } }, "Soviet");
  check(
    "both ids of a country pair carry the same key",
    pair.ids.every((id) => map.get(id) && map.get(id).key === "T"),
    `${pair.ids.join(" / ")} → ${map.get(pair.ids[0]) ? map.get(pair.ids[0]).key : "nothing"}`
  );
}

// An override is what the options page writes, and a badge that ignored it
// would name the key the user has just moved away from.
{
  const map = chordBadges({ Allied: { structures: { 0: "GAWEAP" } } }, "Allied");
  check(
    "a user's override moves the badge with the key",
    map.get("GAWEAP") && map.get("GAWEAP").key === "Q" && map.get("GAWEAP").section === "structures",
    `GAWEAP → ${map.get("GAWEAP") ? map.get("GAWEAP").key : "nothing"}`
  );
}

// --- canvas pixels to viewport pixels -----------------------------------------
//
// The client floors its canvas at 800×600 and lets the browser scale the
// overflow to fit. So the canvas's own pixels and the pixels a DOM box is placed
// in are the same size only while the window is big enough — which is exactly
// when a bug here would not show.
{
  const rect = { left: 100, top: 50, width: 800, height: 600 };
  const box = chordScreenBox({ x: 740, y: 12, width: 60, height: 48 }, rect, { width: 800, height: 600 });
  check(
    "a canvas the size of its own box places a badge at the offset, unscaled",
    box.left === 840 && box.top === 62 && box.width === 60 && box.height === 48 && box.scale === 1,
    `left ${box.left}, top ${box.top}, ${box.width}×${box.height}`
  );
}
{
  // The window is 400×300; the client renders 800×600 anyway and the browser
  // halves it. A cameo at canvas x=740 is 370px into the box, not 740.
  const rect = { left: 0, top: 0, width: 400, height: 300 };
  const box = chordScreenBox({ x: 740, y: 100, width: 60, height: 48 }, rect, { width: 800, height: 600 });
  check(
    "a canvas larger than its box scales the badge down with it",
    box.left === 370 && box.top === 50 && box.width === 30 && box.height === 24 && box.scale === 0.5,
    `left ${box.left} (740 unscaled would be off the 400px box by ${740 - 400}px)`
  );
}
{
  const box = chordScreenBox({ x: 0, y: 0, width: 10, height: 10 }, { left: 0, top: 0, width: 400, height: 600 }, { width: 800, height: 600 });
  check(
    "text is sized by the smaller axis, so an unevenly scaled box never overflows it",
    box.scale === 0.5,
    `x by ${400 / 800}, y by ${600 / 600}, text by ${box.scale}`
  );
}
{
  const box = chordScreenBox({ x: 5, y: 5, width: 10, height: 10 }, { left: 3, top: 4, width: 100, height: 100 }, null);
  check(
    "with no canvas size to compare against it places rather than throwing",
    box.left === 8 && box.top === 9 && box.scale === 1,
    "falls back to 1:1"
  );
}

// --- what the badge layer must not do -----------------------------------------
//
// It sits on top of the one thing in the client you have to be able to click.
// 0.72.0 took the plate off the letter: a black box with a yellow edge is our
// furniture sitting on the game's. The plate was doing a job though -- a yellow
// glyph is invisible on a bright cameo -- so the outline that replaced it is not
// decoration and must not be tidied away.
// The rule as a slice of text, by hand: a regex for a CSS block wants
// escapes, and every layer between here and the file eats one.
const cssRule = (name) => {
  const at = css.indexOf("." + name + " {");
  if (at < 0) return "";
  const end = css.indexOf("}", at);
  return end < 0 ? "" : css.slice(at, end);
};
check(
  "the key badge has no plate, and has the outline that replaced it",
  !!cssRule("cdc-key-badge") &&
    !/background:/.test(cssRule("cdc-key-badge")) &&
    /text-shadow:/.test(cssRule("cdc-key-badge")) &&
    /-1px -1px 0/.test(cssRule("cdc-key-badge")),
  "no background, an eight-direction 1px outline instead"
);
check(
  "and the tab badge carries no plate either",
  !!cssRule("cdc-key-tab") && !/background:/.test(cssRule("cdc-key-tab")),
  "the two kinds of badge look like each other"
);

check(
  "a badge never takes the mouse",
  /\.cdc-key-badge[\s\S]{0,400}pointer-events: none/.test(css) &&
    !/cdc-key-badge[\s\S]{0,600}pointer-events\s*=\s*"auto"/.test(companion),
  "pointer-events: none in the stylesheet, and companion.js never turns them back on"
);

// The HUD is destroyed and rebuilt on every viewport change, so an instance
// captured once is a set of coordinates for a sidebar that no longer exists.
check(
  "the sidebar is captured on the prototype, so a rebuilt HUD is captured too",
  /SidebarCard\.prototype\.createUiObject = function/.test(companion) &&
    /SidebarTabs\.prototype\.createUiObject = function/.test(companion),
  "both components hooked where UiComponent's constructor calls them"
);
check(
  "a slot the client has not rendered yet is skipped, not badged at the canvas corner",
  /if \(!onScreen\(container\)\) continue;/.test(companion),
  "an unrendered container carries an identity matrix, which reads as a plausible (0, 0)"
);
// 0.65.0 centred the tab badge on its button, which put it on top of the only
// thing the button has. It goes in the corner the cameo badges use, and small.
check(
  "the tab badge is in the corner, not over the button's own art",
  !/left: box\.left \+ box\.width \/ 2/.test(companion) &&
    !/\.cdc-key-tab[\s\S]{0,240}transform:/.test(css),
  "no centre offset in the code, no translate in the stylesheet"
);
check(
  "and it is a smaller fraction than a cameo's, of a much smaller box",
  Number((companion.match(/BADGE_TAB_FONT = ([\d.]+)/) || [])[1]) <= 0.45,
  `BADGE_TAB_FONT = ${(companion.match(/BADGE_TAB_FONT = ([\d.]+)/) || [])[1]}`
);
check(
  "and a detached or hidden sidebar draws nothing",
  /function onScreen\(obj\)[\s\S]{0,400}node\.visible === false[\s\S]{0,200}isScene/.test(companion) &&
    /onScreen\(card\.getUiObject\(\)\)/.test(companion),
  "onScreen walks to a Scene and refuses a hidden ancestor"
);

// The whole of "handle scaling": nothing is remembered between frames, so a
// resize, a zoom and a fullscreen toggle need no detection of their own.
check(
  "every frame re-reads where the sidebar is rather than trusting last frame",
  /function badgeBoxes\(\)[\s\S]{0,400}getBoundingClientRect\(\)/.test(companion) &&
    /function worldPoint\(obj\)[\s\S]{0,400}matrixWorld/.test(companion),
  "the canvas rect and the world matrix, per frame"
);
check(
  "and the DOM is written only when those numbers change",
  /if \(signature === badgeSig\) return;/.test(companion),
  "a still sidebar costs a string compare"
);
check(
  "the loop stops when the match does",
  /function syncBadges\(\)[\s\S]{0,600}cancelAnimationFrame\(badgeFrame\)/.test(companion) &&
    /syncBadges\(\);\s*return originalDispose/.test(companion),
  "cancelled on CombatantUi#dispose"
);

// --- a superweapon key wears two faces --------------------------------------
//
// The slot orders the building until the building exists, and aims the weapon
// afterwards. The client draws those as two cameos, so the badge has to follow.
{
  const map = chordBadges({ Allied: { structures: { 0: "GACSPH" } } }, "Allied");
  chordBadgeWeapons(map, [["GACSPH", "ChronoSphereSpecial"]]);
  const at = map.get("ChronoSphereSpecial");
  check(
    "the weapon a slot's building grants answers on that slot's key",
    !!at && at.key === "Q" && at.from === "GACSPH",
    at ? `ChronoSphereSpecial → ${at.key}, from ${at.from}` : "not indexed"
  );
}
{
  // The paradrops are slots in their own right. A building that grants one must
  // not quietly move it onto its own key.
  const map = chordBadges({ Allied: { defense: { 0: "sw:ParaDropSpecial", 1: "CAAIRP" } } }, "Allied");
  const before = map.get("ParaDropSpecial").key;
  chordBadgeWeapons(map, [["CAAIRP", "ParaDropSpecial"]]);
  check(
    "a weapon that already has a key of its own keeps it",
    map.get("ParaDropSpecial").key === before && before === "Q",
    `stayed on ${map.get("ParaDropSpecial").key}, not taken by the building on W`
  );
}
{
  const map = chordBadges({}, "Allied");
  const size = map.size;
  chordBadgeWeapons(map, [["NOTONANYKEY", "SomeSpecial"], ["GAPOWR", ""]]);
  check(
    "a grant from something no key holds, or of nothing, adds nothing",
    map.size === size && !map.has("SomeSpecial"),
    "the index only grows along keys it already has"
  );
}
check(
  "the building gives the badge up once its weapon exists",
  /if \(rules\.superWeapon && weapons\.has\(rules\.superWeapon\)\) continue;/.test(companion) &&
    /function ownedSuperWeapons\(\)[\s\S]{0,600}superWeaponsTrait/.test(companion),
  "read off the player's own trait, per frame, because that is the fact that changes"
);

// --- the tile draws what the key does, not what it used to do ------------------
//
// A slot holding a superweapon building draws that building until the weapon
// exists. A weapon is not an object, so it has no Image= -> Cameo= chain to
// walk: its picture is named outright by SidebarImage= on its own rules, where
// an object's is named by Cameo= on its art. Two mechanisms read from two
// places, neither one a fallback for the other.
check(
  "a key that uses rather than orders draws the weapon's own icon",
  /cameoFace\(name, uses \? sw : null\)/.test(companion) &&
    /function cameoFace\(name, weapon\)/.test(companion),
  "the call site already knew which of the two cases it was in"
);
check(
  "and the picture comes from the client's own converter, not a second SHP decoder",
  /ImageUtils\.convertShpToCanvas\(/.test(companion) &&
    /getImages\(\)\.get\(image \+ "\.shp"\)/.test(companion),
  "engine/gfx/ImageUtils, on art the engine loaded at boot"
);
check(
  "the crop is one constant rather than a second opinion about it",
  /const CAMEO_CELL = \{ width: 60, height: 36 \}/.test(companion) &&
    !/\bcell\.width\b/.test(companion),
  "one source of truth for how much of a 60x48 cameo is not the name band"
);
check(
  "a client that cannot answer falls back to the building, not to nothing",
  /const url = own \|\| clientCameoUrl\(/.test(companion) &&
    /clientCameos\.set\(image, url\)/.test(companion),
  "the empty answer is cached too, so a missing picture is asked for once"
);

// --- the game tab asks the client, and has no sheet left to ask -------------
//
// src/cameos.js was 190 KB of RA2 sidebar artwork committed to this repo, which
// EA never licensed for redistribution. The game tab never needed it: it is by
// definition a tab with a live client in it, and that client holds the same art
// in its VFS, in the player's own localisation rather than the one baked into
// the install the sheet was generated from.
//
// This is the assertion that catches a regression to the sheet. Once the file
// is deleted a lookup through `window.__cdcCameos` is a dependency on something
// that no longer exists, and it fails the quiet way — every tile draws its id
// instead of a picture, which looks exactly like art that has not loaded yet.
check(
  "the game tab resolves a cameo through the client's art, not through a shipped sheet",
  !/__cdcCameos/.test(companion) &&
    /art\.getObject\(name, type\)/.test(companion) &&
    /new Art\(rules, Engine\.getArt\(\)\)/.test(companion),
  "id -> Cameo=, the same walk src/hq-preview.js harvests a whole sheet with"
);
check(
  "and that walk happens once, not per tile",
  /let cameoPictures = null;/.test(companion) &&
    /if \(!cameoPictures\) cameoPictures = buildCameoPictures\(\);/.test(companion),
  "the queue panel repaints on every tick a factory spends credits on"
);
check(
  "and a sw: slot is indexed under the key the layouts use, off SidebarImage=",
  /out\.set\(`sw:\$\{\(weapon && weapon\.name\) \|\| key\}`, picture\)/.test(companion),
  "slotSuperWeapon answers only for a weapon the player has; a grid draws the layout"
);
check(
  "an id the client gives no picture for draws nothing rather than a stand-in",
  /if \(!url\) \{[\s\S]{0,260}cdc-cameo-none[\s\S]{0,140}face\.textContent = name;/.test(
    companion
  ),
  "the id in text, which is what the sheet lookup did for an id it had no cell for"
);

// The bug this feature's arithmetic exposed in the code that was already here.
check(
  "the grid's own cursor maths goes through the same scaling",
  /function cursorPoint\(\)[\s\S]{0,1400}chordScreenBox\([\s\S]{0,200}ui\.canvas\.width/.test(companion) &&
    !/rect\.left \+ at\.x/.test(companion),
  "cursorPoint maps through chordScreenBox against the canvas's own size"
);

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
