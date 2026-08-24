/**
 * The player recolour, exercised without a browser, a client or a match.
 *
 *   node scripts/check-colours.mjs
 *
 * The feature is one assignment — `player.color = rules.colors.get(name)` — and
 * everything that can go wrong with it is in deciding *which* name, which is
 * invisible until four people are in a lobby. So the section is sliced out of
 * `src/companion.js` and run here against a stub game: the trick
 * `check-net.mjs` uses on the net readout, for the same reason.
 *
 * What is worth checking:
 *
 *   - **the ordinals**, because they are the whole difference between this and
 *     "paint every enemy red". A blank row must hold its place: if the counter
 *     skipped it, every row below would mean a different opponent depending on
 *     what the rows above happened to say;
 *   - **only names the client has** — a colour is legal exactly when the rules
 *     define it, because a batched voxel builder resolves its palette by
 *     content hash against a list precomputed from `rules.colors` and throws
 *     inside the render loop when it misses. An invented colour is a crash, not
 *     a red, so the section is asserted never to construct one;
 *   - **the loading screen's different world** — no Player objects, no
 *     alliances, and a "self" that is a guess from the country and may be
 *     nobody. With no self there is no enemy either, and the screen must be
 *     left alone rather than painted from a guess;
 *   - **the wire**, because the harvested table crosses two files by a message
 *     type that is a string on both sides.
 *
 * What is NOT checked here is whether the client still exposes `Game#init`,
 * `Alliances#areAllied` or `rules.colors` — that needs the real bundle, and
 * `__cdc.probe()` answers it in the tab.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = (...parts) => readFileSync(join(here, "..", ...parts), "utf8");
const companion = src("src", "companion.js");
const bridge = src("src", "bridge.js");
const optionsJs = src("src", "options.js");
const optionsHtml = src("src", "options.html");

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- the section, verbatim ----------------------------------------------------

const START = "  // --- Player colours ---";
const END = "  // --- Faction labels ---";
const from = companion.indexOf(START);
const to = companion.indexOf(END);
if (from < 0 || to < 0 || to < from) {
  console.error("could not find the player colours section in companion.js — this check is out of date");
  process.exit(1);
}
const section = companion.slice(from, to);

/**
 * The section needs two things from the file around it: the state object it
 * reads preferences out of, and the log. Both are handed in, so a test can say
 * what the preference is and read back what was said about it.
 */
function load(prefs, modules = {}) {
  const state = {
    prefs: { recolour: prefs },
    modules,
    colours: { version: "test", mp: [], colors: {} },
    recolour: { off: null, painted: 0, why: "no match" },
  };
  const said = [];
  const api = new Function(
    "state",
    "note",
    `${section}\n return { state, said: null, recolourPrefs, recolourPlan, matchRoles, applyRecolour, watchAlliances, detachRecolour, loadingRecolourPlan, colourHex };`
  )(state, (message, level) => said.push({ message, level }));
  return { ...api, state, said };
}

// --- the plan -----------------------------------------------------------------

