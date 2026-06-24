export const meta = {
  name: "fleet-maintenance-monitor-sweep",
  description:
    "The MAINTAIN monitor sweep — fans out over the fleet's active apps (from the registry), gathers each app's health signals, deterministically assesses them against its SLOs into severity-ranked observations, dedupes them into the per-app maintenance backlog, runs a diagnosis agent on the urgent ones, and runs the CTO self-heartbeat (_cto-self). Ranking is DETERMINISTIC (no rubber-stamp); agents only gather (I/O) and diagnose (judgment). Emits per-app AUDIT_LEDGER_ENTRY records + escalations. The actual fix is delegated to orchestrated-delivery, gated by cto-governance-spine (see references/fix-pipeline.md) — this sweep produces the backlog, it does not fix.",
  phases: [
    { title: "Monitor", detail: "gather signals + deterministic healthAssess + dedupe into per-app backlog" },
    { title: "Diagnose", detail: "agent root-cause for sev1/sev2 observations" },
    { title: "Self", detail: "CTO self-heartbeat (cron fired? stale leases? ledger growing?)" },
  ],
};

// ════════════════════════════════════════════════════════════════════════════
// workflow-runtime CANON — CANONICAL PREAMBLE (paste-in, NOT a module)
// Inlined verbatim (executable consts/helpers byte-identical to
// workflow-runtime/assets/preamble.js; surrounding comments role-localized).
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
// fleet-maintenance ENGINE — PASTE-IN (inlined from assets/maintenance.js)
// Kept in sync with assets/maintenance.js — edit there, re-paste here.
// ════════════════════════════════════════════════════════════════════════════
const SEVERITIES = ["sev1", "sev2", "sev3"]; // sev1 = worst
const OBS_CATEGORIES = ["oracle", "availability", "error_rate", "latency", "security", "deps", "unverified", "self"];

// Rank order for sorting (lower = more urgent).
function severityOrder(sev) {
  const i = SEVERITIES.indexOf(sev);
  return i === -1 ? -1 : i; // unknown severity sorts BEFORE sev1 (most urgent, fail-closed)
}

