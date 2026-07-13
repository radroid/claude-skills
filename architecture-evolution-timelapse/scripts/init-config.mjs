#!/usr/bin/env node
// Non-interactive config writer. Mirrors the --stdin-json pipe and YAML-write +
// .gitignore-append flow of frontend-evolution-timelapse/scripts/init-config.mjs
// (I6: self-contained skills — duplicated, not imported).
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';
import { DEFAULTS } from './lib/load-config.mjs';

function detectSystemName(projectDir) {
  const pkgPath = path.join(projectDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    try {
      const name = JSON.parse(fs.readFileSync(pkgPath, 'utf8')).name;
      if (name) return name;
    } catch {
      /* fall through to basename */
    }
  }
  return path.basename(path.resolve(projectDir));
}

const USAGE = 'usage: init-config.mjs [--out <path>] [--stdin-json]';

function parseArgs() {
  const o = { out: '.arch-timelapse.yaml', stdin: null };
  for (let i = 2; i < process.argv.length; i++) {
    if (process.argv[i] === '--out') o.out = process.argv[++i];
    else if (process.argv[i] === '--stdin-json') {
      try {
        o.stdin = JSON.parse(fs.readFileSync(0, 'utf8'));
      } catch (err) {
        console.error(`init: invalid --stdin-json payload: ${String(err.message).replace(/\s+/g, ' ')}`);
        console.error(USAGE);
        process.exit(2);
      }
    }
  }
  if (typeof o.out !== 'string' || o.out === '') {
    console.error('init: --out requires a value');
    console.error(USAGE);
    process.exit(2);
  }
  return o;
}

const repoRoot = process.cwd();
const args = parseArgs();
const input = args.stdin || {};

const config = {
  ...DEFAULTS,
  ...input,
  system_name: input.system_name || detectSystemName(repoRoot),
};

const outPath = path.isAbsolute(args.out) ? args.out : path.join(repoRoot, args.out);
try {
  fs.writeFileSync(outPath, yaml.stringify(config));

  const gi = path.join(repoRoot, '.gitignore');
  const line = `${config.output_dir}/`;
  if (fs.existsSync(gi)) {
    let content = fs.readFileSync(gi, 'utf8');
    if (!content.includes(line)) {
      content += `${content.endsWith('\n') || content === '' ? '' : '\n'}${line}\n`;
      fs.writeFileSync(gi, content);
    }
  } else {
    fs.writeFileSync(gi, `${line}\n`);
  }
} catch (err) {
  console.error(`init: write failed: ${err.message}`);
  process.exit(3);
}

console.log(JSON.stringify({ ok: true, path: outPath }));
