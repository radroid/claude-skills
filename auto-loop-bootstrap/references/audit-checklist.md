# Phase 1 audit — exact commands

Run these from the repo root and report findings as a checklist before scaffolding.

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
