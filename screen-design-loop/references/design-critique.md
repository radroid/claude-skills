# Design critique — the per-screen exit gate

A screen iter does NOT close on "the HTML rendered." It closes on a `PASS` verdict from a fresh-context Class A `design-review` sub-agent that compared the rendered screenshot against the research notes.

This is the analogue of `autonomous-build-loop`'s principle 9 ("frontend has no free signal") applied to design refinement. We manufacture the signal here because there isn't one for free.

## Render step (chrome-devtools-mcp)

Before dispatching the sub-agent, capture a real screenshot.

1. Open the file in chrome-devtools at the platform viewport:
   - `platform: "mobile"` → device emulation `375x812`, pixel ratio 2
   - `platform: "desktop"` → window size `1440x900`
2. URL: `file:///<absolute-path-to-repo>/docs/screens/html/<slug>.html`
3. `wait_for` page load (network idle + DOMContentLoaded)
4. Check `list_console_messages` — any uncaught errors are an automatic synthesis bug, not a design failure. Fix in this iter; do NOT run the critique on a broken render.
5. `take_screenshot` of the full page (not just the viewport — scrolling reveals design)
6. Persist the screenshot path to pass into the sub-agent prompt

If chrome-devtools-mcp isn't available, fall back: instruct the user to open the file and screenshot manually. Don't proceed without a screenshot — the critique pivots on visual evidence.

## Class A `design-review` sub-agent charter

**Type:** Class A (read-only, fresh context, returns verdict text only). Pattern per `autonomous-build-loop/references/sub-agent-protocol.md`.

**Inputs given to the sub-agent (verbatim in the prompt):**

1. The screenshot (image)
2. The full contents of `docs/research/design/<slug>.md`
3. The screen's entry from `docs/screens/inventory.md` (or `state.json screens[i]`)
4. `.design-loop/state.json` `platform` value
5. The HTML file path (so it can read source if it needs to verify a specific element)

**The prompt:**

```text
You are a Class A design-review sub-agent. Read-only. Return verdict text only.

Context:
- Platform: <mobile | desktop>
- Screen purpose: <one-liner from inventory>
- Research notes (the design target this screen aims at): <inline contents of docs/research/design/<slug>.md>

Your task:
1. Compare the screenshot against the research notes' "Worth borrowing" patterns.
2. Check the screenshot against the platform-appropriate baselines:
   - Mobile: ≥44px tap targets, single-column layout, bottom sheets not centered modals, generous padding
   - Desktop: ≥32px tap targets, hover affordances visible, multi-column where research justifies
   - Both: visual hierarchy (one clear primary CTA), AA color contrast, type hierarchy distinguishable
3. Check the screenshot against the research notes' "Explicitly NOT borrowing" anti-patterns — has the HTML drifted into any of them?

Return ONE of:

PASS — <one-line reason>
  - Screen meets the research target. Notable strengths: <2-3 bullets>.

REVISE — <one-line reason>
  - Falls short on: <named dimension 1: concrete observation>
  - Falls short on: <named dimension 2: concrete observation>
  - Suggested fix: <specific, actionable, references the research notes>

BLOCK — <one-line reason>
  - Premise problem: <e.g., the rendered screen is for a different purpose than the inventory entry>
  - Resolution requires: <e.g., human clarification, inventory edit, etc.>

Do not modify files. Do not return prose beyond the verdict block.
```

## Reading the verdict

| Verdict | Loop action (per `references/per-iteration-checklist.md` § 6) |
|---|---|
| `PASS` | Mark `screens[i].status: "approved"`. Commit. Advance `current`. |
| `REVISE` | Keep `current`. Log critique verbatim to `logs/blocks.md`. Next iter re-enters synthesis with the critique in context. |
| `BLOCK` | Mark `screens[i].status: "blocked"`. Log reason. Advance `current`. Human resolves before re-queuing. |

## Why fresh context

Same reason `autonomous-build-loop` uses fresh-context super-reviewers: the iter agent has session bias. It wrote the HTML, it knows what it *meant* to render, and it grades on intent. The Class A sub-agent grades on what's actually on screen, with no prior commitment to defend.

## Why one sub-agent, not many

Tempting to dispatch a "color contrast reviewer", a "hierarchy reviewer", a "tap-target reviewer" in parallel. Don't:
- Mockup quality is gestalt — a screen with perfect contrast and broken hierarchy is bad design, and you want ONE verdict that integrates both
- Cost scales linearly with sub-agents; one well-prompted reviewer beats three narrow ones
- Conflict resolution between three verdicts ("color says pass, hierarchy says revise") wastes the iter

One reviewer. Comprehensive checklist. Single verdict.

## Revise round limits

If the same screen produces `REVISE` for **3 consecutive iters**:

1. Read all three critique entries from `logs/blocks.md`.
2. If the critiques disagree (round 1 said the CTA is too prominent, round 2 said too quiet), invoke `autonomous-build-loop`'s coin-toss tiebreaker rule: name the two competing positions, `echo $((RANDOM % 2))`, log the toss + chosen position under "Decisions" in the iter log, mark resolved, do not re-litigate.
3. If the critiques agree (all three said "hierarchy is unclear") but the HTML keeps failing, log to `logs/blocks.md` as `**blocker:** synthesis cannot satisfy critique — needs human input` and mark the screen `blocked`.

The point: revise rounds shouldn't be infinite. After 3, something is structurally stuck and the loop escalates.
