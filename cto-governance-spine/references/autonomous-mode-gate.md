# The autonomous-mode-gate

The one decision that bounds the whole system: **may the CTO take this action
unsupervised, or must a human decide?** Implemented as `autonomousModeGate()` in
`assets/governance.js`.

## Allow-list, not confidence (the non-negotiable)

Auto-approval is **membership in an enumerated, tier-keyed set**, evaluated by
deterministic code. It is explicitly NOT an LLM confidence threshold. The whole
adversarial-quality regime exists because a model's self-reported confidence is
the rubber-stamp you cannot trust; routing autonomy through that same signal would
defeat the point. If you ever find yourself adding "and the agent is ≥0.9 sure" as
an auto-approve condition, stop — that belongs nowhere in this gate.

## The matrix

`governance_tier` (from the app's registry `config.yaml`) selects the classes
auto-approvable at that tier:

| Tier | Auto-approvable decision classes |
|---|---|
| `experimental` | `docs`, `dep_patch`, `tests`, `small_fix` |
| `standard` | `docs`, `dep_patch`, `tests` |
| `critical` | `docs` |

`prod_deploy` and `graduation` are in **no** tier's set — always human (§6 L4,
the lowest-reversibility actions).

The decision classes are enumerated in `DECISION_CLASSES`; an action that doesn't
map to one is unrecognized and escalates (fail-closed).

**Recognized but always-human (at current tiers).** Several classes are in
`DECISION_CLASSES` but in *no* tier's allow-list — `dep_minor`, `dep_major`,
`feature`, `schema_change`, `infra` — so they always escalate today. They are
enumerated deliberately (not omitted) so the matrix's *exclusions* are explicit
and the ledger records an honest class label rather than "unrecognized"; they are
the reserved slots a future, more-trusting matrix would widen into. `prod_deploy`
and `graduation` are always-human structurally (handled before the matrix). There
is no `incident_fix` class — an incident fix is tagged by its actual change shape
(e.g. `small_fix`, `tests`) and gated like any other change of that shape.

## Evaluation order (highest-stakes first, fail-closed)

1. **Tier normalization** — an unknown/garbled tier is treated as `critical` (the
   most restrictive). A typo in the registry never widens autonomy.
2. **Unknown class → escalate.**
3. **Denylist hit → escalate** — an absolute refusal, checked FIRST (before the
   always-human classes) so it overrides *everything*, including a human-approved
   prod deploy: the approval was for the action, not necessarily for touching a
   forbidden path, so the specific hit must reach a human. Truthy = refuse
   (fail-closed); never a silent skip.
4. **`graduation` → escalate** (always human).
5. **`prod_deploy` (or any truthy `is_prod_deploy`) → the HOLD rule**
   (`prod-and-cost.md`): flag SHIP *and* a human approval → proceed; flag not SHIP
   → hold; flag SHIP but no approval → escalate.
6. **Class not on the tier's allow-list → escalate** — a human decides; runtime
   preconditions are irrelevant for a non-auto-approvable class.
7. **Allow-listed but oracle not green** (every class except `docs`, which can't
   change runtime behavior) **→ hold.** `oracle_green` must be exactly `true`;
   anything else (false, null, undefined) holds.
8. **Allow-listed, oracle ok, but cost-breaker not clear → hold.**
9. **Otherwise → proceed.**

The ordering matters: the denylist refusal and the human-only classes win before
the cheap preconditions, and allow-list membership is checked before oracle/cost so
a non-auto-approvable class always escalates (never "holds" as if it were one step
from shipping).

## Why `docs` is the oracle exception

`docs` is the only class that cannot change runtime behavior, so requiring a green
smoke oracle for a docs change would be theater (and would wrongly hold a docs PR
whenever the app's oracle happens to be red for unrelated reasons). Every other
class touches behavior and must have an explicitly green oracle to proceed.

## Output

`{ gate_decision: "proceed" | "hold" | "escalate", reasons: [...] }`. `reasons` is
an ordered trace of why — the last entry is the deciding one. Map to the canon
verdict with `verdictForGate` (`proceed→APPROVE`, `hold→REVISE`,
`escalate→BLOCK`) when writing the ledger.

- **proceed** — auto-approved; act unsupervised, then log.
- **hold** — a transient precondition failed (oracle red, cost blown); back off
  and retry, no human needed.
- **escalate** — a human must decide (out-of-allow-list class, prod deploy,
  graduation, denylist refusal).

## Widening autonomy later

The matrix is intended to start narrow and widen as trust is earned — but every
widening is a deliberate, reviewed change to `AUTONOMY_MATRIX`, logged like any
other policy change, never an ad-hoc per-run exception. Trust is granted to a
*class at a tier*, not to a particular agent on a particular day.
