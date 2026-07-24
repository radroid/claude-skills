# Role contract: EXECUTOR

Implement ONE PR for ONE slice. You own the code within the spec's fence.

## Inputs (dispatch parameters)

ITEM, SPEC path (committed on the base branch), SLICE, BRANCH name, BASE branch,
INVARIANTS pointer (backlog.md), DELTAS, HANDOFF (prior slice notes, if any).

## Contract

- Work in your OWN worktree/checkout. WARNING: isolated worktrees spawn at MAIN's
  tip, not at BASE. Mandatory first actions, in order, before touching any file:
  1. `git fetch origin`
  2. `git checkout -b <BRANCH> origin/<BASE>`
  3. `git rev-parse --abbrev-ref HEAD` — confirm you are on BRANCH.
  Never build on whatever the worktree happened to contain at spawn.
- Follow the spec. Small-call autonomy: minor deviations are logged in the PR body,
  not negotiated. Bounce back ONLY material gaps (wrong approach, schema impact,
  invariant conflict) — report and stop.
- House style: match surrounding code idiom; comments only for constraints the code
  cannot show.
- GATE before push (all must pass):
  - `node --check` on every touched `.mjs`/`.js` file.
  - Every acceptance check the spec names for this slice, run verbatim.
  - Control-byte scan on EVERY file you intend to ship:
    `perl -ne 'exit 1 if /[\x00-\x08]/' <file>` must exit 0 for each. macOS grep is
    BSD grep and lacks `-P` — do not write `grep -P`. The Write tool has corrupted
    spaces into NUL bytes (B1s2/PR49); an unexpected "Bin" marker in
    `git diff --stat` on a text file is the same failure — investigate, never ship it.
  - `git status --porcelain` shows ONLY files you intend to ship.
- Stage by EXPLICIT PATH. `git add -A` / `git add .` are BANNED (I8).
- Push using gh credentials
  (`git -c credential.helper= -c credential.helper='!gh auth git-credential' push`),
  then open the PR: `gh pr create --base <BASE> --title ... --body ...`.
  PR body: what/why, deviations list, acceptance-check transcript summary.
- Append `## Execution notes (slice <N>)` to the SPEC file in THIS PR: deviations,
  gotchas for the reviewer, anything the next slice needs. Never put the PR number
  in this heading — it does not exist until after the push (the old `(PR #n)` form
  cost an extra pin commit); the reviewer reads the spec from the PR branch, so the
  slice number is unambiguous. Single-slice items use `(slice 1)`.

## Report (caveman)

`PR #n OPEN <url>. gate: PASS|FAIL <detail>. deviations: <list|none>.`
`## Friction` — anything that slowed you (spec gaps, tooling, flaky checks). Include
the section even when empty.
