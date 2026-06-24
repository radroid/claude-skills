// ════════════════════════════════════════════════════════════════════════════
// graduation-gate ENGINE — PASTE-IN CONTRACT (deterministic, no agents)
// The BUILD→MAINTAIN seam: decide if a freshly-built app is READY to enter the
// maintenance fleet, build its initial state, and own the reverse edge
// (auto-quarantine on sustained failure, human-gated re-admit). Same distribution
// model as the workflow-runtime canon and the fleet-registry schema: NO
// import/require, no filesystem, no clock, no RNG. Timestamps are caller-supplied.
//
// DESIGN (Raj's steer, 2026-06-24, via AskUserQuestion):
//   • HARD ONE-SHOT gate — a graduated app goes straight to status=active at its
//     declared tier; NO probation ramp.
//   • VALIDATE + INSTRUMENT (fat) — the gate verifies real instrumentation (oracle
//     runs green, /health responds, telemetry wired, SLOs declared) and REFUSES to
//     enrol if it cannot be made ready.
//   • AUTO-QUARANTINE, HUMAN RE-ADMIT — sustained sev1 auto-quarantines an app out
//     of MAINTAIN; a human (re-run of the gate) brings it back.
//
// BOUNDARY: this DECIDES readiness + owns the lifecycle transition. It does NOT
// re-implement the record-shape/oracle-adequacy check (that is fleet-registry's
// admission-validator, which the gate CALLS), nor the autonomy policy (governance:
// graduation is ALWAYS a human gate), nor running the oracle at steady state
// (fleet-maintenance). See references/boundaries.md.
// ════════════════════════════════════════════════════════════════════════════

// What "instrumented" REQUIRES — the FAT-gate rubric. Each is a hard, separately-
// verifiable gate the workflow's agents confirm against REALITY (not just the
// declared config); the deterministic roll-up enforces the floor.
const INSTRUMENTATION_REQUIREMENTS = ["oracle_runs_green", "health_endpoint", "telemetry_connected", "slo_declared"];

// Fail-closed instrumentation roll-up. `checks` maps requirement→boolean (filled by
// the instrument agents). Anything-not-true (false, missing, garbled) counts as
// MISSING — you do not become ready by withholding evidence. Returns { ready, missing }.
function instrumentationRollup(checks) {
  checks = checks || {};
  const missing = [];
  for (let i = 0; i < INSTRUMENTATION_REQUIREMENTS.length; i++) {
    if (checks[INSTRUMENTATION_REQUIREMENTS[i]] !== true) missing.push(INSTRUMENTATION_REQUIREMENTS[i]);
  }
  return { ready: missing.length === 0, missing: missing };
}

// The three TECHNICAL graduation gates combined (fail-closed; a missing part is not
// "ready"). The FOURTH gate — human approval — is applied in graduationDecision
// (governance: graduation is ALWAYS human). parts = { instrumentation_ready,
// admitted, readiness_survived } — each the boolean outcome of its stage
// (admitted = the fleet-registry admission-validator returned APPROVE).
function graduationReady(parts) {
  parts = parts || {};
  const reasons = [];
  if (parts.instrumentation_ready !== true) reasons.push("instrumentation not ready");
  if (parts.admitted !== true) reasons.push("admission validator did not APPROVE");
  if (parts.readiness_survived !== true) reasons.push("operational-readiness refuted");
  return { ready: reasons.length === 0, reasons: reasons };
}

// The FINAL graduation gate = technically ready AND a human approved. Maps to the
// canon verdict/gate grammar. ready+human → proceed/APPROVE. ready, no human →
// escalate/BLOCK (the always-human gate is the only thing left). not-ready →
// hold/REVISE (fixable: fix instrumentation/oracle and re-run). Note the ledger
// invariant: APPROVE carries NO issues; REVISE carries non_blocking; escalate
// carries blocking.
function graduationDecision(readyResult, humanApproval) {
  const ready = !!(readyResult && readyResult.ready === true);
  const human = !!(humanApproval && humanApproval.approved === true);
  if (ready && human) return { gate_decision: "proceed", verdict: "APPROVE", issues: [] };
  if (ready) return { gate_decision: "escalate", verdict: "BLOCK", issues: [{ severity: "blocking", note: "graduation requires human approval (always-human gate per cto-governance-spine) — none recorded" }] };
  const reasons = (readyResult && readyResult.reasons) || ["graduation readiness not met"];
  return { gate_decision: "hold", verdict: "REVISE", issues: reasons.map(function (r) { return { severity: "non_blocking", note: r }; }) };
}

