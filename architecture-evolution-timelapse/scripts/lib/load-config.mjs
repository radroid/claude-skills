// Same shape as frontend-evolution-timelapse/scripts/lib/load-config.mjs, with
// this skill's DEFAULTS and one deliberate difference: a missing config file
// does NOT throw — it returns DEFAULTS with a one-line stderr notice, so
// `extract` can run against a read-only target that has no .arch-timelapse.yaml
// (I6: self-contained skills — duplicated, not imported).
import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

const DEFAULTS = {
  // null → root package.json name, else tree dir basename (resolved at extract).
  system_name: null,
  levels: ['context', 'container', 'component'],
  // null → auto: existing directories among app, src/app, lib, src/lib, convex.
  component_roots: null,
  exclude: [
    'node_modules/**',
    '.git/**',
    '**/_generated/**',
    '**/*.test.*',
    '**/*.spec.*',
    '**/__tests__/**',
    '.next/**',
    'dist/**',
    'build/**',
    'coverage/**',
    '.arch-timelapse/**',
  ],
  // null → derive from tsconfig compilerOptions.paths (single-target X/* → [Y/*]
  // entries, strict-JSON parse), fallback {"@/": "./"}.
  import_aliases: null,
  extra_externals: [],
  source_extensions: ['ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs', 'mts', 'cts'],
  max_file_bytes: 1048576,
  output_dir: '.arch-timelapse',
  // Render stage (B2). Fixed canvas: every PNG is exactly width×height.
  render: {
    width: 1920,
    height: 1080,
    margin: 40,
    max_scale: 2,
    theme: 'neutral',
  },
};

export function loadConfig(treeRoot, configPath) {
  const p = configPath || path.join(treeRoot, '.arch-timelapse.yaml');
  if (!fs.existsSync(p)) {
    console.error(`no .arch-timelapse.yaml found at ${p}; using defaults`);
    return { ...DEFAULTS };
  }
  const raw = yaml.parse(fs.readFileSync(p, 'utf8'));
  if (raw !== null && (typeof raw !== 'object' || Array.isArray(raw))) {
    const got = Array.isArray(raw) ? 'a list' : `a ${typeof raw}`;
    throw new Error(`config root must be a YAML mapping, got ${got}: ${p}`);
  }
  return { ...DEFAULTS, ...raw };
}

export { DEFAULTS };
