# Patterns — named, paste-ready pipeline shapes

These are the reusable Workflow shapes built on the canonical preamble
(`assets/preamble.js`). Each is a **copy-paste block**: paste it below
`export const meta = {...}` and the canonical preamble, then fill in the prompts
and the item list. They are plain JS, no imports, and use only the built-in
globals (`agent` / `parallel` / `pipeline` / `log` / `budget`). See
`runner-contract.md` for the surface they bind to.

Verdicts use the canonical `APPROVE | REVISE | BLOCK` grammar from the preamble —
do not introduce a competing verdict vocabulary.

---

## 1. adversarial-verify + judge-panel

Produce → hostile re-review → panel vote. `adversarialVerify` runs N refuters
that each try to **disprove** a claim and gates by refute-by-majority (uncertainty,
skips, deaths, and ties all resolve to REFUTED — the claim never gets the benefit
of the doubt). `judgePanel` scores N independent attempts against one rubric and
returns the winner plus the runner-up ideas worth grafting onto it.

```js
// ============================================================================
// CANON: adversarial-verify + judge-panel
// COPY-PASTE block — paste below `export const meta = {...}` and the preamble.
// NOT importable. Binds strictly to the runner contract: plain JS, no clock,
// no RNG, no fs/require/import. Uses ONLY built-in agent()/parallel()/log().
// ============================================================================

// ---- schema consts (JSON Schema; the harness validates + retries on mismatch) ----
const VERIFY_VOTE_SCHEMA = {
  type: "object",
  required: ["refuted", "confidence", "reason"],
  properties: {
    refuted: { type: "boolean" },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    reason: { type: "string" },
  },
  additionalProperties: false,
};

const JUDGE_SCHEMA = {
  type: "object",
  required: ["winner", "reason", "grafts"],
  properties: {
    winner: { type: "integer" }, // 0-based index into the attempts pool
    reason: { type: "string" },
    grafts: {
      type: "array",
      items: {
        type: "object",
        required: ["fromIndex", "idea"],
        properties: {
          fromIndex: { type: "integer" },
          idea: { type: "string" },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

// Default refute lenses. Override via opts.lenses (array); opts.lens is the
// single-lens shorthand. Each lens is framed to DISPROVE, not confirm.
const VERIFY_LENSES = [
  "a hostile reviewer who assumes the claim is FALSE and must find the counterexample",
  "an edge-case hunter probing boundary, empty, and overflow inputs",
  "a composition skeptic checking the claim holds when wired to its real callers",
  "a spec literalist checking the claim against the letter of the stated requirement",
];

function _verifyLenses(opts) {
  const o = opts || {};
  if (Array.isArray(o.lenses) && o.lenses.length) return o.lenses;
  if (o.lens) return [o.lens];
  return VERIFY_LENSES;
}

// adversarialVerify(claim, {n, lens|lenses, refuteBias}) -> {survives, votes, kills, total}
// Spins up n refuters in parallel, each told to DISPROVE the claim. A vote is a
// KILL when refuted===true. The claim SURVIVES only if a STRICT majority of
// returned votes fail to refute it (kills*2 < total). Uncertainty, skips,
// deaths, throws, and ties all resolve to REFUTED — the claim never gets the
// benefit of the doubt. refuteBias (default true) upgrades a low-confidence
// "survives" verdict into a kill.
async function adversarialVerify(claim, opts) {
  const o = opts || {};
  const lenses = _verifyLenses(o);
  const n = Math.max(1, o.n || lenses.length);
  const refuteBias = o.refuteBias !== false;

  const thunks = [];
  for (let i = 0; i < n; i++) {
    const lens = lenses[i % lenses.length]; // vary by index, never by RNG
    thunks.push(() =>
      agent(
        "You are " + lens + ".\n" +
        "Your job is to REFUTE this claim, not to confirm it. Default to refuted: " +
        "if you cannot establish the claim is true, set refuted=true.\n\n" +
        "CLAIM:\n" + claim + "\n\n" +
        "Return refuted (true if the claim fails or you are unsure), a confidence, " +
        "and a one-line reason citing the specific failure or the gap that blocks confirmation.",
        { label: "verify-" + i, phase: "adversarial-verify", schema: VERIFY_VOTE_SCHEMA }
      )
    );
  }

  // parallel() is a BARRIER — every refuter must report before we tally a
  // majority. A throwing thunk resolves to null (never rejects the batch).
  const raw = await parallel(thunks);

  const votes = raw.map((v, i) => {
    const lens = lenses[i % lenses.length];
    if (!v) {
      // null = skip/death/throw = NON-CONFIRMATION → kill.
      return { refuted: true, confidence: "low", reason: "no vote returned (skip/death) — defaulted to refuted", lens };
    }
    const killed = v.refuted === true || (refuteBias && v.confidence === "low" && v.refuted !== true);
    return { refuted: killed, confidence: v.confidence, reason: v.reason, lens, lowConfUpgraded: killed && v.refuted !== true };
  });

  const kills = votes.filter((v) => v.refuted).length;
  const total = votes.length;
  const survives = total > 0 && kills * 2 < total; // strict majority must NOT refute; a tie kills

  log('verify "' + String(claim).slice(0, 48) + '": ' + (total - kills) + "/" + total + " upheld -> " + (survives ? "SURVIVES" : "REFUTED"));
  return { survives, votes, kills, total };
}

// judgePanel(attempts[], scorePrompt) -> {winnerIndex, winner, reason, grafts, runnerUp}
// Scores N independent attempts against one rubric, returns the winner plus the
// runner-up ideas worth grafting onto it. On any malformed/failed/out-of-range
// verdict it DEFAULTS to attempt 0 (the first survivor) rather than inventing a
// winner. Returns null only if every attempt was null.
async function judgePanel(attempts, scorePrompt) {
  const pool = (attempts || []).filter(Boolean); // agent() returns null on skip/death
  if (pool.length === 0) return null;
  if (pool.length === 1) return { winnerIndex: 0, winner: pool[0], reason: "only one attempt", grafts: [], runnerUp: null };

  const numbered = pool
    .map((a, i) => "### ATTEMPT " + i + "\n" + (typeof a === "string" ? a : JSON.stringify(a)))
    .join("\n\n");

  const verdict = await agent(
    scorePrompt + "\n\n" +
    "Below are " + pool.length + " independent attempts (0-indexed). Pick the single best by the rubric.\n" +
    "Then list the BEST IDEAS from the NON-winning attempts that should be grafted onto the winner.\n\n" +
    numbered + "\n\n" +
    "Return winner (the 0-based index), reason, and grafts (each {fromIndex, idea}).",
    { label: "judge-panel", phase: "judge-panel", schema: JUDGE_SCHEMA }
  );

  let widx = 0; // default to attempt 0 on any judge failure
  if (verdict && Number.isInteger(verdict.winner) && verdict.winner >= 0 && verdict.winner < pool.length) {
    widx = verdict.winner;
  }
  const grafts = (verdict && Array.isArray(verdict.grafts) ? verdict.grafts : [])
    .filter((g) => g && Number.isInteger(g.fromIndex) && g.fromIndex !== widx && g.fromIndex >= 0 && g.fromIndex < pool.length && g.idea);

  return {
    winnerIndex: widx,
    winner: pool[widx],
    reason: (verdict && verdict.reason) || "defaulted to attempt 0 (judge unavailable)",
    grafts,
    runnerUp: grafts.length ? pool[grafts[0].fromIndex] : null,
  };
}
```

