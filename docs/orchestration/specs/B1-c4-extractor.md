# B1 — `architecture-evolution-timelapse`: scaffold + deterministic C4 extractor

Item: B1 (backlog `docs/orchestration/backlog.md:45`). Design:
`docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md:94-131` + Decisions
addendum `:148-162`. Invariants in force: **I1, I4, I6, I7, I9** (backlog.md:19-34).
Consumers: B2 (Mermaid render) reads `model.json`; B3 (history walk) reads per-level
hashes. Everything under "Model JSON shape" and "Canonicalisation rules" is a frozen
contract for them.

## 1. Goal

Create the new sibling skill directory `architecture-evolution-timelapse/` (mirroring the
two-repo layout of `frontend-evolution-timelapse/SKILL.md:21-31`) and implement a
deterministic, pure-static-analysis C4 extractor: given a checked-out tree, emit a
canonical C1/C2/C3 architecture model as JSON plus a sha256 hash per level. Same tree +
same config ⇒ byte-identical `model.json` and `hashes.json` (I1).

**Non-goals:** no history walk, no worktrees, no Mermaid, no video, no init interview
(B2–B4). No code-level C4 (I9). No monorepo/workspace package.json aggregation (root
`package.json` only, v1). No dev server, install, or secrets — the design guarantees
extraction runs on 75-proof without them (design spec `:129-130`).

## 2. Requirements

### 2.1 Skill scaffold

Mirror the reference skill's structure:

- `architecture-evolution-timelapse/SKILL.md` — valid frontmatter (`name`,
  `description`); body: what it does, two-repo model, bootstrap (`npm ci` only — note
  that Playwright Chromium install is deferred to the render stage), quick start
  (`init`, `extract`), link to `references/config-schema.md`. B4 rewrites for final
  polish; B1 ships a correct minimal version.
- `architecture-evolution-timelapse/references/config-schema.md` — the table in §3.
- `architecture-evolution-timelapse/.gitignore` — `scripts/node_modules/` (mirror
  `frontend-evolution-timelapse/.gitignore:1`).
- `architecture-evolution-timelapse/scripts/arch-timelapse.sh` — bash shim exec'ing the
  node dispatcher, byte-for-byte pattern of
  `frontend-evolution-timelapse/scripts/timelapse.sh:1-4`.
- `scripts/arch-timelapse.mjs` — subcommand dispatcher (arg-parse pattern of
  `frontend-evolution-timelapse/scripts/timelapse.mjs:16-53`). B1 subcommands: `init`,
  `extract`. Unknown subcommand: usage on stderr, exit 2. Reserved for later items:
  `run`, `stitch-only`, `clean`.
- `scripts/init-config.mjs` — non-interactive config writer mirroring
  `frontend-evolution-timelapse/scripts/init-config.mjs:32-34` (`--stdin-json`) and
  `:61-74` (YAML write + append output dir to target `.gitignore`). Writes
  `.arch-timelapse.yaml`; appends `.arch-timelapse/` to the target repo's `.gitignore`.
  The interview that produces the stdin JSON is B4 (I4 is satisfied in B1 by fields +
  defaults + this pipe, per backlog item split).
- `scripts/extract-model.mjs` — the extractor (§2.2–2.6), runnable directly or via the
  dispatcher.
- `scripts/lib/resolve-skill-root.mjs`, `scripts/lib/canonical-json.mjs` — duplicated
  from `frontend-evolution-timelapse/scripts/lib/resolve-skill-root.mjs:4-8` and
  `.../lib/canonical-json.mjs:2-19`, each carrying a provenance comment naming the
  source file (I6 — no cross-skill imports).
- `scripts/lib/load-config.mjs` — same shape as
  `frontend-evolution-timelapse/scripts/lib/load-config.mjs:47-67` but with this skill's
  DEFAULTS (§3) and one deliberate difference: a **missing config file does not throw**
  (reference throws at `load-config.mjs:49-51`); it returns DEFAULTS and prints a
  one-line stderr notice. Required so `extract` can run against a read-only target that
  has no `.arch-timelapse.yaml` (75-proof is read-only).
