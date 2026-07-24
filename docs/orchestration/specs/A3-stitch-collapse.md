# A3 — Stitch-time annotation + collapse modes (`badge` / `drop` / `speedthrough`), hold scaling, index.html

Item: A3 (lane A, needs A2). Design: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`
(incl. the "Decisions — 2026-07-13" addendum). Invariants in force: I2 (pristine pixels — consumed:
annotation happens ONLY here), I4 (no new fields asked; A4 owns questions), I5 (v1 recoverable —
this item completes the recovery story), I7 (dependency fence), I8 (explicit staging). Skill under
change: `frontend-evolution-timelapse/`.

Predecessor contracts — SPECS plus a live branch, not merged code:

- A1 is APPROVED on branch `item/a1-pristine-capture` (unmerged). Anchors below marked **(A1)** were
  verified against `origin/item/a1-pristine-capture` this run. Its `frames.json` shape is FROZEN:
  upsert-by-index, sorted, atomic writes (`screenshot.mjs:70-88` (A1)); entry fields
  `index`/`hash`/`subject`/`date`/`file`/`capture` (+`error` on fail) (`screenshot.mjs:248-257` (A1)).
- A2 is EXECUTING on branch `item/a2-dedup-engine` (spec: `docs/orchestration/specs/A2-dedup-engine.md`).
  Its frozen bindings, consumed verbatim: the decision-state table (A2 spec R3, lines 84-105) —
  `kept | duplicate | skipped` with `diff_ratio`/`collapsed_into`; boot-skipped commits are
  `duplicate` with the `capture` key ABSENT (A2 R5); duplicate PNGs are DISCARDED after hashing
  (A2 R4) — stitch must never expect a duplicate's PNG on disk; collapse math comes from
  `frames.json`, never the filesystem, and a duplicate's displayed frame resolves via
  `collapsed_into`, never via its `file` (A2 R3 note, lines 102-105).
- **STACKED-PR MODE** (backlog lines 37-45): the A3 branch is cut from `item/a2-dedup-engine` HEAD
  and its PR targets that branch. Anchors into `stitch.mjs`/`render-index.mjs` reference the
  `change-aware-timelapse` tree (A1/A2 do not touch those files; A1 spec Non-goals, A2 spec Non-goals
  lines 24-28). Anchors into `timelapse.mjs` reference the pre-A2 tree — the executor reconciles line
  drift against A2's landed code and its `## Execution notes`.
- **DELTA (binding, backlog lines 31-33):** `frames.json` `fail` entries carry multi-line Playwright
  stacks in `error`; A3 trims to the FIRST LINE wherever it renders that text.

## 1. Goal

