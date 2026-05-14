# Fat-iter mode

Default for Phase 2+ implementation. Goal: **3–4 full features per iter**, **3–5 iters per phase**. Hard cap: 4 features per iter.

## Why fat-iter

The legacy 4-iter arc per feature (scope → backend → client → closeout) spent 40–60% of feature tokens re-booting context the agent already had cached. Fat-iter compresses multiple features into one iter via parallel implementation sub-agents.

## The four phases of a fat-iter

### Phase 0: Preconditions (main agent, ≤5% budget)

- `git status` clean (no leftover changes from a prior iter)
- Project dev watchers running where required (e.g. `npx convex dev` for Convex projects)
- MCP preflight reports all critical servers healthy
- Token runway is healthy (<70% used) — if approaching limits, drop to 1–2 features instead

### Phase 1: Scoping (main agent, ~10–20% budget)

Write one `plan/<feature>.md` PER feature. Each scoping plan contains:

- **Exact file paths to create or modify** (this becomes the sub-agent's allowlist)
- **Contract signatures** — mutation/query names + arg types + return shape. Fully decided here, NOT left to the sub-agent.
- **Test requirements** — file paths + which behaviors to cover
- **Peer-review charter** — what the Class A reviewer should verify post-integration

**Disjoint-allowlist hard rule:** the union of all sub-agent file allowlists must have NO duplicate paths. If two features both need to edit `lib/foo.ts`, do ONE of:

1. Extract a shared helper into a third file first (preferred when the shared concern is real)
2. Dispatch a third "shared-edits" sub-agent owning that file alone, with the other two referencing the contract
3. Drop one feature from this iter

Parallel writes to the same file from two sub-agents is a corruption vector — refuse to dispatch in that state.

The scoping plan IS the sub-agent brief. Be specific enough that implementation sub-agents don't need to ask clarifying questions.

### Phase 2: Parallel dispatch (sub-agents, ~60% budget)

Dispatch ALL sub-agents in a **single message** with multiple `Agent` tool calls so they run concurrently. Per feature, pair:

- **`impl-backend-<feature>`** (subagent_type: `general-purpose`) — writes backend + backend tests per scoping plan
- **`impl-client-<feature>`** (subagent_type: `general-purpose`) — writes client + client tests per scoping plan; references the backend contract from the scoping plan (NOT from reading the backend sub-agent's output — contract is decided in Phase 1)

For 3–4 features: 6–8 Class B sub-agents in one dispatch. The Class A peer-review sub-agent fires AFTER integration verifies (Phase 4), not in parallel with implementation.

Each sub-agent prompt MUST include the stop-rule boilerplate:

> Do not modify files outside this list: <allowlist>. If you believe a file outside the list needs changes, STOP and return what + why; the main agent decides.

### Phase 3: Integration + verification (main agent, ~20% budget)

Sequentially, in this order:

1. Full test suite (`npm test -- --run` for vitest, equivalent elsewhere)
2. Type check (`npx tsc --noEmit`)
3. Contract drift check (project-specific, e.g. `npm run check:contracts`)
4. E2E nightly if backend touched
5. **UI smoke + critique gate** if user-visible UI touched. Screenshot via chrome-MCP to `docs/screenshots/iter-NNN-<feature>.png`, then do a forced critique pass: open the screenshot and judge it against the design reference — mobile viewport, ≥44px touch targets, hierarchy, AA contrast. A green test suite is a binary signal the loop gets for free; frontend quality has none unless you manufacture one. **Do not close the iter on "it rendered."** Design-sensitive surface → dispatch a Class A `design-review` sub-agent instead of self-critiquing.

Fix any breaks **here**, not by re-dispatching a sub-agent. The integrated state is the main agent's responsibility.

### Phase 4: Peer review (always — one Class A sub-agent)

Charter: "Validate ALL features landed this iter against their respective `plan/<feature>.md`. For each feature: cite contract drift, dead code, test gaps, integration risks. Also surface cross-feature integration concerns (did sub-agents collide on shared dependencies despite the allowlist?)."

A single reviewer is more coherent than one-per-feature — the reviewer reads all scoping plans + the integrated diff.

Log result to `logs/blocks.md` regardless of verdict (see `references/peer-review-triggers.md`). `REQUEST_CHANGES` → fix same-iter.

### Phase 5: Closeout (main agent)

- Update `GOALS.md`
- Write iter log (cap 50 lines fat-iter mode)
- The iter log "Features landed:" bullet lists all `GOALS.md` ids closed this iter
- Commit `iter NNN: <one-line summary listing all features>`

## When NOT to fat-iter

- Phase-boundary architecture pass (one-shot refactor doesn't benefit from parallel impl)
- Bookkeeping iters (decade rollups, GOALS.md restructure) — these stay light
- User-decision-blocked items — skip the iter via longer `ScheduleWakeup`
- Carry-forward tail at end of phase when only single-file nits remain

## Counting feature independence

Two features can bundle in the same fat-iter ONLY if all of the following hold:

| Dimension | Check |
|-----------|-------|
| Schema | Independent tables / disjoint additive fields. No shared table. |
| API | No mutation or query shares both signatures. |
| Component tree | No shared component will be edited by both. |
| Tests | No shared test helper edit. |
| Generated files | No regen overlap (e.g. `_generated/api.d.ts`) that requires sequential write. |

If ANY dimension overlaps, either:

- Extract the shared concern into a third sub-agent owning that surface alone, OR
- Drop one feature, OR
- Sequence them across two iters
