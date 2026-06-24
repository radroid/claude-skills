# Prod-deploy HOLD rule (D3) + cost circuit-breaker (§7.7)

The two deterministic gates that bound the most expensive mistakes: shipping to
production, and runaway spend.

## Prod-deploy HOLD rule (D3)

`prodDeployRule(prodFlagShip, humanApproval)` → `proceed | hold | escalate`.

The registry owns the **fail-closed flag read** (`prodDeployAllowed(config)`,
which is `true` only for an exact `"SHIP"`); governance owns the **rule** that a
prod deploy needs the flag **and** a human:

| `prodFlagShip` | `humanApproval.approved` | result | meaning |
|---|---|---|---|
| `false` | (any) | **hold** | registry says HOLD — never deploy |
| `true` | `true` | **proceed** | flag SHIP + human signed off |
| `true` | not true | **escalate** | flag allows, but a human must approve |

Two locks in series. The registry guarantees you can never deploy on an *absent*
flag (fail-closed); governance guarantees you can never deploy on the flag
*alone*. `human_approval` is the canon `AUDIT_LEDGER_ENTRY.human_approval` object
(`{ approved, by }`), `null` until a human signs off — so a prod deploy that
reaches the ledger without a non-null approval is, by construction, a bug.

`prod_deploy` (and any action with `is_prod_deploy: true`) is routed straight to
this rule by the autonomous-mode-gate, before the tier allow-list — no tier
auto-approves a prod deploy.

## Cost circuit-breaker (§7.7)

`costBreaker(usage, caps)` → `{ tripped: [...], ok }`. The registry stores the
`cost_caps`; governance trips on them. A trip is a transient **HOLD** (back off,
retry in the next window), not an escalation.

Caps (from the app's registry `config.yaml`):

- `usd_per_day` — spend ceiling per app per day.
- `max_prs_per_day` — PR ceiling per app per day (throttles a trigger storm).
- `max_concurrent_sessions` — optional; how many sessions may run on the app at
  once (composes with the registry's D2 lease).

`usage` is a caller-supplied snapshot (`{ usd_today, prs_today, concurrent_sessions }`)
— the breaker has no clock and reads no meters itself; the orchestration layer
supplies the current window's counts.

**Fail-closed:** missing `caps` trips the breaker (you do not run uncapped). The
comparisons are `>=` for the daily ceilings (at the cap = tripped) and `>` for
concurrent sessions (at the cap = still ok, since the cap is the allowed maximum).

This is the blast-radius fuse the design calls for: soft per-stage budgets are for
the steward's outlier analysis (QUALITY OUTRANKS TOKEN SAVINGS — never thin a
quality gate to save tokens), but the circuit-breaker is a HARD stop on
total spend / PR volume / concurrency, independent of any quality judgment.

## Why both live in governance, not the registry

The flag, the caps, and the denylist are **data** (nouns) — they live in the
registry. The *rule* that combines the flag with a human, and the *breaker* that
trips on the caps, are **policy** (verbs) — they live here. Authoring each rule in
exactly one place is what stops the verdict-grammar / policy drift the split was
designed to prevent.
