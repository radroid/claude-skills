# B2 — Mermaid render pipeline: model JSON → fixed-template Mermaid → PNG via Playwright

Item: B2 (backlog `docs/orchestration/backlog.md:47`). Design:
`docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md:104-131` (pipeline
steps 4) + Decisions addendum `:148-162`. Invariants in force: **I1, I4, I6, I7**
(backlog.md:19-34). Predecessor contract: `docs/orchestration/specs/B1-c4-extractor.md`
— the model JSON shape (§2.3), container/node ids (§2.4-2.5), canonicalisation (§2.7)
and config schema (§3) are FROZEN; B2 consumes them and redefines nothing. B1 is being
implemented in a parallel worktree: the executor MUST reconcile file names and the
dispatcher wiring against the merged B1 code and its `## Execution notes` before
starting; where this spec cites B1, it cites the B1 SPEC section, not code.

Consumers: B3 (history walk) invokes `render` once per changed model and consumes the
stdout JSON line + the per-level PNGs; B5 asserts byte-identical `.mmd` across repeated
extraction (design spec `:144-146`). Everything under "Template contract" and "Mermaid
runtime contract" is frozen for them.

## 1. Goal

Given a B1 `model.json`, emit one Mermaid flowchart source file per C4 level from a
FIXED template (same model bytes + same config ⇒ byte-identical `.mmd`, I1), and
rasterise each to a fixed-size PNG inside the same Playwright Chromium the sibling
skill already uses — `mermaid` as a local scripts dependency executed in-page, no
mermaid-cli, no second Puppeteer (I7). Identical models yield pixel-identical PNGs on
the same machine; render failures degrade to a placeholder frame and never crash the
run.

**Non-goals:** no history walk, no worktrees, no per-commit orchestration, no change
detection (all B3 — detection is hash equality on B1's `hashes.json`, never pixel
comparison). No video/stitch, no collapse/badge (B3). No init interview (B4). No SVG
artifact persistence (only `.mmd` + `.png`). No cross-machine pixel-identity guarantee
(font stacks differ; B3 does not depend on pixels — design spec `:117-119`).

## 2. Requirements

### 2.1 Files and dependencies

Extends the B1 scaffold (B1 spec §2.1) inside `architecture-evolution-timelapse/`:

- `scripts/lib/model-to-mermaid.mjs` — the pure template (§2.3–2.5). No imports beyond
  node builtins; in particular it must NOT import the `mermaid` package (mermaid runs
  only inside Chromium).
- `scripts/render-diagrams.mjs` — the `render` CLI: loads model + config, writes
  `.mmd` files, drives Playwright, writes PNGs, prints the stdout JSON line.
- Dispatcher (`scripts/arch-timelapse.mjs`, B1 spec §2.1) gains subcommand `render`,
  same arg-parse pattern as the reference dispatcher
  (`frontend-evolution-timelapse/scripts/timelapse.mjs:16-54`). Unknown subcommand
  behavior unchanged (usage on stderr, exit 2).
- `scripts/package.json` + lockfile: add `mermaid` pinned **exactly `11.16.0`** (no
  range — mermaid layout changes between versions change bytes and pixels) and
  `playwright` at `^1.49.0`, mirroring the sibling
  (`frontend-evolution-timelapse/scripts/package.json:5-9`; its lockfile currently
  resolves playwright 1.60.0 — resolving to the same version shares the downloaded
  Chromium build between the two skills). Dependency set after B2 is exactly: `yaml`,
  `minimatch`, `mermaid`, `playwright` (I7).
- `SKILL.md`: bootstrap section updated from B1's `npm ci`-only note to
  `npm ci && npx playwright install chromium` (byte-pattern of
  `frontend-evolution-timelapse/SKILL.md:26`); quick start gains a `render` step.
- `references/config-schema.md`: gains the `render` block rows (§3).
- `scripts/lib/load-config.mjs` DEFAULTS (B1 spec §2.1) gain the `render` block so
  `init` writes it (I4: fields + defaults exist and are persisted by init; none of
  these fields is interview-asked — B4's interview covers levels/collapse/pacing per
  design addendum `:150-152`).

