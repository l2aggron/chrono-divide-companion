/**
 * The radar goes dark when the client says the player has no radar -- driven in
 * a real browser, with a real press.
 *
 *   node scripts/drive-radar.mjs            headless
 *   node scripts/drive-radar.mjs --headed   watch it happen
 *   node scripts/drive-radar.mjs --require  absent playwright is a failure, not a skip
 *
 * **Why a browser tier.** `scripts/check-radar.mjs` runs the gate and the tick's
 * flip detector against stubs, which settles what the predicate answers and how
 * often the tick re-renders. Two claims are left over that no stub can reach,
 * and the second is the one this task has been wrong about before:
 *
 *   - **the ladder actually hides the picture.** The rung sets a string; whether
 *     that string ends as `canvas.style.display = "none"` and a message the
 *     player can read is the DOM's answer, not ours;
 *   - **the input dies with the picture.** `radarPress` claims only
 *     `.cdc-radar-canvas`, so with the canvas hidden neither `e.target` nor
 *     `underCursor()` can return it and the order, the camera pan and the ping
 *     all stop. That is a chain of four "it follows"s over a real hit test, and
 *     the standing rule here is that this kind of reasoning gets asserted rather
 *     than believed -- so the same press is made twice at the same viewport
 *     point, once with the radar up and once with it down, and the difference is
 *     the measurement.
 *
 * The press with the radar UP is not decoration: it is what stops the second
 * half from being a fixture that could never have ordered anything. A driver
 * that only ever presses on a dead panel proves nothing about the gate.
 *
 * **And the press must not reach the client.** A press our panel refuses is not
 * a press the game should act on -- the client reads a stray mousedown as a
 * world command, so a fall-through would order the selection to whatever the
 * panel sits on top of. `document` gets a capture listener standing in for the
 * client's own, and it is asserted BOTH ways: silent under the panel, and
 * hearing an ordinary press elsewhere on the page.
 *
 * **How the match state is reproduced.** `channel: "chromium"` is load-bearing
 * (the headless shell loads no extensions at all), and `document.pointerLockElement`
 * is redefined to fake the lock the client holds during a match -- the same
 * fixture `scripts/drive-drag.mjs` documents at length, and the reason the
 * presses here go through `underCursor()` rather than through `e.target`.
 *
 * There is no client on this page, so the parts of it the gate reads are stubbed
 * on `__cdc.state`: a `radarTrait` whose `isDisabled()` answers a flag the
 * driver flips, the map file the render is for, and a `worldInteraction` that
 * records the order instead of executing one. The terrain render is stubbed too
 * -- one flat layer -- because what is under test is which rung of the ladder
 * fires, not what the map looks like.
 *
 * **The second subject: the panel takes the map's shape, and the scale has a
 * control that is not a corner.** Those two live here rather than in
 * `drive-drag.mjs`, which is where the plan put them, for a fixture reason worth
 * stating: `drive-drag` opens the panel with no client and no map at all, so
 * `renderRadar` never gets past "no map yet" and `radarGeo` is null for the
 * whole of that file. An aspect assertion there would have measured a panel
 * that had no aspect to follow -- the exact shape of blindness this run has
 * already found twice. This file already installs a map file the real
 * `__cdcHq.geometry()` answers for, so the aspect under test is the renderer's
 * own and not the driver's idea of one.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const headed = process.argv.includes("--headed");
const required = process.argv.includes("--require");

const ORIGIN = "https://game.chronodivide.com/";

/** How many assertions a complete run makes -- a tripwire, not bookkeeping. */
const EXPECTED = 50;

function loadPlaywright() {
  for (const from of [
    join(root, "noop.js"),
    process.execPath,
    "/usr/lib/node_modules/",
    "/usr/local/lib/node_modules/",
  ]) {
    try {
      return createRequire(from)("playwright");
    } catch {
      // Each candidate is a guess at where a global install lives; only the
      // failure of all of them is news, and the caller reports that.
    }
  }
  return null;
}

let failed = 0;
let ran = 0;
function check(name, ok, detail) {
  ran++;
  if (ok) {
    console.log(`  ok   ${name}`);
    return;
  }
  failed++;
  console.log(`  FAIL ${name}${detail === undefined ? "" : " — " + detail}`);
}

const STUB = `<!doctype html><html><head><title>stub</title></head>
<body><div id="ra2web-root" style="width:100vw;height:100vh"></div></body></html>`;

/**
 * Everything the gate and the press path read off a client, and nothing else.
 *
 * `__radar` is the driver's own handle: `down` is the flag
 * `RadarTrait#updateRadarForPlayer` would have set, and the arrays are what the
 * client would have been asked to do.
 */
