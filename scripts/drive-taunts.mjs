/**
 * The taunt overlay, driven in a real browser with the real extension loaded.
 *
 *   node scripts/drive-taunts.mjs            headless
 *   node scripts/drive-taunts.mjs --headed   watch it happen
 *   node scripts/drive-taunts.mjs --require  absent playwright is a failure, not a skip
 *
 * The second file of this tier; `scripts/drive-memory.mjs` is the first and the
 * pattern — `main()`, `phase()`, a `check` counter and an `EXPECTED` tripwire —
 * is copied from it deliberately rather than reinvented. Its header carries the
 * reasoning the two share: why `channel: "chromium"` is load-bearing, why the
 * game's origin is served locally instead of fetched, and why an absent
 * Playwright is a SKIP unless the caller says otherwise.
 *
 * **What this rung can prove here, and what it cannot.** With no client on the
 * page there is no match, no `KeyBinds` and no `Engine.taunts` — so everything
 * the overlay *says* about a taunt is the no-match answer, which is worth
 * asserting because it is the answer a player gets on the main menu and it must
 * not be a blank box or a broken key. What needs a running match — the taunt
 * actually reaching another player, the cooldown counting, a rebind landing in
 * the client's `keyboard.ini` — stays a human check, and the task doc says so.
 *
 * The second phase is the options page, which is the half that has already
 * broken once: `src/options.js` shipped a syntax error in 1.7.0 and the whole
 * page loaded no script at all. `scripts/check-parse.mjs` catches that shape
 * without a browser; this catches the shape one rung up — the page renders, the
 * editor is on it, and clicking it writes what the game tab reads.
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

/** The overlay's shipped key, as Playwright spells a press of it. */
const TAUNT_KEY = "Alt+y";

/**
 * How many assertions a complete run makes.
 *
 * The tripwire, and the reason drive-memory.mjs has one: a run that dies
 * halfway prints nothing but `ok` lines and exits 0, which is indistinguishable
 * from a pass to anything reading an exit code.
 */
const EXPECTED = 59;

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

async function openStub(context) {
  const page = await context.newPage();
  await page.goto(ORIGIN, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.__cdc, null, { timeout: 20000 });
  return page;
}

async function main() {
  const playwright = loadPlaywright();
  if (!playwright) {
    const how = required ? "FAIL" : "SKIP";
    console.log(`${how}: playwright is not installed globally — this tier did not run.`);
    console.log("      npm i -g playwright && npx playwright install chromium");
    return required ? 1 : 0;
  }

  const profile = mkdtempSync(join(tmpdir(), "cdc-taunt-"));
  try {
    await phase(playwright, profile, runOverlayChecks);
    await phase(playwright, profile, runOptionsChecks);
    await phase(playwright, profile, runAuditionChecks);
  } finally {
    rmSync(profile, { recursive: true, force: true });
  }

  if (ran !== EXPECTED) {
    failed++;
    console.log(`  FAIL the run is incomplete — ${ran} assertions ran, ${EXPECTED} expected`);
  }
  return failed ? 1 : 0;
}

