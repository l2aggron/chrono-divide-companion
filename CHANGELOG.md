# Changelog

One section per public release, newest first. A version that is missing here
was never published on its own: its changes are in the next section that is
listed. The [README](README.md) describes the current build in full.

## 1.28.0 — 2026-09-15

**Firefox**

- Queue next on the grid's `w` and `t` slots works in Firefox 151 or later.
  The option **Hold the keys Ctrl needs against the browser in fullscreen** is
  enabled there again: when the game goes fullscreen it takes Firefox's own
  fullscreen keyboard lock, so Ctrl+W and Ctrl+T reach the grid instead of
  closing the tab or opening a new one. Outside the open grid, Ctrl+W still
  closes the tab.
- In Firefox, a change to that option applies the next time the game enters
  fullscreen, and while the lock holds, Escape leaves fullscreen only on a long
  press.
- In Firefox 128–150 the option stays disabled.

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

**The sidebar**

- A key of yours collapses the right-hand panel to its power bar. The power bar
  moves flush against the right edge, the game view widens into the freed
  strip, and the camera pans to the map edge that it reveals. The game's own
  in-game menu shows the panel again for as long as the menu is open.

**Our own radar**

- The map render as a radar of its own, on a key: terrain, ore, units, tech
  buildings and the camera's rectangle as separate layers.
- It hides what you have not scouted, behind your own shroud.
- Clicks work as on the game's radar: an order, a camera move, and `Alt`+right
  drops a beacon.
- The bar under it shows your money.

**Taunts**

- The game's eight taunts as a grid under the cursor, on a key of yours.
- The grid shows what each taunt says and whose it is.
- Which taunt sits on which key is yours to set, for any of the nine countries
  that have taunts.
- The settings page plays the taunts back.

**Replays**

- Open a `.rpl` from your own disk. It is matched to its own match by the id in
  its header.
- The match can be re-run in a game tab that the extension opens and closes by
  itself, also from the file alone when the hosts no longer serve the replay.
  The report then shows what the file cannot give: power and the brownouts under
  it, build speed and the factory count per queue, and what each spy took.
- The charts are one column of full-width rows with one shared crosshair, in an
  order you set by dragging.

## 1.4.0 — 2026-08-24

- A mouse press binds wherever a key does, build orders included. Buttons 3 and
  up, bare or with modifiers.
- Game commands on our keys: a key of yours fires one of the client's own
  commands. This is how a command that the client does not let you rebind (the
  alliance screen on `Tab`) moves to another key.
- The memory readout: what the tab holds, graphics memory included, with the
  trend over the last quarter of an hour. It opens by itself when something is
  wrong.
- The default panel keys moved off the digits `1`, `2`, `5` and `7` to `Alt` and a
  right-hand letter, which the game's own default key table leaves free. As before, you can bind
  every panel to another key in the options page.
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
