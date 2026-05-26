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

## CSP / overlay missing

Annotation inject failed; metadata is in filename and `index.html` captions instead.

## Node version

v1 does not auto-switch Node. Use the correct Node version before running (`nvm use`, `fnm`, `mise`).

## macOS / Linux

Portable `mkdir` lock is used; `flock` is optional on Linux. `lsof` preferred for port checks; falls back to `ss`.

## Windows

Not supported in v1 — use WSL.
