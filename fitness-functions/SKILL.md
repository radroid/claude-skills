---
name: fitness-functions
description: Designs and installs architectural fitness functions as a GitHub Actions CI pipeline that continuously checks how the code is written. Profiles a repo's languages, frameworks, and architectural style; web-searches current best-practice checks for that stack (e.g. circular-import / layering-violation detection for Java/.NET/Python/JS, coupling, complexity, security, coverage, bundle size); presents a tailored catalog of candidate checks; then implements the ones the user selects as workflows, tool configs, and a FITNESS.md. Use when the user wants to "add fitness functions", "set up architecture/CI guardrails", "enforce architectural rules", "catch circular imports / layering violations in CI", "add a fitness function pipeline", "continuously check code quality/architecture", or invokes fitness-functions. Works on any repo; research is stack-aware so it covers languages the baseline catalog hasn't pinned.
---

# Fitness Functions

## What this skill does

Stands up **architectural fitness functions** for a repository: objective, automated checks that run in CI and continuously report whether the codebase still holds the architectural and quality characteristics it's supposed to (modularity, low coupling, no circular dependencies, bounded complexity, security, coverage, performance budgets, …).

The skill is **research-driven**: it does not ship a fixed checklist. It profiles the repo, web-searches the current best-practice checks and tooling for *that* stack and architecture, presents a tailored catalog, and implements only what the user picks — wired into GitHub Actions so every push/PR gets feedback.

> **Why "fitness function"?** The term comes from genetic algorithms, where a fitness function scores how close a candidate is to the goal. *Building Evolutionary Architectures* (Ford, Parsons, Kua — Thoughtworks) borrows it: an architectural fitness function is an objective measure of an architectural characteristic, evaluated continuously so the architecture can evolve without silently decaying. See `references/concepts.md`.

## When to use vs. not

| Use it for | Not the right tool for |
|---|---|
| Adding CI guardrails that protect architecture/quality over time | One-off "lint this file once" |
| Catching circular imports / layering violations / coupling creep | Writing the application's feature tests |
| Stack-aware research → tailored check catalog → CI wiring | Replacing an existing mature CI you just want tweaked (use it to *augment*) |
| Any language — research fills gaps the baseline catalog hasn't pinned | Repos with no git remote / not on GitHub (workflows won't run) |

## Workflow

Run the phases in order. Each phase has an exit gate — don't advance until it's met.

### Phase 1 — Profile the architecture

Detect what you're working with before researching anything. Produce an **architecture profile** the user confirms. Cover:

- **Languages & package managers** — by manifest and file census (`package.json`, `pom.xml`/`build.gradle`, `*.csproj`/`*.sln`, `pyproject.toml`/`requirements.txt`, `go.mod`, `Cargo.toml`, `composer.json`, …).
- **Frameworks & runtime** — Spring, .NET, Django/FastAPI, React/Next, NestJS, Rails, etc.
- **Architectural style** — monolith, modular monolith, layered, hexagonal/clean, microservices, monorepo (workspaces/Nx/Turbo/Gradle multi-module). This drives *which* fitness functions matter most.
- **Existing CI & tooling** — `.github/workflows/*`, pre-commit hooks, existing linters/test runners/coverage. Never duplicate what's already enforced; augment it.
- **Test & coverage baseline** — is there a test command? a coverage report?

Exact detection commands: `references/detection.md`. Report the profile back as a compact table and get confirmation. **Exit gate:** user confirms (or corrects) the profile.

### Phase 2 — Research current best-practice fitness functions

For each dimension in the profile, **use WebSearch** to find the *current* recommended checks and the tools that implement them. Do not rely on memory alone — tool names, defaults, and Action versions drift. The baseline catalog in `references/catalog.md` is your starting map (per-language tools + the example the user cares about: circular-import/layering detection — ArchUnit for Java, NetArchTest for .NET, `dependency-cruiser`/`madge` for JS/TS, `import-linter` for Python, `go-cleanarch` for Go). Research **confirms, versions, and extends** it.

Search protocol and query templates: `references/research-protocol.md`. For each candidate fitness function, capture: the **characteristic** it measures, the **tool**, how it runs in CI, whether it's naturally **gating or monitoring**, and rough CI cost. **Exit gate:** a researched candidate list with at least one function per high-value dimension, each backed by a cited tool.

