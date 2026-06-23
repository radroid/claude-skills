# Lifecycle — enroll, admit, retire, reconcile, demote

The registry is a two-way door (§7.5 — fleet discovery must not be one-way). Apps
enter (graduation, brownfield), drift from reality and get reconciled, and leave
(retirement) or get demoted (a failing oracle). Every transition is a typed
state change, never a delete.

## Enroll (admission) — the graduation seam

`graduation-gate` owns the readiness PROCESS (probes, baseline capture, the
go/no-go judge panel). The registry owns the ADMISSION — the typed gate that
turns a candidate record into a fleet member. The boundary: graduation decides
*whether*; the registry validates *the resulting record* and stores it.

Enrollment is non-skippable and goes through
`assets/admission-validator.workflow.js`:

1. graduation-gate assembles a candidate `{ config, state }`.
2. It runs the admission validator. **BLOCK** (fail-closed) if:
   - any required `config`/`state` field is missing,
   - `merge_deploys_to_prod=SHIP` but `revert_command` is absent (D4),
   - `config.app_id !== state.app_id`,
   - the `smoke_oracle` cannot survive the hostile adequacy refutation
     (asserts no more than "boots + 200" — §7.9).
3. On **APPROVE**: write `config.yaml` via a **PR** (config is PR-gated) and the
   initial `state.json` (`status: active`, `lease: null`,
   `last_known_good: null`, `drift.status: in_sync`). The ledger record from the
   validator is the admission's audit trace.

"An app admitted without an oracle is invisible to MAINTAIN" — so admission is a
GATE, not a handoff. An app present in `fleet/apps/` that never passed the
validator is a bug.

## Brownfield onboarding

An existing app (not built by the loop) onboards through the **same** admission
validator — there is no second-class entry. The only difference is provenance:
`enrolled.by` is the human/onboarding run rather than a graduation run, and the
candidate is assembled by inspecting the live app rather than from a build. It
still must present an adequate oracle to be admitted; a brownfield app with no
oracle is queued for instrumentation
(`app-provisioning-and-instrumentation`), not admitted blind.

## Drift reconciliation (registry ↔ reality)

A stored record can diverge from reality: the repo was renamed, the prod URL
moved, the oracle command no longer exists, the app was deleted. Reconciliation
(run by `fleet-maintenance` on a schedule; the registry defines the contract):

1. For each active app, compare the record to reality — repo exists? `prod_url`
   responds? `smoke_oracle.command` still runnable?
2. Write `state.drift`: `in_sync`, or `drift_detected` (with what diverged), or
   `unreconciled` (couldn't check).
3. `drift_detected` surfaces to governance — a config fix goes through a PR
   (config is PR-gated); a state correction is a direct write. Set
   `drift.last_reconciled` on every pass so a never-reconciled app is visible.

Drift is a first-class state, not an error: the registry is only "the source of
truth" if it is periodically checked against the truth.

## Retire (de-register)

An app leaves the fleet by status flip, never by deletion:

- Set `state.status: retired`. A retired app is invisible to MAINTAIN — no trigger
  scopes to it, no sweep touches it.
- Leave both records in place. The history is the audit trail; a deleted record
  erases the evidence of everything the fleet did to that app.
- Retiring while a lease is held: let the lease expire or release it first — do
  not strand a held lease on a retired app.

## Demote (quarantine) — graduation is not a one-way latch (§7.8)

An app that keeps failing its oracle is **demoted**, not left to rot as a
permanently-red "active" member:

- Set `state.status: quarantined`. Like retired, it drops out of normal MAINTAIN,
  but quarantine is recoverable — it signals "needs human attention / re-baseline"
  rather than "gone."
- Re-baselining after a *legitimate* major change (the app intentionally changed,
  so the old SLOs/oracle now misread as a regression) is a `config.yaml` PR that
  updates `slo`/`smoke_oracle`, after which the app returns to `active`. Without
  this, every intended change reads as a regression forever.

## Summary of transitions

| From | Event | To | Record touched |
|---|---|---|---|
| (none) | admission APPROVE | `active` | config PR + new state |
| `active` | lease acquired | `held`* | state |
| `active` | persistent oracle failure | `quarantined` | state |
| `quarantined` | re-baseline PR | `active` | config PR + state |
| any | decommission | `retired` | state |

\* `held` is a transient status during a run; the durable lease truth is the
`state.lease` object (see `references/lease-protocol.md`). Some fleets track the
mutex purely in `state.lease` and leave `status` at `active` during a run — either
is valid as long as it is consistent fleet-wide.
