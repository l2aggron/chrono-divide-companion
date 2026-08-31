/**
 * Drive the sidebar collapse out of src/companion.js — the file as shipped —
 * against a stand-in for the client's HUD.
 *
 *   node scripts/check-hud-collapse.mjs
 *
 * The collapse is the one feature here that **moves the client's own objects**
 * rather than drawing over them, and every way it can go wrong is silent: a
 * power bar left inside the container that was just hidden reads as "the bar
 * vanished", a reparent run twice leaves the bar orphaned on a HUD nobody is
 * looking at, and a world viewport that keeps the sidebar's width back after the
 * sidebar returns paints the strip with the renderer's clear colour. None of
 * that throws, and none of it shows up anywhere but in a match.
 *
 * The other half of the feature is what it does *not* do. With the collapse off
 * and never switched on, `applySidebar` writes nothing back at all — the client
 * hides the sidebar for reasons of its own (the game menu, a cinematic), and a
 * `setVisible(true)` on every HUD build would undo them from underneath it. That
 * is a property no position assertion can see, so the stand-ins below count
 * every write they receive and the first check spends them on nothing.
 *
 * So the checks below drive the extension's own functions — through the hooks it
 * installs, not through copies — and read the positions and the parents back off
 * the tree afterwards. Nothing here asserts that a function was called: a call
 * that moved nothing is the defect.
 *
 * The stand-ins are the client's shape, taken from the doc comment on
 * "Collapsing the sidebar" in src/companion.js: the sidebar's own container
 * carries no `ref`, holds a sprite batch, and the power bar is inside *that* —
 * two levels down, so a check that assumed the bar was a direct child of the box
 * would pass on a tree the client does not build.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "..", "src", "companion.js"), "utf8");

// --- the page ---------------------------------------------------------------
//
// The smallest browser companion.js will load in, plus the two things this
// feature needs that the spawn-marker check does not: a `localStorage` for the
// preference, and a window listener list, because the only way in to
// `toggleSidebar` from outside is the keydown listener the file installs. That
// is the honest route anyway — it exercises the hotkey ladder along with the
// collapse.

const element = () => ({
  width: 0,
  height: 0,
  getContext: () => null,
  style: { setProperty() {} },
  dataset: {},
  classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
  append() {},
  appendChild() {},
  insertBefore() {},
  remove() {},
  setAttribute() {},
  removeAttribute() {},
  addEventListener() {},
  querySelector: () => null,
  querySelectorAll: () => [],
});

const document = {
  createElement: element,
  head: element(),
  body: element(),
  documentElement: element(),
  addEventListener() {},
  dispatchEvent() {},
  querySelector: () => null,
  querySelectorAll: () => [],
  getElementById: () => null,
};

// The key the collapse remembers itself under. Written out here rather than
// read from the source: a check that takes the name from the file it is checking
// cannot notice the name changing.
const SIDEBAR_KEY = "cdc.sidebarCollapsed";

const store = new Map();
const localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};

const listeners = new Map();

const window = {
  document,
  localStorage,
  addEventListener(type, fn) {
    if (typeof fn !== "function") return;
    if (!listeners.has(type)) listeners.set(type, []);
    listeners.get(type).push(fn);
  },
  removeEventListener() {},
  postMessage() {},
  requestAnimationFrame() {},
  cancelAnimationFrame() {},
  navigator: { userAgent: "node" },
  location: { href: "" },
};
window.window = window;

// --- the client -------------------------------------------------------------

/**
 * `gui/UiObject`, as much of it as the collapse touches.
 *
 * `getRenderableContainer().getChildren()` is the only way the extension reads
 * the tree — it never indexes `getChildren()` by position, because the client's
 * jsx gives the sidebar's box no `ref` and an index would be a guess — so that
 * is the accessor the stand-in has to answer for. `add`/`remove` keep the list
 * honest: a remove that left the child in place would make every reparent
 * assertion below pass while the real one did nothing.
 */
