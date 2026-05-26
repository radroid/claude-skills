import { canonicalStringify, sha256Hex } from './canonical-json.mjs';

const HASH_FIELDS = [
  'pages',
  'viewport',
  'capture_mode',
  'dev',
  'build',
  'start',
  'history_mode',
  'base_url',
  'frontend_paths',
  'annotate',
  'full_page',
  'project_root',
  'settle_ms',
  'env_file',
  'env_sync_files',
  'required_env',
  'use_historical_env',
];

export function configSubset(config) {
  const out = {};
  for (const k of HASH_FIELDS) {
    if (config[k] !== undefined) out[k] = config[k];
  }
  return out;
}

export async function computeConfigHash(config) {
  return sha256Hex(canonicalStringify(configSubset(config)));
}
