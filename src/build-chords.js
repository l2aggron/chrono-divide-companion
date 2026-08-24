/**
 * What a build chord is made of: the four sidebar sections, the block of keys
 * they are laid out on, and the layouts as shipped.
 *
 * Shared on purpose. The options page edits a grid that the game tab plays, so
 * the sections, the key order and the defaults have to be one table rather than
 * two that agree by hand — this feature has already lost two rounds to lists
 * kept apart (see MODULE_EXPORTS in src/companion.js). The game tab loads this
 * as a content script ahead of companion.js; src/options.html loads it as a
 * script tag.
 *
 * Nothing in here touches the client, the DOM or storage: it is data plus the
 * one function that reads a stored layout back at full length.
 */
(() => {
  "use strict";

  /**
   * The four sidebar sections, and the client command that reaches each one.
   *
   * A chord's prefix is **not** hardcoded to q/w/e/r. The client has its own
   * commands for the four sidebar tabs and `state.clientHotkeys` already carries
   * their live bindings (see the KeyBinds hook), so the prefix is read from
   * there: the first press is the client's own tab switch, unswallowed and
   * unchanged, and the second press within the window opens our grid for the
   * tab that press just switched to. The two can therefore never disagree, and a
   * player who rebinds the tabs gets their chords moved with them.
   *
   * `fallback` is only for a tab the client's table has not been seen to bind —
   * before the first match the table is empty, and RA2's own keyboard.ini puts
   * these four on q/w/e/r.
   *
   * `queue` names the production queue whose *readiness* blocks the section. It
   * is set only for the two building queues: `QueueStatus.Ready` happens when a
   * structure is waiting to be placed, and both of those queues hold one item,
   * so a ready structure blocks the whole section. Units leave their factory on
   * their own and their queues are never Ready.
   *
   * `queues` is the other half of that fact and a longer list: every queue the
   * tab can put something into, which is what a Ctrl press on the tab key
   * cancels out of. A tab is **not** a queue — the Units tab alone feeds
   * Vehicles, Ships and Aircraft — so the press picks one of them
   * (`chordCancelQueue`) rather than assuming the tab has only ever meant one.
   */
  const SECTIONS = [
    { id: "structures", command: "StructureTab", label: "Structures", fallback: "KeyQ", queue: "Structures",
      queues: ["Structures"] },
    { id: "defense", command: "DefenseTab", label: "Defence", fallback: "KeyW", queue: "Armory",
      queues: ["Armory"] },
    { id: "infantry", command: "InfantryTab", label: "Infantry", fallback: "KeyE", queue: null,
      queues: ["Infantry"] },
    { id: "units", command: "UnitTab", label: "Units", fallback: "KeyR", queue: null,
      queues: ["Vehicles", "Ships", "Aircrafts"] },
  ];

  /**
   * The keyboard's own left-hand block, in reading order — which is also the
   * grid's slot order, so the picture on screen sits where the key does under
   * the hand.
   */
  const GRID_KEYS = [
    "KeyQ", "KeyW", "KeyE", "KeyR", "KeyT",
    "KeyA", "KeyS", "KeyD", "KeyF", "KeyG",
    "KeyZ", "KeyX", "KeyC", "KeyV", "KeyB",
  ];
  const GRID_COLS = 5;

  /**
   * How long after a tab press a second press still counts as a chord.
   *
   * Long enough to be comfortable at speed, short enough that switching tabs
   * twice on purpose — which is a thing people do while reading the sidebar —
   * does not open a grid. The first press is never held back by this: it has
   * already gone to the client by the time the timer starts.
   */
  const CHORD_WINDOW = 320;

  /**
   * Slots that hold more than one object id — a **deck**: whichever of them
   * your country builds, on one key.
   *
   * Two different reasons a slot looks like this, and **only one of them is the
   * player's business**:
   *
   * - **`universal`** — one thing under two names, which every country on the
   *   side gets one of. `AMRADR`'s rules section is literally `Name:GAAIRC`; a
   *   Korean player's Black Eagle is everyone else's Intruder. Nobody has a
   *   choice to make here and nobody is missing anything, so this is **not
   *   shown as a choice**: the key is the airfield, or the plane, under its
   *   plain name, and the two ids behind it are the machinery that puts the
   *   right one on the key. See `chordIsDeck`.
   * - the rest are **country units** — the Iraqi Desolator, the Cuban
   *   Terrorist, the Russian Tesla Tank, the Libyan Demolition Truck. These are
   *   different objects that share a key because most countries get *nothing*
   *   on it, and *which* one is yours is a real fact about your country. That
   *   one is shown, as a deck.
   *
   * A key each would be a key dead for every country but one, which is the
   * whole reason a slot holds two ids at all.
   *
   * `label` is for the options page, which has no match and therefore no
   * country, and so is only ever read for the pairs that are shown as such — a
   * universal pair is named after the object instead. In a match the grid shows
   * whichever one the player can build, under the client's own name for it.
   */
  const VARIANTS = [
    { ids: ["GAAIRC", "AMRADR"], universal: true },
    { ids: ["ORCA", "BEAG"], universal: true },
    { ids: ["TERROR", "DESO"], label: "Terrorist / Desolator" },
    { ids: ["TTNK", "DTRUCK"], label: "Tesla Tank / Demolition Truck" },
    // Not two units but a gun and a superweapon, and a deck all the same: both
    // halves are country-locked — the Grand Cannon is French, the drop is
    // American — so one key serves two countries and is as dead as it ever was
    // for the other three.
    { ids: ["GTGCAN", "sw:AmericanParaDropSpecial"], label: "Grand Cannon / American paradrop" },
  ];

  /**
   * Slots that are a **superweapon** rather than a thing to build.
   *
   * A key on one of these does not order anything: it enters the client's own
   * targeting mode, exactly as clicking the superweapon's sidebar cameo does,
   * and the player still picks the tile. Written `sw:<rules section>` so a
   * layout slot, a cameo id and the client's `superWeaponsTrait` key are all the
   * same string.
   *
   * Only the two **paradrops** are here, and the reason is the game's own line
   * rather than one drawn in this file: the four real superweapons carry
   * `ShowTimer=yes` and are activated from the key of the building that grants
   * them — you build a Chronosphere once, and after that the key has nothing
   * left to order. The paradrops carry `ShowTimer=no` because they are side
   * effects of buildings that are not superweapon buildings at all: an American
   * builds *several* Airforce Commands for the planes, and the tech airport is
   * captured rather than built and has no cameo of its own to press. Both
   * therefore need a key nothing else wants.
   *
   * `from` is the building that grants it — not read at run time (the client
   * answers that), but it is the fact that makes the rest of the row checkable.
   */
  const SUPERWEAPONS = [
    {
      id: "sw:AmericanParaDropSpecial",
      name: "AmericanParaDropSpecial",
      label: "American paradrop",
      from: "AMRADR",
    },
    { id: "sw:ParaDropSpecial", name: "ParaDropSpecial", label: "Airport paradrop", from: "CAAIRP" },
  ];

  /** Is this slot value a superweapon rather than an object id? */
  function chordIsSuperWeapon(value) {
    return typeof value === "string" && value.startsWith("sw:");
  }

  /** The `superWeaponsTrait` key behind a `sw:` id, or "" for anything else. */
  function chordSuperWeaponName(value) {
    return chordIsSuperWeapon(value) ? value.slice(3) : "";
  }

  /** The table row for a `sw:` id, or null. */
  function chordSuperWeaponRow(value) {
    return SUPERWEAPONS.find((row) => row.id === value) || null;
  }

  /**
   * The layouts as shipped, per side and section.
   *
   * **Both sides are the player's own grids**, adopted as they were played:
   * the Soviet one in 0.56.0, the Allied one in 0.57.0 after a season of
   * actually pressing it. That is the rule the layouts answer to, and it
   * outranks the two rules that came before it — tech order, then the mirror —
   * because it is the only one with evidence behind it.
   *
   * The mirror is what is *left* of the second rule, and it is worth keeping in
   * mind because it still holds where the two rosters do the same jobs:
   *
   * - the structures opening — power, barracks, refinery, war factory, radar on
   *   `q w e r t`, both sides;
   * - `q` the miner, `w` the main tank, `e` the anti-air on both units grids;
   * - the country key, `d` on infantry and `f` on units, both sides;
   * - the sea on `zxcvb`, both sides.
   *
   * And it is broken on purpose where the hand disagreed with it. The units
   * grids swap two keys against each other — the Allied `t` is the plane and
   * `d` the artillery, the Soviet `t` the artillery and `d` the plane — and the
   * Allied infantry grid is sorted by its own logic entirely: `r` the Rocketeer
   * and `t` the Spy, then the Chrono Legionnaire, Tanya and the Chrono Commando
   * on `a` `s` `f`. Neither is drift. A key that gets pressed under pressure is
   * worth more than a key that reads well in a table, and where the two rosters
   * genuinely do not line up — no Allied Terror Drone, no Soviet Chrono
   * Legionnaire — there was never a mirror to keep.
   *
   * The three rows are still the grouping:
   *
   * - **`qwert` — what you build every match.** Power, barracks, refinery, war
   *   factory then radar on structures; the miner, the main tank and the
   *   anti-air on units; the turrets and the wall on defence.
   * - **`asdfg` — the late and the expensive.** Battle lab, superweapons, MCV,
   *   heavy tank, the heroes. `g` ends the section, and the **shipyard sits
   *   there** rather than at its tech level: it is the one building a land map
   *   makes pointless, so it is off the run pressed every game. The defence
   *   grid's `g` is the same idea taken further — the paradrop off a **captured**
   *   tech airport, which most matches never hand you at all, on the same key
   *   for both sides.
   * - **`zxcvb` on the units grid is the sea** — all five keys, attack ship,
   *   transport and capital ship on the same three of them. Nothing that floats
   *   sits above it and nothing else sits in it.
   *
   * **The country slot ends its group** rather than sitting on `b`: `d` on the
   * infantry grid, after the specialists and before the heroes, and `f` on the
   * units grid, after the land block. `b` was your country's key on every grid
   * until the sea took the bottom row. The French Grand Cannon is the exception
   * and barely one — it is a turret, so it is with the turrets.
   *
   * Where the two rosters do not line up the Allies simply run longer: they
   * have a SpySat Uplink and a Grand Cannon the Soviets have no answer to, and
   * no second power plant, so their defence grid reaches `f` and their
   * structures grid leaves `f` empty.
   *
   * `null` is an empty slot, and empty slots keep their key: the grid's geometry
   * is the keyboard's, so a missing object must not move the ones after it.
   *
   * **Which grid a building is on is not a choice**: `BuildCat=Combat` sends it
   * to the Armory queue — the Defence tab — which is why the superweapons, the
   * Gap Generator, the SpySat Uplink and the Psychic Sensor are on `ww`.
   *
   * Overridden per side from the options page; this is what a fresh install
   * plays with, and what *Reset section* puts back.
   */
  const DEFAULT_CHORDS = {
    Allied: {
      // power barracks refinery factory radar · depot lab economy — shipyard
      structures: [
        "GAPOWR", "GAPILE", "GAREFN", "GAWEAP", ["GAAIRC", "AMRADR"],
        "GADEPT", "GATECH", "GAOREP", null, "GAYARD",
        null, null, null, null, null,
      ],
      // anti-air turret wall heavy country · gap spysat chrono weather airport
      defense: [
        "NASAM", "GAPILL", "GAWALL", "ATESLA", ["GTGCAN", "sw:AmericanParaDropSpecial"],
        "GAGAP", "GASPYSAT", "GACSPH", "GAWEAT", "sw:ParaDropSpecial",
        null, null, null, null, null,
      ],
      // basic engineer dog air infiltrator · heavy hero country hero psychic
      infantry: [
        "E1", "ENGINEER", "ADOG", "JUMPJET", "SPY",
        "CLEG", "TANY", "SNIPE", "CCOMAND", "PTROOP",
        null, null, null, null, null,
      ],
      // miner tank anti-air chopper air · mcv heavy artillery country — · the sea
      units: [
        "CMIN", "MTNK", "FV", "SHAD", ["ORCA", "BEAG"],
        "AMCV", "MGTK", "SREF", "TNKD", null,
        "DEST", "DLPH", "LCRF", "AEGIS", "CARRIER",
      ],
    },
    Soviet: {
      // power barracks refinery factory radar · depot lab reactor cloning shipyard
      //
      // No Ore Purifier: it needs GATECH and GACNST — the Allied battle lab and
      // the Allied construction yard — so no Soviet player can ever build one,
      // however much its `Owner=` line lists them. The Allies spend that key on
      // theirs, which is why `d` is a reactor here and an Ore Purifier there.
      structures: [
        "NAPOWR", "NAHAND", "NAREFN", "NAWEAP", "NARADR",
        "NADEPT", "NATECH", "NANRCT", "NACLON", "NAYARD",
        null, null, null, null, null,
      ],
      // anti-air turret wall heavy sensor · iron curtain nuke — — airport
      defense: [
        "NAFLAK", "NALASR", "NAWALL", "TESLA", "NAPSIS",
        "NAIRON", "NAMISL", null, null, "sw:ParaDropSpecial",
        null, null, null, null, null,
      ],
      // basic engineer dog heavy anti-air · saboteur psychic country hero hero
      infantry: [
        "E2", "SENGINEER", "DOG", "SHK", "FLAKT",
        "IVAN", "YURI", ["TERROR", "DESO"], "CIVAN", "YURIPR",
        null, null, null, null, null,
      ],
      // miner tank anti-air drone artillery · mcv heavy air country — · the sea
      units: [
        "HARV", "HTNK", "HTK", "DRON", "V3",
        "SMCV", "APOC", "ZEP", ["TTNK", "DTRUCK"], null,
        "SUB", "HYD", "SAPC", "SQD", "DRED",
      ],
    },
  };


  /**
   * One side's layout for one section, always exactly `GRID_KEYS.length` long.
   *
   * The shipped layout, with the user's overrides laid on top **slot by slot**.
   * An override is `{ "3": "GAWEAP" }` — index to object, `null` for a key
   * deliberately emptied, absent for one never touched. So a key nobody has
   * moved follows what ships, and a shipped correction reaches everyone who has
   * not overruled that exact key.
   *
   * This replaced storing the whole side, which froze it: the first edit to any
   * cell captured every other cell as it stood that day, and four rounds of
   * layout fixes then landed in a file nothing read. A stored **array** is that
   * old shape and is ignored on sight — it is a copy of a layout that has since
   * been corrected, and honouring it would mean honouring the bugs in it.
   */
  function chordLayout(chords, side, sectionId) {
    const shipped = (DEFAULT_CHORDS[side] || {})[sectionId] || [];
    const stored = chords && chords[side] && chords[side][sectionId];
    const overrides = stored && !Array.isArray(stored) && typeof stored === "object" ? stored : null;
    return Array.from({ length: GRID_KEYS.length }, (_, i) => {
      if (overrides && Object.prototype.hasOwnProperty.call(overrides, String(i))) {
        return overrides[String(i)] || null;
      }
      return shipped[i] || null;
    });
  }

  /** Is this stored layout the old whole-side shape, which is no longer read? */
  function chordLayoutIsLegacy(chords, side, sectionId) {
    return Array.isArray(chords && chords[side] && chords[side][sectionId]);
  }

  /**
   * The override to store after putting `value` on `slot`.
   *
   * Diffed against what ships, so an edit that happens to agree with the shipped
   * layout leaves nothing behind — and a user who puts a key back where it was
   * stops overriding it rather than pinning it forever.
   */
  function chordOverride(chords, side, sectionId, slot, value) {
    const shipped = (DEFAULT_CHORDS[side] || {})[sectionId] || [];
    const next = chordPlace(chordLayout(chords, side, sectionId), slot, value);
    const out = {};
    for (let i = 0; i < GRID_KEYS.length; i++) {
      if (chordSlotKey(next[i]) !== chordSlotKey(shipped[i] || null)) out[String(i)] = next[i] || null;
    }
    return out;
  }

  /** The letter a slot sits on, for a label. */
  function chordKeyLabel(slot) {
    return (GRID_KEYS[slot] || "").replace(/^Key|^Digit/, "");
  }

  /**
   * What a slot holds, always as a list.
   *
   * A slot is one id or a country pair, and every caller wants the same
   * thing from both — the ids, in preference order. Written once here rather
   * than as an `Array.isArray` at each of the eight places that ask.
   */
  function chordSlotIds(value) {
    if (Array.isArray(value)) return value.filter(Boolean);
    return value ? [value] : [];
  }

  /** One slot's identity, for comparing two slots. */
  function chordSlotKey(value) {
    return chordSlotIds(value).join("+");
  }

  /** The pair an id belongs to, or null. */
  function chordVariantOf(name) {
    return VARIANTS.find((variant) => variant.ids.includes(name)) || null;
  }

  /**
   * Is this slot a **choice**, to be drawn as a deck — or one object that
   * happens to be stored as two ids?
   *
   * The two ids of a `universal` pair are one thing: every country on the side
   * builds it, and the id only decides whose art and whose paradrop. There is
   * nothing for the player to know, so the options page draws it as the plain
   * object it is. A country pair is the opposite — a Cuban gets a Terrorist and
   * an Iraqi a Desolator, and a player who cannot see that from the key does not
   * know what the key does.
   *
   * A pair of ids that matches no `VARIANTS` entry is a deck: nothing here can
   * claim the two are the same object, and drawing only the first would say so.
   */
  function chordIsDeck(value) {
    const ids = chordSlotIds(value);
    if (ids.length < 2) return false;
    const variant = chordVariantOf(ids[0]);
    return !(variant && variant.universal && variant.ids.join("+") === ids.join("+"));
  }

  /**
   * Keys that are the *beginning* of a keystroke rather than one of their own.
   *
   * Control joined them in 0.70.0, when Ctrl stopped closing the grid and became
   * the "queue next" modifier: the Ctrl of a Ctrl+Q arrives as its own keydown
   * before the Q does, and a grid that acted on it would be gone by then.
   */
  const MODIFIER_KEYS = ["Shift", "Control", "Alt", "Meta", "AltGraph", "CapsLock"];

  /**
   * Codes the browser keeps for itself, whatever the page says.
   *
   * `preventDefault` is enough for Ctrl+R and Ctrl+E — reload and the omnibox
   * are the page's for the asking. Ctrl+W, Ctrl+T and Ctrl+N are not asked at
   * all: the browser acts and the page finds out by ending. Two of them, `w` and
   * `t`, are the grid's own second and fifth slots, which is why the keyboard
   * lock exists at all.
   */
  const RESERVED_CODES = ["KeyW", "KeyT", "KeyN"];

  /**
   * Which of the overlay's own layers a press belongs to, before any of them
   * looks at it.
   *
   * Pure, and here rather than inline in the keydown listener, for the reason
   * `chordAction` is: the precedence between the layers is a decision, it has
   * three modifiers and two pieces of state in it, and every row needs a running
   * match in a particular state to exercise by hand. 0.70.0 rewrote that
   * precedence — the cancel key stopped being Ctrl and stopped outranking the
   * grid — and a rewrite with no table is how a layer quietly stops being
   * reachable.
   *
   * Five answers, in the order the listener asks:
   *
   * - **`none`** — a Ctrl on a code the browser keeps, with no keyboard lock
   *   held. Chrome closes the tab on Ctrl+W whatever the page does, so the press
   *   is left alone entirely rather than queueing something into a tab that is
   *   already going.
   * - **`menu`** — the client's own game menu is on screen, and it is modal:
   *   the client itself tears down its keydown listener while it is up
   *   (`WorldInteraction#setEnabled(false)`), so a key that still reached our
   *   layers would be the one thing acting on a screen nobody is playing.
   *   Above the grid, because that is what modal means.
   * - **`grid`** — an open grid owns the keyboard. It owns Ctrl too now, which
   *   is why the cancel key no longer sits above it.
   * - **`cancelSection`** — Alt on a sidebar tab key with no grid open: pause or
   *   cancel what that tab is building. Bare Alt only; Ctrl+Alt is AltGr on a
   *   non-US layout and means neither.
   * - **`pass`** — none of the build layers; the listener goes on to the
   *   fullscreen swap and the configured hotkeys, which have their own rules and
   *   their own guards on Meta.
   *
   * @param {{code, ctrlKey, altKey, shiftKey, metaKey, repeat}} e
   * @param {{inMatch: boolean, gridOpen: boolean, keyLockHeld: boolean,
   *          isPrefix: boolean, menuOpen: boolean}} at
   */
  function chordPressRoute(e, at) {
    // Meta is the browser's and the OS's, never ours — and it is left to fall
    // through rather than answered `none`, because the four configured hotkeys
    // below make their own decision about it.
    if (e.metaKey) return { layer: "pass" };
    if (e.ctrlKey && RESERVED_CODES.includes(e.code) && !at.keyLockHeld) return { layer: "none" };
    // Above `grid` and below `none`: a modal screen outranks everything of ours,
    // and nothing outranks a press the browser has already acted on.
    if (at.menuOpen) return { layer: "menu" };
    if (at.gridOpen) return { layer: "grid" };
    if (at.inMatch && at.isPrefix && e.altKey && !e.ctrlKey && !e.repeat) {
      return { layer: "cancelSection" };
    }
    return { layer: "pass" };
  }

  /**
   * What a keypress means to the client's own in-game menu.
   *
   * The menu is the screen `Escape` opens in a match — Options, Fullscreen,
   * **Abort Mission**, Resume Mission — and the client reaches it through one
   * command, `KeyCommandType.Options`, which its `KeyBinds` table has on
   * keyCode 27 because RA2's own `keyboard.ini` put it there. Two things follow
   * from that, and both are why this table exists rather than a pair of `if`s in
   * the listener:
   *
   * 1. **Escape mid-match is one keystroke from quitting**, and it is the key a
   *    hand reaches for to cancel a placement or clear a selection. Ticked, the
   *    key the client has on `Options` is swallowed and a key of ours opens the
   *    menu deliberately.
   * 2. **The client cannot close the menu from the keyboard at all.** Opening it
   *    disables `WorldInteraction`, which *removes* the client's own keydown
   *    listener — so with the menu up, no key reaches the client, Escape
   *    included, and Resume Mission is a mouse click or nothing. Ours is the
   *    only listener still standing, which is what makes the second half
   *    possible.
   *
   * `isOptionsKey` is the live answer to what opens the menu, not the assumption
   * that it is Escape: the client's table is read through `KeyBinds#addHotKey`,
   * so a player who moved `Options` in the client's own key settings gets *that*
   * key swallowed and Escape left alone.
   *
   * **`inMatch` gates opening, and that is a fix rather than a tidy-up (0.73.1).**
   * A match ends with `GameScreen#onGameEnd` calling `playerUi.dispose()` — which
   * disposes the `WorldInteraction` and so **removes the client's own keydown
   * listener** — and only navigating away from the game screen five seconds
   * later; the `GameMenu` itself is disposed later still, in `onLeave`. In that
   * window the client's own Escape is already dead while ours is not, so an
   * ungated key opened the menu onto a screen the client had finished with:
   * `onOpen` dispatched into a disposed world interaction, a screen was pushed
   * onto a HUD about to be destroyed, and *Abort Mission* there would dispose
   * the player UI a second time and re-run `leaveAction()`. Closing is **not**
   * gated the same way: a menu opened legitimately during a match must still
   * close when the match ends underneath it.
   *
   * Five answers:
   *
   * - **`open`** — our key, with no menu on screen.
   * - **`close`** — our key again, with the menu up: the key that opened it
   *   closes it, from any depth.
   * - **`back`** — Escape one screen deep or more (the Options sub-screen, the
   *   quit confirmation): one step back, not all the way out. A player who
   *   pressed Escape in a confirmation dialog meant that dialog.
   * - **`swallow`** — the client's `Options` key with no menu open. Nothing
   *   happens, which is the whole feature.
   * - **`pass`** — not ours. With the menu open it is still consumed by the
   *   caller returning early, because there is nothing under it to give it to.
   *
   * @param {{code, ctrlKey, altKey, shiftKey, metaKey, repeat}} e
   * @param {{enabled: boolean, inMatch: boolean, menuOpen: boolean,
   *          deep: boolean, isMenuKey: boolean, isOptionsKey: boolean}} at
   * @returns {{act: "open"|"close"|"back"|"swallow"|"pass", consume: boolean}}
   */
  function menuKeyAction(e, at) {
    // Off is off, in both halves. A setting that still closed the menu on Escape
    // would leave the player with a key that behaves one way and a page that
    // says it was left as shipped.
    if (!at.enabled) return { act: "pass", consume: false };
    // Bare Escape only. Ctrl+Escape is the Start menu and Shift+Escape is
    // Chrome's task manager — presses that never arrive, and would mean neither
    // if they did.
    const escape = e.code === "Escape" && !e.ctrlKey && !e.altKey && !e.shiftKey && !e.metaKey;
    if (at.menuOpen) {
      if (!escape && !at.isMenuKey) return { act: "pass", consume: false };
      // A held key is one press. Without this, leaning on Escape walks back out
      // of the menu and into the match at the OS repeat rate.
      if (e.repeat) return { act: "pass", consume: true };
      if (at.isMenuKey) return { act: "close", consume: true };
      return { act: at.deep ? "back" : "close", consume: true };
    }
    // Both halves are a match's, and for the same reason: outside one there is
    // no client listener to take the key from, and nothing that should be
    // opening a menu.
    if (!at.inMatch) return { act: "pass", consume: false };
    if (at.isMenuKey) return { act: e.repeat ? "pass" : "open", consume: true };
    if (at.isOptionsKey) return { act: "swallow", consume: true };
    return { act: "pass", consume: false };
  }

  /**
   * What a keypress means while a grid is open.
   *
   * Pure, and here rather than in the keydown listener, because it is a decision
   * table and it got one row wrong: 0.54.0 closed the grid for every key it did
   * not recognise, and a bare `Shift` is a key it does not recognise — so the
   * grid shut on the way to every shifted order, which made the Shift rule
   * unreachable from the grid it was written for.
   *
   * `consume` is separate from the action on purpose. An unknown key closes the
   * grid but is **not** swallowed: it was meant for the game, and the game
   * should get it. Escape and Control are swallowed, because closing is what
   * they were pressed for.
   *
   * **`place` is the tab key keeping its meaning while the grid is open.** A
   * grid opened on a queue that was still building is still up when the building
   * finishes, and at that moment every slot on it is dead — a ready queue takes
   * nothing else until the structure is on the ground. So the section's own tab
   * key does there what it does with no grid open (`openChord`): it hands the
   * finished building to placement. It costs no slot, because the slot it sits
   * on could not be ordered anyway while the queue is ready.
   *
   * `at` is the live half the caller supplies — which key opened this grid, and
   * whether that section's queue is holding a finished structure right now.
   * Without it the table behaves as it did before.
   *
   * **Alt on a slot key is that slot's cancel** (0.62.0) — the right click the
   * tile already had, reached by the hand that is already on the block. It
   * follows the *key* rule rather than the mouse one (`chordCancelAction`:
   * pause first, cancel on the second press), because that is what the other
   * cancel key on this feature does and two cancels that disagreed about the
   * first press would be two rules to remember. Alt on anything that is **not**
   * a slot is still the game's.
   *
   * @param {{code, key, repeat, ctrlKey, altKey, shiftKey}} e a keydown event
   * @param {{prefix: string, ready: boolean}} [at] the open grid's tab key, and
   *   whether its queue is ready
   * @returns {{act: "hold"|"ignore"|"close"|"order"|"cancel"|"place", consume: boolean, slot?: number, many?: boolean}}
   */
  function chordAction(e, at) {
    // A held key repeats every ~30ms. Swallowed and ignored: acting would be a
    // runaway order, passing it on would feed the game keys under an open grid.
    if (e.repeat) return { act: "hold", consume: true };
    if (MODIFIER_KEYS.includes(e.key)) return { act: "ignore", consume: false };
    // **Ctrl closed the grid until 0.70.0 and now orders through it.** It is the
    // client's own "queue this next" (`UpdateType.AddNext`), so a modifier that
    // used to be a way out is now the second thing a slot key can do — which is
    // why `Control` had to join `MODIFIER_KEYS` above: the Ctrl of a Ctrl+Q
    // arrives as its own keydown first, and a grid that read it would shut
    // before the Q got here. Escape is the way out, as it always was.
    if (e.code === "Escape") return { act: "close", consume: true };
    // Bare only. Shift on a slot is "five of it", which a ready queue has no
    // room for either way, Alt belongs to the game, and Ctrl now means the slot
    // rather than the tab — none is the plain press that means "put the
    // building down".
    if (at && at.ready && at.prefix && e.code === at.prefix && !e.shiftKey && !e.altKey && !e.ctrlKey) {
      return { act: "place", consume: true };
    }
    const slot = GRID_KEYS.indexOf(e.code);
    // Alt or Ctrl held on a key the grid does not have is the game's, exactly as
    // any other unknown key is: the grid closes and the press goes on.
    if (slot < 0) return { act: "close", consume: false };
    // **AltGr is Ctrl+Alt on Windows**, which is how a non-US layout types a
    // character. It is neither the cancel nor the next order, and while Ctrl
    // closed the grid it landed harmlessly on the way out; now that both
    // modifiers mean something it has to be named, or somebody typing an @ into
    // a chat box they have not opened yet cancels a war factory. Swallowed and
    // nothing done, because the grid is up and the press was not for the game
    // either.
    if (e.altKey && e.ctrlKey) return { act: "ignore", consume: true };
    if (e.altKey) return { act: "cancel", consume: true, slot, many: !!e.shiftKey };
    return { act: "order", consume: true, slot, many: !!e.shiftKey, next: !!e.ctrlKey };
  }

  /**
   * Where a box goes when it opens at the pointer.
   *
   * Everything here is **viewport** coordinates, because that is what a mouse
   * event carries. Mapping them through some element's box is how 0.54.2 lost
   * the cursor: one wrong assumption about that box and every chord opens in the
   * same corner. The box is a child of the overlay layer for hit-testing and
   * `position: fixed` for placement — the two do not have to agree.
   *
   * Offset down and right so the pointer does not land on a tile, and clamped on
   * both axes so a chord near an edge opens inwards instead of half off. The
   * clamp is written `min(wanted, furthest)` then floored at `pad`, so a box
   * larger than the window lands at `pad` rather than at a negative offset.
   *
   * @param {{x, y}|null} pointer last known cursor position, or null if unseen
   * @param {{width, height}} size the box's own measured size
   * @param {{width, height}} view the window
   */
  function chordPlacement(pointer, size, view) {
    const pad = 8;
    const nudge = 12;
    const x = pointer ? pointer.x + nudge : (view.width - size.width) / 2;
    const y = pointer ? pointer.y + nudge : (view.height - size.height) / 2;
    return {
      left: Math.round(Math.max(pad, Math.min(x, view.width - size.width - pad))),
      top: Math.round(Math.max(pad, Math.min(y, view.height - size.height - pad))),
    };
  }

  /**
   * May this country build this object?
   *
   * **Not `owner[]`**, which lists every country even for objects only one of
   * them can build — deliberately, and RA2's own rules text says why beside
   * `GTGCAN`: narrowing `Owner` would grey the cameo out on the sidebar instead
   * of hiding it. The real gate is `RequiredHouses`/`ForbiddenHouses`, which the
   * client parses onto every techno rules object.
   *
   * An object nothing is known about passes: silence is not a prohibition.
   */
  function chordSuitsCountry(object, country) {
    if (!object || !country) return true;
    const forbidden = object.forbiddenHouses;
    if (Array.isArray(forbidden) && forbidden.includes(country)) return false;
    const required = object.requiredHouses;
    if (Array.isArray(required) && required.length && !required.includes(country)) return false;
    return true;
  }

  /**
   * Which id of a slot this player means — or `""` when none of them is theirs.
   *
   * Country first, and it has to be: `allAvailableObjects` is one array shared
   * by every player, so "the side owns it" says nothing about who may build it,
   * and before prerequisites are up nothing is "available" either. Resolving on
   * availability alone fell through to the first id, which for an American is
   * the Airforce Command every country *but* America builds.
   *
   * **`""` when the country fits none of them**, and an empty tile is the right
   * answer rather than a dimmed one: dimmed says "not yet", while a German Tank
   * Destroyer on a Korean grid is never. The last key of every block is exactly
   * this case for most countries, which is why it is the last key.
   *
   * @param {string[]} ids the slot's ids, in preference order
   * @param {string} country the player's, or "" outside a match
   * @param {(id: string) => ({available?: boolean, object?: object})} info
   */
  function chordResolve(ids, country, info) {
    const list = (ids || []).filter(Boolean);
    if (!list.length) return "";
    const at = (id) => info(id) || {};
    if (!country) return list.find((id) => at(id).available) || list[0];
    const mine = list.filter((id) => chordSuitsCountry(at(id).object, country));
    if (!mine.length) return "";
    return (
      mine.find((id) => at(id).available) ||
      // Owned but not yet buildable: the tile still carries its real name and
      // picture while the prerequisites are missing.
      mine.find((id) => at(id).object) ||
      mine[0]
    );
  }

  /**
   * Put `value` on `slot`, and hand back the whole row.
   *
   * **If it is already on another key, the two trade places.** The alternatives
   * are both worse: leaving it on both keys puts one object in two places, which
   * the grid cannot show and a match resolves by whichever key you happen to
   * press; clearing the old key would take away a binding nobody asked to lose.
   * A swap keeps the row full, and doing it again undoes it.
   *
   * Pure, and here rather than in the options page, so the behaviour can be
   * tested without a browser — see scripts/check-chords.mjs.
   */
  function chordPlace(rows, slot, value) {
    const next = rows.slice();
    const key = chordSlotKey(value);
    const from = key
      ? next.findIndex((other, i) => i !== slot && chordSlotKey(other) === key)
      : -1;
    if (from >= 0) next[from] = next[slot];
    next[slot] = value;
    return next;
  }

  /**
   * What a right click on a tile means — the client's own mirror of the cameo
   * click, as a table.
   *
   * `CombatantUi#handleSidebarSlotClick` on button 2, read out of v0.83.3: the
   * queue is `Active` and this object is at its head → **Pause**, which is a
   * property of the queue and not of the item; otherwise, if this object is in
   * the queue at all and the queue is one of `Ready`/`OnHold`/`Active` →
   * **Cancel** `min(queued, shift ? all : 1)`; otherwise the click is scolded.
   *
   * Note what is *not* here: a paused item is cancelled by a second right
   * click, not resumed — resuming is the left click's job, which is what
   * `queueBuild` already does. And the client's own `Math.min(queued,
   * Infinity)` is written out as `queued`, since only a finite quantity can be
   * serialised (`UpdateQueueAction#serialize` writes a uint16 and throws above
   * 65535).
   *
   * Pure and here rather than in the listener, for the same reason
   * `chordAction` is: it is a decision table, and this one has four rows that
   * are only ever exercised in a running match.
   *
   * @param {{status: string, queued: number, isFirst: boolean}} at the queue's
   *   answer about this object — `status` is `QueueStatus`'s own name, lowered
   * @param {number} want how many to take off: 1, `CANCEL_MANY`, or `Infinity`
   *   for the lot — never more than is actually queued
   * @returns {{act: "pause"|"cancel"|"none", quantity?: number}}
   */
  function chordQueueAction(at, want) {
    const queued = (at && at.queued) || 0;
    const status = (at && at.status) || "";
    if (!queued) return { act: "none" };
    if (status === "active" && at.isFirst) return { act: "pause" };
    if (["ready", "onhold", "active"].includes(status)) {
      return { act: "cancel", quantity: Math.min(queued, want) };
    }
    return { act: "none" };
  }

  /**
   * How many a Shift'd cancel key takes off a queue — the client's own five,
   * the quantity a shift-click has always added and the one the grid's Shift
   * already orders. Everything-at-once stays on the right click, where it is a
   * deliberate gesture at one tile rather than a key pressed under fire.
   */
  const CANCEL_MANY = 5;

  /**
   * Which of a section's queues a Ctrl press acts on.
   *
   * A sidebar tab is **not** a queue: the Units tab alone feeds Vehicles, Ships
   * and Aircraft, and a player pressing Ctrl+R means "the thing that tab is
   * building". So the candidates are read in the section's own order and the
   * first one that is *actively building* wins; with none active, the first that
   * holds anything at all — a paused queue is exactly what the next press is
   * for, and the second half of a pause/cancel pair has to reach the queue the
   * first half paused.
   *
   * An empty queue is never picked, so a press with nothing queued anywhere
   * says so rather than acting on the tab's first queue by default.
   *
   * **`prefer` beats everything, and it is what makes the pair a pair.** A tab
   * whose queues are all building — Units feeds Vehicles, Ships and Aircraft —
   * would send the pause to the first active queue and then the cancel to the
   * *next* one, because the queue the first press held is no longer active and
   * the rule above moves on. So the caller names the queue its last press acted
   * on, and it wins for as long as it is still holding something. Held with no
   * clock on it, because the sidebar's own right click has none either: it is a
   * click on one cameo, and pausing then wandering off then cancelling reaches
   * the same queue however long the gap.
   *
   * @param {Array<{type: any, status: string, queued: number}>} candidates in section order
   * @param {any} [prefer] the queue type the last press acted on, if any
   * @returns {object|null} the candidate to act on, or null for nothing queued
   */
  function chordCancelQueue(candidates, prefer) {
    const held = (candidates || []).filter((queue) => queue && queue.queued > 0);
    if (!held.length) return null;
    const sticky = prefer === undefined ? null : held.find((queue) => queue.type === prefer);
    return sticky || held.find((queue) => queue.status === "active") || held[0];
  }

  /**
   * What Ctrl on a sidebar tab key means for the queue it landed on.
   *
   * The same table as the right click — `chordQueueAction`, which is the
   * client's own — so a key and a click on a tile can never disagree: **Active
   * and at the head → Pause; already on hold, or ready → Cancel.** A structure
   * being built is therefore held by the first press and cancelled by the
   * second, while a *ready* one cancels on the first, because a ready queue has
   * nothing left to pause.
   *
   * Asking for more than one is the addition, and it is the whole point of the
   * modifiers here: cancel five — or everything, or what is there, if fewer —
   * **now**, and when the queue is still running push the Pause the plain press
   * would have sent ahead of it in the same press (`pauseFirst`). Without that,
   * a shifted press on a running queue would only pause, which is not what
   * someone who asked for five gone meant.
   *
   * @param {{status: string, queued: number, isFirst: boolean}} at the queue's
   *   answer about the object at issue, in `queueStateFor`'s shape
   * @param {number} want 1 (Shift-less: the pause), `CANCEL_MANY` (Shift), or
   *   `Infinity` (held down)
   * @returns {{act: "pause"|"cancel"|"none", quantity?: number, pauseFirst?: boolean}}
   */
  function chordCancelAction(at, want) {
    const base = chordQueueAction(at, 1);
    if (want <= 1 || base.act === "none") return base;
    return {
      act: "cancel",
      quantity: Math.min((at && at.queued) || 0, want),
      pauseFirst: base.act === "pause",
    };
  }

  /**
   * What pressing a slot's key does — order, activate, or say why not.
   *
   * The rule the whole superweapon feature turns on, and the one line of it that
   * is a judgement is **not** made here: `showTimer` comes from the game's own
   * rules. A weapon that shows a sidebar timer is a superweapon, and its
   * building's key stops ordering once you have it — there is nothing left to
   * order, since a second building grants no second weapon (the client's
   * `addSuperWeaponToPlayerIfNeeded` guards on `!has(name)`). A weapon that
   * shows none is a side effect of an ordinary building — the American Airforce
   * Command, which is built several times over for the planes — and its key goes
   * on meaning what it always did.
   *
   * `charging` covers `Paused` as well as `Charging`, and deliberately: a
   * low-power base pauses an `IsPowered` weapon, and "not yet" is the same
   * answer to the same press. What the caller says about it differs, because the
   * remedy does.
   *
   * @param {{isSuperWeapon: boolean, superWeapon: {showTimer: boolean, status: string}|null}} at
   *   `superWeapon` is what the player actually holds — null when they hold none
   *   — and `status` is `SuperWeaponStatus`'s own name, lowered.
   * @returns {{act: "order"|"activate"|"charging"|"missing"}}
   */
  function chordSlotAction(at) {
    const sw = (at && at.superWeapon) || null;
    const isSw = !!(at && at.isSuperWeapon);
    if (!sw || (!isSw && !sw.showTimer)) return { act: isSw ? "missing" : "order" };
    return { act: sw.status === "ready" ? "activate" : "charging" };
  }

  /**
   * The **one** set of keys to hold against the browser, given what the client
   * asked for and what we want on top of it.
   *
   * There is one keyboard lock per page and `keyboard.lock(codes)` **replaces**
   * the set rather than adding to it — which is the whole of the 0.59.0 defect
   * this exists to prevent. The client locks `Escape, F5, F12, F11` every time
   * it enters fullscreen (`onFullScreenChange`), so that Escape reaches the game
   * instead of leaving fullscreen; a lock of our four tab keys released exactly
   * that, the next Escape dropped out of fullscreen, and **leaving fullscreen
   * ends the lock altogether**, so Ctrl+W went back to closing the tab. One
   * call, the whole chain, and none of it visible until an Escape was pressed.
   *
   * So neither side asks for a lock directly any more: both go through this, and
   * the answer is always a superset of what each wanted.
   *
   * The `Escape` floor covers the one window where the client's wish is not yet
   * known — our own lock lands on entering fullscreen, in the same event the
   * client locks in, and listener order is not ours to decide. Locking our keys
   * *without* Escape for even one frame is the defect itself, and re-adding a
   * key the client is about to ask for anyway costs nothing.
   *
   * @param {{seen: boolean, all: boolean, codes: string[]}} client what the
   *   client last asked for — `all` for a no-argument lock, which is every key
   * @param {string[]} ours the codes this extension wants, empty for none
   * @returns {{act: "lock"|"unlock", all?: boolean, codes?: string[]}}
   */
  function chordKeyLockPlan(client, ours) {
    const want = (ours || []).filter(Boolean);
    const seen = !!(client && client.seen);
    if (seen && client.all) return { act: "lock", all: true };
    const codes = [];
    for (const code of [
      ...(seen ? client.codes || [] : []),
      ...(want.length && !seen ? ["Escape"] : []),
      ...want,
    ]) {
      if (!codes.includes(code)) codes.push(code);
    }
    return codes.length ? { act: "lock", codes } : { act: "unlock" };
  }

  /**
   * Is a slot drawn as a tile, or left as a hole in the block?
   *
   * Two rules, and which of them applies is the user's own setting.
   *
   * **The whole grid** (`onlyBuildable` false, what ships): everything this
   * country builds, orderable at this moment or not, with what cannot be
   * ordered dimmed rather than blanked — so the key is always where the hand
   * left it, and a dimmed tile can answer *the key is right, what is the thing
   * waiting on?*
   *
   * **Only what can be built now**: a tile waiting on the tech tree is not
   * drawn at all — a prerequisite that is not up, a factory that is gone, a
   * stolen-tech unit before the spy has been in. What is **owned** rather than
   * merely unlocked stays, which is the whole reason this can be one flag: an
   * Ore Purifier or a Cloning Vats already standing is still *available* to the
   * client, since `isAvailableForProduction` weighs tech level, factory and
   * prerequisites and never looks at `BuildLimit` — so it draws as an ordinary
   * tile and the build-limit dim is what says why the key is dead.
   *
   * A key that **aims** rather than orders is drawn either way, whatever
   * availability says: a charged Chronosphere is the one tile on the grid that
   * must never vanish, and the battle lab whose loss takes its building's
   * availability with it has nothing to do with the weapon already held.
   *
   * Two cases are holes in both modes, and both are *never* rather than *not
   * yet*: a slot no id of which this country builds — a German Tank Destroyer
   * on a Korean grid — and a `sw:` slot whose weapon is not held, which has no
   * picture to draw either, since the cameo comes off the weapon.
   *
   * @param {{bound: boolean, isSuperWeapon: boolean, hasWeapon: boolean,
   *   available: boolean, uses: boolean, onlyBuildable: boolean}} at
   */
  function chordSlotShown(at) {
    if (!at || !at.bound) return false;
    if (at.isSuperWeapon) return !!at.hasWeapon;
    if (!at.onlyBuildable) return true;
    return !!at.available || !!at.uses;
  }

  /**
   * How many rows of the grid there is anything to draw in.
   *
   * A hidden slot keeps its cell: the grid's geometry is the keyboard's, and a
   * hole that closed up would move every key after it — the block would stop
   * being the block under the hand, which is the one thing the layout is for.
   * What *can* go is a trailing row with nothing in it, since dropping it moves
   * nothing. Most sections ship an empty bottom row and every section has one
   * early in a match, so this is the difference between a grid and a grid with a
   * band of nothing under it.
   *
   * @param {boolean[]} shown one flag per slot, in slot order
   * @param {number} cols the grid's width
   */
  function chordGridRows(shown, cols) {
    const columns = cols || 1;
    const flags = shown || [];
    for (let row = Math.ceil(flags.length / columns); row > 0; row--) {
      if (flags.slice((row - 1) * columns, row * columns).some(Boolean)) return row;
    }
    return 0;
  }

  /**
   * Every object a layout binds, as object name -> the key that reaches it.
   *
   * The sidebar shows objects; a layout stores slots. This is the index between
   * them, built once per side and read once per cameo, because the alternative
   * — scanning four fifteen-slot layouts per cameo per frame — is the same
   * answer computed sixty times a second.
   *
   * Keyed by the name the **client** uses, which is `rules.name` for a techno
   * and the superweapon's own name for a `sw:` slot: a badge is matched against
   * what the sidebar is holding, not against what the layout wrote. Both ids of
   * a country pair are indexed, since only one of them is ever on the sidebar
   * and which one is the country's business.
   *
   * A name bound in two sections keeps the first — section order is fixed, so
   * the answer is at least the same one every time. The client puts an object
   * on exactly one tab, so this is a defence against a layout that disagrees
   * with itself, not a case that arises.
   */
  function chordBadges(chords, side) {
    const out = new Map();
    for (const section of SECTIONS) {
      const layout = chordLayout(chords, side, section.id);
      layout.forEach((value, slot) => {
        for (const id of chordSlotIds(value)) {
          const name = chordIsSuperWeapon(id) ? chordSuperWeaponName(id) : id;
          if (!name || out.has(name)) continue;
          out.set(name, { section: section.id, slot, key: chordKeyLabel(slot) });
        }
      });
    }
    return out;
  }

  /**
   * Teach the badge index that a superweapon building's key means two things.
   *
   * A slot holding, say, the Chronosphere orders the building while there is no
   * Chronosphere, and **aims the weapon** once there is — `slotSuperWeapon`
   * has read it that way since superweapons got keys. The client draws those
   * two as two different cameos: the building in its own tab, and the ability
   * the sidebar model unshifts onto Armory the moment the weapon exists. So an
   * index that only knows the building loses the badge exactly when the key
   * becomes worth advertising.
   *
   * `grants` is `[objectName, weaponName]` for every object that carries a
   * `SuperWeapon=`, which only a running client can answer — hence a function
   * that takes the pairs rather than one that goes looking for them.
   *
   * A weapon already on the index keeps what it has: the two paradrops are slots
   * in their own right, and a building that happens to grant one must not
   * quietly take its key.
   *
   * @param {Map} map the index from `chordBadges`, edited in place
   * @param {Array<[string, string]>} grants object name -> the weapon it grants
   */
  function chordBadgeWeapons(map, grants) {
    for (const [name, weapon] of grants || []) {
      const at = map.get(name);
      if (!at || !weapon || map.has(weapon)) continue;
      // `from` is what lets the drawing side know this badge is the building's
      // key wearing the weapon's face, rather than a slot of the weapon's own.
      map.set(weapon, { ...at, from: name });
    }
    return map;
  }

  /**
   * A box in the client's canvas pixels, in the viewport pixels an overlay uses.
   *
   * The two spaces are not the same and the difference is not the device pixel
   * ratio. The client sizes its canvas `Math.max(800, min(innerWidth, cfg))` —
   * so a window narrower or shorter than 800x600 gets a canvas **larger than
   * its own box**, which the browser then scales down to fit. `rect.width /
   * canvas.width` is that factor, it is 1 for every window big enough, and it
   * is the whole of what "handle scaling" means here: browser zoom, a resized
   * window and a fullscreen toggle all arrive as a different rect, a different
   * canvas size, or both.
   *
   * `scale` is the smaller of the two axes, for anything sized rather than
   * placed — a badge's text has one size and the box may be scaled unevenly.
   *
   * @param {{x:number,y:number,width:number,height:number}} box in canvas pixels
   * @param {{left:number,top:number,width:number,height:number}} rect the canvas's client rect
   * @param {{width:number,height:number}} canvas the canvas's own pixel size
   */
  function chordScreenBox(box, rect, canvas) {
    const kx = canvas && canvas.width ? rect.width / canvas.width : 1;
    const ky = canvas && canvas.height ? rect.height / canvas.height : 1;
    return {
      left: rect.left + box.x * kx,
      top: rect.top + box.y * ky,
      width: box.width * kx,
      height: box.height * ky,
      scale: Math.min(kx, ky),
    };
  }

  window.__cdcBuildChords = {
    SECTIONS,
    GRID_KEYS,
    GRID_COLS,
    DEFAULT_CHORDS,
    VARIANTS,
    chordLayout,
    chordLayoutIsLegacy,
    chordOverride,
    chordKeyLabel,
    chordSlotIds,
    chordSlotKey,
    chordVariantOf,
    chordIsDeck,
    chordPlace,
    chordAction,
    chordPressRoute,
    menuKeyAction,
    RESERVED_CODES,
    chordQueueAction,
    chordSlotAction,
    chordKeyLockPlan,
    chordIsSuperWeapon,
    chordSuperWeaponName,
    chordSuperWeaponRow,
    SUPERWEAPONS,
    chordCancelQueue,
    chordCancelAction,
    chordGridRows,
    chordSlotShown,
    chordBadges,
    chordBadgeWeapons,
    chordScreenBox,
    chordPlacement,
    chordResolve,
    chordSuitsCountry,
    MODIFIER_KEYS,
    CANCEL_MANY,
  };
})();
