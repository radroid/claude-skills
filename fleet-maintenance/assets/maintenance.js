// ════════════════════════════════════════════════════════════════════════════
// fleet-maintenance ENGINE — PASTE-IN MODULE (not a module)
// Paste into the monitor-sweep Workflow script (or a session step). Same model as
// the rest of the spine: NO import/require, no filesystem, no clock, no RNG —
// timestamps/durations are computed by the CALLER and passed in.
//
// What is DETERMINISTIC here (no agents — same discipline as cto-governance-spine):
// turning gathered health signals into severity-ranked observations, deduping a
// backlog, and the CTO self-heartbeat. Agents are only for I/O (gathering an app's
// signals) and JUDGMENT (diagnosing a detected issue) — never for the ranking
// itself, which must be mechanical and fail-closed.
//
// BOUNDARY: fleet-maintenance is the standalone MAINTAIN engine (D5). It READS the
// fleet-registry (signals to compare against `slo`, the lease, the oracle command),
// GATES every fix through cto-governance-spine, and DELEGATES the per-PR fix to
// orchestrated-delivery. This module owns only the novel surface: telemetry →
// ranked backlog, and the self-heartbeat.
// ════════════════════════════════════════════════════════════════════════════

const SEVERITIES = ["sev1", "sev2", "sev3"]; // sev1 = worst
const OBS_CATEGORIES = ["oracle", "availability", "error_rate", "latency", "security", "deps", "unverified"];

// Rank order for sorting (lower = more urgent).
function severityOrder(sev) {
  const i = SEVERITIES.indexOf(sev);
  return i === -1 ? 0 : i; // unknown severity sorts as MOST urgent (fail-closed)
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
  return worst;
}

// ── Backlog: dedupe + merge + rank ───────────────────────────────────────────
// A backlog item is keyed by (app_id, category, title) so the same recurring issue
// updates in place instead of piling duplicates every sweep. nowTs is caller-supplied.
function itemKey(item) {
  return (item.app_id || "?") + "|" + (item.category || "?") + "|" + (item.title || "?");
}
// Merge freshly-observed items into an existing backlog. An OPEN item with the same
// key is refreshed (last_seen, severity may worsen) — never duplicated. A new key is
// appended as `open`. Returns { backlog, added: [...] }.
function mergeBacklog(existing, incoming, nowTs) {
  const backlog = (existing || []).slice();
  const byKey = {};
  for (let i = 0; i < backlog.length; i++) byKey[itemKey(backlog[i])] = backlog[i];
  const added = [];
  for (let i = 0; i < (incoming || []).length; i++) {
    const inc = incoming[i];
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
