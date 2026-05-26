import fs from 'node:fs';
import path from 'node:path';

const LOCK_DIR = '.lock.d';
const RECLAIM_DIR = '.lock-reclaim.d';

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function readLock(lockPath) {
  try {
    return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
  } catch {
    return null;
  }
}

export function acquireLock(outputDir, runId, { force = false } = {}) {
  const base = path.join(outputDir, LOCK_DIR);
  const lockFile = path.join(base, 'lock.json');
  fs.mkdirSync(outputDir, { recursive: true });

  if (force && fs.existsSync(base)) {
    try {
      fs.rmSync(base, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }

  try {
    fs.mkdirSync(base);
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
    const existing = readLock(lockFile);
    if (existing?.pid && isAlive(existing.pid)) {
      if (String(existing.start_time_ms) === String(process.env.TIMELAPSE_LOCK_START)) {
        return { ok: true, reused: true };
      }
      throw new Error(
        `Another timelapse run holds the lock (pid ${existing.pid}, run ${existing.run_id}). Use --force to override.`,
      );
    }
    const reclaim = path.join(outputDir, RECLAIM_DIR);
    try {
      fs.mkdirSync(reclaim);
      fs.rmSync(base, { recursive: true, force: true });
      fs.mkdirSync(base);
      fs.rmSync(reclaim, { recursive: true, force: true });
    } catch (e) {
      throw new Error(`Could not reclaim stale lock: ${e.message}`);
    }
  }

  const token = {
    pid: process.pid,
    start_time_ms: Date.now(),
    run_id: runId,
  };
  const tmp = `${lockFile}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(token, null, 2));
  fs.renameSync(tmp, lockFile);
  process.env.TIMELAPSE_LOCK_START = String(token.start_time_ms);
  return { ok: true, reused: false };
}

export function releaseLock(outputDir) {
  const base = path.join(outputDir, LOCK_DIR);
  if (fs.existsSync(base)) {
    fs.rmSync(base, { recursive: true, force: true });
  }
}
