---
name: screen-design-loop
description: Use when existing HTML mockups should be refined against real-world design references — "design loop", "/design-loop", "refine the screens", "use Mobbin to design", "make it look like best-in-class apps" — on a repo with docs/screens/html/ mockups. For the initial baseline use prd-to-screens.
---

# Screen design loop

## Goal

Evolve the HTML design references in `docs/screens/html/` by grounding each
screen in real shipped-app patterns from the **Mobbin MCP server**. One screen
per iteration: research → synthesize → render → critique → commit. The output
is a design reference the build loop renders its real frontend against —
never production code itself.

Mobbin not configured → the loop degrades to generic drafting; have the user
add it (`claude mcp add mobbin --transport http https://api.mobbin.com/mcp`,
browser OAuth on first use) or use `prd-to-screens` instead.

## Each iteration

Read `.design-loop/state.json` — `current` screen (or next pending from
`screens[]`) and `platform: "mobile" | "desktop"`, chosen once up front; it
keys the viewport, the Mobbin queries, and the HTML breakpoints. Then:

1. **Research.** Ask Mobbin conversationally — it's natural language over
   600k+ shipped screens, not parameterized tool calls ("show me 5 paywalls
   from finance apps", "how does Notion handle the empty dashboard?"). Append
   findings to `docs/research/design/<screen>.md` — research compounds; never
   overwrite old findings.
2. **Synthesize.** Create or update the screen's HTML applying the research.
   Same conventions as `prd-to-screens`: self-contained, Tailwind via CDN,
   shared `assets/mock-data.js`. Update the existing file in place — a forked
   second baseline defeats the consumer that reads from one path.
3. **Critique gate — non-negotiable.** Render the file in a real browser at
   the platform viewport, screenshot it, and have a fresh-context read-only
   design-review sub-agent compare screenshot against research notes.
   `PASS` → approve, advance, commit. `REVISE` → keep the screen current, log
   the critique, re-enter synthesis next iteration. `BLOCK` → mark blocked,
   log, move to the next screen. "It rendered" never closes an iteration.
4. **Schedule the next iteration** (`ScheduleWakeup`), or exit cleanly when
   `EXTERNAL_SCHEDULER=1`. Blocks never halt the loop — they log to
   `logs/blocks.md` and the loop moves on.

## Contracts

- **One screen per iteration** — the gate is per-screen; batching forfeits it,
  and wide-net Mobbin queries return shallow patterns anyway.
- **Never edit `src/` or any application source.** Implementation needs go to
  the consumer's backlog (`GOALS.md`). Pause refinement of any screen the
  build loop is actively implementing.

The query playbook, HTML conventions, and the critique charter live in
`references/`.
