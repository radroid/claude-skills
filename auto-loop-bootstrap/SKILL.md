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
| `GOALS.md` | Exists AND has at least 3 actionable items with `[ ]` / `[wip]` / `[blocked]` / `[done]` markers |
| `ARCHITECTURE.md` | Exists (content can be sparse — minimum: domain summary + key tech choices) |
| `PLAN.md` | Exists (content can be sparse — phase ordering) |
| `logs/` directory | Exists with `latest.md` + `blocks.md` stubs |
| `.loop/state.json` | Exists — machine state (`stage`, `iter`, `pr_mode`, `pr_size_policy`). Committed to git. |
| `scripts/auto-loop.py` | Present and executable |
| `.gitignore` | Contains `/.auto-loop/` and `/.loop/claims/` |
| Git repo | `git rev-parse HEAD` succeeds (i.e. at least one commit) |

Report the audit to the user as a checklist. Anything missing → flag as needing scaffold.

### Phase 2 — Extract requirements (only if GOALS.md missing or sparse)

**Skip entirely in greenfield-handoff mode** — idea-to-loop already produced GOALS.md.

If GOALS.md is missing OR has fewer than 3 actionable items, the loop has nothing to do on wake-up. Before scaffolding, run an interview to extract a real backlog.

**Invoke the `grill-me` skill** with a brief like: "Interview me to flesh out a build backlog for autonomous looping in this repo. We need 8–15 concrete, independently-shippable features ordered roughly by phase. Stress-test for: dependencies between features, MVP scope vs. nice-to-haves, what's already done vs. truly remaining, and any external blockers (API keys, design decisions, third-party signoffs)."

If `grill-me` isn't available, fall back to `superpowers:brainstorming` or run a manual Q&A loop covering: (1) what the project IS, (2) what's already built, (3) what the next 2–3 phases of features look like, (4) any external blockers. See `references/grilling-guide.md` for question banks.

The interview output becomes the seed for `GOALS.md` in Phase 4. Format per `references/backlog-format.md`.

> **PRD-grilling is a separate skill.** If the brownfield repo also lacks `docs/PRD.md` (or it's stub/sparse) and the user wants a written PRD as part of bootstrap, invoke `grill-to-prd` **before** this Phase 2 backlog grill. The PRD-grill writes `docs/PRD.md` via a persona-aware interview (Technical / Designer / Vibe); the backlog-grill (this Phase 2) writes `GOALS.md`. They produce different artifacts and can both run on the same repo. Order: PRD first (scope), then backlog (drain order).

### Phase 3 — Capture plan tier + budget preferences

Ask the user (only if not already known from session context):

- **Claude plan tier** — Max 20x / Max 5x / Pro / API pay-as-you-go. Determines budget defaults the auto-loop driver will enforce. See `references/plan-tier-defaults.md`.
- **Approximate phase target** — how many iters per phase / how aggressive cadence should be. Default: 3–5 iters per phase, 600s–3600s wake-up spacing.
- **Anything sensitive in the repo** — secrets, prod keys, files NOT to let the loop touch. Translates into `.claude/settings.local.json` denylist entries. See `references/permissions-template.md`.

### Phase 4 — Scaffold missing files

For each missing file, copy from `assets/templates/` into the repo and substitute placeholders. **Never clobber existing content** — if the file exists, leave it; only fill in gaps. For CLAUDE.md specifically: if it exists but lacks the protocol section, APPEND the section (do not rewrite the file).

In greenfield-handoff mode, `GOALS.md` / `ARCHITECTURE.md` / `PLAN.md` already exist from idea-to-loop — the never-clobber rule already protects them. For `.loop/state.json`, **rewrite** rather than skip: idea-to-loop wrote it at `"stage": "S2"`; this skill flips it to `"stage": "S3"` and fills in `pr_mode` + `pr_size_policy` + resets `iter` to 0. This rewrite is the atomic handoff documented in `idea-to-loop/SKILL.md`.

Templates to copy (with substitutions):

| Asset | Destination | Substitutions |
|-------|-------------|---------------|
| `assets/templates/CLAUDE.md` | `<repo>/CLAUDE.md` | `{{PROJECT_NAME}}`, `{{DEV_SERVER_PORT}}`, `{{TECH_STACK}}` |
| `assets/templates/GOALS.md` | `<repo>/GOALS.md` | Seeded from Phase 2 interview output |
| `assets/templates/ARCHITECTURE.md` | `<repo>/ARCHITECTURE.md` | One-paragraph stub if no architecture doc exists |
| `assets/templates/PLAN.md` | `<repo>/PLAN.md` | Phase list from Phase 2 |
| `assets/templates/logs/latest.md` | `<repo>/logs/latest.md` | iter-000 pointer |
| `assets/templates/logs/blocks.md` | `<repo>/logs/blocks.md` | empty header |
| `assets/templates/.loop/state.json` | `<repo>/.loop/state.json` | none — minimal starter (`stage: S3`, `iter: 0`, `pr_mode: true`, `pr_size_policy: fat`). M2 expands the schema. |
| `assets/auto-loop.py` | `<repo>/scripts/auto-loop.py` | `chmod 755` after copy |

### Phase 5 — Wire up `.gitignore` and settings

- Append `/.auto-loop/` and `/.loop/claims/` to `.gitignore` (create file if missing). Note: `.loop/state.json` itself **is** committed — only `.loop/claims/` (multi-loop atomic-claim ephemera) is ignored. Keep `.auto-loop/` (driver runtime) and `.loop/` (committed loop state) distinct.
- **ALWAYS write the baseline `.claude/settings.local.json`** per `references/permissions-template.md` — this is required, not optional. As of v0.1.2 the driver refuses to start if it's missing. Phase 3 collected ADDITIONS the user named; merge those entries into the baseline before writing.
- Before bootstrapping, REFUSE to proceed if `git status --porcelain` is non-empty — uncommitted WIP would get bundled into the iter-000 commit. Surface the dirty paths to the user and ask them to commit/stash first.

### Phase 6 — Initial commit

Stage and commit ONLY the scaffolded files. Use explicit per-file `git add` so unrelated WIP edits don't sneak in:

```
git add CLAUDE.md GOALS.md ARCHITECTURE.md PLAN.md logs/latest.md logs/blocks.md \
        .loop/state.json scripts/auto-loop.py .gitignore .claude/settings.local.json
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

Include stop conditions: Ctrl-C, `touch .auto-loop/stop`, GOALS.md backlog empty, `--max-iters` reached, or 3 consecutive failed iters.

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
