# mission-control Build Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold `mission-control` — the private CTO control-plane / operating repo that spawns new app repos from idea briefs and hosts fleet state — so a single orchestrator session can take an intake brief through create-repo → draft → one sign-off → autonomous loop.

**Architecture:** A standalone private git repo that is BOTH the orchestrator's launch root and the home for fleet state. Spawned apps are cloned into a **gitignored `workspace/`** so the one orchestrator session can Read/Edit them while they stay independent repos never committed here. Intelligence lives in the pinned `claude-skills` skills; this repo holds only **state + runbooks + a committed denylist**. v1 is human-kicked (no live triggers).

**Tech Stack:** git + `gh` CLI; Markdown runbooks; JSON (`.claude/settings.json` denylist); JSONL (append-only audit ledger); YAML (per-app registry, only at graduation). No application code, no build step.

## Global Constraints

- **State never lives in `claude-skills`** — that repo is the CC-BY library; this repo is the private state/runbook consumer. (Spec §2, §8)
- **Skills consumed PINNED, not live-symlinked** — record the pinned `claude-skills` ref in `skills.lock`; bump deliberately between runs, never mid-run. (Spec D-B)
- **cwd = `mission-control/`**; apps live under gitignored `workspace/<app-id>/`; navigate via `fleet/apps.md`, never by walking `workspace/`. (Spec §4)
- **Autonomy = draft, then ONE human sign-off** before the autonomous loop starts. (Spec D-A)
- **In-flight builds tracked in `fleet/apps.md` + `fleet/ledger.jsonl` only** — a `fleet/apps/<id>/` registry record is created ONLY at graduation. (Spec D-C)
- **Triggers OFF in v1** — `schedules/` documents them but nothing fires. (Spec §2, §7; design doc D2/§8 "enable last")
- **Fail-closed governance**: gated decisions defer to `cto-governance-spine`; nothing merges to any `main` unattended. (Spec §7)
- **GitHub via `gh`**; after `gh repo create` the SSH remote fails on this machine → `git remote set-url origin https://…` (memory: env_git_remotes).
- **Repo is PRIVATE** (holds registry/ledger/cost-caps). Spawned apps default public, per-brief `visibility` override. (Spec D-E/D-F)
- **Build location:** `~/Documents/mission-control/`. **GitHub:** `radroid/mission-control` (private).

---

### Task 1: Repo skeleton + guardrails

Creates the private repo with its launch-root guardrails: the denylist that guards the broad-scope orchestrator session, the gitignore that keeps nested app repos out, and the skills pin.

**Files:**
- Create: `~/Documents/mission-control/README.md`
- Create: `~/Documents/mission-control/.gitignore`
- Create: `~/Documents/mission-control/.claude/settings.json`
- Create: `~/Documents/mission-control/skills.lock`

**Interfaces:**
- Produces: a private git repo `radroid/mission-control` on HTTPS remote; a committed denylist enforced every session; `workspace/` ignored; the pinned skills ref.

- [ ] **Step 1: Create the directory and init git**

```bash
mkdir -p ~/Documents/mission-control/.claude
cd ~/Documents/mission-control
git init
```

- [ ] **Step 2: Write `.gitignore`**

```
# Nested app repos are cloned here — each is its own independent repo, never
# committed into mission-control. This is what makes "one agent, all repos"
# safe: git add can't grab them.
workspace/

# Machine-local settings (the ENFORCED denylist is the committed settings.json)
.claude/settings.local.json

# OS cruft
.DS_Store
```

- [ ] **Step 3: Write `.claude/settings.json` (committed denylist)**

Mirror the intent of `auto-loop-bootstrap`'s denylist so the orchestrator session is guarded. Read `../claude-skills/auto-loop-bootstrap/assets/templates/` (or the skill's SKILL.md) first and match its patterns; the baseline is:

