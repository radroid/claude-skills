# A2 — Dedup engine: ffmpeg raster diff vs last-kept, `frames.json` decisions, duplicate-PNG discard, tree-hash boot-skip

Item: A2 (lane A, needs A1). Design: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`.
Invariants in force: I3 (last-kept comparison), I5 (v1 recoverable), I7 (dependency fence), I8 (explicit
staging); I2 is consumed (pristine pixels are what make hashing possible), I4 is satisfied by adding no
new config fields. Skill under change: `frontend-evolution-timelapse/`.

Predecessor contract: `docs/orchestration/specs/A1-pristine-capture.md`. Its `dedup.*` config field
names (A1 §3) and `frames.json` entry shape (A1 R5) are FROZEN — this spec consumes them verbatim.
A1 was planned one-ahead and is being implemented in parallel: anchors into `screenshot.mjs` /
`load-config.mjs` below describe the PRE-A1 tree; the executor reconciles against the merged A1 code
and its `## Execution notes` (e.g. the exact location of A1's frames.json upsert helper).

## 1. Goal

Detect visually-unchanged frames and stop paying for them: after each capture, decode the pristine PNG
to a tiny grayscale raster via ffmpeg, diff it against the last KEPT frame for that page (I3), record
`decision` / `diff_ratio` / `collapsed_into` into A1's `frames.json`, and delete duplicate PNGs. Add
the one sound capture-avoidance: when the `frontend_paths` subtree of a commit is byte-identical to a
commit already proven unchanged-or-baseline, skip its checkout/install/boot entirely.

### Non-goals

- No stitch changes: `stitch.mjs` is untouched; collapse modes, badges, hold scaling, index.html are
  A3. Between A2 and A3, discarded duplicates simply become short holds of the previous frame — the
  existing missing-frame path at `frontend-evolution-timelapse/scripts/stitch.mjs:40-42` (it matches
  PNGs by directory listing, `stitch.mjs:32-35`, and never reads `frames.json`), so runs stay
  assemblable.
- No new config fields, no init interview changes (A4). The per-pixel tolerance (±8/255) and raster
  size (64×40) are internal constants per A1 §3's note; boot-skip has no knob of its own — it is part
  of the engine gated by `dedup.enabled` (the design's decisions addendum enumerates the user options
  and boot-skip is not among them, so I4 requires no new question).
- No estimator update. `lib/estimate.mjs:54-67` still models one boot per commit; after A2 that is a
  conservative upper bound for dedup-enabled runs. A5's pacing report is the ground truth.
- No E2E proof run beyond the acceptance below (A5). Nothing in lane B.

## 2. Requirements

**R1 — Raster comparison signal.** A captured PNG is reduced to a 64×40 8-bit grayscale raster
(2560 bytes) by system ffmpeg — no image libraries (I7). Canonical decode (verified on this machine,
ffmpeg 8.1.1: output is exactly 2560 bytes):

```
ffmpeg -v error -i <png> -vf "scale=64:40:flags=area,format=gray" -f rawvideo -
```

