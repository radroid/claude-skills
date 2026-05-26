# Per-iteration checklist

Top-to-bottom every wake-up. One bounded turn → schedule the next via `ScheduleWakeup` (or `CronCreate` for fixed cadence).

## 1. Read state — by tier, warm vs. cold

See `tiered-read-strategy.md` — the canonical split.

- **Cold-boot iter** (first iter of session OR first iter after auto-compaction): full Tier 1 read — `CLAUDE.md`, `.loop/state.json`, `logs/latest.md`, and the backlog source named in `.loop/state.json` `backlog_source` (default `GOALS.md`). After the reads, invoke `Skill: caveman` once to set narration style for the rest of the session (see SKILL.md principle 11 + `tiered-read-strategy.md`).
- **Warm iter** (subsequent iter in the same session, pre-compaction): minimal read — `logs/latest.md` (your previous handoff) + the backlog source (supervisor may have edited it). Skip `CLAUDE.md` and `.loop/state.json` unless `latest.md` signals they changed (stage transition, mode flip, etc.). Caveman style is retained — do NOT re-invoke.
- **Tier 2 on trigger. Tier 3 never.** Missing Tier-1 file on a cold boot → create a stub before doing other work.

## 2. Tooling preflight

If the project ships a preflight (e.g. `npm run mcp:preflight`), run it. Server unreachable / zero tools → skip that surface, route to backend gap-fill, append one line to `logs/blocks.md`.

## 3. Review last iter

Read the last iter log's "Wake-up handoff". "Next step" + "Open first" are the most important hand-off contract.

## 4. Pick goals

- Phase 2+ default: **3–4 features** from the backlog with ZERO pairwise schema/api/component overlap.
- Hard cap: **4 features per iter**.
- 2+ features → read `fat-iter-mode.md`.
- 1 feature or non-feature work → continue.

## 5. Note next-iter approach

1–2 lines max. What to do differently next time.

## 6. Execute

- 1 feature / infra → direct, or one Class B sub-agent if well-scoped.
- 2+ features → fat-iter parallel dispatch.
- Phase boundary → invoke `Skill` tool `skill: "improve-codebase-architecture"` (a real tool call, not manual refactor).
- **Non-visual behavior is TDD** — failing test first, then minimal code (`tdd` / `superpowers:test-driven-development`).
- Before claiming done → `superpowers:verification-before-completion`. Evidence, not "should pass."

## 7. Mark backlog

Update the configured backlog source for each item touched. File-based backlogs use inline `[done|wip|blocked]` markers; external sources (GitHub Issues, Linear MCP, etc.) require the provider's API/tool state instead.

## 8. Write iter log + update latest.md

`logs/iter-NNN.md` — cap **50 lines fat-iter, 40 otherwise, 60 hard**. Format: `log-hygiene.md`. Then update `logs/latest.md` to point at the new iter.

## 9. Wake-up handoff (last section of iter log)

- Current phase
- Next step (1 sentence — name the 3–4 features for next iter)
- Files to open first
- Open questions (or "none")
- Carry-forward (≤2 short items — longer recurring items promote to backlog)
- Scheduled `delaySeconds` + reason (in-session mode only)

## 10. Commit or open PRs

Read `pr_mode` from `.loop/state.json`:

- **`pr_mode: false` / absent (default)** → direct-commit to the active branch: `git add -A && git commit -m "iter NNN: <summary>"`. Pre-commit hook fails → fix, re-stage, NEW commit (no `--amend`). Push cadence handled in step 11.
- **`pr_mode: true`** (opt-in) → use `feature-pr-mode.md` for steps 10–11 (branch + PR + review + merge per feature against `$BASE`). Resume at step 12.

## 11. Push cadence (direct-commit mode only)

If HEAD ahead of upstream AND (≥5 iters since last push OR ≥8 commits ahead) → `git push`. Don't push a dirty tree. Never `--force` / `--no-verify` / amend pushed commits without explicit backlog authorization. Record `Push: ok|skipped|failed — <reason>` in the iter log.

## 12. Next-iter cadence

**Work-type driven only.** Never inspect or ration context budget — the harness auto-compacts and every iter is self-contained.

| Work type | Wake-up |
|-----------|---------|
| Phase 2+ implementation | 600s |
| Phase 1 planning | 1500s |

## 13. Schedule next

Call `ScheduleWakeup` (dynamic) — or `CronCreate` for fixed-interval cadence. Pass the same prompt back verbatim, or `<<autonomous-loop-dynamic>>` for the autonomous-loop sentinel.

No semantic halt — see `continuous-loop.md`.

## 14. End the turn

Do NOT start a new iter in the same turn.
