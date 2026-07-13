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
| 2026-07-13T07:56Z | B1 | reviewer | PR #46 (wf_62700d78) | REVISE (degraded) | ~1102k | 16/26 agents done, 10 died on spend limit; ALL real ballots non-blocking; verdict = fail-closed artifact; orchestrator adjudicated to 5-issue fix list |
| 2026-07-13T08:05Z | A1 | reviewer | PR #47 (wf_f8a33ecf) | REVISE (degraded) | ~719k | 8/26 done, 18 died on spend limit; surviving ballots uphold all claims; adjudicated to 4-issue fix list |
| 2026-07-13T08:55Z | B1 | fix | PR #46 (293c6e4) | gate PASS | ~71k | 5/5 fixed, 0 contested; exit-code contract + YAML-root rejection verified live |
| 2026-07-13T09:00Z | A1 | fix | PR #47 (84dafeb) | gate PASS | ~72k | 4/4 fixed, 0 contested; kayvee restored byte-exact; surfaced timelapse.mjs rc-check seam → routed as A2 DELTA |
| 2026-07-13T09:10Z | B1 | reviewer | PR #46 hostile re-review | REVISE — 1 | ~80k | REAL free-hunt catch: valid-JSON non-mapping stdin writes corrupt config exit 0; 14 probes, 5 prior fixes verified live; review-yield floor satisfied |
| 2026-07-13T09:20Z | B1 | fix | PR #46 (a4341ee) | gate PASS | ~38k | 1/1 stdin shape check; orchestrator ran reviewer-authored gate test green from scratch checkout |
| 2026-07-13T09:35Z | A1 | reviewer | PR #47 hostile re-review | APPROVE | ~99k | dedup premise PROVEN: byte-identical decoded pixels across 2 captures of animated fixture; CSP + full_page + validation matrix all exercised; 2 free-hunt candidates failed to break it |
| 2026-07-13T09:50Z | A1 | steward | 9a7e84a | n/a | ~50k | 4 templates tuned, 7+1 friction resolved, changelog traced; A1 hard-gate CLEARED |
| 2026-07-13T10:10Z | B1 | executor | PR #49 (wf via agent) | gate PASS | ~123k | slice 2/2 extractor; 9/9 checks on 75-proof; determinism cmp + independent recompute; NUL-byte Write corruption caught+fixed; 5 deviations |
| 2026-07-13T10:20Z | A3 | planner | agent | n/a | ~145k | 34 anchors; EMPIRICAL: ffmpeg 8.1.1 lacks drawtext → Playwright banner PNGs + overlay, pipeline verified live; mp4.fps retirement exposed (blessed CFR 30) |
| 2026-07-13T10:25Z | B3 | planner | agent | n/a | ~151k | 2 slices, 34 anchors; git-archive walk design (0.08s/commit, no hooks); independently confirmed no-drawtext; corrected 75-proof first-parent count to 80 |
| 2026-07-13T10:30Z | A2 | executor | PR #50 | gate PASS | ~159k | 10/10 checks incl. real kayvee duplicate discard; 4 DELTAs applied; 4 blessed deviations; 5 friction notes |
| 2026-07-13T10:40Z | B1 | reviewer | PR #49 hostile re-review | REVISE — 1 (real) | ~102k | duplicate-node-id contract violation proven via hostile fixture; determinism spine survived ~40 attack candidates / 9 executed probes; NFD/NFC cross-machine note for B3 docs |
| 2026-07-13T10:55Z | B1 | fix | PR #49 (0da6d61) | gate PASS | ~69k | global-unique id assignment; 75-proof bytes unchanged; orchestrator gate-ran reproducer green → APPROVE recorded |
| 2026-07-13T11:00Z | B1 | steward | 21b6dc1 | n/a | ~57k | 2 templates tuned (control-byte gate, slice-N notes heading, literal acceptance commands); 5 friction resolved; B1 hard-gate CLEARED |
| 2026-07-13T11:20Z | A2 | reviewer | PR #50 hostile re-review | APPROVE — 0 issues | ~152k | engineered I3 drift attack passed at exact boundary; 6 resume attacks + SIGKILL reconverged; boot-skip contract verified; zero issues at bar (earned, not cheap: 51 tool uses) |
