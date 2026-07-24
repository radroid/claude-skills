#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));

const USAGE = `usage: arch-timelapse.sh <subcommand> [flags]

subcommands:
  init      write .arch-timelapse.yaml into the target repo (non-interactive; accepts --stdin-json)
  extract   emit C1/C2/C3 model.json + hashes.json for a checked-out tree
            [--tree <dir>] [--out <dir>] [--config <path>] [--levels a,b,c]
  render    render model.json levels to Mermaid .mmd + fixed-canvas .png
            [--model <path>] [--out <dir>] [--levels a,b,c] [--config <path>]

reserved for later items: run, stitch-only, clean`;

const RESERVED = new Set(['run', 'stitch-only', 'clean']);

function runScript(script, args) {
  const r = spawnSync(process.execPath, [path.join(scriptDir, script), ...args], {
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  process.exit(r.status ?? 3);
}

function main() {
  const cmd = process.argv[2];
  const rest = process.argv.slice(3);

  if (!cmd || cmd.startsWith('--')) {
    console.error(USAGE);
    process.exit(2);
  }

  if (cmd === 'init') {
    runScript('init-config.mjs', rest);
  }

  if (cmd === 'extract') {
    const extractor = path.join(scriptDir, 'extract-model.mjs');
    if (fs.existsSync(extractor)) {
      runScript('extract-model.mjs', rest);
    }
    console.error('extract: not implemented yet (extract-model.mjs ships in the next slice of B1)');
    process.exit(2);
  }

  if (cmd === 'render') {
    runScript('render-diagrams.mjs', rest);
  }

  if (RESERVED.has(cmd)) {
    console.error(`${cmd}: reserved for a later item, not implemented`);
    console.error(USAGE);
    process.exit(2);
  }

  console.error(USAGE);
  process.exit(2);
}

main();
