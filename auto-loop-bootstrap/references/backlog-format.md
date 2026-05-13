# GOALS.md backlog format

The auto-loop reads GOALS.md every iter to pick features. Structure determines whether the loop self-feeds well or stalls.

## Required elements

### Phase headers

```markdown
## Phase 1 — Core domain
## Phase 2 — Public-facing surface
## Phase 3 — Admin + ops
```

The loop reads phase order top-to-bottom. Don't reorder phases without good reason once iters are landing.

### Item format

```markdown
- [ ] P1.A — User signup with email — Wire up Clerk; redirect to `/onboarding` on first login.
- [ ] P1.B — Onboarding form — Capture display name + avatar; persist to `users` table.
- [wip] P1.C — Email verification — Started; blocked on Resend API key (see Open dependencies).
- [done] P1.D — Schema bootstrap — Migrated 2026-05-12; see iter-005.md.
- [blocked] P1.E — Stripe billing — Waiting on legal review of TOS update.
```

Rules:
- `[ ]` = open, available to pick
- `[wip]` = in progress, do not double-assign
- `[done]` = closed, leave for history
- `[blocked]` = waiting on external decision; do not pick
- Item id format: `P<phase>.<letter>` — single letter scales to 26 items per phase; use two letters (`AA`, `AB`) past that.
- One-line title (≤ 60 chars) + one-line description (≤ 120 chars).

### Open dependencies section

```markdown
## Open dependencies (waiting on user)

- **HIGH PRIORITY** — Resend API key needed for transactional email (blocks P1.C, P2.B)
- Mapbox public token for race map (blocks P2.D)
- Brand color tokens from design team (no current block; nice-to-have for Phase 2 polish)
```

Anything in this section is automatically skipped by the loop. Items prefixed `**HIGH PRIORITY**` surface on the dashboard.

## Recommended

### Closed-iter pointers

For each `[done]` item, add `— see iter-NNN.md` so future iters can find context.

### Sub-features under big items

Some "features" are too big for one iter. Split:

```markdown
- [wip] P2.D — Race map
  - [done] P2.D.1 — Mapbox token wiring (iter-014)
  - [wip]  P2.D.2 — Marker rendering
  - [ ]    P2.D.3 — Geofence detection
```

Or just decompose into siblings (`P2.D`, `P2.E`, `P2.F`). The loop handles either.

### Independence markers (for fat-iter mode)

If two items can ship together with NO file overlap, the loop's fat-iter mode benefits. Annotate dependencies:

```markdown
- [ ] P3.A — Notifications panel (depends: none)
- [ ] P3.B — Leaderboard widget (depends: P2.D done)
- [ ] P3.C — Settings page (depends: none) — INDEPENDENT of P3.A
```

The loop reads the `INDEPENDENT of` hint and prefers bundling those into a single fat-iter.

## Anti-patterns

| Pattern | Problem |
|---------|---------|
| Vague items ("Improve UX", "Refactor auth") | The loop will burn iters bikeshedding scope |
| 50+ items in one phase | Phase boundary is the architecture-pass trigger; phases that never close = no arch pass |
| All items `[wip]` | The loop has nothing to "pick" — it'll re-scope existing wip and never close |
| No phase ordering | The loop picks arbitrarily; can build dependent-features before their dependencies |
| Items without descriptions | Sub-agents waste tokens asking what the feature actually is |

## Live-edit safety

GOALS.md is the loop's source of truth. You can edit it BETWEEN iters (Ctrl-C the auto-loop, edit, restart) without breaking state. Don't edit it DURING an iter — the agent might be mid-pick.

If you need to insert an urgent item, append a new item at the top with `**URGENT** —` prefix:

```markdown
- [ ] **URGENT** — P0.X — Fix broken signup redirect
```

The loop's `Closest GOALS.md item` line will surface this on the next iter's wake-up scan.