// Canon AUDIT_LEDGER_ENTRY for a graduation outcome (the governance-owned global
// ledger). cost/ts stamped by the caller (no clock here).
function graduationLedgerEntry(readyResult, ctx) {
  ctx = ctx || {};
  const d = graduationDecision(readyResult, ctx.human_approval);
  return {
    role: "auditor",
    cost: { role: "auditor", label: ctx.label || "graduation-gate", tokens_in: 0, tokens_out: 0 },
    verdict: d.verdict,
    issues: d.issues,
    tests_added: 0,
    gate_decision: d.gate_decision,
    human_approval: ctx.human_approval || null,
    item: ctx.app_id || "unknown",
  };
}

// ── The reverse edge (§7.8) — auto-quarantine on SUSTAINED failure, human re-admit ─
const DEMOTE_CONSECUTIVE_SEV1 = 3; // N consecutive sev1 sweeps = sustained, not a one-off blip
// `recentSeverities`: the app's last-N sweep severities (most recent LAST), from the
// backlog/ledger. Returns { action, demote, escalate, reason }. Fail-closed: no
// usable history → escalate (a human looks), NEVER silently demote OR silently keep.
function demotionCheck(recentSeverities, opts) {
  opts = opts || {};
  const threshold = typeof opts.threshold === "number" ? opts.threshold : DEMOTE_CONSECUTIVE_SEV1;
  if (!Array.isArray(recentSeverities)) {
    return { action: "escalate", demote: false, escalate: true, reason: "no sweep history supplied — cannot confirm sustained failure; escalate to a human" };
  }
  let run = 0; // trailing run of sev1 (a SUSTAINED failure, not a single bad sweep)
  for (let i = recentSeverities.length - 1; i >= 0; i--) {
    if (recentSeverities[i] === "sev1") run++; else break;
  }
  if (run >= threshold) {
    return { action: "quarantine", demote: true, escalate: true, reason: run + " consecutive sev1 sweep(s) >= " + threshold + " — auto-quarantine (out of MAINTAIN) + escalate for human re-admit" };
  }
  return { action: "none", demote: false, escalate: false, reason: "trailing sev1 run " + run + " < " + threshold + " — no demotion" };
}

// Apply a demotion to a state record (PURE clone — never mutates the caller's). status
// → quarantined; NEVER delete (the record is the audit trail). Re-admission needs a
// graduation re-run + human approval.
function applyDemotion(state) {
  const next = Object.assign({}, state || {});
  next.status = "quarantined";
  return next;
}

// Re-admit a quarantined app — requires BOTH a fresh graduation-ready pass AND
// explicit human approval (governance: graduation is always-human). Fail-closed:
// missing either → false.
function readmitAllowed(readyResult, humanApproval) {
  return !!(readyResult && readyResult.ready === true) && !!(humanApproval && humanApproval.approved === true);
}

// Build the initial machine-mutable state.json for a newly-graduated app. HARD
// ONE-SHOT: status=active immediately at its declared tier — NO probation ramp.
// Requires human approval (graduation always-human) — returns null (REFUSE) without
// it. nowTs caller-supplied (no clock). The config.yaml is written via a reviewed PR
// separately; this is the state the loop will own. Shape matches fleet-registry's
// STATE_SCHEMA (app_id, status, open_incidents, drift required; lease nullable).
function buildEnrollmentState(appId, humanApproval, nowTs) {
  if (!appId || !(humanApproval && humanApproval.approved === true)) return null;
  return {
    app_id: appId, status: "active", lease: null, open_incidents: 0,
    last_hygiene: null, last_known_good: null,
    drift: { status: "in_sync", last_reconciled: nowTs || null }, schema_version: "1",
  };
}
// ════════════════════════════════════════════════════════════════════════════
// END graduation-gate ENGINE
// ════════════════════════════════════════════════════════════════════════════
