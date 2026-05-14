# CLAUDE.md

Repo-level instructions for Claude Code. Project: `{{PROJECT_NAME}}`. Tech stack: `{{TECH_STACK}}`.

## Canonical architecture

`ARCHITECTURE.md` at the repo root is the single source of truth for the build. Read the relevant section(s) before any non-trivial change.

## Dev server

{{DEV_SERVER_NOTES}}

If a dev server is part of the workflow: assume it's started by the user on port `{{DEV_SERVER_PORT}}`. Do NOT run `npm run dev`, `next dev`, or equivalent foreground server commands without explicit instruction.

## Autonomous build loop protocol

This repo runs a long-running autonomous build loop driven by `scripts/auto-loop.py`. Each iteration is ONE bounded `claude -p` invocation — a fresh session, no accumulated context. State persists on disk.

Use the `autonomous-build-loop` skill for the full per-iter protocol. Quick reference below.

### Inputs to read — by tier (not all every iter)

Each iteration is a fresh `claude -p` session; the prompt cache does not carry across
iters, so every iter pays cache-creation rate on its whole cold-boot read. Read by
tier — see the `autonomous-build-loop` skill's `read-manifest.md` for the rationale.

**Tier 1 — always, every iter (keep small):**

1. `CLAUDE.md` (this file) — protocol, conventions
2. `logs/latest.md` — the state file: phase, next features, files to open, open blocks, last-iter summary. This IS the carried-forward context.
3. `GOALS.md` — backlog with status

**Tier 2 — only when the trigger fires:**

- `ARCHITECTURE.md` — section-scoped, when the picked goal touches that subsystem (full read only at a phase boundary)
- `PLAN.md` — when phase/sequence is genuinely in question
- `logs/blocks.md` — when `latest.md`'s "Open blocks" line is non-empty
- `docs/*` — when touching that surface

**Tier 3 — never read back:** archived iter logs, `logs/summary-*.md`, `logs/archive/**`.

If any Tier-1 file is missing, create a stub in this iteration before doing anything else.

### Per-iteration loop

1. Read state (files above).
2. Review previous iteration (last log + wake-up note).
3. Pick 1–4 features from `GOALS.md` (Phase 2+ default: aim for 3–4 with ZERO pairwise schema/api/component overlap).
4. Suggest changes for next iter's approach (1–2 lines).
5. Execute (direct or via parallel Class B sub-agents — see `autonomous-build-loop` skill).
6. Mark goals `[done|wip|blocked]` in `GOALS.md`.
7. Write `logs/iter-NNN.md` (cap 40 lines normal, 50 fat-iter). Update `logs/latest.md`.
8. Write wake-up handoff at the bottom of the log.
9. Commit with `iter NNN: <one-line summary>`.
10. Push if push cadence triggers (default: 5 iters since last push OR ≥8 commits ahead).
11. Exit. **Do NOT call `ScheduleWakeup`** when `EXTERNAL_SCHEDULER=1` is in env — the auto-loop driver handles cadence.

### Continuous loop — no-halt semantics

The loop NEVER halts on a semantic event. Block / fail / user-decision events become structured entries in `logs/blocks.md` or `GOALS.md`, and the iter continues with the next non-conflicting item. The only legitimate stop is process-level (the auto-loop driver enforces budget; the agent itself just exits cleanly per iter).

### Fat-iter mode (Phase 2+ default)

Target 3–4 features per iter via parallel Class B sub-agents with disjoint file allowlists. Phase target: 3–5 iters per phase. Hard cap: 4 features per iter.

Every fat-iter that lands features MUST run a Class A peer-review sub-agent at the end. Phase boundaries MUST invoke the `Skill` tool with `skill: "improve-codebase-architecture"`.

See the `autonomous-build-loop` skill for the full protocol.

### Hard rules

- Always read this file at the start of every iteration.
- Never start a second iteration in the same turn.
- Never delete logs; archive them under `logs/archive/` after a decade rollup.
- Never run dev-server commands without explicit instruction.
- Never `git push --force`, `--amend` pushed commits, or `push --no-verify` without explicit `GOALS.md` authorization.
- The auto-loop driver runs with `EXTERNAL_SCHEDULER=1` — do not call `ScheduleWakeup` in that mode.
