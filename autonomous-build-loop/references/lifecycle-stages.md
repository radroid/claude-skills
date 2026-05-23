# Lifecycle stages

Canonical definitions for the **`Stage:`** field in `.loop/state.json`. Cross-referenced by
`autonomous-build-loop` (the loop runtime, S3+), `idea-to-loop` (greenfield bootstrap, S0–S2),
and `auto-loop-bootstrap` (brownfield bootstrap, sets `Stage: "S3"` and hands off).

## Why "Stage" exists alongside "Phase"

- **Phase** (e.g. `P1`, `P2`) is the existing concept: feature-backlog progression *within*
  development. Phases are agile — they reshuffle as `GOALS.md` evolves.
- **Stage** (e.g. `S0`, `S1`) is the new concept: coarse lifecycle position from idea to deploy.
  Stages are waterfall *between* themselves (no skipping ahead, no rolling back) but agile
  *within* (the loop's per-iter behavior depends on the current stage).

A repo is in exactly one stage at any time. Phases only exist *inside* S3 / S4.

## Stages

| Stage | Name | Human involvement | Owning skill | Exit gate |
|---|---|---|---|---|
| `S0` | Alignment & Scope | Heavy (grilling, scope review) | `idea-to-loop` | Scope/PRD doc + `GOALS.md` backlog written; **human accepts scope** |
| `S1` | System Design & Tech Stack | Checkpoint (accept or pre-delegate) | `idea-to-loop` | `ARCHITECTURE.md` filled (stack + data model + bottlenecks); **human accepts stack** (or pre-delegated `"auto"`) |
| `S2` | Scaffold & Wire | Light (API keys, accounts) | `idea-to-loop` | Bare-bones app **actually runs**; loop scaffolding laid down (delegates to `auto-loop-bootstrap`) |
| `S3` | Vertical-Slice Feature Dev | AFK | `autonomous-build-loop` | Backlog drained; each feature ships as a DB+backend+frontend slice in one PR. **Fat PRs OK here.** |
| `S4` | Layer-Specialized Scale | AFK | `autonomous-build-loop` | Triggered by the composite complexity signal in `.loop/state.json` → `complexity_signal.stage4_triggered: true` (composing fields — LoC, file count, dep depth — and threshold logic **will be defined in milestone M4**, in `complexity-signals.md`); sub-agents specialize by layer, slices stay vertical, `pr_size_policy` flips to `"scoped"` |
| `S5` | Deploy / CI-CD | Checkpoint | `autonomous-build-loop` | CI/CD live; merged PRs deploy |
| `S6` | Maintenance / backlog mode | — | reserved / not implemented | — |

**Implementation status:** S0–S5 are in scope across milestones M1–M4 (`.loop/state.json` accepts `"S0"`–`"S5"`). S4 is **optional** — only entered when the complexity signal trips. S6 is reserved for future scope and is not currently implemented.

## The two entry paths into the loop

Both paths converge on the same `autonomous-build-loop` runtime starting at S3.

- **Greenfield (idea → product)** — `idea-to-loop` runs S0 → S1 → S2, then invokes
  `auto-loop-bootstrap` at the S2 exit gate to lay down loop machinery, then hands off to
  `autonomous-build-loop` which takes over with `Stage: "S3"`.
- **Brownfield (existing repo)** — `auto-loop-bootstrap` is invoked directly on a codebase
  that already exists. It skips S0–S2 entirely and writes `Stage: "S3"` into the initial
  `.loop/state.json`. The repo's existing structure stands in for the "bare-bones app runs"
  exit gate.

There is no greenfield-vs-brownfield flag in `.loop/state.json`. The distinction is **which
skill got the repo to S3**, not state the loop needs to carry forward.

## Stage transitions

Stages advance strictly in order: `S0 → S1 → S2 → S3 → (S4) → S5 → (S6)`. The loop never
skips a stage (S4 is optional; it's reached only when the complexity signal trips). The loop
never rolls back: a regression that requires re-doing scope/stack work blocks the iter via
`logs/blocks.md` and surfaces for human resolution rather than auto-reverting the stage.

### `stage_status`

Each stage carries a `stage_status` in `.loop/state.json`:

| `stage_status` | Meaning |
|---|---|
| `"in-progress"` | The owning skill is working through this stage normally. |
| `"awaiting-human-checkpoint"` | The stage exit gate fired; the loop **parks** until the human checkpoint clears. Wake-ups continue but no new work is dispatched. |
| `"complete"` | Stage finished; the next iter advances `stage` to the next letter and resets `stage_status` to `"in-progress"`. |

Pre-delegated checkpoints (`checkpoints.<gate>: "auto-delegated"` in `.loop/state.json`)
skip the park — but the auto-decision is **super-reviewed first**. See
`super-reviewer.md`.

## What changes per stage

Stage drives loop behavior. The same `autonomous-build-loop` per-iteration-checklist runs
in S3, S4, and S5 — but specific steps gate on stage:

- **`pr_size_policy`**: written into `.loop/state.json` from M1 onward. Undefined in S0–S2 (no PRs land in those stages). Set to `"fat"` on entry to S3. Flips to `"scoped"` only on explicit entry to S4. If S4 is skipped (transition S3 → S5), retains the last S3 value (`"fat"`) into S5.
- **Sub-agent dispatch**: S3 uses disjoint-file Class B sub-agents per feature; S4 layers
  them by tier (data / api / ui specialists). See `fat-iter-mode.md`.
- **Arch passes**: phase-boundary arch passes fire in S3 and S4 alike. S5 *replaces* the phase-boundary arch pass with a deploy-readiness pass — by S5 the architecture is frozen and the relevant question is whether it's deploy-ready.
- **Human-checkpoint cadence**: heavy in S0/S1/S2, none in S3/S4, gated again at S5.

## What `.loop/state.json` carries (Stage-related fields only)

The minimum-viable schema introduced in M1 carries `stage`, `iter`, `pr_mode`, `pr_size_policy`.
M2 extends it with `stage_status`, `checkpoints`, `complexity_signal`. Full schema lives in
`per-iteration-checklist.md` step 1; this doc only defines the canonical `stage` values
(`"S0" | "S1" | "S2" | "S3" | "S4" | "S5" | "S6"`).

## Cross-references

- `super-reviewer.md` — what vets every auto-delegated checkpoint and every S3+ feature PR.
- `feature-pr-mode.md` — how PRs are shaped per stage (`pr_size_policy`).
- `per-iteration-checklist.md` — full `.loop/state.json` schema + step-by-step iter procedure.
- `tiered-read-strategy.md` — `.loop/state.json` is Tier 1 on cold-boot iters (full read); warm iters skip it unless `latest.md` signals a change.
