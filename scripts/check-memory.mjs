/**
 * The memory readout, exercised without a browser, a GPU or a match.
 *
 *   node scripts/check-memory.mjs
 *
 * This feature has a worse observability problem than anything else in the
 * repo: it is a leak detector, so its own defects look exactly like the thing
 * it was written to find. A meter that under-counts reports a healthy tab
 * right up until the tab dies, and there is no moment at which a player, or
 * the author, could tell the difference by looking. [[replay-run-crash]] is
 * the record of how expensive that is — five dead tabs to establish one
 * negative.
 *
 * So both files are driven here, as themselves rather than as copies:
 *
 *   - **`src/gl-meter.js` against a stub context.** The arithmetic is where
 *     this fails silently. Every branch of the byte estimate is fed a known
 *     upload and asserted against a number computed by hand — the two shapes of
 *     `texImage2D` especially, because the six-argument DOM-source form is the
 *     one the client's sprite path actually uses and reading only the other
 *     would zero exactly the uploads worth counting.
 *   - **`src/mem-readout.js` against an injected clock and store.** The alarm
 *     rule is two lines of arithmetic guarding a panel that interrupts a match,
 *     so both its thresholds and its *precedence* are pinned; the trace is
 *     asserted to survive a session that never closes, which is the whole
 *     reason it is written to disk.
 *
 * What is NOT checked here is whether a real driver agrees with the byte
 * estimate. It will not exactly, and the file says so: the figures are labelled
 * an estimate on screen. What matters is that they are *consistently* wrong in
 * one direction, so their shape over a match is readable — and that is what a
 * hand-computed expectation pins.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

let failed = 0;
function check(name, ok, detail) {
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

// --- a canvas element small enough to reason about ---------------------------

const listeners = new Map();

class StubCanvas {
  addEventListener(type, fn) {
    if (!listeners.has(this)) listeners.set(this, new Map());
    listeners.get(this).set(type, fn);
  }
  fire(type) {
    const on = listeners.get(this);
    if (on && on.get(type)) on.get(type)();
  }
}

/**
 * A GL context that does nothing but hand back distinct objects.
 *
 * Distinct is the whole requirement: the meter keys its per-object accounting
 * on identity, so a stub returning one shared object would make every test pass
 * for the wrong reason.
 */
function stubContext() {
  const gl = {};
  for (const name of [
    "createTexture", "createBuffer", "createRenderbuffer", "createFramebuffer",
  ]) {
    gl[name] = () => ({ name });
  }
  for (const name of [
    "deleteTexture", "deleteBuffer", "deleteRenderbuffer", "deleteFramebuffer",
    "bindTexture", "bindBuffer", "bindRenderbuffer",
    "texImage2D", "compressedTexImage2D", "texStorage2D", "generateMipmap",
    "bufferData", "renderbufferStorage", "renderbufferStorageMultisample",
  ]) {
    gl[name] = () => undefined;
  }
  return gl;
}

// The GL constants the checks below name, by their spec values — the same
// numbers gl-meter.js carries, written out again here on purpose so a typo in
// one table is not silently agreed with by the other.
const TEXTURE_2D = 0x0de1;
const TEXTURE_CUBE_MAP = 0x8513;
const CUBE_FACE_POS_X = 0x8515;
const ARRAY_BUFFER = 0x8892;
const RENDERBUFFER = 0x8d41;
const RGBA = 0x1908;
const RGB = 0x1907;
const UNSIGNED_BYTE = 0x1401;
const FLOAT = 0x1406;
const RGBA8 = 0x8058;
const DEPTH24_STENCIL8 = 0x88f0;

// --- load gl-meter.js as itself ----------------------------------------------

