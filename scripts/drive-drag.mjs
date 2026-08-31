/**
 * Dragging a floating panel while the game holds the mouse, in a real browser.
 *
 *   node scripts/drive-drag.mjs            headless
 *   node scripts/drive-drag.mjs --headed   watch it happen
 *   node scripts/drive-drag.mjs --require  absent playwright is a failure, not a skip
 *
 * **Why this file exists.** The user reported, twice, that the radar cannot be
 * moved or resized inside a match. `scripts/check-radar.mjs` drives
 * `makeDraggable` against stubs and every assertion passes -- so the helper is
 * right and the fault is in the *wiring* between a press and that helper, which
 * is exactly the seam a stub tier cannot see. Static reading exonerated every
 * suspect in turn: `mouseCaptured` (the client uses the real Pointer Lock API),
 * `radarPress` (it claims only the canvas and the dials), the grip's hit test
 * (no `pointer-events: none`), and `cursorPoint` (the user confirmed the bar's
 * own rx,ry readout tracks the cursor live).
 *
 * So this drives the whole path in a browser: the real extension, the real
 * listeners, a real press.
 *
 * **How a pointer lock is faked, and why that is honest.** A real lock cannot be
 * taken without a user gesture and would freeze `clientX/clientY`, which is the
 * very thing the code under test works around. Instead `document.pointerLockElement`
 * is redefined to return an element, which is the only thing `mouseCaptured()`
 * reads. That reproduces the state *as our code sees it*: the lock branch is
 * taken everywhere, the panel's own `mousedown` bails, and `onPanelMouseDown`
 * becomes the only way into a drag -- which is the claim under test.
 *
 * The one fidelity gap is stated rather than hidden: with no client there is no
 * `state.pointerUi`, so `cursorPoint()` falls through to the position
 * `trackPointer` integrates from `movementX/movementY`. In a match it takes the
 * client's own pointer instead. Both return live viewport pixels -- the user's
 * rx,ry confirmation is what makes that substitution fair -- and every line
 * between the press and the move is the same either way.
 *
 * `channel: "chromium"` is load-bearing; the headless shell loads no extensions
 * at all. See scripts/drive-memory.mjs, which this is modelled on.
 *
 * **The second phase, and why the first was not enough.** The faked lock passes
 * every assertion, and the user still cannot move the panel -- so the fake is
 * missing whatever the fault is. It is: redefining `pointerLockElement` changes
 * what `mouseCaptured()` answers and NOTHING else, while a real lock also
 * freezes `clientX/clientY` at the point of the click and moves the delta into
 * `movementX/movementY`. Measured here, not assumed -- phase two asserts the
 * freeze, because a phase that cannot tell a real lock from the fake one proves
 * nothing that phase one did not.
 *
 * Chromium grants a real lock headlessly with no flags at all, given a real
 * click and a focused page; fullscreen likewise. So both are taken for real,
 * on `#ra2web-root` -- the element the client itself locks and fills.
 *
 * That splits the question in two, and the phase drives both arms:
 *
 *   A. **No client pointer**, the state this stub is in by default and the state
 *      a match is in whenever `Pointer.prototype.init` was never reached or the
 *      captured instance has gone stale. This arm is the whole reason the file
 *      has two: `cursorPoint()` gets no help from the client here, so whatever
 *      it answers it worked out by itself.
 *
 *      It used to assert the FAILURE, and that is what it measured: with only
 *      `state.pointer` -- `e.clientX/clientY` from the last mousemove, frozen at
 *      the lock -- every hit test asked `elementFromPoint` about the place the
 *      cursor WAS, the panel was invisible to the drag, and nothing moved.
 *      `trackPointer` now integrates `movementX/movementY` for exactly this
 *      case, so the arm asserts the fix instead. It is also the only arm that
 *      CAN: arm B installs a live client pointer and stays green with the
 *      integration ripped out.
 *   B. **With a client pointer**, the state a real match is in. `state.pointerUi`
 *      is installed through the exposed `__cdc.state` -- a canvas over the
 *      viewport and a `getPosition()` that accumulates `movementX/movementY`,
 *      which is the only live signal a locked page has and what the client's own
 *      `Pointer` does with it. If the drag works here, a real lock alone does not
 *      break it and the fault is in the client pointer being absent or stale.
 *
 * Both arms now assert the same working behaviour, from different sources: arm B
 * off the client's own pointer, arm A off our integration of the raw deltas.
 *
 * **The third phase: the backing ratio, characterised, not accused.** Both arms
 * above run at the default device scale, where a canvas's attribute pixels and
 * its CSS box are the same number -- so `chordScreenBox`'s factor is 1 and the
 * conversion inside `cursorPoint()` is the identity whatever it does. Phase
 * three runs at `deviceScaleFactor: 2` and installs a client pointer whose
 * canvas is backed at the device ratio: `canvas.width` twice `rect.width`, with
 * a `getPosition()` in CSS pixels -- which is what the client's own `Pointer`
 * holds, since it seeds from `pageX` and then adds `movementX`, and both of
 * those are CSS pixels. The phase measures that last claim rather than assuming
 * it, because it is the whole load-bearing step.
 *
 * **Read a failure in phase three as a client regression, NOT as the cause of a
 * panel refusing to move.** The shipped client does not make a device-backed
 * canvas: `Renderer.setViewportSize` reaches `THREE.WebGLRenderer.setSize(w, h)`,
 * which multiplies by a pixel ratio that defaults to 1, and `setPixelRatio` and
 * `devicePixelRatio` appear ZERO times in `dist/ra2web.min.js?v=0.83.3`, in the
 * lib patches and in the stylesheet. Live, `canvas.width === rect.width`. The
 * 2:1 canvas here is the driver's own stub, and a geometry the client never
 * produces. The independent confirmation is the drawn cursor: `onOverlayMouseMove`
 * paints at `cursorPoint()` and only when that point lands on one of our boxes --
 * the same hit test the drag uses -- and the user confirmed live, in a real match
 * under a real lock, that it draws on the cursor. A halved point could not do
 * that.
 *
 * The case is kept because it is the only thing that pins the conversion's
 * behaviour at a ratio other than 1: it shows the 1.17.9 integrated fallback is
 * HiDPI-safe (arm A), and it is the tripwire for a future client version that
 * DOES set a device pixel ratio on its canvas. If these go red on some later
 * bundle, that is a real defect and this arithmetic is the diagnosis. Today it
 * is a characterisation of a geometry that does not ship.
 *
 * Whether a real client canvas is device-backed is the one thing this file
 * cannot see -- there is no client here. `canvasSpace` in `__cdc.drag()` is the
 * one line that settles it from a live match, and the arithmetic below is what
 * says which answer means what.
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
const EXPECTED = 71;

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
<body><div id="ra2web-root"></div></body></html>`;

/** Redefine the one property `mouseCaptured()` reads. */
async function takeLock(page) {
  return page.evaluate(() => {
    const el = document.getElementById("ra2web-root");
    Object.defineProperty(document, "pointerLockElement", {
      get: () => el,
      configurable: true,
    });
    return !!document.pointerLockElement;
  });
}

/**
 * Put the panel somewhere every press this file makes lands inside the viewport.
 *
 * It used to be three lines writing `style.left` and `style.top` directly, and
 * it was a workaround: the panel opened near the right edge, the first drag
 * pushed its grip past the viewport, Playwright refuses to dispatch a mousemove
 * to a point outside it, and three assertions failed at a stale cursor position
 * — a fixture that could not reach its own subject.
 *
 * Two things changed under it. The panel can no longer BE out of reach: every
 * placement is clamped into the viewport, which is what `the panel stays inside
 * the viewport` below asserts. And a raw `style.left` write no longer holds —
 * position is derived from the stored anchor now, so the next resize or window
 * change puts the panel back where the anchor says, silently, in the middle of
 * whatever was being measured. Measured while writing this: a style-written park
 * was undone within one frame of the panel opening.
 *
 * So the park is now what a user would leave behind: a stored layout. It is
 * fixture setup rather than a workaround, and it goes through the same
 * conversion every existing layout goes through.
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

/** The panel's box, in viewport pixels. */
async function rectOf(page, selector) {
  return page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) };
  }, selector);
}

