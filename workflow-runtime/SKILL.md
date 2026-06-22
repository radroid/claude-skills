---
name: workflow-runtime
description: The shared canon for authoring a Workflow script against the harness Workflow runner — the P0 substrate every loop skill (orchestrated-delivery, autonomous-build-loop, deep-research) builds on to turn "use ultracode" from prose into mechanism. Use when writing or debugging a Workflow script; wiring agent/parallel/pipeline/phase against the runner; building a quality gate as a concrete pipeline stage rather than a paragraph of instructions; standing up adversarial-verify, a judge-panel, a fan-out, or any gate that emits a canonical verdict/ledger; or whenever a skill says "pipeline every substantive step" and you need the actual contract. Ships a copy-paste preamble (helpers + JSON-Schema consts) plus a runner-contract reference — NOT an importable library. Triggers on "Workflow runner", "ultracode posture", "adversarial-verify", "judge-panel", "fan-out and verify", "canonical verdict", "audit ledger", "agent()/parallel()/pipeline()", "the script won't parse", "TypeScript in a plain-JS workflow".
---

# Workflow runtime

This is the shared canon every loop skill targets when it says "pipeline this
through the Workflow runner." Skills like `orchestrated-delivery` and
`autonomous-build-loop` tell you to fan work out and verify it before routing
onward; THIS skill is the mechanism that makes that real — the exact runner
surface, the copy-paste preamble that gives every script the same helpers and
schemas, and the discipline that turns a vague "quality gate" into a concrete
pipeline stage with a typed verdict.

It is **canon plus reference, not a runnable thing.** You do not invoke this
skill to do work. You read it to author a Workflow script that another skill
will run, and you inline its preamble into that script.

## The no-import constraint — read this first, it shapes everything

**A Workflow script cannot import a library at runtime.** The runner is a
sandboxed JS scope: no filesystem, no Node, no `require`, no `import`, no module
loader. There is nowhere to load `workflow-runtime` FROM. If you write
`import { ... } from "workflow-runtime"` or `require(...)`, the script will not
run — full stop.

So the canon is distributed as a **copy-paste preamble**: a block of helper
functions and JSON-Schema constants you paste at the **top of every script**,
directly below `meta`. Reuse here is **paste, not link**. The unit of
distribution is the script, not the module. Everything downstream in this skill
follows from that one fact — design for paste-in, never for import.

## When to use this

Reach for workflow-runtime whenever you are:

- **Authoring a Workflow script** for any loop skill, from scratch — start from
  the skeleton in the contract and the preamble in `assets/`.
- **Implementing a quality gate** — a reviewer, an adversarial-verify pass, a
  judge-panel, a completeness-critic — that a parent skill described in prose.
  Your job is to render that prose as a CONCRETE pipeline stage (see Core
  principle).
- **Standing up a fan-out** — many independent agents over a list of items —
  and you need to choose `pipeline()` vs a `parallel()` barrier correctly.
- **Emitting a canonical verdict or ledger** the governance layer reads — bind
  the agent call to the right schema const so the verdict is TYPED, not parsed
  out of prose.
- **Debugging a script that won't parse or won't resume** — almost always
  TypeScript syntax in plain JS, a non-literal `meta`, a clock/RNG call, or an
  unguarded `args`. The contract's "Common traps" table is the first stop.

If a parent skill says "pipeline every substantive step" or "fan out and
verify," that instruction lands HERE for the actual implementation.

## Resource map

- **`references/runner-contract.md`** — the authoritative, empirically-pinned
  runner surface. Built-in globals (`agent`, `parallel`, `pipeline`, `phase`,
  `log`, `args`, `budget`, `workflow`) with exact signatures; the hard
  constraints that throw or fail validation; the no-import model; a minimal
  correct skeleton; and a "Common traps" table. **This is the spec — read it
  before writing a line, and validate every finished script against it.** If a
  capability isn't listed there, assume it does not exist; do not invent.
- **`references/patterns.md`** — the named, paste-ready pipeline shapes built on
  the preamble:
  - **adversarial-verify + judge-panel** — produce → hostile re-review → panel
    vote, with a canonical verdict schema.
  - **loop-until-dry + completeness-critic** — keep working a queue until a
    critic says it's drained.
  - **perspective-diverse-verify + worktree guidance** — rotate reviewer frames
    (and `isolation: 'worktree'`) so the same model family doesn't rubber-stamp
    its own output.
  Pick the pattern that matches the parent skill's gate; paste its shape; fill
  in the prompts.
- **`assets/preamble.js`** — the copy-paste preamble itself: the canonical
  JSON-Schema consts (the unified `APPROVE | REVISE | BLOCK` verdict, the cost
  record, the checkpoint record, and the append-only audit-ledger entry) plus
  small deterministic helpers (`tag()`, `isVerdict()`, `gateForVerdict()`).
  Paste it below `meta` in your script. It is plain JS with no imports BY
  CONSTRUCTION — if you ever find an `import` in it, that's a bug.
- **`assets/example-adversarial-verify.js`** — a complete, parse-clean worked
  example: orchestrated-delivery's reviewer step re-expressed as a real
  adversarial-verify pipeline (N hostile refuters per claim, BLOCK on
  majority-refute, the zero-block-streak smell check). Read it once to see the
  whole shape assembled; copy from it, then adapt.

## Core principle — a quality gate is a pipeline stage, not a paragraph

This is the reason workflow-runtime exists. Loop skills describe quality gates
in prose: "reviewer raises issues at ≥80% confidence," "run an adversarial
re-review of zero-fix streaks," "a completeness-critic confirms the queue is
drained." Prose like that is **advisory** — an agent can read it and quietly
skip it, and nothing notices.

