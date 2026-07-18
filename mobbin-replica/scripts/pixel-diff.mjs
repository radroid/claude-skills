#!/usr/bin/env node
// pixel-diff.mjs — score a replica screenshot against a reference and emit a heatmap.
// Runs from the generated replica app dir so pixelmatch/pngjs resolve from its node_modules.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

function parseArgs(argv) {
  const a = { threshold: 0.1, passThreshold: 3, masks: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--reference') { a.reference = v; i++; }
    else if (k === '--actual') { a.actual = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--threshold') { a.threshold = Number(v); i++; }
    else if (k === '--pass-threshold') { a.passThreshold = Number(v); i++; }
    else if (k === '--mask') { const [x, y, w, h] = v.split(',').map(Number); a.masks.push({ x, y, w, h }); i++; }
  }
  return a;
}

function die(msg) { console.error(msg); process.exit(2); }

const args = parseArgs(process.argv.slice(2));
if (!args.reference || !args.actual || !args.out) {
  die('usage: node pixel-diff.mjs --reference <ref.png> --actual <actual.png> --out <diff.png> [--threshold 0.1] [--pass-threshold 3] [--mask x,y,w,h ...]');
}

// Resolve pixelmatch/pngjs from the CURRENT WORKING DIR's node_modules (the replica
// app), not this script's location — ESM bare imports would otherwise resolve from
// the skill dir, which has no deps.
let pixelmatch, PNG;
try {
  const requireFromCwd = createRequire(pathToFileURL(join(process.cwd(), 'package.json')));
  const pmMod = await import(pathToFileURL(requireFromCwd.resolve('pixelmatch')));
  const pngMod = await import(pathToFileURL(requireFromCwd.resolve('pngjs')));
  pixelmatch = pmMod.default || pmMod;
  PNG = pngMod.PNG || (pngMod.default && pngMod.default.PNG);
  if (typeof pixelmatch !== 'function' || !PNG) throw new Error('bad module shape');
} catch {
  die('missing deps: run `npm i -D pixelmatch pngjs` in the replica app, then run this from that app dir.');
}

let ref, act;
try { ref = PNG.sync.read(readFileSync(args.reference)); }
catch (e) { die(`cannot read --reference: ${e.message}`); }
try { act = PNG.sync.read(readFileSync(args.actual)); }
catch (e) { die(`cannot read --actual: ${e.message}`); }

const width = Math.min(ref.width, act.width);
const height = Math.min(ref.height, act.height);

// Crop both to the common top-left region so mismatched sizes still diff.
function crop(src, w, h) {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (src.width * y + x) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}
const a = crop(ref, width, height);
const b = crop(act, width, height);

const diff = new PNG({ width, height });
const rawDiff = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: args.threshold, includeAA: false });

// Apply masks: zero out masked pixels in the heatmap and exclude them from counts.
let masked = 0;
const inMask = (x, y) => args.masks.some(m => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
let diffPixels = rawDiff;
if (args.masks.length) {
  diffPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (inMask(x, y)) {
        masked++;
        diff.data[idx] = 0; diff.data[idx + 1] = 0; diff.data[idx + 2] = 0; diff.data[idx + 3] = 255;
        continue;
      }
      // pixelmatch marks changed pixels red-ish; count non-background as diff.
      if (diff.data[idx] === 255 && diff.data[idx + 1] < 128 && diff.data[idx + 2] < 128) diffPixels++;
    }
  }
}

const totalPixels = width * height - masked;
const pct = totalPixels === 0 ? 0 : (100 * diffPixels) / totalPixels;
writeFileSync(args.out, PNG.sync.write(diff));

const result = {
  diffPixels, totalPixels,
  pct: Number(pct.toFixed(3)),
  width, height,
  out: args.out,
  pass: pct <= args.passThreshold,
  passThreshold: args.passThreshold,
};
console.log(JSON.stringify(result));
