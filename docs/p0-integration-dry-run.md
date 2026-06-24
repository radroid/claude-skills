# P0 spine integration dry-run

**Date:** 2026-06-24. **Scope:** the four merged P0 pieces, traced end-to-end before
building P1 on top of them.

```
fleet-registry (data) → fleet-maintenance (assess→backlog) →
cto-governance-spine (policy gate) → orchestrated-delivery (the fix) → fleet/ledger.jsonl
```

The goal was not "do the pieces work in isolation" (each ships its own exhaustive
self-test) — it was "do the **contracts between them** line up", which no single
skill's test can answer.

## Method

The three deterministic engines — `fleet-registry/assets/registry-schema.js`,
`cto-governance-spine/assets/governance.js`,
`fleet-maintenance/assets/maintenance.js` — share **zero** const/function names, so
they concatenate into one scope with no collisions. A node harness pasted after the
real (un-transcribed) source traced ONE sacrificial app through every contract:
registry validate → `healthAssess` → `mergeBacklog`/`rankBacklog` → diagnosis →
`autonomousModeGate` (using the exact glue from `fleet-maintenance/references/fix-pipeline.md`)
→ `governanceLedgerEntry`, asserting the data shapes hand across cleanly.

## What held (the spine composes)

- **29/29 cross-skill contract checks pass.** Registry data feeds maintenance's
  assessment; maintenance's `slo` reads match the registry's `slo` fields exactly;
  maintenance's fix-class vocabulary (`FIX_CLASSES`) is a subset of governance's
  `DECISION_CLASSES` (the overlap is identical); the registry `governance_tier`
  drives the governance `AUTONOMY_MATRIX`; denylist refusal, the cost circuit-breaker,
  the prod-deploy HOLD, and the incident ladder all wire across boundaries.
- **Canon is byte-identical across all 7 consumer scripts** — `orchestrated-delivery`
  (review-and-verify, steward), `autonomous-build-loop` (peer-review,
  perspective-verify, fat-iter-dispatch), `fleet-registry` (admission-validator),
  and `fleet-maintenance` (monitor-sweep). The `AUDIT_LEDGER_ENTRY` / verdict / gate
  schema is the same everywhere, so a ledger entry written by any skill validates
  against every other's reader. This is the seam the whole regime rests on, and it
  is intact. (Verified code-only — comments are role-localized per script by design;
  the executable schema/helper lines match exactly.)
- **Tier fail-closed across the boundary:** a garbled registry tier (`"platinum"`)
  → governance treats it as `critical` → escalate. A `dep_patch` that auto-approves
  at `standard` escalates at `critical`. The registry bounds governance exactly as
  designed.
- **The fix-pipeline glue is well-specified:** the `oracle_pass → oracle_green`
  field rename and `is_prod_deploy: false` ("the fix is a PR, not a deploy", with
  the prod decision deferred to merge-time `prodDeployRule`) are deliberate,
  documented choices — not gaps.

## Seams found and hardened

| # | Seam | Resolution |
|---|------|-----------|
| 1 | **escalate-sentinel.** A diagnosis can emit `suggested_fix_class: "escalate"`, but `escalate` is not a governance `DECISION_CLASS`. Passing it to `autonomousModeGate` fail-closes to escalate via the unrecognized-class branch — correct OUTCOME, but by accident, and the ledger mislabels it "unrecognized" instead of "deliberately routed to a human". | `fix-pipeline.md` step 2 now **short-circuits** the sentinel before the gate, with an honest ledger reason. |
| 2 | **active-status filter gap.** The sweep's description + `monitor-and-ingest.md` claim it covers only `active` apps (skipping `retired`/`quarantined`), but the code had no `status` filter — a retired app passed in would be swept and could be escalated. | `monitor-sweep.workflow.js` now **filters defensively** on `state.status`: only an explicit `retired`/`quarantined` removes an app (a watchdog errs toward watching; absent/active is swept), reports `counts.skipped`, and maps dropped items via `activeFleet` (not `fleet`) so the index can't off-by-skip. |
| 3 | **global-ledger concurrency.** The D2 lease serializes per-app `state.json`, but not the ONE global `fleet/ledger.jsonl` that every concurrent app-session appends to. `audit-ledger.md` covered append-never-rewrite but not torn writes. | `audit-ledger.md` gains a **Concurrency** section: one atomic `O_APPEND` write per (small) entry, never read-modify-write, and a single-writer/lock fallback where atomic append isn't guaranteed. v1 contract; promote to a broker if contention ever shows torn lines. |

## Verification

- The integration harness (29 assertions) and a dedicated filter + index-mapping
  harness (7 assertions, with a retired app placed *between* two active ones to
  prove the dropped-item index maps via `activeFleet`, not `fleet`) both pass.
- Engine self-test (18) unchanged; engine byte-identical across `maintenance.js`,
  `.example.js`, and the spliced workflow; canon byte-identical across all 7
  consumers; `node --check` clean; live monitor-sweep smoke clean.

## Not yet exercised (the honest edges)

This was a **deterministic** contract trace plus a read-only live sweep. It did NOT
run the agent-bearing, file-MUTATING handoffs end-to-end on a real repo:
the registry lease acquire/release against real files, the maintenance →
orchestrated-delivery one-item-backlog rendering (a maintenance backlog item must be
rendered into orchestrated-delivery's `Progress`-line backlog-doc format — a
translation point, not a shared object), and the actual `fleet/ledger.jsonl` append
under real concurrency. Those need a live sacrificial app and are the natural next
integration step once an enrolment path (`graduation-gate`) exists to put an app
into the registry in the first place.