// ── healthAssess — gathered signals → severity-ranked observations ────────────
// signals (caller-gathered, per app): {
//   oracle_pass,            // boolean — did the registry smoke_oracle pass?
//   availability_pct, error_rate_pct, p95_latency_ms,   // current measurements
//   open_cves,              // [{ severity: "critical"|"high"|"moderate"|"low" }]
//   deps_outdated,          // integer count of outdated deps
// }
// slo (from the app's registry config): { availability_target_pct, error_rate_target_pct, p95_latency_ms }
// Returns { status: "down"|"degraded"|"healthy"|"unknown", severity, observations: [...] }.
// FAIL-CLOSED: a missing/garbled signal yields an "unverified" observation, never
// a silent "healthy" — you do not get to look healthy by withholding data.
function healthAssess(signals, slo) {
  const obs = [];
  slo = slo || {};
  if (!signals || typeof signals !== "object") {
    obs.push(mkObs("sev2", "unverified", "health signals missing", "no signals gathered for this app — cannot confirm health"));
    return { status: "unknown", severity: "sev2", observations: obs };
  }

  // Oracle: a red oracle means the app is broken — the strongest signal (§7.9).
  if (signals.oracle_pass === false) {
    obs.push(mkObs("sev1", "oracle", "smoke oracle FAILING", "the registry smoke_oracle did not pass — app is broken"));
  } else if (signals.oracle_pass !== true) {
    obs.push(mkObs("sev2", "unverified", "oracle result unknown", "oracle_pass was neither true nor false — could not confirm the app boots/works"));
  }

  // Availability vs SLO.
  if (typeof signals.availability_pct === "number" && typeof slo.availability_target_pct === "number") {
    const gap = slo.availability_target_pct - signals.availability_pct;
    if (gap >= 5) obs.push(mkObs("sev1", "availability", "availability far below SLO", signals.availability_pct + "% vs target " + slo.availability_target_pct + "%"));
    else if (gap > 0) obs.push(mkObs("sev2", "availability", "availability below SLO", signals.availability_pct + "% vs target " + slo.availability_target_pct + "%"));
  }

  // Error rate vs SLO.
  if (typeof signals.error_rate_pct === "number" && typeof slo.error_rate_target_pct === "number") {
    if (signals.error_rate_pct >= slo.error_rate_target_pct * 2) obs.push(mkObs("sev1", "error_rate", "error rate >= 2x SLO", signals.error_rate_pct + "% vs target " + slo.error_rate_target_pct + "%"));
    else if (signals.error_rate_pct > slo.error_rate_target_pct) obs.push(mkObs("sev2", "error_rate", "error rate above SLO", signals.error_rate_pct + "% vs target " + slo.error_rate_target_pct + "%"));
  }

  // Latency vs SLO (slower-burning).
  if (typeof signals.p95_latency_ms === "number" && typeof slo.p95_latency_ms === "number") {
    if (signals.p95_latency_ms >= slo.p95_latency_ms * 2) obs.push(mkObs("sev2", "latency", "p95 latency >= 2x SLO", signals.p95_latency_ms + "ms vs target " + slo.p95_latency_ms + "ms"));
    else if (signals.p95_latency_ms > slo.p95_latency_ms) obs.push(mkObs("sev3", "latency", "p95 latency above SLO", signals.p95_latency_ms + "ms vs target " + slo.p95_latency_ms + "ms"));
  }

  // Security hygiene: open CVEs.
  if (Array.isArray(signals.open_cves) && signals.open_cves.length) {
    let worst = "low";
    for (let i = 0; i < signals.open_cves.length; i++) {
      const s = (signals.open_cves[i] && signals.open_cves[i].severity) || "low";
      if (s === "critical") worst = "critical";
      else if (s === "high" && worst !== "critical") worst = "high";
      else if (s === "moderate" && worst !== "critical" && worst !== "high") worst = "moderate";
    }
    const sev = worst === "critical" ? "sev1" : worst === "high" ? "sev2" : "sev3";
    obs.push(mkObs(sev, "security", signals.open_cves.length + " open CVE(s), worst=" + worst, "dependency/security advisory open"));
  }

  // Dependency hygiene: outdated deps (lowest urgency).
  if (typeof signals.deps_outdated === "number" && signals.deps_outdated > 0) {
    obs.push(mkObs("sev3", "deps", signals.deps_outdated + " outdated dependencies", "dependency hygiene"));
  }

  const severity = worstSeverity(obs);
  const status = !obs.length ? "healthy" : severity === "sev1" ? "down" : "degraded";
  return { status: status, severity: severity, observations: obs };
}

function mkObs(severity, category, title, detail) {
  return { severity: severity, category: category, title: title, detail: detail };
}

// The worst (most urgent) severity in a list; null/empty → "sev3" floor (a clean
// sweep has no obs and is handled by the caller; for a non-empty list we return
// the genuinely worst).
function worstSeverity(obs) {
  if (!obs || !obs.length) return "sev3";
  let worst = "sev3";
  for (let i = 0; i < obs.length; i++) {
    if (severityOrder(obs[i].severity) < severityOrder(worst)) worst = obs[i].severity;
  }
  // Normalize an unrecognized severity UP to the canonical most-urgent (sev1) so
  // downstream `=== "sev1"` checks (status=down, BLOCK, escalate) fail closed
  // instead of silently treating a garbled severity as merely "degraded".
  return SEVERITIES.indexOf(worst) === -1 ? "sev1" : worst;
}