Internal decomposition beyond the two named scripts (e.g. an HTML shell string vs a
separate file) is the executor's choice.

Two seam signatures (the only ones B3 may bind to):
`modelToMermaidSource(model, levelName, config) -> string` (pure, deterministic) and
`renderModel(modelPath, outDir, levelNames, config) -> perLevelStatusMap`.

### 2.2 `render` CLI contract

`arch-timelapse.sh render [--model <path>] [--out <dir>] [--levels a,b,c] [--config <path>]`

- `--model` default: `<cwd>/.arch-timelapse/model/model.json` (B1's default extract
  out, B1 spec §2.2). Missing file, unparseable JSON, or `schema_version` ≠ 1 ⇒ exit 3
  with one stderr line.
- `--config` default: `<cwd>/.arch-timelapse.yaml`; missing ⇒ DEFAULTS + one stderr
  notice (B1 load-config behavior, B1 spec §2.1).
- `--out` default: the directory containing `--model` (so the per-model bundle is
  `model.json`, `hashes.json`, `<level>.mmd`, `<level>.png` side by side). Created if
  absent; unwritable ⇒ exit 3.
- `--levels` default: every level present in the model's `levels` object, processed in
  fixed order context, container, component. A requested level absent from the model ⇒
  per-level status `skipped`, reason `level-absent`, no files for it, not an error.
- Outputs per rendered level: `<level>.mmd` (UTF-8, exactly one trailing LF — matches
  B1 canonicalisation §2.7.1) and `<level>.png` (exactly `render.width` ×
  `render.height` pixels, every level, every model — fixed canvas is what makes B3's
  ffmpeg stitch trivial). Overwrite on re-run; rendering is stateless and idempotent.
- stdout: exactly one JSON line: ok flag, out path, `template_version` (int, `1`),
  and a `levels` map containing ONLY the requested levels, each with `status`
  (`ok | placeholder | skipped | failed`), `reason` (present unless `ok`), and the
  emitted file names. Quiet ethos of the reference skill
  (`frontend-evolution-timelapse/SKILL.md:61-62`).
- Exit codes: 0 = every requested-and-present level produced a PNG (status `ok` or
  `placeholder`); 2 usage; 3 preflight (model/config/out problems above); 4 = at least
  one level produced no PNG at all (only reachable with Chromium AND ffmpeg both
  unavailable, §2.7).
- `.mmd` files are written before any browser work, so B5's byte-identical-Mermaid
  assertion holds even on a machine with no Chromium.

### 2.3 Template contract — source structure (frozen; I1)

One Mermaid `flowchart` per level, built ONLY from the model (already canonically
sorted per B1 §2.7.3) and the fixed rules below. No timestamps, no absolute paths, no
config echo, no mermaid version string in the source. Line order:

1. Header comment: `%% arch-timelapse template v1 level=<level>` — the template
   version is bumped whenever any rule in §2.3–2.5 changes.
2. Direction line: `flowchart TB` for context and container; `flowchart LR` for
   component (Open choice 1).
3. The five `classDef` lines (§2.4), fixed order and fixed byte content.
4. Top-level node lines, in model node order.
5. Subgraph blocks (container/component levels, §2.5), in model node order of the
   subgraph-owning node; member node lines inside, in model node order.
6. Edge lines, in model edge order: `n<i> -- "<label>" --> n<j>`.

Indentation is part of the frozen bytes: every line unindented EXCEPT member node
lines inside a subgraph block, which are indented exactly two spaces; `end` is
unindented.

Mermaid node identifiers are positional: `n<i>` where `<i>` is the node's index in
that level's `nodes` array (0-based). B1 freezes node ordering (sorted by id bytewise,
B1 spec §2.7.3), so positional ids are deterministic and collision-free by
construction; model ids never appear as mermaid identifiers (they contain `.`, which
mermaid flowchart ids parse unreliably).

Labels: `name`, then if `tech` present append a line break `<br/>` plus `[<tech>]`.
All label text is entity-escaped before insertion, in this order: `&`→`#amp;`,
`<`→`#lt;`, `>`→`#gt;`, `"`→`#quot;`; the result is wrapped in double quotes.
(Verified in-browser: `#quot;` and literal parens render correctly with
`htmlLabels: false`; `app/(dashboard)` needs no escaping inside a quoted label —
2026-07-13 probe, scratchpad `b2-mermaid-probe/probe3.png`.)

