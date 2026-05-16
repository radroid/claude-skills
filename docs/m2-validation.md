# M2 — Greenfield Skill Validation (Dry-Run)

**Date:** 2026-05-16 · **Status:** complete (dry-run; no live testbed) · See [`ROADMAP.md`](../ROADMAP.md) M2, [`m1-retrospective.md`](./m1-retrospective.md) for the prior milestone.

## What was built

M2 created a **new third skill** (`idea-to-loop`) for the greenfield path — idea → PRD →
tech stack → runnable scaffold → handoff to the loop runtime. The existing two skills
stay scoped to their original roles. Eleven PRs landed:

| PR | What it shipped |
|---|---|
| #15 | `autonomous-build-loop/references/lifecycle-stages.md` (canonical Stage: defs) |
| #17 | `autonomous-build-loop/references/super-reviewer.md` (fresh-context Class A reviewer) |
| #18 | `idea-to-loop/SKILL.md` (new skill skeleton) |
| #19 | `idea-to-loop/references/s0-alignment-and-scope.md` |
| #20 | `idea-to-loop/references/s1-tech-stack-selection.md` |
| #21 | `idea-to-loop/references/s2-scaffold-and-wire.md` |
| #22 | `idea-to-loop/references/auto-research-mode.md` |
| #23 | `idea-to-loop/references/decision-log.md` |
| #24 | `idea-to-loop/assets/templates/` (state.json, decision-log.md, PRD.md) |
| #25 | README — `idea-to-loop` row, two-paths blurb, install + greenfield quick-start |
| #26 | `auto-loop-bootstrap` — greenfield-handoff auto-detection |

The repo now ships **three skills**: `idea-to-loop` (greenfield), `auto-loop-bootstrap`
(brownfield), `autonomous-build-loop` (loop runtime, S3+). All three share
`lifecycle-stages.md` and `super-reviewer.md` as cross-skill references.

## Trace-through — "habit tracker" hypothetical

A user with no code says: *"I have an idea for a personal habit tracker, run idea-to-loop to build it."*

| Stage | Trigger | Skills invoked | Artifacts produced | Exit |
|---|---|---|---|---|
| **S0** | `idea-to-loop` skill loads | `grill-with-docs` (skip — no docs), `grill-me`, `superpowers:brainstorming`, `to-prd`, `prototype` (mandatory) | `docs/PRD.md` (problem, target user, in/out-of-scope, success metric), `GOALS.md` seed, runnable prototype, `docs/decision-log.md` seeded | Human accepts scope; `.loop/state.json` → `checkpoints.scope-accepted: "passed"`, `stage_status: "complete"` |
| **S1** | Stage advances to `S1`; agent re-reads `s1-tech-stack-selection.md` | `to-issues` (PRD → vertical-slice issues → GOALS.md), `auto-research-mode` (3–5 parallel sub-agents per stack element: framework, persistence, auth…), `superpowers:writing-plans` | `ARCHITECTURE.md` (stack + data model + bottlenecks), `docs/research/*.md` per topic, `plans/*` for riskiest S2 slices | Super-reviewer vets the auto-delegated stack pick (`tech-stack-accepted: "auto-delegated"` → `"passed"`); stage advances |
| **S2** | Stage advances to `S2`; agent re-reads `s2-scaffold-and-wire.md` | `superpowers:using-git-worktrees` (parallel scaffolding), `superpowers:executing-plans`, per-integration `auto-research`, `superpowers:verification-before-completion` for runnable check; finally `Skill: auto-loop-bootstrap` | Bare-bones scaffold that runs, integrations wired, hardened config per [principle 10 in `autonomous-build-loop/SKILL.md`](../autonomous-build-loop/SKILL.md) (tsconfig strict, ESLint, persistence lifecycle, parse-boundary validation) | `auto-loop-bootstrap` detects the S2 signal in `.loop/state.json`, skips its Phase 2 grill + Phase 4 file substitutions, lays down loop machinery, rewrites state.json to `"stage": "S3"`, `"pr_mode": true`, `"pr_size_policy": "fat"` |
| **S3+** | Next iter wakes up against `autonomous-build-loop` | (out of `idea-to-loop` scope) | Feature PRs per `feature-pr-mode.md` | M1 behavior — proven on `t1-expense-tracker` (67 PRs, 6 phases, ~25h wall-clock) |

The trace is concrete enough that I caught gaps (see "Known gaps" below).