// ── Backlog: dedupe + merge + rank ───────────────────────────────────────────
// A backlog item is keyed by (app_id, category, title) so the same recurring issue
// updates in place instead of piling duplicates every sweep. nowTs is caller-supplied.
function itemKey(item) {
  if (!item) return "?|?|?"; // a null/garbled item never throws — it keys to a junk slot
  return (item.app_id || "?") + "|" + (item.category || "?") + "|" + (item.title || "?");
}
// Merge freshly-observed items into an existing backlog. An OPEN item with the same
// key is refreshed (last_seen, severity may worsen) — never duplicated. A new key is
// appended as `open`. Returns { backlog, added: [...] }. PURE w.r.t. inputs: existing
// items are cloned, so refreshing never mutates the caller's array.
function mergeBacklog(existing, incoming, nowTs) {
  const backlog = (existing || []).map(function (it) { return Object.assign({}, it); });
  const byKey = {};
  for (let i = 0; i < backlog.length; i++) byKey[itemKey(backlog[i])] = backlog[i];
  const added = [];
  for (let i = 0; i < (incoming || []).length; i++) {
    const inc = incoming[i];
    if (!inc) continue; // skip null/garbled incoming items rather than file junk
    const k = itemKey(inc);
    const cur = byKey[k];
    if (cur && cur.status !== "done") {
      cur.last_seen = nowTs || cur.last_seen;
      // severity can WORSEN on a refresh, never silently improve while open.
      if (severityOrder(inc.severity) < severityOrder(cur.severity)) cur.severity = inc.severity;
    } else {
      const item = {
        app_id: inc.app_id, category: inc.category, severity: inc.severity,
        source: inc.source || "poll", title: inc.title, detail: inc.detail,
        status: "open", first_seen: nowTs || null, last_seen: nowTs || null,
      };
      backlog.push(item);
      byKey[k] = item;
      added.push(item);
    }
  }
  return { backlog: rankBacklog(backlog), added: added };
}
// Severity-rank open items first (sev1→sev3), done items last; stable otherwise.
function rankBacklog(backlog) {
  return (backlog || []).slice().sort(function (a, b) {
    const ad = a.status === "done" ? 1 : 0;
    const bd = b.status === "done" ? 1 : 0;
    if (ad !== bd) return ad - bd;
    return severityOrder(a.severity) - severityOrder(b.severity);
  });
}

// ── Webhook-alert ingestion (BUILT, GATED OFF in v1) ─────────────────────────
// D2: build for webhooks early, enable the surface last. The adapter is real code
// but disabled by default; flip WEBHOOK_INGEST_ENABLED (or pass opts.force_enabled)
// only once the auth + dedupe guards are proven on a sacrificial app (§7.4 — a
// spoofed alert is a code-injection vector, not just cost). Fail-closed at every
// step: disabled → refuse; unauthenticated → refuse; an alert whose trigger_id is
// not registered for this app → refuse. An accepted alert returns a backlog item
// to feed through mergeBacklog (which dedupes it against the open backlog).
const WEBHOOK_INGEST_ENABLED = false;
function ingestWebhookAlert(alert, app, opts) {
  opts = opts || {};
  if (!WEBHOOK_INGEST_ENABLED && opts.force_enabled !== true) {
    return { accepted: false, reason: "webhook ingestion gated off (v1) — poll-sweep only" };
  }
  if (!alert || alert.authenticated !== true) {
    return { accepted: false, reason: "unauthenticated alert — refused (§7.4)" };
  }
  const ids = (app && app.config && app.config.triggers && app.config.triggers.webhook_ids) || [];
  if (ids.indexOf(alert.trigger_id) === -1) {
    return { accepted: false, reason: "alert trigger_id '" + (alert.trigger_id || "?") + "' not registered for this app — refused" };
  }
  const sev = SEVERITIES.indexOf(alert.severity) === -1 ? "sev1" : alert.severity; // unknown → most urgent
  const item = {
    app_id: app.config.app_id, source: "webhook",
    category: OBS_CATEGORIES.indexOf(alert.category) === -1 ? "availability" : alert.category,
    severity: sev, title: alert.title || "webhook alert", detail: alert.detail || "",
  };
  return { accepted: true, reason: "ingested", item: item };
}

