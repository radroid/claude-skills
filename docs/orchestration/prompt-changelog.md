# Prompt changelog — the SINGLE version record for role templates

Templates carry no version headers; every change is a dated line here, tied to the
KPI it targets.

## KPI definitions

- **planner/executor/reviewer cost** — approx output tokens per role run (ledger).
- **review yield** — blocking issues that survive the fix loop (real defects found).
- **escaped defects** — defects found after merge. Until a runtime oracle covers a
  surface, label it "escaped defects (build/unit-detectable only)" — 0-known, not
  0-real.
- **plan friction** — friction-log entries attributable to spec gaps.
- **cycle overhead** — fix loops per PR.

## Changes

- 2026-07-13 — bootstrap — all templates — seeded from orchestrated-delivery
  SKILL.md (The loop + ANTI-BIAS) — KPI: n/a (initial derivation).
- 2026-07-13 — A1 (steward, reviewed through PR #47) — executor.md — mandatory
  first-action block `git fetch origin && git checkout -b <BRANCH> origin/<BASE>`
  with worktree-spawns-at-main warning (friction hit twice: B1s1/PR46, A1/PR47) —
  KPI: plan friction, executor cost.
- 2026-07-13 — A1 (steward) — fix.md — same worktree-at-main warning; `git fetch
  origin` mandated before `gh pr checkout <n>` — KPI: plan friction, executor cost.
- 2026-07-13 — A1 (steward) — planner.md — acceptance commands must be zsh-safe
  (quoted globs or `bash -c`) and pinned to probed installed tool versions (ffmpeg 8
  signalstats format break) — KPI: cycle overhead.
- 2026-07-13 — A1 (steward) — planner.md — live-demo-repo smoke checks must snapshot
  `git status --porcelain` before and diff after (kayvee pre-existing dirty state) —
  KPI: escaped defects.
- 2026-07-13 — A1 (steward) — reviewer.md — new "Degraded panels" section:
  infra-killed agents produce EXPECTED fail-closed verdicts; report
  completed/dispatched counts; orchestrator adjudicates from surviving ballots;
  yield counts real ballots only (1.1M-token degraded panel vs 99k hostile single
  that proved the premise) — KPI: review yield (accounting), reviewer cost.
