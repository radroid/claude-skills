---
name: grill-to-prd
description: Use when the user wants to be interviewed into a PRD — "/grill-to-prd", "grill me about my idea", "interview me", "help me write a PRD", "turn my idea into a spec" — or asks for a Technical, Designer, or Vibe PRD. Also the PRD-production step of idea-to-loop's S0.
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
flows, accessibility, copy), **Vibe** (mood, references, do/don't anchors —
the user's own words ARE the spec: quote, don't paraphrase).

## Where to start

Audit the repo — greenfield vs brownfield. On brownfield, read the manifest,
README, existing docs, and recent commits first, so you never ask what the
code already answers (that destroys trust in three turns). An existing
`docs/PRD.md` → offer update / replace / abort; never silently overwrite.
Then classify the lane (state it, let the user override) and grill
in-conversation using `references/question-bank-<lane>.md` as the spine —
a few questions per turn, sprinkling in secondary-lane questions where
signals were mixed. The bank's exit checklist is the goal, not the
questionnaire; skip what a fluent user has already answered.

## Contracts

- One lane per run. Genuinely ambiguous after re-asking → default Technical
  (the most easily down-converted) and note the choice in the PRD appendix.
- The grill is inline and interactive — no subagents for the interview
  itself; the back-and-forth is the point.
- Synthesis: fill the lane template completely; quote the user wherever
  possible; flag every TBD with a searchable `> TODO:`; include committed
  external references verbatim with one-line annotations; add a "Decisions
  made under uncertainty" appendix for anything you had to guess.
- **User sign-off is a hard gate.** Surface the finished PRD with its top
  ambiguities and wait for an explicit yes before any handoff.
- Handoff by invocation context: standalone → report the PRD path and stop
  (suggest `idea-to-loop` or `auto-loop-bootstrap` as next steps); called
  from `idea-to-loop` S0 or `auto-loop-bootstrap` → return control, never
  invoke downstream skills yourself. If `.loop/state.json` exists, record
  `checkpoints.prd-accepted`; append one line to an existing
  `docs/decision-log.md` — never create it.
- `superpowers:brainstorming` is opt-in only (the user explicitly asks for a
  design pass before synthesis) and must be briefed to return control rather
  than advancing to writing-plans — otherwise it short-circuits your own
  synthesis.
