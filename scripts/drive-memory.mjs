/**
 * The memory readout, driven in a real browser with the real extension loaded.
 *
 *   node scripts/drive-memory.mjs            headless
 *   node scripts/drive-memory.mjs --headed   watch it happen
 *   node scripts/drive-memory.mjs --require  absent playwright is a failure, not a skip
 *
 * **Why this tier exists.** `scripts/check-*.mjs` prove logic without a browser
 * and are the right shape for algebra — but nothing in that tier can say whether
 * the extension *loads*, whether a key reaches a handler, or whether a panel
 * appears. Every one of those questions was being written into a task's
 * `### Checks` block and handed to the user, because "testable without a human"
 * was being read as "testable without a browser". Measured 2026-08-24: that had
 * put **81 tasks and 450 checkboxes** into `REVIEW/` with **zero** verdicts ever
 * recorded, the oldest seventeen days old. The gate was not overloaded; it had
 * never once functioned.
 *
 * So this is the missing rung: a browser, the unpacked extension, and
 * assertions. It is the first of its kind here and is written to be copied —
 * `main()` and `phase()` are the whole pattern; everything specific to this
 * feature is in the three `run*Checks` bodies below them.
 *
 * **No client, on purpose.** Content scripts are matched by URL, so the game's
 * origin is *served locally* by `context.route` rather than fetched. That buys
 * determinism and speed: no network, no 206 MB of game data in IndexedDB, no
 * check that fails on a train. The cost is stated rather than hidden — this
 * tier cannot see the client's own hooks or modules, and anything needing a
 * running match belongs a rung higher. It is the right trade for this feature
 * specifically: `src/gl-meter.js` instruments **any** WebGL context on the
 * page, so a canvas this file creates itself is a better subject than the
 * client's — its allocations are known to the byte, which is what turns
 * "the number is plausible" into an assertion.
 *
 * **`channel: "chromium"` is load-bearing.** Playwright's default headless is
 * the headless *shell*, which does not load extensions at all — measured here,
 * it reports zero service workers and every check would fail for a reason
 * having nothing to do with the extension. The full Chromium in new-headless
 * mode does load them.
 *
 * **What this tier gave up on, and why it is written down.** Killing a tab the
 * way a player's tab dies — `Page.crash`, so `pagehide` never runs and the
 * trace is left without its closing mark — was attempted three times and
 * abandoned. The renderer crash takes the whole browser with it, and the
 * profile it leaves behind cannot be relaunched: clearing Chrome's
 * `Singleton*` locks was not enough, and the third attempt sat blocked for
 * **fifty minutes** having printed twenty green lines and no verdict. The
 * mechanism is covered where it can be covered honestly — `check-memory.mjs`
 * proves a trace with no closing mark reads back as a death — and the one
 * thing only a real crash can prove stays a human check. A rung that hangs is
 * worse than a rung that admits its edge.
 *
 * **No package.json.** The repo has no dependencies and this does not add one:
 * Playwright is resolved from a global install, and the run reports SKIP rather
 * than failing if there is none. `check-*.mjs` stay the tier that runs anywhere.
 */
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const headed = process.argv.includes("--headed");

/**
 * Make an absent Playwright a failure rather than a polite nothing.
 *
 * Without this the missing-driver path below prints SKIP and returns 0, so
 * "this tier did not run" is indistinguishable from "this tier passed" to
 * anything that tests an exit code -- a gate, an integration step, an
 * autonomous run. One `npm rm -g playwright` and the only browser check in the
 * repo becomes a no-op that reports success, which is worse than not having it:
 * the align-panel stub called that out as the fragile half of resolving a
 * global install, before this file existed to demonstrate it.
 *
 * So the default stays quiet, because check-*.mjs must keep running anywhere,
 * and the caller that actually depends on this tier asks for --require.
 */
const required = process.argv.includes("--require");

const ORIGIN = "https://game.chronodivide.com/";

// One texture of exactly a megabyte, so the meter's arithmetic is checked
// against a number written here rather than against itself.
const TEX_EDGE = 512; // 512 * 512 * 4 bytes = 1 MB
const TEX_COUNT = 64; // ...so 64 MB, well clear of any rounding

// The readout samples every 5 s with the panel shut (SAMPLE_IDLE_MILLIS). Waits
// keyed to that rather than to a round number, with one sample of headroom.
const SAMPLE_WAIT = 7000;

/**
 * How many assertions a complete run makes.
 *
 * A tripwire, not bookkeeping. The first run of this file drove the browser to
 * a deliberate renderer crash, lost the browser with it, and **exited 0 having
 * printed nothing but `ok` lines** — three assertions never ran and the run
 * looked like a pass. A count checked at the end is the only thing that tells a
 * short run from a good one, and this repo has been bitten by the same shape
 * before (see the note on piping a node run through `2>&1`).
 */
