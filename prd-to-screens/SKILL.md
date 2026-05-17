---
name: prd-to-screens
description: Turn a written PRD into an approved set of HTML mockups that become the baseline frontend for an application. Drives a phased back-and-forth conversation — PRD intake → screen inventory → user workflows → wireframe approval → final HTML with shared mock data. Use whenever the user wants to mock up the frontend before implementation, validate UX from a spec, generate clickable HTML wireframes, ask "what screens do I need?", convert a PRD into screens, or sketch out the UI surface of a new app. Also trigger on phrases like "build the frontend mockups", "I want HTML for the screens", "let's design the UI first", "/prd-to-screens", or any request to plan the interface before writing real code. Sits between PRD writing (S0) and tech-stack / scaffolding work (S1/S2) in the lifecycle.
---

# PRD-to-Screens

## Overview

Take a PRD that already exists and walk the human through a phased conversation that lands
at an **approved set of HTML files** — the baseline frontend the rest of the build will
implement against. Phases progress only when the human signs off; everything is
resumable across turns via `.screens/state.json`.

| Phase | What it produces | Human gate | Reference |
|---|---|---|---|
| P1 — PRD Intake | Confirmed understanding (`.screens/intake.md`) | Light: "yes this is what I meant" | `references/p1-intake.md` |
| P2 — Screen Inventory | `docs/screens/inventory.md` — every screen with one-liner purpose, grouped | Heavy: edits/adds/removes accepted before P3 | `references/p2-inventory.md` |
| P3 — User Workflows | `docs/screens/workflows.md` — journeys mapping screen → screen with entry, branches, success/failure | Heavy: each primary journey traced and accepted | `references/p3-workflows.md` |
| P4 — Wireframes | `docs/screens/wireframes.md` — low-fi sketch per screen (sections, content, CTAs) | Iterative: approve per batch (≤ 5 screens) | `references/p4-wireframes.md` |
| P5 — HTML Build | `docs/screens/html/<slug>.html` + shared `assets/mock-data.js`, `assets/styles.css` | Iterative: approve per screen; revise until accepted | `references/p5-html-build.md` |
| P6 — Cross-link & Walkthrough | `index.html` nav, cross-links wired per workflows, screenshot/walkthrough demo | Heavy: final acceptance — frontend baseline is signed off | `references/p6-walkthrough.md` |

## Where this fits in the lifecycle

This skill is **optional but high-leverage** between S0 and S1:

```text
S0 (PRD)  →  prd-to-screens  →  S1 (tech stack)  →  S2 (scaffold)  →  S3+ (loop builds against the approved HTML)
```

Why it's worth the time:
- The PRD describes intent; the screens describe *surface area*. The surface drives stack
  decisions (component library choice, routing model, state needs) that S1 otherwise has to
  guess at.
- "Approved HTML" is a much cleaner spec for S3 to build against than prose alone — the loop
  can diff its real-app output against the mockup.
- Catches missing screens / orphaned states / impossible workflows before any code is written
  — the cheapest place to find them.

You can also run this skill **standalone** — the user shows up with a PRD from elsewhere
(Notion, Linear, a doc) and wants HTML mockups out the other end without any of the loop
machinery.

## Per-turn protocol

Every turn through this skill:

1. **Read `.screens/state.json` first.** `phase` tells you where you are. If the file is
   missing, you're starting P1 — create the file with `phase: "P1"`.
2. Read the matching `references/p<N>-<name>.md` and execute its checklist.
3. End the turn at a human gate — never charge through a gate without confirmation.
4. Update `.screens/state.json` with the new phase + `checkpoints.<phase>: "passed"` only
   after the human says yes.

State file shape:

```json
{
  "phase": "P3",
  "prd_path": "docs/PRD.md",
  "output_root": "docs/screens",
  "checkpoints": {
    "P1": "passed",
    "P2": "passed",
    "P3": "in-progress",
    "P4": "pending",
    "P5": "pending",
    "P6": "pending"
  },
  "screens": ["dashboard", "login", "signup", "settings", "..."],
  "primary_user": "small-business owner running a single Stripe account",
  "design_notes": "mobile-first, dense data tables, neutral palette"
}
```

