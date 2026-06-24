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

// ════════════════════════════════════════════════════════════════════════════
// SELF-TEST (run: `node graduation.example.js`). Everything ABOVE this banner is
// byte-identical to graduation.js (verify: comm -23 of the code-only lines). This
// block exercises the deterministic engine exhaustively — the strongest, instant,
// token-free confirmation for a deterministic gate.
// ════════════════════════════════════════════════════════════════════════════
let pass = 0, fail = 0;
function ok(name, cond, got) { if (cond) { pass++; console.log("  PASS " + name + " => " + JSON.stringify(got)); } else { fail++; console.log("  FAIL " + name + " => " + JSON.stringify(got)); } }

const HUMAN = { approved: true, by: "raj" };
const NO_HUMAN = { approved: false, by: "raj" };

// ── instrumentationRollup (fail-closed) ──
ok("instrumentation all-true => ready", instrumentationRollup({ oracle_runs_green: true, health_endpoint: true, telemetry_connected: true, slo_declared: true }).ready === true, instrumentationRollup({ oracle_runs_green: true, health_endpoint: true, telemetry_connected: true, slo_declared: true }));
ok("instrumentation one-missing => not ready", instrumentationRollup({ oracle_runs_green: true, health_endpoint: true, telemetry_connected: true }).ready === false, instrumentationRollup({ oracle_runs_green: true, health_endpoint: true, telemetry_connected: true }).missing);
ok("instrumentation null => all 4 missing (fail-closed)", instrumentationRollup(null).missing.length === 4, instrumentationRollup(null).missing);
ok("instrumentation garbled value (string) => missing (not true)", instrumentationRollup({ oracle_runs_green: "yes", health_endpoint: true, telemetry_connected: true, slo_declared: true }).ready === false, instrumentationRollup({ oracle_runs_green: "yes", health_endpoint: true, telemetry_connected: true, slo_declared: true }).missing);

// ── graduationReady (three technical gates) ──
ok("graduationReady all-true => ready", graduationReady({ instrumentation_ready: true, admitted: true, readiness_survived: true }).ready === true, graduationReady({ instrumentation_ready: true, admitted: true, readiness_survived: true }));
ok("graduationReady missing admission => not ready w/ reason", graduationReady({ instrumentation_ready: true, admitted: false, readiness_survived: true }).reasons.join("|").indexOf("admission") !== -1, graduationReady({ instrumentation_ready: true, admitted: false, readiness_survived: true }).reasons);
ok("graduationReady empty => all 3 reasons (fail-closed)", graduationReady({}).reasons.length === 3, graduationReady({}).reasons);

// ── graduationDecision (the final gate, incl. always-human) ──
const dReady = graduationReady({ instrumentation_ready: true, admitted: true, readiness_survived: true });
const dProceed = graduationDecision(dReady, HUMAN);
ok("ready + human => proceed/APPROVE, NO issues (ledger invariant)", dProceed.gate_decision === "proceed" && dProceed.verdict === "APPROVE" && dProceed.issues.length === 0, dProceed.gate_decision + "/" + dProceed.verdict + "/" + dProceed.issues.length);
const dNoHuman = graduationDecision(dReady, NO_HUMAN);
ok("ready + NO human => escalate/BLOCK + blocking issue (always-human)", dNoHuman.gate_decision === "escalate" && dNoHuman.verdict === "BLOCK" && dNoHuman.issues[0].severity === "blocking", dNoHuman.gate_decision + "/" + dNoHuman.verdict);
const dNotReady = graduationDecision(graduationReady({ instrumentation_ready: false, admitted: true, readiness_survived: true }), HUMAN);
ok("not-ready (even WITH human) => hold/REVISE + non_blocking", dNotReady.gate_decision === "hold" && dNotReady.verdict === "REVISE" && dNotReady.issues.every(function (i) { return i.severity === "non_blocking"; }), dNotReady.gate_decision + "/" + dNotReady.verdict);
ok("graduationDecision null readyResult => hold (fail-closed, not proceed)", graduationDecision(null, HUMAN).gate_decision === "hold", graduationDecision(null, HUMAN).gate_decision);

