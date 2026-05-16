# Auto-research mode

Multi-agent research pattern. Replaces training-data guesswork on currency-sensitive
topics (framework defaults, SDK quickstarts, API surfaces) with **fresh web findings,
synthesized in-context**.

## The pattern

1. **Lead defines ONE research question.** One topic per dispatch — `next.js app router
   data-fetching pattern 2026`, not `pick a backend stack`.
2. **Dispatch 3–5 Class A sub-agents in parallel** via the `Agent` tool (`subagent_type:
   "general-purpose"`). Read-only — web fetch, `context7` MCP, general search. Each agent
   gets a **focused sub-question**, not the full topic.
3. **Each sub-agent returns CONDENSED findings.** Cap each report at ~300 words. They
   write the report, not the raw search dumps. Lead's context stays clean.
4. **Lead synthesizes** into one recommendation + rationale + tradeoffs (+ called-out
   disagreements between sub-agents). Target ~400–600 words; one page max.
5. **Persist to `docs/research/<topic>.md`.** Committed to git. Becomes Tier-2 context
   for super-reviewer (`autonomous-build-loop/references/super-reviewer.md`) and a
   reference for future iters.

## When to invoke

- **S1 tech-stack picks** — one dispatch per stack element (framework, persistence,
  auth, payments). See `s1-tech-stack-selection.md`.
- **S2 integration setup** — current SDK quickstarts. Stale training data is the
  failure mode here. See `s2-scaffold-and-wire.md`.
- **Any S3+ iter** where the lead would otherwise guess from training data on a
  current API or recently changed library default.

## When NOT to invoke

- Code review → use super-reviewer
  (`autonomous-build-loop/references/super-reviewer.md`)
- Implementation → use TDD + Class B sub-agents
  (`autonomous-build-loop/references/sub-agent-protocol.md`)
- Bug diagnosis → use `systematic-debugging` / `diagnose`
- Anything where the answer is in-repo (read the code; this is the **`tiered-read-
  strategy`** Tier-2/3 behavior, not research)

## Dispatch boilerplate

Invoke the `Agent` tool **3–5 times in a single message** so all sub-agents run
concurrently. One block per sub-question. After all return, aggregate and synthesize.

```
Agent:
  subagent_type: "general-purpose"
  description: "Research <sub-question>"
  prompt: |
    Research <sub-question>. Use web fetch + context7 MCP for current
    docs. Return a CONDENSED report under 300 words:
    - Answer
    - 2-3 supporting sources (URLs)
    - Tradeoffs / dissenting views you found
    Do NOT include raw search results, full doc excerpts, or commentary
    beyond what's needed. Lead is synthesizing across 3-5 reports.
```

## Cross-references

- `s1-tech-stack-selection.md` / `s2-scaffold-and-wire.md` — primary callers.
- `autonomous-build-loop/references/super-reviewer.md` — consumes `docs/research/*.md`.
- `autonomous-build-loop/references/sub-agent-protocol.md` — Class A vs Class B charters.
- `autonomous-build-loop/references/tiered-read-strategy.md` — when to read in-repo vs. research.
