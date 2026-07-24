#!/usr/bin/env node
// Deterministic C4 extractor (spec §2.2–2.7). Pure static analysis of a
// checked-out tree → canonical C1/C2/C3 model.json + per-level sha256 hashes.
// Same tree + same config ⇒ byte-identical output (I1). Levels stop at
// component — never code-level (I9). No LLM, no network, no installs in the
// target, nothing written inside the tree unless --out points there.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { minimatch } from 'minimatch';
import { loadConfig, DEFAULTS } from './lib/load-config.mjs';
import { canonicalStringify, sha256Hex } from './lib/canonical-json.mjs';
import { EXTERNAL_RULES, normalizeExtraExternals } from './lib/external-systems.mjs';

const ALL_LEVELS = ['context', 'container', 'component'];
const DEFAULT_COMPONENT_ROOTS = ['app', 'src/app', 'lib', 'src/lib', 'convex'];
const FALLBACK_ALIASES = { '@/': './' };

const USAGE =
  'usage: arch-timelapse.sh extract [--tree <dir>] [--out <dir>] [--config <path>] [--levels a,b,c]';

// ---------------------------------------------------------------------------
// Deterministic primitives
// ---------------------------------------------------------------------------

/** Bytewise (UTF-8) string compare, so ordering never depends on locale. */
function cmpBytes(a, b) {
  return Buffer.compare(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}

function sortNodes(nodes) {
  return [...nodes].sort((a, b) => cmpBytes(a.id, b.id));
}

function sortEdges(edges) {
  return [...edges].sort(
    (a, b) => cmpBytes(a.from, b.from) || cmpBytes(a.to, b.to) || cmpBytes(a.label, b.label)
  );
}

/** Dedup on (from,to,label); drop self-edges and edges with a missing endpoint. */
function finishEdges(edges, nodeIds) {
  const seen = new Set();
  const out = [];
  for (const e of edges) {
    if (e.from === e.to) continue;
    if (!nodeIds.has(e.from) || !nodeIds.has(e.to)) continue;
    const key = `${e.from}|${e.to}|${e.label}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
  }
  return sortEdges(out);
}

/** Per-segment id sanitizer (§2.7.4): lowercase, charset [a-z0-9_-], empty → x. */
function sanitizeSegment(seg) {
  const s = seg.toLowerCase().replace(/[^a-z0-9_-]/g, '');
  return s === '' ? 'x' : s;
}

// ---------------------------------------------------------------------------
// Filesystem walk (scan set)
// ---------------------------------------------------------------------------

function isExcluded(rel, excludes) {
  return excludes.some((g) => minimatch(rel, g, { dot: true }));
}

/** A dir is pruned when it matches a glob directly or a glob's `/**` base. */
function isPrunedDir(rel, excludes) {
  return excludes.some((g) => {
    if (minimatch(rel, g, { dot: true })) return true;
    if (g.endsWith('/**') && minimatch(rel, g.slice(0, -3), { dot: true })) return true;
    return false;
  });
}

/**
 * Collect repo-relative source files: extension in source_extensions, not
 * excluded, never following symlinks, skipping files > max_file_bytes.
 * Directory listings are processed bytewise-sorted (§2.7.3).
 */
function collectSourceFiles(tree, excludes, sourceExts, maxBytes) {
  const out = [];
  const walk = (relDir) => {
    const abs = relDir === '' ? tree : path.join(tree, relDir);
    let entries;
    try {
      entries = fs.readdirSync(abs, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => cmpBytes(a.name, b.name));
    for (const ent of entries) {
      const rel = relDir === '' ? ent.name : `${relDir}/${ent.name}`;
      if (ent.isSymbolicLink()) continue;
      if (ent.isDirectory()) {
        if (isPrunedDir(rel, excludes)) continue;
        walk(rel);
      } else if (ent.isFile()) {
        const ext = path.posix.extname(ent.name).slice(1).toLowerCase();
        if (!sourceExts.has(ext)) continue;
        if (isExcluded(rel, excludes)) continue;
        let st;
        try {
          st = fs.statSync(path.join(tree, rel));
        } catch {
          continue;
        }
        if (st.size > maxBytes) continue;
        out.push(rel);
      }
    }
  };
  walk('');
  return out;
}

// ---------------------------------------------------------------------------
// Per-file harvesting (regex-based; never throws on exotic syntax)
// ---------------------------------------------------------------------------

// import/export … from '…' (multi-line safe: no quotes/semicolons may occur
// before the from-clause of a real import statement).
const RE_IMPORT_FROM = /\b(?:import|export)\s[^'";]*?\bfrom\s*(['"])([^'"]+)\1/g;
const RE_IMPORT_SIDE_EFFECT = /\bimport\s*(['"])([^'"]+)\1/g;
const RE_IMPORT_DYNAMIC = /\bimport\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const RE_REQUIRE = /\brequire\s*\(\s*(['"])([^'"]+)\1\s*\)/g;
const RE_ENV_DOT = /\bprocess\.env\.([A-Z][A-Z0-9_]*)(?![A-Za-z0-9_$])/g;
const RE_ENV_BRACKET = /\bprocess\.env\[\s*(['"])([A-Z][A-Z0-9_]*)\1\s*\]/g;
const RE_GENERATED_API = /_generated\/api(\.js)?$/;
const RE_API_MEMBER = /\b(?:api|internal)\.([A-Za-z_$][A-Za-z0-9_$]*)\./g;

function harvestFile(tree, rel) {
  let content;
  try {
    content = fs.readFileSync(path.join(tree, rel), 'utf8');
  } catch {
    content = '';
  }
  const specifiers = new Set();
  for (const re of [RE_IMPORT_FROM, RE_IMPORT_SIDE_EFFECT, RE_IMPORT_DYNAMIC, RE_REQUIRE]) {
    for (const m of content.matchAll(re)) specifiers.add(m[2]);
  }
  const envs = new Set();
  for (const m of content.matchAll(RE_ENV_DOT)) envs.add(m[1]);
  for (const m of content.matchAll(RE_ENV_BRACKET)) envs.add(m[2]);

  const importsGeneratedApi = [...specifiers].some((s) => RE_GENERATED_API.test(s));
  const apiModules = new Set();
  if (importsGeneratedApi) {
    for (const m of content.matchAll(RE_API_MEMBER)) apiModules.add(m[1]);
  }
  return { specifiers: [...specifiers].sort(cmpBytes), envs, apiModules };
}

/** npm package name of a bare specifier ("@scope/pkg/x" → "@scope/pkg"). */
function packageName(spec) {
  const parts = spec.split('/');
  return spec.startsWith('@') && parts.length > 1 ? `${parts[0]}/${parts[1]}` : parts[0];
}

/** Dep matcher semantics: trailing "/" = prefix, else exact (§2.4). */
function matchesDepMatcher(matcher, spec) {
  if (matcher.endsWith('/')) return spec.startsWith(matcher);
  return packageName(spec) === matcher;
}

// ---------------------------------------------------------------------------
// Import aliases (§3 import_aliases)
// ---------------------------------------------------------------------------

function deriveImportAliases(tree, configured) {
  if (configured && typeof configured === 'object' && !Array.isArray(configured)) {
    return { ...configured };
  }
  const tsPath = path.join(tree, 'tsconfig.json');
  if (!fs.existsSync(tsPath)) return { ...FALLBACK_ALIASES };
  let paths;
  try {
    paths = JSON.parse(fs.readFileSync(tsPath, 'utf8'))?.compilerOptions?.paths;
  } catch {
    console.error(
      'extract: tsconfig.json is not strict JSON; falling back to {"@/": "./"} import aliases'
    );
    return { ...FALLBACK_ALIASES };
  }
  if (!paths || typeof paths !== 'object' || Array.isArray(paths)) {
    return { ...FALLBACK_ALIASES };
  }
  const out = {};
  for (const [key, targets] of Object.entries(paths)) {
    if (!key.endsWith('/*')) continue;
    if (!Array.isArray(targets) || targets.length !== 1) continue;
    if (typeof targets[0] !== 'string' || !targets[0].endsWith('/*')) continue;
    out[key.slice(0, -1)] = targets[0].slice(0, -1); // "@/*"→"@/", "./*"→"./"
  }
  if (Object.keys(out).length === 0) {
    console.error(
      'extract: no single-target X/* entries in tsconfig compilerOptions.paths; falling back to {"@/": "./"} import aliases'
    );
    return { ...FALLBACK_ALIASES };
  }
  return out;
}

/**
 * Resolve a specifier to a repo-relative posix path, or null when it is a
 * bare package specifier (dropped at C3) or escapes the tree.
 */
function resolveSpecifier(spec, fileRel, aliasKeys, aliases) {
  let joined;
  if (spec.startsWith('./') || spec.startsWith('../')) {
    joined = path.posix.join(path.posix.dirname(fileRel), spec);
  } else {
    const key = aliasKeys.find((k) => spec.startsWith(k));
    if (!key) return null;
    joined = path.posix.join('.', aliases[key] + spec.slice(key.length));
  }
  const normalized = path.posix.normalize(joined);
  if (normalized === '..' || normalized.startsWith('../')) return null;
  return normalized === '.' ? '' : normalized;
}

// ---------------------------------------------------------------------------
// External rules (C1)
// ---------------------------------------------------------------------------

function ruleFires(rule, depNames, envNames, tree) {
  for (const m of rule.deps) {
    if (m.endsWith('/')) {
      for (const d of depNames) if (d.startsWith(m)) return true;
    } else if (depNames.has(m)) {
      return true;
    }
  }
  for (const p of rule.envPrefixes) {
    for (const e of envNames) if (e.startsWith(p)) return true;
  }
  for (const f of rule.files) {
    try {
      if (fs.statSync(path.join(tree, f)).isFile()) return true;
    } catch {
      /* absent → keep probing */
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Containers (C2, §2.5)
// ---------------------------------------------------------------------------

function dirHasTsJsOutsideGenerated(tree, relDir) {
  const abs = path.join(tree, relDir);
  let entries;
  try {
    entries = fs.readdirSync(abs, { withFileTypes: true });
  } catch {
    return false;
  }
  entries.sort((a, b) => cmpBytes(a.name, b.name));
  for (const ent of entries) {
    if (ent.isSymbolicLink()) continue;
    if (ent.isDirectory()) {
      if (ent.name === '_generated') continue;
      if (dirHasTsJsOutsideGenerated(tree, `${relDir}/${ent.name}`)) return true;
    } else if (ent.isFile() && /\.(ts|js)$/.test(ent.name)) {
      return true;
    }
  }
  return false;
}

function firstExistingFile(tree, candidates) {
  for (const rel of candidates) {
    try {
      if (fs.statSync(path.join(tree, rel)).isFile()) return rel;
    } catch {
      /* keep probing */
    }
  }
  return null;
}

function detectContainers(tree, pkg, depNames) {
  const containers = [];
  if (depNames.has('next')) {
    containers.push({ id: 'container.web', name: 'Next.js web app', tech: 'Next.js' });
  } else if (depNames.has('vite') || depNames.has('@vitejs/plugin-react')) {
    containers.push({ id: 'container.web', name: 'Vite web app', tech: 'Vite' });
  } else if (pkg && pkg.scripts && (pkg.scripts.dev || pkg.scripts.start)) {
    containers.push({ id: 'container.web', name: 'Web app' });
  }

  let convexDir = null;
  try {
    if (fs.statSync(path.join(tree, 'convex')).isDirectory()) convexDir = 'convex';
  } catch {
    /* absent */
  }
  if (convexDir && dirHasTsJsOutsideGenerated(tree, convexDir)) {
    containers.push({ id: 'container.convex', name: 'Convex backend', tech: 'Convex' });
  }

  const cronsFile = firstExistingFile(tree, ['convex/crons.ts', 'convex/crons.js']);
  if (cronsFile) {
    containers.push({
      id: 'container.crons',
      name: 'Convex cron scheduler',
      tech: 'Convex crons',
      file: cronsFile,
    });
  }

  const middlewareFile = firstExistingFile(tree, [
    'middleware.ts',
    'middleware.js',
    'src/middleware.ts',
    'src/middleware.js',
  ]);
  if (middlewareFile) {
    containers.push({ id: 'container.middleware', name: 'Edge middleware', file: middlewareFile });
  }

  const swFile = firstExistingFile(tree, ['public/sw.js', 'public/service-worker.js']);
  if (swFile) {
    containers.push({ id: 'container.sw', name: 'Service worker', file: swFile });
  }

  return containers;
}

function containerNode(c) {
  const node = { id: c.id, name: c.name, kind: 'container' };
  if (c.tech) node.tech = c.tech;
  return node;
}

// ---------------------------------------------------------------------------
// Components (C3, §2.6)
// ---------------------------------------------------------------------------

function resolveComponentRoots(tree, configured) {
  const roots = Array.isArray(configured) ? configured : DEFAULT_COMPONENT_ROOTS;
  return roots.filter((r) => {
    try {
      return fs.statSync(path.join(tree, r)).isDirectory();
    } catch {
      return false;
    }
  });
}

/**
 * Enumerate first-level entries of each component root (§2.6): a directory →
 * one component; a source-extension file → one component (name sans
 * extension). `_generated`, exclude-glob matches, and non-source files skip.
 */
function enumerateComponents(tree, roots, excludes, sourceExts) {
  const entries = [];
  for (const root of roots) {
    const containerId = root === 'convex' ? 'container.convex' : 'container.web';
    const short = root === 'convex' ? 'convex' : 'web';
    let dirents;
    try {
      dirents = fs.readdirSync(path.join(tree, root), { withFileTypes: true });
    } catch {
      continue;
    }
    dirents.sort((a, b) => cmpBytes(a.name, b.name));
    for (const ent of dirents) {
      if (ent.isSymbolicLink()) continue;
      if (ent.name === '_generated') continue;
      const rel = `${root}/${ent.name}`;
      if (ent.isDirectory()) {
        if (isPrunedDir(rel, excludes)) continue;
        entries.push({ type: 'dir', name: rel, matchPath: rel, containerId, short });
      } else if (ent.isFile()) {
        const ext = path.posix.extname(ent.name).slice(1).toLowerCase();
        if (!sourceExts.has(ext)) continue;
        if (isExcluded(rel, excludes)) continue;
        const sansExt = rel.slice(0, -(ext.length + 1));
        entries.push({ type: 'file', name: sansExt, matchPath: sansExt, containerId, short });
      }
    }
  }
  assignComponentIds(entries);
  return entries;
}

/**
 * §2.7.4 ids incl. deterministic collision suffixes (-2, -3, … by name).
 * Deviation from the literal per-group recipe (recorded in spec execution
 * notes): ids are assigned GLOBALLY — pass 1 collects every entry's sanitized
 * candidate, pass 2 skips any suffix whose resulting id equals another
 * entry's candidate or an already-assigned id, so ids stay unique across the
 * whole model (§2.3) even when `app/foo!` would suffix to `app/foo-2`'s
 * candidate. Deterministic (I1): candidates, grouping, and assignment order
 * derive only from the bytewise-sorted entries.
 */
function assignComponentIds(entries) {
  // Pass 1: sanitize candidates, group entries by candidate.
  const byCandidate = new Map();
  for (const e of entries) {
    let segments = e.name.split('/');
    if (e.short === 'convex') segments = segments.slice(1); // drop redundant root
    const candidate = `comp.${e.short}.${segments.map(sanitizeSegment).join('.')}`;
    if (!byCandidate.has(candidate)) byCandidate.set(candidate, []);
    byCandidate.get(candidate).push(e);
  }
  // Pass 2: resolve collisions against the full candidate set + assigned ids.
  const assigned = new Set();
  for (const [candidate, group] of byCandidate) {
    group.sort((a, b) => cmpBytes(a.name, b.name));
    for (const e of group) {
      let id = candidate;
      for (let n = 2; assigned.has(id) || (id !== candidate && byCandidate.has(id)); n++) {
        id = `${candidate}-${n}`;
      }
      e.id = id;
      assigned.add(id);
    }
  }
}

function stripSourceExt(p, sourceExts) {
  const ext = path.posix.extname(p).slice(1).toLowerCase();
  return ext !== '' && sourceExts.has(ext) ? p.slice(0, -(ext.length + 1)) : p;
}

/** Owning/target component of a repo-relative path: longest entry-path match. */
function componentForPath(p, entries, sourceExts) {
  const sansExt = stripSourceExt(p, sourceExts);
  let best = null;
  for (const e of entries) {
    const hit =
      e.type === 'dir'
        ? p === e.matchPath || p.startsWith(`${e.matchPath}/`)
        : sansExt === e.matchPath;
    if (hit && (!best || e.matchPath.length > best.matchPath.length)) best = e;
  }
  return best;
}

// ---------------------------------------------------------------------------
// Core: extractModel (frozen seam for B3)
// ---------------------------------------------------------------------------

/**
 * extractModel(treeDir, config) -> { model, modelHash, levelHashes }
 * Pure function of (tree contents, config): no clock, no environment, no
 * filesystem-order dependence.
 */
export async function extractModel(treeDir, config) {
  const tree = path.resolve(treeDir);
  const cfg = { ...DEFAULTS, ...config };
  const levels = cfg.levels ?? ALL_LEVELS;
  for (const l of levels) {
    if (!ALL_LEVELS.includes(l)) throw new Error(`unknown level: ${l}`);
  }
  const wantContainer = levels.includes('container');
  const wantComponent = levels.includes('component');

  // Root package.json (v1: root only, no workspace aggregation).
  let pkg = null;
  try {
    pkg = JSON.parse(fs.readFileSync(path.join(tree, 'package.json'), 'utf8'));
  } catch {
    pkg = null;
  }
  const depNames = new Set([
    ...Object.keys(pkg?.dependencies ?? {}),
    ...Object.keys(pkg?.devDependencies ?? {}),
  ]);
  const systemName =
    (typeof cfg.system_name === 'string' && cfg.system_name !== '' && cfg.system_name) ||
    (typeof pkg?.name === 'string' && pkg.name !== '' && pkg.name) ||
    path.basename(tree);

  // Shared source scan set (§2.6) + per-file harvest.
  const excludes = Array.isArray(cfg.exclude) ? cfg.exclude : [];
  const sourceExts = new Set(
    (Array.isArray(cfg.source_extensions) ? cfg.source_extensions : []).map((e) =>
      String(e).toLowerCase()
    )
  );
  const scanFiles = collectSourceFiles(tree, excludes, sourceExts, cfg.max_file_bytes);
  const harvested = new Map();
  const envNames = new Set();
  for (const rel of scanFiles) {
    const h = harvestFile(tree, rel);
    harvested.set(rel, h);
    for (const e of h.envs) envNames.add(e);
  }

  // External rules: builtin rows then extra_externals; first row wins an id.
  const rules = [];
  const seenRuleIds = new Set();
  for (const r of [...EXTERNAL_RULES, ...normalizeExtraExternals(cfg.extra_externals)]) {
    if (seenRuleIds.has(r.id)) continue;
    seenRuleIds.add(r.id);
    rules.push(r);
  }
  const fired = rules.filter((r) => ruleFires(r, depNames, envNames, tree));

  const model = { schema_version: 1, system_name: systemName, levels: {} };

  // --- C1 context ---
  if (levels.includes('context')) {
    const nodes = [
      { id: 'person.user', name: 'User', kind: 'person' },
      { id: 'system.app', name: systemName, kind: 'system' },
      ...fired.map((r) => ({ id: `ext.${r.id}`, name: r.name, kind: 'external' })),
    ];
    const edges = [
      { from: 'person.user', to: 'system.app', label: 'uses' },
      ...fired.map((r) => ({ from: 'system.app', to: `ext.${r.id}`, label: r.label })),
    ];
    const ids = new Set(nodes.map((n) => n.id));
    model.levels.context = { nodes: sortNodes(nodes), edges: finishEdges(edges, ids) };
  }

  // --- shared C2/C3 inputs ---
  const containers = wantContainer || wantComponent ? detectContainers(tree, pkg, depNames) : [];
  const containerIds = new Set(containers.map((c) => c.id));
  const componentRoots =
    wantContainer || wantComponent ? resolveComponentRoots(tree, cfg.component_roots) : [];

  // --- C2 container ---
  if (wantContainer) {
    const keptExternals = fired.filter(
      (r) => !(r.claimedBy && containerIds.has(r.claimedBy))
    );
    const nodes = [
      { id: 'person.user', name: 'User', kind: 'person' },
      { id: 'system.app', name: systemName, kind: 'system' },
      ...containers.map(containerNode),
      ...keptExternals.map((r) => ({ id: `ext.${r.id}`, name: r.name, kind: 'external' })),
    ];
    const edges = [
      { from: 'person.user', to: 'container.web', label: 'uses' },
      { from: 'container.web', to: 'container.convex', label: 'queries and mutates' },
      { from: 'container.crons', to: 'container.convex', label: 'schedules functions in' },
      { from: 'container.middleware', to: 'container.web', label: 'guards requests to' },
      { from: 'container.sw', to: 'container.web', label: 'caches app shell of' },
    ];

    // Evidence edges container → external (§2.5 file sets).
    const webRoots = componentRoots.filter((r) => r !== 'convex');
    const fileSetOf = (c) => {
      if (c.id === 'container.web') {
        return scanFiles.filter(
          (rel) =>
            !rel.startsWith('convex/') &&
            (!rel.includes('/') || webRoots.some((r) => rel.startsWith(`${r}/`)))
        );
      }
      if (c.id === 'container.convex') {
        return scanFiles.filter(
          (rel) => rel.startsWith('convex/') && !rel.includes('_generated/')
        );
      }
      return c.file && harvested.has(c.file) ? [c.file] : [];
    };
    for (const c of containers) {
      const specs = new Set();
      const envs = new Set();
      for (const rel of fileSetOf(c)) {
        const h = harvested.get(rel);
        if (!h) continue;
        for (const s of h.specifiers) {
          if (!s.startsWith('./') && !s.startsWith('../')) specs.add(s);
        }
        for (const e of h.envs) envs.add(e);
      }
      for (const r of fired) {
        const depHit = r.deps.some((m) => [...specs].some((s) => matchesDepMatcher(m, s)));
        const envHit = r.envPrefixes.some((p) => [...envs].some((e) => e.startsWith(p)));
        if (depHit || envHit) edges.push({ from: c.id, to: `ext.${r.id}`, label: r.label });
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    model.levels.container = { nodes: sortNodes(nodes), edges: finishEdges(edges, ids) };
  }

  // --- C3 component ---
  if (wantComponent) {
    const components = enumerateComponents(tree, componentRoots, excludes, sourceExts);
    const componentIds = new Set(components.map((e) => e.id));

    // Parent container nodes: those owning ≥1 component. Synthesized with the
    // generic name when a parent was not detected at C2 (e.g. app/ exists but
    // no package.json) so components always have a rendering subgraph parent.
    const parentIds = [...new Set(components.map((e) => e.containerId))];
    const parents = parentIds.map((id) => {
      const detected = containers.find((c) => c.id === id);
      if (detected) return containerNode(detected);
      return {
        id,
        name: id === 'container.convex' ? 'Convex backend' : 'Web app',
        kind: 'container',
      };
    });

    const nodes = [
      ...parents,
      ...components.map((e) => ({
        id: e.id,
        name: e.name,
        kind: 'component',
        container: e.containerId,
      })),
    ];

    const edges = [];
    const aliases = deriveImportAliases(tree, cfg.import_aliases);
    const aliasKeys = Object.keys(aliases).sort((a, b) => b.length - a.length || cmpBytes(a, b));
    for (const rel of scanFiles) {
      const source = componentForPath(rel, components, sourceExts);
      if (!source) continue;
      const h = harvested.get(rel);
      // 1. Import edges over resolved relative/alias specifiers.
      for (const spec of h.specifiers) {
        const resolved = resolveSpecifier(spec, rel, aliasKeys, aliases);
        if (resolved === null || resolved === '') continue;
        const target = componentForPath(resolved, components, sourceExts);
        if (target && target.id !== source.id) {
          edges.push({ from: source.id, to: target.id, label: 'imports' });
        }
      }
      // 2. Convex call edges: api.<module>. / internal.<module>. references in
      // files that import a `_generated/api` specifier.
      for (const mod of h.apiModules) {
        const targetId = `comp.convex.${sanitizeSegment(mod)}`;
        if (componentIds.has(targetId)) {
          edges.push({ from: source.id, to: targetId, label: 'calls' });
        }
      }
    }
    const ids = new Set(nodes.map((n) => n.id));
    model.levels.component = { nodes: sortNodes(nodes), edges: finishEdges(edges, ids) };
  }

  // --- hashes (§2.7.2) ---
  const levelHashes = {};
  for (const level of Object.keys(model.levels)) {
    levelHashes[level] = await sha256Hex(canonicalStringify(model.levels[level]));
  }
  const modelHash = await sha256Hex(canonicalStringify(model));

  return { model, modelHash, levelHashes };
}

// ---------------------------------------------------------------------------
// CLI (§2.2)
// ---------------------------------------------------------------------------

function usageError(msg) {
  console.error(`extract: ${msg}`);
  console.error(USAGE);
  process.exit(2);
}

function parseArgs(argv) {
  const o = { tree: null, out: null, config: null, levels: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--tree' || a === '--out' || a === '--config' || a === '--levels') {
      const v = argv[++i];
      if (v === undefined) usageError(`${a} requires a value`);
      o[a.slice(2)] = v;
    } else {
      usageError(`unknown flag: ${a}`);
    }
  }
  return o;
}

async function main() {
  const args = parseArgs(process.argv);

  const tree = path.resolve(args.tree ?? process.cwd());
  let treeStat;
  try {
    treeStat = fs.statSync(tree);
    fs.accessSync(tree, fs.constants.R_OK | fs.constants.X_OK);
  } catch {
    treeStat = null;
  }
  if (!treeStat || !treeStat.isDirectory()) {
    console.error(`extract: --tree is not a readable directory: ${tree}`);
    process.exit(3);
  }

  const config = loadConfig(tree, args.config ? path.resolve(args.config) : null);

  let levels = config.levels ?? ALL_LEVELS;
  if (args.levels !== null) {
    levels = args.levels
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s !== '');
    if (levels.length === 0) usageError('--levels requires at least one level');
  }
  for (const l of levels) {
    if (!ALL_LEVELS.includes(l)) {
      usageError(`unknown level "${l}" (expected: ${ALL_LEVELS.join(', ')})`);
    }
  }
  levels = [...new Set(levels)];

  const outDir = path.resolve(
    args.out ?? path.join(tree, config.output_dir ?? '.arch-timelapse', 'model')
  );

  const { model, modelHash, levelHashes } = await extractModel(tree, { ...config, levels });

  const hashesDoc = { schema_version: 1, model: modelHash, levels: levelHashes };
  try {
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'model.json'), `${canonicalStringify(model)}\n`);
    fs.writeFileSync(path.join(outDir, 'hashes.json'), `${canonicalStringify(hashesDoc)}\n`);
  } catch (err) {
    console.error(`extract: cannot write to --out ${outDir}: ${err.message}`);
    process.exit(3);
  }

  const summary = {};
  for (const level of Object.keys(model.levels)) {
    summary[level] = {
      nodes: model.levels[level].nodes.length,
      edges: model.levels[level].edges.length,
      hash: levelHashes[level],
    };
  }
  console.log(JSON.stringify({ ok: true, out: outDir, levels: summary }));
}

// Run the CLI only when invoked directly (extractModel stays importable, B3 seam).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    console.error(`extract: ${err.message}`);
    process.exit(3);
  });
}
