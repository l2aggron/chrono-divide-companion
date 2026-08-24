/**
 * The net readout, exercised without a browser or a match.
 *
 *   node scripts/check-net.mjs
 *
 * The panel reads five things off the client and turns them into rows, and
 * every one of those steps is invisible until a real match is running — which
 * is exactly the shape of a defect that ships. So the section is sliced out of
 * `src/companion.js` and run here against a stub client and a stub DOM: the
 * same trick `check-chords.mjs` uses on the keyboard-lock negotiation, and for
 * the same reason.
 *
 * What is worth checking, and what is not:
 *
 *   - the **bands** (green/yellow/red) are the client's own thresholds, and a
 *     panel that disagrees with the scoreboard about what a bad ping is would
 *     be worse than no colour at all;
 *   - the **order latency** is bookkeeping across two events, so it has the two
 *     failure modes bookkeeping always has: matching a turn that was never
 *     sent, and a map that grows for the length of a match;
 *   - **detach** has to release every subscription, because what is on the
 *     other end of them is a finished match — the listener counts are asserted
 *     back to zero rather than assumed;
 *   - the **ping interval** we ask the client for is the one thing this feature
 *     puts on the wire, so which rate is asked for in which state is pinned
 *     here rather than described in the README only.
 *
 * What is NOT checked here is whether the client still exposes any of it —
 * `PingMonitor#monitor`, `avgPing`, the lockstep's three events. That needs the
 * real bundle; `__cdc.probe()` and the debug panel's `net readout` row answer it
 * in the tab.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const companion = readFileSync(join(here, "..", "src", "companion.js"), "utf8");

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- the section, verbatim ----------------------------------------------------

const START = "  // --- The net readout ---";
// The memory readout was inserted between the two 0.100.0, and the slice was
// silently taking it with it — a check quietly exercising a hundred lines it
// makes no assertion about. The boundary is whatever section comes next, so
// it is named here rather than left as the last one that happened to be.
const END = "  // --- The memory readout ---";
const from = companion.indexOf(START);
const to = companion.indexOf(END);
if (from < 0 || to < 0 || to < from) {
  console.error("could not find the net readout section in companion.js — this check is out of date");
  process.exit(1);
}
const section = companion.slice(from, to);

// --- a DOM small enough to reason about ---------------------------------------

/**
 * Only what the section touches: create, append, textContent, a class-based
 * querySelector, and an `innerHTML` that understands the one shape the panel
 * writes with it. Not a DOM implementation — a stand-in whose failures are
 * loud rather than subtle.
 */
function makeEl(cls = "") {
  const el = {
    className: cls,
    children: [],
    style: {},
    title: "",
    isConnected: true,
    _text: "",
    get textContent() {
      return el._text + el.children.map((c) => c.textContent).join("");
    },
    set textContent(v) {
      el._text = String(v);
      el.children = [];
    },
    set innerHTML(html) {
      el.children = [...html.matchAll(/class="([^"]+)"/g)].map((m) => makeEl(m[1]));
      el._text = "";
    },
    append(...kids) {
      el.children.push(...kids);
    },
    remove() {
      el.isConnected = false;
    },
    querySelector(sel) {
      const want = sel.replace(/^\./, "");
      for (const kid of el.children) {
        if (kid.className.split(" ").includes(want)) return kid;
        const deep = kid.querySelector(sel);
        if (deep) return deep;
      }
      return null;
    },
    all(sel) {
      const want = sel.replace(/^\./, "");
      const out = [];
      for (const kid of el.children) {
        if (kid.className.split(" ").includes(want)) out.push(kid);
        out.push(...kid.all(sel));
      }
      return out;
    },
  };
  return el;
}

// --- the client, stubbed ------------------------------------------------------

function dispatcher() {
  const set = new Set();
  return {
    subscribe: (f) => set.add(f),
    unsubscribe: (f) => set.delete(f),
    fire: (v) => [...set].forEach((f) => f(v)),
    get count() {
      return set.size;
    },
  };
}

/**
 * The client's own `network/gameopt/LoadInfoParser`, in the six fields it
 * parses. Reproduced rather than imported (there is no client here), which
 * makes this the place the field names the panel reads are pinned: `name`,
 * `ping` and `status` are the three it puts on screen.
 */
class LoadInfoParser {
  parse(line) {
    const parts = line.split(",");
    const out = [];
    for (let i = 0; i < parts.length / 6; i++) {
      out.push({
        name: parts[6 * i],
        status: Number(parts[6 * i + 1]),
        loadPercent: Number(parts[6 * i + 2]),
        ping: Number(parts[6 * i + 3]),
        lagAllowanceMillis: Number(parts[6 * i + 4]),
        timeoutAt: Number(parts[6 * i + 5]) || undefined,
      });
    }
    return out;
  }
}

