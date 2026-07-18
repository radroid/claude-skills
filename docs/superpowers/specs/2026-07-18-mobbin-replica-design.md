# mobbin-replica — design spec

Date: 2026-07-18
Status: approved design, pre-implementation

## Purpose

A skill that takes a folder of app screenshots (typically exported from Mobbin) and
produces a working, pixel-perfect replica of that application's UI in a given web
stack. Two phases by mandate: first a functional application (all screens, routing,
mock data), then a smoke test followed by a per-screen pixel-refinement loop.
Interactions (business logic, gestures, animations) are explicitly out of scope for
v1 and are catalogued for later.

## Decisions (locked with user)

| Decision | Choice |
|---|---|
| Target platform | Web-rendered replica in any web stack, rendered at the screenshot's exact CSS viewport (mobile designs render in a fixed-size device frame). Default stack when unspecified: Next.js App Router + Tailwind. |
| Asset strategy | Hybrid — photos/illustrations cropped out of the reference screenshots into `public/assets/`; icons and logos rebuilt from the stack's icon library (e.g., Lucide). |
| Done bar | Numeric gate then visual verdict: pixelmatch diff ≤ 3% differing pixels (configurable), then a side-by-side design-critique subagent must APPROVE. Hard cap 8 rounds/screen. |
| Output location | New git-initialized directory scaffolded by the skill; all skill workspace files live under `.replica/` inside it. |
| Architecture | Single linear phased skill (P0–P4), resumable via `.replica/state.json`. Per-screen pixel loop is self-contained so it can be parallelized in a later version. |

## Phases

### P0 — Intake (human-gated)

Inputs: screenshots directory, app name, target stack (optional).

1. Read every screenshot visually; build a screen inventory at `.replica/inventory.md`
   — slug, one-line purpose, navigation guesses between screens.
2. Viewport detection: map image dimensions to a device profile
   (e.g., 1179×2556 → iPhone @3x → render 393×852 CSS px, capture at DPR 3).
   Mixed sizes get per-screen overrides. Desktop/web screenshots use a desktop
   viewport with the same pipeline.
3. Style tokens at `.replica/style-tokens.md`: sampled hex palette, spacing/radius
   scale, font identification plus the substitute that will actually be used
   (iOS system stack for iOS apps; otherwise nearest Google Font). Substitutes are
   always recorded as known gaps.
4. Status-bar policy: OS chrome (status bar, home indicator) is cropped out of
   references by default (`statusBar: "crop"`); `"replicate"` renders static OS
   chrome for full-frame fidelity.

Gate: user approves the inventory before any scaffolding.

### P1 — Functional build

- Scaffold the stack in a new directory; `git init`; commit scaffold.
- One route per screen, rendered inside a fixed-size device frame at the exact CSS
  viewport, centered on the page.
- Shared components extracted where screens visibly reuse them (tab bars, headers,
  cards); a single mock-data module reproduces the screenshots' visible text
  verbatim so content matches during diffing.
- Assets per the hybrid rule; cropping via `sips` (macOS) or ImageMagick.
- An index route links every screen. Commit per screen batch.

### P2 — Smoke test (gate to the pixel loop)

- Production build passes.
- Dev server boots; every route visited headlessly: HTTP 200, zero console errors,
  nav links resolve.
- Failures are fixed before any pixel work begins.

### P3 — Pixel loop (per screen, sequential)

Round structure:

1. **Capture** the route headlessly at the screen's viewport and device scale
   factor; normalize replica and reference to identical pixel dimensions.
   Screens taller than the viewport are captured full-page and diffed at full
   height.
2. **Score** with `scripts/pixel-diff.mjs` (pixelmatch + pngjs via `npx`):
   differing-pixel percentage plus a heatmap PNG written to
   `.replica/diffs/<screen>/round-N/`.
3. **Fix**: if score > threshold, read the heatmap, translate hot regions into
   targeted changes (spacing, sizes, colors, weights, radii), re-enter the round.
4. **Visual verdict**: once the number passes, a critique subagent sees reference
   and replica side-by-side and returns APPROVE or REVISE with specifics; REVISE
   re-enters the loop and counts toward the cap.

Caps and masks: hard cap 8 rounds/screen — on cap-out keep the best round, mark the
screen `needs-attention`, move on. Optional per-screen mask config excludes truly
dynamic regions from scoring.

Capture tooling: chrome-devtools MCP when available; Playwright CLI fallback.

### P4 — Report

`.replica/report.md`: per-screen table (rounds used, final diff %, verdict, known
gaps — font substitutes, cropped-asset inventory), a candidate-interactions list
for the future interactions phase, and a note that the replica is a
design/engineering study — cropped branding and content are not shippable as a
product.

## Skill layout in claude-skills

```
mobbin-replica/
  SKILL.md              # triggers, phase table, hard gates, state contract
  references/
    p0-intake.md
    p1-build.md
    p3-pixel-loop.md
    asset-cropping.md
    diff-tooling.md     # pixel-diff.mjs usage, capture via chrome-devtools/Playwright
  scripts/
    pixel-diff.mjs      # pixelmatch + pngjs; score % + heatmap output
```

State contract (`.replica/state.json` in the generated app): phase, per-screen
status (`pending | built | smoke-passed | in-loop | passed | needs-attention`),
viewport map, threshold, statusBar policy, round counters. Any session can resume
from it.

## Error handling

- Capture tooling unavailable → stop and tell the user which tool to enable; never
  fake a score.
- Diff script failure → surface stderr, halt the loop for that screen.
- Scaffold/build failures in P1/P2 → fix-forward; the pixel loop never starts on a
  broken app.
- Cap-outs are reported, not silently passed.

## Out of scope (v1)

Interactions, animations, native mobile targets, multi-agent parallel refinement,
non-web stacks.
