# Backlog — change-aware timelapses (overnight run, started 2026-07-13)

**Progress (corrected 2026-07-22):** the run halted mid-flight on 2026-07-13 at 09:59
EDT. A1, A2, B1-s1 and B1-s2 reached APPROVE and are open as PRs #47, #50, #46, #49.
B2 shipped as PR #51 but its review was dispatched and **never returned** — that PR
carries no verdict of any kind. A3 was implemented but the executor never committed;
the work was recovered from an agent worktree on 2026-07-22 and is now PR #54,
likewise unreviewed. A4, B3 and B4 have full specs but were never executed. Nothing
is merged: the run was in stacked-PR mode, and the integration branch itself had no
PR to main until 2026-07-22.

> **Warning to future readers:** between 2026-07-13 08:40 and 2026-07-22 this line and
> the Status column below were stale — they claimed "Last shipped: none" and `pending`
> across the board while four items had in fact reached APPROVE. Per
> `orchestrated-delivery/SKILL.md`, the orchestrator must refresh both at each item
> completion. `docs/orchestration/token-ledger.md` stayed accurate throughout and is
> the better source of truth if these two ever disagree again.

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

**Orchestrator DELTA for A3 (2026-07-13 ~10:20Z):** A3 spec's Open choice 1 is
DECIDED — `mp4.fps` is RETIRED; MP4 output is CFR 30 so variable-duration holds
(badge scaling, speedthrough 83ms slots) survive encoding. The spec's alternative
(keep mp4.fps) is dead. Config docs must mark mp4.fps as ignored/retired.

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
| A1 | Pristine capture: remove capture-time overlay, `dedup` config schema, `ignore_selectors` masking, per-frame metadata for stitch | — | APPROVE — PR #47 (open) |
| A2 | Dedup engine: ffmpeg raster diff vs last-kept frame, `frames.json`, duplicate-PNG discard, tree-hash boot-skip | A1 | APPROVE — PR #50 (open) |
| A3 | Stitch-time annotation + collapse modes (`badge` default / `drop` / `speedthrough`), hold scaling, index.html | A2 | implemented, PR #54 (open) — UNREVIEWED, recovered from worktree 2026-07-22 |
| A4 | Init interview: options asked at invocation (dedup, collapse mode, threshold, pacing); SKILL.md + references | A3 | spec written, never executed |
| A5 | E2E proof on kayvee-website: full run; ≈6 kept frames expected on home; pacing report (duration, longest static stretch) | A4 | no spec |
| B1 | New skill `architecture-evolution-timelapse`: scaffold + deterministic C4 extractor (C1/C2/C3 model) + canonicalisation + hash | — | APPROVE — PR #46 (s1) + PR #49 (s2), both open |
| B2 | Mermaid render pipeline: model→Mermaid fixed template, rasterised via Playwright Chromium | B1 | PR #51 (open) — review dispatched 2026-07-13 09:59, NEVER RETURNED |
| B3 | History walk + per-level change detection + collapse/badge stitch + index.html | B2 | spec written, never executed |
| B4 | Init interview (levels, collapse mode, pacing) + SKILL.md + references | B3 | spec written, never executed |
| B5 | E2E proof on 75-proof: 3 videos; determinism assertion (same commit ⇒ byte-identical Mermaid); pacing stress report (first-parent walk = 80 commits; 278 incl. side branches) | B4 | no spec |

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
