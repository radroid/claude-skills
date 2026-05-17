# Grilling the user for a build backlog

When GOALS.md is missing or sparse, the loop has nothing to do. Run a focused interview to extract 8–15 shippable features before scaffolding.

> **Backlog vs. PRD — different grills.** This doc is about the **backlog grill** (output: GOALS.md, 8–15 vertical-slice features). For the **PRD grill** (output: `docs/PRD.md` via a persona-aware interview across Technical / Designer / Vibe lanes), use the `grill-to-prd` skill instead. The two grills serve different artifacts and can both run for the same project — backlog grill for what-to-build-next, PRD grill for what-this-thing-is.

## How to invoke the `grill-me` skill

Open with this brief (substitute project name):

> Interview me to extract a build backlog for autonomous looping on `<project>`. Goal: 8–15 concrete, independently-shippable features ordered roughly by phase. Stress-test for: feature dependencies, MVP scope vs. nice-to-haves, what's already built vs. truly remaining, and external blockers (API keys, design signoffs, third-party integrations).
>
> Output format: a markdown list with `- [ ] PHASE.LETTER — <feature name> — <2-line description>`.

## Fallback question bank (if grill-me unavailable)

Ask 2–3 at a time, not all at once.

### What the project is

1. One-sentence: what does this build do, for whom?
2. What's the smallest version that would be useful to one real user?
3. What's the platform / surface? (web, mobile, CLI, library, etc.)
4. What tech stack is locked in? What's negotiable?

### What exists today

5. Walk me through what's already deployed / working.
6. What broke recently or is half-built?
7. Is there a spec / PRD / design doc I should read before we plan?

### What comes next

8. What are the 3 things that, if shipped, would unblock the most user value?
9. What features depend on each other? (Sketch a dependency graph.)
10. What's a "could ship in week 1" vs. "needs week 4 to make sense"?
11. Are there features you keep wanting to build but keep deferring? Why?

### External blockers

12. Are there third-party integrations that need API keys you don't have?
13. Are there design / brand decisions that need sign-off from someone else?
14. Are there compliance / legal / security gates that have to happen first?

### Loop fitness

15. Are any of these features "demo-only" (won't work without a live backend / API key)? Mark separately — the loop can build them but can't end-to-end test them.
16. What does "done" look like for each feature? Tests passing? Manual QA? Real users?

## Output → GOALS.md transformation

Convert the interview output into the format from `references/backlog-format.md`:

```markdown
# GOALS.md

## Phase 1 — <phase name>

- [ ] P1.A — <feature> — <description>
- [ ] P1.B — <feature> — <description>
- [ ] P1.C — <feature> — <description>

## Phase 2 — <phase name>

- [ ] P2.A — ...

## Open dependencies (waiting on user)

- **HIGH PRIORITY** — <blocker description>
- <blocker description>
```

## When the user has plenty already documented

If the user has a PRD, design doc, or roadmap, SKIP grilling and offer the `to-issues` or `to-prd` skill instead, OR read the existing doc and extract the backlog directly. Don't grill someone who's already done the work.