class UiObject {
  constructor(name) {
    this.name = name;
    this.children = [];
    this.visible = true;
    this.position = { x: 0, y: 0 };
    this.adds = 0;
    this.removes = 0;
    // Every call that changes something the client owns, so "left alone" can be
    // asserted as a number rather than by listing the fields that did not move.
    this.writes = 0;
    this.visibleCalls = [];
  }
  getRenderableContainer() {
    return { getChildren: () => this.children };
  }
  add(child) {
    this.writes++;
    this.adds++;
    if (!this.children.includes(child)) this.children.push(child);
  }
  remove(child) {
    this.writes++;
    this.removes++;
    const at = this.children.indexOf(child);
    if (at >= 0) this.children.splice(at, 1);
  }
  setVisible(on) {
    this.writes++;
    this.visibleCalls.push(!!on);
    this.visible = !!on;
  }
  isVisible() {
    return this.visible;
  }
  setPosition(x, y) {
    this.writes++;
    this.position = { x, y };
  }
  getPosition() {
    return this.position;
  }
  get3DObject() {
    return { position: { x: this.position.x, y: this.position.y, z: 0 }, visible: this.visible };
  }
  getHtmlContainer() {
    return null;
  }
}

/** A `UiComponent`: props the client laid it out from, plus the object it built. */
class Component {
  constructor(props, object) {
    this.props = props;
    this.object = object;
  }
  getUiObject() {
    return this.object;
  }
}

const VIEWPORT = { x: 0, y: 0, width: 1920, height: 1080 };
const SIDEBAR_WIDTH = 160;
const POWER = { x: 12, y: 40, powerImg: { width: 60 } };
const TIMERS = { x: 0, y: 300, width: 100 };

/**
 * `gui/screen/game/component/Hud`, built the way the client's jsx builds it:
 * the sidebar's own container holds a sprite batch, and the power bar is in the
 * batch. The buttons container is a second child of the HUD, a sibling of the
 * box rather than a child of it, which is why the collapse hides two things.
 */
class Hud extends UiObject {
  constructor(tag) {
    super(`hud:${tag}`);
    this.viewport = { ...VIEWPORT };
    this.sidebarWidth = SIDEBAR_WIDTH;

    this.power = new UiObject(`power:${tag}`);
    this.power.setPosition(POWER.x, POWER.y);
    this.sidebarPower = new Component(POWER, this.power);

    this.spriteBatch = new UiObject(`batch:${tag}`);
    this.spriteBatch.add(this.power);
    this.spriteBatch.add(new UiObject(`cameos:${tag}`));
    this.spriteBatch.add(new UiObject(`radar:${tag}`));

    // No `ref` on this one in the client, hence no name the extension can ask
    // for and the search that finds it instead.
    this.box = new UiObject(`sidebar:${tag}`);
    this.box.add(this.spriteBatch);

    this.sidebarButtonsContainer = new UiObject(`buttons:${tag}`);

    this.timers = new UiObject(`timers:${tag}`);
    this.timers.setPosition(VIEWPORT.width - SIDEBAR_WIDTH - TIMERS.width, TIMERS.y);
    this.superWeaponTimers = new Component(TIMERS, this.timers);

    this.add(this.box);
    this.add(this.sidebarButtonsContainer);
    this.add(this.timers);

    this.menuUp = false;
  }
  init() {
    return this;
  }
  destroy() {}
  showSidebarMenu() {
    this.menuUp = true;
  }
  hideSidebarMenu() {
    this.menuUp = false;
  }
}

/**
 * `gui/screen/game/WorldView`, with the client's own viewport formula.
 *
 * `hudGutterSize.width` is the sidebar's width as the renderer sees it — the one
 * place it leaves the HUD — so the client's answer is always a screen short of a
 * gutter, and the override's job is to give that strip back while the sidebar is
 * not on it.
 */
class WorldView {
  constructor() {
    this.hudGutterSize = { width: SIDEBAR_WIDTH, height: 0 };
    this.viewportChanges = 0;
  }
  computeWorldViewport(screen, bounds) {
    return {
      x: 0,
      y: 0,
      width: Math.min(bounds.width, screen.width - this.hudGutterSize.width),
      height: Math.min(bounds.height, screen.height),
    };
  }
  handleViewportChange() {
    this.viewportChanges++;
  }
}

// One module object for every id the file imports. `installHooks` reads each
// export by name off whatever the import resolved to, so the two names this
// check cares about are filled and the rest come back MISSING — which is what a
// page without those modules would do, and the file already narrates it.
const modules = { Hud, WorldView };

window.System = { import: () => Promise.resolve(modules) };

vm.runInContext(
  source,
  vm.createContext({
    ...window,
    window,
    document,
    localStorage,
    System: window.System,
    console: { log() {}, warn() {}, error() {}, info() {}, debug() {} },
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    Image: function Image() {},
    KeyboardEvent: class {},
    MutationObserver: class {
      observe() {}
      disconnect() {}
    },
  })
);

