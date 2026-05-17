# Phase 1 audit — exact commands

Run these from the repo root and report findings as a checklist before scaffolding.

## Greenfield-handoff detection (run FIRST)

Determines whether this is a direct brownfield bootstrap or the S2→S3 handoff from `idea-to-loop`. Sets behavior for Phase 2 (skip grilling if handoff) and Phase 4 (preserve existing GOALS / ARCHITECTURE / PLAN; rewrite `.loop/state.json` to S3).

```bash
# Signal 1: idea-to-loop wrote .loop/state.json at S2
test -f .loop/state.json && grep -q '"stage": *"S2"' .loop/state.json && echo "HANDOFF (signal: state.json S2)"

# Signal 2: PRD + non-trivial ARCHITECTURE (repo root)
if [ -f docs/PRD.md ] && [ -f ARCHITECTURE.md ] && [ "$(wc -l < ARCHITECTURE.md)" -gt 20 ]; then
  echo "HANDOFF (signal: PRD.md + ARCHITECTURE.md > 20 lines)"
fi
```

Either signal → greenfield-handoff mode. Neither → brownfield (default). See `SKILL.md` "Two invocation modes."

## File existence

```bash
for f in CLAUDE.md GOALS.md ARCHITECTURE.md PLAN.md .gitignore scripts/auto-loop.py logs/latest.md logs/blocks.md; do
  if [ -e "$f" ]; then echo "ok    $f"; else echo "MISS  $f"; fi
done
```

## Git state

```bash
git rev-parse --is-inside-work-tree && git rev-parse HEAD
```

If this fails, the repo isn't initialized — ask the user to `git init && git commit --allow-empty -m "init"` before continuing.

## Companion skill installed (REQUIRED)

The scaffolded CLAUDE.md template points at the `autonomous-build-loop` skill for the per-iter protocol. If that skill isn't installed at the user level, every loop iter will lack guidance and burn budget producing low-quality output.

```bash
test -f ~/.claude/skills/autonomous-build-loop/SKILL.md && echo "ok" || echo "MISS"
```

If MISS, halt the bootstrap and tell the user:

```
The companion skill 'autonomous-build-loop' is required but not installed.

Install via either:
  Option A (symlink from clone):
    git clone https://github.com/radroid/claude-skills.git ~/Documents/claude-skills
    ln -s ~/Documents/claude-skills/autonomous-build-loop ~/.claude/skills/autonomous-build-loop

  Option B (.skill release artifact):
    curl -L -o /tmp/autonomous-build-loop.skill \\
      https://github.com/radroid/claude-skills/releases/latest/download/autonomous-build-loop.skill
    unzip /tmp/autonomous-build-loop.skill -d ~/.claude/skills/

Restart Claude Code, then re-run the bootstrap.
```

Also check optional dependencies (warn but don't block):

```bash
test -f ~/.claude/skills/grill-me/SKILL.md && echo "grill-me ok" || echo "grill-me MISS (Phase 2 will fall back to brainstorming or manual Q&A)"
```

## CLAUDE.md protocol section

```bash
grep -ci "autonomous build loop\|per-iteration loop\|iter-NNN" CLAUDE.md 2>/dev/null
```

Result `0` → CLAUDE.md exists but lacks the protocol section → append it in Phase 4.

## GOALS.md backlog density

```bash
grep -cE "^\s*-\s*\[(\s|wip|blocked|done)\]" GOALS.md 2>/dev/null
```

- `0` actionable items → run Phase 2 interview
- `1–2` items → run a light Phase 2 to fill out
- `≥3` items → skip Phase 2

## `.gitignore` for `.auto-loop/`

```bash
grep -q "^/\.auto-loop/" .gitignore 2>/dev/null && echo "ok" || echo "MISS"
```

## Secrets check

Look for likely-secret files that should NOT be touched by the loop:

```bash
ls -la .env* secrets/ keys/ 2>/dev/null
```

If any exist, surface them to the user in Phase 3 → they go into `.claude/settings.local.json` denylist.

## Report format

Summarize as a single block back to the user:

```
Audit:
  [ok]   CLAUDE.md (protocol section present)
  [GAP]  GOALS.md — only 1 item, needs interview
  [MISS] ARCHITECTURE.md
  [MISS] logs/
  [ok]   .gitignore (but missing /.auto-loop/)
  [MISS] scripts/auto-loop.py
  Sensitive: .env detected → recommend denylist entry

Next: Phase 2 (grill-me interview) → Phase 4 scaffold of {ARCHITECTURE.md, logs/, scripts/auto-loop.py} → patch CLAUDE.md and .gitignore.
```
