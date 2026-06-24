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
// ════════════════════════════════════════════════════════════════════════════
// RUNNABLE EXAMPLE + SELF-TEST (plain node: `node maintenance.example.js`)
// The block ABOVE is assets/maintenance.js verbatim (paste-in, no import). The
// block BELOW exercises the deterministic engine — executable documentation of
// how raw health signals become a severity-ranked backlog, and the self-heartbeat.
// ════════════════════════════════════════════════════════════════════════════
let fail = 0;
function eq(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fail++;
  console.log((ok ? "  PASS " : "  FAIL ") + name + " => " + JSON.stringify(got) + (ok ? "" : " (want " + JSON.stringify(want) + ")"));
}

const SLO = { availability_target_pct: 99.5, error_rate_target_pct: 1, p95_latency_ms: 800 };

// healthAssess
eq("healthy app → healthy/no obs", healthAssess({ oracle_pass: true, availability_pct: 99.9, error_rate_pct: 0.2, p95_latency_ms: 500, open_cves: [], deps_outdated: 0 }, SLO).status, "healthy");
eq("oracle red → sev1 down", healthAssess({ oracle_pass: false }, SLO).severity, "sev1");
eq("oracle missing → sev2 unverified", healthAssess({ availability_pct: 99.9 }, SLO).observations[0].category, "unverified");
eq("availability far below → sev1", healthAssess({ oracle_pass: true, availability_pct: 90 }, SLO).severity, "sev1");
eq("availability slightly below → sev2", healthAssess({ oracle_pass: true, availability_pct: 99.4 }, SLO).severity, "sev2");
eq("error rate 2x → sev1", healthAssess({ oracle_pass: true, error_rate_pct: 2 }, SLO).severity, "sev1");
eq("error rate above → sev2", healthAssess({ oracle_pass: true, error_rate_pct: 1.5 }, SLO).severity, "sev2");
eq("p95 2x → sev2", healthAssess({ oracle_pass: true, p95_latency_ms: 1600 }, SLO).severity, "sev2");
eq("p95 above → sev3", healthAssess({ oracle_pass: true, p95_latency_ms: 900 }, SLO).severity, "sev3");
eq("critical CVE → sev1", healthAssess({ oracle_pass: true, open_cves: [{ severity: "critical" }] }, SLO).severity, "sev1");
eq("high CVE → sev2", healthAssess({ oracle_pass: true, open_cves: [{ severity: "high" }] }, SLO).severity, "sev2");
eq("outdated deps → sev3", healthAssess({ oracle_pass: true, deps_outdated: 12 }, SLO).severity, "sev3");
eq("no signals at all → unknown/unverified", healthAssess(null, SLO).status, "unknown");

// mergeBacklog / dedupe / rank
const obs = healthAssess({ oracle_pass: false, open_cves: [{ severity: "high" }] }, SLO).observations.map(function (o) { return Object.assign({ app_id: "a1", source: "poll" }, o); });
const m1 = mergeBacklog([], obs, "2026-06-24T00:00:00Z");
eq("merge into empty adds all", m1.added.length, obs.length);
eq("merge ranks sev1 first", m1.backlog[0].severity, "sev1");
const m2 = mergeBacklog(m1.backlog, obs, "2026-06-24T01:00:00Z");
eq("re-merge same obs dedupes (0 added)", m2.added.length, 0);
eq("re-merge refreshes last_seen", m2.backlog.filter(function (i) { return i.last_seen === "2026-06-24T01:00:00Z"; }).length, obs.length);
// done items don't dedupe; ranking puts done last
const withDone = [{ app_id: "a1", category: "latency", title: "p95", severity: "sev3", status: "done" }];
const m3 = mergeBacklog(withDone, [{ app_id: "a1", category: "latency", title: "p95", severity: "sev3", source: "poll" }], "2026-06-24T02:00:00Z");
eq("done item does NOT dedupe (new added)", m3.added.length, 1);
eq("rank puts done last", m3.backlog[m3.backlog.length - 1].status, "done");
// severity worsens on refresh
const open2 = [{ app_id: "a1", category: "error_rate", title: "e", severity: "sev2", status: "open" }];
const m4 = mergeBacklog(open2, [{ app_id: "a1", category: "error_rate", title: "e", severity: "sev1", source: "poll" }], "2026-06-24T03:00:00Z");
eq("severity worsens on refresh", m4.backlog[0].severity, "sev1");

// selfHeartbeat
eq("self ok when all green", selfHeartbeat({ cron_age_min: 5, max_cron_age_min: 30, stale_lease_apps: [], ledger_prev: 10, ledger_curr: 12, expected_ledger_writes: true }).ok, true);
eq("cron overdue → escalate", selfHeartbeat({ cron_age_min: 60, max_cron_age_min: 30 }).action, "escalate");
eq("cron age missing → sev1", selfHeartbeat({}).issues[0].severity, "sev1");
eq("stale leases → escalate", selfHeartbeat({ cron_age_min: 1, max_cron_age_min: 30, stale_lease_apps: ["a1", "a2"] }).action, "escalate");
eq("frozen ledger w/ expected writes → escalate", selfHeartbeat({ cron_age_min: 1, max_cron_age_min: 30, ledger_prev: 10, ledger_curr: 10, expected_ledger_writes: true }).action, "escalate");


// hardened: unknown severity is most-urgent + normalizes to sev1 downstream
eq("severityOrder unknown = -1 (most urgent)", severityOrder("bogus"), -1);
eq("worstSeverity normalizes unknown → sev1", worstSeverity([{ severity: "bogus" }]), "sev1");
// mergeBacklog purity + null-skip
const _ex = [{ app_id: "a1", category: "deps", title: "t", severity: "sev3", status: "open" }];
mergeBacklog(_ex, [{ app_id: "a1", category: "deps", title: "t", severity: "sev1", source: "poll" }], "ts");
eq("mergeBacklog does not mutate caller's existing", _ex[0].severity, "sev3");
eq("mergeBacklog skips null incoming", mergeBacklog([], [null, { app_id: "a1", category: "deps", title: "t2", severity: "sev3", source: "poll" }], "ts").added.length, 1);
// webhook adapter: built, gated, fail-closed
const _app = { config: { app_id: "a1", triggers: { webhook_ids: ["sentry-incident"] } } };
eq("webhook gated off by default", ingestWebhookAlert({ authenticated: true, trigger_id: "sentry-incident" }, _app).accepted, false);
eq("webhook force+unauth refused", ingestWebhookAlert({ authenticated: false, trigger_id: "sentry-incident" }, _app, { force_enabled: true }).accepted, false);
eq("webhook force+auth+unregistered refused", ingestWebhookAlert({ authenticated: true, trigger_id: "spoofed" }, _app, { force_enabled: true }).accepted, false);
eq("webhook force+auth+registered accepted", ingestWebhookAlert({ authenticated: true, trigger_id: "sentry-incident", severity: "sev2", title: "x" }, _app, { force_enabled: true }).accepted, true);

console.log(fail === 0 ? "\nALL FLEET-MAINTENANCE SELF-TESTS PASS" : "\n" + fail + " FAILURE(S)");
process.exit(fail === 0 ? 0 : 1);
