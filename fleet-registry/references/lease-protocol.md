# Lease protocol (D2) — one writer per app, trigger dedupe, stale reclaim

The concurrency hazard (§7.3): a cron health sweep and a webhook incident can
wake sessions on the **same app at the same time**, and two writers corrupt
state. The lease is the per-app mutex that prevents it — and the same mechanism
is **trigger dedupe** (a duplicate webhook finds the lease already held and backs
off).

## The record

`state.lease` is `null` (free) or `{ holder, acquired, expires }`:

- `holder` — the session/trigger id that owns the lease.
- `acquired` / `expires` — ISO-8601 UTC, **stamped by the session** (a Workflow
  script has no clock). `expires = acquired + ttl`; pick a `ttl` longer than the
  longest legitimate run on that app, short enough that a dead session frees up
  in reasonable time.

Read it with `leaseState(state, nowTs)` → `free | held | stale`:

- `free` — no lease. Acquirable.
- `held` — a live, unexpired lease another session owns. **Back off.**
- `stale` — a lease past `expires` (a dead session), or with a missing/garbled
  `expires`. Reclaimable. A garbled lease is treated as stale, never as an
  eternal hold — fail toward making progress, not toward a permanent deadlock.

## Acquire → act → release

```
1. git pull --ff-only            # get the latest state.json
2. read state.json; s = leaseState(state, now)
3. if s === "held"  → STOP. Another session owns this app. (Also = trigger dedupe.)
   if s === "stale" → log the reclaim (who held it, when it expired) for the audit trail.
   if s === "free" or "stale":
        state.lease = { holder: <my session id>, acquired: <now>, expires: <now + ttl> }
        write state.json; commit; push
        if push rejected (someone raced you) → pull --ff-only, re-read, re-check
          leaseState; if still acquirable, retry once; else back off.
4. do the work (the fix / sweep / reconcile)
5. release: state.lease = null; write; commit; push
```

The push-rejected retry is the race resolver: git's atomic ref update is the
serialization point. Two sessions can both *read* `free`, but only one push
lands; the loser pulls, sees the lease now `held`, and backs off. This is why v1
can use git as the lock — the contention just costs a rebase, not corruption.

## Stale reclaim — the dead-session path

A session that dies mid-run (crash, rate-limit, killed) leaves a lease behind. It
becomes `stale` at `expires` and the next actor reclaims it. **Before reclaiming,
log the reclaim** (prior holder + expiry) to the audit ledger — a frequently
reclaimed app is a signal that sessions are dying or the `ttl` is too short, and
governance/the steward should see it. Never silently overwrite a held lease;
never extend someone else's lease.

## Clock discipline

`leaseState` compares `expires > nowTs` as **strings**, which is correct ONLY for
ISO-8601 UTC ("...Z") timestamps (they sort lexicographically). Always stamp in
that format. The Workflow runner forbids the clock, so any lease op inside a
script takes `nowTs` from `args`; lease ops in a normal session use the session's
clock directly. Either way the format is the contract.

## Upgrade path (from `layout-and-storage.md`)

Git-as-lock is v1. The lease is the field most likely to outgrow git first
(highest write rate, real contention). When it does, move JUST the lease to a KV
with native TTL: `expires` becomes a real TTL key, `held`/`free` is a key
presence check, and stale-reclaim becomes automatic expiry — no commit per
acquire, no push contention. The rest of `state.json` can stay in git. Don't do
this until contention is measured, not assumed.
