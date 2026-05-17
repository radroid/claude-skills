#!/usr/bin/env bash
# build.sh — package each skill source folder into a .skill file under dist/.
#
# Usage:
#   ./scripts/build.sh           # incremental: only rebuilds skills whose source changed
#   ./scripts/build.sh --force   # rebuild every skill unconditionally
#
# A .skill file is a zip archive of the skill directory (SKILL.md +
# bundled resources). Claude Code loads them either by extracting into
# ~/.claude/skills/ or by direct import.
#
# Incremental mode (default): a skill is rebuilt only if any source file is
# newer than the existing dist/<name>.skill, or if the dist file is missing.
# This prevents source changes in one skill from dirtying unrelated dist
# binaries in the working tree, which used to produce noisy diffs and merge
# conflicts on PRs touching shared dist/.

set -euo pipefail

FORCE=false
for arg in "$@"; do
  case "$arg" in
    --force|-f) FORCE=true ;;
    -h|--help)
      sed -n '2,17p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown argument: $arg" >&2
      echo "usage: $0 [--force]" >&2
      exit 2 ;;
  esac
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO_ROOT/dist"
mkdir -p "$DIST"

# Is the dist artifact out of date relative to its source?
#   $1 = source dir, $2 = output .skill path
# Returns 0 (true) when a rebuild is needed; 1 otherwise.
needs_rebuild() {
  local skill_dir="$1"
  local out="$2"
  [ ! -f "$out" ] && return 0
  [ "$FORCE" = "true" ] && return 0
  # Look for any source file newer than the output. Exclusions mirror the
  # zip command's -x list so noise files don't trigger spurious rebuilds.
  local newer
  newer=$(find "$skill_dir" \
    -not -name '.DS_Store' \
    -not -path '*/__pycache__/*' \
    -not -name '*.pyc' \
    -newer "$out" \
    -print -quit 2>/dev/null)
  [ -n "$newer" ]
}

# Find every directory at the repo root that contains a SKILL.md
shopt -s nullglob
built=0
skipped=0
for skill_dir in "$REPO_ROOT"/*/; do
  name="$(basename "$skill_dir")"
  case "$name" in
    dist|scripts|.git|.github) continue ;;
  esac
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    continue
  fi
  out="$DIST/$name.skill"

  if ! needs_rebuild "$skill_dir" "$out"; then
    skipped=$((skipped + 1))
    continue
  fi

  rm -f "$out"
  (cd "$REPO_ROOT" && zip -r -q "$out" "$name" -x "*/.DS_Store" "*/__pycache__/*" "*.pyc")
  size=$(du -h "$out" | awk '{print $1}')
  echo "  built $name.skill  ($size)"
  built=$((built + 1))
done

if [ "$built" -eq 0 ] && [ "$skipped" -eq 0 ]; then
  echo "no skills found (looking for */SKILL.md under $REPO_ROOT)" >&2
  exit 1
fi

if [ "$skipped" -gt 0 ]; then
  echo "$built skill(s) built, $skipped up-to-date, under $DIST/"
else
  echo "$built skill(s) packaged under $DIST/"
fi
