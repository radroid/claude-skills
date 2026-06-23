export const meta = {
  name: "fleet-registry-admission-validator",
  description:
    "The fleet-registry admission gate — validates a candidate app record (config + state) " +
    "before enrollment. Fail-closed: BLOCKS on any missing required field, a SHIP app with no " +
    "revert_command, or a smoke_oracle that cannot survive a hostile adequacy refutation " +
    "(asserts no more than 'boots + 200'). 'An app admitted without an oracle is invisible to " +
    "MAINTAIN' (§7.9) — so this is a gate, not a handoff. Emits the unified verdict + a typed " +
    "AUDIT_LEDGER_ENTRY for the governance layer. graduation-gate calls this to enroll.",
  phases: [
    { title: "Validate", detail: "deterministic schema + required-field + revert check (fail-closed)" },
    { title: "OracleAdequacy", detail: "adversarial-verify the smoke oracle asserts more than boots+200" },
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
// fleet-registry SCHEMA — PASTE-IN CONTRACT (inlined from assets/registry-schema.js)
// Same paste-in model as the canon: no import. Kept in sync with
// assets/registry-schema.js — edit there, re-paste here.
// ════════════════════════════════════════════════════════════════════════════
const GOVERNANCE_TIERS = ["experimental", "standard", "critical"];
const DEPLOY_FLAG_VALUES = ["HOLD", "SHIP"]; // fail-closed: anything-not-"SHIP" === HOLD
const APP_STATUS_VALUES = ["active", "held", "retired", "quarantined"];
const DRIFT_STATUS_VALUES = ["in_sync", "drift_detected", "unreconciled"];

// ── config.yaml — PR-GATED record ────────────────────────────────────────────
const SMOKE_ORACLE_SCHEMA = {
  type: "object",
  required: ["command", "asserts"],
  additionalProperties: false,
  properties: {
    command: { type: "string", description: "The runtime smoke command, e.g. 'npm run smoke'." },
    asserts: {
      type: "array",
      minItems: 1,
      description:
        "What the oracle ASSERTS, one human-readable claim per item. 'boots + 200' " +
        "is necessary but radically insufficient (§7.9) — list the user-facing " +
        "behaviors checked (auth path, a denied-permission path, a core action).",
      items: { type: "string" },
    },
    runnable_unattended: {
      type: "boolean",
      description: "false ⇒ needs a human/manual step; the runtime queues it instead of gating on it.",
    },
  },
};

const CONFIG_SCHEMA = {
  type: "object",
  required: [
    "app_id", "repo", "governance_tier", "merge_deploys_to_prod",
    "smoke_oracle", "slo", "denylist", "cost_caps", "triggers", "enrolled",
  ],
  additionalProperties: false,
  properties: {
    app_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$", description: "Canonical id; matches the fleet/apps/<app-id>/ dir." },
    repo: { type: "string", description: "owner/name slug." },
    prod_url: { type: ["string", "null"], description: "Production URL, or null for a non-deployed app." },
    governance_tier: { type: "string", enum: GOVERNANCE_TIERS, description: "Bounds what governance may auto-approve; governance READS this." },
    merge_deploys_to_prod: {
      type: "string",
      enum: DEPLOY_FLAG_VALUES,
      description: "D3. SHIP ⇒ a merge can reach prod. DEFAULTS HOLD — read via prodDeployAllowed(), which fail-closes anything-not-SHIP to HOLD.",
    },
    smoke_oracle: SMOKE_ORACLE_SCHEMA,
    slo: {
      type: "object",
      description: "Health baselines/SLOs the runtime scores against. Common fields typed; app-specific metrics allowed.",
      additionalProperties: true,
      properties: {
        availability_target_pct: { type: "number", minimum: 0, maximum: 100 },
        p95_latency_ms: { type: "integer", minimum: 0 },
        error_rate_target_pct: { type: "number", minimum: 0, maximum: 100 },
      },
    },
    denylist: {
      type: "array",
      description: "Path globs the agent must never touch for THIS app (per-app; distinct from the harness L1 floor).",
      items: { type: "string" },
    },
    cost_caps: {
      type: "object",
      required: ["usd_per_day", "max_prs_per_day"],
      additionalProperties: false,
      description: "§7.7 circuit-breaker inputs. The registry STORES the numbers; governance trips on them.",
      properties: {
        usd_per_day: { type: "number", minimum: 0 },
        max_prs_per_day: { type: "integer", minimum: 0 },
        max_concurrent_sessions: { type: "integer", minimum: 1 },
      },
    },
    triggers: {
      type: "object",
      required: ["schedule_ids", "webhook_ids"],
      additionalProperties: false,
      description: "D2 trigger dedupe/scoping — the IDs that may wake a session for this app.",
      properties: {
        schedule_ids: { type: "array", items: { type: "string" } },
        webhook_ids: { type: "array", items: { type: "string" } },
      },
    },
    revert_command: {
      type: ["string", "null"],
      description: "D4. How to un-ship to last_known_good. REQUIRED when merge_deploys_to_prod is SHIP; may be null otherwise.",
    },
    secrets_ref: {
      type: ["string", "null"],
      description: "A POINTER to where deploy creds live (a vault path/name) — NEVER a credential value (§7.4).",
    },
    enrolled: {
      type: "object",
      required: ["by", "ref", "schema_version"],
      additionalProperties: false,
      description: "Provenance — who admitted this app, at which commit, under which schema version.",
      properties: {
        by: { type: "string", description: "graduation-gate run id, or a human." },
        ref: { type: "string", description: "Enrollment commit ref." },
        schema_version: { type: "string" },
      },
    },
  },
};

// ── state.json — MACHINE-MUTABLE record ──────────────────────────────────────
const LEASE_SCHEMA = {
  type: ["object", "null"],
  description: "D2 concurrency lease. null ⇒ free. Held by exactly one session at a time. Timestamps are ISO-8601 UTC, stamped by the SESSION (clock unavailable in-script).",
  required: ["holder", "acquired", "expires"],
  additionalProperties: false,
  properties: {
    holder: { type: "string", description: "Session/trigger id holding the lease." },
    acquired: { type: "string", description: "ISO-8601 UTC acquire time." },
    expires: { type: "string", description: "ISO-8601 UTC expiry; a lease past this is STALE and reclaimable (dead session)." },
  },
};

const STATE_SCHEMA = {
  type: "object",
  required: ["app_id", "status", "lease", "open_incidents", "drift"],
  additionalProperties: false,
  properties: {
    app_id: { type: "string", pattern: "^[a-z0-9][a-z0-9-]*$", description: "Must match the config.yaml app_id." },
    status: { type: "string", enum: APP_STATUS_VALUES, description: "active|held|retired|quarantined. retired/quarantined are invisible to MAINTAIN." },
    lease: LEASE_SCHEMA,
    open_incidents: { type: "integer", minimum: 0 },
    last_hygiene: { type: ["string", "null"], description: "ISO-8601 date of the last hygiene pass, or null." },
    last_known_good: { type: ["string", "null"], description: "D4. The ref a revert restores to. null for non-prod-deploying apps." },
    drift: {
      type: "object",
      required: ["status"],
      additionalProperties: false,
      description: "§7.5 registry↔reality reconciliation.",
      properties: {
        status: { type: "string", enum: DRIFT_STATUS_VALUES },
        last_reconciled: { type: ["string", "null"], description: "ISO-8601 UTC of last reconcile, or null." },
      },
    },
    schema_version: { type: "string" },
  },
};

// ── Deterministic helpers (NO clock, NO RNG — safe to paste into a script) ────

// The ONE piece of enforcement shipped here. Fail-closed: only an exact "SHIP"
// licenses a prod deploy; missing/null/lowercase/typo/garbled ⇒ HOLD.
function prodDeployAllowed(config) {
  return !!config && config.merge_deploys_to_prod === "SHIP";
}

// A prod-deploying app (currently SHIP) MUST carry a revert_command (D4). Used by
// the admission validator. Flipping HOLD→SHIP later must add revert_command in
// that same PR — the PR review is the gate there.
function revertRequired(config) {
  return prodDeployAllowed(config);
}

// Lease state from a state record + the caller-supplied "now" (ISO-8601 UTC).
// Returns "free" | "held" | "stale". held ⇒ back off (also trigger dedupe);
// free/stale ⇒ acquirable (stale = a dead session's expired lease). A lease with
// no/garbled expiry is treated as STALE (reclaimable), never as an eternal hold.
function leaseState(state, nowTs) {
  if (!state || !state.lease) return "free";
  const expires = state.lease.expires;
  if (typeof expires !== "string" || !nowTs) return "stale";
  return expires > nowTs ? "held" : "stale";
}

// Shared required-field lists so the validator and every consumer agree on what
// "complete" means (deterministic; drives the fail-closed admission check).
function requiredConfigFields() {
  return CONFIG_SCHEMA.required.slice();
}
function requiredStateFields() {
  return STATE_SCHEMA.required.slice();
}

// Deterministic missing-required-field check (fail-closed input to admission).
function missingFields(obj, requiredArr) {
  const missing = [];
  for (let i = 0; i < requiredArr.length; i++) {
    const k = requiredArr[i];
    if (!obj || obj[k] === undefined || obj[k] === null) {
      // null IS allowed for the nullable fields, but none of those are in the
      // `required` lists — every required field must be present AND non-null.
      missing.push(k);
    }
  }
  return missing;
}

// ════════════════════════════════════════════════════════════════════════════
// END fleet-registry SCHEMA
// ════════════════════════════════════════════════════════════════════════════

// ── Admission-validator logic ────────────────────────────────────────────────

const CONFIDENCE_BAR = 0.8; // a refute counts only at ≥0.80 confidence (canon bar)

// The hostile lenses that try to REFUTE "this oracle is adequate." Five distinct
// frames — boots-only, no-failure-path, no-core-action, unattended-honesty,
// tier-proportionality. Mirrors the anti-bias lens design in
// orchestrated-delivery's review-and-verify (rules 1–5).
const ORACLE_LENSES = [
  { key: "boots-only", frame: "Does the oracle assert ANYTHING beyond liveness (process up / HTTP 200 / page renders)? If every assertion is just 'it's alive', the oracle is boots+200 and inadequate — REFUTE." },
  { key: "no-failure-path", frame: "Does the oracle exercise a FAILURE path (a denied-permission / unauthorized / error case)? Happy-path-only oracles miss the highest-escape class — if there is no denied/error assertion, REFUTE." },
  { key: "no-core-action", frame: "Does the oracle assert a real CORE USER ACTION succeeds end-to-end (not merely that a screen loads)? If it never drives the app's primary value action, REFUTE." },
  { key: "unattended-honesty", frame: "If runnable_unattended is false (or the command plainly needs a human/manual/native-install step) but this oracle is being treated as an autonomous gate, that is the 0-known-not-0-real trap — REFUTE; such an oracle must be a human-queue item, not a gate." },
  { key: "tier-proportionate", frame: "Is the oracle adequate FOR THIS app's governance_tier? A 'critical' app needs deeper assertions than an 'experimental' one. If the tier is standard/critical but the oracle is thin, REFUTE." },
];

const REFUTE_SCHEMA = {
  type: "object",
  required: ["refuted", "confidence", "reason"],
  additionalProperties: false,
  properties: {
    refuted: { type: "boolean", description: "true ⇒ this lens REFUTES the adequacy claim." },
    confidence: { type: "number", minimum: 0, maximum: 1, description: "Confidence in the refutation; only ≥0.80 counts." },
    reason: { type: "string", description: "One-line justification, cite the specific assert (or its absence)." },
  },
};

function refutePrompt(claim, lens, config) {
  return [
    "You are a HOSTILE admission refuter. Your job is to REFUTE the claim below — assume it is false and try to prove it.",
    "",
    "CLAIM: " + claim,
    "",
    "Your lens — " + lens.key + ":",
    lens.frame,
    "",
    "The smoke_oracle under test:",
    JSON.stringify((config && config.smoke_oracle) || {}, null, 2),
    "App governance_tier: " + ((config && config.governance_tier) || "(unset)"),
    "",
    "Return refuted=true ONLY if, through YOUR lens, the oracle is inadequate. Set confidence honestly",
    "(only ≥0.80 refutations count). 'boots + 200' is necessary but radically insufficient (§7.9).",
    "If your lens finds the oracle adequate, return refuted=false.",
  ].join("\n");
}

// Adversarial-verify a single claim. NO .filter(Boolean) before the tally — a
// dead/null ballot counts as a REFUTE (fail-closed: you never survive on a
// missing skeptic). Tie kills (refutedCount*2 < total is strict). survives only
// if a strict minority of valid+dead ballots refuted.
async function adversarialVerify(claim, lenses, config) {
  const ballots = await parallel(
    lenses.map((lens) => () =>
      agent(refutePrompt(claim, lens, config), {
        label: "refute:" + lens.key,
        phase: "OracleAdequacy",
        schema: REFUTE_SCHEMA,
      })
    )
  );
  const total = ballots.length;
  let refutedCount = 0;
  const reasons = [];
  for (let i = 0; i < ballots.length; i++) {
    const b = ballots[i];
    if (!b) {
      refutedCount++;
      reasons.push(lenses[i].key + ": (dead refuter — counted as refute)");
      continue;
    }
    const validRefute =
      b.refuted === true && typeof b.confidence === "number" && b.confidence >= CONFIDENCE_BAR;
    if (validRefute) {
      refutedCount++;
      reasons.push(lenses[i].key + ": " + (b.reason || "(no reason given)"));
    }
  }
  const survives = total > 0 && refutedCount * 2 < total;
  return { survives, total, refutedCount, reasons };
}

// Self-contained example so the script runs with args undefined (a deliberately
// ADEQUATE record — exercises the APPROVE path). Pass a real candidate as
// args.candidate = { config, state } to validate it.
const EXAMPLE_CANDIDATE = {
  config: {
    app_id: "example-app",
    repo: "radroid/example-app",
    prod_url: "https://example-app.app",
    governance_tier: "standard",
    merge_deploys_to_prod: "HOLD",
    smoke_oracle: {
      command: "npm run smoke",
      asserts: [
        "signed-out user is redirected to /sign-in (auth path)",
        "signed-in user can create and see a new item (core user action)",
        "a non-member is denied access to a private item with a 403 (denied-permission path)",
      ],
      runnable_unattended: true,
    },
    slo: { availability_target_pct: 99.5, p95_latency_ms: 800, error_rate_target_pct: 1 },
    denylist: ["infra/**", "*.env"],
    cost_caps: { usd_per_day: 25, max_prs_per_day: 5, max_concurrent_sessions: 1 },
    triggers: { schedule_ids: ["cron-daily-health"], webhook_ids: ["sentry-incident"] },
    revert_command: null,
    secrets_ref: "vault://fleet/example-app/deploy",
    enrolled: { by: "graduation-gate#0", ref: "0000000", schema_version: "1" },
  },
  state: {
    app_id: "example-app",
    status: "active",
    lease: null,
    open_incidents: 0,
    last_hygiene: null,
    last_known_good: null,
    drift: { status: "in_sync", last_reconciled: null },
    schema_version: "1",
  },
};

const candidate = (args && args.candidate) || EXAMPLE_CANDIDATE;
const config = (candidate && candidate.config) || {};
const state = (candidate && candidate.state) || {};

// ── Phase: deterministic structural validation (fail-closed) ─────────────────
phase("Validate");
const structural = [];
const cfgMissing = missingFields(config, requiredConfigFields());
const stMissing = missingFields(state, requiredStateFields());
for (let i = 0; i < cfgMissing.length; i++) {
  structural.push("config.yaml missing required field: " + cfgMissing[i]);
}
for (let i = 0; i < stMissing.length; i++) {
  structural.push("state.json missing required field: " + stMissing[i]);
}
if (revertRequired(config) && !config.revert_command) {
  structural.push("revert_command is required because merge_deploys_to_prod=SHIP (D4) — refusing to admit a prod-deploying app with no un-ship path");
}
if (config.app_id && state.app_id && config.app_id !== state.app_id) {
  structural.push("app_id mismatch: config='" + config.app_id + "' vs state='" + state.app_id + "'");
}
log("structural checks: " + (structural.length === 0 ? "clean" : structural.length + " blocking"));

// ── Phase: oracle-adequacy adversarial-verify ────────────────────────────────
phase("OracleAdequacy");
let oracle = { survives: false, total: 0, refutedCount: 0, reasons: ["smoke_oracle missing — cannot be adequate"] };
if (config.smoke_oracle) {
  const claim =
    "The smoke_oracle for app '" + (config.app_id || "?") + "' (tier=" +
    (config.governance_tier || "?") + ") is ADEQUATE to license autonomous operation: " +
    "it asserts materially more than 'boots + 200' — including a failure path and a core user action.";
  oracle = await adversarialVerify(claim, ORACLE_LENSES, config);
  log("oracle adequacy: " + (oracle.survives ? "UPHELD" : "REFUTED") + " (" + oracle.refutedCount + "/" + oracle.total + " refuted)");
}

// ── Roll-up — FAIL CLOSED ────────────────────────────────────────────────────
const blocked = structural.length > 0 || !oracle.survives;
const verdict = blocked ? "BLOCK" : "APPROVE";
const issues = structural.map((s) => ({ severity: "blocking", note: s }));
if (!oracle.survives) {
  issues.push({ severity: "blocking", note: "smoke_oracle adequacy refuted — " + oracle.reasons.join("; ") });
}

const ledger = {
  role: "auditor",
  cost: { role: "auditor", label: "admission", tokens_in: 0, tokens_out: 0 },
  verdict,
  issues,
  tests_added: 0,
  gate_decision: gateForVerdict(verdict),
  human_approval: null,
  item: config.app_id || "unknown",
};

log("ADMISSION " + verdict + " for '" + (config.app_id || "?") + "' (" + issues.length + " blocking issue(s))");

return {
  verdict,
  app_id: config.app_id || null,
  admitted: verdict === "APPROVE",
  issues,
  oracle,
  ledger,
};
