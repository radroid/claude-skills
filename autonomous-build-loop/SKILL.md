---
name: autonomous-build-loop
description: Run a long-horizon autonomous build loop that ships features iteratively across many sessions. Use when the user wants Claude to keep building on its own — phrases like "autonomous loop", "/loop", "/auto", "keep building", "wake yourself up", "self-pace iterations", "iter-NNN logs", "fat-iter mode", "scheduled iteration"; or when the project has an `iter-NNN.md` log directory, a `GOALS.md` backlog, a `ScheduleWakeup`/cron resume contract, or a CLAUDE.md "autonomous build loop protocol" section. Provides per-iteration checklist, fat-iter parallel-dispatch protocol, Class A/B sub-agent discipline, peer-review triggers, phase-boundary arch passes, log hygiene, and continuous-loop (no-halt) semantics.
---

# Autonomous Build Loop

## Overview

This skill codifies the patterns that keep a long-horizon autonomous build loop healthy: one bounded turn per iteration, scheduled wake-ups in between, parallel sub-agent dispatch when work is independent, and structured logs the user can review at their own pace. The loop NEVER halts on a semantic event — blocks, failures, and user-decision-needed all become log entries while the next iteration is scheduled.

Read `references/per-iteration-checklist.md` at the start of every iteration. Use `references/tiered-read-strategy.md` to decide what to read on wake-up (tiered — not every file every iter). Use `references/fat-iter-mode.md` when picking 2+ features. Use `references/feature-pr-mode.md` when `.loop/state.json` has `pr_mode: true` (branch + PR per feature instead of commit-to-one-branch). Use `references/sub-agent-protocol.md` when dispatching sub-agents. Use `references/log-hygiene.md` when writing the iter log + handoff. Use `references/continuous-loop.md` when something would normally halt the loop.

## Two operating modes

This skill supports two scheduler modes. **Check which mode applies BEFORE step 13 of any iter.**

| Mode | Trigger | Step 13 behavior |
|------|---------|------------------|
| **In-session loop** | Interactive Claude Code session; `ScheduleWakeup` tool is registered. | Call `ScheduleWakeup` to schedule the next iter. |
| **External scheduler** | Env var `EXTERNAL_SCHEDULER=1` is set (driven by `scripts/auto-loop.py` or equivalent); session started via `claude -p`. | Do NOT call `ScheduleWakeup`. External driver handles cadence — exit cleanly after commit. `ScheduleWakeup` is not registered as a tool in `claude -p` sessions; any call to it will fail. |

Every mention of `ScheduleWakeup` below is conditional on in-session mode. In external-scheduler mode, replace "schedule wake-up" with "exit cleanly."

## Core principles

1. **One iteration = one bounded turn.** End by scheduling the next wake-up via `ScheduleWakeup` (in-session mode) OR by exiting cleanly (external-scheduler mode). Never start a second iteration in the same turn.

2. **Read state by tier, not by habit.** Each iter is a fresh session — the prompt cache does NOT carry across iters, so every iter pays cache-creation rate on its whole cold-boot read. Read the tiered strategy (`references/tiered-read-strategy.md`): **Tier 1 always** (`CLAUDE.md`, `logs/latest.md`, `GOALS.md`), **Tier 2 on trigger** (`ARCHITECTURE.md` section, `PLAN.md`, `docs/*`, `logs/blocks.md`), **Tier 3 never read back** (archived iter logs + summaries). Missing Tier-1 file → create a stub before doing other work.

3. **Continuous loop, never halt.** A sub-agent `block` verdict, a smoke failure, a user-decision blocker, a contract-drift signal — all become a structured entry in `logs/blocks.md` or `GOALS.md`, then the agent picks the next non-conflicting item and proceeds. There is no halt: in-session mode keeps running across auto-compaction boundaries; external-scheduler mode runs each iter as a fresh process.

4. **Fat-iter by default in implementation phases.** Target 3–4 FULL features per iter using parallel Class B sub-agents with disjoint file allowlists. Phase target: 3–5 iters. Hard cap: 4 features per iter — beyond that integration risk grows non-linearly.

5. **Two sub-agent classes, different write authority.** Class A = review/analysis, READ-ONLY, returns verdict text only. Class B = implementation, write-authorized, owns a disjoint file allowlist, must STOP if a file outside the list needs editing.