// `installHooks` patches the prototypes from inside a `Promise.all().then()`, so
// nothing is hooked until the microtask queue has drained.
await new Promise((resolve) => setTimeout(resolve, 0));

const { state, DEFAULT_KEYS } = window.__cdc;

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// Everything below drives the feature through those two hooks. If they did not
// install, every later assertion is asking a stand-in about itself.
if (!state.hooks.hud || !state.hooks.worldView) {
  console.error(
    `the hooks did not install (hud=${!!state.hooks.hud} worldView=${!!state.hooks.worldView}) — ` +
      "either the module names moved or this check's stand-ins no longer look like the client's"
  );
  process.exit(1);
}

/**
 * The sidebar key, pressed. The listener is the extension's own, on the window
 * in the capture phase; `isTrusted` is the gate it puts on a synthetic press, so
 * the stand-in event has to claim a hand pressed it.
 */
function pressSidebarKey() {
  const key = DEFAULT_KEYS.sidebar;
  const event = {
    code: key.code,
    keyCode: key.keyCode,
    altKey: !!key.alt,
    shiftKey: !!key.shift,
    ctrlKey: !!key.ctrl,
    metaKey: false,
    repeat: false,
    isTrusted: true,
    target: null,
    preventDefault() {},
    stopPropagation() {},
  };
  for (const fn of listeners.get("keydown") || []) fn(event);
}

/** Is `target` anywhere under `root`? The tree, not a flag. */
function under(root, target) {
  for (const child of root.getRenderableContainer().getChildren()) {
    if (child === target || under(child, target)) return true;
  }
  return false;
}

/** The object directly holding `target`, by identity. */
function parentOf(root, target) {
  for (const child of root.getRenderableContainer().getChildren()) {
    if (child === target) return root;
    const deeper = parentOf(child, target);
    if (deeper) return deeper;
  }
  return null;
}

const at = (obj) => `${obj.getPosition().x},${obj.getPosition().y}`;

/** Every write the feature has made anywhere under `root`. */
function writesIn(root) {
  let total = root.writes;
  for (const child of root.getRenderableContainer().getChildren()) total += writesIn(child);
  return total;
}

/** Forget the writes the stand-in made while building itself. */
function resetWrites(root) {
  root.writes = 0;
  root.visibleCalls = [];
  for (const child of root.getRenderableContainer().getChildren()) resetWrites(child);
}

// --- the world's viewport ---------------------------------------------------
//
// First, because calling it is also what hands the override its instance —
// `state.worldView` is captured at the call, so a collapse before this one would
// have nothing to tell the world about.

const view = new WorldView();
const SCREEN = { width: 1920, height: 1080 };
const WIDE = { width: 3000, height: 2000 }; // a map bigger than the screen
const SMALL = { width: 1000, height: 700 }; // and one that is not

const expandedWide = view.computeWorldViewport(SCREEN, WIDE).width;
check(
  "with the sidebar up the world stops a sidebar short of the screen",
  expandedWide === SCREEN.width - SIDEBAR_WIDTH,
  `${expandedWide}, expected ${SCREEN.width - SIDEBAR_WIDTH}`
);

// --- a HUD the collapse has never been switched on for -----------------------
//
// The gate that keeps this feature out of the client's way. It is not
// tidiness: the client hides its own sidebar for the game menu and for
// cinematics, so a `setVisible(true)` on every HUD build would undo that from
// underneath it, and the sidebar would come back mid-cutscene. This HUD
// therefore arrives with its sidebar already hidden by the client, and has to
// come out the far side with not one write on it.

const untouched = new Hud("untouched");
untouched.box.setVisible(false); // the client's own doing, before we ever see it
resetWrites(untouched);
const changesBeforeUntouched = view.viewportChanges;

untouched.init();

check(
  "a HUD the collapse has never been on for is not written to at all",
  writesIn(untouched) === 0,
  `${writesIn(untouched)} write(s) to objects the client owns`
);

check(
  "so a sidebar the client hid for its own reasons stays hidden",
  !untouched.box.isVisible() && parentOf(untouched, untouched.power) === untouched.spriteBatch,
  `box ${untouched.box.isVisible()}, power under ${(parentOf(untouched, untouched.power) || {}).name}`
);

