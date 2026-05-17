# claude-skills — agent guidance

Conventions for Claude Code (and any other coding agent) working in this repo.

## GitHub access — always via `gh`

Use the `gh` CLI for everything GitHub: pushing branches, opening PRs, viewing
issues, checking CI, fetching review comments, anything. Don't fall back to
raw `git push` against the HTTPS remote — that path uses a token whose scope
isn't guaranteed to cover this repo and tends to 403. `gh` uses its own
authenticated session, which is the one the user has actually granted.

In practice:

- Push a new branch: `gh repo sync` if the branch tracks upstream, otherwise
  `gh pr create` (which prompts to push the branch as part of opening the PR).
- Open a PR: `gh pr create --title ... --body ...` via heredoc.
- Inspect: `gh pr view`, `gh pr checks`, `gh run list`, `gh issue list`, etc.

If `gh` itself fails (auth or scope), stop and surface the failure to the user
rather than reaching for raw git operations.