Empty level (`nodes` empty — possible only for component per B1 §2.4-2.6): emit the
header, direction and classDef lines plus a single synthetic node
`n0["(empty level)"]` with class `component`; status is still `ok`. (Bare
`flowchart TB` renders without throwing — probe-verified — but produces a blank frame;
the synthetic node is chosen for legibility and is deterministic.)

### 2.4 Template contract — shapes and classes per `kind` (frozen)

| kind | shape | class name | classDef style (fixed bytes) |
|---|---|---|---|
| `person` | stadium `(["…"])` | `person` | `fill:#08427b,color:#ffffff,stroke:#052e56` |
| `system` | rectangle `["…"]` | `system` | `fill:#1168bd,color:#ffffff,stroke:#0b4884` |
| `external` | rectangle `["…"]` | `external` | `fill:#999999,color:#ffffff,stroke:#6b6b6b,stroke-dasharray:5 5` |
| `container` | rectangle `["…"]` | `container` | `fill:#438dd5,color:#ffffff,stroke:#2e6295` |
| `component` | rounded `("…")` | `component` | `fill:#85bbf0,color:#000000,stroke:#5d82a8` |

(Standard C4-PlantUML palette.) Class is attached with the `:::name` suffix on the
node line. All five classDef lines are emitted at every level regardless of which
kinds occur (fixed prelude → smaller diff surface between levels).

### 2.5 Template contract — per-level composition (frozen)

- **context**: flat; every node top-level. (B1 §2.4: `person.user`, `system.app`,
  `ext.*`.)
- **container**: the `system.app` node (kind `system`, B1 §2.5) renders as a
  `subgraph` whose members are all `kind == container` nodes; `person` and `external`
  nodes stay top-level. Degenerate rule: if the level has zero `kind == container`
  nodes, `system.app` renders as a plain rectangle node instead (mermaid empty
  subgraphs are not exercised).
- **component**: each `kind == container` node renders as a `subgraph`; each
  `kind == component` node is a member of the subgraph named by its `container` field
  (B1 §2.3). Defensive rule: a component whose `container` id has no matching node
  renders top-level (B1 guarantees this does not happen; the rule exists so a future
  model bug degrades to an ugly diagram, not a crash).
- Subgraph header labels use the same escaping as node labels. Edges never target a
  subgraph at component level (B1 §2.6 edges are component→component only).

### 2.6 Mermaid runtime contract (frozen)

