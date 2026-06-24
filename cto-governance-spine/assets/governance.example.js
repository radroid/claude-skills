// ════════════════════════════════════════════════════════════════════════════
// cto-governance-spine POLICY MODULE — PASTE-IN CONTRACT (not a module)
// Paste this block into any Workflow script or session step that must enforce
// governance policy before acting. Same distribution model as the workflow-runtime
// preamble and the fleet-registry schema: NO import/require, no filesystem, no
// clock, no RNG. Timestamps are stamped by the CALLER and passed in.
//
// THE DESIGN INVARIANT (§6 L4): the autonomous-mode-gate is an ENUMERATED
// ALLOW-LIST, never an LLM "confidence" score — confidence is the rubber-stamp
// the whole regime exists to distrust. So every function here is DETERMINISTIC:
// a matrix lookup + precondition checks with a single correct answer. There are
// no agent() calls in governance — that is the point.
//
// BOUNDARY: this module ENFORCES policy. It reads FACTS the caller derived from
// the fleet-registry (the prod flag, cost caps, the denylist, the oracle result)
// — it does NOT re-implement the registry's readers. registry = data; this =
// policy; workflow-runtime = mechanism. loop-supervisor only INFORMS, never
// enforces (that is here).
// ════════════════════════════════════════════════════════════════════════════

// ── Decision classes + the tier-driven autonomy matrix ───────────────────────
// Every action the CTO can take is tagged with ONE decision class. The matrix
// maps an app's governance_tier (from the registry) to the SET of classes that
// may be auto-approved UNSUPERVISED at that tier. A class not in the set escalates
// to a human. prod_deploy and graduation are in NO tier's set — they are always
// human gates (handled before the matrix is consulted).
// The full action taxonomy. A class NOT in any tier's allow-list below is
// "recognized but always-human at current tiers" — dep_minor, dep_major, feature,
// schema_change, infra are deliberately human-only for now (reserved for a future
// widening of the matrix), and prod_deploy + graduation are always-human
// structurally. Enumerating them (rather than letting them fall through as
// "unknown") makes the matrix's EXCLUSIONS explicit and gives the ledger an honest
// class label. An action that maps to NONE of these is unrecognized → escalate.
// (An incident fix is NOT its own class — tag it by its actual change shape, e.g.
// small_fix / tests; see references/incident-and-escalation.md.)
const DECISION_CLASSES = [
  "docs",
  "dep_patch",
  "dep_minor",
  "dep_major",
  "tests",
  "small_fix",
  "feature",
  "schema_change",
  "infra",
  "prod_deploy",
  "graduation",
];

const AUTONOMY_MATRIX = {
  experimental: ["docs", "dep_patch", "tests", "small_fix"],
  standard: ["docs", "dep_patch", "tests"],
  critical: ["docs"],
};
// The most-restrictive tier — the fail-closed default for an unknown/garbled tier.
const SAFEST_TIER = "critical";

// docs is the only class that cannot change runtime behavior, so it is the only
// class allowed to proceed WITHOUT a confirmed-green smoke oracle. Every other
// class requires oracle_green === true (fail-closed: anything-not-true holds).
function oracleRequired(decisionClass) {
  return decisionClass !== "docs";
}

// ── Gate ⇄ verdict mapping (mirrors workflow-runtime's gateForVerdict) ────────
// proceed↔APPROVE, hold↔REVISE, escalate↔BLOCK. Provided so a governance gate
// decision can be written to the canonical AUDIT_LEDGER_ENTRY (which carries BOTH
// a verdict and a gate_decision).
function verdictForGate(gate) {
  if (gate === "proceed") return "APPROVE";
  if (gate === "hold") return "REVISE";
  return "BLOCK"; // escalate
}

function decide(gate, reasons, why) {
  return { gate_decision: gate, reasons: reasons.concat([why]) };
}

// ── The prod-deploy HOLD rule (D3) ───────────────────────────────────────────
// Enforces the RULE; the registry owns the fail-closed flag READ. `prodFlagShip`
// is the caller's prodDeployAllowed(config) result (true ONLY for an exact
// "SHIP"). A prod deploy needs BOTH: the flag SHIP *and* a human approval. The
// registry guarantees you never deploy on an absent flag; this guarantees you
// never deploy on the flag alone.
function prodDeployRule(prodFlagShip, humanApproval) {
  if (!prodFlagShip) return "hold"; // registry says HOLD (flag not SHIP / fail-closed)
  if (humanApproval && humanApproval.approved === true) return "proceed";
  return "escalate"; // flag allows, but a human must sign off
}