async function installStubClient(page) {
  return page.evaluate(() => {
    window.__radar = { down: true, orders: [], beacons: [], reachedClient: 0 };

    // The client's own seat: it listens on `document`, so anything our window
    // capture listener swallows never gets here.
    document.addEventListener("mousedown", () => window.__radar.reachedClient++, true);

    const layer = document.createElement("canvas");
    layer.width = 1280;
    layer.height = 600;
    const lctx = layer.getContext("2d");
    lctx.fillStyle = "#2b4a2b";
    lctx.fillRect(0, 0, layer.width, layer.height);
    // One flat layer instead of a map render: the ladder's last rung only asks
    // whether the terrain arrived, and `buildRadarBacking` skips the layers a
    // map does not have anyway.
    window.__cdcHq.render = async () => ({ layers: { base: layer }, layerSize: { width: 1280, height: 600 } });

    const state = window.__cdc.state;
    state.mapFile = { fullSize: { width: 100, height: 100 }, localSize: { x: 6, y: 4, width: 80, height: 70 } };
    state.combatant = {
      isSinglePlayer: false,
      player: {
        credits: 1000,
        radarTrait: { isDisabled: () => window.__radar.down },
      },
      game: {
        map: {
          tiles: { getByMapCoords: (rx, ry) => ({ rx, ry, z: 0 }) },
        },
      },
      handleBeacon: (tile) => window.__radar.beacons.push(tile),
      worldInteraction: {
        isEnabled: () => true,
        executeMinimapClickCommand: (tile, right) => window.__radar.orders.push({ tile, right }),
      },
    };
    return true;
  });
}

/**
 * The rest of the client the parity layers read: radar rules and a tick for the
 * event pings, a minimap renderer for the size translation, the three hover
 * handlers, a pointer, and a shroud that hides everything.
 *
 * Held apart from `installStubClient` so the gate phase keeps running against
 * exactly the client it was written for. A fixture that grew under an existing
 * phase is a phase whose assertions quietly changed subject.
 *
 * The shroud is the interesting half: `isShrouded` answers true everywhere, so
 * `buildRadarCover` paints the whole picture opaque black. That is what makes
 * "the ping draws over the cover" a measurement rather than a reading of the
 * source. The cell list is filtered through the geometry's own `cellId` so the
 * mask is never written out of range -- the historical black-half bug, and the
 * thing that would otherwise fill the log with warnings.
 */
async function installParityStub(page) {
  return page.evaluate(() => {
    window.__parity = { over: 0, moves: [], out: 0, pointerType: 42 };

    const state = window.__cdc.state;
    const geo = window.__cdcHq.geometry(state.mapFile);
    const cells = [];
    for (let rx = 0; rx < 140; rx++) {
      for (let ry = 0; ry < 140; ry++) {
        const id = geo.cellId(rx, ry);
        if (id >= 0 && id < geo.cellIds) cells.push({ rx, ry, z: 0 });
      }
    }

    const ui = state.combatant;
    ui.player.radarTrait.activeEvents = [];
    ui.game.currentTick = 0;
    ui.game.rules = {
      general: {
        paradrop: { paradropPlane: "PDPLANE" },
        radar: {
          eventMinRadius: 4,
          eventSpeed: 0.5,
          eventRotationSpeed: 0.02,
          eventColorSpeed: 0.05,
          getEventVisibilityDuration: (type) => [10, 20, 30, 600, 50, 40][type],
        },
      },
    };
    ui.game.mapShroudTrait = {
      getPlayerShroud: () => ({ isShrouded: () => true, isFlagged: () => false }),
    };
    ui.game.map.tiles.getAll = () => cells;
    ui.game.map.getObjectsOnTile = () => [];
    ui.game.getWorld = () => ({ getAllObjects: () => [] });
    ui.strings = { get: (key) => key };

    Object.assign(ui.worldInteraction, {
      handleMinimapMouseOver: () => window.__parity.over++,
      handleMinimapMouseMove: (tile) => window.__parity.moves.push({ rx: tile.rx, ry: tile.ry }),
      handleMinimapMouseOut: () => window.__parity.out++,
      getCurrentHover: () => ({ gameObject: undefined, tile: undefined }),
    });

    state.pointerUi = {
      get pointerType() {
        return window.__parity.pointerType;
      },
    };

    // The client's pointer art. `mouse.shp` is real art in a real match; here
    // it only has to exist, because what is under test is that the pointer TYPE
    // reaches the drawn cursor -- whether the frame looks right at cursor size
    // is a question for a person in front of a match. `frameCanvas` is stubbed
    // rather than the SHP decoded: the renderer's own version is covered where
    // it lives, and a fake indexed bitmap here would be testing the stub.
    state.modules = state.modules || {};
    state.modules.Engine = {
      getImages: () => ({ get: (name) => (name === "mouse.shp" ? { numImages: 600, width: 40, height: 40 } : null) }),
      getPalettes: () => ({ get: () => ({ hash: "mousepal" }) }),
    };
    window.__cdcHq.frameCanvas = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 8;
      const x = c.getContext("2d");
      x.fillStyle = "#ffffff";
      x.fillRect(0, 0, 8, 8);
      return c;
    };

    // What `radarEventSpan` takes `eventMinRadius` back into map space with.
    // The client's own two numbers, off the renderer the extension captures on
    // `Minimap#setFitSize` -- without them the ping has no honest size and is
    // not drawn at all, which is a refusal this fixture must not trip.
    state.minimapObj = {
      minimapRenderer: { canvasSize: { width: 256 }, dxySize: { width: 512 } },
    };

    window.__radar.ping = (type, rx, ry, startTick) => {
      ui.player.radarTrait.activeEvents.push({ type, startTick, tile: { rx, ry, z: 0 } });
    };
    window.__radar.tick = (to) => {
      ui.game.currentTick = to;
    };
    return { cells: cells.length };
  });
}

