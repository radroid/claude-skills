#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './lib/load-config.mjs';
import { computeConfigHash } from './lib/config-hash.mjs';
import { canonicalStringify, sha256Hex } from './lib/canonical-json.mjs';
import { acquireLock, releaseLock } from './lib/lock.mjs';
import { pruneCache } from './lib/install-matrix.mjs';
import { estimateRun } from './lib/estimate.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const o = {
    cmd: argv[2] || 'run',
    from: null,
    to: null,
    only: null,
    runId: null,
    dryRun: false,
    verbose: false,
    maxCommits: null,
    fresh: false,
    keepWorktree: false,
    nonInteractive: false,
    trust: false,
    force: false,
    noAnnotate: false,
    calibrate: false,
  };
  for (let i = 3; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') o.from = argv[++i];
    else if (a === '--to') o.to = argv[++i];
    else if (a === '--only') o.only = argv[++i].split(',');
    else if (a === '--run-id') o.runId = argv[++i];
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--verbose') o.verbose = true;
    else if (a === '--max-commits') o.maxCommits = parseInt(argv[++i], 10);
    else if (a === '--fresh') o.fresh = true;
    else if (a === '--keep-worktree') o.keepWorktree = true;
    else if (a === '--non-interactive') o.nonInteractive = true;
    else if (a === '--i-trust-this-repo') o.trust = true;
    else if (a === '--force') o.force = true;
    else if (a === '--no-annotate') o.noAnnotate = true;
    else if (a === '--calibrate') o.calibrate = true;
  }
  return o;
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return (r.stdout || '').trim();
}

function repoHash8(repoRoot) {
  return createHash('sha256').update(path.resolve(repoRoot)).digest('hex').slice(0, 8);
}

function worktreePath(repoRoot, config, runId) {
  if (config.worktree_mode === 'in-repo') {
    return path.join(repoRoot, config.output_dir, 'worktrees', runId);
  }
  const parent = path.dirname(repoRoot);
  const base = path.join(parent, '.timelapse-worktrees', repoHash8(repoRoot), runId);
  return base;
}

function findLatestIncompleteRun(outputDir) {
  if (!fs.existsSync(outputDir)) return null;
  const runs = fs
    .readdirSync(outputDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name !== '.cache' && !d.name.endsWith('.lock.d'))
    .map((d) => d.name)
    .sort()
    .reverse();
  for (const id of runs) {
    const prog = path.join(outputDir, id, 'progress.json');
    if (!fs.existsSync(prog)) return id;
    const p = JSON.parse(fs.readFileSync(prog, 'utf8'));
    const commits = JSON.parse(fs.readFileSync(path.join(outputDir, id, 'commits.json'), 'utf8'));
    const done = Object.keys(p.commits || {}).length;
    if (done < commits.length) return id;
  }
  return null;
}

function writeProgress(runDir, data) {
  const tmp = path.join(runDir, 'progress.json.tmp');
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, path.join(runDir, 'progress.json'));
}

