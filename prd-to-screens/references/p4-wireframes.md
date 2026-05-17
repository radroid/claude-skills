# P4 — Wireframes

For each screen in the inventory, produce a **low-fidelity, text-based sketch** of layout,
sections, content, and CTAs. No HTML yet. The point is to align on *what's on the screen*
before you spend tokens making it pretty.

## Exit gate

**All screens have an approved wireframe.** Iterative — approve in batches of ≤ 5 screens
at a time, prioritizing screens that appear in the most journeys (highest blast radius if
wrong). On full acceptance, set `checkpoints.P4: "passed"` and flip `phase` to `"P5"`.

## Required artifact at exit

`docs/screens/wireframes.md` — template at `assets/templates/wireframe.md`. One section per
screen.

Per-screen format:

````markdown
## `<slug>` — <Name>

**Reachable from:** <list of slugs / "entry">
**Empty state:** <one sentence — what shows when there's no data, or "n/a">
**Loading state:** <one sentence — skeleton? spinner? optimistic?>

### Layout

```text
+--------------------------------------------------+
| TOPNAV: logo · Invoices · Clients · [+New] · 👤  |
+--------------------------------------------------+
| KPI ROW: Outstanding $4,200 · Paid $12,300       |
|          Overdue 2                                |
+--------------------------------------------------+
| RECENT INVOICES (table)                          |
|  # · Client · Amount · Status · Sent · [...]     |
|  ────────────────────────────────────────────    |
|  1024 · Acme Co. · $850 · Paid · 2d ago · ▸      |
|  1023 · Lyric Labs · $1,200 · Overdue · 9d · ▸   |
+--------------------------------------------------+
```

### Sections

- **TopNav** — global. Logo links home; primary nav links per workflows; "+ New" opens
  invoice-new; avatar opens settings menu.
- **KPI row** — three cards. Currency formatted. Empty state: all $0 with hint "Send your
  first invoice".
- **Recent invoices** — table, last 10. Row click → invoice-detail. Status uses pill colors.

### CTAs

- "+ New" → `invoice-new.html`
- Row click → `invoice-detail.html?id=<id>`
- "View all" link → `invoices.html`

### Design notes

- Dense, business-utility feel
- KPI cards muted unless highlighted (e.g., overdue count in red if > 0)
````

ASCII boxes are good enough — fancier sketches don't pay back in clarity at this stage.

## Workflow

1. **Read `.screens/state.json`** for the screen list and `.screens/intake.md` for the
   one-sentence design vibe.

2. **Order screens by blast radius.** Screens that appear in the most journeys go first —
   getting `dashboard` wrong costs more revisions than getting `404` wrong. The state file's
   screens array, written in approval order during P2, is a reasonable default.

3. **Sketch a batch of up to 5 screens.** For each, fill in every section of the per-screen
   format. Pull layout patterns from common, well-understood conventions (top nav, sidebar,
   list/detail split) unless the design notes in intake demand otherwise. Don't get fancy
   here — boring and predictable is the point; surprise is for P5.

4. **Present the batch to the human in one shot.** "Here are wireframes for the next 5 —
   anything that's wrong on any of them?" Expect substantive feedback on at least 1–2 per
   batch in early rounds; less later as the pattern locks in.

5. **Revise in place** based on feedback, re-present only the changed ones, and move on.

6. **Repeat until all screens are sketched and approved.** Track which screens are
   wireframed-and-approved in a checklist comment in `wireframes.md` so resumption across
   turns is obvious.

## Why batches of ≤ 5

Past about 5 screens in a single review cycle, the human's feedback gets generic
("looks fine, ship it") because the cognitive cost of holding all of them in mind blows
past their attention budget. Things slip through, P5 catches them late, redo cost goes
up. Five is the empirical ceiling; if a screen is unusually complex, drop to 3.

## What NOT to do

- Don't write HTML in this phase, even "just a quick draft". The whole point of the low-fi
  cycle is that the human can review the *structure* without anchoring on color/spacing/
  typography. If you produce HTML, they'll critique the HTML; the structural feedback you
  needed gets lost.
- Don't pick fonts, colors, exact spacing, or icon sets. Design notes are one or two
  sentences per screen, not a brand book.
- Don't mock interactions a journey doesn't call for. If `workflows.md` doesn't mention a
  "bulk select" mode for the invoice list, don't draw one — you're adding scope.
- Don't make every screen unique. Inventories that share a layout (e.g., all detail pages,
  all forms) should share a wireframe pattern. Call it out and reuse — saves you P5 time
  and signals consistency to the human.

## Cross-references

- `p3-workflows.md` — feeds the "Reachable from" + CTA columns.
- `p5-html-build.md` — turns each approved wireframe into a real HTML file.
- `assets/templates/wireframe.md` — per-screen template.