- `scripts/lib/external-systems.mjs` — the C1 rule table (§2.4) as a data module.
- `scripts/package.json` + committed `scripts/package-lock.json` — `"private": true`,
  `"type": "module"`, dependencies **exactly** `yaml` and `minimatch` (I7; reference
  dep set at `frontend-evolution-timelapse/scripts/package.json:5-9`). `playwright` and
  `mermaid` are added by B2, not B1. Nothing in B1 may import playwright or invoke
  ffmpeg.

Internal decomposition beyond the named files is the executor's choice.

### 2.2 `extract` CLI contract

`arch-timelapse.sh extract [--tree <dir>] [--out <dir>] [--config <path>] [--levels a,b,c]`

- `--tree` default: cwd. Must be a readable directory; else exit 3.
- `--config` default: `<tree>/.arch-timelapse.yaml`; missing ⇒ DEFAULTS + stderr notice.
- `--out` default: `<tree>/.arch-timelapse/model`. Created if absent. When `--out` is
  outside the tree and no config exists in the tree, extract writes **nothing** inside
  the tree (read-only guarantee for 75-proof).
- `--levels` filters which levels are computed/emitted; default = config `levels`.
- Writes `model.json` and `hashes.json` to `--out` (overwrite; extraction is stateless
  and idempotent — re-running is the resume story).
- stdout: exactly **one JSON line**: ok flag, out path, per-level node/edge counts,
  per-level hashes (matches the one-line-per-step quiet ethos of the reference skill,
  `frontend-evolution-timelapse/SKILL.md:61-62`).
- Exit codes: 0 success; 2 usage error; 3 preflight failure (unreadable tree,
  unwritable out). A tree with no `package.json` and no recognizable roots is NOT an
  error — it yields a minimal valid model (person + system only), exit 0.

One signature for the core, to fix the seam B3 will call:
`extractModel(treeDir, config) -> { model, levelHashes }`.

### 2.3 Model JSON shape (frozen contract for B2/B3)

`model.json` top level: `schema_version` (int, `1`), `system_name` (string), `levels`
(object containing exactly the computed levels among `context`, `container`,
`component`). Each level is `{ nodes: [...], edges: [...] }`.

Node fields (omit a field entirely when empty — no nulls):

| field | type | notes |
|---|---|---|
| `id` | string | unique across the whole model; charset `[a-z0-9._-]`; rules in §2.7 |
| `name` | string | display label; original casing/path (e.g. `app/(dashboard)`) |
| `kind` | string | `person` \| `system` \| `external` \| `container` \| `component` |
| `tech` | string? | fixed per rule table (e.g. `Next.js`, `Convex`); never free-form |
| `container` | string? | component nodes only: owning container id |

Edge fields: `from` (node id), `to` (node id), `label` (string, always present, fixed
vocabulary from the rules below — never free-form). Edges are deduplicated on
(from,to,label); self-edges dropped; edges with a missing endpoint dropped.

`hashes.json`: `schema_version` (`1`), `model` (sha256 hex of the full canonical
model), `levels` (map level → sha256 hex of that level's canonical `{nodes, edges}`
subtree). B3's per-level change detection compares `levels.<name>` strings only.

### 2.4 C1 — Context level

Nodes: exactly one `person.user` (kind person, name `User`), one `system.app` (kind
system, name = `system_name`), plus one `ext.<rule-id>` node per fired external rule.
Edges: `person.user → system.app` label `uses`; `system.app → ext.<rule-id>` with the
rule's label.

`system_name` resolution: config `system_name`, else root `package.json` `name`
(75-proof: `earned`, `package.json:2`), else tree directory basename.

External rules fire on: (a) a dependency-name match against the union of root
`package.json` `dependencies` + `devDependencies`, (b) an env-var-prefix match against
the harvested env set (§2.6), or (c) a file-presence probe. The shipped table MUST
contain at least these seven rows, whose detectors are anchored in 75-proof:

