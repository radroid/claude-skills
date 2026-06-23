# Prod-deploy flag (D3) + last-known-good / revert (D4)

These are the two highest-stakes fields in the registry — the ones that decide
whether autonomous work can reach production and whether it can be un-done. Both
are **fail-closed by construction.**

## D3 — the prod-deploy flag, read fail-closed

`config.merge_deploys_to_prod` is `HOLD` or `SHIP`. The registry ships exactly
one reader:

```js
function prodDeployAllowed(config) {
  return !!config && config.merge_deploys_to_prod === "SHIP";
}
```

Only an **exact `"SHIP"`** licenses a prod deploy. Missing field, `null`,
lowercase `"ship"`, a typo, an unreadable/garbled file, a `config` that failed to
parse — every one of these returns `false` (HOLD). The safe default is a property
of the **data contract**, which is why this one reader lives in the registry even
though the registry is otherwise data-only: "treat the unknown as HOLD" is not a
policy choice, it is what the field *means*.

**The rule vs the reader.** The registry provides the *default* (fail-closed
read). `cto-governance-spine` enforces the *rule*: even when `prodDeployAllowed`
is true, governance still requires the human-approval gate (the
`AUDIT_LEDGER_ENTRY.human_approval` field is `null` until a human signs off) for
an actual prod deploy. So a prod deploy needs BOTH: `SHIP` in config AND a human
approval at the gate. The registry guarantees you can never deploy on an *absent*
flag; governance guarantees you can never deploy on the flag *alone*.

**Flipping HOLD→SHIP** is a `config.yaml` change, so it goes through a reviewed PR
— and that PR MUST also set `revert_command` (see D4). The admission validator
enforces this for new prod-deploying apps; the PR review enforces it for an
existing app being promoted.

## D4 — last-known-good + revert (prod-deploying apps only)

Safety historically ended at "prepare-and-HOLD" — there was no defined way to
un-ship once a held PR was approved and broke prod (§7.1). D4 closes that, but
**only for apps that can actually reach prod** (D4 scopes rollback to
prod-deploying apps; a non-deployed app has nothing to roll back).

Two fields, split across the two records by change rate:

- `config.revert_command` (PR-gated) — *how* to un-ship, e.g. a redeploy of a
  pinned ref, a platform rollback command. Slow-changing, dangerous → config.
- `state.last_known_good` (machine-mutable) — *what* to roll back to: the ref of
  the last deploy that passed its smoke oracle in prod. Updated on every
  successful prod deploy → state.

The revert actuator (in `fleet-maintenance` / governance, not here) reads both:
"run `config.revert_command` to restore `state.last_known_good`." The registry's
job is only to **guarantee they exist** for a prod-deploying app:

- **Admission** (`revertRequired(config)` = `prodDeployAllowed(config)`): a
  candidate with `merge_deploys_to_prod=SHIP` and no `revert_command` is BLOCKED.
  You cannot admit a prod-deploying app with no un-ship path.
- A non-prod-deploying app (`HOLD`) may leave both `null` — and should, rather
  than carry a meaningless revert command.

## Why both are required together

A `SHIP` flag with no `revert_command` is the most dangerous possible state: the
agent can push to prod but cannot un-ship. Pairing them at admission — and
re-pairing them in any HOLD→SHIP promotion PR — makes "can deploy" and "can
un-deploy" inseparable. That is the whole point of treating the reverse edge as a
gating requirement equal to the forward edge (§7).
