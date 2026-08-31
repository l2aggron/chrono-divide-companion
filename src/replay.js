/**
 * What a ladder replay says, without a client.
 *
 * A `.rpl` is a text file: three header lines, then one line per game tick that
 * carried anything — `<tick>=<eventType>|<base64>` — and `END <tick>`. The
 * base64 is the same action frame the client sends over the wire each network
 * turn, so a replay is a complete record of what every player *did*: what they
 * queued, what they placed and where, what they sold, when they resigned.
 *
 * That makes a build order a file parse. The alternative — booting the client at
 * `#/replay/<url>` and reading the live objects ([[live-radar-and-automation]])
 * — is the only way to learn what the actions *resulted in* (credits, kills,
 * what a queue actually finished), and it costs a game load per replay. This
 * file deliberately does the cheap half, and says so where the difference bites:
 * a queued unit is an intent, a placed building is a fact.
 *
 * Byte layout, enums and the tick rate were read out of the client's own
 * `network/gameopt/Parser` and verified against eight ladder replays on
 * 2026-08-16.
 *
 * No DOM, no chrome APIs, no storage — so `scripts/check-replay.mjs` runs this
 * very file under node against a fixture. A copy of the logic in the check would
 * pass while the shipped file was broken.
 */
(() => {
  "use strict";

  const TAG = "[cd-companion/replay]";

  // Where a realm's replays are served from. The same two hosts manifest.json
  // holds the permission for — an extension page can only fetch a replay from a
  // host it declared, so adding a realm here without adding it there gives a
  // silent CORS failure at run time.
  const REPLAY_HOSTS = {
    "am-eu": "https://replays-eu.chronodivide.com",
    sea: "https://replays-sea.chronodivide.com",
  };

  /**
   * The ladder runs at speed 6 and nothing in a ranked match changes it, but the
   * file states its own speed, so the rate is computed rather than assumed.
   *
   * `GameSpeed.BASE_TICKS_PER_SECOND` is 15 and `computeGameSpeed` returns
   * `60 / (6 - speed)` capped at 60 — a multiplier over that base. Speed 6 is
   * therefore 60 ticks per second, which is what turns a tick into a timestamp.
   * Checked against the ladder API's own `duration` for eight matches: every one
   * agrees to the minute.
   */
  const BASE_TICKS_PER_SECOND = 15;

  // `computeGameSpeed` divides these by the base to get a multiplier, and a tick
  // rate multiplies it straight back — so this is the rate itself.
  const ticksPerSecondFor = (speed) => (speed === 6 ? 60 : speed === 5 ? 45 : 60 / (6 - speed));

  const ActionType = {
    NoAction: 0,
    DropPlayer: 1,
    ObserveGame: 2,
    ResignGame: 3,
    DebugCommand: 4,
    PlaceBuilding: 5,
    SellObject: 6,
    ToggleRepair: 7,
    SelectUnits: 8,
    OrderUnits: 9,
    UpdateQueue: 10,
    ToggleAlliance: 11,
    ActivateSuperWeapon: 12,
    PingLocation: 13,
  };
  const ACTION_NAMES = Object.fromEntries(Object.entries(ActionType).map(([k, v]) => [v, k]));

  const QueueType = ["Structures", "Armory", "Infantry", "Vehicles", "Aircraft", "Ships"];
  const UpdateType = ["Add", "Cancel", "Pause", "Resume", "AddNext"];

  /**
   * `game/order/OrderType` — what an `OrderUnits` action is an order to do.
   *
   * Read out of `ra2web.min.js`. The order carries no unit: `OrderUnitsAction`
   * serialises the type, then an optional target, and the units it applies to
   * are whatever the player's last `SelectUnits` named. So the file states what
   * was ordered and to where, never to what — the ids in a selection are runtime
   * object ids and nothing in the file maps one to a type.
   */
  const OrderType = [
    "Move",
    "ForceMove",
    "Attack",
    "ForceAttack",
    "AttackMove",
    "Guard",
    "GuardArea",
    "Capture",
    "Occupy",
    "Deploy",
    "DeploySelected",
    "Stop",
    "Cheer",
    "Dock",
    "Gather",
    "Repair",
    "Scatter",
    "EnterTransport",
    "PlaceBomb",
  ];
  const DEPLOY_ORDERS = new Set(["Deploy", "DeploySelected"]);

  // engine/type/ObjectType, only the four a production queue can hold.
  const OBJECT_TYPE = { 1: "aircraft", 2: "building", 3: "infantry", 7: "vehicle" };

  // rules [Countries] in file order, which is what a countryId indexes. Checked
  // against two live rows of the ladder's own match history (5 -> Libya,
  // 6 -> Iraq, both Soviet, both seen building Soviet structures).
  const COUNTRIES = [
    { label: "USA", side: "Allied" },
    { label: "Korea", side: "Allied" },
    { label: "France", side: "Allied" },
    { label: "Germany", side: "Allied" },
    { label: "Great Britain", side: "Allied" },
    { label: "Libya", side: "Soviet" },
    { label: "Iraq", side: "Soviet" },
    { label: "Cuba", side: "Soviet" },
    { label: "Russia", side: "Soviet" },
  ];

  /**
   * Two adds of the same thing this close together are one order, not two.
   *
   * Eight conscripts queued in two seconds is one decision and reads as one line
   * ("Conscript x8"); the same eight spread over a minute is a build order and
   * has to stay eight lines. Ten seconds separates those two cases in every
   * replay looked at, and the rows carry their own count either way, so a wrong
   * grouping is misleading rather than lossy.
   */
  const GROUP_SECONDS = 10;

  /**
   * The same rule for a track where "one decision" is not the question.
   *
   * A delivery is not a decision a reader is trying to see whole — it is the
   * check on the orders above it, and its whole worth is the second it landed
   * on. Ten seconds folded a factory's steady run into one row printed at the
   * moment the first tank appeared: four tanks over twenty-seven seconds stated
   * as one instant, with the row's own `until` holding the evidence against it.
   *
   * A second rather than nothing, because several things genuinely can leave at
   * once — two barracks, or a run of cheap infantry — and because the timeline
   * groups its rows by the second anyway, so this is exactly "the rows a reader
   * would see on one clock reading". Measured from the group's *start*, never
   * chained: a delivery row can then never span more than the window it claims.
   */
  const DELIVERY_SECONDS = 1;

  /**
   * How far a building's spawn may sit from the placement that caused it and
   * still be that placement.
   *
   * The pairing is what tells a placed building from a deployed one: a player's
   * building appears because `tryPlaceBuilding` ran, and that runs on the tick
   * the file's `PlaceBuilding` action is scheduled for, so the two times are the
   * same time read off two clocks. Two seconds is slack for the scheduling and
   * nothing more — a deploy has no placement anywhere in the file, so widening
   * this cannot rescue one, it can only let a placement swallow a deploy of the
   * same building by the same player, which is the failure worth avoiding.
   */
  const PLACEMENT_SECONDS = 2;

  /**
   * How close two placements of the same building on the same tile have to be
   * to be one placement sent twice.
   *
   * The game creates the first and refuses the second — the tile is taken and
   * the queue is no longer `Ready` — so only one building ever exists, but the
   * file records both actions and a reader that draws both says a player built
   * something they did not. Seen in the wild 0.1 to 0.2 seconds apart, on one
   * player's side of a match and not the other's, which is what a client
   * re-sending a click looks like rather than a habit of pressing twice.
   *
   * A second is generous and still safe: for a repeat to be a genuine second
   * building, the first would have to be destroyed and the tile cleared inside
   * that window.
   */
  const RESEND_SECONDS = 1;

  const decodeBase64 = (b64) => {
    if (typeof atob === "function") {
      const raw = atob(b64);
      const out = new Uint8Array(raw.length);
      for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
      return out;
    }
    return new Uint8Array(Buffer.from(b64, "base64")); // node, for the check script
  };

  /**
   * The client's `binaryStringToUtf16`: byte pairs, high byte first.
   *
   * Both the map title in the header and a chat line are encoded this way, and
   * getting the order wrong yields Chinese rather than an error — worth having
   * one function for it.
   */
  const utf16 = (bytes) => {
    let out = "";
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  };

  const isBase64 = (s) => typeof s === "string" && /^[A-Za-z0-9+/]*={0,2}$/.test(s) && s.length % 4 === 0;

  /**
   * A replay URL out of whatever the user had in the clipboard.
   *
   * Four things name the same match and all four get pasted: the leaderboard's
   * game page, the client's own `#/replay/<encoded url>` route, the replay file
   * itself, and a bare game id. Only the first states a realm; the rest are
   * taken at their word, and a bare id falls back to the realm asked for.
   *
   * @returns {{url: string, gameId: string, realm: string} | null}
   */
  function locate(input, realm = "am-eu") {
    const text = String(input || "").trim();
    if (!text) return null;
    const host = REPLAY_HOSTS[realm] ? realm : "am-eu";

    // The client route, which carries a whole URL as one encoded parameter.
    const route = text.match(/#\/replay\/(.+)$/);
    if (route) return locate(decodeURIComponent(route[1]), host);

    // The leaderboard's own game page: /<realm>/<ladder>/game/<id>.
    const page = text.match(/ladder\.chronodivide\.com\/([\w-]+)\/[\w-]+\/game\/([0-9a-f-]{36})/i);
    if (page) {
      const named = REPLAY_HOSTS[page[1]] ? page[1] : host;
      return { url: `${REPLAY_HOSTS[named]}/${page[2]}.rpl`, gameId: page[2], realm: named };
    }

    if (/^https?:/i.test(text)) {
      const id = (text.match(/([0-9a-f-]{36})\.rpl/i) || [])[1] || "";
      const named = Object.keys(REPLAY_HOSTS).find((key) => text.startsWith(REPLAY_HOSTS[key])) || host;
      return { url: text, gameId: id, realm: named };
    }

    const bare = text.match(/^([0-9a-f-]{36})(\.rpl)?$/i);
    if (bare) return { url: `${REPLAY_HOSTS[host]}/${bare[1]}.rpl`, gameId: bare[1], realm: host };

    return null;
  }

  /** The gameopts line — the header record that names the map and the players. */
  function parseOptions(line) {
    const [head, humans] = line.split(":");
    const f = head.split(",");
    let i = 2; // two fields the client's own parser shifts past without reading
    const num = () => Number(f[i++]);
    const bool = () => Boolean(Number(f[i++]));
    const opts = {
      gameSpeed: 6 - Number(f[i++]),
      credits: num(),
      unitCount: num(),
      shortGame: bool(),
      superWeapons: bool(),
      buildOffAlly: bool(),
      mcvRepacks: bool(),
      cratesAppear: bool(),
      gameMode: num(),
      hostTeams: bool(),
    };
    const title = f[i++];
    opts.mapTitle = isBase64(title) ? utf16(decodeBase64(title)) : title;
    opts.maxSlots = num();
    opts.mapOfficial = bool();
    opts.mapSizeBytes = num();
    // FileNameEncoder is an identity for every ladder map seen; a name that
    // needed decoding would arrive percent-escaped and is left as it came rather
    // than guessed at.
    opts.mapName = f[i++];
    opts.mapDigest = f[i++];

    const parts = (humans || "").split(",");
    const players = [];
    for (let p = 0; p + 7 < parts.length; p += 8) {
      const countryId = Number(parts[p + 1]);
      const country = COUNTRIES[countryId];
      players.push({
        id: players.length,
        name: parts[p],
        countryId,
        country: country ? country.label : `country ${countryId}`,
        side: country ? country.side : "",
        colorId: Number(parts[p + 2]),
        startPos: Number(parts[p + 3]),
        teamId: Number(parts[p + 4]),
      });
    }
    return { opts, players };
  }

  /**
   * One `TurnActions` frame: every player, whether they acted or not.
   *
   * The padding is the point of the comment — a player who did nothing this turn
   * still gets a `NoAction`, which is why raw action counts come out identical
   * for both sides and why anything calling itself APM has to drop type 0.
   */
  function parseFrame(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const out = [];
    let at = 0;
    const players = view.getUint8(at++);
    for (let p = 0; p < players; p++) {
      const playerId = view.getUint8(at++);
      const length = view.getUint16(at, true);
      at += 2;
      const end = at + length;
      if (length) {
        let inner = at;
        const count = view.getUint8(inner++);
        for (let a = 0; a < count; a++) {
          const type = view.getUint8(inner++);
          const size = view.getUint16(inner, true);
          inner += 2;
          out.push({ playerId, type, params: bytes.subarray(inner, inner + size) });
          inner += size;
        }
      }
      at = end;
    }
    return out;
  }

  /** The harvested rules table, if the host has installed one on `window`. */
  const types = () => (typeof window !== "undefined" && window.__cdcReplayTypes) || null;

  /** `[General]`, out of the same harvest — what the queue model is built out of. */
  const generalRules = () => (typeof window !== "undefined" && window.__cdcReplayRules) || null;

  /**
   * An object id to something readable.
   *
   * The id is an ordinal into the rules type lists, not an ini key — so without
   * the generated table there is no way to guess, and the id is shown as-is
   * rather than silently dropped. A report full of `vehicle #9` is a missing
   * table, which is a fixable complaint; a report missing its rows is not.
   */
  function objectFor(id, objectType) {
    const kind = OBJECT_TYPE[objectType] || "object";
    const table = types();
    const row = table && table[kind] && table[kind][id];
    // `unnamed` travels with the object because a later stage pairs on `name`,
    // and `building #12` is a placeholder that pairs with nothing. Without it
    // that stage cannot tell a name it failed to match from one it never had.
    if (!row) return { kind, id, name: `${kind} #${id}`, label: `${kind} #${id}`, cost: 0, unnamed: true };
    // `factory`, `docks` and `limit` when the table has them — the three rules
    // fields the queue model needs, carried on the object rather than looked up
    // again, since every caller already holds this.
    return { kind, id, name: row[0], label: row[1] || row[0], cost: row[2] || 0, ...(row[3] || {}) };
  }

  /**
   * A replay's text into events.
   *
   * Everything is kept, including the actions this file has no decoder for
   * (`SelectUnits`, `OrderUnits` and friends keep their raw params) — they are
   * what an action mix and an APM are counted from, and a later pass that wants
   * attack timings will find them here rather than having to re-read the file.
   */
  function parse(text) {
    const lines = String(text).split(/\r?\n/);
    const version = (lines[0] || "").match(/^RA2TSREPL_v(\d+)$/);
    if (!version) throw new Error("not a Chrono Divide replay — no RA2TSREPL header");
    const engine = (lines[1] || "").match(/^ENGINE (\d+\.\d+)(?: (\d+))?$/);
    // `<gameId> <unixSeconds> <gameopts>`. Split on the first two spaces only —
    // a player name inside the options field is allowed to contain one.
    const topic = (lines[2] || "").match(/^(\S+) (\d+) (.*)$/) || ["", "", "0", ""];
    const { opts, players } = parseOptions(topic[3]);

    const ticksPerSecond = ticksPerSecondFor(opts.gameSpeed);
    const events = [];
    const chat = [];
    let endTick = 0;

    for (let i = 3; i < lines.length; i++) {
      const line = lines[i];
      if (!line) continue;
      if (line.startsWith("END ")) {
        endTick = Math.max(endTick, Number(line.slice(4)) || 0);
        continue;
      }
      const split = line.indexOf("=");
      const bar = line.indexOf("|");
      if (split < 0 || bar < split) continue;
      const tick = Number(line.slice(0, split));
      const eventType = Number(line.slice(split + 1, bar));
      const payload = line.slice(bar + 1);
      if (!Number.isFinite(tick)) continue;
      endTick = Math.max(endTick, tick);

      if (eventType === 1 || eventType === 2) {
        const [who, rest] = payload.split(":");
        chat.push({
          tick,
          playerId: Number(who),
          taunt: eventType === 2,
          text: eventType === 2 ? `taunt ${rest}` : utf16(decodeBase64(rest || "")),
        });
        continue;
      }
      if (eventType !== 0) continue;

      let frame;
      try {
        frame = parseFrame(decodeBase64(payload));
      } catch (e) {
        // One unreadable frame costs that turn and nothing else; a parser that
        // gave up here would lose a whole match to one truncated line.
        console.warn(TAG, `frame at tick ${tick} could not be read`, e);
        continue;
      }
      for (const action of frame) {
        if (action.type === ActionType.NoAction) {
          events.push({ tick, playerId: action.playerId, type: action.type, name: "NoAction" });
          continue;
        }
        const event = { tick, playerId: action.playerId, type: action.type, name: ACTION_NAMES[action.type] || `type ${action.type}` };
        const p = action.params;
        const view = p.length ? new DataView(p.buffer, p.byteOffset, p.byteLength) : null;
        if (action.type === ActionType.PlaceBuilding && p.length >= 8) {
          event.object = objectFor(view.getUint32(0, true), 2);
          event.tile = { x: view.getUint16(4, true), y: view.getUint16(6, true) };
        } else if (action.type === ActionType.UpdateQueue && p.length >= 2) {
          event.queue = QueueType[p[0]] || `queue ${p[0]}`;
          event.update = UpdateType[p[1]] || `update ${p[1]}`;
          if (p.length >= 9) {
            event.object = objectFor(view.getUint32(2, true), p[6]);
            event.quantity = view.getUint16(7, true);
          }
        } else if (action.type === ActionType.SellObject && p.length >= 4) {
          event.objectId = view.getUint32(0, true);
        } else if (action.type === ActionType.SelectUnits) {
          // Four bytes an object, and nothing else in the payload. This is the
          // only place the file says which objects an order below is about — an
          // order names none of its own — so dropping it, as this parser did
          // until 0.46.3, threw away the subject of every order in the match.
          event.selected = [];
          for (let at = 0; at + 4 <= p.length; at += 4) event.selected.push(view.getUint32(at, true));
        } else if (action.type === ActionType.OrderUnits && p.length >= 1) {
          // `OrderUnitsAction#unserialize`: `u8 orderType`, `u8 fields`, and
          // then as many of `u16 tileX`, `u16 tileY`, `u8 queue`, `u32 targetId`
          // as `fields` says are there. An order with `fields === 0` is aimed at
          // the selection and nowhere else, which is what a deploy is.
          event.orderType = p[0];
          event.order = OrderType[p[0]] || `order ${p[0]}`;
          const fields = p.length >= 2 ? p[1] : 0;
          if (fields >= 2 && p.length >= 6) event.target = { x: view.getUint16(2, true), y: view.getUint16(4, true) };
          if (fields >= 4 && p.length >= 11) event.targetId = view.getUint32(7, true);
        }
        events.push(event);
      }
    }

    return {
      version: Number(version[1]),
      engine: { version: engine ? engine[1] : "", modHash: engine && engine[2] ? Number(engine[2]) : 0 },
      gameId: topic[1] || "",
      startedAt: Number(topic[2]) * 1000 || 0,
      opts,
      players,
      ticksPerSecond,
      endTick,
      duration: endTick / ticksPerSecond,
      events,
      chat,
    };
  }

  /**
   * Which factory count sets a queue's build speed — `getFactoryTypeForQueueType`.
   *
   * RA2's own rules put `Factory=UnitType` on both shipyards, so a naval player's
   * `NavalUnitType` count is zero and their ships build at the one-factory rate.
   * That is the engine's arithmetic, not a mistake here, and it is mirrored
   * rather than corrected.
   */
  const QUEUE_FACTORY = {
    Structures: "BuildingType",
    Armory: "BuildingType",
    Infantry: "InfantryType",
    Vehicles: "UnitType",
    Aircraft: "AircraftType",
    Ships: "NavalUnitType",
  };

  /**
   * How long a click can keep hitting a queue the game has already filled.
   *
   * The sidebar clamps a click against the player's **local** model
   * (`Math.min(shiftKey ? 5 : 1, maxSize - currentSize, …)`), and lockstep only
   * advances that model when the action comes back round to execute. So a burst
   * of clicks all see the same stale free space and all get sent, and the engine
   * drops the surplus when it processes them.
   *
   * Measured over four ladder replays, on the one case the file settles by
   * itself — a building re-ordered while the previous one was still in a queue
   * that holds exactly 1: thirteen such re-orders, **every one within 16 ticks
   * (0.27 s)**, and the next observation 128 s away. The far group is a queue
   * that had been flushed with its factory, which no replay records. Half a
   * second sits in the gap between the two, and on the far side of it the model
   * — not the player — is what has gone stale.
   */
  const STALE_SECONDS = 0.5;

  /**
   * The production queue, replayed alongside the orders.
   *
   * A replay states what a player *asked* for. The engine takes
   * `min(asked, maxSize - size, maxItemQuantity - sameType, buildLimit room)`
   * and drops the rest (`UpdateQueueAction.process`), so a report that sums the
   * asks states matches that cannot exist — 45 IFVs inside ten seconds against a
   * queue that holds thirty. This runs every order through a model of the queue
   * and answers with what the game could take.
   *
   * It is deliberately the **fastest possible** queue: production here never runs
   * out of credits, never loses power, never loses a factory. Its occupancy is
   * therefore a floor under the real one, and the error only ever runs in the
   * direction that credits the player — every overclick it reports is certain,
   * every accepted order is an upper bound. What it cannot see at all is
   * `ensurePrerequisites`, which empties a whole queue when its factory dies;
   * `STALE_SECONDS` is what keeps that from poisoning everything after it.
   *
   * That floor points one way, and only `add` may read it. A queue already full
   * in the fastest possible model is certainly full in the real one, so a refused
   * add is a fact. A **cancel** the model cannot cover is the same floor read
   * backwards and states nothing at all: the real queue held at least as much as
   * this one and may well have absorbed the whole cancel. So `cancel` reports no
   * shortfall — for a while it did, and 79 of the 82 "overclicks" on a four
   * minute match were players emptying their queues.
   *
   * Returns `null` when the generated rules are not loaded, and the caller then
   * says so rather than presenting unclamped orders as if they had been checked.
   */
  function productionModel(ticksPerSecond) {
    const rules = generalRules();
    if (!rules || !rules.maximumQueuedObjects || !rules.buildSpeed) return null;

    const cap = rules.maximumQueuedObjects + 1;
    // `ProductionTrait`'s constructor, in credits per tick: the build clock is
    // the cost divided by this, floored to a multiple of 54 ticks and never
    // shorter than that.
    const baseBuildSpeed = 1000 / (60 * rules.buildSpeed * BASE_TICKS_PER_SECOND);

    const state = new Map();
    const of = (playerId) => {
      let player = state.get(playerId);
      if (!player) {
        player = {
          // Structures and Armory hold one item and drain when the building is
          // *placed*, which the file records — so those two are exact.
          queues: {},
          factories: {},
          docks: 0,
          ordered: {},
        };
        for (const name of QueueType) {
          player.queues[name] = { items: [], size: 0, doneAt: Infinity, touchedAt: -Infinity };
        }
        state.set(playerId, player);
      }
      return player;
    };

    const placed = (name) => name === "Structures" || name === "Armory";

    /** `tickQueue`'s build clock, in seconds, for the head of a queue. */
    const buildSeconds = (player, name, object) => {
      const factories = Math.max(1, player.factories[QUEUE_FACTORY[name]] || 0);
      const speed = baseBuildSpeed / Math.pow(rules.multipleFactory, factories - 1);
      const ticks = Math.max(54, Math.floor(object.cost / speed / 54) * 54);
      return ticks / ticksPerSecond;
    };

    /**
     * How much of this queue a player can be holding.
     *
     * The aircraft queue is the one whose size is not a rules constant: it is
     * `docks - ownedPadAircraft` (`updateAircraftQueueMaxSize`), and only the
     * docks half is visible here — an aircraft already sitting on a pad is not
     * in the file. Nor is a helipad a player started the match with, which is
     * how the ladder's `(PreCaptured)` maps hand out a base. So a player who
     * orders aircraft with no helipad on record is taken at their word rather
     * than told they cannot: no evidence is not evidence of no capacity.
     */
    const capacity = (player, name) => {
      if (placed(name)) return 1;
      if (name === "Aircraft") return player.docks || cap;
      return cap;
    };

    /** Run the head of a queue forward to `at`, popping whatever finished. */
    const drain = (player, name, at) => {
      const queue = player.queues[name];
      if (placed(name)) return;
      while (queue.size && queue.doneAt <= at) {
        const head = queue.items[0];
        head.quantity--;
        queue.size--;
        if (!head.quantity) queue.items.shift();
        queue.doneAt = queue.size ? queue.doneAt + buildSeconds(player, name, queue.items[0].object) : Infinity;
      }
    };

    const held = (queue, object) =>
      queue.items.reduce((sum, item) => sum + (item.object.name === object.name ? item.quantity : 0), 0);

    return {
      /** A building appearing on the map: the completion its queue was waiting for. */
      place(playerId, object, at) {
        const player = of(playerId);
        player.factories[object.factory] = (player.factories[object.factory] || 0) + 1;
        player.docks += object.docks || 0;
        for (const name of ["Structures", "Armory"]) {
          const queue = player.queues[name];
          const index = queue.items.findIndex((item) => item.object.name === object.name);
          if (index < 0) continue;
          const [item] = queue.items.splice(index, 1);
          queue.size -= item.quantity;
          queue.touchedAt = at;
          return item.row || null;
        }
        return null;
      },

      /**
       * One `Add`/`AddNext`, clamped the way the engine clamps it.
       *
       * @returns {{accepted: number, overclick: number}}
       */
      add(playerId, name, object, quantity, at, row) {
        const player = of(playerId);
        const queue = player.queues[name];
        if (!queue) return { accepted: quantity, overclick: 0 };
        drain(player, name, at);

        // The far side of the staleness window: the client would not have sent
        // this at all if its own model had shown the queue full, and by now that
        // model has caught up with the engine. So a full queue here is this one
        // being wrong — the game flushed it out of sight — and it resyncs rather
        // than inventing an overclick.
        if (at - queue.touchedAt > STALE_SECONDS) {
          queue.items.length = 0;
          queue.size = 0;
          queue.doneAt = Infinity;
        }

        const limit = object.limit ? Math.abs(object.limit) - held(queue, object) : Infinity;
        const room = Math.max(0, Math.min(capacity(player, name) - queue.size, cap - held(queue, object), limit));
        const accepted = Math.min(quantity, room);
        queue.touchedAt = at;
        if (accepted) {
          const last = queue.items[queue.items.length - 1];
          if (last && last.object.name === object.name) last.quantity += accepted;
          else queue.items.push({ object, quantity: accepted, row });
          if (!queue.size && !placed(name)) queue.doneAt = at + buildSeconds(player, name, object);
          queue.size += accepted;
        }
        return { accepted, overclick: quantity - accepted };
      },

      /**
       * One `Cancel`: take out what is actually in there and answer nothing.
       *
       * Whatever the model cannot find to remove is the gap between its floor and
       * the real queue, not a click anybody lost — see the asymmetry above.
       */
      cancel(playerId, name, object, quantity, at) {
        const player = of(playerId);
        const queue = player.queues[name];
        if (!queue) return;
        drain(player, name, at);
        const removed = Math.min(quantity, held(queue, object));
        let left = removed;
        for (let i = queue.items.length - 1; i >= 0 && left; i--) {
          const item = queue.items[i];
          if (item.object.name !== object.name) continue;
          const take = Math.min(item.quantity, left);
          item.quantity -= take;
          left -= take;
          if (!item.quantity) queue.items.splice(i, 1);
        }
        queue.size -= removed;
        queue.touchedAt = at;
        if (!queue.size) queue.doneAt = Infinity;
        else if (queue.doneAt === Infinity && !placed(name)) queue.doneAt = at + buildSeconds(player, name, queue.items[0].object);
      },
    };
  }

  /**
   * The report: per player, what they built and how they played.
   *
   * `order` is the timeline a reader wants — placements and production in one
   * list, in time order, with a run of identical orders folded into one row.
   * `structures` and `production` are the same events unfolded, for anything
   * that wants to count rather than read: the folded rows are **copies**, so
   * adding a run together cannot rewrite the events it was added from.
   *
   * Every production row carries three numbers, not one: `ordered` is what the
   * player asked for, `quantity` is what the game could take (see
   * `productionModel`), and `overclick` is the difference — clicks that hit a
   * full queue and were dropped. Counting and drawing use `quantity`, because
   * that is the part of the ask that became a match.
   *
   * A cancelled row is the case with only one number in it: the model cannot say
   * how much of a cancel the engine took, so `quantity` is the ask like `ordered`
   * and `overclick` is never anything. Cancelling more than a queue holds is not
   * a click the game threw away — it is a player emptying a queue with one
   * gesture, and it is the queue model, not the player, that is short.
   */
  function analyze(replay) {
    const seconds = (tick) => tick / replay.ticksPerSecond;
    const model = productionModel(replay.ticksPerSecond);
    // Which timeline row an event ended up in — a run of orders folds into one,
    // and what the model later learns about the event (that its building was
    // placed) has to reach the row a reader sees. Kept beside the rows rather
    // than as a link on them: a report is written to a file, and two objects
    // pointing at each other do not survive `JSON.stringify`.
    const shownAs = new Map();
    const players = replay.players.map((player) => ({
      ...player,
      actions: {},
      real: 0,
      apm: 0,
      // When each real action was taken, in seconds. A rate over the whole match
      // is one number; a rate over a moving window is the shape of the match,
      // and only the timestamps can draw it.
      actionTimes: [],
      structures: [],
      production: [],
      order: [],
      resigned: 0,
      dropped: 0,
      // When this player's MCV was deployed, which is when their base arrived.
      // Nought where the file has no deploy order before the first placement —
      // a replay of a match somebody left on the loading screen, or one where
      // the base was already standing.
      deployedAt: 0,
      // And what stood up: the side's own Construction Yard, named so a report
      // can draw the row without knowing the rules. Null until a deploy is seen.
      deployed: null,
      tally: {},
    }));
    // A replay of a match one player left before it started can name a player id
    // the header does not — keep the row rather than dropping its actions.
    const of = (id) => players[id] || (players[id] = { id, name: `player ${id}`, actions: {}, real: 0, actionTimes: [], structures: [], production: [], order: [], tally: {} });

    for (const event of replay.events) {
      const player = of(event.playerId);
      player.actions[event.name] = (player.actions[event.name] || 0) + 1;
      if (event.type === ActionType.NoAction) continue;
      player.real++;
      player.actionTimes.push(seconds(event.tick));
      // In seconds, like every other time in a report — a tick is the file's
      // unit and nothing outside this file should have to know the rate.
      if (event.type === ActionType.ResignGame) player.resigned = seconds(event.tick);
      if (event.type === ActionType.DropPlayer) player.dropped = seconds(event.tick);

      // **The base standing up, from the file alone.**
      //
      // An order names no unit — only the player's last selection does, and a
      // selection is runtime object ids the file never maps to a type. So a
      // deploy order in the middle of a match could be an MCV relocating or a GI
      // dropping sandbags, and the file cannot tell them apart. That was taken
      // as the end of it until 0.46.3, and it is not: **a player cannot place a
      // single building until their Construction Yard exists, and the first
      // Construction Yard comes from the MCV deploying.** So every deploy order
      // a player issues *before their first placement* is that MCV, by
      // construction rather than by likelihood — no infantry has been built, no
      // second vehicle bought, nothing else they own can deploy.
      //
      // The first of them is the answer; a second is the same intent pressed
      // twice, which the fixture has (0a00 at tick 104 and again at 120). Later
      // deploys — a relocation, a second MCV — are not knowable here and stay
      // with the re-run, which sees the outcome rather than the intent.
      if (
        event.type === ActionType.OrderUnits &&
        DEPLOY_ORDERS.has(event.order) &&
        !player.structures.length &&
        !player.deployedAt
      ) {
        player.deployedAt = seconds(event.tick);
        // What stood up, which the order does not say either. The side does:
        // there is one Construction Yard per side and a country belongs to one,
        // both out of the file's own header. A side the header did not name
        // leaves the row unlabelled rather than guessing at a faction.
        const yard = player.side === "Allied" ? "GACNST" : player.side === "Soviet" ? "NACNST" : "";
        if (yard) player.deployed = { name: yard, label: labelFor(yard) };
      }

      if (event.type === ActionType.PlaceBuilding) {
        const at = seconds(event.tick);
        // One placement sent twice is one building, and the file cannot tell us
        // which of the two the game took — it took the first, because the second
        // had nowhere to go. Folded as an over-click rather than dropped: it is
        // the same fact the queue rows already carry, a press the game did not
        // act on, and it belongs to the row it was a repeat of. Folded before
        // the model is asked, so a resend does not consume a queue order that
        // the first placement already completed.
        const previous = player.structures[player.structures.length - 1];
        if (
          previous &&
          previous.object &&
          event.object &&
          previous.object.name === event.object.name &&
          previous.tile &&
          event.tile &&
          previous.tile.x === event.tile.x &&
          previous.tile.y === event.tile.y &&
          at - previous.at <= RESEND_SECONDS
        ) {
          previous.overclick += 1;
          continue;
        }
        const row = { at, kind: "built", object: event.object, tile: event.tile, quantity: 1, ordered: 1, overclick: 0 };
        // The order this placement completes, so a structure can be read as the
        // decision it was: clicked at 0:39, standing at 0:47. The queue holds
        // exactly one building, so the pairing is the model's, not a guess.
        const order = model && model.place(event.playerId, event.object, at);
        if (order) {
          order.placedAt = at;
          row.orderedAt = order.at;
        }
        player.structures.push(row);
        player.order.push(row);
        player.tally[event.object.label] = (player.tally[event.object.label] || 0) + 1;
        continue;
      }
      if (event.type !== ActionType.UpdateQueue || !event.object) continue;

      const at = seconds(event.tick);
      const cancel = event.update === "Cancel";
      const asked = event.quantity || 1;
      const row = {
        at,
        kind: cancel ? "cancelled" : "queued",
        queue: event.queue,
        object: event.object,
        ordered: asked,
        quantity: asked,
        overclick: 0,
      };
      if (model) {
        // A cancel goes through the model for its effect on the queue and keeps
        // the ask as its count: what the model manages to take out is its own
        // floor, and drawing that would read as the size of the cancel. Twenty
        // IFVs cancelled is twenty, whatever this queue has in its books — and a
        // row the model emptied nothing for used to vanish off the timeline
        // altogether, since a row of nought is not drawn.
        if (cancel) model.cancel(event.playerId, event.queue, event.object, asked, at);
        else {
          const taken = model.add(event.playerId, event.queue, event.object, asked, at, row);
          row.quantity = taken.accepted;
          row.overclick = taken.overclick;
        }
      }
      player.production.push(row);

      // A building is ordered *and* placed, and both are rows: deciding to build
      // a war factory at 0:39 and having one at 0:47 are two facts, and the eight
      // seconds between them are the third. They used to be one row with the
      // other time hidden in a tooltip, which is not a timeline.
      const last = player.order[player.order.length - 1];
      if (
        last &&
        last.kind === row.kind &&
        last.object &&
        last.object.name === row.object.name &&
        row.at - last.at <= GROUP_SECONDS
      ) {
        last.quantity += row.quantity;
        last.ordered += row.ordered;
        last.overclick += row.overclick;
        last.until = row.at;
        shownAs.set(row, last);
      } else {
        // A copy: `production` is what happened, `order` is what it reads as, and
        // folding the second must not rewrite the first.
        const copy = { ...row };
        player.order.push(copy);
        shownAs.set(row, copy);
      }
      // Counted from what the game accepted, so a tally is a number of units and
      // not a number of clicks. Cancels are not subtracted: they are already out
      // of `quantity` at the moment they happened, and subtracting them again
      // would take out units that had been built long before. A building is
      // counted where it is a fact — at its placement, above — and an order for
      // one would count it twice.
      if (row.kind === "queued" && row.object.kind !== "building") {
        player.tally[row.object.label] = (player.tally[row.object.label] || 0) + row.quantity;
      }
    }

    // A match that ended in seconds — somebody quit at the loading screen — makes
    // a rate out of a handful of actions over a fraction of a minute, and prints
    // "55 APM" for a player who did nothing. Below half a minute there is no rate
    // to report, and `null` says that where a 0 would read as a measurement.
    const minutes = replay.duration / 60;
    for (const player of players) {
      player.apm = minutes >= 0.5 ? Math.round(player.real / minutes) : null;
      player.overclicks = player.production.reduce((sum, row) => sum + row.overclick, 0);

      // Which building orders got their building. The pairing is the model's —
      // the queue holds one — and it is carried back onto the row a reader sees,
      // so an order that never became a building says so instead of looking like
      // one that did. That covers a cancelled war factory, one flushed when its
      // conyard died, and a click at a queue that was already building.
      for (const row of player.production) {
        if (row.kind !== "queued" || row.object.kind !== "building" || row.placedAt === undefined) continue;
        const shown = shownAs.get(row);
        if (shown) shown.placedAt = Math.min(shown.placedAt === undefined ? Infinity : shown.placedAt, row.placedAt);
      }
      for (const row of player.order) {
        if (row.kind === "queued" && row.object.kind === "building" && row.placedAt === undefined) row.unplaced = true;
      }
    }

    return {
      gameId: replay.gameId,
      startedAt: replay.startedAt,
      map: replay.opts.mapTitle || replay.opts.mapName,
      mapFile: replay.opts.mapName,
      duration: replay.duration,
      opts: replay.opts,
      players,
      // Kept so a harvest taken later can be put on the same clock: its rows are
      // in ticks and every time in a report is in seconds.
      ticksPerSecond: replay.ticksPerSecond,
      chat: replay.chat.map((line) => ({ ...line, at: seconds(line.tick) })),
      // Whether the orders were run through the queue model at all. False means
      // the generated rules were not loaded, and every count is a raw ask —
      // which a report has to be able to say rather than imply it was checked.
      capped: !!model,
      // Named so a report can say what it is not: nothing here is what a queue
      // finished, only what the game accepted into one. Buildings are exempt —
      // a placement is the completion.
      derivedFrom: "actions",
    };
  }

  // engine/type/ObjectType again, as the words a reader uses for them. A harvest
  // states a loss's kind as a number because that is what the client keeps.
  const KIND_NAMES = { 1: "aircraft", 2: "buildings", 3: "infantry", 7: "vehicles" };

  /**
   * An internal name to a display name — `NALASR` to `Sentry Gun`.
   *
   * The build order resolves an *ordinal* into the rules lists; a destroy event
   * names its object outright, so this is the same table read the other way
   * round. Built once, lazily: a report that never merges a harvest never pays
   * for it.
   */
  let labels = null;
  function labelFor(name) {
    const table = types();
    if (!table) return name;
    if (!labels) {
      labels = new Map();
      for (const rows of Object.values(table)) {
        for (const row of rows) if (row[1] && !labels.has(row[0])) labels.set(row[0], row[1]);
      }
    }
    return labels.get(name) || name;
  }

  /**
   * Harvested events collapsed into rows a timeline can carry — losses on one
   * side of the ledger, what came out of the queues on the other.
   *
   * Forty-four deaths one to a line would bury a build order of twenty-eight
   * rows in its own casualties, and twenty conscripts dying to the same attack
   * is one event to a reader. So the same rule the build order uses applies:
   * consecutive events of the same thing, by the same side, inside `window` of
   * each other are one row with a count.
   *
   * Two knobs, because the two tracks are asking different questions of the
   * same shape of data:
   *
   * - `window` — how close is "one event". A loss keeps `GROUP_SECONDS`; a
   *   delivery gets `DELIVERY_SECONDS`, for the reasons written there.
   * - `chain` — whether the window is measured from the group's last event or
   *   its first. A squad cut down over half a minute is one event and should
   *   not split arbitrarily, so a loss chains. A delivery must not: chaining is
   *   what let a factory's whole run fold into a row printed at the second the
   *   first one appeared, and a row measured from its start can never claim a
   *   span wider than its window.
   *
   * Buildings are not separated out. A base coming apart is a run of rows in
   * this list and reads as one, which is the thing worth seeing.
   */
  function groupRows(losses, { window = GROUP_SECONDS, chain = true } = {}) {
    const rows = [];
    const open = new Map();
    for (const loss of [...losses].sort((a, b) => a.at - b.at)) {
      const key = loss.owner + "|" + loss.name;
      const last = open.get(key);
      if (last && loss.at - (chain ? last.until : last.at) <= window) {
        last.count++;
        last.until = loss.at;
        if (loss.by && !last.by.includes(loss.by)) last.by.push(loss.by);
        continue;
      }
      const row = {
        at: loss.at,
        until: loss.at,
        owner: loss.owner,
        name: loss.name,
        label: labelFor(loss.name),
        // Both forms travel: the word for reading, and the ObjectType number a
        // caller tests against. Carrying only the word left every building loss
        // indistinguishable from a conscript's on the timeline.
        kind: loss.kind,
        type: loss.type,
        count: 1,
        by: loss.by ? [loss.by] : [],
      };
      open.set(key, row);
      rows.push(row);
    }
    return rows;
  }

  /**
   * Fold a simulated run into a report.
   *
   * The two halves are different kinds of claim and stay distinguishable in the
   * result: everything already on a player came out of the **file** and is what
   * they *did*; everything under `player.sim` came out of a **re-run of the
   * match** and is what happened to them. A report can therefore say which of
   * its numbers would survive the harvest being thrown away.
   *
   * `sim` is what src/replay-sim.js returns. A harvest of a different match is
   * refused rather than merged — a mismatched one is worse than none, because
   * nothing downstream would show that the losses belong to another game.
   *
   * @returns {object} the report, with `sim` on it and on each player it names
   */
  /**
   * The first sampled moment at which a player was out, or 0 for one who was
   * not — read off the samples, since the counters only say whether they are out
   * *now*.
   */
  function defeatedAt(sim, name, at) {
    for (const row of sim.samples || []) {
      const me = (row.players || []).find((player) => player.name === name);
      if (me && me.defeated) return at(row.tick);
    }
    return 0;
  }

  /**
   * The client's spelling of a queue, in the one the rest of this file uses.
   *
   * `game/player/production/ProductionQueue` names its enum member `Aircrafts`,
   * and the replay file's own type list — the one `QueueType` above is read out
   * of — says `Aircraft`. Two names for one queue, arriving from two places into
   * one report, and neither is wrong. Normalised here, at the boundary the
   * client's words enter through, so nothing downstream has to know there were
   * ever two: the order the queues are listed in, the table that says which
   * factory each reads, and the label a reader sees would each otherwise need
   * both spellings.
   *
   * Only a spelling this repo has seen is renamed. A client that adds a queue
   * keeps whatever it calls it.
   */
  const QUEUE_ALIAS = { Aircrafts: "Aircraft" };

  /**
   * A tempo reading with the queue names normalised, the factory each queue
   * reads filled in, and the coefficient worked out.
   *
   * **The coefficient.** The engine's build clock is
   * `baseBuildSpeed × buildSpeedModifier × multipleFactory^-(factories-1)`
   * ([[cd-power-and-production]]), and the last two factors are the only ones
   * that belong to the base rather than to the item in the queue. That product
   * is what a player means by "how fast am I building": 1.00 with one factory
   * and full power, 1.25 with a second war factory, 1.56 with a third, and less
   * than 1 while the base is short of power.
   *
   * **Zero factories is not a speed, and is reported as one.** The engine's own
   * expression gives 0.8 there — `pow(0.8, -1)` — for a queue that cannot be
   * active at all, and drawing that would put a line at four fifths of full
   * speed through every minute before the player built the factory. `null` is a
   * gap in the line instead.
   *
   * **The factory is filled in when the harvest did not record it.** A run only
   * started recording which factory each queue reads on 2026-08-31, and every
   * harvest stored before that has the counts without it — so a report drawn
   * from one had no way to know that the Defence tab and the Structures tab come
   * off the same construction yards, and drew the same line twice. `QUEUE_FACTORY`
   * is this file's own copy of the mapping and answers for those. The harvest's
   * own answer wins wherever it has one, because it came from the client that
   * actually played the match.
   *
   * Returns the reading unchanged, and with no `rate`, when the rules table is
   * not loaded: a profile that has never harvested one cannot state a
   * coefficient, and the report then draws no chart rather than a made-up one.
   */
  function tempoOf(tempo, multipleFactory) {
    if (!tempo || !tempo.factories) return tempo || null;
    const speed = typeof tempo.speed === "number" ? tempo.speed : 1;
    const factories = {};
    const factoryOf = {};
    const rate = {};
    for (const [said, count] of Object.entries(tempo.factories)) {
      const queue = QUEUE_ALIAS[said] || said;
      factories[queue] = count;
      const recorded = tempo.factoryOf && tempo.factoryOf[said];
      const known = recorded === undefined ? QUEUE_FACTORY[queue] : recorded;
      if (known !== undefined) factoryOf[queue] = String(known);
      if (multipleFactory > 0) rate[queue] = count > 0 ? speed / Math.pow(multipleFactory, count - 1) : null;
    }
    const said = { ...tempo, factories, factoryOf };
    if (multipleFactory > 0) said.rate = rate;
    else delete said.rate;
    return said;
  }

  function mergeSim(report, sim) {
    // How much a second factory is worth, out of the client's own rules. A
    // profile with no harvested table cannot state a coefficient at all, and
    // `tempoOf` then states no coefficient rather than assuming the retail 0.8.
    const general = generalRules();
    const multipleFactory = (general && general.multipleFactory) || 0;
    if (!sim || (sim.gameId && report.gameId && sim.gameId !== report.gameId)) return report;
    const rate = report.ticksPerSecond || 60;
    const at = (tick) => tick / rate;
    const last = (sim.samples && sim.samples[sim.samples.length - 1]) || { players: sim.players || [] };
    const rows = new Map((last.players || []).map((row) => [row.name, row]));

    for (const player of report.players) {
      const row = rows.get(player.name);
      if (!row) continue;
      const lost = (sim.destroyed || []).filter((event) => event.owner === player.name);
      const byName = {};
      for (const event of lost) byName[event.name] = (byName[event.name] || 0) + 1;
      // The answer to the question the file cannot be asked: what came out of
      // the queues. Buildings are in here too — a placement is a spawn — and
      // they are the row to check the rest against, since the file already knows
      // those and the two counts have to agree.
      const made = (sim.produced || []).filter((event) => event.owner === player.name);
      const madeByName = {};
      for (const event of made) madeByName[event.name] = (madeByName[event.name] || 0) + 1;
      const byKind = {};
      for (const [kind, n] of Object.entries(row.lostByKind || {})) byKind[KIND_NAMES[kind] || `kind ${kind}`] = n;
      player.sim = {
        credits: row.credits,
        gained: row.gained,
        built: row.built,
        lost: row.lost,
        killed: row.killed,
        defeated: !!row.defeated,
        // **When** they were defeated, which is the only witness some matches
        // have. A resignation and a drop are both in the file; a match won by
        // capturing the last building is neither, and used to leave the report
        // with a verdict and no moment to put beside it — an empty clock column
        // down the middle of the header.
        //
        // The samples are the source, so it is as exact as their spacing: the
        // first one that saw this player out. Measured across the eight stored
        // harvests, that is 20 to 250 ticks after the previous sample — a
        // second or four, against a moment the file does not hold at all.
        defeatedAt: defeatedAt(sim, player.name, at),
        byKind,
        // Per unit type, which the counters cannot give — they are keyed by
        // ObjectType. This comes from the destroy events, one per loss.
        byName,
        // The same thing said in the words the game uses, biggest first, for
        // anything that has to show it to a person.
        lostList: Object.entries(byName)
          .map(([name, count]) => ({ name, label: labelFor(name), count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        lostAt: lost.map((event) => at(event.tick)),
        // What was produced, the same three ways: by name, as a list to show, and
        // as the moments themselves so a report can put delivery on the same
        // clock as the order that asked for it.
        madeByName,
        madeList: Object.entries(madeByName)
          .map(([name, count]) => ({ name, label: labelFor(name), count }))
          .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label)),
        made: made.map((event) => ({ at: at(event.tick), name: event.name, label: labelFor(event.name), type: event.kind })),
      };
    }

    report.sim = {
      at: sim.at,
      complete: !!sim.complete,
      // How far it got, so a partial harvest can say what it covers rather than
      // only that it is not whole — a run saved at 97% of a match is a report,
      // and "stopped early" undersells it.
      tick: sim.tick || 0,
      endTick: sim.endTick || 0,
      // Saved while the run was still playing, rather than after it ended.
      checkpoint: !!sim.checkpoint,
      error: sim.error || "",
      seconds: Math.round((sim.wallMillis || 0) / 100) / 10,
      ticksPerSecond: sim.ticksPerSecond || 0,
      // Every reading, on the report's own clock, for whatever wants to draw it.
      samples: (sim.samples || []).map((row) => ({
        at: at(row.tick),
        players: Object.fromEntries(
          (row.players || []).map((player) => [
            player.name,
            // The one thing done to a reading on the way through: the queue
            // names normalised, the factory each reads filled in where the run
            // did not record it, and the counts turned into the coefficient
            // they mean. All three need something this file has and the
            // renderer deliberately does not — the rules table, and the
            // mapping from a queue to its factory.
            player.tempo ? { ...player, tempo: tempoOf(player.tempo, multipleFactory) } : player,
          ])
        ),
      })),
      losses: (sim.destroyed || []).map((event) => ({
        at: at(event.tick),
        name: event.name,
        // The word for it, the way `made` above already carries one: a reader
        // splitting these by the moment they happened needs both halves of the
        // event, and the grouped rows below cannot be asked — a group can
        // straddle the second a side leaves the match.
        label: labelFor(event.name),
        // The number as the client keeps it, and the word for it. The timeline
        // wants the first (a building reads differently from a conscript), the
        // sentence under a name wants the second.
        type: event.kind,
        kind: KIND_NAMES[event.kind] || "",
        owner: event.owner,
        by: event.by,
        incidental: !!event.incidental,
      })),
    };
    /**
     * Every miner type any sample saw, as the word for it.
     *
     * The samples carry internal names because that is what the walk read off
     * the objects, and the name table lives here — so the chart is handed the
     * translation once rather than being given a table it would have to know how
     * to use. Empty when a harvest predates the walk, which is how the report
     * knows not to draw an economy it has no numbers for.
     */
    report.sim.harvesterLabels = {};
    for (const row of report.sim.samples) {
      for (const player of Object.values(row.players)) {
        for (const name of Object.keys(player.harvesters || {})) {
          if (!(name in report.sim.harvesterLabels)) report.sim.harvesterLabels[name] = labelFor(name);
        }
      }
    }
    // Grouped once here rather than per render: it is the same answer every time
    // and the timeline is redrawn on every window resize.
    report.sim.lossRows = groupRows(report.sim.losses);
    /**
     * The spawns split in two: what came out of a queue, and what stood up.
     *
     * A building's spawn is normally its placement — `tryPlaceBuilding` refuses
     * unless the queue is already `Ready`, so the object is created by the
     * placement the file already records — and a second row saying the same
     * thing at the same second is noise. What a building gains instead is the
     * moment it became ready, which is the one part of its life neither the file
     * nor the placement states.
     *
     * That is true of every building a player *puts down*, and false for exactly
     * one case: a Construction Yard from a deploying MCV is created by
     * `DeployOrder`, so no `PlaceBuilding` action stands behind it. Dropping
     * every building spawn therefore took the base's own arrival off the
     * timeline along with the redundant rows it was aimed at — and a base
     * standing up, whether it is the first one, a relocation or a second MCV, is
     * one of the few moves that changes everything about a match's geography.
     *
     * So the test is the pairing, not the type: a building spawn that a
     * placement accounts for is that placement and draws nothing extra; one that
     * no placement accounts for is a deploy. Reading the file's *deploy orders*
     * instead would answer a different question badly — an order is not an
     * outcome (a blocked deploy is a `DeployNotAllowedEvent`), and `Deploy` is
     * also what a GI does dozens of times a match, with nothing in the file
     * saying which selected unit the order was for.
     *
     * One placement absorbs one spawn, nearest first, so a player who put down
     * two of the same building does not have one of them account for both.
     */
    const placements = new Map();
    // Whether the placements can be paired at all. The key is the object's
    // internal name, and the simulation always has the client's — but a profile
    // with no harvested table yet reads the file's ordinals as `building #12`,
    // which matches nothing. Every placement would then look like a spawn no
    // placement accounts for, which is the definition of a deploy above: one
    // false base-standing-up row per building put down, all match long.
    //
    // So the pairing is not attempted rather than attempted and lost. That
    // costs a real MCV deploy its row until the first harvest, and refuses to
    // invent eight, which is the right way round: a missing row is a gap, an
    // invented one is a lie about the match's geography.
    let pairable = true;
    for (const player of report.players || []) {
      for (const row of player.structures || []) {
        if (row.object && row.object.unnamed) pairable = false;
        const key = player.name + "|" + ((row.object && row.object.name) || "");
        if (!placements.has(key)) placements.set(key, []);
        placements.get(key).push({ at: row.at, used: false });
      }
    }
    const delivered = [];
    const deployed = [];
    for (const event of sim.produced || []) {
      const row = {
        at: at(event.tick),
        name: event.name,
        type: event.kind,
        kind: KIND_NAMES[event.kind] || "",
        owner: event.owner,
        by: "",
      };
      if (row.type !== 2) {
        delivered.push(row);
        continue;
      }
      const times = placements.get(row.owner + "|" + row.name) || [];
      let nearest = null;
      for (const time of times) {
        const gap = Math.abs(time.at - row.at);
        if (time.used || gap > PLACEMENT_SECONDS) continue;
        if (!nearest || gap < Math.abs(nearest.at - row.at)) nearest = time;
      }
      if (nearest) nearest.used = true;
      else if (pairable) deployed.push(row);
    }
    report.sim.madeRows = groupRows(delivered, { window: DELIVERY_SECONDS, chain: false });
    // Grouped only within the one second, which for a handful of events a match
    // means not at all — but it is what gives these rows the same shape as the
    // two tracks around them, `label` and `count` included, so the timeline
    // draws them without a case of its own. Two MCVs deploying a second apart
    // are two bases arriving, and folding them would be the whole point missed.
    report.sim.deployRows = groupRows(deployed, { window: 0, chain: false });
    report.sim.readyRows = groupRows(
      (sim.ready || []).map((event) => ({
        at: at(event.tick),
        name: event.name,
        type: 2,
        kind: KIND_NAMES[2],
        owner: event.owner,
        by: "",
      })),
      // Same reason as the deliveries above, and one more: a readiness row is
      // read against the placement below it, so it has to name the second it
      // actually happened in or the gap it exists to show is invented.
      { window: DELIVERY_SECONDS, chain: false }
    );
    // A building that changed sides. One row per capture and deliberately not
    // grouped: a loss row stands for twenty conscripts dying to one attack
    // because they are one event to a reader, and two buildings taken a second
    // apart are two buildings. A match has a handful of these at most, so
    // nothing is buried by keeping them apart.
    //
    // Neither a loss nor a delivery, and it must stay out of both: no
    // `ObjectDestroy` fires for a captured building and no `ObjectSpawn` for its
    // new owner, so a count that moved here would be a count this file invented.
    report.sim.captureRows = (sim.captures || []).map((event) => ({
      at: at(event.tick),
      name: event.name,
      label: labelFor(event.name),
      type: event.kind,
      owner: event.owner,
      // Who it came off, when that was anybody — a neutral oil derrick belongs
      // to the map's civilians, and the row for it has one side only.
      from: event.from || "",
    }));
    /**
     * A spy who got in, from both ends.
     *
     * One row per infiltration and not grouped, for the capture's reason: a
     * match has a handful at most and each one is its own move. Neither a loss
     * nor a delivery, and it must stay out of both — no object was destroyed and
     * none came out of a queue, so a count that moved here would be a count this
     * file invented.
     *
     * The consequence is deliberately not stated. What a spy does depends on the
     * building it walked into — credits out of a refinery, veterancy off a
     * barracks, a power blackout, a stolen tech, the enemy's whole map — and the
     * harvest sees none of those as an event. The blackout is the one that
     * surfaces anyway, as an outage on a base with power to spare, and it does
     * so on its own clock beside this row. Guessing at the rest from a building
     * name would be a report inventing the interesting half.
     */
    report.sim.spyRows = (sim.infiltrations || []).map((event) => ({
      at: at(event.tick),
      name: event.name,
      label: labelFor(event.name),
      owner: event.owner,
      // The spy's own type — a Spy, a Yuri, whatever walked in — and whose it
      // was. Named rather than assumed to be the other side: a match can have
      // more than two.
      spy: event.spy || "",
      spyLabel: event.spy ? labelFor(event.spy) : "",
      by: event.by || "",
      // What the engine did about it, by its own conditions rather than by the
      // building's name. Empty on a harvest taken before the run recorded any.
      effects: Array.isArray(event.effects) ? event.effects : [],
      /**
       * Roughly what was taken, when money was.
       *
       * The infiltration event is dispatched after the theft, so only the
       * balance left behind can be read. The engine takes
       * `floor(before * share)`, so a bank left holding `left` was holding
       * `left / (1 - share)` before it, give or take the one credit the floor
       * ate. Null when no money moved, and null rather than nought when the
       * harvest predates the reading.
       */
      stole:
        typeof event.left === "number" && event.share > 0 && event.share < 1
          ? Math.round((event.left / (1 - event.share)) * event.share)
          : null,
    }));
    report.derivedFrom = "actions + simulation";
    return report;
  }

  /**
   * A finished report as a file, so the half a client is needed for can travel.
   *
   * The published site can parse a `.rpl` a visitor hands it, and can never
   * re-run one: the simulation needs the game client and a tab to drive it. So
   * a report that has been re-run is written out whole — actions *and* harvest —
   * and read back by anyone, including someone who has never installed the
   * extension. That is the only way the losses, the credits and the kills reach
   * a reader who cannot produce them.
   *
   * The envelope is stamped rather than being a bare report, because a file with
   * no name for itself is one that has to be guessed at: `kind` says what it is,
   * `version` says whether this reader can still read it, and `exportedAt` and
   * `extension` say what produced it, which is the first question about a number
   * nobody can reproduce.
   */
  const REPORT_KIND = "cd-companion-report";
  const REPORT_VERSION = 1;

  function exportReport(report, meta = {}) {
    return {
      kind: REPORT_KIND,
      version: REPORT_VERSION,
      exportedAt: meta.exportedAt || Date.now(),
      extension: meta.extension || "",
      // Where it came from, so a report can be checked against the file it was
      // made of. Not needed to read it — and deliberately not a promise that the
      // link still resolves; the hosts drop old replays.
      source: meta.source || "",
      report,
    };
  }

  /**
   * Read one back, or say why not.
   *
   * Every failure here is a sentence a reader can act on. A wrong file is the
   * expected case — this is a file drop on a public page, and "that is a replay,
   * not a report" is the difference between a visitor trying the other box and a
   * visitor leaving.
   */
  function importReport(input) {
    let envelope;
    try {
      envelope = typeof input === "string" ? JSON.parse(input) : input;
    } catch (e) {
      throw new Error("that file is not JSON — an exported report is a .json file");
    }
    if (!envelope || envelope.kind !== REPORT_KIND) {
      throw new Error("that JSON is not an exported report — it carries no cd-companion-report stamp");
    }
    if (!(envelope.version <= REPORT_VERSION)) {
      throw new Error(`that report was written by a newer version (${envelope.version}) than this page can read`);
    }
    const report = envelope.report;
    if (!report || !Array.isArray(report.players) || typeof report.duration !== "number") {
      throw new Error("that report is missing its players or its length — it did not survive whatever wrote it");
    }
    return { report, exportedAt: envelope.exportedAt || 0, extension: envelope.extension || "", source: envelope.source || "" };
  }

  /** Fetch and parse in one call — the options page's whole use of this file. */
  async function load(input, realm) {
    const found = locate(input, realm);
    if (!found) throw new Error("that is not a replay, a game page or a game id");
    const response = await fetch(found.url);
    if (!response.ok) throw new Error(`the replay host answered ${response.status}`);
    const replay = parse(await response.text());
    return { ...found, replay };
  }

  const api = {
    locate,
    load,
    parse,
    analyze,
    mergeSim,
    exportReport,
    importReport,
    REPORT_KIND,
    REPORT_VERSION,
    ActionType,
    QueueType,
    UpdateType,
    COUNTRIES,
    REPLAY_HOSTS,
    BASE_TICKS_PER_SECOND,
  };
  if (typeof window !== "undefined") window.__cdcReplay = api;
})();
