/**
 * Companion for Chrono Divide — loading-screen overlay.
 *
 * Runs in the page's MAIN world (see manifest.json), because everything here
 * needs either React fibers on the client's own nodes or the page's SystemJS
 * registry. An isolated content script can reach neither.
 *
 * What the client gives us, verified against v0.83.3 by reading the client's
 * own bundle:
 *   - the loading screen is React DOM: .loading-screen > .player-status-container
 *     > .player-status, each row with .player-country-icon and .player-name;
 *   - the country per player is in props, NOT in the DOM — the flag <img> src is
 *     a base64 data URL, so the only way to name a faction is the fiber;
 *   - MapFile decodes the map's own preview, and MapPreviewRenderer knows how to
 *     put numbered start locations on it. Both are reused rather than rewritten.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion]";

  // The extension's version, and it is the answer to "did my reload actually
  // take?" — a question that cost a debugging round once already, so it is
  // printed on load and shown in the debug HUD.
  //
  // Read from the manifest rather than written here. It used to be a literal
  // "kept in step with manifest.json by hand", which is a second source of
  // truth for a number whose entire job is to be trusted — a stale copy here
  // would answer that question with a confident lie. This world has no
  // `chrome.*` (that is what bridge.js is for), so the manifest's value arrives
  // with the first config push, a few milliseconds in; until then it says so.
  let VERSION = "?";

  const MODULE_IDS = {
    mapFile: "data/MapFile",
    previewRenderer: "gui/screen/mainMenu/lobby/MapPreviewRenderer",
    isoCoords: "engine/IsoCoords",
    theaterType: "engine/TheaterType",
    gameLoader: "gui/screen/game/GameLoader",
    keyBinds: "gui/screen/game/worldInteraction/keyboard/KeyBinds",
    minimap: "gui/screen/game/component/Minimap",
    // The three the build hotkeys need. CombatantUi is the whole write surface
    // in one object — game, player, actionQueue and actionFactory are its own
    // properties — and the other two are the enums its one queue action reads.
    combatantUi: "gui/screen/game/CombatantUi",
    actionType: "game/action/ActionType",
    updateQueue: "game/action/UpdateQueueAction",
    // Two entries onto one module id: it usefully exports two enums and this
    // table is keyed by the name the rest of the file reads, not by module.
    // The chord grid needs both — which queues exist, and whether one is
    // blocked by a structure waiting to be placed.
    queueType: "game/player/production/ProductionQueue",
    queueStatus: "game/player/production/ProductionQueue",
    // The client's own art, and the pieces needed to ask it what a cameo is.
    // Every picture this tab draws comes from here — it is a tab with a live
    // client in it by definition, and that client holds RA2's sidebar art
    // already, so a generated sheet beside it was 190 KB of artwork EA never
    // licensed for redistribution and the wrong localisation besides.
    //
    // `Art#getObject(id, type).cameo` is the id -> picture step; it needs a
    // parsed `Rules` to walk `Image=` with, and `ObjectType` names the four
    // techno lists that walk covers. `ImageUtils` is the client's own
    // SHP-to-canvas converter — see clientCameoUrl.
    engine: "engine/Engine",
    rules: "game/rules/Rules",
    art: "game/art/Art",
    objectType: "engine/type/ObjectType",
    imageUtils: "engine/gfx/ImageUtils",
    // The sidebar's own two components: the block of cameos, and the four tab
    // buttons above it. Both are read for geometry only — where a cameo is, so
    // its key can be drawn on it.
    sidebarCard: "gui/screen/game/component/hud/SidebarCard",
    sidebarTabs: "gui/screen/game/component/hud/SidebarTabs",
    // The client's own mouse pointer. It keeps the real one locked and draws
    // a sprite instead, which is why anything of ours that wants a click or a
    // cursor position has to go through it.
    pointer: "gui/Pointer",
    // The three states a superweapon can be in. The weapon itself is reached
    // off the player, but the enum is only on the module.
    superWeaponStatus: "game/SuperWeapon",
    // The net readout. `PingMonitor` is built once per match whatever the
    // client's own FPS panel is doing, and its instance carries the other two
    // objects worth reading — the `LockstepManager` and the server connection —
    // so one hook on it is the whole capture. `LoadInfoParser` is the client's
    // own reader for the per-player line the server answers `loadinfo` with.
    pingMonitor: "gui/screen/game/PingMonitor",
    loadInfoParser: "network/gameopt/LoadInfoParser",
    // The in-game menu — Options, Fullscreen, Abort Mission, Resume Mission.
    // Held as the instance rather than driven by a synthetic keypress: `open`,
    // `close` and its controller's `popScreen` are the client's own paths and
    // fire its own events, so the pointer lock and the world interaction the
    // menu turns off are turned back on by the client itself.
    gameMenu: "gui/screen/game/GameMenu",
    // The match itself, for the recolour. `Game#init` is where the client
    // forms the teams' alliances and learns which player is the local one —
    // the earliest moment the role of every player is knowable, and still
    // before a single renderable exists to have baked a palette. Anything
    // later would be a repaint; this is a colour that was never wrong.
    game: "game/Game",
    // Named rather than numbered: `EventType.AllianceChange` is 46 in this
    // client and there is no reason for that to be our constant.
    eventType: "game/event/EventType",
  };

  /**
   * Which export to keep off each module above, and under what name.
   *
   * One table rather than a hand-written object literal built from a
   * hand-written import list, because the two drifted: 0.53.0 imported three new
   * modules, destructured them, and then did not store them — the literal was
   * never extended. Every build hotkey was dead, `import failed` was never
   * logged because nothing had failed, and the `modules:` line listed only the
   * seven it knew to look for. Two lists that must agree, kept apart, will
   * eventually not agree.
   *
   * The key is the export's own name, which is also the name the rest of this
   * file reads it by (`state.modules.MapFile`). `updateQueue` is the one module
   * whose useful export is not named after it — `UpdateType`, the enum, not the
   * action class.
   */
  const MODULE_EXPORTS = {
    mapFile: "MapFile",
    previewRenderer: "MapPreviewRenderer",
    isoCoords: "IsoCoords",
    theaterType: "TheaterType",
    gameLoader: "GameLoader",
    keyBinds: "KeyBinds",
    minimap: "Minimap",
    combatantUi: "CombatantUi",
    actionType: "ActionType",
    updateQueue: "UpdateType",
    queueType: "QueueType",
    queueStatus: "QueueStatus",
    engine: "Engine",
    rules: "Rules",
    art: "Art",
    objectType: "ObjectType",
    imageUtils: "ImageUtils",
    sidebarCard: "SidebarCard",
    sidebarTabs: "SidebarTabs",
    pointer: "Pointer",
    superWeaponStatus: "SuperWeaponStatus",
    pingMonitor: "PingMonitor",
    loadInfoParser: "LoadInfoParser",
    gameMenu: "GameMenu",
    game: "Game",
    eventType: "EventType",
  };

  /**
   * Defaults only — both are reassignable in the options page, because a hotkey
   * can be taken by three different layers and only the user can see all three:
   * the game (checked live, see hotkeyConflicts), the browser, and Windows
   * itself. Alt+Shift+G was the first casualty: Alt+Shift is the Windows
   * keyboard-layout switch, so it never reaches the page on a machine with two
   * layouts. Nothing here uses Shift with Alt for that reason.
   *
   * `keyCode` is what the client's own KeyBinds hashes (see MODIFIER_BITS), so
   * carrying it lets the collision check compare against its live table.
   */
  const DEFAULT_KEYS = {
    // **`Alt` + the right hand** (0.101.0), which replaced bare digits `1`-`7`
    // (0.66.0-0.100.0). The old table was one keyboard's answer and said so: a
    // bare digit is the client's `TeamSelect_N`, our handler is `window` +
    // capture + `stopPropagation`, so a stock install lost group select to a
    // binding nothing announced but a tooltip.
    //
    // `Alt`+letter is the emptiest space the client has. Read out of the shipped
    // `[Hotkey]` table (`langmd.mix`) plus the seven defaults `KeyBinds#load`
    // injects before it: the only two entries under `Alt` are `Alt+M`
    // (`ToggleMarbleMadness`, in the enum and never passed to
    // `registerKeyCommand`) and `Alt+S` (`ToggleShroud`, registered only while
    // `cheatsEnabled`). Every other modifier is spoken for — `Shift`+digit is
    // `TeamAddSelect`, `Ctrl`+digit is `TeamCreate`, `Alt`+digit is
    // `TeamCenter`, and `Ctrl`+letter is eight inert commands, three cheats,
    // `Ctrl+R`, and the browser's own tab keys.
    //
    // The letters are the right hand's because the left one is not available to
    // any general default: an open grid spends the whole `qwert`/`asdfg`/`zxcvb`
    // block under *every* modifier, and that block is the left hand. None of
    // these is a mid-fight press, so the hand leaving the mouse costs
    // nothing that matters.
    //
    // `Alt` also means *cancel* on a build key or a grid slot. The two key sets
    // are disjoint, so it is a legibility cost rather than a collision.
    //
    // One caveat that is not visible from the table: AltGr on a German or Polish
    // layout arrives as `ctrlKey && altKey`, and `matchesHotkey` compares the
    // modifier state exactly — so these fire on the left `Alt` only.
    //
    // The author's own board still wants bare digits (a split keyboard whose
    // digits live on a layer, right hand on the mouse, so `1` is two presses
    // where `Alt+1` is three). That is now an override written on the options
    // page, not what everyone else inherits.
    //
    // `U` `I` `O` `P` are the four panels and pictures, in the order they are
    // reached for; `M` and `N` carry their own initial; `J` and `K` are the two
    // opened when something is wrong.
    overlay: { code: "KeyO", keyCode: 79, alt: true, shift: false, ctrl: false, label: "Alt+O" },
    queues: { code: "KeyP", keyCode: 80, alt: true, shift: false, ctrl: false, label: "Alt+P" },
    hqSwap: { code: "KeyI", keyCode: 73, alt: true, shift: false, ctrl: false, label: "Alt+I" },
    hqFull: { code: "KeyU", keyCode: 85, alt: true, shift: false, ctrl: false, label: "Alt+U" },
    // The game menu, on the letter it is named after: it is the one of these
    // pressed *under pressure* — the press that used to be Escape.
    menu: { code: "KeyM", keyCode: 77, alt: true, shift: false, ctrl: false, label: "Alt+M" },
    // Off the pattern on purpose: the debug panel ships only in the dev build
    // (`ownKeys`), so it takes a key none of the public six would want back.
    debug: { code: "KeyJ", keyCode: 74, alt: true, shift: false, ctrl: false, label: "Alt+J" },
    net: { code: "KeyN", keyCode: 78, alt: true, shift: false, ctrl: false, label: "Alt+N" },
    // The memory readout, next to the debug panel rather than next to the six:
    // both are opened when something is wrong, not while playing. Its own
    // argument for a bare key (0.100.0 — it is the panel a stranger is talked
    // into opening in a chat window mid-match, and one press is easier to say
    // than a modifier) did not survive the move off the digits, because a bare
    // key that costs the client nothing is `I`, `J` or `O` and nothing else, and
    // splitting the set to buy one press back would cost more than it saves.
    memory: { code: "KeyK", keyCode: 75, alt: true, shift: false, ctrl: false, label: "Alt+K" },
  };

  /**
   * The key table this build has surfaces for.
   *
   * A key whose surface is withheld is not a binding, and leaving it in the
   * table is not harmless: it is tested before every other key below, so it
   * swallows the press and hands it to an inert toggle. The options page has
   * had the rule since 0.79.0 — `hasDebugPanel()` reads the manifest and skips
   * the row — which is exactly what hid this: in the public build the debug
   * binding cannot be seen, cannot be changed, and still won `6` from a user
   * who had bound `6` to the preview swap.
   *
   * Filtered here rather than at the press, so `hotkeyConflicts` and
   * `__cdc.build()` stop reporting a key this build does not have either.
   */
  function ownKeys(table) {
    if (window.__cdcHud) return table;
    const rest = { ...table };
    delete rest.debug;
    return rest;
  }

  // KeyBinds#getHotKeyCode: meta<<12 + alt<<10 + ctrl<<9 + shift<<8 + keyCode.
  const MODIFIER_BITS = { alt: 1024, ctrl: 512, shift: 256 };

  // Where the user dragged the in-game preview, if they did.
  const LAYOUT_KEY = "cdc.ingameMapRect";

  // Where the preview panel sits inside .loading-screen. The client's own text
  // lives in the left column (left: 20px, width: 400px in its stylesheet), and
  // the right half of the country artwork is the world map we are covering.
  // Percentages so it follows the viewport the client sizes the screen to.
  // The map box is bounded on all four sides so the image can be `contain`-fitted
  // at any viewport size; the hint panel takes the strip below it.
  const PANEL = { left: "54%", right: "3%", top: "9%", bottom: "26%" };

  // Nominal size the preview is rendered for; also what decides the ×2 / ×4
  // upscale, exactly as the lobby renderer does it.
  const PREVIEW_TARGET = { width: 380, height: 340 };

  // A start position the map's own preview does not mark gets one of ours: a
  // red disc, because that is what the maps which do mark them use. The radius
  // is a fraction of the preview, which is anywhere from 200 to 800 px across.
  const SPAWN_DOT = { of: 0.018, min: 3, fill: "#ff2020", ring: "#000000" };

  // What a spawn marker somebody drew looks like, as opposed to a patch of
  // terrain that happens to be colourful.
  //
  // `bright` and `spread` are the pixel test: a marker is a flat, vivid colour,
  // so the brightest channel is high *and* the distance to the dimmest is large.
  // Desert sand (150, 118, 86) is bright and barely saturated at all, which is
  // the case that broke a looser test — "is it reddish" finds red-brown rock on
  // every desert map.
  //
  // `reach` is a fraction of the preview's short side rather than a pixel count:
  // the marker a map draws is often several cells from the start cell the client
  // computes — different tools, only roughly agreeing — and a preview is
  // anywhere from 100 to 500 px across. `min` keeps it sane on the smallest.
  const NATIVE_MARK = { bright: 150, spread: 90, pixels: 2, reach: 0.06, min: 8 };

  // Internal country name -> what a player actually calls it. The client can
  // localise these itself (props.strings + props.countryUiNames); this table is
  // the fallback and the source of the side, which the UI strings do not carry.
  const FACTIONS = {
    Americans:    { label: "USA",           side: "Allied" },
    French:       { label: "France",        side: "Allied" },
    Germans:      { label: "Germany",       side: "Allied" },
    British:      { label: "Great Britain", side: "Allied" },
    Alliance:     { label: "Korea",         side: "Allied" },
    Russians:     { label: "Russia",        side: "Soviet" },
    Confederation:{ label: "Cuba",          side: "Soviet" },
    Africans:     { label: "Libya",         side: "Soviet" },
    Arabs:        { label: "Iraq",          side: "Soviet" },
    YuriCountry:  { label: "Yuri",          side: "Yuri"   },
  };

  // Thumbnail stored in the catalogue for the options page. Small on purpose —
  // it is the bulk of the extension's storage, and it is only ever shown at
  // about this size.
  const THUMB_WIDTH = 220;

  /**
   * The two widths our own render is kept at. `thumb` is what a card and the
   * in-game box show; `full` is what the fullscreen views zoom into, and it is
   * the reason the extension asks for unlimitedStorage — a 3000px render of a
   * big map is several megabytes.
   *
   * They are not the same picture at two sizes. At 400px a cell is under three
   * pixels, so the thumbnail carries the compact marks — solid harvest fields
   * and one pictogram per tech building — while the full render keeps the marks
   * traced on true cells. See MARK_STYLES in src/hq-preview.js.
   *
   * The options page cannot produce either: it has no game client and therefore
   * no theater art. Whatever it shows had to be rendered during a match and
   * stored, which is what makes the auto-render below load-bearing rather than
   * a convenience.
   */
  const HQ_SIZES = {
    thumb: { width: 400, marks: "compact" },
    full: { width: 3000, marks: "detail" },
  };

  // How much of the viewport the fullscreen render covers, and how solid it is.
  const HQ_FULL = { size: "90%", opacity: 0.8 };

  // Shown when the map tells us nothing specific.
  const GENERIC_HINTS = [
    "Opening floor: Power Plant → Barracks → Ore Refinery → War Factory. The Construction Yard should never sit idle.",
    "A second Ore Refinery pays for itself faster than a second War Factory — income beats units you cannot afford.",
    "Set a rally point on the War Factory now; you will not have a spare click once the fighting starts.",
    "Scout early. Dogs also kill spies and engineers on contact, so one at home is cheap insurance.",
    "Deployed GIs hold ground far better than moving ones — deploy before the attack arrives, not during.",
    "Allied Chrono Miners teleport home, so they can safely mine ore a Soviet miner could never reach.",
    "Soviet Tesla Coils need power. Lose your reactors and your defence line switches off.",
  ];

  const HINT_INTERVAL_MS = 7000;

  const state = {
    modules: {},
    hooks: {
      fromString: false,
      fromJson: false,
      lobbyRenderer: false,
      gameLoader: false,
      keyBinds: false,
      minimap: false,
      combatantUi: false,
      pingMonitor: false,
      gameMenu: false,
    },
    captureSource: null,
    lastMapFile: null,
    // The client's own GameLoader, kept from the first match this tab loads.
    // It is the only thing that can fetch a theater's mixes in CDN mode, which
    // is what lets the renderer draw a map of a theater not played here.
    gameLoader: null,
    map: null, // { dataUrl, facts, hints }
    events: [], // ring buffer, newest last
    screen: null, // snapshot of the last loading screen seen
    players: [], // captured on the loading screen, needed long after it is gone
    clientHotkeys: new Map(), // hotkey code -> command, read off the live client
    // The client's own KeyBinds object for this tab, captured off the same hook.
    // The table above is a copy, and answers "is this key already taken"; this is
    // the thing itself, and a settings import writes through it so the keys in
    // play and the file on disk cannot end up disagreeing.
    keyBinds: null,
    // The client's own CombatantUi for the match in play, or null between
    // matches. It carries game, player, actionQueue and actionFactory, which is
    // everything a queued build order needs; `dispose` puts it back to null so a
    // key pressed on the main menu cannot reach a dead match's queue.
    combatant: null,
    // The client's own GameMenu for the match or replay in play, or null between
    // them. It is what a menu key opens and what Escape closes, and it is also
    // the only way to ask whether the menu is on screen at all — the client
    // keeps no flag, only a screen stack on the menu's controller.
    gameMenu: null,
    // side -> [{ name, key }], the build bindings written in the options page.
    // Empty until the bridge pushes them, which is the same wire the other
    // hotkeys arrive on.
    builds: {},
    // [{ command, key }], the client commands the options page put on keys of
    // ours. A flat list rather than a per-side table like `builds` above: a
    // client command is the same command whatever country you drew, so there
    // is nothing for a side to profile.
    commandKeys: [],
    // side -> { section -> [object id per slot] }, the chord grids written
    // in the options page. A side that is not in here plays the shipped
    // layout, so an empty table is a working feature rather than a dead one.
    chords: {},
    // The client's live sidebar components, captured at construction. Replaced
    // whenever the HUD is rebuilt — which is every viewport change — and read
    // only for where things are on screen.
    sidebarCard: null,
    sidebarTabs: null,
    // The grid on screen right now ({ section }), or null.
    chord: null,
    // The last sidebar-tab press seen ({ code, at }). A second one inside
    // CHORD_WINDOW is a chord rather than two tab switches.
    tap: null,
    // Where the DOM last saw the mouse. Frozen while the client holds a
    // pointer lock, which is most of a match — `cursorPoint()` prefers the
    // client's own pointer and falls back to this.
    pointer: null,
    // The client's `gui/Pointer` for this page: cursor position in every
    // mode, and the lock itself.
    pointerUi: null,

    queuesVisible: false,
    netVisible: false,
    /**
     * Everything the net readout knows, whether or not it is on screen.
     *
     * Filled by `attachNet` from the match's own `PingMonitor`; `off` holds the
     * unsubscribes, because every one of these events belongs to an object the
     * client throws away at the end of a match.
     */
    net: {
      monitor: null, // the client's PingMonitor for this match
      lockstep: null, // its gameTurnMgr — a LockstepManager
      gserv: null, // the game-server connection, listened to, never asked
      median: null, // its MedianPing, the client's own median over the match
      rtt: null,
      rttAt: 0,
      lat: null,
      latAt: 0,
      lag: false,
      fps: null,
      players: [], // the last per-player line the client fetched
      playersAt: 0,
      sent: new Map(), // network turn -> when we saw it sent
      off: [],
    },
    // The client version the stored roster was harvested from, as the bridge
    // reports it. "" until the bridge has answered, which is why the harvest is
    // triggered from the config push rather than from boot: before that answer
    // arrives there is no way to tell "no roster" from "a roster already".
    rosterVersion: "",
    // The same, for the harvested cameo sheet. Two stamps rather than one
    // because the two harvests go stale independently: a client that reorders
    // its rules invalidates the roster and leaves the pictures correct.
    cameoVersion: "",
    // And for the harvested object table — the ordinals a replay is written in.
    // A third stamp for the same reason: a client that changes its art leaves
    // every ordinal where it was.
    replayTypesVersion: "",
    minimapObj: null, // the in-game Minimap UiObject
    minimapFitSize: null,
    ingameVisible: false,
    // map key -> the free-form guide written in the options page, pushed here by
    // the bridge. One multi-line text per map, not a list of one-liners. It is
    // shown in the hint slot itself, replacing the rotating hints: same place,
    // same role, and there is no second panel competing for attention.
    guides: {},
    bridge: "no answer yet", // isolated-world half; "connected" once it replies
    catalogue: null, // how many maps the bridge has stored
    keys: ownKeys(JSON.parse(JSON.stringify(DEFAULT_KEYS))), // overridden from the options page
    // Our own render of the map in play: { key, thumb, full } — made here by
    // renderHq, or fetched back out of storage by wantStoredRender.
    hq: null,
    hqBusy: false,
    // The map key a stored render has been asked for, so the two callers of
    // wantStoredRender do not both ask.
    hqWanted: null,
    // map key -> the renderer version that made the stored render. Not a Set:
    // a render made by an older renderer is not "already stored", which is what
    // stops a renderer change leaving a catalogue of quietly stale pictures.
    hqRendered: new Map(),
    // True while a map is being parsed for something other than playing it —
    // a bulk render. The MapFile parse hooks fire on those too and cannot tell
    // the difference, so without this the loading screen's map is replaced by
    // whatever the run happens to be chewing through.
    replaying: false,
    hqFullVisible: false,
    // The three preview settings, plus the two the chord keys added. Defaults
    // repeated from the options page's own DEFAULT_PREFS: this half has to be
    // usable before the bridge has said anything, and an undefined preference
    // must not read as "off".
    prefs: {
      preferHqPreview: true,
      autoRender: true,
      captureSample: false,
      fullIcons: true,
      // One press of a tab key opens the grid, rather than two inside
      // CHORD_WINDOW. The press still reaches the client either way.
      chordSinglePress: false,
      // Draw only what can be ordered right now, instead of the whole grid with
      // what cannot be ordered dimmed. Off by default: the full block is what a
      // hand learns, and a key that moves costs more than a key that is dark.
      // The rule, and what it deliberately keeps, is `chordSlotShown`.
      chordOnlyBuildable: false,
      // Hold the codes we need a Ctrl on against the browser while the game
      // is fullscreen, so Ctrl+W queues the grid's second slot next instead of
      // closing the tab.
      grabTabKeys: true,
      // Take the client's own fullscreen key (Alt+F) and put it on Alt+Enter,
      // because Alt+F is also a slot key and the grid now cancels with it.
      fullscreenOnEnter: true,
      // Take the in-game menu off Escape and put it on a key of ours, and let
      // Escape close the menu the client gives no key to at all.
      menuOffEscape: true,
      // The chord key drawn on each sidebar cameo, and the tab prefix on each
      // tab button. On by default: the whole point is that it answers a
      // question you did not have to ask it.
      sidebarKeys: true,
      // Repaint the players of a match by role rather than by what they picked.
      // Off by default — it changes what every match looks like, so it is opted
      // into. See the Player colours section for what the three fields mean.
      recolour: { on: false, self: "", ally: "", enemies: [] },
    },
    // map key -> "ours" | "original", set per card in the options page. It
    // outranks `prefs.preferHqPreview` for the map it names; a map that is not
    // in here follows the preference.
    previewSrc: {},
    // map key -> false, for the cards told not to mark the start positions the
    // map's own preview missed. Only the exceptions are stored: the default is
    // to mark them.
    spawnFix: {},
    // sprite type -> { x, y }, dialled in the options page's alignment panel.
    // Kept here only to be handed to the renderer, which is the half that has
    // no wire to storage of its own.
    spriteFix: {},
    spriteFixByName: {},
    // name -> "#rrggbb" for every colour this client's rules define, plus which
    // of them a lobby offers, and the client version it was read from. Unlike
    // the build roster, whose stamp travels alone because the table is hundreds
    // of rows, this one is a few dozen short strings and rides in the config
    // push whole. Read back here so the loading screen can paint a row without
    // a rules walk.
    colours: { version: "", mp: [], colors: {} },
    // The live match's recolour: the unsubscribe for the alliance watch, and
    // what the last apply painted, for the debug panel.
    recolour: { off: null, painted: 0, why: "no match" },
  };

  const EVENT_LIMIT = 60;
  const startedAt = Date.now();

  /** One line of history. The HUD reads these; the console gets them too. */
  function note(message, level) {
    const entry = {
      t: ((Date.now() - startedAt) / 1000).toFixed(1) + "s",
      message: String(message),
      level: level || "info",
    };
    state.events.push(entry);
    if (state.events.length > EVENT_LIMIT) state.events.shift();
    if (level === "warn") console.warn(TAG, message);
    else console.log(TAG, message);
    // The same line to the other world, where it can be written down. Until
    // this, the HUD's list died with the tab — which made every question about
    // a finished run a question only a console still open at the time could
    // answer. The bridge batches; this is a postMessage per note either way,
    // and notes are narration, not a hot path.
    window.postMessage(
      { source: "cdc-page", type: "log", msg: entry.message, level: entry.level },
      "*"
    );
    renderHud();
    return entry;
  }

  // --- React fiber access ---------------------------------------------------

  function getFiber(el) {
    const key = Object.keys(el).find(
      (k) => k.startsWith("__reactFiber$") || k.startsWith("__reactInternalInstance$")
    );
    return key ? el[key] : null;
  }

  /**
   * Walk up from a DOM node to the nearest fiber whose props carry playerInfos —
   * the LoadingScreen component. Returns its props, or null.
   */
  function loadingScreenProps(el) {
    let fiber = getFiber(el);
    while (fiber) {
      const props = fiber.memoizedProps;
      if (props && Array.isArray(props.playerInfos)) return props;
      fiber = fiber.return;
    }
    return null;
  }

  /** The client's own localised country name, or our fallback. */
  function factionLabel(countryName, props) {
    const known = FACTIONS[countryName];
    try {
      const key = props.countryUiNames && props.countryUiNames.get(countryName);
      const localised = props.strings && props.strings.get(key || countryName);
      // strings.get returns the key itself when the string is missing.
      if (localised && localised !== key && localised !== countryName) return localised;
    } catch (e) {
      console.warn(TAG, "country string lookup failed, using the built-in table", e);
    }
    return known ? known.label : countryName;
  }

  // --- Player colours -------------------------------------------------------

  /**
   * The recolour preference, normalised to the shape the two appliers read.
   *
   * A preference arrives from storage, so every field of it is whatever was
   * last written there — including nothing at all, on a profile that predates
   * the feature. Normalising once here is what lets the rest of this section be
   * about colour rather than about defensive reads.
   *
   * @returns {{ on: boolean, self: string, ally: string, enemies: string[] }}
   */
  function recolourPrefs() {
    const raw = (state.prefs && state.prefs.recolour) || {};
    return {
      on: raw.on === true,
      self: typeof raw.self === "string" ? raw.self : "",
      ally: typeof raw.ally === "string" ? raw.ally : "",
      enemies: Array.isArray(raw.enemies)
        ? raw.enemies.map((name) => (typeof name === "string" ? name : ""))
        : [],
    };
  }

  /**
   * Which colour name each player should be painted, by role.
   *
   * `players` is `[{ key, role }]` in **player order** — the order the client
   * keeps its own player list in, which is the lobby's slot order. `key` is
   * whatever the caller wants back out: a `Player` object in a match, a name on
   * the loading screen. Roles are `"self"`, `"ally"`, `"enemy"`.
   *
   * The two role colours are one name each; enemies take an ordered list, so
   * two opponents do not merge into one side in 2v2 and FFA. **The enemy
   * counter advances on every enemy, including one whose slot is blank** — the
   * second enemy is always the second slot, so leaving slot 1 as picked does not
   * shift everyone up by one.
   *
   * A blank name means *keep what they picked*, so this returns only the players
   * it has something to say about.
   *
   * @returns {Map<*, string>} key -> colour name
   */
  function recolourPlan(players, prefs) {
    const out = new Map();
    if (!prefs.on) return out;
    let nth = 0;
    for (const player of players) {
      let name = "";
      if (player.role === "self") name = prefs.self;
      else if (player.role === "ally") name = prefs.ally;
      else name = prefs.enemies[nth++] || "";
      if (name) out.set(player.key, name);
    }
    return out;
  }

  /**
   * The role of every combatant of a live match, in player order.
   *
   * "Ally" is the client's own answer — `Alliances#areAllied`, the same call the
   * game asks before deciding whether a weapon may fire — rather than the
   * lobby's teams, so an alliance formed or broken during the match counts.
   */
  function matchRoles(game, local) {
    return game.getCombatants().map((player) => ({
      key: player,
      role:
        player === local
          ? "self"
          : game.alliances && game.alliances.areAllied(local, player)
            ? "ally"
            : "enemy",
    }));
  }

  /**
   * Repaint a live match.
   *
   * The whole feature is this assignment. Every renderable the client builds
   * re-reads `owner.color` on each update and re-remaps its palette when it
   * differs — the path that exists so a mind-controlled tank turns Yuri's
   * colour — so one write repaints that player's army, their radar blips, their
   * health bars and their control-group tags, and we draw none of it.
   *
   * **A colour is only ever taken by name out of `rules.colors`.** With sprite
   * batching on, a batched voxel builder resolves its palette by content hash
   * against a list precomputed from exactly that map, and throws *inside the
   * render loop* when the hash misses. So an invented `new Color(255, 0, 0)` is
   * not a red, it is a crash; a name the client does not have is skipped with a
   * line in the log rather than guessed at.
   *
   * Colour is absent from `Player#getHash()` and nothing sends it, so this is
   * local render state only: no desync, nothing on the wire. It reveals nothing
   * either — every client already knows every alliance, because the action that
   * forms one travels through the same lockstep everyone replays.
   */
  function applyRecolour(game, why) {
    const prefs = recolourPrefs();
    if (!prefs.on) {
      state.recolour.why = "off";
      return;
    }
    const local = game && game.localPlayer;
    if (!local || typeof game.getCombatants !== "function") {
      state.recolour.why = "no local player";
      return;
    }
    // An observer has no side, so it has no enemies either. That the client
    // builds ObserverUi instead of CombatantUi is the same observation.
    if (local.isObserver) {
      state.recolour.why = "observing";
      return;
    }
    const colours = game.rules && game.rules.colors;
    if (!colours || typeof colours.get !== "function") {
      note("this client's rules carry no colour table — players keep what they picked", "warn");
      state.recolour.why = "no colour table";
      return;
    }

    let painted = 0;
    for (const [player, name] of recolourPlan(matchRoles(game, local), prefs)) {
      const colour = colours.get(name);
      if (!colour) {
        note(`no colour named "${name}" in this client's rules — ${player.name} keeps their own`, "warn");
        continue;
      }
      // The rules hand back the same Color object every time, so identity is
      // also the guard against writing a colour that is already on.
      if (player.color === colour) continue;
      player.color = colour;
      painted++;
    }
    state.recolour.painted = painted;
    state.recolour.why = why;
    if (painted) note(`recoloured ${painted} player(s) — ${why}`);
  }

  /**
   * Watch for alliances forming and breaking, and repaint when one does.
   *
   * Two things are worth knowing about a mid-match repaint, and neither is a
   * defect of this watch. The **radar** takes a tile's colour when the tile is
   * dirtied rather than every frame, so blips already drawn keep the old colour
   * until each object next moves; the world itself repaints at once. And the
   * enemy list is ordinal, so an enemy turning ally renumbers the ones after
   * them — enemy #2 becomes enemy #1 and takes that slot's colour. At the start
   * of a match, which is where this normally runs, neither can be seen.
   */
  function watchAlliances(game) {
    detachRecolour();
    const EventType = state.modules.EventType;
    if (!game.events || typeof game.events.subscribe !== "function" || !EventType) return;
    const off = game.events.subscribe(EventType.AllianceChange, () => {
      applyRecolour(game, "alliance change");
    });
    state.recolour.off = typeof off === "function" ? off : null;
  }

  /** Let go of the last match's alliance watch. */
  function detachRecolour() {
    if (typeof state.recolour.off === "function") {
      try {
        state.recolour.off();
      } catch (e) {
        note(`could not release the alliance watch — ${e && e.message}`, "warn");
      }
    }
    state.recolour.off = null;
  }

  /**
   * The same plan, for the roster of a loading screen — which is a different
   * world from the one above: there are no `Player` objects yet, no alliances
   * and no rules table, only the props React is drawing the rows from.
   *
   * So the two inputs are what that screen actually knows. **Ally is the
   * lobby's team**, not `areAllied`, because an alliance does not exist until
   * `Game#init` forms it. And **self is a name or nothing**: `decorateRows`
   * identifies you by your country, which is ambiguous when someone else picked
   * the same one — with no self there is no "enemy" either, so the screen is
   * left in the colours the client chose rather than painted from a guess.
   *
   * @param {Array<{name: string, team: *}>} roster in the props' own order
   * @param {string|null} selfName
   * @returns {Map<string, string>} player name -> colour name
   */
  function loadingRecolourPlan(roster, selfName) {
    const prefs = recolourPrefs();
    if (!prefs.on || !selfName) return new Map();
    const self = roster.find((p) => p.name === selfName);
    const teamed = self && self.team !== undefined && self.team !== null;
    return recolourPlan(
      roster.map((p) => ({
        key: p.name,
        role:
          p.name === selfName ? "self" : teamed && p.team === self.team ? "ally" : "enemy",
      })),
      prefs
    );
  }

  /**
   * The hex a colour name draws as, out of the table harvested from the
   * client's own rules.
   *
   * The loading screen has no rules object to ask, and this runs on every React
   * re-render of a row — a rules walk per tick is not what that moment is for.
   * The table is a few dozen short strings in storage, pushed with every other
   * setting.
   */
  function colourHex(name) {
    const table = state.colours && state.colours.colors;
    return (table && table[name]) || "";
  }

  // --- Faction labels -------------------------------------------------------

  function decorateRows(screen) {
    const props = loadingScreenProps(screen);
    if (!props) return false;

    // The loading screen is the only place the client hands us the full roster.
    // Keep it: in game, "who is playing what" is the whole point of this thing.
    const roster = props.playerInfos.filter((p) => p.country);

    // props.countryName is the local player's country. That identifies "you"
    // only when nobody else picked the same country — when it is ambiguous we
    // mark nobody rather than guess, and every name still reads as a roster.
    const sameCountry = roster.filter((p) => p.country.name === props.countryName);
    const selfName = sameCountry.length === 1 ? sameCountry[0].name : null;

    // The recolour, on a screen the client draws before a single Player object
    // exists — so it is computed from the props' own teams, not from alliances.
    // See loadingRecolourPlan. An empty plan is the feature switched off, and
    // `paint` then hands back exactly what the client picked.
    const recoloured = loadingRecolourPlan(roster, selfName);
    const paint = (name, fallback) => colourHex(recoloured.get(name)) || fallback;

    state.players = roster.map((p) => ({
      name: p.name,
      country: p.country.name,
      label: factionLabel(p.country.name, props),
      side: FACTIONS[p.country.name] ? FACTIONS[p.country.name].side : "",
      // Our own panel and the `1` overlay draw the name in this, so both follow
      // the recolour without knowing it happened.
      color: paint(p.name, p.color || "#fff"),
      team: p.team,
      self: selfName !== null && p.name === selfName,
    }));

    const rows = screen.querySelectorAll(".player-status");
    rows.forEach((row) => {
      const nameEl = row.querySelector(".player-name");
      if (!nameEl) return;
      const info = props.playerInfos.find((p) => p.name === nameEl.textContent);
      const countryName = info && info.country ? info.country.name : undefined;
      if (!countryName) return; // observer, or a slot with no country yet

      const label = factionLabel(countryName, props);
      const side = FACTIONS[countryName] ? FACTIONS[countryName].side : "";

      // React re-renders the row on every loadPercent tick and drops our span,
      // so this runs again on each mutation instead of once.
      let tag = row.querySelector(".cdc-faction");
      if (!tag) {
        tag = document.createElement("span");
        tag.className = "cdc-faction";
        const icon = row.querySelector(".player-country-icon");
        if (icon && icon.nextSibling) row.insertBefore(tag, icon.nextSibling);
        else row.appendChild(tag);
      }
      if (tag.textContent !== label) tag.textContent = label;
      if (tag.dataset.side !== side) tag.dataset.side = side;

      // The client's own row. Its colour is an inline style React writes from
      // `playerInfos[i].color`, so this is a write over a write and is made
      // unconditionally: `style.color` reads back as `rgb(r, g, b)` and could
      // not be compared against a hex anyway, and a re-render that restored the
      // client's value would defeat a stamp saying we had already been here.
      // Eight rows a few times a second is not a cost worth guarding.
      const hex = paint(nameEl.textContent, "");
      if (hex) row.style.color = hex;
    });
    return true;
  }

  // --- Map capture ----------------------------------------------------------

  /**
   * Every parsed map passes through MapFile#fromString (or #fromJson for a
   * cached one), so patching those two prototypes catches the map of the game
   * about to start — the lobby's preview renderer only ever sees the map you are
   * hovering, which is not necessarily the one that loads (quick match).
   *
   * Prototype patching, not export patching: SystemJS consumers captured the
   * class binding when they were instantiated, so replacing the module export
   * would reach nobody.
   */
  function installHooks() {
    const sys = window.System || window.SystemJS;
    if (!sys || typeof sys.import !== "function") {
      note("SystemJS not found on the page — no map preview possible", "warn");
      return;
    }

    const load = (id) =>
      sys.import(id).catch((e) => {
        note(`import failed: ${id} (${e && e.message})`, "warn");
        return null;
      });

    const moduleKeys = Object.keys(MODULE_IDS);

    Promise.all(moduleKeys.map((key) => load(MODULE_IDS[key]))).then((loaded) => {
      state.modules = {};
      moduleKeys.forEach((key, i) => {
        const exported = MODULE_EXPORTS[key];
        const mod = loaded[i];
        // Minimap is the one that has been seen as a default export as well as
        // a named one; the fallback is per-module rather than blanket, so a
        // module whose export is simply missing still reads as MISSING instead
        // of silently resolving to something else.
        state.modules[exported] =
          (mod && mod[exported]) || (key === "minimap" && mod && mod.default) || undefined;
      });
      note(
        "modules: " +
          Object.keys(state.modules)
            .map((k) => `${k}=${state.modules[k] ? "ok" : "MISSING"}`)
            .join(" ")
      );

      const proto = state.modules.MapFile && state.modules.MapFile.prototype;
      if (proto) {
        for (const method of ["fromString", "fromJson"]) {
          if (typeof proto[method] !== "function") continue;
          const original = proto[method];
          proto[method] = function (...args) {
            const out = original.apply(this, args);
            capture(this, `MapFile#${method}`);
            return out;
          };
          state.hooks[method] = true;
        }
      } else {
        note("MapFile prototype unavailable", "warn");
      }

      // The authoritative one: GameLoader#load gets the MapFile of the game that
      // is actually starting (4th argument) and starts the loading screen in the
      // same call. The parse hooks above fire earlier but can see a map that
      // never loads; this one cannot be fooled.
      const Loader = state.modules.GameLoader;
      if (Loader && Loader.prototype && typeof Loader.prototype.load === "function") {
        const original = Loader.prototype.load;
        Loader.prototype.load = function (...args) {
          // The instance, not just the call: `GameLoader#loadTheater` is the one
          // thing in the client that can *fetch* a theater's mixes in CDN mode,
          // and it needs its own `cdnResourceLoader`. Holding it is what lets a
          // bulk run render a map whose theater this session never played —
          // see theaterFor() in hq-preview.js.
          state.gameLoader = this;
          const mapFile = args[3];
          // args[2] is the game options object: the only place the map's real
          // title and file name live. The map FILE has no reliable name of its
          // own — the client itself takes the loading screen's map name from
          // here, not from [Basic] Name.
          const opts = args[2] || {};
          if (mapFile && typeof mapFile.decodePreviewImage === "function") {
            capture(mapFile, "GameLoader#load", {
              title: opts.mapTitle,
              file: opts.mapName,
              digest: opts.mapDigest,
            });
          } else {
            note(`GameLoader#load arg[3] is not a MapFile (${typeof mapFile})`, "warn");
          }
          const out = original.apply(this, args);
          // Our own renderer needs the theater art, and GameLoader#load is what
          // downloads it — so the first moment it can possibly work is when this
          // promise settles. Chained rather than awaited: a render must never be
          // able to hold up the game starting.
          if (out && typeof out.then === "function") {
            out.then(
              () => scheduleHqRender(mapFile),
              () => {}
            );
          } else {
            scheduleHqRender(mapFile);
          }
          return out;
        };
        state.hooks.gameLoader = true;
      } else {
        note("GameLoader#load unavailable", "warn");
      }

      // Lobby fallback: if every other hook stops firing, hovering a map in the
      // lobby still yields a preview.
      const Renderer = state.modules.MapPreviewRenderer;
      if (Renderer && Renderer.prototype && Renderer.prototype.render) {
        const original = Renderer.prototype.render;
        Renderer.prototype.render = function (mapFile, ...rest) {
          if (!state.map) capture(mapFile, "MapPreviewRenderer#render");
          return original.call(this, mapFile, ...rest);
        };
        state.hooks.lobbyRenderer = true;
      }

      // Read the client's own hotkey table as it is built, so our keys can be
      // checked against it instead of assumed free. Covers the user's custom
      // binds too: every path into the table goes through addHotKey.
      const KeyBinds = state.modules.KeyBinds;
      if (KeyBinds && KeyBinds.prototype && KeyBinds.prototype.addHotKey) {
        const original = KeyBinds.prototype.addHotKey;
        KeyBinds.prototype.addHotKey = function (command, key) {
          const out = original.call(this, command, key);
          state.keyBinds = this;
          try {
            const code = typeof key === "number" ? key : this.getHotKeyCode(key);
            state.clientHotkeys.set(code, command);
          } catch (e) {
            note(`could not record client hotkey for ${command}`, "warn");
          }
          return out;
        };
        state.hooks.keyBinds = true;
      }

      // The in-game minimap is a three.js UiObject, not DOM — but its position
      // and fit size are in the same pixel space as the HTML overlay layer, so
      // capturing it lets the preview sit exactly on top of the radar.
      const Minimap = state.modules.Minimap;
      if (Minimap && Minimap.prototype && Minimap.prototype.setFitSize) {
        const original = Minimap.prototype.setFitSize;
        Minimap.prototype.setFitSize = function (size) {
          state.minimapObj = this;
          state.minimapFitSize = size && { width: size.width, height: size.height };
          return original.call(this, size);
        };
        state.hooks.minimap = true;
      }

      // The client's pointer. Captured for two things a locked mouse makes
      // impossible: knowing where the cursor is, and clicking anything of ours.
      const Pointer = state.modules.Pointer;
      if (Pointer && Pointer.prototype && typeof Pointer.prototype.init === "function") {
        const originalPointerInit = Pointer.prototype.init;
        Pointer.prototype.init = function (...args) {
          state.pointerUi = this;
          return originalPointerInit.apply(this, args);
        };
        state.hooks.pointer = true;
      } else {
        note("gui/Pointer unavailable — the grid cannot be clicked while the game holds the mouse", "warn");
      }

      // The sidebar's cameos and its four tab buttons, for the key badges drawn
      // on them. Both are `UiComponent`s, and `createUiObject` is called from
      // that base class's constructor — so patching the prototype captures every
      // one the client ever builds. It has to: a viewport change does not move
      // the HUD, it destroys it and builds another (`GameScreen#rerenderHud`),
      // so an instance held from the last window size is a set of coordinates
      // for a sidebar that no longer exists.
      const SidebarCard = state.modules.SidebarCard;
      if (SidebarCard && SidebarCard.prototype && typeof SidebarCard.prototype.createUiObject === "function") {
        const originalCard = SidebarCard.prototype.createUiObject;
        SidebarCard.prototype.createUiObject = function (...args) {
          state.sidebarCard = this;
          return originalCard.apply(this, args);
        };
        state.hooks.sidebarCard = true;
      } else {
        note("SidebarCard unavailable — no key badges on the cameos", "warn");
      }

      const SidebarTabs = state.modules.SidebarTabs;
      if (SidebarTabs && SidebarTabs.prototype && typeof SidebarTabs.prototype.createUiObject === "function") {
        const originalTabs = SidebarTabs.prototype.createUiObject;
        SidebarTabs.prototype.createUiObject = function (...args) {
          state.sidebarTabs = this;
          return originalTabs.apply(this, args);
        };
        state.hooks.sidebarTabs = true;
      } else {
        note("SidebarTabs unavailable — no prefix badges on the tabs", "warn");
      }

      // The match's network, for the net readout. `PingMonitor#monitor` is
      // called once per match, straight after `initNetStats` constructs the
      // thing — and the instance is the capture: it holds the lockstep manager,
      // the server connection and the client's own median ping. `dispose` is
      // hooked with it for the same reason CombatantUi's is: those objects go
      // with the match, and holding them past it keeps a whole finished game in
      // memory.
      const Ping = state.modules.PingMonitor;
      if (Ping && Ping.prototype && typeof Ping.prototype.monitor === "function") {
        const originalMonitor = Ping.prototype.monitor;
        Ping.prototype.monitor = function (...args) {
          const out = originalMonitor.apply(this, args);
          attachNet(this);
          return out;
        };
        if (typeof Ping.prototype.dispose === "function") {
          const originalPingDispose = Ping.prototype.dispose;
          Ping.prototype.dispose = function (...args) {
            if (state.net.monitor === this) detachNet();
            return originalPingDispose.apply(this, args);
          };
        } else {
          note("PingMonitor#dispose unavailable — the net readout will hold a finished match", "warn");
        }
        state.hooks.pingMonitor = true;
      } else {
        note("PingMonitor unavailable — the net readout has nothing to read", "warn");
      }

      // The in-game menu, for the key that opens it and the key that closes it.
      // `init` is called once per match with the HUD it draws into, and the
      // instance is the capture — it owns the screen controller, which is the
      // only place the client records that the menu is up. `dispose` is hooked
      // with it for the reason CombatantUi's is: a menu held past its match is a
      // finished game kept in memory and an `open()` aimed at a dead HUD.
      const Menu = state.modules.GameMenu;
      if (Menu && Menu.prototype && typeof Menu.prototype.init === "function") {
        const originalMenuInit = Menu.prototype.init;
        Menu.prototype.init = function (...args) {
          state.gameMenu = this;
          renderHud();
          return originalMenuInit.apply(this, args);
        };
        if (typeof Menu.prototype.dispose === "function") {
          const originalMenuDispose = Menu.prototype.dispose;
          Menu.prototype.dispose = function (...args) {
            if (state.gameMenu === this) state.gameMenu = null;
            return originalMenuDispose.apply(this, args);
          };
        } else {
          note("GameMenu#dispose unavailable — the menu key will hold a finished match", "warn");
        }
        state.hooks.gameMenu = true;
      } else {
        note("GameMenu#init unavailable — Escape stays the client's menu key", "warn");
      }

      // The match itself, for the build hotkeys. One hook on `init` is the whole
      // capture: CombatantUi holds game, player, actionQueue and actionFactory
      // as its own properties, so there is nothing else to chase. `dispose` is
      // hooked with it because the reference has to *stop* being valid — the
      // client builds a new CombatantUi per match, and a stale one would take a
      // keypress on the main menu and push it at a queue that no longer exists.
      const Combatant = state.modules.CombatantUi;
      if (Combatant && Combatant.prototype && typeof Combatant.prototype.init === "function") {
        const originalInit = Combatant.prototype.init;
        Combatant.prototype.init = function (...args) {
          state.combatant = this;
          const onCommands = commandBindings().size;
          note(
            `match started — build hotkeys ${buildBindings().size ? "armed" : "unbound"}` +
              (onCommands ? `, ${onCommands} key${onCommands === 1 ? "" : "s"} on game commands` : "")
          );
          // The tab keys are only worth taking from the browser while there is
          // a queue to cancel with them.
          syncKeyLock();
          renderHud();
          // The sidebar exists from here, and so does the side whose keys go on
          // it.
          syncBadges();
          // A queue panel left open across matches re-subscribes to the new
          // match's production rather than showing the last one's numbers.
          renderQueues();
          // The boot attempt runs before hq-preview may have finished loading,
          // and a first run with no game files yet has nothing to read. By here
          // both are settled.
          //
          // This is the attempt that actually lands, which is why both tables
          // are told to say "play a match" rather than "open the game": the
          // client parses rules.ini during its own boot, well before the main
          // menu, but the boot harvest is fired from a config push at idle and
          // that push routinely wins the race against a five-second splash, a
          // Cloudflare check and a resource load. A match is simply the first
          // moment everything is certainly up.
          sendRoster();
          sendColours();
          const started = originalInit.apply(this, args);
          // After the client's own `init` and not before it: that is where the
          // `WorldInteraction` is built and `initKeyboardCommands` fills its
          // command table, so a harvest above this line would read an object
          // that does not exist yet. `init` is synchronous, so this is not a
          // race — read out of v0.83.3, where it ends by wiring the HUD.
          sendCommands();
          return started;
        };
        if (typeof Combatant.prototype.dispose === "function") {
          const originalDispose = Combatant.prototype.dispose;
          Combatant.prototype.dispose = function (...args) {
            if (state.combatant === this) state.combatant = null;
            // The bus these are on belongs to the match that has just ended.
            detachRecolour();
            // The queues these predictions were about have gone with this
            // CombatantUi, so they were neither confirmed nor dropped by the
            // client and reporting either would be a lie.
            if (predictLedger) predictLedger.reset();
            cancelStuck.clear();
            syncPredictSweep();
            syncKeyLock();
            // The grid and the queue subscription both point at this match.
            closeChord();
            renderQueues();
            renderHud();
            // No match, no sidebar: the loop stops rather than reading a
            // detached HUD sixty times a second for the rest of the session.
            syncBadges();
            return originalDispose.apply(this, args);
          };
        } else {
          note("CombatantUi#dispose unavailable — build hotkeys stay armed after a match", "warn");
        }
        state.hooks.combatantUi = true;
      } else {
        note("CombatantUi#init unavailable — build hotkeys will not work", "warn");
      }

      // The recolour, on the one call that is late enough to know every
      // player's role and early enough that nothing has been drawn in the
      // wrong colour yet. `Game#init` receives the local player and ends by
      // forming the lobby's teams into alliances; the first renderable is
      // built after it returns, and reads the colour we have just written as
      // if it were the one picked in the lobby. Hooking CombatantUi instead
      // would have been a repaint, and would have had to assume an ordering
      // between two inits.
      const Game = state.modules.Game;
      if (Game && Game.prototype && typeof Game.prototype.init === "function") {
        const originalGameInit = Game.prototype.init;
        Game.prototype.init = function (...args) {
          const out = originalGameInit.apply(this, args);
          try {
            applyRecolour(this, "match start");
            watchAlliances(this);
          } catch (e) {
            // A colour must never cost anyone a match: whatever went wrong
            // here, the client's own init has already run and the game is
            // playable in the colours the lobby picked.
            note(`recolour failed (${e && e.message}) — players keep what they picked`, "warn");
          }
          return out;
        };
        state.hooks.recolour = true;
      } else {
        note("Game#init unavailable — players keep the colours they picked", "warn");
      }

      const installed = Object.keys(state.hooks).filter((k) => state.hooks[k]);
      note("hooks: " + (installed.length ? installed.join(",") : "NONE"),
        installed.length ? "info" : "warn");
    });
  }

  /**
   * Render and cache at parse time, not at display time: drawStartLocations
   * writes IsoCoords.worldOrigin, and doing that while the match is being set up
   * would corrupt the engine's own world→screen mapping. Here we are in the same
   * phase the lobby already renders previews in, and we restore the value anyway.
   */
  function capture(mapFile, source, identity) {
    // A map parsed by a bulk render is not the map in play. Everything below
    // this line is about the match on screen — the preview, the hints, the
    // overlay — and applying it to a replayed map would show the wrong one.
    if (state.replaying) return;
    try {
      state.lastMapFile = mapFile;
      state.captureSource = source;
      const preview = renderPreview(mapFile);
      if (!preview) {
        note(`${source}: map has no usable [PreviewPack] — nothing to show`, "warn");
        return;
      }
      const facts = mapFacts(mapFile, identity);
      // A render belongs to one map. Dropping it here rather than when the next
      // one arrives is what stops the overlay showing the previous match's map
      // when this one has not been rendered yet.
      if (state.hq && state.hq.key !== facts.key) state.hq = null;
      state.map = {
        dataUrl: preview.raw,
        // Only when the map's own preview left start positions unmarked.
        dataUrlFixed: preview.fixed,
        facts,
        hints: buildHints(facts),
      };
      // Before the theater art finishes downloading — see wantStoredRender.
      wantStoredRender(facts.key);
      publishMap(preview, facts, mapFile);
      // `facts.name` is the game options' idea of the title, which in a match
      // started by anyone else came off the wire — see mapTitles().
      resolveName(facts);
      note(
        `${source}: preview ready — ${facts.name || "unnamed"} [${facts.key || "no key"}], ` +
          `${facts.players} starts, ${facts.width}x${facts.height}, ` +
          `${facts.theater || "unknown theater"}` +
          (preview.starts
            ? `, ${preview.missed} of ${preview.starts} start positions unmarked by the map`
            : "")
      );
    } catch (e) {
      note(`${source}: capture failed — ${e && e.message}`, "warn");
    }
  }

  function canvasFromRgb(rgb, width, height) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2d context");
    const img = ctx.createImageData(width, height);
    for (let src = 0, dst = 0; src < rgb.length; src += 3, dst += 4) {
      img.data[dst] = rgb[src];
      img.data[dst + 1] = rgb[src + 1];
      img.data[dst + 2] = rgb[src + 2];
      img.data[dst + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  function upscale(canvas, factor) {
    const out = document.createElement("canvas");
    out.width = canvas.width * factor;
    out.height = canvas.height * factor;
    const ctx = out.getContext("2d");
    if (!ctx) return canvas;
    ctx.scale(factor, factor);
    ctx.drawImage(canvas, 0, 0);
    return out;
  }

  /**
   * Where the client itself would put each start position on a preview of this
   * size, in that canvas's own pixels.
   *
   * The arithmetic is not reproduced here. It is *recorded* from the client's
   * own `drawStartLocations`: a throwaway canvas of the right size, and a
   * receiver whose `dxyToCanvas` reports every point the method works out. A
   * copy of the mapping in this file would be a second source of truth for
   * something that already depends on three of the client's own modules.
   *
   * Object.create rather than `new Renderer(...)`: the constructor wants the
   * string table and nothing under drawStartLocations reads it. The method also
   * calls IsoCoords.init, a static assignment — snapshot it and put it back, or
   * a preview parsed while a match is being set up corrupts the engine's own
   * world→screen mapping.
   */
  function startPositions(mapFile, width, height, factor) {
    const Renderer = state.modules.MapPreviewRenderer;
    const IsoCoords = state.modules.IsoCoords;
    if (!Renderer || !Renderer.prototype.drawStartLocations || !mapFile.startingLocations) return [];

    const probe = document.createElement("canvas");
    probe.width = width;
    probe.height = height;
    const ctx = probe.getContext("2d");
    if (!ctx) return [];
    // The client is handed a context that already carries the upscale (see
    // upscale()) and draws at point/factor to land on the right pixel. The
    // points we record are before that division — canvas pixels, which is what
    // both the detector and the dots want.
    ctx.scale(factor, factor);

    const points = [];
    const renderer = Object.create(Renderer.prototype);
    renderer.dxyToCanvas = function (...args) {
      const point = Renderer.prototype.dxyToCanvas.apply(this, args);
      // A COPY. The client divides the object it gets back by the scale before
      // drawing — `t.x /= s`, because the context it draws through already
      // carries the upscale — so keeping the reference meant every recorded
      // point was quietly halved or quartered a moment later. That put our dots
      // up in the top-left corner and made the detector sample bare terrain, so
      // it also reported every start position as unmarked.
      points.push({ x: point.x, y: point.y });
      return point;
    };

    const savedOrigin = IsoCoords ? IsoCoords.worldOrigin : undefined;
    try {
      renderer.drawStartLocations(probe, mapFile, PREVIEW_TARGET, factor);
    } catch (e) {
      console.warn(TAG, "start positions could not be worked out", e);
      return [];
    } finally {
      if (IsoCoords) IsoCoords.worldOrigin = savedOrigin;
    }
    return points;
  }

  /**
   * The vivid colours clustered near one start position, as buckets.
   *
   * Read off the decoded bitmap rather than the upscaled copy: upscaling
   * smooths, and a marker three pixels across comes out of it as a smear rather
   * than a colour.
   */
  function vividNear(bmp, x, y) {
    const { bright, spread, pixels } = NATIVE_MARK;
    const reach = Math.max(NATIVE_MARK.min, Math.round(Math.min(bmp.width, bmp.height) * NATIVE_MARK.reach));
    const counts = new Map();
    for (let dy = -reach; dy <= reach; dy++) {
      for (let dx = -reach; dx <= reach; dx++) {
        if (dx * dx + dy * dy > reach * reach) continue;
        const px = Math.round(x) + dx;
        const py = Math.round(y) + dy;
        if (px < 0 || py < 0 || px >= bmp.width || py >= bmp.height) continue;
        const i = (py * bmp.width + px) * 3;
        const r = bmp.data[i];
        const g = bmp.data[i + 1];
        const b = bmp.data[i + 2];
        const top = Math.max(r, g, b);
        if (top < bright || top - Math.min(r, g, b) < spread) continue;
        // Bucketed rather than exact: a marker drawn at one scale and stored at
        // another has edges, and its middle is what has to agree.
        const bucket = ((r >> 3) << 10) | ((g >> 3) << 5) | (b >> 3);
        counts.set(bucket, (counts.get(bucket) || 0) + 1);
      }
    }
    // A cluster, not a stray pixel: one vivid pixel is noise on any map.
    return new Set([...counts].filter(([, n]) => n >= pixels).map(([bucket]) => bucket));
  }

  /**
   * Does this map mark its own start positions?
   *
   * **The same colour at more than one of them** is the test, and it is the
   * whole point. "Is there something red near this spawn" finds red-brown rock
   * on every desert map — Arabian Oasis marks nothing and was read as marking
   * everything, so it got no dots of ours at all. A map that marks its spawns
   * draws the *same* marker at each one, which terrain does not do.
   *
   * Half of them, minimum two: a marker our search radius misses on one or two
   * positions must not overturn what the others plainly say.
   */
  function marksItsOwnSpawns(bmp, points, factor) {
    const tally = new Map();
    for (const point of points) {
      for (const colour of vividNear(bmp, point.x / factor, point.y / factor)) {
        tally.set(colour, (tally.get(colour) || 0) + 1);
      }
    }
    const need = Math.max(2, Math.ceil(points.length / 2));
    for (const seen of tally.values()) if (seen >= need) return true;
    return false;
  }

  /** A copy of the preview with the start positions nobody marked marked. */
  function drawSpawnDots(source, points) {
    const canvas = document.createElement("canvas");
    canvas.width = source.width;
    canvas.height = source.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(source, 0, 0);

    const radius = Math.max(
      SPAWN_DOT.min,
      Math.round(Math.min(canvas.width, canvas.height) * SPAWN_DOT.of)
    );
    ctx.fillStyle = SPAWN_DOT.fill;
    ctx.strokeStyle = SPAWN_DOT.ring;
    ctx.lineWidth = Math.max(1, radius / 3);
    for (const point of points) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fill();
      // A ring, because a red dot on a red-brown desert map is not a dot.
      ctx.stroke();
    }
    return canvas.toDataURL("image/png");
  }

  /**
   * The map's own preview — and, only when the map marks no start position at
   * all, a second copy with them marked.
   *
   * Nothing of ours is drawn on the first one. It used to carry the client's
   * numbered start locations, drawn here on purpose: those are the lobby's
   * furniture rather than part of the map, and a picture labelled 1..8 in yellow
   * is not "the map's own preview", which is what the card offers to show.
   *
   * **It is decided for the whole map, not per position.** The marker a map
   * draws and the start cell the client computes only roughly agree, so
   * per-position left a marked map with a second dot beside one of its own. A
   * map either marks its spawns or it does not — see marksItsOwnSpawns.
   *
   * @returns {{ raw: string, fixed: string|null, starts: number, missed: number }|null}
   */
  function renderPreview(mapFile) {
    if (typeof mapFile.decodePreviewImage !== "function") return null;
    const bmp = mapFile.decodePreviewImage();
    if (!bmp || !bmp.width || !bmp.height) return null; // map has no [PreviewPack]

    const flat = canvasFromRgb(bmp.data, bmp.width, bmp.height);
    const factor =
      flat.width < PREVIEW_TARGET.width / 2 || flat.height < PREVIEW_TARGET.height / 2 ? 4 : 2;
    const canvas = upscale(flat, factor);

    const points = startPositions(mapFile, canvas.width, canvas.height, factor);
    const marks = marksItsOwnSpawns(bmp, points, factor);
    return {
      raw: canvas.toDataURL("image/png"),
      fixed: !marks && points.length ? drawSpawnDots(canvas, points) : null,
      starts: points.length,
      missed: marks ? 0 : points.length,
    };
  }

  // --- Bridge to the isolated world (extension storage) ---------------------

  /** Shrink the preview to catalogue size; the options page shows it small. */
  function thumbnail(dataUrl) {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = Math.min(1, THUMB_WIDTH / img.width);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(img.width * scale));
          canvas.height = Math.max(1, Math.round(img.height * scale));
          const ctx = canvas.getContext("2d");
          if (!ctx) return resolve(dataUrl);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/png"));
        } catch (e) {
          note(`thumbnail failed, storing the full preview — ${e && e.message}`, "warn");
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }

  // --- Our own render -------------------------------------------------------

  /**
   * Render the map we are loading, once, off the critical path.
   *
   * Deferred to idle rather than run here: a big map is tens of millions of
   * pixel writes, and this fires while the client is still setting the match up.
   * Skipped entirely for a map already stored — a rematch on the same map should
   * cost nothing.
   */
  /**
   * What the renderer stamps its output with. Read off `__cdcHq` rather than
   * duplicated here: the renderer decides what a render looks like, so it is
   * the one that gets to say when an old one stopped counting. 0 while the
   * renderer has not loaded, which no stored stamp ever equals — so nothing is
   * mistaken for current before we can tell.
   */
  function rendererVersion() {
    return (window.__cdcHq && window.__cdcHq.RENDERER_VERSION) || 0;
  }

  /**
   * Ask the isolated world for a render this map already has in storage.
   *
   * Stored is not the same as *loaded*. Everything that shows our render reads
   * `state.hq`, which only a render made in this tab ever filled — so a map the
   * bulk run had already done skipped the render and left the swap, the
   * fullscreen view and both preview slots with nothing behind them. That is why
   * The full-render key stopped working once the catalogue was full: the picture existed, in
   * the half of the extension that cannot draw it.
   *
   * Called at capture time as well as from scheduleHqRender, because fetching a
   * stored image needs no theater art and scheduleHqRender does: it is chained
   * on GameLoader#load's promise, which settles about when the loading screen is
   * ending. Asking the moment the map is captured is what gets our render onto
   * that screen rather than just after it.
   */
  /**
   * Is this tab re-running a replay for the options page?
   *
   * Such a tab is a harvester with a screen nobody is looking at: the preview it
   * would fetch and the render it would make are for a human, and both are tens
   * of megabytes in a tab that has already been killed once for taking too much.
   * `src/replay-sim.js` publishes the flag; a tab where the user is watching a
   * replay themselves does not have it.
   */
  const harvesting = () => !!(window.__cdcSim && window.__cdcSim.busy && window.__cdcSim.busy());

  function wantStoredRender(key) {
    if (harvesting()) return;
    if (!key || state.hqWanted === key) return;
    if (state.hq && state.hq.key === key) return;
    // 0 while our renderer has not loaded, which no stored stamp equals — so a
    // render made by an older renderer is refetched, not mistaken for current.
    if (state.hqRendered.get(key) !== rendererVersion()) return;
    state.hqWanted = key;
    note(`render for "${key}" is stored — fetching it`);
    window.postMessage({ source: "cdc-page", type: "render-wanted", key }, "*");
  }

  function scheduleHqRender(mapFile) {
    if (harvesting()) {
      note("this tab is re-running a replay — no preview is drawn into it");
      return;
    }
    if (state.hqBusy) return;
    if (!window.__cdcHq || typeof window.__cdcHq.render !== "function") return;
    const key = state.map && state.map.facts.key;
    if (!key) return;

    // An alignment sample is asked for from the options page and is about this
    // map whether or not a render of it is already stored — the two are separate
    // errands that happen to want the same moment.
    const sampling = !!state.prefs.captureSample;
    // "Already stored" means stored *by this renderer*. A render made by an
    // older one is exactly what playing the map again should replace, which is
    // how a renderer change reaches the maps you actually play without a
    // catalogue-wide run.
    const here = !!(state.hq && state.hq.key === key);
    const inStorage = state.hqRendered.get(key) === rendererVersion();
    const rendering = !!state.prefs.autoRender && !here && !inStorage;

    // Normally already asked for at capture time; this is the map that was
    // captured before the renderer index arrived, or before our renderer loaded.
    wantStoredRender(key);

    if (!rendering && !sampling) return;

    const run = () => {
      if (rendering) renderHq(mapFile, key, sampling);
      else captureSample(mapFile);
    };
    if (typeof requestIdleCallback === "function") requestIdleCallback(run, { timeout: 8000 });
    else setTimeout(run, 2000);
  }

  /**
   * The same map again, split into per-type layers for the alignment panel on
   * the options page. A second render rather than a share of the first: that one
   * is downscaled and has the sprite corrections baked in, and the panel needs
   * neither — it measures those corrections.
   */
  function captureSample(mapFile) {
    if (!window.__cdcHq || typeof window.__cdcHq.sample !== "function") return;
    state.hqBusy = true;
    window.__cdcHq
      .sample({ mapFile })
      .then((result) =>
        note(
          `alignment sample captured — ${result.layerSize.width}×${result.layerSize.height}, ` +
            `${(result.layerBytes / 1048576).toFixed(1)} MB`
        )
      )
      .catch((e) => note(`alignment sample failed — ${e && e.message}`, "warn"))
      .then(() => {
        state.hqBusy = false;
      });
  }

  function renderHq(mapFile, key, thenSample) {
    state.hqBusy = true;
    window.__cdcHq
      .render({ mapFile, open: false, sizes: HQ_SIZES })
      .then((result) => {
        // The stamp travels with the render, all the way into storage: it is
        // the render's own property, not the storage layer's opinion of it.
        state.hq = {
          key,
          thumb: result.variants.thumb,
          full: result.variants.full,
          v: rendererVersion(),
          icons: result.icons || [],
        };
        state.hqRendered.set(key, state.hq.v);
        note(
          `rendered "${key}" — ${result.width}×${result.height}, ` +
            `${(result.bytes / 1048576).toFixed(1)} MB in ${result.ms} ms`
        );
        window.postMessage(
          { source: "cdc-page", type: "map-render", key, render: state.hq },
          "*"
        );
        renderIngame();
        refresh(); // in case the loading screen is somehow still up
      })
      .catch((e) => note(`render failed for "${key}" — ${e && e.message}`, "warn"))
      .then(() => {
        state.hqBusy = false;
        // One after the other, never at once: each is tens of millions of pixel
        // writes and the match is starting behind them.
        if (thenSample) captureSample(mapFile);
      });
  }

  // --- bulk render ----------------------------------------------------------

  /**
   * Render a list of maps in one go, without playing any of them.
   *
   * The request comes from the options page, which cannot do this itself: it has
   * no game client and therefore no theater art. So it asks through storage, the
   * bridge forwards, and the work happens here — the one place the art exists.
   *
   * Everything below uses the client's own path rather than a shortcut of ours.
   * `Engine.getMapList()` already holds every map this client knows, and
   * `MapFileLoader#load` already knows how to get one: the VFS first, the maps
   * CDN second. Nothing has to be hoarded during a match.
   */
  // `failed` and `report` are the last run's, kept after it ends: a storage
  // acknowledgement can arrive later than the run that caused it, and it belongs
  // in that run's failure list. See noteStoreFailure.
  const bulk = { running: false, failed: null, report: null };

  /**
   * What the run collects from the client itself, as opposed to from a map.
   *
   * The run used to do one thing to each map and choose between two bodies with
   * a boolean (`sample`). This is the same run with the choice made a list: the
   * tab, the wait for the client, the progress, the failure list, the log and
   * the close are shared, and each entry below is one more thing done once
   * before the maps are walked.
   *
   * Every entry answers the same four questions, because the run's whole value
   * is that one button explains itself:
   *
   *   `keys`    what it writes, so the run can report it and the log can name it
   *   `stamp`   what makes a stored copy current — see below
   *   `ready`   whether this tab can do it at all yet
   *   `run`     does it, returns one line saying what happened
   *
   * **A stamp is the client's version and the harvester's own**, joined. Either
   * alone is a bug waiting: the client's version alone means a change to *how*
   * we harvest never takes effect on a machine that already ran it, and the
   * harvester's own alone means new client art is never picked up. `sendRoster`
   * predates this and stamps with the client's version only; it is the obvious
   * second entry here, and folding it in is where that gets fixed.
   *
   * A harvester throwing is one line in the run's failure list. It does not
   * reach the maps, and the other harvesters still run.
   */
  const HARVESTERS = [
    {
      key: "cameos",
      label: "cameo sheet",
      keys: ["cameos"],
      /**
       * Both halves have to be up, and the second is the one that is late.
       *
       * `__cdcHq` exists as soon as its script tag runs, which is long before
       * the client has parsed anything — so a check for the function alone
       * answers yes to a page whose engine is still booting, and the harvest
       * finds out by throwing. `Engine.getRules()` is the question actually
       * being asked, and it throws "Rules must be loaded first" until the answer
       * is yes, which makes try/catch the cheap way to ask it.
       */
      ready: () => {
        if (!window.__cdcHq || typeof window.__cdcHq.cameos !== "function") return false;
        const Engine = state.modules && state.modules.Engine;
        if (!Engine || !Engine.vfs) return false;
        try {
          return !!Engine.getRules() && !!Engine.getArt();
        } catch (e) {
          // Not loaded yet. The caller retries; nothing is wrong.
          return false;
        }
      },
      stamp: () => `${clientVersion()}/${(window.__cdcHq && window.__cdcHq.CAMEO_VERSION) || "?"}`,
      stored: () => state.cameoVersion,
      async run() {
        const sheet = await window.__cdcHq.cameos();
        window.postMessage(
          {
            source: "cdc-page",
            type: "cameo-sheet",
            cameos: { version: this.stamp(), at: Date.now(), ...sheet },
          },
          "*"
        );
        // The count is the point of the line: this replaces a committed sheet,
        // and "how much of it came back" is the question a reader has.
        return (
          `${sheet.ids} ids as ${sheet.pictures} pictures` +
          (sheet.missing.length ? `, ${sheet.missing.length} without art` : "")
        );
      },
    },
    {
      key: "replayTypes",
      label: "object table",
      keys: ["replayTypes"],
      /**
       * The same two halves as the cameo sheet's `ready` above, minus the art:
       * nothing here is drawn. `Engine.vfs` is asked for all the same, because
       * the display names come out of `ra2.csf` through it.
       */
      ready: () => {
        if (!window.__cdcHq || typeof window.__cdcHq.objectTypes !== "function") return false;
        const Engine = state.modules && state.modules.Engine;
        if (!Engine || !Engine.vfs) return false;
        try {
          return !!Engine.getRules();
        } catch (e) {
          // Not loaded yet. The caller retries; nothing is wrong.
          return false;
        }
      },
      stamp: () => `${clientVersion()}/${(window.__cdcHq && window.__cdcHq.TYPES_VERSION) || "?"}`,
      stored: () => state.replayTypesVersion,
      async run() {
        // The map run's string table, not a second one: a display name is a CSF
        // key (`uiName`) until something resolves it, and `stringTable` is the
        // one thing in this extension that opens ra2.csf.
        const mods = await bulkModules();
        const table = await window.__cdcHq.objectTypes(stringTable(mods));
        window.postMessage(
          {
            source: "cdc-page",
            type: "replay-types",
            replayTypes: { version: this.stamp(), at: Date.now(), ...table },
          },
          "*"
        );
        // Counts, because this replaces a committed table and every number here
        // is a field read off the client under a name this extension does not
        // own — a zero says the client renamed one, in the log, on the first run
        // rather than in a report drawn from the table months later.
        return (
          `${table.objects} ids, ${table.named} named, ${table.factories} factories, ` +
          `${table.helipads} helipads, ${table.defences} defences, ${table.sided} side-locked` +
          (table.unknown.length ? `, ${table.unknown.length} with no rules of their own` : "")
        );
      },
    },
  ];

  /**
   * The harvest, without being asked for.
   *
   * A profile that never presses the button draws the sheet committed to this
   * repo — which is the artwork the harvest exists to stop shipping, so leaving
   * it behind a button leaves the problem in place for everyone who does not
   * read the options page. Running it on the way into the game is what makes
   * the committed sheet deletable.
   *
   * **A check, not a one-off.** It runs on every load and compares stamps: a
   * client that has not changed costs nothing, and one that has — new art, or a
   * change to how we harvest — is picked up without anyone noticing there was
   * something to pick up. That is the same question the button asks; this only
   * asks it earlier.
   *
   * Nothing is fetched and nothing is asked of the user, because there is
   * nothing to warn about: the art is already in the VFS the client loaded, so
   * this reads from disk, spends about a tenth of a second, and leaves ~470 KB
   * in the extension's own storage.
   *
   * **Never during a match.** The one real cost here is a tenth of a second of
   * the main thread, which is invisible on a menu and about six dropped frames
   * in a game. A config push arrives whenever settings change, so this can be
   * reached mid-match and has to say no.
   */
  let harvested = false;
  // Held for the length of one attempt, because `run()` is awaited and the
  // guard above it is not. Two config pushes arrive on a cold page — measured
  // 2026-08-20, the log carried every retry twice — and without this both walk
  // past `harvested`, both reach the client, and both write half a megabyte.
  let harvestBusy = false;
  let harvestRetries = 0;
  // One timer, not one per caller: the same two pushes each used to start their
  // own retry chain against a shared counter, which spent the whole budget in
  // half the time and said everything twice while doing it.
  let harvestTimer = 0;
  // Thirty tries ten seconds apart — five minutes, deliberately longer than
  // CLIENT_WAIT_MS. A cold browser took just over two minutes to have rules
  // (measured 2026-08-20), which the previous budget of two missed by seconds;
  // it only recovered because an unrelated config push happened to arrive
  // afterwards, and a feature that works by luck is a feature that does not.
  // The cost of a try is now a property read, since `ready` asks the client
  // rather than finding out by failing.
  const HARVEST_RETRIES = 30;
  const HARVEST_RETRY_MS = 10000;

  function retryHarvest() {
    if (harvested || harvestTimer || harvestRetries >= HARVEST_RETRIES) return;
    harvestRetries++;
    harvestTimer = setTimeout(() => {
      harvestTimer = 0;
      autoHarvest();
    }, HARVEST_RETRY_MS);
  }

  async function autoHarvest() {
    if (harvested || harvestBusy || state.combatant) return;
    const due = HARVESTERS.filter((job) => job.stamp() !== job.stored());
    if (!due.length) {
      harvested = true;
      return;
    }
    // hq-preview loads alongside this file and the client boots after both, so
    // the first idle callback of a cold page is always too early. Not a failure
    // — a reason to ask again, quietly. Asking `ready` rather than finding out
    // from a thrown `run()` is what keeps a booting client out of the log: it
    // used to file fourteen warnings about rules that were merely not loaded
    // yet, which is noise in the one place a real failure has to be visible.
    if (!due.every((job) => job.ready())) {
      retryHarvest();
      return;
    }
    harvestBusy = true;
    let failed = 0;
    try {
      for (const job of due) {
        try {
          note(`${job.label}: ${await job.run()}`);
        } catch (e) {
          // Past `ready`, so this is a real failure rather than an early one:
          // said out loud, and not counted as done, so the next try still comes.
          failed++;
          note(`${job.label} — ${(e && e.message) || e}`, "warn");
        }
      }
    } finally {
      harvestBusy = false;
    }
    if (failed) retryHarvest();
    else harvested = true;
  }

  /**
   * The modules a run needs, imported when one starts rather than at boot. None
   * of them is a hook, and a page that never runs a bulk render should not pay
   * for loading them.
   */
  async function bulkModules() {
    const sys = window.System || window.SystemJS;
    if (!sys || typeof sys.import !== "function") throw new Error("SystemJS not on the page");
    const [engine, loader, resource, csf, strings] = await Promise.all(
      [
        "engine/Engine",
        "gui/screen/game/MapFileLoader",
        "engine/ResourceLoader",
        "data/CsfFile",
        "data/Strings",
      ].map((id) => sys.import(id))
    );
    return {
      Engine: engine.Engine,
      MapFileLoader: loader.MapFileLoader,
      ResourceLoader: resource.ResourceLoader,
      CsfFile: csf.CsfFile,
      Strings: strings.Strings,
    };
  }

  /**
   * The client's string table, built the way the client builds it — the CSF out
   * of the VFS. A map's manifest carries a string *key*; the ladder reports the
   * resolved title; this is what turns one into the other.
   *
   * The fallback only strips a `NOSTR:` prefix, which is exactly what
   * `Strings#get` does for a key it does not hold. That covers every custom map
   * (their keys are all NOSTR:) and leaves a stock map matching on its raw
   * `Description`, which is usually its name anyway. A title that still fails to
   * match is reported per map rather than swallowed.
   */
  function stringTable(mods) {
    try {
      const file = mods.Engine.vfs.openFile(mods.Engine.getFileNameVariant("ra2.csf"));
      return new mods.Strings(new mods.CsfFile(file));
    } catch (e) {
      note(`no string table (${e && e.message}) — map titles resolve by name only`, "warn");
      return { get: (key) => String(key).replace(/^NOSTR:/i, "") };
    }
  }

  /**
   * This client's map list, indexed both ways it gets asked for.
   *
   * `byFile` is the one that answers correctly, because **a title does not
   * identify a map**: this client holds `tn04mw.map` and `tn04t2.map`, both
   * keyed `NAME:TOURNEY5`, so both are "Official Tournament Map B (2)" — and
   * the ladder plays the second. `byTitle` therefore holds a *list*, and is
   * only used when the pool has no file name for a map: one manifest is used,
   * several are reported rather than guessed between.
   *
   * `titleOf` is the same resolution keyed the other way — file name to title —
   * because that is the question the catalogue asks: it stores a map under its
   * file name and needs the name a human reads.
   *
   * @returns {{ byFile: Map<string, object>, byTitle: Map<string, object[]>,
   *            titleOf: Map<string, string> }}
   */
  function manifestIndex(mods, strings) {
    const byFile = new Map();
    const byTitle = new Map();
    const titleOf = new Map();
    const list = mods.Engine.getMapList();
    for (const manifest of (list && list.getAll()) || []) {
      try {
        byFile.set(manifest.fileName, manifest);
        const title = manifest.getFullMapTitle(strings);
        titleOf.set(manifest.fileName, title);
        const found = byTitle.get(title);
        if (found) found.push(manifest);
        else byTitle.set(title, [manifest]);
      } catch (e) {
        console.warn(TAG, "map manifest without a usable title", manifest, e);
      }
    }
    return { byFile, byTitle, titleOf };
  }

  /**
   * File name -> the title the client itself would print, built once per tab.
   *
   * **The game options are not a source of names.** `GameLoader#load` hands us
   * `opts.mapTitle`, and in a match started by anyone else that field comes off
   * the wire (`Parser#parseOptions`: base64 UTF-16, or the legacy encoder) — it
   * is whatever the host wrote, and in ranked play that turns out to be the
   * manifest's CSF *key*: `NOSTR:Emerald Lake`, `NAME:WEEK6`, `DESC:MP01DU`.
   * `Strings#get` strips a `NOSTR:` prefix unconditionally, so a key surviving
   * into the catalogue proves nothing ever resolved it.
   *
   * The client's own answer is one call away and cannot disagree with the client
   * — `MapManifest#getFullMapTitle(strings)`, the same call the bulk run uses.
   * Built lazily: it needs the map list and the CSF out of the VFS, and both are
   * there by the time a match loads.
   */
  let titles = null;
  let titlesJob = null;

  function mapTitles() {
    if (titles) return Promise.resolve(titles);
    if (!titlesJob) {
      titlesJob = (async () => {
        const mods = await bulkModules();
        titles = manifestIndex(mods, stringTable(mods)).titleOf;
        note(`map titles read from the client's own list — ${titles.size} maps`);
        return titles;
      })().catch((e) => {
        titlesJob = null; // a later map may find the client further along
        throw e;
      });
    }
    return titlesJob;
  }

  /**
   * Give the map in play the client's own name, and repair the catalogue once.
   *
   * Fire-and-forget on purpose: the card is written immediately with the name
   * the game options carried, so a map is never missing while this resolves, and
   * the card is rewritten under the same key if the answer differs.
   */
  function resolveName(facts) {
    if (!facts.file) return; // nothing to look a title up by
    mapTitles().then(
      (byFile) => {
        const title = byFile.get(facts.file);
        // The match may have moved on while the CSF was being read; rewriting
        // the previous map's card under this map's name is worse than leaving it.
        const current = state.map && state.map.facts;
        if (title && current && current.key === facts.key && title !== current.name) {
          note(`the game called this map "${current.name}"; the client calls it "${title}"`);
          current.name = title;
          // `state.map` holds the two pictures flat; publishMap takes them the
          // shape renderPreview returns. It was handed `state.map.dataUrl`
          // alone, so `preview.raw` was undefined, `thumbnail` resolved its own
          // undefined argument through img.onerror, and the rewritten card lost
          // its thumbnail — a rename made the map invisible in the catalogue it
          // was being renamed for.
          publishMap({ raw: state.map.dataUrl, fixed: state.map.dataUrlFixed }, current, state.lastMapFile);
          refresh();
          renderIngame();
        }
        repairNames();
      },
      (e) => note(`could not read the client's map titles — names stay as the game reported them (${e && e.message})`, "warn")
    );
  }

  /**
   * Every card in the catalogue, renamed to what the client calls that file.
   *
   * Once per tab, and only after a title index exists. A card is only rewritten
   * by the map being played or bulk-rendered, so without this a name that was
   * wrong when it was written stays wrong for a map you never play again — which
   * is most of a catalogue. The page cannot read storage, so it asks; the two
   * halves each do the part they can.
   */
  let namesRepaired = false;

  function repairNames() {
    if (namesRepaired || !titles) return;
    namesRepaired = true;
    window.postMessage({ source: "cdc-page", type: "names-wanted" }, "*");
  }

  /**
   * Which map a pool entry means, or why it cannot be said.
   *
   * @returns {{ manifest?: object, error?: string }}
   */
  function pickManifest(index, entry) {
    if (entry.file) {
      const manifest = index.byFile.get(entry.file);
      // The ladder named a file this install does not have — a map never
      // downloaded here, or one the client updated out from under the sample.
      return manifest ? { manifest } : { error: `the ladder plays ${entry.file}, which this client does not have` };
    }
    const found = index.byTitle.get(entry.title) || [];
    if (!found.length) return { error: "this client has no map by that title" };
    if (found.length === 1) return { manifest: found[0] };
    // Guessing here is what put the wrong "Official Tournament Map B" in the
    // catalogue, so it says so instead. Re-sampling the pool resolves it: the
    // sample reads the file name out of a replay.
    return {
      error:
        `${found.length} maps carry this title (${found.map((m) => m.fileName).join(", ")}) ` +
        "— press Find ladder maps again to resolve it by file",
    };
  }

  /**
   * The client's own map loader, pointed at the client's own maps URL.
   *
   * The base is read out of `config.ini` — same origin, the file the client
   * itself boots from — rather than written in here, so a client that moves its
   * maps takes us with it instead of leaving us fetching a dead host.
   */
  async function mapLoader(mods) {
    let base = "";
    try {
      const text = await fetch("/config.ini").then((r) => r.text());
      const match = text.match(/^\s*mapsBaseUrl\s*=\s*(\S+)/im);
      if (match) base = match[1];
      else note("config.ini has no mapsBaseUrl — only maps already on disk will load", "warn");
    } catch (e) {
      note(`could not read config.ini (${e && e.message}) — only local maps will load`, "warn");
    }
    return new mods.MapFileLoader(new mods.ResourceLoader(base), mods.Engine.vfs);
  }

  /**
   * One map: fetch it, render it, store it under the same key a played match
   * would have used.
   *
   * That last part is the whole reason `mapFacts` is called here rather than
   * something simpler being invented: the key is `opts.mapName` when the map is
   * played, which is the manifest's own `fileName`. Keying a bulk render any
   * other way would fill storage with a second copy of every map.
   *
   * `title` is the resolved display title, the same string a played match puts
   * in the catalogue — not `manifest.uiName`, which is the CSF *key* the title
   * is resolved from (`NOSTR:Heck Freezes Over LE`) and carries neither the
   * lookup nor the slot suffix.
   *
   * `force` is a single card's *Re-render*: the stored render is current and is
   * being replaced anyway, which is the only way to redo one that was made
   * before a renderer fix too small to have moved RENDERER_VERSION, or against
   * theater art that had not finished loading.
   *
   * @returns {string} what happened, for the run's own log
   */
  async function bulkOne(mods, loader, manifest, title, current, force) {
    const file = await loader.load(manifest.fileName);

    // The MapFile parse hooks fire on this too and cannot tell it from a map
    // about to be played, so they are muted around the parse — otherwise the
    // loading screen ends up describing whatever the run is working on.
    state.replaying = true;
    let mapFile;
    try {
      mapFile = new state.modules.MapFile(file);
    } finally {
      state.replaying = false;
    }

    const facts = mapFacts(mapFile, {
      file: manifest.fileName,
      title,
    });
    if (!facts.key) throw new Error("no storage key");

    // The catalogue entry first, and whether or not a render is due. It is what
    // carries the map's *name*, so a card named by an earlier run is repaired by
    // running again — which is worth nothing if the repair sits behind the
    // render, since a run whose renders are all current renders nothing. It is
    // also what gives the render a card to sit on for a map never played.
    // No `[PreviewPack]` in the file means no card, and a map with no card is
    // invisible in the catalogue however well it renders — so `card` travels
    // back with the outcome rather than the run reporting a clean render of a
    // map nobody will find.
    // Awaited, not fired off: the message it posts is what creates the card,
    // and a run that has moved on cannot be waited for by anything downstream.
    // See publishMap.
    const preview = renderPreview(mapFile);
    const card = preview
      ? await publishMap(preview, { ...facts, name: facts.name || manifest.fileName }, mapFile)
      : false;

    if (!force && state.hqRendered.get(facts.key) === current) return { what: "already current", card };

    const result = await window.__cdcHq.render({ mapFile, open: false, sizes: HQ_SIZES });
    state.hqRendered.set(facts.key, current);
    const made = {
      thumb: result.variants.thumb,
      full: result.variants.full,
      v: current,
      icons: result.icons || [],
    };
    window.postMessage({ source: "cdc-page", type: "map-render", key: facts.key, render: made }, "*");

    // The run can be handed the map this tab is sitting in — that is what a
    // single card's *Re-render* is for. Without this the slots would go on
    // showing the picture that was just replaced.
    if (state.map && state.map.facts.key === facts.key) {
      state.hq = { key: facts.key, ...made };
      renderIngame();
      refresh();
    }

    return { what: `${result.width}×${result.height} in ${result.ms} ms`, card };
  }

  /**
   * Capture the alignment sample from a map nobody is playing.
   *
   * The sample used to arrive one way only: tick *Capture layers from the next
   * map* and then go and load that map in a match. Every offset the panel exists
   * to measure therefore cost a game — and worse, the map you needed was the one
   * you had to get the lobby to give you. The layered render needs the client,
   * not the match: the same loader the pool run uses fetches any map this client
   * knows, and the theater is fetched if it has to be.
   *
   * The card is published on the way past for the same reason the pool run does
   * it: a map sampled but not catalogued is a map the panel can name and nothing
   * else can.
   */
  async function sampleOne(mods, loader, manifest, title) {
    const file = await loader.load(manifest.fileName);
    state.replaying = true;
    let mapFile;
    try {
      mapFile = new state.modules.MapFile(file);
    } finally {
      state.replaying = false;
    }

    const facts = mapFacts(mapFile, { file: manifest.fileName, title });
    if (!facts.key) throw new Error("no storage key");
    const preview = renderPreview(mapFile);
    if (preview) await publishMap(preview, { ...facts, name: facts.name || manifest.fileName }, mapFile);

    const result = await window.__cdcHq.sample({
      mapFile,
      key: facts.key,
      name: facts.name || manifest.fileName,
    });
    return { what: `${result.layerSize.width}×${result.layerSize.height} in layers`, card: !!preview };
  }

  /**
   * A map whose render was made and then not stored.
   *
   * The run counts a map as rendered when `__cdcHq.render` resolves, which is
   * true and not the whole truth: the picture then travels to the other world
   * and a write can fail there — a quota, a value too large, storage gone. That
   * left a run reporting "21 rendered, 0 failed" with a map that has no render
   * and, if the card write was the one that failed, no card either. The
   * acknowledgement always came back; nothing was listening for a bad one.
   *
   * Late by construction — the write is acknowledged after the map has been
   * moved on from, sometimes after the run has finished — so the run is
   * re-reported rather than the list being built only during the loop.
   */
  function noteStoreFailure(data) {
    if (!bulk.failed) return; // no run this session: the HUD line is the record
    const what = data.what === "render" ? "render" : data.what === "names" ? "names" : "card";
    bulk.failed.push(`${data.key || "the catalogue"} — the ${what} could not be stored: ${data.error}`);
    if (bulk.report) bulk.report("", !bulk.running);
  }

  // A tab opened for this run is still booting when the request arrives: the
  // client downloads its base data, parses rules and builds the map list before
  // any of the run can work. Waiting is the whole point — "no game tab" is the
  // thing the auto-opened tab exists to stop happening, and it must not come
  // back as "the tab is not ready yet".
  const CLIENT_WAIT_MS = 180000;

  /**
   * Block until the client can answer for its own maps, or give up saying so.
   *
   * The map list is the readiness test because it is the first thing the run
   * asks for and it exists only after rules, the VFS and `loadMapList` are all
   * done. Everything thrown along the way is a stage of booting, not a failure.
   */
  async function waitForClient(report) {
    const started = Date.now();
    const deadline = started + CLIENT_WAIT_MS;
    let waited = false;
    let said = 0;
    for (;;) {
      try {
        const mods = await bulkModules();
        const list = mods.Engine.getMapList();
        if (list && typeof list.getAll === "function" && list.getAll().length) {
          if (waited) note("the game client finished loading — starting the run");
          return mods;
        }
      } catch (e) {
        // Thrown for as long as rules are unloaded. Normal while booting.
      }
      if (Date.now() > deadline) throw new Error("the game client did not finish loading");
      const seconds = Math.round((Date.now() - started) / 1000);
      // Every few seconds, not once: this is the only thing the run writes
      // while it waits, and the options page reads the time of the last write
      // to tell a run that is waiting from one whose tab has gone away.
      if (!waited || seconds - said >= 5) {
        if (!waited) note("waiting for the game client to finish loading");
        waited = true;
        said = seconds;
        report(`waiting for the game client (${seconds}s)`);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  /**
   * The run. Sequential on purpose: each render is tens of millions of pixel
   * writes against the same GPU and heap the game uses, and doing several at
   * once would trade a run you can leave alone for a tab you cannot use.
   */
  async function bulkRender(maps, force, sampling, harvest) {
    if (bulk.running) {
      note("a bulk render is already running");
      return;
    }
    // A harvest asks the client for its own data and never renders, so it must
    // not be refused for a renderer it does not use. Only the map half needs it.
    if (maps.length && (!window.__cdcHq || typeof window.__cdcHq.render !== "function")) {
      note("the renderer is not loaded — reload the game tab", "warn");
      return;
    }
    // Every harvester that was asked for, narrowed to the ones that can
    // actually run once the client is up — see below. NOT filtered here:
    // `ready()` answers `Engine.getRules()`, which throws until the archives are
    // parsed, so in a tab this run has just opened every harvester looks
    // unavailable. Asked at this point, a harvest-only run skipped all of them
    // and returned "nothing to do" before reaching `waitForClient` — the one
    // call that would have waited for exactly this.
    let jobs = harvest ? HARVESTERS.slice() : [];
    if (!maps.length && !jobs.length) {
      note("nothing to do — no maps ticked and nothing to harvest", "warn");
      return;
    }
    bulk.running = true;
    // The auto-render must not start a second job underneath this one.
    state.hqBusy = true;

    const failed = [];
    let done = 0;
    let rendered = 0;
    // A map the current renderer has already drawn is not drawn again, and a run
    // repeated over a pool that is fully rendered skips every single map. Counted
    // apart from `rendered` because the two answer different questions: the run
    // did no work, and the pool wants for nothing. Reported as one number — which
    // maps were skipped is in the log, a line per map.
    let skipped = 0;
    const report = (active, finished) =>
      window.postMessage(
        {
          source: "cdc-page",
          type: "bulk-progress",
          done,
          // Harvesters are items of the run like maps are, so one progress line
          // covers both and the page needs no second widget to show a harvest.
          total: maps.length + jobs.length,
          rendered,
          skipped,
          active: active || "",
          failed,
          finished: !!finished,
        },
        "*"
      );
    // Held on `bulk` so a storage acknowledgement can still reach the run's own
    // failure list — those arrive after the map they belong to, and sometimes
    // after the whole run. See noteStoreFailure.
    bulk.failed = failed;
    bulk.report = report;

    try {
      report(maps.length ? "reading the map list" : "waiting for the game client");
      const mods = await waitForClient(report);

      // Now, with rules parsed. Named rather than counted: a harvester silently
      // absent is the failure this run exists to make visible, and reached here
      // "not ready" means something is wrong rather than merely early.
      if (jobs.length) {
        const able = jobs.filter((h) => h.ready());
        for (const h of jobs) {
          if (!h.ready()) note(`${h.label}: cannot run in this tab yet — skipped`, "warn");
        }
        jobs = able;
      }

      // The client's own data first, and only then the maps: a harvest is a
      // tenth of a second and a map render is seconds each, so a run that dies
      // half way has still done the cheap half.
      for (const job of jobs) {
        report(job.label);
        try {
          const want = job.stamp();
          if (!force && want && want === job.stored()) {
            skipped++;
            note(`${job.label}: already current (${want})`);
          } else {
            const what = await job.run();
            rendered++;
            note(`${job.label}: ${what}`);
          }
        } catch (e) {
          // One harvester failing is one line. The others run, the maps run,
          // and whatever this one wrote last time is still in storage.
          failed.push(`${job.label} — ${(e && e.message) || e}`);
        }
        done++;
        report(job.label);
      }

      // Neither the map list nor the config.ini fetch behind the loader is worth
      // paying for in a run that was only ever going to harvest.
      if (maps.length) {
        const index = manifestIndex(mods, stringTable(mods));
        // The run and a played match then name maps from the same table, and the
        // sweep below has one to compare against even in a tab that played nothing.
        titles = index.titleOf;
        const loader = await mapLoader(mods);
        const current = rendererVersion();

        for (const entry of maps) {
          const title = entry.title || entry.file || "";
          report(title);
          const picked = pickManifest(index, entry);
          if (picked.error) {
            failed.push(`${title} — ${picked.error}`);
          } else {
            try {
              // The card is named by the client, not by the ladder: the two agree
              // on most maps, and where they do not it is the client's list the
              // rest of the extension is keyed against. The run's own log keeps
              // the ladder's title, which is what was ticked.
              const named = index.titleOf.get(picked.manifest.fileName) || title;
              // Same list, same loader, same reporting — a different thing done to
              // each map. A sampling run is always one map: there is one sample.
              const outcome = sampling
                ? await sampleOne(mods, loader, picked.manifest, named)
                : await bulkOne(mods, loader, picked.manifest, named, current, force);
              if (outcome.what === "already current") skipped++;
              else rendered++;
              if (!outcome.card) {
                failed.push(`${title} — the map file has no preview, so there is no card to show it on`);
              }
              note(`bulk: ${title} [${picked.manifest.fileName}] — ${outcome.what}`);
            } catch (e) {
              // A theater the client never downloaded fails exactly here, and it
              // fails one map rather than the run: the next map may well be in a
              // theater that is loaded.
              failed.push(`${title} — ${(e && e.message) || e}`);
            }
          }
          done++;
          report(title);
        }
      }
    } catch (e) {
      failed.push(`run failed — ${(e && e.message) || e}`);
    } finally {
      bulk.running = false;
      state.hqBusy = false;
      report("", true);
      // Three shapes of run share this line, and calling a harvest "0 rendered
      // of 0" was the kind of summary that makes a reader distrust the rest.
      const kind = sampling ? "layer capture" : maps.length ? "bulk render" : "harvest";
      const verb = sampling ? "captured" : maps.length ? "rendered" : "harvested";
      note(
        `${kind} finished — ${rendered} ${verb} of ${maps.length + jobs.length}` +
          (skipped ? `, ${skipped} already current` : "") +
          (failed.length ? `, ${failed.length} failed` : "")
      );
      // The run touched the maps it was given; the catalogue holds every map
      // ever played, and those cards are named by whatever reported them.
      repairNames();
    }
  }

  /**
   * Whether a preview slot should show our render rather than the client's.
   *
   * Two sources, most specific first: this map's own setting on its card, and
   * the in-game default. The swap hotkey used to be a third, held in this tab
   * and lost with it; it now writes one of these two instead, so what it did is
   * still true after a reload and the options page can show it.
   */
  function hqShown() {
    if (!state.hq) return false;
    const chosen = state.map && state.previewSrc[state.map.facts.key];
    if (chosen) return chosen === "ours";
    return !!state.prefs.preferHqPreview;
  }

  /**
   * The picture a preview slot shows: ours when there is one, the client's
   * baked-in bitmap otherwise.
   *
   * `size` picks the variant, and the two are different pictures rather than one
   * at two scales (HQ_SIZES). The loading-screen panel is half the screen, so it
   * takes `full` — the compact thumb's marks are drawn for a box a tenth of that
   * width and read as blobs when blown up. The in-game box sits on the radar,
   * which is the size `thumb` exists for.
   *
   * `ours` travels with the picture because the two want opposite scaling: the
   * client's preview is a low-res bitmap blown up, which only survives nearest
   * neighbour, and ours is always being scaled *down*, which nearest neighbour
   * would alias into a mess.
   *
   * @returns {{ src: string, ours: boolean } | null}
   */
  function previewSource(size) {
    if (hqShown()) {
      // `size` is what was asked for; `slot` is what came back. They differ when
      // the full-size image is gone from storage and the thumb stands in — and
      // the thumb has its badges baked in, so the overlay must not double them.
      const slot = size === "full" && state.hq.full ? "full" : "thumb";
      const src = slot === "full" ? state.hq.full : state.hq.thumb;
      if (src) return { src, ours: true, size: slot };
    }
    const own = state.map && originalPreview(state.map);
    return own ? { src: own, ours: false } : null;
  }

  /**
   * The full render's tech-building badges, over an <img> showing it.
   *
   * The render itself no longer carries them (RENDERER_VERSION 7): it hands back
   * where they go, in fractions of the picture, and they are painted here. That
   * is what makes them switchable — `prefs.fullIcons` off is a canvas that is
   * not drawn, not a 3000px map re-rendered.
   *
   * Fractions mean the same list serves the half-screen loading panel and the
   * 90%-of-viewport overlay without either knowing the render's pixel size. The
   * canvas is sized to the image's *displayed* box, so the badge keeps the size
   * on screen it had when it was baked in.
   *
   * @param {Element} host   the positioned element the <img> sits in
   * @param {Element} img    the <img> itself
   * @param {Array}   icons  what render() handed back, or nothing
   */
  function paintIcons(host, img, icons) {
    let canvas = host.querySelector(".cdc-icon-layer");
    const wanted = state.prefs.fullIcons !== false && icons && icons.length;
    if (!wanted) {
      if (canvas) canvas.remove();
      return;
    }
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.className = "cdc-icon-layer";
      host.appendChild(canvas);
    }
    // The image may not have laid out yet — on the loading screen the panel is
    // built and filled in the same frame — so a zero box means come back on load
    // rather than draw nothing and never try again.
    const box = paintedRect(img);
    if (!box) {
      img.addEventListener("load", () => paintIcons(host, img, icons), { once: true });
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    canvas.style.left = box.x + "px";
    canvas.style.top = box.y + "px";
    canvas.style.width = box.width + "px";
    canvas.style.height = box.height + "px";
    canvas.width = Math.round(box.width * dpr);
    canvas.height = Math.round(box.height * dpr);
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, box.width, box.height);
    icons.forEach((icon) => {
      window.__cdcGlyphs.drawGlyph(
        ctx,
        icon.glyph,
        icon.x * box.width,
        icon.y * box.height,
        icon.size * box.width,
        icon.color
      );
    });
  }

  /**
   * Where the picture actually is inside its <img>, relative to the positioned
   * ancestor — which is not the element's own box. The loading-screen slot is
   * `object-fit: contain`, so a wide map in a tall box is letterboxed, and
   * fractions measured against the element would put every badge off the map.
   *
   * @returns {{x: number, y: number, width: number, height: number}|null}
   */
  function paintedRect(img) {
    const w = img.clientWidth;
    const h = img.clientHeight;
    const nw = img.naturalWidth;
    const nh = img.naturalHeight;
    if (!w || !h || !nw || !nh) return null;
    const scale = Math.min(w / nw, h / nh);
    const width = nw * scale;
    const height = nh * scale;
    return {
      x: img.offsetLeft + (w - width) / 2,
      y: img.offsetTop + (h - height) / 2,
      width,
      height,
    };
  }

  /**
   * The map's own preview, with the start positions it left unmarked marked —
   * unless this map's card says not to. Set per map in the options page, on by
   * default, because a start position you cannot see is the one thing the
   * client's numbers were there for.
   */
  function originalPreview(map) {
    if (!map.dataUrlFixed) return map.dataUrl;
    return state.spawnFix[map.facts.key] === false ? map.dataUrl : map.dataUrlFixed;
  }

  /**
   * Swap both in-game previews, and keep the answer.
   *
   * It writes the in-game default rather than a flag held in this tab: the flag
   * died with the tab, and the options page — which shows the same setting as a
   * tick-box — never learned that a key had contradicted it.
   *
   * The map's own setting is cleared in the same write. It outranks the default
   * (hqShown), so a map whose card says "original" would swallow the swap
   * silently: the key would write the default, the card would go on deciding,
   * and nothing on screen would move. Dropping it is also the more faithful
   * reading — a swap pressed while looking at this map is a statement about
   * this map, and the card's is the one being overruled.
   */
  function toggleHqPreview() {
    if (!state.hq) {
      note("no render for this map yet — it is made once the match has loaded", "warn");
      return;
    }
    const next = !hqShown();
    const key = state.map && state.map.facts.key;
    const hadOwn = !!(key && state.previewSrc[key]);

    // Applied here as well as written, because the write goes to the other
    // world and comes back as a config push a few milliseconds later. A preview
    // that changes on the next frame is what the key is for.
    state.prefs = { ...state.prefs, preferHqPreview: next };
    if (hadOwn) {
      state.previewSrc = { ...state.previewSrc };
      delete state.previewSrc[key];
    }
    window.postMessage(
      {
        source: "cdc-page",
        type: "prefs-set",
        prefs: { preferHqPreview: next },
        clearPreviewSrc: hadOwn ? key : null,
      },
      "*"
    );

    note(
      `preview: ${next ? "our render" : "the client's own"} — saved as the in-game default` +
        (hadOwn ? `, and this map's own setting cleared` : "")
    );
    renderIngame();
    // The swap owns both slots, so it has to redraw both — the loading screen is
    // where a preview is looked at longest.
    refresh();
  }

  /**
   * The whole render, over the game, at the size a map is actually read at.
   * Deliberately not opaque: you are looking at it mid-match, and the game
   * underneath still has to be visible enough to tell you it is still there.
   */
  function toggleHqFull(force) {
    const wanted = force === undefined ? !state.hqFullVisible : !!force;
    const existing = document.querySelector(".cdc-hq-full");
    if (existing) existing.remove();
    state.hqFullVisible = wanted;
    if (!wanted) return;

    if (!state.hq) {
      note("no render for this map yet — it is made once the match has loaded", "warn");
      state.hqFullVisible = false;
      return;
    }
    if (!state.hq.full) {
      // The thumb survived and the full-size image did not: storage evicts them
      // together, so this is a write that half failed rather than normal wear.
      // Blowing the thumb up to 90% of the viewport would be a worse answer
      // than saying so.
      note("the full-size render for this map is not in storage — play it again to remake it", "warn");
      state.hqFullVisible = false;
      return;
    }
    const el = document.createElement("div");
    el.className = "cdc-hq-full";
    el.style.setProperty("--cdc-hq-size", HQ_FULL.size);
    el.style.setProperty("--cdc-hq-opacity", String(HQ_FULL.opacity));
    const img = document.createElement("img");
    img.src = state.hq.full;
    img.alt = "";
    el.append(img);
    paintIcons(el, img, state.hq.icons);
    // Click anywhere to dismiss: mid-match, hunting for the hotkey again is the
    // last thing you want.
    el.addEventListener("mousedown", () => toggleHqFull(false));
    document.body.append(el);
  }

  /**
   * Hand the map to the isolated world so it lands in the options catalogue.
   *
   * **Returns the promise, and a bulk run waits on it.** Both thumbnails are
   * image decodes, so the `map-seen` message is posted tens of milliseconds
   * after this is called — after the caller has moved on, and, for the last map
   * of a run, after the run has reported itself finished. The tab a run was
   * opened in is closed on that report, and the message was still unsent: the
   * render was stored and the card silently was not, which is how a map ended
   * up with a full render nothing in the catalogue could find.
   *
   * The survey travels with the card rather than with the render, because the
   * two are due at different times: a render is skipped when the stored one is
   * current, and what a map holds would then never be written for any map
   * already rendered. It is also the cheaper half — no theater, no sprites —
   * so a card is never held up waiting for art.
   */
  function publishMap(preview, facts, mapFile) {
    if (!facts.key) {
      note("map has no file name, [Basic] Name or digest — cannot be catalogued", "warn");
      return Promise.resolve(false);
    }
    // Two pictures only when they differ: a map that marks its own start
    // positions is one thumbnail, and the card has nothing to offer a toggle for.
    return Promise.all([
      thumbnail(preview.raw),
      preview.fixed ? thumbnail(preview.fixed) : null,
      surveyOf(mapFile),
    ]).then(([thumb, thumbFixed, objects]) => {
      window.postMessage(
        {
          source: "cdc-page",
          type: "map-seen",
          map: { key: facts.key, name: facts.name, thumb, thumbFixed, facts, objects },
        },
        "*"
      );
      return true;
    });
  }

  /**
   * The map's contents, or null and a line in the log.
   *
   * A card is worth more than an index of what is on the map, so a survey that
   * throws — a ruleset that cannot answer, a map shape the walk did not expect —
   * must not take the catalogue entry down with it. Never silent: an index
   * quietly missing for half the pool is worse than one that is missing loudly.
   */
  function surveyOf(mapFile) {
    if (!mapFile || !window.__cdcHq || typeof window.__cdcHq.survey !== "function") {
      return Promise.resolve(null);
    }
    return window.__cdcHq.survey(mapFile).catch((e) => {
      note(`survey failed — the card is stored without its contents (${e && e.message})`, "warn");
      return null;
    });
  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "cdc-bridge") return;

    state.bridge = "connected";

    if (data.type === "stored") {
      if (!data.ok) noteStoreFailure(data);
      // A rename touches many cards and names none of them; everything else is
      // one map's map or render.
      if (data.what === "names") {
        note(
          data.ok
            ? `renamed ${data.count} card(s) in the catalogue`
            : `could not rename the catalogue's cards: ${data.error}`,
          data.ok ? "info" : "warn"
        );
        return;
      }
      // The harvest is neither, and saying so matters twice over: it is not one
      // map's anything, and the count that comes back with it is a number of
      // cameo ids. Falling through to the map branch put 405 into
      // `state.catalogue`, which the debug panel then drew as maps catalogued.
      if (data.what === "cameos") {
        note(
          data.ok
            ? `stored the cameo sheet — ${data.count} id(s)`
            : `could not store the cameo sheet: ${data.error}`,
          data.ok ? "info" : "warn"
        );
        return;
      }
      // The object table, on the same terms and for the same reason: its count
      // is a number of ordinals, and falling through would put it into
      // `state.catalogue`, which the debug panel draws as maps catalogued.
      if (data.what === "replayTypes") {
        note(
          data.ok
            ? `stored the object table — ${data.count} id(s)`
            : `could not store the object table: ${data.error}`,
          data.ok ? "info" : "warn"
        );
        return;
      }
      const what = data.what === "render" ? "render" : "map";
      if (what === "map") state.catalogue = data.count;
      note(
        data.ok
          ? `stored the ${what} for "${data.key}" — ${data.count} ${what}(s) kept`
          : `could not store the ${what} for "${data.key}": ${data.error}`,
        data.ok ? "info" : "warn"
      );
      return;
    }

    if (data.type === "render-have") {
      const key = state.map && state.map.facts.key;
      state.hqWanted = null;
      if (!data.render) {
        note(`storage has no render for "${data.key}" after all`, "warn");
      } else if (data.key !== key) {
        // It arrived for a map that is no longer the one loading. Taking it
        // would put the previous match's picture behind this match's hotkeys.
        note(`ignoring a render for "${data.key}" — the map in play is "${key}"`, "warn");
      } else {
        state.hq = {
          key,
          thumb: data.render.thumb,
          full: data.render.full,
          v: data.render.v,
          icons: data.render.icons || [],
        };
        note(`render for "${key}" loaded from storage`);
        renderIngame();
        // It usually arrives while the loading screen is still up, which is the
        // whole point of asking this early — so redraw it with ours in the slot.
        refresh();
      }
      return;
    }

    if (data.type === "names-have") {
      // The bridge holds the catalogue, this half holds the client. Only the
      // differences go back, so a catalogue that is already right costs one
      // message and no write.
      const fixes = {};
      let checked = 0;
      let unknown = 0;
      for (const [key, name] of Object.entries(data.names || {})) {
        checked++;
        const title = titles && titles.get(key);
        if (!title) unknown++; // a map this client no longer has: leave its card alone
        else if (title !== name) fixes[key] = title;
      }
      const count = Object.keys(fixes).length;
      if (count) window.postMessage({ source: "cdc-page", type: "map-names", names: fixes }, "*");
      note(
        `catalogue names: ${checked} checked, ${count} renamed` +
          (unknown ? `, ${unknown} not in this client's map list` : "")
      );
      return;
    }

    if (data.type === "settings-job") {
      runSettingsJob(data.mode, data.want, data.payload);
      return;
    }

    if (data.type === "bulk-run") {
      bulkRender(
        Array.isArray(data.maps) ? data.maps : [],
        !!data.force,
        !!data.sample,
        !!data.harvest
      );
      return;
    }

    if (data.type !== "config") return;
    // The manifest's own version, over the only wire that can carry it.
    if (data.version) {
      VERSION = data.version;
      announce();
    }
    if (typeof data.count === "number") state.catalogue = data.count;

    if (data.keys) {
      state.keys = ownKeys({ ...state.keys, ...data.keys });
      renderHud();
    }

    if (data.builds) {
      state.builds = data.builds;
      renderHud();
    }

    if (Array.isArray(data.commandKeys)) state.commandKeys = data.commandKeys;

    if (data.chords) {
      state.chords = data.chords;
      // A grid open while the options page is edited redraws against the new
      // layout rather than holding the one it was built with.
      renderChord();
      renderHud();
    }

    // What the stored roster was harvested from. Held so a tab that already
    // agrees with storage does not re-parse rules.ini to say the same thing.
    if (typeof data.rosterVersion === "string") state.rosterVersion = data.rosterVersion;
    // The stamp only, never the sheet: the pictures are hundreds of kilobytes
    // and this tab already has a committed copy to draw from. What it needs
    // from storage is whether a harvest is still worth running.
    if (typeof data.cameoVersion === "string") state.cameoVersion = data.cameoVersion;
    // The same for the object table: the stamp travels, the 400-odd rows do not.
    if (typeof data.replayTypesVersion === "string") {
      state.replayTypesVersion = data.replayTypesVersion;
    }
    // The colour table, whole rather than as a stamp — see sendColours.
    if (data.colours && data.colours.colors) state.colours = data.colours;
    // At idle, because it parses the whole of rules.ini: nothing waits on the
    // roster, and the alternative is a stutter on a page that has just loaded.
    // `requestIdleCallback` is not in every engine the extension claims to
    // support, hence the timeout behind it.
    const harvest = () => {
      sendRoster();
      sendColours();
      autoHarvest();
    };
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(harvest, { timeout: 10000 });
    } else {
      setTimeout(harvest, 2000);
    }

    if (data.prefs) {
      const badgesWere = state.prefs.fullIcons !== false;
      const preferredWas = state.prefs.preferHqPreview;
      state.prefs = { ...state.prefs, ...data.prefs };
      // Both of the chord preferences take effect on the next press, except
      // this one, which has a browser-side lock to take or give back.
      syncKeyLock();
      // Ticking the badges off stops the loop; ticking them on starts it.
      syncBadges();
      renderIngame();
      // Both of these change a picture that is already on screen, and the
      // loading-screen panel is repainted by `refresh` rather than by
      // `renderIngame` — without it the swap key would move the overlay and
      // leave the panel behind it showing the other picture.
      if (
        badgesWere !== (state.prefs.fullIcons !== false) ||
        preferredWas !== state.prefs.preferHqPreview
      ) {
        refresh();
        if (state.hqFullVisible) toggleHqFull(true);
      }
    }

    // Straight through to the renderer: it has no wire to storage of its own,
    // and these six pairs decide where every sprite it draws lands. Guarded the
    // way every other call into it is — the renderer is a separate script and a
    // failure to load it must not take the guides down with it.
    if (data.spriteFix) {
      state.spriteFix = data.spriteFix;
      if (window.__cdcHq && typeof window.__cdcHq.setFix === "function") {
        window.__cdcHq.setFix(state.spriteFix);
      }
    }

    // The same wire for the per-object corrections — the airport and anything
    // else that turns out not to sit where its type does.
    if (data.spriteFixByName) {
      state.spriteFixByName = data.spriteFixByName;
      if (window.__cdcHq && typeof window.__cdcHq.setFixByName === "function") {
        window.__cdcHq.setFixByName(state.spriteFixByName);
      }
    }

    if (data.previewSrc || data.spawnFix) {
      if (data.previewSrc) state.previewSrc = data.previewSrc;
      if (data.spawnFix) state.spawnFix = data.spawnFix;
      // Both slots: a card switched between our render and the map's own is
      // most likely being switched while looking at the loading screen.
      renderIngame();
      refresh();
    }
    // Which maps have a stored render and which renderer made it, so we redo
    // the ones that are behind and skip only the ones that are not.
    if (data.renders) state.hqRendered = new Map(Object.entries(data.renders));

    const before = JSON.stringify(state.guides);
    state.guides = data.guides || {};
    if (JSON.stringify(state.guides) === before) return;

    // Edits in the options page must show up in the running game rather than
    // waiting for the next match.
    refresh();
    renderIngame();
    const own = currentGuide();
    note(`guide updated from the options page — ${own ? own.length : 0} characters for this map`);
  });

  /** The user's guide for the map in play, or "". */
  function currentGuide() {
    if (!state.map || !state.map.facts.key) return "";
    const stored = state.guides[state.map.facts.key];
    // Guides used to be stored as an array of one-liners; keep those readable.
    if (Array.isArray(stored)) return stored.join("\n");
    return typeof stored === "string" ? stored : "";
  }

  // --- Map facts and hints --------------------------------------------------

  function theaterName(value) {
    const enumObj = state.modules.TheaterType;
    if (!enumObj || value === undefined) return "";
    const hit = Object.keys(enumObj).find((k) => enumObj[k] === value && isNaN(Number(k)));
    return hit || "";
  }

  /**
   * `key` identifies the map for hints and the catalogue, `name` is what a
   * human reads. The file name is the key of choice — it is stable across
   * renames of the title and unique per map — with [Basic] Name and the map
   * digest as fallbacks, so a map is never dropped for lack of a name.
   */
  function mapFacts(mapFile, identity) {
    const id = identity || {};
    const basic = typeof mapFile.getSection === "function" ? mapFile.getSection("Basic") : null;
    const basicName = (basic && basic.getString && basic.getString("Name")) || "";
    const starts = mapFile.startingLocations;
    const size = mapFile.localSize || mapFile.fullSize || {};
    return {
      key: id.file || basicName || id.digest || "",
      name: id.title || basicName || id.file || "",
      file: id.file || "",
      players: starts ? (starts.size !== undefined ? starts.size : starts.length) : 0,
      width: size.width || 0,
      height: size.height || 0,
      theater: theaterName(mapFile.theaterType),
    };
  }

  /** Hints derived from the map itself, most specific first. */
  /**
   * The rotating one-liners: facts about this map, then the generic advice. The
   * user's own writing is NOT here — it is a guide, shown whole in its own
   * panel, because a paragraph does not belong in a rotating slot.
   */
  function buildHints(f) {
    const hints = [];

    if (f.players === 2) {
      hints.push(
        "Two start positions: there is nowhere to hide an expansion. Scout the one approach and commit to a plan early."
      );
    } else if (f.players >= 6) {
      hints.push(
        `${f.players} start positions — check the player list above: on a map this crowded you may have two neighbours, not one.`
      );
    }

    const cells = f.width * f.height;
    if (cells) {
      if (cells <= 80 * 80) {
        hints.push(
          `Tight map (${f.width}×${f.height}): rush distance is short. Wall the choke and keep a defender at home from the first minute.`
        );
      } else if (cells >= 130 * 130) {
        hints.push(
          `Large map (${f.width}×${f.height}): there is room to expand. A second refinery pays off here before a second war factory does.`
        );
      }
    }

    if (/urban/i.test(f.theater)) {
      hints.push(
        "Urban theater: infantry garrison civilian buildings. Clear them before walking a tank column past."
      );
    } else if (/snow/i.test(f.theater)) {
      hints.push("Snow theater: open sightlines and few blockers — long-range units get more value than usual.");
    } else if (/desert/i.test(f.theater)) {
      hints.push("Desert theater: little cover. Expect the fight to be decided in the open field.");
    }

    return hints.concat(GENERIC_HINTS);
  }

  // --- Panels ---------------------------------------------------------------

  /** Why there is no preview, in words the loading screen itself can show. */
  function missingPreviewReason() {
    const sys = window.System || window.SystemJS;
    if (!sys) return "SystemJS missing on the page";
    if (!Object.keys(state.modules).length) return "client modules not loaded yet";
    const installed = Object.keys(state.hooks).filter((k) => state.hooks[k]);
    if (!installed.length) return "no capture hook installed";
    if (!state.captureSource) return `no map captured (hooks: ${installed.join(",")})`;
    return `captured via ${state.captureSource} but no preview decoded`;
  }

  function mountMapPanel(screen) {
    // A failure has to be visible where the thing should have been: the loading
    // screen is too short-lived to debug from the console.
    if (!state.map) {
      let box = screen.querySelector(".cdc-map-error");
      if (!box) {
        box = document.createElement("div");
        box.className = "cdc-map-error";
        box.style.left = PANEL.left;
        box.style.right = PANEL.right;
        box.style.top = PANEL.top;
        screen.appendChild(box);
      }
      box.textContent = `map preview unavailable — ${missingPreviewReason()} (v${VERSION})`;
      return;
    }
    let panel = screen.querySelector(".cdc-map");
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "cdc-map";
      panel.style.left = PANEL.left;
      panel.style.right = PANEL.right;
      panel.style.top = PANEL.top;
      panel.innerHTML = '<img class="cdc-map-img" alt=""><div class="cdc-map-facts"></div>';
      screen.appendChild(panel);
    }
    panel.style.bottom = PANEL.bottom;
    const img = panel.querySelector(".cdc-map-img");
    const source = previewSource("full");
    if (source) {
      if (img.src !== source.src) img.src = source.src;
      img.classList.toggle("cdc-smooth", source.ours);
      // Only our own full render has badges to put back — the client's own
      // preview never had them, and the thumb still carries them baked in.
      paintIcons(panel, img, source.ours && source.size === "full" ? state.hq.icons : null);
    }

    const f = state.map.facts;
    const parts = [];
    if (f.name) parts.push(f.name);
    if (f.players) parts.push(`${f.players} starts`);
    if (f.width && f.height) parts.push(`${f.width}×${f.height}`);
    if (f.theater) parts.push(f.theater);
    const line = parts.join(" · ");
    const factsEl = panel.querySelector(".cdc-map-facts");
    if (factsEl.textContent !== line) factsEl.textContent = line;
  }

  let hintTimer = null;

  function mountHints(screen) {
    let panel = screen.querySelector(".cdc-hints");
    const guide = currentGuide();

    // A guide for this map replaces the rotating hints outright: the loading
    // screen is exactly when you want to read it, and two competing texts in one
    // panel is worse than either alone.
    if (guide) {
      if (!panel) {
        panel = document.createElement("div");
        panel.className = "cdc-hints";
        panel.style.left = PANEL.left;
        panel.style.right = PANEL.right;
        screen.appendChild(panel);
      }
      clearInterval(hintTimer);
      hintTimer = null;
      panel.classList.add("cdc-hints-guide");
      const title = state.map.facts.name || "This map";
      panel.innerHTML =
        `<div class="cdc-hints-title">${escapeHtml(title)}</div>` +
        `<div class="cdc-hints-body"></div>`;
      panel.querySelector(".cdc-hints-body").textContent = guide;
      return;
    }

    if (panel) return;

    const hints = (state.map && state.map.hints) || GENERIC_HINTS;
    panel = document.createElement("div");
    panel.className = "cdc-hints";
    panel.style.left = PANEL.left;
    panel.style.right = PANEL.right;
    panel.innerHTML = '<div class="cdc-hints-title">Hint</div><div class="cdc-hints-body"></div>';
    screen.appendChild(panel);

    const body = panel.querySelector(".cdc-hints-body");
    // Map-derived hints are at the front of the list, so start at the front
    // rather than at a random index — the specific ones are the point.
    let i = 0;
    const show = () => {
      body.textContent = hints[i % hints.length];
      i += 1;
    };
    show();
    clearInterval(hintTimer);
    hintTimer = setInterval(() => {
      if (!panel.isConnected) {
        clearInterval(hintTimer);
        hintTimer = null;
        return;
      }
      show();
    }, HINT_INTERVAL_MS);
  }

  // --- In-game overlay (its key is rebindable) -------------------------------------------------

  // The client draws the HUD in WebGL, so there is no minimap element to attach
  // to. What there is: the Minimap UiObject's position and fit size, in the same
  // pixel space as this overlay layer. Auto-anchor to it, and let a drag win
  // over the automatic placement, because UI scale and taste both vary.

  let ingameEl = null;
  let ingameHint = 0;

  function savedRect() {
    try {
      const raw = localStorage.getItem(LAYOUT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      note("stored overlay layout is unreadable, ignoring it", "warn");
      return null;
    }
  }

  function storeRect(rect) {
    try {
      localStorage.setItem(LAYOUT_KEY, JSON.stringify(rect));
    } catch (e) {
      note("could not persist the overlay layout", "warn");
    }
  }

  /** Where the client's own minimap sits right now, in overlay pixels. */
  function minimapRect() {
    const obj = state.minimapObj;
    const size = state.minimapFitSize;
    if (!obj || !size || typeof obj.getPosition !== "function") return null;
    try {
      const pos = obj.getPosition();
      if (!size.width || !size.height) return null;
      return { left: pos.x, top: pos.y, width: size.width, height: size.height };
    } catch (e) {
      note(`minimap position unreadable — ${e && e.message}`, "warn");
      return null;
    }
  }

  function effectiveRect() {
    return (
      savedRect() ||
      minimapRect() || {
        // Last resort: the radar lives at the top of the right-hand sidebar.
        left: Math.max(0, window.innerWidth - 260),
        top: 40,
        width: 240,
        height: 180,
      }
    );
  }

  function buildIngame() {
    const root = document.getElementById("ra2web-root") || document.body;
    const el = document.createElement("div");
    el.className = "cdc-ig";
    // Two rows, always: players stacked on the left (overflowing into further
    // columns rather than further rows), map facts over the hint on the right.
    el.innerHTML =
      '<div class="cdc-ig-top">' +
      '<div class="cdc-ig-players"></div>' +
      '<div class="cdc-ig-side">' +
      '<div class="cdc-ig-meta"></div>' +
      '<div class="cdc-ig-hint"></div>' +
      "</div>" +
      "</div>" +
      '<div class="cdc-ig-map">' +
      '<img class="cdc-ig-map-img" alt="">' +
      '<div class="cdc-ig-map-empty">no map preview captured</div>' +
      '<div class="cdc-ig-grip" title="drag to move · drag the corner to resize"></div>' +
      "</div>";
    root.appendChild(el);
    makeDraggable(el.querySelector(".cdc-ig-map"), el.querySelector(".cdc-ig-grip"), (rect) => {
      storeRect(rect);
      note("overlay layout saved — __cdc.resetLayout() puts it back on the minimap");
    });
    return el;
  }

  /**
   * Move (and, when there is a grip, resize) a box, persisting where it ends
   * up through `save`. The saver is the caller's because there is more than
   * one draggable box now and they do not share a storage key.
   */
  function makeDraggable(box, grip, save) {
    let mode = null;
    let start = null;

    // Takes a point rather than an event: with the mouse locked, an event's
    // coordinates are frozen and the only live position is the game cursor.
    const onDown = (at, which) => {
      if (!at) return;
      mode = which;
      start = {
        x: at.x,
        y: at.y,
        left: box.offsetLeft,
        top: box.offsetTop,
        width: box.offsetWidth,
        height: box.offsetHeight,
      };
      window.addEventListener("mousemove", onMove, true);
      window.addEventListener("mouseup", onUp, true);
    };

    const onMove = (e) => {
      if (!mode) return;
      const at = cursorPoint();
      if (!at) return;
      const dx = at.x - start.x;
      const dy = at.y - start.y;
      // A move sets position only. Writing the measured width and height back
      // on every move would pin a box whose size is its content — the queue
      // panel grows a row when a factory starts building.
      if (mode === "move") {
        box.style.left = `${start.left + dx}px`;
        box.style.top = `${start.top + dy}px`;
      } else {
        applyRect(box, {
          left: start.left,
          top: start.top,
          width: Math.max(80, start.width + dx),
          height: Math.max(60, start.height + dy),
        });
      }
      e.preventDefault();
      e.stopPropagation();
    };

    const onUp = () => {
      if (mode) {
        save({
          left: box.offsetLeft,
          top: box.offsetTop,
          width: box.offsetWidth,
          height: box.offsetHeight,
        });
      }
      mode = null;
      window.removeEventListener("mousemove", onMove, true);
      window.removeEventListener("mouseup", onUp, true);
    };

    // The game canvas treats mousedown as a command, so swallow ours.
    // The DOM way in, for when the mouse is the browser's. While the game
    // holds it these never fire — the press goes to the locked canvas — which
    // is what `begin` below is for.
    box.addEventListener(
      "mousedown",
      (e) => {
        if (e.target === grip || mouseCaptured()) return;
        e.preventDefault();
        e.stopPropagation();
        onDown({ x: e.clientX, y: e.clientY }, "move");
      },
      true
    );
    if (grip) {
      grip.addEventListener(
        "mousedown",
        (e) => {
          if (mouseCaptured()) return;
          e.preventDefault();
          e.stopPropagation();
          onDown({ x: e.clientX, y: e.clientY }, "resize");
        },
        true
      );
    }

    return { begin: (at) => onDown(at, "move") };
  }

  function applyRect(box, rect) {
    box.style.left = rect.left + "px";
    box.style.top = rect.top + "px";
    box.style.width = rect.width + "px";
    box.style.height = rect.height + "px";
  }

  /**
   * you / ally / opp — but only when "you" is known. If the local player could
   * not be identified, every line is left unmarked: calling a teammate an
   * opponent is worse than saying nothing, and the names are useful either way.
   */
  function playerRole(p) {
    const self = state.players.find((x) => x.self);
    if (!self) return "";
    if (p.self) return "you";
    return p.team !== undefined && p.team === self.team ? "ally" : "opp";
  }

  function playerLine(p) {
    const role = playerRole(p);
    return (
      `<span class="cdc-ig-player" style="color:${escapeHtml(p.color)}">` +
      (role ? `<i class="cdc-ig-who" data-role="${role}">${role}</i>` : "") +
      `${escapeHtml(p.name)} <b data-side="${escapeHtml(p.side)}">${escapeHtml(p.label)}</b>` +
      `</span>`
    );
  }

  function renderIngame() {
    if (!state.ingameVisible) {
      if (ingameEl) ingameEl.remove();
      ingameEl = null;
      return;
    }
    if (!ingameEl || !ingameEl.isConnected) ingameEl = buildIngame();

    const box = ingameEl.querySelector(".cdc-ig-map");
    applyRect(box, effectiveRect());

    const img = ingameEl.querySelector(".cdc-ig-map-img");
    const empty = ingameEl.querySelector(".cdc-ig-map-empty");
    const source = previewSource("thumb");
    if (source) {
      if (img.src !== source.src) img.src = source.src;
      img.classList.toggle("cdc-smooth", source.ours);
      img.style.display = "";
      empty.style.display = "none";
    } else {
      img.style.display = "none";
      empty.style.display = "";
      empty.textContent = `no map preview — ${missingPreviewReason()}`;
    }

    ingameEl.querySelector(".cdc-ig-players").innerHTML = state.players.length
      ? state.players.map(playerLine).join("")
      : '<span class="cdc-ig-player cdc-ig-dim">no roster captured — it is read off the loading screen</span>';

    const f = state.map && state.map.facts;
    ingameEl.querySelector(".cdc-ig-meta").textContent = f
      ? [f.name, `${f.players} starts`, `${f.width}×${f.height}`, f.theater].filter(Boolean).join(" · ")
      : "";

    // Your guide occupies the hint slot itself rather than a panel of its own —
    // same place, same role. It only grows the bar as far as the class allows,
    // then scrolls.
    const hintEl = ingameEl.querySelector(".cdc-ig-hint");
    const guide = currentGuide();
    hintEl.classList.toggle("cdc-ig-hint-guide", !!guide);
    if (guide) {
      hintEl.textContent = guide;
    } else {
      const hints = (state.map && state.map.hints) || GENERIC_HINTS;
      hintEl.textContent = hints[ingameHint % hints.length];
    }
  }

  function toggleIngame(force) {
    state.ingameVisible = force === undefined ? !state.ingameVisible : !!force;
    if (state.ingameVisible) ingameHint += 1; // a fresh hint on each open
    renderIngame();
    return state.ingameVisible;
  }

  function resetLayout() {
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch (e) {
      note("could not clear the stored layout", "warn");
    }
    renderIngame();
    return effectiveRect();
  }

  function hotKeyCode(key) {
    return (
      (key.alt ? MODIFIER_BITS.alt : 0) +
      (key.ctrl ? MODIFIER_BITS.ctrl : 0) +
      (key.shift ? MODIFIER_BITS.shift : 0) +
      key.keyCode
    );
  }

  function matchesHotkey(e, key) {
    // A build with no surface for a key has no descriptor for it (`ownKeys`),
    // and the press then belongs to whatever is bound underneath.
    if (!key) return false;
    return (
      e.code === key.code &&
      e.altKey === !!key.alt &&
      e.shiftKey === !!key.shift &&
      e.ctrlKey === !!key.ctrl &&
      !e.metaKey
    );
  }

  /**
   * The same hash for a press rather than for one of our descriptors, so a live
   * keydown can be looked up in the client's own table.
   *
   * `keyCode` is the deprecated field and it is the right one here: it is what
   * `KeyBinds#getHotKeyCode` hashes, so `code` would answer a table nobody keeps.
   */
  function pressHotKeyCode(e) {
    return (
      (e.metaKey ? 4096 : 0) +
      (e.altKey ? MODIFIER_BITS.alt : 0) +
      (e.ctrlKey ? MODIFIER_BITS.ctrl : 0) +
      (e.shiftKey ? MODIFIER_BITS.shift : 0) +
      (e.keyCode || 0)
    );
  }

  /**
   * Escape's keyCode, and the floor under the lookup below.
   *
   * RA2's own `keyboard.ini` is where the client's default binding comes from,
   * and it puts `Options` — the command that opens the in-game menu — on 27.
   */
  const OPTIONS_KEYCODE = 27;

  let optionsCodeCache = null;
  let optionsCodeCacheSize = -1;

  /**
   * Which key the *client* has on the command that opens its menu.
   *
   * Read out of its live table rather than assumed: `KeyBinds#addHotKey` is
   * hooked, so a player who moved `Options` in the client's own key settings has
   * that key swallowed and keeps Escape. The floor is Escape, for the window
   * before the table has been read and for a client that stops reporting.
   *
   * Cached against the table's size, the same way the chord prefixes are: this
   * is asked on every keydown and the table is written once, at boot.
   */
  function optionsHotKeyCode() {
    if (optionsCodeCache !== null && optionsCodeCacheSize === state.clientHotkeys.size) {
      return optionsCodeCache;
    }
    let code = OPTIONS_KEYCODE;
    for (const [hash, command] of state.clientHotkeys) {
      if (command === "Options") {
        code = hash;
        break;
      }
    }
    optionsCodeCacheSize = state.clientHotkeys.size;
    return (optionsCodeCache = code);
  }

  /** Is the client's menu on screen? Its controller's stack is the only record. */
  function menuOpen() {
    const menu = state.gameMenu;
    if (!menu || typeof menu.getCurrentScreen !== "function") return false;
    try {
      return !!menu.getCurrentScreen();
    } catch (e) {
      note(`could not read the game menu's screen: ${e}`, "warn");
      return false;
    }
  }

  /**
   * What the menu table needs to know about this press and this moment.
   *
   * Facts only — every rule about them is in `menuKeyAction`, which is the half
   * that can be exercised without a match. `inMatch` is `state.combatant`, and
   * it is load-bearing rather than incidental: the client nulls its equivalent
   * (`playerUi.dispose()`) the instant a match ends, five seconds before it
   * leaves the game screen, and our listener outlives its own.
   */
  function menuPressAt(e) {
    const menu = state.gameMenu;
    const stack = (menu && menu.controller && menu.controller.screenStack) || [];
    return {
      enabled: state.prefs.menuOffEscape !== false,
      inMatch: !!state.combatant,
      menuOpen: menuOpen(),
      deep: stack.length > 1,
      isMenuKey: matchesHotkey(e, state.keys.menu),
      isOptionsKey: pressHotKeyCode(e) === optionsHotKeyCode(),
    };
  }

  /**
   * Carry out what the table decided, through the client's own methods.
   *
   * `open` and `close` are what its own menu button and its Resume Mission
   * button call, so the events that unlock the pointer and re-enable the world
   * interaction fire either way; `popScreen` is what its own back navigation
   * uses. Nothing here reproduces a keypress, which is the difference between
   * this and the fullscreen swap — that one has no method to call.
   */
  function runMenuAction(act) {
    const menu = state.gameMenu;
    if (!menu || act === "pass" || act === "swallow") return;
    try {
      if (act === "open") {
        // A grid is drawn over the game and the menu is a screen instead of it.
        closeChord();
        menu.open();
      } else if (act === "close") {
        menu.close();
      } else if (act === "back") {
        Promise.resolve(menu.controller.popScreen()).catch((err) =>
          note(`could not step back in the game menu: ${err}`, "warn")
        );
      }
    } catch (e) {
      note(`the game menu refused "${act}": ${e}`, "warn");
    }
  }

  /** Our keys versus the client's live table — reported, never guessed. */
  function hotkeyConflicts() {
    return Object.values(state.keys)
      .map((key) => {
        const clash = state.clientHotkeys.get(hotKeyCode(key));
        return clash ? `${key.label}→${clash}` : `${key.label} free`;
      })
      .join(", ");
  }

  /**
   * The same question for the build table, counted rather than listed.
   *
   * Listing is what the four fixed keys get, because there are four of them. A
   * build profile is a dozen or more, most of them bare letters and most of
   * those taken by the client — a per-key list would be the whole panel. The
   * count says how much is bound and how much of it overrides the game; the
   * first few clashes are named so the row is still actionable.
   */
  function buildConflicts() {
    const bindings = [];
    for (const [side, rows] of Object.entries(state.builds || {})) {
      for (const row of rows || []) if (row && row.key && row.name) bindings.push([side, row]);
    }
    if (!bindings.length) return "none bound";
    const clashes = bindings
      .map(([, row]) => {
        const clash = state.clientHotkeys.get(hotKeyCode(row.key));
        return clash ? `${row.key.label}→${clash}` : "";
      })
      .filter(Boolean);
    const side = playerSide();
    const armed = state.combatant
      ? `${side || "unknown side"}, ${buildBindings(side).size} live`
      : "no match";
    if (!clashes.length) return `${bindings.length} bound (${armed}), none clash`;
    const shown = clashes.slice(0, 3).join(" ");
    const rest = clashes.length > 3 ? ` +${clashes.length - 3} more` : "";
    return `${bindings.length} bound (${armed}), ${clashes.length} override the game: ${shown}${rest}`;
  }

  // --- Build hotkeys --------------------------------------------------------

  /**
   * A binding reduced to one comparable string.
   *
   * The four older hotkeys are compared field by field (`matchesHotkey`), which
   * is right for four and wrong for a table: a build profile is a dozen or more
   * bindings looked up on every keystroke the page sees, and a Map lookup is one
   * comparison instead of a scan. Meta is not in the id — it is not bindable
   * here, and a press carrying it is rejected before the lookup.
   */
  function bindingId(key) {
    return `${key.code}|${key.alt ? 1 : 0}${key.ctrl ? 1 : 0}${key.shift ? 1 : 0}`;
  }

  /**
   * @param {KeyboardEvent} e
   * @param {{ctrl?: boolean}} [over] a modifier to read as something other than
   *   what the press carried — used once, to find the bare binding a Ctrl press
   *   means "queue next" for. Written as an override rather than by assembling
   *   the string at the call site, because the format lives here and a second
   *   place that knows it is a second place to get it wrong.
   */
  function eventBindingId(e, over) {
    const ctrl = over && "ctrl" in over ? over.ctrl : e.ctrlKey;
    return `${e.code}|${e.altKey ? 1 : 0}${ctrl ? 1 : 0}${e.shiftKey ? 1 : 0}`;
  }

  /**
   * The build bindings in force, as binding id -> object name.
   *
   * @param {string} [side] one side's, or every side's when omitted — which is
   *   what the conflict report wants, since a key is taken by the game whether
   *   or not you are playing the side that binds it.
   */
  function buildBindings(side) {
    const out = new Map();
    for (const [name, rows] of Object.entries(state.builds || {})) {
      if (side && name !== side) continue;
      for (const row of rows || []) {
        if (row && row.key && row.name) out.set(bindingId(row.key), row.name);
      }
    }
    return out;
  }

  /**
   * The buttons a mouse binding may use, and what to call them.
   *
   * 0 and 2 are absent on purpose and that absence is the rule: left is how you
   * click anything and right is the game's own order, so neither is ever taken.
   * 1 is the middle button — in scope because the *client* does not use it,
   * which is not the same as the browser not using it. Anything above 4 is
   * accepted sight unseen and named by number: a mouse with eight buttons
   * either sends them as buttons, in which case they work here, or its driver
   * sends keystrokes, in which case they are already bindable as keys.
   */
  const MOUSE_NAMES = { 3: "Back", 4: "Forward" };

  /**
   * Whether a press belongs to the extension at all.
   *
   * Left, middle and right are the mouse the game already has: left clicks,
   * right orders, middle is the browser's autoscroll. Everything from 3 up is
   * free, and all of it is offered — a mouse with eight buttons either sends
   * them as buttons, in which case they bind here, or its driver sends
   * keystrokes, in which case they bind as keys.
   */
  function ourButton(button) {
    return button >= 3;
  }

  /**
   * A mouse press as the same string a key press reduces to.
   *
   * `Mouse3` stands where a `KeyboardEvent.code` would, so **`bindingId` needs
   * no mouse form and the two halves of the extension go on comparing bindings
   * the one way they already agree on**. No keyboard code is `Mouse<n>`, so a
   * mouse binding and a key binding cannot collide by accident.
   */
  function mouseBindingId(e, over) {
    const ctrl = over && "ctrl" in over ? over.ctrl : e.ctrlKey;
    return `Mouse${e.button}|${e.altKey ? 1 : 0}${ctrl ? 1 : 0}${e.shiftKey ? 1 : 0}`;
  }

  /**
   * The panel toggles a binding can point at, by the name `state.keys` uses.
   *
   * A function rather than a constant so the toggles are read at the press:
   * some of them are assigned during wiring, and a table built while the IIFE
   * runs would hold whatever they were then.
   *
   * The keydown ladder below asks the same seven in the same order by hand.
   * That is two lists, and `scripts/check-commands.mjs` asserts they hold the
   * same names — the ladder is a hot path with its own tests and was not worth
   * rewriting to share this, but it was worth making the drift loud.
   */
  function panelToggles() {
    return {
      debug: toggleHud,
      overlay: toggleIngame,
      hqSwap: toggleHqPreview,
      hqFull: toggleHqFull,
      queues: toggleQueues,
      net: toggleNet,
      memory: toggleMemory,
    };
  }

  /**
   * The command bindings in force, as binding id -> the client's command name.
   *
   * Flat where `buildBindings` is per side, because a client command does not
   * depend on the country you drew.
   */
  function commandBindings() {
    const out = new Map();
    for (const row of state.commandKeys || []) {
      if (row && row.key && row.command) out.set(bindingId(row.key), row.command);
    }
    return out;
  }

  /**
   * The client's keyboard dispatcher for the match in play, or null.
   *
   * Reached through the CombatantUi rather than hooked on its own: the client
   * builds one `WorldInteraction` per match, hands it to `initKeyboardCommands`
   * and holds it as `worldInteraction`, so this is the very object its own
   * presses are dispatched through — and it stops existing exactly when the
   * match does, which is the property that matters. Read at the press rather
   * than captured at match start, because `init` sets it *after* our hook has
   * run.
   */
  function keyboardHandler() {
    const world = state.combatant && state.combatant.worldInteraction;
    const handler = world && world.keyboardHandler;
    return handler && typeof handler.executeCommand === "function" ? handler : null;
  }

  /**
   * Run one of the client's own commands, the way the client runs it.
   *
   * `KeyboardHandler#executeCommand` is the same call its own key handler makes
   * once it has hashed a press into a command, so everything downstream — the
   * trigger modes, the pause while a menu is up — is the client's own and needs
   * no reimplementation here. **No synthetic `KeyboardEvent`**: this extension
   * has one of those already (`reissueFullscreenKey`) and it exists only because
   * fullscreen needs the client's own *lock*, not because a command needs a key.
   *
   * A press is consumed whether or not the command runs. The alternative —
   * falling through to the client for a command it does not register — makes a
   * key do one thing or another depending on invisible client state (a cheat is
   * registered only while `cheatsEnabled`), which is worse than a key that says
   * why it did nothing.
   *
   * @returns {boolean} whether there was a match to run it in
   */
  function runCommand(command) {
    const handler = keyboardHandler();
    if (!handler) return false;
    // `executeCommand` looks the name up in its own table and returns in
    // silence when it is not there, so an unregistered command would otherwise
    // be a key that does nothing and reports nothing.
    if (handler.commands instanceof Map && !handler.commands.has(command)) {
      note(`${command} is not a command this match registers — the key did nothing`, "warn");
      return true;
    }
    handler.executeCommand(command);
    return true;
  }

  /**
   * Which side the local player is on, or "" when there is no match.
   *
   * `FACTIONS` rather than the country's own `side`: the client's SideType is
   * the Tiberian Sun enum it inherited — GDI, Nod, ThirdSide — and every faction
   * label the extension has ever shown comes from this table instead.
   */
  function playerSide() {
    const country = state.combatant && state.combatant.player && state.combatant.player.country;
    const name = country && (country.name || country);
    const faction = name && FACTIONS[name];
    return faction ? faction.side : "";
  }

  /**
   * A line over the game, for a press that did nothing.
   *
   * Only for a press that did nothing. A queued order needs no announcement of
   * ours — the sidebar cameo starts filling and the game says so — and a note on
   * every press would be a box flashing over a match. Silence is the success
   * case; this exists so that a key which quietly achieves nothing says why,
   * which is the one thing the sidebar cannot show for a cameo you never
   * clicked.
   */
  let buildNoteEl = null;
  let buildNoteTimer = 0;

  function buildNote(text) {
    if (!buildNoteEl) {
      buildNoteEl = document.createElement("div");
      buildNoteEl.className = "cdc-build-note";
      document.body.append(buildNoteEl);
    }
    buildNoteEl.textContent = text;
    buildNoteEl.classList.add("visible");
    clearTimeout(buildNoteTimer);
    buildNoteTimer = setTimeout(() => buildNoteEl && buildNoteEl.classList.remove("visible"), 1800);
  }

  /**
   * What the game itself calls an object. `uiName` is a CSF key, and the client
   * hands its own string table to CombatantUi — so this is the localised name
   * the sidebar shows, not a transliteration of ours.
   */
  function displayName(object, fallback) {
    const strings = state.combatant && state.combatant.strings;
    if (strings && object.uiName) {
      try {
        return strings.get(object.uiName);
      } catch (e) {
        note(`no string for ${object.uiName} (${e && e.message})`, "warn");
      }
    }
    return fallback;
  }

  /**
   * Queue one of an object, exactly as one click on its sidebar cameo does.
   *
   * Three things are asked of the client rather than worked out here:
   *
   * - **what may be built now** — `production.getAvailableObjects()`, the
   *   client's own answer to tech level, build limit, factory and
   *   prerequisites. Reimplementing RA2's prerequisite graph would be a second
   *   source of truth, and a second source of truth is a source of falsehood.
   * - **which queue it goes in** — `production.getQueueTypeForObject()`, which
   *   knows that a defensive building goes to Armory rather than Structures and
   *   a naval unit to Ships rather than Vehicles.
   * - **whether the order stands** — `UpdateQueueAction#process` re-checks
   *   availability as it runs, on every client, so an order that should not
   *   have been accepted is dropped identically everywhere and cannot desync.
   *
   * The action goes onto the same `actionQueue` the mouse feeds, with identical
   * serialisation. One press is one item.
   *
   * `next` is the client's own `AddNext` — Ctrl on a cameo, which the sidebar
   * has had since the client's v0.79 and no key of the client's own reaches.
   * It changes one field and nothing else about this path: the availability
   * check, the queue, the clamp and the ready/held branches above are the same
   * question either way. What it does to the queue is `insertAfterFirst`, and
   * `src/queue-predict.js` states that shape.
   *
   * @param {string} objectName the rules name to queue
   * @param {number} want how many — 1, `CHORD_MANY`, or `Infinity`
   * @param {boolean} [next] insert behind what is being built rather than last
   */
  function queueBuild(objectName, want, next) {
    const ui = state.combatant;
    const { ActionType, UpdateType } = state.modules;
    if (!ui) return false;
    if (!ActionType || !UpdateType) {
      // The keydown branch is only reachable with a match in play, so a press
      // that gets here and finds no enums is a failed import at boot — which is
      // narrated once and then never mentioned again. Say it where the key was
      // pressed, or the key is simply dead.
      buildNote("the client's action modules did not load — run __cdc.probe()");
      return false;
    }
    const production = ui.player && ui.player.production;
    if (!production) {
      buildNote("no production queues this match");
      return false;
    }

    const named = (o) => o && o.name === objectName;
    const object = production.getAvailableObjects().find(named);
    if (!object) {
      // Two different failures wear the same face — a key bound to something
      // this country never gets, and a key bound to something whose
      // prerequisites are not up yet — and telling them apart is the difference
      // between "fix the binding" and "build a barracks first".
      // `allAvailableObjects` is the side's whole list, before prerequisites.
      // If a client ever stops carrying it there is no way to tell the two cases
      // apart — so say the true half rather than guessing the other.
      const all = production.allAvailableObjects;
      const owned = Array.isArray(all) ? all.find(named) : null;
      const label = owned ? displayName(owned, objectName) : objectName;
      if (!Array.isArray(all)) buildNote(`${label} — not available`);
      else buildNote(owned ? `${label} — not available yet` : `${label} — not for this country`);
      return false;
    }

    // From here a press is exactly a left click on the object's cameo, and it
    // is `CombatantUi#handleSidebarSlotClick` that says what that means. Its
    // three cases in its order, because a key that queues what a cameo click
    // queues has to agree with the cameo about a queue already holding
    // something — the first version agreed only about the empty case.
    //
    // Read through the prediction rather than off the client, which is the
    // whole of the lag fix on this path: three presses inside one lag window
    // used to see an unchanged queue three times and push three Adds past a
    // room for one, and a press landing on a queue that had just turned Ready
    // ordered a second building instead of placing the finished one.
    const at = queueStateFor(object);
    if (!at) {
      buildNote("no production queues this match");
      return false;
    }
    const label = displayName(object, objectName);

    // A finished structure is placed, not ordered again: its queue holds one
    // item and takes nothing else until the building is on the ground.
    if (at.status === "ready" && at.isFirst) {
      if (placeReady(at.queue)) return true;
      buildNote(`${label} — ready, but placement is unavailable`);
      return false;
    }

    // A paused item resumes rather than queueing a second one.
    if (at.status === "onhold" && at.isFirst) {
      pushQueueAction(at.snapshot, { op: "resume", name: objectName, label }, (action) => {
        action.queueType = at.queue.type;
        action.updateType = UpdateType.Resume;
      });
      return true;
    }

    // How many actually fit: the queue's room and its per-item cap. The client
    // clamps here; a press that did not would push an action the client then
    // drops, which from the outside looks like the key half-working.
    const quantity = Math.min(want || 1, at.room);
    if (quantity <= 0) {
      // Two different noughts, and the remedy differs: a queue that is full
      // empties as it builds, a build limit does not move until one of them
      // dies. Saying "queue is full" over an Ore Purifier already standing was
      // the wrong half of the answer.
      const limited = buildLimitRoom(object, at.queued) <= 0;
      buildNote(`${label} — ${limited ? "you have all of those you may build" : "queue is full"}`);
      return false;
    }

    // `AddNext` is a fifth update type the client's enum has carried all along,
    // so a build without it is a client older than 0.79 rather than a broken
    // one: fall back to the ordinary Add instead of refusing the press, which
    // would make the modifier look dead rather than unavailable.
    const asNext = !!next && UpdateType.AddNext !== undefined;
    pushQueueAction(
      at.snapshot,
      { op: asNext ? "addnext" : "add", name: objectName, quantity, rules: object, label },
      (action) => {
        action.queueType = at.queue.type;
        action.updateType = asNext ? UpdateType.AddNext : UpdateType.Add;
        action.item = object;
        action.quantity = quantity;
      }
    );
    if (next && !asNext) buildNote(`${label} — queued; this client has no "next"`);
    return true;
  }

  /**
   * Why a build key did nothing, answered in one object.
   *
   * A key that does not fire has five possible reasons and they are invisible
   * from the outside: the modules did not load, no match is captured, the side
   * did not resolve, the bindings never arrived from the options page, or the
   * press does not match any of them. The first version of this feature shipped
   * with a real one of those — the bindings were stored and never pushed to a
   * running tab (0.53.1) — and the only way to tell was to read the source.
   *
   * `__cdc.build()` names all five. `__cdc.build("KeyQ")` additionally answers
   * what that one key would do right now.
   */
  function buildReport(code) {
    const ui = state.combatant;
    const production = ui && ui.player && ui.player.production;
    const side = playerSide();
    const bindings = buildBindings(side);
    const out = {
      modules: {
        CombatantUi: !!state.modules.CombatantUi,
        ActionType: !!state.modules.ActionType,
        UpdateType: !!state.modules.UpdateType,
        hooked: !!state.hooks.combatantUi,
      },
      match: ui ? "captured" : "none — start a match, or the init hook did not fire",
      side: side || "not resolved",
      country: playerCountry(),
      bindings: {
        sides: Object.keys(state.builds || {}),
        // Labelled for what it is: with no side resolved, `buildBindings` merges
        // every side's, and calling that "for this side" read as if the table
        // were live when the reason nothing fired was that no side was known.
        [side ? "forThisSide" : "allSidesMerged_noSideResolved"]: [...bindings].map(
          ([id, name]) => `${id} -> ${name}`
        ),
        total: Object.values(state.builds || {}).reduce((n, rows) => n + (rows || []).length, 0),
      },
      roster: state.rosterVersion || "not harvested in this tab",
      canBuildNow: production ? production.getAvailableObjects().length : 0,
      // What the lockstep lag actually measured this session: `lastMs` and
      // `worstMs` are how long a pushed action waited before the client's own
      // state showed it. `LOST_AFTER_MS` in src/queue-predict.js is a backstop
      // picked without a measurement — this is where the measurement comes from.
      prediction: predictLedger
        ? { ...predictLedger.stats(), waiting: predictLedger.waiting().length }
        : "src/queue-predict.js did not load",
    };
    if (code) {
      // Bare key, no modifiers — the shape a build binding almost always has.
      const bound = bindings.get(`${code}|000`);
      out.pressed = {
        code,
        bound: bound || "nothing bound to it on this side",
        clientCommand: state.clientHotkeys.get((code.match(/^Key([A-Z])$/) || [])[1]?.charCodeAt(0) || 0) || "none",
      };
    }
    return out;
  }

  // --- Build chords ---------------------------------------------------------

  /**
   * The sections, the key block and the shipped layouts — from
   * `src/build-chords.js`, which the options page loads too so that a grid
   * edited there is the grid played here.
   *
   * A missing file is a packaging error rather than a runtime case, so it is
   * said once and the chord layer is left wholly inert: with no sections,
   * nothing resolves a prefix and every press falls through to the layers
   * underneath, which is a feature that is off rather than one that half works.
   */
  const CHORD_TABLES = window.__cdcBuildChords;
  if (!CHORD_TABLES) console.warn(TAG, "src/build-chords.js did not load — build chords are off");
  const SECTIONS = (CHORD_TABLES && CHORD_TABLES.SECTIONS) || [];
  const GRID_KEYS = (CHORD_TABLES && CHORD_TABLES.GRID_KEYS) || [];
  const GRID_COLS = (CHORD_TABLES && CHORD_TABLES.GRID_COLS) || 5;
  // The codes the browser keeps whatever the page says — the table's, because
  // the grid's own keys are two of them and the two facts belong together.
  const RESERVED_CODES = (CHORD_TABLES && CHORD_TABLES.RESERVED_CODES) || [];

  /**
   * How long after a tab press a second press still counts as a chord.
   *
   * Long enough to be comfortable at speed, short enough that switching tabs
   * twice on purpose — which is a thing people do while reading the sidebar —
   * does not open a grid. The first press is never held back by this: it has
   * already gone to the client by the time the timer starts.
   */
  const CHORD_WINDOW = 320;

  /**
   * How many a Shift'd press means, on both sides of the feature — the client's
   * own shift-click quantity, which `src/build-chords.js` already holds for the
   * cancel keys. One number, so ordering five and cancelling five cannot drift.
   */
  const CHORD_MANY = (CHORD_TABLES && CHORD_TABLES.CANCEL_MANY) || 5;

  /**
   * How long a slot key must be **held** before the press means "all of it".
   *
   * The tap has already acted by then — one is ordered, or the pause is sent —
   * and the hold adds the rest on top, so nothing waits for a key to come back
   * up and the fast path stays exactly as fast as it was. Long enough not to
   * fire under a fast double order, short enough to be worth doing instead of
   * pressing the key five times.
   */
  const CHORD_HOLD = 500;


  /** The layout in force for a side: what the options page stored, or the shipped one. */
  function chordLayout(side, sectionId) {
    if (!CHORD_TABLES) return [];
    return CHORD_TABLES.chordLayout(state.chords, side, sectionId);
  }

  /**
   * Which section a bare press would open, as `e.code` -> section.
   *
   * Rebuilt whenever the client's table has grown, which happens once per load
   * as KeyBinds fills it. A tab bound to a modified key gets **no** chord rather
   * than a guessed one: the fallback would then be a letter the client uses for
   * something else entirely, and a chord on the wrong key is worse than none.
   */
  let prefixCache = null;
  let prefixCacheSize = -1;

  function prefixes() {
    if (prefixCache && prefixCacheSize === state.clientHotkeys.size) return prefixCache;
    const out = new Map();
    for (const section of SECTIONS) {
      let bound = null;
      for (const [code, command] of state.clientHotkeys) {
        if (command === section.command) {
          bound = code;
          break;
        }
      }
      if (bound === null) {
        out.set(section.fallback, section);
        continue;
      }
      // The low byte is the key; anything above it is a modifier the client
      // hashed in (see MODIFIER_BITS).
      if (bound > 255) continue;
      const letter = String.fromCharCode(bound);
      if (/^[A-Z]$/.test(letter)) out.set("Key" + letter, section);
      else if (/^[0-9]$/.test(letter)) out.set("Digit" + letter, section);
    }
    prefixCache = out;
    prefixCacheSize = state.clientHotkeys.size;
    return out;
  }

  /** The client's own production queue for a section, or null. */
  function sectionQueue(section) {
    const { QueueType } = state.modules;
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!production || !QueueType || !section.queue) return null;
    try {
      return production.getQueue(QueueType[section.queue]);
    } catch (e) {
      note(`no ${section.queue} queue in this match (${e && e.message})`, "warn");
      return null;
    }
  }

  // --- Predicting the client's answer ---------------------------------------

  /**
   * The ledger of actions pushed and not yet seen applied — `src/queue-predict.js`,
   * which holds the state algebra with no client in it so that
   * `scripts/check-predict.mjs` can exercise the reconciliation on snapshots
   * written by hand.
   *
   * Why the overlay needs one at all: the client is lockstep, so `pushAction`
   * only *sends* an order — `UpdateQueueAction#process` runs it some network
   * turns later, and until then `production` reads exactly as it did before the
   * press. Every decision this file makes reads that state, so inside the window
   * the overlay decides against a state it has already changed. Two fast presses
   * of a cancel key both read `active, at the head`, so both send Pause and the
   * cancel is never reached.
   *
   * A missing file is a packaging error rather than a runtime case, so it is
   * said once and prediction is left off: `predictQueue` then hands back the
   * client's own reading unchanged, which is what every one of these paths did
   * before this existed.
   */
  const PREDICT = window.__cdcQueuePredict;
  if (!PREDICT) console.warn(TAG, "src/queue-predict.js did not load — commands wait on the client");

  /** What each op was asking for, said the way the note has to say it. */
  const PREDICT_ASKED = {
    add: "the order",
    addnext: "the order",
    cancel: "the cancel",
    pause: "the hold",
    resume: "the resume",
  };

  /**
   * What an action that never landed is said to be.
   *
   * There is one way to lose an action and it is the silent one:
   * `UpdateQueueAction#process` re-checks `isAvailableForProduction` as it runs,
   * so an order that stopped being legal between the press and the turn — the
   * war factory went, the power went, the item stopped being available — is
   * dropped without a trace. Nothing will ever say so, which is why there is a
   * deadline at all.
   *
   * Said aloud rather than snapped back in silence: a tile that quietly returns
   * to what it was looks exactly like a key that never fired, and the whole
   * point of predicting is that the player stops watching the sidebar to find
   * out whether a press worked. Named by what was asked for and not only by the
   * object, because "Grizzly Tank — did not stand" does not say whether the
   * order or the cancel of it is the thing that went missing.
   */
  function predictLost(loss) {
    const label = loss.ops.map((op) => op.label).find(Boolean);
    const asked = [...new Set(loss.ops.map((op) => PREDICT_ASKED[op.op]).filter(Boolean))];
    buildNote(`${label ? `${label} — ` : ""}${asked.join(" and ") || "the order"} did not stand`);
  }

  const predictLedger = PREDICT ? PREDICT.createLedger({ onLost: predictLost }) : null;

  /**
   * One client queue, as the plain snapshot the algebra reads.
   *
   * `rules` rides along on each item because the production panel draws a cameo
   * per item, and an item that exists only in the prediction has no client-side
   * row to take one from. `queue-predict.js` carries it and never looks in it.
   */
  function readQueue(queue) {
    const { QueueStatus } = state.modules;
    return {
      type: queue.type,
      status: QueueStatus ? String(QueueStatus[queue.status] || "").toLowerCase() : "",
      maxSize: queue.maxSize,
      maxItemQuantity: queue.maxItemQuantity,
      currentSize: queue.currentSize,
      items: queue.getAll().map((item) => ({
        name: item.rules && item.rules.name,
        quantity: item.quantity,
        progress: item.progress || 0,
        rules: item.rules,
      })),
    };
  }

  /**
   * What a queue holds as far as the overlay is concerned: the client's reading
   * with whatever we have pushed and not yet seen applied laid over it.
   *
   * Every read of a queue in this file goes through here — the decisions, the
   * chord tiles, the production panel — so that what a press *means* and what
   * the screen *says* can never disagree about the same moment.
   *
   * Reconciliation is driven from here rather than from a clock: a read is
   * exactly the moment a stale prediction would do harm.
   */
  function predictQueue(queue) {
    const raw = readQueue(queue);
    return predictLedger ? predictLedger.predict(raw) : raw;
  }

  /**
   * Push an `UpdateQueue` action and tell the ledger about it in the same
   * breath, against the reading the decision was taken on.
   *
   * The two have to be one call. `record` stamps its base from the reading given
   * here — before the action lands — and a base taken at the next read instead
   * would already contain the action, so the prediction would apply it twice.
   *
   * `label` is the localised name, kept on the op so that a note about an order
   * that did not stand can name it after the queue it was for has moved on.
   */
  function pushQueueAction(raw, op, mutate) {
    const ui = state.combatant;
    const { ActionType } = state.modules;
    ui.pushAction(ActionType.UpdateQueue, mutate);
    if (predictLedger) predictLedger.record(raw.type, op, raw);
    // Repainted here rather than left to `onQueueUpdate`, which is the client's
    // event and therefore says nothing until the client has applied the thing we
    // are trying not to wait for. An actively building queue dispatches one per
    // tick that spends credits and would have caught up within a frame, but an
    // **idle** one spends nothing and dispatches nothing — so the first order
    // into an empty factory, which is exactly the press a player is watching
    // for, would be the one that still looked laggy.
    repaintQueues();
    syncPredictSweep();
  }

  /** Both queue surfaces, each only if it is on screen. */
  function repaintQueues() {
    if (queuesEl) renderQueueRows();
    if (chordEl) paintChordQueues();
  }

  /**
   * The one timer prediction needs, and only while something is in flight.
   *
   * An order the client drops silently produces no state change, so nothing
   * confirms or contradicts it and the deadline is the only thing that will ever
   * notice. Reads normally provide the beat — a tile repaint runs per tick while
   * a grid is open — but a cancel key pressed with nothing on screen has no next
   * read until the next press, and the note would then arrive minutes late
   * attached to an unrelated moment.
   *
   * Armed to the earliest deadline across the queues and re-armed after each
   * sweep, so a quiet ledger costs nothing.
   */
  let predictTimer = null;

  function syncPredictSweep() {
    if (predictTimer) {
      clearTimeout(predictTimer);
      predictTimer = null;
    }
    if (!predictLedger) return;
    const at = predictLedger.due();
    if (at === null) return;
    predictTimer = setTimeout(() => {
      predictTimer = null;
      sweepPredictions();
    }, Math.max(0, at - Date.now()) + 20);
  }

  /** Read every queue with something in flight, which reconciles each of them. */
  function sweepPredictions() {
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!predictLedger) return;
    if (!production) {
      // The match ended under a pending action. Neither confirmed nor dropped by
      // the client, so it is forgotten rather than reported as either.
      predictLedger.reset();
      return;
    }
    for (const type of predictLedger.waiting()) {
      try {
        const queue = production.getQueue(type);
        if (queue) predictLedger.predict(readQueue(queue));
      } catch (e) {
        note(`could not re-read queue ${type} (${e && e.message})`, "warn");
      }
    }
    repaintQueues();
    syncPredictSweep();
  }

  /**
   * What the queues say about one object, in the shape a tile draws.
   *
   * `getQueueForObject` rather than the section's own queue, because a section
   * is a **sidebar tab and not a queue**: the Units tab holds hovercraft, which
   * build in Ships, and defences sit under Defence but queue in Armory. The
   * client already answers this and getting it wrong here would put a
   * hovercraft's progress bar under a Grizzly.
   *
   * `status` is carried as `QueueStatus`'s own name rather than its number, so
   * the decision table can be tested without the client's enum.
   */
  /**
   * How many more of an object its `BuildLimit` still allows.
   *
   * The third clamp in the client's own `UpdateQueueAction.process`, and the one
   * the extension did not have. A limited building you already own stays
   * **available** — `isAvailableForProduction` weighs tech level, factory and
   * prerequisites and never looks at the limit — so nothing on the tile said the
   * key was dead, and a press pushed an action the client dropped in silence as
   * it ran. The Ore Purifier and the Cloning Vats are the two that meet a player
   * every match.
   *
   * Counted the way the client counts it: what is standing, limbo included —
   * that is a unit sitting inside a transport — plus what is on order, against
   * `|limit|`. A **negative** limit counts everything ever built rather than what
   * is alive, which is `limitedUnitsBuiltByName` and the reason -1 is not the
   * same as no limit at all. No limit at all is `Infinity`, which is what the
   * client's rules parser leaves there when `BuildLimit=` is absent.
   *
   * @param {object} rules the object's rules, as the client parsed them
   * @param {number} queued how many of it this player already has on order
   */
  function buildLimitRoom(rules, queued) {
    const limit = rules && rules.buildLimit;
    if (!Number.isFinite(limit)) return Infinity;
    const player = state.combatant && state.combatant.player;
    // A client whose player object no longer answers this is one this reading is
    // out of date for. "No limit" leaves every tile exactly as it was before the
    // clamp existed, rather than dimming a grid on a guess.
    if (!player || typeof player.getOwnedObjectsByType !== "function") return Infinity;
    let built = 0;
    if (limit >= 0) {
      const owned = player.getOwnedObjectsByType(rules.type, true) || [];
      built = owned.filter((object) => object.name === rules.name).length;
    } else if (typeof player.getLimitedUnitsBuilt === "function") {
      built = player.getLimitedUnitsBuilt(rules.name) || 0;
    }
    return Math.max(0, Math.abs(limit) - (built + queued));
  }

  function queueStateFor(object) {
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!production || !object) return null;
    let queue = null;
    try {
      queue = production.getQueueForObject(object);
    } catch (e) {
      note(`no queue for ${object.name} (${e && e.message})`, "warn");
      return null;
    }
    if (!queue) return null;
    // Predicted rather than raw, so that what the next press means and what the
    // tile says are the same answer to the same moment — see `predictQueue`.
    const at = predictQueue(queue);
    // Summed rather than taken from one entry, and counted here rather than
    // through the module's own helpers, so that a build without
    // src/queue-predict.js still answers about the client's reading instead of
    // reporting every queue empty.
    const queued = at.items.reduce((n, item) => (item.name === object.name ? n + item.quantity : n), 0);
    const isFirst = !!at.items.length && at.items[0].name === object.name;
    return {
      queue,
      snapshot: at,
      queued,
      isFirst,
      status: at.status,
      // Only the item at the head of a queue is being paid for, so only it has
      // a progress worth drawing — the rest are waiting at 0.
      progress: isFirst ? at.items[0].progress || 0 : 0,
      // The same clamp `queueBuild` orders against: the queue's own room,
      // this object's per-type cap and its build limit, whichever runs out
      // first.
      room: Math.min(
        at.maxSize - at.currentSize,
        at.maxItemQuantity - queued,
        buildLimitRoom(object, queued)
      ),
    };
  }

  /**
   * The superweapon a slot would use, or null.
   *
   * Two ways a key reaches one, and this is the only place that knows both: a
   * `sw:` slot names the weapon outright, and an object slot reaches whatever
   * the *building* grants (`TechnoRules.superWeapon`, the `SuperWeapon=` line of
   * its own rules section). Either way the player's own trait is what answers —
   * a weapon nobody owns is not in it.
   */
  function slotSuperWeapon(name, object) {
    const player = state.combatant && state.combatant.player;
    const trait = player && player.superWeaponsTrait;
    if (!trait || typeof trait.get !== "function") return null;
    const key = CHORD_TABLES.chordIsSuperWeapon(name)
      ? CHORD_TABLES.chordSuperWeaponName(name)
      : (object && object.superWeapon) || "";
    return (key && trait.get(key)) || null;
  }

  /**
   * What one says about itself, in the shape the decision table reads.
   *
   * `status` is `SuperWeaponStatus`'s own name rather than its number, so the
   * table can be tested without the client's enum — the same idiom
   * `queueStateFor` uses for a queue.
   */
  function superWeaponState(sw) {
    const { SuperWeaponStatus } = state.modules;
    if (!sw) return null;
    return {
      showTimer: !!(sw.rules && sw.rules.showTimer),
      status: SuperWeaponStatus ? String(SuperWeaponStatus[sw.status] || "").toLowerCase() : "",
      // Seconds left and how far along it is — the client has no event for
      // either (only SuperWeaponReadyEvent, once, at the end), so both are read
      // when something asks.
      seconds: typeof sw.getTimerSeconds === "function" ? Math.ceil(sw.getTimerSeconds()) : 0,
      progress: typeof sw.getChargeProgress === "function" ? sw.getChargeProgress() : 0,
    };
  }

  /** The name to put on a superweapon: the client's own, or the table's. */
  function superWeaponLabel(name, sw) {
    const row = CHORD_TABLES.chordSuperWeaponRow(name);
    const fallback = (row && row.label) || name;
    return sw && sw.rules ? displayName(sw.rules, fallback) : fallback;
  }

  /** `4:05`, for a countdown that is often minutes. */
  function clock(seconds) {
    const whole = Math.max(0, Math.round(seconds));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, "0")}`;
  }

  /**
   * Hand a superweapon to the client's own targeting mode — the same call
   * `handleSidebarSlotClick` makes for a left click on a charged superweapon
   * cameo, on the same rules object.
   *
   * **This fires nothing.** `activateSpecialMode` enters `SpecialActionMode`,
   * which plays EVA_SelectTarget and swaps the cursor; the `ActivateSuperWeapon`
   * action is pushed by the *click that follows*, and the player is the one who
   * aims it. That is the same shape as `placeReady` and it needs no more
   * permission than that one does.
   */
  function activateSuperWeapon(sw) {
    const ui = state.combatant;
    if (!ui || typeof ui.activateSpecialMode !== "function") {
      buildNote("this client cannot activate a superweapon from a key");
      return false;
    }
    if (
      ui.worldInteraction &&
      typeof ui.worldInteraction.isEnabled === "function" &&
      !ui.worldInteraction.isEnabled()
    ) {
      return false;
    }
    try {
      ui.activateSpecialMode(sw.rules);
    } catch (err) {
      note(`could not enter the targeting mode — ${err && err.message}`, "warn");
      return false;
    }
    return true;
  }

  /**
   * What a key that names something does: order it, or use it.
   *
   * Shared by the grid's slots and the flat one-key-one-object bindings, so the
   * two can never disagree about what a Chronosphere key means. The decision is
   * `chordSlotAction`; this carries it out and says what happened.
   *
   * `want` is a **count**, not a flag: one, `CHORD_MANY` for Shift, `Infinity`
   * for a held key, which the queue's own room then clamps. Three quantities is
   * one more than a boolean can carry, and the clamp was always the client's.
   */
  function pressName(name, want, next) {
    const object = ownedObjects().get(name);
    const isSuperWeapon = CHORD_TABLES.chordIsSuperWeapon(name);
    const sw = slotSuperWeapon(name, object);
    const at = superWeaponState(sw);
    const act = CHORD_TABLES.chordSlotAction({ isSuperWeapon, superWeapon: at });
    // `next` reaches the order and nothing else: a superweapon is aimed, not
    // queued, so Ctrl on one is the same press it was without it.
    if (act.act === "order") return { act: "order", ok: queueBuild(name, want, next) };
    const label = superWeaponLabel(name, sw);
    if (act.act === "activate") return { act: "activate", ok: activateSuperWeapon(sw) };
    if (act.act === "charging") {
      // Paused is a low-power base holding an IsPowered weapon, and the clock is
      // not running at all then — saying "4:05" would be a lie that ticks.
      buildNote(at.status === "paused" ? `${label} — no power` : `${label} — ${clock(at.seconds)}`);
      return { act: "charging", ok: false };
    }
    buildNote(`${label} — you have none`);
    return { act: "missing", ok: false };
  }

  /**
   * Pause the queue this object heads, or cancel what is queued of it — the
   * right click the sidebar has always had and the grid did not.
   *
   * Two things worth knowing before pressing it: **Pause is a property of the
   * queue**, not of the item, so pausing a Grizzly pauses the war factory; and
   * the client refunds `creditsSpent` **only** when the last of an object leaves
   * the queue, so cancelling one of three refunds nothing.
   *
   * The decision is a table, and there are two of them because there are two
   * ways to press this: a right click on a tile (`chordQueueAction`, the
   * client's own, where Shift means *all* of them) and a **key** — Alt on a
   * sidebar tab, or Alt on a slot — which goes through `chordCancelAction`,
   * where the pause is folded in. Which one is the only difference between the
   * two paths; everything after it, including which queue is spoken to, is
   * shared.
   *
   * @param {object} object the rules object to act on
   * @param {number} want how many to take off — 1, `CHORD_MANY`, or `Infinity`
   * @param {boolean} viaKey pressed as a key rather than right-clicked
   */
  function queueCancel(object, want, viaKey) {
    const ui = state.combatant;
    const { ActionType, UpdateType } = state.modules;
    if (!ui) return false;
    if (!ActionType || !UpdateType) {
      buildNote("the client's action modules did not load — run __cdc.probe()");
      return false;
    }
    const at = queueStateFor(object);
    if (!at) {
      buildNote("no production queues this match");
      return false;
    }
    const label = displayName(object, object.name);
    const act = viaKey
      ? CHORD_TABLES.chordCancelAction(at, want)
      : CHORD_TABLES.chordQueueAction(at, want);
    // Both pushes go through the ledger against `at.at` — the reading this
    // decision was taken on. That is what stops the second press of a
    // pause-then-cancel pair from re-reading an unchanged queue and sending a
    // second Pause: by then the prediction already says the queue is held, so
    // `chordQueueAction` reaches its cancel row.
    const pause = () =>
      pushQueueAction(at.snapshot, { op: "pause", name: object.name, label }, (action) => {
        action.queueType = at.queue.type;
        action.updateType = UpdateType.Pause;
      });
    if (act.act === "pause") {
      pause();
      buildNote(`${label} — on hold`);
      return true;
    }
    if (act.act === "cancel") {
      // The sidebar reaches a cancel of the item at the head of a running queue
      // only through a pause — its own first right click sends one — so a
      // shifted key sends both in the one press rather than trusting a path the
      // client never takes. `pauseFirst` is set only in that case.
      if (act.pauseFirst) pause();
      pushQueueAction(
        at.snapshot,
        { op: "cancel", name: object.name, quantity: act.quantity, label },
        (action) => {
          action.queueType = at.queue.type;
          action.updateType = UpdateType.Cancel;
          action.item = object;
          action.quantity = act.quantity;
        }
      );
      evaCancelled();
      buildNote(`${label} — cancelled${act.quantity > 1 ? ` ×${act.quantity}` : ""}`);
      return true;
    }
    buildNote(`${label} — nothing queued`);
    return false;
  }

  /**
   * The client's own callout for a cancel, so one from the grid sounds like one
   * from the sidebar. `eva` is a `CombatantUi` constructor property, like the
   * action queue this feature already writes to.
   *
   * A client without one is passed over in silence on purpose: the cancel has
   * already gone to the action queue, and a warning about a missing sound would
   * be a line of log per press for something nobody is waiting on.
   */
  function evaCancelled() {
    const eva = state.combatant && state.combatant.eva;
    if (!eva || typeof eva.play !== "function") return;
    try {
      eva.play("EVA_Canceled");
    } catch (e) {
      note(`could not play the cancel callout (${e && e.message})`, "warn");
    }
  }

  // --- The cancel keys ------------------------------------------------------

  /**
   * Alt on a sidebar tab key: pause or cancel what that tab is building,
   * without opening anything.
   *
   * The section names the queues it feeds, `chordCancelQueue` picks which of
   * them the press meant, and the item at that queue's head is the one acted
   * on — the same one a right click in the sidebar reaches, since the head is
   * the only item a queue is paying for.
   *
   * Nothing here is a new permission: it is the queue action the sidebar's own
   * right click sends, on a queue the player is looking at, reached by a key
   * instead of by finding a cameo.
   */
  /**
   * The queue each section's cancel key last acted on, so that the second half
   * of a pause/cancel pair reaches the queue the first half held.
   *
   * Section id -> queue type name. Without it the Units tab breaks the pair on
   * any base with two factories running: the pause goes to Vehicles, which
   * stops being the active queue, and the cancel then goes to Ships. That was
   * masked while these queues were read raw — inside the lag nothing had
   * changed yet, so the second press saw Vehicles still active — and predicting
   * the pause is what brings it into the open. `chordCancelQueue` holds the
   * preference for as long as the queue still has something in it.
   */
  const cancelStuck = new Map();

  function cancelSection(section, many) {
    const { QueueType } = state.modules;
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!production || !QueueType) {
      buildNote("the client's queue modules did not load — run __cdc.probe()");
      return false;
    }
    const candidates = [];
    for (const type of section.queues || []) {
      let queue = null;
      try {
        queue = production.getQueue(QueueType[type]);
      } catch (e) {
        note(`no ${type} queue in this match (${e && e.message})`, "warn");
      }
      if (!queue) continue;
      // Predicted, so the press after a pause sees a held queue rather than the
      // running one the client has not been told about yet.
      const at = predictQueue(queue);
      if (!at.items.length) continue;
      candidates.push({
        type,
        first: at.items[0],
        status: at.status,
        queued: at.items.reduce((n, item) => n + item.quantity, 0),
      });
    }
    const pick = CHORD_TABLES.chordCancelQueue(candidates, cancelStuck.get(section.id));
    if (!pick) {
      cancelStuck.delete(section.id);
      buildNote(`${section.label.toLowerCase()} — nothing queued`);
      return false;
    }
    cancelStuck.set(section.id, pick.type);
    return queueCancel(pick.first.rules, many ? CHORD_MANY : 1, true);
  }

  /**
   * The keyboard lock — the mechanism a fullscreen game uses to keep Ctrl+W,
   * which is the user's own observation and it is right: `navigator.keyboard`
   * hands the page every key **while the document is fullscreen**, browser
   * shortcuts included.
   *
   * **There is one lock per page, and the client is already using it.** That is
   * the correction 0.60.1 is: `keyboard.lock(codes)` *replaces* the locked set
   * rather than adding to it, and the client locks `Escape, F5, F12, F11` on
   * entering fullscreen — `onFullScreenChange` — precisely so that Escape
   * reaches the game instead of leaving fullscreen. Locking our four tab keys
   * released that. The next Escape then left fullscreen, **and leaving
   * fullscreen ends the lock altogether**, so Ctrl+W went back to closing the
   * tab: the feature worked exactly until the first Escape, with nothing to see
   * in between.
   *
   * So neither side calls the API directly any more. `hookKeyboard` wraps it,
   * every request — the client's and ours — is recorded, and what actually goes
   * out is the union (`chordKeyLockPlan`). Nobody can take anybody's keys away.
   *
   * Two things still bound what we ask for, and both are deliberate:
   *
   * - **Only in a match, and only in the game's own fullscreen.** `F11` browser
   *   fullscreen leaves `document.fullscreenElement` null and the lock inert,
   *   which is a caveat rather than a bug: the API is defined against the
   *   Fullscreen API's element, and the client has its own button.
   * - **Off by preference.** Someone who closes tabs with Ctrl+W and means it
   *   turns this off, and Ctrl+W then does what it always did — while the
   *   client's own Escape lock, which is none of our business, stays untouched.
   *   What they give up since 0.70.0 is "queue next" on the grid's `w` and `t`
   *   slots; every other slot keeps it.
   *
   * **What is asked for moved in 0.70.0 and the reason did not.** The lock was
   * held for the four sidebar tab keys, because the cancel key was Ctrl and one
   * of the tabs is `w`. The cancel is on Alt now, which the browser does not
   * reserve — but Ctrl became "queue next" over the whole chord grid, whose
   * second and fifth slots are `w` and `t`. So the same two codes are held for
   * the opposite command, and `ctrlKeysToHold` derives them from the keys we
   * actually take a Ctrl on rather than naming them.
   */
  let keyLock = "not asked for";
  // What the client last asked the browser for, as `chordKeyLockPlan` reads it.
  let clientLock = { seen: false, all: false, codes: [] };
  let nativeLock = null;
  let nativeUnlock = null;

  function keyLockHeld() {
    return keyLock === "held";
  }

  /**
   * Take over `navigator.keyboard`, once, so both sides' wishes survive.
   *
   * The client's own call is not blocked — it is *widened*: it goes out with our
   * keys added and its own intact, and it re-fires on every fullscreen entry,
   * which is also what re-applies ours after a fullscreen round trip. Our
   * `unlock()` is the one call that is never passed straight through, because
   * unlocking is not ours to do: it would drop the client's Escape with it.
   */
  function hookKeyboard() {
    const kb = navigator.keyboard;
    if (!kb || typeof kb.lock !== "function" || nativeLock) return;
    nativeLock = kb.lock.bind(kb);
    nativeUnlock = typeof kb.unlock === "function" ? kb.unlock.bind(kb) : null;
    kb.lock = (codes) => {
      clientLock = { seen: true, all: !codes, codes: codes ? [...codes] : [] };
      return applyKeyLock();
    };
    if (nativeUnlock) {
      kb.unlock = () => {
        clientLock = { seen: true, all: false, codes: [] };
        applyKeyLock();
      };
    }
    state.hooks.keyboardLock = true;
  }

  /** Do we want the tab keys held right now? */
  function wantKeyLock() {
    return state.prefs.grabTabKeys !== false && !!state.combatant && !!document.fullscreenElement;
  }

  /**
   * Put the one lock the page has into the state both sides asked for.
   *
   * Every path leads here — the client's call, ours, a fullscreen change, a
   * preference — and it recomputes from scratch rather than tracking a
   * difference, because the browser's lock has one state and the two wishes that
   * feed it change independently.
   */
  function applyKeyLock() {
    if (!nativeLock) {
      keyLock = "this browser has no Keyboard API";
      return Promise.resolve();
    }
    const ours = wantKeyLock() ? ctrlKeysToHold() : [];
    const plan = CHORD_TABLES.chordKeyLockPlan(clientLock, ours);
    if (plan.act === "unlock") {
      keyLock = "nothing locked";
      if (nativeUnlock) nativeUnlock();
      return Promise.resolve();
    }
    return Promise.resolve(plan.all ? nativeLock() : nativeLock(plan.codes)).then(
      () => {
        keyLock = ours.length ? "held" : "the client's own only";
        if (ours.length) {
          note(
            `keyboard lock: ${(plan.codes || ["every key"]).join(" ")} — ours ${ours.join(" ")}, ` +
              "the rest the client's"
          );
        }
      },
      (err) => {
        keyLock = `refused — ${(err && err.message) || "no reason given"}`;
        note(`the browser refused the keyboard lock (${err && err.message})`, "warn");
      }
    );
  }

  function syncKeyLock() {
    applyKeyLock();
  }

  // Wrapped as early as this file runs, which is well before any fullscreen can
  // be entered — that needs a user gesture, and the client's own lock call comes
  // with it.
  hookKeyboard();

  // The lock only bites in fullscreen, so entering and leaving it is when there
  // is something to do — and leaving it drops the lock on the browser's side,
  // which is what makes the flag wrong until this runs.
  document.addEventListener("fullscreenchange", syncKeyLock);

  /**
   * The codes we need a Ctrl on that the browser keeps for itself.
   *
   * Ctrl is the "queue next" modifier, so what has to be held is the grid's own
   * keys — `w` is its second slot and `t` its fifth — plus whatever codes the
   * fixed bindings sit on, which is where a `KeyN` could come from. Every side's
   * bindings, not the current one's: the lock is asked for on entering
   * fullscreen, which can be before a side is known, and holding a key nobody
   * turns out to press costs nothing.
   *
   * Until 0.70.0 this was the four sidebar tab keys, because the cancel key was
   * Ctrl and one of the tabs is `w`. The cancel moved to Alt — which the browser
   * does not reserve — and the same problem moved with the Ctrl.
   */
  function ctrlKeysToHold() {
    const codes = new Set(GRID_KEYS);
    for (const id of buildBindings().keys()) codes.add(id.slice(0, id.indexOf("|")));
    return RESERVED_CODES.filter((code) => codes.has(code));
  }

  /**
   * The client's fullscreen key, as both the browser and the client's own table
   * see it: `KeyF`, keyCode 70. A constant because the re-issue below has to
   * reproduce both, and they have to agree.
   */
  const FULLSCREEN_KEYCODE = 70;

  /**
   * How long to wait before saying a re-issued fullscreen key did nothing. Long
   * enough for the transition to land, short enough that the warning arrives
   * while the press is still in mind.
   */
  const FULLSCREEN_SETTLE = 400;

  /**
   * The client's own fullscreen key, moved to `Alt+Enter`.
   *
   * `Alt+F` is what the client binds fullscreen to — its menu says so *in place
   * of an exit*, because on a page there is nothing to exit to: leaving is
   * closing the tab. `F` is also the ninth slot of the chord grid, and since
   * 0.62.0 Alt on a slot key is that slot's cancel. Two things, one press.
   *
   * The grid wins while it is open — it takes the press before this runs — and
   * with no grid open `Alt+F` is **swallowed**: the key moved, and one that
   * moved only half the time would be worse than either arrangement.
   * `Alt+Enter` takes its place, which is what fullscreen is on Windows
   * everywhere else.
   *
   * @returns {boolean} whether the press was ours
   */
  function fullscreenSwap(e) {
    if (state.prefs.fullscreenOnEnter === false) return false;
    if (!e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return false;
    // Swallowed and not acted on: this is the key the setting moved away from.
    if (e.code === "KeyF") return true;
    if (e.code !== "Enter" && e.code !== "NumpadEnter") return false;
    // A held Alt+Enter is one press, not one per repeat — the other reading
    // toggles fullscreen thirty times a second.
    if (!e.repeat) reissueFullscreenKey();
    return true;
  }

  /**
   * Hand the client the key it is still listening for.
   *
   * **The client's own key is re-issued rather than the API called.** Entering
   * fullscreen ourselves would leave the client's keyboard lock unasked for —
   * exactly the state 0.60.1 corrected, where Escape leaves fullscreen instead
   * of reaching the game — so what goes out is a synthetic `Alt+F` at the
   * document and the client does all of it, lock included. It also costs
   * nothing to be right about *which* fullscreen: whatever element the client
   * asks for is the one it gets.
   */
  function reissueFullscreenKey() {
    const was = !!document.fullscreenElement;
    const ev = new KeyboardEvent("keydown", {
      key: "f",
      code: "KeyF",
      keyCode: FULLSCREEN_KEYCODE,
      which: FULLSCREEN_KEYCODE,
      altKey: true,
      bubbles: true,
      cancelable: true,
      composed: true,
    });
    // The client hashes `keyCode` into its own hotkey table (see MODIFIER_BITS),
    // so that is the field that has to survive the constructor. Chrome takes it
    // from the init dictionary; a build that stopped would leave 0 here, and the
    // press would hash to something the client has never bound.
    if (ev.keyCode !== FULLSCREEN_KEYCODE) {
      Object.defineProperty(ev, "keyCode", { get: () => FULLSCREEN_KEYCODE });
      Object.defineProperty(ev, "which", { get: () => FULLSCREEN_KEYCODE });
    }
    document.dispatchEvent(ev);
    // `isTrusted` is the one field a page cannot forge, and a handler that reads
    // it drops this without a word. Said out loud after the fact rather than
    // retried by another route — the other route is `requestFullscreen`, which
    // is the one thing this is written to avoid.
    setTimeout(() => {
      if (!!document.fullscreenElement === was) {
        note(
          "Alt+Enter went to the client as Alt+F and fullscreen did not change — it may be " +
            "refusing a synthetic key. Untick the setting and Alt+F works as it always did.",
          "warn"
        );
      }
    }, FULLSCREEN_SETTLE);
  }

  /**
   * A tab press, and whether it was consumed.
   *
   * The *first* press of a pair never is — it is the client's tab switch and has
   * to reach it.
   */
  function chordPress(e) {
    // Auto-repeat is not a chord. Holding a tab key fires keydown again after
    // the OS repeat delay and then every ~30ms, so without this a key held for
    // half a second opens a grid nobody asked for — and the repeats would also
    // keep pushing the window forward. Ignored outright, so the tap recorded by
    // the real press stands or expires on its own.
    if (e.repeat) return false;
    if (e.ctrlKey || e.altKey || e.shiftKey) return false;
    const section = prefixes().get(e.code);
    if (!section) return false;
    const now = performance.now();
    const tap = state.tap;
    state.tap = { code: e.code, at: now };
    // One press, by preference. The press is **not** consumed: the client's own
    // tab switch is what the first press has always been, and this changes only
    // what happens beside it — which is the whole of what was asked for, and
    // why nothing else in the feature had to move. Ordering from the grid still
    // takes a second key, so a tab switch alone costs nothing but a box that
    // closes on the next press.
    if (state.prefs.chordSinglePress) {
      openChord(section);
      return false;
    }
    if (!tap || tap.code !== e.code || now - tap.at > CHORD_WINDOW) return false;
    state.tap = null;
    openChord(section);
    // Consumed: the tab is already the one this press would switch to, so the
    // client loses nothing, and letting it through replays the tab sound under
    // an overlay that has just opened.
    return true;
  }

  /**
   * Open the grid for a section — or, when the section's queue is holding a
   * finished structure, pick that structure up instead.
   *
   * The second case is the request's own exception ("while it is ready you
   * cannot cancel anyway") answered with the thing you actually want next: a
   * ready structure blocks its queue, so the grid could only refuse every slot,
   * while placing it is one keypress away and is exactly what clicking the
   * ready cameo does.
   *
   * **The same is true of a grid that is already open**, which is the half this
   * missed until 0.61.0: a grid opened while the queue was building is still up
   * when the building finishes, and from then on every slot on it is refused —
   * so the tab key that opened it places, exactly as it would have with nothing
   * open. `chordAction` decides that; this function is the closed-grid half.
   *
   * **A structure that is still building now opens the grid** (0.58.0),
   * reversing 0.54.4. That rule was "there is nothing to add and nothing to
   * cancel", and the second half of it stopped being true the moment a tile
   * could be right-clicked: the grid is where you see how far the building has
   * got and where you pause or cancel it. Ready is still placement, because
   * placing is what you want at that moment — the client would cancel a ready
   * structure on a right click, and the sidebar is still where to do that.
   */
  function openChord(section) {
    const ready = sectionReadyQueue(section);
    if (ready) {
      placeSectionReady(section, ready);
      return;
    }
    state.chord = { section };
    renderChord();
  }

  /**
   * The section's queue when it is holding a **finished** structure, else null.
   *
   * Two presses read this and they have to agree: the tab press that would open
   * a grid, and the same tab key pressed while one is already open. Only the two
   * building sections have a `queue` at all, and a unit queue is never Ready
   * (units leave their factory on their own), so this is null everywhere else.
   */
  function sectionReadyQueue(section) {
    const queue = sectionQueue(section);
    if (!queue) return null;
    // Predicted, so that a structure whose cancel is still in flight stops
    // being something the tab key offers to place: the queue reads Ready until
    // the client applies the cancel, and placing what you have just cancelled
    // is the one outcome nobody pressed for.
    const at = predictQueue(queue);
    return at.status === "ready" && at.items.length ? queue : null;
  }

  /**
   * Hand the section's finished structure to placement, and get the grid out of
   * the way — the next thing you do is click the map, and an open box takes the
   * mouse, which is the same reason an activation closes it.
   */
  function placeSectionReady(section, queue) {
    if (placeReady(queue)) closeChord();
    else buildNote(`${section.label.toLowerCase()} queue is blocked`);
  }

  function closeChord() {
    state.chord = null;
    chordHoldClear();
    renderChord();
  }

  /**
   * Hand a finished structure to the client's placement mode — the same two
   * calls `CombatantUi#handleSidebarSlotClick` makes for a left click on a ready
   * cameo, on the same object. It needs no permission of its own: placing is a
   * local UI mode, not an action on the queue.
   */
  function placeReady(queue) {
    const ui = state.combatant;
    const first = queue.getFirst();
    if (!ui || !first || !ui.placementMode || !ui.worldInteraction) return false;
    if (typeof ui.worldInteraction.isEnabled === "function" && !ui.worldInteraction.isEnabled()) return false;
    try {
      ui.placementMode.setBuilding(first.rules);
      ui.worldInteraction.setMode(ui.placementMode);
    } catch (err) {
      note(`could not enter placement mode — ${err && err.message}`, "warn");
      return false;
    }
    return true;
  }

  /**
   * A press while the grid is open. Returns true when it was consumed.
   *
   * The decision is `chordAction` in src/build-chords.js, where it can be tested
   * without a browser; this only carries it out.
   *
   * **Three quantities, one gesture each**: a tap is one, Shift is the client's
   * five, and holding the key is all of it. The hold is armed here rather than
   * decided in the table, because the table sees a keydown and a hold is the
   * absence of the keyup that should have followed.
   */
  function chordKey(e) {
    const { section } = state.chord;
    const ready = sectionReadyQueue(section);
    const action = CHORD_TABLES.chordAction(e, { prefix: prefixCode(section), ready: !!ready });
    // Armed **before** the press is carried out, so that a press which closes
    // the grid — a building order does — takes the pending hold down with it
    // rather than topping up a queue nobody is looking at any more.
    if (action.act === "order" || action.act === "cancel") {
      chordHoldArm(e.code, section, action.slot, action.act, action.next);
    }
    const want = action.many ? CHORD_MANY : 1;
    if (action.act === "place") placeSectionReady(section, ready);
    else if (action.act === "close") closeChord();
    else if (action.act === "cancel") cancelSlot(section, action.slot, want, true);
    else if (action.act === "order") orderSlot(section, action.slot, want, action.next);
    return action.consume;
  }

  /**
   * The slot key being held down right now, if one is.
   *
   * One at a time: a second press replaces the first, which is what the hand
   * means by it — and the OS repeat that arrives while a key is down is not a
   * press at all (`chordAction` answers `hold` to it), so it never pushes the
   * timer forward.
   */
  let chordHold = null;

  function chordHoldClear() {
    if (chordHold) clearTimeout(chordHold.timer);
    chordHold = null;
  }

  /**
   * A held slot key means **all of it** — the queue filled to its room, or the
   * whole of it cancelled.
   *
   * The tap has already acted by the time this is armed, so what fires here is
   * the *rest*: one is queued, then the queue fills; the pause is sent, then
   * everything goes. Nothing waits on the key coming back up, which is the only
   * version of this worth having in a game played at speed.
   */
  function chordHoldArm(code, section, slot, act, next) {
    chordHoldClear();
    const timer = setTimeout(() => {
      chordHold = null;
      // The grid can be gone by now, and with it the reason for the press.
      if (!state.chord || state.chord.section !== section) return;
      if (act === "cancel") cancelSlot(section, slot, Infinity, true);
      // A held Ctrl fills the queue behind what is building rather than after
      // everything — the same thing the tap did, which is what a hold is.
      else orderSlot(section, slot, Infinity, next);
    }, CHORD_HOLD);
    chordHold = { code, timer };
  }

  /** The key this section's grid opens on, as `prefixes()` has it. */
  function prefixCode(section) {
    for (const [code, at] of prefixes()) if (at === section) return code;
    return "";
  }

  /**
   * Order what is on a slot. Shift is the client's own five, and it is the
   * client that decides how many of those five actually fit.
   *
   * Buildings close the grid on the way out — their queue holds one item, so a
   * second order would be refused anyway — while units leave it open, which is
   * the point of a grid for units: five Grizzlies is `rrq` five times, or `rr`
   * then Shift+`q`.
   */
  function orderSlot(section, slot, want, next) {
    const name = slotName(section, slot);
    if (!name) {
      buildNote(`nothing on ${keyLabelFor(slot)} in ${section.label}`);
      return;
    }
    const done = pressName(name, want, next);
    // An activation **always** closes the grid, and it has to: what happens next
    // is a click on the map, and a grid still up would swallow it — the box
    // takes the mouse, which is the whole reason it can be clicked at all.
    if (done.act === "activate") {
      if (done.ok) closeChord();
      return;
    }
    if (done.act === "order" && done.ok && section.queue) closeChord();
  }

  /**
   * The right click on a slot: pause or cancel what it holds.
   *
   * Unlike an order, this never closes a buildings grid — cancelling a
   * structure empties its queue, and the grid you are left looking at is the
   * one you would have had to reopen to order the replacement.
   *
   * `viaKey` picks which of the two tables answers: a right click is the
   * client's own (`chordQueueAction`), Alt on the slot key is the one the other
   * cancel key already uses (`chordCancelAction` — pause first, cancel on the
   * second press). See `queueCancel`.
   */
  function cancelSlot(section, slot, want, viaKey) {
    const name = slotName(section, slot);
    const object = name ? ownedObjects().get(name) : null;
    if (name && CHORD_TABLES.chordIsSuperWeapon(name)) {
      // A superweapon is not in a queue and never was: there is nothing here to
      // pause and nothing to refund.
      buildNote(`${superWeaponLabel(name, slotSuperWeapon(name, null))} — not a queue`);
      return;
    }
    if (!object) {
      buildNote(`nothing on ${keyLabelFor(slot)} in ${section.label}`);
      return;
    }
    queueCancel(object, want, viaKey);
  }

  /** What this slot resolves to for this player right now, or "". */
  function slotName(section, slot) {
    const value = chordLayout(playerSide(), section.id)[slot];
    return resolveSlot(value, availableNames(), ownedObjects());
  }

  function keyLabelFor(slot) {
    return CHORD_TABLES ? CHORD_TABLES.chordKeyLabel(slot) : "";
  }

  // --- The grid itself ------------------------------------------------------

  /**
   * One cameo out of the running client, by picture name, as a data URL.
   *
   * **Every** picture the game tab draws comes through here. It can: this tab is
   * by definition a tab with a live client in it, and that client has RA2's
   * sidebar art in its VFS from the moment the engine boots. A sheet shipped
   * beside it was 190 KB of artwork EA never licensed for redistribution, in the
   * localisation of whatever install it was generated from rather than the
   * player's own.
   *
   * `ImageUtils.convertShpToCanvas` is the client's own converter — the
   * alternative is a second SHP decoder in this file, and there is already one
   * too many in this repo.
   *
   * Cropped to `CAMEO_CELL`, the top 36 rows of the 48: the unit's name is
   * painted across the bottom of a cameo, in the language the install was built
   * in. Cached by **picture** name rather than by id, because the art never
   * changes, `toDataURL` is not free, and two ids frequently share one picture
   * (a Chrono Sphere and its warp, a construction yard and its MCV).
   *
   * Returns "" when the client cannot answer, and caches that too, so a picture
   * that is not there is asked for once. What an empty answer means is the
   * caller's: a superweapon falls back to its building's cameo, a grid tile
   * draws nothing.
   *
   * @param {string} image the picture name, off the art or off a weapon's rules
   * @param {string} forWhat whose picture it is, for the warning only
   */
  const CAMEO_CELL = { width: 60, height: 36 };
  const clientCameos = new Map();

  function clientCameoUrl(image, forWhat) {
    if (!image) return "";
    if (clientCameos.has(image)) return clientCameos.get(image);
    let url = "";
    const { Engine, ImageUtils } = state.modules;
    try {
      const shp = Engine && Engine.getImages().get(image + ".shp");
      const palette = Engine && Engine.getPalettes().get("cameo.pal");
      if (shp && palette && ImageUtils) {
        const full = ImageUtils.convertShpToCanvas(shp, palette);
        const canvas = document.createElement("canvas");
        canvas.width = CAMEO_CELL.width;
        canvas.height = CAMEO_CELL.height;
        // The converter lays every frame of the file out in a row. A cameo is
        // one frame, but crop rather than trust that: a file with two would
        // otherwise draw both, squeezed.
        canvas
          .getContext("2d")
          .drawImage(
            full,
            0,
            0,
            CAMEO_CELL.width,
            CAMEO_CELL.height,
            0,
            0,
            CAMEO_CELL.width,
            CAMEO_CELL.height
          );
        url = canvas.toDataURL();
      } else if (!shp) {
        note(`the client has no ${image}.shp for ${forWhat}`, "warn");
      }
    } catch (e) {
      note(`could not draw ${image} from the client (${e && e.message})`, "warn");
    }
    clientCameos.set(image, url);
    return url;
  }

  /**
   * Which picture each id a slot can hold draws, off the client's own rules.
   *
   * **`Cameo=` is art, not rules**, and a superweapon's `SidebarImage=` is rules,
   * not art. Measured against the live client (`scripts/probe-cameo-harvest.js`,
   * 2026-08-20): `art.getObject(id, type).cameo` answered for 97 of 97 technos
   * and `rules.sidebarImage` for none of them, while `sidebarImage` answered for
   * all seven superweapons. Two mechanisms, not two chances at one — which is
   * why `cameoFace` reads each from its own place and never tries one after the
   * other has failed.
   *
   * An art section is named after `Image=`, not after the object, and
   * `Art#getObject` is what walks that indirection — the offline generator this
   * replaces had to do it by hand.
   *
   * A `sw:` slot is a superweapon in its own right — the two paradrops — and it
   * is indexed here under the same key the layouts use, off `SidebarImage=`. It
   * has to be: `slotSuperWeapon` answers only for a weapon the player already
   * has, and a grid draws the whole layout including what is not up yet. The
   * committed sheet carried these two cells by hand for exactly this reason.
   *
   * Walked once and held, rather than asked per tile: the queue panel repaints
   * on every tick a factory spends credits on, and `Art#getObject` builds an
   * `ObjectArt` per call. An id with no picture is simply absent, which is what
   * makes its tile draw nothing instead of a stand-in.
   *
   * @returns {Map<string, string>} id -> picture name
   */
  let cameoPictures = null;

  function cameoPictureFor(id) {
    if (!cameoPictures) cameoPictures = buildCameoPictures();
    return cameoPictures.get(id) || "";
  }

  function buildCameoPictures() {
    const out = new Map();
    const { Engine, Rules, Art, ObjectType } = state.modules;
    if (!Engine || !Rules || !Art || !ObjectType) {
      // Which of them is missing was already named on the `modules:` line at
      // load; repeating it once per tile would bury it.
      note("the client's art modules did not load — tiles will name ids instead of drawing them", "warn");
      return out;
    }
    try {
      const rules = new Rules(Engine.getRules());
      // Two arguments, no mapFile — src/hq-preview.js passes a third because a
      // map's own art overrides the global set, and a cameo has no map to be
      // overridden by. Confirmed accepted by the live client rather than assumed
      // (scripts/probe-cameo-harvest.js).
      const art = new Art(rules, Engine.getArt());
      // The four techno lists. `allObjectRules` also holds terrain, overlay,
      // smudge and voxel-anim rules, none of which a key can ever order.
      for (const type of [
        ObjectType.Building,
        ObjectType.Infantry,
        ObjectType.Vehicle,
        ObjectType.Aircraft,
      ]) {
        const byName = rules.allObjectRules.get(type);
        if (!byName) {
          note(`the client lists no rules of type ${type} — those cameos will be missing`, "warn");
          continue;
        }
        for (const name of byName.keys()) {
          let picture = "";
          try {
            const object = art.getObject(name, type);
            picture = (object && object.cameo) || "";
          } catch (e) {
            // An id the art has no section for at all. That is most of the
            // rules lists — scenery, fences, the Tiberian Sun leftovers the
            // engine inherited — so it is the common case, not an error worth
            // logging. Same reasoning as `pictureFor` in src/hq-preview.js.
            picture = "";
          }
          if (picture) out.set(name, picture);
        }
      }
      // The `sw:` slots, keyed as the layouts key them. A weapon is not an
      // object, so it has no Image= -> Cameo= chain; the client parses
      // `SidebarImage=` onto the weapon's own rules instead. Same walk as the
      // harvester in src/hq-preview.js.
      const weapons = rules.superWeaponRules;
      if (weapons && typeof weapons.forEach === "function") {
        weapons.forEach((weapon, key) => {
          const picture = (weapon && weapon.sidebarImage) || "";
          if (picture) out.set(`sw:${(weapon && weapon.name) || key}`, picture);
        });
      } else {
        note("the client has no superweapon rules — paradrop tiles will name ids", "warn");
      }
    } catch (e) {
      note(`could not read the client's cameo art (${e && e.message})`, "warn");
    }
    return out;
  }

  /**
   * The picture on one key.
   *
   * @param {string} name the slot's id, resolved through the client's own art
   * @param {object} [weapon] the superweapon this key now *uses* rather than
   *   orders, whose own icon replaces the building's
   */
  function cameoFace(name, weapon) {
    const face = document.createElement("span");
    face.className = "cdc-cameo";
    // A key that has stopped ordering shows what it does now. The building's
    // cameo is still the right picture right up until the building exists —
    // which is why a weapon the client cannot draw falls through to it rather
    // than to nothing.
    const own = weapon ? clientCameoUrl(weapon.rules && weapon.rules.sidebarImage, weapon.name) : "";
    const url = own || clientCameoUrl(cameoPictureFor(name), name);
    if (!url) {
      // No picture in the game's own art, or no art to ask at all. Say the id
      // rather than draw an invented placeholder.
      face.classList.add("cdc-cameo-none");
      face.textContent = name;
      return face;
    }
    face.style.backgroundImage = `url("${url}")`;
    // The sheet's own three custom properties, now describing a one-cell image:
    // the whole picture is the cell, and the offset into it is zero. Set per
    // element rather than dropped, because companion.css still scales the queue
    // panel's smaller copy off them (`calc(var(--cdc-cameo-w) / 2)`).
    face.style.setProperty("--cdc-cameo-w", `${CAMEO_CELL.width}px`);
    face.style.setProperty("--cdc-cameo-h", `${CAMEO_CELL.height}px`);
    face.style.setProperty("--cx", "0px");
    face.style.setProperty("--cy", "0px");
    return face;
  }

  /** What this player can queue right now, by id. */
  function availableNames() {
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!production) return new Set();
    return new Set(production.getAvailableObjects().map((object) => object.name));
  }

  /**
   * Which of a slot's ids this match means. The decision is `chordResolve` in
   * src/build-chords.js, where it can be tested; this only supplies the two
   * facts it asks for.
   */
  function resolveSlot(value, available, owned) {
    if (!CHORD_TABLES) return "";
    return CHORD_TABLES.chordResolve(CHORD_TABLES.chordSlotIds(value), playerCountry(), (id) => ({
      available: available.has(id),
      object: owned.get(id),
    }));
  }

  /** The player's country as the rules name it, or "" outside a match. */
  function playerCountry() {
    const player = state.combatant && state.combatant.player;
    const country = player && player.country;
    return (country && (country.name || country)) || "";
  }

  /**
   * Everything this side owns, by id — the roster before prerequisites, which is
   * what lets a tile that cannot be built yet still carry its real name.
   */
  function ownedObjects() {
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    const all = production && production.allAvailableObjects;
    const out = new Map();
    if (Array.isArray(all)) for (const object of all) out.set(object.name, object);
    return out;
  }

  /**
   * The layer both new overlays live in.
   *
   * Inside `#ra2web-root`, `pointer-events: none`, with the boxes inside it
   * turning them back on — which is exactly how `.cdc-ig-map` has taken drags
   * since it was written, and the only arrangement in this extension known to
   * receive a click over a running match. Its own layer rather than `.cdc-ig`
   * because that one exists only while the in-game overlay is up, and a build
   * grid cannot depend on an unrelated toggle.
   *
   * It decides **only** hit-testing. The boxes inside it are `position: fixed`
   * and placed in viewport coordinates, because that is the space a mouse event
   * arrives in — 0.54.2 routed placement through this layer's box as well and
   * lost the cursor for it.
   */
  let layerEl = null;

  function chordLayer() {
    if (layerEl && layerEl.isConnected) return layerEl;
    layerEl = document.createElement("div");
    layerEl.className = "cdc-layer";
    (document.getElementById("ra2web-root") || document.body).append(layerEl);
    return layerEl;
  }

  /**
   * Is the game holding the mouse? Asked of the browser rather than of the
   * client, because it is the browser's own state and needs no object of the
   * client's to have been captured first.
   */
  function mouseCaptured() {
    return !!document.pointerLockElement;
  }

  /**
   * Where the player's cursor actually is, in viewport pixels.
   *
   * **Not** `state.pointer` when it can be helped. The client holds a pointer
   * lock for most of a match and draws its own cursor sprite, and under a lock
   * the DOM's `clientX/clientY` stop moving — so the mouse event's idea of
   * where the cursor is freezes at whatever it was when the lock took, while
   * the cursor the player is looking at goes on moving. That is why a grid
   * opened in a corner: not the wrong coordinate space, a stale input.
   *
   * `Pointer#getPosition()` is the position the client itself draws at, in
   * canvas pixels; the canvas's own box turns it back into viewport pixels.
   * `state.pointer` remains the fallback for anything before a match.
   */
  function cursorPoint() {
    const ui = state.pointerUi;
    // Only while the lock is held. Unlocked, the client derives its pointer
    // from `offsetX/offsetY` of whatever the event hit — which is *our* box
    // when the mouse is over an overlay, and therefore the wrong origin. The
    // DOM's own coordinates are right in that case and live, since nothing is
    // freezing them.
    if (mouseCaptured() && ui && typeof ui.getPosition === "function" && ui.canvas) {
      try {
        const at = ui.getPosition();
        const rect = ui.canvas.getBoundingClientRect();
        if (at && rect.width) {
          // Through `chordScreenBox` rather than adding the box's own corner
          // to the pointer, which was this line until 0.65.0 and is only right
          // while the two spaces are the same size. They are not below 800x600: the client floors its
          // canvas there (`Math.max(800, …)`) and lets the browser scale the
          // overflow down, so every grid opened a little further from the
          // cursor the smaller the window got.
          const box = CHORD_TABLES.chordScreenBox(
            { x: at.x, y: at.y, width: 0, height: 0 },
            rect,
            { width: ui.canvas.width, height: ui.canvas.height }
          );
          return { x: box.left, y: box.top };
        }
      } catch (e) {
        note(`could not read the client's pointer (${e && e.message})`, "warn");
      }
    }
    return state.pointer;
  }

  /**
   * What of ours is under the game's cursor, if anything.
   *
   * `elementFromPoint` is the browser's own hit test — z-order, overlaps and all
   * — just aimed at the position the player can see rather than at the frozen
   * one a locked mouse reports. Returns the deepest element; callers narrow it
   * with `closest`.
   */
  function underCursor() {
    const at = cursorPoint();
    if (!at) return null;
    return document.elementFromPoint(at.x, at.y);
  }

  let chordEl = null;

  /**
   * The line under a grid's title: what the mouse and the odd key do here.
   *
   * A buildings grid drops the two quantity rules — its queue holds one item, so
   * neither five nor a full queue is on offer — and gains the placement key
   * while that queue is holding a finished structure, which is the one thing on
   * a grid that is true only for a moment.
   *
   * The two cancels are named as one: Alt and the right click send the same
   * press, and a hint line that spelled them separately would be longer without
   * saying more.
   *
   * `Ctrl next` is named on a units grid only. It is the client's `AddNext`, and
   * what it inserts behind is the item being built — which a queue holding one
   * item, as both building queues do, never has room for.
   */
  function chordHint(section) {
    const ready = sectionReadyQueue(section);
    const key = ready ? prefixCode(section).replace(/^Key|^Digit/, "") : "";
    return (
      (key ? `${key} places · ` : "") +
      (section.queue ? "" : "Shift ×5 · hold fills · Ctrl next · ") +
      "Alt or right-click cancels · Esc closes"
    );
  }

  function renderChord() {
    if (!state.chord) {
      if (chordEl) chordEl.remove();
      chordEl = null;
      window.removeEventListener("mousedown", onOverlayMouseDown, true);
      window.removeEventListener("contextmenu", onOverlayContextMenu, true);
      syncOverlayMouse();
      syncChargeTimer();
      syncQueueSubscription();
      return;
    }

    const { section } = state.chord;
    const layout = chordLayout(playerSide(), section.id);
    const available = availableNames();
    const owned = ownedObjects();

    if (chordEl) chordEl.remove();
    chordEl = document.createElement("div");
    chordEl.className = "cdc-chord";

    const head = document.createElement("div");
    head.className = "cdc-chord-head";
    head.textContent = section.label;
    const hint = document.createElement("span");
    hint.className = "cdc-chord-hint";
    hint.textContent = chordHint(section);
    head.append(hint);
    chordEl.append(head);

    // What each key resolves to for this player. A country pair draws as
    // whichever of its two names this player builds, under the client's own
    // label for it — so an American sees their own Airforce Command and a
    // Korean sees a Black Eagle, on the same key.
    const names = layout.map((value) => resolveSlot(value, available, owned));

    /**
     * What each key *is*, before anything is drawn: the object behind the id,
     * the weapon it may have become, and whether it still orders or now aims.
     * Asked once per slot here because both visibility rules below and the tile
     * loop want the same answer, and `slotSuperWeapon` is a walk.
     */
    const facts = names.map((name) => {
      const object = owned.get(name);
      const isSuperWeapon = !!name && CHORD_TABLES.chordIsSuperWeapon(name);
      const sw = name ? slotSuperWeapon(name, object) : null;
      const act = CHORD_TABLES.chordSlotAction({
        isSuperWeapon,
        superWeapon: superWeaponState(sw),
      }).act;
      return { object, sw, isSuperWeapon, uses: !!name && act !== "order" };
    });

    /**
     * Which of them are drawn, in two answers, because the setting decides only
     * one of them. The rule itself is `chordSlotShown` in src/build-chords.js,
     * where it can be tested; this supplies the facts and nothing more.
     *
     * `drawn` is the **whole grid** — everything this country builds, orderable
     * or not — and it decides which cells hold a tile at all, under both
     * settings. A tile that "only what can be built now" hides is therefore
     * built and made invisible rather than left out: availability moves under an
     * open grid, and a battle lab landing has to hand its keys back without the
     * grid being closed and reopened for it.
     *
     * `live` is what is visible right now. Trailing rows are dropped against it,
     * so an early-match units grid is two rows instead of three of nothing —
     * and a dropped row is the one place where a tile that arrives late does
     * wait for the next opening, which is a row nobody was looking at.
     */
    const onlyBuildable = !!state.prefs.chordOnlyBuildable;
    const slotShown = (slot, mode) =>
      CHORD_TABLES.chordSlotShown({
        bound: !!names[slot],
        isSuperWeapon: facts[slot].isSuperWeapon,
        hasWeapon: !!facts[slot].sw,
        available: available.has(names[slot]),
        uses: facts[slot].uses,
        onlyBuildable: mode,
      });
    const drawn = names.map((_, slot) => slotShown(slot, false));
    const live = names.map((_, slot) => slotShown(slot, onlyBuildable));
    const rows = CHORD_TABLES.chordGridRows(live, GRID_COLS);

    const grid = document.createElement("div");
    grid.className = "cdc-chord-grid";
    grid.style.setProperty("--cols", String(GRID_COLS));
    names.slice(0, rows * GRID_COLS).forEach((name, slot) => {
      // A hidden key still costs its cell. The grid's geometry is the
      // keyboard's, so a hole that closed up would move every key after it and
      // the block would stop standing for the block under the hand.
      if (!drawn[slot]) {
        const gap = document.createElement("i");
        gap.className = "cdc-chord-gap";
        grid.append(gap);
        return;
      }
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "cdc-chord-slot";
      tile.dataset.slot = String(slot);
      const key = document.createElement("i");
      key.className = "cdc-chord-key";
      key.textContent = keyLabelFor(slot);
      // Which of the two things this key is: something to order, or a
      // superweapon to use. A building that grants a timered weapon is the
      // second once the weapon exists, which is why this is not simply "is the
      // id a sw: one".
      const { object, sw, uses } = facts[slot];
      const label = document.createElement("span");
      label.className = "cdc-chord-name";
      label.textContent = uses
        ? superWeaponLabel(name, sw)
        : object
        ? displayName(object, name)
        : name;
      // The three the queue paints into, made once and hidden until there is
      // something to say. Built here rather than in the paint pass because
      // that pass runs on every game tick a queue is being paid for, and a
      // tile that rebuilds its own children cannot be hovered.
      const qty = document.createElement("i");
      qty.className = "cdc-chord-qty";
      qty.hidden = true;
      const pct = document.createElement("i");
      pct.className = "cdc-chord-pct";
      pct.hidden = true;
      const bar = document.createElement("i");
      bar.className = "cdc-chord-bar";
      bar.hidden = true;
      tile.append(cameoFace(name, uses ? sw : null), key, qty, pct, bar, label);
      tile.dataset.name = name;
      // The tile whose key no longer orders anything says so in its own border,
      // and the paint pass reads this class to know whose numbers to draw —
      // a charge rather than a queue.
      if (uses) tile.classList.add("cdc-chord-super");
      // Hidden by "only what can be built now" — a class rather than a missing
      // tile, so the paint pass can hand the key back the moment the thing it
      // was waiting on arrives.
      if (!live[slot]) tile.classList.add("cdc-chord-hidden");
      // Whether it can be ordered *right now* is not decided here. It changes
      // under an open grid — the Ore Purifier you are watching go up takes its
      // own key away the moment it lands — so `.cdc-chord-off` is a painted
      // state like the queue marks beside it, not a fact of the render.
      tile.title = uses
        ? `${label.textContent} — ${keyLabelFor(slot)} aims it`
        : `${label.textContent} — ${keyLabelFor(slot)}`;
      // The world takes mousedown as a command, so the tile swallows its own
      // before the client sees it; the order goes on click, as a button's does,
      // so a press that slides off the tile is not an order.
      tile.addEventListener("mousedown", (e) => e.stopPropagation(), true);
      tile.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        // **Ctrl is "queue next" on the mouse too.** The modifier says where in
        // the queue the item goes, not which device asked for it, and a grid
        // that answered it on the keys but not on a click would read as broken
        // rather than as a rule.
        orderSlot(section, slot, e.shiftKey ? CHORD_MANY : 1, e.ctrlKey);
      });
      grid.append(tile);
    });
    chordEl.append(grid);
    if (!rows) {
      // Every key of this tab empty, for one of two reasons — the layout binds
      // nothing this country builds, or the setting is hiding a tab whose whole
      // roster is still behind a prerequisite. Said in words rather than left as
      // an empty box, which reads as the grid having failed to draw, and the two
      // are told apart because only one of them is worth waiting for.
      const none = document.createElement("div");
      none.className = "cdc-chord-none";
      none.textContent = drawn.some(Boolean)
        ? "nothing on this tab can be built yet"
        : "nothing on this tab is yours to build";
      chordEl.append(none);
    }

    chordLayer().append(chordEl);
    placeAtPointer(chordEl);
    paintChordQueues();
    syncChargeTimer();
    syncQueueSubscription();
    window.addEventListener("mousedown", onOverlayMouseDown, true);
    syncOverlayMouse();
    // A right click is an order to cancel, so the browser's menu must not open
    // over the match. Swallowed for the whole window while a grid is up: it is
    // the same press the tile has already acted on in `mousedown`.
    window.addEventListener("contextmenu", onOverlayContextMenu, true);
  }

  /**
   * Draw what the queues say onto the tiles: how many are ordered, and how far
   * the one being paid for has got.
   *
   * Runs on the client's own `onQueueUpdate`, which the production trait
   * dispatches on every tick that spends credits (`e && i.notifyUpdated()`) —
   * so the bar moves with the build and stops dead when the money runs out,
   * with no timer of ours. It only ever writes text and classes; the tiles
   * themselves are built once, in `renderChord`.
   */
  function paintChordQueues() {
    if (!chordEl) return;
    // The tab key changes meaning the moment the queue turns ready, and the hint
    // line is the only thing on screen that says so. Repainted here rather than
    // written once in `renderChord`, because the grid was opened while the
    // building was still going up — the state it names arrives after it.
    const hint = chordEl.querySelector(".cdc-chord-hint");
    if (hint && state.chord) hint.textContent = chordHint(state.chord.section);
    const owned = ownedObjects();
    // Re-asked every paint, because this is the half of a tile that moves on its
    // own: prerequisites come up, a factory is shelled, a build limit is reached
    // by the very thing the grid is showing the progress of.
    const available = availableNames();
    const onlyBuildable = !!state.prefs.chordOnlyBuildable;
    for (const tile of chordEl.querySelectorAll(".cdc-chord-slot")) {
      const name = tile.dataset.name;
      const qty = tile.querySelector(".cdc-chord-qty");
      const pct = tile.querySelector(".cdc-chord-pct");
      const bar = tile.querySelector(".cdc-chord-bar");
      if (!name || !qty) continue;
      // "Only what can be built now", re-decided every paint for the reason the
      // dim is: a tile hidden because the battle lab was not up has to come back
      // the moment it is, under the open grid. A key that *aims* is never
      // hidden — a charged Chronosphere must not vanish because the lab behind
      // its building died. Toggled rather than only set, so unticking the
      // setting reaches a grid that is already open.
      tile.classList.toggle(
        "cdc-chord-hidden",
        onlyBuildable && !available.has(name) && !tile.classList.contains("cdc-chord-super")
      );
      // A tile whose key aims a superweapon has no queue behind it — what its
      // three marks say is a charge instead.
      if (tile.classList.contains("cdc-chord-super")) {
        paintCharge(tile, name, owned, { qty, pct, bar });
        continue;
      }
      // Not orderable at this moment — a prerequisite missing, the factory
      // gone, or this object at the build limit and already standing. Dimmed,
      // and still live: a key with something queued behind it is only cancellable
      // from its own tile, and one with nothing behind it answers the press by
      // naming what it is waiting on.
      tile.classList.toggle("cdc-chord-off", !available.has(name));
      const at = queueStateFor(owned.get(name));
      if (!at) continue;
      qty.hidden = at.queued < 1;
      qty.textContent = `×${at.queued}`;
      // Only the head of a queue has a progress: the rest are waiting, and a
      // bar under them would be a bar at nought that never moves.
      const done = Math.round(at.progress * 100);
      bar.hidden = !at.isFirst;
      pct.hidden = !at.isFirst;
      if (at.isFirst) {
        bar.style.setProperty("--p", `${at.status === "ready" ? 100 : done}%`);
        pct.textContent = at.status === "ready" ? "ready" : at.status === "onhold" ? `‖ ${done}%` : `${done}%`;
      }
      tile.classList.toggle("cdc-chord-hold", at.isFirst && at.status === "onhold");
      tile.classList.toggle("cdc-chord-ready", at.isFirst && at.status === "ready");
      // No room for another — the queue is at its size, or this object is at
      // its per-type cap. The tile stays live: a full queue is exactly where a
      // cancel is wanted. The one at the head is never dimmed for this, since
      // a building queue is full of the thing it is building.
      tile.classList.toggle("cdc-chord-full", at.room <= 0 && !at.isFirst);
    }
  }

  /**
   * A superweapon's charge, drawn where a queue's progress goes.
   *
   * The same three marks, saying the other thing a key can be waiting on: the
   * bar is `getChargeProgress()`, and the number beside it is either `ready`,
   * the minutes and seconds left, or `no power` — which is a **paused** weapon,
   * an `IsPowered` one in a base that has browned out, and its clock is not
   * running at all. A countdown there would be a lie that ticks.
   */
  function paintCharge(tile, name, owned, els) {
    const at = superWeaponState(slotSuperWeapon(name, owned.get(name)));
    els.qty.hidden = true;
    els.pct.hidden = !at;
    els.bar.hidden = !at;
    // Not ready is not pressable, and it is dimmed on the same rule a building
    // is: charging, browned out, or a weapon whose building nobody has put up
    // yet — three ways of saying the key is right and the thing is not.
    tile.classList.toggle("cdc-chord-off", !at || at.status !== "ready");
    if (!at) return;
    const ready = at.status === "ready";
    els.bar.style.setProperty("--p", `${Math.round((ready ? 1 : at.progress) * 100)}%`);
    els.pct.textContent = ready ? "ready" : at.status === "paused" ? "no power" : clock(at.seconds);
    tile.classList.toggle("cdc-chord-ready", ready);
    tile.classList.toggle("cdc-chord-hold", at.status === "paused");
  }

  /**
   * The repaint a charge needs, and the one timer in this feature.
   *
   * Everything else on a tile moves on the client's own `onQueueUpdate`. A
   * superweapon has no such event: `SuperWeapon#update` dispatches
   * `SuperWeaponReadyEvent` **once**, when the count reaches nought, and says
   * nothing at all on the way there. So a countdown has to be asked for, and the
   * client's own `SuperWeaponTimers#onFrame` asks on a 100ms throttle for
   * exactly this reason. Half a second is enough for a clock that shows seconds
   * and it runs only while a grid with such a tile is open — which is seconds at
   * a time.
   */
  let chargeTimer = null;

  function syncChargeTimer() {
    const want = !!chordEl && !!chordEl.querySelector(".cdc-chord-super");
    if (want === !!chargeTimer) return;
    if (!want) {
      clearInterval(chargeTimer);
      chargeTimer = null;
      return;
    }
    chargeTimer = setInterval(() => {
      if (!chordEl) {
        syncChargeTimer();
        return;
      }
      paintChordQueues();
    }, 500);
  }

  /**
   * Put a box at the pointer. The arithmetic is `chordPlacement`, where it can
   * be tested; this only measures and applies it.
   *
   * Measured after the element is in the document, because until then it has no
   * size to clamp against.
   */
  function placeAtPointer(el) {
    const box = el.getBoundingClientRect();
    const at = CHORD_TABLES.chordPlacement(
      cursorPoint(),
      { width: box.width, height: box.height },
      { width: window.innerWidth, height: window.innerHeight }
    );
    el.style.left = `${at.left}px`;
    el.style.top = `${at.top}px`;
  }

  /**
   * A press of the mouse while a grid is open.
   *
   * Two ways in, because there are two states the mouse can be in. With the
   * lock held the event carries no usable coordinates and never reaches our
   * elements at all, so the tile is found by hand at the game cursor; without
   * it, `e.target` is the browser's own answer and is used as is.
   *
   * Either way a press that is not on a tile closes the grid, and **is
   * swallowed**: what is under it is the battlefield, and an accidental move
   * order is a worse outcome than one lost click.
   *
   * The right button is handled here in **both** states rather than only under
   * the lock, because there is no `click` event for it to fall through to —
   * `contextmenu` is the browser's own second half of that press, and it is
   * swallowed rather than acted on.
   */
  function onOverlayMouseDown(e) {
    if (!chordEl) return;
    const target = mouseCaptured() ? underCursor() : e.target;
    const tile = target && target.closest ? target.closest(".cdc-chord-slot") : null;
    if (tile && chordEl.contains(tile)) {
      e.preventDefault();
      e.stopPropagation();
      const slot = Number(tile.dataset.slot);
      if (!Number.isInteger(slot)) return;
      if (e.button === 2) {
        // The client's own right click, unchanged: Shift on it is *all* of
        // them rather than five, because this table is the sidebar's.
        cancelSlot(state.chord.section, slot, e.shiftKey ? Infinity : 1, false);
      } else if (mouseCaptured() && e.button === 0) {
        // Only the manual path orders from here. Unlocked, the tile's own click
        // handler does it, and ordering here as well would order twice.
        orderSlot(state.chord.section, slot, e.shiftKey ? CHORD_MANY : 1, e.ctrlKey);
      }
      return;
    }
    if (!mouseCaptured() && chordEl.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    closeChord();
  }

  /**
   * The browser's context menu, while a grid is open.
   *
   * Always swallowed, on or off a tile: over a tile the press has already been
   * acted on in `mousedown`, and over the map the client is mid-match — a menu
   * there is nobody's intention. Under a pointer lock the browser fires this at
   * the frozen cursor, which is another reason not to read a position from it.
   */
  function onOverlayContextMenu(e) {
    if (!chordEl) return;
    e.preventDefault();
    e.stopPropagation();
  }

  /**
   * A cursor of our own, over our own boxes.
   *
   * The client's cursor is **drawn into the canvas** — a sprite in its own
   * scene, not a CSS cursor — and while it holds the pointer lock the browser
   * has no cursor left to draw. Every box of ours is DOM above that canvas, so
   * an overlay covers the only cursor there is and the player aims at a tile by
   * dead reckoning. This puts one back, at the same position the hover class is
   * aimed with.
   *
   * Only over one of our boxes, and only under the lock: everywhere else the
   * game's own cursor is right there, and a second one drawn beside it would be
   * two cursors disagreeing about where the mouse is.
   */
  let cursorEl = null;

  function drawCursor(at) {
    if (!at) {
      if (cursorEl) cursorEl.remove();
      cursorEl = null;
      return;
    }
    if (!cursorEl || !cursorEl.isConnected) {
      cursorEl = document.createElement("i");
      cursorEl.className = "cdc-cursor";
      chordLayer().append(cursorEl);
    }
    cursorEl.style.left = `${at.x}px`;
    cursorEl.style.top = `${at.y}px`;
  }

  /** Is this element one of ours — a box the game's cursor would be hidden behind? */
  function ourBox(target) {
    if (!target) return false;
    return (!!chordEl && chordEl.contains(target)) || (!!queuesEl && queuesEl.contains(target));
  }

  /**
   * Hover and the drawn cursor, both aimed at the position the player can see.
   *
   * `:hover` never fires while the lock is held — the browser thinks the cursor
   * is wherever it froze — so a grid would give no sign of which tile it is
   * about to order. This puts the class on by hand, and the same hit test says
   * whether the cursor needs drawing: one `elementFromPoint` for both, because
   * this runs on every mouse move over a running match.
   */
  function onOverlayMouseMove() {
    if (!mouseCaptured()) {
      drawCursor(null);
      return;
    }
    const at = cursorPoint();
    const target = at ? document.elementFromPoint(at.x, at.y) : null;
    drawCursor(ourBox(target) ? at : null);
    const tile = target && target.closest ? target.closest(".cdc-chord-slot") : null;
    const want = chordEl && tile && chordEl.contains(tile) ? tile : null;
    if (want === hoveredTile) return;
    if (hoveredTile) hoveredTile.classList.remove("hovered");
    if (want) want.classList.add("hovered");
    hoveredTile = want;
  }

  /**
   * The one mouse-move listener the two overlays share, on while either is up.
   *
   * Shared rather than one each, for the same reason the queue subscription is:
   * both want the same answer from the same hit test, and two listeners would
   * mean two `elementFromPoint` calls per move and two unsubscribes to keep
   * right. Called once on the way in as well, so a grid that opens under a
   * motionless mouse still has a cursor on it.
   */
  function syncOverlayMouse() {
    window.removeEventListener("mousemove", onOverlayMouseMove, true);
    // The manual way in for a drag, for a mouse the game is holding: the press
    // never reaches the panel, so it is caught here and aimed at the cursor the
    // client draws. It rides with the move listener because the two are wanted
    // in exactly the same states.
    window.removeEventListener("mousedown", onPanelMouseDown, true);
    if (!chordEl && !queuesEl && !netEl && !(memPanel && memPanel.visible())) {
      drawCursor(null);
      hoveredTile = null;
      return;
    }
    window.addEventListener("mousemove", onOverlayMouseMove, true);
    window.addEventListener("mousedown", onPanelMouseDown, true);
    onOverlayMouseMove();
  }

  let hoveredTile = null;

  // --- Key badges on the sidebar --------------------------------------------

  /**
   * The chord key of every cameo, drawn on the cameo.
   *
   * The grid answers "which key builds this" once it is open, over the cursor,
   * in geometry of its own. This answers it on the thing already being read.
   * Two badges, and the split is the chord itself: the **slot letter** goes on
   * each cameo, because that is the press that differs between them, and the
   * **prefix** goes once on each tab button, because that is one fact per tab
   * rather than a letter repeated twelve times down the sidebar.
   *
   * Nothing here can be pressed, hovered or clicked — the layer and every box
   * in it are `pointer-events: none`. A badge that ate a click would be a badge
   * that stopped you ordering the cameo it is advertising.
   */

  // Below this the letter is unreadable anyway, and a badge that cannot be read
  // is just a smudge over the picture that could have been.
  const BADGE_MIN_FONT = 7;

  // The cameo is 60x48 and its badge is sized from it rather than fixed, so it
  // shrinks with the sidebar when the client scales down to fit a small window.
  const BADGE_CAMEO_FONT = 0.24;
  // The tab button is a fifth of the cameo's height and carries artwork of its
  // own, so its badge is a smaller fraction of a smaller box. At 0.62 it was
  // most of the button (0.65.0) and covered the picture it was annotating.
  const BADGE_TAB_FONT = 0.4;

  let badgeEls = [];
  let badgeFrame = 0;
  let badgeSig = "";
  let badgeIndex = { chords: null, side: "", map: new Map() };

  /**
   * The index from object name to key, rebuilt only when it can have changed.
   *
   * Which is twice a match at most — the side is fixed once the match starts and
   * the layouts only change when the options page writes them — against sixty
   * reads a second.
   */
  function badgeMap() {
    const side = playerSide();
    const ui = state.combatant;
    if (badgeIndex.chords !== state.chords || badgeIndex.side !== side || badgeIndex.ui !== ui) {
      const map = CHORD_TABLES.chordBadges(state.chords, side);
      // Which of those objects carry a `SuperWeapon=`, so the key that orders
      // the building can be found again under the weapon it will aim. The match
      // is part of the cache key for this half: the roster is the side's, and a
      // second match hands us a different client to read it off.
      const grants = [];
      for (const [name, object] of ownedObjects()) {
        if (object && object.superWeapon) grants.push([name, object.superWeapon]);
      }
      CHORD_TABLES.chordBadgeWeapons(map, grants);
      badgeIndex = { chords: state.chords, side, ui, map };
    }
    return badgeIndex.map;
  }

  /**
   * The superweapons the player actually has right now, by name.
   *
   * Not the ones their buildings could grant — the ones the trait holds, which
   * is the client's own answer to "is it built". Read per frame because that is
   * the fact that changes: the whole point is that the badge moves the moment
   * the building finishes.
   */
  function ownedSuperWeapons() {
    const player = state.combatant && state.combatant.player;
    const trait = player && player.superWeaponsTrait;
    const out = new Set();
    if (!trait || typeof trait.getAll !== "function") return out;
    try {
      for (const weapon of trait.getAll()) if (weapon && weapon.name) out.add(weapon.name);
    } catch (e) {
      note(`could not read the superweapons the player owns (${e && e.message})`, "warn");
    }
    return out;
  }

  /**
   * Is this UiObject on screen — attached to a scene, and visible the whole way
   * up to it?
   *
   * Both halves are load-bearing. **Attached**, because a viewport change does
   * not move the HUD but destroys it and builds another, and the one we captured
   * is detached from that moment on: its coordinates are the last window size's
   * and are otherwise perfectly readable. **Visible**, because the client hides
   * the sidebar rather than removing it — for the game menu, for a cinematic —
   * and badges over a hidden sidebar would be the only thing left on screen.
   */
  function onScreen(obj) {
    let node = obj && typeof obj.get3DObject === "function" ? obj.get3DObject() : null;
    while (node) {
      if (node.visible === false) return false;
      if (node.isScene || node.type === "Scene") return true;
      node = node.parent;
    }
    return false;
  }

  /**
   * Where a UiObject is, in the client's canvas pixels.
   *
   * Off the world matrix rather than `getPosition()`, which is local to the
   * parent: a slot's own position is its offset inside the card, and the card's
   * is its offset inside a container that is itself offset by the sidebar's
   * width. The world matrix is the client's own answer to that sum, kept up to
   * date by `UiScene#update` every frame — and `gui/UiScene`'s camera is an
   * orthographic 1:1 with the canvas, so the answer is already in pixels.
   */
  function worldPoint(obj) {
    const node = obj && typeof obj.get3DObject === "function" ? obj.get3DObject() : null;
    const matrix = node && node.matrixWorld;
    if (!matrix || !matrix.elements) return null;
    return { x: matrix.elements[12], y: matrix.elements[13] };
  }

  /**
   * The canvas the client renders into.
   *
   * `Pointer` holds it and is already captured; the DOM query is for the window
   * between the page loading and the pointer being built. A direct child of the
   * root on purpose — the stats layer the client's dev mode adds is a canvas
   * too, and it is nested deeper.
   */
  function gameCanvas() {
    const ui = state.pointerUi;
    if (ui && ui.canvas && ui.canvas.isConnected) return ui.canvas;
    return document.querySelector("#ra2web-root > canvas");
  }

  /**
   * Every badge that should be on screen right now, in viewport pixels.
   *
   * Read from the client every time rather than remembered, which is what makes
   * this survive a scale change without knowing one happened: a resize, a
   * fullscreen toggle, a browser zoom and the HUD rebuild that follows any of
   * them all come out as different numbers here, and the caller writes the DOM
   * only when the numbers differ from last frame's.
   */
  function badgeBoxes() {
    const canvas = gameCanvas();
    if (!canvas || !canvas.width) return [];
    const rect = canvas.getBoundingClientRect();
    if (!rect.width) return [];
    const size = { width: canvas.width, height: canvas.height };
    const map = badgeMap();
    const out = [];

    const card = state.sidebarCard;
    if (card && card.visible !== false && onScreen(card.getUiObject())) {
      // What is built decides where a superweapon's badge lives, so it is read
      // once per frame rather than once per slot.
      const weapons = ownedSuperWeapons();
      const cameo = card.getCameoSize();
      const model = card.props.sidebarModel;
      const items = (model && model.activeTab && model.activeTab.items) || [];
      const offset = card.pagingOffset || 0;
      const slots = card.props.slots || 0;
      for (let slot = 0; slot < slots; slot++) {
        // The client blanks every slot past the end of the paged-to list, so a
        // badge on one would be a key floating over an empty tile.
        if (items.length - offset <= slot) break;
        const item = items[slot + offset];
        const rules = item && item.target && item.target.rules;
        const at = rules && map.get(rules.name);
        if (!at) continue;
        // The transfer. While the weapon does not exist this cameo is the only
        // place the key means anything, and it keeps the badge; the moment it
        // does, the key aims rather than orders and the badge belongs on the
        // ability cameo instead. The building's own cameo stays on the sidebar
        // either way — a build limit greys it rather than removing it — so
        // without this the key would be advertised in two places at once.
        if (rules.superWeapon && weapons.has(rules.superWeapon)) continue;
        const container = card.slotContainers[slot];
        // Per slot, not just per card: a container that has not been rendered
        // yet carries an identity matrix, which reads as a perfectly plausible
        // (0, 0) — the canvas's own corner — rather than as an error.
        if (!onScreen(container)) continue;
        const point = worldPoint(container);
        if (!point) continue;
        const box = CHORD_TABLES.chordScreenBox(
          { x: point.x, y: point.y, width: cameo.width, height: cameo.height },
          rect,
          size
        );
        out.push({
          key: at.key,
          // The client greys the cameo out; the key is still the right key, it
          // is the object that cannot be built yet. Dimmed rather than dropped:
          // a badge that comes and goes is one you learn not to trust.
          dim: !!item.disabled,
          box,
          font: Math.max(BADGE_MIN_FONT, Math.round(box.height * BADGE_CAMEO_FONT)),
        });
      }
    }

    const tabs = state.sidebarTabs;
    const origin = tabs && onScreen(tabs.getUiObject()) ? worldPoint(tabs.getUiObject()) : null;
    if (origin) {
      // `SidebarTabs` declares a `tabObjects` array and never fills it — its
      // sprites carry no `ref` — so the four positions come from where the
      // component itself is, plus the arithmetic it lays them out with.
      const images = tabs.props.images || [];
      const spacing = tabs.props.tabSpacing || 0;
      CHORD_TABLES.SECTIONS.forEach((section, index) => {
        const image = images[index];
        if (!image) return;
        // Empty only for a tab the player has put a modifier on: the client
        // hashes those above 255 and `prefixes` cannot name them. Better a tab
        // with no badge than a badge naming a key that does nothing.
        const key = prefixCode(section).replace(/^Key|^Digit/, "");
        if (!key) return;
        const box = CHORD_TABLES.chordScreenBox(
          {
            x: origin.x + (spacing + image.width) * index,
            y: origin.y,
            width: image.width,
            height: image.height,
          },
          rect,
          size
        );
        out.push({
          key,
          tab: true,
          dim: false,
          // The top-left corner, which is where the cameo badges are: a tab does
          // carry artwork, and 0.65.0's centred badge sat on top of it. One
          // corner for both kinds also means the eye learns one place to look.
          box,
          font: Math.max(BADGE_MIN_FONT, Math.round(box.height * BADGE_TAB_FONT)),
        });
      });
    }

    return out;
  }

  /** Are badges wanted at all right now? */
  function badgesWanted() {
    return state.prefs.sidebarKeys !== false && !!state.combatant;
  }

  /**
   * One frame: read where everything is, and write only what moved.
   *
   * The signature is the whole of the optimisation and the reason a per-frame
   * loop is affordable. A sidebar that has not changed produces the same string
   * and touches no DOM at all; the reads behind it are a handful of matrix
   * elements and one `getBoundingClientRect`.
   */
  function paintBadges() {
    const boxes = badgesWanted() ? badgeBoxes() : [];
    const signature = boxes
      .map((at) =>
        [
          at.key,
          at.tab ? "t" : "s",
          at.dim ? 1 : 0,
          Math.round(at.box.left),
          Math.round(at.box.top),
          Math.round(at.box.width),
          at.font,
        ].join(",")
      )
      .join("|");
    if (signature === badgeSig) return;
    badgeSig = signature;

    const layer = boxes.length ? chordLayer() : layerEl;
    boxes.forEach((at, index) => {
      let el = badgeEls[index];
      if (!el) {
        el = document.createElement("div");
        el.className = "cdc-key-badge";
        badgeEls[index] = el;
      }
      if (el.parentNode !== layer) layer.append(el);
      el.textContent = at.key;
      el.classList.toggle("cdc-key-tab", !!at.tab);
      el.classList.toggle("cdc-key-off", !!at.dim);
      el.style.left = `${at.box.left}px`;
      el.style.top = `${at.box.top}px`;
      el.style.fontSize = `${at.font}px`;
      el.hidden = false;
    });
    for (let index = boxes.length; index < badgeEls.length; index++) badgeEls[index].hidden = true;
  }

  /**
   * Run the badges while there is a match, and stop the loop when there is not.
   *
   * `requestAnimationFrame` rather than an interval or the client's own frame
   * event: it is the clock that cannot paint a badge onto a frame the sidebar
   * has already moved out from under, and it stops on its own in a background
   * tab — which is a tab this extension has burned before, see the wiki's
   * hidden-tab findings.
   */
  function syncBadges() {
    const wanted = badgesWanted();
    if (wanted && !badgeFrame) {
      const step = () => {
        badgeFrame = window.requestAnimationFrame(step);
        paintBadges();
      };
      badgeFrame = window.requestAnimationFrame(step);
      return;
    }
    if (!wanted && badgeFrame) {
      window.cancelAnimationFrame(badgeFrame);
      badgeFrame = 0;
      badgeSig = "";
      for (const el of badgeEls) el.hidden = true;
    }
  }

  // --- The queue overlay ----------------------------------------------------

  /**
   * Every production queue at once, empty ones included — which is the half the
   * sidebar cannot show, since it only ever displays the tab you are looking at
   * and says nothing about a queue that is idle.
   *
   * Live off the client's own `onQueueUpdate` rather than a timer. The event is
   * finer than it looks: `ProductionQueue` dispatches on push, pop and status
   * change, and the production trait's tick adds one **per tick that spends
   * credits** — so the percentages here move with the build rather than jumping
   * when something is added, and they stop dead when the money runs out. Read
   * out of v0.83.3 in 0.58.0; the line this replaces knew only the first half.
   */
  const QUEUE_ROWS = [
    { type: "Structures", label: "Structures" },
    { type: "Armory", label: "Defence" },
    { type: "Infantry", label: "Infantry" },
    { type: "Vehicles", label: "Vehicles" },
    { type: "Ships", label: "Ships" },
    { type: "Aircrafts", label: "Aircraft" },
  ];

  const QUEUE_LAYOUT_KEY = "cdc.ingameQueueRect";

  let queuesEl = null;
  let queuesDrag = null;
  let queueSubscription = null;

  /**
   * Start a drag of a floating panel when the game has the mouse.
   *
   * The panel's own `mousedown` cannot fire in that state — the press goes to
   * the locked canvas — so the drag is begun from here, at the cursor the player
   * can see. Unlocked, this does nothing and the panel's own handler runs.
   */
  function onPanelMouseDown(e) {
    if (!mouseCaptured()) return;
    const target = underCursor();
    if (!target) return;
    // Both floating panels through one handler: the hit test is the same
    // `elementFromPoint` either way, and a listener per panel would be a second
    // unsubscribe to keep right for no second behaviour.
    for (const panel of [
      { el: queuesEl, drag: queuesDrag },
      { el: netEl, drag: netDrag },
      { el: memPanel && memPanel.el(), drag: memPanel && memPanel.drag() },
    ]) {
      if (!panel.el || !panel.drag || !panel.el.contains(target)) continue;
      e.preventDefault();
      e.stopPropagation();
      panel.drag.begin(cursorPoint());
      return;
    }
  }

  function toggleQueues(force) {
    state.queuesVisible = force === undefined ? !state.queuesVisible : !!force;
    renderQueues();
  }

  /**
   * Keep the subscription in step with what is on screen and which match is in
   * play. Subscribing twice renders twice per tick; leaving a finished match's
   * queue subscribed holds the whole player object alive.
   *
   * **One subscription for both overlays.** The grid and the panel read the
   * same event and can be up at the same time, so they share it rather than
   * taking one each — two subscriptions would mean two unsubscribes to keep
   * right, and the one that leaked would be invisible until a match ended.
   */
  function syncQueueSubscription() {
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    const want = (state.queuesVisible || state.chord) && production ? production : null;
    if (queueSubscription && queueSubscription.production === want) return;
    if (queueSubscription) {
      try {
        queueSubscription.production.onQueueUpdate.unsubscribe(queueSubscription.handler);
      } catch (e) {
        note(`could not release the queue subscription — ${e && e.message}`, "warn");
      }
      queueSubscription = null;
    }
    if (!want) return;
    const handler = () => repaintQueues();
    want.onQueueUpdate.subscribe(handler);
    queueSubscription = { production: want, handler };
  }

  function renderQueues() {
    if (!state.queuesVisible) {
      if (queuesEl) queuesEl.remove();
      queuesEl = null;
      queuesDrag = null;
      syncOverlayMouse();
      syncQueueSubscription();
      return;
    }
    if (!queuesEl || !queuesEl.isConnected) {
      queuesEl = document.createElement("div");
      queuesEl.className = "cdc-queues";
      queuesEl.innerHTML =
        '<div class="cdc-queues-head" title="drag to move">production' +
        '<span class="cdc-queues-hint"></span></div>' +
        '<div class="cdc-queues-body"></div>';
      chordLayer().append(queuesEl);
      const saved = savedQueueRect();
      queuesEl.style.left = `${saved ? saved.left : 24}px`;
      queuesEl.style.top = `${saved ? saved.top : 120}px`;
      // No grip, so the whole panel drags and nothing resizes it: its height is
      // six rows of whatever is in the queues, and a pinned height would clip
      // the row that appears when a factory finally has something in it.
      queuesDrag = makeDraggable(queuesEl, null, (rect) => {
        try {
          localStorage.setItem(QUEUE_LAYOUT_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (e) {
          note("could not persist the queue panel position", "warn");
        }
      });
      queuesEl.querySelector(".cdc-queues-hint").textContent = state.keys.queues.label;
      syncOverlayMouse();
    }
    syncQueueSubscription();
    renderQueueRows();
  }

  function savedQueueRect() {
    try {
      const raw = localStorage.getItem(QUEUE_LAYOUT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      note("stored queue panel position is unreadable, ignoring it", "warn");
      return null;
    }
  }

  function renderQueueRows() {
    if (!queuesEl) return;
    const body = queuesEl.querySelector(".cdc-queues-body");
    body.textContent = "";
    const { QueueType } = state.modules;
    const production = state.combatant && state.combatant.player && state.combatant.player.production;
    if (!production || !QueueType) {
      const none = document.createElement("div");
      none.className = "cdc-queues-none";
      none.textContent = production ? "the client's queue enums did not load" : "no match in play";
      body.append(none);
      return;
    }

    for (const spec of QUEUE_ROWS) {
      const row = document.createElement("div");
      row.className = "cdc-queues-row";
      const label = document.createElement("span");
      label.className = "cdc-queues-label";
      label.textContent = spec.label;
      row.append(label);

      let queue = null;
      try {
        queue = production.getQueue(QueueType[spec.type]);
      } catch (e) {
        note(`no ${spec.type} queue in this match (${e && e.message})`, "warn");
      }
      // Predicted, like every other read of a queue in this file: an order
      // pressed a moment ago is in this row before the client has applied it,
      // which is the point of the panel being on screen while you play.
      const at = queue ? predictQueue(queue) : null;
      const items = at ? at.items : [];
      if (!items.length) {
        const empty = document.createElement("span");
        empty.className = "cdc-queues-empty";
        // A queue with no room is a different fact from a queue with nothing in
        // it, and the aircraft one starts with no room at all: its size is
        // helipad capacity, so "empty" would be a lie until one is built.
        empty.textContent = at && !at.maxSize ? "no factory" : "empty";
        row.append(empty);
        body.append(row);
        continue;
      }

      const list = document.createElement("span");
      list.className = "cdc-queues-items";
      for (const item of items) {
        const one = document.createElement("span");
        one.className = "cdc-queues-item";
        one.append(cameoFace(item.name));
        if (item.quantity > 1) {
          const many = document.createElement("i");
          many.className = "cdc-queues-qty";
          many.textContent = `×${item.quantity}`;
          one.append(many);
        }
        one.title = displayName(item.rules, item.name);
        list.append(one);
      }
      row.append(list);

      const pct = Math.round((items[0].progress || 0) * 100);
      const status = document.createElement("span");
      status.className = "cdc-queues-state";
      if (at.status === "ready") {
        status.textContent = "ready";
        status.classList.add("cdc-queues-ready");
      } else if (at.status === "onhold") {
        status.textContent = `on hold ${pct}%`;
        status.classList.add("cdc-queues-hold");
      } else {
        status.textContent = `${pct}%`;
      }
      const bar = document.createElement("i");
      bar.className = "cdc-queues-bar";
      bar.style.setProperty("--p", `${pct}%`);
      row.append(bar, status);
      body.append(row);
    }
  }

  /**
   * Why a chord did nothing, answered in one object — the sibling of
   * `__cdc.build()`, and for the same reason: a chord that does not open has
   * several invisible causes, and reading the source is not a diagnosis.
   */
  function chordReport() {
    const side = playerSide();
    const live = [...prefixes().values()];
    return {
      match: state.combatant ? "captured" : "none",
      side: side || "not resolved",
      // Decks resolve by country, so a deck key showing the wrong picture is
      // answered here before anywhere else.
      country: playerCountry() || "not resolved",
      opens: state.prefs.chordSinglePress
        ? "on one press of a tab key"
        : `on two inside ${CHORD_WINDOW}ms`,
      prefixes: [...prefixes()].map(([code, section]) => `${code} -> ${section.label}`),
      // What Alt on each tab key reaches, and the one press that is left to
      // the browser rather than acted on.
      cancelKeys: [...prefixes()].map(([code, section]) => {
        // Both key tables can be pointed at the same combination from the
        // options page, and the cancel key takes the press before either — the
        // same order an open grid already outranks the fixed hotkeys in. That
        // is a choice rather than a surprise only if it is reported, which is
        // what this row is for.
        const shadowed = [
          buildBindings(side).has(`${code}|100`) ? "a build binding" : "",
          Object.entries(state.keys)
            .filter(([, key]) => key.code === code && key.alt && !key.ctrl)
            .map(([name]) => name)
            .join(", "),
        ].filter(Boolean);
        return (
          `Alt+${code.replace(/^Key|^Digit/, "")} -> ${(section.queues || []).join("/") || "no queue"}` +
          (shadowed.length ? ` — shadows ${shadowed.join(" and ")}` : "")
        );
      }),
      keyboardLock:
        keyLock +
        // Which codes, because "held" alone does not say whether the two keys
        // the Ctrl modifier needs are among them.
        ` · for ${ctrlKeysToHold().join(" ") || "nothing of ours"}` +
        (document.fullscreenElement ? "" : " · the game is not fullscreen") +
        (state.prefs.grabTabKeys === false ? " · turned off in the options page" : ""),
      // A tab command the client has bound to a modified key gets no chord, and
      // that is the one silent case worth naming.
      noPrefix: SECTIONS.filter((section) => !live.includes(section)).map((s) => s.command),
      clientTabsSeen: SECTIONS.filter((section) =>
        [...state.clientHotkeys.values()].includes(section.command)
      ).map((s) => s.command),
      open: state.chord ? state.chord.section.label : "none",
      // Where a grid would open right now, and what it is derived from. A grid
      // that stops following the cursor has exactly two inputs, and this is both
      // of them.
      // Two different pointers, and the difference is the whole of one bug:
      // `dom` freezes under a pointer lock, `client` does not.
      pointer: (() => {
        const at = cursorPoint();
        const dom = state.pointer ? `${state.pointer.x},${state.pointer.y}` : "never seen a mouse move";
        const used = at ? `${Math.round(at.x)},${Math.round(at.y)}` : "unknown";
        return `${used} (dom ${dom}, client pointer ${state.pointerUi ? "captured" : "not captured"})`;
      })(),
      pointerLock: (() => {
        const ui = state.pointerUi;
        if (!ui || typeof ui.getPointerLock !== "function") return "unknown";
        try {
          return ui.getPointerLock().isActive() ? "held by the game" : "free";
        } catch (e) {
          return "unreadable";
        }
      })(),
      viewport: `${window.innerWidth}x${window.innerHeight}`,
      layouts: SECTIONS.map(
        (section) =>
          `${section.label}: ${chordLayout(side, section.id).filter(Boolean).length}/${GRID_KEYS.length}`
      ),
      // What the player actually holds, and which of them have taken over a
      // building's key. The one row that answers "why did that key not fire".
      superWeapons: (() => {
        const player = state.combatant && state.combatant.player;
        const trait = player && player.superWeaponsTrait;
        if (!trait || typeof trait.getAll !== "function") return "no match in play";
        const all = trait.getAll();
        if (!all.length) return "none held";
        return all.map((sw) => {
          const at = superWeaponState(sw);
          const when = at.status === "charging" ? ` ${clock(at.seconds)}` : "";
          return `${sw.name} ${at.status}${when}${at.showTimer ? " (its building's key)" : " (its own key)"}`;
        });
      })(),
      source: state.chords && state.chords[side] ? "options page" : "shipped defaults",
      queuePanel: state.queuesVisible ? "open" : "closed",
      // The fullscreen swap, and the one fact behind it that only the client
      // can supply: whether Alt+F is in its table at all. `clientHotkeys` is
      // keyed by the client's own hash — alt<<10 plus the keyCode.
      fullscreenKey: (() => {
        if (state.prefs.fullscreenOnEnter === false) return "off — Alt+F is the client's, as shipped";
        const command = state.clientHotkeys.get(1024 + FULLSCREEN_KEYCODE);
        return (
          `Alt+Enter -> Alt+F · the client binds Alt+F to ${command || "nothing this tab has seen"}` +
          (document.fullscreenElement ? " · fullscreen now" : "")
        );
      })(),
      // The menu swap, and the two facts only the client can supply: whether the
      // menu was ever captured, and which key its own table has on `Options` —
      // the key this swallows, which is Escape until somebody rebinds it there.
      menuKey: (() => {
        if (state.prefs.menuOffEscape === false) return "off — Escape opens the menu, as shipped";
        const code = optionsHotKeyCode();
        const seen = state.clientHotkeys.get(code) === "Options";
        return (
          `${state.keys.menu.label} opens it · the client's Options key (${code}) swallowed` +
          (seen ? "" : " · not in this tab's copy of the client's table, so Escape is assumed") +
          (state.gameMenu ? (menuOpen() ? " · open now" : "") : " · no menu captured")
        );
      })(),
    };
  }

  /** The same, as the one line the debug panel has room for. */
  function chordSummary() {
    const report = chordReport();
    const where = report.prefixes.length ? report.prefixes.join(", ") : "no prefix resolved";
    const gap = report.noPrefix.length ? ` · no key for ${report.noPrefix.join(", ")}` : "";
    return `${where}${gap} · ${report.source}`;
  }

  /**
   * The buildable roster, harvested from the client's rules and handed to the
   * bridge for the options page to bind keys against.
   *
   * The options page has no game and therefore no rules, so this is the only
   * place the list can come from. Harvested once per tab, and only when it would
   * say something new: the stamp is the client's own version, read off its
   * script tag, so a client that adds a buildable object refreshes the roster
   * and a client that does not costs nothing.
   *
   * A stale roster does not break a binding — a press resolves its object
   * against the live match, never against this — it only means the options page
   * lists what an older client could build.
   */
  function clientVersion() {
    const script = document.querySelector('script[src*="ra2web"]');
    const src = (script && script.getAttribute("src")) || "";
    return (src.match(/[?&]v=([^&]+)/) || [])[1] || "";
  }

  let rosterSent = false;
  let coloursSent = false;
  // The command list this tab last published, as version + names. A string
  // rather than a flag: the list is the client's, and a client that updates
  // under a tab left open should publish the new one.
  let commandsSent = "";

  /**
   * The colour table, harvested from the client's rules and handed to the
   * bridge for the options page to offer.
   *
   * On exactly the terms of `sendRoster` below, and for the same reason: the
   * options page has no client, so this is the only place the list can come
   * from, and the client's own version is the stamp that says whether a
   * harvest would say anything new. The difference is size — thirty-odd short
   * strings — which is why the table itself travels in the config push rather
   * than a stamp with the rows left in storage.
   */
  async function sendColours(force) {
    if (coloursSent && !force) return;
    const version = clientVersion();
    if (!force && version && state.colours.version === version) {
      coloursSent = true;
      return;
    }
    if (!window.__cdcHq || typeof window.__cdcHq.colours !== "function") return;
    try {
      const { mp, colors } = await window.__cdcHq.colours();
      const names = Object.keys(colors);
      if (!names.length) {
        note("the client's rules define no colours — the recolour option has nothing to offer", "warn");
        return;
      }
      coloursSent = true;
      state.colours = { version, mp, colors };
      window.postMessage(
        { source: "cdc-page", type: "colour-table", colours: { version, at: Date.now(), mp, colors } },
        "*"
      );
      note(`colour table: ${names.length} colours, ${mp.length} of them in the lobby`);
    } catch (e) {
      // Same as the roster below: the rules live in the game archives, so this
      // failing on a cold first run is a client that has not imported them yet,
      // not a defect. The next config push tries again.
      note(`could not read the colour table (${e && e.message})`, "warn");
    }
  }

  /**
   * The commands this client actually registers, for the options page to offer.
   *
   * Read off the live `KeyboardHandler` rather than off the `KeyCommandType`
   * enum, and the difference is the whole point: the enum lists every name the
   * client has ever had, while the handler's table is what a press can actually
   * reach. `ToggleMarbleMadness` is in the enum and registered by nothing;
   * `FreeMoney` is registered only while cheats are on. Either would be a
   * binding that silently does nothing, and neither is offered.
   *
   * Cheap enough to run at every match start — it is a Map's keys, not a parse
   * of rules.ini — so unlike the roster there is no stamp in a config push to
   * check first. What is compared is what this tab last sent.
   */
  function sendCommands() {
    const handler = keyboardHandler();
    if (!handler || !(handler.commands instanceof Map)) return;
    const items = [...handler.commands.keys()].filter((name) => typeof name === "string").sort();
    if (!items.length) return;
    const version = clientVersion();
    const stamp = version + "/" + items.join("|");
    if (stamp === commandsSent) return;
    commandsSent = stamp;
    window.postMessage(
      { source: "cdc-page", type: "command-table", commands: { version, at: Date.now(), items } },
      "*"
    );
    note(`command table: ${items.length} commands this match registers`);
  }

  async function sendRoster(force) {
    if (rosterSent && !force) return;
    const version = clientVersion();
    if (!force && version && state.rosterVersion === version) {
      rosterSent = true;
      return;
    }
    if (!window.__cdcHq || typeof window.__cdcHq.roster !== "function") return;
    try {
      const items = await window.__cdcHq.roster();
      // Country -> side is FACTIONS, the same table the loading screen labels
      // players with. An owner it does not know is a civilian or special house,
      // and an object owned only by those is not something a player can bind.
      const rows = [];
      for (const item of items) {
        const sides = [];
        for (const owner of item.owner) {
          const faction = FACTIONS[owner];
          if (faction && !sides.includes(faction.side)) sides.push(faction.side);
        }
        if (sides.length) rows.push({ name: item.name, type: item.type, sides });
      }
      rosterSent = true;
      state.rosterVersion = version;
      window.postMessage(
        { source: "cdc-page", type: "build-roster", roster: { version, at: Date.now(), items: rows } },
        "*"
      );
      note(`build roster: ${rows.length} objects, client ${version || "(unversioned)"}`);
    } catch (e) {
      // Rules live in the game archives, which are not there until the client
      // has imported or fetched them — so this failing on a cold first run is
      // expected rather than wrong, and the next match tries again.
      note(`could not read the build roster (${e && e.message})`, "warn");
    }
  }

  // --- The net readout ------------------------------------------------------

  /**
   * The numbers the client's own `ToggleFps` panel draws, read at their source
   * and written as text instead of as three stats.js graphs.
   *
   * What the client does, read out of v0.83.3: `GameScreen#initNetStats` builds
   * a `PingMonitor` at match start **whatever the FPS flag says** and calls
   * `monitor()`. The flag decides two other things — whether a `NetStats` exists
   * to paint the samples, and how often they are taken (1s with the panel up,
   * 10s with it down). So the values are there for the reading with the client's
   * panel closed; only their freshness depends on it, which is what
   * `syncNetCadence` below is about.
   *
   * One hook is the whole capture, because the `PingMonitor` instance carries
   * the other two objects worth reading:
   *
   *   - **RTT** — `onNewSample`, an IRC ping to the game server, and `avgPing`
   *     is the client's own median over the match. A reservoir sample of 100,
   *     so it is the median of a sample of the match, not of all of it.
   *   - **LAT** — `gameTurnMgr` is the `LockstepManager`, and the gap between
   *     `onActionsSent` and `onActionsReceived` for one network turn is how long
   *     an order of yours takes to come back. That is the number that decides
   *     how a press feels; RTT only says how far away the server is.
   *   - **lag** — `onLagStateChange`, the client's own "waiting for the other
   *     clients" state, raised once a turn has been stuck past its threshold.
   *   - **the rate** — `networkTurnMillis` against `gameTurnMillis`: the server
   *     stretches the network turn to the slowest player, so this is where the
   *     cost of somebody else's connection shows up.
   *
   * FPS is the one number that is ours rather than the client's:
   * `renderer.getStats()` exists only while the client's panel is up, so this
   * counts its own frames on the same rAF instead of reading the widget.
   *
   * Per-player ping comes from somewhere else entirely and is read **passively**
   * — see `attachNet`.
   */

  // The two intervals the client itself uses (`initNetStats`), reused rather
  // than invented so that our panel being open is indistinguishable, on the
  // wire, from the player holding the client's own panel open.
  const NET_FAST_MILLIS = 1000;
  const NET_IDLE_MILLIS = 10000;

  // A sample this old is labelled with its age rather than shown as if it were
  // current. Two intervals of the slow rate: at the fast rate nothing ever
  // reaches it, and at the slow one it marks the samples that were actually
  // missed rather than every other one.
  const NET_STALE_MILLIS = 21000;

  // The client's own verdict on a ping, from `gui/component/PingIndicator`:
  // <=100 green, <=250 yellow, worse red. Reused so that a number this panel
  // calls bad is the same number the scoreboard draws a red bar for.
  const NET_QUALITY = [
    { max: 100, cls: "good" },
    { max: 250, cls: "avg" },
  ];

  const NET_LAYOUT_KEY = "cdc.netRect";

  let netEl = null;
  let netDrag = null;
  let netFrame = 0;
  let netFrames = 0;
  let netSince = 0;

  function netQuality(ms) {
    if (typeof ms !== "number" || !Number.isFinite(ms)) return "";
    for (const step of NET_QUALITY) if (ms <= step.max) return step.cls;
    return "bad";
  }

  /**
   * Take hold of a match's `PingMonitor` and everything hanging off it.
   *
   * Called from the hook on `monitor()` rather than on the constructor, because
   * a constructor cannot be patched through the prototype — the same reason
   * every other capture in this file hangs off an instance method.
   *
   * The per-player line is subscribed to but never **asked for**. The client
   * requests it (`requestLoadInfo`) while the loading screen or the in-game menu
   * is open, and the server's answer goes to an event anyone can listen to;
   * polling it ourselves would be this extension putting traffic on the wire the
   * client would not have sent, which is a different thing from reading. So
   * those rows carry the age of whatever the client last fetched, and go stale
   * on purpose.
   */
  function attachNet(monitor) {
    detachNet();
    const net = state.net;
    net.monitor = monitor;
    net.lockstep = monitor.gameTurnMgr || null;
    net.gserv = monitor.gservCon || null;
    net.median = monitor.avgPing || null;

    const onPing = (ms) => {
      net.rtt = typeof ms === "number" ? ms : null;
      net.rttAt = Date.now();
      paintNet();
    };
    monitor.onNewSample.subscribe(onPing);
    net.off.push(() => monitor.onNewSample.unsubscribe(onPing));

    const lock = net.lockstep;
    if (lock && lock.onActionsSent && lock.onActionsReceived && lock.onLagStateChange) {
      const onSent = (turn) => {
        net.sent.set(turn, performance.now());
        // The client's own copy of this map is never pruned and does not have to
        // be: it lives as long as its NetStats, which is as long as its panel is
        // up. Ours lives for the match. A turn is answered within two, so
        // anything older than a handful was sent in passive mode (a hidden tab
        // does not send) or across a reconnect, and will never be matched.
        for (const key of net.sent.keys()) if (key < turn - 8) net.sent.delete(key);
      };
      const onReceived = (turn) => {
        const at = net.sent.get(turn);
        if (at === undefined) return;
        net.sent.delete(turn);
        net.lat = performance.now() - at;
        net.latAt = Date.now();
      };
      const onLag = (lagging) => {
        net.lag = !!lagging;
        paintNet();
      };
      lock.onActionsSent.subscribe(onSent);
      lock.onActionsReceived.subscribe(onReceived);
      lock.onLagStateChange.subscribe(onLag);
      net.off.push(() => {
        lock.onActionsSent.unsubscribe(onSent);
        lock.onActionsReceived.unsubscribe(onReceived);
        lock.onLagStateChange.unsubscribe(onLag);
      });
    } else {
      // An observer's client has a lockstep manager too, so this is a client
      // change rather than a spectator seat — worth the line.
      note("the lockstep manager did not carry its action events — no order latency", "warn");
    }

    const gserv = net.gserv;
    const Parser = state.modules.LoadInfoParser;
    if (gserv && gserv.onLoadInfo && Parser) {
      const onLoadInfo = (text) => {
        try {
          net.players = new Parser().parse(text);
          net.playersAt = Date.now();
          paintNet();
        } catch (e) {
          note(`could not read the server's player line (${e && e.message})`, "warn");
        }
      };
      gserv.onLoadInfo.subscribe(onLoadInfo);
      net.off.push(() => gserv.onLoadInfo.unsubscribe(onLoadInfo));
    } else if (!Parser) {
      note("LoadInfoParser is missing — no per-player ping", "warn");
    }

    syncNetCadence();
    paintNet();
  }

  /**
   * Let go of the last match's objects.
   *
   * Not only tidiness: subscriptions we still hold on a disposed `PingMonitor`
   * keep the whole match graph — lockstep, game, players — alive behind them,
   * and a `setPingInterval` aimed at a monitor the client has finished with
   * would restart a timer nothing owns.
   */
  function detachNet() {
    const net = state.net;
    for (const off of net.off) {
      try {
        off();
      } catch (e) {
        note(`could not release a net subscription — ${e && e.message}`, "warn");
      }
    }
    net.off = [];
    net.monitor = null;
    net.lockstep = null;
    net.gserv = null;
    net.median = null;
    net.rtt = null;
    net.rttAt = 0;
    net.lat = null;
    net.latAt = 0;
    net.lag = false;
    net.players = [];
    net.playersAt = 0;
    net.sent.clear();
    paintNet();
  }

  /**
   * Keep the client's ping at the rate the panel is being read at, and hand it
   * back when the panel closes.
   *
   * `PingMonitor#setPingInterval` returns immediately when the rate is already
   * what is asked for, so calling this once a second while the panel is open
   * costs nothing and is self-healing — the client resets the interval itself
   * every time its own FPS panel is toggled, which would otherwise leave ours
   * quietly reading a ten-second-old number as if it were current.
   *
   * With the client's own panel up, 1s is what the client wants and ours is not
   * the opinion that matters; the rate only goes back down when both are shut.
   */
  function syncNetCadence() {
    const monitor = state.net.monitor;
    if (!monitor || typeof monitor.setPingInterval !== "function") return;
    // `window.r` is the client's own dev-tools namespace (`tools/DevToolsApi`),
    // and `initRenderer` registers `fps` on it for every game screen — including
    // an observer's, which has no CombatantUi to read the same BoxedVar off.
    const clientPanel = !!(window.r && window.r.fps);
    try {
      monitor.setPingInterval(state.netVisible || clientPanel ? NET_FAST_MILLIS : NET_IDLE_MILLIS);
    } catch (e) {
      note(`could not set the ping interval (${e && e.message})`, "warn");
    }
  }

  function toggleNet(force) {
    state.netVisible = force === undefined ? !state.netVisible : !!force;
    renderNet();
    syncNetCadence();
    return state.netVisible;
  }

  function savedNetRect() {
    try {
      const raw = localStorage.getItem(NET_LAYOUT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      note("stored net panel position is unreadable, ignoring it", "warn");
      return null;
    }
  }

  function renderNet() {
    if (!state.netVisible) {
      if (netEl) netEl.remove();
      netEl = null;
      netDrag = null;
      if (netFrame) window.cancelAnimationFrame(netFrame);
      netFrame = 0;
      state.net.fps = null;
      syncOverlayMouse();
      return;
    }
    if (!netEl || !netEl.isConnected) {
      netEl = document.createElement("div");
      netEl.className = "cdc-net";
      netEl.innerHTML =
        '<div class="cdc-net-head" title="drag to move">network' +
        '<span class="cdc-net-hint"></span></div>' +
        '<div class="cdc-net-body"></div>';
      chordLayer().append(netEl);
      const saved = savedNetRect();
      netEl.style.left = `${saved ? saved.left : 24}px`;
      netEl.style.top = `${saved ? saved.top : 24}px`;
      // No grip, same as the production panel: the panel is as tall as the rows
      // it has, and a pinned height would clip the player list the moment the
      // client fetches one.
      netDrag = makeDraggable(netEl, null, (rect) => {
        try {
          localStorage.setItem(NET_LAYOUT_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
        } catch (e) {
          note("could not persist the net panel position", "warn");
        }
      });
      netEl.querySelector(".cdc-net-hint").textContent = state.keys.net.label;
      syncOverlayMouse();
      netFrames = 0;
      netSince = performance.now();
      netFrame = window.requestAnimationFrame(netTick);
    }
    paintNet();
  }

  /**
   * The panel's own clock, with the frame counter in the same loop.
   *
   * rAF rather than an interval, because the count *is* the measurement — and
   * the second job, repainting a panel of numbers once a second, wants to stop
   * when the tab is hidden exactly as the counter does. A hidden tab is not
   * rendering at all (`GameAnimationLoop` switches to a one-second background
   * tick), so a frame rate measured there would be a number about nothing.
   */
  function netTick(now) {
    if (!netEl) {
      netFrame = 0;
      return;
    }
    netFrames++;
    const elapsed = now - netSince;
    if (elapsed >= 1000) {
      state.net.fps = (netFrames * 1000) / elapsed;
      netFrames = 0;
      netSince = now;
      syncNetCadence();
      paintNet();
    }
    netFrame = window.requestAnimationFrame(netTick);
  }

  /** How long ago a sample landed, for the ones old enough that the age is the news. */
  function netAge(at) {
    if (!at) return "";
    const seconds = Math.round((Date.now() - at) / 1000);
    return seconds < 60 ? `${seconds}s ago` : `${Math.floor(seconds / 60)}m ago`;
  }

  function netRow(body, label, value, quality, extra) {
    const row = document.createElement("div");
    row.className = "cdc-net-row";
    const name = document.createElement("span");
    name.className = "cdc-net-label";
    name.textContent = label;
    const val = document.createElement("span");
    val.className = "cdc-net-value" + (quality ? ` cdc-net-${quality}` : "");
    val.textContent = value;
    row.append(name, val);
    if (extra) {
      const note_ = document.createElement("span");
      note_.className = "cdc-net-note";
      note_.textContent = extra;
      row.append(note_);
    }
    body.append(row);
    return row;
  }

  function paintNet() {
    if (!netEl) return;
    const net = state.net;
    const body = netEl.querySelector(".cdc-net-body");
    body.textContent = "";

    if (!net.monitor) {
      const none = document.createElement("div");
      none.className = "cdc-net-none";
      none.textContent = "no match in play";
      body.append(none);
      // The frame counter is the one number that means something outside a
      // match, and the menu is where "why is this tab slow" gets asked.
      if (net.fps !== null) netRow(body, "frames", `${Math.round(net.fps)} fps`);
      return;
    }

    const stale = net.rttAt && Date.now() - net.rttAt > NET_STALE_MILLIS;
    let median = null;
    try {
      median =
        net.median && typeof net.median.calculate === "function" ? net.median.calculate() : null;
    } catch (e) {
      note(`could not read the client's median ping (${e && e.message})`, "warn");
    }
    netRow(
      body,
      "ping",
      net.rtt === null ? "—" : `${Math.round(net.rtt)} ms`,
      netQuality(net.rtt),
      [
        median === undefined || median === null ? "" : `median ${Math.round(median)}`,
        stale ? netAge(net.rttAt) : "",
      ]
        .filter(Boolean)
        .join(" · ")
    );
    netRow(
      body,
      "order",
      net.lat === null ? "—" : `${Math.round(net.lat)} ms`,
      netQuality(net.lat),
      net.lat === null ? "nothing sent yet" : ""
    );
    netRow(body, "frames", net.fps === null ? "—" : `${Math.round(net.fps)} fps`);

    const lock = net.lockstep;
    if (lock && lock.networkTurnMillis) {
      // The game turn is the speed the match is set to; the network turn is what
      // the server has settled on for the whole lobby. Equal is the healthy
      // case, and a gap is somebody else's connection being paid for by
      // everyone.
      const game = Math.round(lock.gameTurnMillis || 0);
      netRow(
        body,
        "turn",
        `${Math.round(lock.networkTurnMillis)} ms`,
        "",
        game ? `game turn ${game} ms` : ""
      );
    }

    if (net.lag) {
      const lag = document.createElement("div");
      lag.className = "cdc-net-lag";
      lag.textContent = "waiting for the other clients";
      body.append(lag);
    }

    if (net.players.length) {
      const list = document.createElement("div");
      list.className = "cdc-net-players";
      const head = document.createElement("div");
      head.className = "cdc-net-players-head";
      // The age is the whole honesty of this block: these are the numbers the
      // client last asked for, and it only asks while its own screens are up.
      head.textContent = `players · ${netAge(net.playersAt)}`;
      list.append(head);
      for (const player of net.players) {
        const row = document.createElement("div");
        row.className = "cdc-net-player";
        const name = document.createElement("span");
        name.className = "cdc-net-who";
        name.textContent = player.name;
        const ping = document.createElement("span");
        ping.className = "cdc-net-value cdc-net-" + (netQuality(player.ping) || "bad");
        ping.textContent = Number.isFinite(player.ping) ? `${player.ping} ms` : "—";
        row.append(name, ping);
        if (!player.status) {
          const gone = document.createElement("span");
          gone.className = "cdc-net-note";
          gone.textContent = "not connected";
          row.append(gone);
        }
        list.append(row);
      }
      body.append(list);
    }
  }

  // --- The memory readout ---------------------------------------------------

  /**
   * Players report the tab crashing, and one reports the stage before it - the
   * page still there with a blank canvas, which is a lost WebGL context. This
   * is the panel that says what the tab was holding when it happened, and opens
   * itself when it is about to.
   *
   * The rule and the arithmetic are in `src/mem-readout.js`; what stays here is
   * the wiring only - the four names it needs from this file, the clock, and
   * the two ends of the trace. Same inversion as the debug HUD, for a different
   * reason: not because the public build drops it (it does not - this one is
   * *for* the public build), but because a sample ring and an alarm rule are
   * testable without a browser and 7900 lines of overlay are not.
   */
  let memMeter = null;
  let memPanel = null;
  let memTimer = 0;

  function startMemory() {
    const api = window.__cdcMem;
    if (!api) {
      note("src/mem-readout.js did not load - no memory readout", "warn");
      return;
    }
    memMeter = api.createMeter({
      now: () => Date.now(),
      store: localStorage,
      // `performance.memory` is Chrome-only and quantised, and this repo has
      // already established that it is blind to what actually kills the tab
      // ([[cd-client-internals]], and [[replay-run-crash]] paid five tabs to
      // establish it). It is here for the one thing it has that nothing else
      // does: a stated ceiling to be a share of.
      readHeap: () => {
        const m = performance.memory;
        return m ? { used: m.usedJSHeapSize, limit: m.jsHeapSizeLimit } : null;
      },
      readGl: () => (window.__cdcGl ? window.__cdcGl.read() : null),
      note,
    });
    memPanel = api.createPanel({
      meter: memMeter,
      layer: chordLayer,
      makeDraggable,
      note,
      store: localStorage,
      keyLabel: () => state.keys.memory.label,
      onVisibility: syncOverlayMouse,
    });

    const previous = memMeter.lastSession();
    if (previous && previous.died) {
      // The whole point of writing the trace to disk: the tab that died could
      // report nothing, so this is the first moment the fact exists at all.
      note(
        `the last session ended without closing - page ${previous.last.heapMb} MB, ` +
          `textures ${previous.last.texMb} MB` +
          (previous.last.lost ? `, context lost ${previous.last.lost}x` : ""),
        "warn"
      );
    }

    tickMemory();
    // The tab going away is the mark whose *absence* means it was killed.
    // `pagehide` rather than `beforeunload`: the latter does not fire for a
    // bfcache navigation and is the one browsers are cutting back.
    window.addEventListener("pagehide", () => {
      if (memMeter) memMeter.close();
    });
  }

  /**
   * One sample, then book the next.
   *
   * `setTimeout` rather than `setInterval` so the cadence can follow the panel
   * with no interval to tear down, and deliberately **not** rAF: a hidden tab
   * stops getting frames, and a hidden tab is the state this readout has most
   * reason to keep measuring - it is where the client stops disposing.
   */
  function tickMemory() {
    if (!memMeter || !memPanel) return;
    memMeter.sample();
    memPanel.enforce();
    memTimer = window.setTimeout(
      tickMemory,
      memPanel.visible() ? window.__cdcMem.SAMPLE_OPEN_MILLIS : window.__cdcMem.SAMPLE_IDLE_MILLIS
    );
  }

  function toggleMemory(force) {
    if (!memPanel) {
      note("the memory readout is not wired up", "warn");
      return false;
    }
    const shown = memPanel.toggle(force);
    // The cadence follows the panel, and a toggle should not have to wait out
    // the old one to take effect.
    if (memTimer) window.clearTimeout(memTimer);
    tickMemory();
    return shown;
  }

  // --- Debug HUD ------------------------------------------------------------

  // Shared with the hints box and the in-game player list, so it stays here and
  // is handed to the panel rather than copied into it.
  function escapeHtml(s) {
    return s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  }

  /**
   * The panel itself is src/debug-hud.js, which the public build does not ship.
   * Absent, both handles are inert: the debug hotkey does nothing,
   * `__cdc.debug()` answers false, and `note()` still renders nothing rather
   * than throwing on every log line.
   *
   * `toggleHud` and `renderHud` stay function declarations, as they were, so
   * they remain hoisted for any caller that runs before this line — `note()` is
   * one, and there are six more. `const hud` is not hoisted; nothing reaches it
   * early today, and the checks in scripts/check-debug-hud.mjs are what keep
   * that true.
   */
  const hud = window.__cdcHud
    ? window.__cdcHud.create({
        state,
        VERSION,
        escapeHtml,
        hotkeyConflicts,
        buildConflicts,
        chordSummary,
        chordReport,
        minimapRect,
        savedRect,
        hqShown,
      })
    : { toggle: () => false, render: () => {} };

  function toggleHud(force) {
    return hud.toggle(force);
  }

  function renderHud() {
    hud.render();
  }

  // --- Keyboard ---------------------------------------------------------------

  // Capture phase and stopPropagation: the client installs its own keydown
  // handler on the document, so a bubbling listener would fire after the game
  // had already acted on the key.
  /**
   * The game has a chat box, and two of our defaults are Shift+letter — which
   * is how you type a capital. Anything aimed at a text field is the user
   * writing, not pressing a hotkey.
   */
  function isTyping(target) {
    if (!target || !target.tagName) return false;
    const tag = target.tagName.toLowerCase();
    return tag === "input" || tag === "textarea" || target.isContentEditable;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (isTyping(e.target)) return;
      // Ours only when a hand actually pressed it. The one untrusted keydown on
      // this page is our own re-issue of the client's fullscreen key, aimed at
      // the client — swallowing it here would be this handler eating its own
      // output.
      if (!e.isTrusted) return;
      // **Which of our own layers this press belongs to** — the table in
      // src/build-chords.js, where the precedence between them can be tested.
      // `none` is a Ctrl on a code the browser keeps with no lock held: left
      // alone entirely, because `preventDefault` does not stop Chrome closing
      // the tab and an order pushed on the way out costs the order and the tab
      // both. Everything else the listener carries out here.
      //
      // An open grid outranks the fixed hotkeys: its slot keys are bare letters
      // and Shift+letter, and three of the fixed keys are Shift+letter on
      // letters the grid uses — Shift+Q was the production panel and therefore
      // could never order five of the first slot, which is the single most
      // obvious thing to do with a units grid. Since 0.70.0 it outranks the
      // cancel key too, Ctrl having become the grid's own "queue next".
      const section = state.combatant ? prefixes().get(e.code) : null;
      const route = CHORD_TABLES
        ? CHORD_TABLES.chordPressRoute(e, {
            inMatch: !!state.combatant,
            gridOpen: !!state.chord,
            keyLockHeld: keyLockHeld(),
            isPrefix: !!section,
            menuOpen: menuOpen(),
          })
        : { layer: "pass" };
      if (route.layer === "none") return;
      let layer = route.layer;
      // **The client's menu is modal, and while it is up ours is the only
      // listener left** — the client removes its own when the menu disables the
      // world interaction. So this layer both closes the menu and stops every
      // other layer acting on a screen that is not the match.
      if (layer === "menu") {
        const decided = CHORD_TABLES.menuKeyAction(e, menuPressAt(e));
        if (decided.consume) {
          e.preventDefault();
          e.stopPropagation();
        }
        runMenuAction(decided.act);
        return;
      }
      if (layer === "grid") {
        if (chordKey(e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // The grid declined the press and closed itself on the way — a key it
        // does not have is the only way here. What is underneath gets it, so the
        // route is asked again with no grid in the way rather than the press
        // being spent on the closing.
        layer = CHORD_TABLES.chordPressRoute(e, {
          inMatch: !!state.combatant,
          gridOpen: false,
          keyLockHeld: keyLockHeld(),
          isPrefix: !!section,
          // No grid is open under a menu: the layer above returned before this.
          menuOpen: false,
        }).layer;
      }
      // Alt on a sidebar tab key: pause or cancel what that tab is building,
      // without opening anything — the same press that cancels a slot on an open
      // grid, aimed at the tab's own queue because there is no grid to aim at.
      //
      // Above the fullscreen swap, and deliberately: that swap only *swallows*
      // Alt+F, which is the key the setting moved away from, so a player who has
      // put a sidebar tab on F is better served by its cancel than by a key kept
      // inert.
      if (layer === "cancelSection") {
        cancelSection(section, e.shiftKey);
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // The fullscreen key sits between the grid and our own hotkeys, and that
      // is the whole of how the two claims on Alt+F are settled: with a grid
      // open it is that slot's cancel (above, and it returned), with none it is
      // a key that has moved to Alt+Enter.
      if (fullscreenSwap(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      // Debug first: it is the more specific combination of the two.
      const hit = matchesHotkey(e, state.keys.debug)
        ? toggleHud
        : matchesHotkey(e, state.keys.overlay)
        ? toggleIngame
        : matchesHotkey(e, state.keys.hqSwap)
        ? toggleHqPreview
        : matchesHotkey(e, state.keys.hqFull)
        ? toggleHqFull
        : matchesHotkey(e, state.keys.queues)
        ? toggleQueues
        : matchesHotkey(e, state.keys.net)
        ? toggleNet
        : matchesHotkey(e, state.keys.memory)
        ? toggleMemory
        : e.code === "Escape" && state.hqFullVisible
        ? () => toggleHqFull(false)
        : null;
      if (!hit) {
        // **The menu key, and the key that no longer opens it** — below the
        // fixed hotkeys rather than above them, and that is the whole of how the
        // two claims on Escape are settled: with the full render on screen it
        // closes the render (the chain above, which returned), with none it is a
        // key that has moved. The other direction — Escape closing the menu —
        // never reaches here; the modal layer answered it.
        if (CHORD_TABLES && state.gameMenu) {
          const decided = CHORD_TABLES.menuKeyAction(e, menuPressAt(e));
          if (decided.consume) {
            e.preventDefault();
            e.stopPropagation();
            runMenuAction(decided.act);
            return;
          }
        }
        // The build layers are consulted only in a match, and only for a press
        // carrying no Meta — which is the browser's and the OS's, never ours.
        if (!state.combatant || e.metaKey) return;
        // **A key of ours firing a command of the client's.**
        //
        // Its reason for existing is `Scoreboard`, the command that opens the
        // alliance screen: `KeyBinds#load` re-stamps it onto Tab after both the
        // saved ini and the defaults, and `configurableCmds` leaves it out — so
        // it cannot be moved from inside the client at all. It does not have to
        // be: the client listens on the **document, bubbling**, and this
        // listener is **window, capturing**, so a press consumed here never
        // reaches it. Freeing Tab is therefore binding Tab, and a Tab nobody has
        // bound keeps opening the alliance screen, which is the right default.
        //
        // Above the build layers because this is one key to one command with no
        // fallback of its own to be shadowed by their Ctrl-strip; below the
        // fixed hotkeys because those are the rows the extension's own features
        // live on. A key in two of the three lists is the options page's to
        // report, and it does.
        const command = commandBindings().get(eventBindingId(e));
        if (command) {
          e.preventDefault();
          e.stopPropagation();
          runCommand(command);
          return;
        }
        // The grid layer above has already had this press. What is left is a
        // second tab press opening one, and the flat one-key-one-object table
        // underneath it.
        if (chordPress(e)) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const bindings = buildBindings(playerSide());
        let bound = bindings.get(eventBindingId(e));
        // **Ctrl on a build key is "queue this next".** Looked up as a fallback
        // rather than by stripping the modifier first, so a binding that
        // deliberately *includes* Ctrl still wins on its own key and only a
        // Ctrl with nothing bound to it reaches for the bare one.
        let next = false;
        if (!bound && e.ctrlKey) {
          bound = bindings.get(eventBindingId(e, { ctrl: false }));
          next = !!bound;
        }
        if (!bound) return;
        // Same swallow as the four above, and it matters more here: a build key
        // is usually a bare letter, which the client very likely binds to
        // something of its own. Ours wins, and the debug panel's `build keys`
        // row reports which of them clash, so that is a choice rather than a
        // surprise.
        e.preventDefault();
        e.stopPropagation();
        // The same routing the grid's slots take: a key on a superweapon
        // building activates the weapon once it is up, rather than ordering a
        // second building that would grant nothing.
        pressName(bound, 1, next);
        return;
      }
      // preventDefault also keeps Alt from handing focus to the browser menu bar.
      e.preventDefault();
      e.stopPropagation();
      hit();
    },
    true
  );

  // --- the mouse ------------------------------------------------------------

  /**
   * The same routing as the keydown listener above, for the buttons a keyboard
   * does not have.
   *
   * **Window, capture, `stopPropagation`** — the identical reason: the client
   * listens on the document and this fires first, so a press taken here never
   * reaches it. The panel toggles and the game-command bindings are asked, in
   * that order; the build layer is deliberately not, because its modifiers are
   * already spent (`Ctrl` queues next, `Alt` cancels, `Shift` orders five) and
   * spending a side button's three modifiers the same way is its own decision,
   * not a consequence of this one.
   *
   * Left and right are returned on untouched before anything else is asked.
   * Left is how you click, right is the game's order, and a binding that could
   * take either would be a binding that can break a match.
   *
   * **Measured before it was written** (2026-08-24, the probe in
   * src/debug-hud.js): buttons 3 and 4 arrive while the client holds pointer
   * lock, carry their modifiers, and `preventDefault` on the press kept the
   * browser from navigating. What that run did *not* exercise is a **bare**
   * back or forward, which is the press a browser would actually navigate on —
   * so the probe stays armed, swallowing the same buttons the same way, and a
   * navigation that ever does get through writes itself into the log at `warn`.
   */
  let mouseHeld = null;

  window.addEventListener(
    "mousedown",
    (e) => {
      if (!ourButton(e.button) || !e.isTrusted || isTyping(e.target)) return;
      const id = mouseBindingId(e);

      // The menu key, which is not a toggle: it opens, closes and steps back
      // out of a screen. Asked through the same table the keyboard asks, with
      // `isMenuKey` supplied here because that table recognises a key by its
      // `code` and a mouse press has none.
      if (CHORD_TABLES && state.gameMenu && state.keys.menu && bindingId(state.keys.menu) === id) {
        const decided = CHORD_TABLES.menuKeyAction(e, { ...menuPressAt(e), isMenuKey: true });
        if (decided.consume) {
          e.preventDefault();
          e.stopPropagation();
          mouseHeld = e.button;
        }
        runMenuAction(decided.act);
        return;
      }

      const toggles = panelToggles();
      for (const [name, run] of Object.entries(toggles)) {
        const bound = state.keys[name];
        if (!bound || bindingId(bound) !== id) continue;
        e.preventDefault();
        e.stopPropagation();
        mouseHeld = e.button;
        run();
        return;
      }

      const command = commandBindings().get(id);
      if (command) {
        // Swallowed whether or not there is a match to run it in: the button is
        // the user's, and letting a bound press fall through to the browser's
        // back navigation between matches is the one outcome nobody wants.
        e.preventDefault();
        e.stopPropagation();
        mouseHeld = e.button;
        if (!runCommand(command)) {
          note(`${command} needs a match — the press did nothing`, "warn");
        }
        return;
      }

      // The build keys, on the same terms as the keyboard's: one press orders
      // one, and `Ctrl` with nothing bound to it reaches for the bare binding
      // and puts the order next instead of last. `Alt` and `Shift` are the
      // grid's, not this layer's, so they are not read here — the same as for a
      // key.
      if (!state.combatant || e.metaKey) return;
      const bindings = buildBindings(playerSide());
      let bound = bindings.get(id);
      let next = false;
      if (!bound && e.ctrlKey) {
        bound = bindings.get(mouseBindingId(e, { ctrl: false }));
        next = !!bound;
      }
      if (!bound) return;
      e.preventDefault();
      e.stopPropagation();
      mouseHeld = e.button;
      pressName(bound, 1, next);
    },
    true
  );

  // The rest of a press this extension has taken. A browser acts on
  // back/forward at the *end* of a click, so swallowing only the `mousedown`
  // leaves the navigation to fire off the release — which is the failure this
  // whole feature is written to avoid.
  for (const type of ["mouseup", "auxclick", "click"]) {
    window.addEventListener(
      type,
      (e) => {
        if (mouseHeld === null || e.button !== mouseHeld) return;
        e.preventDefault();
        e.stopPropagation();
        if (type !== "mouseup") mouseHeld = null;
      },
      true
    );
  }

  // The other half of a held key. Registered once rather than around each
  // press: a keyup with nothing pending costs a comparison, and a listener
  // added and removed per press is a listener that outlives a press the page
  // never sees the end of.
  window.addEventListener(
    "keyup",
    (e) => {
      if (chordHold && chordHold.code === e.code) chordHoldClear();
    },
    true
  );

  // A key held while the window loses focus — Alt+Tab is the obvious one — never
  // sends its keyup here, so the hold would fire long after the hand had moved
  // on. Losing focus ends it.
  window.addEventListener("blur", chordHoldClear);

  // Where a chord grid opens. Passive, and storing two numbers is all it does:
  // this fires on every mouse move over a running match.
  window.addEventListener(
    "mousemove",
    (e) => {
      state.pointer = { x: e.clientX, y: e.clientY };
    },
    { passive: true, capture: true }
  );

  // --- Wiring ---------------------------------------------------------------

  let scheduled = false;
  let screenSeen = false;

  function refresh() {
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      const screen = document.querySelector(".loading-screen");
      if (!screen) {
        screenSeen = false;
        return;
      }
      mountMapPanel(screen);
      mountHints(screen);
      const labelled = decorateRows(screen);

      // The loading screen lasts seconds; snapshot it so the HUD can be opened
      // afterwards and still say what happened.
      state.screen = {
        at: new Date().toTimeString().slice(0, 8),
        players: screen.querySelectorAll(".player-status").length,
        labelled: labelled ? "ok" : "FAILED",
        panel: screen.querySelector(".cdc-map") ? "shown" : "missing",
      };
      if (!screenSeen) {
        screenSeen = true;
        note(
          `loading screen: ${state.screen.players} players, labels ${state.screen.labelled}, ` +
            `map panel ${state.screen.panel}`,
          state.screen.labelled === "ok" && state.screen.panel === "shown" ? "info" : "warn"
        );
      }
    });
  }

  new MutationObserver(refresh).observe(document.body, {
    childList: true,
    subtree: true,
  });
  refresh();
  installHooks();

  // --- Probe ----------------------------------------------------------------

  /**
   * Re-check every assumption this extension rests on. Run `__cdc.probe()` in
   * the console (page context); anything false is a client change that broke a
   * hook. Most fields are meaningful only while a loading screen is up.
   */
  function probe() {
    const sys = window.System || window.SystemJS;
    const screen = document.querySelector(".loading-screen");
    const props = screen ? loadingScreenProps(screen) : null;
    const result = {
      version: VERSION,
      systemJsPresent: !!(sys && typeof sys.import === "function"),
      modulesLoaded: Object.keys(state.modules)
        .filter((k) => state.modules[k])
        .join(",") || "none",
      hooks: Object.keys(state.hooks)
        .filter((k) => state.hooks[k])
        .join(",") || "none",
      loadingScreenInDom: !!screen,
      fiberReachable: !!props,
      playerCount: props ? props.playerInfos.length : 0,
      unknownCountries: props
        ? props.playerInfos
            .map((p) => p.country && p.country.name)
            .filter((n) => n && !FACTIONS[n])
            .join(",") || "none"
        : "n/a",
      mapCapturedFrom: state.captureSource || "nothing captured",
      // Whether a run can render a theater this tab has not played.
      gameLoaderHeld: state.gameLoader ? "yes" : "no — play one match in this tab",
      previewRendered: state.map ? "yes" : "no",
      mapFacts: state.map ? JSON.stringify(state.map.facts) : "n/a",
      mapPanelMounted: screen ? !!screen.querySelector(".cdc-map") : false,
      // The recolour answers two questions: whether the client still has the
      // table we pick names out of, and what the last match did about it.
      coloursKnown: Object.keys(state.colours.colors).length,
      recolour: recolourPrefs().on ? `${state.recolour.painted} painted — ${state.recolour.why}` : "off",
    };
    console.table(result);
    return result;
  }

  window.__cdc = {
    // A getter, not a value: this literal is built while the IIFE runs, which is
    // before the bridge delivers the manifest's version — a copy taken here is the
    // `"?"` placeholder for the life of the tab, and README's `## Diagnosing it`
    // opens by telling the reader to compare this against manifest.json.
    get version() {
      return VERSION;
    },
    probe,
    debug: toggleHud,
    // Why a build key did nothing — see buildReport. Optionally takes a key
    // code (`__cdc.build("KeyQ")`) to answer for one key.
    build: buildReport,
    // Why a chord did nothing — which prefixes resolved, from whose table,
    // and whose layout is in force.
    chords: chordReport,
    queues: toggleQueues,
    net: toggleNet,
    memory: toggleMemory,
    // The samples behind the panel, for a report from a player whose tab keeps
    // dying: `copy(__cdc.memTrace())` is the whole curve rather than the one
    // reading the panel happens to be showing.
    memTrace: () => (memMeter ? { previous: memMeter.lastSession(), samples: memMeter.samples() } : null),
    overlay: toggleIngame,
    resetLayout,
    state,
    FACTIONS,
    currentGuide,
    // "Did it see the map's own spawn markers?" is the one question about a
    // preview that cannot be answered by looking at the result: a dot drawn
    // over a marker and a marker on its own look the same from a distance.
    // Takes a decoded preview ({data, width, height}), the start positions in
    // canvas pixels and the upscale — `renderPreview` calls it exactly so.
    marksItsOwnSpawns,
    vividNear,
    // The other half of the same question: where it looked. Recorded from the
    // client, and the client mutates what it hands back — see startPositions.
    startPositions,
    // And the answer the card acts on: which picture(s) a map file yields.
    renderPreview,
    NATIVE_MARK,
    PANEL,
    DEFAULT_KEYS,
  };
  // Ask the isolated world for the stored hints. It may have loaded first and
  // already sent them, in which case this just gets a second, identical push.
  window.postMessage({ source: "cdc-page", type: "ready" }, "*");

  // Silence here means bridge.js is not in this tab. The usual cause is an
  // extension update without a page reload: an already-open tab keeps the
  // content scripts it was loaded with, and a newly added one never appears.
  setTimeout(() => {
    if (state.bridge !== "connected") {
      state.bridge = "NOT ANSWERING — reload the game tab";
      note(
        "storage bridge did not answer: per-map hints and the map catalogue are off. " +
          "Reload the game tab (F5) — after an extension update an open tab keeps the old scripts.",
        "warn"
      );
    }
  }, 5000);

  /**
   * Settings backup — the client's own half.
   *
   * The extension's own settings are in chrome.storage, and the options page
   * reads them itself. The client's are in two stores that only this world can
   * reach, and neither of them is anything the user can copy by hand:
   *
   *   the hotkey table  an INI file at the root of the client's origin-private
   *                     file system (`KeyBinds`, `Engine.rfs`)
   *   everything else   a handful of `_r_*` keys in localStorage (`LocalPrefs`)
   *
   * Per-origin and per-browser, both of them — which is the whole reason this
   * exists: a second browser starts blank.
   */

  /**
   * The two names the client persists a hotkey table under.
   *
   * `Engine.getFileNameVariant` appends "md" under Yuri's Revenge, so which one
   * exists depends on what was last played. Both are read, because a backup
   * that carried only the engine you happened to be in would drop the other
   * without saying so — and nothing outside this list is ever written, whatever
   * a loaded file asks for.
   */
  const HOTKEY_FILES = ["keyboard.ini", "keyboardmd.ini"];

  /**
   * The client's localStorage keys a backup carries — and, as deliberately, the
   * ones it does not.
   *
   * Carried: what the client's own options screens write. Left behind:
   *
   *   _r_lastCon   a live reconnect payload. Imported elsewhere it makes the
   *                other browser offer to rejoin a match it was never in.
   *   _r_gameRes   where this install takes its game files from — a fact about
   *                the browser, not a preference of the player's.
   *   _r_last_gpu  measured on this machine's GPU. Carrying it suppresses the
   *                graphics prompt on a machine that needed to be asked.
   *   _r_nickname, _r_autoLogin, _r_region   identity, not settings.
   *   _r_last*     lobby state: the map, mode, country and colour last picked.
   */
  const CLIENT_PREF_KEYS = ["_r_opts_v3", "_r_mixer_v3", "_r_opts_music", "_r_taunts", "_r_hostOpts"];

  /**
   * How long a settings job waits for the client to have a file system.
   *
   * Far shorter than CLIENT_WAIT_MS, which waits for the rules to be loaded:
   * this needs only `Engine.initRfs`, which runs before the game files are even
   * chosen. That order is what lets an import land in a browser that has never
   * played — the case the feature was asked for.
   */
  const SETTINGS_WAIT_MS = 60000;

  /** The client's file-system root, once its start-up has built one. */
  async function clientRootDir() {
    const sys = window.System || window.SystemJS;
    if (!sys || typeof sys.import !== "function") throw new Error("SystemJS not on the page");
    const { Engine } = await sys.import("engine/Engine");
    const deadline = Date.now() + SETTINGS_WAIT_MS;
    for (;;) {
      const dir = Engine.rfs && Engine.rfs.getRootDirectory();
      if (dir) return dir;
      if (Date.now() > deadline) {
        throw new Error("the client built no file system — it is still starting, or it failed to");
      }
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  /**
   * The live hotkey table as { command: code }, or null if no client built one.
   *
   * `hotKeys` is keyed the other way round — code to command — because that is
   * the lookup a keypress needs. A backup is read by command: two codes can
   * never share a command, and the code is what a rebind changes.
   */
  function liveHotkeys() {
    const binds = state.keyBinds;
    if (!binds || !(binds.hotKeys instanceof Map) || !binds.hotKeys.size) return null;
    const out = {};
    for (const [code, command] of binds.hotKeys) out[command] = code;
    return out;
  }

  /** The `[Hotkey]` section of a keyboard.ini, as { command: code }. */
  function parseHotkeyIni(text) {
    const out = {};
    let inSection = false;
    for (const line of String(text).split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith(";")) continue;
      const header = trimmed.match(/^\[(.+)\]$/);
      if (header) {
        inSection = header[1].trim().toLowerCase() === "hotkey";
        continue;
      }
      if (!inSection) continue;
      const at = trimmed.indexOf("=");
      if (at < 0) continue;
      const command = trimmed.slice(0, at).trim();
      const code = Number(trimmed.slice(at + 1).trim());
      if (command && Number.isFinite(code)) out[command] = code;
    }
    return out;
  }

  /** The same, back out — the shape `IniFile#toString` writes, CRLF included. */
  function hotkeyIniText(table) {
    const lines = ["[Hotkey]"];
    for (const [command, code] of Object.entries(table)) lines.push(command + "=" + code);
    return lines.join("\r\n") + "\r\n";
  }

  /**
   * What another browser would have to be given to reproduce this keyboard.
   *
   * The saved file and the live table are both read, and the live one wins where
   * they name the same file: `KeyBinds` writes a file only once something has
   * been rebound, so a client sitting on its defaults has a complete table and
   * an empty directory — and those defaults are exactly what the other browser
   * has to be handed. Live is also never staler than the file, since the file is
   * written from it.
   */
  async function readClientSettings(want) {
    const out = { hotkeys: {}, prefs: {}, notes: [] };
    if (want.hotkeys) {
      const dir = await clientRootDir();
      for (const name of HOTKEY_FILES) {
        try {
          if (await dir.containsEntry(name)) {
            const file = await dir.getRawFile(name);
            out.hotkeys[name] = parseHotkeyIni(await file.text());
          }
        } catch (e) {
          // One unreadable file is one line: the other engine's table, and the
          // live one, are still worth carrying out.
          out.notes.push("could not read " + name + " — " + ((e && e.message) || e));
        }
      }
      const live = liveHotkeys();
      const liveName = live && state.keyBinds && String(state.keyBinds.persistFileName || "");
      if (liveName) out.hotkeys[liveName] = live;
      if (!Object.keys(out.hotkeys).length) {
        throw new Error("no hotkey table to read — none is saved and this tab's client built none");
      }
    }
    if (want.prefs) {
      for (const key of CLIENT_PREF_KEYS) {
        const value = localStorage.getItem(key);
        if (typeof value === "string") out.prefs[key] = value;
      }
    }
    return out;
  }

  /**
   * Put a backup back.
   *
   * Through the client's own objects wherever there are any — its table, its
   * serialiser — and by writing the file directly where there are not, which is
   * the fresh-browser case this exists for. What could not be placed is
   * reported rather than dropped: a client that has renamed a command since the
   * backup was taken would otherwise lose that binding in silence.
   */
  async function writeClientSettings(payload) {
    const report = { files: [], prefs: 0, unknown: [], reload: false, notes: [] };
    const hotkeys = (payload && payload.hotkeys) || {};
    const wanted = Object.keys(hotkeys);
    const names = wanted.filter((name) => HOTKEY_FILES.includes(name.toLowerCase()));
    for (const name of wanted) {
      if (!names.includes(name)) {
        report.notes.push('refused "' + name + '" — not a file the client keeps');
      }
    }

    if (names.length) {
      // The client's own list of what a command can be called. Without it every
      // line is written as it arrived, which is what the client's own loader
      // does with a name it does not know — warn and carry on. Saying so is the
      // difference between "checked, all known" and "could not check".
      let commands = null;
      try {
        const sys = window.System || window.SystemJS;
        const mod = await sys.import("gui/screen/game/worldInteraction/keyboard/KeyCommandType");
        const list = mod && mod.KeyCommandType;
        if (list) commands = new Set(Object.keys(list));
      } catch (e) {
        report.notes.push(
          "this client's command list could not be read (" +
            ((e && e.message) || e) +
            ") — nothing was checked against it"
        );
      }

      const dir = await clientRootDir();
      for (const name of names) {
        const table = {};
        for (const [command, code] of Object.entries(hotkeys[name] || {})) {
          const number = Number(code);
          if (!Number.isFinite(number)) continue;
          if (commands && !commands.has(command)) {
            report.unknown.push(command);
            continue;
          }
          table[command] = number;
        }
        const binds = state.keyBinds;
        const live = !!binds && String(binds.persistFileName || "").toLowerCase() === name.toLowerCase();
        if (live) {
          // Cleared first for the reason `KeyBinds#load` clears: the file is the
          // whole table rather than an overlay, so a binding the backup does not
          // mention is one the backup does not have.
          binds.hotKeys.clear();
          state.clientHotkeys.clear();
          for (const [command, code] of Object.entries(table)) {
            binds.addHotKey(command, code);
            // Written here rather than left to the hook on `addHotKey` that
            // normally fills it: the same value either way, but a bookkeeping
            // copy that is only correct because of a hook installed elsewhere
            // is one reorganisation away from being quietly wrong — and this
            // copy is what the hotkey-conflict warnings read.
            state.clientHotkeys.set(code, command);
          }
          await binds.save();
        }
        // `KeyBinds#saveIni` writes through an optional chain: an instance built
        // before the file system existed has no `configDir`, saves nothing, and
        // reports success. So the file is checked for rather than assumed, and
        // written here when the client's own writer left none.
        if (!live || !(await dir.containsEntry(name))) {
          await dir.writeFile(new File([hotkeyIniText(table)], name));
          if (live) {
            report.notes.push(name + ": the client's own writer wrote nothing — written directly instead");
          } else {
            report.reload = true;
          }
        }
        report.files.push({ name, count: Object.keys(table).length, live });
      }
    }

    for (const [key, value] of Object.entries((payload && payload.prefs) || {})) {
      if (!CLIENT_PREF_KEYS.includes(key)) {
        report.notes.push('refused "' + key + '" — not a setting a backup carries');
        continue;
      }
      if (typeof value !== "string") continue;
      localStorage.setItem(key, value);
      report.prefs++;
      // `GeneralOptions` is read once, at boot, and the client's own options
      // screen writes its copy back over this one when it is left. A live client
      // would both ignore the import and eventually undo it.
      report.reload = true;
    }
    return report;
  }

  let settingsBusy = false;

  /**
   * One settings job, read or write, answered on the wire it arrived on.
   *
   * A write reads first and sends what it found back with the result. That is
   * what makes *undo this import* trustworthy: it is what was actually there a
   * moment before, rather than whatever the options page last happened to read.
   */
  async function runSettingsJob(mode, want, payload) {
    if (settingsBusy) {
      note("a settings job is already running in this tab", "warn");
      return;
    }
    settingsBusy = true;
    const answer = { source: "cdc-page", type: "settings-result", mode };
    try {
      if (mode === "write") {
        let previous = null;
        try {
          previous = await readClientSettings({ hotkeys: true, prefs: true });
        } catch (e) {
          note("no snapshot before the import — " + ((e && e.message) || e), "warn");
        }
        const report = await writeClientSettings(payload || {});
        answer.report = report;
        answer.previous = previous;
        const files = report.files.map((f) => f.name + " (" + f.count + ")").join(", ");
        note(
          "settings imported: " +
            (files || "no hotkey file") +
            ", " +
            report.prefs +
            " client preference(s)"
        );
        for (const line of report.notes) note("settings import: " + line, "warn");
        if (report.unknown.length) {
          note(
            "settings import: " +
              report.unknown.length +
              " binding(s) this client has no command for — " +
              report.unknown.join(", "),
            "warn"
          );
        }
      } else {
        const data = await readClientSettings(want || { hotkeys: true, prefs: true });
        answer.data = data;
        const files = Object.entries(data.hotkeys)
          .map(([name, table]) => name + " (" + Object.keys(table).length + ")")
          .join(", ");
        note(
          "settings read: " +
            (files || "no hotkey file") +
            ", " +
            Object.keys(data.prefs).length +
            " client preference(s)"
        );
        for (const line of data.notes) note("settings read: " + line, "warn");
      }
      answer.ok = true;
    } catch (e) {
      answer.ok = false;
      answer.error = (e && e.message) || String(e);
      note("settings " + (mode === "write" ? "import" : "read") + " failed — " + answer.error, "warn");
    }
    settingsBusy = false;
    window.postMessage(answer, "*");
  }


  /**
   * The "did my reload take?" line. Held until the manifest's version arrives
   * over the bridge, because a load line without a version answers nothing —
   * and printed anyway if the bridge never answers, since that is itself the
   * most likely reason a reload did not take.
   */
  let announced = false;
  function announce() {
    if (announced) return;
    announced = true;
    // The debug panel is a file the public build does not ship, so the load
    // line names its key only when there is a panel behind it.
    note(
      `v${VERSION} loaded — ${state.keys.overlay.label} in-game overlay` +
        (window.__cdcHud ? `, ${state.keys.debug.label} debug panel` : "")
    );
  }
  // Called from the config handler the moment the version lands; this is the
  // floor under it, for the tab where the bridge never replies at all.
  setTimeout(announce, 3000);

  // The readout starts with the page, not with the panel: the trace is the
  // deliverable, and a curve that begins when a player first presses the key
  // is a curve missing the part that explains it.
  startMemory();
})();
