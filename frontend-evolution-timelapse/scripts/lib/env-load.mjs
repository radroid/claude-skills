import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

/** Gitignored env files copied from the user's checkout into each worktree (not from historical commits). */
export const DEFAULT_ENV_SYNC_FILES = [
  '.env',
  '.env.local',
  '.env.development',
  '.env.development.local',
];

/** Load order: earlier files first, later override; default favors Next.js dev precedence. */
const DEFAULT_ENV_LOAD_FILES = [
  '.env',
  '.env.development',
  '.env.local',
  '.env.development.local',
];

const PREVIOUS_ENV = new Map();

function parseEnvFile(content) {
  const env = {};
  for (const line of content.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

function hashFile(p) {
  if (!fs.existsSync(p)) return null;
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 16);
}

function resolveProjectDir(root, config) {
  const pr = config.project_root || '.';
  return pr === '.' ? root : path.join(root, pr);
}

/**
 * Copy env files from the user's real checkout into the detached worktree so
 * frameworks that read .env.local from disk (Next.js, Vite) see Supabase keys etc.
 */
export function syncEnvFilesToWorktree({ repoRoot, worktreeRoot, config }) {
  const names = config.env_sync_files ?? DEFAULT_ENV_SYNC_FILES;
  const synced = [];

  const pairs = [];
  const repoProject = resolveProjectDir(repoRoot, config);
  const wtProject = resolveProjectDir(worktreeRoot, config);

  if (repoProject !== wtProject) {
    pairs.push({ srcDir: repoProject, destDir: wtProject });
  }
  if (path.resolve(repoRoot) !== path.resolve(worktreeRoot)) {
    pairs.push({ srcDir: repoRoot, destDir: worktreeRoot });
  }

  const seenDest = new Set();
  for (const { srcDir, destDir } of pairs) {
    for (const name of names) {
      const from = path.join(srcDir, name);
      const to = path.join(destDir, name);
      if (!fs.existsSync(from)) continue;
      const destKey = to;
      if (seenDest.has(destKey)) continue;
      fs.mkdirSync(path.dirname(to), { recursive: true });
      fs.copyFileSync(from, to);
      seenDest.add(destKey);
      synced.push({
        file: name,
        from: path.relative(repoRoot, from) || name,
        to: path.relative(repoRoot, to),
      });
    }
  }

  return synced;
}

function applyFile(filePath, sources) {
  if (!fs.existsSync(filePath)) return;
  const parsed = parseEnvFile(fs.readFileSync(filePath, 'utf8'));
  for (const [key, value] of Object.entries(parsed)) {
    if (!PREVIOUS_ENV.has(key)) {
      PREVIOUS_ENV.set(key, Object.prototype.hasOwnProperty.call(process.env, key)
        ? process.env[key]
        : undefined);
    }
    process.env[key] = value;
  }
  sources.push({
    path: filePath,
    sha256_16: hashFile(filePath),
    role: 'load',
  });
}

function collectLoadPaths(repoRoot, worktreeRoot, config) {
  const loadNames = config.env_load_files ?? DEFAULT_ENV_LOAD_FILES;
  const dirs = new Set();
  dirs.add(resolveProjectDir(repoRoot, config));
  if (worktreeRoot) {
    dirs.add(resolveProjectDir(worktreeRoot, config));
  }

  const paths = [];
  for (const dir of dirs) {
    for (const name of loadNames) {
      paths.push(path.join(dir, name));
    }
  }

  const timelapseEnv = path.isAbsolute(config.env_file)
    ? config.env_file
    : path.join(repoRoot, config.env_file);
  paths.push(timelapseEnv);

  return paths;
}

export function loadEnvForRun({ repoRoot, worktreeRoot, config, trustRepo }) {
  for (const [key, value] of PREVIOUS_ENV.entries()) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  PREVIOUS_ENV.clear();

  const sources = [];

  const paths = collectLoadPaths(repoRoot, worktreeRoot, config);
  for (const filePath of paths) {
    applyFile(filePath, sources);
  }

  if (config.use_historical_env && trustRepo && worktreeRoot) {
    for (const name of config.env_sync_files ?? DEFAULT_ENV_SYNC_FILES) {
      applyFile(path.join(worktreeRoot, name), sources);
      applyFile(path.join(resolveProjectDir(worktreeRoot, config), name), sources);
    }
  }

  const missing = (config.required_env || []).filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(
      `Missing required env keys: ${missing.join(', ')}. ` +
        `Ensure they exist in .env.local (or env_file) on your checkout; ` +
        `env_sync_files copies those into the worktree before each commit.`,
    );
  }

  return sources;
}

/**
 * Sync + load in one call (used by run-commit).
 */
export function prepareEnvForCommit({ repoRoot, worktreeRoot, config, trustRepo }) {
  const synced = syncEnvFilesToWorktree({ repoRoot, worktreeRoot, config });
  const sources = loadEnvForRun({ repoRoot, worktreeRoot, config, trustRepo });
  return { synced, sources };
}
