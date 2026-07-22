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
  'full_page',
  'project_root',
  'settle_ms',
  'env_file',
  'env_sync_files',
  'required_env',
  'use_historical_env',
];

/* Only the dedup subfields that affect captured or kept pixels. Stitch-time
   knobs (annotate, collapse_mode, max_hold_ms) are excluded on purpose:
   stitch-only re-runs without a hash gate, and a pacing or annotation tweak
   must not force --fresh. annotate stopped affecting captured pixels when
   annotation moved to stitch-time burn-in. */
const DEDUP_HASH_FIELDS = ['enabled', 'threshold', 'ignore_selectors'];

export function configSubset(config) {
  const out = {};
  for (const k of HASH_FIELDS) {
    if (config[k] !== undefined) out[k] = config[k];
  }
  if (config.dedup !== undefined) {
    out.dedup = {};
    for (const k of DEDUP_HASH_FIELDS) {
      if (config.dedup[k] !== undefined) out.dedup[k] = config.dedup[k];
    }
  }
  return out;
}

export async function computeConfigHash(config) {
  return sha256Hex(canonicalStringify(configSubset(config)));
}