### Phase 3 — Synthesize & present the tailored catalog

Map profile → candidates into a menu grouped by characteristic (Modularity / Coupling / Complexity / Security / Coverage / Performance / Contracts / Licensing — see `references/concepts.md` for the category set). For each item show: characteristic, tool, what it catches, gating vs. monitoring recommendation, and setup cost. Mark a **recommended starter set** (high signal, low false-positive, cheap) distinct from optional/advanced ones.

Present it and let the user choose. Use `AskUserQuestion` for the gating-policy and starter-vs-full decisions when the choice is genuinely theirs; otherwise just confirm the recommended set conversationally. **Exit gate:** an explicit selected set + a gating policy per item.

### Phase 4 — Implement the selected fitness functions

For each selected function, generate: the **tool config**, a **CI step**, and a **FITNESS.md** entry. Templates live in `assets/templates/`; wiring rules and gating policy in `references/implementation.md`. Key rules:

- **Start non-blocking, then ratchet.** New functions land as **monitoring** (report, don't fail the build) unless the user opts into gating. Once green and trusted, flip to gating. For metrics with existing debt, **baseline-and-ratchet** (fail only on *regression* past the current value) rather than failing on day one.
- **One workflow, clear jobs.** Prefer a single `.github/workflows/fitness-functions.yml` with one job per characteristic, each independently pass/fail, so PR feedback is legible. Pin Action versions found in research.
- **Document every function** in `FITNESS.md`: what it protects, the tool, the threshold, gating state, and how to fix a failure. This is the artifact that keeps the checks from becoming cargo-cult.
- **Never clobber** existing workflows or configs — merge/append, and if a check already exists, skip it and note the overlap.

**Exit gate:** committed workflow + configs + `FITNESS.md`, and (if a remote exists) the workflow is syntactically valid.

### Phase 5 — Validate & hand off

- Sanity-check workflow YAML (`actionlint` if available, else a YAML parse).
- If the user wants, open a draft PR so the checks run against a real diff and the feedback is visible on the PR — **only if the user asks for a PR** (see repo `CLAUDE.md` for GitHub access via `gh`).
- Hand off: explain where feedback shows up (PR checks tab / commit statuses), how to read a failure, how to promote a function from monitoring → gating, and how to ratchet thresholds tighter over time.

## Hard rules

- **Research before recommending.** The selling point is stack-aware, current guidance. Skipping Phase 2 turns this into a generic boilerplate dump — don't.
- **Never clobber existing CI or configs.** Audit in Phase 1; augment, don't overwrite. Note overlaps instead of duplicating checks.
- **Default to monitoring, not gating.** A wall of red on first run gets the whole pipeline disabled. Land non-blocking, baseline existing debt, ratchet up.
- **The user picks the set.** Present a recommendation, but implement only what's selected. No surprise required checks.
- **Every installed function is documented in FITNESS.md.** An undocumented gate is tech debt the next person will rip out.
- **No secrets, no overreach.** Don't add checks that need credentials the repo doesn't have; flag those as optional with setup notes.

## References

- `references/concepts.md` — what fitness functions are, the genetic-algorithm/evolutionary-architecture origin, category taxonomy, gating vs. monitoring, ratcheting
- `references/detection.md` — exact commands to build the Phase 1 architecture profile
- `references/research-protocol.md` — how to web-search effectively, query templates, what to capture per candidate
- `references/catalog.md` — baseline per-language/architecture tool map (the starting point research refines)
- `references/implementation.md` — GitHub Actions wiring, gating policy, baseline-and-ratchet, FITNESS.md format

## Assets

- `assets/templates/fitness-functions.yml` — GitHub Actions workflow skeleton (one job per characteristic)
- `assets/templates/FITNESS.md` — the per-repo documentation file
- `assets/templates/dependency-cruiser.config.cjs` — example JS/TS layering + circular-import rules
- `assets/templates/importlinter.cfg` — example Python layering contract
- `assets/templates/LayeredArchitectureTest.java` — example ArchUnit no-cycles / layering test
