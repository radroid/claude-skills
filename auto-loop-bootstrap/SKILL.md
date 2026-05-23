---
name: auto-loop-bootstrap
description: Bootstrap a repo for autonomous build looping — scaffolds CLAUDE.md, GOALS.md, ARCHITECTURE.md, PLAN.md, logs/, and drops in the auto-loop driver script. Use when the user wants to "set up the autonomous loop", "bootstrap auto-loop", "prepare this repo for autonomous building", "make this repo loopable", "scaffold the build loop", or "set up self-driving build" on a repo that doesn't yet have the loop protocol files. If GOALS.md is missing or empty, invokes the grill-me skill first to interview the user and extract a concrete backlog. Idempotent — preserves existing content. Pairs with autonomous-build-loop (runs one iter) which the driver script then invokes per fresh Claude Code session.
---

# Auto Loop Bootstrap

## Overview

Prepare a repo so the autonomous build loop can run. The output is a self-driving setup: the user runs `python3 scripts/auto-loop.py` and walks away — each iter spawns a fresh `claude -p` invocation, reads state from disk, ships features, commits, exits. No `ScheduleWakeup`, no token-runway exhaustion.

Pairs with the `autonomous-build-loop` skill (which defines per-iter behavior). This skill sets up the static files; the other skill defines the runtime protocol.

## Two invocation modes

**Detect mode BEFORE Phase 1.** Either signal sets greenfield-handoff mode:

- `.loop/state.json` exists with `"stage": "S2"` (idea-to-loop wrote it on entry to S2)
- `docs/PRD.md` exists AND `ARCHITECTURE.md` (at repo root) is non-trivial (not a template stub)

| Mode | Trigger | Behavior |
|---|---|---|
| **Brownfield** (default) | Neither signal present | Existing 8-phase workflow below — grill for backlog, scaffold all templates, smoke-test |
| **Greenfield handoff** | Either signal present | **Skip Phase 2** (grilling — backlog already exists). **Skip Phase 4 substitutions for** `GOALS.md` / `ARCHITECTURE.md` / `PLAN.md` (idea-to-loop wrote them). DO run remaining Phase 4 actions (CLAUDE.md protocol-section append, `logs/` skeleton, `.loop/state.json` S2→S3 rewrite, `scripts/auto-loop.py` drop), 5 (.gitignore + settings), 6 (initial commit), 7 (smoke), 8 (hand-off). State transition: rewrite `.loop/state.json` → `"stage": "S3"`, `"pr_mode": true`, `"pr_size_policy": "fat"`, `"iter": 0`. |

In both modes, the exit state is identical: a loop-ready repo with `.loop/state.json` at `"stage": "S3"`.

## Workflow

Run these phases in order. Stop early if a phase exit-criterion isn't met.

### Phase 1 — Audit existing state

Check the repo for what's already in place. See `references/audit-checklist.md` for exact commands.

| File / dir | Required state |
|-----|-----|
| `~/.claude/skills/autonomous-build-loop/SKILL.md` | **REQUIRED companion skill.** Halt the bootstrap if missing — see `references/audit-checklist.md` for install instructions to surface to the user. |
| `CLAUDE.md` | Exists AND contains "autonomous build loop" or equivalent protocol section |
| Backlog source | Resolved in Phase 2 — a file, GH issues, or Linear. ≥3 actionable items. |
| `ARCHITECTURE.md` | Exists (content can be sparse — minimum: domain summary + key tech choices) |
| `PLAN.md` | Exists (content can be sparse — phase ordering) |
| `logs/` directory | Exists with `latest.md` + `blocks.md` stubs |
| `.loop/state.json` | Exists — machine state (`stage`, `iter`, `pr_mode`, `pr_size_policy`). Committed to git. |
| `scripts/auto-loop.py` | Present and executable |
| `.gitignore` | Contains `/.auto-loop/` and `/.loop/claims/` |
| Git repo | `git rev-parse HEAD` succeeds (i.e. at least one commit) |

Report the audit to the user as a checklist. Anything missing → flag as needing scaffold.

### Phase 2 — Discover the backlog source

**Skip entirely in greenfield-handoff mode** — idea-to-loop already produced `GOALS.md`.

The loop reads a backlog every iter to pick features. Each repo organizes backlogs differently — don't assume `GOALS.md`. **Auto-detect first, ask only if ambiguous.**

Scan, in order:

1. `GOALS.md`, `TODO.md`, `ROADMAP.md`, `BACKLOG.md`, `docs/roadmap.md`, `docs/backlog.md` at repo root
2. GitHub Issues (`gh issue list --state open` returns >0)
3. Linear MCP tools (if `mcp__claude_ai_Linear__*` are available)
4. Any `*.md` file containing ≥3 `[ ]`/`[x]` checkbox lines

Decision tree:

- **Exactly one candidate** → confirm with user, record in `.loop/state.json`.
- **Multiple candidates** → ask which is canonical.
- **None found** → run the backlog interview (see below), output to `GOALS.md`, record as the source.

