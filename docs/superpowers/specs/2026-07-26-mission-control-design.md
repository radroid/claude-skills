# mission-control — the CTO control-plane / operating repo

> **Status:** Design / spec, awaiting Raj's approval. Produced 2026-07-26 in a brainstorming
> session (grounded against the live repo, `docs/cto-system-design.md`, the `fleet-registry`
> skill, and a 5-agent analysis workflow + adversarial red-team).
>
> **This spec was completed autonomously while Raj slept** ("keep working through this"). Two
> decisions were answered live (tracer bullet = spawn-a-new-idea; scope = full control-plane
> repo); the rest were **defaulted to the recommended options and are flagged in §1** for
> morning review. Nothing has been built — no repo created, no code scaffolded. The terminal
> next step (writing-plans) is deliberately **not** taken yet: it waits on §1 confirmation.

---

## 1. Decisions defaulted while you slept — confirm or override

| # | Decision | Default chosen | Why / override cost |
|---|---|---|---|
| D-A | **Autonomy of the spawn path** | **Draft to the scope gate, then one human sign-off.** Orchestrator drafts to `idea-to-loop`'s **S0** (PRD + GOALS + runnable prototype) and stops the session; the human "go" (scope acceptance) IS idea-to-loop's S0 heavy gate; S1 auto / S2 keys / loop follow in a fresh session. | Your answer deflected. Middle option — max AFK, one real gate, matches L4 "human-on-the-rails". **Revised after multi-model review:** the original "draft PRD+stack+scaffold then one gate" invented a "non-interactive mode" idea-to-loop doesn't have ("never skip a stage"); the honest realization is that idea-to-loop's own S0 scope gate IS the one sign-off. Flipping to fully-interactive/unattended still changes gates materially. |
| D-B | **Skill consumption** | **Pinned / built, not a live symlink.** Orchestrator loads skills from a pinned `claude-skills` tag (extracted `dist/*.skill` or a detached checkout), bumped deliberately between runs — never mid-run. | Overrides the repo README's own symlink default. The red-team's highest-value fix: your overnight loops *execute* these skills, so an unpinned live symlink re-versions in-flight loops non-reproducibly. Reversible, but load-bearing for trust. |
| D-C | **In-flight build tracking** | **mission-control's own roster + ledger** (`fleet/apps.md` + `ledger.jsonl` `spawned` event), NOT a `fleet-registry` record. A registry record is created only at graduation. | Leanest correct choice: honors the current `fleet-registry` contract (registry = *graduated* apps only) and touches no skill. Adding a `building` status to the registry enum is deferred to a future improvement. |
| D-D | **Spawn logic form** | **A runbook in `mission-control/CLAUDE.md` first; extract to a `fleet-dispatch` skill once proven.** | Prove-then-extract (same pattern the design doc used for `workflow-runtime`). Avoids authoring a new distributable skill before the path works once. |
| D-E | **Control-plane repo** | Name `mission-control`, **private**; it is the orchestrator's launch root, with spawned apps nested under its gitignored `workspace/` (§4). E.g. `~/Documents/mission-control/`. | Bikeshed / easily changed. Private because it holds operational state (registry, ledger, cost caps) that must not be public under the library's CC-BY. |
| D-F | **Spawned app visibility** | **Public by default** (idea-to-loop + CodeRabbit assume it), with a per-brief `visibility: private` override for commercial ideas (Eddy-like). | Reversible per app. |

Everything below assumes these defaults. If you flip D-A or D-D, the implementation plan changes; the others are localized.

---

## 2. Goal

Create the **operating repo the fleet skills already assume but nobody ever made.** The
`fleet-registry` skill repeatedly references "the fleet's operating repo" (`fleet/apps/<id>/…`)
as an external home for per-app state — that home is this repo. On top of that home, add the
one thing no skill covers: **intake → spawn → register** orchestration.

**v1 done looks like:** drop an idea brief into `intake/inbox/` → launch the orchestrator in
`mission-control` → it creates a new public GitHub repo, drafts the PRD + stack + a runnable
scaffold, **pauses for one sign-off**, then on "go" starts the autonomous build loop in that new
repo — and the whole time the idea is tracked in `mission-control`'s roster + append-only ledger.
The "one agent with access to all the repos" is the orchestrator session launched at
`mission-control`, with every app cloned beneath its gitignored `workspace/` and GitHub ops via
`gh` (§4).

