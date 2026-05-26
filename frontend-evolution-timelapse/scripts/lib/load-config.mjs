import fs from 'node:fs';
import path from 'node:path';
import yaml from 'yaml';

const DEFAULTS = {
  project_root: '.',
  workspace: null,
  base_url: null,
  worktree_mode: 'sibling',
  capture_mode: 'dev',
  history_mode: 'first-parent',
  viewport: { width: 1440, height: 900 },
  install: null,
  dev: 'npm run dev',
  build: null,
  start: null,
  port: 3000,
  ready: { url: 'http://localhost:3000', timeout_ms: 120000 },
  frontend_paths: [
    'src/**',
    'app/**',
    'components/**',
    'public/**',
    '**/*.{ts,tsx,js,jsx,css,scss,html,svg}',
  ],
  output_dir: '.timelapse',
  annotate: true,
  full_page: false,
  gif: { fps: 1.5, width: 1200, hold_skipped_ms: 400 },
  mp4: { fps: 1.5, crf: 22 },
  max_commits: 80,
  cache_max_gb: 20,
  min_free_gb: 5,
  settle_ms: 500,
  env_file: '.env.timelapse',
  env_sync_files: [
    '.env',
    '.env.local',
    '.env.development',
    '.env.development.local',
  ],
  env_load_files: null,
  required_env: [],
  use_historical_env: false,
};

export function loadConfig(repoRoot, configPath) {
  const p = configPath || path.join(repoRoot, '.timelapse.yaml');
  if (!fs.existsSync(p)) {
    throw new Error(`Missing config: ${p}. Run: timelapse.sh init`);
  }
  const raw = yaml.parse(fs.readFileSync(p, 'utf8'));
  const config = { ...DEFAULTS, ...raw };
  config.ready = {
    url: config.ready?.url ?? `http://localhost:${config.port}`,
    timeout_ms: config.ready?.timeout_ms ?? 120000,
  };
  if (!Array.isArray(config.pages) || config.pages.length === 0) {
    throw new Error('config.pages must be a non-empty array');
  }
  for (const page of config.pages) {
    if (!page.wait_for) {
      throw new Error(`page "${page.name}" requires wait_for selector`);
    }
  }
  return config;
}

export { DEFAULTS };