## Trigger guardrails

**Do NOT start this skill if:**
- There is no PRD anywhere the user can point to. Stop and direct them to
  `idea-to-loop` (greenfield) or ask them to bring/write one first. A skill that mockups
  vapor produces vapor.
- The user is already past S2 in `.loop/state.json` and has real frontend code. They're
  asking for a redesign, not a baseline — use the regular frontend skill instead.

**Do start it when:**
- A PRD exists and there is no committed frontend yet, OR the user explicitly wants to
  re-baseline the UI from the spec.

## Skills this leans on

| Skill | When to invoke | Fallback if unavailable |
|---|---|---|
| `superpowers:brainstorming` | P1 if the PRD has gaps you can't fill from context — talk them out with the user, then record in `.screens/intake.md`. | Manual Q&A — list ambiguities, ask the user one bullet at a time. |
| `superpowers:writing-plans` | P3 — workflows are essentially mini-plans. The structure (preconditions → steps → branches → outcomes) translates cleanly. | The workflow template in `assets/templates/workflow.md`. |
| `frontend-design:frontend-design` | P5 — for each batch of screens, delegate the HTML generation to this skill so the output isn't generic "AI dashboard" aesthetic. | The page template in `assets/templates/page.html` + Tailwind via CDN. |
| `superpowers:verification-before-completion` | P6 exit gate — verify each HTML file actually renders (open in browser, no console errors, all cross-links resolve) before declaring done. | Manual: open each file, click every link, eyeball the result. |

## Hard rules

- **Never skip a phase.** P2 without P1 produces a guessed screen list. P5 without P4
  produces ten pages the user hates. The phases exist because earlier-phase cheapness
  compounds.
- **Never batch more than 5 screens through a single P4 or P5 approval.** Larger batches
  reliably blow past the human's review attention budget — feedback gets generic, things
  slip through, you redo work. Five is the empirically-derived ceiling.
- **Mock data is shared, not per-screen.** All screens read from
  `docs/screens/html/assets/mock-data.js`. A user named "Sam Chen" on the dashboard must
  still be "Sam Chen" on the settings page, with the same email, same plan, same join
  date. Disjoint mock data destroys the illusion and the value.
- **HTML is self-contained.** No build step. Open a file in a browser, it just works.
  Tailwind via CDN, fonts via Google Fonts, mock data via a relative `<script src>`.
  Anyone reviewing the mockups should be one double-click away from seeing them.
- **Cross-links match workflows.** Every nav element and CTA that maps to another screen
  in `workflows.md` must actually link to that screen's HTML file. P6 verifies this.
- **Phase gates are the human's, not yours.** Don't decide for them that "this looks
  good, moving on." Present the artifact, ask explicitly, wait.

## Resources

- `references/p1-intake.md` — PRD ingestion + ambiguity-resolution playbook
- `references/p2-inventory.md` — how to derive screens from a PRD without inventing pages
- `references/p3-workflows.md` — journey mapping format + worked example
- `references/p4-wireframes.md` — low-fi sketch format + batching rules
- `references/p5-html-build.md` — HTML generation, mock data discipline, frontend-design handoff
- `references/p6-walkthrough.md` — cross-linking + verification + exit gate

Templates (in `assets/templates/`):
- `inventory.md` — screen-list table template
- `workflow.md` — single-journey template
- `wireframe.md` — single-screen low-fi template
- `page.html` — self-contained Tailwind+CDN HTML page template
- `mock-data.js` — shared mock-data starter

Cross-skill:
- `idea-to-loop/references/s0-alignment-and-scope.md` — what produces the PRD this skill consumes
- `autonomous-build-loop/references/lifecycle-stages.md` — canonical stage definitions
