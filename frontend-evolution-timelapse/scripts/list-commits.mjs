#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { minimatch } from 'minimatch';
import { loadConfig } from './lib/load-config.mjs';
import { canonicalStringify, sha256Hex } from './lib/canonical-json.mjs';
import { estimateRun } from './lib/estimate.mjs';

function git(args, cwd) {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr || r.stdout}`);
  return (r.stdout || '').trim();
}

function isMergeCommit(hash, cwd) {
  const parents = git(['rev-list', '--parents', '-n', '1', hash], cwd).split(/\s+/);
  return parents.length > 2;
}

function changedFiles(hash, cwd) {
  const isRoot = git(['rev-list', '--max-parents=0', hash], cwd) === hash;
  let args;
  if (isRoot) {
    args = ['diff-tree', '--root', '--no-commit-id', '--name-only', '-r', hash];
  } else if (isMergeCommit(hash, cwd)) {
    args = ['diff-tree', '-m', '--first-parent', '--no-commit-id', '--name-only', '-r', hash];
  } else {
    args = ['diff-tree', '--no-commit-id', '--name-only', '-r', hash];
  }
  const out = git(args, cwd);
  return out ? out.split('\n').filter(Boolean) : [];
}

function matchesFrontend(files, patterns) {
  return files.some((f) => patterns.some((p) => minimatch(f, p, { dot: true })));
}

function listAllCommits(cwd, historyMode) {
  const revArgs =
    historyMode === 'all'
      ? ['rev-list', '--reverse', 'HEAD']
      : ['rev-list', '--reverse', '--first-parent', 'HEAD'];
  return git(revArgs, cwd).split('\n').filter(Boolean);
}

function parseArgs(argv) {
  const opts = { from: null, to: null, maxCommits: null, write: null, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--from') opts.from = argv[++i];
    else if (a === '--to') opts.to = argv[++i];
    else if (a === '--max-commits') opts.maxCommits = parseInt(argv[++i], 10);
    else if (a === '--write') opts.write = argv[++i];
    else if (a === '--dry-run') opts.dryRun = true;
  }
  return opts;
}

const repoRoot = process.cwd();
const opts = parseArgs(process.argv);
const config = loadConfig(repoRoot);

let hashes = listAllCommits(repoRoot, config.history_mode);
const head = git(['rev-parse', 'HEAD'], repoRoot);

if (opts.from) {
  const fromIdx = hashes.indexOf(git(['rev-parse', opts.from], repoRoot));
  if (fromIdx >= 0) hashes = hashes.slice(fromIdx);
}
if (opts.to) {
  const toHash = git(['rev-parse', opts.to], repoRoot);
  const toIdx = hashes.indexOf(toHash);
  if (toIdx >= 0) hashes = hashes.slice(0, toIdx + 1);
}

const relevant = [];
for (const hash of hashes) {
  const files = changedFiles(hash, repoRoot);
  if (files.length === 0 && hash === hashes[0]) {
    relevant.push(hash);
    continue;
  }
  if (matchesFrontend(files, config.frontend_paths)) {
    relevant.push(hash);
  }
}

let finalList = relevant;
if (opts.maxCommits != null || config.max_commits) {
  const cap = opts.maxCommits ?? config.max_commits;
  if (finalList.length > cap) finalList = finalList.slice(-cap);
}

const commits = finalList.map((hash, index) => {
  const subject = git(['log', '-1', '--format=%s', hash], repoRoot);
  const date = git(['log', '-1', '--format=%aI', hash], repoRoot);
  return { index: index + 1, hash, subject, date };
});

const payload = {
  head,
  history_mode: config.history_mode,
  total_in_range: hashes.length,
  frontend_relevant: commits.length,
  commits,
};

if (opts.dryRun) {
  const estimate = estimateRun({ repoRoot, commits, config });
  console.log(JSON.stringify({ ...payload, estimate }, null, 2));
  process.exit(0);
}

if (opts.write) {
  fs.mkdirSync(path.dirname(opts.write), { recursive: true });
  fs.writeFileSync(opts.write, JSON.stringify(commits, null, 2));
  const planHash = await sha256Hex(canonicalStringify(commits));
  fs.writeFileSync(
    path.join(path.dirname(opts.write), 'commit_plan_meta.json'),
    JSON.stringify({ commit_plan_hash: planHash, head, count: commits.length }, null, 2),
  );
}

console.log(JSON.stringify(payload));