function makeMonitor() {
  return {
    onNewSample: dispatcher(),
    avgPing: { calculate: () => 31 },
    gameTurnMgr: {
      onActionsSent: dispatcher(),
      onActionsReceived: dispatcher(),
      onLagStateChange: dispatcher(),
      networkTurnMillis: 125,
      gameTurnMillis: 16,
    },
    gservCon: { onLoadInfo: dispatcher() },
    interval: null,
    setPingInterval(ms) {
      this.interval = ms;
    },
  };
}

// --- the harness --------------------------------------------------------------

const harness = new Function(
  "state",
  "document",
  "window",
  "localStorage",
  "performance",
  "note",
  "chordLayer",
  "makeDraggable",
  "syncOverlayMouse",
  `${section}
   return { attachNet, detachNet, toggleNet, paintNet, syncNetCadence, netQuality,
            panel: () => netEl, constants: { NET_FAST_MILLIS, NET_IDLE_MILLIS, NET_STALE_MILLIS } };`
);

function run() {
  const notes = [];
  const layer = makeEl("cdc-layer");
  let clock = 1000;
  const state = {
    modules: { LoadInfoParser },
    combatant: null,
    keys: { net: { label: "6" } },
    netVisible: false,
    net: {
      monitor: null,
      lockstep: null,
      gserv: null,
      median: null,
      rtt: null,
      rttAt: 0,
      lat: null,
      latAt: 0,
      lag: false,
      fps: null,
      players: [],
      playersAt: 0,
      sent: new Map(),
      off: [],
    },
  };
  const win = {
    requestAnimationFrame: () => 1,
    cancelAnimationFrame: () => {},
    r: undefined,
  };
  const api = harness(
    state,
    { createElement: () => makeEl() },
    win,
    { getItem: () => null, setItem: () => {} },
    { now: () => clock },
    (msg, level) => notes.push(`${level || "info"}: ${msg}`),
    () => layer,
    () => ({ begin: () => {} }),
    () => {},
    );
  return { api, state, notes, win, tick: (ms) => (clock += ms) };
}

/** Every row of the open panel, as `label value note`. */
function rows(api) {
  const body = api.panel().querySelector(".cdc-net-body");
  return body.children.map((row) => row.textContent.trim());
}

// --- the client's own bands ---------------------------------------------------

{
  const { api } = run();
  const bands = [
    [0, "good"],
    [100, "good"],
    [101, "avg"],
    [250, "avg"],
    [251, "bad"],
    [5000, "bad"],
  ];
  const wrong = bands.filter(([ms, want]) => api.netQuality(ms) !== want);
  check(
    "the ping bands are the client's own — 100 and 250, from gui/component/PingIndicator",
    wrong.length === 0,
    wrong.length ? wrong.map(([ms, want]) => `${ms} should be ${want}`).join(", ") : "0/100/101/250/251/5000 all land where the scoreboard puts them"
  );
  check(
    "a missing number is not a colour",
    api.netQuality(null) === "" && api.netQuality(undefined) === "" && api.netQuality(NaN) === "",
    "null, undefined and NaN all render uncoloured rather than as bad"
  );
}

// --- the panel with nothing attached ------------------------------------------

{
  const { api, state } = run();
  api.toggleNet(true);
  check(
    "an open panel with no match says so rather than showing zeroes",
    rows(api).join(" ").includes("no match in play"),
    rows(api).join(" | ") || "(no rows)"
  );
  check("and opening it asks the client for nothing until there is a monitor", state.net.monitor === null);
}

// --- a match's numbers --------------------------------------------------------

{
  const { api, state, tick } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  monitor.onNewSample.fire(34);
  monitor.gameTurnMgr.onActionsSent.fire(12);
  tick(118);
  monitor.gameTurnMgr.onActionsReceived.fire(12);
  state.net.fps = 59.6;
  api.paintNet();
  const text = rows(api);

  check(
    "the ping row carries the sample and the client's own median",
    text[0] === "ping34 msmedian 31",
    text[0]
  );
  check(
    "the order row is the gap between the turn going out and coming back",
    text[1] === "order118 ms",
    text[1]
  );
  check("frames are rounded, not printed to fourteen places", text[2] === "frames60 fps", text[2]);
  check(
    "the turn row names both clocks — the lobby's network turn and this match's game turn",
    text[3] === "turn125 msgame turn 16 ms",
    text[3]
  );
  check(
    "and a fast ping is drawn in the client's green",
    api.panel().querySelector(".cdc-net-value").className.includes("cdc-net-good"),
    api.panel().querySelector(".cdc-net-value").className
  );

  // The two ways the order latency can lie.
  const before = state.net.lat;
  monitor.gameTurnMgr.onActionsReceived.fire(99);
  check(
    "a turn coming back that was never sent is ignored, not timed from nothing",
    state.net.lat === before,
    `lat stayed ${Math.round(before)}ms`
  );
  for (let turn = 13; turn < 200; turn++) monitor.gameTurnMgr.onActionsSent.fire(turn);
  check(
    "and the sent-turn map is pruned, so a long match does not grow one entry per turn",
    state.net.sent.size <= 16,
    `${state.net.sent.size} entries after 188 turns`
  );
}

