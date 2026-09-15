/**
 * The browser tier, in Firefox: the extension as this repo holds it, installed
 * into a real Firefox, on a stub page at the game's origin.
 *
 *   node scripts/drive-firefox.mjs            skips politely with no puppeteer-core or no Firefox
 *   node scripts/drive-firefox.mjs --require  absent driver or browser is a failure, not a skip
 *   node scripts/drive-firefox.mjs --headed   watch it happen
 *
 * **Why puppeteer-core and not Playwright**, which every other driver here uses:
 * Playwright's Firefox is a patched build that cannot install an extension.
 * WebDriver BiDi can (`webExtension.install`), and puppeteer-core speaks BiDi to
 * the Firefox that is already installed. It is resolved from a global install,
 * `npm i -g puppeteer-core`, for the reason drive-memory.mjs gives: the repo keeps
 * no package.json.
 *
 * What it proves is the part of the extension that differs between browsers:
 *
 * - Firefox accepts the manifest — `background.scripts` beside
 *   `service_worker`, and the gecko block.
 * - Both MAIN-world content-script groups inject: `document_start` and
 *   `document_idle`.
 * - The isolated-world bridge answers the page: the version the page reports
 *   can only have come from `chrome.runtime.getManifest()` over that wire.
 * - A pref the page sends is written to `chrome.storage.local` and read back
 *   in the next config push.
 * - The client's fullscreen request goes out with `keyboardLock: "browser"` and
 *   Firefox reads it (Firefox 151+). Whether Ctrl+W then stays in the page is
 *   not provable here: BiDi key input never reaches the browser's own shortcut
 *   handling, so a driven Ctrl+W does not close a tab even with no lock
 *   (measured 2026-09-15, Firefox 155).
 *
 * What it cannot reach: the options page and the background script. BiDi
 * refuses to navigate to `moz-extension://` (measured 2026-09-15, Firefox
 * 155), and the background has no effect a page can observe without starting a
 * render run. Both stay a human check.
 */
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, resolve } from "node:path";
import { existsSync, readFileSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const required = process.argv.includes("--require");
const headed = process.argv.includes("--headed");

const ORIGIN = "https://game.chronodivide.com/";
const manifest = JSON.parse(readFileSync(join(root, "manifest.json"), "utf8"));

/** How many assertions a complete run makes — see EXPECTED in drive-memory.mjs. */
const EXPECTED = 10;

const STUB = `<!doctype html><html><head><title>stub</title></head>
<body><div id="ra2web-root"></div></body></html>`;

/**
 * puppeteer-core is an ES module, and `require` of one fails on the Node this
 * repo runs (20.5), so the global install is only *resolved* through
 * createRequire and then imported.
 */
async function loadPuppeteer() {
  for (const from of [
    join(process.execPath, "..", "node_modules") + "/",
    "C:/Program Files/nodejs/node_modules/",
    "/usr/lib/node_modules/",
    "/usr/local/lib/node_modules/",
  ]) {
    let path;
    try {
      path = createRequire(from).resolve("puppeteer-core");
    } catch {
      // Each candidate is a guess at where a global install lives; only the
      // failure of all of them is news, and the caller reports that.
      continue;
    }
    return (await import(pathToFileURL(path).href)).default;
  }
  return null;
}

function findFirefox() {
  return [
    process.env.FIREFOX,
    "C:/Program Files/Mozilla Firefox/firefox.exe",
    "C:/Program Files (x86)/Mozilla Firefox/firefox.exe",
    "/usr/bin/firefox",
    "/Applications/Firefox.app/Contents/MacOS/firefox",
  ].find((p) => p && existsSync(p));
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

async function main() {
  const puppeteer = await loadPuppeteer();
  const firefox = findFirefox();
  if (!puppeteer || !firefox) {
    const how = required ? "FAIL" : "SKIP";
    const what = !puppeteer ? "puppeteer-core is not installed globally" : "no Firefox found (set FIREFOX)";
    console.log(`${how}: ${what} — this tier did not run.`);
    if (!puppeteer) console.log("      npm i -g puppeteer-core");
    return required ? 1 : 0;
  }

  const browser = await puppeteer.launch({
    browser: "firefox",
    executablePath: firefox,
    headless: !headed,
    // A driven page has no user gesture, and fullscreen needs one. This lifts
    // only that; the keyboard-lock option is still Firefox's own to read.
    extraPrefsFirefox: { "full-screen-api.allow-trusted-requests-only": false },
  });
  try {
    const id = await browser.installExtension(root);
    eq("Firefox installs the extension under the manifest's gecko id", id, manifest.browser_specific_settings?.gecko?.id);

    const page = await browser.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await page.setRequestInterception(true);
    page.on("request", (request) =>
      request.url() === ORIGIN
        ? request.respond({ status: 200, contentType: "text/html", body: STUB })
        : request.abort()
    );
    await page.goto(ORIGIN, { waitUntil: "load" });

    const injected = await page
      .waitForFunction(() => !!window.__cdcGl && !!window.__cdc, { timeout: 20000 })
      .then(() => true, () => false);
    check("the document_start group injects in the MAIN world", await page.evaluate(() => !!window.__cdcGl));
    check("the document_idle group injects in the MAIN world", injected && (await page.evaluate(() => !!window.__cdc)));

    // Waited for on the bridge state, not on the version: the version reads "?"
    // until a config arrives, and "?" is truthy.
    const bridge = await page
      .waitForFunction(() => window.__cdc && window.__cdc.state.bridge === "connected", { timeout: 20000 })
      .then(() => "connected", () => page.evaluate(() => window.__cdc && window.__cdc.state.bridge));
    eq("the page records the bridge as connected", bridge, "connected");
    // The page has no chrome.* — a version here came over the bridge.
    eq("the bridge hands the page the manifest's version", await page.evaluate(() => window.__cdc.version), manifest.version);

    // A pref written from the page, then read back in a config push asked for
    // afterwards. A nonce, so a value left in some profile cannot pass it.
    const nonce = `drive-${Date.now()}`;
    const echoed = await page.evaluate(
      (mark) =>
        new Promise((done) => {
          const timer = setTimeout(() => done(null), 10000);
          window.addEventListener("message", (event) => {
            const data = event.data;
            if (!data || data.source !== "cdc-bridge" || data.type !== "config") return;
            if (!data.prefs || data.prefs.driveMark !== mark) return;
            clearTimeout(timer);
            done(data.prefs.driveMark);
          });
          window.postMessage({ source: "cdc-page", type: "prefs-set", prefs: { driveMark: mark } }, "*");
          // The write is asynchronous and says nothing to the page, so ask until
          // the answer carries it or the timer gives up.
          const ask = () => {
            window.postMessage({ source: "cdc-page", type: "ready" }, "*");
            setTimeout(ask, 250);
          };
          ask();
        }),
      nonce
    );
    eq("a pref the page sends is stored and read back", echoed, nonce);

    // The Chrome path stands down on exactly this. If Firefox ever grows the
    // Keyboard API, this fails, and the two paths need looking at together.
    eq("Firefox has no Keyboard API", await page.evaluate(() => typeof navigator.keyboard), "undefined");

    // The client's own fullscreen request, as the client makes it. Firefox reads
    // the keyboardLock option the hook adds, which is the only way the status
    // below can say "taken": a browser that ignores the option never reads it.
    // Not in a match on a stub, so taken but not held for the grid.
    const lock = await page.evaluate(async () => {
      await document.getElementById("ra2web-root").requestFullscreen();
      await new Promise((done) => setTimeout(done, 300));
      return { fullscreen: !!document.fullscreenElement, status: window.__cdc.chords().keyboardLock };
    });
    check(
      "Firefox takes the keyboard lock with the client's fullscreen request",
      lock.fullscreen && lock.status.startsWith("taken with fullscreen, not in a match"),
      JSON.stringify(lock)
    );
    // What the options page asks before it enables the setting.
    eq(
      "Firefox reads the fullscreen keyboardLock option, so the setting is enabled",
      await page.evaluate(() => {
        let read = false;
        const probe = document.createElement("div").requestFullscreen({
          get keyboardLock() {
            read = true;
            return "none";
          },
        });
        probe.catch(() => {});
        return read;
      }),
      true
    );

    check("the stub boots with no page errors", errors.length === 0, errors.slice(0, 3).join(" | "));
  } finally {
    await browser.close();
  }

  if (ran !== EXPECTED) {
    failed++;
    console.log(`  FAIL the run is incomplete — ${ran} assertions ran, ${EXPECTED} expected`);
  }
  return failed ? 1 : 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.log(`  FAIL the driver threw — ${(e && e.stack) || e}`);
    process.exit(1);
  }
);