**Non-goals for v1** (deferred, YAGNI): live cron/webhook triggers, running `fleet-maintenance`
sweeps, the rollback actuator / heartbeat / cost circuit-breaker as *running* systems, a
`building` registry status, `marketplace.json`, and extracting the `fleet-dispatch` skill.

## 3. What already exists vs. what this adds

The idea→MVP capability is **already built as skills** and needs no new work for v1:
`grill-to-prd` / `to-prd` → `idea-to-loop` (S0–S2) → `auto-loop-bootstrap` (S2→S3 handoff) →
`autonomous-build-loop` (drains the backlog). The governance spine
(`workflow-runtime`, `fleet-registry`, `cto-governance-spine`, `fleet-maintenance`,
`graduation-gate`) also exists as source, merged ~2026-06-24.

**This repo adds only the missing seams the gap analysis found:** (1) a repo-creation actuator,
(2) an idea-intake queue + dispatcher, (3) a home for the fleet state, (4) the "one agent, all
repos" launch discipline. Everything intelligent stays in the skills; `mission-control` is
**state + a runbook**, not a re-implementation.

## 4. Access model — "one agent, all repos"

The load-bearing constraint: Claude Code's file tools are rooted at the **launch cwd** and
everything beneath it. A session launched in `mission-control/` cannot Read/Edit a *sibling*
`../<app>/`. So to give the orchestrator real access to every app, the apps must live **beneath**
its launch root — resolved with a gitignored nested workspace:

- `mission-control/` is **both the state repo and the orchestrator's launch root** (cwd =
  `mission-control/`).
- Each spawned app is cloned into **`mission-control/workspace/<app-id>/`** — its own independent
  git repo (own remote, history, CI, loop state), but physically nested in a **gitignored**
  `workspace/` dir. Because it's beneath the launch root, the orchestrator's file tools can
  Read/Edit it; because `workspace/` is gitignored, the app is never committed into
  `mission-control`. This is what actually delivers "one agent with access to all the repos" —
  without launching an unguarded session at a bare parent folder.
- `mission-control` ships a **committed** `.claude/settings.json` denylist (deny Read/Edit on
  `.env`/`*.pem`; deny Bash `rm -rf` / `git push --force` / `git reset --hard` / prod deploys), so
  the broad-scope orchestrator session is itself guarded — the highest-privilege session is not
  the one without guardrails.
- The orchestrator navigates by reading **`fleet/apps.md`**, never by walking `workspace/` — so
  context stays bounded as the fleet grows.
- GitHub ops (repo create, PRs, checks) go through **`gh`** (cwd-agnostic; the repo's mandated
  GitHub path).
- Each app's long-running **autonomous loop** runs as its **own dedicated session** (design doc
  D1: one loop per repo), rooted at its `workspace/<app-id>/` clone, with that app's own
  `auto-loop-bootstrap` denylist intact.

> Note: nesting independent git repos inside a gitignored `workspace/` is deliberate and safe —
> `git add` can't grab them (ignored), so there is no "stray `git init` swallows the children"
> hazard. `claude-skills` is consumed as a pinned install (D-B), not cloned into the workspace.

## 5. Repo layout (`mission-control`)

```
mission-control/                 # the state repo AND the orchestrator's launch root (cwd)
  README.md                    # what this is; how to launch the orchestrator
  CLAUDE.md                    # the orchestrator operating manual (the heart — §6)
  skills.lock                  # the pinned claude-skills tag/SHA the loops run against (D-B)
  .claude/
    settings.json              # COMMITTED orchestrator-session denylist (fail-closed, §4)
  fleet/
    apps.md                    # roster: app-id → repo URL → status → tier → last-touch (nav entrypoint)
    ledger.jsonl               # single append-only audit ledger (spawned / loop-started / graduated / …)
    apps/                      # per-app registry records — POPULATED ONLY AT GRADUATION (D-C)
      <app-id>/
        config.yaml            # from fleet-registry templates (PR-gated)
        state.json             # from fleet-registry templates (machine-mutable)
  intake/
    _TEMPLATE.md               # the idea-brief schema
    inbox/                     # one .md brief per new idea (the front door / queue)
    done/                      # briefs move here once spawned
  bin/
    spawn-app.md               # the spawn runbook the orchestrator follows (prose, not bespoke logic)
    graduate-app.md            # graduate runbook (graduation-gate + admission-validator) — stub for v1
  schedules/
    README.md                  # trigger definitions — DOCUMENTED but OFF in v1 (design doc: switch on last)
  workspace/                   # GITIGNORED — each spawned app cloned here as its own nested repo (§4)
    <app-id>/                  #   ↳ independent git repo; orchestrator can Read/Edit; never committed here
  .gitignore                   # ignores workspace/ (so nested app repos are never committed)
```