const EXPECTED = 19;

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
function eq(name, got, want) {
  check(name, got === want, `got ${JSON.stringify(got)}, wanted ${JSON.stringify(want)}`);
}

const STUB = `<!doctype html><html><head><title>stub</title></head>
<body><div id="ra2web-root"></div></body></html>`;

/** A fresh page on the game's origin, with the content scripts installed. */
async function openStub(context) {
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdcMem && !!window.__cdcGl, null, { timeout: 20000 });
  return page;
}

/** Allocate a known number of known-sized textures on a context of our own. */
async function allocate(page) {
  return page.evaluate(
    ([edge, count]) => {
      const gl = document.createElement("canvas").getContext("webgl2");
      const textures = [];
      for (let i = 0; i < count; i++) {
        const t = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, edge, edge, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        textures.push(t);
      }
      window.__driveGl = gl;
      window.__driveTextures = textures;
      return window.__cdcGl.read().bytes.textures;
    },
    [TEX_EDGE, TEX_COUNT]
  );
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    const how = required ? "FAIL" : "SKIP";
    console.log(`${how}: playwright is not installed globally — this tier did not run.`);
    console.log("      npm i -g playwright && npx playwright install chromium");
    return required ? 1 : 0;
  }

  // One profile, three browsers on it in turn.
  //
  // Throwaway per run, and that is what makes the trace assertion mean
  // anything: `localStorage` starts empty, so a trace that is found was
  // written by this run rather than left behind by the last.
  //
  // The profile outlives each browser on purpose: `localStorage` is what
  // carries the trace from the tab that dies to the boot that reports it, so
  // the phases have to share an origin's storage while *not* sharing a browser
  // — the crash phase kills its own, which is the whole point of it.
  const profile = mkdtempSync(join(tmpdir(), "cdc-drive-"));
  try {
    await phase(playwright, profile, runPanelChecks);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }

  // The tripwire. A run that died halfway has every right to look like a pass
  // otherwise — see EXPECTED.
  if (ran !== EXPECTED) {
    failed++;
    console.log(`  FAIL the run is incomplete — ${ran} assertions ran, ${EXPECTED} expected`);
  }
  return failed ? 1 : 0;
}

/**
 * One browser on a shared profile, closed however the body ends.
 *
 * **The singleton locks are why this is a function and not three inline
 * launches.** A browser whose renderer was crashed on purpose does not get to
 * clean up after itself, and Chrome guards a profile directory with
 * `SingletonLock` / `SingletonCookie` / `SingletonSocket`. Left behind by the
 * crash, they make the *next* launch on that profile block for ever rather than
 * fail — which is exactly what happened: the run printed twenty green lines,
 * hung silently in the third phase, and produced no verdict at all. Clearing
 * them is safe here because the profile is a temp directory this file made and
 * no other browser can be using it.
 */
async function phase(playwright, profile, body) {
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    rmSync(join(profile, lock), { recursive: true, force: true });
  }
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !headed,
    // A launch that blocks is worse than one that fails: it strands the run
    // with nothing to report, which is the failure this whole file is against.
    timeout: 60000,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  // Routed on the context so every page this phase opens is served, not fetched.
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
    // A browser whose renderer was crashed on purpose does not always shut down
    // politely, and a hung close would strand the run at the one point it has
    // nothing left to say. Bounded, and the profile is a temp dir either way.
    await Promise.race([
      context.close().catch(() => {}),
      new Promise((r) => setTimeout(r, 10000)),
    ]);
  }
}

