# Backlog curation — what counts as steering vs. meddling

The supervisor's writeable authority is the backlog. Used well, it keeps the impl loop pointed at the right things. Used poorly, it becomes a second impl agent in disguise.

## Legitimate curations

### Re-order

The impl agent picks top-down from the backlog. If a dependency surfaced in iter-007 makes P2.B easier to ship before P2.A, swap them. Log the swap reason in the supervisor iter log.

### Split

An item taking 3+ iters is too big. Split into independently shippable slices:

```markdown
# Before
- [wip] P2.D — Race map

# After
- [done] P2.D.1 — Mapbox token wiring (iter-014)
- [wip]  P2.D.2 — Marker rendering
- [ ]    P2.D.3 — Geofence detection
```

Don't split for the sake of splitting — only when an item is genuinely uncloseable as-is.

### Add discovered items

The impl agent often surfaces new work in iter logs (`logs/iter-NNN.md` "Open questions" / "Carry-forward") without promoting them to the backlog. Promote them:

```markdown
- [ ] P3.X — <slug from impl iter-021 carry-forward> — <one-line scope>
```

Annotate with the iter the item came from so the audit trail is intact.

### Mark blocked

Items waiting on user decision, API key, third-party signoff → `[blocked]` with a one-line reason. The impl agent's `goals_backlog_empty` check ignores `[blocked]` items, so this is how you take items off the active queue without deleting them.

### De-duplicate

Two items that converged → keep one, mark the other `[blocked: subsumed by <id>]`. Don't delete — the cross-reference is the audit trail.

## What is NOT legitimate

### Rewriting scope silently

If item P2.D was "Race map with markers" and the supervisor decides it should also include "geofence detection," that's a scope change. Log it explicitly:

```markdown
- [wip] P2.D — Race map (scope-expanded by supervisor iter-S04: now includes geofence)
```

Or split, don't expand silently.

### Deleting open items

`[ ]` items the impl agent left untouched are not bugs — they're the queue. Don't delete because they look stale. Either re-order to surface them, mark `[blocked]` with a reason, or split into smaller pieces.

### Adding new phases without architectural backing

If the supervisor thinks there should be a Phase 4 for "deployment hardening," check `ARCHITECTURE.md` and `PLAN.md`. If the architecture doesn't anticipate it, that's a project-level decision the user should see — surface to `logs/blocks.md` rather than unilaterally adding.

### Curating mid-impl-iter

If the impl agent is mid-iter (its `latest.md` says "iter-NNN in progress"), don't edit the backlog. Wait for the next supervisor cadence. The impl agent might be reading the backlog right now.

## Phase headers and ordering

The loop reads phases top-down. Re-ordering phases is heavier than re-ordering items inside a phase — it can break dependency assumptions. Only re-order phases when:

- The current phase is empty (`[done]` or `[blocked]` only) AND the next phase is genuinely unblocked, OR
- A `**HIGH PRIORITY**` user dependency arrived that justifies an out-of-order phase swap

Otherwise stay within-phase.

## When in doubt

If the supervisor isn't sure whether a curation is steering or meddling, the default is **surface it**, not do it. Append to the supervisor iter log:

```markdown
- Considered splitting P2.D — declined: scope is still bounded enough. Re-evaluate iter-S07.
```

A held curation that turns out to be needed costs one wake-up of delay. A wrong curation that pushed the impl agent off track costs multiple iters of recovery.