// ── The cost circuit-breaker (§7.7) ──────────────────────────────────────────
// Hard caps from the registry's cost_caps. Returns the tripped caps (empty ⇒ ok).
// A breaker trip is a transient HOLD, not an escalation — back off, retry later.
// `usage` and `caps` are caller-supplied snapshots (no clock here).
function costBreaker(usage, caps) {
  const tripped = [];
  if (!caps) return { tripped: ["cost_caps missing — fail-closed trip"], ok: false };
  usage = usage || {};
  // REQUIRED caps: a missing or non-number value fail-closes (trip), never skips —
  // a cap that silently disappears would let spend run uncapped (fail-open).
  if (typeof caps.usd_per_day !== "number") {
    tripped.push("usd_per_day not a number — fail-closed trip");
  } else if ((usage.usd_today || 0) >= caps.usd_per_day) {
    tripped.push("usd_per_day (" + (usage.usd_today || 0) + " >= " + caps.usd_per_day + ")");
  }
  if (typeof caps.max_prs_per_day !== "number") {
    tripped.push("max_prs_per_day not a number — fail-closed trip");
  } else if ((usage.prs_today || 0) >= caps.max_prs_per_day) {
    tripped.push("max_prs_per_day (" + (usage.prs_today || 0) + " >= " + caps.max_prs_per_day + ")");
  }
  // OPTIONAL cap: enforced only when present; present-but-non-number fail-closes.
  if (caps.max_concurrent_sessions !== undefined) {
    if (typeof caps.max_concurrent_sessions !== "number") {
      tripped.push("max_concurrent_sessions not a number — fail-closed trip");
    } else if ((usage.concurrent_sessions || 0) > caps.max_concurrent_sessions) {
      tripped.push("max_concurrent_sessions (" + (usage.concurrent_sessions || 0) + " > " + caps.max_concurrent_sessions + ")");
    }
  }
  return { tripped: tripped, ok: tripped.length === 0 };
}

// ── The per-app denylist (refusal) ───────────────────────────────────────────
// True if any touched path matches a per-app denylist glob (substring/`*` form).
// A denylist hit is a REFUSAL → escalate, never a silent skip. This composes
// with — does not replace — the harness L1 floor (auto-loop-bootstrap).
function denylistViolation(touchedPaths, denylist) {
  if (!denylist || !denylist.length || !touchedPaths || !touchedPaths.length) return false;
  for (let i = 0; i < touchedPaths.length; i++) {
    const p = touchedPaths[i];
    for (let j = 0; j < denylist.length; j++) {
      if (globMatch(p, denylist[j])) return true;
    }
  }
  return false;
}
// Minimal deterministic glob: `*` expands to `.*` (matches any sequence INCLUDING
// path separators — intentionally over-eager for a denylist, so it errs toward
// catching MORE, never missing). Anchored full-string match. Sufficient for
// denylist globs like "infra/**", "*.env", "secrets/*". Do NOT "fix" this toward
// `[^/]*`: that would let a denylisted path slip through (fail-OPEN) — the wrong
// direction for a refusal gate.
function globMatch(path, glob) {
  let re = "^";
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === "*") {
      re += ".*";
    } else if ("\\^$.|?+()[]{}".indexOf(c) !== -1) {
      re += "\\" + c; // escape regex metachars
    } else {
      re += c;
    }
  }
  re += "$";
  return new RegExp(re).test(path);
}