// The one context every test below shares, handed out by the prototype method
// gl-meter.js is about to wrap — so the file installs itself the same way it
// does in a page, and the tests reach it the same way the client does.
const gl = stubContext();
const glWindow = {
  HTMLCanvasElement: {
    prototype: {
      getContext(type) {
        return type === "webgl2" ? gl : null;
      },
    },
  },
};
new Function("window", "console", readFileSync(join(src, "gl-meter.js"), "utf8"))(glWindow, {
  warn: () => {},
});
const api2 = glWindow.__cdcGl;
check("gl-meter.js defines window.__cdcGl", !!api2);
eq("no context taken yet reads null", api2.read(), null);

const canvas = new StubCanvas();
canvas.getContext = glWindow.HTMLCanvasElement.prototype.getContext;
eq("a 2d context is left alone", canvas.getContext("2d"), null);
eq("and does not count as a context", api2.contexts, 0);

canvas.getContext("webgl2");
eq("one context instrumented", api2.contexts, 1);

// A second call for the same type returns the same object and must not be
// wrapped twice — the failure mode is every count silently doubling.
canvas.getContext("webgl2");
eq("a repeat getContext does not double-instrument", api2.contexts, 1);

// --- creation and deletion ---------------------------------------------------

const t1 = gl.createTexture();
const t2 = gl.createTexture();
const b1 = gl.createBuffer();
const f1 = gl.createFramebuffer();
eq("two textures live", api2.read().live.textures, 2);
eq("one buffer live", api2.read().live.buffers, 1);
eq("one framebuffer live", api2.read().live.framebuffers, 1);

gl.deleteTexture(t2);
eq("a delete drops the live count", api2.read().live.textures, 1);
eq("made counts every texture ever created", api2.read().made.textures, 2);

// --- the byte estimate, every branch -----------------------------------------

// The nine-argument form: 256x256 RGBA/UNSIGNED_BYTE = 262 144 bytes.
gl.bindTexture(TEXTURE_2D, t1);
gl.texImage2D(TEXTURE_2D, 0, RGBA, 256, 256, 0, RGBA, UNSIGNED_BYTE, null);
eq("texImage2D, sized form", api2.read().bytes.textures, 256 * 256 * 4);

// A re-upload of the same level replaces rather than adds. This is the branch
// that decides whether an animating texture looks like a leak: summing would
// have this panel accuse a renderer doing nothing wrong.
gl.texImage2D(TEXTURE_2D, 0, RGBA, 256, 256, 0, RGBA, UNSIGNED_BYTE, null);
eq("re-uploading level 0 replaces, not adds", api2.read().bytes.textures, 256 * 256 * 4);

// A mip level is not new memory of its own under this model.
gl.texImage2D(TEXTURE_2D, 1, RGBA, 128, 128, 0, RGBA, UNSIGNED_BYTE, null);
eq("a mip level does not add", api2.read().bytes.textures, 256 * 256 * 4);

// The six-argument DOM-source form — what `ImageUtils.convertShpToCanvas`
// feeds. The size is on the source and nowhere in the arguments.
const t3 = gl.createTexture();
gl.bindTexture(TEXTURE_2D, t3);
gl.texImage2D(TEXTURE_2D, 0, RGBA, RGBA, UNSIGNED_BYTE, { width: 60, height: 40 });
eq(
  "texImage2D, DOM-source form reads the source's size",
  api2.read().bytes.textures - 256 * 256 * 4,
  60 * 40 * 4
);

// RGB/FLOAT is three components of four bytes, so the type table and the
// channel table both have to be consulted.
const t4 = gl.createTexture();
gl.bindTexture(TEXTURE_2D, t4);
gl.texImage2D(TEXTURE_2D, 0, RGB, 10, 10, 0, RGB, FLOAT, null);
const beforeCube = api2.read().bytes.textures;
eq("RGB/FLOAT is 12 bytes a texel", beforeCube - 256 * 256 * 4 - 60 * 40 * 4, 10 * 10 * 12);

