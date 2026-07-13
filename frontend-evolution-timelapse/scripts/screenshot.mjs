#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { loadConfig } from './lib/load-config.mjs';

const DISABLE_ANIM_CSS = `
*, *::before, *::after {
  animation-duration: 0s !important;
  animation-delay: 0s !important;
  transition-duration: 0s !important;
  transition-delay: 0s !important;
}
`;

function detectFramework(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return 'unknown';
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  if (deps.next) return 'next';
  if (deps.vite || deps['@vitejs/plugin-react']) return 'vite';
  if (deps.astro) return 'astro';
  return 'unknown';
}

/* One fixed flat colour, identical across commits, pages, and runs — a mask
   that varied would itself register as change between frames. */
const MASK_COLOR = '#7f7f7f';

async function applyMasks(page, selectors) {
  await page.evaluate(
    ({ selectors: sels, color }) => {
      for (const sel of sels) {
        let matches;
        try {
          matches = document.querySelectorAll(sel);
        } catch {
          throw new Error(`invalid ignore_selectors entry: ${sel}`);
        }
        for (const el of matches) {
          const r = el.getBoundingClientRect();
          if (r.width <= 0 || r.height <= 0) continue;
          /* Cover, never remove: an out-of-flow rectangle over the bounding
             box cannot reflow surrounding content. */
          const mask = document.createElement('div');
          const set = (p, v) => mask.style.setProperty(p, v, 'important');
          set('position', 'fixed');
          set('left', `${r.left}px`);
          set('top', `${r.top}px`);
          set('width', `${r.width}px`);
          set('height', `${r.height}px`);
          set('background', color);
          set('z-index', '2147483647');
          set('margin', '0');
          set('padding', '0');
          set('border', 'none');
          set('display', 'block');
          set('pointer-events', 'none');
          document.documentElement.appendChild(mask);
        }
      }
    },
    { selectors, color: MASK_COLOR },
  );
}

/** Upsert this commit's entry in page-<name>/frames.json (keyed by index,
 *  kept sorted), written atomically via temp-file-plus-rename. */
function upsertFrameEntry(pageDir, entry) {
  const framesPath = path.join(pageDir, 'frames.json');
  let frames = [];
  if (fs.existsSync(framesPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(framesPath, 'utf8'));
      if (Array.isArray(parsed)) frames = parsed;
    } catch {
      /* unreadable file — rebuild from this entry on */
    }
  }
  const at = frames.findIndex((f) => f.index === entry.index);
  if (at >= 0) frames[at] = entry;
  else frames.push(entry);
  frames.sort((a, b) => a.index - b.index);
  const tmp = path.join(pageDir, 'frames.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(frames, null, 2));
  fs.renameSync(tmp, framesPath);
}

async function capturePage(browser, opts) {
  const { url, pageCfg, config, outPath } = opts;
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const context = await browser.newContext({
      viewport: {
        width: config.viewport.width,
        height: config.viewport.height,
      },
    });
    const page = await context.newPage();
    try {
      const res = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
      const selectors = pageCfg.wait_for.split(',').map((s) => s.trim());
      let found = false;
      for (const sel of selectors) {
        try {
          await page.waitForSelector(sel, { timeout: 10000 });
          found = true;
          break;
        } catch {
          /* try next */
        }
      }
      if (!found) {
        await context.close();
        return { status: 'no_route' };
      }
      if (res && res.status() >= 400) {
        await context.close();
        return { status: 'no_route', http: res.status() };
      }
      if (config.dedup.enabled) {
        /* Pixel comparison needs frozen pixels — a failed freeze is loud. */
        await page.addStyleTag({ content: DISABLE_ANIM_CSS });
      } else {
        /* I5: with dedup disabled, capture exactly what v1 captured — v1
           swallowed injection failures (strict CSP), so degrade to a warning. */
        try {
          await page.addStyleTag({ content: DISABLE_ANIM_CSS });
        } catch (e) {
          console.error(
            `warning: animation-freeze CSS injection failed (${String(e?.message || e)}); capturing without frozen animations`,
          );
        }
      }
      await page.waitForTimeout(config.settle_ms || 500);
      if (config.dedup.enabled && config.dedup.ignore_selectors.length > 0) {
        await applyMasks(page, config.dedup.ignore_selectors);
      }
      await page.screenshot({
        path: outPath,
        fullPage: config.full_page === true,
      });
      await context.close();
      return { status: 'ok' };
    } catch (e) {
      lastErr = e;
      await context.close();
      const msg = String(e.message || e);
      const transient =
        msg.includes('Timeout') ||
        msg.includes('net::ERR') ||
        msg.includes('Target closed') ||
        msg.includes('crashed');
      if (!transient || attempt >= 2) break;
    }
  }
  return { status: 'fail', error: String(lastErr?.message || lastErr) };
}

