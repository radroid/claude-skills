import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { LOCKFILES } from './install-matrix.mjs';

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) return '';
  return (r.stdout || '').trim();
}

function fileAtCommit(repoRoot, hash, filePath) {
  const out = git(['show', `${hash}:${filePath}`], repoRoot);
  return out || null;
}

function hashText(text) {
  if (!text) return 'none';
  return createHash('sha256').update(text).digest('hex').slice(0, 12);
}

function lockSignature(repoRoot, hash, projectRoot) {
  const prefix = projectRoot && projectRoot !== '.' ? `${projectRoot}/` : '';
  const packageJson = fileAtCommit(repoRoot, hash, `${prefix}package.json`);
  const locks = LOCKFILES.map(([name]) => {
    const text = fileAtCommit(repoRoot, hash, `${prefix}${name}`);
    return `${name}:${hashText(text)}`;
  });
  return [hashText(packageJson), ...locks].join('|');
}

/**
 * Estimate reflects actual loop shape:
 * - install/cache once per commit, not per page
 * - dev boot once per commit, serving all pages
 * - screenshot cost scales with page count
 */
export function estimateRun({ repoRoot, commits, config, calibration = null }) {
  const pages = config.pages?.length || 1;
  const seenLocks = new Set();
  let coldInstalls = 0;
  let cacheHits = 0;

  for (const c of commits) {
    const sig = lockSignature(repoRoot, c.hash, config.project_root || '.');
    if (seenLocks.has(sig)) cacheHits += 1;
    else {
      seenLocks.add(sig);
      coldInstalls += 1;
    }
  }

  const perCommitBootSec =
    calibration?.dev_boot_sec_per_commit ??
    (config.capture_mode === 'production' ? 22 : 7);
  const perPageSec = calibration?.screenshot_sec_per_page ?? 3.5;
  const coldInstallSec = calibration?.cold_install_sec ?? 38;
  const cacheInstallSec = calibration?.cache_install_sec ?? 2;
  const stitchSec = Math.max(5, Math.ceil(commits.length * pages * 0.2));

  const seconds =
    coldInstalls * coldInstallSec +
    cacheHits * cacheInstallSec +
    commits.length * perCommitBootSec +
    commits.length * pages * perPageSec +
    stitchSec;

  return {
    estimate_seconds: Math.ceil(seconds),
    estimate_minutes: Math.max(1, Math.ceil(seconds / 60)),
    model: calibration
      ? 'calibrated_head + lock_signature_cache_model'
      : 'cold_install_per_unique_package_lock + cache_install_per_repeat + one_dev_boot_per_commit + per_page_capture',
    assumptions: {
      cold_install_sec: coldInstallSec,
      cache_install_sec: cacheInstallSec,
      dev_boot_sec_per_commit: perCommitBootSec,
      screenshot_sec_per_page: perPageSec,
      stitch_sec: stitchSec,
    },
    calibration: calibration ?? null,
    cold_installs: coldInstalls,
    cache_install_hits: cacheHits,
    pages,
  };
}
