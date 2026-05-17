# Phase 3 — Vibe question bank

For founders / operators / hobbyists building from feel. The goal is **not** to force them into engineering language — it's to capture enough taste and constraints that a downstream agent can make decisions the builder would have made themselves.

## How to use

- Ask one question per turn. Vibe builders need room.
- **References > definitions.** "Show me a thing like this" beats "describe what you want" every single time.
- **Quote the user verbatim.** Their voice is the spec. Paraphrasing is a sin in this lane.
- Don't force precision where the user has none. If they say "I don't know, I just want it to feel good", log it as a Vibe anchor and move on — that *is* a real PRD entry.
- Multiple-choice is OK but lean toward open prompts that invite a story.
- Exit early if the user is fluent and the references are pouring in.

## Section A — The feeling

A1. **In one sentence** — when someone uses this for the first time, what do you want them to feel?
A2. Pick three adjectives, no more, no less. (Don't overthink — first instinct.)
A3. If this thing were a person, who would they be? (Real person, fictional character, archetype — any of those work.)
A4. If this thing were music, what's the genre / artist / era?

## Section B — The user (in plain English)

B1. Who's the first person you'd hand this to? (Specific name, not a persona.)
B2. What's wrong in their day that this is fixing? Tell me a story — when did you see them have that problem?
B3. What would they *not* like about a generic, soulless version of this thing?

## Section C — References

C1. Show me **2–3 things that already exist** that are close to what you mean. Could be products, sites, videos, even physical objects. For each: **one sentence** on what about it is right.
C2. Show me **1 thing that's the opposite** of what you want. What about it is wrong?
C3. Any specific creator / designer / studio whose taste you'd want to channel?
C4. Any aesthetic that's **completely off the table** — something where if it drifted that way you'd hate it?

## Section D — The do / don't list

This is the heart of a Vibe PRD. We're not specifying what it *is*; we're fencing the space.

D1. List 3–5 things this thing **does** that feel essential — actions, behaviours, vibes. (Verbs preferred.)
D2. List 3–5 things this thing **does not do** — even if it'd be useful, it's not this. (Verbs again.)
D3. Anything sacred — a single detail that, if it were missing, the whole thing would fall apart?

## Section E — Done is when

E1. How will you know it's done? (Not measurable — felt. "When I open it and grin." "When my mom can use it." "When it just sits there and works.")
E2. Who's the audience for v1 — just you, just close friends, a small public, big public?
E3. What's the smallest version you'd be proud to show someone?
E4. What's the version that would feel embarrassing to ship?

## Section F — Loose constraints

(Even vibe builders have these. We just don't pretend they're a spec.)

F1. Anything technical that's a hard yes — a tool, a stack, a platform you're committed to?
F2. Anything that's a hard no — "definitely not an iOS app", "no AI inside it", "must work offline"?
F3. Budget shape — free hobby project / weekend / "I can spend a few hundred" / real funded thing?
F4. Time shape — this weekend / a month / no rush / "before I lose interest"?

## Section G — External blockers

G1. Anyone you'd want to show it to before deciding what it really is?
G2. Anything you're waiting on to make a decision — an event, a conversation, a deadline?
G3. Permission / API access you don't have yet?

## Section H — The "if I had to" check (last)

Only ask these if the user can answer them. **Don't push.**

H1. **If you had to** pick a primary surface — web, mobile, both, something else — what would it be?
H2. **If you had to** name a single feature that gets shipped on day one, what is it?
H3. **If you had to** describe it to a stranger in an elevator, what do you say?

If they can't answer these, that's signal — log it as "intentionally undetermined" in the PRD appendix.

## Exit checklist

Stop the grill when:

- [ ] Feeling sentence + 3 adjectives (A1, A2)
- [ ] At least one user-story moment (B1, B2)
- [ ] At least 2 positive references with annotations (C1)
- [ ] At least 1 negative reference (C2)
- [ ] Do list + Don't list filled (D1, D2)
- [ ] At least one "sacred" detail or success-feeling (D3 or E1)
- [ ] Surface answer or explicit "undetermined" (H1)

Don't push past these. A Vibe PRD that's 60% filled-in but fully in the user's voice beats one that's 100% filled-in with your paraphrasing.

## Default behaviours

- **Quote, never paraphrase.** When in doubt, use the user's exact sentence with quote marks around it. The Vibe PRD template has space for verbatim quotes.
- If the user gives you a link, include the link verbatim with their **one-line** description, not your interpretation.
- If they say "I don't know" twice in a row, change tactic: ask for a *reference* instead of a *description*. "Don't describe it — show me three things close to it."
- If they get excited and start riffing — **let them**. Capture verbatim. Edit later. A 5-minute monologue is gold for a Vibe PRD.
- If they explicitly punt on the technical questions (H1, F1, F2): that's fine. The downstream agent / collaborator picks, and the PRD says "delegated, user signed off on agent's judgment."
- Never end a Vibe grill with "let me know if you have any other questions." End with "I think I've got enough to write something. Want me to go for it?"
