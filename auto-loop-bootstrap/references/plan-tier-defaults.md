# Cadence and model guidance by Claude plan

Claude Code usage limits are plan-specific and reset on rolling 5-hour windows. Anthropic doesn't publish exact caps. Because the loop now runs **in-session** — one Claude Code session, `ScheduleWakeup` between iters — every iter is a warm session that reuses the prompt cache until auto-compact fires. That makes per-iter cost much lower than the previous fresh-session driver, but plan caps still matter.

Use the guidance below to pick a cadence and (optionally) a default model. Tune after observing real burn rate in your CC harness — every message shows its own cost on the status line.

## Max 20x ($200/mo)

**Run continuously.** Self-pace the loop (no fixed `ScheduleWakeup` interval) or use a tight 5–10 minute interval. Opus on every iter is fine. This plan is built for long-horizon agentic work — the loop is the use case.

> "Start the autonomous build loop." → the skill self-paces.

## Max 5x ($100/mo)

**Use Sonnet for iters, Opus for phase-boundary arch passes.** Set a 15-minute `ScheduleWakeup` cadence so the loop fits comfortably inside the 5-hour rolling cap. The skill's phase-boundary detection can opt up to Opus when the iter is a planning iter rather than a feature iter.

## Pro ($20/mo)

**Tight cadence, Sonnet only.** A 30–60 minute `ScheduleWakeup` interval, capped at ~5 iters per 5-hour window. Pro will throttle aggressively under continuous loop pressure — if you want serious autonomous build velocity, upgrade to Max 5x or 20x. Pro works for overnight runs with conservative scoping.

## API pay-as-you-go

**Token cost-conscious.** Sonnet by default; switch to Opus only when the agent flags a phase boundary or hard architectural iter. Per-iter cost in warm-session mode is typically $0.50–$2 on Sonnet (cache reads dominate), $1.50–$4 on Opus. Watch the harness's per-message cost display and stop the loop when your wallet says so — the loop doesn't track spend.

For API mode, prefer a 10–15 minute `ScheduleWakeup` cadence so the cache stays warm but you don't waste a full input-token bootstrap on each iter.

## How to watch burn rate

Claude Code's status line shows per-message input/output/cache token counts and a running cost estimate. After the first 3–5 iters of a fresh loop, eyeball:

- **Cache-read ratio.** Should be 60–90% of input tokens once the loop is warm. If it's near 0%, the harness is auto-compacting too often — bump the auto-compact threshold above 40% temporarily.
- **Output token volume per iter.** Healthy feature iter: 5k–20k. A 1k iter is probably a bookkeeping iter (backlog read, nothing shipped). A 50k+ iter is a fat-iter with parallel sub-agents — expected, but watch cumulative cost.
- **Iter wall-clock duration.** 4–15 minutes for feature iters, 15–40 minutes for fat-iters. Anything longer often means the agent is stuck in a verification loop.

If the loop is burning faster than you want, stop it (Ctrl-C / new prompt), tighten the cadence, or switch the default model down a tier.
