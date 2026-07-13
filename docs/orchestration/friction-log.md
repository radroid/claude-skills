# Friction log

Entry format: `- [role-tag] (date, run) problem — implication`

## Open

- [executor] (2026-07-13, B1s1/PR46) isolated worktree starts at MAIN tip, not the
  dispatch-named base branch — executor had to `git reset --hard origin/change-aware-timelapse`
  before starting — implication: every executor dispatch must include the reset
  instruction explicitly or work is built on stale code.
- [planner] (2026-07-13, B1s1/PR46) acceptance check used unquoted `--include=*.mjs`
  globs that fail under zsh ("no matches found") — implication: spec acceptance
  commands must be shell-safe (quote globs) or explicitly say `bash -c`.
- [planner] (2026-07-13, A1/PR47) spec check-4 grep pattern `YMIN:[0-9.]+` targets
  pre-v8 ffmpeg signalstats logging; ffmpeg 8 needs `,metadata=print` and emits
  `lavfi.signalstats.YMIN=` — implication: specs must pin acceptance commands to the
  installed tool versions (ffmpeg 8.1.1 here).
- [executor] (2026-07-13, A1/PR47) SECOND instance of worktree-at-main-HEAD (also hit
  in B1s1) — implication: executor template needs a mandatory
  `git reset --hard origin/<BASE>` first action, not just branch confirmation.
- [infra] (2026-07-13, PR46+PR47 reviews) account MONTHLY SPEND LIMIT hit mid-run:
  10/26 review agents died on PR46, 18/26 on PR47; canon fail-closed rule counts
  deaths as refutations, so both verdicts degraded to REVISE regardless of ballot
  content — implication: under infra failure the 25-agent review is structurally
  unusable; reduce fan-out (≤3 refuters × ≤3 claims), retry dead agents, or
  orchestrator-adjudicate from surviving ballots. USER ACTION: raise limit at
  claude.ai/settings/usage.
- [planner] (2026-07-13, A1/PR47) kayvee demo repo had pre-existing dirty git state
  (modified .gitignore, untracked .timelapse.yaml), making "nothing else modified"
  checks ambiguous — implication: specs with live-repo smoke checks should snapshot
  `git status --porcelain` before the run and diff against it after.

## Resolved
