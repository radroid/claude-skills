export const meta = {
  name: "autonomous-build-loop-fat-iter-dispatch",
  description:
    "The autonomous-build-loop fat-iter Phase-2 PARALLEL DISPATCH, mechanized as a worktree-isolated code-gen fan-out: one Class B implementation agent PER feature, each running with isolation:'worktree' (its own tree + branch, the canonical 'one editor per slice' case so concurrent writers can't corrupt a shared tree), owning that feature's DISJOINT file allowlist + the stop-rule. Refuses to dispatch when allowlists overlap (the parallel-write corruption vector). A dead/skipped slice is surfaced as BLOCKED, never silently dropped. Returns structured per-slice results for the main agent to integrate (Phase 3) and peer-review (Phase 4).",
  phases: [{ title: "fat-iter-dispatch", detail: "one worktree-isolated impl agent per feature" }],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Pasted from workflow-runtime/assets/preamble.js — the executable code (schema
// consts + helpers) is byte-identical to canon; surrounding comments are
// role-localized. There is no import/require, no filesystem, no clock, no RNG.
// Reuse = paste, not link.
// ════════════════════════════════════════════════════════════════════════════

// ── Unified VERDICT enum ─────────────────────────────────────────────────────
const VERDICT_VALUES = ["APPROVE", "REVISE", "BLOCK"];
// NOTE: these schema consts intentionally carry NO `$id`. They are pasted as one
// block and validated by value at the tool layer (no $ref registry), and several
// are embedded by value into the parents below — a shared `$id` would risk a
// "duplicate $id" rejection under stricter JSON-Schema validators.
const VERDICT_SCHEMA = {
  type: "string",
  enum: VERDICT_VALUES,
  description:
    "Unified adjudication verdict. APPROVE=ship (legacy PASS). " +
    "REVISE=fixable issues, re-enter the loop (legacy REQUEST_CHANGES). " +
    "BLOCK=premise/spec breakage, escalate.",
};

const ROLE_VALUES = ["planner", "executor", "reviewer", "fix", "steward", "auditor"];
const GATE_VALUES = ["proceed", "hold", "escalate"];

// ── Cost record ──────────────────────────────────────────────────────────────
const COST_SCHEMA = {
  type: "object",
  required: ["role", "label", "tokens_in", "tokens_out"],
  additionalProperties: false,
  properties: {
    role: { type: "string", enum: ROLE_VALUES },
    label: { type: "string", description: "agent() call label, e.g. 'review-3'." },
    model: { type: "string" },
    tokens_in: { type: "integer", minimum: 0 },
    tokens_out: { type: "integer", minimum: 0 },
    usd: { type: "number", minimum: 0 },
    retries: { type: "integer", minimum: 0 },
    ts: { type: "string", description: "ISO-8601; supplied via args or stamped post-return — NEVER clock-read inside the script." },
  },
};

// ── Checkpoint / resume-state record ─────────────────────────────────────────
const CHECKPOINT_SCHEMA = {
  type: "object",
  required: ["item", "stage", "status"],
  additionalProperties: false,
  properties: {
    item: { type: "string", description: "Backlog item ID — the ONE numbering scheme (never PR/slice #)." },
    stage: { type: "string", enum: ["plan", "execute", "review", "fix", "merge", "steward"] },
    status: { type: "string", enum: ["pending", "in_progress", "blocked", "done"] },
    pr: { type: "integer", minimum: 1 },
    branch: { type: "string" },
    spec_path: { type: "string" },
    last_verdict: VERDICT_SCHEMA,
    spent: { type: "number", minimum: 0, description: "budget.spent() captured at checkpoint." },
    ts: { type: "string", description: "Supplied via args / post-return; never clock-read." },
  },
};

// ── Append-only AUDIT LEDGER entry ───────────────────────────────────────────
const AUDIT_LEDGER_ENTRY_SCHEMA = {
  type: "object",
  required: ["role", "cost", "verdict", "issues", "tests_added", "gate_decision", "human_approval"],
  additionalProperties: false,
  properties: {
    role: { type: "string", enum: ROLE_VALUES },
    cost: COST_SCHEMA,
    verdict: VERDICT_SCHEMA,
    issues: {
      type: "array",
      description: "Reviewer-raised issues; empty [] on APPROVE.",
      items: {
        type: "object",
        required: ["severity", "note"],
        additionalProperties: false,
        properties: {
          severity: { type: "string", enum: ["blocking", "non_blocking"] },
          note: { type: "string" },
          anchor: { type: "string", description: "file:line." },
        },
      },
    },
    tests_added: { type: "integer", minimum: 0, description: "REVIEWER-authored tests attested (NO-SELF-MARKED-HOMEWORK)." },
    gate_decision: { type: "string", enum: GATE_VALUES },
    human_approval: {
      type: ["object", "null"],
      description: "null until a human signs off; prod-deploy gate is fail-closed.",
      required: ["approved", "by"],
      additionalProperties: false,
      properties: {
        approved: { type: "boolean" },
        by: { type: "string" },
        ts: { type: "string", description: "Supplied via args / post-return; never clock-read." },
      },
    },
    item: { type: "string" },
    pr: { type: "integer", minimum: 1 },
    ts: { type: "string", description: "Append time — supplied via args / post-return; never clock-read." },
  },
};

// ── Pure helpers (DETERMINISTIC — no clock, no RNG, safe under resume) ────────
function tag(label, index) {
  return label + "-" + index;
}
function isVerdict(v) {
  return VERDICT_VALUES.indexOf(v) !== -1;
}
function gateForVerdict(verdict) {
  if (verdict === "APPROVE") return "proceed";
  if (verdict === "REVISE") return "hold";
  return "escalate"; // BLOCK
}
// ════════════════════════════════════════════════════════════════════════════
// END CANONICAL PREAMBLE
// ════════════════════════════════════════════════════════════════════════════

// ── DISPATCH-SPECIFIC schema ──────────────────────────────────────────────────
// What each worktree-isolated Class B agent reports back.
const SLICE_RESULT_SCHEMA = {
  type: "object",
  required: ["feature", "branch", "files_written", "blockers", "status"],
  additionalProperties: false,
  properties: {
    feature: { type: "string" },
    branch: { type: "string", description: "the branch the slice landed on in its worktree" },
    files_written: { type: "array", items: { type: "string" } },
    blockers: { type: "array", items: { type: "string" }, description: "empty if none; non-empty → main agent decides" },
    status: { type: "string", enum: ["done", "blocked", "partial"] },
    out_of_allowlist: {
      type: "array",
      items: { type: "string" },
      description: "files the agent needed but were OUTSIDE its allowlist (stop-rule tripped) — main agent extends/refactors/drops",
    },
  },
};

// ── WHY worktree here (canon patterns.md §3) ──────────────────────────────────
// Parallel feature implementers MUTATE files concurrently and each slice is
// INDEPENDENTLY REINTEGRABLE (its own branch/PR). That is exactly the canonical
// worktree case ("one editor per slice"). NOTE the boundary: when slices are
// provably disjoint AND you intend ONE combined diff in ONE tree (direct-commit
// mode, pr_mode:false), the canon says DON'T worktree — use the shared-tree
// disjoint-allowlist dispatch instead, since separate trees would just add
// merge-back overhead. THIS script is the per-feature-branch (pr_mode) form.

// Pure helper: find any path claimed by more than one feature's allowlist.
// Disjoint allowlists are a HARD RULE (fat-iter-mode.md) — overlap is a
// parallel-write corruption vector, so we refuse to dispatch on overlap.
// Ownership is tracked by feature INDEX, not name — two DISTINCT entries that
// happen to share a `feature` string must still clash on an overlapping path
// (name-based tracking would mask that real corruption vector). An entry listing
// the same path twice (same index) is a benign intra-feature dup, not a clash.
function overlappingPaths(features) {
  const ownerIndex = {};
  const ownerName = {};
  const clashes = [];
  for (let i = 0; i < features.length; i++) {
    const f = features[i];
    for (const p of f.allowlist || []) {
      if (ownerIndex[p] != null && ownerIndex[p] !== i) {
        clashes.push(p + " (claimed by '" + ownerName[p] + "' and '" + f.feature + "')");
      } else if (ownerIndex[p] == null) {
        ownerIndex[p] = i;
        ownerName[p] = f.feature;
      }
    }
  }
  return clashes;
}

// =====================================================================
// BODY — args may be undefined; inline constants are the safe fallback.
// =====================================================================
const iter = (args && args.iter) || "NNN";
const baseBranch = (args && args.baseBranch) || "main";
const features =
  (args && args.features) || [
    {
      feature: "archive-todos",
      scoping_plan_path: "plan/archive-todos.md",
      allowlist: ["convex/todos.ts", "convex/todos.test.ts", "src/TodoRow.tsx"],
      test_requirements: "archive hides a todo from the default list query; archived todos appear in the archived view",
    },
    {
      feature: "due-dates",
      scoping_plan_path: "plan/due-dates.md",
      allowlist: ["convex/due.ts", "convex/due.test.ts", "src/DueBadge.tsx"],
      test_requirements: "a due date in the past renders the overdue badge; null due date renders nothing",
    },
  ];

phase("fat-iter-dispatch");

// HARD RULE pre-check: refuse to dispatch into a parallel-write corruption state.
const clashes = overlappingPaths(features);
if (clashes.length > 0) {
  log("REFUSING TO DISPATCH — overlapping allowlists (parallel-write corruption vector):\n- " + clashes.join("\n- "));
  return {
    dispatched: false,
    reason: "overlapping allowlists",
    clashes: clashes,
    slices: [],
    blocked_count: features.length,
  };
}

log("dispatching " + features.length + " feature slice(s) for iter-" + iter + ", each in its own worktree off " + baseBranch);

// parallel() BARRIER: the main agent's Phase-3 integration needs ALL slices
// before it can integrate + verify, so we wait for the whole fan-out. Each agent
// runs with isolation:"worktree" (its own tree + branch). A throwing thunk
// resolves to null → we map it to a BLOCKED slice (never silently dropped).
const raw = await parallel(
  features.map((f, i) => () =>
    agent(
      "You are a Class B implementation agent for feature '" + f.feature + "', running in your OWN " +
        "git worktree off " + baseBranch + ".\n\n" +
        "Scoping plan: " + f.scoping_plan_path + " (read it; it is your full brief — the contract is " +
        "ALREADY decided there, do NOT redesign it).\n" +
        "Allowlist (the ONLY files you may write/edit):\n" +
        (f.allowlist || []).map((p) => "  - " + p).join("\n") + "\n\n" +
        "Test requirements: " + (f.test_requirements || "(see scoping plan)") + "\n\n" +
        "STOP-RULE: do NOT modify files outside the allowlist. If a file outside the list needs " +
        "changes, STOP, record it in out_of_allowlist with why, and let the main agent decide " +
        "(extend the allowlist / refactor first / drop the feature). Do NOT silently widen scope.\n" +
        "Verify YOUR scope only (the allowlist files + the tests you wrote) — do NOT run the full " +
        "repo test suite (that is the main agent's Phase-3 job).\n" +
        "Commit your work on a branch named 'iter-" + iter + "-" + f.feature + "'.\n\n" +
        "Return: feature, the branch you committed to, files_written, blockers (empty if none), " +
        "out_of_allowlist (empty if none), and status (done | partial | blocked).",
      { label: tag("impl", i), phase: "fat-iter-dispatch", isolation: "worktree", schema: SLICE_RESULT_SCHEMA },
    ),
  ),
);

// Map nulls (skip/death/throw) to BLOCKED slices — a missing slice is surfaced,
// never silently dropped (the dispatch-level twin of null-vote-is-a-kill).
const slices = raw.map((r, i) => {
  if (r) return r;
  return {
    feature: features[i].feature,
    branch: "iter-" + iter + "-" + features[i].feature,
    files_written: [],
    blockers: ["agent produced no result (skip/death) — re-dispatch or implement inline"],
    status: "blocked",
    out_of_allowlist: [],
  };
});

const blocked = slices.filter((s) => s.status === "blocked");
const partial = slices.filter((s) => s.status === "partial");
const stopRuleHits = slices.filter((s) => (s.out_of_allowlist || []).length > 0);

for (const s of slices) {
  log(
    s.feature + " [" + s.status + "] on " + s.branch + ": " + (s.files_written || []).length + " file(s)" +
      ((s.blockers || []).length ? "; blockers: " + s.blockers.join("; ") : "") +
      ((s.out_of_allowlist || []).length ? "; OUT-OF-ALLOWLIST: " + s.out_of_allowlist.join(", ") : ""),
  );
}
log(
  "dispatch done: " + (slices.length - blocked.length) + "/" + slices.length + " slices produced output, " +
    blocked.length + " blocked, " + partial.length + " partial, " + stopRuleHits.length + " hit the stop-rule" +
    "; budget left " + budget.remaining(),
);

// The main agent now does Phase 3 (integrate + verify across the merged tree) and
// Phase 4 (peer-review.workflow.js). Slices that are blocked / partial / stop-rule
// flagged need a main-agent decision BEFORE integration.
return {
  dispatched: true,
  iter: iter,
  slices: slices,
  blocked_count: blocked.length,
  partial_count: partial.length,
  stop_rule_count: stopRuleHits.length,
  needs_main_agent_decision: blocked.length > 0 || partial.length > 0 || stopRuleHits.length > 0,
};
