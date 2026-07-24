# B3 — history walk + per-level change detection + collapse/badge stitch

Item: B3 (backlog `docs/orchestration/backlog.md:83`). Design:
`docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md:104-131` (pipeline
steps 1-5, three independent videos `:125-127`, no-server guarantee `:129-130`) +
collapse/badge semantics from Part 1 (`:76-88`) + Decisions addendum (`:148-162`).
Invariants in force: **I1, I3 (hash-equality analogue), I4, I6, I7, I8, I9**
(backlog.md:53-70).

Predecessor contracts — SPECS + live branches, not merged code:

- B1 slice 1 APPROVED on `origin/item/b1-c4-extractor-s1` (scaffold, dispatcher,
  init, config, libs). B1 slice 2 (extract-model.mjs, external-systems.mjs) is
  EXECUTING on `item/b1-c4-extractor-s2`. Code anchors below written `s1:<path>` refer
  to `git show origin/item/b1-c4-extractor-s1:<path>` as verified 2026-07-13.
- B2 (render) spec FROZEN at `docs/orchestration/specs/B2-mermaid-render.md`; not yet
  merged. Where this spec cites B1/B2 it cites SPEC sections; the executor MUST
  reconcile internal file names against the actually-landed predecessor branches (B3
  stacks on B2's branch per the backlog's stacked-PR mode, backlog.md:37-45) before
  starting, and record any renames in `## Execution notes`.

Frozen seams B3 binds to — nothing else:

