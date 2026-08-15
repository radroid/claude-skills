#!/usr/bin/env bash
# install.sh — install this repo's skills into ~/.claude/skills/ under a profile.
#
# Usage:
#   ./scripts/install.sh                  # solo profile (default)
#   ./scripts/install.sh fleet            # every skill, incl. the fleet spine
#   ./scripts/install.sh solo --dry-run   # print the link/unlink plan, change nothing
#   ./scripts/install.sh --list           # per-skill invocation mode + context cost
#
# Ownership is by NAME. OWNED = the basename of every $REPO_ROOT/*/ that holds a
# SKILL.md. This script only ever creates, replaces or removes an entry in
# ~/.claude/skills/ whose basename is in OWNED. Every other entry there — skills
# installed from other repos, symlinked or copied — is never pruned and never
# touched.
#
# Profiles fall out of that discovery, so a new skill dir is installable the
# moment it exists:
#   fleet = OWNED
#   solo  = OWNED minus $FLEET
# Switching profiles removes the owned names that dropped out, but only when the
# entry is ours: a symlink resolving under $REPO_ROOT, or a plain directory left
# by an older copy-install. An owned NAME occupied by a symlink pointing
# somewhere else is a surprise — the script prints the target and exits 1 rather
# than clobbering it. Nothing is applied until the whole plan is conflict-free.
#
# Set CLAUDE_SKILLS_DIR to install somewhere other than ~/.claude/skills (tests).

set -euo pipefail

PROFILE=""
DRY_RUN=false
LIST=false

for arg in "$@"; do
  case "$arg" in
    solo|fleet)
      if [ -n "$PROFILE" ]; then
        echo "profile given twice: $PROFILE and $arg" >&2
        exit 2
      fi
      PROFILE="$arg" ;;
    --dry-run|-n) DRY_RUN=true ;;
    --list|-l)    LIST=true ;;
    -h|--help)
      sed -n '2,26p' "$0" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *)
      echo "unknown argument: $arg" >&2
      echo "usage: $0 [solo|fleet] [--dry-run] [--list]" >&2
      exit 2 ;;
  esac
done
PROFILE="${PROFILE:-solo}"

REPO_ROOT="$(cd -P "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
SKILLS_DIR="${CLAUDE_SKILLS_DIR:-$HOME/.claude/skills}"

# Skills installed only on the `fleet` profile; re-install when
# `graduation-gate` has its first app to enroll.
FLEET=(cto-governance-spine fleet-maintenance fleet-registry graduation-gate)

# --- helpers ---------------------------------------------------------------

# Is $1 present in the remaining arguments?
contains() {
  local needle="$1"; shift
  local item
  for item in "$@"; do
    [ "$item" = "$needle" ] && return 0
  done
  return 1
}

# Lexically collapse . and .. in an absolute path (no filesystem access), so a
# dangling symlink can still be classified as inside or outside the repo.
normalize() {
  local path="$1" out="" seg
  local IFS=/
  for seg in $path; do
    case "$seg" in
      ''|.) ;;
      ..)   out="${out%/*}" ;;
      *)    out="$out/$seg" ;;
    esac
  done
  printf '%s\n' "${out:-/}"
}