/**
 * Press at one point, move to another, release -- with the real mouse.
 *
 * Real events rather than synthetic ones on purpose: the whole question is
 * whether the listeners the extension installs on `window` see an ordinary
 * press, and a dispatched event proves less than a browser's own.
 */
async function dragBy(page, from, dx, dy) {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  // Two steps, because a drag handler that reads a delta from the *first* move
  // and one that reads it from the last are indistinguishable under one.
  await page.mouse.move(from.x + Math.round(dx / 2), from.y + Math.round(dy / 2));
  await page.mouse.move(from.x + dx, from.y + dy);
  await page.mouse.up();
}

async function runDragChecks(context) {
  const page = await context.newPage();
  const logs = [];
  page.on("console", (m) => logs.push(m.text()));
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  check("the extension loaded on the game's origin", true);

  // Open the radar through its own toggle, the way Alt+L does.
  const opened = await page.evaluate(() => {
    window.__cdc.radar(true);
    return !!document.querySelector(".cdc-radar");
  });
  check("the radar panel opens", opened === true, `got ${opened}`);

  await parkPanel(page);

  const locked = await takeLock(page);
  check("the page reports a pointer lock", locked === true, `got ${locked}`);

  const before = await rectOf(page, ".cdc-radar");
  check("the panel has a box to move", !!before && before.width > 0, JSON.stringify(before));

  // --- moving, by the bar -----------------------------------------------------
  const bar = await rectOf(page, ".cdc-radar-bar");
  await dragBy(page, { x: bar.left + Math.round(bar.width / 2), y: bar.top + Math.round(bar.height / 2) }, 60, 40);
  const moved = await rectOf(page, ".cdc-radar");

  check(
    "a press on the bar moves the panel while the mouse is captured",
    moved.left === before.left + 60 && moved.top === before.top + 40,
    `was ${before.left},${before.top} — now ${moved.left},${moved.top}`
  );

  check(
    "and moving does not resize it",
    moved.width === before.width && moved.height === before.height,
    `was ${before.width}x${before.height} — now ${moved.width}x${moved.height}`
  );

  // --- resizing, by the grip --------------------------------------------------
  const grip = await rectOf(page, ".cdc-radar-grip");
  const atResize = await rectOf(page, ".cdc-radar");
  const view = page.viewportSize();
  check(
    "the grip is still on screen for the driver to press",
    grip.left + grip.width <= view.width && grip.top + grip.height <= view.height,
    `grip at ${grip.left},${grip.top} in a ${view.width}x${view.height} viewport — a press outside it is never dispatched`
  );
  await dragBy(page, { x: grip.left + Math.round(grip.width / 2), y: grip.top + Math.round(grip.height / 2) }, 50, 30);
  const resized = await rectOf(page, ".cdc-radar");

  // Within a few pixels rather than exactly: the press starts at the grip's
  // CENTRE, and the grip travels with the corner as the box grows, so the last
  // move lands a couple of pixels beyond the nominal delta. Asserting equality
  // failed a working resize -- the tolerance is the grip's own size.
  const grewW = resized.width - atResize.width;
  const grewH = resized.height - atResize.height;
  check(
    "a press on the grip resizes the panel while the mouse is captured",
    Math.abs(grewW - 50) <= grip.width && Math.abs(grewH - 30) <= grip.height,
    `grew ${grewW}x${grewH}, wanted about 50x30`
  );

  check(
    "and resizing does not move it",
    resized.left === atResize.left && resized.top === atResize.top,
    `was ${atResize.left},${atResize.top} — now ${resized.left},${resized.top}`
  );

  // --- the same panel with a free mouse, which is the state that works --------
  await page.evaluate(() => {
    Object.defineProperty(document, "pointerLockElement", { get: () => null, configurable: true });
  });
  const freeBefore = await rectOf(page, ".cdc-radar");
  const freeBar = await rectOf(page, ".cdc-radar-bar");
  await dragBy(page, { x: freeBar.left + Math.round(freeBar.width / 2), y: freeBar.top + Math.round(freeBar.height / 2) }, -30, -20);
  const freeAfter = await rectOf(page, ".cdc-radar");

  check(
    "with a free mouse the same drag still works",
    freeAfter.left === freeBefore.left - 30 && freeAfter.top === freeBefore.top - 20,
    `was ${freeBefore.left},${freeBefore.top} — now ${freeAfter.left},${freeAfter.top}`
  );

  // --- the report the player is asked to read --------------------------------
  //
  // `__cdc.drag()` exists so a live match can say which link of the chain is
  // wrong. It is only worth asking for if it tells the truth, so it is driven
  // here against the two answers whose correctness is already established above.
  const overGrip = await rectOf(page, ".cdc-radar-grip");
  await page.evaluate(() => {
    const el = document.getElementById("ra2web-root");
    Object.defineProperty(document, "pointerLockElement", { get: () => el, configurable: true });
  });
  await page.mouse.move(overGrip.left + Math.round(overGrip.width / 2), overGrip.top + Math.round(overGrip.height / 2));
  const gripSays = await page.evaluate(() => window.__cdc.drag());
  check(
    "the drag report names a resize over the grip",
    gripSays.wouldDo === "radar: resize" && gripSays.panel === "radar" && gripSays.captured === true,
    JSON.stringify(gripSays)
  );

  const overBar = await rectOf(page, ".cdc-radar-bar");
  await page.mouse.move(overBar.left + Math.round(overBar.width / 2), overBar.top + Math.round(overBar.height / 2));
  const barSays = await page.evaluate(() => window.__cdc.drag());
  check(
    "and a move over the bar",
    barSays.wouldDo === "radar: move",
    JSON.stringify(barSays)
  );

  // The two the no-client stub always produces are named and excused; anything
  // else in that shape is news. Excusing the whole category would make this
  // assertion decorative.
  const EXPECTED_QUIET = /SystemJS not on the page/;
  const warned = logs.filter((l) => /could not|unavailable/i.test(l) && !EXPECTED_QUIET.test(l));
  check(
    "the panel's own log reports no missing hook beyond the absent client",
    warned.length === 0,
    warned.join(" | ")
  );

  // --- the dials drawer adds space, it does not take it from the map ---------
  //
  // The user's ask, verbatim: "надо сделать, чтобы dials добавляла пространство
  // снизу/радара, чтобы сама карта оставалась неизменной." It is a claim about
  // a rendered box, so it is asserted about a rendered box: the stage's rect is
  // IDENTICAL across the toggle, and the panel is what grew.
  //
  // Inspection cannot stand in for this. The number that decides it passes
  // through three hands — what `storeRadarRect` persists, what
  // `radarChromeHeight` measures, and what the flex column does with the height
  // `sizeRadarPanel` writes — and only a laid-out panel has all three.
  await page.evaluate(() => {
    Object.defineProperty(document, "pointerLockElement", { get: () => null, configurable: true });
  });
  const shut = { panel: await rectOf(page, ".cdc-radar"), stage: await rectOf(page, ".cdc-radar-stage") };
  const toggle = centre(await rectOf(page, ".cdc-radar-dials-toggle"));
  await page.mouse.click(toggle.x, toggle.y);
  const drawer = await rectOf(page, ".cdc-radar-dials");
  const open = { panel: await rectOf(page, ".cdc-radar"), stage: await rectOf(page, ".cdc-radar-stage") };

  // Named first because every assertion under it would be vacuously true against
  // a drawer that rendered to nothing.
  check(
    "the toggle opens a drawer that has a height",
    !!drawer && drawer.height > 0,
    `the drawer is ${JSON.stringify(drawer)}`
  );

  check(
    "opening the drawer leaves the map's box exactly as it was",
    JSON.stringify(open.stage) === JSON.stringify(shut.stage),
    `was ${JSON.stringify(shut.stage)} — now ${JSON.stringify(open.stage)}`
  );

  check(
    "and the panel is what grew, by exactly the drawer",
    open.panel.height - shut.panel.height === drawer.height && open.panel.top === shut.panel.top,
    `panel ${shut.panel.height} -> ${open.panel.height}, drawer ${drawer.height} — equal heights mean the drawer ate the picture`
  );

  // --- what a drag persists, with the drawer in the way ----------------------
  //
  // Done with the drawer OPEN on purpose: the stored number must be the stage's
  // whatever chrome happens to be around it, and a round trip taken with the
  // drawer shut cannot tell the stage's height from the panel's.
  const gripNow = await rectOf(page, ".cdc-radar-grip");
  await dragBy(page, centre(gripNow), 40, 40);
  const persisted = await page.evaluate(() => {
    const el = document.querySelector(".cdc-radar");
    const raw = localStorage.getItem("cdc.radarRect");
    // Fractional throughout, the way the code under test measures. `offsetHeight`
    // would round the bar's 11px/1.4 text and the sums below would be out by one
    // for a reason that has nothing to do with the drawer.
    const h = (sel) => el.querySelector(sel).getBoundingClientRect().height;
    return {
      saved: raw ? JSON.parse(raw) : null,
      stage: h(".cdc-radar-stage"),
      bar: h(".cdc-radar-bar"),
      dials: h(".cdc-radar-dials"),
      outer: el.getBoundingClientRect().height,
    };
  });

  check(
    "a resize persists the height of the map and no height for the panel",
    !!persisted.saved &&
      persisted.saved.stageHeight === persisted.stage &&
      persisted.saved.height === undefined,
    JSON.stringify(persisted) + " — a `height` here is the old shape, and the next read would take the bar off it"
  );

  check(
    "and the panel on screen is that height plus its chrome, nothing else",
    Math.abs(persisted.outer - (persisted.stage + persisted.bar + persisted.dials + 2)) < 0.01,
    JSON.stringify(persisted) + " — the 2 is the panel's own 1px border, top and bottom"
  );

  // --- and shutting it gives the space back, not the picture -----------------
  //
  // Compared against the measurements taken just above rather than against the
  // pre-drag ones: the resize moved both numbers, and the claim is about the
  // toggle alone.
  const again = centre(await rectOf(page, ".cdc-radar-dials-toggle"));
  await page.mouse.click(again.x, again.y);
  const closed = await page.evaluate(() => {
    const el = document.querySelector(".cdc-radar");
    const h = (sel) => el.querySelector(sel).getBoundingClientRect().height;
    return {
      stage: h(".cdc-radar-stage"),
      dials: h(".cdc-radar-dials"),
      outer: el.getBoundingClientRect().height,
    };
  });
  check(
    "closing the drawer shrinks the panel and leaves the map the size the drag made it",
    Math.abs(closed.stage - persisted.stage) < 0.01 &&
      closed.dials === 0 &&
      Math.abs(persisted.outer - closed.outer - persisted.dials) < 0.01,
    `stage ${persisted.stage} -> ${closed.stage}, panel ${persisted.outer} -> ${closed.outer}, drawer was ${persisted.dials}`
  );

  await page.close();
}

