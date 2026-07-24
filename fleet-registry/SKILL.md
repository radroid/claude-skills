---
name: fleet-registry
description: Use when an autonomous fleet needs its per-app source of truth — enrolling, retiring, or reading an app record; the merge-deploys-to-prod flag; the concurrency lease; last-known-good; the smoke oracle; the admission validator. Triggers: "fleet registry", "enroll an app", "registry drift".
---

# Fleet registry

## Goal

One typed record per app that every trigger (cron sweep, webhook, graduation)
scopes from. This skill defines the record, its mutation operations, and the
admission validator that gates enrollment. **It stores data; it never enforces
policy.** If you're writing an `if` that *decides* something about an app, it
belongs in `cto-governance-spine` — nouns here, verbs there.

## The record

`fleet/apps/<app-id>/` in the fleet's operating repo, split by change rate:

- **`config.yaml` — PR-gated, slow-changing:** identity (`app_id`, `repo`,
  `prod_url`), `governance_tier`, `merge_deploys_to_prod` (SHIP|HOLD, defaults
  HOLD), `smoke_oracle`, `slo`, `denylist`, `cost_caps`, `triggers`,
  `revert_command` (required for any prod-deploying app), `secrets_ref` (a
  pointer, never values). The dangerous knobs change only through a reviewed
  diff — that's what makes the prod gate and cost breaker auditable.
- **`state.json` — machine-mutable, hot:** `lease`, `status`
  (active|held|retired|quarantined), `open_incidents`, `last_hygiene`,
  `last_known_good`, `drift`. The loop writes it directly, no PR.

Authoritative shapes are the schema consts and deterministic helpers
(`prodDeployAllowed`, `leaseState`) in `assets/registry-schema.js` — paste-in,
no import, same distribution model as the workflow-runtime canon. Annotated
starter records: `assets/templates/`.

## Contracts

- **Fail closed.** `prodDeployAllowed` is true only on the exact string
  `"SHIP"` — a missing, garbled, or unreadable flag reads as HOLD. A candidate
  missing any required field fails admission.
- **Lease before mutation.** Check `state.lease` (`free | held | stale`):
  held → back off (this doubles as trigger dedupe); free or stale → write
  holder + expiry, commit, proceed, release on completion. The session stamps
  timestamps — Workflow scripts have no clock. Protocol and the churn/upgrade
  path: `references/lease-protocol.md`.
- **Enrollment only through the admission validator**
  (`assets/admission-validator.workflow.js`): schema-valid record, an oracle
  that asserts more than "boots + 200" (adversarially verified), tier set, and
  a revert command for prod-deploying apps — else fail-closed BLOCK. An app in
  `fleet/apps/` that never passed it is a bug, not a member.
- **Never delete a retired or quarantined record** — lifecycle changes are
  status flips; the history is the audit trail.
- `config.yaml` changes go through a reviewed PR; the lease never does.
- No credential, token, or key text ever enters a record.

## Consumers

`fleet-maintenance` reads the oracle/SLOs/lease/caps; `graduation-gate` calls
the admission validator to enroll; `cto-governance-spine` reads
flags/tier/caps to enforce policy. Field-by-field walk-through, storage
rationale, and lifecycle procedures live in `references/`.
