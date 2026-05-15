---
name: archive-loop-scaffolding
description: Non-destructively archive autonomous-build-loop scaffolding from a target repo into a gitignored `.archive/` directory keyed by timestamp. Use when the user wants to "clean up the loop", "tear down auto-loop", "archive loop files", "remove build loop scaffolding", "uninstall the autonomous loop", or otherwise revert a repo that was bootstrapped via `auto-loop-bootstrap`. Conservative — only touches known loop artifacts, never deletes, and preserves user content in mixed files (CLAUDE.md, .gitignore) by excising only the loop-managed sections.
---

# Archive Loop Scaffolding

## Overview

Move every file the autonomous build loop scaffolded into `.archive/<timestamp>/`, leaving the rest of the repo untouched. The operation is recoverable: file contents are preserved verbatim and a `MANIFEST.md` is written into the archive root so a future restore is mechanical.

This skill is the inverse of `auto-loop-bootstrap`. It does not delete anything. When in doubt about whether a file is loop-managed, the skill asks the user — it never guesses.

## Safety contract

Run every check below before touching any file. Any failure → halt with a clear message; do not proceed.

1. **Confirm target repo.** Print the cwd and the current branch. Ask the user to confirm this is the right repo.
2. **Refuse on the skill-authoring repo.** If the cwd contains a sibling pair `auto-loop-bootstrap/SKILL.md` AND `autonomous-build-loop/SKILL.md`, HALT — the user is sitting inside the repo that *authors* these skills.
3. **Require a clean git tree.** `git status --porcelain` must be empty.
4. **Require a normal git state.** Refuse if any of these exist under `.git/`: `MERGE_HEAD`, `REBASE_HEAD`, `rebase-merge/`, `rebase-apply/`, `CHERRY_PICK_HEAD`, `REVERT_HEAD`, `BISECT_LOG`. A mid-rebase / mid-merge archive is not reversible.
5. **Refuse if a loop is running.** Run `pgrep -f 'scripts/auto-loop\.py'`. If anything matches, halt and tell the user to stop the loop first. A live driver will recreate files mid-archive.
6. **Check `.archive/` isn't already a user-tracked directory.** Run `git ls-files -- .archive 2>/dev/null | head -1`. If non-empty, the user already uses `.archive/` for something else — halt and ask them to nominate a different archive root (e.g. `.archive-loop/`); fall back to that name throughout the run if they agree.
7. **No symlinks among artifacts.** For each artifact path that exists, `test -L` must be false. If any is a symlink, surface it and skip — never follow.
8. **No nested git repos / submodules / worktrees inside artifact dirs.** For each artifact directory, fail-safe if `find <dir> -name .git -maxdepth 3` finds anything, or if `git worktree list` shows a worktree path inside any artifact path.
9. **No `--assume-unchanged` / `--skip-worktree` on artifact paths.** Run `git ls-files -v` and check the leading flag for each artifact. If any artifact line starts with `h`, `S`, or `s` (lowercase variants too), refuse — moves against such files behave surprisingly and the archive would not be cleanly reversible.
10. **Dry-run first.** Build the move plan, print it, wait for an explicit "yes". Silence is not consent.
11. **Never auto-commit.** Leave the working tree dirty for the user to review.

## Loop artifacts

These are the only paths this skill is allowed to touch:

| Path | Type | Action |
|------|------|--------|
| `GOALS.md` | file | move whole file |
| `ARCHITECTURE.md` | file | **always ask the user** — see "Possibly-customized files" below |
| `PLAN.md` | file | **always ask the user** — see "Possibly-customized files" below |
| `scripts/auto-loop.py` | file | **diff against template first** — see "Possibly-customized files" below |
| `logs/` | dir | move whole dir |
| `.loop/` | dir | move whole dir |
| `.auto-loop/` | dir | move whole dir if it exists (driver runtime; may be absent if loop never ran) |
| `CLAUDE.md` | file (partial) | excise only the `## Autonomous build loop protocol` section — see "Handling CLAUDE.md" |
| `.gitignore` | file (partial) | excise only the known loop entries (and adjacent loop comments) — see "Handling .gitignore" |
| `.claude/settings.local.json` | file | **do NOT touch.** Surface its existence to the user and let them clean it manually. |

Any path not in this table is out of scope. If the user asks to archive something else, refuse and tell them to do it by hand.

