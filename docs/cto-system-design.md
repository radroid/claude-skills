# Autonomous-CTO system design

> **Status:** Design / roadmap. Defines the target system, the skills that compose it,
> and the order to build them. Produced 2026-06-22 by the multi-agent `cto-system-design`
> workflow (15 agents: 10 skill profilers → 3 lens architects → synthesis → adversarial
> critique) and hardened against the live repo + a headless-runner spike.
>
> **Decisions locked 2026-06-22** (see §10): loop mechanism = interactive Claude Code CLI
> (xhigh + ultracode + `/loop`), **not** `claude -p`; triggers = **schedule + webhook** from
> day one; prod-deploy default = **per-app `fleet-registry` flag** (HOLD when unset); rollback
> required for **prod-deploying apps**; MAINTAIN = **standalone `fleet-maintenance`** skill.

## 1. Goal

Turn this repo into the operating base for an autonomous **"CTO"**: Claude sessions on
**loop / schedule / webhook** triggers, each commanding a subagent army, that

1. **MAINTAIN** a fleet of existing production apps,
2. **BUILD** new apps from idea → running app, and
3. **GRADUATE** newly-built apps into the maintenance fleet.

The skills must **define and bound** that system — encode best practices and a repeatable,
auditable process so the autonomous CTO stays on the rails.

## 2. Core finding

The repo today is a **BUILD machine wearing a CTO costume.** Verified against the live repo:

- A grep across every `SKILL.md` for `monitor / incident / alert / triage / CVE / fleet`
  returns **zero hits**. The MAINTAIN pillar does not exist.
- `autonomous-build-loop` S6 (Maintenance) is literally *"reserved / not implemented."*
- There is **zero concrete ultracode** — `agent()/parallel()/pipeline()` appears nowhere;
  the only `.js` in the repo is a mock-data template. "Use ultracode" is aspirational prose
  in every skill.
- `orchestrated-delivery` is Workflow-*shaped* but not Workflow-*wired*, and its entry gate
  hard-stops on a human-only `/effort ultracode` flip. An interactive `/loop` session (D1)
  clears this once at human kickoff and then runs AFK; but a *fully* unattended
  schedule/webhook-fired session (D2) has no human to flip it — making the agent's
  self-assertion of the ultracode posture an open governance item (see D1 and §7).

The good news: **nearly every primitive the CTO needs already exists**, trapped in BUILD
skills and pointed the wrong way. The work is mostly **rewiring**, plus one genuinely new
foundation (a shared ultracode runtime) and the MAINTAIN actuators.

### De-risking spike (resolved)

The critique's #1 risk was *"does a Workflow runner that executes arbitrary JS even exist —
and does it work in the headless mode the CTO will run in?"* **Answered: yes.**

- This design doc was itself produced by that runner in an interactive session (15 agents).
- A headless probe (`claude -p --allowedTools "Workflow" --output-format json`) ran a 2-agent
  fan-out end to end: `{"workflow_tool_available": true, "workflow_completed": true,
  "replies": ["PING","PONG"]}` — ~14s, ~$0.52, **no `bypassPermissions` needed.**

Implications:
- The "make the gates **non-optional pipeline stages**" mechanism is viable in production.
- Deployment uses a **scoped tool allowlist** (`--allowedTools …`), never a blanket bypass
  (the auto-mode classifier correctly blocks `bypassPermissions`). Scoping the allowlist is
  itself part of the governance layer.
- Real maintenance workflows whose internal agents need `Bash`/`Edit` will require those
  tools in the allowlist too — pair the allowlist with the per-repo denylist (§7 L1).

## 3. Existing skills — where each shines + top ultracode upgrade

