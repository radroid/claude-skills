---
name: loop-supervisor
description: Read-only oversight agent that runs in a parallel Claude Code window alongside the autonomous build loop. Reads the codebase + iter logs + backlog source, and curates the backlog (re-orders, splits, marks blocked, adds discovered tasks). Never writes production code. Use when the user wants to "supervise the loop", "watch the build", "curate the TODO list", "review what the loop is doing", "manage the backlog while it builds", or pairs `autonomous-build-loop` with oversight. Triggered by phrases like "loop supervisor", "watch the loop", "TODO curator", "task manager", "loop overseer", or `/supervise`. Runs in its own window with its own cadence; does not invoke or schedule the implementation loop.
---

# Loop Supervisor

## Overview

The implementation loop (`autonomous-build-loop`) builds features. The supervisor watches it build and steers the backlog. Two windows, two cadences, one shared state.

**Role:** read-only review of code + iter logs, write-only authority on the **backlog source** (the file or external system named in `.loop/state.json` `backlog_source`) and supervisor's own logs.

**Hard rule:** the supervisor NEVER writes production code. No edits under `src/`, `app/`, `lib/`, `internal/`, equivalent. Edit-authority is restricted to:

- The backlog source (file path, GH issues, Linear) — re-order, split, mark blocked, add discovered items
- `logs/supervisor/iter-NNN.md` — its own review log
- `logs/blocks.md` — only to surface a serious problem the impl agent hasn't noticed

If the supervisor finds itself wanting to write code, that's a backlog item, not a fix.

## When to use

Run the supervisor in a SECOND Claude Code window on the same repo, after the implementation loop is running. Both share the same git checkout and `.loop/state.json`.

- One window: the `autonomous-build-loop` skill, in-session (self-paced or `/loop`)
- Other window: this skill on a `/loop 15m /supervise` cadence (or `ScheduleWakeup` self-pacing)

The supervisor's cadence is independent. A typical interval is 10–30 minutes — long enough that a fresh impl iter has likely landed, short enough to keep the backlog responsive.

## Per-supervisor-iter procedure

Run this top-to-bottom every wake-up. One bounded turn → `ScheduleWakeup` to continue, or exit if running one-shot.

### 1. Read state — by tier

The supervisor's tiered read overlaps with the impl agent's but is narrower (no fat-iter dispatch, no feature picking):

**Tier 1 (always):**

- `.loop/state.json` — stage, iter, base_branch, backlog_source
- `logs/latest.md` — what the last impl iter said it did
- `logs/supervisor/latest.md` — what THIS supervisor last said (handoff to itself)
- The **backlog source** named in `.loop/state.json` `backlog_source`
- `git log --oneline -20` on the base branch — what actually shipped since last supervisor iter

**Tier 2 (on trigger):**