/**
 * A layout written by a build that stored the panel's OUTER height.
 *
 * The shape changed under one key, so the only thing that keeps this from being
 * a visible jump for every existing user is the conversion in `radarSavedRect`.
 * Reloading with a legacy value seeded is the only way to see it happen.
 */
async function runMigrationChecks(context) {
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  await page.evaluate(() => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ left: 300, top: 200, width: 280, height: 220 })
    );
  });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });

  const shown = await page.evaluate(() => {
    window.__cdc.radar(true);
    const el = document.querySelector(".cdc-radar");
    const h = (sel) => el.querySelector(sel).getBoundingClientRect().height;
    return {
      written: parseFloat(el.style.height),
      outer: el.getBoundingClientRect().height,
      bar: h(".cdc-radar-bar"),
      drawer: h(".cdc-radar-dials"),
      stage: h(".cdc-radar-stage"),
      saved: JSON.parse(localStorage.getItem("cdc.radarRect")),
    };
  });

  // Against the RENDERED box, not against `style.height`. The old build wrote
  // 220 into a content-box panel and rendered a 222px box; this one is
  // border-box and writes 222 to render the same 222. Comparing the property
  // would read a change of units as a jump, and comparing the box is the claim
  // that matters: an existing user's panel is the same size after the upgrade.
  check(
    "a layout from an older build opens at exactly the height it always did",
    Math.abs(shown.outer - 222) < 0.01 && Math.abs(shown.written - 222) < 0.01,
    JSON.stringify(shown) + ` — 220 of content inside a 1px frame is the 222px box the old build drew`
  );

  check(
    "with the drawer shut, so the upgrade adds nothing of its own",
    shown.drawer === 0 && Math.abs(shown.stage - (220 - shown.bar)) < 0.01,
    JSON.stringify(shown) + " — `style.height` is the CONTENT box, so the bar is the only thing between it and the map"
  );

  check(
    "and the legacy value is left alone until a drag rewrites it",
    shown.saved.height === 220 && shown.saved.stageHeight === undefined,
    JSON.stringify(shown.saved) + " — an eager rewrite is a migration that can only run once, and never in the build that needs it"
  );

  await page.close();
}


/**
 * The anchor: an edge remembered rather than a position, a snap on release, a
 * clamp that keeps the panel reachable, and a resize taken out of free space.
 *
 * The user's ask, verbatim: "хотелось бы, чтобы он прилипал к краям и запоминал
 * положение именно относительно края (чтобы подгонка размера была за счёт
 * свободного пространства)."
 *
 * Driven with a free mouse. Nothing here is about how a press reaches the drag
 * — phases one to three are — and everything here is about what the box does
 * once it has, which the lock does not touch.
 */
