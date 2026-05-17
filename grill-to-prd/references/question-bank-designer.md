# Phase 3 — Designer question bank

For design-led builders. Optimised for capturing user journeys, states, and interaction nuance — the things an engineer building from a sparse spec gets wrong.

## How to use

- Ask 1–2 questions per turn.
- **Encourage references.** "Show me a screenshot of something close" is a valid answer for many of these.
- Multiple-choice when possible, but designers often have nuanced answers — let them write in.
- Skip questions whose answer is already in the Phase 1 context summary or in attached design files.
- The exit checklist at the bottom is the goal — don't run every question if the user is fluent.

## Section A — Who and why

A1. **One sentence**: who is this for, and what moment in their day does it serve?
A2. What are they doing right *before* they reach for this? What about right *after*?
A3. What's the emotional state at the start of the interaction? (Stressed / curious / hurried / playful / focused)
A4. What word would you want them to use to describe it to a friend?

## Section B — The primary journey

B1. Walk me through the **happy path** — first touch to "done." Step by step.
B2. What's the **most critical step** — where the experience either works or falls apart?
B3. Is this a one-shot interaction or a returning ritual? (Once / occasional / daily / always-on)
B4. Does the user finish in one sitting, or come back across sessions?

## Section C — States

C1. **Empty state** — what does the user see the very first time, before any data exists?
C2. **Loading state** — what's visible while something's happening?
C3. **Error state** — what shows when something goes wrong? What can the user do about it?
C4. **Success state** — how do they know the thing worked? Implicit (just see the result) or explicit (confirmation)?
C5. **Edge states** — anything weird? (Offline / very long content / very short content / no permissions / etc.)

## Section D — Interaction & input

D1. What's the **primary input** mechanism? (Click / type / drag / voice / paste / scroll)
D2. Any **secondary inputs** that matter? (Keyboard shortcuts, gestures, etc.)
D3. **Reversibility** — can the user undo their last action? Should they be able to?
D4. **Confirmation** — what actions need a "are you sure?" gate, what should just happen?

## Section E — Visual & tonal references

E1. Show me 1–3 products/sites/apps that get close to the feel. What specifically do you like in each?
E2. Show me 1–2 that go in the **wrong** direction. What specifically do you dislike?
E3. Existing brand / design system to honour? (Link to Figma, design tokens, brand book)
E4. Density: **dense and information-rich** or **spacious and calm**?
E5. Energy: **quiet/utilitarian** or **bold/expressive**?
E6. Motion: **still / subtle / playful / immersive**?

## Section F — Copy & voice

F1. Voice in one phrase. (E.g. "warm but precise", "punchy and irreverent", "neutral and clinical")
F2. Reading level — assume a generalist, an expert, or somewhere in between?
F3. Are there phrases / terms / jargon that **must** appear? Any that **must not**?
F4. Empty-state and error copy — is there a voice guideline for those, or should I draft suggestions?

## Section G — Accessibility & inclusivity

G1. Any accessibility floor? (WCAG AA / AAA / "we care but no formal target" / TBD)
G2. Multi-language / locale at v1, or English-only? Any RTL languages later?
G3. Color reliance — anything where color *alone* communicates state? (If yes, what's the redundant signal?)
G4. Reduced-motion users — what's the still-photo version of any animation?

## Section H — Devices & surfaces

H1. Primary surface: mobile / desktop / both / something else (TV, watch, voice)?
H2. If both: which surface drives the design decisions, and which adapts?
H3. Any breakpoint pain points or oddities? (Sidebar at 1200px+, full bleed on mobile, etc.)

## Section I — Scope discipline

I1. **In scope** for v1: list 3–5 screens or flows.
I2. **Out of scope** for v1: list 3–5 things people will ask for but you're deferring.
I3. Success looks like what — qualitatively? (Users keep coming back / they share it / they finish faster / etc.)
I4. What's the smallest version that you'd be **proud** to ship?

## Section J — External blockers

J1. Brand / visual sign-off needed from someone? Who?
J2. Asset blockers? (Custom illustrations, photography, copy from another team, motion from a partner)
J3. Engineering capability blockers? (Real-time, complex animations, OS-level integration)
J4. Anyone who needs to review the PRD before build starts?

## Exit checklist

Stop when you can fill in the Designer PRD template without `> TODO:` in:

- [ ] Who & why (Section A)
- [ ] Primary journey, step by step (Section B)
- [ ] At least 3 of 5 states (Section C)
- [ ] Primary input + reversibility (D1, D3)
- [ ] At least 2 visual references with annotations (E1)
- [ ] Voice phrase + reading level (F1, F2)
- [ ] Primary surface (H1)
- [ ] In/out scope lists (I1, I2)
- [ ] Success signal (I3)
- [ ] External blockers (Section J)

Sections G (a11y), H (multi-surface details), and copy specifics can stay sparse if the user defers — mark `> TODO:` and surface in Phase 5.

## Default behaviours

- **Quote tonal phrasing verbatim.** "Warm but precise" is a better PRD entry than your paraphrase of it. Designer PRDs survive on language fidelity.
- If they show you a reference link: include the link verbatim in the PRD, plus their **one-line annotation** of why it's relevant. Don't editorialise.
- If they say "I'll know it when I see it" about a visual decision: log it as a Vibe-style anchor in the PRD's "Things that need to be felt, not specified" appendix. Don't push them to articulate beyond their ability — that's why we have the Vibe lane and why secondary lanes exist.
- If they hand you a Figma URL: include the URL + a 2-line description of what you see when you open it (a screenshot summary, not a recreation). The link is the spec; your description is the index.
