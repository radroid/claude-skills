# P3 — User Workflows

Map the **primary user journeys** through the screen inventory — entry point, screen-by-
screen sequence, decision branches, success and failure outcomes. This is what binds the
screen list into a coherent product instead of a pile of pages.

## Exit gate

**Human accepts every primary journey.** Each journey traced end-to-end with the human's
nod. On acceptance, set `checkpoints.P3: "passed"` and flip `phase` to `"P4"`.

## Required artifact at exit

`docs/screens/workflows.md` — template at `assets/templates/workflow.md`.

One section per journey. Format:

```markdown
## Journey: <name — e.g. "Send first invoice">

**Trigger:** what the user just did / state they're in before starting
**Preconditions:** what must already be true (e.g. "user signed in, at least one client exists")
**Success outcome:** the state the user is in when the journey is done

### Happy path
1. Lands on `dashboard.html` → clicks "New invoice"
2. → `invoice-new.html`, fills form, picks client from dropdown
3. → submits → `invoice-detail.html` (with success toast)
4. Clicks "Send" → email sent, screen updates to "sent" status

### Branches & failures
- **No clients exist** → at step 2, "New invoice" CTA opens client-create modal first
- **Form invalid** → stay on `invoice-new.html`, inline field errors
- **Email send fails** → stay on `invoice-detail.html`, error banner, "Retry" button
```

## Workflow

1. **Read `.screens/state.json`** for the approved `screens` array; **read `.screens/
   intake.md`** for the top-three jobs-to-be-done.

2. **One journey per top job.** Don't try to enumerate every possible click sequence —
   most apps have 3–6 journeys that matter. Examples:
   - "First-time user signs up and gets to value"
   - "Returning user does the most common action"
   - "User updates account settings"
   - "User recovers from forgetting their password"
   - Any explicit critical flow named in the PRD ("send first invoice", "checkout",
     "publish post")

3. **Walk each journey with the screen list in hand.** For every step, pin it to a real
   slug from the inventory. If a step has no matching screen, either (a) you missed a
   screen in P2 — go back and add it with the human, or (b) the step belongs as in-page
   state (modal, drawer, inline form), in which case note it as a design requirement on
   the parent screen, not a new screen.

4. **Capture branches honestly.** The happy path is the easy part; failure modes and
   alternate entry points are where mocked UIs fall apart. For each journey list at least:
   - One precondition-violated branch (no data yet, not signed in, etc.)
   - One validation/error branch
   - One "what if the network/external service fails" branch

5. **Cross-check coverage.** Every screen in the inventory should be **reachable** from at
   least one journey, or be explicitly classified as an entry/landing surface (login, 404,
   etc.). Orphaned screens are a P2 mistake — either they don't belong, or you're missing a
   journey that uses them.

6. **Optionally invoke `superpowers:writing-plans`** if the journeys are getting complex.
   Plans are the same shape — preconditions, ordered steps, branches, outcomes — and the
   skill's structure pays off for multi-step flows with conditional logic.

7. **Present each journey to the human one at a time** — not the whole file in a wall.
   "Here's the 'send first invoice' journey — walk it with me?" Update as they correct.
   Cycle through all primary journeys before claiming the phase done.

## Why this is worth doing properly

The wireframes and HTML you build in P4/P5 will lie to you. A screen looks complete in
isolation but is missing the "create your first client" empty state, or has a "Send" CTA
that goes nowhere because no journey actually wires it. Workflows are the *use-case test*
the mockups have to pass. Skipping P3 to "get to the HTML" sounds faster and reliably is
not.

## What NOT to do

- Don't write a journey for every possible thing the user *could* do. 3–6 primary
  journeys. The long tail isn't worth the review tax in this phase.
- Don't make journeys API-shaped ("POST /invoices"). They're UX-shaped — what does the
  human click, what do they see, what changes. Keep API/data plumbing out of this file.
- Don't merge journeys into one section to save space. Each journey is independently
  reviewed and independently informs P4 — separate sections make later phases parallelizable
  and easier to update when one journey changes.

## Cross-references

- `p2-inventory.md` — the screen list this phase weaves together.
- `p4-wireframes.md` — each journey's screens get sketched in batches.
- `assets/templates/workflow.md` — the per-journey template.
