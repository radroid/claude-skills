# P5 — HTML Build

For each approved wireframe, produce a real **self-contained HTML file** with shared mock
data. This is the bulk of the work and the place where token-spend can balloon — be
deliberate about delegating to `frontend-design` and reusing the page template.

## Exit gate

**All screens have an approved HTML file.** Iterative — same ≤ 5 screens per approval batch
as P4. On full acceptance, set `checkpoints.P5: "passed"` and flip `phase` to `"P6"`.

## Required artifacts at exit

```text
docs/screens/html/
├── index.html              # landing page that links to every screen (built in P6)
├── assets/
│   ├── styles.css          # optional shared overrides; mostly empty if Tailwind handles it
│   └── mock-data.js        # SHARED — single source of truth for mock entities
├── login.html
├── dashboard.html
├── invoices.html
├── invoice-detail.html
└── ... one file per slug
```

## Setup — do this once, before the first screen

1. **Initialize `assets/mock-data.js`** from `assets/templates/mock-data.js` (in the skill
   bundle, not the output dir — copy it in). It exports a `MOCK` object on `window` that
   every screen reads.

2. **Populate `MOCK` with the core entities from intake**, with enough rows for tables to
   feel real (10–20 per list, not 3). Pick *plausible, internally-consistent* names —
   "Sam Chen" with email `sam@lyriclabs.com` working at "Lyric Labs" is fine, "John Smith"
   with email `asdf@asdf.com` is not. Realistic mock data is half the perceived quality of
   the mockup.

3. **Initialize `assets/styles.css`** — start empty. Only fill if you've made deliberate
   global overrides Tailwind won't cover.

4. **Bring in the page template** from `assets/templates/page.html`. Every HTML file starts
   from this and replaces the body content. The template includes: Tailwind via CDN, a
   Google Font, the mock-data script tag, a baseline color scheme matching the intake
   design vibe, the topnav skeleton.

## Per-screen workflow

For each screen in the next batch of ≤ 5:

1. **Read the wireframe** from `docs/screens/wireframes.md`. The Sections + CTAs + Design
   notes are your spec.

2. **Decide: delegate to `frontend-design` or build inline.**

   **Delegate when** the screen has any of: complex visual hierarchy, hero/landing aesthetic,
   marketing/onboarding tone, anything described as "polished" or "playful" in intake.
   Invocation: `Skill: frontend-design:frontend-design` with the wireframe pasted in and
   the page template + mock-data structure noted as constraints. Frontend-design produces
   substantially better visual output than ad-hoc HTML; the cost is more tokens per screen.

   **Build inline when** the screen is mostly tabular/CRUD/utility (list views, settings,
   admin) — Tailwind component patterns are well-known enough that inline is fine and
   cheaper. Page template + Tailwind utility classes + the mock-data reads → done.

3. **Wire the screen to mock data.** No hardcoded names/emails/amounts in the file body —
   pull from `MOCK`. Example:

   ```html
   <script>
     const invoices = MOCK.invoices.slice(0, 10);
     // render rows from invoices
   </script>
   ```

   Inline `<script>` is fine for a mockup; the deliverable is "open and view", not a
   production SPA.

4. **Wire CTAs to the right files.** Every link/button that maps to another screen in the
   wireframe's CTA section gets a real `href="./other-slug.html"`. Buttons that don't go
   anywhere (e.g., "Mark paid" on invoice detail) trigger an inline JS that mutates
   `MOCK` and re-renders the visible portion — gives the mockup a clickable feel without
   real backend.

5. **Test locally.** Open the file in a browser (use the `Bash` tool to print the absolute
   path so the user can `open` it; or open it yourself if you have a browser MCP available).
   Check: no console errors, mock data renders, links resolve, layout doesn't break at
   common widths (1440, 1024, 375). If a Playwright or Chrome DevTools MCP is connected,
   navigate to the file and screenshot.

6. **Present the batch to the human.** Give them the path to each file in the batch:

   ```bash
   open docs/screens/html/dashboard.html
   open docs/screens/html/invoices.html
   ```

   Or if you've started a local server: a single URL with links to each. Wait for
   per-screen approval — "looks great", "change X on the dashboard", "scrap this and try
   again" are all valid. Don't move the batch forward until every screen in it is signed
   off.

7. **Revise on feedback.** Common revisions: spacing too tight, data feels generic (means
   `MOCK` needs richer entries — fix once in `mock-data.js`, all screens improve), CTA
   wired wrong, color/tone off vibe. Make changes, re-present only the changed screens.

## Mock data discipline

This is the rule that pays off across all 15+ screens:

- **One file. One source of truth.** All entities (users, invoices, clients, etc.) live
  in `MOCK`. Screens *read* from it; they don't redefine.
- **Consistency over richness.** Sam Chen on the dashboard must be Sam Chen on the
  invoice detail. The same five clients should appear across screens. Cross-screen
  inconsistency is the #1 thing reviewers spot and the #1 reason mockups feel fake.
- **Plausible over generic.** Real-feeling names, real-looking amounts, real timestamps.
  "Lyric Labs · $1,200 · Overdue 9d" beats "Client A · $X · Status".
- **Cover the edge cases the wireframes called out.** If a wireframe said "empty state:
  no invoices yet", make sure `MOCK` supports flipping into that state — e.g., a
  `?empty=1` URL param that the screen reads to render empty.

## What NOT to do

- Don't pull in a JS framework. No React, no Vue, no Alpine. The mockups are deliberately
  framework-free so the user (and the next skill in the chain) reads them as a *spec*, not
  as code to be merged. Vanilla JS + Tailwind CDN keeps the doors open for any stack S1
  picks.
- Don't introduce a build step. No npm install. No bundling. If a future screen needs a
  charting library, pull it via CDN.
- Don't make screens identical to a popular SaaS product. The intake design vibe is the
  brief; "make it look like Linear" is fine guidance but the output should feel coherent,
  not photocopied.
- Don't approve a screen on the human's behalf because "it matches the wireframe". The
  wireframe was structural; P5 is visual. Wait for them to actually see it.
- Don't fix a problem on one screen by spraying CSS into the body of that file. If three
  screens share the issue (e.g., button colors), fix it once in `assets/styles.css` or
  the page template.

## Cross-references

- `p4-wireframes.md` — the input spec for each file.
- `p6-walkthrough.md` — cross-link verification + final acceptance.
- `assets/templates/page.html` — the per-screen starting HTML.
- `assets/templates/mock-data.js` — the shared mock-data starter.
