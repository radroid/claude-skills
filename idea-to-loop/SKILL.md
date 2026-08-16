---
name: idea-to-loop
description: "Greenfield build: idea → PRD → stack → runnable scaffold → autonomous-loop handoff, staged S0–S2 with human gates. Use when there is no codebase yet; for an existing repo use auto-loop-bootstrap."
---

# Idea to loop

## Goal

Take a product idea from zero to a running scaffold the autonomous build loop
can take over. Strictly staged, each stage with a human gate, tracked in
`.loop/state.json` `stage`:

- **S0 — Alignment & scope** → a PRD (produce it via `grill-to-prd`), a
  `GOALS.md` backlog, and a runnable prototype — always end S0 by invoking the
  `prototype` skill (if `prototype` is not installed, build the throwaway
  yourself: one runnable file that answers the single riskiest design question
  in the PRD, shown to the user and then left out of the scaffold). The gate
  artifact is something the user can touch. Heavy human gate: scope accepted
  before S1.
- **S1 — System design & tech stack** → `ARCHITECTURE.md` (stack, data model,
  bottlenecks). Defaults to auto: research sub-agents synthesize a
  recommendation and a super-reviewer-style vetting pass checks it before
  commit. During S0, ask whether the human wants to gate S1 manually instead,
  and record the choice in `.loop/state.json` `checkpoints`.
- **S2 — Scaffold & wire** → a bare-bones app that **actually runs** — run it
  and quote the output as evidence — with integrations wired. Light gate: API
  keys and accounts only.
- **Handoff to S3** → at the S2 exit gate, invoke `auto-loop-bootstrap` via
  the Skill tool. It lays down the loop machinery and writes `"stage": "S3"`
  itself — the handoff is atomic, with no separate flip step. From there the
  user runs `autonomous-build-loop`.

## Contracts

- Read `.loop/state.json` first; `stage` routes you. `"S3"` → wrong skill,
  invoke `autonomous-build-loop`.
- Run the stages in order, forward only. A scope regression is a
  `logs/blocks.md` entry surfaced for the human.
- Same bounded-turn iteration semantics as `autonomous-build-loop`: one turn,
  then `ScheduleWakeup` or a clean exit.
- Log judgment calls to the append-only decision log (`docs/decision-log.md`
  — template in `assets/templates/docs/`).
- Canonical stage definitions: read the file
  `autonomous-build-loop/references/lifecycle-stages.md` directly.

## Your judgment

How to run each stage — the interview depth, the research fan-out, the
scaffold shape — is yours; the stage's exit artifact and its human gate are
not. When a stage's gate artifact exists and the human has accepted it, move
on; until then, stay.