| rule id | dep matchers (exact or prefix `/`) | env prefixes | file probe | name | C1 edge label | 75-proof evidence |
|---|---|---|---|---|---|---|
| `clerk` | `@clerk/` | `CLERK_`, `NEXT_PUBLIC_CLERK` | — | Clerk | `authenticates users via` | package.json:17; middleware.ts:1-3; convex/auth.config.ts:4 |
| `convex` | `convex` (exact) | `CONVEX_`, `NEXT_PUBLIC_CONVEX` | — | Convex | `runs backend functions on` | package.json:37; lib/convex-http.ts:1-12 |
| `openai` | `@ai-sdk/openai`, `openai` (exact) | `OPENAI_` | — | OpenAI | `generates text via` | package.json:16 |
| `openrouter` | `@openrouter/` | `OPENROUTER_` | — | OpenRouter | `routes LLM calls via` | package.json:19; convex/coachActions.ts:125-126 |
| `posthog` | `posthog-js`, `posthog-node` (exact) | `POSTHOG_`, `NEXT_PUBLIC_POSTHOG` | — | PostHog | `sends analytics to` | package.json:42-43; instrumentation-client.ts:1-11; next.config.ts:10-16 |
| `webpush` | `web-push` (exact) | `VAPID_`, `NEXT_PUBLIC_VAPID` | — | Web Push service | `delivers notifications via` | package.json:51; convex/pushActions.ts:4,32 |
| `cloudflare` | `@opennextjs/cloudflare`, `wrangler` (exact) | — | `wrangler.jsonc\|.toml\|.json` at root | Cloudflare | `deployed on` | wrangler.jsonc:3-4; package.json:18,74 |

The executor may add further rows for common services (supabase, stripe, firebase,
sentry, resend, twilio) using the same three detector kinds; row order in the module is
the fixed evaluation order, and output order is by node id regardless. Config
`extra_externals` (list of `{id, name, deps, env_prefixes, files, label}`) appends
user rows.

`convex-test` must NOT fire the `convex` exact matcher (exact means exact).

### 2.5 C2 — Container level

Nodes: `person.user`, `system.app` (kind system — the boundary; included so a system
rename changes the C2 hash), detected containers, and fired externals **except**
externals claimed by a detected container — the `convex` rule is claimed by
`container.convex`, so `ext.convex` is suppressed at C2 when that container exists
(see Open choices).

Container detection rules (all path probes relative to tree root; also probe `src/`
variants where noted):

| container id | probe | name | tech | 75-proof evidence |
|---|---|---|---|---|
| `container.web` | dep `next` → Next.js; else dep `vite` or `@vitejs/plugin-react` → Vite; else `package.json` with `dev` or `start` script → generic | `Next.js web app` (or `Vite web app` / `Web app`) | `Next.js` etc. | package.json:5-6,40 |
| `container.convex` | dir `convex/` with ≥1 `.ts`/`.js` file outside `_generated/` | `Convex backend` | `Convex` | convex/schema.ts et al. |
| `container.crons` | file `convex/crons.ts` or `.js` | `Convex cron scheduler` | `Convex crons` | convex/crons.ts:1-14 |
| `container.middleware` | file `middleware.ts|.js` at root or `src/` | `Edge middleware` | — | middleware.ts:1-3 |
| `container.sw` | file `public/sw.js` or `public/service-worker.js` | `Service worker` | — | public/sw.js:5-6 |

Fixed edges (emit only when both endpoints exist): `person.user → container.web`
`uses`; `container.web → container.convex` `queries and mutates`; `container.crons →
container.convex` `schedules functions in`; `container.middleware → container.web`
`guards requests to`; `container.sw → container.web` `caches app shell of`.