Record in `.loop/state.json`:

```jsonc
"backlog_source": { "kind": "file", "path": "GOALS.md" }              // markdown file
"backlog_source": { "kind": "github_issues", "ref": "owner/repo" }    // GH issues
"backlog_source": { "kind": "linear", "ref": "TEAM" }                 // Linear team key
```

For non-file backlogs, the per-iter agent uses the matching MCP/CLI to query items each iter — slower but follows the repo's existing workflow. `references/backlog-format.md` documents the file-backlog format if you fall back to one.

**Backlog interview (only when no source exists).** Invoke `grill-me` with: "Interview me for an 8–15 item build backlog. Stress-test for: pairwise independence, MVP vs. nice-to-haves, what's done vs. remaining, external blockers." Fall back to `superpowers:brainstorming` if `grill-me` is unavailable. See `references/grilling-guide.md`.

> **PRD-grilling is separate.** If `docs/PRD.md` is missing and the user wants one, invoke `grill-to-prd` **before** this phase. PRD-grill writes `docs/PRD.md`; backlog setup here records the source. Both can run on the same repo.

### Phase 3 — Pin stage + base branch + tier + denylist

**Stage** (what `.loop/state.json` `stage` will be set to — see `autonomous-build-loop/references/lifecycle-stages.md`):

Auto-detect, then confirm:

| Signals present | Detected stage |
|---|---|
| Only `docs/PRD.md` (or sparse repo) — no `ARCHITECTURE.md`, no code | `S1` (still designing) |
| `ARCHITECTURE.md` filled + minimal code (scaffold only, no features) | `S2` (scaffolding) |
| `ARCHITECTURE.md` filled + `src/` or app code + plan/backlog ready (e.g. vertical-slice plan branch, ≥3 backlog items) | `S3` (default — vertical-slice impl looping) |
| Complexity signal tripped (M4) — large LoC, deep deps, file count past threshold | `S4` (layer-specialized scale) |

Ask the user to confirm. Brownfield repos with existing app code + a plan default to `S3` — that's the case for most real-world bootstraps. If the repo is past S3 territory but no M4 complexity-signal infra exists yet, stay at S3; M4 will retro-detect.

**Base branch** (the integration target for PRs):

1. Default to the current branch if it is not `main` (e.g. `development`); otherwise default to `main`.
2. Cross-check with the GitHub default branch if a remote exists (`gh repo view --json defaultBranchRef`). If they differ, surface both and confirm with the user.
3. Record the chosen branch as `.loop/state.json` `base_branch`.

**Plan tier + budget** (only if not known from session context): Max 20x / Max 5x / Pro / API. Sets the driver budget defaults — see `references/plan-tier-defaults.md`.

**Sensitive paths** — secrets, prod keys, files the loop must not touch. Translates into `.claude/settings.local.json` denylist entries. See `references/permissions-template.md`.

### Phase 4 — Scaffold missing files

For each missing file, copy from `assets/templates/` into the repo and substitute placeholders. **Never clobber existing content** — if the file exists, leave it; only fill in gaps. For CLAUDE.md specifically: if it exists but lacks the protocol section, APPEND the section (do not rewrite the file).

In greenfield-handoff mode, `GOALS.md` / `ARCHITECTURE.md` / `PLAN.md` already exist from idea-to-loop — the never-clobber rule already protects them. For `.loop/state.json`, **rewrite** rather than skip: idea-to-loop wrote it at `"stage": "S2"`; this skill flips it to `"stage": "S3"` and fills in `pr_mode` + `pr_size_policy` + resets `iter` to 0. This rewrite is the atomic handoff documented in `idea-to-loop/SKILL.md`.

Templates to copy (with substitutions):

| Asset | Destination | Substitutions |
|-------|-------------|---------------|
| `assets/templates/CLAUDE.md` | `<repo>/CLAUDE.md` | `{{PROJECT_NAME}}`, `{{DEV_SERVER_PORT}}`, `{{TECH_STACK}}`, `{{BACKLOG_PATH}}` |
| `assets/templates/GOALS.md` | `<repo>/GOALS.md` | **Only if backlog interview ran in Phase 2.** Otherwise the existing source stays untouched. |
| `assets/templates/ARCHITECTURE.md` | `<repo>/ARCHITECTURE.md` | One-paragraph stub if no architecture doc exists |
| `assets/templates/PLAN.md` | `<repo>/PLAN.md` | Phase list from Phase 2 |
| `assets/templates/logs/latest.md` | `<repo>/logs/latest.md` | iter-000 pointer |
| `assets/templates/logs/blocks.md` | `<repo>/logs/blocks.md` | empty header |
| `assets/templates/.loop/state.json` | `<repo>/.loop/state.json` | Substitute `base_branch` (Phase 3) and `backlog_source` (Phase 2) before writing. |
| `assets/auto-loop.py` | `<repo>/scripts/auto-loop.py` | `chmod 755` after copy |

