---
name: autonomous-build-loop
description: Use when the user wants Claude to keep building on its own across many sessions — "autonomous loop", "/loop", "keep building", "wake yourself up", "iter-NNN logs", "fat-iter"; or the project has iter-NNN.md logs, a GOALS.md backlog, .loop/state.json, or a CLAUDE.md autonomous-build-loop protocol section.
---

# Autonomous build loop

## Goal

Ship the backlog feature by feature across many self-scheduled iterations,
unattended. Each iteration is one bounded turn that reads state from disk, does
the work, verifies it, logs, commits, and schedules the next wake-up. The loop
runs in-session only — no external driver — and never halts on a semantic
event: blocks become log entries and the loop moves on.

## Where to start

Read `CLAUDE.md`, `.loop/state.json` (stage, iter, `pr_mode`, `base_branch`,
`backlog_source`), `logs/latest.md`, and the backlog source. On warm
same-session wake-ups, skim only what changed. Then pick the next work: up to
four backlog features with zero pairwise overlap (schema, API, component tree)
for a parallel "fat" iteration, or a single item when overlap, architecture
passes, or bookkeeping says so.

## Contracts

- **One iteration = one bounded turn**, ending with `ScheduleWakeup` (same
  prompt verbatim, or `<<autonomous-loop-dynamic>>`) or `CronCreate` for fixed
  cadence. Never a second iteration in the same turn; never a semantic halt.
- **Blocks never halt.** A block verdict, smoke failure, or user-decision
  blocker becomes a structured entry in `logs/blocks.md`; pick the next
  non-conflicting item and continue.
- **Logs:** `logs/iter-NNN.md` per iteration (≤50 lines), `logs/latest.md`
  pointer, plain human-readable English. Never delete logs — archive under
  `logs/archive/`. Commit as `iter NNN: <summary>`; push roughly every 5 iters
  or 8 commits ahead.
- **Two sub-agent classes:** Class A = review/analysis, read-only, returns a
  verdict; Class B = implementation, owns a disjoint file allowlist and stops
  if it needs a file outside it. Verdicts use the unified
  `APPROVE | REVISE | BLOCK` grammar.
- **Every feature-bearing iteration gets a peer review** — one Class A
  reviewer over the integrated diff and all scoping plans. Log the verdict to
  `logs/blocks.md` regardless of outcome.
- **Phase boundary → invoke the `improve-codebase-architecture` skill** as a
  real Skill call before the next phase's first feature iteration.
- **UI has no free signal.** Any user-visible change gets a screenshot and a
  critique against the design reference (`docs/screens/html/` when present)
  before commit — "it rendered" never closes a UI iteration.
- Default commit mode is direct-to-branch (`pr_mode: false`); per-feature
  branches + PRs are opt-in via `.loop/state.json`.
- Safety: no dev-server launches unless the project's CLAUDE.md authorizes it;
  no force-push, `--no-verify`, or amending pushed commits; harden scaffolded
  defaults (strict tsconfig, lint, parse-boundary validation) in a new
  project's first iteration.
- **Trust auto-compaction — never manage tokens.** Don't ration context, scope
  work down, or stretch cadence for token reasons; cadence is work-type-driven
  only.

Fan-out and review gates ship as canon-bound Workflow scripts in `assets/`
(fat-iter dispatch, peer review, perspective verify), built on the
`workflow-runtime` canon — read that skill before editing them. Without a
Workflow runner, run the same roles as sub-agents and verify each yourself;
verdicts and gates are identical.

## Your judgment

How to slice features, what to read on a given wake-up, cadence within reason
(implementation ~10 min, planning ~25 min), when to fat-iter versus go solo,
how to verify — decide from the state on disk. If the same decision deadlocks
for three iterations, name the two positions, flip a coin
(`echo $((RANDOM % 2))`), log the result, and never re-litigate.

## Resources

- `references/lifecycle-stages.md` — the canonical S0–S4 stage definitions
  shared with `idea-to-loop` and `auto-loop-bootstrap`.
- `assets/*.workflow.js` — the canon-bound fan-out and review gates.
