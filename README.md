# claude-skills

Skills for [Claude Code](https://claude.com/claude-code).

## Skills in this repo

**Invocation** is how a skill starts. `model` — the agent can reach it on its own from
what you say, and you can also type `/name`. `user` — only you can start it, by typing
`/name`; the agent never reaches it, and it costs nothing in always-loaded context.
`/which-skill` is the router over the whole set: ask it when you can't remember which
skill fits.

| Skill | Invocation | Purpose |
|-------|------------|---------|
| [`which-skill`](./which-skill/) | user | **The router.** Names every skill in this repo and when to reach for it: the main flow (idea → PRD → screens → scaffold → unattended loop → graduation → teardown), the four on-ramps onto it, the standalone one-shot skills, and the routing rules that keep the confusable ones apart (which of `idea-to-loop` / `auto-loop-bootstrap` / `autonomous-build-loop` — settled by `.loop/state.json`, not taste; which of `prd-to-screens` / `screen-design-loop` / `screenshot-to-replica` — settled by what you're holding). Read it when you don't remember what's here. |
| [`workflow-runtime`](./workflow-runtime/) | model | **Ultracode substrate (infrastructure).** The shared canon every loop skill targets to turn "use ultracode" from prose into mechanism: the empirically-pinned Workflow-runner contract, a copy-paste preamble (unified `APPROVE \| REVISE \| BLOCK` verdict + cost/checkpoint/**fail-closed audit-ledger** schemas), and paste-ready patterns (adversarial-verify + judge-panel, loop-until-dry + completeness-critic, perspective-diverse-verify). Not an importable library — scripts are self-contained, so the canon is paste-in. Core principle: a quality gate is a concrete pipeline stage, not a paragraph. |
| [`fleet-registry`](./fleet-registry/) | model | **Per-app source of truth (infrastructure).** The typed record every loop/schedule/webhook trigger scopes to one app from — split into PR-gated `config.yaml` (identity, the fail-closed `merge_deploys_to_prod` flag, smoke oracle, SLOs, denylist, cost caps, revert command) and machine-mutable `state.json` (the D2 concurrency lease, open-incident count, last-known-good ref, drift status); git-committed for v1. Ships the paste-in schema, the deterministic fail-closed readers (`prodDeployAllowed`, `leaseState`), and a canon-bound **admission validator** (graduation calls it to enroll — a gate, not a handoff). STORES data; `cto-governance-spine` READS and ENFORCES it. |
| [`cto-governance-spine`](./cto-governance-spine/) | model | **Policy contract (infrastructure).** The rules every loop/schedule/webhook trigger runs through before acting — what the CTO may do unsupervised vs. must escalate. Owns the **autonomous-mode-gate** (a tier-driven *enumerated allow-list*, never an LLM confidence score), the prod-deploy HOLD rule (flag SHIP **and** a human), the cost circuit-breaker, the per-app denylist refusal, the incident severity ladder + ack-timeout + dead-man's-switch, and the single append-only global audit ledger (`fleet/ledger.jsonl`). Deterministic by design — pure functions, no agents. READS `fleet-registry` data and ENFORCES on it; `loop-supervisor` only informs, never enforces. |
| [`fleet-maintenance`](./fleet-maintenance/) | model | **MAINTAIN pillar (orchestration).** Keeps a fleet of production apps healthy on schedule/webhook triggers: a poll-sweep (enabled) + a gated webhook adapter fan out over registry-enrolled apps, **deterministically** assess health signals against each app's SLOs into a severity-ranked per-app backlog (`maintenance.md`), diagnose the urgent ones, then GATE every fix through `cto-governance-spine` and DELEGATE the per-PR fix to `orchestrated-delivery` (non-negotiable adversarial-verify; prepare-and-HOLD on prod; revert via last-known-good). Dependency/security hygiene + incident response are modes; also runs the CTO self-heartbeat (`_cto-self`). Standalone engine (D5); consumes the whole P0 spine. |
| [`graduation-gate`](./graduation-gate/) | model | **BUILD→MAINTAIN seam (orchestration).** The hard gate a freshly-built app passes through to enter the maintenance fleet. Verifies the app is genuinely **instrumented** (the smoke oracle actually runs green, a health endpoint responds, telemetry is wired, SLOs declared — fail-closed: unverifiable = not ready), adversarially verifies **operational readiness** for unattended maintenance, CALLS `fleet-registry`'s admission-validator for record-shape + oracle adequacy, and enrolls only on a full pass **plus human approval** (graduation is always-human per `cto-governance-spine`). Hard one-shot — straight to `active` at the declared tier, no probation. Owns the reverse edge too: **auto-quarantine** on sustained sev1, **human re-admit**. Deterministic engine + a canon-bound readiness workflow. |
| [`grill-to-prd`](./grill-to-prd/) | model | **Builder interview → PRD.** Detects greenfield vs. brownfield, probes builder expertise (Technical / Designer / Vibe lanes), runs a persona-specific inline grill, then writes `docs/PRD.md` from a lane-matching template. Implements the PRD-production step `idea-to-loop` S0 calls for — callable standalone or as that step. Optional brainstorming pass on request. |
| [`idea-to-loop`](./idea-to-loop/) | model | **Greenfield bootstrap** — idea → PRD → tech stack → runnable scaffold → hands off to the loop. Runs lifecycle stages S0 (Alignment & Scope) → S1 (System Design & Tech Stack) → S2 (Scaffold & Wire). New in M2. |
| [`prd-to-screens`](./prd-to-screens/) | model | **PRD → approved HTML mockups** — phased conversation that turns an existing PRD into the baseline frontend: P1 intake → P2 screen inventory → P3 user workflows → P4 wireframes → P5 self-contained HTML with shared mock data → P6 cross-link & walkthrough. Optional but high-leverage between S0 and S1 — the approved HTML becomes the spec the loop builds against. Runs standalone too. |
| [`screen-design-loop`](./screen-design-loop/) | model | **Mobbin-powered design refinement loop** — iterative loop that grounds HTML mockups in real shipped-app references via the Mobbin MCP server. One screen per iter: Mobbin research → HTML synthesis → chrome-devtools render + Class A design-critique gate → commit. Refines the baseline `prd-to-screens` produces (same `docs/screens/html/` output dir, artifacts stack); runs standalone too. Targets mobile or desktop. |
| [`screenshot-to-replica`](./screenshot-to-replica/) | user | **Screenshots → pixel-perfect web replica.** Takes app screenshots — a local folder, or pulled straight from an app on Mobbin via the **Mobbin MCP** server (`mobbin-fetch.mjs` converts the webp previews to PNG and strips the "curated by Mobbin" footer) — and builds a working replica in a given web stack: first a functional app (one route per screen at the screenshot's exact viewport, hybrid cropped-photo / rebuilt-icon assets, shared verbatim mock data), then a smoke test and a per-screen pixel loop that scores each route against its reference with `pixel-diff.mjs` (pixelmatch heatmap) and gates on **≤3% diff plus a side-by-side design-critique APPROVE** (hard cap 8 rounds). Fail-closed on missing capture tooling; interactions deferred and catalogued in `.replica/report.md`. Unlike `screen-design-loop` (refines HTML mockups from real-app inspiration), this reproduces a *specific* app from *its own* screenshots. |
| [`auto-loop-bootstrap`](./auto-loop-bootstrap/) | model | **Brownfield bootstrap** — stands up loop machinery on an **existing repo** (skips S0–S2). Scaffolds `CLAUDE.md`, `GOALS.md`, `ARCHITECTURE.md`, `PLAN.md`, `logs/`, and `.loop/state.json`. Invokes `grilling` to extract a backlog when one doesn't exist (with an inline fallback when it isn't installed). Pairs with `autonomous-build-loop`. |
| [`archive-loop-scaffolding`](./archive-loop-scaffolding/) | user | **Loop teardown** — the reverse edge of `auto-loop-bootstrap`. Non-destructively archives loop scaffolding out of a target repo into a gitignored `.archive/` directory keyed by timestamp. Conservative by construction: touches only known loop artifacts, never deletes, and preserves user content in mixed files (`CLAUDE.md`, `.gitignore`) by excising just the loop-managed sections. |
| [`autonomous-build-loop`](./autonomous-build-loop/) | model | The **loop runtime** — runs S3+ (feature dev). Per-iteration checklist, tiered read strategy (shrink the per-iter cold-boot cost), fat-iter parallel-dispatch protocol, Class A/B sub-agent discipline, peer-review triggers, frontend-critique gate, phase-boundary arch passes, log hygiene, and bounded-turn loop semantics — one bounded turn of work per wake-up, and a block becomes an entry in `logs/blocks.md` so the loop keeps moving. |
| [`orchestrated-delivery`](./orchestrated-delivery/) | model | **Multi-PR backlog delivery (orchestration).** Ships a multi-PR backlog with a team of role subagents — planner → executor → reviewer → fix → merge → steward — working off repo-resident, code-free plans that don't go stale. Keeps a token ledger, a friction feedback loop, a self-improving steward, and an adversarial anti-bias check that stops reviewers rubber-stamping. Review + steward steps are wired to the `workflow-runtime` canon as concrete Workflow scripts emitting the unified `APPROVE \| REVISE \| BLOCK` verdict. ultracode-gated. |
| [`loop-supervisor`](./loop-supervisor/) | user | **Read-only oversight** — runs in a parallel Claude Code window alongside `autonomous-build-loop`. Reconciles shipped diff vs. claimed backlog, curates the TODO list (re-order, split, mark blocked, add discovered), escalates serious issues to `logs/blocks.md`. Never writes production code. |

### Standalone analysis skills

Not part of the build-loop pipeline — point them at any repo.

| Skill | Invocation | Purpose |
|-------|------------|---------|
| [`frontend-evolution-timelapse`](./frontend-evolution-timelapse/) | user | **Frontend history timelapse** — walks git history on a Node web app, screenshots configured pages at each frontend-relevant commit, stitches per-page GIF/MP4 and an `index.html` summary. Change-aware dedup drops visually-identical commits; annotation is burned in at stitch time so pristine pixels dedup cleanly. Isolated worktrees, resume checkpoints, token/cost accounting. Requires a JavaScript/TypeScript (or Node web) repo with a dev server. |
| [`architecture-evolution-timelapse`](./architecture-evolution-timelapse/) | user | **C4 architecture history timelapse** — the structural sibling of the frontend timelapse. Extracts a deterministic C1/C2/C3 (context/container/component) model per commit and renders change-aware Mermaid diagram videos of how the system's architecture evolved. Pure static analysis — read-only JS/TS repos, no install, dev server, or secrets. |
| [`fitness-functions`](./fitness-functions/) | user | **Architectural fitness functions as CI** — profiles a repo's languages/frameworks/architecture, web-searches current best-practice checks for that stack (circular-import / layering-violation detection, coupling, complexity, security, coverage, bundle size), presents a tailored catalog, then installs the selected checks as GitHub Actions workflows, tool configs, and a `FITNESS.md`. Stack-aware research covers languages the baseline catalog hasn't pinned. |

### How the skills fit together

Six of these skills form the product-lifecycle pipeline, idea → running app →
continuous build. Each works standalone; together they chain:

```text
Greenfield (no code yet):

  Idea
   │
   ▼
  grill-to-prd                  ──►  docs/PRD.md
   │
   ▼  (optional but high-leverage — catches missing UX before any code)
  prd-to-screens                ──►  docs/screens/html/*.html  (baseline)
   │
   ▼  (optional — grounds mockups in real shipped-app references via Mobbin)
  screen-design-loop            ──►  refines docs/screens/html/*.html
                                     adds docs/research/design/*.md
   │
   ▼
  idea-to-loop  (S0 → S1 → S2)  ──►  runnable scaffolded app
   │
   ▼
  autonomous-build-loop (S3+)   ──►  drains GOALS.md continuously
                                     (principle 9 critiques live UI against
                                      docs/screens/html/* — the design reference)


Brownfield (existing repo):

  auto-loop-bootstrap           ──►  loop machinery (CLAUDE.md, GOALS.md, logs/, …)
   │                                  ↑
   │                                  (optionally run grill-to-prd first if the
   │                                   repo lacks docs/PRD.md — different artifact
   │                                   from GOALS.md; the two grills complement)
   ▼
  autonomous-build-loop (S3+)   ──►  drains GOALS.md continuously

  (screen-design-loop also runs standalone on brownfield repos — point it at
   existing docs/screens/html/ mockups and it'll keep refining them with Mobbin
   research between feature iters)
```

Standalone entry points are first-class: bring a PRD from elsewhere (Notion, Linear, a
doc) and start at `prd-to-screens` or `idea-to-loop`. Already have HTML mockups and just
want the loop wired up? Drop into `auto-loop-bootstrap` directly. Each skill defends its
own exit gate, so cherry-picking the pipeline is safe.

Canonical stage defs: [`autonomous-build-loop/references/lifecycle-stages.md`](./autonomous-build-loop/references/lifecycle-stages.md).

## Roadmap

[`docs/cto-system-design.md`](./docs/cto-system-design.md) — **the current plan of record.** The autonomous-CTO system design: the BUILD → MAINTAIN lifecycle, the P0 governance spine (`fleet-registry` → `cto-governance-spine` → `fleet-maintenance`), and the trigger model (loop / schedule / webhook).

[`ROADMAP.md`](./ROADMAP.md) — **historical.** The original milestone plan (M0–M5) for evolving these skills into a lifecycle-staged build loop. Last revised 2026-05-15 and superseded by the CTO system design above; kept for provenance. It predates the entire P0 spine and doesn't mention 16 of the 19 skills now in this repo.

## Install

### Option A — Symlink the source folder (recommended for editing)

```bash
git clone https://github.com/radroid/claude-skills.git ~/Documents/claude-skills
cd ~/Documents/claude-skills

# pick one
./scripts/install.sh solo      # default — every skill except the fleet spine
./scripts/install.sh fleet     # every skill, fleet spine included
```

`solo` is the working set for building one project at a time. `fleet` adds the four
autonomous-fleet skills (`fleet-registry`, `cto-governance-spine`, `fleet-maintenance`,
`graduation-gate`), which only pay for their always-loaded context once you are running
more than one app — re-install the `fleet` profile when `graduation-gate` has its first
app to enroll.

`--dry-run` prints the link/unlink plan and writes nothing; `--list` shows each skill's
invocation mode, description size, and profile. The installer only ever creates, replaces
or removes entries in `~/.claude/skills/` whose name matches a skill folder in this repo —
skills you installed from anywhere else are never touched.

**The profile is not persisted.** It is an argument, not a stored setting, so a bare
`./scripts/install.sh` means `solo` — on a `fleet` machine that unlinks the four fleet
skills. Pass `fleet` every time you re-run it there.

Restart Claude Code. `ls ~/.claude/skills` — or `./scripts/install.sh --list` —
is the check that they landed: `/skills` lists what the model can reach on its
own, so the user-invoked skills you type by name may be absent from it.

Updates: `git pull` in the cloned dir — symlinks always reflect the latest commit.
`./scripts/check-skills.sh` re-checks that the pointers still line up.

### Option B — Download the packaged `.skill` files

Grab the latest release from [GitHub Releases](https://github.com/radroid/claude-skills/releases):

```bash
mkdir -p ~/.claude/skills

# .skill files are zip archives. Pick the ones you want, or take all of them:
SKILLS="architecture-evolution-timelapse archive-loop-scaffolding \
auto-loop-bootstrap autonomous-build-loop cto-governance-spine \
fitness-functions fleet-maintenance fleet-registry \
frontend-evolution-timelapse graduation-gate grill-to-prd idea-to-loop \
loop-supervisor orchestrated-delivery prd-to-screens screen-design-loop \
screenshot-to-replica which-skill workflow-runtime"

for s in $SKILLS; do
  curl -fL -o "/tmp/$s.skill" \
    "https://github.com/radroid/claude-skills/releases/latest/download/$s.skill" &&
  unzip -oq "/tmp/$s.skill" -d ~/.claude/skills/
done
```

That list is all 19. Omit `cto-governance-spine fleet-maintenance fleet-registry
graduation-gate` unless you want the `fleet` profile — they are the four fleet skills and
they cost always-loaded context you don't spend until you run more than one app.

## Quick start — run your own build loop

Set up a repo and let the loop build it. Steps 1–3 are the common path; step 4 is an
optional unattended alternative.

### 1. Bootstrap the repo

Pick the path that matches your starting point:

**Greenfield (no code yet, just an idea):**

```
mkdir my-app && cd my-app && git init
claude
> I have an idea for <X>, run idea-to-loop to build it
```

Under the hood, `idea-to-loop` invokes `grill-to-prd` to produce `docs/PRD.md` via a persona-aware interview (Technical / Designer / Vibe lanes), then optionally runs `prd-to-screens` for an approved set of HTML mockups before tech-stack pick, then picks the stack (auto-research by default, super-reviewer-vetted), scaffolds a runnable bare-bones app, and invokes `auto-loop-bootstrap` to lay down loop machinery and hand off.

**Brownfield (existing repo):**

```
cd <your-project>
claude
> bootstrap this repo for the autonomous build loop
```

The `auto-loop-bootstrap` skill audits the repo, interviews you for a backlog (via
`grilling`) when `GOALS.md` is missing, and scaffolds `CLAUDE.md`, `GOALS.md`,
`ARCHITECTURE.md`, `.loop/state.json`, and `logs/`. **Review the generated `GOALS.md`** —
that backlog is what the loop drains, top to bottom.

If the brownfield repo also lacks `docs/PRD.md` and you want one as part of bootstrap,
run `grill-to-prd` **before** `auto-loop-bootstrap` — the two grills produce different
artifacts (PRD = what this thing is, GOALS.md = drain order for what to build next) and
both can run on the same repo.

### 2. Push to a public GitHub repo

Feature-PR mode (`.loop/state.json` → `"pr_mode": true`) opens one PR per feature and has
CodeRabbit review it — and CodeRabbit only reviews **public** repos:

```bash
gh repo create <name> --public --source=. --remote=origin --push
```

(Private repo / legacy commit-to-branch mode: skip this — the loop falls back to a
non-CodeRabbit reviewer.)

### 3. Start the loop

Open a **dedicated** Claude Code session in the repo and kick it off with the built-in
`/loop` command, self-paced (no interval):

```
/loop run one iteration of the autonomous-build-loop skill
```

Or just type "start the autonomous build loop" — the skill self-paces from there.

The loop runs **in-session** — one Claude Code window stays open and schedules its own
next iteration via `ScheduleWakeup` (the Claude Code tool that wakes the session back up
after a delay). Walk away. Check progress any time in `logs/latest.md` (the handoff state)
and `logs/blocks.md` (anything that needs you): blocks become `logs/blocks.md` entries and
the loop moves on to the next non-conflicting item.

Stop conditions: Ctrl-C in CC, type a new prompt that overrides, the backlog source goes
empty (the agent decides), or review and stop manually.

> Running a second loop on another repo in parallel? Just repeat steps 1–3 in a separate
> session and directory — each loop is fully independent.

See each skill's `SKILL.md` for the full protocol.

## Repo layout

```
claude-skills/
├── README.md
├── ROADMAP.md                    strategic plan of record (milestones M0–M5)
├── LICENSE                       (CC BY 4.0)
├── CLAUDE.md                     repo-level agent guidance (use gh for GitHub)
├── architecture-evolution-timelapse/   skill source — C4 architecture history timelapse
│   ├── SKILL.md
│   ├── references/               config schema
│   └── scripts/                  extract-model / render-diagrams (+ lib, package.json)
├── archive-loop-scaffolding/     skill source — loop teardown into .archive/
│   └── SKILL.md
├── auto-loop-bootstrap/          skill source — brownfield loop bootstrap
│   ├── SKILL.md
│   ├── assets/
│   └── references/
├── autonomous-build-loop/        skill source — the loop runtime (S3+)
│   ├── SKILL.md
│   ├── assets/                   fat-iter / peer-review / perspective-verify workflows
│   └── references/               lifecycle stage definitions
├── cto-governance-spine/         skill source — policy contract (CTO infra)
│   ├── SKILL.md
│   ├── assets/                   governance.js policy module + runnable self-test
│   └── references/               mode-gate, prod/cost, ledger, incident, boundaries
├── fitness-functions/            skill source — architectural fitness functions as CI
│   ├── SKILL.md
│   ├── assets/templates/         workflow + tool-config + FITNESS.md templates
│   └── references/               catalog, concepts, detection, implementation, research
├── fleet-maintenance/            skill source — MAINTAIN pillar engine (CTO infra)
│   ├── SKILL.md
│   ├── assets/                   maintenance.js engine + monitor-sweep workflow + self-test
│   └── references/               monitor/ingest, backlog, fix-pipeline, self-obs, boundaries
├── fleet-registry/               skill source — per-app source of truth (CTO infra)
│   ├── SKILL.md
│   ├── assets/                   registry schema + admission-validator (canon-bound) + templates
│   └── references/               schema, layout, lease, flag/rollback, lifecycle
├── frontend-evolution-timelapse/ skill source — frontend history timelapse
│   ├── SKILL.md
│   ├── references/               config schema, workflow, troubleshooting
│   └── scripts/                  screenshot / stitch / run-commit (+ lib, package.json)
├── graduation-gate/              skill source — BUILD→MAINTAIN enrollment gate (CTO infra)
│   ├── SKILL.md
│   ├── assets/                   graduation.js engine + graduate workflow + self-test
│   └── references/               enrollment, instrumentation, demotion/re-admit, boundaries
├── grill-to-prd/                 skill source — persona-aware PRD interview
│   ├── SKILL.md
│   ├── assets/templates/         persona-specific PRD templates
│   └── references/               persona probe + question banks + synthesis
├── idea-to-loop/                 skill source — greenfield S0 → S1 → S2
│   ├── SKILL.md
│   └── assets/templates/         docs/decision-log.md, .loop/state.json seeds
├── loop-supervisor/              skill source — read-only oversight window
│   ├── SKILL.md
│   ├── assets/templates/         supervisor log seed
│   └── references/               supervisor log format
├── orchestrated-delivery/        skill source — multi-PR backlog delivery (orchestration)
│   ├── SKILL.md
│   └── assets/                   review-and-verify + steward Workflow scripts (canon-bound)
├── prd-to-screens/               skill source — PRD → approved HTML mockups
│   ├── SKILL.md
│   └── assets/templates/         page.html, mock-data.js, inventory / workflow / wireframe
├── screen-design-loop/           skill source — Mobbin-powered design refinement loop
│   ├── SKILL.md
│   ├── assets/templates/         .design-loop/state.json seed
│   └── references/               per-iter checklist, mobbin patterns, critique, integration
├── screenshot-to-replica/        skill source — screenshots → pixel-perfect web replica
│   ├── SKILL.md
│   ├── references/               device-profiles (viewport lookup)
│   └── scripts/
│       ├── pixel-diff.mjs        pixelmatch scorer + heatmap
│       └── mobbin-fetch.mjs      Mobbin MCP images → clean PNG refs (de-watermarked)
├── which-skill/                  skill source — the router over this whole set
│   └── SKILL.md
├── workflow-runtime/             skill source — Workflow-runner canon (infrastructure)
│   ├── SKILL.md
│   ├── assets/                   preamble.js (paste-in) + adversarial-verify example
│   └── references/               runner contract + paste-ready patterns
├── scripts/
│   ├── build.sh                  package all skills into dist/
│   ├── install.sh                link skills into ~/.claude/skills (solo | fleet)
│   └── check-skills.sh           name / dist / cross-repo pointer discipline
└── dist/                         packaged .skill files (built from source)
    ├── architecture-evolution-timelapse.skill
    ├── archive-loop-scaffolding.skill
    ├── auto-loop-bootstrap.skill
    ├── autonomous-build-loop.skill
    ├── cto-governance-spine.skill
    ├── fitness-functions.skill
    ├── fleet-maintenance.skill
    ├── fleet-registry.skill
    ├── frontend-evolution-timelapse.skill
    ├── graduation-gate.skill
    ├── grill-to-prd.skill
    ├── idea-to-loop.skill
    ├── loop-supervisor.skill
    ├── orchestrated-delivery.skill
    ├── prd-to-screens.skill
    ├── screen-design-loop.skill
    ├── screenshot-to-replica.skill
    ├── which-skill.skill
    └── workflow-runtime.skill
```

## Development workflow

```bash
# edit a skill in its source folder
$EDITOR autonomous-build-loop/SKILL.md

# rebuild packaged .skill files
./scripts/build.sh

# commit + tag a release
git add -A
git commit -m "autonomous-build-loop: tighten fat-iter dispatch rule"
git tag v0.2.0
git push --tags
```

GitHub Actions or `gh release create` can attach `dist/*.skill` as release assets.

## License

[CC BY 4.0](./LICENSE). Use, modify, redistribute with attribution.
