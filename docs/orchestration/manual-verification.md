# Manual verification queue — morning handoff

One entry per feature that needs a human eye; exact repro recipe each. This is a
first-class run deliverable, not a footnote. Visual outputs (video pacing, badge
legibility, diagram layout) always land here — build-green cannot see them.

## Queue

- [ ] **Interim un-annotated videos (A1 window, closes when A3 lands):** on
  kayvee-website run `timelapse.sh run --max-commits 2 --i-trust-this-repo`, open
  `.timelapse/<RUN_ID>/page-home/home.gif` — frames carry NO commit caption between
  A1 and A3 by design. Confirm acceptable; if A3 landed overnight this entry is moot.
