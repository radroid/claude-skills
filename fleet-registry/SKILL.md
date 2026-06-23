---
name: fleet-registry
description: Use when an autonomous fleet needs a per-app source of truth — the typed record every loop/schedule/webhook trigger scopes to one app from. Stores per-app identity (repo slug, prod URL), the fail-closed merge-deploys-to-prod flag, the runtime smoke-oracle, SLO baselines, denylist, cost caps, the D2 concurrency lease, the D4 last-known-good ref + revert command, open-incident count, and last-hygiene date. Splits PR-gated config from machine-mutable state; git-committed for v1. Exposes the admission validator graduation calls to enroll an app (a gate, not a handoff), plus lease, fail-closed-HOLD, retire, and drift-reconcile operations. This skill STORES the data; cto-governance-spine READS and ENFORCES it. Triggers on "fleet registry", "per-app source of truth", "merge-deploys-to-prod flag", "concurrency lease", "last-known-good", "smoke oracle", "enroll an app", "admission validator", "register/retire an app", "registry drift".
---

# Fleet registry

This skill defines the per-app **source of truth** an autonomous fleet otherwise
lacks. Every trigger — a cron health sweep, a webhook incident, a graduation
enrollment — scopes to exactly one app by reading *its* record here first. One
app, one record; the record is the contract between the trigger and everything it
may do.

This skill defines that record (two typed schemas), the operations that read and
mutate it (with their invariants), and the **admission validator** that gates a
new app into the fleet. It is consumed by `fleet-maintenance` (reads the oracle,
SLOs, lease, caps), `graduation-gate` (calls the admission validator to enroll),
and `cto-governance-spine` (reads the flag, tier, caps to ENFORCE policy).

## The one boundary that defines this skill — DATA here, POLICY elsewhere

The registry **stores** facts. It does **not** enforce rules. This line is the
resolution of the open-scope calls in the system design (`docs/cto-system-design.md`
§5) and you must hold it, or the policy logic forks across two skills and drifts:

| Concern | Lives here (fleet-registry) | Lives in cto-governance-spine |
|---|---|---|
| Prod deploy | the `merge_deploys_to_prod` field + a **fail-closed reader** | the HOLD *rule* (the precondition that blocks a merge) |
| Autonomy | the `governance_tier` + `cost_caps` fields | the autonomous-mode-gate (what tier may auto-approve what) |
| Cost | the per-app `cost_caps` numbers | the circuit-breaker that trips on them |
| Denylist | the per-app `denylist` paths | the harness-enforced refusal (auto-loop-bootstrap L1) |
| Incidents | the `open_incidents` count + `last_hygiene` | the severity ladder + ack-timeout |

Rule of thumb: if it is a **noun** (a value an app has), it is registry data. If
it is a **verb** (a decision made about an app), it is governance. Two bounded
exceptions live here by necessity, and only two:

- the fail-closed READER (`prodDeployAllowed`) — because "treat a missing/garbled
  flag as HOLD" is a property of the data contract itself, not a policy choice;
- the **admission validator**, which gates the *shape* of a record at enrollment
  (required fields present + an adequate oracle).

