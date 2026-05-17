# claude-skills

Skills for [Claude Code](https://claude.com/claude-code).

## Skills in this repo

| Skill | Purpose |
|-------|---------|
| [`grill-to-prd`](./grill-to-prd/) | **Builder interview → PRD.** Detects greenfield vs. brownfield, probes builder expertise (Technical / Designer / Vibe lanes), runs a persona-specific inline grill, then writes `docs/PRD.md` from a lane-matching template. Implements the `grill-me` / `to-prd` chain referenced by `idea-to-loop` S0 — callable standalone or as the S0 PRD-production step. Optional brainstorming pass on request. |
| [`idea-to-loop`](./idea-to-loop/) | **Greenfield bootstrap** — idea → PRD → tech stack → runnable scaffold → hands off to the loop. Runs lifecycle stages S0 (Alignment & Scope) → S1 (System Design & Tech Stack) → S2 (Scaffold & Wire). New in M2. |
| [`prd-to-screens`](./prd-to-screens/) | **PRD → approved HTML mockups** — phased conversation that turns an existing PRD into the baseline frontend: P1 intake → P2 screen inventory → P3 user workflows → P4 wireframes → P5 self-contained HTML with shared mock data → P6 cross-link & walkthrough. Optional but high-leverage between S0 and S1 — the approved HTML becomes the spec the loop builds against. Runs standalone too. |
| [`screen-design-loop`](./screen-design-loop/) | **Mobbin-powered design refinement loop** — iterative loop that grounds HTML mockups in real shipped-app references via the Mobbin MCP server. One screen per iter: Mobbin research → HTML synthesis → chrome-devtools render + Class A design-critique gate → commit. Refines the baseline `prd-to-screens` produces (same `docs/screens/html/` output dir, artifacts stack); runs standalone too. Targets mobile or desktop. |
| [`auto-loop-bootstrap`](./auto-loop-bootstrap/) | **Brownfield bootstrap** — stands up loop machinery on an **existing repo** (skips S0–S2). Scaffolds `CLAUDE.md`, `GOALS.md`, `ARCHITECTURE.md`, `PLAN.md`, `logs/`, and drops in the `auto-loop.py` driver script. Invokes `grill-me` to extract a backlog when one doesn't exist. Pairs with `autonomous-build-loop`. |
| [`autonomous-build-loop`](./autonomous-build-loop/) | The **loop runtime** — runs S3+ (feature dev). Per-iteration checklist, tiered read strategy (shrink the per-iter cold-boot cost), fat-iter parallel-dispatch protocol, Class A/B sub-agent discipline, peer-review triggers, frontend-critique gate, phase-boundary arch passes, log hygiene, no-halt continuous loop semantics. |

### How the skills fit together

Six skills covering the product lifecycle from idea → running app → continuous build.
Each works standalone; together they form a pipeline:

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

[`ROADMAP.md`](./ROADMAP.md) — the strategic plan of record for evolving these skills into a **lifecycle-staged build loop** (S0 Alignment → S1 Tech Stack → S2 Scaffold & Wire → S3+ Feature Dev), with feature-PR mode, a machine-readable loop-state file, human checkpoints, a super-reviewer, auto-research, and a multi-repo testbed. Rollout is milestone-based (M0–M5).

## Install

### Option A — Symlink the source folder (recommended for editing)

```bash
git clone https://github.com/radroid/claude-skills.git ~/Documents/claude-skills

# Link each skill into ~/.claude/skills/
ln -s ~/Documents/claude-skills/grill-to-prd ~/.claude/skills/grill-to-prd
ln -s ~/Documents/claude-skills/idea-to-loop ~/.claude/skills/idea-to-loop
ln -s ~/Documents/claude-skills/prd-to-screens ~/.claude/skills/prd-to-screens
ln -s ~/Documents/claude-skills/screen-design-loop ~/.claude/skills/screen-design-loop
ln -s ~/Documents/claude-skills/auto-loop-bootstrap ~/.claude/skills/auto-loop-bootstrap
ln -s ~/Documents/claude-skills/autonomous-build-loop ~/.claude/skills/autonomous-build-loop
```

Restart Claude Code. Run `/skills` to confirm the skills are loaded.

Updates: `git pull` in the cloned dir — symlinks always reflect the latest commit.

### Option B — Download the packaged `.skill` files

Grab the latest release from [GitHub Releases](https://github.com/radroid/claude-skills/releases):

```bash
curl -L -o /tmp/grill-to-prd.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/grill-to-prd.skill
curl -L -o /tmp/idea-to-loop.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/idea-to-loop.skill
curl -L -o /tmp/prd-to-screens.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/prd-to-screens.skill
curl -L -o /tmp/screen-design-loop.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/screen-design-loop.skill
curl -L -o /tmp/auto-loop-bootstrap.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/auto-loop-bootstrap.skill
curl -L -o /tmp/autonomous-build-loop.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/autonomous-build-loop.skill

# .skill files are zip archives — extract into your skills dir
unzip /tmp/grill-to-prd.skill -d ~/.claude/skills/
unzip /tmp/idea-to-loop.skill -d ~/.claude/skills/
unzip /tmp/prd-to-screens.skill -d ~/.claude/skills/
unzip /tmp/screen-design-loop.skill -d ~/.claude/skills/
unzip /tmp/auto-loop-bootstrap.skill -d ~/.claude/skills/
unzip /tmp/autonomous-build-loop.skill -d ~/.claude/skills/
```

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
`grill-me`) when `GOALS.md` is missing, and scaffolds `CLAUDE.md`, `GOALS.md`,
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

The loop runs **interactively** — it stays on your Claude subscription and schedules its
own next iteration via `ScheduleWakeup` (the Claude Code tool that wakes the session back
up after a delay). Walk away. Check progress any time in
`logs/latest.md` (the handoff state) and `logs/blocks.md` (anything that needs you). It
never halts — blockers become log entries, not stops.

> Running a second loop on another repo in parallel? Just repeat steps 1–3 in a separate
> session and directory — each loop is fully independent.

### 4. Optional — unattended external-driver mode

`auto-loop-bootstrap` also drops in `scripts/auto-loop.py` for runs with no live session:

```bash
python3 scripts/auto-loop.py
```

Each iteration spawns a fresh `claude -p` process with no carried context. Stop with Ctrl-C,
`touch .auto-loop/stop`, an empty backlog, or 3 consecutive failures. Note: from
2026-06-15, `claude -p` usage bills against a separate API-rate credit pool — the
interactive `/loop` path in step 3 does not.

See each skill's `SKILL.md` for the full protocol.

## Repo layout

```
claude-skills/
├── README.md
├── ROADMAP.md                    strategic plan of record (milestones M0–M5)
├── LICENSE                       (CC BY 4.0)
├── CLAUDE.md                     repo-level agent guidance (use gh for GitHub)
├── auto-loop-bootstrap/          skill source — brownfield loop bootstrap
│   ├── SKILL.md
│   ├── assets/
│   └── references/
├── autonomous-build-loop/        skill source — the loop runtime (S3+)
│   ├── SKILL.md
│   └── references/
├── grill-to-prd/                 skill source — persona-aware PRD interview
│   ├── SKILL.md
│   ├── assets/templates/         persona-specific PRD templates
│   └── references/               persona probe + question banks + synthesis
├── idea-to-loop/                 skill source — greenfield S0 → S1 → S2
│   ├── SKILL.md
│   ├── assets/
│   └── references/
├── prd-to-screens/               skill source — PRD → approved HTML mockups
│   ├── SKILL.md
│   ├── assets/templates/         page.html, mock-data.js, etc
│   └── references/               p1-intake … p6-walkthrough
├── screen-design-loop/           skill source — Mobbin-powered design refinement loop
│   ├── SKILL.md
│   ├── assets/templates/         .design-loop/state.json seed
│   └── references/               per-iter checklist, mobbin patterns, critique, integration
├── scripts/
│   └── build.sh                  package all skills into dist/
└── dist/                         packaged .skill files (built from source)
    ├── auto-loop-bootstrap.skill
    ├── autonomous-build-loop.skill
    ├── grill-to-prd.skill
    ├── idea-to-loop.skill
    ├── prd-to-screens.skill
    └── screen-design-loop.skill
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