Move annotation from capture to stitch: burn `short-hash | date | subject` (plus the "×N commits ·
no visual change" badge) into frames while assembling GIF/MP4, and implement the three collapse
modes — `badge` (default), `drop`, `speedthrough` — driven by `dedup.collapse_mode`, with badge-mode
hold durations scaling mildly with collapse count capped by `dedup.max_hold_ms`. `annotate: false`
keeps producing completely bare frames. The now capture-inert `annotate` flag is re-bound coherently
(stitch-time semantics; dropped from the resume hash).

### Non-goals

- No capture or dedup-engine changes: `screenshot.mjs`, `run-commit.mjs`, `list-commits.mjs`,
  `lib/dedup.mjs` (A2's), `lib/load-config.mjs` untouched. No new config fields, no init interview
  (A4), no SKILL.md rewrite (A4), no E2E pacing proof (A5 — though R6 makes stitch emit the two
  numbers A5's report needs).
- No new dependencies (I7): system ffmpeg + the existing `playwright`/`minimatch`/`yaml` deps
  (`scripts/package.json:5-9`) only. **Probed this run: the installed ffmpeg 8.1.1 (homebrew,
  `ffmpeg -version`) has NO `drawtext` filter — no libfreetype/fontconfig/harfbuzz in its build
  config; `ffmpeg -filters` lists `overlay`/`drawbox` but no `drawtext`.** Text is therefore
  rendered by the already-shipped Playwright Chromium and composited with ffmpeg `overlay` (R3).
  Any reference to `drawtext` in the implementation is a defect.
- Nothing in lane B.

## 2. Requirements

**R1 — Timeline construction (per page).** `stitch.mjs` currently matches PNGs by directory listing
and filename prefix against `commits.json` (`stitch.mjs:29-48`), holds the previous PNG or
`000_placeholder.png` for missing frames (`stitch.mjs:40-47`), and emits a concat file
(`stitch.mjs:59-60`) with the final file line duplicated (ffmpeg concat quirk, `stitch.mjs:56-57`).
After A3, the per-page source of truth is `frames.json` joined against `commits.json` order:

For each commit in `commits.json` (fields `index`/`hash`/`subject`/`date`, `list-commits.mjs:95-99`),
look up the page's `frames.json` entry by `index` (missing file ⇒ empty array, A1 R5):

- **`decision: "kept"`** → a display slot showing the entry's `file` PNG; its duration per R2. The
  kept PNG missing on disk is a per-page `fail` (status `fail`, stage `stitch`, error naming the
  file) — never silently substituted.
- **`decision: "duplicate"`** (both variants — captured with `capture: "ok"`, and boot-skip with no
  `capture` key) → collapsed into the kept frame at `collapsed_into`. In `badge` mode it contributes
  to that kept frame's collapse count N; in `drop` mode it contributes nothing; in `speedthrough`
  mode it becomes a fast slot displaying the `collapsed_into` kept frame's PNG (pixel-identical by
  construction) with its OWN commit annotation (R3).
- **`decision: "skipped"`** → visuals unknown: repeat the previous slot's image for
  `gif.hold_skipped_ms` (default 400, `stitch.mjs:15`; `load-config.mjs:36` (A1)) — exactly v1's
  hold mechanics — in `badge` and `speedthrough`; contributes nothing in `drop`. Never counted
  into N, never annotated with its own banner (the repeated image keeps the annotation it already
  has — v1 behavior, where a held frame showed the old commit's bar).
- **Entry absent** (commit never reached the screenshot stage, A1 R5 absence semantics) → same
  treatment as `skipped`.
- **Entry without a `decision` field** (dedup-disabled runs write A1 fields only, A2 R3/R8) →
  `capture: "ok"` behaves as `kept` with N=0; anything else behaves as `skipped`. Stitch derives
  treatment from the ENTRY, not from `config.dedup.enabled` — a disabled-dedup run renders v1-like
  under every collapse mode automatically (I5).
- **No `frames.json` at all** (pre-A2 run dirs, `stitch-only` compatibility) → synthesize entries
  from `commits.json` plus the v1 filename matcher (index + 7-char short hash prefix,
  `stitch.mjs:32-35`; deterministic names per A1 R3, `screenshot.mjs:242-245` (A1)): matched PNG ⇒
  kept-with-N=0, unmatched ⇒ skipped. Annotation still works — banner text comes from
  `commits.json` fields.
- **Leading slots before the first displayable frame** → `000_placeholder.png` at
  `gif.hold_skipped_ms` each, exactly v1 (`stitch.mjs:43-47`); the placeholder is never annotated
  (not a commit, no entry — A1 R5). In `drop` mode leading non-kept commits produce no slots, so no
  placeholder padding either.

An empty timeline (zero slots) reproduces v1's `no_frames` result (`stitch.mjs:50-53`). The concat
file keeps v1 mechanics: absolute paths single-quoted, `duration` lines in seconds to 3 decimals,
final file line repeated without a duration (`stitch.mjs:37-57`).

**R2 — Pacing: hold formula and speedthrough multiplier.** All durations derive from
`base_ms = round(1000 / gif.fps)` (default fps 1.5 ⇒ 667ms) — `gif.fps` is v1's sole concat-duration
source for BOTH outputs already (`stitch.mjs:13,38`, used by the mp4 encode too via the shared
concat file at `stitch.mjs:65-88`); A3 keeps that and documents it.

- `badge` mode, kept frame with N collapsed duplicates:
  `hold_ms(N) = min(dedup.max_hold_ms, round(base_ms × (1 + log2(1 + N))))`, JS `Math.round`/
  `Math.log2`. N=0 ⇒ base_ms; N=1 ⇒ 2×base; N=3 ⇒ 3×base; N=7 ⇒ 4×base — "scales mildly, capped"
  per the design (design lines 85-88). The cap always wins, including when
  `dedup.max_hold_ms < base_ms` (validation only requires a positive integer,
  `load-config.mjs:85-86` (A1)). When N>0 and `annotate` is true, the badge row reads
  `×N commits · no visual change` (design lines 80-83).
- `drop` mode: every kept slot is exactly base_ms. Badge-free by definition (decisions addendum,
  design line 155).
- `speedthrough` mode: kept slots are base_ms; each duplicate becomes its own fast slot of
  `max(40, round(base_ms / 8))` ms — the fps multiplier is a fixed internal constant **8×**, and the
  40ms floor keeps GIF frame delays ≥ 4 centiseconds (the GIF container stores delays in cs; probed
  below). Defaults: 667/8 ⇒ 83ms per duplicate slot.
- `kept`-frame slots in `badge` mode use hold_ms(N); `skipped`/absent repeats use
  `gif.hold_skipped_ms` in all modes that emit them (R1).

`dedup.collapse_mode` / `dedup.max_hold_ms` are read from config at stitch time (stitch loads config
itself, `stitch.mjs:11`), so a pacing tweak plus `stitch-only` re-render needs no `--fresh` — the
A1-designed property (config-schema.md:110 (A1)).

**R3 — Annotation burn-in: Playwright banner + ffmpeg overlay.** Because the installed ffmpeg 8.1.1
has no `drawtext` (Non-goals), the annotation strip is rendered as a PNG by the Playwright Chromium
the skill already ships, then composited onto the frame with ffmpeg's `overlay` filter — both steps
probed working on this machine this run.

- Banner content, line 1 (always): `<7-char short hash> | <date first 10 chars> | <subject>` — the
  v1 overlay's text format (pre-A1 `screenshot.mjs:27-47` on `change-aware-timelapse`: bottom-fixed
  bar, `hash7 | date | subject`, `rgba` black, white 12px monospace) with the ISO date trimmed to
  `YYYY-MM-DD`. Line 2 (badge mode only, N>0): `×N commits · no visual change`.
- Banner geometry and style are fixed constants: width = the frame PNG's pixel width (probe each
  kept PNG once via `ffprobe -show_entries stream=width,height`; output format pinned in acceptance),
  height 40px without badge / 76px with (40px commit row on top + 36px badge row beneath), opaque
  `#111111` background, white/near-white monospace text (`ui-monospace, Menlo, monospace`, 12px),
  12px left padding, `nowrap` + ellipsis overflow. Opaque — no alpha compositing surprises.
- Rendering: ONE `chromium.launch` per stitch invocation (only when at least one banner is needed);
  reuse a single page, `setContent` + viewport-sized screenshot per banner — the placeholder
  renderer is the in-repo precedent for this exact pattern (`screenshot.mjs:161-177` (A1)).
  `deviceScaleFactor` 1. Subject/hash/date are HTML-escaped before templating (`&<>"'` — same
  character set as `render-index.mjs:20-27`).
- Composite: `ffmpeg -y -i <frame.png> -i <banner.png> -filter_complex "[0][1]overlay=x=0:y=main_h-overlay_h" <out.png>`
  — bottom-anchored, canvas size unchanged (probed: 1440×900 in ⇒ 1440×900 out). One invocation per
  needed composite.
- Workspace: `runDir/stitch-frames/page-<name>/` — deleted and recreated at the start of every
  stitch invocation; not created at all when nothing is annotated (so `annotate: false` leaves no
  `stitch-frames` dir). The name deliberately does not start with `page-` (the page scanner at
  `stitch.mjs:21-23` and A2's resume hygiene look only inside `page-*` dirs). Files:
  `<NNN>_annotated.png` composites (NNN = zero-padded commit index of the slot), banner
  intermediates may persist alongside.
- Which slots get composites when `annotate` is true: every kept slot (badge row iff badge mode and
  N>0); every speedthrough duplicate slot (its own commit's banner over the `collapsed_into` frame's
  PNG); placeholder and repeated-hold slots never (they reuse an existing image path). The concat
  file references composites for annotated slots and pristine PNGs otherwise.
- `annotate: false` (or the `--no-annotate` override, R5): zero banners, zero composites, concat
  references only `page-*/` PNGs (and the placeholder) — bare frames in ALL THREE collapse modes;
  collapse timing (R2) is unaffected. This is the task's (c) and the I5 story's final piece.
- Chromium launch failure while banners are needed (browser not installed): stitch prints the error
  to stderr — naming `npx playwright install chromium` — and exits 3. It must NOT silently emit
  unannotated videos.

**R4 — Encoder pipelines (probed on ffmpeg 8.1.1).** Both consume the per-page concat file.

- GIF: drop the `fps=` prefilter from the filtergraph (`stitch.mjs:110` today) — it resamples and
  would destroy variable holds and fast slots. New chain:
  `scale=<gif.width>:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`, `-loop 0`.
  Probed: concat durations 0.667/3.0/0.083/0.083 yield GIF frame pts 0 / 0.68 / 3.68 / 3.76 / 3.84 —
  variable delays survive, quantized to centiseconds.
- MP4: replace `-r <mp4.fps>` (`stitch.mjs:81-82`) with fixed `-r 30` (CFR). At the v1 default
  output rate of 1.5 fps, badge holds would quantize to a 667ms grid and speedthrough's 83ms slots
  would be dropped entirely. Probed at `-r 30`: the same concat file yields format duration 3.900s
  vs the 3.833s timeline sum (trailing-frame + grid rounding ≲ 70ms). Keep
  `-c:v libx264 -pix_fmt yuv420p -crf <mp4.crf>` and the `scale=<gif.width>:-2` sizing
  (`stitch.mjs:76,83-85`). `mp4.fps` becomes ignored at stitch — see §3 and Open choice 1.
- Per-page failure handling stays v1 (`stitch.mjs:89-97,117-125`): non-zero ffmpeg ⇒ result
  `{page, status: "fail", stage, error}`; stitch continues with other pages. stdout remains EXACTLY
  one JSON array (`stitch.mjs:138`) — the run flow parses it (`timelapse.mjs:462`); all logging goes
  to stderr.

**R5 — `annotate` re-bind, flag plumbing, hash drop.** The field stays (`load-config.mjs:27` (A1),
default `true`), semantics now: "burn commit annotation and collapse badges into stitched videos".

- Remove `'annotate'` from `HASH_FIELDS` (`config-hash.mjs:13` (A1)) — it no longer affects captured
  or kept pixels, exactly the rationale that excluded `collapse_mode`/`max_hold_ms`
  (`config-hash.mjs:23-25` (A1)); update that comment to name `annotate` too. Consequence: every
  pre-A3 incomplete run fails the resume gate (`timelapse.mjs:343-346`) and needs `--fresh`; the
  existing message already instructs this (same consequence pattern as A1 R7).
- `--no-annotate` (parsed at `timelapse.mjs:50`, applied at `timelapse.mjs:265`) currently has NO
  effect on stitch — stitch re-loads config from disk (`stitch.mjs:11`) and the flag never reaches
  it. A3: `stitch.mjs` accepts a `--no-annotate` argv flag overriding `config.annotate` for that
  invocation, and `timelapse.mjs` forwards it in BOTH spawn sites — the run flow
  (`timelapse.mjs:457-461`) and `stitch-only` (`timelapse.mjs:226-230`). `stitch.sh` stays a
  config-semantics entry point (positional run dir only, `stitch.sh:4`).
- `stitch-only` hardening while in that function (`timelapse.mjs:217-235`): capture stitch stdout
  (today `stdio: inherit`), on non-zero exit print stderr and exit 3 WITHOUT running render-index;
  on success refresh `manifest.json`'s `pages_summary` from the parsed results when a manifest
  exists, then run render-index — so a re-stitch is reflected in `index.html`. In the run flow,
  a non-zero stitch exit likewise surfaces stderr and exits 3 (today it would silently produce an
  empty `pages_summary` from the `|| '[]'` fallback at `timelapse.mjs:462`). This mirrors the
  rc-check DELTA already issued to A2 for the placeholders spawn (backlog lines 19-23; different
  lines — A2 owns `timelapse.mjs:366-373`, A3 touches 226-233/457-462/50/265 — reconcile on the
  stacked branch).

**R6 — Results JSON and `index.html`.** Per-page stitch results keep the v1 fields render-index
consumes (`gif`/`mp4`/`thumb`/`frame_count`/`status`, `render-index.mjs:29-34`) and add:
`mode` (the collapse mode applied), `annotated` (boolean), `kept_frames`, `collapsed_commits`
(duplicates absorbed), `skipped_commits` (skipped + absent), `video_duration_ms` (timeline sum,
excluding the trailing repeat), `longest_hold_ms` (max slot duration) — the last two are exactly
what the design's pacing check needs A5 to report (design lines 156-158). `frame_count` stays "slot
count excluding the trailing repeat" (v1 counts file lines before the trailing push,
`stitch.mjs:50,56-57`). `thumb` = the final slot's image (an annotated composite when annotating —
`path.relative(runDir, …)` at `stitch.mjs:131-133` handles `stitch-frames/` fine).

