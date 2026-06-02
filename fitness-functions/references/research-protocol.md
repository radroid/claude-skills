# Phase 2 research protocol — web-search for current best-practice checks

The skill's value is **current, stack-specific** guidance. Tool names, recommended defaults, and GitHub Action versions drift; the baseline catalog (`catalog.md`) is a map, not the territory. This phase confirms and extends it with WebSearch (and WebFetch for primary docs).

## What to research, per profile dimension

For each language/framework/style in the confirmed profile, run searches to answer:

1. **Which fitness functions are recommended for this stack today?** (categories from `concepts.md`)
2. **Which tool implements each, and is it still maintained?** (last release within ~12 months; not archived)
3. **How does it run in GitHub Actions?** (official Action vs. CLI step; current version tag)
4. **What are sane default thresholds**, and does it support baseline/ratchet or diff-mode?

## Query templates

Substitute `{LANG}`, `{FRAMEWORK}`, `{TOOL}`, `{YEAR}` (use the current year):

- `architectural fitness functions {LANG} CI best practices {YEAR}`
- `{LANG} detect circular dependencies enforce layering CI {YEAR}` ← the user's headline case
- `{TOOL} github actions example {YEAR}`
- `{TOOL} vs alternatives {LANG}` (pick the maintained, lowest-friction option)
- `{FRAMEWORK} architecture testing rules {YEAR}`
- `{LANG} diff coverage github actions` / `enforce coverage on new code only`
- `{LANG} dependency vulnerability scanning github actions {YEAR}`
- `monorepo enforce package boundaries CI {YEAR}` (for monorepos)
- `openapi breaking change detection CI` (for services with APIs)

Prefer **primary sources**: the tool's own docs/README, the GitHub Marketplace Action page, and the official Actions docs. Use WebFetch on the top hit to pin the exact Action version and config syntax — don't guess version tags.

## Capture format (one row per candidate)

Build this table as you research; it feeds Phase 3 directly:

| Characteristic | Tool | How it runs in CI | Gating or monitoring | Default/threshold | Cost | Source |
|---|---|---|---|---|---|---|
| No circular deps (TS) | dependency-cruiser | `npx depcruise` step, config in repo | gating (cheap, deterministic) | `no-circular` rule = error | ~30s | dep-cruiser docs |
| Diff coverage | pytest-cov + diff-cover | run tests → `diff-cover` step | monitoring → gating | 80% on changed lines | test time | diff-cover README |
| Dep vulns | Trivy / `pip-audit` | official Action | monitoring (noisy) | fail on HIGH+ | ~1min | Trivy Action page |

## Selection heuristics (turn research into a recommendation)

Favor a candidate when it is:

- **Maintained** — recent releases, not archived, real user base.
- **Deterministic & low false-positive** — produces the same verdict on the same code; a flaky check erodes trust faster than no check.
- **Low CI cost** — seconds, not minutes, for PR-blocking checks. Push heavy scans (full SAST, perf) to scheduled runs.
- **Native to the stack** — a tool the ecosystem already uses beats a generic one that needs glue.
- **Ratchet/diff-capable** — for any metric with existing debt (coverage, complexity), prefer tools that can gate on *new* code or *regression* (see `concepts.md` baseline-and-ratchet).

Mark a **starter set**: the 3–5 highest-signal, lowest-friction functions. Everything else is "optional / advanced" in the Phase 3 menu.

## Don'ts

- Don't recommend a tool you couldn't confirm is maintained — note it as "needs verification" instead.
- Don't pin an Action to `@main`/`@latest`; use the version tag found in research.
- Don't propose checks for a characteristic the existing CI already enforces (Phase 1 marked those covered).
- Don't let research balloon — a handful of targeted searches per dimension is enough; you're choosing tools, not writing a survey.