The validator enforces the **enrollment contract** ("is this a well-formed fleet
member?"), never ongoing governance policy ("may this app auto-approve this
change?"). That distinction is the data/policy line drawn at the moment of
admission, not erased by it — the oracle-adequacy and required-field checks decide
whether a record may *exist*, while what an existing app is *allowed to do* stays
with governance.

Likewise the registry does **not** run the smoke oracle (that is
`fleet-maintenance` / the runtime), decide escalation, or hold session context.
It is a passive, typed, git-resident store with a small set of mutation
operations whose invariants it owns.

## Storage model — split config / state, git-committed (v1)

Each app is a directory under `fleet/apps/<app-id>/` with **two** records,
because the data has two different change rates and two different audit needs:

```
fleet/
  apps/
    <app-id>/
      config.yaml   # PR-GATED, slow-changing: identity, flags, oracle, SLOs,
                    #   caps, denylist, triggers, revert command. A human (or
                    #   graduation-gate) changes this through a reviewed PR.
      state.json    # MACHINE-MUTABLE, hot: lease, open_incidents, last_hygiene,
                    #   last_known_good ref, drift status, lifecycle status.
                    #   The loop writes this many times a day, no PR.
```

Why split (the design decision, locked at build time per §5):

- **config is PR-gated** so the dangerous knobs — `merge_deploys_to_prod`,
  `cost_caps`, `denylist`, `revert_command` — cannot be flipped except through a
  reviewed diff. That is what makes D3 (fail-closed prod gate) and the cost
  circuit-breaker *auditable*.
- **state is machine-mutable** so the hot path (acquire a lease, record an
  incident, update last-hygiene) never has to open a PR. Lease churn touches
  `state.json` only and never collides with the PR-reviewed `config.yaml`
  history.

**v1 stores both in git** (committed in the fleet's operating repo). This is the
simplest correct choice for a 1–few-app fleet: zero new dependencies, the full
mutation history is the audit trail for free, and a lease is just a committed
field. The cost is **lease churn** — every acquire/release is a commit, and at
fleet scale that history grows and concurrent writers contend on `git push`. The
documented upgrade path (a state branch, or an external KV with TTL for the
lease) is in `references/lease-protocol.md`; take it when contention actually
bites, not before.

The `fleet/` tree lives in the **fleet's operating repo**, not in this skill —
this skill ships the schemas, the templates, and the operations. See
`assets/templates/` for an annotated `config.yaml` + `state.json` to copy.

## The two records

- **`config.yaml`** (PR-gated) — `app_id`, `repo`, `prod_url`, `governance_tier`,
  `merge_deploys_to_prod` (HOLD|SHIP, **defaults HOLD**), `smoke_oracle`
  (command + what it must assert), `slo`, `denylist`, `cost_caps`,
  `triggers` (schedule + webhook IDs, for dedupe/scoping), `revert_command`
  (D4, prod-deploying apps only), `secrets_ref` (a *pointer*, never values),
  and enrollment provenance.
- **`state.json`** (machine-mutable) — `app_id`, `lease` (D2), `status`
  (active|held|retired|quarantined), `open_incidents`, `last_hygiene`,
  `last_known_good` (D4 ref), `drift` (reconciliation status).

The authoritative shapes are the JSON-Schema consts in
`assets/registry-schema.js` (paste-in, no import — same distribution model as the
workflow-runtime canon). `references/schema-reference.md` is the human-readable
field-by-field walk-through.

## Operations (each owns an invariant — do not weaken it)

1. **Read the prod-deploy flag — FAIL CLOSED (D3).** Use `prodDeployAllowed(config)`:
   it returns `true` **only if** `config.merge_deploys_to_prod === "SHIP"` exactly.
   Missing field, `null`, lowercase, typo, unreadable file → `false` (HOLD). A
   prod deploy never proceeds on an absent or ambiguous flag. Governance enforces
   the *rule*; this reader guarantees the *default*. See `references/flag-and-rollback.md`.
2. **Acquire / release the lease before acting (D2).** Before any agent mutates
   an app, read `state.lease` via `leaseState(state, nowTs)` → `free | held |
   stale`. `held` (a live, unexpired lease another session owns) → **back off**
   (this is also trigger dedupe — a duplicate webhook finds the lease held).
   `free` or `stale` (past `expires` = a dead session) → write
   `lease: { holder, acquired, expires }`, commit, proceed; release on completion
   (`lease: null`, commit). Clock is unavailable inside a Workflow script, so the
   **session** stamps `nowTs`/`expires`. Full protocol + stale-reclaim +
   churn/upgrade notes: `references/lease-protocol.md`.
3. **Last-known-good + revert (D4) — prod-deploying apps only.** `state.last_known_good`
   holds the ref a revert restores to; `config.revert_command` is how. The
   admission validator REQUIRES both for any app whose `merge_deploys_to_prod`
   can ever be `SHIP`. Non-prod-deploying apps may leave them null (D4: rollback
   is required only where a merge can reach prod). See `references/flag-and-rollback.md`.
4. **Admission validator — the graduation seam (a gate, not a handoff).** A new
   app is admitted ONLY through `assets/admission-validator.workflow.js`. It is
   the mechanized form of "an app admitted without an oracle is invisible to
   MAINTAIN" — it BLOCKS (fail-closed) unless every required config field is
   present and schema-valid, the `smoke_oracle` asserts more than "boots + 200"
   (§7.9), the tier is set, and a prod-deploying app carries a `revert_command`.
   `graduation-gate` runs its readiness process, then calls this to enroll.
5. **Lifecycle — enroll / retire / reconcile / demote.** Enroll = create
   `config.yaml` (via PR) + initial `state.json` (status `active`, lease `null`).
   Retire = set `state.status` to `retired` (never delete — keep the audit
   trail); a retired app is invisible to MAINTAIN. Drift-reconcile = compare the
   record to reality (repo exists? prod URL responds? oracle command still
   valid?) and record `state.drift`; this is also how **brownfield** apps onboard
   (enroll an existing app through the same admission validator). Demote = set
   `status` to `quarantined` when an app keeps failing its oracle (§7.8). Full
   procedures: `references/lifecycle.md`.

## Canon & mechanism (workflow-runtime)

The admission validator is not prose on the honor system — it is a CONCRETE
Workflow script built on the `workflow-runtime` canon (`assets/admission-validator.workflow.js`).
The canon's core principle holds: **a quality gate is a pipeline STAGE, not a
paragraph.** The validator inlines the canon preamble (the unified
`APPROVE | REVISE | BLOCK` verdict + the `AUDIT_LEDGER_ENTRY` schema + helpers,
byte-identical to `workflow-runtime/assets/preamble.js` — no import, reuse is
paste) AND the registry schemas from `assets/registry-schema.js`, then:

- validates the candidate `config`/`state` against the schemas + required fields
  (a missing required field is an automatic BLOCK — fail-closed),
- runs an **adversarial-verify** pass on smoke-oracle adequacy (N hostile
  refuters per the canon; a claim of "this oracle is sufficient" must survive
  majority refutation, a dead/missing refuter counts as a refute), because
  oracle adequacy is the judgment call §7.9 warns is overloaded,
- rolls up FAIL-CLOSED (any missing field OR an inadequate oracle → BLOCK) and
  emits the typed `AUDIT_LEDGER_ENTRY` the governance layer reads.

The deterministic reads — `prodDeployAllowed`, `leaseState` — are pure helpers in
`assets/registry-schema.js`, NOT agent gates: they are git/code operations with a
single correct answer, so they run inline (in the session or any consumer
script), not as an LLM pass. Read the `workflow-runtime` skill before editing the
validator and validate every change against its runner contract.

## What this skill deliberately does NOT do

- Enforce the HOLD rule, the autonomy gate, or the cost circuit-breaker — those
  are `cto-governance-spine` (it reads these fields).
- Run the smoke oracle or score SLOs — that is `fleet-maintenance` / the runtime.
- Hold session/conversation context — the registry is the persistent, typed
  truth a fresh session reconstructs from; it carries no transcript.
- Decide *whether* an app should graduate — `graduation-gate` decides; the
  registry only validates the resulting record and stores it.

## Hard rules

- **DATA, not policy.** Add a field, never a rule. If you are about to write an
  `if` that *decides* something about an app, it belongs in governance.
- **Fail closed.** A missing/garbled `merge_deploys_to_prod` reads as HOLD; a
  candidate missing any required field FAILS admission; a dead refuter in the
  oracle-adequacy pass counts as a refute.
- **config is PR-gated, state is not.** Never script a write to `config.yaml`
  outside a reviewed PR; never open a PR to touch the lease.
- **`secrets_ref` is a pointer, never a value.** No credential, token, or key
  text ever enters a registry record. (§7.4 — the registry names where deploy
  creds live; it never holds them.)
- **Never delete a retired app's record.** Retirement is a status flip; the
  history is the audit trail.
- **The admission validator is non-skippable.** Enrollment goes through it or it
  did not happen — an app in `fleet/apps/` that never passed the validator is a
  bug, not a member.
- **Inline the canon, never import.** The validator pastes the workflow-runtime
  preamble + the registry schemas; there is no module loader.

## Resource map

- **`assets/registry-schema.js`** — paste-in JSON-Schema consts (`CONFIG_SCHEMA`,
  `STATE_SCHEMA`) + deterministic helpers (`prodDeployAllowed`, `leaseState`,
  `requiredConfigFields`). The typed contract every consumer binds to. No import.
- **`assets/admission-validator.workflow.js`** — the mechanized admission gate
  (canon preamble + registry schema + schema-validation stage + oracle-adequacy
  adversarial-verify + fail-closed roll-up + ledger record).
- **`assets/templates/config.yaml`**, **`assets/templates/state.json`** — annotated
  copy-me records for a new app.
- **`references/schema-reference.md`** — field-by-field walk-through of both records.
- **`references/layout-and-storage.md`** — the split config/state layout, the
  git-committed v1 decision, the churn limit + upgrade path.
- **`references/lease-protocol.md`** — D2 acquire/check/release/stale-reclaim,
  trigger dedupe, and the lease-churn upgrade path.
- **`references/flag-and-rollback.md`** — D3 fail-closed HOLD read + D4
  last-known-good/revert (prod-deploying apps only).
- **`references/lifecycle.md`** — enroll / admission / retire / drift-reconcile /
  brownfield onboarding / demotion.
