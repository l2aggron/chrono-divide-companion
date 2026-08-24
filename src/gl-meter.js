/**
 * What the tab is holding that `performance.memory` cannot see.
 *
 * [[replay-run-crash]] killed five tabs establishing that the JS heap is not
 * where a Chrono Divide tab's memory goes: seven runs died at ~1146 MB against
 * a `jsHeapSizeLimit` of 4192 MB with `usedJSHeapSize` flat through all of them.
 * What fills up is canvases and three.js geometry and textures —
 * `RenderableManager` retires a renderable only from inside `Renderer.update`,
 * so anything that stops the render loop stops the disposal, and none of it is
 * JS heap. A readout built on `performance.memory` alone would have been green
 * through every one of those deaths.
 *
 * There is no page-side API for that memory, so this counts it at the only
 * boundary a page owns: the GL calls that allocate it. Objects created against
 * objects deleted, and the bytes uploaded attributed to the object they went
 * into, so a delete subtracts what that object actually held rather than an
 * average.
 *
 * **A content script at `document_start`, MAIN world, for the reason
 * `src/frames.js` is one:** the client takes its context while it boots, and an
 * instrument installed after that instruments nothing.
 *
 * **Nothing per-draw is wrapped.** Every call touched here is an allocation —
 * creation, upload, deletion — which a renderer makes thousands of times over a
 * match, not millions of times a frame. `drawElements` and friends are not
 * touched at all, so the cost of this file does not scale with frame rate.
 *
 * The byte figures are an **estimate and are labelled as one** wherever they
 * are shown. Driver padding, compression, mip chains the driver generates
 * itself (`generateMipmap` adds about a third and is counted as such) and
 * whatever the compositor holds for the canvas are all outside what these calls
 * state. The number that matters is not its absolute value but its shape over a
 * match: a renderer that disposes sawtooths, and one that does not climbs.
 *
 * `window.__cdcGl`:
 *
 *   read()      → a summed snapshot, or null if no context has been taken yet
 *   contexts    → how many GL contexts this page has handed out
 *
 * No chrome APIs and no client modules, so scripts/check-memory.mjs drives this
 * very file rather than a copy of it.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion/gl]";

  // The context types worth instrumenting. `webgl2` is what the client takes;
  // `webgl` is here because a machine that falls back to it is exactly the
  // machine whose memory is worth watching, and `experimental-webgl` because
  // some drivers still only answer to that name.
  const GL_TYPES = new Set(["webgl", "webgl2", "experimental-webgl"]);

  /**
   * Bytes per component, by the `type` argument of an upload.
   *
   * Keyed by the GL enum's numeric value rather than by a name read off a
   * context, because this table has to exist before any context does. The
   * values are the WebGL constants, which are fixed by the spec.
   */
  const TYPE_BYTES = {
    0x1401: 1, // UNSIGNED_BYTE
    0x1400: 1, // BYTE
    0x1403: 2, // UNSIGNED_SHORT
    0x1402: 2, // SHORT
    0x8033: 2, // UNSIGNED_SHORT_4_4_4_4
    0x8034: 2, // UNSIGNED_SHORT_5_5_5_1
    0x8363: 2, // UNSIGNED_SHORT_5_6_5
    0x1405: 4, // UNSIGNED_INT
    0x1404: 4, // INT
    0x1406: 4, // FLOAT
    0x140b: 2, // HALF_FLOAT
    0x84fa: 4, // UNSIGNED_INT_24_8
  };

  /** Components per `format`, same reasoning as TYPE_BYTES. */
  const FORMAT_CHANNELS = {
    0x1906: 1, // ALPHA
    0x1909: 1, // LUMINANCE
    0x190a: 2, // LUMINANCE_ALPHA
    0x1907: 3, // RGB
    0x1908: 4, // RGBA
    0x1902: 1, // DEPTH_COMPONENT
    0x84f9: 1, // DEPTH_STENCIL
    0x1903: 1, // RED
    0x8227: 2, // RG
    0x8d94: 1, // RED_INTEGER
    0x8228: 2, // RG_INTEGER
    0x8d98: 3, // RGB_INTEGER
    0x8d99: 4, // RGBA_INTEGER
  };

  /**
   * Sized internal formats, where the format and type arguments do not state
   * the cost. Only the ones a renderer of this kind actually asks for; anything
   * absent falls through to the format/type estimate, which is the right
   * default rather than a zero.
   */
  const SIZED_BYTES = {
    0x8058: 4, // RGBA8
    0x8051: 3, // RGB8
    0x881a: 8, // RGBA16F
    0x8814: 16, // RGBA32F
    0x881b: 6, // RGB16F
    0x8815: 12, // RGB32F
    0x8c43: 4, // SRGB8_ALPHA8
    0x8c41: 3, // SRGB8
    0x8229: 1, // R8
    0x822b: 2, // RG8
    0x81a5: 2, // DEPTH_COMPONENT16
    0x81a6: 3, // DEPTH_COMPONENT24
    0x8cac: 4, // DEPTH_COMPONENT32F
    0x88f0: 4, // DEPTH24_STENCIL8
    0x8d48: 1, // STENCIL_INDEX8
  };

  // The six cube faces all belong to the texture bound at TEXTURE_CUBE_MAP, so
  // an upload to any of them is attributed there rather than to a binding
  // nothing was ever made under.
  const CUBE_FACE_MIN = 0x8515;
  const CUBE_FACE_MAX = 0x851a;
  const TEXTURE_CUBE_MAP = 0x8513;

  // `generateMipmap` builds the whole chain below level 0, which converges on a
  // third of the base level again. Counted, because a sprite atlas that
  // generates mips costs a third more than its upload said.
  const MIP_CHAIN_FACTOR = 1 / 3;

  function isCubeFace(target) {
    return target >= CUBE_FACE_MIN && target <= CUBE_FACE_MAX;
  }

  /**
   * One instrumented context.
   *
   * `sizes` is a WeakMap and not a Map on purpose: it is keyed by the GL object
   * itself, and this file must not be the thing that keeps a texture alive. A
   * texture the client drops without deleting is a leak we are here to measure,
   * not one we may cause.
   */
  function instrument(gl, canvas) {
    const live = { textures: 0, buffers: 0, renderbuffers: 0, framebuffers: 0 };
    const bytes = { textures: 0, buffers: 0, renderbuffers: 0 };
    const made = { textures: 0, buffers: 0, renderbuffers: 0, framebuffers: 0 };
    const sizes = new WeakMap();
    const bound = new Map(); // target enum -> the object bound to it
    const lost = { at: 0, count: 0, restoredAt: 0 };

    /** Move an object's accounted size to `next`, adjusting the running total. */
    function resize(obj, kind, next) {
      if (!obj) return;
      const was = sizes.get(obj) || 0;
      sizes.set(obj, next);
      bytes[kind] += next - was;
      if (bytes[kind] < 0) bytes[kind] = 0;
    }

    function wrap(name, fn) {
      const original = gl[name];
      if (typeof original !== "function") return;
      gl[name] = function (...args) {
        const out = original.apply(this, args);
        try {
          fn(out, args);
        } catch (e) {
          // Never let the meter break the renderer it is measuring: the call
          // has already been made and its result is on its way back. Logged
          // rather than swallowed, because a meter reporting nothing while
          // looking healthy is the failure this whole file exists to avoid.
          console.warn(TAG, name + " accounting failed", e);
        }
        return out;
      };
    }

    for (const [kind, make, drop] of [
      ["textures", "createTexture", "deleteTexture"],
      ["buffers", "createBuffer", "deleteBuffer"],
      ["renderbuffers", "createRenderbuffer", "deleteRenderbuffer"],
      ["framebuffers", "createFramebuffer", "deleteFramebuffer"],
    ]) {
      wrap(make, (obj) => {
        if (!obj) return;
        live[kind]++;
        made[kind]++;
      });
      wrap(drop, (_out, args) => {
        const obj = args[0];
        if (!obj) return;
        live[kind]--;
        if (live[kind] < 0) live[kind] = 0;
        // A framebuffer is a set of attachments, not storage of its own — its
        // bytes are the renderbuffers and textures hung off it, and those are
        // deleted separately. Counting it here would count them twice.
        if (kind !== "framebuffers") resize(obj, kind, 0);
      });
    }

    // The bindings, so an upload can be attributed. Tracked rather than read
    // back with `getParameter`, which is a synchronous round trip to the driver
    // and would turn every upload into a pipeline stall.
    wrap("bindTexture", (_out, args) => bound.set(args[0], args[1]));
    wrap("bindBuffer", (_out, args) => bound.set(args[0], args[1]));
    wrap("bindRenderbuffer", (_out, args) => bound.set(args[0], args[1]));

    /** The texture an upload to `target` lands in, cube faces included. */
    function textureFor(target) {
      return isCubeFace(target) ? bound.get(TEXTURE_CUBE_MAP) : bound.get(target);
    }

    function texelBytes(internalformat, format, type) {
      if (SIZED_BYTES[internalformat] !== undefined) return SIZED_BYTES[internalformat];
      const channels = FORMAT_CHANNELS[format] !== undefined ? FORMAT_CHANNELS[format] : 4;
      const per = TYPE_BYTES[type] !== undefined ? TYPE_BYTES[type] : 1;
      return channels * per;
    }

    /**
     * `texImage2D` has two shapes and they disagree about where the size is.
     *
     * The 9-argument form states width and height. The 6-argument DOM-source
     * form (`ImageBitmap`, `<canvas>`, `<img>`, `ImageData`) states neither, and
     * the size has to come off the source — which is the form the client's
     * sprite path uses, `ImageUtils.convertShpToCanvas` handing a canvas
     * straight in. Reading only the first shape would zero exactly the uploads
     * worth counting.
     */
    function uploadSize(args) {
      const target = args[0];
      const level = args[1] | 0;
      const internalformat = args[2];
      if (args.length >= 8) {
        return {
          target,
          level,
          bytes: (args[3] | 0) * (args[4] | 0) * texelBytes(internalformat, args[6], args[7]),
        };
      }
      const source = args[5];
      const width = (source && (source.width || source.videoWidth)) | 0;
      const height = (source && (source.height || source.videoHeight)) | 0;
      return { target, level, bytes: width * height * texelBytes(internalformat, args[3], args[4]) };
    }

    /**
     * A texture's accounted size is its level 0, not the sum of its levels.
     *
     * Levels arrive as separate calls, and a re-upload of the same level is a
     * replacement rather than an addition — summing would count both a mip
     * chain and every re-upload of an animating texture as new memory, so the
     * number would climb on a renderer doing nothing wrong. Level 0, with the
     * chain factor applied once a chain exists, is the honest estimate.
     */
    wrap("texImage2D", (_out, args) => {
      const shape = uploadSize(args);
      if (shape.level !== 0) return;
      const texture = textureFor(shape.target);
      if (!texture) return;
      resize(texture, "textures", shape.bytes * (isCubeFace(shape.target) ? 6 : 1));
    });

    wrap("compressedTexImage2D", (_out, args) => {
      const target = args[0];
      if ((args[1] | 0) !== 0) return;
      const texture = textureFor(target);
      if (!texture) return;
      const data = args[6];
      const size = data && data.byteLength ? data.byteLength : 0;
      resize(texture, "textures", size * (isCubeFace(target) ? 6 : 1));
    });

    // The WebGL2 immutable path: one call states the whole chain up front, so
    // unlike texImage2D it is already the total and the levels argument, not
    // a later generateMipmap, is what says whether there is a chain.
    wrap("texStorage2D", (_out, args) => {
      const [target, levels, internalformat, width, height] = args;
      const texture = textureFor(target);
      if (!texture) return;
      const base = (width | 0) * (height | 0) * texelBytes(internalformat, undefined, undefined);
      resize(texture, "textures", (levels | 0) > 1 ? Math.round(base * (1 + MIP_CHAIN_FACTOR)) : base);
    });

    wrap("generateMipmap", (_out, args) => {
      const texture = textureFor(args[0]);
      if (!texture) return;
      resize(texture, "textures", Math.round((sizes.get(texture) || 0) * (1 + MIP_CHAIN_FACTOR)));
    });

    wrap("bufferData", (_out, args) => {
      const buffer = bound.get(args[0]);
      if (!buffer) return;
      // `bufferData(target, size, usage)` allocates without data; the other
      // form hands a typed array or ArrayBuffer, whose byteLength is the size.
      const src = args[1];
      const size = typeof src === "number" ? src : src && src.byteLength ? src.byteLength : 0;
      resize(buffer, "buffers", size);
    });

    for (const name of ["renderbufferStorage", "renderbufferStorageMultisample"]) {
      wrap(name, (_out, args) => {
        const rb = bound.get(args[0]);
        if (!rb) return;
        // The multisample form inserts `samples` ahead of the format, and a
        // sample is a full copy of the surface — an 8x MSAA depth buffer at
        // 4K is a quarter of a gigabyte on its own, which is not a rounding
        // error in a readout about running out of memory.
        const multi = name !== "renderbufferStorage";
        const samples = multi ? Math.max(1, args[1] | 0) : 1;
        const internalformat = multi ? args[2] : args[1];
        const width = multi ? args[3] : args[2];
        const height = multi ? args[4] : args[3];
        const per = SIZED_BYTES[internalformat] !== undefined ? SIZED_BYTES[internalformat] : 4;
        resize(rb, "renderbuffers", (width | 0) * (height | 0) * per * samples);
      });
    }

    /**
     * The blank tab, caught at the moment it happens.
     *
     * A page that is alive with a blank canvas is a context the GPU process
     * took away, which is what it does when it runs out — and it is the one
     * signal here that needs no threshold, because it is not a number
     * approaching a limit but the failure itself.
     *
     * `count` rather than a flag: a context lost twice is a different story
     * from one lost once, and the second loss is usually the one that does not
     * come back.
     *
     * Listened to, never prevented. Calling `preventDefault` here would ask the
     * client for a restore it has no code to perform, which is a worse tab than
     * a blank one — the canvas would come back empty and stay that way with
     * nothing logged.
     */
    canvas.addEventListener("webglcontextlost", () => {
      lost.at = Date.now();
      lost.count++;
      console.warn(TAG, "the WebGL context was lost — this is the blank canvas");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      lost.restoredAt = Date.now();
    });

    return {
      read() {
        return { live: { ...live }, bytes: { ...bytes }, made: { ...made }, lost: { ...lost } };
      },
    };
  }

  const meters = [];

  // `window.HTMLCanvasElement` rather than the bare global, the idiom
  // src/frames.js already uses for the same reason: it is the one name in this
  // file that comes from the platform, and reaching it through `window` is what
  // lets scripts/check-memory.mjs run the real file against a stub canvas.
  const originalGetContext = window.HTMLCanvasElement.prototype.getContext;
  window.HTMLCanvasElement.prototype.getContext = function (type, ...rest) {
    const context = originalGetContext.call(this, type, ...rest);
    if (context && GL_TYPES.has(type)) {
      try {
        // A second `getContext` for the same type returns the same object,
        // which would otherwise be wrapped twice and double every count.
        if (!context.__cdcMetered) {
          context.__cdcMetered = true;
          meters.push(instrument(context, this));
        }
      } catch (e) {
        console.warn(TAG, "could not instrument a GL context", e);
      }
    }
    return context;
  };

  window.__cdcGl = {
    /**
     * Every instrumented context summed, or null before the first one exists.
     *
     * Summed rather than listed: the client takes one context for the world,
     * and the question this answers is what the tab holds rather than which
     * canvas holds it. `contexts` rides along so a page that has quietly taken
     * a second one is visible instead of averaged away.
     */
    read() {
      if (!meters.length) return null;
      const out = {
        contexts: meters.length,
        live: { textures: 0, buffers: 0, renderbuffers: 0, framebuffers: 0 },
        bytes: { textures: 0, buffers: 0, renderbuffers: 0 },
        made: { textures: 0, buffers: 0, renderbuffers: 0, framebuffers: 0 },
        lost: { at: 0, count: 0, restoredAt: 0 },
      };
      for (const meter of meters) {
        const one = meter.read();
        for (const key of Object.keys(out.live)) out.live[key] += one.live[key];
        for (const key of Object.keys(out.bytes)) out.bytes[key] += one.bytes[key];
        for (const key of Object.keys(out.made)) out.made[key] += one.made[key];
        out.lost.count += one.lost.count;
        out.lost.at = Math.max(out.lost.at, one.lost.at);
        out.lost.restoredAt = Math.max(out.lost.restoredAt, one.lost.restoredAt);
      }
      return out;
    },
    get contexts() {
      return meters.length;
    },
  };
})();