// A cube face is attributed to the texture bound at TEXTURE_CUBE_MAP, and
// costs six faces. Attributing it to a binding under the face enum instead
// would silently drop a skybox from the total.
const t5 = gl.createTexture();
gl.bindTexture(TEXTURE_CUBE_MAP, t5);
gl.texImage2D(CUBE_FACE_POS_X, 0, RGBA, 32, 32, 0, RGBA, UNSIGNED_BYTE, null);
eq("a cube face counts six faces", api2.read().bytes.textures - beforeCube, 32 * 32 * 4 * 6);

// `generateMipmap` adds the chain, which converges on a third of the base.
const t6 = gl.createTexture();
gl.bindTexture(TEXTURE_2D, t6);
gl.texImage2D(TEXTURE_2D, 0, RGBA, 128, 128, 0, RGBA, UNSIGNED_BYTE, null);
const beforeMips = api2.read().bytes.textures;
gl.generateMipmap(TEXTURE_2D);
eq(
  "generateMipmap adds a third",
  api2.read().bytes.textures - beforeMips,
  Math.round(128 * 128 * 4 * (4 / 3)) - 128 * 128 * 4
);

// The WebGL2 immutable path states the whole chain in one call.
const t7 = gl.createTexture();
gl.bindTexture(TEXTURE_2D, t7);
const beforeStorage = api2.read().bytes.textures;
gl.texStorage2D(TEXTURE_2D, 1, RGBA8, 64, 64);
eq("texStorage2D with one level", api2.read().bytes.textures - beforeStorage, 64 * 64 * 4);

// Deleting a texture subtracts what that texture actually held, not an average.
const held = api2.read().bytes.textures;
gl.deleteTexture(t1);
eq("a delete subtracts that object's own size", api2.read().bytes.textures, held - 256 * 256 * 4);

// Buffers.
gl.bindBuffer(ARRAY_BUFFER, b1);
gl.bufferData(ARRAY_BUFFER, new Uint8Array(2048), 0);
eq("bufferData from a typed array", api2.read().bytes.buffers, 2048);
gl.bufferData(ARRAY_BUFFER, 4096, 0);
eq("bufferData from a size", api2.read().bytes.buffers, 4096);
gl.deleteBuffer(b1);
eq("deleting a buffer clears its bytes", api2.read().bytes.buffers, 0);

// A multisample renderbuffer costs a full copy of the surface per sample —
// the branch that separates a quarter of a gigabyte from thirty megabytes.
const r1 = gl.createRenderbuffer();
gl.bindRenderbuffer(RENDERBUFFER, r1);
gl.renderbufferStorage(RENDERBUFFER, DEPTH24_STENCIL8, 100, 100);
eq("renderbufferStorage", api2.read().bytes.renderbuffers, 100 * 100 * 4);
gl.renderbufferStorageMultisample(RENDERBUFFER, 4, DEPTH24_STENCIL8, 100, 100);
eq("multisample multiplies by the sample count", api2.read().bytes.renderbuffers, 100 * 100 * 4 * 4);

// A framebuffer holds no storage of its own — its attachments are counted
// where they were made, and counting it again would double them.
gl.deleteFramebuffer(f1);
eq("deleting a framebuffer touches no bytes", api2.read().bytes.textures, held - 256 * 256 * 4);

// --- the blank screen --------------------------------------------------------

eq("no loss reported yet", api2.read().lost.count, 0);
canvas.fire("webglcontextlost");
eq("a lost context is counted", api2.read().lost.count, 1);
check("a lost context is stamped", api2.read().lost.at > 0);
canvas.fire("webglcontextlost");
eq("a second loss is a different story from the first", api2.read().lost.count, 2);

// --- the meter, the alarm rule and the trace ---------------------------------

const memWindow = {};
new Function("window", readFileSync(join(src, "mem-readout.js"), "utf8"))(memWindow);
const mem = memWindow.__cdcMem;
check("mem-readout.js defines window.__cdcMem", !!mem);
check("no GPU threshold is claimed", mem.GPU_ALARM === null);

