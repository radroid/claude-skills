# S2 — Scaffold & Wire

Third lifecycle stage. Light human involvement (API keys / accounts only). Stands up a
**runnable bare-bones app** from S1's architecture and hands off to the loop runtime.

## Exit gate

Bare-bones app **actually runs** (verified, not assumed) **AND** `auto-loop-bootstrap`
invoked successfully. State.json then has `"stage": "S3"`. Only then does
`autonomous-build-loop` take over.

## Required artifacts at exit

1. **Runnable scaffold** — `npm run dev` (or the stack's equivalent) starts cleanly; a
   smoke endpoint or homepage returns 200.
2. **Integrations wired** — auth, payments, storage, etc. per `ARCHITECTURE.md`. Each has
   a happy-path smoke test.
3. **Hardened scaffolded defaults** — see §"Don't trust the scaffold" below.
4. **Loop machinery laid down** — `.loop/state.json` at `"stage": "S3"`, `CLAUDE.md`,
   `GOALS.md` (mirrored from S1), `logs/` skeleton. Written by `auto-loop-bootstrap`.

## Workflow

```
Skill: superpowers:using-git-worktrees   # isolation if scaffolding multiple integrations in parallel
Skill: superpowers:executing-plans       # inline plan execution from S1's plans/
```

For each integration, dispatch auto-research per `auto-research-mode.md` to pull
**current** setup docs (auth / payments / storage SDK quickstarts). Stale training data
is the common failure mode — never paste from memory.

## Don't trust the scaffold

Apply **principle 10** from `autonomous-build-loop/SKILL.md` BEFORE building features:

- `tsconfig` strict flags
- ESLint rules
- Persistence-layer connection lifecycle (cached singleton, not per-op open/close)
- Parse-boundary validation (no `as unknown as T`; validate entities at the seam)

Modern scaffolders (`npm create vite`, `create-next-app`, etc.) ship intentionally minimal
defaults that lag community best-practice. Web-research current canonical posture for each
stack element before locking it in.

## Verification

```
Skill: superpowers:verification-before-completion
```

Real commands, real output, evidence. "Should run" is not running. If the smoke fails,
fix it before claiming S2 done — do NOT advance to handoff.

## Handoff — atomic

```
Skill: auto-loop-bootstrap
```

The bootstrap skill writes loop machinery and sets `.loop/state.json` →
`"stage": "S3"` itself. No separate flip step. After it returns, the next iter wakes up
against `autonomous-build-loop` and S3 begins.

Until the M2 `--from-stage S2` enhancement lands in `auto-loop-bootstrap`, the bootstrap
runs in default mode and re-confirms the GOALS.md / ARCHITECTURE.md already produced by S1
(one-iter overlap, no work lost).

## What NOT to do in S2

- Ship features — that's S3. The loop's vertical-slice TDD machinery owns feature
  delivery; S2 only stands the scaffold up.
- Skip the run-it-for-real verification because tests pass — tests are a different signal.
- Hand off without `auto-loop-bootstrap` writing `"stage": "S3"`. The atomic handoff IS
  the gate.

## Cross-references

- `s1-tech-stack-selection.md` — what S2 inherits from.
- `auto-research-mode.md` — used per-integration to pull current setup docs.
- `autonomous-build-loop/references/lifecycle-stages.md` — canonical S2 definition.
- `autonomous-build-loop/SKILL.md` — principle 10 (scaffolded defaults).
