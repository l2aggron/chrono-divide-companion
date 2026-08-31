/**
 * Companion for Chrono Divide — the map render's appearance table, on its own.
 *
 * It lives outside src/hq-preview.js because four places need it and only one
 * of them can load the renderer: the render itself (game tab), the options page
 * where the dials are edited, the in-game panel that mirrors them over a live
 * radar, and scripts/check-tune.mjs. A copy in any of those would drift — and
 * the prefs block, which is written out in three files and guarded by nothing
 * but a comment, is the cautionary example this file exists to avoid repeating.
 *
 * The load-bearing reason it is one file rather than two: the same dial is
 * applied by two different mechanisms. A stored render bakes it into the
 * palette LUT; the radar composites layers under a canvas filter. Those must
 * agree, and they can only be *made* to agree by deriving both from one
 * function — `channel` — which is why `tuneLut` and `filterString` are
 * neighbours here instead of living next to their callers.
 *
 * Nothing here touches the game client, the DOM or storage. It is arithmetic
 * and one table, so it is safe to load anywhere.
 */
(() => {
  /**
   * The element types a dial can address.
   *
   * `base` is the terrain tiles every other pass is drawn onto; the six after
   * it are exactly the SPRITE_FIX keys in hq-preview.js, in the render's own
   * painter order. `airport` is last because it is a building that had to be
   * split out for its own offset, and a dial addressing buildings should reach
   * it too.
   *
   * scripts/check-tune.mjs reads SPRITE_FIX out of hq-preview.js as text and
   * fails if these drift apart — the same cross-file guard
   * scripts/check-align-dials.mjs already runs for the offsets editor.
   */
  const TUNE_TYPES = [
    { key: "base", label: "terrain" },
    { key: "smudge", label: "smudges" },
    { key: "overlay", label: "overlays — walls, fences" },
    { key: "bridge", label: "bridges" },
    { key: "ore", label: "ore, gems, ore drills" },
    { key: "terrain", label: "terrain objects — trees, rocks" },
    { key: "building", label: "buildings — all but airports" },
    { key: "airport", label: "airports" },
  ];

  /**
   * Identity, deliberately.
   *
   * A fresh install must render exactly what it rendered before the dials
   * existed, or every stored render in the catalogue goes stale on upgrade for
   * a reason nobody asked for. check-tune.mjs asserts it.
   *
   * The two colours are the detail style's, which become the only pair: the
   * thumbnail used to carry its own slightly different yellow and violet, and
   * one user-facing colour cannot honour two defaults.
   */
  const DEFAULT_TUNE = {
    ore: "#ffd23f",
    gems: "#b45cff",
    // A multiplier over the mark style's own alpha, not a replacement for it.
    // The fill-to-border ratio is a legibility decision the style owns; how
    // strongly the whole marking reads is taste, and taste is this.
    oreAlpha: 1,
    // How far a Gap Generator's field is dimmed on the radar.
    //
    // Corrected 2026-08-24, and the correction matters: ShroudFlag holds one
    // member, Darken, and every one of the client's three writers of it is
    // GapGeneratorTrait / MapShroudTrait#markOwnGapTiles. There is no
    // explored-but-out-of-sight state in this game -- the radar has two states
    // in ordinary play, and the client's 0.35 multiply is a gap-field band that
    // most matches never populate.
    //
    // Default 0, so a gap field reads as unexplored. That is the user's own
    // instruction ("if by fog you mean fog generator field than it should count
    // same as unexplored when active") and it is also the honest reading: a
    // field you cannot see into is not ground you have scouted. 0.35 is
    // reachable for anyone who wants the client's own dimming instead.
    //
    // Radar-only: applied to a live layer, never baked, so it is deliberately
    // absent from tuneKey below -- a stored render is not stale because this
    // moved.
    shroudDim: 0.35,
    // The blips, which nothing else in this table can reach.
    //
    // They are drawn over the finished picture with `ctx.filter` off, because a
    // blip is an annotation over the map and dimming it exactly as far as the
    // map leaves it exactly as hard to see. That is also why neither the global
    // pair nor a per-type dial touches them, and why they need their own.
    //
    // `size` multiplies the dot the radar derives from a cell; `brightness`
    // reaches the blip's *colour* rather than the context, through `tuneHex`.
    // Identity by default: the user asked for a dial rather than a bigger blip
    // (2026-08-25), because a guess that misses costs a whole live match.
    //
    // Radar-only and never baked, exactly like `shroud` and `shroudDim` above,
    // so it is deliberately absent from `tuneKey`.
    units: { size: 1, brightness: 1 },
    all: { brightness: 1, contrast: 1 },
    types: Object.fromEntries(TUNE_TYPES.map((t) => [t.key, { brightness: 1, contrast: 1 }])),
  };

  // Wide enough to be useful, narrow enough that a slider cannot bake an
  // unreadable render into sixty stored maps.
  // `unitSize` is its own range rather than sharing `brightness`: it multiplies
  // a length and not a channel, and four is where a blip stops being a mark on a
  // cell and starts covering its neighbours.
  const LIMITS = {
    brightness: [0.2, 2],
    contrast: [0.2, 2],
    oreAlpha: [0, 1],
    shroudDim: [0, 1],
    unitSize: [0.5, 4],
  };

  const clamp = (v, range, fallback) => {
    const n = typeof v === "number" && Number.isFinite(v) ? v : fallback;
    return Math.min(range[1], Math.max(range[0], n));
  };

  /** A boolean or the default — `undefined` from an older stored table is not `false`. */
  const flag = (v, fallback) => (typeof v === "boolean" ? v : fallback);

  /** A #rrggbb or nothing — an invalid colour must not reach a fillStyle. */
  const colour = (v, fallback) =>
    typeof v === "string" && /^#[0-9a-f]{6}$/i.test(v) ? v.toLowerCase() : fallback;

  const pair = (raw, fallback) => ({
    brightness: clamp(raw && raw.brightness, LIMITS.brightness, fallback.brightness),
    contrast: clamp(raw && raw.contrast, LIMITS.contrast, fallback.contrast),
  });

  /**
   * Anything -> a complete, clamped table.
   *
   * Stored whole rather than as exceptions, and filled in here rather than read
   * with a fallback at each call site: a missing contrast that reads as 0 is a
   * grey rectangle, and that failure would surface in the render, far from the
   * read that caused it.
   */
  function normalise(raw) {
    const src = raw && typeof raw === "object" ? raw : {};
    const types = {};
    for (const entry of TUNE_TYPES) {
      types[entry.key] = pair(src.types && src.types[entry.key], DEFAULT_TUNE.types[entry.key]);
    }
    return {
      ore: colour(src.ore, DEFAULT_TUNE.ore),
      gems: colour(src.gems, DEFAULT_TUNE.gems),
      oreAlpha: clamp(src.oreAlpha, LIMITS.oreAlpha, DEFAULT_TUNE.oreAlpha),
      shroudDim: clamp(src.shroudDim, LIMITS.shroudDim, DEFAULT_TUNE.shroudDim),
      units: {
        size: clamp(src.units && src.units.size, LIMITS.unitSize, DEFAULT_TUNE.units.size),
        brightness: clamp(
          src.units && src.units.brightness,
          LIMITS.brightness,
          DEFAULT_TUNE.units.brightness
        ),
      },
      all: pair(src.all, DEFAULT_TUNE.all),
      types,
    };
  }

  /**
   * One channel, 0-255 in and out, through brightness then contrast.
   *
   * This is the CSS filter functions' own arithmetic, in their own order:
   * brightness(b) is a linear ramp of slope b, contrast(c) is slope c about
   * 0.5, and a filter list applies left to right. Both are componentwise on
   * non-premultiplied sRGB, which is what makes a palette LUT and a canvas
   * filter interchangeable — the art is indexed, so tuning 256 palette entries
   * is exactly tuning every pixel that will ever be drawn from them.
   *
   * Keep this and `filterString` in step. check-tune.mjs compares them over a
   * grid of values, and that comparison is the only thing standing between the
   * two mechanisms and a drift nobody sees until the radar and the preview
   * disagree about the same map.
   */
  function channel(v, brightness, contrast) {
    // Clamped BETWEEN the two steps, not only at the end. A CSS filter list is
    // a chain of separate primitives and each one's output is clamped to [0,1]
    // before the next sees it, so `brightness(1.6) contrast(0.8)` on a bright
    // pixel is contrast applied to 1.0, not to 1.6.
    //
    // Measured, not assumed: scripts/probe-filter-parity.mjs put every pair on
    // a real canvas and found one outlier -- brightness 1.6, contrast 0.8, off
    // by 26 of 255 while every other pair agreed within rounding. That is
    // exactly 0.1 of range, which is what dropping this clamp costs at those
    // dials. Without it the global pair (a CSS filter) and the per-type pair
    // (this, baked into a palette) disagree wherever brightness passes 1.
    let n = Math.min(1, Math.max(0, (v / 255) * brightness));
    n = Math.min(1, Math.max(0, n * contrast + 0.5 * (1 - contrast)));
    return Math.round(n * 255);
  }

  /**
   * The dials that apply to a type -- its own, and deliberately *not* the global
   * pair.
   *
   * This used to return the product of the two, and that was a double
   * application: the product was baked into the palette by `tuneLut`, and then
   * `globalFilter` put the global pair over the finished picture a second time.
   * Global brightness 1.5 rendered a mid-grey at 225 where the dial asked for
   * 150, and our render disagreed with the client's own preview under the same
   * dial, because that one is unbaked and sits under the same CSS rule.
   *
   * The rule now, in one line: **the global pair reaches a picture only as a
   * filter over it, never through a palette.** That is what makes it the free
   * half -- no re-render, no staleness -- which is the promise the options page
   * makes by separating the two halves in its markup. `globalFilter` is its one
   * application site; every consumer of a finished picture applies it, and the
   * radar does so when it blits its composited backing canvas.
   */
  function dialsFor(tune, type) {
    const t = normalise(tune);
    return { ...(t.types[type] || DEFAULT_TUNE.types.base) };
  }

  const isIdentity = (d) => d.brightness === 1 && d.contrast === 1;

  /**
   * A 256-entry packed-ABGR palette LUT -> a tuned copy.
   *
   * Index 0 is the transparent one and is copied untouched; alpha is carried
   * through rather than tuned, because a brightness dial that ate alpha would
   * make a sprite translucent instead of dark.
   *
   * Returns the original array when the dials are identity, so a default
   * install allocates nothing and renders byte-identical output.
   */
  function tuneLut(lut, tune, type) {
    const d = dialsFor(tune, type);
    if (isIdentity(d)) return lut;
    const out = new Uint32Array(lut.length);
    for (let i = 0; i < lut.length; i++) {
      const v = lut[i];
      if (!v) continue; // index 0, and any fully-zero entry: nothing to light
      const r = channel(v & 255, d.brightness, d.contrast);
      const g = channel((v >>> 8) & 255, d.brightness, d.contrast);
      const b = channel((v >>> 16) & 255, d.brightness, d.contrast);
      out[i] = (v & 0xff000000) | (b << 16) | (g << 8) | r;
    }
    return out;
  }

  /** The same dials as a canvas/CSS filter string; "none" when identity. */
  function filterString(tune, type) {
    const d = dialsFor(tune, type);
    if (isIdentity(d)) return "none";
    return "brightness(" + d.brightness + ") contrast(" + d.contrast + ")";
  }

  /**
   * One `#rrggbb` through the same dials, for the things drawn as a fill rather
   * than as a picture.
   *
   * The radar's blips are the case: they are fills over a finished composite,
   * with the context's filter deliberately off, so the only surface a dial has
   * on them is the colour string itself. Going through `channel` rather than
   * doing its own arithmetic is the point -- it is the same function the palette
   * bake and the filter string come off, so a blip brightened by 1.5 matches a
   * layer brightened by 1.5.
   *
   * Anything that is not a `#rrggbb` comes back untouched: the caller's colour
   * was read off a live client object, and a dial is not a reason to replace one
   * this file cannot parse.
   */
  function tuneHex(hex, brightness, contrast) {
    const v = colour(hex, null);
    if (!v || (brightness === 1 && contrast === 1)) return hex;
    const n = parseInt(v.slice(1), 16);
    const out =
      (channel((n >>> 16) & 255, brightness, contrast) << 16) |
      (channel((n >>> 8) & 255, brightness, contrast) << 8) |
      channel(n & 255, brightness, contrast);
    return "#" + out.toString(16).padStart(6, "0");
  }

  /**
   * The global pair alone, as a filter string.
   *
   * This is the one dial that costs nothing anywhere: it is a filter over a
   * picture that is already drawn, so it reaches every stored render, the map's
   * own preview and the radar without re-rendering anything. The per-type dials
   * cannot work this way -- they need the types kept apart, which is only true
   * while the render is being made -- which is why those are baked and this is
   * not.
   */
  function globalFilter(tune) {
    const t = normalise(tune);
    if (isIdentity(t.all)) return "none";
    return "brightness(" + t.all.brightness + ") contrast(" + t.all.contrast + ")";
  }

  /**
   * A short stamp of what a render *looked* like, for staleness.
   *
   * Deliberately not RENDERER_VERSION: that stamps a build of the renderer, and
   * a dial the user moved is not a new build. A stored render whose stamp no
   * longer matches is still the best picture available and must still be shown
   * — the stamp only decides whether re-rendering it would change anything.
   *
   * Empty string for the default table, so a render made before the dials
   * existed compares equal to one made after them with nothing touched.
   *
   * `all`, `shroudDim` and `shroud` are absent for the same reason: none is baked,
   * so neither can make a stored render stale. Moving the global pair is free
   * and must stay free -- stamping it here would mark all sixty stored renders
   * for a re-render that would change nothing in them.
   */
  function tuneKey(tune) {
    const t = normalise(tune);
    if (
      t.ore === DEFAULT_TUNE.ore &&
      t.gems === DEFAULT_TUNE.gems &&
      t.oreAlpha === DEFAULT_TUNE.oreAlpha &&
      TUNE_TYPES.every((entry) => isIdentity(t.types[entry.key]))
    ) {
      return "";
    }
    // Key order comes from TUNE_TYPES rather than from object iteration, so the
    // same table always produces the same stamp however it was assembled.
    const parts = [t.ore.slice(1), t.gems.slice(1), "o" + t.oreAlpha];
    for (const entry of TUNE_TYPES) {
      const d = t.types[entry.key];
      if (!isIdentity(d)) parts.push(entry.key + d.brightness + "/" + d.contrast);
    }
    return parts.join(",");
  }

  const api = {
    TUNE_TYPES,
    DEFAULT_TUNE,
    LIMITS,
    normalise,
    channel,
    dialsFor,
    tuneLut,
    tuneHex,
    filterString,
    globalFilter,
    tuneKey,
  };

  // A browser gets the global; check-tune.mjs runs this file in a vm and reads
  // the same object off its sandbox, so there is one shape to keep working.
  if (typeof window !== "undefined") window.__cdcTune = api;
  else if (typeof globalThis !== "undefined") globalThis.__cdcTune = api;
})();
