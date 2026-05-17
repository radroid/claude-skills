---
name: screen-design-loop
description: Iteratively refine HTML frontend mockups using Mobbin MCP as the design-inspiration source. Picks up an existing screen inventory (or derives one), researches real-world patterns per screen on Mobbin, drafts or updates self-contained HTML mockups, and gates each screen on a chrome-devtools render + Class A design-critique pass before commit. Use when phrases like "design loop", "/design-loop", "refine the screens", "make the frontend look like best-in-class apps", "use Mobbin to design", "iterate on UI", "look at how X handles Y", "redesign the dashboard with Mobbin inspiration", or "ground the mockups in real apps" appear; or when the repo has `docs/screens/html/` mockups (from `prd-to-screens` or otherwise) and the user wants them improved. **For the *initial* baseline mockups, use `prd-to-screens` first — this skill refines existing mockups, it does not derive an inventory through a human-gated conversation.** Complements `prd-to-screens` by adding a continuous refinement loop with real-world references; works standalone too. Targets mobile or desktop via a viewport setting in `.design-loop/state.json`.
---

# Screen-Design-Loop

## Overview

A continuous, iterative loop that refines HTML frontend mockups by grounding them in real shipped-app design references retrieved through the **Mobbin MCP server**. One screen per iteration: research → synthesize → render → critique → commit.

The deliverable is a **design reference** — self-contained HTML files in `docs/screens/html/`, the same location `prd-to-screens` writes to. These are NOT production frontend code; they are the *target* the production frontend (built by `autonomous-build-loop`) renders against.

| Per-iter step | What it produces | Reference |
|---|---|---|
| **(a) Mobbin research** | `docs/research/design/<screen>.md` — pattern notes, app references, image links, comparative analysis | `references/mobbin-research-patterns.md` |
| **(b) HTML synthesis** | `docs/screens/html/<screen>.html` — created or updated mockup, self-contained, Tailwind-via-CDN | `references/html-mockup-conventions.md` |
| **(c) Render + critique gate** | Screenshot via chrome-devtools-mcp + Class A `design-review` sub-agent verdict | `references/design-critique.md` |

## Where this sits in the lifecycle

**Standalone — no new lifecycle stage.** This loop is invokable any time:

- **Before `idea-to-loop` S2 (scaffold):** so the scaffold can be wired against approved-and-inspired mockups
- **After `prd-to-screens` P6:** to keep refining the baseline as the project's design vision sharpens
- **During `autonomous-build-loop` S3+:** queued ahead of any UI-touching feature iter so principle 9's "forced critique against the design reference" has a real reference to critique against
- **Pure standalone:** existing repo with HTML mockups (any source) the user just wants improved

It does NOT replace `prd-to-screens`. That skill is a phased one-shot conversation that establishes the *baseline*; this skill is a refinement loop that *evolves* the baseline using fresh real-world research.

## Two operating modes

Same pattern as `autonomous-build-loop`. Check which mode applies BEFORE the last step of any iter.

| Mode | Trigger | End-of-iter behavior |
|------|---------|------------------|
| **In-session loop** | Interactive Claude Code session; `ScheduleWakeup` tool is registered. | Call `ScheduleWakeup` to schedule the next iter. |
| **External scheduler** | Env var `EXTERNAL_SCHEDULER=1` is set; session started via `claude -p`. | Do NOT call `ScheduleWakeup`. External driver handles cadence — exit cleanly after commit. |

## Core principles

1. **The deliverable is a design reference, not production code.** Mockups live in `docs/screens/html/` and serve as the spec `autonomous-build-loop` renders against. Never edit application source from inside this loop — if a screen needs real implementation, log it to the consumer's `GOALS.md` and move on.

2. **One screen per iteration.** Resist the urge to batch. Mobbin research is most useful when focused on a single screen archetype (paywall, onboarding, dashboard, settings) — wide-net queries return shallow patterns. The chrome-devtools critique is also a per-screen exit gate; batching hides regressions.

3. **The Mobbin interaction is natural-language, not parameterized tool calls.** Per the official docs, you "ask Claude to search Mobbin directly" — Claude routes your conversational request through whatever tools the Mobbin MCP server exposes; the user-facing surface is plain English over 600k+ shipped screens. Don't try to construct synthetic tool-call payloads. The loop learns to ask: *"Show me 5 paywalls from finance apps with high-conversion patterns"*, *"How does Notion handle empty state on the dashboard?"*, *"Compare KYC onboarding in Revolut, N26, and Wise — what's different?"*. See `references/mobbin-research-patterns.md` for the query playbook.

4. **Research first, HTML second — they are two steps, not one.** The Mobbin pass produces `docs/research/design/<screen>.md` (pattern notes, app references, annotations). HTML authoring is a *separate* step that reads the research doc as context. Skipping the research persistence step makes critique impossible (no reference to compare against) and burns Mobbin queries on every refinement.

5. **Critique exit gate is non-negotiable.** A screen iter does NOT close on "the HTML rendered." It closes on: (i) chrome-devtools-mcp opens the file in a real browser at the configured viewport, (ii) screenshot is captured, (iii) a Class A `design-review` sub-agent (read-only, fresh context) compares the screenshot against the research notes and returns `pass | revise | block`. Anything other than `pass` re-queues the screen.

6. **Mobile or desktop, not "responsive" by default.** Pick one platform up front in `.design-loop/state.json` (`platform: "mobile" | "desktop"`). The chrome-devtools viewport, the Mobbin queries ("mobile checkout"), and the HTML breakpoints all key off this. Responsive can be a later refinement once both viewports have been individually validated.

