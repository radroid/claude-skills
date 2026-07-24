# A4 — Init interview: invocation-time options (dedup, collapse mode, threshold, pacing, annotation); SKILL.md + references

Item: A4 (lane A, needs A3). Design: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`
(incl. the "Decisions — 2026-07-13" addendum: "Every new behavior is an invocation-time option…
Answers persist to the config file; `run` honors config without re-asking"). Invariants in force:
I4 (OPTIONS ARE ASKED — this item is I4's instrument for lane A), I5 (v1 recoverable — the interview
must make `dedup.enabled: false` a first-class answer), I7 (dependency fence — no new packages),
I8 (explicit staging). Skill under change: `frontend-evolution-timelapse/`.

Anchor provenance — the pre-A1 tree on `main` is DEAD for this skill; every anchor below is tagged:

- **(A2)** = verified this run against `origin/item/a2-dedup-engine` (A1+A2 code truth, FROZEN).
- **(CAT)** = verified this run against `origin/change-aware-timelapse` (files A1/A2 did not touch).
- **(A3 spec)** = frozen contract from `docs/orchestration/specs/A3-stitch-collapse.md` — A3 executes
  before A4; its branch is A4's base. The executor reconciles exact line drift against A3's landed
  code and its `## Execution notes`.

Predecessor contracts consumed as frozen:

- A2's `dedup` config block with load-time validation incl. unknown-key rejection:
  `lib/load-config.mjs:29-35` (A2) defaults (`enabled: true`, `threshold: 0.005`,
  `ignore_selectors: []`, `collapse_mode: 'badge'`, `max_hold_ms: 3000`); `validateDedup` at
  `lib/load-config.mjs:56-87` (A2) — unknown-key throw `unknown dedup field: <key>` (lines 60-63),
  `dedup.threshold must be a number between 0 and 1` (line 74), collapse-mode enum (82-83),
  positive-int max_hold (85-86); deep-merge + validate on load at `lib/load-config.mjs:101-106` (A2);
  page validation `page "<name>" requires wait_for selector` (line 112) and non-empty-pages check
  (107-109). `loadConfig(repoRoot, configPath)` honors an explicit path (line 90-91) — A4's
  validation gate (R3) depends on that signature.
- A2's `cost.json` `dedup` counters (A2 spec R7 + its execution notes "whole-run truth"):
  `kept_frames`, `duplicate_frames`, `skipped_frames`, `boot_skipped_commits`, `discarded_pngs`,
  present only when `dedup.enabled`.
- A3's re-binds (A3 spec §3 table — its "asked at init?" column literally names A4 for `annotate`,
  `dedup.collapse_mode`, `dedup.max_hold_ms`): `annotate` is stitch-time burn-in and is dropped from
  the resume hash (A3 R5); `gif.fps` is the pacing base for BOTH outputs (A3 R2); collapse modes
  `badge|drop|speedthrough` with the hold formula (A3 R2).
- **Orchestrator DELTA (backlog lines 34-37, binding):** `mp4.fps` is RETIRED — MP4 output is CFR 30;
  docs must mark it ignored. A3 R4 makes stitch ignore it; A4 stops emitting it from `init` and
  documents the retirement (R2, R5, R6).

## 1. Goal

Make every change-aware option an invocation-time question: SKILL.md's Agent workflow instructs the
invoking agent — in tool-agnostic prose — to interview the user at `init` time (dedup on/off,
collapse mode, threshold, pacing, annotation, plus the existing pages/viewport/server questions),
pipe the answers as one JSON document into `init-config.mjs`, and never re-ask at `run`. init-config
gains deep-merge of the `dedup`/`gif` blocks (so partial answers still persist complete,
self-documenting YAML), a load-config validation gate (bad answers fail at init, not mid-run), and
stops emitting the retired `mp4.fps`. References document every option with its question.

### Non-goals

