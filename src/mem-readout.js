/**
 * The memory readout: what this tab is holding, and a warning before it dies.
 *
 * Players report the tab crashing, and one of them reports the stage before it
 * — a page that is still there with a blank canvas. That is a lost WebGL
 * context, which is what the GPU process does when it runs out, so the two
 * complaints are one failure at two moments rather than two failures.
 *
 * **What this cannot be built on, established the expensive way.**
 * [[replay-run-crash]] lost five tabs proving that `performance.memory` is
 * blind to it: seven runs died at ~1146 MB against a `jsHeapSizeLimit` of
 * 4192 MB with the heap flat throughout. So the heap is one channel of four
 * here, kept because it is the only one with a real readable ceiling, and
 * `src/gl-meter.js` supplies the rest by counting at the GL boundary.
 *
 * Three parts, split by what can be tested without a browser:
 *
 *   createMeter(deps)  the sample ring, the trend, the alarm rule and the
 *                      trace — plain arithmetic over readings, which is what
 *                      lets scripts/check-memory.mjs drive a whole match's
 *                      worth of them through this very file
 *   createPanel(deps)  the DOM
 *   the constants       shared with the checks so a threshold cannot drift
 *                      between the rule and its test
 *
 * **The trace is the point of the exercise.** A tab that is killed reports
 * nothing — that is what made the original crashes so expensive — so the ring
 * is written to `localStorage` as it fills and marked closed on `pagehide`. A
 * tab that dies never writes that mark, so the next boot can say what the last
 * session ended at. Every number this file shows a player is also a number the
 * next session can read back.
 *
 * `window.__cdcMem` is what `src/companion.js` wires up, the way it wires
 * `src/debug-hud.js`.
 */
