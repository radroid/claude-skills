---
name: grill-to-prd
description: Interview a builder end-to-end to produce a PRD they can hand to an autonomous build loop. Use when the user says "/grill-to-prd", "grill me about my idea", "interview me", "help me write a PRD", "I have an idea but need to flesh it out", "turn my idea into a spec", or asks for a Technical / Designer / Vibe PRD. Detects greenfield vs brownfield, probes builder expertise (Technical / Designer / Vibe lanes), audits the existing codebase when present, wraps superpowers:brainstorming with persona-specific framing, then writes docs/PRD.md from the lane-matching template. Also serves as the missing implementation of the grill-me / to-prd chain referenced by idea-to-loop's S0 stage — callable standalone or as S0's PRD-production step. Never clobbers an existing PRD without offering update vs. replace.
---

# Grill to PRD

## Overview

A grilling interview that ends with a written PRD. Adapts to who the builder is and what code already exists, so the questions land where the user actually has answers — not where a generic template thinks they should.

Three persona lanes drive three PRD shapes:

| Lane | Builder profile | PRD emphasis |
|---|---|---|
| **Technical** | Engineer, comfortable with data models / APIs / infra | Data model, API surface, edge cases, perf targets, dependencies, test plan |
| **Designer** | Product designer, journey-first thinker | User journeys, states, interaction flows, references, accessibility, copy |
| **Vibe** | Founder/operator working from feel, not spec | Mood, inspiration links, "I'll know it when I see it" anchors, do/don't list, sample artifacts |

Output: `docs/PRD.md` (handed off to the loop or to the human for review).

## When to use vs. neighbouring skills

| Situation | Skill |
|---|---|
| Builder has an idea but no written PRD yet | **`grill-to-prd`** (this skill) |
| Builder has docs/notes and just wants them shaped into a PRD | **`grill-to-prd`** with the `references/codebase-context.md` doc-ingest path |
| Greenfield idea → full bootstrap (PRD + stack + scaffold + loop) | `idea-to-loop` (calls this skill at S0) |
| Existing repo, no loop, has goals | `auto-loop-bootstrap` directly |
| PRD already exists and is good | Skip this skill — go straight to `auto-loop-bootstrap` or the loop |

## Required skill check

This skill assumes `superpowers:brainstorming` is available — it does the per-question iteration loop and the HARD-GATE on user approval. If it's missing, fall back to the inline Q&A loop described under "Fallback mode" below. Do not block on it.

## Workflow

Six phases. Run in order. Stop early only if a phase's exit-criterion isn't met (and surface the block).

### Phase 1 — Detect context (greenfield vs brownfield)

Run the audit from `references/codebase-context.md`. Output: a short context summary you carry into every later phase, so you stop asking questions the code already answers.

Greenfield (`git ls-files | wc -l` is tiny, no `README.md` / `package.json` / etc.) → mark `context_mode: greenfield`, skip the brownfield-only questions, and bias toward "what does the smallest useful thing look like."

Brownfield → read `README.md`, the package manifest (`package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`), top-level dirs, last 10 commits, and any existing `docs/PRD.md` / `ARCHITECTURE.md` / `GOALS.md`. Summarise in 5 bullets max. Carry the summary into Phase 3 framing.

If `docs/PRD.md` already exists: ask the user **update**, **replace**, or **abort**. Default suggestion: update. Never silently overwrite.

### Phase 2 — Persona probe (which PRD lane?)

Ask the three classifier questions from `references/persona-probe.md`. Output: a `persona_lane` of `technical`, `designer`, or `vibe`. State the lane explicitly to the user before continuing and let them override.

Mixed signals are normal — pick the dominant lane and note the secondary one. The dominant lane picks the template; secondary lane questions get sprinkled into Phase 3.

### Phase 3 — Grill loop

**Preferred path: invoke `superpowers:brainstorming`** with a brief that pins down the persona lane, the context summary from Phase 1, and the persona-specific framing. Example brief:

```
You are running grill-to-prd Phase 3 for a {persona_lane} builder.
Context summary from Phase 1: {summary}
Use the question bank in references/question-bank-{persona_lane}.md as the question
spine — ask one question at a time, multiple choice when possible. Do NOT propose
an implementation. Goal: produce enough material for the Phase 4 PRD synthesis.
End the brainstorming pass when the question bank's exit checklist is satisfied.
```

`superpowers:brainstorming` will iterate one question at a time and gate on user approval before letting you advance — that's the whole point of wrapping it.