| Skill | Lifecycle role | Where it shines | #1 ultracode upgrade |
|---|---|---|---|
| **grill-to-prd** | BUILD (front door) | Fuzzy idea → structured `PRD.md`; where human intent enters the rails | Phase-5 self-review → **adversarial-verify** (kills self-rubber-stamp) |
| **idea-to-loop** | BUILD → graduate handoff | "I have an idea" → running app, greenfield | auto-research fan-out → real `parallel()` + completeness critic (reused in S1/S2/S3) |
| **prd-to-screens** | BUILD pre-flight | PRD → screen inventory; catch missing UX before code | per-screen HTML → `pipeline()` + worktree isolation; autonomous judge-panel proxy for the human gates |
| **screen-design-loop** | BUILD design gate | Refine a known screen set to best-in-class via Mobbin | whole-inventory `pipeline()`; **judge-panel** on hero screens; adversarial P6 verify |
| **auto-loop-bootstrap** | GRADUATE on-ramp **+ imprints denylist** | Make an existing repo loopable; stamp the safety denylist | backlog → adversarial-verify; **stack-adaptive denylist**; history secret-scan |
| **autonomous-build-loop** | BUILD workhorse | AFK overnight backlog drain (S3+); survives auto-compaction | fat-iter dispatch → `parallel()` in **worktree isolation**; single reviewer → adversarial-verify; verification → perspective-diverse verify |
| **orchestrated-delivery** | BUILD substrate **+ governance spine** | Ship a multi-PR backlog with a real anti-bias review regime | wire the anti-bias regime + steward as **concrete pipeline stages** (today they "tend to never run") |
| **loop-supervisor** | GOVERNANCE auditor | Catch claimed-vs-shipped drift in long runs; informs, never enforces | reconciliation → deterministic JS pipeline; generalize one-window-one-loop → **fleet auditor** |
| **archive-loop-scaffolding** | GRADUATE actuator | Cleanly strip build scaffolding when an app leaves the loop (reversible, MANIFEST) | wrap in a graduation pipeline; add a **non-interactive mode** (keep ask-don't-guess → escalate) |
| **frontend-evolution-timelapse** | GOVERNANCE / evidence | Visual audit trail of UI over history; **exemplar token discipline** | per-lane worktree `parallel`; **adversarial vision-verify** → visual-regression sentinel |

The eight upgrades are nearly the *same edit* (parallel + worktree + adversarial-verify /
judge-panel) — which is exactly why the shared runtime (§5) should exist instead of eight copies.

## 4. Target system shape

Three lifecycles map onto three triggers, all speaking one language: **fan-out, then gate.**

| Lifecycle | Primary trigger | Shape |
|---|---|---|
| **BUILD** | in-session `ScheduleWakeup` loop (AFK, human-kicked) | the existing pipeline, rewired to real ultracode |
| **GRADUATE** | one-shot `RemoteTrigger` (drained-backlog + CI-green) | a gated enrollment pipeline (today: a loose teardown pair) |
| **MAINTAIN** | `CronCreate` sweeps + `RemoteTrigger` incidents; `Monitor` live tail; `PushNotification` escalation | **the biggest gap** — telemetry → triage → fix → gate → hold |

**Load-bearing insight:** a feature fix and a production bug-fix flow through the *same*
`orchestrated-delivery` substrate with the *same* adversarial gate — **only the backlog source
differs** (PRD vs telemetry). That shared substrate is what makes one repo a coherent CTO.

**The four binding layers:**
1. **workflow-runtime** — versioned JS primitives + canonical schemas every skill imports.
2. **per-lifecycle wiring** — the prose fan-outs converted to concrete scripts.
3. **the subagent army** — `parallel` over the fleet for health sweeps; `pipeline` over bug
   items (item N verifies while N+1 diagnoses); adversarial-verify panels at every merge;
   judge-panels for dep-upgrade strategy / stack pick / graduation go-no-go; loop-until-dry
   for signal dedupe and the blind-hostile re-review — all token-budgeted, all schema-validated.
4. **the audit ledger** — every agent returns `role/cost/verdict/issues/tests_added/gate_decision/
   human_approval` to one append-only fleet-wide ledger the steward + fleet-auditor read.

## 5. New skills to create (the defined set)

| Skill | Priority | Lifecycle | What it is |
|---|---|---|---|
| **workflow-runtime** | **P0** | cross-cutting | The shared JS library: `agent/parallel/pipeline/loop-until-dry/adversarial-verify/judge-panel/perspective-diverse-verify/worktree` + canonical `VERDICT`/cost/checkpoint schemas. Turns "use ultracode" from prose into mechanism; makes the steward/anti-bias gates **non-skippable**. *Author the first real script against the live runner to pin its contract* (documented traps: TypeScript-in-plain-JS; unsupported params; `args` can arrive undefined → inline constants). |
| **fleet-registry** | **P0** | maintain + graduate | The source of truth nothing today has: per-app repo slug, prod URL, alert-webhook trigger IDs, **merge-deploys-to-prod flag (defaults HOLD / fail-closed)**, denylist, runtime smoke-oracle command, health baselines/SLOs, open-incident count, last-hygiene date, governance tier. Every trigger scopes to one app from here. |
| **fleet-maintenance** | **P0** | maintain | The whole MAINTAIN pillar in one engine: schedule/webhook health monitoring → ingest+dedupe+severity-rank into a triaged backlog → autonomous fix (diagnose → `orchestrated-delivery` → **non-negotiable adversarial-verify gate** → prepare-and-HOLD on prod). Dependency/security hygiene + incident response are **modes, not separate skills**. Reuses `orchestrated-delivery` as the per-PR substrate. |
| **graduation-gate** | P1 | graduate | The hard, auditable BUILD→MAINTAIN enrollment: readiness-audit (parallel probes) → instrumentation-verify + baseline capture → judge-panel go/no-go (**hard human gate for prod**) → `archive-loop-scaffolding` (non-interactive) → enroll into `fleet-registry` with monitoring/alerts/denylist/oracle/runbook attached. *An app admitted without an oracle is invisible to MAINTAIN — so this must be a gate, not a handoff.* |
| **app-provisioning-and-instrumentation** | P1 | build + graduate | Provision external services **and** install the telemetry that makes an app monitorable (PostHog events + super-properties, error tracking, `/health` endpoint, funnel instrumentation), so *monitorable* is a property the app is born with. Spec already exists at `docs/cc-stack-setup-skill-handoff.md`. **Scope as an orchestrator over existing `clerk`/`posthog-instrumentation`/`cloudflare-deploy`/`convex` skills**, not a re-implementation. |
| **cto-governance-spine** | P1 | cross-cutting | The POLICY contract every trigger runs through: prod-deploy HOLD rule (deterministic precondition), per-app denylist contract, escalation thresholds, the steward/friction/KPI self-tuning loop, the persistence/resume contract (gh+git+repo docs+memory; **no prior session context**), the single append-only audit ledger, and the **autonomous-mode-gate** (what an agent may auto-approve vs. must escalate). *Policy here; mechanism in workflow-runtime.* |

### Scope decisions still open (from the adversarial critique)

These are real "draw the boundary" calls, **not blockers** — each carries a lean below and
gets *locked at the point its skill is built* (deciding now, before the runtime is proven
under load, would be premature). They do not gate the P0 critical path; D5 already resolved
the biggest one (fleet-maintenance is standalone).
- **workflow-runtime (mechanism) vs cto-governance-spine (policy)** — the HOLD rule, denylist
  contract, and ledger schema are claimed by both. Author each rule in exactly one place or
  the verdict-grammar drift the split was meant to prevent reappears.
- **cto-governance-spine vs generalized loop-supervisor** — both want to "read the ledger,
  do outlier/regression analysis, inform-not-enforce." One absorbs the other, or draw the line.
- **fleet-maintenance vs orchestrated-delivery** — if "only the backlog source differs," the
  novel surface is just telemetry→backlog + trigger plumbing; it may be a **mode** of
  orchestrated-delivery + a thin trigger adapter rather than a standalone engine.
- **graduation-gate vs fleet-registry** — graduation's terminal stage *is* a registry write;
  it could be a registry-admission validator. Justify the split or merge.
- **app-provisioning** overlaps 4–5 existing setup skills — keep it a thin orchestrator
  (idempotent dev/prod env-var wiring + `/health` convention), not a re-implementation.

## 6. Governance — best practices encoded as mechanism, not prose (5 levels)

- **L1 Harness-enforced hard floors.** The `auto-loop-bootstrap` `settings.local.json`
  denylist (deny Read/Edit on `.env`/secrets/`*.pem`; deny Bash on `rm -rf` / `git push
  --force` / `git reset --hard` / prod deploys) is imprinted on every repo entering the fleet,
  re-applied every session, stack-adapted, and re-asserted by a drift auditor. Worktree
  isolation makes the per-path single-mutator rule structural. The prod-deploy HOLD rule is a
  deterministic precondition keyed off the registry flag (defaults HOLD/fail-closed).
- **L2 Schema-validated gates as state transitions.** Every checkpoint (scope-/stack-/prd-
  accepted, graduated, incident-closed) is a typed field flipped only by a Workflow stage, so a
  skipped gate is detectable.
- **L3 Adversarial quality gates (the #1 risk: rubber-stamping).** Nothing ships on a single
  agent APPROVE — N skeptics on diverse lenses must fail to refute "safe to merge." No
  self-marked homework (reviewer-authored test + runtime smoke oracle per change). A long
  zero-block streak is a **SMELL** that auto-triggers blind-hostile re-review. Trust a runtime
  failure only against a **fresh** artifact (cache-bust). **These must be concrete runtime
  stages** — if they degrade to prose, the regime silently stops running.
- **L4 Human-on-the-rails where reversibility is lowest.** Prod deploy and graduation are hard
  human gates. The autonomous-mode-gate bounds exactly which lower-stakes decision **classes**
  an agent may auto-approve (an enumerated allow-list, **not** an LLM "confidence" threshold —
  confidence is the rubber-stamp the regime exists to distrust). loop-supervisor (generalized)
  audits read-only and informs, never enforces.
- **L5 Cost + audit discipline.** Bounding invariant: **QUALITY OUTRANKS TOKEN SAVINGS** —
  per-stage budgets are soft outlier signals the steward tunes, never caps on a quality gate.
  But see the hard circuit-breaker requirement in §8. All costs/verdicts/approvals append to
  the one ledger. The honest verification frontier (UI/native = 0-known-not-0-real) is queued
  for a human, not auto-shipped.

## 7. Critical gaps to close BEFORE any unattended run

The forward edge (build → fix → hold) is well covered. The reverse edge and operational seams
are not. **Critic's verdict: CONDITIONAL** — treat *"can it un-ship and notice itself failing"*
as a gating requirement equal to *"can it ship,"* and prove the dangerous edge on a sacrificial
app **early**, not at the end of the build.

1. **No rollback / un-ship actuator.** Safety ends at prepare-and-HOLD. Once a held PR is
   approved and breaks prod, there is no defined revert / last-known-good restore. *Must add.*
2. **Incident escalation is a gesture, not a contract** — needs a severity ladder,
   ack-timeout, and a dead-man's-switch for the CTO itself going dark mid-incident.
3. **Concurrency** — a cron sweep and an incident can wake sessions on the same app at once.
   Need a per-app lease/lock + trigger dedupe **before** triggers go live.
4. **Secrets the agent must *use*** (deploy creds, scoped per-app) + **webhook authentication**
   — a spoofed Sentry/Dependabot trigger is a code-injection vector, not just cost.
5. **Fleet discovery is one-way** — only graduation enrolls apps. Need brownfield onboarding,
   registry↔reality drift reconciliation, and a retirement/de-registration path.
6. **No observability of the CTO itself** — are crons firing? is a session hung? is the ledger
   actually being written? (A silently-failing ledger makes every "auditable" claim false.)
   Need a liveness/heartbeat on the orchestration layer.
7. **Hard cost circuit-breaker** — soft budgets + heavy fan-out + trigger storms = no
   blast-radius fuse. Need at least one hard cap (per-app/window spend, global concurrent
   sessions, max-PRs/app/day).
8. **Graduation is a one-way latch** — need a demotion path when an app keeps failing its
   oracle, and re-baselining after a legitimate major change (else every intended change reads
   as a regression forever).
9. **Smoke oracle is overloaded** — it gates autonomy, graduation, per-fix verify, and
   demotion. Define what an oracle must *assert* to license auto-merge to prod ("boots + 200"
   is necessary but radically insufficient).

## 8. Rollout sequence

0. **workflow-runtime (P0) — unblocks everything.** Author the FIRST concrete script (the
   `orchestrated-delivery` reviewer as adversarial-verify) against the live runner to pin its
   contract, then ship the primitives + `VERDICT`/cost/checkpoint schemas. *(Runner viability
   already confirmed — see §2 spike.)*
1. **Prove the runtime on the strongest pillar** — wire `orchestrated-delivery` (per-item
   pipeline + anti-bias adversarial-verify + worktree-isolated steward gate) and
   `autonomous-build-loop` (parallel worktree fat-iter + adversarial peer review +
   perspective-diverse verification). Validates the library under load.
2. **fleet-registry (P0)** + extract **cto-governance-spine (P1)** on the now-real runtime;
   generalize **loop-supervisor** into the fleet auditor in the same pass.
3. **fleet-maintenance (P0)** — close the biggest functional gap: signal → reproduced → fixed
   → verified-safe → held-or-merged.
4. **app-provisioning-and-instrumentation (P1)** then **graduation-gate (P1)**; give
   `archive-loop-scaffolding` its non-interactive mode and `auto-loop-bootstrap` its
   stack-adaptive denylist + history secret-scan here.
5. **frontend-evolution-timelapse → visual-regression sentinel**; wire `idea-to-loop` /
   `prd-to-screens` / `screen-design-loop` to the runtime. High-value, not blocking.
6. **Flip on triggers incrementally** — start SCHEDULE (nightly hygiene + weekly blind-hostile
   re-review) on a **single** graduated app with HOLD on, watch the ledger for spend outliers
   and escaped defects; add WEBHOOK once dedupe + per-app rate limits + auth are proven. Expand
   to the fleet only after a clean week of held-and-human-approved prod merges.

> **Sequencing caveat (critic):** §8 step 6 is currently the *only* validation step and sits
> after everything is built. Insert an end-to-end **safety dry-run on a sacrificial app** —
> exercising webhook → fix → hold → approve → deploy → **rollback** — much earlier, as soon as
> fleet-maintenance + the rollback actuator exist.

## 9. Provenance

Generated by the `cto-system-design` workflow (script preserved in the session's workflow
scripts dir). Phases: Profile (10 parallel skill profilers) → Architect (3 lenses:
maintenance-first / greenfield-first / governance-first) → Synthesize (1 merge) → Critique
(1 adversarial completeness pass). Every load-bearing "verified" claim was checked against the
live repo. Headless-runner viability confirmed by a separate `claude -p` spike (§2).

## 10. Decisions locked (2026-06-22)

| # | Decision | Choice | Consequence for the build |
|---|---|---|---|
| D1 | **Loop mechanism** | Interactive Claude Code CLI — xhigh effort + ultracode + `/loop` (ScheduleWakeup). **Not** `claude -p`. | The `-p` spike stays a probe only. `orchestrated-delivery`'s human-only `/effort ultracode` entry gate is fine for human-kicked sessions but **must be self-assertable** for schedule/webhook-fired ones (D2). |
| D2 | **Trigger scope (v1)** | **Schedule + webhook** are the v1 target — *built for* from day one, but the webhook **surface is enabled last** (schedule first, webhook after the guards below are proven). "From day one" = design/build scope, not switch-on order. | Elevates the trigger-security layer to **co-P0**: webhook authenticity/signature verification, dedupe/coalesce-by-app, and a **per-app concurrency lease/lock** must exist *before the webhook surface is enabled*. Also pulls forward the **self-observability heartbeat** (are crons firing? is a session hung?) and a **hard cost circuit-breaker** (unattended webhooks = trigger-storm risk). Build for it early; **enable the surface only once these guards land.** |
| D3 | **Prod-deploy default** | **Per-app `fleet-registry` flag**, fail-closed (HOLD when unset). | `fleet-registry` (P0) carries `merge_deploys_to_prod` + the resolved posture per app; the HOLD precondition in `cto-governance-spine` reads it. |
| D4 | **Rollback requirement** | Required **only for prod-deploying apps** (apps whose merge deploys to prod). Dev/staging may proceed without. | The rollback/last-known-good actuator is gating for any app with `merge_deploys_to_prod = true`; `fleet-registry` stores a `last_known_good` ref + revert command for those apps. Not a universal blocker. |
| D5 | **MAINTAIN engine shape** | **Standalone `fleet-maintenance`** skill; reuses `orchestrated-delivery` only for the per-PR fix. | Resolves the §5 overlap: telemetry→triage + trigger plumbing live in `fleet-maintenance`; the per-PR fix substrate stays `orchestrated-delivery`. |

**Revised near-term critical path (reflecting D2):**
`workflow-runtime` (P0) → `fleet-registry` (P0; carries D3/D4 flags + the concurrency lease) →
`cto-governance-spine` (now co-P0; carries webhook-auth + dedupe + HOLD precondition + **hard cost
circuit-breaker** + **heartbeat**) → `fleet-maintenance` (P0) → graduation/provisioning (P1).
Webhooks are *coded for* throughout but *switched on last*, after the D2 guards are proven on one app.
