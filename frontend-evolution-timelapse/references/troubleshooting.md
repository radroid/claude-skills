# Troubleshooting

## Preflight exit 3

| Message | Fix |
|---------|-----|
| non-HEAD commits without trust | Add `--i-trust-this-repo` |
| port in use | Change `port` in config or stop other dev server |
| disk below minimum | Free space or lower commit count with `--max-commits` |
| playwright not installed | `cd $SKILL_ROOT/scripts && npm ci && npx playwright install chromium` |

## Install failures at old commits

- Try `capture_mode: production` for Next.js (slow first compile; increase `ready.timeout_ms`).
- Bun repos detect both modern `bun.lock` and legacy `bun.lockb`. If an old commit has no lockfile but `package.json.packageManager` starts with `bun@`, the skill still uses Bun.
- Old commits without lockfile and without `packageManager` fall back to plain `npm install` (not frozen).
- pnpm: do not manually rsync `node_modules` — use skill cache only.

## Run hangs on commit 1 after an error

Usually a `next dev` process left running after a failed port-ownership check. Fixed in recent skill versions: dev servers start as their own process-group leader (`detached: true`) and teardown signals the whole process group, so Next/Turbopack worker grandchildren cannot keep the port bound.

If stuck now: `timelapse.sh clean` then `timelapse.sh resume --i-trust-this-repo`.

## Port owned by different pid (Next.js 16 / turbopack)

`next dev` spawns a worker child that binds the port. The skill checks only LISTEN-state sockets (`lsof -sTCP:LISTEN`) and treats the port owner as valid if **any** listener pid is the dev server pid or a descendant of it, then kills the entire dev-server process group during teardown.

## All pages return 500 / missing Supabase (or other secrets)

The worktree is a clean git checkout — **`.env.local` is not in git** and will not exist there unless copied.

The skill copies `env_sync_files` (default includes `.env.local`) from your **current checkout** into the worktree before each `dev` server start. Ensure `.env.local` exists on your machine at the repo root (or `project_root`).

Add to `.timelapse.yaml` if you use other filenames:

```yaml
env_sync_files:
  - .env.local
  - .env
required_env:
  - NEXT_PUBLIC_SUPABASE_URL
  - NEXT_PUBLIC_SUPABASE_ANON_KEY
```

Then resume: `timelapse.sh resume --i-trust-this-repo`

## `no_route` for a page

Route did not exist at that commit or `wait_for` selector wrong. Update selectors in `.timelapse.yaml` and `--fresh` run.

## Resume blocked

`config_hash` or `commit_plan_hash` mismatch. Use `--fresh` after config or branch changes.

## Stale lock

```bash
timelapse.sh clean
# or
timelapse.sh run --force   # dangerous if another run is active
```

Lock reclaim checks PID + `start_time_ms`; stale PIDs are reclaimed automatically.

## Orphan dev server

```bash
timelapse.sh clean
```

Kills PIDs listed in `.timelapse/<RUN_ID>/pids.json`.

## Worktree left behind

```bash
git worktree list
git worktree remove --force <path>
```

Or `timelapse.sh clean`.

## Capture fails with `invalid ignore_selectors entry`

An entry in `dedup.ignore_selectors` is not a valid CSS selector for the browser. The page capture fails loudly rather than shipping an unmasked frame (a silently-unmasked frame would poison dedup's baseline). Fix the selector in `.timelapse.yaml`, then start a `--fresh` run — `dedup.ignore_selectors` is part of `config_hash`, so resume is refused after the edit.

## Almost everything collapses into one frame

`dedup.threshold` is too high, or an `ignore_selectors` entry masks real
content (e.g. a selector matching the page body). Inspect the recorded
`diff_ratio` values in `page-<name>/frames.json` — frames marked `duplicate`
show the measured change ratio against the last kept frame. Lower the
threshold (default `0.005`) or narrow the selectors, then run `--fresh`
(both fields are part of `config_hash`).

## Resume refused: dedup cannot replay a mid-run gap

The error reads `resume refused: dedup cannot replay a mid-run gap`.
A commit failed mid-run and later commits completed (a hole). With dedup on,
recapturing the hole cannot be compared against duplicates that were already
discarded, so `resume` exits 3 naming the hole commits. Remedies: rerun with
`--fresh`, or set `dedup.enabled: false` and rerun with `--fresh` for v1
behavior. Tail resumes (crash/interrupt with no completed commits after the
gap) proceed normally.

## Stitched video has no annotation bar

`annotate: false` is set in `.timelapse.yaml`, or `--no-annotate` was passed
to the `run` or `stitch-only` invocation — both produce completely bare frames
in every collapse mode. Annotation is stitch-time only: set `annotate: true`
(the default) and re-run `timelapse.sh stitch-only --run-id <id>` — no
recapture needed (`annotate` is not part of `config_hash`). Related: with
annotation on, stitch renders banner text with Playwright Chromium; if it
exits 3 telling you to run `npx playwright install chromium`, install the
browser and re-run `stitch-only`.

## Strict CSP blocks the animation-freeze CSS

A strict `style-src` CSP can reject the injected animation-freeze stylesheet. With `dedup.enabled: false` the capture proceeds anyway with a one-line stderr warning (v1 behaviour). With `dedup.enabled: true` the failure is loud and fails the page capture — pixel comparison needs frozen pixels. Relax the CSP for local capture, or set `dedup.enabled: false`.

## Node version

v1 does not auto-switch Node. Use the correct Node version before running (`nvm use`, `fnm`, `mise`).

## macOS / Linux

Portable `mkdir` lock is used; `flock` is optional on Linux. `lsof` preferred for port checks; falls back to `ss`.

## Windows

Not supported in v1 — use WSL.
