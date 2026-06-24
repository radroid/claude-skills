export const meta = {
  name: "graduation-gate-graduate",
  description:
    "The BUILD-to-MAINTAIN graduation readiness gate — verifies a freshly-built app is actually INSTRUMENTED (the smoke oracle truly runs green, a health endpoint responds, telemetry is wired, SLOs are declared) and adversarially verifies it is operationally READY for unattended maintenance, rolling both sub-gates up FAIL-CLOSED. It does NOT re-check record shape / oracle adequacy (that is fleet-registry's admission-validator, run separately) and never self-approves a graduation (governance: graduation is ALWAYS a human gate). Hard one-shot (no probation): on a full pass plus human approval the app enrolls active at its declared tier. Emits the unified verdict plus a canon AUDIT_LEDGER_ENTRY.",
  phases: [
    { title: "Instrument", detail: "verify real instrumentation: oracle runs green, /health responds, telemetry wired, SLOs declared (fail-closed)" },
    { title: "Readiness", detail: "adversarial-verify operational readiness for unattended maintenance" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Inlined here verbatim (the executable consts/helpers are byte-identical to
// workflow-runtime/assets/preamble.js; the surrounding comments are
// role-localized). There is no import/require, no filesystem, no clock, no RNG.
// ════════════════════════════════════════════════════════════════════════════

// ── Unified VERDICT enum ─────────────────────────────────────────────────────
const VERDICT_VALUES = ["APPROVE", "REVISE", "BLOCK"];
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

// ════════════════════════════════════════════════════════════════════════════
// graduation-gate ENGINE — PASTE-IN (inlined from assets/graduation.js)
// Kept in sync with assets/graduation.js — edit there, re-paste here.
// ════════════════════════════════════════════════════════════════════════════
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
  const threshold = (typeof opts.threshold === "number" && opts.threshold >= 1) ? opts.threshold : DEMOTE_CONSECUTIVE_SEV1; // clamp: a <1 threshold would quarantine a healthy app (run 0 >= 0)
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

// ── graduate workflow logic ──────────────────────────────────────────────────
// graduation-gate's NOVEL surface: verify the app is actually INSTRUMENTED (the
// fat gate) and adversarially verify it is operationally READY for unattended
// maintenance. The record-shape + oracle-ADEQUACY check is fleet-registry's
// admission-validator (run separately — pass its APPROVE via args.admitted); the
// always-human approval is governance's. This workflow rolls up its two sub-gates
// FAIL-CLOSED and combines them with admission + human via the engine helpers.

const CONFIDENCE_BAR = 0.8; // a refute counts only at >=0.80 confidence (canon bar)

const INSTRUMENT_CHECK_SCHEMA = {
  type: "object",
  required: ["oracle_runs_green", "health_endpoint", "telemetry_connected", "slo_declared"],
  additionalProperties: false,
  properties: {
    oracle_runs_green: { type: "boolean", description: "Did the registry smoke_oracle.command ACTUALLY run and pass (not merely exist in config)?" },
    health_endpoint: { type: "boolean", description: "Does a /health (or the app's declared health) endpoint respond?" },
    telemetry_connected: { type: "boolean", description: "Are error-tracking + metrics wired (the sources healthAssess reads: error_rate, p95, availability)?" },
    slo_declared: { type: "boolean", description: "Does config.slo declare the baselines healthAssess scores against?" },
    notes: { type: "string", description: "What you actually checked / why a check is false. Honest: unverifiable = false." },
  },
};

// Hostile lenses that try to REFUTE 'this app is ready for unattended maintenance'.
// Distinct from the admission-validator's oracle-ADEQUACY lenses: these are about
// operational READINESS (does it actually run / report / roll back).
const READINESS_LENSES = [
  { key: "oracle-actually-runs", frame: "Can the smoke_oracle actually RUN unattended here? If runnable_unattended is false, or the command needs a human/native/manual step, this app is NOT ready for an autonomous gate — REFUTE." },
  { key: "rollback-for-prod", frame: "If this app deploys to prod (merge_deploys_to_prod=SHIP), is there a revert_command + last_known_good path? A prod-deploying app with no un-ship path is NOT ready — REFUTE." },
  { key: "telemetry-sources", frame: "Do the telemetry sources the maintenance sweep reads (error rate, p95 latency, availability) actually EXIST for this app? If healthAssess would get no signal, the app is invisible-on-day-one — REFUTE." },
  { key: "baseline-sanity", frame: "Are the declared SLOs sane and app-appropriate (not placeholder 0s / 100s / copy-paste)? Bogus baselines make every sweep fire or never fire — REFUTE." },
  { key: "tier-proportionate", frame: "Is the WHOLE readiness package proportionate to the declared governance_tier? A 'critical' app needs deeper instrumentation + a tighter oracle than 'experimental'. Thin readiness for a high tier — REFUTE." },
];

const REFUTE_SCHEMA = {
  type: "object",
  required: ["refuted", "confidence", "reason"],
  additionalProperties: false,
  properties: {
    refuted: { type: "boolean", description: "true => this lens REFUTES the readiness claim." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in the refutation; only >=0.80 counts." },
    reason: { type: "string", description: "One-line justification citing the specific gap." },
  },
};

function instrumentPrompt(config) {
  return [
    "You are verifying that app '" + (config.app_id || "?") + "' (" + (config.repo || "?") + ") is genuinely INSTRUMENTED for unattended maintenance — not merely that its config DECLARES things.",
    "Check each against REALITY where you can (run the command, hit the endpoint). If you CANNOT verify a check, return it FALSE — unverifiable is not ready (fail-closed).",
    "1. oracle_runs_green: run the smoke_oracle command `" + ((config.smoke_oracle && config.smoke_oracle.command) || "?") + "` — did it pass?",
    "2. health_endpoint: does a /health (or the app's declared health) endpoint respond?",
    "3. telemetry_connected: are error-tracking + metrics wired so error_rate / p95 / availability can be read?",
    "4. slo_declared: does the config declare SLO baselines? config.slo = " + JSON.stringify((config && config.slo) || {}) + ".",
    "Return the typed checks object; be honest in notes about anything you could not verify.",
  ].join("\n");
}

function refutePrompt(claim, lens, config) {
  return [
    "You are a HOSTILE graduation refuter. REFUTE the claim below — assume it is false and try to prove it.",
    "",
    "CLAIM: " + claim,
    "",
    "Your lens — " + lens.key + ":",
    lens.frame,
    "",
    "The candidate app config:",
    JSON.stringify(config || {}, null, 2),
    "",
    "Return refuted=true ONLY if, through YOUR lens, the app is NOT ready for unattended maintenance.",
    "Set confidence honestly (only >=0.80 refutations count). If your lens finds it ready, return refuted=false.",
  ].join("\n");
}

// Adversarial-verify the readiness claim. NO .filter(Boolean) before the tally — a
// dead/null ballot counts as a REFUTE (fail-closed: never survive on a missing
// skeptic). Tie kills (refutedCount*2 < total is strict).
async function adversarialVerify(claim, lenses, config) {
  const ballots = await parallel(
    lenses.map((lens) => () =>
      agent(refutePrompt(claim, lens, config), { label: "refute:" + lens.key, phase: "Readiness", schema: REFUTE_SCHEMA })
    )
  );
  const total = ballots.length;
  let refutedCount = 0;
  const reasons = [];
  for (let i = 0; i < ballots.length; i++) {
    const b = ballots[i];
    if (!b) { refutedCount++; reasons.push(lenses[i].key + ": (dead refuter — counted as refute)"); continue; }
    if (b.refuted === true && typeof b.confidence === "number" && b.confidence >= CONFIDENCE_BAR) {
      refutedCount++; reasons.push(lenses[i].key + ": " + (b.reason || "(no reason given)"));
    }
  }
  const survives = total > 0 && refutedCount * 2 < total;
  return { survives: survives, total: total, refutedCount: refutedCount, reasons: reasons };
}

// Self-contained example (runs with args undefined). A well-formed candidate; the
// instrument agent will fail-close any check it cannot verify against a real app, so
// a smoke run typically shows instrumentation NOT ready — correct: you cannot
// confirm readiness of an app that is not really there. Pass a real candidate as
// args.candidate = { config, state }, plus optional args.admitted / args.human_approval.
const EXAMPLE_CANDIDATE = {
  config: {
    app_id: "example-app", repo: "radroid/example-app", prod_url: "https://example-app.app",
    governance_tier: "standard", merge_deploys_to_prod: "HOLD",
    smoke_oracle: { command: "npm run smoke", asserts: ["auth redirect", "core action", "denied-permission 403"], runnable_unattended: true },
    slo: { availability_target_pct: 99.5, p95_latency_ms: 800, error_rate_target_pct: 1 },
    denylist: ["infra/**", "*.env"], cost_caps: { usd_per_day: 25, max_prs_per_day: 5 },
    triggers: { schedule_ids: ["cron-daily-health"], webhook_ids: [] },
    revert_command: null, secrets_ref: "vault://fleet/example-app/deploy",
    enrolled: { by: "graduation-gate#0", ref: "0000000", schema_version: "1" },
  },
  state: { app_id: "example-app", status: "active", lease: null, open_incidents: 0, last_hygiene: null, last_known_good: null, drift: { status: "in_sync", last_reconciled: null }, schema_version: "1" },
};

const candidate = (args && args.candidate) || EXAMPLE_CANDIDATE;
const config = (candidate && candidate.config) || {};
const admitted = (args && typeof args.admitted === "boolean") ? args.admitted : null; // from a separate admission-validator run
const humanApproval = (args && args.human_approval) || null;

phase("Instrument");
const checks = await agent(instrumentPrompt(config), { label: "instrument:" + (config.app_id || "?"), phase: "Instrument", schema: INSTRUMENT_CHECK_SCHEMA });
const instr = instrumentationRollup(checks || {}); // fail-closed: null/garbled => all missing
log("instrumentation: " + (instr.ready ? "READY" : "NOT READY (" + instr.missing.join(", ") + ")"));

phase("Readiness");
const claim = "App '" + (config.app_id || "?") + "' (tier=" + (config.governance_tier || "?") + ") is operationally READY for UNATTENDED autonomous maintenance.";
const readiness = await adversarialVerify(claim, READINESS_LENSES, config);
log("operational readiness: " + (readiness.survives ? "UPHELD" : "REFUTED") + " (" + readiness.refutedCount + "/" + readiness.total + " refuted)");

// ── Roll-up — FAIL CLOSED ────────────────────────────────────────────────────
// Combine this workflow's two sub-gates (instrument + readiness) with the
// admission-validator result (args.admitted; null = not yet run) and the
// always-human approval, via the engine helpers. A null admission ⇒ not ready.
const ready = graduationReady({ instrumentation_ready: instr.ready, admitted: admitted === true, readiness_survived: readiness.survives });
const decision = graduationDecision(ready, humanApproval);
const ledger = graduationLedgerEntry(ready, { app_id: config.app_id, human_approval: humanApproval });

log("GRADUATION " + decision.verdict + " for '" + (config.app_id || "?") + "' (gate=" + decision.gate_decision + (admitted === null ? "; NOTE admission-validator not yet run — pass args.admitted" : "") + ")");

return {
  app_id: config.app_id || null,
  verdict: decision.verdict,
  gate_decision: decision.gate_decision,
  ready: ready.ready,
  reasons: ready.reasons,
  instrumentation: instr,
  readiness: readiness,
  admitted: admitted,
  human_approval: humanApproval,
  ledger: ledger,
  next_steps: [
    admitted === null ? "run fleet-registry-admission-validator on the candidate; pass its APPROVE as args.admitted" : null,
    !instr.ready ? "fix instrumentation: " + instr.missing.join(", ") : null,
    !readiness.survives ? "address readiness refutations: " + readiness.reasons.join("; ") : null,
    (ready.ready && !(humanApproval && humanApproval.approved === true)) ? "obtain human graduation approval (always-human gate)" : null,
    (ready.ready && humanApproval && humanApproval.approved === true) ? "enroll: write config.yaml (PR) + buildEnrollmentState(...) state.json; append the ledger entry" : null,
  ].filter(Boolean),
};
