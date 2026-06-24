# Instrumentation — the fat gate

graduation-gate is a **validate + instrument** gate (the build-time decision), not a
paper check. The difference: the admission-validator reads the `smoke_oracle.asserts`
and judges whether they *claim* enough; graduation-gate verifies the app is *actually
instrumented* — that those claims can be RUN and that the maintenance sweep will get
real signal. An app that looks fine on paper but has no running oracle and no
telemetry is **invisible to MAINTAIN** the moment it's enrolled — the exact §7.9
failure the whole oracle discipline exists to prevent.

## The four requirements (`INSTRUMENTATION_REQUIREMENTS`)

Each is a hard, separately-verifiable gate. The instrument agent confirms each
against reality; `instrumentationRollup` enforces the floor (fail-closed — anything
not exactly `true` is missing).

| Requirement | What the agent verifies | Why it's a hard gate |
|---|---|---|
| `oracle_runs_green` | The `smoke_oracle.command` actually RUNS and passes — not merely that it exists in config | A declared-but-broken oracle gives a red signal every sweep (or, worse, is never run); the sweep's strongest signal (§7.9) must be real |
| `health_endpoint` | A `/health` (or the app's declared health) endpoint responds | `healthAssess` reads availability/health from it; no endpoint = no availability signal |
| `telemetry_connected` | Error-tracking + metrics are wired (the sources for `error_rate`, `p95`, availability) | Without them `healthAssess` returns `unverified` forever — a permanently degraded-on-paper app |
| `slo_declared` | `config.slo` declares the baselines `healthAssess` scores against | No baseline = nothing to compare measurements to = every sweep is `unverified` |

## Fail-closed: unverifiable is NOT ready

The instrument agent is told: if you cannot verify a check (the repo isn't
reachable, the command needs a human step, the endpoint can't be hit), return it
**FALSE**. You do not get to graduate by withholding evidence. This is why a smoke
run against a non-existent example app correctly reports instrumentation NOT ready —
that is the gate working, not a bug.

## Operational-readiness adversarial-verify (`READINESS_LENSES`)

Beyond the four checks, a hostile panel tries to REFUTE "this app is ready for
unattended maintenance" — distinct from the admission-validator's oracle-*adequacy*
lenses; these are about operational reality:

- **oracle-actually-runs** — can the oracle run UNATTENDED? (`runnable_unattended`
  false / needs a human step → refute; such an oracle is a human-queue item, not an
  autonomous gate — the 0-known-not-0-real trap).
- **rollback-for-prod** — a SHIP app with no `revert_command` + `last_known_good`
  has no un-ship path → refute.
- **telemetry-sources** — do the error/latency/availability sources actually exist,
  or would the sweep get nothing?
- **baseline-sanity** — are the SLOs real, or placeholder `0`/`100`/copy-paste?
- **tier-proportionate** — is the whole package proportionate to the declared
  `governance_tier` (a `critical` app needs deeper instrumentation than
  `experimental`)?

Refute-by-majority; a dead/missing refuter counts as a refute; a tie kills. Same
anti-bias engine as the admission-validator and orchestrated-delivery's review.

## Why "instrument" lives here and not in app-provisioning

The planned `app-provisioning-and-instrumentation` skill WIRES instrumentation up at
build time. graduation-gate VERIFIES it at the maintenance boundary. They are
complementary: provisioning builds it; the gate refuses to enroll if it isn't there
or doesn't work. The gate does not itself author telemetry wiring — it runs the
checks and, on a miss, returns `hold` / REVISE with the specific gaps so they get
fixed (by provisioning, or by hand) before re-running. A future merge could let the
gate trigger provisioning on a miss; v1 keeps them separate and lets the gate report
the gap.
