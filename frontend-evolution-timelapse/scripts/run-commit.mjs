#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { loadConfig } from './lib/load-config.mjs';
import { prepareEnvForCommit } from './lib/env-load.mjs';
import { installDeps } from './lib/install-matrix.mjs';
import { pollReady, waitForPortInLog, pidsOnPort, isDescendantOf } from './lib/port-owner.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = process.cwd();

function parseArgs() {
  const o = {};
  for (let i = 2; i < process.argv.length; i++) {
    const a = process.argv[i];
    if (a === '--run-dir') o.runDir = process.argv[++i];
    else if (a === '--worktree') o.worktree = process.argv[++i];
    else if (a === '--index') o.index = parseInt(process.argv[++i], 10);
    else if (a === '--hash') o.hash = process.argv[++i];
    else if (a === '--subject') o.subject = process.argv[++i];
    else if (a === '--date') o.date = process.argv[++i];
    else if (a === '--trust') o.trust = process.argv[++i] === '1';
  }
  return o;
}

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr}`);
  return (r.stdout || '').trim();
}

function runCommand(cmd, cwd, logStream) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, {
      cwd,
      env: process.env,
      shell: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (d) => logStream.write(d));
    child.stderr.on('data', (d) => logStream.write(d));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} exited ${code}`))));
  });
}

/** Write dev server logs directly to file — avoids pipe backpressure hanging the parent on errors. */
function startServer(cmd, cwd, logPath) {
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(cmd, {
    cwd,
    env: process.env,
    shell: true,
    stdio: ['ignore', logFd, logFd],
    detached: true,
  });
  fs.closeSync(logFd);
  child.unref();
  return child;
}

function killServerChild(serverChild) {
  if (!serverChild?.pid) return;
  try {
    process.kill(-serverChild.pid, 'SIGTERM');
  } catch {
    /* ignore */
  }
  try {
    process.kill(-serverChild.pid, 'SIGKILL');
  } catch {
    /* ignore */
  }
}

const args = parseArgs();
const config = loadConfig(repoRoot);
const projectDir = path.join(args.worktree, config.project_root || '.');
const logFile = path.join(
  args.runDir,
  'logs',
  `${String(args.index).padStart(3, '0')}_${args.hash.slice(0, 7)}.log`,
);
fs.mkdirSync(path.dirname(logFile), { recursive: true });
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const startMs = Date.now();
let envMeta = { synced: [], sources: [] };
let serverChild = null;

if (!fs.existsSync(projectDir)) {
  console.log(JSON.stringify({ status: 'project_root_absent', pages: {} }));
  process.exit(0);
}

try {
  logStream.write(`=== checkout ${args.hash} ===\n`);
  git(['checkout', '-f', args.hash], args.worktree);

  envMeta = prepareEnvForCommit({
    repoRoot,
    worktreeRoot: args.worktree,
    config,
    trustRepo: args.trust,
  });
  if (envMeta.synced.length) {
    logStream.write(
      `=== env sync (${envMeta.synced.map((s) => s.file).join(', ')}) ===\n`,
    );
  }

  const installStart = Date.now();
  const cacheRoot = path.join(repoRoot, config.output_dir, '.cache');
  const installMeta = await installDeps({
    projectDir,
    config,
    cacheRoot,
    trustRepo: args.trust,
    runStartMs: startMs,
    logStream,
  });
  const installMs = Date.now() - installStart;

  const devLog = path.join(args.runDir, 'logs', `dev_${args.hash.slice(0, 7)}.log`);
  fs.writeFileSync(devLog, '');

  const readyStart = Date.now();
  if (config.capture_mode === 'production') {
    if (!config.build || !config.start) throw new Error('build and start required for production mode');
    await runCommand(config.build, projectDir, logStream);
    serverChild = startServer(config.start, projectDir, devLog);
  } else {
    serverChild = startServer(config.dev || 'npm run dev', projectDir, devLog);
  }

  const pidsPath = path.join(args.runDir, 'pids.json');
  const pids = fs.existsSync(pidsPath) ? JSON.parse(fs.readFileSync(pidsPath, 'utf8')) : [];
  pids.push(serverChild.pid);
  fs.writeFileSync(pidsPath, JSON.stringify(pids));

  let port = config.port;
  port = await waitForPortInLog(devLog, port, Math.min(30000, config.ready.timeout_ms / 4));
  const readyUrl = config.ready.url.replace(/:\d+/, `:${port}`);
  const ready = await pollReady(readyUrl, config.ready.timeout_ms);
  if (!ready.ok) throw new Error(`Server not ready: ${ready.error}`);
  const readyMs = Date.now() - readyStart;

  const owners = pidsOnPort(port);
  if (owners.length === 0) {
    throw new Error(`Server reported ready but no LISTEN owner on port ${port}`);
  }
  const ours = owners.filter((p) => isDescendantOf(p, serverChild.pid));
  if (ours.length === 0) {
    throw new Error(
      `Port ${port} owned by foreign pid(s) ${owners.join(',')}, not a descendant of dev server ${serverChild.pid}`,
    );
  }

  const shotStart = Date.now();
  const shot = spawnSync(
    process.execPath,
    [
      path.join(scriptDir, 'screenshot.mjs'),
      '--run-dir',
      args.runDir,
      '--worktree',
      args.worktree,
      '--index',
      String(args.index),
      '--hash',
      args.hash,
      '--subject',
      args.subject,
      '--date',
      args.date,
    ],
    { cwd: repoRoot, encoding: 'utf8' },
  );
  logStream.write(shot.stdout || '');
  logStream.write(shot.stderr || '');
  if (shot.status !== 0) {
    const detail = (shot.stderr || shot.stdout || '').trim().slice(0, 500);
    throw new Error(`screenshot failed (${shot.status}): ${detail}`);
  }
  let pages;
  try {
    pages = JSON.parse(shot.stdout || '{}');
  } catch (e) {
    throw new Error(`screenshot returned invalid JSON: ${e.message}`);
  }
  if (!pages || Object.keys(pages).length === 0) {
    throw new Error('screenshot produced no page results');
  }
  const shotMs = Date.now() - shotStart;

  killServerChild(serverChild);
  serverChild = null;

  const logBytes = fs.statSync(logFile).size;
  const allOk = Object.values(pages).every(
    (p) => p.status === 'ok' || p.status === 'no_route',
  );

  console.log(
    JSON.stringify({
      status: allOk ? 'ok' : 'fail',
      pages,
      install: installMeta,
      env_synced: envMeta.synced.map((s) => s.file),
      duration_ms: Date.now() - startMs,
      stages: { install_ms: installMs, ready_ms: readyMs, screenshot_ms: shotMs },
      log_file: path.relative(args.runDir, logFile),
      log_bytes: logBytes,
      log_tokens_est: Math.ceil(logBytes / 4),
    }),
  );
} catch (e) {
  killServerChild(serverChild);
  serverChild = null;
  logStream.write(`ERROR: ${e.message}\n`);
  const logBytes = fs.existsSync(logFile) ? fs.statSync(logFile).size : 0;
  const status =
    e.message.startsWith('screenshot failed') ||
    e.message.startsWith('screenshot returned invalid JSON') ||
    e.message.startsWith('screenshot produced no page results')
      ? 'fail'
      : 'skip';
  console.log(
    JSON.stringify({
      status,
      error: e.message,
      log_file: path.relative(args.runDir, logFile),
      log_bytes: logBytes,
      log_tokens_est: Math.ceil(logBytes / 4),
    }),
  );
} finally {
  killServerChild(serverChild);
  logStream.end();
}
