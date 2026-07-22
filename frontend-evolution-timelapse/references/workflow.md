# Workflow

## 0. Bootstrap skill scripts (once per machine)

```bash
cd "$SKILL_ROOT/scripts" && npm ci && npx playwright install chromium
```

## 1. Init (target repo)

Agent collects via chat:

- Page names, paths, `wait_for` selectors
- Viewport
- Port / dev command (or accept auto-detect)

Pipe JSON to:

```bash
node "$SKILL_ROOT/scripts/init-config.mjs" --stdin-json < answers.json
```

Writes `.timelapse.yaml` and appends `.timelapse/` + `.timelapse-worktrees/` to `.gitignore`.

## 2. Preflight + dry-run

```bash
node scripts/preflight.mjs   # via timelapse.sh
timelapse.sh run --dry-run
```

Checks: git, ffmpeg, node, playwright, port free, disk space, trust flag for historical commits.

For a measured estimate:

```bash
timelapse.sh run --dry-run --calibrate
```

Calibration runs the real current-`HEAD` install/start/screenshot flow once, then uses measured install, ready, and per-page screenshot timings to estimate the full frozen commit plan. It is slower than plain dry-run and starts the app, so the agent should ask the user before using it.

The estimate models the real loop shape:

- unique package/lock signatures → cold installs
- repeated package/lock signatures → cache restores
- one dev boot per commit
- per-page screenshot cost
- final stitch cost

## 3. Commit list (frozen)

`list-commits.mjs`:

- `git rev-list --reverse --first-parent HEAD` (or `all`)
- Filter with `git diff-tree` + minimatch
- Apply `--from` / `--to` / `max_commits` (newest N)
- Write `.timelapse/<RUN_ID>/commits.json` once

Resume **never** regenerates this file.

## 4. Worktree + lock

- Acquire lock: `.timelapse/.lock.d/lock.json` with `{pid, start_time_ms, run_id}`
- `git worktree add --detach` at sibling path:
  `<repo-parent>/.timelapse-worktrees/<repo-hash8>/<RUN_ID>/`

## 5. Per-commit loop

For each entry in `commits.json`:

0. **Boot-skip check** (only when `dedup.enabled`) — hash the commit's `frontend_paths` subtree (`git ls-tree`, no checkout); if byte-identical to a commit already proven unchanged-or-baseline, skip checkout/install/boot entirely and record per-page `frames.json` entries (`decision: duplicate` mirroring the twin, no `capture` key, `status=boot_skip` in the summary line)
1. `git checkout -f <hash>` in worktree
2. Skip if `project_root` missing → `project_root_absent`
3. **Sync env** — copy `env_sync_files` (`.env.local`, etc.) from your checkout into worktree
4. **Load env** into process for install/build/dev
5. Install (cached per PM)
6. Start `dev` or `build`+`start`; tail dev log for port
7. Poll `ready.url` until HTTP OK
8. Playwright: each page, `wait_for`, `settle_ms`, then `dedup.ignore_selectors` masking (flat cover rectangles, only when `dedup.enabled`) — capture is pristine, annotation happens at stitch time
9. Write PNG + upsert the commit's entry in `frames.json`, both in target repo `.timelapse/<RUN_ID>/page-<name>/`
10. **Dedup decision** (only when `dedup.enabled`) — decode the PNG to a 64×40 grayscale raster via ffmpeg and diff it against the page's last **kept** frame: `kept` advances the baseline; `duplicate` (diff ratio ≤ `dedup.threshold`) records `collapsed_into` and deletes the PNG; `no_route`/`fail`/undecodable entries record `skipped`
11. Teardown server; append `progress.json` atomically
12. Emit one stdout summary line

## 6. Stitch

`stitch.mjs` re-reads config (`annotate`, `dedup.collapse_mode`,
`dedup.max_hold_ms` are stitch-time knobs — tweak and re-run `stitch-only`, no
`--fresh` needed) and builds a per-page timeline from `frames.json` joined
against `commits.json` order:

- `kept` → a display slot; in `badge` mode it holds
  `min(max_hold_ms, round(base_ms × (1 + log2(1 + N))))` for N collapsed
  duplicates, where `base_ms = round(1000 / gif.fps)`
- `duplicate` → collapsed into its kept frame via `collapsed_into`: `badge`
  counts it into N (and the badge row reads `×N commits · no visual change`);
  `drop` omits it; `speedthrough` shows the kept frame's pixels in a fast slot
  of `max(40, round(base_ms / 8))` ms with the duplicate's own commit banner
- `skipped` / absent → repeat the previous slot (or `000_placeholder.png`) at
  `gif.hold_skipped_ms`; contributes nothing in `drop`
- No `frames.json` at all (pre-dedup run dirs) → entries are synthesized from
  the v1 filename matcher, so `stitch-only` still works

When `annotate: true` (default; `--no-annotate` overrides per invocation), a
banner — `short-hash | date | subject` plus the badge row — is rendered by
Playwright Chromium and composited onto each displayed frame with ffmpeg
`overlay` under `<run>/stitch-frames/` (the installed ffmpeg has no `drawtext`;
pristine PNGs are never modified). Encoding: duplicate final `file` line
(ffmpeg concat quirk); GIF keeps variable frame durations (no fps resample);
MP4 encodes CFR 30 (`mp4.fps` is ignored). Output `<page>.gif` and
`<page>.mp4`; `no_frames` if the timeline is empty.

## 7. Report

- `render-index.mjs` → `index.html`
- `manifest.json`, `cost.json`
- Remove worktree unless `--keep-worktree`

## Base URL detection (per commit)

| Framework | Detection |
|-----------|-----------|
| Config | `base_url` override |
| Vite | static config parse fallback |
| Next | `next.config` / `/_next/static` probe |
| Astro | `<base href>` |

## Framework table

See config `base_url: null` — runtime probe in `screenshot.mjs` uses package.json deps.
