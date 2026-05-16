# Decision log

Append-only judgment-call log at `docs/decision-log.md`. Lighter weight than ADRs.
Seeded during S0, appended through the life of the project.

## What goes in it

Judgment calls on **best practice** — choices that aren't enforced by the language /
framework but shape the codebase:

- Naming conventions (`UserRecord` vs `User`; `kebab-case-files` vs `camelCase`)
- Error-handling patterns (return-result vs throw; where to attach context)
- Folder structure (`src/features/<X>/` vs `src/components/` + `src/hooks/`)
- Library choices for narrow concerns (date formatter, validator, ID generator)
- Test layout (co-located vs `__tests__/`)

## What does NOT go in it

- **Big architectural decisions** → those go in `docs/adr/` (status-tracked,
  numbered, more ceremony).
- **Stuff already in the code** → don't restate what a file already says.
- **Per-iter implementation notes** → those live in `logs/iter-NNN.md` while the loop
  is active.

## Entry format

```markdown
## YYYY-MM-DD — <short title>

**Decision:** <one line>

**Rationale:** <2–4 lines>

**Seeded by:** S0 grilling | S1 research | S2 scaffolding | S3 iter NNN
```

Append at the bottom. Never edit or delete past entries — supersede with a new entry
that names the prior one.

## Lifecycle

- **S0:** seeded from grilling/brainstorming choices that affect later stages. The
  `to-prd` synthesis surfaces them.
- **S1:** stack-pick rationale + folder structure go here (architecture itself goes
  to `ARCHITECTURE.md`; small justifications come here).
- **S2 / S3+:** append on every judgment call the loop makes that wasn't already
  decided.

## Tier

Tier-2 read per `autonomous-build-loop/references/tiered-read-strategy.md` — read
on trigger, not every iter. Trigger: any iter touching a subsystem with relevant
prior entries; full file read at every phase boundary.

## Consumers

- **Super-reviewer** (`autonomous-build-loop/references/super-reviewer.md`) — pulls
  the full file into the repo-context pack on every invocation.
- **`claude-md-management:claude-md-improver`** — periodically promotes stable,
  oft-cited entries into `CLAUDE.md` so they become Tier-1 (cold-boot read every iter).

## Cross-references

- `s0-alignment-and-scope.md` — seeds the log.
- `s1-tech-stack-selection.md` — appends per stack pick.
- `autonomous-build-loop/references/super-reviewer.md` — primary consumer.
- `autonomous-build-loop/references/tiered-read-strategy.md` — Tier-2 read rules.