**Usage:**

```js
// Generate several candidate fixes, judge the best, then gate it through refute-by-majority.
const attempts = (await parallel(
  [0, 1, 2].map((i) => () => agent("Fix the off-by-one in paginate(); approach #" + i, { label: "attempt-" + i }))
)).filter(Boolean);

const { winner, grafts } = await judgePanel(attempts, "Score by correctness, then minimal diff. Rubric: passes the failing test; no new allocations.");

const merged = winner + (grafts.length ? "\n\nGRAFTED IDEAS:\n" + grafts.map((g) => "- " + g.idea).join("\n") : "");

const { survives, votes } = await adversarialVerify(
  "This patch fixes the off-by-one without regressing empty-page handling:\n" + merged,
  { n: 3 } // uses the 4 default lenses round-robin; refuteBias on by default
);

if (!survives) log("REFUTED — " + votes.filter((v) => v.refuted).map((v) => v.reason).join("; "));
```

---

## 2. loop-until-dry + completeness-critic

Keep working a queue until it's drained. `loopUntilDry` repeatedly runs a round
function until K consecutive rounds surface zero NEW items (deduped against a
shared Set), bounded by a hard `maxRounds` ceiling so it always halts.
`completenessCritic` is an adversarial "what is MISSING?" pass that makes a
natural round function — each pass hunts new gaps until the well runs dry.