## Artifact validation

### State.json template parses

```
$ jq . idea-to-loop/assets/templates/.loop/state.json
{
  "stage": "S0",
  "stage_status": "in-progress",
  "iter": 0,
  "pr_mode": false,
  "checkpoints": {
    "scope-accepted": "pending"
  }
}
```

Valid JSON. Shape matches the schema in `autonomous-build-loop/references/lifecycle-stages.md`.

### Dist artifact unpacks

```
$ unzip -l dist/idea-to-loop.skill | tail -4
        0  05-16-2026 03:23   idea-to-loop/assets/templates/.loop/
      142  05-16-2026 03:23   idea-to-loop/assets/templates/.loop/state.json
---------                     -------
    21155                     15 files
```

15 files, 21 KB. SKILL.md + 5 references + 3 templates + directory entries. Clean.

### No stale `read-manifest` references

```
$ grep -rn "read-manifest" idea-to-loop/
(no output — clean)
```

PR #11's `read-manifest → tiered-read-strategy` rename held; nothing slipped into the new skill.

### Cross-skill references resolve

All four `autonomous-build-loop/references/*.md` files mentioned in `idea-to-loop/SKILL.md`
exist on disk: `continuous-loop.md`, `lifecycle-stages.md`, `super-reviewer.md`,
`tiered-read-strategy.md`. (Same-directory references in `references/` resolve to files
listed in the dist artifact above.)

### Handoff detection — round-trip

Empty directory (brownfield default):

```
$ test -f .loop/state.json && grep -q '"stage": *"S2"' .loop/state.json
(no output — correct, no handoff signal)
```

Same directory after planting the S2 template:

```
$ cp idea-to-loop/assets/templates/.loop/state.json .loop/ && sed -i 's/"S0"/"S2"/' .loop/state.json
$ test -f .loop/state.json && grep -q '"stage": *"S2"' .loop/state.json && echo "HANDOFF"
HANDOFF
```

PR #26's detection grep works in both directions.

## Known gaps / follow-ups

Surfaced by the trace-through. None are M2 blockers; all are reasonable next-iter work.

1. **`s2-scaffold-and-wire.md` carries a stale implementation note.** The reference still
   says *"Until the M2 `--from-stage S2` enhancement lands in `auto-loop-bootstrap`, the
   bootstrap runs in default mode…"* — PR #26 actually shipped **auto-detection** (no
   `--from-stage` flag needed), so the note is misleading. Trivial fix; one-line edit.
2. **Signal 2 heuristic is fragile.** PR #26's `wc -l ARCHITECTURE.md > 20` could
   false-positive on a long boilerplate template or false-negative on a terse but valid
   architecture doc. Future hardening: check for content beyond placeholder HTML comments
   (`grep -v '^<!--' | wc -l`) or look for an `## Tech stack` heading.
3. **Skill fallbacks not documented in `idea-to-loop`.** `auto-loop-bootstrap`
   documents what to do when `grill-me` isn't installed (fall back to
   `superpowers:brainstorming`, then manual). `idea-to-loop/references/s0-alignment-and-
   scope.md` mentions fallbacks generically but doesn't enumerate them per skill. M0
   vetted skill availability locally; portability across other machines needs the
   fallback table.
4. **No live end-to-end testbed yet.** This validation is dry-run only. A live run on a
   fresh empty repo through S0 → S1 → S2 → S3 is the next confidence step — the user
   said they'd kick that off separately when ready.

## What's next

- **Live testbed run** — user-driven, separate session. Bootstrap an empty repo, watch
  `idea-to-loop` run S0 → S1 → S2, verify the atomic handoff to `auto-loop-bootstrap` +
  `autonomous-build-loop` works end-to-end. Findings feed back into a small M2 patch PR
  if needed.
- **ROADMAP M3** — multi-loop / task queue. `logs/task-queue.md` + atomic claim via
  `mkdir .loop/claims/<id>/` + each worker in its own `git worktree`. Patterned on Matt
  Pocock's Sandcastle.
- **ROADMAP M-Tel** — Telegram visual-checkpoint bot (backlog; slot when S0–S2 needs
  it). Lets the human fire-and-forget on visual reviews.

## Regression guard

ARK (the production app the original autonomous-build-loop runs on) continues untouched —
no protocol files in `autonomous-build-loop/` were edited in a way that changes existing
behavior. M1 contract holds: ARK's loop keeps running.
