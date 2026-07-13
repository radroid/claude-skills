# Backlog — change-aware timelapses (overnight run, started 2026-07-13)

**Progress:** A1 (PR #47) + B1-s1 (PR #46) reviews returned REVISE — degraded by
account-spend-limit agent deaths; all surviving ballots non-blocking. Fix executors
dispatched with orchestrator-adjudicated issue lists. A2 + B2 specs ready. Last
shipped: none.

**Orchestrator adjudication (2026-07-13 ~08:10Z):** PR46/PR47 REVISE verdicts are
fail-closed artifacts of refuter deaths (monthly spend limit), not code judgments.
Issue lists = the surviving substantive non-blocking findings. Post-fix, each PR gets
ONE light hostile re-review (single agent) instead of the 25-agent panel until the
account limit clears; the panel resumes when infra allows.

**Orchestrator DELTA decisions (2026-07-13):** A2 spec's primary bindings are BLESSED
as written — (1) boot-skipped commits record decision `duplicate` with the `capture`
key absent; (2) mid-run hole-resume is REFUSED (exit 3 with remedies), not replayed.
A3's planner consumes these as frozen; the spec'd alternatives are dead.

**DELTA for A2 executor (2026-07-13, from PR #47 fix round):** timelapse.mjs spawns
the placeholders-only pass without checking exit status (timelapse.mjs:132-143,
366-373 pre-A1 numbering), so screenshot.mjs's new exit-3 invalid-selector abort is
not propagated. A2 (which owns timelapse.mjs) MUST wire the rc check: non-zero
placeholders-only exit aborts the run (exit 3) with the child's stderr surfaced.

**DELTAs for A2/A3 from PR #47 hostile re-review (2026-07-13 ~09:35Z):**
- A2: when touching screenshot.mjs's retry classifier, add `Execution context was
  destroyed` to the transient list (client-side nav racing addStyleTag/applyMasks).
- A2: the execution-note caveat "full_page + below-fold masks untested" is
  DISPROVEN — reviewer verified below-fold masking works (capture never scrolls,
  fixed masks render in place); drop the caveat when convenient.
- A3: frames.json `fail` entries embed multi-line Playwright stacks in `error`;
  A3 renders captions from this file — trim to first line at render time.

Design spec: `docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md`

Integration branch: `change-aware-timelapse` (spec + orchestration docs only).
**STACKED-PR MODE (2026-07-13 ~09:30Z):** the permission classifier correctly blocked
`gh pr merge` — the user authorized opening PRs, not merging them. NO PR is merged
tonight, not even into the integration branch. Instead: each dependent slice branches
off its predecessor's HEAD branch and its PR targets that predecessor branch (diffs
stay slice-scoped). An APPROVE is recorded as a PR comment with the verdict + gate
evidence, and dependent work proceeds on top of the approved branch. The user merges
the chain bottom-up in the morning; the final report lists exact order. Steward
commits its docs-only changes directly to `change-aware-timelapse` (same as the
orchestrator's bookkeeping) so template tuning still takes effect mid-run.

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
