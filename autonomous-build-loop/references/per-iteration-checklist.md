# Per-iteration checklist

Run this top-to-bottom every time the loop wakes up. Each iteration is ONE bounded turn that ends by scheduling the next.

## 1. Read state — by tier, not by habit

Each iter is a fresh session; the prompt cache does NOT carry across iters, so every
iter pays cache-creation rate on its whole cold-boot read. Read the tiered manifest
in `references/tiered-read-strategy.md` — do not read every file every iter.

- **Tier 1 (always):** `CLAUDE.md`, `.loop/state.json` (machine state — stage, iter,
  `pr_mode`, `pr_size_policy`; absent → legacy non-PR mode), `logs/latest.md` (the
  human handoff — next features, files to open, open blocks, last-iter summary),
  `GOALS.md`. That is the default read.
- **Tier 2 (on trigger only):** `ARCHITECTURE.md` section (when the goal touches that
  subsystem; full read only at a phase boundary), `PLAN.md` (when phase/sequence is in
  question), `docs/brand.md` / `docs/workflow/*` (when touching UI / that workflow),
  `logs/blocks.md` (when `latest.md`'s "Open blocks" line is non-empty).
- **Tier 3 (never read back):** archived iter logs, `logs/summary-*.md`, `logs/archive/**`.

Any Tier-1 file missing → create a stub in this iter before doing other work.

## 2. Tooling preflight

If the project ships an MCP preflight (e.g. `npm run mcp:preflight`), run it. Read `logs/mcp-status.json` (or equivalent). If a server is unreachable or has zero tools, skip that surface's work and route to backend gap-fill. Append a one-line entry to `logs/blocks.md` so the drift is logged once, not per-iter.

## 3. Review previous iteration

Read the last iter log's "Wake-up handoff" section. The "Next step" and "Open first" lines are the loop's most important hand-off contract.

## 4. Pick goals for this iter

- Phase 2+ default: pick **3–4 features** from `GOALS.md` with ZERO pairwise schema/api/component overlap.
- If only 2 are independently bundle-able, ship 2. If only 1, ship 1.
- Hard cap: **4 features per iter**. Beyond that, parallel sub-agent count climbs past 8–10 and integration risk grows non-linearly.

If picking 2+ features → read `references/fat-iter-mode.md`. If picking 1 or doing non-feature work → continue.

## 5. Suggest changes for next iter's approach

1–2 lines at most. This is where you record what to do differently next time.

## 6. Execute

- 1 feature or infra work → direct implementation, or single Class B sub-agent if the work is well-scoped enough to delegate.
- 2+ features → fat-iter parallel dispatch (`references/fat-iter-mode.md`).
- Architecture pass at phase boundary → invoke `Skill` tool with `skill: "improve-codebase-architecture"` (an actual tool call — not manual refactor).
- **Non-visual behaviour is TDD** — failing test first, then minimal code (`tdd` / `superpowers:test-driven-development`). The test suite is the loop's free pass/fail signal; use it for everything testable. Visual behaviour has no such signal — it routes to a human checkpoint, see `references/feature-pr-mode.md` step 3.
- Before claiming any feature done → `superpowers:verification-before-completion`: run the real commands, read the output, confirm green. Evidence, not "should pass."

## 7. Mark goals

Update `GOALS.md` with `[done|wip|blocked]` for each goal touched this iter.

## 8. Write iter log

Path: `logs/iter-NNN.md`. Format: see `references/log-hygiene.md`. Cap: **50 lines in fat-iter mode**, **40 lines otherwise**. Hard cap 60 under any condition.

Update `logs/latest.md` to point at the new iter.

## 9. Wake-up handoff

Last section of the iter log. Must include:

- Current phase
- Next step (one sentence — name the 3–4 features for next iter, or "1–2 only when independence cannot be established")
- Files to open first
- Open questions (or "none")
- Carry-forward to next iter (≤2 short items — anything longer or recurring promotes to `GOALS.md`)
- Scheduled delaySeconds + reason

## 10. Commit (or open feature PRs)

**`pr_mode` gate (read from `.loop/state.json` in step 1):**

- **`pr_mode: true`** → steps 10–11 are replaced by `references/feature-pr-mode.md`: each feature
  is branched, TDD-built, verified, reviewed, and auto-merged on its own PR. Skip the rest of this
  step and step 11; resume at step 12.
- **`pr_mode: false` or no `.loop/state.json`** → legacy mode, continue below.

```
git add -A
git commit -m "iter NNN: <one-line summary>"
```

If a pre-commit hook fails: fix the issue, re-stage, create a NEW commit (never `--amend` after a hook failure).

## 11. Push cadence (legacy mode only)

From the git repo root: if HEAD is ahead of upstream AND **either** (a) ≥5 iters since last push OR (b) ≥8 commits ahead, run `git push`.

- Preconditions: working tree and index must reflect intentional state. Don't push if unexpected uncommitted changes remain — log `Push: skipped — dirty tree`.
- If `git push` fails: append one line to the iter log (`Push: failed — <reason>`) and to `logs/blocks.md` if it persists. Fix and retry next iter.
- Never `push --no-verify`, `--force`, or amend pushed commits without explicit `GOALS.md` authorization.
- Record `Push: ok` / `Push: skipped — <reason>` / `Push: failed — <reason>` in the iter log.

## 12. Next-iter cadence

Cadence is driven by **work type only** — never by context usage.

| Work type | Next wake-up |
|-----------|--------------|
| Phase 2+ implementation iter | 600s default |
| Phase 1 planning iter | 1500s default |

Do NOT inspect or ration context budget. In-session mode relies on harness
auto-compaction (configured to compact around 50% of the context window); the loop is
built to survive it — `logs/latest.md` + the tiered read manifest make every iter
self-contained. There is no "compact mid-build" hazard to avoid, no runway to slow down
for, and no token-driven restart recommendation.

## 13. Schedule next iter — OR exit cleanly

**Check `$EXTERNAL_SCHEDULER` first.**

- **`EXTERNAL_SCHEDULER` unset (in-session mode):** call `ScheduleWakeup` (or the project's equivalent — `CronCreate` for fixed cadence; `ScheduleWakeup` for dynamic /loop). Pass the SAME prompt back verbatim (or `<<autonomous-loop-dynamic>>` for the autonomous variant).
- **`EXTERNAL_SCHEDULER=1` (external-scheduler mode, e.g. driven by `scripts/auto-loop.py`):** do NOT call `ScheduleWakeup` — it's not a registered tool in `claude -p` sessions and the call will fail. The external driver handles cadence. Just exit cleanly after step 14.

**No semantic halt** (see `references/continuous-loop.md`) — but in external-scheduler mode, "no halt" means "the driver fires the next iter on schedule," not "you keep working in this turn."

## 14. End the turn

Do NOT start a new iter in the same turn.