/**
 * The panel's own canvas, read back.
 *
 * Counts pixels that are neither the black ground nor the terrain, which is
 * what a ping is here: the fixture's terrain is one flat green and the cover
 * over it is pure black, so anything else on the canvas was drawn by the layer
 * under test.
 */
async function canvasInk(page) {
  return page.evaluate(() => {
    const canvas = document.querySelector(".cdc-radar-canvas");
    if (!canvas || !canvas.width) return null;
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let lit = 0;
    let black = 0;
    let total = 0;
    let minX = Infinity;
    let maxX = -Infinity;
    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      total++;
      // Anything with a strong channel that the ground and the cover do not
      // have. The ping colours are all saturated: #ff00ff, #00ffff, #ffff00.
      if (r > 120 || b > 120 || (g > 160 && r > 120)) {
        lit++;
        const x = (i / 4) % canvas.width;
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
      } else if (r < 12 && g < 12 && b < 12) {
        black++;
      }
    }
    return { lit, black, total, covered: black / total, width: lit ? maxX - minX : 0 };
  });
}

/**
 * Put the panel where every press this file makes lands inside the viewport.
 *
 * A stored layout, not a `style.left` write. The write was inert: position is
 * derived from the stored anchor now, so the next resize, render or window
 * change puts the panel back where the anchor says -- within one frame, and in
 * the middle of whatever was being measured. It passed only because every press
 * below re-reads the box first, which made the park decoration.
 *
 * The same shape as `scripts/drive-drag.mjs`'s own `parkPanel`, and copied
 * rather than shared because these drivers are deliberately standalone: this is
 * fixture setup that goes through the same conversion every existing layout
 * goes through.
 */
async function parkPanel(page, at = { left: 200, top: 200 }) {
  await page.evaluate((where) => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ ax: "left", dx: where.left, ay: "top", dy: where.top, width: 280, stageHeight: 220 })
    );
    window.__cdc.radar(false);
    window.__cdc.radar(true);
  }, at);
}

/** The map's own shape, asked of the renderer that draws it. */
async function mapAspect(page) {
  return page.evaluate(() => {
    const geo = window.__cdcHq.geometry(window.__cdc.state.mapFile);
    return geo.cropWidth / geo.cropHeight;
  });
}

/**
 * The stage, the picture inside it, and the black between them.
 *
 * `getBoundingClientRect` throughout, never `offsetWidth`: that rounds, and the
 * margins under test here are single pixels.
 */
async function stageFit(page) {
  return page.evaluate(() => {
    const stage = document.querySelector(".cdc-radar-stage");
    const canvas = document.querySelector(".cdc-radar-canvas");
    if (!stage || !canvas) return null;
    const s = stage.getBoundingClientRect();
    const c = canvas.getBoundingClientRect();
    return {
      stage: { width: s.width, height: s.height },
      canvas: { width: c.width, height: c.height },
      margin: { x: (s.width - c.width) / 2, y: (s.height - c.height) / 2 },
    };
  });
}

/**
 * Record every mouse event the page sees, in viewport pixels.
 *
 * The lock here is faked -- only `document.pointerLockElement` is redefined --
 * so `clientX/clientY` are the real pointer's, which is what makes this an
 * honest record of where the driver pressed.
 */
async function watchMouse(page) {
  await page.evaluate(() => {
    window.__seen = [];
    if (window.__seenHooked) return;
    window.__seenHooked = true;
    for (const type of ["mousedown", "mousemove", "mouseup"]) {
      window.addEventListener(type, (e) => window.__seen.push({ type, x: e.clientX, y: e.clientY }), true);
    }
  });
}

const seenIn = (seen, boxes) =>
  seen.filter((p) =>
    boxes.some(
      (b) => b && p.x >= b.left && p.x <= b.left + b.width && p.y >= b.top && p.y <= b.top + b.height
    )
  );

/** Redefine the one property `mouseCaptured()` reads. */
async function takeLock(page) {
  return page.evaluate(() => {
    const el = document.getElementById("ra2web-root");
    Object.defineProperty(document, "pointerLockElement", { get: () => el, configurable: true });
    return !!document.pointerLockElement;
  });
}

/** A box in viewport pixels, or null when the element is gone. */
async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);
}