`render-index.mjs` changes:

- Page summary line (`render-index.mjs:33`) gains mode/annotated/kept/collapsed counts and
  `video_duration_ms` + `longest_hold_ms` rendered in seconds.
- New per-page "Decisions" block: read `page-<name>/frames.json` from the run dir directly (missing
  ⇒ omit the block — pre-A2 runs); one row per entry: index, 7-char hash, `date` first 10 chars,
  subject, `decision` (em-dash when absent), `diff_ratio` (em-dash when null/absent), and for
  `capture: "fail"` entries the FIRST LINE of `error` only (the binding DELTA). Everything through
  `esc()` (`render-index.mjs:20-27`).
- The existing "Skipped commits" block (`render-index.mjs:36,55`) also trims each `error` to its
  first line before escaping (same DELTA rationale; manifest errors come from the same stacks).
- Boot-skipped commits already stay out of that block (`status === 'skip'` filter at
  `render-index.mjs:36`; A2 R7 uses `boot_skip`).

**R7 — Reference docs (minimal; A4 owns the overhaul).**

- `references/config-schema.md`: `annotate` row (line 49 (A1)) now states stitch-time burn-in of
  commit line + badge and that `--no-annotate` overrides per invocation; `collapse_mode` /
  `max_hold_ms` rows (61-62 (A1)) gain the R2 formulas in one line each; the resume-hash list
  (line 108 (A1)) drops `annotate`; a `gif.fps` note says it is the pacing base for both outputs and
  that `mp4.fps` is ignored as of stitch-time annotation (MP4 encodes at 30fps CFR).
