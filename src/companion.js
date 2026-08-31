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
    // The country flag on the taunt overlay, through the client's own path to
    // one. `ImageContext` is where the client parks the VFS, the CDN base and
    // the decoded-image cache its `Image` component reads — a static, not a
    // React context — so the loading screen's own `CountryIcon` has usually
    // already put every flag in this match into it. `PcxFile` is the decoder
    // for the miss.
    imageContext: "gui/component/ImageContext",
    pcxFile: "data/PcxFile",
    // The sidebar's own two components: the block of cameos, and the four tab
    // buttons above it. Both are read for geometry only — where a cameo is, so
    // its key can be drawn on it.
    sidebarCard: "gui/screen/game/component/hud/SidebarCard",
    sidebarTabs: "gui/screen/game/component/hud/SidebarTabs",
    // The HUD itself and the world view whose width it takes. Read together
    // because collapsing the sidebar is two facts, not one: `Hud` is where the
    // sidebar's objects hang — one ref-less container holding the frame, the
    // radar, the credits, the cameo card and the power bar, plus a second one
    // for the six buttons — and `WorldView#computeWorldViewport` is the single
    // place `hud.sidebarWidth` is subtracted from the world's own scissor. Hide
    // the first without the second and the freed strip is the renderer's clear
    // colour, which is worse than the sidebar.
    hud: "gui/screen/game/component/Hud",
    worldView: "gui/screen/game/WorldView",
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
    imageContext: "ImageContext",
    pcxFile: "PcxFile",
    sidebarCard: "SidebarCard",
    sidebarTabs: "SidebarTabs",
    hud: "Hud",
    worldView: "WorldView",
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
    // opened when something is wrong; `H` hides.
    overlay: { code: "KeyO", keyCode: 79, alt: true, shift: false, ctrl: false, label: "Alt+O" },
    queues: { code: "KeyP", keyCode: 80, alt: true, shift: false, ctrl: false, label: "Alt+P" },
    // The taunts, on the only right-hand letter left that stands for
    // anything: `Y` for *yell*. `T` is the letter the feature is named after
    // and it is not available — it is the fifth slot of the chord grid, which
    // means the left hand, and the grid spends that block under every modifier.
    taunts: { code: "KeyY", keyCode: 89, alt: true, shift: false, ctrl: false, label: "Alt+Y" },
    hqSwap: { code: "KeyI", keyCode: 73, alt: true, shift: false, ctrl: false, label: "Alt+I" },
    hqFull: { code: "KeyU", keyCode: 85, alt: true, shift: false, ctrl: false, label: "Alt+U" },
    // The game menu, on the letter it is named after: it is the one of these
    // pressed *under pressure* — the press that used to be Escape.
    menu: { code: "KeyM", keyCode: 77, alt: true, shift: false, ctrl: false, label: "Alt+M" },
    // Off the pattern on purpose: the debug panel ships only in the dev build
    // (`ownKeys`), so it takes a key none of the public six would want back.
    debug: { code: "KeyJ", keyCode: 74, alt: true, shift: false, ctrl: false, label: "Alt+J" },
    net: { code: "KeyN", keyCode: 78, alt: true, shift: false, ctrl: false, label: "Alt+N" },
    // The radar, on the letter next to the four panels rather than on R: R is
    // in the qwert block, which an open build grid spends under every
    // modifier, and the left hand is not available to any general default.
    radar: { code: "KeyL", keyCode: 76, alt: true, shift: false, ctrl: false, label: "Alt+L" },
    // The memory readout, next to the debug panel rather than next to the six:
    // both are opened when something is wrong, not while playing. Its own
    // argument for a bare key (0.100.0 — it is the panel a stranger is talked
    // into opening in a chat window mid-match, and one press is easier to say
    // than a modifier) did not survive the move off the digits, because a bare
    // key that costs the client nothing is `I`, `J` or `O` and nothing else, and
    // splitting the set to buy one press back would cost more than it saves.
    memory: { code: "KeyK", keyCode: 75, alt: true, shift: false, ctrl: false, label: "Alt+K" },
    // The sidebar collapse, on the letter for *hide*. The only one of these
    // that changes what the game itself draws rather than putting something of
    // ours over it, which is why it is last in the table and last in the
    // options page's list.
    sidebar: { code: "KeyH", keyCode: 72, alt: true, shift: false, ctrl: false, label: "Alt+H" },
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

  // Internal country name -> what a player calls it, which side it plays, and
  // the client's own flag file for it. The table moved to `src/build-chords.js`
  // in 1.14.0: the options page needs the same labels to let you read another
  // country's taunts, and it cannot see anything in this file.
  //
  // `{}` rather than a copy when the tables did not load, which is the same
  // degradation the chord tables take a few thousand lines below — a country
  // then reads as its rules name, which is worse than a label and better than
  // a crash.
  const FACTIONS = (window.__cdcBuildChords && window.__cdcBuildChords.COUNTRIES) || {};

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
      pointer: false,
      combatantUi: false,
      pingMonitor: false,
      gameMenu: false,
      hud: false,
      worldView: false,
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
    // The client's live `Hud` and `WorldView`. The HUD is rebuilt on every
    // viewport change and this is replaced with it; the world view outlives a
    // rebuild but is captured off a prototype hook all the same, because the
    // two are read together and one held instance beside one live one is the
    // shape of a stale-coordinate bug.
    hud: null,
    worldView: null,
    // The grid on screen right now ({ section }), or null.
    chord: null,
    // The taunt overlay on screen right now ({ listening }), or null;
    // `listening` is the slot waiting for a key to rebind, or -1.
    taunt: null,
    // slot -> taunt number, the overlay's layout as edited in the options
    // page. Empty means the shipped one, exactly as `chords` does.
    taunts: {},
    // The last sidebar-tab press seen ({ code, at }). A second one inside
    // CHORD_WINDOW is a chord rather than two tab switches.
    tap: null,
    // Where the DOM last saw the mouse. Frozen while the client holds a
    // pointer lock, which is most of a match — `cursorPoint()` prefers the
    // client's own pointer and falls back to this.
    pointer: null,
    // Where the cursor is while the game holds a pointer lock, integrated by
    // `trackPointer` from `movementX/movementY`. A real lock freezes the DOM's
    // `clientX/clientY` at the instant it was taken, so `pointer` above stops
    // moving for the whole of a match; this does not. Held equal to `pointer`
    // while the mouse is free, so a lock starts from where the cursor is.
    lockedPointer: null,
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
    // What a render looks like: ore and gem colours, a brightness/contrast pair
    // per element type, and how far the radar dims explored-but-unlit ground.
    // Held here on the same terms as spriteFix -- to be handed on -- but with a
    // second reader, since the radar composites against it live.
    appearance: {},
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

      // The HUD, for the sidebar collapse. `init` rather than the constructor,
      // and *after* the original rather than before: `init` is the jsx render
      // itself, so every ref the collapse reads — `sidebarPower`,
      // `sidebarButtonsContainer`, `superWeaponTimers` — is still undefined on
      // the way in and filled on the way out. One hook is every HUD the client
      // ever builds, which is one per viewport change.
      const Hud = state.modules.Hud;
      if (Hud && Hud.prototype && typeof Hud.prototype.init === "function") {
        const originalHudInit = Hud.prototype.init;
        Hud.prototype.init = function (...args) {
          const built = originalHudInit.apply(this, args);
          state.hud = this;
          // A rebuilt HUD is an uncollapsed one: the preference is what survives
          // a rebuild, so it is re-applied to the new objects rather than
          // remembered on the ones just destroyed.
          applySidebar();
          return built;
        };
        if (typeof Hud.prototype.destroy === "function") {
          const originalHudDestroy = Hud.prototype.destroy;
          Hud.prototype.destroy = function (...args) {
            if (state.hud === this) state.hud = null;
            return originalHudDestroy.apply(this, args);
          };
        }
        // **The client's own in-game menu draws inside the container the
        // collapse hides.** `Hud#showSidebarMenu` renders into
        // `sidebarMenuContainer`, a child of it — and by the time that runs the
        // client has already called `WorldInteraction#setEnabled(false)`, which
        // takes the keyboard away from itself. A collapse left on would leave a
        // menu nothing on the keyboard can reach and nothing on screen can be
        // seen. So it lifts for as long as the menu is up, and the sidebar the
        // player gets back for those few seconds is the one the menu expects.
        if (
          typeof Hud.prototype.showSidebarMenu === "function" &&
          typeof Hud.prototype.hideSidebarMenu === "function"
        ) {
          const originalShowMenu = Hud.prototype.showSidebarMenu;
          Hud.prototype.showSidebarMenu = function (...args) {
            sidebarLift = true;
            applySidebar();
            return originalShowMenu.apply(this, args);
          };
          const originalHideMenu = Hud.prototype.hideSidebarMenu;
          Hud.prototype.hideSidebarMenu = function (...args) {
            const out = originalHideMenu.apply(this, args);
            sidebarLift = false;
            applySidebar();
            return out;
          };
        } else {
          note("Hud#showSidebarMenu unavailable — the game menu could open inside a hidden sidebar", "warn");
        }
        state.hooks.hud = true;
      } else {
        note("Hud unavailable — the sidebar cannot be collapsed", "warn");
      }

      // The world's own viewport, which is the half of the collapse that is not
      // cosmetic. `computeWorldViewport` is the one place the sidebar's width
      // leaves the HUD and reaches the renderer, and it is called from both
      // `WorldView#init` and every viewport change — so overriding it here is
      // the whole feature for the world: a match started with the collapse on
      // comes up already widened, a resize keeps it, and there is no second
      // path of ours to keep in step with the client's.
      const WorldView = state.modules.WorldView;
      if (WorldView && WorldView.prototype && typeof WorldView.prototype.computeWorldViewport === "function") {
        const originalWorldViewport = WorldView.prototype.computeWorldViewport;
        WorldView.prototype.computeWorldViewport = function (screen, bounds) {
          state.worldView = this;
          const box = originalWorldViewport.call(this, screen, bounds);
          // Width only, and by the client's own formula rather than by adding
          // the gutter back: a map narrower than the screen is already clamped
          // to its own bounds, and `min` says that where `+ sidebarWidth` would
          // have quietly scrolled past the map's edge.
          if (box && screen && bounds && sidebarCollapsed()) {
            box.width = Math.min(bounds.width, screen.width);
          }
          return box;
        };
        state.hooks.worldView = true;
      } else {
        note("WorldView unavailable — a collapsed sidebar would leave a blank strip", "warn");
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
            closeTaunts();
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
  /**
   * Push the global brightness/contrast pair onto every picture we show.
   *
   * The one dial that needs no render: a filter over a picture already drawn
   * reaches the stored renders, the map's own preview and the radar alike. It
   * goes on as a custom property rather than per element because the three
   * hosts are built in three different places and one of them is rebuilt on
   * every loading screen -- a variable on the root outlives all of that, and
   * the badge layers sit outside the filtered image on purpose, since an
   * annotation should not dim with the map it annotates.
   *
   * The per-type dials cannot be done here. They need the element types kept
   * apart, which is only true while the render is being made.
   */
  function repaintAppearance() {
    const tune = window.__cdcTune;
    if (!tune) return; // the table is a separate script; without it, no dials
    document.documentElement.style.setProperty("--cdc-render-filter", tune.globalFilter(state.appearance));
  }

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

    if (data.type === "taunt-wav-job") {
      runTauntWavJob(data.file);
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

    if (data.taunts) {
      state.taunts = data.taunts;
      // An overlay open while the options page is edited redraws against the
      // new layout rather than holding the one it was built with.
      renderTaunts();
    }

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

    // What a render looks like, on the same wire and for the same reason. The
    // value is compared before anything repaints: the in-game panel writes this
    // while a slider is being dragged, and the echo of our own write must not
    // redo work that would land on the same pixels.
    //
    // Gated on `globalFilter` and not on `tuneKey`, because those answer
    // different questions and only one of them is this one. `tuneKey` asks
    // "would re-rendering this map change it" -- the baked half, staleness. What
    // repaintAppearance writes is `globalFilter`, so that is what decides whether
    // writing it again is worth anything. They used to be the same call, and
    // when the global pair left the stamp this gate would have gone dead: the
    // one dial that repaints for free would have stopped repainting at all.
    if (data.appearance) {
      const tune = window.__cdcTune;
      const before = tune ? tune.globalFilter(state.appearance) : null;
      state.appearance = data.appearance;
      if (window.__cdcHq && typeof window.__cdcHq.setLook === "function") {
        window.__cdcHq.setLook(state.appearance);
      }
      if (!tune || tune.globalFilter(state.appearance) !== before) repaintAppearance();
      // The radar separately, because the CSS custom property does not reach
      // it: its canvas composites the per-type dials itself and applies the
      // global pair at the blit. Unconditional and cheap -- the backing canvas
      // is stamped with the filters it was built from, so a dial that changed
      // nothing this panel draws re-blits one image and rebuilds nothing.
      if (radarVisible) {
        paintRadar();
        // The drawer shows the same numbers, and this is the push that carries
        // a change made on the options page while the panel is open.
        renderRadarDials();
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
  function makeDraggable(box, grip, save, ignore) {
    let mode = null;
    let start = null;

    // --- what `report()` reads, and nothing else ------------------------------
    //
    // The hit test is known to land on the cursor in a real match — the drawn
    // cursor rides the same `cursorPoint()` — so the open half of "the panel will
    // not move" is downstream of it, in here. These counters exist so
    // `dragReport()` can separate "the press never reached `begin`" from "`begin`
    // armed the box and `onMove` then did nothing", without pressing anything.
    // Written by the drag as it runs, never read by it.
    let listening = false;
    let begins = 0;
    let downs = 0;
    let moves = 0;
    let lastBegin = null;
    let lastMove = null;

    /**
     * Is this press on something the box does not drag from?
     *
     * The move listener goes on the *box*, so by default a press anywhere in
     * a panel moves it. That is right for a panel that only shows things and
     * wrong the moment one of its children means something under the mouse —
     * the radar's canvas is a map you click on, and a drag is not what a click
     * on a tile should do. A selector rather than an element, because the
     * child is rebuilt with the panel and an element would go stale.
     */
    const ignored = (target) =>
      !!(ignore && target && target.closest && target.closest(ignore));

    /**
     * Is this press on the resize grip?
     *
     * `contains` rather than an identity test, because the grip may have
     * children and `elementFromPoint` answers with the deepest one. Written
     * against the grip element the caller handed in, not a selector: this
     * helper serves four panels and a radar-shaped selector in it would be a
     * bug the other three inherit.
     */
    const onGrip = (target) => !!(grip && target && (target === grip || (grip.contains && grip.contains(target))));

    // Takes a point rather than an event: with the mouse locked, an event's
    // coordinates are frozen and the only live position is the game cursor.
    const onDown = (at, which) => {
      if (!at) return;
      downs++;
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
      listening = true;
    };

    const onMove = (e) => {
      // Counted before the guard, so a move that fires while nothing is armed is
      // distinguishable from a move listener that was never attached at all.
      moves++;
      if (!mode) return;
      const at = cursorPoint();
      lastMove = { mode, at: at ? Math.round(at.x) + "," + Math.round(at.y) : "none — cursorPoint gave nothing" };
      if (!at) return;
      const dx = at.x - start.x;
      const dy = at.y - start.y;
      lastMove.by = Math.round(dx) + "," + Math.round(dy);
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
      listening = false;
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
        // Swallowed either way, dragged only if the press was not on an
        // ignored child: the client reads a stray mousedown as a world
        // command, so letting one through would order units to wherever the
        // panel happens to sit on screen.
        if (ignored(e.target)) return;
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

    // `begin` takes the target as well as the point, because the locked-mouse
    // path has already done the hit test and this is the only way the same
    // exclusion can reach it — a panel's own mousedown never fires under a
    // pointer lock, so without this the canvas would be draggable exactly
    // while a match is being played and inert everywhere else.
    return {
      begin: (at, target) => {
        begins++;
        const skip = ignored(target);
        lastBegin = {
          at: at ? Math.round(at.x) + "," + Math.round(at.y) : "none — begin was handed no point",
          target: (target && (target.className || target.tagName)) || "nothing",
          ignored: skip,
        };
        if (skip) return;
        // The grip resizes and everything else moves -- the same split the two
        // DOM listeners above make, and the reason this argument exists at all.
        //
        // It used to be "move" unconditionally, so under a pointer lock -- which
        // is the whole of a match -- NO floating panel could be resized: not the
        // radar, and not the queue, net or memory panels either. That predates
        // the radar; it has been true since `begin` was written.
        onDown(at, onGrip(target) ? "resize" : "move");
      },
      /**
       * This box's own drag state, for `__cdc.drag()`. It copies values out and
       * nothing else — it never arms, disarms, presses or moves anything, so a
       * player reading the report cannot perturb the thing being diagnosed.
       *
       * `begins` without `downs` means `begin` was reached and refused the press
       * (`lastBegin.ignored`, or no point to act on); `downs` without `moves`
       * means the box armed and the move listener never fired; `moves` climbing
       * with `lastMove.by` stuck at 0,0 means it fired and `cursorPoint()` never
       * moved.
       */
      report: () => ({
        armed: mode || "no",
        listening,
        begins,
        downs,
        moves,
        start: start ? Math.round(start.x) + "," + Math.round(start.y) : "none",
        from: start ? start.left + "," + start.top : "none",
        lastBegin,
        lastMove,
      }),
    };
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

  // --- The in-game radar ---
  //
  // Our own radar, from our own render. The client's own cannot be improved past
  // a point: MinimapRenderer#renderTiles makes one pass and reads one colour per
  // tile, so terrain type, shroud state and ownership have to partition that one
  // value instead of layering. A canvas we own has no such limit.
  //
  // This is the panel and its geometry only. What it draws on top — shroud,
  // units, tech icons, the viewport rectangle — comes next, and the questions
  // those need answered are collected by src/radar-probe.js while a match runs.

  const RADAR_LAYOUT_KEY = "cdc.radarRect";
  // A floor, not a size: below this the picture is too small for anything drawn
  // on it to mean much, and the pick buffer starts rounding several tiles into
  // one pixel.
  const RADAR_MIN = { width: 160, height: 120 };

  /**
   * The width the layered terrain render is taken at, once per map.
   *
   * A layered render costs seconds, and the panel is resizable, so the two
   * cannot be tied together -- a drag that re-rendered would freeze the match.
   * The source is therefore taken once at a width that covers any sane panel
   * and the composite scales down from it, which makes a resize a few
   * drawImages instead of a render.
   *
   * 1280 rather than the render's own ~3000: at the panel sizes this is for,
   * anything above it is detail no pixel survives to show, and the stack is
   * held in memory for the whole match. Dragging the panel wider than this in
   * device pixels upscales and goes soft, which is the right way round -- a
   * soft radar beats a stalled one.
   */
  const RADAR_SOURCE_WIDTH = 1280;

  let radarEl = null;
  let radarVisible = false;
  let radarGeo = null; // __cdcHq.geometry for the map on screen
  let radarPlaced = null; // the letterboxed picture inside the stage
  let radarDrag = null; // makeDraggable's handle, for the locked-mouse path
  let radarSource = null; // { mapFile, layers } — the untuned layered render
  let radarBacking = null; // { canvas, stamp, source } — the composited terrain
  let radarRendering = false; // a layered render is in flight
  let radarFailed = null; // { mapFile, message } — so a different map retries
  let radarPick = null; // { buffer, stamp, mapFile } — which cell each pixel is
  let radarTiles = null; // { mapFile, list } — the map's cells, walked once
  let radarTileSource = ""; // which walk found them, because one of them lies
  let radarShroud = null; // { mapFile, stride, seen, gapped, revision }
  let radarGap = null; // { canvas, stamp } — the dim a gap field puts on ground
  let radarCover = null; // { canvas, stamp } — the black the shroud paints
  let radarPickNoted = ""; // the last coverage line said, so it is said once
  let radarShroudNoted = -1; // the reveal step already reported, in 1/20ths
  let radarLastGapped = false; // whether a gap field was up when that was said
  let radarShroudOutside = false; // a cell landed off the mask, and it was named
  let radarSweepTimer = 0;

  /**
   * `ShroudFlag.Darken`, the client's only shroud flag.
   *
   * Measured rather than assumed: src/radar-probe.js read the live enum out of
   * `game/map/MapShroud` and it holds exactly one member, `Darken: 8`. All
   * three of the client's writers of it are `GapGeneratorTrait` /
   * `MapShroudTrait#markOwnGapTiles`, which is why this constant *is* the
   * gap-field test and no GAGAP building has to be found or its radius
   * computed.
   */
  const SHROUD_DARKEN = 8;

  /**
   * How often the shroud is re-swept while the panel is open.
   *
   * A few times a second, not per frame: what it costs is one pass over every
   * cell of the map, and what it buys at 60Hz over 3Hz is nothing a player can
   * see — scouting reveals ground at walking pace.
   */
  const RADAR_SWEEP_MS = 300;

  /**
   * How often the panel is repainted while it is open.
   *
   * Units move and the shroud does not, so they cannot share a cadence: a blip
   * redrawn three times a second steps across the map instead of crossing it.
   * The tick is the shorter of the two and the shroud sweep runs on every
   * RADAR_SWEEP_EVERY-th one, which keeps both on one timer -- and one timer is
   * the thing that cannot be left running after the panel closes.
   *
   * 100ms rather than a frame: a blip is drawn at its tile, and no unit in this
   * game crosses a tile in under a couple of hundred milliseconds, so the
   * frames in between would redraw the same picture. That is also why the plan's
   * rAF loop is not here -- it was written before the blip was per-tile.
   */
  const RADAR_TICK_MS = 100;
  const RADAR_SWEEP_EVERY = Math.round(RADAR_SWEEP_MS / RADAR_TICK_MS);
  /**
   * How often the ore is re-read, in ticks -- once a second.
   *
   * Far slower than the shroud on purpose. A shroud edge moves with a unit and
   * has to keep up with one; ore changes at the speed a harvester empties a
   * cell, and reading it at the shroud's rate would be `getObjectsOnTile`
   * twenty thousand times a second to watch paint dry.
   */
  const RADAR_ORE_EVERY = Math.round(1000 / RADAR_TICK_MS);
  let radarTicks = 0;
  /**
   * The radar flag as of the last tick, so a change can be told from a repeat.
   *
   * `""` rather than null: that is what `radarOffline()` answers when the radar
   * is up, and the panel is opened by a `renderRadar()` that has already read
   * the flag -- so the first tick of a panel opened over a working radar is not
   * a flip.
   */
  let radarOfflineLast = "";

  /**
   * The title bar's height — the one piece of chrome that is always there.
   *
   * `getBoundingClientRect` and not `offsetHeight`, here and everywhere else in
   * this arithmetic. The bar is 11px text at line-height 1.4 inside 2px of
   * padding, so its real height has a fraction in it; `offsetHeight` rounds that
   * away, and a rounded chrome under an exact stage height is a pixel of map
   * lost on every press of the toggle. Measured against a browser, 2026-08-28:
   * the rounded arithmetic was out by one on the first toggle.
   */
  function radarBarHeight() {
    const bar = radarEl && radarEl.querySelector(".cdc-radar-bar");
    return bar ? bar.getBoundingClientRect().height : 0;
  }

  /**
   * Everything in the panel that is not the picture: the bar, plus the drawer
   * while it is open.
   *
   * Measured off the DOM rather than read off `radarDialsOpen`, because a closed
   * drawer is `display: none` and therefore already 0 — one source instead of a
   * flag and a stylesheet that can disagree. That only became true with the
   * `display: none` now in the stylesheet; before it, `renderRadarDials()` was
   * the only thing that ever hid the drawer and `renderRadar()` returns ahead of
   * it on every refusal it has.
   */
  function radarChromeHeight() {
    const dials = radarEl && radarEl.querySelector(".cdc-radar-dials");
    return radarBarHeight() + (dials ? dials.getBoundingClientRect().height : 0);
  }

  /**
   * The panel's own border, per axis, in CSS px.
   *
   * `sizeRadarPanel` derives the panel's height from the MAP's, and the panel
   * is border-box (see the stylesheet, where the why lives), so the border is a
   * term in that sum: the map, the chrome, and the frame around both.
   *
   * `offsetWidth - clientWidth` rather than a computed style or a literal 2:
   * both are rounded from the SAME fractional content width, so the roundings
   * cancel and what is left is the border exactly, whatever the stylesheet has
   * made it.
   */
  function radarBorder() {
    if (!radarEl) return { x: 0, y: 0 };
    return {
      x: radarEl.offsetWidth - radarEl.clientWidth,
      y: radarEl.offsetHeight - radarEl.clientHeight,
    };
  }

  /**
   * How near an edge a release has to land for the panel to stick to it.
   *
   * Just over the 14px grip, so a resize that ends with the grip against the
   * edge is read as "against the edge" rather than as three pixels short of it.
   */
  const RADAR_SNAP = 16;

  /**
   * Which viewport edge a box is nearer on each axis, and the gap to it.
   *
   * The whole of the stored shape: a panel that remembers "12px in from the
   * right" keeps its right edge where the user put it when the window changes
   * size or the panel itself grows, while one that remembers `left: 1600` does
   * not. Per axis and independent, so a corner needs no case of its own.
   *
   * The nearer edge wins, ties going to left/top. Deterministic and
   * thresholdless -- at the viewport the panel was last placed in, the anchor
   * this derives puts it back in exactly the same pixels, which is what makes
   * it safe to run on read against a value written by an older build.
   *
   * Offsets are clamped non-negative, so a box already partly off screen
   * converts to one flush against the edge it went off. That jump is
   * deliberate: it is the only way back for a panel dragged out of reach.
   */
  function radarAnchorFor(box) {
    const rightGap = window.innerWidth - box.left - box.width;
    const bottomGap = window.innerHeight - box.top - box.height;
    const nearRight = rightGap < box.left;
    const nearBottom = bottomGap < box.top;
    return {
      ax: nearRight ? "right" : "left",
      dx: Math.max(0, nearRight ? rightGap : box.left),
      ay: nearBottom ? "bottom" : "top",
      dy: Math.max(0, nearBottom ? bottomGap : box.top),
    };
  }

  /**
   * The outer box a stored layout will produce, which is what an anchor has to
   * be measured against.
   *
   * The two stored sizes are not in the same box, which is why only one of them
   * has anything added: `width` goes straight into `style.width` and the panel
   * is border-box, so it IS the outer width, while `stageHeight` is the map's
   * and the panel around it is that plus the chrome and the frame — the sum
   * `sizeRadarPanel` is about to write. Getting this wrong moves the panel by
   * the size of its own border on every read of a stored layout.
   */
  function radarOuterOf(box) {
    return {
      left: box.left,
      top: box.top,
      width: box.width,
      height: box.stageHeight + radarChromeHeight() + radarBorder().y,
    };
  }

  /** A stored or defaulted `{left, top, width, stageHeight}`, as an anchor. */
  function radarAnchored(box) {
    return { ...radarAnchorFor(radarOuterOf(box)), width: box.width, stageHeight: box.stageHeight };
  }

  /**
   * The one writer of the panel's `left` and `top`.
   *
   * The position is DERIVED and never stored: the anchored edge is pinned and
   * the panel grows away from it, so a right-anchored panel that gets wider
   * grows leftwards into free space instead of pushing its own grip off the
   * screen. The clamp is the other half of it -- nothing else in this file kept
   * the panel inside the viewport, so a drag could put it somewhere with no way
   * back, and `scripts/drive-drag.mjs` had to park the panel to reach it at all.
   *
   * The size is measured off the panel as it stands rather than derived from
   * the stored numbers, so the `ResizeObserver` in `buildRadar` can call this in
   * the middle of a grip drag and have the pinned edge hold at every width the
   * drag passes through. It writes position and nothing else, which is what
   * keeps that observer from feeding itself.
   */
  function placeRadarFromAnchor(anchor) {
    if (!radarEl) return null;
    const at = anchor || radarRect();
    const box = radarEl.getBoundingClientRect();
    const put = {
      left: at.ax === "left" ? at.dx : window.innerWidth - at.dx - box.width,
      top: at.ay === "top" ? at.dy : window.innerHeight - at.dy - box.height,
    };
    put.left = Math.min(Math.max(0, put.left), Math.max(0, window.innerWidth - box.width));
    put.top = Math.min(Math.max(0, put.top), Math.max(0, window.innerHeight - box.height));
    radarEl.style.left = put.left + "px";
    radarEl.style.top = put.top + "px";
    return put;
  }

  /**
   * The stored layout, with two legacy shapes converted on the way out.
   *
   * `stageHeight` is the marker of the new shape — the height of the MAP, not of
   * the panel around it, which is what makes the bar and the drawer additive
   * (see `sizeRadarPanel`). A value without it was written by a build that stored
   * the panel's outer height, so the bar comes off it here.
   *
   * The conversion is deliberately `height - bar` and not `height - bar - border`:
   * both the old code and `sizeRadarPanel` write into `style.height`, so dropping
   * exactly the bar reproduces the previous `style.height` to the pixel and
   * nothing jumps on upgrade. The stage then measures two pixels (the panel's
   * border) under the converted number until the next drag re-measures it.
   *
   * `ax` is the marker of the second: a value without it stores an absolute
   * `left`/`top`, and is converted to the anchor nearest each edge. The two are
   * independent fields and compose, so a layout written before either change
   * passes through both on one read.
   *
   * One key, not two: a versioned key would have to live for ever in every
   * census and in `resetRadarLayout`.
   */
  function radarSavedRect() {
    let rect = null;
    try {
      const raw = localStorage.getItem(RADAR_LAYOUT_KEY);
      rect = raw ? JSON.parse(raw) : null;
    } catch (e) {
      note("stored radar layout is unreadable, ignoring it", "warn");
      return null;
    }
    if (!rect) return null;
    const stageHeight =
      typeof rect.stageHeight === "number"
        ? rect.stageHeight
        : typeof rect.height === "number"
        ? rect.height - radarBarHeight()
        : null;
    if (stageHeight === null) return null;
    if (typeof rect.ax === "string") {
      return { ax: rect.ax, dx: rect.dx, ay: rect.ay, dy: rect.dy, width: rect.width, stageHeight };
    }
    return radarAnchored({ left: rect.left, top: rect.top, width: rect.width, stageHeight });
  }

  /**
   * Persist the layout after a drag: an anchor and a picture, not a position
   * and a panel.
   *
   * `rect` arrives from `makeDraggable`'s `onUp` as the measured OUTER box, and
   * three things happen to it here.
   *
   * The anchor is taken from the box as it sits, and a gap under `RADAR_SNAP`
   * becomes 0 — which IS "snapped", with no second flag to fall out of sync
   * with the offset. On release only, and per axis, so a corner snap is nothing
   * but both axes being near an edge at once. No live highlight goes with it: a
   * real pointer lock makes every DOM hover state inert, and the settle on
   * mouseup is the feedback instead.
   *
   * The stage's own measurement is taken instead of subtracting chrome from the
   * outer height: the resize has already landed in the DOM by the time this is
   * called, so the stage can simply be asked. `height` is not written at all —
   * its absence is what tells the next read this is the new shape.
   *
   * Nothing here corrects for the border any more, and nothing should: the
   * panel is border-box, so what `makeDraggable` measured is the same box
   * `renderRadar` writes back. A correction here could not work in any case —
   * this is called for a move and for a resize alike, and it cannot tell one
   * from the other, so a term that is right for a resize would shrink the panel
   * on every move.
   *
   * The measured box is preferred over `rect` where there is one: `rect` comes
   * from `offsetLeft`/`offsetWidth` and is rounded, and a rounded gap re-derives
   * a position up to a pixel from where the panel was let go.
   */
  function storeRadarRect(rect) {
    const stage = radarEl && radarEl.querySelector(".cdc-radar-stage");
    const outer = radarEl ? radarEl.getBoundingClientRect() : rect;
    const anchor = radarAnchorFor(outer);
    const at = {
      ax: anchor.ax,
      dx: anchor.dx < RADAR_SNAP ? 0 : anchor.dx,
      ay: anchor.ay,
      dy: anchor.dy < RADAR_SNAP ? 0 : anchor.dy,
      width: outer.width,
      stageHeight: stage ? stage.getBoundingClientRect().height : rect.height - radarChromeHeight(),
    };
    // The write, the placement and the snap to the map's shape are one call,
    // because they are one decision. The grip stays FREEFORM while it is being
    // dragged -- fighting a live resize is worse than a black margin, which is
    // `placeRadarCanvas`'s own reasoning -- and the map's shape is imposed here,
    // on release, where the panel has stopped moving. That call is also what
    // makes the snapped POSITION visible on mouseup: it is the one writer of
    // `left`/`top`, and nothing here may write them itself.
    return applyRadarScale(at.stageHeight, at, true);
  }

  /**
   * Where the radar opens.
   *
   * Over the client's own radar by default, which is what calling it a clone
   * ought to mean — `minimapRect()` already knows where that is, in the same
   * pixel space this panel lives in. A drag wins over it, as everywhere else,
   * because UI scale and taste both vary.
   *
   * Both fallbacks are re-read as the STAGE's size, since that is what this
   * function now answers with. `minimapRect()` is untouched — it is shared with
   * the preview panel — so its `height` is mapped over here, and the effect is
   * that the picture matches the client radar's footprint exactly, with the bar
   * adding its own ~20px on top rather than eating into it.
   */
  function radarRect() {
    const saved = radarSavedRect();
    return saved || radarAnchored(radarFallbackRect());
  }

  /**
   * Where the panel goes with nothing stored, as a plain box.
   *
   * Split out of `radarRect` because the size dial's right button needs the same
   * answer without going through storage: "put it back" means this, and a second
   * copy of the numbers is how two surfaces start disagreeing about what the
   * default is.
   */
  function radarFallbackRect() {
    const mini = minimapRect();
    return mini
      ? { left: mini.left, top: mini.top, width: mini.width, stageHeight: mini.height }
      : {
          left: Math.max(0, window.innerWidth - 300),
          top: 60,
          width: 280,
          stageHeight: 220,
        };
  }

  /**
   * Write the panel's outer height from the height the MAP is to have.
   *
   * The one writer of `.cdc-radar`'s height, and the reason the dials drawer is
   * additive: the number that persists is the stage's, so chrome is added to it
   * rather than taken out of it, and opening the drawer grows the panel instead
   * of shrinking the picture under the user's hand.
   *
   * An outer height is still what gets written, with `.cdc-radar-stage` left at
   * `flex: 1`, rather than sizing the stage directly. That is what keeps this
   * change inside the radar: `makeDraggable`'s `onMove` writes the outer box
   * live through `applyRect` and four panels share that helper, so a flexing
   * stage absorbs those writes without the helper knowing a drawer exists.
   *
   * `RADAR_MIN.height` clamps the stage now, not the panel — a floor on the
   * picture is what it was always for.
   *
   * Returns `{before, after}`: the single point at which this panel's height
   * changes, so anchoring an edge later is a shift of `top` by the difference
   * rather than a rewrite of this.
   */
  function sizeRadarPanel(stageHeight) {
    if (!radarEl) return null;
    const before = radarEl.getBoundingClientRect().height;
    // The border is in the sum because the panel is border-box: `style.height`
    // is the OUTER height here, and the map plus the chrome is what has to fit
    // inside the frame rather than instead of it.
    radarEl.style.height =
      Math.max(RADAR_MIN.height, stageHeight) + radarChromeHeight() + radarBorder().y + "px";
    return { before, after: radarEl.getBoundingClientRect().height };
  }

  /**
   * How much of the viewport's height the size dial's top end reaches.
   *
   * A starting value, not a measured one: it is large enough to read a whole map
   * off and short of the height at which the panel owns the screen. It is a
   * dial, so moving it is one number.
   */
  const RADAR_SCALE_CAP = 0.7;

  /** The interval the size dial spans: the picture's own floor, up to that cap. */
  function radarSizeRange() {
    return [
      RADAR_MIN.height,
      Math.max(RADAR_MIN.height, Math.round(window.innerHeight * RADAR_SCALE_CAP)),
    ];
  }

  /** The picture's height at `fraction` along the size dial's track. */
  function radarSizeValue(fraction) {
    const range = radarSizeRange();
    const at = Math.min(1, Math.max(0, fraction));
    return Math.round(range[0] + at * (range[1] - range[0]));
  }

  /** Where a picture height sits along that track, 0..1 -- what the fill draws. */
  function radarSizeAt(stageHeight) {
    const range = radarSizeRange();
    const span = range[1] - range[0];
    return span ? Math.min(1, Math.max(0, (stageHeight - range[0]) / span)) : 0;
  }

  /**
   * The shape of the picture the renderer keeps for the map on screen, or 0
   * when there is no map to have one.
   *
   * `radarGeo` is `__cdcHq.geometry()`'s own answer -- the rectangle the render
   * actually keeps, `cropRect()` over the playable area plus the headroom band --
   * so this is the MAP's proportion and not a constant. When that crop tightens,
   * this tightens with it and nothing in this file changes.
   */
  function radarAspect() {
    return radarGeo && radarGeo.cropHeight ? radarGeo.cropWidth / radarGeo.cropHeight : 0;
  }

  /**
   * The panel's width for a given picture height: one degree of freedom.
   *
   * The scale IS `stageHeight`, and the width follows from the map's shape --
   * which is what kills the letterbox. `placeRadarCanvas` fits the render inside
   * the stage, so equal aspects make its margins zero by arithmetic and that
   * function needs no change at all. It stays the fallback for the case this one
   * cannot serve: with no map yet, or while the terrain is still drawing, there
   * is no aspect to follow and the stored width stands.
   *
   * The border is a term for the same reason it is one in `sizeRadarPanel`: the
   * panel is border-box, so `style.width` is the OUTER width while the aspect
   * belongs to the STAGE inside the frame. Leaving it out puts the picture two
   * pixels off its own shape and re-opens a letterbox of exactly that width.
   *
   * The clamp is `[RADAR_MIN.width, innerWidth]`: a wide map at a large scale
   * would otherwise derive a panel wider than the screen, which the placement
   * clamp could only pin against the left edge.
   */
  function radarWidthFor(stageHeight, fallbackWidth) {
    const aspect = radarAspect();
    const want = aspect ? Math.round(stageHeight * aspect) + radarBorder().x : fallbackWidth;
    return Math.min(Math.max(RADAR_MIN.width, want), Math.max(RADAR_MIN.width, window.innerWidth));
  }

  /**
   * The one place the panel's size changes, and the one writer of its width.
   *
   * The chain is the whole sizing contract in one call: derive the width from
   * the map, write it, hand the height to `sizeRadarPanel` and the position to
   * `placeRadarFromAnchor` -- the single writers of each -- and persist. Nothing
   * else in this file writes `width`, `height`, `left` or `top` on this panel.
   *
   * `at` is the anchor the panel is placed by, and the caller passes the one it
   * has already read so that a store and a placement cannot disagree. It is
   * carried through unchanged rather than re-derived from the DOM: the panel
   * grows away from its pinned edge, and re-measuring after the growth would let
   * the placement clamp move the edge the user chose.
   *
   * `persist` is off for a render. `renderRadar` runs on every tick that changes
   * anything, and a width derived from the map is not a width the user chose --
   * writing it back would overwrite the freeform fallback on every frame, and
   * that fallback is the only width a map with no readable geometry has.
   */
  function applyRadarScale(stageHeight, at, persist) {
    if (!radarEl) return null;
    const anchor = at || radarRect();
    const stage = Math.max(RADAR_MIN.height, stageHeight);
    const width = radarWidthFor(stage, anchor.width);
    radarEl.style.width = width + "px";
    sizeRadarPanel(stage);
    placeRadarFromAnchor(anchor);
    const saved = {
      ax: anchor.ax,
      dx: anchor.dx,
      ay: anchor.ay,
      dy: anchor.dy,
      width,
      stageHeight: stage,
    };
    if (persist) {
      try {
        localStorage.setItem(RADAR_LAYOUT_KEY, JSON.stringify(saved));
      } catch (e) {
        note("could not persist the radar layout", "warn");
      }
    }
    return saved;
  }

  function buildRadar() {
    const el = document.createElement("div");
    el.className = "cdc-radar";
    el.innerHTML =
      '<div class="cdc-radar-bar">' +
      '<span class="cdc-radar-title">Radar</span>' +
      '<span class="cdc-radar-at"></span>' +
      '<span class="cdc-radar-dials-toggle" title="the dials that cost no re-render">dials</span>' +
      "</div>" +
      '<div class="cdc-radar-stage">' +
      '<canvas class="cdc-radar-canvas"></canvas>' +
      '<div class="cdc-radar-empty"></div>' +
      '<div class="cdc-radar-grip" title="drag the bar to move · drag the corner to resize"></div>' +
      "</div>" +
      '<div class="cdc-radar-dials"></div>';
    chordLayer().appendChild(el);
    // One call, not two: makeDraggable puts the move listener on the *box* and
    // the resize listener on the grip, so calling it twice would give this panel
    // two move handlers racing over one drag.
    //
    // The fourth argument is what keeps that from swallowing the map. A press
    // anywhere in the box moves it, and the canvas now has a cell under every
    // pixel — so the canvas is excluded, and the bar and the letterbox margin
    // are what the panel is dragged by.
    radarDrag = makeDraggable(
      el,
      el.querySelector(".cdc-radar-grip"),
      storeRadarRect,
      ".cdc-radar-canvas"
    );

    // A resize has to reach the canvas while it is happening, and makeDraggable
    // only calls `save` on mouseup -- it has no per-move hook, and giving it one
    // would change a helper five other panels share. A ResizeObserver on the
    // stage is the smaller answer and a wider one: it also catches the UI-scale
    // changes and viewport rebuilds that move this box without anyone dragging
    // it.
    //
    // It cannot feed itself: the canvas is absolutely positioned, so resizing it
    // never changes the size of the stage being observed.
    if (typeof ResizeObserver === "function") {
      new ResizeObserver(() => {
        if (!radarVisible) return;
        // Before the canvas, and outside the `radarGeo` guard: a panel with no
        // map to draw still has an anchored edge to hold. This is what makes a
        // right-anchored panel grow leftwards under a live grip drag —
        // `applyRect` writes the pre-drag `left` and the new width, and this
        // re-derives `left` from the anchor before the frame is painted.
        placeRadarFromAnchor();
        if (!radarGeo) return;
        placeRadarCanvas();
        paintRadar();
      }).observe(el.querySelector(".cdc-radar-stage"));
    }
    return el;
  }

  // Nothing in this file re-placed a panel when the viewport changed, so an
  // anchored edge would come unstuck the moment the window was resized — and
  // entering or leaving fullscreen is a resize, which is the common case in a
  // match. One listener rather than one per panel: the other three floating
  // boxes still store an absolute position and have nothing to re-derive.
  window.addEventListener("resize", () => {
    if (!radarVisible || !radarEl) return;
    placeRadarFromAnchor();
  });

  /**
   * Fit the render's aspect inside the stage, centred.
   *
   * Letterboxed rather than stretched, and the box is not forced back to the
   * map's shape while it is being dragged: fighting a resize is worse than a
   * black margin. One uniform scale is also what keeps the pick buffer to a
   * single factor, which is what makes a click one array read.
   */
  function placeRadarCanvas() {
    if (!radarEl || !radarGeo) return null;
    const stage = radarEl.querySelector(".cdc-radar-stage");
    const canvas = radarEl.querySelector(".cdc-radar-canvas");
    const box = { width: stage.clientWidth, height: stage.clientHeight };
    if (!box.width || !box.height) return null;
    const aspect = radarGeo.cropWidth / radarGeo.cropHeight;
    let width = box.width;
    let height = Math.round(width / aspect);
    if (height > box.height) {
      height = box.height;
      width = Math.round(height * aspect);
    }
    const left = Math.round((box.width - width) / 2);
    const top = Math.round((box.height - height) / 2);
    // Backing store in device pixels, CSS size in CSS pixels. The client never
    // calls setPixelRatio, so this panel's sharpness is ours alone to get right.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    canvas.style.left = left + "px";
    canvas.style.top = top + "px";
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";
    radarPlaced = { left, top, width, height, dpr };
    return radarPlaced;
  }

  /** The map the radar is for: the live match's, else the last one parsed. */
  function radarMapFile() {
    const ui = state.combatant;
    const live = ui && ui.game && ui.game.map && ui.game.map.mapFile;
    return live || state.mapFile || null;
  }

  /**
   * Why the radar has no picture to give right now, or "" when it has one.
   *
   * One flag, read off the client: `player.radarTrait.isDisabled()`, which the
   * client's own `game/api/GameApi` publishes as
   * `radarDisabled: !!t.radarTrait?.isDisabled()`. It is set by
   * `RadarTrait#updateRadarForPlayer` when ANY of three things holds -- no
   * building with `rules.radar` that is not chrono-warped out, `powerTrait.level
   * === PowerLevel.Low`, or an enemy Lightning Storm overhead -- and not one of
   * the three is reimplemented here, on purpose. A spy reaches us through the
   * second (`AgentTrait` calls `powerTrait.setBlackoutFor` on a power plant), so
   * the one flag already covers every path that takes the game's own minimap
   * away, while a copy of the rule would be three ways to disagree with it.
   *
   * The reason this is a defect and not a preference: our picture is drawn from
   * our own render, so a panel that kept drawing while the client's minimap is
   * covered would be strictly better than the game's own -- which is the maphack
   * this whole panel is built not to be.
   *
   * **An absent trait fails closed**, and says something different when it does.
   * A live player carrying no `radarTrait` is a client that moved the flag, and
   * the constraint outranks the feature: that costs us the picture rather than
   * silently handing back the advantage.
   *
   * Out of a match there is no combatant, no flag, and nothing to gate: the
   * panel is a viewer over the last map played, which is the state every other
   * refusal here is already written for.
   */
  function radarOffline() {
    const ui = state.combatant;
    if (!ui) return "";
    const trait = ui.player && ui.player.radarTrait;
    if (!trait || typeof trait.isDisabled !== "function") {
      return "the client's radar flag could not be read";
    }
    return trait.isDisabled() ? "no radar — build one, restore power, or wait out the storm" : "";
  }

  function renderRadar() {
    if (!radarVisible) {
      if (radarEl) radarEl.style.display = "none";
      return;
    }
    if (!radarEl) radarEl = buildRadar();
    radarEl.style.display = "flex";

    const rect = radarRect();
    // Size and position in one call, because they are one derivation: the width
    // comes from the map's shape, the height from the stored picture, and the
    // anchored edge from the two of them. Not persisted -- this runs on every
    // refresh, and a width the map derived is not a width the user chose.
    applyRadarScale(rect.stageHeight, rect, false);

    const empty = radarEl.querySelector(".cdc-radar-empty");
    const canvas = radarEl.querySelector(".cdc-radar-canvas");
    const mapFile = radarMapFile();
    const hq = window.__cdcHq;

    // Each refusal says which one it is. A radar that is simply blank cannot be
    // told from a radar that is broken, and the reasons it can have nothing to
    // draw want different answers from the player.
    let reason = "";
    if (!hq || typeof hq.geometry !== "function") reason = "the renderer did not load";
    else if (!mapFile) reason = "no map yet — play a match";
    // The game's own rule, after the two rungs that are about us rather than
    // about the match: this is the one case where there IS a picture to draw
    // and drawing it is the thing forbidden.
    if (!reason) reason = radarOffline();

    if (!reason) {
      try {
        radarGeo = hq.geometry(mapFile);
      } catch (e) {
        // Not silent: geometry that throws is a renderer change, and the panel
        // saying so is how it gets noticed rather than showing an empty box.
        note(`radar geometry unreadable — ${e && e.message}`, "warn");
        reason = "the map's geometry could not be read";
      }
    }

    // The terrain behind all of it. Started from here rather than from the
    // toggle because this is the one place that knows the map is readable, and
    // it is reached again on every map change; `ensureRadarSource` is the guard
    // against starting a second one, and it calls back here when it settles.
    if (!reason) {
      if (radarFailed && radarFailed.mapFile === mapFile) {
        reason = `the terrain could not be drawn — ${radarFailed.message}`;
      } else if (radarRendering) {
        reason = "drawing the terrain…";
      } else if (!radarSource || radarSource.mapFile !== mapFile) {
        ensureRadarSource();
        reason = "drawing the terrain…";
      }
    }

    if (reason) {
      radarGeo = null;
      empty.textContent = reason;
      empty.style.display = "flex";
      canvas.style.display = "none";
      return;
    }

    empty.style.display = "none";
    canvas.style.display = "block";
    renderRadarDials();
    // A second pass, and both are needed. The one at the top ran before
    // `geometry()` had been read, so it had only the stored width to go on; by
    // here `radarGeo` is the map on screen and the drawer has been drawn, so the
    // width can follow the map's shape and the chrome the height is added to is
    // measurable. Idempotent when neither has moved, which is every render but a
    // map change and a drawer toggle.
    applyRadarScale(rect.stageHeight, rect, false);
    placeRadarCanvas();
    paintRadar();
  }

  /**
   * The order the layers are composited back in.
   *
   * Read off `TUNE_TYPES` rather than written out here, and that is the whole
   * point of taking it from there: the render's painter order, the dials the
   * options page shows and this composite are then one list, and
   * scripts/check-tune.mjs already pins that list against SPRITE_FIX. A second
   * copy kept by hand is the failure that once killed every build hotkey.
   */
  const radarLayerOrder = () =>
    window.__cdcTune ? window.__cdcTune.TUNE_TYPES.map((t) => t.key) : [];

  /**
   * The layered terrain render for the map on screen, taken once.
   *
   * Rendered **untuned** (`look: false`). The dials are applied per layer at
   * composite time instead, which is what lets a slider move over a live radar
   * without re-rendering anything -- and baking them here as well would apply
   * each one twice.
   *
   * Markless too: no ore tint, no ownership outlines, no badges, no grid and no
   * spawn blocks, the last of which the user ruled out by name. What the radar
   * draws over this is live, and a mark baked into the terrain could not be.
   */
  async function ensureRadarSource() {
    const mapFile = radarMapFile();
    const hq = window.__cdcHq;
    if (!mapFile || !hq || typeof hq.render !== "function") return null;
    if (radarSource && radarSource.mapFile === mapFile) return radarSource;
    if (radarRendering) return null;

    radarRendering = true;
    radarFailed = null;
    renderRadar(); // so the panel says what it is doing rather than sitting black
    try {
      const result = await hq.render({
        mapFile,
        layers: true,
        layerWidth: RADAR_SOURCE_WIDTH,
        look: false,
        grid: false,
        annotate: false,
        outlines: false,
        starts: false,
        open: false,
      });
      radarSource = { mapFile, layers: result.layers || {}, size: result.layerSize };
      radarBacking = null;
    } catch (e) {
      // Named, not swallowed: a radar that is simply black cannot be told from
      // one that is broken, and this panel is the only place it would surface.
      note(`radar terrain render failed — ${e && e.message}`, "warn");
      // Pinned to the map it happened on, so a broken map does not poison the
      // next one -- and so the panel does not sit retrying a render that throws.
      radarFailed = { mapFile, message: (e && e.message) || "the render threw" };
    } finally {
      radarRendering = false;
      renderRadar();
    }
    return radarSource;
  }

  /**
   * The layers composited into one canvas at the size the panel is showing.
   *
   * This exists so that the per-frame work in the slices that follow -- unit
   * blips, the viewport rectangle -- is one drawImage plus a few small fills.
   * Re-compositing eight layers every frame is the trap the alignment stage
   * already walked into once, where scaling a large stack per frame re-decoded
   * the whole of it every time.
   *
   * The dials go on here, per layer, as `ctx.filter`. That they can is measured
   * rather than hoped: scripts/probe-filter-parity.mjs put both mechanisms on a
   * real canvas and the worst opaque disagreement was 2 of 255, which is
   * Chrome's own rounding.
   *
   * Types are composited whole, in painter order, rather than interleaved by
   * depth the way the flat render draws them -- so a tree that should stand in
   * front of a building stands behind it. That is the price of keeping the
   * types apart; it shows only where two *different* types overlap, and at
   * radar scale those objects are a pixel or two wide.
   */
  function buildRadarBacking(width, height) {
    const tune = window.__cdcTune;
    if (!radarSource || width < 1 || height < 1) return null;

    const order = radarLayerOrder();
    const filters = order.map((key) => (tune ? tune.filterString(state.appearance, key) : "none"));
    // The stamp is exactly what the picture is a function of: the size it was
    // drawn at, and the filter actually applied to each layer. Built from the
    // filter strings rather than from `tuneKey` because those answer different
    // questions -- this one is "would re-compositing change these pixels", and
    // `tuneKey` is "would re-rendering change the map", which counts dials this
    // composite never reads.
    const stamp = `${width}x${height}|${filters.join(",")}`;
    if (radarBacking && radarBacking.stamp === stamp && radarBacking.source === radarSource) {
      return radarBacking;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    // Unexplored is a radar's ground state, so the canvas starts as the colour
    // the shroud layer will leave wherever it does not clear.
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);

    let drawn = 0;
    order.forEach((key, i) => {
      const layer = radarSource.layers[key];
      if (!layer) return; // a map with no bridges has no bridge layer
      ctx.filter = filters[i];
      ctx.drawImage(layer, 0, 0, width, height);
      drawn++;
    });
    ctx.filter = "none";

    radarBacking = { canvas, stamp, source: radarSource, drawn };
    return radarBacking;
  }

  /**
   * The terrain, at the size the panel is currently showing it.
   *
   * The global brightness/contrast pair goes on **here**, at the blit, and not
   * into the backing canvas -- which keeps the one rule the appearance table
   * has: the global pair is a filter over a finished picture and is never baked
   * into one. It also leaves the layers that come next, units and the viewport
   * rectangle, free to be drawn afterwards with the filter off, so an
   * annotation does not dim with the map it annotates. The badge layers over
   * the stored previews already work that way.
   */
  function paintRadar() {
    if (!radarEl || !radarGeo || !radarPlaced) return;
    const canvas = radarEl.querySelector(".cdc-radar-canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const tune = window.__cdcTune;
    // Normalised here rather than inside each layer: the blips and the cover
    // both read it, and normalising twice per paint would fill in the same
    // defaults twice for a table that has not moved.
    const look = tune ? tune.normalise(state.appearance) : null;

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.filter = "none";
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const backing = buildRadarBacking(canvas.width, canvas.height);
    if (!backing) return;
    ctx.filter = tune ? tune.globalFilter(state.appearance) : "none";
    ctx.drawImage(backing.canvas, 0, 0);
    ctx.filter = "none";

    // The ore before the blips: a mark on the ground, and a blip stands on the
    // ground. Under the units and the pictograms so neither is tinted by it, and
    // over the backing with the filter off, because it is an annotation over the
    // picture rather than part of it.
    const ore = buildRadarOre(canvas.width, canvas.height, look);
    if (ore) ctx.drawImage(ore, 0, 0);

    // The gap field dims the ground, and it goes on HERE -- over the terrain and
    // the ore, under the blips and the pictograms. That order is the feature:
    // our own generator has to read as a region without hiding what is ours
    // inside it, and the client does exactly this (it dims a tile under Darken
    // unless a techno stands on it). Over the cover it would dim unexplored
    // black to no purpose; under the blips it leaves them at full strength.
    const gap = buildRadarGap(canvas.width, canvas.height, look);
    if (gap) ctx.drawImage(gap, 0, 0);

    // Units go on before the cover and with the filter off, in that order for
    // two different reasons. Off, because a blip is an annotation and the
    // global pair is a filter over the picture it annotates — dimming both
    // equally would leave the blip exactly as hard to see. Before, because a
    // dot is drawn wider than the cell it sits on, and the cover is what clips
    // the overhang back to ground the player has actually scouted.
    drawRadarUnits(ctx, canvas, look, tune);
    // The pictograms go on with the blips rather than with the annotations: each
    // one is a statement about a building standing on a cell, so it is gated by
    // the mask and clipped by the cover exactly as a blip is.
    drawRadarIcons(ctx, canvas, window.__cdcGlyphs);

    // The shroud goes on after the blit and with the filter off. It is not
    // part of the map — it is what hides the map — so dimming it with the
    // global pair would fade the cover exactly as far as the picture beneath
    // it, and hide nothing at all.
    const cover = buildRadarCover(canvas.width, canvas.height);
    if (cover) ctx.drawImage(cover, 0, 0);

    // Last, and over the cover rather than under it — the opposite of every
    // layer above. Those are statements about cells and the cover is what clips
    // them back to ground the player has scouted; this one says where the
    // player's own camera is, which hides nothing and is worth seeing over
    // unexplored ground exactly as much as over explored.
    drawRadarViewport(ctx, canvas);
  }

  // --- the shroud -----------------------------------------------------------
  //
  // Two states, not three. Red Alert 2 has no explored-but-out-of-sight band:
  // a tile is unexplored or it is revealed, and revealed **stays** revealed --
  // `ShroudType` is {Unexplored:0, TemporaryReveal:1, Explored:2} and
  // `isShrouded(t)` is literally `getShroudType(t) === 0`.
  //
  // **Both masks mirror the live shroud; neither accumulates.** `seen` used to
  // be append-only, on the belief that the client's shroud answers "lit now"
  // and that this mask was what turned it into "has ever been seen". That
  // belief was wrong, and it was the bug. Sight writes `Explored` permanently,
  // so the client already answers "has ever been seen" -- the mask spent its
  // existence turning a persistent answer into the same persistent answer,
  // while the one thing it could not represent was the thing that mattered.
  //
  // Three paths revoke a reveal: `unrevealAround` outright, a temporary reveal
  // running out, and an enemy Gap Generator, which calls `unrevealAround` on
  // every non-allied shroud on a ~5 s refresh. An append-only mask shows none
  // of them -- a Spy Satellite dying left the map lit for ever.
  //
  // Mirroring reproduces all three and costs no special case, because the
  // temporary-reveal path is self-limiting: it only ever reverts tiles it had
  // itself promoted *from* `Unexplored`, so ground genuinely scouted survives
  // losing the satellite, exactly as RA2 does. All three read out of
  // `game/map/MapShroud` and `game/gameobject/trait/GapGeneratorTrait` at
  // v0.83.3.
  //
  // `gapped` is rebuilt every sweep and always was. What it means is settled
  // separately -- see `radarCellVisible`.

  /** The local player's shroud, or null outside a match. */
  function radarLiveShroud() {
    const ui = state.combatant;
    const game = ui && ui.game;
    const me = ui && ui.player;
    if (!game || !me || !game.mapShroudTrait) return null;
    try {
      return game.mapShroudTrait.getPlayerShroud(me) || null;
    } catch (e) {
      // Named, not swallowed: the trait moving is a client change, and a radar
      // that silently stopped hiding anything would be the worst way to find
      // that out.
      note(`could not read the player's shroud — ${e && e.message}`, "warn");
      return null;
    }
  }

  /**
   * Every cell of the live map, walked once and kept.
   *
   * **Two ways, and the panel says which one worked**, because this is exactly
   * where the probe died: `src/radar-probe.js` asked `game.map.getSize()`, got
   * null, and its tile generator returned immediately — so its whole shroud
   * section sampled nothing and still reported a verdict. `tiles.getAll()` is
   * what the renderer itself uses; `mapFile.fullSize` is the size it sizes its
   * canvas from, so both are known good from a picture that draws correctly.
   *
   * Cached per map: cells do not come and go during a match, and the fallback
   * walk is ten thousand calls that must not happen three times a second.
   */
  function radarCellList(mapFile) {
    if (radarTiles && radarTiles.mapFile === mapFile) return radarTiles.list;
    const ui = state.combatant;
    const tiles = ui && ui.game && ui.game.map && ui.game.map.tiles;
    if (!tiles) return null;

    let list = null;
    let how = "";
    if (typeof tiles.getAll === "function") {
      const all = tiles.getAll();
      if (all && all.length) {
        list = all;
        how = `tiles.getAll, ${all.length} cells`;
      }
    }
    if (!list && mapFile.fullSize && typeof tiles.getByMapCoords === "function") {
      const size = mapFile.fullSize;
      list = [];
      for (let ry = 0; ry < size.height; ry++) {
        for (let rx = 0; rx < size.width; rx++) {
          const tile = tiles.getByMapCoords(rx, ry);
          if (tile) list.push(tile);
        }
      }
      how = `getByMapCoords walk, ${list.length} cells`;
    }
    if (!list || !list.length) {
      note("the radar could not walk the map's cells — the shroud cannot be read", "warn");
      return null;
    }
    if (how !== radarTileSource) {
      radarTileSource = how;
      note(`radar shroud walks the map by ${how}`);
    }
    radarTiles = { mapFile, list };
    return list;
  }

  /**
   * One pass over the map: what has been revealed, and what a gap field covers.
   *
   * Returns whether anything moved, so a sweep that finds nothing costs one
   * loop and no repaint at all — which is what most sweeps are once a match
   * settles.
   */
  function sweepRadarShroud() {
    const shroud = radarLiveShroud();
    const mapFile = radarMapFile();
    if (!shroud || !mapFile || !radarGeo) return false;
    const list = radarCellList(mapFile);
    if (!list) return false;

    // `cellIds`, not `mapWidth * mapHeight`. The map's cells are a diamond and
    // not a rectangle, so `rx` and `ry` both run past the map's width and
    // height — see the note beside `cellId` in hq-preview.js. Sizing this array
    // by the rectangle is what put 8316 of this map's 19690 cells outside it,
    // where a write is dropped in silence and the read back is `undefined`,
    // which the cover paints black.
    const stride = radarGeo.idStride;
    if (!radarShroud || radarShroud.mapFile !== mapFile) {
      const cells = radarGeo.cellIds;
      radarShroud = {
        mapFile,
        stride,
        seen: new Uint8Array(cells),
        gapped: new Uint8Array(cells),
        revision: 0,
        // Counted as the bits are set rather than summed per sweep: the loop is
        // already here, and a second pass over ten thousand cells three times a
        // second to produce one log line would be the expensive half.
        revealed: 0,
        darkened: 0,
      };
      radarShroudNoted = -1;
      radarLastGapped = false;
      radarShroudOutside = false;
    }
    const seen = radarShroud.seen;
    const gapped = radarShroud.gapped;
    const canFlag = typeof shroud.isFlagged === "function";
    let changed = false;

    let outside = 0;
    let worst = null;
    for (const tile of list) {
      const i = radarGeo.cellId(tile.rx, tile.ry);
      // Named rather than dropped. The whole defect was a silent out-of-range
      // write: the mask kept marking cells it could not store, so `revealed`
      // climbed past the map's own cell count — 204870 of 19690 — while the
      // panel stayed black. A bound that is wrong again says so now.
      if (i < 0 || i >= seen.length) {
        outside++;
        if (!worst) worst = `${tile.rx},${tile.ry}`;
        continue;
      }
      // Mirrored, not accumulated -- the same shape as `gapped` below, and for
      // the same reason: this is a statement about the shroud as it stands
      // rather than a history of it. A bit that clears here is a reveal being
      // taken away, which is the whole of the round-2 defect.
      const lit = shroud.isShrouded(tile) ? 0 : 1;
      if (seen[i] !== lit) {
        radarShroud.revealed += lit ? 1 : -1;
        seen[i] = lit;
        changed = true;
      }
      // Rebuilt rather than accumulated, because a gap field is not history:
      // it switches off when its generator dies, and the ground under it goes
      // back to being ground already scouted.
      const dark = canFlag && shroud.isFlagged(tile, SHROUD_DARKEN) ? 1 : 0;
      if (gapped[i] !== dark) {
        radarShroud.darkened += dark ? 1 : -1;
        gapped[i] = dark;
        changed = true;
      }
    }
    if (outside && !radarShroudOutside) {
      radarShroudOutside = true;
      note(
        `radar shroud: ${outside} of ${list.length} cells fall outside the ${seen.length}-cell mask ` +
          `(first ${worst}) — the id packing is too narrow for this map`,
        "warn"
      );
    }
    if (changed) {
      radarShroud.revision++;
      noteRadarShroudProgress(list.length);
    }
    return changed;
  }

  /**
   * How much of the map the mask thinks is revealed, in twentieths.
   *
   * Not every change: scouting moves the mask several times a second and a line
   * per move would flush the event list in half a minute. A step of 5% is at
   * most twenty lines for a whole match, and that is enough to answer the only
   * question this is for — whether a black panel is a mask that never filled or
   * a picture that never showed a mask that did.
   *
   * A gap field is reported on its own, on the edge rather than by size: a
   * field switching on is a visible change in what the panel hides, and it is
   * the one shroud state a player can be surprised by.
   */
  function noteRadarShroudProgress(cells) {
    const step = cells ? Math.floor((radarShroud.revealed * 20) / cells) : 0;
    const gapped = radarShroud.darkened > 0;
    if (step === radarShroudNoted && gapped === radarLastGapped) return;
    radarShroudNoted = step;
    radarLastGapped = gapped;
    note(
      `radar shroud: ${radarShroud.revealed} of ${cells} cells revealed, ` +
        `${radarShroud.darkened} under a gap field`
    );
  }

  /**
   * The black that hides what has not been scouted, as one canvas to blit.
   *
   * **Drawn through the pick buffer, not rasterised again.** The mask is per
   * cell and the picture is per pixel; the pick buffer is exactly the map from
   * one to the other, and it is already built and already invalidated on
   * resize. So this is one pass over an array with no geometry in it at all,
   * and the shroud's edge follows the same cell boundaries a click does — it
   * cannot disagree with the picture, because it is derived from it.
   *
   * Rebuilt only when the mask moved or the dial did: `revision` counts the
   * former and most sweeps do not bump it.
   */
  function buildRadarCover(width, height) {
    if (!radarShroud) return null;
    const tune = window.__cdcTune;
    const look = tune ? tune.normalise(state.appearance) : null;
    const pick = ensureRadarPick();
    if (!pick || pick.width !== width || pick.height !== height) return null;
    const dim = look ? look.shroudDim : 0;

    const stamp = `${width}x${height}|${radarShroud.revision}|${dim}`;
    if (radarCover && radarCover.stamp === stamp) return radarCover.canvas;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(width, height);
    const px = image.data;
    const seen = radarShroud.seen;

    for (let i = 0; i < pick.ids.length; i++) {
      const id = pick.ids[i];
      // Off the map -- the headroom band above the top row -- is covered for the
      // same reason unexplored is: there is nothing there to have scouted.
      // A gap field is NOT one of these cases any more; it has its own layer.
      const alpha = id < 0 || !seen[id] ? 255 : 0;
      // Only alpha is written; the three colour bytes stay 0, which is black.
      px[i * 4 + 3] = alpha;
    }
    ctx.putImageData(image, 0, 0);
    radarCover = { canvas, stamp };
    return canvas;
  }

  /**
   * The dimming a gap field puts on the ground it covers.
   *
   * **A layer of its own, drawn under the blips**, which is the whole point:
   * this is the client's own rule. Its radar dims a tile under `ShroudFlag.
   * Darken` to 35% *unless a techno stands on it*, in which case it draws the
   * techno at full colour. Ours reaches the same result more cheaply -- dim the
   * ground, then draw the blips over it -- and without rebuilding a per-pixel
   * buffer every time a unit moves, which is what a techno-aware cover would
   * cost at three sweeps a second.
   *
   * Only ground already scouted is dimmed. Unexplored ground is opaque black
   * from the cover regardless, and dimming it would be arithmetic nobody sees.
   *
   * `shroudDim` is how much of the picture the field lets through: the default
   * is the client's own 0.35, 1 hides the field entirely, and 0 puts back the
   * pre-1.16.2 behaviour of a field indistinguishable from never-scouted.
   */
  function buildRadarGap(width, height, look) {
    if (!radarShroud || !radarShroud.darkened) return null;
    const pick = ensureRadarPick();
    if (!pick || pick.width !== width || pick.height !== height) return null;
    const dim = look ? look.shroudDim : 0;
    const alpha = Math.round(255 * (1 - dim));
    if (!alpha) return null;

    const stamp = `${width}x${height}|${radarShroud.revision}|${dim}`;
    if (radarGap && radarGap.stamp === stamp) return radarGap.canvas;

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const image = ctx.createImageData(width, height);
    const px = image.data;
    const seen = radarShroud.seen;
    const gapped = radarShroud.gapped;

    for (let i = 0; i < pick.ids.length; i++) {
      const id = pick.ids[i];
      if (id < 0 || !seen[id] || !gapped[id]) continue;
      px[i * 4 + 3] = alpha;
    }
    ctx.putImageData(image, 0, 0);
    radarGap = { canvas, stamp };
    return canvas;
  }

  // --- the ore ----------------------------------------------------------------
  //
  // The ore and gem patches, marked on the radar the way they are marked on the
  // previews -- and the one layer here whose colour is a live setting rather
  // than a baked one.
  //
  // **Read from the match, not from the map file.** This used to walk
  // `mapFile.overlays`, which is the ore the map *starts* with: a field mined
  // flat by hour two stayed on the radar for the rest of the game, and ore that
  // regrew from a drill never appeared at all. The live source is the client's
  // own, out of `MinimapModel` at v0.83.3 -- `tileOccupation.getObjectsOnTile`,
  // then an object that is an overlay and answers `isTiberium()`. Ore and gems
  // are told apart by `overlayId`, which is the SAME id space the map file uses
  // (`Overlay#isTiberium` is itself a lookup on it), so `__cdcHq.oreKindFor`
  // classifies a running match with the ranges that already classify a stored
  // map. One table, no drift.
  //
  // **Why the marks are not simply in the picture.** They are, on a stored
  // preview: `drawOreFields` fills each patch into the render's `marks` surface
  // at the colour in force when it ran. That is right for a picture written to
  // disk and wrong for this one -- the radar takes **one** layered render per
  // map and keeps it for the whole match, so a tint baked into it would be a
  // colour that could not change without a re-render measured in seconds, in
  // the middle of a game. The radar's own source is rendered `annotate: false`
  // for exactly that reason.
  //
  // **Walked on its own clock.** Ore moves, but it moves at the speed a
  // harvester works, so re-reading every cell three times a second would be
  // `getObjectsOnTile` twenty thousand times a second to watch paint dry. The
  // ore rides the sweep at a divisor of its own, and the picture is rebuilt only
  // when a cell actually changed -- `revision`, the same mechanism the cover
  // uses, for the same reason.
  //
  // **Not gated by the shroud mask, and that is not an oversight.** The layer
  // goes on before the cover, which paints opaque black over every cell the
  // player has not scouted -- so the mask clips it exactly as it clips a blip,
  // one blit later and without this loop having to ask.
  //
  // **Filter off, like every other mark.** The backing is blitted under the
  // global brightness/contrast pair because it is the picture; a mark over it is
  // an annotation, and one dimmed exactly as far as the map beneath it is
  // exactly as hard to read. `oreAlpha` is the dial for how strongly it reads.

  let radarOre = null; // { canvas, stamp, mapFile }
  let radarOreMask = null; // { mapFile, cells, revision, ore: [], gems: [] }

  const ORE_NONE = 0;
  const ORE_ORE = 1;
  const ORE_GEMS = 2;

  /**
   * Which kind of ore stands on a cell right now, as one of the codes above.
   *
   * Gems win a cell they share with ore, which is the order the render draws
   * them in and for the same reason: a gem patch embedded in an ore field has to
   * keep its own colour.
   */
  function radarOreOn(tile, occupation, hq) {
    const on = occupation.getObjectsOnTile(tile);
    if (!on) return ORE_NONE;
    let found = ORE_NONE;
    for (const obj of on) {
      if (!obj || typeof obj.isOverlay !== "function" || !obj.isOverlay()) continue;
      if (typeof obj.isTiberium !== "function" || !obj.isTiberium()) continue;
      const kind = hq.oreKindFor(obj.overlayId);
      if (kind === "gems") return ORE_GEMS;
      if (kind === "ore") found = ORE_ORE;
    }
    return found;
  }

  /**
   * One pass over the map's cells for the ore standing on them.
   *
   * Returns whether anything moved, so a walk that finds the ore where it left
   * it costs one loop and no repaint -- which is most walks, since a harvester
   * empties a cell every few seconds and the map has twenty thousand of them.
   *
   * The cell lists are rebuilt only when something changed: the builder needs
   * coordinates and the mask is indexed by packed id, which cannot be inverted.
   */
  function sweepRadarOre() {
    const mapFile = radarMapFile();
    const ui = state.combatant;
    const game = ui && ui.game;
    const occupation = game && game.map ? game.map.tileOccupation : null;
    const hq = window.__cdcHq;
    if (!mapFile || !radarGeo || !occupation) return false;
    if (!hq || typeof hq.oreKindFor !== "function") return false;
    const list = radarCellList(mapFile);
    if (!list) return false;

    if (!radarOreMask || radarOreMask.mapFile !== mapFile) {
      radarOreMask = {
        mapFile,
        cells: new Uint8Array(radarGeo.cellIds),
        revision: 0,
        ore: [],
        gems: [],
      };
    }
    const cells = radarOreMask.cells;
    const ore = [];
    const gems = [];
    let changed = false;

    for (const tile of list) {
      const i = radarGeo.cellId(tile.rx, tile.ry);
      // Out of range is the shroud sweep's story to tell -- it names the same
      // cells, in a warning this loop would only duplicate.
      if (i < 0 || i >= cells.length) continue;
      const kind = radarOreOn(tile, occupation, hq);
      if (cells[i] !== kind) {
        cells[i] = kind;
        changed = true;
      }
      if (kind === ORE_ORE) ore.push(tile);
      else if (kind === ORE_GEMS) gems.push(tile);
    }

    if (changed) {
      radarOreMask.ore = ore;
      radarOreMask.gems = gems;
      radarOreMask.revision++;
    }
    return changed;
  }

  function buildRadarOre(width, height, look) {
    if (!radarOreMask || !radarGeo || !look) return null;
    // The revision is in the stamp, which is what makes this live: without it
    // the first picture of a map would be kept for the whole match, which is
    // the defect this section exists to fix.
    const stamp = `${width}x${height}|${look.ore}|${look.gems}|${look.oreAlpha}|${radarOreMask.revision}`;
    if (radarOre && radarOre.stamp === stamp && radarOre.mapFile === radarOreMask.mapFile) {
      return radarOre.canvas;
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    const geo = radarGeo;
    const sx = width / geo.cropWidth;
    const sy = height / geo.cropHeight;
    const cellW = geo.block.width * sx;
    const cellH = geo.block.height * sy;
    ctx.globalAlpha = look.oreAlpha;
    // Gems after ore, for the reason the render draws them in that order: a gem
    // patch embedded in an ore field has to keep its own colour.
    for (const kind of ["ore", "gems"]) {
      const list = radarOreMask[kind];
      if (!list || !list.length) continue;
      ctx.fillStyle = look[kind];
      ctx.beginPath();
      for (const cell of list) {
        const at = geo.cellAt(cell.rx, cell.ry, cell.z);
        const left = (at.x - geo.view.x) * sx;
        const top = (at.y - geo.view.y) * sy;
        // The cell's own diamond, and one path for the whole field: filling cell
        // by cell leaves a lattice of seams down every shared edge, which on a
        // patch this size is most of what you would see.
        ctx.moveTo(left + cellW / 2, top);
        ctx.lineTo(left + cellW, top + cellH / 2);
        ctx.lineTo(left + cellW / 2, top + cellH);
        ctx.lineTo(left, top + cellH / 2);
        ctx.closePath();
      }
      ctx.fill();
    }
    radarOre = { canvas, stamp, mapFile: radarOreMask.mapFile };
    return canvas;
  }

  // --- the units ------------------------------------------------------------
  //
  // Drawn from the world's own object list and gated by the same mask the cover
  // paints. Two rules govern every line below, and both are the client's rather
  // than ours -- read out of `engine/renderable/entity/map/MinimapModel` in
  // v0.83.3, which is the whole of the native radar's unit layer:
  //
  //   - **a cell the mask has not revealed is never drawn on.** Not the object,
  //     the *cell*: a building whose footprint straddles the shroud edge shows
  //     only the half that has been scouted, which is what the native radar
  //     does. `radarCellVisible` is that gate, and it is the one thing here
  //     that keeps this a radar rather than a maphack -- so it reads our own
  //     mask, not `isShrouded`, and a panel with no mask yet draws nothing at
  //     all rather than everything.
  //   - **a colour is read, never constructed.** `owner.color` is a live object
  //     the recolour feature writes into, and with sprite batching on a voxel
  //     builder resolves palettes by content hash against `rules.colors` -- an
  //     invented colour is not a wrong shade, it is a throw inside the client's
  //     render loop. See applyRecolour.
  //
  // Cloak and disguise are where "what we can see" and "what the player may
  // see" part company, and each is two property reads: the client skips a
  // cloaked techno unless the viewer has shared intel with its owner, and
  // paints a disguised one in the *disguise's* colour. Omitting either would
  // turn the radar into a maphack in the two places it matters most.

  /**
   * The client's own radar colours for the things that are not drawn in their
   * owner's colour, from MinimapModel v0.83.3.
   *
   * A wall takes a fixed colour rather than its builder's, which is why a wall
   * line on the native radar reads as terrain and not as an army. The four
   * named ones are the client's exceptions to that; everything else with
   * `rules.wall` takes the default.
   */
  const RADAR_WALL_COLOURS = {
    CAKRMW: "#6b4531",
    CAFNCW: "#ffffff",
    CAFNCB: "#000000",
    GASAND: "#524d39",
  };
  const RADAR_WALL_DEFAULT = "#5a5952";
  // What the client paints a techno it will not identify: a disguise with no
  // owner behind it, which is the terrain disguise a mirage tank wears.
  const RADAR_TERRAIN_COLOUR = "#adaa84";

  // Colour objects are shared -- `rules.colors` hands back the same instance to
  // every player who picked that colour -- so this is at most one entry per
  // player per match, and it exists to keep a per-tick loop from building a few
  // hundred identical strings a second.
  const radarColours = new Map();

  let radarUnitsNoted = ""; // the last shape of the unit count that was said

  /** `#rrggbb` for a client Color, or null. Read, never built. */
  function radarOwnerColour(colour) {
    if (!colour) return null;
    const known = radarColours.get(colour);
    if (known) return known;
    if (typeof colour.asHexString !== "function") return null;
    const hex = colour.asHexString();
    radarColours.set(colour, hex);
    return hex;
  }

  /**
   * Whether two players share intel, and **false when the question cannot be
   * asked**.
   *
   * The direction matters. This answer only ever un-hides something -- a
   * cloaked unit, a disguise's real owner -- so the safe default when the
   * client's alliance table has moved is the one that keeps hiding it. An
   * ally's submarine going missing from our own radar is a cosmetic bug; the
   * other way round is a cheat.
   */
  function radarSharedIntel(alliances, me, them) {
    if (!alliances || !me || !them) return false;
    if (typeof alliances.haveSharedIntel !== "function") return false;
    return !!alliances.haveSharedIntel(me, them);
  }

  /**
   * What colour a techno reads as on the radar, or null for one the radar must
   * not draw at all.
   *
   * The client's own decision tree, in its own order, because the order is
   * load-bearing: a wall is a wall before it is anyone's building, and a cloak
   * hides an object before its disguise gets to lie about it.
   */
  function radarBlipColour(obj, me, alliances) {
    const rules = obj.rules || {};
    // The client's admission test, restricted to technos (it also admits
    // overlays, terrain and bridges, which our terrain render already draws).
    // A radar-invisible building is still shown when it can be garrisoned and
    // a combatant holds it -- that is how an occupied civilian building reads
    // as a threat on the native radar.
    const shown =
      !obj.radarInvisible ||
      (obj.isBuilding() &&
        !rules.invisibleInGame &&
        !!rules.canBeOccupied &&
        !!obj.owner &&
        typeof obj.owner.isCombatant === "function" &&
        obj.owner.isCombatant());
    if (!shown) return null;
    if (rules.wall) return RADAR_WALL_COLOURS[obj.name] || RADAR_WALL_DEFAULT;

    const cloak = obj.cloakableTrait;
    if (
      cloak &&
      typeof cloak.isCloaked === "function" &&
      cloak.isCloaked() &&
      me &&
      !radarSharedIntel(alliances, me, obj.owner)
    ) {
      return null;
    }

    const wears = obj.disguiseTrait;
    const disguise =
      (obj.isInfantry() || obj.isVehicle()) && wears && typeof wears.getDisguise === "function"
        ? wears.getDisguise()
        : null;
    if (
      me &&
      disguise &&
      !radarSharedIntel(alliances, me, obj.owner) &&
      !(me.sharedDetectDisguiseTrait && me.sharedDetectDisguiseTrait.has(obj))
    ) {
      return disguise.owner ? radarOwnerColour(disguise.owner.color) : RADAR_TERRAIN_COLOUR;
    }
    return obj.owner ? radarOwnerColour(obj.owner.color) : null;
  }

  /**
   * Whether the player has scouted this cell, by our mask rather than the
   * client's shroud.
   *
   * **A gap field is not asked about here, and that is the round-2 fix.** This
   * used to be `seen && !gapped`, which blinded the player with their OWN
   * generator: `ShroudFlag.Darken` on a player's shroud can only ever be their
   * own field or an ally's. Both writers are gated on ownership --
   * `MapShroudTrait#markOwnGapTiles` and
   * `GapGeneratorTrait#markGapTilesForFriendlies` -- and an ENEMY generator
   * sets no flag on us at all: it calls `unrevealAround` on every non-allied
   * shroud, so an enemy field arrives as ordinary unexplored ground and is
   * already handled by `seen` alone.
   *
   * So the earlier instruction that a live field counts as unexplored is still
   * honoured, by the only mechanism that ever implemented it. What changes is
   * that our own field no longer hides what is ours to see -- the user's words,
   * and the client's own behaviour: its radar draws a techno under `Darken` at
   * full colour and dims only the ground.
   *
   * The field is still *visible*: `buildRadarGap` dims the ground under it,
   * under the blips rather than over them, so the zone reads as a region while
   * what stands in it stays legible.
   *
   * It also means turning the shroud layer off cannot leak a unit position: the
   * dial stops the cover being painted, and this is not the cover.
   */
  function radarCellVisible(tile) {
    const i = radarGeo.cellId(tile.rx, tile.ry);
    const seen = radarShroud.seen;
    if (i < 0 || i >= seen.length) return false;
    return !!seen[i];
  }

  /**
   * The cells an object stands on.
   *
   * A 1x1 foundation is the overwhelming majority of the objects on a map and
   * its answer is its own tile, so the client's allocating call is kept for the
   * few that need it rather than made a few hundred times a tick.
   */
  function radarObjectCells(obj, occupation) {
    const foundation = typeof obj.getFoundation === "function" ? obj.getFoundation() : null;
    if (!foundation || (foundation.width === 1 && foundation.height === 1)) return [obj.tile];
    if (!occupation || typeof occupation.calculateTilesForGameObject !== "function") return [obj.tile];
    return occupation.calculateTilesForGameObject(obj.tile, obj) || [obj.tile];
  }

  /**
   * Every techno in the world, walked fresh.
   *
   * No subscription and no cache: `world.getAllObjects` is one array of the
   * map's objects and the walk is a type test each, which at the panel's tick
   * rate is nothing beside the shroud sweep it shares a timer with. The cost of
   * the alternative is a spawn/remove subscription that has to be torn down
   * with the match, and a stale entry in it draws a dead unit.
   */
  function radarTechnos() {
    const ui = state.combatant;
    const game = ui && ui.game;
    const world = game && typeof game.getWorld === "function" ? game.getWorld() : null;
    if (!world || typeof world.getAllObjects !== "function") return null;
    const out = [];
    for (const obj of world.getAllObjects()) {
      if (typeof obj.isTechno !== "function" || !obj.isTechno()) continue;
      if (obj.isDestroyed || !obj.isSpawned || !obj.tile) continue;
      out.push(obj);
    }
    return out;
  }

  /**
   * The blips, straight onto the radar canvas in canvas pixels.
   *
   * Buildings get their footprint and units a dot, which is the one place this
   * departs from the native radar on purpose: our cell is an isometric diamond
   * roughly four pixels by two at a usable panel size, and a single one of them
   * is not a thing a player can see. The dot is sized from the cell so it
   * follows a resize, with a floor so it survives the smallest panel.
   *
   * `look` is the appearance table and `tune` the arithmetic that reads it, both
   * handed in rather than reached for: this section is sliced out of the file and
   * executed against a stub game by scripts/check-radar.mjs, and a global it
   * closed over would be a global that check would have to invent.
   *
   * The blips are the last layer in the table to get a dial, and they get their
   * own pair because nothing else in it can reach them -- they are drawn with
   * `ctx.filter` off, on purpose, since a blip dimmed exactly as far as the map
   * under it is exactly as hard to see. So the brightness dial reaches the
   * *colour*, through the same `channel` arithmetic the palette bake uses.
   */
  function drawRadarUnits(ctx, canvas, look, tune) {
    // Fail closed. No geometry, no mask, or a mask for another map means there
    // is nothing that can say which ground has been scouted -- and a blip drawn
    // without that is a unit position the player has not earned.
    if (!radarGeo || !radarShroud) return;
    const mapFile = radarMapFile();
    if (!mapFile || radarShroud.mapFile !== mapFile) return;
    const list = radarTechnos();
    if (!list || !list.length) return;

    const ui = state.combatant;
    const me = ui ? ui.player : null;
    const game = ui ? ui.game : null;
    const alliances = game ? game.alliances : null;
    const occupation = game && game.map ? game.map.tileOccupation : null;

    const geo = radarGeo;
    const sx = canvas.width / geo.cropWidth;
    const sy = canvas.height / geo.cropHeight;
    const cellW = geo.block.width * sx;
    const cellH = geo.block.height * sy;
    // A dial, not a new default. The multiplier is 1 out of the box, so this is
    // the expression it has always been until someone moves it.
    //
    // The floor is applied *after* the multiplier rather than before it: two
    // pixels is there so a blip survives the smallest panel, and a size dial
    // that could take a blip below it would be a switch that hides units, which
    // is not what a legibility dial is for.
    const units = look ? look.units : { size: 1, brightness: 1 };
    const dot = Math.max(2, (cellW / 2.5) * units.size);
    // Resolved once per paint rather than per blip, and the identity case is the
    // identity *function* rather than a call that computes it: this runs a few
    // hundred times a tick on a full map.
    const tint =
      tune && units.brightness !== 1
        ? (hex) => tune.tuneHex(hex, units.brightness, 1)
        : (hex) => hex;

    let drawn = 0;
    let hidden = 0;
    let unidentified = 0;
    let disguised = 0;

    for (const obj of list) {
      const colour = radarBlipColour(obj, me, alliances);
      if (!colour) {
        unidentified++;
        continue;
      }
      // Counted off the trait rather than off the colour: a wall also comes
      // back in a colour that is not its owner's, and calling that a disguise
      // would make the one number that says the disguise read is wired to
      // something say it about every fence on the map.
      const wearing = obj.disguiseTrait;
      if (wearing && typeof wearing.getDisguise === "function" && wearing.getDisguise()) disguised++;
      const cells = radarObjectCells(obj, occupation);
      const building = obj.isBuilding();
      let painted = 0;
      ctx.fillStyle = tint(colour);
      if (building) ctx.beginPath();
      for (const cell of cells) {
        if (!cell || !radarCellVisible(cell)) continue;
        painted++;
        const at = geo.cellAt(cell.rx, cell.ry, cell.z);
        const left = (at.x - geo.view.x) * sx;
        const top = (at.y - geo.view.y) * sy;
        if (building) {
          // The cell's own diamond, so a footprint reads as the shape it has on
          // the map. One path for the whole building: filling cell by cell
          // leaves a lattice of seams along the shared edges.
          ctx.moveTo(left + cellW / 2, top);
          ctx.lineTo(left + cellW, top + cellH / 2);
          ctx.lineTo(left + cellW / 2, top + cellH);
          ctx.lineTo(left, top + cellH / 2);
          ctx.closePath();
        } else {
          ctx.fillRect(left + cellW / 2 - dot / 2, top + cellH / 2 - dot / 2, dot, dot);
        }
      }
      if (building && painted) ctx.fill();
      if (painted) drawn++;
      else hidden++;
    }

    noteRadarUnits(list.length, drawn, hidden, unidentified, disguised);
  }

  /**
   * Say what the unit layer did, when what it did changes shape.
   *
   * Not a count per tick -- that would flush the event list in seconds -- and
   * not a percentage step either, because the question this has to answer is
   * not "how many" but "is this layer alive at all". So the line goes out when
   * one of its four numbers crosses zero in either direction: the first blip
   * ever drawn, a layer that has gone silent while the world is still full, and
   * the first time a cloak or a disguise actually gates something. That last
   * pair is the only evidence available that the two reads which keep this from
   * being a maphack are wired to anything.
   */
  function noteRadarUnits(walked, drawn, hidden, unidentified, disguised) {
    const shape = `${walked ? 1 : 0}${drawn ? 1 : 0}${hidden ? 1 : 0}${unidentified ? 1 : 0}${disguised ? 1 : 0}`;
    if (shape === radarUnitsNoted) return;
    radarUnitsNoted = shape;
    note(
      `radar units: ${drawn} of ${walked} technos drawn, ${hidden} on unscouted ground, ` +
        `${unidentified} not drawn (cloaked, radar-invisible or ownerless), ${disguised} disguised`
    );
  }

  // --- tech-building pictograms ---------------------------------------------
  //
  // Inside the unit layer's window on purpose. `// --- the units ---` to
  // `// --- the tick ---` is what scripts/check-radar.mjs slices out and
  // *executes*, and these three functions call `radarCellVisible`,
  // `radarObjectCells` and `radarOwnerColour` -- a second window would either
  // have to duplicate them or hand them in, and a slice that cannot call the
  // gate is a slice that cannot prove it is gated. The two section headers stay
  // exactly as they are: moving or renaming either silently empties every
  // assertion below and the suite still prints green.
  //
  // The marks are the ones the stored map previews already carry -- src/glyphs.js
  // is the one copy, and it is handed in rather than reached for so this window
  // stays executable outside a browser. A player who learned "droplet = oil
  // derrick" off a preview reads the radar without learning it twice.
  //
  // **No spawn marks.** The user ruled them out by name, and the terrain render
  // under this is taken with `starts: false` for the same reason.

  /**
   * How big a pictogram is drawn, as a fraction of the panel's width.
   *
   * Not derived from the cell: a cell is about five pixels across at a usable
   * panel size and a five-pixel glyph is a smudge. This is the *thumbnail's* own
   * proportion -- `iconSize: 18` over a 400px picture -- carried across rather
   * than invented, because the thumbnail is the other place these marks have to
   * read at small size and someone already tuned it there by eye.
   *
   * The bounds are in device pixels and exist for the two ends of the resize: a
   * 160px panel must still show a mark, and a panel dragged across the screen
   * must not show six enormous ones.
   */
  const RADAR_ICON_FRACTION = 0.045;
  const RADAR_ICON_MIN = 9;
  const RADAR_ICON_MAX = 34;

  let radarIconsNoted = -1; // the last count said, so a settled map says nothing

  /**
   * Which pictogram a live object is worth marking with, or "" for none.
   *
   * `rules.needsEngineer` is the gate, and it is the client's own tech marker
   * rather than a name list of ours: `PowerTrait.isCapturablePower` is
   * `0 < rules.power && owner.isNeutral && rules.needsEngineer`, `Game` hands
   * `returnable && needsEngineer` buildings back to the civilian player when
   * their owner is defeated, and `AttackTrait` uses it to stop units acquiring
   * neutral tech. Read out of v0.83.3.
   *
   * **Not `rules.capturable`**, which the renderer's map-file gate uses. That one
   * is read off a structure in a *map file*, where the alternative is scenery;
   * on a live object it is also true of an ordinary war factory, because an
   * engineer can take one. Gating on it would put a pictogram on every building
   * on the map.
   *
   * The fallback is `marker`, exactly as `iconFor` in hq-preview.js: a tech
   * structure this build has no drawing for is marked rather than dropped.
   */
  function radarTechGlyph(obj, glyphs) {
    if (typeof obj.isBuilding !== "function" || !obj.isBuilding()) return "";
    const rules = obj.rules || {};
    if (!rules.needsEngineer) return "";
    return glyphs.BUILDING_ICONS[obj.name] || "marker";
  }

  /**
   * The pictograms, over the blips and under the cover.
   *
   * Under the cover for the blips' reason: a glyph is drawn far wider than the
   * cell it marks, and the cover is what clips the overhang back to ground the
   * player has scouted. That is the opposite of the viewport rectangle, which is
   * an annotation over the whole finished picture rather than a statement about
   * one cell.
   *
   * Its own walk of the world rather than a list threaded through from the blips:
   * the walk is a type test over the few dozen objects a match holds, which at
   * this tick rate is nothing beside the shroud sweep on the same timer, and two
   * independent layers are worth more than one shared loop.
   *
   * Colour follows the render's own rule -- white while nobody owns it, the
   * owner's colour once somebody does -- and falls back to white whenever that
   * cannot be answered. White is the one colour that never means a player.
   */
  function drawRadarIcons(ctx, canvas, glyphs) {
    // Fail closed, exactly as the blips do: no mask means no marks, because a
    // pictogram is a statement about a building the player may not have found.
    if (!glyphs || typeof glyphs.drawGlyph !== "function") return;
    if (!radarGeo || !radarShroud) return;
    const mapFile = radarMapFile();
    if (!mapFile || radarShroud.mapFile !== mapFile) return;
    const list = radarTechnos();
    if (!list || !list.length) return;

    const ui = state.combatant;
    const game = ui ? ui.game : null;
    const occupation = game && game.map ? game.map.tileOccupation : null;

    const geo = radarGeo;
    const sx = canvas.width / geo.cropWidth;
    const sy = canvas.height / geo.cropHeight;
    const size = Math.min(RADAR_ICON_MAX, Math.max(RADAR_ICON_MIN, canvas.width * RADAR_ICON_FRACTION));

    let drawn = 0;
    for (const obj of list) {
      const glyph = radarTechGlyph(obj, glyphs);
      if (!glyph) continue;
      // The layer's own admission test, and deliberately not `radarBlipColour`:
      // that one answers with a colour, and an uncaptured tech building is owned
      // by the civilian player, whose colour is not ours to depend on. What is
      // shared is the *gate* below, which is the part that keeps this honest.
      if (obj.radarInvisible) continue;

      // Centred on the cells that have been scouted rather than on the whole
      // footprint: a building straddling the shroud edge is marked over the half
      // the player has actually seen, which is where the blip is too.
      let sumX = 0;
      let sumY = 0;
      let seen = 0;
      for (const cell of radarObjectCells(obj, occupation)) {
        if (!cell || !radarCellVisible(cell)) continue;
        const at = geo.cellAt(cell.rx, cell.ry, cell.z);
        sumX += (at.x + geo.block.width / 2 - geo.view.x) * sx;
        sumY += (at.y + geo.block.height / 2 - geo.view.y) * sy;
        seen++;
      }
      if (!seen) continue;

      const owner = obj.owner;
      const owned = owner && typeof owner.isCombatant === "function" && owner.isCombatant();
      const colour = (owned && radarOwnerColour(owner.color)) || glyphs.ICON_NEUTRAL;
      glyphs.drawGlyph(ctx, glyph, sumX / seen, sumY / seen, glyphs.glyphBox(glyph, size), colour);
      drawn++;
    }

    noteRadarIcons(drawn);
  }

  /**
   * Say how many tech buildings the radar is marking, when that number changes.
   *
   * A count rather than the blips' shape test, because this one is small and
   * meaningful: it goes up when a building is scouted and down when one is
   * destroyed, and both are events worth a line. A settled map says nothing.
   */
  function noteRadarIcons(drawn) {
    if (drawn === radarIconsNoted) return;
    radarIconsNoted = drawn;
    note(`radar tech icons: ${drawn} marked`);
  }

  // --- the viewport rectangle -----------------------------------------------
  //
  // Where the camera is looking, drawn over the finished picture. The one layer
  // here that is **not** gated by the shroud, and that is not an oversight: it
  // says where the player's own camera is, which the player already knows. It
  // is also why it goes on *after* the cover, the opposite way round from the
  // blips and the pictograms -- those are statements about cells and the cover
  // is what clips them back to scouted ground; this is an annotation over the
  // whole map.
  //
  // **The camera's pan is a point in the client's screen space, and our render
  // draws in the same one.** That is the finding this slice rests on, and it is
  // what makes the rectangle a translation rather than an inverse-geometry
  // problem. Read out of the bundle at v0.83.3:
  //
  //   MapPanningHelper#computeCameraPanFromScreen(p)
  //     = { x: floor(p.x - o.x), y: floor(p.y - o.y) },  o = IsoCoords.worldToScreen(0,0)
  //   IsoCoords.worldToScreen(x, y)  -- with Coords.ISO_TILE_SIZE = 30
  //     puts tile (rx, ry) at { 30*(rx-ry), 15*(rx+ry) } once o is subtracted,
  //   IsoCoords.tile3dToScreen(rx, ry, z)  subtracts a further 15*z.
  //
  // Our own `cellOrigin` is `dx = rx-ry + W-1`, `dy = rx+ry - W-1`, scaled by
  // `BLOCK.width/2 = 30` and `BLOCK.height/2 = 15`, lifted by the same `15*z`
  // and pushed down by `headroom`. Both spaces therefore share one pixel scale
  // **and** one elevation lift, so the difference between them is a constant:
  //
  //   ourX = pan.x + 30*W          ourY = pan.y - 15*(W+1) + headroom
  //
  // The elevation cancels, which is the part worth stating: nothing here has to
  // ask what the tile under the camera is standing on, and nothing has to invert
  // the ambiguous picture-to-cell mapping the pick buffer exists for.
  //
  // **The pan is the viewport's CENTRE, not its corner.** Not visible in
  // `setPan`; fixed by the only place the inverse is written out,
  // `MapTileIntersectHelper#intersectTilesByScreenPos`:
  // `screen = viewportPoint + o + pan - viewportSize/2`, which at the viewport's
  // middle is exactly `o + pan`. `computeCameraPanLimits` corroborates it by
  // offsetting its minimum corner by `+width/2, +height/2`.
  //
  // **What would break this:** a camera zoom. Every expression above is 1:1 with
  // viewport pixels, and the client has no zoom today -- `viewport` is the
  // canvas size and no scale factor appears on the path. If one ever arrives the
  // rectangle grows or shrinks wrongly while staying centred, which is the
  // symptom to look for.

  // The client draws its own viewport outline in the interface's border colour.
  // White at less than full strength here: a solid white box over a bright cliff
  // reads as terrain, and the whole point of this rectangle is that it is not
  // part of the map.
  const RADAR_VIEWPORT_COLOUR = "rgba(255,255,255,0.85)";

  /**
   * The camera's rectangle in the panel's canvas pixels, or null when there is
   * no camera to ask.
   *
   * Null rather than a guess in every one of its refusals: out of a match, before
   * the world scene exists, and on a client that stops reporting a viewport. A
   * rectangle drawn from a pan that could not be read would be a box sitting
   * confidently in the wrong place, which is worse than no box.
   */
  function radarViewportRect(canvas) {
    const ui = state.combatant;
    const scene = ui && ui.worldScene;
    const cam = scene && scene.cameraPan;
    if (!radarGeo || !cam || typeof cam.getPan !== "function") return null;
    const view = scene.viewport;
    if (!view || !(view.width > 0) || !(view.height > 0)) return null;
    // Safe to hold: `getPan()` is `{...this.pan}`, a copy, measured by the probe
    // rather than assumed -- an alias would drift under us between repaints.
    const pan = cam.getPan();
    if (!pan || !Number.isFinite(pan.x) || !Number.isFinite(pan.y)) return null;

    const geo = radarGeo;
    const cx = pan.x + (geo.block.width / 2) * geo.mapWidth;
    const cy = pan.y - (geo.block.height / 2) * (geo.mapWidth + 1) + geo.headroom;
    const sx = canvas.width / geo.cropWidth;
    const sy = canvas.height / geo.cropHeight;
    return {
      left: (cx - view.width / 2 - geo.view.x) * sx,
      top: (cy - view.height / 2 - geo.view.y) * sy,
      width: view.width * sx,
      height: view.height * sy,
    };
  }

  /**
   * The rectangle itself, stroked over everything.
   *
   * Inset by half the stroke so the line lands *inside* the rectangle it
   * describes: a canvas stroke straddles its path, and a box drawn at the exact
   * camera bounds would claim half a line-width of ground the camera cannot see
   * on every side.
   *
   * The width follows the panel for the reason the pictograms' size does -- a
   * one-pixel line on a panel dragged across the screen is a thread -- but it is
   * floored at one, because a line thinner than a pixel is drawn as a fainter
   * one rather than a smaller one and simply reads as dirt.
   */
  function drawRadarViewport(ctx, canvas) {
    const rect = radarViewportRect(canvas);
    if (!rect) return;
    const line = Math.max(1, Math.round(canvas.width / 400));
    ctx.save();
    ctx.strokeStyle = RADAR_VIEWPORT_COLOUR;
    ctx.lineWidth = line;
    ctx.strokeRect(
      rect.left + line / 2,
      rect.top + line / 2,
      Math.max(0, rect.width - line),
      Math.max(0, rect.height - line)
    );
    ctx.restore();
  }

  // --- the dials --------------------------------------------------------------
  //
  // The options page owns the canonical appearance controls; this is the mirror
  // over the live radar, which is the surface the plan says you tune against —
  // a dial moved here repaints the panel under your hand instead of a stored
  // picture you then have to go and look at.
  //
  // **Which dials are here is a rule, not a selection.** Exactly the ones that
  // change a live picture without making a single stored render stale: the
  // global brightness/contrast pair, the two blip dials, the gap-field dim and
  // the shroud switch. Every one of those is absent from `tuneKey` — asserted
  // in scripts/check-radar.mjs by moving all of them and finding the stamp
  // still empty — so a match spent dragging them costs no re-render at all. The
  // per-layer dials and the two ore colours are baked, and they belong where
  // there is a big picture to judge them against.
  //
  // **They are not `<input type=range>`, and they cannot be.** The client holds
  // a pointer lock for the whole of a match: under it no DOM element can be
  // dragged, `clientX/clientY` freeze, and a wheel scrolls whatever is under the
  // position the cursor froze at. So a dial is a track you *click* — one press
  // anywhere along it sets the value, which needs no drag, no scroll and no
  // focus — and the right button puts it back to its default. The same two
  // presses work with a free mouse, so there is one behaviour rather than two.

  /**
   * The quantum a click on a track lands on.
   *
   * Fine enough that the dial does not feel notched, coarse enough that the
   * value under it reads as a number a person chose. It is also what makes a
   * click reproducible: without it the same pixel gives a different value on a
   * panel that has been resized by two pixels.
   */
  const RADAR_DIAL_STEP = 0.05;

  let radarDialsOpen = false;

  /**
   * The dials, in the order they are drawn.
   *
   * Built from the shared table's own `LIMITS` rather than from numbers written
   * here: the options page reads the same ranges, and two copies of a clamp is
   * how one surface starts allowing what the other forbids.
   */
  function radarDialList() {
    const tune = window.__cdcTune;
    if (!tune) return [];
    const L = tune.LIMITS;
    return [
      { path: ["all", "brightness"], label: "brightness", range: L.brightness },
      { path: ["all", "contrast"], label: "contrast", range: L.contrast },
      { path: ["units", "size"], label: "blip size", range: L.unitSize },
      { path: ["units", "brightness"], label: "blip light", range: L.brightness },
      { path: ["shroudDim"], label: "gap field", range: L.shroudDim },
    ];
  }

  /**
   * The value at `fraction` along a dial, on the step.
   *
   * The fraction is *not* clamped on the way in: the clamp on the way out is
   * over the same interval and does the same job, and a mutation run found the
   * pair by leaving the first one out and changing nothing anywhere.
   */
  function radarDialValue(range, fraction) {
    const raw = range[0] + fraction * (range[1] - range[0]);
    const stepped = Math.round(raw / RADAR_DIAL_STEP) * RADAR_DIAL_STEP;
    // Rounded off the float as well as clamped: 0.30000000000000004 is a true
    // answer and an unreadable readout.
    return Math.min(range[1], Math.max(range[0], Math.round(stepped * 100) / 100));
  }

  /** Where a dial's current value sits along its own range, 0..1. */
  function radarDialAt(dial, look) {
    const value = radarDialRead(dial, look);
    const span = dial.range[1] - dial.range[0];
    return span ? Math.min(1, Math.max(0, (value - dial.range[0]) / span)) : 0;
  }

  function radarDialRead(dial, look) {
    let node = look;
    for (const step of dial.path) node = node && node[step];
    return node;
  }

  /**
   * The whole table with one dial moved.
   *
   * Normalised first and then mutated, which is safe precisely because
   * `normalise` builds a fresh object every time — and it is what keeps a table
   * written from here identical in shape to one written from the options page.
   */
  function radarDialPatch(look, dial, value) {
    const next = window.__cdcTune ? window.__cdcTune.normalise(look) : { ...look };
    let node = next;
    for (let i = 0; i < dial.path.length - 1; i++) node = node[dial.path[i]];
    node[dial.path[dial.path.length - 1]] = value;
    return next;
  }

  /**
   * A dial moved: every surface that shows the table, and then storage.
   *
   * The write goes out on the same channel the preference toggles use, and the
   * echo comes back through the config push — where the repaint is gated on the
   * value actually having changed, so our own write does not redo this work.
   */
  function applyRadarLook(next) {
    state.appearance = next;
    if (window.__cdcHq && typeof window.__cdcHq.setLook === "function") {
      window.__cdcHq.setLook(next);
    }
    repaintAppearance();
    paintRadar();
    renderRadarDials();
    window.postMessage({ source: "cdc-page", type: "appearance-set", appearance: next }, "*");
  }

  /**
   * A press on a dial. `at` is a viewport point, or null for the right button,
   * which puts the dial back to its default rather than reading a position.
   */
  function pressRadarDial(index, at) {
    const dial = radarDialList()[index];
    const tune = window.__cdcTune;
    if (!dial || !tune) return false;
    const look = tune.normalise(state.appearance);
    let value;
    if (!at) {
      value = radarDialRead(dial, tune.DEFAULT_TUNE);
    } else {
      const fraction = radarDialFraction(index, at);
      if (fraction === null) return false;
      value = radarDialValue(dial.range, fraction);
    }
    applyRadarLook(radarDialPatch(look, dial, value));
    return true;
  }

  /**
   * Where along a drawn track a viewport point falls, 0..1, or null.
   *
   * Shared by the appearance dials and the size row, which is what keeps them
   * one control with two meanings rather than two controls that drift apart:
   * the press arithmetic from a viewport point is the part that can be wrong by
   * a whole panel width, and there is one copy of it.
   */
  function radarTrackFraction(track, at) {
    if (!track || !at) return null;
    const box = track.getBoundingClientRect();
    if (!box.width) return null;
    return Math.min(1, Math.max(0, (at.x - box.left) / box.width));
  }

  /** Where along dial `index`'s drawn track a viewport point falls, or null. */
  function radarDialFraction(index, at) {
    if (!radarEl) return null;
    return radarTrackFraction(
      radarEl.querySelector(`.cdc-dial[data-dial="${index}"] .cdc-dial-track`),
      at
    );
  }

  /**
   * A press on the size row: the panel's scale, set without aiming at anything.
   *
   * This row is the whole of the "no outlining the borders" requirement. The
   * 14px grip is a corner that has to be found with a cursor the client draws
   * itself, and under a pointer lock no DOM element can be dragged at all -- so
   * the scale gets the one control surface that is proven to work in a match: a
   * panel-wide track that one press anywhere along sets. The right button puts
   * it back to the default, which is the idiom the dials above already use.
   *
   * The scale is the PICTURE's height. The width follows the map's shape from
   * there, through the one function that sizes this panel, so there is a single
   * degree of freedom and no way to set a shape the map does not have.
   */
  function pressRadarSize(at) {
    if (!radarEl) return false;
    let stageHeight;
    if (!at) {
      stageHeight = radarFallbackRect().stageHeight;
    } else {
      const fraction = radarTrackFraction(
        radarEl.querySelector(".cdc-dial-size .cdc-dial-track"),
        at
      );
      if (fraction === null) return false;
      stageHeight = radarSizeValue(fraction);
    }
    applyRadarScale(stageHeight, null, true);
    // The readout and the fill are drawn from the panel as it now stands, so
    // they are redrawn after it has been resized and not before.
    renderRadarDials();
    placeRadarCanvas();
    paintRadar();
    return true;
  }

  function toggleRadarDials() {
    // Read before the drawer is drawn: `.cdc-radar-stage` is `flex: 1`, so the
    // moment the drawer appears the stage has already given up the height. This
    // is the number the panel is then re-sized to preserve — the user's ask, in
    // one line: the drawer adds space, the map does not lose any.
    const stage = radarEl && radarEl.querySelector(".cdc-radar-stage");
    const keep = stage ? stage.getBoundingClientRect().height : 0;
    radarDialsOpen = !radarDialsOpen;
    renderRadarDials();
    sizeRadarPanel(keep);
    // The panel just changed height, so a bottom-anchored one has to give that
    // space upwards instead of pushing its own foot off the screen. The stage's
    // height is what was preserved, so the ResizeObserver does not fire here.
    placeRadarFromAnchor();
    // The stage should be the size it was, so this is a no-op for the canvas in
    // the ordinary case — but the clamp and a missing stage can both move it, and
    // the ResizeObserver only fires when something actually changed.
    placeRadarCanvas();
    paintRadar();
  }

  /**
   * Draw the drawer, or take it away.
   *
   * Rebuilt row by row rather than re-created: a press is routed by the row's
   * `data-dial`, and replacing the DOM under a mouse that is already down is how
   * a click lands on a row that has moved.
   */
  function renderRadarDials() {
    if (!radarEl) return;
    const box = radarEl.querySelector(".cdc-radar-dials");
    if (!box) return;
    // "block" rather than "", because the stylesheet's own value is now `none`:
    // the drawer has to be hidden before any script runs, or a panel opened out
    // of a match shows an empty strip that `sizeRadarPanel` then counts.
    box.style.display = radarDialsOpen ? "block" : "none";
    const toggle = radarEl.querySelector(".cdc-radar-dials-toggle");
    if (toggle) toggle.classList.toggle("cdc-on", radarDialsOpen);
    if (!radarDialsOpen) return;

    const tune = window.__cdcTune;
    const dials = radarDialList();
    const look = tune && dials.length ? tune.normalise(state.appearance) : null;

    // The size row is drawn whether or not the appearance table loaded. It is
    // the panel's own scale rather than one of the render's dials, and it is the
    // only control here with no other way in -- an absent tune table must not
    // take the resize down with it.
    if (box.childElementCount !== dials.length + 2) {
      box.textContent = "";
      const size = document.createElement("div");
      size.className = "cdc-dial cdc-dial-size";
      size.title = "click the track to resize the panel · right-click for the default";
      size.innerHTML =
        '<span class="cdc-dial-label">size</span>' +
        '<span class="cdc-dial-track"><i class="cdc-dial-fill"></i></span>' +
        '<span class="cdc-dial-value"></span>';
      box.append(size);
      dials.forEach((dial, index) => {
        const row = document.createElement("div");
        row.className = "cdc-dial";
        row.dataset.dial = String(index);
        row.title = "click the track to set · right-click for the default";
        row.innerHTML =
          '<span class="cdc-dial-label"></span>' +
          '<span class="cdc-dial-track"><i class="cdc-dial-fill"></i></span>' +
          '<span class="cdc-dial-value"></span>';
        row.querySelector(".cdc-dial-label").textContent = dial.label;
        box.append(row);
      });
      const note = document.createElement("div");
      note.className = "cdc-dial-note";
      note.textContent = dials.length
        ? "the per-layer dials and the ore colours are on the options page — those bake into the render"
        : "the appearance table did not load";
      box.append(note);
    }

    // The SCALE, not the stage as it stands. `toggleRadarDials` draws the drawer
    // before it re-sizes the panel -- it has to, because the drawer's height is
    // what it re-sizes by -- and `.cdc-radar-stage` is `flex: 1`, so for that one
    // moment the stage has given the whole drawer up. Measured live, the row
    // read 66 on a 220px picture (drive-radar, 2026-08-28). The stored number is
    // the one the dial actually sets, and the stage is derived from it.
    const sizeRow = box.querySelector(".cdc-dial-size");
    if (sizeRow) {
      const stageHeight = radarRect().stageHeight;
      const value = sizeRow.querySelector(".cdc-dial-value");
      const fill = sizeRow.querySelector(".cdc-dial-fill");
      if (value) value.textContent = Math.round(stageHeight);
      if (fill) fill.style.width = `${Math.round(radarSizeAt(stageHeight) * 100)}%`;
    }

    if (!look) return;
    dials.forEach((dial, index) => {
      const row = box.querySelector(`.cdc-dial[data-dial="${index}"]`);
      if (!row) return;
      const value = radarDialRead(dial, look);
      row.querySelector(".cdc-dial-value").textContent = value.toFixed(2);
      const fill = row.querySelector(".cdc-dial-fill");
      if (fill) fill.style.width = `${Math.round(radarDialAt(dial, look) * 100)}%`;
    });
  }

  // --- interaction ------------------------------------------------------------
  //
  // What a press on the picture does, and the slice that turns a picture into a
  // radar: the left button orders, the right one moves the camera, and Alt with
  // the right one drops a beacon. The last of those is also the one gesture here
  // that works off the panel — `worldPing`, at the bottom, is the same beacon
  // out in the game world, which is where the user asked for it.
  //
  // **The two ordinary buttons are handed to the client's own minimap path
  // rather than reimplemented.** `WorldInteraction#executeMinimapClickCommand
  // (tile, wasRightClick)` is the method the client's own radar dispatches a
  // click into, and it carries four things that would each be a separate bug to
  // rebuild here. Read out of the bundle at v0.83.3:
  //
  //   executeMinimapClickCommand(tile, wasRightClick) {
  //     let ordered = false;
  //     if (wasRightClick === this.isRightClickMove()) {
  //       const hover = this.minimapHandler.getHover(tile);
  //       if (this.currentMode) { ...the mode consumes the click...
  //       } else ordered = this.defaultActionHandler.execute(hover, selected, ...);
  //     }
  //     ordered || this.minimapHandler.panToTile(tile);
  //   }
  //
  //   - **which button orders is a user setting** — `isRightClickMove()` is the
  //     client's own option, so a player who swapped the buttons there has them
  //     swapped here too, without this file knowing the option exists;
  //   - **what the order is** comes from `DefaultActionHandler`: move on open
  //     ground, attack on an enemy, capture under an engineer, repair, dock. A
  //     hardcoded `OrderType.Move` would be wrong on every one of those;
  //   - **a click mode wins over an order** — a building waiting to be placed or
  //     a superweapon waiting for a target consumes the click, exactly as it
  //     does on the client's own radar;
  //   - **the pan is the fallback, not a second branch.** A click that issues no
  //     order pans there, which is why a left click with nothing selected moves
  //     the camera on the native radar as well.
  //
  // Nothing here pushes an action of its own, and that is the point: `pushOrder`
  // would still have been ours to get right (the selection-sync action it sends
  // first, the duplicate dedupe, the acknowledgement sound), and a pan is local
  // render state that must not reach the wire at all.
  //
  // **The beacon is ours**, because the client has no one-click one:
  // `KeyCommandType.PlaceBeacon` is a mode you enter and then click with, and
  // the probe found it bound to nothing. `CombatantUi#handleBeacon(tile)` is the
  // call underneath that mode, and it carries the client's own rate limit
  // (`BeaconFxHandler#canPingLocation` — three live beacons, a third of a second
  // apart). Alt with the right button is free: `WorldInteraction`'s mousedown
  // path never reads `altKey`, and the client's own Alt bindings are all on the
  // *left* button's default action.

  /** Messages this panel says once rather than once per press. */
  const radarSaid = new Set();

  function radarSayOnce(message, level) {
    if (radarSaid.has(message)) return;
    radarSaid.add(message);
    note(message, level);
  }

  /**
   * The radar's own canvas under this press, or null if the press is not on it.
   *
   * Two ways in, as everywhere else in this file: with the mouse locked the
   * event carries frozen coordinates and never reaches our elements at all, so
   * the hit test is done by hand at the cursor the player can see; without the
   * lock `e.target` is the browser's own answer.
   *
   * The bar and the letterbox margin are deliberately not included — those are
   * what the panel is dragged by.
   */
  function radarPressTarget(e) {
    if (!radarVisible || !radarEl) return null;
    const target = mouseCaptured() ? underCursor() : e.target;
    const canvas = target && target.closest ? target.closest(".cdc-radar-canvas") : null;
    return canvas && radarEl.contains(canvas) ? canvas : null;
  }

  /**
   * A press on the panel's own furniture — the dials drawer, and the button in
   * the bar that opens it.
   *
   * Ahead of the picture, because the drawer sits over nothing the map needs and
   * a press on it is not aimed at a cell. Under a pointer lock these elements
   * cannot be clicked at all in the ordinary way — no DOM element can — so this
   * is the only way either of them works during a match, which is the only time
   * anybody wants them.
   */
  function radarChromePress(e) {
    if (!radarVisible || !radarEl) return false;
    const target = mouseCaptured() ? underCursor() : e.target;
    if (!target || !target.closest || !radarEl.contains(target)) return false;
    const toggle = target.closest(".cdc-radar-dials-toggle");
    const row = target.closest(".cdc-dial");
    if (!toggle && !row) return false;
    if (e.button !== 0 && !(row && e.button === 2)) return false;
    e.preventDefault();
    e.stopPropagation();
    if (toggle) {
      toggleRadarDials();
      return true;
    }
    // The right button carries no position on purpose: it is the "put this
    // back" press, and reading a track position from it would move the dial
    // instead of resetting it.
    const at = e.button === 2 ? null : radarPressPoint(e);
    // The size row is a row of the same shape and a different subject: it moves
    // the panel, not the render, so it is routed by its class rather than by a
    // `data-dial` index it deliberately does not have.
    if (row.classList.contains("cdc-dial-size")) pressRadarSize(at);
    else pressRadarDial(Number(row.dataset.dial), at);
    return true;
  }

  /**
   * Is this press anywhere on the radar panel at all?
   *
   * Wider than `radarPressTarget` and used for one thing: deciding whether to
   * swallow the browser's context menu. The right button means something on the
   * picture *and* on a dial now, and a menu over either is nobody's intention.
   */
  function overRadar(e) {
    if (!radarVisible || !radarEl) return false;
    const target = mouseCaptured() ? underCursor() : e.target;
    return !!target && radarEl.contains(target);
  }

  /** Where the press landed, in viewport pixels — the game's cursor under a lock. */
  function radarPressPoint(e) {
    return mouseCaptured() ? cursorPoint() : { x: e.clientX, y: e.clientY };
  }

  /**
   * The client's own tile object for one of our cells, or null.
   *
   * `getByMapCoords`, never a tile of our own making: the calls below all read
   * fields off the real thing — `z` for how high the camera has to sit,
   * `landType` for whether a target is ore, and the tile's identity itself for
   * the beacon rate limit, which compares tiles by reference. An object with
   * `rx` and `ry` on it would be quietly wrong in three places at once.
   */
  function radarTileAt(cell) {
    const ui = state.combatant;
    const tiles = ui && ui.game && ui.game.map && ui.game.map.tiles;
    if (!tiles || typeof tiles.getByMapCoords !== "function") return null;
    return tiles.getByMapCoords(cell.rx, cell.ry) || null;
  }

  /**
   * What a press means.
   *
   * Alt is read on the right button only. On the left it is left to the client,
   * which resolves its own modified default action from it — Alt+left is force
   * move in this game, and shadowing that would be a worse clone than not
   * having a beacon at all.
   */
  function radarPressAction(e) {
    if (e.button === 2) return e.altKey ? "ping" : "client";
    if (e.button === 0) return "client";
    return null;
  }

  /**
   * A beacon on that tile, through the client's own call.
   *
   * The single-player refusal is said rather than silently obeyed:
   * `handleBeacon` begins `this.isSinglePlayer || …`, so in a skirmish the whole
   * body is skipped and the gesture does nothing at all. A feature that looks
   * broken is worse than one that says why it is not.
   */
  function radarPingAt(tile) {
    const ui = state.combatant;
    if (!ui || typeof ui.handleBeacon !== "function") {
      radarSayOnce("this client has no beacon to drop — run __cdc.probe()", "warn");
      return;
    }
    if (ui.isSinglePlayer) {
      radarSayOnce("beacons are a multiplayer thing — the client drops them in a skirmish");
      return;
    }
    ui.handleBeacon(tile);
  }

  /**
   * The ordinary buttons, handed to the client.
   *
   * `isEnabled()` is the client's own gate on world interaction, asked here for
   * the reason `activateSuperWeapon` asks it: it goes false while the client is
   * not taking orders, and a click that got through then would be an order
   * issued into a match that is already over.
   */
  function radarClickThrough(tile, rightButton) {
    const world = state.combatant && state.combatant.worldInteraction;
    if (!world || typeof world.executeMinimapClickCommand !== "function") {
      radarSayOnce("this client's minimap click path is not where it was — the radar cannot order or pan", "warn");
      return;
    }
    if (typeof world.isEnabled === "function" && !world.isEnabled()) return;
    world.executeMinimapClickCommand(tile, rightButton);
  }

  /**
   * A press of the mouse, while the radar is up. Returns whether it was ours.
   *
   * Swallowed the moment it is known to be on the picture, before anything is
   * decided about what it means: the client reads a stray mousedown as a world
   * command, so a press over this panel that fell through would order the
   * selection to whatever the panel happens to be sitting on top of. Every
   * refusal below that point is a press that does nothing, not a press that
   * reaches the game.
   */
  function radarPress(e) {
    if (radarChromePress(e)) return true;
    if (!radarPressTarget(e)) return false;
    e.preventDefault();
    e.stopPropagation();
    const action = radarPressAction(e);
    if (!action) return true;
    // On the canvas but off the map: the letterbox margin, and the cells the
    // picture does not reach at this panel size.
    const cell = radarCellAt(radarPressPoint(e));
    if (!cell) return true;
    const tile = radarTileAt(cell);
    if (!tile) return true;
    if (action === "ping") radarPingAt(tile);
    else radarClickThrough(tile, e.button === 2);
    return true;
  }

  /**
   * The same gesture out in the world: Alt with the right button drops a beacon
   * on the tile under the cursor, wherever the cursor is.
   *
   * **Mousedown, in the capture phase, and it has to be both.** The client
   * deselects on the *press*, not on the release:
   *
   *   2 === e.button && (this.isRightClickPanAllowed() || this.isRightClickMove()
   *                      || this.unitSelectionHandler.deselectAll())
   *
   * so a handler on `click` or `mouseup` would run with the selection already
   * gone — and keeping the selection is the requirement that makes this gesture
   * worth having. Capturing on `window` puts us ahead of the client's own
   * listener, and `stopPropagation` is what stops that line from running.
   *
   * Nothing on that path reads `altKey`; the whole module reads it three times
   * and every one of them is about a *key* event. That is what makes Alt free to
   * take here, and it was measured rather than assumed.
   *
   * The tile is `worldInteraction.getCurrentHover()`, which returns
   * `{ entity, gameObject, tile }` and is the client's own answer to "which tile
   * is the cursor on". It is maintained under pointer lock, where the DOM's own
   * coordinates are frozen — so this converts no screen point of its own, and
   * `underCursor` is asked only about our own boxes.
   *
   * **A press this cannot answer is left alone.** Swallowing an Alt+right that
   * finds no tile, or that lands on a panel of ours, would eat the client's
   * ordinary right click and the deselect with it.
   */
  function worldPing(e) {
    if (e.button !== 2 || !e.altKey || e.ctrlKey || e.shiftKey || e.metaKey) return false;
    const world = state.combatant && state.combatant.worldInteraction;
    if (!world || typeof world.getCurrentHover !== "function") return false;
    // Our own boxes are not the world. The radar has its own handler for this
    // gesture, aimed at the cell that was clicked rather than at whatever tile
    // the game cursor happens to be over behind the panel.
    if (ourBox(mouseCaptured() ? underCursor() : e.target)) return false;
    if (typeof world.isEnabled === "function" && !world.isEnabled()) return false;
    const hover = world.getCurrentHover();
    const tile = hover && hover.tile;
    if (!tile) return false;
    e.preventDefault();
    e.stopPropagation();
    radarPingAt(tile);
    return true;
  }

  // --- the tick -------------------------------------------------------------

  /**
   * Re-sweep while the panel is open, then book the next one.
   *
   * `setTimeout` re-booking rather than an interval, on the memory readout's
   * precedent: the cadence follows the panel and there is nothing to tear down
   * — a closed panel simply does not book another. Not rAF either: this is not
   * a per-frame job, and a hidden tab has nothing to reveal.
   */
  function radarSweepTick() {
    radarSweepTimer = 0;
    if (!radarVisible) return;
    radarTicks++;
    // The radar flag, polled. The client's own `SidebarRadar` polls
    // `CombatantSidebarModel#radarEnabled` every frame rather than subscribing
    // to `RadarOnOffEvent`, and this is that poll on the clock this panel
    // already runs -- an event subscription would buy an unsubscribe lifecycle
    // for nothing. Only a CHANGE re-renders: `renderRadar()` rebuilds the
    // panel's whole box and re-places the canvas, and doing that ten times a
    // second to say the same thing is not a poll but a repaint loop.
    const offline = radarOffline();
    const flipped = offline !== radarOfflineLast;
    radarOfflineLast = offline;
    // The expensive half, on its own longer cadence: one pass over every cell
    // of the map, against a mask that moves at scouting pace.
    const moved = radarTicks % RADAR_SWEEP_EVERY === 0 ? sweepRadarShroud() : false;
    const oreMoved = radarTicks % RADAR_ORE_EVERY === 0 ? sweepRadarOre() : false;
    // The cheap half, every tick. A repaint is a blit of a canvas already
    // composited plus a few hundred fills, and proving that nothing moved would
    // cost the same walk over the world that drawing it does -- so it repaints
    // while there is a match to repaint, and only on a mask change otherwise.
    // A flip renders instead of painting: the ladder is what shows or hides the
    // canvas, and it paints for itself once it has decided there is a picture.
    // While the radar is off there is nothing to paint into -- the canvas is
    // `display: none` -- but the sweeps above keep running, so the mask is
    // already current the moment the radar comes back.
    if (flipped) renderRadar();
    else if (!offline && (moved || oreMoved || state.combatant)) paintRadar();
    radarSweepTimer = window.setTimeout(radarSweepTick, RADAR_TICK_MS);
  }

  function syncRadarSweep() {
    if (!radarVisible) {
      if (radarSweepTimer) window.clearTimeout(radarSweepTimer);
      radarSweepTimer = 0;
      return;
    }
    // Guarded against a second loop: two of these would sweep the whole map
    // twice as often for one picture.
    if (!radarSweepTimer) radarSweepTick();
  }

  /** A viewport point -> a fraction of the picture, or null if outside it. */
  function radarFractionAt(point) {
    if (!point || !radarEl || !radarPlaced) return null;
    const stage = radarEl.querySelector(".cdc-radar-stage");
    const box = stage.getBoundingClientRect();
    const x = point.x - box.left - radarPlaced.left;
    const y = point.y - box.top - radarPlaced.top;
    if (x < 0 || y < 0 || x > radarPlaced.width || y > radarPlaced.height) return null;
    return { x: x / radarPlaced.width, y: y / radarPlaced.height };
  }

  /**
   * Which cell each pixel of the picture on screen belongs to.
   *
   * Rasterised by the renderer, from the same geometry the picture is drawn
   * from, because the inverse of that geometry is ambiguous: elevation lifts a
   * cell up the picture, so one pixel can belong to two cells and the flat
   * inverse reads a z=4 cell two tiles off. scripts/check-radar.mjs pins both
   * halves — that the inverse is wrong, and that this is not.
   *
   * Built on demand rather than beside the backing canvas: a resize drag fires
   * a repaint per frame and none of those frames is clicked, so the first
   * click after a resize pays for the buffer and the drag pays nothing.
   *
   * **Stamped by size alone, and deliberately not with the backing's stamp.**
   * The dials change what colour a pixel is and never which cell it is, so a
   * slider must not throw this away.
   */
  function ensureRadarPick() {
    const hq = window.__cdcHq;
    const mapFile = radarMapFile();
    if (!radarEl || !radarGeo || !mapFile) return null;
    if (!hq || typeof hq.pickBuffer !== "function") return null;
    const canvas = radarEl.querySelector(".cdc-radar-canvas");
    if (!canvas || !canvas.width || !canvas.height) return null;

    const stamp = `${canvas.width}x${canvas.height}`;
    // The failure is cached with the success, so a map the renderer cannot
    // rasterise warns once rather than once per mouse move.
    if (radarPick && radarPick.stamp === stamp && radarPick.mapFile === mapFile) {
      return radarPick.buffer;
    }
    // **One cell list for both halves.** The mask is built by walking the live
    // map and this buffer used to take the renderer's default, `mapFile.tiles`.
    //
    // That difference was 1.11.0's diagnosis for the black half of the panel
    // and it was **wrong**: the coverage line below measured the two on a live
    // map and they are the same 19690 cells. Kept anyway, and demoted from a
    // fix to hygiene — one source for the two consumers of the map's cells is
    // worth having on its own, and the real defect (the id packing, see
    // `cellId` in hq-preview.js) was found by the measurement that shipped
    // beside the wrong fix rather than by it.
    const list = radarCellList(mapFile);
    let buffer = null;
    try {
      buffer = hq.pickBuffer(mapFile, canvas.width, canvas.height, list || undefined);
    } catch (e) {
      note(`radar pick buffer failed — ${e && e.message}`, "warn");
    }
    if (buffer) noteRadarPickCoverage(buffer, list, mapFile);
    radarPick = { buffer, stamp, mapFile };
    return buffer;
  }

  /**
   * What the buffer actually covers, said out loud once per build.
   *
   * **This line is what refuted 1.11.0's diagnosis**, which is the argument for
   * keeping it. Two matches had gone to guesses about a black half of the panel
   * because nothing reported anything: the terrain drew, so the render was
   * fine; the sweep logged its 19690 cells, so the walk was fine. The theory
   * was that the buffer read a different, sparser list. It printed
   * `19690 cells walked … mapFile.tiles alone would have given 19690` — equal,
   * so the theory was dead in one match instead of surviving another.
   *
   * What it says now is a live measurement of the id space: `walked` against
   * how many of those cells reach a pixel at this panel size. Nothing else in
   * the extension can observe either number.
   */
  function noteRadarPickCoverage(buffer, list, mapFile) {
    const distinct = new Set();
    let off = 0;
    for (let i = 0; i < buffer.ids.length; i++) {
      const id = buffer.ids[i];
      if (id < 0) off++;
      else distinct.add(id);
    }
    // The renderer's own default expression, evaluated here for comparison
    // only, and reported rather than warned about. On the map this was measured
    // on the two are equal; a difference would be worth knowing and is still
    // not a fault, since the buffer takes the walked list either way.
    const fallback = mapFile.tiles
      ? Array.prototype.filter.call(mapFile.tiles, Boolean).length
      : 0;
    const walked = list ? list.length : 0;
    const line =
      `radar pick buffer ${buffer.width}x${buffer.height}: ` +
      `${walked} cells walked, ${distinct.size} of them reach a pixel, ` +
      `${off} pixels are off the map; mapFile.tiles alone would have given ${fallback}`;
    if (line === radarPickNoted) return;
    radarPickNoted = line;
    note(line);
  }

  /** The map cell under a viewport point, or null if that is not the map. */
  function radarCellAt(point) {
    const at = radarFractionAt(point);
    const pick = at && ensureRadarPick();
    if (!pick) return null;
    const x = Math.min(pick.width - 1, Math.max(0, Math.floor(at.x * pick.width)));
    const y = Math.min(pick.height - 1, Math.max(0, Math.floor(at.y * pick.height)));
    const id = pick.ids[y * pick.width + x];
    if (id < 0) return null;
    // `idStride`, never `mapWidth`: the ids are not row-major over the map's
    // width. See the note beside `cellId` in hq-preview.js.
    return { rx: id % pick.idStride, ry: Math.floor(id / pick.idStride) };
  }

  /**
   * The tile under the cursor, in the panel's own bar.
   *
   * The pick buffer's only consumer until the slice that orders units, and it
   * is written now rather than with that one because a buffer with no consumer
   * cannot be checked by the person the radar is for: this readout is how a
   * live match answers whether the cell under the cursor is the cell the eye
   * is on. Nothing else here can answer that — every check in
   * scripts/check-radar.mjs is the arithmetic agreeing with itself.
   */
  function syncRadarReadout() {
    if (!radarVisible || !radarEl) return;
    const at = radarEl.querySelector(".cdc-radar-at");
    if (!at) return;
    const cell = radarCellAt(cursorPoint());
    const text = cell ? `${cell.rx},${cell.ry}` : "";
    if (at.textContent !== text) at.textContent = text;
    syncRadarCredits();
  }

  /**
   * The bar says how much money the player has, in place of the word "Radar".
   *
   * The word was furniture: the panel is unmistakably a radar, and the one
   * number it displaced is invisible whenever the client's own interface is
   * hidden -- which is when this panel is most likely to be the only thing on
   * screen. Asked for 2026-08-26.
   *
   * `player.credits` is a plain getter on the client's own Player, so this is a
   * read on a tick the bar already runs rather than anything subscribed. Outside
   * a match there is no player and the label goes back to naming the panel,
   * because a bar reading "0" before a game starts would look like a readout
   * that is broken rather than one that has nothing to say yet.
   */
  function syncRadarCredits() {
    const title = radarEl.querySelector(".cdc-radar-title");
    if (!title) return;
    const player = state.combatant ? state.combatant.player : null;
    const credits = player ? player.credits : null;
    const text = typeof credits === "number" ? String(Math.floor(credits)) : "Radar";
    if (title.textContent !== text) title.textContent = text;
  }

  function toggleRadar(force) {
    radarVisible = force === undefined ? !radarVisible : !!force;
    renderRadar();
    // The shared mousemove/mousedown pair is installed only while something
    // wants it, and this panel is now one of the things that can want it.
    syncOverlayMouse();
    // And the shroud sweep, which is this panel's alone.
    syncRadarSweep();
    return radarVisible;
  }

  function resetRadarLayout() {
    try {
      localStorage.removeItem(RADAR_LAYOUT_KEY);
    } catch (e) {
      note("could not clear the stored radar layout", "warn");
    }
    renderRadar();
    return radarRect();
  }

  function resetLayout() {
    try {
      localStorage.removeItem(LAYOUT_KEY);
    } catch (e) {
      note("could not clear the stored layout", "warn");
    }
    renderIngame();
    // Both boxes, because "put it back" means every box the extension moved, and
    // a second call nobody knows to make is a box that stays lost.
    resetRadarLayout();
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
      taunts: toggleTaunts,
      net: toggleNet,
      memory: toggleMemory,
      sidebar: toggleSidebar,
      radar: toggleRadar,
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
   * Follow the cursor through a pointer lock, which the DOM alone cannot do.
   *
   * Under a real lock the browser freezes `clientX/clientY` at the point the
   * lock was taken and moves the live signal into `movementX/movementY` — so
   * `state.pointer`, read straight off the event, is right exactly until a
   * match starts and stale for the rest of it. Integrating the deltas ourselves
   * is what the client's own `Pointer` does with them, and it leaves
   * `cursorPoint()` a live position that needs no object of the client's to
   * have been captured first.
   *
   * With the mouse free the integrated point is held equal to the DOM's, which
   * is what makes it a correct seed the instant a lock is taken rather than a
   * position left over from the last one.
   */
  function trackPointer(e) {
    state.pointer = { x: e.clientX, y: e.clientY };
    if (!mouseCaptured()) {
      state.lockedPointer = { x: e.clientX, y: e.clientY };
      return;
    }
    // A missing delta is taken as zero rather than added: `undefined` turns the
    // point into NaN, `elementFromPoint` answers null for that, and every hit
    // test downstream then misses in silence — the same failure shape as the
    // stale position this exists to fix.
    const from = state.lockedPointer || state.pointer;
    const dx = typeof e.movementX === "number" ? e.movementX : 0;
    const dy = typeof e.movementY === "number" ? e.movementY : 0;
    // Clamped to the viewport, because the deltas keep arriving after the real
    // cursor has run into the edge of the screen: unclamped, the integrated
    // point walks off into coordinates no element occupies and stays there
    // until the same distance is travelled back.
    state.lockedPointer = {
      x: Math.min(Math.max(from.x + dx, 0), Math.max(window.innerWidth - 1, 0)),
      y: Math.min(Math.max(from.y + dy, 0), Math.max(window.innerHeight - 1, 0)),
    };
  }

  /**
   * Which return inside `cursorPoint()` last fired, and why the branches above
   * it lost.
   *
   * Written by `cursorPoint` itself, so `dragReport` can name the source that
   * actually ran without re-evaluating the guards — two copies of that decision
   * are two copies that drift. The report derived it from `state.pointerUi`
   * being non-null until now, which named the client's pointer for every match
   * whose pointer was captured but unusable: exactly the case the report exists
   * to find, reported as the case it rules out.
   */
  let cursorBranch = "dom";
  let cursorWhy = "cursorPoint() has not been called yet";

  /** The branch's name, its wording for a player, and why the others lost. */
  function cursorSource() {
    return {
      branch: cursorBranch,
      source:
        cursorBranch === "client"
          ? "the client's pointer"
          : cursorBranch === "integrated"
            ? "ours, integrated from movementX/movementY"
            : "the DOM's",
      why: cursorWhy,
    };
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
   * Three sources, in that order of trust: the client's pointer, then the point
   * `trackPointer` integrates from `movementX/movementY` for a match whose
   * client pointer was never captured, then `state.pointer` — which is right
   * and live for everything outside a lock.
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
          cursorBranch = "client";
          cursorWhy = "the client's own pointer, converted through chordScreenBox";
          return { x: box.left, y: box.top };
        }
        cursorWhy = at
          ? "the client's canvas has an empty rect"
          : "the client's pointer returned no position";
      } catch (e) {
        note(`could not read the client's pointer (${e && e.message})`, "warn");
        cursorWhy = `the client's pointer threw — ${e && e.message}`;
      }
    } else {
      // Only ever an explanation of a decision the guard above has already made:
      // it names the term that failed, it never re-decides which branch runs.
      cursorWhy = !mouseCaptured()
        ? "the mouse is free, so the DOM's own coordinates are live and right"
        : !ui
          ? "no client pointer was captured — Pointer.prototype.init was patched after the client had already called it, or never"
          : typeof ui.getPosition !== "function"
            ? "the captured client pointer has no getPosition()"
            : "the captured client pointer has no canvas";
    }
    // No client pointer, or one that had nothing usable to give. Under a lock
    // the DOM's own coordinates are frozen, so the point `trackPointer`
    // integrates is the only live answer left. Second and never first: the
    // client's pointer is the one the game actually DRAWS, and a position of
    // ours disagreeing with the cursor the player can see would be a worse bug
    // than a stale one.
    if (mouseCaptured() && state.lockedPointer) {
      cursorBranch = "integrated";
      return state.lockedPointer;
    }
    cursorBranch = "dom";
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
    // The radar is here for the same reason the grid is: its right button moves
    // the camera and Alt with it drops a beacon, so a browser menu on top of
    // either is nobody's intention.
    if (!chordEl && !overRadar(e)) return;
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
    return (
      (!!chordEl && chordEl.contains(target)) ||
      (!!tauntEl && tauntEl.contains(target)) ||
      (!!queuesEl && queuesEl.contains(target)) ||
      // The radar joins the list the moment its canvas has a cell under every
      // pixel: aiming at a tile you cannot see the cursor over is the dead
      // reckoning this drawn cursor exists to end.
      (!!radarEl && radarVisible && radarEl.contains(target))
    );
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
    // Ahead of the lock check, because the radar's readout is the one thing
    // here that is wanted with a free mouse too — it is how the panel is read
    // outside a match, and `cursorPoint` already falls back to the DOM's own
    // position when nothing is holding the mouse.
    syncRadarReadout();
    if (!mouseCaptured()) {
      drawCursor(null);
      return;
    }
    const at = cursorPoint();
    const target = at ? document.elementFromPoint(at.x, at.y) : null;
    drawCursor(ourBox(target) ? at : null);
    const tile = target && target.closest ? target.closest(".cdc-chord-slot") : null;
    // Whichever of the two overlays is up — they never are together, and both
    // draw the same tile under the same class.
    const holder = chordEl || tauntEl;
    const want = holder && tile && holder.contains(tile) ? tile : null;
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
    // And the browser's own second half of a right press, which the radar's
    // camera button and its beacon both need swallowed. It rides here rather
    // than with the panel because the handler decides for itself whether the
    // press is over anything of ours.
    window.removeEventListener("contextmenu", onOverlayContextMenu, true);
    if (!chordEl && !tauntEl && !queuesEl && !netEl && !(memPanel && memPanel.visible()) && !radarVisible) {
      drawCursor(null);
      hoveredTile = null;
      return;
    }
    window.addEventListener("mousemove", onOverlayMouseMove, true);
    window.addEventListener("mousedown", onPanelMouseDown, true);
    window.addEventListener("contextmenu", onOverlayContextMenu, true);
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

  // --- Collapsing the sidebar -----------------------------------------------

  /**
   * The client's whole right-hand sidebar, hidden, with its power bar kept and
   * moved flush to the right edge of the screen.
   *
   * **Why there is anything left to hide.** Between the chord grid, the
   * production panel and the key badges, everything the sidebar is *for* has a
   * key now — the tabs, the cameos, the queue depth, the cancel — except one
   * thing: the power bar, which no key can replace because it is not a command
   * but a reading you glance at. So this is not "hide the HUD", it is "keep the
   * one part of it that is information".
   *
   * **Three moves, and the third is the point.**
   *
   * 1. The sidebar's own container is hidden. It carries no `ref` in the
   *    client's jsx — the refs inside it name the pieces, never the box — so it
   *    is found rather than named: the one HUD child whose subtree holds the
   *    power bar. An index into `getChildren()` would be the other way to say
   *    it, and would be a guess about a render tree we do not own.
   *    `sidebarButtonsContainer` is a second HUD child and is hidden with it.
   * 2. The power bar is reparented onto the HUD and put at
   *    `viewport.width - powerp.width`. Reparented rather than left where it is,
   *    because it lives *inside* the container being hidden and
   *    `gui/PointerEvents` gates a hit on the whole visibility chain — the same
   *    property that makes hiding enough to stop clicks makes it too much to
   *    keep one child visible. `SidebarPower#onFrame` writes `visible` and
   *    nothing else, so a position set here stays set.
   * 3. The world's viewport is widened into the freed strip, by the override on
   *    `WorldView#computeWorldViewport`. Without it the strip is the renderer's
   *    clear colour: `engine/gfx/Renderer` clears the canvas once a frame and
   *    then gives each scene its own `setViewport`, and the world's is
   *    `screen.width - hud.sidebarWidth` wide. `handleViewportChange` is the
   *    client's own re-apply and carries the camera's pan limits with it, so the
   *    view can reach the map edge the strip revealed rather than stopping where
   *    a narrower screen used to stop.
   *
   * Read out of `ra2web.min.js` v0.83.3 on 2026-08-24.
   */

  // Whether the sidebar was collapsed when this tab last had an opinion. A
  // preference rather than a per-match toggle: someone who plays without the
  // sidebar plays without it, and having to press the key again every match
  // would be the same as not having the key.
  const SIDEBAR_KEY = "cdc.sidebarCollapsed";

  // Read on first use rather than while this file is evaluating. Nothing here
  // may call `note()` at load: it renders the debug panel, whose own binding is
  // declared further down, so a warning raised during evaluation crashes on the
  // temporal dead zone instead of being logged. A storage read is exactly the
  // call that can fail and want to say so — caught by check-spawn-marks, whose
  // sandbox has no `localStorage` at all.
  let sidebarWanted = null;

  // Held while the client's own sidebar menu is up, and it outranks the
  // preference — see the hook on `Hud#showSidebarMenu`.
  let sidebarLift = false;

  // While the power bar is parked at the screen edge: the parent it was taken
  // from, the box that was hidden, and the HUD both belong to. All three are
  // needed. The owner is how it goes back; the HUD is how a rebuild is noticed,
  // since after one the other two point into a tree that no longer exists; and
  // the box is cached rather than searched for again because **parking makes it
  // unfindable** — `sidebarBox` identifies the sidebar by which HUD child holds
  // the power bar, and once the bar is a HUD child itself no child holds it any
  // more. Found by the check, which is exactly the kind of defect a check that
  // drives the feature twice is for: one collapse looked perfect, and the second
  // call hid the power bar and the expand never brought the sidebar back.
  let powerParked = null;

  // The collapse state the HUD on screen is actually showing, so the world view
  // is nudged when that changes rather than on every call.
  let sidebarShown = null;

  // The HUD already reported as having no power bar, so a client that has
  // renamed the ref says so once rather than on every rebuild.
  let powerMissing = null;

  /** The stored preference, read once and remembered. */
  function sidebarPref() {
    if (sidebarWanted === null) {
      try {
        sidebarWanted = localStorage.getItem(SIDEBAR_KEY) === "1";
      } catch (e) {
        note("could not read whether the sidebar was collapsed last time", "warn");
        sidebarWanted = false;
      }
    }
    return sidebarWanted;
  }

  /** Is the sidebar to be hidden right now? */
  function sidebarCollapsed() {
    return sidebarPref() && !sidebarLift;
  }

  /** A UiObject's children, and an empty list for anything that is not one. */
  function uiChildren(obj) {
    const box = obj && typeof obj.getRenderableContainer === "function" ? obj.getRenderableContainer() : null;
    const kids = box && typeof box.getChildren === "function" ? box.getChildren() : null;
    return kids || [];
  }

  /** The UiObject directly holding `target`, searched from `root` downwards. */
  function uiParentOf(root, target) {
    for (const child of uiChildren(root)) {
      if (child === target) return root;
      const deeper = uiParentOf(child, target);
      if (deeper) return deeper;
    }
    return null;
  }

  /**
   * The HUD child whose subtree holds the power bar — the sidebar's own box.
   *
   * Strictly a *descendant*: the bar itself is never the answer, because the one
   * state in which the bar is a HUD child is the one this feature put it in, and
   * returning it there would hand the caller the thing it is trying to keep as
   * the thing it is trying to hide. Only meaningful before the bar is parked;
   * afterwards the answer is cached on `powerParked`.
   */
  function sidebarBox(gameHud, power) {
    for (const child of uiChildren(gameHud)) {
      if (child !== power && uiParentOf(child, power)) return child;
    }
    return null;
  }

  /**
   * Put the sidebar into the state the preference asks for, whatever state it is
   * in now.
   *
   * Idempotent on purpose, because it is called from four places that cannot see
   * each other: the key, a HUD rebuild, and the two ends of the client's own
   * sidebar menu. Every position it writes is computed from the client's own
   * props rather than by adding an offset to whatever is there, so running it
   * twice is running it once.
   */
  function applySidebar() {
    // `gameHud` rather than `hud`, which in this file is the extension's own
    // debug panel.
    const gameHud = state.hud;
    if (!gameHud || !gameHud.viewport) return;
    const bar = gameHud.sidebarPower;
    const power = bar && typeof bar.getUiObject === "function" ? bar.getUiObject() : null;
    if (!power) {
      // Not a silent return: a HUD with no power bar is a client that has
      // renamed the ref, and the whole feature is inert from that moment. Once
      // per HUD, because this runs on every rebuild and would otherwise fill the
      // log with the same line at every resize.
      if (powerMissing !== gameHud) {
        powerMissing = gameHud;
        note("the HUD has no power bar where the client kept one — the sidebar is left alone", "warn");
      }
      return;
    }
    // A rebuilt HUD invalidates everything the last move referred to — including
    // the record of what is on screen, since what is on screen is new.
    if (powerParked && powerParked.hud !== gameHud) {
      powerParked = null;
      sidebarShown = null;
    }

    const hide = sidebarCollapsed();
    // Whether this feature owns what is on screen right now — see the gate
    // below, and the tail, which does not disturb the client's world view for a
    // collapse that has never been switched on.
    let owned = false;
    try {
      const box = powerParked ? powerParked.box : sidebarBox(gameHud, power);
      if (!box) {
        note("the sidebar's own container is not where it was — leaving the sidebar alone", "warn");
        return;
      }
      const props = bar.props || {};
      if (hide && !powerParked) {
        const owner = uiParentOf(gameHud, power);
        if (!owner) {
          note("the power bar has no parent to be taken from — leaving the sidebar alone", "warn");
          return;
        }
        owner.remove(power);
        gameHud.add(power);
        powerParked = { hud: gameHud, owner, box };
      } else if (!hide && powerParked) {
        gameHud.remove(power);
        powerParked.owner.add(power);
        powerParked = null;
      }
      // Nothing is written back unless this feature is the reason it moved.
      // With the collapse off and never used, the client's own placement is
      // left exactly as the client made it — which matters because the client
      // hides the sidebar for reasons of its own (the game menu, a cinematic),
      // and a `setVisible(true)` on every HUD build would quietly undo those.
      owned = hide || sidebarShown === true;
      if (owned) {
        const powerWidth = (props.powerImg && props.powerImg.width) || 0;
        power.setPosition(hide ? Math.max(0, gameHud.viewport.width - powerWidth) : props.x || 0, props.y || 0);
        box.setVisible(!hide);
        if (gameHud.sidebarButtonsContainer) gameHud.sidebarButtonsContainer.setVisible(!hide);
        // The superweapon timers are not part of the sidebar and are not hidden
        // — but they were placed against its left edge, so a collapse would
        // leave them floating a sidebar's width from the screen edge, which is
        // the one thing this feature exists to stop. Their `x` is the client's
        // own, minus a gutter that is now nothing.
        const timerBox = gameHud.superWeaponTimers;
        const timers = timerBox && typeof timerBox.getUiObject === "function" ? timerBox.getUiObject() : null;
        if (timers && timerBox.props) {
          const own = timerBox.props;
          timers.setPosition(
            Math.max(0, gameHud.viewport.width - (hide ? 0 : gameHud.sidebarWidth || 0) - (own.width || 0)),
            own.y || 0
          );
        }
      }
    } catch (e) {
      note(`could not collapse the sidebar — ${e && e.message}`, "warn");
      return;
    }

    if (sidebarShown === hide) return;
    sidebarShown = hide;
    if (!owned) return;
    // The client's own path for "the viewport changed", which recomputes the
    // world's scissor through the override above and the camera's pan limits
    // with it. Skipped before the world view exists, which is the first HUD of a
    // match: the client builds the HUD first and the world view second, reading
    // `hud.sidebarWidth` on the way, so that one comes up right without being
    // told.
    const view = state.worldView;
    if (view && typeof view.handleViewportChange === "function") {
      try {
        view.handleViewportChange(gameHud.viewport);
      } catch (e) {
        note(`the world view did not take the sidebar's width back — ${e && e.message}`, "warn");
      }
    }
  }

  /**
   * The key: collapse the sidebar, or bring it back.
   *
   * Writes the preference before applying it, so a tab that dies between the two
   * comes back to the sidebar the player last asked for rather than to the one
   * they last saw.
   */
  function toggleSidebar(on) {
    const want = on === undefined ? !sidebarPref() : !!on;
    if (want !== sidebarWanted) {
      sidebarWanted = want;
      try {
        localStorage.setItem(SIDEBAR_KEY, want ? "1" : "0");
      } catch (e) {
        note("could not remember whether the sidebar is collapsed", "warn");
      }
    }
    if (!state.hud) {
      note(`the sidebar will be ${want ? "collapsed" : "shown"} from the next match — there is none now`);
      return;
    }
    applySidebar();
    note(want ? "sidebar collapsed — the power bar only, at the right edge" : "sidebar back");
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
   * Where the last real press through `onPanelMouseDown` stopped.
   *
   * `dragReport()` predicts what a press *would* do; this is the record of one
   * that happened. It is the half that says whether the press ever reached
   * `begin` at all — every exit of the handler below names itself here, so a
   * player who pressed and saw nothing move can read which step swallowed it
   * rather than guessing. Never read by the handler, and holds only the latest
   * press: a log would grow for the life of a match.
   */
  let lastPanelPress = null;

  /**
   * Start a drag of a floating panel when the game has the mouse.
   *
   * The panel's own `mousedown` cannot fire in that state — the press goes to
   * the locked canvas — so the drag is begun from here, at the cursor the player
   * can see. Unlocked, this does nothing and the panel's own handler runs.
   */
  function onPanelMouseDown(e) {
    // Records the exit, changes no decision. Each `stopped` line names the step
    // its own `return` is; the strings are what `__cdc.drag().lastPress` prints.
    const stopped = (step, extra) => {
      lastPanelPress = Object.assign({ when: Date.now(), step }, extra || null);
    };
    // The radar's canvas gets first refusal, and gets it ahead of the lock
    // check: it is the one panel whose presses mean something with a free mouse
    // too, because a press on it is aimed at a tile rather than at the box
    // around it.
    if (radarPress(e)) {
      stopped("the radar's own canvas claimed the press, before the lock check");
      return;
    }
    if (!mouseCaptured()) {
      stopped("the mouse is free — the panel's own mousedown handles this press");
      return;
    }
    const target = underCursor();
    if (!target) {
      stopped("the hit test found no element at the cursor");
      return;
    }
    // Both floating panels through one handler: the hit test is the same
    // `elementFromPoint` either way, and a listener per panel would be a second
    // unsubscribe to keep right for no second behaviour.
    for (const panel of [
      { name: "queues", el: queuesEl, drag: queuesDrag },
      { name: "net", el: netEl, drag: netDrag },
      { name: "memory", el: memPanel && memPanel.el(), drag: memPanel && memPanel.drag() },
      { name: "radar", el: radarEl, drag: radarDrag },
    ]) {
      if (!panel.el || !panel.drag || !panel.el.contains(target)) continue;
      e.preventDefault();
      e.stopPropagation();
      // Recorded before the call, so a `begin` that throws still leaves the
      // report saying the press got this far.
      stopped("begin was called", { panel: panel.name, under: target.className || target.tagName });
      panel.drag.begin(cursorPoint(), target);
      return;
    }
    stopped("no panel of ours contains the cursor", { under: target.className || target.tagName });
  }

  /**
   * What a press right here would do to a floating panel, and why.
   *
   * The drag under a pointer lock is a chain of five answers, and a report that
   * it "does not work" cannot say which one is wrong. Every link was cleared in
   * turn by reading -- `mouseCaptured` (the client uses the real Pointer Lock
   * API), `radarPress` (it claims only the canvas and the dials), the grip's hit
   * test, `cursorPoint` -- and `scripts/drive-drag.mjs` then drove the whole
   * path in a real browser under a faked lock and passed every assertion. So the
   * wiring is sound and the fault is in something only a running match has,
   * which is exactly the case a console line can settle and a check cannot.
   *
   * Hover the thing you would grab, then read this. It repeats the decision
   * `onPanelMouseDown` makes, in the same order, without acting on it.
   */
  function dragReport() {
    // First, and before anything else reads a pointer: `cursorPoint` is what
    // records which branch ran, so every field below describes the same call the
    // drag itself would have made.
    const at = cursorPoint();
    const from = cursorSource();
    const target = at ? document.elementFromPoint(at.x, at.y) : null;
    const named = (el) => (el ? el.className || el.tagName : "nothing");
    const point = (p) => (p && typeof p.x === "number" ? Math.round(p.x) + "," + Math.round(p.y) : "none");
    const ui = state.pointerUi;

    // The client's raw answer AND the viewport point it converts to. One without
    // the other cannot say which of the two is wrong, and the conversion is the
    // suspect: read this twice with a mouse move in between and whichever of
    // clientAt / integratedAt / domAt moved is the live one.
    let raw = null;
    let rawThrew = null;
    let converted = null;
    let canvasSpace = "none — no client pointer was captured";
    if (ui && typeof ui.getPosition === "function") {
      try {
        raw = ui.getPosition();
      } catch (e) {
        rawThrew = (e && e.message) || String(e);
      }
    }
    if (ui && ui.canvas) {
      const rect = ui.canvas.getBoundingClientRect();
      // The one fact about a live match that reading this repo cannot supply: is
      // the client's canvas device-backed? `chordScreenBox` divides the client's
      // position by `attributePx / cssPx`, so the ratio is the whole of what the
      // conversion does — at 1 it is the identity, and only above 1 does a point
      // land short of the cursor.
      //
      // **Expect 1, and read 1 as "look downstream".** The shipped client sizes
      // its canvas through `Renderer.setViewportSize` →
      // `THREE.WebGLRenderer.setSize(w, h)`, whose pixel ratio defaults to 1, and
      // neither `setPixelRatio` nor `devicePixelRatio` occurs anywhere in
      // `dist/ra2web.min.js?v=0.83.3`, the lib patches or the stylesheet. The hit
      // test is also known good live: `onOverlayMouseMove` draws the cursor at
      // `cursorPoint()` and only over one of our boxes, through this same
      // conversion, and it draws on the cursor in a real match — which a halved
      // point could not do. So a ratio of 1 here is not the reason a panel refuses
      // to move; that cause is downstream and still open.
      //
      // A ratio above 1 would be news: a client version that has started backing
      // its canvas at the device ratio, and then a real defect. Both numbers are
      // reported with the ratio so the answer needs no second reading.
      canvasSpace = {
        attributePx: ui.canvas.width + `x` + ui.canvas.height,
        cssPx: Math.round(rect.width) + `x` + Math.round(rect.height),
        ratio: rect.width ? Number((ui.canvas.width / rect.width).toFixed(3)) : "the canvas has an empty rect",
        devicePixelRatio: window.devicePixelRatio,
      };
      if (raw) {
        const box = CHORD_TABLES.chordScreenBox(
          { x: raw.x, y: raw.y, width: 0, height: 0 },
          rect,
          { width: ui.canvas.width, height: ui.canvas.height }
        );
        converted = { x: box.left, y: box.top };
      }
    } else if (ui) {
      canvasSpace = "none — the captured client pointer has no canvas";
    }

    const panels = [
      { name: "queues", el: queuesEl, drag: queuesDrag },
      { name: "net", el: netEl, drag: netDrag },
      { name: "memory", el: memPanel && memPanel.el(), drag: memPanel && memPanel.drag() },
      { name: "radar", el: radarEl, drag: radarDrag },
    ];
    const hit = panels.find((p) => p.el && p.el.contains(target));
    return {
      captured: mouseCaptured(),
      // Which `return` inside cursorPoint() actually fired, taken from
      // cursorPoint itself rather than re-derived here — `state.pointerUi` being
      // non-null was what this said until now, and a captured-but-unusable
      // pointer made that a lie in the one case worth reporting.
      branch: from.branch,
      source: from.source,
      why: from.why,
      at: at ? Math.round(at.x) + "," + Math.round(at.y) : "unknown",
      // The three candidate positions, side by side. Read this twice with the
      // mouse moved in between: the one that changed is the one that is live.
      clientAt: rawThrew
        ? `getPosition() threw — ${rawThrew}`
        : raw
          ? point(raw) + " in the client, which converts to " + point(converted) + " in the viewport"
          : ui
            ? "none — the client's pointer gave no position"
            : "none — no client pointer was captured",
      integratedAt: point(state.lockedPointer),
      domAt: point(state.pointer),
      // Two separate facts, because they fail separately: the patch may never
      // have installed, or it may have installed after the client had already
      // made its single Gui.init() call and so never captured anything.
      pointerHook: {
        installed: !!state.hooks.pointer,
        captured: state.pointerUi !== null,
      },
      canvasSpace,
      under: named(target),
      panel: hit ? hit.name : "none",
      draggable: hit ? !!hit.drag : false,
      // The record of a press that HAPPENED, next to `wouldDo`'s prediction about
      // one that has not. The hit test is known to land on the cursor in a match
      // — the drawn cursor rides the same `cursorPoint()` — so the unexplained
      // half of "the panel will not move" is downstream, and these two fields are
      // where it shows. `lastPress` names the step the handler stopped at; `drags`
      // is each panel's own counters, so "begin was never reached" and "begin
      // armed the box and onMove did nothing" read differently. Both are copied
      // out of state the drag writes as it runs — reading them presses nothing.
      lastPress: lastPanelPress
        ? {
            step: lastPanelPress.step,
            panel: lastPanelPress.panel || "none — the press stopped before a panel was named",
            under: lastPanelPress.under || "not read at that step",
            msAgo: Date.now() - lastPanelPress.when,
          }
        : "none — no mousedown has reached onPanelMouseDown since this page loaded",
      drags: panels.reduce((all, p) => {
        if (p.drag && typeof p.drag.report === "function") all[p.name] = p.drag.report();
        return all;
      }, {}),
      // The verdict, in the order onPanelMouseDown reaches it.
      wouldDo: (() => {
        if (!at) return "nothing — there is no cursor position to act on";
        // Asked of the DOM, never of radarChromePress: that one ACTS -- it
        // toggles the drawer and calls preventDefault on the event it is
        // handed. A report with a side effect is not a report.
        if (target && target.closest && (target.closest(".cdc-dial") || target.closest(".cdc-radar-dials-toggle"))) {
          return "press a dial — the drawer claims this point before any drag";
        }
        if (!mouseCaptured()) return "nothing here — the panel's own mousedown handles a free mouse";
        if (!target) return "nothing — the hit test found no element at that point";
        if (!hit) return "nothing — that point is not inside a panel that drags";
        if (!hit.drag) return "nothing — " + hit.name + " has no drag attached";
        return hit.name + ": " + (hit.el === radarEl && radarGripHas(target) ? "resize" : "move");
      })(),
    };
  }

  /** Is this element the radar's resize grip, or inside it? */
  function radarGripHas(target) {
    const grip = radarEl ? radarEl.querySelector(".cdc-radar-grip") : null;
    return !!(grip && target && (target === grip || grip.contains(target)));
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

  // --- The taunt overlay ----------------------------------------------------

  /**
   * The eight taunts on the same block of keys the build grid uses.
   *
   * Why an overlay at all, for a feature the client already has keys for: those
   * keys are **F5 to F12** (the shipped `[Hotkey]` table binds `Taunt_1`..`8` to
   * 116..123), and a browser keeps the top of that range for itself — F11 is
   * fullscreen and F12 is devtools, neither cancellable from a page. So two of
   * the eight are unreachable on a stock install and the rest are a hand off the
   * keyboard. This puts them under the left hand and, because that is the same
   * fix the client's own Keyboard options offer, also rebinds them **in the
   * client** rather than shadowing them from outside.
   *
   * What it draws over is `state.combatant.tauntHandler` — the object
   * `CombatantUi` builds per match and hands every taunt command to. Three facts
   * come off it that a player otherwise has to guess: whether the connection is
   * open at all (`sendTaunt` returns in silence when it is not), how much of the
   * five-second cooldown is left, and — through `Engine.taunts` — whether the
   * sound this slot would play is even in the client's file system.
   */

  /** The layout in force: slot -> taunt number, always GRID_KEYS.length long. */
  function tauntRows() {
    return CHORD_TABLES ? CHORD_TABLES.tauntLayout(state.taunts) : [];
  }

  /** The match's taunt handler, or null between matches. */
  function tauntHandler() {
    const handler = state.combatant && state.combatant.tauntHandler;
    return handler && typeof handler.sendTaunt === "function" ? handler : null;
  }

  /**
   * What the handler says about sending right now.
   *
   * `open` is the server connection: `sendTaunt` checks `gservCon.isOpen()` and
   * drops the taunt without a word when it is closed, which is every match
   * against the built-in AI. `cool` is what is left of the five seconds
   * `checkAndUpdateLastTauntTime` enforces on the sender's side — read off the
   * handler rather than counted here, so a taunt sent while the overlay was
   * shut is counted too.
   */
  function tauntSendState() {
    const handler = tauntHandler();
    if (!handler) return { handler: null, open: false, cool: 0 };
    let open = false;
    try {
      open = !!(handler.gservCon && handler.gservCon.isOpen());
    } catch (e) {
      note(`could not read the taunt connection (${e && e.message})`, "warn");
    }
    let cool = 0;
    const name = handler.localPlayer && handler.localPlayer.name;
    const last = name && handler.lastTauntTimeByPlayer && handler.lastTauntTimeByPlayer.get(name);
    if (last) cool = Math.max(0, CHORD_TABLES.TAUNT_COOLDOWN - (Date.now() - last));
    return { handler, open, cool };
  }

  /**
   * The client's own key for a taunt, as a code, or 0 for one it has not bound.
   *
   * Off `state.clientHotkeys`, the copy the `addHotKey` hook keeps — the same
   * table the conflict warnings read, and the same one a rebind here writes
   * through. The client's table is keyed by code because that is the lookup a
   * press needs; this is the one question that wants it the other way round.
   */
  function tauntBinding(n) {
    const command = CHORD_TABLES.tauntCommand(n);
    if (!command) return 0;
    for (const [code, bound] of state.clientHotkeys) if (bound === command) return code;
    return 0;
  }

  /**
   * Which taunt sounds this player's country actually has.
   *
   * `Engine.taunts` is a `LazyAsyncResourceCollection` over the client's own
   * `Taunts` directory, so `has` is a promise and this cannot be answered while
   * drawing. Asked once per file per session and painted in when it lands: the
   * files come out of the player's own RA2 import and do not appear mid-match.
   *
   * A country with no file is the ordinary case for an install whose import
   * skipped the folder, and it is worth saying out loud — the taunt is still
   * sent and every other player still hears their own copy, so the one person
   * who hears nothing is the one who pressed the key.
   */
  const tauntFiles = new Map(); // file name -> true | false | null (asked, unanswered)

  function syncTauntFiles() {
    const country = playerCountry();
    const { Engine } = state.modules;
    if (!country || !Engine || !Engine.taunts) return;
    for (let n = 1; n <= CHORD_TABLES.TAUNT_COUNT; n++) {
      const file = CHORD_TABLES.tauntFileName(country, n);
      if (!file || tauntFiles.has(file)) continue;
      tauntFiles.set(file, null);
      Promise.resolve(Engine.taunts.has(file))
        .then((has) => {
          tauntFiles.set(file, !!has);
          paintTaunts();
        })
        .catch((e) => {
          // Deleted rather than left as "asked": a lookup that threw is not an
          // answer, and the next open should ask again.
          tauntFiles.delete(file);
          note(`could not look up ${file} (${e && e.message})`, "warn");
        });
    }
  }

  /**
   * The country's flag, as the client's own picture, or "" for an install that
   * has not got one.
   *
   * `gui/component/Image` is the path this copies: a `.pcx` out of the VFS
   * through `PcxFile#toDataUrl`, memoised in `ImageContext.imageUrlCache`. The
   * cache is asked first because it usually answers — the loading screen draws
   * a `CountryIcon` for every player in the match, so this match's flags are
   * already decoded by the time an overlay can be opened — and the CDN branch
   * is the client's too: an install served from the CDN has no mix files in the
   * VFS at all and the same asset sits beside the origin as a `.png`.
   */
  const flagUrls = new Map();

  function countryFlagUrl(country) {
    const faction = country && FACTIONS[country];
    const file = faction && faction.flag;
    if (!file) return "";
    if (flagUrls.has(file)) return flagUrls.get(file);
    const { ImageContext, PcxFile, Engine } = state.modules;
    const vfs = (ImageContext && ImageContext.vfs) || (Engine && Engine.vfs);
    // Nothing to ask yet. Not cached, because "the modules are not in" is a
    // state that ends, unlike an install without the file.
    if (!ImageContext && !vfs) return "";
    let url = "";
    try {
      const cached = ImageContext && ImageContext.imageUrlCache && ImageContext.imageUrlCache.get(file);
      if (cached) url = cached;
      else if (vfs && PcxFile && vfs.fileExists(file)) url = new PcxFile(vfs.openFile(file)).toDataUrl();
      else if (ImageContext && ImageContext.cdnBaseUrl) {
        url = ImageContext.cdnBaseUrl + file.slice(0, file.lastIndexOf(".")) + ".png";
      }
    } catch (e) {
      note(`could not read the ${country} flag (${e && e.message})`, "warn");
    }
    // A miss is cached too: a flag this install does not hold will not appear
    // in it, and without this the miss costs a VFS walk on every repaint.
    flagUrls.set(file, url);
    return url;
  }

  /**
   * The strip over the grid: whose taunts these are.
   *
   * It is there because the words on the tiles are only true for one country —
   * every country has its own eight, and the same key says something else in
   * the next match. Rebuilt only when the country changes rather than on every
   * repaint: an `<img>` with a data URL in it re-decodes when its src is set,
   * and four times a second is a flicker.
   */
  let tauntCountryShown = null;

  function paintTauntCountry() {
    const el = tauntEl && tauntEl.querySelector(".cdc-taunt-country");
    if (!el) return;
    const country = playerCountry();
    if (country === tauntCountryShown) return;
    tauntCountryShown = country;
    el.textContent = "";
    el.classList.toggle("cdc-taunt-nocountry", !country);
    if (!country) {
      // Between matches there is no country and therefore no words. The tiles
      // fall back to what each taunt is *for*, and this says why.
      el.textContent = "no country yet — the tiles say what each key is for";
      return;
    }
    const url = countryFlagUrl(country);
    if (url) {
      const flag = document.createElement("img");
      flag.className = "cdc-taunt-flag";
      flag.src = url;
      flag.alt = "";
      el.append(flag);
    }
    const name = document.createElement("span");
    name.className = "cdc-taunt-country-name";
    const faction = FACTIONS[country];
    name.textContent = (faction && faction.label) || country;
    el.append(name);
  }

  let tauntEl = null;
  let tauntTimer = 0;

  function toggleTaunts(force) {
    const want = force === undefined ? !state.taunt : !!force;
    if (want === !!state.taunt) return want;
    if (want) {
      // The two overlays share a layer and spend the same block of keys, so one
      // opening closes the other rather than stacking a second box on it.
      closeChord();
      state.taunt = { listening: -1 };
      syncTauntFiles();
    } else {
      state.taunt = null;
    }
    renderTaunts();
    return want;
  }

  function closeTaunts() {
    if (!state.taunt) return;
    state.taunt = null;
    renderTaunts();
  }

  /** The line under the title: what the keys and the mouse do here. */
  function tauntHint() {
    if (state.taunt && state.taunt.listening >= 0) {
      return "press the key this taunt should have in the game — Esc cancels";
    }
    const at = tauntSendState();
    if (!at.handler) return "no match — nothing to taunt in";
    if (!at.open) return "not connected — a taunt would go nowhere";
    if (at.cool > 0) return `cooling down — ${(at.cool / 1000).toFixed(1)}s · Esc closes`;
    return "a key sends it · click a game key to rebind it · Esc closes";
  }

  function renderTaunts() {
    if (!state.taunt) {
      if (tauntEl) tauntEl.remove();
      tauntEl = null;
      window.removeEventListener("mousedown", onTauntMouseDown, true);
      window.removeEventListener("contextmenu", onOverlayContextMenu, true);
      syncOverlayMouse();
      syncTauntTimer();
      return;
    }

    if (tauntEl) tauntEl.remove();
    tauntEl = document.createElement("div");
    tauntEl.className = "cdc-chord cdc-taunt";

    const head = document.createElement("div");
    head.className = "cdc-chord-head";
    head.textContent = "Taunts";
    const hint = document.createElement("span");
    hint.className = "cdc-chord-hint";
    hint.textContent = tauntHint();
    head.append(hint);
    tauntEl.append(head);

    // Whose taunts these are. Filled by paintTauntCountry, which owns it
    // because the country can still be resolving when the overlay opens.
    const country = document.createElement("div");
    country.className = "cdc-taunt-country";
    tauntEl.append(country);
    tauntCountryShown = null;

    const rows = tauntRows();
    const grid = document.createElement("div");
    grid.className = "cdc-chord-grid";
    grid.style.setProperty("--cols", String(GRID_COLS));
    const height = CHORD_TABLES.chordGridRows(rows.map(Boolean), GRID_COLS);
    rows.slice(0, height * GRID_COLS).forEach((n, slot) => {
      // An empty slot keeps its cell, for the reason the build grid's does: the
      // geometry is the keyboard's, and a hole that closed up would move every
      // key after it.
      if (!n) {
        const gap = document.createElement("i");
        gap.className = "cdc-chord-gap";
        grid.append(gap);
        return;
      }
      const tile = document.createElement("button");
      tile.type = "button";
      tile.className = "cdc-chord-slot cdc-taunt-slot";
      tile.dataset.slot = String(slot);
      tile.dataset.taunt = String(n);

      const key = document.createElement("i");
      key.className = "cdc-chord-key";
      key.textContent = keyLabelFor(slot);

      // The taunt's own number, beside the key rather than across the tile from
      // it. It is the only name the options page's slot editor has for a taunt,
      // so it is the one thing that joins the two screens — the words are the
      // country's, and the editor has no country.
      const num = document.createElement("i");
      num.className = "cdc-taunt-num";
      num.textContent = String(n);

      // The two of them in a rail down the left, which is the whole of the
      // 1.15.0 reshape: as corner badges they cost the tile an empty band
      // across its top to clear them, and in a column they cost the width they
      // occupy. The options page draws the same rail.
      const rail = document.createElement("i");
      rail.className = "cdc-taunt-rail";
      rail.append(key, num);

      // What it says. Left empty here and filled by paintTaunts, because the
      // words are the country's and the country can arrive after the open.
      const label = document.createElement("span");
      label.className = "cdc-chord-name";
      // The box that holds their space, and the box the hover reveal positions
      // against — so the reveal needs no number for where the words start.
      const words = document.createElement("span");
      words.className = "cdc-taunt-words";
      words.append(label);

      // The client's own key for this taunt, and the control that changes it.
      // One element rather than a label and a button apart: the fact and the
      // way to change it are the same thing, and this overlay is the only
      // surface in the extension that has the fact at all.
      const bind = document.createElement("i");
      bind.className = "cdc-taunt-bind";

      // The world takes a mousedown as an order, so the tile swallows its own
      // before the client sees it — the same guard the grid's tiles carry.
      tile.addEventListener("mousedown", (e) => e.stopPropagation(), true);
      const body = document.createElement("span");
      body.className = "cdc-taunt-body";
      body.append(words, bind);
      tile.append(rail, body);
      grid.append(tile);
    });
    tauntEl.append(grid);

    if (!height) {
      const none = document.createElement("div");
      none.className = "cdc-chord-none";
      none.textContent = "no taunt is on a key — the options page puts them back";
      tauntEl.append(none);
    }

    chordLayer().append(tauntEl);
    placeAtPointer(tauntEl);
    paintTaunts();
    window.addEventListener("mousedown", onTauntMouseDown, true);
    // The same swallow the grid does, for the same reason: a right click over a
    // match is an order, and the browser's menu on top of it is nobody's
    // intention.
    window.addEventListener("contextmenu", onOverlayContextMenu, true);
    syncOverlayMouse();
    syncTauntTimer();
  }

  /**
   * The half of a tile that moves: the game key, the cooldown, and whether the
   * sound is there.
   *
   * Split from `renderTaunts` for the reason `paintChordQueues` is: a tile that
   * rebuilt its own children four times a second could not be hovered or
   * clicked, and three of these facts change under an open overlay.
   */
  function paintTaunts() {
    if (!tauntEl) return;
    const hintEl = tauntEl.querySelector(".cdc-chord-hint");
    if (hintEl) hintEl.textContent = tauntHint();
    const at = tauntSendState();
    const country = playerCountry();
    paintTauntCountry();
    const listening = state.taunt ? state.taunt.listening : -1;
    // Names whose words changed this pass, measured together at the end.
    const measure = [];
    for (const tile of tauntEl.querySelectorAll(".cdc-taunt-slot")) {
      const slot = Number(tile.dataset.slot);
      const n = Number(tile.dataset.taunt);
      const bind = tile.querySelector(".cdc-taunt-bind");
      // The words this country says, or — between matches, and for a country
      // the table has no lines for — what the taunt is for. The fallback is
      // marked, because a role is not a quote and must not read as one.
      const line = CHORD_TABLES.tauntLine(country, n);
      const role = CHORD_TABLES.tauntRole(n);
      const nameEl = tile.querySelector(".cdc-chord-name");
      const words = line || role;
      if (nameEl.textContent !== words) {
        nameEl.textContent = words;
        nameEl.classList.toggle("cdc-taunt-role", !line);
        measure.push(nameEl);
      }
      const code = tauntBinding(n);
      const label = code ? CHORD_TABLES.clientKeyLabel(code) : "no game key";
      bind.textContent = slot === listening ? "press a key…" : label;
      bind.classList.toggle("listening", slot === listening);
      bind.classList.toggle("unbound", !code);
      // Nothing to play: the taunt is still sent and every other player hears
      // their own copy of it, so this dims the tile rather than disabling it.
      const file = CHORD_TABLES.tauntFileName(country, n);
      const silent = !!file && tauntFiles.get(file) === false;
      tile.classList.toggle("cdc-chord-off", silent || !at.open || at.cool > 0);
      tile.classList.toggle("cdc-taunt-silent", silent);
      tile.title =
        `Taunt ${n} (${role}) — ${keyLabelFor(slot)} sends it` +
        (code ? `, ${label} in the game` : ", no key in the game") +
        (line ? `\n"${line}"` : "") +
        (silent ? ` · ${file} is not in the client's Taunts folder, so you will not hear it` : "");
    }
    // Whether the three-line clamp bit, which is whether hovering the tile has
    // anything left to show. Read after every write above rather than beside
    // each one: `scrollHeight` forces a layout, this runs four times a second,
    // and one read per tile interleaved with the writes would force eight.
    for (const nameEl of measure) {
      nameEl.classList.toggle("cdc-taunt-clipped", nameEl.scrollHeight > nameEl.clientHeight + 1);
    }
  }

  /**
   * A quarter-second repaint while the overlay is up.
   *
   * The cooldown is the only thing here with no event behind it — the handler
   * writes a timestamp and dispatches nothing — and 250 ms is what makes a
   * counted-down tenth of a second look counted rather than stepped.
   */
  function syncTauntTimer() {
    const want = !!tauntEl;
    if (want === !!tauntTimer) return;
    if (!want) {
      clearInterval(tauntTimer);
      tauntTimer = 0;
      return;
    }
    tauntTimer = setInterval(() => {
      if (!tauntEl) {
        syncTauntTimer();
        return;
      }
      paintTaunts();
    }, 250);
  }

  /**
   * Send one, through the client's own command.
   *
   * `runCommand` rather than `tauntHandler.sendTaunt` — the command is what the
   * client's own key runs, so the trigger mode, the pause while a menu is up
   * and every other rule around it stay the client's. The overlay closes on the
   * way out: a taunt is one press with a five-second cooldown behind it, so
   * there is never a second thing to do with an open one.
   */
  function sendTauntSlot(slot) {
    const n = tauntRows()[slot];
    if (!n) return;
    const at = tauntSendState();
    if (!at.handler) {
      buildNote("no match — the taunt went nowhere");
      closeTaunts();
      return;
    }
    if (!at.open) {
      buildNote("not connected — a taunt is only ever sent to other players");
      return;
    }
    if (at.cool > 0) {
      buildNote(`taunts are on a cooldown — ${(at.cool / 1000).toFixed(1)}s left`);
      return;
    }
    runCommand(CHORD_TABLES.tauntCommand(n));
    closeTaunts();
  }

  /**
   * Rebind one taunt **in the client**, from the next key pressed.
   *
   * `KeyBinds#changeHotKey` is the client's own Options → Keyboard call: it
   * drops whatever code the command had and takes the new one. `save()` then
   * writes the whole table to `keyboard.ini` in the client's file system, which
   * is what makes the new key survive a reload — the same file the settings
   * backup reads and writes.
   *
   * Two things the client's own screen does not say, and this does. `hotKeys`
   * is keyed by code, so binding a taken code **displaces** the command that
   * had it, in silence — that is how a stock install loses `HealthNav` to
   * `PageUser` on `U`. And a key this extension consumes never reaches the
   * client at all, so binding a taunt to one would produce a binding that is
   * real, saved and dead. Both are reported; neither is refused, because a
   * player may mean either.
   */
  function beginTauntRebind(slot) {
    if (!state.taunt) return;
    if (!state.keyBinds) {
      buildNote("the client's key table has not been seen yet — start a match first");
      return;
    }
    state.taunt.listening = state.taunt.listening === slot ? -1 : slot;
    paintTaunts();
  }

  function applyTauntRebind(e) {
    const slot = state.taunt ? state.taunt.listening : -1;
    const n = slot >= 0 ? tauntRows()[slot] : 0;
    const binds = state.keyBinds;
    state.taunt.listening = -1;
    if (!n || !binds) {
      paintTaunts();
      return;
    }
    const command = CHORD_TABLES.tauntCommand(n);
    let code = 0;
    try {
      code = binds.getHotKeyCode(e);
    } catch (err) {
      note(`could not hash that key (${err && err.message})`, "warn");
    }
    // `getCommandType` refuses a `keyCode` above 255 before it even looks at
    // the table, so a key the client could never match again is refused here
    // rather than written into a table that would never answer it.
    if (!code || e.keyCode > 255) {
      buildNote("the game cannot store that key");
      paintTaunts();
      return;
    }
    const displaced = state.clientHotkeys.get(code);
    const was = tauntBinding(n);
    try {
      binds.changeHotKey(command, code);
    } catch (err) {
      note(`the client refused the binding (${err && err.message})`, "warn");
      buildNote("the game refused that key");
      paintTaunts();
      return;
    }
    if (was) state.clientHotkeys.delete(was);
    state.clientHotkeys.set(code, command);
    const label = CHORD_TABLES.clientKeyLabel(code);
    const ours = ourKeyOn(e);
    // Saved first and reported after, so the line the player reads is about a
    // binding that is on disk rather than one that is about to be.
    Promise.resolve()
      .then(() => binds.save())
      .then(() => {
        buildNote(
          `Taunt ${n} is now ${label}` +
            (displaced && displaced !== command ? ` — ${displaced} lost that key` : "") +
            (ours ? " — but the extension takes that key first" : "")
        );
      })
      .catch((err) => {
        note(`the new binding was not written to the client's file (${err && err.message})`, "warn");
        buildNote(`Taunt ${n} is ${label} until the page reloads — the game would not save it`);
      });
    paintTaunts();
  }

  /**
   * Is this press one the extension swallows before the client sees it?
   *
   * The fixed panel keys and the command bindings only: the build keys and the
   * grid's slots live under a match and a chord, and naming them here would
   * warn about a collision that exists only in a state the player is not in.
   */
  function ourKeyOn(e) {
    const id = eventBindingId(e);
    for (const name of Object.keys(ownKeys(state.keys))) {
      const bound = state.keys[name];
      if (bound && bindingId(bound) === id) return true;
    }
    return commandBindings().has(id);
  }

  /**
   * A press while the overlay is up. Returns whether it was consumed.
   *
   * Everything is consumed while a rebind is listening — that is the whole of
   * what "press a key" means, and a press that leaked through would both bind
   * the taunt and do whatever else that key does.
   */
  const TAUNT_MODIFIER_CODES = [
    "ControlLeft", "ControlRight", "AltLeft", "AltRight",
    "ShiftLeft", "ShiftRight", "MetaLeft", "MetaRight",
  ];

  function tauntKey(e) {
    if (!state.taunt) return false;
    if (state.taunt.listening >= 0) {
      // A modifier on its own is never a whole binding: the client would hash
      // it into a code with no key in it, which no press can ever match.
      if (TAUNT_MODIFIER_CODES.includes(e.code)) return true;
      if (e.code === "Escape") {
        state.taunt.listening = -1;
        paintTaunts();
        return true;
      }
      applyTauntRebind(e);
      return true;
    }
    if (e.code === "Escape" || matchesHotkey(e, state.keys.taunts)) {
      closeTaunts();
      return true;
    }
    const slot = CHORD_TABLES.GRID_KEYS.indexOf(e.code);
    // Bare presses only. A modified press on a slot key is not a slot key —
    // Alt is the grid's cancel and Ctrl its "queue next", and an overlay that
    // answered them here would be teaching one block of keys two sets of rules.
    if (slot >= 0 && !e.altKey && !e.ctrlKey && !e.shiftKey && !e.metaKey) {
      if (!tauntRows()[slot]) {
        buildNote(`nothing on ${keyLabelFor(slot)}`);
        return true;
      }
      sendTauntSlot(slot);
      return true;
    }
    return false;
  }

  /**
   * A press of the mouse while the overlay is up.
   *
   * The same two states the grid's handler deals with: under a pointer lock the
   * event carries no usable coordinates and never reaches our elements, so the
   * tile is found by hand at the cursor the client draws. The right button is
   * the rebind — it is the button the grid uses for the other thing a tile can
   * do, and there is no `click` for it to fall through to.
   */
  function onTauntMouseDown(e) {
    if (!tauntEl) return;
    const target = mouseCaptured() ? underCursor() : e.target;
    const tile = target && target.closest ? target.closest(".cdc-taunt-slot") : null;
    if (tile && tauntEl.contains(tile)) {
      e.preventDefault();
      e.stopPropagation();
      const slot = Number(tile.dataset.slot);
      if (!Number.isInteger(slot)) return;
      const onBind = e.button === 2 || !!(target.closest && target.closest(".cdc-taunt-bind"));
      if (onBind) beginTauntRebind(slot);
      else sendTauntSlot(slot);
      return;
    }
    if (!mouseCaptured() && tauntEl.contains(e.target)) return;
    e.preventDefault();
    e.stopPropagation();
    closeTaunts();
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
      // **The taunt overlay is answered first, and answers everything.** It is
      // ours, it is modal while a rebind is listening, and its slot keys are the
      // same left-hand block the build grid spends — so a press reaching the
      // routing below could open a grid under an overlay that was going to
      // consume it. Above the route rather than inside it because that table is
      // about which of the *client's* layers a press belongs to, and this
      // overlay is not one of them.
      if (state.taunt && tauntKey(e)) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
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
        : matchesHotkey(e, state.keys.taunts)
        ? toggleTaunts
        : matchesHotkey(e, state.keys.net)
        ? toggleNet
        : matchesHotkey(e, state.keys.memory)
        ? toggleMemory
        : matchesHotkey(e, state.keys.sidebar)
        ? toggleSidebar
        : matchesHotkey(e, state.keys.radar)
        ? toggleRadar
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
      // The beacon, ahead of everything: `ourButton` returns the two ordinary
      // buttons on untouched, and this gesture is on one of them. It takes the
      // press only when it has a tile to put a beacon on, so an Alt+right that
      // finds nothing is still the client's ordinary right click.
      if (worldPing(e)) {
        mouseHeld = e.button;
        return;
      }
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

  // Where a chord grid opens, and where a panel drag reads the cursor. Passive,
  // and `trackPointer` stores two points and nothing else: this fires on every
  // mouse move over a running match. Capture, so the position is already this
  // move's by the time a drag's own listener runs.
  window.addEventListener("mousemove", trackPointer, { passive: true, capture: true });

  // A lock given up drops the integrated point, so the next one starts from
  // where the cursor really is rather than from wherever the last one left it.
  //
  // Only on release, and the condition is the whole of it. `state.pointer` is
  // the truth exactly while the mouse is free and frozen while it is not, so
  // reseeding from it under a held lock writes back the very stale position
  // `trackPointer` exists to replace. That is not hypothetical: Chromium fires
  // this event again every time `requestPointerLock()` is called on the element
  // that already holds the lock, which the client does on every click in a
  // match — measured in scripts/drive-drag.mjs, where an unguarded reseed put
  // the cursor back at the lock point after each press and the panel stopped
  // moving again halfway through the run. Nothing is needed on acquisition:
  // `trackPointer` holds the two points equal for as long as the mouse is free,
  // so the integration is already seeded correctly when the lock takes.
  document.addEventListener("pointerlockchange", () => {
    if (mouseCaptured()) return;
    state.lockedPointer = state.pointer ? { x: state.pointer.x, y: state.pointer.y } : null;
  });

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
      // Whether this install has taunt sounds at all — the one fact behind
      // "nothing to play" on the settings page, answerable here without
      // pressing anything. `rfsDir` is set by `Engine.initVfs`, so "not yet"
      // and "not there" are the same answer until the client has loaded its
      // game files, which `vfs` is what says.
      tauntSounds: (() => {
        const Engine = state.modules && state.modules.Engine;
        if (!Engine) return "the Engine module did not load";
        if (!Engine.vfs) return "n/a — this client has not loaded its game files yet";
        if (Engine.taunts && Engine.taunts.rfsDir) return "yes";
        return `no — nothing imported a "${(Engine.rfsSettings && Engine.rfsSettings.tauntsDir) || "Taunts"}" folder`;
      })(),
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
    // Why a panel would not move. Hover the thing you would grab, then read
    // this: it repeats onPanelMouseDown's decision without acting on it.
    drag: dragReport,
    queues: toggleQueues,
    taunts: toggleTaunts,
    net: toggleNet,
    memory: toggleMemory,
    // The samples behind the panel, for a report from a player whose tab keeps
    // dying: `copy(__cdc.memTrace())` is the whole curve rather than the one
    // reading the panel happens to be showing.
    memTrace: () => (memMeter ? { previous: memMeter.lastSession(), samples: memMeter.samples() } : null),
    overlay: toggleIngame,
    // Our own radar, from our own render. Takes a force argument like the rest,
    // so a check or a console can open it without toggling whatever it was.
    radar: toggleRadar,
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

  /**
   * How long to wait for a client that is still starting.
   *
   * Longer than `SETTINGS_WAIT_MS`, and the difference is the point.
   * `Engine.rfs` exists after `initRfs`, which runs before the game files are
   * even chosen — that is early enough to read `keyboard.ini` and far too early
   * to ask about taunts, because it is `initVfs` that points
   * `Engine.taunts` at the folder, and `initVfs` runs at the end of
   * `loadResources`. A tab opened for this request a second ago is at the
   * splash screen; answering from there says "you have no taunts" about a
   * client that has not looked yet.
   */
  const TAUNT_WAIT_MS = 120000;

  /** Once the client has a VFS, the rest of the answer is milliseconds away. */
  const TAUNT_SETTLE_MS = 8000;

  /**
   * The client's `Taunts` directory, once the client has one to give.
   *
   * `Engine.taunts.rfsDir` first, because that is the object the client's own
   * playback reads and it is set by `initVfs` — asking the file system again
   * would be a second opinion about the same folder. The direct lookup is the
   * fallback for a client that has an `rfs` but never reached `initVfs`, which
   * is every CDN install.
   *
   * @returns {Promise<{dir: object|null, booted: boolean, name: string}>}
   */
  async function tauntsDirectory(Engine) {
    const name = (Engine.rfsSettings && Engine.rfsSettings.tauntsDir) || "Taunts";
    let deadline = Date.now() + TAUNT_WAIT_MS;
    let booted = false;
    for (;;) {
      const dir =
        (Engine.taunts && Engine.taunts.rfsDir) ||
        (Engine.rfs && (await Engine.rfs.findDirectory(name))) ||
        null;
      if (dir) return { dir, booted: true, name };
      // `initVfs` sets `vfs` first and points the collection at the folder two
      // awaits later, so this is "nearly there" rather than "there" — hence a
      // settle rather than an answer.
      if (!booted && Engine.vfs) {
        booted = true;
        deadline = Math.min(deadline, Date.now() + TAUNT_SETTLE_MS);
      }
      if (Date.now() > deadline) return { dir: null, booted, name };
      await new Promise((resolve) => setTimeout(resolve, 400));
    }
  }

  /** A few entry names, for a message that has to explain an absence. */
  async function someEntries(dir, limit) {
    if (!dir || typeof dir.listEntries !== "function") return null;
    try {
      const all = await dir.listEntries();
      return { count: all.length, sample: all.slice(0, limit) };
    } catch (e) {
      note(`could not list ${(dir.name || "a directory")} (${e && e.message})`, "warn");
      return null;
    }
  }

  /**
   * One taunt's sound, as a data URL the options page can hand to an `<audio>`.
   *
   * Why it is a round trip at all: the taunt files are the player's own import
   * and live in the client's **origin-private file system**, which is per
   * origin. An extension page cannot open it — only a script running on
   * `game.chronodivide.com` can — so the settings page asks and this answers,
   * the same way the settings backup reads `keyboard.ini`.
   *
   * **The file on disk is not playable and has to be converted.** RA2 ships its
   * taunts as **4-bit IMA ADPCM** inside a RIFF wrapper, and no browser decodes
   * that: an `<audio>` handed one answers *"Failed to load because no supported
   * source was found"*, which is exactly what a player reported against 1.17.3.
   * The client never uses `<audio>` — `WavFile#getData` runs the same
   * `wavefile` conversion (`bitDepth === "4"` → `fromIMAADPCM()` → `toBuffer()`)
   * that its own mixer is fed from — so this borrows the client's own decoder
   * and ships PCM. A file that is already PCM round-trips through the same call
   * unharmed, so there is nothing to branch on.
   *
   * `FileReader` does the base64 rather than a hand-rolled `btoa` loop — the
   * same encoding, without the chunking a 60 KB `String.fromCharCode.apply`
   * needs to avoid blowing the stack.
   *
   * An absence answers `missing` rather than throwing, and carries **why**: a
   * player told only "not found" cannot tell an install that never imported the
   * folder from a client that had not finished starting, and those two want
   * opposite things done about them.
   */
  async function readTauntWav(file) {
    const sys = window.System || window.SystemJS;
    if (!sys || typeof sys.import !== "function") throw new Error("SystemJS not on the page");
    const { Engine } = await sys.import("engine/Engine");
    // Still the settings job's wait, and still for its reason — this may be a
    // tab opened a second ago — but only as the floor: tauntsDirectory waits
    // for the part of the boot that actually decides the answer.
    await clientRootDir();
    const { dir, booted, name } = await tauntsDirectory(Engine);
    if (!dir) {
      const root = await someEntries(Engine.rfs && Engine.rfs.getRootDirectory(), 12);
      return {
        missing: true,
        wav: "",
        why:
          `this client has no "${name}" folder` +
          (booted ? "" : " and did not finish loading its game files in two minutes") +
          (root
            ? ` — its storage holds ${root.count} entr${root.count === 1 ? "y" : "ies"}` +
              (root.count ? `: ${root.sample.join(", ")}` : "")
            : ""),
      };
    }
    if (!(await dir.containsEntry(file))) {
      const held = await someEntries(dir, 8);
      return {
        missing: true,
        wav: "",
        why:
          `"${name}" is there but holds no ${file}` +
          (held
            ? ` — ${held.count} file(s) in it` + (held.count ? `, e.g. ${held.sample.join(", ")}` : "")
            : ""),
      };
    }
    const raw = await dir.getRawFile(file);
    const bytes = new Uint8Array(await raw.arrayBuffer());
    let pcm = bytes;
    try {
      const { WavFile } = await sys.import("data/WavFile");
      pcm = new WavFile(bytes).getData();
    } catch (e) {
      // Sent as it lies rather than not at all: a file this cannot convert may
      // still be one the browser can play, and the alternative is silence with
      // a message about a library.
      note(`${file} would not convert (${e && e.message}) — sending it unchanged`, "warn");
    }
    // Retyped through a Blob: an OPFS file carries no MIME type, and a
    // `data:;base64,` URL is not something every browser will play.
    const blob = new Blob([pcm], { type: "audio/wav" });
    const wav = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error || new Error("the file could not be read"));
      reader.readAsDataURL(blob);
    });
    return { missing: false, wav, why: "" };
  }

  async function runTauntWavJob(file) {
    const answer = {
      source: "cdc-page",
      type: "taunt-wav-result",
      file,
      ok: false,
      missing: false,
      wav: "",
      why: "",
      error: "",
    };
    try {
      const read = await readTauntWav(String(file || ""));
      answer.ok = true;
      answer.missing = read.missing;
      answer.wav = read.wav;
      answer.why = read.why || "";
      note(read.missing ? `${file}: ${read.why}` : `${file} sent to the options page`, read.missing ? "warn" : "info");
    } catch (e) {
      answer.error = (e && e.message) || String(e);
      note(`could not read ${file} — ${answer.error}`, "warn");
    }
    window.postMessage(answer, "*");
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
