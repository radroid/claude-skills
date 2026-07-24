// C1 external-system rule table (spec §2.4) as a data module. Row order is
// the fixed evaluation order; output order is by node id regardless.
//
// Detector kinds per row (a row fires when ANY detector matches):
//   deps        — package-name matchers against the union of root package.json
//                 dependencies + devDependencies. A matcher ending in "/" is a
//                 prefix match; otherwise exact ("convex-test" must NOT fire
//                 the exact "convex" matcher).
//   envPrefixes — prefixes matched against the harvested process.env name set.
//   files       — root-relative file-presence probes.
//
// `claimedBy` names the container that claims this external at C2: when that
// container is detected, the ext node is suppressed at the container level
// (spec §2.5 / Open choice 1 — the container IS the deployment).
export const EXTERNAL_RULES = [
  {
    id: 'clerk',
    name: 'Clerk',
    deps: ['@clerk/'],
    envPrefixes: ['CLERK_', 'NEXT_PUBLIC_CLERK'],
    files: [],
    label: 'authenticates users via',
  },
  {
    id: 'convex',
    name: 'Convex',
    deps: ['convex'],
    envPrefixes: ['CONVEX_', 'NEXT_PUBLIC_CONVEX'],
    files: [],
    label: 'runs backend functions on',
    claimedBy: 'container.convex',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    deps: ['@ai-sdk/openai', 'openai'],
    envPrefixes: ['OPENAI_'],
    files: [],
    label: 'generates text via',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    deps: ['@openrouter/'],
    envPrefixes: ['OPENROUTER_'],
    files: [],
    label: 'routes LLM calls via',
  },
  {
    id: 'posthog',
    name: 'PostHog',
    deps: ['posthog-js', 'posthog-node'],
    envPrefixes: ['POSTHOG_', 'NEXT_PUBLIC_POSTHOG'],
    files: [],
    label: 'sends analytics to',
  },
  {
    id: 'webpush',
    name: 'Web Push service',
    deps: ['web-push'],
    envPrefixes: ['VAPID_', 'NEXT_PUBLIC_VAPID'],
    files: [],
    label: 'delivers notifications via',
  },
  {
    id: 'cloudflare',
    name: 'Cloudflare',
    deps: ['@opennextjs/cloudflare', 'wrangler'],
    envPrefixes: [],
    files: ['wrangler.jsonc', 'wrangler.toml', 'wrangler.json'],
    label: 'deployed on',
  },
  // Optional common-service rows (spec §2.4 "may add further rows").
  {
    id: 'supabase',
    name: 'Supabase',
    deps: ['@supabase/'],
    envPrefixes: ['SUPABASE_', 'NEXT_PUBLIC_SUPABASE'],
    files: [],
    label: 'stores data in',
  },
  {
    id: 'stripe',
    name: 'Stripe',
    deps: ['stripe', '@stripe/'],
    envPrefixes: ['STRIPE_', 'NEXT_PUBLIC_STRIPE'],
    files: [],
    label: 'processes payments via',
  },
  {
    id: 'firebase',
    name: 'Firebase',
    deps: ['firebase', 'firebase-admin', '@firebase/'],
    envPrefixes: ['FIREBASE_', 'NEXT_PUBLIC_FIREBASE'],
    files: [],
    label: 'uses platform services of',
  },
  {
    id: 'sentry',
    name: 'Sentry',
    deps: ['@sentry/'],
    envPrefixes: ['SENTRY_', 'NEXT_PUBLIC_SENTRY'],
    files: [],
    label: 'reports errors to',
  },
  {
    id: 'resend',
    name: 'Resend',
    deps: ['resend'],
    envPrefixes: ['RESEND_'],
    files: [],
    label: 'sends email via',
  },
  {
    id: 'twilio',
    name: 'Twilio',
    deps: ['twilio'],
    envPrefixes: ['TWILIO_'],
    files: [],
    label: 'sends messages via',
  },
];

/**
 * Normalize config `extra_externals` entries ({id, name, deps, env_prefixes,
 * files, label}) into rule rows appended after the built-in table.
 */
export function normalizeExtraExternals(extra) {
  if (!Array.isArray(extra)) return [];
  const rows = [];
  for (const e of extra) {
    if (!e || typeof e !== 'object' || Array.isArray(e)) continue;
    const id = sanitizeRuleId(e.id);
    if (!id) continue;
    rows.push({
      id,
      name: typeof e.name === 'string' && e.name !== '' ? e.name : id,
      deps: stringList(e.deps),
      envPrefixes: stringList(e.env_prefixes),
      files: stringList(e.files),
      label: typeof e.label === 'string' && e.label !== '' ? e.label : 'depends on',
    });
  }
  return rows;
}

function sanitizeRuleId(id) {
  if (typeof id !== 'string') return null;
  const s = id.toLowerCase().replace(/[^a-z0-9._-]/g, '');
  return s === '' ? null : s;
}

function stringList(v) {
  if (!Array.isArray(v)) return [];
  return v.filter((x) => typeof x === 'string' && x !== '');
}
