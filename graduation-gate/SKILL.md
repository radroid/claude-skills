---
name: graduation-gate
description: Use to admit a freshly-built app into the maintenance fleet or manage the reverse edge — "graduate an app", "enroll into the fleet", "is this app ready for maintenance", "quarantine an app", "re-admit a quarantined app".
---

# Graduation gate

## Goal

The seam between BUILD and MAINTAIN. Answers one question — *is this app ready
to be maintained unattended, and may it enter the fleet?* — and owns the
reverse edge (quarantine and re-admission). Enrollment through this gate is
what makes the fleet grow by verification instead of hand-edited records.

## The flow (hard one-shot — no probation ramp)

instrument + readiness check (fail-closed) → `fleet-registry`'s admission
validator (record shape + oracle adequacy) → **human approval** (always) →
enroll `active` at the declared tier (`config.yaml` via reviewed PR +
enrollment `state.json`) → append the graduation `AUDIT_LEDGER_ENTRY` with the
approval recorded.

Readiness misses → REVISE: fixable, fix and re-run. Ready but unapproved →
BLOCK: route to a human. Full pass + human → enroll. There is no intermediate
"observing" status — the readiness gate IS the bar, so it must be strict.

## Contracts

- **Never self-approve a graduation.** Enrollment writes require recorded
  human approval — `buildEnrollmentState` returns null without one.
- **Verify instrumentation against reality, fail-closed:** the smoke oracle
  actually runs green, the health endpoint responds, telemetry is wired, SLOs
  are declared. Anything you cannot confirm is false; unverifiable = not
  ready.
- **Delegate, don't re-implement:** record shape and oracle adequacy belong to
  the admission validator; autonomy policy to governance; storage to the
  registry. This skill owns the readiness judgment and the status transition —
  the two compose, neither subsumes the other.
- **Reverse edge:** N consecutive sev1 sweeps → auto-quarantine + escalate
  (never delete the record — it's the audit trail); a missing or garbled sweep
  history → escalate, never silently demote or silently keep. Re-admission is
  a full fresh graduation plus human approval, not an un-delete.

## Resources

- `assets/graduate.workflow.js` — the mechanized gate: instrument agent +
  adversarial readiness verify + fail-closed roll-up + typed ledger record.
- `assets/graduation.js` / `assets/graduation.example.js` — the deterministic
  decisions (`graduationReady`, `graduationDecision`, `demotionCheck`,
  `buildEnrollmentState`) and their node self-test.
- `references/` — enrollment flow, instrumentation requirements,
  demotion/re-admit, ownership boundaries.
