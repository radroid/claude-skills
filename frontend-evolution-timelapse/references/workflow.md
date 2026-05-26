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

1. `git checkout -f <hash>` in worktree
2. Skip if `project_root` missing → `project_root_absent`
3. **Sync env** — copy `env_sync_files` (`.env.local`, etc.) from your checkout into worktree
4. **Load env** into process for install/build/dev
5. Install (cached per PM)
6. Start `dev` or `build`+`start`; tail dev log for port
7. Poll `ready.url` until HTTP OK
8. Playwright: each page, `wait_for`, `settle_ms`, optional overlay
9. Write PNG to target repo `.timelapse/<RUN_ID>/page-<name>/`
10. Teardown server; append `progress.json` atomically
11. Emit one stdout summary line

## 6. Stitch

`stitch.mjs` builds per-page `frames.txt` for ffmpeg concat demuxer:

- Hold frame = previous PNG or `000_placeholder.png`
- Duplicate final `file` line (ffmpeg quirk)
- Output `<page>.gif` and `<page>.mp4`
- `no_frames` if no captures

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
