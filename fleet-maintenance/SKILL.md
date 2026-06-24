---
name: fleet-maintenance
description: Use when an autonomous fleet needs the MAINTAIN pillar — keeping a fleet of production apps healthy on schedule/webhook triggers. Monitors each registry-enrolled app (a scheduled poll-sweep enabled in v1; a webhook-alert adapter built but gated off until auth+dedupe are proven), deterministically assesses health signals against the app's SLOs into severity-ranked observations, dedupes them into a per-app maintenance backlog, diagnoses the urgent ones, then GATES every fix through cto-governance-spine and DELEGATES the per-PR fix to orchestrated-delivery (non-negotiable adversarial-verify; prepare-and-HOLD on prod; revert via the registry's last-known-good). Dependency/security hygiene and incident response are MODES, not separate skills. Also runs the CTO self-heartbeat (_cto-self). Standalone engine (D5). Triggers on "fleet maintenance", "monitor the fleet", "health sweep", "maintenance backlog", "triage + autonomous fix", "dependency/security hygiene", "incident response", "CTO heartbeat", "is the fleet healthy".
---

# Fleet maintenance

The **MAINTAIN pillar** in one engine: keep a fleet of production apps healthy,
unattended, on schedule/webhook triggers. For each app it watches the health
signals, turns problems into a severity-ranked backlog, and drives each fix
through the same gated, adversarially-verified pipeline the build loop uses —
stopping at prepare-and-HOLD on anything that would touch production.

It is the first skill that **consumes the whole P0 spine**: it READS the
`fleet-registry` (which apps, their SLOs, oracle, lease, cost caps), GATES every
action through `cto-governance-spine` (may this run unsupervised?), runs on the
`workflow-runtime` canon (the sweep is a Workflow fan-out), and DELEGATES the
actual per-PR fix to `orchestrated-delivery`. It is a **standalone** engine (D5) —
it does not re-implement the fix loop; its novel surface is *telemetry → ranked
backlog* + trigger plumbing + the maintenance-specific gates.

## The loop (per trigger)

```
monitor → ingest + dedupe + severity-rank → triage + diagnose
   → GATE (cto-governance-spine) → fix (orchestrated-delivery)
   → adversarial-verify (non-negotiable) → prepare-and-HOLD on prod
   → on a prod break: revert to last-known-good (D4)
```

Plus, every sweep, the **CTO self-heartbeat** (`_cto-self`). The macro-loop stays
SESSION-driven (a Workflow run is one bounded sweep, not a multi-day
orchestration); persistence is the registry + the per-app backlog + the ledger.

## Monitoring — poll now, webhook built-but-gated (D2)

Two ingestion paths, per the design's "build for webhooks early, enable the
surface last":

- **Scheduled poll-sweep (ENABLED in v1).** `assets/monitor-sweep.workflow.js`
  fans out over the registry's `active` apps, gathers each app's signals (the
  registry `smoke_oracle` result, `/health`, error-tracking, p95, availability,
  open CVEs, outdated deps), and assesses them. Each app's probe acquires the
  registry's D2 lease first (one writer per app).
- **Webhook-alert adapter (BUILT, GATED OFF in v1).** The same backlog can be fed
  by inbound alert webhooks (Sentry/Dependabot/uptime), routed by the registry's
  per-app `triggers.webhook_ids`. This path ships behind a **webhook-auth +
  trigger-dedupe guard** and stays disabled until those guards are proven (§7.4 —
  a spoofed alert is a code-injection vector, not just cost). See
  `references/monitor-and-ingest.md`.

## Assessment is DETERMINISTIC — agents gather and diagnose, never rank

The same discipline as `cto-governance-spine`: turning signals into a
severity-ranked backlog is a **pure function** (`healthAssess` in
`assets/maintenance.js`), not an LLM judgment — a rubber-stamped "looks healthy"
is exactly what a fleet watchdog must not do. Agents are used ONLY for **I/O**
(gathering an app's live signals) and **judgment** (diagnosing a detected issue's
root cause). The ranking itself is mechanical and **fail-closed**: a missing or
garbled signal yields an `unverified` observation, never a silent "healthy" — you
do not get to look healthy by withholding data.

## The backlog — per-app `maintenance.md`

Each app's triaged backlog lives at `fleet/apps/<app-id>/maintenance.md`, reusing
`orchestrated-delivery`'s backlog + `Progress` format so the fix step plugs
straight in, and matching the registry's per-app lease (one app's backlog churns
independently of another's). Items are deduped by `(app_id, category, title)` — a
recurring issue refreshes in place (and may worsen in severity) rather than
piling duplicates every sweep — and severity-ranked sev1 → sev3. See
`references/backlog-and-triage.md`.

## The fix — gated by governance, executed by orchestrated-delivery

fleet-maintenance never fixes directly. For the top backlog item:

1. **Diagnose** (agent) → root cause + a suggested fix class.
2. **Gate** via `cto-governance-spine`'s `autonomousModeGate` with the fix's
   decision class + the app's tier + the oracle/cost facts. `proceed` → fix
   autonomously; `hold` → defer (oracle red / cost cap); `escalate` → a human
   (out-of-allow-list class, prod deploy, denylist hit, or a sev1 incident).
