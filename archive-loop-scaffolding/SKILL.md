---
name: archive-loop-scaffolding
description: Archive autonomous-build-loop scaffolding out of a repo, non-destructively, with your yes per file.
disable-model-invocation: true
---

# Archive loop scaffolding

## Goal

Move every loop-scaffolded artifact into a gitignored `.archive/<UTC
timestamp>/` directory with a `MANIFEST.md` that makes restoring mechanical.
Nothing is deleted; the rest of the repo is untouched; the user reviews the
resulting dirty tree and commits it themselves.

## Contracts

- **Allowed paths only.** `GOALS.md`, `logs/`, `.loop/`, `.auto-loop/` move
  whole. `ARCHITECTURE.md`, `PLAN.md`, and `scripts/auto-loop.py` may be user
  work — diff each against the bootstrap templates when accessible (template
  unreachable → treat as customized) and **ask per file**: archive, skip, or
  show diff. `CLAUDE.md` and `.gitignore` get only their loop-managed
  section/entries excised, with the excised text saved into the archive.
  `.claude/settings.local.json` is never touched — surface it for manual
  cleanup. Anything else is out of scope; refuse and let the user do it by
  hand.
- **Preconditions, all hard:** confirm the target repo with the user; refuse
  on the skill-authoring repo itself; clean git tree; no mid-merge/rebase
  state; no running loop driver; `.archive/` not already in use (else have the
  user nominate another root and use it consistently everywhere); skip
  symlinked artifacts; refuse on nested git repos/worktrees inside artifact
  dirs.
- **Dry-run first.** Print the full move/excise plan and wait for an explicit
  "yes" plus the per-file decisions. Silence is not consent. Never
  auto-commit.
- CLAUDE.md excision targets exactly the `## Autonomous build loop protocol`
  section (heading-level 2 to the next `## ` or EOF; headings inside code
  fences don't count). More than one match, or sub-sections not present in the
  current `auto-loop-bootstrap/assets/templates/CLAUDE.md` template → ask
  before excising. Preserve the user's original bytes (line endings, BOM) in
  whatever you archive.
- **Flip-back trigger.** This skill is user-invoked (`disable-model-invocation:
  true`) because its contract waits for an explicit yes per file. The day
  `graduation-gate` calls it non-interactively (sketched in
  `docs/cto-system-design.md` §5), both halves ship together: drop
  `disable-model-invocation` from the frontmatter, and add a non-interactive
  mode that takes its per-file decisions from the caller — so the yes still
  exists, just gathered earlier.
- Never overwrite an existing `.archive/<timestamp>/` — bump a suffix. Ensure
  the archive root ends up in `.gitignore`.
- The `MANIFEST.md` records: target, branch, timestamp, every move with its
  original path, each partial-file excision (file, lines, section title), the
  pristine-vs-customized classifications, and restore instructions.

## Your judgment

Exact commands, diffing mechanics, edge handling — yours, under the
constraints above. When ambiguity survives contact with the rules: ask, never
guess, never delete.