{
  const on = { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed", "Magenta"] };
  const { recolourPlan } = load(on);
  const roles = [
    { key: "me", role: "self" },
    { key: "mate", role: "ally" },
    { key: "foe1", role: "enemy" },
    { key: "foe2", role: "enemy" },
  ];
  const plan = recolourPlan(roles, load(on).recolourPrefs());
  check("the three roles take their own colours", plan.get("me") === "Gold" && plan.get("mate") === "DarkBlue");
  check(
    "and enemies take the list in order",
    plan.get("foe1") === "DarkRed" && plan.get("foe2") === "Magenta",
    `${plan.get("foe1")}, ${plan.get("foe2")}`
  );
}

{
  // The whole point of the ordinal: a blank first row must not promote the
  // second opponent into the first slot.
  const prefs = { on: true, self: "", ally: "", enemies: ["", "Magenta"] };
  const { recolourPlan, recolourPrefs } = load(prefs);
  const plan = recolourPlan(
    [
      { key: "foe1", role: "enemy" },
      { key: "foe2", role: "enemy" },
    ],
    recolourPrefs()
  );
  check("a blank enemy row holds its place", !plan.has("foe1") && plan.get("foe2") === "Magenta");
}

{
  const prefs = { on: true, self: "", ally: "", enemies: ["DarkRed"] };
  const { recolourPlan, recolourPrefs } = load(prefs);
  const plan = recolourPlan(
    [
      { key: "me", role: "self" },
      { key: "foe1", role: "enemy" },
      { key: "foe2", role: "enemy" },
      { key: "foe3", role: "enemy" },
    ],
    recolourPrefs()
  );
  check(
    "a blank role and an opponent past the end of the list keep their own colour",
    plan.size === 1 && plan.get("foe1") === "DarkRed",
    `${plan.size} entr(ies)`
  );
}

{
  const { recolourPlan, recolourPrefs } = load({ on: false, self: "Gold", ally: "", enemies: ["DarkRed"] });
  const plan = recolourPlan([{ key: "me", role: "self" }], recolourPrefs());
  check("switched off, the plan is empty however it is filled in", plan.size === 0);
}

{
  // A preference from a profile that predates the feature, or one written by
  // hand. Nothing here may throw: it decides what a match looks like.
  const { recolourPrefs } = load(undefined);
  const p = recolourPrefs();
  check(
    "a missing preference normalises to off and empty",
    p.on === false && p.self === "" && p.ally === "" && Array.isArray(p.enemies) && !p.enemies.length
  );
  const junk = load({ on: "yes", self: 7, ally: null, enemies: [1, "DarkRed"] }).recolourPrefs();
  check(
    "and junk in it normalises rather than reaching a Player",
    junk.on === false && junk.self === "" && junk.ally === "" && junk.enemies[0] === "" && junk.enemies[1] === "DarkRed"
  );
}

// --- a match ------------------------------------------------------------------

/** Only what applyRecolour touches. Colours are objects, as the client's are. */
function makeGame({ allied = [], colours = ["Gold", "DarkBlue", "DarkRed", "Magenta"] } = {}) {
  const table = new Map(colours.map((name) => [name, { name }]));
  const player = (name) => ({ name, color: { name: "asPicked:" + name } });
  const me = player("me");
  const mate = player("mate");
  const foe1 = player("foe1");
  const foe2 = player("foe2");
  const players = [me, mate, foe1, foe2];
  const subscribed = [];
  return {
    localPlayer: me,
    rules: { colors: table },
    alliances: { areAllied: (a, b) => allied.includes(a) && allied.includes(b) },
    getCombatants: () => players,
    events: {
      subscribed,
      subscribe(type, fn) {
        subscribed.push({ type, fn });
        return () => {
          const i = subscribed.findIndex((s) => s.fn === fn);
          if (i >= 0) subscribed.splice(i, 1);
        };
      },
    },
    table,
    me,
    mate,
    foe1,
    foe2,
  };
}

{
  const prefs = { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed", "Magenta"] };
  const { applyRecolour } = load(prefs);
  const game = makeGame();
  // Nobody is allied here, so the "ally" is the second opponent.
  applyRecolour(game, "test");
  check(
    "with no alliance, everyone but you is an enemy in player order",
    game.me.color === game.table.get("Gold") &&
      game.mate.color === game.table.get("DarkRed") &&
      game.foe1.color === game.table.get("Magenta"),
    `${game.mate.color.name}, ${game.foe1.color.name}`
  );
  check(
    "and an opponent past the end of the list is left as they picked",
    game.foe2.color.name === "asPicked:foe2"
  );
}

{
  const prefs = { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed", "Magenta"] };
  const { applyRecolour, state } = load(prefs);
  const game = makeGame();
  game.alliances.areAllied = (a, b) => (a === game.me && b === game.mate) || (a === game.mate && b === game.me);
  applyRecolour(game, "test");
  check(
    "an ally is painted as an ally, and the enemies renumber around them",
    game.mate.color === game.table.get("DarkBlue") &&
      game.foe1.color === game.table.get("DarkRed") &&
      game.foe2.color === game.table.get("Magenta")
  );
  check("and the count is recorded for the debug panel", state.recolour.painted === 4, String(state.recolour.painted));

  // Idempotent: the rules hand back the same object, so a second apply has
  // nothing to write. A repaint per alliance event that rewrote every player
  // would make the renderable re-remap its palette for no reason.
  applyRecolour(game, "again");
  check("applying twice writes nothing the second time", state.recolour.painted === 0, String(state.recolour.painted));
}

{
  // The trap, from the other side: a name this client does not have is skipped
  // with a warning, not guessed at and not written.
  const prefs = { on: true, self: "", ally: "", enemies: ["Chartreuse"] };
  const { applyRecolour, said } = load(prefs);
  const game = makeGame();
  applyRecolour(game, "test");
  check("a colour the rules do not define is refused", game.mate.color.name === "asPicked:mate");
  check(
    "and refusing it is said out loud",
    said.some((s) => s.level === "warn" && s.message.includes("Chartreuse")),
    said.map((s) => s.message).join(" | ") || "nothing logged"
  );
}

{
  const { applyRecolour, state } = load({ on: true, self: "Gold", ally: "", enemies: [] });
  const game = makeGame();
  game.localPlayer.isObserver = true;
  applyRecolour(game, "test");
  check(
    "an observer has no roles, so nothing is painted",
    game.me.color.name === "asPicked:me" && state.recolour.why === "observing"
  );
}

{
  const { applyRecolour, state } = load({ on: true, self: "Gold", ally: "", enemies: [] });
  const game = makeGame();
  game.rules = {};
  applyRecolour(game, "test");
  check(
    "a client with no colour table is reported, not crashed into",
    game.me.color.name === "asPicked:me" && state.recolour.why === "no colour table"
  );
}

{
  // The alliance watch: one subscription per match, released with it.
  const { applyRecolour, watchAlliances, detachRecolour } = load(
    { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed"] },
    { EventType: { AllianceChange: 46 } }
  );
  const game = makeGame();
  applyRecolour(game, "match start");
  watchAlliances(game);
  watchAlliances(game);
  check(
    "watching twice leaves one subscription, not two",
    game.events.subscribed.length === 1,
    `${game.events.subscribed.length} subscription(s)`
  );
  // An alliance forms: the former enemy takes the ally colour.
  game.alliances.areAllied = (a, b) => (a === game.me && b === game.mate) || (a === game.mate && b === game.me);
  game.events.subscribed[0].fn({ type: 46 });
  check("and an alliance forming repaints", game.mate.color === game.table.get("DarkBlue"));
  detachRecolour();
  check(
    "detaching releases it — the bus belongs to a finished match",
    game.events.subscribed.length === 0,
    `${game.events.subscribed.length} left`
  );
}

// --- the loading screen -------------------------------------------------------

{
  const prefs = { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed", "Magenta"] };
  const { loadingRecolourPlan } = load(prefs);
  const roster = [
    { name: "me", team: 1 },
    { name: "mate", team: 1 },
    { name: "foe1", team: 2 },
    { name: "foe2", team: 2 },
  ];
  const plan = loadingRecolourPlan(roster, "me");
  check(
    "teams stand in for alliances before the match exists",
    plan.get("me") === "Gold" &&
      plan.get("mate") === "DarkBlue" &&
      plan.get("foe1") === "DarkRed" &&
      plan.get("foe2") === "Magenta"
  );
}

{
  const prefs = { on: true, self: "Gold", ally: "DarkBlue", enemies: ["DarkRed"] };
  const { loadingRecolourPlan } = load(prefs);
  const plan = loadingRecolourPlan(
    [
      { name: "me", team: undefined },
      { name: "foe1", team: undefined },
    ],
    "me"
  );
  check("with no teams, everyone else is an opponent", plan.get("foe1") === "DarkRed");
}

{
  // Two players picked the same country, so decorateRows cannot say which one
  // is you. Without a self there is no enemy either.
  const prefs = { on: true, self: "Gold", ally: "", enemies: ["DarkRed"] };
  const { loadingRecolourPlan } = load(prefs);
  const plan = loadingRecolourPlan([{ name: "a", team: 1 }, { name: "b", team: 2 }], null);
  check("an unidentifiable self leaves the screen in the client's colours", plan.size === 0);
}

{
  const { colourHex, state } = load({ on: true, self: "", ally: "", enemies: [] });
  state.colours = { version: "x", mp: [], colors: { Gold: "#e8d24a" } };
  check("a name resolves to the harvested hex", colourHex("Gold") === "#e8d24a");
  check("and one that is not in the table resolves to nothing", colourHex("Chartreuse") === "");
}

// --- the trap, as source ------------------------------------------------------

{
  // Not a behaviour a stub can catch: nothing in this section may build a
  // colour. The renderer only remaps to palettes it precomputed from
  // `rules.colors`, so a constructed Color is a throw inside the render loop.
  //
  // Over the code with the prose taken out, because the prose is *about*
  // constructing a colour — it names the crash this is here to prevent, and a
  // check that failed on its own explanation would be deleted rather than
  // heeded.
  const code = section.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
  check("the section never constructs a colour of its own", !/new\s+Color\s*\(/.test(code));
  check(
    "and the only write to a player's colour comes out of the rules table",
    /const colour = colours\.get\(name\);/.test(code) && /player\.color = colour;/.test(code),
    "the assignment is not the one this check was written against"
  );
  // `=` and not `===`: the identity guard beside it reads the colour, it does
  // not write one.
  const writes = code.match(/\.color\s*=(?!=)/g) || [];
  check("with exactly one such write", writes.length === 1, `${writes.length} assignment(s)`);
}

// --- the wire -----------------------------------------------------------------

{
  check(
    "the game tab sends the colour table under a type the bridge handles",
    /type: "colour-table"/.test(companion) && /data\.type === "colour-table"/.test(bridge)
  );
  check(
    "the bridge carries it in the config push",
    /colours: \{\},/.test(bridge),
    "colours is not in the bridge's DEFAULTS, so no config push would include it"
  );
  check(
    "and the game tab reads it back",
    /data\.colours && data\.colours\.colors/.test(companion)
  );
  check(
    "the recolour is applied from Game#init, which is where roles first exist",
    /Game\.prototype\.init = function[\s\S]{0,400}applyRecolour\(this, "match start"\)/.test(companion)
  );
  // The harvest fired at boot races the client: it goes out at idle from a
  // config push, and that push routinely arrives while the splash screen is
  // still up. Match start is the attempt that lands, which is what the options
  // page's empty state tells the reader to do — so a table that is not
  // harvested there is a table whose own instructions do not work. The roster
  // has had this second attempt since 0.53.x; the colour table shipped without
  // one in 0.97.0.
  // The window is how this locates the hook, not part of what it asserts, so it
  // carries slack: the hook grows (a third harvested table was added to it in
  // 0.102.0) and this repo's CRLF checkout costs a character a line on top.
  const atMatchStart = /renderQueues\(\);[\s\S]{0,1200}?originalInit\.apply/.exec(companion);
  check(
    "both harvested tables get their second attempt at match start",
    !!atMatchStart && /sendRoster\(\);/.test(atMatchStart[0]) && /sendColours\(\);/.test(atMatchStart[0]),
    atMatchStart ? "" : "the CombatantUi#init hook is not the shape this check reads"
  );
}

// --- the options page ---------------------------------------------------------

{
  const ids = ["prefRecolour", "recolourPanel", "recolourSelf", "recolourAlly", "recolourEnemies", "recolourNote"];
  const missing = ids.filter((id) => !optionsHtml.includes(`id="${id}"`));
  check("every control options.js binds exists in the page", !missing.length, missing.join(",") || "all present");
  const unbound = ids.filter((id) => !optionsJs.includes(`getElementById("${id}")`));
  check("and every one of them is bound", !unbound.length, unbound.join(",") || "all bound");
  check(
    "the page offers names out of the harvested table rather than colours of its own",
    /function colourTable\(\)/.test(optionsJs) && !/#[0-9a-fA-F]{6}/.test(optionsJs.slice(
      optionsJs.indexOf("function fillColourPicker"),
      optionsJs.indexOf("function paintSwatch")
    ))
  );
  check(
    "the setting is off until it is turned on",
    /recolour: \{ on: false, self: "", ally: "", enemies: \[\] \}/.test(optionsJs)
  );
}

// ------------------------------------------------------------------------------

for (const line of results) console.log(line);
const failed = results.filter((r) => r.startsWith("FAIL"));
if (failed.length) {
  console.error(`\n${failed.length} of ${results.length} checks failed`);
  process.exit(1);
}
console.log(`\n${results.length} checks, all passing`);
