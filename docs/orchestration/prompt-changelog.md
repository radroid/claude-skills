# Prompt changelog — the SINGLE version record for role templates

Templates carry no version headers; every change is a dated line here, tied to the
KPI it targets.

## KPI definitions

- **planner/executor/reviewer cost** — approx output tokens per role run (ledger).
- **review yield** — blocking issues that survive the fix loop (real defects found).
- **escaped defects** — defects found after merge. Until a runtime oracle covers a
  surface, label it "escaped defects (build/unit-detectable only)" — 0-known, not
  0-real.
- **plan friction** — friction-log entries attributable to spec gaps.
- **cycle overhead** — fix loops per PR.

## Changes

- 2026-07-13 — bootstrap — all templates — seeded from orchestrated-delivery
  SKILL.md (The loop + ANTI-BIAS) — KPI: n/a (initial derivation).
