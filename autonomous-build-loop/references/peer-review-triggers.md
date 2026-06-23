# Peer-review triggers

Peer review is the loop's quality gate. Without it, the agent grades only its own work — which regresses fast on multi-iter horizons.

## Fat-iter rule (default)

EVERY fat-iter that lands one or more features runs a peer-review Class A sub-agent. No exceptions.

One reviewer per iter, not one per feature — a single reviewer reading all scoping plans + the integrated diff produces more coherent feedback than N narrow reviewers.

**Mechanized form (canon):** `assets/peer-review.workflow.js` runs this gate as an adversarial-verify pass — N hostile refuters, EACH over the whole integrated diff + all plans on a distinct lens (contract-drift / dead-code / test-gap / cross-feature-integration / hostile), refute-by-majority (null/dead vote = kill, tie = kill). It preserves the one-coherent-reviewer intent (each refuter reads everything) while diversity defeats the single-reviewer rubber-stamp. See SKILL.md "Canon & mechanism". Where no Workflow runner is exposed, fall back to a single Class A sub-agent with the charter below — the verdict grammar is identical.

## Legacy triggers (non-fat-iter only)

For bookkeeping iters, hygiene iters, architecture passes — spawn a peer-review sub-agent when ANY of these is true at the END of an iter:

1. **Cadence:** 5 iters have elapsed since the last peer review (counted from `logs/blocks.md` entries with `**Source:** peer-review`)
2. **Contract-surface touch:** the iter modifies any of:
   - Backend function files (e.g. `convex/**/*.ts` excluding `_generated/`)
   - Error-mapping / contract-glue files (e.g. `lib/mutationErrors.ts`)
   - Generated contract files (e.g. `convex/_generated/api.d.ts` — regen usually means a signature changed)
   - Plan / block files (e.g. `plan/P1-block-*.md`)
3. **Diff size:** `git diff HEAD~1` ≥ 300 lines net additions

If ANY trigger fires → spawn the reviewer.

## Charter template

```
Validate the changes since iter-NNN-K against the contracts in:
  - <scoping plan paths>
  - <type signature paths>
  - <error-mapping paths>

For each feature (or for the diff as a whole if non-feature):
  - Cite contract drift with file:line
  - Flag dead code (e.g. throw strings without byMessage entries; mutation names without MutationName entries)
  - Flag test gaps — anything that asserts implementation detail rather than contract behavior
  - Flag cross-feature integration risks (did sub-agents collide on shared dependencies despite the allowlist?)

Inputs to read:
  - The diff: `git diff <last-peer-review-sha>..HEAD`
  - The relevant scoping plan(s)
  - The error-mapping file
  - Latest contract-drift status (e.g. `logs/contracts-status.json`)

Verdict format (unified APPROVE|REVISE|BLOCK): APPROVE | REVISE | BLOCK
  (legacy approve → APPROVE; request_changes → REVISE; block → BLOCK)
```

## Verdict logging — ALWAYS log to `logs/blocks.md`

Regardless of verdict. This makes adoption auditable.

```markdown
## YYYY-MM-DD — Peer review iter-NNN [APPROVE|REVISE|BLOCK]

**Iter:** NNN
**Source:** peer-review (sub-agent)
**Severity:** low (approve) | medium (revise) | high (block)

**Charter:** <one-line charter>
**Trigger:** cadence | contract-surface | diff-size | fat-iter (default)
**Verdict text:** <sub-agent's verdict body>

**Action taken:** <main agent's response — applied edits / deferred / disagreed>
```

`BLOCK` and `REVISE` → log + continue per `references/continuous-loop.md`; never halt.

## Dashboard KPI

The dashboard surfaces "Iters since last peer review" as a derived KPI. If the count climbs above **7**, the trigger has failed and the cadence rule MUST fire on the next iter regardless of other conditions.

## Phase-boundary arch-pass (related but distinct)

The phase boundary triggers a `Skill`-tool invocation for `skill: "improve-codebase-architecture"` — NOT a peer-review sub-agent. The arch-pass is broader: it returns a structured refactor checklist informed by the project's CONTEXT.md and ADRs.

Log arch-pass output to `logs/blocks.md` with `**Source:** arch-pass`:

```markdown
## YYYY-MM-DD — Arch pass [phase-N → phase-N+1] (Skill: improve-codebase-architecture)

**Iter:** NNN
**Source:** arch-pass (Skill tool invocation)
**Trigger:** phase boundary | mid-phase scheduled (every 30 iters)

**Checklist returned by skill:** <bulleted list, verbatim from skill output>

**Action taken:** <items addressed this iter / queued for iter-NNN+1 / deferred with reason>
```

The dashboard surfaces "Iters since last arch pass" — if the count climbs past one phase boundary without an entry, the rule has failed and the next iter is a forced arch pass.