check(
  "and the world view is not disturbed either",
  view.viewportChanges === changesBeforeUntouched,
  `${view.viewportChanges - changesBeforeUntouched} call(s)`
);

untouched.destroy();

// --- and one it is switched on for -------------------------------------------

const hud = new Hud("first");
hud.init();
resetWrites(hud);

const changesBeforeCollapse = view.viewportChanges;
pressSidebarKey();

// --- collapsed --------------------------------------------------------------

check(
  "collapsed, the sidebar's box and the buttons beside it are both hidden",
  !hud.box.isVisible() && !hud.sidebarButtonsContainer.isVisible(),
  `box ${hud.box.isVisible()}, buttons ${hud.sidebarButtonsContainer.isVisible()}`
);

// The reason the bar is reparented rather than left visible inside a hidden
// box: `gui/PointerEvents` gates a hit on the whole visibility chain, so a
// child of a hidden parent is not merely dimmed, it is gone. A check that read
// `power.isVisible()` would have said everything was fine.
check(
  "and the power bar is out of the hidden box entirely, not just flagged visible",
  !under(hud.box, hud.power) && parentOf(hud, hud.power) === hud,
  `still under the box: ${under(hud.box, hud.power)}`
);

check(
  "the power bar sits flush against the right edge, at its own y",
  at(hud.power) === `${VIEWPORT.width - POWER.powerImg.width},${POWER.y}`,
  `${at(hud.power)}, expected ${VIEWPORT.width - POWER.powerImg.width},${POWER.y}`
);

// The timers are not part of the sidebar and are not hidden — but they were laid
// out against its left edge, so leaving them there floats them a sidebar's width
// from the screen edge, which is the one thing this feature exists to stop.
check(
  "the superweapon timers close the gap the sidebar left",
  at(hud.timers) === `${VIEWPORT.width - TIMERS.width},${TIMERS.y}`,
  `${at(hud.timers)}, expected ${VIEWPORT.width - TIMERS.width},${TIMERS.y}`
);

check(
  "the world was told its viewport changed",
  view.viewportChanges === changesBeforeCollapse + 1,
  `${view.viewportChanges - changesBeforeCollapse} call(s)`
);

// The half of "it is a preference, not a per-match toggle" that a tab reload
// would otherwise be the only way to see. What survives a reload is this string
// and nothing else — the collapse is read back out of it on the first call of
// the next page — so asserting the write is asserting the persistence, and it is
// asserted here rather than left to somebody restarting a match.
check(
  "and the collapse is written down, so the next match starts the way this one did",
  store.get(SIDEBAR_KEY) === "1",
  `${SIDEBAR_KEY} = ${JSON.stringify(store.get(SIDEBAR_KEY) ?? null)}, expected "1"`
);

const collapsedWide = view.computeWorldViewport(SCREEN, WIDE).width;
check(
  "and it takes the sidebar's width back",
  collapsedWide === SCREEN.width,
  `${collapsedWide}, expected ${SCREEN.width}`
);

// Why the override is `min(bounds, screen)` and not `client + sidebarWidth`: on a
// map narrower than the screen the client's answer is already the map's own
// width, and adding a gutter to it would scroll the camera past the map's edge.
const collapsedSmall = view.computeWorldViewport(SCREEN, SMALL).width;
check(
  "a map narrower than the screen still stops at the map's edge",
  collapsedSmall === SMALL.width,
  `${collapsedSmall}, expected ${SMALL.width}`
);

// --- run it again, changing nothing -----------------------------------------
//
// `applySidebar` is reached from four places that cannot see each other, so it
// has to be safe to run over its own result. `Hud#init` is one of those places
// and is the shipped way to ask for it a second time.

const positionsBefore = [at(hud.power), at(hud.timers)];
const addsBefore = hud.adds;
const removesBefore = hud.spriteBatch.removes;
const changesBeforeRepeat = view.viewportChanges;

hud.init();

check(
  "applying the collapse twice moves nothing a second time",
  positionsBefore.join(" ") === [at(hud.power), at(hud.timers)].join(" ") &&
    hud.adds === addsBefore &&
    hud.spriteBatch.removes === removesBefore,
  `${hud.adds - addsBefore} extra add(s), ${hud.spriteBatch.removes - removesBefore} extra remove(s)`
);

check(
  "and leaves the sidebar hidden and the power bar shown",
  !hud.box.isVisible() && hud.power.isVisible(),
  `box ${hud.box.isVisible()}, power ${hud.power.isVisible()}`
);