// --- a stale sample says so ---------------------------------------------------

{
  const { api } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  monitor.onNewSample.fire(34);
  check("a fresh sample carries no age", !/ago/.test(rows(api)[0]), rows(api)[0]);
}

{
  const { api, state } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  monitor.onNewSample.fire(34);
  state.net.rttAt = Date.now() - (api.constants.NET_STALE_MILLIS + 1000);
  api.paintNet();
  check(
    "a sample past the stale mark is labelled with its age instead of passing as current",
    /ago/.test(rows(api)[0]),
    rows(api)[0]
  );
}

// --- the players the client last fetched --------------------------------------

{
  const { api, state } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  // Two players, the second dropped: name,status,loadPercent,ping,lagAllowance,timeoutAt
  monitor.gservCon.onLoadInfo.fire("you,1,100,42,0,0,them,0,100,320,0,0");
  const players = api.panel().all("cdc-net-player").map((p) => p.textContent);
  check(
    "every player the server named gets a row, with its ping",
    players.length === 2 && players[0] === "you42 ms" && players[1].startsWith("them320 ms"),
    players.join(" | ")
  );
  check(
    "a player who is not connected is marked, not just left at their last ping",
    players[1].includes("not connected"),
    players[1]
  );
  check(
    "and a bad ping is red on a player row too, by the same bands",
    api.panel().all("cdc-net-player")[1].querySelector(".cdc-net-bad") !== null,
    api.panel().all("cdc-net-player")[1].children.map((c) => c.className).join(" ")
  );
  check(
    "the block is headed with how old the reading is, because nothing here asks for a fresh one",
    api.panel().querySelector(".cdc-net-players-head").textContent.startsWith("players ·"),
    api.panel().querySelector(".cdc-net-players-head").textContent
  );
  check("the parsed line is kept whole", state.net.players.length === 2);
}

// --- lag ----------------------------------------------------------------------

{
  const { api } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  monitor.gameTurnMgr.onLagStateChange.fire(true);
  check(
    "the client's own lag state is said out loud, not left as a frozen screen",
    rows(api).some((r) => r.includes("waiting for the other clients")),
    rows(api).join(" | ")
  );
  monitor.gameTurnMgr.onLagStateChange.fire(false);
  check(
    "and it goes away again",
    !rows(api).some((r) => r.includes("waiting")),
    rows(api).join(" | ")
  );
}

// --- what it puts on the wire -------------------------------------------------

{
  const { api, win } = run();
  const monitor = makeMonitor();
  api.attachNet(monitor);
  check(
    "with the panel shut the ping stays at the client's own idle rate",
    monitor.interval === api.constants.NET_IDLE_MILLIS,
    `${monitor.interval}ms`
  );
  api.toggleNet(true);
  check(
    "opening it asks for the same 1s the client asks for with its own panel up",
    monitor.interval === api.constants.NET_FAST_MILLIS,
    `${monitor.interval}ms`
  );
  api.toggleNet(false);
  check(
    "closing it hands the rate back",
    monitor.interval === api.constants.NET_IDLE_MILLIS,
    `${monitor.interval}ms`
  );
  win.r = { fps: true };
  api.syncNetCadence();
  check(
    "but not while the client's own panel is up — that 1s is the client's, not ours to undo",
    monitor.interval === api.constants.NET_FAST_MILLIS,
    `${monitor.interval}ms with window.r.fps set`
  );
}

// --- letting go of a finished match -------------------------------------------

{
  const { api, state } = run();
  const monitor = makeMonitor();
  api.toggleNet(true);
  api.attachNet(monitor);
  const subscribed = [
    monitor.onNewSample.count,
    monitor.gameTurnMgr.onActionsSent.count,
    monitor.gameTurnMgr.onActionsReceived.count,
    monitor.gameTurnMgr.onLagStateChange.count,
    monitor.gservCon.onLoadInfo.count,
  ];
  api.detachNet();
  const left = [
    monitor.onNewSample.count,
    monitor.gameTurnMgr.onActionsSent.count,
    monitor.gameTurnMgr.onActionsReceived.count,
    monitor.gameTurnMgr.onLagStateChange.count,
    monitor.gservCon.onLoadInfo.count,
  ];
  check(
    "attaching subscribes to all five of the client's events",
    subscribed.every((n) => n === 1),
    subscribed.join(",")
  );
  check(
    "and detaching releases every one — a listener left behind holds the whole finished match",
    left.every((n) => n === 0),
    left.join(",")
  );
  check(
    "the numbers go with them, so a menu does not show the last match's ping",
    state.net.monitor === null && state.net.rtt === null && state.net.sent.size === 0
  );

  // A second match must not double-subscribe.
  const next = makeMonitor();
  api.attachNet(next);
  api.attachNet(next);
  check(
    "and attaching twice does not subscribe twice",
    next.onNewSample.count === 1,
    `${next.onNewSample.count} listener(s) after two attaches`
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
