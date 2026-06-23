export const meta = {
  name: "autonomous-build-loop-peer-review",
  description:
    "The autonomous-build-loop Phase-4 PEER REVIEW, mechanized as an adversarial-verify pass: instead of one Class A reviewer that can rubber-stamp, run N hostile refuters — each over the WHOLE integrated fat-iter diff + all scoping plans, on a distinct peer-review lens (contract-drift / dead-code / test-gap / cross-feature-integration / hostile) — and gate by refute-by-majority (null/dead vote = kill, tie = kill). Emits the unified APPROVE|REVISE|BLOCK verdict (legacy approve|request_changes|block) and a zero-block-streak smell probe. A quality gate that is a pipeline STAGE, not a paragraph.",
  phases: [
    { title: "peer-review", detail: "N hostile refuters over the integrated diff (diverse lenses)" },
    { title: "anti-bias-smell-check", detail: "blind hostile re-review on a clean approve" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Pasted from workflow-runtime/assets/preamble.js — the executable code (schema
// consts + helpers) is byte-identical to canon; surrounding comments are
// role-localized. There is no import/require, no filesystem, no clock, no RNG.
// Reuse = paste, not link.
// ════════════════════════════════════════════════════════════════════════════

// ── Unified VERDICT enum ─────────────────────────────────────────────────────
// ONE grammar for every adjudicating role. For THIS peer-reviewer (legacy
// approve|request_changes|block): approve → APPROVE; request_changes → REVISE
// (fixable, fix same-iter); block → BLOCK (premise breakage, escalate/log + pick
// next non-conflicting item per continuous-loop.md).
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

// ── PEER-REVIEW lenses (the Phase-4 charter, mechanized as hostile refuters) ──
// peer-review-triggers.md's charter checks contract drift, dead code, test gaps,
// and cross-feature integration risk; sub-agent-protocol.md adds the "single
// coherent reviewer over ALL plans + the integrated diff" intent. Each lens is a
// refuter probing the WHOLE integrated diff (not one feature) so coherence is
// preserved while diversity defeats the single-reviewer rubber-stamp. Lenses are
// assigned round-robin BY INDEX (the runner forbids RNG).
const REFUTER_LENSES = [
  "contract-drift: signatures/return shapes in the diff drift from the scoping-plan contracts — cite file:line and the plan it violates",
  "dead-code: throw strings without a mapping entry, mutation/query names without a registry entry, unused exports, unreachable branches",
  "test-gap: tests assert implementation detail rather than contract behavior, OR a feature shipped with no REVIEWER-authored test / no runtime smoke oracle",
  "cross-feature-integration: sub-agents collided on a shared dependency DESPITE the disjoint allowlist, or each feature is fine but the COMPOSITION across features is broken",
  "hostile: assume the iter is WRONG; find the single load-bearing mistake the other lenses would miss",
];

function lensFor(i) {
  return REFUTER_LENSES[i % REFUTER_LENSES.length];
}
function lensKind(lens) {
  const cut = String(lens).indexOf(":");
  return cut === -1 ? String(lens) : String(lens).slice(0, cut);
}

// One refuter's ballot. refuted=true is a BLOCKING refutation at the >=0.80
// confidence bar. nonblocking=true registers a doubt below the bar without forcing
// the expensive BLOCK path. premise_break distinguishes a wrong-premise change
// (=> BLOCK) from a fixable defect (=> REVISE).
const REFUTER_BALLOT_SCHEMA = {
  type: "object",
  required: ["lens", "refuted", "confidence", "finding", "premise_break"],
  additionalProperties: false,
  properties: {
    lens: { type: "string" },
    refuted: { type: "boolean" },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    finding: { type: "string" },
    nonblocking: { type: "boolean" },
    premise_break: { type: "boolean" },
  },
};

// The blind hostile re-review verdict (zero-block smell probe).
const SMELL_SCHEMA = {
  type: "object",
  required: ["escaped_defect", "detail"],
  additionalProperties: false,
  properties: {
    escaped_defect: { type: "boolean" },
    detail: { type: "string" },
  },
};

// adversarialVerify: run N hostile refuters against ONE subject on diverse lenses,
// then gate by REFUTE-BY-MAJORITY. Returns { survives, refutedCount, total, votes }.
//
// parallel() is a BARRIER — justified here because the majority tally needs ALL
// ballots before it can decide. CRITICAL: do NOT .filter(Boolean) before the
// tally. A null ballot (skip / death / throw) is NON-CONFIRMATION → it counts as a
// REFUTED vote in the total. A subject never gets the benefit of a missing reviewer.
async function adversarialVerify(claim, subject, opts) {
  const o = opts || {};
  const n = o.n || REFUTER_LENSES.length;
  const phaseTag = o.phase || "peer-review";

  const raw = await parallel(
    Array.from({ length: n }, (_, i) => () =>
      agent(
        "You are a HOSTILE peer-reviewer on lens [" + lensFor(i) + "].\n" +
          "Read the FULL integrated diff + ALL scoping plans below. Your job is to REFUTE this " +
          "claim about the iter, not confirm it.\n\n" +
          "Claim: " + claim + "\n\n" + subject + "\n\n" +
          "Set refuted=true ONLY at >=0.80 confidence (the reviewer bar). " +
          "Below the bar, set refuted=false and nonblocking=true but STILL record the finding. " +
          "Set premise_break=true ONLY when the change cannot be salvaged by a local fix (a wrong " +
          "approach/spec) — a FIXABLE defect (a missing test, a contract tweak, dead code) is NOT a " +
          "premise break even when it makes the claim false: leave premise_break=false so it routes " +
          "to REVISE (fix same-iter), not BLOCK (escalate). " +
          "NEVER write code; give a one-line fix direction with file:line only.",
        { label: tag("refuter", i), phase: phaseTag, schema: REFUTER_BALLOT_SCHEMA },
      ),
    ),
  );

  const votes = raw.map((v, i) => {
    if (!v) {
      // null = skip / death / throw = NON-CONFIRMATION → defaulted to a refuted
      // ballot. A death is a kill REGARDLESS of confidence — it is intentionally
      // NOT subject to the >=0.80 bar applied to real ballots below.
      return {
        lens: lensFor(i),
        refuted: true,
        confidence: 0,
        finding: "no ballot returned (skip/death) — defaulted to refuted",
        nonblocking: false,
        premise_break: false,
      };
    }
    // CODE-ENFORCE the >=0.80 bar the schema models: a refutation below the bar is
    // downgraded to a NON-BLOCKING doubt, never a blocking kill.
    if (v.refuted && v.confidence < 0.8) {
      return {
        lens: v.lens,
        refuted: false,
        confidence: v.confidence,
        finding: v.finding,
        nonblocking: true,
        premise_break: false,
      };
    }
    return v; // already schema-validated; at/above the bar (or a non-refutation)
  });

  const refutedCount = votes.filter((v) => v.refuted).length;
  const total = votes.length;
  // Strict majority must NOT refute; a tie resolves to REFUTED (the hostile default).
  const survives = total > 0 && refutedCount * 2 < total;
  return { survives, refutedCount, total, votes };
}

// Collapse the ballots into the unified verdict + the typed issue list.
// APPROVE → upheld by a strict majority. BLOCK → refuted AND a premise break.
// REVISE → refuted by fixable defects only. Non-blocking doubts recorded either way.
function toVerdict(av) {
  const issues = [];
  const upheld = av.survives;
  for (const v of av.votes) {
    if (v.refuted) {
      // A minority refutation on an UPHELD claim is recorded but is NOT blocking —
      // the majority tally already cleared it. Only mark blocking when the claim
      // was killed; otherwise an APPROVE would carry blocking issues, violating the
      // ledger invariant (empty [] on APPROVE) and inflating the smell-probe count.
      issues.push({ severity: upheld ? "non_blocking" : "blocking", note: "[" + lensKind(v.lens) + "] " + v.finding });
    } else if (v.nonblocking) {
      issues.push({ severity: "non_blocking", note: "[" + lensKind(v.lens) + "] " + v.finding });
    }
  }
  if (av.survives) return { verdict: "APPROVE", issues };
  const premise = av.votes.some((v) => v.refuted && v.premise_break);
  return { verdict: premise ? "BLOCK" : "REVISE", issues };
}

// The exact verdict line, on the unified grammar.
function verdictLine(verdict, issueCount) {
  return verdict === "APPROVE" ? "VERDICT: APPROVE" : "VERDICT: " + verdict + " — " + issueCount + " issues";
}

// =====================================================================
// BODY — args may be undefined; inline constants are the safe fallback.
// =====================================================================
// Real callers pass { iter, diff, plans[] }. The orchestrator (main loop agent)
// supplies the integrated diff (e.g. `git diff <last-peer-review-sha>..HEAD`) and
// the scoping plans for the features that landed this iter.
const iter = (args && args.iter) || "NNN";
const diff =
  (args && args.diff) ||
  "--- a/convex/todos.ts\n+++ b/convex/todos.ts\n@@\n+ export const archive = mutation({ args: { id: v.id('todos') }, handler: async (ctx, a) => { await ctx.db.patch(a.id, { archived: true }); } });";
const plans =
  (args && args.plans) || [
    "plan/archive-todos.md: contract addTodo(text)->Id; archiveTodo(id)->void; test: archive hides from default query.",
  ];
const N = (args && args.refutersPerClaim) || REFUTER_LENSES.length;

const subject =
  "INTEGRATED DIFF (iter-" + iter + "):\n" + diff + "\n\n" +
  "SCOPING PLANS:\n" + plans.map((p, i) => "[" + (i + 1) + "] " + p).join("\n");
const claim =
  "The integrated changes for iter-" + iter +
  " are correct and land every feature against its scoping plan with no contract drift, dead code, test gap, or cross-feature breakage.";

phase("peer-review");
log("peer-reviewing iter-" + iter + " with " + N + " hostile refuters over " + plans.length + " plan(s)");

const av = await adversarialVerify(claim, subject, { n: N, phase: "peer-review" });
const cv = toVerdict(av);
const blockingCount = cv.issues.filter((x) => x.severity === "blocking").length;
const verdict = cv.verdict;
const gate = gateForVerdict(verdict);

// ── zero-block smell probe: a clean approve on a non-trivial diff is suspect. ──
phase("anti-bias-smell-check");
let smell = null;
if (verdict === "APPROVE" && String(diff).length > 200) {
  log("SMELL: clean approve on a non-trivial diff — blind hostile re-review");
  smell = await agent(
    "BLIND HOSTILE RE-REVIEW of iter-" + iter + ". You have ZERO streak context. The peer review " +
      "APPROVED this iter. Assume it rubber-stamped. Find the single most likely ESCAPED defect in " +
      "the integrated diff below:\n\n" + subject,
    { label: "blind-hostile-rereview", phase: "anti-bias-smell-check", schema: SMELL_SCHEMA },
  );
}

log(
  "iter-" + iter + " peer-review: " + verdictLine(verdict, blockingCount) + " → gate " + gate +
    " (" + av.refutedCount + "/" + av.total + " refuted; " +
    (cv.issues.length - blockingCount) + " non-blocking)" +
    (smell ? (smell.escaped_defect ? "; SMELL HIT: " + smell.detail : "; smell clean") : "") +
    "; budget left " + budget.remaining(),
);

// The orchestrator logs this to logs/blocks.md (always, per peer-review-triggers.md)
// and completes the AUDIT_LEDGER_ENTRY with cost / ts / tests_added / human_approval.
return {
  iter: iter,
  verdict: verdict,            // APPROVE → close iter; REVISE → fix same-iter; BLOCK → log + next item
  verdict_line: verdictLine(verdict, blockingCount),
  gate_decision: gate,
  issues: cv.issues,
  refuted: av.refutedCount,
  total: av.total,
  smell: smell,               // null, or { escaped_defect, detail } — a HIT re-opens review
  ledger_partial: {
    role: "reviewer",
    verdict: verdict,
    issues: cv.issues,
    gate_decision: gate,
  },
};
