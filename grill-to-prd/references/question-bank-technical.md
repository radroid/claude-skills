# Phase 3 — Technical question bank

For engineering-led builders. Optimised for getting to a PRD that another engineer (or an autonomous build loop) could implement without re-grilling the human.

## How to use

- Ask 1–2 questions per turn, not all at once.
- **Multiple-choice when possible.** Open-ended only when the answer space is too large to enumerate.
- Skip any question whose answer is already in the Phase 1 context summary.
- If the user is fluent and the answers are sharp, stop early — the **exit checklist** at the bottom is the goal, not running every question.
- If a question reveals a much bigger scope question ("oh, we'd actually need a separate auth service for that"), pause the bank and brainstorm the new scope before resuming.

## Section A — Problem and user

A1. **One sentence**: what does this build *do*, for *whom*?
A2. Who is the actual first user — a specific person/team, or a persona class?
A3. What's the existing workaround they're using today? (None / spreadsheet / a different tool / manual process)
A4. What's the smallest version that would make one real user say "yes, ship me this"?

## Section B — Inputs and outputs

B1. What does the user (or upstream system) feed in?
B2. What comes out the other end? In what form? (JSON / UI / file / event / notification)
B3. Are there async or long-running operations? If so, how does the user know when it's done?
B4. Any side effects on external systems? (Sends emails, writes to DBs, calls external APIs, charges cards)

## Section C — Data model and state

C1. What are the core entities? Sketch a 1-line definition for each.
C2. What's the cardinality / scale per entity? (10s? 10Ms? Growing fast?)
C3. What state transitions exist? Any state machine that should be explicit?
C4. What's the source of truth — local DB? External system? Both with sync?
C5. Any data that's user-private vs. shared vs. public? PII / regulated data?

## Section D — API surface

D1. What are the 3–5 main operations the system exposes? (List as verb-noun pairs.)
D2. Synchronous, streaming, batch, or event-driven? Mix?
D3. Auth model? (None / API key / OAuth / row-level / role-based)
D4. Rate limits or quotas? (Per-user, per-key, global?)
D5. Versioning expectations? (Single version forever / semver / additive-only)

## Section E — Performance & scale

E1. What's "fast enough" for the primary operation? (p50, p95 if known)
E2. Concurrent users at launch vs. 6 months out?
E3. Any hard SLO that's a business requirement (not just nice-to-have)?
E4. Is this cost-bound? Where's the budget pressure?

## Section F — Edge cases & failure modes

F1. What happens when the input is malformed?
F2. What happens when an external dependency is down?
F3. What's the worst plausible bug — what would make a user lose trust?
F4. What's the recovery story — retry, rollback, manual fix, "page someone"?

## Section G — Tech stack & dependencies (brownfield: confirm; greenfield: defer to S1)

G1. **(Brownfield)** Is the existing stack non-negotiable, or open to change for this feature?
G2. Any third-party libraries / SaaS this build *must* use? (Stripe, Auth0, a specific LLM provider, etc.)
G3. Anything explicitly off the table? (No Postgres / no AWS / no LLM calls / etc.)
G4. Deployment target? (Self-hosted / managed / serverless / edge / mobile)

## Section H — Scope discipline

H1. **In scope** for v1 — list 3–5 capabilities, ordered by criticality.
H2. **Out of scope** for v1 — list 3–5 things that *might* belong but are explicitly deferred.
H3. What's the success metric for v1? (Adoption / accuracy / latency / revenue / qualitative signal)
H4. What's the kill criterion — what signal would make you stop building?

## Section I — Verification & test plan

I1. How will you know v1 works? (Manual smoke / automated test suite / real-user signal)
I2. Any feature that's intrinsically un-testable without a live external dependency? (Mark these — the loop builds but can't end-to-end test them.)
I3. What's the baseline you're comparing against? (Existing tool / prior version / "nothing exists")

## Section J — External blockers

J1. API keys / accounts you don't have yet?
J2. Design / brand decisions that need someone else's signoff?
J3. Compliance / legal / security gates that must happen before launch?
J4. Anyone who needs to review the PRD itself before build starts?

## Exit checklist

Stop the grill when you can fill in the Technical PRD template without `> TODO:` markers in these sections:

- [ ] Problem & user (Sections A)
- [ ] Inputs/outputs (Section B)
- [ ] Data model — at least entity names + cardinality (Section C)
- [ ] API surface — at least the 3–5 main operations (Section D)
- [ ] Scope: in/out lists are filled (Section H)
- [ ] Success metric named (H3)
- [ ] At least one named edge case + recovery story (Sections F)
- [ ] External blockers list (Section J) — even if empty

Sections E, G, I can stay sparse if the user doesn't have answers — mark them `> TODO:` and surface in the Phase 5 review, don't keep grilling.

## Default behaviours

- If the user says "you decide" on any technical choice: capture their *constraints* instead and put the decision into the "Decisions made under uncertainty" appendix of the PRD. Don't silently invent.
- If the user contradicts an earlier answer: assume the **later** answer wins, but call it out in your next message and ask "want me to update the earlier note too?"
- If the user gets visibly tired (terse answers, "idk, whatever"): wrap the section, summarise what you have, and ask if they want to stop here and accept a sparser PRD.
