/**
 * Companion for Chrono Divide — full map render.
 *
 * The preview shipped inside a map file ([PreviewPack]) is a couple of pixels
 * per cell, so no amount of upscaling makes a cell readable. This renders the
 * map from its own cell data through the client's own art — terrain tiles, ore,
 * walls, bridges, trees, smudges and structures — the way the map renders posted
 * around the community are made.
 *
 * Everything below uses the client's decoders rather than reimplementing a
 * format; the module names and call shapes below are quoted from the client's
 * own bundle, read at v0.83.3.
 *
 *   Engine.loadTheater(type)    -> Theater { tileSets, palettes }
 *   new GameMap(mapFile, …)     -> TileCollection, with the engine's LAT smoothing
 *   TmpDrawable#draw(img, w, h) -> palette indices for one terrain tile
 *   new Rules / new Art         -> what an object is called, which SHP it draws as
 *   ImageFinder                 -> art name + theater -> ShpFile
 *
 * Geometry. TMP pixel space is also the client's screen space
 * (IsoCoords.screenTileToScreen: x = dx·30, y = dy·15, one height level = 15px
 * up), so a cell's diamond has its top-left bounding corner at
 * (dx·30, dy·15 − z·15), and an SHP's own canvas is centred on that cell.
 * That last part is checked against the running game rather than derived: the
 * client places sprites through 3D billboard geometry that does not reduce to
 * flat pixel arithmetic, and reproducing its MapSpriteTranslation offsets here
 * moved every object off its cell. What is left over per sprite type is
 * SPRITE_FIX below — measured, not calculated. `tune` nudges every pass at once.
 *
 * Marks. Everything drawn on top of the art — harvest fields, spawn blocks,
 * building outlines and the thumbnail's pictograms — comes in two styles
 * (MARK_STYLES). The full render is zoomed into and gets marks traced on true
 * cells; the thumbnail is 400px of a 150-cell map and gets a vocabulary that
 * survives three pixels per cell.
 *
 * companion.js renders each map once as it loads and stores the result; from the
 * console, __cdcHq.render() draws whatever map is loaded and __cdcHq.sample()
 * captures it split into per-type layers for the options page's alignment panel.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion:hq]";

  /**
   * What a render *looks like*, as a number. Bump it whenever a change makes an
   * already-stored render out of date — new marks, moved sprites, a different
   * crop, a different set of sizes asked for in companion.js.
   *
   * It is stamped onto every stored render, which is the only thing that makes
   * "which of these are behind" answerable without looking at them. Two things
   * read it: the auto-render stops treating a stale render as "already stored",
   * and a bulk run redoes exactly the ones that are behind.
   *
   * Deliberately hand-maintained rather than derived from the extension version:
   * most releases do not change a pixel, and a stamp that moved every release
   * would mark the whole catalogue stale for nothing.
   *
   * 1 — the first stored renders.
   * 2 — outlines under the buildings; the thumbnail's own compact marks
   *     (2026-08-07, [[map-preview-hq]] rounds 4 and 4a).
   * 3 — scenery stopped being marked as a player's building: the gate is
   *     capturable-or-handed-over, not owned (2026-08-08, iconFor).
   * 4 — the droplet, parachute and wrench redrawn (2026-08-09, ICON_GLYPHS).
   *     Every stored render of a map with a tech building differs.
   * 5 — CAOUTP is a repair depot, not a free vehicle: it takes the wrench and
   *     the tank glyph is gone (2026-08-09, BUILDING_ICONS).
   * 6 — the full render marks tech buildings with a pictogram above them, not
   *     an outline alone; the parachute and wrench are drawn half again as big
   *     at both sizes; the droplet's bowl sank and its tail thinned
   *     (2026-08-09, MARK_STYLES.detail, ICON_SCALE, ICON_GLYPHS).
   * 7 — the full render stopped baking those badges in: it hands their
   *     placements back and whoever shows it draws them, so they can be
   *     switched off without re-rendering (2026-08-09, result.icons).
   * 8 — the offsets dialled on one machine became the shipped table: buildings
   *     at −14 rather than the shared −13, and the tech airport at −16 of its
   *     own (2026-08-21, SPRITE_FIX and SPRITE_FIX_BY_NAME). Every stored
   *     render holding a building was drawn with the old number and stands a
   *     pixel high; the airport stands three. Visible enough to be reported
   *     from a card, which is what moved this.
   * 9 — a per-object correction replaces its type's instead of adding to it
   *     (2026-08-21, queue). The panel dials a named layer from zero, so its
   *     number was already the whole correction; added, the building offset was
   *     counted twice and every airport drew half a cell high. Only maps with
   *     one differ, but the stamp is per build.
   */
  const RENDERER_VERSION = 9;

  /**
   * What `survey` counts and how, stamped onto every stored survey.
   *
   * Separate from RENDERER_VERSION because they invalidate different things: a
   * change to how a sprite is *placed* leaves the tally correct, and a change to
   * what counts as ore makes every stored tally wrong while the pictures stay
   * fine. A consumer reads this to know whether the answer it is about to give
   * was counted the way it counts today.
   *
   * 1 — first: per-type tallies, a name tally, and structures grouped by kind
   *     (2026-08-12).
   */
  const SURVEY_VERSION = 1;

  /**
   * How `cameos` builds its sheet, stamped onto every stored harvest beside the
   * client's own version.
   *
   * Both halves are needed and neither is enough. The client's version moves
   * when its art does, and this moves when the *harvest* changes — a different
   * crop, a different layout, a new borrow — which leaves every stored sheet
   * wrong while the client that produced it is unchanged. A stored harvest is
   * current only when both agree.
   *
   * 1 — first: the four techno lists unfiltered, `Cameo=` off the art, the two
   *     construction yards borrowing their MCV's picture, and the superweapons
   *     from `SidebarImage=` (2026-08-20).
   * 2 — the borrow asks the built index rather than the nominations, so a
   *     borrower whose own art names a picture the client does not ship gets
   *     the lender's cell instead of nothing (2026-08-21). Every sheet
   *     harvested before this is short of both construction yards — 405 ids
   *     off the author's own store, with GACNST and NACNST absent — and the
   *     client that produced it is unchanged, which is exactly the case this
   *     half of the stamp exists for.
   */
  const CAMEO_VERSION = 2;

  /**
   * How `objectTypes` reads the client's object table, stamped onto every
   * stored harvest beside the client's own version — the same two halves
   * `CAMEO_VERSION` above is one of, and for the same reason: the client's
   * version alone leaves a stored table wrong whenever the *harvest* changes,
   * and this alone never notices a client that reordered its rules.
   *
   * 1 — first: the four ordinal maps walked as ordinals, display names through
   *     the client's string table, `[General]` for the queue model
   *     (2026-08-21).
   */
  const TYPES_VERSION = 1;

  /**
   * The crop the sheet is laid out in: the top 36 rows of the game's 60x48
   * cameo, which is the picture without the name band painted across the bottom
   * of it. The band is localised — the art in a Russian install reads Russian —
   * so cropping it is what makes one sheet serve every language.
   */
  const CAMEO_CELL = { width: 60, height: 36 };
  const CAMEO_COLS = 16;

  /**
   * Ids drawn with another object's picture, because they end the harvest with
   * no cell of their own: a construction yard is the MCV after it deploys, and
   * the sidebar never has to draw one, so RA2 never gave it a usable cameo.
   *
   * Borrower -> lender. Applied against the **built index**, not against the
   * nominations — see the loop in `cameos`, which is where that distinction
   * cost both construction yards.
   *
   * The deleted `scripts/gen-cameos.mjs` borrowed for **four** ids — these two
   * plus HORV and CMON, the back-less miner variants. Those two are absent here
   * on purpose, not by oversight: the probe found the client resolves both
   * through `Art#getObject`, which follows the `Image=` indirection that that
   * generator's byte-search over the art text did not. Borrowing for an id that
   * already has a picture would quietly shadow the real one.
   */
  const CAMEO_BORROWED = { GACNST: "AMCV", NACNST: "SMCV" };

  const MODULE_IDS = {
    engine: "engine/Engine",
    rules: "game/rules/Rules",
    art: "game/art/Art",
    objectArt: "game/art/ObjectArt",
    objectType: "engine/type/ObjectType",
    paletteType: "engine/type/PaletteType",
    imageFinder: "engine/ImageFinder",
    gameMap: "game/GameMap",
    tmpDrawable: "engine/gfx/drawable/TmpDrawable",
    // The engine's own SHP-to-canvas converter, for `cameos`. The file already
    // decodes SHPs its own way for map sprites (shpSprite), against a theater
    // palette and an ImageFinder; a cameo has neither, and src/companion.js
    // already draws superweapon icons through this. One decoder per job beats a
    // second opinion about the same bytes.
    imageUtils: "engine/gfx/ImageUtils",
    bridgeTypes: "game/map/BridgeOverlayTypes",
    color: "util/Color",
    // Where the client keeps `BuildCat` and `FactoryType`, which `objectTypes`
    // needs to name what it reads: both are **numeric** enums on a rules object
    // and strings in the table this file produces, so the enum's own reverse
    // mapping is what turns one into the other. Read out of the shipped bundle
    // rather than assumed (2026-08-21): `BuildCat.Combat` is 0 — falsy, which
    // is exactly how a truthiness test on it would look right and be wrong.
    technoRules: "game/rules/TechnoRules",
    // The eight colours a lobby offers, as the client's own list rather than
    // ours. `colours` below returns every colour in the rules — the whole
    // `[Colors]` section, because that is the set a palette remap is legal for
    // — and this is what says which of them a player could have picked.
    mpColors: "game/rules/mpAllowedColors",
  };

  // TMP blocks are 60×30 for RA2; each tmp file states its own, and only the
  // cell grid below falls back to these.
  const BLOCK = { width: 60, height: 30 };

  // Cells lift up to this many height levels above their own row, and a cliff
  // reaches higher still — the canvas carries the slack as margin.
  const HEADROOM_LEVELS = 16;

  // Map-placed structures belong to civilian houses whose colour a preview has
  // no reason to care about; one neutral remap keeps them legible without
  // implying an owner.
  const NEUTRAL_REMAP = { r: 160, g: 160, b: 170 };

  /**
   * Ore classes, by overlay id range (game/map/OreOverlayTypes). Riparius and
   * Vinifera are ordinary ore, Cruentus and Aboreus are the rich stuff — a
   * patch of each is marked in its own colour, because "how much money is
   * here" is the first thing anyone reads off a map. The ranges overlap at 127,
   * and the client resolves that in this order too.
   *
   * The colour lives in the mark style rather than here: the same patch is a
   * translucent tint on the full render and a solid field on the thumbnail.
   */
  const ORE_CLASSES = [
    { kind: "ore", min: 102, max: 127 },
    { kind: "gems", min: 27, max: 38 },
    { kind: "ore", min: 127, max: 146 },
    { kind: "gems", min: 147, max: 166 },
  ];

  // Ore before gems: a gem patch embedded in ore has to keep its own border.
  const ORE_KINDS = ["ore", "gems"];

  /**
   * One colour per start position, used for both the spawn block and any
   * structure that starts out owned by that player. Deliberately avoids the
   * green of a neutral building and the yellow/violet of the ore outlines, so
   * nothing on the map means two things at once.
   */
  const PLAYER_COLORS = [
    "#3d7bff", // 1 blue
    "#ff3b30", // 2 red
    "#ff9f0a", // 3 orange
    "#ff5cf0", // 4 pink
    "#00e0ff", // 5 cyan
    "#ffffff", // 6 white
    "#a86b3c", // 7 brown
    "#8e8e93", // 8 grey
  ];

  const NEUTRAL_OUTLINE = "#32d74b";

  /**
   * The animations a building shows while it is simply standing there. The rest
   * of BuildingAnimArtProps' keys — buildup, production, super-weapon, factory
   * doors — belong to something happening, and nothing happens in a preview.
   */
  const BUILDING_ANIM_KEYS = [
    "IdleAnim",
    "ActiveAnim",
    "ActiveAnimTwo",
    "ActiveAnimThree",
    "ActiveAnimFour",
  ];

  // Trigger vocabulary, read out of the client rather than a map-editor manual:
  // TriggerActionType.ChangeHouse, TriggerEventType.ElapsedTime, and the house
  // id at which ChangeHouseExecutor stops meaning "country" and starts meaning
  // "whoever plays this start position".
  const CHANGE_HOUSE_ACTION = 14;
  const ELAPSED_TIME_EVENT = 13;
  const LOCATION_HOUSE_ID_BEGIN = 4475;
  const ACTION_STRIDE = 8;

  /** "#rrggbb" -> the { r, g, b } a palette remap wants. */
  function hexToRgb(hex) {
    return {
      r: parseInt(hex.slice(1, 3), 16),
      g: parseInt(hex.slice(3, 5), 16),
      b: parseInt(hex.slice(5, 7), 16),
    };
  }

  /**
   * Black or white, whichever reads on `hex`. The eight player colours run from
   * white through cyan to a mid blue, so a fixed ink disappears at one end or
   * the other — white on white for player 6, black on blue for player 1.
   * Rec. 709 luma, which is the weighting the eye actually applies.
   */
  function readableOn(hex) {
    const { r, g, b } = hexToRgb(hex);
    return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? "#000000" : "#ffffff";
  }

  const OUTLINE_WIDTH = 3;

  // The detail marks are drawn onto the render itself, before it is cropped —
  // so their view offset is nothing.
  const ORIGIN = { x: 0, y: 0 };

  // A spawn block reads as a solid marker whatever the size.
  const SPAWN_FILL_ALPHA = 1;

  /**
   * Two vocabularies for the same marks, because the two outputs are read
   * differently. The full render is zoomed into: marks trace true cells, tint
   * rather than cover, and leave the art readable underneath. The thumbnail is
   * 400px of a 150-cell map — under three pixels per cell, where a tint reads
   * as a smudge, a 3px border as nothing and a building as four grey pixels.
   * So it drops the cell-accurate vocabulary for a legible one: solid harvest
   * fields, and a pictogram per tech building instead of the building.
   *
   * Every width, radius and font size here is in **output** pixels. That is the
   * whole reason the compact marks are drawn after the downscale rather than
   * shrunk with the map along with everything else.
   */
  const MARK_STYLES = {
    detail: {
      ore: { ore: "#ffd23f", gems: "#b45cff" },
      oreAlpha: 0.35,
      oreLine: OUTLINE_WIDTH,
      startLine: OUTLINE_WIDTH + 1,
      startRadius: 20,
      startFont: 26,
      symbols: false,
      // The pictogram rides above the building here instead of on it: at this
      // size the art is the thing being marked, and a sign laid over it hides
      // what it points at. `iconLift` is the gap in output pixels between the
      // footprint's top corner and the bottom of the glyph's box; `iconShift`
      // moves it across, because a building's art leans down-right of the cells
      // it stands on and a badge centred on the cells reads as hanging off its
      // right shoulder.
      iconSize: 52,
      iconLift: 10,
      iconShift: -16,
      // Handed back rather than painted on, so they can be switched off over a
      // render already stored — see structureBadges.
      iconOverlay: true,
    },
    compact: {
      // Saturated to the point of covering the ore under them: at this size
      // there is no ore to see, only how much of the map is worth harvesting.
      ore: { ore: "#ffd60a", gems: "#c04cff" },
      oreAlpha: 0.9,
      oreLine: 1,
      // A square, not the Construction Yard footprint: at this size the
      // footprint is about eleven pixels by five, which holds no number and
      // says nothing the square does not.
      startSquare: 20,
      startFont: 13,
      // `symbols` is the whole difference in kind: this style replaces art with
      // signs rather than marking the art.
      symbols: true,
      iconSize: 18,
      drillRadius: 3,
    },
  };

  /**
   * The pictograms themselves are in src/glyphs.js, loaded before this file.
   *
   * They moved out when the full render stopped baking them in: the options
   * page composites the badges over a clean render, and it cannot load this
   * file — it has no game client. One source, three drawers.
   */
  const { ICON_NEUTRAL, BUILDING_ICONS, drawGlyph, glyphBox } = window.__cdcGlyphs;

  /**
   * Placement corrections in pixels, one per sprite type, applied on top of the
   * shared geometry below. Every one of them is **measured against the running
   * game**, not derived: reproducing the client's own offset arithmetic here
   * moved objects off their cells instead of onto them — that route was tried
   * and refuted, which is why these are measurements and not a formula.
   *
   * Dialled type by type with the alignment panel on the options page against
   * the running game, 2026-08-07. What is written here is the **shipped
   * default** — the baseline a fresh install renders with. The panel's offsets
   * editor saves over it per install (`setFix` below), so a client version that
   * moves sprites is re-measured on the machine that noticed, and this block is
   * where a measurement worth shipping is pasted back.
   *
   * The values are not five independent numbers. Four of the five agree on −13,
   * and terrain objects sit exactly one cell (30px, BLOCK.height) below that —
   * so what is really being corrected is one shared anchor error, plus trees and
   * rocks hanging a whole cell lower than everything else. Written out flat
   * anyway: the shared part is a measurement too, and folding it into arithmetic
   * would dress it up as something derived.
   */
  const SPRITE_FIX = {
    smudge: { x: 0, y: -13 },
    overlay: { x: 0, y: -13 }, // walls, fences
    bridge: { x: 0, y: 0 }, // bridges are overlays that did not want the -13
    ore: { x: 0, y: -13 }, // ore, gems, ore drills
    terrain: { x: 0, y: 17 }, // trees, rocks — −13 + one cell
    building: { x: 0, y: -14 }, // the one that did not settle on the shared −13
  };

  const SPRITE_TYPES = Object.keys(SPRITE_FIX);

  /**
   * What the options page's offsets editor saved, per type — the local override
   * of the block above. It arrives through companion.js, which is the only half
   * of the extension with a wire to storage; a render made before it arrives
   * uses the shipped defaults, which is also what a fresh install has.
   *
   * Stored renders are **not** invalidated by an edit here: RENDERER_VERSION
   * stamps a build, not a value the user dials, so a map rendered before the
   * edit keeps the offsets it was drawn with until it is rendered again.
   */
  let userFix = {};

  /** The same, per object name rather than per type. See setFixByName. */
  let userFixByName = {};

  /** The defaults with the saved offsets over them: what actually gets drawn. */
  const effectiveFix = () =>
    Object.fromEntries(
      SPRITE_TYPES.map((type) => [type, { ...SPRITE_FIX[type], ...(userFix[type] || {}) }])
    );

  function setFix(fix) {
    userFix = fix && typeof fix === "object" ? fix : {};
  }

  /**
   * Objects that get a surface of their own in a **layered** render, so the
   * alignment panel can slide one of them against everything else.
   *
   * A per-object correction is useless without a way to measure it, and the
   * panel measures by sliding a layer: an airport baked into the building layer
   * can only be dialled blind. The key is the object name, the value is the
   * layer it goes to; the sprite keeps its type, so the painter's order and the
   * type's own correction are unchanged and a flat render is byte-for-byte what
   * it was.
   *
   * The airport is here because it is the one the user asked to move. Anything
   * else that turns out not to follow its type joins it.
   */
  const ALIGN_LAYER_BY_NAME = { CAAIRP: "airport" };

  /** The per-object corrections in force: the shipped table, then the editor's. */
  const effectiveFixByName = () => ({ ...SPRITE_FIX_BY_NAME, ...userFixByName });

  function setFixByName(fix) {
    userFixByName = fix && typeof fix === "object" ? fix : {};
  }

  /**
   * What the render should *look* like — ore and gem colours, and a
   * brightness/contrast pair per element type.
   *
   * Arrives the same way `userFix` does, through companion.js, and for the same
   * reason: this half has no wire to storage. The shape, the defaults and the
   * clamps all belong to src/render-tune.js, which is the one copy the options
   * page, the in-game panel, the radar and this file all read — so nothing here
   * validates it beyond refusing a non-object.
   *
   * Stored renders are not invalidated by an edit here either, on exactly the
   * argument above `userFix`: RENDERER_VERSION stamps a build, not a value the
   * user dials. Staleness is `__cdcTune.tuneKey`, which is a different stamp
   * for a different question.
   */
  let userLook = {};

  function setLook(look) {
    userLook = look && typeof look === "object" ? look : {};
  }

  /**
   * The appearance table in force, normalised.
   *
   * Goes through render-tune rather than being read raw so that a half-written
   * table cannot reach a fillStyle or a palette: a missing contrast read as 0
   * is a grey rectangle, and it would surface here, a long way from whatever
   * wrote it.
   */
  const effectiveLook = () =>
    window.__cdcTune ? window.__cdcTune.normalise(userLook) : null;

  /**
   * Exceptions to the type above, by object name — for the objects that turn out
   * not to follow their own type. Measured the same way and just as suspect:
   * anything landing here is a statement that one object is placed differently
   * from every other of its kind, so it wants a second opinion on another map
   * before it is believed.
   *
   * Dial a candidate with `render({ fixByName: { CAAIRP: { x: 7, y: -7 } } })`
   * before writing it in. `__cdcHq.list()` prints the names on the loaded map.
   */
  const SPRITE_FIX_BY_NAME = {
    // The tech airport, which sits two pixels higher than the buildings it is
    // one of — the reason a per-object dial exists at all, and the object it
    // was measured on. Its own layer in a layered render
    // (`ALIGN_LAYER_BY_NAME`), because a building baked into the building layer
    // cannot be slid against the rest.
    CAAIRP: { x: 0, y: -16 },
  };

  // Fallback if the rules cannot say what an MCV deploys into.
  const DEFAULT_CONYARD_FOUNDATION = { width: 4, height: 4 };

  // Bridge placeholders (BridgeOverlayTypes.bridgePlaceholderIds) draw nothing
  // in game either.
  const SKIP_OVERLAY_IDS = new Set([100, 101, 231, 232]);

  /** Which ore class an overlay id belongs to, if any. */
  const oreClassFor = (id) => ORE_CLASSES.find((c) => id >= c.min && id <= c.max);

  /**
   * Which kind of ore an overlay id is, or null for anything that is not ore.
   *
   * Exported because the in-game radar reads the ore **live** rather than out of
   * the map file: a field mined flat by hour two is not the field the map
   * shipped with. The client's own live overlay carries `overlayId` in this same
   * id space -- `Overlay#isTiberium` is itself a lookup on it -- so the ranges
   * above classify a running match exactly as they classify a stored map, and
   * there is no second table to drift.
   */
  function oreKindFor(id) {
    const cls = oreClassFor(id);
    return cls ? cls.kind : null;
  }

  /** Whether a terrain object is an ore drill rather than scenery. */
  function spawnsOre(ctx3, name) {
    try {
      return !!ctx3.rules.getObject(name, ctx3.ObjectType.Terrain).spawnsTiberium;
    } catch (e) {
      return false;
    }
  }

  const state = { last: null, modules: null, rules: null };

  const log = (msg) => console.log(TAG, msg);

  /**
   * Deterministic stand-in for util/math#getRandomInt: tile sets carry several
   * art variants per tile and the engine picks one at random. A preview that
   * changed every time it was generated would be a bad preview, so always take
   * the first variant.
   */
  const firstVariant = (min) => min;

  async function imports() {
    if (state.modules) return state.modules;
    const sys = window.System || window.SystemJS;
    if (!sys || typeof sys.import !== "function") throw new Error("SystemJS not on the page");
    const keys = Object.keys(MODULE_IDS);
    const mods = await Promise.all(keys.map((k) => sys.import(MODULE_IDS[k])));
    const m = {};
    keys.forEach((k, i) => (m[k] = mods[i]));
    state.modules = {
      Engine: m.engine.Engine,
      Rules: m.rules.Rules,
      Art: m.art.Art,
      ObjectArt: m.objectArt.ObjectArt,
      ObjectType: m.objectType.ObjectType,
      PaletteType: m.paletteType.PaletteType,
      ImageFinder: m.imageFinder.ImageFinder,
      GameMap: m.gameMap.GameMap,
      TmpDrawable: m.tmpDrawable.TmpDrawable,
      ImageUtils: m.imageUtils.ImageUtils,
      BridgeOverlayTypes: m.bridgeTypes.BridgeOverlayTypes,
      Color: m.color.Color,
      mpAllowedColors: m.mpColors.mpAllowedColors,
      BuildCat: m.technoRules.BuildCat,
      FactoryType: m.technoRules.FactoryType,
    };
    return state.modules;
  }

  /**
   * The theater carries the art. The client loads it inside GameLoader#load and
   * keeps it in Engine.theaters after the match ends, so any map of a theater
   * played this session renders from the cache. Anything else is fetched — by
   * the client's own GameLoader when this tab has played a match, otherwise by
   * the stand-in below, which is what lets a tab that has played nothing render
   * at all.
   */
  async function theaterFor(Engine, theaterType) {
    if (Engine.activeTheater && Engine.activeTheater.type === theaterType) return Engine.activeTheater;
    const cached = Engine.theaters && Engine.theaters.get(theaterType);
    if (cached) return cached;
    try {
      return await Engine.loadTheater(theaterType);
    } catch (first) {
      // `Engine.loadTheater` builds a theater out of the VFS; it does not fetch.
      // In CDN resource mode the theater's mixes are only in the VFS if a match
      // of that theater has been loaded this session — which is why a run right
      // after a temperate game rendered the temperate maps and failed every snow
      // one. `GameLoader#loadTheater` is the half that fetches: in CDN mode it
      // pulls the theater-specific resources through its own CdnResourceLoader
      // and adds each as a MixFile to `Engine.vfs`; otherwise the mixes are
      // already there and it returns at once. Same call, same order, the client
      // makes before every match.
      let fetched = null;
      try {
        fetched = await fetchTheater(Engine, theaterType, first);
      } catch (e) {
        throw new Error(
          `theater ${theaterType} could not be fetched (${e && e.message}) — ` +
            "the client downloads these itself before a match, so playing one map of this theater also fixes it"
        );
      }
      if (fetched) return fetched;
      throw new Error(
        `theater ${theaterType} is not loaded and no loader could be built for it ` +
          `(${first && first.message}) — play one map, any theater, then render`
      );
    }
  }

  /**
   * A stand-in for the client's GameLoader, built out of the client's own parts.
   *
   * `GameLoader#loadTheater` is four lines and reads exactly two fields of its
   * `this`: `gameResConfig.isCdn()` and `cdnResourceLoader`. Neither needs a
   * match, a lobby or a login — which is what used to make a render wait for one:
   * the only GameLoader in the tab was the one the client built when a game
   * started, so a tab that had played nothing could not fetch theater art.
   *
   * Every part comes from the client:
   *
   *   base     `ImageContext.cdnBaseUrl` — set at boot from the game-res config
   *   manifest `manifest.json` at that base, which is where the checksums are
   *   cacheDir `Engine.getCacheDir()` — **the client's own CDN cache**, so a
   *            mix it has already downloaded is read from disk rather than
   *            fetched again. The main menu prefetches every theater into it.
   *
   * `cdnBaseUrl` is undefined on an install with imported game files: there the
   * mixes are in the VFS already and `Engine.loadTheater` never needed help.
   *
   * @returns {Promise<object|null>} something with `loadTheater`, or null
   */
  let ownLoaderJob = null;

  function ownLoader() {
    if (ownLoaderJob) return ownLoaderJob;
    ownLoaderJob = (async () => {
      const sys = window.System || window.SystemJS;
      if (!sys || typeof sys.import !== "function") return null;
      const [image, resource, cdn, game] = await Promise.all([
        sys.import("gui/component/Image"),
        sys.import("engine/ResourceLoader"),
        sys.import("engine/gameRes/CdnResourceLoader"),
        sys.import("gui/screen/game/GameLoader"),
      ]);
      const base = image && image.ImageContext && image.ImageContext.cdnBaseUrl;
      if (!base) return null;
      const proto = game && game.GameLoader && game.GameLoader.prototype;
      if (!proto || typeof proto.loadTheater !== "function") return null;

      const { Engine } = await imports();
      const manifest = await new resource.ResourceLoader(base).loadJson("manifest.json");
      const loader = new cdn.CdnResourceLoader(base, manifest, await Engine.getCacheDir());
      log(`built a resource loader of our own against ${base}`);
      return {
        loadTheater: (type, task, onProgress) =>
          proto.loadTheater.call(
            { gameResConfig: { isCdn: () => true }, cdnResourceLoader: loader },
            type,
            task,
            onProgress
          ),
      };
    })().catch((e) => {
      log(`could not build a resource loader: ${(e && e.message) || e}`);
      ownLoaderJob = null; // a later render may find the client further along
      return null;
    });
    return ownLoaderJob;
  }

  /**
   * Ask a loader to download a theater, then build it.
   *
   * The client's own GameLoader when this tab has played a match, ours when it
   * has not — the same call either way, since the client's is what ours calls.
   *
   * @returns {Promise<object|null>} the theater, or null if there is no loader
   *   to ask — the caller then reports the original failure.
   */
  async function fetchTheater(Engine, theaterType, first) {
    const held = window.__cdc && window.__cdc.state && window.__cdc.state.gameLoader;
    const loader =
      held && typeof held.loadTheater === "function" ? held : await ownLoader();
    if (!loader) {
      log(`theater ${theaterType} is not in the VFS and no loader could be built for it`);
      return null;
    }
    log(`theater ${theaterType} is not loaded — fetching it (${first && first.message})`);
    let last = -1;
    await loader.loadTheater(theaterType, undefined, (percent) => {
      const step = Math.floor((percent || 0) / 25);
      if (step === last) return; // tens of megabytes, four lines about it
      last = step;
      log(`theater ${theaterType}: ${Math.round(percent)}%`);
    });
    const theater = await Engine.loadTheater(theaterType);
    log(`theater ${theaterType} loaded`);
    return theater;
  }

  /** Palette -> 256 packed RGBA values; index 0 is the transparent one. */
  function paletteLut(palette) {
    const lut = new Uint32Array(256);
    for (let i = 1; i < 256; i++) {
      const c = palette.getColor(i);
      // Little-endian ABGR, which is what a Uint32 view over RGBA bytes wants.
      lut[i] = (255 << 24) | (c.b << 16) | (c.g << 8) | c.r;
    }
    return lut;
  }

  /** A smaller copy, or the canvas itself when it is already small enough. */
  function downscale(canvas, width) {
    if (!width || canvas.width <= width) return canvas;
    const out = document.createElement("canvas");
    out.width = width;
    out.height = Math.round((canvas.height * width) / canvas.width);
    const ctx = out.getContext("2d", { alpha: false });
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(canvas, 0, 0, out.width, out.height);
    return out;
  }

  /**
   * Crop to `view` and scale to `width` in one blit; `width` 0 crops only.
   *
   * One blit rather than crop-then-downscale because a compact output is taken
   * off the **unannotated** render — it draws its own marks afterwards — so it
   * cannot reuse the cropped copy the full-size output is made from.
   *
   * @returns {{ canvas: HTMLCanvasElement, scale: number }} the scale is what
   *   maps a render coordinate onto the result, which the marks need.
   */
  function cropScale(source, view, headroom, width, alpha) {
    // The headroom band above the playable area is kept: a cliff on the top row
    // is drawn several levels above its own cell, and cutting that off would
    // behead the map.
    const cropWidth = Math.min(view.width, source.width);
    const cropHeight = Math.min(view.height + headroom, source.height);
    const scale = width ? width / cropWidth : 1;
    const out = document.createElement("canvas");
    out.width = Math.max(1, Math.round(cropWidth * scale));
    out.height = Math.max(1, Math.round(cropHeight * scale));
    const ctx = out.getContext("2d", { alpha });
    ctx.imageSmoothingEnabled = scale < 1;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, -view.x * scale, -view.y * scale, source.width * scale, source.height * scale);
    return { canvas: out, scale };
  }

  /** Indexed pixels + palette -> a canvas ready for drawImage. */
  function canvasFromIndexed(data, width, height, lut) {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    const ctx = canvas.getContext("2d");
    const img = ctx.createImageData(canvas.width, canvas.height);
    const px = new Uint32Array(img.data.buffer);
    const n = Math.min(px.length, data.length);
    for (let i = 0; i < n; i++) px[i] = lut[data[i]];
    ctx.putImageData(img, 0, 0);
    return canvas;
  }

  /** Map coords -> top-left of that cell's diamond, in pixels. Fractional coords are fine. */
  function cellOrigin(rx, ry, z, mapWidth) {
    const dx = rx - ry + mapWidth - 1;
    const dy = rx + ry - mapWidth - 1;
    return {
      dx,
      dy,
      x: dx * (BLOCK.width / 2),
      y: dy * (BLOCK.height / 2) - z * (BLOCK.height / 2),
    };
  }

  /**
   * A cell's four corners, in the order top, right, bottom, left. Neighbours in
   * map coords map onto edges between consecutive corners: rx+1 shares
   * right→bottom, ry+1 shares bottom→left, rx−1 shares left→top, ry−1 shares
   * top→right.
   */
  function cellCorners(cell) {
    const { x, y } = cell;
    const w = BLOCK.width;
    const h = BLOCK.height;
    return [
      { x: x + w / 2, y },
      { x: x + w, y: y + h / 2 },
      { x: x + w / 2, y: y + h },
      { x, y: y + h / 2 },
    ];
  }

  /**
   * Fill a set of cells as one shape. One path, one fill: filling cell by cell
   * would blend the shared edges twice and leave a lattice of seams across
   * anything translucent.
   *
   * @param {Set<string>} keys  "rx,ry" of every cell to fill
   */
  function fillCells(ctx, keys, cellFor, color, alpha) {
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const key of keys) {
      const [rx, ry] = key.split(",").map(Number);
      const [top, right, bottom, left] = cellCorners(cellFor(rx, ry));
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
    }
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  /**
   * Trace the border of a set of cells: draw only the edges whose neighbour is
   * outside the set, so a patch or a footprint comes out as one contour rather
   * than a grid of diamonds.
   *
   * @param {Set<string>} keys      "rx,ry" of every cell in the set
   * @param {function} cellFor      (rx, ry) -> the cell's pixel geometry
   */
  function outlineCells(ctx, keys, cellFor, color, width) {
    // Neighbour direction -> which corner pair it shares, in cellCorners order.
    const edges = [
      { dRx: 1, dRy: 0, from: 1, to: 2 },
      { dRx: 0, dRy: 1, from: 2, to: 3 },
      { dRx: -1, dRy: 0, from: 3, to: 0 },
      { dRx: 0, dRy: -1, from: 0, to: 1 },
    ];
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = "round";
    ctx.beginPath();
    for (const key of keys) {
      const [rx, ry] = key.split(",").map(Number);
      const corners = cellCorners(cellFor(rx, ry));
      for (const edge of edges) {
        if (keys.has(`${rx + edge.dRx},${ry + edge.dRy}`)) continue;
        ctx.moveTo(corners[edge.from].x, corners[edge.from].y);
        ctx.lineTo(corners[edge.to].x, corners[edge.to].y);
      }
    }
    ctx.stroke();
  }

  function lutFor(ctx3, palette, lookType) {
    // Keyed by element type as well as palette, because the same palette is
    // drawn under different dials -- a wall and a tree can share one and still
    // want different brightness. Cheap: an object's type is a function of the
    // object, so one render never draws the same sprite under two types.
    const key = lookType ? palette.hash + "|" + lookType : palette.hash;
    let lut = ctx3.luts.get(key);
    if (!lut) {
      lut = paletteLut(palette);
      // 256 entries, once per palette per type. Doing it here rather than over
      // the pixels is the whole reason the dials are affordable: the art is
      // indexed, so tuning the palette tunes every pixel drawn from it.
      if (ctx3.look && lookType && window.__cdcTune) {
        lut = window.__cdcTune.tuneLut(lut, ctx3.look, lookType);
      }
      ctx3.luts.set(key, lut);
    }
    return lut;
  }

  /**
   * Everything the passes need, built once per render. Rules parses the whole of
   * rules.ini, so it is cached across renders — it does not change while the
   * client is running. Art is not: a map may override art sections for its own
   * objects, and Art reads those out of the map file it is handed.
   */
  async function buildContext(mapFile, opts = {}) {
    const mods = await imports();
    const { Engine, Rules, Art, ImageFinder } = mods;
    const theater = await theaterFor(Engine, mapFile.theaterType);
    if (!state.rules) state.rules = new Rules(Engine.getRules());
    return {
      ...mods,
      theater,
      rules: state.rules,
      art: new Art(state.rules, Engine.getArt(), mapFile),
      imageFinder: new ImageFinder(Engine.getImages(), theater),
      // Read once per render, not per sprite: a dial that moved halfway
      // through would produce a picture drawn under two different tables.
      //
      // `look: false` renders untuned on purpose, and the radar is why. It keeps
      // the layers apart and applies the very same dials with `ctx.filter` at
      // composite time, which is what lets a slider move without a re-render --
      // so baking them here as well would apply each one twice, exactly the way
      // the global pair used to be applied twice.
      look: opts.look === false ? null : effectiveLook(),
      luts: new Map(), // palette hash | element type -> Uint32Array
      sprites: new Map(), // shp|frame|palette -> canvas
      remapPalettes: new Map(), // source palette + remap colour -> Palette
    };
  }

  /**
   * The palette an object's art asks for, with Default resolved per object type.
   *
   * @param {object} [remap] { r, g, b } for the unit palette's remap band
   */
  function paletteForArt(ctx3, objectArt, type, remap) {
    const { PaletteType, ObjectArt, theater, Color } = ctx3;
    let paletteType = objectArt.paletteType;
    if (paletteType === undefined || paletteType === PaletteType.Default) {
      paletteType = ObjectArt.getDefaultPalette(type);
    }
    let palette;
    try {
      palette = theater.getPalette(paletteType, objectArt.customPaletteName);
    } catch (e) {
      console.warn(TAG, `palette ${paletteType} unavailable, falling back to iso`, e);
      palette = theater.isoPalette;
    }
    if (paletteType !== PaletteType.Unit) return palette;

    // The unit palette's remap band holds whatever house colour was last written
    // into it, so a preview has to state its own rather than inherit one. In game
    // that band *is* the owning player's colour — which is how a pre-owned
    // building reads as somebody's at a glance — so a structure the map hands to
    // a player gets that player's colour and everything else the neutral grey.
    const rgb = remap || NEUTRAL_REMAP;
    const key = `${palette.hash}|${rgb.r},${rgb.g},${rgb.b}`;
    let remapped = ctx3.remapPalettes.get(key);
    if (!remapped) {
      remapped = palette.clone().remap(Color.fromRgb(rgb.r, rgb.g, rgb.b));
      ctx3.remapPalettes.set(key, remapped);
    }
    return remapped;
  }

  /** One SHP frame -> a canvas, with the frame's place inside the SHP's own canvas. */
  function shpSprite(ctx3, shp, frameNo, palette, lookType) {
    const frame = Math.max(0, Math.min(frameNo | 0, shp.numImages - 1));
    const key = `${shp.filename}|${frame}|${palette.hash}|${lookType || ""}`;
    let sprite = ctx3.sprites.get(key);
    if (!sprite) {
      const image = shp.getImage(frame);
      if (!image || !image.width || !image.height) return null;
      sprite = {
        canvas: canvasFromIndexed(image.imageData, image.width, image.height, lutFor(ctx3, palette, lookType)),
        x: image.x,
        y: image.y,
        // The SHP's virtual canvas — what the frame's x/y are relative to.
        sheet: { width: shp.width, height: shp.height },
      };
      ctx3.sprites.set(key, sprite);
    }
    return sprite;
  }

  /**
   * Resolve a named map object to a drawable sprite. Returns null when the art
   * is missing — a map may name an object this client does not have, and most
   * of a render beats an exception.
   */
  function spriteForObject(ctx3, name, type, frameNo, remap, lookType) {
    let objectArt;
    try {
      objectArt = ctx3.art.getObject(name, type);
    } catch (e) {
      return null;
    }
    if (!objectArt || !objectArt.imageName) return null;
    const shp = ctx3.imageFinder.tryFind(objectArt.imageName, objectArt.useTheaterExtension);
    if (!shp || !shp.numImages) return null;
    const palette = paletteForArt(ctx3, objectArt, type, remap);
    const sprite = shpSprite(ctx3, shp, frameNo || 0, palette, lookType);
    if (!sprite) return null;
    const offset = objectArt.getDrawOffset ? objectArt.getDrawOffset() : { x: 0, y: 0 };
    return { sprite, offset, objectArt, palette };
  }

  /**
   * A building is not one sprite. In game it is drawn from an aggregate of its
   * own SHP and its animations — the pump on an oil derrick, the dish on a radar
   * — all sharing one canvas and the building's palette
   * (BuildingShpHelper#collectAnimShpFiles, and the aggregate handed to
   * ShpRenderable). Drawing only the main SHP leaves those parts out, which is
   * why a derrick came out missing its right-hand side.
   *
   * Only the animations a building standing on a map shows: the idle state and
   * the active ones. Buildup, production, super-weapon and deploy animations
   * belong to something happening, and nothing is happening in a preview.
   *
   * Each animation's placement is the building's own draw offset plus the
   * `<Anim>X` / `<Anim>Y` pair from the building's art section, exactly as
   * BuildingRenderable#createAnimObject adds them.
   */
  function buildingSprites(ctx3, name, remap) {
    // An airport has its own offset dial, so it gets its own appearance dial
    // too: the same split, kept in one place, so a type never means one thing
    // to the offsets editor and another to the colour table.
    const lookType = ALIGN_LAYER_BY_NAME[name] === "airport" ? "airport" : "building";
    const main = spriteForObject(ctx3, name, ctx3.ObjectType.Building, 0, remap, lookType);
    if (!main) return null;
    const parts = [main];
    const section = main.objectArt.art;

    if (section) {
      for (const key of BUILDING_ANIM_KEYS) {
        const animName = section.getString(key);
        if (!animName) continue;
        let animArt;
        try {
          animArt = ctx3.art.getObject(animName, ctx3.ObjectType.Animation);
        } catch (e) {
          continue; // a building naming an animation this ruleset does not have
        }
        if (!animArt || !animArt.imageName) continue;
        // The theater extension is the building's, not the animation's — the
        // client resolves anim images against the building's art.
        const shp = ctx3.imageFinder.tryFind(animArt.imageName, main.objectArt.useTheaterExtension);
        if (!shp || !shp.numImages) continue;
        const start = animArt.art ? animArt.art.getNumber("Start", 0) : 0;
        const sprite = shpSprite(ctx3, shp, start, main.palette, lookType);
        if (!sprite) continue;
        parts.push({
          sprite,
          offset: {
            x: main.offset.x + section.getNumber(key + "X"),
            y: main.offset.y + section.getNumber(key + "Y"),
          },
        });
      }
    }

    // Every part is centred on its **own** SHP canvas, not on a canvas shared
    // across the building. The aggregate the client builds is only a frame
    // store — `ShpFile#addImage` never touches the file's width or height, and
    // nothing reads them — because each renderable is sized by the source file
    // it came from (`createMainObject`, `createAnimObjects` and
    // `createBibObject` all call `setSize(<that part's own shp>)`).
    return parts;
  }

  /**
   * The correction each sprite type is drawn with: the type's own measured fix
   * as the offsets editor last left it, a per-call override on top of that, and
   * the render-wide nudge.
   *
   * `zero` drops the measured fixes to nothing — what a layered render wants,
   * because there the offsets are applied by whatever views the layers, and
   * baking them in would mean measuring a correction on top of a correction.
   */
  function resolveFix(tune, overrides, zero, byName) {
    const out = {};
    const saved = effectiveFix();
    for (const type of SPRITE_TYPES) {
      const base = zero ? { x: 0, y: 0 } : saved[type];
      const over = (overrides && overrides[type]) || {};
      out[type] = {
        x: tune.x + (over.x === undefined ? base.x : over.x),
        y: tune.y + (over.y === undefined ? base.y : over.y),
      };
    }
    // Per-object exceptions ride on top of the type. Dropped in a layered render
    // along with the type fixes, so the panel measures one correction, not two.
    out.byName = zero ? {} : { ...effectiveFixByName(), ...(byName || {}) };
    return out;
  }

  /**
   * Queue one sprite against the cell it belongs to. Drawing is a painter's
   * pass afterwards — back rows first, and within a row smudge < overlay <
   * tree < building.
   *
   * `type` is the sprite type from SPRITE_FIX: it picks the correction, and a
   * layered render draws each type onto a surface of its own.
   */
  function queue(jobs, cell, drawable, layer, type, fix, name) {
    const { sprite, offset } = drawable;
    const typeFix = fix[type];
    // An exception **replaces** its type's correction rather than riding on top
    // of it. The panel measures a named layer exactly as it measures a type —
    // the layer sits at zero on its own sheet and the dial moves it from there
    // (`alignPaint` in src/options-align.js) — so what it saves is the absolute
    // correction for that object. Added, the type's own correction was counted
    // twice: with buildings at −14 and the airport dialled to −16, the airport
    // drew at −30, half a cell high.
    const named = name && fix.byName[name];
    const nudge = named
      ? { x: named.x || 0, y: named.y || 0 }
      : { x: typeFix.x, y: typeFix.y };
    jobs.push({
      dy: cell.dy,
      dx: cell.dx,
      layer,
      type,
      // Only in a layered render does this differ from the type, and only for
      // the handful of objects the panel can dial on their own. See
      // ALIGN_LAYER_BY_NAME.
      surface: (name && ALIGN_LAYER_BY_NAME[name]) || type,
      canvas: sprite.canvas,
      // The SHP's virtual canvas is centred on the cell; the frame sits inside
      // it at its own x/y. A positive art draw offset lifts the sprite.
      //
      // This is the placement that matches the running game for buildings,
      // trees, walls and bridges — checked against it, not derived. Reproducing
      // the client's own MapSpriteTranslation arithmetic here instead moved
      // every one of them off its cell, see [[map-preview-hq]].
      x: cell.x + BLOCK.width / 2 - Math.floor(sprite.sheet.width / 2) + sprite.x + offset.x + nudge.x,
      y: cell.y + BLOCK.height / 2 - Math.floor(sprite.sheet.height / 2) + sprite.y - offset.y + nudge.y,
    });
  }

  /**
   * The playable area. The cells outside [Map] LocalSize are engine padding —
   * the lobby preview and the in-game radar both crop them away. Same
   * arithmetic MapBounds uses: local size is in cells, the grid is in half-cells.
   */
  function cropRect(mapFile) {
    const local = mapFile.localSize;
    const x = Math.max(2, local.x);
    const width = Math.min(mapFile.fullSize.width - 2 - x, local.width);
    return {
      x: 2 * x * (BLOCK.width / 2),
      y: (2 * local.y + 4) * (BLOCK.height / 2),
      width: 2 * width * (BLOCK.width / 2),
      height: (2 * local.height + 8) * (BLOCK.height / 2),
    };
  }

  /**
   * Draw the cell grid itself. Not decoration — it is the measuring stick: the
   * terrain and the outlines are placed by arithmetic read out of the client,
   * the sprites by a formula derived from it, so when a sprite looks off the
   * grid says which of the two moved.
   */
  /**
   * Everything needed to put a tile on a picture of this map, without rendering
   * one.
   *
   * The in-game radar draws its own canvas over its own copy of the render and
   * has to place units, a viewport rectangle and a click on it. That is the
   * same arithmetic `result.icons` already does internally (world -> fraction
   * of the output picture), and the whole reason this is exported rather than
   * copied into companion.js is that a second copy of `cropRect` is exactly the
   * drift that once silently killed every build hotkey: two hand-kept lists of
   * one truth.
   *
   * Fractions rather than pixels, for the same reason `icons` uses them — the
   * radar panel is resizable and its source may be the 3000px render or a
   * downscale of it, so a pixel figured here would be a pixel of the wrong
   * picture.
   *
   * Pure: a mapFile in, numbers out. No theater, no client modules, no canvas,
   * which is what lets scripts/check-radar.mjs exercise it against a synthetic
   * map in a `vm`.
   *
   * @param {object} mapFile
   * @returns {{view, headroom, cropWidth, cropHeight, canvasWidth, canvasHeight,
   *   mapWidth, mapHeight, block, cellAt, fractionOf}}
   */
  function geometry(mapFile) {
    const view = cropRect(mapFile);
    const headroom = HEADROOM_LEVELS * (BLOCK.height / 2);
    const full = mapFile.fullSize;
    const mapWidth = full.width;
    // The master canvas the render draws onto, from render()'s own sizing.
    const canvasWidth = 2 * full.width * (BLOCK.width / 2) + BLOCK.width;
    const canvasHeight = 2 * full.height * (BLOCK.height / 2) + 2 * headroom;
    // What cropScale actually keeps, which is what the output picture shows.
    const cropWidth = Math.min(view.width, canvasWidth);
    const cropHeight = Math.min(view.height + headroom, canvasHeight);

    /** A cell's top-left in render pixels, headroom included. */
    const cellAt = (rx, ry, z) => {
      const cell = cellOrigin(rx, ry, z || 0, mapWidth);
      return { x: cell.x, y: cell.y + headroom, dx: cell.dx, dy: cell.dy };
    };

    // --- addressing a cell by a single number ---------------------------------
    //
    // **Neither `rx` nor `ry` is bounded by the map's width or height.** The
    // domain is the diamond this render draws, not a `width x height`
    // rectangle: on a 100x100 map `rx` reaches 200 and `ry` reaches 199, and
    // there are 20000 cells rather than 10000. The obvious packing,
    // `ry * mapWidth + rx`, is therefore wrong twice over — measured on that
    // map, 5000 of the 20000 cells collide with another cell's id, and 10200
    // land outside any `mapWidth * mapHeight` array.
    //
    // Both failures shipped in 1.10.0 and were visible in one screenshot: the
    // collisions drew the explored region again at two other places on the
    // radar, and the overflow left the rest black, because a write past a
    // Uint8Array's end is dropped in silence and the read back is `undefined`.
    //
    // Exported as one function rather than written out at each call site for
    // the reason `cropRect` is: the pick buffer, the shroud mask and the click
    // decode must not each invent their own, and this is the third place that
    // rule has had to be enforced.
    //
    // The bound is provable rather than generous. `dx = rx - ry + W - 1` and
    // `dy = rx + ry - W - 1` span the canvas the render sizes, so
    // `dx <= 2W` and `dy <= 2H`; inverting, `rx = (dx + dy)/2 + 1 <= W + H + 1`
    // and `ry = (dy - dx)/2 + W <= W + H`, and both are >= 0.
    const idStride = mapWidth + full.height + 2;
    const cellId = (rx, ry) => ry * idStride + rx;
    const cellOf = (id) => ({ rx: id % idStride, ry: Math.floor(id / idStride) });

    /** A cell's centre as a fraction of the output picture. */
    const fractionOf = (rx, ry, z) => {
      const cell = cellAt(rx, ry, z);
      return {
        x: (cell.x + BLOCK.width / 2 - view.x) / cropWidth,
        y: (cell.y + BLOCK.height / 2 - view.y) / cropHeight,
      };
    };

    return {
      view,
      headroom,
      cropWidth,
      cropHeight,
      canvasWidth,
      canvasHeight,
      mapWidth,
      mapHeight: full.height,
      idStride,
      cellIds: idStride * idStride,
      block: { ...BLOCK },
      cellAt,
      cellId,
      cellOf,
      fractionOf,
    };
  }

  /**
   * Half-width of a cell's diamond at depth `dy`, after the diamond has been
   * swept downward by `lift`.
   *
   * The sweep is what draws a cliff face. Elevation lifts a cell up the picture
   * and leaves a band of unclaimed pixels where it used to sit -- exactly the
   * face the tile's own sprite draws down there -- so a cell claims the whole
   * region its diamond passes through on the way up, not just where it landed.
   * Without it every cliff in the map reads as no cell at all.
   *
   * The diamond's profile is unimodal, widest at its middle, so the widest
   * point of a downward window [dy - lift, dy] is the middle when the window
   * spans it and the nearer end otherwise. Negative means the window misses the
   * diamond entirely.
   */
  function sweptHalfWidth(dy, cellWidth, cellHeight, lift) {
    const lo = dy - lift;
    if (dy < 0 || lo > cellHeight) return -1;
    const mid = cellHeight / 2;
    if (lo <= mid && dy >= mid) return cellWidth / 2;
    const at = dy < mid ? dy : lo;
    return (cellWidth / 2) * (1 - Math.abs((2 * at) / cellHeight - 1));
  }

  /**
   * Which cell every pixel of a picture of this map belongs to.
   *
   * The radar has to answer "what did I just click on", and the inverse of
   * `cellOrigin` is **ambiguous**: the elevation term lifts a cell up the
   * picture, so one pixel can belong to two cells at different heights and the
   * flat inverse reads a z=4 cell two tiles off (scripts/check-radar.mjs pins
   * that). So the answer is rasterised rather than derived -- once per panel
   * size, from the same geometry the picture is drawn from, which is what makes
   * it unable to drift from it.
   *
   * Rasterised here rather than on a canvas, into a plain array, for three
   * reasons: a canvas fill is antialiased and a blended id is a *different*
   * cell; `getImageData` on a GPU-backed canvas is a readback stall; and this
   * way the whole thing is exercisable in node against a synthetic map, which
   * a canvas would put out of reach.
   *
   * Painter order is the render's own -- `dy` then `dx` -- so where two cells
   * overlap, the one that is drawn on top is the one that answers. That is the
   * whole promise: the tile you get is the tile you were looking at.
   *
   * @param {object} mapFile
   * @param {number} width   the picture's width in pixels
   * @param {number} height  its height
   * @param {Array} [tiles]  cells as {rx, ry, z}; defaults to the map's own.
   *   The render prefers GameMap's smoothed tiles, but smoothing rewrites which
   *   sprite a cell draws and never where the cell is, so the raw ones place
   *   identically and cost no theater.
   * @returns {{width, height, mapWidth, idStride, ids: Int32Array}}
   *   `ids[y * width + x]` is `geometry(mapFile).cellId(rx, ry)`, or -1 where no
   *   cell covers that pixel. Decode it with that geometry's `cellOf` — the
   *   stride is NOT `mapWidth`, see the note beside `cellId`.
   */
  function pickBuffer(mapFile, width, height, tiles) {
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    const geo = geometry(mapFile);
    const source =
      tiles || (mapFile.tiles ? Array.prototype.filter.call(mapFile.tiles, Boolean) : []);
    const ids = new Int32Array(w * h).fill(-1);
    const sx = w / geo.cropWidth;
    const sy = h / geo.cropHeight;
    const cellWidth = BLOCK.width * sx;
    const cellHeight = BLOCK.height * sy;

    const ordered = source
      .map((tile) => {
        const at = geo.cellAt(tile.rx, tile.ry, tile.z || 0);
        return {
          id: geo.cellId(tile.rx, tile.ry),
          dx: at.dx,
          dy: at.dy,
          x: (at.x - geo.view.x) * sx,
          y: (at.y - geo.view.y) * sy,
          lift: (tile.z || 0) * (BLOCK.height / 2) * sy,
        };
      })
      .sort((a, b) => a.dy - b.dy || a.dx - b.dx);

    for (const cell of ordered) {
      const centre = cell.x + cellWidth / 2;
      // Pixel *centres*, so a diamond too small to contain one simply loses to
      // its neighbour rather than being rounded outward over it. Below the
      // panel's minimum size several cells share a pixel and the loser is one
      // cell away, which is the tolerance a click has anyway.
      const first = Math.max(0, Math.ceil(cell.y - 0.5));
      const last = Math.min(h - 1, Math.floor(cell.y + cellHeight + cell.lift - 0.5));
      for (let py = first; py <= last; py++) {
        const half = sweptHalfWidth(py + 0.5 - cell.y, cellWidth, cellHeight, cell.lift);
        if (half < 0) continue;
        const from = Math.max(0, Math.ceil(centre - half - 0.5));
        const to = Math.min(w - 1, Math.floor(centre + half - 0.5));
        const row = py * w;
        for (let px = from; px <= to; px++) ids[row + px] = cell.id;
      }
    }

    return { width: w, height: h, mapWidth: geo.mapWidth, idStride: geo.idStride, ids };
  }

  function drawCellGrid(ctx, tiles, mapWidth, headroom) {
    ctx.strokeStyle = "rgba(255,255,255,0.28)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (const tile of tiles) {
      const cell = cellOrigin(tile.rx, tile.ry, tile.z, mapWidth);
      cell.y += headroom;
      const [top, right, bottom, left] = cellCorners(cell);
      ctx.moveTo(top.x, top.y);
      ctx.lineTo(right.x, right.y);
      ctx.lineTo(bottom.x, bottom.y);
      ctx.lineTo(left.x, left.y);
      ctx.closePath();
    }
    ctx.stroke();
  }

  /**
   * Mark every ore and gem patch: a tint and a traced border on the full
   * render, a solid field on the thumbnail. `scale` divides the line widths
   * back out, because a style states them in output pixels.
   */
  function drawOreFields(ctx, mapFile, cellFor, style, scale) {
    const byKind = new Map();
    for (const overlay of mapFile.overlays) {
      const cls = oreClassFor(overlay.id);
      if (!cls) continue;
      let keys = byKind.get(cls.kind);
      if (!keys) byKind.set(cls.kind, (keys = new Set()));
      keys.add(`${overlay.rx},${overlay.ry}`);
    }
    for (const kind of ORE_KINDS) {
      const keys = byKind.get(kind);
      if (!keys) continue;
      fillCells(ctx, keys, cellFor, style.ore[kind], style.oreAlpha);
      // The border is what keeps a one-cell patch visible once a cell is under
      // three pixels wide — the fill alone would round away to nothing.
      outlineCells(ctx, keys, cellFor, style.ore[kind], style.oreLine / scale);
    }
    return byKind.size;
  }

  /**
   * Every ore and gem cell on the map, as coordinates rather than as pixels.
   *
   * `drawOreFields` above bakes these into the render's `marks` surface at the
   * colour in force when it ran, which is right for a picture written to disk
   * and wrong for a live one: the in-game radar takes one layered render per map
   * and keeps it for the whole match, so a baked tint is a colour that cannot
   * change without redoing that render mid-game. Handing the cells back instead
   * is the same move `iconOverlay` already makes for the tech-building badges —
   * numbers, and whoever shows the render draws them.
   *
   * Additive: the flat path still bakes exactly what it baked, so
   * `RENDERER_VERSION` does not move and no stored render goes stale.
   *
   * `z` travels with each cell because a cell's place in the picture depends on
   * it — the render lifts a cell by half a block per elevation level, and a mark
   * drawn flat would sit below the ground it marks on every cliff.
   */
  function oreCells(mapFile) {
    const height = new Map();
    for (const tile of mapFile.tiles || []) {
      if (tile) height.set(tile.rx + "," + tile.ry, tile.z || 0);
    }
    const out = {};
    for (const kind of ORE_KINDS) out[kind] = [];
    const seen = new Set();
    for (const overlay of mapFile.overlays || []) {
      const cls = oreClassFor(overlay.id);
      if (!cls) continue;
      const key = overlay.rx + "," + overlay.ry;
      // One cell, one patch. The id ranges meet at 127 and a map can carry more
      // than one overlay on a cell; a cell listed twice is a cell filled twice,
      // which is a darker cell wherever the alpha is not 1.
      if (seen.has(key)) continue;
      seen.add(key);
      out[cls.kind].push({ rx: overlay.rx, ry: overlay.ry, z: height.get(key) || 0 });
    }
    return out;
  }

  /**
   * What a Construction Yard covers, so a spawn can be shown as the base that
   * will stand there rather than as a dot. Read out of the rules: the MCV in
   * [General]BaseUnit deploys into it, and its art states the foundation.
   */
  function conYardFoundation(ctx3) {
    const { rules, art, ObjectType } = ctx3;
    try {
      for (const unitName of rules.general.baseUnit) {
        const mcv = rules.getObject(unitName, ObjectType.Vehicle);
        if (!mcv || !mcv.deploysInto) continue;
        const foundation = art.getObject(mcv.deploysInto, ObjectType.Building).foundation;
        if (foundation && foundation.width) return foundation;
      }
    } catch (e) {
      console.warn(TAG, "could not read the Construction Yard foundation", e);
    }
    return DEFAULT_CONYARD_FOUNDATION;
  }

  /**
   * Paint each start position as the block of cells its Construction Yard would
   * occupy — an MCV deploys centred on the cell it stands in — in that player's
   * colour, numbered.
   *
   * The block is traced on cells and so is drawn through the render transform;
   * the numbered disc is not. Its size is a property of the picture rather than
   * of the map — a 26px number is unreadable once the map is 400px wide — so it
   * goes on with the transform off, at coordinates `centreOf` has already
   * converted.
   */
  function drawStartBlocks(surface, mapFile, cellFor, foundation, centreOf, style, scale) {
    const half = { x: Math.floor(foundation.width / 2 - 0.5), y: Math.floor(foundation.height / 2 - 0.5) };
    mapFile.startingLocations.forEach((loc, i) => {
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const keys = new Set();
      for (let dx = 0; dx < foundation.width; dx++) {
        for (let dy = 0; dy < foundation.height; dy++) {
          keys.add(`${loc.x - half.x + dx},${loc.y - half.y + dy}`);
        }
      }
      // Solid, not a tint: a spawn is the one thing on the map you want to find
      // without looking for it, and there is nothing under it worth keeping.
      const cells = surface.shape();
      fillCells(cells, keys, cellFor, color, SPAWN_FILL_ALPHA);
      outlineCells(cells, keys, cellFor, color, style.startLine / scale);

      const centre = centreOf(loc.x, loc.y);
      const ctx = surface.flat();
      ctx.fillStyle = "#000";
      ctx.globalAlpha = 0.5;
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, style.startRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#fff";
      ctx.font = `bold ${style.startFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), centre.x, centre.y + style.startFont * 0.04);
    });
  }

  /**
   * Start positions for a symbol style: one square per start, sized to hold its
   * own number, sitting on the start cell.
   *
   * It replaces the Construction Yard footprint rather than sitting on it — a
   * 4×4 footprint is about eleven pixels by five at thumbnail scale, which
   * neither holds a number nor tells anyone anything the square does not. The
   * thin dark border is what keeps player 6 (white) off a snow theater.
   */
  function drawStartSquares(ctx, mapFile, centreOf, style) {
    const side = style.startSquare;
    mapFile.startingLocations.forEach((loc, i) => {
      const color = PLAYER_COLORS[i % PLAYER_COLORS.length];
      const centre = centreOf(loc.x, loc.y);
      const x = centre.x - side / 2;
      const y = centre.y - side / 2;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, side, side);
      ctx.lineWidth = Math.max(1, side * 0.08);
      ctx.strokeStyle = "rgba(0,0,0,0.75)";
      ctx.strokeRect(x, y, side, side);
      ctx.fillStyle = readableOn(color);
      ctx.font = `bold ${style.startFont}px sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(i + 1), centre.x, centre.y + style.startFont * 0.06);
    });
  }

  /**
   * A black dot on every ore drill.
   *
   * The drill is why a patch keeps refilling, so it decides where a refinery
   * goes — but on a thumbnail it stands inside a solid yellow field a few
   * pixels wide, where its own art is gone. Black because it is the one ink
   * that field cannot swallow.
   */
  function drawOreDrills(ctx, mapFile, ctx3, centreOf, style) {
    let drawn = 0;
    for (const terrain of mapFile.terrains) {
      if (!spawnsOre(ctx3, terrain.name)) continue;
      const centre = centreOf(terrain.rx, terrain.ry);
      ctx.beginPath();
      ctx.arc(centre.x, centre.y, style.drillRadius, 0, Math.PI * 2);
      ctx.fillStyle = "#000000";
      ctx.fill();
      drawn++;
    }
    return drawn;
  }

  /**
   * A map can hand a building to a player without naming an owner, and the
   * "(PreCaptured)" maps all do: the structure stays `Neutral` in `[Structures]`
   * and carries a tag, the tag names a trigger, and the trigger's **ChangeHouse**
   * action says who gets it.
   *
   *   [Structures] …,tag 01000001   (MapFile parses this as structure.tag)
   *   [Tags]       01000001 = 0,"tech p1 1",01000000
   *   [Triggers]   01000000 = Americans,<none>,tech p1,0,…   (field 3 = disabled)
   *   [Actions]    01000000 = 1,14,0,4475,0,0,0,0,A
   *   [Events]     01000000 = 1,13,0,10
   *
   * Action 14 is `TriggerActionType.ChangeHouse` and the client's executor reads
   * its `params[1]`: a value of 4475 or more is a **start position** rather than
   * a country (`ChangeHouseExecutor.locationHouseIdBegin`), so 4475 is whoever
   * plays start 1. Event 13 is `ElapsedTime`, and `ElapsedTimeCondition` counts
   * `params[1]` seconds — 10 here, which is why these buildings are neutral for
   * the first ten seconds of the match and the map file looks like it pre-owns
   * nothing.
   *
   * A preview shows what the map does, so it treats a building handed over by a
   * trigger as that player's from the start. What it does not do is evaluate the
   * trigger system: a ChangeHouse behind a real condition (a building destroyed,
   * a unit entering somewhere) is shown as though it had already fired.
   *
   * @returns {Map<string, object>} tag id -> { start, trigger, seconds }
   */
  function triggerOwners(mapFile) {
    const out = new Map();
    const section = (name) => (mapFile.getSection ? mapFile.getSection(name) : null);
    const tags = section("Tags");
    const actions = section("Actions");
    const triggers = section("Triggers");
    if (!tags || !actions) return out;

    const starts = mapFile.startingLocations.length;
    const events = section("Events");

    for (const [tagId, tagLine] of tags.entries) {
      // Tags: <repeats>,<name>,<trigger id>
      const triggerId = String(tagLine).split(",")[2];
      if (!triggerId) continue;

      let name = triggerId;
      if (triggers) {
        const trigger = triggers.entries.get(triggerId);
        if (trigger) {
          const fields = String(trigger).split(",");
          // Triggers: <house>,<linked>,<name>,<disabled>,…
          if (Number(fields[3])) continue;
          name = fields[2] || triggerId;
        }
      }

      const line = actions.entries.get(triggerId);
      if (!line) continue;
      const fields = String(line).split(",");
      const count = Number(fields[0]) || 0;
      for (let i = 0; i < count; i++) {
        // Each action is its id, six parameters and a waypoint/flag field.
        const at = 1 + i * ACTION_STRIDE;
        if (Number(fields[at]) !== CHANGE_HOUSE_ACTION) continue;
        const start = Number(fields[at + 2]) - LOCATION_HOUSE_ID_BEGIN;
        if (!(start >= 0 && start < starts)) continue;

        let seconds;
        const event = events && events.entries.get(triggerId);
        if (event) {
          const parts = String(event).split(",");
          // Events: <count>, then each event's id and two parameters.
          if (Number(parts[1]) === ELAPSED_TIME_EVENT) seconds = Number(parts[3]);
        }
        out.set(tagId, { start, trigger: name, seconds });
        break;
      }
    }
    return out;
  }

  /**
   * House name -> the country that house acts as, from the map's own `[Houses]`.
   * A map-placed object names a house; the house is what knows the country, and
   * only the country says whether a player can be it.
   */
  function houseCountries(mapFile) {
    const out = new Map();
    const houses = mapFile.getSection && mapFile.getSection("Houses");
    if (!houses) return out;
    for (const name of houses.entries.values()) {
      const section = mapFile.getSection(name);
      if (!section) continue;
      const country = section.getString("Country") || section.getString("ActsLike");
      if (country) out.set(name, country);
    }
    return out;
  }

  /**
   * Who owns each map-placed structure at match start, and in what colour it
   * should therefore read. One pass, because the answer decides two things: the
   * house colour its sprite is remapped to, and the outline drawn around it.
   *
   * Two ways a structure can be somebody's, and they differ in how sure we are:
   *
   * - **A trigger hands it over** — see triggerOwners(). The map names the start
   *   position outright, so the answer is exact.
   * - **The map names an owning house**, which resolves to a country. A country
   *   is not a player slot, so the structure goes to the nearest start position
   *   — a guess, but the same one a player makes looking at the map, and on a
   *   2-player map it is never wrong.
   *
   * The trigger wins where both apply: it is what the running game ends up with.
   */
  function structureOwnership(mapFile, ctx3) {
    const { rules, ObjectType } = ctx3;
    const countryOfHouse = houseCountries(mapFile);
    const byTag = triggerOwners(mapFile);
    return mapFile.structures.map((structure) => {
      let objectRules;
      try {
        objectRules = rules.getObject(structure.name, ObjectType.Building);
      } catch (e) {
        objectRules = null;
      }
      // A map-placed object names a *house*, and the house names the country.
      // Resolving the owner string as a country directly only works for the maps
      // whose houses happen to be called after countries; on a map that names
      // its houses anything else, every structure would come out civilian.
      const countryName = countryOfHouse.get(structure.owner) || structure.owner;
      let country;
      try {
        country = rules.getCountry(countryName);
      } catch (e) {
        country = undefined; // an owner this ruleset does not know: treat as civilian
      }
      const handover = structure.tag ? byTag.get(structure.tag) : undefined;
      const playable = !!handover || !!(country && country.multiplay);

      let player = -1;
      let via = "";
      if (handover) {
        player = handover.start;
        via = `trigger "${handover.trigger}"` + (handover.seconds ? ` @${handover.seconds}s` : "");
      } else if (playable) {
        via = "nearest start";
        let bestDistance = Infinity;
        mapFile.startingLocations.forEach((loc, i) => {
          const distance = (loc.x - structure.rx) ** 2 + (loc.y - structure.ry) ** 2;
          if (distance < bestDistance) {
            bestDistance = distance;
            player = i;
          }
        });
      }

      return {
        playable,
        handover: !!handover,
        player,
        via,
        capturable: !!(objectRules && objectRules.capturable),
        color: playable ? PLAYER_COLORS[Math.max(0, player) % PLAYER_COLORS.length] : NEUTRAL_OUTLINE,
      };
    });
  }

  /** The foundation of a map-placed structure, or null if it has no art here. */
  function structureFoundation(ctx3, name) {
    let foundation;
    try {
      foundation = ctx3.art.getObject(name, ctx3.ObjectType.Building).foundation;
    } catch (e) {
      return null;
    }
    return foundation && foundation.width ? foundation : null;
  }

  /**
   * Which glyph a structure is worth marking with, or "" for one that is not
   * marked at all — the same gate the outlines use, since a pictogram is what an
   * outline becomes at thumbnail size.
   *
   * **Marked = you can take it, or the map already gave it to somebody.**
   * Ownership alone is not enough, and Country Swing is why: it decorates each of
   * its four near-base ore drills with an `INYELWLAMP` owned by house Americans,
   * a country with `multiplay` set. Reading that as "a player's building" put an
   * 18px fallback diamond on top of every one of those drills — the mark buried
   * the thing it was standing next to. A lamp post is not capturable and no
   * trigger hands it over, so neither predicate holds and it goes back to being
   * scenery.
   *
   * Nothing real is lost: a tech building is capturable by definition, and a
   * pre-captured map's structures arrive through a ChangeHouse trigger. What
   * ownership still decides is the *colour* — see structureOwnership.
   */
  function iconFor(own, name) {
    if (!own.capturable && !own.handover) return "";
    return BUILDING_ICONS[name] || "marker";
  }

  /**
   * Outline the ground a marked building stands on.
   *
   * Drawn **before** the sprites, not after: the outline is a statement about
   * the footprint, so the building standing on it — and the tree in front of it
   * — occludes the outline exactly the way it occludes the ground. What is left
   * is the two near edges, which is where the building's own silhouette ends;
   * how much of the two far edges survives is how much relief the building has,
   * and that is worth seeing rather than painting over.
   *
   * Green while it stands unowned, the owner's colour once it is somebody's.
   */
  function drawStructureOutlines(ctx, mapFile, cellFor, ctx3, owners) {
    const counts = { neutral: 0, owned: 0 };
    mapFile.structures.forEach((structure, index) => {
      const own = owners[index];
      // A building handed over by a trigger is outlined whether or not it can be
      // captured: it is already somebody's, which is the thing worth seeing.
      // Merely standing on a house that happens to be a country is not that —
      // see iconFor, which is this gate.
      if (!iconFor(own, structure.name)) return;
      const foundation = structureFoundation(ctx3, structure.name);
      if (!foundation) return;

      if (own.playable) {
        counts.owned++;
      } else {
        counts.neutral++;
      }

      const keys = new Set();
      for (let dx = 0; dx < foundation.width; dx++) {
        for (let dy = 0; dy < foundation.height; dy++) {
          keys.add(`${structure.rx + dx},${structure.ry + dy}`);
        }
      }
      outlineCells(ctx, keys, cellFor, own.color, OUTLINE_WIDTH);
    });
    return counts;
  }

  /**
   * Where every marked structure's pictogram goes, and how big — placement
   * only, no drawing. Coordinates are the ones `centreOf` speaks: output pixels
   * of whatever surface the caller is about to draw on.
   *
   * Split from the drawing because the two styles do different things with the
   * answer. The thumbnail bakes its badges into the picture, since at 400px the
   * glyph *is* the building. The full render hands them back instead: they ride
   * over a picture that stays clean, so the viewer can take them away without
   * re-rendering a 3000px map (`prefs.fullIcons`).
   *
   * Where it goes differs too. On the thumbnail the glyph sits on the
   * foundation; on the full render it rides above it (`iconLift`, `iconShift`)
   * with the outline still on the ground underneath, because at that size the
   * building's art is legible and a sign laid over it hides what it points at.
   */
  function structureBadges(mapFile, ctx3, owners, centreOf, style) {
    const badges = [];
    mapFile.structures.forEach((structure, index) => {
      const own = owners[index];
      const glyph = iconFor(own, structure.name);
      if (!glyph) return;
      const foundation = structureFoundation(ctx3, structure.name);
      if (!foundation) return;

      // The foundation's middle cell, so a 3×3 building is not marked at a corner.
      const centre = centreOf(
        structure.rx + (foundation.width - 1) / 2,
        structure.ry + (foundation.height - 1) / 2
      );
      const box = glyphBox(glyph, style.iconSize);
      if (style.iconLift) {
        // Measured off the footprint's up-screen cell rather than its middle, so
        // a long building does not push its own badge into itself.
        const top = centreOf(structure.rx, structure.ry);
        centre.y = top.y - style.iconLift - box / 2;
        centre.x += style.iconShift || 0;
      }
      badges.push({
        x: centre.x,
        y: centre.y,
        box,
        glyph,
        // The player's colour where the map hands the building over, white where
        // it stands unowned.
        color: own.playable ? own.color : ICON_NEUTRAL,
      });
    });
    return badges;
  }

  /** Badges onto a context, in the coordinates they were placed in. */
  function drawBadges(ctx, badges) {
    badges.forEach((b) => drawGlyph(ctx, b.glyph, b.x, b.y, b.box, b.color));
    return badges.length;
  }

  /**
   * Every reading aid, in one style, onto one target or several.
   *
   * `scale` and `view` map render coordinates onto the surface being drawn: the
   * detail marks go onto the full-resolution render itself (1:1, no crop yet),
   * the compact ones onto an already-cropped-and-downscaled thumbnail. Shapes
   * traced on cells are drawn through that transform; discs, numbers and
   * pictograms are drawn with it off, because their size belongs to the picture
   * rather than to the map.
   *
   * @param {function} target  layer name -> the 2d context to draw it on; a flat
   *                           render hands back the same one for every name
   */
  function drawMarks(target, style, scale, view, opts, data) {
    let badges = [];
    const surface = (name) => ({
      shape: () => {
        const ctx = target(name);
        ctx.setTransform(scale, 0, 0, scale, -view.x * scale, -view.y * scale);
        return ctx;
      },
      flat: () => {
        const ctx = target(name);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        return ctx;
      },
    });
    /** A cell's centre, in output pixels. */
    const centreOf = (rx, ry) => {
      const cell = data.cellFor(rx, ry);
      return {
        x: (cell.x + BLOCK.width / 2 - view.x) * scale,
        y: (cell.y + BLOCK.height / 2 - view.y) * scale,
      };
    };

    if (opts.annotate !== false) {
      drawOreFields(surface("marks").shape(), data.mapFile, data.cellFor, style, scale);
      if (style.symbols) {
        // After the fields, so the dot lands on top of the yellow it is meant
        // to be seen against.
        drawOreDrills(surface("marks").flat(), data.mapFile, data.ctx3, centreOf, style);
      }
      // Both styles mark a tech building with a pictogram, and both take it from
      // the outlines' gate — on the thumbnail it replaces a building four grey
      // pixels wide, on the full render it rides above one whose art is worth
      // seeing. The size is the style's, and it is in output pixels either way,
      // so the transform stays off.
      if (style.iconSize && opts.outlines !== false) {
        badges = structureBadges(data.mapFile, data.ctx3, data.owners, centreOf, style);
        // `iconOverlay` is the whole toggle: the style that sets it gets its
        // badges back as numbers instead of pixels, and whoever shows the render
        // draws them — or does not.
        if (!style.iconOverlay) drawBadges(surface("marks").flat(), badges);
      }
    }
    if (opts.starts !== false) {
      if (style.symbols) {
        drawStartSquares(surface("starts").flat(), data.mapFile, centreOf, style);
      } else {
        drawStartBlocks(surface("starts"), data.mapFile, data.cellFor, data.foundation, centreOf, style, scale);
      }
    }
    return badges;
  }

  /** A `sizes` entry -> { width, marks }. A bare number means the detail style. */
  function sizeSpec(value) {
    if (typeof value === "number") return { width: value, marks: "detail" };
    return { width: value.width, marks: MARK_STYLES[value.marks] ? value.marks : "detail" };
  }

  /**
   * @param {object} [opts]
   * @param {object} [opts.mapFile]  what to render; defaults to the last map companion.js captured
   * @param {boolean} [opts.crop]    crop to the playable area (default true)
   * @param {boolean} [opts.objects] draw overlays, trees, smudges and structures (default true)
   * @param {boolean} [opts.annotate] ore/gem borders and structure ownership outlines (default true)
   * @param {boolean} [opts.outlines] just the structure outlines, to see the buildings under them (default true)
   * @param {boolean} [opts.starts]  spawn blocks, one per start position (default true)
   * @param {boolean} [opts.grid]    draw the cell grid, to check what sits where
   * @param {object} [opts.tune]     { x, y } pixel nudge applied to every sprite pass
   * @param {object} [opts.fix]      per-type override of SPRITE_FIX, e.g. { ore: { y: -10 } }
   * @param {object} [opts.fixByName] per-object exception, e.g. { CAAIRP: { x: 7, y: -7 } }
   * @param {boolean} [opts.layers]  also return each sprite type as its own transparent
   *                                 image, drawn without the SPRITE_FIX corrections —
   *                                 what the options page's alignment panel moves
   * @param {number} [opts.layerWidth] with `layers`: emit them as **canvases** at this
   *                                 width instead of full-size data URLs, for a consumer
   *                                 compositing them in-page rather than storing them
   * @param {boolean} [opts.look]    `false` renders untuned — no appearance dial baked into
   *                                 any palette, for a consumer applying the same dials
   *                                 itself at composite time
   * @param {number} [opts.maxWidth] downscale the result to this width (0 = full resolution)
   * @param {object} [opts.sizes]   { name: width | { width, marks } } -> result.variants[name]
   *                                as a data URL. `marks: "compact"` gives the thumbnail
   *                                vocabulary — solid harvest fields and pictograms, drawn
   *                                after the downscale; a bare width is "detail".
   * @param {boolean} [opts.open]    open the PNG in a new tab (default true)
   */
  async function render(opts = {}) {
    const started = performance.now();
    const mapFile =
      opts.mapFile || (window.__cdc && window.__cdc.state && window.__cdc.state.lastMapFile);
    if (!mapFile) throw new Error("no map captured yet — load a game first, or pass {mapFile}");
    const tune = { x: 0, y: 0, ...(opts.tune || {}) };
    const layered = !!opts.layers;
    const fix = resolveFix(tune, opts.fix, layered, opts.fixByName);

    const ctx3 = await buildContext(mapFile, opts);
    const { GameMap, TmpDrawable, ObjectType, BridgeOverlayTypes, theater } = ctx3;
    const tileSets = theater.tileSets;

    // GameMap gives the tiles the engine itself would use, LAT smoothing
    // included. It is not essential — the raw map tiles render too, just
    // without the smoothed transitions — so a map it refuses to build still
    // produces a picture.
    let gameMap = null;
    let tiles;
    try {
      gameMap = new GameMap(mapFile, tileSets, ctx3.rules, firstVariant);
      tiles = gameMap.tiles.getAll();
    } catch (e) {
      console.warn(TAG, "GameMap refused this map, falling back to raw tiles", e);
      tiles = mapFile.tiles.filter(Boolean);
    }
    const tileAt = gameMap ? (rx, ry) => gameMap.tiles.getByMapCoords(rx, ry) : () => null;

    const headroom = HEADROOM_LEVELS * (BLOCK.height / 2);
    const canvas = document.createElement("canvas");
    canvas.width = 2 * mapFile.fullSize.width * (BLOCK.width / 2) + BLOCK.width;
    canvas.height = 2 * mapFile.fullSize.height * (BLOCK.height / 2) + 2 * headroom;
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = false;

    /**
     * A layered render sends each sprite type — and the marks, and the grid — to
     * a transparent surface of its own instead of the one canvas. That is what
     * lets a surface with no game client, i.e. the options page, slide one type
     * against the rest to measure its offset; compositing them back in order
     * gives exactly the flat render.
     */
    const surfaces = new Map(); // name -> canvas, created on first draw
    function surfaceFor(name) {
      let surface = surfaces.get(name);
      if (!surface) {
        surface = document.createElement("canvas");
        surface.width = canvas.width;
        surface.height = canvas.height;
        surface.getContext("2d").imageSmoothingEnabled = false;
        surfaces.set(name, surface);
      }
      return surface.getContext("2d");
    }
    const target = (name) => (layered ? surfaceFor(name) : ctx);

    // Shared by every pass below, and worked out once: the sprite pass paints a
    // structure in its owner's colour, the outline pass rings it in the same
    // one, and the thumbnail's pictogram takes its colour from it too.
    const mapWidth = mapFile.fullSize.width;
    const cellFor = (rx, ry) => {
      const tile = tileAt(Math.round(rx), Math.round(ry));
      const o = cellOrigin(rx, ry, tile ? tile.z : 0, mapWidth);
      return { ...o, y: o.y + headroom };
    };
    const owners = structureOwnership(mapFile, ctx3);

    // --- terrain -----------------------------------------------------------
    const isoLut = lutFor(ctx3, theater.isoPalette, "base");
    const tileSprites = new Map(); // TmpImage -> { canvas, offsetX, offsetY }
    const drawable = new TmpDrawable();
    let drawn = 0;
    let missing = 0;

    // Row order: a tile's cliff overhang extends upwards, over the row behind
    // it, so rows must land back to front.
    const ordered = tiles.slice().sort((a, b) => a.dy - b.dy || a.dx - b.dx);

    for (const tile of ordered) {
      const entry = tileSets.getTile(tile.tileNum);
      if (!entry) {
        missing++;
        continue;
      }
      const tmp = entry.getTmpFile(tile.subTile, firstVariant);
      if (!tmp || tile.subTile >= tmp.images.length) {
        missing++;
        continue;
      }
      const image = tmp.images[tile.subTile];
      let sprite = tileSprites.get(image);
      if (!sprite) {
        // Same offsets MapTileLayer applies: with extra data the drawn bitmap
        // grows up and to the left of the tile block, and the block must stay
        // where it belongs.
        const offsetX = image.hasExtraData ? Math.max(0, image.x - image.extraX) : 0;
        const offsetY = image.hasExtraData ? Math.max(0, image.y - image.extraY) : 0;
        const bmp = drawable.draw(image, tmp.blockWidth, tmp.blockHeight);
        sprite = {
          canvas: canvasFromIndexed(bmp.data, bmp.width, bmp.height, isoLut),
          offsetX,
          offsetY,
        };
        tileSprites.set(image, sprite);
      }
      const x = tile.dx * (tmp.blockWidth / 2) - sprite.offsetX;
      const y =
        tile.dy * (tmp.blockHeight / 2) - tile.z * (tmp.blockHeight / 2) - sprite.offsetY + headroom;
      ctx.drawImage(sprite.canvas, x, y);
      drawn++;
    }

    // --- structure outlines ------------------------------------------------
    // Between the terrain and the objects on purpose — see drawStructureOutlines.
    const counts = { smudges: 0, overlays: 0, terrain: 0, structures: 0, noArt: 0 };
    if (opts.annotate !== false && opts.outlines !== false) {
      counts.outlined = drawStructureOutlines(target("outlines"), mapFile, cellFor, ctx3, owners);
    }

    // --- objects -----------------------------------------------------------
    const jobs = [];

    if (opts.objects !== false) {
      for (const smudge of mapFile.smudges) {
        const obj = spriteForObject(ctx3, smudge.name, ObjectType.Smudge, 0, null, "smudge");
        if (!obj) {
          counts.noArt++;
          continue;
        }
        queue(jobs, cellFor(smudge.rx, smudge.ry), obj, 1, "smudge", fix, smudge.name);
        counts.smudges++;
      }

      for (const overlay of mapFile.overlays) {
        if (SKIP_OVERLAY_IDS.has(overlay.id)) continue;
        let name;
        try {
          name = ctx3.rules.getOverlayName(overlay.id);
        } catch (e) {
          counts.noArt++;
          continue;
        }
        // Overlay#computeFrame: the frame is the stored value — ore density,
        // wall connectivity, bridge piece.
        // Three kinds of overlay, three placements. Ore and bridges each needed
        // their own correction against the game; walls and fences are what is
        // left over as "overlay". Decided before the sprite rather than after,
        // because it now also decides which appearance dial the sprite is drawn
        // under -- and the palette is baked at that moment.
        const overlayType = oreClassFor(overlay.id)
          ? "ore"
          : BridgeOverlayTypes.isBridge(overlay.id)
          ? "bridge"
          : "overlay";
        const obj = spriteForObject(ctx3, name, ObjectType.Overlay, overlay.value || 0, null, overlayType);
        if (!obj) {
          counts.noArt++;
          continue;
        }
        // A high bridge sits four levels above the cells it spans.
        const lift = BridgeOverlayTypes.isHighBridge(overlay.id) ? 4 : 0;
        const cell = cellFor(overlay.rx, overlay.ry);
        cell.y -= lift * (BLOCK.height / 2);
        queue(jobs, cell, obj, 2, overlayType, fix, name);
        counts.overlays++;
      }

      for (const terrain of mapFile.terrains) {
        const obj = spriteForObject(ctx3, terrain.name, ObjectType.Terrain, 0, null, "terrain");
        if (!obj) {
          counts.noArt++;
          continue;
        }
        // An ore drill is a terrain object that grows ore, and it sits with the
        // ore rather than with the trees — the client already sets it apart the
        // same way, zeroing the draw offset every other terrain object gets
        // (ObjectArt#getDrawOffset, `spawnsTiberium`).
        queue(
          jobs,
          cellFor(terrain.rx, terrain.ry),
          obj,
          3,
          spawnsOre(ctx3, terrain.name) ? "ore" : "terrain",
          fix,
          terrain.name
        );
        counts.terrain++;
      }

      mapFile.structures.forEach((structure, index) => {
        const own = owners[index];
        // A structure the map hands to a player is drawn in that player's
        // colour, the way the game draws it; everything else stays neutral grey.
        const parts = buildingSprites(ctx3, structure.name, own.playable ? hexToRgb(own.color) : null);
        if (!parts) {
          counts.noArt++;
          return;
        }
        // Anchored at the plain cell, like every other object: a building's
        // game position carries the foundation centre offset
        // (ObjectPosition#setCenterOffset) and Building#setPosition subtracts it
        // straight back out, so the sprite hangs off the foundation's origin cell.
        const cell = cellFor(structure.rx, structure.ry);
        for (const part of parts) queue(jobs, cell, part, 4, "building", fix, structure.name);
        counts.structures++;
      });

      jobs.sort((a, b) => a.dy - b.dy || a.dx - b.dx || a.layer - b.layer);
      // `job.surface` is `job.type` for all but the objects with a layer of
      // their own, and `target` is the flat canvas unless this is layered — so
      // a flat render draws exactly what it always did, in the same order.
      for (const job of jobs) target(job.surface).drawImage(job.canvas, job.x, job.y);
    }

    // --- marks -------------------------------------------------------------
    const view =
      opts.crop !== false
        ? cropRect(mapFile)
        : { x: 0, y: 0, width: canvas.width, height: canvas.height - headroom };
    const marks = { mapFile, cellFor, ctx3, owners, foundation: conYardFoundation(ctx3) };
    const specs = {};
    for (const name of Object.keys(opts.sizes || {})) specs[name] = sizeSpec(opts.sizes[name]);
    const variants = {};
    let variantBytes = 0;

    // Compact outputs come off the render **before** the detail marks land on
    // it, because they draw their own — sized in the pixels the thumbnail
    // actually has rather than shrunk with the map along with the terrain.
    for (const name of Object.keys(specs)) {
      if (specs[name].marks !== "compact") continue;
      const small = cropScale(canvas, view, headroom, specs[name].width, false);
      drawMarks(() => small.canvas.getContext("2d"), MARK_STYLES.compact, small.scale, view, opts, marks);
      variants[name] = small.canvas.toDataURL("image/png");
      variantBytes += variants[name].length;
    }

    // The detail marks go on last, over everything: they are the reading aid,
    // not the map. In a layered render they are also the measuring stick —
    // every one is traced on true cells — so each goes to a surface of its own
    // and the panel can take any of them away.
    // A layered render gets the grid unless it says otherwise: it is the
    // alignment panel's measuring stick, and that panel is what layers were
    // built for. The radar is the second consumer and wants a picture, not a
    // measuring stick, so `grid: false` has to be able to reach this.
    if (opts.grid === undefined ? layered : !!opts.grid) {
      drawCellGrid(target("grid"), tiles, mapWidth, headroom);
    }
    const badges = drawMarks(target, MARK_STYLES.detail, 1, ORIGIN, opts, marks);

    // --- output ------------------------------------------------------------
    let out = opts.crop !== false ? cropScale(canvas, view, headroom, 0, false).canvas : canvas;

    // Layers before any downscale, unless the caller names a width: an offset is
    // measured in render pixels, and at 3000px on a bigger map a half-cell step
    // would land between them.
    //
    // Two ways out, on the precedent `sizes` sets just below. A caller that
    // names no width is sending the layers to **storage** -- the options page's
    // alignment panel -- and gets full-size data URLs, exactly as before. A
    // caller that names `layerWidth` is **compositing them in-page**, which is
    // the radar, and gets canvases at that width.
    //
    // That second shape is not a convenience. Ten surfaces of a 3000px map are
    // around 1.6 GB held as full-size RGBA, and PNG-encoding all of them costs
    // seconds a match start does not have; at radar width the same stack is a
    // few tens of megabytes and no encode happens at all. Handing back canvases
    // rather than data URLs is the other half of that: the radar draws them, so
    // a round trip through PNG and an `img` would be pure cost.
    let layers = null;
    let layerBytes = 0;
    let layerSize = null;
    if (layered) {
      const width = opts.layerWidth || 0;
      // `base` comes off the master canvas because in a layered render that is
      // all the master holds -- the terrain pass draws straight to it and every
      // sprite pass was diverted to a surface.
      const emit = (source, alpha) => {
        const scaled = cropScale(source, view, headroom, width, alpha).canvas;
        return width ? scaled : scaled.toDataURL("image/png");
      };
      layers = { base: emit(canvas, false) };
      for (const [name, surface] of surfaces) layers[name] = emit(surface, true);
      const sized = width ? layers.base : out;
      layerSize = { width: sized.width, height: sized.height };
      // Bytes are a data-URL figure; canvases are measured by the caller that
      // decided their width, so reporting 0 here would be a lie either way.
      if (!width) for (const name of Object.keys(layers)) layerBytes += layers[name].length;
      // The full-size surfaces are dead the moment they have been emitted, and
      // there are of them enough that waiting for the collector is visible: a
      // 3000px map keeps roughly 36 MB per surface alive. Zeroing the backing
      // store releases it now rather than whenever the next allocation forces a
      // sweep. Not `canvas` -- `out` is still a view onto it and is returned.
      for (const [, surface] of surfaces) {
        surface.width = 0;
        surface.height = 0;
      }
      surfaces.clear();
    }

    for (const name of Object.keys(specs)) {
      if (specs[name].marks === "compact") continue;
      variants[name] = downscale(out, specs[name].width).toDataURL("image/png");
      variantBytes += variants[name].length;
    }

    if (opts.maxWidth && out.width > opts.maxWidth) out = downscale(out, opts.maxWidth);

    if (gameMap) gameMap.dispose();

    // The detail badges, as fractions of the picture that comes out of here
    // rather than pixels of the canvas they were placed on. Fractions because
    // the consumer decides the size: the same list has to land correctly on a
    // 3000px render, on the half-screen loading panel, and on a lightbox mid-
    // zoom. `cropWidth`/`cropHeight` are cropScale's arithmetic, and the
    // downscale after it keeps proportions, so one mapping covers every output.
    const cropWidth = Math.min(view.width, canvas.width);
    const cropHeight = Math.min(view.height + headroom, canvas.height);
    const icons = badges.map((b) => ({
      x: (b.x - view.x) / cropWidth,
      y: (b.y - view.y) / cropHeight,
      size: b.box / cropWidth,
      glyph: b.glyph,
      color: b.color,
    }));

    const result = {
      canvas: out,
      ms: 0,
      width: out.width,
      height: out.height,
      tilesDrawn: drawn,
      tilesMissing: missing,
      uniqueTiles: tileSprites.size,
      objects: counts,
      icons,
      bytes: 0,
      layers,
      layerSize,
      layerBytes,
    };

    // Two ways out. `sizes` is for the extension itself: one render, several
    // widths, as data URLs it can hand to storage. Without it the render is for
    // a human to look at, so it becomes a blob URL and a tab.
    if (opts.sizes) {
      result.variants = variants;
      result.bytes += variantBytes;
    }
    // A layered render already carries the picture, several times over — making
    // a blob of the flat one too would just be more megabytes to hold onto.
    if ((!opts.sizes && !layered) || opts.open) {
      const blob = await new Promise((resolve) => out.toBlob(resolve, "image/png"));
      result.blob = blob;
      result.url = URL.createObjectURL(blob);
      result.bytes = blob.size;
    }
    result.ms = Math.round(performance.now() - started);
    state.last = result;

    log(
      `${result.width}×${result.height} — ${drawn} tiles (${tileSprites.size} unique` +
        `${missing ? `, ${missing} missing` : ""}), ${counts.overlays} overlays, ` +
        `${counts.terrain} terrain, ${counts.structures} structures, ${counts.smudges} smudges` +
        `${counts.noArt ? `, ${counts.noArt} without art` : ""}` +
        (counts.outlined
          ? ` — ${counts.outlined.neutral} civilian / ${counts.outlined.owned} pre-owned buildings`
          : "") +
        " — " +
        `${(result.bytes / 1048576).toFixed(1)} MB in ${result.ms} ms`
    );
    if (opts.open !== false && result.url) window.open(result.url, "_blank");
    return result;
  }

  /**
   * Render the loaded map into per-type layers and hand them to the extension's
   * storage half, which is what the options page's alignment panel reads.
   *
   * Sent rather than returned: the panel lives in a page with no game client, so
   * the only way a layered render reaches it is through storage. One sample is
   * kept — this is an instrument for measuring SPRITE_FIX, not a second
   * catalogue.
   *
   * `mapFile` names a map other than the one in play — the options page asking
   * for a map out of its own catalogue. The identity then has to come with it:
   * `state.map` is whatever this tab last loaded, and labelling a sample of one
   * map with the name of another is worse than not labelling it at all.
   */
  async function sample(opts = {}) {
    const result = await render({ ...opts, layers: true, open: false, maxWidth: 0 });
    const st = (window.__cdc && window.__cdc.state) || {};
    const played = (st.map && st.map.facts) || {};
    const facts = opts.mapFile ? { key: opts.key || "", name: opts.name || opts.key || "" } : played;
    window.postMessage(
      {
        source: "cdc-page",
        type: "map-sample",
        sample: {
          key: facts.key || "",
          name: facts.name || facts.key || "unnamed map",
          width: result.layerSize.width,
          height: result.layerSize.height,
          // The panel starts from what the render already applies — defaults
          // plus whatever its own editor has saved — so its numbers are absolute
          // per-type fixes rather than a correction on top of one.
          fix: effectiveFix(),
          // The per-object corrections the panel can dial, on the same terms:
          // absolute values, so a row shows what the render would use rather
          // than a correction on top of one.
          fixByName: effectiveFixByName(),
          // Every dial this build can split out, drawn or not. A layer exists
          // only where something was drawn onto it, so "no airport layer" reads
          // two ways — the map has none, or the build that captured the sample
          // could not separate one — and only the capturing build can tell the
          // panel which. Derived, so a dial added below cannot forget to say so.
          dials: [...SPRITE_TYPES, ...new Set(Object.values(ALIGN_LAYER_BY_NAME))],
          layers: result.layers,
        },
      },
      "*"
    );
    log(
      `alignment sample: ${result.layerSize.width}×${result.layerSize.height}, ` +
        `${Object.keys(result.layers).join(", ")} — ` +
        `${(result.layerBytes / 1048576).toFixed(1)} MB sent to storage`
    );
    return result;
  }

  /**
   * The rules alone, without the art.
   *
   * `buildContext` loads the map's theater — megabytes of tiles and SHPs, and in
   * CDN mode a download — because everything that *draws* needs it. Everything
   * that only wants to know what a map holds needs the ruleset and nothing else:
   * which country a house acts as, whether a building can be captured, whether a
   * terrain object grows ore. Split out so `survey` can answer for a map whose
   * theater this client has never fetched, and cost nothing when it has.
   */
  async function rulesOnly() {
    const mods = await imports();
    if (!state.rules) state.rules = new mods.Rules(mods.Engine.getRules());
    return { ...mods, rules: state.rules };
  }

  /**
   * Every object a player can ever be given to build, and the countries allowed
   * to build it.
   *
   * This is the roster the options page binds keys against, and it is read from
   * **the client's own rules**. So are the other two tables this file harvests
   * — the cameo sheet below and `objectTypes` — which the repo used to ship as
   * files generated off a local RA2 install; the client is the better source
   * for all three, three ways over: it layers `rulescd.ini` on top of
   * `rules.ini`, so its values are the ones actually in play where an
   * RA2-derived table would disagree wherever Chrono Divide changed something;
   * it cannot go stale against a client update the way a committed file did;
   * and `rulesOnly` is already here, so it costs no new dependency and no
   * second parse of rules.ini.
   *
   * **Three filters, and they are the client's own**, taken from
   * `Production#isAvailableForProduction`: `techLevel === -1` is how the rules
   * mark a thing that is never buildable, `BuildLimit=0` is how they mark one
   * only the AI may have, and an empty `Owner` is a civilian or scenery object
   * that belongs to no country. What is left is what a human can be given to
   * build in some match — which is the question a key binding asks.
   *
   * What this deliberately does **not** answer is whether a thing can be built
   * *now*: prerequisites, factories and tech level at this moment are
   * `production.getAvailableObjects()` in a running match, and the press asks
   * the client rather than this table. A binding outlives a match; availability
   * does not.
   *
   * Names and costs are not returned either — `objectTypes` below harvests
   * both for every object here, keyed by the ordinal a replay names, and the
   * options page already loads that table for the replay views. `owner` is raw
   * for the same reason: the country -> side table is companion.js's
   * `FACTIONS`, which is what every other faction label in the extension comes
   * from.
   *
   * @returns {Promise<Array<{ name: string, type: string, owner: string[] }>>}
   */
  async function roster() {
    const { rules, ObjectType } = await rulesOnly();
    const out = [];
    // The four techno lists, by the name the object table groups them under.
    // `allObjectRules` also holds terrain, overlay, smudge and voxel-anim rules,
    // which have no owner and no tech level and would be filtered out anyway —
    // naming the four is cheaper than walking eight and rejecting half.
    const LISTS = [
      [ObjectType.Building, "building"],
      [ObjectType.Infantry, "infantry"],
      [ObjectType.Vehicle, "vehicle"],
      [ObjectType.Aircraft, "aircraft"],
    ];
    for (const [type, label] of LISTS) {
      const byName = rules.allObjectRules.get(type);
      if (!byName) {
        log(`no ${label} rules in this client — roster incomplete`);
        continue;
      }
      for (const [name, object] of byName) {
        if (object.techLevel === -1) continue;
        if (object.buildLimit === 0) continue;
        const owner = object.owner || [];
        if (!owner.length) continue;
        out.push({ name, type: label, owner: [...owner] });
      }
    }
    return out;
  }

  /**
   * Every colour the rules define, by name, with the hex the client would draw
   * it in — and which of them a lobby offers.
   *
   * This is the table the recolour option picks from, and it is harvested for
   * the same reason `roster` is: the client layers `rulescd.ini` over
   * `rules.ini`, so a hex written down here would be our guess at a number the
   * client already knows, and would go stale the day Chrono Divide retunes a
   * colour. `rulesOnly` is already loaded, so it costs one more walk of a Map.
   *
   * **The whole `[Colors]` section, not just the eight.** A remap is legal for
   * any colour in it — the renderable precomputes one palette per entry of
   * `rules.colors` and looks the live one up by content hash — while
   * `mpAllowedColors` is only the subset a lobby lets a player choose. Offering
   * the wider set is what makes "recolour" mean more than "swap two lobby
   * picks", and `mp` is returned beside it so the options page can put the
   * familiar eight first.
   *
   * @returns {Promise<{ mp: string[], colors: Record<string, string> }>}
   */
  async function colours() {
    const { rules, mpAllowedColors } = await rulesOnly();
    const colors = {};
    for (const [name, colour] of rules.colors) {
      // asHexString is the client's own "#rrggbb"; asHex is the number three
      // other call sites want. A swatch is CSS, so the string.
      colors[name] = colour.asHexString();
    }
    const mp = (mpAllowedColors || []).filter((name) => colors[name]);
    if (mp.length !== (mpAllowedColors || []).length) {
      log(`the lobby colour list names ${mpAllowedColors.length}, the rules define ${mp.length}`);
    }
    return { mp, colors };
  }

  /**
   * Every cameo this client can draw, as one sheet and an id -> cell map.
   *
   * The shape `src/cameos.js` used to publish as `window.__cdcCameos`, built
   * from the player's own client instead of from the author's Red Alert 2
   * install. That is the entire point, and why that file is gone: EA never
   * licensed RA2's artwork for redistribution, so the committed sheet was 190 KB
   * nobody here had the right to ship. Harvested at runtime the pixels never
   * enter the repo, and they are the player's own localisation rather than the
   * Russian one baked into the install the committed sheet came out of.
   *
   * **`Cameo=` is art, not rules.** Measured against the live client
   * (`scripts/probe-cameo-harvest.js`, 2026-08-20): `art.getObject(id).cameo`
   * answered for 97 of 97 technos and `rules.sidebarImage` for none of them,
   * while `sidebarImage` answered for all seven superweapons. The two are
   * different mechanisms rather than fallbacks for one another, which is why
   * this reads each from its own place instead of trying one and then the other.
   *
   * **Unfiltered, unlike `roster()` above.** That one applies the client's three
   * buildability tests because a key binding asks what a player may build. A
   * cameo answers a different question — what a *replay* may name — and a replay
   * names objects no one can build: things delivered rather than ordered, and
   * things a mission gave someone. Measured on the same probe run: the filtered
   * walk finds 87 objects with pictures, where the committed sheet names 99 —
   * so the filters cost ids a replay can put on a timeline.
   *
   * Aliases are the normal case, not an edge one: two ids frequently share one
   * picture (a Chrono Sphere and its warp, a construction yard and its MCV), so
   * cells are keyed by picture name and the index points many ids at one cell.
   *
   * One id failing costs that id and nothing else — a missing SHP is recorded
   * and the walk goes on, because the sheet is worth having 99% complete and
   * unavailable is worth nothing. A harvest that draws *nothing* is a failure
   * and says so.
   */
  async function cameos() {
    const { rules, Art, ObjectType, Engine, ImageUtils } = await rulesOnly();
    // Two arguments, no mapFile — `buildContext` passes one because a map's own
    // art overrides the global set; a cameo has no map to be overridden by.
    // Confirmed accepted by the live client rather than assumed.
    const art = new Art(rules, Engine.getArt());
    const palette = Engine.getPalettes().get("cameo.pal");
    if (!palette) throw new Error("no cameo.pal in the VFS — are the game files imported?");

    /** The picture name for one id, or "" if its art names none. */
    const pictureFor = (name, type) => {
      try {
        const object = art.getObject(name, type);
        return (object && object.cameo) || "";
      } catch (e) {
        // An id the art has no section for at all. That is most of the rules
        // lists — scenery, fences, the Tiberian Sun leftovers the engine
        // inherited — so it is the common case, not an error worth logging.
        return "";
      }
    };

    const LISTS = [
      [ObjectType.Building, "building"],
      [ObjectType.Infantry, "infantry"],
      [ObjectType.Vehicle, "vehicle"],
      [ObjectType.Aircraft, "aircraft"],
    ];

    const wanted = new Map(); // id -> picture name
    let objects = 0;
    for (const [type, label] of LISTS) {
      const byName = rules.allObjectRules.get(type);
      if (!byName) {
        log(`no ${label} rules in this client — the sheet will be short of them`);
        continue;
      }
      for (const name of byName.keys()) {
        objects++;
        const picture = pictureFor(name, type);
        if (picture) wanted.set(name, picture);
      }
    }

    // Superweapons are not objects — no Image= and so no Cameo= — which is why
    // the offline generator could never produce these and hand-listed two of
    // them. The client parses SidebarImage= onto the weapon's own rules.
    const weapons = rules.superWeaponRules;
    if (weapons && typeof weapons.forEach === "function") {
      weapons.forEach((weapon, key) => {
        const picture = (weapon && weapon.sidebarImage) || "";
        if (picture) wanted.set(`sw:${(weapon && weapon.name) || key}`, picture);
      });
    }

    const images = Engine.getImages();
    const index = {};
    const cellOf = new Map(); // picture name -> cell, so aliases share pixels
    const canvases = [];
    const missing = [];
    for (const [id, picture] of wanted) {
      if (cellOf.has(picture)) {
        index[id] = cellOf.get(picture);
        continue;
      }
      let shp = null;
      try {
        shp = images.get(picture + ".shp");
      } catch (e) {
        // A miss throws in some collections and returns undefined in others.
        shp = null;
      }
      if (!shp) {
        missing.push(`${id} -> ${picture}.shp`);
        continue;
      }
      try {
        // The converter lays every frame of the file out in a row. A cameo is
        // one frame, but crop rather than trust that: a file with two would
        // otherwise draw both, squeezed. The same crop src/companion.js uses.
        const full = ImageUtils.convertShpToCanvas(shp, palette);
        const canvas = document.createElement("canvas");
        canvas.width = CAMEO_CELL.width;
        canvas.height = CAMEO_CELL.height;
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
        cellOf.set(picture, canvases.length);
        index[id] = canvases.length;
        canvases.push(canvas);
      } catch (e) {
        missing.push(`${id} -> ${picture}.shp: ${(e && e.message) || e}`);
      }
    }

    /**
     * The borrows, after the conversion rather than before it.
     *
     * What a borrower needs is a **cell**, and only the conversion above knows
     * which pictures became one. Asked of `wanted` instead, the question was
     * "was a picture nominated for this id" — a different question, and the
     * two came apart on the very ids this exists for: a construction yard's art
     * names a cameo SHP the shipped client does not hold, so `wanted` had it,
     * the borrow stood down, and the conversion then dropped it for a missing
     * file. 405 ids harvested off a real store, with GACNST and NACNST — the
     * most-drawn row a replay report has — absent from every one of them.
     *
     * Keyed on the result it is right under every branch: no art section, an
     * empty `Cameo=`, a picture the VFS lost, a converter that threw. Each of
     * those ends the same way, with an id that has no cell.
     */
    for (const [id, source] of Object.entries(CAMEO_BORROWED)) {
      if (index[id] !== undefined) continue;
      const cell = index[source];
      if (cell === undefined) {
        // Both halves gone is a different report from either alone: nothing was
        // rescued and the id draws in words, which is the state a live run has
        // to be able to tell from a successful borrow.
        log(`${id} has no cell and ${source} has none to lend — it will draw in words`);
        continue;
      }
      index[id] = cell;
      // An id the borrow rescued is not missing art: it draws, out of the
      // lender's cell. Left in the list it would be counted and logged as art
      // the harvest lost, which is the opposite of what happened — and that
      // count is what the run reports.
      const lost = missing.findIndex((line) => line.startsWith(`${id} -> `));
      if (lost === -1) log(`${id} has no picture of its own and borrows ${source}'s cell ${cell}`);
      else log(`${id} lost its own art (${missing.splice(lost, 1)[0]}) and borrows ${source}'s cell ${cell}`);
    }

    if (!canvases.length) {
      throw new Error(`no cameo drew at all, out of ${wanted.size} the rules name`);
    }

    const rows = Math.ceil(canvases.length / CAMEO_COLS);
    const sheet = document.createElement("canvas");
    sheet.width = CAMEO_COLS * CAMEO_CELL.width;
    sheet.height = rows * CAMEO_CELL.height;
    const ctx = sheet.getContext("2d");
    canvases.forEach((canvas, i) => {
      ctx.drawImage(
        canvas,
        (i % CAMEO_COLS) * CAMEO_CELL.width,
        Math.floor(i / CAMEO_COLS) * CAMEO_CELL.height
      );
    });

    return {
      // The drawing contract, kept identical to the committed sheet's so no
      // consumer of it had to learn a second shape when that file went.
      cols: CAMEO_COLS,
      cell: { width: CAMEO_CELL.width, height: CAMEO_CELL.height },
      size: { width: sheet.width, height: sheet.height },
      sheet: sheet.toDataURL("image/png"),
      index,
      // What the harvest saw, for the run to report and the log to name. Not
      // part of the drawing contract; a reader that only draws ignores these.
      pictures: canvases.length,
      ids: Object.keys(index).length,
      objects,
      missing,
    };
  }

  /**
   * The table a replay is written in: object ordinal -> what was built.
   *
   * A replay names what a player built by an **ordinal** and nothing else.
   * `Rules#readObjectTypes` walks `[BuildingTypes]`, `[InfantryTypes]`,
   * `[VehicleTypes]` and `[AircraftTypes]` in file order handing out 0, 1, 2…
   * (skipping a non-numeric key and a repeated name), keeps the four maps of
   * ordinal -> internal name, and `getTechnoByInternalId` reads them back to
   * decode. Those four maps *are* the table that makes a build order readable,
   * and this is them harvested out of the client that will decode the replay —
   * rather than generated from a retail Red Alert 2 install, which is what
   * `src/replay-types.js` was and the reason it is gone.
   *
   * The client's copy is the better source for the three reasons `roster()`
   * gives above, plus one of its own: the display names come back in the
   * player's own language, where the committed table carries the language of
   * the install it was generated from.
   *
   * **The ordinals are dense, and that is asserted rather than trusted.** `s++`
   * runs only on an accepted entry, so the keys are exactly `0..size-1` — which
   * is what lets each list be an array whose index *is* the ordinal. A hole
   * would shift every id below it and mislabel a whole timeline, so a list that
   * is not dense fails this harvest by name. Deliberately not a fallback:
   * whatever is in storage was harvested from a client that made sense, and
   * keeping it beats replacing it with a shifted table.
   *
   * **Walked by ordinal, never by `allObjectRules` order.** That map holds the
   * same objects keyed by name, which makes iterating it the obvious mistake:
   * nothing promises its order is the type lists', and it also holds objects no
   * type list names. It is read here only to *join* an ordinal to its rules.
   *
   * @param {{ get: (key: string) => string }} strings the client's string table
   *   — `stringTable(mods)` in companion.js. Passed in rather than built here:
   *   there is one of them in this extension, it is that one, and `uiName` is a
   *   CSF key that means nothing without it.
   * @returns {Promise<object>} the shape `src/replay-types.js` used to publish
   *   as `window.__cdcReplayTypes` / `window.__cdcReplayRules`, so no consumer
   *   had to learn a second one, plus what the harvest saw for the log to name.
   */
  async function objectTypes(strings) {
    if (!strings || typeof strings.get !== "function") {
      throw new Error("no string table passed — a display name is a CSF key until one resolves it");
    }
    const { rules, ObjectType, BuildCat, FactoryType } = await rulesOnly();

    // Two of the fields below are numeric enums on the client's rules objects
    // and strings in the table this produces, so the enums themselves have to be
    // in hand. Writing their numbers down here instead would be a copy of the
    // client's ordinals living in our source — the same drift this harvest
    // exists to remove — so a client that does not export them fails the
    // harvest by name. There is nothing to guess with: `BuildCat.Combat` is 0
    // and `FactoryType.None` is 0, and neither of those is a value a default
    // can stand in for.
    if (!BuildCat || typeof BuildCat.Combat !== "number") {
      throw new Error("this client's game/rules/TechnoRules exports no BuildCat — a defence cannot be told from a structure");
    }
    if (!FactoryType || typeof FactoryType.None !== "number") {
      throw new Error("this client's game/rules/TechnoRules exports no FactoryType — a factory cannot be named");
    }

    // The four lists, in the order `Rules#init` reads them, under the names
    // src/replay.js groups them by: the label, the client's ordinal map, and
    // the ObjectType its rules objects are keyed under.
    const LISTS = [
      ["building", "buildingTypes", ObjectType.Building],
      ["infantry", "infantryTypes", ObjectType.Infantry],
      ["vehicle", "vehicleTypes", ObjectType.Vehicle],
      ["aircraft", "aircraftTypes", ObjectType.Aircraft],
    ];

    // Every techno this ruleset has, keyed by upper-case name, for the
    // prerequisite walk below: a prerequisite names an object without saying
    // which of the four lists it is in, and rules text is case-insensitive.
    const byUpperName = new Map();
    for (const [label, , type] of LISTS) {
      const objects = rules.allObjectRules.get(type);
      if (!objects) {
        log(`no ${label} rules in this client — nothing resolves through them`);
        continue;
      }
      for (const [name, object] of objects) byUpperName.set(name.toUpperCase(), object);
    }

    // The two roots of every prerequisite chain, and the only objects whose
    // side is stated rather than inherited.
    const YARD_SIDE = { GACNST: "Allied", NACNST: "Soviet" };

    /**
     * Which side can actually build something, out of the prerequisite chain.
     *
     * **Not `owner`.** That lists every country for almost every object, on
     * purpose — RA2's own rules text says why beside `GTGCAN`: narrowing it
     * would grey a cameo out instead of hiding it. So it answers "both" for the
     * Ore Purifier, which no Soviet player can build.
     *
     * What the game gates on is the chain: `GAOREP` needs `GATECH,PROC,GACNST`,
     * `GATECH` needs `GAWEAP,RADAR,GACNST`, and `GACNST` is the Allied
     * Construction Yard, which a Soviet player never has. The two yards are the
     * roots and everything else inherits from what it is built on; category
     * tokens (POWER, FACTORY, BARRACKS, RADAR, TECH, PROC) name no object and
     * so carry nothing.
     *
     * Undetermined stays undetermined — an object whose chain never reaches a
     * yard gets no `side`, and nothing downstream may assume one. Ported from
     * the deleted scripts/gen-replay-types.mjs, which resolved the same chain
     * over rules text; this reads it off the client's parsed `prerequisite`.
     */
    const sideOf = (name, seen = new Set()) => {
      const id = String(name).toUpperCase();
      if (YARD_SIDE[id]) return YARD_SIDE[id];
      if (seen.has(id)) return ""; // a cycle in the rules is not a side
      seen.add(id);
      const object = byUpperName.get(id);
      if (!object) return ""; // a category token, not an object
      const sides = new Set();
      for (const need of Array.isArray(object.prerequisite) ? object.prerequisite : []) {
        const side = sideOf(need, seen);
        if (side) sides.add(side);
      }
      // Both would mean a chain reaching either yard, which no RA2 object has;
      // saying nothing is the honest answer if one ever appears.
      return sides.size === 1 ? [...sides][0] : "";
    };

    // What the harvest saw, for the run to report and the log to name. Each of
    // these counts a field read off a rules object whose spelling this
    // extension does not own, so one coming back zero says the client renamed
    // something — long before a report drawn from the table looks wrong.
    const seen = { named: 0, factories: 0, helipads: 0, defences: 0, sided: 0 };
    const unknown = []; // named by a type list, with no rules object behind it

    const rowFor = (name, object) => {
      if (!object) {
        // The ordinal exists and its row has to stay at this index: dropping one
        // would shift every id below it, which is the failure this whole
        // function is arranged around. Reported instead.
        unknown.push(name);
        return [name, "", 0];
      }
      // `uiName` is a CSF key ("Name:GAPOWR"), and the string table is the only
      // thing that turns one into a word. `Strings#get` hands an unknown key
      // back unchanged, which is the client's own answer and what the game
      // itself would print.
      const label = object.uiName ? String(strings.get(object.uiName)) : "";
      if (label) seen.named++;

      // A fourth element only where there is something to say, so the table
      // stays a table. Every field here is one the queue model reads, and each
      // is documented at the line that fills it — this file is where that
      // shape is now defined, the committed table that used to carry it in its
      // header having been deleted.
      const extra = {};
      // Which queue's production speed this building counts towards
      // (`getFactoryCount`). The client parses `Factory=` into a `FactoryType`
      // member, which is a number; src/replay.js matches it against the ini
      // spelling — "BuildingType", "InfantryType", "UnitType",
      // "NavalUnitType" — so it goes back through the enum's own reverse
      // mapping. `None` is not a factory and gets no field at all, which is
      // what the committed table did.
      if (typeof object.factory === "number" && object.factory !== FactoryType.None) {
        const factory = FactoryType[object.factory];
        if (typeof factory !== "string") {
          throw new Error(`${name}: Factory is ${object.factory}, which this client's FactoryType does not name`);
        }
        extra.factory = factory;
        seen.factories++;
      }
      // Helipad capacity, which is the whole of the aircraft queue's size. Both
      // halves are needed: a shipyard has docks too and builds no aircraft.
      const docks = Number(object.numberOfDocks) || 0;
      if (docks > 0 && object.helipad === true) {
        extra.docks = docks;
        seen.helipads++;
      }
      // `BuildLimit`, the third clamp in `UpdateQueueAction.process`. Only a
      // positive one is a limit: the client marks an object only the AI may have
      // with 0 and one with no limit at all with -1, and neither is a number a
      // report should show.
      const limit = Number(object.buildLimit);
      if (limit > 0) extra.limit = limit;
      // Which sidebar tab a building lands on, and not a matter of taste:
      // `Production#getQueueTypeForObject` sends a Building to the Armory queue
      // — the Defence tab — when `buildCat` is Combat, and to Structures
      // otherwise. Only Combat is emitted, since that is the whole distinction,
      // and it is what lets scripts/check-chords.mjs catch a superweapon filed
      // under structures. Compared against the enum member rather than against
      // its name: `buildCat` is a number here, and `BuildCat.Combat` is 0.
      if (object.buildCat === BuildCat.Combat) {
        extra.cat = "combat";
        seen.defences++;
      }
      // The tech tree, which is what keeps a chord layout in an order somebody
      // can guess. -1 is "never buildable" and never reaches a layout.
      const tech = Number(object.techLevel);
      if (Number.isFinite(tech) && tech > 0) extra.tech = tech;
      // `RequiredHouses` is the whole of what makes an object a *country* unit
      // — the German Tank Destroyer, the Iraqi Desolator.
      const only = (Array.isArray(object.requiredHouses) ? object.requiredHouses : []).filter(Boolean);
      if (only.length) extra.only = [...only];
      const side = sideOf(name);
      if (side) {
        extra.side = side;
        seen.sided++;
      }

      const row = [name, label, Number(object.cost) || 0];
      if (Object.keys(extra).length) row.push(extra);
      return row;
    };

    const types = {};
    let objects = 0;
    for (const [label, listName, type] of LISTS) {
      const ordinals = rules[listName];
      if (!ordinals || typeof ordinals.get !== "function" || typeof ordinals.size !== "number") {
        throw new Error(`${label}: this client keeps no ${listName}, so its ordinals cannot be read`);
      }
      const byName = rules.allObjectRules.get(type) || new Map();
      const rows = [];
      for (let ordinal = 0; ordinal < ordinals.size; ordinal++) {
        const name = ordinals.get(ordinal);
        if (typeof name !== "string") {
          throw new Error(
            `${label}: ${listName} is not dense — ${ordinals.size} entries and nothing at ${ordinal}. ` +
              "An ordinal is an array index here, and a hole shifts every id below it."
          );
        }
        rows.push(rowFor(name, byName.get(name)));
      }
      types[label] = rows;
      objects += rows.length;
    }

    // `[General]`, the production half of it: the client builds every queue's
    // capacity out of these four, so a report of what the game could have
    // accepted cannot be drawn without them. Checked rather than defaulted — a
    // zero here would be a wrong report rather than a missing one, and the
    // spelling of these fields is the client's, not ours.
    const settings = rules.general || {};
    const general = {
      maximumQueuedObjects: Number(settings.maximumQueuedObjects) || 0,
      buildSpeed: Number(settings.buildSpeed) || 0,
      multipleFactory: Number(settings.multipleFactory) || 0,
      padAircraft: (Array.isArray(settings.padAircraft) ? settings.padAircraft : []).filter(
        (name) => typeof name === "string" && name
      ),
    };
    for (const [key, value] of Object.entries(general)) {
      if (!value || (Array.isArray(value) && !value.length)) {
        throw new Error(`[General] ${key} came out empty — the queue model is built from it`);
      }
    }

    return {
      // The reading contract, unchanged from the committed table this replaced:
      // four arrays whose index is the ordinal, rows of [internal name, display
      // name, cost, extra?], and the `[General]` settings beside them.
      types,
      general,
      // What the harvest saw. Not part of the contract; a reader that only
      // decodes a replay ignores these.
      objects,
      named: seen.named,
      factories: seen.factories,
      helipads: seen.helipads,
      defences: seen.defences,
      sided: seen.sided,
      unknown,
    };
  }

  /**
   * What a map holds, as a few kilobytes that outlive the client.
   *
   * The renderer walks every object on every map it draws and then throws the
   * walk away, keeping only the picture — so "does this map have airports" could
   * be answered by the extension only by looking at a 3000px PNG, or not at all.
   * A picture is not an index.
   *
   * This is the same walk with nothing drawn: no theater, no sprites, no canvas.
   * It is stored beside the catalogue card (`maps[key].objects`), so every
   * question about a map's contents is answerable later from storage alone, with
   * no game tab and no engine — which is the whole point, since the engine is
   * reachable only inside a page that has the client on it.
   *
   * **Counts, not coordinates**, for everything but structures: a map carries
   * thousands of ore cells and their positions are the picture's job, while
   * their *presence* is the fact worth keeping. Structures are few and each one
   * is a different fact (who owns it, how it got that way), so they are kept
   * grouped by kind the way `list()` prints them.
   *
   * The state it describes is the map file as loaded — the start of a match.
   */
  async function survey(map) {
    // Defaulted like `render` and `list`, so it can be run by hand against the
    // map in play; companion.js always names the one it means.
    const mapFile = map || (window.__cdc && window.__cdc.state && window.__cdc.state.lastMapFile);
    if (!mapFile) throw new Error("no map captured yet — load a game first, or pass one");
    const ctx = await rulesOnly();
    const { rules, ObjectType, BridgeOverlayTypes } = ctx;

    const types = { smudge: 0, overlay: 0, bridge: 0, ore: 0, terrain: 0, building: 0 };
    const byName = {};
    const count = (type, name) => {
      types[type]++;
      if (name) byName[name] = (byName[name] || 0) + 1;
    };

    for (const smudge of mapFile.smudges) count("smudge", smudge.name);

    for (const overlay of mapFile.overlays) {
      // The same three gates the render pass uses, in the same order, so the
      // tally is of what would be drawn rather than of what the file lists.
      if (SKIP_OVERLAY_IDS.has(overlay.id)) continue;
      let name;
      try {
        name = rules.getOverlayName(overlay.id);
      } catch (e) {
        // Dropped rather than counted nameless. An overlay this ruleset cannot
        // name has no art either, so the render draws nothing for it — and a
        // tally that counted it would tell the alignment panel there is an
        // overlay on this map while the layer it offers to slide is empty.
        continue;
      }
      const type = oreClassFor(overlay.id) ? "ore" : BridgeOverlayTypes.isBridge(overlay.id) ? "bridge" : "overlay";
      count(type, name);
    }

    // An ore drill grows ore and is corrected with the ore, not with the trees —
    // the render splits them the same way, and a tally that did not would
    // disagree with the layer it is meant to describe.
    for (const terrain of mapFile.terrains) {
      count(spawnsOre(ctx, terrain.name) ? "ore" : "terrain", terrain.name);
    }

    const owners = structureOwnership(mapFile, ctx);
    const kinds = new Map();
    mapFile.structures.forEach((structure, index) => {
      count("building", structure.name);
      const own = owners[index];
      // Split by player as well as by name: on a pre-captured map the same
      // building is two different facts depending on which side gets it.
      const key = `${structure.name}|${structure.owner}|${own.player}`;
      const kind = kinds.get(key);
      if (kind) {
        kind.count++;
        return;
      }
      kinds.set(key, {
        name: structure.name,
        owner: structure.owner,
        count: 1,
        player: own.playable ? own.player + 1 : 0,
        via: own.via,
        capturable: own.capturable,
        icon: iconFor(own, structure.name) || "",
      });
    });

    return {
      v: SURVEY_VERSION,
      types,
      byName,
      structures: [...kinds.values()].sort((a, b) => b.count - a.count),
      starts: mapFile.startingLocations.length,
    };
  }

  /**
   * What the loaded map holds, object by object, with the reasoning each one is
   * drawn by: the name to key an exception on, who the map says owns it, and
   * whether that owner is a player at all.
   *
   * This is the answer to "why is that building not in a player's colour": a map
   * names an owning **house**, and a house that is not a playable country is not
   * a player, so a building owned by one stays neutral grey however pre-placed
   * it looks.
   *
   * It reports **the map file as it was loaded** — the starting state of the
   * match, which is what a preview is of. Nothing here follows a running game:
   * a building captured during the match is still listed with the owner the map
   * gave it. Two things are printed before the table so that can never be
   * confused with a stale or wrong map: which map this is, and the houses the
   * map itself defines.
   */
  async function list(opts = {}) {
    const mapFile =
      opts.mapFile || (window.__cdc && window.__cdc.state && window.__cdc.state.lastMapFile);
    if (!mapFile) throw new Error("no map captured yet — load a game first, or pass {mapFile}");
    const ctx3 = await buildContext(mapFile);
    const owners = structureOwnership(mapFile, ctx3);

    const facts = (window.__cdc && window.__cdc.state.map && window.__cdc.state.map.facts) || {};
    const map = {
      name: facts.name || "unnamed",
      key: facts.key || "no key",
      size: `${mapFile.fullSize.width}×${mapFile.fullSize.height}`,
      theater: mapFile.theaterType,
      starts: mapFile.startingLocations.length,
      capturedVia: (window.__cdc && window.__cdc.state.captureSource) || "?",
    };

    // The map's own [Houses]: who this map thinks can own anything. A map whose
    // houses are all civilian cannot show a player colour, whatever happens once
    // the match is running.
    const housesSection = mapFile.getSection && mapFile.getSection("Houses");
    const houses = housesSection
      ? [...housesSection.entries].map(([index, name]) => {
          const section = mapFile.getSection(name);
          const country = section && (section.getString("Country") || section.getString("ActsLike"));
          let playable = false;
          try {
            playable = !!(ctx3.rules.getCountry(country || name) || {}).multiplay;
          } catch (e) {
            playable = false;
          }
          return { index, house: name, country: country || "", playable };
        })
      : [];

    const structures = mapFile.structures.map((structure, index) => {
      const own = owners[index];
      const parts = buildingSprites(ctx3, structure.name, null);
      // What the thumbnail draws instead of the building. "marker" means this
      // one is worth showing but BUILDING_ICONS has no glyph for it yet; "none"
      // means the gate in iconFor read it as scenery, and the outline goes with
      // it — the two are one decision, so this table reads it once.
      const icon = iconFor(own, structure.name);
      return {
        name: structure.name,
        cell: `${structure.rx},${structure.ry}`,
        owner: structure.owner,
        playable: own.playable,
        player: own.playable ? own.player + 1 : "",
        via: own.via,
        capturable: own.capturable,
        painted: own.playable ? own.color : "neutral grey",
        outline: icon ? (own.playable ? own.color : NEUTRAL_OUTLINE) : "none",
        icon: icon || "none",
        sprites: parts ? parts.length : 0, // main SHP + the anims drawn with it
      };
    });
    // One kind per line rather than one object per line: 28 rows of the same
    // four buildings answers nothing that the four do not.
    const kinds = new Map();
    for (const s of structures) {
      // Split by player too: on a pre-captured map the same building is two
      // different facts depending on which side gets it.
      const key = `${s.name}|${s.owner}|${s.player}`;
      const kind = kinds.get(key);
      if (kind) kind.count++;
      else {
        kinds.set(key, {
          name: s.name,
          owner: s.owner,
          player: s.player,
          via: s.via,
          count: 1,
          playable: s.playable,
          capturable: s.capturable,
          painted: s.painted,
          outline: s.outline,
          icon: s.icon,
          sprites: s.sprites,
        });
      }
    }
    const summary = [...kinds.values()].sort((a, b) => b.count - a.count);
    const owned = structures.filter((s) => s.playable).length;

    // Printed as one block on purpose: it is meant to be selected in one go and
    // pasted somewhere, which a set of separate console.table calls is not.
    const report =
      `${TAG} map: ${map.name} [${map.key}] — ${map.size}, theater ${map.theater}, ` +
      `${map.starts} starts, captured via ${map.capturedVia}\n` +
      `houses (${houses.length}): ` +
      (houses.length
        ? houses.map((h) => `${h.house}→${h.country || "?"}${h.playable ? " (playable)" : ""}`).join(", ")
        : "none — the map defines no [Houses], so an object's owner is read as written") +
      `\nstructures: ${structures.length} total, ${owned} handed to a player\n` +
      summary
        .map(
          (k) =>
            `  ${k.name} ×${k.count}  owner ${k.owner}  ` +
            (k.playable ? `player ${k.player} via ${k.via}  ` : "") +
            `capturable=${k.capturable ? "yes" : "no"}  painted ${k.painted}  ` +
            `outline ${k.outline}  icon ${k.icon}  sprites ${k.sprites}`
        )
        .join("\n");
    console.log(report);

    // The full list stays available for a specific object, but it is no longer
    // the thing that ends up on screen.
    if (opts.table) console.table(structures);

    return { map, houses, summary, structures, owned };
  }

  /**
   * The map file's own sections, as the map wrote them.
   *
   * Everything a map knows is already in this object: the client parses the
   * `.map` into an IniFile and hands it to us, so a question like "where does
   * this map record a pre-captured building" is answered by reading the section
   * that holds it — no SDK, no digging through the browser's cache. `MapFile`
   * only turns a handful of sections into typed arrays; the rest are sitting
   * here unread.
   *
   * @param {string} [name]  one section, printed in full; omitted, the index
   * @param {number} [limit] entries printed for a big section (default 200)
   */
  function mapDump(name, limit = 200) {
    const mapFile = window.__cdc && window.__cdc.state && window.__cdc.state.lastMapFile;
    if (!mapFile || !mapFile.sections) throw new Error("no map captured yet — load a game first");

    if (!name) {
      const index = [...mapFile.sections].map(([section, s]) => ({
        section,
        entries: s.entries.size,
      }));
      index.sort((a, b) => b.entries - a.entries);
      console.log(
        `${TAG} ${index.length} sections in this map:\n` +
          index.map((s) => `  ${s.section} (${s.entries})`).join("\n")
      );
      return index;
    }

    const section = mapFile.sections.get(name);
    if (!section) {
      log(`no [${name}] section in this map`);
      return null;
    }
    const lines = [...section.entries].map(([key, value]) => `${key}=${value}`);
    const shown = lines.slice(0, limit);
    console.log(
      `${TAG} [${name}] — ${lines.length} entries\n` +
        shown.join("\n") +
        (lines.length > shown.length ? `\n… ${lines.length - shown.length} more` : "")
    );
    return lines;
  }

  /** Save whatever render() produced last, for comparing two maps side by side. */
  function save(name) {
    if (!state.last || !state.last.url) throw new Error("nothing rendered as a file yet");
    const a = document.createElement("a");
    a.href = state.last.url;
    a.download = (name || "map") + ".png";
    a.click();
  }

  window.__cdcHq = {
    render,
    sample,
    survey,
    roster,
    colours,
    cameos,
    objectTypes,
    list,
    mapDump,
    save,
    setFix,
    setLook,
    geometry,
    pickBuffer,
    oreCells,
    oreKindFor,
    cellOrigin,
    cellCorners,
    cropRect,
    BLOCK,
    HEADROOM_LEVELS,
    effectiveLook,
    effectiveFix,
    setFixByName,
    effectiveFixByName,
    ALIGN_LAYER_BY_NAME,
    state,
    RENDERER_VERSION,
    SURVEY_VERSION,
    CAMEO_VERSION,
    TYPES_VERSION,
    SPRITE_FIX,
    SPRITE_FIX_BY_NAME,
  };
  log("loaded — run __cdcHq.render() once a map has loaded");
})();