async function runAnchorChecks(context) {
  console.log("  -- the anchored edge --");
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  const view = page.viewportSize();
  const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem("cdc.radarRect") || "null"));

  // A panel anchored to the right edge with room to spare on both axes: the
  // control arm for the snap below, and the state the growth check needs.
  await parkPanel(page, { left: view.width - 100 - 280, top: 200 });
  await page.evaluate(() => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ ax: "right", dx: 100, ay: "top", dy: 200, width: 280, stageHeight: 220 })
    );
    window.__cdc.radar(false);
    window.__cdc.radar(true);
  });

  const parked = await rectOf(page, ".cdc-radar");
  check(
    "a stored right anchor opens the panel at that gap from the right edge",
    view.width - (parked.left + parked.width) === 100,
    `right edge at ${parked.left + parked.width} in a ${view.width}px viewport, wanted a gap of 100`
  );

  // —- the control arm: a release well clear of an edge keeps its gap ————
  //
  // Named first because the snap below proves nothing without it: a store that
  // wrote `dx: 0` for every release would pass the snap assertion and fail this
  // one.
  await dragBy(page, centre(await rectOf(page, ".cdc-radar-bar")), -40, 0);
  const clear = await rectOf(page, ".cdc-radar");
  const clearSaved = await stored();
  check(
    "a release 140px from the edge stores the gap, not a snap",
    clearSaved.ax === "right" && Math.round(clearSaved.dx) === 140 &&
      view.width - (clear.left + clear.width) === 140,
    JSON.stringify(clearSaved) + ` — the panel's right edge is ${view.width - (clear.left + clear.width)}px in`
  );

  // —- the snap ——————————————————————————————-
  await dragBy(page, centre(await rectOf(page, ".cdc-radar-bar")), 130, 0);
  const snapped = await rectOf(page, ".cdc-radar");
  const snapSaved = await stored();
  check(
    "a release 10px from the right edge snaps flush to it",
    view.width - (snapped.left + snapped.width) === 0,
    `the right edge is at ${snapped.left + snapped.width} of ${view.width} — the release left a 10px gap, inside the 16px threshold`
  );
  check(
    "and what is stored is the edge and a zero offset, which is what snapped means",
    snapSaved.ax === "right" && snapSaved.dx === 0,
    JSON.stringify(snapSaved)
  );

  // —- the resize comes out of free space ——————————————————
  //
  // The user's ask, in a rendered box. Driven from a panel anchored right with
  // 100px of room, not from a flush one: growing a flush panel by the grip would
  // need the cursor to travel PAST the right edge of the screen, which no mouse
  // can do and Playwright will not dispatch. That is a property of the anchor,
  // not of the driver — a panel against the edge is resized by dragging the
  // grip inward, or by moving it off the edge first.
  await page.evaluate(() => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ ax: "right", dx: 100, ay: "top", dy: 200, width: 280, stageHeight: 220 })
    );
    window.__cdc.radar(false);
    window.__cdc.radar(true);
  });
  const beforeGrow = await rectOf(page, ".cdc-radar");
  const grip = await rectOf(page, ".cdc-radar-grip");
  await dragBy(page, centre(grip), 50, 30);
  const grown = await rectOf(page, ".cdc-radar");
  check(
    "a grip drag on a right-anchored panel leaves the anchored edge exactly where it was",
    grown.left + grown.width === beforeGrow.left + beforeGrow.width,
    `right edge was ${beforeGrow.left + beforeGrow.width}, now ${grown.left + grown.width} — the whole ask is that this number does not move`
  );
  check(
    "and the panel grew leftwards into the free space, by what the drag asked for",
    Math.abs(grown.width - beforeGrow.width - 50) <= grip.width &&
      Math.abs(beforeGrow.left - grown.left - 50) <= grip.width,
    `width ${beforeGrow.width} -> ${grown.width}, left ${beforeGrow.left} -> ${grown.left}`
  );

  // —- and it cannot be dragged out of reach ————————————————-
  //
  // The defect half. Nothing clamped the panel to the viewport before this, so a
  // drag could leave it where no press could reach it and no later drag could
  // bring it back. The drag below aims a long way past the bottom-right corner.
  await dragBy(page, centre(await rectOf(page, ".cdc-radar-bar")), 400, 700);
  const corner = await rectOf(page, ".cdc-radar");
  const cornerSaved = await stored();
  check(
    "a drag aimed past the bottom-right corner leaves the panel inside the viewport",
    corner.left >= 0 && corner.top >= 0 &&
      corner.left + corner.width <= view.width && corner.top + corner.height <= view.height,
    JSON.stringify(corner) + ` in a ${view.width}x${view.height} viewport`
  );
  check(
    "and both axes snapped, which is all a corner snap is",
    cornerSaved.ax === "right" && cornerSaved.dx === 0 && cornerSaved.ay === "bottom" && cornerSaved.dy === 0,
    JSON.stringify(cornerSaved)
  );

  // —- the width stops creeping ———————————————————————
  //
  // A press and release with the mouse NEVER MOVING has to leave the stored
  // layout alone. It did not: `makeDraggable` measures the box it hands over
  // with `offsetWidth`/`offsetHeight`, and the panel was content-box, so every
  // drag wrote a border back into a size that had not asked for one. Measured on
  // 1.17.13: 284 -> 288 -> 292 -> 296 over four round trips, and the map 2px
  // taller each time.
  //
  // Store, reload, store again — a single round trip cannot see a creep, since
  // the number it compares is the one it just wrote. The first press is a
  // settling one: a fresh panel's height is fractional and the first
  // `offsetHeight` rounds it, which is a one-off snap and not a creep.
  const rounds = [];
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => window.__cdc.radar(true));
    const g = await rectOf(page, ".cdc-radar-grip");
    const at = { x: g.left + Math.round(g.width / 2), y: g.top + Math.round(g.height / 2) };
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    // Out and back, ending where it started: a press with no mousemove at all
    // never reaches `onMove`, so it would leave the resize arithmetic — the
    // half that writes a measured border back into a size — untouched.
    await page.mouse.move(at.x + 12, at.y + 8);
    await page.mouse.move(at.x, at.y);
    await page.mouse.up();
    rounds.push(await stored());
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  }
  check(
    "a grip drag that ends where it began stores the same width twice over",
    rounds[1].width === rounds[2].width,
    `widths ${rounds.map((r) => r.width).join(" -> ")} — a growing number is the border being measured and written back`
  );
  check(
    "and the same map height, which is the other half of the same fault",
    rounds[1].stageHeight === rounds[2].stageHeight,
    `map heights ${rounds.map((r) => r.stageHeight).join(" -> ")}`
  );

  // —- the viewport changes, the edge does not ———————————————-
  //
  // Last, because it leaves the page at a different size. Fullscreen fires the
  // same `resize`, which is what makes one listener cover both.
  await page.evaluate(() => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ ax: "right", dx: 24, ay: "bottom", dy: 36, width: 280, stageHeight: 220 })
    );
    window.__cdc.radar(true);
  });
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.waitForFunction(
    () => {
      const el = document.querySelector(".cdc-radar");
      return !!el && Math.round(window.innerWidth - el.getBoundingClientRect().right) === 24;
    },
    null,
    { timeout: 5000 }
  ).catch(() => {});
  const shrunk = await page.evaluate(() => {
    const r = document.querySelector(".cdc-radar").getBoundingClientRect();
    return {
      view: `${window.innerWidth}x${window.innerHeight}`,
      right: Math.round(window.innerWidth - r.right),
      bottom: Math.round(window.innerHeight - r.bottom),
      left: Math.round(r.left),
    };
  });
  check(
    "a viewport that shrinks from 1920 to 1280 leaves both anchored gaps untouched",
    shrunk.view === "1280x800" && shrunk.right === 24 && shrunk.bottom === 36,
    JSON.stringify(shrunk) + " — an absolute position would have put the panel 640px off the right of this viewport"
  );

  // The clamp, at the one moment it is load-bearing. An offset only has to be
  // kept while it still fits: a panel 1500px in from the left of a 1920 viewport
  // is 220px off the right of a 1280 one, and nothing else in the file would
  // bring it back. A drag cannot reach this state — the anchor's own offsets are
  // never negative, so a release past an edge is already a snap — which is why
  // it is driven from a stored layout.
  await page.evaluate(() => {
    localStorage.setItem(
      "cdc.radarRect",
      JSON.stringify({ ax: "left", dx: 1500, ay: "top", dy: 900, width: 280, stageHeight: 220 })
    );
    window.__cdc.radar(false);
    window.__cdc.radar(true);
  });
  const rescued = await page.evaluate(() => {
    const r = document.querySelector(".cdc-radar").getBoundingClientRect();
    return { left: Math.round(r.left), top: Math.round(r.top), right: Math.round(r.right), bottom: Math.round(r.bottom),
      view: `${window.innerWidth}x${window.innerHeight}` };
  });
  check(
    "and an offset that no longer fits the viewport is clamped back inside it",
    rescued.left >= 0 && rescued.top >= 0 && rescued.right <= 1280 && rescued.bottom <= 800,
    JSON.stringify(rescued) + " — unclamped, a stored 1500 puts the panel 500px off the right of a 1280px viewport"
  );

  await page.close();
}

