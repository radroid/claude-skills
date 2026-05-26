import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';

export const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['package-lock.json', 'npm'],
  ['yarn.lock', 'yarn'],
  ['bun.lock', 'bun'],
  ['bun.lockb', 'bun'],
];

const INUSE_TTL_MS = 24 * 60 * 60 * 1000;

function yarnMajor(packageManager) {
  if (packageManager === 'yarn@berry') return 2;
  const m = packageManager?.match(/^yarn@(\d+)/);
  return m ? Number(m[1]) : 0;
}

export function detectPackageManager(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  let packageManager = null;
  if (fs.existsSync(pkgPath)) {
    try {
      packageManager = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).packageManager;
    } catch {
      packageManager = null;
    }
  }

  for (const [file, pm] of LOCKFILES) {
    if (fs.existsSync(path.join(projectDir, file))) {
      if (pm === 'yarn') {
        if (fs.existsSync(path.join(projectDir, '.yarnrc.yml'))) return 'yarn-berry';
        if (yarnMajor(packageManager) >= 2) return 'yarn-berry';
        return 'yarn-classic';
      }
      return pm;
    }
  }

  if (packageManager?.startsWith('bun@')) return 'bun';
  if (packageManager?.startsWith('pnpm@')) return 'pnpm';
  if (packageManager?.startsWith('yarn@')) {
    return yarnMajor(packageManager) >= 2 ? 'yarn-berry' : 'yarn-classic';
  }
  if (packageManager?.startsWith('npm@')) return 'npm';

  return 'npm';
}

function fileHash(p) {
  if (!fs.existsSync(p)) return 'none';
  return createHash('sha256').update(fs.readFileSync(p)).digest('hex').slice(0, 12);
}

export function cacheKey(projectDir, config, pm) {
  const pkg = path.join(projectDir, 'package.json');
  const parts = [
    pm,
    fileHash(pkg),
    ...LOCKFILES.map(([f]) => fileHash(path.join(projectDir, f))),
    config.project_root || '.',
    process.version.split('.').slice(0, 2).join('.'),
    process.platform,
    process.arch,
    config.capture_mode || 'dev',
  ];
  return parts.join('-');
}

function writeOutput(logStream, r) {
  if (!logStream) return;
  if (r.stdout) logStream.write(r.stdout);
  if (r.stderr) logStream.write(r.stderr);
}

function rsync(src, dest, logStream) {
  const r = spawnSync('rsync', ['-a', '--delete', `${src}/`, `${dest}/`], {
    encoding: 'utf8',
  });
  writeOutput(logStream, r);
  if (r.status !== 0) throw new Error(`rsync failed (${r.status})`);
}

function run(cmd, args, cwd, env, logStream) {
  const r = spawnSync(cmd, args, { cwd, env, encoding: 'utf8' });
  writeOutput(logStream, r);
  if (r.status !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.status})`);
}

export async function installDeps({
  projectDir,
  config,
  cacheRoot,
  trustRepo,
  runStartMs,
  logStream,
}) {
  const pm = detectPackageManager(projectDir);
  const key = cacheKey(projectDir, config, pm);
  const cacheDir = path.join(cacheRoot, `install-${key}`);
  const nm = path.join(projectDir, 'node_modules');
  const hasLock = LOCKFILES.some(([f]) => fs.existsSync(path.join(projectDir, f)));

  fs.mkdirSync(cacheRoot, { recursive: true });

  const env = { ...process.env };
  if (!trustRepo && pm === 'yarn-berry') env.YARN_ENABLE_SCRIPTS = 'false';

  if (config.install) {
    const parts = config.install.split(/\s+/);
    run(parts[0], parts.slice(1), projectDir, env, logStream);
    return { pm, strategy: 'custom', tier: 'custom', cache_key: key };
  }

  if (pm === 'npm' && fs.existsSync(path.join(cacheDir, 'node_modules'))) {
    fs.mkdirSync(path.dirname(nm), { recursive: true });
    rsync(path.join(cacheDir, 'node_modules'), nm, logStream);
    fs.writeFileSync(path.join(cacheDir, '.inuse'), String(runStartMs || Date.now()));
    return { pm, strategy: 'npm-cache', tier: 'cache-hit', cache_key: key };
  }

  if (pm === 'npm') {
    if (hasLock) {
      const args = ['ci'];
      if (!trustRepo) args.push('--ignore-scripts');
      run('npm', args, projectDir, env, logStream);
    } else {
      const args = ['install'];
      if (!trustRepo) args.push('--ignore-scripts');
      run('npm', args, projectDir, env, logStream);
    }
    if (fs.existsSync(nm)) {
      fs.mkdirSync(cacheDir, { recursive: true });
      rsync(nm, path.join(cacheDir, 'node_modules'), logStream);
    }
  } else if (pm === 'pnpm') {
    if (fs.existsSync(cacheDir)) env.PNPM_STORE_DIR = path.join(cacheDir, 'pnpm-store');
    const args = ['install'];
    if (hasLock) args.push('--frozen-lockfile');
    if (!trustRepo) args.push('--ignore-scripts');
    run('pnpm', args, projectDir, env, logStream);
  } else if (pm === 'yarn-berry') {
    const args = ['install'];
    if (hasLock) args.push('--immutable');
    run('yarn', args, projectDir, env, logStream);
  } else if (pm === 'yarn-classic') {
    const args = ['install', '--frozen-lockfile'];
    if (!trustRepo) args.push('--ignore-scripts');
    run('yarn', args, projectDir, env, logStream);
  } else if (pm === 'bun') {
    const args = ['install'];
    if (!trustRepo) args.push('--ignore-scripts');
    run('bun', args, projectDir, env, logStream);
  }

  fs.mkdirSync(cacheDir, { recursive: true });
  fs.writeFileSync(path.join(cacheDir, '.inuse'), String(runStartMs || Date.now()));

  return {
    pm,
    strategy: pm,
    tier: hasLock ? 'frozen' : 'plain',
    cache_key: key,
  };
}

export function pruneCache(cacheRoot, maxGb, runStartMs) {
  if (!fs.existsSync(cacheRoot)) return;
  const maxBytes = maxGb * 1024 * 1024 * 1024;
  const entries = fs
    .readdirSync(cacheRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory() && d.name.startsWith('install-'))
    .map((d) => {
      const p = path.join(cacheRoot, d.name);
      const st = fs.statSync(p);
      const inusePath = path.join(p, '.inuse');
      const inuseMs = fs.existsSync(inusePath)
        ? Number(fs.readFileSync(inusePath, 'utf8')) || 0
        : 0;
      const inuse = inuseMs > Date.now() - INUSE_TTL_MS;
      if (!inuse && fs.existsSync(inusePath)) {
        fs.rmSync(inusePath, { force: true });
      }
      return {
        p,
        size: dirSize(p),
        inuse,
        mtime: st.mtimeMs,
      };
    });

  let total = entries.reduce((s, e) => s + e.size, 0);
  const sorted = entries
    .filter((e) => !e.inuse && e.mtime < runStartMs)
    .sort((a, b) => a.mtime - b.mtime);

  for (const e of sorted) {
    if (total <= maxBytes) break;
    fs.rmSync(e.p, { recursive: true, force: true });
    total -= e.size;
  }
}

function dirSize(dir) {
  let n = 0;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) n += dirSize(p);
    else n += fs.statSync(p).size;
  }
  return n;
}