// ── CTO self-heartbeat (§7.6) — escalate-never-fix ───────────────────────────
// The orchestration layer is monitored like an app (fleet/apps/_cto-self). Each
// check is deterministic; a miss is an ESCALATE (a human looks), never an auto-fix
// — you do not let the watchdog repair itself. The caller supplies durations
// (no clock here).
function selfHeartbeat(input) {
  input = input || {};
  const issues = [];
  // 1) Did the last cron fire within its window?
  if (typeof input.cron_age_min !== "number") {
    issues.push(mkObs("sev1", "self", "cron liveness unknown", "no cron_age_min supplied — cannot confirm the scheduler fired"));
  } else if (typeof input.max_cron_age_min === "number" && input.cron_age_min > input.max_cron_age_min) {
    issues.push(mkObs("sev1", "self", "cron overdue", "last cron " + input.cron_age_min + "min ago > " + input.max_cron_age_min + "min window — scheduler may be dead"));
  }
  // 2) Any stale lease = a session that died holding the lock.
  const stale = input.stale_lease_apps || [];
  if (stale.length) {
    issues.push(mkObs("sev2", "self", stale.length + " stale lease(s)", "apps with an expired lease (dead session?): " + stale.join(", ")));
  }
  // 3) Did the ledger actually grow? A silently-frozen ledger falsifies every audit claim.
  if (typeof input.ledger_prev === "number" && typeof input.ledger_curr === "number") {
    if (input.ledger_curr <= input.ledger_prev && input.expected_ledger_writes) {
      issues.push(mkObs("sev1", "self", "audit ledger not growing", "ledger count " + input.ledger_curr + " <= prev " + input.ledger_prev + " despite expected writes — ledger may be failing silently"));
    }
  } else if (input.expected_ledger_writes) {
    issues.push(mkObs("sev2", "self", "ledger growth unverifiable", "ledger counts not supplied while writes were expected"));
  }
  return {
    ok: issues.length === 0,
    action: issues.length ? "escalate" : "ok", // never "auto_fix" — the watchdog escalates
    issues: issues,
  };
}

// ════════════════════════════════════════════════════════════════════════════
// END fleet-maintenance ENGINE
// ════════════════════════════════════════════════════════════════════════════

// ── monitor-sweep logic ──────────────────────────────────────────────────────

const FIX_CLASSES = ["docs", "dep_patch", "dep_minor", "dep_major", "tests", "small_fix", "feature", "schema_change", "infra", "escalate"];

const SIGNALS_SCHEMA = {
  type: "object",
  required: ["oracle_pass"],
  additionalProperties: true,
  properties: {
    oracle_pass: { type: "boolean" },
    availability_pct: { type: "number" },
    error_rate_pct: { type: "number" },
    p95_latency_ms: { type: "number" },
    deps_outdated: { type: "integer", minimum: 0 },
    open_cves: { type: "array", items: { type: "object", properties: { severity: { type: "string" } } } },
  },
};

const DIAGNOSIS_SCHEMA = {
  type: "object",
  required: ["root_cause", "suggested_fix_class", "confidence"],
  additionalProperties: false,
  properties: {
    root_cause: { type: "string" },
    suggested_fix_class: { type: "string", enum: FIX_CLASSES },
    confidence: { type: "number", minimum: 0, maximum: 1 },
    summary: { type: "string" },
  },
};

function gatherPrompt(app) {
  return [
    "FIRST acquire the fleet-registry D2 lease for app '" + app.config.app_id + "' (one writer per app).",
    "If the lease is already HELD by another live session, do NOT gather — return immediately noting the held lease (back off; this is also trigger dedupe).",
    "Only if the lease is free/stale (acquire it), gather the current health signals for '" + app.config.app_id + "' (" + app.config.repo + ").",
    "Run/inspect: the registry smoke_oracle (`" + ((app.config.smoke_oracle && app.config.smoke_oracle.command) || "?") + "`),",
    "the prod /health endpoint, error-tracking error rate, p95 latency, availability, open CVEs, outdated deps.",
    "Return the typed signals object. oracle_pass MUST reflect the real oracle result. Release the lease when done.",
  ].join("\n");
}

function diagnosePrompt(appId, topObs, assess) {
  return [
    "Diagnose the most urgent health issue for app '" + appId + "'.",
    "Top observation [" + topObs.severity + "/" + topObs.category + "]: " + topObs.title + " — " + topObs.detail,
    "All observations: " + JSON.stringify(assess.observations),
    "Give a one-line root_cause, a suggested_fix_class (one of " + FIX_CLASSES.join(", ") + "; use 'escalate' if no safe autonomous fix exists),",
    "and your confidence. Do NOT write the fix — that is delegated to orchestrated-delivery, gated by cto-governance-spine.",
  ].join("\n");
}

