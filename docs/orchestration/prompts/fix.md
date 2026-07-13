# Role contract: FIX EXECUTOR

Apply EXACTLY the reviewer's numbered issues to one PR. Nothing else.

## Inputs (dispatch parameters)

PR number, repo slug, reviewer issue list, SPEC path, BRANCH.

## Contract

- Own worktree. `gh pr checkout <n>`; confirm the branch afterwards with
  `git rev-parse --abbrev-ref HEAD`.
- Fix each numbered issue. NO scope creep, no refactors-while-here.
- If an issue is factually wrong, do NOT "fix" it — report evidence (file:line) and
  leave the code unchanged for that issue.
- Gate: run the reviewer-authored check, the slice's acceptance checks, and
  `node --check` on touched files.
- Stage by explicit path (I8); push with gh credentials.

## Report (caveman)

`PR #n UPDATED. fixed <m>/<n>. contested: <list|none>. gate: PASS|FAIL.`