```js
/* ============================================================================
 * CANON: loop-until-dry + completeness-critic
 * Paste this block below `export const meta = {...}` and the preamble.
 * It is NOT a module: there is no import/require at runtime. Reuse = paste.
 *
 * Binds strictly to the runner contract:
 *  - uses ONLY the built-in globals: agent() / parallel() / pipeline() / log()
 *    (+ budget, which the runner also provides).
 *  - NEVER reads the clock or calls RNG built-ins (would break resume).
 *    All variation is by ROUND INDEX and LABEL only.
 *  - plain JavaScript (no TS), self-contained, no filesystem.
 *  - agent() may return null on skip/death → always guarded / .filter(Boolean).
 * ========================================================================== */

/* Schema for the completeness critic. JSON Schema; the harness validates at the
 * tool layer and the agent retries on mismatch. */
const COMPLETENESS_SCHEMA = {
  type: "object",
  required: ["saturated", "gaps"],
  properties: {
    saturated: { type: "boolean" }, // true => critic found nothing material missing
    gaps: {
      type: "array",
      items: {
        type: "object",
        required: ["dimension", "item", "why", "severity"],
        properties: {
          dimension: { type: "string" }, // which dim of `dims` this gap belongs to
          item: { type: "string" },      // the specific missing thing (stable, dedupe-able)
          why: { type: "string" },       // why its absence matters
          severity: { type: "string", enum: ["low", "medium", "high"] },
        },
        additionalProperties: false,
      },
    },
  },
  additionalProperties: false,
};

/* Pure helper: keep only items whose seenKey hasn't been recorded yet.
 * Mutates `seen` (the shared dedupe Set). Drops null/undefined and null-keyed. */
function dedupeNew(items, seen, seenKey) {
  const fresh = [];
  for (const it of items) {
    if (it == null) continue;
    const k = seenKey(it);
    if (k == null || seen.has(k)) continue;
    seen.add(k);
    fresh.push(it);
  }
  return fresh;
}

/* loopUntilDry(roundFn, { dryRounds, seenKey, maxRounds })
 *
 * Repeatedly runs roundFn until it produces `dryRounds` CONSECUTIVE rounds with
 * zero NEW items (deduped against a shared Set), then stops. This is the
 * "keep going until the well runs dry" primitive — fan-out signal collection,
 * blind-hostile re-review, idea/gap enumeration — bounded so it always halts.
 *
 *  roundFn({ round, seen, found }) -> item | item[] | null
 *      `round` is the 0-based index (use it for label/variation — NOT the clock).
 *      `seen`  is the live dedupe Set (size = gaps already found).
 *      `found` is the running count of accepted-unique items.
 *      May return a scalar, an array, or null; all are normalized.
 *
 *  opts.dryRounds (default 2): K consecutive empty rounds required to stop.
 *  opts.seenKey  (default identity for strings, JSON.stringify otherwise):
 *      item -> string|null. The dedupe identity. Pick a STABLE projection.
 *  opts.maxRounds (default 12): hard ceiling so a never-drying round can't run
 *      away (and can't blow the lifetime agent cap). dried=false signals it hit
 *      the ceiling without converging — caller can escalate.
 *
 * Returns { items, rounds, dried, seen }.
 */
async function loopUntilDry(roundFn, opts) {
  const dryRounds = (opts && opts.dryRounds) || 2;
  const seenKey =
    (opts && opts.seenKey) ||
    ((x) => (typeof x === "string" ? x : JSON.stringify(x)));
  const maxRounds = (opts && opts.maxRounds) || 12;

  const seen = new Set();
  const all = [];
  let consecutiveDry = 0;
  let round = 0;

  while (consecutiveDry < dryRounds && round < maxRounds) {
    const out = await roundFn({ round, seen, found: all.length });
    const batch = Array.isArray(out) ? out : out == null ? [] : [out];
    const fresh = dedupeNew(batch, seen, seenKey);

    if (fresh.length === 0) {
      consecutiveDry += 1;
    } else {
      consecutiveDry = 0;
      for (const f of fresh) all.push(f);
    }

    log(
      `loopUntilDry round ${round}: ${fresh.length} new (` +
        `${batch.length - fresh.length} dup), dry ${consecutiveDry}/${dryRounds}, ` +
        `total ${all.length}, budget left ${budget.remaining()}`,
    );
    round += 1;
  }

  return { items: all, rounds: round, dried: consecutiveDry >= dryRounds, seen };
}

/* completenessCritic(artifact, dims, opts) -> gap[]
 *
 * Adversarial "what is MISSING?" pass over an artifact across named dimensions.
 * Asks ONLY for absences (not a restatement of what's present), and is told how
 * many gaps prior passes already found so it hunts NEW ones — which makes it a
 * natural roundFn for loopUntilDry: each pass surfaces fresh gaps until dry.
 *
 *  artifact: string or object (the thing under review).
 *  dims:     string[] of completeness dimensions to probe.
 *  opts.round / opts.seen: forwarded by loopUntilDry (round-index labelling +
 *      prior-gap count for the "don't repeat" instruction). NEVER the clock.
 *  opts.agentType / opts.model: optional passthrough to agent().
 *
 * Returns a (possibly empty) array of gap objects matching COMPLETENESS_SCHEMA.gaps.
 * Empty array == this pass found nothing new (drives loopUntilDry toward dry).
 */
async function completenessCritic(artifact, dims, opts) {
  const dimensions =
    dims && dims.length
      ? dims
      : ["correctness", "edge-cases", "failure-modes", "coverage"];
  const round = (opts && opts.round) || 0;
  const known = (opts && opts.seen && opts.seen.size) || 0;

  const res = await agent(
    `You are an adversarial completeness critic (pass ${round}). ` +
      `Do NOT restate what is present.\n` +
      `Answer ONLY: what is MISSING from this artifact, across these dimensions:\n` +
      `${dimensions.map((d) => `- ${d}`).join("\n")}\n\n` +
      `${known} gaps were already reported in prior passes — do NOT repeat them; ` +
      `find NEW gaps only.\n` +
      `If nothing material is missing, set saturated=true and gaps=[].\n\n` +
      `ARTIFACT:\n${typeof artifact === "string" ? artifact : JSON.stringify(artifact)}`,
    {
      label: `completeness-critic-${round}`,
      phase: "completeness",
      schema: COMPLETENESS_SCHEMA, // → validated object; harness retries on mismatch
      agentType: opts && opts.agentType,
      model: opts && opts.model,
    },
  );

  if (!res) return []; // agent() returned null (skip/death) → treat as a dry pass
  return res.saturated ? [] : res.gaps || [];
}
```

