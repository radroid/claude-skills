# Phase 1 — Codebase context audit

The first thing the grill does. Stops you from asking questions the code already answers.

## Goal

Produce a **5-bullet context summary** that gets carried into every later phase as framing. Not a deep audit — a fast, signal-rich snapshot.

## Decision: greenfield or brownfield?

```bash
git ls-files | wc -l
```

| Result | Mode | Notes |
|---|---|---|
| 0 or <10 (typical: just `.gitignore`, `README.md` stub) | `greenfield` | Skip the brownfield reads. Bias questions toward "smallest useful thing." |
| ≥10 | `brownfield` | Run the full audit below. |

If `git ls-files` errors (not a repo): treat as `greenfield`, and note in the summary that no git history exists.

## Brownfield audit — what to read

Read these in this order. Each one is one read, not deep exploration. If a file is huge, read the first 100–200 lines.

1. **`README.md`** — what the project claims to be, who it's for, install/run instructions.
2. **Package manifest** (whichever exists): `package.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `Gemfile`, `requirements.txt`, `composer.json`. Pull tech stack + key deps + scripts.
3. **Top-level directories** (`ls -la`) — infer architecture shape: monorepo? frontend/backend split? plugin layout? what's the codebase organized around?
4. **Recent commits** (`git log --oneline -20`) — what's been worked on recently, who's working on it, what's the cadence?
5. **Existing docs** — `docs/PRD.md`, `docs/SPEC.md`, `ARCHITECTURE.md`, `GOALS.md`, `PLAN.md`, `ROADMAP.md`, `CHANGELOG.md`. If any are non-trivial, summarise their substance into the context.

Optional reads (only if signals point there):
- A `CLAUDE.md` if it exists — captures any loop / agent protocol already set up.
- `.loop/state.json` if it exists — current lifecycle stage.
- One representative entrypoint file (e.g. `src/index.ts`, `app/main.py`) if you can identify one quickly — confirms the manifest's claims about stack.

## Existing-PRD branch

If `docs/PRD.md` already exists, **stop and ask the user**:

```
A PRD already exists at docs/PRD.md ({N} lines, last modified {date}).
What would you like to do?
  1. Update — keep the existing PRD as the base, layer your new context onto it
  2. Replace — archive the existing PRD to docs/PRD.archive-{date}.md and write fresh
  3. Abort — your existing PRD is already what you need; skip this skill
```

Default suggestion when ambiguous: **Update**. Never silently overwrite — a PRD represents human decisions, and replacing one without consent is destructive.

## Output format — the context summary

Five bullets, max. Stop yourself if you're writing more.

```markdown
**Context (Phase 1):**
- Mode: greenfield | brownfield
- Stack: <one line — language(s), framework(s), runtime>
- Shape: <one line — monolith / monorepo / library / CLI / web app / etc.>
- Recent focus: <what last 10 commits suggest the team is working on>
- Existing PRD/spec: <none | exists at <path>, summary in one phrase>
```

If greenfield, three of these bullets degrade to "n/a — greenfield":

```markdown
**Context (Phase 1):**
- Mode: greenfield (0 tracked files)
- Stack: n/a — to be picked in Phase 3 or downstream (S1)
- Shape: n/a — to be picked
- Recent focus: n/a — no commits
- Existing PRD/spec: none
```

## Carry-forward rule

The context summary is **the first thing you reference in every Phase 3 brainstorming brief**. Pass it verbatim into the brainstorming invocation. If the brainstorming engine asks you a question whose answer is in the summary, answer it from the summary rather than re-asking the user.

## What NOT to do in Phase 1

- Don't grep the codebase for business logic. You're scoping, not auditing for bugs.
- Don't read more than ~10 files. Speed matters — Phase 1 should take under a minute.
- Don't form opinions about the codebase quality. The PRD is about what to build, not what's wrong with what exists. (Architecture critique belongs to `improve-codebase-architecture` or downstream review.)
- Don't try to infer the user's intent from the code. Ask them in Phase 3.