7. **Stack the artifacts; don't fork them.** If `prd-to-screens` already wrote `docs/screens/html/dashboard.html`, this loop UPDATES that file in place. Same shared `assets/mock-data.js`, same Tailwind-via-CDN convention. Forking output locations creates two competing baselines and defeats the consumer (`autonomous-build-loop`) that reads from one path.

8. **Same continuous-loop semantics as `autonomous-build-loop`.** Blocks become entries in `logs/blocks.md`, not halts. A Mobbin query that returns nothing useful, a critique `block` verdict, a render failure — all log + pick next screen + continue. See `autonomous-build-loop/references/continuous-loop.md`.

## Quick-start: starting an iteration

1. **Read `.design-loop/state.json`** — `current` tells you the screen in flight; if null, pick the next `pending` from `screens[]`. Read `references/per-iteration-checklist.md` for the full procedure.
2. **Read `references/mobbin-research-patterns.md`** if this is your first iter of the session — the query patterns matter.
3. **Mobbin research pass** — query the `mobbin` MCP server with focused, comparative prompts. Persist the result as `docs/research/design/<screen>.md`. If notes already exist, update them additively (don't overwrite — research compounds).
4. **HTML synthesis** — open `docs/screens/html/<screen>.html` if it exists; create from a clean Tailwind+CDN page skeleton if not. Apply the patterns from the research doc. Shared mock data in `docs/screens/html/assets/mock-data.js` (matches `prd-to-screens` convention).
5. **Render + screenshot** — use `chrome-devtools-mcp` to open the file at the platform viewport (`375x812` mobile / `1440x900` desktop), capture screenshot.
6. **Class A design-critique sub-agent** — fresh context, read-only, given the screenshot + research notes; returns `pass | revise | block` with concrete annotations. Charter template: `references/design-critique.md`.
7. **On `pass`:** mark `screens[i].status: "approved"`, increment `refinement_count`, advance `current` to the next pending screen, commit.
8. **On `revise`:** keep `current` as-is, log the critique to `logs/blocks.md`, the next iter re-enters synthesis with the critique in context.
9. **On `block`:** mark `screens[i].status: "blocked"`, log reason, advance to the next pending screen.
10. **In-session mode:** `ScheduleWakeup` for next iter (default: 600s). **External-scheduler mode:** exit cleanly.

## When NOT to use this skill

- **No screen inventory and no PRD.** This loop refines *something*. If there's neither an existing `docs/screens/html/` directory nor a PRD from which to derive a screen list, run `prd-to-screens` first (or `grill-to-prd` → `prd-to-screens` if there's not even a PRD).
- **Mobbin MCP is not configured / authenticated.** The skill's value rests on the Mobbin research step. Without it, every iter degrades to "draft HTML from training data" — which is exactly what we built `frontend-design:frontend-design` for. Add the MCP server first: `claude mcp add mobbin --transport http https://api.mobbin.com/mcp` (browser OAuth on first use). If the user can't add it, point them at `prd-to-screens` (which doesn't depend on Mobbin) and stop.
- **The user wants production frontend code.** This loop produces design references in `docs/screens/html/`. If they want real components in `src/`, that's `autonomous-build-loop` territory — and that loop will critique its output against *these* mockups.
- **Mid-implementation surface churn.** If `autonomous-build-loop` is actively shipping S3 frontend features for a screen, refining its design reference under it causes whiplash. Pause this loop until the in-flight feature merges, or scope refinement to screens not under active implementation.

## Hard rules

- **One screen per iter.** Hard cap. The exit gate (chrome-devtools + Class A critique) is per-screen; batching forfeits the gate.
- **Never edit `src/` or any application source.** This loop is design-only. Application-code changes go through `autonomous-build-loop`.
- **Never skip the critique gate.** No "looked fine in my head." A screen iter that doesn't end in a `pass` verdict from a fresh-context Class A sub-agent is not done.
- **Never overwrite a research doc — append.** Each Mobbin pass adds findings to `docs/research/design/<screen>.md`. Old findings are dated and kept. Research is cumulative.
- **Mock data is shared across screens.** Reuse `docs/screens/html/assets/mock-data.js` (the `prd-to-screens` convention). A user named "Sam Chen" on the dashboard must still be "Sam Chen" on settings.
- **HTML is self-contained.** No build step. Tailwind via CDN, fonts via Google Fonts, mock data via relative `<script src>`. Double-click the file → it renders.
- **Mobbin queries are conversational, not parameterized.** Ask the MCP server in plain language, the way the user would. Don't try to construct synthetic tool-call payloads — there are no discrete tools.
- **End every iter by scheduling the next** (in-session) **or exiting cleanly** (external-scheduler). No semantic halt.

## Resources

- `references/per-iteration-checklist.md` — the per-iter procedure end-to-end
- `references/screen-inventory.md` — derive the screen list from PRD / existing mockups / GOALS.md; sync with `prd-to-screens` output when present
- `references/mobbin-research-patterns.md` — the Mobbin MCP query playbook (conversational patterns, when to compare apps, how to scope by vertical)
- `references/html-mockup-conventions.md` — self-contained Tailwind+CDN HTML conventions; matches `prd-to-screens` so artifacts stack
- `references/design-critique.md` — chrome-devtools-mcp render + Class A design-review sub-agent charter; the per-screen exit gate
- `references/integration.md` — how this composes with `prd-to-screens`, `autonomous-build-loop` (principle 9), and `idea-to-loop`

Cross-skill:

- `autonomous-build-loop/SKILL.md` principle 9 — the consumer of this loop's output ("forced critique pass against the design reference")
- `autonomous-build-loop/references/continuous-loop.md` — no-halt iter semantics this loop also follows
- `autonomous-build-loop/references/sub-agent-protocol.md` — Class A charter rules for the design-review sub-agent
- `prd-to-screens/SKILL.md` — the upstream baseline; this loop refines what P6 approves
