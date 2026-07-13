# A1 — Pristine capture: overlay removal, `dedup` schema, `ignore_selectors` masking, per-frame metadata

Item: A1 (lane A, no deps). Design: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`.
Invariants in force: I2 (pristine pixels), I4 (options are asked), I5 (v1 recoverable), I7 (dependency
fence), I8 (explicit staging). Skill under change: `frontend-evolution-timelapse/`.

## 1. Goal

Make every captured screenshot pristine — no run-generated annotation overlay — so A2 can hash pixels
and A3 can burn annotation in at stitch time. Add the `dedup` config block (field names below are the
contract A2/A3 consume), implement `ignore_selectors` masking at capture, and emit per-frame metadata
(`frames.json` per page) that carries commit identity + capture status to the stitch stage.

### Non-goals

- No diffing, hashing, duplicate detection, PNG discard, or tree-hash boot-skip (A2).
- No stitch-time annotation, collapse modes, badge rendering, hold scaling, or index.html changes (A3).
  `stitch.mjs` is not modified by A1.
- No init interview changes; questions for the new fields are A4. A1 only ships fields + defaults +
  validation + reference-doc rows.
- No E2E proof run beyond the acceptance smoke below (A5).
- Nothing in lane B.

## 2. Requirements

**R1 — Remove the capture-time overlay (I2).** The overlay injector at
`frontend-evolution-timelapse/scripts/screenshot.mjs:27-47` and its call site at
`screenshot.mjs:82` are deleted. No code path may add annotation DOM (`__timelapse_overlay__` or any
successor) to the page before `page.screenshot` (`screenshot.mjs:83-86`). This is unconditional:
I2 governs capture regardless of `annotate` or `dedup.enabled`. The `annotate` config field
(`scripts/lib/load-config.mjs:27`) and the `--no-annotate` flag
(`scripts/timelapse.mjs:50` and `timelapse.mjs:265`) remain accepted but have no capture-time effect;
A3 re-binds them to stitch-time burn-in. I5 ("dedup.enabled: false restores v1 behaviour") is
satisfied at the assembled-video level once A3 lands — capture itself is never overlaid again.

**R2 — Freeze animations unconditionally.** The animation-disabling CSS defined at
`screenshot.mjs:7-14` is today injected only inside the overlay injector and only when `annotate` is
true (`screenshot.mjs:28-30` — the early return skips it otherwise). After A1 it is injected on every
capture attempt, before the settle wait at `screenshot.mjs:81`, independent of all config. Stable
pixels are a precondition for A2's threshold behaving as designed.

**R3 — Deterministic frame filenames.** The PNG name currently varies with `annotate`
(`screenshot.mjs:164` appends a subject slug when annotation is off). After A1 the name is always the
zero-padded index plus 7-char short hash with `.png` — nothing else. This stays compatible with the
current stitch matcher, which matches on the index+short-hash prefix (`scripts/stitch.mjs:32-35`).

**R4 — `ignore_selectors` masking.** When `dedup.enabled` is true AND `dedup.ignore_selectors` is
non-empty, masking runs after the `wait_for` resolution and settle wait and immediately before the
screenshot (`screenshot.mjs:81-86` region):

- Every element matching each selector is visually covered by an opaque rectangle of one fixed flat
  colour spanning the element's bounding box, at maximal stacking order.
- Cover, never remove: no layout mutation (no display change, no node removal) — masking must not
  reflow surrounding content, or the mask itself would register as change between commits.
- The mask colour is a single constant, identical across commits, pages, and runs.
- A selector matching zero elements is a silent no-op (a clock widget may not exist in old commits).
- A selector that the browser rejects as invalid fails that page's capture with status `fail` and an
  error naming the selector. A silently-unmasked frame would poison A2's last-kept baseline, so this
  must be loud, not skipped.
- When `dedup.enabled` is false, no masking occurs at all (I5: the disabled path captures exactly what
  v1 captured — minus the overlay per R1).

**R5 — Per-frame metadata (`frames.json`).** Each page directory gains
`page-<name>/frames.json`: a JSON array ordered by commit index, one entry per commit whose capture
was attempted for that page. The capture script writes it (it alone knows the output path and
per-page status): after each page's attempt it upserts the entry keyed by `index` — replace if
present, else append, keep sorted — and writes atomically via temp-file-plus-rename, the same pattern
as `writeProgress` (`timelapse.mjs:94-98`). Entry fields:

| key | type | meaning |
|-----|------|---------|
| `index` | int | 1-based commit index, identical to `commits.json` (`scripts/list-commits.mjs:95-99`) |
| `hash` | string | full 40-char commit hash |
| `subject` | string | commit subject (already passed as `--subject`, `screenshot.mjs:129-131`) |
| `date` | string | ISO author date (already passed as `--date`) |
| `file` | string or null | PNG filename relative to the page dir; null when no PNG was produced |
| `capture` | string | `ok` \| `no_route` \| `fail` |
| `error` | string, optional | present only when `capture` is `fail` |

Reserved for downstream (documented here, never written by A1): `decision`
(`kept` \| `duplicate` \| `skipped`), `diff_ratio` (number or null), `collapsed_into` (int index or
null) — A2 writes these; A3 reads the whole file for stitch-time annotation. Commits that never reach
the screenshot stage (install/boot failure surfaces through the run-commit catch path,
`scripts/run-commit.mjs:219-238`) have no entry; absence means "no capture for this commit".
Downstream treats a missing `frames.json` as an empty array. The `000_placeholder.png` frame
(`screenshot.mjs:104-119`) is not a commit and gets no entry.

**R6 — `dedup` config schema.** `DEFAULTS` (`scripts/lib/load-config.mjs:5-45`) gains the `dedup`
block from the table in §3. Because the loader shallow-merges user YAML over defaults
(`load-config.mjs:53`), `dedup` must be deep-merged the way `ready` already is
(`load-config.mjs:54-57`) so a partial user block keeps unset defaults. Validation at load, throwing
on violation (loadConfig throws already propagate to CLI exit 3 via the main catch,
`timelapse.mjs:510-513`): `enabled` boolean; `threshold` number in [0,1]; `ignore_selectors` array of
non-empty strings; `collapse_mode` one of `badge`, `drop`, `speedthrough`; `max_hold_ms` positive
integer. `init-config.mjs` spreads `DEFAULTS` into the generated YAML
(`scripts/init-config.mjs:50-62`), so freshly-initialised configs include the block with no interview
change — the questions are A4's.

**R7 — Resume hash.** `HASH_FIELDS` (`scripts/lib/config-hash.mjs:3-21`) gains the three subfields
that affect captured or kept pixels: `dedup.enabled`, `dedup.threshold`, `dedup.ignore_selectors`.
It must NOT include `dedup.collapse_mode` or `dedup.max_hold_ms` — those are stitch-time knobs, and
`stitch-only` re-runs without a hash gate (`timelapse.mjs:217-235`); forcing `--fresh` for a pacing
tweak would be wrong. Consequence: every pre-A1 incomplete run fails the resume gate
(`timelapse.mjs:343-346`) after upgrade and needs `--fresh`; the existing error message already says
so. Update the hash-field list in `references/config-schema.md:98`.

**R8 — Reference docs (minimal; A4 owns the overhaul).** `references/config-schema.md` gains a
`dedup` section documenting every field in §3 with defaults and the collapse-mode enum values, and
the `annotate` row (`config-schema.md:49`) gains a note that annotation is stitch-time as of this
change. `references/workflow.md:78` ("optional overlay" in the capture step) is reworded to
masking + pristine capture. `references/troubleshooting.md:83` ("CSP / overlay missing") is rewritten
or removed — there is no capture overlay to go missing. `SKILL.md` is untouched (its out-of-scope
line at `SKILL.md:123` remains true until A2 lands the engine; A4 rewrites it).

## 3. Config/schema changes

All new fields live under one top-level `dedup` key in `.timelapse.yaml`. These exact names are the
contract for A2 (`enabled`, `threshold`, `ignore_selectors`) and A3 (`collapse_mode`, `max_hold_ms`);
do not rename downstream.

| field | type | default | asked at init? |
|-------|------|---------|----------------|
| `dedup.enabled` | boolean | `true` | yes — asked by A4 (I4); A1 ships default only |
| `dedup.threshold` | number, 0–1 | `0.005` | yes — asked by A4 |
| `dedup.ignore_selectors` | string[] (CSS selectors) | `[]` | yes — asked by A4 as optional, enter-to-skip |
| `dedup.collapse_mode` | enum `badge` \| `drop` \| `speedthrough` | `badge` | yes — asked by A4 (DELTA: all three are init-time options) |
| `dedup.max_hold_ms` | positive integer | `3000` | yes — asked by A4 under pacing; A5 may retune the default from the pacing report |
| `annotate` (existing) | boolean | `true` (unchanged, `load-config.mjs:27`) | already exists; semantics change to stitch-time (A3); no capture effect after A1 |

The per-pixel jitter tolerance (design: ±8/255) is an internal constant of A2's comparator, not a
config field — the design's decisions addendum enumerates the user options and it is not among them.

`frames.json` entry schema: see R5 table. Field names `index`, `hash`, `subject`, `date`, `file`,
`capture`, `error` plus reserved `decision`, `diff_ratio`, `collapsed_into` are likewise fixed for
A2/A3.

## 4. Slices

### Slice 1 (the whole item — one PR)

Overlay removal + unconditional animation freeze + deterministic filenames + masking + `frames.json`
+ schema/validation/hash + reference-doc rows. Files touched: `scripts/screenshot.mjs`,
`scripts/lib/load-config.mjs`, `scripts/lib/config-hash.mjs`, `references/config-schema.md`,
`references/workflow.md`, `references/troubleshooting.md` (all under
`/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse/`). `stitch.mjs`,
`run-commit.mjs`, `timelapse.mjs`, `init-config.mjs` should need no edits — flag/config plumbing
already passes through them; if the executor finds an edit unavoidable there, keep it mechanical and
note it in the PR body.

**Acceptance setup** (executor runs all of this):

- `SKILL=/Users/rajdholakia/Documents/claude-skills/frontend-evolution-timelapse` and
  `KAYVEE="/Users/rajdholakia/Documents/1-startups/💎 Stella 56/kayvee-website"` (path has an emoji
  and spaces — always quote).
- Bootstrap once if needed: in `$SKILL/scripts`, `npm ci` then `npx playwright install chromium`.
- `ffmpeg -version` exits 0 (system ffmpeg, I7).
- Back up the demo config: `cp "$KAYVEE/.timelapse.yaml" "$KAYVEE/.timelapse.yaml.a1bak"`. Every
  check below that edits the YAML must restore from this backup afterwards; final cleanup deletes the
  backup and the two acceptance run dirs under `$KAYVEE/.timelapse/`. Nothing else in the kayvee repo
  may be modified (I8 applies; no git operations in kayvee at all).

**Acceptance checks** (exact commands, expected outcomes):

1. Overlay is gone:
   `grep -rn -e injectOverlay -e __timelapse_overlay__ "$SKILL/scripts" --include='*.mjs' | grep -v node_modules`
   → no output, pipeline exit non-zero.
2. Capture ignores `annotate`:
   `grep -n annotate "$SKILL/scripts/screenshot.mjs"`
   → no output (exit 1).
3. Validation rejects a bad enum: append a `dedup` block with `collapse_mode: zoom` to
   `"$KAYVEE/.timelapse.yaml"`, then from `$KAYVEE` run
   `"$SKILL/scripts/timelapse.sh" run --dry-run`
   → exit 3 and the error text names `collapse_mode`. Restore the YAML from backup.
4. Masking produces flat pixels + metadata is complete: append a valid `dedup` block with
   `ignore_selectors: ["html"]` to the kayvee YAML, then from `$KAYVEE` run
   `"$SKILL/scripts/timelapse.sh" run --max-commits 1 --i-trust-this-repo --run-id a1-mask-check`
   → exit 0 (`--max-commits 1` keeps only the newest relevant commit — `list-commits.mjs:90-93`
   slices from the tail). Then:
   - `jq -e 'length == 1 and .[0].capture == "ok" and (.[0].hash | length == 40) and (.[0].file | test("^[0-9]{3}_[0-9a-f]{7}\\.png$")) and (.[0].subject | length > 0) and (.[0].date | length > 0)' "$KAYVEE/.timelapse/a1-mask-check/page-home/frames.json"`
     → exit 0.
   - `ffmpeg -i "$KAYVEE/.timelapse/a1-mask-check/page-home/<that file>" -vf signalstats -f null - 2>&1 | grep -Eo 'YMIN:[0-9.]+|YMAX:[0-9.]+'`
     → YMIN equals YMAX (the entire viewport is one flat colour, proving the mask covers the full
     painted area including fixed-position children). Restore the YAML from backup.
5. Pristine no-mask smoke + filename determinism: append a valid `dedup` block with defaults (no
   `ignore_selectors`), then from `$KAYVEE` run
   `"$SKILL/scripts/timelapse.sh" run --max-commits 2 --i-trust-this-repo --run-id a1-smoke`
   → exit 0 (2 tolerated only if a commit legitimately skips; then adjust the count below). Then:
   - `jq -e 'length == 2 and (map(.index) | . == (. | sort)) and all(.[]; .capture == "ok" and (.file | test("^[0-9]{3}_[0-9a-f]{7}\\.png$")))' "$KAYVEE/.timelapse/a1-smoke/page-home/frames.json"`
     → exit 0 (no subject suffix in any filename). `page-story-1/frames.json` must exist and parse;
     its entries may be `no_route` with null `file` on old commits — that is acceptable.
   - `ls "$KAYVEE/.timelapse/a1-smoke/page-home/home.gif" "$KAYVEE/.timelapse/a1-smoke/page-home/home.mp4"`
     → both exist (unmodified stitch still consumes the new filenames).
6. Stitch-only still resolves frames:
   from `$KAYVEE`, `"$SKILL/scripts/timelapse.sh" stitch-only --run-id a1-smoke` → exit 0.
7. Docs updated:
   `grep -n -e 'dedup' -e 'speedthrough' "$SKILL/references/config-schema.md"`
   → rows present for all five `dedup.*` fields and all three collapse-mode enum values;
   `grep -n 'overlay' "$SKILL/references/workflow.md" "$SKILL/references/troubleshooting.md"`
   → no remaining claim that capture injects an overlay.
8. Cleanup: restore `"$KAYVEE/.timelapse.yaml"` from `.a1bak`, delete the backup, remove
   `"$KAYVEE/.timelapse/a1-mask-check"` and `"$KAYVEE/.timelapse/a1-smoke"`.

## 5. Edge cases

- **Empty history / zero relevant commits.** `list-commits.mjs` writes an empty plan
  (`list-commits.mjs:77-99` finds nothing); the per-commit loop (`timelapse.mjs:397-455`) never runs;
  no `frames.json` exists. Contract: downstream reads a missing `frames.json` as an empty array.
- **Single commit.** One entry per page; masking and metadata behave identically; nothing
  special-cases "first".
- **First frame.** Masking applies to the first captured frame exactly as to later ones — A2's
  baseline must be a masked frame, so A1 must not exempt frame one.
- **All-duplicates run.** A1 captures and records every frame regardless — duplicate detection is
  A2's. Every entry reads `capture: ok`; `frames.json` length equals the commit-plan length.
- **Resume mid-run.** Upsert-by-index makes re-captured commits overwrite their old entry instead of
  duplicating it; entries from the earlier partial pass persist. Changing `dedup.enabled`,
  `dedup.threshold`, or `dedup.ignore_selectors` between runs changes `config_hash`, so resume is
  correctly refused (`timelapse.mjs:343-346`) — mixed masked/unmasked frames must never share a run.
  Pre-A1 incomplete runs also stop resuming (hash now includes `dedup` subfields): expected, the
  error already instructs `--fresh`.
- **Missing chromium.** Browser launch (`screenshot.mjs:152`) throws before any page is processed →
  screenshot process exits non-zero → run-commit reports `fail` (`run-commit.mjs:183-185`) → no
  `frames.json` entries for that commit and no partial/corrupt file, because the upsert happens only
  after a page attempt completes and writes are atomic.
- **Missing ffmpeg.** A1's capture path never invokes ffmpeg; stitch failure behavior is unchanged v1
  (`stitch.mjs` reports per-page failure). Acceptance check 4 requires ffmpeg on PATH — that is a
  check prerequisite, not a runtime dependency change.
- **Selector matches nothing.** Silent no-op per R4 (element may not exist at old commits).
- **Invalid selector.** Page capture fails loudly with the selector named (R4) — never silently
  unmasked.
- **`no_route` page.** Entry recorded with `capture: no_route`, `file: null`; masking is moot since
  no screenshot is taken (`screenshot.mjs` returns before shooting on missing `wait_for`).
- **Boot/install failure before screenshots.** run-commit's catch path (`run-commit.mjs:219-238`)
  reports skip/fail; no entries for that commit — absence semantics per R5.

## 6. Open choices

None. The DELTA fixed the collapse-mode enum (`badge` \| `drop` \| `speedthrough`, default `badge`),
and the design's "blanked to a flat colour" wording binds masking to opaque cover rectangles (an
element-hiding approach was rejected: whatever is beneath the element may itself be dynamic).
`dedup.max_hold_ms` default 3000 is provisional by design — A5's pacing report tunes it.
