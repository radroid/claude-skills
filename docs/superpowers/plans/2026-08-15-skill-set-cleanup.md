# Skill-set Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cut the repo's permanent context cost by ~83% and make the set legible enough to use daily, by applying Matt Pocock's authoring doctrine (`writing-for-agents` + `SKILL-MECHANICS.md` + his `.agents/invocation.md`) — invocation as a deliberate trade, one router to carry the cognitive load, descriptions written as context pointers, and pruning.

**Architecture:** No new machinery. The work is frontmatter, descriptions, one rename, one new router skill, and fixing an install substrate that is currently broken in three ways. Every skill keeps its logic; nothing is deleted.

---

## The problem, measured

| | this repo | mattpocock/skills |
|---|---|---|
| Skills | 18 | 35 |
| Model-invoked (costs context every turn) | **18** | 15 |
| User-only (costs nothing) | **0** | 20 |
| Always-loaded description budget | **6,272 ch ≈ 1,568 tok** | 3,046 ch ≈ 761 tok |

**You pay 2× the context tax for half the skills, on every turn of every session, forever.**
Two descriptions alone are 25% of the budget: `fitness-functions` at 917 chars and
`mobbin-replica` at 667 — and they are the two skills in the repo least suited to
autonomous reach.

Three further defects found while measuring:

1. **Four skills are not installed at all** — `screen-design-loop`, `workflow-runtime`,
   `fitness-functions`, `architecture-evolution-timelapse` are absent from `~/.claude/skills/`.
2. **`workflow-runtime` is pointed at by three skills and is not on this machine.**
   `autonomous-build-loop/SKILL.md:61`, `orchestrated-delivery/SKILL.md:72` and
   `fleet-registry/SKILL.md:32` all instruct the agent to read it mid-task. Those
   pointers dangle today, on exactly the files where getting the Workflow contract
   wrong means a script that will not parse or resume.
3. **Five skills are installed as directory copies, not symlinks** —
   `cto-governance-spine`, `fleet-maintenance`, `fleet-registry`, `graduation-gate`,
   `mobbin-replica`. Content is currently identical (only `.DS_Store` differs), so
   nothing is broken *yet* — but every edit in this plan would silently fail to apply
   to those five. `README.md`'s Option B `SKILLS=` list is also stale: 15 names for 18 skills.

---

## The end state

- **11 model-invoked** (the agent can reach them, or a sibling must) — 1,758 chars.
- **7 user-only** (`disable-model-invocation: true`) — 0 chars, reached by typing the name.
- **1 new router**, `/which-skill`, user-invoked — 0 chars.
- **Two install profiles**: `solo` (7 skills + router) and `fleet` (+ the 4 fleet skills).

**Always-loaded budget: 1,568 → 261 tokens on the solo profile (83% cut).**
All 18 skills stay on disk and stay reachable.

---

## Global Constraints

- **The router ships in the same commit as the flips.** Flipping trades context load for
  cognitive load; the router is what pays that bill. Ship them apart and there is a window
  where `/archive-loop-scaffolding` — zero callers repo-wide — is effectively deleted.
- **Fix the install substrate first (Task 1).** Five skills are copies; edits to the source
  will not reach them. Do this before anything else or you ship the work, measure no change,
  and have nothing to debug.
- **Keep every filesystem trigger when tightening descriptions.** `.loop/state.json`,
  `iter-NNN.md`, `docs/screens/html/` are the branches that fire with *no human in the room*.
  Cut synonym phrases; never cut a path.
- **No `agents/openai.yaml` in this repo** — unlike Pocock's, there is no second harness
  policy block to keep in sync. A flip really is one line, seven times.
- **`dist/` is rebuilt in the same commit as any rename** (`./scripts/build.sh`), or the old
  packaged skill keeps firing under the old name.

---

## A note on the fleet cluster — your answer, adapted

You chose *"make user-only + move behind router"* for the four fleet skills. Two of them
can't take that flip safely, so this plan gets you the same outcome by a different lever.