// --- phase two: a REAL lock, and real fullscreen -----------------------------

/** Where the lock is taken, and therefore where the DOM cursor freezes. */
const LOCK_AT = { x: 900, y: 700 };

/** The centre of a box, which is where every press in this file lands. */
const centre = (r) => ({ x: r.left + Math.round(r.width / 2), y: r.top + Math.round(r.height / 2) });

/**
 * Take a real pointer lock, the way the client does: a real click, and the
 * request made from inside its handler.
 *
 * `requestPointerLock` needs transient user activation, which only a genuine
 * press grants -- Playwright's mouse goes through CDP and counts. The newer
 * signature returns a promise; the older one reports through `pointerlockerror`,
 * so both are listened for and the loser is reported rather than swallowed.
 */
async function takeRealLock(page, at) {
  await page.bringToFront();
  await page.evaluate(() => {
    window.__real = { lock: "the click never reached the handler" };
    const el = document.getElementById("ra2web-root");
    el.addEventListener("click", async () => {
      try {
        const r = el.requestPointerLock();
        if (r && r.then) await r;
        window.__real.lock = "granted";
      } catch (e) {
        window.__real.lock = `refused — ${e.name}: ${e.message}`;
      }
    });
    document.addEventListener("pointerlockerror", () => {
      window.__real.lock = "refused — the browser fired pointerlockerror";
    });
  });
  await page.mouse.click(at.x, at.y);
  await page
    .waitForFunction(() => window.__real.lock !== "the click never reached the handler", null, { timeout: 5000 })
    // A timeout here is not an error to report separately: the unchanged
    // sentinel IS the report, and it is returned below either way.
    .catch(() => {});
  return page.evaluate(() => ({
    why: window.__real.lock,
    held: document.pointerLockElement ? document.pointerLockElement.id : null,
  }));
}

/**
 * Enter real fullscreen on `#ra2web-root` -- the element the client fills, and
 * therefore the one that decides whether our panels are rendered at all: a
 * fullscreen element hides the rest of the document, so an overlay mounted
 * outside it would vanish exactly when the player is in a match.
 *
 * A dblclick rather than a click because the lock is already held by now and the
 * single-click handler above would re-request it.
 */
async function enterFullscreen(page, at) {
  await page.evaluate(() => {
    window.__real.fs = "the click never reached the handler";
    const el = document.getElementById("ra2web-root");
    el.addEventListener("dblclick", async () => {
      try {
        await el.requestFullscreen();
        window.__real.fs = "entered";
      } catch (e) {
        window.__real.fs = `refused — ${e.name}: ${e.message}`;
      }
    });
  });
  await page.mouse.dblclick(at.x, at.y);
  await page
    .waitForFunction(() => window.__real.fs !== "the click never reached the handler", null, { timeout: 5000 })
    // As above: the sentinel is the answer, and the caller asserts on it.
    .catch(() => {});
  return page.evaluate(() => ({
    why: window.__real.fs,
    el: document.fullscreenElement ? document.fullscreenElement.id : null,
    stillLocked: document.pointerLockElement ? document.pointerLockElement.id : null,
  }));
}

/**
 * Give the page the one thing a locked match has and this stub does not: a
 * client pointer that still moves.
 *
 * Through the exposed `__cdc.state`, so nothing in src/ is touched. `backing` is
 * the ratio between the canvas's ATTRIBUTE pixels and its CSS box: 1 is the
 * canvas phases one and two get, where `chordScreenBox`'s scale is exactly 1 and
 * `getPosition()` is therefore viewport pixels, and 2 is the canvas a renderer
 * that calls `setPixelRatio(devicePixelRatio)` would produce on a HiDPI display.
 * The shipped client is the former: its renderer never calls `setPixelRatio`, so
 * a backing of 2 is a hypothetical this driver constructs, not a state observed.
 * `pointer-events: none` keeps it out of every `elementFromPoint` answer.
 *
 * The position accumulates `movementX/movementY`, because under a lock that is
 * the only live signal the page gets and it is what the client's own `Pointer`
 * integrates. Seeded from the caller's known true cursor position.
 */
async function installClientPointer(page, from, backing = 1) {
  return page.evaluate(({ seed, backing }) => {
    // Idempotent: a phase installs twice to change the backing ratio, and a
    // second canvas left in the DOM would be a second thing over the panel.
    for (const old of document.querySelectorAll(".cdc-probe-canvas")) old.remove();
    const canvas = document.createElement("canvas");
    canvas.className = "cdc-probe-canvas";
    canvas.width = Math.round(window.innerWidth * backing);
    canvas.height = Math.round(window.innerHeight * backing);
    canvas.style.cssText =
      `position:fixed;left:0;top:0;width:${window.innerWidth}px;height:${window.innerHeight}px;pointer-events:none`;
    (document.getElementById("ra2web-root") || document.body).append(canvas);
    const at = { x: seed.x, y: seed.y };
    // Capture, and installed before any drag's own mousemove listener, so the
    // position our code reads is already this move's.
    window.addEventListener(
      "mousemove",
      (e) => {
        at.x += e.movementX;
        at.y += e.movementY;
      },
      true
    );
    window.__cdc.state.pointerUi = { canvas, getPosition: () => ({ x: at.x, y: at.y }) };
    const rect = canvas.getBoundingClientRect();
    return {
      canvas: `${canvas.width}x${canvas.height} attribute px over a ${Math.round(rect.width)}x${Math.round(rect.height)} CSS box`,
      ratio: canvas.width / rect.width,
      seeded: `${at.x},${at.y}`,
    };
  }, { seed: from, backing });
}

/** `__cdc.drag()` at a point, printed in full -- the report a player is asked to read. */
async function reportAt(page, label, point) {
  await page.mouse.move(point.x, point.y);
  const said = await page.evaluate(() => window.__cdc.drag());
  console.log(`       __cdc.drag() ${label}: ${JSON.stringify(said)}`);
  return said;
}