- `logs/iter-NNN.md` for the last 1–2 impl iters (when the impl agent's `latest.md` summary leaves a gap)
- `logs/blocks.md` (when impl iters mention blocks)
- A handful of files actually touched by recent commits (`git diff <last-supervisor-head>..HEAD --stat` → spot-check the largest changes)
- `ARCHITECTURE.md` section (only when the supervisor suspects a backlog item drifts from architecture)

**Tier 3 (never):** archived iter logs.

**Cold-boot iter only** (first iter of the session OR first iter after auto-compaction): after the Tier 1 reads, invoke `Skill: caveman` once. This compresses model-to-model narration (in-iter prose between tool calls) for the rest of the session — warm iters retain the style. **Carve-out:** the backlog source, `logs/supervisor/iter-NNN.md`, and `logs/blocks.md` entries are all human-read — NEVER caveman. Caveman the agent's reasoning prose, not the artifacts.

### 2. Reconcile: what shipped vs. what was claimed

Compare `logs/iter-NNN.md` "Features landed" against the backlog source. Discrepancies to flag:

- Items the impl agent marked `[done]` but no commit / no diff supports it → re-open with `[wip]` + supervisor note
- Items shipped but not in the backlog → add them retroactively for audit trail
- `[wip]` items stuck for 3+ iters without movement → mark `[blocked]` with the apparent cause

See `references/reconciliation.md` for the discipline.

### 3. Curate the backlog

This is the supervisor's main writeable output. See `references/backlog-curation.md` for what counts as curation vs. meddling.

Legitimate curations:
- **Re-order** items based on what the impl agent is learning (dependencies surfaced, blockers cleared)
- **Split** oversized items into multiple shippable slices
- **Add** discovered items the impl agent surfaced in logs but didn't promote to the backlog
- **Mark blocked** items waiting on user decision / external dep
- **De-duplicate** items that converged

Out of scope (do NOT do):
- Don't rewrite item descriptions to a different scope without surfacing the change
- Don't delete items the impl agent left `[ ]` — re-order or split instead
- Don't add new phases without architectural justification (and log the reasoning)

### 4. Surface serious issues

Read `references/escalation.md`. If the supervisor spots:

- A regression the impl agent missed (test was deleted, a `[done]` feature actually broke an earlier one)
- Architectural drift (a `[done]` item violates `ARCHITECTURE.md`)
- A recurring fail pattern (3 iters chasing the same shape of bug)

→ Append one entry to `logs/blocks.md` with `**Source:** supervisor` so the next impl iter sees it on its Tier-2 read. Do NOT edit code to fix.

### 5. Write supervisor log

Path: `logs/supervisor/iter-NNN.md` (separate iter counter from the impl loop). Cap **30 lines**. Format: `references/log-format.md`. Update `logs/supervisor/latest.md` to point at the new log.

### 6. End turn

- Default: call `ScheduleWakeup` with the same prompt verbatim (or `<<autonomous-loop-dynamic>>` for the autonomous variant) to continue the supervision loop. Cadence is typically 15 minutes.
- If running one-shot → exit. The user can re-invoke when desired.

Never start a second supervisor iter in the same turn.

## Hard rules

- **Read-only on code.** No `Edit` / `Write` / `NotebookEdit` against any path under typical source roots (`src/`, `app/`, `lib/`, `internal/`, or equivalent). If a denylist is wired up in `.claude/settings.local.json` for this window, the harness enforces it.
- **Backlog, supervisor logs, and `logs/blocks.md` (escalations only) are the only writeable surfaces.** That's the line.
- **Never invoke or schedule the implementation loop.** The supervisor and the impl agent share state on disk; they don't call each other. The supervisor only schedules ITSELF via `ScheduleWakeup`.
- **Never delete impl agent's logs.** Even bad iter logs are evidence; archive (don't delete) at decade rollups.
- **Never resolve impl-agent decisions for it.** If the impl agent is stuck on a coin-toss-able A vs. B, log a recommendation to `logs/blocks.md` with `**Recommendation:** A — <reason>`. Let the impl agent's tiebreaker rule decide.
- **Never write code "just this once."** That's how the supervisor becomes a second impl agent. Anything urgent goes into the backlog with `**URGENT**` prefix.

## Cross-skill: setting up the second window

In the user's second Claude Code window:

1. `cd` to the same repo as the impl loop
2. Optionally tighten the denylist for THIS window — add `Edit(src/**)`, `Write(src/**)`, etc. — to enforce read-only at the harness layer
3. Invoke this skill or run `/loop 15m /supervise`

The impl loop and supervisor must not write the same file in the same iter. The backlog source is the only shared writeable; impl writes `[done]` / `[wip]` markers and the supervisor writes structural curation. A merge race shows up as a git conflict on the backlog file — resolve by re-reading both intentions.

## References

- `references/reconciliation.md` — comparing shipped diff to claimed backlog
- `references/backlog-curation.md` — what counts as curation vs. meddling
- `references/escalation.md` — when to write to `logs/blocks.md`
- `references/log-format.md` — supervisor iter log structure

## Assets

- `assets/templates/supervisor-log.md` — first-iter template
