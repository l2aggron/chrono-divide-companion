/**
 * Options page: four tabs — one per ranked ladder, the hotkeys, and the sprite
 * alignment instrument.
 *
 * A ladder tab is the whole instrument for one pool: sample it off the ladder,
 * tick what you want, render the ticked maps, and edit the guides of the maps
 * that ladder plays. The two are the same panel pointed at different pools, so
 * they are built from one template rather than written out twice.
 *
 * The catalogue is written by src/bridge.js as maps are parsed in game; this
 * page only reads it. Guides and hotkeys are written back, and the bridge
 * pushes them into a running game through storage.onChanged — no reload.
 */
(() => {
  "use strict";

  const tabsEl = document.getElementById("tabs");
  const panelsEl = document.getElementById("panels");
  const ladderTplEl = document.getElementById("ladderTpl");
  const keysEl = document.getElementById("keys");
  const buildSidesEl = document.getElementById("buildSides");
  const chordSidesEl = document.getElementById("chordSides");
  const chordTabsEl = document.getElementById("chordTabs");
  const chordGridEl = document.getElementById("chordGrid");
  const chordPickEl = document.getElementById("chordPick");
  const chordClearEl = document.getElementById("chordClear");
  const chordResetEl = document.getElementById("chordReset");
  const chordSlotNameEl = document.getElementById("chordSlotName");
  const tauntGridEl = document.getElementById("tauntGrid");
  const tauntCountriesEl = document.getElementById("tauntCountries");
  const tauntNoteEl = document.getElementById("tauntNote");
  const tauntPickEl = document.getElementById("tauntPick");
  const tauntClearEl = document.getElementById("tauntClear");
  const tauntResetEl = document.getElementById("tauntReset");
  const tauntSlotNameEl = document.getElementById("tauntSlotName");
  const buildListEl = document.getElementById("buildList");
  const buildPickEl = document.getElementById("buildPick");
  const buildAddEl = document.getElementById("buildAdd");
  const commandListEl = document.getElementById("commandList");
  const commandPickEl = document.getElementById("commandPick");
  const commandAddEl = document.getElementById("commandAdd");
  const prefOriginalEl = document.getElementById("prefOriginal");
  const prefFullIconsEl = document.getElementById("prefFullIcons");
  const prefAutoRenderEl = document.getElementById("prefAutoRender");
  const prefSidebarKeysEl = document.getElementById("prefSidebarKeys");
  const prefChordSingleEl = document.getElementById("prefChordSingle");
  const prefChordBuildableEl = document.getElementById("prefChordBuildable");
  const prefGrabTabKeysEl = document.getElementById("prefGrabTabKeys");
  const prefFullscreenEnterEl = document.getElementById("prefFullscreenEnter");
  const prefMenuOffEscapeEl = document.getElementById("prefMenuOffEscape");
  const prefRecolourEl = document.getElementById("prefRecolour");
  const recolourPanelEl = document.getElementById("recolourPanel");
  const recolourSelfEl = document.getElementById("recolourSelf");
  const recolourAllyEl = document.getElementById("recolourAlly");
  const recolourEnemiesEl = document.getElementById("recolourEnemies");
  const recolourNoteEl = document.getElementById("recolourNote");
  const lightboxEl = document.getElementById("lightbox");
  const lightboxImgEl = document.getElementById("lightboxImg");
  const storedListEl = document.getElementById("storedList");
  const storedEvictedEl = document.getElementById("storedEvicted");
  const storedEmptyEl = document.getElementById("storedEmpty");
  const storedCountEl = document.getElementById("storedCount");
  const storedUsageEl = document.getElementById("storedUsage");
  const storedStatusEl = document.getElementById("storedStatus");
  const storedFilterEl = document.getElementById("storedFilter");
  const storedAllEl = document.getElementById("storedAll");
  const storedNoneEl = document.getElementById("storedNone");
  const storedDropRenderEl = document.getElementById("storedDropRender");
  const storedForgetEl = document.getElementById("storedForget");
  const logListEl = document.getElementById("logList");
  const logEmptyEl = document.getElementById("logEmpty");
  const logCountEl = document.getElementById("logCount");
  const logFilterEl = document.getElementById("logFilter");
  const logWarnOnlyEl = document.getElementById("logWarnOnly");
  const logCopyEl = document.getElementById("logCopy");
  const logClearEl = document.getElementById("logClear");
  const logStatusEl = document.getElementById("logStatus");
  const harvestGoEl = document.getElementById("harvestGo");
  const harvestStatusEl = document.getElementById("harvestStatus");
  const lightboxStageEl = document.getElementById("lightboxStage");
  const lightboxIconsEl = document.getElementById("lightboxIcons");
  const replayInputEl = document.getElementById("replayInput");
  const replayGoEl = document.getElementById("replayGo");
  const replayFileEl = document.getElementById("replayFile");
  const replayPlayerEl = document.getElementById("replayPlayer");
  const replayRealmEl = document.getElementById("replayRealm");
  const replayLadderEl = document.getElementById("replayLadder");
  const replayHistoryEl = document.getElementById("replayHistory");
  const replaySimEl = document.getElementById("replaySim");
  const replayExportEl = document.getElementById("replayExport");
  const replayPaceEl = document.getElementById("replayPace");
  const replayShowEl = document.getElementById("replayShow");
  // "Always run in a visible tab" is one setting shown in two places — the
  // re-run bar here and the build-chords group, beside the harvest that also
  // opens a tab. Hooks by class, because two copies of an id is one element as
  // far as getElementById is concerned.
  const visibleRunEls = [...document.querySelectorAll(".visiblerun")];
  const replayStatusEl = document.getElementById("replayStatus");
  const replayListEl = document.getElementById("replayList");
  const replayPanesEl = document.getElementById("replayPanes");
  const replayFoundEl = document.getElementById("replayFound");
  const replayRecentPlayersEl = document.getElementById("replayRecentPlayers");
  const replayRecentNamesEl = document.getElementById("replayRecentNames");
  const replayRecentReplaysEl = document.getElementById("replayRecentReplays");
  const replayRecentListEl = document.getElementById("replayRecentList");
  const replayReportEl = document.getElementById("replayReport");
  const replayEmptyEl = document.getElementById("replayEmpty");
  const backupHotkeysEl = document.getElementById("backupHotkeys");
  const backupGameOptsEl = document.getElementById("backupGameOpts");
  const backupBindingsEl = document.getElementById("backupBindings");
  const backupNotesEl = document.getElementById("backupNotes");
  const backupReadEl = document.getElementById("backupRead");
  const backupSaveEl = document.getElementById("backupSave");
  const backupCopyEl = document.getElementById("backupCopy");
  const backupStatusEl = document.getElementById("backupStatus");
  const backupSummaryEl = document.getElementById("backupSummary");
  const backupFileEl = document.getElementById("backupFile");
  const backupPasteLoadEl = document.getElementById("backupPasteLoad");
  const backupLoadedEl = document.getElementById("backupLoaded");
  const backupApplyEl = document.getElementById("backupApply");
  const backupUndoEl = document.getElementById("backupUndo");
  const backupLoadStatusEl = document.getElementById("backupLoadStatus");
  const backupTextEl = document.getElementById("backupText");

  // The ladders and realms come from src/ladder.js, which is the file that
  // knows what the API answers to. Without it the ladder tabs cannot be built
  // at all — there would be nothing to sample and nothing to name them after.
  const LADDERS = (window.__cdcLadder && window.__cdcLadder.LADDERS) || {};
  const REALMS = (window.__cdcLadder && window.__cdcLadder.REALMS) || {};
  // Which catalogue keys are file names, from the file that reads them out of a
  // replay — one answer for both halves of the page, or a `.mpr` map is a file
  // to one and a bare name to the other. Without ladder.js there are no ladder
  // tabs and therefore no cards, so the pattern that matches nothing is only
  // there to keep the page loading.
  const MAP_FILE = (window.__cdcLadder && window.__cdcLadder.MAP_FILE) || /(?!)/;

  // The game's own copy of this table is the one with the reasoning on it (see
  // DEFAULT_KEYS in src/companion.js). The short of it: `Alt`+letter is the only
  // space the client's own default table leaves genuinely empty, and the right
  // hand is the only hand available, because an open chord grid spends the
  // `qwert`/`asdfg`/`zxcvb` block — the left hand — under every modifier.
  // The bare digits this replaced were the client's team select.
  // scripts/check-options.mjs fails if the two copies drift.
  const DEFAULT_KEYS = {
    overlay: { code: "KeyO", keyCode: 79, alt: true, shift: false, ctrl: false, label: "Alt+O" },
    queues: { code: "KeyP", keyCode: 80, alt: true, shift: false, ctrl: false, label: "Alt+P" },
    taunts: { code: "KeyY", keyCode: 89, alt: true, shift: false, ctrl: false, label: "Alt+Y" },
    hqSwap: { code: "KeyI", keyCode: 73, alt: true, shift: false, ctrl: false, label: "Alt+I" },
    hqFull: { code: "KeyU", keyCode: 85, alt: true, shift: false, ctrl: false, label: "Alt+U" },
    menu: { code: "KeyM", keyCode: 77, alt: true, shift: false, ctrl: false, label: "Alt+M" },
    debug: { code: "KeyJ", keyCode: 74, alt: true, shift: false, ctrl: false, label: "Alt+J" },
    net: { code: "KeyN", keyCode: 78, alt: true, shift: false, ctrl: false, label: "Alt+N" },
    radar: { code: "KeyL", keyCode: 76, alt: true, shift: false, ctrl: false, label: "Alt+L" },
    memory: { code: "KeyK", keyCode: 75, alt: true, shift: false, ctrl: false, label: "Alt+K" },
    sidebar: { code: "KeyH", keyCode: 72, alt: true, shift: false, ctrl: false, label: "Alt+H" },
  };

  const KEY_LABELS = {
    overlay: "In-game overlay",
    menu: "The game's menu",
    debug: "Debug panel",
    hqSwap: "Swap the in-game preview",
    hqFull: "Render over the game",
    queues: "Production panel",
    taunts: "Taunts",
    net: "Net readout",
    memory: "Memory readout",
    sidebar: "Collapse the sidebar",
    radar: "In-game radar",
  };

  /**
   * What each key does, next to the key itself.
   *
   * They were one tooltip covering all four, which is the right shape for a
   * hint about the panel and the wrong one for four separate things: the only
   * sentence it could hold was the one true of every key, so what any given key
   * actually did was written down nowhere.
   */
  const KEY_NOTES = {
    radar:
      "Our own radar, drawn from our own map render, in a panel you can move " +
      "and resize. It opens over the game's own radar, shows what your shroud " +
      "reveals and nothing it does not, and is a toggle — the match carries on " +
      "underneath.",
    overlay:
      "The roster, the map's facts and its guide over the running match, with " +
      "the map preview on the radar. A toggle — the game carries on underneath.",
    menu:
      "Opens the game's own in-game menu — Options, Fullscreen, Abort Mission, " +
      "Resume Mission — which is what Escape used to do, one keypress from " +
      "quitting a match. With the setting below ticked this key opens it and " +
      "Escape does nothing; Escape then closes the menu, which the game itself " +
      "gives no key for at all. Pressing this key again also closes it.",
    debug:
      "What the extension hooked, what it captured for this match, and its last " +
      "few dozen lines of narration. The panel to open when something on screen " +
      "is wrong.",
    hqSwap:
      "Flips both in-game previews — the loading-screen panel and the overlay — " +
      "between our render and the map's own picture. It writes the setting " +
      "below, so the choice outlives the match; if this map's card was set to " +
      "Original or Ours, that setting is cleared, because otherwise it would " +
      "outrank the swap and the key would look broken.",
    hqFull:
      "The full-size render over the match, at 90% of the window and " +
      "semi-transparent so the game underneath stays readable. Click anywhere " +
      "or press Esc to close. It needs a full-size render in storage — the " +
      "thumbnail is not blown up to stand in for one.",
    queues:
      "Every production queue at once — structures, defence, infantry, " +
      "vehicles, ships and aircraft — with what is in each and how far the " +
      "first item has got. A queue with nothing in it says so, which the " +
      "sidebar cannot: it only ever draws the tab you are looking at. Drag it " +
      "anywhere; where you leave it is where it opens next time.",
    taunts:
      "The game's eight taunts as a grid under the cursor, on the same block of " +
      "keys as the build chords. A key sends one and closes the grid. Each tile " +
      "carries what the taunt says, under a strip naming the country you drew " +
      "and its flag: the eight lines are per country, so the same key means " +
      "something else in the next match. Each tile " +
      "also carries the key the *game* has on that taunt — as it ships, F5 to " +
      "F12, of which the browser keeps F11 and F12 for itself — and clicking " +
      "that key, or right-clicking the tile, binds a new one in the game's own " +
      "keyboard file, so it works with nothing of ours open. Taunts are sent to " +
      "other players only, on a five-second cooldown, and the sounds are the " +
      "ones your client imported: a tile whose file is missing is struck " +
      "through, because it is sent and heard by everyone except you. A line too " +
      "long for its tile is cut, and hovering the tile shows the rest without " +
      "the tile changing size. The settings page draws the same tiles, over a " +
      "row of countries so any country's eight can be read — and each of them " +
      "has a play button, which is the only way to hear one outside a match.",
    net:
      "Ping to the game server, how long your own orders take to come back, " +
      "frames per second, and the lockstep's turn length — the numbers behind " +
      "the game's own Ctrl+R panel, as text. Every player's ping is listed too, " +
      "with the age of the reading: the client only fetches those while its own " +
      "menu or the loading screen is up, and this panel does not ask for them " +
      "itself. While it is open the game pings the server every second instead " +
      "of every ten, which is exactly what the game does with its own panel up.",
    memory:
      "What this tab is holding: the page's own memory against the ceiling the " +
      "browser sets for it, and the graphics memory underneath — textures and " +
      "buffers, which is where a long match actually accumulates and which no " +
      "browser reports to a page. **It opens itself** when the page heap nears " +
      "its limit or the graphics context is lost, the second of which is the " +
      "blank screen some players see before the tab dies. It also keeps the " +
      "last quarter of an hour of readings across a crash, so a tab that is " +
      "killed can still say what it was holding — that report is " +
      "`__cdc.memTrace()` in the console. The graphics figures are an estimate " +
      "of what was uploaded, not a reading from the driver; their shape over a " +
      "match is what means something, not their exact value.",
    sidebar:
      "Hides the game's own right-hand sidebar — the cameos, the four tabs, " +
      "the radar, the credits and the repair, sell, diplomacy and options " +
      "buttons — and keeps the power bar, moved flush against the right edge " +
      "of the screen instead of floating where the sidebar used to start. The " +
      "game view widens into the strip that frees up, and the camera can pan " +
      "to the map edge that widening reveals. Everything the sidebar does has " +
      "a key of its own by now — the tabs, the cameos, the queues, the " +
      "cancels — except the power reading, which is why that is the part that " +
      "stays. The setting is remembered, so a match starts the way you left " +
      "it; the game's own in-game menu brings the sidebar back for as long as " +
      "it is open, because that menu is drawn inside it.",
  };

  /**
   * Which of these the game reads and which are this page's own.
   *
   * The first three travel through the bridge into a running game; the last two
   * are about the cards below and the viewer they open. They were one pair of
   * settings serving both, which is why a box in the ladder tab's list bar could
   * change what the overlay showed without saying so anywhere.
   */
  const DEFAULT_PREFS = {
    preferHqPreview: true, // in game: our render rather than the map's own
    autoRender: true, // in game: render a map the first time it is played
    fullIcons: true, // in game: tech-building pictograms on the full render
    captureSample: false, // the alignment panel's next run, set on its own tab
    sidebarKeys: true, // in game: the chord keys drawn on the sidebar itself
    chordSinglePress: false, // in game: one press of a tab key opens the grid
    chordOnlyBuildable: false, // in game: the grid draws only what can be ordered now
    grabTabKeys: true, // in game: the tab keys are ours while it is fullscreen
    fullscreenOnEnter: true, // in game: the client's Alt+F fullscreen moves to Alt+Enter
    menuOffEscape: true, // in game: the menu leaves Escape for a key of ours
    // in game: repaint players by role. Off by default — it changes what every
    // match looks like. A blank name is "keep what they picked", so the shape
    // below is also what "on, but nothing chosen yet" looks like.
    recolour: { on: false, self: "", ally: "", enemies: [] },
    cardPreferHq: true, // this page: our render on the cards
    viewerIcons: true, // this page: the pictograms in the viewer
  };

  // Which tab was last open. Page furniture, so it lives in localStorage rather
  // than in `prefs`: `prefs` is shared with a running game through the bridge,
  // and a tab switch here is not news for the game.
  const TAB_ITEM = "cdc.tab";

  // Which country's taunts the editor is reading. Page furniture like the tab
  // above and stored the same way: it changes nothing about the layout, which
  // is one layout for every country, and a running game reads its own country
  // off the match rather than off this.
  const TAUNT_COUNTRY_ITEM = "cdc.tauntCountry";

  let maps = {};
  let renders = {};
  let guides = {};
  // The last thing the cap threw away, as the bridge recorded it, until the
  // Stored maps tab has said so and it is dismissed.
  let evicted = null;
  let keys = {};
  // side -> [{ name, key }], the build hotkeys. Written here and read by the
  // game tab; the roster below is written by the game tab and read here.
  let builds = {};
  // side -> { section -> [object id per slot] }, the chord grids. Only the
  // sides that have been edited are in here; the rest play the layouts
  // src/build-chords.js ships, which is what makes a fresh install useful
  // without visiting this panel at all.
  let chords = {};
  // slot -> taunt number, the taunt overlay's layout overrides. Same shape and
  // same reasoning as `chords` above, with no side to key it by.
  let taunts = {};
  // [{ command, key }], keys of ours that fire commands of the client's.
  // Written here and read by the game tab, exactly as `builds` above — and the
  // list they are chosen from, `commands` below, comes back the other way for
  // the same reason the roster does.
  let commandKeys = [];
  // { version, at, items: ["CenterBase", …] } — which commands the client
  // actually registers, harvested in the game tab off its live KeyboardHandler.
  // Not the KeyCommandType enum: that lists names nothing registers, and a
  // binding on one of those could never fire. See sendCommands in
  // src/companion.js.
  let commands = {};
  // { version, at, items: [{ name, type, sides }] } — what the client says can
  // be built, harvested in the game tab because only it has the rules. Empty
  // until the game has been opened once with this extension installed.
  let roster = {};
  // { version, at, mp: [name, …], colors: { name: "#rrggbb" } } — written by
  // the game tab out of the client's own rules, read here. This page has no
  // client, so it is the only place the list can come from; see sendColours in
  // src/companion.js.
  let colours = {};
  // Which side's profile the panel is showing. Not stored: it is a view of the
  // page, not a setting, and it starts on the side that already has bindings.
  let buildSide = "";
  let prefs = { ...DEFAULT_PREFS };
  // What a render looks like. Its own storage item, not a corner of `prefs`:
  // a preference is a yes or a no about behaviour, and this is a table the
  // renderer reads. Keeping them apart is also what lets storage.onChanged tell
  // "repaint every picture" from "a checkbox moved".
  let appearance = {};
  // map key -> "ours" | "original", the cards that were told which preview to
  // show. A key that is not in here follows `prefs.preferHqPreview`, which is
  // what the *default* button on a card puts it back to. Its own item rather
  // than a field on `maps`, because `maps` is written by the game tab as it
  // parses maps and this is written here — one writer each, no lost updates.
  let previewSrc = {};
  // map key -> false, for the cards told not to mark the start positions their
  // map's own preview missed. Only the exceptions: the default is to mark them,
  // because an unmarked start position is what the client's numbers were for.
  let spawnFix = {};
  // sprite type -> { x, y }, saved from the alignment tab's offsets editor. What
  // the render draws with, over the defaults compiled into src/hq-preview.js —
  // so a re-measurement takes effect without a new build.
  let spriteFix = {};
  let spriteFixByName = {}; // the same, for a dial that names one object
  // ladder type -> the sampled pool for it: { realm, type, at, from, to,
  // players, matches, maps: [...], excluded: [title] }. Stored rather than
  // re-sampled on every page load — it is a few dozen requests against somebody
  // else's service. Keyed by ladder because the 1v1 and 2v2 pools are different
  // sets, and neither is evidence about the other.
  let pools = {};

  // --- dates ----------------------------------------------------------------

  // One shape for every date on the page: 2026-12-31, and 2026-12-31 14:05 when
  // the time matters. `toLocaleDateString` wrote 8/8/2026 here and 08.08.2026 on
  // the next machine — and 8/8 is the day the sample was taken, which is worth
  // reading rather than decoding.
  const pad = (n) => String(n).padStart(2, "0");

  function fmtDate(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }

  function fmtDateTime(ms) {
    const d = new Date(ms);
    return `${fmtDate(ms)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  // --- hotkeys --------------------------------------------------------------

  function keyName(code) {
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (/^Digit\d$/.test(code)) return code.slice(5);
    return code;
  }

  function describe(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    parts.push(keyName(e.code));
    return {
      code: e.code,
      keyCode: e.keyCode,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      label: parts.join("+"),
    };
  }

  /**
   * The buttons a binding may use, and what to call them. The game tab keeps
   * the same table (`MOUSE_NAMES` in src/companion.js) and the same rule: left
   * and right are never offered, because left is how you click anything and
   * right is the game's own order.
   */
  const MOUSE_NAMES = { 3: "Back", 4: "Forward" };

  function mouseName(button) {
    return MOUSE_NAMES[button] || "Button " + button;
  }

  /**
   * A mouse press as a descriptor, shaped exactly like a key's.
   *
   * `code` is `Mouse<n>` so `bindingId` needs no mouse form — the page and the
   * game tab go on comparing bindings the one way they already agree on. There
   * is no `keyCode`: the client's own hotkey table hashes that field, and a
   * mouse press can never be in that table, which is precisely why a mouse
   * binding has to reach a client command through `executeCommand` instead.
   */
  function describeMouse(e) {
    const parts = [];
    if (e.ctrlKey) parts.push("Ctrl");
    if (e.altKey) parts.push("Alt");
    if (e.shiftKey) parts.push("Shift");
    parts.push(mouseName(e.button));
    return {
      code: "Mouse" + e.button,
      button: e.button,
      ctrl: e.ctrlKey,
      alt: e.altKey,
      shift: e.shiftKey,
      label: parts.join("+"),
    };
  }

  /** Whether a descriptor is a mouse binding rather than a key. */
  function isMouse(key) {
    return !!key && typeof key.code === "string" && key.code.startsWith("Mouse");
  }

  /**
   * What is wrong with a binding, as far as this page can tell without a game.
   *
   * Shift counts as a modifier here. It did not, which meant two of the four
   * shipped defaults of the day — the preview keys, then on Shift+B and
   * Shift+F — warned about themselves *wrongly*: the
   * client hashes Shift into its own key codes (MODIFIER_BITS in companion.js),
   * so Shift+B and plain B are not the same binding to it, and our handler matches on
   * the exact modifier state either way. The typing case, where Shift+letter is
   * how you write a capital into the game's chat box, is handled where it can
   * be handled — `isTyping` in companion.js — rather than by a warning.
   *
   * The live answer is the game's own table, which only the game can read.
   */
  /**
   * What is worth saying about a mouse binding, which is never what is worth
   * saying about a key.
   *
   * The key warnings are all about layers a mouse press does not pass through:
   * the client's own hotkey table (which hashes a `keyCode` a mouse has not),
   * the chord grid's letter block, the `Ctrl` that means "queue next" on a
   * build key. What a mouse binding contends with is the **browser**.
   */
  function mouseWarning(k) {
    if ((k.button === 3 || k.button === 4) && !k.ctrl && !k.alt && !k.shift) {
      // The one case the live probe never exercised — see the note in the
      // game tab's mousedown listener. Said here because this row is where
      // someone chooses it.
      return (
        "Back and Forward with no modifier are the browser's navigation. The extension prevents " +
        "it, and that is the one combination never confirmed against a live browser."
      );
    }
    return "";
  }

  function keyWarning(k) {
    if (isMouse(k)) return mouseWarning(k);
    // No shipped default is in here any more — that is what 0.101.0 bought, and it
    // is why the warning stayed. From 0.66.0 to 0.100.0 every default was a bare
    // digit and every row carried this mark on purpose; it now fires only on a
    // binding somebody chose. A bare key IS taken from the game, and whoever has
    // not rebound the game's own use of it should know before they play. Stated
    // as what happens rather than as a doubt — the extension wins this press.
    if (!k.ctrl && !k.alt && !k.shift) {
      return "No modifier — the extension takes this key first, and the game never sees it.";
    }
    if (k.alt && k.shift && !k.ctrl) {
      return "Alt+Shift is the Windows keyboard-layout switch; it may never reach the page.";
    }
    // The two ways a binding is shadowed by something of our *own*: the grid
    // takes its fifteen letters under every modifier, and Ctrl is the "queue
    // this next" modifier every build key carries — so binding a key *with*
    // Ctrl is binding away the next-order of the bare one. Worth saying here
    // because nothing about the key itself shows either.
    if (chordTables && chordTables.GRID_KEYS.includes(k.code)) {
      return "On the build grid's block — an open grid takes this key instead.";
    }
    if (k.ctrl) {
      return "Ctrl on a build key means “queue next”; binding it here takes that away.";
    }
    return "";
  }

  /**
   * A binding reduced to one comparable string — the same format
   * `bindingId` in src/companion.js writes, because the two halves compare the
   * same bindings and a second spelling of it is a second thing to get wrong.
   */
  function bindingId(key) {
    return `${key.code}|${key.alt ? 1 : 0}${key.ctrl ? 1 : 0}${key.shift ? 1 : 0}`;
  }

  function effectiveKey(name) {
    return keys[name] || DEFAULT_KEYS[name];
  }

  /**
   * Turn a button into "press a combination…" and hand the next real press to
   * `done` as a descriptor.
   *
   * Factored out of the fixed-key rows when the build list arrived: it is the
   * same interaction on a button that means something else, and two copies would
   * be two places for the modifier-only rule to drift. Escape is not special-
   * cased — a binding you did not want is changed by pressing the button again,
   * and swallowing one key to mean "cancel" would make it unbindable.
   */
  const MODIFIER_CODES = [
    "ControlLeft", "ControlRight", "AltLeft", "AltRight",
    "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight",
  ];

  function captureKey(button, done) {
    const was = button.textContent;
    button.textContent = "press a combination…";
    button.classList.add("listening");

    const stop = () => {
      window.removeEventListener("keydown", onKey, true);
      window.removeEventListener("mousedown", onMouse, true);
      window.removeEventListener("contextmenu", onContext, true);
      button.classList.remove("listening");
      button.textContent = was;
    };

    const onKey = (e) => {
      // Ignore a modifier pressed on its own — it is never the whole binding.
      if (MODIFIER_CODES.includes(e.code)) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      done(describe(e));
    };

    // A mouse press is a binding too, for the buttons a keyboard does not have.
    // Left and right are not offered and the reason is in this handler rather
    // than in prose: **left is the press that started this capture** — the user
    // clicked the button to get here — and right is the game's own order. A
    // capture that took either would bind the click that opened it.
    // Left, middle and right are never offered: left is the press that started
    // this capture, right is the game's own order, and middle is the browser's
    // autoscroll. Everything from 3 up binds.
    const onMouse = (e) => {
      if (e.button < 3) return;
      e.preventDefault();
      e.stopPropagation();
      stop();
      done(describeMouse(e));
    };

    // Only while listening: the middle and side buttons are bindable, and the
    // menu that back/forward can raise would land on top of the row being set.
    const onContext = (e) => {
      e.preventDefault();
    };

    window.addEventListener("keydown", onKey, true);
    window.addEventListener("mousedown", onMouse, true);
    window.addEventListener("contextmenu", onContext, true);
  }

  /**
   * One row per key: what it is, the binding, and a `?` carrying what it does
   * and what is wrong with the binding, if anything.
   *
   * Both used to be one tooltip for the whole section, which is why each
   * warning had to name the key it was about — a sentence standing in for the
   * fact that it belonged to a particular row. Per row they need neither the
   * naming nor a line of standing prose: the rows stay a table of bindings,
   * which is what you come here to change.
   */
  /**
   * Whether this build ships the debug panel, read off the manifest — the one
   * place the export's transform edits, so the answer cannot drift from the
   * build. The options page cannot ask window.__cdcHud: that lives in the game
   * tab's MAIN world, which is a different context.
   */
  function hasDebugPanel() {
    const cs = chrome.runtime.getManifest().content_scripts || [];
    return cs.some((entry) => (entry.js || []).includes("src/debug-hud.js"));
  }

  function renderKeys() {
    keysEl.textContent = "";

    Object.keys(DEFAULT_KEYS).forEach((name) => {
      // A key that opens nothing is not a binding to offer: the public build
      // drops src/debug-hud.js, and a row for it would be a control that reads
      // as broken rather than as absent.
      if (name === "debug" && !hasDebugPanel()) return;
      const k = effectiveKey(name);
      const row = document.createElement("div");
      row.className = "keyrow";

      const label = document.createElement("span");
      label.className = "keylabel";
      label.textContent = KEY_LABELS[name];

      const button = document.createElement("button");
      button.className = "keybtn";
      button.type = "button";
      button.textContent = k.label;

      const reset = document.createElement("button");
      reset.className = "keyreset";
      reset.type = "button";
      reset.title = `reset to ${DEFAULT_KEYS[name].label}`;
      reset.textContent = "⟲";

      // Same construction as the symbols in the markup — `tabindex`, because a
      // hint only a mouse can reach is a hint half the page cannot.
      const help = document.createElement("span");
      help.className = "help";
      help.tabIndex = 0;
      help.setAttribute("role", "note");
      help.textContent = "?";

      const tip = document.createElement("span");
      tip.className = "tip";
      tip.textContent = KEY_NOTES[name];

      // The warning goes in the same tooltip, under a rule, and the symbol
      // marks itself: folding it away is only safe if the row says it has one.
      const warning = keyWarning(k);
      help.classList.toggle("warn", !!warning);
      help.setAttribute(
        "aria-label",
        warning ? `About ${KEY_LABELS[name]} — this binding has a warning` : `About ${KEY_LABELS[name]}`
      );
      if (warning) {
        const warnEl = document.createElement("span");
        warnEl.className = "tipwarn";
        warnEl.textContent = warning;
        tip.append(warnEl);
      }
      help.append(tip);

      button.addEventListener("click", () => {
        captureKey(button, (key) => {
          keys[name] = key;
          chrome.storage.local.set({ keys }, renderKeys);
        });
      });

      reset.addEventListener("click", () => {
        delete keys[name];
        chrome.storage.local.set({ keys }, renderKeys);
      });

      row.append(label, button, reset, help);
      keysEl.append(row);
    });
  }

  // --- build hotkeys --------------------------------------------------------

  /**
   * The sides a profile can be written for, in the order the game lists them.
   *
   * Taken from the roster rather than hardcoded: the roster is the client's own
   * answer, and a client that adds a side would otherwise get a panel that
   * cannot bind for it. The order is fixed here because a set has none.
   */
  const SIDE_ORDER = ["Allied", "Soviet", "Yuri"];

  function rosterItems() {
    return (roster && Array.isArray(roster.items) && roster.items) || [];
  }

  function rosterSides() {
    const found = new Set();
    for (const item of rosterItems()) for (const side of item.sides || []) found.add(side);
    const ordered = SIDE_ORDER.filter((side) => found.has(side));
    // A side the order does not know still gets a tab rather than being dropped.
    return ordered.concat([...found].filter((side) => !SIDE_ORDER.includes(side)).sort());
  }

  /**
   * What an object is called, and what it costs, out of the harvested object
   * table this page already holds for the replay views. The roster the game tab
   * sends carries neither, on purpose: they are the same values out of the same
   * harvest, and sending them again would be a second copy to disagree with.
   */
  const TYPE_LABELS = {
    building: "Buildings",
    infantry: "Infantry",
    vehicle: "Vehicles",
    aircraft: "Aircraft",
  };

  let objectIndex = null;
  // The table `objectIndex` was built out of, kept so the cache cannot outlive
  // it. A harvest landing while this page is open replaces the global wholesale
  // — a different client's table, numbered its own way — and an index built from
  // the one before it then answers with the wrong name and the wrong cost for
  // every id, without failing. Keyed on the table's identity rather than cleared
  // by hand wherever the global is replaced, because that is the version of this
  // the next writer forgets.
  let objectIndexOf = null;

  function objectInfo(name) {
    // `null` rather than an empty object when there is no table: a fresh `{}`
    // per call is never identical to the last one, so the profile with no table
    // yet — the one this whole path exists for — would rebuild the index on
    // every name it drew.
    const types = window.__cdcReplayTypes || null;
    if (!objectIndex || objectIndexOf !== types) {
      objectIndex = new Map();
      objectIndexOf = types;
      for (const list of Object.keys(TYPE_LABELS)) {
        for (const row of (types && types[list]) || []) objectIndex.set(row[0], { label: row[1], cost: row[2] });
      }
    }
    return objectIndex.get(name) || { label: "", cost: 0 };
  }

  /** The name a human reads, falling back to the internal id when unnamed. */
  function objectLabel(name) {
    // A superweapon is not an object and so is in none of the rules lists. Its
    // name comes from the same table the grid ships, which is also the only
    // place that knows a `sw:` id is a name at all rather than a missing one.
    const superWeapon = chordTables && chordTables.chordSuperWeaponRow(name);
    return objectInfo(name).label || (superWeapon && superWeapon.label) || name;
  }

  /**
   * A harvested object table, installed on `window` under the globals the
   * deleted src/replay-types.js used to publish — the same move the harvested
   * sheet makes a few hundred lines down, and for the same reason: every reader
   * of the table (this file's own `objectInfo`, and src/replay.js's `objectFor`)
   * finds it on `window`, so the one place that has to know where it came from
   * is here.
   *
   * It is the only table there is. It was read out of the player's own client,
   * which is the client the replay was recorded by — a closer match than the
   * snapshot of a retail RA2 install this repo used to ship, and one this repo
   * has the right to hand out. Overwritten wholesale rather than merged, because
   * two tables are two numberings and an ordinal from one against the rows of
   * the other names the wrong object rather than failing.
   *
   * `host` is handed in rather than found, so the check can drive this against
   * something that is not the page — the same shape `recentStore` takes its
   * `localStorage` in.
   *
   * A write with no rows in it is refused: the bridge already ignores an empty
   * table, and blanking a table that is on screen is worse than keeping the one
   * that is there. Returns whether anything was installed, so the caller knows
   * whether it has anything to redraw.
   */
  function installReplayTypes(stored, host) {
    const types = stored && stored.types;
    if (!types || !(types.building || []).length) return false;
    host.__cdcReplayTypes = types;
    host.__cdcReplayRules = stored.general || null;
    return true;
  }

  function buildRows(side) {
    return (builds[side] || []).filter((row) => row && row.name && row.key);
  }

  function saveBuilds(after) {
    chrome.storage.local.set({ builds }, after || renderBuilds);
  }

  /**
   * The side tabs. Rendered even for one side, because the count is the client's
   * to decide and a panel that changes shape between installs is harder to
   * describe than one that does not.
   */
  function renderBuildSides() {
    buildSidesEl.textContent = "";
    const sides = rosterSides();
    if (!sides.includes(buildSide)) {
      // The side that already has bindings is the one you came back to change.
      buildSide = sides.find((side) => buildRows(side).length) || sides[0] || "";
    }
    for (const side of sides) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "buildside" + (side === buildSide ? " on" : "");
      button.setAttribute("aria-pressed", side === buildSide ? "true" : "false");
      const bound = buildRows(side).length;
      button.textContent = bound ? `${side} (${bound})` : side;
      button.addEventListener("click", () => {
        buildSide = side;
        renderBuilds();
      });
      buildSidesEl.append(button);
    }
  }

  /**
   * The objects this side can be given to build, grouped the way the roster
   * groups them, minus the ones already bound on this side.
   *
   * Already-bound objects are dropped from the list rather than shown disabled:
   * the list is long, and a second binding for the same object is a mistake in
   * every case — the row above is where you change the key.
   */
  function renderBuildPicker() {
    const taken = new Set(buildRows(buildSide).map((row) => row.name));
    buildPickEl.textContent = "";
    let offered = 0;
    for (const [type, label] of Object.entries(TYPE_LABELS)) {
      const group = document.createElement("optgroup");
      group.label = label;
      const items = rosterItems()
        .filter((item) => item.type === type && (item.sides || []).includes(buildSide))
        .filter((item) => !taken.has(item.name))
        .sort((a, b) => objectLabel(a.name).localeCompare(objectLabel(b.name)));
      for (const item of items) {
        const option = document.createElement("option");
        option.value = item.name;
        const cost = objectInfo(item.name).cost;
        option.textContent = cost ? `${objectLabel(item.name)} — $${cost}` : objectLabel(item.name);
        group.append(option);
        offered++;
      }
      if (items.length) buildPickEl.append(group);
    }
    buildPickEl.disabled = !offered;
    buildAddEl.disabled = !offered;
  }

  /**
   * One row per binding: the object's own cameo, its name, the key, and a way to
   * drop it. The same shape as the fixed hotkeys above it, so the two lists read
   * as one panel — the difference is that these rows can be removed, which the
   * four above cannot.
   */
  function renderBuildList() {
    buildListEl.textContent = "";
    const rows = buildRows(buildSide);
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "count";
      empty.textContent = rosterItems().length
        ? "No build keys for this side yet."
        : "No roster yet — play a match once with the extension installed and it is read from the client.";
      buildListEl.append(empty);
      return;
    }

    // Two objects on one key is a binding that silently does one of them: the
    // press is looked up by key, and the second match never happens. The panel
    // is the only place it can be seen, since in a match it looks like the other
    // binding simply not working.
    const seen = new Map();
    for (const row of rows) {
      const id = `${row.key.code}|${row.key.alt ? 1 : 0}${row.key.ctrl ? 1 : 0}${row.key.shift ? 1 : 0}`;
      seen.set(id, (seen.get(id) || 0) + 1);
    }

    for (const row of rows) {
      const el = document.createElement("div");
      el.className = "keyrow";

      const label = document.createElement("span");
      label.className = "keylabel buildlabel";
      const cameo =
        window.__cdcReplayView &&
        typeof window.__cdcReplayView.cameoFor === "function" &&
        window.__cdcReplayView.cameoFor({ name: row.name }, 0.5);
      if (cameo) label.append(cameo);
      const text = document.createElement("span");
      text.textContent = objectLabel(row.name);
      label.append(text);

      const button = document.createElement("button");
      button.className = "keybtn";
      button.type = "button";
      button.textContent = row.key.label;
      button.addEventListener("click", () => {
        captureKey(button, (key) => {
          row.key = key;
          saveBuilds();
        });
      });

      const remove = document.createElement("button");
      remove.className = "keyreset";
      remove.type = "button";
      remove.title = `unbind ${objectLabel(row.name)}`;
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        builds[buildSide] = buildRows(buildSide).filter((other) => other !== row);
        saveBuilds();
      });

      const id = `${row.key.code}|${row.key.alt ? 1 : 0}${row.key.ctrl ? 1 : 0}${row.key.shift ? 1 : 0}`;
      const duplicate = seen.get(id) > 1 ? `${row.key.label} is bound twice on this side — only one of them will fire.` : "";
      const warning = duplicate || keyWarning(row.key);
      if (warning) {
        const help = document.createElement("span");
        help.className = "help warn";
        help.tabIndex = 0;
        help.setAttribute("role", "note");
        help.setAttribute("aria-label", `About ${objectLabel(row.name)} — this binding has a warning`);
        help.textContent = "?";
        const tip = document.createElement("span");
        tip.className = "tip";
        const warnEl = document.createElement("span");
        warnEl.className = "tipwarn";
        warnEl.textContent = warning;
        tip.append(warnEl);
        help.append(tip);
        el.append(label, button, remove, help);
      } else {
        el.append(label, button, remove);
      }
      buildListEl.append(el);
    }
  }

  function renderBuilds() {
    if (!buildSidesEl) return;
    renderBuildSides();
    renderBuildList();
    renderBuildPicker();
  }

  if (buildAddEl) {
    buildAddEl.addEventListener("click", () => {
      const name = buildPickEl.value;
      if (!name) return;
      captureKey(buildAddEl, (key) => {
        builds[buildSide] = buildRows(buildSide).concat([{ name, key }]);
        saveBuilds();
      });
    });
  }

  // --- Game commands --------------------------------------------------------

  /**
   * The two command names whose own spelling would mislead.
   *
   * Both read out of the client (v0.83.3), where `initKeyboardCommands` wires
   * them: `Scoreboard` is `gameMenu.openDiplo()` — the alliance list, nothing
   * that looks like a score — and `Options` is `gameMenu.open()`. Every other
   * name says what it does once it is spaced out, so this table stays at two
   * rather than growing into a second copy of the client's string file.
   */
  const COMMAND_LABELS = {
    Scoreboard: "Alliance screen",
    Options: "The game's menu",
  };

  /** `CenterOnRadarEvent` -> "Center on radar event", `TeamSelect_1` -> "Team select 1". */
  function commandLabel(name) {
    if (COMMAND_LABELS[name]) return COMMAND_LABELS[name];
    return String(name)
      .replace(/_(\d+)$/, " $1")
      .replace(/([a-z0-9])([A-Z])/g, (all, before, after) => before + " " + after.toLowerCase());
  }

  /** What the client registers, as the game tab harvested it. */
  function commandItems() {
    return (commands && Array.isArray(commands.items) && commands.items) || [];
  }

  function commandRows() {
    return Array.isArray(commandKeys) ? commandKeys : [];
  }

  function saveCommandKeys(after) {
    chrome.storage.local.set({ commandKeys }, after || renderCommands);
  }

  /**
   * What is wrong with one of these bindings, if anything.
   *
   * Deliberately **not** `keyWarning`: its first line is "no modifier — the
   * extension takes this key first, and the game never sees it", which is the
   * one thing this list is *for*. The press is taken from the client and the
   * command runs anyway, so a bare key here costs nothing and earns no mark.
   *
   * What is worth saying is a key claimed twice inside the extension, since
   * only one claim can win, and which one is fixed by the order the game tab's
   * listener asks in: the panel hotkeys, then this list, then the build keys.
   */
  function commandWarning(key, twice) {
    if (twice) return `${key.label} is on two commands here — only the first will fire.`;
    if (isMouse(key)) return mouseWarning(key);
    for (const name of Object.keys(DEFAULT_KEYS)) {
      if (name === "debug" && !hasDebugPanel()) continue;
      if (bindingId(effectiveKey(name)) === bindingId(key)) {
        return `${KEY_LABELS[name]} is on this key and is asked first — the command would never fire.`;
      }
    }
    for (const [side, rows] of Object.entries(builds || {})) {
      for (const build of rows || []) {
        if (build && build.key && bindingId(build.key) === bindingId(key)) {
          return `A ${side} build key is on this key; the command is asked first, so that build order never fires.`;
        }
      }
    }
    if (chordTables && chordTables.GRID_KEYS.includes(key.code)) {
      return "On the build grid's block — an open grid takes this key instead.";
    }
    if (key.alt && key.shift && !key.ctrl) {
      return "Alt+Shift is the Windows keyboard-layout switch; it may never reach the page.";
    }
    return "";
  }

  function renderCommandPicker() {
    if (!commandPickEl) return;
    const items = commandItems();
    commandPickEl.textContent = "";
    if (!items.length) {
      const none = document.createElement("option");
      none.value = "";
      none.textContent = "no command list yet";
      commandPickEl.append(none);
      commandPickEl.disabled = true;
      commandAddEl.disabled = true;
      return;
    }
    for (const name of items) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = commandLabel(name);
      // The client's own spelling, for anyone who knows it from keyboard.ini.
      option.title = name;
      commandPickEl.append(option);
    }
    commandPickEl.disabled = false;
    commandAddEl.disabled = false;
  }

  /**
   * One row per binding: what it fires, the key, and a way to drop it — the
   * same shape as the build list, because it is the same kind of list.
   */
  function renderCommandList() {
    if (!commandListEl) return;
    commandListEl.textContent = "";
    const rows = commandRows();
    if (!rows.length) {
      const empty = document.createElement("p");
      empty.className = "count";
      empty.textContent = commandItems().length
        ? "No game commands on our keys yet."
        : "No command list yet — play a match once with the extension installed and it is read from the client.";
      commandListEl.append(empty);
      return;
    }

    const seen = new Map();
    for (const row of rows) {
      if (!row || !row.key) continue;
      const id = bindingId(row.key);
      seen.set(id, (seen.get(id) || 0) + 1);
    }

    const offered = commandItems();
    for (const row of rows) {
      if (!row || !row.key || !row.command) continue;
      const el = document.createElement("div");
      el.className = "keyrow";

      const label = document.createElement("span");
      label.className = "keylabel";
      label.textContent = commandLabel(row.command);
      label.title = row.command;

      const button = document.createElement("button");
      button.className = "keybtn";
      button.type = "button";
      button.textContent = row.key.label;
      button.addEventListener("click", () => {
        captureKey(button, (key) => {
          row.key = key;
          saveCommandKeys();
        });
      });

      const remove = document.createElement("button");
      remove.className = "keyreset";
      remove.type = "button";
      remove.title = `unbind ${commandLabel(row.command)}`;
      remove.textContent = "×";
      remove.addEventListener("click", () => {
        commandKeys = commandRows().filter((other) => other !== row);
        saveCommandKeys();
      });

      // A command this client does not register — an older client's name, or a
      // cheat with cheats off. Said here because in a match it looks like the
      // key simply not working; the game tab says the same at the press itself.
      const unknown =
        offered.length && !offered.includes(row.command)
          ? `${row.command} is not a command this client registers — the key will do nothing.`
          : "";
      const warning = unknown || commandWarning(row.key, seen.get(bindingId(row.key)) > 1);
      if (warning) {
        const help = document.createElement("span");
        help.className = "help warn";
        help.tabIndex = 0;
        help.setAttribute("role", "note");
        help.setAttribute("aria-label", `About ${commandLabel(row.command)} — this binding has a warning`);
        help.textContent = "?";
        const tip = document.createElement("span");
        tip.className = "tip";
        const warnEl = document.createElement("span");
        warnEl.className = "tipwarn";
        warnEl.textContent = warning;
        tip.append(warnEl);
        help.append(tip);
        el.append(label, button, remove, help);
      } else {
        el.append(label, button, remove);
      }
      commandListEl.append(el);
    }
  }

  function renderCommands() {
    renderCommandList();
    renderCommandPicker();
  }

  if (commandAddEl) {
    commandAddEl.addEventListener("click", () => {
      const command = commandPickEl.value;
      if (!command) return;
      captureKey(commandAddEl, (key) => {
        commandKeys = commandRows().concat([{ command, key }]);
        saveCommandKeys();
      });
    });
  }

  // --- Build chords ---------------------------------------------------------

  /**
   * Drop layouts stored in the old whole-side shape.
   *
   * Until 0.55.1 an edit to one key wrote the entire side back — every section,
   * every key — which froze that side against every later fix to the shipped
   * layouts, and there have been several. What is in storage is therefore a copy
   * of an old default plus one or two deliberate changes, and there is no way to
   * tell which is which: the version it was copied from was never recorded.
   *
   * So it goes, and it is said out loud rather than done quietly. Keeping it
   * would mean keeping the bugs that have since been fixed in it — a superweapon
   * on the structures grid, two keys for one aircraft, an Ore Purifier the
   * Soviets cannot build.
   */
  function migrateChords(stored) {
    // Without src/build-chords.js there is no shipped layout to compare an
    // override against. The feature is off entirely in that case and the page
    // already says so, so this half of the migration simply does not run.
    const shipped = (side, id) =>
      (chordTables ? (chordTables.DEFAULT_CHORDS[side] || {})[id] || [] : null);
    const out = {};
    let dropped = 0;
    let settled = 0;
    for (const [side, sections] of Object.entries(stored || {})) {
      const keep = {};
      for (const [id, value] of Object.entries(sections || {})) {
        if (Array.isArray(value)) {
          dropped++;
          continue;
        }
        // An override that now says what ships is not an override any more.
        // This is the rule `chordOverride` already applies on write — an edit
        // that agrees with the shipped layout leaves nothing behind — caught up
        // with a change to what *ships*: 0.56.0 adopted one player's Soviet
        // grids as the defaults and 0.57.0 their Allied ones, and without this
        // those sections would read as overridden forever while being identical
        // to what they override.
        const live = {};
        for (const [slot, on] of Object.entries(value || {})) {
          const row = shipped(side, id);
          const same =
            row && chordTables.chordSlotKey(on) === chordTables.chordSlotKey(row[Number(slot)] || null);
          if (same) settled++;
          else live[slot] = on;
        }
        if (Object.keys(live).length) keep[id] = live;
      }
      if (Object.keys(keep).length) out[side] = keep;
    }
    if (dropped || settled) chrome.storage.local.set({ chords: out });
    if (dropped) {
      console.info(
        `[cd-companion] ${dropped} chord layout(s) were stored in the pre-0.55.1 whole-side ` +
          "shape and have been dropped, so this install follows the current layouts. " +
          "Per-key changes made from now on are kept as overrides on top of them."
      );
    }
    if (settled) {
      console.info(
        `[cd-companion] ${settled} chord override(s) now match what ships and have been ` +
          "forgotten, so those keys follow the shipped layout again."
      );
    }
    return out;
  }


  /**
   * The grid editor: which side, which section, which slot.
   *
   * None of the three is stored. They are a view of the page rather than a
   * setting, the same call `buildSide` above makes, and the side starts on
   * whichever one the build profiles already use so the two panels agree about
   * who you play.
   */
  let chordSide = "";
  let chordSection = "structures";
  let chordSlot = -1;

  const chordTables = window.__cdcBuildChords;

  /** This side's grid for a section, at full length, defaults included. */
  function chordRows(side, sectionId) {
    if (!chordTables) return [];
    return chordTables.chordLayout(chords, side, sectionId);
  }

  /**
   * Put something on a key, and store the whole side.
   *
   * **If it is already on another key in this section, the two trade places** —
   * `chordPlace` in src/build-chords.js, which is where it can be tested.
   *
   * A side is materialised in full the first time any of its slots is touched —
   * every section, every key. It is the shipped layout until then, and half a
   * stored layout would be a grid whose untouched sections silently followed a
   * future release while the edited one did not.
   */
  function setChordSlot(side, sectionId, slot, value) {
    if (!chordTables) return;
    const next = { ...(chords[side] || {}) };
    // Only this section, and within it only the keys that differ from what
    // ships. Writing the whole side is what froze a layout against every later
    // fix; writing the whole section would freeze that section for the same
    // reason.
    const override = chordTables.chordOverride(chords, side, sectionId, slot, value);
    if (Object.keys(override).length) next[sectionId] = override;
    else delete next[sectionId];

    chords = { ...chords };
    if (Object.keys(next).length) chords[side] = next;
    else delete chords[side];
    chrome.storage.local.set({ chords }, renderChords);
  }

  /**
   * What a slot shows here: the picture, and the words under it.
   *
   * The options page has no match and therefore no country, so a slot that is a
   * real choice — the Cuban Terrorist against the Iraqi Desolator — cannot be
   * resolved the way the game tab resolves it, and is shown under the pair's own
   * name with both pictures. In a match the grid draws whichever one the player
   * actually builds.
   *
   * A slot whose two ids are **one object under two names** is not that, and is
   * not shown as one: it carries the object's own name and its own picture, and
   * the pair behind it never surfaces. `chordIsDeck` is the decision.
   */
  function chordSlotFace(value) {
    const ids = chordTables.chordSlotIds(value);
    if (!ids.length) return null;
    const deck = chordTables.chordIsDeck(value);
    const variant = deck ? chordTables.chordVariantOf(ids[0]) : null;
    return {
      ids,
      deck,
      label: (variant && variant.label) || objectLabel(ids[0]),
      // Every name in the deck, for the tooltip: the pictures say *that* it is a
      // choice, the words say what the choices are.
      names: ids.map(objectLabel).join(" · "),
    };
  }

  /**
   * The picture for a slot — one cameo, or a deck of them.
   *
   * A deck holds objects only one of which is ever yours: the Iraqi Desolator
   * and the Cuban Terrorist are the same key, and which one it is depends on the
   * country you pick in the lobby. This page has no match and so cannot know
   * which, and drawing only the first would state something false. A stack says
   * what is true — it is one of these — the way a hand of cards does, spread far
   * enough that both faces are readable rather than stacked into a stripe.
   */
  function chordSlotPicture(face) {
    const cameo = (name) =>
      window.__cdcReplayView &&
      typeof window.__cdcReplayView.cameoFor === "function" &&
      window.__cdcReplayView.cameoFor({ name }, 1);
    if (!face.deck) return cameo(face.ids[0]) || null;
    const deck = document.createElement("span");
    deck.className = "chorddeck";
    // Back to front, so the first — the one this page names the slot after —
    // ends up on top with the others spread behind it. `--of` is how many there
    // are, which is what the spread is divided between.
    const ids = face.ids.slice(0, 3);
    deck.style.setProperty("--of", String(ids.length));
    ids.reverse().forEach((name, i, list) => {
      const card = cameo(name);
      if (!card) return;
      card.style.setProperty("--n", String(list.length - 1 - i));
      deck.append(card);
    });
    return deck.childElementCount ? deck : null;
  }

  /** Put one section back to what ships, leaving the others as they are. */
  function resetChordSection(side, sectionId) {
    if (!chordTables) return;
    const next = { ...(chords[side] || {}) };
    delete next[sectionId];
    // A side with nothing left overridden goes back to having no entry at all,
    // so it follows the shipped layouts again rather than freezing today's.
    const remaining = Object.keys(next);
    if (remaining.length) chords = { ...chords, [side]: next };
    else {
      chords = { ...chords };
      delete chords[side];
    }
    chordSlot = -1;
    chrome.storage.local.set({ chords }, renderChords);
  }

  function renderChordSides() {
    if (!chordSidesEl) return;
    chordSidesEl.textContent = "";
    const sides = rosterSides();
    if (!sides.includes(chordSide)) chordSide = buildSide || sides[0] || "";
    for (const side of sides) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "buildside" + (side === chordSide ? " on" : "");
      button.setAttribute("aria-pressed", side === chordSide ? "true" : "false");
      const changed = chordTables.SECTIONS.filter(
        (section) => !chordTables.chordLayoutIsLegacy(chords, side, section.id) &&
          chords[side] && chords[side][section.id]
      ).length;
      button.textContent = changed ? `${side} (${changed} edited)` : side;
      button.addEventListener("click", () => {
        chordSide = side;
        chordSlot = -1;
        renderChords();
      });
      chordSidesEl.append(button);
    }
  }

  function renderChordTabs() {
    if (!chordTabsEl || !chordTables) return;
    chordTabsEl.textContent = "";
    for (const section of chordTables.SECTIONS) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "chordtab" + (section.id === chordSection ? " on" : "");
      button.setAttribute("aria-pressed", section.id === chordSection ? "true" : "false");
      // The prefix as it ships. The game tab reads the real one off the client's
      // own table, which this page cannot see — so it is named as a default
      // rather than asserted, and the lede says the chords follow a rebind.
      const prefix = chordTables.chordKeyLabel(chordTables.GRID_KEYS.indexOf(section.fallback));
      button.textContent = prefix ? `${section.label} (${prefix + prefix})` : section.label;
      button.addEventListener("click", () => {
        chordSection = section.id;
        chordSlot = -1;
        renderChords();
      });
      chordTabsEl.append(button);
    }
  }

  function renderChordGrid() {
    if (!chordGridEl || !chordTables) return;
    chordGridEl.textContent = "";
    chordGridEl.style.setProperty("--cols", String(chordTables.GRID_COLS));
    const rows = chordRows(chordSide, chordSection);
    rows.forEach((value, slot) => {
      const face = chordSlotFace(value);
      const cell = document.createElement("button");
      cell.type = "button";
      cell.className = "chordcell" + (slot === chordSlot ? " on" : "") + (face ? "" : " empty");
      cell.setAttribute("aria-pressed", slot === chordSlot ? "true" : "false");

      const key = document.createElement("i");
      key.className = "chordkey";
      key.textContent = chordTables.chordKeyLabel(slot);

      if (face) {
        const picture = chordSlotPicture(face);
        if (picture) cell.append(picture);
        const label = document.createElement("span");
        label.className = "chordname";
        label.textContent = face.label;
        cell.append(key, label);
        // The name is two lines at most and the long ones are cut, so the whole
        // of it is on the cell either way.
        cell.title = face.deck
          ? `One key, whichever of these your country builds: ${face.names}`
          : face.label;
        if (face.deck) cell.classList.add("isdeck");
        cell.setAttribute(
          "aria-label",
          `${chordTables.chordKeyLabel(slot)} — ${face.label}${
            face.deck ? ` (one of ${face.names})` : ""
          }. Choose a different object for this key.`
        );
      } else {
        cell.append(key);
        cell.setAttribute("aria-label", `${chordTables.chordKeyLabel(slot)} — empty. Put an object on this key.`);
      }

      cell.addEventListener("click", () => {
        chordSlot = slot;
        renderChords();
      });
      chordGridEl.append(cell);
    });
  }

  /**
   * What the selected key may be given.
   *
   * Everything the side owns, grouped as the roster groups it — not filtered to
   * the section, because which queue an object lands in is the client's call
   * (`getQueueTypeForObject`) and a defensive building sits in the Armory queue
   * while reading as a building. Putting a tank on a structures key is a
   * strange thing to do rather than a broken one: the key still queues it.
   */
  function renderChordPicker() {
    if (!chordPickEl) return;
    const rows = chordRows(chordSide, chordSection);
    const current = chordSlot >= 0 ? chordTables.chordSlotKey(rows[chordSlot]) : "";
    const chosen = chordSlot >= 0;

    chordPickEl.textContent = "";
    chordPickEl.disabled = !chosen;
    chordClearEl.disabled = !chosen || !current;
    chordSlotNameEl.textContent = chosen
      ? `Key ${chordTables.chordKeyLabel(chordSlot)}`
      : "Pick a key above to change what is on it.";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = chosen ? "— nothing on this key —" : "—";
    chordPickEl.append(blank);
    if (!chosen) return;

    // A pair is **one option, in the group its objects belong to** — never a
    // group of its own, and never its halves. A group of its own asked the
    // player to know why two keys are special before they could find the
    // Airforce Command in the buildings; the halves are worse than that, since
    // picking one makes a key dead for every country but the one. Offered where
    // this side's roster has both halves.
    const owned = new Set(rosterItems().filter((item) => (item.sides || []).includes(chordSide)).map((i) => i.name));
    // A superweapon is never in the roster — it is not something the client can
    // build — so a deck holding one is offered on the strength of its other
    // halves. The Grand Cannon is French and the American drop is American, so
    // that pair reaches the Allied grid and no other.
    const has = (id) =>
      owned.has(id) || (chordTables.chordIsSuperWeapon(id) && !!chordTables.chordSuperWeaponRow(id));
    const pairs = chordTables.VARIANTS.filter((variant) => variant.ids.every(has));
    const paired = new Set(pairs.flatMap((variant) => variant.ids));
    const typeOf = (id) => (rosterItems().find((item) => item.name === id) || {}).type;

    for (const [type, label] of Object.entries(TYPE_LABELS)) {
      const options = rosterItems()
        .filter((item) => item.type === type && (item.sides || []).includes(chordSide))
        .filter((item) => !paired.has(item.name))
        .map((item) => ({
          value: item.name,
          label: objectLabel(item.name),
          note: objectInfo(item.name).cost ? `$${objectInfo(item.name).cost}` : "",
        }))
        .concat(
          pairs
            .filter((variant) => typeOf(variant.ids[0]) === type)
            .map((variant) => {
              // One object under two names reads as the object: its own name,
              // its own price, and nothing about the pair. A real choice reads
              // as one, because the two halves are two different objects at two
              // different prices and no single number is true of both.
              const deck = chordTables.chordIsDeck(variant.ids);
              const cost = objectInfo(variant.ids[0]).cost;
              return {
                value: variant.ids.join("+"),
                label: deck ? variant.label : objectLabel(variant.ids[0]),
                note: deck ? "whichever yours builds" : cost ? `$${cost}` : "",
              };
            })
        )
        .sort((a, b) => a.label.localeCompare(b.label));

      const group = document.createElement("optgroup");
      group.label = label;
      for (const item of options) {
        const option = document.createElement("option");
        option.value = item.value;
        option.textContent = item.note ? `${item.label} — ${item.note}` : item.label;
        if (item.value === current) option.selected = true;
        group.append(option);
      }
      if (options.length) chordPickEl.append(group);
    }

    // Superweapons, in a group of their own because they belong to none of the
    // roster's: they are not objects. Only the two with a key of their own are
    // in the table — every other superweapon is activated from the key of the
    // building that grants it, and putting it on a second key would be two keys
    // for one press.
    const superWeapons = chordTables.SUPERWEAPONS.filter((row) => !paired.has(row.id));
    if (superWeapons.length) {
      const group = document.createElement("optgroup");
      group.label = "Superweapons";
      for (const row of superWeapons) {
        const option = document.createElement("option");
        option.value = row.id;
        // Named with the building it comes from, since that is what decides
        // whether you ever have it — one is captured, the other is America's.
        option.textContent = `${row.label} — from ${objectLabel(row.from)}`;
        if (row.id === current) option.selected = true;
        group.append(option);
      }
      chordPickEl.append(group);
    }

    // An object the roster has never heard of — a layout stored by a newer build,
    // or one whose object the client dropped — keeps its own option so that
    // opening the picker cannot silently rewrite the slot to something else.
    if (current && !chordPickEl.querySelector(`option[value="${current}"]`)) {
      const orphan = document.createElement("option");
      orphan.value = current;
      const face = chordSlotFace(rows[chordSlot]);
      orphan.textContent = `${face ? face.label : current} — not in this client's roster`;
      orphan.selected = true;
      chordPickEl.append(orphan);
    }
  }

  function renderChords() {
    if (!chordGridEl) return;
    if (!chordTables) {
      chordGridEl.textContent = "";
      const missing = document.createElement("p");
      missing.className = "count";
      missing.textContent = "build-chords.js did not load — the layouts cannot be shown.";
      chordGridEl.append(missing);
      return;
    }
    renderChordSides();
    renderChordTabs();
    renderChordGrid();
    renderChordPicker();
  }

  if (chordPickEl) {
    chordPickEl.addEventListener("change", () => {
      if (chordSlot < 0) return;
      // A pair travels through the <select> as one value, since an option holds
      // one string and the slot holds two ids.
      const ids = chordPickEl.value ? chordPickEl.value.split("+") : [];
      setChordSlot(chordSide, chordSection, chordSlot, ids.length > 1 ? ids : ids[0] || null);
    });
  }
  if (chordClearEl) {
    chordClearEl.addEventListener("click", () => {
      if (chordSlot < 0) return;
      setChordSlot(chordSide, chordSection, chordSlot, null);
    });
  }
  if (chordResetEl) {
    chordResetEl.addEventListener("click", () => {
      resetChordSection(chordSide, chordSection);
    });
  }

  // --- Taunts ---------------------------------------------------------------

  /**
   * Which taunt sits on which key of the overlay.
   *
   * The build chords' editor with one dimension removed: there is no side and
   * no section, because a taunt is the same taunt whatever country you drew and
   * there are eight of them in one block. Stored the same way — overrides by
   * slot index over what `src/build-chords.js` ships — so a layout nobody has
   * touched follows a corrected default, and the game tab reads it through the
   * same bridge push the chords travel on.
   *
   * The keys of the *game's* own taunt commands are not here and cannot be: the
   * client's hotkey table lives in its origin-private file system, which only
   * the game tab can reach. The overlay is where that binding is shown and
   * changed, which is also where a player is when they want it.
   */
  let tauntSlot = -1;
  // The country last read here, restored across reloads. A name this build no
  // longer knows is corrected by currentTauntCountry, not guarded here.
  let tauntCountry = (() => {
    try {
      return localStorage.getItem(TAUNT_COUNTRY_ITEM) || "";
    } catch (e) {
      console.warn("[taunts] could not read the remembered country", e);
      return "";
    }
  })();

  function tauntRows() {
    return chordTables ? chordTables.tauntLayout(taunts) : [];
  }

  function setTauntSlot(slot, value) {
    if (!chordTables) return;
    const next = chordTables.tauntOverride(taunts, slot, value);
    taunts = Object.keys(next).length ? next : {};
    chrome.storage.local.set({ taunts }, renderTaunts);
  }

  /**
   * Which country the editor is reading, kept inside the table's own list.
   *
   * A stored name that no longer exists — a hand-edited value, or a country a
   * later client drops — falls back to the first rather than drawing a grid of
   * empty tiles that look like a broken page.
   */
  function tauntCountries() {
    // The tables' own list, which is the countries that *have* taunt sounds —
    // not every country the client can draw. Offering one without sounds is
    // how the play button came to vanish with nothing said.
    return chordTables ? chordTables.tauntCountries() : [];
  }

  function currentTauntCountry() {
    const all = tauntCountries();
    if (!all.length) return "";
    if (!all.includes(tauntCountry)) tauntCountry = all[0];
    return tauntCountry;
  }

  /**
   * The country picker: a row of toggles over the grid, the same control the
   * build list's side tabs are, because it does the same thing — it changes
   * what the panel below is *about* without changing anything it edits.
   */
  function renderTauntCountries() {
    if (!tauntCountriesEl || !chordTables) return;
    tauntCountriesEl.textContent = "";
    const current = currentTauntCountry();
    for (const name of tauntCountries()) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tauntside" + (name === current ? " on" : "");
      button.setAttribute("aria-pressed", name === current ? "true" : "false");
      button.textContent = chordTables.countryLabel(name);
      button.addEventListener("click", () => {
        tauntCountry = name;
        // Page furniture, so localStorage: see TAUNT_COUNTRY_ITEM.
        try {
          localStorage.setItem(TAUNT_COUNTRY_ITEM, name);
        } catch (e) {
          // A browser with storage denied still gets a working picker; it just
          // forgets the choice on reload.
          console.warn("[taunts] could not remember the country", e);
        }
        renderTaunts();
      });
      tauntCountriesEl.append(button);
    }
  }

  // --- auditioning one ------------------------------------------------------

  /**
   * Play a taunt on this page.
   *
   * The sound is not ours and is not here: the files are the player's own RA2
   * import, they live in the client's **origin-private file system**, and that
   * is per origin — this page cannot open it at all. So the fetch is a round
   * trip through a game tab, on the `tauntWav` storage item, exactly as the
   * settings backup reads the client's `keyboard.ini`. `ensureGameTab` is what
   * gets one listening when nothing is.
   *
   * Answers are kept for the session: a data URL is the whole file, the file
   * cannot change under a running browser, and an audition is something you do
   * eight times in a row.
   */
  const tauntWavs = new Map(); // file -> data URL, or "" for one this install has not got
  const tauntWhy = new Map(); // and, for those, what the game tab said about it
  let tauntWanted = "";
  let tauntAudio = null;

  function tauntSay(text) {
    if (tauntNoteEl) tauntNoteEl.textContent = text;
  }

  function playTauntUrl(file, url) {
    if (tauntAudio) {
      tauntAudio.pause();
      tauntAudio = null;
    }
    tauntAudio = new Audio(url);
    tauntAudio.addEventListener("ended", () => renderTauntGrid());
    tauntAudio.play().then(
      () => tauntSay(`playing ${file}`),
      (e) => {
        // Autoplay policy, a codec the browser will not take, a truncated
        // import: all three land here and all three are worth naming.
        tauntSay(`could not play ${file} — ${(e && e.message) || e}`);
        tauntAudio = null;
        renderTauntGrid();
      }
    );
    renderTauntGrid();
  }

  function auditionTaunt(value) {
    if (!chordTables) return;
    const file = chordTables.tauntFileName(currentTauntCountry(), value);
    if (!file) {
      // Unreachable while the picker is bounded by the same table the file name
      // comes from, and left in because that is one table away from not being
      // true: a country with no sounds must say so, never draw nothing.
      tauntSay(
        `this client has no taunt sounds for ${chordTables.countryLabel(currentTauntCountry())} — ` +
          "Red Alert 2 has files for nine countries"
      );
      return;
    }
    if (tauntWavs.has(file)) {
      const url = tauntWavs.get(file);
      if (url) playTauntUrl(file, url);
      else tauntSay(tauntWhy.get(file) || `${file} is not in your client's Taunts folder — nothing to play`);
      return;
    }
    tauntWanted = file;
    tauntSay(`fetching ${file} — the game client has to finish loading its files first…`);
    chrome.storage.local.set({ tauntWav: { at: Date.now(), requested: file, done: false } });
    renderTauntGrid();
    ensureGameTab({
      say: tauntSay,
      started: () => !!(lastTauntWavJob && lastTauntWavJob.started),
      // There is no half-way here either: a tab has taken the job or it has not.
      progressing: () => !!(lastTauntWavJob && lastTauntWavJob.started),
      gaveUp: () => {
        tauntWanted = "";
        renderTauntGrid();
      },
    });
  }

  let lastTauntWavJob = null;

  function onTauntWavJob(job) {
    lastTauntWavJob = job || null;
    if (!job || !job.done) return;
    // This page emptying the item, arriving back through `storage.onChanged`
    // like any other write. Without the flag it re-enters as an answer with no
    // payload and overwrites the cached data URL with "" — which draws the
    // tile's play button as a file this install has not got, the moment the
    // sound finishes. Reported as "the cross stays up after it plays".
    if (job.cleared) return;
    const file = job.file || "";
    if (!job.ok) {
      tauntSay(`could not read ${file} — ${job.error || "the game tab gave no reason"}`);
      tauntWanted = "";
      renderTauntGrid();
      return;
    }
    // A miss is remembered as a miss: an install without the folder will not
    // grow one while the page is open, and asking again on every click would
    // open a game tab every time.
    tauntWavs.set(file, job.missing ? "" : job.wav || "");
    if (job.missing) tauntWhy.set(file, `nothing to play — ${job.why || "the game tab did not say why"}`);
    // The bytes are the largest thing this extension puts in storage; once they
    // are in this page they have no business staying on disk. `cleared` is what
    // stops this write coming back around as an answer — see the top.
    if (job.wav) chrome.storage.local.set({ tauntWav: { ...job, wav: "", cleared: true } });
    const wanted = tauntWanted === file;
    tauntWanted = "";
    if (job.missing) {
      // The reason, not just the absence: an install that never imported the
      // folder and a client that had not finished starting look identical from
      // here, and they want opposite things done about them.
      tauntSay(
        `nothing to play — ${job.why || "the game tab did not say why"}. ` +
          "The taunt is still sent in a match; you are the only one who hears nothing."
      );
      renderTauntGrid();
      return;
    }
    if (wanted) playTauntUrl(file, tauntWavs.get(file));
    else renderTauntGrid();
  }

  function renderTauntGrid() {
    if (!tauntGridEl || !chordTables) return;
    tauntGridEl.textContent = "";
    tauntGridEl.style.setProperty("--cols", String(chordTables.GRID_COLS));
    const country = currentTauntCountry();
    const clipped = [];
    tauntRows().forEach((value, slot) => {
      // A `<div role="button">` and not a `<button>`, because this one *holds*
      // a button: the play control inside it is a real control with its own
      // press, and a button inside a button is not markup any parser will keep.
      // Everything a button gave — the look, the pointer, the pressed state,
      // Enter and Space — is here explicitly; the build grid's cells have no
      // control in them and stay `<button>`.
      const cell = document.createElement("div");
      cell.setAttribute("role", "button");
      cell.tabIndex = 0;
      cell.className = "chordcell" + (slot === tauntSlot ? " on" : "") + (value ? "" : " empty");
      cell.setAttribute("aria-pressed", slot === tauntSlot ? "true" : "false");

      // The rail: the key you press, big and lit, with the taunt's own number
      // beside it and the play control under them. All three were corner badges
      // or nothing at all until 1.15.0, and the badges cost the cell an empty
      // band across its whole top to clear them. In a column of their own they
      // cost the width they occupy and nothing else.
      const rail = document.createElement("i");
      rail.className = "chordrail";

      const key = document.createElement("i");
      key.className = "chordkey";
      key.textContent = chordTables.chordKeyLabel(slot);
      rail.append(key);

      const role = value ? chordTables.tauntRole(value) : "";
      const line = value ? chordTables.tauntLine(country, value) : "";
      const file = value ? chordTables.tauntFileName(country, value) : "";
      if (value) {
        // A taunt is "Taunt 6" in the client's key table and in every message
        // this extension writes about one. The number is what joins this cell
        // to those; the words are what a person is actually choosing between.
        const num = document.createElement("i");
        num.className = "chordnum";
        num.textContent = String(value);
        rail.append(num);
      }

      // Hearing it. The sound is the player's own imported file and this page
      // cannot reach it — see auditionTaunt — so this button is also the only
      // thing that ever learns whether the file is there at all, which is why
      // it says so rather than just going quiet.
      if (value) {
        const heard = file && tauntWavs.has(file) ? tauntWavs.get(file) : null;
        const waiting = tauntWanted === file;
        const playing = !!tauntAudio && !tauntAudio.paused && tauntAudio.src === heard;
        const play = document.createElement("button");
        play.type = "button";
        play.className = "chordplay" + (!file || heard === "" ? " missing" : "") + (playing ? " playing" : "");
        play.dataset.taunt = String(value);
        play.textContent = waiting ? "\u2026" : !file || heard === "" ? "\u2715" : playing ? "\u25a0" : "\u25b6";
        play.disabled = waiting;
        play.title = !file
          ? `this client has no taunt sounds for ${chordTables.countryLabel(country)}`
          : heard === ""
            ? `${file} is not in your client's Taunts folder — the taunt is still sent, you just hear nothing`
            : `Play ${file}`;
        play.setAttribute("aria-label", `Play taunt ${value} for ${chordTables.countryLabel(country)}`);
        // The cell underneath picks this key for editing; a press here is about
        // the sound and nothing else.
        play.addEventListener("click", (e) => {
          e.stopPropagation();
          auditionTaunt(value);
        });
        rail.append(play);
      }
      cell.append(rail);

      // The words, inside a box that holds their space. The box is on every
      // cell, empty ones included — it is what gives a cell its height, and a
      // cell without one would be shorter than its neighbours, which is the
      // complaint the 1.14.0 round started from. It is also what the hover
      // reveal positions against, so the reveal needs no measurement of where
      // the words happen to start.
      const words = document.createElement("span");
      words.className = "chordwords";
      const label = document.createElement("span");
      label.className = "chordname" + (value && !line ? " chordrole" : "");
      label.textContent = value ? line || role : "";
      words.append(label);
      cell.append(words);
      if (value && line) clipped.push(label);

      const named = value ? `Taunt ${value}${role ? " — " + role : ""}` : "empty";
      if (value) cell.title = named + (line ? `\n"${line}"` : "");
      cell.setAttribute(
        "aria-label",
        `${chordTables.chordKeyLabel(slot)} — ${named}${line ? ". " + line : ""}. ` +
          "Choose which taunt this key sends."
      );

      const pick = () => {
        tauntSlot = slot;
        renderTaunts();
      };
      cell.addEventListener("click", pick);
      // What `<button>` did for free. Space is prevented as well as handled:
      // on a focused non-button it scrolls the page.
      cell.addEventListener("keydown", (e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        e.preventDefault();
        pick();
      });
      tauntGridEl.append(cell);
    });
    // Which lines the three-line clamp cut, and therefore which cells have
    // something left to show on hover. Measured once here, after every cell is
    // in the document — a read per cell during the build would force a layout
    // fifteen times.
    for (const label of clipped) {
      label.classList.toggle("clipped", label.scrollHeight > label.clientHeight + 1);
    }
  }

  function renderTauntPicker() {
    if (!tauntPickEl || !chordTables) return;
    const rows = tauntRows();
    const current = tauntSlot >= 0 ? rows[tauntSlot] : null;
    const chosen = tauntSlot >= 0;

    tauntPickEl.textContent = "";
    tauntPickEl.disabled = !chosen;
    tauntClearEl.disabled = !chosen || !current;
    tauntSlotNameEl.textContent = chosen
      ? `Key ${chordTables.chordKeyLabel(tauntSlot)}`
      : "Pick a key above to change which taunt is on it.";

    const blank = document.createElement("option");
    blank.value = "";
    blank.textContent = chosen ? "— nothing on this key —" : "—";
    tauntPickEl.append(blank);
    if (!chosen) return;

    for (let n = 1; n <= chordTables.TAUNT_COUNT; n++) {
      const option = document.createElement("option");
      option.value = String(n);
      // The key a taunt is already on, named in its own row: eight taunts over
      // fifteen keys is a layout you rearrange rather than fill, and picking
      // one that is elsewhere **swaps** the two keys (`chordPlace`). Saying
      // where it is now is what makes that a move rather than a surprise.
      const at = rows.indexOf(n);
      const where = at >= 0 && at !== tauntSlot ? ` (now on ${chordTables.chordKeyLabel(at)})` : "";
      const role = chordTables.tauntRole(n);
      option.textContent = `Taunt ${n}${role ? " — " + role : ""}${where}`;
      option.selected = current === n;
      tauntPickEl.append(option);
    }
  }

  function renderTaunts() {
    if (!tauntGridEl) return;
    if (!chordTables) {
      tauntGridEl.textContent = "";
      const missing = document.createElement("p");
      missing.className = "count";
      missing.textContent = "build-chords.js did not load — the taunt layout cannot be shown.";
      tauntGridEl.append(missing);
      return;
    }
    renderTauntCountries();
    renderTauntGrid();
    renderTauntPicker();
  }

  if (tauntPickEl) {
    tauntPickEl.addEventListener("change", () => {
      if (tauntSlot < 0) return;
      setTauntSlot(tauntSlot, Number(tauntPickEl.value) || null);
    });
  }
  if (tauntClearEl) {
    tauntClearEl.addEventListener("click", () => {
      if (tauntSlot < 0) return;
      setTauntSlot(tauntSlot, null);
    });
  }
  if (tauntResetEl) {
    tauntResetEl.addEventListener("click", () => {
      taunts = {};
      tauntSlot = -1;
      chrome.storage.local.set({ taunts }, renderTaunts);
    });
  }

  // --- tabs -----------------------------------------------------------------

  // ladder type -> its panel. Built from LADDERS, so the tab strip, the panels
  // and the sampler cannot disagree about which ladders exist.
  const ladders = {};
  let activeTab = "";

  function panelOf(id) {
    return document.querySelector(`.tabpanel[data-tab="${CSS.escape(id)}"]`);
  }

  function buildTabs() {
    tabsEl.textContent = "";
    document.querySelectorAll(".tabpanel").forEach((panel) => {
      const id = panel.dataset.tab;
      const button = document.createElement("button");
      button.type = "button";
      button.className = "tab";
      button.dataset.tab = id;
      button.setAttribute("role", "tab");
      button.textContent = panel.dataset.label || (LADDERS[id] && LADDERS[id].label) || id;
      button.addEventListener("click", () => showTab(id));
      tabsEl.append(button);
    });
  }

  /**
   * Show one tab.
   *
   * Only the tab on screen builds its card list. A card carries its preview as a
   * data URL, so two catalogues of them is megabytes held for a panel nobody is
   * looking at — and the lists are rebuilt on every storage change anyway.
   */
  function showTab(id) {
    if (!panelOf(id)) {
      const first = document.querySelector(".tabpanel");
      id = first && first.dataset.tab;
    }
    if (!id) return;
    activeTab = id;
    localStorage.setItem(TAB_ITEM, id);
    document.querySelectorAll(".tabpanel").forEach((panel) => {
      panel.hidden = panel.dataset.tab !== id;
    });
    tabsEl.querySelectorAll(".tab").forEach((button) => {
      const on = button.dataset.tab === id;
      button.classList.toggle("active", on);
      button.setAttribute("aria-selected", on ? "true" : "false");
    });
    // The list of the panel we left goes with it; the one we arrived at is built
    // now. `renderNotes` is what carries a running render's message across.
    Object.values(ladders).forEach((p) => {
      if (p.type !== id) p.mapsEl.textContent = "";
    });
    if (ladders[id]) renderCards(ladders[id]);
    if (id === "stored") refreshStored();
    if (id === "log") renderLog();
    alignPanel.onTab(id);
  }

  // --- a ladder panel -------------------------------------------------------

  /**
   * One ladder's panel: its pool, and the guides of the maps it plays.
   *
   * Cloned from the template rather than written out per ladder — the two
   * ladders differ in which pool they sample and nothing else, and a second copy
   * of the markup is a second copy to keep in step. Everything inside is reached
   * by class, because two clones of an id are not two elements to the DOM.
   */
  function buildPanel(type) {
    const el = document.createElement("section");
    el.className = "tabpanel";
    el.dataset.tab = type;
    el.dataset.label = LADDERS[type].label;
    el.setAttribute("role", "tabpanel");
    el.hidden = true;
    el.append(ladderTplEl.content.cloneNode(true));

    const q = (cls) => el.querySelector("." + cls);
    const panel = {
      type,
      el,
      boxEl: q("poolbox"),
      realmEl: q("poolRealm"),
      findEl: q("poolFind"),
      renderEl: q("poolRender"),
      allEl: q("poolAll"),
      noneEl: q("poolNone"),
      clearEl: q("poolClear"),
      statusEl: q("poolStatus"),
      infoEl: q("poolInfo"),
      listEl: q("poollist"),
      poolEmptyEl: q("poolEmpty"),
      filterEl: q("filter"),
      countEl: q("mapCount"),
      useOriginalEl: q("useOriginal"),
      fullIconsEl: q("fullIcons"),
      clearRendersEl: q("clearRenders"),
      usageEl: q("usage"),
      mapsEl: q("maps"),
      mapsEmptyEl: q("mapsEmpty"),
    };

    for (const key of Object.keys(REALMS)) {
      const option = document.createElement("option");
      option.value = key;
      option.textContent = REALMS[key].label;
      panel.realmEl.append(option);
    }

    panel.findEl.addEventListener("click", () => findPool(panel));
    panel.filterEl.addEventListener("input", () => renderCards(panel));

    panel.renderEl.addEventListener("click", () => {
      const wanted = poolSelection(panel);
      if (!wanted.length) {
        poolStatus(panel, "nothing ticked");
        return;
      }
      if (runInFlight()) {
        poolStatus(panel, "a render run is already going");
        return;
      }
      panel.renderEl.disabled = true;
      renderNotes = {};
      renderCards(panel);
      poolStatus(panel, "queued…");
      // The harvest rides along rather than needing a run of its own: it is a
      // tenth of a second, it skips itself when the client has not changed, and
      // a pool run is already paying for the game tab it needs.
      askForRun(wanted, { from: type, harvest: true });
    });

    panel.allEl.addEventListener("click", () => {
      const pool = pools[type];
      if (pool) savePool(type, { ...pool, excluded: [] });
    });

    panel.noneEl.addEventListener("click", () => {
      const pool = pools[type];
      if (pool) savePool(type, { ...pool, excluded: pool.maps.map((m) => m.title) });
    });

    panel.clearEl.addEventListener("click", () => {
      if (!pools[type]) return;
      if (!confirm(`Delete the sampled ${LADDERS[type].label} pool and its ticks? Renders, guides and the map list stay.`)) {
        return;
      }
      const next = { ...pools };
      delete next[type];
      pools = next;
      chrome.storage.local.set({ pools }, () => {
        poolStatus(panel, "");
        renderPool(panel);
        renderCards(panel);
      });
    });

    // Both boxes are this page's own. The box asks for the map's own preview
    // and the preference stored behind it is "prefer ours" — inverted here
    // rather than stored inverted, because the game's copy of the same question
    // is stored the same way round and one convention for the pair is worth
    // more than a box whose name matches its field.
    panel.useOriginalEl.addEventListener("change", () => {
      setPrefs({ cardPreferHq: !panel.useOriginalEl.checked });
    });

    panel.fullIconsEl.addEventListener("change", () => {
      setPrefs({ viewerIcons: panel.fullIconsEl.checked });
      // Instant: the picture underneath does not change, only whether the badges
      // are painted on top of it.
      paintLightboxIcons();
    });

    panel.clearRendersEl.addEventListener("click", clearRenders);

    return panel;
  }

  /**
   * A page-wide preference, changed from whichever panel is on screen.
   *
   * Both ladder panels carry the same two boxes, so the other copy is put back
   * in step here rather than being left to disagree until the page is reloaded.
   * Stored, not kept in the page: a running game reads the same preference
   * through the bridge.
   */
  function setPrefs(patch) {
    prefs = { ...prefs, ...patch };
    syncPrefsUi();
    chrome.storage.local.set({ prefs }, render);
  }

  function syncPrefsUi() {
    Object.values(ladders).forEach((p) => {
      p.useOriginalEl.checked = !prefs.cardPreferHq;
      p.fullIconsEl.checked = prefs.viewerIcons !== false;
    });
    // The in-game three. `preferHqPreview` is also written from the game, by the
    // swap hotkey, and arrives here through storage.onChanged — so this is what
    // keeps the box in step with a key pressed mid-match.
    prefOriginalEl.checked = !prefs.preferHqPreview;
    prefFullIconsEl.checked = prefs.fullIcons !== false;
    prefAutoRenderEl.checked = prefs.autoRender !== false;
    prefSidebarKeysEl.checked = prefs.sidebarKeys !== false;
    prefChordSingleEl.checked = !!prefs.chordSinglePress;
    prefChordBuildableEl.checked = !!prefs.chordOnlyBuildable;
    prefGrabTabKeysEl.checked = prefs.grabTabKeys !== false;
    prefFullscreenEnterEl.checked = prefs.fullscreenOnEnter !== false;
    prefMenuOffEscapeEl.checked = prefs.menuOffEscape !== false;
    renderRecolour();
    alignPanel.onPrefs();
  }

  prefOriginalEl.addEventListener("change", () => {
    setPrefs({ preferHqPreview: !prefOriginalEl.checked });
  });

  prefFullIconsEl.addEventListener("change", () => {
    setPrefs({ fullIcons: prefFullIconsEl.checked });
  });

  prefAutoRenderEl.addEventListener("change", () => {
    setPrefs({ autoRender: prefAutoRenderEl.checked });
  });

  // Takes effect in a running match: the game tab starts or stops the loop
  // that draws them when this arrives.
  prefSidebarKeysEl.addEventListener("change", () => {
    setPrefs({ sidebarKeys: prefSidebarKeysEl.checked });
  });

  prefChordSingleEl.addEventListener("change", () => {
    setPrefs({ chordSinglePress: prefChordSingleEl.checked });
  });

  // Reaches a grid that is already open: the game tab decides what a tile shows
  // on every paint, not once when the grid was drawn.
  prefChordBuildableEl.addEventListener("change", () => {
    setPrefs({ chordOnlyBuildable: prefChordBuildableEl.checked });
  });

  // The game tab takes or gives back the browser's keyboard lock when this
  // arrives, so an untick reaches a match already in play.
  prefGrabTabKeysEl.addEventListener("change", () => {
    setPrefs({ grabTabKeys: prefGrabTabKeysEl.checked });
  });

  // Takes effect on the next press either way — nothing is held open across it.
  prefFullscreenEnterEl.addEventListener("change", () => {
    setPrefs({ fullscreenOnEnter: prefFullscreenEnterEl.checked });
  });

  // Same: the next Escape is decided when it is pressed, against the setting as
  // it is then. Unticked, both halves go — Escape opens the menu again and stops
  // closing it — which is what "as the game shipped" has to mean for a setting
  // to be worth having; Resume Mission is the game's own way back out.
  prefMenuOffEscapeEl.addEventListener("change", () => {
    setPrefs({ menuOffEscape: prefMenuOffEscapeEl.checked });
  });


  // --- player colours -------------------------------------------------------

  /**
   * How many opponents a row is offered for.
   *
   * Eight slots is the client's own maximum for a match, so seven is every
   * opponent you can have at once. Rows are cheap and a fixed count needs no
   * "how many players will there be" question that this page could not answer
   * anyway — the match it is setting up has not been made yet.
   */
  const MAX_ENEMIES = 7;

  /** The preference, with every field the shape the rest of this section reads. */
  function recolourPrefs() {
    const raw = prefs.recolour || {};
    return {
      on: raw.on === true,
      self: typeof raw.self === "string" ? raw.self : "",
      ally: typeof raw.ally === "string" ? raw.ally : "",
      enemies: Array.isArray(raw.enemies)
        ? raw.enemies.slice(0, MAX_ENEMIES).map((name) => (typeof name === "string" ? name : ""))
        : [],
    };
  }

  /** Write one field of it back, leaving the others as they are. */
  function setRecolour(patch) {
    setPrefs({ recolour: { ...recolourPrefs(), ...patch } });
  }

  /** name -> "#rrggbb", as the game tab harvested it. */
  function colourTable() {
    return (colours && colours.colors) || {};
  }

  /**
   * Fill one picker with the colours this client has.
   *
   * Two groups, because the eight a lobby offers are the ones a player will
   * recognise by name and the rest are everything else the rules define — the
   * civilian greys, the special houses. Both are legal: what the renderer
   * refuses is a colour that is in no group at all, which is why this page
   * never offers a hex of its own.
   *
   * The option carries its own colour as text, which is as far as a `<select>`
   * can be styled portably; the swatch beside the row is what actually shows
   * the chosen one.
   */
  function fillColourPicker(select, chosen) {
    const table = colourTable();
    const mp = (colours.mp || []).filter((name) => table[name]);
    const rest = Object.keys(table).filter((name) => !mp.includes(name));
    select.textContent = "";

    const keep = document.createElement("option");
    keep.value = "";
    keep.textContent = "as picked";
    select.appendChild(keep);

    const group = (label, names) => {
      if (!names.length) return;
      const box = document.createElement("optgroup");
      box.label = label;
      for (const name of names) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        option.style.color = table[name];
        box.appendChild(option);
      }
      select.appendChild(box);
    };
    group("In the lobby", mp);
    group("Also in the rules", rest);

    // A stored name this client does not have — an older client's colour, or a
    // profile carried to a build that renamed one. Shown as itself rather than
    // dropped silently to "as picked", because the row is the only place the
    // disagreement is visible; the game tab skips it and says so in its log.
    if (chosen && !table[chosen]) {
      const missing = document.createElement("option");
      missing.value = chosen;
      missing.textContent = chosen + " — not in this client";
      select.appendChild(missing);
    }
    select.value = chosen || "";
  }

  /** Paint the little square that says what the row resolves to. */
  function paintSwatch(el, name) {
    const hex = colourTable()[name] || "";
    el.style.background = hex;
    el.dataset.empty = hex ? "" : "yes";
    el.title = hex ? `${name} ${hex}` : "as picked";
  }

  /**
   * Build the enemy rows once, then keep them in step.
   *
   * One row per opponent in the lobby's own slot order. The **counter does not
   * skip a blank row**: leaving the first as picked and setting the second
   * still paints the *second* opponent, rather than promoting everyone by one —
   * so a row means the same opponent whatever the rows above it say. The game
   * tab's `recolourPlan` is the half that guarantees it; this is the half that
   * has to describe it.
   */
  // --- Map rendering ---
  //
  // The dials that decide what a render looks like. Two families with two very
  // different prices, and the panel is built to make the price visible: the
  // colours and the global pair are filters over a finished picture and cost
  // nothing, while the per-type pairs are baked and only reach a stored map
  // when that map is rendered again.
  //
  // The shape, the defaults and the clamps all live in src/render-tune.js, the
  // one copy this page, the renderer, the radar and the in-game panel share.
  // Nothing here invents a value.

  const tuneEls = {
    ore: document.getElementById("tuneOre"),
    gems: document.getElementById("tuneGems"),
    oreAlpha: document.getElementById("tuneOreAlpha"),
    shroudDim: document.getElementById("tuneShroudDim"),
    unitSize: document.getElementById("tuneUnitSize"),
    unitBrightness: document.getElementById("tuneUnitBrightness"),
    allBrightness: document.getElementById("tuneAllBrightness"),
    allContrast: document.getElementById("tuneAllContrast"),
    types: document.getElementById("tuneTypes"),
    stale: document.getElementById("tuneStale"),
    reset: document.getElementById("tuneReset"),
  };

  /** The table in force, normalised — never the raw stored object. */
  const look = () => (window.__cdcTune ? window.__cdcTune.normalise(appearance) : null);

  function setAppearance(patch) {
    appearance = { ...look(), ...patch };
    renderTunePanel();
    applyGlobalFilter();
    chrome.storage.local.set({ appearance });
  }

  /** One type's pair, merged rather than replaced, so the other dial survives. */
  function setTypeDial(type, patch) {
    const current = look();
    setAppearance({ types: { ...current.types, [type]: { ...current.types[type], ...patch } } });
  }

  /**
   * The global pair, as a filter over the pictures this page shows.
   *
   * A custom property on the root rather than a style per image: the cards are
   * rebuilt on every filter keystroke and the viewer is built on demand, so
   * anything set per element would have to be re-set in both places.
   */
  function applyGlobalFilter() {
    if (!window.__cdcTune) return;
    document.documentElement.style.setProperty("--cdc-render-filter", window.__cdcTune.globalFilter(appearance));
  }

  /**
   * The per-type rows, built once and then held.
   *
   * References rather than a re-query on every sync: these rows are made here,
   * so looking them up by class afterwards would be asking the document for
   * something this function already has -- and it would put a class name in a
   * querySelector that the markup does not carry, which is exactly what
   * scripts/check-options.mjs exists to catch.
   */
  let tuneRows = null;

  function buildTuneRows(tune) {
    tuneRows = tune.TUNE_TYPES.map((entry) => {
      const row = document.createElement("div");
      row.className = "setrow tune-type-row";
      const label = document.createElement("span");
      label.className = "tune-type-label";
      label.textContent = entry.label;
      row.append(label);

      const dials = {};
      for (const dial of ["brightness", "contrast"]) {
        const input = document.createElement("input");
        input.type = "range";
        input.className = "tune-dial";
        input.min = tune.LIMITS[dial][0];
        input.max = tune.LIMITS[dial][1];
        input.step = "0.05";
        input.title = entry.label + " " + dial;
        const out = document.createElement("output");
        out.className = "tune-out";
        input.addEventListener("input", () => setTypeDial(entry.key, { [dial]: Number(input.value) }));
        row.append(input, out);
        dials[dial] = { input, out };
      }
      tuneEls.types.append(row);
      return { key: entry.key, dials };
    });
  }

  function renderTunePanel() {
    const tune = window.__cdcTune;
    // The table is a separate script. If it did not load, the dials have no
    // defaults to fall back on and a half-drawn panel would write values the
    // renderer never agreed to, so the whole section stands down.
    if (!tune || !tuneEls.types) return;
    const current = tune.normalise(appearance);

    // Built from TUNE_TYPES rather than written out in the markup, for the
    // reason the recolour rows are: the list has to be the render's own or a
    // dial can name a pass that does not exist.
    if (!tuneRows) buildTuneRows(tune);

    tuneEls.ore.value = current.ore;
    tuneEls.gems.value = current.gems;
    setDial(tuneEls.oreAlpha, "tuneOreAlphaOut", current.oreAlpha);
    setDial(tuneEls.shroudDim, "tuneShroudDimOut", current.shroudDim);
    setDial(tuneEls.unitSize, "tuneUnitSizeOut", current.units.size);
    setDial(tuneEls.unitBrightness, "tuneUnitBrightnessOut", current.units.brightness);
    setDial(tuneEls.allBrightness, "tuneAllBrightnessOut", current.all.brightness);
    setDial(tuneEls.allContrast, "tuneAllContrastOut", current.all.contrast);

    for (const row of tuneRows) {
      const pair = current.types[row.key];
      for (const dial of ["brightness", "contrast"]) {
        row.dials[dial].input.value = pair[dial];
        row.dials[dial].out.textContent = fmtDial(pair[dial]);
      }
    }

    // Honest about the price rather than silent about it. The per-type dials are
    // baked, so a map already stored keeps the look it was drawn with until it
    // is rendered again — there is no way to apply them to a finished PNG.
    tuneEls.stale.textContent =
      tune.tuneKey(appearance) === ""
        ? ""
        : "Stored renders keep the look they were drawn with. A map picks these up when it is next rendered.";
  }

  /** A dial reads better as 1.00 than as 0.9500000000000001. */
  const fmtDial = (v) => v.toFixed(2);

  function setDial(input, outId, value) {
    if (!input) return;
    input.value = value;
    const out = document.getElementById(outId);
    if (out) out.textContent = fmtDial(value);
  }

  if (tuneEls.ore) {
    // `input` rather than `change` on the colour wells and sliders: this is a
    // panel you drag while looking at the result, and `change` on a range only
    // fires when the mouse comes up.
    tuneEls.ore.addEventListener("input", () => setAppearance({ ore: tuneEls.ore.value }));
    tuneEls.gems.addEventListener("input", () => setAppearance({ gems: tuneEls.gems.value }));
    tuneEls.oreAlpha.addEventListener("input", () => setAppearance({ oreAlpha: Number(tuneEls.oreAlpha.value) }));
    tuneEls.shroudDim.addEventListener("input", () => setAppearance({ shroudDim: Number(tuneEls.shroudDim.value) }));
    // `change` rather than `input`: a checkbox has no drag to follow, and the
    // two fire together on it anyway.
    // Merged rather than replaced, the way the global pair beside it is: the two
    // dials share one object and writing one alone would drop the other.
    tuneEls.unitSize.addEventListener("input", () =>
      setAppearance({ units: { ...look().units, size: Number(tuneEls.unitSize.value) } })
    );
    tuneEls.unitBrightness.addEventListener("input", () =>
      setAppearance({ units: { ...look().units, brightness: Number(tuneEls.unitBrightness.value) } })
    );
    tuneEls.allBrightness.addEventListener("input", () =>
      setAppearance({ all: { ...look().all, brightness: Number(tuneEls.allBrightness.value) } })
    );
    tuneEls.allContrast.addEventListener("input", () =>
      setAppearance({ all: { ...look().all, contrast: Number(tuneEls.allContrast.value) } })
    );
    tuneEls.reset.addEventListener("click", () => {
      appearance = {};
      renderTunePanel();
      applyGlobalFilter();
      chrome.storage.local.set({ appearance });
    });
  }

  function renderRecolour() {
    const current = recolourPrefs();
    prefRecolourEl.checked = current.on;
    recolourPanelEl.hidden = !current.on;
    if (!current.on) return;

    const names = Object.keys(colourTable());
    recolourNoteEl.textContent = names.length
      ? `${names.length} colours, read from client ${colours.version || "(unversioned)"}.`
      : "No colour table yet — play a match once with the extension installed and it is read from the client.";

    if (!recolourEnemiesEl.children.length) {
      for (let i = 0; i < MAX_ENEMIES; i++) {
        const row = document.createElement("div");
        row.className = "recolour-row";
        const label = document.createElement("span");
        label.className = "recolour-label";
        label.textContent = i === 0 ? "Enemies" : "";
        const swatch = document.createElement("span");
        swatch.className = "recolour-swatch";
        const pick = document.createElement("select");
        pick.className = "recolour-pick";
        pick.dataset.enemy = String(i);
        pick.setAttribute("aria-label", `Colour for opponent ${i + 1}`);
        pick.addEventListener("change", () => {
          const enemies = recolourPrefs().enemies.slice();
          while (enemies.length <= i) enemies.push("");
          enemies[i] = pick.value;
          // Trailing blanks carry no meaning and would grow the item every time
          // a row was cleared; the plan reads a missing slot as "as picked".
          while (enemies.length && !enemies[enemies.length - 1]) enemies.pop();
          setRecolour({ enemies });
        });
        const ordinal = document.createElement("span");
        ordinal.className = "recolour-ordinal";
        ordinal.textContent = "#" + (i + 1);
        row.append(label, ordinal, swatch, pick);
        recolourEnemiesEl.appendChild(row);
      }
    }

    fillColourPicker(recolourSelfEl, current.self);
    fillColourPicker(recolourAllyEl, current.ally);
    paintSwatch(recolourPanelEl.querySelector('.recolour-swatch[data-for="self"]'), current.self);
    paintSwatch(recolourPanelEl.querySelector('.recolour-swatch[data-for="ally"]'), current.ally);
    for (const pick of recolourEnemiesEl.querySelectorAll(".recolour-pick")) {
      const i = Number(pick.dataset.enemy);
      const name = current.enemies[i] || "";
      fillColourPicker(pick, name);
      paintSwatch(pick.previousElementSibling, name);
    }
  }

  prefRecolourEl.addEventListener("change", () => {
    setRecolour({ on: prefRecolourEl.checked });
  });

  // Both take effect on the next match. A match already running keeps the
  // colours it started with rather than repainting under the player: the
  // radar takes a tile's colour when the tile is dirtied, so a mid-match
  // change is half a repaint until every unit has moved.
  recolourSelfEl.addEventListener("change", () => setRecolour({ self: recolourSelfEl.value }));
  recolourAllyEl.addEventListener("change", () => setRecolour({ ally: recolourAllyEl.value }));

  function clearRenders() {
    const count = Object.keys(renders).length;
    if (!count) return;
    if (!confirm(`Delete ${count} stored render${count === 1 ? "" : "s"}? Guides and the map list stay.`)) {
      return;
    }
    // The index and the heavy items it points at, together — dropping one and
    // keeping the other is how storage fills up with things nothing can reach.
    const heavy = Object.keys(renders).map((k) => "full:" + k);
    chrome.storage.local.remove(heavy, () => {
      chrome.storage.local.set({ renders: {} }, () => {
        renders = {};
        render();
      });
    });
  }

  // --- maps -----------------------------------------------------------------

  function factsLine(facts) {
    if (!facts) return "";
    return [
      facts.players ? `${facts.players} starts` : "",
      facts.width && facts.height ? `${facts.width}×${facts.height}` : "",
      facts.theater || "",
    ]
      .filter(Boolean)
      .join(" · ");
  }

  function guideOf(key) {
    const stored = guides[key];
    // Guides used to be a list of one-liners; show those as lines of text.
    if (Array.isArray(stored)) return stored.join("\n");
    return typeof stored === "string" ? stored : "";
  }

  function saveGuide(key, textarea, savedEl) {
    const text = textarea.value.trim();
    if (text) guides[key] = text;
    else delete guides[key];

    chrome.storage.local.set({ guides }, () => {
      if (chrome.runtime.lastError) {
        savedEl.textContent = "save failed: " + chrome.runtime.lastError.message;
        savedEl.classList.add("show");
        return;
      }
      savedEl.textContent = text ? `saved ${text.length} characters` : "cleared";
      savedEl.classList.add("show");
      setTimeout(() => savedEl.classList.remove("show"), 1600);
    });
  }

  /**
   * The map file a catalogue card stands for, lower-cased for comparison.
   *
   * The catalogue is keyed by file name for every map the client reported one
   * for; a card keyed by a name out of the map itself has none, and matches by
   * title instead.
   */
  function fileOf(key, entry) {
    const file = (entry.facts && entry.facts.file) || (MAP_FILE.test(key) ? key : "");
    return file.toLowerCase();
  }

  /**
   * Which pool entry a catalogue card is — the question a ladder tab's list is
   * an answer to.
   *
   * By file first, because **a title does not identify a map**: this client
   * holds `tn04mw.map` and `tn04t2.map`, both "Official Tournament Map B (2)",
   * and the ladder plays the second. A pool entry whose replay would not answer
   * has no file and can only be matched by title; so can a card the client
   * reported no file for. What is refused is the case where both sides know a
   * file and the files differ — that is the map the ladder does not play.
   */
  function poolIndex(pool) {
    const byFile = new Map();
    const byTitle = new Map();
    for (const entry of (pool && pool.maps) || []) {
      if (entry.file) byFile.set(entry.file.toLowerCase(), entry);
      byTitle.set(entry.title, entry);
    }
    return (key, entry) => {
      const file = fileOf(key, entry);
      if (file && byFile.has(file)) return byFile.get(file);
      const found = byTitle.get(entry.name || "");
      if (!found) return null;
      return found.file && file ? null : found;
    };
  }

  /**
   * Which picture a card shows, and what a click on it opens. Our render only
   * exists for maps that have been played or rendered since the feature landed —
   * this page cannot make one, having no game client — so the map's own preview
   * stays the fallback rather than an error.
   *
   * The map's own setting outranks the page-wide default. Both are only ever a
   * preference for our render: a map with no render of its own has nothing to
   * prefer, and one whose file carries no `[PreviewPack]` has no original.
   */
  function previewFor(key, entry) {
    const own = renders[key];
    // The click always opens our render when there is one, whatever the card is
    // showing: enlarging a 2px-per-cell bitmap answers nothing.
    if (showingOurs(key, entry)) {
      return { src: own.thumb, rendered: true, fullOf: key };
    }
    const original = originalThumb(key, entry);
    if (original) {
      return { src: original, rendered: false, fullOf: own && own.thumb ? key : null };
    }
    return null;
  }

  /** Whether the card is showing our render rather than the map's own picture. */
  function showingOurs(key, entry) {
    const own = renders[key];
    if (!own || !own.thumb) return false;
    const chosen = previewSrc[key];
    // The card's own setting, then this page's default — not the game's. A map
    // told to show one picture is told that everywhere; which picture the rest
    // of the list falls back to is a question about this list.
    const wantOurs = chosen ? chosen === "ours" : !!prefs.cardPreferHq;
    return wantOurs || !entry.thumb;
  }

  /**
   * The map's own picture: the one with the start positions it left unmarked
   * marked, unless this card says otherwise. Only maps that missed some have the
   * second copy, and for the rest there is nothing to choose between.
   */
  function originalThumb(key, entry) {
    if (entry.thumbFixed && spawnFix[key] !== false) return entry.thumbFixed;
    return entry.thumb || "";
  }

  /**
   * The full-size render lives in its own storage item and is megabytes, so it
   * is fetched on the click rather than held by every card on the page.
   */
  function openLightbox(preview) {
    lightboxEl.hidden = false;
    lightboxView.reset();
    // Badges belong to the full-size render alone. The card's own thumb carries
    // its pictograms baked in, and the client's preview never had any.
    lightboxIcons = null;
    paintLightboxIcons();
    if (!preview.fullOf) {
      lightboxImgEl.src = preview.src;
      return;
    }
    lightboxImgEl.src = preview.src; // something to look at while the big one loads
    const item = "full:" + preview.fullOf;
    chrome.storage.local.get(item, (data) => {
      if (lightboxEl.hidden) return; // closed again before it arrived
      if (data && data[item]) {
        lightboxImgEl.src = data[item];
        lightboxIcons = (renders[preview.fullOf] || {}).icons || [];
        // The image is being swapped for a much bigger one; its box is what the
        // badges are placed against, so wait for it.
        lightboxImgEl.addEventListener("load", paintLightboxIcons, { once: true });
      }
    });
  }

  function closeLightbox() {
    lightboxEl.hidden = true;
    // Drop the data URL: these are megabytes, and one stays referenced for as
    // long as the page is open otherwise.
    lightboxImgEl.removeAttribute("src");
    lightboxIcons = null;
  }

  // What the open lightbox should be marking, if anything.
  let lightboxIcons = null;

  /**
   * The full render's tech-building badges, over the image in the lightbox.
   *
   * The render stopped carrying them baked in at RENDERER_VERSION 7 — it stores
   * where they go, as fractions of the picture — which is what makes the
   * checkbox instant instead of a re-render. The canvas is a sibling inside the
   * transformed stage, so pan and zoom carry the badges along without any of
   * this having to know the current scale.
   */
  function paintLightboxIcons() {
    const icons = prefs.viewerIcons === false ? [] : lightboxIcons || [];
    const w = lightboxImgEl.clientWidth;
    const h = lightboxImgEl.clientHeight;
    lightboxIconsEl.hidden = !icons.length;
    if (!icons.length || !w || !h) return;
    const dpr = window.devicePixelRatio || 1;
    lightboxIconsEl.style.width = w + "px";
    lightboxIconsEl.style.height = h + "px";
    lightboxIconsEl.width = Math.round(w * dpr);
    lightboxIconsEl.height = Math.round(h * dpr);
    const ctx = lightboxIconsEl.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    icons.forEach((icon) => {
      window.__cdcGlyphs.drawGlyph(ctx, icon.glyph, icon.x * w, icon.y * h, icon.size * w, icon.color);
    });
  }

  // --- zoom and pan ---------------------------------------------------------

  // A render is 3000px wide and the point of opening it is to read single
  // cells, so the fitted view is only the starting point. The range is relative
  // to whatever counts as fitted for that surface: the lightbox lets CSS fit the
  // image, the alignment stage works it out from the sample's own size.
  const ZOOM = { max: 12, step: 1.2 };

  /**
   * Drag to pan, wheel to zoom about the cursor, double-click back to fit.
   *
   * @param {Element} frameEl   what the wheel is caught on
   * @param {Element} targetEl  what gets transformed
   * @param {function} [options.fit]     scale that counts as fitted (default 1)
   * @param {function} [options.onClick] a click that was not a drag, at fit size
   * @param {function} [options.draw]    paints the view instead of transforming
   *                                     targetEl; called with the view, at most
   *                                     once a frame
   */
  function makeViewer(frameEl, targetEl, options = {}) {
    const view = { scale: 1, x: 0, y: 0, min: 1 };

    // Set when the surface repaints itself instead of being transformed. The
    // alignment stage hands one in: ten full-size layers cost far more to
    // rescale than to redraw at the size they are actually shown at.
    let painting = 0;

    function apply() {
      if (options.draw) {
        // One paint per frame however many pointer events arrive between two.
        // A mouse delivers several hundred a second and only the last of them
        // is ever on screen.
        if (!painting) {
          painting = requestAnimationFrame(() => {
            painting = 0;
            options.draw(view);
          });
        }
        return;
      }
      targetEl.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
      targetEl.classList.toggle("zoomed", view.scale > view.min);
    }

    function reset() {
      view.min = (options.fit && options.fit()) || 1;
      view.scale = view.min;
      view.x = 0;
      view.y = 0;
      apply();
    }

    /**
     * Zoom about a point on screen: whatever cell is under the cursor stays
     * under it. The target's current centre already carries the translation, so
     * the correction is the cursor's offset from that centre scaled by how much
     * the zoom changed — no need to track the untransformed layout box.
     */
    function zoomAt(clientX, clientY, factor) {
      const next = Math.min(view.min * ZOOM.max, Math.max(view.min, view.scale * factor));
      if (next === view.scale) return;
      // Where the picture's centre is on screen. A transformed element carries
      // the pan inside its own box, so its centre is the picture's; a repainted
      // surface never moves, so the pan has to be added back.
      const rect = targetEl.getBoundingClientRect();
      const centreX = rect.left + rect.width / 2 + (options.draw ? view.x : 0);
      const centreY = rect.top + rect.height / 2 + (options.draw ? view.y : 0);
      const ratio = 1 - next / view.scale;
      view.x += (clientX - centreX) * ratio;
      view.y += (clientY - centreY) * ratio;
      view.scale = next;
      if (view.scale === view.min) {
        // Back at fit size there is nowhere to pan to, and a stale offset would
        // leave the image sitting off-centre for no reason.
        view.x = 0;
        view.y = 0;
      }
      apply();
    }

    frameEl.addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
        zoomAt(e.clientX, e.clientY, e.deltaY < 0 ? ZOOM.step : 1 / ZOOM.step);
      },
      { passive: false }
    );

    targetEl.addEventListener("dblclick", (e) => {
      e.stopPropagation();
      reset();
    });

    let drag = null;

    targetEl.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      drag = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: 0, ox: view.x, oy: view.y };
      targetEl.setPointerCapture(e.pointerId);
    });

    targetEl.addEventListener("pointermove", (e) => {
      if (!drag || drag.id !== e.pointerId) return;
      const dx = e.clientX - drag.x;
      const dy = e.clientY - drag.y;
      drag.moved = Math.max(drag.moved, Math.abs(dx) + Math.abs(dy));
      view.x = drag.ox + dx;
      view.y = drag.oy + dy;
      apply();
    });

    function endDrag(e) {
      if (!drag || drag.id !== e.pointerId) return;
      const dragged = drag.moved > 4;
      drag = null;
      // A click that was not a drag still means what it meant before panning
      // existed — but only at fit size, where there is nothing to lose.
      if (!dragged && view.scale === view.min && options.onClick) options.onClick();
    }

    targetEl.addEventListener("pointerup", endDrag);
    targetEl.addEventListener("pointercancel", endDrag);

    // `view` goes out with it: a caller that resizes the frame needs to know
    // whether the picture is still sitting at fit before it re-fits one the user
    // has zoomed into.
    return { reset, view, repaint: apply };
  }

  const lightboxView = makeViewer(lightboxEl, lightboxStageEl, { onClick: closeLightbox });

  /**
   * The card's own answer to "which preview", as three buttons: our render, the
   * map's own, and the page-wide default. A checkbox could not say the last one.
   *
   * *Render* is dead until there is one to show. It stays highlighted if it was
   * chosen and the render has since been cleared — that is still the answer this
   * card will give the moment one exists, and rewriting somebody's choice
   * because the picture behind it went missing would be worse than saying so.
   */
  function previewChoice(key, entry) {
    const seg = document.createElement("div");
    seg.className = "seg";
    seg.title =
      "Which preview this map shows, here and in game. Default follows the " +
      "checkbox in the bar above.";

    const chosen = previewSrc[key] || "";
    const rendered = !!(renders[key] && renders[key].thumb);
    [
      ["ours", "Render"],
      ["original", "Original"],
      ["", "Default"],
    ].forEach(([value, text]) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = value === chosen ? "segbtn selected" : "segbtn";
      button.textContent = text;
      if (value === "ours" && !rendered) {
        button.disabled = true;
        button.title = "No render for this map yet — the Render button below makes one.";
      }
      button.addEventListener("click", () => {
        if (value) previewSrc[key] = value;
        else delete previewSrc[key];
        // Stored rather than kept on the page: the game reads the same item
        // through the bridge, so both slots in a running match follow the card.
        chrome.storage.local.set({ previewSrc }, render);
      });
      seg.append(button);
    });
    return seg;
  }

  /**
   * Whether to mark the start positions this map's own preview left unmarked.
   *
   * Only for the maps that missed some — the rest have nothing of ours on them
   * and nothing to turn off — and only while that picture is the one on screen.
   */
  function spawnToggle(key, entry) {
    if (!entry.thumbFixed || showingOurs(key, entry)) return null;
    const label = document.createElement("label");
    label.className = "opt spawnopt";
    label.title =
      "This map's own preview does not mark every start position. Off shows it " +
      "exactly as the map file has it.";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = spawnFix[key] !== false;
    box.addEventListener("change", () => {
      if (box.checked) delete spawnFix[key];
      else spawnFix[key] = false;
      chrome.storage.local.set({ spawnFix }, render);
    });
    label.append(box, document.createTextNode("Show missed spawn points"));
    return label;
  }

  /**
   * One map's card.
   *
   * `poolEntry` is what the ladder says about this map — how often it came up in
   * the sample and when it was last played. It is the reason the card is in this
   * tab at all, so it is worth showing next to the map's own facts.
   */
  function card(key, entry, poolEntry) {
    const el = document.createElement("article");
    el.className = "card";
    // Read back by the run's progress, which arrives long after the click and
    // has to find the card it belongs to. See noteForMap.
    el.dataset.key = key;
    const label = entry.name || key;

    const preview = previewFor(key, entry);
    const shot = preview ? document.createElement("img") : document.createElement("div");
    if (preview) {
      shot.src = preview.src;
      shot.alt = `${label} preview`;
      shot.className = preview.rendered ? "shot rendered" : "shot";
      shot.title = preview.rendered
        ? "Our render — click for the full size"
        : "The map's own preview — click to enlarge. Play this map once to get a render.";
      shot.addEventListener("click", () => openLightbox(preview));
    } else {
      shot.className = "noshot";
      shot.textContent = "no preview in this map file";
    }

    const shotcol = document.createElement("div");
    shotcol.className = "shotcol";
    shotcol.append(shot, previewChoice(key, entry));
    const spawns = spawnToggle(key, entry);
    if (spawns) shotcol.append(spawns);

    const body = document.createElement("div");
    const title = document.createElement("h2");
    title.textContent = label;
    const facts = document.createElement("p");
    facts.className = "facts";
    // The key is the file name: worth showing, since two maps can share a title.
    facts.textContent = [
      factsLine(entry.facts),
      key,
      poolEntry ? `${poolEntry.matches} ladder matches · last ${fmtDate(poolEntry.last)}` : "",
    ]
      .filter(Boolean)
      .join(" — ");

    const textarea = document.createElement("textarea");
    textarea.value = guideOf(key);
    textarea.placeholder =
      "Write as much as you like — paragraphs, a build order, notes on each start position. " +
      "The whole text is shown on the loading screen and under the preview in game.";
    textarea.spellcheck = false;

    const row = document.createElement("div");
    row.className = "row";
    const save = document.createElement("button");
    save.textContent = "Save";
    const saved = document.createElement("span");
    saved.className = "saved";
    // What the last re-render of this map did. Kept in `renderNotes` rather than
    // on the element: a run's progress lands here across several storage writes,
    // and every one of them rebuilds this list.
    const note = document.createElement("span");
    note.className = "rendernote";
    note.textContent = renderNotes[key] || "";
    const rerender = document.createElement("button");
    rerender.className = "rerender";
    // "Re-" is a promise about what is already there; a map with no render has
    // nothing to redo, and the button is the only way to get a first one.
    const hasRender = !!(renders[key] && renders[key].thumb);
    rerender.textContent = hasRender ? "Re-render" : "Render";
    rerender.title =
      (hasRender
        ? "Draw this map again with the current renderer, replacing the stored render. "
        : "Draw this map with the current renderer. ") +
      "The work happens in a game tab — one that is open, or one the " +
      "extension opens in the background and closes again.";
    rerender.addEventListener("click", () => requestRender(key, label, entry));
    const forget = document.createElement("button");
    forget.className = "forget";
    forget.textContent = "Forget";
    forget.title =
      "Remove this card and its render. The guide is kept, and the card comes back " +
      "if the map is played or rendered again.";
    forget.addEventListener("click", () => forgetMap(key, label));
    row.append(save, saved, note, rerender, forget);

    save.addEventListener("click", () => saveGuide(key, textarea, saved));
    // Blur-save so a click straight into the next card does not lose the edit.
    textarea.addEventListener("blur", () => {
      if (textarea.value.trim() !== guideOf(key).trim()) saveGuide(key, textarea, saved);
    });

    body.append(title, facts, textarea, row);
    el.append(shotcol, body);
    return el;
  }

  /**
   * Drop one map: its catalogue entry, its render, and the full-size image that
   * hangs off it.
   *
   * The guide stays behind on purpose. It is the one thing here a human wrote,
   * and a card comes back by itself — playing or rendering the map catalogues
   * it again — so deleting the notes with the picture would lose the only part
   * that cannot be regenerated. Wanted because a catalogue picks up maps you
   * did not ask for: two files can share a title, and only one of them is the
   * one you play.
   */
  function forgetMap(key, label) {
    if (!confirm(`Forget "${label}"?

The card and its render go. The guide is kept.`)) return;
    delete maps[key];
    delete renders[key];
    chrome.storage.local.remove("full:" + key, () => {
      chrome.storage.local.set({ maps, renders }, render);
    });
  }

  /**
   * The cards of one ladder tab: the maps of that ladder's pool, and only those.
   *
   * A pool entry with no card yet is counted rather than listed — it has no
   * preview, no guide and nothing to edit until it is rendered, and *Render
   * ticked* above is what makes it one.
   */
  function renderCards(p) {
    const pool = pools[p.type];
    const entryFor = poolIndex(pool);
    const needle = p.filterEl.value.trim().toLowerCase();

    const scoped = [];
    const covered = new Set();
    for (const key of Object.keys(maps)) {
      const poolEntry = pool ? entryFor(key, maps[key]) : null;
      if (!poolEntry) continue;
      covered.add(poolEntry.title);
      scoped.push({ key, poolEntry });
    }

    const shown = scoped
      .filter(({ key }) => {
        if (!needle) return true;
        return ((maps[key].name || "") + " " + key).toLowerCase().includes(needle);
      })
      .sort((a, b) => (maps[b.key].seen || 0) - (maps[a.key].seen || 0));

    p.mapsEl.textContent = "";
    shown.forEach(({ key, poolEntry }) => p.mapsEl.append(card(key, maps[key], poolEntry)));

    const missing = pool ? pool.maps.length - covered.size : 0;
    p.countEl.textContent = !pool
      ? ""
      : [
          `${shown.length} of ${scoped.length} map${scoped.length === 1 ? "" : "s"}, newest first`,
          missing ? `${missing} in the pool with no card yet` : "",
        ]
          .filter(Boolean)
          .join(" · ");

    p.mapsEmptyEl.hidden = shown.length > 0;
    p.mapsEmptyEl.textContent = emptyReason(pool, scoped.length, shown.length);
    // Scoped to this ladder, so it is the list's own figure and not a page-wide
    // one — which is why it is written here rather than to every panel at once.
    showUsage(p, scoped.map((s) => s.key));
  }

  /**
   * Why a ladder tab is showing no cards — four different situations that look
   * identical, and only one of them is about this ladder.
   *
   * The empty catalogue is the one worth spelling out: a catalogue is filled by
   * the bridge as the client parses maps, so *no maps at all* is usually a game
   * tab still running the scripts it was loaded with rather than anything to do
   * with the pool.
   */
  function emptyReason(pool, scoped, shown) {
    if (!pool) {
      return "No sample yet — press Find ladder maps above to learn which maps this ladder plays.";
    }
    if (!Object.keys(maps).length) {
      return (
        "No maps recorded at all yet. A map is catalogued the moment the client parses it, so " +
        "one loaded game is enough — but only if the game tab is running the current build. " +
        "After updating the extension, reload the game tab. To check: run __cdc.probe() in the " +
        "game tab's console and look at the bridge line. Render ticked above does the same job " +
        "without playing anything."
      );
    }
    if (!scoped) {
      return (
        "None of this ladder's maps has a card yet. Render ticked draws them; a map also gets a " +
        "card the moment you play it."
      );
    }
    return shown ? "" : "Nothing matches that filter.";
  }

  /**
   * The tab on screen, redrawn. The others are rebuilt when they are opened,
   * which is also when their storage readout is taken — there is nothing to
   * keep current in a panel that is not being looked at.
   */
  function render() {
    const p = ladders[activeTab];
    if (p) renderCards(p);
  }

  /**
   * A tab's own share of the megabytes, against the extension's whole.
   *
   * A run that renders a map and then cannot store it reports the render, not
   * the write — and "the last few maps have no render" looks identical whether
   * the cause is storage or the map. This is the number that tells them apart,
   * and it belongs next to *Clear renders*, which is what one would do about it.
   *
   * Both halves are needed. The total answers "am I near the wall"; the tab's
   * own share answers "is this ladder what put me there", which is the question
   * a page split by ladder invites and one number could not answer.
   *
   * The bytes are the **full-size renders**, because that is where the size is —
   * megabytes each, one storage item apiece, so they can be measured by name.
   * The thumbnails cannot: they live together in the one `renders` item, and
   * `getBytesInUse` weighs items rather than what is inside them. Hence the
   * hover on the readout, and hence the two figures not adding up to a third.
   */
  function showUsage(p, scopedKeys) {
    const total = Object.keys(renders).length;
    const mine = scopedKeys.filter((key) => renders[key]);
    const counts = `${mine.length} of ${total} render${total === 1 ? "" : "s"} stored`;
    if (!chrome.storage.local.getBytesInUse) {
      p.usageEl.textContent = counts;
      return;
    }
    chrome.storage.local.getBytesInUse(mine.map((key) => "full:" + key), (ours) => {
      if (chrome.runtime.lastError) {
        p.usageEl.textContent = counts;
        return;
      }
      chrome.storage.local.getBytesInUse(null, (all) => {
        p.usageEl.textContent = chrome.runtime.lastError
          ? counts
          : `${counts} · ${mb(ours)} of ${mb(all)} in storage`;
      });
    });
  }

  /**
   * Megabytes, with a decimal only while one would otherwise round to nothing —
   * a tab holding a couple of renders next to a total in the hundreds should not
   * read "0 MB of 350 MB".
   */
  function mb(bytes) {
    const value = bytes / 1048576;
    if (!value) return "0 MB"; // a tab with no renders at all, not "0.0"
    return (value >= 10 ? value.toFixed(0) : value.toFixed(1)) + " MB";
  }

  // Only the backdrop: a click on the image itself is handled with the drag, so
  // that panning does not shut the viewer the moment you let go.
  lightboxEl.addEventListener("click", (e) => {
    if (e.target === lightboxEl) closeLightbox();
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !lightboxEl.hidden) closeLightbox();
  });

  // --- the store ------------------------------------------------------------

  /**
   * What this machine is holding, whatever ladder it belongs to.
   *
   * A ladder tab lists its pool's maps and nothing else, so a map rendered from
   * a match on anything the ladder does not play had no card anywhere — a third
   * of this store when the tab was written, several hundred megabytes of it —
   * and the only way to delete one was *Clear renders*, which deletes all of
   * them. This is the store's own view.
   */
  const storedSel = new Set();
  // key -> bytes of that map's full-size render. Measured rather than read: the
  // renders are megabytes each and getBytesInUse weighs an item without
  // fetching it.
  let storedSizes = {};

  function storedKeys() {
    return [...new Set([...Object.keys(maps), ...Object.keys(renders)])];
  }

  /** Which sampled pools this map is in, by their tab's name. */
  function poolsWith(key) {
    return Object.keys(LADDERS)
      .filter((type) => pools[type] && poolIndex(pools[type])(key, maps[key] || {}))
      .map((type) => LADDERS[type].label)
      .join(", ");
  }

  function measureStored(done) {
    const keys = Object.keys(renders);
    if (!chrome.storage.local.getBytesInUse || !keys.length) {
      done();
      return;
    }
    let left = keys.length;
    keys.forEach((key) => {
      chrome.storage.local.getBytesInUse(["full:" + key], (bytes) => {
        if (!chrome.runtime.lastError) storedSizes[key] = bytes;
        if (--left === 0) done();
      });
    });
  }

  function storedRow(key) {
    const row = document.createElement("label");
    row.className = "storedrow";
    // Read back by *Select all*, which ticks what is on screen rather than what
    // is in storage — a filter narrows what "all" means.
    row.dataset.key = key;
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = storedSel.has(key);
    box.addEventListener("change", () => {
      if (box.checked) storedSel.add(key);
      else storedSel.delete(key);
      storedSay();
    });

    const entry = maps[key] || {};
    const stored = renders[key];
    const thumb = document.createElement(stored && stored.thumb ? "img" : "span");
    thumb.className = "storedthumb";
    if (stored && stored.thumb) {
      thumb.src = stored.thumb;
      thumb.alt = "";
    } else {
      thumb.textContent = "no render";
    }

    const name = document.createElement("b");
    name.textContent = entry.name || key;
    const facts = document.createElement("span");
    facts.className = "storedfacts";
    facts.textContent = [
      key,
      stored ? `rendered ${fmtDate(stored.at)}` : "no render — catalogued only",
      stored && storedSizes[key] ? mb(storedSizes[key]) : "",
      stored && stored.v ? `renderer v${stored.v}` : "",
      guideOf(key) ? "has a guide" : "",
      poolsWith(key),
    ]
      .filter(Boolean)
      .join(" · ");

    const text = document.createElement("span");
    text.className = "storedtext";
    text.append(name, facts);
    row.append(box, thumb, text);
    return row;
  }

  function storedSay() {
    const n = storedSel.size;
    const bytes = [...storedSel].reduce((sum, key) => sum + (storedSizes[key] || 0), 0);
    storedStatusEl.textContent = n ? `${n} ticked · ${mb(bytes)} of renders` : "";
    storedDropRenderEl.disabled = !n;
    storedForgetEl.disabled = !n;
  }

  function renderStored() {
    const needle = storedFilterEl.value.trim().toLowerCase();
    const all = storedKeys();
    const shown = all
      .filter((key) => !needle || ((maps[key] || {}).name + " " + key).toLowerCase().includes(needle))
      // Heaviest first: what is filling storage is the question this tab exists
      // to answer, so it is at the top. Ties by name, so the order is stable.
      .sort((a, b) => (storedSizes[b] || 0) - (storedSizes[a] || 0) || a.localeCompare(b));

    storedListEl.textContent = "";
    shown.forEach((key) => storedListEl.append(storedRow(key)));
    storedCountEl.textContent = `${shown.length} of ${all.length} map${all.length === 1 ? "" : "s"}, heaviest first`;
    storedEmptyEl.hidden = shown.length > 0;
    storedEmptyEl.textContent = all.length
      ? "Nothing matches that filter."
      : "Nothing stored yet. A map is catalogued the moment the client parses it, and rendered by " +
        "playing it or by Render ticked on a ladder tab.";

    const withRender = Object.keys(renders).length;
    const bytes = Object.values(storedSizes).reduce((sum, n) => sum + n, 0);
    storedUsageEl.textContent = `${withRender} render${withRender === 1 ? "" : "s"} · ${mb(bytes)}`;
    if (chrome.storage.local.getBytesInUse) {
      chrome.storage.local.getBytesInUse(null, (total) => {
        if (chrome.runtime.lastError) return;
        storedUsageEl.textContent =
          `${withRender} render${withRender === 1 ? "" : "s"} · ${mb(bytes)} of ${mb(total)} in storage`;
      });
    }
    showEvicted();
    storedSay();
  }

  /**
   * What the cap threw away, said out loud.
   *
   * The store evicts the oldest render past MAX_RENDERS, and it used to do it
   * silently — which reads as "a render I made is gone" with nothing to explain
   * it. The bridge now records the event and this is where it surfaces, until
   * it is dismissed.
   */
  function showEvicted() {
    const record = evicted;
    storedEvictedEl.hidden = !record || !record.keys || !record.keys.length;
    if (storedEvictedEl.hidden) return;
    storedEvictedEl.textContent =
      `${record.keys.length} render${record.keys.length === 1 ? " was" : "s were"} dropped on ` +
      `${fmtDate(record.at)} to stay under the ${record.cap}-render cap: ${record.keys.join(", ")}. ` +
      "A map with a guide is never dropped. ";
    const dismiss = document.createElement("button");
    dismiss.type = "button";
    dismiss.className = "linkbtn";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", () => {
      evicted = null;
      chrome.storage.local.remove("evicted", showEvicted);
    });
    storedEvictedEl.append(dismiss);
  }

  function refreshStored() {
    measureStored(renderStored);
  }

  // --- the log --------------------------------------------------------------

  /**
   * What the extension did, read back.
   *
   * The worker writes it (see appendLog in background.js) and this page only
   * shows it — so a row on another tab that reads wrong has its explanation a
   * click away rather than behind DevTools in a game tab that has since been
   * closed. The same entries are what `scripts/read-storage.mjs` prints.
   */
  let logEntries = [];

  const LOG_TIME = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  /** The entries the filters leave. */
  function logShown() {
    const needle = logFilterEl.value.trim().toLowerCase();
    return logEntries.filter((entry) => {
      if (logWarnOnlyEl.checked && entry.level === "info") return false;
      if (!needle) return true;
      return `${entry.src} ${entry.msg}`.toLowerCase().includes(needle);
    });
  }

  const logLineText = (entry) =>
    `${LOG_TIME.format(entry.at)}  ${entry.src}  ` +
    `${entry.level === "info" ? "" : entry.level.toUpperCase() + " "}${entry.msg}`;

  function renderLog() {
    const shown = logShown();
    logListEl.textContent = "";
    for (const entry of shown) {
      const row = document.createElement("div");
      row.className = "logrow" + (entry.level === "info" ? "" : " " + entry.level);
      const time = document.createElement("span");
      time.className = "logtime";
      time.textContent = LOG_TIME.format(entry.at);
      const src = document.createElement("span");
      src.className = "logsrc";
      src.textContent = entry.src;
      const msg = document.createElement("span");
      msg.className = "logmsg";
      msg.textContent = entry.msg;
      row.append(time, src, msg);
      logListEl.append(row);
    }
    logCountEl.textContent = logEntries.length
      ? shown.length === logEntries.length
        ? `${logEntries.length} entries`
        : `${shown.length} of ${logEntries.length}`
      : "";
    logEmptyEl.hidden = shown.length > 0;
    logEmptyEl.textContent = logEntries.length
      ? "Nothing matches that filter."
      : "Nothing logged yet. Play a map or start a render run, then come back.";
    // Newest last, so the end that matters is the end in view.
    logListEl.scrollTop = logListEl.scrollHeight;
  }

  function wireLog() {
    logFilterEl.addEventListener("input", renderLog);
    logWarnOnlyEl.addEventListener("change", renderLog);
    logCopyEl.addEventListener("click", () => {
      const text = logShown().map(logLineText).join("\n");
      navigator.clipboard.writeText(text).then(
        () => (logStatusEl.textContent = `copied ${logShown().length} line(s)`),
        (e) => (logStatusEl.textContent = `could not copy — ${e && e.message}`)
      );
    });
    logClearEl.addEventListener("click", () => {
      chrome.storage.local.set({ log: [] }, () => {
        const error = chrome.runtime.lastError;
        logStatusEl.textContent = error ? `could not clear — ${error.message}` : "cleared";
      });
    });
  }

  /**
   * Delete the ticked maps' renders, and their cards too if asked.
   *
   * The heavy item and the index entry go together — dropping one and keeping
   * the other is how storage fills up with things nothing can reach — and the
   * guide stays either way, on the same reasoning as *Forget* on a card: it is
   * the one thing here a human wrote.
   */
  function storedDelete(alsoCard) {
    const keys = [...storedSel].filter((key) => maps[key] || renders[key]);
    if (!keys.length) return;
    const bytes = keys.reduce((sum, key) => sum + (storedSizes[key] || 0), 0);
    const many = keys.length === 1 ? "" : "s";
    const question = alsoCard
      ? `Forget ${keys.length} map${many}? The card${many} and ${mb(bytes)} of renders go. The guides are kept.`
      : `Delete ${keys.length} render${many} — ${mb(bytes)}? The cards, guides and the map list stay.`;
    if (!confirm(question)) return;
    keys.forEach((key) => {
      delete renders[key];
      delete storedSizes[key];
      if (alsoCard) delete maps[key];
    });
    chrome.storage.local.remove(
      keys.map((key) => "full:" + key),
      () => {
        chrome.storage.local.set({ maps, renders }, () => {
          storedSel.clear();
          refreshStored();
          render();
        });
      }
    );
  }

  wireLog();

  storedFilterEl.addEventListener("input", renderStored);
  storedAllEl.addEventListener("click", () => {
    storedListEl.querySelectorAll(".storedrow").forEach((row) => {
      storedSel.add(row.dataset.key);
      row.querySelector("input").checked = true;
    });
    storedSay();
  });
  storedNoneEl.addEventListener("click", () => {
    storedSel.clear();
    storedListEl.querySelectorAll(".storedrow input").forEach((box) => (box.checked = false));
    storedSay();
  });
  storedDropRenderEl.addEventListener("click", () => storedDelete(false));
  storedForgetEl.addEventListener("click", () => storedDelete(true));

  // --- sprite alignment -----------------------------------------------------

  /**
   * The instrument itself is src/options-align.js, which the public build does
   * not ship. Absent, both handles are no-ops, no panel is appended, and
   * `buildTabs()` therefore finds no tab to build — the feature disappears from
   * the page without the tab strip knowing it ever existed.
   */
  const alignPanel = window.__cdcAlign
    ? window.__cdcAlign.mount({
        panelsEl,
        askForRun,
        fmtDateTime,
        makeViewer,
        pad,
        runInFlight,
        // Live views, not values: a storage change replaces each of these
        // objects wholesale, so anything captured at mount time would be stale
        // within a second of the page loading. The setters write back, which is
        // what makes Save save rather than quietly not.
        shared: {
          get activeTab() {
            return activeTab;
          },
          get maps() {
            return maps;
          },
          get prefs() {
            return prefs;
          },
          set prefs(value) {
            prefs = value;
          },
          get spriteFix() {
            return spriteFix;
          },
          set spriteFix(value) {
            spriteFix = value;
          },
          get spriteFixByName() {
            return spriteFixByName;
          },
          set spriteFixByName(value) {
            spriteFixByName = value;
          },
        },
      })
    : { onTab: () => {}, onStorage: () => {}, onPrefs: () => {}, say: () => {}, setBusy: () => {} };


  // --- ladder pool ----------------------------------------------------------

  /**
   * The maps a ladder is played on, and a run that renders them.
   *
   * Two halves that cannot live in one place. Sampling the pool is plain HTTP
   * and happens here (`src/ladder.js`). Rendering cannot: this page has no game
   * client and therefore no theater art, so the run is asked for through
   * storage and carried out by the game tab — the same route the alignment
   * sample already travels, in the other direction.
   */
  /**
   * A message in the slot beside the buttons, or — with nothing to say — what
   * this machine holds of the pool.
   *
   * The slot's resting state is the count, so clearing a message gives the
   * count back rather than leaving a gap, and a run's progress is a visitor in
   * it. That also settles what a *finished* run's summary is: something to read
   * now, not a line the page repaints days later out of storage. The next
   * repaint replaces it with the state it left behind.
   */
  const poolStatus = (p, text) => (p.statusEl.textContent = text || poolHeld(p));

  /**
   * How many of the sampled maps are drawn on this machine.
   *
   * The pool's own size is a fact about the ladder and is stated by the list
   * itself, row by row; how many of them this machine can actually show is the
   * question the box is opened to answer, and it used to be a `18/21 rendered`
   * in a summary line of six such fragments.
   */
  function poolHeld(p) {
    const pool = pools[p.type];
    if (!pool || !pool.maps || !pool.maps.length) return "";
    const drawn = [...poolCoverage(pool).values()].filter((h) => h.rendered).length;
    return `Rendered ${drawn} of ${pool.maps.length} maps`;
  }

  /**
   * The `?` symbol from the markup, built here because these hang off values
   * only the panel knows.
   *
   * A sentence of advice — *re-sample to measure it* — is read once and then in
   * the way for good, and the summary line carries two of them. Folded into the
   * symbol they stay one click from the fact they belong to. The click is also
   * where this differs from the written ones: the summary of a `<details>` is
   * the box's own toggle, and reading a hint is not asking for the box.
   */
  function poolHelp(text) {
    const help = document.createElement("span");
    help.className = "help";
    help.tabIndex = 0;
    help.setAttribute("role", "note");
    help.textContent = "?";
    const tip = document.createElement("span");
    tip.className = "tip";
    tip.textContent = text;
    help.append(tip);
    help.addEventListener("click", (event) => event.preventDefault());
    return help;
  }

  /**
   * What the user has ticked — every sampled map bar the exclusions, as
   * `{ title, file }`.
   *
   * The file is what the run matches on: a title can name two maps (see
   * `src/ladder.js`), and the file is the one the ladder plays. A pool sampled
   * before the file was resolved carries an empty one, and the run says so
   * rather than guessing.
   */
  function poolSelection(p) {
    const pool = pools[p.type];
    if (!pool) return [];
    const excluded = new Set(pool.excluded || []);
    return pool.maps
      .filter((m) => !excluded.has(m.title))
      .map((m) => ({ title: m.title, file: m.file || "" }));
  }

  function savePool(type, next) {
    pools = { ...pools, [type]: next };
    chrome.storage.local.set({ pools }, () => {
      const p = ladders[type];
      if (!p) return;
      renderPool(p);
      if (activeTab === type) renderCards(p);
    });
  }

  /**
   * Whether this pool was resolved by an older build than the one loaded.
   *
   * `src/ladder.js` is the only thing that can say what its resolver is, so the
   * comparison is against the loaded module rather than a copy of the number
   * here — the same reasoning as the renderer's version stamp. A page whose
   * `ladder.js` failed to load says nothing rather than guessing.
   */
  function poolIsStale(pool) {
    const current = window.__cdcLadder && window.__cdcLadder.RESOLVER_VERSION;
    return typeof current === "number" && (pool.rv || 0) < current;
  }

  function renderPool(p) {
    const pool = pools[p.type];
    p.listEl.textContent = "";
    if (!pool || !pool.maps || !pool.maps.length) {
      p.infoEl.textContent = "";
      p.poolEmptyEl.hidden = false;
      p.poolEmptyEl.textContent =
        "No sample yet. Press “Find ladder maps” — it reads a slice of the ladder and " +
        "the recent matches of the players on it, which takes half a minute.";
      // Back to the bare label: a count on a button with nothing to count reads
      // as a stale number rather than as zero.
      p.renderEl.textContent = "Render ticked";
      p.renderEl.disabled = true;
      p.allEl.disabled = true;
      p.noneEl.disabled = true;
      poolStatus(p, "");
      return;
    }
    p.poolEmptyEl.hidden = true;
    p.renderEl.disabled = runInFlight();
    p.allEl.disabled = false;
    p.noneEl.disabled = false;

    const excluded = new Set(pool.excluded || []);
    const ticked = pool.maps.length - excluded.size;
    const held = poolCoverage(pool);
    const stale = poolIsStale(pool);
    // On the button, which is what the number is about: *Render ticked (17)*
    // says what pressing it will do, where the same count at the top of the box
    // was three lines away from the button and repeated by every row's own tick.
    p.renderEl.textContent = `Render ticked (${ticked})`;

    // What the sample is a claim about, and nothing else: who was read, over
    // which period, and when. What this machine holds of it is the line under
    // the buttons; how many maps are ticked is on the button. The two
    // advisories are folded into a `?` each — end to end they turned a line of
    // provenance into a paragraph, and both are read once.
    //
    // The period is stated even when there is none: the day of the sample says
    // nothing about how far back it looked, and leaving the fragment out made a
    // sample from before the period was recorded look like one that covers
    // today.
    p.infoEl.textContent = "";
    p.infoEl.append(`sampled from ${pool.players} players, ${pool.matches} matches · `);
    if (pool.from && pool.to) {
      p.infoEl.append(`played ${fmtDate(pool.from)} – ${fmtDate(pool.to)}`);
    } else {
      p.infoEl.append(
        "sample period not recorded",
        poolHelp(
          "A pool is a claim about a period, and this one was sampled before the period was " +
            "recorded. Find ladder maps again to measure it."
        )
      );
    }
    p.infoEl.append(` · sampled ${fmtDate(pool.at)}`);
    // A stored pool outlives the resolver that made it, and nothing about the
    // rows says so: after the `.mpr` correction the two YR ports went on reading
    // `file unresolved`, which was true of the sample and false of the ladder.
    // The stamp turns "try re-sampling" from advice into a fact.
    if (stale) {
      p.infoEl.append(
        " · resolved by an older build",
        poolHelp(
          "This sample was read by a build that could not name every kind of map file. Find " +
            "ladder maps again — the resolver loaded now may resolve what this one left unnamed."
        )
      );
    }

    // The slot beside the buttons goes back to stating what is drawn. Not while
    // a run is going: the run is talking there, and its progress is worth more
    // than a count that is about to change again anyway.
    if (!runInFlight()) poolStatus(p, "");

    const sampled = fmtDate(pool.at);

    for (const entry of pool.maps) {
      const row = document.createElement("label");
      row.className = "poolrow";

      const tick = document.createElement("input");
      tick.type = "checkbox";
      tick.checked = !excluded.has(entry.title);
      tick.addEventListener("change", () => {
        const next = new Set(pool.excluded || []);
        if (tick.checked) next.delete(entry.title);
        else next.add(entry.title);
        savePool(p.type, { ...pool, excluded: [...next] });
      });

      const title = document.createElement("span");
      title.className = "poolname";
      title.textContent = entry.title;

      // How often it came up, because that is what separates a map in the
      // rotation from one on its way out — and the sample cannot tell you which
      // without showing its working.
      const stat = document.createElement("span");
      stat.className = "poolstat";
      stat.append(
        `${entry.matches} matches · `,
        ...poolLastPlayed(entry, sampled),
        ...poolMarks(entry, held.get(entry.title), stale)
      );

      row.append(tick, title, stat);
      p.listEl.append(row);
    }
  }

  /**
   * What this machine holds of each pool entry — the other half of a row.
   *
   * The pool is a claim about the ladder; a card and a render are facts about
   * this machine, and the two disagree more often than a count of each suggests.
   * A title the sample could not resolve to a file still gets a card and a
   * render — matched by title, the documented fallback in `poolIndex` — while a
   * file it resolved perfectly well can have no card at all, because the run
   * never reached that map. Both read as "18 on the ladder, 16 here" unless the
   * row says which of the two it is.
   *
   * @returns {Map<string, {key: string, rendered: boolean, byTitle: boolean}>}
   *          keyed by pool title, the entries the catalogue can answer for
   */
  function poolCoverage(pool) {
    const entryFor = poolIndex(pool);
    const held = new Map();
    // Everything this machine holds of a map, which is the catalogue **and** the
    // render index — the same set the Stored maps tab is built from. A render
    // whose card never reached storage is still a render, and walking only the
    // cards made the row report `not rendered`, the strongest negative it has,
    // about a map this machine held 17 MB of. The write that loses a card is
    // fixed in src/bridge.js; a row that cannot see past a missing card is a
    // second bug, and it would go on lying about whatever is already stored
    // that way.
    for (const key of storedKeys()) {
      const card = maps[key] || {};
      const entry = pool ? entryFor(key, card) : null;
      if (!entry) continue;
      const rendered = !!(renders[key] && renders[key].thumb);
      // Two cards can answer to one entry — the fallback matches on a title, and
      // a title can name two files. The rendered one is what the row is about.
      const seen = held.get(entry.title);
      if (seen && !(rendered && !seen.rendered)) continue;
      held.set(entry.title, {
        key,
        rendered,
        carded: !!maps[key],
        byTitle: !(entry.file && entry.file.toLowerCase() === fileOf(key, card)),
      });
    }
    return held;
  }

  /**
   * The day this map was last played, when that is not the day of the sample.
   *
   * Nearly every row of a live pool was played on the day the ladder was read,
   * so the date down the whole list said nothing and buried the one row where
   * it differs — which is the row worth seeing: a map that stopped coming up
   * before the sample was taken is a map on its way out. Kept out of the ink
   * the rest of the line reads in, for the same reason.
   *
   * @param {{last: number}} entry   a pool entry
   * @param {string} sampled         the day of the sample, already formatted
   * @returns {Array} what the row appends, empty when the two days agree
   */
  function poolLastPlayed(entry, sampled) {
    const last = fmtDate(entry.last);
    if (last === sampled) return [];
    const age = document.createElement("span");
    age.className = "poolage";
    age.textContent = `last ${last}`;
    age.title =
      `Last played ${last}; the ladder was read ${sampled}. This map did not come up on the ` +
      "day of the sample.";
    return [age, " · "];
  }

  /**
   * The two facts a row ends on: which file the sample resolved the title to,
   * and what this machine has of it.
   *
   * Green on the file name is the one combination that needs nothing further —
   * the ladder's file is known, and the render on this machine is the render of
   * that file. Everything else is a different piece of work: red says the sample
   * could not name the file, amber says the map is catalogued but undrawn, and a
   * match made on the title alone says so even when it is drawn, because a title
   * can name two maps and only one of them is the one the ladder plays.
   */
  function poolMarks(entry, held, stale) {
    const file = document.createElement("span");
    if (entry.file) {
      file.className = held && held.rendered && !held.byTitle ? "poolfile ok" : "poolfile";
      file.textContent = entry.file;
    } else {
      file.className = "poolfile bad";
      file.textContent = "file unresolved";
      file.title = stale
        ? "This pool was resolved by an older build, which could not read every kind of map " +
          "file name. Find ladder maps again — the resolver loaded now may well name it."
        : "No replay of this map would name its file, so it is matched by title instead — " +
          "and a title can name two maps. Find ladder maps again to resolve it.";
    }

    const mark = document.createElement("span");
    if (!held) {
      mark.className = "poolmark bad";
      mark.textContent = "not rendered";
      mark.title =
        "Nothing in the catalogue answers to this map — it has no card below and no render. " +
        "Render ticked draws it.";
    } else if (!held.rendered) {
      mark.className = "poolmark warn";
      mark.textContent = "no render";
      mark.title = `Catalogued as ${held.key}, but with no render of ours — the card shows the map's own preview.`;
    } else if (!held.carded) {
      // Rendered, but with no card for the render to sit on. Amber rather than
      // green: the picture is there, and the catalogue — every list built from
      // cards, and the name, the guide and the facts that hang off one — is
      // missing this map entirely.
      mark.className = "poolmark warn";
      mark.textContent = "rendered, no card";
      mark.title =
        `A render of ${held.key} is in storage, but the map has no card — so it has no name, ` +
        "no guide and no place in the catalogue. Render it again to rebuild the card.";
    } else if (held.byTitle) {
      mark.className = "poolmark warn";
      mark.textContent = "rendered by title";
      mark.title = `Rendered as ${held.key}, matched on the title rather than the file — so this is the right map only if the title names one.`;
    } else {
      mark.className = "poolmark ok";
      mark.textContent = "rendered";
      mark.title = `Rendered as ${held.key}.`;
    }
    return [file, document.createTextNode(" · "), mark];
  }

  function findPool(p) {
    if (!window.__cdcLadder) {
      poolStatus(p, "ladder.js did not load");
      return;
    }
    p.findEl.disabled = true;
    poolStatus(p, "sampling…");
    window.__cdcLadder
      .samplePool({
        realm: p.realmEl.value,
        type: p.type,
        onProgress: (done, total, what) => poolStatus(p, total ? `${done}/${total} — ${what}` : what),
      })
      .then((sampled) => {
        // Exclusions are kept across a re-sample: they are the user's judgement
        // about a map, and re-reading the ladder is not new information about it.
        const excluded = (pools[p.type] && pools[p.type].excluded) || [];
        savePool(p.type, { ...sampled, excluded });
        // How many maps came back is the list itself; what the slot says now is
        // how many of them this machine can show.
        poolStatus(p, "");
      })
      .catch((e) => poolStatus(p, "failed — " + (e && e.message)))
      .then(() => {
        p.findEl.disabled = false;
      });
  }

  /**
   * How the run is going. Written by the game tab through the bridge, read here
   * — the two contexts share nothing but storage.
   *
   * A tab that is already open picks the request up in milliseconds. Past
   * ANSWER_MS none is, and one is opened rather than the page telling the user
   * to go and do it: the client boots to its main menu with rules, art and the
   * map list loaded, which is everything a render needs.
   */
  const ANSWER_MS = 1500;

  // A cold client downloads its base data before the main menu appears, and the
  // run then waits for the map list. Minutes, on a first run.
  const BOOT_MS = 210000;

  // A run that has started and then gone quiet — the tab was closed mid-run, or
  // the client crashed. Distinct from never having started at all.
  const STALL_MS = 60000;

  // How long a tab opened for a run gets to show any sign of the client before
  // it is brought to the front. A background tab has its timers clamped and no
  // animation frames at all, and the client's boot leans on both — so a tab that
  // is merely hidden can sit there for ever looking exactly like a slow one.
  const NUDGE_MS = 25000;

  /**
   * The same, for a replay re-run. It was 90 s for one afternoon, on the reading
   * that the frame pump makes a hidden boot work and the nudge was cutting it
   * short. Measured again with the longer window and the reading did not
   * survive: the tab sat hidden for **ninety seconds with no loading screen at
   * all**, and the client got there five seconds after the nudge finally showed
   * it — while a *warm* client had booted hidden in 10.9 s the run before. So
   * the pump carries a warm boot and a cold one still needs the tab in front,
   * and the number that serves both is the short one: 10.9 s of warm boot fits
   * inside it, and ninety seconds of a cold tab going nowhere does not happen
   * again.
   */
  const SIM_NUDGE_MS = 25000;

  // The last state of the run, so a second one is refused rather than written
  // over the top of it: there is one `bulk` item and one game tab doing the
  // work, whatever asked for it — either ladder's pool, or a single card.
  let lastBulk = null;

  // The timer that gives up on a client that never came up. Cleared whenever a
  // new run is asked for, so two runs cannot both be counting down.
  let bootTimer = null;

  // The timer that brings a hidden tab forward when the client will not start
  // in it. Cleared with the rest whenever a new run is asked for.
  let nudgeTimer = null;

  // map key -> what its own re-render is doing. Held here because every progress
  // write rebuilds the list, taking the card that was showing it with it.
  let renderNotes = {};

  function runInFlight() {
    const b = lastBulk;
    if (!b || b.finishedAt) return false;
    // Asked for, and nothing has picked it up yet: a client may be booting.
    if (!b.started) return Date.now() - b.at < BOOT_MS;
    // A run writes something on every map and every few seconds while it waits
    // for the client, so silence past STALL_MS is a tab that went away rather
    // than a slow map. It used to be "has it done one map yet", which meant a
    // run whose final write never landed — the tab closing under it — was in
    // flight for ever, and every later run was refused with "already going".
    return Date.now() - (b.patchedAt || b.started) < STALL_MS;
  }

  /**
   * Where a run reports to: the card that asked for it, or the panel of the
   * ladder whose pool it is rendering.
   *
   * `from` is that ladder. A run asked for before there were two carries none,
   * and reports to the first ladder panel rather than nowhere.
   */
  function sayFor(run) {
    // A capture was asked for on the alignment tab and is reported there. Before
    // a card, because a capture names a map and would otherwise talk to that
    // map's card on a tab the user is not looking at.
    if (run && run.sample) return alignPanel.say;
    if (run && run.only) return (text) => noteForMap(run.only, text);
    // A harvest with no ladder behind it was asked for on the Replays tab and
    // is reported there. A pool run harvests too, but it carries `from` and
    // belongs to that ladder's own status line.
    if (run && run.harvest && !run.from) {
      return harvestSay;
    }
    const p = ladders[(run && run.from) || ""] || Object.values(ladders)[0];
    return p ? (text) => poolStatus(p, text) : () => {};
  }

  function noteForMap(key, text) {
    renderNotes[key] = text;
    document
      .querySelectorAll(`.card[data-key="${CSS.escape(key)}"] .rendernote`)
      .forEach((el) => (el.textContent = text));
  }

  /**
   * What a finished pool run did, as opposed to how much work it did.
   *
   * A map the current renderer has already drawn is skipped, so the second run
   * over a pool renders nothing and the honest count of its work is zero. Said
   * as *rendered 0 of 21* that reads as a run where nothing worked — beside a
   * pool summary in the same panel stating *21/21 rendered*, which is the truth
   * the line was read for. The skips are counted now and the all-skipped run,
   * far the most common one, says what it means.
   *
   * A run stored before the count existed has no `skipped`, and keeps the old
   * wording until the next run replaces it — there is nothing to recover it
   * from, and inventing skips to make the numbers add up would be worse.
   */
  function runSummary(bulk) {
    const rendered = bulk.rendered || 0;
    const skipped = bulk.skipped || 0;
    if (skipped && skipped === bulk.total) return `nothing to redo — all ${bulk.total} already current`;
    return `rendered ${rendered} of ${bulk.total}` + (skipped ? ` · ${skipped} already current` : "");
  }

  /**
   * The run's progress, wherever it was asked for.
   *
   * `only` is the map key of a single-card re-render, and the run reports to
   * that card instead of a pool's status line. *Render ticked* in **both**
   * ladder tabs follows along: one run at a time, one game tab, so a run started
   * anywhere makes every one of them busy.
   */
  function renderBulk(bulk) {
    lastBulk = bulk || null;
    const busy = runInFlight();
    Object.values(ladders).forEach((p) => {
      p.renderEl.disabled = busy || !pools[p.type];
    });
    alignPanel.setBusy(busy);
    // The harvest needs neither a pool nor a map, so busy is its only gate.
    harvestGoEl.disabled = busy;
    if (!bulk || !bulk.started) return;
    const say = sayFor(bulk);
    const failed = bulk.failed || [];

    if (bulk.finishedAt) {
      clearTimeout(bootTimer);
      clearTimeout(nudgeTimer);
      if (bulk.sample) {
        // The sample itself arrives through storage and rebuilds the panel, so
        // this line only has to say whether it is coming.
        say(failed.length ? failed.join("; ") : "captured — the panel below is this map now");
        return;
      }
      say(
        bulk.only
          ? failed.length
            ? failed.join("; ")
            : bulk.rendered
            ? "re-rendered"
            : "nothing was rendered"
          : runSummary(bulk) +
              (failed.length ? ` · ${failed.length} failed: ${failed.join("; ")}` : "")
      );
    } else if (!bulk.done && Date.now() - bulk.started > STALL_MS) {
      say("the run stopped answering — the game tab may have been closed");
    } else {
      say(
        bulk.only
          ? bulk.active || "rendering…"
          : `${bulk.done || 0}/${bulk.total} — ${bulk.active || "starting"}`
      );
    }
  }

  /**
   * Ask for a run, and get a client if none is listening.
   *
   * The request is a storage write, because that is the only thing this page and
   * a game tab share. `requested` is what the bridge acts on; it clears the flag
   * before the progress writes start landing on the same item.
   *
   * A tab that is already open answers at once. If nothing has by ANSWER_MS, the
   * service worker opens one — it is the only half of the extension that can —
   * and the bridge in it picks the request out of storage as it loads. The tab
   * closes itself when the run ends.
   *
   * A hidden tab may never finish booting the client: its timers are clamped and
   * it gets no animation frames, both of which the client's own start-up leans
   * on. So a tab that shows no sign of one by NUDGE_MS is brought to the front
   * rather than left to look like a slow one — that is the extension's job, not
   * something to ask the user to notice.
   *
   * @param {Array}  maps  [{ title, file }] — the file is what the run matches on
   * @param {object} extra `force` to redo a render that is already current,
   *                       `only` to report to one card, `from` to report to a
   *                       ladder panel
   */
  function askForRun(maps, extra) {
    const say = sayFor(extra);
    chrome.storage.local.set({ bulk: { at: Date.now(), maps, requested: true, ...extra } });
    ensureGameTab({
      say,
      started: () => !!(lastBulk && lastBulk.started),
      progressing: runProgressing,
      gaveUp: () => {
        Object.values(ladders).forEach((p) => {
          p.renderEl.disabled = runInFlight() || !pools[p.type];
        });
      },
    });
  }

  /**
   * Get a client listening for a job already written to storage.
   *
   * One copy, because the policy in it is measured rather than obvious and two
   * copies would drift: wait ANSWER_MS for a tab that is already open to pick
   * the request up, open one if none did, bring it to the front if it shows no
   * sign of a client by NUDGE_MS — a background tab has its timers clamped and
   * no animation frames at all, and the client's boot leans on both — and give
   * up out loud at BOOT_MS rather than leaving a hopeful ellipsis.
   *
   * A replay re-run does NOT come through here: it opens the tab on a URL, shows
   * it outright for a long match, and has no boot deadline. See askForSim, and
   * the measurement behind SIM_NUDGE_MS.
   *
   * @param {function} o.say         where to report
   * @param {function} o.started     has a tab taken the job
   * @param {function} o.progressing is the job actually moving, as against
   *                                 sitting in a tab whose client never came up
   * @param {function} [o.gaveUp]    anything else to put right when it did not
   */
  function ensureGameTab({ say, started, progressing, gaveUp }) {
    clearTimeout(bootTimer);
    clearTimeout(nudgeTimer);
    setTimeout(() => {
      if (started()) return; // a tab was already listening
      say("starting the game client…");
      chrome.runtime.sendMessage({ type: "open-game-tab" }, (answer) => {
        const failed =
          (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
          (answer && !answer.ok && answer.error) ||
          (!answer && "the extension's service worker did not answer");
        if (failed) {
          say("could not open a game tab — " + failed);
          return;
        }
        const show = () =>
          chrome.runtime.sendMessage({ type: "show-game-tab", tabId: answer.tabId }, () => {
            void chrome.runtime.lastError; // the worker may be asleep
          });
        // Asked for outright rather than waited for. The nudge below exists to
        // rescue a tab that turns out to be too throttled to boot; with this
        // set the user has already said they want to watch it, and the nudge
        // has nothing left to do — its own message is about a hidden tab.
        if (visibleRun()) {
          show();
          return;
        }
        nudgeTimer = setTimeout(() => {
          if (progressing()) return;
          say("the client is slow to start in a hidden tab — bringing it to the front");
          show();
        }, NUDGE_MS);
      });
      bootTimer = setTimeout(() => {
        if (started()) return;
        say("the game client did not come up — open game.chronodivide.com and try again");
        if (gaveUp) gaveUp();
      }, BOOT_MS);
    }, ANSWER_MS);
  }

  /**
   * Is the run actually moving, as opposed to sitting in a tab that is not
   * running? A run waiting for the client says so in `active`, and that is the
   * one state that means "not yet" rather than "under way".
   */
  function runProgressing() {
    const b = lastBulk;
    if (!b || !b.started) return false;
    if (b.finishedAt || b.done > 0) return true;
    return !!b.active && !/waiting for the game client/.test(b.active);
  }

  /**
   * One map, drawn again by the current renderer.
   *
   * Same machinery as a pool's run — the picture can only be made in the game
   * tab — with `force`, because this button exists for the render that is
   * already current and wrong: the one made before a fix to the renderer that
   * did not change its version, or against theater art that had not loaded.
   */
  function requestRender(key, label, entry) {
    if (runInFlight()) {
      noteForMap(key, "a render run is already going");
      return;
    }
    // The run matches on the map's file name. That is what the catalogue is
    // keyed by, but only for a card the client reported a file for — one keyed
    // by a name out of the map itself cannot be found in the client's map list,
    // and says so here rather than starting a run that fails in the other tab.
    const file = (entry.facts && entry.facts.file) || (MAP_FILE.test(key) ? key : "");
    if (!file) {
      noteForMap(key, "this card has no map file to re-render — play the map once");
      return;
    }
    renderNotes = {}; // one run at a time, so one note at a time
    noteForMap(key, "queued…");
    askForRun([{ title: label, file }], { force: true, only: key });
  }

  // --- replays --------------------------------------------------------------

  /**
   * A match, read back.
   *
   * The reader is src/replay.js; this is the panel around it. Two ways in — a
   * URL pasted from wherever you were looking at the match, or a player name the
   * ladder will list recent matches for — because those are the two states
   * somebody arrives in, and the second one is how you find a replay you did not
   * already have a link to.
   *
   * No report is stored — one is a few dozen rows derived from a file that is
   * still on the replay host, and the store is already the extension's expensive
   * part; re-reading a replay costs one request and a millisecond. What is kept
   * is the asking: the two lists of recents below, so neither box has to be
   * typed into twice.
   */
  const REPLAY = window.__cdcReplay || null;

  let replayMatches = []; // what the history call last returned
  let replayOpen = ""; // the game id on screen, so a re-click is not a re-fetch
  let replayReport = null; // the report on screen, kept so a harvest can be folded in without re-fetching
  let replayMatchRow = null; // the ladder's own row for it, if it came from the list
  let sims = {}; // gameId -> what re-running that match produced
  let simState = null; // the in-flight run, as the bridge patches it
  // `real` (the wall clock the players sat through), `game` (the same moment at
  // the ladder's 60 ticks a second) or `both`. Only a match played at another
  // speed has two different clocks, and only such a report offers the choice.
  let replayClock = "real";
  let replayUrl = ""; // where the report on screen came from, so it can be re-run
  let replaySourceNote = ""; // how a report that came from a file got here, for its header
  let replayFileText = ""; // the file itself, when no host serves it — what a re-run is handed

  /**
   * Whether losses share the timeline with the build order.
   *
   * On by default once a match has been re-run — they are the reason to re-run
   * it. It is a switch rather than a fixed choice because the two together are a
   * denser page than either alone, and which one you are reading changes what
   * you want the other to be doing.
   *
   * The switch itself is drawn by src/replay-view.js, above the timeline it
   * governs; what is kept here is the answer, because it outlives the report it
   * was given on.
   */
  const LOSSES_ITEM = "cdc.replay.losses";
  let showLosses = localStorage.getItem(LOSSES_ITEM) !== "0";

  /**
   * The report itself is drawn by src/replay-view.js — one renderer, shared
   * with the published site, which parses a `.rpl` a visitor drops on it and
   * has no business carrying a second copy of six hundred lines. What stays
   * here is the panel around it: where a replay comes from, the history list,
   * the re-run, the preferences.
   *
   * Its two formatters come back out because this panel prints times too, and a
   * match dated one way in the list and another in the report reads as two
   * different pages.
   */
  const VIEW = window.__cdcReplayView || null;
  const REPLAY_DATE = VIEW && VIEW.REPLAY_DATE;

  /**
   * When a match was played, or nothing at all.
   *
   * The formatter is `replay-view.js`'s, and that file not loading is a state
   * the rest of this panel survives by saying so and reading nothing. The
   * recents are the exception that has to survive it silently: they are drawn
   * during this file's own setup, before anything has been asked for, so an
   * unguarded `.format` there is a TypeError inside the module — and every
   * wiring line after it never runs, which is the whole options page and not
   * just this tab. A row that has lost its date still reads by map and names.
   */
  const playedOn = (at) => (at && REPLAY_DATE ? REPLAY_DATE.format(at) : "");

  function replayNote(text, bad = false) {
    replayStatusEl.textContent = text;
    replayStatusEl.classList.toggle("bad", Boolean(bad));
  }

  /**
   * How long each list of recents is.
   *
   * Long enough to hold an evening's worth of one, short enough that the list
   * stays a shortcut: the report is what this tab is for and it has to start on
   * the first screen, which a list that grew all year would end.
   */
  const RECENT_CAP = 12;

  /**
   * A list of recents, newest first, in `localStorage`.
   *
   * Beside the losses preference above, and for the same reason: this is a
   * handful of short strings somebody typed. `chrome.storage.local` is the
   * extension's expensive half — renders and harvests — and it is measured and
   * swept by the Storage tab, where a shortcut list has no business appearing.
   *
   * One helper serves both lists, because they differ only in what makes two
   * entries the same thing, which is what `idOf` says: a player is the whole
   * query (the same name on another ladder is another list), a replay is its
   * game id. Remembering is drop-then-unshift-then-cut, so a thing asked for
   * twice moves to the front instead of appearing twice.
   *
   * Everything read back is treated as a stranger, because a stored shape
   * outlives the code that wrote it — it is one version old the moment a field
   * is added here. An entry `idOf` cannot name is dropped on the next read
   * rather than drawn as a row with holes in it; that covers a half-written
   * entry and an entry from a shape that named itself differently. A stored
   * value that is not an array at all is started over.
   */
  function recentStore(key, idOf) {
    const name = (entry) => (entry && typeof entry === "object" ? String(idOf(entry) || "") : "");
    function read() {
      let raw = null;
      try {
        raw = localStorage.getItem(key);
      } catch (e) {
        // Storage can be denied outright (a locked-down profile) or full. Either
        // way the tab still reads replays, it just has no shortcuts, so this is
        // said out loud and not raised.
        console.warn("[cd-companion/options] cannot read " + key, e);
        return [];
      }
      if (!raw) return [];
      try {
        const stored = JSON.parse(raw);
        return Array.isArray(stored) ? stored.filter((entry) => name(entry)) : [];
      } catch (e) {
        console.warn("[cd-companion/options] " + key + " is not readable json — starting the list over", e);
        return [];
      }
    }
    function write(list) {
      try {
        localStorage.setItem(key, JSON.stringify(list));
      } catch (e) {
        console.warn("[cd-companion/options] cannot store " + key, e);
      }
      return list;
    }
    return {
      all: read,
      remember(entry) {
        const id = name(entry);
        if (!id) return read();
        return write([entry, ...read().filter((old) => name(old) !== id)].slice(0, RECENT_CAP));
      },
      // By the entry rather than by an id, so a caller never has to build one
      // the same way this file does.
      forget: (entry) => write(read().filter((old) => name(old) !== name(entry))),
    };
  }

  // Keyed by the name alone, though the entry carries the realm and the ladder
  // it was last asked with: the two of them are how the query is restored, not
  // what makes it a different query to a reader. Keyed by all three, asking
  // 1v1 and then 2v2 about one player wrote two chips reading `player_a` —
  // identical to the eye, and the list of shortcuts is a list to be scanned.
  const recentPlayers = recentStore("cdc.replay.players", (entry) =>
    entry.name ? String(entry.name).toLowerCase() : ""
  );
  const recentReplays = recentStore("cdc.replay.recent", (entry) => entry.gameId || "");

  /**
   * Set a select, or leave it where it stands.
   *
   * A stored realm or ladder that has since been renamed away would otherwise
   * blank the select — assigning an unknown value does exactly that — and a
   * blank select asks a different ladder without saying so.
   */
  function pickOption(select, value) {
    if (value && [...select.options].some((option) => option.value === value)) select.value = value;
  }

  /** The × that takes one remembered thing off its list. */
  function forgetButton(title, onForget) {
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "replayforget";
    drop.textContent = "×";
    drop.title = title;
    // The label is what it does, not the glyph: read aloud, a button named "×"
    // is the one control on the row nobody can tell apart from the next.
    drop.setAttribute("aria-label", title);
    drop.addEventListener("click", onForget);
    return drop;
  }

  /**
   * One column of a listed match.
   *
   * A row truncates rather than wraps (`.replaymatch` in src/replay-view.css) —
   * the two panes are half a page wide each — so the columns that can be cut
   * carry their own text as a tooltip, and nothing a row says needs a wider
   * window to be read. The date and the verdict are one width for every row and
   * are never cut, so they get none: a tooltip on every cell is a tooltip that
   * follows the pointer across a list nobody asked a question of.
   */
  function matchCell(className, text, tip = false) {
    const cell = document.createElement("span");
    cell.className = className;
    cell.textContent = text;
    if (tip && text) cell.title = text;
    return cell;
  }

  /**
   * Which panes are worth a strip of the page.
   *
   * Each holds what it was given and hides when it was given nothing, and the
   * strip itself goes when both are empty — a pane is a shortcut, and an empty
   * shortcut is a line the report starts lower by.
   */
  function syncReplayPanes() {
    replayRecentReplaysEl.hidden = !replayRecentListEl.childElementCount;
    replayFoundEl.hidden = !replayListEl.childElementCount && !replayRecentNamesEl.childElementCount;
    replayPanesEl.hidden = replayRecentReplaysEl.hidden && replayFoundEl.hidden;
  }

  /**
   * Both lists of recents, from what is stored.
   *
   * A remembered replay is drawn as one of the ladder's own rows — same columns
   * in the same order — because it stands in for exactly that row, and one match
   * written two ways reads as two kinds of match. The last column is the one it
   * cannot fill: who won is the ladder's answer about a name that was typed, and
   * this list is not asked about a name, so it states how long the match ran.
   */
  function renderRecents() {
    const players = recentPlayers.all();
    const replays = recentReplays.all();
    replayRecentNamesEl.textContent = "";
    for (const entry of players) {
      const chip = document.createElement("span");
      chip.className = "replayrecentname";
      const again = document.createElement("button");
      again.type = "button";
      again.className = "replayagain";
      again.textContent = entry.name;
      again.title = `Ask the ${entry.ladder || "same"} ladder on ${entry.realm || "the same realm"} for this player again.`;
      again.addEventListener("click", () => {
        // The realm and the ladder travel with the name: the same player has a
        // different history on each, so a click that restored only the box would
        // re-run a different query and say it was the one remembered.
        replayPlayerEl.value = entry.name;
        pickOption(replayRealmEl, entry.realm);
        pickOption(replayLadderEl, entry.ladder);
        loadReplayHistory();
      });
      chip.append(
        again,
        forgetButton("Forget this name.", () => {
          recentPlayers.forget(entry);
          renderRecents();
        })
      );
      replayRecentNamesEl.append(chip);
    }

    replayRecentListEl.textContent = "";
    for (const entry of replays) {
      const row = document.createElement("div");
      row.className = "replayrecentrow";
      const open = document.createElement("button");
      open.type = "button";
      open.className = "replaymatch" + (entry.gameId === replayOpen ? " active" : "");
      open.append(
        matchCell("replaywhen", playedOn(entry.played)),
        matchCell("replaymap", entry.map || "unnamed map", true),
        matchCell("replayvs", (Array.isArray(entry.sides) ? entry.sides : []).join(" vs "), true),
        matchCell("replayresult", entry.duration ? `${entry.duration}m` : "")
      );
      open.addEventListener("click", () => {
        pickOption(replayRealmEl, entry.realm);
        openReplay(entry.url || entry.gameId, null);
      });
      row.append(
        open,
        // A row is the shortcut and nothing else. What re-running the match
        // produced stays under its game id in `chrome.storage.local.sims` and is
        // not touched here — that is minutes of game time, and opening the same
        // replay again finds it merged back in. Which is what makes forgetting
        // one row safe to do on a single click, with nothing to confirm.
        forgetButton("Forget this replay. A re-run of it is kept.", () => {
          recentReplays.forget(entry);
          renderRecents();
        })
      );
      replayRecentListEl.append(row);
    }

    replayRecentPlayersEl.hidden = !players.length;
    syncReplayPanes();
  }

  /** One row per match in the listed history; clicking one opens it. */
  function renderReplayList() {
    replayListEl.textContent = "";
    for (const match of replayMatches) {
      const row = document.createElement("button");
      row.type = "button";
      row.className = "replaymatch" + (match.gameId === replayOpen ? " active" : "");
      row.append(
        matchCell("replaywhen", playedOn(match.timestamp)),
        matchCell("replaymap", match.map || "unnamed map", true),
        matchCell("replayvs", (match.opponents || []).map((o) => o.name).join(", "), true),
        matchCell("replayresult " + (match.result || ""), `${match.result || ""} · ${match.duration}m`)
      );
      // A match with no replay is one the host never kept — say so on the row
      // rather than letting a click fail.
      if (!match.replayUrl) {
        row.disabled = true;
        row.title = "no replay was kept for this match";
      } else {
        row.addEventListener("click", () => openReplay(match.replayUrl, match));
      }
      replayListEl.append(row);
    }
    replayListEl.hidden = !replayMatches.length;
    syncReplayPanes();
  }

  async function loadReplayHistory() {
    const player = replayPlayerEl.value.trim();
    if (!player) {
      replayNote("type a player's name first", true);
      return;
    }
    if (!window.__cdcLadder || !window.__cdcLadder.matchHistory) {
      replayNote("ladder.js did not load — no match history to read", true);
      return;
    }
    replayNote(`asking the ladder for ${player}…`);
    try {
      const matches = await window.__cdcLadder.matchHistory(player, {
        realm: replayRealmEl.value,
        type: replayLadderEl.value,
      });
      replayMatches = Array.isArray(matches) ? matches : [];
      renderReplayList();
      if (replayMatches.length) {
        // Remembered on an answer rather than on the ask: a name the ladder
        // knows nothing about is a typo far more often than it is a player, and
        // a list of typos is worse than no list.
        recentPlayers.remember({
          name: player,
          realm: replayRealmEl.value,
          ladder: replayLadderEl.value,
          at: Date.now(),
        });
        renderRecents();
      }
      replayNote(
        replayMatches.length
          ? `${replayMatches.length} matches — pick one`
          : "the ladder knows no recent matches for that name"
      );
    } catch (e) {
      console.warn("[cd-companion/options] match history failed", e);
      replayNote(`could not read that history: ${e.message}`, true);
    }
  }

  /**
   * Read a replay and show it.
   *
   * `match` is the ladder's own row for the same game when it came from the
   * list — it carries the result and the map title as the ladder states them,
   * which the replay file does not know (a replay ends when the recording ends,
   * not when a winner is declared).
   */
  async function openReplay(input, match = null) {
    if (!REPLAY || !VIEW) {
      replayNote(`${REPLAY ? "replay-view.js" : "replay.js"} did not load — nothing can be read`, true);
      return;
    }
    const found = REPLAY.locate(input, replayRealmEl.value);
    if (!found) {
      replayNote("that is not a replay link, a game page or a game id", true);
      return;
    }
    replayNote("reading the replay…");
    try {
      const { replay } = await REPLAY.load(found.url, replayRealmEl.value);
      replayOpen = replay.gameId || found.gameId;
      replayReport = REPLAY.analyze(replay);
      replayMatchRow = match;
      replayUrl = found.url;
      replaySourceNote = ""; // fetched, not handed over -- and a file may have left one
      replayFileText = ""; // nor is there a file to hand a re-run
      showReplay();
      rememberReplay(found);
      renderReplayList(); // the row that is open is marked as such
      renderRecents(); // and so is the remembered one, whichever list it came from
      replayNote("");
    } catch (e) {
      console.warn("[cd-companion/options] replay failed", e);
      replayNote(`could not read that replay: ${e.message}`, true);
      replayEmptyEl.hidden = false;
      replayEmptyEl.textContent = "Nothing was read. The message above says why.";
    }
  }

  /**
   * How big a file this page will try to read.
   *
   * A ladder replay is 50-150 KB and an exported report a little more; anything
   * of a different order is neither, and reading it would be a hung tab rather
   * than an error. The same guard the site's own drop carries.
   */
  const REPLAY_FILE_MAX = 25 * 1024 * 1024;

  /**
   * Which realm still serves this match, or none.
   *
   * A `.rpl` states its own game id on its header line and a replay host names a
   * file by exactly that id, so a file off disk can be matched back to the match
   * it recorded without asking the user which realm they play. Both are asked
   * because the id does not say.
   *
   * Measured 2026-08-31 ([[cd-power-and-production]]): a real EU game answers
   * `HEAD` 200 on `replays-eu` and 404 on `replays-sea`, and an id that is not a
   * game 404s on both -- so a miss is clean and the realm falls out of which one
   * answered. `HEAD`, so the ask costs a round trip and not a replay.
   *
   * Only the extension can ask at all: the hosts send no
   * `Access-Control-Allow-Origin`, and the host permission is what stands in for
   * one. The site, which has no such permission, is why the report renderer
   * takes a report and never a URL.
   *
   * **A network that is not there answers nothing rather than "no".** A throw is
   * treated as a miss, because all this decides is whether the re-run is offered
   * -- the report is drawn either way, and a failed probe must not look like a
   * failed read.
   */
  async function findReplayOnline(gameId) {
    if (!gameId || !REPLAY) return null;
    for (const realm of Object.keys(REPLAY.REPLAY_HOSTS)) {
      const url = `${REPLAY.REPLAY_HOSTS[realm]}/${gameId}.rpl`;
      try {
        const response = await fetch(url, { method: "HEAD" });
        if (response.ok) return { url, gameId, realm };
      } catch (e) {
        console.warn("[cd-companion/options] could not ask the replay host about", url, e);
      }
    }
    return null;
  }

  /**
   * A replay or a report that arrived as text rather than as a URL.
   *
   * Told apart by content and not by name, the way the site's drop already does
   * it: a browser renames a download the moment there are two of them
   * (`x (1).rpl`), and a report saved as `report.txt` is still a report. A
   * replay's first line is its header; JSON starts with a brace.
   *
   * **The match-back is what makes this more than a viewer.** A dropped replay
   * carries its own game id, so the probe above turns it back into the URL the
   * client would be booted with -- and Run the match, Export and the remembered
   * list then work on it exactly as on a fetched replay, because all three read
   * `replayOpen` and `replayUrl` and cannot tell where the report came from. A
   * file the hosts no longer serve is still a whole report; it loses the re-run
   * alone, and the status line says which of the two happened rather than
   * leaving a disabled button to be guessed at.
   *
   * The report is drawn **before** the hosts are asked. The parse is local and
   * instant, the probe is two round trips, and making the reader wait on the
   * network for a file it already holds would be the one thing reading from
   * disk was meant to avoid.
   */
  async function openReplayText(text, name) {
    if (!REPLAY || !VIEW) {
      replayNote(`${REPLAY ? "replay-view.js" : "replay.js"} did not load -- nothing can be read`, true);
      return;
    }
    let report;
    let source;
    try {
      if (text.trimStart().startsWith("{")) {
        const imported = REPLAY.importReport(text);
        report = imported.report;
        source = ["exported report", imported.extension ? `companion ${imported.extension}` : "", imported.exportedAt ? VIEW.REPLAY_DATE.format(imported.exportedAt) : ""]
          .filter(Boolean)
          .join(" - ");
      } else {
        report = REPLAY.analyze(REPLAY.parse(text));
        source = `from ${name}`;
      }
    } catch (e) {
      console.warn("[cd-companion/options] could not read that file", e);
      replayNote(`could not read ${name}: ${e.message}`, true);
      replayEmptyEl.hidden = false;
      replayEmptyEl.textContent = "Nothing was read. The message above says why.";
      return;
    }
    replayReport = report;
    replaySourceNote = source;
    replayMatchRow = null;
    replayOpen = report.gameId || "";
    replayUrl = "";
    // Kept only for a `.rpl`. An exported report is a report and not a replay:
    // the client cannot play one, and handing it over would be handing the
    // client JSON where it asked for a match.
    replayFileText = text.trimStart().startsWith("{") ? "" : text;
    showReplay();
    replayNote(`${name} -- read here on your machine. Asking the hosts whether the match is still there...`);

    const asked = replayOpen;
    const found = await findReplayOnline(asked);
    // The panel may have moved on while the hosts were being asked -- a second
    // file opened, a URL pasted -- and this answer is about the report that was
    // read, not about whatever is on screen now.
    if (replayOpen !== asked || replayReport !== report) return;
    if (!found) {
      replayNote(`${name} -- read. Neither host serves this match any more, so it cannot be re-run.`);
      return;
    }
    replayUrl = found.url;
    rememberReplay(found);
    renderReplayList(); // the row that is open is marked as such
    renderRecents();
    syncSimButton(); // there is a URL now, so the re-run is on offer
    replayNote(`${name} -- read, and the ${found.realm} host still has this match, so it can be re-run.`);
  }

  /**
   * The same, out of a file the user picked or let go on the panel.
   *
   * `file.text()` rather than a `FileReader`, which is what this page already
   * uses for a settings backup -- one way of reading a file per page.
   */
  function openReplayFile(file) {
    if (!file) return;
    if (file.size > REPLAY_FILE_MAX) {
      replayNote(`${file.name} is ${Math.round(file.size / 1024 / 1024)} MB -- that is not a replay`, true);
      return;
    }
    replayNote(`reading ${file.name}...`);
    file.text().then(
      (text) => openReplayText(text, file.name),
      (e) => {
        console.warn("[cd-companion/options] the browser could not read the file", e);
        replayNote(`the browser could not read ${file.name}: ${(e && e.message) || e}`, true);
      }
    );
  }

  /**
   * Keep this match one click away.
   *
   * Written after the read, not before it, so a URL that turned out to be
   * nothing is not remembered. It carries everything its row needs — the map,
   * both names, how long the match ran, when it was played — because the list is
   * drawn the moment the tab opens, before anything has been fetched.
   */
  function rememberReplay(found) {
    recentReplays.remember({
      gameId: replayOpen,
      url: found.url,
      realm: found.realm || replayRealmEl.value,
      map: replayReport.map || "",
      sides: (replayReport.players || []).map((player) => player.name),
      // Minutes, as the ladder's own rows state it — the report counts seconds.
      duration: Math.round(replayReport.duration / 60),
      played: replayReport.startedAt || 0,
      at: Date.now(),
    });
  }


  /**
   * The one line a report drawn without an object table needs, and the empty
   * string when there is one.
   *
   * Where the names and the pictures come from is the only thing a reader
   * cannot work out from a timeline full of `vehicle #9`, and it is the whole
   * of the answer: play a match once, the client hands its own table over, and
   * the rows fill in. Nothing to say once that has happened.
   *
   * **A match, not an open client.** The client has parsed its rules long
   * before the main menu, so the table exists earlier than this asks for — but
   * the harvest that reads it is fired at idle from a config push, which
   * regularly arrives while the client is still on its splash screen. The
   * attempt that reliably lands is the one at match start, and an instruction
   * that is right about what to do beats one that is right about the client.
   */
  function replayTypesNotice(host) {
    return host.__cdcReplayTypes
      ? ""
      : "Object names and pictures come from your own game — play a match once and these numbered rows fill in.";
  }

  /**
   * Draw whatever is known about the match on screen.
   *
   * Two sources, and the second one is optional: the file always, and a harvest
   * from re-running the match if there is one for this game id. The merge is
   * done here rather than at load so a run that finishes while the report is
   * open lands on it without re-fetching anything.
   */
  function showReplay() {
    if (!replayReport || !VIEW) return;
    const harvest = sims[replayReport.gameId];
    if (harvest && REPLAY && REPLAY.mergeSim) REPLAY.mergeSim(replayReport, harvest);
    replayReportEl.textContent = "";
    // A profile that has never had a game tab open has no object table, and the
    // timeline then reads `vehicle #9` down the column — deliberately, since a
    // row shown by its id is still a row. What that state needs is the sentence
    // that makes it a fixable complaint rather than a broken page. Written into
    // the paragraph this tab already explains itself in, which is the one under
    // the report, so it is read with the rows it is about.
    const notice = replayTypesNotice(window);
    replayEmptyEl.textContent = notice;
    replayEmptyEl.hidden = !notice;
    replayReportEl.append(
      VIEW.render(replayReport, {
        // Where the switch itself is drawn: in the report's own header, beside
        // the other two things that decide what the timeline shows. It used to
        // sit in the bar at the top of the tab, four controls away from the
        // rows it governs and next to the re-run — which is what it reads as
        // from there, a setting for the run rather than for the drawing.
        losses: showLosses,
        // The view redraws its own timeline; this is only so the answer
        // outlives the report it was given on.
        onLosses: (on) => {
          showLosses = on;
          localStorage.setItem(LOSSES_ITEM, on ? "1" : "0");
        },
        // Which clock the times are printed on, and what to do when the reader
        // picks another: kept here rather than in the view because it is a
        // preference, and a preference outlives the report it was set on.
        clock: replayClock,
        onClock: (mode) => {
          replayClock = mode;
          chrome.storage.local.set({ replayClock: mode });
          showReplay();
        },
        // The one fact the panel knows and the file does not: the ladder's own
        // row states the result from the point of view of the name that was
        // typed, and a report opened by pasting a URL has no such row. A report
        // that came off disk has no row either and has something else to say --
        // which file it was, or that it is an export somebody else's copy of
        // this extension wrote and when.
        note:
          replayMatchRow && replayMatchRow.result
            ? `${replayMatchRow.result} for ${replayPlayerEl.value.trim()}`
            : replaySourceNote,
      })
    );
    syncSimButton();
  }

  /**
   * Write the report on screen out as a file.
   *
   * The point of it is the half that cannot be reproduced anywhere else: the
   * companion site parses a replay perfectly well, and can never re-run one, so
   * a match that has been through a game tab only reaches a reader without the
   * extension as a file. What is written is the merged report — actions and
   * harvest — under the envelope src/replay.js stamps, and the site reads it
   * with the same file's `importReport`.
   *
   * The object URL is revoked on the next frame rather than immediately: the
   * click has to have started the download first, and a URL revoked in the same
   * tick has been observed to give an empty file.
   */
  function exportReplay() {
    if (!replayReport || !REPLAY) return;
    const version = (chrome.runtime.getManifest && chrome.runtime.getManifest().version) || "";
    const file = REPLAY.exportReport(replayReport, { extension: version, source: replayUrl });
    const blob = new Blob([JSON.stringify(file)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `cd-report-${replayReport.gameId || "match"}.json`;
    link.click();
    requestAnimationFrame(() => URL.revokeObjectURL(url));
    replayNote(
      replayReport.sim
        ? "saved — this one carries the re-run, so losses and credits travel with it"
        : "saved — actions only, since this match has not been re-run"
    );
  }

  /**
   * Is a run for this match going right now?
   *
   * `finishedAt` is not enough on its own, because the thing that writes it is
   * the tab doing the run: a tab that crashes writes nothing ever again, and the
   * button sat at `re-running… 99%` for ever with the match impossible to ask
   * for again (measured 2026-08-17 — the tab ran out of memory at tick 31 695 of
   * 32 130). A run writes its progress every 700 ms and its wait for the client
   * every three seconds, so silence past STALL_MS is a tab that is gone. The
   * same rule, and the same constant, as a render run's `runInFlight`.
   */
  const simRunning = () => {
    if (!(simState && simState.started && !simState.finishedAt && simState.gameId === replayOpen)) return false;
    return Date.now() - (simState.patchedAt || simState.started) < STALL_MS;
  };

  /**
   * A run that stopped answering, written off.
   *
   * The record is closed rather than left alone, so the state does not come back
   * on the next load looking like a run in flight, and so the page says what
   * happened instead of quietly re-enabling the button.
   */
  function buryStaleSim() {
    if (!simState || !simState.started || simState.finishedAt) return;
    if (Date.now() - (simState.patchedAt || simState.started) < STALL_MS) return;
    const far = simState.endTick ? ` at tick ${simState.tick} of ${simState.endTick}` : "";
    // What was actually saved before the tab went, which is the part the user
    // cares about: a run stores its harvest as it goes, so "the tab was lost"
    // and "you have nothing" stopped being the same sentence.
    const saved = sims[simState.gameId];
    const covers =
      saved && saved.endTick
        ? ` — the report covers ${Math.min(99, Math.floor((saved.tick / saved.endTick) * 100))}% of it, saved as the run went`
        : " — nothing of it was saved";
    chrome.storage.local.set({
      sim: {
        ...simState,
        finishedAt: Date.now(),
        // Not "it ran out of memory": measured 2026-08-17, the heap grew 68 MB
        // over a match against a 4192 MB ceiling, so what takes the tab is not
        // something this page has ever seen. It says what it knows.
        error: `the tab running it was lost${far}${covers}`,
      },
    });
  }

  /**
   * The button is the only thing on this page that goes stale on its own: every
   * other state changes when storage does, and a tab that died changes nothing.
   * So while a run is in flight the button re-reads itself, which is what turns
   * "stopped answering" into a note and a working button without the user
   * reloading the page.
   */
  let simWatch = null;
  function watchSim() {
    clearTimeout(simWatch);
    if (!simRunning()) {
      buryStaleSim();
      return;
    }
    simWatch = setTimeout(watchSim, 5000);
  }

  /**
   * Is the re-run *playing the match*, as opposed to sitting in a tab where the
   * client never came up?
   *
   * `started` is not that: the bridge writes it the moment the tab picks the job
   * out of storage, which is a second after the tab opens and minutes before the
   * client is in a match. Testing it is what stopped the nudge below from ever
   * firing on a replay run — the one path where the tab is opened straight onto
   * a match and left hidden. Ticks are the sign, and they only start once the
   * match is under way.
   */
  const simProgressing = () =>
    !!(simState && simState.started && (simState.tick > 0 || simState.finishedAt));

  function syncSimButton() {
    const has = !!(replayOpen && sims[replayOpen]);
    // **A URL, not only a report.** A re-run boots the client at
    // `#/replay/<url>` and the client fetches it there, so a report read off
    // disk whose match the hosts no longer serve has nothing to point the tab
    // at. It draws, exports and remembers like any other; it cannot be re-run,
    // and the title below is where that is said.
    replaySimEl.disabled = !replayOpen || (!replayUrl && !replayFileText) || !REPLAY || simRunning();
    if (simRunning()) {
      // Two states, and they used to read the same: a run whose client is still
      // booting has no ticks, and `re-running… 0%` said nothing about which of
      // the two minutes of silence this was.
      const done = simState.endTick ? Math.round((simState.tick / simState.endTick) * 100) : 0;
      replaySimEl.textContent = simState.tick ? `re-running… ${Math.min(99, done)}%` : "starting the client…";
    } else {
      replaySimEl.textContent = has ? "Re-run the match" : "Run the match";
    }
    // A report with nothing in it is not worth a file; anything on screen is.
    replayExportEl.disabled = !replayReport;
    replaySimEl.title =
      replayOpen && !replayUrl && replayFileText
        ? "Neither replay host serves this match any more, so the game tab is handed the file you opened " +
          "instead of fetching it. Everything else about the run is the same."
        : replayOpen && !replayUrl
        ? "This report was exported rather than recorded, so there is no replay to play through — a report " +
          "is what a run produces, not what it takes. Everything it states is already on screen."
        : has
          ? "Play this replay through again and read the counters afresh. The stored result is replaced."
          : "Play this replay through in a game tab and read what the file cannot state — losses, kills and credits. " +
            "Takes a few seconds per match; the tab is opened for it and closed after.";
    // Last, and unconditional: it keeps the button re-reading itself while a run
    // is going, and writes off one that has stopped answering.
    watchSim();
  }

  /**
   * Ask for this match to be re-run.
   *
   * Same shape as a render run (`askForRun`): the job goes into storage, the
   * worker opens a game tab — here pointed straight at the replay rather than at
   * the client's menu — and the bridge in that tab picks the job up when the page
   * says it is ready.
   *
   * The tab stays hidden, and the client boots there because src/frames.js keeps
   * the animation frames coming for the length of the boot. The nudge waits
   * SIM_NUDGE_MS — long enough not to undo a boot that is working — and is what
   * is left over for the case the pump does not cover — no network, a first run
   * still importing game files, a client that changed under the pump — and it
   * tests **ticks**, not that a tab picked the job up.
   */
  /**
   * Is the match open long enough to need a tab the browser really shows?
   *
   * The same threshold the run itself paces by (20 000 ticks): everything that
   * has ever finished in a hidden tab is under it, and the match that killed
   * seven of them is over it. `duration` is real seconds and `ticksPerSecond`
   * the rate it was played at, so the product is the tick count.
   */
  function longMatch() {
    if (!replayReport) return false;
    return (replayReport.duration || 0) * (replayReport.ticksPerSecond || 60) > 20000;
  }

  function askForSim() {
    if (!replayOpen || (!replayUrl && !replayFileText)) return;
    const gameId = replayOpen;
    /**
     * Where the game tab is pointed, and what it is handed when it gets there.
     *
     * A match the hosts still serve is a URL and nothing else — the client
     * fetches it itself, as it always has. A `.rpl` off disk whose match they no
     * longer serve is pointed at **the URL it would have had**, and the bytes
     * are handed over in the tab (src/replay-sim.js `answerReplayFetch`).
     *
     * The sentinel is that URL rather than something invented, because the
     * client checks the hostname against `replaysUrlWhitelist` before it fetches
     * anything: a URL off `.chronodivide.com` is refused by the client itself,
     * whatever answers it. So the route and the check are left exactly as they
     * are and only the answer comes from somewhere else.
     */
    const found = replayUrl ? { url: replayUrl } : REPLAY.locate(gameId, replayRealmEl.value);
    if (!found) return;
    const url = found.url;
    // The debug pace, in game ticks a second: empty leaves the run to its own
    // rule (paced over a long match, flat out under it), 0 is flat out whatever
    // the length. It travels with the job so the tab doing the work needs no
    // storage of its own to read it from.
    const typed = replayPaceEl.value.trim();
    const pace = typed === "" ? null : Math.max(0, Math.min(5000, Number(typed) || 0));
    chrome.storage.local.set({
      // The text rides with the job only when there is nothing to fetch. It is
      // 50-150 KB and the extension holds `unlimitedStorage`, but a copy of
      // every replay ever opened would still be a copy nobody asked for.
      sim: { at: Date.now(), requested: true, gameId, url, pace, text: replayUrl ? null : replayFileText },
      replayPace: typed,
    });
    replayNote(
      longMatch() && !replayShowEl.checked
        ? "starting the game client — this match is long enough that the run is done in front of you, " +
            "because a hidden tab does not survive it"
        : "starting the game client…"
    );
    syncSimButton();
    chrome.runtime.sendMessage(
      { type: "open-game-tab", url: "https://game.chronodivide.com/#/replay/" + encodeURIComponent(url) },
      (answer) => {
        const failed =
          (chrome.runtime.lastError && chrome.runtime.lastError.message) ||
          (answer && !answer.ok && answer.error) ||
          (!answer && "the extension's service worker did not answer");
        if (failed) {
          replayNote("could not open a game tab — " + failed, true);
          return;
        }
        // **A long match is run in front of you, because a hidden one dies.**
        // Measured 2026-08-17, after seven dead tabs: the same match, paced the
        // same way, in a tab the browser genuinely shows, played out to its end
        // at tick 32 092 of 32 130 with the heap ending where it started (1073
        // MB → 1069). Every hidden run of it grew 217 MB and lost the tab
        // between ticks 31 344 and 31 909 — telling the client the tab is
        // visible is not enough, because the frames it then draws are for a
        // compositor that never takes them. Short matches have never failed
        // hidden and are left alone; the checkbox forces it for those too.
        if (replayShowEl.checked || longMatch()) {
          chrome.runtime.sendMessage({ type: "show-game-tab", tabId: answer.tabId }, () => {
            void chrome.runtime.lastError;
          });
        }
        setTimeout(() => {
          if (!simProgressing()) {
            replayNote("the client is slow to start in a hidden tab — bringing it to the front");
            chrome.runtime.sendMessage({ type: "show-game-tab", tabId: answer.tabId }, () => {
              void chrome.runtime.lastError;
            });
          }
        }, SIM_NUDGE_MS);
      }
    );
  }


  // --- settings backup ------------------------------------------------------

  /**
   * One file that carries a keyboard from one browser to another.
   *
   * Four things go in it, and they come from two places. The extension's own
   * settings are items in chrome.storage and are read here. The game client's
   * are a hotkey file in its origin-private file system and a handful of `_r_*`
   * keys in its localStorage, and only a script running in a game tab can reach
   * either — so that half travels over the `settings` storage item, which the
   * bridge forwards and the game tab answers. See the item's shape in
   * src/bridge.js and the two stores in src/companion.js.
   *
   * The file is JSON on purpose rather than the client's own INI: it holds four
   * unrelated things and has to say which is which, and it has to be readable by
   * the person carrying it. `readable` exists for that reader alone — it is
   * written on the way out and ignored on the way in, so editing it changes
   * nothing and cannot silently disagree with the codes it describes.
   */
  const BACKUP_KIND = "cd-companion-settings";
  const BACKUP_VERSION = 1;

  /**
   * The extension's own items, in the two groups the tick boxes offer.
   *
   * Everything else in storage is deliberately absent: renders, maps, the cameo
   * sheet, harvested matches and the log are megabytes of pictures that the
   * other browser builds for itself, and carrying them would turn a settings
   * file into a disk image.
   */
  const BACKUP_ITEMS = {
    bindings: ["keys", "builds", "commandKeys", "chords", "taunts", "prefs"],
    // Not the sprite offsets. They were dialled once and are the shipped
    // default now (`SPRITE_FIX` in src/hq-preview.js) — carrying a copy per
    // profile made a measurement look like a preference, and a build without
    // the editor has nothing to put in the field anyway.
    notes: ["guides", "previewSrc", "spawnFix"],
  };

  /**
   * The client's own key names, copied from its `util/keyNames` so a backup
   * reads the way the game's own keyboard screen does.
   *
   * Only for the `readable` block — nothing is ever decided from a name.
   */
  const CLIENT_KEY_NAMES = new Map([
    [8, "Backspace"], [9, "Tab"], [12, "Clear"], [13, "Enter"], [19, "Pause/Break"],
    [20, "CapsLock"], [27, "Esc"], [32, "Space"], [33, "PageUp"], [34, "PageDown"],
    [35, "End"], [36, "Home"], [37, "ArrowLeft"], [38, "ArrowUp"], [39, "ArrowRight"],
    [40, "ArrowDown"], [44, "PrintScreen"], [45, "Insert"], [46, "Delete"],
    [91, "LeftWin"], [92, "RightWin"],
    [106, "Num*"], [107, "Num+"], [109, "Num-"], [110, "NumDel"], [111, "Num/"],
    [144, "NumLock"], [145, "ScrollLock"],
    [186, ";"], [187, "="], [188, ","], [189, "-"], [190, "."], [191, "/"],
    [192, "`"], [219, "["], [220, "\\"], [221, "]"], [222, "'"],
  ]);
  for (let i = 0; i < 10; i++) CLIENT_KEY_NAMES.set(96 + i, "Num" + i);
  for (let i = 1; i <= 32; i++) CLIENT_KEY_NAMES.set(111 + i, "F" + i);

  /**
   * The four numpad keys the client stores as arrows.
   *
   * `KeyBinds#getHotKeyCode` rewrites Num2/4/6/8 to the arrow they sit on and
   * sets bit 2048 to remember it did. Read the other way here, so the label says
   * the key that was actually pressed.
   */
  const CLIENT_NUMPAD_ARROWS = new Map([[40, 98], [37, 100], [39, 102], [38, 104]]);

  /** One of the client's hotkey codes, as the game itself would print it. */
  function clientKeyLabel(code) {
    const number = Number(code);
    if (!Number.isFinite(number)) return String(code);
    const parts = [];
    if (number & 512) parts.push("Ctrl");
    if (number & 1024) parts.push("Alt");
    if (number & 256) parts.push("Shift");
    if (number & 4096) parts.push("Win");
    let keyCode = number & 255;
    if (number & 2048) keyCode = CLIENT_NUMPAD_ARROWS.get(keyCode) || keyCode;
    parts.push(CLIENT_KEY_NAMES.get(keyCode) || String.fromCharCode(keyCode));
    return parts.join("+");
  }

  // What was read, what was loaded, and what the last import replaced. None of
  // the three survives the page: a backup is a file, and the undo snapshot is in
  // storage where an import that reloaded the tab can still find it.
  let backupRead = null;
  let backupLoaded = null;
  let lastSettingsJob = null;
  // The extension's half, held between the storage read and the game tab's
  // answer. One job at a time, which is what the buttons enforce.
  let pendingExtension = null;
  // Whether the write now in flight is putting a snapshot back rather than
  // laying one down. The two are the same operation to the game tab and the
  // opposite to this page: an undo consumes its snapshot instead of replacing it.
  let undoInFlight = false;

  function backupWant() {
    return {
      hotkeys: backupHotkeysEl.checked,
      gameOpts: backupGameOptsEl.checked,
      bindings: backupBindingsEl.checked,
      notes: backupNotesEl.checked,
    };
  }

  /** Which storage items the tick boxes ask for. */
  function backupItems(want) {
    return [
      ...(want.bindings ? BACKUP_ITEMS.bindings : []),
      ...(want.notes ? BACKUP_ITEMS.notes : []),
    ];
  }

  function countOf(value) {
    if (!value || typeof value !== "object") return 0;
    return Object.keys(value).length;
  }

  /**
   * What a backup holds, in lines a person can check against what they expected.
   *
   * Counts rather than contents: the contents are in the box below, and a list
   * of forty command names on the page is not a summary of anything.
   */
  function backupLines(file) {
    const lines = [];
    const game = file.game || {};
    for (const [name, table] of Object.entries(game.hotkeys || {})) {
      lines.push(`${name} — ${countOf(table)} binding(s)`);
    }
    if (countOf(game.prefs)) lines.push(`game options — ${countOf(game.prefs)} setting(s)`);
    const ext = file.extension || {};
    if (ext.keys) lines.push(`extension hotkeys — ${countOf(ext.keys)}`);
    if (ext.builds) {
      const total = Object.values(ext.builds).reduce((n, list) => n + (list ? list.length : 0), 0);
      lines.push(`build hotkeys — ${total} across ${countOf(ext.builds)} side(s)`);
    }
    if (ext.chords) lines.push(`chord layouts — ${countOf(ext.chords)} side(s)`);
    if (countOf(ext.taunts)) lines.push(`taunt keys — ${countOf(ext.taunts)} moved`);
    if (ext.prefs) lines.push(`extension options — ${countOf(ext.prefs)}`);
    if (countOf(ext.guides)) lines.push(`map guides — ${countOf(ext.guides)}`);
    const marks = countOf(ext.previewSrc) + countOf(ext.spawnFix);
    if (marks) lines.push(`per-map preview choices — ${marks}`);
    return lines;
  }

  function showBackupLines(el, file, head) {
    el.textContent = "";
    if (!file) return;
    const title = document.createElement("p");
    title.className = "backuphead";
    title.textContent = head;
    el.append(title);
    const list = document.createElement("ul");
    const lines = backupLines(file);
    if (!lines.length) lines.push("nothing — every section was left out");
    for (const line of lines) {
      const item = document.createElement("li");
      item.textContent = line;
      list.append(item);
    }
    el.append(list);
  }

  /** The file, from what the game tab answered and what storage holds. */
  function buildBackup(client, items, want) {
    const file = {
      kind: BACKUP_KIND,
      version: BACKUP_VERSION,
      at: new Date().toISOString(),
      from: { extension: chrome.runtime.getManifest().version },
    };
    if (want.hotkeys || want.gameOpts) {
      file.game = {};
      if (want.hotkeys) file.game.hotkeys = (client && client.hotkeys) || {};
      if (want.gameOpts) file.game.prefs = (client && client.prefs) || {};
    }
    const ext = {};
    for (const [key, value] of Object.entries(items || {})) {
      if (value && typeof value === "object" && Object.keys(value).length) ext[key] = value;
    }
    if (Object.keys(ext).length) file.extension = ext;
    if (file.game && file.game.hotkeys) {
      // Written last, from the codes that are already in the file, so the two
      // cannot describe different keys.
      file.readable = {};
      for (const [name, table] of Object.entries(file.game.hotkeys)) {
        const readable = {};
        for (const [command, code] of Object.entries(table)) readable[command] = clientKeyLabel(code);
        file.readable[name] = readable;
      }
    }
    return file;
  }

  function backupFileName() {
    const d = new Date();
    return `cd-settings-${fmtDate(d.getTime()).replace(/-/g, "")}.json`;
  }

  function backupSay(text) {
    backupStatusEl.textContent = text;
  }

  /**
   * Ask the game tab for the client's half.
   *
   * The request is a storage write, for the same reason a render run's is: it is
   * the only thing this page and a game tab share. `ensureGameTab` is what gets
   * one listening when nothing does.
   */
  function askForSettings(mode, payload) {
    const want = backupWant();
    const need = mode === "write" || want.hotkeys || want.gameOpts;
    if (!need) return false;
    chrome.storage.local.set({
      settings: {
        at: Date.now(),
        requested: mode,
        want: { hotkeys: want.hotkeys, prefs: want.gameOpts },
        payload: payload || null,
        done: false,
      },
    });
    ensureGameTab({
      say: backupSay,
      started: () => !!(lastSettingsJob && lastSettingsJob.started),
      // A settings job has no half-way: it is waiting for the client or it has
      // answered. So "is it moving" is "has a tab taken it", and the nudge is
      // the whole of what stands between a hidden tab and a job that never ends.
      progressing: () => !!(lastSettingsJob && lastSettingsJob.started),
    });
    return true;
  }

  function readBackup() {
    const want = backupWant();
    if (!want.hotkeys && !want.gameOpts && !want.bindings && !want.notes) {
      backupSay("nothing is ticked");
      return;
    }
    backupRead = null;
    backupSaveEl.disabled = true;
    backupCopyEl.disabled = true;
    backupSummaryEl.textContent = "";
    chrome.storage.local.get(backupItems(want), (items) => {
      if (chrome.runtime.lastError) {
        backupSay("could not read the extension's own settings — " + chrome.runtime.lastError.message);
        return;
      }
      if (!want.hotkeys && !want.gameOpts) {
        // Nothing of the client's was asked for, so no game tab is needed and
        // none is opened: the extension's half is in storage right here.
        finishRead(buildBackup(null, items, want));
        return;
      }
      backupSay("reading the game's own settings…");
      pendingExtension = items;
      askForSettings("read", null);
    });
  }

  function finishRead(file) {
    backupRead = file;
    backupTextEl.value = JSON.stringify(file, null, 2);
    backupSaveEl.disabled = false;
    backupCopyEl.disabled = false;
    showBackupLines(backupSummaryEl, file, "Read from this browser:");
    backupSay("read — save it to a file, or copy it out of the box below");
  }

  function saveBackup() {
    if (!backupRead) return;
    // Same shape as the replay export: the click has to have started the
    // download before the URL is revoked, so the revoke waits a tick.
    const blob = new Blob([JSON.stringify(backupRead, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = backupFileName();
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    backupSay("saved as " + link.download);
  }

  /**
   * What a loaded file has to be before anything is written from it.
   *
   * A file picker will hand over anything at all, and the two halves of an
   * import write into the game's own configuration. So the shape is checked
   * here, once, and the game tab checks the hotkey names again against the
   * client that will have to read them.
   */
  function parseBackup(text) {
    let file;
    try {
      file = JSON.parse(text);
    } catch (e) {
      throw new Error("that is not JSON — " + e.message);
    }
    if (!file || typeof file !== "object" || Array.isArray(file)) {
      throw new Error("that is JSON, but not a backup");
    }
    if (file.kind !== BACKUP_KIND) {
      throw new Error(`that file says it is "${file.kind || "nothing in particular"}", not a settings backup`);
    }
    if (Number(file.version) > BACKUP_VERSION) {
      throw new Error(
        `that backup was written by a newer version of the extension (format ${file.version}) — update this one first`
      );
    }
    return file;
  }

  function takeBackup(text, from) {
    try {
      backupLoaded = parseBackup(text);
    } catch (e) {
      backupLoaded = null;
      backupApplyEl.disabled = true;
      backupLoadedEl.textContent = "";
      backupLoadStatusEl.textContent = e.message;
      return;
    }
    backupApplyEl.disabled = false;
    showBackupLines(backupLoadedEl, backupLoaded, `Loaded from ${from}:`);
    const when = backupLoaded.at ? new Date(backupLoaded.at) : null;
    backupLoadStatusEl.textContent =
      "written " +
      (when && !isNaN(when) ? fmtDateTime(when.getTime()) : "at an unrecorded time") +
      (backupLoaded.from && backupLoaded.from.extension
        ? ` by extension ${backupLoaded.from.extension}`
        : "") +
      " — nothing is written until you apply it";
  }

  /**
   * Put a loaded backup back.
   *
   * The extension's half is written here and the client's is sent to a game tab,
   * which answers with what it found before overwriting it. Both halves of the
   * undo snapshot are stored under `settingsUndo`, and the extension's half is
   * snapshotted before it is written for the same reason: an undo has to be what
   * was actually there.
   */
  function applyBackup() {
    if (!backupLoaded) return;
    const want = backupWant();
    const file = backupLoaded;
    const ext = file.extension || {};
    const items = backupItems(want).filter((key) => key in ext);
    backupApplyEl.disabled = true;
    backupUndoEl.hidden = true;

    chrome.storage.local.get(items, (before) => {
      if (chrome.runtime.lastError) {
        backupLoadStatusEl.textContent =
          "could not read what is here now, so nothing was changed — " + chrome.runtime.lastError.message;
        backupApplyEl.disabled = false;
        return;
      }
      const patch = {};
      for (const key of items) patch[key] = ext[key];
      // An item the import *creates* has no earlier value to put back, so undo
      // has to delete it rather than leave it standing. `get` answers with the
      // keys that exist, so the difference between what was asked for and what
      // came back is that list.
      const added = items.filter((key) => !(key in before));
      const undo = { at: Date.now(), extension: before, added, client: null };
      // The snapshot first and the settings after it: an import that dies
      // between the two has changed nothing, and one that dies after them can
      // still be undone.
      chrome.storage.local.set({ settingsUndo: undo }, () => {
        chrome.storage.local.set(patch, () => afterExtension());
      });

      function afterExtension() {
        const game = file.game || {};
        const sending = (want.hotkeys && countOf(game.hotkeys)) || (want.gameOpts && countOf(game.prefs));
        const wrote = items.length ? `${items.length} of the extension's own settings` : "";
        if (!sending) {
          backupLoadStatusEl.textContent = wrote
            ? `applied ${wrote}. Nothing of the game's own was in the file, or it was not ticked.`
            : "nothing was applied — the file holds none of the sections that are ticked";
          backupUndoEl.hidden = !items.length;
          backupApplyEl.disabled = false;
          return;
        }
        backupLoadStatusEl.textContent = wrote
          ? `applied ${wrote} — now writing the game's own…`
          : "writing the game's own settings…";
        askForSettings("write", {
          hotkeys: want.hotkeys ? game.hotkeys || {} : {},
          prefs: want.gameOpts ? game.prefs || {} : {},
        });
      }
    });
  }

  function undoImport() {
    chrome.storage.local.get({ settingsUndo: null }, (data) => {
      const undo = data.settingsUndo;
      if (!undo) {
        backupLoadStatusEl.textContent = "there is nothing to undo";
        backupUndoEl.hidden = true;
        return;
      }
      backupUndoEl.hidden = true;
      chrome.storage.local.remove(undo.added || [], () => {
        void chrome.runtime.lastError; // removing a key that is not there is not a failure
        chrome.storage.local.set(undo.extension || {}, () => {
          if (!undo.client) {
            chrome.storage.local.remove("settingsUndo");
            backupLoadStatusEl.textContent = "put back what the extension held before the import";
            return;
          }
          undoInFlight = true;
          backupLoadStatusEl.textContent = "putting the game's own settings back…";
          askForSettings("write", { hotkeys: undo.client.hotkeys || {}, prefs: undo.client.prefs || {} });
        });
      });
    });
  }

  function renderSettingsJob(job) {
    lastSettingsJob = job || null;
    if (!job || !job.done) return;
    if (!job.ok) {
      const message = job.error || "the game tab did not say why";
      if (job.mode === "write") {
        backupLoadStatusEl.textContent =
          (undoInFlight ? "the game's own settings were not put back — " : "the game's own settings were not written — ") +
          message;
        // The snapshot is left where it is: a failed undo is one to try again.
        if (undoInFlight) backupUndoEl.hidden = false;
        undoInFlight = false;
        backupApplyEl.disabled = !backupLoaded;
      } else {
        backupSay("could not read the game's own settings — " + message);
        pendingExtension = null;
      }
      return;
    }
    if (job.mode === "write") {
      const report = job.report || {};
      const files = (report.files || []).map((f) => `${f.name} (${f.count})`).join(", ");
      const parts = [];
      if (files) parts.push("wrote " + files);
      if (report.prefs) parts.push(`${report.prefs} game option(s)`);
      if ((report.unknown || []).length) {
        parts.push(
          `${report.unknown.length} binding(s) this client has no command for and did not take: ` +
            report.unknown.join(", ")
        );
      }
      for (const line of report.notes || []) parts.push(line);
      if (report.reload) {
        parts.push("the client reads these once, at start-up, so reload the game tab if one is open");
      }
      backupApplyEl.disabled = !backupLoaded;
      if (undoInFlight) {
        // An undo spends its snapshot rather than laying a new one down. Keeping
        // it would leave the button offering to put the import *back*, under a
        // word that says the opposite.
        undoInFlight = false;
        chrome.storage.local.remove("settingsUndo");
        backupUndoEl.hidden = true;
        backupLoadStatusEl.textContent = "put back — " + (parts.join(" — ") || "nothing was written");
        return;
      }
      backupLoadStatusEl.textContent = parts.join(" — ") || "nothing was written";
      // What the tab displaced, joined to the extension half taken before it.
      if (job.previous) {
        chrome.storage.local.get({ settingsUndo: null }, (data) => {
          const undo = data.settingsUndo || { at: Date.now(), extension: {} };
          chrome.storage.local.set({ settingsUndo: { ...undo, client: job.previous } }, () => {
            backupUndoEl.hidden = false;
          });
        });
      }
      return;
    }
    if (!pendingExtension) return; // an answer to a read this page did not start
    const items = pendingExtension;
    pendingExtension = null;
    finishRead(buildBackup(job.data, items, backupWant()));
  }

  backupReadEl.addEventListener("click", readBackup);
  backupSaveEl.addEventListener("click", saveBackup);
  backupCopyEl.addEventListener("click", () => {
    if (!backupTextEl.value) return;
    navigator.clipboard.writeText(backupTextEl.value).then(
      () => backupSay("copied — paste it into the same box in the other browser"),
      (e) => backupSay("could not copy it: " + ((e && e.message) || e))
    );
  });
  backupFileEl.addEventListener("change", () => {
    const file = backupFileEl.files && backupFileEl.files[0];
    if (!file) return;
    file.text().then(
      (text) => {
        backupTextEl.value = text;
        takeBackup(text, file.name);
      },
      (e) => (backupLoadStatusEl.textContent = "could not read that file: " + ((e && e.message) || e))
    );
  });
  backupPasteLoadEl.addEventListener("click", () => {
    if (!backupTextEl.value.trim()) {
      backupLoadStatusEl.textContent = "the box is empty";
      return;
    }
    takeBackup(backupTextEl.value, "the box below");
  });
  backupApplyEl.addEventListener("click", applyBackup);
  backupUndoEl.addEventListener("click", undoImport);

  // --- start ----------------------------------------------------------------

  // The ladder panels, before the ones written out in the markup: the tabs are
  // built from the panels that exist, so this is also the tab order. Each goes
  // before the same fixed node rather than before whatever is currently first,
  // which would insert them in reverse.
  const firstStaticPanel = panelsEl.firstChild;
  Object.keys(LADDERS).forEach((type) => {
    ladders[type] = buildPanel(type);
    panelsEl.insertBefore(ladders[type].el, firstStaticPanel);
  });
  buildTabs();

  // The replays tab asks the same service the ladder tabs do, so it offers the
  // same realms and ladders — built from the same tables rather than written out
  // again, or a realm added in one place would be missing in the other.
  for (const [key, realm] of Object.entries(REALMS)) {
    replayRealmEl.append(new Option(realm.label, key));
  }
  for (const [key, ladder] of Object.entries(LADDERS)) {
    replayLadderEl.append(new Option(ladder.label, key));
  }
  /**
   * Set every copy of "Always run in a visible tab", and store it.
   *
   * Stored on change rather than when a run starts, which is what it used to
   * be: ticking the box and never starting one saved nothing, so the setting
   * came back unticked and read as a control that does not work.
   */
  function setVisibleRun(on, store) {
    visibleRunEls.forEach((el) => (el.checked = on));
    if (store) chrome.storage.local.set({ replayShow: on });
  }
  const visibleRun = () => replayShowEl.checked;
  visibleRunEls.forEach((el) =>
    el.addEventListener("change", () => setVisibleRun(el.checked, true))
  );
  replayGoEl.addEventListener("click", () => openReplay(replayInputEl.value, null));
  replayInputEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") openReplay(replayInputEl.value, null);
  });
  replayFileEl.addEventListener("change", () => {
    openReplayFile(replayFileEl.files && replayFileEl.files[0]);
    // Cleared so picking the same file twice fires a change the second time --
    // otherwise re-opening a file after a failed read does nothing at all.
    replayFileEl.value = "";
  });

  /**
   * A file let go anywhere on the Replays tab, and a file pasted onto it.
   *
   * **On the document, gated on the tab.** A drop two pixels outside the input
   * navigates the browser to the file, which loses the options page and
   * everything unsaved on it -- so the whole document has to swallow the drop.
   * It must not swallow one meant for the settings-backup input on another tab,
   * hence `activeTab`: this page has two file inputs and they belong to
   * different panels.
   *
   * `dragover` is what has to be prevented for a drop to arrive at all; the
   * browser reads the absence of a preventDefault as "not a drop target here"
   * and navigates instead.
   */
  const onReplaysTab = () => activeTab === "replays";
  for (const type of ["dragenter", "dragover"]) {
    document.addEventListener(type, (event) => {
      if (onReplaysTab()) event.preventDefault();
    });
  }
  document.addEventListener("drop", (event) => {
    if (!onReplaysTab()) return;
    event.preventDefault();
    const file = event.dataTransfer && event.dataTransfer.files && event.dataTransfer.files[0];
    if (file) openReplayFile(file);
  });
  document.addEventListener("paste", (event) => {
    if (!onReplaysTab()) return;
    // Not while the reader is typing into one of this tab's own boxes: a game id
    // pasted into the link field is a paste, and reading it as a replay would
    // take the field's own Enter away from it.
    const into = event.target;
    if (into && (into.tagName === "INPUT" || into.tagName === "TEXTAREA" || into.isContentEditable)) return;
    const files = (event.clipboardData && event.clipboardData.files) || [];
    if (files.length) {
      openReplayFile(files[0]);
      return;
    }
    // A pasted report is text; a pasted replay is text too -- a `.rpl` is header
    // lines and base64 and survives a clipboard -- so both are tried, and
    // anything that is neither is left to whatever else wanted the paste.
    const text = (event.clipboardData && event.clipboardData.getData("text")) || "";
    if (text.trimStart().startsWith("{") || /^\s*RA2TSREPL/.test(text)) openReplayText(text, "the clipboard");
  });
  // The cameo harvest, on the Replays tab because the timeline's pictures are
  // what it feeds. It lived under the sprite-alignment header until 0.78.0,
  // which is a place nobody would look for it: the button is not on that tab,
  // and cutting that section for the public build would have cut this with it.
  //
  // `askForRun` spends its first seconds finding out whether a game tab is
  // listening, and a button that goes quiet reads as broken — so it says so
  // before it asks. No maps: the run's other half is the client itself, and
  // this asks for only that half, which is why startBulk had to stop treating
  // an empty map list as "nothing was ticked".
  // Long enough to read a finished run's summary, short enough that the slot is
  // empty again by the time anyone comes back to this tab.
  const HARVEST_FADE_MS = 8000;
  let harvestFadeTimer = null;

  /**
   * The harvest's status line: what a run is doing, and then nothing.
   *
   * It used to be written and left, so a sheet harvested once sat in the bar for
   * the life of the page — a label, not a status, and the durable fact it stood
   * for now lives on the button instead.
   */
  function harvestSay(text) {
    clearTimeout(harvestFadeTimer);
    harvestStatusEl.textContent = text;
    if (!text) return;
    const fade = () => {
      // Not while a run is still talking: its lines arrive seconds apart, and a
      // slot that empties between them reads as a run that stopped.
      if (runInFlight()) {
        harvestFadeTimer = setTimeout(fade, HARVEST_FADE_MS);
        return;
      }
      // Only if it is still the message being cleared — anything said in the
      // meantime has its own life.
      if (harvestStatusEl.textContent === text) harvestStatusEl.textContent = "";
    };
    harvestFadeTimer = setTimeout(fade, HARVEST_FADE_MS);
  }

  /**
   * `Harvest` the first time, `Re-harvest` after.
   *
   * Whether this profile holds the player's own art is a fact about the profile
   * rather than about a run, so it belongs where it is legible without one
   * having just finished — and the status line is then free to fade.
   */
  function syncHarvestButton(sheet) {
    const held = !!(sheet && sheet.sheet && sheet.index);
    harvestGoEl.textContent = held ? "Re-harvest cameos" : "Harvest cameos";
  }

  harvestGoEl.addEventListener("click", () => {
    if (runInFlight()) {
      harvestSay("a run is already going — wait for it to finish");
      return;
    }
    harvestSay("asking a game tab for the client's own art…");
    askForRun([], { harvest: true });
  });
  replayHistoryEl.addEventListener("click", loadReplayHistory);
  replaySimEl.addEventListener("click", askForSim);
  replayExportEl.addEventListener("click", exportReplay);
  replayPlayerEl.addEventListener("keydown", (e) => {
    if (e.key === "Enter") loadReplayHistory();
  });
  replayListEl.hidden = true; // nothing listed until a history is asked for
  renderRecents(); // the recents, though, are the one thing this tab knows before it is asked anything
  replayEmptyEl.hidden = false;
  replayEmptyEl.textContent = REPLAY
    ? "Paste a game page, a replay link or a game id — or list a player's recent matches and pick one."
    : "replay.js did not load, so no replay can be read.";

  if (!Object.keys(ladders).length) {
    // Nothing to sample and nothing to name a tab after. Worth saying out loud:
    // the symptom otherwise is a page that has quietly lost half its sections.
    const warning = document.createElement("span");
    warning.className = "count";
    warning.textContent = "ladder.js did not load — the ladder tabs are missing";
    tabsEl.append(warning);
  }

  chrome.storage.local.get(
    {
      maps: {},
      renders: {},
      guides: {},
      evicted: null,
      keys: {},
      builds: {},
      commandKeys: [],
      commands: {},
      chords: {},
      taunts: {},
      roster: {},
      colours: {},
      prefs: {},
      previewSrc: {},
      spawnFix: {},
      spriteFix: {},
      spriteFixByName: {},
      appearance: {},
      pools: null,
      pool: null,
      bulk: null,
      cameos: null,
      replayTypes: null,
      sims: {},
      sim: null,
      settings: null,
      settingsUndo: null,
      replayClock: "real",
      replayPace: "",
      // On by default. A hidden tab is throttled hard enough that the run is
      // brought forward anyway once it looks stuck, so the choice is really
      // between watching it from the start and watching it from halfway. A
      // value already stored wins, so an install that answered `false` keeps it.
      replayShow: true,
      log: [],
    },
    (data) => {
      if (chrome.runtime.lastError) {
        tabsEl.textContent = "Could not read storage: " + chrome.runtime.lastError.message;
        return;
      }
      maps = data.maps;
      replayClock = data.replayClock || "real";
      replayPaceEl.value = data.replayPace || "";
      setVisibleRun(!!data.replayShow, false);
      renders = data.renders;
      guides = data.guides;
      evicted = data.evicted;
      keys = data.keys;
      builds = data.builds || {};
      commandKeys = Array.isArray(data.commandKeys) ? data.commandKeys : [];
      commands = data.commands || {};
      chords = migrateChords(data.chords || {});
      taunts = data.taunts || {};
      roster = data.roster || {};
      colours = data.colours || {};
      // The harvested sheet, on `window` before anything that draws a cameo
      // runs. Nothing has set it already — no sheet ships — so a profile that
      // has never harvested leaves it unset, and every reader of it treats that
      // as "draw words" rather than as an error.
      //
      // Overwritten wholesale rather than merged: the two are different sheets
      // with different cell numbering, and an index from one against the pixels
      // of the other draws the wrong picture for every id rather than failing.
      if (data.cameos && data.cameos.sheet && data.cameos.index) {
        window.__cdcCameos = data.cameos;
      }
      // The object table travels the same road and lands in the same place: on
      // `window`, before the first thing that draws a name off it runs. Nothing
      // is redrawn from here — this is the load, so nothing has been drawn yet.
      installReplayTypes(data.replayTypes, window);
      syncHarvestButton(data.cameos);
      prefs = { ...DEFAULT_PREFS, ...data.prefs };
      appearance = data.appearance || {};
      renderTunePanel();
      // One setting used to answer for the game and for this page both. An
      // install that had chosen keeps that choice on both halves rather than
      // having this one snap back to the default the moment they came apart.
      // Written back, not seeded per load: once they are separate, this page's
      // copy has to be able to stop following the game's.
      const stored = data.prefs || {};
      if (stored.cardPreferHq === undefined || stored.viewerIcons === undefined) {
        if (stored.cardPreferHq === undefined) prefs.cardPreferHq = prefs.preferHqPreview;
        if (stored.viewerIcons === undefined) prefs.viewerIcons = prefs.fullIcons !== false;
        chrome.storage.local.set({ prefs });
      }
      previewSrc = data.previewSrc || {};
      spawnFix = data.spawnFix || {};
      spriteFix = data.spriteFix || {};
      spriteFixByName = data.spriteFixByName || {};
      pools = data.pools || {};
      logEntries = Array.isArray(data.log) ? data.log : [];
      sims = data.sims || {};
      simState = data.sim || null;
      // A job left in flight by a page that was closed, and the snapshot of
      // an import — which outlives the page on purpose, since an import that
      // reloads the game tab is one you may want to undo minutes later.
      renderSettingsJob(data.settings);
      backupUndoEl.hidden = !data.settingsUndo;
      // A pool stored before there were two ladders to tell apart. It carries
      // its own `type` — always "1v1", the only one that existed — so it moves
      // into the slot it already belonged in rather than being re-sampled.
      if (data.pool && data.pool.maps) {
        const type = LADDERS[data.pool.type] ? data.pool.type : "1v1";
        if (!pools[type]) pools = { ...pools, [type]: data.pool };
        chrome.storage.local.set({ pools }, () => chrome.storage.local.remove("pool"));
      }
      syncPrefsUi();
      Object.values(ladders).forEach((p) => {
        const pool = pools[p.type];
        if (pool && pool.realm && REALMS[pool.realm]) p.realmEl.value = pool.realm;
        // The pool box is folded by default — it is set up once and then read
        // back rarely. A ladder with no sample yet has nothing to fold away,
        // though, and *Find ladder maps* is inside it: folded, the empty list
        // below would be pointing at a button the page is hiding.
        p.boxEl.open = !pool;
      });
      renderKeys();
      renderBuilds();
      renderCommands();
      renderChords();
      renderTaunts();
      // Before the pools: a run left going in another tab is what decides
      // whether *Render ticked* is available at all.
      renderBulk(data.bulk);
      Object.values(ladders).forEach(renderPool);
      showTab(localStorage.getItem(TAB_ITEM) || Object.keys(ladders)[0] || "overlay");
    }
  );

  // A game running in another tab can add a map, or a render, while this page
  // is open.
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    if (changes.maps) maps = changes.maps.newValue || {};
    if (changes.renders) renders = changes.renders.newValue || {};
    // Written by the bridge when the cap threw something away, so the Stored
    // maps tab can say so instead of the render just being gone.
    if (changes.evicted) {
      evicted = changes.evicted.newValue || null;
      if (activeTab === "stored") refreshStored();
    }
    if (changes.prefs) {
      prefs = { ...DEFAULT_PREFS, ...(changes.prefs.newValue || {}) };
      syncPrefsUi();
      paintLightboxIcons();
    }
    // The in-game panel mirrors these dials over a live radar, so this is how a
    // slider dragged mid-match reaches the page. Repaints rather than
    // re-renders: the global pair is a filter and the per-type ones only decide
    // what the *next* render bakes.
    if (changes.appearance) {
      appearance = changes.appearance.newValue || {};
      renderTunePanel();
      applyGlobalFilter();
    }
    // A game tab narrating a run writes this several times a second; repainting
    // a panel nobody is looking at is the one cost worth avoiding here.
    if (changes.settings) renderSettingsJob(changes.settings.newValue);
    if (changes.tauntWav) onTauntWavJob(changes.tauntWav.newValue);
    if (changes.log) {
      logEntries = changes.log.newValue || [];
      if (activeTab === "log") renderLog();
    }
    // The roster is written by a game tab, which may well be opened *after*
    // this page — the panel would otherwise sit on its empty state until a
    // reload, telling someone who has just done the thing it asked for that
    // they have not done it.
    if (changes.roster) {
      roster = changes.roster.newValue || {};
      renderBuilds();
      renderChords();
    }
    // The colour table arrives the same way and for the same reason: a game tab
    // opened after this page harvests it, and the pickers would otherwise hold
    // their empty state until a reload.
    if (changes.colours) {
      colours = changes.colours.newValue || {};
      renderRecolour();
    }
    // The command list arrives on the terms of the two above: harvested by a
    // game tab that may well be opened after this page.
    if (changes.commands) {
      commands = changes.commands.newValue || {};
      renderCommands();
    }
    // Another options tab editing the same profiles.
    if (changes.builds) {
      builds = changes.builds.newValue || {};
      renderBuilds();
      // A build key that has just moved onto a command's key changes what that
      // row has to say about itself.
      renderCommands();
    }
    if (changes.commandKeys) {
      commandKeys = changes.commandKeys.newValue || [];
      renderCommands();
    }
    if (changes.chords) {
      chords = changes.chords.newValue || {};
      renderChords();
    }
    if (changes.taunts) {
      taunts = changes.taunts.newValue || {};
      renderTaunts();
    }
    if (changes.previewSrc) previewSrc = changes.previewSrc.newValue || {};
    if (changes.spawnFix) spawnFix = changes.spawnFix.newValue || {};
    // Only what this page can no longer be the sole author of: another options
    // tab can be open on the same offsets. The panel is not repainted from it —
    // that would take the numbers out from under a measurement in progress.
    if (changes.spriteFix) spriteFix = changes.spriteFix.newValue || {};
    if (changes.spriteFixByName) spriteFixByName = changes.spriteFixByName.newValue || {};
    // Both ladders, not just the tab on screen: a pool row now states what the
    // catalogue holds of it, so a render landing mid-run makes every pool list
    // that names that map out of date, and a run renders one ladder's pool while
    // the other tab is the one being looked at.
    if (changes.maps || changes.renders) Object.values(ladders).forEach(renderPool);
    // A map catalogued while this page is open is a map that can now be sampled.
    if (changes.maps || changes.renders || changes.prefs || changes.previewSrc || changes.spawnFix) {
      render();
    }
    if (changes.pools) {
      pools = changes.pools.newValue || {};
      Object.values(ladders).forEach(renderPool);
      render();
    }
    // A run reports its progress by rewriting this item, so every step of it
    // arrives here — this page never polls the game tab.
    if (changes.bulk) renderBulk(changes.bulk.newValue);
    // A harvest finishing in the game tab lands here. Redrawn rather than left
    // for the next page load: the run that fetched these pictures was started
    // from this page, so the page that asked is the one watching for them.
    if (changes.cameos) {
      const sheet = changes.cameos.newValue;
      if (sheet && sheet.sheet && sheet.index) {
        window.__cdcCameos = sheet;
        harvestSay(`${Object.keys(sheet.index).length} ids, ${sheet.pictures} pictures`);
        syncHarvestButton(sheet);
        renderKeys();
        renderBuilds();
        renderChords();
        if (replayReport) showReplay();
      }
    }
    // And so does the object table, harvested by the same run.
    if (changes.replayTypes && installReplayTypes(changes.replayTypes.newValue, window)) {
      renderKeys();
      renderBuilds();
      renderChords();
      // The report on screen is re-read from its URL rather than redrawn: a
      // replay states an ordinal and src/replay.js turns it into a name while
      // *parsing*, so every name in a report is fixed at the moment the file was
      // read and no amount of redrawing moves it. Re-reading costs one request,
      // which is what this panel already assumes by keeping no report at all.
      if (replayReport && replayUrl) openReplay(replayUrl, replayMatchRow);
    }
    // The replay run does the same. Its progress only moves a button's label;
    // its *result* is what makes the report on screen worth redrawing.
    if (changes.sim) {
      simState = changes.sim.newValue || null;
      if (simState && simState.finishedAt && simState.error) {
        replayNote("the re-run stopped early — " + simState.error, true);
      }
      syncSimButton();
    }
    if (changes.sims) {
      sims = changes.sims.newValue || {};
      if (replayReport && sims[replayReport.gameId]) showReplay();
      else syncSimButton();
    }
    alignPanel.onStorage(changes);
  });
})();
