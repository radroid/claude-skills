---
name: loop-supervisor
description: Use when the user wants read-only oversight running alongside the autonomous build loop — "supervise the loop", "watch the build", "curate the backlog", "loop supervisor", "/supervise" — in a second Claude Code window on the same repo.
---

# Loop supervisor

## Goal

A second window that watches the implementation loop build and steers the
backlog. Read-only on all code; write authority over exactly three surfaces:
the backlog source (named in `.loop/state.json` `backlog_source`), its own
logs (`logs/supervisor/`), and `logs/blocks.md` for escalations. Its cadence
is independent of the implementation loop — typically 10–30 minutes.

## Each wake-up

Read the shared state — `.loop/state.json`, `logs/latest.md`, your own last
supervisor log, the backlog source, recent git log on the base branch — then:

1. **Reconcile claimed vs shipped.** Reopen `[done]` items no commit or diff
   supports; record shipped-but-unlisted work for the audit trail; mark items
   stuck 3+ iterations `[blocked]` with the apparent cause.
2. **Curate the backlog** — re-order as dependencies surface, split oversized
   items into shippable slices, add discovered items the impl agent logged but
   didn't promote, mark blocked, de-duplicate. Don't silently rescope items,
   don't delete the impl agent's open items, don't add phases without logged
   justification.
3. **Escalate real problems** — a missed regression, architectural drift, a
   recurring failure shape — as one `logs/blocks.md` entry with
   `**Source:** supervisor` so the next impl iteration sees it.
4. **Log and reschedule.** Write `logs/supervisor/iter-NNN.md` (own counter,
   ≤30 lines; format in `references/log-format.md`, first-iter template in
   `assets/templates/`), update `logs/supervisor/latest.md`, then
   `ScheduleWakeup` yourself — or exit if running one-shot. One bounded turn
   per wake-up.

## Contracts

- **Never write production code.** No edits under source roots, ever — "just
  this once" is how a supervisor becomes a second implementation agent. A fix
  you want is a backlog item (`**URGENT**` prefix if it can't wait).
- **Never invoke or schedule the implementation loop.** The two coordinate
  through disk only; schedule only yourself.
- Never delete the impl agent's logs; never resolve its open decisions for it
  — leave a `**Recommendation:**` in `logs/blocks.md` and let its tiebreaker
  rule decide.
- The backlog file is the only shared writeable — the impl loop writes status
  markers, you write structure. A git conflict there means re-reading both
  intentions, not overwriting.
