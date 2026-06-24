---
name: cto-governance-spine
description: Use when an autonomous fleet needs the POLICY contract every loop/schedule/webhook trigger runs through before acting — the rules that bound what the CTO may do unsupervised. Owns the autonomous-mode-gate (a tier-driven ENUMERATED allow-list, never an LLM confidence score), the prod-deploy HOLD rule (flag SHIP AND a human), the cost circuit-breaker, the per-app denylist refusal, the incident severity ladder + ack-timeout + dead-man's-switch, and the single append-only global audit ledger. READS fleet-registry data and ENFORCES on it; mechanism lives in workflow-runtime; loop-supervisor only INFORMS, never enforces. Deterministic by design — pure functions, no agents. Triggers on "autonomous-mode-gate", "what may auto-approve vs escalate", "prod-deploy HOLD rule", "cost circuit-breaker", "escalation ladder", "ack-timeout", "dead-man's-switch", "audit ledger", "governance policy", "may the CTO do this unsupervised".
---

# CTO governance spine

The **policy contract** every trigger runs through before the CTO acts. A cron
sweep wants to merge a dependency bump; a webhook incident wants to ship a fix; a
build loop wants to auto-merge a PR — each must first pass the gate defined here.
This is the layer that bounds an autonomous system to the rails: it decides what
may happen **unsupervised** and what must **escalate to a human**.

It is consumed by every acting skill (`orchestrated-delivery`'s merge step,
`fleet-maintenance`'s fix step (planned), `autonomous-build-loop`) — they paste the
policy module and call the gate before committing to an action — and it writes the one
audit ledger the whole fleet is judged by.

## Deterministic by design — the gate is an allow-list, not a vibe

The single most important property of this skill (§6 L4): the autonomous-mode-gate
is an **enumerated allow-list**, evaluated by **deterministic functions** — never
an LLM "confidence" score. Confidence is exactly the rubber-stamp the whole
adversarial regime exists to distrust; a system that auto-approves because a model
*felt* sure has no real gate. So `assets/governance.js` contains **no `agent()`
calls** — every decision is a matrix lookup plus precondition checks with one
correct answer. That is the point, not a limitation. (Quality *judgment* —
adversarial-verify, peer review — lives in the loop skills + workflow-runtime;
governance is policy, and policy must be mechanical.)

## The three boundaries that define this skill

| Layer | Owner | What it does |
|---|---|---|
| **Data** | `fleet-registry` | STORES per-app facts (the prod flag, cost caps, denylist, tier, oracle command). |
| **Policy** | **cto-governance-spine** (here) | READS those facts and ENFORCES rules on them. |
| **Mechanism** | `workflow-runtime` | the runner + canon (verdict/ledger schemas, fan-out patterns). |

And a fourth, the separation of powers (§6 L4): governance **ENFORCES** (it can
hold, escalate, refuse); `loop-supervisor` only **INFORMS** (read-only
outlier/regression analysis, never blocks). Two different jobs — keep them apart.

Concretely: the registry has a `merge_deploys_to_prod` field and a fail-closed
reader; governance has the *rule* that consumes it. The registry has `cost_caps`
numbers; governance has the *circuit-breaker* that trips on them. The registry
has a per-app `denylist`; governance has the *refusal*. Nouns there, verbs here.

## The autonomous-mode-gate (the core)

`autonomousModeGate(candidate)` returns `proceed | hold | escalate` for a single
proposed action. It is **tier-driven**: the app's `governance_tier` (from the
registry) selects the set of decision classes auto-approvable at that tier.

```
AUTONOMY_MATRIX:
  experimental → { docs, dep_patch, tests, small_fix }
  standard     → { docs, dep_patch, tests }
  critical     → { docs }
prod_deploy + graduation → in NO tier's set; always a human gate.
```

Evaluation order is fail-closed, highest-stakes first (full spec:
`references/autonomous-mode-gate.md`):

1. **Unknown tier → treated as `critical`** (most restrictive); **unknown
   decision class → escalate.**
2. **Denylist hit → escalate** — an absolute refusal, checked FIRST so it overrides
   even a human-approved prod deploy (surface the specific hit to a human).
3. **`graduation` → escalate** (always human). **`prod_deploy` → the HOLD rule**
   (flag SHIP *and* a human approval, else hold/escalate).
4. **Class not on the tier's allow-list → escalate** (a human decides).
5. **Class on the allow-list but oracle not green** (for any non-`docs` class)
   **→ hold**; **cost-breaker not clear → hold** (transient, retry later).
6. **Otherwise → proceed** (auto-approve).

`proceed`/`hold`/`escalate` map 1:1 to the canon `APPROVE`/`REVISE`/`BLOCK`
(`verdictForGate`), so every gate outcome writes a clean `AUDIT_LEDGER_ENTRY`.

## The other deterministic gates

- **Prod-deploy HOLD rule (D3)** — `prodDeployRule(prodFlagShip, humanApproval)`:
  the registry's fail-closed read says whether the flag is SHIP; this rule adds
  the human. A prod deploy needs BOTH. See `references/prod-and-cost.md`.
- **Cost circuit-breaker (§7.7)** — `costBreaker(usage, caps)`: hard caps from the
  registry (`usd_per_day`, `max_prs_per_day`, `max_concurrent_sessions`). A trip
  is a transient HOLD, not an escalation. Missing caps fail closed (trip). See
  `references/prod-and-cost.md`.