async function runRealLockChecks(context) {
  console.log("  -- phase two: a REAL pointer lock and REAL fullscreen --");
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  await page.evaluate(() => window.__cdc.radar(true));

  // Give `#ra2web-root` the viewport, which is the one thing the stub gets
  // wrong and phase one never needed: the client fills it with a canvas
  // (`#ra2web-root > canvas`), while the stub leaves a bare div of zero height.
  // A lock is requested from a click handler ON that element, so against the
  // unsized stub the click landed on `<body>`, the handler never ran, and the
  // whole phase read as "Chromium refuses a headless lock" -- which is false.
  await page.evaluate(() => {
    const root = document.getElementById("ra2web-root");
    root.style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0";
  });

  // Park the panel where the driver can reach all of it, exactly as phase one
  // does. The lock is then taken far away from it: a real lock freezes the DOM
  // cursor AT THE CLICK, so locking on the panel would freeze it on the very
  // element under test and hide the staleness this phase exists to measure.
  await parkPanel(page);

  const lock = await takeRealLock(page, LOCK_AT);
  check(
    "Chromium grants a REAL pointer lock headlessly",
    lock.held === "ra2web-root",
    `${lock.why} — pointerLockElement is ${lock.held}`
  );

  // The one thing that separates this phase from the fake. If the DOM cursor
  // still moves, the lock is not real and nothing below means anything.
  await page.evaluate(() => {
    window.__moves = [];
    window.addEventListener("mousemove", (e) =>
      window.__moves.push({ client: `${e.clientX},${e.clientY}`, movement: `${e.movementX},${e.movementY}` })
    );
  });
  await page.mouse.move(400, 300);
  await page.mouse.move(600, 500);
  const moves = await page.evaluate(() => window.__moves);
  check(
    "the real lock freezes the DOM cursor, which the faked one never did",
    moves.length >= 2 && moves[0].client === moves[1].client && moves[1].movement !== "0,0",
    JSON.stringify(moves)
  );

  const fs = await enterFullscreen(page, LOCK_AT);
  check(
    "REAL fullscreen is entered on #ra2web-root, the element the game fills",
    fs.el === "ra2web-root",
    `${fs.why} — fullscreenElement is ${fs.el}`
  );
  check("the pointer lock survives entering fullscreen", fs.stillLocked === "ra2web-root", `now ${fs.stillLocked}`);

  // "It works outside fullscreen" has an obvious candidate cause: a fullscreen
  // element hides everything outside its subtree. Asked of the live DOM rather
  // than of the source, because where a panel is mounted is a runtime fact.
  const drawn = await page.evaluate(() => {
    const el = document.querySelector(".cdc-radar");
    const r = el.getBoundingClientRect();
    return {
      insideFullscreen: !!(document.fullscreenElement && document.fullscreenElement.contains(el)),
      box: `${Math.round(r.width)}x${Math.round(r.height)}`,
    };
  });
  check(
    "the panel is inside the fullscreen element, so fullscreen still draws it",
    drawn.insideFullscreen === true && drawn.box !== "0x0",
    JSON.stringify(drawn)
  );

  // Re-asserted after fullscreen, not just at the start: fullscreen changes the
  // viewport, and a press outside it is never dispatched.
  const view = await page.evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
  const grip0 = await rectOf(page, ".cdc-radar-grip");
  check(
    "the grip is on screen once fullscreen has settled the viewport",
    grip0.left + grip0.width <= view.width && grip0.top + grip0.height <= view.height,
    `grip at ${grip0.left},${grip0.top} in a ${view.width}x${view.height} viewport`
  );

  // --- arm A: NO client pointer, which is the entire point of this arm -------
  //
  // Nothing has set `state.pointerUi` on this page, so `cursorPoint()` gets no
  // help from the client and every answer below is one it worked out itself
  // from `movementX/movementY` -- the only live signal a locked page receives.
  // Rip `trackPointer`'s accumulation out and this arm goes red while arm B,
  // which installs a live client pointer, stays green. That asymmetry is why
  // the arm exists, and it is what makes these assertions the fix's evidence.
  const barA = await rectOf(page, ".cdc-radar-bar");
  const soloBar = await reportAt(page, "over the bar, no client pointer", centre(barA));
  check(
    "with no client pointer a REAL lock still finds the bar, off our own integration",
    soloBar.captured === true && soloBar.panel === "radar" && soloBar.wouldDo === "radar: move",
    JSON.stringify(soloBar)
  );

  const beforeA = await rectOf(page, ".cdc-radar");
  await dragBy(page, centre(barA), 60, 40);
  const afterA = await rectOf(page, ".cdc-radar");
  check(
    "and the panel moves — the reported failure, fixed",
    afterA.left === beforeA.left + 60 && afterA.top === beforeA.top + 40,
    `was ${beforeA.left},${beforeA.top} — now ${afterA.left},${afterA.top}`
  );

  // The record the press left behind, which is a different thing from `wouldDo`'s
  // prediction about a press that has not happened. In a live match nobody can
  // watch the drag, so these two fields are what separate "the press never
  // reached `begin`" from "`begin` armed the box and `onMove` did nothing" -- and
  // this is the arm where the whole chain is known to work, so it is where the
  // shape of a WORKING record gets pinned. Read without moving the mouse: a
  // `reportAt` here would be a third mouse move over a panel that has just moved.
  const recordA = await page.evaluate(() => window.__cdc.drag());
  console.log(`       after the drag: lastPress ${JSON.stringify(recordA.lastPress)}`);
  console.log(`       after the drag: drags.radar ${JSON.stringify(recordA.drags.radar)}`);
  check(
    "the report records the press that moved the panel: begin was reached, and onMove saw the travel",
    recordA.lastPress.step === "begin was called" &&
      recordA.lastPress.panel === "radar" &&
      recordA.drags.radar.begins >= 1 &&
      recordA.drags.radar.downs >= 1 &&
      recordA.drags.radar.moves >= 1 &&
      recordA.drags.radar.lastMove.by === "60,40",
    JSON.stringify({ lastPress: recordA.lastPress, radar: recordA.drags.radar })
  );
  check(
    "and it shows the drag disarmed and unlistening once the press ended",
    recordA.drags.radar.armed === "no" && recordA.drags.radar.listening === false,
    JSON.stringify(recordA.drags.radar)
  );

  // Re-read rather than reusing `grip0`: the panel has just moved, and the grip
  // travels with the corner it is dragged by.
  const gripA = await rectOf(page, ".cdc-radar-grip");
  check(
    "the grip is still on screen after that move, for the resize press",
    gripA.left + gripA.width <= view.width && gripA.top + gripA.height <= view.height,
    `grip at ${gripA.left},${gripA.top} in a ${view.width}x${view.height} viewport`
  );

  const soloGrip = await reportAt(page, "over the grip, no client pointer", centre(gripA));
  check(
    "and the grip is visible to it for the same reason",
    soloGrip.panel === "radar" && soloGrip.wouldDo === "radar: resize",
    JSON.stringify(soloGrip)
  );

  const atResizeA = await rectOf(page, ".cdc-radar");
  await dragBy(page, centre(gripA), 50, 30);
  const resizedA = await rectOf(page, ".cdc-radar");
  // The same tolerance arm B earned, and for the same reason: the grip travels
  // with the corner it grows.
  const grewWA = resizedA.width - atResizeA.width;
  const grewHA = resizedA.height - atResizeA.height;
  check(
    "and a press on the grip resizes it with no client pointer either",
    Math.abs(grewWA - 50) <= gripA.width && Math.abs(grewHA - 30) <= gripA.height,
    `grew ${grewWA}x${grewHA}, wanted about 50x30`
  );

  // --- arm B: the client's own pointer, which is what a match has -----------
  await page.mouse.move(LOCK_AT.x, LOCK_AT.y);
  const installed = await installClientPointer(page, LOCK_AT);
  console.log(`       installed a client pointer: canvas ${installed.canvas}, seeded at ${installed.seeded}`);

  const barB = await rectOf(page, ".cdc-radar-bar");
  const liveBar = await reportAt(page, "over the bar, client pointer live", centre(barB));
  check(
    "with the client's pointer the report finds the bar under a REAL lock",
    liveBar.captured === true && liveBar.panel === "radar" && liveBar.wouldDo === "radar: move",
    JSON.stringify(liveBar)
  );

  const beforeB = await rectOf(page, ".cdc-radar");
  await dragBy(page, centre(barB), 60, 40);
  const afterB = await rectOf(page, ".cdc-radar");
  check(
    "and a press on the bar moves the panel under a REAL lock",
    afterB.left === beforeB.left + 60 && afterB.top === beforeB.top + 40,
    `was ${beforeB.left},${beforeB.top} — now ${afterB.left},${afterB.top}`
  );

  const gripB = await rectOf(page, ".cdc-radar-grip");
  check(
    "the grip is still on screen after that move, for the resize press",
    gripB.left + gripB.width <= view.width && gripB.top + gripB.height <= view.height,
    `grip at ${gripB.left},${gripB.top} in a ${view.width}x${view.height} viewport`
  );

  const liveGrip = await reportAt(page, "over the grip, client pointer live", centre(gripB));
  check(
    "the report names a resize over the grip under a REAL lock",
    liveGrip.wouldDo === "radar: resize" && liveGrip.panel === "radar",
    JSON.stringify(liveGrip)
  );

  const atResize = await rectOf(page, ".cdc-radar");
  await dragBy(page, centre(gripB), 50, 30);
  const resized = await rectOf(page, ".cdc-radar");
  // The same tolerance phase one earned, and for the same reason: the grip
  // travels with the corner it grows.
  const grewW = resized.width - atResize.width;
  const grewH = resized.height - atResize.height;
  check(
    "and a press on the grip resizes the panel under a REAL lock",
    Math.abs(grewW - 50) <= gripB.width && Math.abs(grewH - 30) <= gripB.height,
    `grew ${grewW}x${grewH}, wanted about 50x30`
  );

  // --- arm C: a client pointer that was captured but cannot answer ---------
  //
  // The one state `__cdc.drag()` used to describe wrongly. It read
  // `state.pointerUi` for truthiness and never the guards `cursorPoint` actually
  // runs, so it said the client's pointer for every match whose pointer was
  // captured and unusable -- which is precisely the match a player would be asked
  // to run it in. `source` now comes from the branch cursorPoint recorded, and
  // this arm is what holds it to that.
  await page.evaluate(() => {
    const dead = document.createElement("canvas");
    dead.width = 0;
    dead.height = 0;
    dead.style.cssText = "position:fixed;left:0;top:0;width:0;height:0;pointer-events:none";
    document.body.append(dead);
    window.__cdc.state.pointerUi = { canvas: dead, getPosition: () => ({ x: 10, y: 10 }) };
  });
  const deadBar = await rectOf(page, ".cdc-radar-bar");
  const deadSays = await reportAt(page, "captured client pointer, unusable", centre(deadBar));
  check(
    "a captured-but-unusable client pointer reads as the fallback, not as the client",
    deadSays.branch === "integrated" &&
      deadSays.source === "ours, integrated from movementX/movementY" &&
      deadSays.pointerHook.captured === true &&
      /empty rect/.test(deadSays.why),
    JSON.stringify({ branch: deadSays.branch, source: deadSays.source, why: deadSays.why, hook: deadSays.pointerHook })
  );
  check(
    "and the drag it would begin comes off that fallback, at the real cursor",
    deadSays.wouldDo === "radar: move" && deadSays.at === `${centre(deadBar).x},${centre(deadBar).y}`,
    JSON.stringify({ at: deadSays.at, wanted: `${centre(deadBar).x},${centre(deadBar).y}`, wouldDo: deadSays.wouldDo })
  );

  await page.close();
}

