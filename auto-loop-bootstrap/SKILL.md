---
name: auto-loop-bootstrap
description: Bootstrap a repo for autonomous build looping — scaffolds CLAUDE.md, GOALS.md, ARCHITECTURE.md, PLAN.md, logs/, and drops in the auto-loop driver script. Use when the user wants to "set up the autonomous loop", "bootstrap auto-loop", "prepare this repo for autonomous building", "make this repo loopable", "scaffold the build loop", or "set up self-driving build" on a repo that doesn't yet have the loop protocol files. If GOALS.md is missing or empty, invokes the grill-me skill first to interview the user and extract a concrete backlog. Idempotent — preserves existing content. Pairs with autonomous-build-loop (runs one iter) which the driver script then invokes per fresh Claude Code session.
---

# Auto Loop Bootstrap

## Overview

Prepare a repo so the autonomous build loop can run. The output is a self-driving setup: the user runs `python3 scripts/auto-loop.py` and walks away — each iter spawns a fresh `claude -p` invocation, reads state from disk, ships features, commits, exits. No `ScheduleWakeup`, no token-runway exhaustion.

Pairs with the `autonomous-build-loop` skill (which defines per-iter behavior). This skill sets up the static files; the other skill defines the runtime protocol.

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
| `scripts/auto-loop.py` | Present and executable |
| `.gitignore` | Contains `/.auto-loop/` |
| Git repo | `git rev-parse HEAD` succeeds (i.e. at least one commit) |

Report the audit to the user as a checklist. Anything missing → flag as needing scaffold.

### Phase 2 — Extract requirements (only if GOALS.md missing or sparse)

If GOALS.md is missing OR has fewer than 3 actionable items, the loop has nothing to do on wake-up. Before scaffolding, run an interview to extract a real backlog.

**Invoke the `grill-me` skill** with a brief like: "Interview me to flesh out a build backlog for autonomous looping in this repo. We need 8–15 concrete, independently-shippable features ordered roughly by phase. Stress-test for: dependencies between features, MVP scope vs. nice-to-haves, what's already done vs. truly remaining, and any external blockers (API keys, design decisions, third-party signoffs)."

If `grill-me` isn't available, fall back to `superpowers:brainstorming` or run a manual Q&A loop covering: (1) what the project IS, (2) what's already built, (3) what the next 2–3 phases of features look like, (4) any external blockers. See `references/grilling-guide.md` for question banks.

The interview output becomes the seed for `GOALS.md` in Phase 4. Format per `references/backlog-format.md`.

### Phase 3 — Capture plan tier + budget preferences

Ask the user (only if not already known from session context):

- **Claude plan tier** — Max 20x / Max 5x / Pro / API pay-as-you-go. Determines budget defaults the auto-loop driver will enforce. See `references/plan-tier-defaults.md`.
- **Approximate phase target** — how many iters per phase / how aggressive cadence should be. Default: 3–5 iters per phase, 600s–3600s wake-up spacing.
- **Anything sensitive in the repo** — secrets, prod keys, files NOT to let the loop touch. Translates into `.claude/settings.local.json` denylist entries. See `references/permissions-template.md`.

### Phase 4 — Scaffold missing files

For each missing file, copy from `assets/templates/` into the repo and substitute placeholders. **Never clobber existing content** — if the file exists, leave it; only fill in gaps. For CLAUDE.md specifically: if it exists but lacks the protocol section, APPEND the section (do not rewrite the file).

Templates to copy (with substitutions):

| Asset | Destination | Substitutions |
|-------|-------------|---------------|
| `assets/templates/CLAUDE.md` | `<repo>/CLAUDE.md` | `{{PROJECT_NAME}}`, `{{DEV_SERVER_PORT}}`, `{{TECH_STACK}}` |
| `assets/templates/GOALS.md` | `<repo>/GOALS.md` | Seeded from Phase 2 interview output |
| `assets/templates/ARCHITECTURE.md` | `<repo>/ARCHITECTURE.md` | One-paragraph stub if no architecture doc exists |
| `assets/templates/PLAN.md` | `<repo>/PLAN.md` | Phase list from Phase 2 |
| `assets/templates/logs/latest.md` | `<repo>/logs/latest.md` | iter-000 pointer |
| `assets/templates/logs/blocks.md` | `<repo>/logs/blocks.md` | empty header |
| `assets/auto-loop.py` | `<repo>/scripts/auto-loop.py` | `chmod 755` after copy |

### Phase 5 — Wire up `.gitignore` and settings

- Append `/.auto-loop/` to `.gitignore` (create file if missing).
- If the user flagged sensitive paths in Phase 3, write `.claude/settings.local.json` per `references/permissions-template.md`.

### Phase 6 — Initial commit

Stage and commit the scaffolded files in ONE commit:

```
git add CLAUDE.md GOALS.md ARCHITECTURE.md PLAN.md logs/ scripts/auto-loop.py .gitignore
git commit -m "iter 000: bootstrap autonomous build loop"
```

This commit is the loop's seed. `iter-000.md` doesn't exist yet — the first auto-loop iter will write `iter-001.md`.

### Phase 7 — Smoke-test with one dry-run iter

**Do not start the full loop yet.** Run ONE iter to verify plumbing:

```bash
python3 scripts/auto-loop.py --max-iters 1 --max-budget-usd-per-iter 2
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
