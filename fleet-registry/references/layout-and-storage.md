# Layout & storage — split config/state, git-committed (v1)

## The tree

The registry is a directory in the **fleet's operating repo** (not in this
skill — this skill ships only the schemas, templates, and operations):

```
fleet/
  apps/
    <app-id>/
      config.yaml   # PR-gated, slow-changing
      state.json    # machine-mutable, hot
```

One directory per app, keyed by `app_id`. No central index file: the fleet is
`ls fleet/apps/`, and each app is self-contained. (A single registry file was
rejected — every app's hot write would contend on one file, defeating the D2
per-app lease. Per-app dirs let two apps' leases churn independently.)

## Why config and state are split

The data has two change rates and two audit needs:

- **`config.yaml` is PR-gated.** It holds the dangerous knobs —
  `merge_deploys_to_prod`, `cost_caps`, `denylist`, `revert_command`,
  `secrets_ref`. These must never flip except through a reviewed diff. That is
  what makes the D3 prod gate and the §7.7 cost circuit-breaker *auditable*: the
  PR history IS the change record for every dangerous setting.
- **`state.json` is machine-mutable.** It holds what the loop writes many times a
  day — the lease, `open_incidents`, `last_hygiene`, `last_known_good`, `drift`.
  Forcing a PR for "acquire a lease" or "increment incident count" would be
  absurd. The split means hot writes never touch the PR-reviewed config history.

Mixing them in one file (the "per-app file" option that was considered) would
either force PRs for hot state or expose the dangerous knobs to unreviewed
machine writes. The split buys both properties at the cost of one extra file.

## v1: both committed to git

For a 1–few-app fleet, **git is the store**. This is the simplest correct choice:

- **Zero new dependencies.** No database, no KV, no external service to stand up,
  secure, or monitor before the fleet is even running.
- **The history is the audit trail for free.** `git log fleet/apps/<id>/` is the
  complete, signed, timestamped record of every change to that app's record —
  exactly what an "auditable" CTO claims to have.
- **A lease is just a committed field.** Acquire = write `state.lease` + commit;
  release = write `null` + commit. No lock service.

## The cost: lease churn

The honest limitation of v1: **every lease acquire/release is a commit.** At
fleet scale this means:

- `state.json` history grows fast (mostly lease noise).
- Concurrent writers contend on `git push` (two sessions acquiring different
  apps' leases push to the same branch and one must rebase/retry).

The config/state split already contains the blast radius — churn is isolated to
`state.json`, and per-app dirs keep distinct apps' churn independent. So v1 holds
fine until the fleet is large or many triggers fire at once.

## The upgrade path (take it when contention bites, not before)

When lease churn actually hurts, in increasing order of effort:

1. **State branch.** Keep `state.json` on a dedicated `fleet-state` branch (or
   orphan ref) so hot churn never pollutes the main config history and config
   PRs stay clean. Config stays on the reviewed branch.
2. **External KV with TTL for the lease only.** Move JUST the lease to a KV store
   with native TTL (the lease's `expires` becomes a real TTL, and stale-reclaim
   is automatic). The rest of `state.json` stays in git. This is the cleanest fix
   for the contention root cause (see `references/lease-protocol.md`).
3. **Full external state store.** Only if per-app state volume itself outgrows
   git — unlikely before the fleet is large.

Do not pre-build any of these. v1 git-committed is the decision; the upgrade is
documented so the seam is known, not so it is taken early. `cost_caps` and the
lease TTL give governance the levers to keep churn bounded in the meantime.
