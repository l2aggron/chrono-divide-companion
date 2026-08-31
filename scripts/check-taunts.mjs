/**
 * The taunt overlay: its tables, and the four files that have to agree about it.
 *
 *   node scripts/check-taunts.mjs
 *
 * The tables are run rather than read — `src/build-chords.js` is a plain script
 * with one global, so it loads into a `window` of two lines and every layout
 * question is answered by the code that will answer it in a match.
 *
 * The wiring is read as text, on the same terms as the rest of this repo's
 * suites: a checker that needed a running client would never be run. What it
 * reads for is the set of joins that fail *silently* — a layout the game tab
 * never receives looks exactly like a layout nobody edited, and a rebind that
 * never reaches the client's own file looks exactly like one the client
 * forgot. Both of those are a key that does nothing, reported by nobody.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");
const read = (name) => readFileSync(join(src, name), "utf8");

const companion = read("companion.js");
const bridge = read("bridge.js");
const optionsJs = read("options.js");
const optionsHtml = read("options.html");
const css = read("companion.css");
const optionsCss = read("options.css");

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- the tables, run ----------------------------------------------------------

const window = {};
new Function("window", read("build-chords.js"))(window);
const T = window.__cdcBuildChords;

check("src/build-chords.js exports the taunt tables", !!T && typeof T.tauntLayout === "function");
if (!T || !T.tauntLayout) {
  for (const line of results) console.log(line);
  process.exit(1);
}

// A layout is always the whole key block, defaults included: the overlay
// indexes it by slot and a short row would be a key that draws nothing.
const shipped = T.tauntLayout({});
check(
  "the shipped layout is the eight taunts on the first eight keys",
  shipped.length === T.GRID_KEYS.length &&
    shipped.slice(0, 8).join(",") === "1,2,3,4,5,6,7,8" &&
    shipped.slice(8).every((slot) => slot === null),
  `${T.GRID_KEYS.length} slots, first eight are ${shipped.slice(0, 8).join(",")}`
);
check(
  "an override replaces exactly its own slot",
  T.tauntLayout({ 0: 5 })[0] === 5 && T.tauntLayout({ 0: 5 })[1] === 2,
  "the rest of the row still follows what ships"
);
check(
  "a key emptied on purpose stays empty",
  T.tauntLayout({ 3: null })[3] === null
);
// Storage is a wire, not a promise. A row written by an older build, a hand
// edit or a half-restored backup must not put a value on a key that the
// overlay would then send to the client as a command name.
check(
  "a stored value that is not a taunt is dropped rather than drawn",
  T.tauntLayout({ 0: 99 })[0] === null &&
    T.tauntLayout({ 1: "Taunt_3" })[1] === null &&
    T.tauntLayout({ 2: 0 })[2] === null,
  "out of range, a command name and zero all read as empty"
);

// The editor stores a diff, so a layout put back where it started stops
// overriding — the same rule the chord grid has, for the same reason: a frozen
// copy of a default cannot be corrected later.
check(
  "moving a taunt onto another key swaps the two",
  JSON.stringify(T.tauntOverride({}, 0, 3)) === JSON.stringify({ 0: 3, 2: 1 }),
  "taunt 3 was on slot 2, and slot 2 takes what slot 0 had"
);
check(
  "putting a taunt back where it ships leaves no override",
  Object.keys(T.tauntOverride(T.tauntOverride({}, 0, 3), 0, 1)).length === 0
);

// `TauntPlayback#getTauntFileName`: "tau" + the country's two letters + a
// two-digit number. Reproduced here rather than called, so the reproduction is
// what is checked.
check(
  "a taunt names the client's own sound file",
  T.tauntFileName("Russians", 3) === "tauru03.wav" &&
    T.tauntFileName("Americans", 10) === "" &&
    T.tauntFileName("Yuri", 1) === "",
  "an unknown country and an out-of-range number both answer nothing"
);
check(
  "every country the client has a prefix for is two letters",
  Object.values(T.TAUNT_COUNTRIES).every((prefix) => /^[a-z]{2}$/.test(prefix)) &&
    Object.keys(T.TAUNT_COUNTRIES).length === 9,
  `${Object.keys(T.TAUNT_COUNTRIES).length} countries`
);
// --- what the taunts say ------------------------------------------------------
//
// The words are the one part of this feature the client cannot be asked about:
// a taunt is a sound file and nothing else, with no string table behind it. So
// the table is a transcript, and what can be checked is its shape and its
// anchor — that it covers every country the client has taunts for, and that it
// is not off by one or reversed.

check(
  "every country with taunt sounds has eight lines",
  Object.keys(T.TAUNT_COUNTRIES).every(
    (country) =>
      Array.isArray(T.TAUNT_LINES[country]) &&
      T.TAUNT_LINES[country].length === 8 &&
      T.TAUNT_LINES[country].every((line) => typeof line === "string" && line.length > 2)
  ),
  `${Object.keys(T.TAUNT_LINES).length} countries have lines, ${Object.keys(T.TAUNT_COUNTRIES).length} have sounds`
);
check(
  "a country the table has no lines for answers nothing rather than guessing",
  T.tauntLine("Martians", 1) === "" && T.tauntLine("Russians", 9) === "" && T.tauntLine("", 1) === "",
  "the overlay falls back to the role, which every taunt has"
);
// The anchor. `sendTaunt(n)` plays `tau<cc><nn>.wav` and the shipped `[Hotkey]`
// table binds Taunt_1 to 116 — F5 — so taunt 1 is the F5 line and taunt 8 the
// F12 gloat. Anyone reading the eight off a recording reads them the other way
// round, which is exactly how this table would be reversed; the money line is
// the one slot every country words unmistakably.
check(
  "taunt 1 is the F5 line — out of money — in every country",
  Object.values(T.TAUNT_LINES).every((lines) => /money|cash|resources/i.test(lines[0])),
  "reverse the table and this is the first check to go red"
);
check(
  "taunt 6 is the wordless laugh, named rather than transcribed",
  T.tauntRole(6) === "laughter" &&
    Object.values(T.TAUNT_LINES).every((lines) => lines[5] === "(laughter)"),
  "it differs by voice per country and in nothing a table can hold"
);
check(
  "no country repeats a line",
  Object.entries(T.TAUNT_LINES).every(([, lines]) => new Set(lines).size === 8),
  "a duplicate is how a transcription slips a row"
);
check(
  "every taunt has a role, and only the eight do",
  T.TAUNT_ROLES.length === T.TAUNT_COUNT &&
    T.TAUNT_ROLES.every((role) => typeof role === "string" && role.length > 2) &&
    T.tauntRole(1) === "out of money" &&
    T.tauntRole(8) === "gloating" &&
    T.tauntRole(9) === "",
  "the role is what the options page and a match-less overlay have instead of words"
);

check("a taunt's command is the client's own name for it", T.tauntCommand(8) === "Taunt_8" && T.tauntCommand(9) === "");
check("the cooldown is the handler's five seconds", T.TAUNT_COOLDOWN === 5000);

// The fact the whole feature rests on: the shipped `[Hotkey]` table binds
// Taunt_1..8 to 116..123, which is F5 to F12 — and a browser keeps F11 and F12.
// If this label table ever stopped naming those codes, the overlay would be
// showing a player a key they cannot find.
check(
  "the shipped taunt keys read back as F5 to F12",
  Array.from({ length: 8 }, (_, i) => T.clientKeyLabel(116 + i)).join(",") ===
    "F5,F6,F7,F8,F9,F10,F11,F12"
);
check(
  "a modified code reads back with its modifiers",
  T.clientKeyLabel(512 + 82) === "Ctrl+R" &&
    T.clientKeyLabel(1024 + 83) === "Alt+S" &&
    T.clientKeyLabel(256 + 65) === "Shift+A"
);
check(
  "a numpad arrow reads back as the numpad key that was pressed",
  T.clientKeyLabel(2048 + 37) === "Num4" && T.clientKeyLabel(2048 + 40) === "Num2",
  "the client rewrites numpad 2/4/6/8 into arrow codes before hashing"
);
check(
  "a code with no name is still shown as a key",
  T.clientKeyLabel(200) === "key 200" && T.clientKeyLabel(0) === "",
  "unbound is nothing; unnamed is a number"
);

// --- the overlay --------------------------------------------------------------
//
// Sliced to its own section first. An assertion over the whole file is
// satisfied by the earliest match of each half, which for text this repetitive
// is very often in a different feature.

const FROM = "  // --- The taunt overlay ---";
const TO = "  // --- The net readout ---";
const from = companion.indexOf(FROM);
const to = companion.indexOf(TO, from + 1);
const overlay = from >= 0 && to > from ? companion.slice(from, to) : "";
check("the overlay is a section of its own in src/companion.js", !!overlay, `${overlay.length} characters`);

check(
  "a taunt is sent through the client's own command, not a synthetic key",
  /runCommand\(CHORD_TABLES\.tauntCommand\(n\)\)/.test(overlay) &&
    !/KeyboardEvent/.test(overlay),
  "executeCommand is what the client's own key runs, so its rules stay the client's"
);
check(
  "a rebind writes through the client's KeyBinds and saves it",
  /binds\.changeHotKey\(command, code\)/.test(overlay) && /binds\.save\(\)/.test(overlay),
  "without save() the new key is lost on reload"
);
check(
  "and the command it displaced is named",
  /const displaced = state\.clientHotkeys\.get\(code\)/.test(overlay) && /lost that key/.test(overlay),
  "hotKeys is keyed by code, so binding a taken one silently unbinds its owner"
);
check(
  "a key the extension takes first is reported as such",
  /ourKeyOn\(e\)/.test(overlay) && /the extension takes that key first/.test(overlay),
  "our listener is window+capture, so such a binding would be real, saved and dead"
);
check(
  "the extension's copy of the client's table is kept in step",
  /state\.clientHotkeys\.delete\(was\)/.test(overlay) && /state\.clientHotkeys\.set\(code, command\)/.test(overlay),
  "the conflict warnings and this overlay both read that copy"
);
check(
  "a closed connection and a cooldown are read off the handler, not guessed",
  /gservCon\.isOpen\(\)/.test(overlay) && /lastTauntTimeByPlayer/.test(overlay),
  "sendTaunt drops a taunt in silence in both states"
);
check(
  "the overlay closes with the match it belongs to",
  /closeChord\(\);\r?\n\s*closeTaunts\(\);/.test(companion),
  "CombatantUi#dispose takes the handler with it"
);

// Order decides which of the layers wins a key the user put in two of them. The
// overlay's slot keys are the grid's block, so a press that reached the routing
// table could open a grid underneath an overlay that was about to consume it.
{
  const press = companion.indexOf("if (state.taunt && tauntKey(e)) {");
  const route = companion.indexOf("CHORD_TABLES.chordPressRoute(e, {");
  check(
    "an open overlay answers a press before the layer routing does",
    press > 0 && route > press,
    "its slot keys are the same left-hand block the build grid spends"
  );
}
check(
  "opening the overlay closes an open grid",
  /closeChord\(\);\r?\n\s*state\.taunt = \{ listening: -1 \};/.test(overlay),
  "one layer, one box, one set of keys"
);

// --- the wire -----------------------------------------------------------------
//
// `taunts` has to be spelled the same in four places or the layout never
// arrives, and nothing throws when it does not: the game tab simply plays the
// shipped layout, which is what an unedited one looks like.

check("the bridge defaults it", /^\s*taunts: \{\},$/m.test(bridge));
check("the bridge pushes it", /taunts: data\.taunts,/.test(bridge));
check(
  "an edit to it reaches a running game without a reload",
  /changes\.chords \|\|\r?\n\s*changes\.taunts \|\|/.test(bridge),
  "the storage listener is what makes the options page live"
);
check(
  "the game tab reads it off the push",
  /if \(data\.taunts\) \{[\s\S]{0,200}?state\.taunts = data\.taunts;/.test(companion)
);
check(
  "and redraws an open overlay against it",
  /state\.taunts = data\.taunts;[\s\S]{0,220}?renderTaunts\(\);/.test(companion)
);
check(
  "the options page stores it under the same name",
  /chrome\.storage\.local\.set\(\{ taunts \}, renderTaunts\)/.test(optionsJs)
);
check(
  "a backup carries it with the other bindings",
  /bindings: \["keys", "builds", "commandKeys", "chords", "taunts", "prefs"\]/.test(optionsJs),
  "it is a binding like the rest — a browser restored without it plays a layout nobody chose"
);

// --- the surfaces -------------------------------------------------------------

check(
  "the overlay has a hotkey the options page can rebind",
  /taunts: \{ code: "KeyY"/.test(companion) && /taunts: \{ code: "KeyY"/.test(optionsJs),
  "scripts/check-options.mjs is what holds the two copies identical"
);
check(
  "the settings page has the editor's markup",
  /id="tauntGrid"/.test(optionsHtml) && /id="tauntPick"/.test(optionsHtml) && /id="tauntReset"/.test(optionsHtml)
);
check(
  "and says what the game's own keys are",
  /F5<\/em> to\r?\n\s*<em>F12/.test(optionsHtml) && /F12<\/em> is developer/.test(optionsHtml),
  "the reason the feature exists is the reason a player will look for it"
);
check(
  "the overlay draws the words, and the role when there are none",
  /CHORD_TABLES\.tauntLine\(country, n\)/.test(companion) &&
    /CHORD_TABLES\.tauntRole\(n\)/.test(companion) &&
    /nameEl\.classList\.toggle\("cdc-taunt-role", !line\)/.test(companion),
  "a role drawn as a quote would read as something a country actually says"
);
check(
  "every country is named, sided and has a flag file",
  Object.entries(T.COUNTRIES).every(
    ([, c]) => c.label && /^(Allied|Soviet|Yuri)$/.test(c.side) && /^[a-z]{4}\.pcx$/.test(c.flag)
  ) && Object.keys(T.COUNTRIES).length === 10,
  `${Object.keys(T.COUNTRIES).length} countries`
);
check(
  "the taunt tables and the country table agree on who exists",
  Object.keys(T.TAUNT_COUNTRIES).every((name) => T.COUNTRIES[name]) &&
    Object.keys(T.TAUNT_LINES).every((name) => T.COUNTRIES[name]),
  "a country with lines and no label would draw its rules name over the grid"
);
check(
  "a country nobody knows reads as itself rather than as nothing",
  T.countryLabel("Martians") === "Martians" &&
    T.countryLabel("Confederation") === "Cuba" &&
    T.countryLabel("") === "",
  "a mod's country is a name we have never seen, not an error"
);
check(
  "the game tab reads that table rather than keeping a copy of it",
  /const FACTIONS = \(window\.__cdcBuildChords && window\.__cdcBuildChords\.COUNTRIES\)/.test(companion) &&
    !/Americans:\s*\{\s*label:/.test(companion),
  "the options page needs the same labels and cannot see companion.js"
);
check(
  "the flag is read through the client's own image path",
  /imageContext: "gui\/component\/ImageContext"/.test(companion) &&
    /pcxFile: "data\/PcxFile"/.test(companion) &&
    /imageContext: "ImageContext"/.test(companion) &&
    /pcxFile: "PcxFile"/.test(companion),
  "both tables, or the module loads and is never stored — see MODULE_EXPORTS"
);
check(
  "a line too long for its tile is marked from a measurement, not a guess",
  /nameEl\.classList\.toggle\("cdc-taunt-clipped", nameEl\.scrollHeight > nameEl\.clientHeight \+ 1\)/.test(
    companion
  ) && /label\.classList\.toggle\("clipped", label\.scrollHeight > label\.clientHeight \+ 1\)/.test(optionsJs),
  "both surfaces measure; neither counts characters"
);
check(
  "and hovering shows the rest of it without moving anything",
  // `position: absolute` is what keeps the tile's size; `.hovered` is the
  // class put on by hand for a mouse the game is holding, and a rule that
  // named only `:hover` would be dead in every match.
  /\.cdc-taunt-slot\.hovered \.cdc-chord-name\.cdc-taunt-clipped \{[^}]*position: absolute/.test(css) &&
    /\.cdc-taunt-slot\.hovered \.cdc-chord-name\.cdc-taunt-clipped \{[^}]*opacity: 1/.test(css) &&
    /#tauntGrid \.chordcell:hover \.chordname\.clipped[^{]*\{[^}]*position: absolute/.test(optionsCss),
  "a reveal that resized its tile would reflow the grid under the cursor"
);
check(
  "the reveal is not still clamped to three lines",
  /#tauntGrid \.chordcell:hover \.chordname\.clipped[^{]*\{[^}]*-webkit-line-clamp: unset/.test(optionsCss),
  "the options cell's base rule is a -webkit-box; a taller box that is still clamped is still three lines"
);
check(
  "every cell of a key grid holds its own height",
  /\.chordcell \{[^}]*min-height: 62px/.test(optionsCss) &&
    /\.cdc-taunt-words \{[^}]*height: 3\.6em/.test(css) &&
    /\.chordwords \{[^}]*height: 4\.8em/.test(optionsCss),
  "on `.chordcell.empty` alone this held the build grid open by accident and let the taunt grid's top row collapse"
);
check(
  "and the box that holds it is the box the reveal grows out of",
  /\.cdc-taunt-words \{[^}]*position: relative/.test(css) &&
    /\.chordwords \{[^}]*position: relative/.test(optionsCss) &&
    !/--words-top/.test(css) &&
    !/--words-top/.test(optionsCss),
  "no offset to compute, so no pair of numbers that must agree and eventually will not"
);
check(
  "the words box restates the size its own lines are in",
  /\.chordwords \{[^}]*font-size: 11px/.test(optionsCss) &&
    /\.cdc-taunt-words \{[^}]*font-size: 10px/.test(css),
  "`em` against the cell's inherited 13px sized the box to three and a half lines of the wrong font"
);
check(
  "an empty key still gets a words box, which is what gives it that height",
  /label\.textContent = value \? line \|\| role : "";/.test(optionsJs),
  "a cell shorter than its neighbours moves every key after it"
);
check(
  "the options page can be pointed at any country that can be heard",
  /id="tauntCountries" class="tauntsides"/.test(optionsHtml) &&
    /chordTables\.tauntCountries\(\)/.test(optionsJs) &&
    /chordTables\.tauntLine\(country, value\)/.test(optionsJs),
  "it has no match to read one off, and the eight lines are per country"
);
// The defect: `COUNTRIES` is every country the client can *draw* and
// `TAUNT_COUNTRIES` is every country that has taunt files. The picker read the
// first, so Yuri could be picked — and then `tauntFileName` answered "" and the
// play button was simply not drawn. A control that disappears explains nothing.
check(
  "and the picker cannot offer one that has no sounds",
  T.tauntCountries().length === Object.keys(T.TAUNT_COUNTRIES).length &&
    T.tauntCountries().every((name) => T.TAUNT_COUNTRIES[name] && T.TAUNT_LINES[name]) &&
    !T.tauntCountries().includes("YuriCountry") &&
    !T.TAUNT_LINES.YuriCountry,
  `${T.tauntCountries().length} countries, and Yuri is not one of them`
);
check(
  "the play control is drawn whether or not the sound resolves",
  /if \(value\) \{\s*const heard = file && tauntWavs\.has\(file\)/.test(optionsJs) &&
    /play\.title = !file/.test(optionsJs),
  "gated on the file, it vanished for Yuri with nothing said"
);
check(
  "and the picker is the build list's side tabs rather than a second control",
  /\.buildsides,\s*\.tauntsides \{/.test(optionsCss) && /\.buildside\.on,\s*\.tauntside\.on \{/.test(optionsCss),
  "same job, same rules — a country is not a side, which is the only reason for two names"
);
// --- hearing one -------------------------------------------------------------
//
// The sounds are the player's own import, in the client's origin-private file
// system, which is per origin — so the settings page cannot open one and every
// audition is a round trip through a game tab. Four joins, each of which fails
// in silence: the request, the forward, the read, and the answer.

check(
  "the options page asks for a taunt through storage, like the settings backup",
  /chrome\.storage\.local\.set\(\{ tauntWav: \{ at: Date\.now\(\), requested: file/.test(optionsJs) &&
    /ensureGameTab\(\{/.test(optionsJs),
  "a page with no game tab open gets one opened for it"
);
check(
  "the bridge forwards it and refuses anything that is not a taunt file",
  /if \(tauntWav && tauntWav\.requested\) startTauntWav\(tauntWav\)/.test(bridge) &&
    /\^tau\[a-z\]\{2\}\\d\{2\}\\\.wav\$/.test(bridge) &&
    /post\(\{ type: "taunt-wav-job", file \}\)/.test(bridge),
  "the name becomes a file-system lookup on the page, so it is checked before it is forwarded"
);
check(
  "a request made before this tab existed is taken anyway",
  /tauntWav: null \}, \(data\) => \{/.test(bridge) &&
    /if \(data\.tauntWav && data\.tauntWav\.requested\) startTauntWav\(data\.tauntWav\)/.test(bridge),
  "the page opens the tab and the job is already in storage when it loads — onChanged never fires for that"
);
check(
  "the game tab reads the client's own Taunts directory",
  // The `||` is load-bearing in this pattern: `probe()` carries the same
  // condition, so without it this matched the diagnostic and passed while the
  // read path had lost the collection's own directory. Caught by mutation.
  /\(Engine\.taunts && Engine\.taunts\.rfsDir\) \|\|/.test(companion) &&
    /Engine\.rfs\.findDirectory\(name\)/.test(companion) &&
    /rfsSettings\.tauntsDir\) \|\| "Taunts"/.test(companion) &&
    /readAsDataURL/.test(companion) &&
    /type: "audio\/wav"/.test(companion),
  "the collection's own dir first — it is the object the client's playback reads"
);
// The defect this suite exists to keep out. `Engine.rfs` is there after
// `initRfs`, which runs before the game files are even chosen; the folder is
// pointed at by `initVfs`, which runs at the end of `loadResources`. A read
// that waited only for `rfs` answered "you have no taunts" from a tab that had
// been open for one second and had not looked yet.
check(
  "and waits for the part of the boot that decides the answer",
  /const TAUNT_WAIT_MS = \d{6}/.test(companion) &&
    /if \(!booted && Engine\.vfs\) \{/.test(companion) &&
    /const TAUNT_SETTLE_MS = \d+/.test(companion),
  "`initVfs` sets `vfs` first and the folder two awaits later, so a settle rather than an answer"
);
// RA2 ships its taunts as 4-bit IMA ADPCM in a RIFF wrapper, and no browser
// decodes that — an <audio> handed one says "no supported source was found",
// which is what 1.17.3 did. The client never uses <audio>; `WavFile#getData`
// runs the same `wavefile` conversion its own mixer is fed from.
check(
  "the sound is converted with the client's own decoder before it is sent",
  /sys\.import\("data\/WavFile"\)/.test(companion) &&
    /new WavFile\(bytes\)\.getData\(\)/.test(companion),
  "4-bit IMA ADPCM is not something an <audio> element will take"
);
check(
  "a country whose sound was never imported is an answer, not an error",
  /missing: true,\s*wav: "",\s*why:/.test(companion) &&
    /chordplay" \+ \(!file \|\| heard === "" \? " missing" : ""\)/.test(optionsJs) &&
    /\.chordplay\.missing \{/.test(optionsCss),
  "it is the ordinary state of a fresh install, and the taunt is still sent"
);
// An install that never imported the folder and a client that had not finished
// starting produce the same silence, and they want opposite things done about
// them. So the answer carries the reason, and every hop keeps it.
check(
  "and the answer says which absence it is, all the way to the page",
  /answer\.why = read\.why \|\| ""/.test(companion) &&
    /why: data\.why \|\| ""/.test(bridge) &&
    /nothing to play — \$\{job\.why \|\| /.test(optionsJs),
  "a player told only `not found` cannot tell an empty import from a slow boot"
);
check(
  "and the absence can be read without pressing anything",
  /tauntSounds: \(\) => \{/.test(companion.replace(/\s+/g, " ")) ||
    /tauntSounds:/.test(companion),
  "`__cdc.probe()` answers it from the console, which is where a report starts"
);
check(
  "the bytes leave storage once the page has them",
  /if \(job\.wav\) chrome\.storage\.local\.set\(\{ tauntWav: \{ \.\.\.job, wav: "", cleared: true \} \}\)/.test(
    optionsJs
  ),
  "a data URL is the largest thing this extension ever writes"
);
// ...and that write arrives back through `storage.onChanged` like any other.
// Read as an answer it is one with no payload: it overwrote the cached URL with
// "" and drew the play button as a file this install has not got, the moment
// the sound finished. Reported as "the cross stays up after it plays".
check(
  "and the page does not read its own emptying as an answer",
  /if \(job\.cleared\) return;/.test(optionsJs) && /cleared: false,/.test(bridge),
  "a fresh request clears the flag, or the next answer would be ignored too"
);
check(
  "the cell can hold a button because it stopped being one",
  /cell\.setAttribute\("role", "button"\)/.test(optionsJs) &&
    /cell\.tabIndex = 0/.test(optionsJs) &&
    /e\.key !== "Enter" && e\.key !== " "/.test(optionsJs),
  "a button inside a button is not markup any parser keeps, and Enter and Space were the button's"
);
check(
  "and the play control keeps its press to itself",
  /play\.addEventListener\("click", \(e\) => \{\s*e\.stopPropagation\(\);/.test(optionsJs),
  "the cell underneath picks this key for editing"
);
check(
  "the settings page says the audition needs the game",
  /id="tauntNote"/.test(optionsHtml) && /a settings page cannot open/.test(optionsHtml),
  "the first play opens a game tab, which is a surprise worth spending a sentence on"
);

check(
  "the country strip and the words have styles",
  /\.cdc-taunt-country \{/.test(css) &&
    /\.cdc-taunt-country\.cdc-taunt-nocountry \{/.test(css) &&
    /\.cdc-taunt-flag \{/.test(css) &&
    /\.cdc-taunt-num \{/.test(css) &&
    /\.cdc-taunt-slot \.cdc-chord-name\.cdc-taunt-role \{/.test(css),
  "an unstyled strip is a line of text where a heading was meant"
);
check(
  "a taunt tile is wider than a cameo, because it holds a sentence",
  /--cell: \d+px;/.test(css) &&
    /grid-template-columns: repeat\(var\(--cols\), var\(--cell, 60px\)\)/.test(css) &&
    /width: var\(--cell, 60px\)/.test(css),
  "the build grid keeps the cameo's 60px, which is the variable's default"
);
check(
  "and the options grid is fractions of its panel, so it cannot scroll sideways",
  /#tauntGrid \{[^}]*grid-template-columns: repeat\(var\(--cols\), minmax\(0, 1fr\)\)/.test(optionsCss) &&
    /#tauntGrid \{[^}]*overflow: visible/.test(optionsCss) &&
    /\.tauntcontrols \{\s*flex: 1 1 460px/.test(optionsCss) &&
    /\.setgroup-wide \{[^}]*flex: 1 1 100%/.test(optionsCss),
  "a fraction needs a width to be a fraction of: shrink-to-fit gave every cell 76px"
);
check(
  "the key and the number are a rail on both surfaces, not corner badges",
  /\.cdc-taunt-rail \{[^}]*display: grid/.test(css) &&
    /\.chordrail \{[^}]*display: grid/.test(optionsCss) &&
    /\.cdc-taunt-slot \.cdc-chord-key \{[^}]*position: static/.test(css) &&
    /#tauntGrid \.chordkey \{[^}]*position: static/.test(optionsCss),
  "as badges they cost a band across the whole top of every tile to clear"
);
check(
  "the slot editor names what each taunt is for",
  /chordTables\.tauntRole\(value\)/.test(optionsJs) && /chordTables\.tauntRole\(n\)/.test(optionsJs),
  "the page has no country, so the role is all it can say"
);

check(
  "the tile styles exist for the classes the overlay sets",
  /\.cdc-taunt-bind \{/.test(css) &&
    /\.cdc-taunt-bind\.listening \{/.test(css) &&
    /\.cdc-taunt-bind\.unbound \{/.test(css) &&
    /\.cdc-taunt-silent \.cdc-chord-name \{/.test(css),
  "an unstyled bind line is a control nobody can see is a control"
);

for (const line of results) console.log(line);

// A run that asserted nothing is not a pass — the same tripwire the other
// suites carry, and the one that has caught an aborted run here twice.
const EXPECTED = 78;
if (results.length !== EXPECTED) {
  console.error(`${results.length} checks ran, ${EXPECTED} expected — this suite is out of date`);
  process.exit(1);
}
const failed = results.filter((line) => line.startsWith("FAIL")).length;
console.log(`${results.length - failed}/${results.length} checks pass`);
process.exit(failed ? 1 : 0);
