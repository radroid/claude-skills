# claude-skills

Skills for [Claude Code](https://claude.com/claude-code).

## Skills in this repo

| Skill | Purpose |
|-------|---------|
| [`idea-to-loop`](./idea-to-loop/) | **Greenfield bootstrap** — idea → PRD → tech stack → runnable scaffold → hands off to the loop. Runs lifecycle stages S0 (Alignment & Scope) → S1 (System Design & Tech Stack) → S2 (Scaffold & Wire). New in M2. |
| [`auto-loop-bootstrap`](./auto-loop-bootstrap/) | **Brownfield bootstrap** — stands up loop machinery on an **existing repo** (skips S0–S2). Scaffolds `CLAUDE.md`, `GOALS.md`, `ARCHITECTURE.md`, `PLAN.md`, `logs/`, and drops in the `auto-loop.py` driver script. Invokes `grill-me` to extract a backlog when one doesn't exist. Pairs with `autonomous-build-loop`. |
| [`autonomous-build-loop`](./autonomous-build-loop/) | The **loop runtime** — runs S3+ (feature dev). Per-iteration checklist, tiered read strategy (shrink the per-iter cold-boot cost), fat-iter parallel-dispatch protocol, Class A/B sub-agent discipline, peer-review triggers, frontend-critique gate, phase-boundary arch passes, log hygiene, no-halt continuous loop semantics. |

### Two entry paths into the loop

Both paths converge at S3 where `autonomous-build-loop` takes over.

- **Greenfield (idea → product):** `idea-to-loop` runs S0 → S1 → S2, then invokes `auto-loop-bootstrap` to lay down loop machinery, then hands off
- **Brownfield (existing codebase):** `auto-loop-bootstrap` directly. Skips S0–S2 — your repo's existing structure stands in for the scaffolded-app gate

Canonical stage defs: [`autonomous-build-loop/references/lifecycle-stages.md`](./autonomous-build-loop/references/lifecycle-stages.md).

## Roadmap

[`ROADMAP.md`](./ROADMAP.md) — the strategic plan of record for evolving these skills into a **lifecycle-staged build loop** (S0 Alignment → S1 Tech Stack → S2 Scaffold & Wire → S3+ Feature Dev), with feature-PR mode, a machine-readable loop-state file, human checkpoints, a super-reviewer, auto-research, and a multi-repo testbed. Rollout is milestone-based (M0–M5).

## Install

### Option A — Symlink the source folder (recommended for editing)

```bash
git clone https://github.com/radroid/claude-skills.git ~/Documents/claude-skills

# Link each skill into ~/.claude/skills/
ln -s ~/Documents/claude-skills/idea-to-loop ~/.claude/skills/idea-to-loop
ln -s ~/Documents/claude-skills/auto-loop-bootstrap ~/.claude/skills/auto-loop-bootstrap
ln -s ~/Documents/claude-skills/autonomous-build-loop ~/.claude/skills/autonomous-build-loop
```

Restart Claude Code. Run `/skills` to confirm the skills are loaded.

Updates: `git pull` in the cloned dir — symlinks always reflect the latest commit.

### Option B — Download the packaged `.skill` files

Grab the latest release from [GitHub Releases](https://github.com/radroid/claude-skills/releases):

```bash
curl -L -o /tmp/idea-to-loop.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/idea-to-loop.skill
curl -L -o /tmp/auto-loop-bootstrap.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/auto-loop-bootstrap.skill
curl -L -o /tmp/autonomous-build-loop.skill \
  https://github.com/radroid/claude-skills/releases/latest/download/autonomous-build-loop.skill

# .skill files are zip archives — extract into your skills dir
unzip /tmp/idea-to-loop.skill -d ~/.claude/skills/
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

`idea-to-loop` grills you for scope, picks the tech stack (auto-research by default, super-reviewer-vetted), scaffolds a runnable bare-bones app, then invokes `auto-loop-bootstrap` to lay down loop machinery and hand off.

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
├── autonomous-build-loop/        skill source
│   ├── SKILL.md
│   └── references/
├── auto-loop-bootstrap/          skill source
│   ├── SKILL.md
│   ├── assets/
│   └── references/
├── scripts/
│   └── build.sh                  package all skills into dist/
└── dist/                         packaged .skill files (built from source)
    ├── autonomous-build-loop.skill
    └── auto-loop-bootstrap.skill
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
