# M0 — Dependency Vetting & Rebuild Discipline

**Date:** 2026-05-14 · **Status:** complete · See [`ROADMAP.md`](../ROADMAP.md) §5, §11, M0.

## Result: all skills present — no fallbacks needed

Every skill in ROADMAP §5 is installed and available via the `Skill` tool. The
"fallback if missing" column in §5 is **dormant** — keep it documented for portability
(other machines may lack a skill), but no fallback path is exercised on this environment.

| Stage | Skill | Source | Status |
|---|---|---|---|
| S0 | `grill-with-docs` | Matt Pocock (`~/.claude/skills/`) | ✓ |
| S0 | `grill-me` | Matt Pocock | ✓ |
| S0 | `superpowers:brainstorming` | superpowers plugin | ✓ |
| S0 | `prototype` | Matt Pocock | ✓ |
| S0 | `to-prd` | Matt Pocock | ✓ |
| S1 | `to-issues` | Matt Pocock | ✓ |
| S1 | `superpowers:writing-plans` | superpowers plugin | ✓ |
| S2 | `superpowers:using-git-worktrees` | superpowers plugin | ✓ |
| S2 | `superpowers:executing-plans` | superpowers plugin | ✓ |
| S3/S4 | `tdd` | Matt Pocock | ✓ |
| S3/S4 | `superpowers:test-driven-development` | superpowers plugin | ✓ |
| S3/S4 | `superpowers:subagent-driven-development` | superpowers plugin | ✓ |
| S3/S4 | `superpowers:dispatching-parallel-agents` | superpowers plugin | ✓ |
| S3/S4 | `coderabbit:code-review` | coderabbit plugin | ✓ |
| S3/S4 | `coderabbit:autofix` | coderabbit plugin | ✓ |
| S3/S4 | `superpowers:requesting-code-review` | superpowers plugin | ✓ |
| S3/S4 | `superpowers:receiving-code-review` | superpowers plugin | ✓ |
| S3/S4 | `superpowers:verification-before-completion` | superpowers plugin | ✓ |
| S3/S4 | `superpowers:systematic-debugging` | superpowers plugin | ✓ |
| S3/S4 | `diagnose` | Matt Pocock | ✓ |
| S3/S4 | `improve-codebase-architecture` | Matt Pocock | ✓ |
| Lifecycle | `claude-md-management:claude-md-improver` | claude-plugins-official | ✓ |
| Lifecycle | `superpowers:writing-skills` | superpowers plugin | ✓ |

**Bonus skills found** (not in §5, relevant to later milestones):
- `superpowers:finishing-a-development-branch` — fits feature-PR mode (M1) close-out.
- `coderabbit:coderabbit-review` — third CodeRabbit entrypoint alongside `code-review`/`autofix`.
- An `autoresearch` plugin marketplace is installed — evaluate against ROADMAP §7's
  hand-rolled multi-agent research pattern during M2 (may replace or supplement it).

## CodeRabbit availability → wire it in (Open Decision #3 resolved)

- CLI installed: `~/.local/bin/coderabbit` v0.4.4. Plugin skills present.
- **Decision:** M1 wires `coderabbit:*` in for real — no stub. Confirm `coderabbit auth status`
  is authenticated at M1 wiring time (CLI presence confirmed; auth not yet verified).

## Tooling for M1

- `gh` v2.91.0 — `gh pr create` / auto-merge path is available.
- `scripts/build.sh` — syntax OK, `zip` available. Build discipline confirmed runnable.

## Billing assumption confirmed (Open Decision #2 resolved)

ROADMAP §11 holds — **confirmed, not revised.** Effective **2026-06-15**, programmatic usage
(`claude -p`, Agent SDK, Claude Code GitHub Actions, terminal) moves to a separate non-rollover
monthly credit pool at full API rates — Max 20x = $200/mo. Interactive usage (`/loop` +
`ScheduleWakeup`) stays on the subscription pool.

**Decision stands:** testbed loops + multi-loop workers run as **interactive `/loop` sessions in
git worktrees**, not `claude -p`. `auto-loop.py` remains a skills-repo asset for repos that opt
into external-driver mode. (Today is 2026-05-14 — the change is ~1 month out.)

Sources: [SiliconANGLE](https://siliconangle.com/2026/05/14/anthropic-announces-programmatic-credit-pool-agentic-tool-use-rises/),
[The Decoder](https://the-decoder.com/claude-subscriptions-get-separate-budgets-for-programmatic-use-billed-at-full-api-prices/).

## Rebuild discipline (established)

Every skills-repo milestone that edits skill source ends with:

```bash
./scripts/build.sh           # repackage autonomous-build-loop.skill + auto-loop-bootstrap.skill
git add dist/*.skill         # commit the refreshed packages alongside the source change
```

M0 itself edits no skill source, so **no `dist/` rebuild for M0** — this doc is the only deliverable.
