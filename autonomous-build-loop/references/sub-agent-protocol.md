# Sub-agent protocol

Two classes of sub-agent with different write authority. Use the right class for the right job — confusing them is how the loop ships uncoordinated changes.

## Class A — Review / analysis (read-only)

**Used for:** peer-review, plan-section sub-agents in Phase 1, architecture-pass sub-agents, deletion-test analysis, ADR drafts.

**Authority:** READ-ONLY. **MUST NOT write to the repo.** Returns text only. Main agent applies any resulting edits.

**Charter format:**

- One paragraph of context
- Verdict format (unified canon): `APPROVE` / `REVISE` / `BLOCK` (legacy `approve` → APPROVE; `request_changes` → REVISE; `block` → BLOCK)
- Verdict text must include cited file paths + line numbers where applicable

**Inputs to give the sub-agent:**

- Specific files/sections to read (don't tell it to "explore" — that's expensive)
- The diff or scope being reviewed (`git diff <base>..HEAD` snippets work well)
- The reference docs that define the expected contract (e.g. scoping plans, schema files)
- Stable `issue-id`s for any disagreement so the counter can track recurrence

**Verdict handling:**

- `APPROVE` → log to `logs/blocks.md` (low severity), continue
- `REVISE` → log to `logs/blocks.md` (medium severity), apply fixes same-iter, continue
- `BLOCK` → log to `logs/blocks.md` (high severity), pick next non-conflicting `GOALS.md` item, continue. Do NOT halt the loop.

## Class B — Implementation (write-authorized)

**Used for:** parallel feature implementation in fat-iter mode.

**Authority:** Write-authorized within a disjoint file allowlist. Each sub-agent owns ONLY the files in its allowlist.

**Charter format (every Class B prompt MUST include):**

```
Scoping plan: plan/<feature>.md
Allowlist (exact files you may write/edit):
  - <path 1>
  - <path 2>
  - ...

Test requirements:
  - <file>: <behaviors>

Stop-rule: Do not modify files outside the allowlist. If you believe a file
outside the list needs changes, STOP and return what + why; the main agent
decides whether to extend the allowlist, refactor first, or drop the feature.

Return:
  - List of files written
  - One-paragraph summary of changes
  - Any blockers encountered
```

**Verification scope:** Class B sub-agents verify their OWN scope only (the files in their allowlist + the tests they wrote). They do NOT re-run the full repo test suite — that's the main agent's job in fat-iter Phase 3.

**Default `subagent_type`:** `general-purpose` (full tool access). Use `Explore` only when the work is pure read-only research, and `Plan` only when the work is "design the implementation plan" rather than "execute it."

## Common rules (both classes)

- **Parallelize independent work.** Spawn in a single message with multiple `Agent` tool calls when the work is parallelizable. Sequential dispatch wastes wall-clock time.
- **Be specific in prompts.** Terse command-style prompts produce shallow work. Include file paths, contract details, expected behaviors — the sub-agent has not seen your conversation.
- **Trust but verify.** A sub-agent's summary describes what it intended to do, not necessarily what it did. After dispatch, inspect the actual diff before reporting work as done.
- **Crashed sub-agent recovery.** If a sub-agent crashes mid-run (API 500, timeout), inspect the on-disk diff before re-dispatching. Implementation code may have landed; recovering by writing missing tests inline is often cheaper than a full re-dispatch.
- **Disagreement tracking.** Each distinct concern raised by a Class A reviewer gets a stable `issue-id`. Increment counter on recurrence; reset on resolution. Three consecutive iters of the same unresolved `issue-id` triggers the coin-toss tiebreaker (see SKILL.md).

## Anti-patterns

- ❌ Class A sub-agent writing files — silently corrupts state
- ❌ Two Class B sub-agents with overlapping allowlists — parallel-write corruption
- ❌ Class B sub-agent re-running the full repo test suite — wastes 20–40% of its budget; main agent does this in Phase 3
- ❌ Spawning sub-agents sequentially when the work is independent — wastes wall-clock
- ❌ Re-dispatching after a crash without first checking on-disk diff — risks duplicate writes
- ❌ Asking the sub-agent to "decide the contract" — contracts are decided in scoping (Phase 1); the sub-agent executes