// Sweep outcome → canon verdict + gate (DETERMINISTIC).
function sweepVerdict(assess) {
  if (assess.status === "healthy") return "APPROVE";
  if (assess.severity === "sev1") return "BLOCK";
  return "REVISE";
}
function sweepLedger(r) {
  const verdict = sweepVerdict(r.assess);
  const issues = r.assess.observations.map(function (o) {
    return { severity: o.severity === "sev1" ? "blocking" : "non_blocking", note: "[" + o.severity + "/" + o.category + "] " + o.title };
  });
  return {
    role: "auditor",
    cost: { role: "auditor", label: "monitor-sweep", tokens_in: 0, tokens_out: 0 },
    verdict: verdict,
    issues: issues,
    tests_added: 0,
    gate_decision: gateForVerdict(verdict),
    human_approval: null,
    item: r.app_id,
  };
}

// Self-contained example fleet (signals provided ⇒ no live gather needed; pass a
// real fleet as args.fleet to sweep it). A healthy app, a broken (sev1) app, and a
// slow (sev3) app — exercises healthy/escalate/degraded paths + a diagnosis.
const EXAMPLE_FLEET = [
  {
    config: { app_id: "healthy-app", repo: "radroid/healthy-app", governance_tier: "standard", slo: { availability_target_pct: 99.5, error_rate_target_pct: 1, p95_latency_ms: 800 }, smoke_oracle: { command: "npm run smoke" } },
    backlog: [],
    signals: { oracle_pass: true, availability_pct: 99.9, error_rate_pct: 0.2, p95_latency_ms: 500, open_cves: [], deps_outdated: 0 },
  },
  {
    config: { app_id: "broken-app", repo: "radroid/broken-app", governance_tier: "critical", slo: { availability_target_pct: 99.9, error_rate_target_pct: 0.5, p95_latency_ms: 600 }, smoke_oracle: { command: "npm run smoke" } },
    backlog: [],
    signals: { oracle_pass: false, availability_pct: 92, error_rate_pct: 3, p95_latency_ms: 1500, open_cves: [{ severity: "high" }], deps_outdated: 4 },
  },
  {
    config: { app_id: "slow-app", repo: "radroid/slow-app", governance_tier: "experimental", slo: { availability_target_pct: 99, error_rate_target_pct: 2, p95_latency_ms: 700 }, smoke_oracle: { command: "npm run smoke" } },
    backlog: [],
    signals: { oracle_pass: true, availability_pct: 99.6, error_rate_pct: 0.5, p95_latency_ms: 900, open_cves: [], deps_outdated: 9 },
  },
];
const EXAMPLE_SELF = { cron_age_min: 4, max_cron_age_min: 30, stale_lease_apps: [], ledger_prev: 40, ledger_curr: 43, expected_ledger_writes: true };

const fleet = (args && args.fleet) || EXAMPLE_FLEET;
const self = (args && args.self) || EXAMPLE_SELF;
const nowTs = (args && args.nowTs) || "1970-01-01T00:00:00Z"; // caller stamps; constant fallback (no clock in-script)

phase("Monitor");
const results = await pipeline(
  fleet,
  // Stage 1 — gather (use provided signals; else an agent gathers via I/O) + deterministic assess + dedupe.
  async function (app) {
    let signals = app.signals;
    if (!signals) {
      signals = await agent(gatherPrompt(app), { label: "gather:" + app.config.app_id, phase: "Monitor", schema: SIGNALS_SCHEMA });
    }
    const assess = healthAssess(signals, app.config.slo);
    const incoming = assess.observations.map(function (o) {
      return { app_id: app.config.app_id, source: "poll", category: o.category, severity: o.severity, title: o.title, detail: o.detail };
    });
    const merged = mergeBacklog(app.backlog || [], incoming, nowTs);
    return { app_id: app.config.app_id, tier: app.config.governance_tier, assess: assess, added: merged.added, backlog: merged.backlog };
  },
  // Stage 2 — diagnose the urgent ones (agent judgment; healthy apps pass through).
  // Diagnosis is ENRICHMENT, never on the critical path: if the agent throws, KEEP
  // the deterministic assessment (diagnosis:null) so a down app is never erased by a
  // diagnosis failure. (agent() returning null is already non-throwing; this guards
  // the throw path the pipeline would otherwise drop to null.)
  async function (swept) {
    const urgent = swept.assess.observations.filter(function (o) { return o.severity === "sev1" || o.severity === "sev2"; });
    if (!urgent.length) return Object.assign({ diagnosis: null }, swept);
    urgent.sort(function (a, b) { return severityOrder(a.severity) - severityOrder(b.severity); });
    try {
      const dx = await agent(diagnosePrompt(swept.app_id, urgent[0], swept.assess), {
        label: "diagnose:" + swept.app_id, phase: "Diagnose", schema: DIAGNOSIS_SCHEMA,
      });
      return Object.assign({ diagnosis: dx }, swept);
    } catch (e) {
      return Object.assign({ diagnosis: null, diagnosis_error: String(e) }, swept);
    }
  }
);