**Usage:**

```js
// Drive the completeness critic to saturation: keep asking "what's missing?"
// until 2 consecutive passes surface zero NEW gaps, deduping by dimension+item.
phase("completeness");
const plan = (args && args.plan) || "function add(a, b) { return a + b }";
const dims = ["edge-cases", "failure-modes", "types", "concurrency"];

const { items: gaps, dried, rounds } = await loopUntilDry(
  ({ round, seen }) => completenessCritic(plan, dims, { round, seen }),
  { dryRounds: 2, seenKey: (g) => `${g.dimension}::${g.item}` },
);

log(`completeness ${dried ? "saturated" : "hit ceiling"} after ${rounds} rounds; ${gaps.length} gaps`);
```

---

## 3. perspective-diverse-verify + worktree guidance

Run **exactly one verifier per distinct lens**, each boxed into a single
perspective so verdicts stay genuinely diverse instead of collapsing into one
generalist review. Uses `pipeline()` (not a barrier) because lenses are
independent. Per-lens verdicts use the canonical `APPROVE | REVISE | BLOCK`
grammar. The trailing comment block is **guidance** on when to pass
`isolation: "worktree"` to `agent()`.

```js
// ===================================================================
// CANON: perspective-diverse verification
// Paste below `export const meta = {...}` and the preamble.
// NOT importable. Plain JS. No clock/RNG. Built-in agent()/pipeline()/log().
// ===================================================================

// One verdict per lens, using the canonical APPROVE|REVISE|BLOCK grammar.
// Shape enforced at the tool layer; agent retries on mismatch.
const PERSPECTIVE_VERDICT_SCHEMA = {
  type: "object",
  required: ["lens", "verdict", "summary"],
  properties: {
    lens: { type: "string" },
    verdict: { type: "string", enum: ["APPROVE", "REVISE", "BLOCK"] },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    findings: { type: "array", items: { type: "string" } },
    summary: { type: "string" },
  },
  additionalProperties: false,
};

// Collapse lenses to DISTINCT, non-empty, order-preserving (case-insensitive).
// Pure: no clock, no RNG — identity comes from the lens text + its position.
function dedupeLenses(lenses) {
  const list = Array.isArray(lenses) ? lenses : [];
  const seen = {};
  const out = [];
  for (let i = 0; i < list.length; i++) {
    if (list[i] == null) continue;
    const lens = String(list[i]).trim();
    if (!lens) continue;
    const key = lens.toLowerCase();
    if (seen[key]) continue;
    seen[key] = true;
    out.push(lens);
  }
  return out;
}

// perspectiveVerify(target, lenses[], opts?) -> Promise<verdict[]>
// Runs EXACTLY ONE verifier per distinct lens, each boxed into a single perspective so
// verdicts stay genuinely diverse instead of collapsing into one generalist review.
// pipeline() (not a parallel() barrier): lenses are independent — nothing needs ALL verdicts
// before any can start, so let each lens flow + finish on its own. .filter(Boolean) drops
// skipped/dead agents. label varies by index (resume-safe; never the clock or RNG).
async function perspectiveVerify(target, lenses, opts) {
  const o = opts || {};
  const distinct = dedupeLenses(lenses);
  if (distinct.length === 0) return [];
  const subject = typeof target === "string" ? target : JSON.stringify(target, null, 2);

  const reports = await pipeline(
    distinct,
    (lens, _orig, i) =>
      agent(
        [
          "You are ONE verifier with a single, fixed perspective. Judge ONLY through this lens;",
          "do NOT broaden into other concerns — a sibling verifier owns each of those.",
          "",
          "LENS: " + lens,
          "",
          "TARGET UNDER VERIFICATION:",
          subject,
          "",
          "Return a verdict for THIS lens only (APPROVE | REVISE | BLOCK). Cite concrete findings;",
          "an empty findings list must mean you actively looked through this lens and found nothing.",
        ].join("\n"),
        {
          label: "verify:" + lens + "#" + i, // index-keyed → deterministic on resume
          phase: o.phase || "perspective-verify",
          schema: PERSPECTIVE_VERDICT_SCHEMA, // → validated object back; harness retries on mismatch
          model: o.model,
          agentType: o.agentType,
        },
      ),
  );

  const verdicts = reports.filter(Boolean); // agent() returns null on skip/death
  log("perspectiveVerify: " + verdicts.length + "/" + distinct.length + " lenses returned a verdict");
  return verdicts;
}

/* ===================================================================
 * REFERENCE (guidance, NOT code) — isolation:"worktree" on agent()
 * -------------------------------------------------------------------
 * agent(prompt, { isolation: "worktree" }) runs that agent in its own git
 * worktree. It is a COST you pay for SAFE PARALLEL FILE MUTATION — not a default.
 *
 * PASS isolation:"worktree" WHEN ALL of these hold:
 *   1. The agent WRITES/EDITS files in the repo (not read-only review/analysis), AND
 *   2. It runs CONCURRENTLY with siblings via pipeline()/parallel() (two agents
 *      editing one shared working tree at once corrupt each other's diffs), AND
 *   3. The slices touch overlapping paths OR you can't prove they're disjoint, AND
 *   4. Each slice is independently reintegrable (its own branch/PR/patch), so
 *      isolated trees can be merged back deliberately rather than racing in place.
 *
 * DO NOT pass it — leave isolation off (shared tree) — WHEN:
 *   - The agent is read-only: perspectiveVerify lenses, reviewers, planners,
 *     summarizers. They never mutate files, so a worktree is pure overhead.
 *   - Work is strictly SEQUENTIAL (a pipeline() chain where each stage hands the
 *     SAME evolving tree to the next): one writer at a time needs no isolation, and
 *     separate trees would HIDE each stage's edits from the next.
 *   - Slices are provably DISJOINT and you intend one combined diff in one tree.
 *   - The step does no file I/O at all (pure reasoning / schema extraction).
 *
 * MENTAL MODEL: isolation is concurrency control for the FILESYSTEM. Reach for it
 * exactly when "two agents mutating the same tree at the same time" is on the table.
 * perspectiveVerify() is the canonical NON-worktree fan-out: many agents, zero
 * writes — so it deliberately omits isolation. A parallel CODE-GEN fan-out
 * (one editor per slice) is the canonical worktree case.
 *
 * PITFALLS:
 *   - Worktree ⇒ edits land in a SEPARATE tree. Plan the merge-back (branch/PR per
 *     slice); don't expect changes in your main working tree automatically.
 *   - Don't blanket-set it on every agent "to be safe" — read-only agents in
 *     worktrees waste setup/teardown and add reconciliation work for nothing.
 *   - Still bound by the concurrency cap (min(16, cores-2)); isolation gates
 *     correctness of parallel writes, not how many run at once.
 *   - It changes WHERE files live, not the JS rules: no clock, no RNG, no import —
 *     unchanged inside a worktree agent.
 * =================================================================== */
```

**Usage:**

```js
// inside an async workflow body, after `export const meta = {...}` + the preamble above:
const target = (args && args.diff) || "function add(a,b){ return a - b; }";
const lenses = (args && args.lenses) || ["correctness", "security", "performance", "readability"];
const verdicts = await perspectiveVerify(target, lenses, { phase: "review" });
const blocking = verdicts.filter((v) => v.verdict === "BLOCK");
log(blocking.length ? "BLOCKED by: " + blocking.map((v) => v.lens).join(", ") : "all lenses clear");
```

---

## Putting it together — emit to the audit ledger

After a gate produces a verdict, append a typed record (from the canonical
preamble's `AUDIT_LEDGER_ENTRY_SCHEMA`) so the governance layer reads structured
truth, not a transcript:

```js
const reviews = (await pipeline(prs,
  (pr, _o, i) => agent(`Review ${pr}`, { label: tag("review", i), schema: AUDIT_LEDGER_ENTRY_SCHEMA }))
).filter(Boolean);
for (const r of reviews) log(`${r.role} ${r.verdict} → ${gateForVerdict(r.verdict)} (${r.cost.tokens_out} out)`);
```
