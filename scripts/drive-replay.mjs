/**
 * The Replays panel, driven in a real browser.
 *
 *   node scripts/drive-replay.mjs           SKIP when playwright is absent
 *   node scripts/drive-replay.mjs --require absent playwright is a failure
 *   node scripts/drive-replay.mjs --headed  watch it
 *
 * `scripts/check-options.mjs` runs the same panel's logic under node against a
 * fake document, which is where the arithmetic is asserted. What it cannot ask
 * is whether any of it happens in a browser: whether the file input reaches the
 * reader, whether the charts draw as SVG, whether a legend key is a thing a
 * person can click. Those are this file's, and the split is deliberate — the
 * node tier is seconds and this one is a browser.
 *
 * **The report is built from a file, not from a fetch.** The panel's other two
 * ways in need the ladder and the replay hosts, and a check that reaches the
 * network is a check that goes red on a train. `scripts/fixtures/ladder-1v1.rpl`
 * is set on the file input, which is the path this whole feature exists for.
 *
 * The harvest is planted in `chrome.storage.local` under the fixture's own game
 * id before the panel opens, because a `.rpl` on its own carries no power, no
 * tempo and no spies — those are what a re-run reads, and re-running a match
 * here would mean booting the game client.
 */
import { readFileSync } from "node:fs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const required = process.argv.includes("--require");
const headed = process.argv.includes("--headed");

/**
 * The assertion count, asserted.
 *
 * A run that dies halfway through prints green lines and stops, which is
 * indistinguishable from a short run that passed. Same tripwire as
 * `drive-memory.mjs`, and for the same reason.
 */
const EXPECTED = 37;

const GAME_ID = "5a41749b-26f9-4303-a69c-5938bb8b219c";

function loadPlaywright() {
  for (const from of [
    join(process.execPath, "..", "node_modules") + "/",
    "C:/Program Files/nodejs/node_modules/",
    "/usr/lib/node_modules/",
    "/usr/local/lib/node_modules/",
  ]) {
    try {
      return createRequire(from)("playwright");
    } catch {
      // Each is a guess at where a global install lives; only all of them
      // failing is news, and the caller reports that.
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

/**
 * A harvest for the fixture match, written the way a re-run would leave one.
 *
 * Deliberately a story rather than noise: Player_A is short of power from 1:00
 * to 1:30 and blacked out on a surplus from 2:00 to 2:20, and puts up a second
 * war factory at 1:30. P_B does neither. A chart that draws the same thing for
 * both sides is a chart that is not reading this.
 */
function plantedHarvest() {
  const samples = [];
  for (let tick = 0; tick <= 14400; tick += 300) {
    const seconds = tick / 60;
    const short = seconds >= 60 && seconds < 90;
    const spied = seconds >= 120 && seconds < 140;
    samples.push({
      tick,
      players: ["Player_A", "P_B"].map((name) => {
        const mine = name === "Player_A";
        return {
          name,
          credits: 2000,
          gained: 2000 + tick,
          harvesters: {},
          derricks: 0,
          power: {
            total: mine && short ? 60 : 400,
            drain: 200,
            low: mine && (short || spied),
            blackout: mine && spied,
          },
          // Shaped like a harvest already sitting in somebody's storage: the
          // six queues the client's own enum has, spelled the way it spells
          // them — `Aircrafts` — and **no** factory table, because runs only
          // started recording one on 2026-08-31. That is the case the collapse
          // has to cover without a re-run, and the case the first version of it
          // did not.
          tempo: {
            speed: mine && short ? 0.55 : 1,
            factories: {
              Structures: 1,
              Armory: 1,
              Infantry: 1,
              Vehicles: mine && seconds >= 90 ? 2 : 1,
              Aircrafts: 0,
              Ships: 0,
            },
          },
          built: 0,
          lost: 0,
          killed: 0,
          defeated: false,
          lostByKind: {},
        };
      }),
    });
  }
  return {
    gameId: GAME_ID,
    at: Date.now(),
    endTick: 14580,
    tick: 14580,
    complete: true,
    wallMillis: 6000,
    ticksPerSecond: 2400,
    players: samples[samples.length - 1].players,
    samples,
    destroyed: [],
    produced: [],
    ready: [],
    captures: [],
    infiltrations: [
      { tick: 4800, name: "NAREFN", owner: "P_B", spy: "SPY", by: "Player_A", effects: ["money"], left: 1500, share: 0.5 },
    ],
  };
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    const how = required ? "FAIL" : "SKIP";
    console.log(`${how}: playwright is not installed globally — this tier did not run.`);
    console.log("      npm i -g playwright && npx playwright install chromium");
    return required ? 1 : 0;
  }

  const profile = mkdtempSync(join(tmpdir(), "cdc-replay-"));
  try {
    for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
      rmSync(join(profile, lock), { recursive: true, force: true });
    }
    const context = await playwright.chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: !headed,
      timeout: 60000,
      args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
    });
    // Every http(s) request refused, so nothing here can reach the ladder or a
    // replay host. **A regex on the scheme and not `**` /`*`**: the latter
    // matches the extension's own pages, and an intercepted `chrome-extension://`
    // navigation never finishes loading.
    await context.route(/^https?:\/\//, (route) => route.abort());
    try {
      await drive(context);
    } catch (e) {
      failed++;
      console.log(`  FAIL the run threw — ${e && e.message ? e.message.split("\n")[0] : e}`);
    } finally {
      await Promise.race([context.close().catch(() => {}), new Promise((r) => setTimeout(r, 10000))]);
    }
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }

  if (ran !== EXPECTED) {
    failed++;
    console.log(`  FAIL the run is incomplete — ${ran} assertions ran, ${EXPECTED} expected`);
  }
  return failed ? 1 : 0;
}

