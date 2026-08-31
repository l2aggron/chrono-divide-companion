/**
 * What a re-run reads off a live player, driven without one.
 *
 * `src/replay-sim.js` cannot run under node -- it drives the game client, imports
 * the client's own modules and lives in a page -- but the three functions that
 * decide what a harvest *says* are pure functions of a player object, and those
 * are what a report is built out of. They are lifted from the shipped file by
 * name and run here against players made up for the purpose. A copy of the logic
 * in this file would pass while the shipped one was broken, which is the whole
 * reason it is lifted rather than reimplemented.
 *
 * Named in that file's own header since the re-run landed; it did not exist
 * until 2026-08-31, when power and build tempo were added to a sample and there
 * was nowhere to assert them.
 *
 *   node scripts/check-sim.mjs
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const js = readFileSync(join(here, "..", "src", "replay-sim.js"), "utf8");

/**
 * One `  function name(args) {` ... `  }` block out of the file.
 *
 * A miss returns null and every assertion below then reads false, so an
 * extraction that stops matching is a failing run rather than a quiet skip.
 */
const bodyOf = (re) => {
  const found = re.exec(js);
  return found ? found[1] : null;
};

const powerBody = bodyOf(/\r?\n {2}function power\(player\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);
const tempoBody = bodyOf(/\r?\n {2}function tempo\(player, queues\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);
const economyBody = bodyOf(/\r?\n {2}function economy\(player\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);
const sampleBody = bodyOf(/\r?\n {2}function sample\(game, roster, queues\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);

const power = powerBody ? new Function("player", powerBody) : null;
const tempo = tempoBody ? new Function("player", "queues", tempoBody) : null;
const economy = economyBody ? new Function("player", economyBody) : null;
const sum = (map) => {
  let total = 0;
  for (const n of (map || new Map()).values()) total += n;
  return total;
};
const sample =
  sampleBody && economy && power && tempo
    ? new Function(
        "economy",
        "sum",
        "power",
        "tempo",
        `return function sample(game, roster, queues) {${sampleBody}\n};`
      )(economy, sum, power, tempo)
    : null;

// --- players that are only what the readings ask of them ---------------------

/**
 * A base with a surplus that is browned out anyway -- a spy in a power plant.
 *
 * The numbers and the verdict disagree on purpose. `total < drain` recomputed
 * here would call this base healthy, and the client calls it Low; which of the
 * two the reading follows is the thing being asserted.
 */
const spied = {
  name: "spied",
  powerTrait: {
    power: 300,
    drain: 100,
    isLowPower: () => true,
    getBlackoutDuration: () => 47,
  },
};

/** A base genuinely short of power, with no blackout on it. */
const short = {
  name: "short",
  powerTrait: { power: 40, drain: 100, isLowPower: () => true, getBlackoutDuration: () => 0 },
};

/** An older client with the field but not the accessor. */
const oldClient = {
  name: "old",
  powerTrait: { power: 10, drain: 100, isLowPower: () => true, blackoutFrames: 3 },
};

/** A client that keeps no such trait at all. */
const traitless = { name: "traitless" };

const QUEUES = [
  ["Structures", 0],
  ["Infantry", 2],
  ["Vehicles", 3],
  ["Ships", 5],
];

/** Which factory type each queue reads, as the client maps them. */
const FACTORY_FOR = { 0: 10, 2: 12, 3: 13, 5: 15 };

const asked = [];
const builder = {
  name: "builder",
  production: {
    buildSpeedModifier: 0.62,
    getFactoryTypeForQueueType: (type) => {
      asked.push(type);
      return FACTORY_FOR[type];
    },
    // Two war factories, one barracks, one construction yard, no shipyard.
    getFactoryCount: (factory) => ({ 10: 1, 12: 1, 13: 2, 15: 0 })[factory],
  },
};
const unbuilt = { name: "unbuilt" };

const readPower = power ? power(spied) : null;
const readShort = power ? power(short) : null;
const readOld = power ? power(oldClient) : null;
const readNone = power ? power(traitless) : null;
const readTempo = tempo ? tempo(builder, QUEUES) : null;
// Taken before the sample below asks again: `asked` is a running log and the
// question here is what one reading asks for, not what two of them do.
const askedOnce = asked.slice();
const readNoTempo = tempo ? tempo(unbuilt, QUEUES) : null;

const row =
  sample &&
  sample(
    { currentTick: 1800 },
    // One player who is all three: a base with factories, a base with power,
    // and the counters a sample already carried. Named last so neither of the
    // two fixtures above lends it theirs.
    [Object.assign({}, builder, spied, { name: "builder", unitsLostByType: new Map([[2, 3]]) })],
    QUEUES
  )
    .players[0];

const checks = [
  [
    "the three readings are still in the shipped file under the names this check lifts",
    !!(powerBody && tempoBody && sampleBody),
    `power ${!!powerBody}, tempo ${!!tempoBody}, sample ${!!sampleBody}`,
  ],
  [
    "produced and consumed come back as the client keeps them",
    !!readPower && readPower.total === 300 && readPower.drain === 100,
    readPower ? `${readPower.total} produced, ${readPower.drain} drawn` : "no reading",
  ],
  [
    "low power is the client's own verdict, not total < drain recomputed here",
    !!readPower && readPower.low === true,
    readPower ? `a base producing ${readPower.total} against ${readPower.drain} reads low: ${readPower.low}` : "",
  ],
  [
    "and a blackout is told apart from a deficit, which is the only way that verdict makes sense",
    !!readPower && readPower.blackout === true && !!readShort && readShort.blackout === false,
    readPower && readShort ? `surplus+low: ${readPower.blackout}, short: ${readShort.blackout}` : "",
  ],
  [
    "a client with the frame count but no accessor is still read",
    !!readOld && readOld.blackout === true,
    readOld ? String(readOld.blackout) : "",
  ],
  [
    "a client that keeps no power trait reads as no reading, not as a base with no power",
    readNone === null,
    String(readNone),
  ],
  [
    "the build-speed modifier is taken off the client rather than recomputed from the deficit",
    !!readTempo && readTempo.speed === 0.62,
    readTempo ? String(readTempo.speed) : "",
  ],
  [
    "each queue is counted through the client's own queue-to-factory mapping",
    askedOnce.length === QUEUES.length && QUEUES.every(([, type], i) => askedOnce[i] === type),
    askedOnce.join(", "),
  ],
  [
    "and the count is per queue — two war factories are two, an unbuilt shipyard is zero",
    !!readTempo && readTempo.factories.Vehicles === 2 && readTempo.factories.Infantry === 1 && readTempo.factories.Ships === 0,
    readTempo ? JSON.stringify(readTempo.factories) : "",
  ],
  [
    "a side with no production trait reads as no reading",
    readNoTempo === null,
    String(readNoTempo),
  ],
  [
    "a sample carries both readings without dropping the counters beside them",
    !!row && !!row.power && !!row.tempo && row.name === "builder" && row.lost === 3,
    row ? `${Object.keys(row).join(", ")}` : "no sample",
  ],
];

for (const [name, ok, detail] of checks) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- what a spy did ----------------------------------------------------------

const spyBody = bodyOf(/\r?\n {2}function spyEffects\(target\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);
const spyEffects = spyBody ? new Function("target", spyBody) : null;
const effectsOf = (target) => (spyEffects ? spyEffects(target) : null);

// The four the engine branches on, one building each, plus one that is two of
// them at once -- a Soviet Battle Lab is neither, and a refinery that also
// carries a superweapon is the shape a mod makes and a name list would miss.
const refinery = { rules: { storage: 2000 } };
const reactor = { rules: { power: 200 } };
const radar = { rules: { radar: true } };
const nuke = { rules: {}, superWeaponTrait: {} };
const both = { rules: { storage: 1500, power: 100 } };
const nothing = { rules: { power: -50 } };

const spyChecks = [
  [
    "the effects rule is still in the shipped file under the name this check lifts",
    !!spyBody,
    String(!!spyBody),
  ],
  [
    "a refinery is money, a reactor is a blackout, a radar is the map",
    String(effectsOf(refinery)) === "money" &&
      String(effectsOf(reactor)) === "blackout" &&
      String(effectsOf(radar)) === "radar",
    `${effectsOf(refinery)} / ${effectsOf(reactor)} / ${effectsOf(radar)}`,
  ],
  [
    "a superweapon is read off the trait, not off the rules — no name list can find it",
    String(effectsOf(nuke)) === "superweapon",
    String(effectsOf(nuke)),
  ],
  [
    "a building that is two of them at once reports both",
    effectsOf(both).length === 2 && effectsOf(both).includes("money") && effectsOf(both).includes("blackout"),
    String(effectsOf(both)),
  ],
  [
    "a building that draws power is not a building that makes it",
    String(effectsOf(nothing)) === "",
    `[${effectsOf(nothing)}]`,
  ],
];
for (const [name, ok, detail] of spyChecks) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- handing the client a replay it cannot fetch -----------------------------

/**
 * `answerReplayFetch` with a window of its own.
 *
 * The one piece of this repo that stands in front of somebody else's network
 * call, so what it does NOT answer matters as much as what it does. Driven here
 * against a fake `window` and a fake `fetch` that records every call it is
 * allowed to pass through.
 */
const patchBody = bodyOf(/\r?\n {2}function answerReplayFetch\(\) \{\r?\n([\s\S]*?)\r?\n {2}\}\r?\n/);
const RPL = "https://replays-eu.chronodivide.com/5a41749b-26f9-4303-a69c-5938bb8b219c.rpl";

const armed = (hash) => {
  if (!patchBody) return null;
  const through = [];
  const said = [];
  const win = {
    fetch: (input) => {
      through.push(String(input));
      return Promise.resolve({ passedThrough: true });
    },
  };
  const make = new Function(
    "location",
    "window",
    "say",
    "setTimeout",
    "clearTimeout",
    "Promise",
    "Response",
    "Uint8Array",
    "HANDOVER_MILLIS",
    `return function answerReplayFetch() {${patchBody}\n};`
  )(
    { hash },
    win,
    (line) => said.push(line),
    () => 0,
    () => {},
    Promise,
    Response,
    Uint8Array,
    5000
  );
  const handOver = make();
  return { handOver, win, through, said, patched: win.fetch };
};

const onReplay = armed("#/replay/https%3A%2F%2Fx");
const onMenu = armed("#/menu");

// A page that is not a replay must be left entirely alone.
const menuUntouched = onMenu && onMenu.handOver === null && onMenu.win.fetch === onMenu.patched;

// The text arrives, then the client asks. The ordinary order.
let served3 = null;
let servedBody = "";
if (onReplay) {
  // A byte above 0x7f, which is the whole difference between the encoding the
  // client can read back and UTF-8: a `.rpl` is ASCII today, and a fixture that
  // is only ASCII cannot tell the two apart.
  onReplay.handOver("RA2TSREPL_v6\nENGINE 0.83 1\n\u00ff");
  served3 = await onReplay.win.fetch(RPL);
  // Read as bytes, not decoded as text: what the client does is
  // `String.fromCharCode` per byte, so the bytes themselves are the contract.
  if (served3 && served3.arrayBuffer) {
    servedBody = String.fromCharCode(...new Uint8Array(await served3.arrayBuffer()));
  }
}
// The same patch asked a second time: it has spent itself and gets out of the way.
const secondAsk = onReplay ? await onReplay.win.fetch(RPL) : null;
// Anything that is not the replay, on a patch that has NOT spent itself -- asked
// of the spent one it passes through whatever the URL rule says, which is a test
// of nothing. The URL is on a replay host and even ends in .rpl-ish noise, so
// only the shape of the match keeps it out.
const bystander = armed("#/replay/https%3A%2F%2Fx");
let other = null;
let otherPage = null;
if (bystander) {
  bystander.handOver("RA2TSREPL_v6\nnot for you\n");
  other = await bystander.win.fetch("https://game.chronodivide.com/config.ini");
  otherPage = await bystander.win.fetch("https://replays-eu.chronodivide.com/list.json");
}

// The other order: the client asks first, the answer comes later. The client's
// fetch has to wait rather than miss.
const racing = armed("#/replay/https%3A%2F%2Fx");
let racedBody = "";
if (racing) {
  const pending = racing.win.fetch(RPL);
  racing.handOver("RA2TSREPL_v6\nlate\n");
  const answer = await pending;
  if (answer && answer.arrayBuffer) {
    racedBody = String.fromCharCode(...new Uint8Array(await answer.arrayBuffer()));
  }
}

// And the case there is no file: the bridge says so, and the network answers.
const empty = armed("#/replay/https%3A%2F%2Fx");
let emptyAnswer = null;
if (empty) {
  empty.handOver(null);
  emptyAnswer = await empty.win.fetch(RPL);
}

const handover = [
  [
    "the fetch patch is still in the shipped file under the name this check lifts",
    !!patchBody,
    String(!!patchBody),
  ],
  [
    "a page that is not a replay keeps its own fetch, untouched",
    !!menuUntouched,
    onMenu ? `handOver ${onMenu.handOver}` : "",
  ],
  [
    "the replay URL is answered from the file, byte for byte and not as UTF-8",
    servedBody === "RA2TSREPL_v6\nENGINE 0.83 1\n\u00ff",
    JSON.stringify(servedBody),
  ],
  [
    "the answer is a real Response, because the client reads its body as a stream",
    !!served3 && served3 instanceof Response && served3.ok && !!served3.body,
    served3 ? `${served3.constructor && served3.constructor.name}, ok ${served3.ok}` : "",
  ],
  [
    "and it does not answer text/html, which the client refuses outright",
    !!served3 && /octet-stream/.test(served3.headers.get("content-type") || ""),
    served3 ? served3.headers.get("content-type") : "",
  ],
  [
    "a second ask goes to the network — this is a handover, not a cache",
    !!secondAsk && secondAsk.passedThrough === true,
    JSON.stringify(secondAsk),
  ],
  [
    "everything that is not the replay goes to the network untouched, file in hand or not",
    !!other &&
      other.passedThrough === true &&
      !!otherPage &&
      otherPage.passedThrough === true &&
      bystander.through.length === 2,
    bystander ? bystander.through.join(", ") : "",
  ],
  [
    "a client that asks before the file arrives waits for it rather than missing it",
    racedBody === "RA2TSREPL_v6\nlate\n",
    JSON.stringify(racedBody),
  ],
  [
    "and when there is no file the client's own fetch happens, once the bridge says so",
    !!emptyAnswer && emptyAnswer.passedThrough === true,
    JSON.stringify(emptyAnswer),
  ],
];
for (const [name, ok, detail] of handover) console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

if ([...checks, ...spyChecks, ...handover].some(([, ok]) => !ok)) process.exit(1);
