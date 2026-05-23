# Feature-PR mode

One PR per feature = one vertical slice (DB + backend + frontend together). Replaces the
commit-straight-to-one-branch model. Each feature is branched, TDD-built, verified, reviewed, and
auto-merged on its own.

## When it applies

**Opt-in mode.** The bootstrap default is `pr_mode: false` (direct-commit to the active branch). This file applies only when the user explicitly enabled PR mode — typically for repos with required CI checks, multiple reviewers, or branch protection rules.

Gated by `.loop/state.json`:

```jsonc
{ "pr_mode": true, "pr_size_policy": "fat", "base_branch": "main" }   // fat (S3) | scoped (S4)
```

- `pr_mode: false` or no `.loop/state.json` (**default**) → direct-commit to the active branch per `per-iteration-checklist.md` steps 10–11. Nothing below applies.
- `pr_mode: true` (opt-in) → this file replaces steps 10–11 of the per-iteration checklist and Phase 5 of `fat-iter-mode.md`.
- `base_branch` — the integration branch PRs target. Read from `.loop/state.json`; if absent, fall back to `main`. Below, `$BASE` refers to this branch.

`pr_size_policy` is the PR-size contract, not a feature cap:
- **`fat`** (S3 default) — lots to build, repo is young; a PR may carry a whole multi-file slice.
  A fat-iter's 3–4 features still become 3–4 *separate* PRs — fat describes each PR's internal
  size, not bundling.
- **`scoped`** (S4, set in M4) — repo has grown; PRs must be narrow and single-purpose.

## Prerequisites (one-time repo setup)

- **Merge path depends on branch protection** (step 9):
  - **No branch protection rules** (typical for testbeds / young repos) → the loop uses plain
    `gh pr merge --squash`. Nothing to set up.
  - **`gh pr merge --auto`** (queue-until-checks-pass) needs **both** `gh repo edit <owner/repo>
    --enable-auto-merge` *and* branch protection rules on the target branch — without protection
    rules it errors `Protected branch rules not configured for this branch`. Only set this up for
    repos that actually run required CI checks.
- **CodeRabbit** (the pre-push reviewer, step 5) needs a **public** repo + an authenticated
  `coderabbit` CLI. Private repo → use the fallback reviewer instead.

## Per-feature flow

For each feature in the iter (one feature, or each feature of a fat-iter):

1. **Branch off fresh `$BASE`.** `git fetch origin $BASE && git switch $BASE && git pull --ff-only && git switch -c loop/iter-NNN-<feature-slug>`. One branch per
   feature — never share a branch across features (defeats independent review + merge).
2. **TDD — non-visual behaviour.** Failing test first, then minimal code, then refactor. Invoke
   `tdd` / `superpowers:test-driven-development`. The Iron Law holds: no production code without a
   failing test first. This is the loop's free pass/fail signal — use it for everything testable.
3. **Visual behaviour → human, not TDD.** UI quality has no automated signal. Screenshot via
   chrome-MCP + the forced critique pass (`fat-iter-mode.md` Phase 3). A genuine
   accept/reject visual decision is a **human checkpoint** — surface it (M-Tel Telegram bot once
   it exists; until then, flag it in the iter log + `logs/blocks.md` and proceed with the
   non-blocking remainder).
4. **Verify before claiming done.** Invoke `superpowers:verification-before-completion`: run the
   real commands (test suite, `tsc`, contract check), read the output, confirm green. No "should
   pass" — evidence only.
