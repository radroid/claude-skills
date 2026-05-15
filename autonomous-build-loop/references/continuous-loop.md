# Continuous loop — no-halt routing

**The loop NEVER halts on a semantic event.** Every block, failure, or user-decision-needed becomes a structured-log entry. The user reviews at their own pace; the agent always schedules the next iter.

`HUMAN_REVIEW.md` as a halt primitive is **deprecated.** If you find it referenced anywhere, treat it as a no-op and remove the reference.

## Event → action matrix

| Event | Agent action |
|-------|--------------|
| **Sub-agent returns `block`** | Append to `logs/blocks.md` (date, iter, sub-agent name, charter, verdict text, reason). Pick the next non-conflicting `GOALS.md` item and proceed in the SAME iter or the next one. Do NOT skip step 13 — in-session: still `ScheduleWakeup`; external-scheduler (`EXTERNAL_SCHEDULER=1`): still exit cleanly so the driver fires the next iter. |
| **Runtime smoke fail** (chrome-devtools MCP, lighthouse, etc.) | Log to `logs/blocks.md` with screenshot path + console output. Continue. |
| **MCP server unreachable** | Log a one-line entry to `logs/blocks.md` once (not per-iter). Skip that surface's work for this iter; route to backend gap-fill. Escalate to user-restart recommendation after 3 consecutive iters. |
| **User-decision blocker** (API key needed, schema purge, project provision) | Log under `GOALS.md` § "Open dependencies (waiting on user)". Prefix `**HIGH PRIORITY —**` if it blocks meaningful work. Continue with any item that does NOT depend on the decision. |
| **Contract-drift signal** (`check:contracts` mismatch) | Log to `logs/blocks.md`, low severity. Continue — drift is a signal, not a halt. |
| **Phase boundary** (P1 → P2, etc.) | Log "phase complete" entry. Re-read full `ARCHITECTURE.md` once. **MUST invoke `Skill` tool with `skill: "improve-codebase-architecture"`** (actual tool call). Log result to `logs/blocks.md` with `**Source:** arch-pass`. Address checklist over 1–2 iters. Then advance. Do NOT halt. |
| **`GOALS.md` backlog empty** | Look at `ARCHITECTURE.md` for unimplemented features (PDF / spec chapter ordering preferred). Promote to `GOALS.md`. Continue. The loop self-feeds from the spec. |
| **Pre-commit hook failure** | Fix the underlying issue. Re-stage. Create a NEW commit (never `--amend` after hook failure — the commit didn't happen, so `--amend` would modify the previous commit). |
| **`git push` failure** (auth / network / pre-push hook) | Append one line to iter log (`Push: failed — <reason>`). Append to `logs/blocks.md` if persists across iters. Fix tests and retry next iter. Never `push --no-verify` without explicit authorization. |

## There is no halt

The loop has **no halt cause at all** — not even a process-level one.

**Context budget is never a halt, a slowdown, or a restart trigger.** In-session mode runs
on a large-context model with harness auto-compaction (configured to compact around 50% of
the context window). The loop is built to survive compaction: `logs/latest.md` + the tiered
read manifest make every iter self-contained, so the loop resumes seamlessly on the other
side of a compaction. Do NOT eyeball context usage, do NOT space out wake-ups for it, and do
NOT write "restart Claude Code" into the iter log — the agent never recommends ending the
session for token reasons.

In **external-scheduler mode** (`EXTERNAL_SCHEDULER=1`), context never accumulates either —
every iter is a fresh `claude -p` process with zero carried context. The driver script
enforces budget at the OS level (rolling 5h window, per-iter `--max-budget-usd`); the agent
just exits after committing.

## Repeated-issue counter

If the same `issue-id` is raised across **3 consecutive iters** without resolution, fire the coin-toss tiebreaker:

1. Identify the two competing positions concisely (A and B)
2. `echo $((RANDOM % 2))` — 0 = A, 1 = B
3. Log toss result + chosen position under "Decisions" in the iter log
4. Adopt the chosen position. Mark resolved in `GOALS.md`. Reset counter.
5. Do NOT re-litigate. Sub-agents who keep raising it must be told the call has been made.

This rule exists because indecision masquerading as "let's review again next iter" is the dominant time-sink in long loops.

## Dashboard contract

If the project ships a dashboard (`localhost:<port>/dashboard.html` or similar), the user reviews via the dashboard. The agent never asks the user a direct question mid-loop — open dependencies go through `GOALS.md`'s "Open dependencies (waiting on user)" section.

The dashboard rebuilds on every commit (watcher-based, ~1s latency). The agent's job is to keep the structured logs accurate; the dashboard renders them.
