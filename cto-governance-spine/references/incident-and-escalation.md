# Incident severity ladder, ack-timeout, dead-man's-switch

The design (§7.2) flagged that incident escalation was "a gesture, not a
contract." This is the contract: a deterministic severity ladder, an ack-timeout,
and a dead-man's-switch for the CTO itself going dark mid-incident.

## Severity ladder

`incidentResponse(severity, acked, ageMinutes)` reads `SEVERITY_LADDER`:

| Severity | Meaning | Action | Ack-timeout | Page human |
|---|---|---|---|---|
| `sev1` | prod down / data at risk | `escalate` | 15 min | yes |
| `sev2` | degraded / partial | `escalate` | 60 min | no |
| `sev3` | minor / cosmetic | `auto_triage` | 240 min | no |

- `escalate` — a human must be brought in now (sev1 also pages).
- `auto_triage` — the CTO may triage/fix under the normal autonomous-mode-gate
  (a sev3 fix is still subject to the tier allow-list, oracle, and cost gates).

**Unknown severity → treated as `sev1`** (fail-closed: an unclassifiable incident
is assumed worst-case, not ignored).

## Ack-timeout + dead-man's-switch

The dead-man's-switch is the answer to "what if the CTO goes dark mid-incident?"
If an incident has **not been ACKed** within its severity's ack-timeout (the
caller supplies `ageMinutes` from its own clock), `incidentResponse` returns
`escalate` **regardless of severity** — even a sev3 that has sat unacknowledged
past its window gets escalated to a human. A CTO that silently sits on an open
incident is the failure mode this prevents.

This requires the orchestration layer to actually emit a liveness/ack signal
(§7.6 — observability of the CTO itself). The switch is only as good as the
heartbeat feeding it: if no one records the ACK, every incident eventually
escalates — which is the safe direction, but a noisy one, so wire the ACK.

## Denylist refusal

`denylistViolation(touchedPaths, denylist)` is the per-app refusal: any touched
path matching a per-app denylist glob (`*.env`, `infra/**`, `secrets/*`, …) makes
the autonomous-mode-gate **escalate** — a refusal surfaced to a human, never a
silent skip. This composes with the harness L1 floor (auto-loop-bootstrap's
settings denylist on `.env`/secrets/`rm -rf`/force-push/prod deploys): L1 is the
hard structural floor re-applied every session; the per-app denylist is the
app-specific extension governance enforces on top.

## What governance does NOT decide here

Governance decides the *response class* (escalate / auto-triage / page) and the
dead-man's-switch. It does NOT diagnose the incident, write the fix, or run the
oracle — those are `fleet-maintenance` + the loop skills, each of which still
passes its proposed fix back through the autonomous-mode-gate before acting.