- **Denylist refusal** — `denylistViolation(paths, denylist)`: a per-app denylist
  hit escalates; composes with (does not replace) the harness L1 floor.
- **Incident severity ladder + ack-timeout + dead-man's-switch (§7.2)** —
  `incidentResponse(severity, acked, ageMinutes)`: sev1/2/3 → required response +
  ack-timeout. If the CTO hasn't ACKed within the timeout, the dead-man's-switch
  escalates regardless of severity — a CTO gone dark must not silently sit on an
  incident. See `references/incident-and-escalation.md`.

## The single global audit ledger

Governance owns **one** append-only ledger — `fleet/ledger.jsonl` — recording
every gate outcome across the whole fleet as a canonical `AUDIT_LEDGER_ENTRY`
(`governanceLedgerEntry`). This is the single source of audit truth; the
**registry stores no audit history** (`state.json` is hot operational state only).
A silently-failing ledger makes every "auditable" claim false, so writing it is
not optional. See `references/audit-ledger.md`.

## Canon & mechanism (workflow-runtime)

Because the gate is deterministic, the "mechanism" is a **paste-in policy module**
(`assets/governance.js`), not a Workflow fan-out — there is nothing to fan out, and
making the gate an LLM call would reintroduce the rubber-stamp it exists to prevent.
A consumer adopts it the same way it adopts the workflow-runtime preamble: **paste,
don't import** (the runner has no module loader). Inside a loop skill's Workflow
script (or a plain session step), paste `governance.js`, derive the candidate facts
from the registry, call `autonomousModeGate`, act on the verdict, and append
`governanceLedgerEntry(...)` to `fleet/ledger.jsonl`:

```js
// inside e.g. orchestrated-delivery's merge step, before auto-merging:
const decision = autonomousModeGate({
  decision_class: "small_fix", tier: cfg.governance_tier,
  oracle_green: smokePassed, cost_ok: costBreaker(usage, cfg.cost_caps).ok,
  is_prod_deploy: false, denylist_hit: denylistViolation(touched, cfg.denylist),
  human_approval: null,
});
if (decision.gate_decision !== "proceed") escalateToHuman(decision.reasons);
appendLedger(governanceLedgerEntry(decision, { app_id: cfg.app_id })); // → fleet/ledger.jsonl
```

`assets/governance.example.js` is `governance.js` verbatim + a runnable battery
(`node governance.example.js`) that exercises every gate branch — executable
documentation of exactly what auto-approves, and the deterministic self-test.

## Persistence / resume (no prior session context)

A trigger may wake a brand-new session. Everything needed to enforce policy must
reconstruct from durable state — **gh + git + repo docs + the registry + a memory
note** — never from conversation history. The gate is a pure function of the
candidate facts, so a fresh session derives those facts from the registry and gets
the identical decision. See `references/boundaries-and-persistence.md`.

## What this skill deliberately does NOT do

- Make a *quality* judgment (is this code correct?) — that is adversarial-verify
  in the loop skills + workflow-runtime. Governance gates *class and
  preconditions*, not correctness.
- Store per-app data — that is `fleet-registry`. Governance reads it.
- Do read-only oversight / regression analysis — that is `loop-supervisor`, which
  informs and never enforces.
- Use an LLM confidence score to auto-approve — forbidden by construction.

## Hard rules

- **Allow-list, never confidence.** Auto-approval is membership in an enumerated,
  tier-keyed set evaluated deterministically. No `agent()` decides whether to
  proceed.
- **Fail closed, everywhere.** Unknown tier → critical; unknown class → escalate;
  missing cost caps → trip; oracle not explicitly green → hold; a dead/garbled
  input never yields `proceed`.
- **prod_deploy and graduation are always human.** No tier auto-approves them.
- **One global ledger; the registry holds no history.** Every gate outcome appends
  to `fleet/ledger.jsonl`. A skipped ledger write is a governance failure.
- **Enforce here; inform in loop-supervisor.** Never let the read-only supervisor
  block, and never let governance's enforcement degrade to advisory prose.
- **Paste, don't import.** `governance.js` is inlined into consumers; there is no
  module loader.

## Resource map

- **`assets/governance.js`** — the paste-in deterministic policy module:
  `AUTONOMY_MATRIX`, `autonomousModeGate`, `prodDeployRule`, `costBreaker`,
  `denylistViolation`, `incidentResponse`, `verdictForGate`, `governanceLedgerEntry`.
  No import, no agents.
- **`assets/governance.example.js`** — `governance.js` + a runnable self-test
  battery covering every gate branch.
- **`references/autonomous-mode-gate.md`** — the tier × class matrix, evaluation
  order, fail-closed defaults, the allow-list-not-confidence principle.
- **`references/prod-and-cost.md`** — the prod-deploy HOLD rule (D3) + the cost
  circuit-breaker (§7.7).
- **`references/audit-ledger.md`** — the single global `fleet/ledger.jsonl`
  contract; what governance writes vs what the registry must NOT.
- **`references/incident-and-escalation.md`** — the severity ladder, ack-timeout,
  dead-man's-switch, and denylist refusal.
- **`references/boundaries-and-persistence.md`** — data/policy/mechanism +
  enforce/inform boundaries, and the no-prior-context persistence/resume contract.
