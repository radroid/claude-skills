# Token ledger

One line per role run. Budgets are SOFT targets for steward outlier analysis, not
caps — quality outranks token savings.

Soft budgets: unseeded (seed after ~3 runs of real data; do not invent numbers).

| ts (UTC) | item | role | run/PR | verdict | tokens_out (approx) | notes |
|---|---|---|---|---|---|---|
| 2026-07-13T07:11Z | A1 | planner | wf_5ea1c4eb-886 | n/a | ~100k | 240-line spec, 34 anchors, 0 material gaps (split of 201k run total approx) |
| 2026-07-13T07:11Z | B1 | planner | wf_5ea1c4eb-886 | n/a | ~100k | 394-line spec, 34 anchors, 0 material gaps (split of 201k run total approx) |
| 2026-07-13T07:25Z | B1 | executor | PR #46 (wf_5645fb12-1e5) | gate PASS | ~91k | slice 1/2, 12 files, 3 logged deviations, 2 friction entries |
| 2026-07-13T07:35Z | A1 | executor | PR #47 (wf_f6918e66-fa5) | gate PASS | ~114k | 1 slice, 8/8 acceptance checks vs live kayvee, 3 deviations, 3 friction |
| 2026-07-13T07:30Z | B1 | reviewer | wf_fa916d63/wf_bd4572e4 | n/a | ~56k | 2 wasted dispatches: args arrived as JSON string, script saw undefined — wrapper hardened |
| 2026-07-13T07:52Z | A2 | planner | wf_b73c7eb0-7ad | n/a | ~134k | 33 anchors, 2 Open choices exposed for DELTA (blessed as primary), hermetic fixture-repo boot-skip proof |
| 2026-07-13T07:52Z | B2 | planner | wf_b73c7eb0-7ad | n/a | ~134k | 18 anchors, caught mermaid/roughjs handDrawnSeed nondeterminism (I1 landmine), pinned 11.16.0 |