The canon's job is to make the gate **mechanical**:

1. **The gate is a stage**, not an instruction. It is an `agent(...)` call (or a
   `pipeline()`/`parallel()` of them) that the run physically executes. It
   cannot be skipped silently, because the absence of its output is visible
   downstream.
2. **The verdict is typed**, not parsed. Bind the gate's `agent` call to a
   `schema` const from the preamble. The harness validates the shape at the tool
   layer and the agent retries on mismatch — so the verdict arrives as a
   structured object (`{ verdict, notes, ... }`), and the governance layer reads
   a TYPE, never a regex over free text.
3. **The result is checked**, not assumed. `agent()` returns `null` on skip or
   retry-exhaustion; a throwing thunk/stage resolves to `null` too. Always
   `.filter(Boolean)` and act on the count — a gate that produced nothing is a
   gate that did not run, and that must be a visible fact, not an invisible one.

"Pipeline every substantive step" from a parent skill is exactly this: turn
each prose checkpoint into a concrete, typed, checked stage. Prose tells; a
pipeline stage enforces.

### The audit-ledger schema — the typed contract the governance layer reads

The governance layer (a steward, a supervisor, a token ledger) should never
scrape prose to learn what a run did. The preamble defines an **audit-ledger
schema** — a typed shape, one record per gate outcome — that the governance
layer reads directly: verdict, the issues raised, the role/label that produced
it, the budget at that point, and the (fail-closed) `human_approval` field.
Emit ledger records to that schema and the self-tuning layer (e.g.
orchestrated-delivery's steward) consumes structured truth, not a transcript.
Treat the audit-ledger schema as the seam between the pipeline and everything
that reasons ABOUT the pipeline.

## How a skill adopts the canon

Three steps, in order:

1. **Inline the preamble.** Open `assets/preamble.js`, paste it into your script
   directly below the `export const meta = {...}` literal. Now your script has
   the helpers and schema consts locally — no import, by design.
2. **Pick the pattern.** Match the parent skill's gate to a shape in
   `references/patterns.md` (adversarial-verify + judge-panel, loop-until-dry +
   completeness-critic, or perspective-diverse-verify). Paste the shape; fill in
   the prompts and the item list; bind each gate stage to its schema const.
3. **Validate against the contract.** Walk `references/runner-contract.md`'s hard
   constraints and "Common traps" table before you ship the script:
   - `meta` is the FIRST statement and a PURE LITERAL — `export const meta = {
     name, description }` (a `const` object, **not** a `meta({...})` call).
   - Plain JavaScript only — no `: type`, no `interface`, no `<T>`, no `as`
     casts. TS syntax fails to parse before the body runs.
   - No clock and no RNG anywhere — they throw, because they'd break resume.
     Vary by `index`/`label`; stamp timestamps AFTER the workflow returns or
     pass them via `args`.
   - `args` may be `undefined` — fall back to inline constants
     (`const items = (args && args.items) || [...]`).
   - Default to `pipeline()` (per-item, no barrier); reserve a `parallel()`
     barrier for a step that genuinely needs ALL prior results.
   - `.filter(Boolean)` every results array.
   - `workflow()` nests ONE level only — orchestrate children from the top.

A malformed script only costs a retry, never a wrong result — but it burns a
cycle, so validate before you run.

## Built-in globals — do NOT re-implement these

The runner provides these as globals in the script scope. They already exist;
re-implementing them is wasted work and often wrong. Signatures (full detail in
`references/runner-contract.md`):

- `agent(prompt, opts?) -> Promise<string | object>` — one agent. No `schema` →
  final text (string); with `opts.schema` → a validated object. Returns `null`
  on user-skip or post-retry death — always `.filter(Boolean)`. `opts`:
  `{ label, phase, schema, model, isolation: 'worktree', agentType }`.
- `parallel(thunks[]) -> Promise<any[]>` — **BARRIER**: runs all, waits for all.
  A throwing thunk resolves to `null` (never rejects the batch).
- `pipeline(items, ...stages) -> Promise<any[]>` — **per-item, NO barrier
  between stages.** Stage callback gets `(prevResult, originalItem, index)`. A
  throwing stage drops that item to `null`. **Default to this** over a
  `parallel()` barrier.
- `phase(title)`, `log(msg)`, `args`, `budget {total, spent(), remaining()}`,
  `workflow(nameOrRef, args)` (one nesting level only).

Limits, pinned: concurrency cap `min(16, cores - 2)`; lifetime cap `1000` agent
calls per run; per-call cap `4096` items per `parallel()`/`pipeline()`.

## Deployment context (frames the output, not the contract)

The runner's primary target is the **interactive Claude Code session** —
`xhigh` effort + ultracode, looped via `ScheduleWakeup` (`/loop`). That is the
deployment to design for. It ALSO runs headlessly under a scoped
`--allowedTools "Workflow"` allowlist (verified; no permission-bypass needed) —
but that is a secondary mode, not the target. Author scripts for the looped
interactive session.

## Hard rules

- **Never write `import` or `require` in a Workflow script.** There is no module
  loader. Inline the preamble; reuse is paste, not link.
- `meta` is the first statement and a pure literal — `export const meta = { ... }`
  with `name` and `description` required (never `meta({...})`).
- Plain JS only. Any TypeScript syntax fails to parse.
- No clock, no RNG — both throw (they break resume). Vary by `index`/`label`.
- Guard `args` — it may be `undefined`.
- `.filter(Boolean)` every `agent`/`parallel`/`pipeline` result array.
- Bind every quality-gate stage to a schema const so its verdict is TYPED, not
  parsed from prose.
- Validate every finished script against `references/runner-contract.md` before
  running it.
