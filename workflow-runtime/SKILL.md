---
name: workflow-runtime
description: Use when writing or debugging a Workflow script against the harness runner — wiring agent/parallel/pipeline/phase, building a quality gate as a pipeline stage, emitting the canonical APPROVE|REVISE|BLOCK verdict or audit ledger, or when a script won't parse or resume.
---

# Workflow runtime

The shared canon every loop skill targets when it says "pipeline this through
the Workflow runner." You don't invoke it to do work — you read it to author a
Workflow script another skill runs.

## Core principle

**A quality gate is a pipeline stage, not a paragraph.** A prose gate can be
read and silently skipped; a gate that is an `agent()` call bound to a schema
const physically executes, returns a typed verdict, and the absence of its
output is visible downstream. `agent()` returns `null` on skip or death —
`.filter(Boolean)` every result array and act on the count: a gate that
produced nothing is a gate that did not run. Governance layers (stewards,
supervisors, ledgers) read the typed `AUDIT_LEDGER_ENTRY` records, never
transcripts.

## The one constraint that shapes everything

**Workflow scripts cannot import anything.** The runner is a sandboxed JS
scope — no filesystem, no Node, no module loader. The canon therefore ships as
a copy-paste preamble (`assets/preamble.js`: the unified
`APPROVE | REVISE | BLOCK` verdict schema, cost/checkpoint/audit-ledger
schemas, small helpers like `tag()` and `gateForVerdict()`). Paste it directly
below `meta` in every script. Reuse is paste, never link.

## Authoring contract

`references/runner-contract.md` is the authoritative runner surface — the
globals (`agent`, `parallel`, `pipeline`, `phase`, `log`, `args`, `budget`,
`workflow`), exact signatures, limits, and a common-traps table. Read it
before writing; validate every finished script against it. The hard
constraints:

- `export const meta = {...}` is the first statement and a pure literal.
- Plain JavaScript — any TypeScript syntax fails to parse.
- No clock, no RNG (they break resume) — vary by index/label; stamp times
  outside the run or pass them via `args`.
- `args` may be `undefined` — guard it.
- Default to `pipeline()` (per-item, no barrier); use a `parallel()` barrier
  only when a step genuinely needs ALL prior results at once.
- `workflow()` nests one level only.
- Bind every gate stage to a schema const so its verdict is typed, not parsed
  from prose.

## Resources

- `references/runner-contract.md` — the spec. If a capability isn't listed
  there, assume it doesn't exist.
- `references/patterns.md` — paste-ready shapes: adversarial-verify,
  judge-panel, loop-until-dry + completeness-critic, perspective-diverse
  verify, worktree guidance.
- `assets/preamble.js` — the paste-in preamble.
- `assets/example-adversarial-verify.js` — a complete, parse-clean worked
  example to copy from.
