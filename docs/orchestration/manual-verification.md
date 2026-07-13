# Manual verification queue — morning handoff

One entry per feature that needs a human eye; exact repro recipe each. This is a
first-class run deliverable, not a footnote. Visual outputs (video pacing, badge
legibility, diagram layout) always land here — build-green cannot see them.

## Queue

- [ ] **Interim un-annotated videos (A1 window, closes when A3 lands):** on
  kayvee-website run `timelapse.sh run --max-commits 2 --i-trust-this-repo`, open
  `.timelapse/<RUN_ID>/page-home/home.gif` — frames carry NO commit caption between
  A1 and A3 by design. Confirm acceptable; if A3 landed overnight this entry is moot.
- [ ] **Interim stitch pacing (A2 window, closes when A3 lands):** duplicates render
  as holds of the prior kept frame under v1 stitch math until A3's collapse modes
  land. Reviewer repro: fixture script in session scratchpad (`pr50` review),
  `timelapse.sh run --i-trust-this-repo`, open `page-home/home.gif` — check the
  sequence holds an extra beat around collapsed frames and never flashes discarded
  content. Moot if A3 landed overnight.
