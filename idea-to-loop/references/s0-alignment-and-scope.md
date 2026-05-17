# S0 — Alignment & Scope

The first lifecycle stage. Heavy human involvement. Turns a raw idea into a scoped product
plan with a runnable prototype to ground later stages.

## Exit gate

**Human accepts scope.** Until then, `.loop/state.json` stays at
`"stage": "S0", "stage_status": "in-progress"`. On acceptance, set
`checkpoints.scope-accepted: "passed"` and flip `stage_status` to `"complete"`.

## Required artifacts at exit

1. **Scope/PRD doc** — `docs/PRD.md`. One-pager minimum: problem, target user, in-scope,
   **out-of-scope**, primary success metric.
2. **`GOALS.md` backlog** — vertical-slice feature list, top-to-bottom drain order. This is
   what S3 (the loop) will consume.
3. **Runnable prototype** — non-negotiable. Throwaway code that exercises the riskiest UX
   or state-shape question before stack lock. See `prototype` skill below.

## Workflow

Run the skills below in order. Each `Skill:` line is a literal tool invocation, not a
description.

```
Skill: grill-with-docs          # ONLY if user brought existing docs/notes — otherwise skip
Skill: grill-me                 # scope-tree walk to shared understanding
Skill: superpowers:brainstorming # produces a written design spec
Skill: to-prd                   # synthesize into the PRD
Skill: prototype                # runnable artifact at end of S0 (mandatory)
```

Fallbacks if any skill is absent: a structured Q&A bank (manual grilling) for the first two;
a freeform spec doc for `brainstorming`; a hand-written PRD for `to-prd`. `prototype` has no
fallback — if it can't run, you don't exit S0.

> **Consolidated path (preferred when installed):** `grill-to-prd` implements the
> `grill-with-docs → grill-me → brainstorming → to-prd` chain end-to-end with persona-aware
> question banks (Technical / Designer / Vibe) and writes `docs/PRD.md` directly. If it's
> installed, invoke `Skill: grill-to-prd` in place of the four chain steps and proceed straight
> to `Skill: prototype`. Falls back to the chain above if the consolidated skill is absent.

## Decision: S1 stack pick — `auto` or manual?

Before exiting S0, **ask the human one question**:

> "S1 picks the tech stack. Default is auto-research with super-reviewer vetting. Want to
> override to manual review instead?"

Record the answer in `.loop/state.json`:

- Default (auto): `checkpoints.tech-stack-accepted: "auto-delegated"`
- Override (manual): `checkpoints.tech-stack-accepted: "pending"`

No other questions at this gate. The default is the default for a reason — only override
if the human cares enough to look.

## Decision log seed

Every judgment call surfaced during grilling/brainstorming that affects later stages goes
into `docs/decision-log.md` with rationale + date. See `decision-log.md`.

## What NOT to do in S0

- Pick a tech stack — that's S1.
- Write production code — only `prototype` is allowed, and it's explicitly throwaway.
- Skip the prototype because the idea "seems clear." If you can't make it run, the scope
  isn't actually nailed down.

## Cross-references

- `s1-tech-stack-selection.md` — what S0 hands off to.
- `decision-log.md` — judgment-call log format.
- `autonomous-build-loop/references/lifecycle-stages.md` — canonical S0 definition.
