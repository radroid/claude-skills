# Fitness Functions

Architectural fitness functions protecting this repo. Each is an objective,
automated check of an architectural characteristic, run in CI (`.github/workflows/fitness-functions.yml`).
Posture is **monitoring** (reports, doesn't block) or **gating** (fails CI);
gating + "required" also blocks merge via branch protection.

> Promote monitoring → gating once a function is reliably green. Ratchet
> thresholds tighter as debt is paid down. Don't delete a check without
> recording why here.

| Characteristic | Tool (config) | Rule / threshold | Posture | Required? |
|---|---|---|---|---|
| No circular dependencies | dependency-cruiser (`.dependency-cruiser.cjs`) | `no-circular` = error | monitoring | no |
| Layering boundaries | dependency-cruiser | UI ↛ data direct imports | monitoring | no |
| Complexity ceiling | _<tool>_ | max cyclomatic ≤ _<n>_ | monitoring | no |
| Coverage on new code | diff-cover | ≥ 80% of changed lines | monitoring | no |
| Dependency vulnerabilities | Trivy | fail on HIGH/CRITICAL | monitoring | no |

## Entries

### No circular dependencies
- **Protects:** modularity — cycles between modules make code impossible to reason about, test, or extract.
- **Tool:** dependency-cruiser, config `.dependency-cruiser.cjs`, rule `no-circular`.
- **Posture:** monitoring (will gate once baseline is clean).
- **How to fix a failure:** the log prints the cycle path (A → B → A). Break it by introducing an interface/port, moving the shared type to a lower layer, or inverting the dependency.

### Layering boundaries
- **Protects:** the intended layer direction (e.g. `domain` must not import `infrastructure`).
- **Tool:** dependency-cruiser forbidden rules.
- **Posture:** monitoring.
- **How to fix a failure:** the offending import is named; depend on an abstraction the lower layer owns instead of reaching upward/sideways.

<!-- Add one entry per installed function. Baseline values for ratcheting
     metrics (coverage %, max complexity) go here so they're intentional. -->

## Baselines (ratcheting metrics)

| Metric | Baseline (date) | Target |
|---|---|---|
| Coverage (new code) | 80% (set _<date>_) | 90% |
| Max cyclomatic complexity | _<measured>_ | _<goal>_ |