Evidence edges container → external: for each container's file set, if any file imports
a package matched by an external rule's dep matchers, or references an env var matched
by its prefixes, emit `container → ext.<rule>` with the rule's label. File sets:
`container.web` = the web component roots (§2.6) minus `convex/`, plus root-level
source files (this catches `instrumentation-client.ts` → PostHog); `container.convex` =
`convex/` minus `_generated/`; `container.crons` = the crons file; `container.middleware`
= the middleware file; `container.sw` = the sw file. Expected on 75-proof, among
others: `container.middleware → ext.clerk` (middleware.ts:1-3), `container.convex →
ext.openrouter` (coachActions.ts:125-126), `container.convex → ext.webpush`
(pushActions.ts:4), `container.convex → ext.clerk` (auth.config.ts:4).

### 2.6 C3 — Component level

Component roots default (config `component_roots`): the existing directories among
`app`, `src/app`, `lib`, `src/lib`, `convex` — exactly the design's list ("`convex/*.ts`
functions, `app/` route groups, `lib/` modules", design spec `:113-114`).
`components/` and `hooks/` are intentionally NOT default roots (node-count control;
user can add via config). Root → container assignment: `convex` → `container.convex`;
all others → `container.web`.

Per root, every first-level entry becomes one component node: a directory → component
named by its relative path (e.g. `app/(dashboard)`); a source-extension file →
component named by relative path sans extension (e.g. `lib/utils`). Skipped:
`_generated`, files matching `exclude` globs (tests, specs, `__tests__`), non-source
files (README, tsconfig, images, css).

C3 nodes: the container nodes that own ≥1 component (kind container, same ids as C2 —
they are the rendering subgraph parents) plus the component nodes. `person.user` and
`system.app` are NOT in C3.

C3 edges, two derivations, both file-content based over the source scan set:

1. **Import edges** (`label: imports`). Harvest module specifiers from static imports,
   side-effect imports, re-exports (`export … from`), dynamic `import(…)` and
   `require(…)` with a string-literal specifier, matched over whole file content.
   Resolve: relative specifiers against the importing file's directory; alias
   specifiers via `import_aliases` (§3; 75-proof `@/*` → `./*` at tsconfig.json:21-23).
   Bare package specifiers are dropped at C3 (they feed C2 evidence only). Map the
   resolved repo-relative path to a target component: the component whose entry path
   (directory prefix, or file path sans extension) matches. Emit source-component →
   target-component.
2. **Convex call edges** (`label: calls`). In any file that imports a specifier ending
   `_generated/api` (alias form `@/convex/_generated/api` at
   `app/(dashboard)/dashboard/page.tsx:4`, or relative form `./_generated/api` at
   convex/crons.ts:2), every member reference `api.<module>.` or `internal.<module>.`
   emits an edge from the file's component to `comp.convex.<module>` when that
   component exists. Expected on 75-proof: `comp.web.app.dashboard →
   comp.convex.users` (page.tsx:134), `… → comp.convex.challenges` (page.tsx:218),
   `comp.convex.crons → comp.convex.challenges` (crons.ts:13), `comp.convex.crons →
   comp.convex.reminders` (crons.ts:23).

**Source scan set** (shared by env harvest, C2 evidence, C3 edges): files under the
tree with extension in `source_extensions`, excluding `exclude` globs (minimatch),
never following symlinks, skipping files larger than `max_file_bytes`. Env harvest
matches `process.env.` dot access where the name is uppercase-snake
(`[A-Z][A-Z0-9_]*`), plus bracket access with a single- or double-quoted literal of the
same shape (verified surface on 75-proof: 13 distinct names including
`NEXT_PUBLIC_CONVEX_URL`, `OPENROUTER_API_KEY`, `VAPID_PUBLIC_KEY`,
`CLERK_JWT_ISSUER_DOMAIN`).

### 2.7 Canonicalisation rules (frozen contract; I1)

1. Serialization: `canonicalStringify` — recursively key-sorted, compact
   `JSON.stringify` (semantics of
   `frontend-evolution-timelapse/scripts/lib/canonical-json.mjs:2-14`) — encoded UTF-8
   with exactly one trailing LF. Both `model.json` and `hashes.json`.
2. Hashes: lowercase sha256 hex. Level hash input = `canonicalStringify` of that
   level's `{nodes, edges}` object (no trailing newline in hash input). `model` hash
   input = `canonicalStringify` of the full model document.