- **`fleet-registry` and `cto-governance-spine` flip cleanly** — I checked how siblings
  reach them, and it is by *file path*, not skill invocation (`fleet-maintenance/references/fix-pipeline.md:21`
  says "Paste `cto-governance-spine`'s `governance.js`"; `graduation-gate/references/enrollment.md:25`
  runs `fleet-registry`'s `admission-validator.workflow.js`). `disable-model-invocation`
  hides a *description*, not a directory, so those reads still work.
- **`fleet-maintenance` and `graduation-gate` are the risky ones** — both have unattended
  triggers by design (the cron/webhook health sweep; auto-quarantine off a sweep's severities).
  A gate the human must remember to invoke is not a gate.

**What this plan does instead, to get you what you actually asked for:** leave all four
model-invoked and **uninstall the cluster** via the `solo` profile (Task 1). The fleet holds
zero enrolled apps today, so the cost goes to zero immediately, nothing in the call graph
breaks, and re-enabling is one command when `mindmark` clears its S0 gate. If you'd rather
take the literal flip on all four, say so — it's a two-line change to Task 6.

---

## Per-skill decisions

Every skill was audited against the doctrine. **No splits were earned** — see "What this plan
does not do" below. One rename was earned.

### Flip to user-only (7) — description cost goes to zero

| Skill | Was | Why it fires only by hand |
|---|---|---|
| `fitness-functions` | 917 ch | Installing a CI guardrail pipeline is a deliberate, human-gated afternoon, not something an agent should start mid-task |
| `mobbin-replica` → `screenshot-to-replica` | 667 ch | Spends a third of its description telling the model *not* to fire; git-inits a new repo and runs up to 8 capture-score-critique rounds per screen |
| `frontend-evolution-timelapse` | 503 ch | One-shot artifact job; a human decides they want a GIF |
| `architecture-evolution-timelapse` | 440 ch | Same — and today it cannot do what its name promises (`run`, `stitch-only`, `clean` are RESERVED and exit 2) |
| `idea-to-loop` | 294 ch | No skill invokes it; the agent should not autonomously commit a repo to a staged S0–S2 pipeline |
| `loop-supervisor` | 235 ch | You open it yourself in a second window; the running loop coordinates with it through disk only and never invokes it |
| `archive-loop-scaffolding` | 227 ch | Once per repo lifetime; its own contract waits for an explicit yes per file |

**3,283 chars — 52% of the entire budget — deleted by one frontmatter line per file.**

### Stay model-invoked (11) — descriptions tightened 2,989 → 1,758 ch

| Skill | Chars | Rewritten description |
|---|---|---|
| `autonomous-build-loop` | 305→193 | Autonomous build loop — ship the backlog unattended, one bounded iteration per wake-up. Use when the user asks to keep building on its own ("/loop"), or the repo already has `.loop/state.json`. |
| `fleet-maintenance` | 318→207 | Health sweep over enrolled fleet apps — signals into a severity-ranked per-app backlog, then triage, gate, and delegate each fix. Covers dependency/security hygiene, incident response, and the CTO heartbeat. |
| `fleet-registry` | 289→173 | Registry record for one fleet app — read it, enroll via the admission validator, retire, quarantine, reconcile drift. Holds the prod-deploy flag, lease, and last-known-good. |
| `cto-governance-spine` | 252→170 | The autonomous-mode-gate — may this action run unsupervised? Also the prod-deploy HOLD rule, cost breaker, incident ladder, dead-man's-switch, and the fleet audit ledger. |
| `graduation-gate` | 220→164 | Graduate a built app into the maintenance fleet after a fail-closed readiness check, or work the reverse edge — quarantine on sustained sev1 sweeps, human re-admit. |
| `auto-loop-bootstrap` | 277→160 | Make a repo loop-ready so autonomous-build-loop can take over: protocol files, backlog source, seed commit, smoke test. Use when the repo is not loop-ready yet. |
| `grill-to-prd` | 264→160 | Grill the user into a PRD at docs/PRD.md. Use when they want to be interviewed about an idea, ask for a PRD or spec, or name a Technical, Designer, or Vibe PRD. |
| `workflow-runtime` | 268→139 | Authoring Workflow scripts for the harness runner. Use when writing one against the paste-in canon, or when a script won't parse or resume. |
| `orchestrated-delivery` | 272→133 | Use when shipping a multi-PR backlog through role subagents — starting a fresh run, or resuming one from the backlog's Progress line. |
| `prd-to-screens` | 231→131 | Turn a PRD into approved HTML mockups. Use when a PRD exists and the user wants the UI settled before any frontend code is written. |
| `screen-design-loop` | 293→128 | Refine existing HTML mockups against real shipped-app references from Mobbin. Use on a repo that already has `docs/screens/html/`. |

---

### Task 1: Fix the install substrate

Nothing else in this plan lands until this does. Five skills are copies that ignore source
edits; four are missing; one dangling pointer is live.

**Files:**
- Modify: `README.md` (Install section — profiles, and the stale Option B list)
- Create: `scripts/install.sh`

- [ ] **Step 1: Replace the five copy-installs with symlinks**

```bash
for s in cto-governance-spine fleet-maintenance fleet-registry graduation-gate mobbin-replica; do
  rm -rf ~/.claude/skills/"$s"
  ln -sfn ~/Documents/claude-skills/"$s" ~/.claude/skills/"$s"
done
ls -la ~/.claude/skills/ | grep -c 'Documents/claude-skills'   # expect 14
```

- [ ] **Step 2: Install `workflow-runtime` — three skills point at it and it is absent**

```bash
ln -sfn ~/Documents/claude-skills/workflow-runtime ~/.claude/skills/workflow-runtime
```

- [ ] **Step 3: Write `scripts/install.sh` with two profiles**

`solo` = the 7 model-invoked non-fleet skills + the 7 user-only + the router.
`fleet` = solo + the 4 fleet skills. Default `solo`.
Every skill stays on disk; the profile only decides what is linked into `~/.claude/skills/`.

- [ ] **Step 4: Fix `README.md`**

Replace the "link every skill" loop (line ~100) with the two profiles, and regenerate the
Option B `SKILLS=` list — it currently names 15 of 18, silently missing
`architecture-evolution-timelapse`, `fitness-functions` and `mobbin-replica`.

- [ ] **Step 5: Verify** — restart Claude Code, run `/skills`, confirm the expected set loads.

---

### Task 2: Flip 7 skills to user-only, and ship the router in the same commit

**Files:**
- Modify: 7 × `SKILL.md` frontmatter
- Create: `which-skill/SKILL.md`
- Modify: `auto-loop-bootstrap/SKILL.md:55`, `cto-governance-spine/SKILL.md:25` (prose that
  addresses the agent about a now-hand-only skill; re-aim at the human)

- [ ] **Step 1: Add `disable-model-invocation: true` to each of the 7**, and rewrite each
  `description` as a short human-facing one-liner with trigger lists stripped (per
  `SKILL-MECHANICS.md`: "the `description` becomes human-facing — a one-line summary").

- [ ] **Step 2: Write `which-skill/SKILL.md`** — user-invoked, modelled on Pocock's `ask-matt`.

It must carry, at minimum:

- **The main flow as one chain:** idea → `grill-to-prd` → `prd-to-screens` → `/idea-to-loop`
  (S0–S2) → `auto-loop-bootstrap` (writes `.loop/state.json` S2→S3 itself, no separate flip)
  → `autonomous-build-loop` → `graduation-gate` → `/archive-loop-scaffolding`.
- **On-ramps:** existing repo with no `.loop/` → `auto-loop-bootstrap`; PRD written elsewhere
  → `prd-to-screens`; generic-looking mockups → `screen-design-loop`; work already sliced into
  PRs → `orchestrated-delivery`.
- **Anti-routing rules** — the rules that stop the two confusable triples mis-firing:
  - *The bootstrap triple is settled by one file, not taste.* Read `.loop/state.json`: absent
    and no repo → `/idea-to-loop`; absent but a repo exists → `auto-loop-bootstrap`;
    `"stage": "S3"` → `autonomous-build-loop`.
  - *Starting from an idea, type only `/idea-to-loop`* — it invokes `grill-to-prd` at S0 and
    calls `auto-loop-bootstrap` at the S2 exit gate itself.
  - *The design triple is settled by what you are holding.* A PRD → `prd-to-screens`.
    Mockups in `docs/screens/html/` → `screen-design-loop`. Screenshots of someone else's
    shipped app → `/screenshot-to-replica`.
  - *"Copy this app's design" almost always means borrow the vibe* — that is
    `screen-design-loop` with a Mobbin query, not a multi-hour pixel replica.
  - *Run one shipper per tree.* If `.loop/state.json` exists, the loop owns that repo and
    `orchestrated-delivery` only ever arrives as a delegate.
  - *`workflow-runtime` is read, never run.*
  - *Open `/loop-supervisor` yourself, in a second window* — the loop never invokes it.
  - *`/which-skill` routes this repo's unattended build system; `/ask-matt` routes the
    human-present flow.* Name the other in one line. (Both are installed on this machine.)

- [ ] **Step 3: Smoke-test the flips** — open a fresh session and confirm none of the 7 fire
  autonomously, and that each still runs when typed.

---

### Task 3: Tighten the 11 surviving descriptions

Do this **after** Task 2 — it is the only task with mis-trigger risk.

- [ ] **Step 1: Apply the 11 rewritten descriptions** from the table above.
- [ ] **Step 2: Verify the flagship still fires cold.** Open a fresh session on a repo
  containing `.loop/state.json` and confirm `autonomous-build-loop` fires unprompted at
  193 chars. This is the repo's load-bearing behaviour; when it breaks, the loop simply does
  not resume overnight and nothing reports it.
- [ ] **Step 3: Cut `fleet-registry` and `cto-governance-spine` to identity only.** Nobody
  types "fleet registry" or "may the CTO do this unsupervised" — both fire only when a sibling
  names them, and a caller invoking by name never reads your trigger branches. Those branches
  are pure dead load (~173→85, ~170→65).

---

### Task 4: Rename `mobbin-replica` → `screenshot-to-replica`

The only rename the doctrine earns. It puts the skill on the naming rule — **name the artifact
you end up with, in the words you'd use asking for it** — because its output is a replica and
Mobbin is only one of two input sources (the skill itself calls user-supplied screenshots the
best-fidelity path). It also dissolves the Mobbin-shaped false affinity with
`screen-design-loop` that the router otherwise spends a rule undoing.

- [ ] **Step 1:** `git mv mobbin-replica screenshot-to-replica`, update `name:` in frontmatter.
- [ ] **Step 2:** Update the 2 in-repo references, `README.md`, and `/which-skill`.
- [ ] **Step 3:** `rm -rf ~/.claude/skills/mobbin-replica`, re-link under the new name.
- [ ] **Step 4:** `./scripts/build.sh` and commit the refreshed `dist/` in the same commit,
  or the stale package keeps firing under the old name alongside the new one.

---

### Task 5: Prune sediment, negations, and restatements

Per-skill findings are in the audit; the recurring patterns:

- [ ] **Step 1: Delete stale `Phase N` sediment in `grill-to-prd`** — all three question banks
  and all three PRD templates reference "Phase 1 context summary" / "Phase 3" / "Phase 5";
  `SKILL.md` contains the word "Phase" zero times. Left behind by the lean rewrite (PR #52).
- [ ] **Step 2: Delete the orphan PRD template** `idea-to-loop/assets/templates/docs/PRD.md`
  (28 lines) — nothing points at it, and `grill-to-prd` owns three lane templates totalling
  441 lines. Two sources of truth for PRD shape.
- [ ] **Step 3: Lift the shared grill protocol one rung.** The three question banks each repeat
  a near-identical "How to use" + "Default behaviours" block — same meaning written three
  times. Inline it once in `SKILL.md` (or one `references/grill-protocol.md`) and leave each
  bank as pure per-lane questions plus its exit checklist. Keep the per-lane split: one lane
  fires per run, so that disclosure is correct.
- [ ] **Step 4: Re-prompt negations as the positive.** Steering by prohibition drags the
  forbidden behaviour into context. E.g. "The grill is inline and interactive — no subagents
  for the interview itself" → "run the interview inline, in this conversation"; "return
  control, never invoke downstream skills yourself" → "return control to the caller".
- [ ] **Step 5: Collapse restatements into leading words.** `grill-to-prd` states
  "quote, don't paraphrase" at five sites → **verbatim**. `architecture-evolution-timelapse`
  spells out "no install, dev server, secrets, browser, ffmpeg, network" twice → **read-only**.
- [ ] **Step 6: Replace the deep cross-reference** `idea-to-loop/SKILL.md:41` →
  `autonomous-build-loop/references/lifecycle-stages.md` with `/skill`-style prose invocation.
  Repo convention (and Pocock's): shared reference lives inside the skill that owns it; other
  skills reach it by invoking the skill, not by linking across folders.

---

### Task 6: Take the fleet cluster off the context budget

- [ ] **Step 1: Leave all four model-invoked** (see the note above — two of them have
  unattended triggers and a flip would break them).
- [ ] **Step 2: Uninstall the cluster** by switching to the `solo` profile. Cost → 0.
- [ ] **Step 3: Write the re-enable condition into `fleet/` docs and `/which-skill`:**
  re-install the `fleet` profile when `graduation-gate` has its first app to enroll.
- [ ] **Step 4: Note the `archive-loop-scaffolding` flip-back trigger.**
  `docs/cto-system-design.md:112` sketches `graduation-gate` calling it non-interactively.
  If that ships, it must flip back to model-invoked **and** grow a non-interactive mode it does
  not have today (its current contract waits for an explicit yes per file). Record this in the
  skill and the design doc so it is a known one-line change, not a mystery next year.

---

### Task 7 (later, optional): Fill the two high-severity capability gaps

From the overlap analysis — the two holes that sit directly under the most autonomous
machinery in the repo:

- [ ] **Debugging.** There is no diagnosis skill at all; the loop's entire answer to a hard
  defect is a `logs/blocks.md` entry and move to the next non-conflicting item. Pocock's
  `diagnosing-bugs` is installed here already — the cheapest fix is for
  `autonomous-build-loop` and `orchestrated-delivery` to *invoke it by name* rather than
  writing a new one.
- [ ] **Test authoring.** `fitness-functions` measures coverage; nothing in the repo says what
  a good test is. Same move: invoke Pocock's `tdd`.

This is the composition pattern the repo already uses (`idea-to-loop` invokes `prototype`),
and it costs two prose lines rather than two new skills.

---

## What this plan does not do, and why

- **No splits.** You asked about breaking skills into smaller ones; the doctrine earns
  **zero** splits here. A split must be paid for by one of the two loads, and neither
  justification applies: no skill's post-completion steps are causing it to rush the step in
  front of it, and no carve-out has a distinct trigger word you actually type. The repo's
  problem is invocation and pointer discipline, not granularity.
- **No merges, no deletions.** Every skill keeps its logic. `architecture-evolution-timelapse`
  and `frontend-evolution-timelapse` stay separate — once both are user-only they cost nothing,
  and their preconditions are opposites (one needs a dev server and secrets, one needs a
  read-only tree). Merging would spend cognitive load to save nothing.
- **Only one rename.** 17 of 18 names already state the artifact you end up with. Renaming
  the rest would be churn against `mission-control`'s 8 referencing files for no legibility gain.

---

## Risks

- **A tightened description stops firing, silently.** `autonomous-build-loop` at 193 chars must
  still fire on a cold session that finds `.loop/state.json`. Mitigation: Task 3 Step 2 is a
  real cold-session test, not a code read; keep filesystem triggers, cut only synonyms.
- **Seven skills leave the agent's reach at once.** A skill you forget is a skill you don't
  have. Mitigation: the router ships in the same commit, never as a follow-up.
- **Two routers on one machine.** `/ask-matt` is already installed. Mitigation: each router
  names the other in one line. If the two sets keep converging, one router over both beats two.
- **Rename + stale `dist/` produces duplicates.** Mitigation: Task 1 (symlinks) before Task 4
  (rename), and rebuild `dist/` in the same commit.
- **The router becomes load-bearing.** Once `fitness-functions` and the timelapses stop
  advertising themselves, one file stands between you and forgetting they exist. Mitigation:
  update `/which-skill` in the same PR as any skill add, rename, or flip.