async function phase(playwright, profile, body) {
  for (const lock of ["SingletonLock", "SingletonCookie", "SingletonSocket"]) {
    rmSync(join(profile, lock), { recursive: true, force: true });
  }
  const context = await playwright.chromium.launchPersistentContext(profile, {
    channel: "chromium",
    headless: !headed,
    timeout: 60000,
    args: [`--disable-extensions-except=${root}`, `--load-extension=${root}`],
  });
  // The game's origin is served from here and every other http(s) request is
  // refused, so a run cannot depend on the network. **The pattern is a regex on
  // the scheme rather than `**/*`**: the latter matches the extension's own
  // pages too, and an intercepted `chrome-extension://` navigation never
  // finishes loading — measured, as twenty seconds of waiting for a page that
  // renders instantly when it is left alone. Those are local files inside the
  // browser, not network, and there is nothing here to serve them.
  await context.route(/^https?:\/\//, (route) =>
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

/** What the overlay is showing right now, as plain data. */
const readOverlay = () => {
  const box = document.querySelector(".cdc-taunt");
  if (!box) return { open: false };
  return {
    open: true,
    hint: (box.querySelector(".cdc-chord-hint") || {}).textContent || "",
    keys: [...box.querySelectorAll(".cdc-chord-key")].map((el) => el.textContent),
    names: [...box.querySelectorAll(".cdc-chord-name")].map((el) => el.textContent),
    // A name drawn as a role rather than as something a country says. The
    // class is the only difference between the two on screen.
    roles: [...box.querySelectorAll(".cdc-chord-name")].filter((el) =>
      el.classList.contains("cdc-taunt-role")
    ).length,
    nums: [...box.querySelectorAll(".cdc-taunt-num")].map((el) => el.textContent),
    country: (box.querySelector(".cdc-taunt-country") || {}).textContent || "",
    flags: box.querySelectorAll(".cdc-taunt-flag").length,
    binds: [...box.querySelectorAll(".cdc-taunt-bind")].map((el) => el.textContent),
    heights: [...box.querySelectorAll(".cdc-taunt-slot")].map((el) =>
      Math.round(el.getBoundingClientRect().height)
    ),
    rows: box.querySelectorAll(".cdc-chord-grid > *").length,
  };
};

async function runOverlayChecks(context) {
  const page = await openStub(context);

  check("the extension loads in a real browser", await page.evaluate(() => !!window.__cdc));

  // --- the key opens it -----------------------------------------------------

  eq("nothing is open to begin with", await page.evaluate(() => !!window.__cdc.state.taunt), false);
  await page.keyboard.press(TAUNT_KEY);
  const open = await page.evaluate(readOverlay);
  check("the shipped key opens the overlay", open.open);
  eq("with the eight taunts on the first eight keys", open.nums.join(","), "1,2,3,4,5,6,7,8");
  // No client, no match, no country — and therefore no words, because the eight
  // lines belong to a country. What a tile can still say is what the taunt is
  // *for*, and it must say it as a role rather than as a quote.
  eq("and, with no country, what each taunt is for", open.names.join(","),
    "out of money,attacking,asking for help,distract them,demand surrender,laughter,mocking a move,gloating");
  eq("every one of them marked as a role, not as something anyone says", open.roles, 8);
  eq("the strip over the grid says why there are no words",
    open.country, "no country yet — the tiles say what each key is for");
  eq("laid out on the build grid's own block", open.keys.join(""), "QWERTASD");
  // Two rows of five: eight tiles and two gaps, with the empty third row
  // dropped. The gaps are what keep the block the shape of the keyboard.
  eq("the empty trailing row is dropped, the holes inside are not", open.rows, 10);

  // With no client there is no match, and every one of these is the answer a
  // player gets on the main menu. A blank tile would read as a broken feature.
  eq("with no match it says so rather than drawing nothing", open.hint, "no match — nothing to taunt in");
  check(
    "and every tile says the game has no key on this taunt",
    open.binds.length === 8 && open.binds.every((text) => text === "no game key"),
    JSON.stringify(open.binds)
  );

  // --- and closes it, three ways -------------------------------------------

  await page.keyboard.press(TAUNT_KEY);
  eq("the same key closes it", await page.evaluate(() => !!window.__cdc.state.taunt), false);

  await page.keyboard.press(TAUNT_KEY);
  await page.keyboard.press("Escape");
  eq("Escape closes it", await page.evaluate(() => !!window.__cdc.state.taunt), false);

  await page.keyboard.press(TAUNT_KEY);
  await page.mouse.click(5, 5);
  eq("a click outside closes it", await page.evaluate(() => !!window.__cdc.state.taunt), false);

  // --- a slot key with nothing to send it into ------------------------------

  await page.keyboard.press(TAUNT_KEY);
  await page.keyboard.press("q");
  const afterSlot = await page.evaluate(() => ({
    open: !!window.__cdc.state.taunt,
    note: (document.querySelector(".cdc-build-note") || {}).textContent || "",
  }));
  eq("a slot key outside a match says where the taunt went", afterSlot.note, "no match — the taunt went nowhere");
  eq("and takes the overlay with it", afterSlot.open, false);

  // A key the overlay has nothing on is still the overlay's: it must not fall
  // through to the layer routing underneath and open a build grid.
  await page.keyboard.press(TAUNT_KEY);
  await page.keyboard.press("z");
  const afterEmpty = await page.evaluate(() => ({
    open: !!window.__cdc.state.taunt,
    grid: !!window.__cdc.state.chord,
    note: (document.querySelector(".cdc-build-note") || {}).textContent || "",
  }));
  eq("an empty slot key names its key rather than doing nothing", afterEmpty.note, "nothing on Z");
  check("and neither closes the overlay nor opens a grid", afterEmpty.open && !afterEmpty.grid);
  await page.keyboard.press("Escape");
  // --- and with a country, the words themselves -----------------------------
  //
  // The one fact the overlay draws that a page with no client can still be
  // given: `playerCountry()` reads `state.combatant.player.country`, which is
  // an object this can hand it. Nothing else about a match is faked — the hint
  // still says there is none — so what this proves is exactly the join between
  // the country and the table, which is the half that would silently draw the
  // wrong country's eight lines.
  await page.evaluate(() => {
    window.__cdc.state.combatant = { player: { country: { name: "Russians" } } };
  });
  await page.keyboard.press(TAUNT_KEY);
  const drawn = await page.evaluate(readOverlay);
  eq("the strip names the country whose taunts these are", drawn.country, "Russia");
  eq("and the tiles carry that country's own words", drawn.names.join(" | "),
    [
      "My resources are taxed to their limits.",
      "I will soon crush our enemies.",
      "Send me help, comrades, before it is too late!",
      "Do something, you idiot! I have a plan!",
      "If you surrender now, perhaps I will kill you quickly.",
      "(laughter)",
      "You are a fool to try such tactics.",
      "There is no escape. There will be no mercy.",
    ].join(" | "));
  eq("none of them a role any more", drawn.roles, 0);
  // No client means no VFS and no ImageContext, so there is no flag to draw and
  // the strip is the country's name alone. That it is *absent* rather than a
  // broken <img> is the check — a missing asset must not draw a torn icon.
  eq("and no flag, because this page has no client to read one out of", drawn.flags, 0);
  await page.keyboard.press("Escape");

  // The flag itself. There is no client here to hold one, but the branch the
  // strip reads first is the client's own decoded-image cache — the Map that
  // `gui/component/Image` fills and the loading screen has already filled for
  // every country in the match — and a Map is something this can hand over.
  // What that proves is the join: the country picks a file name and the strip
  // draws whatever the client already has under it. The VFS and CDN branches
  // beneath it need a real install and stay a human check.
  await page.evaluate(() => {
    const dot = "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==";
    window.__cdc.state.modules.ImageContext = { imageUrlCache: new Map([["rusi.pcx", dot]]) };
  });
  await page.keyboard.press(TAUNT_KEY);
  const flagged = await page.evaluate(readOverlay);
  eq("the strip draws the flag the client already decoded for that country", flagged.flags, 1);
  check(
    "every tile is the same height — the block is a keyboard",
    flagged.heights.length === 8 && new Set(flagged.heights).size === 1,
    JSON.stringify(flagged.heights)
  );
  await page.keyboard.press("Escape");

  // --- a line too long for its tile ----------------------------------------
  //
  // Forced rather than found. At the shipped 128px, whether any of the eighty
  // lines clips depends on the font the client loaded, so an assertion about a
  // particular country would pass on one machine and fail on the next. A
  // narrowed cell makes every line clip on every machine, and what is being
  // checked is the mechanism: that the clip is *measured*, and that showing the
  // rest of it moves nothing.
  await page.addStyleTag({ content: ".cdc-taunt { --cell: 84px !important }" });
  await page.keyboard.press(TAUNT_KEY);
  const narrow = await page.evaluate(() => {
    const box = document.querySelector(".cdc-taunt");
    const tiles = [...box.querySelectorAll(".cdc-taunt-slot")];
    const before = tiles.map((el) => Math.round(el.getBoundingClientRect().height));
    const clipped = tiles.filter((el) =>
      el.querySelector(".cdc-chord-name").classList.contains("cdc-taunt-clipped")
    );
    if (!clipped.length) return { clipped: 0 };
    // `.hovered` by hand is not a shortcut — it is the only hover a match ever
    // has, since the client holds the pointer and `:hover` never fires.
    clipped[0].classList.add("hovered");
    const name = clipped[0].querySelector(".cdc-chord-name");
    return {
      clipped: clipped.length,
      before,
      after: tiles.map((el) => Math.round(el.getBoundingClientRect().height)),
      whole: name.scrollHeight <= name.clientHeight + 1,
    };
  });
  check("a line that does not fit its tile is marked", narrow.clipped > 0, `${narrow.clipped} of 8`);
  check("hovering it shows the whole line", narrow.whole === true);
  eq("and moves nothing — the tile keeps its size and the grid its shape",
    JSON.stringify(narrow.after), JSON.stringify(narrow.before));
  await page.keyboard.press("Escape");
}

/**
 * A planted `Engine`, so the audition can be driven without an RA2 install.
 *
 * `readTauntWav` reaches the taunt files the way the client does — SystemJS,
 * `Engine.rfs`, the `Taunts` directory — and reads `window.System` at call
 * time, which is what makes this possible: nothing here patches the extension,
 * it hands the page the object the page was going to ask for. What is being
 * checked is the round trip (options page → storage → bridge → page → back),
 * which is the half that can fail silently; that a real OPFS file decodes is a
 * human check, and the task doc says so.
 */
const PLANT_ENGINE = () => {
  // A 44-byte RIFF header and one sample: the smallest thing that is a wav.
  const wav = new Uint8Array(45);
  const put = (at, text) => [...text].forEach((c, i) => (wav[at + i] = c.charCodeAt(0)));
  put(0, "RIFF");
  wav[4] = 37;
  put(8, "WAVEfmt ");
  wav[16] = 16;
  wav[20] = 1;
  wav[22] = 1;
  wav[24] = 0x40;
  wav[25] = 0x1f; // 8000 Hz
  wav[28] = 0x40;
  wav[29] = 0x1f;
  wav[32] = 1;
  wav[34] = 8;
  put(36, "data");
  wav[40] = 1;
  wav[44] = 128;
  window.__cdcDecoded = 0;
  window.System = {
    import: async (id) => {
      // RA2's taunts are 4-bit IMA ADPCM and the read converts them with the
      // client's own `WavFile` before sending. Counting the calls is what
      // proves the conversion is in the path — an <audio> handed the raw file
      // says "no supported source was found", which is how it was found.
      if (id === "data/WavFile") {
        return {
          WavFile: class {
            constructor(bytes) {
              this.bytes = bytes;
            }
            getData() {
              window.__cdcDecoded++;
              return this.bytes;
            }
          },
        };
      }
      return {
        Engine: {
          rfsSettings: { tauntsDir: "Taunts" },
          rfs: {
            getRootDirectory: () => ({ planted: true }),
            findDirectory: async () => ({
              // Only the USA's first taunt exists, so the same page can be
              // asked one question with an answer and one without.
              containsEntry: async (name) => name === "tauam01.wav",
              listEntries: async () => ["tauam01.wav"],
              getRawFile: async () => new Blob([wav]),
            }),
          },
        },
      };
    },
  };
};

async function runAuditionChecks(context) {
  // A game tab first, and answering: `ensureGameTab` opens one after 1.5s of
  // silence, and a run that boots a second client is a run that takes minutes.
  const game = await openStub(context);
  await game.evaluate(PLANT_ENGINE);

  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
  const id = new URL(worker.url()).host;
  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/options.html`, { waitUntil: "domcontentloaded" });
  await page.click('.tab[data-tab="overlay"]');
  await page.waitForSelector("#tauntGrid .chordcell", { timeout: 20000 });
  // The country the picker last had is remembered across reloads, and the phase
  // before this one left it on Great Britain — so it is set here rather than
  // assumed. The planted directory holds the USA's first taunt and nothing
  // else, which is what makes both halves of this phase deterministic.
  await page.click('#tauntCountries button:text-is("USA")');
  await page.waitForFunction(
    () => document.querySelector("#tauntGrid .chordname").textContent.startsWith("Gosh darn it"),
    null,
    { timeout: 5000 }
  );

  // --- the shape of a cell --------------------------------------------------

  const shape = await page.evaluate(() => {
    const cell = document.querySelector("#tauntGrid .chordcell");
    const grid = document.querySelector("#tauntGrid");
    return {
      cellTag: cell.tagName,
      role: cell.getAttribute("role"),
      rail: [...cell.querySelectorAll(".chordrail > *")].map((el) => el.tagName + ":" + el.textContent),
      playTag: (cell.querySelector(".chordplay") || {}).tagName,
      overflows: grid.scrollWidth > grid.clientWidth + 1,
      cellWidth: Math.round(cell.getBoundingClientRect().width),
    };
  });
  eq("the key, the number and the play control share one rail",
    shape.rail.join(","), "I:Q,I:1,BUTTON:\u25b6");
  // A `<button>` cannot contain a `<button>` — a parser drops the inner one —
  // so the cell gives up being one and says what it is instead.
  eq("so the cell is a div with a button's role, not a button", shape.cellTag + "/" + shape.role, "DIV/button");
  eq("and the play control is a real button", shape.playTag, "BUTTON");
  check("the grid fits its panel rather than scrolling sideways", !shape.overflows, `cell ${shape.cellWidth}px`);

  // --- one taunt, fetched and played ---------------------------------------

  await page.click("#tauntGrid .chordcell:nth-child(1) .chordplay");
  await page.waitForFunction(
    () => /playing|could not play/.test(document.getElementById("tauntNote").textContent),
    null,
    { timeout: 20000 }
  );
  const played = await page.evaluate(async () => {
    const job = await new Promise((done) => chrome.storage.local.get({ tauntWav: null }, (d) => done(d.tauntWav)));
    return { note: document.getElementById("tauntNote").textContent, stored: job };
  });
  check("a play button fetches the file through a game tab and plays it",
    /playing tauam01\.wav|could not play tauam01\.wav/.test(played.note), played.note);
  eq("the file it asked for is the client's own name for it", played.stored.file, "tauam01.wav");
  eq("and it answered", played.stored.ok, true);
  eq("through the client's own wav decoder, not as it lies on disk",
    await game.evaluate(() => window.__cdcDecoded), 1);
  // Around a hundred kilobytes of data URL, and the page has it now.
  eq("the bytes do not stay in storage once the page has them", played.stored.wav, "");

  // ...and that emptying comes back through `storage.onChanged` like any other
  // write. Read as an answer it is one with no payload, which overwrote the
  // cached URL with "" and drew the button as a file this install has not got —
  // the cross that stayed up after the sound had played.
  await page.waitForFunction(
    () => document.querySelector("#tauntGrid .chordplay").textContent !== "\u2026",
    null,
    { timeout: 10000 }
  );
  const settled = await page.evaluate(() => {
    const play = document.querySelector("#tauntGrid .chordcell:nth-child(1) .chordplay");
    return { mark: play.textContent, missing: play.classList.contains("missing") };
  });
  check("and the button goes back to being a play button once it has finished",
    !settled.missing && settled.mark !== "\u2715", JSON.stringify(settled));

  // A second press is the cache, not another round trip: the item's `at` is
  // written by the request and would move if one had been made.
  const before = played.stored.at;
  await page.click("#tauntGrid .chordcell:nth-child(1) .chordplay");
  await page.waitForTimeout(400);
  const again = await page.evaluate(async () => {
    const job = await new Promise((done) => chrome.storage.local.get({ tauntWav: null }, (d) => done(d.tauntWav)));
    return { at: job.at, decoded: window.__cdcDecoded };
  });
  eq("and a second press plays from the page rather than asking again", again.at, before);

  // --- one this install has not got ----------------------------------------

  await page.click('#tauntCountries button:text-is("France")');
  await page.waitForFunction(
    () => document.querySelector("#tauntGrid .chordname").textContent.startsWith("I have run out"),
    null,
    { timeout: 5000 }
  );
  await page.click("#tauntGrid .chordcell:nth-child(1) .chordplay");
  await page.waitForFunction(
    () => /nothing to play/.test(document.getElementById("tauntNote").textContent),
    null,
    { timeout: 20000 }
  );
  const missing = await page.evaluate(() => {
    const play = document.querySelector("#tauntGrid .chordcell:nth-child(1) .chordplay");
    return {
      mark: play.textContent,
      missing: play.classList.contains("missing"),
      note: document.getElementById("tauntNote").textContent,
    };
  });
  check("a taunt the import skipped says so on its button rather than going quiet",
    missing.missing && missing.mark === "\u2715", JSON.stringify({ mark: missing.mark, missing: missing.missing }));
  // Which absence it is, not merely that there is one.
  check("and the note names the folder it looked in and what was in it",
    /is there but holds no taufr01\.wav/.test(missing.note) && /1 file\(s\) in it, e\.g\. tauam01\.wav/.test(missing.note),
    missing.note);

  // --- and the other absence: no folder at all -----------------------------
  //
  // The one this round started from. `Engine.rfs` exists from `initRfs`, long
  // before the game files are chosen, so a read that waited only for it
  // answered "you have no taunts" out of a tab that had been open one second.
  // Here the client says it *has* loaded its files and still has no folder,
  // which is the answer that must arrive — and arrive saying so.
  await game.evaluate(() => {
    window.System = {
      import: async () => ({
        Engine: {
          rfsSettings: { tauntsDir: "Taunts" },
          vfs: { loaded: true },
          taunts: {},
          rfs: {
            getRootDirectory: () => ({ listEntries: async () => ["maps", "replays", "keyboard.ini"] }),
            findDirectory: async () => undefined,
          },
        },
      }),
    };
  });
  await page.click('#tauntCountries button:text-is("Korea")');
  await page.waitForFunction(
    () => document.querySelector("#tauntGrid .chordname").textContent.startsWith("My resources"),
    null,
    { timeout: 5000 }
  );
  await page.click("#tauntGrid .chordcell:nth-child(1) .chordplay");
  await page.waitForFunction(
    () => /no "Taunts" folder/.test(document.getElementById("tauntNote").textContent),
    null,
    { timeout: 30000 }
  );
  const bare = await page.evaluate(() => document.getElementById("tauntNote").textContent);
  check("an install with no Taunts folder is told that, and what it does have",
    /has no "Taunts" folder/.test(bare) && /3 entries: maps, replays, keyboard\.ini/.test(bare), bare);

  await game.close();
}

async function runOptionsChecks(context) {
  // The extension's own id, off the service worker it registered. Nothing here
  // knows it in advance — an unpacked extension is given one per profile.
  let worker = context.serviceWorkers()[0];
  if (!worker) worker = await context.waitForEvent("serviceworker", { timeout: 20000 });
  const id = new URL(worker.url()).host;

  const page = await context.newPage();
  await page.goto(`chrome-extension://${id}/src/options.html`, { waitUntil: "domcontentloaded" });
  // The editor lives on the Settings tab, and every other panel is `hidden` —
  // so this click is not decoration: without it the cells are in the document
  // and invisible, which is a wait that times out on a page that is working.
  await page.click('.tab[data-tab="overlay"]');
  await page.waitForSelector("#tauntGrid .chordcell", { timeout: 20000 });

  // The page renders its script at all — the regression that shipped in 1.7.0
  // was exactly this, one rung below where check-parse.mjs now catches it.
  const cells = await page.$$eval("#tauntGrid .chordcell", (all) =>
    all.map((cell) => ({
      key: (cell.querySelector(".chordkey") || {}).textContent || "",
      num: (cell.querySelector(".chordnum") || {}).textContent || "",
      name: (cell.querySelector(".chordname") || {}).textContent || "",
    }))
  );
  eq("the options page draws the whole key block", cells.length, 15);
  eq("with the shipped layout on it", cells.slice(0, 8).map((c) => c.num).join(","), "1,2,3,4,5,6,7,8");
  eq("and nothing on the keys past it", cells.slice(8).every((c) => !c.name && !c.num), true);

  // --- which country's words -----------------------------------------------
  //
  // The page has no match to read a country off, so it has a picker instead,
  // and the picker is the only thing that decides what the eight cells say.
  const picker = await page.$$eval("#tauntCountries button", (all) =>
    all.map((b) => ({ name: b.textContent, on: b.classList.contains("on") }))
  );
  eq("the picker offers every country that can be heard", picker.length, 9);
  check(
    "and not one that cannot — Yuri has no taunt files in a Red Alert 2 client",
    !picker.some((b) => b.name === "Yuri"),
    picker.map((b) => b.name).join(",")
  );
  eq("with one of them picked", picker.filter((b) => b.on).length, 1);
  eq("the first by default, since a fresh profile has no country remembered",
    picker.find((b) => b.on).name, "USA");
  eq("and the cells carry that country's words", cells[0].name, "Gosh darn it, I need more cash.");

  await page.click('#tauntCountries button:text-is("Russia")');
  await page.waitForFunction(
    () => document.querySelector("#tauntGrid .chordname").textContent.startsWith("My resources"),
    null,
    { timeout: 5000 }
  );
  const swapped = await page.$$eval("#tauntGrid .chordcell", (all) =>
    all.map((c) => ({
      name: (c.querySelector(".chordname") || {}).textContent || "",
      h: Math.round(c.getBoundingClientRect().height),
    }))
  );
  eq("picking another country rewrites them", swapped[0].name, "My resources are taxed to their limits.");
  check(
    "and every cell is still the same height, the empty ones included",
    new Set(swapped.map((c) => c.h)).size === 1,
    JSON.stringify(swapped.map((c) => c.h))
  );

  // The same forced clip as the overlay, and for the same reason: at the
  // shipped width whether anything clips depends on the font.
  await page.addStyleTag({ content: "#tauntGrid { --cell: 84px !important }" });
  await page.click('#tauntCountries button:text-is("Great Britain")');
  await page.waitForTimeout(50);
  const cut = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#tauntGrid .chordcell")];
    return {
      at: cells.findIndex((c) => c.querySelector(".chordname.clipped")),
      before: cells.map((c) => Math.round(c.getBoundingClientRect().height)),
    };
  });
  check("a line the options grid cut is marked", cut.at >= 0, `cell ${cut.at}`);
  // A real hover, not a class put on by hand: this page is an ordinary page and
  // the mouse is the browser's, which is the whole difference from the overlay.
  await page.hover(`#tauntGrid .chordcell:nth-child(${cut.at + 1})`);
  const reveal = await page.evaluate(() => {
    const cells = [...document.querySelectorAll("#tauntGrid .chordcell")];
    const name = cells.find((c) => c.querySelector(".chordname.clipped")).querySelector(".chordname");
    return {
      after: cells.map((c) => Math.round(c.getBoundingClientRect().height)),
      whole: name.scrollHeight <= name.clientHeight + 1,
    };
  });
  check("hovering it shows the whole line", reveal.whole === true);
  eq("without the grid moving", JSON.stringify(reveal.after), JSON.stringify(cut.before));

  // Editing one key writes an override, and only for that key: the whole point
  // of storing a diff is that the rest still follows a corrected default.
  await page.click("#tauntGrid .chordcell:nth-child(11)"); // the Z key
  await page.selectOption("#tauntPick", "3");
  await page.waitForFunction(
    () => document.querySelectorAll("#tauntGrid .chordcell")[10].querySelector(".chordnum")?.textContent === "3",
    null,
    { timeout: 5000 }
  );
  const stored = await page.evaluate(
    () => new Promise((done) => chrome.storage.local.get({ taunts: {} }, (data) => done(data.taunts)))
  );
  eq("a key edited on the page is stored as an override", JSON.stringify(stored), JSON.stringify({ 10: 3, 2: null }));

  // ...and the swap is visible on the page rather than only in storage: taunt 3
  // was on the third key, and that key is now empty.
  const afterEdit = await page.$$eval("#tauntGrid .chordcell", (all) =>
    all.map((cell) => (cell.querySelector(".chordname") || {}).textContent || "")
  );
  eq("the key it came from is emptied on screen too", afterEdit[2], "");

  // The game tab reads it live, over the bridge, with no reload — which is the
  // join that fails silently: a layout that never arrives looks exactly like a
  // layout nobody edited.
  const game = await openStub(context);
  await game.keyboard.press(TAUNT_KEY);
  await game.waitForSelector(".cdc-taunt", { timeout: 5000 });
  const overlay = await game.evaluate(readOverlay);
  eq("and a running game tab draws the edited layout", overlay.keys.join(""), "QWRTASDZ");
  eq("with the moved taunt on its new key", overlay.nums[overlay.keys.indexOf("Z")], "3");

  // Reset puts the shipped layout back and leaves nothing behind, so a later
  // correction to the default reaches this profile again.
  await page.click("#tauntReset");
  await page.waitForFunction(
    () => document.querySelectorAll("#tauntGrid .chordcell")[2].querySelector(".chordnum")?.textContent === "3",
    null,
    { timeout: 5000 }
  );
  const cleared = await page.evaluate(
    () => new Promise((done) => chrome.storage.local.get({ taunts: {} }, (data) => done(data.taunts)))
  );
  eq("reset stores no override at all", JSON.stringify(cleared), "{}");
}

process.exit(await main());
