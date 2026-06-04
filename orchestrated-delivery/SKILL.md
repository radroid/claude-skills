---
name: orchestrated-delivery
description: Use when shipping a multi-PR backlog with a team of subagents — to land PR-sized slices via planner/executor/reviewer/fix/steward roles working off repo-resident, code-free plans that don't go stale. Keeps a token ledger, a friction feedback loop, a self-improving steward, and an adversarial anti-bias check that stops reviewers rubber-stamping.
---

# Orchestrated delivery

## Entry gate — engage ultracode mode FIRST (do this before anything else)

This skill orchestrates many role subagents and Workflow runs over a long
horizon. It is built to run in **ultracode mode** — a name that covers TWO
distinct settings, not one toggle: (1) the harness's highest effort level (set
via `/effort ultracode`, which only the user can flip), AND (2) the standing
opt-in to pipeline every substantive step through the harness's strongest
fan-out-and-verify primitive — a Workflow runner where one is exposed, otherwise
role subagents you dispatch and verify before routing onward. Setting the effort
level does NOT auto-engage the Workflow posture — verify both. Step 1 below
checks the effort level; step 2 engages the Workflow contract. Do NOT proceed in
a lower gear. On invocation, before any orchestration:

1. **Require effort level `ultracode`.** If the session is not already in
   ultracode (e.g. it's `xhigh`/`high`/lower), STOP and ask the user, in one
   line: ``orchestrated-delivery needs ultracode — run `/effort ultracode`, then
   say "continue".`` Effort is a session setting only the user can toggle; you
   cannot flip it for them, so make the one-line ask and wait. Do not run the
   loop in a lower effort mode. On a mid-backlog resume, check the session's
   current effort first: if it is already `ultracode`, skip the ask — re-assert
   the precondition and proceed; only STOP-and-ask when effort is below
   ultracode (a fresh post-compaction session may default lower, so always
   re-check on resume rather than assume). Effort is only ONE half of the gate:
   the other half is the dynamic-Workflow opt-in in step 2 — a posture you adopt
   yourself, not something to ask for. Confirm it here in one line (state that
   you are running in Workflow-per-step mode for the rest of this session) so
   the gate enumerates it as a checked precondition; the gate clears only once
   BOTH hold, never on effort alone.
2. **Adopt the ultracode posture immediately** — it is the standing contract for
   as long as this skill drives the session:
   - **Pipeline every substantive step by default — do not hand-run it solo.** The
     loop below (planner → executor → reviewer → fix → steward) IS the workflow
     shape — pipeline the roles via the harness's Workflow runner where one is
     exposed; otherwise fan them out as role subagents (separate worktrees
     where tree-isolation matters) and verify each role's output yourself
     before routing it onward. Either way, do not hand-run inline what can be
     fanned out and verified — degrade the tool, never the verification.
   - **Token cost is not a constraint on COVERAGE.** Be exhaustive on review,
     invariant checks, and the ANTI-BIAS passes. This does NOT relax the token
     DISCIPLINE below — that discipline is about role separation and keeping
     artifacts out of the orchestrator's context, never about thinning the work.
     (See "QUALITY OUTRANKS TOKEN SAVINGS" — the two rules agree.)
   - **Adversarially verify before committing.** Every reviewer verdict and
     every zero-fix streak is suspect until a hostile pass clears it.
   Solo inline work is allowed only for trivial mechanical edits and talking to
   the user.
3. **Pasted as a kickoff prompt** (not the installed skill)? Same gate: confirm
   the user is on `/effort ultracode` before starting.

You are the ORCHESTRATOR. You sequence work, dispatch role subagents, route
information between them, merge, and talk to the user. You do NOT read
implementation files or write feature code. Your context is for decisions,
sequencing, and the user — never artifacts. Everything an agent will need
later lives in a repo file the next agent reads itself.

WHY this exists: left to themselves, planner agents over-plan — they write
code into the plan that is stale by execution time and must be re-derived or
overridden (measured: ~50–100k wasted tokens/spec). Reviewers bleed into
writing fixes. The orchestrator's context fills with implementation detail it
shouldn't hold. This protocol fixes all three by splitting roles, keeping
plans code-free, and pushing every handoff into repo files.

## Quick reference (index only — defer to the sections it names)

Re-orienting from a cold start? First recover live state via **Persistence /
resume** (gh/git/Progress line). Then this index points to the control flow:

- **Loop sequence:** planner → executor → reviewer → fix → merge → steward.
  (See **The loop**; note planner runs one item ahead.)
- **Dispatch params:** ITEM / SPEC / SLICES / BRANCH / PR / INVARIANTS / DELTAS /
  HANDOFF (DELTAS and HANDOFF as applicable). (See **Dispatch protocol**.)
- **Scaffolding files:** the orchestration prompt templates, token ledger,
  friction log, prompt changelog (the single version record), and the backlog
  doc with its **Progress** line. (See **Phase 0**.)
- **Verdict grammar:** `VERDICT: APPROVE` or `VERDICT: BLOCK — <n> issues`.
  (See **The loop**, step 3.)

This is navigation, not a second source of truth — the named sections are
authoritative.

## Phase 0 — Bootstrap (run once on a fresh repo)

**Start the orchestrator in a FRESH session.** This skill's premise is that your
context holds decisions, not artifacts — so do NOT invoke it mid-session after
doing implementation work yourself; that accumulated detail is exactly what the
orchestrator must not carry, and it crowds the context you need for sequencing.
Continuing prior work? `/clear` or open a new session first, then re-enter
through the Persistence docs — they hold everything needed to resume.

1. Learn the repo: read CLAUDE.md / AGENTS.md / CONTRIBUTING for house style,
   the gate commands (build/test/lint/typecheck), the deploy trigger (does
   merging to the main branch deploy to production? if so, MERGES ARE
   OUTWARD-FACING — see Persistence), and the PR tool (`gh`).
2. Create the scaffolding (these are the system's whole memory):
   - `docs/orchestration/prompts/{planner,executor,reviewer,fix,steward}.md`
     — one role-contract template each. Author each by deriving its content
     from the matching numbered step in *The loop* below plus any relevant
     ANTI-BIAS clauses; encode the caveman report style (see Comms) into each
     template's report section. The reviewer template MUST embed the ANTI-BIAS
     clauses verbatim and MUST end with the exact `VERDICT: APPROVE` /
     `VERDICT: BLOCK — <n> issues` grammar. *The loop* and ANTI-BIAS are the
     single source — do NOT fork divergent copies into these files; when the
     contract changes, change it there and re-derive.
   - `docs/orchestration/token-ledger.md` — one line per run + soft per-role
     budgets (seed them after a few runs; don't invent precise numbers).
   - `docs/orchestration/friction-log.md` — `## Open` / `## Resolved`; each
     entry `- [role-tag] (date, run) problem — implication`.
   - `docs/orchestration/prompt-changelog.md` — KPI definitions + every
     template change tied to the KPI it targets. This is the SINGLE version
     record; templates carry no version in their headers.
   - A backlog doc with a one-line **Progress** marker the orchestrator
     updates at each item completion, and a `Needs` (dependency) column
     listing each item's blockers by backlog item ID — ONE numbering scheme,
     never mix item IDs with PR or slice numbers.
3. Decompose the backlog into items, each item into PR-sized slices.

## The loop (per backlog item)

planner → executor → reviewer → fix → merge → (after the item's last PR)
steward.

1. **Planner** writes a spec: prose requirements, `file:line` anchors, and a
   MANDATORY edge-case section. NO CODE (≤3 one-line type signatures only
   where prose is genuinely ambiguous). Anchor everything: before binding a
   component to an interaction, verify it exposes that prop at its file:line;
   `.tsx` for anything that renders; never name an identifier that shadows a
   language global. Runs ONE ITEM AHEAD while the previous item executes.
2. **Executor** implements ONE PR per slice, runs the FULL local gate (+ a
   schema-drift check on schema PRs), pushes, opens the PR, and appends a
   `## Execution notes (PR #n)` handoff to the spec IN ITS OWN PR. Stages by
   EXPLICIT PATH — `git add -A` is banned (a one-ahead planner's next spec
   sits untracked in the shared tree). Small-call autonomy: log deviations,
   don't negotiate; only material gaps (wrong approach, schema impact,
   invariant conflict) bounce back. Ends its report with a `## Friction`
   section.
3. **Reviewer** verifies the diff via `gh pr diff <n> --repo <slug>`
   (cwd-independent; STOP LOUDLY if it fails — NEVER fall back to the local
   working tree, which may hold another branch). Diff-only; ≥80% confidence
   to raise an issue; one-line fix directions, NEVER code. Ends with EXACTLY
   `VERDICT: APPROVE` or `VERDICT: BLOCK — <n> issues`. (Anti-bias clauses
   below are part of this contract.)
4. **Fix executor** applies exactly the reviewer's issues; gate; push.
5. **Orchestrator merges** (squash; detach HEAD first; CONFIRM `state: MERGED`
   before deleting any branch — GitHub may still be computing mergeability and
   a premature delete closes the PR). Append ledger lines; file friction.
6. **Steward** (in a git worktree) reads ledger + friction + templates and
   AUTO-TUNES the templates, logging each change to the changelog with the KPI
   it targets and moving addressed friction to Resolved. Touches ONLY the
   orchestration docs. The orchestrator gates its PR on quality before merge.
   The steward leaves an AUDIT TRACE every run — a ledger line, plus a dated
   changelog note even when it tunes nothing ("reviewed through PR #n, no
   change — <why>"). A steward that only logs when it changes something is
   indistinguishable from one silently skipped; silence is not proof it ran.

## Dispatch protocol

A dispatch is PARAMETERS, not prose: point the agent at its template and pass
ITEM / SPEC / SLICES / BRANCH / PR / INVARIANTS / DELTAS / HANDOFF. Be precise
— quote rules exactly; state the spec-slice→PR-N mapping when they differ;
when a DELTA resolves a spec-open choice, name both sides ("spec offers X|Y;
DELTA picks X"). Match each agent's TYPE to the tools its template needs (a
review agent type with no shell cannot run `gh pr diff` and will silently
review the wrong thing). If you dispatch through a Workflow runner instead of
direct subagents, author its script to the runner's EXACT contract — read the
tool's spec, don't guess; common rejections are TypeScript syntax in a plain-JS
runner or passing an unsupported param (e.g. a background flag). A malformed
dispatch only costs a retry, never a wrong result, but it burns a cycle. The
working tree is a shared resource PER PATH: for
any tracked path, at most one tree-MUTATOR — the executor, the fix executor, or
your own orchestrator shell — touches it at a time. The one-ahead planner is
exempt: it writes only NEW, untracked spec files on paths no other actor
stages, which is exactly why the executor stages by EXPLICIT PATH and never
`git add -A`s (see above). The reviewer NEVER touches the tree at all; the
steward works in an ISOLATED git worktree (a separate checkout, not the shared
tree) and edits only the orchestration docs.

The git tree is not the only shared resource. Parallel agents also contend for
RUNTIME state — one `.git` shared across multiple worktrees, booted
simulators/emulators, dev servers (Metro/Vite/etc.), and ports. Before any
build/run/test step in a multi-worktree or multi-sim setup, the agent MUST
re-confirm its branch (the shared `.git` HEAD can move under it) and pin its own
runtime — its own sim/device, dev-server port, and bundler instance — so it
never collides with another agent's. Treat each concrete runtime resource like
the tree: at most one writer at a time. (When agents genuinely run in parallel,
give each its own worktree — `isolation: worktree` — so tree AND branch are
isolated by construction.)

## Token discipline + KPIs

- Plans contain no code; reviews contain no code; the orchestrator carries
  decisions, not artifacts.
- Track every run in the ledger. Budgets are SOFT targets for steward outlier
  analysis, NOT caps. QUALITY OUTRANKS TOKEN SAVINGS — never thin a review,
  invariant check, or the gate to hit a budget; revert any token-saving change
  followed by rising findings or an escaped defect.
- KPIs to track: planner/executor/reviewer cost; review yield (real issues
  surviving the fix); escaped defects; plan-friction count; cycle overhead
  (fix loops per PR). The changelog decides whether a template change stays.

## Persistence / resume (survive rate limits, session death, compaction)

Everything to resume lives in repo + GitHub + a durable memory file — NO prior
session context required:
1. `gh pr list` + `git fetch && git log <main> -5` — live truth for merged/
   open PRs and in-flight branches. A dead agent's PUSHED branch survives and
   is resumable.
2. The backlog **Progress** line — current item + last shipped.
3. The orchestration docs (ledger tail, friction Open, changelog tail) + the
   current spec's `## Execution notes`.
4. Re-dispatch any dead role from its template — dispatches are parameters, so
   reconstruction is mechanical.
Write the program's live state to a persistent memory note too (current item,
held items, user decisions), so a fresh session reconstructs intent, not just
mechanics. WHEN UNATTENDED (user away) and merging deploys to production:
prepare PRs and HOLD merges — do not deploy to prod unsupervised; never mutate
production data without explicit, current consent.

## ANTI-BIAS — non-negotiable (a token-optimized loop drifts to rubber-stamp)

A blind hostile re-review of a "zero-fix-loop" streak found a real blocking
bug the reviewers missed, because: APPROVE is the cheap cycle-ending verdict
while BLOCK fights the cycle-overhead KPI; the one orchestrator authors the
executor brief AND the invariant list AND the sanctioned-delta blessings; and
every role is the same model family reading the same spec. Counter all of it:

1. FREE-HUNT: after the invariant table, the reviewer MUST spend a fixed
   budget hunting a failure mode NOT on the list and report the most plausible
   one even below the confidence bar. The orchestrator-authored checklist
   cannot be the whole review.
2. COMPOSITION EXCEPTION to "trust the merged base": trust unchanged callees
   for INTERNAL correctness, but when a diff introduces or depends on a
   CROSS-PR contract (a sentinel value, a wire param, a helper added in an
   earlier PR of the same feature), RE-READ the callee's relevant lines — the
   bug per-diff review misses is "each diff fine, composition broken." Require
   an integration test at a feature's FINAL slice.
3. SANCTIONED DELTAS CAN STILL BE WRONG: don't flag a blessed delta as
   unauthorized, but DO flag one whose CONSEQUENCES violate an invariant or
   the spec's goal; make the reviewer read the cited decision, not the label.
4. NO SELF-MARKED HOMEWORK: require ≥1 REVIEWER-authored (not executor-
   authored) test per PR, and a runtime SMOKE ORACLE (e.g. Playwright for web;
   a sim/device install + UI assertion for native) — happy path + one
   denied-permission path per feature. Until a runtime oracle exists, label the
   metric "escaped defects (build/unit-detectable only)" — it is 0-known, not
   0-real. When the oracle CANNOT run unattended (a native install needing the
   full build pipeline, a manual OS-settings step), do NOT fake it and do NOT
   block the loop: ship on build/unit green, but append the feature to a single
   running human-verification queue (`docs/orchestration/manual-verification.md`,
   one item + exact repro recipe each). That queue is a FIRST-CLASS run
   deliverable — the morning handoff — not a per-PR footnote. UI
   layout/interaction and native-integration changes are the HIGHEST-escape
   class — build+unit green cannot see an untappable control, an overlapping
   pane, or an unlinked native module — so they ALWAYS get a queue entry with a
   concrete user-facing check; never let "unit-green + APPROVE" stand in for
   "the feature actually works."
5. FRAME DIVERSITY: rotate a hostile-framed reviewer ("assume the author is
   wrong") and periodically a NO-CHECKLIST reviewer (diff + spec only). On a
   schedule, run a BLIND HOSTILE RE-REVIEW of already-merged PRs with zero
   streak context — highest-information, lowest-cost probe of reviewer health.
   Use a different model where available.
6. A LONG ZERO-BLOCK STREAK IS A SMELL, NOT A TROPHY: give review-yield a
   floor; a long zero-yield run triggers a hostile re-review. Don't annotate
   thorough reviews as "pricey"; annotate a cheap review that found nothing on
   a large diff. Make non-blocking findings a first-class output so the
   reviewer can register doubt without the expensive BLOCK path.

## Common mistakes (silent-corruption traps — fully explained in their home sections)

A scanning index of the gotchas that corrupt before they error. Pointer surface
only — the full counter-move lives at the cited section; do NOT re-explain here.

- `git add -A` in the executor → stages the one-ahead planner's untracked next
  spec into the wrong PR. [The loop, Executor]
- Delete a branch before `gh` confirms `state: MERGED` → closes the PR.
  [The loop, Orchestrator merges]
- Reviewer falls back to the local working tree when `gh pr diff` fails →
  reviews another branch's diff. [The loop, Reviewer]
- Dispatching a review agent whose TYPE has no shell → it silently reviews the
  wrong tree. [Dispatch protocol]

## Comms (optional)

A terse "caveman" style (drop articles/filler/hedging; keep technical
substance, code, and error quotes exact; relax for security warnings,
irreversible-action confirmations, and multi-step sequences) cuts tokens
across every report. Encode it into each role template's report section.
