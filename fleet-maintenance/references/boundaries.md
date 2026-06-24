# Boundaries — what fleet-maintenance owns vs delegates

fleet-maintenance is a **standalone** engine (D5) that sits ON TOP of the whole P0
spine. Holding these lines is what keeps it thin (the novel surface is just
telemetry → backlog + the maintenance gates) instead of a re-implementation of
everything below it.

| Concern | Owner | fleet-maintenance's role |
|---|---|---|
| Per-app facts (SLOs, oracle, lease, caps, denylist, flag) | `fleet-registry` | READS them |
| May this action run unsupervised? | `cto-governance-spine` | ASKS the gate, never self-authorizes |
| The per-PR fix (plan→exec→review→merge) | `orchestrated-delivery` | DELEGATES to it |
| The runner + canon schemas | `workflow-runtime` | RUNS on it (the sweep is a Workflow) |
| Read-only oversight / regression analysis | `loop-supervisor` | distinct — supervisor INFORMS |
| **Telemetry → ranked backlog; the self-heartbeat** | **fleet-maintenance** | **OWNS** |

## What it owns (the novel surface)

- **Telemetry → backlog.** Gathering signals, the deterministic `healthAssess`,
  dedupe + severity-rank into the per-app `maintenance.md`. This is the genuinely
  new mechanism the fleet had nothing for.
- **The maintenance loop's orchestration.** Sequencing monitor → triage →
  gate → delegate → prepare-and-HOLD → revert, per trigger.
- **The CTO self-heartbeat** (`_cto-self`, §7.6).
- **The ingestion adapters** (poll-sweep enabled; webhook gated) and the
  hygiene/incident **modes** (which are just backlog sources).

## What it delegates (and must NOT re-implement)

- **The fix.** `orchestrated-delivery` runs planner → executor → reviewer → fix →
  merge with its non-negotiable adversarial-verify. fleet-maintenance hands it a
  one-item backlog; it does not re-author review logic, verdict grammar, or merge
  discipline.
- **The autonomy decision.** `cto-governance-spine`'s `autonomousModeGate` decides
  proceed/hold/escalate. fleet-maintenance computes the candidate facts and asks;
  it does not encode its own allow-list.
- **The data.** `fleet-registry` is the source of truth. fleet-maintenance writes
  per-app `maintenance.md` (operational backlog) and reads everything else; it
  does NOT duplicate registry fields or hold audit history (that's
  `fleet/ledger.jsonl`, governance-owned).

## The D5 line, restated

The §5 critique asked whether MAINTAIN is "just orchestrated-delivery with a
different backlog source" — i.e. a mode + a thin trigger adapter rather than a
standalone skill. D5 resolved it standalone, and this is why: the monitoring,
deterministic health assessment, the per-app backlog dedupe, the self-heartbeat,
and the prepare-and-HOLD/revert seam are real, reusable surface that does NOT
belong inside the per-PR fix loop. But the resolution comes with the obligation
above: standalone does not mean self-contained — the *fix itself* still routes
through orchestrated-delivery, or the skill has drifted into a re-implementation.

## Persistence / resume

A trigger may wake a fresh session. Everything to resume lives in durable state:
the registry (`active` apps, SLOs, leases), the per-app `maintenance.md` backlogs
(current `Progress` + open items), and `fleet/ledger.jsonl` (what was already
gated/done). No prior conversation context is required — the next sweep
reconstructs the fleet's health state from the registry + backlogs and continues.