/** What the panel is showing: the refusal's text, and whether the picture is up. */
async function panelState(page) {
  return page.evaluate(() => {
    const empty = document.querySelector(".cdc-radar-empty");
    const canvas = document.querySelector(".cdc-radar-canvas");
    const panel = document.querySelector(".cdc-radar");
    const bar = document.querySelector(".cdc-radar-bar");
    return {
      says: empty ? empty.textContent : null,
      emptyShown: empty ? getComputedStyle(empty).display !== "none" : null,
      canvasShown: canvas ? getComputedStyle(canvas).display !== "none" : null,
      panelShown: panel ? getComputedStyle(panel).display !== "none" : null,
      barShown: bar ? getComputedStyle(bar).display !== "none" : null,
    };
  });
}

/** Flip the client's flag and wait for the tick to notice, or time out. */
async function setRadar(page, down) {
  await page.evaluate((d) => {
    window.__radar.down = d;
  }, down);
  return page
    .waitForFunction(
      (d) => {
        const canvas = document.querySelector(".cdc-radar-canvas");
        if (!canvas) return false;
        const shown = getComputedStyle(canvas).display !== "none";
        return d ? !shown : shown;
      },
      down,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
}

const centre = (r) => ({ x: r.left + Math.round(r.width / 2), y: r.top + Math.round(r.height / 2) });

/** One press, with the real mouse, at a point the driver chooses. */
async function pressAt(page, at, opts = {}) {
  await page.mouse.move(at.x, at.y);
  if (opts.alt) await page.keyboard.down("Alt");
  await page.mouse.down({ button: opts.button || "left" });
  await page.mouse.up({ button: opts.button || "left" });
  if (opts.alt) await page.keyboard.up("Alt");
  return page.evaluate(() => ({
    orders: window.__radar.orders.length,
    beacons: window.__radar.beacons.length,
    reachedClient: window.__radar.reachedClient,
    last: window.__radar.orders[window.__radar.orders.length - 1] || null,
  }));
}

async function runGateChecks(context) {
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  check("the extension loaded on the game's origin", true);

  const opened = await page.evaluate(() => {
    window.__cdc.radar(true);
    return !!document.querySelector(".cdc-radar");
  });
  check("the radar panel opens", opened === true, `got ${opened}`);

  await parkPanel(page);

  await installStubClient(page);
  const locked = await takeLock(page);
  check("the page reports a pointer lock, which is the state a match is played in", locked === true, `got ${locked}`);

  // --- the radar the client has switched off ---------------------------------
  const darkened = await page.waitForFunction(
    () => {
      const empty = document.querySelector(".cdc-radar-empty");
      return !!empty && /radar/i.test(empty.textContent) && getComputedStyle(empty).display !== "none";
    },
    null,
    { timeout: 8000 }
  ).then(() => true).catch(() => false);
  const dark = await panelState(page);
  check(
    "with the client's radar flag down the panel refuses, by name",
    darkened && /radar/i.test(dark.says || ""),
    `the panel says ${JSON.stringify(dark.says)} — nothing but the sweep tick called renderRadar, so this is the flip detector as well as the rung`
  );
  check(
    "and the picture is gone with it",
    dark.canvasShown === false,
    "a canvas still shown is a minimap the game has taken away and we kept — the maphack this panel is built not to be"
  );
  check(
    "the panel and its bar stay, because the credits on it are the player's own",
    dark.panelShown === true && dark.barShown === true,
    JSON.stringify(dark)
  );

  // --- the radar back on, which is also the control for every press below ----
  const cameBack = await setRadar(page, false);
  const up = await panelState(page);
  check(
    "the flag going back up brings the picture back, on the tick's own clock",
    cameBack && up.canvasShown === true && up.emptyShown === false,
    `${JSON.stringify(up)} — the client hides its own minimap instantly and reveals it behind an animation; the data is what is mirrored, not the cover`
  );

  const canvasBox = await rectOf(page, ".cdc-radar-canvas");
  const at = centre(canvasBox);
  const before = await page.evaluate(() => ({ ...window.__radar, orders: window.__radar.orders.length }));
  const withRadar = await pressAt(page, at);
  check(
    "a press on the live picture orders through the client's own minimap path",
    withRadar.orders === before.orders + 1 && !!withRadar.last && withRadar.last.right === false,
    `${JSON.stringify(withRadar)} — without this the refusal below would be a fixture that could never have ordered anything`
  );
  check(
    "and that press never reached the client's own listener",
    withRadar.reachedClient === 0,
    `the client reads a stray mousedown as a world command — it saw ${withRadar.reachedClient}`
  );

  // --- the same press, with the radar off ------------------------------------
  const wentDark = await setRadar(page, true);
  const off = await panelState(page);
  check(
    "the flag going down takes the picture away again",
    wentDark && off.canvasShown === false && /radar/i.test(off.says || ""),
    JSON.stringify(off)
  );

  const stillThere = await rectOf(page, ".cdc-radar");
  check(
    "and the panel is still under the cursor, so the press below really is on it",
    !!stillThere &&
      at.x >= stillThere.left &&
      at.x <= stillThere.left + stillThere.width &&
      at.y >= stillThere.top &&
      at.y <= stillThere.top + stillThere.height,
    `press at ${at.x},${at.y}, panel ${JSON.stringify(stillThere)} — a press that had fallen off the panel would prove nothing`
  );

  const afterDark = await pressAt(page, at);
  check(
    "a left press where the picture was orders nothing",
    afterDark.orders === withRadar.orders,
    `${afterDark.orders} orders, was ${withRadar.orders} — the order and the camera pan are the same client call, so both die here`
  );
  check(
    "and it does not fall through to the client either",
    afterDark.reachedClient === 0,
    `the panel is still there to be pressed on; a fall-through would order the selection to whatever it sits on top of — the client saw ${afterDark.reachedClient}`
  );

  const rightPress = await pressAt(page, at, { button: "right" });
  check(
    "a right press where the picture was orders nothing either",
    rightPress.orders === withRadar.orders && rightPress.reachedClient === 0,
    JSON.stringify(rightPress)
  );

  const pingPress = await pressAt(page, at, { button: "right", alt: true });
  check(
    "and Alt with the right button drops no beacon",
    pingPress.beacons === 0 && pingPress.reachedClient === 0,
    `${JSON.stringify(pingPress)} — the world-space gesture refuses a press over one of our boxes, and the radar's own is behind the hidden canvas`
  );

  // The control for the two "never reached the client" assertions above: a
  // listener that hears nothing anywhere would pass them both while proving
  // nothing at all.
  const away = { x: 1400, y: 800 };
  const elsewhere = await pressAt(page, away);
  check(
    "a press away from the panel does reach the client, so that listener is live",
    elsewhere.reachedClient === 1,
    `pressed at ${away.x},${away.y} and the client saw ${elsewhere.reachedClient}`
  );
  check(
    "and it ordered nothing through the radar's path",
    elsewhere.orders === withRadar.orders && elsewhere.beacons === 0,
    JSON.stringify(elsewhere)
  );

  // --- the panel takes the map's shape --------------------------------------
  //
  // The letterbox is the user's actual complaint: an arbitrary stage with the
  // render's aspect fitted inside it wastes black margin on every side. The
  // width is derived from `geometry()`'s crop now, so the two aspects are equal
  // and `placeRadarCanvas` has nothing left to letterbox -- which is why that
  // function was not touched.

  await setRadar(page, false);
  const aspect = await mapAspect(page);
  const fit = await stageFit(page);
  check(
    "the stage takes the map's own proportions",
    Math.abs(fit.stage.width - aspect * fit.stage.height) <= 1,
    `stage ${fit.stage.width}x${fit.stage.height} is ${(fit.stage.width / fit.stage.height).toFixed(4)}:1 against the map's ${aspect.toFixed(4)}:1`
  );
  check(
    "and the picture fills it, so the black margin is gone",
    Math.abs(fit.margin.x) <= 0.5 && Math.abs(fit.margin.y) <= 0.5,
    JSON.stringify(fit) + " — this is the user's complaint, measured"
  );

  // The control arm. A margin of zero could equally mean this measurement can
  // never see one, so the panel is widened by hand -- which no code path does --
  // and the same call has to report the letterbox that opens up.
  await page.evaluate(() => {
    const el = document.querySelector(".cdc-radar");
    el.style.width = el.getBoundingClientRect().width + 120 + "px";
  });
  const skewed = await stageFit(page);
  check(
    "the measurement can see a letterbox: 120px of width by hand puts one back",
    skewed.margin.x >= 55,
    JSON.stringify(skewed) + " — without this arm the zero above proves nothing about the code"
  );
  await page.evaluate(() => window.__cdc.radar(true));
  const healed = await stageFit(page);
  check(
    "and a render takes it away again, because the width is derived and not stored",
    Math.abs(healed.margin.x) <= 0.5 &&
      Math.abs(healed.stage.width - aspect * healed.stage.height) <= 1,
    JSON.stringify(healed)
  );

  // --- the scale, and the corner nobody has to aim at ------------------------
  //
  // The other half of the ask: the size can be changed without outlining the
  // panel's edges. The control is a row in the dials drawer because that drawer
  // is the one surface proven to work under a pointer lock -- `radarChromePress`
  // hand-routes a window-capture mousedown through `cursorPoint()`, and no DOM
  // slider, scroll or focus works while the client holds the mouse.

  const toggleBox = await rectOf(page, ".cdc-radar-dials-toggle");
  await pressAt(page, centre(toggleBox));
  const drawerBox = await rectOf(page, ".cdc-radar-dials");
  check(
    "the dials drawer opens on a press made while the mouse is captured",
    !!drawerBox && drawerBox.height > 0,
    JSON.stringify(drawerBox)
  );

  const track = await rectOf(page, ".cdc-dial-size .cdc-dial-track");
  const gripBox = await rectOf(page, ".cdc-radar-grip");
  check(
    "and it carries a size track many grips wide, which is the point of it",
    !!track && track.width >= 5 * gripBox.width && track.height >= gripBox.height,
    JSON.stringify(track) + ` against a ${gripBox.width}x${gripBox.height} grip`
  );

  const shown = await page.evaluate(() => document.querySelector(".cdc-dial-size .cdc-dial-value").textContent);
  check(
    "the row says how tall the picture is, not how tall it is mid-toggle",
    Math.abs(Number(shown) - healed.stage.height) <= 1,
    `the row reads ${shown} against a ${healed.stage.height}px picture — the drawer is drawn before the panel is re-sized, so a live measurement here reads the stage with the drawer's height taken out of it`
  );

  // The driver's own arithmetic, deliberately a second copy: an oracle that
  // called the code under test would agree with it however wrong it was.
  const target = { x: track.left + Math.round(track.width * 0.75), y: track.top + Math.round(track.height / 2) };
  const want = await page.evaluate((t) => {
    const box = document.querySelector(".cdc-dial-size .cdc-dial-track").getBoundingClientRect();
    const floor = 120;
    const ceiling = Math.max(floor, Math.round(window.innerHeight * 0.7));
    const f = Math.min(1, Math.max(0, (t.x - box.left) / box.width));
    return Math.round(floor + f * (ceiling - floor));
  }, target);

  const wasStored = await page.evaluate(() => JSON.parse(localStorage.getItem("cdc.radarRect")));
  await watchMouse(page);
  await pressAt(page, target);
  const gripAfter = await rectOf(page, ".cdc-radar-grip");
  const nowStored = await page.evaluate(() => JSON.parse(localStorage.getItem("cdc.radarRect")));
  const seen = await page.evaluate(() => window.__seen);
  const scaled = await stageFit(page);

  check(
    "a press three quarters along that track sets the scale the track says",
    nowStored.stageHeight === want,
    `stored ${nowStored.stageHeight}, the track's own arithmetic says ${want} — was ${wasStored.stageHeight}`
  );
  check(
    "and the picture really is that tall",
    Math.abs(scaled.stage.height - want) <= 1,
    `stage ${scaled.stage.height}, wanted ${want}`
  );
  check(
    "the scale changed with no event ever entering the grip's box",
    nowStored.stageHeight !== wasStored.stageHeight && seenIn(seen, [gripBox, gripAfter]).length === 0,
    `${seen.length} events, ${seenIn(seen, [gripBox, gripAfter]).length} of them inside ${JSON.stringify(gripBox)} or ${JSON.stringify(gripAfter)} — this is "without outlining the borders", stated as a measurement`
  );
  check(
    "and the stage still has the map's shape at the new scale",
    Math.abs(scaled.stage.width - aspect * scaled.stage.height) <= 1 && Math.abs(scaled.margin.x) <= 0.5,
    JSON.stringify(scaled)
  );

  // The control arm for the grip assertion: a recorder that saw nothing, or a
  // grip box in the wrong place, would pass it while proving nothing.
  await watchMouse(page);
  await pressAt(page, centre(gripAfter));
  const gripSeen = await page.evaluate(() => window.__seen);
  check(
    "the recorder can see the grip: a press aimed at it lands inside its box",
    seenIn(gripSeen, [gripAfter]).length > 0,
    `${gripSeen.length} events, none of them in ${JSON.stringify(gripAfter)}`
  );

  // --- the grip stays, as a coarse resize that snaps on release --------------

  const grip = await rectOf(page, ".cdc-radar-grip");
  const from = centre(grip);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + 20);
  await page.mouse.move(from.x + 120, from.y + 40);
  const midDrag = await stageFit(page);
  await page.mouse.up();
  const settled = await stageFit(page);

  check(
    "a grip drag is freeform while it is happening, so the shape can be wrong mid-drag",
    Math.abs(midDrag.stage.width - aspect * midDrag.stage.height) > 2,
    JSON.stringify(midDrag) + " — fighting a live resize is worse than a margin, which is placeRadarCanvas's own reasoning"
  );
  check(
    "and on release it snaps to the map's shape",
    Math.abs(settled.stage.width - aspect * settled.stage.height) <= 1 && Math.abs(settled.margin.x) <= 0.5,
    JSON.stringify(settled)
  );
  check(
    "the vertical half of that drag survives as the scale",
    Math.abs(settled.stage.height - scaled.stage.height - 40) <= grip.height,
    `${scaled.stage.height} then ${settled.stage.height}, a drag of 40 — the grip sets the picture's height and the width follows the map`
  );

  // --- a map change re-derives the shape and keeps the scale -----------------
  //
  // The property that makes `stageHeight` the right thing to store: the scale
  // the user chose outlives the map it was chosen on.

  const beforeMap = await page.evaluate(() => JSON.parse(localStorage.getItem("cdc.radarRect")));
  await page.evaluate(() => {
    window.__cdc.state.mapFile = {
      fullSize: { width: 100, height: 100 },
      localSize: { x: 6, y: 4, width: 40, height: 80 },
    };
    window.__cdc.radar(true);
  });
  const swapped = await page
    .waitForFunction(
      (was) => {
        const c = document.querySelector(".cdc-radar-canvas");
        return !!c && getComputedStyle(c).display !== "none" && Math.abs(c.getBoundingClientRect().width - was) > 2;
      },
      settled.canvas.width,
      { timeout: 8000 }
    )
    .then(() => true)
    .catch(() => false);
  const tallAspect = await mapAspect(page);
  const tallFit = await stageFit(page);
  const afterMap = await page.evaluate(() => JSON.parse(localStorage.getItem("cdc.radarRect")));

  check(
    "the next map re-derives the width from its own shape",
    swapped && Math.abs(tallFit.stage.width - tallAspect * tallFit.stage.height) <= 1 && Math.abs(tallAspect - aspect) > 0.5,
    `${JSON.stringify(tallFit)} at ${tallAspect.toFixed(4)}:1, was ${aspect.toFixed(4)}:1`
  );
  check(
    "and the scale, the anchor and the pinned edge come through it untouched",
    Math.abs(tallFit.stage.height - settled.stage.height) <= 1 &&
      afterMap.stageHeight === beforeMap.stageHeight &&
      afterMap.ax === beforeMap.ax &&
      afterMap.dx === beforeMap.dx,
    `${JSON.stringify(beforeMap)} then ${JSON.stringify(afterMap)} — the scale is what the user chose, and it must not be a property of the map`
  );

  const EXPECTED_QUIET = /SystemJS not on the page/;
  const warned = logs.filter((l) => /could not|unavailable|failed/i.test(l) && !EXPECTED_QUIET.test(l));
  check(
    "the panel's own log reports no missing hook beyond the absent client",
    warned.length === 0,
    warned.join(" | ")
  );

  await page.close();
}