Rasterisation runs the local `mermaid` browser bundle inside the Playwright Chromium —
`scripts/node_modules/mermaid/dist/mermaid.min.js` (IIFE global `mermaid`; path
resolved relative to the render script's own directory, never a CDN — offline, I7),
injected with Playwright's script-tag-from-file API into an `about:blank`-origin page.
The page carries no cookies, no storage and no network access; all label text was
entity-escaped in §2.3, and `securityLevel: 'strict'` applies mermaid's own
sanitisation on top.

Fixed initialize options (any change is a template-version bump):

| option | value | why |
|---|---|---|
| `startOnLoad` | `false` | render is driven explicitly |
| `theme` | config `render.theme` (default `neutral`) | fixed look |
| `look` | `'classic'` | pin explicitly so a future mermaid default flip can't alter output (`mermaid/dist/config.type.d.ts:76`) |
| `htmlLabels` | `false` (ROOT level) | SVG-text labels, no foreignObject; the root option supersedes the deprecated `flowchart.htmlLabels` in 11.16.0 (`config.type.d.ts:126-131`, `:267-271`) |
| `securityLevel` | `'strict'` | defense in depth |
| `deterministicIds` | `true`, seed `'arch-timelapse'` | stable SVG-internal ids (`config.type.d.ts:191`) |
| `handDrawnSeed` | `7` | **CRITICAL**: mermaid 11 routes shape paths through roughjs even in classic look; the default seed `0` means random per render (`config.type.d.ts:78-81`), producing different SVG bytes AND different PNG bytes on every run. Probe-verified 2026-07-13: without a fixed seed two runs differed (61132 vs 61115 SVG bytes, PNGs differ); with `handDrawnSeed: 7` two separate invocations are byte-identical in both SVG and PNG. |
| `flowchart.useMaxWidth` | `false` | SVG keeps natural size so §2.7 scaling owns the geometry |

Render element id fixed: `m0`.

### 2.7 Rasterisation, fixed canvas, placeholder ladder

Happy path, per level, fresh browser context + page each (state isolation):

1. Set page content to a fixed shell: full-viewport white stage, flex-centered, plus
   the animation-disable CSS block (byte-pattern of
   `frontend-evolution-timelapse/scripts/screenshot.mjs:7-14`).
2. Inject the mermaid bundle; await the document fonts-ready promise BEFORE rendering
   (mermaid measures text during layout).
3. Render the `.mmd` source; insert the returned SVG into the stage; read the SVG
   `viewBox`; compute `scale = min(availW/vbW, availH/vbH, render.max_scale)` where
   `avail* = render.* − 2·render.margin`; set explicit width/height attributes on the
   SVG element (vector scaling — text stays crisp at any diagram size).
4. Fixed 200 ms settle, then a viewport screenshot (never `fullPage`) → PNG exactly
   `render.width × render.height`. Browser context: fixed viewport, deviceScaleFactor
   1 (viewport pattern: `screenshot.mjs:53-58`; launch pattern: `screenshot.mjs:152`).

Pixel-identity scope: same machine, same Chromium build, same font stack — verified
byte-identical PNGs across two separate process invocations (probe, §2.6). Cross-machine
identity is explicitly not promised and nothing downstream needs it.

Placeholder ladder (dispatch requirement: degrade, never crash):

- **Per-level render failure** — mermaid parse/render throw (throws are catchable in
  page context — probe-verified), evaluate timeout (30 s), or screenshot error: retry
  once; on second failure write a placeholder PNG rendered in the SAME Chromium — same
  fixed canvas, light-grey background, level name + `diagram render failed` + first
  line of the error inserted as text content (not markup) — pattern of the reference
  placeholder (`screenshot.mjs:104-119`). Status `placeholder`, reason `render-error`,
  exit code still 0. The `.mmd` was already written (§2.2) and is untouched.
- **Chromium unavailable** — launch throws (probe: `Executable doesn't exist` under a
  bogus `PLAYWRIGHT_BROWSERS_PATH`): fall back to system ffmpeg for EVERY requested
  level: single-frame solid-color PNG from the lavfi `color` source at
  `render.width×render.height` (probe-verified byte-deterministic across runs). Status
  `placeholder`, reason `chromium-missing`; ONE actionable stderr line naming
  `npx playwright install chromium`. Exit 0.
- **Chromium AND ffmpeg both unavailable** — no PNG is physically producible: status
  `failed` for affected levels, exit 4, actionable stderr. (`.mmd` files still
  written.) ffmpeg missing on its own is harmless — the happy path never touches it.

Test hook (internal, spec-only, not in SKILL.md): env
`ARCH_TIMELAPSE_FORCE_RENDER_FAIL` = comma-separated level names ⇒ the in-page render
step throws for those levels, exercising the real `render-error` placeholder path.

## 3. Config schema — additions to `.arch-timelapse.yaml`

| field | type | default | asked-at-init? |
|---|---|---|---|
| `render.width` | int | `1920` | no (documented) |
| `render.height` | int | `1080` | no |
| `render.margin` | int | `40` | no |
| `render.max_scale` | number | `2` | no |
| `render.theme` | string | `neutral` | no |

Reserved fields from B1 §3 (`collapse_mode`, `fps`, `max_hold_ms`, `max_commits`,
`history_mode`) remain untouched and unimplemented. No dedup threshold exists in this
skill (hash equality, B1 §3).

## Slices

### Slice 1 (only slice) — template + rasteriser + placeholder ladder + deps

All of §2. One PR.

Environment for acceptance:
`SKILL=<repo>/architecture-evolution-timelapse`,
`SCRATCH=/private/tmp/claude-501/-Users-rajdholakia-Documents-claude-skills/46feeefb-6ad0-4df2-84af-241f07b3493f/scratchpad`,
`TREE=$SCRATCH/75-proof` (read-only clone, verified present).

1. **Bootstrap**: `cd $SKILL/scripts && npm ci && npx playwright install chromium` →
   exit 0; `node -p "require('./node_modules/mermaid/package.json').version"` prints
   `11.16.0`; `ls node_modules/mermaid/dist/mermaid.min.js` exists; lockfile committed;
   `node -p "Object.keys(require('./package.json').dependencies).sort().join()"`
   prints exactly `mermaid,minimatch,playwright,yaml` (I7).
2. **Model input**: `"$SKILL/scripts/arch-timelapse.sh" extract --tree "$TREE" --out "$SCRATCH/b2-model"`
   → exit 0 (B1's CLI, B1 spec §2.2).
3. **Happy path**: `"$SKILL/scripts/arch-timelapse.sh" render --model "$SCRATCH/b2-model/model.json" --out "$SCRATCH/b2-r1"`
   → exit 0; exactly one stdout JSON line with `"template_version":1` and statuses
   `ok` for context, container, component; the six files
   `{context,container,component}.{mmd,png}` exist in `b2-r1`; each `.mmd` ends with
   exactly one LF (`tail -c1 | xxd` shows `0a`, and `tail -c2` is not `0a0a`); each
   PNG: `ffprobe -v error -show_entries stream=width,height -of csv=p=0` prints
   `1920,1080`.
4. **Determinism (I1 + pixel-identity)**: render again to `$SCRATCH/b2-r2`; for all
   six files `cmp "$SCRATCH/b2-r1/<f>" "$SCRATCH/b2-r2/<f>"` → byte-identical. Then
   re-run extract to `$SCRATCH/b2-model2` and render to `$SCRATCH/b2-r3`; all three
   `.mmd` byte-identical to `b2-r1` (the extract→render chain assertion B5 relies on).
5. **Template content** (grep on `b2-r1`): `context.mmd` line 1 is
   `%% arch-timelapse template v1 level=context` and line 2 is `flowchart TB`;
   `component.mmd` line 2 is `flowchart LR`;
   `grep -F -- '-- "authenticates users via" -->' context.mmd` matches (B1 §2.4 edge
   label); `grep -F '"app/(dashboard)"' component.mmd` matches (paren label survives);
   `grep -c '^subgraph ' container.mmd` = 1 (system boundary) and
   `grep -c '^subgraph ' component.mmd` ≥ 2 (web + convex containers);
   `grep -c '^n0' context.mmd` ≥ 1 (positional ids in use); no line in any `.mmd`
   contains an absolute path or a datestamp.
6. **Level filter**: `render --model "$SCRATCH/b2-model/model.json" --levels context --out "$SCRATCH/b2-r4"`
   → exit 0; only `context.mmd` + `context.png` produced; the JSON `levels` map has
   only the `context` key.
7. **Render-error placeholder**:
   `ARCH_TIMELAPSE_FORCE_RENDER_FAIL=container "$SKILL/scripts/arch-timelapse.sh" render --model "$SCRATCH/b2-model/model.json" --out "$SCRATCH/b2-r5"`
   → exit 0; container status `placeholder` reason `render-error`; `container.png`
   exists at 1920×1080; `container.mmd` byte-identical to `b2-r1`'s; context and
   component still `ok`.
8. **Chromium-missing placeholder**: `mkdir -p "$SCRATCH/b2-nobrowsers"` then
   `PLAYWRIGHT_BROWSERS_PATH="$SCRATCH/b2-nobrowsers" "$SKILL/scripts/arch-timelapse.sh" render --model "$SCRATCH/b2-model/model.json" --out "$SCRATCH/b2-r6"`
   → exit 0; all three statuses `placeholder` reason `chromium-missing`; three PNGs
   exist at 1920×1080 (ffmpeg lavfi); stderr contains
   `npx playwright install chromium`; all three `.mmd` byte-identical to `b2-r1`'s.
9. **Degenerate + empty-level**: build the first-commit tree
   (`mkdir -p "$SCRATCH/b2-first" && git -C "$TREE" archive a44ac66 | tar -x -C "$SCRATCH/b2-first"`,
   recipe from B1 spec slice-2 check 7), extract it to `$SCRATCH/b2-first-model`,
   render → exit 0, all present levels `ok`. Then write a fixture
   `$SCRATCH/b2-empty/model.json` by heredoc — `schema_version` 1, any `system_name`,
   `levels.component` = empty `nodes`/`edges` — and
   `render --model "$SCRATCH/b2-empty/model.json" --levels component --out "$SCRATCH/b2-r7"`
   → exit 0, status `ok`, `component.mmd` contains `(empty level)`, PNG at 1920×1080.
10. **Fences**: `grep -rn "mermaid-cli\|puppeteer" "$SKILL/scripts" --include='*.mjs' --include='*.json'`
    → no matches (I7); `grep -rn "https://\|http://" "$SKILL/scripts"/*.mjs "$SKILL/scripts/lib"/*.mjs`
    → no network fetch in the render path;
    `grep -rln "frontend-evolution-timelapse" "$SKILL/scripts"` → only files whose
    match is a provenance comment (I6); dispatcher unknown-subcommand still exits 2.
11. **Read-only target**: `git -C "$TREE" status --porcelain` prints nothing after all
    runs.

## Edge cases

- **Empty history / degenerate tree** — render never reads git (B3's job); the
  degenerate analogue is the first-commit model (check 9: minimal containers, no
  externals) and the hand-built empty component level (synthetic `(empty level)` node,
  §2.3). Bare `flowchart TB` was probe-verified not to throw, so even a
  template-regression blank source cannot crash the page.
- **Single commit / first frame** — B3 semantics; B2's obligation is that `render` is
  stateless per invocation and carries no state between runs (§2.2 overwrite).
- **All-duplicates run** — the render-side guarantee B3's collapse relies on:
  byte-equal `model.json` ⇒ byte-equal `.mmd` ⇒ byte-equal PNG (checks 4; `handDrawnSeed`
  pin is what makes this true, §2.6).
- **Resume mid-run** — re-running `render` overwrites its outputs idempotently; that
  IS the resume story; no progress file in B2.
- **Missing binary** — Chromium missing ⇒ ffmpeg lavfi placeholders, exit 0, actionable
  stderr (check 8). ffmpeg missing ⇒ irrelevant on the happy path. Both missing ⇒ the
  only hard failure: status `failed`, exit 4, actionable stderr. `.mmd` files are
  written in every case, so B5's determinism assertion is browser-independent.
- **Malformed / hostile labels** — entity escaping (§2.3) covers `& < > "`; parens and
  brackets are safe inside quoted labels (probe-verified); `securityLevel: 'strict'` +
  `htmlLabels: false` + an origin-less page with no secrets bound the blast radius of
  anything that slips through.
- **Oversized component level** — ~53 nodes on 75-proof (B1 risk 1) scale down to fit
  the fixed canvas; text may get small. Accepted for B2; `component_roots` (B1 §3) is
  the lever and B5's pacing report is the checkpoint. No minimum-scale floor in v1.
- **Level absent from model** — `--levels` naming a level the model lacks ⇒ `skipped`,
  reason `level-absent`, exit 0 (config/model drift is user error, not a crash).
- **Model schema drift** — `schema_version` ≠ 1 ⇒ exit 3 before any file is written.
- **Render hang** — 30 s in-page timeout counts as a render failure → retry → then
  placeholder; a run can be slow but cannot wedge.

## Open choices

1. **Component-level direction** — chosen: `flowchart LR` for component (subgraph
   columns spread ~53 nodes better on a 16:9 canvas); context/container stay `TB`. A
   DELTA may flip component to `TB` after seeing B5's real frames; the change is a
   template-version bump.
2. **`imports` edge labels at component level** — chosen: keep every edge labeled
   (uniform rule, zero special cases). Alternative a DELTA may pick: suppress the
   label text on `imports` edges only (they dominate ~everything at C3 and add visual
   noise; `calls` labels stay). Also a template-version bump.
3. **Diagram dialect** — chosen: `flowchart` + fixed classDefs (probe-verified
   deterministic, full layout/subgraph control). Alternative: mermaid's native
   C4 syntax (`C4Context`/`C4Container`/`C4Component`) — closer to C4 iconography but
   experimental in mermaid 11 and with far weaker layout control at 50+ nodes; not
   probed. Switching later is a template-version bump, invisible to B3's interfaces.

## Risks

1. `mermaid.min.js` is ~2–3 MB of vendored dependency executed in-page; a future
   `npm ci` from a drifted lockfile would change bytes/pixels silently. Mitigation:
   exact `11.16.0` pin + committed lockfile + determinism check 4 in CI/acceptance.
2. Pixel-identity depends on Chromium + system fonts staying constant on the machine;
   a Playwright bump changes pixels. Harmless to correctness (B3 dedups on model
   hashes), but keep both skills' playwright versions moving together (I7's "existing
   playwright").
3. Fixed 1920×1080 canvas may render 75-proof's component level with small text
   (B1 risk 1 carried forward); B5's report is the checkpoint, `render.width/height`
   and `component_roots` are the levers.

## Execution notes (slice 1)

- **Deviation (`--model` default):** `<cwd>/<config.output_dir>/model/model.json`,
  not a hard-coded `.arch-timelapse/model/model.json` — identical under default
  config, honors a user-set `output_dir`, and mirrors B1's recorded `--out`
  deviation. `--out` still defaults to the directory containing `--model`.
- **Deviation (unknown level names):** `--levels` names outside
  {context, container, component} are treated exactly like model-absent levels
  (`skipped`, reason `level-absent`, exit 0) rather than usage errors —
  §2.2 defines absence as skip, and config/model drift is user error, not a
  crash. Processing order: known levels in the fixed order, then unknown names
  bytewise-sorted after.
- **Deviation (C3 zero-member container):** a `kind == container` node at
  component level owning zero components renders as a plain rectangle node,
  not an empty subgraph — same rationale as §2.5's container-level degenerate
  rule; unreachable with B1 models (B1 only emits parents owning ≥1
  component).
- **Status-map shape (B3 binds to this):** each requested level maps to
  `{status, reason?, files}` where `files` is an array of bare file names
  (`["context.mmd","context.png"]`; `[]` for skipped). `renderModel` returns
  exactly the map printed under the stdout line's `levels` key. Failed-level
  reasons: `chromium-and-ffmpeg-missing` (both binaries absent) and
  `render-error` (placeholder screenshot itself failed — only reachable if
  Chromium dies mid-run).
- **Lockfile pin detail:** package.json carries `playwright: ^1.49.0`
  (mirroring the sibling) but the committed lockfile resolves **1.60.0**, the
  sibling's exact resolution, so both skills share one downloaded Chromium
  build. `npm ci` (never bare `npm install`/`npm update`) keeps that pin; a
  lockfile drift changes pixels (spec risk 1).
- **Subgraph headers:** carry the full node label (name + `<br/>[tech]`),
  same composition and escaping as node lines — §2.5 fixes only the escaping;
  the composition choice is frozen bytes now.
- **Config merge:** the `render` block deep-merges over `DEFAULTS.render` at
  use (`render-diagrams.mjs`), so a user config with a partial `render:`
  mapping keeps defaults for the other keys despite `loadConfig`'s shallow
  spread.
- **Gotcha (fence wording):** slice check 10's grep matches comments too —
  source comments must not contain the literal banned tool names. The two
  `frontend-evolution-timelapse` matches in `render-diagrams.mjs` are
  provenance comments (anim-CSS block, placeholder pattern), per I6.
- **NFD/NFC carry-through (document, don't solve — from B1's hostile
  review):** `.mmd`/PNG bytes derive from `model.json` bytes, so B1's
  cross-machine unicode-filename caveat propagates unchanged through render;
  pixel identity is same-machine only regardless (§2.7). User-facing docs land
  in B4's troubleshooting per its spec.
- **Verified exit-code surface:** 0 (happy, placeholder, skip), 2 (usage), 3
  (missing/unparseable model, schema ≠ 1), 4 (Chromium AND ffmpeg absent —
  exercised via bogus `PLAYWRIGHT_BROWSERS_PATH` + stripped `PATH`).
