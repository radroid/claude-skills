---
name: graduation-gate
description: Use to admit a freshly-BUILT app into the maintenance fleet — the hard BUILD-to-MAINTAIN seam. Verifies the app is genuinely instrumented (the smoke oracle truly runs green, a health endpoint responds, telemetry is wired, SLOs are declared), adversarially verifies operational readiness for unattended maintenance, calls fleet-registry's admission-validator for record-shape + oracle adequacy, and enrolls ONLY on a full pass plus human approval (graduation is always a human gate). Hard one-shot — no probation ramp; a graduated app goes straight to active at its declared tier. Owns the reverse edge too: auto-quarantine on sustained sev1, human re-admit. Triggers on "graduate an app", "enroll into the fleet", "build-to-maintain handoff", "is this app ready for maintenance", "promote to the fleet", "demote/quarantine an app", "re-admit a quarantined app".
---

# Graduation gate

The seam between BUILD (idea-to-loop → autonomous-build-loop) and MAINTAIN
(fleet-maintenance). A built, running app is **not** a fleet member until it
passes through here. This skill answers one question — *"is this app ready to be
maintained unattended, and may it enter the fleet?"* — and owns the reverse edge:
when a maintained app degrades past saving, how it leaves.

Without this gate, the only way an app enters `fleet-registry` is a hand-edited
record. graduation-gate is what makes enrollment a **gate, not a guess**, and what
lets the autonomous CTO grow its own fleet.

## The decisions this skill encodes (locked at build time, via AskUserQuestion)

- **Hard one-shot gate (no probation).** On a full pass + human approval, the app
  enrolls **straight to `active` at its declared tier**. There is no observe-only
  probation ramp; the readiness gate IS the bar, so it must be strict.
- **Validate + instrument (fat gate).** The gate does not just check the record on
  paper — it verifies the app is genuinely instrumented: the smoke oracle actually
  **runs green**, a **health endpoint** responds, **telemetry** is wired (the
  sources `fleet-maintenance` reads), and **SLOs** are declared. It **refuses** to
  enroll an app it cannot confirm is instrumented (fail-closed: unverifiable = not
  ready). See `references/instrumentation.md`.
- **Auto-quarantine, human re-admit (the reverse edge, §7.8).** A maintained app
  that fails **N consecutive sev1 sweeps** is **auto-quarantined** (out of MAINTAIN)
  and escalated; bringing it back requires a fresh graduation pass **plus** human
  approval. See `references/demotion-and-readmit.md`.

## The boundary that defines this skill

graduation-gate **DECIDES** readiness and **OWNS** the lifecycle transition
(enroll / quarantine / re-admit). It does not re-implement what the spine already
provides:

| Concern | Owner | graduation-gate's role |
|---|---|---|
| Record shape + oracle ADEQUACY | `fleet-registry` admission-validator | CALLS it (a gate, not a handoff) |
| May an action run unsupervised? graduation = always-human | `cto-governance-spine` | OBEYS — never self-approves a graduation |
| Storing the record (config.yaml / state.json) | `fleet-registry` | hands it the validated record to store |
| Running the oracle at steady state, the sweep | `fleet-maintenance` | hands it a freshly-enrolled, instrumented app |
| The runner + canon schemas | `workflow-runtime` | RUNS on it (the gate is a Workflow) |
| **Readiness judgment + the enroll/quarantine/re-admit transition** | **graduation-gate** | **OWNS** |

Rule of thumb: admission-validator decides whether a record may *exist*;
graduation-gate decides whether an app is *ready to be maintained* and performs the
*status transition*. The two compose — neither subsumes the other.

## The graduation flow (hard one-shot)

```
build done → INSTRUMENT + READINESS (graduate.workflow.js, fail-closed)
           → ADMISSION (fleet-registry admission-validator: shape + oracle adequacy)
           → HUMAN graduation approval (governance: always-human)
           → ENROLL active at declared tier (config.yaml via PR + buildEnrollmentState state.json)
           → append graduation AUDIT_LEDGER_ENTRY (human_approval recorded)
```

All four gates must hold (`graduationReady` combines the three technical gates;
`graduationDecision` adds the always-human one). Any miss:

- **instrumentation / readiness not met** → `hold` / REVISE — fixable; fix it and
  re-run (this is the common "not ready yet" case).
- **ready, no human approval** → `escalate` / BLOCK — the only thing left is the
  human gate; route it to a person.
- **full pass + human** → `proceed` / APPROVE — enroll.

The enrollment write itself is **human-gated**: `buildEnrollmentState` returns
`null` without an approval, and `config.yaml` lands via a reviewed PR (it is the
PR-gated record). See `references/enrollment.md`.