// --- phase three: the display the user actually has --------------------------

/**
 * The same real lock at `deviceScaleFactor: 2`, against a client pointer whose
 * canvas is backed at the device ratio.
 *
 * Four things in order, because each is what makes the next mean anything: the
 * lock is real; `movementX/movementY` are MEASURED to be CSS pixels, which is
 * therefore the unit the client's own integrated position is in; the fallback
 * path is shown correct at this scale; and only then is a device-backed client
 * pointer installed and `cursorPoint()` asked where the cursor is.
 *
 * The three assertions marked CHARACTERISATION state what the conversion does at
 * a backing ratio of 2, written as arithmetic (half the true point, over the
 * ratio) rather than as a verdict. **They are not the cause of the reported drag
 * failure and must not be read as one.** Two things refute that reading. The
 * shipped client never makes this canvas: `Renderer.setViewportSize` calls
 * `THREE.WebGLRenderer.setSize(w, h)`, whose pixel ratio defaults to 1, and
 * `setPixelRatio`/`devicePixelRatio` occur ZERO times in
 * `dist/ra2web.min.js?v=0.83.3`, in the lib patches or in the stylesheet -- so
 * live the ratio is 1 and this division is the identity. And the hit test is
 * known good in a real match: `onOverlayMouseMove` draws the cursor AT
 * `cursorPoint()` and only over one of our boxes, through the same hit test the
 * drag uses, and the user confirmed live under a real lock that it draws on the
 * cursor. A halved point would draw it visibly offset, or not at all.
 *
 * So the drag failure is downstream of the hit test and is currently
 * unexplained; nothing in this phase is evidence about it either way.
 *
 * **When this phase would be a defect again.** A future client version that sets
 * a device pixel ratio on its canvas turns these three red -- and red would then
 * be real, with the arithmetic here as the diagnosis. That is the whole reason to
 * keep the case: green means "the conversion is the identity, look downstream",
 * red means "the client has started backing its canvas at the device ratio".
 *
 * The 1:1 control at the end is what makes those three a measurement of the
 * BACKING RATIO rather than of HiDPI: same display, same lock, same client
 * pointer, one number changed, and the drag works again. Arm A is the other half
 * of the value -- it pins that the 1.17.9 integrated fallback is HiDPI-safe.
 *
 * What this file cannot see is whether a real client canvas is device-backed --
 * there is no client here. That is the question `canvasSpace` in `__cdc.drag()`
 * answers from a live match in one line, and the arithmetic below is what says
 * which answer means what.
 */
