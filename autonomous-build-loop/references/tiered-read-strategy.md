# Tiered read strategy

The loop runs **in-session** (one Claude Code session, `ScheduleWakeup` between iters). Context persists across iters until the harness auto-compacts. That means:

- **Warm iter** (the common case) — the previous iter's reads are still in working memory. The prompt cache reuses across iters. You do NOT need to re-read everything.
- **Cold-boot iter** — first iter of the session OR the first iter after an auto-compaction. Working memory was just summarized; the cache is cold. Full Tier 1 read required.

Both cases share Tier 2 (on-trigger) and Tier 3 (never).

## Cold-boot detection

Treat the iter as cold-boot if **any** of these is true:

1. You cannot recall executing the previous iter in this conversation (no `logs/iter-NNN.md` you remember writing).
2. The harness just delivered an auto-compaction summary in a system reminder.
3. `logs/latest.md` shows an `iter-NNN` you have no memory of.
4. This is the user's first message of the session (e.g. "start the loop", "/loop").

Otherwise: warm iter. Default to warm — if uncertain, the cost of an extra check (read latest.md and compare) is one file read, cheap.

## Tier 1 — cold-boot iter (full read)

| File | Why | Cap |
|------|-----|-----|
| `CLAUDE.md` | Protocol + conventions. | project-controlled |
| `.loop/state.json` | Machine state — `stage`, `iter`, `pr_mode`, `pr_size_policy`, `base_branch`, `backlog_source`. | small JSON |
| `logs/latest.md` | Handoff: next features, files to open, open blocks, last-iter summary. **This IS the carried knowledge** across compaction. | **30 lines hard** |
| Backlog source | The file/system named in `.loop/state.json` `backlog_source`. | varies by source |

That is the whole cold-boot read.

After the Tier 1 reads, invoke **`Skill: caveman`** once. This sets the narration style (model-to-model prose, sub-agent prompts) for the rest of the session — warm iters inherit it until auto-compaction. See SKILL.md principle 11 for the carve-out (on-disk artifacts the human reads are NEVER caveman).

## Tier 1 — warm iter (minimal delta)

The previous iter already read CLAUDE.md, `.loop/state.json`, and the backlog source. Re-reading them costs cache-creation tokens that auto-compact will later have to summarize. Skip them unless you have reason to believe they changed:

| File | Re-read when |
|------|--------------|
| `logs/latest.md` | **Always** — it's the handoff and you might have written it but not retained the full text post-`ScheduleWakeup`. |
| Backlog source | **Always** — the supervisor (in a parallel window) may have edited it since the last iter. Cheap relative to a wrong feature pick. |
| `CLAUDE.md` | Only if you suspect it changed (rare). |
| `.loop/state.json` | Only if `latest.md` mentions a stage transition or mode flip. |

In practice: **warm iter reads `logs/latest.md` + the backlog source, and that's usually it**. Everything else is already in working memory.

## Tier 2 — on trigger (cold and warm alike)

| File | Read when |
|------|-----------|
| `ARCHITECTURE.md` (section-scoped) | The picked goal touches that subsystem. Full read only at a phase boundary. |
| `PLAN.md` | Phase/sequence is genuinely in question. Most iters: skip — `latest.md` carries the phase. |
| `docs/brand.md`, `docs/workflow/*` | Touching UI / that specific workflow. |
| `logs/blocks.md` | `latest.md`'s "Open blocks" line is non-empty AND you need the detail. |
| `AGENTS.md` | It exists AND diverges from `CLAUDE.md` (normally a pointer — it shouldn't). |

## Tier 3 — never read back

`logs/iter-NNN.md` (archived), `logs/summary-*.md`, `logs/archive/**`. Write-only. If you find yourself wanting to read an old iter log, `latest.md` lost something it should have carried — fix the handoff, don't make archive-reading routine.

## Ordering (small cache benefit on cold boot)

On cold boot, read the stable file first (`CLAUDE.md`) and the volatile files last (`latest.md`, backlog source). The stable prefix is the part most likely to reuse across iters within the session.

## Measuring

Across a long-running session, watch the input-token count per iter (visible in the CC harness). Cold-boot iters spike on cache-creation tokens; warm iters should be ~10–20% of a cold-boot's cost. If warm iters look like cold ones, you're re-reading files that didn't need to be re-read — trim back.
