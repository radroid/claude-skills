#!/usr/bin/env node
import path from 'node:path';
import { loadConfig } from './load-config.mjs';
import { loadEnvForRun } from './env-load.mjs';
import { installDeps } from './install-matrix.mjs';

const repoRoot = process.cwd();
let worktree = repoRoot;
let trust = false;
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--worktree') worktree = process.argv[++i];
  if (process.argv[i] === '--trust') trust = process.argv[++i] === '1';
}

const config = loadConfig(repoRoot);
const projectDir = path.join(worktree, config.project_root || '.');
const cacheRoot = path.join(repoRoot, config.output_dir || '.timelapse', '.cache');

loadEnvForRun({ repoRoot, worktreeRoot: worktree, config, trustRepo: trust });
const result = await installDeps({
  projectDir,
  config,
  cacheRoot,
  trustRepo: trust,
  runStartMs: Date.now(),
});
console.log(JSON.stringify(result));
