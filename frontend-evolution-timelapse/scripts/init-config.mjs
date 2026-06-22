#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { DEFAULTS } from './lib/load-config.mjs';
import { detectPackageManager } from './lib/install-matrix.mjs';

function detectDev(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (!fs.existsSync(pkgPath)) return { dev: 'npm run dev', port: 3000 };
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  const scripts = pkg.scripts || {};
  const pm = detectPackageManager(projectDir);
  const run = (s) => {
    if (pm === 'pnpm') return `pnpm ${s}`;
    if (pm === 'yarn-berry' || pm === 'yarn-classic') return `yarn ${s}`;
    if (pm === 'bun') return `bun run ${s}`;
    return `npm run ${s}`;
  };
  const dev = scripts.dev ? run('dev') : scripts.start ? run('start') : 'npm run dev';
  let port = 3000;
  if (fs.existsSync(path.join(projectDir, 'vite.config.ts')) || fs.existsSync(path.join(projectDir, 'vite.config.js'))) {
    port = 5173;
  }
  return { dev, port };
}

function parseArgs() {
  const o = { out: '.timelapse.yaml', stdin: null };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--out') o.out = process.argv[++i];
    else if (process.argv[i] === '--stdin-json') {
      o.stdin = JSON.parse(fs.readFileSync(0, 'utf8'));
    }
  }
  return o;
}

const repoRoot = process.cwd();
const args = parseArgs();
const detected = detectDev(repoRoot);

const input = args.stdin || {
  pages: [{ name: 'home', path: '/', wait_for: 'main, [role=main], #root' }],
  viewport: { width: 1440, height: 900 },
  port: detected.port,
  dev: detected.dev,
};

const config = {
  ...DEFAULTS,
  ...input,
  dev: input.dev || detected.dev,
  port: input.port || detected.port,
  ready: {
    url: input.ready?.url ?? `http://localhost:${input.port || detected.port}`,
    timeout_ms: input.ready?.timeout_ms ?? 120000,
  },
};

const outPath = path.isAbsolute(args.out) ? args.out : path.join(repoRoot, args.out);
fs.writeFileSync(outPath, yaml.stringify(config));

const gi = path.join(repoRoot, '.gitignore');
const lines = ['.timelapse/', '.timelapse-worktrees/'];
if (fs.existsSync(gi)) {
  let content = fs.readFileSync(gi, 'utf8');
  for (const line of lines) {
    if (!content.includes(line)) content += `\n${line}`;
  }
  fs.writeFileSync(gi, content.endsWith('\n') ? content : `${content}\n`);
} else {
  fs.writeFileSync(gi, `${lines.join('\n')}\n`);
}

console.log(JSON.stringify({ ok: true, path: outPath }));
