---
name: frontend-evolution-timelapse
description: Builds construction-style timelapse GIFs and MP4s of a web frontend across git history by checking out frontend-relevant commits, serving the app, and screenshotting configured pages. Use when the user wants a frontend evolution timelapse, visual git history of UI, screenshots over commits, construction-progress demo, branch UI history, or invokes frontend-evolution-timelapse. Requires a Node.js web app (npm/pnpm/yarn/bun) with a dev or production server — not mobile, PHP, or Python template repos.
---

# Frontend Evolution Timelapse

## What this skill does

Walks the current branch from first meaningful frontend commit to `HEAD`, captures configured pages at each relevant commit, and stitches per-page GIF/MP4 timelapses plus a static `index.html` summary.

## Supported repositories

| Works | Does not work (v1) |
|-------|---------------------|
| React, Next.js, Vite, Remix, Astro, CRA, etc. | Django, Rails, PHP, Go templates |
| JavaScript or TypeScript | iOS / Android native |
| `package.json` + dev or build/start scripts | Static HTML with no server |
| macOS, Linux, WSL | Windows PowerShell (untested) |

## Two-repo model

1. **Skill scripts** — `$SKILL_ROOT/scripts/` (or path from loaded skill). Bootstrap once:

```bash
cd "$SKILL_ROOT/scripts" && npm ci && npx playwright install chromium
```

2. **Target app repo** — `cd` into the application under timelapse. `.timelapse.yaml` and `.timelapse/` live here only.

3. **Isolated worktree** — historical checkouts run in a sibling worktree; the user's active branch and working tree are not rewound.

## Quick start

```bash
cd /path/to/my-app

# 1. Create config (agent asks for pages, port, dev command; pipes JSON to init-config.mjs)
"$SKILL_ROOT/scripts/timelapse.sh" init

# 2. Estimate runtime (models install cache reuse + one dev boot per commit)
"$SKILL_ROOT/scripts/timelapse.sh" run --dry-run

# 3. Run (historical commits require trust flag)
"$SKILL_ROOT/scripts/timelapse.sh" run --i-trust-this-repo

# 4. Open output
open .timelapse/<RUN_ID>/index.html
```

## Agent workflow

1. Confirm target repo has `package.json` and is a web frontend.
2. Bootstrap skill scripts if `scripts/node_modules/playwright` is missing.
3. `cd` target repo. Run `init` if no `.timelapse.yaml`.
4. Run `--dry-run`; show commit count and `estimate_minutes` to the user.
5. If >30 commits or the estimate feels uncertain, ask the user whether to:
   - trust the heuristic estimate and run now, or
   - run `--dry-run --calibrate`, which starts current `HEAD`, screenshots the configured pages once, and uses measured timings for a better estimate.
6. Run with `--i-trust-this-repo` when the plan includes non-`HEAD` commits.
7. During run: ingest **one stdout line per commit** only (default quiet mode).
8. After run: read `.timelapse/<RUN_ID>/cost.json` and `skipped.log` if present. Do **not** read PNG binaries or per-commit logs unless the user asks.
9. Point the user to `index.html`, GIF/MP4 paths, and `cost.json` token estimates.

## Environment / secrets (worktrees)

Gitignored env files (`.env.local`, etc.) **do not exist in the worktree**. Before each commit, the skill copies `env_sync_files` from your checkout into the worktree and loads them into the dev process. Use `required_env` in `.timelapse.yaml` to fail preflight if keys are missing.

If every page returns 500, check that `.env.local` exists locally and lists the keys your app needs (e.g. Supabase).

## Trust and safety

If the frozen commit plan includes any commit other than current `HEAD`, preflight **exits 3** unless `--i-trust-this-repo` is set. Without trust: only `init` and `--dry-run` are allowed for historical plans.

Default installs use `--ignore-scripts` (and `YARN_ENABLE_SCRIPTS=false` for Yarn Berry). Lifecycle scripts run only with `--i-trust-this-repo`.

## CLI

```bash
timelapse.sh init | run | resume | stitch-only | clean
```

Flags: `--from`, `--to`, `--only`, `--run-id`, `--dry-run`, `--calibrate`, `--verbose`, `--max-commits`, `--fresh`, `--keep-worktree`, `--non-interactive`, `--i-trust-this-repo`, `--force`, `--no-annotate`

Exit codes: `0` success, `2` partial skips, `3` preflight/lock failure.

## Output layout

```
.timelapse/<RUN_ID>/
  commits.json          # frozen commit plan
  progress.json         # resume checkpoint
  manifest.json
  cost.json
  index.html
  skipped.log
  logs/
  page-<name>/
    001_<hash>.png
    <name>.gif
    <name>.mp4
```

## Cost discipline

- `log_tokens_est` in manifest = cost **if** the agent read that commit's log file (heuristic: bytes ÷ 4).
- `agent_context.tokens_est` in `cost.json` = summary lines + mandated end reads — **not** Cursor billing.
- Never `Read` screenshot PNGs into context unless the user explicitly asks.

## Resume

`timelapse.sh resume` picks the most recent incomplete `RUN_ID` (or `--run-id`). Blocked if `config_hash` or `commit_plan_hash` changed — use `--fresh`.

## References

- [references/config-schema.md](references/config-schema.md) — `.timelapse.yaml` fields
- [references/workflow.md](references/workflow.md) — per-stage walkthrough
- [references/troubleshooting.md](references/troubleshooting.md) — failures, cache, ports, resume

## Out of scope (v1)

- Authenticated routes (future: Playwright `storageState`)
- Perceptual dedup of identical frames
- Git submodules / LFS
- Remote Browserbase capture