function emitSummaryLine(i, n, hash, result) {
  const st = result.status || 'fail';
  const dur = ((result.duration_ms || 0) / 1000).toFixed(1);
  const lb = result.log_bytes || 0;
  const tok = result.log_tokens_est || Math.ceil(lb / 4);
  if (!process.argv.includes('--verbose')) {
    console.log(`[${i}/${n}] ${hash.slice(0, 7)} status=${st} dur=${dur}s log_bytes=${lb} ~tok=${tok}`);
  }
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function calibrateHead({ repoRoot, config, outputDir, runId, trust }) {
  const head = git(['rev-parse', 'HEAD'], repoRoot);
  const subject = git(['log', '-1', '--format=%s', head], repoRoot);
  const date = git(['log', '-1', '--format=%aI', head], repoRoot);
  const calibrationRunId = `${runId}-calibration`;
  const runDir = path.join(outputDir, calibrationRunId);
  const wtPath = worktreePath(repoRoot, config, calibrationRunId);
  fs.mkdirSync(runDir, { recursive: true });
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });

  if (!fs.existsSync(path.join(wtPath, '.git'))) {
    git(['worktree', 'add', '--detach', wtPath, head], repoRoot);
  }

  spawnSync(
    process.execPath,
    [
      path.join(scriptDir, 'screenshot.mjs'),
      '--run-dir',
      runDir,
      '--worktree',
      wtPath,
      '--placeholders-only',
    ],
    { cwd: repoRoot },
  );

  const rc = spawnSync(
    process.execPath,
    [
      path.join(scriptDir, 'run-commit.mjs'),
      '--run-dir',
      runDir,
      '--worktree',
      wtPath,
      '--index',
      '1',
      '--hash',
      head,
      '--subject',
      subject,
      '--date',
      date,
      '--trust',
      trust ? '1' : '0',
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );

  let result;
  try {
    result = JSON.parse(rc.stdout || '{}');
  } catch (e) {
    throw new Error(`calibration returned invalid JSON: ${e.message}`);
  }

  try {
    git(['worktree', 'remove', '--force', wtPath], repoRoot);
  } catch {
    fs.rmSync(wtPath, { recursive: true, force: true });
  }

  const pageCount = Math.max(1, config.pages?.length || 1);
  const installSec = Math.max(1, Math.ceil((result.stages?.install_ms ?? 38000) / 1000));
  const readySec = Math.max(1, Math.ceil((result.stages?.ready_ms ?? 7000) / 1000));
  const screenshotPerPageSec = Math.max(
    1,
    Math.ceil(((result.stages?.screenshot_ms ?? pageCount * 3500) / 1000) / pageCount),
  );

  return {
    status: result.status,
    run_dir: path.relative(repoRoot, runDir),
    install_ms: result.stages?.install_ms ?? null,
    ready_ms: result.stages?.ready_ms ?? null,
    screenshot_ms: result.stages?.screenshot_ms ?? null,
    cold_install_sec: installSec,
    cache_install_sec: Math.min(3, Math.max(1, Math.ceil(installSec * 0.08))),
    dev_boot_sec_per_commit: readySec,
    screenshot_sec_per_page: screenshotPerPageSec,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const repoRoot = process.cwd();

  if (args.cmd === 'init') {
    if (args.nonInteractive && !fs.existsSync(path.join(repoRoot, '.timelapse.yaml'))) {
      console.error('init requires config input or existing .timelapse.yaml');
      process.exit(3);
    }
    spawnSync(process.execPath, [path.join(scriptDir, 'init-config.mjs')], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    return;
  }

  if (args.cmd === 'stitch-only') {
    const config = loadConfig(repoRoot);
    const outputDir = path.join(repoRoot, config.output_dir);
    const rid = args.runId || findLatestIncompleteRun(outputDir);
    if (!rid) {
      console.error('no run dir');
      process.exit(3);
    }
    const runDir = path.join(outputDir, rid);
    spawnSync(process.execPath, [path.join(scriptDir, 'stitch.mjs'), '--run-dir', runDir], {
      cwd: repoRoot,
      encoding: 'utf8',
      stdio: 'inherit',
    });
    spawnSync(process.execPath, [path.join(scriptDir, 'render-index.mjs'), '--run-dir', runDir], {
      cwd: repoRoot,
    });
    return;
  }

  if (args.cmd === 'clean') {
    const outputDir = path.join(repoRoot, '.timelapse');
    const wtBase = path.join(path.dirname(repoRoot), '.timelapse-worktrees', repoHash8(repoRoot));
    if (fs.existsSync(wtBase)) fs.rmSync(wtBase, { recursive: true, force: true });
    for (const run of fs.existsSync(outputDir) ? fs.readdirSync(outputDir) : []) {
      const pids = path.join(outputDir, run, 'pids.json');
      if (fs.existsSync(pids)) {
        for (const pid of JSON.parse(fs.readFileSync(pids, 'utf8'))) {
          try {
            process.kill(pid, 'SIGKILL');
          } catch {
            /* ignore */
          }
        }
      }
    }
    releaseLock(outputDir);
    console.log(JSON.stringify({ ok: true, message: 'cleaned worktrees and lock' }));
    return;
  }

  const config = loadConfig(repoRoot);
  if (args.noAnnotate) config.annotate = false;
  const outputDir = path.join(repoRoot, config.output_dir);
  const configHash = await computeConfigHash(config);

  let runId = args.runId;
  if (args.cmd === 'resume' && !runId) {
    runId = findLatestIncompleteRun(outputDir);
    if (!runId) {
      console.error('no incomplete run to resume');
      process.exit(3);
    }
  }
  if (!runId || args.fresh) {
    runId = new Date().toISOString().replace(/[:.]/g, '-');
  }

  const runDir = path.join(outputDir, runId);
  fs.mkdirSync(runDir, { recursive: true });

  const commitsPath = path.join(runDir, 'commits.json');
  let commits;
  if (args.cmd === 'resume' && fs.existsSync(commitsPath) && !args.fresh) {
    commits = JSON.parse(fs.readFileSync(commitsPath, 'utf8'));
  } else {
    const listArgs = [path.join(scriptDir, 'list-commits.mjs'), '--write', commitsPath];
    if (args.from) listArgs.push('--from', args.from);
    if (args.to) listArgs.push('--to', args.to);
    if (args.maxCommits) listArgs.push('--max-commits', String(args.maxCommits));
    const lr = spawnSync(process.execPath, listArgs, { cwd: repoRoot, encoding: 'utf8' });
    commits = JSON.parse(fs.readFileSync(commitsPath, 'utf8'));
  }

  const commitPlanHash = await sha256Hex(canonicalStringify(commits));

  if (args.only) {
    const names = new Set(args.only);
    /* filter pages not commits */
  }

  const preArgs = [
    path.join(scriptDir, 'preflight.mjs'),
    '--commits-file',
    commitsPath,
  ];
  if (args.trust) preArgs.push('--i-trust-this-repo');
  if (args.dryRun) preArgs.push('--dry-run');
  const pf = spawnSync(process.execPath, preArgs, { cwd: repoRoot, encoding: 'utf8' });
  if (pf.status !== 0) process.exit(3);
  if (args.dryRun) {
    const preflightPayload = JSON.parse(pf.stdout || '{}');
    if (args.calibrate) {
      acquireLock(outputDir, `${runId}-calibration`, { force: args.force });
      try {
        const calibration = calibrateHead({
          repoRoot,
          config,
          outputDir,
          runId,
          trust: args.trust,
        });
        const estimate = estimateRun({ repoRoot, commits, config, calibration });
        console.log(JSON.stringify({ ...preflightPayload, estimate }, null, 2));
      } finally {
        releaseLock(outputDir);
      }
    } else {
      console.log(pf.stdout);
    }
    return;
  }

  if (args.cmd === 'resume') {
    const progPath = path.join(runDir, 'progress.json');
    if (!fs.existsSync(progPath)) {
      console.error('no progress.json for resume');
      process.exit(3);
    }
    const prog = JSON.parse(fs.readFileSync(progPath, 'utf8'));
    if (prog.config_hash !== configHash || prog.commit_plan_hash !== commitPlanHash) {
      console.error('config or commit plan changed; use --fresh');
      process.exit(3);
    }
  }

  acquireLock(outputDir, runId, { force: args.force });
  const runStartMs = Date.now();
  pruneCache(path.join(outputDir, '.cache'), config.cache_max_gb || 20, runStartMs);

  const wtPath = worktreePath(repoRoot, config, runId);
  fs.mkdirSync(path.dirname(wtPath), { recursive: true });
  if (!fs.existsSync(path.join(wtPath, '.git'))) {
    git(['worktree', 'add', '--detach', wtPath, commits[0]?.hash || 'HEAD'], repoRoot);
  }

  spawnSync(process.execPath, [
    path.join(scriptDir, 'screenshot.mjs'),
    '--run-dir',
    runDir,
    '--worktree',
    wtPath,
    '--placeholders-only',
  ], { cwd: repoRoot });

  const progressPath = path.join(runDir, 'progress.json');
  const progress = fs.existsSync(progressPath)
    ? JSON.parse(fs.readFileSync(progressPath, 'utf8'))
    : { config_hash: configHash, commit_plan_hash: commitPlanHash, commits: {} };

  const manifest = {
    run_id: runId,
    commits,
    entries: [],
    skipped: [],
    skipped_count: 0,
    processed: 0,
  };

  const skippedLog = path.join(runDir, 'skipped.log');
  let summaryChars = 0;
  let summaryLines = 0;
  let totalLogBytes = 0;
  let skipped = 0;
  let noRoute = 0;

  const n = commits.length;
  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (progress.commits?.[c.hash]?.done && args.cmd === 'resume') continue;

    const rc = spawnSync(
      process.execPath,
      [
        path.join(scriptDir, 'run-commit.mjs'),
        '--run-dir',
        runDir,
        '--worktree',
        wtPath,
        '--index',
        String(c.index),
        '--hash',
        c.hash,
        '--subject',
        c.subject,
        '--date',
        c.date,
        '--trust',
        args.trust ? '1' : '0',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );

    let result;
    try {
      result = JSON.parse(rc.stdout || '{}');
    } catch {
      result = { status: 'skip', error: rc.stderr || 'parse error' };
    }

    emitSummaryLine(i + 1, n, c.hash, result);
    const line = `[${i + 1}/${n}] ${c.hash.slice(0, 7)} status=${result.status}\n`;
    summaryChars += line.length;
    summaryLines += 1;
    totalLogBytes += result.log_bytes || 0;

    if (result.status === 'skip' || result.status === 'fail') {
      skipped += 1;
      fs.appendFileSync(skippedLog, `${c.hash} ${result.status} ${result.error || ''}\n`);
      manifest.skipped.push({ hash: c.hash, stage: result.status, error: result.error });
    }

    if (result.pages) {
      for (const v of Object.values(result.pages)) {
        if (v.status === 'no_route') noRoute += 1;
      }
    }

    manifest.entries.push({ ...c, ...result });
    manifest.processed += 1;
    progress.commits = progress.commits || {};
    if (result.status === 'ok' || result.status === 'project_root_absent') {
      progress.commits[c.hash] = { done: true, pages: result.pages };
    }
    writeProgress(runDir, progress);
  }

  const stitchOut = spawnSync(
    process.execPath,
    [path.join(scriptDir, 'stitch.mjs'), '--run-dir', runDir],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  const stitchResults = JSON.parse(stitchOut.stdout || '[]');

  manifest.pages_summary = stitchResults;
  manifest.skipped_count = skipped;
  fs.writeFileSync(path.join(runDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  const tokensIfAll = Math.ceil(totalLogBytes / 4);
  const agentTokens = Math.ceil(summaryChars / 4) + 420;
  const cost = {
    run_id: runId,
    total_commits_in_range: commits.length,
    frontend_relevant_commits: commits.length,
    processed: manifest.processed,
    successful: manifest.processed - skipped,
    skipped,
    no_route_frames: noRoute,
    total_wall_ms: Date.now() - runStartMs,
    logs: { total_bytes: totalLogBytes, tokens_if_all_read: tokensIfAll },
    agent_context: {
      summary_lines_emitted: summaryLines,
      summary_chars: summaryChars,
      tokens_est: agentTokens,
      files_read_at_end: ['cost.json', 'manifest.json'],
      end_read_tokens_est: 420,
    },
    log_read_cost_avoided_est:
      tokensIfAll > 0 ? 1 - agentTokens / tokensIfAll : 0,
  };
  fs.writeFileSync(path.join(runDir, 'cost.json'), JSON.stringify(cost, null, 2));

  spawnSync(process.execPath, [path.join(scriptDir, 'render-index.mjs'), '--run-dir', runDir], {
    cwd: repoRoot,
  });

  if (!args.keepWorktree) {
    try {
      git(['worktree', 'remove', '--force', wtPath], repoRoot);
    } catch {
      fs.rmSync(wtPath, { recursive: true, force: true });
    }
  }

  releaseLock(outputDir);
  const exitCode = skipped > 0 ? 2 : 0;
  console.log(JSON.stringify({ ok: true, run_dir: runDir, exit_code: exitCode }));
  process.exit(exitCode);
}

main().catch((e) => {
  console.error(e.message);
  process.exit(3);
});