## 6. The spawn path (v1 tracer bullet)

Under D-A ("draft to the scope gate, then one sign-off"), driven by `CLAUDE.md` +
`bin/spawn-app.md`. **The one sign-off IS `idea-to-loop`'s S0 heavy human gate** ("scope accepted
before S1") — this respects idea-to-loop's contract ("never skip a stage") instead of inventing a
"non-interactive mode" it doesn't have. The orchestrator drafts to S0 and *stops the session*;
S1/S2/loop run only after a fresh human "go" (revised after multi-model review — see §10).

1. **Intake.** Human writes `intake/inbox/<slug>.md` from `_TEMPLATE.md`: problem, rough scope,
   `visibility: public|private`, stack hint, constraints, success signal.
2. **Kick.** Human launches the orchestrator in `mission-control` and says "process the inbox".
   Orchestrator runs `bin/verify-skills.md` first (v1 is human-kicked — no trigger fires it).
3. **Claim + validate.** Pick the brief with the lexicographically-smallest filename not already a
   roster row; validate `slug` (non-empty kebab-case) + `visibility`; fail-closed with a `blocked`
   ledger line otherwise. Confirm `workspace/<slug>/` does not already exist (filesystem check —
   `git status` is blind to the gitignored dir; a stale dir is moved aside, never `rm -rf`'d).
4. **Create the repo.** `git init` in `workspace/<slug>/` (gitignored, beneath the launch root);
   `gh repo create radroid/<slug> --<visibility> --source=. --remote=origin`; apply the
   `env_git_remotes` HTTPS fix.
5. **Draft to S0 (the AFK part).** Run `idea-to-loop` **S0 only** against `workspace/<slug>/` using
   the brief as the `grill-to-prd` input: `docs/PRD.md` (with a decisions-under-uncertainty
   appendix), `GOALS.md`, and a runnable prototype. `git commit && git push` so the summary links
   resolve. Do NOT advance to S1.
6. **Track it.** Append `spawned` then `ready-for-signoff` events to `fleet/ledger.jsonl`; add a
   `fleet/apps.md` row (status `drafted`). **No `fleet/apps/<id>/` record yet** (D-C).
7. **The one gate — then STOP.** Orchestrator posts a summary (repo URL, pushed PRD link, scope,
   prototype, uncertainties) and **ends the session.** The sign-off is a fresh, explicit human "go"
   in a new session — never inferred from the kick. The session boundary makes the gate unskippable.
8. **Go (new session).** Resume `idea-to-loop` from S1 (auto system-design + vetting) → S2 (scaffold;
   light gate = API keys) → S2 exit atomically invokes `auto-loop-bootstrap` (stamps the app's own
   denylist + loop machinery, flips to S3). Append `sign-off` + `loop-started`; move the brief to
   `intake/done/`; set `apps.md` status → `looping`.
9. **Drain.** Run `autonomous-build-loop` in a **dedicated per-app session** (cwd = `workspace/<slug>/`,
   design doc D1). The app now builds itself; the orchestrator returns to step 1 for the next brief.

Graduation (`graduation-gate` → `admission-validator` → first `fleet/apps/<id>/` record →
maintenance eligibility) is a later arc, stubbed in `bin/graduate-app.md`.

## 7. Governance & safety wiring

- **Ordering (design doc §8-step-6):** triggers stay **OFF** in v1. No mutating cross-repo
  automation runs until `cto-governance-spine` + a hard cost circuit-breaker + a heartbeat are
  actually *running*. v1's spawn is human-kicked, so this is satisfied by construction.
- **Denylists everywhere:** each spawned repo keeps its own `auto-loop-bootstrap` denylist; the
  orchestrator has its own. No session runs unguarded.
- **Audit:** `ledger.jsonl` is append-only; `git log fleet/` is the audit trail for free.
  Gated decisions defer to `cto-governance-spine`'s deterministic `governance.js` (fail-closed).
- **Reproducibility:** skills are pinned (D-B); `skills.lock` records the version each loop runs.
- **Merge discipline:** nothing lands on any `main` unattended — the existing loop/PR gates and
  your multi-model review gate apply per app.

## 8. Isolation / boundaries (why each unit is separable)

- `claude-skills` = **behavior**, distributable, pinned. Changes via branch→PR→retag; consumed,
  never vendored-and-forked.
- `mission-control` = **state + runbook**, private, instance-specific. Holds the fleet, the
  intake queue, the ledger, the operating manual. Depends on a pinned `claude-skills` and on
  `gh`.
- each `<app>` repo = an **independent product**, own remote/history/CI/secrets, cloned under
  `mission-control/workspace/<app-id>/`. The orchestrator scaffolds it (draft phase); its
  long-running autonomous loop runs as a separate dedicated session (design doc D1).

You can understand, test, and change any one without reading the internals of the others.

## 9. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Orchestrator blast radius (can touch many repos) | cwd = `mission-control`, not workspace root; own denylist; mutation only in per-app scoped sessions; defer gated actions to the spine. |
| Unpinned skills mutate in-flight loops | D-B: pinned/built consumption, bumped between runs; `skills.lock`. |
| Nested app repos accidentally committed into `mission-control` | `workspace/` is gitignored, so `git add` can't grab the nested repos; the launch root is a real repo, not a fragile plain-dir + floating settings file. |
| Premature machinery (schedules/, graduate) sits unused | Both are documented stubs, explicitly OFF/deferred — no dead automation running. |
| In-flight builds invisible to the fleet | Tracked in `apps.md` + ledger for v1 (D-C); `building` registry status is a noted future improvement. |

## 10. Open questions for morning review

1. Confirm/override the six defaults in §1 (especially **D-A autonomy** and **D-D runbook-vs-skill**).
   Note D-A was refined post-build (the sign-off = idea-to-loop's S0 scope gate) — confirm that
   reading matches your intent, or say if you wanted the gate after the full scaffold instead.
2. Is the very first brief a throwaway sacrificial idea (safest way to prove the path), or a real
   one you want to keep?
3. Repo/workspace naming (D-E) — keep `mission-control` (launch root, apps nested under
   `workspace/`) or rename?
4. **Skills install prerequisite (from review):** the pinned skill set must be installed into
   `~/.claude/skills` at the `skills.lock` ref before the first spawn. The four spawn-path skills
   are present, but the governance/graduation skills (`cto-governance-spine`, `fleet-registry`,
   `graduation-gate`, `fleet-maintenance`) are **not currently installed** — `bin/verify-skills.md`
   checks this and ESCALATEs. Do you want me to install the pinned set, or will you?

## 11. Build + review record (2026-07-26)

Built and pushed to `radroid/mission-control` (private). Independent multi-model review ran
(Opus/Sonnet/Haiku, distinct lenses): **mechanical APPROVE (0 findings)**, **fidelity APPROVE**,
**operational REVISE** → worst-wins REVISE. All confirmed findings were fixed in the runbook/docs
(none touched the scaffold structure, which all three passed):
- Sign-off gate hardened from prose to a **session boundary** (draft session STOPS; loop-start is a
  separate act after a fresh "go") — the highest-severity finding.
- `idea-to-loop` gate reconciliation (the "non-interactive mode" fiction) → sign-off = S0 gate.
- Stale-`workspace/<slug>` precondition now a filesystem check + move-aside (no `rm -rf`, which the
  denylist blocks by design).
- Draft is committed + pushed before the gate so the summary's repo/PRD links resolve.
- Brief claim/validation: "oldest" defined; `slug`/`visibility` validated, fail-closed on blanks.
- Added `bin/verify-skills.md` preflight; CLAUDE.md now hard-stops gated actions if the spine isn't
  installed. Dropped `to-prd` (lives outside the pinned repo). Dropped `graduated` from the roster
  status enum (it's a ledger event; matches fleet-registry).

Two items remain for Raj before the **first live product spawn** (both already human-gated, not repo
defects): the skills-install prerequisite (§10 Q4) and confirming the D-A gate-location reading (§10 Q1).
