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

async function injectOverlay(page, meta, annotate) {
  if (!annotate) return true;
  try {
    await page.addStyleTag({ content: DISABLE_ANIM_CSS });
    const text = `${meta.hash.slice(0, 7)} | ${meta.date} | ${meta.subject}`.replace(/'/g, "\\'");
    await page.addScriptTag({
      content: `
        (function() {
          var bar = document.createElement('div');
          bar.id = '__timelapse_overlay__';
          bar.textContent = '${text}';
          bar.style.cssText = 'position:fixed;bottom:0;left:0;right:0;padding:8px 12px;background:rgba(0,0,0,0.75);color:#fff;font:12px monospace;z-index:2147483647';
          if (document.body) document.body.appendChild(bar);
        })();
      `,
    });
    return true;
  } catch {
    return false;
  }
}

async function capturePage(browser, opts) {
  const { url, pageCfg, config, meta, outPath } = opts;
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
      await page.waitForTimeout(config.settle_ms || 500);
      await injectOverlay(page, meta, config.annotate);
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
  const safeSubj = args.subject.slice(0, 24).replace(/\W+/g, '_');
  const fname = `${idx}_${short}${config.annotate ? '' : `_${safeSubj}`}.png`;
  const outPath = path.join(dir, fname);
  results[pageCfg.name] = await capturePage(browser, {
    url,
    pageCfg,
    config,
    meta: { hash: args.hash, date: args.date, subject: args.subject },
    outPath,
  });
}

await browser.close();
console.log(JSON.stringify(results));