## Possibly-customized files

`ARCHITECTURE.md`, `PLAN.md`, and `scripts/auto-loop.py` may be either pristine bootstrap output or the user's customized work. The skill never archives these without asking.

For each one that exists in the target repo:

1. Read it.
2. If `~/.claude/skills/auto-loop-bootstrap/assets/` is accessible, read the corresponding template (`assets/templates/ARCHITECTURE.md`, `assets/templates/PLAN.md`, `assets/auto-loop.py`) and compute a unified diff after normalizing line endings.
3. Classify:
   - **Pristine** — content matches the template byte-for-byte after CRLF→LF normalization (placeholders like `{{PROJECT_NAME}}` may still be present; that's still pristine).
   - **Customized** — any other content.
   - **Template not accessible** — fall back to a conservative classification: treat as Customized.
4. In the preview, list each file with its classification and the diff hunk count for Customized ones. Ask the user per-file: archive, skip, or show full diff.

Do not apply a numeric line-count heuristic. Templates change; line-count thresholds rot.

## Handling CLAUDE.md

The bootstrap *appends* a `## Autonomous build loop protocol` section to a possibly-pre-existing CLAUDE.md. Never assume the whole file is loop-managed.

**Locate the section:**

1. Read CLAUDE.md. Keep two buffers in memory: `original` (the bytes as read, preserving CRLF and any BOM) and `normalized` (LF-only, BOM stripped). Use `normalized` for matching and computation; use `original` when saving the excised fragment to the archive.
2. Find lines matching the regex `^##[ \t]+Autonomous build loop protocol[ \t]*$` (case-sensitive on the title; tolerates extra spaces/tabs and trailing whitespace).
3. **Zero matches** → leave CLAUDE.md completely alone.
4. **More than one match** → halt and ask the user. The skill never guesses which one is the loop-managed one.
5. **One match** → proceed.

**Determine the section end:**

The section runs from the matched heading line through (whichever comes first):

- The next line matching `^## ` (a peer-level or higher heading — but not `### ` or deeper).
- EOF.

When scanning for the terminator, ignore lines inside fenced code blocks (track ```` ``` ```` and `~~~` open/close state). A `## ` inside a code fence is content, not a heading.

**Preserve user sub-sections:**

If the section contains `### ` headings whose titles are NOT in this known-template list, halt and ask the user before excising:

- `Inputs to read — by tier (not all every iter)`
- `Per-iteration loop`
- `Reading state`
- `Continuous loop`
- `Fat-iter mode`
- `Hard rules`

(Cross-check this list against the current `auto-loop-bootstrap/assets/templates/CLAUDE.md` when the skill runs — it may have evolved.)

**Apply the excision:**

1. Save the excised lines from the `original` buffer (CRLF and BOM preserved) to `.archive/<timestamp>/CLAUDE.md.loop-section`.
2. Concatenate the lines before the match with the lines after the terminator.
3. Collapse any run of more than two consecutive blank lines at the join seam down to one blank line.
4. Ensure the file ends with exactly one `\n`.
5. If the resulting file is empty or whitespace-only, treat CLAUDE.md as entirely loop-scaffolded: move the whole original file to `.archive/<timestamp>/CLAUDE.md` instead of writing back an empty file.
6. Write the result back to `CLAUDE.md`.

## Handling .gitignore

1. Read `.gitignore` and normalize line endings to LF in memory.
2. Locate any line whose stripped content matches one of these semantic equivalents:
   - `/.auto-loop/`, `.auto-loop/`, `/.auto-loop`, `.auto-loop`
   - `/.loop/claims/`, `.loop/claims/`, `/.loop/claims`, `.loop/claims`
3. For each matched line, also archive the immediately preceding line if it is a comment line (`^\s*#`) that unambiguously names the loop. Treat as a match only if it contains the literal `auto-loop`, OR both `autonomous` AND `loop`, OR both `loop` AND `scaffold`. Bare `loop` alone is too broad (`# Loop through results` would false-match) and must NOT match. Do not archive non-adjacent comments.
4. Save the archived lines, in original order with original whitespace, to `.archive/<timestamp>/.gitignore.loop-entries`.
5. Append a single line `.archive/` to the trimmed `.gitignore` if not already present (idempotent). If the user agreed to an alternative archive root in safety-check #6, append that name instead.
6. Write back. Do not touch any other line.

## Workflow

### Step 1 — Audit

Walk the artifact table against the actual filesystem. For each path: exists? type matches? tracked by git? Run the safety-contract checks. Compute the possibly-customized-files classification. Hold the results.

### Step 2 — Preview

Print the plan in this exact shape. The actual numbers come from Step 1.

```
ARCHIVE PLAN
target:    <cwd>
branch:    <branch>
timestamp: <UTC YYYYMMDD-HHMMSS>
root:      .archive/<timestamp>/

Move (pristine loop artifacts):
  GOALS.md
  logs/ (N files)
  .loop/ (M files)
  .auto-loop/ (K files)

Per-file decision needed:
  ARCHITECTURE.md   [classified: customized, 7 hunks vs template]   archive / skip / show diff?
  PLAN.md           [classified: pristine]                          archive / skip?
  scripts/auto-loop.py  [classified: pristine]                      archive / skip?

Excise sections from:
  CLAUDE.md      (1 section, ~85 lines; sub-sections all match template)
  .gitignore     (2 entries + 1 adjacent comment; will append `.archive/`)

Not touched (clean manually if desired):
  .claude/settings.local.json

Proceed? (yes / no — answer the per-file questions inline)
```

Wait for an explicit "yes" plus the per-file decisions.

### Step 3 — Execute

Pick `<timestamp>` = current UTC time as `YYYYMMDD-HHMMSS`. If `.archive/<timestamp>/` already exists, append `-2`, `-3`, etc. Never overwrite.

1. `mkdir -p .archive/<timestamp>`
2. For each whole-file or whole-dir artifact approved in the preview: use plain `mv` for everything. Let git see the operation as delete + add — the user can review the diff. (Skipping `git mv` keeps the semantics simple for partially-tracked dirs like `.loop/` where `state.json` is tracked but `claims/` is gitignored.) Preserve original relative paths under `.archive/<timestamp>/`.
3. Apply the CLAUDE.md and `.gitignore` excisions per the procedures above.
4. Ensure `.archive/` (or the user's nominated alternative) is present in the trimmed `.gitignore`.
5. Write `.archive/<timestamp>/MANIFEST.md` containing: target cwd, branch, UTC timestamp, exact list of moves with original paths, excision details for each partial-file edit (file → start_line–end_line and the section title that was excised), classification report (pristine vs. customized for `ARCHITECTURE.md` / `PLAN.md` / `auto-loop.py`), and the literal "restore" instructions: "to restore, copy each path back to its original location and re-append the saved CLAUDE.md and .gitignore fragments."

### Step 4 — Report

Print:

- Total files / dirs moved, archive root path.
- Per-file decisions taken (archived vs. skipped).
- Section excisions performed and where the excised text is saved.
- Anything skipped, with the reason.
- `scripts/` empty-dir note: if the directory is now empty, git won't show it — mention this so the user isn't surprised.
- Suggested next step: `git status` and `git diff` to review; commit when satisfied. Do NOT run those commands yourself.

## Anti-patterns

- Do not delete. Always move into `.archive/`.
- Do not touch paths outside the artifact table — even if they look loop-related. Ambiguity → ask, never delete.
- Do not overwrite an existing `.archive/<timestamp>/` directory. Bump the suffix.
- Do not modify `.claude/settings.local.json`.
- Do not auto-commit. The user reviews the diff first.
- Do not run on a dirty working tree, mid-rebase, mid-merge, or with the loop driver running.
- Do not use a numeric line-count heuristic to classify ARCHITECTURE.md / PLAN.md. Diff against the template or ask.
- Do not use `git mv`. Plain `mv` keeps partially-tracked dirs sane.
- Do not follow symlinks among artifacts. Skip and report.

## Known limitations (v1)

The skill does not handle these — surface them to the user if relevant rather than silently proceeding:

- **Git LFS pointers / `.gitattributes` clean-smudge filters** on artifact files. `mv` preserves the content but a later `.archive/` cleanup can orphan LFS objects.
- **Restoring CLAUDE.md / `.gitignore` excisions** is not mechanical — the saved fragments must be merged back by hand if those files have changed in the meantime. Full-file restores ARE mechanical (`mv` back).
- **Identifying loop-related keys inside `.claude/settings.local.json`** — the skill refuses to touch it; the user cleans it manually.
