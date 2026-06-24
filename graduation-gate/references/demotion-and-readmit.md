# Demotion + re-admit — the reverse edge (§7.8)

Graduation is not one-way. An app that degrades past saving must be able to LEAVE
the fleet, and a fixed app must be able to come back. The build-time decision:
**auto-quarantine on sustained failure, human re-admit.**

## Auto-quarantine (`demotionCheck` → `applyDemotion`)

Every maintenance sweep can feed the app's recent severities into
`demotionCheck(recentSeverities, opts)`:

- **N consecutive sev1 sweeps** (default `DEMOTE_CONSECUTIVE_SEV1 = 3`) →
  `action: "quarantine"` (`demote: true`, `escalate: true`). The threshold counts
  the **trailing run** only — a sev2/sev3 in between resets it, so a single bad
  sweep or an intermittent blip never demotes; only a SUSTAINED failure does.
- **fewer than N** → `action: "none"`.
- **no usable history** (non-array / missing) → `action: "escalate"`,
  `demote: false`. Fail-closed means *surface, do not act*: you neither silently
  quarantine (a removal you can't justify) nor silently keep watching a possibly-
  dead app — you escalate so a human looks.

On `quarantine`, `applyDemotion(state)` returns a **pure clone** with
`status: "quarantined"` — the app becomes invisible to MAINTAIN (the sweep's
active-filter skips it). The record is **never deleted**; quarantine is a status
flip, and the history is the audit trail. A quarantine ALWAYS escalates: a human
must know an app fell out of the fleet, because re-admission is theirs to authorize.

## Why auto-OUT but human-IN (not auto-both)

Auto-demote + auto-re-admit was rejected at build time: an app that flaps between
healthy and broken would cycle in and out of the fleet without a human ever looking
— masking a real instability behind "the system handled it." Auto-OUT is safe (it
*removes* autonomy, fail-closed); auto-IN is not (it *grants* autonomy to an app
that just proved it couldn't hold it). So leaving is automatic; returning is a
deliberate human act.

## Re-admit (`readmitAllowed`)

Bringing a quarantined app back is **a fresh graduation**, not an un-quarantine:

```
readmitAllowed(graduationReadyResult, humanApproval)
  === graduationReadyResult.ready === true  AND  humanApproval.approved === true
```

Both are required (fail-closed). The full instrument + readiness + admission gate
runs again — because whatever broke the app must be fixed and re-verified, not
waved through on its prior graduation. And the human approval is mandatory (it is
still a `graduation`-class action: always-human). Only then does the app return to
`active` via `buildEnrollmentState`.

## What this is NOT (v1 scope)

- **Not re-baselining.** When an app legitimately changes (a new SLO profile after a
  major release), updating its `config.slo` is a registry `config.yaml` PR — the PR
  review is that gate, not graduation-gate. Auto-deriving new baselines from observed
  traffic is a follow-on, not v1.
- **Not paging.** A demotion raises an escalation; the governance incident ladder
  (`incidentResponse`: severity + ack-timeout + dead-man's-switch) owns who gets
  paged and when. graduation-gate flips the status and emits the escalation; it does
  not implement alerting.
