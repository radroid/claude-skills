# M1 — Feature-PR Mode Proof (Retrospective)

**Window:** 2026-05-14 15:37 EDT → 2026-05-15 ~16:40 EDT · **Wall-clock:** ~25 hours · **Status:** complete

See [`ROADMAP.md`](../ROADMAP.md) M1, [`m0-vetting.md`](./m0-vetting.md) for the preceding dependency gate.

## Headline

M1 set out to prove the branch + TDD + review + auto-merge spine on a real app. It held for **33
iterations / 67 merged PRs / 6 phases shipped + Phase 7 planned**, on a stack deliberately unlike
ARK (Vite + React 19 + TypeScript + IndexedDB). The proof goal — *"a loop branches + TDD + PRs +
CodeRabbit + auto-merges per feature"* — is met without exception.

## Testbed

`/Users/rajdholakia/Documents/loop-lab/t1-expense-tracker/` ([radroid/t1-expense-tracker](https://github.com/radroid/t1-expense-tracker), public for CodeRabbit access).
Bootstrapped via `auto-loop-bootstrap`; driven by in-session `/loop` + `ScheduleWakeup` (no
external driver). `.claude/commands/loop.md` step 0 invokes the symlinked
`autonomous-build-loop` skill — testbed consumes skill source live, no copy step.

## Final metrics

| Metric | Value |
|---|---|
| Iterations | 33 (30 implementation, 3 planning/bookkeeping) |
| Merged feature PRs | 67 |
| Phases shipped | 6 (P1 → P6) + Phase 7 opened/planned |
| Tests | 628 passing (from 0 at bootstrap) |
| DB schema migrations | v1 → v5, all with migration tests |
| Phase-boundary arch passes | 6 executed via the `improve-codebase-architecture` Skill tool (P1→2, P2→3, P3→4, P4→5, P5→6, P6→7) |
| `blocks.md` entries | 38 (peer reviews, arch passes, drift logs — no silent halts) |
| Bundle | 232 kB main / 71 kB gzip; trimmed −11 kB via `React.lazy` split in P6.D |
| Process-fix streak | 19+ consecutive iters of explicit-path staging (no `git add -A`) |

## What was proven

1. **Per-feature PR loop holds.** Every feature: branch off fresh `main` → failing test first →
   implement → `superpowers:verification-before-completion` → `coderabbit review --agent --base
   main -t committed` pre-push → push → `gh pr create` → CodeRabbit post-push review +
   Class A super-reviewer → `gh pr merge --squash --delete-branch` on APPROVE + green.
   `main` advanced linearly; zero branch drift.
2. **Fat-iter parallel dispatch works.** Disjoint file-allowlist Class B sub-agents shipped 2–4
   features per iter without integration failures. Hard cap of 4 held; never breached.
3. **Phase-boundary arch pass is non-negotiable.** Five P→P+1 boundaries, five `improve-codebase-
   architecture` Skill tool invocations, all logged with `**Source:** arch-pass`. Candidate
   refactors surfaced (generic `useStoredCollection<T,TInput,K>`, `makeStore<T,K>` factory,
   `expenseVisibility` pipeline, `downloadFile` seam, file-picker split) drained over subsequent
   iters as TD items — same loop machinery, same review gate.
4. **Continuous-loop semantics hold.** No semantic halts. Blocks (CodeRabbit hang on iter-001,
   transient sub-agent disagreements) routed to `blocks.md` and the loop picked the next
   non-conflicting backlog item.
5. **Tiered read manifest is stable under cold-boot.** Per-iter cache-creation cost did not
   climb across 33 iters; `logs/latest.md` stayed under the 30-line cap. Auto-compaction
   (~50 % of the 1 M context, post-PR #6) carried the loop across compaction boundaries with
   zero handoff loss.
6. **CodeRabbit pre-push gate is real.** Pre-push scoped review (`--type committed --base main`)
   catches issues before push, reducing post-push review churn. The `--type committed --base
   main` scope is load-bearing — unscoped runs hang.

## Skill changes landed during M1

Five PRs against `claude-skills` from observed friction:

- **PR #5** — `feature-pr-mode`: correct the merge command (plain `gh pr merge --squash
  --delete-branch`, not `--auto`; `radroid/*` repos have no branch protection).
- **PR #6** — trust auto-compaction. Dropped token-runway management across `SKILL.md`,
  `per-iteration-checklist.md`, `continuous-loop.md`, `fat-iter-mode.md`, `log-hygiene.md`.
  Loop now scopes by work type only, not by context budget.
- **PR #7** — README: 4-step "run your own build loop" quick start (bootstrap → public GitHub
  → `/loop` interactive → optional unattended `claude -p`).
- **PR #8** — principle 10: *scaffolded defaults are not safe defaults*. Iter-1 of every new
  project audits framework-generated config (tsconfig strict flags, persistence-layer
  lifecycle, parse-boundary validation) before building features. Closes the type-rigor and
  bug/smell-surface gaps surfaced by the mid-M1 multi-agent audit.
- **PR #9** *(open)* — `archive-loop-scaffolding`: new skill for non-destructive teardown of
  auto-loop scaffolding when a repo graduates out of the loop.

## Multi-agent audit (mid-M1)

Two-agent (CodeRabbit reviewer + general-purpose) parallel audit of the testbed code +
iter logs:

| Dimension | Score |
|---|---|
| Code quality + consistency | 4.2 / 5 |
| Build process discipline (iter logs, handoff, review cadence) | 4.5 / 5 |
| Architectural coherence | 4.3 / 5 |
| Type rigor | 3.0 / 5 *(addressed by PR #8)* |
| Bug / smell surface | 3.5 / 5 *(addressed by PR #8)* |

**Versus traditional senior-dev plan-build cycle:** the loop matches a careful senior dev on
every individual behavior (TDD, review, arch passes, decision logging) and **exceeds** them
on **uniformity** — discipline at iter-28 is indistinguishable from discipline at iter-1.
Human cadence sags with fatigue; the loop's does not.

**Senior-dev equivalent estimate:** 1–2 weeks of focused solo work (40–80 h) for the same
scope at the same rigor level. Loop did it in ~25 h wall-clock, ~0 h of human time.

## Known limitations carried into M2

- **Front-end UI quality.** No component library (shadcn/Radix/etc.). Look is bare; UX is
  functional. User-acknowledged-acceptable for M1 (back-end + test rigor was the proof goal).
  Slot for **M2 S1 Tech Stack Selection** auto-research: surface component-library options
  with rationale at stack-pick time.
- **Visual checkpoint is still manual.** No Telegram (or other) channel for screenshot review.
  M-Tel backlog item — slot when M2 needs it.
- **Single-repo proof.** ARK kept observation-only; M3+ adds T2/T3 for difficulty matrix.
- **`coderabbit:autofix` not exercised.** Loop applied review feedback by hand each PR; the
  autofix plugin is wired into the protocol but findings were small enough that manual
  resolution was faster. Exercise it on a noisier surface in M2/M3.

## Open Decision #1 (from ROADMAP) — `.loop/` naming

Resolved in practice: `.loop/state.json` is committed; `.auto-loop/` (external-driver runtime)
remains gitignored. Split reads cleanly; carry into M2 unchanged.

## Open Decision #2 (billing) — confirmed in M0

Interactive `/loop` + `ScheduleWakeup` on subscription pool — confirmed across the 25-hour
M1 run with no rate-limit hits.

## Open Decision #3 (CodeRabbit) — wired in for real

CLI v0.4.4 ran on every M1 feature PR. The CodeRabbit hang on iter-001 was the only
runtime failure; resolved by always scoping with `--type committed --base main` (unscoped
runs hang on this repo). The fallback to Anthropic's `review` skill / `superpowers:requesting-
code-review` was never exercised — kept documented for portability.

## What's next — M2

Per ROADMAP M2: expand `auto-loop-bootstrap` from a thin scaffolder into a full
**S0 → S1 → S2** lifecycle bootstrap that produces a runnable bare-bones app before
handing off to `autonomous-build-loop` for S3 feature dev. New references: `lifecycle-stages.md`,
`auto-research-mode.md`, `super-reviewer.md`, `decision-log.md`, `tech-stack-selection.md`,
`scaffold-and-wire.md`. Rename `read-manifest.md` → `tiered-read-strategy.md`. Full
`.loop/state.json` schema with checkpoint/parking logic. Prove on a fresh empty repo.
