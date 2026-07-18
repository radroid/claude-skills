---
name: cto-governance-spine
description: Use when an autonomous fleet needs the policy gate before acting unsupervised — "may the CTO do this unsupervised", the autonomous-mode-gate, prod-deploy HOLD rule, cost circuit-breaker, escalation ladder, dead-man's-switch, or the global audit ledger.
---

# CTO governance spine

## Goal

The policy contract every trigger passes before the CTO acts: what may happen
unsupervised, what must escalate to a human. Acting skills paste
`assets/governance.js`, derive the candidate facts from the registry, call the
gate before committing to an action, and append the outcome to the ledger.

## The defining property — deterministic, never a vibe

The gate is an **enumerated allow-list evaluated by pure functions** — never
an LLM confidence score, which is exactly the rubber-stamp this system exists
to distrust. `governance.js` contains no `agent()` calls by design. Quality
judgment (is the code correct?) lives in the loop skills' adversarial reviews;
policy is mechanical.

Boundaries: `fleet-registry` STORES the facts (flag, caps, denylist, tier);
this skill ENFORCES rules on them; `workflow-runtime` is the mechanism;
`loop-supervisor` only informs, never enforces.

## Contracts

- `autonomousModeGate(candidate)` → `proceed | hold | escalate`, tier-driven:
  - experimental → may auto-approve `{docs, dep_patch, tests, small_fix}`
  - standard → `{docs, dep_patch, tests}`
  - critical → `{docs}`
  - **`prod_deploy` and `graduation` are in no tier's set — always a human.**
- **Fail closed, everywhere.** Unknown tier → treated as critical; unknown
  class → escalate; denylist hit → escalate (checked first — overrides
  everything, even a human-approved prod deploy); oracle not explicitly green
  → hold; missing cost caps → the breaker trips → hold (transient, retry
  later). A dead or garbled input never yields `proceed`.
- A prod deploy needs BOTH: the registry flag exactly `"SHIP"` AND a recorded
  human approval.
- Incidents: severity ladder + ack-timeout; the dead-man's-switch escalates
  any unacked incident past its timeout — a CTO gone dark must not silently
  sit on an incident.
- Gate outcomes map 1:1 onto `APPROVE / REVISE / BLOCK`, and **every outcome
  appends an `AUDIT_LEDGER_ENTRY` to `fleet/ledger.jsonl`** — the single
  global ledger. The registry stores no history; a skipped ledger write is a
  governance failure.
- Paste `governance.js` into consumers; never import. The gate is a pure
  function of the candidate facts, so a fresh session derives them from the
  registry and gets the identical decision — no conversation history needed.

## Resources

- `assets/governance.js` — the paste-in policy module (`AUTONOMY_MATRIX`,
  `autonomousModeGate`, `prodDeployRule`, `costBreaker`, `denylistViolation`,
  `incidentResponse`, `verdictForGate`, `governanceLedgerEntry`).
- `assets/governance.example.js` — runnable self-test of every gate branch
  (`node governance.example.js`) — executable documentation of what
  auto-approves.
- `references/` — the matrix and evaluation order, prod/cost rules, ledger
  contract, incident ladder, boundaries and persistence.
