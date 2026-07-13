# Change-aware timelapses: frontend dedup + C4 architecture evolution

Date: 2026-07-13
Status: approved (design), pending implementation

## Problem

`frontend-evolution-timelapse` selects commits by *path* (`list-commits.mjs:84` — a commit is
"relevant" if it touches a `frontend_paths` glob) and `stitch.mjs` emits one video frame per
selected commit. Neither stage asks whether the rendered UI actually changed.

Measured on the existing kayvee-website run (`.timelapse/2026-05-26T04-39-55-255Z/page-home`,
32 frames): **only 6 frames are visually distinct.** The video sits on a static image ~81% of
the time.

`SKILL.md:123` already lists "Perceptual dedup of identical frames" as out of scope for v1.
This spec closes that hole and adds a sibling skill applying the same rule to architecture.

## Key finding: the annotation bar defeats naive dedup

The skill injects a commit overlay (`hash | date | subject`) into the page *before*
screenshotting (`screenshot.mjs:27-47`). That bar changes on every commit.

| kayvee home, 32 frames | pixel-identical consecutive pairs |
|---|---|
| full frame (overlay burned in) | 1 of 31 |
| overlay bar cropped | 23 of 31 |

A pixel/perceptual hash over the captured PNG would therefore detect **almost no duplicates**.
Dedup is only possible on *pristine* pixels.

This is not merely an optimisation. The "×N commits, no visual change" badge cannot be drawn at
capture time either — the collapse count is unknown until the whole run has been walked. Both
facts force the same conclusion.

**Decision: annotation moves from capture-time to stitch-time.** Capture clean screenshots, hash
those, and burn the overlay + badge in with ffmpeg while stitching.

## Threshold is robust, not delicate

Consecutive-frame diff ratios on real data are bimodal: either ~0.0000 or >0.15, with nothing in
between. Any threshold in 0.1%–10% yields the same partition.

**Decision: `dedup.threshold: 0.005` (0.5%) by default, configurable.** A small tolerance (±8/255
per pixel) absorbs anti-aliasing and font-rendering jitter.

## Part 1 — Frontend dedup

### Comparison signal

Decode each PNG to a 64×40 grayscale raster (via ffmpeg, already a dependency — no new image
library). Compare against the last *kept* frame for that page:

- `diffRatio` = fraction of pixels differing by more than the tolerance.
- `diffRatio <= threshold` → duplicate.

Comparison is against the last **kept** frame, not the immediately-previous frame. Otherwise slow
drift across many commits accumulates without ever tripping the threshold.

### Masking dynamic content

`dedup.ignore_selectors` in `.timelapse.yaml` — elements (clocks, dates, randomised content) are
blanked to a flat colour in the browser before the screenshot is taken, so they never register as
change. Distinct from the removed annotation overlay.

### Boot-skip (secondary optimisation)

Capture cost is dominated by one dev-server boot per commit, and *you cannot know a screenshot
changed without taking it* — so dedup does not avoid boots in general.

One sound exception: hash the subtree of files matching `frontend_paths` at each commit. If the
tree hash is byte-identical to the last kept commit, the render is necessarily identical — skip
the boot entirely. This catches reverts and no-op merges only. Modest win; correctness is free.

### Video assembly ("collapse + badge")

One frame per visual change. Unchanged commits collapse into the preceding kept frame, which is
annotated at stitch time with:

```
a1b2c3d  "add hero section"
[ ×7 commits · no visual change ]
```

Hold duration scales mildly with collapse count (capped), so a long quiet stretch reads as a
pause rather than dead air — without stalling.

### Artifacts

- `frames.json` — per commit: `kept | duplicate | skipped`, `diff_ratio`, `collapsed_into`.
- Duplicate PNGs are discarded after hashing (disk win).
- Backwards compatible: `dedup.enabled: true` by default, `false` restores v1 behaviour.

## Part 2 — `architecture-evolution-timelapse` (new sibling skill)

Same rule — a frame only when something changed — applied to C4 diagrams.

### Why generation must be deterministic

If an LLM draws the diagram at each commit, node names, ordering and phrasing drift between
commits. Every frame then looks "changed", which defeats the entire premise. **No LLM in the
structural path.**

### Pipeline

1. **Extract** a structured architecture model from the checked-out tree by static analysis:
   - *Context (C1)*: the system, its actors, and external systems — inferred from `package.json`
     dependencies, config files and env var names. For 75-proof: Clerk (auth), Convex (backend),
     OpenAI/OpenRouter via AI SDK, PostHog (analytics), web-push, Cloudflare (hosting).
   - *Container (C2)*: deployable/runtime units — Next.js web app, Convex backend, cron scheduler
     (`convex/crons.ts`), service worker, middleware.
   - *Component (C3)*: modules within a container — `convex/*.ts` functions, `app/` route groups,
     `lib/` modules. Edges from parsed import statements and `api.*` references.
   - *Code level (C4): explicitly out of scope*, per requirement.
2. **Canonicalise** — stable IDs derived from file paths, nodes and edges sorted, no timestamps,
   no absolute paths.
3. **Hash** the canonical model. Identical hash ⇒ identical architecture ⇒ no frame emitted.
   This makes "these two diagrams are unchanged" an exact, trivial check rather than an image
   comparison.
4. **Render** Mermaid from the model via a fixed template, rasterised inside the Playwright
   Chromium the skill already ships (`mermaid` as a local script dep — no mermaid-cli, no second
   Puppeteer).
5. **Stitch** with the same collapse + badge logic as Part 1.

Three levels ⇒ three independent videos, each deduped on its own model hash. A commit can change
the component diagram while leaving context untouched, and the context video correctly shows no
new frame.

Because extraction is static, this needs **no dev server, no install, and no secrets** — so it
runs cleanly on 75-proof despite its Clerk/Convex requirements.

## Demo targets

- **Frontend timelapse → kayvee-website** — 39 commits, no auth, no env vars referenced in `src/`,
  already has `.timelapse.yaml`. Completes unattended.
- **C4 timelapse → 75-proof** — 278 commits, architecturally rich. Static analysis only, so its
  Clerk/Convex secrets and long-dead Convex deployments are irrelevant.

## Verification

Both skills are proven by an actual artifact, not just tests:

- kayvee home page: 32 frames → expect ~6 kept frames, no static stretches.
- 75-proof: three C4 videos; assert that re-running extraction on the same commit twice produces
  byte-identical Mermaid (the determinism guarantee), and that commits touching only e.g. styling
  produce no new architecture frame.
