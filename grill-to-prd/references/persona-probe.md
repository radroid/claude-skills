# Phase 2 — Persona probe

Three questions. They pick the PRD lane: **Technical**, **Designer**, or **Vibe**.

## Why this exists

Asking an engineer for "the user's emotional journey" wastes both of your time. Asking a vibe-coder for "the data model and indexing strategy" makes them shut down. The lane decides which template fills in and which question bank drives Phase 3.

## How to ask

Ask them in this order. **One at a time.** Use multiple choice when shown — single-select. The user can write in `Other` if none fit.

Use the `AskUserQuestion` tool for the multi-choice questions when the harness supports it. Otherwise, ask in plain text and let the user reply naturally.

---

### Q1 — When you imagine the thing existing, what do you see first?

| Option | Signal |
|---|---|
| A screen / layout / interaction | → Designer-lean |
| A data model / API / how the pieces wire together | → Technical-lean |
| The vibe / how it feels to use / the mood | → Vibe-lean |
| All three at once, can't separate them | → Mixed (ask Q2 to break the tie) |

### Q2 — How do you usually describe an idea to a collaborator?

| Option | Signal |
|---|---|
| With a sketch, a Figma file, or "here's a screenshot from X that looks like what I want" | → Designer |
| With a rough schema, a sequence diagram, or "it's like Y but with Z added" | → Technical |
| With references — "imagine if A met B, with the energy of C" | → Vibe |
| I usually just talk and gesture and it kind of comes out | → Vibe (if Q1 was also Vibe-lean) or Designer (if Q1 was Designer-lean) |

### Q3 — What's the part you're most sure about right now?

| Option | Signal |
|---|---|
| The user journey / what the experience should feel like | → Designer |
| What it does mechanically / inputs → outputs | → Technical |
| The taste / which direction it should *not* go | → Vibe |
| Honestly, none of it — that's why we're here | → Default to Technical (most easily down-converted later) |

---

## Decision rules

After three answers, pick a `persona_lane` and a `secondary_lane` (or `none`):

| Pattern | persona_lane | secondary_lane |
|---|---|---|
| 3 of the same | that one | none |
| 2 of one, 1 of another | the majority | the minority |
| All three different | **Technical** (safest default) | mark both others as secondary, note the split |
| Multiple "Mixed" / "none" answers | **Technical** | none — flag in PRD appendix that the persona was unclear |

## State the lane out loud

Before moving to Phase 3, tell the user:

> "Based on your answers, I'm running this as a **{persona_lane}** PRD (with **{secondary_lane}** elements). If that's wrong, say the word and I'll switch lanes."

Two reasons:
1. It gives the user an out — they know best.
2. It primes them for what Phase 3's questions will feel like, so they don't get blindsided by "wait, why are you asking me about color palettes?"

## Self-identification override

If the user volunteers their identity unprompted — "I'm a designer", "I'm a backend engineer", "I just have feelings about this, idk" — **trust them**. Skip Q1–Q3 and confirm with one summary question:

> "Got it — running this as a **{lane}** PRD. Quick check: anything from the other lanes you definitely want covered too? (e.g. as a designer, do you want a Technical 'data model' section appended? As an engineer, do you want a Vibe 'do/don't list' appended?)"

The answer becomes `secondary_lane`.

## What if they push back on the lane?

Switch immediately. The probe is a heuristic, not a diagnosis. If the user says "actually let's go Designer", note both lanes in the PRD appendix and proceed with Designer.

## What NOT to do

- Don't argue with the user about which lane they are.
- Don't psychoanalyze the answers ("you said you want a sketch, so deep down you're really a designer"). The probe is for routing, not for insight.
- Don't run all three lanes "to be thorough." Three lanes = three templates = no PRD. Pick one.
- Don't skip the probe because you "can tell" what lane they're in. The user telling you explicitly is faster and more reliable than your inference.