### Phase 5 — Wire up `.gitignore` and settings

- Append `/.auto-loop/` and `/.loop/claims/` to `.gitignore` (create file if missing). Note: `.loop/state.json` itself **is** committed — only `.loop/claims/` (multi-loop atomic-claim ephemera) is ignored. Keep `.auto-loop/` (driver runtime) and `.loop/` (committed loop state) distinct.
- **ALWAYS write the baseline `.claude/settings.local.json`** per `references/permissions-template.md` — this is required, not optional. As of v0.1.2 the driver refuses to start if it's missing. Phase 3 collected ADDITIONS the user named; merge those entries into the baseline before writing.
- Before bootstrapping, REFUSE to proceed if `git status --porcelain` is non-empty — uncommitted WIP would get bundled into the iter-000 commit. Surface the dirty paths to the user and ask them to commit/stash first.

### Phase 6 — Initial commit

Stage and commit ONLY the scaffolded files. Use explicit per-file `git add` so unrelated WIP edits don't sneak in:

```
# Include the backlog file in the add list only if Phase 2 created one (file-backlog mode).
git add CLAUDE.md ARCHITECTURE.md PLAN.md logs/latest.md logs/blocks.md \
        .loop/state.json scripts/auto-loop.py .gitignore .claude/settings.local.json
# add the discovered backlog file (e.g. GOALS.md, TODO.md, ROADMAP.md) if it was created/edited
git commit -m "iter 000: bootstrap autonomous build loop"
```

This commit is the loop's seed. `iter-000.md` doesn't exist yet — the first auto-loop iter will write `iter-001.md`.

### Phase 7 — Smoke-test with one dry-run iter

**Do not start the full loop yet.** Run ONE iter to verify plumbing. **Use Sonnet** — fresh-session Opus iters cost $4-8 just on context bootstrap, which would blow past a low smoke-test budget:

```bash
# Sonnet smoke (recommended)
python3 scripts/auto-loop.py --max-iters 1 --max-budget-usd-per-iter 3 \
  --prompt "Run ONE iteration of the autonomous build loop per CLAUDE.md, using model=sonnet."

# Or Opus smoke (heavier)
python3 scripts/auto-loop.py --max-iters 1 --max-budget-usd-per-iter 10
```

Expected outcomes:
- `.auto-loop/usage.jsonl` has one entry with non-zero `input_tokens` + `output_tokens`
- `logs/iter-001.md` exists
- A new commit exists with the iter-001 summary
- Exit code 0

If the smoke test fails:
- Exit code 124 → `claude` timed out; increase `--iter-timeout-s` next time
- No commit → check stderr; likely a permission prompt got blocked → confirm `--permission-mode bypassPermissions` is OK for this repo
- No `logs/iter-001.md` → the agent didn't follow the protocol; verify CLAUDE.md's protocol section is present AND the user has the `autonomous-build-loop` skill installed

### Phase 8 — Hand off

Tell the user the one command to start real looping:

```bash
python3 scripts/auto-loop.py
```

Stop conditions: Ctrl-C, `touch .auto-loop/stop`, configured backlog source empty, `--max-iters` reached, or 3 consecutive failed iters.

**One-time Claude Code settings (print these once, do NOT add to CLAUDE.md):**

- Set auto-compaction threshold to **40%** — the loop is built to survive compaction, but a lower threshold keeps each iter's working memory leaner. Configure via `/config` → "auto-compact" or `~/.claude/settings.json`.
- Set context window to **1M** — eliminates token-runway worry inside the harness so the model focuses on work, not bookkeeping. Configure via `/config` → "context window" (requires a model that supports 1M, e.g. Opus 4.7 1M).

These are first-and-done — never repeat in per-iter instructions.

**Pair with a supervisor (recommended).** Open a second Claude Code window in the same repo and invoke the `loop-supervisor` skill. It reads code + iter logs read-only and curates the backlog while the implementation loop runs. Together: one window builds, the other steers.

## Hard rules

- **Never clobber existing files.** Audit first. Append only where the existing content lacks required sections.
- **Always run the smoke test before declaring the bootstrap done.** A scaffold that doesn't survive one real iter is broken; surface that before the user walks away expecting it to work overnight.
- **If the user has no real backlog, don't scaffold a fake one.** Run the interview (Phase 2). A loop with vague goals burns budget on bookkeeping iters.
- **Don't commit secrets or `.env` files.** Verify `.gitignore` covers them before the bootstrap commit.

## References

- `references/audit-checklist.md` — exact commands to run for the Phase 1 audit
- `references/grilling-guide.md` — how to use grill-me effectively for backlog extraction
- `references/plan-tier-defaults.md` — auto-loop budget defaults per Claude plan
- `references/permissions-template.md` — `.claude/settings.local.json` skeleton for denylist
- `references/backlog-format.md` — GOALS.md structure the loop expects

## Assets

- `assets/auto-loop.py` — the driver script (copy to `<repo>/scripts/`)
- `assets/templates/` — file templates for scaffold phase
