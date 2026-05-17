---
name: idea-to-loop
description: Take a product idea from zero to a running app on which the autonomous-build-loop can take over. Use for greenfield builds — phrases like "I have an idea for X, help me build it", "start a new product from scratch", "greenfield project", "/idea-to-loop", or when there is no existing codebase and the user wants to go from concept → PRD → tech stack → runnable scaffold → loop handoff. Runs three lifecycle stages (S0 Alignment & Scope, S1 System Design & Tech Stack, S2 Scaffold & Wire) ending by invoking `auto-loop-bootstrap` and handing off to `autonomous-build-loop`. For existing repos, use `auto-loop-bootstrap` directly instead — this skill is greenfield only.
---

# Idea-to-Loop

## Overview

Greenfield bootstrap. Stands a product up from an idea to a running scaffold, then hands off
to the autonomous build loop. Three stages, each with a human gate:

| Stage | What it produces | Human gate | Reference |
|---|---|---|---|
| S0 — Alignment & Scope | Scope/PRD doc + `GOALS.md` backlog + a runnable `prototype` | Heavy: scope is accepted before S1 starts | `references/s0-alignment-and-scope.md` |
| S1 — System Design & Tech Stack | `ARCHITECTURE.md` (stack + data model + bottlenecks) | Checkpoint: defaults to **auto** with super-reviewer vetting; human-override asked during planning | `references/s1-tech-stack-selection.md` |
| S2 — Scaffold & Wire | Bare-bones app that runs + integrations wired + loop machinery laid down | Light: API keys / accounts only | `references/s2-scaffold-and-wire.md` |

Stage definitions (canonical): `autonomous-build-loop/references/lifecycle-stages.md`.

## When to use this skill (not `auto-loop-bootstrap`)

| Situation | Skill |
|---|---|
| No code yet, idea only | **`idea-to-loop`** (this skill) |
| Existing repo with code, no loop machinery | `auto-loop-bootstrap` |
| Existing repo, loop machinery in place, want to drain backlog | `autonomous-build-loop` (the runtime) |

## Per-stage protocol

Each iter through this skill runs ONE bounded turn that ends by scheduling the next wake-up
(`ScheduleWakeup`) or exiting cleanly (external-scheduler mode). Same continuous-loop semantics
as `autonomous-build-loop` — read `autonomous-build-loop/references/continuous-loop.md`.

**Read `.loop/state.json` first.** `stage` tells you where you are.

- `Stage: "S0"` → read `references/s0-alignment-and-scope.md`
- `Stage: "S1"` → read `references/s1-tech-stack-selection.md`
- `Stage: "S2"` → read `references/s2-scaffold-and-wire.md`
- `Stage: "S3"` → **wrong skill** — invoke `autonomous-build-loop` instead

## S1 default behavior

S1 tech-stack selection defaults to `"auto"` — auto-research dispatches 3–5 Class A research
sub-agents, synthesizes a recommendation, and the **super-reviewer** vets it before commit
(see `autonomous-build-loop/references/super-reviewer.md`).

During S0 planning, ask the human if they want to override the default and gate S1 on
manual review instead. Record the choice in `.loop/state.json` →
`checkpoints.tech-stack-accepted: "passed" | "auto-delegated"`.

## S2 → S3 handoff

At the S2 exit gate (bare-bones app runs cleanly), invoke `auto-loop-bootstrap` via the
`Skill` tool to lay down loop machinery (`CLAUDE.md`, `GOALS.md` mirror, `logs/` skeleton,
`auto-loop.py` if external-driver path is wanted, **and `.loop/state.json` written with
`"stage": "S3"`**).

```
Skill: auto-loop-bootstrap
```

The handoff is atomic — `auto-loop-bootstrap` writes the final `Stage: "S3"` itself, so the
next iter wakes up against the loop runtime. No separate flip step.

> Implementation note (tracked for the M2 `auto-loop-bootstrap` light touch): the bootstrap
> skill must accept an optional `--from-stage S2` invocation that knows to mirror
> `idea-to-loop`'s in-progress `GOALS.md` / `ARCHITECTURE.md` rather than re-running its
> own grilling pass. Until that lands, the greenfield path runs `auto-loop-bootstrap` in its
> default mode and accepts a one-iter overlap.

## Hard rules

- Never skip a stage. Greenfield path is strictly S0 → S1 → S2 → S3.
- Never roll back a stage. A scope regression blocks the iter via `logs/blocks.md` and
  surfaces for human resolution.
- S2 exit gate is **the app actually runs.** Not "should run" — verified, evidence-based.
  Per `superpowers:verification-before-completion`.
- Keep `.loop/state.json` Tier-1 (read every iter; see
  `autonomous-build-loop/references/tiered-read-strategy.md`).
- S0 always ends with a `prototype` skill invocation — runnable artifact, not a paper PRD.

## Resources

- `references/s0-alignment-and-scope.md` — grill / brainstorm / PRD / prototype workflow
- `references/s1-tech-stack-selection.md` — auto-research-driven stack pick + accept gate
- `references/s2-scaffold-and-wire.md` — scaffold + runnable-app exit gate + handoff
- `references/auto-research-mode.md` — multi-agent research pattern used in S1 / S2
- `references/decision-log.md` — append-only judgment-call log workflow

Cross-skill:

- `autonomous-build-loop/references/lifecycle-stages.md` — canonical Stage: defs
- `autonomous-build-loop/references/super-reviewer.md` — vets auto-delegated S1 decisions
- `autonomous-build-loop/references/continuous-loop.md` — no-halt iter semantics
