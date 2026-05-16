# S1 — System Design & Tech Stack

Second lifecycle stage. Checkpoint with auto-delegate default. Turns the S0 scope into a
concrete architecture: stack, data model, bottlenecks, vertical-slice backlog.

## Exit gate

`ARCHITECTURE.md` complete **AND** `.loop/state.json` →
`checkpoints.tech-stack-accepted: "passed"`. Only then advance to S2.

## Required artifacts at exit

1. **`ARCHITECTURE.md`** — stack (with rationale per choice), data model, bottlenecks/risks.
2. **`GOALS.md`** — initial vertical-slice backlog seeded from the PRD via `to-issues`.
3. **`docs/research/<topic>.md`** — per-topic research syntheses persisted (e.g.
   `stack.md`, `auth.md`, `persistence.md`).
4. **Bite-sized impl plans** in `plans/` via `superpowers:writing-plans` for the riskiest
   S2 slices.

## Workflow

```
Skill: to-issues                       # PRD → vertical-slice issues → seed GOALS.md
```

Then dispatch auto-research per `auto-research-mode.md` — 3–5 Class A research sub-agents
in parallel (web + `context7` MCP). Each returns *condensed* findings; the lead synthesizes
into `ARCHITECTURE.md` + `docs/research/*.md`. Replaces training-data guesswork on stack
currency and best practices.

```
Skill: superpowers:writing-plans       # bite-sized plans for the riskiest S2 slices
```

## Decision: who accepts the stack

Branch on `.loop/state.json` → `checkpoints.tech-stack-accepted` (set during S0):

- **`"auto-delegated"` (default)** → invoke super-reviewer
  (`autonomous-build-loop/references/super-reviewer.md`) with the repo-context pack
  (`ARCHITECTURE.md` + `docs/decision-log.md` + `docs/research/*.md`):
    - `APPROVE` → set `"passed"`, flip `stage_status: "complete"`.
    - `REQUEST_CHANGES` → fix listed items, re-vet (two-pass cap). If a third pass would be
      required, escalate to BLOCK behavior instead of looping further.
    - `BLOCK` → log to `logs/blocks.md`, park, surface to human via `continuous-loop.md`.
- **`"pending"` (S0 override)** → park `stage_status: "awaiting-human-checkpoint"` until
  the human edits `.loop/state.json` to `"passed"`.

## Decision log

Every stack choice with a non-obvious alternative goes into `docs/decision-log.md` with
rationale. The super-reviewer reads this for context.

## What NOT to do in S1

- Write production code — that's S2.
- Lock in a stack without auto-research — even \"obvious\" picks need a currency check.
  Training-data drift on framework defaults is exactly what principle 10 in `autonomous-
  build-loop/SKILL.md` warns about.
- Skip `to-issues` because the backlog \"feels obvious\" — vertical-slice decomposition
  is what makes S3 fat-iter dispatch work.

## Cross-references

- `s0-alignment-and-scope.md` — what S1 inherits from.
- `s2-scaffold-and-wire.md` — what S1 hands off to.
- `auto-research-mode.md` — multi-agent research pattern (this skill).
- `decision-log.md` — judgment-call log format.
- `autonomous-build-loop/references/super-reviewer.md` — vets auto-delegated accept.
- `autonomous-build-loop/references/lifecycle-stages.md` — canonical S1 definition.
