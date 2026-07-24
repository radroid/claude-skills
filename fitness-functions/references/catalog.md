# Baseline catalog — per-stack fitness-function starting map

This is the **starting point** Phase 2 research confirms, versions, and extends — not a fixed list. Use it to seed searches and to cover stacks fast. Always verify the tool is still maintained and pin the current Action/version during research.

## Modularity / dependency structure (the headline category)

Detect **circular dependencies** and enforce **layering / boundary** rules — the example that motivates this skill.

| Stack | Tool | Catches | CI shape |
|---|---|---|---|
| Java / Kotlin | **ArchUnit** | cycles, layer access rules, naming, package deps | a JUnit test in the normal test run |
| .NET | **NetArchTest** / **ArchUnitNET** | layer rules, namespace deps, cycles | an xUnit/NUnit test |
| JS / TS | **dependency-cruiser** (rules) + **madge** (quick cycles) | `no-circular`, forbidden cross-module imports, orphan modules | `npx depcruise --config ... src` step |
| Python | **import-linter** | layered/independence/forbidden contracts in `.importlinter` | `lint-imports` step |
| Go | **go-cleanarch**, **depguard** (golangci-lint) | clean-arch layer violations, banned imports | CLI step / golangci-lint |
| Rust | **cargo-modules**, **cargo-deny** | module graph, banned/duplicate deps | cargo subcommand |
| PHP | **deptrac** | layer boundary violations | `deptrac analyse` step |
| Ruby | **packwerk** | package boundary + privacy violations | `packwerk check` step |

> For **monorepos**, the same tools enforce *cross-package* boundaries (e.g. dependency-cruiser rules per workspace; Nx/Turbo also have `nx lint`/affected-graph boundary rules). Research `monorepo enforce package boundaries`.

## Coupling & cohesion metrics

| Stack | Tool | Notes |
|---|---|---|
| Any (server) | **SonarQube / SonarCloud** | coupling, cognitive complexity, duplication, maintainability in one gate |
| Java | ArchUnit metrics, **JDepend** | afferent/efferent coupling, instability |
| JS/TS | dependency-cruiser `--metrics` | instability per module |

## Complexity & maintainability

| Stack | Tool |
|---|---|
| Python | **radon** / **xenon** (fail on grade) |
| JS/TS | ESLint `complexity`, `max-lines`, `sonarjs` plugin |
| Java | **PMD**, **Checkstyle** |
| Go | **gocyclo**, golangci-lint `gocyclo` |
| Any | SonarCloud quality gate |

## Security & supply chain

| Check | Tool |
|---|---|
| SAST | **CodeQL** (GitHub-native), **Semgrep** |
| Dependency vulns | **Trivy**, Dependabot, `npm audit`, `pip-audit`, `govulncheck`, `cargo audit` |
| Secret scanning | **gitleaks**, **trufflehog**, GitHub secret scanning |
| IaC / containers | **tfsec**/**Checkov**, **hadolint** (Dockerfile) |
| License / SBOM | **Syft** + **Grype**, `license-checker` |

## Test coverage

| Want | Tool |
|---|---|
| Threshold gate | runner's built-in (`--cov-fail-under`, jest `coverageThreshold`, JaCoCo rule, `dotnet test` + coverlet) |
| **New-code only** (preferred for legacy) | **diff-cover** (lang-agnostic), Codecov/Coveralls patch status |

## Performance budgets

| Want | Tool |
|---|---|
| JS bundle size | **size-limit**, **bundlesize** |
| Web vitals | **Lighthouse CI** with a budget file |
| Microbench regression | language bench harness + threshold (e.g. `pytest-benchmark`, JMH, `go test -bench`) |

## API / contract integrity

| Want | Tool |
|---|---|
| OpenAPI breaking change | **oasdiff** |
| Protobuf/gRPC breaking change | **Buf** breaking |
| Consumer-driven contracts | **Pact** |

## Pairing checks to architectural style (quick guide)

- **Layered / clean / hexagonal monolith** → layering + no-cycles (ArchUnit / import-linter / dependency-cruiser) is the must-have; add complexity + coverage.
- **Modular monorepo** → per-package boundaries & cycles + diff-coverage + dependency-vuln scan.
- **Microservices** → per-service internal arch checks + API breaking-change + secret/dep scanning; holistic latency budgets as monitoring.
- **Library / SDK** → public-API stability (oasdiff/Buf or API-extractor) + complexity + high coverage gate.