async function runPanelChecks(context) {
  const page = await openStub(context);

  // --- the extension is actually there, in a real browser ------------------

  const present = await page.evaluate(() => ({
    gl: !!window.__cdcGl,
    mem: !!window.__cdcMem,
    cdc: !!window.__cdc,
    memory: typeof (window.__cdc || {}).memory === "function",
  }));
  check("gl-meter.js installed at document_start", present.gl);
  check("mem-readout.js installed", present.mem);
  check("companion.js installed", present.cdc);
  check("__cdc.memory is wired", present.memory);

  // --- the meter against an allocation known to the byte -------------------
  //
  // This is the check the task doc handed to the user as "compare it with
  // Chrome's task manager, order of magnitude is the bar". Against a canvas we
  // fill ourselves the bar is exactness, which is strictly better evidence and
  // costs nobody an afternoon.

  const before = await page.evaluate(() => window.__cdcGl.read());
  // null, not zero: `read()` says "no context has been taken yet", and a zero
  // would be the different and false claim that one exists holding nothing.
  eq("the meter reads null before any context exists", before, null);

  const after = await allocate(page);
  eq(`${TEX_COUNT} textures of ${TEX_EDGE}px read back exactly`, after, TEX_COUNT * TEX_EDGE * TEX_EDGE * 4);

  const live = await page.evaluate(() => window.__cdcGl.read().live.textures);
  eq("and the live count matches", live, TEX_COUNT);

  const freed = await page.evaluate(() => {
    const gl = window.__driveGl;
    for (const t of window.__driveTextures.splice(0, 32)) gl.deleteTexture(t);
    return window.__cdcGl.read().bytes.textures;
  });
  eq("deleting half gives half the bytes back", freed, (TEX_COUNT / 2) * TEX_EDGE * TEX_EDGE * 4);

  // --- the key, the panel, and where it was left ---------------------------

  eq("the panel is not up to begin with", await page.locator(".cdc-mem").count(), 0);

  await page.keyboard.press("Alt+k");
  await page.waitForSelector(".cdc-mem", { timeout: 5000 }).catch(() => {});
  eq("Alt+K opens the panel", await page.locator(".cdc-mem").count(), 1);

  // The panel is drawn from the same reading, so what it shows is the other
  // half of the arithmetic above: 32 MB left after the half-delete.
  const shown = await page.locator(".cdc-mem-body").innerText();
  check(
    "the panel shows the megabytes the meter holds",
    shown.includes(`${(TEX_COUNT / 2) * TEX_EDGE * TEX_EDGE * 4 / (1024 * 1024)} MB`),
    JSON.stringify(shown.slice(0, 160))
  );

  const box = await page.locator(".cdc-mem").boundingBox();
  const head = page.locator(".cdc-mem-head");
  const grip = await head.boundingBox();
  await page.mouse.move(grip.x + grip.width / 2, grip.y + grip.height / 2);
  await page.mouse.down();
  await page.mouse.move(grip.x + grip.width / 2 + 140, grip.y + grip.height / 2 + 90, { steps: 8 });
  await page.mouse.up();
  const moved = await page.locator(".cdc-mem").boundingBox();
  check("the panel drags", Math.abs(moved.x - box.x - 140) < 4 && Math.abs(moved.y - box.y - 90) < 4,
    `moved by ${Math.round(moved.x - box.x)},${Math.round(moved.y - box.y)}`);

  const stored = await page.evaluate(() => localStorage.getItem("cdc.memRect"));
  check("and where it was left is persisted", !!stored && JSON.parse(stored).left > 0, String(stored));

  // Reopened on a new page, it comes up where it was dragged to — the actual
  // claim, rather than "a key was written to storage".
  await page.close();
  const second = await openStub(context);
  await second.keyboard.press("Alt+k");
  await second.waitForSelector(".cdc-mem", { timeout: 5000 }).catch(() => {});
  const reopened = await second.locator(".cdc-mem").boundingBox();
  check(
    "and it opens there next time",
    reopened && Math.abs(reopened.x - moved.x) < 4 && Math.abs(reopened.y - moved.y) < 4,
    reopened ? `${Math.round(reopened.x)},${Math.round(reopened.y)} vs ${Math.round(moved.x)},${Math.round(moved.y)}` : "no panel"
  );

  // --- the alarm forces itself open ----------------------------------------
  //
  // The blank screen, produced on purpose rather than waited for. This is the
  // whole feature: the panel has to appear without anyone asking it to.

  await second.keyboard.press("Alt+k");
  eq("the panel closes again", await second.locator(".cdc-mem").count(), 0);

  await allocate(second);
  await second.evaluate(() => {
    window.__driveGl.getExtension("WEBGL_lose_context").loseContext();
  });
  await second.waitForSelector(".cdc-mem", { timeout: SAMPLE_WAIT }).catch(() => {});
  eq("a lost context opens the panel with nobody pressing anything",
    await second.locator(".cdc-mem").count(), 1);

  const alarm = await second.locator(".cdc-mem-alarm").innerText().catch(() => "");
  check("and it says what happened", alarm.includes("graphics context was lost"), JSON.stringify(alarm));

  // Dismissing an alarm has to stick, or the key looks broken: the panel would
  // reappear on the next sample and no press could get rid of it.
  await second.keyboard.press("Alt+k");
  eq("the alarm can be dismissed", await second.locator(".cdc-mem").count(), 0);
  await second.waitForTimeout(SAMPLE_WAIT);
  eq("and it stays dismissed for the same alarm", await second.locator(".cdc-mem").count(), 0);

}

const code = await main();

// The summary has to agree with the exit code. Reading `failed` alone, it
// announced "0 checks, all good" while exiting 1 on --require, and called a
// skip that asserted nothing good as well. A run that did nothing is exactly
// what this tier's EXPECTED tripwire exists to catch, so the last line the run
// prints may not be the thing that hides it.
console.log(
  failed
    ? `\n${failed} FAILED of ${ran}`
    : code
      ? `\nthe run did not succeed, having asserted ${ran} — see above`
      : ran
        ? `\n${ran} checks, all good`
        : `\nnothing ran`,
);
process.exit(code);