5. **Automated review — pre-push.** The `coderabbit` CLI reviews the *local committed diff* — it
   does **not** need a PR to exist. Run it now, before pushing, so the branch is review-clean by
   the time anyone sees the PR. Findings are always *suggestions to evaluate*, not orders
   (`superpowers:receiving-code-review`).
   - **CodeRabbit** — requires the repo be **public** *and* the `coderabbit` CLI authenticated
     (it **cannot review private repos**). When both hold: run `coderabbit:code-review` **scoped to
     the committed diff** — `--type committed --base $BASE`. **Always scope it.** An unscoped review
     also ingests every uncommitted file in the working tree (e.g. sibling features' files carried
     along on the branch in fat-iter mode) and can hang for tens of minutes with no output; a
     scoped review of one feature's diff completes in ~1–2 min. Resolve findings locally and
     amend/commit before pushing.
   - **Private repo, or CodeRabbit unavailable** → fall back to Anthropic's `review` skill, or
     `superpowers:requesting-code-review` against the branch diff. Same discipline.
   - **Stop rule — don't chase an escalating review.** Resolve the **critical + warning** findings
     from the *first* review pass. Re-review **once** to confirm those are cleared. Any *new-scope*
     findings the re-review surfaces (a reviewer like CodeRabbit will keep proposing more —
     input validation, extra edge cases, defensive guards) are evaluated under YAGNI: apply them
     only if genuinely warranted for this code's contract, otherwise **decline with a one-line
     reason logged to `logs/blocks.md`** and move on. Two passes is the cap — an infinite
     review→fix→review loop is the anti-pattern.
6. **Push the branch.** `git push -u origin loop/iter-NNN-<feature-slug>`.
7. **Open the PR.** `gh pr create --base $BASE` — title `iter NNN: <feature>`, body lists the slice
   (files, contract, tests) and links the scoping `plan/<feature>.md`. On a public repo,
   CodeRabbit's GitHub app also auto-reviews the PR — a visible public audit trail on top of the
   pre-push CLI pass. It should be clean since step 5 already ran; if it flags something new,
   resolve via `coderabbit:autofix` under the same stop rule.
8. **Super-reviewer.** Dispatch the fresh-context reviewer (`super-reviewer.md`; for M1, a Class A
   peer-review sub-agent is the floor) against the PR diff + scoping plan — it is the floor and is
   never skipped. Verdict → `logs/blocks.md` regardless of outcome.
9. **Merge decision:**
   - **APPROVE + green** → merge the PR. Step 5's pre-push review already ran and step 8's
     super-reviewer APPROVED, so the PR is merge-ready.
     - **No branch protection** (testbeds / young repos) → plain `gh pr merge --squash --delete-branch`.
       This is the loop's default. Do **not** reach for `--auto` here — it errors
       `Protected branch rules not configured for this branch` because it has nothing to queue against.
     - **Branch protection + required CI checks** → `gh pr merge --squash --auto --delete-branch`;
       `--auto` queues the merge until the required checks pass (needs repo auto-merge enabled —
       see Prerequisites).
   - **`request_changes`** → fix on the same branch this iter or the next; re-review; do not
     leave half-reviewed PRs merged.
   - **`block`** → log to `logs/blocks.md`, leave the PR open, re-queue the feature in `GOALS.md`,
     move on. The loop never halts.

## Interaction with fat-iter mode

`fat-iter-mode.md` is unchanged through Phase 4 (scoping, parallel dispatch, integration, peer
review). Phase 5 closeout changes under `pr_mode`:

- Each feature lands on **its own branch + PR**, not one combined `iter NNN` commit.
- The Class A peer-review sub-agent (fat-iter Phase 4) still runs once over the integrated set for
  cross-feature coherence — *then* each feature's PR also gets the per-PR super-reviewer (step 8).
  The fat-iter reviewer catches collisions; the per-PR reviewer gates each merge.
- Disjoint file allowlists (the fat-iter hard rule) now also guarantee **non-conflicting
  branches** — features that share no files merge cleanly in any order.
- The iter log's "Features landed" bullet lists the merged PR numbers.

## Branch & merge hygiene

- Branch name: `loop/iter-NNN-<feature-slug>` — greppable, ties the branch to its iter + feature.
- Always branch off freshly-pulled `$BASE`. After a merge, the next feature re-branches off the new `$BASE` so it builds on what just landed.
- `--squash` keeps `$BASE` history one-commit-per-feature — the merged-PR list is the audit trail.
- Never force-push a `loop/*` branch that has an open PR under review.
- Stale `loop/*` branches (PR merged or closed) are deleted by `gh pr merge --delete-branch`.
