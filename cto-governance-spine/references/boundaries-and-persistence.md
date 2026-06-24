# Boundaries + persistence/resume

## The boundaries governance must hold

Four lines, each of which the §5 critique warned would drift if blurred:

1. **Data vs policy.** `fleet-registry` STORES facts (the prod flag, cost caps,
   denylist, tier, oracle command). cto-governance-spine READS those facts and
   ENFORCES rules on them. A *noun* (a value an app has) is registry; a *verb* (a
   decision about an app) is governance. If you are about to add a field, it
   belongs in the registry; if you are about to add an `if` that *decides*, it
   belongs here.
2. **Policy vs mechanism.** `workflow-runtime` owns the runner, the canon schemas
   (verdict, ledger), and the fan-out/adversarial-verify patterns. Governance owns
   the *rules*. Governance writes entries to the canon `AUDIT_LEDGER_ENTRY` shape;
   it does not redefine the schema.
3. **Policy vs quality judgment.** Governance gates *class and preconditions*
   deterministically (may this kind of action proceed unsupervised, given the
   oracle/cost/flag facts?). Whether the *code is correct* is a quality judgment —
   adversarial-verify / peer review in the loop skills. Never collapse the two: a
   correctness verdict is an LLM judgment; an autonomy verdict must not be.
4. **Enforce vs inform.** Governance ENFORCES — it can hold, escalate, refuse.
   `loop-supervisor` only INFORMS — read-only outlier/regression analysis over the
   ledger, surfacing patterns, never blocking. Two jobs, kept apart (§6 L4): the
   enforcer must be able to stop the line; the observer must never be mistaken for
   one that can.

### The loop-supervisor split, concretely

Both governance and a generalized loop-supervisor want to "read the ledger and do
analysis." The line: governance reads the ledger to **decide and gate in the
moment**; loop-supervisor reads it **after the fact to inform humans** (KPIs,
regressions, "auto-approve rate climbing at tier X"). loop-supervisor's output is
a report; governance's output is a `gate_decision`. If loop-supervisor ever needs
to *act* on what it finds, it routes that action back through the
autonomous-mode-gate like any other actor — it does not enforce directly.

## Persistence / resume — no prior session context

A schedule or webhook trigger can wake a **brand-new session** with no memory of
anything. Governance must enforce identically from cold. This works because the
gate is a **pure function of the candidate facts**, and every fact is durable:

1. **The registry** (`fleet/apps/<id>/`) — tier, prod flag, cost caps, denylist,
   oracle. A fresh session reads these directly.
2. **The ledger** (`fleet/ledger.jsonl`) — the full audit history; what was
   already gated/approved.
3. **gh + git** — open PRs, merged commits, in-flight branches (a dead session's
   pushed branch survives and is resumable).
4. **A durable memory note** — live program intent (current item, held items,
   prior human decisions) so a fresh session reconstructs *intent*, not just
   mechanics.

No conversation transcript is required, and none should be relied on. Derive the
candidate facts from (1)–(4), call `autonomousModeGate`, and a cold session
reaches the identical decision a warm one would — that determinism is exactly why
governance is safe to run unattended across session deaths, rate limits, and
compaction.

## When unattended (the standing constraint)

When the user is away and a merge would deploy to production: **prepare PRs and
HOLD** — the prod-deploy rule already forces this (no human approval ⇒ escalate),
but the operational posture is explicit: never deploy to prod unsupervised, never
mutate production data without explicit, current consent. The gate makes this
mechanical; do not work around it.
