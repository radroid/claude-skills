# grill-to-prd — Skill Validation (Dry-Run)

**Date:** 2026-05-17 · **Status:** complete (dry-run; no live builder grill yet) · See [`README.md`](../README.md), [`m2-validation.md`](./m2-validation.md) for the prior milestone's dry-run pattern this mirrors.

## What was built

A fourth skill (`grill-to-prd`) that fills the gap referenced by `idea-to-loop`'s S0 stage — the missing implementation of the `grill-me` / `to-prd` chain. Adds **persona-aware** interviewing across three lanes (Technical / Designer / Vibe) and writes `docs/PRD.md` from a lane-matching template. Two commits land it:

| Commit | What it shipped |
|---|---|
| `89b444f` | `grill-to-prd/SKILL.md`, 6 references (`codebase-context`, `persona-probe`, three question banks, `prd-synthesis`), 3 PRD templates, README update, `idea-to-loop/s0` discoverability note, dist rebuild |
| `4f4cc3b` | Phase 3 flow fix — inline grill is the default; brainstorming is opt-in with a brief that prevents its `writing-plans` terminal state from short-circuiting Phase 4; Phase 6 decision-log clarification |

The repo now ships **four skills**: `grill-to-prd` (this PRD-production interview), `idea-to-loop` (greenfield), `auto-loop-bootstrap` (brownfield), `autonomous-build-loop` (loop runtime, S3+). All three downstream skills now have a real, callable PRD-producer instead of a chain of aspirational skill names.

## Trace-through — three hypothetical builders

### Builder A — "Technical" lane (brownfield)

A backend engineer with an existing Postgres + Rails monorepo says: *"/grill-to-prd — I want to add a notification fan-out system."*

| Phase | Trigger | Action | Artifact |
|---|---|---|---|
| **1. Context** | Skill loads | Reads `README.md`, `Gemfile`, `app/models/`, `git log --oneline -10`. Detects `brownfield`. No existing `docs/PRD.md`. | 5-bullet context summary, carried into Phase 3 framing |
| **2. Persona probe** | 3-question classifier (`references/persona-probe.md`) | User answers: A1=data model / A2=schema / A3=mechanically. `persona_lane: technical`. | Announces lane; user accepts |
| **3. Grill (inline)** | Walks `references/question-bank-technical.md` 1–2 questions per turn. Skips A1 ("what does it do?") because the README answers it. Stops at exit checklist. | 9 sections covered (problem, I/O, data model, API, perf, edges, stack, scope, blockers) | Grill captures in conversation |
| **4. Synthesize** | Opens `assets/templates/PRD-technical.md`. Fills entity/API tables, in/out scope. `Decisions made under uncertainty` appendix gets 2 entries (defaulted retry policy, defaulted queue choice). | `docs/PRD.md` written | Technical PRD, ~120 lines |
| **5. Review gate** | Self-review: placeholder scan (3 `> TODO:` markers), internal consistency. Surfaces 3 specific verify-items to user. **HARD GATE.** | User signs off | PRD accepted |
| **6. Handoff** | Standalone invocation → prints "PRD ready at `docs/PRD.md`", suggests `auto-loop-bootstrap` next. No `.loop/state.json`, so no checkpoint write. | (none) | User now has a buildable PRD |

### Builder B — "Designer" lane (greenfield)

A product designer in an empty repo says: *"Interview me — I want to write a PRD for a daily ritual companion."*

| Phase | Action | Artifact |
|---|---|---|
| **1. Context** | `git ls-files | wc -l` = 0. Mode `greenfield`. Three bullets degrade to "n/a — greenfield". | Context summary (mostly stubs) |
| **2. Persona probe** | A1=screen/interaction / A2=Figma / A3=user journey. `persona_lane: designer`. | Lane announced |
| **3. Grill (inline)** | Walks `references/question-bank-designer.md`. User pastes 3 Figma URLs and 2 reference apps. Voice phrase captured verbatim: *"warm but not precious"*. | Grill captures |
| **4. Synthesize** | Opens `assets/templates/PRD-designer.md`. Reference URLs included verbatim with user's one-line annotations. Voice phrase quoted in `## 6. Copy & voice`. State table half-filled (user deferred error state). | `docs/PRD.md` written, ~150 lines |
| **5. Review gate** | Self-review flags deferred error state as `> TODO:`. Surfaces it as verify-item #1. | User signs off after adding error-state direction |
| **6. Handoff** | Standalone → suggest `idea-to-loop` next (greenfield path). | PRD ready for S1 |