// ── graduationLedgerEntry (canon shape + invariants) ──
const ALE_REQUIRED = ["role", "cost", "verdict", "issues", "tests_added", "gate_decision", "human_approval"];
const le = graduationLedgerEntry(dReady, { app_id: "my-app", human_approval: HUMAN });
ok("ledger entry has all canon required keys", ALE_REQUIRED.every(function (k) { return le[k] !== undefined; }), ALE_REQUIRED.filter(function (k) { return le[k] === undefined; }));
ok("ledger APPROVE carries empty issues + passes human_approval through", le.verdict === "APPROVE" && le.issues.length === 0 && le.human_approval === HUMAN, le.verdict + "/" + le.issues.length);
ok("ledger no-human => BLOCK/escalate + human_approval null", (function () { const x = graduationLedgerEntry(dReady, { app_id: "my-app" }); return x.verdict === "BLOCK" && x.gate_decision === "escalate" && x.human_approval === null; })(), "ok");
ok("ledger item defaults to 'unknown' when app_id absent", graduationLedgerEntry(dReady, { human_approval: HUMAN }).item === "unknown", graduationLedgerEntry(dReady, { human_approval: HUMAN }).item);

// ── demotionCheck (§7.8 reverse edge) ──
ok("3 trailing sev1 => quarantine + escalate", demotionCheck(["sev3", "sev1", "sev1", "sev1"]).action === "quarantine", demotionCheck(["sev3", "sev1", "sev1", "sev1"]));
ok("2 trailing sev1 => none (a blip, not sustained)", demotionCheck(["sev1", "sev1"]).action === "none", demotionCheck(["sev1", "sev1"]));
ok("run BROKEN by a sev2 => counts only the trailing run", demotionCheck(["sev1", "sev1", "sev2", "sev1"]).action === "none", demotionCheck(["sev1", "sev1", "sev2", "sev1"]));
ok("non-array history => escalate (fail-closed, never silently demote/keep)", demotionCheck(null).action === "escalate" && demotionCheck(null).demote === false, demotionCheck(null));
ok("empty history => none", demotionCheck([]).action === "none", demotionCheck([]));
ok("custom threshold honored (2)", demotionCheck(["sev1", "sev1"], { threshold: 2 }).action === "quarantine", demotionCheck(["sev1", "sev1"], { threshold: 2 }));
ok("quarantine always escalates (human re-admit)", demotionCheck(["sev1", "sev1", "sev1"]).escalate === true, demotionCheck(["sev1", "sev1", "sev1"]).escalate);

// ── applyDemotion (pure) ──
const st0 = { app_id: "my-app", status: "active", open_incidents: 5 };
const st1 = applyDemotion(st0);
ok("applyDemotion sets status=quarantined", st1.status === "quarantined", st1.status);
ok("applyDemotion is PURE (caller's state unchanged)", st0.status === "active", st0.status);
ok("applyDemotion preserves other fields (no delete)", st1.open_incidents === 5 && st1.app_id === "my-app", st1.open_incidents);

// ── readmitAllowed ──
ok("readmit ready + human => true", readmitAllowed(dReady, HUMAN) === true, true);
ok("readmit ready + NO human => false", readmitAllowed(dReady, NO_HUMAN) === false, false);
ok("readmit not-ready + human => false", readmitAllowed(graduationReady({}), HUMAN) === false, false);

// ── buildEnrollmentState (hard one-shot, human-gated) ──
const es = buildEnrollmentState("my-app", HUMAN, "2026-06-24T00:00:00Z");
ok("enrollment state is status=active (hard one-shot, no probation)", es && es.status === "active", es && es.status);
ok("enrollment state lease=null, open_incidents=0, drift in_sync", es && es.lease === null && es.open_incidents === 0 && es.drift.status === "in_sync", es && es.drift);
ok("buildEnrollmentState WITHOUT human => null (refuse, always-human)", buildEnrollmentState("my-app", NO_HUMAN, null) === null, buildEnrollmentState("my-app", NO_HUMAN, null));
ok("buildEnrollmentState WITHOUT appId => null", buildEnrollmentState(null, HUMAN, null) === null, buildEnrollmentState(null, HUMAN, null));

console.log("\n" + (fail === 0 ? "ALL GRADUATION-GATE SELF-TESTS PASS" : fail + " FAILED") + " (" + pass + " passed)");
process.exit(fail === 0 ? 0 : 1);
