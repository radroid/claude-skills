# Backlog — change-aware timelapses (overnight run, started 2026-07-13)

**Progress:** A1 = PR #47 in adversarial review; B1-s1 = PR #46 in adversarial
review; A2 + B2 planning one-ahead. Last shipped: none.

Design spec: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`

Integration branch: `change-aware-timelapse`. Slice PRs target it and merge there on
APPROVE. The integration→main PR is HELD for morning human review. Nothing lands on
main unattended.

Demo targets:

- kayvee-website (frontend-lane proof): `/Users/rajdholakia/Documents/1-startups/💎 Stella 56/kayvee-website`
- 75-proof clone (C4-lane proof, read-only reference):
  `/private/tmp/claude-501/-Users-rajdholakia-Documents-claude-skills/46feeefb-6ad0-4df2-84af-241f07b3493f/scratchpad/75-proof`

## Invariants (quote by ID in every dispatch)

- **I1 DETERMINISM** — no LLM output in any structural path; same commit + same config
  ⇒ byte-identical model JSON and Mermaid source.
- **I2 PRISTINE PIXELS** — captured screenshots carry no run-generated overlay;
  annotation happens only at stitch time.
- **I3 LAST-KEPT COMPARISON** — dedup compares against the last KEPT frame, never
  merely the previous commit's frame.
- **I4 OPTIONS ARE ASKED** — every new user-facing behavior is a config field with a
  default AND an init-time question presented to the user; `run` honors config and
  never re-asks.
- **I5 V1 RECOVERABLE** — `dedup.enabled: false` restores pre-dedup behavior.
- **I6 SELF-CONTAINED SKILLS** — no cross-skill imports; shared logic is duplicated
  with a provenance comment naming the source file.
- **I7 DEPENDENCY FENCE** — system ffmpeg + existing playwright + local `mermaid`
  package only; no mermaid-cli, no image-processing libraries.
- **I8 EXPLICIT STAGING** — `git add -A` / `git add .` banned in every role.
- **I9 C4 SCOPE** — context/container/component only; never code-level.

## Items (ONE numbering scheme; Needs lists item IDs, never PR numbers)

| ID | Item | Needs | Status |
|----|------|-------|--------|
| A1 | Pristine capture: remove capture-time overlay, `dedup` config schema, `ignore_selectors` masking, per-frame metadata for stitch | — | pending |
| A2 | Dedup engine: ffmpeg raster diff vs last-kept frame, `frames.json`, duplicate-PNG discard, tree-hash boot-skip | A1 | pending |
| A3 | Stitch-time annotation + collapse modes (`badge` default / `drop` / `speedthrough`), hold scaling, index.html | A2 | pending |
| A4 | Init interview: options asked at invocation (dedup, collapse mode, threshold, pacing); SKILL.md + references | A3 | pending |
| A5 | E2E proof on kayvee-website: full run; ≈6 kept frames expected on home; pacing report (duration, longest static stretch) | A4 | pending |
| B1 | New skill `architecture-evolution-timelapse`: scaffold + deterministic C4 extractor (C1/C2/C3 model) + canonicalisation + hash | — | pending |
| B2 | Mermaid render pipeline: model→Mermaid fixed template, rasterised via Playwright Chromium | B1 | pending |
| B3 | History walk + per-level change detection + collapse/badge stitch + index.html | B2 | pending |
| B4 | Init interview (levels, collapse mode, pacing) + SKILL.md + references | B3 | pending |
| B5 | E2E proof on 75-proof: 3 videos; determinism assertion (same commit ⇒ byte-identical Mermaid); pacing stress report over 278 commits | B4 | pending |

## Loop policy

- Lanes A and B run concurrently; items within a lane are serial.
- Planner runs one item ahead within its lane.
- Steward is a HARD GATE per item: the next item's EXECUTOR does not start until a
  steward trace covering the just-merged item exists in `prompt-changelog.md`. One
  steward in flight at a time; a queued steward run covers every item merged since the
  last trace.
- Review verdicts come from `orchestrated-delivery/assets/review-and-verify.workflow.js`
  (unified APPROVE | REVISE | BLOCK). BLOCK escalates to the orchestrator; if
  unresolvable overnight, the item is held for morning and the lane moves on.
