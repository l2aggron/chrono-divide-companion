/**
 * Re-run a replay in this tab and harvest what the file cannot state.
 *
 * A `.rpl` records actions; losses, kills and credits are *consequences*, and
 * the only thing that knows them is the simulation ([[cd-replay-format]]). So
 * this drives the client's own replay playback as fast as it will go and reads
 * the counters off `game/Player` while it runs — **the fixture match, 4:03 of
 * play, re-runs in 6.4 seconds at 2267 game ticks a second**, which is 38x the
 * speed it was played.
 *
 * It runs in the page world beside src/companion.js, is inert unless the bridge
 * hands it a job, and refuses to run anywhere but a replay route — nothing here
 * may ever touch a live match.
 *
 * A run belongs in a **hidden** tab: it is started from the options page, which
 * must not lose the screen to it. Everything that has to keep moving in one is
 * built for that — the turn loop breathes through a task rather than a timer,
 * and the client's own boot, which needs animation frames a hidden tab does not
 * give, is held up by src/frames.js for as long as the run lasts.
 *
 * `window.__cdcSim.run(job, onProgress)` is the whole thing, and it takes no
 * chrome APIs and no DOM, so scripts/check-sim.mjs drives this very file in a
 * browser rather than a copy of it. That file named a check that did not
 * exist for a fortnight; it does now, and lifts the three functions that
 * decide what a harvest says — `economy`, `power` and `tempo` — out of this
 * one to run them against players made up for the purpose.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion/replay-sim]";

  /**
   * How often the counters are read, in game ticks. 300 is five seconds of match
   * time: fine enough that a curve shows a push and a collapse, coarse enough
   * that a twenty-minute game is a few hundred rows rather than a hundred
   * thousand.
   */
  const SAMPLE_TICKS = 300;

  /**
   * How long a burst of turns runs before yielding to the page.
   *
   * The yield is a MessageChannel task, not a timer: a background tab clamps
   * timers to a second and would turn a 24-second run into an hour, while the
   * task queue is not throttled that way. 100 ms is short enough that the tab
   * still repaints and Chrome never offers to kill the page.
   */
  const CHUNK_MILLIS = 100;
  const REPORT_MILLIS = 700;

  /**
   * How fast a long match is re-run, and what counts as long.
   *
   * **The rate is the client's own maximum, and it is the one rate anybody has
   * watched survive.** The user played this replay through at ×16 — the fastest
   * the client offers — and the tab lived to the end; every re-run of it has
   * killed the tab, always in the last one per cent. ×16 is
   * `16 * GameSpeed.BASE_TICKS_PER_SECOND` = **240 ticks a second**, which at 60
   * frames is four ticks a frame. A re-run drives about **forty-five**, and
   * anything the game makes per tick and the renderer clears per frame therefore
   * stands forty-five deep instead of four — in memory outside the JS heap,
   * which is why four crashes showed a heap that barely moved against a 4192 MB
   * ceiling.
   *
   * So a long match is played at the speed the client itself would play it at,
   * flat out, and it costs what watching at ×16 costs: 32 130 ticks in about two
   * and a quarter minutes. A short one is not paced at all — nothing under
   * `LONG_MATCH_TICKS` has ever failed, and the fixture that re-runs in six
   * seconds should stay that way.
   */
  const LONG_MATCH_TICKS = 20000;
  const PACED_TICKS_PER_SECOND = 240;

  /**
   * How often a run reports once it is near the end of the match, and what
   * "near" is.
   *
   * Three tabs died in the **last 800 ticks of a 32 130-tick match** — at
   * 31 695, 31 344 and 31 377 — while the heap over the whole match before that
   * grew 6 MB per thousand ticks, which no ceiling can explain. Whatever ends
   * this it is the endgame, so the endgame is the part reported in detail: a
   * reading every 150 ms means the last thing written before a tab dies is
   * within a fifth of a second of what killed it.
   */
  const ENDGAME_REPORT_MILLIS = 150;
  const ENDGAME_SHARE = 0.9;

  /**
   * How often the harvest so far is handed over to be stored — a save point, so
   * a tab that dies loses the seconds since the last one rather than the whole
   * match. Tighter through the endgame, which is where three tabs died.
   */
  const SAVE_MILLIS = 1500;
  const ENDGAME_SAVE_MILLIS = 500;

  /** A run that has not finished by here is reported as partial, not left going. */
  const MAX_WALL_MILLIS = 10 * 60 * 1000;

  /**
   * A match that has not advanced a tick in this long has stopped, whatever the
   * wall clock still allows. The loop drives `doGameTurn` itself, so a tick that
   * does not move means the client is no longer playing — and the answer to that
   * is a partial harvest with a reason on it, not ten minutes of a tab spinning.
   */
  const MAX_QUIET_MILLIS = 20 * 1000;

  /**
   * The numbers a run watches its own memory by — **all but one of them
   * measured from where the run started, not from zero.**
   *
   * The absolute figure was tried first and was wrong in the most expensive way:
   * a cold client boot reported **1087 MB of heap before a single turn had been
   * played**, so a 1000 MB stop killed the run at tick 921 of 32 130 and
   * harvested nothing. What a boot costs says nothing about whether a match can
   * be played — most of it is transient, and the tab that reported 1087 MB did
   * not die. The reading Chrome hands out (`usedJSHeapSize`) counts garbage it
   * has not got round to collecting, so it is a ceiling on what is live rather
   * than a measure of it.
   *
   * So the run takes a baseline the moment the match is up and watches the
   * **growth** on top of it. `HEAP_STOP_MB` stays as a backstop, far above any
   * boot, for a run that climbs from a baseline that was already high.
   *
   * The share of the limit is gone: the limit measured on this machine is
   * **4192 MB**, and the tab died twice at around 1146 MB of heap — a quarter of
   * it. Whatever kills the tab is not the JS heap ceiling, so a share of that
   * ceiling can never be the warning.
   *
   * `EASE_GROWTH_MB` is the one hypothesis a cap cannot test: that a loop which
   * never gives the collector a chance keeps its garbage. Above it the run stops
   * sprinting between bursts and waits.
   */
  const EASE_GROWTH_MB = 250;
  const STOP_GROWTH_MB = 600;
  const HEAP_STOP_MB = 1800;

  /** How long a run that is easing waits between bursts. */
  const EASE_MILLIS = 150;

  /**
   * How many readings of the heap travel with the run's progress. Enough to draw
   * the shape of the climb — where it started, whether easing bent it — and
   * small enough to sit in a storage item that is written every 700 ms.
   */
  const MAX_TRACE = 60;

  /** How often the wait for the client says it is still waiting. */
  const BEAT_MILLIS = 3000;

  /** Enough to describe any match; a cap so one pathological game cannot fill storage. */
  const MAX_DESTROYED = 4000;

  /** The same cap for the other side of the ledger — what came out of the queues. */
  const MAX_PRODUCED = 4000;

  /**
   * And for buildings changing hands. Two orders of magnitude smaller on purpose:
   * a match with five hundred captures in it is not a match, it is a client
   * behaving in a way this file has never seen.
   */
  const MAX_CAPTURES = 500;

  /** The client has to get from a cold tab to a running match before this. */
  const BOOT_MILLIS = 5 * 60 * 1000;

  const post = (message) => window.postMessage(Object.assign({ source: "cdc-page" }, message), "*");
  const say = (msg, level = "info") => {
    console.log(TAG, msg);
    post({ type: "log", msg: "[sim] " + msg, level });
  };

  /**
   * The next macrotask, without going through a timer.
   *
   * `setTimeout(0)` is clamped to a second in a background tab — which is
   * exactly where a run belongs — so it cannot be the thing this loop breathes
   * through.
   */
  const nextTask = () => {
    return new Promise((resolve) => {
      const channel = new MessageChannel();
      channel.port1.onmessage = () => resolve();
      channel.port2.postMessage(0);
    });
  };

  /**
   * The frame pump (src/frames.js), which is what makes a hidden tab boot the
   * client at all, and whose clock is the only unclamped wait this file has.
   *
   * Absent it says so and carries on with a timer: this file is also driven
   * outside the extension, and there a run in a visible tab is exactly what
   * happens. In a run's own tab it is always there — a content script at
   * `document_start` against `document_idle` — and a warning in the log is the
   * signal that the manifest lost it.
   */
  /**
   * Tell the client this tab is visible, and take it back afterwards.
   *
   * `GameAnimationLoop` branches on **`document.hidden` alone**: hidden, it
   * cancels its `requestAnimationFrame` and runs a background frame off a
   * one-second interval that calls `tickGame` and **nothing else** — no
   * `renderer.update`, no `render`. And the render layer only retires itself
   * inside that update: a killed infantryman's renderable waits on a promise
   * resolved from `update()`, explosions, laser effects and smoke trails all
   * take themselves out of the scene there. So a match played in a tab the
   * client believes is hidden creates renderables for thirty thousand ticks of
   * combat and disposes of none of them — in canvases and three.js geometry,
   * which is memory `performance.memory` cannot see. That is what took the tab
   * down at tick 31 344 to 31 892 of 32 130, five times, while the JS heap
   * moved 68 MB — which is why that ceiling is not read off the JS heap.
   *
   * A run therefore says the tab is visible for as long as it lasts. The pump in
   * src/frames.js reads the platform's own accessor rather than this, so it goes
   * on feeding the frames that make the claim true; nothing else in the page
   * cares, and the tab is one the extension opened for a job and closes after.
   */
  const pretendVisible = () => {
    if (Object.prototype.hasOwnProperty.call(document, "hidden")) return () => {};
    const tell = () => document.dispatchEvent(new Event("visibilitychange"));
    Object.defineProperty(document, "hidden", { value: false, configurable: true });
    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    tell();
    return () => {
      delete document.hidden;
      delete document.visibilityState;
      tell();
    };
  };

  let warnedNoFrames = false;
  const frames = () => {
    const found = window.__cdcFrames;
    if (found) return found;
    // Once per tab: the run asks twice and the answer cannot change.
    if (!warnedNoFrames) {
      warnedNoFrames = true;
      say("no frame pump in this tab — a hidden tab will not boot the client", "warn");
    }
    return {
      hold: () => () => {},
      sleep: (millis) => new Promise((r) => setTimeout(r, millis)),
    };
  };

  /**
   * Wait for `test`, saying so every few seconds.
   *
   * The heartbeat is not decoration: the options page tells a run that is going
   * from a tab that has died by how long ago the run last wrote anything, and a
   * boot can take minutes during which nothing else here writes at all. A wait
   * that says nothing is indistinguishable from a tab that is gone.
   */
  const until = async (test, millis, what, beat = () => {}) => {
    const stop = Date.now() + millis;
    const clock = frames();
    let told = 0;
    while (Date.now() < stop) {
      if (test()) return true;
      if (Date.now() - told > BEAT_MILLIS) {
        told = Date.now();
        beat();
      }
      // Not `setTimeout`: a tab hidden for five minutes — which is what a boot
      // that needs this wait looks like — clamps one to a minute, so the match
      // would be a minute old before this noticed it had started.
      await clock.sleep(250);
    }
    throw new Error(`timed out waiting for ${what}`);
  };

  /**
   * What the tab's heap is doing, in megabytes, and how close it is to the
   * ceiling Chrome will kill it at. `performance.memory` is Chrome's and
   * non-standard, so a browser without it reports nothing rather than a nought
   * that would read as an empty heap.
   */
  const heap = () => {
    const memory = performance.memory;
    if (!memory || !memory.usedJSHeapSize) return { mb: 0, full: 0, limitMb: 0 };
    return {
      mb: Math.round(memory.usedJSHeapSize / 1048576),
      full: memory.jsHeapSizeLimit ? memory.usedJSHeapSize / memory.jsHeapSizeLimit : 0,
      // Reported rather than assumed: the share above is meaningless without it,
      // and 1146 MB was either 82% or 56% of the ceiling depending on a number
      // nothing had ever read.
      limitMb: Math.round((memory.jsHeapSizeLimit || 0) / 1048576),
    };
  };

  const sum = (map) => {
    let total = 0;
    for (const n of (map || new Map()).values()) total += n;
    return total;
  };

  /**
   * The two events a capture is, paired.
   *
   * `ObjectOwnerChange` fires for **everything** that changes hands and names
   * both sides: mind control, a garrison emptying back to the civilians, every
   * docked unit dragged along by its shipyard, a map trigger changing a house,
   * and a defeated player's entire base going over to an ally in one flood.
   * `BuildingCapture` is dispatched from exactly two places in the bundle and
   * names only the building: `CaptureBuildingTask`, when an engineer walks in,
   * and `SecureProgressTrait`, when a building that changes hands on a timer —
   * an oil derrick — finishes it, which is where the engineer's task hands over
   * when there is a timer. Infantry occupying a civilian building is *not* one
   * of them: that is `BuildingGarrison`, its own event, and it draws no row
   * here. Neither event alone is the fact worth recording.
   *
   * The client dispatches them one after the other for the same object: the
   * owner change from inside `changeObjectOwner`, the capture from the task that
   * just called it, same tick. So the last owner change per object is held and
   * read when a capture arrives for that object in the same tick — which is what
   * makes a capture know who lost the building, and what keeps everything else
   * that changed hands out.
   *
   * It takes ids and names rather than client objects, so the rule can be
   * checked without a game (scripts/check-replay.mjs). The subscriptions in
   * `run` are the only part of a capture that needs one.
   */
  function captureLedger() {
    const owners = new Map();
    return {
      /** An owner change. Most are not captures, and nothing is recorded for one. */
      changed(id, tick, from) {
        if (id === undefined) return;
        owners.set(id, { tick, from });
      },
      /**
       * A capture, as the row a harvest carries. `from` is empty when no owner
       * change for this object landed in this tick — a defeat moving a hundred
       * objects around a capture must not lend it a losing side it never had.
       */
      captured(id, row) {
        const last = owners.get(id);
        return { ...row, from: (last && last.tick === row.tick && last.from) || "" };
      },
    };
  }

  /**
   * The hooks, installed once per tab.
   *
   * `Game#update` is where a tick is counted and where the live game object comes
   * from; `ReplayTurnManager#doGameTurn` is caught on the *prototype* rather than
   * at `init`, because the loop calls it every frame and one frame later the
   * instance is in hand — hooking the boot means hooking a boot that has not
   * happened yet, and an early `System.import` poisons the module registry and
   * kills the client outright (measured, see the wiki page).
   */
  const state = { game: null, mgr: null, ticks: 0, hooked: false };

  async function hook() {
    if (state.hooked) return;
    const [game, turns] = await Promise.all([
      window.System.import("game/Game"),
      window.System.import("network/gamestate/ReplayTurnManager"),
    ]);
    const update = game.Game.prototype.update;
    game.Game.prototype.update = function () {
      state.ticks++;
      state.game = this;
      return update.apply(this, arguments);
    };
    const doGameTurn = turns.ReplayTurnManager.prototype.doGameTurn;
    turns.ReplayTurnManager.prototype.doGameTurn = function () {
      state.mgr = this;
      return doGameTurn.apply(this, arguments);
    };
    state.hooked = true;
    state.GameStatus = game.GameStatus;
  }

  /**
   * What a side had earning for it at this instant.
   *
   * The counters beside it are the client's own; this is the one reading that
   * has to be taken by walking the objects, because the engine keeps no count of
   * "miners alive" — only of miners *built*, which stops being the same number
   * the first time one dies.
   *
   * Both tests are the client's own, read out of `ra2web.min.js` v0.83.3 rather
   * than guessed from a name list, which would break on a faction this report
   * has not seen or on a mod that renames things:
   *
   * - `rules.harvester` is `Harvester=` out of the ini; the client's own
   *   "select combatants" filters on `!rules.harvester` to leave miners behind.
   * - `rules.produceCashStartup` is the exact condition under which the client
   *   attaches `OilDerrickTrait`. The trait goes into `traits` anonymously —
   *   there is no `object.oilDerrickTrait` to test instead, so the rule is the
   *   only handle from outside.
   *
   * `getOwnedObjects()` defaults to excluding `limboData`, which is what makes
   * this a count of what is **on the map** rather than what exists: a miner
   * inside a war factory is not mining yet.
   *
   * Harvesters are kept by name rather than totalled, because the type is the
   * economy — a Chrono Miner teleports home and a War Miner drives, and a side
   * running both has captured something.
   */
  function economy(player) {
    const harvesters = {};
    let derricks = 0;
    // A player the client no longer hands objects for is not an error: a
    // defeated side is sampled to the end of the match on purpose, and by then
    // it owns nothing.
    for (const object of (player.getOwnedObjects && player.getOwnedObjects()) || []) {
      const rules = object.rules;
      if (!rules) continue;
      if (rules.harvester) {
        const name = object.name || rules.name || "";
        harvesters[name] = (harvesters[name] || 0) + 1;
      } else if (rules.produceCashStartup > 0) derricks++;
    }
    return { harvesters, derricks };
  }

  /**
   * What a side's power was doing at this instant, or null when the client keeps
   * no such trait.
   *
   * Four numbers rather than one flag, because they answer different questions
   * and the report draws all four ([[cd-power-and-production]] for the engine
   * side of each):
   *
   * - `total` is what the base **produces**, and the client scales each
   *   building's share by its health — so this falls when a power plant is
   *   damaged, before it is lost.
   * - `drain` is what everything else consumes, and is not health-scaled.
   * - `low` is the client's own verdict rather than `total < drain` recomputed
   *   here: `PowerTrait#updateLevel` is
   *   `power >= drain && !blackoutFrames ? Normal : Low`, and a copy of that
   *   rule would be a second thing to disagree with it.
   * - `blackout` is the half of the verdict the numbers cannot show. A base
   *   running a surplus and browned out anyway has had a spy walk into a power
   *   plant, or an EMP over it; without this the outage band on the report would
   *   sit over a healthy surplus and read as a bug.
   *
   * **Null rather than zeroes.** A client that has moved the trait must read as
   * "no reading" everywhere downstream — a base with no power and a base nobody
   * measured are different things, and only one of them is worth drawing.
   */
  function power(player) {
    const trait = player.powerTrait;
    if (!trait) return null;
    return {
      total: trait.power,
      drain: trait.drain,
      low: typeof trait.isLowPower === "function" ? trait.isLowPower() : null,
      blackout:
        typeof trait.getBlackoutDuration === "function" ? trait.getBlackoutDuration() > 0 : trait.blackoutFrames > 0,
    };
  }

  /**
   * How long the fetch patch below waits for the bridge to say whether there
   * is a local replay. Generous, because the cost of being wrong in one
   * direction is a five-second pause in a boot that takes a minute, and in
   * the other it is a run that silently fetched the wrong thing.
   */
  const HANDOVER_MILLIS = 5000;

  /**
   * Answer the client's own fetch of the replay from a file we were handed.
   *
   * **Why this exists.** A re-run boots the client at `#/replay/<url>` and the
   * client fetches that URL itself, so a `.rpl` off disk whose match the replay
   * hosts no longer serve had nothing to point a tab at — the report drew, and
   * the half that needs a simulation (credits, losses, power, tempo, spies) was
   * out of reach for exactly the replays a person is most likely to have kept a
   * copy of.
   *
   * **What the client does, read off `ra2web.min.js` 0.83.3 on 2026-08-31.** The
   * route hands it a URL; it checks `new URL(url).hostname` ends with something
   * in `config.replaysUrlWhitelist` (`.chronodivide.com`) and throws if not; it
   * then calls `ResourceLoader("").loadBinary(url)`, which goes through
   * `HttpRequest#fetchRaw`, which calls the **global `fetch`** and refuses a
   * response that is not `ok` or that answers `text/html`.
   *
   * So three things follow, and each is a constraint rather than a choice:
   *
   * 1. The URL has to stay on a real replay host, which is why the sentinel is
   *    the URL the match *would* have had — `<host>/<gameId>.rpl`. Nothing about
   *    the route or the whitelist is worked around; the bytes simply arrive from
   *    here instead of from the network.
   * 2. A real `Response` is handed back, not an object shaped like one:
   *    `fetchRaw` reads `.body` as a stream for its progress reporting, and a
   *    stub with an `arrayBuffer()` on it would satisfy the type and stall the
   *    read.
   * 3. Only that one URL is answered, and only on a replay route. Everything
   *    else is the untouched original — this is not a cache and not a proxy.
   *
   * **It disarms itself.** One answer, then the patch steps out of the way: a
   * client that asks twice is a client doing something this was not written for,
   * and the second ask should reach the network and fail honestly rather than
   * quietly replaying the first.
   *
   * The one thing left to the client: a replay recorded by a different engine
   * version sends it off to `loadReplayWithOldClient`, whatever the bytes came
   * from. That is the client's own rule about its own compatibility and is not
   * ours to defeat.
   */
  function answerReplayFetch() {
    // Never anywhere but a replay route. `run` refuses the same way, and for the
    // same reason: nothing here may be within reach of a live match.
    //
    // `typeof` rather than a bare read, because this runs at load and three of
    // the node suites evaluate this file outside a document to lift a function
    // out of it. A page always has a location; where there is none there is no
    // client to hand anything to either, so the answer is the same.
    if (typeof location === "undefined" || !/^#\/replay\//.test(location.hash)) return null;
    const original = window.fetch;
    if (typeof original !== "function") {
      say("this page has no fetch to answer — a local replay cannot be handed over", "error");
      return null;
    }

    let settle;
    // What the bridge is about to say: the file's text, or null for "there is
    // none, get out of the way". Held as a promise because the client's own
    // fetch and the bridge's message are two arrivals with no order between
    // them, and the wrong order would otherwise be a silent miss.
    const handed = new Promise((resolve) => {
      settle = resolve;
    });
    // A backstop, not a mechanism. The bridge posts on every replay route, so
    // this only fires if the bridge never loaded at all — in which case the
    // right answer is the network's, not an indefinite wait in front of the
    // client's boot.
    const timer = setTimeout(() => settle(null), HANDOVER_MILLIS);

    let spent = false;
    window.fetch = function (input, init) {
      const url = typeof input === "string" ? input : (input && input.url) || "";
      if (spent || !/^https:\/\/[a-z-]+\.chronodivide\.com\/[0-9a-f-]{36}\.rpl$/i.test(url)) {
        return original.call(this, input, init);
      }
      return handed.then((text) => {
        if (spent || text === null || text === undefined) return original.call(this, input, init);
        spent = true;
        say(`handing the client ${text.length} bytes of replay instead of fetching ${url}`);
        // Byte per character, not UTF-8. The client reads the bytes back with
        // `uint8ArrayToBinaryString`, which is `String.fromCharCode` per byte —
        // so this is that function's exact inverse. A `.rpl` is header lines and
        // base64 and is ASCII throughout, which makes the two the same thing
        // today; they stop being the same the moment anything else arrives here,
        // and the inverse is the one that stays correct.
        const bytes = new Uint8Array(text.length);
        for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i) & 0xff;
        return new Response(bytes, {
          status: 200,
          statusText: "OK",
          // Not text/html, which `fetchRaw` refuses outright, and a length so
          // the loader's own progress reporting has something to divide by.
          headers: { "Content-Type": "application/octet-stream", "Content-Length": String(bytes.length) },
        });
      });
    };

    return (text) => {
      clearTimeout(timer);
      settle(text || null);
    };
  }

  /**
   * What a spy did when it got in, by the engine's own conditions.
   *
   * `AgentTrait#infiltrate` branches on the building's rules and on nothing
   * else — `rules.radar` resets the victim's shroud unless they hold a spy
   * satellite, `rules.power > 0` blacks the base out for `spyPowerBlackout`
   * frames, a superweapon has its timer reset, and `rules.storage > 0` moves
   * `spyMoneyStealPercent` of the victim's bank across. Read off the object
   * rather than guessed from its name, which would be a name list to keep in
   * step with somebody else's ruleset.
   *
   * None of the four is an event of its own, so this is the only place any of
   * them is recorded. The blackout is the exception that half-shows: it turns
   * up in the power samples as a base browned out on a surplus, which is what
   * makes the two readings worth putting on one page.
   *
   * The shroud reset is reported as it is dispatched, not as it lands: the
   * client only resets it when the victim holds no spy satellite, and that
   * check needs their whole building list. What is recorded is that a radar
   * building was got into, which is the move; whether it cost them the map is
   * the one thing here left to the reader.
   */
  function spyEffects(target) {
    const rules = (target && target.rules) || {};
    const effects = [];
    if (rules.radar) effects.push("radar");
    if (rules.power > 0) effects.push("blackout");
    if (target && target.superWeaponTrait) effects.push("superweapon");
    if (rules.storage > 0) effects.push("money");
    return effects;
  }

  /**
   * How fast this side was building, per queue.
   *
   * The engine's build clock is
   * `baseBuildSpeed * buildSpeedModifier * multipleFactory^-(factories-1)`, and
   * the two middle factors are the only ones that are properties of the base
   * rather than of the item in the queue. Both are read off the client instead
   * of being recomputed:
   *
   * - `speed` is `production.buildSpeedModifier`, which is 1 except while the
   *   base is browned out, and is then a function of how far short of its drain
   *   it is — a proportional penalty, not a flat halving, so a base one unit
   *   short is barely slowed.
   * - `factories` is `production.getFactoryCount()` per queue, which is the
   *   count `tickQueue` itself reads: maintained by the engine across a building
   *   appearing, dying, being sold and changing hands, in both directions.
   *
   * Counted per **queue** rather than per factory type because that is the
   * question — a shipyard builds ships and a war factory vehicles, and the
   * report has a line per queue. `getFactoryTypeForQueueType` is the client's
   * own mapping and is asked rather than mirrored.
   *
   * `queues` is resolved once per run and handed in: it is a pair of the client's
   * enums, which this file reaches only through a `System.import` that has to
   * happen inside `play`.
   */
  function tempo(player, queues) {
    const production = player.production;
    if (!production || typeof production.getFactoryCount !== "function") return null;
    const factories = {};
    /**
     * Which factory each queue's clock reads, kept beside the count.
     *
     * **Two queues can share one.** `getFactoryTypeForQueueType` answers
     * `BuildingType` for both `Structures` and `Armory` — the Defence tab is a
     * queue of its own, so a player builds a structure and a turret at once,
     * but both come off the same construction yards. Their coefficients are
     * therefore the same number at every instant, and a report that drew both
     * drew one line twice.
     *
     * Recorded rather than decided here, because the answer is the client's:
     * a report that dropped `Armory` by name would keep dropping it if a
     * client ever gave the Defence tab a factory of its own.
     */
    const factoryOf = {};
    for (const [name, type] of queues) {
      const factory = production.getFactoryTypeForQueueType(type);
      factories[name] = production.getFactoryCount(factory) || 0;
      factoryOf[name] = String(factory);
    }
    return { speed: production.buildSpeedModifier, factories, factoryOf };
  }

  /**
   * One reading of every combatant's counters.
   *
   * The player list is captured once and read from thereafter, never re-asked:
   * `getCombatants()` stops returning a player the moment they are defeated, so
   * sampling it each time silently drops the loser from the last rows of the
   * match — which is exactly the part a report about losses is read for.
   */
  function sample(game, roster, queues) {
    const players = [];
    for (const player of roster) {
      players.push({
        name: player.name,
        credits: player.credits,
        gained: player.creditsGained,
        ...economy(player),
        // Both null on a client that keeps neither, and null rather than a
        // zeroed shape: a reading nobody could take is not a reading of nothing.
        power: power(player),
        tempo: tempo(player, queues),
        built: sum(player.unitsBuiltByType),
        lost: sum(player.unitsLostByType),
        killed: sum(player.unitsKilledByType),
        defeated: !!player.defeated,
        // Keyed by ObjectType, not by unit name — measured, and the reason a
        // per-name breakdown has to come from the destroy events below.
        lostByKind: Object.fromEntries([...(player.unitsLostByType || new Map())]),
      });
    }
    return { tick: game.currentTick, players };
  }

  /**
   * Run the match to its end and return everything worth keeping.
   *
   * **The tab claims to be visible, the frames are held, and a long match is
   * paced** — three parts of one thing: making a re-run in a tab nobody is
   * looking at behave like the client playing the same replay in front of
   * somebody.
   *
   * The claim is what matters most. `GameAnimationLoop` renders nothing at all
   * in a tab it believes is hidden, and the render layer disposes of itself only
   * inside that render update — so a match played out in a hidden tab
   * accumulates every death animation, explosion and smoke trail it ever made,
   * in memory the page cannot measure. Five tabs died of it at 31 344 to 31 892
   * ticks of 32 130 while the JS heap moved 68 MB.
   *
   * The pump is what makes the claim true (a tab the browser has hidden gets no
   * frames of its own, and `src/frames.js` supplies them), and the pace keeps
   * creation and disposal in step: the client watched at ×16 — 240 ticks a
   * second, four to a frame — survives this match, and a run left flat out puts
   * forty-five ticks between frames.
   */
  async function play(job = {}, onProgress = () => {}, onCheckpoint = () => {}) {
    if (!/^#\/replay\//.test(location.hash)) {
      throw new Error("this tab is not playing a replay — refusing to run");
    }
    const startedAt = Date.now();
    await hook();
    say("waiting for the match to start");
    // Held here and given back in the `finally` around the whole run below: the
    // boot needs frames to happen at all, and the match needs them to keep the
    // renderer level with a loop running forty-five times its usual speed.
    await until(
      () => state.mgr && state.game && state.game.status === state.GameStatus.Started,
      BOOT_MILLIS,
      "the match",
      () => onProgress({ tick: 0, endTick: 0, ticks: state.ticks, heap: heap().mb })
    );

    const game = state.game;
    const mgr = state.mgr;
    const endTick = (mgr.replay && mgr.replay.endTick) || 0;
    if (!endTick) throw new Error("the turn manager has no replay to play");

    // Captured once — see `sample`. Anything not in here is not a side of this
    // match and its losses are nobody's.
    const roster = [...game.getCombatants()];
    const playing = new Set(roster.map((player) => player.name));

    const { EventType } = await window.System.import("game/event/EventType");
    const destroyed = [];
    const unsubscribe = game.events.subscribe(EventType.ObjectDestroy, (event) => {
      if (destroyed.length >= MAX_DESTROYED) return;
      const target = event.target || {};
      const owner = (target.owner && target.owner.name) || "";
      // **The owner is the whole filter.** The bus reports every object that
      // ceases to exist: measured on the fixture match, 695 destroy events of
      // which 44 were somebody's — the rest were projectiles (`Cannon`), debris
      // (`DBRIS*`), tyres and the invisible markers the map is dressed with.
      // Anything with an owner in this match is a loss; nothing else is.
      if (!owner || !playing.has(owner)) return;
      destroyed.push({
        tick: game.currentTick,
        name: target.name || (target.rules && target.rules.name) || "",
        // ObjectType, so a report can say "buildings" without a name table.
        kind: target.type,
        owner,
        by: (event.attackerInfo && event.attackerInfo.player && event.attackerInfo.player.name) || "",
        // A unit that drove into a cliff is not a kill for anyone; the client
        // makes the distinction, so this keeps it.
        incidental: !!event.incidental,
      });
    });

    /**
     * What came out, which the file cannot say.
     *
     * A replay states orders; an order can be cancelled, starved of credits or
     * lost with its factory, and the parse says so rather than guessing. This is
     * the other half: `ObjectSpawn` fires as each object appears on the map, so
     * a run of the match answers "what did they actually get" by name and by
     * minute — the number the report otherwise has to refuse to print.
     *
     * Same filter as the losses above, and for the same reason: the bus reports
     * every spawn, most of which are projectiles and debris with no owner. An id
     * is only counted once — a chrono-shifted tank leaves the map and comes back,
     * and it was built one time.
     */
    const produced = [];
    const seen = new Set();
    const unsubscribeSpawn = game.events.subscribe(EventType.ObjectSpawn, (event) => {
      if (produced.length >= MAX_PRODUCED) return;
      const object = event.gameObject || {};
      const owner = (object.owner && object.owner.name) || "";
      if (!owner || !playing.has(owner)) return;
      if (object.id !== undefined) {
        if (seen.has(object.id)) return;
        seen.add(object.id);
      }
      produced.push({
        tick: game.currentTick,
        name: object.name || (object.rules && object.rules.name) || "",
        kind: object.type,
        owner,
      });
    });

    /**
     * A building changing sides, which is neither of the two above: nothing was
     * destroyed and nothing came out of a queue, so a capture is invisible to
     * both lists and to every counter the client keeps for a player.
     *
     * The pairing is `captureLedger` — every owner change is remembered, and only
     * the ones a `BuildingCapture` arrives for in the same tick become rows.
     */
    const captures = [];
    const ledger = captureLedger();
    const unsubscribeOwner = game.events.subscribe(EventType.ObjectOwnerChange, (event) => {
      const target = event.target || {};
      ledger.changed(target.id, game.currentTick, (event.prevOwner && event.prevOwner.name) || "");
    });
    const unsubscribeCapture = game.events.subscribe(EventType.BuildingCapture, (event) => {
      if (captures.length >= MAX_CAPTURES) return;
      const target = event.target || {};
      const row = ledger.captured(target.id, {
        tick: game.currentTick,
        name: target.name || (target.rules && target.rules.name) || "",
        // ObjectType, like the two lists above. It is always a building here, and
        // the row carries it anyway so a reader of the harvest never has to know
        // that from somewhere else.
        kind: target.type,
        // The owner change has already happened by now, so this is the side that
        // took it; `from` is the side it came off.
        owner: (target.owner && target.owner.name) || "",
      });
      // Either end in the match is enough. A neutral oil derrick belongs to the
      // map's civilians, who are not a side and lose nothing — that capture is
      // real and has one side to it, and dropping it would be dropping a fact.
      if (!playing.has(row.owner) && !playing.has(row.from)) return;
      captures.push(row);
    });

    /**
     * A spy getting into a building, which nothing else on this page records.
     *
     * `BuildingInfiltration` (21) carries both ends itself —
     * `{ target, source }`, the building and the spy — so unlike a capture it
     * needs no pairing with an owner change: `BuildingCapture` names only the
     * building, which is what `captureLedger` above exists for, and this one
     * does not have that problem.
     *
     * It is the only record there is. The file cannot state an infiltration: an
     * order in a replay names no unit ([[cd-replay-format]]), so the Enter order
     * that sent the spy in is indistinguishable from every other order in the
     * match, and what it did when it arrived is a consequence in any case. And
     * the consequences are individually invisible — a stolen tech is a cameo
     * that quietly appears, a stolen sight is nothing at all, and a power
     * blackout looks exactly like a healthy base in a chart of production
     * against drain.
     *
     * Both sides are kept even when one of them is not a player: a spy walking
     * into a civilian building is not a move against anybody, but a match where
     * that happened is not a match where nothing happened, and the row costs one
     * line.
     */
    const infiltrations = [];
    // `spyMoneyStealPercent`, clamped the way the engine clamps it. Read once
    // rather than per event: it is a ruleset constant, and a match does not
    // change rulesets halfway.
    const general = (game.rules && game.rules.general) || {};
    const stealShare = Math.max(0, Math.min(1, Number(general.spyMoneyStealPercent) || 0));
    const unsubscribeSpy = game.events.subscribe(EventType.BuildingInfiltration, (event) => {
      if (infiltrations.length >= MAX_CAPTURES) return;
      const target = event.target || {};
      const source = event.source || {};
      const rules = target.rules || {};
      const effects = spyEffects(target);
      const row = {
        tick: game.currentTick,
        // The building that was got into, and the side that owned it.
        name: target.name || rules.name || "",
        owner: (target.owner && target.owner.name) || "",
        // The spy, and the side that sent it. Named rather than assumed to be
        // "the other one": a match can have more than two sides.
        spy: source.name || (source.rules && source.rules.name) || "",
        by: (source.owner && source.owner.name) || "",
        effects,
        /**
         * What the victim was left holding, and the share the rules take.
         *
         * The event is dispatched **after** `infiltrate` has already moved the
         * money, so the amount cannot be read as a difference — only the
         * balance afterwards can. With the share beside it a reader gets the
         * theft to within a credit: the engine floors, so a bank left holding
         * `after` was holding either `after / (1 - share)` or one more than
         * that. Recorded as the two numbers rather than as an answer, so
         * whoever prints it decides how to say "about".
         */
        left: effects.includes("money") && target.owner ? target.owner.credits : null,
        share: effects.includes("money") ? stealShare : null,
      };
      if (!playing.has(row.owner) && !playing.has(row.by)) return;
      infiltrations.push(row);
    });

    /**
     * When a building finished and stood waiting for the player to put it down.
     *
     * `PlaceBuildingAction.tryPlaceBuilding` only does anything when the queue is
     * already `Ready`, so a placement in the file is not the moment the building
     * was built — it is the moment the player got round to it. The gap between
     * the two is a real thing to see in a build order, and it is the only part of
     * a structure's life the file cannot state.
     *
     * Only the two building queues: a unit leaves its queue by appearing, which
     * the spawn events above already record.
     *
     * The dispatcher hands the listener `(queue, production)` — `dispatch(t, i)`
     * calls `e(i, t)`, arguments swapped — and it fires on every change to a
     * queue, not only on a status change, so each transition into `Ready` is
     * taken once.
     */
    const { QueueStatus, QueueType } = await window.System.import("game/player/production/ProductionQueue");

    /**
     * The queues a tempo reading is taken for, resolved once.
     *
     * `QueueType` is a numeric enum, so `Object.entries` hands back both
     * directions of it — `Structures -> 0` and `0 -> Structures` — and only the
     * forward half is a queue. Taken from the client rather than written down
     * here so a client that adds a queue is sampled with it, and one that
     * renames a queue does not quietly report the old name.
     *
     * `getFactoryTypeForQueueType` is asked per player inside `tempo`, not
     * cached here: it lives on the production trait and there is one per side.
     */
    const tempoQueues = Object.entries(QueueType).filter(([, type]) => typeof type === "number");
    if (!tempoQueues.length) say("this client's ProductionQueue exports no QueueType — no tempo will be sampled");
    const ready = [];
    const waiting = new Map();
    const readyListeners = [];
    for (const player of roster) {
      if (!player.production) continue;
      const listener = (queue) => {
        if (queue.type !== QueueType.Structures && queue.type !== QueueType.Armory) return;
        const first = queue.status === QueueStatus.Ready && queue.getFirst();
        const name = (first && first.rules && first.rules.name) || "";
        const key = player.name + "/" + queue.type;
        if (waiting.get(key) === name) return;
        waiting.set(key, name);
        if (name) ready.push({ tick: game.currentTick, name, owner: player.name });
      };
      player.production.onQueueUpdate.subscribe(listener);
      readyListeners.push([player.production, listener]);
    }

    // The end of a match is a real event in the client — a side is defeated, and
    // whatever the client does about that it does then. Three runs died there,
    // so the moment is logged with the heap beside it.
    const unsubscribeDefeat = game.events.subscribe(EventType.PlayerDefeated, (event) => {
      const who = (event.player && event.player.name) || (event.target && event.target.name) || "";
      say(`${who || "a player"} was defeated at tick ${game.currentTick} — ${heap().mb} MB of heap`);
    });

    const samples = [sample(game, roster, tempoQueues)];
    let nextSample = game.currentTick + SAMPLE_TICKS;
    let told = 0;
    let error = "";
    // What the client cost to get here, and the line every later reading is
    // measured against. Said out loud because a boot that costs a gigabyte is
    // worth knowing about on its own — this one did, and nothing had ever
    // reported it.
    // Paced for the whole match or not at all — the decision is the match's
    // length, and a run that changes speed halfway is a run whose evidence is
    // two runs. `job.pace` overrides it: a number of ticks a second from the
    // options page's debug box, 0 for flat out. It exists because the rate is
    // what decides whether a long match finishes, and the boundary between 240
    // (the client's own ×16, which survives) and ~2700 (flat out, which does
    // not) is worth finding by hand rather than by argument.
    const asked = typeof job.pace === "number" ? job.pace : null;
    const rate = asked === null ? (endTick > LONG_MATCH_TICKS ? PACED_TICKS_PER_SECOND : 0) : asked;
    const pacing = rate > 0;
    const pacedFrom = Date.now();
    const startTick = game.currentTick;

    const base = heap();
    say(
      `playing ${endTick} ticks, ${base.mb} MB of heap after the boot (limit ${base.limitMb})` +
        (pacing ? `, paced at ${rate} ticks a second` : ", flat out") +
        (asked === null ? "" : " (asked for)")
    );

    // The two things a run has to notice about itself, both of which used to
    // end in a tab that was no use to anybody: a match that has stopped
    // advancing, and a heap about to take the tab down with it.
    let moved = Date.now();
    let seenTick = game.currentTick;
    let saved = 0;
    // Where the heap has been, so a run that dies anyway leaves the shape of the
    // climb behind it — the one thing two crashes could not say.
    const trace = [];
    const clock = frames();
    let easing = false;
    // Game ticks per delivered frame — one when a player watches the replay,
    // forty-five when a run drives it, and the number this whole pass is about.
    let framesAt = (clock.state && clock.state().frames) || 0;
    let perFrame = 0;


    /**
     * The harvest as it stands, whether the match is over or not.
     *
     * Built here rather than at the end because a run sends **checkpoints**: a
     * tab that dies at 98% of a match used to take everything with it, and the
     * same rows written a second ago are a report. A checkpoint is never
     * `complete` — the match had not finished when it was taken.
     */
    const build = (why, checkpoint) => {
      const rows = checkpoint ? samples.concat([sample(game, roster, tempoQueues)]) : samples;
      const wallMillis = Date.now() - startedAt;
      return {
        gameId: job.gameId || "",
        at: Date.now(),
        endTick,
        tick: game.currentTick,
        // A match ends when a base dies, not only when the recording runs out —
        // the fixture stopped twenty ticks short of `endTick` with a player
        // defeated, and calling that incomplete would have been a lie about the
        // one run that had worked.
        complete: !why && !checkpoint && (game.status === state.GameStatus.Ended || game.currentTick >= endTick),
        checkpoint: !!checkpoint,
        error: why,
        wallMillis,
        ticksPerSecond: Math.round((game.currentTick / wallMillis) * 1000) || 0,
        // What it cost to get here. Kept on a finished harvest as well as a
        // stopped one: the question "does this match fit in a tab" is answered
        // by the runs that worked as much as by the ones that did not.
        heapMb: heap().mb,
        heapLimitMb: heap().limitMb,
        heapBaseMb: base.mb,
        heapTrace: trace,
        players: rows[rows.length - 1].players,
        samples: rows,
        destroyed,
        produced,
        ready,
        captures,
        infiltrations,
        truncated:
          destroyed.length >= MAX_DESTROYED ||
          produced.length >= MAX_PRODUCED ||
          captures.length >= MAX_CAPTURES ||
          infiltrations.length >= MAX_CAPTURES,
      };
    };

    try {
      while (game.status !== state.GameStatus.Ended && game.currentTick <= endTick) {
        // **Before the burst, not after it.** Where a run held to the pace would
        // be by now; ahead of that it waits and comes round again without
        // playing anything. Measured 2026-08-17: the same test *after* the burst
        // slept its 250 ms and then played a full 100 ms chunk regardless, so a
        // run that said it was pacing at 240 ticks a second ran at **778** — 270
        // ticks per 350 ms — and every conclusion drawn from "pacing changed
        // nothing" was drawn from a run that never paced.
        if (pacing) {
          const allowed = startTick + ((Date.now() - pacedFrom) / 1000) * rate;
          if (game.currentTick > allowed) {
            await clock.sleep(Math.min(250, Math.ceil(((game.currentTick - allowed) / rate) * 1000)));
            continue;
          }
        }
        const chunkUntil = performance.now() + CHUNK_MILLIS;
        while (performance.now() < chunkUntil) {
          mgr.doGameTurn(performance.now());
          if (game.currentTick >= nextSample) {
            samples.push(sample(game, roster, tempoQueues));
            nextSample = game.currentTick + SAMPLE_TICKS;
          }
          if (game.status === state.GameStatus.Ended || game.currentTick > endTick) break;
        }
        const taken = heap();
        const grown = taken.mb - base.mb;
        const framesNow = (clock.state && clock.state().frames) || 0;
        if (framesNow > framesAt) {
          perFrame = Math.round((game.currentTick - seenTick) / (framesNow - framesAt)) || perFrame;
          framesAt = framesNow;
        }
        const every = game.currentTick > endTick * ENDGAME_SHARE ? ENDGAME_REPORT_MILLIS : REPORT_MILLIS;
        if (Date.now() - told > every) {
          told = Date.now();
          trace.push({ tick: game.currentTick, mb: taken.mb, per: perFrame, eased: easing || undefined });
          if (trace.length > MAX_TRACE) trace.shift();
          onProgress({
            tick: game.currentTick,
            endTick,
            ticks: state.ticks,
            heap: taken.mb,
            heapLimit: taken.limitMb,
            heapBase: base.mb,
            perFrame,
            trace,
          });
        }
        if (game.currentTick > seenTick) {
          seenTick = game.currentTick;
          moved = Date.now();
        } else if (Date.now() - moved > MAX_QUIET_MILLIS) {
          error = `the match stopped advancing at tick ${game.currentTick}`;
          break;
        }
        if (grown > STOP_GROWTH_MB || (taken.mb && taken.mb > HEAP_STOP_MB)) {
          // Stopped rather than continued: the alternative is the tab being
          // killed with the whole harvest in it, which is how this check came to
          // exist. Growth, not the reading itself — the reading includes
          // whatever the boot left behind, and stopping on that harvested
          // nothing at all.
          error =
            `the run was taking too much memory (${taken.mb} MB, ${grown} above the ` +
            `${base.mb} it started at) and was stopped`;
          break;
        }
        if (Date.now() - startedAt > MAX_WALL_MILLIS) {
          error = "the run was still going after ten minutes and was stopped";
          break;
        }
        // A save, on the same clock as the reports and for the same reason: what
        // this run has already harvested must not die with the tab holding it.
        const saveEvery = game.currentTick > endTick * ENDGAME_SHARE ? ENDGAME_SAVE_MILLIS : SAVE_MILLIS;
        if (Date.now() - saved > saveEvery) {
          saved = Date.now();
          onCheckpoint(build("", true));
        }
        // The pace. `allowed` is where a run held to the cap would be by now, so
        // a burst that got ahead waits for the clock rather than for a timer
        // that would drift.

        if (grown > EASE_GROWTH_MB) {
          // The one hypothesis a cap cannot test: that the heap is mostly
          // garbage a loop this tight never lets the collector take. Waiting is
          // the only lever this file has over that, and the trace above says
          // afterwards whether it bent the curve.
          if (!easing) {
            easing = true;
            say(`heap at ${taken.mb} MB, ${grown} above the boot — easing off to let the collector keep up`);
          }
          await clock.sleep(EASE_MILLIS);
        } else {
          await nextTask();
        }
      }
    } catch (e) {
      // Reported rather than thrown away: a desync or a client change leaves a
      // partial harvest, and a partial harvest with a reason on it is worth more
      // than no answer at all.
      console.warn(TAG, "the run stopped early", e);
      error = (e && e.message) || String(e);
    }
    say(
      `the loop is done at tick ${game.currentTick} (status ${game.status === state.GameStatus.Ended ? "ended" : "running"})` +
        ` — ${heap().mb} MB of heap`
    );
    unsubscribe();
    unsubscribeDefeat();
    unsubscribeSpawn();
    unsubscribeOwner();
    unsubscribeCapture();
    unsubscribeSpy();
    // `EventDispatcher` has no unsubscriber to call — it takes the listener back.
    for (const [production, listener] of readyListeners) production.onQueueUpdate.unsubscribe(listener);

    samples.push(sample(game, roster, tempoQueues));
    const result = build(error, false);
    say(
      `${result.complete ? "finished" : "stopped"} at tick ${result.tick}/${endTick} in ${(result.wallMillis / 1000).toFixed(1)}s ` +
        `(${result.ticksPerSecond} ticks/s), ${produced.length} produced, ${ready.length} ready to place, ` +
        `${destroyed.length} destroyed, ${captures.length} captured, ${perFrame} ticks a frame` +
        (heap().mb ? `, ${heap().mb} MB of heap` : "")
    );
    return result;
  }

  /**
   * The run, with the frames and the visibility it needs held for the whole of
   * it and given back however it ends — a timeout waiting for the client is
   * exactly the case that must not leave a tab pumping frames and lying about
   * itself for a run that is over.
   */
  async function run(job = {}, onProgress = () => {}, onCheckpoint = () => {}) {
    const restore = pretendVisible();
    const release = frames().hold();
    try {
      return await play(job, onProgress, onCheckpoint);
    } finally {
      release();
      restore();
    }
  }

  // --- the bridge's side ------------------------------------------------------

  let running = false;

  /**
   * Armed at load, before anything can be handed over.
   *
   * This file is listed ahead of src/bridge.js in the manifest, so the patch is
   * in place before the bridge exists to post to it — and long before the client
   * has loaded its mixes and got as far as asking for a replay. Null off a
   * replay route, which is every page but the one this is for.
   */
  const handOver = answerReplayFetch();

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (data && data.source === "cdc-bridge" && data.type === "sim-local") {
      // The bridge speaking for the storage: either the text of a replay the
      // hosts do not serve, or null for "there is none". Both answers matter —
      // the null is what lets the patch step aside promptly.
      if (handOver) handOver(data.text || null);
      return;
    }
    if (!data || data.source !== "cdc-bridge" || data.type !== "sim-run") return;
    if (running) return;
    running = true;
    run(
      data,
      (progress) => post({ type: "sim-progress", gameId: data.gameId, ...progress }),
      (harvest) => post({ type: "sim-result", result: harvest })
    ).then(
      (result) => post({ type: "sim-result", result }),
      (e) => {
        say(`could not run the replay: ${(e && e.message) || e}`, "error");
        post({ type: "sim-result", result: { gameId: data.gameId, at: Date.now(), error: (e && e.message) || String(e) } });
      }
    );
  });

  // `captureLedger` is out here for the same reason `run` is: it is the one rule
  // in this file with no client in it, and a check can hold it to its answers.
  // `busy` is read by src/companion.js: a tab doing a harvest has no use for the
  // map preview that half of the extension would otherwise decode into it, and a
  // full-size render is tens of megabytes against a run that has to fit in one
  // tab (2026-08-17, a boot that reported over a gigabyte before a turn was
  // played).
  window.__cdcSim = { run, hook, state, captureLedger, SAMPLE_TICKS, busy: () => running };
})();
