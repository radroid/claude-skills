#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './lib/load-config.mjs';
import { readFrames } from './lib/frames.mjs';

const runDirIndex = process.argv.indexOf('--run-dir');
const runDir = runDirIndex >= 0 ? process.argv[runDirIndex + 1] : null;
if (!runDir) {
  console.error('--run-dir required');
  process.exit(3);
}
/* Overrides config.annotate for this invocation only (plumbed from
   timelapse.mjs in both the run flow and stitch-only). */
const noAnnotateFlag = process.argv.includes('--no-annotate');

const config = loadConfig(process.cwd());
const annotate = noAnnotateFlag ? false : config.annotate !== false;

const commitsPath = path.join(runDir, 'commits.json');
if (!fs.existsSync(commitsPath)) {
  console.error(`missing ${commitsPath} — is ${runDir} a timelapse run dir?`);
  process.exit(3);
}
const commits = JSON.parse(fs.readFileSync(commitsPath, 'utf8'));

const gifFps = config.gif?.fps ?? 1.5;
const gifW = config.gif?.width ?? 1200;
const holdSkippedMs = config.gif?.hold_skipped_ms ?? 400;
const crf = config.mp4?.crf ?? 22;
const collapseMode = config.dedup?.collapse_mode ?? 'badge';
const maxHoldMs = config.dedup?.max_hold_ms ?? 3000;

/* gif.fps is the sole pacing base for BOTH outputs. mp4.fps is ignored: the
   MP4 encodes at fixed 30fps CFR so variable-duration holds and speedthrough
   slots survive encoding (at 1.5 output fps they would quantize away). */
const baseMs = Math.round(1000 / gifFps);
const MP4_FPS = 30;
/* speedthrough: fixed 8× multiplier; 40ms floor keeps GIF frame delays ≥ 4
   centiseconds (the GIF container stores delays in cs) */
const SPEEDTHROUGH_DIVISOR = 8;
const SPEEDTHROUGH_FLOOR_MS = 40;
/* banner geometry: commit row 40px, badge row 36px beneath it */
const BANNER_ROW_H = 40;
const BADGE_ROW_H = 36;
const BANNER_BG = '#111111';
const BANNER_FG = '#f5f5f5';

function holdMs(n) {
  return Math.min(maxHoldMs, Math.round(baseMs * (1 + Math.log2(1 + n))));
}

/* Treatment is derived from the ENTRY, never from config.dedup.enabled — a
   dedup-disabled run (A1 fields only) renders v1-like under every mode. */
function classify(entry) {
  if (!entry) return 'skipped'; /* commit never reached the screenshot stage */
  if (entry.decision === 'kept' || entry.decision === 'duplicate' || entry.decision === 'skipped') {
    return entry.decision;
  }
  return entry.capture === 'ok' ? 'kept' : 'skipped';
}

/* Timeline per page: frames.json joined against commits.json order. Returns
   { slots, counts } or { fail } (a kept frame missing on disk is a per-page
   fail — never silently substituted). */
function buildTimeline(pageDir) {
  let entries;
  if (fs.existsSync(path.join(pageDir, 'frames.json'))) {
    entries = readFrames(pageDir);
  } else {
    /* pre-dedup run dir: synthesize entries via the v1 filename matcher
       (zero-padded index + 7-char short hash); banner text still comes from
       commits.json fields */
    const listing = fs.readdirSync(pageDir);
    entries = [];
    for (const c of commits) {
      const prefix = `${String(c.index).padStart(3, '0')}_${c.hash.slice(0, 7)}`;
      const match = listing.find((f) => f.startsWith(prefix) && f.endsWith('.png'));
      if (match) entries.push({ index: c.index, file: match, capture: 'ok' });
    }
  }
  const byIndex = new Map(entries.map((e) => [e.index, e]));

  /* badge N counts duplicates only (captured and boot-skip variants alike);
     skipped entries are never counted into N */
  const collapseCounts = new Map();
  for (const c of commits) {
    const e = byIndex.get(c.index);
    if (e && classify(e) === 'duplicate' && e.collapsed_into != null) {
      collapseCounts.set(e.collapsed_into, (collapseCounts.get(e.collapsed_into) || 0) + 1);
    }
  }

  const placeholder = path.join(pageDir, '000_placeholder.png');
  const keptPngByIndex = new Map();
  const slots = [];
  const counts = { kept: 0, collapsed: 0, skipped: 0 };

  for (const c of commits) {
    const e = byIndex.get(c.index);
    const cls = classify(e);
    if (cls === 'kept') {
      counts.kept += 1;
      const png = e.file ? path.join(pageDir, e.file) : null;
      if (!png || !fs.existsSync(png)) {
        return { fail: `kept frame missing on disk: ${e.file ?? '(no file recorded)'} (commit index ${c.index})` };
      }
      keptPngByIndex.set(c.index, png);
      const n = collapseMode === 'badge' ? collapseCounts.get(c.index) || 0 : 0;
      slots.push({
        kind: 'display',
        index: c.index,
        src: png,
        durationMs: collapseMode === 'badge' ? holdMs(n) : baseMs,
        commit: c,
        badgeN: n,
      });
    } else if (cls === 'duplicate') {
      counts.collapsed += 1;
      if (collapseMode === 'speedthrough') {
        /* displayed frame resolves via collapsed_into, never via the
           duplicate's own file (always null — the PNG was discarded) */
        const png = e.collapsed_into != null ? keptPngByIndex.get(e.collapsed_into) : undefined;
        if (!png) {
          return { fail: `duplicate at commit index ${c.index} collapses into ${e.collapsed_into}, which is not a kept frame with a PNG` };
        }
        slots.push({
          kind: 'display',
          index: c.index,
          src: png,
          durationMs: Math.max(SPEEDTHROUGH_FLOOR_MS, Math.round(baseMs / SPEEDTHROUGH_DIVISOR)),
          commit: c,
          badgeN: 0,
        });
      }
      /* badge: absorbed into the kept frame's N; drop: nothing */
    } else {
      counts.skipped += 1;
      if (collapseMode === 'drop') continue; /* contributes nothing, no placeholder padding */
      if (slots.length) {
        /* visuals unknown: repeat the previous slot's image (it keeps
           whatever annotation it already has — v1 hold mechanics) */
        slots.push({ kind: 'repeat', durationMs: holdSkippedMs });
      } else if (fs.existsSync(placeholder)) {
        /* leading slots before the first displayable frame; never annotated */
        slots.push({ kind: 'placeholder', src: placeholder, durationMs: holdSkippedMs });
      }
    }
  }

  return { slots, counts };
}

