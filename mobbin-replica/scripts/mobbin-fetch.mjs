#!/usr/bin/env node
// mobbin-fetch.mjs — turn Mobbin MCP screen results into clean reference PNGs on disk.
//
// Mobbin MCP returns webp previews that carry a "curated by Mobbin" footer banner.
// Neither is usable as a pixel-diff reference as-is, so this script:
//   download image_url -> convert webp to PNG -> auto-detect & crop the footer -> write PNG
//
// Usage:
//   node mobbin-fetch.mjs --manifest screens.json --outdir .replica/references
//   node mobbin-fetch.mjs --url <image_url> --slug my-flights --outdir .replica/references
//
// manifest = the JSON array from an MCP search_screens result; each entry needs
// `image_url` and (ideally) a `slug`. Falls back to `id`/index for naming.
//
// Options:
//   --crop-bottom N   force-strip N bottom px instead of auto-detecting the banner
//   --no-crop         keep the full image (you are cropping elsewhere)
//
// Prints one JSON line per image plus a final summary object. Exit 2 on any failure.
import { writeFileSync, readFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';

function die(msg) { console.error(msg); process.exit(2); }

function parseArgs(argv) {
  const a = { outdir: '.replica/references', urls: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i], v = argv[i + 1];
    if (k === '--manifest') { a.manifest = v; i++; }
    else if (k === '--url') { a.urls.push({ image_url: v }); i++; }
    else if (k === '--slug') { a.slug = v; i++; }
    else if (k === '--outdir') { a.outdir = v; i++; }
    else if (k === '--crop-bottom') { a.cropBottom = Number(v); i++; }
    else if (k === '--no-crop') { a.noCrop = true; }
  }
  return a;
}

const args = parseArgs(process.argv.slice(2));

let PNG;
try {
  const requireFromCwd = createRequire(pathToFileURL(join(process.cwd(), 'package.json')));
  const pngMod = await import(pathToFileURL(requireFromCwd.resolve('pngjs')));
  PNG = pngMod.PNG || (pngMod.default && pngMod.default.PNG);
  if (!PNG) throw new Error('bad module shape');
} catch {
  die('missing dep: run `npm i -D pngjs` in the replica app, then run this from that app dir.');
}

// Build the work list.
let items = [];
if (args.manifest) {
  let raw;
  try { raw = JSON.parse(readFileSync(args.manifest, 'utf8')); }
  catch (e) { die(`cannot read --manifest: ${e.message}`); }
  items = Array.isArray(raw) ? raw : (raw.screens || []);
  if (!items.length) die('manifest contained no screens (expected an array, or {screens:[...]})');
} else if (args.urls.length) {
  items = args.urls.map(u => ({ ...u, slug: args.slug }));
} else {
  die('usage: node mobbin-fetch.mjs (--manifest screens.json | --url <image_url> [--slug name]) [--outdir dir] [--crop-bottom N] [--no-crop]');
}

mkdirSync(args.outdir, { recursive: true });

// Convert any image to PNG using macOS `sips`, falling back to ImageMagick.
function toPng(src, dest) {
  try { execFileSync('sips', ['-s', 'format', 'png', src, '--out', dest], { stdio: 'ignore' }); return; }
  catch { /* fall through */ }
  for (const bin of ['magick', 'convert']) {
    try { execFileSync(bin, [src, dest], { stdio: 'ignore' }); return; }
    catch { /* try next */ }
  }
  die('need `sips` (macOS) or ImageMagick (`magick`/`convert`) to convert webp to PNG.');
}

// Locate the Mobbin footer: a near-black band flush to the bottom edge.
// Conservative on purpose — a dark-themed app screen must NOT be mistaken for a banner.
function detectBanner(png) {
  const { width, height, data } = png;
  const darkFrac = (y) => {
    let dark = 0, n = 0;
    for (let x = 0; x < width; x += 2) {
      const i = (width * y + x) << 2;
      if ((data[i] + data[i + 1] + data[i + 2]) / 3 < 70) dark++;
      n++;
    }
    return dark / n;
  };
  const maxBanner = Math.floor(height * 0.10); // banner is never >10% of the image
  let y = height - 1;
  if (darkFrac(y) < 0.9) return 0;             // bottom edge isn't a solid dark bar
  // Walk up while rows stay mostly dark; the banner's own text dips the fraction,
  // so tolerate down to 0.45 and stop at clearly-light content rows.
  while (y > 0 && darkFrac(y) >= 0.45 && (height - y) <= maxBanner) y--;
  const bannerHeight = height - (y + 1);
  if (bannerHeight < 6 || bannerHeight > maxBanner) return 0; // ambiguous -> don't crop
  // The band only counts as a banner if the row ABOVE it is clearly light app
  // content. On a dark-themed screenshot the row above is dark too, so we bail and
  // keep the whole image — under-cropping is recoverable, destroying content is not.
  // (Dark screen that genuinely has a banner: pass --crop-bottom explicitly.)
  if (darkFrac(y) >= 0.2) return 0;
  return bannerHeight;
}

function cropBottom(png, px) {
  if (px <= 0) return png;
  const h = png.height - px;
  const out = new PNG({ width: png.width, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < png.width; x++) {
      const si = (png.width * y + x) << 2;
      const di = (png.width * y + x) << 2;
      out.data[di] = png.data[si];
      out.data[di + 1] = png.data[si + 1];
      out.data[di + 2] = png.data[si + 2];
      out.data[di + 3] = png.data[si + 3];
    }
  }
  return out;
}

const results = [];
let failed = 0;

for (const [idx, item] of items.entries()) {
  const url = item.image_url;
  const slug = item.slug || item.id || `screen-${idx + 1}`;
  if (!url) { console.error(`skip ${slug}: no image_url`); failed++; continue; }

  const tmpRaw = join(args.outdir, `.${slug}.raw`);
  const tmpPng = join(args.outdir, `.${slug}.tmp.png`);
  const outPath = join(args.outdir, `${slug}.png`);

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(tmpRaw, Buffer.from(await res.arrayBuffer()));

    toPng(tmpRaw, tmpPng);
    let png = PNG.sync.read(readFileSync(tmpPng));
    const original = { width: png.width, height: png.height };

    let cropped = 0;
    if (!args.noCrop) {
      cropped = Number.isFinite(args.cropBottom) ? args.cropBottom : detectBanner(png);
      if (cropped > 0) png = cropBottom(png, cropped);
    }

    writeFileSync(outPath, PNG.sync.write(png));
    const rec = {
      slug, out: outPath,
      original: `${original.width}x${original.height}`,
      final: `${png.width}x${png.height}`,
      bannerCropped: cropped,
      mobbin_url: item.mobbin_url || null,
    };
    results.push(rec);
    console.log(JSON.stringify(rec));
  } catch (e) {
    console.error(`failed ${slug}: ${e.message}`);
    failed++;
  } finally {
    for (const f of [tmpRaw, tmpPng]) { try { unlinkSync(f); } catch {} }
  }
}

console.log(JSON.stringify({ fetched: results.length, failed, outdir: args.outdir }));
if (failed) process.exit(2);
