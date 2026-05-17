# Per-iteration checklist

The procedure for one iter of `screen-design-loop`. One iter = one bounded turn = one screen advanced.

## 0. Pre-flight

- **Read `.design-loop/state.json`.** Missing? Run `references/screen-inventory.md` to bootstrap it.
- **Check `iter` and `current`:**
  - `current` is a slug → continue refining that screen
  - `current` is `null` → pick the next `screens[i].status === "pending"` (or first `"revise"`)
  - Every screen is `"approved"` or `"blocked"` → backlog drained; see "When the backlog is empty" below

## 1. Read the iter context

- `docs/screens/html/<current>.html` — current mockup state, if any
- `docs/research/design/<current>.md` — accumulated research notes, if any
- `logs/blocks.md` last entry tagged `screen: <current>` — the prior critique verdict's revise notes, if the screen is on a revise re-entry

If this is your first iter of the session, also read:
- `references/mobbin-research-patterns.md` — the query playbook
- `references/html-mockup-conventions.md` — output format
- `references/design-critique.md` — the exit gate

## 2. Mobbin research pass

Call the Mobbin MCP server with **conversational, screen-archetype-focused** queries (see `references/mobbin-research-patterns.md`). Aim for 2–4 queries per iter, not 10:

- One archetype query (*"Show me dashboards in personal-finance apps that emphasize cash flow"*)
- One pattern query (*"How do checkout flows handle saved payment methods?"*)
- Optionally one comparative query (*"Compare empty-state design for transaction lists in Monzo vs Revolut vs N26"*)

**Persist results to `docs/research/design/<current>.md`.** Append (dated section), never overwrite. Capture:
- Pattern name + one-line description
- Source apps + screen references (from Mobbin's response)
- The specific design decisions worth borrowing (annotations)
- What NOT to borrow (anti-patterns Mobbin's comparison surfaces)

If Mobbin returns nothing useful for this screen (rare — usually means the query was too narrow):
- Log to `logs/blocks.md`: `## screen: <current> — mobbin returned nothing for query <q>`
- Re-query with broader scope before giving up
- After two failed re-queries, mark `screens[i].status: "blocked"` and advance

## 3. HTML synthesis

Open `docs/screens/html/<current>.html`:
- **Exists:** read it, read the research doc, apply the new patterns. Diff is incremental — preserve approved structure, change only what the research justifies.
- **Missing:** create from the Tailwind+CDN skeleton (`references/html-mockup-conventions.md`). Wire to shared `docs/screens/html/assets/mock-data.js`. Add to `docs/screens/html/index.html` nav.

**Hard guardrails during synthesis:**
- Don't invent functionality the PRD/inventory doesn't list. Mockup ≠ feature spec.
- Reuse the shared mock data — don't write a new "Sam Chen" for this screen.
- Single file. No build step. Tailwind via CDN. Fonts via Google Fonts.
- Platform viewport per `.design-loop/state.json` `platform`.

## 4. Render

Use `chrome-devtools-mcp`:
1. Open the file at the configured viewport:
   - `platform: "mobile"` → `375x812` (iPhone-class)
   - `platform: "desktop"` → `1440x900`
2. Capture screenshot.
3. Check the console — any JS errors are an automatic `revise` before the critique even runs.

If the file fails to render at all (broken HTML, mock-data import errors), don't run critique — fix the render issue this iter, log to blocks, re-queue the screen.

## 5. Class A design-critique sub-agent

Dispatch per `references/design-critique.md`. Fresh-context, read-only, given:
- The screenshot
- `docs/research/design/<current>.md`
- The screen's entry in `docs/screens/inventory.md` (or `state.json` `screens[i].purpose`)

Sub-agent returns:
- `pass` — screen meets the research target; proceed to commit
- `revise` — falls short on specific named dimensions; concrete annotations included
- `block` — premise problem (wrong screen, conflicts with inventory, etc.) — needs human resolution

## 6. State + commit

**On `pass`:**
- `screens[i].status = "approved"`
- `screens[i].refinement_count += 1`
- `current = next pending screen slug` (or `null` if none)
- `iter += 1`
- Write `logs/iter-NNN.md` (≤ 30 lines — see `autonomous-build-loop/references/log-hygiene.md`)
- Commit: `screen-design-loop: iter NNN — <slug> approved (refinement N)`

**On `revise`:**
- `screens[i].status = "revise"`
- `current` stays
- Append critique verbatim to `logs/blocks.md` under `## screen: <slug> — iter NNN revise`
- Commit: `screen-design-loop: iter NNN — <slug> revise round N`

**On `block`:**
- `screens[i].status = "blocked"`
- `current = next pending screen slug` (or `null`)
- Append reason to `logs/blocks.md`
- Commit: `screen-design-loop: iter NNN — <slug> blocked, see blocks.md`

## 7. End of iter

- **In-session mode:** call `ScheduleWakeup` (default 600s for normal iters; 1200s if just emitted a `revise` so the human has a window to skim before re-entry).
- **External-scheduler mode (`EXTERNAL_SCHEDULER=1`):** exit cleanly. Driver handles cadence.

## When the backlog is empty

Every screen is `"approved"` or `"blocked"`:
1. Write a summary entry to `logs/iter-NNN.md` listing approved-vs-blocked counts.
2. Mark `.design-loop/state.json` `status: "drained"`.
3. **Do not schedule another iter.** Write a clear handoff message to the user pointing at:
   - The approved set under `docs/screens/html/`
   - Any blocked screens with their reasons in `logs/blocks.md`
   - The cumulative research in `docs/research/design/`

This is the one place the loop intentionally exits — drained backlog is the goal state.
