# Changelog

One section per public release, newest first. A version that is missing here
was never published on its own: its changes are in the next section that is
listed. The [README](README.md) describes the current build in full.

## 1.27.0 — 2026-09-15

**Firefox**

- The extension loads in Firefox 128 or later. One `manifest.json` serves both
  browser families. It has both background forms (a service worker for Chromium,
  a background script for Firefox) and a fixed add-on id, so storage survives
  when a temporary add-on is loaded again. The [README](README.md#install) has
  the install steps.
- Firefox has no keyboard lock. The option **Hold the keys Ctrl needs against
  the browser in fullscreen** is disabled there, so it does not claim to do
  something it cannot do. In Firefox, Ctrl+W and Ctrl+T stay the browser's keys.
- The memory readout shows less in Firefox, because Firefox has no
  `performance.memory`.
- The minimum Chrome/Edge version is now 121 (it was 111).

**The radar**

- It shows the game's own event pings: a base or a harvester attacked, an enemy
  superweapon detected, a cloaked unit sensed, a beacon dropped, a map trigger
  fired. The animation, the colours and the lifetime come from the client's own
  radar rules. A ping lives in game time, so it stops while the game is paused.
- The cursor over the radar shows what a click will do (move, attack or nothing),
  with the client's own pointer art. The bar under the radar names the object
  under the cursor. When a tile holds both ore and a unit, the bar names the
  unit.
- A destroyed building shows as rubble for its death animation, as on the game's
  radar.
- The camera's rectangle uses your side's colour.
- When the radar is down, the panel shows a cover, not a blank area.
- The paradrop plane shows on unexplored ground, as it does on the game's radar.
- The shroud and ore updates run on a clock. Before, a faster refresh (as when a
  ping animates) also made them run up to three times as often.

## 1.24.1 — 2026-08-31

- Our own radar: the map render as a radar of its own, on a key.
- The taunts on a key, as a grid under the cursor.
- A replay can be re-run, and the report shows what the file alone cannot give:
  power and brownouts, factory counts, and what a spy took.

## 1.4.0 — 2026-08-24

- A mouse press binds wherever a key does, build orders included.
- A chord grid offers only what you can build.

## 0.98.0 — 2026-08-23

- An option paints a match by role (you, your allies, each opponent), so two
  enemies never share a colour.

## 0.96.0 — 2026-08-22

- A key you rebound is no longer swallowed by a surface that this build does not
  have.

## 0.95.0 — 2026-08-21

- The shipped text no longer points at surfaces that this build does not have.

## 0.94.0 — 2026-08-21

- The first public release: pre-game information on the loading screen and a
  keyboard for Chrono Divide.
