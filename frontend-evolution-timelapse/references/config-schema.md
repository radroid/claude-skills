# `.timelapse.yaml` schema

Committed in the **target app repo** (not the skills repo).

## Core

| Field | Default | Notes |
|-------|---------|-------|
| `project_root` | `.` | Install/dev cwd within worktree (monorepo: `apps/web`) |
| `workspace` | `null` | Optional turborepo/pnpm workspace root override |
| `worktree_mode` | `sibling` | `sibling` (outside repo) or `in-repo` |
| `capture_mode` | `dev` | `dev` or `production` (requires `build` + `start`) |
| `history_mode` | `first-parent` | `first-parent` or `all` |
| `output_dir` | `.timelapse` | Run artifacts |

## Pages (required)

```yaml
pages:
  - name: home
    path: /
    wait_for: "main, [role=main], #root"
```

`wait_for` is required — comma-separated CSS selectors; first match wins.

## Server

| Field | Default |
|-------|---------|
| `dev` | auto-detected |
| `build` | `null` |
| `start` | `null` |
| `port` | `3000` (5173 if Vite detected at init) |
| `ready.url` | `http://localhost:{port}` |
| `ready.timeout_ms` | `120000` |
| `install` | `null` (auto tiered install) |

## Filtering

`frontend_paths` — minimatch globs against `git diff-tree` paths. Default includes `src/**`, `app/**`, `components/**`, `public/**`, web extensions.

## Capture

| Field | Default |
|-------|---------|
| `viewport.width` | `1440` |
| `viewport.height` | `900` |
| `annotate` | `true` |
| `full_page` | `false` |
| `settle_ms` | `500` |
| `base_url` | `null` (framework detection at capture) |

## Output video

```yaml
gif: { fps: 1.5, width: 1200, hold_skipped_ms: 400 }
mp4: { fps: 1.5, crf: 22 }
```

## Safety / cache

| Field | Default |
|-------|---------|
| `max_commits` | `80` |
| `cache_max_gb` | `20` |
| `min_free_gb` | `5` (production preflight uses ~20GB or commits×1.5GB) |
| `env_file` | `.env.timelapse` |
| `env_sync_files` | `.env`, `.env.local`, `.env.development`, `.env.development.local` |
| `env_load_files` | `null` (same as sync list by default) |
| `required_env` | `[]` |
| `use_historical_env` | `false` (requires `--i-trust-this-repo`) |

### Env sync (worktree)

Detached worktrees do **not** contain gitignored files from your checkout. Before each commit, the skill **copies** `env_sync_files` from your real repo (and `project_root`) into the worktree so Next.js/Vite can read `.env.local` (e.g. Supabase keys).

This is intentional: historical commits never supply secrets; your **current** checkout does.

Optional: set `required_env: [NEXT_PUBLIC_SUPABASE_URL, ...]` to fail fast in preflight if keys are missing.

## Install cache matrix (auto)

| PM | Cache strategy |
|----|----------------|
| npm | `rsync` cached `node_modules` |
| pnpm | `PNPM_STORE_DIR` in cache dir |
| yarn berry | yarn cache + `--immutable` |
| yarn classic | frozen install |
| bun | detects `bun.lock` (Bun 1.2+), legacy `bun.lockb`, or `packageManager: bun@...`; install per commit |

Cache key includes: PM, lockfile hash, `package.json` hash, `project_root`, Node major, OS, arch, `capture_mode`.

Lifecycle scripts disabled unless `--i-trust-this-repo`.

## Hashes for resume

`config_hash` includes: `pages`, `viewport`, `capture_mode`, `dev`/`build`/`start`, `history_mode`, `base_url`, `frontend_paths`, `annotate`, `full_page`, `project_root`, `settle_ms`, `env_file`, `use_historical_env`.

`commit_plan_hash` = SHA256 of frozen `commits.json`.