async function placeholder(runDir, pageName, config) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: config.viewport.width, height: config.viewport.height },
  });
  const page = await context.newPage();
  await page.setContent(
    `<html><body style="background:#f4f4f5;font:24px sans-serif;padding:40px;color:#666">${pageName}<br><small>awaiting first frame</small></body></html>`,
  );
  await page.addStyleTag({ content: DISABLE_ANIM_CSS });
  const dir = path.join(runDir, `page-${pageName}`);
  fs.mkdirSync(dir, { recursive: true });
  const out = path.join(dir, '000_placeholder.png');
  await page.screenshot({ path: out });
  await browser.close();
  return out;
}

function parseArgv() {
  const o = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--run-dir') o.runDir = process.argv[++i];
    else if (a === '--worktree') o.worktree = process.argv[++i];
    else if (a === '--index') o.index = parseInt(process.argv[++i], 10);
    else if (a === '--hash') o.hash = process.argv[++i];
    else if (a === '--subject') o.subject = process.argv[++i];
    else if (a === '--date') o.date = process.argv[++i];
    else if (a === '--base-url') o.baseUrl = process.argv[++i] || '';
    else if (a === '--placeholders-only') o.placeholdersOnly = true;
  }
  return o;
}

const args = parseArgv();
const repoRoot = process.cwd();
const config = loadConfig(repoRoot);

if (args.placeholdersOnly) {
  /* Pre-validate ignore_selectors before any commit work: an invalid entry
     would otherwise fail every page capture deterministically, burning the
     whole N-commit run (checkout+install+serve per commit) for a typo. */
  if (config.dedup.enabled && config.dedup.ignore_selectors.length > 0) {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    for (const sel of config.dedup.ignore_selectors) {
      const valid = await page.evaluate((s) => {
        try {
          document.querySelector(s);
          return true;
        } catch {
          return false;
        }
      }, sel);
      if (!valid) {
        await browser.close();
        console.error(`invalid ignore_selectors entry: ${sel}`);
        process.exit(3);
      }
    }
    await browser.close();
  }
  for (const p of config.pages) {
    await placeholder(args.runDir, p.name, config);
  }
  process.exit(0);
}

const projectDir = path.join(args.worktree || repoRoot, config.project_root || '.');
let base = (args.baseUrl || config.base_url || '').replace(/\/$/, '');
if (base && !base.startsWith('/')) base = `/${base}`;

const browser = await chromium.launch({ headless: true });
const readyBase = config.ready.url.replace(/\/$/, '');
const results = {};

for (const pageCfg of config.pages) {
  const pagePath = pageCfg.path.startsWith('/') ? pageCfg.path : `/${pageCfg.path}`;
  const url = `${readyBase}${base === '/' ? '' : base}${pagePath}`.replace(/([^:]\/)\/+/g, '$1');
  const dir = path.join(args.runDir, `page-${pageCfg.name}`);
  fs.mkdirSync(dir, { recursive: true });
  const idx = String(args.index).padStart(3, '0');
  const short = args.hash.slice(0, 7);
  const fname = `${idx}_${short}.png`;
  const outPath = path.join(dir, fname);
  const result = await capturePage(browser, { url, pageCfg, config, outPath });
  results[pageCfg.name] = result;
  const entry = {
    index: args.index,
    hash: args.hash,
    subject: args.subject,
    date: args.date,
    file: result.status === 'ok' ? fname : null,
    capture: result.status,
  };
  if (result.status === 'fail') entry.error = result.error;
  upsertFrameEntry(dir, entry);
}

await browser.close();
console.log(JSON.stringify(results));
