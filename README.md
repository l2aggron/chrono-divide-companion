# chrono-divide-companion

An MV3 extension for Chrome, Edge and Firefox that adds pre-game information to the
[Chrono Divide](https://game.chronodivide.com/) loading screen:

- **Faction labels** next to every player — the country name in text, instead
  of a flag you have to recognise.
- **Hints** — derived from the map (start positions, size, theater) plus your
  own per-map notes, edited in the options page.
- **Map preview** — our own render of the map where there is one, the map's
  baked-in thumbnail otherwise, shown during loading (the client already
  renders a preview in the lobby, and the loading screen does not).
- **In-game overlay** — the same roster, map facts and hint, with the preview
  over the radar, on a key of yours.
- **Our own radar** — the map render as a radar of its own, on a key: terrain,
  ore, units, tech buildings, the camera's rectangle and the game's own event
  pings as separate layers, all of it behind your own shroud. The client's radar
  reads one colour per tile and cannot layer them. Clicks work as they do on the
  native one — order, move the camera, and `Alt`+right drops a beacon, on the
  radar or out in the world — and the cursor tells you which before you press.
- **Build hotkeys** — a key that queues one of something, which the game has
  none of. One press is one cameo click. Placement stays yours.
- **Game commands on our keys** — a key of yours that fires one of the
  *client's* own commands. It is the only way to move a command the client will
  not rebind: the alliance screen is stamped onto `Tab` every time the client
  loads its key table, and is missing from its keyboard options entirely.
  Binding `Tab` here is what frees it.
- **Taunts** — the game's eight taunts as a grid under the cursor, on a key of
  yours, laid out on the same block of keys a build chord uses. Which taunt sits
  on which key is yours to set, for any of the nine countries that have them,
  and the settings page plays them back: Red Alert 2 stores its taunts in a
  format no browser decodes, so a game tab converts one on the way out.
- **Mouse buttons as bindings** — a mouse press binds wherever a key does,
  build orders included. Buttons 3 and up, bare or with modifiers. Left, middle
  and right are never offered; the beacon above is the one fixed exception, and
  it is fixed because it has to outrun the client's own deselect.
- **Build chords** — press a sidebar-tab key twice quickly (or once, by
  preference) and that tab opens as a grid of cameos under the cursor, laid out
  like the `qwert`/`asdfg`/`zxcvb` block itself. The next key orders that slot.
  Only what you can order right now is drawn. Every tile carries what its queue
  holds — how many are ordered, and how far the one being built has got — and a
  right click on one pauses or cancels it.
- **Cancel keys** — `Alt` and a sidebar-tab key pauses what that tab is
  building and cancels it on the second press, without opening anything.
  `Alt+Shift` cancels five. Alt is the cancel everywhere: on a slot of an open
  grid it is that slot instead.
- **Queue next** — `Ctrl` on a build key or a grid slot puts the order **behind
  what is being built** rather than at the back of the queue. It is the game's
  own Ctrl+click on a cameo, which the game gives no key of its own. `Ctrl+W`
  and `Ctrl+T` are the browser's, so holding them takes a keyboard lock, which
  is a setting.
- **Superweapon keys** — once you own a superweapon, its building's key aims it
  instead of ordering another building that would grant nothing. The two
  paradrops have keys of their own. Aiming is the client's own targeting mode:
  you still click the target.
- **Production panel** — all six queues at once, including the empty ones,
  which the sidebar cannot show because it only ever draws the tab you are
  looking at.
- **The sidebar collapses to its power bar.** A key of yours hides the whole
  right-hand panel — cameos, the four tabs, the radar, the credits and the
  repair, sell, diplomacy and options buttons — and keeps the power bar, moved
  flush against the right edge instead of floating where the panel used to
  start. The game view widens into the strip that frees up and the camera pans
  to the map edge that reveals. Everything the panel does has a key by now; the
  power reading is the one part that does not, which is why it is what stays.
  The game's own in-game menu brings the panel back for as long as it is open,
  because that menu is drawn inside it.
- **The game's menu off Escape** — in a match Escape is the game's own key for
  the menu whose third button is *Abort Mission*, which is a reflex and a click
  away from quitting. It moves to a key of yours, so it opens on a press you
  meant, and Escape closes it instead — which the game itself binds no key to at
  all.
- **Net readout** — ping, how long your own orders take to come back, frames a
  second, the lockstep's turn length and every player's ping. The client draws
  these as graphs on `Ctrl+R`. This reads the same sources and writes them as
  text, including the two it computes and never shows.
- **Memory readout**, and **it opens itself when something is wrong** — what
  this tab is holding, in megabytes, with the trend over the last quarter of an
  hour. The page's own memory is the smaller half of the
  story: what actually fills up in a long match is graphics memory, which no
  browser reports to a page at all, so the extension counts it at the WebGL
  calls that allocate it. It keeps its readings across a crash, so a tab that
  is killed can still say what it was holding.
- **No waiting on the lockstep.** The game applies an order a few network turns
  after the press, so an overlay that *read* the queue to decide what the next
  press meant would decide against a state it had already changed — and a
  cancel would come out as a second pause. The overlay keeps its own copy of
  what it has ordered instead, so the keys and the tiles both see the queue as
  it will be. One press is still one action.
- **Player colours** — who is painted what, whatever they picked in the lobby: you, your
  allies, and each opponent in turn. The game repaints itself — units, buildings, radar
  blips, health bars — and nothing is sent to anyone else.

- **Replays** — a ladder replay states its own build order, and reading one
  needs neither the game nor a match. The **Replays** tab decodes a `.rpl` —
  picked off your own ladder history, or opened from a file on disk — and lays
  both players' build orders against one clock, with who won beside the name,
  what each order cost, and every loss on that same timeline. The charts under
  it are one column of full-width rows sharing one crosshair, in an order you
  set by dragging.
- **And the match can be re-run**, which is how the report answers what the file
  cannot. A replay records what each player *did*; power and the brownouts under
  it, how many factories a queue was running off, and what a spy walked away
  with are what *happened to them*, and only the simulation knows those. The tab
  plays the replay through in a game tab it opens and closes itself, at around
  forty times the speed it was played, and reads the counters off the running
  match.

- **Settings backup** — the game keeps its hotkeys in a file inside the
  browser's own private storage and its other options in that browser's
  localStorage, so a second browser starts blank and there is nothing on disk to
  copy. One file carries both, next to the extension's own bindings.

## Contents

**In a match**

- [Keys](#keys)
- [In-game overlay](#in-game-overlay)
- [The radar](#the-radar)
- [Build hotkeys](#build-hotkeys)
- [The lag, and why a press does not wait for
  it](#the-lag-and-why-a-press-does-not-wait-for-it)
- [Build chords](#build-chords)
- [Game commands on our keys](#game-commands-on-our-keys)
- [Taunts](#taunts)
- [Mouse buttons](#mouse-buttons)
- [The production panel](#the-production-panel)
- [The net readout](#the-net-readout)
- [Memory readout](#memory-readout)
- [Player colours](#player-colours)

**On the options page**

- [Per-map guides](#per-map-guides)
- [The render in the UI](#the-render-in-the-ui)
- [Full map render](#full-map-render)
- [Replays](#replays)
- [Settings backup](#settings-backup)

**Installing it, and finding out what it did**

- [Install](#install)
- [Diagnosing it](#diagnosing-it)
- [Changelog](CHANGELOG.md)

**Terms**

- [Not affiliated, and what is whose](#not-affiliated-and-what-is-whose)
- [Compatibility](#compatibility)

## Keys

**The build grid is the only thing this README names by key, and that is on
purpose.** Everything else opens on a key you set under **Settings** in the
options page, so a name printed here would be right only until somebody rebound
it — and there is no reason to think anybody kept the shipped one. What ships is
`Alt` and a right-hand letter, for the reasons under
[Build chords](#build-chords). Which letter is which is `DEFAULT_KEYS` in
`src/companion.js`, and the options page is what the running build obeys.

The grid is named because its layout **is** the keyboard's: `qq` and a slot
letter are the shape of the feature rather than a preference about it. Even
there the prefixes are read from the client's live binding table rather than
hardcoded, so rebinding your sidebar tabs moves the chords with them.

What you can bind:

| | What it opens |
|---|---|
| the [in-game overlay](#in-game-overlay) | roster, map facts, hint, and the preview over the radar |
| the [radar](#the-radar) | our own radar from our own render — terrain, ore, units, tech buildings, the camera box, behind your own shroud |
| the [production panel](#the-production-panel) | all six queues, the empty ones included |
| the [taunts](#taunts) | the game's eight taunts as a grid, each tile carrying what it says and the key the game has on it |
| the [net readout](#the-net-readout) | ping, order latency, frames, turn length, every player's ping |
| the [memory readout](#memory-readout) | what the tab is holding. It also opens itself when something is wrong |
| the preview swap | swaps both previews between the client's picture and ours, and keeps the answer |
| the full render | the whole render over the game, 90% of the viewport, translucent. Click anywhere or press Esc to dismiss |
| the game's own menu | moved off Escape (a setting). Press the key again, or Escape, to leave |
| the game's own fullscreen | moved off the client's `Alt+F` (a setting) |

`Esc` is the one fixed key, and it is the client's rather than ours: it closes
the game's menu, or the full render. In a match with neither on screen it does
nothing.

The build keys, which are the sidebar given a keyboard:

| Key | What it does |
|---|---|
| **a bound build key** | queues one of that object. `Ctrl` puts it behind what is being built, `Shift` orders five, holding it fills the queue |
| **qq · ww · ee · rr** | opens that sidebar tab as a [grid of cameos](#build-chords) under the cursor. One press instead of two is a setting |
| **a slot key** | orders that slot. `Shift` orders five. Held for about half a second it fills the queue |
| **Alt+slot key** | pauses what that slot is building, and cancels it on the second press. `Alt+Shift` cancels five, `Alt` held cancels the lot |
| **Alt+q · w · e · r** | the same pause-then-cancel aimed at what that tab is building, without opening the grid. A finished building cancels at once |
| **Alt+Shift+q · w · e · r** | cancels five, sending the pause first if the queue was still running |
| **right click on a tile** | pauses what is building, or cancels one of what is queued. `Shift` cancels all of them |
| **the key of a superweapon you own** | aims it. That is the client's own targeting mode, so you still click the target |
| **wwt (America) · wwg** | the two paradrops, which have no building key of their own |

## In-game overlay

**Its key** toggles an overlay during the match. The map preview sits on top of
the client's radar. A two-row bar at the top carries the roster on the left, one
player to a line — you / ally / opp, name, faction, in their player colour — with
the map facts over the current hint on the right.

The you/ally/opp marks appear only when the local player can be identified with
certainty (`countryName` matches exactly one player). When two players picked
the same country the marks are dropped rather than guessed — the names and
factions still read fine without them.

## The radar

**Its key** opens a radar of our own, drawn from our own map render, over the
client's. It is a clone of the native one — same ground, same click semantics —
with the detail of the render behind it, and a panel you can move and resize.

Why a second radar rather than a better first one: the client's
`MinimapRenderer` makes one pass and reads **one colour per tile**, so terrain,
shroud and ownership have to partition that single value. A canvas of our own
has no such limit, and each of them becomes a layer:

| layer | what it is |
|---|---|
| terrain | the extension's own render of this map, composited from its per-type layers and scaled to the panel |
| ore and gems | every ore and gem cell, marked in the colours from **Map rendering** — as cells rather than baked pixels, so the colour changes without redrawing anything |
| units | one blip per object, in its owner's colour; a building fills the cells of its footprint, and one that has been destroyed goes black for its death animation as it does on the game's own radar |
| tech buildings | the same six pictograms the map previews use — oil derricks, hospitals, and the rest |
| the shroud | everything above is covered wherever you have not scouted |
| the camera | a rectangle around what the game view is showing, in your side's own interface colour |
| the events | the game's own radar pings — base under attack, harvester under attack, an enemy superweapon detected, a cloak sensed, a beacon dropped — the same shrinking, spinning, colour-cycling square, over everything else |

**What it shows is what your own shroud reveals, and nothing else.** Every layer
is gated on the same mask the client's own `getVisibleUnits` filters by, a
cloaked unit is hidden unless you have shared intel with its owner, a disguised
one is drawn as its disguise, and a Gap Generator's field reads as unexplored
for as long as it is up. Start positions are not marked at all.

There are exactly **two exceptions, and both are the game's own**. An event ping
draws over the shroud because the client draws its own over the shroud, and
because a ping says nothing about the cell — only a coordinate the game has
already told you about. And a paradrop plane draws through unexplored ground,
which the native radar does too, on the same condition: only where no other
aircraft is standing on that tile.

**The bar says which cell the cursor is over, and what is on it** — and the
cursor changes to the game's own move, attack or no-action pointer before you
press, so a click on the panel is not made blind. Both come from the client's
own minimap hover, so what the cursor promises is what the click does. Nothing
is named on ground you have not scouted.

**When the game takes your radar away** — no radar building, no power, an enemy
Lightning Storm — the panel goes down with it, and now looks like it: a dead
screen rather than an empty box. It never keeps drawing while the game's own
minimap is covered, which is the whole reason the panel is allowed to exist.

### Clicking on it

| press | what it does |
|---|---|
| **left** | orders the selection there — move, attack, capture, repair, dock, whatever that target deserves |
| **right** | moves the camera there |
| **Alt + right** | drops a beacon on that cell |

The first two are handed to the client's **own** minimap click path, which is
the one its own radar dispatches into. So the client's *right click moves* option
swaps them here exactly as it swaps them there; the order is chosen by the
client's own default-action handler rather than by us; a building waiting to be
placed or a superweapon waiting for a target consumes the click as it would on
the native radar; and a click that issues no order — a left click with nothing
selected — moves the camera, which is what the native radar does too.

**Alt + right also works out in the world**, which is the point of it: one press
anywhere on the map drops a beacon on the tile under the cursor, **and the
selection survives**. The client drops the selection on any right press, so this
one is intercepted before the client sees it. Beacons are a multiplayer thing —
the client itself skips them in a skirmish, and the panel says so once rather
than leaving you clicking.

### The dials

The bar's **dials** button opens a drawer of the appearance controls that change
a live picture and leave every stored render alone: brightness, contrast, blip
size, blip brightness, how far a gap field is dimmed, and whether the shroud is
drawn at all. Click anywhere along a track to set it; right-click a track for its
default.

They are tracks rather than sliders on purpose. The client holds a pointer lock
for the whole of a match, and under one no page element can be dragged, focused
or scrolled to — so a normal slider would be inert exactly when this drawer is
wanted. One click sets a value and needs neither.

The rest of the appearance table — the ore and gem colours, the ore mark
strength, and brightness/contrast for each of the eight element types — is on the
options page under **Map rendering**, because those bake into the render and are
better judged against a big picture. Everything in both places is one shared
table: the drawer and the options page write the same values, and every picture
the extension draws reads them.

### What it puts on the wire, stated plainly

**Three things, all of them the client's own actions, and none of them new.**

- A left click is the client's own order action — the same one a click in the
  world sends, through the same method, with the same selection sync,
  duplicate-order dedupe and acknowledgement sound. One click is one order.
- A beacon is the client's own `PingLocation` action, the one its own
  *place beacon* command sends, carrying the client's own rate limit. The
  extension binds no key of its own to it: the client's `PlaceBeacon` is a mode
  you enter and then click with, and this is the same thing in one press.
- **Moving the camera sends nothing at all.** It is local render state — the
  same call the client's own radar makes — so there is no action, no traffic and
  nothing the lockstep can disagree about.

The drawing side sends nothing and asks the client for nothing: the picture is
rendered from the map file the client already parsed, and the live layers are
reads of state this client already holds.

## Build hotkeys

The client's own `KeyCommandType` has no build command — the sidebar is mouse
only — so a key that queues something is the one thing here the game cannot
already do. Bind them under **Settings** → *Build hotkeys*: pick an
object, press a combination, and in a match that key queues one of it. Placement
is untouched. A building still waits for you to click a tile.

Bindings are **per side**, because the sides do not build the same things, and
the panel offers what the client says that side can build. A key bound to
something your country cannot build — a Tesla Tank on a non-Russian Soviet — does
nothing and says so over the game rather than silently doing something else. The
same line appears when the prerequisites are not up yet, which is a different
message on purpose: one means *fix the binding*, the other means *build a
barracks first*.

Nothing about RA2's build rules is reimplemented here. A press asks the client
three questions and obeys the answers:

| Question | Asked of |
|---|---|
| may this be built right now | `production.getAvailableObjects()` — tech level, build limit, factory, prerequisites |
| which queue does it go in | `production.getQueueTypeForObject()` — Armory rather than Structures for a defence, Ships rather than Vehicles for a hovercraft |
| does the order stand | `UpdateQueueAction#process`, which re-checks availability on every client as it runs |

That last one is why this cannot desync a match: the action is the one the mouse
produces, so every client processes it identically, and an order that should not
have been accepted is dropped everywhere at once.

**`Ctrl` on a build key queues it next** — behind whatever the queue is
paying for, rather than at the back of it. See *Queue next* below. It is the same
modifier on the chord grid, and the same client action either way. A binding that
*includes* Ctrl still wins on its own key: the bare binding is only reached for
when nothing is bound to the press as it came.

**Most build keys will be bare letters, and the client uses most of those.** The
extension takes the press first and swallows it, so a binding overrides the game
command on that key. That is a choice, not an accident: `__cdc.build()` in the
console lists the bindings and says which of them override a game command — run
it once after binding a profile.

## The lag, and why a press does not wait for it

Chrono Divide is lockstep. A press does not change anything: `pushAction` puts
the order on the same `actionQueue` the mouse feeds, the turn manager sends it,
and `UpdateQueueAction#process` carries it out some network turns later — on
every client, at the same tick. Until then the local queue reads exactly as it
did before the press.

That is invisible for a mouse, because a click is decided by a player looking at
the sidebar. It is not invisible for a key, because **the overlay decides by
reading the queue** — pause or cancel, order or place, how many fit. Inside the
window it was deciding against a state it had already changed:

| press | what the client said | what was sent | what was meant |
|---|---|---|---|
| cancel key, 1st | building, at the head | pause | pause |
| cancel key, 2nd, before the turn | building, at the head — *unchanged* | pause, again | cancel |

So the cancel never went, and from the outside it looked swallowed. The same
class of thing on the other keys: fast presses queueing past the room the queue
had, and a key pressed on a queue that had just turned ready ordering a second
building instead of placing the finished one.

**So the overlay keeps its own copy.** Every action it pushes goes into a ledger
and is laid over the client's reading, so a decision and a tile both see the
queue as it *will* be. One press is still exactly one action: nothing is held
back or batched, and the first press leaves at once.

The ledger retires an action when the client's own state moves to what it
predicted, which is as soon as the turn carrying it runs. Two things it
deliberately does not do:

- **It does not cry foul when the queue moves on its own.** A unit leaving the
  factory while an order is in flight is routine, not a refusal. The reading
  becomes the new starting point and the prediction goes on top of it.
- **It does not guess about a refusal.** `UpdateQueueAction#process` re-checks
  availability as it runs, so an order that stopped being legal between the press
  and the turn is dropped in **silence** — nothing will ever say so. An action
  that has neither landed nor become moot inside a second and a bit is called
  lost, the tile snaps back to the truth, and the overlay says which of the
  order, the cancel or the hold went missing. Late and right, rather than early
  and sometimes wrong.

`__cdc.build().prediction` reports what the wait actually measured this session
— `lastMs` and `worstMs` are how long a pushed action waited before the client
showed it. The deadline in `src/queue-predict.js` is a backstop picked without a
measurement, and that is where the measurement to replace it comes from.


## Build chords

The flat table above binds one key to one object, which runs out of keys. The
chords use the ones the game already spent.

The client *does* have keys for the four sidebar tabs — `StructureTab`,
`DefenseTab`, `InfantryTab`, `UnitTab`, on `q`/`w`/`e`/`r` unless you have
rebound them. **Press one twice quickly** and that tab opens as a grid under the
cursor, laid out like the keys themselves:

```
q w e r t
a s d f g      the block the grid draws, and the keys that pick from it
z x c v b
```

So `qq` is *buildings*, and `qqq` is a power plant, `qqw` a barracks, `qqe` a
refinery. **Shift** orders five of a unit — the client's own shift-click
quantity — **holding** a slot key fills its queue, **Alt** on a slot cancels
what that slot is building, **Ctrl** on a slot orders it *next*, and `Esc` or a
click anywhere outside closes the grid. Ctrl does not close it — the modifier
is worth more as *order this next*.
A buildings grid closes itself after an order, since that queue holds one item
anyway. A units grid stays open so the next order is one key. And when the
building on a grid you are watching **finishes**, the tab key that opened it
places it, rather than ordering the slot it sits on — the rule below.

**One press, if you would rather.** *Settings* → *Build chords* has a
tick that opens the grid on the first press instead of the second. Nothing else
changes: the press still reaches the client, the tab still switches, and the grid
is simply in the way of the next key — which is the point of it, and why the
double tap is still the default.

**The first press is still the game's.** It is not swallowed and not delayed: the
client switches the tab exactly as it does without the extension, which only
notices that it happened. That is also why the prefix is read from the client's live
binding table rather than hardcoded — rebind your tabs and the chords move with
them, and the grid can never open on a different tab from the one the first
press just selected.

**What cannot be ordered is dimmed, not hidden.** Drawing only what a press
would order costs two things: the grid's shape changes under the hand between two
openings, and the one question a greyed tile answers — *the key is right, so
what is the thing waiting on?* — cannot be asked at all. So a key waiting on a
battle lab, an Ore Purifier already standing, and a superweapon halfway through
its charge are all drawn, dimmed on the picture and the name while the key badge
and the countdown stay readable. Pressing one says what it is waiting on rather
than doing nothing.

**Or only what you can build right now**, which is a setting rather than the
other rule back: *Draw only what you can build right now*, on the options page
beside the rest of the chord settings. Ticked, a key still waiting
on the **tech tree** is not drawn — a prerequisite that is not up, a factory you
no longer have, a unit that only a spy in the enemy battle lab unlocks, which
appears on its own key the moment the spy is out. What you **already own** is
dimmed rather than hidden, because that is a different fact: an Ore Purifier or a
Cloning Vats at its build limit, a superweapon you are holding. The cell stays
empty either way, so no key after it moves. Only a trailing row with nothing left
in it is dropped, which is what makes an early-match units grid two rows instead
of three of nothing. A tile is hidden and shown **live**, on the same repaint the
dim rides — build the battle lab and its keys arrive under the open grid.

**A build limit dims its key.** `BuildLimit` is the third clamp on an order, and
the client checks it where the order is placed rather than where availability is
decided — so an Ore Purifier already standing stays *available*. Without a rule
of its own its tile would look ordinary and press into silence, so it dims like a
full queue instead, and the press says *you have all of those you may build*.

A cell goes blank only for what this country can **never** have: a slot none of
whose ids it builds — a German Tank Destroyer on a Korean grid — and a paradrop
whose building nobody has, since the picture for those comes off the weapon
itself. Blank keys still keep their cell, because the grid's geometry *is* the
keyboard's and a hole that closed up would move every key after it. A trailing
row with nothing in it is dropped instead.

**Every tile says what the queues say about it.** A `×N` in the corner is how
many are ordered, and the one at the head of its queue carries a bar and a
percentage — the same numbers the sidebar draws on the cameo it is showing you,
for all fifteen keys at once. A tile with nowhere to go greys out: the queue is
at its size, or that object is at its per-type cap of 30. All of it is painted
off the client's own `onQueueUpdate`, which fires on every tick that spends
credits, so the bar moves with the build and **stops dead when the money runs
out** — a queue that has stalled looks different from one that is slow.

**Right-click a tile to pause or cancel it**, which is what right-clicking a
cameo has always done:

| the tile | right click | Shift + right click |
|---|---|---|
| what is being built now | **pauses** the queue — pause belongs to the queue, so pausing a Grizzly pauses the war factory | the same. Pause has no quantity |
| something behind it in the queue | **cancels one** | cancels **all** of that object |
| nothing of it queued | says so | — |

Left click still resumes a paused item, because that is the client's own rule.
The money comes back only when the last of an object leaves the queue —
cancelling one of three refunds nothing — and that is the client's arithmetic,
not ours.

**A superweapon's key aims it, once you have one.** `wwd` orders a
Chronosphere until one is standing. After that the same key hands it to the
client's targeting mode, and the tile shows the charge where a queue's progress
would be — a countdown, then `ready` in green, or `no power` if the base has
browned out and the clock has stopped. Ordering a *second* Chronosphere is not on
that key any more, and losing that is the point rather than a cost: the client
adds a superweapon to a player once (`!has(name)`), so a second building grants
nothing but a spare. The sidebar still sells one if you want it.

**Which keys change meaning is the game's decision.** A superweapon section with
`ShowTimer=yes` — the Nuke, the Iron Curtain, the Chronosphere, the Weather
Controller — takes its building's key. `ShowTimer=no` does not, and that is why
`qqt` goes on building airfields for an American: their Airforce Command grants
`AmericanParaDropSpecial` as a side effect, and you build several of them for the
planes.

**So the two paradrops get keys of their own**, and they are the only things on
the grid that are not objects:

| key | what | who has it |
|---|---|---|
| `wwt`, Allied | **American paradrop**, sharing the Grand Cannon's key as a deck | America. The other half is French, so the key is dead for neither and no third country loses anything |
| `wwg`, both sides | **Airport paradrop**, off a captured tech airport | anyone who captures one — the same key on both grids, like the shipyard's, for the thing a match may never hand you |

A key like that is drawn only while you actually hold the weapon. It is the one
place the dim-rather-than-hide rule above does not reach, for two reasons that
point the same way. A paradrop you have no building for is *never* rather than
*not yet* for three of the five countries. And its picture is read off the
weapon, so there would be nothing to dim. Once you hold it, it dims like
anything else until it is charged. In the options page they are a
*Superweapons* group in the picker, each named after the building it comes
from.

**Aiming is not firing.** `activateSpecialMode` enters `SpecialActionMode`: it
plays the client's own `EVA_SelectTarget`, swaps the cursor to the weapon's, and
the `ActivateSuperWeapon` action is pushed by **the click that follows**. The
Chronosphere is two clicks, because its rules say `PreClick=yes` and the second
half is a separate weapon (`ChronoWarpSpecial`). Nothing here decides *where* a
superweapon lands — the same statement the rest of this extension makes about
placement. It is also why an activation closes the grid: the box takes the mouse,
and the next thing you do is click the map.

**`Alt` and a tab key is that same right click, without opening anything.** It
acts on what the tab is building — the item the queue is paying for — and it is
the sidebar's own rule, not a new one:

| the press | what happens |
|---|---|
| **Alt+Q · W · E · R** on a running queue | **pauses** it — pause belongs to the queue, so this is the war factory, not the Grizzly |
| the same press again | **cancels one** of what it paused |
| on a *finished* building | **cancels it** at once: a ready queue has nothing left to pause |
| **Alt+Shift** + one of them | cancels **five**, and sends the pause first if you had not already — you asked for five gone, not for a queue on hold |
| nothing queued on that tab | says so, and does nothing |

The Units tab feeds three queues — Vehicles, Ships and Aircraft — so the press
takes the one that is actively building, and failing that the first that holds
anything.

**Which of the three a second press finds is not decided again.** Picking the
active queue each time works only on a tab with one queue running. Put two war
factories' worth of work on the Units tab and the pause leaves Vehicles no
longer *active*, so a second press moves on to Ships and pauses that instead.
The pair comes apart, and the thing you meant to cancel is never cancelled. So
the
queue a cancel key last acted on wins for as long as it still holds something,
which is the sidebar's own behaviour: a right click is a click on one cameo, and
pausing, wandering off and cancelling reaches the same queue however long the
gap.

**Alt on a slot key is that tile's right click.** The same pause-then-
cancel the tab key sends, aimed at the key you name rather than at whatever the
queue happens to be paying for — so a Grizzly three deep in the war factory is
`rr` then `Alt+w`, without hunting for the cameo. It follows the **key** rule
rather than the mouse one: the first press pauses a running queue and the second
cancels, because that is what `Alt`+tab already does and two cancel keys that
disagreed about the first press would be two rules to remember. `Alt+Shift` is
five. Alt on a key the grid does not have is still the game's, and the grid
closes.

**A held key means all of it.** Keep a slot key down for about half a
second and the queue **fills** — to the room it has left, which is the client's
own clamp. Keep `Alt`+slot down and the whole of that item is **cancelled**. The
tap is not delayed to find out: one is ordered (or the pause is sent) the instant
the key goes down, and the hold adds the rest on top. Letting go before the half
second leaves you exactly where the tap left you, and losing the window while
holding — Alt+Tab — drops the hold rather than firing it late.

**Ctrl orders it next.** The one thing a cameo can do that no key could:
the client's `UpdateType.AddNext`, which the sidebar has had since its own v0.79
and which its `KeyCommandType` never got a command for. `Ctrl` on a slot, on a
tile's own key, or on any of the flat build keys puts the order **behind what is
being built** rather than at the back of the queue.

"Next" is literal rather than "first", and the shape is worth knowing because it
is what the grid then draws. `ProductionQueue#insertAfterFirst` cuts the head
entry to one, puts yours in behind it, and re-pushes the rest of the head entry
behind that:

| before | press | after |
|---|---|---|
| `Rhino ×5`, 40% built | `Ctrl` on the Grizzly | `Rhino ×1` still 40% built, `Grizzly ×1`, `Rhino ×4` |
| `Rhino ×5` | `Ctrl` on the Rhino | `Rhino ×1`, `Rhino ×1`, `Rhino ×3` — entries are not merged |
| empty queue | `Ctrl` on anything | the same as no Ctrl at all |

So the unit you were half way through keeps its progress and its place, and
nothing is refunded or restarted. `Ctrl+Shift` inserts five and `Ctrl` **held**
fills the queue behind the head. It does nothing on the two building tabs, whose
queues hold one item — there is never a second thing to jump.

The prediction models the split exactly, entries and order included
(`src/queue-predict.js`). It has to: the ledger recognises its own action by
the item list, so an algebra that merged the entries or inserted at the front
would read every next-order as the client contradicting it and report a landed
order as lost.

So the whole scale on one hand: **tap** is one, **Shift** is five, **hold** is
everything. And **Alt** turns any of the three from an order into a cancel.

**What our own keys ship on is off that block, and it is `Alt` and a right-hand
letter.** Both halves of that are a constraint rather than a taste. Which letter
carries which panel is `DEFAULT_KEYS` in `src/companion.js` and nowhere in this
document, because it is a default rather than a fact about the extension.

*Off the block*, because an open grid spends every modifier on those fifteen
letters: bare orders, Shift orders five, Alt cancels, and Ctrl queues next. A
fixed hotkey there would stop working whenever a grid was up, so a slot key and
Ctrl are both refused as bindings.

*Under `Alt`*, because it is the emptiest space the client has. That is read out
of the shipped `[Hotkey]` table in `langmd.mix` plus the seven defaults
`KeyBinds#load` injects over it: the only two entries under `Alt` are
`ToggleMarbleMadness`, which is in the enum and never registered, and
`ToggleShroud`, which is registered only while cheats are on. Every other
modifier is spoken for — a bare digit is `TeamSelect`, `Shift`+digit is
`TeamAddSelect`, `Ctrl`+digit is `TeamCreate`, `Alt`+digit is `TeamCenter`, and
`Ctrl`+letter is eight inert commands, three cheats, `Ctrl+R` and the browser's
own tab keys.

*Right-hand letters*, because the left hand is spent on the grid and none of
these is a mid-fight press — the hand leaving the mouse costs nothing that
matters here. Within the right hand the letters are mnemonic where a panel has
an initial to take, and positional where it does not: the panels and pictures
sit in the order they are reached for, and the two opened when something is
wrong sit together, away from the rest.

**One caveat is not visible from that table.** AltGr on a German or Polish layout
arrives as `ctrlKey && altKey`, and `matchesHotkey` compares the modifier state
exactly — so these fire on the left `Alt` only.

**A key you rebound yourself is left alone**, and the options page marks a
binding that lands on the block or on Ctrl as shadowed, so a rebind that would be
eaten says so before you play with it.

**The game's own fullscreen key moves off `Alt+F`.** That is what the client
binds fullscreen to — its menu says so *where an exit would be*, since on a page
there is nothing to exit to and leaving is closing the tab. But `f` is also the
ninth slot of the grid, and Alt on a slot key is that slot's cancel, so one press
carries two meanings. Position settles it rather than preference:

| when | `Alt+F` | the fullscreen key |
|---|---|---|
| a grid is open | cancels that slot — the grid takes the press first | fullscreen |
| no grid | nothing, the key has moved | fullscreen |
| the setting unticked | the client's own fullscreen | nothing |

**Nothing here calls `requestFullscreen`.** What goes out is a synthetic `Alt+F`
at the document, and the client does all of it — including taking the keyboard
lock it takes when it enters *its own* fullscreen. Entering fullscreen ourselves
would leave fullscreen held by a caller that never asked for the lock, and Escape
back to leaving it instead of reaching the game.

The one thing a page cannot forge is `isTrusted`, so a client that checks it would
drop the re-issue in silence. That case is **reported**, not worked around: if
fullscreen has not changed 400 ms after the press, the log says the client may be
refusing a synthetic key. `__cdc.chords().fullscreenKey` says the other half —
whether `Alt+F` is in the client's own table at all, which is the one fact only a
running match can supply.

**The game's own menu moves off Escape, onto a key of yours.** In a match
Escape is the client's key for `KeyCommandType.Options`, which opens the in-game
menu — Options, Fullscreen, **Abort Mission**, Resume Mission. That is one reflex
and one click from quitting a match, on the key a hand reaches for to cancel a
placement or clear a selection.

| when | Escape | the menu key |
|---|---|---|
| in a match, no menu | nothing — the key has moved | opens the menu |
| the menu is open | closes it, back to the match | closes it too |
| the menu is a screen deep (quit confirmation, options) | one step back | closes it |
| the full render is on screen | dismisses the render | opens the menu |
| the setting unticked | the game's own menu, on Escape | nothing |

**The second half is not symmetry, it is a gap in the client.** Opening the menu
calls `WorldInteraction#setEnabled(false)`, which *removes the client's own
keydown listener* — so with the menu up no key reaches the game at all, Escape
included, and *Resume Mission* is a mouse click or nothing. Ours is the only
listener still standing, which is what makes closing it from the keyboard
possible in the first place.

**Nothing here forges a keypress.** The client's `GameMenu` instance is captured
off its own `init` — the same prototype hook `CombatantUi` gets — and `open()`,
`close()` and `controller.popScreen()` are called directly, so the events that
unlock the pointer and re-enable the world interaction are the client's own. That
is the difference from the fullscreen swap above, which has no method to call and
therefore carries a residual `isTrusted` risk this does not.

**Both halves stop the moment the match does.** A match ends with the client
disposing its player UI — which takes its own `keydown` listener with it — and
only leaving the game screen five seconds later, with the menu object still alive
in between. In that window the client's Escape is already dead, so a key still
answering would open the menu onto a screen the client had finished with: the
open event dispatched into a disposed world interaction, a screen pushed onto a
HUD about to be destroyed, and *Abort Mission* there disposing the player UI a
second time. So the key answers only while a match is in play. A menu that was
already open when the match ended under it still closes.

**Which key is swallowed is read, not assumed.** The client's `KeyBinds` table is
already hooked, so the key it has on `Options` is the one taken — move it in the
game's own key settings and that move is respected, and Escape is left alone.
`__cdc.chords().menuKey` says what it found and whether the menu itself was
captured.

**Ctrl+W is the browser's, and holding it takes a keyboard lock.** The tab
closes without the page being asked, so `preventDefault` is not offered and
`Ctrl` cannot mean *queue next* on the grid's `w` and `t` slots on its own.
What a fullscreen game uses for this is `navigator.keyboard.lock()`, and so
does this. It asks for the codes a Ctrl is actually taken on, in a match, and
only while the game is in **its own** fullscreen — the client's button, not
F11. The API is defined against the Fullscreen API's element, and F11 leaves
that null. Without the lock the press is **left alone entirely** rather than
queued into a closing tab — you would lose the order and the tab and see
neither happen. It is a tick in *Overlay settings*, and `__cdc.chords()`
reports whether the lock is held. Firefox has no keyboard lock, so there the
tick is disabled and Ctrl+W and Ctrl+T stay the browser's.

**Which codes it asks for are derived, not named.** Ctrl is *queue next* across
the whole grid, whose second and fifth slots are `w` and `t`, so
`ctrlKeysToHold()` reads the keys a Ctrl is actually taken on rather than listing
them — which is why a fixed binding on `n` is held too.

**There is one lock per page, and the client is already using it.**
`keyboard.lock(codes)` **replaces** the locked set rather than adding to it, and
the client locks `Escape, F5, F12, F11` whenever it enters fullscreen, precisely
so that Escape reaches the game instead of leaving fullscreen. Asking for codes
of ours directly would release exactly that: the next Escape would drop out of
fullscreen, **leaving fullscreen ends the lock altogether**, and Ctrl+W would go
back to closing the tab. So neither side calls the API directly — the extension
wraps it, records what each side asked for, and locks the **union**, so the
client keeps its Escape and we get our Ctrl+W. Turning the setting off adds
nothing and takes nothing: the client's own lock is left exactly as it was, and
what you give up is *next* on two of the fifteen slots.

**A structures chord opens while that queue is building.** A building queue holds
one item, so there is nothing to add — but there is something to cancel, so the
grid is where you watch a construction yard and where you stop it. Finished is
different: `qq` hands the building to the client's placement mode, which is what
clicking the ready cameo does.

**And the tab key keeps that meaning under an open grid.** Watch a
construction yard on the grid you opened while it was building and the building
finishes *under* it — from that moment the queue takes nothing else until the
structure is on the ground, so every slot on the grid would be refused. So `q`
places what `qq` would have placed, `w` does the same for the defence queue, the
grid closes on the way out because the next thing you do is click the map, and
the hint line under the title says `q places` the moment it becomes true. Shift
is untouched: it still means five of that slot, which a ready queue has no room
for either. The two unit tabs never see any of this — a unit queue is never
ready, its units leave the factory on their own.

**The grid is driven by the game's cursor, not the browser's.** The client keeps
the real pointer *locked*, and the cursor you see in a match is a sprite it
draws rather than the OS one. Under a lock the browser reports the cursor as
frozen wherever it was when the lock took, and its own hit-testing cannot reach
an overlay at all. Releasing the lock is not the answer: leaving one drops the OS
cursor in the middle of the screen, away from the grid. So the lock is left
alone and the grid does the three things the browser would have done — finding
the tile under the cursor, lighting it up, and **drawing the cursor itself** —
against the cursor you can actually see. Clicks work the same in fullscreen,
because nothing about this depends on the window.

The third of those needs saying. The client's cursor is a sprite in its own
canvas and our boxes are DOM above that canvas, so an overlay would cover the
only cursor in the window and leave you aiming at a tile by dead reckoning. One
is drawn over our own boxes — over those and nowhere else, since anywhere else
the game's own cursor is right there and a second one would be two cursors
disagreeing. The production panel gets it too.

**An open grid outranks the fixed hotkeys**, and nothing is left for that to
cost: every fixed key is `Alt` and a right-hand letter, and the grid's block is
fifteen left-hand ones. The rule still stands for anything *you* bind there — a slot
key under any modifier, or any Ctrl press, goes to the grid while one is open,
and the options page marks such a binding.

**Which grid a building is on is the game's decision, not a preference.**
`BuildCat=Combat` sends a building to the Armory queue, which is the Defence tab
— so the superweapons, the Gap Generator, the SpySat Uplink and the Psychic
Sensor are on `ww`, not `qq`, however much they read like base buildings.

**One key can hold a country's two names for one thing, and you never see it.**
`AMRADR`'s rules section is literally `Name:GAAIRC` — the American Airforce
Command is not a different building, it is the one an American player gets — and
a Korean player's Black Eagle is everyone else's Intruder. Giving each its own
key would be a key dead for every country but one, so the slot holds both ids
and the *match* decides. Since every country on the side gets one of them, there
is nothing here for you to know: the key is the Airforce Command Headquarters,
or the Intruder, under its plain name and its own picture, in the editor as in
the game. The pair behind it is machinery.

**Both sides are the grids their player arrived at.** Each was adopted from a
profile that had been pressing it for a season — which outranks the two rules a
layout could be built on instead, tech order and the mirror, because it is the
only one with evidence behind it. What is left of the mirror still holds where
the rosters do
the same jobs: the structures opening, `q` the miner and `w` the main tank and
`e` the anti-air on units, the country key, the sea. And it is broken where the
hand disagreed with it — the units grids swap `t` and `d` against each other,
the Allied `t` being the plane and the Soviet `t` the artillery.

The rows are the grouping. **`qwert` is what you build every match**: power /
barracks / refinery / war factory then radar on structures, the turrets and the
wall on defence. **`asdfg` is the late and the expensive** — battle lab,
superweapons, MCV, heavy tank, the heroes — and `g` ends the section, which is
where the **shipyard** sits rather than at its tech level, being the one
building a land map makes pointless. **`zxcvb` on the units grid is the sea**:
all five keys, attack ship and transport and capital ship on the same three of
them.

**Country units are on the key that ends their group** — `d` on the infantry
grid, after the specialists and before the heroes, and `f` on the units grid,
after the land block. The same key on both sides, so it is one key to learn per
section rather than one per grid. The Iraqi Desolator and the Cuban Terrorist
share it: most countries get neither, and giving each its own would be two keys
dead for almost everyone. The French Grand Cannon is the exception and barely
one — it is a turret, so it sits with the turrets.

In a match that key is whichever one *your* country builds, and **empty when
your country builds none of them** — a dimmed tile means "not yet", while a
German Tank Destroyer on a Korean grid is never. In the options page, which has
no country to resolve against, that one slot is drawn as a **hand of cards** —
both faces spread far enough to be read — because naming just the first would
state something false. This is the only kind of slot drawn that way: two ids
that are one object get one picture and one name, since there is no choice in
them to show.

The layouts ship filled in for both sides and are edited under **Overlay
settings** → *Build chords*: pick a side, a section, then a key, and the picker
under the grid says what is on it. Putting something on a key it already sits
somewhere else on **swaps the two** rather than leaving it in both places or
quietly emptying the old one. *Reset section* drops the override, so that section
follows what ships again.

### The keys on the game's own sidebar

A grid answers "which key builds this" once it is open. The sidebar answers it
without being asked: each cameo carries **the slot letter of its chord** in the
top-left corner, and each of the four tab buttons carries **its
own prefix key**. Read together they are the whole press — `r` on the Units tab,
`t` on a Rhino cameo, so the Rhino is `rr` then `t`.

The prefix is on the tab rather than on every cameo because it is one fact per
tab: a `qq` repeated down twelve tiles is twelve copies of something the tab
already says. Both badges sit in the same corner, and the tab's is the smaller of
the two — a tab button is a fifth the height of a cameo and its artwork is the
whole of it, so a centred badge would cover the thing it annotates.

A cameo the game has **greyed out** keeps its key, dimmed — the key is right, it
is the object that is not available yet — and a cameo nothing binds carries no
badge at all.

**They never take the mouse.** The badges are `pointer-events: none` to the last
box, which matters more here than anywhere else in the extension: this is the one
overlay sitting on top of something you have to be able to click.

**They follow the sidebar, including while you resize it.** The client draws
the whole HUD in WebGL, so there is no cameo element to attach to — the
positions are read from the client's own scene, every frame, and the DOM is
written only when one of them changes. That is what makes a mid-match scale
change a non-event. The client rebuilds its entire HUD on a viewport change — a
resize, its fullscreen button, a browser zoom — and the sidebar gains or loses
whole rows of cameos as the window gets taller or shorter. None of it is a case
this has to detect. It is just different numbers on the next frame.

**A superweapon key is two keys, and the badge follows it.** A slot
holding, say, the Chronosphere orders the building while there is none, and
*aims the weapon* once there is. The client draws those as two different cameos —
the building in its own tab, and the ability it adds to the Defence tab the
moment the weapon exists — so the badge moves with the meaning: on the building
until it is up, on the skill afterwards. A build limit greys the building's cameo
rather than removing it, which is why the badge has to be taken off it rather
than left to disappear on its own.

The **chord grid** does the same thing with the picture. A tile whose key has
stopped ordering draws the weapon's own icon instead of the building's, read
straight out of the running client — a superweapon is not an object, so its
picture is not in the extension's generated cameo sheet and cannot be. A client
that cannot answer leaves the building's cameo in place.

*Settings* → *Build chords* has a tick to turn them off.

## Game commands on our keys

The other direction of the same idea: a build hotkey sends a build order, and
one of these sends a press to the client's own `KeyboardHandler`. Bind them
under **Settings** → *Game commands*: pick a command, press a combination.

Its reason for existing is **the alliance screen**, and the reason is worth
stating exactly, because it is not a preference the client hides — it is a
binding the client re-applies. `KeyBinds#load` ends like this:

```js
        if (e) { … this.loadHotKeys(this.defaultIni) }   // the built-in defaults
        …                                                 // or the saved keyboard.ini
        this.addHotKey(KeyCommandType.Scoreboard, 9)      // and then, always, Tab
```

That last line runs after both branches, so nothing written to `keyboard.ini`
survives it. `Scoreboard` is also absent from `configurableCmds`, the list the
client's own Keyboard screen is built from — 88 commands, and that is not one of
them. So the command cannot be seen in the client's options, and could not be
moved there if it could. (`Scoreboard` opens `gameMenu.openDiplo()`, the alliance
list. The name is the client's, not a screen of scores.)

**Freeing `Tab` is therefore binding `Tab`, and nothing is written to the
client's table to do it.** The client attaches its keyboard handler on the
`document` in the bubble phase. This extension's listener is on `window` in the
capture phase, so a press it consumes never arrives. A `Tab` you have not bound
goes on opening the alliance screen, which is the right default — the change
happens when you ask for it and not before.

The list you pick from is **harvested from the running client**, not shipped
here: `sendCommands` reads the live `KeyboardHandler`'s own command table at the
start of a match. That is a smaller list than `KeyCommandType`, deliberately —
the enum carries names nothing registers (`ToggleMarbleMadness`) and names
registered only while cheats are on (`FreeMoney`), and a binding on either could
never fire. Until you have played one match with the extension installed the
panel says so rather than offering a list it has not read.

A key can be claimed by three lists, and the press resolves in one order: the
panel hotkeys, then these, then the build keys. The options page marks a row
whose key is claimed by another list and says which way it resolves, since in a
match a shadowed binding looks exactly like a broken one.

The command runs through `KeyboardHandler#executeCommand` — the same call the
client makes once it has hashed a press of its own — so trigger modes and the
pause while a menu is up are the client's own behaviour, unreimplemented. **No
synthetic `KeyboardEvent` is involved.** The extension has one of those
(`reissueFullscreenKey`) and it exists because fullscreen needs the client's
keyboard *lock*, not because a command needs a key.

## Taunts

**Its key** opens the game's eight taunts as a grid under the cursor, laid out
on the same block of keys as the [build chords](#build-chords) — `qwert` on the
top row, `asdfg` under it. A slot key sends that taunt and closes the grid;
`Esc`, or a click outside, closes it without sending. Which taunt sits on which
key is editable under **Settings** → *Taunts*, exactly as a chord layout is.
That editor draws the same tiles this does, with a row of countries over them:
the layout is one layout whichever country is picked, but the *words* are not,
and picking one is how you read another country's eight without drawing it. The
flag is the game's own art and only the in-game overlay can reach it.

**Every tile there has a ▶ that plays the taunt.** The sounds are the ones your
own client imported, and they live in the game's origin-private file system —
per origin, so a settings page cannot open one at all. The first play therefore
asks a game tab for the file and opens one if none is running; after that the
file is held in the page and playing is instant.

**The file is converted on the way out, and has to be.** Red Alert 2 ships its
taunts as **4-bit IMA ADPCM** inside a RIFF wrapper, which no browser decodes —
an `<audio>` element handed one answers *"Failed to load because no supported
source was found"*. The client never uses `<audio>`: `WavFile#getData` runs the
same `wavefile` conversion its own mixer is fed from, so the game tab borrows
that and sends PCM. A file that is already PCM goes through the same call
unharmed.

Nine countries are offered, not ten: **Yuri has no taunt files in a Red Alert 2
client**, so its lines are not carried and it is not in the picker.

**If nothing plays, the line under the grid says which absence it is**, because
there are two and they want opposite things done about them:

| what it says | what it means |
|---|---|
| *this client has no "Taunts" folder* | your import brought no taunt sounds — see below |
| *"Taunts" is there but holds no `tau…​.wav`* | the folder exists and this country's file is not in it |
| *…and did not finish loading its game files in two minutes* | the tab it asked never got past its splash screen |

**Red Alert 2 keeps its taunts as loose `.wav` files in a `Taunts` folder beside
the executable**, not inside a `.mix`. So an import taken from mix files alone —
or a client served its game data from the CDN — has no taunt sounds at all, and
that is a fact about the client rather than about this extension: *the taunts
are silent in matches too*, which is what the struck-through names in the
[in-game overlay](#taunts) have been saying. Re-importing from a full install
that has the folder is what puts them there.

`__cdc.probe()` answers it from the console without pressing anything —
`tauntSounds` is *yes*, *no — nothing imported a "Taunts" folder*, or *n/a*
while a client is still starting.

The reason it is worth a grid at all is the keys the game gives them. The
shipped `[Hotkey]` table binds `Taunt_1` … `Taunt_8` to key codes 116–123 —
**F5 to F12** — and a browser keeps the top of that range for itself: F11 is
fullscreen, F12 is developer tools, and a page cannot cancel either. So two of
the eight cannot be pressed at all in a browser, and the other six are a hand
off the keyboard mid-match.

**Each tile says what the taunt says**, and a strip over the grid says whose
taunts these are: the country you drew, with the client's own flag beside it.
Both halves are needed, because the eight lines are **per country** — every
country has its own set, and the same key means something else in the next
match. Taunt 6 is a laugh in every country and has no words at all, so it is
named rather than quoted. Between matches there is no country and no words: the
tiles fall back to what each taunt is *for* — *out of money*, *demand
surrender* — in italics, since a role is not a quote.

**The key and the number are a rail down the left of the tile**, not badges in
its corners: as badges they cost the tile a band across its whole top to clear
them, which is a row of empty pixels on every tile of the grid. The key is the
biggest thing on the tile, because it is what you press.

**A tile is a fixed size and a long line is cut rather than allowed to grow it.**
Hovering the tile shows the rest, drawn over the grid rather than inside the
tile, so nothing moves under the cursor. Whether a line was cut is *measured*,
not guessed from its length — at the shipped tile width and the client's own
condensed font none of the eighty lines is cut at all, and a browser that fell
back to a wider font is the case this exists for.

The lines are in no file the client ships. A taunt is a sound and nothing else;
there is no string table behind it, so these were transcribed from a recording
of all eight per country and are the words as spoken rather than as written
anywhere. The numbering is the client's own and runs the other way from the
order they are usually recited in: `sendTaunt(1)` is the F5 line — *out of
money* — and `sendTaunt(8)` is the F12 gloat.

**Each tile also carries the key the game itself has on that taunt**, read live
from the client's own `KeyBinds` table rather than assumed — so a taunt you have
already moved in the client's Keyboard screen shows where you moved it, and one
the client has bound to nothing says so.

**Clicking that key — or right-clicking the tile — rebinds it in the game.**
The next key you press goes through `KeyBinds#changeHotKey` and is saved to
`keyboard.ini` in the client's own file system, which is the same call and the
same file its Options → Keyboard screen writes. That binding then works with
nothing of ours on screen, and travels in a [settings backup](#settings-backup)
like any other client binding.

Two things the client's own screen does not tell you, and this does:

- **`hotKeys` is keyed by code**, so binding a taken key silently unbinds
  whatever had it. That is not hypothetical — it is how a stock install loses
  *Health Navigation*: the client wants `U` for it and the shipped ini puts
  `PageUser` on 85 afterwards, so `U` ends up a beep. A rebind here names the
  command it displaced.
- **A key this extension consumes never reaches the client**, because our
  listener is on `window` in the capture phase. Binding a taunt to one of those
  would produce a binding that is real, saved and dead, so that is reported too.
  Neither case is refused: you may mean either.

What the grid says about a taunt you cannot hear:

| the tile | what it means |
|---|---|
| dimmed | no connection, or the five-second cooldown is still running |
| name struck through | the sound file for your country is not in the client's `Taunts` folder |
| *no game key* | the client has this taunt bound to nothing |

A taunt is only ever **sent to other players** — `TauntHandler#sendTaunt` checks
that the game-server connection is open — so it does nothing at all in a match
against the computer, and the grid says so rather than letting the key look
broken. The sounds are per country and come out of your own Red Alert 2 import
(`tauru03.wav` is the Russian third taunt); a missing file costs you the sound
and nobody else theirs, since every client plays its own copy.

Taunts are also in the list under [Game commands](#game-commands-on-our-keys),
so a single taunt can have a key of ours without the grid — the two are the same
`Taunt_N` command reached two ways.

## Mouse buttons

**A mouse press binds wherever a key binds.** Click the key button in the
options page and press a mouse button instead of a key. Panels, game commands,
the game menu, build orders — all of them.

**Buttons 3 and up, and all of them.** Left, middle and right are never
offered: left is the click that opens the capture, right is the game's own
order, middle is the browser's autoscroll. Everything above is free, so nothing
above is excluded — a mouse with eight buttons either sends them as buttons, in
which case they bind here, or its driver sends keystrokes, in which case they
bind as keys.

**One combination on those three is taken anyway, and it is not bindable.**
`Alt` with the right button drops a [beacon](#the-radar) on the tile under the
cursor. It is fixed rather than offered because of what it has to do to work: the
client drops your selection on any right press, so the beacon has to be taken out
of that press before the client sees it, and keeping the selection is the whole
reason to have it. Every other right click reaches the game untouched.

Modifiers work as they do on a key. Two side buttons are eight bindings, and
`Ctrl` on a build binding still means *queue this next* — the flat build path
reads `Ctrl` and nothing else, so a side button spends one modifier there, not
three. `Alt` and `Shift` belong to the chord grid, which a mouse press never
enters.

The descriptor is a key's with `Mouse<n>` where the `code` would be, which is
why so little code was needed: both halves of the extension go on reducing a
binding through the same `bindingId`. The one thing it cannot carry is a
`keyCode` — the client's own hotkey table hashes that field, so a mouse press
can never be in that table, and a mouse binding reaches a client command
through `KeyboardHandler#executeCommand` exactly as a key does.

**What was measured, and what was not.** `scripts/probe-mouse-buttons.js`,
pasted into a console, recorded buttons 3 and 4 arriving *while the client held
pointer lock*, carrying their modifiers, with `preventDefault` keeping the
browser from navigating. What that run did not exercise is a **bare** Back or Forward — the
press a browser would actually navigate on. The options page marks that one
combination, the extension swallows the whole click rather than only its
`mousedown` (a browser acts on back/forward at the *end* of a click), and the
probe stays armed so a navigation that ever gets through writes itself to the
log.

## The production panel

**Its key** shows every production queue at once — Structures, Defence, Infantry,
Vehicles, Ships, Aircraft — with what is in each, how far the first item has got,
and whether it is ready or on hold. **A queue with nothing in it says so**, which
is the part the sidebar cannot do: it only ever draws the tab you are looking at,
so an idle war factory looks the same as a tab you have not opened.

It is live off the client's own `production.onQueueUpdate` rather than a timer,
so it costs nothing while nothing is being built, and it drags anywhere you want
it. An order you have just pressed is in it before the client has applied it. That
is the other half of the same fact: the event says nothing until the client
acts, and an **idle** queue spends no credits and so dispatches nothing at all.
Without the prediction, the first order into an empty factory would be the one
press that still looked slow. See [The lag](#the-lag-and-why-a-press-does-not-wait-for-it).

**If a key does nothing, `__cdc.build()` in the game tab's console says why.** A
dead key has five possible causes, and every one of them looks identical from
the outside:

1. the client modules did not load
2. no match is captured
3. the side did not resolve
4. the bindings never reached the tab
5. the press matches none of them

It answers all five. `__cdc.build("KeyQ")` also says what that key is
bound to here and what the client itself has on it. Two of the five are known to
happen: bindings stored and never pushed to a running tab, and client modules
imported and then not kept.

**And `__cdc.chords()` is the same answer for a chord that does not open.** It
names which prefix resolved to which section and out of whose table — the
client's live bindings, or the shipped fallback — plus how full each layout is
and whether it came from the options page or the defaults. A tab command the
client has bound to a *modified* key gets no chord at all rather than a guessed
one, and that is the one silent case, so it is listed by name.

The list of bindable objects is read from **the client's own rules**, in the
game tab, and kept in storage for the options page (which has no game and
therefore no rules of its own). It is harvested once per client version. **Play
one match** with the extension installed and the picker fills in. A match
rather than an open client. The client parses its rules during its own boot,
long before the main menu, but the harvest that reads them fires at idle from a
config push that regularly arrives while the splash screen is still up. So
match start is the attempt that reliably lands, and the same holds for the
colour table and the object table. The names, costs and pictures come off the
same trip: the object table and the cameo sheet the replay views already read,
harvested from that client and never shipped in this repo.

## The net readout

**Its key** puts the numbers behind the client's own `Ctrl+R` panel on screen as
text: ping to the game server, how long your own orders take to come back,
frames per second, the lockstep's turn length, and every player's ping. It drags
anywhere and stays where you leave it, like the production panel.

| row | what it is |
|---|---|
| **ping** | one round trip to the game server, plus the client's own median over the match |
| **order** | the gap between an order of yours going out and coming back — the number that decides how a press feels |
| **frames** | frames a second, counted here rather than read off the client's widget |
| **turn** | the network turn the server has settled on for the whole lobby, against the game turn this match's speed asks for |
| **players** | each player's ping and connection, with the age of the reading |

Colours are the client's own bands, from `gui/component/PingIndicator`: green
under 100 ms, yellow under 250, red past it. A number this panel calls bad is
the same number the scoreboard draws a red bar for.

### It is not a copy of the client's panel — it reads the same sources

`GameScreen#initNetStats` builds a `PingMonitor` at match start **whatever the
FPS flag says**, and calls `monitor()`. The flag decides two other things:
whether a `NetStats` exists to paint the samples as stats.js graphs, and how
often a sample is taken — every second with the panel up, every ten seconds with
it down. So the values are there for the reading with the client's panel closed.

One hook is the whole capture, because the `PingMonitor` instance carries the
rest: `gameTurnMgr` is the match's `LockstepManager`, `gservCon` is the server
connection, and `avgPing` is the client's own `MedianPing` reservoir. The
extension hooks `PingMonitor#monitor` — an instance method, for the same reason
every other capture here does: a constructor cannot be patched through the
prototype.

**Ping and order latency are different numbers and the difference is the point.**
Ping is one IRC round trip to the server. Order latency is measured across the
lockstep — `onActionsSent` against `onActionsReceived` for the same network turn
— so it carries the turn scheduling as well as the wire, and it is the one that
matches what a press feels like. See
[The lag](#the-lag-and-why-a-press-does-not-wait-for-it) for what the extension
does about that latency rather than merely reporting it.

**The turn row is where someone else's connection shows up.** The server
stretches the network turn to the slowest client in the lobby. The game turn is
what this match's speed asks for. Equal is the healthy case. And when a turn is
stuck long enough, the client raises its own lag state (`onLagStateChange`) —
the panel says *waiting for the other clients* rather than leaving you to guess
at a frozen screen.

### What it puts on the wire, stated plainly

**One thing, and it is the client's own ping at the client's own faster rate.**
While the panel is open the extension calls `setPingInterval(1000)`, which is
exactly what the client does for itself when `Ctrl+R` is on. Closing the panel
hands the rate back to ten seconds unless the client's own panel is up. The
call is made once a second rather than once on opening, because the client
resets that interval whenever its FPS panel is toggled — which would otherwise
leave this panel quietly showing a ten-second-old number as if it were current.

**Per-player ping is read passively and never asked for.** The `loadinfo`
answer carries every player's name, connection status, load percentage, ping and
lag allowance, and the client requests it once a second while the loading screen
is up and every ten seconds while its own in-game menu is open. The extension
subscribes to the answer and parses it with the client's own `LoadInfoParser`.
It does not send the request. That is why those rows carry an age: they are as
fresh as the last time *the client* asked, and they go stale on purpose rather
than being kept warm by traffic this extension invented.

Frames per second is the one number that is ours: `renderer.getStats()` exists
only while the client's panel is up, so the panel counts its own frames on the
same `requestAnimationFrame`. It stops counting in a hidden tab, which is
correct — a hidden tab is not rendering at all (`GameAnimationLoop` switches to
a one-second background tick), so a frame rate measured there would be a number
about nothing.

`__cdc.probe()` reports whether the hook took, so a dead hook is visible without
starting a match at all.

## Memory readout

**It has a key in a match, and it opens itself.** Players report the tab crashing,
and one reported the stage before it — the page still there with a blank
canvas. That is a lost WebGL context, which is what the GPU process does when
it runs out, so those are one failure at two moments rather than two problems.

**What this cannot be built on.** `performance.memory` is the obvious source
and it is the wrong one. Chasing a re-run that kept killing its tab, this repo
measured seven deaths at about 1146 MB against a `jsHeapSizeLimit` of **4192
MB**, with the reported heap flat through every one of them. A panel drawn from
that number would have been green through all seven. What fills up is canvases
and three.js geometry and textures: the client's `RenderableManager` retires a
renderable only from inside `Renderer.update`, so anything that stops the
render loop stops the disposal — and none of it is JS heap.

So `src/gl-meter.js` counts at the only boundary a page owns, the GL calls
themselves: textures, buffers, renderbuffers and framebuffers created against
deleted, with the bytes of each upload attributed to the object they went into,
so a delete subtracts what that object actually held. It is a content script at
`document_start` for the same reason `src/frames.js` is one — the client takes
its context while it boots, and an instrument installed afterwards instruments
nothing. **Nothing per-draw is wrapped**: every call it touches is an
allocation, made thousands of times over a match rather than millions of times
a second, so its cost does not scale with the frame rate.

Those figures are an **estimate of what was uploaded, not a reading from the
driver**, and the panel says so on its own last line. Driver padding and
compression are outside what these calls state. What means something is the
shape over a match — a renderer that disposes sawtooths, one that does not
climbs — which is why every row carries a trend in megabytes per minute rather
than only a level.

**Two things force the panel open, and both are ground truth:**

| | why it needs no calibration |
|---|---|
| the page heap past **85%** of `jsHeapSizeLimit` | the ceiling is a number the platform states |
| the **graphics context is lost** | it is not a number approaching a limit, it is the failure itself — the blank screen |

**Nothing about graphics memory raises an alarm**, and that is a decision
rather than an omission: there is no readable ceiling to take a share of,
nothing here calibrates what a critical texture footprint would be, and a
match's build-up phase is genuine growth that any level-based rule would fire
on. The figures are shown and recorded. A threshold, if one is ever added, will
come from the traces this collects. `GPU_ALARM` in `src/mem-readout.js` holds
the place and the reason, and `check-memory.mjs` asserts that 8 GB of textures
still raises nothing.

Closing the panel by hand is an answer: it stays closed for that alarm, and opens again only if
something *different* goes wrong, or if the same thing clears and comes back.

**The trace is the point.** A tab that is killed reports nothing — which is
exactly what made the original crashes so expensive to diagnose. So fifteen
minutes of readings are kept in `localStorage` as they are taken, and marked
closed on `pagehide`. A tab that dies never writes that mark, so the next boot
can say what the last session ended at, in the log and on the panel itself.
`__cdc.memTrace()` in the console is the whole curve, which is the useful thing
to ask a player for.

## Player colours

**Options page → Settings → Player colours.** Off by default. Ticked, it
paints a match by **role** rather than by lobby slot: one colour for you, one for
your allies, and an **ordered list for opponents** — the first opponent takes the
first, the second takes the second. Any row left on *as picked* changes nothing,
so forcing one role and leaving the rest alone is a first-class answer.

The ordering is what makes this more than "every enemy is red": all-enemies-one-
colour merges two opponents into one side in 2v2 and free-for-all. A **blank row
holds its place** — leaving the first opponent as picked and setting the second
still paints the *second* opponent, rather than promoting everyone up by one, so
a row means the same opponent whatever the rows above it say.

Three surfaces follow the setting: the match itself, the roster on our
loading-screen panel and the in-game overlay, and the client's own loading-screen
rows. On the loading screen there are no players yet, only the lobby's slots, so
**allies there are the lobby's teams** rather than a live alliance. And if two
people picked the same country, "you" is ambiguous, so that screen is left in
the client's colours rather than painted from a guess. The match itself has no such
doubt.

### The game repaints itself

The whole feature is one assignment: `player.color = rules.colors.get(name)`.
Every renderable the client builds re-reads its owner's colour on each update and
re-remaps its palette when it differs — the path that exists so a mind-controlled
tank turns Yuri's colour — so one write repaints that player's army, their radar
blips, their health bars and their control-group tags. **Nothing here draws
anything.**

It is applied from `Game#init`, which is the first moment every player's role
exists (the client forms the lobby's teams into alliances at the end of it) and
the last before anything has been drawn in the wrong colour. An alliance formed
or broken mid-match repaints too. The radar takes a tile's colour when the tile
is dirtied rather than every frame, so blips already on it keep the old colour
until each object next moves.

**A colour is only ever taken by name out of the client's own rules.** With
sprite batching on, a batched voxel builder resolves its palette by content
hash against a list precomputed from `rules.colors`, and throws *inside the
render loop* when the hash misses — so an invented red is a crash rather than a
red. So the options page offers a table harvested from the client instead of
colours of its own. It comes off the same trip that reads the build roster, and
it fills in when you **play a match**, not when you open the client. A name
this client does not define is skipped with a line in the log rather than
guessed at.

**It is local render state and nothing else.** Colour is absent from
`Player#getHash()`, which is what the lockstep compares, and nothing sends it.
So there is no desync, nothing on the wire, and no information a client did not
already hold: every client knows every alliance already, because the action that
forms one travels through the same lockstep everyone replays.

## Per-map guides

The extension's **options page** — click the extension's toolbar icon, or
`chrome://extensions` → Details → Extension options (in Firefox, `about:addons`
→ the extension → Preferences) — is a row of tabs:

| tab | what it is |
|---|---|
| **Ladder 1x1** | the 1v1 ranked pool, and the guides of the maps it plays |
| **Ladder 2x2** | the same instrument pointed at the 2v2 pool, which is a different set of maps |
| **Stored maps** | everything this machine is holding, whatever ladder it belongs to — a ladder tab lists that pool's maps and nothing else |
| **Settings** | everything the extension has of its own — the hotkeys it takes, the keys that build, and everything it draws over the game |
| **Backup** | your bindings, plus the game's own hotkeys and options — which it keeps where you cannot copy them — into a single file |
| **Log** | what the extension did, kept in storage so it outlives the tab that did it |
| **Replays** | a ladder replay's build orders, read out of the file |

A ladder tab lists that ladder's maps, each with its own preview and a free-form
text box: write as much as you want for that map — paragraphs, a build order,
notes per start position. **Only that ladder's maps** — the pool sampled in the
tab above is what decides which cards appear, so a map the ladder does not play
has no card in either tab.

The guide takes **the hint slot itself**, in both places: on the loading screen
and in the in-game overlay it appears exactly where a hint would, replacing the
rotating ones for that map and scrolling if it is long. No second panel. An edit
reaches a running game immediately — no reload.

Maps with no guide of their own keep the rotating one-liners derived from the
map (start positions, size, theater) and the generic advice.

Maps are catalogued automatically the moment the client parses one, **keyed by
the map's file name** — a map file has no dependable name of its own, and two
maps can share a title. That name is not always a `.map`: the ladder plays YR
ports that keep the Yuri's Revenge extension (`4_tutankhamun_yrport.mpr`), so
`.mpr` and `.yrm` count as map files everywhere one is recognised. The thumbnail
stored for the list is downscaled, and the catalogue keeps the 120 most recently
seen maps.

### What a card knows about the map, without the engine

A card also carries **`objects`** — what the map holds, counted once and kept:
per sprite type (smudges, overlays, bridges, ore, terrain objects, buildings), a
tally by object name, and the structures grouped by kind with who owns each one
and how it got that way. A few kilobytes beside a thumbnail of a hundred.

It exists because the map file does not survive a render. A run fetches the
bytes through the client's own `MapFileLoader`, parses them into a `MapFile`,
draws it, and drops both — what is stored is pictures (`renders`, `full:<map>`),
and a picture is not an index. So "does this map have airports" was answerable
only by looking at a 3000px PNG — and on the options page, which has no client
at all, not in any form.

`__cdcHq.survey()` is the same walk as the render's with nothing drawn: **rules
only, no theater**, so it costs no download and answers for a map whose art this
client has never fetched. It travels with the *card* rather than with the
render, because a render is skipped when the stored one is current and the index
would then never be written for any map already rendered. A miscount here is
not a wrong pixel the next render corrects — it is a wrong fact that outlives
the client that produced it.

Storing the map **file** instead was considered and dropped: it is hundreds of
kilobytes a map, and it would not remove the engine from the loop anyway, since
drawing needs the theater art and only the client can fetch that
(`theaterFor()` in `src/hq-preview.js`). The bytes say what is where. They do not
say what it looks like.

The **name** on a card comes from the client's own map list
(`MapManifest#getFullMapTitle`), not from the game options. In a match started
by anyone else — ranked play included — `mapTitle` in the options came off the
wire and turns out to carry the manifest's CSF *key*: `NOSTR:Emerald Lake`,
`NAME:WEEK6`, `DESC:MP01DU`. Cards written by an older build under such a name
are renamed in place the first time a game tab has both the catalogue and the
client's map list in front of it — once per tab, and only the ones that
disagree.

Mechanically this needs both worlds: `companion.js` runs in the page's MAIN
world and cannot see `chrome.storage`, so `bridge.js` runs in the isolated world
alongside it and the two talk over `window.postMessage`.

The preview auto-anchors to the radar — the in-game HUD is WebGL, so there is no
element to attach to, but the `Minimap` UiObject reports its position and fit
size in the same pixel space as this overlay. **Drag** the preview to move it,
drag its bottom-right corner to resize. The position is remembered per browser.
`__cdc.resetLayout()` puts it back on the radar.

**Every one of these keys is reassignable** under **Settings** in the options
page. Click the key, then press the combination.

Rebinding matters because a hotkey can be taken by three layers, and only you
can see all three: the game, the browser, and Windows. **Alt+Shift is the
Windows keyboard-layout switch**, so on a machine with two layouts it never
reaches the page at all. Nothing defaults to Alt+Shift.

The page says what it can see. A line of text above the rows carries what is
true of every key. A **?** on a row carries what that one key does, and turns
amber when the extension can see a problem with the binding:

- **no modifier at all**, so the game acts on the key as well.
- **Alt+Shift**, which may never arrive.

For the game layer the check is live rather than assumed: the extension reads
the client's own `KeyBinds` table as it is built — defaults and your own
customised binds alike — and `__cdc.build()` reports whether a binding of yours
collides with a game command. The client does use Alt combinations (Alt+S
toggles shroud).

## The render in the UI

The render is made **automatically, once per map**, right after a match finishes
loading — that is the first moment the theater art exists — and stored. Every
place that shows it reads from that store. None can produce one, so a map you
have never played has no render. *Render a map the first time it is played*,
under **Settings**, is what turns that off. A render is then only made
by *Render ticked* on a ladder tab or a card's own *Re-render*.

**Both preview slots show it** — the loading screen and the in-game overlay —
and fall back to the map's baked-in bitmap when there is none yet. The loading
screen takes the full-size render (it is half the screen) and the overlay the
400px thumbnail, which is a different picture rather than the same one smaller:
its marks are drawn for a box that size. A stored render is asked for the moment
the map is captured rather than after the theater art downloads, which is what
gets it onto the loading screen instead of just after it — a map rendered in
this tab still appears mid-loading only if it finishes in time.

Which picture is shown is decided in three places, and they do not all mean the
same thing:

- **Use the map's own preview**, under **Settings** → *Overlay options*, is the answer for
  the two in-game slots — the loading-screen panel and the overlay. It is off, so
  in game the default is our render wherever there is one.
- **Show the map's own preview on cards**, in a ladder tab's list bar, is the
  answer for *this page* — the cards and the viewer a click opens. It is a separate
  setting from the one above, so a checkbox in a list of map guides never changes
  what the game draws.
- Each card has **Render · Original · Default** under its picture, and that beats
  both for that one map, on the page and in game alike. Our render is worth more
  on most maps and less on a few — a map whose own preview marks something the
  render does not — which is the whole reason a per-map answer exists. *Render*
  is dead on a map that has none. The button under the guide makes one.

Changes reach a running game immediately. **The swap key writes the in-game
setting**
rather than flipping it for the session: the choice survives a reload, and the
checkbox moves with it. If the map in play had a card setting of its own, the
swap clears it — that setting outranks the default, so leaving it would mean the
key wrote something nothing on screen obeyed.

Clicking a picture opens the full-size render — scroll to zoom in on the point
under the cursor, drag to move, double-click to fit again. Both hotkeys are
rebindable next to the others.

### Original means the map's own picture

Nothing of ours is drawn on it. The client's numbered start locations
(`MapPreviewRenderer#drawStartLocations`, which is what the lobby uses) are the
lobby's furniture rather than part of the map, and baked in they leave no way to
see the picture underneath.

They do one job worth keeping. Many maps mark their own start positions in the
preview — a red dot, drawn by whoever made the map — and many do not, and the
numbers cover for both. So the preview is checked for a marker of its own, and
**one found anywhere settles it for the whole map**. A map that marks its
spawns is shown exactly as it is. Only a map that marks none gets dots of ours,
in the same red, at every start position. Per-position was the first rule and
it was worse — the marker a map draws and the start cell the client computes
only roughly agree, so a marked map would come back with a second dot beside
one of its own.

Where dots were added the card carries **Show missed spawn points**, on by
default, per map: off shows the map's picture untouched.

What counts as a marker is **the same vivid colour near more than one start
position** — half of them, minimum two. Not "is there something red near this
spawn": that finds red-brown rock on every desert map, and *Arabian Oasis (YR
Port)*, which marks nothing at all, was read as marking everything and got no
dots. A map that marks its spawns draws the same marker at each one, and terrain
does not do that. Vivid means bright with a wide gap between its strongest and
weakest channel, so sand — bright, barely saturated — is not it.


**Cards already in the catalogue keep the picture they were stored with.** The
preview is drawn in the game tab and stored whole, so nothing here can redraw
one — pressing **Render** on a card, or *Render ticked* over the ladder pool,
is what replaces it.

**Re-render**, on a card, draws that one map again and replaces its stored
render (it says **Render** on a map that has none). It is the same machinery as
the bulk run below — a game tab does the work, opened for it if none is running,
and the card says what happened — with one difference: it redoes a render the
current renderer already made, which nothing else will. That is what to press
when a render came out against theater art that had not finished loading.

Renders are megabytes, so the extension asks for `unlimitedStorage`, keeps the
last 60 (`MAX_RENDERS` in `src/bridge.js`), and the options page has **Clear
renders** (guides and the map list stay). Auto-rendering costs a second or two
of idle work per new map. Nothing happens at all for a map already stored.

## Full map render

The fallback preview is the bitmap baked into the map file — a couple of pixels
per cell, so upscaling it only enlarges the blur. `src/hq-preview.js` renders the
map from its own cell data and the client's own art instead: terrain tiles, ore
and gems, walls, bridges, trees, smudges and structures, each drawn from the
SHP the game itself would draw.

Load any map, then in the console (page context):

```js
await __cdcHq.render()                     // full resolution, opens the PNG in a new tab
await __cdcHq.render({ maxWidth: 2000 })   // downscaled
await __cdcHq.render({ crop: false })      // include the border area outside LocalSize
await __cdcHq.render({ objects: false })   // terrain only
await __cdcHq.render({ annotate: false })  // no ore borders, no ownership outlines
await __cdcHq.render({ outlines: false })  // keep the ore borders, drop the building rings
await __cdcHq.render({ grid: true })       // overlay the cell grid
__cdcHq.list()                             // the map's structures: names, owners, colours, icons
await __cdcHq.survey()                     // the same walk as a stored object, no art needed
await __cdcHq.render({ tune: { x: 0, y: -15 } })     // nudge every sprite pass
await __cdcHq.render({ fix: { terrain: { y: 15 } } })       // nudge one sprite type
await __cdcHq.render({ fixByName: { CAAIRP: { x: 7 } } })   // nudge one object
await __cdcHq.sample()                     // capture this map split into per-type layers
__cdcHq.save("bay-of-pigs")                // download the last render
```

On top of the art it draws what a player actually reads a map for:

| Mark | Means |
|---|---|
| yellow tint and border | an ore patch |
| violet tint and border | gems |
| solid block of cells | a start position, sized to the Construction Yard that will stand there, numbered |
| green outline | a capturable building standing unowned |
| player-coloured outline, and the building painted that colour | a building the map hands to a player at match start |
| a pictogram floating above it | what taking it gets you — the same glyphs the thumbnail uses, riding above the footprint rather than on it, so the outline still says which ground it stands on and the art stays visible. **Drawn over the picture, not into it**, so *Mark tech buildings on the full render* (in game, under **Settings**) and *Mark tech buildings in the viewer* (this page, in a ladder tab's list bar) turn them off on renders you already have, with nothing to re-render |

Outlined: **buildings you can take, and buildings a trigger hands to a player
before the match starts** — ordinary civilian scenery is left alone. Ownership
alone does not earn a mark: a map can give a street lamp to a house that happens
to be a country (Country Swing does, on all four of its near-base ore drills),
and marking that buries the drill under a pictogram. An owned building is still
remapped to its player's colour, the way the game colours it. Player colours run
blue, red, orange, pink, cyan, white, brown, grey — chosen so they never collide
with the green of an unowned building or the yellow/violet of ore. Which player
owns what is attributed to the nearest start position, since the map file names
an owning country rather than a slot.

The outline goes on **before** the building, not after. It is a statement about
the ground the building stands on. So the building — and any tree in front of
it — hides the outline exactly the way it hides the ground. The two near edges
of the footprint stay, and how much of the two far edges survives is how much
relief the building has.

### The two sizes are two pictures

`thumb` (400px) and `full` (3000px) are not one render at two scales. At 400px a
cell is under three pixels, where a 35% tint reads as a smudge, a 3px border as
nothing and a building as four grey pixels — so the thumbnail gets its own
vocabulary, drawn *after* the downscale so it is sized in the pixels it has:

| Mark | Thumbnail |
|---|---|
| ore / gems | solid saturated yellow / violet, not a tint — at this size the question is only how much of the map is worth harvesting |
| an ore drill | a black dot: the drill is why a patch refills, and black is the one ink a yellow field cannot swallow |
| a marked building | a pictogram of what it is *for*, drawn **instead of** the building rather than above it: droplet = oil derrick, cross = hospital, parachute = airport, wrench = repair (machine shop or outpost), flask = secret lab, diamond = something else worth taking |
| a pictogram's colour | white while unowned, the player's colour where the map hands the building over |
| a start position | a numbered square in the player's colour — the Construction Yard footprint is eleven pixels by five here, which holds no number |

So the glyphs are the one vocabulary the two sizes share. Where they sit is what
differs, and it follows from whether the building under them is legible.

The pictograms carry a dark halo rather than a backing disc, so the glyph gets
the whole mark instead of the inside of a circle. They are not all drawn at the
style's box. `ICON_SCALE` (in `src/glyphs.js`) gives the parachute and the
wrench half again as much. A canopy with air under it, and a thin tool on a
diagonal, leave most of a 24×24 box empty and read as smaller marks beside a
cross. The correction is optical, judged on the glyph sheet, not measured off
the paths. The start square's number is black or white by the player colour's
luma — a fixed ink disappears on player 6 (white) at one end or player 1 (blue)
at the other.

The glyphs themselves are `src/glyphs.js`, not the renderer, because the two
places that draw them do not both have one: the render in the game tab, and the
options page compositing badges over a full render that has none baked in. The
full render stores *where* its badges go, as fractions of the picture, and
whoever shows it paints them.

`__cdcHq.list()` prints the glyph each structure gets, so a tech building this
build has no icon for shows up as `marker` rather than disappearing into the
map. Add it to `BUILDING_ICONS` in `src/glyphs.js`. Both styles are
`MARK_STYLES` in the same file, and `render({ sizes: { x: { width: 600, marks:
"compact" } } })` renders any width in either.


`grid: true` draws the cell grid over the render — the measuring stick when
something looks misplaced.

It needs the theater art, which the client downloads while a map loads — so a
render only happens once a game has started. Any later map works too, whatever
its theater: a missing one is fetched through the client's own loader (see the
bulk section below). Each map is rendered and stored once as it loads, and the console
calls above are for looking at one by hand.

### Ladder maps, rendered in bulk

A render does not need the map to have been **played**, and does not stay at the
renderer that made it.

Every stored render carries the version of the renderer that made it
(`RENDERER_VERSION` in `src/hq-preview.js`). Playing a map whose render is
behind renders it again instead of skipping it — and the options page can redo a
whole set without playing anything.

There are **two ranked ladders**, and they are two different pools rather than
one: the 1v1 ladder plays 2-player maps and the 2v2 ladder mostly 4-player ones,
with only a handful in common. Each has its own tab, its own sample, its own
ticks and its own list of cards. Nothing measured in one is evidence about the
other. (The API keys the team ladder `2v2-random`, not `2v2` — the client keeps
the queue name and the ladder name in separate enums, and it is the ladder name
that goes in the URL. See `LADDERS` in `src/ladder.js`.)

In each ladder tab, under a foldable **Ladder maps** block — set the pool up
once, then fold it away and leave the guides below it on screen. Its summary
carries what the sample is a claim about — who was read, over which period, and
when — so a folded block still states its own provenance. Counts are not in it:
each one lives where it is acted on, on the button or beside it. A ladder with
no sample yet opens unfolded, because the button that fixes that is inside it:

- **Find ladder maps** measures the ranked pool. Nothing publishes it — it is
  decided server-side — but every ranked match names its map, so a slice of the
  ladder plus each player's recent matches gives the pool that is actually in
  play, with the match counts and last-played dates it was derived from. The
  readout names the period the matches were played over as well as the day the
  sample was taken: a pool is a claim about a stretch of time, and the two dates
  are not the same fact. A row states its last-played date **only when that is
  not the day the ladder was read**, in a colour of its own. Nearly every row of
  a live pool was played that day, and the date repeated down the whole list
  buries the rows where it is not — which are the maps on their way out. Untick
  anything you do not want. **Select all** and **Clear selection** move every
  tick at once.
- **Each row ends on two verdicts** — which file the ladder plays, and what this
  machine holds of it — because "18 maps on the ladder, 16 cards below" is
  otherwise a discrepancy you have to find by reading both lists side by side.
  A resolved file name reads in the same ink as the title — it is a name, not a
  verdict, and the row's colour belongs to the mark at the end of it. **Red**
  *file unresolved* when no replay would name it, which leaves the map matched
  by its title, and a title can name two maps. The mark after it says what is
  held:

  | mark | what this machine holds |
  |---|---|
  | green *rendered* | the map is drawn and carded |
  | amber *no render* | a card, but only the map's own low-resolution preview |
  | amber *rendered by title* | drawn on a title match rather than a file match |
  | amber *rendered, no card* | a render in storage the catalogue has no entry for |
  | red *not rendered* | nothing here answers to it at all |

  How many of them are drawn is stated beside the buttons — *Rendered 18 of 21
  maps*. That is the slot's resting state: a message takes it while it has
  something to say, and gives it back afterwards.
- **A pool remembers which resolver read it.** A stored sample outlives the
  code that made it. When the resolver learned to read `.mpr` names, the two YR
  ports in the 2v2 pool went on saying *file unresolved* — correctly, because
  that is what the sample said, taken before the fix. Nothing on screen could
  tell that from a map the ladder genuinely never names. The summary now ends
  on *resolved by an older build* when it does — with the *re-sample to fix the
  files* half behind the `?` beside it — and the tooltip on such a row says the
  same. `RESOLVER_VERSION` in `src/ladder.js` is the stamp, raised whenever a
  change there would answer differently for the same ladder.
- **Render ticked** renders them. The options page cannot do this itself — it has
  no game client and therefore no theater art — so a game tab does the work and
  reports progress back. **It does not have to be one you opened**: if nothing
  answers within a second and a half, the extension opens one in the background,
  the run happens there, and the tab closes itself when it ends. A map already
  rendered by the current renderer is skipped — a card's own **Re-render** is
  what redoes one of those. **One run at a time across both tabs** — there is one
  game tab doing the work, so a run started in either makes *Render ticked* busy
  in both, and the progress is reported in the tab that asked for it. **What it
  did, not how much work it was**: skips are counted apart from renders, so the
  second run over a pool ends on *nothing to redo — all 21 already current*
  rather than *rendered 0 of 21* beside a summary saying *21/21 rendered*.
- **Clear sampled pool** deletes the sample and its ticks. Renders, guides and
  the map list are untouched.

Nothing is hoarded during a match to make this work. The client already knows
every map (`Engine.getMapList()`) and already knows how to fetch one
(`MapFileLoader#load` — the game's own archives first, the maps CDN second), so
the run asks it, the same way the game does.

**How a run gets a client.** The request is a storage write. A game tab that is
already open picks it up in milliseconds. If none has after 1.5 s the options
page asks the service worker — the only half of the extension that can open a
tab — for one, inactive so it never takes the screen and muted so the client's
menu music does not take the room either. The bridge in that tab
finds the request in storage as it loads, the run waits for the client to finish
booting (up to three minutes: a cold client downloads its base data first), and
when the run ends the tab asks the worker to close it again.

A hidden tab is not a free one, though: Chrome clamps its timers and gives it no
animation frames at all, and the client's own start-up uses both. So a tab that
shows no sign of a client after 25 s is **brought to the front by the extension**
and says so, rather than sitting there looking like a slow one. Nothing here is
ever something to do by hand — if a run needs a client, it gets one. (A replay
re-run does not wait for that: it holds the frame pump below for the client's
boot, and boots where it stands. A render run nudges.) **Only a tab the
worker opened is ever closed** — the ids live in `chrome.storage.session`,
because an MV3 worker is torn down while idle and a run takes minutes. A run in
a tab you opened yourself leaves it exactly where it was.

The limits are worth knowing:

- **Theater art comes from the client, and a match is not the price of it.**
  With locally imported game files any theater loads cold. In CDN resource mode
  `Engine.loadTheater` does not fetch — it builds a theater out of the VFS — so
  a run drawing only on that would render the theaters played this session and
  fail every other one. The fetching half is `GameLoader#loadTheater`, and it
  reads exactly two fields of its own object: `gameResConfig.isCdn()` and
  `cdnResourceLoader`. Both can be built from parts the client already has up
  on its main menu — the CDN base out of `ImageContext.cdnBaseUrl`, the
  checksums out of `manifest.json` at that base, and `Engine.getCacheDir()` for
  the cache. So the extension calls the client's own `loadTheater` with a
  stand-in of two fields, and a tab that has only reached the main menu renders
  anything. The cache is the client's own, which means a mix it has already
  downloaded is read from disk — and the main menu prefetches every theater
  into it a few seconds after it appears. `__cdc.probe()` reports
  `gameLoaderHeld` as which of the two routes a run will take, not whether it
  can run at all.
- **A run reports what was stored, not just what was rendered.** `render()`
  resolving means the picture exists in the tab. It still has to cross into the
  other world and be written, and a write can fail there. A failed write now
  lands in the run's failure list even when the acknowledgement arrives after the
  run has finished. A map whose file carries no `[PreviewPack]` is listed too:
  it renders fine and gets no card, which makes it invisible in the catalogue.
  The map list header shows how many renders are stored and how many megabytes
  they take, which is what separates "storage is full" from "that map is
  broken". It reads **`N of NN renders stored · M MB of MM MB in storage`** —
  the tab's own share against the extension's whole, because a page split by
  ladder invites the question of which ladder is costing the space. The megabytes counted for a
  tab are its full-size renders. Thumbnails share one storage item and cannot be
  weighed per map, so the two figures are not meant to add up to each other
  (hover the readout — it says so).
- **Storage.** Sixty renders at up to ~24 MB each is the ceiling
  (`MAX_RENDERS` in `src/bridge.js`), which is what the extension asks for
  `unlimitedStorage` for. *Clear renders* empties it. The **Stored maps** tab
  below empties it a map at a time.

### Stored maps

A ladder tab lists that pool's maps and nothing else. That leaves a map
rendered from a match on anything the ladder does not play — a third of a real
store — with no card anywhere, and the only way to delete one would be *Clear
renders*, which deletes all of them.

The **Stored maps** tab is the store's own view. Every map that has a card or a
render, **heaviest first**, because the reason to open it is usually that storage
is filling up. Each row says what its render costs, when it was made, which
renderer made it, whether it has a guide, and which sampled pool it is in. Tick
rows — or *Select all*, which takes whatever the filter left — and then either

- **Delete renders**, which takes the picture and its index entry together and
  keeps the card and the guide, so the map can be drawn again, or
- **Forget maps**, which takes the card as well.

The guide survives both. It is the one thing here a human wrote, and everything
else regenerates.

**The cap does not eat guides.** Evicting the oldest render whatever it was would
break the one promise the store makes, that a map rendered once stays rendered.
Past `MAX_RENDERS` it walks past any map with a guide and past the map just
rendered. If every candidate is spoken for, the store goes over the cap rather
than throwing notes away. What it does take is recorded, and
this tab says so until it is dismissed.

## Replays

**A ladder replay states its own build order, and reading it needs neither the
game nor a match.** A `.rpl` is a text file whose lines are the action frames the
client sent each network turn — so what every player queued, placed, sold and
cancelled is in there, timestamped to the tick. The **Replays** tab decodes one
and lays both build orders against **one clock down the middle**.

**Who won is beside the name**, as a `WON`/`LOST` badge, and the losing one
carries why and when in its parentheses — `LOST (RESIGNED 5:12)`. It comes out of
the file, not out of the ladder and not out of a re-run: the losing side is the
one that resigns or is dropped, and `DropPlayer` is what the client writes when a
base dies. It is said only when exactly one side is out — both or neither is a
match that ended some other way, and a guess there would be worse than silence.
A player who resigned and was then dropped is read by the **resignation**: the
drop that follows is the client noticing the consequence, not a second defeat.

**The header is a row per kind of line**, not a column per side — names opposite
names, statistics opposite statistics, losses opposite losses, all on the same
three-column grid the axis below uses. Two stacked columns bottom-aligned against
each other put a blank line above the shorter side and the same kind of fact at
two different heights. The faction sits on the nickname's line for the same
reason: a whole row of the header was being spent on one word.

**A header block is as wide as the panel, not as wide as the build order under
it.** The grid has five columns: a picture gutter, a side's lines, the clock,
the other side's lines, a picture gutter. The two gutters absorb whatever the
panel has left over. Centring the grid instead would put that remainder down its
two edges, where nothing can go. The header's blocks
span their gutter as well as their own column, so a side's losses read as chips
across the width instead of a stack one chip wide beside two strips of empty
panel. The clock column between them is untouched by the spans, which is what
keeps it over the axis's own.

The centre axis is the whole point of the layout. Two build orders in two
columns can only be compared by reading a time off one and hunting for it in the
other. With a shared axis the eye does it — who reached a refinery first is a
glance at which side of the same row is filled, and a run of rows filled on one
side only is a lead, visible without reading a word. Things done in the same
second share one clock reading rather than becoming two rows that look
sequential. A team game splits by team. A match that has no two sides (three
free-for-all players, or slots with no team id) falls back to a column per
player rather than inventing a pairing.

Three ways in, because a replay arrives under three different names:

- **paste** the leaderboard's game page (`ladder.chronodivide.com/…/game/<id>`),
  the client's own `#/replay/<url>` route, the `.rpl` link itself, or a bare
  game id.
- **open a file** — a `.rpl` off your own disk, picked, dropped anywhere on the
  tab, or pasted. Nothing is uploaded: the decoding is this page's, and a report
  exported from here is read the same way. Which of the two arrived is told from
  the contents rather than from the name, because a browser renames a second
  download and a report saved as `.txt` is still a report.
- **list a player's recent ranked matches** off the ladder and click one. That
  is the same match-history call the pool sampler uses (`src/ladder.js`).

**A file is matched back to its own match.** A `.rpl` states its game id on its
header line and a replay host names a file by exactly that id, so both realms are
asked whether they still hold it. When one does, the file behaves in every way
like a replay that was fetched — *Run the match*, *Export* and the remembered
list all work on it, because none of the three can tell where the report came
from. When neither does, the match is re-run **from the file itself**: the game
tab is pointed at the URL the match would have had and handed the bytes when it
asks for them, so the client's own route and its own whitelist check are left
exactly as they are and only the answer comes from somewhere else.

**Both ways in are remembered**, so the second time is a click: two panes sit
under the boxes, side by side and each under the box it fills — the replays
that have been opened on the left, and on the right the names the ladder has
been asked about over the list that answering one draws. A listed match is four
short columns, so stacked full width the pair would be mostly air, and every
line they took would be a line the report started lower by. A player entry
carries the realm and ladder it was last asked with, since the same name has a
different history on each, but it is **kept under the name alone**, so asking
1v1 and then 2v2 about one player does not write two chips reading the same
word. It is written only when the ladder answers with matches, so a typo never
joins the list. A replay entry is written after a successful read and holds
everything its row needs — map, both names, duration, when it was played — so
the list draws with no request made. Each entry has a `×` that removes that
one.

They live in `localStorage`, beside the losses preference, rather than in
`chrome.storage.local` — that is the extension's measured half, and twelve short
strings have no business in that accounting. **Forgetting a replay costs the
shortcut and nothing else:** what re-running the match produced stays keyed by
game id in `chrome.storage.local.sims`, and opening the same replay again finds
it. Twelve of each are kept.

What a row means is the distinction the tab is built around:

**Every row leads with a mark, and there are two kinds of mark.** Which kind it
is, is said by the space.

- **A sign sits against the name, like arithmetic.** `+` got it, `−` lost it. A
  placement, a delivery and the taking half of a capture are all `+`: a building
  standing on the map, a tank driving out of a war factory and a refinery walking
  over to your side are the same claim about how the world changed.
- **A glyph a space away from the name is an action or a state, not a quantity.**
  `$` ordered, `✓` finished and waiting, `<>` deployed, `⇄` changed hands, `⚑`
  left the match. It never says whether anything was gained, which is why it can
  sit beside a sign and add to it rather than compete with it — `✓ +War Factory`
  is *finished, and standing*, two facts about one row.

One rule for where a mark goes is worth more than any of the placements it
overrides. As one list with each glyph carrying its own spacing, `+Rhino` and
`✓ War Factory` read as the same kind of statement while `⇄` sat at the far
end of its row saying a third thing in a fourth position.

| row | what it is |
|---|---|
| `$ `, with a `×n` | **ordered** — what the game took into a queue at that second. Buildings get one too: deciding to build a war factory is an event, and it is on the timeline where it happened rather than in a tooltip |
| `$ `, dim, with a dashed rule | ordered and never placed — cancelled, or flushed when its factory died |
| `$ `, struck through | cancelled out of the queue. Its `×n` is what the player asked to take out — the model cannot say how much of a cancel the engine found, and the ask is the one number a cancel certainly has |
| `✓ `, dim accent, after a re-run | the building **finished** and stood waiting to be placed |
| `+`, in the page's accent | **placed** — the building exists at that second, and how far it sits from the `✓` above it is how long the player sat on it. A building placed the second it finished carries `✓ +`: both are true of the one row, and the `✓` is drawn at the readiness row's own dimness, because the bright claim here is that the building exists |
| `+n`, after a re-run | a unit **came out** of a queue. Buildings are not on this track: a building appears by being placed, and `tryPlaceBuilding` refuses unless the queue is already `Ready`, so the placement row is its delivery |
| `<> `, in violet, after a re-run | a base **stood up** — an MCV deploying. The one row that carries no sign: nothing was gained, a vehicle became a building. See below |
| `−n`, after a re-run | lost |
| `⇄ `, before the sign | the building **changed hands** — the `+` or `−` after it says which way. Two rows at one second, one on each side of the clock. See below |
| `⚑ `, in small caps | the side **left the match** — `resigned` where it was a decision, the quieter `dropped out` where the client recorded a dead base. It comes out of the file, so it is there with no re-run, and it is drawn above the losses of its own second: everything a resigning player owns dies in that instant, and the wall of `−` under the flag reads as its consequence |

Repeated orders of the same thing inside ten seconds fold into one row: eight
conscripts queued in two seconds is one decision, not eight.

**The pictures are the unit's own sidebar cameos**, in a gutter outside each
side's words — the icon the player clicked to order the thing, from the game's
own art, so the words keep touching the clock and the pictures stack into a strip
down each edge. The *icons* checkbox takes them away for a reading that wants the
words alone.

**A picture is per run, not per row, and its size says how long the run is.**
A stretch of one side's rows is often about one thing — `Power Plant` ordered,
finished, placed, or four Rhinos coming out one after another. Those rows get
**one** picture, drawn bigger, with a bracket down the gutter linking them to
it.
Every picture, run or not, draws a leader from itself to the words, so a lone row
is as easy to associate as a braced one:

```
        ┌─ 0:04  $ Power Plant
 ▣▣▣    │  0:12  ✓ Power Plant
        └─ 0:14  +Power Plant

 ▪▪     ── 0:21  $ Conscript ×8
```

**A leader is one element, drawn by the row.** It reaches out of its own cell
by a negative margin into the gutter beside the picture, and the bracket's
upright stands at the far end of that reach and carries no horizontal of its
own. Drawn in two halves — an arm in the gutter meeting the row's rule at the
column edge — they would be placed by two different rules and land half a pixel
apart. One rule would round onto the same device row at some zooms and onto
neighbouring ones at others, so the leader would step up or down halfway along.

**A run is one object's chain, not its name repeated.** Naming the same thing
twice running is necessary and not enough: the rows have to be one passage from
intent to existence — ordered, then finished, then standing. A **new order after
a placement starts a new section**, because that is a second building rather than
more news about the first. A **placement and a death** of one thing are two
pictures, because they are two events. And two rows that are neither stage of
anything join only when they are the same claim — two deaths are one loss, two
deliveries are one batch.

A line where only the *other* side acted does not break a run: the two columns
share one clock, so the opponent pushes this side's rows apart on the page
without putting anything between them, and an order and its placement are
seconds apart. What breaks a run is this side naming something else — and then
each row keeps its own small icon, at a size that leaves the row height exactly
where it was.

The sizes are only halves and doubles of the source's own 60×36, so the pixel art
is never resampled: **30×18** for a single line, **60×36** for a run spanning two
or three, **120×72** for four or more. That ladder is also what fits — at
12px/1.7 a line is 20.4px, so 36px needs two lines and 72px needs four. The
gutter is as wide as the largest picture the report actually uses, and collapses
to nothing when the icons are off.

**Each side's column is the longest line *that side* holds and no wider**, so the
picture beside it sits as close to the clock as the text ever gets. Two numbers,
not one: shared, the quieter column was padded out to the busier one's longest
line and its pictures stood a centimetre off its own text. The widths are counted
in characters rather than measured — the axis is monospace, so the longest line
*is* the widest one — which is also what lets the header and the axis, two grids,
agree about where the clock column is without either of them being laid out
first. There is no spare character in them: the few marks a row carries come from
a fallback face and may overhang a fraction into the gutter's padding, which a
line never wraps to accommodate.

**The clock column is counted too**, from the widest reading it actually prints
— which is `time`, the caption over it, on a report whose times are all shorter.
A fixed 56px was two guesses in one: too wide for `12:34`, which left a strip of
nothing down the middle twice over, since each side already keeps its own ten
pixels off the rules. And too narrow for `8:55 (35:42)`, which is what the `both`
clock prints, so every row of that report wrapped onto two lines and the axis came
out twice as tall.

They come from one sheet, and it is not in this repo: it is harvested from the
player's own running client and kept in storage, which is what every surface
that draws a cameo reads. Harvesting needs a game tab but no match, no lobby and
no login — the art is in the client's VFS from the moment the engine boots — and
takes about a tenth of a second.

The game's 60×48 cameo is cropped to its top 36 rows, which drops the unit's
name — painted into the artwork — and leaves the picture. An object the game
gives no cameo shows none rather than a stand-in. The two a build order needs and
the game does not have (both Construction Yards) borrow the icon of the thing
that becomes them.

**It happens on the way into the game**, without being asked and without
anything to ask about: nothing is downloaded, because the art is already
in the game files the client loaded. Every load compares two stamps — the
client's version and the harvester's own — and a client that has not changed
costs nothing at all. One that has, whether new art or a change to how the
harvest works, is picked up without anyone having to notice there was something
to pick up. **Never during a match**: a settings change pushes config to the game
tab too, so this can be reached mid-match, and a tenth of a second of the main
thread is invisible on a menu and about six dropped frames in a game. A cold
browser is retried for five minutes and otherwise left to the next visit —
measured rather than guessed: a fresh profile took just over two minutes to have
rules, which an earlier two-minute budget missed by seconds.

**It brings back more than an offline generator can.** Measured against a live
client on 2026-08-20: **405 ids as 99 pictures**, six of them named by the art
and absent from the archives, against the 101 ids and 88 pictures a generator
reading `Cameo=` out of the art text produced. That route has to follow the
`Image=` indirection itself. The client has already done that for every object it
knows.

**Harvest cameos**, on the Replays tab, is the same run asked for by hand — it
opens a game tab itself if none is listening, the way the replay controls do.
It is there to force a rebuild and to recover when the automatic one has not
happened. A pool render run harvests too, rather than asking twice.

Two reasons it works this way, and the first is the one that matters. **A cameo
sheet committed to this repo would be artwork from a retail Red Alert 2 install,
and no licence this repo can adopt covers it** — EA has never released RA2's
assets, so shipping those pixels would assert a right the author does not hold.
Harvested at runtime they never enter the repo. The second is that a harvest
follows the client: it picks up art changes without a regenerated commit, and it
is the player's own localisation rather than whichever one a committed sheet was
generated from. It also carries seven superweapon icons where an offline
generator reaches two, a superweapon having no `Image=` chain to walk.

**There is no committed sheet and no fallback**, and that is deliberate rather
than an oversight: until a profile has harvested once, a build order draws in
words and names objects by their ids. Opening the game once with the extension
installed is the whole of the fix, and it happens without being asked.

**An order's count is what the game accepted, not how many times the mouse went
down.** The engine takes `min(asked, queue room, per-type room, build limit)`
and drops the rest. The queues are small: 30 of a type in a unit tab, **one**
building at a time, and an aircraft queue no bigger than the free helipad
docks. Since the
sidebar clamps a click against the player's *local* model, which lockstep only
advances when the action executes, a burst of clicks all see the same stale free
space and all get sent. The surplus is dropped on arrival. Those are
**overclicks**, counted apart and shown only when the checkbox above the timeline
asks for them — a row of 45 IFVs inside ten seconds is a description of a mouse,
not of a match. **A cancel is not one of them**: cancelling more than a queue
holds empties it in one gesture, and the shortfall is the model's, not the
player's (see the floor below).

Under the timeline are two charts, one line per side.

**They are one column of full-width rows, and they share a crosshair.** Every
chart here is time across the bottom, and they are read against each other — so
the pointer over any one of them rules *all* of them at that second and opens
every readout, which is what having a shared clock is for. They used to pack
into a grid two or three abreast, which put the same moment at a different x in
every column and left you matching times across a gutter by eye. Each SVG is
drawn at the width it was given rather than scaled into it, so a full-width
chart is more plot and not bigger text.

**And you set the order.** Which two charts are worth putting next to each other
is a question about the match, not about the report, so every caption carries a
grip (⠿): drag a chart to where you want it, or focus the grip and use the arrow
keys. The arrangement is remembered.

The drag scrolls the report — the wheel works while you hold a chart, and
holding it against the top or bottom edge carries the page under it, faster the
further into the edge you push. It has to: nine full-width charts are several
screens tall, and the first version of this was a native HTML5 drag, where the
browser swallows the wheel and never scrolled the page, so nothing could be
moved past whatever was already on screen.

The readout opens **above** the plot rather than on it, over the caption and the
legend of its own chart. The legend is naming the same lines the readout is, and
the box goes away the moment the pointer leaves the chart — where a box sitting
on the plot covered the part of the chart the numbers were about.

The charts a report always has:

- **Ordered value** — credits committed, units as the queue took them and
  buildings as they were placed. It is *not* income and not a bank balance: a
  replay holds no credits at all. It reads as an economy curve only in the sense
  that a player who cannot pay stops ordering.
- **Actions per minute** over a rolling 60-second window — where each side was
  pushing, not how well. The divisor stops shrinking at 15 seconds, or the first
  action of a match draws a spike taller than anything that follows it.

Both series are drawn in the data-viz reference palette's first two dark steps
(`#3987e5`, `#d95926`), validated as a pair against this page's own panel colour:
worst CVD ΔE 26.8, normal-vision ΔE 31.8, both over 3:1 contrast. The same two
colours mark each side's name above the timeline, so the panels agree on who is
who.

**What a replay file cannot tell you**, and no amount of parsing will: credits,
kills, **losses**, or what a production queue actually finished. A replay records
what each player *did*. Those are what *happened to them*, and only the
simulation knows. Buildings are the exception, which is why structures are the
spine of the report.

The queue model narrows the gap from one side and cannot close it. It is
deliberately the *fastest possible* queue — production that never runs out of
credits, never loses power, never loses a factory — so its occupancy is a floor
under the real one: every overclick it reports is certain, every accepted order
is an upper bound. **That floor is evidence in one direction only.** A queue
already full in the fastest possible model is certainly full in the real one,
which is what makes a refused order a fact. A *cancel* it cannot cover states
nothing at all, since the real queue held at least as much and may have
absorbed the whole thing. Reading the floor backwards is what once put 79
phantom overclicks on a four-minute match that contains one. What it cannot see
at all is the engine emptying a queue when its factory dies, so beyond half a
second since a queue was last touched it resyncs rather than reject: the client
would not have sent the order had its own model shown the queue full. That
window is measured — thirteen re-orders of a building still in a queue that
holds one, every one inside 0.27 s, and the next observation 128 s away.

### Run the match

So the tab has a second half. **Run the match** plays the replay through in a
game tab and reads the counters straight off the running match — measured on the
fixture game: **4:03 of play re-run in 5.7 seconds, 2543 game ticks a second, 42×
the speed it was played**. The tab is opened for it and closed afterwards, and
the harvest is stored per match, so it is a one-off cost per replay.

**The first seconds are not watched.** `play()` waits for the match to start by
polling `game.status` on a 250 ms sleep, and only then imports `EventType` and
subscribes to the spawns, deaths and captures. At the ~1000 game-ticks a second
a harvest runs at, one poll interval is **hundreds of ticks, several game
seconds**. Everything inside it is gone rather than late. It shows in the
data: no harvest on disk holds a single tick-0 starting unit, and a fast opening
deploy can fall inside the window while the opponent's slower one survives. That
is why the base's arrival is read out of the **file** wherever the file can prove
it (below), and why a fix here means re-running every stored match.

What that adds to the report:

- **Power, and the brownouts under it.** Produced against drawn, one pair of
  lines per side, with every stretch a side spent short of power shaded behind
  them — and the same shading running down that side's column of the build order,
  across the empty rows as well as the full ones. A brownout with three rows in
  it is a player who kept building through it; one with nothing in it is a player
  who could not, and that is a thing only the timeline can show. The chart's own
  line adds them up: how many, how long in total, the longest, and how many were
  a **blackout** rather than a shortage.

  The distinction is not cosmetic and is the reason the shading exists at all. A
  base can be running a healthy surplus and be blacked out anyway — a spy walked
  into a power plant, or a lightning storm is overhead — and in a chart of
  production against drain that is invisible, because the two lines look fine.
  `PowerTrait`'s own verdict is `power >= drain AND no blackout`, and the report
  reads that verdict rather than recomputing the first half of it. Produced power
  is also scaled by each building's health, so a damaged base browns out before
  it loses a plant.
- **Build speed per queue**, as a multiple of one factory at full power. Not an
  output rate: the engine's build clock is
  `baseBuildSpeed × buildSpeedModifier × multipleFactory^-(factories-1)`, and the
  last two factors are the only ones that belong to the base rather than to the
  item in the queue. So a second war factory reads **1.25×**, a third 1.56×, and
  a base short of power reads below 1 — by a penalty proportional to how far short
  it is, not a flat halving. A queue with no factory is a **gap** in the line,
  because the engine's own expression gives 0.8 there for a queue that cannot run
  at all.

  **The Defence tab is not a line of its own.** It is a queue of its own — a
  player builds a turret and a refinery at the same time — but the client's own
  `getFactoryTypeForQueueType` answers `BuildingType` for both it and the
  Structures tab, so the two come off the same construction yards and their
  coefficients are the same number at every reading. The harvest records which
  factory each queue reads and the chart keeps the first queue to claim one, so
  a client that ever gave the Defence tab a factory of its own would get its line
  back with nothing changed here.

  Twelve possible lines is unreadable and two fixed ones is useless, so the
  legend is the control: **infantry and vehicles are drawn**, everything else is
  one click away, and a queue that never had a factory offers no control at all
  and says why. The plot is rebuilt on a toggle rather than hidden, since the
  axis is scaled to what is shown.

  **A legend for ten lines is not a legend for two.** The side's name is written
  once at the head of its own row rather than on every key, and each key is a
  short piece of the line it stands for — drawn in that line's own classes, in a
  viewBox whose units are pixels, so the dash in the key is the dash on the plot.
  A round dot cannot show a dash at eight pixels across, which on the one chart
  where two lines of a colour are told apart by their stroke made the key the one
  thing that does not distinguish them. Charts whose two lines are one per side
  keep the flat row: `Player_A: credits` over `P_B: credits` is the same
  repetition moved sideways.
- **Factories per queue** — the count the line above is worked out from, under
  it and on the same clock. The chart above answers *how fast*, this one answers
  *off how many*, and between them they separate the reasons a queue slowed: the
  speed dipping while the count holds is the power, the count dropping is a
  factory that died. Same queues, same legend, same two drawn at the start.

  Three things it does differently, each because a count is not a coefficient.
  **Nought is a reading, not a gap** — "no war factory yet" is the fact the chart
  exists to show, and it is where the speed line starts. **A team sums** where
  the speed takes the better of its two players: two players' barracks are two
  barracks, while their build speeds are not additive at all. And the line is
  **held between readings rather than sloped**, because a factory count changes
  at an instant and a ramp across the five seconds between samples reads as one
  and a half factories at a moment nobody had one and a half.

  It also draws where the speed chart cannot: a profile that has never harvested
  the rules table can state no coefficient, and the report says nothing rather
  than inventing one — but the count came off the client and needs no rules.

  Power, build speed and factories are one answer read down a column — the plant
  landed *here*, so the brownout ended *here*, so the coefficient came back to 1
  *here*.
- **Spies, on both columns at once.** `BuildingInfiltration` names the building
  and the spy, so an infiltration draws on the side that sent it and on the side
  it happened to, at the same second — the one moment in a match where the two
  build orders are describing each other. What the spy *did* is read off the
  target the way the engine reads it: `AgentTrait#infiltrate` branches on
  `rules.radar`, `rules.power`, a superweapon trait and `rules.storage`, and on
  nothing else, so the row says the map went dark, or the base blacked out, or
  the superweapon clock restarted, or about how many credits changed hands. The
  amount is worked back rather than measured: the event is dispatched after the
  theft, so only the balance left behind can be read, and with the rules' own
  share beside it that recovers the figure to within the one credit the engine's
  floor ate. The header counts them against the side that **sent** one, because
  that is the move.
- **Losses on the timeline itself**, on the same clock as the build order and
  marked with a minus: `−War Miner ×4` at 2:09, then `−Sentry Gun` twice, then
  the base — `−Tesla Reactor`, `−Conscript ×20`, `−Soviet Barracks`, `−Soviet
  Construction Yard` — between 3:35 and 4:02. **Buildings are set in bold**,
  because a base coming apart is what the eye is scanning for and it should not
  read like infantry trickling away. They group the way orders do (44 deaths
  become 16 rows, or the build order drowns in its own casualties), and the
  *losses* switch above the timeline turns them off — beside *overclicks* and
  *icons*, which are the other two things that decide what these rows say. It
  only appears on a report that has been re-run, because only a harvest holds a
  loss to draw.
- **Losses by type and by side** in the header, **split at the moment the side
  left** — `13 LOST IN PLAY` over `27 LOST AT DEFEAT`, every type its own chip.
  Everything a resigning player owns is destroyed in the same instant, so one
  list misreads the whole match: `74 lost` is a base evaporating at 5:12 with a
  dozen fighting losses buried in it. A dropped side's at-defeat block is
  normally empty, and that is the finding rather than a gap — the client writes
  the drop once the base is already gone. Nothing is withheld behind a `+n more`:
  the tail was exactly the half a re-run is run for. The per-type detail comes
  from the destroy events, because the client's own counters are keyed by
  `ObjectType` and can only say "26 infantry, 10 buildings, 4 vehicles". The
  cumulative curve is beside them.
- **Every loss total opens into units and buildings.** `40 LOST`, and the `40
  lost` in the statistics sentence, are one number over two very different
  facts: thirteen losses is a skirmish if they were infantry, and a base if
  three were buildings. So a click puts `(30 UNITS · 10 BUILDINGS)` after it,
  and a second click folds it back. **Both sides of a row open together**, since the header
  exists to be read across the clock. Each total splits from its **own** source:
  the sentence off the client's `byKind` counter, a block caption off the destroy
  events it counted, so a number and its parts can never disagree. The units
  figure keeps what the source knew — `26 infantry · 4 vehicles` — as its title.
  Collapsed by default and unchanged when collapsed. A harvest taken before the
  client was asked for the breakdown keeps a plain number rather than opening
  onto nothing. Nothing is stored: the state lives in the page, so a redraw folds
  it back.
- **What actually came out of the queues**, marked with a plus against the minus
  of a loss — the one number the file cannot be made to give up, since an order
  it records may have been cancelled, starved of credits or flushed when its
  factory died. Read against the orders above it, a delivery row is what says
  whether a build order was a plan or a wish. Same filter as the losses (an
  owner in this match), same grouping, and an object counted once however many
  times it spawns — a chrono-shifted tank leaves the map and comes back.
- **When a building was ready to place**, off the production queue's own status
  rather than the spawn events, because a building's spawn *is* its placement.
  This is the half of a structure's life the file cannot state: `PlaceBuilding`
  only does anything when the queue is already `Ready`, so a placement is the
  moment the player got round to it, and the `✓` above it is the moment the
  building was actually built.
- **A base standing up**, which is the one row on the axis that takes two
  sources to state, because each of them can only see half of it.

  A building appears because the player placed it, and the file records the
  placement — with exactly one exception: a Construction Yard from a deploying
  MCV is created by `DeployOrder`, so no `PlaceBuilding` stands behind it. So the
  re-run's test is the **pairing**, not the type: a building spawn a placement
  accounts for *is* that placement and draws nothing extra. One no placement
  accounts for gets a `<>` row of its own, in a violet nothing else on the page
  uses. One placement absorbs one spawn, nearest first and within two seconds —
  the two times are the same moment read off two clocks — and only its own
  owner's placements are candidates. **This is the only way to see a relocation
  or a second MCV**, because a mid-match deploy order in the file names no unit
  and cannot be told from a GI dropping sandbags.

  The **file** has the first one exactly, and needs no re-run at all. `OrderUnits`
  serialises `u8 orderType` first, and `OrderType.Deploy` / `DeploySelected` are
  9 and 10 — but an order carries no unit, and the selection before it is runtime
  object ids nothing in the file maps to a type. What settles it is the order of
  events: **a player cannot place a single building until their Construction Yard
  exists, and the first Construction Yard comes from the MCV deploying.** So a
  deploy order issued before that player's first placement is that MCV by
  construction, not by likelihood. No infantry has been built, no second vehicle
  bought, and nothing else they own can deploy. What stood up is named from the
  player's country, which is in the file's own header and belongs to one side.

  Where both saw it they are one row and the re-run wins the second, since an
  order is an intent and a spawn is the outcome. Where the re-run missed it —
  and it misses the opening of most matches, see *the first seconds are not
  watched* below — the file's row is the whole of it. Like a capture this is
  **not gated with the deliveries**: turning that track off asks to stop being
  told which tanks came out, not to stop being told the base moved.
- **A building changing hands.** An engineer walking into a refinery moves a
  whole building from one side of the match to the other, and the file records
  only the order that sent him. A capture is **two rows at the same second**:
  `⇄ +Soviet Ore Refinery` in cyan on the side that took it, and `⇄ −Soviet Ore
  Refinery` in dark orange on the side it came off. It is one row when the
  building came off nobody in the match, a neutral oil derrick. The `⇄` is the
  kind of event and the `+`/`−` is which way it went. It is a glyph rather than
  the word *captured*, which would make a capture the longest line in a column
  sized by its longest line. **No loss number moves for one:** nothing was
  destroyed, so it is neither a loss nor a delivery, and the counters, the
  blocks, the split and the curve all stay where they were.

  It takes **two** of the client's events and only their pair means captured.
  `ObjectOwnerChange` names both sides but fires for everything that changes
  hands — mind control, a garrison emptying back to the civilians, docked units
  dragged along by their shipyard, a map trigger, and a defeated player's whole
  base going over in one flood at the second somebody resigns.
  `BuildingCapture` fires only for a capture and names only the building. So the
  last owner change per object is held and read when a capture arrives for that
  object **in the same tick** — same object and same tick both, or a capture
  inside a defeat flood would take its losing side from whatever moved just
  before it. Infantry garrisoning a civilian building is a different event again
  (`BuildingGarrison`) and draws nothing today.
- **Kills**, and who was **defeated**.
- **Credits** — what each side actually had, every five seconds. This replaces
  the ordered-value chart, which was a proxy for exactly this. In the fixture
  match it is the whole story: one side is flat broke from 1:20 while the other
  never drops below 3 000.

The mechanics, and why each piece is the way it is:

| piece | note |
|---|---|
| `src/replay-sim.js` | page-world, inert until the bridge hands it a job, and it refuses to run anywhere but a `#/replay/` route — this may never touch a live match |
| the turn loop | calls the client's own `doGameTurn` in 100 ms bursts, yielding through a `MessageChannel` rather than a timer, because a background tab clamps timers to a second |
| the destroy filter | **the owner is the whole filter** — the event bus reports 695 destroyed objects for this match, of which 44 belong to a player. The rest are projectiles, debris and the map's invisible markers |
| the spawn filter | the same one, plus an id seen once: `ObjectSpawn` fires again for an object that leaves the map and returns, and it was built one time |
| the roster | captured once at the start, because `getCombatants()` drops a player the moment they are defeated, which is exactly whose losses you were reading |
| `src/frames.js` | the frame pump — a run holds it for the client's *boot*, and gives it back the moment the match is playing (below) |

It is also the most fragile thing in the extension: the parser only needs the
file format, while this needs the client's internals to keep their names.

**A re-run happens in a tab you are not looking at, and that is the hard part.**
The turn loop is built for a hidden tab: it breathes through a `MessageChannel`,
which is not throttled. But the client has to *boot* before there is a match to
play, and a boot advances from inside `requestAnimationFrame`, which a hidden
tab never calls. Left to itself the run waits for a match that is never going to
start, for the five minutes it allows, and comes back with *timed out waiting for
the match*.

`src/frames.js` is the answer: a content script at `document_start` (before the
client captures `requestAnimationFrame`, or the replacement would be one nothing
calls) that hands frames to the real one while the tab is visible and drives them
itself while it is not. It is **inert until a job holds it** — a tab you are
playing in has the browser's own frames and nothing else. The clock under it is a
worker's, because a worker's timers are not clamped with the page. Where a page's
policy refuses a blob worker it falls back to a `MessageChannel` loop and says so
in the log.

**The run tells the tab it is visible, holds the frames, and paces a long
match** — three parts of one thing, and it took five dead tabs to find the first.

`GameAnimationLoop` branches on `document.hidden` alone: hidden, it cancels its
`requestAnimationFrame` and runs a background frame off a one-second interval
that ticks the game and **calls the renderer not at all**. And the render layer
only retires itself inside that render update — a killed infantryman's renderable
waits on a promise resolved from `update()`, explosions, laser effects and smoke
trails all take themselves out of the scene there. So a match played out in a tab
the client believes is hidden creates renderables for every one of thirty
thousand ticks of combat and disposes of none of them, in canvases and three.js
geometry — memory `performance.memory` cannot see. That is a fact about the
client, and it was read out of its own code. Whether it is *the* reason seven
tabs have died between ticks 31 344 and 31 909 of 32 130, while the measured heap
moved 68 MB against a 4192 MB ceiling, is a different question and an open one.

So a run spoofs `document.hidden` for its own tab and for its own duration, and
the pump supplies the frames that make the claim true. A match over 20 000
ticks is paced at 240 ticks a second — the client's own ×16, the speed the same
replay was watched through at. `src/frames.js` reads the platform's own visibility
accessor rather than `document`, so the lie the client is told cannot fool the
pump that has to keep feeding it.

**And it is still not enough — the tab has to be one the browser really shows.**
With the spoof in place the client does render again: the heap grows 217 MB over
a match instead of 68, and the measured ticks per frame come out at three to
four, the watched configuration exactly. The tab is lost anyway, at tick 31 909
of 32 130. The same run in a tab **the browser genuinely shows** plays the
match out — tick 32 092 of 32 130, 143 seconds, and the heap **ends where it
started**: 1073 MB after the boot, 1069 MB at the end, against +217 MB in every
hidden run. Seven hidden runs died between ticks 31 344 and 31 909. The first
visible one finished.

So telling the client the tab is visible is not the same as the tab being
visible. The frames it then draws are for a compositor that never takes them,
and whatever that costs is outside everything a page can measure. The JS heap
was flat through all of it, against a 4192 MB ceiling.

**Therefore a match over 20 000 ticks is re-run in front of you**, and the panel
says so when it starts one. Shorter matches — which have never failed hidden —
are left in the background. That threshold is the result of seven runs, and what
each of them ruled out is recorded in `src/replay-sim.js` beside the code it
decided.

**Two debug controls sit on the Replays tab**, because the rate and the tab's
visibility are what this failure turns on and both are better dialled than argued
about:

- *re-run at N ticks/s* — empty leaves the rule above, `0` means flat out
  whatever the length, anything else is held to exactly. 240 is the client's ×16.
  Flat out reaches about 2700 on this machine.
- *Always run in a visible tab* — does for every match what a long one does
  anyway. Useful for finding where the boundary really is, since 20 000 ticks is
  drawn from one match that dies and several that do not.

Both are remembered, and the rate travels with the job. The run's opening log
line states the rate it actually used.

The pump **drops a backlog**: the clock keeps ticking while
the main thread is inside a 100 ms burst of turns, and delivering the six ticks
waiting afterwards would draw six frames back to back. The real
`requestAnimationFrame` delivers one callback per frame it actually produced, and
so does this.

The nudge is the fallback for the replay run. It tests **ticks** rather than
whether a tab picked the job up — `started` is written a second after the tab
opens, so testing that would suppress the nudge by the very state it is meant to
catch — and it waits the same 25 s as the render run. That number is measured:
a cold run sat hidden for **ninety seconds with no loading screen at all** and
got there five seconds after the nudge finally showed the tab, while a warm
client booted hidden in 10.9 s. The pump carries a warm boot. A cold one wants
the tab in front, and 25 s is the number that fits both.

**A run that dies is written off.** The thing that writes *finished* is the tab
doing the run, so a tab that crashes leaves the button reading `re-running… 99%`
for ever and the match impossible to ask for again. So a run says it is alive
every 700 ms while playing and every three seconds while waiting for the client,
and the options page writes off one that has said nothing for `STALL_MS` — the
same rule a render run follows. Two things keep it from getting that far:
the run stops itself if the match has not advanced a tick in 20 seconds, and on
memory — **measured from where the run started, not from zero**.

That distinction was bought the hard way. The same 9-minute match killed its
tab twice in a row, the second time reporting **1146 MB of heap** on its last
write. It died at the same *tick* both times rather than after the same number
of seconds, with the client drawing the first time and not drawing the second.
So the growth is per tick and in the game's own logic. But an absolute stop set
from those numbers then killed a run **at tick 921 of 32 130**, because a cold
client boot had already reported 1087 MB before a turn was played, and most of
a boot's heap is garbage nobody has collected yet. A boot's cost says nothing
about whether a match can be played.

So a run takes a baseline when the match comes up — and says what it was — then
stops if it grows **600 MB** on top of it, or passes 1800 MB outright. Above
**250 MB** of growth it stops sprinting between bursts and waits 150 ms, which is
the only lever this side has on the possibility that the heap is mostly garbage a
loop this tight never lets the collector take. The share of Chrome's ceiling is
gone: the ceiling here is 4192 MB and the tab died at a quarter of it, so
whatever kills the tab is not that ceiling.

Every progress write carries the last sixty readings of the heap against the tick
they were taken at, so a run that dies anyway leaves the shape of the climb
behind it.

**And a run saves as it goes.** The harvest is handed over to be stored every
1.5 seconds — every half second through the last tenth of the match — under the
same match id a finished one uses. That is what a *checkpoint* is: the same
rows, minus what the match had not reached yet. It exists because the
measurement above found the deaths clustered in the **last 800 ticks of a 32
130-tick match**, while the heap over the whole match before that grew 6 MB per
thousand ticks. A tab dying there would take a report that was 97% written with
it. A report drawn from a checkpoint says what it covers (`re-run covers 97% of
the match`) rather than passing for a finished run.

**And the tab doing the harvest draws nothing of ours.** The preview and the
full-size render are for a human looking at a loading screen. In a run's tab they
are tens of megabytes decoded into the one place that cannot spare them, so
`src/companion.js` skips both while `__cdcSim.busy()`.

### Two clocks, and which one a report prints

A match has two, and they are not the same number:

| | |
|---|---|
| **real time** | the tick divided by the rate the match was *played* at (`report.ticksPerSecond`, 60 on the ladder) — the wall clock, and what the ladder's own `duration` says. A ranked match of 32 130 ticks is 8:55, and the API reports 8 minutes. |
| **the game clock** | the same ticks at `GameSpeed.BASE_TICKS_PER_SECOND` — **15 a second, whatever speed the game runs at** — which is the clock the client draws in the corner while you watch. The same match reads **35:42** there. |

Real time is the report's own reading, and the game clock is the one a player
remembers a moment by: a run whose tab died showed *35:30* on screen while the
report called the same moment 8:51, with nothing tying the two together. So a
report offers **real time**, **game clock**, or **both** — printed `8:55
(35:42)`. The choice is kept: the options page in extension storage, the site in
`localStorage`. A match played at 15 ticks a second has one clock and is offered
no choice.

### Export — and the same report on the site

**Export** writes the report on screen to a `.json` file. It is worth having
because of what is above: a re-run is the only source of losses, kills and
credits, and it needs the game client, which a web page does not have. So a
report that has been run is the only form in which those numbers reach anybody
else.

The companion site (`site/`) has a **Replays** page that reads both: a `.rpl`
dropped on it, or a report exported here. It runs *these* files —
`src/replay.js`, `src/replay-view.js` and `src/replay-view.css` are vendored
into the site's assets at build time, the way `src/glyphs.js` already was — so
a report drawn there cannot differ from the one drawn here. The object table
and the cameo sheet cannot be vendored, having no copy in `src/`:
`site/export.mjs` writes them into the site's assets straight out of the
extension's harvest, and refuses to build a site from a store that never got
one. `src/replay-view.js` is where the renderer lives now. The options page
keeps only the panel around it.

What the site cannot do, and why:

| | the extension | the site |
|---|---|---|
| parse a `.rpl` you have | yes | yes — in the browser, nothing uploaded |
| **fetch** a replay by link or id | yes, through a host permission | **no** — `replays-*.chronodivide.com` sends no `Access-Control-Allow-Origin` and answers the preflight with 403 (measured 2026-08-16). The page lists your matches off the ladder API, which does send it, and links the file so the browser downloads it |
| re-run a match for losses and credits | yes | no, at any price — it needs the client |
| read a report somebody else re-ran | yes | yes, via the exported file |

Names come from the harvested object table: a replay names an object by its
**ordinal** in the rules type lists, nothing served over the network states
those lists, and the client that recorded the replay is the one that can. The
format itself — byte layout, enums and the tick rate — was read out of the
client's own `network/gameopt/Parser` and verified against eight ladder replays.
`src/replay.js` carries it.

## Settings backup

**Everything that defines your keyboard, in one file, so a second browser does
not mean binding it all again.** The *Backup* tab reads it, saves it, and puts
it back somewhere else.

The reason it needs a feature at all is where the game keeps its own settings:

| what | where | reachable from |
|---|---|---|
| the game's hotkeys | `keyboard.ini` — `keyboardmd.ini` under Yuri's Revenge — at the root of the client's **origin-private file system** | a game tab only |
| the game's other options | `localStorage`, under `_r_*` keys | a game tab only |
| the extension's own bindings and notes | `chrome.storage` | the options page |

Origin-private and per-browser, both of the client's. There is no file on disk
to copy, and its hotkeys are **not** in the `_r_*` blob — that carries scroll
rate, the graphics preset, right-click move and scroll and mouse acceleration,
and nothing about keys. So a backup has to reach into the client's own file
system, which is what the game tab does on this tab's behalf.

### What travels, and what deliberately does not

Four tick boxes, and they govern the file in both directions — a backup holding
everything can be loaded for its hotkeys alone.

- **Game hotkeys** — the client's whole `[Hotkey]` table. Both engines' files
  when both exist, because which one the client is using depends on what was
  last played.
- **Other game options** — the `_r_*` settings the client's own options screens
  write, including the sound mixer and your preferred host options.
- **Extension bindings** — the number keys, the build hotkeys per side, the
  chord grids, and the tick boxes on *Settings*.
- **Map guides** — the per-map guides, which preview each map shows, and the
  start-position marks turned off. Not the sprite offsets: those are a
  measurement rather than a preference, and the table in `src/hq-preview.js`
  is what every install renders with.

**Left behind on purpose**, and the file says nothing about them because they
are not settings:

| key | why it stays |
|---|---|
| `_r_lastCon` | a live reconnect payload — imported elsewhere it makes *that* browser offer to rejoin a match it was never in |
| `_r_gameRes` | where this install takes its game files from: a fact about the browser |
| `_r_last_gpu` | measured on this machine's GPU. Carrying it suppresses the graphics prompt on a machine that needed to be asked |
| `_r_nickname`, `_r_autoLogin`, `_r_region` | identity, not settings |
| `_r_last*` | lobby state — the map, mode, country and colour last picked |

Renders, map cards, the cameo sheet and re-run matches are absent as well: they
are megabytes of pictures the other browser builds for itself.

### Reading, and putting it back

Reading the client's half needs a game tab, so one is opened — inactive and
muted — if none is listening, exactly as a render run does, and closed again
when it answers. The file is JSON with a `readable` block written next to the
codes:

```json
"game": { "hotkeys": { "keyboard.ini": { "Options": 1094 } } },
"readable": { "keyboard.ini": { "Options": "Alt+F" } }
```

`readable` is for the person carrying the file. It is written on the way out and
**ignored on the way in**, so editing it changes nothing rather than quietly
disagreeing with the code beside it.

An import writes through the client's own objects where there are any — its live
hotkey table, then its own serialiser — so the keys in play and the file on disk
cannot end up disagreeing, and the hotkeys need no reload. Where there is no
client yet, which is the fresh-browser case this exists for, the file is written
directly and the tab is told to reload. The `_r_*` settings always want a reload:
the client reads them once at start-up, and its own options screen writes its
copy back over yours when you leave it.

**What was there before is kept.** The snapshot is taken by the same tab that is
about to overwrite it, a moment before it does, so *Undo the last import* puts
back what was actually there rather than what this page last happened to read.
It outlives the page, because an import that reloads the game tab is one you may
want to undo minutes later.

## Install

**Chrome or Edge** (121 or later):

1. `chrome://extensions` → enable **Developer mode**.
2. **Load unpacked** → select this repo's root.
3. Open <https://game.chronodivide.com/> and start a game.

**Firefox** (128 or later):

1. `about:debugging#/runtime/this-firefox` → **Load Temporary Add-on…**
2. Select `manifest.json` in this repo's root.
3. Open <https://game.chronodivide.com/> and start a game.

A temporary add-on is removed when Firefox closes. Its storage is kept, because
the manifest sets a fixed add-on id.

Firefox has no keyboard lock (`navigator.keyboard`). Because of this, in
fullscreen the browser keeps its own shortcuts, for example Ctrl+W. A chord that
uses Ctrl on one of those keys does not get to the game. The option **Hold the
keys Ctrl needs against the browser in fullscreen** is disabled in Firefox. The memory readout
also has less to show, because Firefox has no `performance.memory`.

## Diagnosing it

`__cdc.probe()` in the game tab's console (page context) is the first thing to
run: it re-checks every assumption this extension makes about the client and
prints which ones still hold, as a table. `__cdc.build()` answers the same
question for a build hotkey — which binding a press resolves to, and whether the
client had a command on that key — and `__cdc.chords()` for a chord, including
which prefixes resolved and from whose table.

The first line of every diagnosis is the **version**: `__cdc.version` against
`manifest.json`. If they differ, the extension did not reload and nothing else
you see is current. `chrome://extensions` → the reload arrow on the card; in
Firefox, `about:debugging#/runtime/this-firefox` → **Reload** on the add-on.

If the map preview is missing, the loading screen says so in the preview's own
slot instead of showing nothing.

### The log, which outlives the tab

A render run happens in a tab the extension opens and closes by itself, so the
run whose result you are questioning is exactly the run whose narration goes
with it. The **Log** tab on the options page is that narration kept in storage:
the last 400 lines, newest at the bottom, filterable, with *Problems only* for
the warnings and errors alone.

Two sources feed it: the game tab's own narration, and, from the half that owns
storage, **every write — attempted, then stored or failed.** The attempt is
logged before the write starts, and that is the whole point. A write that fails
and a write that is never started look identical afterwards, and one of those
is what left a map with a render and no card. The log is handed over *before*
the run's tab is allowed to close, so a run that ended badly still has its
narration.

## Not affiliated, and what is whose

This is an unofficial browser extension. It is **not affiliated with, endorsed
by, or connected to** Chrono Divide or Electronic Arts, and neither has reviewed
it. *Chrono Divide*, *Command & Conquer*, *Red Alert* and every other name and
mark here belong to their respective owners. They are used only to say what this
works with.

The MIT licence in `LICENSE` covers the code in this repository. **The game's
artwork is not in it** and never was licensed to be: the cameo sheet a build
order is drawn with is **harvested from your own client at runtime** and kept in
the extension's storage. The **Harvest cameos** button on the Replays tab is that
run asked for by hand, and `scripts/probe-cameo-harvest.js` is how you check what
it found against your own client. A report is therefore drawn with art you
already have.

What the repository does carry about the game is **facts, not artwork**: object
ids, names, costs and cell numbers, in `src/replay-types.js` and under
`scripts/fixtures/`. They are values from a game you are expected to own a copy
of, and there is no artwork among them — the sheet in the fixtures is a 1×1
transparent placeholder.

`src/replay-types.js` is a **bootstrap, not the authority.** The object table
harvested from your own client is installed over it as soon as one exists, and
that one is the better source: the client layers `rulescd.ini` over `rules.ini`,
so its values are the ones actually in play. The committed copy exists so a
profile that has never harvested does not read `building #12` for every row of
its first report. `node scripts/fixture-replay-types.mjs` rebuilds both it and
the fixtures from your own client's tables, so `git diff` is the comparison
between them. Nothing here redistributes the game.

## Compatibility

Written against client **v0.83.3**. The hooks depend on internal module names,
React prop shapes and CSS class names — all of which the CD team can change
without notice. Run `__cdc.probe()` in the devtools console (page context)
while a loading screen is up: it re-checks every assumption and prints which
ones still hold.
