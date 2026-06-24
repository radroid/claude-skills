# Backlog + triage

## Per-app `maintenance.md`

Each app's triaged maintenance backlog lives at
`fleet/apps/<app-id>/maintenance.md`, reusing `orchestrated-delivery`'s backlog +
`Progress` format so the fix step plugs straight in, and matching the registry's
per-app lease (one app's backlog churns independently). Shape:

```markdown
# Maintenance backlog — <app-id>

Progress: <current item id, or "idle">

## Backlog (severity-ranked)
- [sev1] oracle: smoke oracle FAILING — <first_seen> (in_progress)
- [sev2] security: 1 open CVE, worst=high — <first_seen>
- [sev3] deps: 9 outdated dependencies — <first_seen>

## Done
- [sev2] error_rate: spike from deploy abc123 — closed <date> (PR #N)
```

Why per-app (not one global queue): it plugs directly into orchestrated-delivery's
per-backlog model, respects the D2 per-app lease, and keeps one app's churn off
another's history. A cross-fleet severity view, when wanted, derives from the
per-app files + the global `fleet/ledger.jsonl` — it is a read, not a second
source of truth.

## Backlog items

`mergeBacklog` produces items shaped:

```
{ app_id, category, severity, source, title, detail, status, first_seen, last_seen }
```

- `category` ∈ `oracle | availability | error_rate | latency | security | deps | unverified | self`.
  (`self` is the CTO self-heartbeat's own category — see `references/self-observability.md`.)
- `severity` ∈ `sev1 | sev2 | sev3` (maps to the governance incident ladder).
- `source` ∈ `poll | webhook | hygiene | self`.
- `status` ∈ `open | in_progress | held | done`.
- Dedupe key is `(app_id, category, title)` — a recurrence refreshes `last_seen`
  and may **worsen** severity, never silently improves while open.

## Triage order

`rankBacklog` orders open items sev1 → sev3 (done last). The session works the top
open item: the most urgent across an app. A sev1 is an incident → it runs the
governance incident ladder (severity + ack-timeout + dead-man's-switch) before any
fix is even considered.

## Diagnose (the agent step)

For a sev1/sev2 item, a diagnosis agent (in the sweep, or re-run at fix time)
produces a **root cause** + a **suggested fix class** (a governance decision
class) + a confidence. It does NOT write the fix. Crucially, the diagnosis can
return `escalate` as the fix class when no safe autonomous fix exists from the
observations alone — and SHOULD, because (a) the governance gate will HOLD any
behavior-touching fix while the oracle is red anyway, and (b) a broad correlated
sev1 (availability + error-rate + oracle all red at once) is usually one
regression needing a human, not a one-liner. The diagnosis feeds the governance
gate (`references/fix-pipeline.md`); it is the suggestion, not the authorization.

## What stays out of the backlog

The backlog is operational health work. It is NOT a feature backlog (that's
`GOALS.md` / the build loop) and NOT the audit history (that's
`fleet/ledger.jsonl`). Keep it to what the fleet must FIX to stay healthy.