3. Ordering: `nodes` sorted by `id` bytewise ascending; `edges` sorted by `from`, then
   `to`, then `label`. Directory listings processed in bytewise-sorted order so no
   output depends on filesystem iteration order.
4. IDs: fixed ids `person.user`, `system.app`; externals `ext.<rule-id>`; containers
   per §2.5 table; components `comp.<container-short>.<sanitized-path>` where
   container-short is `web` or `convex`. For the `convex` root, drop the redundant
   leading `convex` segment (`convex/users.ts` → `comp.convex.users`); for web roots
   keep the root segment (`app/(dashboard)` → `comp.web.app.dashboard`,
   `lib/utils.ts` → `comp.web.lib.utils`). Per segment:
   lowercase, strip characters outside `[a-z0-9_-]`, empty result → `x`; join segments
   with `.`. Collisions: order the colliding original names bytewise; first keeps the
   id, later ones append `-2`, `-3`, ….
5. Content bans: no timestamps, no absolute paths, no hostnames, no dependency
   **versions** (a version bump is not an architecture change), no config echo, no
   node/npm versions.
6. Determinism acceptance is behavioral: two consecutive runs on the same tree produce
   byte-identical files (checked below).

## 3. Config schema — `.arch-timelapse.yaml` (target repo)

| field | type | default | asked-at-init? |
|---|---|---|---|
| `system_name` | string | root `package.json` name, else dir basename | yes (B4 interview; B1 accepts via `--stdin-json`) |
| `levels` | string list | `[context, container, component]` | yes (B4; design addendum `:150-152`) |
| `component_roots` | string list | auto: existing among `app`, `src/app`, `lib`, `src/lib`, `convex` | no (documented) |
| `exclude` | glob list | `node_modules/**`, `.git/**`, `**/_generated/**`, `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `.next/**`, `dist/**`, `build/**`, `coverage/**`, `.arch-timelapse/**` | no |
| `import_aliases` | map | `null` → derive from tsconfig `compilerOptions.paths` entries of the single-target `X/* → [Y/*]` form (parse as strict JSON; on parse failure fall back), fallback `{"@/": "./"}` | no |
| `extra_externals` | rule list | `[]` | no |
| `source_extensions` | string list | `ts, tsx, js, jsx, mjs, cjs, mts, cts` | no |
| `max_file_bytes` | int | `1048576` | no |
| `output_dir` | string | `.arch-timelapse` | no |

Reserved field names for B3/B4 (do not implement, do not repurpose): `collapse_mode`,
`fps`, `max_hold_ms`, `max_commits`, `history_mode`. Dedup threshold does not exist in
this skill — change detection is hash equality, not pixel diff.

## Slices

### Slice 1 — scaffold, shared libs, config, CLI skeleton

Everything in §2.1 except `extract-model.mjs` and `external-systems.mjs`; dispatcher
wired for `init` (working) and `extract` (temporary "not implemented" exit 2 is
acceptable within this slice only if slice 2 ships in the same item run; otherwise wire
both in one PR — executor's call, slices may be merged into one PR).

Acceptance (run from repo root; `SCRATCH` = the session scratchpad dir):

1. `cd architecture-evolution-timelapse/scripts && npm ci` → exit 0; lockfile
   committed; `node -e "import('yaml')" ` succeeds.
2. `grep -rn frontend-evolution-timelapse architecture-evolution-timelapse/scripts/lib/canonical-json.mjs architecture-evolution-timelapse/scripts/lib/resolve-skill-root.mjs`
   → each file names its source file in a provenance comment (I6).
3. `mkdir -p "$SCRATCH/b1-init" && cd "$SCRATCH/b1-init" && git init -q . && printf '{"system_name":"demo"}' | <repo>/architecture-evolution-timelapse/scripts/arch-timelapse.sh init --stdin-json`
   → exit 0; one stdout JSON line with `"ok":true`; `.arch-timelapse.yaml` parses as
   YAML and contains `system_name: demo` plus every §3 default; `.gitignore` contains
   `.arch-timelapse/`. Re-running init is idempotent for the `.gitignore` line.
4. `<repo>/architecture-evolution-timelapse/scripts/arch-timelapse.sh bogus` → exit 2,
   usage on stderr.
5. `grep -rn "playwright\|ffmpeg" architecture-evolution-timelapse/scripts --include=*.mjs --include=*.json -l`
   → no matches (I7 fence for B1).

### Slice 2 — extractor + rule tables + hashes

`extract-model.mjs`, `external-systems.mjs`, §2.2–2.7 complete.

Acceptance (`TREE=/private/tmp/claude-501/-Users-rajdholakia-Documents-claude-skills/46feeefb-6ad0-4df2-84af-241f07b3493f/scratchpad/75-proof`):

1. `arch-timelapse.sh extract --tree "$TREE" --out "$SCRATCH/b1-x1"` → exit 0, one
   stdout JSON line; `model.json` and `hashes.json` exist; each file ends with exactly
   one LF; `jq .schema_version` = 1; `jq .system_name` = `earned`.
2. Context assertions via jq: the set of `kind=="external"` ids in `levels.context`
   equals exactly `ext.clerk, ext.cloudflare, ext.convex, ext.openai, ext.openrouter,
   ext.posthog, ext.webpush`; `person.user` and `system.app` present; edge
   `system.app → ext.clerk` label `authenticates users via` present.
3. Container assertions: ids `container.web` (tech `Next.js`), `container.convex`,
   `container.crons`, `container.middleware`, `container.sw` all present; `ext.convex`
   ABSENT from `levels.container.nodes`; edges present: `container.middleware →
   ext.clerk`, `container.convex → ext.openrouter`, `container.convex → ext.webpush`,
   `container.crons → container.convex`.
4. Component assertions: node `comp.web.app.dashboard` with `name` `app/(dashboard)`
   and `container` = `container.web`; nodes
   `comp.convex.users`, `comp.convex.challenges`, `comp.convex.crons`,
   `comp.convex.lib` present; NO node id starting `comp.web.components.` or
   `comp.web.hooks.` (default roots exclude them); edges `comp.web.app.dashboard →
   comp.convex.users` label `calls` and `comp.convex.crons → comp.convex.reminders`
   label `calls` present; no self-edges; no edge references a missing node id.
5. Determinism: extract again to `$SCRATCH/b1-x2`; `cmp` both files against `b1-x1`
   copies → byte-identical; `hashes.json` `levels.context|container|component` are 64
   lowercase hex chars and recompute correctly (sha256 of the canonical level subtree —
   spot-check one level with `jq -cS`-independent method of the executor's choice).
6. Read-only guarantee: `git -C "$TREE" status --porcelain` prints nothing after both
   runs (nothing was created inside the tree; NB `--out` was external and the tree has
   no config).
7. Degenerate tree (first commit, bare create-next-app — commit `a44ac66`, 17 files):
   `mkdir -p "$SCRATCH/b1-first" && git -C "$TREE" archive a44ac66 | tar -x -C "$SCRATCH/b1-first"`
   (archive reads without mutating the clone), then extract → exit 0;
   `levels.context` externals list empty; `container.web` present; `container.convex`,
   `container.crons`, `container.sw` absent; component nodes limited to `app` entries
   (e.g. `comp.web.app.layout`, `comp.web.app.page`).
8. Config-less notice: run 1's stderr contains a single notice that no
   `.arch-timelapse.yaml` was found and defaults were used.
9. Both runs complete with no network access, no installs in the target, no ffmpeg, no
   Chromium (nothing in the extract path imports playwright — re-run slice-1 check 5).

## Edge cases

- **Empty history / degenerate tree** — extractor never reads git history (B3's job);
  the equivalent is a near-empty tree: no `package.json` ⇒ model = `person.user` +
  `system.app` (name = dir basename), zero externals, zero containers, zero
  components; still valid, still hashed, exit 0. Covered concretely by slice-2 check 7
  (75-proof's first commit `a44ac66` is bare create-next-app).
- **Single commit / first frame** — for B1 this is the plain single-tree run; the
  first-frame semantics land in B3. B1's obligation: `extract` is self-contained per
  invocation and carries no state between runs.
- **All-duplicates run** — the hash-equality analogue: two runs on the same tree MUST
  produce identical level hashes (slice-2 check 5); this is exactly what B3 relies on
  to emit zero frames.
- **Resume mid-run** — extract is stateless and idempotent: overwriting `model.json` /
  `hashes.json` on re-run IS the resume story; no progress file in B1.
- **Missing binary (ffmpeg / chromium)** — B1 must not need either: dependency set is
  `yaml` + `minimatch` only, no playwright import anywhere in the extract path
  (slice-1 check 5, slice-2 check 9). Missing binaries can only fail B2+.
- **Unparseable / exotic source** — regex harvesting never throws on weird syntax; a
  file that matches nothing contributes nothing. Files > `max_file_bytes` and symlinks
  are skipped deterministically.
- **tsconfig with comments or exotic `paths`** — strict-JSON parse failure or
  multi-target paths ⇒ fall back to `{"@/": "./"}` with a stderr notice; never crash.
- **Id collisions** (`app/dashboard` vs `app/(dashboard)`) — deterministic `-2` suffix
  rule (§2.7.4).
- **Read-only target** — no config, `--out` outside tree ⇒ zero writes inside the
  tree (slice-2 check 6).

## Open choices

1. **`ext.convex` at C2** — chosen: suppress the external when `container.convex`
   exists (the container IS the Convex deployment; showing both is double-counting).
   Alternative a DELTA may pick: keep `ext.convex` at C2 as the hosting platform with a
   `container.convex → ext.convex` `deployed on` edge. C1 is unaffected either way.
2. **Default `component_roots`** — chosen: `app`/`src/app`, `lib`/`src/lib`, `convex`
   (the design's literal list, `:113-114`; ~53 nodes on 75-proof). Alternative: also
   include `components` and `hooks` (~90 nodes on 75-proof — richer edges, denser
   diagram; users can opt in via config today).

## Risks

1. C3 density: ~53 component nodes on 75-proof may render busy in B2; `component_roots`
   is the lever, and B5's pacing report is the checkpoint.
2. Regex-based import/env harvesting misses exotic forms (computed env names,
   barrel re-export chains). Accepted: misses are stable across commits, so change
   detection is unaffected; determinism outranks completeness (I1).
3. Curated external table: services outside the shipped rows are invisible until a row
   or `extra_externals` entry exists — a C1 completeness gap on unfamiliar repos, not a
   correctness gap on 75-proof.

## Execution notes (PR #46) — slice 1

- **Deviation (dispatcher self-heal):** `arch-timelapse.mjs` `extract` spawns
  `extract-model.mjs` when that file exists, else prints the not-implemented
  notice and exits 2. Today = the blessed exit-2 stub; slice 2 lands the
  extractor without editing the dispatcher (flags pass through untouched).
- **Deviation (auto defaults as `null`):** the written YAML encodes the §3
  "auto" defaults as `component_roots: null` and `import_aliases: null`
  (documented in `references/config-schema.md`); `extract` must treat `null`
  as derive-at-extract-time.
- **`system_name` semantics:** init resolves it concretely (stdin JSON → root
  `package.json` name → dir basename) and writes it; `DEFAULTS.system_name`
  stays `null` so config-less extract re-resolves per §2.4 against the tree.
- **For slice 2:** `loadConfig(treeRoot, configPath)` returns merged config and
  already emits the single stderr notice on missing config (slice-2 check 8);
  `canonical-json.mjs` is a faithful duplicate — `sha256Hex` is **async**
  (reference semantics), remember to `await`. Dispatcher exit-code convention:
  child status propagates; spawn failure maps to 3.
- **Gotcha (zsh):** slice-1 check 5's bare `--include=*.mjs` globs fail under
  zsh; run under bash (as the spec's "run from repo root" implies) or quote.
