#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { loadConfig } from './lib/load-config.mjs';
import { DEFAULT_ENV_SYNC_FILES, loadEnvForRun } from './lib/env-load.mjs';
import { detectPortTool, pidOnPort } from './lib/port-owner.mjs';
import { estimateRun } from './lib/estimate.mjs';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function need(bin) {
  return spawnSync('which', [bin], { encoding: 'utf8' }).status === 0;
}

function freeGb(dir) {
  const r = spawnSync('df', ['-k', dir], { encoding: 'utf8' });
  if (r.status !== 0) return 999;
  const line = r.stdout.trim().split('\n')[1];
  const avail = parseInt(line.split(/\s+/)[3], 10);
  return avail / 1024 / 1024;
}

const repoRoot = process.cwd();
const trust = process.argv.includes('--i-trust-this-repo');
const dryRun = process.argv.includes('--dry-run');

let config;
try {
  config = loadConfig(repoRoot);
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }));
  process.exit(3);
}

const errors = [];
if (!need('git')) errors.push('git not found');
if (!need('ffmpeg')) errors.push('ffmpeg not found');
if (!need('node')) errors.push('node not found');

const portTool = detectPortTool();
if (!portTool) errors.push('neither lsof nor ss available for port checks');

const head = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).stdout.trim();

let commitsPayload;
if (process.argv.includes('--commits-file')) {
  const f = process.argv[process.argv.indexOf('--commits-file') + 1];
  commitsPayload = JSON.parse(fs.readFileSync(f, 'utf8'));
} else {
  const r = spawnSync(process.execPath, [path.join(scriptDir, 'list-commits.mjs'), '--dry-run'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  commitsPayload = JSON.parse(r.stdout);
}

const commits = commitsPayload.commits || commitsPayload;
const hasHistorical = commits.some((c) => c.hash !== head);
if (hasHistorical && !trust && !dryRun) {
  errors.push(
    'commit plan includes non-HEAD commits; pass --i-trust-this-repo to run historical checkouts',
  );
}

const portOwner = pidOnPort(config.port);
if (portOwner) errors.push(`port ${config.port} in use by pid ${portOwner}`);

const minGb =
  config.capture_mode === 'production'
    ? Math.max(20, commits.length * 1.5)
    : config.min_free_gb || 5;
const free = freeGb(repoRoot);
if (free < minGb) errors.push(`disk free ${free.toFixed(1)}GB < required ${minGb}GB`);

const playwrightMarker = path.join(scriptDir, 'node_modules', 'playwright');
if (!fs.existsSync(playwrightMarker)) {
  errors.push(
    'playwright not installed in skill scripts/; run: cd scripts && npm ci && npx playwright install chromium',
  );
}

const syncNames = config.env_sync_files ?? DEFAULT_ENV_SYNC_FILES;
const hasLocalEnv = syncNames.some((name) => {
  const pr = config.project_root && config.project_root !== '.' ? config.project_root : '';
  return (
    fs.existsSync(path.join(repoRoot, name)) ||
    (pr && fs.existsSync(path.join(repoRoot, pr, name)))
  );
});
if (!hasLocalEnv) {
  errors.push(
    `no env files found in checkout (looked for ${syncNames.join(', ')}). ` +
      'Create .env.local with your app secrets before running timelapse.',
  );
}

if (config.required_env?.length) {
  try {
    loadEnvForRun({ repoRoot, worktreeRoot: null, config, trustRepo: false });
    const missing = config.required_env.filter((k) => !process.env[k]);
    if (missing.length) {
      errors.push(`required_env missing after load: ${missing.join(', ')}`);
    }
  } catch (e) {
    errors.push(e.message);
  }
}

if (errors.length) {
  console.error(JSON.stringify({ ok: false, errors }, null, 2));
  process.exit(3);
}

const estimate = estimateRun({ repoRoot, commits, config });
console.log(
  JSON.stringify({
    ok: true,
    commits: commits.length,
    pages: config.pages.length,
    estimate_minutes: estimate.estimate_minutes,
    estimate,
    port_tool: portTool,
    free_gb: free,
    has_historical: hasHistorical,
  }),
);