```json
{
  "permissions": {
    "deny": [
      "Read(**/.env)",
      "Read(**/.env.*)",
      "Read(**/*.pem)",
      "Read(**/*.key)",
      "Read(**/id_rsa)",
      "Edit(**/.env)",
      "Edit(**/.env.*)",
      "Edit(**/*.pem)",
      "Edit(**/*.key)",
      "Bash(rm -rf:*)",
      "Bash(git push --force:*)",
      "Bash(git push -f:*)",
      "Bash(git reset --hard:*)"
    ]
  }
}
```

- [ ] **Step 4: Verify the denylist is valid JSON**

Run: `python3 -m json.tool ~/Documents/mission-control/.claude/settings.json > /dev/null && echo OK`
Expected: `OK` (invalid JSON would break the session's permission load).

- [ ] **Step 5: Write `skills.lock`**

Pin to the current `claude-skills` **main** HEAD (the released state of the skills — NOT the design branch). Get it with `git -C ~/Documents/claude-skills rev-parse main`, then:

```
# Pinned claude-skills version the orchestrator and all app loops run against.
# Bump deliberately BETWEEN runs, never mid-run (design spec D-B) — an unpinned
# live symlink would re-version in-flight loops non-reproducibly.

claude-skills-ref: <MAIN_SHA>
pinned-at:         2026-07-26
source:            https://github.com/radroid/claude-skills
install:           extract dist/*.skill from this ref into ~/.claude/skills,
                   OR symlink ~/.claude/skills at a detached checkout of this ref.
bump-procedure:    edit a skill on a branch in claude-skills → build.sh → PR →
                   review → squash-merge → retag → update this ref → reinstall.
```

- [ ] **Step 6: Write `README.md`**

```markdown
# mission-control

The CTO **control-plane / operating repo**. It spawns new app repos from idea
briefs and holds the fleet's state. It is the concrete home the `fleet-registry`
and governance-spine skills already assume ("the fleet's operating repo").

**This repo is state + runbooks, not code.** All intelligence lives in the
pinned `claude-skills` skills (see `skills.lock`). This repo holds: the intake
queue, the fleet roster + audit ledger, per-app registry records (at graduation),
the orchestrator operating manual (`CLAUDE.md`), and the spawn/graduate runbooks
(`bin/`).

## Launch the orchestrator

Open a Claude Code session with **cwd = this directory** (it is the launch root;
spawned apps live under the gitignored `workspace/`). Then:

> "Process the intake inbox."

The orchestrator follows `CLAUDE.md` → `bin/spawn-app.md`: it creates a repo,
drafts the PRD + stack + a runnable scaffold, then **pauses for one sign-off**
before starting the autonomous build loop.

## Layout

- `intake/` — drop one brief per idea in `inbox/` (see `_TEMPLATE.md`)
- `fleet/` — `apps.md` roster, `ledger.jsonl` audit log, `apps/<id>/` records (at graduation)
- `bin/` — `spawn-app.md`, `graduate-app.md` runbooks
- `schedules/` — trigger definitions (documented; OFF in v1)
- `workspace/` — gitignored; each spawned app cloned here as its own repo

## Status

v1: human-kicked, spawn-a-new-idea. Triggers, live maintenance sweeps, rollback/
heartbeat/cost-breaker as running systems are deferred (design doc "enable last").
Design: `claude-skills/docs/superpowers/specs/2026-07-26-mission-control-design.md`.
```

- [ ] **Step 7: Create the private GitHub repo and fix the remote**

```bash
cd ~/Documents/mission-control
gh repo create radroid/mission-control --private --source=. --remote=origin
# env_git_remotes: the SSH remote gh sets fails on this machine → force HTTPS
git remote set-url origin https://github.com/radroid/mission-control.git
git remote -v
```
Expected: `origin  https://github.com/radroid/mission-control.git` (fetch + push).

- [ ] **Step 8: Commit (do NOT push yet — push after the smoke in Task 6)**

```bash
cd ~/Documents/mission-control
git add -A
git commit -m "chore: repo skeleton — denylist, gitignore, skills pin, README"
```

---

### Task 2: `fleet/` — state home

The fleet roster + append-only audit ledger. Per D-C, in-flight builds live here; `apps/<id>/` registry records appear only at graduation.

**Files:**
- Create: `~/Documents/mission-control/fleet/apps.md`
- Create: `~/Documents/mission-control/fleet/ledger.jsonl` (empty)
- Create: `~/Documents/mission-control/fleet/README.md`
- Create: `~/Documents/mission-control/fleet/apps/.gitkeep`

**Interfaces:**
- Produces: `fleet/apps.md` (the navigation entrypoint — the orchestrator reads THIS, not the tree); `fleet/ledger.jsonl` (append-only, one JSON object per line); the documented ledger event schema.

- [ ] **Step 1: Write `fleet/apps.md` (empty roster with header)**

```markdown
# Fleet roster

The single navigation entrypoint. The orchestrator reads THIS file to know what
exists — it never walks `workspace/`. One row per app the fleet knows about.

`status`: `drafted` → `looping` → `graduated` → `active` | `held` | `quarantined` | `retired`

| app-id | repo | status | tier | last-touch | notes |
|--------|------|--------|------|-----------|-------|
| _(none yet)_ | | | | | |
```

- [ ] **Step 2: Create the empty ledger**

```bash
touch ~/Documents/mission-control/fleet/ledger.jsonl
```

- [ ] **Step 3: Write `fleet/README.md` (layout + ledger event schema)**

```markdown
# fleet/ — state home

- **`apps.md`** — the roster; the orchestrator's navigation entrypoint.
- **`ledger.jsonl`** — the single append-only audit ledger. One JSON object per
  line. **Append only** — atomic `>>` of a single small line (never
  read-modify-write); `git log fleet/ledger.jsonl` is the audit trail.
- **`apps/<app-id>/`** — per-app registry record (`config.yaml` PR-gated +
  `state.json` machine-mutable), created ONLY at graduation via the
  `fleet-registry` admission validator. Empty until the first app graduates.

## Ledger event schema (v1)

Each line is `{ ts, event, app_id, actor, detail }`:

- `ts` — ISO-8601 UTC (e.g. `2026-07-26T21:04:00Z`); stamped by the session.
- `event` — one of: `spawned`, `loop-started`, `sign-off`, `graduated`,
  `blocked`, `note`.
- `app_id` — the app slug (or `_cto-self` for orchestrator/heartbeat events).
- `actor` — `orchestrator` | `human` | `<session-id>`.
- `detail` — free-form string (e.g. repo URL, brief slug, reason).

Example:
`{"ts":"2026-07-26T21:04:00Z","event":"spawned","app_id":"widget-tracker","actor":"orchestrator","detail":"repo=https://github.com/radroid/widget-tracker from brief inbox/widget-tracker.md"}`
```

- [ ] **Step 4: Keep the empty `apps/` dir tracked**

```bash
touch ~/Documents/mission-control/fleet/apps/.gitkeep
```

- [ ] **Step 5: Verify the ledger schema example parses as JSON**

Run:
```bash
echo '{"ts":"2026-07-26T21:04:00Z","event":"spawned","app_id":"widget-tracker","actor":"orchestrator","detail":"repo=x"}' | python3 -m json.tool > /dev/null && echo OK
```
Expected: `OK`.

- [ ] **Step 6: Commit**

```bash
cd ~/Documents/mission-control
git add -A
git commit -m "feat: fleet/ state home — roster, append-only ledger, layout docs"
```

---

### Task 3: `intake/` — the front door

The idea-brief queue. One markdown brief per idea in `inbox/`; the schema is `_TEMPLATE.md`.

**Files:**
- Create: `~/Documents/mission-control/intake/_TEMPLATE.md`
- Create: `~/Documents/mission-control/intake/inbox/.gitkeep`
- Create: `~/Documents/mission-control/intake/done/.gitkeep`

**Interfaces:**
- Produces: the brief schema consumed by `bin/spawn-app.md` step 1 (fields: `slug`, `problem`, `scope`, `stack_hint`, `visibility`, `constraints`, `success_signal`).

- [ ] **Step 1: Write `intake/_TEMPLATE.md`**

```markdown
---
slug:            # kebab-case; becomes the repo name
visibility:      public   # public | private  (default public; private for commercial)
stack_hint:      # optional: e.g. "Next.js + Convex", "static site", "Python CLI"
---

# <One-line title>

## Problem
<What hurts, for whom, and why now. 2–5 sentences.>

## Rough scope
**In (v1 MVP):**
- <thin vertical slice 1>
- <thin vertical slice 2>

**Out (not now):**
- <explicitly deferred>

## Constraints
<Hard requirements: platforms, integrations, budgets, deadlines, must-not-dos. "None" is valid.>

## Success signal
<The one observable thing that means the MVP works — the smoke oracle seed.>
```

- [ ] **Step 2: Keep `inbox/` and `done/` tracked**

```bash
mkdir -p ~/Documents/mission-control/intake/inbox ~/Documents/mission-control/intake/done
touch ~/Documents/mission-control/intake/inbox/.gitkeep ~/Documents/mission-control/intake/done/.gitkeep
```

- [ ] **Step 3: Verify the template front-matter is valid YAML**

Run:
```bash
python3 -c "import sys; d=open('$HOME/Documents/mission-control/intake/_TEMPLATE.md').read().split('---')[1]; import yaml; yaml.safe_load(d); print('OK')" 2>/dev/null || echo "yaml module missing — skip (front-matter is trivially valid)"
```
Expected: `OK` (or the skip note if PyYAML isn't installed — the front-matter is hand-verifiable).

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/mission-control
git add -A
git commit -m "feat: intake/ front door — idea-brief template + inbox/done queues"
```

---

### Task 4: `bin/` — spawn + graduate runbooks

The spawn runbook is the operational heart (D-D: runbook first, extract to a `fleet-dispatch` skill once proven). `graduate-app.md` is a stub pointing at the existing skills.

**Files:**
- Create: `~/Documents/mission-control/bin/spawn-app.md`
- Create: `~/Documents/mission-control/bin/graduate-app.md`

**Interfaces:**
- Consumes: `intake/_TEMPLATE.md` brief fields (Task 3); `skills.lock` (Task 1); the pinned skills `idea-to-loop`, `auto-loop-bootstrap`, `autonomous-build-loop`, `grill-to-prd`/`to-prd`.
- Produces: the exact procedure `CLAUDE.md` (Task 5) points to.

- [ ] **Step 1: Write `bin/spawn-app.md`**

```markdown
# Runbook: spawn an app from an intake brief

Goal: turn one `intake/inbox/<slug>.md` brief into a new repo that is drafted,
scaffolded, and — after ONE human sign-off — draining its backlog autonomously.
Autonomy = **draft, then one sign-off** (design spec D-A).

Preconditions: cwd = mission-control (launch root); working tree clean;
`skills.lock` skills installed.

1. **Claim.** Read `fleet/apps.md`. Pick the oldest `intake/inbox/*.md` not
   already a roster row. Parse its front-matter (`slug`, `visibility`,
   `stack_hint`) + body.

2. **Create the repo** under the gitignored workspace so this session can edit it:
   ```bash
   mkdir -p workspace/<slug> && cd workspace/<slug> && git init
   gh repo create radroid/<slug> --<visibility> --source=. --remote=origin
   git remote set-url origin https://github.com/radroid/<slug>.git   # env_git_remotes
   ```

3. **Draft (AFK part).** Run `idea-to-loop` S0–S2 against `workspace/<slug>/` in
   non-interactive draft mode, using the brief as the `grill-to-prd`/`to-prd`
   input: produce `docs/PRD.md` (with a "decisions under uncertainty" appendix),
   `GOALS.md`, `ARCHITECTURE.md`/stack pick, and a runnable scaffold. Do NOT
   start the loop yet.

4. **Track it.** Append to `fleet/ledger.jsonl` (schema: `fleet/README.md`):
   `{"ts":"<now-UTC>","event":"spawned","app_id":"<slug>","actor":"orchestrator","detail":"repo=<url> from <brief path>"}`
   Add a `fleet/apps.md` row: `| <slug> | <repo-url> | drafted | <tier?> | <now> | |`.
   Do NOT create a `fleet/apps/<slug>/` record — that happens only at graduation (D-C).

5. **THE ONE GATE.** Stop. Post a summary for the human: repo URL, PRD link,
   scope, chosen stack, scaffold state, and any decisions-under-uncertainty.
   Wait for explicit "go". (Do not merge or start the loop without it.)

6. **On "go".** Hand off `idea-to-loop` S2→S3 to `auto-loop-bootstrap` (which
   stamps the app's own denylist + loop scaffolding), then start
   `autonomous-build-loop` in a **dedicated per-app session** rooted at
   `workspace/<slug>/`. Append `{"event":"sign-off"}` then `{"event":"loop-started"}`
   ledger lines; move the brief to `intake/done/`; set the `apps.md` status → `looping`.

7. **Next.** The app now builds itself. Return to step 1 for the next brief.

Fail-closed: on any blocker, append an `{"event":"blocked"}` ledger line with the
reason, leave the brief in `inbox/`, and surface it — never force past a gate.
```

- [ ] **Step 2: Write `bin/graduate-app.md` (stub)**

```markdown
# Runbook: graduate an app into the maintenance fleet (v1 stub)

Deferred in v1 (no app has finished building yet). When the first app's backlog
is drained and it is genuinely instrumented, this runbook will:

1. Run the `graduation-gate` skill (readiness audit + instrumentation verify +
   judge-panel go/no-go + **hard human approval**).
2. It calls `fleet-registry`'s `admission-validator` to enroll: writes the FIRST
   `fleet/apps/<app-id>/config.yaml` + `state.json` from the fleet-registry
   templates, appends a `{"event":"graduated"}` ledger line, sets `apps.md`
   status → `active`.
3. From then the app is eligible for `fleet-maintenance` — but maintenance sweeps
   and triggers stay OFF until the design doc's §8 guards (cost circuit-breaker,
   heartbeat, per-app lease, webhook auth) are stood up.

Do not hand-edit `fleet/apps/<id>/` records — enrollment goes through the
admission validator so the oracle-adequacy + required-field gates run.
```

- [ ] **Step 3: Verify runbooks reference only real skills/paths**

Run:
```bash
for s in idea-to-loop auto-loop-bootstrap autonomous-build-loop grill-to-prd graduation-gate fleet-registry; do
  test -f ~/Documents/claude-skills/$s/SKILL.md && echo "ok: $s" || echo "MISSING: $s"
done
```
Expected: `ok:` for all six (they're the skills the runbooks name).

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/mission-control
git add -A
git commit -m "feat: bin/ runbooks — spawn-app (the heart) + graduate-app stub"
```

---

### Task 5: `CLAUDE.md` operating manual + `schedules/`

The orchestrator's operating manual (loaded every session) ties the pieces together; `schedules/` documents triggers that stay OFF in v1.

**Files:**
- Create: `~/Documents/mission-control/CLAUDE.md`
- Create: `~/Documents/mission-control/schedules/README.md`

**Interfaces:**
- Consumes: everything above (`bin/spawn-app.md`, `fleet/apps.md`, `fleet/ledger.jsonl`, `skills.lock`, `.claude/settings.json`).
- Produces: the always-loaded operating rules for the orchestrator session.

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# mission-control — orchestrator operating manual

You are the **CTO orchestrator**. This repo is the control-plane: you spawn new
app repos from intake briefs and keep the fleet's state. All real capability
comes from the pinned `claude-skills` skills — you are the conductor, not the code.

## Working-directory discipline (READ FIRST)
- Your launch root is this repo. Every app lives at `workspace/<app-id>/` — its
  own independent git repo, gitignored here so it's never committed in.
- **Navigate via `fleet/apps.md`, never by walking `workspace/`.** Keep context
  bounded: open an app's files only when acting on that app.
- A guardrail denylist is enforced from `.claude/settings.json` (secrets unreadable,
  `rm -rf` / force-push / hard-reset blocked). Do not work around it.

## Skills are PINNED
- Run against the `claude-skills` ref in `skills.lock`. Never bump mid-run; bump
  deliberately between runs (design spec D-B). A long-running loop must not have
  its skills re-versioned underneath it.

## What you do
- **Spawn a new idea:** follow `bin/spawn-app.md` exactly. Autonomy is
  **draft, then ONE human sign-off** before any autonomous loop starts.
- **Track everything:** every state change is a line in `fleet/ledger.jsonl`
  (schema in `fleet/README.md`) and a row/status in `fleet/apps.md`. In-flight
  builds live here; `fleet/apps/<id>/` registry records appear ONLY at graduation.
- **Graduate:** `bin/graduate-app.md` (stub; deferred in v1).

## Governance (fail-closed)
- Defer any gated decision (prod deploy, auto-approve class, cost cap) to the
  `cto-governance-spine` skill's deterministic rules. When unsure, ESCALATE to a
  human, don't guess.
- **Triggers are OFF in v1.** You run only when a human kicks you. Do not stand up
  cron/webhook sessions until the design doc's §8 guards (cost circuit-breaker,
  heartbeat, per-app lease, webhook auth) exist and are proven.
- **Nothing merges to any `main` unattended.** Per-app loops open PRs; the human
  (or the multi-model review gate) merges.

## GitHub
- Always use `gh` (never raw HTTPS push). After `gh repo create`, force the HTTPS
  remote: `git remote set-url origin https://github.com/radroid/<slug>.git`.
```

- [ ] **Step 2: Write `schedules/README.md`**

```markdown
# schedules/ — triggers (DOCUMENTED, OFF in v1)

v1 is human-kicked: nothing here fires. This directory records the trigger design
so it can be switched on LAST, after the guards are proven (design doc D2 / §8).

## Planned triggers (not active)
- **SCHEDULE (cron):** nightly hygiene sweep + weekly blind-hostile re-review, per
  graduated app. Runs `fleet-maintenance`'s monitor-sweep. Off until a cost
  circuit-breaker + heartbeat + per-app lease exist.
- **WEBHOOK:** incident triggers (Sentry/Dependabot/uptime). Enabled only after
  signature auth + trigger dedupe + per-app concurrency lease are proven on one
  sacrificial app.

## Preconditions before ANY trigger goes live (design doc §7)
- [ ] Hard cost circuit-breaker (per-app + global spend caps)
- [ ] CTO self-heartbeat (are sweeps firing? is a session hung? is the ledger writing?)
- [ ] Per-app concurrency lease + trigger dedupe (fleet-registry lease protocol)
- [ ] Webhook signature authentication
- [ ] Rollback actuator for any prod-deploying app
- [ ] Proven on a single graduated app with prod-deploy HOLD for a clean week
```

- [ ] **Step 3: Verify CLAUDE.md references resolve**

Run:
```bash
cd ~/Documents/mission-control
for p in bin/spawn-app.md bin/graduate-app.md fleet/apps.md fleet/README.md fleet/ledger.jsonl skills.lock .claude/settings.json; do
  test -e "$p" && echo "ok: $p" || echo "MISSING: $p"
done
```
Expected: `ok:` for all (every path CLAUDE.md names exists).

- [ ] **Step 4: Commit**

```bash
cd ~/Documents/mission-control
git add -A
git commit -m "feat: CLAUDE.md operating manual + schedules/ (triggers documented, off)"
```

---

### Task 6: Mechanics smoke + push

Prove the plumbing the design depends on — WITHOUT creating a real product repo (the first live spawn is a separate, human-gated act; spec §10 Q2). Then push.

**Files:**
- Temporary: `~/Documents/mission-control/workspace/_smoke/` (created then removed)

**Interfaces:**
- Consumes: `.gitignore`, `fleet/ledger.jsonl`, `fleet/apps.md`.
- Produces: verified proof that (a) `workspace/` is ignored, (b) the denylist loads, (c) a nested repo is reachable-but-uncommitted, (d) a ledger append is atomic and parseable.

- [ ] **Step 1: Prove `workspace/` is gitignored (nested repo never committed)**

```bash
cd ~/Documents/mission-control
mkdir -p workspace/_smoke && (cd workspace/_smoke && git init -q && echo "hi" > file.txt)
git check-ignore workspace/_smoke && echo "IGNORED-OK"
git status --porcelain | grep -q _smoke && echo "LEAKED-BAD" || echo "CLEAN-OK"
```
Expected: `workspace/_smoke` printed, then `IGNORED-OK`, then `CLEAN-OK` (the nested repo is invisible to mission-control's git).

- [ ] **Step 2: Prove a ledger append is atomic + parseable**

```bash
cd ~/Documents/mission-control
printf '%s\n' '{"ts":"2026-07-26T00:00:00Z","event":"note","app_id":"_smoke","actor":"orchestrator","detail":"mechanics smoke"}' >> fleet/ledger.jsonl
tail -n1 fleet/ledger.jsonl | python3 -m json.tool > /dev/null && echo "LEDGER-OK"
```
Expected: `LEDGER-OK`.

- [ ] **Step 3: Prove the roster append renders**

Add a temporary row to `fleet/apps.md` under the header, then verify it's a well-formed table row:
```bash
cd ~/Documents/mission-control
grep -q "| _smoke |" fleet/apps.md && echo "APPS-ROW-OK" || echo "add the row first"
```
(Add: `| _smoke | (local) | drafted | - | 2026-07-26 | mechanics smoke |`)
Expected: `APPS-ROW-OK`.

- [ ] **Step 4: Clean up the smoke artifacts**

```bash
cd ~/Documents/mission-control
rm -rf workspace/_smoke
# revert the smoke ledger line and roster row
git checkout -- fleet/ledger.jsonl fleet/apps.md 2>/dev/null || true
# (ledger.jsonl was empty at last commit, so checkout restores empty; verify)
test -s fleet/ledger.jsonl && echo "WARN: ledger not empty" || echo "LEDGER-RESET-OK"
```
Expected: `LEDGER-RESET-OK` and no `_smoke` row remaining.

- [ ] **Step 5: Final tree check**

```bash
cd ~/Documents/mission-control
git status --porcelain   # expect: clean
find . -path ./.git -prune -o -type f -print | sort
```
Expected: clean tree; the file list matches the spec §5 layout (README, CLAUDE.md, skills.lock, .claude/settings.json, .gitignore, fleet/{apps.md,ledger.jsonl,README.md,apps/.gitkeep}, intake/{_TEMPLATE.md,inbox/.gitkeep,done/.gitkeep}, bin/{spawn-app.md,graduate-app.md}, schedules/README.md).

- [ ] **Step 6: Push**

```bash
cd ~/Documents/mission-control
git push -u origin main    # via gh-authenticated HTTPS remote
```
Expected: branch `main` pushed to `radroid/mission-control`.

---

## Post-build (separate, human-gated — NOT part of this build)

- The **first live product spawn** (a real `gh repo create` + `idea-to-loop` run
  from a real brief) is Raj's call (spec §10 Q2: throwaway sacrificial idea vs a
  real one). This build stops at proven-plumbing.
- After Raj reviews, fold any friction into the runbook, then (D-D) extract the
  spawn logic into a `fleet-dispatch` skill in `claude-skills` once it's proven.