/** A store with the shape localStorage has and none of its behaviour. */
function stubStore() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => map.set(k, String(v)),
    removeItem: (k) => map.delete(k),
    map,
  };
}

/** A meter on a clock the test drives, so a quarter of an hour costs no time. */
function meterOn(store, readings) {
  let at = 1_000_000;
  let i = 0;
  const meter = mem.createMeter({
    now: () => at,
    store,
    readHeap: () => (readings[i] ? readings[i].heap : null),
    readGl: () => (readings[i] ? readings[i].gl : null),
    note: () => {},
  });
  return {
    meter,
    step(millis) {
      at += millis === undefined ? mem.SAMPLE_IDLE_MILLIS : millis;
      const row = meter.sample();
      if (i < readings.length - 1) i++;
      return row;
    },
  };
}

function heapAt(usedMb, limitMb) {
  return { used: usedMb * 1024 * 1024, limit: limitMb * 1024 * 1024 };
}
function glAt(texMb, lost) {
  return {
    contexts: 1,
    live: { textures: 10, buffers: 5, renderbuffers: 1, framebuffers: 1 },
    bytes: { textures: texMb * 1024 * 1024, buffers: 0, renderbuffers: 0 },
    made: { textures: 100, buffers: 5, renderbuffers: 1, framebuffers: 1 },
    lost: { at: lost ? 1 : 0, count: lost || 0, restoredAt: 0 },
  };
}

// A healthy tab: well under the limit, no loss.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: heapAt(400, 4192), gl: glAt(300, 0) }]);
  run.step();
  eq("a healthy tab raises no alarm", run.meter.alarm(), null);
  eq("the reading is in megabytes", run.meter.latest().heapMb, 400);
  eq("textures are in megabytes", run.meter.latest().texMb, 300);
}

// The heap threshold, from just under to just over. Pinned against the
// constant rather than against 0.85 written out again, so moving the constant
// moves the test with it.
{
  const limit = 4192;
  const under = Math.floor(limit * mem.HEAP_ALARM) - 1;
  const over = Math.ceil(limit * mem.HEAP_ALARM) + 1;
  const store = stubStore();
  const run = meterOn(store, [
    { heap: heapAt(under, limit), gl: glAt(300, 0) },
    { heap: heapAt(over, limit), gl: glAt(300, 0) },
  ]);
  run.step();
  eq("just under the heap threshold is quiet", run.meter.alarm(), null);
  run.step();
  const alarm = run.meter.alarm();
  check("just over the heap threshold alarms", alarm && alarm.kind === "heap", JSON.stringify(alarm));
}

// A tab with no `performance.memory` at all — Firefox, Safari. It must not
// alarm on a missing reading, and it must not crash on one either.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: null, gl: glAt(300, 0) }]);
  run.step();
  eq("no heap reading is not an alarm", run.meter.alarm(), null);
  eq("no heap reading is null, not zero", run.meter.latest().heapMb, null);
}

// The blank screen wins over the heap: one is a prediction, the other is the
// failure having already happened.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: heapAt(4000, 4192), gl: glAt(300, 1) }]);
  run.step();
  const alarm = run.meter.alarm();
  check("a lost context outranks a full heap", alarm && alarm.kind === "context", JSON.stringify(alarm));
}

// A texture footprint of any size raises nothing on its own. This is the
// decision recorded as GPU_ALARM, asserted so it cannot be quietly undone.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: heapAt(400, 4192), gl: glAt(8000, 0) }]);
  run.step();
  eq("8 GB of textures still raises no alarm", run.meter.alarm(), null);
}

// The ring is capped, and the cap is the trace's size guarantee.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: heapAt(400, 4192), gl: glAt(300, 0) }]);
  for (let i = 0; i < mem.RING + 50; i++) run.step();
  eq("the ring is capped", run.meter.samples().length, mem.RING);
}