## The reverse edge — demotion + re-admit

Every maintenance sweep can feed `demotionCheck(recentSeverities)`: **N consecutive
sev1 sweeps** → `applyDemotion` flips `state.status` to `quarantined` (never deleted
— the record is the audit trail) and escalates for a human. A non-array / missing
history **escalates** rather than silently demoting or silently keeping (fail-closed:
surface, do not act on what you cannot confirm). Re-admission runs the **full
graduation again** and needs human approval (`readmitAllowed`). See
`references/demotion-and-readmit.md`.

## Canon & mechanism (workflow-runtime)

The readiness gate is a CONCRETE Workflow script (`assets/graduate.workflow.js`),
not prose on the honor system. It inlines the `workflow-runtime` canon preamble
(the unified `APPROVE | REVISE | BLOCK` verdict + `AUDIT_LEDGER_ENTRY` schema +
helpers — the executable consts/helpers byte-identical to
`workflow-runtime/assets/preamble.js`, only the header comment role-localized; no
import) and the deterministic engine from `assets/graduation.js`, then:

- runs an **instrument** agent that verifies real instrumentation against reality
  (runs the oracle, hits the health endpoint) and fail-closes any check it cannot
  confirm (`instrumentationRollup`),
- runs an **adversarial-verify** pass on operational readiness (N hostile refuters,
  refute-by-majority, a dead/missing refuter counts as a refute — the canon
  anti-bias design), and
- rolls up FAIL-CLOSED, emitting the typed `AUDIT_LEDGER_ENTRY` the governance
  ledger reads.

The deterministic decisions — `graduationReady`, `graduationDecision`,
`demotionCheck`, `buildEnrollmentState` — are pure functions in
`assets/graduation.js` (no agents: these have a single correct answer, the same
reason governance is deterministic). `assets/graduation.example.js` is that engine
verbatim + a 33-assertion node self-test.

### What v1 exercises (and what it does not)

The deterministic engine is verified by the node self-test (every gate, demotion,
and enrollment path). The live `graduate.workflow.js` smoke exercises the
**instrument + readiness judgment** end-to-end against an example app (and
fail-closes correctly when the app can't be verified). What is NOT yet exercised
end-to-end is the **file-mutating enrollment write** — `buildEnrollmentState` →
`state.json` and `config.yaml` → a reviewed PR, plus the real handoff to
`fleet-registry`'s admission-validator on a live candidate. Those are structurally
correct (and contract-checked against the registry's `STATE_SCHEMA`) but await a
live sacrificial app — the same integration edge the P0 dry-run
(`docs/p0-integration-dry-run.md`) flagged. graduation-gate is the keystone that
makes that live test possible.

## Hard rules

- **Never self-approve a graduation.** It is an always-human gate (governance).
  `buildEnrollmentState` and a `proceed` verdict both REQUIRE `human_approval.approved`.
- **Fail closed.** An instrumentation check you cannot verify is FALSE; a missing
  sweep history ESCALATES (never auto-demotes or auto-keeps); a dead refuter counts
  as a refute.
- **Hard one-shot — no probation.** Enroll `active` at the declared tier or not at
  all. Do not invent an intermediate "observing" status.
- **Delegate, do not re-implement.** Record shape + oracle adequacy is the
  admission-validator's; the autonomy policy is governance's; storage is the
  registry's. graduation-gate computes readiness and performs the transition.
- **Never delete a quarantined app's record.** Demotion is a status flip; the
  history is the audit trail. Re-admission is a fresh graduation, not an un-delete.
- **Inline the canon + engine, never import.** Paste; verify byte-identity (`comm`).

## Resource map

- **`assets/graduation.js`** — the deterministic engine (paste-in): instrumentation
  roll-up, `graduationReady` / `graduationDecision`, the `demotionCheck` /
  `applyDemotion` / `readmitAllowed` reverse edge, `buildEnrollmentState`, and the
  canon ledger builder. No import.
- **`assets/graduate.workflow.js`** — the mechanized readiness gate (canon preamble
  + engine + instrument agent + readiness adversarial-verify + fail-closed roll-up).
- **`assets/graduation.example.js`** — the engine verbatim + a node self-test (run
  `node graduation.example.js`).
- **`references/enrollment.md`** — the full hard-one-shot flow, the four gates, and
  the human-gated enrollment write.
- **`references/instrumentation.md`** — the fat validate+instrument requirements and
  why each is a hard gate.
- **`references/demotion-and-readmit.md`** — the §7.8 reverse edge: auto-quarantine
  on sustained sev1, human re-admit.
- **`references/boundaries.md`** — what graduation-gate owns vs delegates across the
  spine.
