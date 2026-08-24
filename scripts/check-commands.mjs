/**
 * A key of ours can fire a command of the client's, and the wire it travels on
 * is joined up at both ends.
 *
 *   node scripts/check-commands.mjs
 *
 * The feature is three files agreeing about two storage keys — `commandKeys`
 * (what the user bound, options page to game tab) and `commands` (what the
 * client offers, game tab to options page) — and none of the disagreements
 * throw. A binding that never reaches the game tab looks exactly like a key the
 * game ignores; a harvest the options page never reads looks exactly like a
 * client with no commands. So the joins are asserted here rather than left to
 * be noticed in a match.
 *
 * What it cannot check is that the client still calls its commands what it
 * called them: that answer is in a running client, which is the whole reason
 * the list is harvested rather than shipped. `sendCommands` reads the live
 * `KeyboardHandler`, so a renamed command drops out of the options page's
 * picker on its own, and a binding left on the old name is marked in the row
 * and warned about at the press.
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

const results = [];
const check = (name, ok, detail) =>
  results.push(`${ok ? "PASS" : "FAIL"} ${name}${detail ? " — " + detail : ""}`);

// --- the press ----------------------------------------------------------------

// The whole feature rests on this: the client listens on the document in the
// bubble phase, ours listens on the window in the capture phase, so a press we
// consume never reaches it. That is what frees Tab from the alliance screen —
// there is no rebinding involved, and nothing is written to the client's table.
{
  // Found by index rather than by one regex across the whole listener: it is
  // several hundred lines long, and a window wide enough to span it is wide
  // enough to reach the *next* listener's flag by accident.
  const at = companion.search(/window\.addEventListener\(\r?\n\s*"keydown",/);
  const flag = at < 0 ? -1 : companion.slice(at).search(/\r?\n\s*true,?\r?\n\s*\);/);
  check(
    "the listener that consumes a press is still window + capture",
    at >= 0 && flag > 0,
    "the keydown listener's capture flag is what starves the client's own handler"
  );
}
check(
  "a bound command swallows the press",
  /const command = commandBindings\(\)\.get\(eventBindingId\(e\)\);[\s\S]{0,300}?e\.preventDefault\(\);[\s\S]{0,80}?e\.stopPropagation\(\);[\s\S]{0,120}?runCommand\(command\)/.test(
    companion
  ),
  "without both calls the client would act on the key as well"
);
// Order decides which of three lists wins a key the user put in two of them,
// and the options page tells the reader what that order is. If they disagree
// the page is lying, which is worse than either order.
check(
  "the command layer is asked after the fixed hotkeys and before the build keys",
  companion.indexOf("const command = commandBindings()") > companion.indexOf("const hit = matchesHotkey(e, state.keys.debug)") &&
    companion.indexOf("const command = commandBindings()") < companion.indexOf("const bindings = buildBindings(playerSide())"),
  "the options page's warnings name this order"
);
check(
  "and only in a match, since the handler it needs belongs to one",
  companion.indexOf("if (!state.combatant || e.metaKey) return;") <
    companion.indexOf("const command = commandBindings()")
);

// --- running it ---------------------------------------------------------------

// `executeCommand` is the client's own dispatch, which is the point: no
// synthetic KeyboardEvent, no re-hashing of a keyCode into its table.
check(
  "the command runs through the client's own KeyboardHandler",
  /handler\.executeCommand\(command\)/.test(companion) &&
    /worldInteraction[\s\S]{0,120}keyboardHandler/.test(companion)
);
check(
  "an unregistered command says so instead of doing nothing quietly",
  /handler\.commands instanceof Map && !handler\.commands\.has\(command\)/.test(companion) &&
    /is not a command this match registers/.test(companion),
  "executeCommand returns in silence for a name it does not hold"
);

// --- the harvest ---------------------------------------------------------------

// Off the live handler, not off the KeyCommandType enum: the enum carries names
// nothing registers (ToggleMarbleMadness) and names registered only while
// cheats are on, and a binding on either could never fire.
check(
  "the offered list is read off what the client actually registers",
  /\[\.\.\.handler\.commands\.keys\(\)\]/.test(companion) && !/KeyCommandType/.test(
    companion.slice(companion.indexOf("function sendCommands"), companion.indexOf("async function sendRoster"))
  )
);
// It has to run after the client's own init, which is where the
// WorldInteraction is built and its command table filled.
check(
  "the harvest runs after the client's init, not before it",
  /const started = originalInit\.apply\(this, args\);[\s\S]{0,600}?sendCommands\(\);[\s\S]{0,40}?return started;/.test(
    companion
  ),
  "before it there is no worldInteraction to read"
);
check(
  "the game tab sends the table under a type the bridge handles",
  /type: "command-table"/.test(companion) && /data\.type === "command-table"/.test(bridge)
);
check(
  "the bridge writes it where the options page looks",
  /function rememberCommands/.test(bridge) && /write\(\{ commands \}\)/.test(bridge)
);

// --- the bindings, the other way down the wire ---------------------------------

check(
  "commandKeys is in the bridge's DEFAULTS, so a config push carries it",
  /commandKeys: \[\],/.test(bridge) && /commandKeys: data\.commandKeys,/.test(bridge)
);
check(
  "and the game tab reads it back",
  /Array\.isArray\(data\.commandKeys\)/.test(companion) && /state\.commandKeys = data\.commandKeys/.test(companion)
);
check(
  "the offered list stays out of the config push",
  !/\bcommands: data\.commands\b/.test(bridge),
  "the game tab reads the live handler; sending its own harvest back is a round trip for nothing"
);
check(
  "a backup carries the bindings",
  /bindings: \[[^\]]*"commandKeys"/.test(optionsJs)
);
check(
  "but not the harvested list, which belongs to whichever client is installed",
  !/notes: \[[^\]]*"commands"/.test(optionsJs) && !/bindings: \[[^\]]*"commands"[^K]/.test(optionsJs)
);

// --- the options page ----------------------------------------------------------

{
  const ids = ["commandList", "commandPick", "commandAdd"];
  const missing = ids.filter((id) => !optionsHtml.includes(`id="${id}"`));
  check("every control options.js binds exists in the page", !missing.length, missing.join(",") || "all present");
  const unbound = ids.filter((id) => !optionsJs.includes(`getElementById("${id}")`));
  check("and every one of them is bound", !unbound.length, unbound.join(",") || "all bound");
}
check(
  "the picker offers the harvested list rather than a copy of the client's enum",
  /function commandItems\(\)[\s\S]{0,200}commands\.items/.test(optionsJs) &&
    (optionsJs.match(/Scoreboard/g) || []).length <= 2,
  "two mentions: the label override and the page's own prose about it"
);
check(
  "the empty state tells the reader how to fill it",
  /No command list yet — play a match once/.test(optionsJs)
);
// The one thing a reader of this panel cannot see for themselves: a key that is
// also on a panel hotkey never fires here, because that list is asked first.
check(
  "a key claimed by two of the lists is reported",
  /function commandWarning/.test(optionsJs) &&
    /is on this key and is asked first/.test(optionsJs) &&
    /build key is on this key/.test(optionsJs)
);
// keyWarning's first line is "no modifier — the extension takes this key first,
// and the game never sees it", which is the one thing this list is *for*.
check(
  "and the panel does not carry the bare-key warning, which is this list's whole point",
  !/function commandWarning[\s\S]{0,1400}No modifier/.test(optionsJs)
);
check(
  "both halves compare a binding the same way",
  /function bindingId\(key\)[\s\S]{0,220}key\.code\}\|\$\{key\.alt \? 1 : 0\}\$\{key\.ctrl \? 1 : 0\}\$\{key\.shift \? 1 : 0\}/.test(
    optionsJs
  ) &&
    /function bindingId\(key\)[\s\S]{0,220}key\.code\}\|\$\{key\.alt \? 1 : 0\}\$\{key\.ctrl \? 1 : 0\}\$\{key\.shift \? 1 : 0\}/.test(
      companion
    ),
  "a second spelling of the id would make the page's warnings disagree with the press"
);

// --- the mouse as an input -----------------------------------------------------

// The whole reason a mouse binding costs so little: its descriptor carries
// `Mouse<n>` where a key carries a `code`, so `bindingId` needs no mouse form
// and the two halves go on comparing bindings the one way they already agree
// on. A second spelling here would make the page's warnings disagree with the
// press, silently.
check(
  "a mouse press reduces through the same bindingId as a key",
  /function mouseBindingId\(e, over\)[\s\S]{0,400}`Mouse\$\{e\.button\}\|/.test(companion) &&
    /code: "Mouse" \+ e\.button/.test(optionsJs) &&
    !/function mouseBindingId/.test(optionsJs),
  "the page builds the id through bindingId on a Mouse<n> code, not through a mouse-shaped copy"
);

// Left and right are the two that can break a match: left is every click in the
// interface, right is the game's own order. Refused in three places, and all
// three matter — the listener, the capture widget, and the name table that has
// no entry to offer for them.
// Left, middle and right are the mouse the game already has. Everything from 3
// up is free and all of it is offered, so the rule is one comparison rather
// than a list of exceptions.
check(
  "the listener takes button 3 and up, and nothing below it",
  /function ourButton\(button\)[\s\S]{0,400}return button >= 3;/.test(companion)
);
check(
  "and the capture widget draws the same line, where left is the click that opened it",
  /const onMouse = \(e\) => \{[\s\S]{0,120}?e\.button < 3\) return;/.test(optionsJs)
);

// A browser acts on back/forward at the end of a click, so a swallow that stops
// at mousedown leaves the navigation to fire off the release.
check(
  "the rest of a taken press is swallowed too, not just the mousedown",
  /for \(const type of \["mouseup", "auxclick", "click"\]\)[\s\S]{0,400}e\.preventDefault\(\)/.test(companion),
  "back/forward navigate at the end of a click, not the start"
);

// The mouse listener asks the panel toggles by name out of one table; the
// keydown ladder asks the same seven by hand. Two lists that must agree.
{
  const table = /function panelToggles\(\)\s*\{\s*return \{([\s\S]{0,600}?)\};/.exec(companion);
  const names = table ? [...table[1].matchAll(/(\w+):/g)].map((m) => m[1]) : [];
  const ladder = /const hit = matchesHotkey\(e, state\.keys\.([\s\S]{0,900}?)\s*: null;/.exec(companion);
  const inLadder = ladder ? [...ladder[0].matchAll(/state\.keys\.(\w+)/g)].map((m) => m[1]) : [];
  check(
    "every panel toggle the mouse can reach is one the keyboard ladder also asks",
    names.length > 0 && names.every((n) => inLadder.includes(n)),
    names.filter((n) => !inLadder.includes(n)).join(",") || `${names.length} name(s), all in both`
  );
  check(
    "and the ladder holds nothing the mouse table has forgotten",
    inLadder.length > 0 && inLadder.every((n) => names.includes(n)),
    inLadder.filter((n) => !names.includes(n)).join(",") || "none missing"
  );
}

// A mouse binding cannot live in the client's own table — that table hashes a
// keyCode — so the descriptor deliberately has none, and the command route is
// the only one open to it.
check(
  "a mouse descriptor carries no keyCode, because the client's table hashes one",
  /function describeMouse\(e\)[\s\S]{0,700}?\};/.test(optionsJs) &&
    !/function describeMouse\(e\)[\s\S]{0,700}?keyCode/.test(optionsJs)
);

// The warnings a mouse binding earns are the browser's, not the game's.
check(
  "a mouse row is warned about the browser rather than about the game",
  /function mouseWarning\(k\)/.test(optionsJs) &&
    /autoscroll/.test(optionsJs) &&
    /never confirmed against a live browser/.test(optionsJs),
  "the bare Back/Forward case is the one the live probe did not exercise"
);

// One rule for the whole page: a mouse press binds wherever a key binds. The
// widget is shared by four lists, so the press path has to reach all four —
// anything less stores a binding that reads as set and never fires, which in a
// match is indistinguishable from a broken feature.
check(
  "the capture widget takes a mouse press with no list-by-list exceptions",
  /function captureKey\(button, done\)/.test(optionsJs) &&
    !/mouse: false/.test(optionsJs) &&
    !/keyboard only/.test(optionsJs)
);
check(
  "the mouse reaches the build bindings, so a side button can order a reactor",
  /mousedown[\s\S]{0,4000}?const bindings = buildBindings\(playerSide\(\)\)/.test(companion) &&
    /mousedown[\s\S]{0,4200}?pressName\(bound, 1, next\)/.test(companion)
);
check(
  "and Ctrl on one means what it means on a key — queue next, not a second binding",
  /mousedown[\s\S]{0,4200}?mouseBindingId\(e, \{ ctrl: false \}\)/.test(companion),
  "the bare binding is reached for only when the Ctrl press has none of its own"
);
check(
  "the menu key is reachable too, through the client's own routing",
  /menuKeyAction\(e, \{ \.\.\.menuPressAt\(e\), isMenuKey: true \}\)/.test(companion),
  "that table recognises a key by its code, and a mouse press has none"
);

console.log(results.join("\n"));
process.exit(results.some((r) => r.startsWith("FAIL")) ? 1 : 0);
