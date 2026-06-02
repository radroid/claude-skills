# Phase 1 detection — build the architecture profile

Run from the repo root. Goal: a confirmed profile of languages, frameworks, architectural style, and existing CI — so Phase 2 research is targeted and Phase 4 doesn't duplicate checks.

## Languages & package managers (manifest census)

```bash
# Manifests reveal stack + package manager in one pass
ls -1 \
  package.json pnpm-workspace.yaml turbo.json nx.json \
  pom.xml build.gradle build.gradle.kts settings.gradle \
  pyproject.toml requirements*.txt setup.cfg setup.py \
  go.mod Cargo.toml composer.json Gemfile *.sln *.csproj \
  2>/dev/null

# File-extension histogram (top languages by file count)
git ls-files | sed -n 's/.*\.\([A-Za-z0-9]\+\)$/\1/p' | sort | uniq -c | sort -rn | head -20
```

Map manifests → ecosystem and the natural modularity tool (refined by research):

| Manifest | Ecosystem | Modularity/layering tool to research first |
|---|---|---|
| `pom.xml` / `build.gradle*` | Java/Kotlin (Maven/Gradle) | ArchUnit |
| `*.csproj` / `*.sln` | .NET | NetArchTest / ArchUnitNET |
| `pyproject.toml` / `requirements.txt` | Python | import-linter |
| `package.json` | JS/TS (npm/pnpm/yarn) | dependency-cruiser, madge |
| `go.mod` | Go | go-cleanarch, depguard |
| `Cargo.toml` | Rust | cargo-modules, cargo-deny |
| `composer.json` | PHP | deptrac |
| `Gemfile` | Ruby | packwerk (if modularized) |

## Frameworks & runtime

```bash
# JS/TS frameworks + scripts
[ -f package.json ] && { grep -E '"(react|next|nest|@angular|vue|svelte|express|fastify)"' package.json; echo '--- scripts ---'; sed -n '/"scripts"/,/}/p' package.json; }

# Java/Spring, .NET, Python web
grep -rl "spring-boot\|org.springframework" --include=pom.xml --include=*.gradle . 2>/dev/null | head
grep -rl "Microsoft.AspNetCore\|Microsoft.NET.Sdk.Web" --include=*.csproj . 2>/dev/null | head
grep -riE "django|fastapi|flask" pyproject.toml requirements*.txt 2>/dev/null | head
```

## Architectural style (drives which fitness functions matter)

```bash
# Monorepo / multi-module signals
ls -1 pnpm-workspace.yaml turbo.json nx.json lerna.json 2>/dev/null
grep -l "workspaces" package.json 2>/dev/null
find . -maxdepth 3 -name settings.gradle -o -name "*.sln" 2>/dev/null | head
ls -d services/ packages/ apps/ modules/ 2>/dev/null

# Layering / clean-architecture signals (folder names hint at intended layers)
find . -maxdepth 4 -type d \( -iname domain -o -iname application -o -iname infrastructure \
  -o -iname adapters -o -iname ports -o -iname controllers -o -iname repositories \
  -o -iname usecases -o -iname entities \) 2>/dev/null | head -30
```

Classify as one of: **single-module monolith**, **layered monolith**, **modular monolith / monorepo**, **microservices**, **library/package**. The style decides emphasis:

- Layered / clean / hexagonal → **layering-violation + no-cycles** checks are the headline.
- Modular monolith / monorepo → **cross-package boundary** + per-package cycle checks.
- Microservices → **per-service** internal checks + **API contract / breaking-change** + holistic latency budgets.
- Library → **public API surface** stability + complexity + coverage.

## Existing CI & enforcement (do NOT duplicate)

```bash
ls -1 .github/workflows/ 2>/dev/null
# What characteristics are already checked?
grep -riE "codeql|semgrep|trivy|sonar|coverage|eslint|archunit|dependency-cruiser|madge|import-linter|lighthouse|size-limit|actionlint" \
  .github/workflows/ .pre-commit-config.yaml 2>/dev/null

# Test + coverage commands already defined?
grep -riE "coverage|pytest|jest|vitest|go test|gradle test|dotnet test" \
  package.json Makefile justfile 2>/dev/null | head
```

Any category already enforced → mark it **covered**; in Phase 3 don't re-propose it, just note the overlap (and optionally suggest tightening).

## Output: the profile table

Report back compactly and get confirmation before researching:

```
Architecture profile:
  Languages:      TypeScript (412 files), Python (88)
  Package mgrs:   pnpm (workspace), uv
  Frameworks:     Next.js (web), FastAPI (api)
  Style:          modular monorepo — apps/web, apps/api, packages/*
  Existing CI:    eslint + jest on PR; no security/arch/coverage gate
  Test/coverage:  jest (no threshold), pytest (no coverage report)

  → High-value gaps: cross-package boundaries & cycles, diff-coverage,
    dependency-vuln + secret scanning. Researching tools for these next.
```

**Exit gate:** user confirms or corrects the profile.
