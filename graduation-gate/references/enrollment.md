# Enrollment — the hard one-shot flow

A built app becomes a fleet member by passing FOUR gates. Three are technical
(`graduationReady` combines them); the fourth is the always-human approval
(`graduationDecision` adds it). All must hold — the gate is fail-closed at every
step.

```
1. INSTRUMENT + READINESS   graduate.workflow.js   (this skill's novel surface)
2. ADMISSION                fleet-registry admission-validator.workflow.js
3. HUMAN approval           cto-governance-spine: graduation is ALWAYS human
4. ENROLL                   write config.yaml (PR) + state.json (buildEnrollmentState)
```

## 1. Instrument + readiness (`graduate.workflow.js`)

The fat gate. An **instrument** agent verifies the app is genuinely instrumented
against reality (not just that the config declares it) — the oracle actually runs
green, a health endpoint responds, telemetry is wired, SLOs are declared
(`instrumentationRollup`, fail-closed: an unverifiable check is FALSE). Then an
**adversarial-verify** pass refutes "this app is operationally ready for unattended
maintenance" (5 hostile lenses, refute-by-majority, dead refuter = refute). See
`references/instrumentation.md`.

## 2. Admission (`fleet-registry` admission-validator)

graduation-gate does NOT re-check record shape or oracle ADEQUACY — it calls the
admission-validator, which BLOCKS on any missing required field, a SHIP app with no
`revert_command`, or a `smoke_oracle` that cannot survive a hostile adequacy
refutation ("asserts no more than boots+200"). Run it on the candidate record and
pass its APPROVE into the readiness roll-up as `args.admitted`. The two gates are
distinct: admission decides whether the *record may exist*; readiness decides
whether the *app is ready to be maintained*.

## 3. Human approval (always-human, governance)

`cto-governance-spine`'s `autonomousModeGate` classifies `graduation` as an
always-human action — there is no tier at which a graduation auto-approves. So even
a full technical pass yields `escalate` / BLOCK until a human signs off.
`graduationDecision(readyResult, humanApproval)`:

- ready + human → `proceed` / APPROVE
- ready + no human → `escalate` / BLOCK (route to a person)
- not ready → `hold` / REVISE (fixable — fix and re-run)

## 4. Enroll (hard one-shot, human-gated write)

On `proceed`:

- **`config.yaml`** lands via a **reviewed PR** — it is the PR-gated record
  (`fleet-registry`). Set the `enrolled` provenance (`by`: this graduation run,
  `ref`: the enrollment commit, `schema_version`).
- **`state.json`** is built by `buildEnrollmentState(appId, humanApproval, nowTs)` —
  which returns `null` (REFUSES) without an approval. Hard one-shot: `status:
  "active"` immediately at the declared tier, `lease: null`, `open_incidents: 0`,
  `drift.status: "in_sync"`. NO probation / "observing" status.
- Append the `graduationLedgerEntry(...)` to `fleet/ledger.jsonl` with the
  `human_approval` recorded — the graduation is audit truth.

After this, `fleet-maintenance`'s next sweep sees the app as `active` and begins
watching it. The build→maintain handoff is complete.

## Brownfield apps

An existing (not freshly-built) app onboards through the EXACT same gate — the
instrument + readiness + admission checks are about the app's *current* state, not
its provenance. A brownfield app simply has to already satisfy them (or be brought
up to them first). There is no separate brownfield path.

## Why hard one-shot (no probation)

A probation ramp (enroll observe-only, auto-promote after N healthy sweeps) was
considered and rejected at build time: it adds an intermediate status, a promotion
trigger, and a window where the app is half-watched. The strict readiness gate is
the bar instead — if the app can't pass instrument + readiness + admission now, it
isn't ready, and "enroll it anyway and watch" is the fail-open this regime exists to
avoid. The cost is a higher enrollment bar; the benefit is no half-states.
