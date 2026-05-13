# Auto-loop budget defaults per Claude plan

Claude Code limits are plan-specific and reset on rolling 5-hour windows. Anthropic doesn't expose exact caps via API — these are conservative defaults the auto-loop driver enforces. Adjust after observing real burn rate.

## Recommended `auto-loop.py` flags by plan

### Max 20x ($200/mo)

```bash
python3 scripts/auto-loop.py
```

Built-in defaults work. `--msgs-per-5h 800` (~10% margin under ~900 plan cap), `--min-interval 600`, `--max-interval 3600`, `--max-budget-usd-per-iter 5`.

### Max 5x ($100/mo)

```bash
python3 scripts/auto-loop.py \
  --msgs-per-5h 200 \
  --min-interval 1200 \
  --max-budget-usd-per-iter 3
```

Plan cap is ~225 msgs/5h. Tighter min-interval (20 min) keeps the loop comfortably within bounds and gives more headroom for ad-hoc usage outside the loop.

### Pro ($20/mo)

```bash
python3 scripts/auto-loop.py \
  --msgs-per-5h 40 \
  --min-interval 3600 \
  --max-budget-usd-per-iter 1.5 \
  --max-iters 10
```

Plan cap is ~45 msgs/5h. With 1-hour min-interval, the loop fits ~5 iters per 5h window. Use Max plan if you want to seriously autonomous-build — Pro will throttle aggressively.

### API pay-as-you-go

Use `--max-budget-usd-per-iter` as the primary control. The driver still tracks msg counts, but you'll likely set them very high and let dollar cap be the throttle:

```bash
python3 scripts/auto-loop.py \
  --msgs-per-5h 10000 \
  --msgs-per-week 100000 \
  --max-budget-usd-per-iter 5 \
  --min-interval 300
```

Add a daily wallet cap by stopping the script at the end of the day and capping `--max-iters` based on `target_daily_dollars / max_budget_usd_per_iter`.

## Observed burn rate (from prior ARK loop session)

For calibration — actual ARK iters in fat-iter mode typically used:

- **Per-iter cost:** $1.50–$4 (Opus 4.x) depending on feature complexity
- **Per-iter duration:** 4–15 minutes wall-clock
- **Per-iter input tokens:** 80k–250k (most is CLAUDE.md + memory + log reads)
- **Per-iter output tokens:** 5k–20k

Cache reads are ~70–90% of input tokens when iters are < 5 min apart. With fresh-session-per-iter (auto-loop driver), cache hit rate drops to ~0% so input tokens skew higher per iter. Net cost stays comparable because the cache discount applies to cache-read tokens only.

## Tuning loop after first 5 iters

Read `.auto-loop/usage.jsonl` and compute:

```bash
python3 -c '
import json, sys
records = [json.loads(l) for l in open(".auto-loop/usage.jsonl")]
total_cost = sum(r["cost_usd"] for r in records)
total_dur = sum(r["duration_s"] for r in records)
print(f"iters: {len(records)}")
print(f"total cost: ${total_cost:.2f}")
print(f"avg cost/iter: ${total_cost/len(records):.2f}")
print(f"avg duration: {total_dur/len(records):.0f}s")
print(f"commit rate: {sum(1 for r in records if r[\"committed\"])}/{len(records)}")
'
```

If avg cost > budget × 0.8 → drop `--max-budget-usd-per-iter` to force tighter scoping per iter.
If commit rate < 70% → iters are failing; investigate (likely a CLAUDE.md gap, missing test config, or the agent is hitting permission prompts).
