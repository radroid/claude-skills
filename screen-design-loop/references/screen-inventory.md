# Screen inventory

How `screen-design-loop` figures out what screens to refine. Run this **once** before the loop's first iter to populate `.design-loop/state.json` `screens[]`. After that, the loop reads state.json as the source of truth.

## Three sources, in priority order

### 1. Existing `.design-loop/state.json` (if present)

If the file already has a non-empty `screens[]`, that's the source of truth — do nothing, proceed to the first iter. Re-deriving from scratch destroys refinement history.

### 2. Upstream `prd-to-screens` output

If the repo has any of these, use them — `prd-to-screens` already did the careful inventory work:

| Source | Use |
|---|---|
| `docs/screens/inventory.md` | Authoritative — copy each row's slug + one-line purpose into `screens[]` |
| `docs/screens/html/*.html` (no inventory.md) | Fall back to filenames — slug = basename without `.html`, purpose extracted from `<title>` or the first `<h1>` |
| `docs/screens/workflows.md` | Use to populate `screens[i].related_workflows[]` (helps the critique sub-agent reason about cross-screen consistency) |

Example transformation:

```text
docs/screens/inventory.md row:
  | dashboard | Primary home view — cash flow + recent transactions | core |

→ state.json screens[]:
  { "slug": "dashboard",
    "status": "pending",
    "purpose": "Primary home view — cash flow + recent transactions",
    "group": "core",
    "refinement_count": 0 }
```

### 3. Derive from PRD (if nothing else exists)

Only if neither state.json nor `prd-to-screens` artifacts are present. **Strongly prefer running `prd-to-screens` instead** — that skill exists precisely to do this derivation rigorously through a human-gated conversation. Doing it inline here cuts that conversation and produces a guess.

If the user explicitly waives the `prd-to-screens` step:

1. Read `docs/PRD.md` (or whatever the user points at).
2. Extract every distinct UI surface mentioned. Capture: noun + role (e.g., "settings screen", "checkout flow step 2").
3. Group by user-journey proximity.
4. Write the result to `docs/screens/inventory.md` (creating the file) so the artifact stays inspectable.
5. Surface the inventory to the user with: *"I derived N screens inline. Run `prd-to-screens` if you want this rigorously gated — otherwise reply OK to proceed."*
6. On OK, populate `screens[]` from the derived inventory.

## Slug rules

- Lowercase kebab-case, ASCII only
- Match the eventual HTML filename: `dashboard` → `docs/screens/html/dashboard.html`
- Stable forever — slugs are referenced from research notes, blocks log, iter logs. Renaming breaks the chain.

## Adding screens mid-loop

User says *"add a notifications screen"*: append the new entry to `screens[]` with `status: "pending"`. Do NOT change the order of existing entries — refinement counts are positional in some downstream readers.

## Removing screens mid-loop

User says *"drop the legacy admin view"*: set `screens[i].status: "removed"` (don't delete the entry). The HTML stays in `docs/screens/html/` until the user explicitly asks to remove it — design references aren't worth deleting in case the decision reverses.

## Initial state.json output of this step

```json
{
  "skill": "screen-design-loop",
  "iter": 0,
  "platform": "mobile",
  "current": null,
  "screens_root": "docs/screens/html",
  "research_root": "docs/research/design",
  "screens": [
    { "slug": "dashboard", "status": "pending", "purpose": "...", "group": "core", "refinement_count": 0 },
    { "slug": "settings",  "status": "pending", "purpose": "...", "group": "core", "refinement_count": 0 }
  ]
}
```

`current` is set to `screens[0].slug` at the start of the first iter, not here.

`platform` is the one decision this step **must** ask the user about explicitly if not already set: "mobile or desktop for this loop run?" Defaulting silently produces wrong Mobbin queries and wrong viewport screenshots.