// ── THE AUTONOMOUS-MODE-GATE ─────────────────────────────────────────────────
// The single decision: may the CTO take THIS action unsupervised? Deterministic,
// fail-closed, ordered so the highest-stakes checks win first.
//
// candidate = {
//   decision_class,           // one of DECISION_CLASSES
//   tier,                     // app governance_tier (registry); unknown ⇒ critical
//   oracle_green,             // boolean — caller's smoke-oracle result
//   denylist_hit,             // boolean — caller ran denylistViolation()
//   is_prod_deploy,           // boolean — does this action deploy to prod?
//   prod_flag_ship,           // boolean — caller's prodDeployAllowed(config)
//   cost_ok,                  // boolean — caller's costBreaker(...).ok
//   human_approval,           // { approved, by } | null
// }
// → { gate_decision: "proceed" | "hold" | "escalate", reasons: [...] }
function autonomousModeGate(candidate) {
  candidate = candidate || {};
  const reasons = [];

  // Fail-closed tier: an unknown/garbled tier is treated as the most restrictive.
  let tier = candidate.tier;
  if (!AUTONOMY_MATRIX[tier]) {
    reasons.push("tier '" + tier + "' unknown → treated as '" + SAFEST_TIER + "' (fail-closed)");
    tier = SAFEST_TIER;
  }

  const cls = candidate.decision_class;
  if (DECISION_CLASSES.indexOf(cls) === -1) {
    return decide("escalate", reasons, "decision_class '" + cls + "' is unrecognized → escalate (fail-closed)");
  }

  // 1) Denylist refusal is ABSOLUTE and checked FIRST — a "never touch" path
  //    refuses regardless of class, tier, or even a human-approved prod deploy
  //    (the approval was for the action, not necessarily for touching a forbidden
  //    path — so surface the specific hit to a human). Truthy = refuse (a danger
  //    signal, fail-closed, same posture as is_prod_deploy below).
  if (candidate.denylist_hit) {
    return decide("escalate", reasons, "touches a per-app denylisted path — refuse + escalate");
  }

  // 2) Always-human classes, regardless of tier.
  if (cls === "graduation") {
    return decide("escalate", reasons, "graduation is always a human gate");
  }
  // is_prod_deploy is a DANGER flag — treat ANY truthy/garbled value as "this is a
  // prod deploy" (fail-closed). Only an explicitly falsy value means "not prod".
  if (candidate.is_prod_deploy || cls === "prod_deploy") {
    const r = prodDeployRule(candidate.prod_flag_ship === true, candidate.human_approval);
    return decide(r, reasons, "prod deploy → " + r + " (flag SHIP=" + (candidate.prod_flag_ship === true) +
      ", human_approval=" + (!!(candidate.human_approval && candidate.human_approval.approved)) + ")");
  }

  // 3) Is the class even auto-approvable at this tier? If not, a human decides;
  //    runtime preconditions below don't matter.
  if (AUTONOMY_MATRIX[tier].indexOf(cls) === -1) {
    return decide("escalate", reasons, "class '" + cls + "' is not on the '" + tier + "' allow-list — needs a human");
  }

  // 4) The class IS auto-approvable — now the runtime preconditions (transient HOLDs).
  if (oracleRequired(cls) && candidate.oracle_green !== true) {
    return decide("hold", reasons, "class '" + cls + "' requires a green smoke oracle; oracle_green is not true — hold");
  }
  if (candidate.cost_ok !== true) {
    return decide("hold", reasons, "cost circuit-breaker not clear (cost_ok!=true) — hold");
  }

  // 5) Auto-approve. (Report the oracle status HONESTLY — docs is oracle-exempt, so
  //    do NOT assert "oracle green" for a docs change whose oracle was red/absent;
  //    the ledger must not record a false fact.)
  const oracleNote = oracleRequired(cls) ? "oracle green" : "oracle not required (docs)";
  return decide("proceed", reasons,
    "class '" + cls + "' auto-approvable at tier '" + tier + "' (" + oracleNote + ", within cost caps, not prod, not denylisted)");
}

// ── Incident severity ladder + ack-timeout + dead-man's-switch (§7.2) ─────────
// Deterministic mapping from severity → required response + ack-timeout (minutes).
// sev1 = prod down / data at risk; sev2 = degraded; sev3 = minor.
const SEVERITY_LADDER = {
  sev1: { action: "escalate", ack_timeout_min: 15, page_human: true },
  sev2: { action: "escalate", ack_timeout_min: 60, page_human: false },
  sev3: { action: "auto_triage", ack_timeout_min: 240, page_human: false },
};
// Returns the required response for an incident. If the CTO has not ACKed within
// the ack-timeout (caller computes ageMinutes from its own clock), the dead-man's
// switch fires: ESCALATE to a human regardless of severity — a CTO gone dark
// mid-incident must not silently sit on it.
function incidentResponse(severity, acked, ageMinutes) {
  const rung = SEVERITY_LADDER[severity] || SEVERITY_LADDER.sev1; // unknown severity ⇒ treat as worst (fail-closed)
  if (acked !== true && typeof ageMinutes === "number" && ageMinutes >= rung.ack_timeout_min) {
    return { action: "escalate", reason: "dead-man's-switch: unacked " + ageMinutes + "min ≥ " + rung.ack_timeout_min + "min ack-timeout", rung: rung };
  }
  return { action: rung.action, reason: "severity " + severity + " ladder rung", rung: rung };
}