6. **Peer-review every feature-bearing iter.** One Class A reviewer per fat-iter (not one-per-feature — a single reviewer reads all scoping plans + the integrated diff for coherence). Log to `logs/blocks.md` regardless of verdict.

7. **Phase boundary = mandatory arch-pass.** Invoke the `Skill` tool with `skill: "improve-codebase-architecture"`. This is a real tool call, not a concept — reading the doc and doing manual refactors is NOT compliance. Log result to `logs/blocks.md` with `**Source:** arch-pass`.

8. **Trust auto-compaction — do not manage tokens.** In-session mode runs on a large-context model with harness auto-compaction (configured to compact around 50% of the context window). The loop is designed to survive compaction: `logs/latest.md` + the tiered read manifest make every iter self-contained, so a mid-loop compaction is safe and expected. Do NOT eyeball context budget, do NOT scope work down, do NOT space out wake-ups, and do NOT recommend the user restart Claude Code for token reasons — context is not a scarce runway to ration. Wake-up cadence is driven by work type only (impl vs. plan), never by context usage. In external-scheduler mode each iter is already a fresh `claude -p` process, so context never accumulates either.

9. **Frontend has no free signal.** TDD gets a binary pass/fail in-context — the loop knows instantly whether it succeeded. UI quality has no such signal. Any iter touching user-visible UI must MANUFACTURE one: screenshot via chrome-MCP + a forced critique pass against the design reference (mobile viewport, ≥44px touch targets, hierarchy, AA contrast) before commit. Never close a UI iter on "it rendered." Design-sensitive surface → dispatch a Class A `design-review` sub-agent instead of self-critiquing. See `references/fat-iter-mode.md` Phase 3.

10. **Scaffolded defaults are not safe defaults.** In the first iter of any new project, audit framework-generated config (`tsconfig` strict flags, ESLint rules, persistence-layer connection lifecycle, parse-boundary validation) and harden it before building features. Modern scaffolders (`npm create vite`, `create-next-app`, etc.) ship intentionally minimal defaults that lag the community's best-practice posture — e.g. Vite's current React+TS template does not enable `tsconfig "strict": true`, IndexedDB tutorials show per-op `open()`+`close()` instead of a cached singleton-promise, and JSON-parse boundaries habitually `as unknown as T` without entity validation. Downstream code inherits every gap silently. When in doubt about the canonical posture for a stack, web-research it before locking the config in.

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
10. **In-session mode:** `ScheduleWakeup` for next iter (default: 600s impl, 1500s plan — cadence is work-type-driven, never adjusted for context usage). **External-scheduler mode (`EXTERNAL_SCHEDULER=1`):** exit cleanly — driver handles cadence.

## When NOT to fat-iter

- **Phase-boundary architecture pass** — one-shot refactor; parallel impl doesn't help.
- **Bookkeeping iters** — decade rollups (every 10 iters), GOALS.md restructure, log archival.
- **User-decision-blocked items** — no work CAN advance; skip the iter via `ScheduleWakeup` at a longer interval.
- **Carry-forward tail** — at the end of a phase when only single-file nits remain, ship them solo. The fat-iter overhead exceeds the diff size.

## Hard rules

- Always read `CLAUDE.md` first if it exists at the project root.
- Never start a second iteration in the same turn.
- Never delete logs; archive them under `logs/archive/` after a decade rollup.
- End every iteration by scheduling the next (in-session) OR exiting cleanly (external-scheduler). Always. No semantic halt.
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
- `references/tiered-read-strategy.md` — tiered context-loading rules; what to read every iter vs. on-trigger vs. never.
- `references/fat-iter-mode.md` — parallel feature dispatch protocol with disjoint allowlists.
- `references/feature-pr-mode.md` — branch + PR + review + auto-merge per feature, gated by `.loop/state.json` `pr_mode`.
- `references/sub-agent-protocol.md` — Class A vs Class B charters, prompt boilerplate.
- `references/log-hygiene.md` — iter log format, growth control, archive cadence.
- `references/continuous-loop.md` — block / fail / user-decision routing without halting.
- `references/peer-review-triggers.md` — when peer-review fires + charter template.