check(
  "and does not nudge the world, because nothing changed",
  view.viewportChanges === changesBeforeRepeat,
  `${view.viewportChanges - changesBeforeRepeat} call(s)`
);

// --- back again -------------------------------------------------------------

const changesBeforeExpand = view.viewportChanges;
pressSidebarKey();

check(
  "expanded, the power bar is back in the batch it came out of",
  parentOf(hud, hud.power) === hud.spriteBatch,
  `parent is ${parentOf(hud, hud.power) && parentOf(hud, hud.power).name}`
);

// Written down in both directions, and that is not the same assertion twice: a
// key that stores "1" and then clears the entry would read back as "not
// collapsed" too, and would look identical here while meaning something else in
// a settings dump.
check(
  "and the expand is written down too, as a stored no rather than a missing yes",
  store.get(SIDEBAR_KEY) === "0",
  `${SIDEBAR_KEY} = ${JSON.stringify(store.get(SIDEBAR_KEY) ?? null)}, expected "0"`
);

check(
  "at the position the client's own props give it",
  at(hud.power) === `${POWER.x},${POWER.y}`,
  `${at(hud.power)}, expected ${POWER.x},${POWER.y}`
);

check(
  "with both containers showing again",
  hud.box.isVisible() && hud.sidebarButtonsContainer.isVisible(),
  `box ${hud.box.isVisible()}, buttons ${hud.sidebarButtonsContainer.isVisible()}`
);

// Which object was shown, not merely whether something was — the assertion that
// caught the one defect this file has found so far. Parking the power bar on the
// HUD makes the sidebar's box **unfindable**: `sidebarBox` names the box as the
// HUD child holding the bar, and once the bar is a HUD child itself no child
// holds it. The search then answered with the bar, so the show landed on a bar
// that was never hidden while the box stayed invisible for the rest of the
// match — a key that collapsed the sidebar once and could not bring it back,
// throwing nothing on the way. The box is cached on `powerParked` now, and this
// is what says so.
check(
  "and it is the sidebar's box that was shown, not the bar moved out of it",
  hud.box.visibleCalls.includes(true) && hud.power.visibleCalls.length === 0,
  `box ${JSON.stringify(hud.box.visibleCalls)}, power ${JSON.stringify(hud.power.visibleCalls)}`
);

check(
  "and the timers back against the sidebar's edge",
  at(hud.timers) === `${VIEWPORT.width - SIDEBAR_WIDTH - TIMERS.width},${TIMERS.y}`,
  `${at(hud.timers)}, expected ${VIEWPORT.width - SIDEBAR_WIDTH - TIMERS.width},${TIMERS.y}`
);

const expandedAgain = view.computeWorldViewport(SCREEN, WIDE).width;
check(
  "and the world gives the gutter back to the sidebar",
  expandedAgain === SCREEN.width - SIDEBAR_WIDTH,
  `${expandedAgain}, expected ${SCREEN.width - SIDEBAR_WIDTH}`
);

// The tail returns early for a collapse this feature does not own, and an expand
// off a collapse it does own is the case on the other side of that line.
check(
  "and was told to, because this expand is one the feature owns",
  view.viewportChanges === changesBeforeExpand + 1,
  `${view.viewportChanges - changesBeforeExpand} call(s)`
);

// --- the client's own sidebar menu ------------------------------------------
//
// `Hud#showSidebarMenu` renders into a child of the container the collapse
// hides, and by the time it runs the client has already taken the keyboard away
// from itself — so a collapse left on is a menu that cannot be seen and cannot
// be escaped. The lift outranks the preference for exactly as long as the menu
// is up.

pressSidebarKey(); // collapsed again
hud.showSidebarMenu();

check(
  "the client's sidebar menu lifts the collapse while it is open",
  hud.box.isVisible() &&
    hud.sidebarButtonsContainer.isVisible() &&
    parentOf(hud, hud.power) === hud.spriteBatch &&
    at(hud.power) === `${POWER.x},${POWER.y}`,
  `box ${hud.box.isVisible()}, buttons ${hud.sidebarButtonsContainer.isVisible()}, power at ${at(hud.power)}`
);

hud.hideSidebarMenu();

check(
  "and closing it puts the collapse back",
  !hud.box.isVisible() &&
    !hud.sidebarButtonsContainer.isVisible() &&
    parentOf(hud, hud.power) === hud &&
    at(hud.power) === `${VIEWPORT.width - POWER.powerImg.width},${POWER.y}`,
  `box ${hud.box.isVisible()}, power at ${at(hud.power)}`
);