**Fallback mode: if `superpowers:brainstorming` is unavailable**, run the loop inline. Read `references/question-bank-{persona_lane}.md` and walk it top-to-bottom, asking 1–3 questions per turn, mixing in secondary-lane questions where they came up in Phase 2. Stop when the exit checklist at the bottom of the question bank is satisfied.

Hard rule across both paths: **never** ask a question whose answer is already in the Phase 1 context summary.

### Phase 4 — Synthesize the PRD

Open `assets/templates/PRD-{persona_lane}.md`. Fill every section using the grill output. Follow the synthesis discipline in `references/prd-synthesis.md`:

- Quote the user's own phrasing wherever possible (especially in Vibe PRDs — the user's words *are* the spec).
- Flag every TBD with a `> TODO:` comment so they're searchable.
- Convert in-scope / out-of-scope into bullets, not prose.
- Add a "Decisions made under uncertainty" appendix when you had to guess — let the user verify.
- If the user committed to specific external references (URLs, inspiration sites, docs), include them verbatim with a one-line annotation each.

Write the filled PRD to `docs/PRD.md`. If the directory doesn't exist, create it.

### Phase 5 — Self-review + user gate

Before declaring done, do a placeholder scan and an internal-consistency pass per `references/prd-synthesis.md` §Self-Review. Fix issues inline. Then surface the PRD to the user with:

```
Wrote docs/PRD.md. Three things to verify:
  1. {top ambiguity #1 from the appendix}
  2. {top ambiguity #2 from the appendix}
  3. Anything missing that you expected to see?
```

This is a **HARD GATE.** Do not invoke any handoff (Phase 6) until the user signs off on the PRD — even a "looks good" is enough, but you must wait for it.

### Phase 6 — Handoff (optional, only if invoked from a lifecycle context)

Three handoff modes — pick based on how this skill was invoked:

| Invocation context | Handoff |
|---|---|
| Standalone (user typed `/grill-to-prd`) | Print "PRD ready at `docs/PRD.md`" and stop. Optionally suggest next skills (`idea-to-loop` for greenfield, `auto-loop-bootstrap` for brownfield). |
| Called from `idea-to-loop` S0 | Return control to `idea-to-loop` — it owns the next step (`prototype` skill invocation). Do not invoke `prototype` yourself. |
| Called from `auto-loop-bootstrap` Phase 2 | Return control — bootstrap owns the `GOALS.md` derivation from this PRD. |

If `.loop/state.json` exists, record `checkpoints.prd-accepted: "passed"` and append a one-line entry to `docs/decision-log.md` ("PRD accepted at iter N, persona lane: X") before returning.

## Hard rules

- **One PRD lane per run.** If the persona probe is genuinely ambiguous after re-asking, default to **Technical** (it's the most easily down-converted) and note the choice in the PRD appendix.
- **Never clobber an existing PRD.** Always offer update vs. replace at Phase 1.
- **Never skip Phase 1 on a brownfield repo.** Asking "what tech stack are you using?" when the manifest is right there destroys trust within three turns.
- **Never invoke `prototype` or any implementation skill from inside this skill.** The PRD is the deliverable. Implementation happens upstream (caller) or downstream (next skill).
- **Phase 5 is a HARD GATE.** No silent finishing. The user has to bless the PRD.
- **Quote, don't paraphrase, in the Vibe lane.** Vibe PRDs survive on the user's voice. Lose the voice → lose the PRD.

## Resources

- `references/codebase-context.md` — Phase 1 audit commands + what to summarise
- `references/persona-probe.md` — Phase 2 three-question classifier with decision rules
- `references/question-bank-technical.md` — Phase 3 spine for engineering builders
- `references/question-bank-designer.md` — Phase 3 spine for design-led builders
- `references/question-bank-vibe.md` — Phase 3 spine for vibe-coding founders
- `references/prd-synthesis.md` — Phase 4 + 5 fill discipline and self-review checklist

## Assets

- `assets/templates/PRD-technical.md` — engineering-shaped PRD skeleton
- `assets/templates/PRD-designer.md` — journey-shaped PRD skeleton
- `assets/templates/PRD-vibe.md` — mood-shaped PRD skeleton

## Cross-references

- `idea-to-loop/references/s0-alignment-and-scope.md` — the S0 stage this skill plugs into
- `auto-loop-bootstrap/references/grilling-guide.md` — the backlog-grilling sibling (not PRD-shaped; complements this skill)
- `superpowers:brainstorming` — the one-question-at-a-time engine this skill wraps in Phase 3
