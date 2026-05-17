# P6 — Cross-link & Walkthrough

Wire the screens together so the human can click through real journeys, verify every
cross-link from `workflows.md` actually works, and run a final walkthrough that lands at
explicit acceptance. This is the gate that turns "I built some HTML pages" into "I built
a baseline frontend".

## Exit gate

**Human explicitly accepts the full frontend baseline.** Not "this is fine," not silence —
an affirmative "approved, this is the baseline." On acceptance, set `checkpoints.P6:
"passed"`, flip `phase` to `"DONE"`, and produce the handoff summary below.

## Required artifacts at exit

- `docs/screens/html/index.html` — a landing/menu page that lists every screen grouped the
  same way as `inventory.md`, with a click-through link to each.
- All P5 HTML files cross-linked per `workflows.md` (nav, CTAs, and embedded links between
  related screens).
- `docs/screens/SUMMARY.md` — handoff doc (template below) that S1 / S2 / `auto-loop-
  bootstrap` will read.

## Workflow

1. **Build `index.html`.** Use the page template, but the body is a grouped link list:

   ```html
   <h2>Auth</h2>
   <ul>
     <li><a href="./login.html">Login</a> — auth gate for returning users</li>
     <li><a href="./signup.html">Sign up</a> — account creation</li>
   </ul>
   <h2>Core</h2>
   <ul>
     <li><a href="./dashboard.html">Dashboard</a> — hub showing recent activity + KPIs</li>
     ...
   </ul>
   ```

   This is what the human will land on for the walkthrough. It also doubles as the
   permanent "show me all the mocks" entry point for anyone reviewing later.

2. **Verify cross-links.** For every CTA / nav entry mentioned in each screen's wireframe,
   confirm the `<a href>` or `onclick` actually goes to a real file. The cheapest way:

   ```bash
   # from docs/screens/html/
   grep -rEho 'href="\./[a-z0-9-]+\.html"' . | sort -u | sed 's|href="\./||; s|"||' \
     | while read f; do [ -f "$f" ] || echo "MISSING: $f"; done
   ```

   Fix any misses by either creating the page (if it's a screen you missed — go back to P2,
   shame on you) or rewriting the link (typo).

3. **Walk each primary journey from `workflows.md`** end-to-end in the browser. Start at
   the journey's trigger screen, click the CTAs the journey says, end at the success
   outcome. Note any link that goes nowhere, any in-page interaction the wireframe
   promised that doesn't work, any visual seam between screens (e.g., topnav looks
   different on `dashboard` vs `invoices`). Fix on the spot.

4. **Apply `superpowers:verification-before-completion` for the exit gate.** That skill's
   discipline is the right one here: don't claim "ready" without evidence. Evidence here is:
   - Every screen opens with no console errors
   - Every cross-link resolves
   - Every journey from `workflows.md` is walkable
   - Mock data is consistent across screens (Sam Chen is Sam Chen everywhere)

   If you have a browser MCP (Chrome DevTools or Playwright), automate the walk. If not,
   list the manual checks in your turn message before declaring done.

5. **Present the walkthrough to the human.**

   > "Open `docs/screens/html/index.html` to land on the menu. I've walked through every
   > journey end-to-end — all links resolve, mock data is consistent across screens. Want
   > me to walk you through the [primary journey] live, or do you want to click around on
   > your own?"

   Let them poke. Expect a final round of revisions — typically small stuff (rename a CTA,
   tweak a color, swap two table columns). Apply, re-present, wait for explicit approval.

6. **Write `docs/screens/SUMMARY.md`.** Template:

   ```markdown
   # Frontend Baseline — Summary

   PRD: `docs/PRD.md`
   Approved: <YYYY-MM-DD> by <human's handle>

   ## Screens
   - Count: <N> screens, <M> groups
   - Inventory: `docs/screens/inventory.md`
   - Workflows: `docs/screens/workflows.md`
   - Wireframes: `docs/screens/wireframes.md`
   - HTML: `docs/screens/html/` (open `index.html`)

   ## What's mocked
   - Self-contained HTML, no build step
   - Tailwind via CDN, Google Font, vanilla JS
   - Shared mock data in `assets/mock-data.js`

   ## What stack implications fall out
   - <e.g. "Need a charting library; recharts/visx if React, Chart.js otherwise">
   - <e.g. "Heavy table interactions — TanStack Table or similar">
   - <e.g. "Auth required — pick provider in S1">
   - <e.g. "No real-time needs identified">

   ## Decisions deferred to S1+
   - <anything intentionally not designed yet because it's an implementation choice>
   ```

   This file is the explicit handoff to whatever comes next — `idea-to-loop` S1 reads it
   to inform stack choice; `autonomous-build-loop` reads it later to diff real output
   against the baseline.

7. **Update `.screens/state.json`** one last time:

   ```json
   {
     "phase": "DONE",
     "checkpoints": { "P1": "passed", ..., "P6": "passed" },
     "completed_at": "<ISO timestamp>"
   }
   ```

## Why the summary matters even if the human doesn't read it

Three months from now, someone (the same human, a teammate, the loop) will look at
`docs/screens/html/` and ask "what is this and how do I use it?" `SUMMARY.md` is the
answer. Without it, the mocks rot into a folder of HTML nobody trusts.

## What NOT to do

- Don't add new screens in P6. New-screen requests at this stage are a regression to P2 —
  go back, update inventory, walk forward. Don't append.
- Don't skip the walkthrough because "all the screens look good individually". Cross-screen
  is exactly where the bugs live; the whole point of P6 is to find them.
- Don't accept "looks fine" as the exit gate. That's not approval, it's politeness. Ask
  again: "Are you signing off on this as the frontend baseline?" Wait for yes.

## Cross-references

- `p3-workflows.md` — the journeys to walk.
- `p5-html-build.md` — the files to wire together.
- `superpowers:verification-before-completion` — the discipline for the final gate.
- `autonomous-build-loop/SKILL.md` — downstream consumer of the baseline.