// ── The single global audit-ledger entry builder ─────────────────────────────
// Governance owns ONE append-only ledger (fleet/ledger.jsonl). Every gate outcome
// is one entry conforming to workflow-runtime's AUDIT_LEDGER_ENTRY. The registry
// stores NO audit history — this is the single source of audit truth. cost/ts are
// stamped by the caller (no clock here).
function governanceLedgerEntry(decision, ctx) {
  ctx = ctx || {};
  const gate = decision.gate_decision;
  const issues = [];
  if (gate === "hold") {
    issues.push({ severity: "non_blocking", note: decision.reasons[decision.reasons.length - 1] });
  } else if (gate === "escalate") {
    issues.push({ severity: "blocking", note: decision.reasons[decision.reasons.length - 1] });
  }
  return {
    role: "auditor",
    cost: { role: "auditor", label: ctx.label || "governance-gate", tokens_in: 0, tokens_out: 0 },
    verdict: verdictForGate(gate),
    issues: issues,
    tests_added: 0,
    gate_decision: gate,
    human_approval: ctx.human_approval || null,
    item: ctx.app_id || ctx.item || "unknown",
  };
}
// ════════════════════════════════════════════════════════════════════════════
// END cto-governance-spine POLICY MODULE
// ════════════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════════════
// RUNNABLE EXAMPLE + SELF-TEST (plain node: `node governance.example.js`)
// The block ABOVE is assets/governance.js verbatim (paste-in, no import). The
// block BELOW exercises every branch of the autonomous-mode-gate as executable
// documentation of the contract — run it to see exactly what auto-approves.
// ════════════════════════════════════════════════════════════════════════════
const APPROVED = { approved: true, by: "raj" };

