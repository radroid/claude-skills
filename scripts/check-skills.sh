#!/usr/bin/env bash
# check-skills.sh — guard the pointers this repo depends on.
#
# Usage:
#   ./scripts/check-skills.sh
#
# Three checks:
#   (a) name discipline — every */SKILL.md declares a `name:` equal to its
#       directory, because Claude Code resolves skills by directory but the
#       frontmatter name is what the model sees.
#   (b) dist parity — every dist/*.skill has a source dir and every source dir
#       has a dist/*.skill, so a rename can't leave a stale package behind.
#   (c) cross-repo reach — the skills this repo invokes BY NAME but does not
#       own. WARN when one isn't installed (the reach just never fires); FAIL
#       when it is installed but carries `disable-model-invocation: true`,
#       which makes every by-name reach in this repo silently dead.
#
# One line per result. WARN never fails the run; any FAIL exits 1.
# Set CLAUDE_SKILLS_DIR to check against something other than ~/.claude/skills.

set -euo pipefail

if [ $# -gt 0 ]; then
  case "$1" in
    -h|--help)
      sed -n '2,19p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown argument: $1" >&2
      echo "usage: $0" >&2
      exit 2 ;;
  esac
fi

REPO_ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
DIST="$REPO_ROOT/dist"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# Skills this repo reaches for by name that live in someone else's repo.
# `prototype` is invoked by idea-to-loop at S0; `grilling` and `codebase-design`
# are reached from the delegation targets added in Task 5.
CROSS_REPO=(grilling codebase-design prototype)

failures=0
warnings=0

pass() { echo "PASS  $*"; }
warn() { echo "WARN  $*"; warnings=$((warnings + 1)); }
fail() { echo "FAIL  $*"; failures=$((failures + 1)); }

# Value of a frontmatter key from the block between the first two --- lines.
frontmatter() {
  awk -v key="$2" '
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---"      { exit }
    fm && index($0, key ": ") == 1 { print substr($0, length(key) + 3); exit }
  ' "$1"
}

# Does this SKILL.md turn off model invocation? Scoped to the frontmatter block
# so a skill that merely documents the key in prose does not trip the check.
model_invocation_disabled() {
  awk '
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---"      { exit }
    fm && $0 ~ /^disable-model-invocation:[[:space:]]*["'"'"']?true["'"'"']?[[:space:]]*$/ { found = 1; exit }
    END { exit(found ? 0 : 1) }
  ' "$1"
}

# --- (a) frontmatter name matches directory name ---------------------------

checked=0
names_ok=1
shopt -s nullglob
for skill_dir in "$REPO_ROOT"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  checked=$((checked + 1))
  declared="$(frontmatter "$skill_dir/SKILL.md" name)"
  if [ -z "$declared" ]; then
    fail "(a) $name/SKILL.md has no name: in its frontmatter"
    names_ok=0
  elif [ "$declared" != "$name" ]; then
    fail "(a) $name/SKILL.md declares name: $declared"
    names_ok=0
  fi
done
shopt -u nullglob
if [ "$checked" -eq 0 ]; then
  fail "(a) no skills found (looking for */SKILL.md under $REPO_ROOT)"
elif [ "$names_ok" -eq 1 ]; then
  pass "(a) frontmatter name matches directory — $checked skills checked"
fi

# --- (b) dist parity -------------------------------------------------------

parity=0
shopt -s nullglob
for skill_dir in "$REPO_ROOT"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  name="$(basename "$skill_dir")"
  if [ ! -f "$DIST/$name.skill" ]; then
    fail "(b) $name/ has no dist/$name.skill — run scripts/build.sh"
    parity=1
  fi
done
for pkg in "$DIST"/*.skill; do
  name="$(basename "$pkg" .skill)"
  if [ ! -f "$REPO_ROOT/$name/SKILL.md" ]; then
    fail "(b) dist/$name.skill has no source dir — stale package"
    parity=1
  fi
done
shopt -u nullglob
if [ "$parity" -eq 0 ]; then
  pass "(b) dist parity — every source dir has a .skill and vice versa"
fi

# --- (c) cross-repo skills we invoke by name -------------------------------

for name in "${CROSS_REPO[@]}"; do
  entry="$SKILLS_DIR/$name/SKILL.md"
  if [ ! -f "$entry" ]; then
    warn "(c) $name — not installed at $SKILLS_DIR/$name (by-name reaches will not fire)"
    continue
  fi
  if model_invocation_disabled "$entry"; then
    fail "(c) $name — installed but disable-model-invocation: true (by-name reaches from this repo are dead)"
  else
    pass "(c) $name — installed and model-invocable"
  fi
done

echo
if [ "$failures" -gt 0 ]; then
  echo "$failures failure(s), $warnings warning(s)"
  exit 1
fi
echo "all checks passed ($warnings warning(s))"
