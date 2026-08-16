---
name: which-skill
description: Ask which skill or flow in this repo fits your situation. A router over the claude-skills set.
disable-model-invocation: true
---

# Which skill

You don't remember every skill, so ask.

A **flow** is a path through the skills. Most work runs along one **main flow**, and four **on-ramps** merge onto it. Everything else is standalone, reference the other skills read, or the fleet layer underneath.

## The main flow: idea → unattended build

The route most work travels. You have an idea and want it built while you're elsewhere.

1. **`/grill-to-prd`** — an interview that runs until there's a PRD you'd sign, written to `docs/PRD.md`. It classifies a persona lane (Technical, Designer, Vibe) and grills from that lane's question bank.
2. **`/prd-to-screens`** — the PRD becomes an approved set of self-contained HTML mockups under `docs/screens/html/`. Phased and human-gated: inventory → workflows → wireframes → HTML → walkthrough. Optional, and the highest-leverage option on this flow — that approved HTML is what the loop later renders its real frontend against.
3. **`/idea-to-loop`** — S0 scope → S1 `ARCHITECTURE.md` → S2 a scaffold that actually runs, each stage behind a human gate tracked in `.loop/state.json`. Ask for this one alone from an idea: it runs `/grill-to-prd` at S0, ends S0 on a runnable prototype rather than a paper spec, and calls `/auto-loop-bootstrap` at the S2 exit gate itself — which writes `"stage": "S3"`, so the handoff is atomic and leaves you no flip step.
4. **`/autonomous-build-loop`** — the unattended part. Each iteration reads `.loop/state.json`, the backlog and `logs/latest.md`, does one bounded turn of work, verifies it, logs, commits, and schedules its own next wake-up. Blocks become entries in `logs/blocks.md` and the loop moves on. Walk away.
5. **`/graduation-gate`** — the seam between building and maintaining. Verifies the app is genuinely instrumented and operationally ready for unattended maintenance, then enrolls it in the fleet on a full pass **plus** your approval. (Fleet profile — see The fleet.)
6. **`/archive-loop-scaffolding`** — the teardown, once per repo lifetime. Moves `GOALS.md`, `logs/`, `.loop/` and friends into a gitignored `.archive/<timestamp>/` with a MANIFEST that makes restoring mechanical. Nothing is deleted, and it takes your yes per file. (User-invoked — you type it.)

## On-ramps

A starting situation that generates work, then merges onto the main flow.

- **An existing repo with no `.loop/`** → **`/auto-loop-bootstrap`**. Leaves the repo loop-ready — `.loop/state.json` at `"stage": "S3"`, a CLAUDE.md protocol section, `logs/` stubs, a backlog of at least three actionable items, one smoke-tested iteration — then you are at step 4.
- **A PRD written elsewhere** (Notion, Linear, a doc already in the repo) → **`/prd-to-screens`**, joining at step 2.
- **Mockups that look generic** → **`/screen-design-loop`**. One screen per iteration grounded in real shipped-app patterns from the Mobbin MCP server: research → synthesize → render → critique → commit, with findings accumulating in `docs/research/design/<screen>.md`. It refines `docs/screens/html/` in place, so it picks up wherever step 2 left off.
- **Work already sliced into PRs** → **`/orchestrated-delivery`**. Lands a multi-PR backlog through planner, executor, reviewer, fix and steward subagents while you carry only decisions and sequencing. Fresh session, repo-resident plans, review adversarial enough that a rubber-stamp streak cannot survive.

## Standalone

Off every flow. Type these yourself — user-invoked, so you are the only one who can reach them.

- **`/fitness-functions`** — profiles this repo's languages, frameworks and architecture, researches the current best-practice checks for that stack, and installs the ones you pick as GitHub Actions workflows, tool configs, and a `FITNESS.md`. A deliberate afternoon.
- **`/screenshot-to-replica`** — screenshots of a shipped app, from a local folder or pulled from Mobbin, become a new git-initialized web app in your stack: every screen at the source viewport, scoring ≤3% differing pixels against its reference and passing a side-by-side design critique. Hours, and a repo of its own.
- **`/frontend-evolution-timelapse`** — walks the branch from its first meaningful frontend commit to `HEAD`, screenshots configured pages at each relevant commit, and stitches per-page GIF/MP4 plus an `index.html` summary. Needs a Node web app with a dev or build/start script.
- **`/architecture-evolution-timelapse`** — the structural sibling: a deterministic C1/C2/C3 model extracted per commit by pure static analysis, rendered to fixed-template Mermaid diagrams. Read-only JS/TS tree, no install or dev server. It ships `init | extract | render` today, so drive those three yourself; `run`, `stitch-only` and `clean` are reserved and exit 2.
- **`/loop-supervisor`** — read-only oversight of a loop that is already running, in a second window on the same repo. Reconciles claimed against shipped, curates the backlog, escalates real problems to `logs/blocks.md`. Its own cadence, typically 10–30 minutes.
- **`/archive-loop-scaffolding`** — step 6 above, reached directly whenever a repo is done looping.

## Underneath

- **`/workflow-runtime`** — the canon every loop skill targets when it says "pipeline this through the Workflow runner": the paste-in preamble, the unified `APPROVE | REVISE | BLOCK` verdict, the audit-ledger schema, and the one constraint that shapes them (Workflow scripts import nothing). Read it before authoring or editing a Workflow script.

## Routing rules

The rules that keep the confusable ones apart.

- **The bootstrap triple is settled by one file, not taste.** Read `.loop/state.json`: absent and no repo → `/idea-to-loop`; absent but a repo exists → `/auto-loop-bootstrap`; `"stage": "S3"` → `/autonomous-build-loop`, the same answer whether you are starting the loop or restarting it after it stopped.
- **Starting from an idea, ask for `/idea-to-loop` alone** — it runs `/grill-to-prd` at S0 and calls `/auto-loop-bootstrap` at the S2 exit gate itself.
- **The design triple is settled by what you are holding.** A PRD → `/prd-to-screens`. Mockups in `docs/screens/html/` → `/screen-design-loop`. Screenshots of someone else's shipped app → `/screenshot-to-replica`.
- **"Copy this app's design" almost always means borrow the vibe** — that is `/screen-design-loop` with a Mobbin query, rather than a multi-hour pixel replica.
- **Run one shipper per tree.** Where `.loop/state.json` exists the loop owns that repo, and `/orchestrated-delivery` arrives only as its delegate.
- **`/workflow-runtime` is read, never run.**
- **Open `/loop-supervisor` yourself, in a second window** — the running loop coordinates with it through disk alone.
- **`/which-skill` routes this repo's unattended build system; `/ask-matt` routes the human-present flow** — grill, spec, tickets, TDD, review, with you at the keyboard throughout. A one-way pointer: `ask-matt` lives in the vendored `mattpocock/skills` clone and carries no route back here.

## The fleet

`/fleet-registry` (one typed record per app, storing the facts), `/cto-governance-spine` (the deterministic gate deciding what may happen unsupervised), `/fleet-maintenance` (health sweeps, ranked backlogs, gated fixes) and `/graduation-gate` (admission) install on the `fleet` profile only. Run `scripts/install.sh fleet` once `/graduation-gate` has its first app to enroll. That is your reminder; mission-control's preflight is the orchestrator's.

## Finding these

`/skills` lists what the agent can reach, so the user-invoked ones above may be absent from it. The filesystem is the check: `ls ~/.claude/skills/<name>`.