### Builder C — "Vibe" lane (greenfield, called from `idea-to-loop`)

A founder with no code in `idea-to-loop` S0. The skill invokes `Skill: grill-to-prd`.

| Phase | Action | Artifact |
|---|---|---|
| **1. Context** | Greenfield. `.loop/state.json` exists at `"stage": "S0"`. | Context summary + lifecycle awareness |
| **2. Persona probe** | A1=vibe / A2=references / A3=taste. `persona_lane: vibe`. | Lane announced |
| **3. Grill (inline)** | `references/question-bank-vibe.md`. User riffs for 5 min on "what it should feel like." 3 reference URLs, 1 anti-reference. Do/Don't list filled. | Verbatim quotes captured |
| **4. Synthesize** | `assets/templates/PRD-vibe.md`. Heavy use of `> blockquote` for user's words. `Appendix A — Verbatim quotes` archive populated. `Appendix B — Decisions delegated to the builder` lists 4 items the user explicitly punted on. | `docs/PRD.md`, ~140 lines |
| **5. Review gate** | Self-review confirms voice fidelity (no over-editing). Surfaces 2 verify-items + asks "anything missing?" | User signs off |
| **6. Handoff** | Called from `idea-to-loop` → returns control. Appends `"PRD accepted at iter 0, persona lane: vibe"` to `docs/decision-log.md` (which idea-to-loop seeded). Sets `checkpoints.prd-accepted: "passed"` in `.loop/state.json`. | Control returns to `idea-to-loop` for `Skill: prototype` |

The three traces cover all six invocation dimensions (greenfield × brownfield × standalone × called-from-S0, plus all three lanes). Persona-routing and template selection both fire correctly across every combination.

## Artifact validation

### Dist artifact unpacks

```
$ unzip -l dist/grill-to-prd.skill | tail -5
     3393  05-17-2026 05:12   grill-to-prd/assets/templates/PRD-technical.md
     3189  05-17-2026 05:12   grill-to-prd/assets/templates/PRD-vibe.md
     3773  05-17-2026 05:12   grill-to-prd/assets/templates/PRD-designer.md
---------                     -------
    53079                     14 files
```

14 files, 53 KB. SKILL.md + 6 references + 3 templates + directory entries. Clean.

### Frontmatter is well-formed

```
$ head -4 grill-to-prd/SKILL.md
---
name: grill-to-prd
description: Interview a builder end-to-end to produce a PRD they can hand to an autonomous build loop. ...
---
```

`name` is the skill folder name (matches convention). `description` enumerates trigger phrases up front per `idea-to-loop`'s pattern.

### Same-skill references all exist

```
$ for f in $(grep -oE 'references/[a-z-]+\.md' grill-to-prd/SKILL.md | sort -u); \
    do test -f "grill-to-prd/$f" && echo "OK: $f"; done
OK: references/codebase-context.md
OK: references/persona-probe.md
OK: references/prd-synthesis.md
OK: references/question-bank-designer.md
OK: references/question-bank-technical.md
OK: references/question-bank-vibe.md
```

All six referenced docs resolve to files in the dist artifact above.

### Cross-skill references resolve

```
$ for f in auto-loop-bootstrap/references/grilling-guide.md \
           idea-to-loop/references/s0-alignment-and-scope.md \
           idea-to-loop/references/decision-log.md; \
    do test -f "$f" && echo "OK: $f"; done
OK: auto-loop-bootstrap/references/grilling-guide.md
OK: idea-to-loop/references/s0-alignment-and-scope.md
OK: idea-to-loop/references/decision-log.md
```

All three cross-skill refs in `SKILL.md` resolve.

### Asset templates well-formed

```
$ grep -c "{{" grill-to-prd/assets/templates/*.md
PRD-designer.md:63
PRD-technical.md:51
PRD-vibe.md:43
```

All three templates use `{{PLACEHOLDER}}` consistently (no `<PLACEHOLDER>` or `___` mixed in). Synthesis can find/replace them deterministically.

### Build script picks the skill up automatically

