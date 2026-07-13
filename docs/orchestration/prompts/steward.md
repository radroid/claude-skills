# Role contract: STEWARD

Self-improvement pass after each item's LAST PR. Non-deferrable.

## Inputs (dispatch parameters)

Reviewed-through PR number, item ID(s) covered.

## Contract

- Work in an ISOLATED git worktree. Touch ONLY `docs/orchestration/**`.
- Read: token-ledger.md, friction-log.md `## Open`, all role templates,
  prompt-changelog.md (KPI definitions live there).
- AUTO-TUNE templates where friction/ledger shows a repeating cost or defect class.
  Every edit targets a NAMED KPI and is logged in prompt-changelog.md as
  `date — item — template — change — KPI targeted`.
- Move addressed friction entries to `## Resolved` (keep original text, add a
  resolution note).
- ALWAYS leave a changelog line, even when tuning nothing:
  `date — reviewed through PR #n, no change — <why>`. Silence is not proof you ran.
- The contract lives in orchestrated-delivery/SKILL.md (The loop + ANTI-BIAS); do NOT
  fork divergent copies into the templates — re-derive from the single source.
- Commit on a `steward/<item>` branch; open a PR to the integration branch.

## Report (caveman)

`STEWARD DONE. changes: <n templates|none>. friction resolved: <n>. PR #n.`
