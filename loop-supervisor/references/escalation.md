# Escalation — when to write to logs/blocks.md

The supervisor's secondary writeable. `logs/blocks.md` is the impl agent's Tier-2 read when `latest.md`'s "Open blocks" line is non-empty. Writing here surfaces something to the next impl iter without editing code.

## When to escalate

| Signal | Why |
|---|---|
| A `[done]` feature broke an earlier-shipped feature (regression spotted in diff or test removal) | Impl agent rotated past it; needs to come back |
| `ARCHITECTURE.md` drift — a recently shipped item violates a stated constraint | Architectural decision needs explicit re-think, not a quiet fix |
| 3+ impl iters chasing the same shape of bug | Pattern that won't resolve without re-scope |
| Test suite is failing on `$BASE` after the last merge | The loop is now compounding on top of red — must stop landing PRs until green |
| A coin-toss tiebreaker is overdue (same `issue-id` 3+ iters without resolution) | Recommend a position; let the impl agent's tiebreaker rule execute |
| External dependency surfaced (API key, third-party signoff) the impl agent didn't backlog as `[blocked]` | Add to backlog AND surface here |

## Entry format

Append to `logs/blocks.md`:

```markdown
## <YYYY-MM-DD> — impl iter-NNN aftermath

**Source:** supervisor (supervisor iter-S0NN)
**Severity:** high | medium | low
**Pattern:** <one-line description of what you see>
**Evidence:** <commit SHAs, iter log line refs, test names>
**Recommendation:** <what the impl agent should do — NOT a code change, a direction>
```

The impl agent reads this on Tier-2 trigger and can choose to act, defer, or reject. The supervisor does not enforce — it informs.

## What NOT to escalate

- Style nits, naming preferences, lint findings — those are CodeRabbit / review territory, not supervisor territory.
- Anything the impl agent already flagged in `logs/blocks.md` for the same iter — don't double-log.
- "I would have built it differently" — preferences are not blocks.

## Severity guidance

- **High** — production code on `$BASE` is broken or compounding wrong (regressions, test deletions, arch drift)
- **Medium** — recurring pattern (3+ iters), stuck `[wip]`, missed dependency
- **Low** — informational (recommended re-order, observation worth carrying forward)

The impl agent's next iter prioritizes high → medium → low when its Tier-2 read fires.
