# Integration

How `screen-design-loop` composes with the other skills in this repo. The integration story matters because this skill's outputs are **inputs** to other skills' workflows.

## The artifact contract

This loop writes to three locations. Other skills read from them.

| Path | Who writes | Who reads | Notes |
|---|---|---|---|
| `docs/screens/html/<slug>.html` | `prd-to-screens` (baseline), `screen-design-loop` (refinement) | `autonomous-build-loop` (principle 9 design-reference), human review | Stacked output — both skills append/update; they don't fork |
| `docs/screens/html/assets/mock-data.js` | Both skills, shared | Both skills, every HTML file | Adds-only; existing fields never renamed |
| `docs/screens/html/index.html` | Both skills, maintained | Human walkthrough | Nav list of every screen |
| `docs/research/design/<slug>.md` | `screen-design-loop` only | `autonomous-build-loop` principle 9 critique (when present) | Append-only; cumulative research |
| `.design-loop/state.json` | `screen-design-loop` only | `screen-design-loop` itself | Loop state |

## Composition with `prd-to-screens`

**Recommended sequence for greenfield:**

```text
grill-to-prd          →  docs/PRD.md
       ↓
prd-to-screens (P1→P6) →  docs/screens/inventory.md
                           docs/screens/workflows.md
                           docs/screens/html/*.html  (the baseline)
       ↓
screen-design-loop    →  refines docs/screens/html/*.html
                           adds docs/research/design/*.md
```

`prd-to-screens` establishes the *baseline* through a phased human-gated conversation: what screens exist, what the user journeys are, what each screen contains at low fidelity, and the first cut of HTML. That baseline is appropriate but generic.

`screen-design-loop` then **refines** the baseline by grounding each screen in real-world design references via Mobbin. It does not re-derive the inventory (it reads `prd-to-screens`' inventory file), does not reopen workflow questions, and does not change which screens exist.

If the user starts with `screen-design-loop` directly (no `prd-to-screens` run), it falls back to deriving inventory from PRD inline — see `references/screen-inventory.md`. But the recommended path is to run `prd-to-screens` first.

## Composition with `autonomous-build-loop` (principle 9)

`autonomous-build-loop` SKILL.md principle 9 says:

> *Any iter touching user-visible UI must MANUFACTURE [a signal]: screenshot via chrome-MCP + a forced critique pass against **the design reference**...*

"The design reference" is intentionally generic in the build loop. This skill makes it concrete: **`docs/screens/html/<slug>.html` is the design reference.** When the build loop ships a real React/Vue component for the `dashboard` screen, principle 9's critique compares the rendered live app against `docs/screens/html/dashboard.html`.

This contract works whether the mockups came from `prd-to-screens`, from `screen-design-loop`, or both. The path is the contract.

**Recommended cadence:** run `screen-design-loop` to refine a screen's mockup **before** queuing the corresponding feature in `GOALS.md` for `autonomous-build-loop`. That gives the build loop a refined target to render against, not a baseline.

If the build loop's principle-9 critique consistently flags drift between the live app and the mockup, the user can either:
- Update the live app to match the mockup (the default — mockup is the spec), or
- Re-queue the screen through `screen-design-loop` for a new refinement round (the design vision evolved)

## Composition with `idea-to-loop`

`idea-to-loop` runs S0 → S1 → S2 in the greenfield flow. Recommended insertion point:

```text
idea-to-loop S0 (PRD)
       ↓
[prd-to-screens P1→P6]    ← already documented as optional in idea-to-loop
       ↓
[screen-design-loop]      ← NEW: refines the mockups before S1 tech-stack picks
       ↓
idea-to-loop S1 (tech stack — informed by refined mockups)
       ↓
idea-to-loop S2 (scaffold against refined mockups)
       ↓
autonomous-build-loop S3+ (renders against refined mockups via principle 9)
```

Running the design loop *before* S1 means the tech-stack decision can account for what the screens actually demand (heavy data-grid screens push toward AG-Grid; chat-style screens push toward streaming-friendly frameworks; etc.). Doing it post-S2 still works, but you lose the stack-informing signal.

This is currently a recommendation, not a hard wiring. `idea-to-loop` doesn't yet auto-invoke `screen-design-loop` — the user invokes it manually between phases. A future small PR could add the auto-invocation if the integration proves load-bearing.

## What this loop does NOT do

To prevent scope confusion:

- **Does not derive a PRD.** Run `grill-to-prd`.
- **Does not derive a screen inventory rigorously.** Run `prd-to-screens` P2 — that's the right tool.
- **Does not generate user-workflow journey maps.** `prd-to-screens` P3.
- **Does not write production frontend code.** `autonomous-build-loop` S3+.
- **Does not deploy.** `autonomous-build-loop` S5.
- **Does not interview the user about their app concept.** Inputs come from existing artifacts; if those don't exist, this loop tells the user which upstream skill to run.

## Standalone use

The loop works without any other skill. Required preconditions:
1. A repo with `git init`
2. Mobbin MCP configured (`claude mcp add mobbin ...`)
3. EITHER an existing `docs/screens/html/` directory OR a `docs/PRD.md` to derive from (see `references/screen-inventory.md`)
4. A decision: mobile or desktop

Output is the same regardless of upstream: refined HTML mockups in `docs/screens/html/`, accumulated research in `docs/research/design/`, an iter log under `logs/`.
