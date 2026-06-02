# Phase 4 implementation — wiring fitness functions into GitHub Actions

How to turn the selected set into committed CI. Templates in `../assets/templates/`.

## Layout

Prefer a **single workflow, one job per characteristic** — legible PR feedback, independent pass/fail, cheap jobs in parallel.

```
.github/workflows/fitness-functions.yml   # the pipeline
.dependency-cruiser.cjs / .importlinter / ... # tool configs (repo root or conventional path)
FITNESS.md                                 # documents every installed function
```

Start from `assets/templates/fitness-functions.yml` and keep only the jobs for selected functions. Triggers: `pull_request` (feedback where it matters) + `push` to the default branch (catch direct pushes) + optional `schedule` for heavy scans (full SAST, perf).

## Gating vs. monitoring in YAML

**Monitoring (default for anything new)** — run it, surface it, don't fail the build:

```yaml
- name: Circular dependency check (monitoring)
  run: npx depcruise --config .dependency-cruiser.cjs src
  continue-on-error: true      # ← report, don't block
```

**Gating** — drop `continue-on-error`; the step's non-zero exit fails the job. To make it *block merges*, add the job as a **required status check** in branch protection (tell the user to do this in repo Settings → Branches; or via `gh api`). Don't silently make checks required — the user opts in.

Promotion path: land monitoring → confirm green across a few PRs → remove `continue-on-error` → optionally mark required. Record the current posture in `FITNESS.md`.

## Baseline-and-ratchet for metrics with existing debt

Absolute thresholds on legacy code fail on day one. Instead:

1. **Measure now** and commit the baseline (e.g. `.fitness/coverage-baseline.txt`, or use the tool's own baseline file — Sonar's "new code", `diff-cover`, ESLint `--report-unused-disable-directives` baselines, etc.).
2. **Gate on regression / new code only.** Examples:
   - Coverage: `diff-cover` against the PR base — only *changed* lines must hit the threshold.
   - Complexity: run the metric over the diff, or fail only if the max exceeds the recorded baseline.
   - Lint debt: generate a baseline/suppressions file; fail only on *new* violations.
3. **Ratchet** — periodically lower the allowed debt / raise the threshold as it's paid down. Note the current baseline value in `FITNESS.md` so it's visible and intentional.

## Pinning and hygiene

- **Pin Action versions** to the tag found in research (`actions/checkout@v4`, `aquasecurity/trivy-action@<tag>`), never `@main`.
- **Cache** package installs (`actions/setup-node` cache, `actions/cache` for Gradle/pip) so PR feedback stays fast.
- **Least privilege** — set `permissions:` to the minimum (most checks need only `contents: read`; CodeQL needs `security-events: write`).
- **Fail fast per job, not per pipeline** — `fail-fast: false` across the matrix/jobs so one red check doesn't hide the others.

## Never clobber

- If `.github/workflows/*` already enforces a characteristic, **don't add a second copy** — note the overlap and, if useful, suggest tightening the existing one.
- If a tool config already exists (`.eslintrc`, `sonar-project.properties`), **extend** it rather than overwrite.
- Append to an existing `FITNESS.md` rather than replacing it.

## FITNESS.md — required for every installed function

One entry per function so the gate never becomes cargo-cult. Use `assets/templates/FITNESS.md`. Each entry records: **characteristic protected**, **tool + config path**, **threshold/rule**, **posture (monitoring/gating, required?)**, **why it matters**, and **how to fix a failure**. This is what lets the next maintainer trust (instead of delete) the check.

## Validate before declaring done

```bash
# Lint the workflow if actionlint is available; else parse the YAML
command -v actionlint >/dev/null && actionlint .github/workflows/fitness-functions.yml \
  || python3 -c 'import sys,yaml; yaml.safe_load(open(".github/workflows/fitness-functions.yml"))'
```

Then hand off: where feedback shows (PR "Checks" tab / commit statuses), how to read a failure (the job log + the FITNESS.md "how to fix" line), and the monitoring→gating + ratchet path.
