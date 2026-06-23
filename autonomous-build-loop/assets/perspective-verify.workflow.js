export const meta = {
  name: "autonomous-build-loop-perspective-verify",
  description:
    "The autonomous-build-loop SUPER-REVIEWER and DESIGN-REVIEW gate, mechanized as perspective-diverse verification: run EXACTLY ONE verifier per distinct lens (each boxed into a single perspective so verdicts stay diverse instead of collapsing into one generalist review), each emitting the unified APPROVE|REVISE|BLOCK verdict. Two lens sets by mode — super-reviewer (architecture/ADR-consistency, contract, security, test-adequacy) and design (visual hierarchy, >=44px touch targets, AA contrast, design-reference fidelity). Aggregates worst-wins and FAILS CLOSED when a lens dies. A gate that is a pipeline STAGE, not a paragraph.",
  phases: [{ title: "perspective-verify", detail: "one verifier per distinct lens (APPROVE|REVISE|BLOCK)" }],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Pasted from workflow-runtime/assets/preamble.js — the executable code (schema
// consts + helpers) is byte-identical to canon; only this header comment is
// role-localized. There is no import/require, no filesystem, no clock, no RNG.
// Reuse = paste, not link.
// ════════════════════════════════════════════════════════════════════════════

// ── Unified VERDICT enum ─────────────────────────────────────────────────────
// For the super-reviewer (legacy APPROVE|REQUEST_CHANGES|BLOCK): REQUEST_CHANGES
// → REVISE (fix listed items, re-run, two-pass cap); BLOCK → halt the action,
// log, pick next non-conflicting item per continuous-loop.md.
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

// ── CANON pattern: perspective-diverse verification (workflow-runtime patterns.md §3) ──

// One verdict per lens, using the unified APPROVE|REVISE|BLOCK grammar.
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
// Runs EXACTLY ONE verifier per distinct lens, each boxed into a single perspective.
// pipeline() (not a parallel() barrier): lenses are independent. .filter(Boolean)
// drops skipped/dead agents. label varies by index (resume-safe; never clock/RNG).
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
          "Return a verdict for THIS lens only (APPROVE | REVISE | BLOCK). REVISE = fixable issues;",
          "BLOCK = the change cannot proceed as-is (premise/spec/safety breakage). Cite concrete",
          "findings; an empty findings list must mean you actively looked and found nothing.",
        ].join("\n"),
        {
          label: "verify:" + lens + "#" + i, // index-keyed → deterministic on resume
          phase: o.phase || "perspective-verify",
          schema: PERSPECTIVE_VERDICT_SCHEMA,
          model: o.model,
          agentType: o.agentType,
        },
      ),
  );

  const verdicts = reports.filter(Boolean); // agent() returns null on skip/death
  log("perspectiveVerify: " + verdicts.length + "/" + distinct.length + " lenses returned a verdict");
  return verdicts;
}

// ── Mode lens sets ────────────────────────────────────────────────────────────
// super-reviewer: a fresh-context, whole-repo Class A review of a feature PR /
// auto-delegated checkpoint (super-reviewer.md). design: the Phase-3 UI critique
// gate (SKILL.md principle 9 / fat-iter-mode.md Phase 3).
const SUPER_REVIEWER_LENSES = [
  "architecture & ADR consistency: does the change honor ARCHITECTURE.md, docs/adr/, and CONTEXT.md, or silently contradict a recorded decision?",
  "contract correctness: do mutation/query signatures, return shapes, and error mapping match the scoping plans and callers?",
  "security & data safety: authz on every new boundary, input validation at parse boundaries, no secret leakage, no unsafe casts past validation",
  "test adequacy: is there a REVIEWER-trustworthy test + (for runtime-visible behavior) a smoke oracle, asserting CONTRACT behavior not implementation detail?",
];
const DESIGN_LENSES = [
  "visual hierarchy: is the primary action unmistakable; is grouping/spacing/typographic scale coherent against the design reference?",
  "touch targets: are interactive controls >=44px and not overlapping/occluded on a mobile viewport?",
  "AA contrast: does text/icon contrast meet WCAG AA against its background?",
  "design-reference fidelity: does the rendered screen match docs/screens/html/<slug>.html (layout, components, states) rather than just 'it rendered'?",
];

// Worst-wins across the lens verdicts: BLOCK > REVISE > APPROVE. An EMPTY list
// fails CLOSED to BLOCK — no verdict means no verifier actually reported.
function worstVerdict(verdicts) {
  if (verdicts.length === 0) return "BLOCK";
  if (verdicts.indexOf("BLOCK") !== -1) return "BLOCK";
  if (verdicts.indexOf("REVISE") !== -1) return "REVISE";
  return "APPROVE";
}

// =====================================================================
// BODY — args may be undefined; inline constants are the safe fallback.
// =====================================================================
const mode = (args && args.mode) || "super-reviewer"; // "super-reviewer" | "design"
const target =
  (args && args.target) ||
  "PR #123 (iter-007): adds archiveTodo mutation + Archive button. ARCHITECTURE.md says mutations live in convex/; ADR-004 mandates soft-delete via an `archived` flag. Diff: convex/todos.ts +archive mutation; src/TodoRow.tsx +Archive button.";
const lensSet = mode === "design" ? DESIGN_LENSES : SUPER_REVIEWER_LENSES;
const lenses = (args && args.lenses) || lensSet;

phase("perspective-verify");
log(mode + " perspective-verify over " + dedupeLenses(lenses).length + " distinct lens(es)");

const verdicts = await perspectiveVerify(target, lenses, { phase: "perspective-verify" });

// FAIL CLOSED: if any lens died (fewer verdicts than distinct lenses) the gate is
// not satisfied — a missing perspective never reads as approval.
const distinctCount = dedupeLenses(lenses).length;
const died = distinctCount - verdicts.length;
const aggregate = died > 0 ? "BLOCK" : worstVerdict(verdicts.map((v) => v.verdict));
const decision = gateForVerdict(aggregate);

// Flatten the per-lens findings into the typed issue list. A lens that did not
// APPROVE contributes blocking issues; a dead lens contributes a fail-closed note.
const issues = [];
for (const v of verdicts) {
  if (v.verdict !== "APPROVE") {
    const fs = (v.findings && v.findings.length ? v.findings : [v.summary]) || ["(no detail)"];
    for (const f of fs) issues.push({ severity: "blocking", note: "[" + v.lens + "] " + f });
  }
}
if (died > 0) {
  issues.push({ severity: "blocking", note: "[perspective-verify] " + died + " of " + distinctCount + " lens(es) returned no verdict — failing closed to BLOCK" });
}

for (const v of verdicts) log(v.lens + " → " + v.verdict + (v.summary ? " — " + v.summary : ""));
log(
  mode + " aggregate: " + aggregate + " → gate " + decision +
    " (" + verdicts.length + "/" + distinctCount + " lenses; " + issues.length + " issues)" +
    "; budget left " + budget.remaining(),
);

// The orchestrator logs to logs/blocks.md and completes the AUDIT_LEDGER_ENTRY
// (cost / ts / tests_added / human_approval). REVISE → fix + re-run (two-pass cap);
// BLOCK → halt the action, pick next non-conflicting item.
return {
  mode: mode,
  verdict: aggregate,
  gate_decision: decision,
  issues: issues,
  per_lens: verdicts,
  ledger_partial: {
    role: "reviewer",
    verdict: aggregate,
    issues: issues,
    gate_decision: decision,
  },
};