async function runHiDpiChecks(context) {
  console.log("  -- phase three: deviceScaleFactor 2, the display the user has --");
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  await page.evaluate(() => window.__cdc.radar(true));
  // The same two fixture chores phase two does, for the same reasons: the lock is
  // requested from a handler on #ra2web-root, and a panel parked near the right
  // edge puts its own grip outside the viewport after one drag.
  await page.evaluate(() => {
    document.getElementById("ra2web-root").style.cssText = "position:fixed;left:0;top:0;right:0;bottom:0";
  });
  await parkPanel(page);

  const screen = await page.evaluate(() => ({ dpr: window.devicePixelRatio, width: innerWidth, height: innerHeight }));
  check(
    "the context really is HiDPI, which neither phase above is",
    screen.dpr === 2,
    `devicePixelRatio is ${screen.dpr} in a ${screen.width}x${screen.height} CSS viewport`
  );

  const lock = await takeRealLock(page, LOCK_AT);
  check(
    "a REAL pointer lock is granted at deviceScaleFactor 2 as well",
    lock.held === "ra2web-root",
    `${lock.why} — pointerLockElement is ${lock.held}`
  );

  // The load-bearing measurement of the phase. The client's locked position is an
  // integration of these deltas, so whatever unit they are in is the unit
  // `getPosition()` answers in -- and the whole question is whether that unit
  // matches `canvas.width`. Measured rather than assumed: Chromium reported these
  // in DEVICE pixels for years, and this phase would be reading the opposite bug
  // if it still did.
  await page.evaluate(() => {
    window.__moves = [];
    window.addEventListener(
      "mousemove",
      (e) => window.__moves.push({ client: `${e.clientX},${e.clientY}`, movement: `${e.movementX},${e.movementY}` }),
      true
    );
  });
  await page.mouse.move(LOCK_AT.x + 100, LOCK_AT.y + 100);
  await page.mouse.move(LOCK_AT.x + 200, LOCK_AT.y + 200);
  const moves = await page.evaluate(() => window.__moves);
  console.log(`       moves under a HiDPI lock: ${JSON.stringify(moves)}`);
  check(
    "movementX/movementY under a HiDPI lock are CSS pixels, not device pixels",
    moves.length >= 2 && moves.every((m) => m.movement === "100,100"),
    `100 CSS pixels of travel — device pixels would read 200,200. Got ${JSON.stringify(moves.map((m) => m.movement))}`
  );
  check(
    "and the DOM cursor is frozen at this scale too, so the lock is the real one",
    moves.length >= 2 && moves[0].client === moves[1].client,
    JSON.stringify(moves)
  );

  // --- arm A: no client pointer, the fallback, on a HiDPI display -----------
  const barA = await rectOf(page, ".cdc-radar-bar");
  const wantA = centre(barA);
  const soloBar = await reportAt(page, "over the bar, no client pointer, HiDPI", wantA);
  check(
    "our own integration lands on the cursor at deviceScaleFactor 2",
    soloBar.branch === "integrated" && soloBar.at === `${wantA.x},${wantA.y}` && soloBar.wouldDo === "radar: move",
    JSON.stringify({ branch: soloBar.branch, at: soloBar.at, wanted: `${wantA.x},${wantA.y}`, wouldDo: soloBar.wouldDo })
  );
  const beforeA = await rectOf(page, ".cdc-radar");
  await dragBy(page, wantA, 60, 40);
  const afterA = await rectOf(page, ".cdc-radar");
  check(
    "and the panel moves — the fallback path is HiDPI-safe",
    afterA.left === beforeA.left + 60 && afterA.top === beforeA.top + 40,
    `was ${beforeA.left},${beforeA.top} — now ${afterA.left},${afterA.top}`
  );

  // --- arm B: a client pointer backed at the device ratio -------------------
  await page.mouse.move(LOCK_AT.x, LOCK_AT.y);
  const hidpi = await installClientPointer(page, LOCK_AT, 2);
  console.log(`       installed a HiDPI client pointer: ${hidpi.canvas}`);
  check(
    "the stub client canvas is device-backed, the way a HiDPI renderer makes one",
    hidpi.ratio === 2,
    `attribute pixels over CSS box is ${hidpi.ratio}, wanted 2 — ${hidpi.canvas}`
  );

  const barB = await rectOf(page, ".cdc-radar-bar");
  const wantB = centre(barB);
  const saysB = await reportAt(page, "over the bar, device-backed client pointer", wantB);
  const stub = await page.evaluate(() => window.__cdc.state.pointerUi.getPosition());
  check(
    "the client's own pointer is on the cursor, so nothing upstream is at fault",
    Math.round(stub.x) === wantB.x && Math.round(stub.y) === wantB.y,
    `the client says ${Math.round(stub.x)},${Math.round(stub.y)} — the cursor is at ${wantB.x},${wantB.y}`
  );
  check(
    "and the report proves the client branch is the one that ran",
    saysB.branch === "client" && saysB.pointerHook.captured === true,
    JSON.stringify({ branch: saysB.branch, why: saysB.why, hook: saysB.pointerHook })
  );
  check(
    "canvasSpace shows the ratio the conversion divides by",
    saysB.canvasSpace && saysB.canvasSpace.ratio === 2 && saysB.canvasSpace.devicePixelRatio === 2,
    JSON.stringify(saysB.canvasSpace)
  );

  const halved = { x: Math.round(wantB.x / 2), y: Math.round(wantB.y / 2) };
  check(
    "CHARACTERISATION: at a backing ratio of 2 cursorPoint divides the client's CSS-pixel position by it",
    saysB.at === `${halved.x},${halved.y}`,
    `the cursor and the client both say ${wantB.x},${wantB.y}; cursorPoint answers ${saysB.at}; ` +
      `${halved.x},${halved.y} is that point over the ratio`
  );
  check(
    "CHARACTERISATION: so at that ratio the hit test lands off the panel and no drag can begin",
    saysB.panel === "none" && saysB.wouldDo.startsWith("nothing"),
    JSON.stringify({ under: saysB.under, panel: saysB.panel, wouldDo: saysB.wouldDo })
  );
  const beforeB = await rectOf(page, ".cdc-radar");
  const radarBefore = await page.evaluate(() => window.__cdc.drag().drags.radar);
  await dragBy(page, wantB, 60, 40);
  const afterB = await rectOf(page, ".cdc-radar");
  check(
    "CHARACTERISATION: and at that ratio the panel does not move — a stub geometry, not the live bug",
    afterB.left === beforeB.left && afterB.top === beforeB.top,
    `was ${beforeB.left},${beforeB.top} — now ${afterB.left},${afterB.top}`
  );

  // The other half of the pair arm A pins, and the reason the pair earns its
  // place: a panel that did not move can fail in two places, and the report has
  // to say which. Here the press stopped in `onPanelMouseDown` -- `begin` was
  // never called, so the radar's own counters are untouched. A live match whose
  // panel will not move but whose counters DO climb is the other case entirely,
  // and that is the one still unexplained.
  const recordB = await page.evaluate(() => window.__cdc.drag());
  console.log(`       after the failed drag: lastPress ${JSON.stringify(recordB.lastPress)}`);
  check(
    "and the report says where the press stopped: before begin, not inside it",
    recordB.lastPress.step === "no panel of ours contains the cursor" &&
      recordB.drags.radar.begins === radarBefore.begins &&
      recordB.drags.radar.downs === radarBefore.downs,
    JSON.stringify({ lastPress: recordB.lastPress, before: radarBefore, after: recordB.drags.radar })
  );

  // --- the control: the same everything, backed 1:1 -------------------------
  await page.mouse.move(LOCK_AT.x, LOCK_AT.y);
  const flat = await installClientPointer(page, LOCK_AT, 1);
  check(
    "the control client canvas is backed 1:1 on the same HiDPI display",
    flat.ratio === 1,
    flat.canvas
  );
  const barC = await rectOf(page, ".cdc-radar-bar");
  const wantC = centre(barC);
  const saysC = await reportAt(page, "over the bar, 1:1 client pointer, still HiDPI", wantC);
  check(
    "with the ratio at 1 the same code lands on the cursor and offers the drag",
    saysC.branch === "client" && saysC.at === `${wantC.x},${wantC.y}` && saysC.wouldDo === "radar: move",
    JSON.stringify({ branch: saysC.branch, at: saysC.at, wanted: `${wantC.x},${wantC.y}`, wouldDo: saysC.wouldDo })
  );
  const beforeC = await rectOf(page, ".cdc-radar");
  await dragBy(page, wantC, 60, 40);
  const afterC = await rectOf(page, ".cdc-radar");
  check(
    "and the panel moves — so the backing ratio is the whole of the difference",
    afterC.left === beforeC.left + 60 && afterC.top === beforeC.top + 40,
    `was ${beforeC.left},${beforeC.top} — now ${afterC.left},${afterC.top}`
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

  const profile = mkdtempSync(join(tmpdir(), "cdc-drag-"));
  try {
    // Two contexts rather than two pages: a real lock and real fullscreen are
    // browser-level state, and the fake-lock phase is the control group -- it
    // has to run on a page that never held either.
    // One context for both: the migration page seeds `localStorage` for the
    // same origin the drag checks just used, and a fresh context would only be
    // a browser launch to say the same thing.
    await phase(playwright, profile, async (context) => {
      await runDragChecks(context);
      await runMigrationChecks(context);
      await runAnchorChecks(context);
    });
    console.log("");
    await phase(playwright, profile, runRealLockChecks);
    console.log("");
    // The one option that matters here, and the reason this is a third context
    // rather than a third page: the device scale is a browser-level setting.
    await phase(playwright, profile, runHiDpiChecks, { deviceScaleFactor: 2 });
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
    // Wide enough that a dragged panel stays on screen, which is not cosmetic:
    // Playwright does not dispatch a mousemove to a point outside the viewport,
    // so at the default 1280x720 the first drag pushed the panel's right edge to
    // 1322 and every later press landed on a STALE cursor position. That read as
    // three failing assertions about the extension and was entirely this
    // fixture's doing -- a fixture that could no longer reach its own subject.
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
