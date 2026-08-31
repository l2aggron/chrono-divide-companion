/**
 * The in-game radar's geometry, exercised without a browser or a game.
 *
 *   node scripts/check-radar.mjs
 *
 * The radar draws our own render into its own canvas and then has to put things
 * on it — units, a viewport rectangle, and the tile under a click. All of that
 * is one arithmetic, `__cdcHq.geometry`, and it is exported from the renderer
 * rather than reimplemented in companion.js precisely so there is one copy to
 * check. This file is that check.
 *
 * What is worth checking:
 *
 *   - **a cell's own centre round-trips**, because that is the whole promise a
 *     click makes: the tile you get is the tile you looked at. Asserted over
 *     every cell of a synthetic map rather than a corner or two;
 *   - **the crop is the client's crop**. `cropRect` and the client's own
 *     `MinimapRenderer.dxySize` compute the same rectangle up to the constant
 *     (30, 15). That is what makes this a clone of the native radar rather than
 *     a lookalike, and it is one careless simplification away from not being
 *     true, so both expressions are pinned here;
 *   - **a non-zero LocalSize origin**, because most maps have one and a check
 *     that only uses x=0 proves nothing about the `- view.x` in the middle of
 *     the fraction;
 *   - **elevation lifts, and lifts the right way**, since that is the one term
 *     that makes the inverse ambiguous and the reason the radar rasterises a
 *     cell-id buffer instead of inverting analytically.
 *
 * What it cannot reach is a canvas. Whether the pick buffer a browser rasterises
 * agrees with `cellAt` is a question for a running tab; what is checkable here
 * is that the arithmetic the buffer will be drawn from is self-consistent.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

const context = vm.createContext({ console, setTimeout, clearTimeout, performance });
context.window = context;
context.System = { import: () => Promise.resolve({}) };
vm.runInContext(readFileSync(join(src, "glyphs.js"), "utf8"), context);
vm.runInContext(readFileSync(join(src, "render-tune.js"), "utf8"), context);
vm.runInContext(readFileSync(join(src, "hq-preview.js"), "utf8"), context);
const HQ = context.__cdcHq;

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail === undefined ? "" : " — " + detail}`);

check("the renderer exports its geometry", typeof HQ.geometry === "function");
check("and the primitives the radar draws with", typeof HQ.cellOrigin === "function" && typeof HQ.cellCorners === "function");

// A map with a LocalSize that is NOT at the origin — the ordinary case, and the
// one that catches a dropped `- view.x`.
const mapFile = {
  fullSize: { width: 100, height: 100 },
  localSize: { x: 6, y: 4, width: 80, height: 70 },
};

const g = HQ.geometry(mapFile);

// --- the crop is the client's crop -------------------------------------------
//
// Ours, from cropRect; theirs, from MinimapRenderer.dxySize as read out of the
// bundle. Written out separately on purpose: if someone folds one into the
// other, the pair stops being a comparison.
const local = mapFile.localSize;
const HALF_W = 30;
const HALF_H = 15;
const clientDxy = {
  x: 2 * local.x,
  y: 2 * local.y + 4,
  width: 2 * local.width,
  height: 2 * local.height + 8,
};
check(
  "our crop origin is the client's, over (30, 15)",
  g.view.x === clientDxy.x * HALF_W && g.view.y === clientDxy.y * HALF_H,
  `ours ${g.view.x},${g.view.y} vs client ${clientDxy.x * HALF_W},${clientDxy.y * HALF_H}`
);
check(
  "and so is its size",
  g.view.width === clientDxy.width * HALF_W && g.view.height === clientDxy.height * HALF_H,
  `ours ${g.view.width}x${g.view.height} vs client ${clientDxy.width * HALF_W}x${clientDxy.height * HALF_H}`
);

// --- the round trip -----------------------------------------------------------
//
// The inverse, analytic and flat: the form the radar falls back to while its
// cell-id buffer is being rebuilt, and the oracle the buffer is judged against.
// It is only correct at z = 0, which is the point — the check below fixes the
// elevation and the one after it shows what happens when it does not.
function cellFromFraction(geo, fx, fy) {
  const px = fx * geo.cropWidth + geo.view.x;
  const py = fy * geo.cropHeight + geo.view.y - geo.headroom;
  const dx = px / (geo.block.width / 2);
  const dy = py / (geo.block.height / 2);
  // cellOrigin: dx = rx - ry + mapWidth - 1, dy = rx + ry - mapWidth - 1, and
  // the fraction is taken at the diamond's centre, which is (+1, +1) in dx/dy.
  const a = dx - 1;
  const b = dy - 1;
  return { rx: Math.round((a + b + 2) / 2), ry: Math.round((b - a + 2 * geo.mapWidth) / 2) };
}

let roundTripped = 0;
let firstMiss = null;
for (let ry = 0; ry < mapFile.fullSize.height; ry += 3) {
  for (let rx = 0; rx < mapFile.fullSize.width; rx += 3) {
    const f = g.fractionOf(rx, ry, 0);
    const back = cellFromFraction(g, f.x, f.y);
    if (back.rx === rx && back.ry === ry) roundTripped++;
    else if (!firstMiss) firstMiss = `(${rx},${ry}) -> (${back.rx},${back.ry})`;
  }
}
check(
  "a cell's own centre round-trips on flat ground",
  firstMiss === null,
  firstMiss || `${roundTripped} cells, every one`
);

// --- elevation ------------------------------------------------------------------
const flat = g.cellAt(40, 40, 0);
const high = g.cellAt(40, 40, 4);
check(
  "elevation lifts a cell up the picture",
  high.y < flat.y,
  `z=0 at y ${flat.y}, z=4 at y ${high.y}`
);
check(
  "and by exactly half a block per level",
  flat.y - high.y === 4 * (g.block.height / 2),
  `${flat.y - high.y} for 4 levels`
);
check(
  "elevation does not move a cell sideways",
  high.x === flat.x,
  "the ambiguity is vertical only, which is what a one-pixel id read resolves"
);
// The reason the radar rasterises rather than inverts: the flat inverse is
// wrong on a cliff, and wrong by a predictable amount, so this is a statement
// about how wrong rather than a discovery.
const lifted = g.fractionOf(40, 40, 4);
const naive = cellFromFraction(g, lifted.x, lifted.y);
check(
  "the flat inverse misreads an elevated cell",
  naive.rx !== 40 || naive.ry !== 40,
  `z=4 cell (40,40) reads as (${naive.rx},${naive.ry}) — hence the cell-id buffer`
);

// --- the headroom band ------------------------------------------------------------
check(
  "the crop keeps the headroom band above the playable area",
  g.cropHeight === Math.min(g.view.height + g.headroom, g.canvasHeight),
  "a cliff on the top row is drawn several levels above its own cell"
);
check("headroom is 16 levels of half a block", g.headroom === 16 * (g.block.height / 2), String(g.headroom));

// --- a fraction is a fraction --------------------------------------------------------
//
// Asked from the picture's side rather than the map's, deliberately. A cell
// picked by name needs to be a cell this map actually has, and an RA2 map is a
// diamond in rx/ry while LocalSize is stated in the rotated space — so "the
// middle of the playable area" is not `local.x + width/2` and a check that
// assumed it would be asserting the tester's guess about map topology rather
// than the renderer's arithmetic. A fraction, inverted and taken forward again,
// needs no such guess.
let fractionMiss = null;
for (const fx of [0.2, 0.5, 0.8]) {
  for (const fy of [0.25, 0.5, 0.75]) {
    const cell = cellFromFraction(g, fx, fy);
    const back = g.fractionOf(cell.rx, cell.ry, 0);
    // One quantisation step, not half of one. The inverse rounds rx and ry
    // *independently*, and both dx = rx - ry and dy = rx + ry are sums of the
    // two, so either can move by a whole unit — 30px across, 15px down — even
    // though each coordinate moved by at most a half. A half-step tolerance
    // here failed at exactly 15/2460, which is the unit, not a defect.
    const tolX = (g.block.width / 2) / g.cropWidth + 1e-9;
    const tolY = (g.block.height / 2) / g.cropHeight + 1e-9;
    if (Math.abs(back.x - fx) > tolX || Math.abs(back.y - fy) > tolY) {
      fractionMiss = `${fx},${fy} -> cell ${cell.rx},${cell.ry} -> ${back.x.toFixed(4)},${back.y.toFixed(4)}`;
    }
  }
}
check(
  "a point on the picture inverts to the cell that draws over it",
  fractionMiss === null,
  fractionMiss || "9 points, each within one cell step of where it started"
);

// --- the cell-id pick buffer ------------------------------------------------
//
// The promise a click makes is that the tile you get is the tile you looked at.
// It cannot be kept by inverting `cellOrigin`, because the elevation term makes
// the inverse ambiguous -- the check just above shows a z=4 cell reading two
// tiles off -- so the radar rasterises the answer instead, once per panel size,
// from the same geometry the picture is drawn from.
//
// That rasteriser is deliberately plain arithmetic rather than a canvas fill:
// a canvas antialiases, and a blended id is not a blend of two cells, it is a
// *third* cell somewhere else entirely. Being arithmetic is also what puts it
// within reach of this file, where the whole map can be swept pixel by pixel.

/**
 * The cells a map of this size actually has, asked from the picture's side.
 *
 * An RA2 map is a diamond in rx/ry -- `dy = rx + ry - width - 1` is negative
 * over most of the rx/ry square -- so a synthetic map that iterates rx and ry
 * from zero is a map of cells that do not exist, and any conclusion drawn from
 * it is about the tester's guess at map topology. Iterating dx/dy and deriving
 * rx/ry cannot produce one.
 */
/**
 * Every cell the render draws, which is a **diamond and not a rectangle**.
 *
 * This function used to end with `if (rx >= W || ry >= H) continue`, and that
 * one line is why 1.10.0 shipped a radar with a black half and two ghost copies
 * of the explored region. On this 100x100 map the domain holds 20000 cells with
 * `rx` up to 200 and `ry` up to 199; the clip threw away 15149 of them and left
 * exactly the `W x H` rectangle on which the old `ry * mapWidth + rx` packing
 * happens to be injective and in range. Fifty-six assertions then passed over a
 * fixture built to satisfy the defect.
 *
 * The rule it cost: **a fixture is not allowed to narrow the domain to the one
 * the code under test can handle.** If a cell cannot be drawn, that is a claim
 * to assert, not a `continue`.
 */
function diamondTiles(map, elevate) {
  const W = map.fullSize.width;
  const H = map.fullSize.height;
  const out = [];
  for (let dy = 0; dy < 2 * H; dy++) {
    for (let dx = dy % 2; dx < 2 * W; dx += 2) {
      const rx = (dx + dy + 2) / 2;
      const ry = (dy - dx + 2 * W) / 2;
      out.push({ rx, ry, z: elevate ? elevate(rx, ry) : 0 });
    }
  }
  return out;
}

// --- one number per cell, and a different one for each ------------------------
//
// The shroud mask is an array indexed by this id and the pick buffer stores it
// per pixel, so the packing has to be **injective over the whole domain** and
// **inside the array it sizes**. `ry * mapWidth + rx` is neither, because
// neither coordinate is bounded by the map's width: on this map `rx` reaches
// 200 and `ry` 199. That shipped, and both halves of the failure were visible
// at once — the collisions redrew the explored region at two other places on
// the radar, the overflow left the rest black.
//
// Asserted over every cell rather than a sample, and stated as three separate
// claims, because a single "it works" would have been satisfied by the clipped
// fixture that hid this for a fortnight.

const domain = diamondTiles(mapFile);

let idOut = null;
let idDup = null;
const idSeen = new Map();
for (const tile of domain) {
  const id = g.cellId(tile.rx, tile.ry);
  if ((id < 0 || id >= g.cellIds) && !idOut) idOut = `(${tile.rx},${tile.ry}) -> ${id} of ${g.cellIds}`;
  const had = idSeen.get(id);
  if (had && !idDup) idDup = `(${tile.rx},${tile.ry}) and (${had.rx},${had.ry}) share id ${id}`;
  if (!had) idSeen.set(id, tile);
}

check(
  "the domain is a diamond, not a rectangle — the fixture proves it first",
  domain.length === 20000 &&
    domain.some((t) => t.rx >= mapFile.fullSize.width) &&
    domain.some((t) => t.ry >= mapFile.fullSize.height),
  `${domain.length} cells on a ${mapFile.fullSize.width}x${mapFile.fullSize.height} map, rx to ${Math.max(...domain.map((t) => t.rx))}`
);

check(
  "every cell's id fits the array the mask is sized by",
  idOut === null,
  idOut || `${domain.length} cells inside ${g.cellIds}`
);

check(
  "and no two cells share one",
  idDup === null,
  idDup || `${idSeen.size} distinct ids for ${domain.length} cells`
);

let backMiss = null;
for (const tile of domain) {
  const back = g.cellOf(g.cellId(tile.rx, tile.ry));
  if ((back.rx !== tile.rx || back.ry !== tile.ry) && !backMiss) {
    backMiss = `(${tile.rx},${tile.ry}) -> ${back.rx},${back.ry}`;
  }
}
check(
  "and decodes back to itself, which is what a click reads",
  backMiss === null,
  backMiss || "every cell"
);

const PICK_W = 640;
const PICK_H = Math.round((PICK_W * g.cropHeight) / g.cropWidth);
const flatTiles = diamondTiles(mapFile);
const flatPick = HQ.pickBuffer(mapFile, PICK_W, PICK_H, flatTiles);

check(
  "the buffer is the size it was asked for",
  flatPick.width === PICK_W && flatPick.height === PICK_H && flatPick.ids.length === PICK_W * PICK_H,
  `${flatPick.width}x${flatPick.height}, ${flatPick.ids.length} ids`
);

/** The same read the radar does: a fraction of the picture -> the cell there. */
function pickAt(pick, fx, fy) {
  const x = Math.min(pick.width - 1, Math.max(0, Math.floor(fx * pick.width)));
  const y = Math.min(pick.height - 1, Math.max(0, Math.floor(fy * pick.height)));
  const id = pick.ids[y * pick.width + x];
  return id < 0 ? null : { rx: id % pick.idStride, ry: Math.floor(id / pick.idStride) };
}

// Every cell of the map, not a sample: this is the one assertion that says the
// radar can be clicked at all, and a sample would leave whole regions unproven.
let picked = 0;
let pickMiss = null;
for (const tile of flatTiles) {
  const f = g.fractionOf(tile.rx, tile.ry, 0);
  if (f.x < 0 || f.x >= 1 || f.y < 0 || f.y >= 1) continue; // outside the crop
  const got = pickAt(flatPick, f.x, f.y);
  if (got && got.rx === tile.rx && got.ry === tile.ry) picked++;
  else if (!pickMiss) pickMiss = `(${tile.rx},${tile.ry}) -> ${got ? got.rx + "," + got.ry : "nothing"}`;
}
check(
  "every visible cell's own centre reads back as itself",
  pickMiss === null && picked > 0,
  pickMiss || `${picked} cells, every one`
);

check(
  "a pixel above the map belongs to no cell",
  pickAt(flatPick, 0, 0) === null,
  "the headroom band is drawn over nothing, and a click there is not a click on a tile"
);

// --- elevation, which is the reason this buffer exists ----------------------
//
// A plateau, raised as a block, so the map has a cliff in it. The lift moves
// those cells up the picture and vacates the band they used to occupy -- the
// cliff face, which the tile's own sprite draws. A cell therefore claims
// everything its diamond passes through on the way up, and the two assertions
// below are the two halves of that: the cell still answers where it landed,
// and nothing it left behind became unclickable.
const PLATEAU = (rx, ry) => (rx >= 60 && rx <= 75 && ry >= 60 && ry <= 75 ? 4 : 0);
const cliffTiles = diamondTiles(mapFile, PLATEAU);
const cliffPick = HQ.pickBuffer(mapFile, PICK_W, PICK_H, cliffTiles);
const raised = cliffTiles.filter((t) => t.z > 0);

let raisedMiss = null;
let raisedSeen = 0;
for (const tile of raised) {
  const f = g.fractionOf(tile.rx, tile.ry, tile.z);
  if (f.x < 0 || f.x >= 1 || f.y < 0 || f.y >= 1) continue;
  const got = pickAt(cliffPick, f.x, f.y);
  if (got && got.rx === tile.rx && got.ry === tile.ry) raisedSeen++;
  else if (!raisedMiss) raisedMiss = `(${tile.rx},${tile.ry}) -> ${got ? got.rx + "," + got.ry : "nothing"}`;
}
check(
  "a raised cell answers where the picture puts it, not where the flat inverse looks",
  raisedMiss === null && raisedSeen > 0,
  raisedMiss || `${raisedSeen} raised cells, every one`
);

let holes = 0;
let moved = 0;
for (let i = 0; i < flatPick.ids.length; i++) {
  if (flatPick.ids[i] >= 0 && cliffPick.ids[i] < 0) holes++;
  if (flatPick.ids[i] !== cliffPick.ids[i]) moved++;
}
check(
  "raising a plateau leaves no pixel unclickable",
  holes === 0,
  holes
    ? `${holes} pixels of cliff face belong to no cell — the sweep is what fills them`
    : "the band a lifted cell vacates is its own cliff face, and it claims it"
);
check(
  "and the lift is real, so the check above is not vacuous",
  moved > 0,
  `${moved} pixels changed hands`
);

// --- the panel is registered everywhere it has to be ---------------------------
//
// Three lists decide whether a floating panel works, and none of them is near
// the panel's own code. Miss one and the failure is silent and specific: the
// box drags with a free mouse and refuses under pointer lock, or it survives a
// "put it back" that was supposed to move it. Read as text, the way
// check-align-dials.mjs reads the renderer's layers, because the alternative is
// a DOM.

const companion = readFileSync(join(src, "companion.js"), "utf8");

const panelList = /for \(const panel of \[([\s\S]*?)\]\)/.exec(companion);
check(
  "the radar is in the shared mousedown hit test",
  !!panelList && /radarEl/.test(panelList[1]),
  "under pointer lock a panel's own mousedown never fires, so this list is the only way in"
);

// Also indexOf: the condition has calls in it, so `[^)]*` stops at the first
// inner bracket and a pattern that copes with nesting is harder to be sure of
// than the slice it is reading.
// Scoped to `syncOverlayMouse` rather than to the first `if (!chordEl &&` in
// the file: the context-menu handler now opens with those same characters and
// sits earlier in the text, so the unscoped anchor read a different condition
// and failed on a change that was correct. An anchor another line can capture
// is an anchor that will be.
const syncFrom = companion.indexOf("function syncOverlayMouse() {");
const wantedAt = syncFrom === -1 ? -1 : companion.indexOf("if (!chordEl &&", syncFrom);
const wantedTest = wantedAt === -1 ? "" : companion.slice(wantedAt, companion.indexOf("{", wantedAt) + 1);
check(
  "and in the test that installs those listeners at all",
  wantedTest.includes("radarVisible"),
  wantedTest || "wanted-test not found"
);

// indexOf rather than a regex: matching to the end of a function means matching
// a newline, and a pattern with a literal newline in it only works in the tree
// it was authored in — this file is written LF and the repo checks out CRLF.
const resetAt = companion.indexOf("function resetLayout() {");
const resetBody = resetAt === -1 ? "" : companion.slice(resetAt, resetAt + 600);
check(
  "resetLayout puts the radar back too",
  resetBody.includes("resetRadarLayout"),
  "a box the extension moved and cannot un-move is a box that stays lost"
);

check(
  "the radar has its own layout key, not the preview's",
  /RADAR_LAYOUT_KEY = "cdc\.radarRect"/.test(companion) && /LAYOUT_KEY = "cdc\.ingameMapRect"/.test(companion),
  "two panels sharing one key is two panels in one place"
);

