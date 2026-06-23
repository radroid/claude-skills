export const meta = {
  name: "orchestrated-delivery-steward",
  description:
    "The orchestrated-delivery STEWARD step, mechanized as a worktree-isolated gate: a steward agent runs in its OWN git worktree (so it never collides with the shared tree's in-flight planner/executor), reads the ledger + friction + templates, auto-tunes the role templates, ties each change to the KPI it targets in the prompt-changelog, moves addressed friction to Resolved, and ALWAYS leaves a dated audit trace (even on a no-change run). A read-only quality gate then reviews the steward's PR and emits the unified APPROVE|REVISE|BLOCK verdict — the orchestrator merges only on proceed.",
  phases: [
    { title: "steward", detail: "worktree-isolated auto-tune of the orchestration docs" },
    { title: "gate", detail: "read-only quality review of the steward PR" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Pasted from workflow-runtime/assets/preamble.js — the executable code (schema
// consts + helpers) is byte-identical to canon; only this header comment is
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

// ── STEWARD-SPECIFIC schemas ──────────────────────────────────────────────────

// What the steward agent reports back. changelog_note is ALWAYS present — the
// steward must leave an audit trace even when it tunes nothing ("reviewed through
// PR #n, no change — <why>"), because a steward that only logs on change is
// indistinguishable from one silently skipped.
const STEWARD_REPORT_SCHEMA = {
  type: "object",
  required: ["tuned", "changes", "friction_resolved", "changelog_note", "pr", "branch"],
  additionalProperties: false,
  properties: {
    tuned: { type: "boolean" },
    changes: {
      type: "array",
      description: "Each template change, tied to the KPI it targets. Empty [] on a no-change run.",
      items: {
        type: "object",
        required: ["template", "kpi", "change"],
        additionalProperties: false,
        properties: {
          template: { type: "string", description: "e.g. docs/orchestration/prompts/reviewer.md" },
          kpi: { type: "string", description: "the KPI this change targets (review yield, cycle overhead, ...)" },
          change: { type: "string", description: "one-line summary of the edit" },
        },
      },
    },
    friction_resolved: {
      type: "array",
      items: { type: "string" },
      description: "friction-log items moved Open → Resolved this run",
    },
    changelog_note: { type: "string", description: "the dated audit trace appended to prompt-changelog.md (ALWAYS present)" },
    pr: { type: "integer", minimum: 1 },
    branch: { type: "string" },
  },
};

// The gate reviewer's verdict on the steward PR (unified grammar).
const GATE_SCHEMA = {
  type: "object",
  required: ["verdict", "notes"],
  additionalProperties: false,
  properties: {
    verdict: VERDICT_SCHEMA,
    notes: { type: "string" },
  },
};

// =====================================================================
// BODY — args may be undefined; inline constants are the safe fallback.
// =====================================================================
const repoSlug = (args && args.repoSlug) || "<owner/repo>";
const throughPr = (args && args.throughPr) || null; // last merged PR this steward run covers
const baseBranch = (args && args.baseBranch) || "main";

phase("steward");
log("steward run over " + repoSlug + (throughPr ? " through PR #" + throughPr : "") + " (worktree-isolated)");

// The steward MUTATES files (the orchestration docs) and runs CONCURRENTLY with
// the next item's planner/executor on the shared tree, and it lands its own
// branch/PR — so isolation:"worktree" is warranted (see workflow-runtime
// patterns.md worktree guidance). It touches ONLY docs/orchestration/*.
const steward = await agent(
  "You are the orchestrated-delivery STEWARD, running in your OWN git worktree on a fresh branch off " +
    baseBranch + ".\n" +
    "Repo: " + repoSlug + ".\n\n" +
    "Read these and AUTO-TUNE the role templates:\n" +
    "  - docs/orchestration/token-ledger.md (cost + KPI signal)\n" +
    "  - docs/orchestration/friction-log.md (## Open / ## Resolved)\n" +
    "  - docs/orchestration/prompts/{planner,executor,reviewer,fix,steward}.md\n" +
    "  - docs/orchestration/prompt-changelog.md (the SINGLE version record)\n\n" +
    "RULES:\n" +
    "  1. Touch ONLY files under docs/orchestration/. Never feature code, never the shared tree.\n" +
    "  2. For each template change, append a prompt-changelog.md entry naming the KPI it targets.\n" +
    "  3. Move every addressed friction item from ## Open to ## Resolved.\n" +
    "  4. ALWAYS leave a dated audit trace in prompt-changelog.md — even on a NO-CHANGE run, write " +
    "'reviewed through PR #" + (throughPr || "n") + ", no change — <why>'. Silence is not proof you ran.\n" +
    "  5. The contract lives in orchestrated-delivery/SKILL.md (The loop + ANTI-BIAS). Do NOT fork " +
    "divergent copies of the contract into the templates — re-derive from the single source.\n\n" +
    "Then commit your changes, push the branch, and open a PR against " + baseBranch + " with `gh`. " +
    "Return your report: tuned, the per-change KPI list, friction_resolved, the changelog_note, and the PR number + branch.",
  { label: "steward", phase: "steward", isolation: "worktree", schema: STEWARD_REPORT_SCHEMA },
);

if (!steward) {
  log("STEWARD DID NOT RETURN (skip/death) — HARD GATE: do NOT start the next item; re-dispatch the steward.");
  // Fail closed AND leave an audit trace even on death (SKILL.md: "silence is not
  // proof it ran"). Same return shape as the normal path so the orchestrator can
  // always append a ledger line.
  return {
    steward: null,
    gate: null,
    verdict: "BLOCK",
    gate_decision: "escalate",
    note: "steward produced no output — non-deferrable gate not satisfied",
    ledger_partial: {
      role: "steward",
      verdict: "BLOCK",
      issues: [
        { severity: "blocking", note: "[steward] no output (skip/death) — non-deferrable gate not satisfied; re-dispatch before the next item" },
      ],
      gate_decision: "escalate",
    },
  };
}

log(
  "steward: " + (steward.tuned ? steward.changes.length + " change(s)" : "no change") +
    ", " + steward.friction_resolved.length + " friction resolved, PR #" + steward.pr,
);

// ── Quality gate: read-only review of the steward PR. The orchestrator merges
// the steward PR ONLY when this gate returns proceed. ─────────────────────────
phase("gate");
const gate = await agent(
  "You are a READ-ONLY quality gate for the orchestrated-delivery steward's PR. Do NOT touch the tree.\n" +
    "Review the diff via `gh pr diff " + steward.pr + " --repo " + repoSlug + "` (cwd-independent; STOP LOUDLY " +
    "if it fails — never fall back to the local working tree).\n\n" +
    "Confirm ALL of:\n" +
    "  - It touches ONLY docs/orchestration/ files.\n" +
    "  - Every template change has a matching prompt-changelog.md entry naming a KPI.\n" +
    "  - A dated audit trace exists even if nothing was tuned.\n" +
    "  - Addressed friction moved Open → Resolved.\n" +
    "  - No divergent fork of the SKILL.md contract was pasted into a template.\n\n" +
    "Steward self-report: " + JSON.stringify(steward) + "\n\n" +
    "Emit the unified verdict: APPROVE (merge it), REVISE (fixable — bounce back to the steward), " +
    "or BLOCK (premise breakage — escalate).",
  { label: "steward-gate", phase: "gate", schema: GATE_SCHEMA },
);

const verdict = gate && isVerdict(gate.verdict) ? gate.verdict : "BLOCK"; // null/invalid gate fails closed
const decision = gateForVerdict(verdict);
log("steward PR #" + steward.pr + " gate: " + verdict + " → " + decision + (gate ? " — " + gate.notes : " (no gate output; failed closed)"));

return {
  steward: steward,
  gate: gate,
  verdict: verdict,
  gate_decision: decision, // proceed → orchestrator merges the steward PR; else hold/escalate
  // ledger_partial: orchestrator merges with { cost, ts, tests_added: 0, human_approval }
  // to form a full AUDIT_LEDGER_ENTRY_SCHEMA record for role "steward".
  ledger_partial: {
    role: "steward",
    verdict: verdict,
    // Always carry a REASON on a non-APPROVE: gate.notes when the gate spoke, or a
    // fail-closed marker when the gate agent itself died (gate === null) — never an
    // empty, reasonless BLOCK in the audit ledger.
    issues:
      verdict !== "APPROVE"
        ? [{ severity: "blocking", note: gate ? gate.notes : "[steward-gate] no gate output — failed closed to BLOCK" }]
        : [],
    gate_decision: decision,
  },
};
