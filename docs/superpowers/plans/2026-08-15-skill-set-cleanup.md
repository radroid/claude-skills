# Skill-set Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

> **Revision 2 (2026-08-15).** Revised after a three-lens review panel (harness mechanics, call graph, doctrine) verified the first draft against the repo, `~/.claude/skills`, and the live `mission-control` orchestrator. Changes from v1: `idea-to-loop` stays model-invoked (mission-control invokes it by name), the rename moves first, `install.sh` gets acceptance criteria, `dist/` is rebuilt for every source change and orphans are pruned, human-only verification is replaced by a headless probe, and two live dead reaches into user-only Pocock skills are repaired. Original text is in git history (`5a67b01`).

**Goal:** Cut the repo's permanent context cost by ~78% and make the set legible enough to use daily, by applying Matt Pocock's authoring doctrine (`writing-for-agents` + `SKILL-MECHANICS.md` + his `.agents/invocation.md`) — invocation as a deliberate trade, one router to carry the cognitive load, descriptions written as context pointers, and pruning.

**Architecture:** No new machinery beyond a small install script and a checker. The work is frontmatter, descriptions, one rename, one new router skill, and fixing an install substrate that is currently broken in three ways. Every skill keeps its logic; nothing is deleted.

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
2. **`workflow-runtime` is pointed at by two skills mid-task and is not on this machine.**
   `autonomous-build-loop/SKILL.md:61` and `orchestrated-delivery/SKILL.md:69-72` instruct the
   agent to read it before editing their Workflow scripts (`fleet-registry/SKILL.md:32` and the
   fleet `references/boundaries.md` files cite it as precedent). Those pointers dangle today, on
   exactly the files where getting the Workflow contract wrong means a script that will not
   parse or resume.
3. **Five skills are installed as directory copies, not symlinks** —
   `cto-governance-spine`, `fleet-maintenance`, `fleet-registry`, `graduation-gate`,
   `mobbin-replica`. Content is currently identical (only `.DS_Store` differs), so
   nothing is broken *yet* — but every edit in this plan would silently fail to apply
   to those five. `README.md`'s Option B `SKILLS=` list is also stale: 15 names for 18 skills.

Two more, found by the review panel:

