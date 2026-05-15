# Tiered read strategy

Each iter runs in a fresh session (`claude -p`, no session persistence — or a new
in-session wake-up). **The prompt cache does NOT carry across iters.** Every iter
pays cache-*creation* rate on its entire cold-boot read payload. On a non-trivial
repo that is $4-8 of context bootstrap before any work happens.

There is no caching trick that fixes this — the cache is keyed to a process. The
only lever is **shrink the cold-boot payload**. Read by tier, not by habit.

## Tier 1 — always, every iter (keep this small)

| File | Why | Cap |
|------|-----|-----|
| `CLAUDE.md` | Protocol + conventions. Unavoidable. | project-controlled |
| `.loop/state.json` | Machine state — stage, iter, `pr_mode`, `pr_size_policy`. Absent → legacy non-PR mode. | small JSON |
| `logs/latest.md` | Human handoff — next features, files to open, open blocks, last-iter summary. This IS the carried-forward "compacted knowledge." | **30 lines hard** |
| `GOALS.md` | Backlog with status. | project-controlled |

That is the whole default read. Everything else is conditional.

## Tier 2 — read ONLY when the trigger fires

| File | Read it when |
|------|--------------|
| `ARCHITECTURE.md` (section-scoped) | The picked goal touches that subsystem. Full read ONLY at a phase boundary. |
| `PLAN.md` | Phase/sequence is genuinely in question (most iters: skip — `latest.md` carries the phase). |
| `docs/brand.md`, `docs/workflow/*` | The iter touches UI / that specific workflow. |
| `logs/blocks.md` | `latest.md`'s "Open blocks" line is non-empty AND you need the detail. The summary line usually suffices. |
| `AGENTS.md` | It exists AND diverges from `CLAUDE.md` (it normally shouldn't — it is a pointer). |

If the trigger does not fire, do NOT read the file. Reading "just in case" is the
habit that costs the money.

## Tier 3 — never read back

`logs/iter-NNN.md`, `logs/summary-*.md`, `logs/archive/**`. These are write-only
archives. Everything the next iter needs is in `latest.md`'s handoff. If you find
yourself wanting to read an old iter log, that is a signal `latest.md` lost
something it should have carried — fix the handoff, do not make archive-reading
routine.

## Ordering (minor cache benefit)

Within a single iter, sub-agents and multi-turn tool calls DO hit warm cache.
Read the stable file (`CLAUDE.md`) first and the volatile files (`latest.md`,
`GOALS.md`) last — the stable prefix is the part most likely to be reused within
the iter.

## Measuring the win

The driver writes `cache_creation_input_tokens` per iter to
`.auto-loop/usage.jsonl`. After adopting tiered reads, that number should drop.
If it does not, Tier 1 is too fat — `latest.md` is over its 30-line cap, or
`CLAUDE.md` / `GOALS.md` have grown and need a trim.
