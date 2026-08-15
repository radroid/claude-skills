---
name: grill-to-prd
description: Grill the user into a PRD at docs/PRD.md. Use when they want to be interviewed about an idea, ask for a PRD or spec, or name a Technical, Designer, or Vibe PRD.
---

# Grill to PRD

## Goal

Interview the builder until you can write a PRD they'd sign — then write it to
`docs/PRD.md` and get their sign-off. The interview adapts to who the builder
is and what code already exists, so questions land where the user actually has
answers.

Three persona lanes, three templates
(`assets/templates/PRD-{technical,designer,vibe}.md`): **Technical** (data
model, API surface, edge cases, test plan), **Designer** (journeys, states,
flows, accessibility, copy), **Vibe** (mood, references, do/don't anchors, the
builder's own words).

## Where to start

Audit the repo — greenfield vs brownfield. On brownfield, read the manifest,
README, existing docs, and recent commits first, so every question lands where
the code is silent; trust dies in three turns of asking what the repo already
says. An existing `docs/PRD.md` → offer update / replace / abort; never
silently overwrite. Then classify the lane (state it, let the user override)
and grill in-conversation using `references/question-bank-<lane>.md` as the
spine — at the lane's cadence, sprinkling in secondary-lane questions where
signals were mixed. The bank's exit checklist is the goal: stop there, and skip
anything the repo, an earlier answer, or an attached design file already
answers.

## Contracts

- One lane per run. Genuinely ambiguous after re-asking → default Technical
  (the most easily down-converted) and note the choice in the PRD appendix.
- Run the interview inline, in this conversation — the back-and-forth is the
  point.
- Synthesis: fill the lane template completely; quote the user **verbatim**,
  and carry every committed external reference across verbatim with the user's
  own one-line annotation; flag every TBD with a searchable `> TODO:`; add a
  "Decisions made under uncertainty" appendix for anything you had to guess.
- **User sign-off is a hard gate.** Surface the finished PRD with its top
  ambiguities and wait for an explicit yes before any handoff.
- Handoff by invocation context: standalone → report the PRD path and stop
  (suggest `idea-to-loop` or `auto-loop-bootstrap` as next steps); called
  from `idea-to-loop` S0 or `auto-loop-bootstrap` → return control to the
  caller. If `.loop/state.json` exists, record `checkpoints.prd-accepted`;
  append one line to `docs/decision-log.md` when that file already exists.
- Invoke `superpowers:brainstorming` only when the user explicitly asks for a
  design pass before synthesis, and brief it to return control to you — your
  synthesis is the one that writes the PRD.