# Where does an existing entry actually point? Physical path for anything that
# resolves; the lexically-normalised link target for a dangling symlink.
entry_target() {
  local entry="$1" target
  if [ -d "$entry" ]; then
    (cd -P "$entry" && pwd -P)
    return 0
  fi
  target="$(readlink "$entry")"
  case "$target" in
    /*) ;;
    *)  target="$(dirname "$entry")/$target" ;;
  esac
  normalize "$target"
}

under_repo() {
  case "$1" in
    "$REPO_ROOT"|"$REPO_ROOT"/*) return 0 ;;
    *) return 1 ;;
  esac
}

# Character count of the `description:` value in a SKILL.md frontmatter block
# (between the first two --- lines). Descriptions here are single-line. A value
# may be wrapped in a matching pair of quotes (required when it contains `: `);
# the quotes are YAML syntax, not description text, so they are not counted.
# length() is bytes in a C locale and characters in a UTF-8 one; subtracting the
# UTF-8 continuation bytes gives the true character count under either.
description_chars() {
  LC_ALL=C awk '
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---"      { exit }
    fm && index($0, "description: ") == 1 {
      d = substr($0, 14)
      sq = sprintf("%c", 39)
      if (length(d) >= 2) {
        q = substr(d, 1, 1)
        if ((q == "\"" || q == sq) && substr(d, length(d), 1) == q) {
          d = substr(d, 2, length(d) - 2)
        }
      }
      n = length(d)
      c = gsub(/[\200-\277]/, "", d)
      print n - c
      exit
    }
  ' "$1"
}

# A skill is user-only when its frontmatter disables model invocation; those
# descriptions are not in the always-loaded context budget.
is_user_invoked() {
  awk '
    NR == 1 && $0 == "---" { fm = 1; next }
    fm && $0 == "---"      { exit }
    fm && $0 ~ /^disable-model-invocation:[[:space:]]*["'"'"']?true["'"'"']?[[:space:]]*$/ { found = 1; exit }
    END { exit(found ? 0 : 1) }
  ' "$1"
}

# --- discovery -------------------------------------------------------------

OWNED=()
shopt -s nullglob
for skill_dir in "$REPO_ROOT"/*/; do
  [ -f "$skill_dir/SKILL.md" ] || continue
  OWNED[${#OWNED[@]}]="$(basename "$skill_dir")"
done
shopt -u nullglob

if [ ${#OWNED[@]} -eq 0 ]; then
  echo "no skills found (looking for */SKILL.md under $REPO_ROOT)" >&2
  exit 1
fi

# Every fleet name must have a source dir, or the profile is a lie.
fleet_missing=""
for name in "${FLEET[@]}"; do
  if ! contains "$name" "${OWNED[@]}"; then
    fleet_missing="$fleet_missing $name"
  fi
done
if [ -n "$fleet_missing" ]; then
  echo "FLEET names with no source dir under $REPO_ROOT:$fleet_missing" >&2
  exit 1
fi

in_profile() {
  if [ "$PROFILE" = "fleet" ]; then return 0; fi
  if contains "$1" "${FLEET[@]}"; then return 1; fi
  return 0
}

# --- --list ----------------------------------------------------------------

if [ "$LIST" = "true" ]; then
  solo_chars=0; solo_count=0
  fleet_chars=0; fleet_count=0
  printf '%-34s %-6s %6s  %s\n' "SKILL" "MODE" "CHARS" "PROFILES"
  for name in "${OWNED[@]}"; do
    chars="$(description_chars "$REPO_ROOT/$name/SKILL.md")"
    chars="${chars:-0}"
    if is_user_invoked "$REPO_ROOT/$name/SKILL.md"; then
      mode="user"
    else
      mode="model"
    fi
    if contains "$name" "${FLEET[@]}"; then
      profiles="fleet"
    else
      profiles="solo,fleet"
    fi
    if [ "$mode" = "model" ]; then
      fleet_chars=$((fleet_chars + chars)); fleet_count=$((fleet_count + 1))
      if [ "$profiles" = "solo,fleet" ]; then
        solo_chars=$((solo_chars + chars)); solo_count=$((solo_count + 1))
      fi
    fi
    printf '%-34s %-6s %6s  %s\n' "$name" "$mode" "$chars" "$profiles"
  done
  echo
  echo "always-loaded description budget (model-invoked skills only):"
  printf '  solo  %6s chars across %s skills\n' "$solo_chars" "$solo_count"
  printf '  fleet %6s chars across %s skills\n' "$fleet_chars" "$fleet_count"
  exit 0
fi

# --- plan ------------------------------------------------------------------
#
# Pass 1 classifies every owned name and records an action. Any conflict is
# collected rather than acted on: if the plan has conflicts nothing is applied.

plan_names=()
plan_actions=()
plan_notes=()
conflicts=()
wanted=0

for name in "${OWNED[@]}"; do
  case "$name" in
    ''|.|..|*/*)
      echo "refusing to handle skill name: '$name'" >&2
      exit 1 ;;
  esac

  src="$REPO_ROOT/$name"
  entry="$SKILLS_DIR/$name"
  target=""

  if [ -L "$entry" ]; then
    target="$(entry_target "$entry")"
    if under_repo "$target"; then kind="ours-link"; else kind="foreign-link"; fi
  elif [ -d "$entry" ]; then
    kind="copy"
  elif [ -e "$entry" ]; then
    kind="other"
  else
    kind="absent"
  fi

  want=false
  if in_profile "$name"; then want=true; wanted=$((wanted + 1)); fi

  action=""
  case "$want:$kind" in
    true:absent)     action="link" ;;
    true:ours-link)
      if [ "$target" = "$src" ]; then action="keep"; else action="relink"; fi ;;
    true:copy)       action="replace" ;;
    false:absent)    action="none" ;;
    false:ours-link) action="unlink" ;;
    false:copy)      action="remove" ;;
    *:foreign-link)
      conflicts[${#conflicts[@]}]="$name -> $target (symlink outside $REPO_ROOT)" ;;
    *:other)
      conflicts[${#conflicts[@]}]="$name (not a directory or symlink)" ;;
  esac

  [ -n "$action" ] || continue
  plan_names[${#plan_names[@]}]="$name"
  plan_actions[${#plan_actions[@]}]="$action"
  plan_notes[${#plan_notes[@]}]="$target"
done

if [ ${#conflicts[@]} -gt 0 ]; then
  echo "refusing to install: owned names occupied by something we did not create" >&2
  for c in "${conflicts[@]}"; do
    echo "  $c" >&2
  done
  echo "resolve these by hand, then re-run" >&2
  exit 1
fi

# --- apply -----------------------------------------------------------------

if [ "$DRY_RUN" != "true" ]; then
  mkdir -p "$SKILLS_DIR"
fi

prefix=""
[ "$DRY_RUN" = "true" ] && prefix="would "

changed=0
i=0
while [ $i -lt ${#plan_names[@]} ]; do
  name="${plan_names[$i]}"
  action="${plan_actions[$i]}"
  note="${plan_notes[$i]}"
  src="$REPO_ROOT/$name"
  entry="$SKILLS_DIR/$name"
  i=$((i + 1))

  case "$action" in
    keep|none) continue ;;
    link)
      [ "$DRY_RUN" = "true" ] || ln -sfn "$src" "$entry"
      echo "  ${prefix}link     $name" ;;
    relink)
      [ "$DRY_RUN" = "true" ] || ln -sfn "$src" "$entry"
      echo "  ${prefix}relink   $name (was -> $note)" ;;
    replace)
      [ "$DRY_RUN" = "true" ] || { rm -rf "$entry"; ln -sfn "$src" "$entry"; }
      echo "  ${prefix}REPLACE  $name — copy-install directory replaced by a symlink (it was frozen at install time and ignored every source edit since)" ;;
    unlink)
      [ "$DRY_RUN" = "true" ] || rm -f "$entry"
      echo "  ${prefix}unlink   $name (not in profile $PROFILE)" ;;
    remove)
      [ "$DRY_RUN" = "true" ] || rm -rf "$entry"
      echo "  ${prefix}REMOVE   $name — copy-install directory removed (not in profile $PROFILE)" ;;
  esac
  changed=$((changed + 1))
done

summary="profile $PROFILE: $wanted of ${#OWNED[@]} owned skills linked in $SKILLS_DIR"
if [ "$DRY_RUN" = "true" ]; then
  echo "dry run — $summary; $changed change(s) pending, nothing written"
else
  echo "$summary; $changed change(s) applied"
fi
