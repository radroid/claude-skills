# Log hygiene

The iter log is the loop's primary persistence surface. The user reviews these to understand what happened. Future iters read them to pick up the thread. Keep them tight.

## Iter log format

Path: `logs/iter-NNN.md`. Cap: **50 lines fat-iter mode**, **40 lines otherwise**, hard 60 under any condition.

```
# Iteration NNN — YYYY-MM-DD HH:MM
Phase: <0|1|2|3|...>
Features landed: <GOALS.md ids closed this iter, e.g. "P3.F, P3.I, P3.K" — empty for non-feature iters; expect 3–4 in fat-iter mode>
Closest GOALS.md item: <id, single line — feature-vs-infra guardrail>
Goals this iteration:
  - [done|wip|blocked] <goal>

Sub-agents dispatched:
  - impl-backend-<featureA>: <one-line outcome>
  - impl-client-<featureA>: <one-line outcome>
  - impl-backend-<featureB>: <one-line outcome>
  - impl-client-<featureB>: <one-line outcome>
  - ...one pair per feature (3–4 features = 6–8 Class B sub-agents)...
  - peer-review: <verdict; covers all features in this iter>

Did:
  - <bullet, max 8>

Decisions:
  - <only meaningful ones; include any coin-toss results>

Repeated-issue counter:
  - <issue-id>: <N> consecutive iterations

Next-iteration changes to approach:
  - <0–2 bullets>

Wake-up handoff:
  - Current phase: <phase>
  - Next step: <one sentence — name the 3–4 features for next iter (drop to 1–2 only when independence cannot be established)>
  - Open first: <files>
  - Open questions: <bullets, or "none">
  - Carry-forward to next iter: <≤2 short items; longer or recurring promotes to GOALS.md>
  - Push: <ok | skipped — <reason> | failed — <reason>>
  - Scheduled: <delaySeconds> via ScheduleWakeup  (in-session) — OR — Scheduled: external (EXTERNAL_SCHEDULER=1; driver handles cadence)
```

## The "Closest GOALS.md item" line

This is the **feature-vs-infra guardrail.** If three iters in a row name the same item without advancing it, the loop is in infra-runway — surface the pattern in the next iter's "Next-iteration changes" bullet and route back to feature work.

Do NOT estimate "iters remaining" — that pressure regresses convergence quality.

## Wake-up handoff

The handoff is a CONTRACT with the next iter (potentially in a fresh session). It must be self-contained — assume the next agent has not seen this conversation. Specifically:

- **Next step** must name files/features, not vague intentions ("continue the work" is useless; "iter-NNN — TournamentsListClient dirty-gate (carry from iter-159); open `components/admin/TournamentsListClient.tsx`" is useful)
- **Open first** lists exact file paths so the next iter can start fast without re-exploring
- **Carry-forward** is the ≤2-item short-term parking lot. Anything older than 2 iters promotes to `GOALS.md` — the handoff is NOT a permanent tracker

## `logs/latest.md` — the state file

`latest.md` is Tier 1 of the read manifest — read every iter, in every fresh session.
It IS the carried-forward "compacted knowledge"; treat it as the handoff contract, not
a log. **Overwrite it each iter (never append). Hard cap: 30 lines.**

The format is **prettier-stable** and must stay that way — the loop regenerates this
file every iter and a markdown formatter runs on commit. Every field is a single
`Label: value` line; the one multi-line section (`Last-iter shipped:`) comes LAST with
a blank line on each side. **Never put a `Label:` line directly after a bullet list** —
a formatter folds it into the list. Reproduce this shape exactly:

```
Latest: iter-NNN (YYYY-MM-DD) — <one-phrase summary>

Phase: <phase>
Next step: <one sentence — name the 3–4 features for the next iter>
Open first: <exact file paths>
Open blocks: <1-line, or "none" — lets the next iter skip logs/blocks.md>
Carry-forward: <≤2 items, semicolon-separated, or "none">

Last-iter shipped:

- <≤3 bullets — the compacted knowledge the next iter needs>
```

If `latest.md` is creeping over 30 lines, that is the signal Tier 1 has gone fat and
the per-iter cold-boot cost is climbing — trim it back.

## Growth control

- Each iter log: capped per above
- `logs/latest.md`: structured state file, overwrite each iter, 30-line hard cap (above)
- Every 10 iters: write `logs/summary-NNN.md` rolling up the previous decade (e.g. iters 161–170). Move the rolled-up individual iter files to `logs/archive/`.
- Active `logs/` directory never holds more than ~15 files

## `logs/blocks.md`

Structured log of everything that would normally halt the loop. Format per entry:

```markdown
## YYYY-MM-DD — <short title> [APPROVE|REQUEST_CHANGES|BLOCK|FAILURE|DRIFT]

**Iter:** NNN
**Source:** peer-review | arch-pass | smoke-failure | mcp-preflight | user-report | contract-drift
**Severity:** low | medium | high

**Charter / context:** <one line>
**Verdict text / failure detail:** <body>

**Action taken:** <main agent's response — applied edits / deferred / disagreed / queued for iter-NNN+1>
```

The dashboard surfaces "Iters since last peer review" and "Iters since last arch pass" as derived KPIs. If those counts climb past their cadence rules, the rule has failed — the next iter is a forced peer-review or arch-pass.

## What to write down vs what to leave to git

| Belongs in iter log | Belongs in git history (commit / diff) |
|---------------------|----------------------------------------|
| Why a decision was made | What lines changed |
| Sub-agent verdicts | Implementation detail |
| Carry-forward parking lot | Code that's already in the diff |
| Repeated-issue counters | LoC counts (the diff has these) |
| Token-runway state | Anything the file content already shows |

Don't duplicate the diff into the iter log. The log is for context the diff doesn't capture.