4. **Two live dead reaches.** `autonomous-build-loop/SKILL.md:44` invokes
   `improve-codebase-architecture` and `auto-loop-bootstrap/SKILL.md:40` (plus the scaffolded
   `assets/templates/PLAN.md:35`) invoke `grill-me` / `improve-codebase-architecture` via the
   Skill tool. Upstream `mattpocock/skills` made both `disable-model-invocation: true` on
   2026-05-31; the Skill tool now refuses them ("cannot be used with Skill tool ... reserved for
   explicit user invocation"). The loop's phase-boundary arch pass has been silently failing.
5. **A second live repo depends on this one.** `~/Documents/mission-control` (the autonomous
   orchestrator; two apps drafted, `mindmark` awaiting S0 sign-off) invokes `idea-to-loop` by
   name from an agent (`bin/spawn-app.md:46,73`), defers gated decisions to the
   `cto-governance-spine` skill by name (`CLAUDE.md:37`), and preflights presence of eight
   skills in `~/.claude/skills/` (`bin/verify-skills.md`). Anything that flips or uninstalls
   those must be reconciled against it.

---

## The end state

- **12 model-invoked** (the agent can reach them, or a sibling / mission-control must) — ~1,990 chars; the 8 on the `solo` profile ≈ 1,390 chars.
- **6 user-only** (`disable-model-invocation: true`) — 0 chars, reached by typing the name.
- **1 new router**, `/which-skill`, user-invoked — 0 chars.
- **Two install profiles**: `solo` (15 links: 8 model-invoked non-fleet + 6 user-only + the router) and `fleet` (19: solo + the 4 fleet skills). Default `solo`.

**Always-loaded budget: 1,568 → ~350 tokens on the solo profile (~78% cut).**
All 18 skills stay on disk and stay reachable.

---

## Global Constraints

- **The router ships in the same commit as the flips.** Flipping trades context load for
  cognitive load; the router is what pays that bill. Ship them apart and there is a window
  where `/archive-loop-scaffolding` — zero callers repo-wide — is effectively deleted.
- **Fix the install substrate before any content edit (Tasks 1–2 before 3–6).** Five skills
  are copies; edits to the source will not reach them. Do this before anything else or you
  ship the work, measure no change, and have nothing to debug.
- **Any skill mission-control reaches by name stays model-invoked**: `grill-to-prd`,
  `idea-to-loop`, `auto-loop-bootstrap`, `autonomous-build-loop`, `cto-governance-spine`
  (`mission-control/CLAUDE.md:37`, `bin/spawn-app.md`, `bin/verify-skills.md`). A user-only
  skill cannot be invoked by the Skill tool from any agent, in any repo.
- **Never name a user-only skill in a model-invoked description.** A model-facing pointer
  must not send the model to a skill it cannot invoke. Any anti-routing rule whose two sides
  are BOTH model-invoked must also exist as one clause in a model-facing description; the
  router is user-invoked and can only hint.
- **Keep every filesystem trigger that is the only evidence of a state.** `.loop/state.json`,
  `logs/iter-NNN.md`, `docs/screens/html/` fire with *no human in the room* — keep them. A
  bare `GOALS.md` is a false-positive trigger (plenty of repos have one and no loop) and is
  deliberately dropped. Cut synonyms and false positives; never silently cut a load-bearing path.
- **No `agents/openai.yaml` in this repo** — unlike Pocock's, there is no second harness
  policy block to keep in sync. A flip really is one line, six times.
- **`dist/` is rebuilt (`./scripts/build.sh`) and committed in the same PR as ANY change under
  `*/SKILL.md`, `*/references/`, `*/assets/`, `*/scripts/`, or a rename/deletion** — not just
  renames. `dist/*.skill` is the documented install channel for the pinned mission-control
  consumer (`skills.lock`), so a stale package means the flips never reach a pinned install.
  `build.sh` is mtime-incremental; running it repeatedly is free. It does NOT prune orphans
  today — Task 1 adds that.
- **Verification is executable, not "restart Claude Code".** The headless probe
  `claude -p --verbose --output-format stream-json '<prompt>'` (run from a `mktemp -d`
  sandbox with `--permission-mode plan`, deleted afterwards) emits a first
  `{"type":"system","subtype":"init"}` event whose `skills` array is the loaded inventory
  (it lists user-only skills too — it proves loading, not reach), and a fired skill appears
  as a `tool_use` block `{"name":"Skill","input":{"skill":"<name>"}}`. Static gates
  (`grep -q '^disable-model-invocation: true'`, `readlink -f`) are the deterministic checks;
  the behavioural probe is corroboration. Exactly one thing stays HUMAN: confirming the
  interactive host session behaves like the headless probe.

---

## A note on the fleet cluster

Raj chose *"make user-only + move behind router"* for the four fleet skills. Two of them
can't take that flip safely, and mission-control reaches a third by name, so this plan gets
the same outcome by a different lever.

- **`fleet-registry`** is reached only by *file path* (`graduation-gate/references/enrollment.md:25`
  runs its `admission-validator.workflow.js`) and could flip; **`cto-governance-spine`** is
  reached by file path from `fleet-maintenance/references/fix-pipeline.md:21` ("Paste
  `governance.js`") **and by name from mission-control** — it must stay model-invoked.
- **`fleet-maintenance` and `graduation-gate`** have unattended triggers by design (the
  cron/webhook health sweep; auto-quarantine off a sweep's severities). A gate the human must
  remember to invoke is not a gate.

**What this plan does instead:** leave all four model-invoked with tight descriptions and
**uninstall the cluster** via the `solo` profile (Task 2). The fleet holds zero enrolled apps
today, so the cost goes to zero immediately, nothing in this repo's call graph breaks, and
re-enabling is one command when `mindmark` clears its S0 gate and reaches graduation.
mission-control's preflight will then report the four as MISSING — its own runbook already
tolerates that for a v1 spawn and hard-stops gated actions, which is the correct fail-closed
behaviour; Task 6 makes that state *expected* in mission-control's docs rather than drift.

---

## Per-skill decisions

Every skill was audited against the doctrine. **No splits were earned** — see "What this plan
does not do" below. One rename was earned.

### Flip to user-only (6) — description cost goes to zero

| Skill | Was | Why it fires only by hand | New human-facing description (trigger lists stripped) |
|---|---|---|---|
| `fitness-functions` | 917 ch | Installing a CI guardrail pipeline is a deliberate, human-gated afternoon, not something an agent should start mid-task | Design and install architectural fitness functions as a GitHub Actions CI pipeline for this repo's stack. |
| `mobbin-replica` → `screenshot-to-replica` | 667 ch | Spends a third of its description telling the model *not* to fire; git-inits a new repo and runs up to 8 capture-score-critique rounds per screen | Build a pixel-perfect, working web replica of an app from its screenshots — a local folder, or pulled from Mobbin. |
| `frontend-evolution-timelapse` | 503 ch | One-shot artifact job; a human decides they want a GIF | Build a construction-style timelapse (GIF/MP4) of a web frontend across git history. Needs a Node app with a dev server. |
| `architecture-evolution-timelapse` | 440 ch | Same — and today it cannot do what its name promises (`run`, `stitch-only`, `clean` are RESERVED and exit 2) | Build a C4 architecture-evolution timelapse of a JS/TS codebase across git history — static analysis on a read-only tree. |
| `loop-supervisor` | 235 ch | You open it yourself in a second window; the running loop coordinates with it through disk only and never invokes it | Read-only oversight of a running autonomous build loop — open in a second Claude Code window on the same repo. |
| `archive-loop-scaffolding` | 227 ch | Once per repo lifetime; its own contract waits for an explicit yes per file | Archive autonomous-build-loop scaffolding out of a repo, non-destructively, with your yes per file. |

**2,989 chars — 48% of the entire budget — deleted by one frontmatter line per file.**

**Not flipped: `idea-to-loop`** (v1 had it on this list). mission-control's spawn runbook
invokes it from an agent at the step it labels "the AFK part" (`bin/spawn-app.md:46`) and
resumes it from S1 on the human's "go" (`:73`); its preflight checks presence, not
invocability, so the flip would pass preflight and die mid-spawn after `gh repo create`.
It stays model-invoked with a tightened description (below).

### Stay model-invoked (12) — descriptions tightened 3,283 → ~1,990 ch

Final text; the implementer applies these verbatim (re-count after applying).

| Skill | Chars | Rewritten description |
|---|---|---|
| `autonomous-build-loop` | 305→~245 | Autonomous build loop — ship the backlog unattended, one bounded iteration per wake-up. Use when the user asks to keep building on its own ("/loop"), or the repo already has `.loop/state.json` or `logs/iter-NNN.md`. |
| `fleet-maintenance` | 318→207 | Health sweep over enrolled fleet apps — signals into a severity-ranked per-app backlog, then triage, gate, and delegate each fix. Covers dependency/security hygiene, incident response, and the CTO heartbeat. |
| `auto-loop-bootstrap` | 277→~185 | Make a repo loop-ready so autonomous-build-loop can take over: protocol files, backlog source, seed commit, smoke test. Use when the repo has no `.loop/state.json` yet. |
| `idea-to-loop` | 294→~175 | Greenfield build: idea → PRD → stack → runnable scaffold → autonomous-loop handoff, staged S0–S2 with human gates. Use when there is no codebase yet; for an existing repo use auto-loop-bootstrap. |
| `orchestrated-delivery` | 272→~225 | Use when shipping a multi-PR backlog through role subagents — starting a fresh run, or resuming one from the backlog's Progress line. If `.loop/state.json` exists, the loop owns that repo and this only ever arrives as a delegate. |
| `graduation-gate` | 220→164 | Graduate a built app into the maintenance fleet after a fail-closed readiness check, or work the reverse edge — quarantine on sustained sev1 sweeps, human re-admit. |
| `grill-to-prd` | 264→160 | Grill the user into a PRD at docs/PRD.md. Use when they want to be interviewed about an idea, ask for a PRD or spec, or name a Technical, Designer, or Vibe PRD. |
| `workflow-runtime` | 268→139 | Authoring Workflow scripts for the harness runner. Use when writing one against the paste-in canon, or when a script won't parse or resume. |
| `prd-to-screens` | 231→131 | Turn a PRD into approved HTML mockups. Use when a PRD exists and the user wants the UI settled before any frontend code is written. |
| `screen-design-loop` | 293→130 | Refine existing HTML mockups against real shipped-app references from Mobbin. Use on a repo that already has `docs/screens/html/`. |
| `fleet-registry` | 289→~120 | Registry record for one fleet app — read, enroll via the admission validator, retire, quarantine, reconcile drift. Holds the prod-deploy flag, lease, and last-known-good. |
| `cto-governance-spine` | 252→~110 | The fleet policy contract — the autonomous-mode-gate (may this run unsupervised?), prod-deploy HOLD rule, cost breaker, incident ladder, audit ledger. |

`fleet-registry` and `cto-governance-spine` are identity-leaning: nobody types "fleet
registry"; they fire when a sibling or mission-control names them, and a caller invoking by
name never reads trigger branches. Both keep one clause of what they hold so a reader knows
which is which.

---

### Task 1: Rename `mobbin-replica` → `screenshot-to-replica`; give `build.sh` an orphan prune

The only rename the doctrine earns. It puts the skill on the naming rule — **name the artifact
you end up with, in the words you'd use asking for it** — because its output is a replica and
Mobbin is only one of two input sources (the skill itself calls user-supplied screenshots the
best-fidelity path). It also dissolves the Mobbin-shaped false affinity with
`screen-design-loop` that the router otherwise spends a rule undoing. Doing it first means
every later artifact (install script, router, README) is written once with the final name.

**Files:**
- Rename: `mobbin-replica/` → `screenshot-to-replica/` (`git mv`)
- Modify: `screenshot-to-replica/SKILL.md` (`name:`, the H1, the `/mobbin-replica` token in the description — the full description rewrite happens in Task 3), `README.md` (table row `:18`, source-tree `:257`, dist-tree `:276`), `scripts/build.sh`
- Delete: `dist/mobbin-replica.skill`; Create: `dist/screenshot-to-replica.skill`
- Leave untouched: `docs/superpowers/plans/2026-07-18-mobbin-replica.md`, `docs/superpowers/specs/2026-07-18-mobbin-replica-design.md` (dated history)

- [ ] **Step 1:** `git mv mobbin-replica screenshot-to-replica`; set `name: screenshot-to-replica`; update the H1; grep the skill's own `scripts/` and `references/` for its old name and update self-references (leave `mobbin-fetch.mjs`'s *filename* — it names the Mobbin source, which is still true).
- [ ] **Step 2:** Update the three `README.md` references.
- [ ] **Step 3:** `rm -rf ~/.claude/skills/mobbin-replica` (it is a directory copy today and would keep firing under the old name) and `ln -sfn "$PWD/screenshot-to-replica" ~/.claude/skills/screenshot-to-replica`.
- [ ] **Step 4:** Add an orphan prune to `scripts/build.sh`: after the build loop, for each `dist/<n>.skill` with no `<n>/SKILL.md`, `rm -f` it and print `  pruned <n>.skill (no source dir)`. Then `git rm dist/mobbin-replica.skill && ./scripts/build.sh && git add dist/screenshot-to-replica.skill`. Verify: `test ! -e dist/mobbin-replica.skill && test -f dist/screenshot-to-replica.skill`, and `unzip -l dist/screenshot-to-replica.skill | grep -c 'screenshot-to-replica/SKILL.md'` is 1.
- [ ] **Step 5:** `grep -rn mobbin-replica . --exclude-dir=.git --exclude-dir=dist | grep -v docs/superpowers` returns only this plan.

---

### Task 2: Fix the install substrate

Nothing else in this plan lands until this does. Four skills are copies that ignore source
edits; four are missing; two dangling pointers are live.

**Files:**
- Create: `scripts/install.sh`, `scripts/check-skills.sh`
- Modify: `README.md` (Install section — profiles, and the stale Option B list; the "15 skills" count at `:90`)

- [ ] **Step 1: Write `scripts/install.sh`** to these acceptance criteria:
  1. **Ownership by name.** `OWNED` = basenames of every `$REPO_ROOT/*/` containing a `SKILL.md`. The script may create, replace, or remove an entry in `~/.claude/skills/` only if its basename is in `OWNED`. Every other entry is untouchable — no scan, no prune, no `rm`. (This protects the ~104 foreign entries and the 3 foreign directories `evaluator-loop`, `sandbox-sdk`, `typeform-mobile-form`.)
  2. **Profiles derived from discovery.** One hard-coded array `FLEET=(cto-governance-spine fleet-maintenance fleet-registry graduation-gate)`; `fleet` = `OWNED`, `solo` = `OWNED − FLEET`. A new skill dir is in `solo` the moment it exists. `exit 1` if any `FLEET` name has no source dir.
  3. **Refuse to clobber a surprise.** For a name in `OWNED`: existing entry is a symlink into `$REPO_ROOT` → replace (idempotent); a symlink pointing *outside* `$REPO_ROOT` → print the target and `exit 1`; a plain directory → replace and log the replacement (this is the copy-install repair; `--force` is not needed because ownership is by name, but log it loudly).
  4. **Profile switch removes only owned names not in the profile** (`solo` unlinks the four fleet entries if they are our symlinks or plain dirs; foreign entries never touched).
  5. **Idempotent and previewable.** Re-running the same profile changes nothing; `--dry-run` prints the link/unlink plan and touches nothing; `--list` prints every owned skill with its invocation mode (`model` / `user`), description char count, and the always-loaded total per profile (model-invoked only) — the number this whole plan exists to cut.
  6. Usage: `scripts/install.sh [solo|fleet] [--dry-run] [--list]`, default `solo`, `set -euo pipefail`, no dependencies beyond bash/coreutils/readlink. Comment on the `FLEET` array: "installed only on the `fleet` profile; re-install when `graduation-gate` has its first app to enroll."
- [ ] **Step 2: Write `scripts/check-skills.sh`** — the durable guard for pointer discipline: (a) every `*/SKILL.md` has `name:` equal to its directory; (b) every `dist/*.skill` has a source dir and vice-versa; (c) for the cross-repo skills this repo invokes by name (`grilling`, `codebase-design`, `prototype`, plus any listed in a `CROSS_REPO=` array), warn if not installed at `~/.claude/skills/<n>` and **fail** if installed but carrying `disable-model-invocation: true` — so the next upstream flip fails loudly instead of silently (see defect 4). Exit non-zero on any failure. (`prototype` is invoked by `idea-to-loop` at S0; `grilling` and `codebase-design` become targets in Task 5.)
- [ ] **Step 3: Run it.** `scripts/install.sh fleet` (all 18 incl. `screenshot-to-replica`; the router does not exist yet and is not in `OWNED`, so nothing dangles). This converts the four remaining copies to symlinks and installs `workflow-runtime`, `screen-design-loop`, `fitness-functions`, `architecture-evolution-timelapse`. Then `scripts/install.sh fleet` again → no changes.
- [ ] **Step 4: Fix `README.md`.** Replace the "link every skill" loop (`:100-105`) with `scripts/install.sh solo|fleet` and a two-line profile explanation (incl. the fleet re-enable condition); regenerate the Option B `SKILLS=` list from `ls -d */SKILL.md` (18 today, 19 after Task 3 adds the router — Task 3 updates it again); fix the "15 skills" count at `:90`.
- [ ] **Step 5: Verify (executable).** `FOREIGN` = `ls ~/.claude/skills | wc -l` minus owned names present — assert unchanged before/after; `ls -la ~/.claude/skills | grep -c 'Documents/claude-skills'` is 18 on `fleet` (19 once Task 3 adds the router); `find ~/.claude/skills -maxdepth 1 -type d` still lists the three foreign directories; every owned entry `readlink -f`s under `$REPO_ROOT`; `scripts/check-skills.sh` passes (it will WARN on `grilling`/`codebase-design` reaches not yet written — fine). Headless load check: from the repo root, `claude -p --verbose --output-format stream-json 'reply with the single word ok'` in a `mktemp -d` — parse the init event's `skills` array and assert every owned skill name is present.

---

### Task 3: Flip 6 skills to user-only, and ship the router in the same commit

**Files:**
- Modify: 6 × `SKILL.md` frontmatter (`disable-model-invocation: true` + the human-facing description from the table above)
- Create: `which-skill/SKILL.md`
- Modify: `auto-loop-bootstrap/SKILL.md:55` (the `loop-supervisor` recommendation — it addresses the human already; make it say "open `/loop-supervisor` in a second window"), `cto-governance-spine/SKILL.md:25` (boundary statement — fine as prose; ensure it does not read as an invocation), `README.md` (skills table gains an **Invocation** column or is regrouped User-invoked / Model-invoked per Pocock's `invocation.md`; router row; Option B list gains `which-skill`)

- [ ] **Step 1: Capture the six skills' current trigger phrases** to `.superpowers/sdd/<plan>/old-triggers.txt` (needed for the negative probe in Step 4 — Step 2 deletes them).
- [ ] **Step 2: Flip.** Add `disable-model-invocation: true` and the one-line human-facing description to each of the 6. Re-aim the two prose sites.
- [ ] **Step 3: Write `which-skill/SKILL.md`** — user-invoked (`disable-model-invocation: true`, description "Ask which skill or flow in this repo fits your situation. A router over the claude-skills set."), modelled on Pocock's `ask-matt`. It must carry, at minimum:
  - **The main flow as one chain:** idea → `grill-to-prd` → `prd-to-screens` → `idea-to-loop`
    (S0–S2; it invokes `grill-to-prd` at S0 and `auto-loop-bootstrap` at the S2 exit gate itself)
    → `autonomous-build-loop` → `graduation-gate` → `/archive-loop-scaffolding`.
  - **On-ramps:** existing repo with no `.loop/` → `auto-loop-bootstrap`; PRD written elsewhere
    → `prd-to-screens`; generic-looking mockups → `screen-design-loop`; work already sliced into
    PRs → `orchestrated-delivery`.
  - **Standalone (off every flow, user-invoked):** `/fitness-functions`; `/frontend-evolution-timelapse`
    (needs a Node app with a dev server); `/architecture-evolution-timelapse` (read-only JS/TS
    tree via `init | extract | render`; the single-command `run` is not built yet);
    `/screenshot-to-replica`; `/loop-supervisor`; `/archive-loop-scaffolding`.
    **Completion criterion: every one of the 6 flipped skills is named in the router.**
  - **Anti-routing rules** — the rules that stop the two confusable triples mis-firing:
    - *The bootstrap triple is settled by one file, not taste.* Read `.loop/state.json`: absent
      and no repo → `idea-to-loop`; absent but a repo exists → `auto-loop-bootstrap`;
      `"stage": "S3"` → `autonomous-build-loop`.
    - *Starting from an idea, ask for `idea-to-loop` only* — it runs `grill-to-prd` at S0 and
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
      human-present flow.* One-way pointer only — `ask-matt` lives in the vendored
      `mattpocock/skills` clone and cannot carry a reverse pointer.
  - **The fleet line:** the four fleet skills (`fleet-registry`, `cto-governance-spine`,
    `fleet-maintenance`, `graduation-gate`) are installed only on the `fleet` profile —
    `scripts/install.sh fleet` when `graduation-gate` has its first app to enroll. This is
    the human's reminder; mission-control's preflight is the orchestrator's.
  - **A note that user-only skills may not appear in `/skills`** — the filesystem
    (`ls ~/.claude/skills/<name>`) is the check.
- [ ] **Step 4: Verify (executable).** Static: `grep -q '^disable-model-invocation: true'` in each of the 6 + the router; `readlink -f ~/.claude/skills/<n>` resolves under the repo for all 7 (run `scripts/install.sh fleet` again to link the router). Behavioural (corroboration): for each of the 6, replay one captured trigger phrase through the sandboxed headless probe and assert no `Skill` block naming that skill; note a single negative sample is weak evidence — the static gate is the deterministic one. Confirm each still runs when typed: `claude -p --verbose --output-format stream-json '/which-skill'` in the sandbox produces the router's content (one sample).

---

### Task 4: Tighten the 12 surviving descriptions

Do this **after** Task 3 — it is the only task with mis-trigger risk.

- [ ] **Step 1: Apply the 12 rewritten descriptions** from the table above, verbatim. Re-count and record the per-skill and solo-profile totals (`scripts/install.sh --list`).
- [ ] **Step 2: Verify the flagship still fires cold (executable).** In a `mktemp -d`: `git init`, seed `.loop/state.json` (`{"stage":"S3","iter":3}`), run `claude -p --verbose --output-format stream-json --permission-mode plan 'continue'` and assert a `tool_use` `{"name":"Skill","input":{"skill":"autonomous-build-loop"}}` block appears. Second case: `logs/iter-003.md` present, no `.loop/state.json` — same assertion. Negative guards: on the seeded repo, "make this repo loopable" reaches `autonomous-build-loop`, not `auto-loop-bootstrap`; "ship this multi-PR backlog with subagents" does not start `orchestrated-delivery`. Delete the sandbox afterwards. This is the repo's load-bearing behaviour; when it breaks, the loop simply does not resume overnight and nothing reports it. **HUMAN (the one remaining):** open one interactive session on such a repo and confirm it matches the probe.

---

### Task 5: Prune sediment, negations, restatements — and repair the dead reaches

Per-skill findings are in the audit; the recurring patterns:

- [ ] **Step 1: Delete stale `Phase N` sediment in `grill-to-prd`.** Retitle the three banks (drop the "Phase 3 —" prefix); at `question-bank-technical.md:9,97` and `question-bank-designer.md:10,100` replace "Phase 1 context summary" → "context summary" and "Phase 5 review" → "the sign-off review"; in all three `assets/templates/PRD-*.md` relabel the appendix field to `Context summary: {{CONTEXT_SUMMARY}}` — **keep the field**. `SKILL.md` contains the word "Phase" zero times already. Left behind by the lean rewrite (PR #52).
- [ ] **Step 2: Delete the orphan PRD template** `idea-to-loop/assets/templates/docs/PRD.md`
  (28 lines) — nothing points at it (`idea-to-loop/SKILL.md:39-40` targets only the decision-log
  template), and `grill-to-prd` owns three lane templates totalling 441 lines. Two sources of
  truth for PRD shape.
- [ ] **Step 3: Delete from the banks only what `SKILL.md` already owns; keep every lane-specific bullet.** The banks are NOT near-identical (v1 overstated this): vibe asks one question per turn, technical/designer 1–2; vibe's "quote verbatim" and designer's Figma handling are lane-specific and stay. Delete: exit-checklist-is-the-goal (`technical.md:10`, `designer.md:11`, `vibe.md:12` — owned by `SKILL.md:30-31`); skip-what's-already-answered (`technical.md:9`, `designer.md:10` — carry designer's "or in attached design files" clause into `SKILL.md`); the link-verbatim default duplicated at `designer.md:105` / `vibe.md:91` (keep once). Do **not** create `references/grill-protocol.md`. Reconcile `SKILL.md:29` "a few questions per turn" with the lanes' own cadence (say "at the lane's cadence").
- [ ] **Step 4: Re-prompt negations as the positive.** Steering by prohibition drags the
  forbidden behaviour into context. E.g. "The grill is inline and interactive — no subagents
  for the interview itself" → "run the interview inline, in this conversation"; "return
  control, never invoke downstream skills yourself" → "return control to the caller". Sweep
  `grill-to-prd`, `idea-to-loop`, `auto-loop-bootstrap`, `autonomous-build-loop` SKILL.md files;
  leave safety prohibitions that name a specific dangerous command (e.g. "no force-push") alone.
- [ ] **Step 5: Collapse restatements into leading words.** `grill-to-prd` restates
  quote-not-paraphrase at ~11 sites (`SKILL.md:19,39,41`; `question-bank-designer.md:104,105`;
  `question-bank-vibe.md:9,86,90,91,93`; `PRD-vibe.md:5`). Keep it once in `SKILL.md`'s
  Contracts as **verbatim**, keep the vibe bank's single lane-defining statement ("their voice
  is the spec"), and delete the rest; leave `PRD-vibe.md`'s structural uses (the template's
  own quoted-block instructions). `architecture-evolution-timelapse` spells out "no install,
  dev server, secrets, browser, ffmpeg, network" twice → **read-only** (once, in the body; the
  description is now the one-liner from Task 3).
- [ ] **Step 6: Disambiguate the `lifecycle-stages.md` pointer — keep it a file read.**
  `idea-to-loop/SKILL.md:41-42` points at `autonomous-build-loop/references/lifecycle-stages.md`.
  Pocock's `.agents/invocation.md` would express shared reference as `/skill`-style prose
  invocation, but that rule is written for reference-only skills; `autonomous-build-loop` is a
  runner whose contract starts an iteration. Reword to: "Canonical stage definitions: read the
  file `autonomous-build-loop/references/lifecycle-stages.md` directly." Record the exception
  here: prose invocation applies to reference-only skills; a runner's reference is read by path.
- [ ] **Step 7: Repoint the dead cross-repo reaches at model-invocable siblings** (defect 4):
  - `autonomous-build-loop/SKILL.md:44-45` — the phase-boundary arch pass: invoke `codebase-design`
    (model-invocable; "...or when another skill needs the deep-module vocabulary") and run the
    deepening survey yourself against that vocabulary, logging candidates to the backlog. Do
    **not** re-aim at the human — the phase boundary fires unattended, and
    `improve-codebase-architecture` is now interactive by design (HTML report + grill), which is
    why upstream flipped it.
  - `auto-loop-bootstrap/assets/templates/PLAN.md:35` — same retarget. **Priority instance**: it
    is scaffolded into every bootstrapped repo with MUST.
  - `auto-loop-bootstrap/SKILL.md:39-40` — invoke `grilling`, not `grill-me` (`grill-me`'s body is
    "Run a `/grilling` session"; `grilling` is model-invocable).
  - `README.md:19,161` mirror the old wording ("Invokes `grill-me`") — update.
  - **Each cross-repo reach gets an inline fallback clause** — "if `<skill>` is not installed,
    <two-line inline equivalent>" — matching the convention at `docs/grill-to-prd-validation.md:173`
    and `docs/m2-validation.md:121`. `mattpocock/skills` is a third-party repo present only on
    this machine; claude-skills is distributed via `dist/`.
  - Add `grilling codebase-design prototype` to `scripts/check-skills.sh`'s `CROSS_REPO=` array
    (Task 2 already lists them; confirm the check now passes green, not WARN).

---

### Task 6: Take the fleet cluster off the context budget; finalize

- [ ] **Step 1: Leave all four model-invoked** (see the note above — two have unattended
  triggers and mission-control reaches `cto-governance-spine` by name).
- [ ] **Step 2: Uninstall the cluster** by switching this machine to the `solo` profile:
  `scripts/install.sh solo`. Verify 15 links to this repo, the four fleet entries gone,
  `FOREIGN` unchanged, `scripts/install.sh --list` shows the solo always-loaded total.
- [ ] **Step 3: Record the re-enable condition** — re-install the `fleet` profile when
  `graduation-gate` has its first app to enroll — in three in-repo places: `README.md`'s
  Install/profiles section, the `FLEET` comment in `scripts/install.sh`, and `/which-skill`
  (Task 3 already did the last two; confirm).
- [ ] **Step 4: Note the `archive-loop-scaffolding` flip-back trigger.**
  `docs/cto-system-design.md:112` sketches `graduation-gate` calling it non-interactively.
  If that ships, it must flip back to model-invoked **and** grow a non-interactive mode it does
  not have today (its current contract waits for an explicit yes per file). Record this as one
  line in `archive-loop-scaffolding/SKILL.md` and beside the design-doc row, so it is a known
  one-line change, not a mystery next year.
- [ ] **Step 5: mission-control companion (cross-repo, local branch, NOT pushed).** In
  `~/Documents/mission-control`, on a new branch `chore/skills-solo-profile` off `main`:
  - `bin/verify-skills.md`: retitle "Governance + graduation skills" → "Governance + graduation
    skills (installed only on claude-skills' `fleet` profile)"; amend the MISSING branch to
    say absent-under-`solo` is EXPECTED, not drift, and means gated actions (prod deploy,
    auto-approve, graduation) are unavailable; state the re-enable trigger ("when an app
    reaches graduation") and give the restore in **pinned-ref terms** (extract the four
    `dist/*.skill` from `claude-skills@<skills.lock ref>`, or symlink a detached checkout of
    that ref) — `skills.lock` forbids linking an unpinned live tree.
  - `skills.lock`: add `profile: solo` beside the pinned ref.
  - `CLAUDE.md:21-22`: qualify "ESCALATE" so it fires on a *spawn-path* skill missing, not on
    the governance four under `solo`.
  - Commit; switch mission-control back to `main`; report the branch for Raj to review/merge.
    Also note for Raj: `skills.lock`'s `claude-skills-ref` must be bumped to the merge SHA of
    this PR (its bump-procedure) — that SHA is unknowable here.
- [ ] **Step 6: Final `dist/` rebuild.** `./scripts/build.sh` (incremental) — every skill
  touched in Tasks 1–6 repackages; `which-skill.skill` is created; assert `ls dist/*.skill |
  wc -l` == `ls -d */SKILL.md | wc -l` (19) and `unzip -l dist/grill-to-prd.skill` shows no
  `Phase` sediment (`unzip -p ... | grep -c 'Phase '` is 0). Commit `dist/`.
- [ ] **Step 7: Final gates.** `scripts/check-skills.sh` green; `scripts/install.sh --list`
  totals recorded in the PR body (before/after budget); the Task 4 Step 2 probe re-run once
  against the final tree.

---

### Task 7 (deferred — not executed in this run): Fill the two high-severity capability gaps

From the overlap analysis — the two holes that sit directly under the most autonomous
machinery in the repo. Deferred because wiring a diagnosis loop into the loop runtime needs a
design decision the plan should not make in passing (below).

- [ ] **Debugging.** There is no diagnosis skill at all; the loop's entire answer to a hard
  defect is a `logs/blocks.md` entry and move to the next non-conflicting item. Pocock's
  `diagnosing-bugs` is installed here already and model-invocable — the cheapest fix is for
  `autonomous-build-loop` and `orchestrated-delivery` to *invoke it by name*. **Scope it:**
  invoke `diagnosing-bugs` only where the loop already spends a whole turn — a dedicated
  diagnosis iteration opened off a `logs/blocks.md` entry, not inline in a feature iteration
  — so the bounded-turn and blocks-never-halt contracts (`autonomous-build-loop/SKILL.md:27-32`)
  hold.
- [ ] **Test authoring.** `fitness-functions` measures coverage; nothing in the repo says what
  a good test is. Same move: invoke Pocock's `tdd`.
- [ ] **Before adding any cross-repo invocation:** confirm it is model-invocable
  (`grep -L disable-model-invocation`), add an inline fallback clause, and add it to
  `scripts/check-skills.sh`'s `CROSS_REPO=` array so the next upstream flip fails loudly.

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
- **No edits to mission-control beyond the Task 6 Step 5 doc note**, on a local branch for
  Raj to merge. Its runbooks already tolerate the `solo` state; the note makes it expected.

---

## Risks

- **A tightened description stops firing, silently.** `autonomous-build-loop` at ~245 chars must
  still fire on a cold session that finds `.loop/state.json`. Mitigation: Task 4 Step 2 is a
  real headless cold-session probe, not a code read; keep filesystem triggers, cut only synonyms.
- **Six skills leave the agent's reach at once.** A skill you forget is a skill you don't
  have. Mitigation: the router ships in the same commit, never as a follow-up, and names all six.
- **Two routers on one machine.** `/ask-matt` is already installed. Mitigation: `/which-skill`
  names it in one line (one-way — the clone is vendored). If the two sets keep converging, one
  router over both beats two.
- **Rename + stale `dist/` produces duplicates.** Mitigation: `git rm` the old package explicitly
  (build.sh never pruned orphans; Task 1 teaches it to) and rebuild in the same commit.
- **The router becomes load-bearing.** Once `fitness-functions` and the timelapses stop
  advertising themselves, one file stands between you and forgetting they exist. Mitigation:
  update `/which-skill` in the same PR as any skill add, rename, or flip.
- **A second live repo changes behaviour.** Switching this machine to `solo` makes
  mission-control's preflight print four MISSING lines. Its docs already tolerate that; Task 6
  Step 5 makes it expected. Any future profile change must be paired with a mission-control
  update.
- **Upstream flips a Pocock skill we invoke.** It already happened once (defect 4).
  Mitigation: `scripts/check-skills.sh` fails on it; every cross-repo reach carries an inline
  fallback.
