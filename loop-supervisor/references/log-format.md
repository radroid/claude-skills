# Supervisor iter log format

Path: `logs/supervisor/iter-NNN.md` (counter is independent from the impl loop's `logs/iter-NNN.md`).

Cap: **30 lines**. Hard cap 40.

## Template

```markdown
# Supervisor iter S0NN — YYYY-MM-DD

**Impl head observed:** <git SHA short>
**Impl iters reviewed:** iter-N1, iter-N2 (or "none new since last")

## Reconciliation

- <one line per discrepancy found, or "clean">

## Backlog curations

- <one line per legitimate edit: re-order / split / add / blocked / dedupe>
- <or "none — backlog already coherent">

## Escalations to logs/blocks.md

- <one line per entry written, with severity>
- <or "none">

## Held curations (considered, declined)

- <one line — what + why declined>

## Next supervisor iter

- Watch for: <signal that would trigger action next time>
- Wake-up: <delaySeconds if running /loop, or "user-paced">
```

## Why so short

The supervisor's log is read by the next supervisor iter (it IS the handoff). If it grows past 30 lines, the next iter pays cache-creation cost for noise.

Anything longer than a one-liner promotes to either the backlog (if it's a future action) or `logs/blocks.md` (if it's a signal the impl agent needs to see).

## What does NOT go in the supervisor log

- Praise / criticism of the impl agent's style
- Re-statements of what the impl agent's iter log already said
- Long architectural opinions — those go to the user via `logs/blocks.md` or the backlog with `**URGENT**` prefix

## Latest.md handoff

After writing `iter-S0NN.md`, update `logs/supervisor/latest.md` to a 5-line pointer:

```markdown
# Supervisor latest — iter S0NN

- Last impl head observed: <SHA>
- Open escalations: <count, or "0">
- Held curations to revisit: <list of items + iter to revisit at>
- Next watch: <one-line signal>
```

This is what the next supervisor iter reads first.