Aspect is forced to 64×40 regardless of source dimensions (this also normalises variable-height
`full_page` captures). Two rasters are compared pixelwise: a pixel differs when its absolute byte
difference exceeds 8 (the design's ±8/255 anti-aliasing tolerance, strictly-greater comparison);
`diff_ratio` = differing pixels / 2560, a number in [0,1]. A frame is a duplicate of the baseline
iff `diff_ratio <= dedup.threshold` (A1 §3; default 0.005). One signature, to fix vocabulary:
`compareRasters(a, b) -> diffRatio` over two 2560-byte buffers.

ffmpeg failure modes: if spawning ffmpeg fails with ENOENT mid-run, abort the run — the error
propagates to exit 3 through the main catch (`scripts/timelapse.mjs:510-513`); preflight already
requires ffmpeg up front (`scripts/preflight.mjs:44`). If ffmpeg exits non-zero on a specific PNG or
emits ≠ 2560 bytes, that frame's decision is `skipped` (R3), the PNG is retained, the baseline is NOT
updated, and the failure is logged loudly (stderr plus a line in `skipped.log`,
`timelapse.mjs:436-439` appends there today) — a silently mis-decided frame would poison every later
comparison.

**R2 — Engine placement and state.** The engine lives in a new `scripts/lib/dedup.mjs` and is driven
from the run loop in `timelapse.mjs`, which is the only process that survives across commits
(`run-commit.mjs` is spawned per commit at `timelapse.mjs:401-421`, so cross-commit state cannot live
there). `screenshot.mjs` gets no A2 behavior changes; if A1's frames.json upsert helper landed inline
in `screenshot.mjs`, the executor may relocate it mechanically into a shared lib module so the engine
reuses it rather than duplicating it (note it in the PR body). Engine state, held in memory during a
run and re-derivable from disk on resume (R6):

- per page: index of the last KEPT frame and its raster (raster may be decoded lazily and cached —
  at most one decode per PNG per run);
- repo-level: the boot-skip baseline set `S`, a map from frontend-subtree hash to the most recent
  commit index carrying that hash (R5).

Decision processing runs inside the per-commit loop after the run-commit result is parsed
(`timelapse.mjs:423-428`) and before progress is written (`timelapse.mjs:454`). All engine activity is
gated on `dedup.enabled`; when false the engine is fully inert (R8).

**R3 — Decisions written into `frames.json`.** For every entry the capture just upserted (one per
configured page per A1 R5; run-commit status ok implies every page has an entry), the engine writes
the reserved fields. The complete entry-state table — this is the contract A3 consumes; do not rename
or remap downstream:

| `decision` | `capture` | `file` | `diff_ratio` | `collapsed_into` | meaning |
|---|---|---|---|---|---|
| `kept` | `ok` | PNG filename | number, or null for the first kept frame of a page | null | new visual frame; becomes the page baseline |
| `duplicate` | `ok` | null (PNG discarded, R4) | number `<= dedup.threshold` | index of the page's last kept frame | captured, provably unchanged |
| `duplicate` | key ABSENT | null (never captured) | null | index of the page's last kept frame | tree-hash boot-skip (R5): provably identical render, no capture attempted |
| `skipped` | `no_route` or `fail` (or `ok` with an undecodable PNG, R1) | per A1 (null for no_route/fail; filename retained for the undecodable case) | null | index of the page's last kept frame, or null if none yet | no comparable frame; visuals unknown |

Rules: the first capture-ok frame of a page is always `kept` (nothing to compare; `diff_ratio` null).
Comparison is only ever against the page's last KEPT raster (I3) — never the previous commit's frame.
The baseline advances only on `kept`. Decisions are written for every capture-ok entry regardless of
the commit-level run-commit status (a commit that failed on one page still gets real decisions on its
ok pages — coherent because hole-resume is refused, R7). Writes go through the same atomic
upsert-by-index (temp-file-plus-rename) contract as A1 R5 / `writeProgress`
(`timelapse.mjs:94-98`). Two writers exist (capture script for A1 fields, engine for decision fields
and boot-skip entries) but never concurrently — engine writes happen only between run-commit
invocations. When `dedup.enabled` is false, entries carry only A1 fields — no `decision`,
`diff_ratio`, or `collapsed_into` keys at all (I5).

On `file` for discarded duplicates: it is set to null in the same upsert that writes
`decision: "duplicate"`. Nothing is lost — A1 R3 made filenames deterministic (zero-padded index +
7-char short hash), so the discarded name is reconstructible, and A3 must resolve the displayed frame
via `collapsed_into`, never via a duplicate's `file`.

**R4 — Duplicate-PNG discard.** Order per duplicate: compute diff → write the decision upsert →
delete the PNG. A crash between write and delete leaves a lingering PNG for an entry already marked
duplicate; the resume seeder (R6) deletes such lingering PNGs, and in the interim the v1 stitch would
merely show the frame once (benign — exactly what v1 did). Kept PNGs are never deleted. The
`000_placeholder.png` (`scripts/screenshot.mjs:104-119`, not a commit, no frames.json entry per A1
R5) is never diffed, decided on, or deleted.

**R5 — Tree-hash boot-skip.** The frontend-subtree hash of commit `c`, `T(c)`, is computed in the
target repo without any checkout: `git ls-tree -r <hash>` (the object store is shared with the
worktree), keep lines whose path matches any `frontend_paths` glob using minimatch with `dot: true` —
identical semantics to relevance filtering at `scripts/list-commits.mjs:35-37` and an existing
dependency (`scripts/package.json:6`) — and SHA-256 the kept `<objectname> <path>` lines in ls-tree's
path order. One signature: `frontendTreeHash(repoRoot, commitHash, patterns) -> hex string`.
Identical hash ⇔ identical frontend file contents ⇒ identical render (modulo genuinely dynamic
content, which is the same caveat the design accepts and `dedup.ignore_selectors` mitigates).

Maintenance of the baseline set `S` (sound by construction — every member's frames are known to be
pixel-identical-or-duplicate relative to CURRENT page baselines):

1. When any page of a commit is `kept`, clear `S` (older proofs referenced superseded baselines).
2. When a commit's run-commit status is `ok` (`run-commit.mjs:203-207` — every page ok or no_route),
   add `T(c) → c.index`. Failed/skipped commits (status `fail`/`skip`/`project_root_absent`) are
   never added: a twin of a failed commit must be retried, not skipped.
3. Boot-skipped commits add nothing (their hash is already a member).

Skip check, immediately before the run-commit spawn (`timelapse.mjs:401`): if `dedup.enabled` and
`S` contains `T(c)` with matched member `q`, do not spawn run-commit at all — no checkout, no
install, no boot, no screenshot. Instead write one frames.json entry per configured page with
`index`/`hash`/`subject`/`date` from the commit plan (`scripts/list-commits.mjs:95-99`), `file` null,
NO `capture` key (no attempt occurred; A1's `capture` enum is frozen and must not gain values),
`diff_ratio` null, and decision mirroring `q`'s comparability on that page: `duplicate` (with
`collapsed_into` = the page's current last-kept index) when `q`'s entry for the page has decision
`kept` or `duplicate`; otherwise `skipped` (with `collapsed_into` = last-kept index or null). The
first plan commit can never skip (`S` starts empty).

**R6 — Resume: seeding and hygiene.** On `resume` (config/plan gate unchanged, A1 R7 already put
`dedup.enabled`/`threshold`/`ignore_selectors` in the hash — `timelapse.mjs:343-346` refuses on
change), before the loop:

- **Hole gate.** Compute done-ness per plan commit from `progress.json`
  (`timelapse.mjs:449-453` marks done for `ok`/`project_root_absent`; A2 additionally marks
  boot-skipped commits done, R7). If any not-done commit precedes a done commit (a hole — e.g. one
  flaky commit failed mid-run and later commits succeeded), refuse the resume with exit 3 and a
  message naming the hole commit hashes and the remedies (`--fresh`; or `dedup.enabled: false` plus
  `--fresh` for v1 behavior). Recapturing into the middle of a decided sequence cannot be replayed
  against discarded duplicates; see Open choice 1 for the permissive alternative. Tail resumes —
  the common crash/interrupt shape, a contiguous not-done suffix — proceed.
- **Hygiene.** Delete frames.json entries (and any PNGs they name) belonging to not-done commits;
  they are from a partial pass and will be rewritten on recapture. Also delete lingering PNGs of
  entries marked duplicate (R4 crash window).
- **Seeding.** Per page: last-kept = the highest-index entry with decision `kept`; its PNG must
  exist on disk or the run aborts (exit 3) naming the missing file and instructing `--fresh` — a
  silently absent baseline would poison every later comparison. Rebuild `S` from done commits: let
  `K` = the highest commit index at which any page was kept (if none, start of plan); `S` = tree
  hashes of the commit at `K` and of every later done commit that was actually captured
  (distinguishable in frames.json: captured entries carry a `capture` key, boot-skip entries do
  not). `project_root_absent` commits contribute nothing. Missing `frames.json` reads as an empty
  array (A1 R5).

Resuming an already-complete run is a no-op for the engine: all commits done, no captures, frames.json
byte-identical afterward.

**R7 — Run bookkeeping.** For a boot-skipped commit the loop: emits the standard summary line via the
existing shape (`timelapse.mjs:100-108`) with `status=boot_skip` and ~0 duration; pushes a manifest
entry `{...commit, status: "boot_skip"}` (`timelapse.mjs:448`); marks
`progress.commits[hash] = {done: true, boot_skip: true, pages: {}}` so `findLatestIncompleteRun`
(`timelapse.mjs:75-92`) and the resume loop (`timelapse.mjs:399`) treat it as complete; does NOT
increment the `skipped` counter (exit-code semantics unchanged, `timelapse.mjs:505` — boot-skip is a
success) and does not write to `skipped.log`. `render-index.mjs:36` filters skipped entries by
`status === 'skip'`, so boot-skips correctly stay out of the "Skipped commits" block. `cost.json`
(`timelapse.mjs:470-490`) gains a `dedup` object, present only when `dedup.enabled`:
`kept_frames`, `duplicate_frames`, `skipped_frames` (counts of frames.json decisions across all
pages), `boot_skipped_commits`, `discarded_pngs`. cost.json/progress/manifest are internal v1 files,
not part of the frozen A1 contract.

**R8 — I5 disabled path.** `dedup.enabled: false` ⇒ no tree hashing, no boot-skip, no decode, no
decisions, no discards, no `dedup` block in cost.json. Every commit boots and every captured PNG
stays on disk; frames.json carries A1 fields only. Combined with A1 (pristine capture) and A3
(stitch-time re-annotation), this is the v1-recoverable path.

**R9 — Reference docs (minimal; A4 owns the overhaul).**
- `references/config-schema.md`: in the `dedup` section A1 R8 adds, extend the `threshold` row to
  state the signal (64×40 grayscale raster via ffmpeg, ±8/255 pixel tolerance, duplicate iff
  diff ratio ≤ threshold, compared against the last kept frame) and the `enabled` row to mention the
  tree-hash boot-skip.
- `references/workflow.md`: the per-commit loop (`workflow.md:67-81`) gains the boot-skip pre-step
  and a dedup-decision step after capture; the stitch section (`workflow.md:83-91`) gains one
  interim note that duplicate PNGs are discarded and appear as holds until A3.
- `references/troubleshooting.md`: add two entries — "almost everything collapses into one frame"
  (threshold too high or `ignore_selectors` masking real content; inspect `diff_ratio` values in
  `page-*/frames.json`) and "resume refused: dedup cannot replay a mid-run gap" (the R6 hole gate;
  remedies as in the error message).
- `SKILL.md:123`: delete the "Perceptual dedup of identical frames" out-of-scope bullet — it becomes
  false the moment this lands (A1 explicitly left it "true until A2 lands the engine"). No other
  SKILL.md edits (A4 rewrites it).

## 3. Config/schema changes

**None.** A2 adds no config fields and asks no questions (I4 satisfied vacuously). It consumes, with
A1 §3's exact frozen names: `dedup.enabled` (boolean, default true), `dedup.threshold` (number 0–1,
default 0.005), and reads nothing else from the `dedup` block (`ignore_selectors` acts at capture
per A1 R4; `collapse_mode`/`max_hold_ms` are A3's). Internal constants, deliberately not config:
raster 64×40, pixel tolerance 8/255.

`frames.json` field updates: A2 writes exactly the three reserved fields from A1 R5 — `decision`,
`diff_ratio`, `collapsed_into` — with the state table in R3, plus the two side effects: `file` set to
null on discard, and whole entries (without a `capture` key) appended for boot-skipped commits. No
field is renamed; the `capture` enum is not extended.

## 4. Slices

### Slice 1 (the whole item — one PR)

Engine module + loop integration + decisions + discard + boot-skip + resume gate/seeding + cost
counters + doc rows. Files touched: `scripts/timelapse.mjs`, new `scripts/lib/dedup.mjs`,
`references/config-schema.md`, `references/workflow.md`, `references/troubleshooting.md`, `SKILL.md`
(one bullet), all under `/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse/`.
Plus, only if A1 left its frames.json upsert helper inline in `screenshot.mjs`: a mechanical
relocation into a lib module (no behavior change; note in PR body). `stitch.mjs`, `run-commit.mjs`,
`list-commits.mjs`, `init-config.mjs`, `lib/load-config.mjs`, `lib/config-hash.mjs`,
`lib/estimate.mjs` need no edits. `scripts/package.json` gains no dependencies (I7).

**Acceptance setup** (executor runs all of this):

- `SKILL=/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse`;
  `KAYVEE="/Users/rajdholakia/Documents/1-startups/💎 Stella 56/kayvee-website"` (quote — emoji and
  spaces).
- Bootstrap once if needed: in `$SKILL/scripts`, `npm ci` then `npx playwright install chromium`.
- `ffmpeg -version`, `jq --version`, `python3 --version` all exit 0 (verified present on this
  machine: ffmpeg 8.1.1, jq 1.6, Python 3.12.4). `lsof -ti :4189` prints nothing (port free;
  otherwise substitute a free port consistently below).
- I8 applies throughout: only explicit-path `git add` in the fixture; NO git operations in kayvee.

**Fixture** — a hermetic 5-commit repo that deterministically exercises kept / diff-duplicate /
boot-skip / S-reset / revert-as-visual-change:

```bash
FIX="$(mktemp -d)/a2-fixture" && mkdir -p "$FIX" && cd "$FIX"
git init -q
git config user.email a2@test.local && git config user.name a2-fixture
printf '<html><body style="background:#fff"><h1>v1</h1></body></html>\n' > index.html
printf '{"name":"a2-fixture","private":true}\n' > package.json
git add index.html package.json && git commit -qm C1
printf '<!-- no visual change -->\n' >> index.html
git add index.html && git commit -qm C2
git revert -n HEAD && git commit -qm C3-revert-C2
printf '<html><body style="background:#000"><h1 style="color:#fff">v2</h1></body></html>\n' > index.html
git add index.html && git commit -qm C4
git revert -n HEAD && git commit -qm C5-revert-C4
touch .env
cat > .timelapse.yaml <<'YAML'
pages:
  - name: home
    path: /
    wait_for: "body"
port: 4189
dev: "python3 -u -m http.server 4189 --bind 127.0.0.1"
ready: { url: "http://localhost:4189", timeout_ms: 12000 }
install: "true"
frontend_paths: ["index.html"]
settle_ms: 100
YAML
```

Notes: `.timelapse.yaml` and `.env` stay untracked (they never enter tree hashes; `loadConfig` reads
the checkout, not the worktree, `scripts/lib/load-config.mjs:47-52`; preflight requires an env file
to exist, `preflight.mjs:98-111`). `install: "true"` short-circuits dependency install
(`lib/install-matrix.mjs:113-117`). The python server never matches the dev-log port regexes
(`lib/port-owner.mjs:105-108`), so each boot waits min(30000, 12000/4) = 3s then HTTP-polls — total
run well under two minutes. Tree facts: T(C3) = T(C1) (revert), T(C5) = T(C3) = T(C1); `dedup`
defaults apply (enabled true, threshold 0.005 — the frozen A1 defaults are themselves under test).

**Acceptance checks** (exact commands, expected outcomes; `P="$FIX/.timelapse/a2-fixture/page-home"`):

1. Dedup run: from `$FIX`,
   `"$SKILL/scripts/timelapse.sh" run --i-trust-this-repo --run-id a2-fixture` → exit 0.
   Expected shape: C1 kept (first frame), C2 captured duplicate (comment-only change), C3
   boot-skipped (T∈S={T1,T2}), C4 kept (S reset to {T4}), C5 kept — NOT boot-skipped despite
   T(C5)=T(C1), because S was reset; the revert is a real visual change and must be a frame.
2. frames.json decisions:
   ```bash
   jq -e 'length == 5 and (map(.index) == [1,2,3,4,5])
     and (.[0].decision == "kept" and .[0].capture == "ok" and .[0].diff_ratio == null
          and .[0].collapsed_into == null and (.[0].file | test("^001_[0-9a-f]{7}\\.png$")))
     and (.[1].decision == "duplicate" and .[1].capture == "ok" and .[1].file == null
          and (.[1].diff_ratio | type == "number") and .[1].diff_ratio <= 0.005
          and .[1].collapsed_into == 1)
     and (.[2].decision == "duplicate" and (.[2] | has("capture") | not) and .[2].file == null
          and .[2].diff_ratio == null and .[2].collapsed_into == 1)
     and (.[3].decision == "kept" and .[3].capture == "ok"
          and (.[3].diff_ratio | type == "number") and .[3].diff_ratio > 0.005
          and .[3].collapsed_into == null and (.[3].file | test("^004_[0-9a-f]{7}\\.png$")))
     and (.[4].decision == "kept" and .[4].capture == "ok"
          and (.[4].diff_ratio | type == "number") and .[4].diff_ratio > 0.005
          and .[4].collapsed_into == null and (.[4].file | test("^005_[0-9a-f]{7}\\.png$")))' \
     "$P/frames.json"
   ```
   → exit 0.
3. Discard on disk: `ls "$P"/*.png | wc -l` → 4 (placeholder + 001 + 004 + 005; the 002 duplicate
   PNG is gone, 003 never existed).
4. Bookkeeping:
   `jq -e '.entries[2].status == "boot_skip" and .skipped_count == 0' "$FIX/.timelapse/a2-fixture/manifest.json"` → exit 0;
   `jq -e '(.commits | length) == 5 and ([.commits[] | .done] | all)' "$FIX/.timelapse/a2-fixture/progress.json"` → exit 0;
   `jq -e '.dedup.kept_frames == 3 and .dedup.duplicate_frames == 2 and .dedup.skipped_frames == 0 and .dedup.boot_skipped_commits == 1 and .dedup.discarded_pngs == 1' "$FIX/.timelapse/a2-fixture/cost.json"` → exit 0.
5. Interim stitch still works: `ls "$P/home.gif" "$P/home.mp4"` → both exist.
6. Resume no-op on complete run: `cp "$P/frames.json" "$FIX/frames.before"`; from `$FIX`,
   `"$SKILL/scripts/timelapse.sh" resume --run-id a2-fixture --i-trust-this-repo` → exit 0
   (all commits done, including the boot-skipped one — this is what R7's done-marking buys);
   `cmp "$FIX/frames.before" "$P/frames.json"` → exit 0 (byte-identical, no decision churn).
7. I5 disabled path: `printf 'dedup:\n  enabled: false\n' >> "$FIX/.timelapse.yaml"`; from `$FIX`,
   `"$SKILL/scripts/timelapse.sh" run --i-trust-this-repo --run-id a2-v1` → exit 0 (5 boots — C3 is
   NOT skipped). Then:
   ```bash
   jq -e 'length == 5
     and all(.[]; ((has("decision") or has("diff_ratio") or has("collapsed_into")) | not))
     and all(.[]; .capture == "ok" and (.file | type == "string"))' \
     "$FIX/.timelapse/a2-v1/page-home/frames.json"
   ```
   → exit 0; `ls "$FIX/.timelapse/a2-v1/page-home/"*.png | wc -l` → 6 (nothing discarded);
   `jq -e 'has("dedup") | not' "$FIX/.timelapse/a2-v1/cost.json"` → exit 0.
8. Real-app smoke (kayvee, defaults — its committed `.timelapse.yaml` predates dedup, so A1's
   deep-merged defaults govern; no YAML edit): from `$KAYVEE`,
   `"$SKILL/scripts/timelapse.sh" run --max-commits 2 --i-trust-this-repo --run-id a2-smoke`
   → exit 0 (2 tolerated only if a commit legitimately skips; then adjust below). Then:
   ```bash
   jq -e 'length == 2
     and all(.[]; .decision == "kept" or .decision == "duplicate" or .decision == "skipped")
     and (.[0].decision == "kept" and .[0].diff_ratio == null)
     and ((.[1].decision == "kept" and (.[1].file | type == "string") and (.[1].diff_ratio | type == "number"))
          or (.[1].decision == "duplicate" and .[1].file == null and .[1].collapsed_into == 1))' \
     "$KAYVEE/.timelapse/a2-smoke/page-home/frames.json"
   ```
   → exit 0 (which branch entry 2 takes is content-dependent; both are valid). `page-story-1`'s
   frames.json must exist, parse, and have a `decision` on every entry.
9. Dependency fence + docs:
   `jq -r '.dependencies | keys | join(",")' "$SKILL/scripts/package.json"` → exactly
   `minimatch,playwright,yaml`;
   `grep -n 'boot' "$SKILL/references/workflow.md"` → at least one boot-skip line;
   `grep -n '64' "$SKILL/references/config-schema.md"` → the raster recipe row;
   `grep -cn -e 'diff_ratio' -e 'resume refused' "$SKILL/references/troubleshooting.md"` → ≥ 1 each of
   the two new entries;
   `grep -n 'Perceptual dedup' "$SKILL/SKILL.md"` → no output (exit 1).
10. Cleanup: `rm -rf "$FIX" "$(dirname "$FIX")"` (removes the fixture and its sibling
    `.timelapse-worktrees`); `rm -rf "$KAYVEE/.timelapse/a2-smoke"`; nothing else in kayvee modified.

## 5. Edge cases

- **Empty history / zero relevant commits.** Empty plan, the loop never runs (`timelapse.mjs:397`),
  the engine is never invoked; no `frames.json` (missing file reads as empty array per A1 R5).
- **Single commit.** First ok capture per page → `kept`, `diff_ratio` null; `S` = {T(c)}; nothing
  discarded, nothing skipped.
- **First frame.** Always kept, never compared (R3); it is a MASKED frame when `ignore_selectors`
  is set (A1 R4 applies from frame one), so the baseline and later frames are consistently masked.
- **All-duplicates run.** One kept frame, N−1 duplicates, N−1 PNGs discarded; interim stitch emits
  first frame + holds; exit 0.
- **Boot-skip candidate as first plan commit.** Impossible — `S` starts empty (R5).
- **Resume mid-run (tail).** Contiguous not-done suffix: hygiene removes partial-pass entries/PNGs,
  seeding rebuilds baselines and `S` from done commits (R6), loop continues. Changing any
  dedup-relevant field between runs is refused by the config-hash gate (A1 R7,
  `timelapse.mjs:343-346`).
- **Resume with a hole.** Refused loudly with remedies (R6); the permissive variant is Open
  choice 1. This also covers the v1 pattern "one commit failed install, later ones succeeded, retry
  via resume" — with dedup on, that retry cannot be replayed safely once duplicates are discarded.
- **Resume of a complete run.** Engine no-op; frames.json byte-identical (acceptance check 6).
- **Kept-baseline PNG missing at seed time.** Fatal exit 3 naming the file, instructing `--fresh`
  (R6) — never silently rebase comparisons.
- **Missing ffmpeg.** Preflight blocks the run up front (`preflight.mjs:44`); vanishing mid-run →
  ENOENT → exit 3 (R1).
- **Missing chromium.** run-commit fails before any page attempt (browser launch,
  `screenshot.mjs:152`; catch path `run-commit.mjs:219-238`) → no entries, commit not done, `S`
  unchanged — identical to A1's edge, engine indifferent.
- **Undecodable PNG (ffmpeg non-zero / wrong byte count).** Decision `skipped`, PNG retained,
  baseline unchanged, loud log (R1).
- **`no_route` page appearing mid-history.** Entries before first render: `skipped`,
  `collapsed_into` null; the first ok capture becomes `kept`.
- **Commit with one failed page.** Ok pages get real decisions and may advance their baselines
  (coherent within the run); the commit is not done, so any later resume hits the hole gate rather
  than replaying against a possibly-different recapture.
- **`project_root_absent` commits.** Done but never captured and never in `S` (R5); no entries;
  boot-skip mirror can never select them.
- **`full_page: true` with varying page heights.** Both rasters are force-scaled to 64×40 (R1);
  large layout growth reads as change, as it should.
- **Threshold boundaries.** `threshold: 0` collapses only within-tolerance-identical frames;
  `threshold: 1` collapses every comparable frame after the first (valid per A1 R6 validation;
  useful for testing, pathological for real runs — the troubleshooting entry covers it).
- **Lingering duplicate PNG after a crash.** Deleted by resume hygiene; harmless to interim stitch
  meanwhile (R4).
- **Merge commits.** `T(c)` hashes the commit's tree, not its diff — merges behave identically to
  ordinary commits; a no-op merge (tree identical to a baseline member) boot-skips, which is half
  the point (design: "catches reverts and no-op merges only").

## 6. Open choices

1. **Hole-resume policy.** Bound here: REFUSE (R6) — simple, zero wrong-output risk, and the
   overnight kayvee proof uses fresh runs anyway. Alternative a DELTA can pick: permissive
   hole-resume — recapture the hole commit, diff each ok page against the last kept entry BELOW its
   index; if duplicate, record and discard (sound — later decisions are unaffected); only if it
   would be KEPT, abort with exit 3 and a `--fresh` message (inserting a new visual frame would
   invalidate later already-discarded duplicates). Costs more logic in the seeder and a mid-run
   abort path; preserves v1's retry-a-flaky-commit convenience.
2. **Decision value for boot-skipped commits.** Bound here: `duplicate` with the `capture` key
   absent (R3, R5) — truthful ("render necessarily identical", design §boot-skip) and it keeps
   `skipped` meaning exactly "no comparable frame", so A3's "×N no visual change" badge counts
   `duplicate` entries and nothing else. Alternative reading of the design's `kept | duplicate |
   skipped` line: mark boot-skips `skipped`; then A3 must distinguish provably-unchanged skips from
   unknown-visual skips by some other means before it can badge honestly. If a DELTA flips this, it
   must land before A3's spec freezes against R3's table.

## Execution notes (PR #TBD)

- **Upsert helper relocated** (spec R2 allowance): A1 left `upsertFrameEntry` inline in
  `screenshot.mjs`; it moved mechanically into new `scripts/lib/frames.mjs`, split into
  `readFrames`/`writeFrames`/`upsertFrameEntry` so the engine shares the same atomic
  read/write path. No behavior change; `screenshot.mjs` now imports it.
- **`git ls-tree -r -z`** (NUL-delimited) instead of bare `-r`: `core.quotePath` C-quotes
  non-ASCII paths in line mode, which would feed quoted paths to minimatch. The hash is
  still SHA-256 over reconstructed `<objectname> <path>` lines in ls-tree path order.
- **Deltas applied, all verified live**: (1) both placeholders-only spawn sites
  (`calibrateHead` and the main run path) now abort exit 3 on non-zero child exit with the
  child's stderr surfaced — tested with an invalid selector: stderr shows
  `invalid ignore_selectors entry: :::bad` then `placeholder capture failed (exit 3)`;
  (2) `Execution context was destroyed` added to screenshot.mjs's transient-retry list;
  (3) boot-skips record `duplicate` with the `capture` key ABSENT; (4) hole-resume REFUSED —
  tested by punching a hole in progress.json: exit 3 naming the hole commit + both remedies.
- **Undecodable seeded baseline aborts** (exit 3, `--fresh` message): R1's skipped-decision
  path covers only the newly captured frame. A resume-seeded baseline PNG that exists but
  fails to decode would otherwise silently poison every later comparison, so it gets the
  same fatal treatment as a missing baseline. Missing-baseline abort also verified live.
- **cost.json dedup counters are whole-run truth**, computed at run end from frames.json
  decisions plus progress `boot_skip` flags (not per-pass increments), so a resumed run
  reports correct totals. `discarded_pngs` = duplicate entries carrying a `capture` key.
- **For A3**: boot-skip entries carry `index`/`hash`/`subject`/`date`/`file: null`/
  `decision`/`diff_ratio: null`/`collapsed_into` and no `capture` key. Resolve displayed
  frames via `collapsed_into`, never via a duplicate's `file` (always null).
- **Acceptance**: checks 1–10 all pass. Fixture run shape exact (C1 kept, C2 captured
  duplicate, C3 boot-skipped, C4 kept + S reset, C5 re-booted and kept). Kayvee smoke:
  entry 2 was the `duplicate` branch on both pages (home `diff_ratio` 0.0015625, story-1
  0) — the real-app discard path was exercised. Kayvee repo left byte-identical
  (`git status --porcelain` diff empty before/after; run dir removed).