check(
  "makeDraggable is called once for the radar",
  (companion.match(/radarDrag = makeDraggable\(/g) || []).length === 1,
  "the move listener goes on the box, so a second call is two handlers racing over one drag"
);

// --- the stored layout is the map, not the panel ------------------------------
//
// The panel is a flex column — bar, stage at `flex: 1`, drawer. Persisting the
// OUTER height made the drawer subtractive: opening it stole the space from the
// picture. What is stored is the STAGE's height now, so chrome is added on top
// of the number rather than taken out of it, and the arithmetic that does the
// adding is the thing worth running.
//
// Run rather than matched: a regex over this would be a text window, and a text
// window over companion.js fails open the moment the section widens. These are
// the real functions, sliced out and handed a stub panel whose bar and drawer
// have heights.

const layoutFrom = companion.indexOf("  function radarBarHeight() {");
const layoutTo = companion.indexOf("  function buildRadar() {");
if (layoutFrom < 0 || layoutTo < 0 || layoutTo < layoutFrom) {
  console.error("could not find the radar layout functions in companion.js — this check is out of date");
  process.exit(1);
}
const layoutBody = companion.slice(layoutFrom, layoutTo);

function loadLayout({
  stored = null,
  raw = undefined,
  bar = 20,
  dials = 0,
  stage = 0,
  minimap = null,
  panel = null,
  view = { width: 1920, height: 1080 },
  border = 2,
  // `__cdcHq.geometry()`'s answer for the map on screen, as `renderRadar` stores
  // it. `null` is the state the panel is in whenever there is no map -- no match
  // yet, or the terrain still drawing -- and it is not a corner case: it is the
  // arm in which the stored width has to stand on its own.
  geo = null,
} = {}) {
  const warnings = [];
  let written = null;
  const style = {};
  if (panel) {
    style.left = panel.left + "px";
    style.top = panel.top + "px";
    style.width = panel.width + "px";
    style.height = panel.height + "px";
  }
  const px = (name) => parseFloat(style[name]) || 0;
  const barEl = { getBoundingClientRect: () => ({ height: bar }) };
  const dialsEl = { height: dials, getBoundingClientRect() { return { height: this.height }; } };
  const stageEl = { getBoundingClientRect: () => ({ height: stage }) };
  const radarEl = {
    style,
    // `.cdc-radar` is border-box, so `style.width`/`style.height` ARE the outer
    // box and the client box is that less the border. Both are modelled because
    // `radarBorder()` is exactly their difference and `sizeRadarPanel` puts that
    // difference back into the height it derives from the map's.
    get offsetWidth() {
      return px("width");
    },
    get clientWidth() {
      return px("width") - border;
    },
    get offsetHeight() {
      return px("height");
    },
    get clientHeight() {
      return px("height") - border;
    },
    getBoundingClientRect() {
      return { left: px("left"), top: px("top"), width: px("width"), height: px("height") };
    },
    querySelector: (sel) =>
      sel === ".cdc-radar-bar"
        ? barEl
        : sel === ".cdc-radar-dials"
        ? dialsEl
        : sel === ".cdc-radar-stage"
        ? stageEl
        : null,
  };
  const item = raw !== undefined ? raw : stored === null ? null : JSON.stringify(stored);
  const api = new Function(
    "RADAR_LAYOUT_KEY",
    "RADAR_MIN",
    "note",
    "localStorage",
    "minimapRect",
    "window",
    "radarEl",
    "radarGeo",
    layoutBody +
      "\n return { radarBarHeight, radarChromeHeight, radarSavedRect, storeRadarRect," +
      " radarRect, radarFallbackRect, sizeRadarPanel, radarBorder, radarAnchorFor," +
      " radarAnchored, placeRadarFromAnchor, radarAspect, radarWidthFor," +
      " applyRadarScale, radarSizeRange, radarSizeValue, radarSizeAt };"
  )(
    "cdc.radarRect",
    { width: 160, height: 120 },
    (message) => warnings.push(message),
    {
      getItem: () => item,
      setItem: (key, value) => {
        written = JSON.parse(value);
      },
    },
    () => minimap,
    { innerWidth: view.width, innerHeight: view.height },
    radarEl,
    geo
  );
  return { ...api, style, warnings, dialsEl, get written() { return written; } };
}

// --- reading, and the one-way conversion of what is already out there --------

// Two shapes have been stored under this key and both are still out there, so a
// read has two conversions to make and they compose: `stageHeight` (the map's
// height, not the panel's) and `ax`/`ay` (an anchored edge, not an absolute
// position). A value written before either change passes through both.

const legacy = loadLayout({ stored: { left: 10, top: 20, width: 280, height: 220 }, bar: 20 });
check(
  "a layout stored by an older build is read as an outer height and the bar comes off it",
  legacy.radarSavedRect().stageHeight === 200,
  "got " + JSON.stringify(legacy.radarSavedRect()) + " — 220 is the panel, 200 is the map inside it"
);

check(
  "and the same read anchors it, so both conversions happen on one pass",
  JSON.stringify(legacy.radarSavedRect()) ===
    JSON.stringify({ ax: "left", dx: 10, ay: "top", dy: 20, width: 280, stageHeight: 200 }),
  "got " + JSON.stringify(legacy.radarSavedRect()) +
    " — at 1920x1080 a box at 10,20 is nearer the left and top edges, and the gap to each is what it was placed at"
);

const fresh = loadLayout({
  stored: { ax: "right", dx: 12, ay: "bottom", dy: 0, width: 280, stageHeight: 200 },
  bar: 20,
});
check(
  "and one already in the new shape is passed through, not converted twice",
  JSON.stringify(fresh.radarSavedRect()) ===
    JSON.stringify({ ax: "right", dx: 12, ay: "bottom", dy: 0, width: 280, stageHeight: 200 }),
  "got " + JSON.stringify(fresh.radarSavedRect()) +
    " — a read that does not recognise the new shape answers null here, and the panel falls back to the client's footprint on every load"
);

const unreadable = loadLayout({ raw: "{not json" });
check(
  "an unreadable value is refused out loud, as it always was",
  unreadable.radarSavedRect() === null && unreadable.warnings.length === 1,
  JSON.stringify(unreadable.warnings)
);

const noStore = loadLayout({ minimap: { left: 4, top: 8, width: 210, height: 160 } });
check(
  "with nothing stored the client's own radar footprint sizes the PICTURE",
  JSON.stringify(noStore.radarRect()) ===
    JSON.stringify({ ax: "left", dx: 4, ay: "top", dy: 8, width: 210, stageHeight: 160 }),
  "got " + JSON.stringify(noStore.radarRect()) + " — the bar goes on top of the client's footprint, not into it"
);

const bare = loadLayout();
check(
  "and the last-resort default names a stage as well",
  bare.radarRect().stageHeight === 220 && bare.radarRect().height === undefined,
  JSON.stringify(bare.radarRect())
);

check(
  "and opens against the right edge, which is where its default position always was",
  bare.radarRect().ax === "right" && bare.radarRect().dx === 20,
  JSON.stringify(bare.radarRect()) + " — 1920 - 1620 - 280 is the gap the default leaves"
);

// --- deriving the outer height, which is the additive part --------------------

const shut = loadLayout({ bar: 20, dials: 0 });
shut.sizeRadarPanel(200);
check(
  "with the drawer shut the panel is the map plus the bar and its own frame",
  shut.style.height === "222px",
  "got " + shut.style.height + " — the border is in the sum because the panel is border-box"
);

const grown = loadLayout({ bar: 20, dials: 0 });
grown.sizeRadarPanel(200);
// The drawer opens: same stored stage height, a chrome measurement 84px taller.
grown.dialsEl.height = 84;
const move = grown.sizeRadarPanel(200);
check(
  "opening the drawer grows the panel by exactly the drawer, at an unchanged map height",
  grown.style.height === "306px" && move.after - move.before === 84,
  "height " + grown.style.height + ", moved " + (move.after - move.before) + " — 222px would be the drawer eating the map"
);

const tiny = loadLayout({ bar: 20, dials: 84 });
tiny.sizeRadarPanel(50);
check(
  "the floor is a floor under the picture, not under the panel",
  tiny.style.height === "226px",
  "got " + tiny.style.height + " — 122px would clamp the panel and leave the map at 16"
);

// --- writing, after a drag ----------------------------------------------------

const saved = loadLayout({
  bar: 20,
  dials: 84,
  stage: 200,
  panel: { left: 500, top: 300, width: 300, height: 306 },
});
saved.storeRadarRect({ left: 500, top: 300, width: 300, height: 306 });
check(
  "a drag persists the height of the map and says nothing about the panel's",
  JSON.stringify(saved.written) ===
    JSON.stringify({ ax: "left", dx: 500, ay: "top", dy: 300, width: 300, stageHeight: 200 }),
  "wrote " + JSON.stringify(saved.written) + " — a `height` key here is what the next read converts a second time"
);

// --- the anchor: which edge, how far from it, and what that puts back --------
//
// Executed rather than read, and against a stub viewport with a stated size,
// because every number below is a subtraction from one of its edges. The two
// arms are a box on each side of the midline: one anchors left and keeps its
// own `left` as the offset, the other anchors right and keeps the gap.

const at1920 = loadLayout();
check(
  "a box on the left of the viewport anchors to the left edge, at its own position",
  JSON.stringify(at1920.radarAnchorFor({ left: 100, top: 50, width: 300, height: 240 })) ===
    JSON.stringify({ ax: "left", dx: 100, ay: "top", dy: 50 }),
  JSON.stringify(at1920.radarAnchorFor({ left: 100, top: 50, width: 300, height: 240 }))
);
check(
  "and one on the right anchors to the right edge, at the gap it leaves",
  JSON.stringify(at1920.radarAnchorFor({ left: 1600, top: 800, width: 300, height: 240 })) ===
    JSON.stringify({ ax: "right", dx: 20, ay: "bottom", dy: 40 }),
  JSON.stringify(at1920.radarAnchorFor({ left: 1600, top: 800, width: 300, height: 240 })) +
    " — 1920 - 1600 - 300 = 20, and 1080 - 800 - 240 = 40"
);

// The claim the whole migration rests on: converting a stored position to an
// anchor and placing the panel from that anchor is the identity, so no existing
// user's panel moves on upgrade. Placed against a panel whose measured box is
// the one the stored numbers describe.
const roundTrip = loadLayout({
  stored: { left: 1600, top: 800, width: 300, height: 260 },
  bar: 20,
  panel: { left: 0, top: 0, width: 300, height: 262 },
});
const placed = roundTrip.placeRadarFromAnchor(roundTrip.radarSavedRect());
check(
  "converting a stored position to an anchor and placing it back is the identity",
  placed.left === 1600 && placed.top === 800,
  JSON.stringify(placed) + " — anything else is every existing panel jumping on upgrade"
);

// The off-screen fix itself, which is the defect half of this change: nothing
// used to keep the panel inside the viewport, so a drag could put it where no
// press could reach it and no later drag could bring it back.
const runaway = loadLayout({
  stored: { ax: "right", dx: 5000, ay: "bottom", dy: 5000, width: 300, stageHeight: 200 },
  panel: { left: 0, top: 0, width: 300, height: 240 },
});
const clamped = runaway.placeRadarFromAnchor(runaway.radarSavedRect());
check(
  "an offset that would put the panel off screen is clamped back inside it",
  clamped.left === 0 && clamped.top === 0,
  JSON.stringify(clamped) + " — an unclamped right anchor at 5000 puts the panel at -3380"
);

// --- the snap, executed through the store ------------------------------------
//
// The threshold is a release-time rule, so it is checked where it lives rather
// than as arithmetic of its own: `storeRadarRect` is handed a panel that stopped
// 12px from the right edge, and then one that stopped 20px from it.

const snapped = loadLayout({ bar: 20, stage: 200, panel: { left: 1608, top: 500, width: 300, height: 240 } });
snapped.storeRadarRect({ left: 1608, top: 500, width: 300, height: 240 });
check(
  "a release 12px from an edge snaps flush to it, and 0 is what 'snapped' means",
  snapped.written.ax === "right" && snapped.written.dx === 0,
  JSON.stringify(snapped.written) + " — 1920 - 1608 - 300 = 12, which is inside the 16px threshold"
);

const kept = loadLayout({ bar: 20, stage: 200, panel: { left: 1600, top: 500, width: 300, height: 240 } });
kept.storeRadarRect({ left: 1600, top: 500, width: 300, height: 240 });
check(
  "and a release 20px from it keeps the gap, so the threshold is a threshold",
  kept.written.ax === "right" && kept.written.dx === 20,
  JSON.stringify(kept.written) + " — 1920 - 1600 - 300 = 20, which is outside it"
);

// --- the panel takes the map's shape -----------------------------------------
//
// The letterbox the user is complaining about is arithmetic: `placeRadarCanvas`
// fits the render's aspect inside the stage, so the black margins are the
// difference between the stage's shape and the map's. Making the width follow
// the map removes them by construction, which is why that function is not
// touched at all.
//
// Executed against a stated geometry rather than read: the derivation has three
// terms that can each be wrong on their own -- the aspect, the panel's own
// border, and the clamp -- and a regex over the source would see none of them.

const WIDE = { cropWidth: 800, cropHeight: 400 }; // a 2:1 map

const wide = loadLayout({ geo: WIDE });
check(
  "the width is derived from the map's shape, with the frame added round it",
  wide.radarWidthFor(200, 280) === 402,
  "got " + wide.radarWidthFor(200, 280) +
    " — 400 is the STAGE's width; the panel is border-box, so 2px of frame goes on top or the letterbox comes back exactly that wide"
);

// The control arm. Without it 402 could be any number this fixture happens to
// produce -- this is the same call with nothing to derive from, and the stored
// width is what it has to fall back on.
const blind = loadLayout({ geo: null });
check(
  "and with no map on screen the stored width stands, which is the letterbox's own case",
  blind.radarWidthFor(200, 280) === 280 && blind.radarAspect() === 0,
  "got " + blind.radarWidthFor(200, 280) +
    " — no aspect exists before the terrain is drawn, and inventing one would size the panel to a map it has not read"
);

const cramped = loadLayout({ view: { width: 1000, height: 800 }, geo: { cropWidth: 400, cropHeight: 100 } });
check(
  "a map too wide for the screen is clamped to the screen",
  cramped.radarWidthFor(400, 280) === 1000,
  "got " + cramped.radarWidthFor(400, 280) +
    " — 1602 is the honest derivation and a panel the placement clamp could only pin against the left edge"
);
check(
  "and the clamp bites only when it has to, so it is not silently the answer everywhere",
  cramped.radarWidthFor(200, 280) === 802,
  "got " + cramped.radarWidthFor(200, 280) + " — 4:1 at a 200px picture is 800 plus the frame, and it fits"
);

// --- the scale is the picture's height, and the panel grows from its anchor ---

const scaled = loadLayout({
  bar: 20,
  geo: WIDE,
  stored: { ax: "right", dx: 0, ay: "bottom", dy: 0, width: 280, stageHeight: 200 },
});
const put = scaled.applyRadarScale(300, null, true);
check(
  "one call sizes the panel, places it and stores it — a width, a height and a position",
  scaled.style.width === "602px" &&
    scaled.style.height === "322px" &&
    scaled.style.left === "1318px" &&
    scaled.style.top === "758px",
  JSON.stringify(scaled.style) + " — 300 of picture at 2:1 is 602 wide with the frame, 322 tall with the bar and the frame"
);
// Read back off the panel rather than written out as arithmetic: `1318 + 602
// === 1920` is a true sentence about two literals and would pass whatever the
// function did. These are the numbers the call actually wrote.
const grew = {
  left: parseFloat(scaled.style.left),
  top: parseFloat(scaled.style.top),
  width: parseFloat(scaled.style.width),
  height: parseFloat(scaled.style.height),
};
check(
  "and the panel grows into free space, keeping the corner it was snapped to",
  grew.left + grew.width === 1920 && grew.top + grew.height === 1080,
  JSON.stringify(grew) +
    " — the anchor is 0 from the right and 0 from the bottom, so growing must move the OTHER two edges"
);
check(
  "the scale that is stored is the PICTURE's height, and the width beside it is derived",
  JSON.stringify(scaled.written) ===
    JSON.stringify({ ax: "right", dx: 0, ay: "bottom", dy: 0, width: 602, stageHeight: 300 }),
  "wrote " + JSON.stringify(scaled.written)
);
check(
  "and the returned shape is the stored one, so a caller cannot act on a different layout",
  JSON.stringify(put) === JSON.stringify(scaled.written),
  JSON.stringify(put)
);

// The control arm for the three above: the same call that does not persist. A
// `written` that was already there would make the store assertion pass on a
// function that never wrote anything.
const quiet = loadLayout({ bar: 20, geo: WIDE, stored: { ax: "left", dx: 10, ay: "top", dy: 10, width: 280, stageHeight: 200 } });
quiet.applyRadarScale(300, null, false);
check(
  "a render sizes the panel without writing a derived width back over the stored one",
  quiet.written === null && quiet.style.width === "602px",
  "wrote " + JSON.stringify(quiet.written) +
    " — renderRadar runs on every tick that changes anything, and the stored width is the only one a map with no geometry has"
);

// --- a map change re-derives the shape and leaves the scale alone -------------
//
// The property that makes `stageHeight` the right thing to store: the user's
// chosen scale survives the map it was chosen on.

const square = loadLayout({ bar: 20, geo: { cropWidth: 400, cropHeight: 400 }, stored: scaled.written });
const after = square.applyRadarScale(scaled.written.stageHeight, null, true);
check(
  "the next map re-derives the width and keeps the scale, the anchor and the edge",
  after.width === 302 &&
    after.stageHeight === 300 &&
    after.ax === "right" &&
    after.dx === 0,
  JSON.stringify(after) + " — a square map at the same scale is 300 of picture and 2 of frame wide"
);

// --- the size dial's arithmetic ----------------------------------------------
//
// The control the requirement actually names: a scale that can be changed
// without outlining a 14px corner. The endpoints are checked because they are
// what a press at either end of a panel-wide track lands on.

const sizes = loadLayout();
check(
  "the size dial's floor is the picture's own floor, not a second number",
  sizes.radarSizeValue(0) === 120 && sizes.radarSizeRange()[0] === 120,
  JSON.stringify(sizes.radarSizeRange())
);
check(
  "its ceiling is 70% of the viewport's height",
  sizes.radarSizeValue(1) === 756,
  "got " + sizes.radarSizeValue(1) + " — 0.7 of 1080"
);
check(
  "and a press three quarters along the track lands three quarters up the range",
  sizes.radarSizeValue(0.75) === 597,
  "got " + sizes.radarSizeValue(0.75) + " — 120 + 0.75 x 636"
);

// The control arm for the ceiling: it is derived from the viewport, so a
// different viewport must give a different answer. A hardcoded 756 passes the
// check above and fails this one.
const shortView = loadLayout({ view: { width: 1280, height: 800 } });
check(
  "the ceiling follows the viewport rather than being a number",
  shortView.radarSizeValue(1) === 560,
  "got " + shortView.radarSizeValue(1) + " — 0.7 of 800"
);
check(
  "and the fill draws where the current picture sits along that range",
  Math.round(sizes.radarSizeAt(438) * 100) === 50 && sizes.radarSizeAt(120) === 0 && sizes.radarSizeAt(9999) === 1,
  "got " + sizes.radarSizeAt(438) + " — 438 is the midpoint of 120..756"
);

// --- what the panel does NOT drag from ---------------------------------------
//
// The canvas is a map with a cell under every pixel now, so a press on it is
// aimed at a tile and must not move the box. There are **two** ways a drag
// starts and they are in different files' worth of distance from each other:
// the panel's own mousedown, which fires only with a free mouse, and
// `onPanelMouseDown`, which is the only one that fires under a pointer lock.
// Narrowing one and not the other gives a canvas that drags the panel exactly
// while a match is being played, which is the state nobody tests in.

const dragAt = companion.indexOf("function makeDraggable(");
const dragBody = dragAt === -1 ? "" : companion.slice(dragAt, companion.indexOf("function applyRect(", dragAt));

check(
  "the radar names the child it does not drag from",
  /radarDrag = makeDraggable\([\s\S]{0,200}"\.cdc-radar-canvas"/.test(companion),
  "the bar and the letterbox margin are what is left to drag by"
);

check(
  "and both ways into a drag honour it",
  dragBody.includes("ignored(e.target)") && dragBody.includes("ignored(target)"),
  "the DOM path is the free mouse, `begin` is the locked one — a panel's own mousedown never fires under a lock"
);

check(
  "the locked path hands the hit test on",
  /panel\.drag\.begin\(cursorPoint\(\), target\)/.test(companion),
  "`begin` cannot repeat the hit test — under a lock the event's own coordinates are frozen"
);

// --- resizing while the game holds the mouse ---------------------------------
//
// `begin` used to end in onDown(at, "move") unconditionally, so under a pointer
// lock -- which is the whole of a match -- no floating panel could be resized at
// all. Not a radar bug: the queue, net and memory panels have had it since
// `begin` was written, and nobody noticed because the DOM path (a free mouse)
// resizes correctly and that is the state anyone testing is in.
//
// So it is driven rather than matched: the helper is sliced out, handed stub
// panels, and a press is begun on the grip and on the bar in turn. What is read
// back is which of the two things a drag can do actually happened.

const dragSrc = companion.slice(dragAt, companion.indexOf("function applyRect(", dragAt));

function driveDrag(pressOn) {
  const moves = [];
  const stubWindow = {
    addEventListener: (type, fn) => moves.push({ type, fn }),
    removeEventListener: () => {},
  };
  const style = {};
  const grip = { addEventListener: () => {} };
  grip.contains = (t) => t === grip;
  const bar = {};
  const box = {
    offsetLeft: 100,
    offsetTop: 50,
    offsetWidth: 300,
    offsetHeight: 200,
    style,
    addEventListener: () => {},
  };
  let resized = null;
  let cursor = { x: 0, y: 0 };
  const make = new Function(
    "cursorPoint",
    "mouseCaptured",
    "applyRect",
    "window",
    dragSrc + "; return makeDraggable;"
  )(
    () => cursor,
    () => true,
    (b, rect) => {
      resized = rect;
    },
    stubWindow
  );
  const api = make(box, grip, () => {}, ".cdc-radar-canvas");
  api.begin({ x: 0, y: 0 }, pressOn === "grip" ? grip : bar);
  cursor = { x: 40, y: 30 };
  const onMove = moves.find((m) => m.type === "mousemove");
  if (onMove) onMove.fn({ preventDefault: () => {}, stopPropagation: () => {} });
  return { resized, left: style.left, top: style.top };
}

const byGrip = driveDrag("grip");
check(
  "a locked press on the grip resizes the panel",
  byGrip.resized !== null && byGrip.resized.width === 340 && byGrip.resized.height === 230,
  "this is the round-2 item, and it is four panels wide — got: " + JSON.stringify(byGrip.resized)
);

check(
  "and it does not move the panel while resizing",
  byGrip.left === undefined && byGrip.top === undefined,
  "a resize that also writes left/top drags the box out from under the corner being pulled"
);

const byBar = driveDrag("bar");
check(
  "a locked press anywhere else still moves it",
  byBar.left === "140px" && byBar.top === "80px" && byBar.resized === null,
  "the fix must not turn every drag into a resize — got: " + JSON.stringify(byBar)
);

// The box's own mousedown alone, not the whole helper: `onMove` swallows too
// and its call sits earlier in the text, so a comparison over the whole
// function is true whatever the handler does. It was, until a mutation that
// should have failed it did not.
const boxDownAt = dragBody.indexOf("box.addEventListener(");
const boxDown =
  boxDownAt === -1 ? "" : dragBody.slice(boxDownAt, dragBody.indexOf("if (grip) {", boxDownAt));

check(
  "a press it will not drag from is still swallowed",
  boxDown.includes("e.stopPropagation();") &&
    boxDown.indexOf("e.stopPropagation();") < boxDown.indexOf("if (ignored(e.target)) return;"),
  "the client reads a stray mousedown as a world command, so a press let through orders units to wherever the panel sits"
);

// --- the cursor a locked page has to work out for itself ---------------------
//
// Under a REAL pointer lock the browser freezes `clientX/clientY` at the point
// the lock was taken and moves the live signal into `movementX/movementY`. So
// `state.pointer`, read straight off the event, is stale for the whole of a
// match: every hit test running off it asks `elementFromPoint` about the place
// the cursor WAS, `radarEl.contains` answers false, and the panel refuses to
// move in silence. `trackPointer` integrates the deltas itself, which is what
// the client's own `Pointer` does with them and the only live signal a locked
// page gets.
//
// That integration is arithmetic, so it is checkable here rather than only in a
// browser -- scripts/drive-drag.mjs arm A drives the same claim under a lock
// Chromium really granted. Sliced and run against stubs, the way `driveDrag`
// above does with `makeDraggable`.

const trackAt = companion.indexOf("function trackPointer(e) {");
const trackSrc = trackAt === -1 ? "" : companion.slice(trackAt, companion.indexOf("function cursorPoint() {", trackAt));

check(
  "the locked-cursor integration is where this slice expects it",
  trackSrc.length > 200 && trackSrc.includes("movementX"),
  "every assertion below runs this text, so a slice that missed would pass them all by throwing nothing"
);

/** Feed `trackPointer` a run of mouse moves and report the two points it keeps. */
function trackMoves(moves, opts = {}) {
  const locked = opts.locked === undefined ? true : opts.locked;
  const seed = opts.seed || { x: 100, y: 100 };
  const view = opts.view || { width: 1920, height: 1080 };
  const state = { pointer: { x: seed.x, y: seed.y }, lockedPointer: { x: seed.x, y: seed.y } };
  const track = new Function(
    "state",
    "mouseCaptured",
    "window",
    trackSrc + "; return trackPointer;"
  )(state, () => locked, { innerWidth: view.width, innerHeight: view.height });
  for (const m of moves) track(m);
  return state;
}

// Every event carries the SAME clientX/clientY, because that is exactly what a
// real lock does -- an event stream whose DOM coordinates moved would not be
// testing the case this code exists for.
const frozen = { clientX: 900, clientY: 700 };

const walked = trackMoves([
  Object.assign({ movementX: 10, movementY: 5 }, frozen),
  Object.assign({ movementX: 10, movementY: 5 }, frozen),
  Object.assign({ movementX: -4, movementY: 20 }, frozen),
]);
check(
  "a locked move accumulates movementX/movementY instead of reading the frozen clientX/clientY",
  walked.lockedPointer.x === 116 && walked.lockedPointer.y === 130,
  "seeded at 100,100 and walked +16,+30 — got " + JSON.stringify(walked.lockedPointer)
);
check(
  "and the DOM position is still kept, because outside a lock it is the right answer",
  walked.pointer.x === 900 && walked.pointer.y === 700,
  "cursorPoint falls through to state.pointer with no lock held — got " + JSON.stringify(walked.pointer)
);

const offFar = trackMoves([Object.assign({ movementX: 5000, movementY: 5000 }, frozen)], {
  seed: { x: 1000, y: 600 },
});
check(
  "the integrated point is clamped to the viewport's far edge",
  offFar.lockedPointer.x === 1919 && offFar.lockedPointer.y === 1079,
  "a 1920x1080 viewport ends at 1919,1079 — got " + JSON.stringify(offFar.lockedPointer)
);

const offNear = trackMoves([Object.assign({ movementX: -5000, movementY: -5000 }, frozen)], {
  seed: { x: 1000, y: 600 },
});
check(
  "and to its near edge",
  offNear.lockedPointer.x === 0 && offNear.lockedPointer.y === 0,
  "a negative point is a point elementFromPoint answers null for — got " + JSON.stringify(offNear.lockedPointer)
);

// The clamp's actual payoff, and the reason it is not cosmetic: the deltas keep
// arriving after the real cursor has run into the edge of the screen. Unclamped
// the integration walks off into coordinates no element occupies and has to be
// walked all the way back before the panel is reachable again.
const backFromEdge = trackMoves(
  [
    Object.assign({ movementX: 4000, movementY: 0 }, frozen),
    Object.assign({ movementX: -100, movementY: 0 }, frozen),
  ],
  { seed: { x: 1000, y: 600 } }
);
check(
  "so a cursor pushed past the edge comes back with it",
  backFromEdge.lockedPointer.x === 1819,
  "unclamped this lands at 4900, and every hit test misses until 3081 pixels of travel undo it — got " +
    backFromEdge.lockedPointer.x
);

const noDelta = trackMoves([Object.assign({}, frozen)], { seed: { x: 300, y: 200 } });
check(
  "an event with no movement delta holds the point rather than turning it into NaN",
  noDelta.lockedPointer.x === 300 && noDelta.lockedPointer.y === 200,
  "elementFromPoint answers null for NaN, so every hit test then misses in the same silence — got " +
    JSON.stringify(noDelta.lockedPointer)
);

const free = trackMoves([{ clientX: 640, clientY: 480, movementX: 7, movementY: 7 }], {
  locked: false,
  seed: { x: 100, y: 100 },
});
check(
  "with the mouse free the integrated point tracks the DOM, so a lock starts from the truth",
  free.lockedPointer.x === 640 && free.lockedPointer.y === 480,
  "an unlocked move that accumulated instead would seed the next lock at a place the cursor never was — got " +
    JSON.stringify(free.lockedPointer)
);

// Order, not merely presence. The client's pointer is the one the game actually
// DRAWS; ours disagreeing with the cursor the player can see would be a worse
// bug than the stale position it replaces.
const cursorAt = companion.indexOf("function cursorPoint() {");
const cursorBody =
  cursorAt === -1 ? "" : companion.slice(cursorAt, companion.indexOf("function underCursor() {", cursorAt));
check(
  "cursorPoint reaches for the client's pointer before its own integration",
  cursorBody.includes("ui.getPosition()") &&
    cursorBody.includes("state.lockedPointer") &&
    cursorBody.indexOf("ui.getPosition()") < cursorBody.indexOf("state.lockedPointer"),
  "and for the integration before state.pointer, which is the only one a lock freezes"
);
check(
  "and for its integration before the frozen DOM position",
  cursorBody.indexOf("state.lockedPointer") < cursorBody.lastIndexOf("return state.pointer;"),
  "a fallback reached after the stale one is a fallback that never runs"
);

// --- the buffer is built where the radar can use it --------------------------

// Sliced between named functions rather than by a character count, and with no
// literal newline in any pattern: this file is written LF and the repo checks
// out CRLF, and a count wide enough today silently swallows the next function
// added after it. Both ends are named for the same reason -- a window that
// grows to the end of the file passes every test in it and guards nothing.

const between = (from, to) => {
  const at = companion.indexOf(from);
  const end = at === -1 ? -1 : companion.indexOf(to, at);
  return at === -1 || end === -1 ? "" : companion.slice(at, end);
};

const sweepBody = between("function sweepRadarShroud() {", "function noteRadarShroudProgress(");
const progressBody = between("function noteRadarShroudProgress(", "function buildRadarCover(");
// Ends at the ore header rather than at the units one: the ore layer went in
// between the two, and a window that grew to hold it would have every
// assertion about the cover quietly covering it as well. Same lesson as the
// unit window's own extent, one section along.
// Ends at the gap builder, not at the section header: buildRadarGap lives
// inside this same section, and a window that ran to the header swallowed it --
// every "the cover does not mention a gap" assertion below then read the one
// function that must. The unit window carries a guard for exactly this.
const coverBody = between("function buildRadarCover(", "function buildRadarGap(");
const tickBody = between("function radarSweepTick()", "function radarFractionAt(");
const walkBody = between("function radarCellList(", "function sweepRadarShroud() {");
const paintFull = between("function paintRadar() {", "// --- the shroud");
const coverageBody = between("function noteRadarPickCoverage(", "/** The map cell under a viewport point");

const pickAtSrc = companion.indexOf("function ensureRadarPick() {");
const pickBody =
  pickAtSrc === -1
    ? ""
    : companion.slice(pickAtSrc, companion.indexOf("function noteRadarPickCoverage(", pickAtSrc));

check(
  "the radar asks the renderer for the buffer rather than inverting anything",
  /hq\.pickBuffer\(mapFile, canvas\.width, canvas\.height, /.test(pickBody) &&
    !/function pickBuffer/.test(companion),
  "a second copy of the geometry is the drift check-radar.mjs exists to stop"
);

// Two consumers of the map's cells, reading one list. Pinned as hygiene, not as
// a fix: 1.11.0 shipped this believing the two lists differed, and the coverage
// line it shipped alongside measured them equal on a live map. The class of
// defect is still the one this file exists for -- the copied cropRect, the
// hand-kept layer order -- so the assertion stays; the story it used to tell
// does not.
check(
  "and hands it the same cell list the shroud sweep walks",
  // The list has to reach the *call*, not merely exist in the function: it is
  // read by the coverage line too, so naming it is not evidence that it is
  // passed.
  /const list = radarCellList\(mapFile\);/.test(pickBody) &&
    /hq\.pickBuffer\(mapFile, canvas\.width, canvas\.height, list\b/.test(pickBody) &&
    /radarCellList\(mapFile\)/.test(sweepBody),
  "two lists means cells the mask reveals that the buffer never heard of, and the cover paints those black"
);

check(
  "and says how many cells each half got",
  /function noteRadarPickCoverage\(/.test(companion) &&
    /noteRadarPickCoverage\(buffer, list, mapFile\)/.test(pickBody) &&
    /mapFile\.tiles/.test(coverageBody) &&
    /buffer\.width/.test(coverageBody),
  "the one number that names this defect -- what the buffer covers -- was never printed, and two matches went to guesses instead"
);

check(
  "and stamps it with the size alone",
  pickBody.includes("${canvas.width}x${canvas.height}") &&
    !/filterString|globalFilter|tuneKey/.test(pickBody),
  "the dials change what colour a pixel is, never which cell it is — a slider must not throw the buffer away"
);

check(
  "the readout is fed before the lock is tested",
  /function onOverlayMouseMove\(\)[\s\S]{0,400}?syncRadarReadout\(\);[\s\S]{0,200}?mouseCaptured\(\)/.test(
    companion
  ),
  "behind the lock check the panel would read nothing outside a match, which is where it is checked"
);

// --- the terrain composite -------------------------------------------------------------
//
// The radar does not re-render when a dial moves. It takes ONE untuned layered
// render per map and composites the layers itself, each under its own
// `ctx.filter`. Two things have to hold for that to produce the same picture the
// baked path produces, and neither is visible from the code that does it:
//
//   - the dials must be applied exactly **once**. Rendering with the look baked
//     AND filtering at composite time squares every dial. That is not
//     hypothetical -- the global pair shipped applied twice, baked by `dialsFor`
//     and filtered again by `--cdc-render-filter`, and put a mid-grey at 225
//     where the dial asked for 150;
//   - the layers must go back in the render's own painter order, because
//     compositing them in any other order silently reshuffles what occludes
//     what.

const TUNE = context.__cdcTune;
const tuneOrder = TUNE.TUNE_TYPES.map((t) => t.key);
const fixOrder = Object.keys(HQ.SPRITE_FIX);

check(
  "the composite order is the render's painter order",
  tuneOrder[0] === "base" &&
    tuneOrder[tuneOrder.length - 1] === "airport" &&
    tuneOrder.slice(1, -1).join(",") === fixOrder.join(","),
  `${tuneOrder.join(",")} against base,${fixOrder.join(",")},airport`
);

check(
  "and companion.js reads that order rather than keeping its own",
  /TUNE_TYPES\.map\(\(t\) => t\.key\)/.test(companion) &&
    !/RADAR_LAYER_ORDER\s*=\s*\[/.test(companion),
  "a second hand-kept list of one truth is what once killed every build hotkey"
);

// indexOf, not a regex spanning lines — see the note above resetLayout.
const sourceAt = companion.indexOf("async function ensureRadarSource() {");
const sourceBody = sourceAt === -1 ? "" : companion.slice(sourceAt, sourceAt + 1600);

check(
  "the radar's own render is untuned",
  /look:\s*false/.test(sourceBody),
  "the composite applies the dials, so baking them too would apply each one twice"
);

check(
  "and the renderer honours that",
  /opts\.look === false \? null : effectiveLook\(\)/.test(readFileSync(join(src, "hq-preview.js"), "utf8")),
  "look:false has to reach the palette bake, or the flag is decoration"
);

check(
  "the layers are asked for as canvases at a width",
  /layers:\s*true/.test(sourceBody) && /layerWidth:/.test(sourceBody),
  "without a width they come back as full-size data URLs — 1.6 GB and a seconds-long encode"
);

const MARKLESS = ["annotate", "outlines", "starts", "grid"];
check(
  "the radar bakes no marks into its terrain",
  // `includes` on the formatted text rather than a regex: the pattern would need
  // a backslash class, and a backslash written through a shell heredoc arrives
  // eaten -- which is exactly how this assertion first shipped matching nothing
  // and still reporting itself green.
  MARKLESS.every((k) => sourceBody.includes(k + ": false")),
  MARKLESS.filter((k) => !sourceBody.includes(k + ": false")).join(", ") ||
    "no ore tint, no ownership outlines, no badges, no grid, no spawn blocks"
);

const backingAt = companion.indexOf("function buildRadarBacking(");
const backingBody = backingAt === -1 ? "" : companion.slice(backingAt, backingAt + 2400);
const paintAt = companion.indexOf("function paintRadar() {");
const paintBody = paintAt === -1 ? "" : companion.slice(paintAt, paintAt + 1200);

check(
  "each layer is composited under its own per-type filter",
  /filterString\(state\.appearance, key\)/.test(backingBody),
  "filterString is the per-type half of the one function check-tune.mjs pins to the bake"
);

check(
  "the global pair is applied at the blit and nowhere else",
  !/globalFilter/.test(backingBody) && /globalFilter\(state\.appearance\)/.test(paintBody),
  "in the backing as well as at the blit is the squaring bug again, one layer down"
);

check(
  "the backing is stamped with what it was drawn from",
  /\$\{width\}x\$\{height\}\|/.test(backingBody) && /radarBacking\.stamp === stamp/.test(backingBody),
  "a composite that cannot tell it is current rebuilds eight layers every frame"
);

// --- the shroud -------------------------------------------------------------
//
// Two masks, and they now have the SAME lifetime: both mirror the live shroud
// every sweep. `seen` used to be append-only, on the belief that the client's
// shroud answers "lit now" -- it does not. Sight writes `Explored` permanently,
// so the client already answers "has ever been seen", and the accumulating mask
// could not represent the one thing that matters: a reveal being taken away, by
// a Spy Satellite dying or an enemy Gap Generator.
//
// The arithmetic above is only worth having if companion.js uses it. Both
// consumers named separately: the mask is an ARRAY sized by the id space, and
// the click is a DECODE of one id, and getting either from `mapWidth` is the
// defect that shipped in 1.10.0.
check(
  "the mask is sized and indexed by the renderer's id space, not by the map's width",
  /radarGeo\.cellIds/.test(sweepBody) &&
    /radarGeo\.cellId\(tile\.rx, tile\.ry\)/.test(sweepBody) &&
    !/tile\.ry \* width/.test(sweepBody),
  "rx and ry both run past the map's width, so a width-strided mask drops 8316 of this map's 19690 cells in silence"
);

check(
  "and a cell that still lands outside it is named, not dropped",
  /i >= seen\.length/.test(sweepBody) && /"warn"/.test(sweepBody),
  "the whole defect was a silent out-of-range write: revealed climbed to 204870 of 19690 while the panel stayed black"
);

const cellAtBody = between("function radarCellAt(point)", "/**");
check(
  "the click decodes an id by the stride the buffer reports",
  /pick\.idStride/.test(cellAtBody) && !/pick\.mapWidth/.test(cellAtBody),
  "the ids are not row-major over the map's width, so decoding by it reads a cell one row and a hundred columns away"
);

check(
  "the revealed mask mirrors the live shroud rather than accumulating",
  /const lit = shroud\.isShrouded\(tile\) \? 0 : 1;/.test(sweepBody) &&
    /seen\[i\] = lit;/.test(sweepBody) &&
    !sweepBody.includes("seen[i] = 1;"),
  "a bit that can only be set cannot show a reveal being taken away, which is what a Spy Satellite dying is"
);

// The same claim, drawn rather than pattern-matched.
//
// This is the section where a text assertion shipped a wrong belief: the mask
// was append-only on the theory that the client's shroud answers "lit now", the
// prose above said so, and every check here agreed with the prose. None of them
// could have caught it, because none of them ever ran the sweep. So the sweep is
// sliced out and executed against a stub shroud, and what is asserted is the one
// behaviour the old design could not produce -- a bit going back to black.

const SHROUD_START = "  // --- the shroud ---";
const SHROUD_END = "  // --- the ore ---";
const shroudFrom = companion.indexOf(SHROUD_START);
const shroudTo = companion.indexOf(SHROUD_END);
if (shroudFrom < 0 || shroudTo < 0 || shroudTo < shroudFrom) {
  console.error("could not find the shroud layer in companion.js — this check is out of date");
  process.exit(1);
}
const shroudBody = companion.slice(shroudFrom, shroudTo);

// The window's own extent, asserted rather than assumed -- the same guard the
// unit window carries, and for the same reason.
const shroudSections = [...shroudBody.matchAll(/^ {2}\/\/ --- (.+?) ---/gm)].map((m) => m[1]);
check(
  "the shroud window holds exactly the sections it is meant to",
  shroudSections.join(" | ") === "the shroud",
  "found: " + (shroudSections.join(" | ") || "no section headers at all")
);

/**
 * The sweep, running against a stub shroud over a stub map.
 *
 * `geo` is a plain rectangle here rather than the renderer's real packing: what
 * is under test is what the mask does with the shroud's answers, and the id
 * packing has its own assertions above.
 */
function loadShroud(width, height, shroud) {
  const said = [];
  const mapFile = { fullSize: { width, height } };
  const list = [];
  for (let ry = 0; ry < height; ry++) {
    for (let rx = 0; rx < width; rx++) list.push({ rx, ry, z: 0 });
  }
  const geo = {
    cellIds: width * height,
    idStride: width,
    cellId: (rx, ry) => rx + ry * width,
  };
  const state = {
    combatant: {
      player: {},
      game: {
        mapShroudTrait: { getPlayerShroud: () => shroud },
        map: { tiles: { getAll: () => list } },
      },
    },
  };
  const api = new Function(
    "state",
    "note",
    "radarGeo",
    "radarMapFile",
    "SHROUD_DARKEN",
    "radarTiles",
    "radarTileSource",
    "radarShroud",
    "radarShroudNoted",
    "radarLastGapped",
    "radarShroudOutside",
    shroudBody +
      "\n return { sweepRadarShroud, mask: () => radarShroud };"
  )(
    state,
    (message, level) => said.push({ message, level }),
    geo,
    () => mapFile,
    8,
    null,
    "",
    null,
    -1,
    false,
    false
  );
  return { ...api, geo, said };
}

// A shroud whose answer for a cell can be changed between sweeps, which is the
// whole of what the client does when a reveal is handed back.
function stubShroud(shroudedSet, darkenSet = new Set()) {
  return {
    isShrouded: (tile) => shroudedSet.has(tile.rx + "," + tile.ry),
    isFlagged: (tile, flag) => flag === 8 && darkenSet.has(tile.rx + "," + tile.ry),
  };
}

{
  // Everything shrouded but one cell: the mask gains that cell.
  const dark = new Set();
  for (let ry = 0; ry < 4; ry++) for (let rx = 0; rx < 4; rx++) dark.add(rx + "," + ry);
  dark.delete("1,1");
  const shroud = stubShroud(dark);
  const run = loadShroud(4, 4, shroud);
  run.sweepRadarShroud();
  const mask = run.mask();
  check(
    "a sweep reveals the cells the shroud says are lit",
    !!mask && mask.seen[run.geo.cellId(1, 1)] === 1 && mask.revealed === 1,
    "revealed=" + (mask && mask.revealed) + ", bit=" + (mask && mask.seen[run.geo.cellId(1, 1)])
  );

  // Now the client takes it back -- a Spy Satellite dying, or an enemy Gap
  // Generator calling unrevealAround. THE assertion of round 2: under the old
  // append-only mask this cell stayed lit for the rest of the match.
  dark.add("1,1");
  const moved = run.sweepRadarShroud();
  const after = run.mask();
  check(
    "and a reveal the client takes back goes back to black",
    moved === true && after.seen[run.geo.cellId(1, 1)] === 0 && after.revealed === 0,
    "this is the round-2 defect: revealed=" +
      after.revealed +
      ", bit=" +
      after.seen[run.geo.cellId(1, 1)] +
      ", sweep reported moved=" +
      moved
  );

  // And a sweep that changes nothing still costs no repaint.
  check(
    "a sweep that finds nothing new reports nothing moved",
    run.sweepRadarShroud() === false,
    "an unchanged sweep that reports a change repaints the panel three times a second for nothing"
  );
}

{
  // A gap field is still rebuilt rather than accumulated, and clearing it gives
  // the ground back -- the half of the design that was always right.
  const dark = new Set();
  const gap = new Set(["2,2"]);
  const shroud = stubShroud(dark, gap);
  const run = loadShroud(4, 4, shroud);
  run.sweepRadarShroud();
  const lit = run.mask();
  check(
    "a gap field marks its ground while it is up",
    lit.gapped[run.geo.cellId(2, 2)] === 1 && lit.darkened === 1,
    "darkened=" + lit.darkened
  );
  gap.delete("2,2");
  run.sweepRadarShroud();
  const gone = run.mask();
  check(
    "and gives it back when the generator dies",
    gone.gapped[run.geo.cellId(2, 2)] === 0 && gone.darkened === 0,
    "a field that switches off must not leave its ground dark for the rest of the match"
  );
}

check(
  "and the gap-field mask is not",
  /gapped\[i\] = dark;/.test(sweepBody) && /const dark = /.test(sweepBody),
  "a field that switches off must give its ground back, so this one is rebuilt rather than accumulated"
);

check(
  "a gap field is found by the client's own flag, not by hunting the building",
  /SHROUD_DARKEN = 8/.test(companion) &&
    /isFlagged\(tile, SHROUD_DARKEN\)/.test(sweepBody) &&
    !/GAGAP/.test(sweepBody),
  "ShroudFlag.Darken is written only by GapGeneratorTrait, so the flag is the field — no radius to compute"
);

check(
  "the sweep asks the player's own shroud",
  /getPlayerShroud\(me\)/.test(companion) && /shroud\.isShrouded\(tile\)/.test(sweepBody),
  "the same filter GameApi#getVisibleUnits applies — this is what keeps the radar off the maphack row"
);

// The cover is not a second rasteriser. The mask is per cell, the picture is
// per pixel, and the pick buffer is already exactly that map — built for the
// click and invalidated on the same resize. Rasterising the cells again would
// be a second copy of the geometry, free to disagree with the first.
check(
  "the cover is drawn through the pick buffer",
  /ensureRadarPick\(\)/.test(coverBody) && !/cellCorners|fillCells|cellAt/.test(coverBody),
  "one pass over an array with no geometry in it — and an edge that cannot disagree with the picture"
);

// The cover is the one layer that can hide everything under it: it is derived
// from a cell mask and a pixel-to-cell buffer, and either being wrong paints
// black over a map that rendered perfectly, which twice cost a whole match.
//
// It used to have an off switch for that reason. The switch is gone -- unticking
// it drew the whole map, which the options page called "a map viewer rather than
// a radar", and this tool is convenience, not a maphack (user, 2026-08-26).
// Closing the panel is the same escape hatch and costs nothing: Alt+L.
check(
  "no layer anywhere can be told to stop hiding the unscouted",
  !/look\.shroud\b/.test(companion) && !/"tuneShroud"/.test(companion),
  "a radar that can be told to draw unscouted ground is a maphack one tick away"
);

check(
  "and the mask reports its own progress without flooding the log",
  /revealed/.test(progressBody) &&
    /radarShroudNoted/.test(progressBody) &&
    /radarShroud\.revealed \+=/.test(sweepBody),
  "a line per mask change is a hundred a minute; the question this answers is only whether the mask filled at all"
);

check(
  "and refuses a buffer that is not the size it is covering",
  /pick\.width !== width \|\| pick\.height !== height/.test(coverBody),
  "a stale buffer would put the shroud's edge one resize behind the map's"
);

check(
  "off the map reads as covered",
  /id < 0 \|\| !seen\[id\] \? 255 : 0/.test(coverBody),
  "the headroom band is drawn over nothing, and nothing is not ground the player scouted"
);

check(
  "the cover is now two cases, not four — a gap field is not one of them",
  /const alpha = id < 0 \|\| !seen\[id\] \? 255 : 0;/.test(coverBody) &&
    !/gapAlpha/.test(coverBody) &&
    !/gapped/.test(coverBody),
  "the field dims the ground in its own layer under the blips; leaving it here would dim the blips with it"
);

// --- the gap field's own layer ----------------------------------------------
//
// The client dims a tile under Darken to 35% UNLESS a techno stands on it, in
// which case the techno is drawn at full colour. Ours gets there by ordering
// instead: dim the ground, then draw the blips over it. So the assertions are
// about where this lands in the paint, which is the whole of why it exists.
const gapBody = between("function buildRadarGap(width, height, look)", "// --- the ore");

check(
  "the gap layer dims only ground already scouted",
  /!seen\[id\] \|\| !gapped\[id\]/.test(gapBody),
  "unexplored ground is opaque black from the cover, so dimming it is arithmetic nobody sees"
);

check(
  "the dial is how much of the picture the field lets through",
  /const alpha = Math\.round\(255 \* \(1 - dim\)\)/.test(gapBody),
  "1 hides the field entirely and 0 puts back a field indistinguishable from never-scouted"
);

check(
  "and it costs nothing when no field is up",
  /if \(!radarShroud \|\| !radarShroud\.darkened\) return null;/.test(gapBody),
  "most matches never see a Gap Generator, and this runs three times a second"
);

check(
  "the default dimming is the client's own",
  TUNE.normalise({}).shroudDim === 0.35,
  "0 was the old default and made our own field indistinguishable from ground never scouted, which is the round-2 complaint"
);

const paintOrder = between("function paintRadar()", "// --- the shroud");
check(
  "the field is painted over the ground and under the blips",
  paintOrder.indexOf("buildRadarGap") > paintOrder.indexOf("buildRadarOre") &&
    paintOrder.indexOf("buildRadarGap") < paintOrder.indexOf("drawRadarUnits") &&
    paintOrder.indexOf("buildRadarGap") < paintOrder.indexOf("buildRadarCover"),
  "over the blips it would dim them, which is exactly what the user asked to stop; over the cover it would dim black"
);

check(
  "the cover is stamped with the mask and the dial",
  /\$\{width\}x\$\{height\}\|\$\{radarShroud\.revision\}\|\$\{dim\}/.test(coverBody),
  "without the revision it would never rebuild; without the dial it would ignore the slider"
);

// The units layer took the "repaint only when the mask moved" rule away from
// the tick, because a blip moves when nothing about the mask does. What is left
// of it is the part that still holds: a sweep that finds nothing must not bump
// the revision, or the cover would rebuild its whole image from the pick buffer
// on every tick of a settled match.
check(
  "a sweep that finds nothing rebuilds nothing",
  /if \(changed\) \{/.test(sweepBody) &&
    /radarShroud\.revision\+\+;/.test(sweepBody) &&
    /else if \(!offline && \(moved \|\| oreMoved \|\| state\.combatant\)\) paintRadar\(\);/.test(tickBody),
  "the cover is stamped with the revision, so a revision that moves for nothing redraws every pixel of it"
);

check(
  "and out of a match only the mask can repaint the panel",
  !/paintRadar\(\);\s*$/m.test(tickBody.replace(/else if \(!offline && \(moved \|\| oreMoved \|\| state\.combatant\)\) paintRadar\(\);/, "")),
  "with no match there are no blips to move, so a tick that repaints anyway is a tick that draws the same picture"
);

check(
  "the cover goes on after the blit",
  paintFull.indexOf("ctx.drawImage(backing.canvas, 0, 0);") < paintFull.indexOf("buildRadarCover("),
  "painted first it would be terrain over shroud, which is a picture of nothing hidden"
);

// Searched FROM the blit, not compared as bare positions. paintRadar turns the
// filter off at the top as well, so a plain lastIndexOf/indexOf comparison is
// satisfied by that innocent earlier line and passes however the code below it
// is rearranged — watched do exactly that, which is the second time in two
// slices an index comparison over too wide a region has guarded nothing.
const blitAt = paintFull.indexOf("ctx.drawImage(backing.canvas, 0, 0);");
const coverCallAt = paintFull.indexOf("buildRadarCover(");
const filterOffAt = blitAt === -1 ? -1 : paintFull.indexOf('ctx.filter = "none";', blitAt);

check(
  "and with the filter off",
  blitAt !== -1 && coverCallAt !== -1 && filterOffAt !== -1 && filterOffAt < coverCallAt,
  "the global pair would fade the cover as far as the picture under it, and hide nothing"
);

// The sweep is the radar's first piece of work that outlives a single call, so
// it is also the first that can leak one. The queue subscription is the
// precedent: the one that leaks is invisible until a match ends.
check(
  "the sweep stops with the panel",
  /if \(!radarVisible\) return;/.test(tickBody) &&
    /if \(radarSweepTimer\) window\.clearTimeout\(radarSweepTimer\)/.test(companion),
  "a loop that outlives its panel holds the match's player object with it"
);

check(
  "and cannot be started twice",
  /if \(!radarSweepTimer\) radarSweepTick\(\);/.test(companion) &&
    !/setInterval\(radarSweepTick/.test(companion),
  "two loops would sweep the whole map twice as often for one picture"
);

// Where the probe died, written as a check so the next reader does not have to
// find it the same way: it asked game.map.getSize(), got null, and its tile
// generator returned immediately — so every shroud histogram it reported was
// computed over an empty sample and still printed a verdict.
check(
  "the cell walk does not trust game.map.getSize",
  walkBody.length > 0 && !/getSize\(\)/.test(walkBody),
  "that is the call that returned null in a live match and silently emptied the probe's whole shroud section"
);

check(
  "and says which walk found the cells",
  /radarTileSource/.test(walkBody) && /radar shroud walks the map by/.test(walkBody),
  "the fallback existing is not the same as knowing which one ran"
);

// --- the ore, as numbers and then as a layer -----------------------------------
//
// The one layer on this panel whose colour is a live setting. The render bakes
// the same marks into a stored picture; the radar cannot, because it holds one
// layered render for a whole match and a baked tint is a colour that could not
// change without redoing it mid-game. So the cells come back as numbers and this
// draws them — and both halves are checkable here, which is the point of the
// split.

const ORE_START = "  // --- the ore ---";
const ORE_END = "  // --- the units ---";
const oreFrom = companion.indexOf(ORE_START);
const oreTo = companion.indexOf(ORE_END);
if (oreFrom < 0 || oreTo < 0 || oreTo < oreFrom) {
  console.error("could not find the ore layer in companion.js — this check is out of date");
  process.exit(1);
}
const oreBody = companion.slice(oreFrom, oreTo);

const oreSections = [...oreBody.matchAll(/^ {2}\/\/ --- (.+?) ---/gm)].map((m) => m[1]);
check(
  "the ore window holds exactly the sections it is meant to",
  oreSections.join(" | ") === "the ore",
  "found: " + (oreSections.join(" | ") || "no section headers at all")
);

// A map with one ore cell on the flat, one on a cliff, one gem cell, an overlay
// that is not ore at all, and a second ore overlay on a cell that already has
// one.
const oreMap = {
  fullSize: { width: 100, height: 100 },
  localSize: { x: 6, y: 4, width: 80, height: 70 },
  tiles: [
    { rx: 10, ry: 10, z: 0 },
    { rx: 11, ry: 10, z: 3 },
    { rx: 20, ry: 20, z: 0 },
    { rx: 30, ry: 30, z: 0 },
  ],
  overlays: [
    { id: 102, rx: 10, ry: 10 },
    { id: 110, rx: 11, ry: 10 },
    { id: 30, rx: 20, ry: 20 },
    { id: 5, rx: 30, ry: 30 },
    { id: 105, rx: 10, ry: 10 },
  ],
};

const oreListed = HQ.oreCells(oreMap);
check(
  "the renderer hands the ore back as cells",
  typeof HQ.oreCells === "function" && !!oreListed && Array.isArray(oreListed.ore) && Array.isArray(oreListed.gems),
  "baked pixels are a colour that cannot change without a re-render, which is seconds in the middle of a match"
);

check(
  "ore and gems are told apart by the client's own id ranges",
  oreListed.ore.length === 2 && oreListed.gems.length === 1 && oreListed.gems[0].rx === 20,
  `ore ${oreListed.ore.length}, gems ${oreListed.gems.length}`
);

check(
  "an overlay that is not ore is not one",
  !oreListed.ore.concat(oreListed.gems).some((c) => c.rx === 30),
  "every crate, wall and tree on the map goes through this walk"
);

check(
  "a cell carrying two ore overlays is listed once",
  oreListed.ore.filter((c) => c.rx === 10 && c.ry === 10).length === 1,
  "a cell filled twice is a darker cell everywhere the alpha is not 1"
);

check(
  "each cell carries the elevation of the tile under it",
  oreListed.ore.find((c) => c.rx === 11).z === 3 && oreListed.ore.find((c) => c.rx === 10).z === 0,
  "the render lifts a cell half a block per level, so a mark drawn flat sits below the ground it marks"
);

// --- and the layer that draws them ---------------------------------------------

// The ore is read from the MATCH now, not from the map file, so the harness has
// to stand up a tile occupation rather than hand over a map. `overlays` is
// reused as the live truth because it is already the right shape and the id
// space is the same one either way -- which is itself the point of the design:
// `Overlay#isTiberium` is a lookup on `overlayId`, so one table classifies a
// stored map and a running game alike.
//
// `radarCellList` is injected rather than sliced: it lives in the shroud section
// and this window is the ore's. Handing it in keeps the two windows honest.
function loadOre(look, mapFile = oreMap, overlays = mapFile.overlays) {
  const said = [];
  const made = [];
  const live = overlays.slice();
  const canvasFor = () => {
    const fills = [];
    const path = [];
    let style = null;
    let alpha = 1;
    const ctx = {
      get fillStyle() {
        return style;
      },
      set fillStyle(v) {
        style = v;
      },
      get globalAlpha() {
        return alpha;
      },
      set globalAlpha(v) {
        alpha = v;
      },
      beginPath: () => path.splice(0, path.length),
      moveTo: (x, y) => path.push({ x, y }),
      lineTo: () => {},
      closePath: () => {},
      fill: () => fills.push({ colour: style, alpha, corners: path.map((p) => ({ ...p })) }),
    };
    const canvas = { width: 0, height: 0, getContext: () => ctx, fills };
    made.push(canvas);
    return canvas;
  };

  // One live overlay, shaped the way the client's own Overlay answers.
  const asObject = (o) => ({
    isOverlay: () => true,
    isTiberium: () => HQ.oreKindFor(o.id) !== null,
    overlayId: o.id,
  });
  const occupation = {
    getObjectsOnTile: (tile) => live.filter((o) => o.rx === tile.rx && o.ry === tile.ry).map(asObject),
  };
  const state = { appearance: {}, combatant: { game: { map: { tileOccupation: occupation } } } };

  const api = new Function(
    "state",
    "note",
    "window",
    "document",
    "radarGeo",
    "radarMapFile",
    "radarCellList",
    oreBody + "; return { buildRadarOre, sweepRadarOre, radarOreOn };"
  )(
    state,
    (message, level) => said.push({ message, level }),
    { __cdcHq: HQ },
    { createElement: canvasFor },
    g,
    () => mapFile,
    () => mapFile.tiles
  );

  // Mine a cell out, or seed one, between sweeps -- which is the whole of what
  // this layer had to start noticing.
  const mineOut = (rx, ry) => {
    for (let i = live.length - 1; i >= 0; i--) {
      if (live[i].rx === rx && live[i].ry === ry) live.splice(i, 1);
    }
  };
  const seed = (o) => live.push(o);

  api.sweepRadarOre();
  return { ...api, said, made, look, mineOut, seed };
}

const LOOK = TUNE.normalise({});
const oreLayer = loadOre(LOOK);
const oreDrawn = oreLayer.buildRadarOre(400, 300, LOOK);

check(
  "the layer draws something at all",
  !!oreDrawn && oreDrawn.fills.length === 2,
  "one path per kind, and the layer is invisible if this is wrong"
);

check(
  "ore in the table's ore colour and gems in its gem colour",
  oreDrawn.fills[0].colour === LOOK.ore && oreDrawn.fills[1].colour === LOOK.gems,
  "the two are one dial each on the options page, and this is the surface they were asked for on"
);

check(
  "every ore cell is a diamond of its own, and gems come after ore",
  oreDrawn.fills[0].corners.length === 2 && oreDrawn.fills[1].corners.length === 1,
  "a gem patch inside an ore field has to keep its own colour, which is why the order is fixed"
);

// Deliberately **not** the default: oreAlpha defaults to 1 and a canvas starts
// at 1, so a layer that never touched the dial would have passed this check on
// the default table. It did, until a mutation dropping the line survived.
const faded = loadOre(LOOK).buildRadarOre(400, 300, TUNE.normalise({ oreAlpha: 0.4 }));
check(
  "the marks are drawn at the table's own alpha",
  faded.fills[0].alpha === 0.4,
  "how strongly the whole marking reads is the one thing that dial is for — got " + faded.fills[0].alpha
);

// The elevation, arrived at the same way the picture does — and read off **y**,
// which is the only coordinate it moves. The first version of this compared x,
// where a cell at z=3 and the same cell at z=0 land on the same pixel, so it
// passed on a layer that ignored the elevation entirely.
const sy400 = 300 / g.cropHeight;
const wantTop = (g.cellAt(11, 10, 3).y - g.view.y) * sy400;
const flatTop = (g.cellAt(11, 10, 0).y - g.view.y) * sy400;
check(
  "a cell on a cliff is drawn lifted, where the render puts it",
  wantTop !== flatTop &&
    oreDrawn.fills[0].corners.some((c) => Math.abs(c.y - wantTop) < 0.001) &&
    !oreDrawn.fills[0].corners.some((c) => Math.abs(c.y - flatTop) < 0.001),
  "the z travels with the cell precisely so this is not drawn flat"
);

const again = oreLayer.buildRadarOre(400, 300, LOOK);
check(
  "a repaint blits the layer it already has",
  again === oreDrawn && oreLayer.made.length === 1,
  "a full map is thousands of cells and this runs at the tick rate"
);

const recoloured = oreLayer.buildRadarOre(400, 300, TUNE.normalise({ ore: "#00ff00" }));
check(
  "and a colour that moved builds a new one",
  recoloured !== oreDrawn && recoloured.fills[0].colour === "#00ff00",
  "that is the whole point of the cells being numbers"
);

// Two sizes of the *same* table, back to back on a fresh layer: comparing
// against the recoloured one instead passed for the colour's reason rather than
// the size's, and a mutation that dropped the size from the stamp survived it.
const sized = loadOre(LOOK);
const atFour = sized.buildRadarOre(400, 300, LOOK);
const atFive = sized.buildRadarOre(500, 300, LOOK);
check(
  "as does a panel that was resized",
  atFive !== atFour && atFive.width === 500,
  "the layer is in device pixels, so it cannot outlive the size it was drawn at"
);

// --- and that it is the match's ore, not the map's ---------------------------
//
// The round-2 defect: the layer walked `mapFile.overlays`, so a field mined flat
// by hour two stayed on the radar for the rest of the game and ore that regrew
// from a drill never appeared. Every assertion above passes on that code -- they
// are all about colour, alpha, placement and caching, and the old layer got all
// of those right. These are the ones that do not.

{
  const mined = loadOre(LOOK);
  const before = mined.buildRadarOre(400, 300, LOOK);
  const oreCornersBefore = before.fills[0].corners.length;

  mined.mineOut(11, 10);
  const moved = mined.sweepRadarOre();
  const after = mined.buildRadarOre(400, 300, LOOK);

  check(
    "a sweep notices a cell that was mined out",
    moved === true,
    "a harvester empties a cell every few seconds, and the layer has to be told"
  );

  check(
    "and the field it draws loses that cell",
    after !== before && after.fills[0].corners.length === oreCornersBefore - 1,
    "this is the round-2 defect — was " + oreCornersBefore + ", now " + after.fills[0].corners.length
  );
}

{
  const grown = loadOre(LOOK);
  grown.buildRadarOre(400, 300, LOOK);
  // A drill spits ore onto a cell that had none. 30,30 carries an overlay that
  // is not ore, so this also proves the walk reads the id rather than the cell.
  grown.seed({ id: 102, rx: 30, ry: 30 });
  const moved = grown.sweepRadarOre();
  const after = grown.buildRadarOre(400, 300, LOOK);

  check(
    "and ore that regrew is picked up",
    moved === true && after.fills[0].corners.length === 3,
    "ore from a drill never appeared at all under the map-file walk — got " + after.fills[0].corners.length
  );
}

{
  const still = loadOre(LOOK);
  const first = still.buildRadarOre(400, 300, LOOK);
  const madeBefore = still.made.length;
  const moved = still.sweepRadarOre();
  const second = still.buildRadarOre(400, 300, LOOK);

  check(
    "a sweep that finds the ore where it left it costs nothing",
    moved === false && second === first && still.made.length === madeBefore,
    "this runs once a second over twenty thousand cells; a revision that moves for nothing redraws every pixel"
  );
}

{
  // Gems win a cell they share with ore, which is the order the render draws in.
  const shared = loadOre(LOOK, oreMap, oreMap.overlays.concat([{ id: 30, rx: 10, ry: 10 }]));
  const drawn = shared.buildRadarOre(400, 300, LOOK);
  check(
    "a cell carrying both ore and gems is drawn as gems",
    drawn.fills[1].corners.length === 2,
    "a gem patch embedded in an ore field has to keep its own colour — got " + drawn.fills[1].corners.length
  );
}

check(
  "the ore layer is told apart by the client's own id, not by a table of its own",
  /hq\.oreKindFor\(obj\.overlayId\)/.test(oreBody) && /isTiberium\(\)/.test(oreBody),
  "Overlay#isTiberium is itself a lookup on overlayId, so one table classifies a stored map and a running game alike"
);

check(
  "the picture is stamped with the ore's revision",
  /radarOreMask\.revision/.test(oreBody) && /\$\{radarOreMask\.revision\}/.test(oreBody),
  "without it the first picture of a map is kept for the whole match, which is the defect this section exists to fix"
);

check(
  "the ore is walked on a slower clock than the shroud",
  /RADAR_ORE_EVERY = Math\.round\(1000 \/ RADAR_TICK_MS\)/.test(companion) &&
    /radarTicks % RADAR_ORE_EVERY === 0 \? sweepRadarOre\(\) : false/.test(tickBody),
  "reading it at the shroud's rate is getObjectsOnTile twenty thousand times a second to watch paint dry"
);

check(
  "the layer never asks the shroud",
  !/radarShroud|radarCellVisible|isShrouded/.test(oreBody),
  "the cover goes on after it and paints opaque black over unscouted ground, which clips it for free"
);

const oreCallAt = paintFull.indexOf("const ore = buildRadarOre(canvas.width, canvas.height, look);");
// Its own binding rather than the one the paint-order section takes later: that
// one is declared after this block and would be in its temporal dead zone.
const oreUnitsAt = paintFull.indexOf("drawRadarUnits(ctx, canvas, look, tune);");
check(
  "the ore goes on after the terrain and before the blips",
  oreCallAt !== -1 && oreCallAt > blitAt && oreCallAt < oreUnitsAt,
  "a mark is on the ground and a blip stands on it — under the tint, a unit would be the colour of the ore"
);

check(
  "and under the cover, which is what keeps it to scouted ground",
  oreCallAt !== -1 && oreCallAt < coverCallAt,
  "over the cover it would be an ore map of ground the player has never seen"
);

// --- the unit layer, run rather than read ---------------------------------------------
//
// The section is sliced out and executed against a stub game, the trick
// check-colours.mjs uses on the recolour: a text assertion over this file's
// prose would pass on code that draws every unit on the map, and that is
// exactly the failure worth catching. What the blips are gated on is the whole
// difference between a radar and a maphack, so it is asserted by drawing.
//
// Everything the section needs from the file around it -- the geometry, the
// mask, the map, the log -- is handed in, so a test says what the player has
// scouted and reads back what was drawn.

const UNITS_START = "  // --- the units ---";
// Moved when the viewport rectangle got its own section between the two, and
// moved *in the same change* on purpose: a function inserted inside this window
// widens it in silence, and twenty-five assertions then run against more code
// than they were written for while the suite goes on printing green.
const UNITS_END = "  // --- the viewport rectangle ---";
const unitsFrom = companion.indexOf(UNITS_START);
const unitsTo = companion.indexOf(UNITS_END);
if (unitsFrom < 0 || unitsTo < 0 || unitsTo < unitsFrom) {
  console.error("could not find the unit layer in companion.js — this check is out of date");
  process.exit(1);
}
const unitsBody = companion.slice(unitsFrom, unitsTo);

// The window's own extent, asserted rather than assumed.
//
// Every assertion below runs against this slice, and a function inserted before
// `unitsTo` widens it in silence -- the suite goes on printing green while
// twenty-five checks quietly cover code they were never written for. That is not
// hypothetical: the viewport rectangle was written between these two headers
// first, and reverting the boundary afterwards changed nothing anywhere. So the
// sections inside the window are listed, and adding one is a deliberate edit
// here rather than an accident there.
const unitsSections = [...unitsBody.matchAll(/^ {2}\/\/ --- (.+?) ---/gm)].map((m) => m[1]);
check(
  "the unit window holds exactly the sections it is meant to",
  unitsSections.join(" | ") === "the units | tech-building pictograms",
  "found: " + (unitsSections.join(" | ") || "no section headers at all")
);

function loadUnits(geo, shroud, unitMapFile) {
  const said = [];
  const state = { combatant: null };
  const api = new Function(
    "state",
    "note",
    "radarGeo",
    "radarShroud",
    "radarMapFile",
    unitsBody +
      "\n return { radarBlipColour, radarCellVisible, radarObjectCells, radarTechnos, drawRadarUnits, drawRadarIcons, radarTechGlyph, radarSharedIntel, radarOwnerColour, RADAR_WALL_DEFAULT, RADAR_TERRAIN_COLOUR, RADAR_ICON_FRACTION, RADAR_ICON_MIN, RADAR_ICON_MAX };"
  )(state, (message, level) => said.push({ message, level }), geo, shroud, () => unitMapFile);
  return { ...api, state, said };
}

/** A shroud mask over the real geometry: the cells listed are the ones scouted. */
function maskOf(forMap, geo, revealed, gapped = []) {
  const m = {
    mapFile: forMap,
    stride: geo.idStride,
    seen: new Uint8Array(geo.cellIds),
    gapped: new Uint8Array(geo.cellIds),
    revision: 1,
    revealed: 0,
    darkened: 0,
  };
  for (const [rx, ry] of revealed) m.seen[geo.cellId(rx, ry)] = 1;
  for (const [rx, ry] of gapped) m.gapped[geo.cellId(rx, ry)] = 1;
  return m;
}

/** A canvas context that remembers what was filled and in what colour. */
function recorder() {
  const fills = [];
  let style = null;
  let path = [];
  const ctx = {
    get fillStyle() {
      return style;
    },
    set fillStyle(v) {
      style = v;
    },
    fillRect: (x, y, w, h) => fills.push({ kind: "dot", colour: style, x, y, w, h }),
    beginPath: () => {
      path = [];
    },
    moveTo: (x, y) => path.push([x, y]),
    lineTo: (x, y) => path.push([x, y]),
    closePath: () => {},
    fill: () => fills.push({ kind: "footprint", colour: style, corners: path.length }),
  };
  return { ctx, fills };
}

const RED = { asHexString: () => "#ff0000" };
const BLUE = { asHexString: () => "#0000ff" };
const me = { name: "me", color: RED, isCombatant: () => true };
const foe = { name: "foe", color: BLUE, isCombatant: () => true };
// The client's own answer, and the only one that ever un-hides anything.
const alliances = { haveSharedIntel: (a, b) => a === b };

function techno(props) {
  return {
    name: "E1",
    rules: {},
    owner: foe,
    radarInvisible: false,
    isDestroyed: false,
    isSpawned: true,
    tile: { rx: 50, ry: 50, z: 0 },
    isTechno: () => true,
    isBuilding: () => false,
    isInfantry: () => true,
    isVehicle: () => false,
    getFoundation: () => ({ width: 1, height: 1 }),
    ...props,
  };
}

const canvas = { width: 400, height: 300 };

/**
 * Draw a world of these objects against this mask, and report what landed.
 *
 * The look defaults to the normalised default table rather than to nothing, so
 * every assertion below runs the path a default install runs -- the `null` case
 * is a state the panel really passes through and gets an assertion of its own.
 */
function drawWith(objects, shroud, occupation = null, look = TUNE.normalise({})) {
  const api = loadUnits(g, shroud, mapFile);
  api.state.combatant = {
    player: me,
    game: {
      alliances,
      map: { tileOccupation: occupation },
      getWorld: () => ({ getAllObjects: () => objects }),
    },
  };
  const rec = recorder();
  api.drawRadarUnits(rec.ctx, canvas, look, TUNE);
  return { fills: rec.fills, said: api.said, api };
}

const scouted = maskOf(mapFile, g, [[50, 50]]);

// The gate. Everything else in this file is arithmetic; this is the promise.
check(
  "a unit on scouted ground is drawn",
  drawWith([techno({})], scouted).fills.length === 1,
  "the layer draws nothing at all if this fails, and every check below would pass"
);

check(
  "a unit on ground that was never scouted is not",
  drawWith([techno({ tile: { rx: 20, ry: 20, z: 0 } })], scouted).fills.length === 0,
  "this is the difference between a radar and a maphack"
);

// A Gap Generator does not make a tile unexplored -- it sets a Darken flag. And
// on OUR shroud that flag can only ever be our own field or an ally's: both
// writers are gated on ownership, and an enemy's generator instead calls
// unrevealAround on every non-allied shroud, so an enemy field reaches us as
// ordinary unexplored ground and `seen` alone already hides it.
//
// So the gate does not ask about the flag at all. This is the round-2 item: the
// player's own generator used to blind the player's own radar.
check(
  "and one under our own gap field IS drawn",
  drawWith([techno({})], maskOf(mapFile, g, [[50, 50]], [[50, 50]])).fills.length === 1,
  "our own field must not hide what is ours to see — the client draws a techno under Darken at full colour"
);

// The other half of the same rule: the field still has to be *visible*. That is
// the gap layer's job, not the gate's, and it is asserted where it lives.
const gateBody = between("function radarCellVisible(tile) {", "/**");
check(
  "the gate asks the mask alone, with no flag in it",
  /return !!seen\[i\];/.test(gateBody) && !/gapped/.test(gateBody),
  "a gap term here is the defect: our own generator blinding our own radar"
);

// Fail closed, twice. Both of these are states the panel really passes through:
// the first tick before a sweep has run, and the first tick after a new match
// starts on a different map.
check(
  "no mask means no blips",
  drawWith([techno({})], null).fills.length === 0,
  "a blip drawn before the mask exists is a unit position the player has not earned"
);

check(
  "and a mask for another map means no blips either",
  drawWith([techno({})], maskOf({ other: true }, g, [[50, 50]])).fills.length === 0,
  "the mask is indexed by this map's geometry — another map's bits are a different diamond"
);

// --- what the blip is, once it is allowed ------------------------------------

const drawn = (objects, shroud = scouted, occupation = null) => drawWith(objects, shroud, occupation).fills;

check(
  "a unit is drawn in its owner's colour, read off the live object",
  drawn([techno({})])[0].colour === "#0000ff",
  "owner.color is what the recolour feature writes into, and a constructed colour throws inside the client's render loop"
);

check(
  "and the section never constructs one",
  !/new\s+Color|Color\.fromRgb|fromHsv/.test(unitsBody) && /asHexString\(\)/.test(unitsBody),
  "a batched voxel builder resolves palettes by content hash and misses on a colour the rules never had"
);

// Cloak and disguise: the two reads that keep this honest, asserted by their
// effect rather than by their presence.
const cloakedFoe = techno({ cloakableTrait: { isCloaked: () => true } });
check(
  "a cloaked enemy is not drawn",
  drawn([cloakedFoe]).length === 0,
  "the client hides it unless the viewer has shared intel with its owner"
);

check(
  "a cloaked ally is",
  drawn([techno({ owner: me, cloakableTrait: { isCloaked: () => true } })]).length === 1,
  "haveSharedIntel is the client's own test and it is true for oneself"
);

// A disguised unit takes the disguise's colour, which is the whole point of a
// Mirage Tank or a Spy: our radar must lie exactly as far as the client's does.
const spy = techno({
  isInfantry: () => true,
  disguiseTrait: { getDisguise: () => ({ owner: me }) },
});
check(
  "a disguised enemy wears the disguise's colour",
  drawn([spy])[0].colour === "#ff0000",
  "drawing its real colour would identify every spy the moment it stepped onto scouted ground"
);

const api0 = loadUnits(g, scouted, mapFile);
check(
  "and one disguised as terrain wears the terrain's",
  api0.radarBlipColour(techno({ disguiseTrait: { getDisguise: () => ({}) } }), me, alliances) ===
    api0.RADAR_TERRAIN_COLOUR,
  "a mirage tank's disguise has no owner behind it"
);

check(
  "unless the player can see through it",
  api0.radarBlipColour(
    techno({ disguiseTrait: { getDisguise: () => ({ owner: me }) } }),
    { ...me, sharedDetectDisguiseTrait: { has: () => true } },
    alliances
  ) === "#0000ff",
  "sharedDetectDisguiseTrait is the client's own exception and it must not be dropped"
);

// The direction of the default matters more than the default. Every one of
// these answers only ever un-hides something.
check(
  "a missing alliance table hides rather than reveals",
  api0.radarSharedIntel(null, me, foe) === false &&
    api0.radarSharedIntel({}, me, foe) === false,
  "the other way round turns a client change into a cheat"
);

// --- what is not a unit --------------------------------------------------------

check(
  "a wall is drawn as a wall, not as its builder's army",
  drawn([techno({ name: "GAWALL", rules: { wall: true }, isBuilding: () => true })])[0].colour ===
    api0.RADAR_WALL_DEFAULT,
  "a wall line in a player colour reads as an army on the radar"
);

check(
  "and the client's four named walls keep their own colours",
  api0.radarBlipColour(techno({ name: "GASAND", rules: { wall: true } }), me, alliances) === "#524d39",
  "read out of MinimapModel v0.83.3 with the rest of them"
);

check(
  "a radar-invisible techno is not drawn",
  drawn([techno({ radarInvisible: true })]).length === 0,
  "RadarInvisible is an INI flag the client honours, and a veteran ability can set it mid-match"
);

check(
  "but a garrisoned civilian building is",
  drawn([
    techno({
      radarInvisible: true,
      isBuilding: () => true,
      rules: { canBeOccupied: true },
      owner: foe,
    }),
  ]).length === 1,
  "that is how an occupied building reads as a threat on the native radar"
);

check(
  "a destroyed or unspawned object is skipped",
  drawn([techno({ isDestroyed: true }), techno({ isSpawned: false })]).length === 0,
  "both are states an object passes through while still in the world's list"
);

// --- footprints ----------------------------------------------------------------

const bigTile = (rx, ry) => ({ rx, ry, z: 0 });
const occupation = {
  calculateTilesForGameObject: () => [bigTile(50, 50), bigTile(51, 50), bigTile(50, 51), bigTile(51, 51)],
};
const barracks = techno({
  isBuilding: () => true,
  isInfantry: () => false,
  getFoundation: () => ({ width: 2, height: 2 }),
});

const footprint = drawn([barracks], maskOf(mapFile, g, [[50, 50], [51, 50], [50, 51], [51, 51]]), occupation);
check(
  "a building is drawn as its footprint, in one path",
  footprint.length === 1 && footprint[0].kind === "footprint" && footprint[0].corners === 16,
  "four cells of four corners; filling them one at a time seams every shared edge"
);

const straddling = drawn([barracks], maskOf(mapFile, g, [[50, 50], [51, 50]]), occupation);
check(
  "and only over the cells that have been scouted",
  straddling.length === 1 && straddling[0].corners === 8,
  "the gate is per cell, not per object — a building on the shroud edge shows the half that was scouted"
);

// Two of them, because one proves nothing: a canvas path persists until the
// next beginPath, so a building that never opens its own would fill the
// previous building's outline along with its own and the first one on the map
// would still look right.
const pair = drawn([barracks, barracks], maskOf(mapFile, g, [[50, 50], [51, 50]]), occupation);
check(
  "and each building opens its own path",
  pair.length === 2 && pair[0].corners === 8 && pair[1].corners === 8,
  "a path left open takes the last building's cells with it, and only the first one on the map looks right"
);

check(
  "a one-by-one object never asks the client for its tiles",
  drawn([techno({})], scouted, {
    calculateTilesForGameObject: () => {
      throw new Error("the allocating call was made for a single-tile object");
    },
  }).length === 1,
  "it is the overwhelming majority of the objects on a map and its answer is its own tile"
);

// --- the blip dial ---------------------------------------------------------------
//
// The user's complaint that started this was that the blips are hard to see, and
// the answer agreed was a dial rather than a bigger default -- so the first thing
// to pin is that the default did not move. The rest is that the dial reaches the
// blip the only way it can: the layer is drawn with `ctx.filter` off on purpose,
// so brightness has to reach the colour string instead of the context.

const cellWidth = g.block.width * (canvas.width / g.cropWidth);
const blipAt = (look) => drawWith([techno({})], scouted, null, look).fills[0];
const defaultBlip = blipAt(TUNE.normalise({}));

check(
  "the default blip is the size it was before the dial existed",
  defaultBlip.w === Math.max(2, cellWidth / 2.5) && defaultBlip.w === defaultBlip.h,
  "a dial was asked for and a bigger default was refused; got " + defaultBlip.w
);

const doubled = blipAt(TUNE.normalise({ units: { size: 2 } }));
check(
  "the size dial multiplies the cell's own size",
  doubled.w === Math.max(2, (cellWidth / 2.5) * 2) && doubled.w > defaultBlip.w,
  "a dial that ignores the cell stops following a resize; got " + doubled.w
);

check(
  "and the blip grows about its cell rather than off it",
  doubled.x + doubled.w / 2 === defaultBlip.x + defaultBlip.w / 2 &&
    doubled.y + doubled.h / 2 === defaultBlip.y + defaultBlip.h / 2,
  "grown from the corner, a big blip points at ground its unit is not standing on"
);

check(
  "the floor is under the dial, not over it",
  blipAt(TUNE.normalise({ units: { size: 0.5 } })).w === Math.max(2, (cellWidth / 2.5) * 0.5),
  "two pixels is there so a blip survives the smallest panel; a size dial is not a switch that hides units"
);

// Not the blue above: it is already at the ceiling, so brightening it returns
// itself and every assertion below would hold on code that never applied the
// dial at all. Watched do exactly that -- the first form of these two checks
// passed against a `tint` that was the identity function.
const dimOwner = { name: "dim", color: { asHexString: () => "#405060" }, isCombatant: () => true };
const lit = TUNE.normalise({ units: { brightness: 1.6 } });
const litBlip = drawWith([techno({ owner: dimOwner })], scouted, null, lit).fills[0];

check(
  "the brightness dial reaches the blip's own colour",
  litBlip.colour === TUNE.tuneHex("#405060", 1.6, 1) && litBlip.colour !== "#405060",
  "the layer is drawn with the filter off, so the colour string is the only surface a dial has"
);

const litFootprint = drawWith(
  [{ ...barracks, owner: dimOwner }],
  maskOf(mapFile, g, [[50, 50], [51, 50]]),
  occupation,
  lit
).fills;
check(
  "a building's footprint takes the same tint",
  litFootprint.length === 1 &&
    litFootprint[0].colour === TUNE.tuneHex("#405060", 1.6, 1) &&
    litFootprint[0].colour !== "#405060",
  "one fillStyle serves both shapes, and a dial that reached only the dots would be half a dial"
);

check(
  "the default table rewrites no colour at all",
  defaultBlip.colour === "#0000ff",
  "identity has to be the identity, or every blip on a fresh install is a rounding of itself"
);

check(
  "and no look at all is still the default blip",
  drawWith([techno({})], scouted, null, null).fills[0].w === defaultBlip.w,
  "the first paint can run before the table has been pushed in, and it must draw the same picture"
);

check(
  "the unit layer never touches ctx.filter",
  // The assignment, not the words: the section's own comment explains why the
  // filter is off, and a bare /ctx\.filter/ matched that and failed on prose.
  !/ctx\.filter\s*=/.test(unitsBody),
  "a blip dimmed exactly as far as the map under it is exactly as hard to see -- which is why the dial reaches the colour"
);

// --- the tech-building pictograms -------------------------------------------------
//
// The same marks the stored map previews carry, over the live radar. They live
// inside the unit layer's window on purpose -- they call its gate -- so they are
// executed against the same stub game, and what is asserted is the two decisions
// this code owns: which buildings are marked, and where the mark lands. The
// drawing itself belongs to src/glyphs.js and has its own sheet script, so the
// glyph table is handed in real and the pen is a recorder.

const GLYPHS = context.__cdcGlyphs;

// The civilian house that owns an uncaptured oil derrick. `isNeutral` is a field
// on the client's Player and `isCombatant()` a method that reads it; the derrick
// trait keys on exactly this, so the stub carries both.
const GREY = { asHexString: () => "#9a9a9a" };
const neutral = { name: "civilian", color: GREY, isNeutral: true, isCombatant: () => false };

/** Where a mark centred on this (possibly fractional) cell should land. */
const markPoint = (rx, ry, z) => ({
  x: (g.cellAt(rx, ry, z || 0).x + g.block.width / 2 - g.view.x) * (canvas.width / g.cropWidth),
  y: (g.cellAt(rx, ry, z || 0).y + g.block.height / 2 - g.view.y) * (canvas.height / g.cropHeight),
});
const near = (a, b) => Math.abs(a - b) < 0.0001;

/** The real table and the real box arithmetic; only the pen is a stub. */
function glyphPen() {
  const marks = [];
  return {
    marks,
    api: {
      BUILDING_ICONS: GLYPHS.BUILDING_ICONS,
      ICON_NEUTRAL: GLYPHS.ICON_NEUTRAL,
      glyphBox: GLYPHS.glyphBox,
      drawGlyph: (ctx, glyph, cx, cy, box, color) => marks.push({ glyph, cx, cy, box, color }),
    },
  };
}

/** Mark a world of these objects against this mask, and report what landed. */
function markWith(objects, shroud, occupation = null, glyphs = null, surface = canvas) {
  const api = loadUnits(g, shroud, mapFile);
  api.state.combatant = {
    player: me,
    game: {
      alliances,
      map: { tileOccupation: occupation },
      getWorld: () => ({ getAllObjects: () => objects }),
    },
  };
  const pen = glyphPen();
  api.drawRadarIcons({}, surface, glyphs === null ? pen.api : glyphs);
  return { marks: pen.marks, said: api.said, api };
}

const derrick = (props) =>
  techno({
    name: "CAOILD",
    rules: { needsEngineer: true },
    owner: neutral,
    isBuilding: () => true,
    isInfantry: () => false,
    ...props,
  });

check(
  "a tech building on scouted ground is marked",
  markWith([derrick({})], scouted).marks.length === 1,
  "the layer draws nothing at all if this fails, and every check below would pass"
);

check(
  "and the glyph is the one the previews use for that name",
  markWith([derrick({})], scouted).marks[0].glyph === GLYPHS.BUILDING_ICONS.CAOILD,
  "the table is src/glyphs.js's -- a second copy here is how the radar and the preview stop agreeing"
);

check(
  "a tech building on ground that was never scouted is not marked",
  markWith([derrick({ tile: { rx: 20, ry: 20, z: 0 } })], scouted).marks.length === 0,
  "a pictogram is a statement about a building the player may not have found"
);

check(
  "but one under our own gap field IS marked",
  markWith([derrick({})], maskOf(mapFile, g, [[50, 50]], [[50, 50]])).marks.length === 1,
  "the same gate the blips use — Darken on our shroud is our own field, and our own field must not hide our own buildings"
);

check(
  "no mask means no marks",
  markWith([derrick({})], null).marks.length === 0,
  "fail closed, exactly as the blips do"
);

check(
  "and a mask for another map means no marks either",
  markWith([derrick({})], maskOf({ other: true }, g, [[50, 50]])).marks.length === 0,
  "the mask is indexed by this map's geometry -- another map's bits are a different diamond"
);

// The gate that keeps this from marking the whole map. `capturable` is true of
// an ordinary war factory on a live object -- an engineer can take one -- so the
// client's own tech marker is the one that is read.
check(
  "an ordinary building is not marked",
  markWith([barracks], maskOf(mapFile, g, [[50, 50], [51, 50], [50, 51], [51, 51]]), occupation).marks.length === 0,
  "gating on rules.capturable would put a pictogram on every building on the map"
);

// The mutation this exists for: `rules.capturable` is what the renderer's
// map-file gate reads, and reaching for the same name on a live object marks
// every building on the map. An engineer can take a war factory, so a war
// factory is capturable.
check(
  "a capturable building that is not tech is not marked",
  markWith([techno({ name: "GAWEAP", rules: { capturable: true }, isBuilding: () => true })], scouted).marks
    .length === 0,
  "needsEngineer is the client's own tech marker; capturable is not one"
);

check(
  "and neither is a unit that happens to carry the flag",
  markWith([techno({ rules: { needsEngineer: true } })], scouted).marks.length === 0,
  "needsEngineer is a TechnoRules field, so the building test is not redundant"
);

check(
  "a radar-invisible tech building is not marked",
  markWith([derrick({ radarInvisible: true })], scouted).marks.length === 0,
  "the blips honour the same INI flag, and a mark that outlived the blip would announce what the blip hid"
);

check(
  "an unfamiliar tech structure falls back to the marker",
  markWith([derrick({ name: "CANOTHING" })], scouted).marks[0].glyph === "marker",
  "iconFor in hq-preview.js does the same: marked rather than dropped"
);

// White while nobody owns it, the owner's colour once somebody does -- the
// render's own rule. The direction of the fallback is the part worth pinning:
// white is the one colour that never means a player.
check(
  "an uncaptured tech building is white",
  markWith([derrick({})], scouted).marks[0].color === GLYPHS.ICON_NEUTRAL,
  "its owner is the civilian player, whose colour is not ours to depend on"
);

check(
  "and a captured one takes its owner's colour",
  markWith([derrick({ owner: foe })], scouted).marks[0].color === "#0000ff",
  "read off the live object, never constructed"
);

check(
  "an owner whose colour cannot be read falls back to white rather than to nothing",
  markWith([derrick({ owner: { name: "odd", isCombatant: () => true, color: {} } })], scouted).marks[0]
    .color === GLYPHS.ICON_NEUTRAL,
  "a missing colour must not drop the mark -- the building is still there"
);

// Where the mark lands. Centred on the cells that have been scouted, so a
// building on the shroud edge is marked over the half the player has seen.
const wholeFootprint = maskOf(mapFile, g, [[50, 50], [51, 50], [50, 51], [51, 51]]);
const halfFootprint = maskOf(mapFile, g, [[50, 50], [51, 50]]);
const bigDerrick = derrick({ getFoundation: () => ({ width: 2, height: 2 }) });
const whole = markWith([bigDerrick], wholeFootprint, occupation).marks[0];
const half = markWith([bigDerrick], halfFootprint, occupation).marks[0];

check(
  "a footprint is marked at its middle",
  near(whole.cx, markPoint(50.5, 50.5).x) && near(whole.cy, markPoint(50.5, 50.5).y),
  "a 2x2 building marked at a corner points at the cell beside it"
);

check(
  "and a half-scouted one at the middle of the half that was scouted",
  near(half.cx, markPoint(50.5, 50).x) && near(half.cy, markPoint(50.5, 50).y) && half.cy !== whole.cy,
  "the mark follows the gate, the way the blip's footprint does -- averaging the whole footprint would put it on ground nobody has seen"
);

// Sized from the panel and not from a cell -- a cell is about five pixels across
// at a usable panel size, and a five-pixel glyph is a smudge. Asserted by what
// the size *does* rather than against the constants themselves: reading
// RADAR_ICON_FRACTION back out of the module and multiplying by it is a
// tautology that holds whatever the number is, which is what the first draft of
// this check did.
const boxAt = (width) =>
  markWith([derrick({})], scouted, null, null, { width, height: Math.round((width * 3) / 4) }).marks[0].box;

check(
  "the mark grows with the panel",
  boxAt(600) === boxAt(400) * 1.5,
  "a fixed pixel size would be a speck on a panel dragged wide and a blot on the smallest one; got " +
    boxAt(400) + " and " + boxAt(600)
);

check(
  "and stops growing before it covers the map",
  boxAt(4000) === boxAt(2000) && boxAt(4000) < 40,
  "six enormous pictograms is not a radar; got " + boxAt(4000)
);

check(
  "and stops shrinking before it disappears",
  boxAt(40) === boxAt(80) && boxAt(40) > 8,
  "the 160px floor on the panel still has to show a mark; got " + boxAt(40)
);

check(
  "a wrench asks for its own box, not the plain one",
  markWith([derrick({ name: "CAMACH" })], scouted).marks[0].box >
    markWith([derrick({})], scouted).marks[0].box,
  "ICON_SCALE is glyphs.js's own optical correction and skipping glyphBox would drop it"
);

check(
  "a panel with no glyph module draws no marks and does not throw",
  markWith([derrick({})], scouted, null, {}).marks.length === 0,
  "src/glyphs.js is a separate script, and a build that dropped it must show a radar rather than a stack trace"
);

check(
  "the icons say how many they marked",
  /radar tech icons: 1 marked/.test((markWith([derrick({})], scouted).said[0] || {}).message || ""),
  "a layer with nothing on it cannot otherwise be told from a layer whose gate is stuck shut"
);

check(
  "and says it once rather than once a tick",
  (() => {
    const api = loadUnits(g, scouted, mapFile);
    api.state.combatant = {
      player: me,
      game: { alliances, map: { tileOccupation: null }, getWorld: () => ({ getAllObjects: () => [derrick({})] }) },
    };
    const pen = glyphPen();
    api.drawRadarIcons({}, canvas, pen.api);
    api.drawRadarIcons({}, canvas, pen.api);
    return api.said.length === 1;
  })(),
  "the panel repaints ten times a second, and a line per repaint flushes the event list in seconds"
);

// The table stays in one file. companion.js naming a building itself is the
// start of the second copy that glyphs.js exists to prevent.
check(
  "companion.js names no tech building of its own",
  !/CAOILD|CAHOSP|CAAIRP|CAMACH|CASLAB|CAOUTP/.test(companion),
  "the six names live in src/glyphs.js, which the previews and the radar both read"
);

// --- the viewport rectangle ---------------------------------------------------------
//
// The camera's own box, and the one layer here that is deliberately not gated by
// the shroud: it says where the player is looking, which the player knows.
//
// What makes this checkable without a browser is that the rectangle is a
// *translation* of the client's camera pan into our render's pixels, not an
// inverse of the picture. So the assertion below is a round trip through two
// things built independently of each other: the pan formula is the CLIENT's,
// written out here from the bundle, and the answer is read out of the
// renderer's own pick buffer -- the same rasterisation a click uses. Nothing
// compares the radar's arithmetic to itself.

const VIEW_START = "  // --- the viewport rectangle ---";
const VIEW_END = "  // --- the tick ---";
const viewFrom = companion.indexOf(VIEW_START);
const viewTo = companion.indexOf(VIEW_END);
if (viewFrom < 0 || viewTo < 0 || viewTo < viewFrom) {
  console.error("could not find the viewport rectangle in companion.js — this check is out of date");
  process.exit(1);
}
const viewportBody = companion.slice(viewFrom, viewTo);

function loadViewport(geo) {
  const state = { combatant: null };
  const api = new Function(
    "state",
    "radarGeo",
    viewportBody + "\n return { radarViewportRect, drawRadarViewport, RADAR_VIEWPORT_COLOUR };"
  )(state, geo);
  return { ...api, state };
}

/** The client's own viewport, as the probe read it off a live match. */
const LIVE_VIEWPORT = { x: 0, y: 0, width: 1538, height: 928 };

/**
 * The pan the CLIENT would set to centre this tile.
 *
 * `MapPanningHelper#computeCameraPanFromTile(rx, ry)` is
 * `computeCameraPanFromScreen(IsoCoords.tile3dToScreen(rx+.5, ry+.5, z))`, and
 * `computeCameraPanFromScreen` subtracts `IsoCoords.worldToScreen(0, 0)`. With
 * `Coords.ISO_TILE_SIZE = 30` that leaves exactly this — the world origin drops
 * out of the subtraction. Written from the bundle at v0.83.3 rather than from
 * companion.js, which is the whole point: if the radar's constant moves, this
 * does not follow it.
 */
const panForTile = (rx, ry, z) => ({ x: 30 * (rx - ry), y: 15 * (rx + ry + 1) - 15 * (z || 0) });

function viewportOn(geo, pan, surface, viewport = LIVE_VIEWPORT) {
  const api = loadViewport(geo);
  api.state.combatant = { worldScene: { cameraPan: { getPan: () => pan }, viewport } };
  return api.radarViewportRect(surface);
}

const pickSurface = { width: PICK_W, height: PICK_H };

// A map that is not square, and its own pick buffer.
//
// The fixture everything else here runs on is 100x100, and on a square map
// `mapWidth` and `mapHeight` are the same number -- so swapping one for the
// other in the offset changes nothing and the mutation for it survives. Measured,
// not feared: it did survive, on the first run of these checks.
// See [[fixture-may-not-clip-its-domain]]; this is the same shape, one fixture
// later.
const oblong = {
  fullSize: { width: 90, height: 140 },
  localSize: { x: 5, y: 7, width: 70, height: 120 },
};
const gOblong = HQ.geometry(oblong);
const OBLONG_H = Math.round((PICK_W * gOblong.cropHeight) / gOblong.cropWidth);
const oblongTiles = diamondTiles(oblong);
const oblongPick = HQ.pickBuffer(oblong, PICK_W, OBLONG_H, oblongTiles);
const oblongSurface = { width: PICK_W, height: OBLONG_H };

let oblongMiss = null;
let oblongSeen = 0;
for (const tile of oblongTiles) {
  if (tile.rx % 11 || tile.ry % 9) continue;
  const rect = viewportOn(gOblong, panForTile(tile.rx, tile.ry, 0), oblongSurface);
  const fx = (rect.left + rect.width / 2) / PICK_W;
  const fy = (rect.top + rect.height / 2) / OBLONG_H;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) continue;
  oblongSeen++;
  const got = pickAt(oblongPick, fx, fy);
  if (!got || got.rx !== tile.rx || got.ry !== tile.ry) {
    oblongMiss = `${tile.rx},${tile.ry} -> ${got ? got.rx + "," + got.ry : "off the map"}`;
    break;
  }
}
check(
  "and on a map whose width is not its height",
  oblongSeen > 20 && !oblongMiss,
  oblongMiss || `${oblongSeen} cells on a 90x140 map, each through the pick buffer`
);

// The round trip, over the flat map. A rectangle whose middle does not land on
// the cell the camera was centred on is a box in the wrong place, and at radar
// scale a few tiles of error looks entirely plausible.
let panMiss = null;
let panSeen = 0;
for (const tile of flatTiles) {
  if (tile.rx % 17 || tile.ry % 13) continue; // a grid across the diamond, not a sample of one corner
  const rect = viewportOn(g, panForTile(tile.rx, tile.ry, 0), pickSurface);
  const fx = (rect.left + rect.width / 2) / PICK_W;
  const fy = (rect.top + rect.height / 2) / PICK_H;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) continue; // the camera centre is off the crop
  panSeen++;
  const got = pickAt(flatPick, fx, fy);
  if (!got || got.rx !== tile.rx || got.ry !== tile.ry) {
    panMiss = `${tile.rx},${tile.ry} -> ${got ? got.rx + "," + got.ry : "off the map"}`;
    break;
  }
}
check(
  "the rectangle's middle is the cell the camera is centred on",
  panSeen > 20 && !panMiss,
  panMiss || `${panSeen} cells across the diamond, each through the pick buffer`
);

// And on a cliff. This is the assertion that says the elevation really does
// cancel: our render lifts a cell by 15*z up the picture and the client lifts it
// by the same 15*z in screen space, so a pan taken over a plateau must land on
// the plateau's own cell rather than on the ground two tiles behind it.
let cliffMiss = null;
let cliffSeen = 0;
for (const tile of cliffTiles) {
  if (!tile.z || tile.rx % 3 || tile.ry % 3) continue;
  const rect = viewportOn(g, panForTile(tile.rx, tile.ry, tile.z), pickSurface);
  const fx = (rect.left + rect.width / 2) / PICK_W;
  const fy = (rect.top + rect.height / 2) / PICK_H;
  if (fx < 0 || fx >= 1 || fy < 0 || fy >= 1) continue;
  cliffSeen++;
  const got = pickAt(cliffPick, fx, fy);
  if (!got || got.rx !== tile.rx || got.ry !== tile.ry) {
    cliffMiss = `${tile.rx},${tile.ry} z${tile.z} -> ${got ? got.rx + "," + got.ry : "off the map"}`;
    break;
  }
}
check(
  "and it still is over a plateau, because the elevation cancels",
  cliffSeen > 5 && !cliffMiss,
  cliffMiss || `${cliffSeen} raised cells, each through the pick buffer`
);

// The size. The client's viewport is in the same pixels our render draws in, so
// the box is the viewport scaled by whatever the panel is showing the picture
// at -- and a panel showing the map at half size shows a camera box at half
// size, which is what makes it read as "this much of the map".
const sizedRect = viewportOn(g, panForTile(50, 50, 0), pickSurface);
check(
  "the box is the viewport at the picture's own scale",
  Math.abs(sizedRect.width - LIVE_VIEWPORT.width * (PICK_W / g.cropWidth)) < 0.0001 &&
    Math.abs(sizedRect.height - LIVE_VIEWPORT.height * (PICK_H / g.cropHeight)) < 0.0001,
  "a fixed-size box would claim the same ground however far the panel is dragged"
);

check(
  "and a panel twice as wide draws it twice as wide",
  viewportOn(g, panForTile(50, 50, 0), { width: 2 * PICK_W, height: 2 * PICK_H }).width ===
    2 * sizedRect.width
);

// It is NOT gated by the shroud, and that is the point rather than an omission.
check(
  "the camera box is drawn over ground nobody has scouted",
  !/radarCellVisible|radarShroud/.test(viewportBody),
  "it says where the player's own camera is, which hides nothing -- gating it would be a box that vanishes when you look at the dark"
);

// Every refusal. A rectangle drawn from a pan that could not be read is a box
// sitting confidently in the wrong place, which is worse than no box.
const noCamera = loadViewport(g);
check("out of a match there is no box", noCamera.radarViewportRect(pickSurface) === null);
check(
  "and none without a world scene, a pan or a viewport",
  viewportOn(g, panForTile(50, 50, 0), pickSurface, null) === null &&
    viewportOn(g, panForTile(50, 50, 0), pickSurface, { width: 0, height: 0 }) === null &&
    viewportOn(g, null, pickSurface) === null,
  "each of these is a state the panel really passes through while a match is starting"
);
check(
  "and none from a pan that is not a pair of numbers",
  viewportOn(g, { x: NaN, y: 0 }, pickSurface) === null &&
    viewportOn(g, {}, pickSurface) === null,
  "NaN would stroke nothing and report nothing, which is the failure that takes a match to notice"
);

/** A pen that remembers the one stroke this layer makes. */
function strokePen() {
  const strokes = [];
  let style = null;
  let width = null;
  const ctx = {
    save: () => {},
    restore: () => {},
    set strokeStyle(v) {
      style = v;
    },
    get strokeStyle() {
      return style;
    },
    set lineWidth(v) {
      width = v;
    },
    get lineWidth() {
      return width;
    },
    strokeRect: (x, y, w, h) => strokes.push({ x, y, w, h, style, width }),
  };
  return { ctx, strokes };
}

function strokeOn(pan, surface) {
  const api = loadViewport(g);
  api.state.combatant = { worldScene: { cameraPan: { getPan: () => pan }, viewport: LIVE_VIEWPORT } };
  const pen = strokePen();
  api.drawRadarViewport(pen.ctx, surface);
  return pen.strokes;
}

const stroked = strokeOn(panForTile(50, 50, 0), pickSurface);
check(
  "the box is stroked once, in the annotation colour",
  stroked.length === 1 && stroked[0].style === loadViewport(g).RADAR_VIEWPORT_COLOUR,
  "a solid white box over a bright cliff reads as terrain, which is what this one must not be"
);

check(
  "the line lands inside the ground the camera can see",
  stroked[0].x === sizedRect.left + stroked[0].width / 2 &&
    stroked[0].w === sizedRect.width - stroked[0].width,
  "a canvas stroke straddles its path, so a box drawn at the exact bounds claims half a line of ground on every side"
);

check(
  "the line thickens with the panel but never thins below a pixel",
  strokeOn(panForTile(50, 50, 0), { width: 1600, height: 1200 })[0].width > stroked[0].width &&
    strokeOn(panForTile(50, 50, 0), { width: 120, height: 90 })[0].width === 1,
  "a sub-pixel line is drawn fainter rather than smaller, and reads as dirt"
);

check(
  "out of a match nothing is stroked at all",
  (() => {
    const api = loadViewport(g);
    const pen = strokePen();
    api.drawRadarViewport(pen.ctx, pickSurface);
    return pen.strokes.length === 0;
  })(),
  "the panel is open on the last map played long after the match has ended"
);

// --- the readout ---------------------------------------------------------------

const spoke = drawWith([techno({}), cloakedFoe], scouted).said;
check(
  "the layer says what it drew and what it hid",
  spoke.length === 1 &&
    /radar units: 1 of 2 technos drawn/.test(spoke[0].message) &&
    /1 not drawn \(cloaked/.test(spoke[0].message),
  "a panel with no blips on it cannot otherwise be told from a panel whose gate is stuck shut"
);

// --- interaction, run rather than read ----------------------------------------
//
// The same trick the unit layer gets, for the same reason: a text assertion
// over this section would pass on a handler that orders units on every press,
// and what each button does is the whole feature. So the section is sliced out
// and executed against a stub client, and each button is pressed.
//
// What it can prove without a browser: which client call each press reaches,
// that the tile handed over is the tile under the cursor, that a press over the
// panel never falls through to the game, and that nothing here puts an action on
// the wire itself.

const INTERACT_START = "  // --- interaction ---";
const INTERACT_END = "  // --- the tick ---";
const interactFrom = companion.indexOf(INTERACT_START);
const interactTo = companion.indexOf(INTERACT_END);
if (interactFrom < 0 || interactTo < 0 || interactTo < interactFrom) {
  console.error("could not find the interaction section in companion.js — this check is out of date");
  process.exit(1);
}
const interactBody = companion.slice(interactFrom, interactTo);

// The window's own extent, asserted rather than assumed — the lesson the unit
// window paid for. A function written between these two headers widens the
// slice in silence and every assertion below then covers code it was never
// written for, while the suite goes on printing green.
const interactSections = [...interactBody.matchAll(/^ {2}\/\/ --- (.+?) ---/gm)].map((m) => m[1]);
check(
  "the interaction window holds exactly the sections it is meant to",
  interactSections.join(" | ") === "interaction",
  "found: " + (interactSections.join(" | ") || "no section headers at all")
);

/** The DOM the press is hit-tested against: one canvas, inside one panel. */
const canvasEl = { name: "canvas" };
canvasEl.closest = (sel) => (sel === ".cdc-radar-canvas" ? canvasEl : null);
const foreignEl = { name: "elsewhere", closest: () => null };
const gameEl = { name: "the client's canvas", closest: () => null };
const ourBoxEl = { name: "a box of ours", closest: () => null };
const toggleEl = { name: "the dials button" };
toggleEl.closest = (sel) => (sel === ".cdc-radar-dials-toggle" ? toggleEl : null);
const dialEl = { name: "a dial row", dataset: { dial: "2" }, classList: { contains: () => false } };
dialEl.closest = (sel) => (sel === ".cdc-dial" ? dialEl : null);
// The size row is a `.cdc-dial` too -- same shape, same press path -- and the
// only thing that tells the two apart is the class. Modelled with a `dataset`
// that has no `dial` in it, because that is the real row: routing it by index
// would hand `Number(undefined)` to the appearance dials.
const sizeEl = { name: "the size row", dataset: {}, classList: { contains: (c) => c === "cdc-dial-size" } };
sizeEl.closest = (sel) => (sel === ".cdc-dial" ? sizeEl : null);
const panelEl = {
  contains: (node) => node === canvasEl || node === toggleEl || node === dialEl || node === sizeEl,
};

const CURSOR = { x: 33, y: 44 };
const EVENT_AT = { x: 10, y: 20 };
const CELL = { rx: 7, ry: 9 };

/**
 * Load the section against a stub client and press the mouse on it.
 *
 * `radarCellAt` answers for exactly one point, which is how the press point
 * itself is asserted: a handler that read the frozen event coordinates under a
 * pointer lock gets `null` back and orders nothing.
 */
function press(opts = {}) {
  const said = [];
  const calls = [];
  const swallow = { prevented: 0, stopped: 0 };
  const locked = !!opts.locked;
  const wantPoint = locked ? CURSOR : EVENT_AT;

  // What the press is on: the picture unless the test says otherwise.
  const wantEl =
    opts.on === "toggle"
      ? toggleEl
      : opts.on === "dial"
      ? dialEl
      : opts.on === "size"
      ? sizeEl
      : canvasEl;

  const tiles = {
    getByMapCoords: (rx, ry) => (opts.noTile ? null : { rx, ry, z: 3, name: "tile" }),
  };
  const ui = {
    isSinglePlayer: !!opts.singlePlayer,
    game: { map: { tiles } },
  };
  if (!opts.noBeacon) ui.handleBeacon = (tile) => calls.push({ what: "beacon", tile });
  if (!opts.noClickPath) {
    ui.worldInteraction = {
      isEnabled: () => !opts.disabled,
      executeMinimapClickCommand: (tile, right) => calls.push({ what: "click", tile, right }),
    };
  } else {
    ui.worldInteraction = {};
  }

  const state = { combatant: opts.noMatch ? null : ui };
  const api = new Function(
    "state",
    "note",
    "radarVisible",
    "radarEl",
    "mouseCaptured",
    "underCursor",
    "ourBox",
    "cursorPoint",
    "radarCellAt",
    "toggleRadarDials",
    "pressRadarDial",
    "pressRadarSize",
    interactBody +
      "\n return { radarPress, radarPressTarget, radarPressAction, radarTileAt, radarChromePress, overRadar };"
  )(
    state,
    (message, level) => said.push({ message, level }),
    opts.hidden ? false : true,
    panelEl,
    () => locked,
    () => (locked ? wantEl : null),
    () => false,
    () => CURSOR,
    (point) =>
      point && point.x === wantPoint.x && point.y === wantPoint.y && !opts.offMap ? { ...CELL } : null,
    () => calls.push({ what: "drawer" }),
    (index, at) => calls.push({ what: "dial", index, at }),
    (at) => calls.push({ what: "size", at })
  );

  const event = {
    button: opts.button === undefined ? 0 : opts.button,
    altKey: !!opts.alt,
    clientX: EVENT_AT.x,
    clientY: EVENT_AT.y,
    // Under a lock the event's target is the client's canvas, never ours —
    // which is the whole reason the locked path hit-tests by hand.
    target: locked || opts.off ? foreignEl : wantEl,
    preventDefault: () => swallow.prevented++,
    stopPropagation: () => swallow.stopped++,
  };

  const mine = api.radarPress(event);
  return { mine, calls, said, swallow, api, event };
}

const clicks = (r) => r.calls.filter((c) => c.what === "click");
const beacons = (r) => r.calls.filter((c) => c.what === "beacon");

// The gate. Everything below is about which call and with what; this is that
// there is one at all.
const left = press({ button: 0 });
check(
  "a left press orders through the client's own minimap path",
  clicks(left).length === 1 && clicks(left)[0].right === false,
  "the radar does nothing at all if this fails, and half the checks below would still pass"
);

check(
  "and it hands over the tile under the cursor, not a tile of its own",
  clicks(left).length === 1 &&
    clicks(left)[0].tile.rx === CELL.rx &&
    clicks(left)[0].tile.ry === CELL.ry &&
    clicks(left)[0].tile.name === "tile",
  "the client reads z, landType and the tile's own identity off it"
);

const right = press({ button: 2 });
check(
  "a right press goes down the same path, flagged as the right button",
  clicks(right).length === 1 && clicks(right)[0].right === true,
  "the client's own option decides which button orders and which pans — that flag is the whole input"
);

const ping = press({ button: 2, alt: true });
check(
  "Alt with the right button drops a beacon instead",
  beacons(ping).length === 1 && clicks(ping).length === 0,
  "one click and one modifier, which is the point of doing it here rather than through PlaceBeacon's mode"
);

check(
  "and the beacon lands on the tile that was clicked",
  beacons(ping).length === 1 && beacons(ping)[0].tile.rx === CELL.rx && beacons(ping)[0].tile.ry === CELL.ry
);

const altLeft = press({ button: 0, alt: true });
check(
  "Alt with the left button is left to the client",
  clicks(altLeft).length === 1 && beacons(altLeft).length === 0,
  "Alt+left is force-move in this game, and shadowing it would be a worse clone than having no beacon"
);

const middle = press({ button: 1 });
check(
  "a middle press does nothing — and is still swallowed",
  middle.mine === true && middle.calls.length === 0 && middle.swallow.stopped === 1,
  "the client reads a stray mousedown as a world command"
);

// The locked mouse is the state a match is actually played in, and it is the
// one where every coordinate on the event is frozen.
const lockedPress = press({ button: 0, locked: true });
check(
  "under a pointer lock the press is aimed at the cursor the player can see",
  clicks(lockedPress).length === 1,
  "the event's own coordinates freeze the moment the client takes the mouse, and the stub answers for one point only"
);

const off = press({ button: 0, off: true });
check(
  "a press that is not on the picture is not ours",
  off.mine === false && off.swallow.stopped === 0 && off.calls.length === 0,
  "the bar and the letterbox margin are what the panel is dragged by, and the drag path is downstream of this"
);

const hidden = press({ button: 0, hidden: true });
check(
  "and neither is a press while the panel is closed",
  hidden.mine === false && hidden.calls.length === 0,
  "the listener is shared with four other panels and outlives this one"
);

const offMap = press({ button: 0, offMap: true });
check(
  "a press on the canvas but off the map is swallowed and does nothing",
  offMap.mine === true && offMap.swallow.stopped === 1 && offMap.calls.length === 0,
  "the letterbox margin is on the canvas; an order there would be an order at a cell the buffer has no id for"
);

const noTile = press({ button: 0, noTile: true });
check(
  "a cell the client has no tile for orders nothing",
  noTile.mine === true && noTile.calls.length === 0,
  "getByMapCoords is the only source of the tile — a hand-made one would be wrong in three places"
);

const noMatch = press({ button: 0, noMatch: true });
check(
  "and neither does a press with no match in play",
  noMatch.mine === true && noMatch.calls.length === 0,
  "the panel outlives the match: CombatantUi is nulled on dispose"
);

const solo = press({ button: 2, alt: true, singlePlayer: true });
check(
  "a beacon in a skirmish is refused out loud rather than silently dropped",
  beacons(solo).length === 0 && solo.said.length === 1 && /skirmish/.test(solo.said[0].message),
  "handleBeacon begins `this.isSinglePlayer ||`, so the gesture would simply do nothing"
);

const soloTwice = press({ button: 2, alt: true, singlePlayer: true });
soloTwice.api.radarPress(soloTwice.event);
check(
  "and it says so once, not once per press",
  soloTwice.said.length === 1,
  "a refusal repeated on every click is a log nobody reads"
);

const noPath = press({ button: 0, noClickPath: true });
check(
  "a client whose minimap click path moved is reported, not guessed at",
  noPath.calls.length === 0 && noPath.said.length === 1 && noPath.said[0].level === "warn",
  "a hand-rolled order as a fallback would be the three-bug reimplementation this section exists to avoid"
);

const disabled = press({ button: 0, disabled: true });
check(
  "and a world interaction that is switched off takes no orders",
  disabled.calls.length === 0,
  "isEnabled goes false while the client is not taking orders — an order then is an order into a finished match"
);

// Text, because the absence of a thing cannot be executed.
check(
  "the section never puts an action on the wire itself",
  !/pushAction\(|pushOrder\(/.test(interactBody),
  "the selection-sync action, the dedupe and the acknowledgement sound are the client's to get right, and a pan must not reach the wire at all"
);

const swallowAt = interactBody.indexOf("e.stopPropagation();");
const decideAt = interactBody.indexOf("const action = radarPressAction(e);");
check(
  "a press is swallowed before anything is decided about it",
  swallowAt !== -1 && decideAt !== -1 && swallowAt < decideAt,
  "every refusal after that point is a press that does nothing rather than a press that reaches the game"
);

// --- the in-game dials ---------------------------------------------------------
//
// The options page owns the canonical controls; this is the mirror over the live
// radar. Two things about it are rules rather than choices, and both are
// asserted by running the section rather than by reading it:
//
//   - **which dials are in the drawer** — exactly those that change a live
//     picture and leave every stored render alone. That is checkable: move all
//     of them to an extreme and the tune stamp must still be empty;
//   - **a dial is a track you click**, because under the client's pointer lock
//     nothing in the DOM can be dragged, focused or scrolled to. So the
//     arithmetic from a viewport point to a value is ours, and it is the part
//     that can be wrong by a whole panel width.

const DIALS_START = "  // --- the dials ---";
const DIALS_END = "  // --- interaction ---";
const dialsFrom = companion.indexOf(DIALS_START);
const dialsTo = companion.indexOf(DIALS_END);
if (dialsFrom < 0 || dialsTo < 0 || dialsTo < dialsFrom) {
  console.error("could not find the dials section in companion.js — this check is out of date");
  process.exit(1);
}
const dialsBody = companion.slice(dialsFrom, dialsTo);

const dialSections = [...dialsBody.matchAll(/^ {2}\/\/ --- (.+?) ---/gm)].map((m) => m[1]);
check(
  "the dials window holds exactly the sections it is meant to",
  dialSections.join(" | ") === "the dials",
  "found: " + (dialSections.join(" | ") || "no section headers at all")
);

/**
 * The section, against a stub panel.
 *
 * Each dial's track is placed 1000px further right than the last, so a point
 * that reads as the middle of one dial reads as off the end of every other —
 * which is how "the row that was pressed is the row that moved" is asserted at
 * all without a browser.
 */
function loadDials(appearance = {}, stageHeight = 200) {
  const posted = [];
  const painted = [];
  const looks = [];
  const sized = [];
  const placed = [];
  const trackAt = (index) => ({ left: 100 + index * 1000, width: 200 });
  const box = {
    // Closed to begin with, because `radarDialsOpen` is — and the stage below
    // reads this to know whether the drawer is eating its height.
    style: { display: "none" },
    textContent: "",
    childElementCount: 0,
    append: () => {},
    querySelector: () => null,
  };
  // The flex column, modelled rather than frozen. `.cdc-radar-stage` is
  // `flex: 1`, so the instant `renderRadarDials` un-hides the drawer the stage
  // is DRAWER pixels shorter — and a `toggleRadarDials` that read the stage
  // after drawing the drawer would preserve that shrunken number. A stub with a
  // constant `clientHeight` cannot tell the two apart and would pass either way;
  // this one fails the wrong order.
  const DRAWER = 84;
  let column = stageHeight;
  const stage = {
    // `getBoundingClientRect`, because that is what the real `toggleRadarDials`
    // asks: `clientHeight` rounds a fractional layout and a stub that answered
    // it would let a rounding bug through.
    getBoundingClientRect() {
      return { height: column - (box.style.display === "none" ? 0 : DRAWER) };
    },
  };
  const radarEl = {
    querySelector: (sel) => {
      if (sel === ".cdc-radar-dials") return box;
      if (sel === ".cdc-radar-stage") return stage;
      if (sel === ".cdc-radar-dials-toggle") return { classList: { toggle: () => {} } };
      const m = /data-dial="(\d+)"/.exec(sel);
      if (m && sel.includes(".cdc-dial-track")) return { getBoundingClientRect: () => trackAt(Number(m[1])) };
      return null;
    },
  };
  const state = { appearance };
  const api = new Function(
    "state",
    "window",
    "document",
    "radarEl",
    "repaintAppearance",
    "paintRadar",
    "placeRadarCanvas",
    "sizeRadarPanel",
    "placeRadarFromAnchor",
    dialsBody +
      "\n return { radarDialList, radarDialValue, radarDialAt, radarDialRead, radarDialPatch," +
      " pressRadarDial, toggleRadarDials, renderRadarDials };"
  )(
    state,
    {
      __cdcTune: TUNE,
      __cdcHq: { setLook: (look) => looks.push(look) },
      postMessage: (message) => posted.push(message),
    },
    {
      createElement: () => ({
        style: {},
        dataset: {},
        classList: { toggle: () => {} },
        append: () => {},
        querySelector: () => ({ style: {}, textContent: "" }),
      }),
    },
    radarEl,
    () => painted.push("root"),
    () => painted.push("radar"),
    () => painted.push("place"),
    (h) => {
      sized.push(h);
      // What the real one does: the panel is grown to hold the drawer, so the
      // stage is left at exactly the height it was handed.
      column = h + (box.style.display === "none" ? 0 : DRAWER);
      return { before: 0, after: 0 };
    },
    () => placed.push(box.style.display === "none" ? "shut" : "open")
  );
  return { ...api, state, posted, painted, looks, sized, placed, stage, drawer: DRAWER };
}

const dialApi = loadDials();
const dialList = dialApi.radarDialList();

check(
  "every dial takes its range from the shared table",
  dialList.length > 0 &&
    dialList.every((d) => Array.isArray(d.range) && Object.values(TUNE.LIMITS).includes(d.range)),
  "a range written out here is how one surface starts allowing what the other forbids"
);

// The rule the drawer exists under, and the reason it is a short list.
// Each dial is driven to the end **furthest from its own default**, not simply
// to its maximum: `oreAlpha` defaults to 1, which is also its top, so a probe
// that took the top would have moved it nowhere and the rule below would have
// held for a dial that bakes. That is exactly what a mutation adding it to the
// drawer proved -- it survived a check that looked right.
const farEnd = (dial) => {
  const home = dialApi.radarDialRead(dial, TUNE.DEFAULT_TUNE);
  return home - dial.range[0] > dial.range[1] - home ? dial.range[0] : dial.range[1];
};
const allMoved = dialList.reduce(
  (look, dial) => dialApi.radarDialPatch(look, dial, farEnd(dial)),
  TUNE.normalise({})
);
check(
  "moving every dial in the drawer leaves no stored render stale",
  TUNE.tuneKey(allMoved) === "",
  "that is what makes these the mid-match dials: `" + TUNE.tuneKey(allMoved) + "` would be a pool re-render"
);

check(
  "and the drawer really did move all of them",
  JSON.stringify(allMoved) !== JSON.stringify(TUNE.normalise({})),
  "a patch that changed nothing would pass the stamp check for the wrong reason"
);

const B = TUNE.LIMITS.brightness;
check(
  "the far ends of a track are the ends of the range",
  dialApi.radarDialValue(B, 0) === B[0] && dialApi.radarDialValue(B, 1) === B[1],
  "a dial that cannot reach its own limits is a narrower dial than the options page's"
);

check(
  "a point past either end is held at that end",
  dialApi.radarDialValue(B, -3) === B[0] && dialApi.radarDialValue(B, 9) === B[1],
  "the press is aimed with a cursor the player often cannot see"
);

check(
  "the middle of a track is the middle of the range, on the step",
  dialApi.radarDialValue(B, 0.5) === 1.1,
  "got " + dialApi.radarDialValue(B, 0.5)
);

check(
  "and a value is a number a person could have chosen",
  [0, 0.13, 0.37, 0.62, 0.88, 1].every((f) => {
    const v = dialApi.radarDialValue(B, f);
    return Math.abs(Math.round(v * 20) - v * 20) < 1e-9;
  }),
  "0.30000000000000004 is a true answer and an unreadable readout"
);

check(
  "a dial's fill says where its value sits",
  dialApi.radarDialAt(dialList[0], TUNE.normalise({ all: { brightness: B[0], contrast: 1 } })) === 0 &&
    dialApi.radarDialAt(dialList[0], TUNE.normalise({ all: { brightness: B[1], contrast: 1 } })) === 1,
  "the fill is the only thing on the row that says what the value is before you read the number"
);

// --- a press on a dial ---------------------------------------------------------

const pressed = loadDials();
// x = 200 is the middle of dial 0's own track and nowhere near any other's.
pressed.pressRadarDial(0, { x: 200, y: 0 });
check(
  "a press on a track sets that dial to where it landed",
  pressed.state.appearance.all.brightness === 1.1,
  "got " + JSON.stringify(pressed.state.appearance.all)
);

check(
  "and leaves the rest of the table exactly as it was",
  JSON.stringify({ ...pressed.state.appearance, all: null }) ===
    JSON.stringify({ ...TUNE.normalise({}), all: null }),
  "the whole table is written back, so a patch that touched a second field would ship it"
);

const byIndex = loadDials();
byIndex.pressRadarDial(1, { x: 1200, y: 0 });
check(
  "the row that was pressed is the row that moves",
  byIndex.state.appearance.all.contrast === 1.1 && byIndex.state.appearance.all.brightness === 1,
  "each stub track sits 1000px past the last, so a point read off the wrong row lands off its end"
);

const missed = loadDials();
missed.pressRadarDial(1, { x: 200, y: 0 });
check(
  "a point off a dial's own track is held at that track's near end",
  missed.state.appearance.all.contrast === TUNE.LIMITS.contrast[0],
  "clamped rather than refused: the panel is aimed at, and a press that did nothing would read as a dead dial"
);

const reset = loadDials({ all: { brightness: 2, contrast: 2 } });
reset.pressRadarDial(0, null);
check(
  "the right button puts a dial back to its default",
  reset.state.appearance.all.brightness === TUNE.DEFAULT_TUNE.all.brightness &&
    reset.state.appearance.all.contrast === 2,
  "no position is read from that press at all, which is why it carries none"
);

const nothing = loadDials();
const before = JSON.stringify(nothing.state.appearance);
nothing.pressRadarDial(99, { x: 200, y: 0 });
check(
  "a dial that does not exist moves nothing",
  JSON.stringify(nothing.state.appearance) === before,
  "the index comes off a DOM attribute, which is a string from outside this file"
);

check(
  "a moved dial is written out on the same channel the preferences use",
  pressed.posted.length === 1 &&
    pressed.posted[0].type === "appearance-set" &&
    pressed.posted[0].source === "cdc-page" &&
    pressed.posted[0].appearance.all.brightness === 1.1,
  "the options page and every stored render read this table from storage, not from the tab"
);

check(
  "and every surface in this tab is repainted before the write goes out",
  pressed.painted.includes("root") && pressed.painted.includes("radar") && pressed.looks.length === 1,
  "the echo of our own write is gated on the value having changed, so it will not do this for us"
);

const opened = loadDials();
opened.toggleRadarDials();
check(
  "opening the drawer re-letterboxes the picture",
  opened.painted.includes("place") && opened.painted.includes("radar"),
  "the stage should come out the size it went in, but the clamp can still move it and the observer only fires on a change"
);

// --- the drawer adds space, it does not take it ------------------------------
//
// The user's ask, at the tier that can run without a browser: the height handed
// to `sizeRadarPanel` is the one the stage had BEFORE the drawer was drawn. The
// stub above models `flex: 1`, so a toggle that read the stage afterwards would
// hand over 200 - 84 here and this would say so.

check(
  "opening the drawer re-sizes the panel around the height the map already had",
  opened.sized.length === 1 && opened.sized[0] === 200,
  "handed " + JSON.stringify(opened.sized) + " — 116 is the stage measured after the drawer took its bite"
);

check(
  "so the map is the same size with the drawer open",
  opened.stage.getBoundingClientRect().height === 200,
  "stage is " + opened.stage.getBoundingClientRect().height + "px"
);

// The half of item 5 this subsumes. The panel just changed height and the stage
// did not, so the ResizeObserver on the stage does not fire — nothing else would
// re-place the box, and a bottom-anchored panel would grow its own foot off the
// bottom of the screen. Ordered after the resize, because placement measures the
// panel it is placing.
check(
  "and the panel is re-placed from its anchor, so an open drawer grows upwards",
  opened.placed.length === 1 && opened.sized.length === 1,
  "placed " + JSON.stringify(opened.placed) + " after " + JSON.stringify(opened.sized) +
    " — a toggle that never re-places pushes a bottom-anchored panel off screen by the drawer's height"
);

opened.toggleRadarDials();
check(
  "and closing it gives the picture back unchanged, not doubled",
  opened.sized.length === 2 && opened.sized[1] === 200 && opened.stage.getBoundingClientRect().height === 200,
  "handed " + JSON.stringify(opened.sized) + ", stage " + opened.stage.getBoundingClientRect().height
);

// --- and the write reaches storage --------------------------------------------

const bridge = readFileSync(join(src, "bridge.js"), "utf8");
check(
  "the bridge takes the write and stores the table whole",
  /data\.type === "appearance-set"/.test(bridge) && /write\(\{ appearance \}/.test(bridge),
  "the page half cannot reach chrome.storage, so an unhandled message is a dial that moves and forgets"
);

// --- the same beacon, out in the world -----------------------------------------
//
// The gesture the user asked for twice: Alt with the right button, one click,
// and **the selection survives**. The client deselects on the press, so this is
// a window-capture `mousedown` handler and nothing else would do — which makes
// what it declines as load-bearing as what it takes. Every press it does not
// answer has to reach the client, or an ordinary right click stops deselecting.

const HOVER_TILE = { rx: 61, ry: 12, z: 1, name: "hovered" };

function worldPress(opts = {}) {
  const said = [];
  const calls = [];
  const swallow = { prevented: 0, stopped: 0 };
  const locked = !!opts.locked;

  const ui = {
    isSinglePlayer: !!opts.singlePlayer,
    handleBeacon: (tile) => calls.push({ what: "beacon", tile }),
    game: { map: { tiles: { getByMapCoords: () => ({ rx: 0, ry: 0, name: "not the hover" }) } } },
    worldInteraction: {
      isEnabled: () => !opts.disabled,
      executeMinimapClickCommand: (tile, right) => calls.push({ what: "click", tile, right }),
    },
  };
  // Present but answering `undefined` when `noHover` -- the state a cursor off
  // the map is really in. Absent only for `noHoverApi`, which is a client whose
  // method moved: two different refusals, and a stub that conflated them let a
  // mutation through.
  if (!opts.noHoverApi) {
    ui.worldInteraction.getCurrentHover = () =>
      opts.noHover ? undefined : { entity: undefined, gameObject: undefined, tile: HOVER_TILE };
  }

  const state = { combatant: opts.noMatch ? null : ui };
  const api = new Function(
    "state",
    "note",
    "radarVisible",
    "radarEl",
    "mouseCaptured",
    "underCursor",
    "ourBox",
    "cursorPoint",
    "radarCellAt",
    interactBody + "\n return { worldPing };"
  )(
    state,
    (message, level) => said.push({ message, level }),
    true,
    panelEl,
    () => locked,
    () => (opts.ourBox ? ourBoxEl : gameEl),
    (target) => target === ourBoxEl,
    () => CURSOR,
    () => ({ ...CELL })
  );

  const event = {
    button: opts.button === undefined ? 2 : opts.button,
    altKey: opts.alt === undefined ? true : !!opts.alt,
    ctrlKey: !!opts.ctrl,
    shiftKey: !!opts.shift,
    metaKey: !!opts.meta,
    clientX: EVENT_AT.x,
    clientY: EVENT_AT.y,
    target: opts.ourBox && !locked ? ourBoxEl : gameEl,
    preventDefault: () => swallow.prevented++,
    stopPropagation: () => swallow.stopped++,
  };

  return { took: api.worldPing(event), calls, said, swallow };
}

const worldBeacon = worldPress();
check(
  "Alt with the right button drops a beacon out in the world",
  worldBeacon.took === true && worldBeacon.calls.length === 1 && worldBeacon.calls[0].what === "beacon",
  "the user asked for this one twice — on the radar and in the game itself"
);

check(
  "on the tile the client says the cursor is over",
  worldBeacon.calls.length === 1 && worldBeacon.calls[0].tile === HOVER_TILE,
  "getCurrentHover is maintained under the pointer lock, where every DOM coordinate is frozen"
);

check(
  "and the press never reaches the client, which is what keeps the selection",
  worldBeacon.swallow.stopped === 1 && worldBeacon.swallow.prevented === 1,
  "the deselect is on the mousedown itself: `2 === e.button && (... || deselectAll())`"
);

const lockedPing = worldPress({ locked: true });
check(
  "the same under a pointer lock, which is where a match is played",
  lockedPing.took === true && lockedPing.calls.length === 1,
  "nothing here converts a screen point, so the lock changes only which element is asked about"
);

const plainRight = worldPress({ alt: false });
check(
  "an ordinary right click is left alone",
  plainRight.took === false && plainRight.swallow.stopped === 0 && plainRight.calls.length === 0,
  "swallowing it would take the client's own deselect with it"
);

const altLeftWorld = worldPress({ button: 0 });
check(
  "and so is Alt with the left button",
  altLeftWorld.took === false && altLeftWorld.swallow.stopped === 0,
  "Alt+left is force-move in this game"
);

const altCtrl = worldPress({ ctrl: true });
check(
  "a modifier combination this did not take is not taken",
  altCtrl.took === false && altCtrl.swallow.stopped === 0,
  "Ctrl+Alt is guard-area in the client, and reading Alt loosely would shadow it"
);

const onPanel = worldPress({ ourBox: true });
check(
  "a press over one of our own boxes is left to that box",
  onPanel.took === false && onPanel.calls.length === 0,
  "the radar's own handler aims at the cell that was clicked, not at the tile behind the panel"
);

const onPanelLocked = worldPress({ ourBox: true, locked: true });
check(
  "including under a lock, where the event's target is the client's canvas",
  onPanelLocked.took === false && onPanelLocked.calls.length === 0,
  "`e.target` is useless in that state — the hit test is done at the cursor the player can see"
);

const noHoverApi = worldPress({ noHoverApi: true });
check(
  "a client with no hover to ask is left alone",
  noHoverApi.took === false && noHoverApi.swallow.stopped === 0 && noHoverApi.calls.length === 0,
  "getCurrentHover is the only source of the tile, so a client without it has no gesture"
);

const noHover = worldPress({ noHover: true });
check(
  "a press with no tile under it is left alone rather than eaten",
  noHover.took === false && noHover.swallow.stopped === 0 && noHover.calls.length === 0,
  "a gesture that cannot be answered has to fall through, or right-clicking off the map stops working"
);

const offWorld = worldPress({ disabled: true });
check(
  "and so is one while the client is not taking interaction",
  offWorld.took === false && offWorld.swallow.stopped === 0
);

const noGame = worldPress({ noMatch: true });
check(
  "with no match in play there is nothing to ping",
  noGame.took === false && noGame.calls.length === 0,
  "this listener is installed at boot and outlives every match"
);

const worldPingBody = between("function worldPing(e) {", "  // --- the tick");
check(
  "the world beacon converts no screen point of its own",
  worldPingBody !== "" && !/clientX|clientY|radarPressPoint|radarCellAt/.test(worldPingBody),
  "the client's own hover is the answer, and it is the only one that is right under a pointer lock"
);

const mouseDownBody = between("let mouseHeld = null;", "// The rest of a press this extension has taken.");
check(
  "the beacon is offered the press before the button filter",
  mouseDownBody.indexOf("worldPing(e)") !== -1 &&
    mouseDownBody.indexOf("worldPing(e)") < mouseDownBody.indexOf("ourButton(e.button)"),
  "`ourButton` returns left and right on untouched, and this gesture is on the right one"
);

check(
  "and the rest of that press is swallowed with it",
  /worldPing\(e\)\) \{\s*mouseHeld = e\.button;/.test(mouseDownBody),
  "a browser acts on a button at the end of a click, and the client on the release of a drag"
);

check(
  "the listener that offers it is a capture-phase one",
  /,\s*true\s*\);$/.test(mouseDownBody.trim()),
  "on the bubble it would fire after the client had already deselected"
);

// --- the panel's own furniture ---------------------------------------------------
//
// The drawer and the button that opens it are DOM, and under the client's
// pointer lock DOM cannot be clicked at all — so they are routed by the same
// hand hit test the picture is, and that routing is the only reason either works
// during a match.

const drawerPress = press({ on: "toggle" });
check(
  "a press on the bar's button opens the drawer",
  drawerPress.mine === true &&
    drawerPress.calls.length === 1 &&
    drawerPress.calls[0].what === "drawer" &&
    drawerPress.swallow.stopped === 1,
  "under a pointer lock this element cannot be clicked, which is the only state anyone wants it in"
);

const dialPress = press({ on: "dial" });
check(
  "a press on a dial carries the row and where along it the press landed",
  dialPress.calls.length === 1 &&
    dialPress.calls[0].what === "dial" &&
    dialPress.calls[0].index === 2 &&
    dialPress.calls[0].at.x === EVENT_AT.x,
  "the index comes off the row's own attribute, and the point is what the value is read from"
);

const dialLocked = press({ on: "dial", locked: true });
check(
  "and under a lock it is the cursor's position, not the event's",
  dialLocked.calls.length === 1 && dialLocked.calls[0].at.x === CURSOR.x,
  "every coordinate on the event froze when the client took the mouse"
);

const dialReset = press({ on: "dial", button: 2 });
check(
  "the right button on a dial carries no position at all",
  dialReset.calls.length === 1 && dialReset.calls[0].at === null,
  "it is the put-this-back press, and a position read from it would move the dial instead"
);

// The size row is the control the requirement names, and it is a `.cdc-dial`
// like the five above it -- so what tells them apart is worth running. The two
// arms are the same press on the two rows: one has to reach the panel's scale
// and the other the render's appearance, and a router that could not tell them
// apart would hand `Number(undefined)` to the appearance dials.

const sizePress = press({ on: "size", locked: true });
check(
  "a press on the size row sets the panel's scale, not one of the render's dials",
  sizePress.mine === true &&
    sizePress.calls.length === 1 &&
    sizePress.calls[0].what === "size" &&
    sizePress.calls[0].at.x === CURSOR.x,
  JSON.stringify(sizePress.calls) +
    " — under a lock the point is the cursor's, because every coordinate on the event froze when the client took the mouse"
);

const sizeReset = press({ on: "size", button: 2 });
check(
  "and the right button on it carries no position, so it puts the size back",
  sizeReset.calls.length === 1 && sizeReset.calls[0].what === "size" && sizeReset.calls[0].at === null,
  JSON.stringify(sizeReset.calls) + " — a position read from it would resize instead of restoring"
);

const dialMiddle = press({ on: "dial", button: 1 });
check(
  "a middle press on a dial is not the drawer's",
  dialMiddle.mine === false && dialMiddle.calls.length === 0,
  "two buttons mean something here and the third has to fall through to the panel's own drag"
);

const toggleRight = press({ on: "toggle", button: 2 });
check(
  "and neither is a right press on the button that opens it",
  toggleRight.mine === false && toggleRight.calls.length === 0,
  "there is nothing for it to put back"
);

check(
  "a press on the picture is not furniture",
  press({ button: 0 }).api.radarChromePress({ button: 0, target: canvasEl, preventDefault() {}, stopPropagation() {} }) === false,
  "the furniture is asked first, so a yes here would swallow every order"
);

const overs = press({ button: 0 }).api;
check(
  "the panel knows a press anywhere on it from one off it",
  overs.overRadar({ target: canvasEl }) === true && overs.overRadar({ target: foreignEl }) === false,
  "this is what decides whether the browser's own menu is swallowed"
);

// --- the press reaches the section at all --------------------------------------

const panelDownAt = companion.indexOf("function onPanelMouseDown(e) {");
const panelDown =
  panelDownAt === -1 ? "" : companion.slice(panelDownAt, companion.indexOf("function toggleQueues(", panelDownAt));
// The needle is the CONDITION, not a whole statement: the guard grew a body when
// each exit started recording which step it is, and an assertion pinned to
// `if (!mouseCaptured()) return;` went red over a reformat that moved nothing.
// Both indexes are required to exist, so a needle that stops matching fails
// closed rather than comparing against -1 by accident.
const radarFirstAt = panelDown.indexOf("radarPress(e)");
const lockGuardAt = panelDown.indexOf("if (!mouseCaptured())");
check(
  "the shared mousedown offers the press to the radar first",
  radarFirstAt !== -1 && lockGuardAt !== -1 && radarFirstAt < lockGuardAt,
  "behind the lock check the radar would be clickable only while a match is NOT being played"
);

const menuAt = companion.indexOf("function onOverlayContextMenu(e) {");
const menuBody = menuAt === -1 ? "" : companion.slice(menuAt, companion.indexOf("}", companion.indexOf("stopPropagation", menuAt)));
check(
  "the browser's menu is swallowed over the radar as well as over the grid",
  menuBody.includes("overRadar(e)"),
  "the right button means something on the picture and on a dial, and a menu over either is nobody's intention"
);

const syncAt = companion.indexOf("function syncOverlayMouse() {");
const syncBody = syncAt === -1 ? "" : companion.slice(syncAt, companion.indexOf("let hoveredTile", syncAt));
check(
  "and that listener is installed while a panel is up",
  (syncBody.match(/contextmenu/g) || []).length === 2,
  "added and removed in the same function, or it leaks past the panel that wanted it"
);

// --- the paint order ------------------------------------------------------------

const iconsCallAt = paintFull.indexOf("drawRadarIcons(ctx, canvas, window.__cdcGlyphs);");
const unitsCallAt = paintFull.indexOf("drawRadarUnits(ctx, canvas, look, tune);");
const viewportCallAt = paintFull.indexOf("drawRadarViewport(ctx, canvas);");
check(
  "the camera box goes on after the cover, and last",
  viewportCallAt !== -1 && viewportCallAt > coverCallAt,
  "under the cover it would be a box that disappears wherever the player has not scouted, which is where it is most useful"
);

check(
  "the pictograms go on after the blips and before the cover",
  iconsCallAt !== -1 && iconsCallAt > unitsCallAt && iconsCallAt < coverCallAt,
  "a glyph is drawn far wider than the cell it marks, and the cover is what clips the overhang"
);

check(
  "the blips go on after the terrain and before the cover",
  unitsCallAt !== -1 && unitsCallAt > blitAt && unitsCallAt < coverCallAt,
  "a dot is drawn wider than its cell, and the cover is what clips the overhang back to scouted ground"
);

check(
  "and the units tick is the outer one",
  /radarTicks % RADAR_SWEEP_EVERY === 0 \? sweepRadarShroud\(\) : false/.test(tickBody) &&
    /window\.setTimeout\(radarSweepTick, RADAR_TICK_MS\)/.test(tickBody),
  "one pass over every cell of the map cannot run at the rate a blip has to move"
);

// --- the credits in the bar --------------------------------------------------
//
// The panel's title used to be the word "Radar", which is furniture: the panel
// is unmistakably a radar, and the number it now shows instead is invisible
// whenever the client's own interface is hidden. Executed rather than
// pattern-matched, because the whole of it is a fallback and a format, and both
// are the kind of thing a regex agrees with while the bar says "undefined".

const creditsBody = between("function syncRadarCredits() {", "\n  }");

function readBar(player) {
  let text = "Radar";
  const title = {
    get textContent() {
      return text;
    },
    set textContent(v) {
      text = v;
    },
  };
  const radarEl = { querySelector: (sel) => (sel === ".cdc-radar-title" ? title : null) };
  const state = { combatant: player === null ? null : { player } };
  new Function("radarEl", "state", creditsBody + "\n }\n syncRadarCredits();")(radarEl, state);
  return text;
}

check(
  "the bar shows the player's credits",
  readBar({ credits: 7350 }) === "7350",
  "got: " + readBar({ credits: 7350 })
);

check(
  "a fractional balance is floored rather than printed as a decimal",
  readBar({ credits: 1234.7 }) === "1234",
  "the client spends credits per tick, so the raw number is not always whole — got: " + readBar({ credits: 1234.7 })
);

check(
  "and outside a match the bar names the panel instead",
  readBar(null) === "Radar",
  "a bar reading 0 before a game starts looks like a readout that is broken rather than one with nothing to say"
);

check(
  "a player with no credits reads as 0, not as the label",
  readBar({ credits: 0 }) === "0",
  "being broke is a number, and it is the number a player most wants to see"
);

check(
  "the readout tick is what drives it",
  /syncRadarCredits\(\);/.test(between("function syncRadarReadout()", "function syncRadarCredits")),
  "a title that updates on nothing is the word Radar with extra steps"
);

// --- the drawn cursor stacks above the panels --------------------------------
//
// The client draws its cursor INTO its canvas, so under a pointer lock every box
// of ours covers the only cursor there is. `drawCursor` puts one back -- and it
// is drawn only when the hit test says the cursor is over one of our boxes,
// which means the one place it ever appears is on top of a panel.
//
// It sat at z-index 6 while the radar sits at 100002, so the cursor that exists
// to be seen over a panel was painted BEHIND it, showing through a 72%-opaque
// background as a smudge. Reported exactly that way: "as if under the overlay".
// A number, not a rule, so a number is what is asserted.

const css = readFileSync(join(src, "companion.css"), "utf8");
const zOf = (selector) => {
  const at = css.indexOf(selector + " {");
  if (at === -1) return null;
  const block = css.slice(at, css.indexOf("}", at));
  const m = /z-index:\s*(\d+)/.exec(block);
  return m ? Number(m[1]) : null;
};

const zCursor = zOf(".cdc-cursor");
const zRadar = zOf(".cdc-radar");

check(
  "the drawn cursor and the radar both declare a stacking order",
  typeof zCursor === "number" && typeof zRadar === "number",
  `cursor ${zCursor}, radar ${zRadar}`
);

check(
  "and the cursor stacks above the panel it is drawn over",
  zCursor > zRadar,
  `a cursor under the box it exists to be seen over is invisible — cursor ${zCursor} vs radar ${zRadar}`
);

// --- the radar goes dark when the player has no radar --------------------------
//
// The client covers its own minimap the moment `player.radarTrait.isDisabled()`
// is true -- no radar building, power at Low, or an enemy Lightning Storm. Ours
// draws from our own render and so would keep the picture the game has just
// taken away, which is the maphack constraint this panel exists under rather
// than a preference about what to show.
//
// Both halves are RUN, not read. A text assertion over either would pass on a
// gate that reads the flag and ignores it, and the second half -- "only a change
// re-renders" -- is a claim about how many times a function was called, which no
// regex can see.

const offlineAt = companion.indexOf("  function radarOffline() {");
const offlineEnd = offlineAt === -1 ? -1 : companion.indexOf("  function renderRadar() {", offlineAt);
const tickAt = companion.indexOf("  function radarSweepTick() {");
const tickEnd = tickAt === -1 ? -1 : companion.indexOf("  function syncRadarSweep() {", tickAt);
const lastDecl = /^ {2}let radarOfflineLast = .*;$/m.exec(companion);
if (offlineEnd < 0 || tickEnd < 0 || !lastDecl) {
  console.error("could not find radarOffline, radarSweepTick or radarOfflineLast in companion.js — this check is out of date");
  process.exit(1);
}
const offlineSrc = companion.slice(offlineAt, offlineEnd);
const tickSrc = companion.slice(tickAt, tickEnd);

/** The gate itself, against one stub combatant. */
const offlineFor = (combatant) =>
  new Function("state", offlineSrc + "\n return radarOffline();")({ combatant });

const radarUp = { player: { radarTrait: { isDisabled: () => false } } };
const radarDown = { player: { radarTrait: { isDisabled: () => true } } };

check(
  "out of a match the panel is not gated at all",
  offlineFor(null) === "",
  "the panel outlives the match as a viewer over the last map played — there is no flag to read and nothing to hide: got " +
    JSON.stringify(offlineFor(null))
);

check(
  "a player whose radar is up gets the picture",
  offlineFor(radarUp) === "",
  "got " + JSON.stringify(offlineFor(radarUp))
);

const wentDark = offlineFor(radarDown);
check(
  "and a player the client has taken the minimap from is refused, by name",
  wentDark !== "" && /radar/i.test(wentDark),
  "a blank picture cannot be told from a broken one — got " + JSON.stringify(wentDark)
);

const noTrait = offlineFor({ player: {} });
check(
  "a live player carrying no radarTrait fails closed",
  noTrait !== "",
  "the constraint outranks the feature: a client that moved the flag costs us the picture, not the player their advantage"
);

check(
  "and says so differently, because a moved flag is not a covered minimap",
  noTrait !== wentDark,
  "one is the game's own rule working and the other is us having lost sight of it — got " + JSON.stringify(noTrait)
);

check(
  "a trait whose isDisabled is not callable fails closed too",
  offlineFor({ player: { radarTrait: { isDisabled: false } } }) !== "",
  "`radarDisabled: !!t.radarTrait?.isDisabled()` is a CALL in the client's own api — a property read is undefined and forever falsy"
);

// The flag is live: it goes false the moment power comes back, and a gate that
// answered from a cached first read would leave the panel dark for the match.
let flagIsDown = true;
const flipping = { player: { radarTrait: { isDisabled: () => flagIsDown } } };
const whileDown = offlineFor(flipping);
flagIsDown = false;
check(
  "the flag is asked on every call rather than remembered",
  whileDown !== "" && offlineFor(flipping) === "",
  "power returns, a storm passes, a radar is rebuilt — all three flip this back with no event of ours"
);

/**
 * The tick, run against a stub whose flag changes under it.
 *
 * `script` is the flag's answer on each tick, so the number of FLIPS is known
 * and the renders can be counted against that rather than against the number of
 * ticks. The real `radarOffline` is concatenated in rather than stubbed: what
 * the tick polls has to be the thing the ladder reads, or the two halves can
 * disagree and both pass.
 */
function runTicks(script, opts = {}) {
  let disabled = false;
  let painted = 0;
  let rendered = 0;
  const combatant = { player: { radarTrait: { isDisabled: () => disabled } } };
  const state = { combatant: opts.noMatch ? null : combatant };
  const api = new Function(
    "state",
    "radarVisible",
    "radarSweepTimer",
    "radarTicks",
    "RADAR_SWEEP_EVERY",
    "RADAR_ORE_EVERY",
    "RADAR_TICK_MS",
    "sweepRadarShroud",
    "sweepRadarOre",
    "paintRadar",
    "renderRadar",
    "window",
    lastDecl[0] + "\n" + offlineSrc + "\n" + tickSrc + "\n return { radarSweepTick };"
  )(
    state,
    true,
    0,
    0,
    // Both sweeps are held off: this measures the flip, and a mask that moved
    // would paint for a reason that has nothing to do with the radar's state.
    9999,
    9999,
    100,
    () => false,
    () => false,
    () => painted++,
    () => rendered++,
    { setTimeout: () => 1 }
  );
  for (const down of script) {
    disabled = down;
    api.radarSweepTick();
  }
  return { painted, rendered, ticks: script.length };
}

const F = false;
const T = true;
const flips = runTicks([F, F, F, T, T, T, T, F, F, F]);
check(
  "the tick re-renders on a change of the flag and not on a tick",
  flips.rendered === 2,
  `two flips in ${flips.ticks} ticks and renderRadar ran ${flips.rendered} times — the ladder rebuilds the panel's box and re-places the canvas, so a render per tick is ten of those a second`
);

check(
  "and while the radar is off nothing is painted into the hidden canvas",
  flips.painted === 5,
  `painted ${flips.painted} times — the three ticks before the flip and the two after it, and none of the four in between`
);

const alreadyDark = runTicks([T, T, T]);
check(
  "a panel opened over a radar that is already off darkens on its first tick, once",
  alreadyDark.rendered === 1 && alreadyDark.painted === 0,
  `rendered ${alreadyDark.rendered}, painted ${alreadyDark.painted}`
);

const neverDark = runTicks([F, F, F]);
check(
  "and one over a working radar renders not at all, painting as it always did",
  neverDark.rendered === 0 && neverDark.painted === 3,
  `rendered ${neverDark.rendered}, painted ${neverDark.painted} — the cached state starts at the answer a working radar gives`
);

const outOfMatch = runTicks([F, F, F], { noMatch: true });
check(
  "out of a match the tick neither renders nor paints on the flag",
  outOfMatch.rendered === 0 && outOfMatch.painted === 0,
  `rendered ${outOfMatch.rendered}, painted ${outOfMatch.painted} — there is no flag out of a match, so the gate must not invent a change and repaint the viewer over the last map played`
);

// --- report -----------------------------------------------------------------------------
for (const line of results) console.log(line);
const failed = results.filter((r) => r.startsWith("FAIL")).length;
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
