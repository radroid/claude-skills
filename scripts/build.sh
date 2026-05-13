#!/usr/bin/env bash
# build.sh — package each skill source folder into a .skill file under dist/.
#
# Usage: ./scripts/build.sh
#
# A .skill file is a zip archive of the skill directory (SKILL.md +
# bundled resources). Claude Code loads them either by extracting into
# ~/.claude/skills/ or by direct import.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST="$REPO_ROOT/dist"
mkdir -p "$DIST"

# Find every directory at the repo root that contains a SKILL.md
shopt -s nullglob
built=0
for skill_dir in "$REPO_ROOT"/*/; do
  name="$(basename "$skill_dir")"
  case "$name" in
    dist|scripts|.git|.github) continue ;;
  esac
  if [ ! -f "$skill_dir/SKILL.md" ]; then
    continue
  fi
  out="$DIST/$name.skill"
  rm -f "$out"
  (cd "$REPO_ROOT" && zip -r -q "$out" "$name" -x "*/.DS_Store" "*/__pycache__/*" "*.pyc")
  size=$(du -h "$out" | awk '{print $1}')
  echo "  built $name.skill  ($size)"
  built=$((built + 1))
done

if [ "$built" -eq 0 ]; then
  echo "no skills found (looking for */SKILL.md under $REPO_ROOT)" >&2
  exit 1
fi

echo "$built skill(s) packaged under $DIST/"
