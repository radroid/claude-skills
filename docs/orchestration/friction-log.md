# Friction log

Entry format: `- [role-tag] (date, run) problem — implication`

## Open

- [executor] (2026-07-13, B1s2/PR49) Write tool corrupted two template-literal spaces
  into NUL bytes (0x00), making git treat the .mjs as binary; caught via the "Bin"
  marker in the commit diff-stat, fixed with perl, amended pre-PR — implication:
  executor gate should include a control-byte scan on new files
  (`grep -P '[\x00-\x08]'`); the diff-stat "Bin" marker is the cheap detector.
- [planner] (2026-07-13, B1s2/PR49) spec check-5 phrasing "spot-check one level with
  a jq -cS-independent method" is ambiguous (independent-of-jq vs jq-as-independent
  -recompute) — implication: acceptance checks must name the exact command, not
  describe it.
- [planner] (2026-07-13, A2/PR50) spec check-9 doc-grep was case-sensitive against a
  naturally-capitalized heading — implication: anchor doc greps on verbatim
  error-message strings or use grep -i.
- [steward-candidate] (2026-07-13, A2/PR50) executor contract "Append ## Execution
  notes (PR #n)" is circular — PR number doesn't exist until after the push that must
  contain the notes; cost an extra pin commit — implication: bless the two-commit
  pattern or a "(this PR)" placeholder in executor.md.
- [env-note] (2026-07-13, A2/PR50) kayvee's parent dir has a pre-existing
  .timelapse-worktrees/07c97586 shell (May 26) that runs touch by design; snapshot
  discipline should treat that sibling dir as expected-mutable. Also kayvee's
  .timelapse.yaml is UNTRACKED, not committed — snapshot caught it, no impact.

## Resolved

- [executor] (2026-07-13, B1s1/PR46) isolated worktree starts at MAIN tip, not the
  dispatch-named base branch — executor had to `git reset --hard origin/change-aware-timelapse`
  before starting — implication: every executor dispatch must include the reset
  instruction explicitly or work is built on stale code.
  RESOLVED (2026-07-13, steward/A1): executor.md now mandates
  `git fetch origin && git checkout -b <BRANCH> origin/<BASE>` as first actions.
- [planner] (2026-07-13, B1s1/PR46) acceptance check used unquoted `--include=*.mjs`
  globs that fail under zsh ("no matches found") — implication: spec acceptance
  commands must be shell-safe (quote globs) or explicitly say `bash -c`.
  RESOLVED (2026-07-13, steward/A1): planner.md now requires zsh-safe acceptance
  commands (quoted globs or `bash -c`); unquoted glob is classed a spec defect.
- [planner] (2026-07-13, A1/PR47) spec check-4 grep pattern `YMIN:[0-9.]+` targets
  pre-v8 ffmpeg signalstats logging; ffmpeg 8 needs `,metadata=print` and emits
  `lavfi.signalstats.YMIN=` — implication: specs must pin acceptance commands to the
  installed tool versions (ffmpeg 8.1.1 here).
  RESOLVED (2026-07-13, steward/A1): planner.md now requires probing installed tool
  versions and writing checks against that version's actual output format.
- [executor] (2026-07-13, A1/PR47) SECOND instance of worktree-at-main-HEAD (also hit
  in B1s1) — implication: executor template needs a mandatory
  `git reset --hard origin/<BASE>` first action, not just branch confirmation.
  RESOLVED (2026-07-13, steward/A1): executor.md mandatory fetch+checkout block;
  fix.md gained the same worktree warning with `git fetch origin` before
  `gh pr checkout`.
- [orchestrator] (2026-07-13, PR46 merge attempt) permission classifier denied
  `gh pr merge` — user grant was "open PRs", not "merge PRs"; orchestrator's
  integration-branch merge policy overstepped it — implication: switched to
  stacked-PR mode (see backlog); future runs must confirm merge authority
  explicitly at kickoff.
  RESOLVED (2026-07-13, steward/A1): process fix on record in backlog.md
  STACKED-PR MODE; "confirm merge authority at kickoff" is a canon
  (orchestrated-delivery SKILL.md) change outside the steward's
  docs/orchestration fence — flagged to the orchestrator in the steward report.
- [infra] (2026-07-13, PR46+PR47 reviews) account MONTHLY SPEND LIMIT hit mid-run:
  10/26 review agents died on PR46, 18/26 on PR47; canon fail-closed rule counts
  deaths as refutations, so both verdicts degraded to REVISE regardless of ballot
  content — implication: under infra failure the 25-agent review is structurally
  unusable; reduce fan-out (≤3 refuters × ≤3 claims), retry dead agents, or
  orchestrator-adjudicate from surviving ballots. USER ACTION: raise limit at
  claude.ai/settings/usage.
  RESOLVED (2026-07-13, steward/A1): reviewer.md now documents that infra-killed
  panels yield expected fail-closed verdicts, orchestrator adjudicates from
  surviving ballots, and yield counts real ballots only. Fan-out sizing stays a
  canon/orchestrator decision; USER ACTION (raise spend limit) still outstanding.
- [planner] (2026-07-13, A1/PR47) kayvee demo repo had pre-existing dirty git state
  (modified .gitignore, untracked .timelapse.yaml), making "nothing else modified"
  checks ambiguous — implication: specs with live-repo smoke checks should snapshot
  `git status --porcelain` before the run and diff against it after.
  RESOLVED (2026-07-13, steward/A1): planner.md now requires the before-snapshot /
  after-diff protocol for any spec whose smoke checks touch a live demo repo.
- [orchestrator] (2026-07-13, B1 review dispatch, from token-ledger) wrapper passed
  agent args as a JSON string, script saw undefined — 2 wasted reviewer dispatches
  (~56k tokens) — implication: dispatch wrapper must validate arg shape before
  spawning.
  RESOLVED (2026-07-13, same run): wrapper hardened at dispatch level mid-run (per
  ledger note); recorded here so friction history lives in one place. No template
  change — defect was orchestrator tooling, not a role contract.
