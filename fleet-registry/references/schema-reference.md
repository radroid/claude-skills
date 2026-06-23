# Schema reference — the two records, field by field

The authoritative shapes are the JSON-Schema consts in
`assets/registry-schema.js` (`CONFIG_SCHEMA`, `STATE_SCHEMA`). This is the
human-readable walk-through. State template is `assets/templates/state.json`
(JSON has no comments, so its annotations live here); config template is the
self-documenting `assets/templates/config.yaml`.

## `config.yaml` — PR-gated (slow-changing, dangerous knobs)

| Field | Type | Notes |
|---|---|---|
| `app_id` | string (kebab) | Canonical id. MUST equal the dir name and `state.app_id`. |
| `repo` | string | `owner/name` slug. |
| `prod_url` | string \| null | Production URL; null for a non-deployed app. |
| `governance_tier` | `experimental` \| `standard` \| `critical` | Bounds what governance may auto-approve. Governance READS this. |
| `merge_deploys_to_prod` | `HOLD` \| `SHIP` | **D3.** Read via `prodDeployAllowed()` — fail-closed to HOLD on anything-not-`SHIP`. |
| `smoke_oracle` | object | `command` + `asserts[]` (≥1) + optional `runnable_unattended`. Admission refuses an oracle asserting no more than "boots + 200". |
| `slo` | object | Health baselines. `availability_target_pct`, `p95_latency_ms`, `error_rate_target_pct` typed; app-specific metrics allowed. |
| `denylist` | string[] | Per-app path globs the agent must never touch (on top of the harness L1 floor). |
| `cost_caps` | object | `usd_per_day` + `max_prs_per_day` (required) + optional `max_concurrent_sessions`. §7.7 inputs; governance trips on them. |
| `triggers` | object | `schedule_ids[]` + `webhook_ids[]` — the IDs that may wake a session (D2 dedupe/scoping). |
| `revert_command` | string \| null | **D4.** How to un-ship. REQUIRED when `merge_deploys_to_prod=SHIP`. |
| `secrets_ref` | string \| null | A POINTER to deploy creds (vault path/name) — **never a value** (§7.4). |
| `enrolled` | object | Provenance: `by`, `ref` (commit), `schema_version`. |

`additionalProperties: false` — an unknown config key is a schema error (catches typos in a PR-gated file, where a silent typo is most dangerous).

## `state.json` — machine-mutable (hot, written many times a day)

| Field | Type | Notes |
|---|---|---|
| `app_id` | string (kebab) | MUST equal `config.app_id`. |
| `status` | `active` \| `held` \| `retired` \| `quarantined` | `retired`/`quarantined` are invisible to MAINTAIN. |
| `lease` | object \| null | **D2.** `null` = free. `{ holder, acquired, expires }`, ISO-8601 UTC timestamps stamped by the SESSION. Read via `leaseState()`. |
| `open_incidents` | integer ≥0 | Count only — the severity ladder lives in governance. |
| `last_hygiene` | string \| null | ISO-8601 date of the last hygiene pass. |
| `last_known_good` | string \| null | **D4.** The ref a revert restores to. null for non-prod-deploying apps. |
| `drift` | object | `status` (`in_sync` \| `drift_detected` \| `unreconciled`) + `last_reconciled`. §7.5. |
| `schema_version` | string | For migrations. |

## Timestamps

Every `ts`/`acquired`/`expires`/`last_*` is an **ISO-8601 UTC string** ("...Z").
A Workflow script cannot read the clock (it would break resume), so these are
stamped by the **session** (the orchestrator/consumer) and passed in. ISO-8601
UTC strings sort lexicographically, which is why `leaseState()` can compare
`expires > nowTs` as strings.

## Why these are the required fields (fail-closed admission)

`requiredConfigFields()` / `requiredStateFields()` return the `required` arrays.
A candidate missing ANY of them fails admission (BLOCK) — see
`references/lifecycle.md`. The nullable fields (`prod_url`, `revert_command`,
`secrets_ref`, `last_hygiene`, `last_known_good`) are deliberately NOT required:
they are legitimately absent for some apps (a non-deployed app has no
`revert_command`). The required set is the floor below which an app is not a
well-formed fleet member.