3. **Fix** by handing the item to `orchestrated-delivery` (the per-PR substrate)
   — planner → executor → reviewer → fix → merge, with its **non-negotiable
   adversarial-verify** review gate. fleet-maintenance does not re-implement any of
   this.
4. **Prepare-and-HOLD on prod.** A prod-deploying app's fix is prepared as a PR and
   HELD — the governance prod rule requires a human (never auto-deploy to prod).
5. **Revert (D4).** If a shipped fix breaks prod, invoke the registry's
   `revert_command` to restore `state.last_known_good`. Only for prod-deploying
   apps. See `references/fix-pipeline.md`.

## Modes — hygiene and incidents are backlog sources, not new skills

Dependency/security hygiene and incident response are **modes** of the one engine,
differing only in the backlog SOURCE:

- **Hygiene mode** — a scheduled dependency/security scan feeds `deps`/`security`
  observations into the same backlog (low-severity, batched).
- **Incident mode** — a webhook alert (gated) or a poll-detected sev1 breach feeds
  a high-severity item that runs the governance incident ladder (severity +
  ack-timeout + dead-man's-switch) before any fix.

Same monitor→backlog→gate→fix engine; only the ingestion adapter differs. See
`references/fix-pipeline.md`.

## CTO self-heartbeat (`_cto-self`, §7.6)

The orchestration layer is monitored like an app. Every sweep runs `selfHeartbeat`:
is the last cron fresh? any stale lease (a session that died holding the lock)? is
the audit ledger actually growing? A miss **escalates** to a human and is **never
auto-fixed** — you do not let the watchdog repair itself. See
`references/self-observability.md`.

## Canon & mechanism (workflow-runtime)

- **`assets/maintenance.js`** — the deterministic engine (paste-in, no import, no
  agents): `healthAssess`, `mergeBacklog`/`rankBacklog` (dedupe + severity rank),
  `selfHeartbeat`. The risk surface — and it ships with an exhaustive node
  self-test.
- **`assets/monitor-sweep.workflow.js`** — the canon-bound fan-out: a `pipeline()`
  over the fleet's apps (gather signals → deterministic assess → dedupe), a
  per-app diagnosis agent for the urgent ones, the `_cto-self` heartbeat, and one
  typed `AUDIT_LEDGER_ENTRY` per app. Inlines the canon preamble + `maintenance.js`
  byte-identical (grep-verified); no runtime import.
- **`assets/maintenance.example.js`** — `maintenance.js` verbatim + a runnable
  self-test battery (`node maintenance.example.js`).

## What this skill deliberately does NOT do

- **Fix code directly** — it delegates the per-PR fix to `orchestrated-delivery`
  (D5). Its job is monitor → backlog → gate → delegate.
- **Decide autonomy** — `cto-governance-spine` gates every action; fleet-maintenance
  asks, it does not self-authorize.
- **Store per-app facts** — `fleet-registry` is the source of truth; this reads it.
- **Auto-deploy to prod** — prepare-and-HOLD always; prod needs a human.
- **Rank with an LLM** — `healthAssess` is deterministic and fail-closed.

## Hard rules

- **Monitor deterministically; gather/diagnose with agents.** Ranking is a pure
  function — never an agent's "this looks fine."
- **Fail closed.** A missing/garbled signal → `unverified`, never "healthy". An
  unknown severity sorts as MOST urgent. A self-heartbeat miss escalates.
- **Acquire the registry lease before touching an app** (D2) — one writer per app;
  a held lease means back off.
- **Every fix passes the governance gate AND orchestrated-delivery's
  adversarial-verify.** No self-marked homework, no ungated autonomous merge.
- **Prepare-and-HOLD on prod; revert only via the registry's `revert_command`.**
  Never auto-deploy to prod; never mutate prod data without current human consent.
- **The self-heartbeat escalates, never auto-fixes.** The watchdog does not repair
  itself.
- **Paste, don't import** — `maintenance.js` is inlined into the sweep; there is no
  module loader.

## Resource map

- **`assets/maintenance.js`** — deterministic engine (healthAssess, dedupe/rank,
  selfHeartbeat). No import, no agents.
- **`assets/maintenance.example.js`** — engine + runnable self-test battery.
- **`assets/monitor-sweep.workflow.js`** — the canon-bound monitor sweep (fan-out +
  diagnosis + self-heartbeat + ledger).
- **`references/monitor-and-ingest.md`** — the poll-sweep (enabled) + webhook
  adapter (built, gated); the signals read; ingest + dedupe + severity-rank.
- **`references/backlog-and-triage.md`** — the per-app `maintenance.md` format,
  severity ladder, triage + diagnosis.
- **`references/fix-pipeline.md`** — gate → orchestrated-delivery → adversarial-verify
  → prepare-and-HOLD → revert; the hygiene/incident modes.
- **`references/self-observability.md`** — the `_cto-self` heartbeat (§7.6).
- **`references/boundaries.md`** — what fleet-maintenance owns vs delegates
  (registry / governance / orchestrated-delivery / workflow-runtime); standalone (D5).
