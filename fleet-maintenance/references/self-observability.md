# CTO self-observability (`_cto-self`, §7.6)

The design flagged a gap: the fleet watches its apps, but nothing watches the
**watcher**. Are crons actually firing? Is a session hung holding a lease? Is the
audit ledger actually being written, or silently failing (which would make every
"auditable" claim false)? v1 closes this cheaply by monitoring the orchestration
layer **as if it were an app** — `fleet/apps/_cto-self/`.

## The heartbeat

Every sweep runs `selfHeartbeat(input)` (`assets/maintenance.js`) — deterministic,
no agents, fail-closed. Three checks:

1. **Cron liveness** — did the last scheduled sweep fire within its window?
   `cron_age_min > max_cron_age_min` → **sev1** "cron overdue" (the scheduler may
   be dead). A *missing* `cron_age_min` is itself a sev1 (can't confirm it fired).
2. **Stale leases** — any app whose registry lease is past expiry is a session
   that likely died holding the lock → **sev2**, listing the apps. (Derive the
   list with the registry's `leaseState(state, nowTs) === "stale"`.)
3. **Ledger growth** — if writes were expected this window but
   `ledger_curr <= ledger_prev`, the ledger may be failing silently → **sev1**.
   If counts can't be supplied while writes were expected → **sev2** (unverifiable).

The caller supplies durations/counts (a Workflow script has no clock); the checks
themselves are pure.

## Escalate, never auto-fix

`selfHeartbeat` returns `action: "escalate"` on any miss — **never** `auto_fix`.
You do not let the watchdog repair itself: a CTO that's gone dark, hung, or whose
ledger is broken needs a human, not an autonomous "fix" running on the same
possibly-broken substrate. The miss surfaces as an escalation in the sweep result
(and an `_cto-self` entry in `fleet/ledger.jsonl`, when it can still be written).

## Why this rides the same engine

Treating the CTO as a registry-enrolled app means self-observability reuses the
exact monitor→assess→escalate path, with no special-case machinery. `_cto-self`
has no smoke oracle to run and no fix to delegate — its only outcomes are healthy
or escalate — which is exactly right for a watchdog: it reports, a human acts.

## What v1 does NOT cover

This is a liveness heartbeat, not full observability. It does not trace individual
session token spend, build a CTO dashboard, or page on its own (paging is the
governance incident ladder's job once an escalation is raised). Those are
follow-ons; v1's job is to make "the CTO went dark / the ledger broke" a
**detected, escalated** event rather than a silent one.
