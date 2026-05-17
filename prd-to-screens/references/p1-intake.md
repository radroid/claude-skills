# P1 — PRD Intake

The first phase. Locate the PRD, read it cover-to-cover, and confirm understanding *out
loud* with the human before deriving anything from it. Cheap to do; expensive to skip.

## Exit gate

**Human says "yes, that's what I meant."** Until then, `.screens/state.json` stays at
`phase: "P1"`. On acceptance, set `checkpoints.P1: "passed"` and flip `phase` to `"P2"`.

## Required artifact at exit

`.screens/intake.md` — a one-pager that captures, in your own words:

- **Primary user** — one sentence. If the PRD lists multiple personas, ask which is primary
  for the v1 frontend; the others are noise for screen derivation right now.
- **Top three jobs-to-be-done** — what the user opens the app to accomplish. Ranked.
- **Core entities** — the nouns the user manipulates (e.g., "invoice", "project", "team
  member"). These drive list/detail screen pairs in P2.
- **In-scope surfaces** — settings? billing? admin? public marketing site? Be explicit; the
  PRD usually implies, not states.
- **Out-of-scope surfaces** — things the human will *not* see in the v1 mockups even if the
  PRD mentions them. This is the cheapest way to keep screen count sane.
- **Design vibe (one sentence)** — "B2B utility, dense tables, neutral palette" or "consumer,
  playful, big imagery". Drives P5 HTML aesthetic without making you guess.
- **Open questions** — list whatever the PRD doesn't answer that you'll need to derive
  screens. Each gets resolved before P1 ends.

## Workflow

1. **Locate the PRD.** Check, in order: `docs/PRD.md`, `PRD.md`, `docs/prd.md`, anything the
   `idea-to-loop` skill left at `docs/scope.md`. If none exists, **stop and tell the user**:
   either point you at the file or write one first (suggest `idea-to-loop` for greenfield).
   Do not invent a PRD.

2. **Read it fully** — not skim. Skill quality from here is bounded by your read of this
   doc.

3. **Draft `.screens/intake.md`** filling the structure above. Bold any spot where you
   guessed instead of quoted.

4. **Present the draft to the human verbatim.** Phrasing: "Here's what I'm taking away from
   the PRD — anything I missed or misread?" Wait for them.

5. **Resolve open questions one at a time.** If there are more than 3–4 ambiguities,
   invoke `superpowers:brainstorming` to talk them out rather than firing a wall of
   bullet-point questions. Brainstorming is built for messy spec gaps; use it.

6. **Update the file with their corrections.** Re-present only if there were substantive
   changes; if the human just said "yep, good," advance.

## When to push back

A PRD that says "social network for dog owners" and nothing else is not enough to derive
screens. Tell the human directly: "I can guess at screens, but they'll be generic — want
to spend 10 minutes adding detail to the PRD first, or want me to brainstorm scope with
you and update it?" Either is fine; charging forward on no info is not.

## What NOT to do

- Don't list every screen you can imagine in this phase — that's P2's job, and doing it
  here without confirming intake usually produces a list the human throws out.
- Don't pick a tech stack, library, or styling system in your head — design vibe is one
  sentence, that's it. P5 picks specifics.
- Don't write more than a one-pager. If `.screens/intake.md` is approaching 200 lines, you
  are restating the PRD instead of distilling it.

## Cross-references

- `p2-inventory.md` — what P1 feeds into.
- `assets/templates/` — no intake template needed; the structure above is the template.
