export const meta = {
  name: "orchestrated-delivery-review-and-verify",
  description:
    "The orchestrated-delivery REVIEW step, mechanized: per-PR-claim pipeline → an adversarial-verify engine that runs N hostile refuters across five ANTI-BIAS lenses (rules 1–5), BLOCK/REVISE on majority-refute (null vote = kill, tie = kill), emits the unified APPROVE|REVISE|BLOCK verdict, and fires a zero-block-streak smell probe (rule 6). A reviewer gate that is a pipeline STAGE, not a paragraph.",
  phases: [
    { title: "review", detail: "per-claim adversarial-verify (N refuters / diverse lenses)" },
    { title: "anti-bias-smell-check", detail: "blind hostile re-review on a zero-block batch" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Pasted from workflow-runtime/assets/preamble.js — the executable code (schema
// consts + helpers) is byte-identical to canon; only this header comment is
// role-localized. There is no import/require, no filesystem, no clock, no RNG.
// Reuse = paste, not link. These are the typed contracts the governance audit
// ledger depends on; this script RETURNS verdict-bearing fields and the
// orchestrator completes the AUDIT_LEDGER_ENTRY (cost / ts / human_approval).
// ════════════════════════════════════════════════════════════════════════════

// ── Unified VERDICT enum ─────────────────────────────────────────────────────
// ONE grammar for every adjudicating role. For THIS reviewer (legacy APPROVE|BLOCK):
//   APPROVE → ship. A fixable, non-premise refutation → REVISE (re-enter fix loop).
//   Reserve BLOCK for premise/spec breakage (escalate to the orchestrator/human).
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
// The governance fields the steward + fleet-auditor read. This script builds the
// verdict-bearing fields; the orchestrator stamps cost/ts/human_approval.
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
// Default gate from a verdict. For prod-deploy, force 'hold' even on APPROVE
// until human_approval lands (fail-closed) — do that at the call site.
function gateForVerdict(verdict) {
  if (verdict === "APPROVE") return "proceed";
  if (verdict === "REVISE") return "hold";
  return "escalate"; // BLOCK
}
// ════════════════════════════════════════════════════════════════════════════
// END CANONICAL PREAMBLE
// ════════════════════════════════════════════════════════════════════════════

// ── REVIEW-SPECIFIC schemas + engine (the ANTI-BIAS section, mechanized) ──────

// The six ANTI-BIAS rules from orchestrated-delivery/SKILL.md become the refuter
// LENSES (rules 1–5) plus the zero-block smell probe (rule 6, handled below).
// A claim is probed by N refuters; lenses are assigned round-robin BY INDEX so
// the run is deterministic (the runner forbids RNG).
const REFUTER_LENSES = [
  // rule 5 — FRAME DIVERSITY: hostile frame, "assume the author is wrong".
  "hostile: assume the author is WRONG; find the diff's single load-bearing mistake",
  // rule 1 — FREE-HUNT: a failure mode NOT on any checklist.
  "free-hunt: ignore the checklist; name the most plausible UNLISTED failure mode",
  // rule 2 — COMPOSITION: each diff fine, the composition broken. Re-read the callee.
  "composition: re-read cross-PR contracts (sentinels, wire params, helpers from earlier PRs) — do not trust the label",
  // rule 3 — SANCTIONED-DELTA CONSEQUENCE: a blessed delta can still be wrong.
  "delta-consequence: a sanctioned/blessed delta can still violate an invariant or the spec's goal — read the cited decision, not the label",
  // rule 4 — NO SELF-MARKED HOMEWORK: demand a reviewer test + a runtime oracle.
  "no-self-marked-homework: the executor's own tests do not count; demand a REVIEWER-authored test + a runtime smoke oracle (happy + one denied-permission path)",
];

function lensFor(i) {
  return REFUTER_LENSES[i % REFUTER_LENSES.length];
}
// The short tag in front of a lens string, for issue notes ("hostile", "free-hunt", ...).
function lensKind(lens) {
  const cut = String(lens).indexOf(":");
  return cut === -1 ? String(lens) : String(lens).slice(0, cut);
}

// One refuter's ballot. refuted=true is a BLOCKING refutation at the reviewer's
// >=0.80 confidence bar. nonblocking=true registers a doubt BELOW the bar without
// forcing the expensive BLOCK path (rule 6: non-blocking findings are first-class).
// premise_break distinguishes a spec/premise breakage (=> BLOCK) from a fixable
// defect (=> REVISE).
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

// The blind hostile re-review verdict (rule 6 smell probe).
const SMELL_SCHEMA = {
  type: "object",
  required: ["escaped_defect", "detail"],
  additionalProperties: false,
  properties: {
    escaped_defect: { type: "boolean" },
    detail: { type: "string" },
  },
};

// adversarialVerify: run N hostile refuters against ONE claim on diverse lenses,
// then gate by REFUTE-BY-MAJORITY. Returns { survives, refutedCount, total, votes }.
//
// parallel() is a BARRIER — justified here because the majority tally needs ALL
// ballots before it can decide. CRITICAL (the bug that once let a claim survive on
// one vote): do NOT .filter(Boolean) before the tally. A null ballot (skip / death
// / throw) is NON-CONFIRMATION → it counts as a REFUTED vote in the total. A claim
// never gets the benefit of a missing reviewer.
async function adversarialVerify(claim, diff, opts) {
  const o = opts || {};
  const n = o.n || REFUTER_LENSES.length;
  const phaseTag = o.phase || "review";

  const raw = await parallel(
    Array.from({ length: n }, (_, i) => () =>
      agent(
        "You are a HOSTILE refuter on lens [" + lensFor(i) + "].\n" +
          "Diff-only review. Your job is to REFUTE this claim, not confirm it.\n\n" +
          "Claim: " + claim + "\n\nDiff:\n" + diff + "\n\n" +
          "Set refuted=true ONLY at >=0.80 confidence (the reviewer bar). " +
          "Below the bar, set refuted=false and nonblocking=true but STILL record the finding. " +
          "Set premise_break=true ONLY when the change cannot be salvaged by a local fix — a " +
          "wrong spec/premise/approach. A FIXABLE defect (off-by-one, a missing wire-up, a bad " +
          "bound) is NOT a premise break even when it makes the claim false: leave premise_break " +
          "=false so it routes to REVISE (fix loop), not BLOCK (escalate). " +
          "NEVER write code; give a one-line fix direction only.",
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
    // CODE-ENFORCE the >=0.80 reviewer bar the schema models: a refutation below
    // the bar is downgraded to a NON-BLOCKING doubt (rule 6), never a blocking
    // kill — so the bar the prompt states is the bar the tally actually applies.
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

// Collapse a claim's ballots into the unified verdict + the typed issue list.
// APPROVE   → claim upheld by a strict majority.
// BLOCK     → refuted AND at least one refuter flagged premise/spec breakage.
// REVISE    → refuted by fixable defects only.
// Non-blocking doubts (below the bar) are recorded as non_blocking issues either way.
function claimToVerdict(av) {
  const issues = [];
  for (const v of av.votes) {
    if (v.refuted) {
      issues.push({ severity: "blocking", note: "[" + lensKind(v.lens) + "] " + v.finding });
    } else if (v.nonblocking) {
      issues.push({ severity: "non_blocking", note: "[" + lensKind(v.lens) + "] " + v.finding });
    }
  }
  if (av.survives) return { verdict: "APPROVE", issues };
  const premise = av.votes.some((v) => v.refuted && v.premise_break);
  return { verdict: premise ? "BLOCK" : "REVISE", issues };
}

// Worst-wins across a PR's claims: BLOCK > REVISE > APPROVE. An EMPTY list fails
// CLOSED to BLOCK — zero verdicts means no reviewer actually reported, which must
// never read as approval. This is the batch-level twin of the null-vote-is-a-kill
// rule: a missing vote never earns the benefit of the doubt at ANY level.
function worstVerdict(verdicts) {
  if (verdicts.length === 0) return "BLOCK";
  if (verdicts.indexOf("BLOCK") !== -1) return "BLOCK";
  if (verdicts.indexOf("REVISE") !== -1) return "REVISE";
  return "APPROVE";
}

// The EXACT reviewer report line orchestrated-delivery mandates, on the unified grammar.
function verdictLine(verdict, issueCount) {
  return verdict === "APPROVE" ? "VERDICT: APPROVE" : "VERDICT: " + verdict + " — " + issueCount + " issues";
}

// =====================================================================
// BODY — args may be undefined; inline constants are the safe fallback.
// =====================================================================
const claims = (args && args.claims) || [
  {
    pr: 41,
    claim: "PR #41 paginate() fix is correct and regresses nothing.",
    diff:
      "--- a/paginate.js\n+++ b/paginate.js\n@@\n- return items.slice(start, start + size);\n+ return items.slice(start, start + size + 1);",
  },
  {
    pr: 42,
    claim: "PR #42 wires the new auth sentinel end-to-end across the feature's PRs.",
    diff: "--- a/auth.js\n+++ b/auth.js\n@@\n+ const SENTINEL = Symbol('unauth');",
  },
];

const N = (args && args.refutersPerClaim) || REFUTER_LENSES.length;

phase("review");
log("reviewing " + claims.length + " claim(s) with " + N + " hostile refuters each (lenses: " + REFUTER_LENSES.length + ")");

// DEFAULT to pipeline(): each claim flows verify → adjudicate independently, no
// barrier between claims. Stage callback gets (prevResult, originalItem, index).
const reviewed = (
  await pipeline(
    claims,
    (item, _orig, i) => adversarialVerify(item.claim, item.diff, { n: N, phase: tag("verify", i) }),
    (av, orig) => {
      if (!av) return null; // a throwing verify stage drops the item to null
      const cv = claimToVerdict(av);
      const issueCount = cv.issues.filter((x) => x.severity === "blocking").length;
      return {
        pr: orig.pr || null,
        claim: orig.claim,
        verdict: cv.verdict,
        verdict_line: verdictLine(cv.verdict, issueCount),
        issues: cv.issues,
        refutedCount: av.refutedCount,
        total: av.total,
      };
    },
  )
).filter(Boolean);

// ── PR-level roll-up (worst-wins across the PR's claims) ──────────────────────
// FAIL CLOSED if any claim was silently dropped: a verify stage that throws drops
// its claim to null and `.filter(Boolean)` removes it above, so `reviewed` can be
// SHORTER than `claims`. A partial (or empty) batch must NOT approve as if every
// claim were upheld — that is the same "benefit of a missing vote" failure as the
// null-tally bug, one level up. Force BLOCK and record why.
const dropped = claims.length - reviewed.length;
const allIssues = reviewed.reduce((acc, r) => acc.concat(r.issues), []);
if (dropped > 0) {
  allIssues.push({
    severity: "blocking",
    note:
      "[roll-up] " + dropped + " of " + claims.length +
      " claim(s) produced no verdict (verify stage skipped/died) — failing closed to BLOCK",
  });
}
const prVerdict = dropped > 0 ? "BLOCK" : worstVerdict(reviewed.map((r) => r.verdict));
const blockingCount = allIssues.filter((x) => x.severity === "blocking").length;
const gate = gateForVerdict(prVerdict);

// ── ANTI-BIAS rule 6 — a LONG ZERO-BLOCK STREAK IS A SMELL, NOT A TROPHY ──────
// If a whole non-trivial batch produced zero blocking findings, that is suspect.
// Fire a blind hostile re-review with ZERO streak context. (The orchestrator
// should periodically pass a BATCH of merged PRs here to exercise this probe.)
phase("anti-bias-smell-check");
let smell = null;
if (reviewed.length >= 2 && blockingCount === 0) {
  log("SMELL: zero blocking findings across " + reviewed.length + " claims — blind hostile re-review");
  smell = await agent(
    "BLIND HOSTILE RE-REVIEW. You have ZERO streak context. Every claim below was UPHELD. " +
      "Assume the reviewers rubber-stamped. Find the single most likely ESCAPED defect:\n" +
      reviewed.map((r) => "- " + r.claim).join("\n"),
    { label: "blind-hostile-rereview", phase: "anti-bias-smell-check", schema: SMELL_SCHEMA },
  );
}

for (const r of reviewed) {
  log((r.pr ? "PR #" + r.pr + " " : "") + r.verdict_line + " (" + r.refutedCount + "/" + r.total + " refuted)");
}
log(
  "PR verdict: " + prVerdict + " → gate " + gate + "; " + blockingCount + " blocking, " +
    (allIssues.length - blockingCount) + " non-blocking; " +
    (smell ? (smell.escaped_defect ? "SMELL HIT: " + smell.detail : "smell probe clean") : "no smell probe") +
    "; budget left " + budget.remaining(),
);

// What the orchestrator needs to (a) route the PR and (b) complete the audit-ledger
// line. cost / ts / tests_added / human_approval are stamped by the orchestrator —
// they are not knowable inside the runner (no per-agent token deltas, no clock).
return {
  verdict: prVerdict,                 // APPROVE → merge; REVISE → fix loop; BLOCK → escalate
  verdict_line: verdictLine(prVerdict, blockingCount),
  gate_decision: gate,
  issues: allIssues,
  per_claim: reviewed,
  smell: smell,                        // null, or { escaped_defect, detail } — a HIT re-opens review
  // ledger_partial: orchestrator merges this with { cost, ts, tests_added, human_approval }
  // to form a full AUDIT_LEDGER_ENTRY_SCHEMA record.
  ledger_partial: {
    role: "reviewer",
    verdict: prVerdict,
    issues: allIssues,
    gate_decision: gate,
  },
};
