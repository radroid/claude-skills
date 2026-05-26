# Reconciliation — shipped vs. claimed

The supervisor's first concrete pass each wake-up. Cheap to do, catches the most common loop pathology: the impl agent claims `[done]` on items it didn't actually ship.

## The check

```bash
# What did the impl loop say it shipped since last supervisor iter?
# From logs/supervisor/latest.md, find the "last impl head" reference.
git log <last-supervisor-head>..HEAD --oneline

# What does the backlog say is now [done]?
# Grep the backlog source for [done] markers added in the recent window.
git diff <last-supervisor-head>..HEAD -- <backlog-path>
```

Cross-reference.

## Discrepancy types

| Pattern | What it means | Supervisor action |
|---|---|---|
| Item marked `[done]` but no commit touches its area | False-completion. Impl agent thinks it shipped, didn't. | Revert to `[wip]` + add note `**supervisor: no diff found for <item-id>**` |
| Commit lands but no backlog item updated | Untracked work. Either a bugfix the impl agent didn't backlog, or accidental scope creep. | Add a retroactive item with the commit SHA + `[done]` |
| `[wip]` for ≥3 consecutive impl iters with no progress | Stuck. Impl agent rotating without closing. | Mark `[blocked]` with `**supervisor: stuck — apparent cause: <X>**`. Possibly split into smaller items. |
| Two items now overlap (impl agent did half of one inside the other) | Item-boundary drift. | De-duplicate: keep one as `[done]`, mark the other `[blocked: subsumed by <id>]` |
| `[done]` item has tests deleted in its commit | Tests removed instead of fixed — regression risk. | Surface to `logs/blocks.md` with `**Source:** supervisor`; do NOT auto-revert. |

## What NOT to do

- Don't restore deleted tests yourself — surface it, let the impl agent's next iter own the fix.
- Don't rewrite the `[done]` item's description to match what actually shipped — that hides the drift.
- Don't mark `[blocked]` without a one-line reason. The impl agent reads it and needs to know why.

## Frequency

Every supervisor iter. The check is cheap (`git log` + a backlog read) and catches drift while it's still small. Letting two impl iters drift before reconciling means the backlog and the codebase have diverged beyond easy repair.
