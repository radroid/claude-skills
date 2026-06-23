# Super-reviewer

A **fresh-context, whole-repo, Class A** reviewer that vets decisions the loop is about to act
on. No session bias. Independent of the working agent's confirmation drift.

## When to fire it

Mandatory at exactly two points:

1. **Auto-delegated checkpoint** — `checkpoints.<gate>: "auto-delegated"` in `.loop/state.json`.
   The agent must run the super-reviewer *before* advancing the stage. See `lifecycle-stages.md`.
2. **Every feature PR in S3+** (S3 and beyond — see `lifecycle-stages.md`) — runs **alongside**
   CodeRabbit when CodeRabbit is available; **replaces** it when CodeRabbit is absent (CLI not
   installed) or unusable (private repo — CodeRabbit reviews public repos only). Feature-PR mode
   wires this in at step 8 (`feature-pr-mode.md`).

Do NOT fire it for:
- Per-iter peer reviews (already covered by the standard Class A peer-reviewer)
- Bookkeeping iters (planning, log archive, GOALS restructure)
- Architecture passes (the `improve-codebase-architecture` skill IS the review)

## How to invoke

```
Skill: superpowers:requesting-code-review
```

Fall back to a Class A sub-agent (per `sub-agent-protocol.md`) if the skill is absent.

**Mechanized form (canon):** `assets/perspective-verify.workflow.js` (`mode:"super-reviewer"`) runs this as perspective-diverse verification — exactly ONE verifier per distinct lens (architecture/ADR-consistency, contract, security, test-adequacy), aggregated worst-wins, failing CLOSED when a lens dies. See SKILL.md "Canon & mechanism". The design-review gate is the same script with `mode:"design"`.

### Repo-context pack (always include)

Pass the reviewer the following so it has whole-repo context without re-exploring:

- `ARCHITECTURE.md` — full file
- `docs/decision-log.md` — full file (lighter-weight judgments)
- `docs/adr/` — all files (heavyweight architectural decisions)
- `CONTEXT.md` if present
- For PR review: the integrated diff + every scoping plan from the iter
- For checkpoint review: the artifact being decided on (PRD section, stack rationale, scaffold
  manifest) + the decision the agent is about to take

## Verdict format

The reviewer returns exactly one verdict line plus body. Log to `logs/blocks.md` regardless.

```
VERDICT: APPROVE | REVISE | BLOCK
```

(Unified canon grammar. Legacy `REQUEST_CHANGES` → `REVISE` — same meaning.)

- `APPROVE` → proceed. Stage advance / PR merge.
- `REVISE` → fix listed items, re-run reviewer. Two-pass cap (same as CodeRabbit).
- `BLOCK` → halt the specific action; log to `logs/blocks.md`; loop picks next non-conflicting item
  per `continuous-loop.md`. The stage / PR does NOT advance.

## Cross-references

- `lifecycle-stages.md` — checkpoint gates that trigger this reviewer.
- `feature-pr-mode.md` — PR-level invocation in S3+.
- `sub-agent-protocol.md` — Class A charter (read-only, returns verdict only).
- `continuous-loop.md` — what to do with a `BLOCK` verdict.
