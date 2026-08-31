/**
 * Does a browser's `brightness()`/`contrast()` agree with our palette bake?
 *
 *   NODE_PATH="$(npm root -g)" node scripts/probe-filter-parity.mjs
 *
 * The appearance dials are applied two ways on purpose. A stored render bakes
 * them into the 256-entry palette LUT (`__cdcTune.tuneLut`, and through it
 * `channel`); the in-game radar cannot bake, because it composites live layers,
 * so it would apply the same dials as a canvas `filter` string
 * (`__cdcTune.filterString`). scripts/check-tune.mjs proves both come off one
 * function, which is as far as arithmetic can go — it cannot prove that the
 * *browser* implements `brightness()`/`contrast()` the way `channel()` predicts.
 *
 * That is this file, and the answer forks the radar's draw loop:
 *
 *   - agree  -> the radar composites layers under `ctx.filter`. One pass, GPU,
 *               nothing allocated per dial change.
 *   - differ -> `ctx.filter` is unusable for this and each layer has to be
 *               redrawn through a `tuneLut`-tinted copy, which costs a canvas
 *               and a pixel pass per layer per dial change.
 *
 * Run at deviceScaleFactor 2, which is the operator's display. It should not
 * matter here — every canvas is sized in device pixels explicitly — and the run
 * reports both so that "it should not matter" is a measurement rather than an
 * assumption.
 *
 * Read-only: it opens a blank page, does arithmetic in it, and prints. No game,
 * no network, no storage.
 */
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

// Playwright is installed globally on this machine, not as a dependency of this
// repo -- there is no package.json here at all. An ESM `import` ignores
// NODE_PATH; a CJS `require` honours it, so the resolution goes through
// createRequire and the run line sets NODE_PATH to `npm root -g`.
const require = createRequire(import.meta.url);
let chromium;
try {
  ({ chromium } = require("playwright"));
} catch (e) {
  console.error("playwright not resolvable: " + e.message);
  console.error('run as: NODE_PATH="$(npm root -g)" node scripts/probe-filter-parity.mjs');
  process.exit(2);
}

const here = dirname(fileURLToPath(import.meta.url));
const tuneSrc = readFileSync(join(here, "..", "src", "render-tune.js"), "utf8");

// The dial pairs worth asking about: the extremes of the clamp, the middle, and
// a couple of ordinary settings someone would actually leave a radar on.
const GRID = [
  { brightness: 1, contrast: 1 },
  { brightness: 0.6, contrast: 1 },
  { brightness: 1, contrast: 0.6 },
  { brightness: 0.35, contrast: 1.4 },
  { brightness: 1.6, contrast: 0.8 },
  { brightness: 0.2, contrast: 0.2 },
  { brightness: 2, contrast: 2 },
];

