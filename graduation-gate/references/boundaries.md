# Boundaries — what graduation-gate owns vs delegates

graduation-gate is the BUILD→MAINTAIN seam. It is thin BY DESIGN: its novel surface
is just *readiness judgment* + the *lifecycle transition*. Everything else it
DELEGATES to the spine it sits on. Holding these lines is what keeps it from
re-implementing the registry, governance, or the maintenance engine.

| Concern | Owner | graduation-gate's role |
|---|---|---|
| Record shape (required fields) + oracle ADEQUACY | `fleet-registry` admission-validator | CALLS it; passes its APPROVE into the roll-up |
| Storing config.yaml / state.json; the schemas | `fleet-registry` | hands it the validated record + initial state to store |
| "May this run unsupervised?" — graduation = always-human | `cto-governance-spine` | OBEYS; never self-approves a graduation |
| The global audit ledger | `cto-governance-spine` (`fleet/ledger.jsonl`) | appends a canon `AUDIT_LEDGER_ENTRY` to it |
| Running the oracle at steady state; the sweep; `healthAssess` | `fleet-maintenance` | hands it a freshly-enrolled, instrumented app; consumes its sweep severities for `demotionCheck` |
| Wiring instrumentation up (telemetry/health/oracle) | `app-provisioning-and-instrumentation` (planned) | VERIFIES it exists; reports the gap on a miss (does not author it) |
| The runner + canon schemas | `workflow-runtime` | RUNS on it (the gate is a Workflow) |
| **Readiness judgment + enroll/quarantine/re-admit transition** | **graduation-gate** | **OWNS** |

## What it owns (the novel surface)

- **Readiness judgment.** The fat instrument check (`instrumentationRollup`) + the
  operational-readiness adversarial-verify — "is this app genuinely ready to be
  maintained unattended?" Nothing else in the spine asks this.
- **The lifecycle transition.** Enroll (`buildEnrollmentState`, hard one-shot,
  human-gated), demote (`demotionCheck` / `applyDemotion`, auto on sustained sev1),
  re-admit (`readmitAllowed`, fresh graduation + human). The status machine of fleet
  membership.

## What it delegates (and must NOT re-implement)

- **Record shape + oracle adequacy.** The admission-validator already does the
  required-field + revert + oracle-adequacy refutation. graduation-gate calls it; it
  does not re-author schema validation or the adequacy lenses.
- **The autonomy decision.** governance classifies `graduation` as always-human.
  graduation-gate does not encode its own "may it auto-graduate" rule — there is no
  such thing; it routes to a human.
- **The data + its history.** The registry stores the record; the governance ledger
  holds the audit history. graduation-gate writes neither store's internals — it
  produces the validated record + a ledger entry and lets the owners persist them.
- **Steady-state monitoring.** Once enrolled, the app belongs to `fleet-maintenance`.
  graduation-gate re-enters only on the reverse edge (a sustained-sev1 demotion the
  sweep surfaces, or a human-initiated re-admit).

## The seam restated

The §5 question was whether BUILD→MAINTAIN is "just write a registry record." It is
not: a record can be written by hand, but *readiness* — does the oracle run, is
telemetry wired, is the app proportionate to its tier — is real, reusable judgment
that belongs at exactly one place, the boundary. graduation-gate is that place. But
"owns the boundary" does not mean "owns the spine": the validation, the policy, the
storage, and the monitoring each stay with their owner, or the gate has drifted into
a re-implementation.

## Persistence / resume

A graduation may span a fresh session (build finishes, a trigger wakes the gate).
Everything to resume is durable: the candidate record (the proposed config.yaml +
state.json), the admission-validator's ledger entry, and — once enrolled — the
registry record itself. A re-admit reconstructs from the quarantined record + the
fresh graduation run. No prior conversation context is required.