phase("Self");
const heartbeat = selfHeartbeat(self);

// ── Roll-up — FAIL CLOSED ────────────────────────────────────────────────────
// A DROPPED pipeline item (null — a stage threw despite the guards) must NEVER be
// silence: for a watchdog, a vanished app is the worst outcome. Map every result
// back to its app by index; a null becomes its own sev1 escalation + BLOCK ledger
// entry ("assessment failed — investigate"), so a crashed sweep over-escalates
// rather than under-reports.
const clean = results.filter(Boolean);
const dropped = [];
for (let i = 0; i < results.length; i++) {
  if (!results[i]) {
    const fa = fleet[i] || {};
    dropped.push((fa.config && fa.config.app_id) || ("app#" + i));
  }
}
const ledger = clean.map(sweepLedger);
const escalations = clean
  .filter(function (r) { return r.assess.severity === "sev1"; })
  .map(function (r) { return { app_id: r.app_id, severity: "sev1", observations: r.assess.observations, diagnosis: r.diagnosis }; });
for (let i = 0; i < dropped.length; i++) {
  escalations.push({ app_id: dropped[i], severity: "sev1", observations: [{ severity: "sev1", category: "unverified", title: "sweep stage failed", detail: "assessment was dropped (a pipeline stage threw) — investigate this app manually" }], diagnosis: null });
  ledger.push({ role: "auditor", cost: { role: "auditor", label: "monitor-sweep", tokens_in: 0, tokens_out: 0 }, verdict: "BLOCK", issues: [{ severity: "blocking", note: "sweep stage failed — app assessment dropped" }], tests_added: 0, gate_decision: "escalate", human_approval: null, item: dropped[i] });
}
if (!heartbeat.ok) {
  escalations.push({ app_id: "_cto-self", severity: "sev1", observations: heartbeat.issues, diagnosis: null });
  // The self-miss is audit truth — append a _cto-self ledger entry too.
  ledger.push({ role: "auditor", cost: { role: "auditor", label: "self-heartbeat", tokens_in: 0, tokens_out: 0 }, verdict: "BLOCK", issues: heartbeat.issues.map(function (o) { return { severity: "blocking", note: "[" + o.severity + "/" + o.category + "] " + o.title }; }), tests_added: 0, gate_decision: "escalate", human_approval: null, item: "_cto-self" });
}
const newItems = rankBacklog(clean.reduce(function (acc, r) { return acc.concat(r.added); }, []));

const counts = {
  swept: clean.length,
  dropped: dropped.length,
  healthy: clean.filter(function (r) { return r.assess.status === "healthy"; }).length,
  degraded: clean.filter(function (r) { return r.assess.status === "degraded" || r.assess.status === "unknown"; }).length,
  down: clean.filter(function (r) { return r.assess.status === "down"; }).length,
};
log("swept " + counts.swept + " app(s): " + counts.healthy + " healthy, " + counts.degraded + " degraded, " + counts.down + " down; " +
  escalations.length + " escalation(s); self-heartbeat " + (heartbeat.ok ? "OK" : "FAILED"));

return {
  counts: counts,
  new_items: newItems,
  escalations: escalations,
  self_heartbeat: heartbeat,
  ledger: ledger,
};