```
$ ./scripts/build.sh 2>&1 | grep grill-to-prd
  built grill-to-prd.skill  (28K)
```

No build-script edit needed — the existing auto-discovery (`*/SKILL.md`) finds the new skill.

### `idea-to-loop` discoverability note resolves

```
$ grep -A1 "grill-to-prd" idea-to-loop/references/s0-alignment-and-scope.md | head -3
> **Consolidated path (preferred when installed):** `grill-to-prd` implements the
> `grill-with-docs → grill-me → brainstorming → to-prd` chain end-to-end with persona-aware
> question banks (Technical / Designer / Vibe) and writes `docs/PRD.md` directly.
```

Annotation added; existing S0 workflow remains intact as fallback.

## Phase 3 flow conflict — caught and fixed

Initial draft (commit `89b444f`) had Phase 3 invoking `superpowers:brainstorming` as the default. Advisor review caught the conflict: brainstorming's terminal state is `Invoke writing-plans skill` (see brainstorming SKILL.md, step 9, and the explicit *"The terminal state is invoking writing-plans"* assertion). Wrapping it as default would have:

1. Caused brainstorming to write its own spec to `docs/superpowers/specs/YYYY-MM-DD-*.md` — second artifact the user didn't ask for.
2. Short-circuited Phase 4 by jumping into `writing-plans` before `grill-to-prd` could synthesize `docs/PRD.md`.

Fix (commit `4f4cc3b`): inline grill becomes the default; brainstorming is opt-in only when the user explicitly requests a design pass, and gets a brief that suppresses both the spec-write and the `writing-plans` transition.

Documented in `SKILL.md` § "Required skill check" and Phase 3 § "Optional — brainstorming pass before synthesis."

## Known gaps / follow-ups

None are M-grill-to-prd blockers; all are reasonable next-iter work.

1. **Persona-probe questions need wording polish under live grilling.** Q2's option "I usually just talk and gesture and it kind of comes out" is signal-rich but verbose. A live run will reveal whether users pick it or skip it. Likely-tightening edit, not a blocker.
2. **No live builder grill yet.** This validation is dry-run only. A live run (greenfield: fresh idea; brownfield: real repo) will surface tone/cadence issues the trace-through can't.
3. **PRD templates have `{{PLACEHOLDER}}` count drift.** Designer = 63, Technical = 51, Vibe = 43. Reasonable (Designer captures more state-by-state detail) but worth eyeballing once live-run output exists — a PRD that has 60+ markers feels like a form to fill, not a doc that was grilled out of a human.
4. **Phase 1 audit doesn't currently sniff `.claude/` settings.** Brownfield repos sometimes carry meaningful `.claude/CLAUDE.md` or skill-installed signals that could pre-populate context. Possible additive heuristic; deferred until live runs show signal value.
5. **Auto-detection of "user wants brainstorming pass."** Currently the user must explicitly ask. A heuristic — "complex architecture question came up mid-grill" — could offer it automatically. Risk: false triggers. Hold for live data.

## What's next

- **Live trial run.** Pick a real idea (yours or anyone's) and run `grill-to-prd` end-to-end. Diff the output PRD against what the human would've written cold. Tighten question banks based on what got asked vs. what mattered.
- **Update `auto-loop-bootstrap` to invoke `grill-to-prd` for PRD work** (separate from its current `grill-me` invocation for backlog work). The two grills serve different purposes — PRD vs. GOALS.md backlog — and both can coexist.
- **Roadmap slot.** This skill isn't in the current ROADMAP milestones (M0–M5). If it stabilises via live runs, add a row under M3 or M4 — wherever PRD-production discipline becomes load-bearing for the multi-loop work.

## Regression guard

- `idea-to-loop/references/s0-alignment-and-scope.md` change is a **purely additive** blockquote pointing at the consolidated path. The existing S0 workflow (`grill-with-docs → grill-me → brainstorming → to-prd → prototype`) remains intact as the fallback for environments where `grill-to-prd` isn't installed.
- `auto-loop-bootstrap` unchanged — its `grill-me` invocation for backlog work is orthogonal to PRD work.
- `autonomous-build-loop` untouched.
- `README.md`, dist artifacts updated to reflect the new skill but no behavioural changes to existing skills.

M1 contract holds; M2 greenfield path remains operable.
