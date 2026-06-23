// ════════════════════════════════════════════════════════════════════════════
// fleet-registry SCHEMA — PASTE-IN CONTRACT (not a module)
// Paste this block into any Workflow script or consumer that reads/writes a
// registry record. Same distribution model as workflow-runtime's preamble:
// there is NO import/require, no filesystem, no clock, no RNG. All timestamps
// are TYPED here but SUPPLIED by the caller (a Workflow script cannot read the
// clock); compare them as ISO-8601 UTC strings ("...Z"), which sort
// lexicographically.
//
// TWO records per app, by design (see SKILL.md "Storage model"):
//   • CONFIG_SCHEMA  → config.yaml  — PR-gated, slow-changing, the dangerous knobs
//   • STATE_SCHEMA   → state.json   — machine-mutable, hot (lease, incidents, ...)
//
// DATA, not policy: these schemas store facts. The fail-closed READER
// (prodDeployAllowed) is the ONE piece of enforcement shipped here, because the
// safe default for a missing flag is a property of the data contract itself.
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