1. `extractModel(treeDir, config) -> { model, levelHashes }` — B1 spec §2.2 ("One
   signature for the core, to fix the seam B3 will call"). In-process import.
2. The `render` CLI contract — B2 spec §2.2 (flags, one stdout JSON line with
   per-level `status`/`reason`, exit 0/2/3/4, fixed-canvas PNG per level, `.mmd`
   written before browser work) and §2.7 placeholder ladder. Spawned per kept model.
3. `hashes.json` `levels.<name>` 64-hex strings — B1 spec §2.3 ("B3's per-level change
   detection compares `levels.<name>` strings only").

Consumers: B4 (interview + docs) asks the questions for the fields marked asked-at-init
in §3 and rewrites SKILL.md; B5 (E2E proof) binds to `frames.json` (§2.6), `cost.json`
(§2.9) — especially `levels.<l>.video_s` and `levels.<l>.longest_hold_s` for the pacing
report (design `:156-158`) — and the `run` final stdout JSON line (§2.2). Those three
shapes are frozen contracts for B5.

## 1. Goal

Implement the `run` subcommand: walk the target repo's first-parent history oldest to
newest, check each commit out read-only via `git archive` to a temp dir (never a
server, never an install, never a lifecycle script — extraction is pure static
analysis, which is this skill's whole safety story), extract the C1/C2/C3 model per
commit through B1's seam, and emit a frame ONLY when a level's canonical hash changed.
Then stitch each level independently — collapse + badge / drop / speedthrough — into a
GIF + MP4 pair plus an index.html summary, with resume support and cost/progress
artifacts. Three levels ⇒ three independent videos with independent dedup: a commit
can change component while context correctly emits no new frame (design `:125-127`).

**Non-goals:** no init interview and no SKILL.md final polish (B4). No E2E proof runs
beyond the bounded acceptance samples (B5 owns the full 75-proof run). No pixel
comparison anywhere — change detection is hash equality only (B2 spec Non-goals). No
code-level C4 (I9). No `history_mode: all` walking in v1 (§3). No cross-machine video
byte-determinism — determinism claims stop at model/hash/`.mmd` level (B2 spec §2.7
pixel-identity scope); MP4/GIF bytes are never asserted.

## 2. Requirements

### 2.1 Files

Extends the B1/B2 scaffold inside `architecture-evolution-timelapse/`:

- `scripts/run-history.mjs` — the `run` engine: plan, prefilter, archive-checkout,
  extract, per-level detection, render dispatch, progress/resume, lock, then invokes
  the stitcher and index renderer.
- `scripts/stitch-levels.mjs` — annotation + collapse modes + ffmpeg concat → GIF/MP4
  per level; also the `stitch-only` entry. Emits one stdout JSON line (per-level
  summary, §2.8).
- `scripts/render-index.mjs` — index.html writer; structural pattern of
  `frontend-evolution-timelapse/scripts/render-index.mjs:14-60` (esc helper `:20-27`,
  section blocks `:29-34`), duplicated with a provenance comment (I6).
- `scripts/lib/lock.mjs` — duplicated from
  `frontend-evolution-timelapse/scripts/lib/lock.mjs:24-78` (acquire/release, stale
  reclaim, `--force` override) with a provenance comment (I6).
- Dispatcher `scripts/arch-timelapse.mjs` (s1: USAGE lines 9-16, RESERVED set line 19,
  reserved-branch lines 53-57): `run`, `stitch-only`, `clean` move from RESERVED to
  wired subcommands via the existing `runScript` pattern (s1:21-27). Unknown
  subcommand behavior unchanged: usage on stderr, exit 2 (s1:59-60).
- `scripts/lib/load-config.mjs` — DEFAULTS
  (s1:architecture-evolution-timelapse/scripts/lib/load-config.mjs, DEFAULTS object
  lines 10-33) gain the §3 fields, so `init` persists them: init-config.mjs spreads
  DEFAULTS into the written YAML (s1:init-config.mjs:57-61) — I4's field+default half;
  B4 asks the questions.
- `references/config-schema.md` gains the §3 rows.

Internal decomposition beyond the named files is the executor's choice. No new
dependencies: after B3 the dep set is still exactly `yaml`, `minimatch`, `mermaid`,
`playwright` (I7; B2 spec §2.1). All child processes are spawned with argument arrays,
never shell strings — commit subjects must never reach a shell.

**Safety story (load-bearing):** the only external binaries B3 may invoke are `git`
and `ffmpeg`, and the only git subcommands allowed against the target are read-only:
`rev-parse`, `rev-list`, `log`, `status`, `archive`. No `worktree`, no `checkout`, no
writes to the target's `.git` — `git archive | tar -x` runs no hooks and mutates
nothing (probed: 0.08 s per commit on 75-proof, git 2.54.0). Node never imports or
executes target-repo code; extraction is B1's regex scan.

### 2.2 `run` CLI contract (frozen for B4/B5)

`arch-timelapse.sh run [--from <rev>] [--to <rev>] [--max-commits N] [--levels a,b,c]
[--out <dir>] [--config <path>] [--run-id <id>] [--fresh] [--dry-run] [--force]
[--keep-temp]`

- Target repo = cwd. Not a git repo, or zero commits ⇒ exit 3, one stderr line.
- `--config` default `<cwd>/.arch-timelapse.yaml`; missing ⇒ DEFAULTS + one stderr
  notice (B1 behavior, s1:load-config.mjs:37-40). The config FILE is loaded once at
  run start and fixed for the whole run; fields whose default is per-tree derivation
  (`system_name: null`, `import_aliases: null`, `component_roots: null`,
  s1:load-config.mjs:11-33) are resolved by `extractModel` against EACH historical
  tree — a mid-history rename or tsconfig change is a real architecture change and
  must register.
- `--out` default `<cwd>/<output_dir>` (config, default `.arch-timelapse`). Run dir =
  `<out>/<run-id>`; default run-id = ISO timestamp with `:`/`.` → `-` (pattern
  `frontend-evolution-timelapse/scripts/timelapse.mjs:278`). When `--out` is outside
  the tree and no config exists in the tree, run writes NOTHING inside the target
  (75-proof read-only guarantee, same clause as B1 spec §2.2).
- `--levels` default = config `levels`; filters which levels are extracted-compared-
  rendered-stitched.
- `--from`/`--to` slice the first-parent list by rev (inclusive; pattern
  `frontend-evolution-timelapse/scripts/list-commits.mjs:67-75`). `--max-commits` (or
  config `max_commits`) keeps the LAST N after prefilter
  (list-commits.mjs:89-93 pattern). The first commit of the final plan is always the
  baseline: kept for every level.
- Resume: with no `--run-id` and no `--fresh`, if the latest incomplete run under
  `--out` exists (progress entries < plan length; discovery pattern
  timelapse.mjs:75-92) AND its stored `config_hash` + `commit_plan_hash` match the
  current ones, resume it (stderr notice, `resumed: true`); on mismatch, start a NEW
  run with a one-line stderr notice. With explicit `--run-id`, a mismatch is REFUSED:
  exit 3 naming the mismatch and the `--fresh` remedy (consistency with the A2 DELTA
  adjudication, backlog.md:17-19). `--fresh` always starts a new run id.
- Locking: acquire under `--out` before any write, release on exit (lock.mjs pattern);
  a held live lock ⇒ exit 3 naming pid and `--force`.
- `--dry-run`: print ONE stdout JSON line — planned commit count, prefiltered-out
  count, effective levels, run would-be id — write nothing, take no lock, exit 0.
- `--keep-temp`: skip temp-tree deletion at end (debugging).
- stdout: one fixed-format progress line per processed commit —
  `[i/n] <short7> <level>=<kept|dup|pre|err> ... <secs>s` (quiet ethos, one line per
  step; emit pattern timelapse.mjs:100-108) — then a FINAL single JSON line:
  `ok`, `run_id`, `run_dir`, `exit_code`, `resumed` (bool), `halted` (bool, §2.10),
  `walked` (int), `kept` (map level → int). B5 binds to the final line.
- Exit codes: 0 = completed, zero error-decision commits and all kept frames stitched;
  2 usage; 3 preflight (above) or lock; 4 = completed WITH ≥1 error-decision commit,
  or ≥1 kept frame whose render/stitch failed — artifacts are still written and
  videos still produced from whatever frames exist. (Distinct from the sibling's
  exit-2-on-skips overload, timelapse.mjs:505 — 2 stays usage-only here.)

### 2.3 Walk plan + path prefilter

One single `git log --first-parent --reverse --name-only` invocation with a fixed
format string yields, per commit: hash, author ISO date, subject, and changed-file
list (one spawn, not 3N; sibling's per-commit spawns at list-commits.mjs:96-98 are the
anti-pattern). Probe-verified on git 2.54.0 against 75-proof: `--first-parent` emits
name lists for merge commits as the diff against the first parent, and the root
commit's full file list appears without extra flags. 75-proof: 278 total commits,
**80 first-parent** — the walk length for B5 is 80, not 278 (the design's 278
`:135-136` counts all commits; flag this in B5's expectations).

Plan is written to `<runDir>/commits.json` (`index` 1-based, `hash`, `subject`,
`date`); `commit_plan_hash` = sha256 of `canonicalStringify(commits)`
(timelapse.mjs:297 pattern; canonical-json s1 lib). `config_hash` = sha256 of
`canonicalStringify` of the loaded run config plus the effective `--levels`. Both are
stored in `progress.json` and checked on resume (§2.2).

**Prefilter** (config `prefilter: true`): a commit is WALKED (extracted) only if its
changed-file list contains at least one *architecture-relevant* path: extension in
`source_extensions` (config, s1:load-config.mjs:30), OR basename `package.json` or
`tsconfig.json`, OR root `wrangler.json`/`wrangler.jsonc`/`wrangler.toml` — the
manifest files B1's C1/C2 rules read (B1 spec §2.4-2.5) — minus paths matching
`exclude` globs (minimatch, dot on). The first commit of the plan is always walked.
Non-walked commits are recorded with decision `prefiltered` for every requested level
and collapse into the preceding kept frame exactly like duplicates. The prefilter must
stay a conservative superset — correctness comes from hashing; `prefilter: false`
disables it entirely (every commit extracted).

### 2.4 Per-commit processing

For each walked commit, in plan order:

1. Extract the tree: `git archive --format=tar <hash>` piped/untarred into the
   per-run temp dir `<runDir>/.tmp-tree` (emptied and reused per commit; created
   fresh; deleted at run end and on process exit unless `--keep-temp`). Never inside
   the target's working tree.
2. Call `extractModel(tmpTree, runConfig)` (seam 1) inside try/catch. A throw —
   corrupt mid-history `package.json`, anything — records decision `error` for every
   requested level with `error` = FIRST LINE of the message only (the A3 DELTA about
   multi-line Playwright stacks in `frames.json`, backlog.md:31-33, is baked in here
   from day one), and the walk CONTINUES. An error commit never crashes the run and
   never becomes a kept frame.
3. Per requested level, compare `levelHashes.levels.<name>` (B1 spec §2.3) to the
   last KEPT hash for that level (I3's hash-equality analogue; before any kept frame
   exists, everything is "changed"). Equal ⇒ `duplicate`. Different ⇒ `kept`.
4. If ≥1 level was kept: write the model bundle to
   `<runDir>/models/<index3>_<short7>/` (`model.json` + `hashes.json`, B1's extract
   output shape) and spawn the `render` CLI (seam 2) with `--model` that bundle,
   `--out` the same dir, `--levels` = ONLY the kept levels of this commit. Parse its
   single stdout JSON line; per-level `status` `ok`/`placeholder` both count as a
   usable frame (placeholders appear in the video — degrade, never crash, B2 §2.7);
   `failed`/exit 4 marks that level's frame `render_failed` (dropped at stitch,
   contributes to exit 4). Duplicate/prefiltered/error commits get NO bundle and NO
   render (disk economy; hashes live in frames.json).
5. Append the per-commit entry to `progress.json` atomically (tmp + rename,
   timelapse.mjs:94-98 pattern): decisions, per-level hashes (when extracted),
   `extract_ms`, render statuses. Resume skips commits already present and
   reconstructs the last-kept hash state per level from stored entries.

### 2.5 Change detection is per level, independently

Each level maintains its own last-kept hash and its own kept-frame sequence. Nothing
couples levels: F-commit changing only `lib/` keeps component while context/container
record duplicates. (Hash equality makes compare-to-last-kept and compare-to-previous
provably identical here, but the spec language and the implementation MUST say
last-kept, per I3.)

### 2.6 `frames.json` (frozen contract for stitch + B5)

Written atomically at end of walk (and updated by resume completions):
`schema_version` (1), `head`, `history_mode`, `walked` (int, commits processed),
`prefiltered_out` (int), `levels` (effective list), `commits` — array in plan order:
`index`, `hash`, `subject`, `date`, `decision` (map level →
`kept | duplicate | prefiltered | error | render_failed`), `hashes` (map level →
64-hex, present only when extraction succeeded), `error` (first-line string, error
commits only), `model_dir` (runDir-relative, kept commits only). No timestamps beyond
commit dates, no absolute paths (runDir-relative only — the run dir must be portable).

### 2.7 Annotation — Chromium composite, NOT ffmpeg drawtext

**Probe fact (this run, 2026-07-13):** the installed ffmpeg is Homebrew 8.1.1 built
WITHOUT `libfreetype`/`fontconfig`/`harfbuzz` — `ffmpeg -filters` lists NO `drawtext`.
The design's "burn the overlay in with ffmpeg" (design `:36-37`) is not executable on
this machine. Intent (annotation at stitch time, pristine capture — I2) is preserved
by compositing in the Playwright Chromium the skill already ships (I7-clean, zero new
deps): a fixed HTML shell at `render.width × render.height` (config, B2 §3), the
pristine level PNG embedded as a data URI, and a bottom-anchored fixed-height bar —
48 px, fixed dark background, fixed monospace font stack, 18 px — containing left:
`<short7>  <YYYY-MM-DD>  <subject>` (subject truncated to 80 chars, inserted via text
content, never markup) and right, when applicable, the badge (§2.8). Viewport
screenshot, deviceScaleFactor 1 (viewport/launch pattern
`frontend-evolution-timelapse/scripts/screenshot.mjs:53-58,152`; same-machine
determinism scope as B2 §2.7).

- Annotated copies go to `<runDir>/annotated/<level>/<index3>_<short7>.png`. The
  pristine PNGs under `models/` are NEVER overwritten (I2 analogue).
- `annotate: false` (config) ⇒ stitch consumes pristine PNGs directly.
- Chromium unavailable (launch throws, B2 §2.7 probe) ⇒ annotation is skipped for the
  whole run with ONE stderr line naming `npx playwright install chromium`; stitch
  consumes pristine frames; cost.json records `annotate: "skipped-chromium-missing"`.
  (When Chromium is missing the diagrams themselves are already B2's lavfi
  placeholders, so this degrade is coherent end to end.)

### 2.8 Collapse modes + stitch

Per level, from `frames.json` + kept PNGs, build an ffmpeg concat list
(`<runDir>/concat_<level>.txt`, transient artifact, durations `%.3f` seconds —
sibling pattern `frontend-evolution-timelapse/scripts/stitch.mjs:29-60` including the
trailing repeated last file line `:56-57` the concat demuxer needs), then encode:

- MP4: concat → `libx264`, `yuv420p`, `crf` = config `video.crf`, full canvas
  (stitch.mjs:65-88 arg pattern, minus the scale-down).
- GIF: concat → `fps=<fps>,scale=<video.gif_width>:-1:flags=lanczos` + palettegen/
  paletteuse, loop 0 (stitch.mjs:99-116 pattern). Both filters probe-verified present
  in ffmpeg 8.1.1; concat+duration+x264 pipeline probe-verified this run (ffprobe
  `format=duration` output format: `5.400000`).

Outputs: `<runDir>/videos/<level>.gif` + `<runDir>/videos/<level>.mp4`.

For each kept frame let `collapsed` = the number of contiguous non-kept commits
(duplicate + prefiltered + error) between it and the next kept frame (or end of plan).

- **`badge`** (default): one frame per kept commit. Badge text when `collapsed ≥ 1`:
  `×<collapsed> commits · no architecture change`; when any of those are error
  commits: `×<collapsed> commits · <e> skipped` (fixed vocabulary, both). Hold per
  frame: `hold_ms = min(max_hold_ms, round((1000 / fps) × (1 + log2(1 + collapsed))))`
  — mild growth, capped (design `:85-88`); `collapsed = 0` ⇒ base `1000/fps`.
- **`drop`**: kept frames only, no badge, uniform hold `1000 / fps` (the badge-free
  cut, design `:155`).
- **`speedthrough`**: kept frames hold `1000 / fps`; every non-kept commit gets its
  OWN frame — the last kept image re-annotated with that commit's hash/date/subject —
  held `speedthrough_frame_ms`, so quiet stretches flash past commit by commit.
  Non-kept commits before the first kept frame of a level emit nothing.

Leading error commits (before a level's first kept frame) emit no frame in any mode —
there is nothing to carry forward; they remain in frames.json. `render_failed` kept
frames are dropped from the concat list (their collapsed count folds into the previous
kept frame) and force exit 4. A level whose every commit failed ⇒ that level's videos
are skipped, summary status `no_frames`, exit 4.

`stitch-levels.mjs` stdout: ONE JSON line — per level: `status`
(`ok | no_frames | fail`), `gif`, `mp4` (runDir-relative), `collapse_mode` echoed,
`kept`, `collapsed` (total non-kept), `frames_emitted` (concat entries excluding the
trailing repeat), `video_s` (sum of durations, 3 decimals), `longest_hold_s`. ffmpeg
missing/failing ⇒ per-level `fail` with the first stderr line, run exit 4, all
non-video artifacts intact.

### 2.9 `stitch-only`, `clean`, index.html, cost.json

- `arch-timelapse.sh stitch-only [--run-id <id>] [--out <dir>] [--config <path>]` —
  re-annotate + re-stitch an existing COMPLETE run dir from its `frames.json` using
  the CURRENT config (this is how B5 tunes pacing without re-walking; design
  `:156-158`). Default run-id: latest run dir under `--out` containing a
  `frames.json`; none ⇒ exit 3. Re-runs are idempotent overwrites. Also rewrites
  index.html and the stitch/video fields of cost.json.
- `arch-timelapse.sh clean [--out <dir>]` — remove `<out>` lock dir, any
  `<out>/*/.tmp-tree`, and stale annotated temp; never touches models/frames/videos.
  One stdout JSON line. Exit 0 even when nothing to clean.
- `index.html` at runDir root (render-index.mjs pattern anchors §2.1): per level — GIF
  inline, MP4 link, kept/walked counts, `video_s`, `longest_hold_s`; plus an
  error-commit list (hash + first-line error). Relative links only; no absolute
  paths, no `file://`.
- `cost.json` (frozen for B5): `schema_version` (1), `run_id`, `walked`,
  `prefiltered_out`, `error_commits`, `extract_ms_total`, `render_ms_total`,
  `annotate_ms_total` (0 when skipped/disabled), `stitch_ms_total`, `total_wall_ms`,
  `annotate` (`ok | disabled | skipped-chromium-missing`), `levels` — map level →
  `{ kept, collapsed, errors, frames_emitted, video_s, longest_hold_s, gif, mp4 }`.
  B5's pacing report reads `video_s` + `longest_hold_s` verbatim.

### 2.10 Test hooks (spec-only, not in SKILL.md; B2 §2.7 precedent)

- `ARCH_TIMELAPSE_FORCE_EXTRACT_FAIL` — comma-separated 1-based plan indices; the
  extract wrapper throws for those commits before calling `extractModel`, exercising
  the real error-decision path deterministically (B1's corrupt-manifest behavior is
  its own business and may be either lenient or throwing).
- `ARCH_TIMELAPSE_HALT_AFTER` — int N: after atomically writing progress for the Nth
  processed commit, release the lock, delete the temp tree, print the final JSON line
  with `halted: true`, exit 0, skipping stitch. The deterministic resume fixture.

## 3. Config schema — additions to `.arch-timelapse.yaml`

The five reserved names from B1 §3 are now implemented; nothing is repurposed.

| field | type | default | asked-at-init? |
|---|---|---|---|
| `collapse_mode` | string | `badge` (`badge \| drop \| speedthrough`) | yes (B4; design `:150-152`) |
| `fps` | number | `1` | yes (B4, pacing) |
| `max_hold_ms` | int | `3500` | yes (B4, pacing) |
| `max_commits` | int/null | `null` | no (CLI `--max-commits` overrides) |
| `history_mode` | string | `first-parent` (sole supported value in v1; any other ⇒ exit 3) | no |
| `prefilter` | bool | `true` | no |
| `annotate` | bool | `true` | no |
| `speedthrough_frame_ms` | int | `120` | no |
| `video.gif_width` | int | `960` | no |
| `video.crf` | int | `22` | no |

All appear in load-config DEFAULTS so `init` writes them (§2.1). Unknown
`collapse_mode` value ⇒ exit 3 preflight.

## Slices

Environment for all acceptance checks (zsh: export them; tool pins probed this run —
ffmpeg 8.1.1 no-drawtext Homebrew build, ffprobe of same, jq 1.6, git 2.54.0, node
26; commands below are written against these versions):

```
export REPO=<executor worktree root>
export SKILL="$REPO/architecture-evolution-timelapse"
export SCRATCH=/private/tmp/claude-501/-Users-rajdholakia-Documents-claude-skills/46feeefb-6ad0-4df2-84af-241f07b3493f/scratchpad
export TREE="$SCRATCH/75-proof"
```

Live-repo snapshot rule: before the FIRST 75-proof check of each slice run
`git -C "$TREE" status --porcelain > "$SCRATCH/b3-porcelain-before.txt"`; after the
LAST, `git -C "$TREE" status --porcelain | diff - "$SCRATCH/b3-porcelain-before.txt"`
→ empty (pre-existing dirt is not a defect; new dirt is).

Fixture builder (both slices; I8-compliant explicit staging):

```
bash -c 'set -euo pipefail; F="$SCRATCH/b3-fixture"; rm -rf "$F"; mkdir -p "$F/app" "$F/lib"; cd "$F"; git init -q .; git config user.name fx; git config user.email fx@example.com; printf "%s\n" "{\"name\":\"fixture-app\",\"private\":true,\"dependencies\":{\"next\":\"15.0.0\"}}" > package.json; printf "%s\n" "export default function Page() { return null; }" > app/page.tsx; printf "%s\n" "export const u = 1;" > lib/util.ts; printf "%s" "{\"system_name\":\"fixture-app\"}" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json; git add package.json app/page.tsx lib/util.ts .arch-timelapse.yaml .gitignore; git commit -qm F1; printf "%s\n" "export default function Page() { return 1; }" > app/page.tsx; git add app/page.tsx; git commit -qm F2; printf "%s\n" "export const e = 2;" > lib/extra.ts; git add lib/extra.ts; git commit -qm F3; printf "{invalid\n" > package.json; git add package.json; git commit -qm F4; printf "%s\n" "{\"name\":\"fixture-app\",\"private\":true,\"dependencies\":{\"next\":\"15.0.0\"}}" > package.json; mkdir -p convex; printf "%s\n" "export const x = 1;" > convex/users.ts; git add package.json convex/users.ts; git commit -qm F5'
```

Fixture semantics: F1 baseline (all levels kept); F2 body-only edit (all duplicate);
F3 adds `lib/extra.ts` (component kept, container+context duplicate — the
independence proof); F4 corrupts `package.json` (B1-dependent: benign or error —
assertions are bounded accordingly; context is immune either way because
`system_name` is pinned in config and no external rule fires); F5 restores the
manifest and adds `convex/users.ts` (container + component kept; context duplicate —
no `convex` DEP is ever added, so `ext.convex` never fires and context stays
single-frame across all five commits: the never-changing-level case).

### Slice 1 — walk engine: `run` through rendered kept frames

`run-history.mjs`, dispatcher wiring for `run`, prefilter, archive checkout, extract
seam + error decisions, per-level detection, `frames.json`, `progress.json`, lock,
resume, `--dry-run`, both test hooks, per-kept-commit render dispatch. No annotation,
no videos, no index.html (final JSON omits video fields; cost.json may be partial).

Acceptance:

1. Build the fixture (block above) → exit 0.
2. Plain run:
   `bash -c 'cd "$SCRATCH/b3-fixture" && "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-fx-r1" > "$SCRATCH/b3-fx-r1.out" 2> "$SCRATCH/b3-fx-r1.err"; rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 4 ]'`
   → exit 0. Then `RID=$(tail -n 1 "$SCRATCH/b3-fx-r1.out" | jq -r .run_id)` and
   `RD="$SCRATCH/b3-fx-r1/$RID"`.
3. frames.json decisions:
   `jq -e '.schema_version==1 and .walked==5 and (.commits|length)==5' "$RD/frames.json"`;
   context single-kept:
   `jq -e '[.commits[].decision.context] | .[0]=="kept" and ([.[1:][] | select(.=="kept")] | length)==0' "$RD/frames.json"`;
   component kept exactly F1/F3/F5:
   `jq -e '[.commits[] | select(.decision.component=="kept") | .index] == [1,3,5]' "$RD/frames.json"`;
   independence at F3:
   `jq -e '.commits[2].decision.component=="kept" and .commits[2].decision.container=="duplicate" and .commits[2].decision.context=="duplicate"' "$RD/frames.json"`;
   F5 container kept: `jq -e '.commits[4].decision.container=="kept"' "$RD/frames.json"`;
   F4 bounded: `jq -e '.commits[3].decision.component | IN("duplicate","error")' "$RD/frames.json"` (jq 1.6 `IN`).
4. Kept-only rendering: F3's bundle contains ONLY the changed level —
   `bash -c 'ls "$RD"/models/003_*/ | sort | tr "\n" " "'` prints exactly
   `component.mmd component.png hashes.json model.json ` and no `models/002_*` dir
   exists (`bash -c '! ls -d "$RD"/models/002_* 2>/dev/null'`).
5. Hygiene: `test -f "$RD/progress.json" && test ! -d "$SCRATCH/b3-fx-r1/.lock.d" && test ! -d "$RD/.tmp-tree"`;
   stdout has 5 progress lines + 1 final JSON line:
   `bash -c '[ "$(grep -c "^\[" "$SCRATCH/b3-fx-r1.out")" -eq 5 ]'`.
6. Determinism: re-run with `--fresh` to `RID2`; then
   `bash -c 'jq -S "[.commits[] | {hash, decision, hashes}]" "$RD/frames.json" > "$SCRATCH/b3-d1.json"; jq -S "[.commits[] | {hash, decision, hashes}]" "$SCRATCH/b3-fx-r1/$RID2/frames.json" | diff - "$SCRATCH/b3-d1.json"'`
   → empty diff.
7. Forced error path:
   `bash -c 'cd "$SCRATCH/b3-fixture" && ARCH_TIMELAPSE_FORCE_EXTRACT_FAIL=2 "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-fx-r2" > "$SCRATCH/b3-fx-r2.out"; [ $? -eq 4 ]'`;
   commit 2 decision error on every level and single-line error:
   `bash -c 'R="$SCRATCH/b3-fx-r2/$(tail -n1 "$SCRATCH/b3-fx-r2.out" | jq -r .run_id)"; jq -e "(.commits[1].decision | [.context,.container,.component] | all(.==\"error\")) and (.commits[1].error | contains(\"\n\") | not)" "$R/frames.json"'`;
   component kept still `[1,3,5]` in that run.
8. Halt + resume:
   `bash -c 'cd "$SCRATCH/b3-fixture" && ARCH_TIMELAPSE_HALT_AFTER=3 "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-fx-r3" > "$SCRATCH/b3-h1.out"; [ $? -eq 0 ]'`
   with `halted==true` and 3 progress entries; then the SAME command WITHOUT the env
   var → final JSON `resumed==true`, same `run_id` as the halted run, `walked==5`,
   frames.json has 5 commits, and decisions equal check-6's canonical dump.
9. Dry-run writes nothing:
   `bash -c 'cd "$SCRATCH/b3-fixture" && "$SKILL/scripts/arch-timelapse.sh" run --dry-run --out "$SCRATCH/b3-fx-dry" | jq -e ".walked==5"; test ! -d "$SCRATCH/b3-fx-dry"'`.
10. Zero-frontend-structure repo:
    `bash -c 'set -euo pipefail; P="$SCRATCH/b3-pyfix"; rm -rf "$P"; mkdir -p "$P"; cd "$P"; git init -q .; git config user.name fx; git config user.email fx@example.com; printf "hello\n" > README.md; printf "print(1)\n" > main.py; git add README.md main.py; git commit -qm c1; printf "print(2)\n" > main.py; git add main.py; git commit -qm c2; "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-py-run" > "$SCRATCH/b3-py.out" 2> "$SCRATCH/b3-py.err"'`
    → exit 0; `.commits[1].decision.context=="prefiltered"` and every level kept-count
    is 1 (first frame only) in that run's frames.json;
    `grep -q 'using defaults' "$SCRATCH/b3-py.err"` (config-less notice,
    s1:load-config.mjs:38).
11. Empty history:
    `bash -c 'E="$SCRATCH/b3-empty"; rm -rf "$E"; mkdir -p "$E"; cd "$E"; git init -q .; "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-empty-out"; [ $? -eq 3 ]'`
    → exit 0 (inner rc 3), one stderr line, `test ! -d "$SCRATCH/b3-empty-out"`.
12. 75-proof bounded sample (snapshot rule above):
    `bash -c 'cd "$TREE" && "$SKILL/scripts/arch-timelapse.sh" run --max-commits 15 --out "$SCRATCH/b3-75-r1" > "$SCRATCH/b3-75-r1.out" 2> "$SCRATCH/b3-75-r1.err"; rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 4 ]'`;
    frames.json: `walked==15`, commit 1 kept on all three levels, every level
    kept ≥ 1; `test ! -e "$TREE/.arch-timelapse"`;
    `bash -c '[ "$(git -C "$TREE" worktree list | wc -l | tr -d " ")" -eq 1 ]'`
    (no worktrees ever created); porcelain diff empty.
13. Safety fences:
    `grep -rn 'npm ci\|npm install\|pnpm\|yarn\|bun install' "$SKILL/scripts/run-history.mjs" "$SKILL/scripts/stitch-levels.mjs"` → no matches;
    `grep -En "'(worktree|checkout|add|commit|push|reset|merge|rebase)'" "$SKILL/scripts/run-history.mjs"` → no matches (read-only git allowlist);
    `grep -c 'archive' "$SKILL/scripts/run-history.mjs"` ≥ 1;
    `grep -rln 'frontend-evolution-timelapse' "$SKILL/scripts"` → every named file's
    match is a provenance comment (I6).

### Slice 2 — annotate + collapse modes + stitch + index + `stitch-only`/`clean`

`stitch-levels.mjs`, `render-index.mjs`, annotation compositor, run-end wiring,
cost.json finalized, dispatcher wiring for `stitch-only` + `clean`.

Acceptance:

1. Full fixture run:
   `bash -c 'cd "$SCRATCH/b3-fixture" && "$SKILL/scripts/arch-timelapse.sh" run --fresh --out "$SCRATCH/b3-fx-s2" > "$SCRATCH/b3-s2.out"; rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 4 ]'`;
   `RD2="$SCRATCH/b3-fx-s2/$(tail -n1 "$SCRATCH/b3-s2.out" | jq -r .run_id)"`; the six
   files `videos/{context,container,component}.{gif,mp4}` exist;
   `ffprobe -v error -show_entries stream=width,height -of csv=p=0 "$RD2/videos/context.mp4"`
   prints `1920,1080`; same probe on `context.gif` prints a line starting `960,`.
2. Never-changing level = single frame + badge hold: cost.json
   `jq -e '.levels.context.kept==1 and .levels.context.frames_emitted==1 and .levels.context.collapsed==4' "$RD2/cost.json"`;
   duration reflects the capped log hold (collapsed=4 ⇒ ~3.32 s + concat tail):
   `bash -c 'd=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$RD2/videos/context.mp4"); awk -v d="$d" "BEGIN{exit !(d>=3.0 && d<=6.5)}"'`.
3. Annotation applied and non-destructive:
   `bash -c 'set -- "$RD2"/models/001_*/context.png; P="$1"; set -- "$RD2"/annotated/context/001_*.png; A="$1"; test -f "$P" && test -f "$A" && ! cmp -s "$P" "$A"'`.
4. cost.json contract:
   `jq -e '.schema_version==1 and (.levels.component.video_s|type=="number") and (.levels.component.longest_hold_s|type=="number") and (.annotate=="ok") and (.extract_ms_total|type=="number")' "$RD2/cost.json"`.
5. index.html: `test -f "$RD2/index.html"` and
   `bash -c '! grep -qE "/Users/|file://" "$RD2/index.html"'` and it names all three
   levels (`bash -c '[ "$(grep -c -i "context\|container\|component" "$RD2/index.html")" -ge 3 ]'`).
6. `stitch-only` + collapse modes (config is re-written via init, then re-stitched in
   place):
   `bash -c 'cd "$SCRATCH/b3-fixture" && printf "%s" "{\"system_name\":\"fixture-app\",\"collapse_mode\":\"speedthrough\"}" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json && "$SKILL/scripts/arch-timelapse.sh" stitch-only --out "$SCRATCH/b3-fx-s2" > "$SCRATCH/b3-st1.out"'`
   → exit 0 and `jq -e '.context.frames_emitted==5 and .context.collapse_mode=="speedthrough"' "$SCRATCH/b3-st1.out"`
   (1 kept + 4 flash frames). Then the same with `drop` →
   `jq -e '.context.frames_emitted==1 and .context.collapse_mode=="drop"'` and context
   mp4 duration ≤ 2.5 s (uniform hold, no badge scaling). Restore `badge` config after.
7. Chromium-missing degrade (single-commit repo):
   `bash -c 'set -euo pipefail; S1="$SCRATCH/b3-single"; rm -rf "$S1"; mkdir -p "$S1/app"; cd "$S1"; git init -q .; git config user.name fx; git config user.email fx@example.com; printf "%s\n" "{\"name\":\"single\",\"private\":true}" > package.json; printf "%s\n" "export default function Page() { return null; }" > app/page.tsx; git add package.json app/page.tsx; git commit -qm c1; mkdir -p "$SCRATCH/b3-nobrowsers"; PLAYWRIGHT_BROWSERS_PATH="$SCRATCH/b3-nobrowsers" "$SKILL/scripts/arch-timelapse.sh" run --out "$SCRATCH/b3-single-run" > "$SCRATCH/b3-single.out" 2> "$SCRATCH/b3-single.err"'`
   → exit 0; three videos exist (from B2's lavfi placeholder PNGs); stderr contains
   `npx playwright install chromium`; that run's cost.json has
   `.annotate=="skipped-chromium-missing"`. This doubles as the single-commit /
   first-frame case: every level `kept==1`, single-frame videos.
8. `clean`:
   `bash -c 'mkdir -p "$SCRATCH/b3-fx-s2/.lock.d" && "$SKILL/scripts/arch-timelapse.sh" clean --out "$SCRATCH/b3-fx-s2" | jq -e .ok && test ! -d "$SCRATCH/b3-fx-s2/.lock.d"'`;
   videos and frames.json still present afterwards.
9. `--levels` filter:
   `bash -c 'cd "$SCRATCH/b3-fixture" && "$SKILL/scripts/arch-timelapse.sh" run --fresh --levels context --out "$SCRATCH/b3-fx-lvl" > "$SCRATCH/b3-lvl.out"; rc=$?; [ "$rc" -eq 0 ] || [ "$rc" -eq 4 ]'`;
   that run has `videos/context.mp4` but no `videos/component.mp4`, and frames.json
   decision maps contain only the `context` key.
10. 75-proof S2 sample (snapshot rule): re-run check S1-12's command against a fresh
    out dir `"$SCRATCH/b3-75-r2"` → three GIF+MP4 pairs exist; cost.json exposes
    `video_s`/`longest_hold_s` per level; determinism across S1/S2 runs:
    `bash -c 'jq -S "[.commits[] | {hash, hashes}]" "$SCRATCH/b3-75-r1"/*/frames.json > "$SCRATCH/b3-75-d1.json"; jq -S "[.commits[] | {hash, hashes}]" "$SCRATCH/b3-75-r2"/*/frames.json | diff - "$SCRATCH/b3-75-d1.json"'`
    → empty; porcelain diff empty; `test ! -e "$TREE/.arch-timelapse"`.
11. Regressions + fences: `"$SKILL/scripts/arch-timelapse.sh" bogus` → exit 2, usage
    on stderr (B1 dispatcher behavior preserved);
    `bash -c 'cd "$SKILL/scripts" && node -p "Object.keys(require(\"./package.json\").dependencies).sort().join()"'`
    prints exactly `mermaid,minimatch,playwright,yaml` (I7 — B3 adds nothing);
    `grep -rn 'drawtext' "$SKILL/scripts"` → no matches (the compositor is Chromium,
    §2.7).

## Edge cases

- **Empty history** — `git init` with zero commits: `rev-list` empty ⇒ exit 3, one
  stderr line, nothing written (S1 check 11).
- **Single commit / first frame** — plan of one: every level kept at commit 1,
  single-frame videos, no badge (`collapsed = 0`); the first plan commit is always
  the baseline even under `--max-commits` slicing (S2 check 7).
- **All-duplicates run** — every commit after the first hashes identical on every
  level ⇒ one kept frame per level and badge `×(walked−1) commits · no architecture
  change`; fixture context IS this case end to end (S2 check 2).
- **Level never changes across the whole range** — same as above per single level
  while other levels move: fixture context vs component (S1 check 3, S2 check 2).
- **Resume mid-run** — halt hook leaves a clean partial `progress.json`; re-invocation
  auto-resumes the same run id, skips completed commits, reconstructs last-kept hashes
  from stored entries, finishes walk + stitch (S1 check 8). Explicit `--run-id` with
  changed config/plan ⇒ exit 3 with the `--fresh` remedy; implicit auto-resume falls
  back to a fresh run with a notice (§2.2).
- **Extraction throws mid-history** (corrupt `package.json` etc.) — decision `error`
  for every requested level, first-line message recorded, walk continues, exit 4;
  never a crash and never a kept frame (fixture F4 bounded assertions + deterministic
  FORCE_EXTRACT_FAIL hook, S1 checks 3/7). Leading errors before a level's first kept
  frame emit no video frame.
- **Repo with zero frontend-ish structure** — B1 yields the minimal person+system
  model (B1 spec §2.2 "NOT an error"); commits touching only non-source files are
  prefiltered; result is one kept frame per level and (possibly) an empty component
  level rendered as B2's `(empty level)` synthetic node (S1 check 10).
- **Missing binary: Chromium** — B2's render CLI degrades to lavfi placeholder PNGs
  (exit 0, reason `chromium-missing`), B3 skips annotation with one actionable stderr
  line, videos still stitch, run exit 0 (S2 check 7).
- **Missing binary: ffmpeg** — extraction, detection, rendering of `.mmd` (B2 §2.2)
  and frames.json all complete; stitch marks every level `fail` with an actionable
  stderr line naming ffmpeg; exit 4; no partial video files left behind. (Not
  command-checked — PATH surgery is brittle; behavior is contractual.)
- **Temp-tree cleanup on abort** — B3 uses NO git worktrees by design (§2.1: archive
  runs no hooks, writes nothing to the target's `.git`, needs no abort-time
  `worktree remove`— the failure mode the task's "worktree cleanup on abort" edge case
  names is designed out). The residual risk is the `.tmp-tree` dir inside the RUN dir
  (never the target): deleted on normal exit and via a process-exit handler; a
  SIGKILL'd run leaves at most stale temp inside `--out`, which `clean` removes and a
  resumed run overwrites (S2 check 8). The lock's stale-reclaim (lock.mjs:41-59
  pattern) unblocks the next run.
- **Merge commits on the first-parent path** — 31 of 75-proof's 80 first-parent
  commits are merges; `git log --first-parent --name-only` (git 2.54.0,
  probe-verified) lists their files as the diff vs first parent, so the prefilter sees
  real change sets; extraction itself is tree-based and indifferent.
- **Render failure on a kept frame** — B2 retries then placeholders (still a usable
  frame); only `failed`/exit-4 renders drop the frame from the concat with its
  collapsed count folded backward, forcing run exit 4 (§2.8).

## Open choices

1. **Resume ergonomics** — chosen: implicit auto-resume of the latest matching
   incomplete run inside `run` (walks are cheap; a separate `resume` subcommand like
   the sibling's buys nothing), with explicit `--run-id` mismatches refused per the
   A2-DELTA philosophy. Alternative a DELTA may pick: sibling-parity explicit
   `resume` subcommand, `run` always fresh.
2. **Annotation compositor** — chosen: Playwright Chromium composite (§2.7), forced
   by the probe fact that ffmpeg 8.1.1 here ships without drawtext; zero new deps.
   Alternative: require a freetype-enabled ffmpeg and use drawtext (rejected: adds an
   environment requirement the design's own machine fails).
3. **Badge hold curve** — chosen: `base × (1 + log2(1 + collapsed))` capped at
   `max_hold_ms` (reads as a pause, never dead air). Alternative: linear
   `base + k×collapsed` capped. Either is a stitch-only change; B5's pacing report is
   the arbiter and `stitch-only` makes re-cuts free.
4. **Error commits in speedthrough** — chosen: they flash like duplicates (carry the
   last kept image with their own commit annotation). Alternative: dedicated error
   styling in the bar; deferred — frames.json already carries the data.

## Risks

1. **Predecessor drift** — B1-s2 and B2 are unmerged; if `extractModel`'s export shape
   or the render CLI's JSON line lands differently than spec'd, B3's seams move.
   Mitigation: both are declared frozen contracts in their specs; executor reconciles
   file names at start and records deltas in Execution notes.
2. **Per-kept-commit render spawns** — one node+Chromium launch per kept model
   (~2 s each). At fixture/sample scale trivial; on the full 80-commit B5 run with
   ~30-60 kept frames across levels this is minutes, not hours. Accepted; a batch
   render API would be a B2 seam change, not a B3 workaround.
3. **First-parent count surprise** — the design and backlog say "278 commits";
   75-proof's first-parent walk is **80** (probed this run; 278 counts side-branch
   commits). B5's pacing expectations must be framed against 80. Flagged so the E2E
   item doesn't read 80 frames-walked as a bug.
4. **F4 fixture assertions are B1-behavior-bounded** — whether corrupt manifests throw
   or degrade belongs to B1; B3's own error path is proven by the deterministic hook
   instead. Accepted looseness, explicitly marked in the acceptance commands.