async function drive(context) {
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
  const id = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/options.html`, { waitUntil: "domcontentloaded" });
  // The harvest goes in before the panel is opened: the panel folds a stored
  // run into the report as it draws it, so a plant that lands afterwards is a
  // plant the report never saw.
  await page.evaluate(
    (harvest) => new Promise((done) => chrome.storage.local.set({ sims: { [harvest.gameId]: harvest } }, done)),
    plantedHarvest()
  );
  // A panel is `hidden` until its tab is clicked, and everything inside a
  // hidden panel is unclickable and unmeasurable.
  await page.click('.tab[data-tab="replays"]');
  await page.waitForSelector("#replayFile", { state: "visible", timeout: 20000 });

  // --- a file becomes a report ----------------------------------------------

  await page.setInputFiles("#replayFile", join(here, "fixtures", "ladder-1v1.rpl"));
  await page.waitForSelector(".replayreport .replayaxis", { timeout: 20000 });

  const head = await page.textContent(".replayhead");
  check("a .rpl set on the input draws a report", /tourofegypt/.test(head || ""), head);
  check("the report names the file it came from", /ladder-1v1\.rpl/.test(head || ""), head);
  check(
    "and the planted re-run is folded into it",
    /re-run in/.test(head || ""),
    head
  );

  // The realm probe is a fetch at a host this run refuses, so it misses — which
  // is the state a file the hosts no longer serve is in, and the one where the
  // re-run has to be offered from the file itself.
  await page.waitForFunction(() => /re-run|cannot be re-run/.test(document.querySelector("#replayStatus").textContent), null, {
    timeout: 20000,
  });
  const status = await page.textContent("#replayStatus");
  check("a host that cannot be reached is a miss, and the panel says so", /cannot be re-run/.test(status || ""), status);
  const simmable = await page.evaluate(() => ({
    disabled: document.querySelector("#replaySim").disabled,
    title: document.querySelector("#replaySim").title,
  }));
  check(
    "and the re-run is still offered, because the file itself can be handed over",
    simmable.disabled === false && /handed the file you opened/.test(simmable.title),
    JSON.stringify(simmable)
  );

  // --- the charts, as SVG in a real layout ----------------------------------

  const charts = await page.$$eval(".replaychart figcaption strong", (nodes) => nodes.map((n) => n.textContent));
  check("the power chart is drawn", charts.includes("Power"), charts.join(", "));
  check("the build-speed chart is drawn", charts.includes("Build speed"), charts.join(", "));
  check("and the factory count under it", charts.includes("Factories"), charts.join(", "));

  /**
   * Every chart, measured in a window with room for more than one column.
   *
   * **The width is set rather than assumed.** In a narrow window every chart
   * fills the row whatever the stylesheet says, so a check that they all do
   * would pass there without the rule existing. 1400 is wide enough for three of
   * the columns the charts used to pack into.
   */
  const roomy = page.viewportSize();
  await page.setViewportSize({ width: 1400, height: 1000 });
  // A `ResizeObserver` redraw lands on the next frame, not on the resize, so a
  // measurement taken in the same turn reads the box the chart had in the old
  // window. Two frames, then measure.
  await page.evaluate(() => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))));
  const laid = await page.evaluate(() =>
    [...document.querySelectorAll(".replaychart")].map((chart) => {
      const rect = chart.getBoundingClientRect();
      const tick = chart.querySelector("text.replaytick");
      return {
        name: chart.getAttribute("data-chart"),
        left: Math.round(rect.left),
        width: Math.round(rect.width),
        top: Math.round(rect.top),
        tick: Math.round(tick.getBoundingClientRect().height * 10) / 10,
        plot: Math.round(chart.querySelector(".replayplot").getBoundingClientRect().width),
        // What the SVG states its own width to be, against the pixels it got.
        box: Number(chart.querySelector(".replayplot").getAttribute("viewBox").split(" ")[2]),
      };
    })
  );
  check(
    "every chart is a full-width row, one under the other",
    laid.length > 4 &&
      laid.every((chart) => chart.left === laid[0].left && chart.width === laid[0].width) &&
      laid.every((chart, i) => i === 0 || chart.top > laid[i - 1].top) &&
      laid[0].width > 1200,
    `${laid.length} charts, ${laid[0].width}px wide, tops ${laid.map((c) => c.top).join("/")}`
  );
  check(
    "and each is drawn at the width it got, not scaled to it — the box is the pixels",
    laid.every((chart) => Math.abs(chart.box - chart.plot) <= 2 && chart.plot > 1100) &&
      laid.every((chart) => Math.abs(chart.tick - laid[0].tick) < 1),
    `boxes ${laid[0].box} in ${laid[0].plot}px, labels ${[...new Set(laid.map((c) => c.tick))].join("/")}px`
  );

  /**
   * One crosshair for the page, driven from one chart and read on the others.
   *
   * The node tier calls the handler; this asks whether a real pointer over a
   * real plot reaches every other chart — the rules and the readouts on charts
   * the mouse is nowhere near.
   */
  const plot = await page.$('.replaychart[data-chart="Power"] .replayplot');
  // Nine full-width charts are several screens tall, and a pointer moved to a
  // point below the fold is a pointer over nothing at all: the first run of this
  // reported every chart as unanswering because the Power chart was at y 1500 in
  // a 1000-pixel window.
  await plot.scrollIntoViewIfNeeded();
  const over = await plot.boundingBox();
  await page.mouse.move(over.x + over.width * 0.45, over.y + over.height / 2);
  const ruled = await page.evaluate(() =>
    [...document.querySelectorAll(".replaychart")].map((chart) => ({
      name: chart.getAttribute("data-chart"),
      // The attribute rather than a computed style: `visibility` is what the
      // renderer sets and what a redraw would forget to set.
      rule: chart.querySelector(".replaycross").getAttribute("visibility"),
      at: Math.round(Number(chart.querySelector(".replaycross").getAttribute("x1"))),
      // The clock the readout leads with, and not a slice of the whole thing:
      // the lines under it are named per chart, so a fixed slice compared nine
      // different strings and failed for the wrong reason.
      said: (chart.querySelector(".replayreadout strong") || {}).textContent,
      shown: !chart.querySelector(".replayreadout").hidden,
    }))
  );
  check(
    "hovering one chart rules every chart at the same moment",
    ruled.every((chart) => chart.rule === "visible" && chart.shown) &&
      new Set(ruled.map((chart) => chart.said)).size === 1 &&
      new Set(ruled.map((chart) => chart.at)).size === 1,
    `${ruled.filter((c) => c.shown).length} of ${ruled.length} answering, at ${[...new Set(ruled.map((c) => c.said))].join("/")}`
  );
  // The top-left corner of the window: left of every plot's hit area whatever
  // the page is scrolled to. Moving 200px above the plot put the pointer
  // outside the viewport, where a move is not a move and nothing left anything.
  await page.mouse.move(2, 2);
  const cleared = await page.$$eval(".replaychart .replaycross", (nodes) =>
    nodes.filter((node) => node.getAttribute("visibility") === "visible").length
  );
  check("and taking the pointer away clears all of them", cleared === 0, `${cleared} left ruled`);

  /**
   * A chart carried by its grip with a real pointer, across a page that has to
   * scroll for it to get there.
   *
   * The node tier drives the keyboard, which is the same reorder through the
   * same function. What only a browser can say is whether the gesture works:
   * whether a press on the grip captures the pointer, whether the list settles
   * where the pointer actually is, and — the one that mattered — whether the
   * panel scrolls while a chart is being held. Nine full-width charts are four
   * screens tall, so a drag that cannot scroll can only reach the two charts
   * already on the screen, which is what the first version of this could do.
   */
  const wasOrder = await page.$$eval(".replaychart", (nodes) => nodes.map((n) => n.getAttribute("data-chart")));
  const grabbed = wasOrder[wasOrder.length - 1];
  const scrollTop = () => page.evaluate(() => document.scrollingElement.scrollTop);

  // Down to the last chart, which is where a reader would be to reach its grip.
  await page.evaluate(() => document.querySelector(".replaycharts").lastElementChild.scrollIntoView(false));
  const grip = await page.$(`.replaychart[data-chart="${grabbed}"] .replaygrip`);
  const held = await grip.boundingBox();
  await page.mouse.move(held.x + held.width / 2, held.y + held.height / 2);
  await page.mouse.down();
  const from = await scrollTop();

  // The wheel, which a native drag swallowed outright.
  await page.mouse.wheel(0, -400);
  await page.waitForTimeout(120);
  const wheeled = await scrollTop();
  check(
    "the wheel still scrolls the page while a chart is held",
    wheeled < from - 100,
    `${from} -> ${wheeled} after a 400px wheel`
  );

  // And the edge, held until the panel has carried the chart to the very top.
  await page.mouse.move(held.x + held.width / 2, 12, { steps: 4 });
  // Held there until the panel has carried it all the way: the point of the
  // edge scroll is that the far end of a four-screen report is reachable in one
  // gesture, so the check waits for the far end rather than for a step of it.
  await page.waitForFunction(() => document.scrollingElement.scrollTop === 0, null, { timeout: 20000 }).catch(() => {});
  const edged = await scrollTop();
  await page.mouse.up();
  const nowOrder = await page.$$eval(".replaychart", (nodes) => nodes.map((n) => n.getAttribute("data-chart")));
  const remembered = await page.evaluate(() => localStorage.getItem("cdc.replay.chartorder"));
  check(
    "and holding it at the top edge scrolls the panel there",
    edged === 0 && wheeled > 0,
    `${wheeled} -> ${edged} while held at the edge`
  );
  check(
    "a chart carried from the bottom of the report to the top lands first",
    nowOrder[0] === grabbed && nowOrder.length === wasOrder.length,
    `${wasOrder[wasOrder.length - 1]} was last, now ${nowOrder.slice(0, 2).join(" / ")}`
  );
  check(
    "and the arrangement is remembered",
    JSON.stringify(nowOrder) === remembered,
    `stored ${String(remembered).slice(0, 60)}`
  );

  /**
   * The readout opens above the plot, not over it.
   *
   * The complaint this answers: the box a reader opens to read the numbers sat
   * at the plot's top edge, which is where the lines are. Measured rather than
   * asserted from the stylesheet — what matters is that its bottom is at or
   * above the plot's top on a real layout, at every crosshair position.
   */
  await page.evaluate(() => window.scrollTo(0, 0));
  const readPlot = await page.$('.replaychart[data-chart="Power"] .replayplot');
  await readPlot.scrollIntoViewIfNeeded();
  const seat = await readPlot.boundingBox();
  const seats = [];
  // Inside the hit area at both ends: it starts at the axis gutter and stops
  // short of the right margin the line labels live in, so 0.95 of the SVG is
  // past it — the pointer leaves the plot and the readout shuts, which is a
  // measurement of a hidden box rather than of a badly placed one.
  for (const share of [0.06, 0.5, 0.9]) {
    await page.mouse.move(seat.x + seat.width * share, seat.y + seat.height / 2);
    seats.push(
      await page.evaluate(() => {
        const chart = document.querySelector('.replaychart[data-chart="Power"]');
        const box = chart.querySelector(".replayreadout").getBoundingClientRect();
        const plot = chart.querySelector(".replayplot").getBoundingClientRect();
        const figure = chart.getBoundingClientRect();
        return {
          clearsPlot: Math.round(box.bottom - plot.top) <= 1,
          insideLeft: Math.round(box.left - figure.left) >= -1,
          insideRight: Math.round(figure.right - box.right) >= -1,
          width: Math.round(box.width),
        };
      })
    );
  }
  check(
    "the readout opens clear of the plot rather than over the lines",
    seats.every((seat) => seat.clearsPlot) && seats.every((seat) => seat.width > 40),
    seats.map((s) => `${s.clearsPlot ? "clear" : "OVER"} ${s.width}px`).join(", ")
  );
  check(
    "and it stays inside the chart at either end of the clock",
    seats.every((seat) => seat.insideLeft && seat.insideRight),
    seats.map((s) => `${s.insideLeft ? "in" : "OUT"}/${s.insideRight ? "in" : "OUT"}`).join(", ")
  );
  await page.mouse.move(2, 2);
  if (roomy) await page.setViewportSize(roomy);

  // --- the legend has to fit, which is the one thing only a layout can say ---

  const fits = await page.evaluate(() => {
    const measure = (title) => {
      const chart = [...document.querySelectorAll(".replaychart")].find(
        (node) => node.querySelector("figcaption strong").textContent === title
      );
      const legend = chart.querySelector(".replaylegend");
      const plot = chart.querySelector(".replayplotwrap");
      const rows = [...chart.querySelectorAll(".replayseries")];
      const keys = [...chart.querySelectorAll(".replaykey")];
      return {
        // The complaint this answers: the keys ran off to the side of the chart
        // rather than wrapping under it.
        overflows: legend.scrollWidth > legend.clientWidth + 1,
        wider: Math.round(legend.getBoundingClientRect().width - plot.getBoundingClientRect().width),
        rows: rows.length,
        // Every key of one side starts where the side above it starts, which is
        // the whole point of writing the name once.
        // The first key of each row, whatever kind of element it is: only a
        // chart whose legend toggles has buttons, and the power chart's keys are
        // plain spans.
        keyLefts: rows
          .map((row) => row.children[1])
          .filter(Boolean)
          .map((key) => Math.round(key.getBoundingClientRect().left)),
        // The legend and not the whole chart: the crosshair readout draws the
        // same swatch beside every line it names, so a chart that has been
        // hovered carries four more of them and this counted fourteen keys in
        // a legend of ten — and the readout ones are hidden, so they measure 0.
        swatches: legend.querySelectorAll("svg.replayswatch").length,
        keyCount: rows.reduce((total, row) => total + row.children.length - 1, 0),
        // A swatch with no width on the screen is a key with no key in it.
        swatchWidths: [...legend.querySelectorAll("svg.replayswatch")].map((s) =>
          Math.round(s.getBoundingClientRect().width)
        ),
        names: [...chart.querySelectorAll(".replaysidename")].map((n) => n.textContent),
        keys: keys.map((k) => k.textContent.trim()),
      };
    };
    return { tempo: measure("Build speed"), power: measure("Power") };
  });
  check(
    "the build-speed legend fits its chart rather than running off the side",
    fits.tempo.overflows === false && fits.tempo.wider <= 0,
    `overflows ${fits.tempo.overflows}, ${fits.tempo.wider}px wider than the plot`
  );
  check(
    "it is a row per side, with the keys of each starting at the same place",
    fits.tempo.rows === 2 && new Set(fits.tempo.keyLefts).size === 1,
    `${fits.tempo.rows} rows, keys start at ${fits.tempo.keyLefts.join(" and ")}`
  );
  check(
    "the side's name is written once per row and not once per key",
    fits.tempo.names.join(",") === "Player_A,P_B" && fits.tempo.keys.every((k) => !/Player_A|P_B/.test(k)),
    `${fits.tempo.names.join(", ")} over ${fits.tempo.keys.join(", ")}`
  );
  check(
    "every key is a piece of line with a width on the screen",
    fits.tempo.swatches === fits.tempo.keyCount && fits.tempo.swatchWidths.every((w) => w >= 8),
    `${fits.tempo.swatches} swatches, ${[...new Set(fits.tempo.swatchWidths)].join("/")}px`
  );
  check(
    "the Defence tab draws no second line — it reads the same yards as Structures",
    fits.tempo.keys.length === 10 && !fits.tempo.keys.some((k) => /armory/.test(k)),
    fits.tempo.keys.join(", ")
  );
  check(
    "and a harvest with no factory table gets that for free, with no re-run",
    fits.tempo.keys.slice(0, 5).join(",") === "structures,infantry,vehicles,aircraft,ships",
    fits.tempo.keys.join(", ")
  );
  /**
   * The same measurement in a window too narrow to hold a row.
   *
   * At the default size five keys fit beside each other and nothing overflows
   * whatever the CSS says — measured, when a `flex-wrap: nowrap` mutation
   * survived the check above. A legend is only asked to wrap when there is
   * something to wrap, so the window is made small enough to ask.
   */
  const wide = page.viewportSize();
  await page.setViewportSize({ width: 380, height: 900 });
  const narrow = await page.evaluate(() => {
    const chart = [...document.querySelectorAll(".replaychart")].find(
      (node) => node.querySelector("figcaption strong").textContent === "Build speed"
    );
    const legend = chart.querySelector(".replaylegend");
    return {
      overflows: legend.scrollWidth > legend.clientWidth + 1,
      wider: Math.round(legend.getBoundingClientRect().width - chart.querySelector(".replayplotwrap").getBoundingClientRect().width),
      // More than one line of keys for a side is the wrap having happened.
      lines: [...chart.querySelectorAll(".replayseries")].map((row) =>
        new Set([...row.children].map((kid) => Math.round(kid.getBoundingClientRect().top))).size
      ),
    };
  });
  if (wide) await page.setViewportSize(wide);
  check(
    "and in a window too narrow for a row it wraps instead of running off",
    narrow.overflows === false && narrow.wider <= 0 && narrow.lines.some((n) => n > 1),
    `overflows ${narrow.overflows}, ${narrow.wider}px wider, ${narrow.lines.join("/")} lines of keys`
  );

  check(
    "the power legend groups the same way",
    fits.power.rows === 2 && fits.power.names.join(",") === "Player_A,P_B" && fits.power.overflows === false,
    `${fits.power.rows} rows, ${fits.power.names.join(", ")}`
  );

  const power = await page.evaluate(() => {
    const chart = [...document.querySelectorAll(".replaychart")].find(
      (node) => node.querySelector("figcaption strong").textContent === "Power"
    );
    return {
      note: chart.querySelector("figcaption span").textContent,
      bands: chart.querySelectorAll("rect.replayband").length,
      // A band with no width is a band nobody can see.
      widths: [...chart.querySelectorAll("rect.replayband")].map((r) => Math.round(r.getBoundingClientRect().width)),
      lines: chart.querySelectorAll("polyline.replayline").length,
    };
  });
  check("both sides get a produced and a used line", power.lines === 4, String(power.lines));
  check("the outages are shaded", power.bands === 2, String(power.bands));
  check("and every band has a width on the screen", power.widths.every((w) => w >= 1), power.widths.join(", "));
  check("the chart's own line adds the outages up", /2 outages/.test(power.note), power.note);

  // --- the legend is a control ----------------------------------------------

  const before = await page.evaluate(() => {
    const chart = [...document.querySelectorAll(".replaychart")].find(
      (node) => node.querySelector("figcaption strong").textContent === "Build speed"
    );
    return {
      keys: chart.querySelectorAll("button.replaykey").length,
      on: [...chart.querySelectorAll('button.replaykey[aria-pressed="true"]')].map((b) => b.textContent.trim()),
      lines: chart.querySelectorAll("polyline.replayline").length,
    };
  });
  check("every queue is offered as a key", before.keys === 10, String(before.keys));
  check(
    "and it starts on infantry and vehicles",
    before.on.length === 4 && before.on.every((label) => /infantry|vehicles/.test(label)),
    before.on.join(", ")
  );

  // A key whose queue never had a factory can draw nothing, so it is not a
  // control -- clicking one did exactly nothing until a browser showed it.
  const dead = await page.evaluate(() => {
    const chart = [...document.querySelectorAll(".replaychart")].find(
      (node) => node.querySelector("figcaption strong").textContent === "Build speed"
    );
    const keys = [...chart.querySelectorAll("button.replaykey")];
    return {
      order: keys.map((b) => b.textContent.trim()),
      disabled: keys.filter((b) => b.disabled).map((b) => b.textContent.trim()),
      why: (keys.find((b) => b.disabled) || {}).title,
    };
  });
  check(
    "the queues are listed in the sidebar's order, not in whatever order storage returned them",
    dead.order.slice(0, 5).join(",") === "structures,infantry,vehicles,aircraft,ships",
    dead.order.join(", ")
  );
  check(
    "a queue that never had a factory offers no control, and says why",
    dead.disabled.length === 4 && /no factory for it at any point/.test(dead.why || ""),
    `${dead.disabled.join(", ")} — ${dead.why}`
  );

  // The click goes on a key that CAN draw: the point of the assertion below is
  // that a real click puts a real line on a real chart.
  await page.click('.replaychart:has(strong:text-is("Build speed")) button.replaykey[aria-pressed="false"]:not([disabled])');
  const after = await page.evaluate(() => {
    const chart = [...document.querySelectorAll(".replaychart")].find(
      (node) => node.querySelector("figcaption strong").textContent === "Build speed"
    );
    return {
      on: chart.querySelectorAll('button.replaykey[aria-pressed="true"]').length,
      lines: chart.querySelectorAll("polyline.replayline").length,
    };
  });
  check("a real click on a key turns its line on", after.on === before.on.length + 1, `${before.on.length} -> ${after.on}`);
  check("and the line is actually drawn", after.lines > before.lines, `${before.lines} -> ${after.lines}`);

  // --- the spy --------------------------------------------------------------

  const spy = await page.evaluate(() => {
    const cells = [...document.querySelectorAll(".replaycell")].filter((c) => /spied|infiltrated/.test(c.className));
    return { count: cells.length, titles: cells.map((c) => c.title) };
  });
  check(
    "the infiltration is drawn on both sides, with what it did on the row",
    spy.count === 2 && spy.titles.every((t) => /about 1500 credits taken/.test(t)),
    `${spy.count}: ${spy.titles.join(" | ")}`
  );
}

process.exit(await main());
