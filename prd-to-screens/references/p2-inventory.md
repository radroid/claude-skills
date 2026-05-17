# P2 — Screen Inventory

Derive the **complete set of screens** the v1 frontend needs, group them sensibly, and get
the human to approve the list before any sketching or coding. The whole skill rests on
this list — get it right.

## Exit gate

**Human accepts the screen list.** Edits, additions, removals are all expected at this
gate — bake them in and re-confirm. On acceptance, set `checkpoints.P2: "passed"` and flip
`phase` to `"P3"`. Also record the final screens array in `.screens/state.json` so later
phases can iterate over it.

## Required artifact at exit

`docs/screens/inventory.md` — template at `assets/templates/inventory.md`.

Structure:

```markdown
# Screen Inventory

## Group: <Auth / Onboarding / Core / Settings / Admin / Marketing / etc>

| Slug | Name | Purpose (one sentence) | Entered from | Primary CTA |
|---|---|---|---|---|
| login | Login | Auth gate for returning users | `/`, `/signup` | "Log in" |
| dashboard | Dashboard | Hub showing recent activity + KPIs | Login success | "View invoice" |
| ... | ... | ... | ... | ... |
```

The `slug` column is the eventual HTML filename (`login.html`). Keep slugs
short, kebab-case, and stable — they show up in URLs and cross-links from here on.

## Workflow

1. **Read `.screens/intake.md`** first. The core entities + jobs-to-be-done from intake
   directly drive what screens exist.

2. **Derive screens from entities and jobs** — not from imagination. Two strong heuristics
   that catch ~80% of the inventory:

   **List/detail pairs per entity.** For each core entity from intake, the user almost
   certainly needs a list view ("all invoices") and a detail view ("invoice #1234"). Sometimes
   also a create/edit form. Don't add them blindly — ask: does the user actually need to
   browse a list of these? Does each have enough fields to deserve a detail view?

   **Job → screen sequence.** For each top job-to-be-done from intake, walk it: where does
   the user start? What screen do they need to *do* the job? Where do they land after? Each
   step that needs a distinct page becomes a screen.

3. **Add the universal surfaces** that almost every app needs and the PRD rarely lists:
   - Auth: login, signup, password reset (skip if PRD says no auth)
   - Onboarding: at least one welcome / setup-completion screen if there's any first-run
     configuration
   - Empty states: not separate files, but call them out for P4 — "dashboard (empty)" vs
     "dashboard (populated)" if they differ meaningfully
   - Errors: a generic 404 and a generic error screen, unless the PRD explicitly says SPA
     with no hard routing
   - Settings + Account: usually at least one combined page; split if the PRD implies a
     larger surface (billing, team mgmt, integrations as separate tabs)

4. **Group screens** by user-mental-model categories — Auth, Onboarding, Core, Settings,
   Admin, Public/Marketing. Mixed groups ("Core + Auth + Misc") signal you haven't grouped
   well; resplit.

5. **Sanity check against scope budget.** A v1 mockup set should land in the **10–25 screen
   range** for most products. <10 usually means you missed surfaces (probably auth,
   settings, errors). >25 usually means you padded with edit/duplicate/archive
   variations that should be modals or inline actions, not separate pages — collapse them.

6. **Present the table to the human** and ask explicitly: "Anything missing? Anything you'd
   cut? Any renames or regroupings?" Iterate until they're satisfied.

7. **Write the final `screens` array into `.screens/state.json`** in approval order. P4 and
   P5 will iterate over this array.

## Worked example (mini)

PRD says: "tool for freelancers to send invoices and track payments". Intake says: primary
user = solo freelancer, entities = invoice, client, payment.

Derived inventory (abridged):

| Slug | Name | Purpose | Group |
|---|---|---|---|
| login | Login | Auth | Auth |
| signup | Sign up | Account creation | Auth |
| dashboard | Dashboard | Recent invoices + outstanding balance KPI | Core |
| invoices | Invoice list | Browse + filter all invoices | Core |
| invoice-detail | Invoice detail | View one invoice, mark paid, resend | Core |
| invoice-new | New invoice | Create/edit form | Core |
| clients | Client list | Browse all clients | Core |
| client-detail | Client detail | One client's invoices + contact info | Core |
| settings | Settings | Profile + payment provider + tax info | Settings |
| 404 | Not found | Hard-link fallback | Errors |

15 screens isn't there; this is the abridged version. Real list would round out with
client-new, signup-onboarding, error, password-reset, and maybe a payments tab.

## What NOT to do

- Don't invent screens the PRD doesn't justify. "Notifications center" is a frequent
  fabrication. Only add if the PRD says notifications or the user explicitly asks.
- Don't add a "loading" or "transition" screen — those are states within a screen, not
  separate pages. They'll show up in P4 as design notes on the relevant page.
- Don't number screens (`screen-1.html`). Slugs are semantic; the moment the order changes,
  numbered slugs lie.
- Don't merge inventory and wireframing into one step. The temptation to write "Dashboard:
  has a KPI card and a recent-invoices table" in the inventory is real — resist it. P4 owns
  layout; P2 owns existence.

## Cross-references

- `p1-intake.md` — feeds entities + jobs.
- `p3-workflows.md` — uses the screen list to define journeys.
- `assets/templates/inventory.md` — the table template.
