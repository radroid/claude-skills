# Monitoring + ingestion

Two paths feed the maintenance backlog. v1 enables the scheduled poll-sweep and
ships the webhook adapter gated off (D2: build for webhooks early, enable the
surface last — after the auth/dedupe guards are proven).

## Scheduled poll-sweep (ENABLED in v1)

`assets/monitor-sweep.workflow.js`, run on a schedule. Per sweep:

1. Read the registry for every `active` app (skip `retired`/`quarantined`). The
   sweep **enforces this defensively** — it filters out any app whose registry
   `state.status` is `retired`/`quarantined` rather than trusting the caller to
   pre-filter (an absent/`active` status is swept; only an explicit retire/quarantine
   removes an app), and reports `counts.skipped`.
2. For each app, **acquire its D2 lease** before touching it (one writer per app;
   a held lease → back off, another session owns it). The sweep is a `pipeline()`
   fan-out — apps are assessed concurrently, each behind its own lease.
3. **Gather signals** (the agent-I/O step): run the registry `smoke_oracle`,
   read `/health`, error-tracking (error rate), p95 latency, availability, open
   CVEs, outdated deps. Returns the typed `SIGNALS_SCHEMA` object — `oracle_pass`
   MUST reflect the real oracle result.
4. **Assess deterministically** (`healthAssess` — NOT an agent) against the app's
   registry `slo`, producing severity-ranked observations.
5. **Dedupe + merge** into `fleet/apps/<id>/maintenance.md` (`mergeBacklog`).
6. **Diagnose** the urgent ones (agent), and emit one `AUDIT_LEDGER_ENTRY` per app.

### The signals it reads

| Signal | Source | Compared against |
|---|---|---|
| `oracle_pass` | registry `smoke_oracle.command` | must be true (red oracle = sev1) |
| `availability_pct` | uptime / health checks | `slo.availability_target_pct` |
| `error_rate_pct` | error-tracking (PostHog/Sentry) | `slo.error_rate_target_pct` |
| `p95_latency_ms` | APM / health | `slo.p95_latency_ms` |
| `open_cves` | dependency/security scan | any open (security mode) |
| `deps_outdated` | dependency scan | any outdated (hygiene mode) |

## Webhook-alert adapter (BUILT, GATED OFF in v1)

The same backlog can be fed by inbound alerts (Sentry incident, Dependabot,
uptime monitor), routed by the registry's per-app `triggers.webhook_ids`. This
path is built but **disabled** until two guards are proven, because a spoofed
alert is a code-injection / cost-amplification vector (§7.4), not just noise:

- **Webhook authentication** — verify the alert's signature/secret before
  ingesting. An unauthenticated alert is dropped, logged, never actioned.
- **Trigger dedupe** — the registry lease IS the dedupe: a duplicate alert for an
  app whose lease is held finds it busy and coalesces rather than spawning a
  second session. Cross-check the alert's idempotency key against open backlog
  items (`mergeBacklog` already dedupes by `(app_id, category, title)`).

Until both hold, the adapter stays off; the poll-sweep covers v1. Flip it on
per-app once the guards are validated on a sacrificial app.

## Ingest + dedupe + severity-rank (deterministic)

All three are pure functions in `assets/maintenance.js`:

- **Assess** — `healthAssess(signals, slo)`: oracle-red → sev1; availability/error
  far below SLO → sev1, slightly → sev2; latency → sev2/sev3; CVEs → sev1/2/3 by
  worst severity; outdated deps → sev3. **Fail-closed:** missing signals → an
  `unverified` observation (never silent "healthy"); an unknown severity sorts as
  MOST urgent.
- **Dedupe + merge** — `mergeBacklog(existing, incoming, nowTs)`: an open item with
  the same `(app_id, category, title)` refreshes in place (and may **worsen** in
  severity); a new key is appended `open`; `done` items don't dedupe (a recurrence
  is a new item).
- **Rank** — `rankBacklog`: open items by severity sev1 → sev3, `done` last.

Determinism is the point: a watchdog that decided health with an LLM's "looks
fine" would be the rubber-stamp the whole regime distrusts.
