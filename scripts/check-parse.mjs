/**
 * Every script the extension ships compiles.
 *
 *   node scripts/check-parse.mjs
 *
 * **Why a check this blunt exists.** `src/options.js` shipped in 1.7.0 with six
 * string fragments concatenated by nothing at all —
 *
 *   sidebar:
 *     "Hides the game's own right-hand sidebar — the cameos, the four tabs, "
 *     "the radar, the credits and the repair, sell, diplomacy and options "
 *
 * — which is a `SyntaxError` over the whole file, so the options page loaded no
 * script whatever: every tab, every setting, every button, dead. It survived a
 * release because **nothing in this repo parsed that file**. The suites read the
 * sources as *text* (deliberately: a checker that needed a DOM would never be
 * run), `pack.mjs --dry` checks that a `<script src>` resolves rather than that
 * it runs, and the two suites that do execute code pull one function out with a
 * regex and `new Function` it — which compiles that function and nothing else.
 *
 * So the cheapest possible question was the one nobody was asking. This asks it:
 * compile each file the way a browser would, run none of it.
 *
 * `src/` only, and that is the whole of the gap rather than a shortcut. Every
 * file under `scripts/` and `site/` is *run* by something — the suite sweep runs
 * the checkers, the site build runs the builders — so a syntax error there is
 * loud on the next run. The browser scripts are the ones nothing here executes.
 *
 * `vm.Script` and not `new Function`: the latter wraps the text in a function
 * body, where a top-level `return` is legal and a duplicate `let` at file scope
 * is not — neither of which is what a `<script>` tag does. This compiles a
 * classic script, which is what every file in `src/` is.
 */
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import vm from "node:vm";

const here = dirname(fileURLToPath(import.meta.url));
const src = join(here, "..", "src");

let names = [];
try {
  names = readdirSync(src).filter((name) => name.endsWith(".js"));
} catch (e) {
  console.error(`could not read src/ — ${e.message}`);
  process.exit(1);
}

// A run that found nothing is a broken checker, not a clean tree — the same
// tripwire every other suite here carries.
if (names.length < 10) {
  console.error(`only ${names.length} scripts found in src/ — this check is no longer reading the tree`);
  process.exit(1);
}

let bad = 0;
for (const name of names) {
  try {
    new vm.Script(readFileSync(join(src, name), "utf8"), { filename: "src/" + name });
  } catch (e) {
    bad++;
    console.error(`FAIL src/${name} does not compile — ${e.message}`);
  }
}

console.log(`${names.length - bad}/${names.length} shipped scripts compile`);
process.exit(bad ? 1 : 0);