/**
 * The parity layers, in a browser: the event pings, the hover handshake and the
 * cover the panel wears when the game takes the radar away.
 *
 * A phase of its own, against its own fixture -- see `installParityStub`.
 */
async function runParityChecks(context) {
  const page = await context.newPage();
  await page.goto(ORIGIN + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc && !!window.__cdcHq, null, { timeout: 20000 });
  await parkPanel(page);
  await installStubClient(page);
  await installParityStub(page);
  await page.evaluate(() => {
    window.__radar.down = false;
    window.__cdc.radar(false);
    window.__cdc.radar(true);
  });
  await page.waitForFunction(() => {
    const c = document.querySelector(".cdc-radar-canvas");
    return c && getComputedStyle(c).display !== "none";
  }, null, { timeout: 20000 });

  // --- the event pings ---

  // Long enough for a shroud sweep to be owed: the mask is what the cover is
  // built from, and the first sweep after the panel opens is on a deadline
  // rather than immediate. Measuring before it lands reports a picture with no
  // cover in it, which is exactly the fixture that would make the assertion
  // below meaningless.
  await page.waitForTimeout(600);
  const quiet = await canvasInk(page);
  check(
    "with no event the picture carries no ping",
    quiet && quiet.lit === 0,
    `${quiet && quiet.lit} lit pixels before anything happened — the control arm, without which every count below proves nothing`
  );

  await page.evaluate(() => window.__radar.ping(3, 60, 60, 0));
  await page.waitForTimeout(300);
  const born = await canvasInk(page);
  check(
    "a radar event puts a ping on the picture",
    born && born.lit > 0,
    `${born && born.lit} lit pixels — BaseUnderAttack, drawn from the player's own trait`
  );

  check(
    "and it is drawn over a cover that hides the entire map",
    born && born.lit > 0 && quiet.covered > 0.98,
    `the fixture's shroud answers isShrouded true for every cell, so buildRadarCover painted ${quiet && (quiet.covered * 100).toFixed(1)}% of the canvas opaque black — and ${born && born.lit} ping pixels are on top of it. Both halves matter: without the first this measures a picture with no cover in it`
  );

  await page.waitForTimeout(1200);
  const shrunk = await canvasInk(page);
  check(
    "it shrinks as it ages",
    shrunk && shrunk.lit > 0 && shrunk.width < born.width,
    `${born && born.width}px across at birth and ${shrunk && shrunk.width}px a second later`
  );

  await page.evaluate(() => window.__radar.tick(600));
  await page.waitForTimeout(300);
  const expired = await canvasInk(page);
  check(
    "and it expires on the engine's clock, not the wall's",
    expired && expired.lit === 0,
    `${expired && expired.lit} lit pixels once currentTick passed the visibility duration — the entry is still sitting in activeEvents, so nothing but our own cull can have removed it`
  );

  await page.waitForTimeout(300);
  const stayed = await canvasInk(page);
  check(
    "and does not come back while the trait still carries the entry",
    stayed && stayed.lit === 0,
    `${stayed && stayed.lit} lit pixels a tick later`
  );

  // --- the blackout covers the pings too ---

  await page.evaluate(() => {
    window.__radar.tick(0);
    // A different tile, deliberately. The expired entry is still sitting in
    // activeEvents and its key is still in the seen index -- which is what
    // stops it respawning -- so a second event at the same tile and start tick
    // is the same event and must be ignored.
    window.__radar.ping(3, 70, 70, 0);
    window.__radar.down = true;
  });
  await page.waitForTimeout(400);
  const dark = await page.evaluate(() => ({
    dark: document.querySelector(".cdc-radar").classList.contains("cdc-radar-dark"),
    canvas: getComputedStyle(document.querySelector(".cdc-radar-canvas")).display,
  }));
  check(
    "the panel wears the cover when the game takes the radar away",
    dark.dark === true && dark.canvas === "none",
    `class ${dark.dark}, canvas ${dark.canvas} — the class is what lets the stylesheet say "down" instead of "blank", and the canvas stays hidden underneath it`
  );

  await page.evaluate(() => {
    window.__radar.down = false;
  });
  await page.waitForTimeout(400);
  const returned = await page.evaluate(() => ({
    dark: document.querySelector(".cdc-radar").classList.contains("cdc-radar-dark"),
    canvas: getComputedStyle(document.querySelector(".cdc-radar-canvas")).display,
  }));
  check(
    "and takes it off again when the radar comes back",
    returned.dark === false && returned.canvas !== "none",
    `class ${returned.dark}, canvas ${returned.canvas}`
  );

  const survived = await canvasInk(page);
  check(
    "a ping that started during the blackout is still running when it lifts",
    survived && survived.lit > 0,
    `${survived && survived.lit} lit pixels — the events are collected on the dark ticks too, which is what the client's covered-then-uncovered minimap does`
  );

  // --- the hover handshake ---

  await takeLock(page);
  const box = await rectOf(page, ".cdc-radar-canvas");
  await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
  await page.waitForTimeout(200);
  const hovered = await page.evaluate(() => ({ ...window.__parity, moves: window.__parity.moves.length }));
  check(
    "moving onto the picture tells the client its minimap is hovered",
    hovered.over === 1 && hovered.moves > 0,
    `${hovered.over} mouse-overs and ${hovered.moves} moves — the client sets isMinimapHover on the first and resolves the tile on every one`
  );

  const dressed = await page.evaluate(() => {
    const el = document.querySelector(".cdc-cursor");
    return el ? el.dataset.pointer || "" : "no cursor";
  });
  check(
    "and the drawn cursor wears the pointer type the client just set",
    dressed === "42",
    `data-pointer ${dressed} — MoveMini, read back off the client's own Pointer rather than decided here`
  );

  const readout = await page.evaluate(() => document.querySelector(".cdc-radar-at").textContent);
  check(
    "the bar says which cell, and names nothing it has not scouted",
    /^\d+,\d+$/.test(readout),
    `"${readout}" — the fixture's shroud hides every cell, so a name here would be the maphack assertion failing in a browser`
  );

  await page.mouse.move(box.left - 60, box.top - 60);
  await page.waitForTimeout(200);
  const gone = await page.evaluate(() => ({
    out: window.__parity.out,
    pointer: (document.querySelector(".cdc-cursor") || {}).dataset?.pointer || "",
  }));
  check(
    "leaving the picture tells the client the mouse is out",
    gone.out === 1,
    `${gone.out} mouse-outs — a hover flag left standing hands a stale minimap tile to whatever the next click executes`
  );

  check(
    "and the cursor goes back to its own shape",
    gone.pointer === "",
    `data-pointer "${gone.pointer}"`
  );

  await page.mouse.move(box.left + box.width / 2, box.top + box.height / 2);
  await page.waitForTimeout(200);
  await page.evaluate(() => window.__cdc.radar(false));
  await page.waitForTimeout(200);
  const closed = await page.evaluate(() => window.__parity.out);
  check(
    "closing the panel while hovering is a mouse-out too",
    closed === 2,
    `${closed} mouse-outs — the cursor never moved, so nothing else would have told the client the hover ended`
  );

  await page.close();
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    const how = required ? "FAIL" : "SKIP";
    console.log(`${how}: playwright is not installed globally — this tier did not run.`);
    console.log("      npm i -g playwright && npx playwright install chromium");
    return required ? 1 : 0;
  }

  const profile = mkdtempSync(join(tmpdir(), "cdc-radar-"));
  try {
    await phase(playwright, profile, runGateChecks);
    await phase(playwright, profile, runParityChecks);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }

  if (ran !== EXPECTED) {
    failed++;
    console.log(`  FAIL the run is incomplete — ${ran} assertions ran, ${EXPECTED} expected`);
  }
  console.log(`\n${ran - failed}/${ran} passed`);
  return failed ? 1 : 0;
}

async function phase(playwright, profile, body, options = {}) {
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    rmSync(join(profile, lock), { recursive: true, force: true });
  }
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !headed,
    viewport: { width: 1920, height: 1080 },
    timeout: 60000,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    ...options,
  });
  await context.route("**/*", (route) =>
    route.request().url().startsWith(ORIGIN)
      ? route.fulfill({ status: 200, contentType: "text/html", body: STUB })
      : route.abort()
  );
  try {
    await body(context);
  } catch (e) {
    failed++;
    console.log(`  FAIL the phase threw — ${e && e.message ? e.message.split("\n")[0] : e}`);
  } finally {
    await Promise.race([context.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
  }
}

process.exit(await main());
