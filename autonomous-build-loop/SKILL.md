---
name: autonomous-build-loop
description: Run a long-horizon autonomous build loop that ships features iteratively across many sessions. Use when the user wants Claude to keep building on its own — phrases like "autonomous loop", "/loop", "/auto", "keep building", "wake yourself up", "self-pace iterations", "iter-NNN logs", "fat-iter mode", "scheduled iteration"; or when the project has an `iter-NNN.md` log directory, a `GOALS.md` backlog, a `ScheduleWakeup`/cron resume contract, or a CLAUDE.md "autonomous build loop protocol" section. Provides per-iteration checklist, fat-iter parallel-dispatch protocol, Class A/B sub-agent discipline, peer-review triggers, phase-boundary arch passes, token-runway management, log hygiene, and continuous-loop (no-halt) semantics.
---

# Autonomous Build Loop

## Overview

This skill codifies the patterns that keep a long-horizon autonomous build loop healthy: one bounded turn per iteration, scheduled wake-ups in between, parallel sub-agent dispatch when work is independent, and structured logs the user can review at their own pace. The loop NEVER halts on a semantic event — blocks, failures, and user-decision-needed all become log entries while the next iteration is scheduled.

Read `references/per-iteration-checklist.md` at the start of every iteration. Use `references/fat-iter-mode.md` when picking 2+ features. Use `references/sub-agent-protocol.md` when dispatching sub-agents. Use `references/log-hygiene.md` when writing the iter log + handoff. Use `references/continuous-loop.md` when something would normally halt the loop.

## Core principles

1. **One iteration = one bounded turn.** End by scheduling the next wake-up via `ScheduleWakeup` (dynamic /loop) or the project's equivalent. Never start a second iteration in the same turn.

2. **Read state before acting.** Every iter starts by reading: project-root `CLAUDE.md`, `GOALS.md`, `ARCHITECTURE.md` (section-scoped, not full re-read per iter), `logs/latest.md` (includes prior wake-up handoff), `logs/blocks.md`, `PLAN.md`. Missing files → create stubs in the current iter before doing other work.

3. **Continuous loop, never halt.** A sub-agent `block` verdict, a smoke failure, a user-decision blocker, a contract-drift signal — all become a structured entry in `logs/blocks.md` or `GOALS.md`, then the agent picks the next non-conflicting item and proceeds. The only legitimate halt is process-level (token-runway → schedule a longer wake-up).

4. **Fat-iter by default in implementation phases.** Target 3–4 FULL features per iter using parallel Class B sub-agents with disjoint file allowlists. Phase target: 3–5 iters. Hard cap: 4 features per iter — beyond that integration risk grows non-linearly.

5. **Two sub-agent classes, different write authority.** Class A = review/analysis, READ-ONLY, returns verdict text only. Class B = implementation, write-authorized, owns a disjoint file allowlist, must STOP if a file outside the list needs editing.

6. **Peer-review every feature-bearing iter.** One Class A reviewer per fat-iter (not one-per-feature — a single reviewer reads all scoping plans + the integrated diff for coherence). Log to `logs/blocks.md` regardless of verdict.

7. **Phase boundary = mandatory arch-pass.** Invoke the `Skill` tool with `skill: "improve-codebase-architecture"`. This is a real tool call, not a concept — reading the doc and doing manual refactors is NOT compliance. Log result to `logs/blocks.md` with `**Source:** arch-pass`.

8. **Token-runway awareness.** Eyeball remaining context budget at end of iter. Approaching limits → slow the next wake-up (1800s–3600s instead of 600s) and note the slowdown in the iter log. Better to space than compact mid-build. If runway is critical (>80% used), the iter log should explicitly recommend user restart Claude Code — the loop resumes from the next `ScheduleWakeup` after relaunch.

## Quick-start: starting an iteration

1. Read `references/per-iteration-checklist.md` — the 13-step procedure.
2. Pick 1–4 features from `GOALS.md` (verify pairwise independence — schema, api, component tree must have ZERO overlap to bundle).
3. If 2+ features → fat-iter dispatch (read `references/fat-iter-mode.md`).
4. If 1 feature or non-feature work → single-agent or direct implementation.
5. Integrate + verify (tsc, tests, contracts check, smoke).
6. Class A peer-review if feature-bearing.
7. Write `logs/iter-NNN.md` (cap 50 lines fat-iter / 40 lines otherwise — see `references/log-hygiene.md`).
8. Commit `iter NNN: <one-line summary>`.
9. Push if push cadence triggers (default: 5 iters since last push OR ≥8 commits ahead).
10. `ScheduleWakeup` for next iter (default: 600s impl, 1500s plan, 1800s+ if token-runway tight).

## When NOT to fat-iter

- **Phase-boundary architecture pass** — one-shot refactor; parallel impl doesn't help.
- **Bookkeeping iters** — decade rollups (every 10 iters), GOALS.md restructure, log archival.
- **User-decision-blocked items** — no work CAN advance; skip the iter via `ScheduleWakeup` at a longer interval.
- **Carry-forward tail** — at the end of a phase when only single-file nits remain, ship them solo. The fat-iter overhead exceeds the diff size.

## Hard rules

- Always read `CLAUDE.md` first if it exists at the project root.
- Never start a second iteration in the same turn.
- Never delete logs; archive them under `logs/archive/` after a decade rollup.
- End every iteration by scheduling the next. Always. No semantic halt.
- A sub-agent `block` verdict → log to `logs/blocks.md`, pick next non-conflicting `GOALS.md` item, continue. Do NOT write a halt-marker file.
- Never run dev-server commands unless the project's CLAUDE.md authorizes it (typically the dev server is user-managed).
- Never update git config without explicit `GOALS.md` authorization.
- Never `push --no-verify`, `--force`, or amend pushed commits without explicit authorization.
- Phase boundary → MUST invoke `Skill` tool `skill: "improve-codebase-architecture"` (an actual tool call) before the next phase's first feature iter.

## Tiebreaker — coin-toss rule

If the same `issue-id` is raised across 3 consecutive iterations without resolution:

1. Name the two competing positions concisely (A and B).
2. `echo $((RANDOM % 2))` — 0 = A, 1 = B.
3. Log toss result + chosen position under "Decisions" in the iter log.
4. Adopt the chosen position. Mark resolved in `GOALS.md`. Reset counter.
5. Do NOT re-litigate. Sub-agents who keep raising it must be told the call has been made.

## Resources

- `references/per-iteration-checklist.md` — the 13-step per-iter procedure.
- `references/fat-iter-mode.md` — parallel feature dispatch protocol with disjoint allowlists.
- `references/sub-agent-protocol.md` — Class A vs Class B charters, prompt boilerplate.
- `references/log-hygiene.md` — iter log format, growth control, archive cadence.
- `references/continuous-loop.md` — block / fail / user-decision routing without halting.
- `references/peer-review-triggers.md` — when peer-review fires + charter template.
