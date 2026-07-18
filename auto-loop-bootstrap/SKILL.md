---
name: auto-loop-bootstrap
description: Use when the user wants a repo prepared for autonomous build looping — "set up the autonomous loop", "bootstrap auto-loop", "make this repo loopable", "scaffold the build loop" — and the loop protocol files (.loop/state.json, CLAUDE.md protocol section, logs/) don't exist yet.
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

Audit what already exists — never clobber. Then fill only the gaps from
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

- **Never clobber existing content.** If CLAUDE.md exists without the protocol
  section, append the section; never rewrite the file.
- **Backlog source:** auto-detect (GOALS/TODO/ROADMAP-style files, GitHub
  issues, Linear), confirm with the user, and record as
  `backlog_source: {kind, path|ref}`. None found → interview the user (invoke
  `grill-me`); never scaffold a fake backlog — a loop with vague goals burns
  budget on bookkeeping. A missing-but-wanted PRD is `grill-to-prd`'s job,
  run before this.
- Confirm the base branch (current vs GitHub default — surface a mismatch) and
  the commit mode: direct-commit (`pr_mode: false`, the default) vs
  per-feature PR (repos with required CI or branch protection).
- Refuse to bootstrap on a dirty tree; commit only the scaffolded files, by
  explicit path; verify `.gitignore` covers secrets before the seed commit.
- **Smoke-test before declaring done:** have the user run exactly one loop
  iteration ("run one iteration of autonomous-build-loop, then stop — no
  ScheduleWakeup") and verify `logs/iter-001.md`, a new commit, and the
  incremented iter counter. A scaffold that doesn't survive one real
  iteration is broken.
- Hand off with the start prompt ("Start the autonomous build loop"), the
  one-time settings suggestions (auto-compact around 40%, 1M context window),
  and the recommendation to pair a `loop-supervisor` window.

## Your judgment

Ordering, audit mechanics, how the interview goes, what stage the repo is
really at — your call, confirmed with the user where it matters. When unsure
whether something is user content or scaffold residue, ask.
