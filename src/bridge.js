/**
 * Isolated-world half of the extension.
 *
 * companion.js has to run in the page's MAIN world to reach SystemJS and React
 * fibers — and that world has no `chrome.*`. This file is the other half: it
 * owns extension storage and talks to the page over window.postMessage.
 *
 *   page   -> bridge : { source: "cdc-page",   type: "ready" | "map-seen" | "map-render" |
 *                                                     "prefs-set" | "appearance-set" | … }
 *   bridge -> page   : { source: "cdc-bridge", type: "config" | "stored" }
 *
 * Storage shape (chrome.storage.local), keyed by the map's file name — the map
 * file has no dependable name of its own, see mapFacts() in companion.js:
 *   maps:    { "<map key>": { name, thumb, thumbFixed, facts, seen } }
 *            `thumbFixed` is the same picture with the start positions marked,
 *            and exists only for the maps whose own preview marks none.
 *   renders: { "<map key>": { thumb: dataUrl, at: epochMs, v: rendererVersion } }
 *   full:<map key>: dataUrl                    // one item per map, megabytes
 *   guides:  { "<map key>": "free-form multi-line guide" }
 *   keys:    { overlay: {...}, debug: {...} }   // hotkey descriptors
 *   builds:  { "<side>": [ { name: "GAPOWR", key: {...} }, … ] }
 *            The build hotkeys, one profile per side, in the order the options
 *            page lists them. A separate item from `keys` rather than a branch
 *            inside it: `keys` is a flat map of name -> one descriptor, and both
 *            halves of the extension iterate it as one — a nested profile in
 *            there would be read as a hotkey with no `code`.
 *   commandKeys: [ { command: "Scoreboard", key: {...} }, … ]
 *            Keys of ours that fire a command of the *client's*. `builds` above
 *            sends a build order; this sends a press to the client's own
 *            `KeyboardHandler`. Flat rather than per side, because a client
 *            command is the same command whatever country you drew.
 *   commands: { version, at, items: ["CenterBase", …] }
 *            Which commands the client actually registers, harvested in the
 *            game tab (companion.js sendCommands) because the options page has
 *            no client to ask. On the terms of `roster` below: this half is
 *            what the page *offers*, `commandKeys` is what the user chose.
 *   chords:  { "<side>": { "<section>": { "<slot>": id | [id, id] | null } } }
 *            The user's chord **overrides**, slot index to object, laid over the
 *            layouts src/build-chords.js ships. A slot that is absent follows
 *            what ships; one stored as null is a key the user emptied on
 *            purpose. An array of ids is one key holding a country's several
 *            names for a thing. Separate from `builds` because it is keyed by
 *            position, not a list of key descriptors.
 *            Before 0.55.1 this held whole sections as arrays, which froze a
 *            layout against later fixes; those are dropped on load.
 *   taunts:  { "<slot>": 1..8 | null }
 *            The taunt overlay's layout overrides, on the same terms as
 *            `chords` above and with no side to key them by: a taunt is the
 *            same taunt whatever country you drew.
 *   roster:  { version, at, items: [ { name, type, sides: ["Allied"] }, … ] }
 *            What the client says can be built, harvested in the game tab from
 *            its own rules (companion.js sendRoster) because the options page
 *            has no game and therefore no rules. Names and costs are not in it —
 *            `replayTypes` below carries both for every object here, and the
 *            options page already loads that for the replay views.
 *   cameos:  { version, at, cols, cell: {width, height}, size: {width, height},
 *              sheet: "data:image/png;base64,…", index: { "GAPOWR": 0, … },
 *              pictures, ids, objects, missing: [ … ] }
 *            The sidebar picture for every object the client's art names, drawn
 *            in the game tab from the client's own SHPs and cameo.pal
 *            (hq-preview.js cameos). This is the only source of a sheet: it
 *            lands on window.__cdcCameos, which is the global the committed
 *            src/cameos.js used to publish before it was deleted — its 190 KB of
 *            artwork came out of a retail Red Alert 2 install, which no licence
 *            this repo can adopt covers. The shape was kept so every reader of
 *            the sheet went on working unchanged.
 *            `index` maps an id to a cell, and several ids share a cell where
 *            the game shares a picture. The counts after it are the harvest's
 *            own bookkeeping, not part of the drawing contract.
 *   cameoVersion: "0.83.3/1" — the client's version and the harvester's, joined.
 *            Apart from `cameos` on purpose: this is what a config push carries
 *            so a tab can answer "is the stored sheet still current" without
 *            reading a quarter of a megabyte of pixels to look at a string.
 *            Written in the same set as `cameos`, so it never claims a sheet
 *            that is not there.
 *   replayTypes: { version, at, types: { building: [ [name, label, cost, extra?],
 *              … ], infantry: […], vehicle: […], aircraft: […] },
 *              general: { maximumQueuedObjects, buildSpeed, multipleFactory,
 *              padAircraft: […] }, objects, named, … }
 *            The table a replay is written in, harvested in the game tab from
 *            the client's own four ordinal maps (hq-preview.js objectTypes).
 *            **The index of a row is the object id a replay names** — that is
 *            the whole contract, and the harvest fails rather than store a list
 *            with a hole in it. It lands on window.__cdcReplayTypes and
 *            window.__cdcReplayRules — the globals the committed
 *            src/replay-types.js used to publish before it was deleted, it
 *            having been generated from a retail Red Alert 2 install. The shape
 *            was kept so every reader decodes unchanged. The counts after
 *            `general` are the harvest's own bookkeeping, not part of the
 *            reading contract.
 *   replayTypesVersion: "0.83.3/1" — on exactly the terms of `cameoVersion`
 *            above, and written in the same set as `replayTypes`.
 *   colours: { version, at, mp: [name, …], colors: { name: "#rrggbb" } }
 *            Every colour this client's rules define, and which of them a
 *            lobby offers. Harvested in the game tab like the build roster,
 *            and the table the recolour preference picks names out of — a
 *            name, never a hex, because the client's renderer will only remap
 *            to a colour its own rules already hold. Small enough (a few
 *            dozen short strings) that the whole table travels in the config
 *            push rather than a stamp with the rows left behind.
 *   prefs:   { preferHqPreview: bool, autoRender: bool, fullIcons: bool,
 *              captureSample: bool, chordSinglePress: bool, grabTabKeys: bool,
 *              fullscreenOnEnter: bool, menuOffEscape: bool,
 *              sidebarKeys: bool, chordOnlyBuildable: bool,
 *              recolour: { on: bool, self: name, ally: name,
 *                          enemies: [name, …] },
 *              cardPreferHq: bool, viewerIcons: bool }
 *            `recolour` repaints the players of a match by role — a blank
 *            name is "keep what they picked", and `enemies` is ordered, so
 *            the second opponent takes the second entry.
 *            The first three are what the game draws — the loading-screen panel
 *            and the overlay; the two after captureSample are what the chord
 *            keys do, one of which takes a browser keyboard lock and so has to
 *            reach a match already in play. The last two are the options page's
 *            own cards and viewer, and are never read here: one setting used to
 *            answer for both, so a box in a ladder tab's list bar changed the
 *            overlay without saying so. One item, because the page writes them
 *            together.
 *   previewSrc: { "<map key>": "ours" | "original" }  // per-map, beats prefs
 *   spawnFix: { "<map key>": false }   // per-map, only the ones opted out
 *   spriteFix: { "<sprite type>": { x, y } }   // the offsets editor's save,
 *            over hq-preview.js's shipped SPRITE_FIX; the render reads it
 *   spriteFixByName: { "<object name>": { x, y } }  // the same, for one object
 *            rather than a whole type — e.g. CAAIRP, the airport
 *   appearance: { ore, gems, oreAlpha, shroudDim, all: { brightness, contrast },
 *              types: { "<element type>": { brightness, contrast } } }
 *            What the render looks like, as opposed to where its sprites land.
 *            Shape, defaults and clamps belong to src/render-tune.js, which is
 *            the one copy all four consumers read; this half only carries it.
 *            Whole rather than exceptions-only: a missing contrast that reads
 *            as 0 is a grey rectangle, and the failure would surface in a
 *            render far from the read that caused it.
 *   radarProbe: { v, at, client, map, S1_… }   // dev build only — the live
 *            answers the in-game radar is being built on: shroud vocabulary,
 *            whether revealed stays revealed, and the shapes of the order, pan
 *            and beacon paths in the client actually running
 *   align:   { key, name, width, height, fix, layers: ["base", …], at }
 *   settings: { at, requested: "read" | "write" | false, want, payload,
 *              done, ok, error, data, report, previous }
 *            One settings backup job — the request and its answer in one
 *            item, on the same terms as `bulk`. Only the game tab can read
 *            or write the client's own hotkey file and preferences, and only
 *            the options page can offer the user a file; this is what they
 *            say to each other. Nothing of the extension's own settings goes
 *            through here — the options page holds those already.
 *   tauntWav: { at, requested: "tau<cc><nn>.wav" | false, file, started,
 *              done, ok, missing, wav, why, error, cleared }
 *            One taunt audition. Same shape and same reason as `settings`:
 *            the sound files are the player's own import and live in the
 *            client's origin-private file system, which is per origin, so an
 *            options page cannot open one and a game tab must fetch it. `wav`
 *            is a data URL and is cleared by the page once it has played.
 *   align:<layer>: dataUrl                     // one item per layer, megabytes
 *
 * The full-size render lives in an item of its own, not in `renders`, because a
 * storage item is written whole: with thirty 3000px renders in one object,
 * every new map would rewrite a couple of hundred megabytes. The index keeps
 * only the small thumbnail, which is all the catalogue draws — the big one is
 * read when something actually opens it. That is also why the manifest asks for
 * "unlimitedStorage", and why there is a cap at all.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion/bridge]";

  // Every map the client has loaded, so the options page has something to list.
  // Capped, oldest-seen first, because thumbnails are the bulk of the storage.
  const MAX_MAPS = 120;

  // Renders are ~2-9 MB each, so this cap is about disk, not about tidiness.
  // Oldest render out first; the map itself stays in the catalogue either way.
  //
  // 60 rather than 30 since the ladder pool became renderable in one run: the
  // pool alone is about twenty maps, and a cap that the maps you merely play
  // can push the pool out of would undo the run every time you played a few
  // games. Sixty at up to ~9 MB is on the order of half a gigabyte — which is
  // what "unlimitedStorage" in the manifest is for, but it is a deliberate
  // ceiling rather than an accident.
  const MAX_RENDERS = 60;

  // Only the ones the game reads. The options page has two of its own in the
  // same item; they are pushed to the page world with everything else and
  // ignored there, which is cheaper than filtering a handful of booleans.
  const DEFAULT_PREFS = {
    preferHqPreview: true,
    autoRender: true,
    fullIcons: true,
    captureSample: false,
    sidebarKeys: true,
    chordSinglePress: false,
    chordOnlyBuildable: false,
    grabTabKeys: true,
    fullscreenOnEnter: true,
    menuOffEscape: true,
  };

  const DEFAULTS = {
    maps: {},
    guides: {},
    keys: {},
    builds: {},
    chords: {},
    taunts: {},
    commandKeys: [],
    // The offered list stays in storage for the options page. Unlike
    // `commandKeys` beside it there is nothing in the game tab that wants it
    // back: the tab reads the live handler, which is where this came from.
    commands: {},
    roster: {},
    // The stamp, not the sheet — see rememberCameos for why the two are apart.
    // The sheet itself is never in DEFAULTS, so no config push ever loads it.
    cameoVersion: "",
    // The same, for the object table: hundreds of rows in storage, one short
    // string in a config push. See rememberReplayTypes.
    replayTypesVersion: "",
    // Whole, unlike the two stamps above: see the contract at the top of the
    // file for why this table travels and those do not.
    colours: {},
    prefs: {},
    previewSrc: {},
    spawnFix: {},
    spriteFix: {},
    spriteFixByName: {},
    appearance: {},
  };

  /**
   * Every write this half makes, counted while it is in flight.
   *
   * The tab a run was opened in closes itself when the run ends, and a
   * `storage.local.set` of a multi-megabyte render is still travelling when that
   * happens: the picture was made, acknowledged by nobody, and lost with the
   * tab. That is why a Render could leave a card with the map's own preview and
   * no render of ours behind it.
   *
   * So the closing waits for silence rather than for the last message to have
   * been *sent*.
   */
  let writing = 0;
  const quiet = [];

  /**
   * An operation is in flight from the moment it arrives, not from the moment
   * it calls `set`.
   *
   * Counting only the `set` left a window with nothing in it: every one of
   * these starts by *reading* storage, and between the message arriving and the
   * read coming back the count is zero — so a run reporting itself finished in
   * that window found silence and closed the tab out from under a write that
   * had not been made yet. `begin`/`end` bracket the whole read-modify-write.
   */
  function begin() {
    writing++;
  }

  function end() {
    writing--;
    if (!writing) {
      while (quiet.length) quiet.shift()();
    }
  }

  function write(items, done) {
    begin();
    chrome.storage.local.set(items, () => {
      // `done` before the count drops: it is where the next write is started
      // from, and a count that reached zero in between would let the waiters go.
      if (done) done();
      end();
    });
  }

  function whenQuiet(done) {
    if (!writing) done();
    else quiet.push(done);
  }

  // --- the log --------------------------------------------------------------

  /**
   * How long a line may wait for company before it is sent.
   *
   * The page narrates a bulk render a few lines per map, and one storage write
   * per line would be a write per line for the whole run. Batched — except that
   * a warning goes at once, because the interesting run is the one that is
   * about to go wrong.
   */
  const LOG_FLUSH_MS = 400;

  let logPending = [];
  let logTimer = null;

  /**
   * Record what this half did. The worker owns the log (see background.js);
   * this only decides when to hand a batch over.
   *
   * The one thing worth writing down about a write is that it was *started* —
   * a card that never reached storage and a card whose write failed look
   * identical afterwards, and only the first of the two leaves no trace at all.
   */
  function logLine(msg, level, src) {
    logPending.push({
      at: Date.now(),
      src: src || "bridge",
      msg: String(msg),
      level: level || "info",
    });
    if (level && level !== "info") flushLog();
    else if (!logTimer) logTimer = setTimeout(flushLog, LOG_FLUSH_MS);
  }

  function flushLog(done) {
    if (logTimer) {
      clearTimeout(logTimer);
      logTimer = null;
    }
    if (!logPending.length) {
      if (done) done();
      return;
    }
    const lines = logPending;
    logPending = [];
    chrome.runtime.sendMessage({ type: "log", lines }, () => {
      // A worker that was asleep may answer nothing; reading lastError is what
      // stops that being reported as an unchecked error. The lines are gone
      // either way — the log is not worth a retry queue of its own.
      void chrome.runtime.lastError;
      if (done) done();
    });
  }

  // The last lines of a run are the ones worth having, and a tab being closed
  // or navigated away from takes an unsent batch with it.
  window.addEventListener("pagehide", () => flushLog());

  function post(message) {
    window.postMessage(Object.assign({ source: "cdc-bridge" }, message), "*");
  }

  /**
   * The `renders` index reduced to map key -> the renderer version that made
   * it. That is everything the page needs of it: the thumbnails in there are
   * megabytes, and the only question the page asks is "is the stored one
   * current". A render written before stamps existed answers 0, which is right
   * — it predates the renderer that would claim it.
   */
  function renderVersions(renders) {
    const out = {};
    for (const key of Object.keys(renders)) out[key] = renders[key].v || 0;
    return out;
  }

  /**
   * A preference the *game* changed — the swap hotkey, which is the only one.
   *
   * The page world has no `chrome.*`, so a key pressed mid-match can only reach
   * storage through here. Read-modify-write rather than a blind set: this item
   * also holds the options page's own settings, and the page may have an
   * unrelated one of them in flight.
   *
   * `clearPreviewSrc` is the map whose card-level setting the swap overruled.
   * It has to go in the same errand as the preference — left in place it would
   * outrank what was just written, and the key would have changed a setting
   * nothing on screen obeys.
   *
   * The write lands in `storage.onChanged` below, which pushes the config back
   * to the page and, in an open options tab, moves the tick-box. That is the
   * whole round trip: nothing has to be told twice.
   */
  function setPrefs(patch, clearPreviewSrc) {
    if (!patch || typeof patch !== "object") return;
    chrome.storage.local.get({ prefs: {}, previewSrc: {} }, (data) => {
      if (chrome.runtime.lastError) {
        logLine(`could not read prefs to update them — ${chrome.runtime.lastError.message}`, "warn");
        return;
      }
      const items = { prefs: { ...data.prefs, ...patch } };
      if (clearPreviewSrc && data.previewSrc && clearPreviewSrc in data.previewSrc) {
        const next = { ...data.previewSrc };
        delete next[clearPreviewSrc];
        items.previewSrc = next;
      }
      write(items, () => {
        if (chrome.runtime.lastError) {
          logLine(`could not store prefs — ${chrome.runtime.lastError.message}`, "warn");
          return;
        }
        logLine(
          `prefs from the game: ${Object.keys(patch).join(", ")}` +
            (items.previewSrc ? ` (cleared the card setting for "${clearPreviewSrc}")` : "")
        );
      });
    });
  }

  function pushConfig() {
    chrome.storage.local.get({ ...DEFAULTS, renders: {} }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read storage", chrome.runtime.lastError);
        // Answer anyway: silence is read as "the bridge is missing", which is a
        // different problem with a different fix.
        post({
          type: "config",
          version: chrome.runtime.getManifest().version,
          guides: {},
          keys: {},
          builds: {},
          commandKeys: [],
          chords: {},
          taunts: {},
          rosterVersion: "",
          cameoVersion: "",
          replayTypesVersion: "",
          prefs: DEFAULT_PREFS,
          previewSrc: {},
          spawnFix: {},
          spriteFix: {},
          spriteFixByName: {},
          appearance: {},
          renders: {},
          count: 0,
        });
        return;
      }
      post({
        type: "config",
        // The page has no chrome.* and therefore no manifest; this is the only
        // wire that can tell it which build it is running.
        version: chrome.runtime.getManifest().version,
        guides: data.guides,
        keys: data.keys,
        builds: data.builds,
        // The bindings travel, the list they were chosen from does not — see
        // DEFAULTS above.
        commandKeys: data.commandKeys,
        chords: data.chords,
        taunts: data.taunts,
        // The stamp only, not the roster: the page is where the roster came
        // from and has no use for it back — it sends one when this disagrees
        // with the client it is running against, and stays quiet when it does
        // not.
        rosterVersion: (data.roster && data.roster.version) || "",
        // On the same terms as rosterVersion above: the stamp travels, the
        // pictures do not. The tab has a committed sheet to draw from and only
        // needs to know whether harvesting again would change anything.
        cameoVersion: data.cameoVersion || "",
        // And the same for the object table, for the same reason: the tab has a
        // committed copy to decode from and only needs to know whether
        // harvesting again would change anything.
        replayTypesVersion: data.replayTypesVersion || "",
        prefs: { ...DEFAULT_PREFS, ...data.prefs },
        // Which preview each card was told to show. Small — one short string per
        // map the user has an opinion about — so it travels with every push.
        previewSrc: data.previewSrc,
        spawnFix: data.spawnFix,
        // Six pairs of numbers. They decide where every sprite in a render
        // lands, so they travel with every push rather than being fetched by
        // the renderer at the moment it needs them.
        spriteFix: data.spriteFix,
        // A handful of pairs of numbers, on the same terms as spriteFix above.
        spriteFixByName: data.spriteFixByName,
        // What a render looks like. Travels whole with every push for the same
        // reason spriteFix does: the renderer cannot fetch it at the moment it
        // needs it, and the radar repaints against it live.
        appearance: data.appearance,
        renders: renderVersions(data.renders),
        count: Object.keys(data.maps).length,
      });
    });
  }

  /**
   * The appearance table, written from the game tab's own dials.
   *
   * Whole rather than merged, which is the same way the options page writes it:
   * the sender normalises the table before posting, so there is one shape on
   * disk and a partial write is the only thing that could leave a half-updated
   * pair there.
   */
  function setAppearance(appearance) {
    if (!appearance || typeof appearance !== "object") return;
    write({ appearance }, () => {
      if (chrome.runtime.lastError) {
        logLine(`could not store the appearance table — ${chrome.runtime.lastError.message}`, "warn");
        return;
      }
      logLine("appearance from the game: the in-game dials");
    });
  }

  function rememberMap(map) {
    if (!map || !map.key) {
      post({ type: "stored", ok: false, key: "", error: "no key on the map" });
      return;
    }
    begin();
    chrome.storage.local.get({ maps: {} }, (data) => {
      if (chrome.runtime.lastError) {
        logLine(`card ${map.key}: could not be read back — ${chrome.runtime.lastError.message}`, "error");
        post({
          type: "stored",
          ok: false,
          key: map.key,
          error: chrome.runtime.lastError.message,
        });
        end();
        return;
      }
      // Before the write, not after: the failure this is here to catch is a
      // card whose write never started, and an entry written afterwards cannot
      // describe one.
      logLine(`card ${map.key}: writing`);
      const maps = data.maps;
      const previous = maps[map.key];
      maps[map.key] = {
        name: map.name,
        thumb: map.thumb,
        // Absent for a map that marks its own start positions, and absent is
        // what the options page reads as "nothing to offer a toggle for".
        thumbFixed: map.thumbFixed || null,
        facts: map.facts,
        // What is on the map — a few kilobytes beside a thumbnail of a hundred,
        // and the only part of a render that survives without the engine. The
        // stored one is kept when a survey fails: a card rewritten for its name
        // must not throw away contents this session may not be able to redo.
        objects: map.objects || (previous && previous.objects) || null,
        seen: Date.now(),
      };

      const keys = Object.keys(maps);
      if (keys.length > MAX_MAPS) {
        keys
          .sort((a, b) => (maps[a].seen || 0) - (maps[b].seen || 0))
          .slice(0, keys.length - MAX_MAPS)
          .forEach((k) => delete maps[k]);
      }

      write({ maps }, () => {
        const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
        logLine(
          error ? `card ${map.key}: FAILED — ${error}` : `card ${map.key}: stored`,
          error ? "error" : "info"
        );
        post({
          type: "stored",
          ok: !error,
          key: map.key,
          count: Object.keys(maps).length,
          error,
        });
      });
      // `write` has already taken its own count, so the bracket can close here.
      end();
    });
  }

  const fullKey = (key) => "full:" + key;

  function rememberRender(key, render) {
    if (!key || !render || !render.thumb) return;
    // `guides` comes along because the cap must not throw away a map somebody
    // wrote notes for. See the eviction below.
    begin();
    chrome.storage.local.get({ renders: {}, guides: {} }, (data) => {
      if (chrome.runtime.lastError) {
        logLine(`render ${key}: could not be read back — ${chrome.runtime.lastError.message}`, "error");
        post({ type: "stored", ok: false, key, what: "render", error: chrome.runtime.lastError.message });
        end();
        return;
      }
      const renders = data.renders;
      // `v` comes from the render, not from here: this half has no opinion on
      // what a render looks like and must not invent a stamp for one.
      // `icons` is where the full render's tech-building badges live now that it
      // does not carry them baked in: a handful of {x,y,size,glyph,colour} in
      // fractions of the picture, drawn over it by whoever shows it. Kept in the
      // index rather than beside the heavy full-size item, because it is a few
      // hundred bytes and the thing that reads it may never fetch the picture.
      renders[key] = {
        thumb: render.thumb,
        at: Date.now(),
        v: render.v || 0,
        icons: render.icons || [],
      };

      // Evict by age, and take the heavy item with the index entry — an orphaned
      // full-size render would be storage nobody can find again.
      //
      // Never a map with a guide, and never the one just rendered. A render can
      // be drawn again; the guide is the one thing here a human wrote, and
      // "captured once, kept" is the promise the cap was quietly breaking. If
      // every candidate is spoken for, the store goes over the cap instead of
      // throwing something away — a cap is a safety net, not a mandate.
      const over = Object.keys(renders).length - MAX_RENDERS;
      const evicted = Object.keys(renders)
        .filter((k) => k !== key && !data.guides[k])
        .sort((a, b) => (renders[a].at || 0) - (renders[b].at || 0))
        .slice(0, Math.max(0, over));
      evicted.forEach((k) => delete renders[k]);

      logLine(
        `render ${key}: writing (thumb + ${render.full ? "full" : "no full"})` +
          (evicted.length ? `, evicting ${evicted.length}` : "")
      );
      const items = { renders };
      // Recorded rather than done silently: a render going missing with nothing
      // to explain it reads as a bug. The Stored maps tab shows this until it is
      // dismissed.
      if (evicted.length) items.evicted = { at: Date.now(), cap: MAX_RENDERS, keys: evicted };
      if (render.full) items[fullKey(key)] = render.full;

      write(items, () => {
        const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
        logLine(
          error ? `render ${key}: FAILED — ${error}` : `render ${key}: stored`,
          error ? "error" : "info"
        );
        if (evicted.length) chrome.storage.local.remove(evicted.map(fullKey));
        post({
          type: "stored",
          ok: !error,
          key,
          count: Object.keys(renders).length,
          what: "render",
          error,
        });
      });
      // `write` has already taken its own count, so the bracket can close here.
      end();
    });
  }

  /**
   * Hand one stored render back to the page.
   *
   * The page only ever holds the render it made itself, and it does not remake
   * one that is already stored — so for every map the bulk run got to first,
   * the in-game preview and the fullscreen view had nothing to show. The
   * config push cannot carry these: it is sent on every edit and a render is
   * megabytes. So it goes one map at a time, when that map is the one loading.
   *
   * A missing render is answered too, rather than silently: the page asked
   * because its own index said there was one, and a `null` is how it finds out
   * that index is stale.
   */
  function sendRender(key) {
    if (!key) return;
    chrome.storage.local.get({ renders: {}, [fullKey(key)]: "" }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the stored render", chrome.runtime.lastError);
        post({ type: "render-have", key, render: null });
        return;
      }
      const stored = data.renders[key];
      post({
        type: "render-have",
        key,
        render: stored
          ? {
              thumb: stored.thumb,
              full: data[fullKey(key)] || "",
              v: stored.v || 0,
              icons: stored.icons || [],
            }
          : null,
      });
    });
  }

  /**
   * The catalogue's names, out to the page and corrections back.
   *
   * Names are the one field this half cannot check: it has no client, so it
   * cannot tell a title from the CSF key a networked game reported. The page
   * can, and only sends back the keys whose name it disagrees with.
   */
  function sendNames() {
    chrome.storage.local.get({ maps: {} }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the catalogue", chrome.runtime.lastError);
        return;
      }
      const names = {};
      for (const [key, entry] of Object.entries(data.maps)) names[key] = entry.name || "";
      post({ type: "names-have", names });
    });
  }

  function renameMaps(fixes) {
    const keys = Object.keys(fixes || {});
    if (!keys.length) return;
    chrome.storage.local.get({ maps: {} }, (data) => {
      if (chrome.runtime.lastError) {
        post({ type: "stored", ok: false, key: "", what: "names", error: chrome.runtime.lastError.message });
        return;
      }
      const maps = data.maps;
      let changed = 0;
      for (const key of keys) {
        // A card that vanished between the two reads is not recreated from a
        // name: the catalogue is written by what plays a map, not by this.
        if (!maps[key] || maps[key].name === fixes[key]) continue;
        maps[key] = { ...maps[key], name: fixes[key] };
        changed++;
      }
      if (!changed) return;
      write({ maps }, () => {
        const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
        post({ type: "stored", ok: !error, key: "", count: changed, what: "names", error });
      });
    });
  }

  const alignKey = (layer) => "align:" + layer;

  /**
   * The alignment sample: one map, rendered into per-type layers, for the panel
   * on the options page. Exactly one is kept — this is an instrument, not a
   * catalogue — and each layer is its own item for the same reason the full-size
   * renders are.
   */
  function rememberSample(sample) {
    if (!sample || !sample.layers) return;
    const names = Object.keys(sample.layers);
    if (!names.length) return;

    chrome.storage.local.get({ align: null, prefs: {} }, (data) => {
      if (chrome.runtime.lastError) {
        post({ type: "stored", ok: false, key: sample.key, what: "sample", error: chrome.runtime.lastError.message });
        return;
      }
      const previous = data.align;
      const items = {
        align: {
          key: sample.key,
          name: sample.name,
          width: sample.width,
          height: sample.height,
          fix: sample.fix,
          // The per-object baseline, kept for the same reason `fix` is: it is
          // what the panel's reset button puts a by-name dial back to, and
          // without it the airport resets to zero rather than to what the
          // render was using.
          fixByName: sample.fixByName,
          // Which dials the capturing build could split out — the difference
          // between "this map has none" and "this sample is older than the
          // dial". Absent on a sample captured before 0.30.0.
          dials: sample.dials,
          layers: names,
          at: Date.now(),
        },
      };
      names.forEach((layer) => (items[alignKey(layer)] = sample.layers[layer]));

      // Asking for a sample is a request for the next map, not a mode: the map
      // after it should not cost another render.
      if (data.prefs && data.prefs.captureSample) {
        items.prefs = { ...data.prefs, captureSample: false };
      }

      write(items, () => {
        const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
        // A map with no smudges leaves that layer out; the previous sample's copy
        // of it would then sit in storage with nothing pointing at it.
        const stale = ((previous && previous.layers) || []).filter((l) => !sample.layers[l]);
        if (stale.length) chrome.storage.local.remove(stale.map(alignKey));
        post({ type: "stored", ok: !error, key: sample.key, what: "sample", error });
      });
    });
  }

  /**
   * A bulk render is asked for by the options page and carried out by the game
   * tab, which are two contexts that cannot talk to each other. Storage is the
   * only thing they share, so the `bulk` item is both the request and the
   * progress readout:
   *
   *   { at, maps: [{ title, file }], requested, force, only, from, started,
   *     done, total, rendered, skipped, active, failed: [], finishedAt }
   *
   * The options page writes it with `requested: true` and nothing else. This
   * half clears that flag the moment it forwards the request — so the progress
   * writes that follow, which change the same item, cannot be mistaken for a
   * second request and start the run again.
   *
   * `force` redoes a render the current renderer already made — what a single
   * card's *Re-render* asks for. `only` is that card's map key, and `from` is
   * the ladder whose pool asked instead; nothing here reads either, they ride
   * along so the progress can find the card or the tab that asked. The patch
   * spreads the stored item, which is what carries them through every write —
   * a run is one item, and its origin outlives the request that set it.
   */
  function bulkPatch(patch) {
    // Bracketed like every other read-modify-write here, and this one is the
    // last line of the run: the tab is asked to close as soon as nothing is in
    // flight, and the count is zero between this read going out and its write
    // coming back. A run whose last map was *already current* has no render
    // write to hide behind — nothing else is in flight — so the tab could close
    // over the write that says the run finished, leaving the options page to
    // decide the run had stopped answering.
    begin();
    chrome.storage.local.get({ bulk: null }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the run state", chrome.runtime.lastError);
        end();
        return;
      }
      // `patchedAt` is what tells a run that has gone quiet from one that is
      // merely slow: without it a run whose last write never landed stayed
      // "in flight" for ever, and every later run was refused.
      write({ bulk: { ...(data.bulk || {}), ...patch, requested: false, patchedAt: Date.now() } });
      // `write` has already taken its own count, so the bracket can close here.
      end();
    });
  }

  function startBulk(request) {
    // { title, file } per map, not a bare title: a title can name two maps and
    // the file is which one the ladder means. See src/ladder.js.
    const maps = (request && request.maps) || [];
    const harvest = !!(request && request.harvest);
    // A harvest takes no maps and is still a run with something to do, so the
    // "nothing was ticked" answer below is only right when nothing was asked
    // for at all.
    if (!maps.length && !harvest) {
      // Every counter, not just the ones this case has a value for: the patch
      // spreads the stored item, so a field left out keeps the *previous* run's
      // number and reports it as this one's.
      bulkPatch({
        started: Date.now(),
        done: 0,
        total: 0,
        rendered: 0,
        skipped: 0,
        active: "",
        failed: ["nothing was ticked"],
        finishedAt: Date.now(),
      });
      return;
    }
    bulkPatch({
      started: Date.now(),
      done: 0,
      // A floor, not the answer: which harvesters exist and which can run is
      // the page's knowledge, and its first progress report replaces this. It
      // counts at least one so a harvest that stalls before answering reads as
      // "0 of 1 and stuck" rather than as "nothing to do".
      total: maps.length + (harvest ? 1 : 0),
      rendered: 0,
      skipped: 0,
      active: "",
      failed: [],
      finishedAt: null,
    });
    post({
      type: "bulk-run",
      maps,
      force: !!(request && request.force),
      // The same run, pointed at the alignment panel: one map, captured into
      // layers instead of drawn flat.
      sample: !!(request && request.sample),
      // ...and the same run asked for what the client itself holds, which needs
      // no map and no renderer.
      harvest,
    });
  }

  /**
   * A settings backup job.
   *
   * The same request-and-progress-in-one-item shape as `bulk`, and for the same
   * reason: storage is the only thing the options page and a game tab share. The
   * `requested` flag is cleared as the job is forwarded, so the answer landing on
   * the same item cannot be read as a second request.
   *
   * `payload` travels only on a write, and is dropped when the answer lands: it
   * is a copy of a file the user still has, and there is nothing to be gained
   * from leaving it in storage.
   */
  /**
   * One taunt's sound, fetched for the options page.
   *
   * The same request-and-answer-on-one-storage-item shape as `settings`, and
   * for the same reason: storage is the only thing an options page and a game
   * tab share. A separate item from `taunts`, which is the *layout* — a config
   * push watches that one, and an audition must not look like a layout edit.
   *
   * `wav` is a data URL and is the largest thing this extension ever puts in
   * storage — around 100 KB for a two-second clip. It is overwritten by the
   * next audition and cleared by the page once it has played, so what is left
   * behind between sessions is the file name and nothing else.
   */
  function tauntWavPatch(patch) {
    begin();
    chrome.storage.local.get({ tauntWav: null }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the taunt job", chrome.runtime.lastError);
        end();
        return;
      }
      write({
        tauntWav: { ...(data.tauntWav || {}), ...patch, requested: false, patchedAt: Date.now() },
      });
      end();
    });
  }

  function startTauntWav(request) {
    const file = String((request && request.requested) || "");
    // The name is the client's own `tau<cc><nn>.wav`, and it is about to become
    // a file-system lookup on the page: anything else is refused here rather
    // than forwarded.
    if (!/^tau[a-z]{2}\d{2}\.wav$/.test(file)) {
      tauntWavPatch({ file, done: true, ok: false, missing: false, wav: "", error: "not a taunt file name" });
      return;
    }
    tauntWavPatch({
      file,
      started: Date.now(),
      done: false,
      ok: false,
      missing: false,
      wav: "",
      why: "",
      error: "",
      // A new request is not the last answer emptied, whatever the item held.
      cleared: false,
    });
    post({ type: "taunt-wav-job", file });
  }

  function settingsPatch(patch) {
    begin();
    chrome.storage.local.get({ settings: null }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the settings job", chrome.runtime.lastError);
        end();
        return;
      }
      write({
        settings: { ...(data.settings || {}), ...patch, requested: false, patchedAt: Date.now() },
      });
      end();
    });
  }

  function startSettings(request) {
    const mode = request && request.requested === "write" ? "write" : "read";
    settingsPatch({
      mode,
      started: Date.now(),
      done: false,
      ok: false,
      error: "",
      // The previous job's answer must not be read as this one's.
      data: null,
      report: null,
      previous: null,
    });
    post({
      type: "settings-job",
      mode,
      want: (request && request.want) || { hotkeys: true, prefs: true },
      payload: (request && request.payload) || null,
    });
  }

  /**
   * How many harvested matches are kept.
   *
   * A harvest is ~20 KB against renders that are megabytes, so this is not about
   * space — it is about a list that would otherwise grow for ever with matches
   * nobody will open again. Re-running one costs seconds.
   */
  const MAX_SIMS = 40;

  function simPatch(patch) {
    begin();
    chrome.storage.local.get({ sim: null }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the replay run state", chrome.runtime.lastError);
        end();
        return;
      }
      write({ sim: { ...(data.sim || {}), ...patch, requested: false, patchedAt: Date.now() } });
      end();
    });
  }

  function startSim(request) {
    if (!request || !request.gameId) {
      simPatch({ error: "no match was named", finishedAt: Date.now() });
      return;
    }
    simPatch({ started: Date.now(), gameId: request.gameId, tick: 0, endTick: 0, error: "", finishedAt: null });
    // `pace` is the debug speed from the options page — null when it is left to
    // the run's own rule. Carried straight through: this half knows nothing
    // about ticks.
    post({ type: "sim-run", gameId: request.gameId, pace: request.pace === undefined ? null : request.pace });
  }

  /**
   * A finished harvest, stored under the match it belongs to.
   *
   * Keyed by game id rather than appended to a list: the same replay opened
   * twice is the same answer, and a second run should replace the first rather
   * than leave the page choosing between them.
   */
  /**
   * Store a harvest.
   *
   * `result.checkpoint` marks one a run sent **while it is still going**: the
   * same harvest, minus whatever the match has not reached yet. It is stored
   * exactly like a finished one — a report drawn from 97% of a match is a report
   * — but it does not close the run out, because the run is not over. Three tabs
   * died at 98% of a nine-minute match with everything they had harvested inside
   * them; this is what makes that cost seconds instead of everything.
   */
  function rememberSim(result) {
    if (!result || !result.gameId) {
      simPatch({ error: "the run came back without a match id", finishedAt: Date.now() });
      return;
    }
    const checkpoint = !!result.checkpoint;
    begin();
    chrome.storage.local.get({ sims: {} }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the stored runs", chrome.runtime.lastError);
        end();
        return;
      }
      const sims = { ...(data.sims || {}), [result.gameId]: result };
      const keys = Object.keys(sims);
      if (keys.length > MAX_SIMS) {
        // Oldest first, by when it was harvested — a run with no `at` is older
        // than anything that has one.
        keys
          .sort((a, b) => (sims[a].at || 0) - (sims[b].at || 0))
          .slice(0, keys.length - MAX_SIMS)
          .forEach((key) => delete sims[key]);
      }
      write({ sims });
      end();
      if (checkpoint) {
        // No log line and no finish: a checkpoint is a save, not an event, and
        // one every second or two would be the whole log.
        simPatch({ tick: result.tick, endTick: result.endTick, saved: result.tick });
        return;
      }
      logLine(
        `replay ${result.gameId.slice(0, 8)} ${result.complete ? "played out" : "stopped early"} ` +
          `at tick ${result.tick}/${result.endTick}${result.error ? " — " + result.error : ""}`,
        result.error ? "warn" : "info"
      );
      simPatch({
        tick: result.tick,
        endTick: result.endTick,
        complete: !!result.complete,
        error: result.error || "",
        finishedAt: Date.now(),
      });
    });
  }

  /**
   * The buildable roster, replaced whole.
   *
   * Replaced rather than merged: it is one client's answer about one version of
   * itself, and half of an old client's list mixed into a new one's would be a
   * roster no client ever had. The page only sends one when the stored stamp
   * disagrees with the client it is running against, so this is rare.
   */
  function rememberRoster(roster) {
    if (!roster || !Array.isArray(roster.items) || !roster.items.length) {
      console.warn(TAG, "empty build roster ignored", roster);
      return;
    }
    // No begin/end of its own — `write` brackets the errand itself, and this
    // one has nothing to read first.
    write({ roster });
    logLine(`build roster: ${roster.items.length} objects from client ${roster.version || "(unversioned)"}`);
  }

  /**
   * The colour table, replaced whole.
   *
   * Replaced for the reason `rememberRoster` above is: it is one client's
   * answer about one version of itself, and a colour an older client defined
   * that a newer one dropped would sit in the options page offering a name the
   * renderer would refuse. The stamp rides inside the table rather than beside
   * it — it is small enough that no config push has to choose between them.
   */
  function rememberColours(colours) {
    if (!colours || !colours.colors || !Object.keys(colours.colors).length) {
      console.warn(TAG, "empty colour table ignored", colours);
      return;
    }
    write({ colours });
    logLine(
      `colour table: ${Object.keys(colours.colors).length} colours from client ` +
        `${colours.version || "(unversioned)"}`
    );
  }

  /**
   * The client's own command list, replaced whole.
   *
   * Replaced for the reason `rememberColours` above is: it is one client's
   * answer about one version of itself, and a command an older client
   * registered that a newer one dropped would sit in the options page offering
   * a binding that could never fire.
   */
  function rememberCommands(commands) {
    if (!commands || !Array.isArray(commands.items) || !commands.items.length) {
      console.warn(TAG, "empty command table ignored", commands);
      return;
    }
    write({ commands });
    logLine(
      `command table: ${commands.items.length} commands from client ` +
        `${commands.version || "(unversioned)"}`
    );
  }

  /**
   * The harvested cameo sheet, and the stamp that says what drew it.
   *
   * **Two keys for one harvest, deliberately.** `cameos` is the pixels — a
   * quarter of a megabyte of PNG — and `cameoVersion` is the few bytes that say
   * whether they are still current. Every config push would otherwise have to
   * read the sheet out of storage to look at one string, on every page load of
   * every game tab, to answer a question that never needs the picture.
   *
   * They are written in one `set`, so there is no window in which the stamp
   * claims a sheet that is not there.
   */
  function rememberCameos(cameos) {
    if (!cameos || !cameos.sheet || !cameos.index || !Object.keys(cameos.index).length) {
      console.warn(TAG, "empty cameo harvest ignored", cameos);
      return;
    }
    const ids = Object.keys(cameos.index).length;
    // Before the write, not after: the failure this is here to catch is a sheet
    // whose write never started, and an entry added on the acknowledgement
    // cannot describe one whose acknowledgement never comes.
    logLine(
      `cameos: writing ${ids} ids as ${cameos.pictures} pictures, ` +
        `${Math.round(cameos.sheet.length / 1024)} KB, from client ${cameos.version || "(unversioned)"}`
    );
    write({ cameos, cameoVersion: cameos.version || "" }, () => {
      const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
      logLine(error ? `cameos: FAILED — ${error}` : "cameos: stored", error ? "error" : "info");
      post({ type: "stored", ok: !error, key: "cameos", count: ids, what: "cameos", error });
    });
  }

  /**
   * The harvested object table, and the stamp that says what read it.
   *
   * **Two keys for one harvest**, exactly as `rememberCameos` above: the table
   * is hundreds of rows and `replayTypesVersion` is the few bytes that say
   * whether they are still current, so a config push answers "harvest again?"
   * without reading the table on every page load of every game tab. They go in
   * one `set`, so there is no window in which the stamp claims a table that is
   * not there.
   *
   * An empty harvest is refused rather than stored. A replay decoded against a
   * table with nothing in it names every object as a number, which reads as a
   * client that never had the rules — and the one already in storage came from
   * a client that did.
   */
  function rememberReplayTypes(replayTypes) {
    const types = (replayTypes && replayTypes.types) || null;
    const ids = types
      ? ["building", "infantry", "vehicle", "aircraft"].reduce(
          (n, key) => n + ((types[key] && types[key].length) || 0),
          0
        )
      : 0;
    if (!ids || !replayTypes.general) {
      console.warn(TAG, "empty object table ignored", replayTypes);
      return;
    }
    // Before the write, not after — the failure this catches is a write that
    // never started, and an entry added on the acknowledgement cannot describe
    // one whose acknowledgement never comes.
    logLine(
      `replay types: writing ${ids} ids, ${replayTypes.named || 0} named, ` +
        `from client ${replayTypes.version || "(unversioned)"}`
    );
    write({ replayTypes, replayTypesVersion: replayTypes.version || "" }, () => {
      const error = chrome.runtime.lastError && chrome.runtime.lastError.message;
      logLine(error ? `replay types: FAILED — ${error}` : "replay types: stored", error ? "error" : "info");
      post({ type: "stored", ok: !error, key: "replayTypes", count: ids, what: "replayTypes", error });
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "cdc-page") return;

    if (data.type === "ready") {
      pushConfig();
      // The page's listener is up, so a run that was waiting in storage can be
      // handed over — this is the tab the options page opened for it.
      takePendingRun();
    }
    else if (data.type === "map-seen") {
      rememberMap(data.map);
      pushConfig(); // the page may have started before storage was read
    } else if (data.type === "log") {
      // The page has no chrome.* and cannot reach the worker; its own narration
      // comes through here so the log is one story rather than two.
      logLine(data.msg, data.level, "page");
    } else if (data.type === "map-render") {
      rememberRender(data.key, data.render);
    } else if (data.type === "taunt-wav-result") {
      tauntWavPatch({
        file: data.file,
        done: true,
        ok: !!data.ok,
        missing: !!data.missing,
        wav: data.wav || "",
        why: data.why || "",
        error: data.error || "",
        finishedAt: Date.now(),
      });
    } else if (data.type === "render-wanted") {
      sendRender(data.key);
    } else if (data.type === "names-wanted") {
      sendNames();
    } else if (data.type === "map-names") {
      renameMaps(data.names);
    } else if (data.type === "build-roster") {
      rememberRoster(data.roster);
    } else if (data.type === "colour-table") {
      rememberColours(data.colours);
    } else if (data.type === "command-table") {
      rememberCommands(data.commands);
    } else if (data.type === "cameo-sheet") {
      rememberCameos(data.cameos);
    } else if (data.type === "replay-types") {
      rememberReplayTypes(data.replayTypes);
    } else if (data.type === "radar-probe") {
      // The dev build's radar probe, collected while a match is played and read
      // back with `node scripts/read-storage.mjs radarProbe`. One item, written
      // whole: the page half already throttles it to a change in the answer, so
      // a write here is a write worth making. Absent from the public build --
      // src/radar-probe.js is dropped from the manifest there and nothing ever
      // sends this.
      write({ radarProbe: data.report });
    } else if (data.type === "prefs-set") {
      setPrefs(data.prefs, data.clearPreviewSrc);
    } else if (data.type === "appearance-set") {
      setAppearance(data.appearance);
    } else if (data.type === "settings-result") {
      settingsPatch({
        done: true,
        ok: !!data.ok,
        error: data.error || "",
        data: data.data || null,
        report: data.report || null,
        previous: data.previous || null,
        payload: null,
      });
      // A tab opened for this job alone has nothing else to do. As with a render
      // run, only once every write has landed — the worker closes the tab, and a
      // write still in flight when it goes is the answer thrown away.
      whenQuiet(() => {
        flushLog(() =>
          chrome.runtime.sendMessage({ type: "run-finished" }, () => {
            void chrome.runtime.lastError; // the worker may be asleep
          })
        );
      });
    } else if (data.type === "map-sample") {
      rememberSample(data.sample);
    } else if (data.type === "sim-progress") {
      // `heap` is carried into storage rather than only logged: a run that kills
      // its tab writes nothing afterwards, so the last progress written is the
      // only evidence of what it was doing when it died.
      simPatch({
        tick: data.tick,
        endTick: data.endTick,
        heap: data.heap || 0,
        heapLimit: data.heapLimit || 0,
        heapBase: data.heapBase || 0,
        // The whole climb, not just where it is now: a tab that dies leaves this
        // item exactly as its last write left it, and the shape is the evidence.
        trace: data.trace || [],
      });
    } else if (data.type === "sim-result") {
      rememberSim(data.result);
      // A checkpoint leaves the tab alone: the run is still playing the match.
      if (data.result && data.result.checkpoint) return;
      // The tab was opened for this one match and has nothing else to do. Same
      // rule as a render run: only once every write has landed, or the harvest
      // is thrown away by the tab closing over it.
      whenQuiet(() => {
        flushLog(() =>
          chrome.runtime.sendMessage({ type: "run-finished" }, () => {
            void chrome.runtime.lastError; // the worker may be asleep
          })
        );
      });
    } else if (data.type === "bulk-progress") {
      bulkPatch({
        done: data.done,
        total: data.total,
        rendered: data.rendered,
        skipped: data.skipped || 0,
        active: data.active,
        failed: data.failed || [],
        finishedAt: data.finished ? Date.now() : null,
      });
      // A tab opened for this run has nothing left to do. The worker closes it
      // only if it opened it, so a run started in the user's own tab is a
      // message that changes nothing.
      //
      // Only once every write has landed. The last map's render is a
      // multi-megabyte `set` that is still in flight when the run reports
      // finished, and closing the tab under it threw the picture away — the
      // card kept the map's own preview and nothing behind it.
      if (data.finished) {
        logLine(`run finished — ${writing} write(s) still in flight`);
        whenQuiet(() => {
          // The log goes last and the tab is asked to close only once it has
          // landed: everything above is written down precisely so it can be
          // read after the tab is gone, and a batch still in this buffer when
          // the tab closes is the one batch that explains why.
          flushLog(() =>
            chrome.runtime.sendMessage({ type: "run-finished" }, () => {
              // The worker may be asleep and answer nothing. Reading lastError
              // is what stops that from being logged as an unchecked error.
              void chrome.runtime.lastError;
            })
          );
        });
      }
    }
  });

  // Edits made in the options page reach a running game without a reload.
  // `renders` is in the list because the page skips a map it believes is already
  // stored: after *Clear renders* a running tab would go on skipping every map
  // it had rendered before, and the point of clearing is to render them again.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (
      changes.guides ||
      changes.keys ||
      changes.builds ||
      changes.chords ||
      changes.taunts ||
      changes.prefs ||
      changes.renders ||
      changes.previewSrc ||
      changes.spawnFix ||
      changes.spriteFix ||
      changes.spriteFixByName ||
      changes.appearance
    ) {
      pushConfig();
    }
    // A run asked for from the options page. Only the flag starts one — this
    // half's own progress writes land on the same item and must not re-trigger.
    const bulk = changes.bulk && changes.bulk.newValue;
    if (bulk && bulk.requested) startBulk(bulk);
    const settings = changes.settings && changes.settings.newValue;
    if (settings && settings.requested) startSettings(settings);
    const tauntWav = changes.tauntWav && changes.tauntWav.newValue;
    if (tauntWav && tauntWav.requested) startTauntWav(tauntWav);
  });

  /**
   * A request written before this tab existed.
   *
   * The options page opens a game tab when nothing answers, so by the time this
   * half loads the run is already sitting in storage with its flag up — and
   * `storage.onChanged` will never fire for a write that happened first. Two
   * tabs both finding the same flag would both run it; the window is the
   * milliseconds before `startBulk` clears the flag, and the cost is duplicated
   * work rather than a wrong result.
   *
   * Normally taken when the page says `ready`, which is proof its listener is
   * installed — the two halves are separate content scripts and neither is
   * guaranteed to load first. The timer is the case where the page said it
   * before this half was listening.
   */
  let tookPending = false;

  function takePendingRun() {
    if (tookPending) return;
    tookPending = true;
    chrome.storage.local.get({ bulk: null, sim: null, settings: null, tauntWav: null }, (data) => {
      if (chrome.runtime.lastError) {
        console.warn(TAG, "could not read the run state", chrome.runtime.lastError);
        return;
      }
      if (data.bulk && data.bulk.requested) startBulk(data.bulk);
      // The page world's fetch patch is waiting to hear whether there is a
      // replay to hand over, and it has to be told **either way**: a null is
      // what lets it step out of the way, and without one it sits in front of
      // the client's own fetch until its backstop fires. Posted on every replay
      // route for that reason, job or no job.
      if (typeof location !== "undefined" && /^#\/replay\//.test(location.hash)) {
        post({ type: "sim-local", text: (data.sim && data.sim.requested && data.sim.text) || null });
      }
      // A replay run is the other kind of job this tab can have been opened
      // for, and the two never arrive together: one wants the client's menu,
      // the other wants it already on a match.
      if (data.sim && data.sim.requested) startSim(data.sim);
      // And the third: a backup asked for in a browser with no game tab open,
      // which is the ordinary case — the options page is where it starts.
      if (data.settings && data.settings.requested) startSettings(data.settings);
      if (data.tauntWav && data.tauntWav.requested) startTauntWav(data.tauntWav);
    });
  }

  pushConfig();
  setTimeout(takePendingRun, 1500);
})();
