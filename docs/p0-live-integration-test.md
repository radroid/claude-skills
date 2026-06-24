# P0 spine live end-to-end integration test

**Date:** 2026-06-24. **Scope:** the file-mutating handoffs the deterministic
dry-run (`docs/p0-integration-dry-run.md`) could not exercise — run for real, with
the **real engines writing real files** to a real git fleet repo, a real runnable
smoke oracle, and real concurrent processes.

This is the test `graduation-gate` unblocked: nothing could enrol an app into the
fleet before it, so the live enrol → maintain → gate → ledger chain had never run.

## Setup

A throwaway fleet operating repo (`/tmp/fleet-live`, git-init) holding a real
`fleet/` tree, plus a real sacrificial app with a **genuinely runnable** smoke
oracle (`npm run smoke` asserting a core action + a denied-permission path, exit 0).
The driver concatenates the four real deterministic engines —
`fleet-registry/assets/registry-schema.js`, `cto-governance-spine/assets/governance.js`,
`fleet-maintenance/assets/maintenance.js`, `graduation-gate/assets/graduation.js`
(zero name collisions across all four) — and drives the spine, writing real files
and committing them with real git.

## Result — 24/24 checks pass

| Phase | What ran live | Result |
|---|---|---|
| 1. Oracle | `npm run smoke` on the sacrificial app | GREEN (exit 0) |
| 2. Graduation enrol (*) | `buildEnrollmentState` → real `state.json` + `config.json`, git-committed; ledger appended | config + state pass the registry required-field checks; round-trip from disk valid |
| 3. D2 lease | acquire → HELD → second-session backoff (dedupe) → release → stale | all transitions correct on real committed files |
| 4. Maintenance | `healthAssess` real signals vs registry SLO → `mergeBacklog` → `maintenance.md` | backlog written + committed; re-sweep deduped (0 new) |
| 5. Backlog render | maintenance item → orchestrated-delivery backlog doc | renders a valid Progress + backlog + Needs doc (**seam — see below**) |
| 6. Governance gate | `autonomousModeGate` on the top item → `governanceLedgerEntry` → append | correctly **escalated** a `small_fix` at `standard` tier (only `experimental` auto-approves it — the matrix held across the live boundary); every ledger line parses + conforms to `AUDIT_LEDGER_ENTRY` |
| 7. Concurrent ledger | **20 parallel processes** appending to one `fleet/ledger.jsonl` | all 20 landed, **zero torn lines** — the atomic-`O_APPEND` contract (dry-run seam #3) holds in practice |
| 8. Demotion | `demotionCheck` sustained sev1 → `applyDemotion` → write | `status` flipped to `quarantined` on disk |

The git history is a real, auditable trail: `seed → enrol → lease acquire → lease
release → maintenance backlog → demote quarantine`.

(*) **Phase 2 enrolled under a documented exception.** `instrumentationRollup` was
honestly NOT ready (`health_endpoint` + `telemetry_connected` false for a local,
non-deployed app), so this phase tested the enrol *write path*, not a fully-passing
graduation. See "What is STILL not exercised" below.

The concurrency result (phase 7) is an **empirical confirmation on this platform**
(POSIX `O_APPEND`, one `write()` per line — an independent re-run reproduced it at
1000 appends with payloads exceeding `PIPE_BUF`). The *portable* guarantee remains
the documented single-writer/lock fallback in `cto-governance-spine`'s
`audit-ledger.md` for hosts without atomic append — this validates the contract, it
does not replace it.

## The one seam found — backlog-rendering (now closed at the contract level)

`fleet-maintenance` emits a backlog **item object** (`{app_id, category, severity,
title, detail, ...}`); `orchestrated-delivery` consumes a **backlog doc** (a
`Progress:` line + a backlog table + a `Needs` dependency column, one numbering
scheme). The item→doc translation is **session glue neither skill shipped a
spec for** — it works, but it was unowned, so every caller would re-invent the
shape. Closed by specifying the exact one-item handoff-doc shape in
`fleet-maintenance/references/fix-pipeline.md` (§3), so the producer (maintenance)
and the consumer (orchestrated-delivery) agree on the contract rather than guessing.

## What is STILL not exercised (the honest edge)

This proved the **file/state handoffs**. Two things still need real cloud infra +
a real deploy, not just files:

- **Full graduation instrumentation.** The live oracle ran green, but
  `health_endpoint` and `telemetry_connected` were honestly FALSE for a local
  (non-deployed) app — so `instrumentationRollup` correctly reported NOT ready, and
  the enrol proceeded under a documented exception to test the write. A *deployed*
  app with a `/health` endpoint + wired telemetry (e.g. PostHog/Sentry) would let
  graduation pass for real. That is the `app-provisioning-and-instrumentation` +
  deploy story.
- **The actual fix PR.** Phase 6 gated the item and (correctly) escalated; it did
  not run `orchestrated-delivery`'s full planner→executor→reviewer→merge on a real
  PR (that needs a real app repo + CI). The handoff *doc* is now specified; running
  the fix end-to-end is the next live step once a deployed sacrificial app exists.

## Verdict

The P0 spine's file-mutating core is **proven live**: an app can be graduated,
leased, swept, gated, audited, and demoted against real files with a correct git
audit trail and a concurrency-safe ledger. The remaining gaps are infra-dependent
(deploy + telemetry + a real fix PR), not contract gaps in the spine itself.
