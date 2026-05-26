# CLAUDE.md

Repo-level instructions for Claude Code. Project: `{{PROJECT_NAME}}`. Tech stack: `{{TECH_STACK}}`.

## Canonical architecture

`ARCHITECTURE.md` at the repo root is the single source of truth. Read the relevant section(s) before any non-trivial change.

## Dev server

{{DEV_SERVER_NOTES}}

If a dev server is part of the workflow: assume the user starts it on port `{{DEV_SERVER_PORT}}`. Do NOT run `npm run dev`, `next dev`, or equivalent foreground server commands without explicit instruction.

## Autonomous build loop protocol

This repo runs a long-horizon autonomous build loop **in-session**. One Claude Code session ships features iteratively across many wake-ups; `ScheduleWakeup` carries the loop between iters. State lives on disk in `.loop/state.json` and `logs/`.

**Invoke the `autonomous-build-loop` skill** at the start of every iter — it carries the full per-iter procedure, fat-iter dispatch, peer-review, log hygiene, and PR-mode rules. This file is the repo-specific anchor.

### Tier 1 reads (every iter)

1. `CLAUDE.md` (this file)
2. `.loop/state.json` — machine state (`stage`, `iter`, `pr_mode`, `pr_size_policy`, `base_branch`, `backlog_source`)
3. `logs/latest.md` — handoff: next features, files to open, open blocks, last-iter summary
4. The **backlog source** named in `.loop/state.json` `backlog_source` (path `{{BACKLOG_PATH}}`, or GH/Linear if non-file)

### Tier 2 reads (on trigger)

- `ARCHITECTURE.md` (section-scoped) — when the goal touches that subsystem; full read only at a phase boundary
- `PLAN.md` — when phase/sequence is in question
- `logs/blocks.md` — when `latest.md`'s "Open blocks" is non-empty
- `docs/*` — when touching that surface

### Tier 3 — never read back

Archived iter logs, `logs/summary-*.md`, `logs/archive/**`. Everything next-iter needs is in `latest.md`'s handoff.

### Base branch + PR mode

- `.loop/state.json` `base_branch` names the integration branch for PRs. The skill's `feature-pr-mode.md` reads it.
- At the end of every iter, the agent calls `ScheduleWakeup` to continue the loop. The skill's per-iter procedure spells out cadence and how to stop.

### Hard rules

- Never start a second iteration in the same turn.
- Never delete logs; archive under `logs/archive/` after a decade rollup.
- Never run dev-server commands without explicit instruction.
- Never `git push --force`, `--amend` pushed commits, or `push --no-verify` without explicit backlog authorization.
- The loop NEVER halts on a semantic event — blocks/failures become entries in `logs/blocks.md` or the backlog; pick the next non-conflicting item.