- NO capture/stitch/engine code changes. Blast radius is exactly: `SKILL.md`,
  `references/config-schema.md`, `references/workflow.md`, `scripts/init-config.mjs`. In particular
  `scripts/timelapse.mjs` is untouched — its `init` command (spawns init-config WITHOUT
  `--stdin-json` and without checking the child's exit status, `timelapse.mjs:212-222` (A2)) keeps
  its defaults-only semantics; the documented interview path calls `init-config.mjs` directly, which
  is already the pattern at `references/workflow.md:17-21` (A2). The unpropagated rc is a known seam,
  noted for the steward, not fixed here.
- No new config FIELDS and no `lib/load-config.mjs` edits — the interview covers existing fields only
  (I4's "config field with a default" half was satisfied by A1/A3; A4 adds the "question" half).
- No interactive prompting inside init-config.mjs itself — it stays a non-interactive JSON→YAML tool;
  the QUESTIONS are asked by the invoking agent through whatever question tool its runtime has.
  SKILL.md speaks to any agent runtime, not just Claude Code.
- No `references/troubleshooting.md` changes (A2/A3 already added their entries).
- No E2E run, no kayvee involvement: acceptance is fully hermetic (temp dirs). The live-repo snapshot
  protocol does not apply — no check below touches a live demo repo. Nothing in lane B.

## 2. Requirements

**R1 — The interview (SKILL.md Agent workflow).** Replace step 3's one-liner
("Run `init` if no `.timelapse.yaml`", `SKILL.md:55` (A2)) with an interview subsection instructing
the invoking agent, in tool-agnostic prose:

- Run the interview only when `.timelapse.yaml` is absent (or the user explicitly asks to
  reconfigure). Ask the user **one question per option group**, with the default pre-selected; any
  question the user waves off keeps its default. The exact phrase `one question per option group`
  must appear (acceptance grep).
- The option groups, their config fields, and defaults are the table in §3 (Q1–Q8). Q5 and Q6 are
  asked only when the Q4 answer keeps dedup enabled; skipped questions still persist their defaults
  in the YAML (R2's deep-merge guarantees the block is complete).
- Collect all answers into ONE JSON document and pipe it:
  `node "$SKILL_ROOT/scripts/init-config.mjs" --stdin-json` from the target repo root — the same
  invocation `references/workflow.md:20` (A2) already documents. Keys the user left at "auto-detect"
  (dev command, port) are OMITTED from the JSON so init-config's detection fills them
  (`init-config.mjs:47-58` (A2)).
- `run` and `resume` never re-ask: `.timelapse.yaml` is authoritative. The phrase `never re-ask`
  must appear in both SKILL.md and workflow.md (acceptance grep). To change an answer later:
  stitch-time knobs (`dedup.collapse_mode`, `dedup.max_hold_ms`, `annotate` — excluded from the
  resume hash, `references/config-schema.md:106-112` (A2) + A3 R5) take effect via
  `stitch-only` re-render with no recapture; capture-relevant fields (`dedup.enabled`,
  `dedup.threshold`, `dedup.ignore_selectors`, pages, viewport…) change the `config_hash` and need
  `--fresh`.

Also update the Quick start comment (`SKILL.md:38` (A2), currently "agent asks for pages, port, dev
command; pipes JSON to init-config.mjs") to name the full interview: pages, viewport, server, dedup,
collapse mode, threshold, pacing, annotation.

**R2 — init-config.mjs input handling.** Current behavior, verified by live probe of the frozen (A2)
file this run: `--stdin-json` reads fd 0 (`init-config.mjs:29-38` (A2)); the config is built by
SHALLOW spread `{...DEFAULTS, ...input, …}` (`init-config.mjs:47-58` (A2)), so a full `dedup` block
in the input already passes through to the YAML, but a PARTIAL block (e.g. only `enabled: false`)
replaces the default block wholesale and persists an incomplete `dedup:` mapping (probed: input
`{"dedup":{"enabled":false}}` emits a dedup block containing only `enabled: false`). Changes:

- **Deep-merge sub-blocks**: the emitted `dedup` block is DEFAULTS.dedup overlaid with `input.dedup`;
  the emitted `gif` block is DEFAULTS.gif overlaid with `input.gif` (DEFAULTS imported already,
  `init-config.mjs:5` (A2); blocks at `lib/load-config.mjs:29-36` (A2)). Every generated YAML
  therefore carries all five `dedup.*` fields and all three `gif.*` fields — the persisted file IS
  the record of the interview. (loadConfig would deep-merge `dedup` again at run time,
  `lib/load-config.mjs:105` (A2), but `gif` it would not — stitch's per-field fallbacks at
  `stitch.mjs:13-17` (CAT) are the only net; init must not rely on them.)
- **`mp4.fps` retirement (DELTA)**: the emitted `mp4` block is DEFAULTS.mp4 overlaid with
  `input.mp4`, then WITHOUT `fps` unless the input JSON explicitly supplied `mp4.fps` (explicit input
  passes through — the field stays accepted per A3 §3, it is just never advertised to new users).
  Fresh default output: an `mp4:` block containing `crf: 22` and no `fps` line.
- **Reject a non-mapping `dedup` input** (array, string, number) with the exact message load-config
  uses for the same shape error — `dedup must be a mapping of dedup.* fields`
  (`lib/load-config.mjs:102-104` (A2)) — and exit 3.
- **Malformed `--stdin-json`**: today an unhandled `JSON.parse` throw exits 1 with a raw stack
  (probed this run on the frozen file). New behavior: stderr line containing verbatim
  `invalid --stdin-json input` (plus the parse error), exit 3, nothing written.

**R3 — init-config.mjs validation gate.** Bad interview answers must fail at init, not at the next
morning's preflight. New write path, in order:

1. Build the config object (R2 merges).
2. Write it to a temp file in the destination's directory.
3. Validate by calling `loadConfig` with that temp path (`loadConfig(repoRoot, tmpPath)`,
   signature at `lib/load-config.mjs:90` (A2)). This buys, for free: unknown-dedup-key rejection,
   every `validateDedup` range/type/enum check, non-empty `pages`, and per-page `wait_for` presence
   — with load-config's exact error strings.
4. On validation throw: remove the temp file, print the error message to stderr, exit 3. The
   DESTINATION is untouched — re-running init over an existing good `.timelapse.yaml` with bad
   answers must not destroy it (acceptance check 6).
5. On success: append the `.gitignore` lines exactly as today (`init-config.mjs:65-75` (A2)), rename
   the temp file onto the destination, print the existing `{"ok":true,"path":…}` JSON line to stdout
   (`init-config.mjs:77` (A2)) and exit 0.

`--out` semantics, stdout contract, and the `.gitignore` content are otherwise unchanged.

**R4 — `references/workflow.md` §1 rewrite** (lines 9-23 (A2), currently three bullets: pages,
viewport, port/dev). New content:

- The full question list (§3 table): each question, the config field(s) it answers, its default, and
  its skip condition — including the four new groups (dedup on/off + ignore_selectors, collapse
  mode, threshold, pacing) and annotation.
- An example `answers.json` showing the new fields flowing through (a JSON document with `pages`,
  `dedup.{enabled,threshold,ignore_selectors,collapse_mode,max_hold_ms}`, `gif.fps`, `annotate`),
  piped via the existing `--stdin-json` invocation (line 20 (A2) stays).
- The `never re-ask` rule and the two change-an-answer-later paths from R1 (stitch-time knobs →
  `stitch-only`; capture-relevant fields → `--fresh`).
- A note that init VALIDATES: invalid answers exit 3 with the load-config error and leave any
  existing config untouched (R3).

**R5 — `references/config-schema.md`.** Two additions (reconcile placement with A3's landed R7 doc
edits — A3 touches the `annotate` row, the collapse/max_hold rows, the hash list, and adds a
`gif.fps` note):

- New section headed exactly `## Init interview` (acceptance grep): the §3 table — question,
  field(s), default, when asked — naming each of `dedup.enabled`, `dedup.threshold`,
  `dedup.ignore_selectors`, `dedup.collapse_mode`, `dedup.max_hold_ms`, `gif.fps`, `annotate`,
  `pages`, `viewport`, `dev`/`port`, and stating that `run`/`resume` read config and never re-ask.
- The "Output video" block (lines 65-69 (A2), currently a YAML snippet showing
  `mp4: { fps: 1.5, crf: 22 }`): show `mp4: { crf: 22 }`, and state verbatim that `mp4.fps` is
  `accepted but ignored` (acceptance grep) — MP4 encodes at a `fixed 30 fps` CFR; `gif.fps` is the
  single pacing base for both outputs (consistent with A3 R7's gif.fps note — merge, don't
  duplicate).

**R6 — SKILL.md beyond the interview (task (d)).**

- **Stitch-time annotation reflected**: state that captured screenshots are pristine and the commit
  banner (`hash | date | subject`) plus the `×N commits · no visual change` badge are burned in at
  stitch time (A3 R3); `annotate: false` or `--no-annotate` yields bare frames; pacing/mode/annotation
  tweaks re-render via `stitch-only` without recapture. The phrase `stitch time` must appear
  (acceptance grep).
- **mp4.fps retirement**: one line stating MP4 encodes at a `fixed 30 fps` (acceptance grep) and
  `mp4.fps` is ignored; `gif.fps` paces both outputs.
- **Output layout block** (`SKILL.md:87-104` (A2)): add `frames.json` under `page-<name>/` and the
  `stitch-frames/` workspace dir (A3 R3) so the layout is truthful post-A1/A3.
- **Agent workflow "after run" step** (`SKILL.md:62` (A2)): extend to read `cost.json`'s `dedup`
  block when present and report the collapse to the user — naming `kept_frames`,
  `duplicate_frames`, and `boot_skipped_commits` (A2 R7; acceptance grep on
  `boot_skipped_commits`).
- Leave intact: two-repo model, trust/safety, CLI flags line (`--no-annotate` already listed,
  `SKILL.md:83` (A2)), cost discipline, resume section.

## 3. Config/schema changes

**No new fields; no `lib/load-config.mjs` edits.** The interview maps onto existing fields:

| Q | Asks (one question per group) | Field(s) | Type | Default | Asked at init? |
|---|---|---|---|---|---|
| Q1 | Pages to capture (name, path, wait_for selector) | `pages[]` | list | `home` `/` `main, [role=main], #root` | yes (existing) |
| Q2 | Viewport | `viewport.width/height` | ints | 1440×900 | yes (existing) |
| Q3 | Dev command + port | `dev`, `port` | string, int | auto-detected (omit keys to accept) | yes (existing) |
| Q4 | Collapse visually-identical commits? Any dynamic elements to mask? | `dedup.enabled`, `dedup.ignore_selectors` | bool, string[] | `true`, `[]` | yes (NEW) |
| Q5 | How should unchanged stretches read? `badge` \| `drop` \| `speedthrough` | `dedup.collapse_mode` | enum | `badge` | yes (NEW; only when dedup on) |
| Q6 | Change sensitivity (fraction of pixels that must differ) | `dedup.threshold` | number 0–1 | `0.005` | yes (NEW; only when dedup on) |
| Q7 | Pacing: seconds per frame + longest hold | `gif.fps`, `dedup.max_hold_ms` | number, pos int | `1.5`, `3000` | yes (NEW) |
| Q8 | Burn commit banner + badge into the video? | `annotate` | bool | `true` | yes (NEW; per A3 §3's table) |
| — | — | `mp4.fps` | number | not emitted | NO — RETIRED (DELTA); accepted but ignored |

init-config emission changes (R2/R3): deep-merged complete `dedup`/`gif` blocks; `mp4` block without
`fps` unless explicitly supplied; validation-before-write with exit 3 on bad answers.

## 4. Slices

### Slice 1 (the whole item — one PR)

Interview prose + doc overhaul + init-config input/validation changes. Files touched, all under
`/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse/`: `SKILL.md`,
`references/config-schema.md`, `references/workflow.md`, `scripts/init-config.mjs` (plus this spec
file under `docs/orchestration/specs/`). `scripts/package.json` gains nothing (I7). Branch from A3's
HEAD branch; PR targets that branch (stacked-PR mode, backlog lines 42-50). I8 throughout:
explicit-path `git add` only.

**Acceptance setup** (tool versions probed this run and pinned: node v26.0.0, yaml 2.9.0 via the
lockfile; `grep` in this environment is a shell wrapper over ugrep 7.5.0 with `/usr/bin/grep` = BSD
2.6.0 — the YAML-format anchor patterns in checks 1–3 and 8 were probed against live init-config
emission on both implementations this run; the doc greps in checks 9–10 anchor on strings this spec
mandates verbatim. No jq/ffmpeg/chromium needed — every check is grep/sed/cmp on text files):

```bash
SKILL=/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse
cd "$SKILL/scripts" && npm ci     # once, if node_modules is missing
node --version                    # must print v26.0.0
T="$(mktemp -d)/a4-init" && mkdir -p "$T" && cd "$T"
```

init-config writes `.gitignore` into `process.cwd()` — every invocation below runs from `$T`.
Expected-value greps are pinned to the YAML emission format probed this run on the frozen (A2)
init-config with yaml 2.9.0: top-level keys unindented, nested keys 2-space indented, list items
4-space `- ` prefixed, `pages:` emitted last.

**Acceptance checks** (every command from `$T` unless noted):

1. **Full piped JSON with the new fields → YAML contains them.** (One-line printf — no heredoc:
   an indented heredoc terminator pasted from this spec would hang the shell.)
   ```bash
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"port":4321,"annotate":false,"dedup":{"enabled":true,"threshold":0.01,"ignore_selectors":[".clock"],"collapse_mode":"drop","max_hold_ms":5000},"gif":{"fps":2}}' > "$T/answers.json"
   node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/.timelapse.yaml" < "$T/answers.json" > "$T/init-out.json"
   ```
   → exit 0; `grep -c '"ok":true' "$T/init-out.json"` → `1`. Then each of:
   ```bash
   grep -c '^annotate: false$' "$T/.timelapse.yaml"          # → 1
   grep -c '^  enabled: true$' "$T/.timelapse.yaml"          # → 1
   grep -c '^  threshold: 0.01$' "$T/.timelapse.yaml"        # → 1
   grep -c '^  collapse_mode: drop$' "$T/.timelapse.yaml"    # → 1
   grep -c '^  max_hold_ms: 5000$' "$T/.timelapse.yaml"      # → 1
   grep -c '^    - .clock$' "$T/.timelapse.yaml"             # → 1
   grep -c '^port: 4321$' "$T/.timelapse.yaml"               # → 1
   ```
   Deep-merged `gif` block complete despite partial input:
   ```bash
   sed -n '/^gif:/,/^[^ ]/p' "$T/.timelapse.yaml" | grep -c '^  fps: 2$'              # → 1
   sed -n '/^gif:/,/^[^ ]/p' "$T/.timelapse.yaml" | grep -c '^  width: 1200$'         # → 1
   sed -n '/^gif:/,/^[^ ]/p' "$T/.timelapse.yaml" | grep -c '^  hold_skipped_ms: 400$' # → 1
   ```
   `mp4.fps` retired from fresh output:
   ```bash
   sed -n '/^mp4:/,/^[^ ]/p' "$T/.timelapse.yaml" | grep -c 'fps'        # → 0 (pipeline exit 1)
   sed -n '/^mp4:/,/^[^ ]/p' "$T/.timelapse.yaml" | grep -c '^  crf: 22$' # → 1
   ```
2. **Partial dedup input → complete persisted block** (fails on the frozen (A2) code by construction
   — probed: it emits only `enabled: false`):
   ```bash
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"dedup":{"enabled":false}}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/partial.yaml"
   ```
   → exit 0; then each of:
   ```bash
   grep -c '^  enabled: false$' "$T/partial.yaml"            # → 1
   grep -c '^  threshold: 0.005$' "$T/partial.yaml"          # → 1
   grep -c '^  ignore_selectors: \[\]$' "$T/partial.yaml"    # → 1
   grep -c '^  collapse_mode: badge$' "$T/partial.yaml"      # → 1
   grep -c '^  max_hold_ms: 3000$' "$T/partial.yaml"         # → 1
   ```
3. **No stdin → defaults** (I5's answer path included: defaults are what an accept-everything
   interview persists):
   ```bash
   node "$SKILL/scripts/init-config.mjs" --out "$T/defaults.yaml"
   ```
   → exit 0; `grep -c '^annotate: true$' "$T/defaults.yaml"` → `1`;
   `grep -c '^  enabled: true$' "$T/defaults.yaml"` → `1`;
   `grep -c '^  threshold: 0.005$' "$T/defaults.yaml"` → `1`;
   `grep -c '^  collapse_mode: badge$' "$T/defaults.yaml"` → `1`;
   `grep -c '^  max_hold_ms: 3000$' "$T/defaults.yaml"` → `1`;
   `sed -n '/^gif:/,/^[^ ]/p' "$T/defaults.yaml" | grep -c '^  fps: 1.5$'` → `1`;
   `sed -n '/^mp4:/,/^[^ ]/p' "$T/defaults.yaml" | grep -c 'fps'` → `0`.
4. **Explicit `mp4.fps` passthrough (accepted but ignored, never defaulted):**
   ```bash
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"mp4":{"fps":24}}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/mp4in.yaml"
   ```
   → exit 0; `sed -n '/^mp4:/,/^[^ ]/p' "$T/mp4in.yaml" | grep -c '^  fps: 24$'` → `1`;
   `sed -n '/^mp4:/,/^[^ ]/p' "$T/mp4in.yaml" | grep -c '^  crf: 22$'` → `1`.
5. **Validation gate — three rejection shapes, verbatim load-config errors, exit 3, no file:**
   ```bash
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"dedup":{"threshold":5}}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/bad.yaml" 2> "$T/bad.err"; echo "rc=$?"
   ```
   → prints `rc=3`; `grep -c 'dedup.threshold must be a number between 0 and 1' "$T/bad.err"` → `1`;
   `test ! -f "$T/bad.yaml"` → exit 0.
   ```bash
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"dedup":{"treshold":0.01}}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/bad2.yaml" 2> "$T/bad2.err"; echo "rc=$?"
   ```
   → prints `rc=3`; `grep -c 'unknown dedup field: treshold' "$T/bad2.err"` → `1`;
   `test ! -f "$T/bad2.yaml"` → exit 0.
   ```bash
   printf '{"pages":[{"name":"home","path":"/"}]}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/bad3.yaml" 2> "$T/bad3.err"; echo "rc=$?"
   ```
   → prints `rc=3`; `grep -c 'requires wait_for selector' "$T/bad3.err"` → `1`;
   `test ! -f "$T/bad3.yaml"` → exit 0.
6. **Failed re-init never destroys an existing config:**
   ```bash
   cp "$T/.timelapse.yaml" "$T/keep.yaml"
   printf '{"pages":[{"name":"home","path":"/","wait_for":"body"}],"dedup":{"threshold":5}}' \
     | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/keep.yaml" 2>/dev/null; echo "rc=$?"
   ```
   → prints `rc=3`; `cmp "$T/keep.yaml" "$T/.timelapse.yaml"` → exit 0 (byte-identical).
7. **Malformed stdin JSON:**
   ```bash
   printf 'not json' | node "$SKILL/scripts/init-config.mjs" --stdin-json --out "$T/nj.yaml" 2> "$T/nj.err"; echo "rc=$?"
   ```
   → prints `rc=3` (frozen code exits 1 with a raw stack — probed);
   `grep -c 'invalid --stdin-json input' "$T/nj.err"` → `1`; `test ! -f "$T/nj.yaml"` → exit 0.
8. **`.gitignore` behavior survives the write-path reorder:**
   `grep -c '^\.timelapse/$' "$T/.gitignore"` → `1`;
   `grep -c '^\.timelapse-worktrees/$' "$T/.gitignore"` → `1`.
9. **Docs greps — SKILL.md** (each command, expected count):
   ```bash
   grep -c 'one question per option group' "$SKILL/SKILL.md"   # → 1
   grep -c 'never re-ask' "$SKILL/SKILL.md"                    # → ≥1
   grep -c 'stitch time' "$SKILL/SKILL.md"                     # → ≥1
   grep -c 'fixed 30 fps' "$SKILL/SKILL.md"                    # → ≥1
   grep -c 'boot_skipped_commits' "$SKILL/SKILL.md"            # → ≥1
   grep -c 'frames.json' "$SKILL/SKILL.md"                     # → ≥1
   grep -c 'stitch-frames' "$SKILL/SKILL.md"                   # → ≥1
   ```
10. **Docs greps — references:**
    ```bash
    grep -c '## Init interview' "$SKILL/references/config-schema.md"   # → 1
    grep -c 'accepted but ignored' "$SKILL/references/config-schema.md" # → ≥1
    grep -c 'dedup.enabled' "$SKILL/references/config-schema.md"        # → ≥2 (existing row + interview table)
    grep -c 'dedup.collapse_mode' "$SKILL/references/config-schema.md"  # → ≥2
    grep -c 'dedup.threshold' "$SKILL/references/config-schema.md"      # → ≥2
    grep -c 'dedup.max_hold_ms' "$SKILL/references/config-schema.md"    # → ≥2
    grep -c 'gif.fps' "$SKILL/references/config-schema.md"              # → ≥1
    grep -c 'never re-ask' "$SKILL/references/workflow.md"              # → ≥1
    grep -c 'collapse_mode' "$SKILL/references/workflow.md"             # → ≥1
    grep -c 'max_hold_ms' "$SKILL/references/workflow.md"               # → ≥1
    grep -c 'ignore_selectors' "$SKILL/references/workflow.md"          # → ≥1
    grep -c 'stdin-json' "$SKILL/references/workflow.md"                # → ≥1
    ```
11. **Blast radius.** From the repo root:
    `git -C /Users/rajdholakia/Documents/claude-skills diff --name-only item/a3-stitch-collapse...HEAD | sort`
    → exactly (plus nothing else):
    ```
    docs/orchestration/specs/A4-init-interview.md
    frontend-evolution-timelapse/SKILL.md
    frontend-evolution-timelapse/references/config-schema.md
    frontend-evolution-timelapse/references/workflow.md
    frontend-evolution-timelapse/scripts/init-config.mjs
    ```
    (`item/a3-stitch-collapse` = A3's HEAD branch per its spec Slice 1; if A3's PR recorded a
    different branch name, substitute that name — it is A4's base by stacked-PR rule.)
12. **Cleanup.** `rm -rf "$T" "$(dirname "$T")"`.

## 5. Edge cases

- **Empty history / zero relevant commits.** Init never reads git history (`detectDev` reads
  `package.json` only, `init-config.mjs:8-27` (A2)); the interview works in a repo with zero
  commits. Emptiness surfaces later at `list-commits`, unchanged by A4.
- **Single commit / first frame / all-duplicates run.** No interaction — A4 is interview + docs; the
  answers merely set the fields A2/A3 already handle for these shapes (a threshold answer of `1`
  produces the all-duplicates behavior A2's troubleshooting entry covers).
- **Resume mid-run.** `resume` never re-asks (R1). Re-running init with different answers mid-run:
  capture-relevant fields change `config_hash` and the resume gate refuses (config-schema Hashes,
  lines 106-112 (A2)); stitch-time knobs pass the gate by design and take effect on the next stitch.
  Both paths are documented per R4.
- **Missing binary (ffmpeg/chromium).** init-config needs neither (pure Node + the `yaml` dep) —
  the interview completes on a machine without them; preflight still blocks `run`
  (A2 spec R1/preflight). No new binary is introduced (I7).
- **Existing `.timelapse.yaml`.** SKILL.md instructs: interview only when absent or on explicit
  reconfigure. init-config itself still overwrites its `--out` target on SUCCESS (unchanged v1
  semantics); on validation FAILURE the temp-write leaves it untouched (R3, check 6).
- **Dedup answered "off".** Q5/Q6 skipped; the YAML still persists the complete dedup block with
  defaults (R2), so flipping `enabled` back on later is one YAML edit away — and this is exactly the
  I5 recovery answer (`dedup.enabled: false` ⇒ v1 behavior per A2 R8).
- **`dedup: null` in input JSON.** Treated as absent (deep-merge over `null` yields pure defaults);
  loadConfig accepts null the same way (`lib/load-config.mjs:101-105` (A2)).
- **Non-mapping `dedup` in input JSON.** Rejected at init with load-config's verbatim shape message,
  exit 3 (R2) — never emitted for the run to trip over.
- **Interview answers with wrong types (e.g. threshold as the string "0.01").** Caught by the R3
  validation gate with `validateDedup`'s message; the agent re-asks the single failing question and
  re-pipes — nothing was written.
- **Agent runtime without a structured question tool.** The interview is prose ("ask the user…"),
  not a tool contract; a runtime that can only emit plain text still satisfies it by asking in chat.
  init-config never prompts, so no TTY is required anywhere (R2 non-goal).
- **`timelapse.sh init` (no stdin path).** Still writes a pure-defaults config via detection
  (timelapse.mjs:212-222 (A2), untouched) — the fast path for "accept everything". Its unchecked
  child rc is a pre-existing seam, documented for the steward, out of blast radius.

## 6. Open choices

1. **`ignore_selectors` as an interview item.** Bound here: asked, folded into Q4's dedup group
   (default: none) — I4's text covers every new user-facing behavior and masking is one (A1 R4).
   Alternative a DELTA can pick: doc-only mention (the orchestrator's mandated minimum names only
   dedup/mode/threshold/pacing); dropping the follow-up costs one grep in check 10 and one table row.
2. **Explicit `mp4.fps` input disposition.** Bound here: passthrough when explicitly supplied
   (accepted-but-ignored, matching A3 §3 "field stays accepted"), never emitted from defaults.
   Alternative: strip always and print a deprecation note to stderr — cleaner files, but silently
   rewriting explicit user input from an agent-built JSON is a worse surprise than an inert field.
3. **Single compact prompt instead of one-question-per-group.** Bound here: NOT offered — the
   orchestrator's dispatch mandates "one question per option group, with these defaults
   pre-selected". Alternative a DELTA can pick: permit a single multi-option prompt listing every
   option with its default (fewer round-trips in chat-poor runtimes); would relax the check-9 phrase
   grep.