const CASES = [
  // docs never needs an oracle and is auto-approvable at every tier:
  { name: "docs @critical, oracle red", c: { decision_class: "docs", tier: "critical", oracle_green: false, cost_ok: true }, expect: "proceed" },
  { name: "docs @critical, oracle green", c: { decision_class: "docs", tier: "critical", oracle_green: true, cost_ok: true }, expect: "proceed" },
  // tier-driven allow-list:
  { name: "small_fix @experimental (allow-listed)", c: { decision_class: "small_fix", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "proceed" },
  { name: "small_fix @standard (NOT allow-listed)", c: { decision_class: "small_fix", tier: "standard", oracle_green: true, cost_ok: true }, expect: "escalate" },
  { name: "dep_patch @standard (allow-listed)", c: { decision_class: "dep_patch", tier: "standard", oracle_green: true, cost_ok: true }, expect: "proceed" },
  { name: "dep_major @experimental (NOT allow-listed)", c: { decision_class: "dep_major", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "escalate" },
  { name: "feature @experimental (NOT allow-listed)", c: { decision_class: "feature", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "escalate" },
  // runtime preconditions (transient HOLD) on an allow-listed class:
  { name: "small_fix @experimental, oracle red", c: { decision_class: "small_fix", tier: "experimental", oracle_green: false, cost_ok: true }, expect: "hold" },
  { name: "tests @experimental, cost blown", c: { decision_class: "tests", tier: "experimental", oracle_green: true, cost_ok: false }, expect: "hold" },
  // prod deploy = flag SHIP AND human:
  { name: "prod_deploy, SHIP + approved", c: { decision_class: "prod_deploy", tier: "standard", is_prod_deploy: true, prod_flag_ship: true, human_approval: APPROVED }, expect: "proceed" },
  { name: "prod_deploy, SHIP no approval", c: { decision_class: "prod_deploy", tier: "standard", is_prod_deploy: true, prod_flag_ship: true, human_approval: null }, expect: "escalate" },
  { name: "prod_deploy, flag HOLD", c: { decision_class: "prod_deploy", tier: "standard", is_prod_deploy: true, prod_flag_ship: false, human_approval: APPROVED }, expect: "hold" },
  { name: "is_prod_deploy on a docs class, flag HOLD", c: { decision_class: "docs", tier: "experimental", is_prod_deploy: true, prod_flag_ship: false }, expect: "hold" },
  // graduation always human:
  { name: "graduation @experimental", c: { decision_class: "graduation", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "escalate" },
  // fail-closed tier + class:
  { name: "dep_patch @unknown-tier → critical(docs-only)", c: { decision_class: "dep_patch", tier: "weird", oracle_green: true, cost_ok: true }, expect: "escalate" },
  { name: "docs @unknown-tier → critical (docs ok)", c: { decision_class: "docs", tier: "weird", oracle_green: true, cost_ok: true }, expect: "proceed" },
  { name: "unknown decision_class", c: { decision_class: "frobnicate", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "escalate" },
  // denylist refusal beats an otherwise auto-approvable class:
  { name: "docs but denylist_hit", c: { decision_class: "docs", tier: "experimental", denylist_hit: true, oracle_green: true, cost_ok: true }, expect: "escalate" },
  // hardened: is_prod_deploy is a DANGER flag — any truthy value routes to the prod rule:
  { name: "is_prod_deploy='true' (string) on docs, flag HOLD", c: { decision_class: "docs", tier: "experimental", is_prod_deploy: "true", prod_flag_ship: false }, expect: "hold" },
  { name: "is_prod_deploy=1 on small_fix, SHIP no approval", c: { decision_class: "small_fix", tier: "experimental", is_prod_deploy: 1, prod_flag_ship: true, human_approval: null }, expect: "escalate" },
  // removed class: incident_fix is no longer recognized → escalate (fail-closed):
  { name: "incident_fix (removed) → unrecognized escalate", c: { decision_class: "incident_fix", tier: "experimental", oracle_green: true, cost_ok: true }, expect: "escalate" },
  // denylist is ABSOLUTE — overrides even a human-approved prod deploy, and is truthy-tested:
  { name: "prod SHIP+approved BUT denylist_hit → refuse", c: { decision_class: "prod_deploy", tier: "standard", is_prod_deploy: true, prod_flag_ship: true, human_approval: APPROVED, denylist_hit: true }, expect: "escalate" },
  { name: "denylist_hit truthy 'yes' on docs → refuse", c: { decision_class: "docs", tier: "experimental", denylist_hit: "yes" }, expect: "escalate" },
];

let fail = 0;
for (const t of CASES) {
  const got = autonomousModeGate(t.c).gate_decision;
  const ok = got === t.expect;
  if (!ok) fail++;
  console.log((ok ? "  PASS " : "  FAIL ") + t.expect.padEnd(8) + " got=" + got.padEnd(8) + " | " + t.name);
}

// Direct unit checks of the helper functions:
function eq(name, got, want) { const ok = JSON.stringify(got) === JSON.stringify(want); if (!ok) fail++; console.log((ok ? "  PASS " : "  FAIL ") + name + " => " + JSON.stringify(got)); }
eq("prodDeployRule(false,approved)", prodDeployRule(false, APPROVED), "hold");
eq("prodDeployRule(true,null)", prodDeployRule(true, null), "escalate");
eq("prodDeployRule(true,approved)", prodDeployRule(true, APPROVED), "proceed");
eq("costBreaker over usd", costBreaker({ usd_today: 30 }, { usd_per_day: 25, max_prs_per_day: 5 }).ok, false);
eq("costBreaker under", costBreaker({ usd_today: 5, prs_today: 1 }, { usd_per_day: 25, max_prs_per_day: 5 }).ok, true);
eq("costBreaker missing caps fail-closed", costBreaker({}, null).ok, false);
eq("denylist *.env hit", denylistViolation(["app/config.env"], ["*.env", "infra/**"]), true);
eq("denylist infra/** hit", denylistViolation(["infra/deploy/x.tf"], ["infra/**"]), true);
eq("denylist clean", denylistViolation(["src/app.ts"], ["*.env", "infra/**"]), false);
eq("incident sev1 unacked past timeout → dead-man escalate", incidentResponse("sev1", false, 20).action, "escalate");
eq("incident sev3 acked → auto_triage", incidentResponse("sev3", true, 1).action, "auto_triage");
eq("incident unknown severity → worst (escalate-capable)", incidentResponse("???", false, 999).action, "escalate");
eq("verdictForGate proceed", verdictForGate("proceed"), "APPROVE");
eq("ledger entry shape (escalate→blocking issue)", governanceLedgerEntry(autonomousModeGate({ decision_class: "graduation", tier: "critical" }), { app_id: "x" }).issues[0].severity, "blocking");

eq("costBreaker non-number usd cap → fail-closed", costBreaker({ usd_today: 0 }, { usd_per_day: "25", max_prs_per_day: 5 }).ok, false);
eq("costBreaker missing required cap → fail-closed", costBreaker({}, { max_prs_per_day: 5 }).ok, false);
eq("docs proceed reason is honest (not 'oracle green')", autonomousModeGate({ decision_class: "docs", tier: "critical", oracle_green: false, cost_ok: true }).reasons.join(" ").indexOf("oracle green") === -1, true);

console.log(fail === 0 ? "\nALL GOVERNANCE SELF-TESTS PASS" : "\n" + fail + " FAILURE(S)");
process.exit(fail === 0 ? 0 : 1);
