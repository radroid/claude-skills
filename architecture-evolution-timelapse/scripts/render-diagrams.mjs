#!/usr/bin/env node
// `render` CLI (spec §2.2, §2.6–2.7): B1 model.json → fixed-template Mermaid
// `.mmd` per level (written BEFORE any browser work) → fixed-canvas PNG via
// the local mermaid browser bundle executed inside Playwright Chromium — no
// CLI wrapper, no second browser stack, no CDN (I7). Same model + same config ⇒
// byte-identical .mmd AND pixel-identical PNG on the same machine (I1; the
// handDrawnSeed/deterministicIDSeed pins below are load-bearing). Render
// failures degrade down the placeholder ladder and never crash the run.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { loadConfig, DEFAULTS } from './lib/load-config.mjs';
import { modelToMermaidSource, TEMPLATE_VERSION } from './lib/model-to-mermaid.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
// Resolved relative to this script's own directory — offline by construction.
const MERMAID_BUNDLE = path.join(scriptDir, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');

const LEVEL_ORDER = ['context', 'container', 'component'];
const RENDER_TIMEOUT_MS = 30000;
const SETTLE_MS = 200;

const USAGE =
  'usage: arch-timelapse.sh render [--model <path>] [--out <dir>] [--levels a,b,c] [--config <path>]';

class PreflightError extends Error {}

// Byte-pattern of frontend-evolution-timelapse/scripts/screenshot.mjs:7-14
// (I6: duplicated, not imported).
const DISABLE_ANIM_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

// Full-viewport white stage, flex-centered (§2.7 step 1).
const STAGE_HTML = `<!doctype html><html><head><meta charset="utf-8"><style>
html, body { margin: 0; width: 100%; height: 100%; background: #ffffff; }
body { display: flex; align-items: center; justify-content: center; }
#stage svg { display: block; }
${DISABLE_ANIM_CSS}</style></head><body><div id="stage"></div></body></html>`;

function cmpBytes(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function withTimeout(promise, ms, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/**
 * In-page mermaid render (§2.6–2.7 happy path), one attempt: fresh context +
 * page, inject the local bundle, initialize with the FROZEN options, render,
 * scale the SVG into the fixed canvas, settle, viewport screenshot.
 */
async function renderLevelOnce(browser, source, render, pngPath, forceFail) {
  const context = await browser.newContext({
    viewport: { width: render.width, height: render.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.setContent(STAGE_HTML);
    await page.addScriptTag({ path: MERMAID_BUNDLE });
    await withTimeout(
      page.evaluate(
        async ({ source, theme, margin, maxScale, width, height, forceFail }) => {
          await document.fonts.ready;
          // Frozen initialize options (§2.6) — any change is a
          // template-version bump. handDrawnSeed: mermaid 11 routes shape
          // paths through roughjs even in classic look; the default seed 0
          // is random per render, breaking I1.
          window.mermaid.initialize({
            startOnLoad: false,
            theme,
            look: 'classic',
            htmlLabels: false,
            securityLevel: 'strict',
            deterministicIds: true,
            deterministicIDSeed: 'arch-timelapse',
            handDrawnSeed: 7,
            flowchart: { useMaxWidth: false },
          });
          if (forceFail) throw new Error('forced render failure (test hook)');
          const { svg } = await window.mermaid.render('m0', source);
          const stage = document.getElementById('stage');
          // Safe by construction (§2.6): the SVG is mermaid's own output
          // under securityLevel 'strict', every label was entity-escaped
          // before templating, and this page is origin-less with no cookies,
          // storage, or network access.
          stage.innerHTML = svg;
          const el = stage.querySelector('svg');
          const vb = el.viewBox.baseVal;
          const scale = Math.min(
            (width - 2 * margin) / vb.width,
            (height - 2 * margin) / vb.height,
            maxScale
          );
          el.setAttribute('width', String(vb.width * scale));
          el.setAttribute('height', String(vb.height * scale));
        },
        {
          source,
          theme: render.theme,
          margin: render.margin,
          maxScale: render.max_scale,
          width: render.width,
          height: render.height,
          forceFail,
        }
      ),
      RENDER_TIMEOUT_MS,
      `render timed out after ${RENDER_TIMEOUT_MS} ms`
    );
    await page.waitForTimeout(SETTLE_MS);
    await page.screenshot({ path: pngPath });
  } finally {
    await context.close();
  }
}

/**
 * Placeholder frame in the SAME Chromium (§2.7 render-error rung): fixed
 * canvas, light-grey background, level name + failure notice + first line of
 * the error inserted as text content, never markup (pattern of
 * frontend-evolution-timelapse/scripts/screenshot.mjs:104-119).
 */
async function placeholderPng(browser, levelName, error, render, pngPath) {
  const context = await browser.newContext({
    viewport: { width: render.width, height: render.height },
    deviceScaleFactor: 1,
  });
  try {
    const page = await context.newPage();
    await page.setContent(
      `<!doctype html><html><body style="background:#f4f4f5;font:24px sans-serif;padding:40px;color:#666"><div id="title"></div><div id="notice">diagram render failed</div><small id="error"></small></body></html>`
    );
    await page.evaluate(
      ({ title, firstLine }) => {
        document.getElementById('title').textContent = title;
        document.getElementById('error').textContent = firstLine;
      },
      { title: levelName, firstLine: String(error?.message ?? error).split('\n')[0] }
    );
    await page.screenshot({ path: pngPath });
  } finally {
    await context.close();
  }
}

/** Chromium-missing rung: single-frame solid-color PNG via system ffmpeg. */
function ffmpegPlaceholder(render, pngPath) {
  const r = spawnSync('ffmpeg', [
    '-y',
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    `color=c=0xf4f4f5:s=${render.width}x${render.height}`,
    '-frames:v',
    '1',
    pngPath,
  ]);
  return !r.error && r.status === 0;
}

function readModel(modelPath) {
  let raw;
  try {
    raw = fs.readFileSync(modelPath, 'utf8');
  } catch {
    throw new PreflightError(`model not found: ${modelPath}`);
  }
  let model;
  try {
    model = JSON.parse(raw);
  } catch {
    throw new PreflightError(`model is not valid JSON: ${modelPath}`);
  }
  if (model?.schema_version !== 1) {
    throw new PreflightError(
      `unsupported model schema_version ${JSON.stringify(model?.schema_version)} (expected 1): ${modelPath}`
    );
  }
  return model;
}

/**
 * renderModel(modelPath, outDir, levelNames, config) -> perLevelStatusMap
 * (frozen seam for B3). levelNames null ⇒ every level present in the model,
 * fixed order context, container, component. Stateless and idempotent:
 * outputs are overwritten on re-run.
 */
export async function renderModel(modelPath, outDir, levelNames, config) {
  const model = readModel(modelPath);
  const render = { ...DEFAULTS.render, ...(config?.render ?? {}) };
  try {
    fs.mkdirSync(outDir, { recursive: true });
  } catch (err) {
    throw new PreflightError(`cannot create --out ${outDir}: ${err.message}`);
  }

  // Requested levels, processed in fixed order; names the model (or the
  // schema) does not know sort after the known ones and come out `skipped`.
  const requested =
    levelNames === null || levelNames === undefined
      ? LEVEL_ORDER.filter((l) => l in model.levels)
      : [
          ...LEVEL_ORDER.filter((l) => levelNames.includes(l)),
          ...[...new Set(levelNames.filter((l) => !LEVEL_ORDER.includes(l)))].sort(cmpBytes),
        ];

  const statuses = {};
  const toRaster = [];
  for (const level of requested) {
    if (!(level in model.levels)) {
      statuses[level] = { status: 'skipped', reason: 'level-absent', files: [] };
      continue;
    }
    // .mmd is written before any browser work (§2.2), so B5's byte-identical
    // assertion holds even on a machine with no Chromium.
    const source = modelToMermaidSource(model, level, config);
    try {
      fs.writeFileSync(path.join(outDir, `${level}.mmd`), source);
    } catch (err) {
      throw new PreflightError(`cannot write to --out ${outDir}: ${err.message}`);
    }
    statuses[level] = { status: 'ok', files: [`${level}.mmd`] };
    toRaster.push({ level, source });
  }
  if (toRaster.length === 0) return statuses;

  const forceFail = new Set(
    (process.env.ARCH_TIMELAPSE_FORCE_RENDER_FAIL ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '')
  );

  let browser = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    // Chromium-missing rung: ffmpeg lavfi placeholder for EVERY requested
    // level; one actionable stderr line; exit stays 0.
    console.error(
      'render: Playwright Chromium unavailable — writing placeholder frames; run `npx playwright install chromium` for real diagrams'
    );
    let ffmpegOk = true;
    for (const { level } of toRaster) {
      const pngPath = path.join(outDir, `${level}.png`);
      if (ffmpegOk && ffmpegPlaceholder(render, pngPath)) {
        statuses[level] = {
          status: 'placeholder',
          reason: 'chromium-missing',
          files: [`${level}.mmd`, `${level}.png`],
        };
      } else {
        ffmpegOk = false;
        statuses[level] = {
          status: 'failed',
          reason: 'chromium-and-ffmpeg-missing',
          files: [`${level}.mmd`],
        };
      }
    }
    if (!ffmpegOk) {
      console.error(
        'render: ffmpeg unavailable too — no PNG can be produced; install ffmpeg or run `npx playwright install chromium`'
      );
    }
    return statuses;
  }

  try {
    for (const { level, source } of toRaster) {
      const pngPath = path.join(outDir, `${level}.png`);
      let lastErr = null;
      let done = false;
      // Retry once (§2.7); on the second failure fall to the placeholder.
      for (let attempt = 0; attempt < 2 && !done; attempt++) {
        try {
          await renderLevelOnce(browser, source, render, pngPath, forceFail.has(level));
          done = true;
        } catch (err) {
          lastErr = err;
        }
      }
      if (done) {
        statuses[level] = { status: 'ok', files: [`${level}.mmd`, `${level}.png`] };
        continue;
      }
      try {
        await placeholderPng(browser, level, lastErr, render, pngPath);
        statuses[level] = {
          status: 'placeholder',
          reason: 'render-error',
          files: [`${level}.mmd`, `${level}.png`],
        };
      } catch {
        statuses[level] = { status: 'failed', reason: 'render-error', files: [`${level}.mmd`] };
      }
    }
  } finally {
    await browser.close();
  }
  return statuses;
}

// ---------------------------------------------------------------------------
// CLI (§2.2)
// ---------------------------------------------------------------------------

function usageError(msg) {
  console.error(`render: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { model: null, out: null, config: null, levels: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--model' || a === '--out' || a === '--config' || a === '--levels') {
      const v = argv[++i];
      if (v === undefined) usageError(`${a} requires a value`);
      o[a.slice(2)] = v;
    } else {
      usageError(`unknown flag: ${a}`);
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);
  const cwd = process.cwd();

  const config = loadConfig(cwd, args.config ? path.resolve(args.config) : null);

  // Default mirrors B1's extract default out (honoring output_dir, as B1's
  // execution notes do): <cwd>/<output_dir>/model/model.json.
  const modelPath = path.resolve(
    args.model ?? path.join(cwd, config.output_dir ?? '.arch-timelapse', 'model', 'model.json')
  );
  const outDir = path.resolve(args.out ?? path.dirname(modelPath));

  let levels = null;
  if (args.levels !== null) {
    levels = args.levels
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (levels.length === 0) usageError('--levels requires at least one level');
  }

  let statuses;
  try {
    statuses = await renderModel(modelPath, outDir, levels, config);
  } catch (err) {
    if (err instanceof PreflightError) {
      console.error(`render: ${err.message}`);
      process.exit(3);
    }
    throw err;
  }

  const failed = Object.values(statuses).some((s) => s.status === 'failed');
  console.log(
    JSON.stringify({
      ok: !failed,
      out: outDir,
      template_version: TEMPLATE_VERSION,
      levels: statuses,
    })
  );
  process.exit(failed ? 4 : 0);
}

// Run the CLI only when invoked directly (renderModel stays importable, B3 seam).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`render: ${err.message}`);
    process.exit(3);
  });
}
