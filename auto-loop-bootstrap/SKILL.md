---
name: auto-loop-bootstrap
description: "Make a repo loop-ready so autonomous-build-loop can take over: protocol files, backlog source, seed commit, smoke test. Use when the repo has no `.loop/state.json` yet."
---

# Auto loop bootstrap

## Goal

Leave the repo loop-ready: the user invokes `autonomous-build-loop` and walks
away. Exit state — `.loop/state.json` at `"stage": "S3"` with `pr_mode`,
`pr_size_policy`, `base_branch`, and `backlog_source` recorded; a CLAUDE.md
autonomous-build-loop protocol section; `logs/latest.md` + `logs/blocks.md`
stubs; a backlog source with ≥3 actionable items; one committed seed
(`iter 000: bootstrap autonomous build loop`); and one smoke-tested iteration.

## Where to start

Read `.loop/state.json` first — Contracts settle whether this skill runs at
all. Then audit what already exists — never clobber. Then fill only the gaps from
`assets/templates/` (substituting placeholders), wire `.gitignore`
(`/.loop/claims/` — `state.json` itself IS committed), and write a baseline
`.claude/settings.local.json` denylist for secrets and dangerous patterns
(skeleton: `references/permissions-template.md`), plus any sensitive paths the
user names. The file-backlog format the loop expects is
`references/backlog-format.md`.

**Greenfield handoff:** if `.loop/state.json` says `"stage": "S2"`, or
`docs/PRD.md` plus a real (non-stub) `ARCHITECTURE.md` exist, `idea-to-loop`
already produced the docs — skip backlog discovery, keep its
GOALS/ARCHITECTURE/PLAN untouched, and rewrite state.json S2 → S3 with
`iter: 0`. That rewrite is the atomic handoff.

## Contracts

- **`.loop/state.json` settles whether this skill runs at all — its `stage`
  field is the whole test.** No corroborating `logs/`, CLAUDE.md protocol
  section, backlog, or commit history is needed, and their absence changes
  nothing. `"S3"` or later: the repo is bootstrapped — report that it is
  loop-ready, invoke `autonomous-build-loop` via the Skill tool, and scaffold
  nothing. `"S0"` or `"S1"`: `idea-to-loop` owns the repo — hand back to it.
  `"S2"`: run the greenfield handoff above, the one case where this skill
  continues on an existing state file. No file at all: bootstrap, which is what
  the rest of this skill describes.
- **Never clobber existing content.** If CLAUDE.md exists without the protocol
  section, append the section; never rewrite the file.
- **Backlog source:** auto-detect (GOALS/TODO/ROADMAP-style files, GitHub
  issues, Linear), confirm with the user, and record as
  `backlog_source: {kind, path|ref}`. None found → interview the user (invoke
  `grilling`; if `grilling` is not installed, run the interview inline — ask
  what "shipped" looks like, then push on each answer until it names a concrete
  verifiable change, and write the answers up as a `GOALS.md` with ≥3 items);
  never scaffold a fake backlog — a loop with vague goals burns budget on
  bookkeeping. A missing-but-wanted PRD is `grill-to-prd`'s job, run before
  this.
- Confirm the base branch (current vs GitHub default — surface a mismatch) and
  the commit mode: direct-commit (`pr_mode: false`, the default) vs
  per-feature PR (repos with required CI or branch protection).
- Bootstrap only from a clean tree; commit only the scaffolded files, by
  explicit path; verify `.gitignore` covers secrets before the seed commit.
- **Smoke-test before declaring done:** have the user run exactly one loop
  iteration ("run exactly one iteration of autonomous-build-loop, then stop and
  report — skip `ScheduleWakeup`") and verify `logs/iter-001.md`, a new commit,
  and the incremented iter counter. One real iteration is the only evidence
  the scaffold works.
- Hand off with the start prompt ("Start the autonomous build loop"), the
  one-time settings suggestions (auto-compact around 40%, 1M context window),
  and the recommendation to open `/loop-supervisor` in a second window.

## Your judgment

Ordering, audit mechanics, how the interview goes, and what a repo needs
*within* a bootstrap — your call, confirmed with the user where it matters.
Whether the repo is bootstrapped at all is settled by `.loop/state.json`
(Contracts). When unsure whether something is user content or scaffold
residue, ask.
