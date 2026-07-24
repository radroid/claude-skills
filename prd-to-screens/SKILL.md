---
name: prd-to-screens
description: Use when the user wants a PRD turned into approved HTML mockups before implementation — "what screens do I need?", "build the frontend mockups", "let's design the UI first", "/prd-to-screens", clickable HTML wireframes from a spec.
---

# PRD to screens

## Goal

Walk the human from an existing PRD to an **approved set of self-contained
HTML mockups** — the baseline the real frontend gets built against and diffed
against. Phased and human-gated, so problems are found where they're cheapest:

P1 intake (confirm your reading of the PRD) → P2 screen inventory
(`docs/screens/inventory.md`) → P3 user workflows
(`docs/screens/workflows.md`) → P4 low-fi wireframes → P5 HTML build
(`docs/screens/html/<slug>.html`) → P6 cross-link + walkthrough + final
acceptance.

No PRD anywhere → wrong skill; point the user at `grill-to-prd` or
`idea-to-loop`. Real frontend code already committed → that's a redesign, not
a baseline.

## Where to start

Read `.screens/state.json` — `phase` says where you are (missing → create it
at P1). It also carries `prd_path`, `output_root`, per-phase `checkpoints`,
the `screens` list, the primary user, and design notes. Mark a checkpoint
passed only after the human says yes.

## Contracts

- **Never skip a phase, and every gate is the human's** — present the
  artifact, ask explicitly, wait. Don't decide "this looks good, moving on"
  for them.
- **≤5 screens per approval batch** in P4/P5 — bigger batches exhaust review
  attention and the feedback goes generic.
- **Mock data is shared** (`docs/screens/html/assets/mock-data.js`): the same
  person, email, and plan on every screen. Disjoint mock data destroys the
  illusion.
- **HTML is self-contained** — Tailwind via CDN, Google Fonts, mock data via
  relative `<script src>`; double-click renders, no build step.
- **Cross-links must match `workflows.md`** — every nav element and CTA that
  maps to another screen actually links to it. P6 verifies links and clean
  rendering before final acceptance.
- Delegate P5 visual quality to the `frontend-design` skill where available,
  so screens don't land as generic AI dashboards.

Templates (inventory table, workflow, wireframe, page skeleton, mock-data
starter) are in `assets/templates/`.