// The trend, which is the reading that separates a renderer that disposes from
// one that does not.
{
  const store = stubStore();
  const climbing = [];
  for (let i = 0; i < 40; i++) climbing.push({ heap: heapAt(400, 4192), gl: glAt(300 + i * 12, 0) });
  const run = meterOn(store, climbing);
  for (let i = 0; i < 40; i++) run.step(60000); // a minute a sample
  const rate = run.meter.trend("texMb");
  check("a climbing texture total reports a positive rate", rate > 0, String(rate));
  // Exact, not approximate: the slack that made this readable also made it
  // blind to the 25%% understatement the midpoint fix removed.
  check("the rate is exactly the 12 MB a minute it was fed", Math.abs(rate - 12) < 0.001, String(rate));
  eq("a flat heap alongside it reports steady", run.meter.trend("heapMb"), 0);
}

// Not enough ring yet is `null` rather than a made-up number.
{
  const store = stubStore();
  const run = meterOn(store, [{ heap: heapAt(400, 4192), gl: glAt(300, 0) }]);
  run.step();
  run.step();
  eq("too little history reports no trend", run.meter.trend("texMb"), null);
}

// --- the trace across a death ------------------------------------------------

{
  const store = stubStore();
  const first = meterOn(store, [{ heap: heapAt(1100, 4192), gl: glAt(1400, 0) }]);
  eq("a first session sees no previous trace", first.meter.lastSession(), null);
  for (let i = 0; i < 5; i++) first.step();
  check("the trace was written", store.getItem(mem.TRACE_KEY) !== null);

  // The tab is killed: no `close()`, no mark.
  const second = meterOn(store, [{ heap: heapAt(200, 4192), gl: glAt(50, 0) }]);
  const previous = second.meter.lastSession();
  check("a killed session is recognised", previous && previous.died === true);
  eq("and it reports what it was holding", previous && previous.last.texMb, 1400);
  eq("and the page heap with it", previous && previous.last.heapMb, 1100);
}

{
  const store = stubStore();
  const clean = meterOn(store, [{ heap: heapAt(500, 4192), gl: glAt(200, 0) }]);
  for (let i = 0; i < 5; i++) clean.step();
  clean.meter.close();
  const next = meterOn(store, [{ heap: heapAt(200, 4192), gl: glAt(50, 0) }]);
  const previous = next.meter.lastSession();
  check("a session that closed cleanly is not reported as a death", previous && previous.died === false);
}

// A corrupt or foreign trace is ignored rather than thrown on — the store is
// shared with the client's own `_r_*` keys and with older versions of this file.
{
  const store = stubStore();
  store.setItem(mem.TRACE_KEY, "{not json");
  const run = meterOn(store, [{ heap: heapAt(400, 4192), gl: glAt(300, 0) }]);
  eq("an unreadable trace is ignored", run.meter.lastSession(), null);

  const older = stubStore();
  older.setItem(older === null ? "" : mem.TRACE_KEY, JSON.stringify({ v: 0, rows: [{}] }));
  const run2 = meterOn(older, [{ heap: heapAt(400, 4192), gl: glAt(300, 0) }]);
  eq("a trace from another version is ignored", run2.meter.lastSession(), null);
}

// A store that refuses to be written (quota, or storage denied) must not stop
// the panel: the readout still works, only the evidence after a crash is lost.
{
  const hostile = {
    getItem: () => null,
    setItem: () => {
      throw new Error("QuotaExceededError");
    },
  };
  let noted = 0;
  const meter = mem.createMeter({
    now: () => 1_000_000,
    store: hostile,
    readHeap: () => heapAt(400, 4192),
    readGl: () => glAt(300, 0),
    note: () => noted++,
  });
  meter.sample();
  eq("a refused write still leaves a reading", meter.latest().heapMb, 400);
  check("and it is logged rather than swallowed", noted > 0);
}

console.log(failed ? `\n${failed} FAILED` : "\nall good");
process.exit(failed ? 1 : 0);
