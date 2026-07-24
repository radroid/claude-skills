---
name: fleet-maintenance
description: Use when an autonomous fleet needs the MAINTAIN pillar — health sweeps over registry-enrolled apps, a maintenance backlog, triage and autonomous fixes, dependency/security hygiene, incident response, or the CTO self-heartbeat. Triggers: "fleet maintenance", "monitor the fleet", "health sweep", "is the fleet healthy".
---

# Fleet maintenance

## Goal

Keep every registry-enrolled app healthy, unattended: monitor its signals,
turn problems into a severity-ranked per-app backlog, and drive each fix
through the same gated, adversarially-verified pipeline the build loop uses —
stopping at prepare-and-HOLD for anything that would touch production.

The loop per trigger: monitor → assess + dedupe + rank → triage + diagnose →
gate (`cto-governance-spine`) → fix (delegated to `orchestrated-delivery`) →
prepare-and-HOLD on prod → revert via the registry's `revert_command` if a
shipped fix breaks prod. Every sweep also runs the `_cto-self` heartbeat.

## Contracts

- **Ranking is deterministic, never an LLM judgment.** Agents gather signals
  and diagnose root causes; `healthAssess` (in `assets/maintenance.js`,
  paste-in) does the ranking, fail-closed: a missing or garbled signal yields
  `unverified`, never "healthy"; an unknown severity sorts most urgent. An app
  does not get to look healthy by withholding data.
- **Acquire the app's registry lease before touching it** — one writer per
  app; a held lease means back off.
- **Never fix directly.** A fix goes: governance gate
  (`proceed | hold | escalate`) → `orchestrated-delivery` with its
  non-negotiable adversarial review. Never self-authorize; never skip the
  gate.
- **Prod is prepare-and-HOLD, always.** Never auto-deploy; never mutate prod
  data without current human consent. Revert only via the registry's
  `revert_command` / `last_known_good`.
- **Backlog:** `fleet/apps/<app-id>/maintenance.md`, reusing
  orchestrated-delivery's backlog + Progress format, deduped by
  (app, category, title) — a recurring issue refreshes in place — and ranked
  sev1 → sev3.
- Hygiene scans and incident response are **modes** of this one engine —
  different backlog sources, same pipeline. Incidents run the governance
  severity ladder before any fix. The webhook-alert ingestion path stays
  disabled until its auth + dedupe guards are proven — a spoofed alert is a
  code-injection vector, not just cost.
- **The self-heartbeat escalates, never auto-fixes.** A stale cron, a stale
  lease, a ledger that stopped growing → a human. The watchdog does not
  repair itself.

## Resources

- `assets/monitor-sweep.workflow.js` — the canon-bound sweep (fan-out over
  active apps, deterministic assess, diagnosis agents, heartbeat, one typed
  `AUDIT_LEDGER_ENTRY` per app).
- `assets/maintenance.js` / `assets/maintenance.example.js` — the
  deterministic engine and its runnable self-test
  (`node maintenance.example.js`).
- `references/` — signals and ingestion, backlog format, fix pipeline,
  self-observability, ownership boundaries.
