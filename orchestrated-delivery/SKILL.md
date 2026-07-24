---
name: orchestrated-delivery
description: Use when shipping a multi-PR backlog with a team of subagents — the user wants PR-sized slices landed by planner/executor/reviewer/fix/steward roles, mentions "orchestrated delivery", a token ledger, a friction log, or resuming a multi-PR run from a backlog Progress line.
---

# Orchestrated delivery

## Goal

Land a backlog of PR-sized slices through role subagents while you — the
orchestrator — carry only decisions, sequencing, and user conversation. Plans
stay code-free and repo-resident so they never go stale; every handoff lives in
a repo file the next agent reads itself; reviews are adversarial enough that a
rubber-stamp streak cannot survive. Done means: backlog drained, every merge
APPROVE-gated, ledger and friction log current, steward run after every item.

## Where to start

- **Fresh session only.** Your context is for decisions, not artifacts — don't
  invoke this mid-implementation-session; `/clear` first and re-enter through
  the persistence docs.
- This skill runs at maximum effort: confirm the session is on
  `/effort ultracode` (only the user can set it — ask in one line if not), and
  pipeline substantive steps through the Workflow runner or verified role
  subagents rather than hand-running them.
- New repo → create the scaffolding below, learn the gate commands
  (build/test/lint) and whether merging deploys to prod, then decompose the
  backlog into items and PR-sized slices.
- Resuming → recover live state from `gh pr list`, `git log`, the backlog
  **Progress** line, and the orchestration docs. Everything needed to resume is
  in the repo and GitHub, never in session memory.

## Contracts (what other agents and future sessions depend on)

Scaffolding — the system's whole memory — lives in `docs/orchestration/`:
role templates (`prompts/{planner,executor,reviewer,fix,steward}.md`),
`token-ledger.md`, `friction-log.md` (`## Open` / `## Resolved`),
`prompt-changelog.md` (the single version record), plus a backlog doc with a
one-line **Progress** marker and per-item dependency IDs (one numbering scheme
— never mix item IDs with PR or slice numbers).

The loop per item: **planner → executor → reviewer → fix → merge → steward**
(planner runs one item ahead).

- Plans and reviews contain **no code** — prose, `file:line` anchors, a
  mandatory edge-case section. Reviewer verdicts end with exactly one line of
  the unified grammar: `VERDICT: APPROVE` · `VERDICT: REVISE — <n> issues` ·
  `VERDICT: BLOCK — <n> issues`. APPROVE → merge; REVISE → fix executor;
  BLOCK → escalate to the orchestrator/human, never auto-fix.
- The reviewer reads the PR diff via `gh pr diff <n> --repo <slug>` — never
  the local tree (it may hold another branch; stop loudly if `gh` fails).
- Executors stage by explicit path — never `git add -A` (the one-ahead
  planner's untracked spec sits in the shared tree) — and append
  `## Execution notes (PR #n)` to the spec in their own PR.
- Merge on APPROVE only; confirm `state: MERGED` before deleting any branch;
  fast-forward local main after a squash lands remotely.
- **The steward is a hard gate.** It runs after every item, in its own git
  worktree, tunes only the orchestration docs, and leaves a dated changelog
  trace even when it changes nothing. Do not dispatch the next item's roles
  until that trace exists — deferred stewardship slides to end-of-backlog and
  never compounds.
- One tree-mutator per path at a time; genuinely-parallel agents get their own
  worktrees and their own runtime (ports, simulators, dev servers). Prune
  merged worktrees before disk runs out.
- Unattended while merges deploy to prod → prepare PRs and HOLD merges; never
  touch prod data without current human consent.

Mechanized gates live in `assets/review-and-verify.workflow.js` (review +
anti-bias) and `assets/steward.workflow.js`, built on the `workflow-runtime`
canon (paste the preamble, never import; typed verdicts; fail-closed roll-ups;
typed `AUDIT_LEDGER_ENTRY` records the steward reads). Read that skill before
editing either script. No Workflow runner in the harness → run the same roles
as subagents and verify each yourself; the grammar and gates are identical.

## Anti-bias (why reviews stay hostile)

APPROVE is the cheap cycle-ending verdict and every role shares a model family,
so drift toward rubber-stamping is the default failure mode. Counter it: the
reviewer must hunt beyond the orchestrator-authored checklist; re-read callees
when a diff depends on a cross-PR contract (per-diff review misses "each diff
fine, composition broken"); require ≥1 reviewer-authored test per PR and a
runtime smoke oracle — UI or native changes that can't be verified unattended
go to a human-verification queue
(`docs/orchestration/manual-verification.md`) rather than being faked or
blocking the loop; rotate hostile and no-checklist reviewer frames; and treat
a long zero-block streak as a smell that triggers a blind hostile re-review of
already-merged PRs.

## Your judgment

Everything else — dispatch wording, batch sizes, parallelism, sequencing, what
to read when — is yours to decide from the state on disk. Token cost never
justifies thinning a review or a gate: quality outranks token savings; the
ledger exists so the steward can spot outliers, not to cap the work.