async function run(dpr) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: dpr });
  await page.addScriptTag({ content: tuneSrc });

  const report = await page.evaluate(
    ({ grid }) => {
      const T = window.__cdcTune;
      const W = 256;
      const H = 8;

      // A source covering every channel value, at three alpha levels: fully
      // opaque (what a baked LUT produces), and two partial ones (what a
      // downscaled layer's edges produce, which is the case a premultiplication
      // difference would show up in).
      const ALPHAS = [255, 128, 64];
      const src = document.createElement("canvas");
      src.width = W;
      src.height = H * ALPHAS.length;
      const sctx = src.getContext("2d", { willReadFrequently: true });
      const img = sctx.createImageData(src.width, src.height);
      for (let band = 0; band < ALPHAS.length; band++) {
        for (let y = 0; y < H; y++) {
          for (let x = 0; x < W; x++) {
            const i = ((band * H + y) * W + x) * 4;
            img.data[i] = x; // red sweeps 0..255
            img.data[i + 1] = 255 - x; // green sweeps the other way
            img.data[i + 2] = (x * 7) % 256; // blue is out of step with both
            img.data[i + 3] = ALPHAS[band];
          }
        }
      }
      sctx.putImageData(img, 0, 0);

      const out = [];
      for (const dials of grid) {
        // Path A — the browser's own filter, exactly the string the radar
        // would set.
        const a = document.createElement("canvas");
        a.width = src.width;
        a.height = src.height;
        const actx = a.getContext("2d", { willReadFrequently: true });
        actx.filter = T.filterString({ types: { base: dials } }, "base");
        actx.drawImage(src, 0, 0);
        const got = actx.getImageData(0, 0, a.width, a.height).data;

        // Path B — channel(), which is what the palette bake applies.
        const want = new Uint8ClampedArray(got.length);
        for (let i = 0; i < img.data.length; i += 4) {
          want[i] = T.channel(img.data[i], dials.brightness, dials.contrast);
          want[i + 1] = T.channel(img.data[i + 1], dials.brightness, dials.contrast);
          want[i + 2] = T.channel(img.data[i + 2], dials.brightness, dials.contrast);
          want[i + 3] = img.data[i + 3];
        }

        // Reported per alpha band, because that is the axis a premultiplication
        // difference would separate.
        const bands = ALPHAS.map((alpha, band) => {
          let max = 0;
          let sum = 0;
          let n = 0;
          const from = band * H * W * 4;
          const to = from + H * W * 4;
          for (let i = from; i < to; i += 4) {
            for (let c = 0; c < 3; c++) {
              const d = Math.abs(got[i + c] - want[i + c]);
              if (d > max) max = d;
              sum += d;
              n++;
            }
          }
          return { alpha, max, mean: +(sum / n).toFixed(3) };
        });

        out.push({ dials, bands, filter: actx.filter });
      }
      return out;
    },
    { grid: GRID }
  );

  await browser.close();
  return report;
}

const rows = [];
for (const dpr of [1, 2]) {
  const report = await run(dpr);
  for (const entry of report) {
    for (const band of entry.bands) {
      rows.push({ dpr, ...entry.dials, alpha: band.alpha, max: band.max, mean: band.mean });
    }
  }
}

const pad = (v, n) => String(v).padStart(n);
console.log("dpr  bright  contr  alpha   maxΔ   meanΔ");
for (const r of rows) {
  console.log(
    `${pad(r.dpr, 3)}  ${pad(r.brightness, 6)}  ${pad(r.contrast, 5)}  ${pad(r.alpha, 5)}  ${pad(r.max, 5)}  ${pad(r.mean, 6)}`
  );
}

// Tolerance 2, and the number is measured rather than chosen. Chrome rounds
// somewhere inside its filter chain that we cannot reach: quantising our own
// chain to 8 bits between the primitives was tried and moved nothing, so ±2 of
// 255 is its implementation and not our arithmetic. That is 0.8% of range —
// invisible. Anything above it is a different ramp, and then the radar cannot
// use ctx.filter and has to tint each layer through a tuneLut copy instead.
const TOLERANCE = 2;
const opaque = rows.filter((r) => r.alpha === 255);
const partial = rows.filter((r) => r.alpha !== 255);
const worstOpaque = Math.max(...opaque.map((r) => r.max));
const worstPartial = Math.max(...partial.map((r) => r.max));

console.log(`\nworst delta on opaque pixels:      ${worstOpaque}`);
console.log(`worst delta on partial alpha:      ${worstPartial}`);
console.log(
  worstOpaque <= TOLERANCE
    ? "\nVERDICT: the browser filter matches the bake on opaque pixels — the radar can composite with ctx.filter."
    : "\nVERDICT: the browser filter does NOT match the bake — the radar must tint each layer through a tuneLut copy."
);
if (worstOpaque <= TOLERANCE && worstPartial > TOLERANCE) {
  console.log(
    "NOTE: partial-alpha pixels drift further — premultiplication rounding, worst at low alpha.\n" +
      "      A downscaled layer has soft edges, so a radar layer's edges differ from a baked\n" +
      "      render's by a few of 255. Invisible, and it is why this is reported per alpha band."
  );
}
