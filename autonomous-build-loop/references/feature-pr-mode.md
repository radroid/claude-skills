# Feature-PR mode

One PR per feature = one vertical slice (DB + backend + frontend together). Replaces the
commit-straight-to-one-branch model. Each feature is branched, TDD-built, verified, reviewed, and
auto-merged on its own.

## When it applies

Gated by `.loop/state.json`:

```jsonc
{ "pr_mode": true, "pr_size_policy": "fat" }   // fat (S3) | scoped (S4)
```

- `pr_mode: false` or no `.loop/state.json` → **legacy mode**: commit to the active branch per
  `per-iteration-checklist.md` steps 10–11. Nothing below applies.
- `pr_mode: true` → this file replaces steps 10–11 of the per-iteration checklist and Phase 5 of
  `fat-iter-mode.md`.

`pr_size_policy` is the PR-size contract, not a feature cap:
- **`fat`** (S3 default) — lots to build, repo is young; a PR may carry a whole multi-file slice.
  A fat-iter's 3–4 features still become 3–4 *separate* PRs — fat describes each PR's internal
  size, not bundling.
- **`scoped`** (S4, set in M4) — repo has grown; PRs must be narrow and single-purpose.

## Prerequisites (one-time repo setup)

- **Auto-merge must be enabled on the GitHub repo:** `gh repo edit <owner/repo> --enable-auto-merge`.
  Without it, step 9's `gh pr merge --auto` fails with
  `Auto merge is not allowed for this repository`. It is **off by default** on new repos — enable
  it once when the repo is set up for `pr_mode: true`.
- **CodeRabbit** (optional reviewer, step 7) needs a **public** repo + an authenticated
  `coderabbit` CLI. Private repo → use the fallback reviewer instead.

## Per-feature flow

For each feature in the iter (one feature, or each feature of a fat-iter):

1. **Branch off fresh `main`.** `git switch -c loop/iter-NNN-<feature-slug>`. One branch per
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
5. **Push the branch.** `git push -u origin loop/iter-NNN-<feature-slug>`.
6. **Open the PR.** `gh pr create` — title `iter NNN: <feature>`, body lists the slice
   (files, contract, tests) and links the scoping `plan/<feature>.md`.
7. **Automated PR review.** Pick the reviewer by what is available — findings are always
   *suggestions to evaluate*, not orders (`superpowers:receiving-code-review`).
   - **CodeRabbit** — requires the repo be **public** *and* the `coderabbit` CLI authenticated.
     CodeRabbit **cannot review private repos.** When both hold: run `coderabbit:code-review`
     **scoped to the feature's committed diff** — `--type committed --base main` — then resolve
     threads via `coderabbit:autofix`. **Always scope it.** An unscoped review also ingests every
     uncommitted file in the working tree (e.g. sibling features' files carried along on the
     branch in fat-iter mode) and can hang for tens of minutes with no output. A scoped review of
     one feature's diff completes in ~1–2 min.
   - **Private repo, or CodeRabbit unavailable** → fall back to Anthropic's `review` skill, or
     `superpowers:requesting-code-review` against the PR diff. Same discipline as above.
   - Whichever path runs, the per-PR **super-reviewer** (step 8) still runs — it is the floor and
     is never skipped.
   - **Stop rule — don't chase an escalating review.** Resolve the **critical + warning** findings
     from the *first* review pass. Re-review **once** to confirm those are cleared. Any *new-scope*
     findings the re-review surfaces (a reviewer like CodeRabbit will keep proposing more —
     input validation, extra edge cases, defensive guards) are evaluated under YAGNI: apply them
     only if genuinely warranted for this code's contract, otherwise **decline with a one-line
     reason logged to `logs/blocks.md`** and move on. Do not loop review→fix→review indefinitely;
     two passes is the cap. A genuinely noisy PR may carry its remaining findings into a
     follow-up iter — that is expected, an infinite review loop is not.
8. **Super-reviewer.** Dispatch the fresh-context reviewer (`super-reviewer.md`; for M1, a Class A
   peer-review sub-agent is the floor) against the PR diff + scoping plan. Verdict →
   `logs/blocks.md` regardless of outcome.
9. **Merge decision:**
   - **APPROVE + green checks** → `gh pr merge --squash --auto` (requires repo auto-merge enabled —
     see Prerequisites). `--auto` queues the merge until required checks pass; on a repo with **no
     required status checks** it merges immediately. If auto-merge cannot be enabled on the repo,
     the manual equivalent after APPROVE + locally-verified green is plain `gh pr merge --squash`.
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
- Always branch off freshly-pulled `main`. After a merge, the next feature re-branches off the
  new `main` so it builds on what just landed.
- `--squash` keeps `main` history one-commit-per-feature — the merged-PR list is the audit trail.
- Never force-push a `loop/*` branch that has an open PR under review.
- Stale `loop/*` branches (PR merged or closed) are deleted by `gh pr merge --delete-branch` or a
  closeout sweep — don't let them accumulate.
