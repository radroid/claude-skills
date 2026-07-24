# Concepts — what a fitness function is, and the category set

## Origin

A **fitness function** comes from genetic / evolutionary algorithms: a function that scores how close a candidate solution is to the objective, evaluated every generation so selection can push toward the goal.

*Building Evolutionary Architectures* (Neal Ford, Rebecca Parsons, Patrick Kua — Thoughtworks) borrows the term for software:

> An **architectural fitness function** is any mechanism that provides an objective integrity assessment of some architectural characteristic(s).

The point is **continuous, objective feedback**. Architecture decays silently — coupling creeps in, layers get bypassed, complexity climbs, a circular dependency sneaks through review. A fitness function turns "we agreed not to do that" into an automated check that fails (or reports) when the codebase drifts. Run it in CI and the architecture can *evolve* on purpose instead of eroding by accident.

## Classification (use this to organize the catalog)

| Axis | Options | Meaning |
|---|---|---|
| **Scope** | atomic / holistic | One characteristic in isolation vs. an emergent property of several together (e.g. one service's complexity vs. end-to-end latency across services) |
| **Cadence** | triggered / continual | Runs on an event (push, PR, schedule) vs. constantly via monitoring |
| **Result** | static / dynamic | Fixed pass/fail threshold vs. a value that shifts with context (e.g. ratcheting baselines) |
| **Automation** | automated / manual | CI-enforced vs. a documented manual review gate |
| **Posture** | **gating / monitoring** | **Fails the build vs. reports only.** This is the lever you tune most — see below. |

Most CI fitness functions are *atomic, triggered, automated*. The interesting choices are **static vs. ratcheting threshold** and **gating vs. monitoring**.

## Category taxonomy (the menu groups)

Organize candidate checks under these characteristics. Not every repo needs every category — Phase 1's architectural style decides which matter.

1. **Modularity / dependency structure** — *the user's headline example.* No circular dependencies between modules/packages; enforced layering (UI → service → data, never backwards); no forbidden cross-module imports. Tools: ArchUnit (Java/Kotlin), NetArchTest / ArchUnitNET (.NET), `dependency-cruiser` & `madge` (JS/TS), `import-linter` (Python), `go-cleanarch` & `depguard` (Go).
2. **Coupling & cohesion metrics** — afferent/efferent coupling, instability, distance-from-main-sequence, package tangle. Tools: ArchUnit metrics, `dependency-cruiser` metrics, structure101/SonarQube measures.
3. **Complexity & maintainability** — cyclomatic complexity ceilings, file length, duplication, maintainability index. Tools: SonarQube/SonarCloud, `radon`/`xenon` (Python), ESLint complexity rules, PMD/Checkstyle (Java), `gocyclo`.
4. **Security & supply chain** — SAST, dependency vulnerabilities, secret scanning, license/SBOM. Tools: CodeQL, Semgrep, Trivy, `pip-audit`/`npm audit`/`govulncheck`, Dependabot, gitleaks/trufflehog.
5. **Test coverage** — line/branch thresholds, diff-coverage (new code must be covered). Tools: coverage runners + `diff-cover`, Codecov/Coveralls gates.
6. **Performance budgets** — bundle/asset size, Lighthouse budgets, microbenchmark regression. Tools: `size-limit`/`bundlesize`, Lighthouse CI, language benchmark harnesses.
7. **API / contract integrity** — no breaking API changes, OpenAPI lint, schema compatibility. Tools: `oasdiff`, Buf breaking-change, Pact.
8. **Operational / config hygiene** — IaC scanning, Dockerfile lint, no debug flags in prod config. Tools: `tfsec`/Checkov, `hadolint`, custom Semgrep rules.

## Gating vs. monitoring — the key policy

- **Monitoring (default for anything new):** the check runs and reports, but **does not fail the build**. Use `continue-on-error: true` or post results as a comment/annotation. Gets the signal in front of people without blocking merges on day one.
- **Gating:** the check **fails CI** and blocks merge (optionally a branch-protection required check). Reserve for functions that are green and trusted, where a failure genuinely should stop a merge.

**Promotion path:** land as monitoring → watch a few PRs → once it's reliably green and the team trusts it → flip to gating. Document the current posture per function in `FITNESS.md`.

## Baseline-and-ratchet (for metrics with existing debt)

A coverage or complexity threshold set to an aspirational value fails immediately on a legacy codebase and gets disabled. Instead:

1. **Measure the current value** (e.g. coverage 61%, max complexity 34) and write it as the baseline.
2. **Fail only on regression** past the baseline — new code can't make it worse.
3. **Periodically ratchet** the baseline tighter as debt is paid down.

This converts an unwinnable absolute gate into a one-way improvement ratchet — the evolutionary-architecture spirit: the system is only allowed to get fitter.