- `references/workflow.md` §6 Stitch (lines 83-91 (A1)): rewrite to frames.json-driven timeline +
  collapse modes + banner/overlay burn-in; delete A2's interim "duplicates appear as holds until A3"
  note (A2 R9).
- `references/troubleshooting.md`: one new entry — "stitched video has no annotation bar"
  (`annotate: false` in config, or `--no-annotate` was passed; also covers the exit-3 chromium
  message from R3).

## 3. Config/schema changes

**No new fields; no init questions (I4 satisfied — A4 asks).** Semantics changes:

| field | type | default | asked at init? | A3 change |
|-------|------|---------|----------------|-----------|
| `annotate` (existing) | boolean | `true` (`load-config.mjs:27` (A1)) | A4 | re-bound: stitch-time burn-in of commit line + badge; REMOVED from `HASH_FIELDS` (R5) |
| `dedup.collapse_mode` (existing, A1) | enum `badge`\|`drop`\|`speedthrough` | `badge` | A4 | consumed by stitch (R1/R2); validation already exists (`load-config.mjs:54,82-83` (A1)) |
| `dedup.max_hold_ms` (existing, A1) | positive int | `3000` | A4 | consumed as the badge-mode hold cap (R2) |
| `gif.fps` (existing v1) | number | `1.5` | no | documented as the pacing base for BOTH outputs (already true in v1, `stitch.mjs:13,38`) |
| `gif.hold_skipped_ms` (existing v1) | number | `400` | no | unchanged consumer (skipped/absent repeats) |
| `mp4.fps` (existing v1) | number | `1.5` | no | IGNORED at stitch; MP4 encodes CFR 30 (R4; Open choice 1). Field stays accepted |

Internal constants (deliberately not config): speedthrough multiplier 8×, 40ms slot floor, banner
heights 40/76px, banner background `#111111`, MP4 output rate 30fps. CLI: `--no-annotate` now
plumbed through to stitch in run and stitch-only (R5).

## 4. Slices

### Slice 1 (the whole item — one PR)

