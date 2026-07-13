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

## Resolved
