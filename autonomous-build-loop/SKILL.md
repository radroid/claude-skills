---
name: autonomous-build-loop
description: Autonomous build loop — ship the backlog unattended, one bounded iteration per wake-up. Use when the user asks to keep building on its own ("/loop"), or the repo already has `.loop/state.json` or `logs/iter-NNN.md`.
---

# Autonomous build loop

## Goal

Ship the backlog feature by feature across many self-scheduled iterations,
unattended. Each iteration is one bounded turn that reads state from disk, does
the work, verifies it, logs, commits, and schedules the next wake-up. The loop
runs in-session, driving itself from one wake-up to the next: a block becomes a
log entry and the loop moves on.

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
  cadence. The next iteration starts on the next wake-up, in a fresh turn.
- **Blocks keep the loop moving.** A block verdict, smoke failure, or
  user-decision blocker becomes a structured entry in `logs/blocks.md`; pick
  the next non-conflicting item and continue.
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
- **Phase boundary → an architecture pass** before the next phase's first
  feature iteration: invoke `codebase-design` (a real Skill call) for the
  deep-module vocabulary, then run the deepening survey yourself against it —
  walk this phase's new and changed modules, name the shallow ones and the
  leaked seams, and log each candidate to the backlog and to `logs/blocks.md`
  with `**Source:** arch-pass`. If `codebase-design` is not installed, survey
  against the criterion directly: an interface much simpler than the
  implementation it hides, and a seam a test can drive without the rest of the
  system.
- **UI has no free signal.** Any user-visible change gets a screenshot and a
  critique against the design reference (`docs/screens/html/` when present)
  before commit.
- Default commit mode is direct-to-branch (`pr_mode: false`); per-feature
  branches + PRs are opt-in via `.loop/state.json`.
- Safety: launch a dev server only where the project's CLAUDE.md authorizes
  it; no force-push, `--no-verify`, or amending pushed commits; harden
  scaffolded defaults (strict tsconfig, lint, parse-boundary validation) in a
  new project's first iteration.
- **Trust auto-compaction.** Scope each iteration by the work in front of you
  and set cadence by work type; the harness handles context.

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
(`echo $((RANDOM % 2))`), log the result, and treat it as settled.

## Resources

- `references/lifecycle-stages.md` — the canonical S0–S4 stage definitions
  shared with `idea-to-loop` and `auto-loop-bootstrap`.
- `assets/*.workflow.js` — the canon-bound fan-out and review gates.