/* ---- annotation: Playwright banner PNG + ffmpeg overlay composite ----
   The installed ffmpeg build has no text-rendering filter (no freetype), so
   text is rendered by the already-shipped Chromium and composited with
   `overlay`. Pristine PNGs are never modified (I2) — composites live under
   runDir/stitch-frames/. */

let browser = null;
let bannerPage = null;

async function ensureBannerPage() {
  if (bannerPage) return bannerPage;
  try {
    const { chromium } = await import('playwright');
    browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({
      viewport: { width: 200, height: BANNER_ROW_H },
      deviceScaleFactor: 1,
    });
    bannerPage = await context.newPage();
    return bannerPage;
  } catch (e) {
    /* never silently emit unannotated videos */
    console.error(
      `annotation requires Playwright Chromium and it failed to launch: ${String(e?.message || e)}`,
    );
    console.error('install it with: npx playwright install chromium');
    process.exit(3);
  }
}

function escHtml(v) {
  return String(v ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function bannerHtml(width, commit, badgeN) {
  const line1 = `${commit.hash.slice(0, 7)} | ${String(commit.date ?? '').slice(0, 10)} | ${commit.subject ?? ''}`;
  const row = (text, h) =>
    `<div style="height:${h}px;line-height:${h}px;padding-left:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escHtml(text)}</div>`;
  const badge = badgeN > 0 ? row(`×${badgeN} commits · no visual change`, BADGE_ROW_H) : '';
  return `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0"><div style="width:${width}px;background:${BANNER_BG};color:${BANNER_FG};font:12px ui-monospace, Menlo, monospace;">${row(line1, BANNER_ROW_H)}${badge}</div></body></html>`;
}

const widthCache = new Map();
function frameWidth(png) {
  if (widthCache.has(png)) return widthCache.get(png);
  const r = spawnSync(
    'ffprobe',
    ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', png],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || r.error) {
    throw new Error(`ffprobe failed on ${png}: ${r.error?.message || r.stderr || `exit ${r.status}`}`);
  }
  const w = parseInt(r.stdout.trim().split(',')[0], 10);
  if (!Number.isInteger(w) || w <= 0) throw new Error(`ffprobe returned no width for ${png}`);
  widthCache.set(png, w);
  return w;
}

function compositeBanner(framePng, bannerPng, outPath) {
  const r = spawnSync(
    'ffmpeg',
    ['-y', '-v', 'error', '-i', framePng, '-i', bannerPng, '-filter_complex', '[0][1]overlay=x=0:y=main_h-overlay_h', outPath],
    { encoding: 'utf8' },
  );
  if (r.status !== 0 || r.error) {
    throw new Error(
      `overlay composite failed for ${path.basename(framePng)}: ${r.error?.message || r.stderr || `ffmpeg exited ${r.status}`}`,
    );
  }
}

async function annotateSlots(slots, workDir) {
  for (const s of slots) {
    if (s.kind !== 'display') continue;
    const page = await ensureBannerPage();
    fs.mkdirSync(workDir, { recursive: true });
    const nnn = String(s.index).padStart(3, '0');
    const width = frameWidth(s.src);
    const bannerPath = path.join(workDir, `${nnn}_banner.png`);
    await page.setViewportSize({ width, height: s.badgeN > 0 ? BANNER_ROW_H + BADGE_ROW_H : BANNER_ROW_H });
    await page.setContent(bannerHtml(width, s.commit, s.badgeN));
    await page.screenshot({ path: bannerPath });
    const outPath = path.join(workDir, `${nnn}_annotated.png`);
    compositeBanner(s.src, bannerPath, outPath);
    s.image = outPath;
  }
}

async function main() {
  /* workspace lifecycle: removed at the start of EVERY invocation; recreated
     per page only when a banner is actually composited (annotate: false
     leaves no stitch-frames dir at all) */
  const stitchFramesRoot = path.join(runDir, 'stitch-frames');
  fs.rmSync(stitchFramesRoot, { recursive: true, force: true });

  const results = [];
  const pageDirNames = fs
    .readdirSync(runDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('page-'))
    .map((d) => d.name)
    .sort();

  for (const dirName of pageDirNames) {
    const pageName = dirName.replace(/^page-/, '');
    const pageDir = path.join(runDir, dirName);

    const { slots, counts, fail } = buildTimeline(pageDir);
    if (fail) {
      results.push({ page: pageName, status: 'fail', stage: 'stitch', error: fail });
      continue;
    }
    if (!slots.length) {
      results.push({ page: pageName, status: 'no_frames' });
      continue;
    }

    try {
      if (annotate) {
        await annotateSlots(slots, path.join(stitchFramesRoot, dirName));
      }
    } catch (e) {
      results.push({ page: pageName, status: 'fail', stage: 'annotate', error: String(e?.message || e) });
      continue;
    }

    /* resolve final images; repeats reuse the previous slot's image */
    let prevImage = null;
    for (const s of slots) {
      if (s.kind === 'repeat') s.image = prevImage;
      else s.image = s.image || s.src;
      prevImage = s.image;
    }

    const lines = [];
    for (const s of slots) {
      lines.push(`file '${s.image}'`);
      lines.push(`duration ${(s.durationMs / 1000).toFixed(3)}`);
    }
    /* ffmpeg concat quirk: final file line repeated without a duration */
    lines.push(`file '${slots[slots.length - 1].image}'`);
    const framesPath = path.join(runDir, `frames_${pageName}.txt`);
    fs.writeFileSync(framesPath, lines.join('\n'));

    const mp4Out = path.join(pageDir, `${pageName}.mp4`);
    const gifOut = path.join(pageDir, `${pageName}.gif`);
    const videoDurationMs = slots.reduce((sum, s) => sum + s.durationMs, 0);

    /* The concat demuxer gives the duration-less trailing file line the LAST
       `duration` directive (probed on 8.1.1), which would pad the MP4 by a
       whole extra hold — bound the encode to the timeline sum plus one output
       frame so the trailing repeat only flushes the final directive. */
    const mp4DurationSec = ((videoDurationMs + 1000 / MP4_FPS) / 1000).toFixed(3);
    const mp4Result = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        framesPath,
        '-vf',
        `scale=${gifW}:-2`,
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-r',
        String(MP4_FPS),
        '-crf',
        String(crf),
        '-t',
        mp4DurationSec,
        mp4Out,
      ],
      { encoding: 'utf8' },
    );
    if (mp4Result.status !== 0 || mp4Result.error) {
      results.push({
        page: pageName,
        status: 'fail',
        stage: 'mp4',
        error: mp4Result.error?.message || mp4Result.stderr || `ffmpeg exited ${mp4Result.status}`,
      });
      continue;
    }

    /* no fps= prefilter: it resamples and would destroy variable holds and
       speedthrough's fast slots */
    const gifResult = spawnSync(
      'ffmpeg',
      [
        '-y',
        '-f',
        'concat',
        '-safe',
        '0',
        '-i',
        framesPath,
        '-vf',
        `scale=${gifW}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
        '-loop',
        '0',
        gifOut,
      ],
      { encoding: 'utf8' },
    );
    if (gifResult.status !== 0 || gifResult.error) {
      results.push({
        page: pageName,
        status: 'fail',
        stage: 'gif',
        error: gifResult.error?.message || gifResult.stderr || `ffmpeg exited ${gifResult.status}`,
      });
      continue;
    }

    results.push({
      page: pageName,
      status: 'ok',
      gif: path.relative(runDir, gifOut),
      mp4: path.relative(runDir, mp4Out),
      thumb: path.relative(runDir, slots[slots.length - 1].image),
      frame_count: slots.length,
      mode: collapseMode,
      annotated: annotate,
      kept_frames: counts.kept,
      collapsed_commits: counts.collapsed,
      skipped_commits: counts.skipped,
      video_duration_ms: videoDurationMs,
      longest_hold_ms: Math.max(...slots.map((s) => s.durationMs)),
    });
  }

  if (browser) await browser.close();
  /* stdout is EXACTLY one JSON array — the run flow parses it */
  console.log(JSON.stringify(results));
}

main().catch((e) => {
  console.error(e.message);
  process.exit(3);
});