// --- a rebuilt HUD ----------------------------------------------------------
//
// A viewport change destroys the HUD and builds another one, so the preference —
// not the objects — is what survives, and everything the last collapse referred
// to is a pointer into a tree that no longer exists. Putting the *old* HUD's bar
// back would be the failure that looks like nothing at all.

const oldPowerParent = parentOf(hud, hud.power);
const oldPowerAt = at(hud.power);
hud.destroy();

const rebuilt = new Hud("rebuilt");
rebuilt.init();

check(
  "a rebuilt HUD comes up already collapsed",
  !rebuilt.box.isVisible() && !rebuilt.sidebarButtonsContainer.isVisible(),
  `box ${rebuilt.box.isVisible()}, buttons ${rebuilt.sidebarButtonsContainer.isVisible()}`
);

check(
  "with its own power bar moved, not the destroyed HUD's",
  parentOf(rebuilt, rebuilt.power) === rebuilt &&
    at(rebuilt.power) === `${VIEWPORT.width - POWER.powerImg.width},${POWER.y}`,
  `${at(rebuilt.power)}, parent ${parentOf(rebuilt, rebuilt.power) && parentOf(rebuilt, rebuilt.power).name}`
);

check(
  "and the destroyed HUD left exactly as it was",
  parentOf(hud, hud.power) === oldPowerParent && at(hud.power) === oldPowerAt,
  `${at(hud.power)} was ${oldPowerAt}`
);

// --- the three lists that route a panel key ---------------------------------
//
// Text, not the vm: this is about what the source says, and a checker that
// needed a live client to answer it would never be run.
//
// A panel key travels through three hand-maintained lists — `DEFAULT_KEYS` for
// the descriptor, `panelToggles()` for the function, and the ladder in the
// keydown listener for the press — and a name missing from any one of them is a
// key that reads as bound everywhere the user can look and fires nothing.
// scripts/check-commands.mjs already holds the second against the third; the leg
// neither of them holds is the first, which is the one `matchesHotkey` reads:
// `state.keys.sidebar` undefined makes every press fall through, silently.
{
  const keyTable = source.slice(
    source.indexOf("const DEFAULT_KEYS = {"),
    source.indexOf("\n  };", source.indexOf("const DEFAULT_KEYS = {"))
  );
  const described = [...keyTable.matchAll(/^\s{4}(\w+):\s*\{/gm)].map((m) => m[1]);

  const table = /function panelToggles\(\)\s*\{\s*return \{([\s\S]{0,600}?)\};/.exec(source);
  const routed = table ? [...table[1].matchAll(/(\w+):/g)].map((m) => m[1]) : [];

  const rungs = /const hit = matchesHotkey\(e, state\.keys\.([\s\S]{0,900}?)\s*: null;/.exec(source);
  const pressed = rungs ? [...rungs[0].matchAll(/state\.keys\.(\w+)/g)].map((m) => m[1]) : [];

  if (!described.length || !routed.length || !pressed.length) {
    console.error("read no names out of one of the three lists — this check's patterns have stopped matching");
    process.exit(1);
  }

  const undescribed = routed.filter((n) => !described.includes(n));
  check(
    "every panel toggle has a key descriptor to be matched against",
    undescribed.length === 0,
    undescribed.length ? `routed but not in DEFAULT_KEYS: ${undescribed.join(", ")}` : `${routed.length} toggles`
  );

  const unpressable = routed.filter((n) => !pressed.includes(n));
  check(
    "and a rung in the keydown ladder",
    unpressable.length === 0,
    unpressable.length ? `routed but never asked at a press: ${unpressable.join(", ")}` : ""
  );

  const unrouted = pressed.filter((n) => !routed.includes(n) && described.includes(n));
  check(
    "and the ladder asks for nothing the toggle table has forgotten",
    unrouted.length === 0,
    unrouted.length ? `pressed but not routed: ${unrouted.join(", ")}` : ""
  );

  check(
    "the sidebar key is in all three",
    described.includes("sidebar") && routed.includes("sidebar") && pressed.includes("sidebar"),
    `descriptor ${described.includes("sidebar")}, toggle ${routed.includes("sidebar")}, rung ${pressed.includes("sidebar")}`
  );
}

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
