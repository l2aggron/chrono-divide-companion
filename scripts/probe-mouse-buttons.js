/**
 * Probe: which mouse buttons reach the page in the live client, and whether a
 * capture-phase preventDefault stops Chrome navigating back/forward.
 *
 * Paste into the game tab console (MAIN world), then play normally and press
 * every side button you have, bare and with Ctrl / Alt / Shift.
 *
 * LMB (0) and RMB (2) are left alone so the match stays playable. Everything
 * else is preventDefault + stopPropagation'd at window capture — the same route
 * src/companion.js takes for keys.
 *
 * __cdcMouseProbe.stop() removes it. __cdcMouseProbe.seen is the button set.
 */
(() => {
  if (window.__cdcMouseProbe) {
    window.__cdcMouseProbe.stop();
  }

  const box = document.createElement("div");
  box.style.cssText =
    "position:fixed;left:8px;top:8px;z-index:2147483647;max-width:640px;" +
    "font:11px/1.45 Consolas,monospace;color:#cfc;background:rgba(0,0,0,.82);" +
    "padding:8px 10px;border:1px solid #3a3;white-space:pre;pointer-events:none";
  document.documentElement.appendChild(box);

  const lines = [];
  const seen = new Set();
  let hashAt = location.hash;
  let navigations = 0;

  const draw = () => {
    box.textContent =
      "cdc mouse probe — buttons seen: " +
      ([...seen].sort().join(", ") || "none yet") +
      "\nnavigations that got through: " + navigations +
      "  ·  pointer lock: " + (document.pointerLockElement ? "held" : "free") +
      "\n" + lines.slice(-10).join("\n");
  };

  const mods = (e) =>
    [e.ctrlKey && "Ctrl", e.altKey && "Alt", e.shiftKey && "Shift", e.metaKey && "Win"]
      .filter(Boolean).join("+") || "-";

  const onMouse = (e) => {
    const ours = e.button !== 0 && e.button !== 2;
    if (ours) {
      seen.add(e.button);
      // The claim under test: this is what has to stop back/forward.
      e.preventDefault();
      e.stopPropagation();
    }
    lines.push(
      `${String(e.type).padEnd(11)} button=${e.button} buttons=${e.buttons} ` +
      `mods=${mods(e)} trusted=${e.isTrusted} lock=${document.pointerLockElement ? 1 : 0}` +
      (ours ? " [swallowed]" : " [left to the game]")
    );
    draw();
  };

  // contextmenu is separate: RMB is the game's, so it is only logged.
  const onContext = (e) => {
    lines.push("contextmenu  (left alone)");
    draw();
  };

  const onHash = () => {
    if (location.hash !== hashAt) {
      navigations++;
      lines.push(`!! hash changed ${hashAt} -> ${location.hash} — a swallow did not hold`);
      hashAt = location.hash;
      draw();
    }
  };

  const events = ["mousedown", "mouseup", "auxclick"];
  for (const name of events) window.addEventListener(name, onMouse, true);
  window.addEventListener("contextmenu", onContext, true);
  window.addEventListener("hashchange", onHash);
  window.addEventListener("popstate", onHash);

  draw();

  window.__cdcMouseProbe = {
    seen,
    stop() {
      for (const name of events) window.removeEventListener(name, onMouse, true);
      window.removeEventListener("contextmenu", onContext, true);
      window.removeEventListener("hashchange", onHash);
      window.removeEventListener("popstate", onHash);
      box.remove();
      delete window.__cdcMouseProbe;
      return "probe removed";
    },
  };
  return "probe up — press your side buttons; __cdcMouseProbe.stop() to remove";
})();
