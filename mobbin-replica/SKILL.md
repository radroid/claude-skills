---
name: mobbin-replica
description: Use when the user provides app screenshots (typically Mobbin exports) and wants a pixel-perfect, working replica of that app's UI built in a given web stack. Triggers on "replicate this app", "rebuild this UI from screenshots", "pixel-perfect clone", "copy this app's design", "clone this screen", "make my app look exactly like this", "match these screenshots", or "/mobbin-replica". Not for building from a written PRD (use prd-to-screens), refining existing mockups (use screen-design-loop), or native-mobile targets.
---

# Mobbin-Replica

Turn a folder of app screenshots into a working, **pixel-perfect** web replica — a
functional app first, then a smoke test and a per-screen pixel-refinement loop.
Interactions (business logic, gestures, animation) are deferred and catalogued.

## Goal — what "done" looks like

A new git-initialized web app, in the user's chosen stack, where **every screen**:

- renders at the source screenshot's exact CSS viewport inside a fixed device frame,
- scores **≤ 3% differing pixels** against its reference (via `scripts/pixel-diff.mjs`), **and**
- passes a side-by-side **design-critique APPROVE**,

plus a `.replica/report.md` listing per-screen diff %, rounds used, and known gaps.

Two mandated phases, in order:
1. **Functional build** — an app that builds and boots with every screen present.
2. **Smoke test → pixel loop** — verify it runs, then refine each screen to the bar.

## Where to start

The user gives you a directory of screenshots and (optionally) a target stack —
default to **Next.js App Router + Tailwind** if unspecified. Then, before writing
any app code:

1. Read every screenshot. Write `.replica/inventory.md`: one row per screen —
   slug, one-line purpose, and navigation guesses (which screen leads where).
2. Write `.replica/style-tokens.md`: sampled hex palette, spacing/radius scale, and
   the identified font **plus the substitute you will actually use** (iOS system
   stack for iOS apps, else nearest Google Font). Substitutes are always recorded
   as a known gap.
3. Assign each screen a device profile from `references/device-profiles.md`
   (screenshot px → CSS viewport + DPR).
4. **Human gate:** the user approves `.replica/inventory.md` before you scaffold anything.

## Contracts

These are the hard rules. Other steps, resumed sessions, and the quality bar depend
on them — do not improvise around them.

**State — `.replica/state.json`** (inside the generated app; resume from it):
```json
{
  "phase": "intake|build|smoke|loop|report",
  "stack": "next-app-router-tailwind",
  "threshold": 3,
  "statusBar": "crop|replicate",
  "screens": {
    "<slug>": { "status": "...", "profile": {"cssW":393,"cssH":852,"dpr":3},
                "route": "/<slug>", "rounds": 0, "bestPct": null, "maskRects": [] }
  }
}
```
Per-screen `status` ∈ `pending | built | smoke-passed | in-loop | passed | needs-attention`.

**Assets (hybrid):** crop photos/illustrations out of the reference screenshots into
`public/assets/` (`sips` on macOS, or ImageMagick `convert`); rebuild icons and
logos from the stack's icon library (Lucide etc.). Reproduce each screen's **visible
text verbatim** in a shared mock-data module so content matches during diffing.

**Smoke gate — must pass before ANY pixel work:** production build succeeds; dev
server boots; every route returns 200 with zero console errors; an index route
links all screens. Fix-forward on failure — the pixel loop never starts on a broken
app.

**Pixel loop, per screen:**
1. Capture the route headlessly at its profile's CSS viewport and DPR
   (chrome-devtools MCP; Playwright CLI fallback). Full-page for scrollable screens.
2. Score:
   ```
   node scripts/pixel-diff.mjs --reference <ref.png> --actual <shot.png> \
     --out .replica/diffs/<slug>/round-N.png --pass-threshold 3 [--mask x,y,w,h ...]
   ```
   It prints one JSON line: `{diffPixels,totalPixels,pct,pass,...}` and writes a heatmap.
3. If not `pass`, read the heatmap, translate hot regions into targeted changes
   (spacing, sizes, weights, colors, radii), and re-run.
4. Once numeric-`pass`, a **design-critique subagent** compares reference vs replica
   side-by-side and returns **APPROVE** or **REVISE** (with specifics). REVISE
   re-enters the loop and counts toward the cap.
5. **Hard cap 8 rounds/screen.** On cap-out: keep the best round, set status
   `needs-attention`, move on.

**Fail-closed:** if capture tooling is unavailable, or `pixel-diff.mjs` exits
non-zero, STOP and tell the user which tool to enable. Never fabricate a score or
mark a screen `passed` without a real number **and** an APPROVE.

**Report — `.replica/report.md`:** per-screen table (rounds, final diff %, verdict,
known gaps: font substitutes + cropped-asset inventory); a deferred-interactions
list for the future interactions phase; and a note that cropped branding/content
make this a design/engineering study, not a shippable product.

## Your judgment

The skill fixes the goal, the gates, and the state/verdict grammar — **not** the
route to them. You decide: the scaffold and component decomposition; which screens
are reused components vs unique; how to turn a heatmap hot-region into a concrete
CSS change; when a region is genuinely dynamic and deserves a `--mask`; and how to
sequence the screens. Use the full stack of tools available to you.
