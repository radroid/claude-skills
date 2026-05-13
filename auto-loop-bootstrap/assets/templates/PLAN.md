# PLAN.md

Current build sequence. Source of truth for phase ordering; complements `GOALS.md` (which holds individual items).

## Phase 0 — Bootstrap (DONE)

- `iter-000` — Repo scaffolded via `auto-loop-bootstrap` skill.

## Phase 1 — {{PHASE_1_NAME}}

**Exit criteria:** REPLACE THIS — concrete conditions that mark the phase complete (e.g. "user can sign up + log in + see an empty dashboard").

**Target iters:** 3–5

**Key items:** see `GOALS.md` § Phase 1.

## Phase 2 — {{PHASE_2_NAME}}

**Exit criteria:** REPLACE THIS

**Target iters:** 3–5

**Key items:** see `GOALS.md` § Phase 2.

## Phase 3 — {{PHASE_3_NAME}}

**Exit criteria:** REPLACE THIS

**Target iters:** 3–5

**Key items:** see `GOALS.md` § Phase 3.

## Phase boundary protocol

At each phase boundary the loop MUST invoke the `Skill` tool with `skill: "improve-codebase-architecture"` before the next phase's first feature iter. Result logged to `logs/blocks.md` with `**Source:** arch-pass`.
