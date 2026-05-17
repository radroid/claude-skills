# PRD — {{PROJECT_NAME}}

> **Lane:** Technical &nbsp;·&nbsp; **Last updated:** {{DATE}} &nbsp;·&nbsp; **Status:** Draft

## 1. Problem & user

**One-line:** {{ONE_LINE_PROBLEM}}

**Primary user:** {{PRIMARY_USER}}

**Today's workaround:** {{CURRENT_WORKAROUND}}

**Why now:** {{WHY_NOW}}

## 2. v1 scope

### In scope

| # | Capability | Why critical |
|---|---|---|
| 1 | {{CAP_1}} | {{REASON_1}} |
| 2 | {{CAP_2}} | {{REASON_2}} |
| 3 | {{CAP_3}} | {{REASON_3}} |

### Out of scope (deferred)

| # | Capability | Why deferred |
|---|---|---|
| 1 | {{OUT_1}} | {{OUT_REASON_1}} |
| 2 | {{OUT_2}} | {{OUT_REASON_2}} |

### Success metric

{{SUCCESS_METRIC}}

### Kill criterion

{{KILL_CRITERION}}

## 3. Inputs & outputs

**Inputs:** {{INPUTS_SUMMARY}}

**Outputs:** {{OUTPUTS_SUMMARY}}

**Side effects:** {{SIDE_EFFECTS}}

**Async/long-running operations:** {{ASYNC_NOTES}}

## 4. Data model

| Entity | Fields (key only) | Cardinality | Source of truth | Notes |
|---|---|---|---|---|
| {{ENTITY_1}} | {{FIELDS_1}} | {{CARD_1}} | {{SOURCE_1}} | {{NOTES_1}} |
| {{ENTITY_2}} | {{FIELDS_2}} | {{CARD_2}} | {{SOURCE_2}} | {{NOTES_2}} |

### State transitions

| Entity | State | Trigger | Next state |
|---|---|---|---|
| {{ENTITY}} | {{STATE_A}} | {{TRIGGER}} | {{STATE_B}} |

**Privacy / regulated data:** {{PRIVACY_NOTES}}

## 5. API surface

| Verb | Resource | Input | Output | Auth |
|---|---|---|---|---|
| {{VERB_1}} | {{RESOURCE_1}} | {{IN_1}} | {{OUT_1}} | {{AUTH_1}} |
| {{VERB_2}} | {{RESOURCE_2}} | {{IN_2}} | {{OUT_2}} | {{AUTH_2}} |
| {{VERB_3}} | {{RESOURCE_3}} | {{IN_3}} | {{OUT_3}} | {{AUTH_3}} |

**Auth model:** {{AUTH_MODEL}}

**Rate limits / quotas:** {{RATE_LIMITS}}

**Versioning policy:** {{VERSIONING}}

## 6. Performance & scale

| Dimension | Target |
|---|---|
| Primary-operation latency (p50/p95) | {{LATENCY_TARGET}} |
| Concurrent users (launch / 6mo) | {{CONCURRENCY_TARGET}} |
| Throughput (peak) | {{THROUGHPUT_TARGET}} |
| Cost ceiling | {{COST_TARGET}} |

**Hard SLOs (business-required):** {{HARD_SLOS}}

## 7. Edge cases & failure modes

| Scenario | Detection | Recovery |
|---|---|---|
| {{EDGE_1}} | {{DETECT_1}} | {{RECOVER_1}} |
| {{EDGE_2}} | {{DETECT_2}} | {{RECOVER_2}} |

**Worst plausible bug:** {{WORST_BUG}} &nbsp;—&nbsp; **Mitigation:** {{WORST_MITIGATION}}

## 8. Tech stack & dependencies

**Stack:** {{STACK}} (existing / proposed)

**Hard requirements:** {{LOCKED_DEPS}}

**Off the table:** {{EXCLUDED_DEPS}}

**Deployment target:** {{DEPLOY_TARGET}}

## 9. Verification & test plan

**How we'll know v1 works:** {{VERIFICATION_APPROACH}}

**Test coverage targets:** {{COVERAGE_TARGETS}}

**Features that can't be auto-tested:** {{UNTESTABLE_FEATURES}}

**Baseline for comparison:** {{BASELINE}}

## 10. External blockers

- {{BLOCKER_1}}
- {{BLOCKER_2}}

## 11. Open questions

> Listed here for resolution before build. Remove as each is answered.

- {{OPEN_Q_1}}
- {{OPEN_Q_2}}

---

## Appendix A — Decisions made under uncertainty

> Every default the synthesizer chose without explicit user direction. Verify before build.

- **{{DECISION_1}}** — Rationale: {{RATIONALE_1}}. To confirm: {{CONFIRM_1}}.
- **{{DECISION_2}}** — Rationale: {{RATIONALE_2}}. To confirm: {{CONFIRM_2}}.

## Appendix B — Source material

- Phase 1 context summary: {{CONTEXT_SUMMARY}}
- Persona: Technical (secondary: {{SECONDARY_LANE}})