Timeline + collapse modes + banner/overlay burn-in + encoder changes in `scripts/stitch.mjs`
(optionally extracting pure timeline logic to a new `scripts/lib/` module — executor's call);
flag plumbing + stitch rc handling in `scripts/timelapse.mjs`; `annotate` removal in
`scripts/lib/config-hash.mjs`; decisions table + summary extensions in `scripts/render-index.mjs`;
doc rows per R7. All under `/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse/`.
`scripts/package.json` gains nothing (I7). Branch from `item/a2-dedup-engine` HEAD; PR targets that
branch (stacked-PR mode). I8 throughout: explicit-path `git add` only; no git operations in kayvee.

**Acceptance setup** (executor runs all of it; tool versions probed this run: ffmpeg 8.1.1,
ffprobe 8.1.1, jq 1.6 — commands below are written against their output formats):

```bash
SKILL=/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse
KAYVEE="/Users/rajdholakia/Documents/1-startups/💎 Stella 56/kayvee-website"   # emoji + spaces: always quote
cd "$SKILL/scripts" && npm ci && npx playwright install chromium   # once, if not already bootstrapped
ffmpeg -version | head -1    # must print 8.1.1
ffmpeg -hide_banner -filters | grep -c drawtext   # prints 0 (this build has none — the R3 rationale)
```

**Hermetic fixture** — a plain directory (no git repo, no server, no capture): a synthetic run dir
exercising every decision state, driven by hand-written `frames.json`/`commits.json`. Fixture PNGs
are flat-color 640×400 (so "untouched pixels" assertions are exact).

```bash
FIX="$(mktemp -d)/a3-fixture" && mkdir -p "$FIX" && cd "$FIX"
RUN="$FIX/.timelapse/a3-syn" && mkdir -p "$RUN/page-home" "$RUN/page-void"
ffmpeg -y -v error -f lavfi -i color=c=0xC8C8C8:s=640x400 -frames:v 1 "$RUN/page-home/001_aaaaaa1.png"
ffmpeg -y -v error -f lavfi -i color=c=0x808080:s=640x400 -frames:v 1 "$RUN/page-home/004_bbbbbb4.png"
ffmpeg -y -v error -f lavfi -i color=c=0x404040:s=640x400 -frames:v 1 "$RUN/page-home/006_cccccc6.png"
```

`$RUN/commits.json`: 6 entries, `index` 1–6, 40-hex-char hashes whose first 7 chars are `aaaaaa1`,
`aaaaaa2`, `aaaaaa3`, `bbbbbb4`, `bbbbbb5`, `cccccc6`, ISO dates, and subjects where index 4's
subject is exactly `add <b>"hero" & 'nav'</b>` (escaping probe). `$RUN/page-home/frames.json` — the
A2 R3 state table verbatim:

| index | decision | capture | file | diff_ratio | collapsed_into | error |
|---|---|---|---|---|---|---|
| 1 | kept | ok | 001_aaaaaa1.png | null | null | — |
| 2 | duplicate | ok | null | 0.0 | 1 | — |
| 3 | duplicate | (key absent) | null | null | 1 | — |
| 4 | kept | ok | 004_bbbbbb4.png | 0.5 | null | — |
| 5 | skipped | fail | null | null | 4 | `"boom first line\nat Page.goto (stack line 2)"` (real newline in JSON) |
| 6 | kept | ok | 006_cccccc6.png | 0.4 | null | — |

`$RUN/page-void/frames.json`: two `skipped` entries (indexes 1-2, `capture: "no_route"`, file null,
collapsed_into null); no PNGs, no placeholder. `$RUN/manifest.json`: minimal
`{"run_id":"a3-syn","processed":6,"skipped_count":0,"entries":[],"skipped":[],"pages_summary":[]}`.
`$FIX/.timelapse.yaml`:

```yaml
pages:
  - { name: home, path: /, wait_for: "body" }
  - { name: void, path: /void, wait_for: "body" }
gif: { fps: 2, width: 800, hold_skipped_ms: 400 }
mp4: { crf: 22 }
dedup:
  collapse_mode: badge
  max_hold_ms: 3000
```

Derived constants for the checks: `base_ms = 500`; badge hold for N=2 =
`min(3000, round(500 × (1 + log2(3)))) = 1292`.

**Acceptance checks** (from `$FIX`; `P="$RUN/page-home"`; every ffprobe/jq form below was probed on
the pinned versions):

1. **Badge mode.** `node "$SKILL/scripts/stitch.mjs" --run-dir "$RUN" > "$FIX/res-badge.json"` → exit 0.
   ```bash
   jq -e '.[0].page=="home" and .[0].status=="ok" and .[0].mode=="badge" and .[0].annotated==true
     and .[0].kept_frames==3 and .[0].collapsed_commits==2 and .[0].skipped_commits==1
     and .[0].frame_count==4 and .[0].video_duration_ms==2692 and .[0].longest_hold_ms==1292
     and .[1].page=="void" and .[1].status=="no_frames"' "$FIX/res-badge.json"
   ```
   → exit 0. Timeline = [kept1 1292ms, kept4 500ms, repeat-of-4 400ms, kept6 500ms].
2. **GIF/MP4 timing (badge).**
   `ffprobe -v error -count_frames -select_streams v -show_entries stream=nb_read_frames -of csv=p=0 "$P/home.gif"`
   → prints `5` (4 slots + trailing repeat).
   `ffprobe -v error -select_streams v -show_entries frame=pts_time -of csv=p=0 "$P/home.gif" | sed -n 2p`
   → a value in [1.27, 1.33] (the 1292ms hold survives into GIF delays; centisecond quantization).
   `d=$(ffprobe -v error -show_entries format=duration -of csv=p=0 "$P/home.mp4"); awk -v d="$d" 'BEGIN{exit !(d>=2.60 && d<=2.90)}'`
   → exit 0 (2692ms sum + trailing/grid rounding ≲ 100ms at CFR 30).
3. **Burn-in pixels (badge).** `ls "$RUN/stitch-frames/page-home/"*_annotated.png | wc -l` → `3`.
   `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$RUN/stitch-frames/page-home/001_annotated.png"`
   → `640,400` (canvas unchanged). Text/badge presence via signalstats
   (probed output form: `lavfi.signalstats.YMIN=31`):
   ```bash
   ffmpeg -v error -i "$RUN/stitch-frames/page-home/001_annotated.png" \
     -vf 'crop=iw:36:0:ih-36,signalstats,metadata=print:file=-' -f null - | grep -E 'YMIN=|YMAX='
   ```
   → YMIN ≤ 48 and YMAX ≥ 180 (dark badge row with light "×2 commits · no visual change" text).
   Same command against `004_annotated.png` with `crop=iw:36:0:ih-76` → YMIN == YMAX (region above
   the 40px badge-less bar is the untouched flat source — no badge row on a kept frame with N=0);
   with `crop=iw:40:0:ih-40` → YMIN ≤ 48 and YMAX ≥ 180 (commit line present).
4. **Cap.** Set `max_hold_ms: 600` in `$FIX/.timelapse.yaml`;
   `node "$SKILL/scripts/stitch.mjs" --run-dir "$RUN" > "$FIX/res-cap.json"` → exit 0;
   `jq -e '.[0].video_duration_ms==2000 and .[0].longest_hold_ms==600' "$FIX/res-cap.json"`
   → exit 0 (min(600, 1292) = 600). Restore `max_hold_ms: 3000`.
5. **Drop mode.** Set `collapse_mode: drop`;
   `node "$SKILL/scripts/stitch.mjs" --run-dir "$RUN" > "$FIX/res-drop.json"` → exit 0;
   `jq -e '.[0].mode=="drop" and .[0].frame_count==3 and .[0].kept_frames==3 and .[0].video_duration_ms==1500' "$FIX/res-drop.json"`
   → exit 0; GIF `nb_read_frames` (command as in check 2) → `4` (duplicates AND skipped gone).
6. **Speedthrough mode.** Set `collapse_mode: speedthrough`;
   `node "$SKILL/scripts/stitch.mjs" --run-dir "$RUN" > "$FIX/res-fast.json"` → exit 0;
   `jq -e '.[0].mode=="speedthrough" and .[0].frame_count==6 and .[0].video_duration_ms==2026 and .[0].longest_hold_ms==500' "$FIX/res-fast.json"`
   → exit 0 (slots 500+63+63+500+400+500; 63 = round(500/8)); GIF `nb_read_frames` → `7`;
   `ls "$RUN/stitch-frames/page-home/"*_annotated.png | wc -l` → `5` (kept 1/4/6 + duplicate slots
   2/3 with their own banners over frame 001's pixels);
   `grep -c "002_annotated" "$RUN/frames_home.txt"` → `1`.
7. **`annotate: false` × plumbing (stitch-only path).** Keeping `collapse_mode: speedthrough`:
   `"$SKILL/scripts/timelapse.sh" stitch-only --run-id a3-syn --no-annotate` → exit 0.
   `grep -c 'stitch-frames' "$RUN/frames_home.txt"` → `0` (bare pristine frames in a collapse mode);
   `test ! -d "$RUN/stitch-frames"` → exit 0 (workspace removed, not recreated);
   `jq -e '.pages_summary[0].mode=="speedthrough" and .pages_summary[0].annotated==false' "$RUN/manifest.json"`
   → exit 0 (stitch-only now refreshes the manifest, R5).
8. **index.html + DELTA trim.** After check 7, in `$RUN/index.html`:
   `grep -c 'boom first line' "$RUN/index.html"` → ≥ 1; `grep -c 'stack line 2' "$RUN/index.html"` → 0
   (multi-line error trimmed to line 1); `grep -c '&lt;b&gt;&quot;hero&quot;' "$RUN/index.html"` → ≥ 1
   (subject HTML-escaped); `grep -c 'duplicate' "$RUN/index.html"` → ≥ 2 (decisions table rows).
9. **Decision-less + missing-frames.json fallbacks.** Build `$FIX/.timelapse/a3-v1` with its own
   3-commit `commits.json` (short hashes `ddddd01`,`ddddd02`,`ddddd03`): `page-nodec/frames.json` =
   3 A1-field-only entries (`capture: "ok"`, files present as 640×400 PNGs, NO
   decision/diff_ratio/collapsed_into keys — the dedup-disabled shape, A2 R8); `page-nofile/` = NO
   frames.json, PNGs on disk for indexes 1 and 3 only (v1 filename format). Minimal manifest as
   above. `node "$SKILL/scripts/stitch.mjs" --run-dir "$FIX/.timelapse/a3-v1" > "$FIX/res-v1.json"` → exit 0;
   `jq -e '.[0].page=="nodec" and .[0].frame_count==3 and .[0].kept_frames==3 and .[0].collapsed_commits==0 and .[1].page=="nofile" and .[1].frame_count==3 and .[1].kept_frames==2 and .[1].skipped_commits==1' "$FIX/res-v1.json"`
   → exit 0; both pages' gif+mp4 exist; `grep -c 'stitch-frames' "$FIX/.timelapse/a3-v1/frames_nodec.txt"` → ≥ 1
   (annotation works from synthesized/decision-less entries too).
10. **Hash drop + no drawtext + docs.**
    `grep -c "'annotate'" "$SKILL/scripts/lib/config-hash.mjs"` → `0`;
    `grep -rn drawtext "$SKILL/scripts" --include='*.mjs' | grep -v node_modules` → no output;
    `grep -c 'annotate' "$SKILL/references/config-schema.md"` → ≥ 1 with the hash-list line (§Hashes
    for resume, line 108 on the A1 branch) no longer naming `annotate`
    (`grep 'config_hash' "$SKILL/references/config-schema.md" | grep -c 'annotate'` → `0`, pipeline exit 1);
    `grep -c 'collapse' "$SKILL/references/workflow.md"` → ≥ 1; the interim "until A3" note gone
    (`grep -c 'until A3' "$SKILL/references/workflow.md"` → `0`);
    `grep -c 'no annotation bar' "$SKILL/references/troubleshooting.md"` → ≥ 1.
11. **Live kayvee smoke (SNAPSHOT PROTOCOL — live demo repo).**
    `git -C "$KAYVEE" status --porcelain > "$FIX/kayvee-before.txt"` FIRST. Then from `$KAYVEE`:
    `"$SKILL/scripts/timelapse.sh" run --max-commits 3 --i-trust-this-repo --run-id a3-smoke`
    → exit 0 (2 tolerated only if a commit legitimately skips — then note it). Assert:
    `ls "$KAYVEE/.timelapse/a3-smoke/page-home/home.gif" "$KAYVEE/.timelapse/a3-smoke/page-home/home.mp4"` → exist;
    `grep -c 'stitch-frames' "$KAYVEE/.timelapse/a3-smoke/frames_home.txt"` → ≥ 1 (default badge+annotate);
    `grep -c 'Decisions' "$KAYVEE/.timelapse/a3-smoke/index.html"` → ≥ 1. Then
    `"$SKILL/scripts/timelapse.sh" stitch-only --run-id a3-smoke --no-annotate` (from `$KAYVEE`)
    → exit 0 and `grep -c 'stitch-frames' "$KAYVEE/.timelapse/a3-smoke/frames_home.txt"` → `0`.
    Cleanup: `rm -rf "$KAYVEE/.timelapse/a3-smoke"`; then
    `git -C "$KAYVEE" status --porcelain > "$FIX/kayvee-after.txt" && diff "$FIX/kayvee-before.txt" "$FIX/kayvee-after.txt"`
    → empty diff (pre-existing dirt is not a defect; NEW dirt is). No git operations in kayvee.
12. **Cleanup.** `rm -rf "$FIX" "$(dirname "$FIX")"`.

## 5. Edge cases

- **Empty history / zero relevant commits.** `commits.json` is an empty array ⇒ every page's
  timeline is empty ⇒ `no_frames` per page (R1), exit 0. A missing `commits.json` entirely
  (stitching a non-run dir) exits 3 with a clear message instead of an unhandled ENOENT throw.
- **Single commit / single kept frame.** One slot + trailing repeat; 1-frame GIF and ~base_ms MP4
  encode fine (v1 precedent with `--max-commits 1`); badge N=0 ⇒ no badge row.
- **First frame.** Always `kept` per A2 R3; annotated with its banner; never a badge (nothing can
  collapse into a frame before it exists — duplicates always carry `collapsed_into` per A2 R3, and
  no duplicate precedes a page's first kept entry).
- **Zero kept frames on a page.** All entries skipped/absent: with a placeholder on disk, v1
  placeholder-hold slots (unannotated); without one, `no_frames` (acceptance check 1, page-void).
  In `drop` mode this is always `no_frames` (non-kept slots emit nothing).
- **All-duplicates run.** One kept + N−1 duplicates: `badge` ⇒ single slot held
  `min(max_hold_ms, round(base×(1+log2(N))))` with an ×(N−1) badge; `drop` ⇒ single base_ms slot;
  `speedthrough` ⇒ 1 + (N−1) fast slots of the same pixels with different banners.
- **`annotate: false` × each collapse mode.** badge ⇒ bare kept frames, scaled holds, NO badge text
  (the badge is annotation; pacing is not); drop ⇒ bare kept frames; speedthrough ⇒ the same
  pristine PNG repeated across a run's fast slots (banner-less slots are indistinguishable — correct,
  they are pixel-identical commits). No `stitch-frames` dir in any mode (R3).
- **Missing font / drawtext.** Resolved by construction: the installed ffmpeg 8.1.1 HAS no drawtext
  (probed — the reason for R3's overlay strategy), so there is no font path to configure on macOS at
  all; text comes from Chromium's `ui-monospace` stack, always present. Acceptance check 10 pins
  "no drawtext reference" permanently.
- **Missing ffmpeg mid-stitch.** spawnSync error is captured per page ⇒ `{status:"fail"}` (v1 path,
  `stitch.mjs:89-97`); run flow now exits 3 surfacing stderr only if stitch itself exits non-zero
  (R5) — per-page fails keep the v1 contract (stitch exit 0, fails in results).
- **Missing chromium with `annotate: true`.** Stitch exit 3 naming `npx playwright install chromium`
  (R3); with `annotate: false` chromium is never launched and stitch works without it.
- **Resume mid-run.** Stitch runs once at the end of a (tail-)resumed run over the final
  frames.json; it is idempotent — every invocation rebuilds `stitch-frames/`, concat files, and
  outputs from scratch (R3 workspace lifecycle), so re-stitching a completed run is byte-stable
  modulo encoder nondeterminism.
- **Kept entry whose PNG is missing** (should not happen post-A2 seeding, but a hand-edited dir can):
  per-page `fail` naming the file (R1) — never silently skipped.
- **`skipped` entry with a retained PNG** (A2's undecodable-PNG case keeps `file` non-null,
  A2 R3 table): still treated as `skipped` — decision governs, the file is ignored (visuals unknown).
- **Duplicate run lengths at speedthrough scale.** 79 duplicates (max_commits 80 default) ⇒ ~6.6s of
  fast slots at defaults; GIF slot floor 40ms keeps every slot renderable; no cap by design (the
  flythrough IS the feature; the 278-commit stress test is B-lane/A5 territory).
- **`max_hold_ms` smaller than base_ms.** Cap wins; kept-with-N>0 frames can be SHORTER than plain
  kept frames — accepted (validation allows it; troubleshooting already covers pacing tuning).
- **GIF centisecond quantization.** Delays land on a 10ms grid (probed 0.667→0.68); formulas stay in
  ms and quantization is an encoding artifact — acceptance ranges account for it.

## 6. Open choices

1. **`mp4.fps` disposition.** Bound here: stitch ignores it and encodes CFR 30 (R4) — at 1.5 output
   fps, badge holds quantize to a 667ms grid and speedthrough slots are dropped outright, so honoring
   it faithfully reproduces v1's limitation, not the design. Alternative a DELTA can pick: reinterpret
   `mp4.fps` as an mp4-specific pacing base (second timeline). Costs a second concat file and splits
   `gif.fps`/`mp4.fps` semantics; A4's interview could then ask one pacing question feeding both.
2. **Speedthrough multiplier as config.** Bound here: internal constant 8× with a 40ms floor (R2) —
   the decisions addendum enumerates the init-time options (dedup on/off, mode, threshold, pacing)
   and a per-mode multiplier is not among them. If A4's "pacing" question wants to expose it, that is
   an A4 config addition (`dedup.speedthrough_multiplier` would need no resume-hash entry — stitch-time
   only, same rationale as `collapse_mode`).

## Execution notes (slice 1)

- **Concat trailing-file duration is STICKY, not tiny** (deviation, live-probed on
  ffmpeg 8.1.1): a final `file` line without a `duration` directive inherits the
  LAST `duration` value, not the image's nominal 0.04s. The spec's R4 probe used a
  0.083s final slot so the effect was invisible; with a 500ms final hold the MP4
  came out at 3.167s — outside check 2's [2.60, 2.90] window. Fix kept R1's frozen
  concat mechanics (trailing line still has no duration) and instead bounds the MP4
  encode with `-t (video_duration_ms + 1000/30)/1000`, so the trailing repeat only
  flushes the final directive. GIF untouched (its trailing frame was probed and
  accepted by the spec). A5's pacing report should expect MP4 format duration ≈
  `video_duration_ms` + one output frame + centisecond-grid rounding.
- **`p.name` → `p.page` in render-index** (deviation): stitch results have always
  used the `page` key, so v1's `esc(p.name)` heading rendered empty on every run.
  Summary headings now use `p.page ?? p.name`. Latent v1 bug, surfaced while
  extending the summary line.
- **Stitch results are emitted in sorted page-name order** (deviation): v1 used
  raw `readdirSync` order (filesystem-dependent). Acceptance jq assertions index
  into the array, so ordering is now deterministic.
- **stitch-only forwards stitch stdout/stderr on success too** — v1's
  `stdio: 'inherit'` visibility is preserved even though the output is now
  captured for the rc-check and the manifest `pages_summary` refresh.
- **Banner intermediates** persist as `<NNN>_banner.png` next to the
  `<NNN>_annotated.png` composites (spec R3 allows). Banner text is styled
  `#f5f5f5` on `#111111`; signalstats on the composite reads YMIN=31 / YMAX=226
  (limited-range luma), matching the spec's probed output form.
- **In-code comments avoid the name of the missing ffmpeg text filter** — check 10
  greps the scripts tree for it permanently, and that includes comments.
- **For A4/A5**: `annotate` left `HASH_FIELDS` (comment there updated); stitch
  accepts `--no-annotate` directly and `timelapse.mjs` forwards it from both the
  run flow and `stitch-only`. Stitch exits 3 (whole process) only for: missing
  `commits.json`, unreadable config, or Chromium launch failure while banners are
  needed; everything else stays per-page `fail` with stage `stitch`/`annotate`/
  `mp4`/`gif` and exit 0.
- **Acceptance**: checks 1–10 and 12 pass verbatim (fixture); check 11 kayvee smoke
  pass — see PR body transcript. Kayvee left byte-identical (`git status
  --porcelain` diff empty; run dir removed).
