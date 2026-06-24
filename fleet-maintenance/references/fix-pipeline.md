# The fix pipeline + modes

fleet-maintenance never fixes directly (D5). It diagnoses, gates, and delegates —
the per-PR fix is `orchestrated-delivery`'s job. The full path for the top backlog
item:

```
diagnose → GATE (cto-governance-spine) → fix (orchestrated-delivery)
   → adversarial-verify (non-negotiable, inside orchestrated-delivery)
   → prepare-and-HOLD on prod → on a prod break: revert (D4)
```

## 1. Diagnose

An agent root-causes the item and suggests a fix class (a governance decision
class) — or `escalate` if no safe autonomous fix exists. See
`references/backlog-and-triage.md`.

## 2. Gate (cto-governance-spine)

Paste `cto-governance-spine`'s `governance.js` and call `autonomousModeGate` with
the candidate derived from the registry + the diagnosis:

```js
const decision = autonomousModeGate({
  decision_class: diagnosis.suggested_fix_class,   // e.g. "dep_patch"
  tier: cfg.governance_tier,                       // from the registry
  oracle_green: signals.oracle_pass === true,
  cost_ok: costBreaker(usage, cfg.cost_caps).ok,
  is_prod_deploy: false,                           // the FIX is a PR, not a deploy
  denylist_hit: denylistViolation(touched, cfg.denylist),
  human_approval: null,
});
```

- `proceed` → fix autonomously (step 3).
- `hold` → defer (oracle red / cost cap tripped) — leave the item open, retry next
  sweep. Note: an oracle-red app HOLDs every non-`docs` fix, so a broken app is
  usually escalated by diagnosis rather than auto-fixed.
- `escalate` → a human (out-of-allow-list class, a denylist hit, or a sev1
  incident). Append the escalation to the backlog + ledger; do not fix.

Append the `governanceLedgerEntry(decision, ...)` to `fleet/ledger.jsonl` either
way (the gate outcome is audit truth).

## 3. Fix (orchestrated-delivery)

Hand the item to `orchestrated-delivery` as a one-item backlog: planner →
executor → reviewer → fix → merge. Its **non-negotiable adversarial-verify**
review gate (`review-and-verify.workflow.js`) applies unchanged — fleet-maintenance
does not re-implement or weaken it. A maintenance fix is held to the same bar as a
feature: a reviewer-authored test + the runtime smoke oracle (NO self-marked
homework).

## 4. Prepare-and-HOLD on prod

For a prod-deploying app, the fix lands as a prepared PR and **HOLDs** — the
governance prod-deploy rule needs the registry flag SHIP *and* a human approval.
fleet-maintenance never auto-deploys to prod. The prepared PR + the held state is
the morning handoff.

## 5. Revert (D4) — prod-deploying apps only

If a shipped fix breaks prod (the next sweep sees the oracle go red / SLOs breach
right after a deploy), invoke the registry's `config.revert_command` to restore
`state.last_known_good`. Reverting is itself an action — it runs through the gate
(an incident-class, typically `escalate` for a human's go-ahead unless policy
pre-authorizes a known-good rollback). Non-prod-deploying apps have nothing to
revert.

## Modes — same engine, different backlog source

Hygiene and incident response are not separate skills; they are how an item
ENTERS the same monitor→backlog→gate→fix engine:

- **Dependency / security hygiene** — a scheduled dep/security scan emits
  `deps`/`security` observations (sev3 hygiene; sev1/2 for a critical/high CVE).
  Batched, low-urgency, auto-approvable at the app's tier when it's a `dep_patch`
  with a green oracle.
- **Incident response** — a poll-detected sev1 breach (or a gated webhook alert)
  emits a high-severity item that first runs the governance **incident ladder**
  (`cto-governance-spine` `incidentResponse`: severity + ack-timeout +
  dead-man's-switch) — escalating to a human on sev1 or on an unacked timeout —
  before any fix is attempted.

The only thing that differs by mode is the ingestion adapter and the severity; the
gate, the fix substrate, and the prod-HOLD are identical.