(() => {
  "use strict";

  /**
   * The share of `jsHeapSizeLimit` that forces the panel open.
   *
   * The one threshold here with ground under it: the limit is a number the
   * platform states, and a heap at 85% of it is a page minutes from a
   * collection it cannot win. It is deliberately *not* the alarm the crashes
   * that prompted this were about — those died at a quarter of the limit — so
   * it is a floor under a different failure, not the answer to this one.
   */
  const HEAP_ALARM = 0.85;

  /**
   * No GPU threshold, and this is a decision rather than an omission.
   *
   * Nothing in this repo calibrates what a critical texture footprint is; there
   * is no readable ceiling to take a share of, and a match's build-up phase is
   * genuine growth that any level-based rule would fire on. So the GL numbers
   * are shown and recorded and never alarm. The traces this ships are what a
   * threshold would have to be derived from, and this constant exists to hold
   * the place and the reason.
   */
  const GPU_ALARM = null;

  // How often a sample is taken. Both are cheap — a property read and a walk of
  // four counters — but a panel nobody is looking at has no reason to be the
  // faster of the two, and the trace wants a steady cadence more than a dense
  // one.
  const SAMPLE_OPEN_MILLIS = 2000;
  const SAMPLE_IDLE_MILLIS = 5000;

  /**
   * How many samples the ring holds: 15 minutes at the idle cadence.
   *
   * Long enough to cover the shape of a ladder match, short enough that the
   * whole trace stays a few kilobytes of `localStorage` — it shares an origin
   * with the client's own `_r_*` keys and has no business crowding them.
   */
  const RING = 180;

  // Written no more often than this, whatever the sample cadence: a synchronous
  // `localStorage` write is the one expensive thing in this file, and a trace
  // five seconds behind the panel loses five seconds of a story that is
  // measured in minutes.
  const TRACE_WRITE_MILLIS = 5000;

  const TRACE_KEY = "cdc.memTrace";
  const TRACE_VERSION = 1;

  /**
   * The trend window: the shape that separates a renderer which disposes from
   * one which does not.
   *
   * A quarter of the ring at each end, compared by median rather than by first
   * and last reading — a single sample taken during a collection would
   * otherwise report a healthy fall on a tab that is climbing steadily.
   */
  const TREND_SLICE = 0.25;

  // Below this a trend is called steady rather than given a direction. A
  // megabyte a minute over a 35-minute match is 35 MB, which is noise next to
  // the numbers this panel deals in.
  const TREND_FLOOR_MB_PER_MIN = 1;

  const MB = 1024 * 1024;

  function toMb(bytes) {
    return Math.round((bytes || 0) / MB);
  }

  function median(values) {
    if (!values.length) return 0;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  }

  /**
   * One reading, flattened.
   *
   * A flat object of numbers rather than the nested shape `__cdcGl.read()`
   * returns, because this is what goes into the ring and therefore into the
   * trace, and a trace is read back by a session that may be several versions
   * newer. Names, not positions.
   */
  function reading(at, heap, gl) {
    return {
      at,
      heapMb: heap ? toMb(heap.used) : null,
      heapLimitMb: heap ? toMb(heap.limit) : null,
      texMb: gl ? toMb(gl.bytes.textures) : null,
      bufMb: gl ? toMb(gl.bytes.buffers + gl.bytes.renderbuffers) : null,
      textures: gl ? gl.live.textures : null,
      buffers: gl ? gl.live.buffers : null,
      renderbuffers: gl ? gl.live.renderbuffers : null,
      framebuffers: gl ? gl.live.framebuffers : null,
      madeTextures: gl ? gl.made.textures : null,
      lost: gl ? gl.lost.count : 0,
      contexts: gl ? gl.contexts : 0,
    };
  }

  /**
   * @param deps  `now` and `store` are injected rather than reached for so the
   *   checks can run a whole match through this in milliseconds against a plain
   *   object; `readHeap` and `readGl` are the two live sources; `note` is the
   *   companion's own log.
   */
  function createMeter(deps) {
    const { now, store, readHeap, readGl, note } = deps;

    const ring = [];
    let wroteAt = 0;
    let startedAt = now();
    // What the previous session's trace said, read once at construction —
    // before this session's own writes can overwrite it.
    const previous = readTrace();

    function readTrace() {
      let raw = null;
      try {
        raw = store.getItem(TRACE_KEY);
      } catch (e) {
        note("the stored memory trace could not be read, starting a new one", "warn");
        return null;
      }
      if (!raw) return null;
      let parsed = null;
      try {
        parsed = JSON.parse(raw);
      } catch (e) {
        note("the stored memory trace is unreadable, starting a new one", "warn");
        return null;
      }
      if (!parsed || parsed.v !== TRACE_VERSION || !Array.isArray(parsed.rows) || !parsed.rows.length) {
        return null;
      }
      return {
        // A trace whose `closed` mark is missing is a session that never
        // reached `pagehide` — which is exactly what a killed tab looks like,
        // and the whole reason this is written to disk at all.
        died: parsed.closed !== true,
        at: parsed.at || 0,
        rows: parsed.rows,
        last: parsed.rows[parsed.rows.length - 1],
        first: parsed.rows[0],
      };
    }

    function writeTrace(closed) {
      if (!ring.length) return;
      try {
        store.setItem(
          TRACE_KEY,
          JSON.stringify({ v: TRACE_VERSION, at: startedAt, closed: !!closed, rows: ring })
        );
        wroteAt = now();
      } catch (e) {
        // Quota, or storage denied outright. Worth one line and no more: the
        // panel still works, only the evidence after a crash is lost.
        note(`the memory trace could not be written (${e && e.message})`, "warn");
      }
    }

    function sample() {
      const at = now();
      const gl = readGl();
      const row = reading(at, readHeap(), gl);
      ring.push(row);
      while (ring.length > RING) ring.shift();
      // An alarm is written through immediately whatever the throttle says:
      // the samples either side of the thing going wrong are the ones the next
      // session will want, and they are the likeliest to be the last ones.
      if (at - wroteAt >= TRACE_WRITE_MILLIS || alarm()) writeTrace(false);
      return row;
    }

    /**
     * What forces the panel open, or null.
     *
     * Two rules, both ground truth. Ordered so the context loss wins a tie: a
     * heap near its limit is a prediction, and a lost context is the failure
     * having already happened, so it is the one worth naming on screen.
     */
    function alarm() {
      const row = ring[ring.length - 1];
      if (!row) return null;
      if (row.lost > 0) {
        return {
          kind: "context",
          text:
            row.lost === 1
              ? "the graphics context was lost — this is the blank screen"
              : `the graphics context has been lost ${row.lost} times`,
        };
      }
      if (row.heapMb !== null && row.heapLimitMb) {
        const share = row.heapMb / row.heapLimitMb;
        if (share >= HEAP_ALARM) {
          return {
            kind: "heap",
            text: `the page heap is at ${Math.round(share * 100)}% of what this browser allows it`,
          };
        }
      }
      return null;
    }

    /**
     * Megabytes a minute, over the ends of the ring.
     *
     * `null` until the ring holds enough to have two ends worth comparing —
     * a trend drawn from four samples is a mood, and this panel is shown to
     * people who are being asked to believe a number.
     */
    function trend(field) {
      const span = Math.floor(ring.length * TREND_SLICE);
      if (span < 2) return null;
      const head = ring.slice(0, span);
      const tail = ring.slice(-span);
      const from = head.map((r) => r[field]).filter((v) => v !== null);
      const to = tail.map((r) => r[field]).filter((v) => v !== null);
      if (!from.length || !to.length) return null;
      /**
       * The denominator is the gap between the two windows' own midpoints, not
       * the length of the whole ring.
       *
       * A median sits at the centre of its slice, so dividing the difference
       * between two of them by end-to-end time is dividing a 30-minute rise by
       * 39 minutes: it understated a curve genuinely climbing at 12 MB a minute
       * as 9. Understating growth is the one direction a leak readout must not
       * be wrong in, so the time is taken the same way the value is — the
       * median of each slice's own timestamps.
       */
      const minutes = (median(tail.map((r) => r.at)) - median(head.map((r) => r.at))) / 60000;
      if (minutes <= 0) return null;
      const rate = (median(to) - median(from)) / minutes;
      return Math.abs(rate) < TREND_FLOOR_MB_PER_MIN ? 0 : rate;
    }

    return {
      sample,
      alarm,
      trend,
      latest: () => ring[ring.length - 1] || null,
      samples: () => ring.slice(),
      /** The previous session's trace, if it ended without saying goodbye. */
      lastSession: () => previous,
      /** Called from `pagehide`: the mark whose absence means the tab was killed. */
      close: () => writeTrace(true),
      // For the debug panel and `__cdc`, which want the whole picture rather
      // than the row the panel draws.
      raw: () => ({ startedAt, count: ring.length, wroteAt }),
    };
  }

  /**
   * The panel.
   *
   * Same shape as the net readout — a small draggable box of live numbers —
   * because it is the same kind of thing and a second visual idiom for it would
   * be novelty rather than design.
   */
  function createPanel(deps) {
    const { meter, layer, makeDraggable, note, store, keyLabel, onVisibility } = deps;

    const LAYOUT_KEY = "cdc.memRect";

    let visible = false;
    let el = null;
    let drag = null;
    // Which alarm the panel was last forced open for. A player who closes the
    // panel after being shown a lost context should not have it thrown back at
    // them every two seconds — but a *different* thing going wrong is news
    // again, so this holds the kind rather than a boolean.
    let forcedFor = null;

    function savedRect() {
      try {
        const raw = store.getItem(LAYOUT_KEY);
        return raw ? JSON.parse(raw) : null;
      } catch (e) {
        note("the stored memory panel position is unreadable, ignoring it", "warn");
        return null;
      }
    }

    function toggle(force) {
      visible = force === undefined ? !visible : !!force;
      // Closing it by hand is the player's answer to the alarm they were shown.
      // Without this the panel reopens on the next sample and the key looks
      // broken, which is a worse bug than the one being reported.
      if (!visible) forcedFor = alarmKind();
      render();
      if (onVisibility) onVisibility(visible);
      return visible;
    }

    function alarmKind() {
      const alarm = meter.alarm();
      return alarm ? alarm.kind : null;
    }

    /**
     * Open the panel if something is wrong and it has not already been shown
     * for this. Called after every sample.
     */
    function enforce() {
      const kind = alarmKind();
      if (!kind) {
        // The alarm clearing re-arms the force: a heap that comes back down and
        // climbs again is a second event, and the player who dismissed the
        // first one has not been told about it.
        forcedFor = null;
        if (visible) render();
        return false;
      }
      if (kind === forcedFor) {
        if (visible) render();
        return false;
      }
      forcedFor = kind;
      if (!visible) {
        note(`memory: ${meter.alarm().text} — opening the readout`, "warn");
        toggle(true);
        return true;
      }
      render();
      return false;
    }

    function row(body, label, value, quality, extra) {
      const line = document.createElement("div");
      line.className = "cdc-mem-row";
      const name = document.createElement("span");
      name.className = "cdc-mem-label";
      name.textContent = label;
      const val = document.createElement("span");
      val.className = "cdc-mem-value" + (quality ? ` cdc-mem-${quality}` : "");
      val.textContent = value;
      line.append(name, val);
      if (extra) {
        const tail = document.createElement("span");
        tail.className = "cdc-mem-note";
        tail.textContent = extra;
        line.append(tail);
      }
      body.append(line);
      return line;
    }

    /** A trend as a player reads it, or "" when there is not enough ring yet. */
    function trendText(field) {
      const rate = meter.trend(field);
      if (rate === null) return "";
      if (rate === 0) return "steady";
      return `${rate > 0 ? "+" : ""}${Math.round(rate)} MB/min`;
    }

    function render() {
      if (!visible) {
        if (el) el.remove();
        el = null;
        drag = null;
        return;
      }
      if (!el || !el.isConnected) {
        el = document.createElement("div");
        el.className = "cdc-mem";
        el.innerHTML =
          '<div class="cdc-mem-head" title="drag to move">memory' +
          '<span class="cdc-mem-hint"></span></div>' +
          '<div class="cdc-mem-body"></div>';
        layer().append(el);
        const saved = savedRect();
        el.style.left = `${saved ? saved.left : 24}px`;
        // Below where the net panel opens, so the two do not land on top of
        // each other on a tab that has never been dragged.
        el.style.top = `${saved ? saved.top : 210}px`;
        drag = makeDraggable(el, null, (rect) => {
          try {
            store.setItem(LAYOUT_KEY, JSON.stringify({ left: rect.left, top: rect.top }));
          } catch (e) {
            note("could not persist the memory panel position", "warn");
          }
        });
        el.querySelector(".cdc-mem-hint").textContent = keyLabel();
      }
      paint();
    }

    function paint() {
      if (!el) return;
      const body = el.querySelector(".cdc-mem-body");
      body.textContent = "";
      const now = meter.latest();

      const alarm = meter.alarm();
      if (alarm) {
        const banner = document.createElement("div");
        banner.className = "cdc-mem-alarm";
        banner.textContent = alarm.text;
        body.append(banner);
      }

      if (!now) {
        row(body, "state", "no reading yet");
        return;
      }

      if (now.heapMb === null) {
        // Firefox and Safari have no `performance.memory` at all. Said out loud
        // rather than drawn as a dash, because "—" reads as "nothing is using
        // memory" and this browser simply will not say.
        row(body, "page", "not reported", "", "this browser does not expose it");
      } else {
        const share = now.heapLimitMb ? now.heapMb / now.heapLimitMb : 0;
        row(
          body,
          "page",
          `${now.heapMb} MB`,
          share >= HEAP_ALARM ? "bad" : share >= 0.6 ? "avg" : "good",
          [now.heapLimitMb ? `of ${now.heapLimitMb} MB` : "", trendText("heapMb")]
            .filter(Boolean)
            .join(" · ")
        );
      }

      if (now.texMb === null) {
        row(body, "graphics", "no context yet");
      } else {
        // Deliberately not coloured: there is no threshold behind these, and a
        // green number is a claim that things are fine. See GPU_ALARM.
        row(body, "textures", `${now.texMb} MB`, "", [`${now.textures} live`, trendText("texMb")]
          .filter(Boolean)
          .join(" · "));
        row(body, "buffers", `${now.bufMb} MB`, "", [`${now.buffers + now.renderbuffers} live`, trendText("bufMb")]
          .filter(Boolean)
          .join(" · "));
        // Made against live is the disposal question in one line: a client that
        // retires its renderables keeps these apart, and one that does not has
        // them converge.
        row(body, "made", `${now.madeTextures}`, "", "textures created since load");
        if (now.contexts > 1) row(body, "contexts", `${now.contexts}`, "avg", "more than one");
      }

      const estimate = document.createElement("div");
      estimate.className = "cdc-mem-foot";
      estimate.textContent = "graphics figures are an estimate of what was uploaded";
      body.append(estimate);

      const previous = meter.lastSession();
      if (previous && previous.died) {
        const died = document.createElement("div");
        died.className = "cdc-mem-previous";
        const last = previous.last;
        died.textContent =
          "last session ended without closing — " +
          [
            last.heapMb !== null ? `page ${last.heapMb} MB` : "",
            last.texMb !== null ? `textures ${last.texMb} MB` : "",
            last.lost ? `context lost ${last.lost}×` : "",
          ]
            .filter(Boolean)
            .join(", ");
        body.append(died);
      }
    }

    return {
      toggle,
      render,
      enforce,
      visible: () => visible,
      // The box and its drag handle, for the one caller that needs them:
      // `onPanelMouseDown` in src/companion.js starts a drag by hand while the
      // client holds the mouse, and it can only hit-test an element it has.
      el: () => el,
      drag: () => drag,
    };
  }

  window.__cdcMem = {
    createMeter,
    createPanel,
    HEAP_ALARM,
    GPU_ALARM,
    RING,
    SAMPLE_OPEN_MILLIS,
    SAMPLE_IDLE_MILLIS,
    TRACE_KEY,
    TRACE_VERSION,
    TRACE_WRITE_MILLIS,
    TREND_FLOOR_MB_PER_MIN,
  };
})();
