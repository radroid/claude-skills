# B4 — init interview + SKILL.md rewrite + references (architecture-evolution-timelapse)

Item: B4 (backlog `docs/orchestration/backlog.md:89`). Design:
`docs/superpowers/specs/2026-07-13-change-aware-timelapse-design.md:94-131` (Part 2
pipeline) + Decisions addendum `:148-162`, specifically `:150-152` (init interviews the
user; answers persist to config; `run` honors config without re-asking). Invariants in
force: **I1, I4, I6, I7, I8, I9** (backlog.md:60-75). I4 (backlog.md:66-68) is THIS
item's charter: the fields and defaults already exist (B1/B3 landed them in DEFAULTS so
`init` persists them); B4 ships the question half and the final docs.

Predecessor contracts — SPECS + live branches, not merged code (stacked-PR mode,
backlog.md:42-50; B4 branches off B3's HEAD branch and its PR targets it):

- B1 code truth on `origin/item/b1-c4-extractor-s2` (verified this run):
  - the placeholder `SKILL.md` being replaced (61 lines; sections: What this skill
    does, Two-repo model, Quick start, CLI, References);
  - `scripts/init-config.mjs` — the `--stdin-json` pipe: root must be a plain JSON
    object else exit 2 with stderr `init: invalid --stdin-json payload: root must be a
    JSON object` (init-config.mjs:37-41, probed this run); config =
    `{...DEFAULTS, ...input}` with `system_name` falling back to root `package.json`
    name then dir basename (init-config.mjs:54-60, :10-21); YAML write + idempotent
    `.gitignore` append + write-failure exit 3 (init-config.mjs:63-81). Exit codes
    {0, 2, 3}.
  - `scripts/lib/load-config.mjs` — DEFAULTS with null sentinels (`system_name`,
    `component_roots`, `import_aliases` all `null` → derive at extract time,
    load-config.mjs:10-33); missing config file ⇒ DEFAULTS + stderr notice
    `using defaults` (load-config.mjs:38-41).
  - `references/config-schema.md` — B1's 9-row table + null-sentinel paragraph +
    "Reserved field names" section that B4 must retire.
- B2 spec FROZEN at `docs/orchestration/specs/B2-mermaid-render.md`: mermaid pinned
  **exactly `11.16.0`** + committed lockfile (B2:49-55), `handDrawnSeed: 7` /
  `deterministicIds` determinism pins (B2:189-196), same-machine pixel-identity scope
  (B2:215-217), bootstrap becomes `npm ci && npx playwright install chromium`
  (B2:56-58), `render` block config rows (B2:244-250).
- B3 spec FROZEN at `docs/orchestration/specs/B3-history-walk.md`: `run` CLI contract
  §2.2 (B3:100-145) incl. exit 4 = completed-with-errors (B3:141-145); safety story —
  read-only `git archive` walk, read-only git allowlist, no installs, no lifecycle
  scripts, target code never executed (B3:91-96); collapse modes §2.8 (B3:269-292);
  `frames.json` §2.6, `cost.json` + `stitch-only` + `clean` §2.9; config additions §3
  (B3:330-344): `collapse_mode` badge default, `fps` 1, `max_hold_ms` 3500, plus
  `max_commits`, `history_mode`, `prefilter`, `annotate`, `speedthrough_frame_ms`,
  `video.gif_width`, `video.crf` — all in DEFAULTS so `init` writes them (B3 §2.1).
- B1 hostile review (PR #49): NFD/NFC unicode cross-machine determinism note flagged
  "for B3 docs" (`docs/orchestration/token-ledger.md:29`) — lands here, in
  troubleshooting.md (§2.6).

B3 executes before B4. The executor MUST reconcile this spec's file names, the
dispatcher usage text, and the config-schema rows B2/B3 already added against the
actually-landed predecessor branch before starting, and record deltas in
`## Execution notes`.

Consumers: B5 (E2E proof) follows SKILL.md's agent workflow verbatim and uses the
interview to produce 75-proof's config; the interview→`--stdin-json` mapping and the
documented CLI/exit codes are frozen for it.

## 1. Goal

Rewrite `architecture-evolution-timelapse/SKILL.md` from the B1 placeholder into the
full skill document — what the skill does, supported repos, quick start, agent
workflow — with the I4 init interview spelled out: every invocation-time option is
asked of the user at `init`, answers are piped as one JSON object to the existing
`init-config.mjs --stdin-json`, and `run` honors the persisted config without ever
re-asking. Complete `references/config-schema.md` for every field (including the
null-sentinel auto-derive semantics) and create `references/workflow.md` +
`references/troubleshooting.md`.

**Non-goals:** no changes to extractor/render/run/stitch code, scripts, dependencies,
or lockfile — this is a docs-only PR (the acceptance enforces it). No new config
fields. No interactive TTY prompt inside `init-config.mjs` (the interview is conducted
by the invoking agent in conversation; the script stays non-interactive — B1 spec
§2.1). No E2E runs (B5).

## 2. Requirements

### 2.1 Files (all inside `architecture-evolution-timelapse/`; nothing else changes)

- `SKILL.md` — rewritten (frontmatter `name` unchanged; description may be lightly
  edited but keeps the "static analysis" positioning).
- `references/config-schema.md` — completed (§2.4).
- `references/workflow.md` — NEW (§2.5).
- `references/troubleshooting.md` — NEW (§2.6).

House style: the sibling skill's docs on `origin/item/a2-dedup-engine` —
`frontend-evolution-timelapse/SKILL.md` (section vocabulary: What this skill does,
Supported repositories, Two-repo model, Quick start, Agent workflow, Trust and safety,
CLI, Output layout, Cost discipline, Resume, References, Out of scope) and its
`references/workflow.md` / `references/troubleshooting.md` (numbered stages; failure →
fix tables). Interview prose is tool-agnostic: "ask the user", never a named tool,
CLI harness, or UI.

### 2.2 SKILL.md — required content

Sections, in sibling order, adapted to this skill:

1. **What this skill does** — C4 architecture timelapse: walks git history
   (first-parent, oldest→newest), extracts a deterministic C1/C2/C3 model per commit
   by pure static analysis (no LLM in the structural path, I1), emits a frame ONLY
   when a level's canonical hash changed, renders Mermaid via the bundled Chromium,
   and stitches three independent per-level GIF/MP4 videos plus `index.html`
   (design `:104-127`). Three levels ⇒ three videos with independent change detection.
2. **Supported repositories** — table: works on JS/TS repos (Next.js, Vite, generic
   `package.json` apps, Convex backends); works READ-ONLY — no dev server, no install,
   no secrets, no network (design `:129-130`); non-JS ecosystems are not an error but
   yield a minimal person+system model (B1 spec §2.2). macOS/Linux.
3. **Two-repo model** — skill scripts bootstrap:
   `cd "$SKILL_ROOT/scripts" && npm ci && npx playwright install chromium` (B2:56-58);
   target repo holds `.arch-timelapse.yaml` + `.arch-timelapse/` only, and a
   config-less read-only target works with `--out` pointed elsewhere.
4. **Quick start** — init (with interview), `run`, open `index.html`.
5. **Agent workflow** — numbered; includes: confirm target is a git repo; bootstrap if
   needed; if no `.arch-timelapse.yaml`, conduct the init interview (§2.3) and pipe
   the answers; `run --dry-run` first and show planned commit count; during `run`
   ingest one stdout line per commit; after the run read `cost.json` and `index.html`
   paths — never read PNG binaries into context unless the user asks.
6. **`## The init interview (asked at invocation)`** — §2.3, verbatim heading.
7. **Determinism** — same tree + same config ⇒ byte-identical model/`.mmd` (I1);
   mermaid pinned exactly `11.16.0` with fixed seeds; pixel identity is same-machine
   only; videos are never byte-asserted (B2:215-217, B3 Non-goals).
8. **Trust and safety** — the walk is `git archive`-based and read-only: no checkouts,
   no worktrees, no installs, no lifecycle scripts, target-repo code is never
   executed; the only git subcommands used against the target are read-only
   (B3:91-96). Unlike the sibling skill there is NO trust flag — none is needed.
9. **CLI** — the verbatim line
   `arch-timelapse.sh init | extract | render | run | stitch-only | clean`, the `run`
   flags from B3 §2.2, and the verbatim exit-code line:
   `` `0` success, `2` usage error, `3` preflight failure, `4` completed with errors ``
   (0/2/3 from B1 SKILL.md; 4 from B3:141-145).
10. **Output layout** — `.arch-timelapse/<RUN_ID>/` tree: `commits.json`,
    `progress.json`, `frames.json`, `cost.json`, `index.html`,
    `models/<index3>_<short7>/`, `annotated/<level>/`,
    `videos/<level>.{gif,mp4}` (B3 §2.4-2.9).
11. **Cost discipline** — one stdout line per commit; read `cost.json` +
    `frames.json`, never PNGs.
12. **Resume** — re-running `run` auto-resumes the latest matching incomplete run;
    explicit `--run-id` with changed config/plan is refused with the `--fresh` remedy
    (B3 §2.2).
13. **References** — links to all three references files.
14. **Out of scope** — code-level C4 (I9, verbatim string `code-level`); cross-machine
    pixel/byte video determinism; LLM-drawn diagrams; deep extraction of non-JS
    ecosystems.

Mandated verbatim strings (acceptance greps below anchor on these): the heading
`## The init interview`, the phrase `never re-asks`, the exit-code line in item 9, the
CLI line in item 9, `git archive`, `no lifecycle scripts`, `11.16.0`, `code-level`,
`before piping` (from §2.3's validation sentence), and each of the six asked field
names in backticks.

### 2.3 The init interview (I4 — the heart of this item)

SKILL.md's interview section instructs the invoking agent, tool-agnostically. When
`init` is invoked (no `.arch-timelapse.yaml` yet, or the user asks to reconfigure),
ask the user each of the following — one compact question each, always presenting the
default so pressing "accept" is effortless:

| # | ask the user | config field | default | notes |
|---|---|---|---|---|
| 1 | System name to display on the diagrams? | `system_name` | detected: root `package.json` name, else directory basename (init-config.mjs:10-21) | show the detected value in the question |
| 2 | Which C4 levels to render — any subset of `context`, `container`, `component`? | `levels` | all three (I9: code level does not exist and is never offered) | design `:150-152` |
| 3 | Collapse mode for commits with no architecture change — `badge` (annotate "×N commits" on the held frame), `drop` (kept frames only, no badge), or `speedthrough` (each quiet commit flashes past)? | `collapse_mode` | `badge` | one-line explanation of each mode, from B3 §2.8 |
| 4 | Playback pace — frames per second? | `fps` | `1` | pacing, design `:156-158` |
| 5 | Longest hold on a single frame, in milliseconds? | `max_hold_ms` | `3500` | badge-mode holds grow with collapse count up to this cap |
| 6 | (optional) Any external services this repo talks to that static rules might miss? | `extra_externals` | `[]` | hint question; entries `{id, name, deps, env_prefixes, files, label}` appended to the built-in rule table (B1 §2.4) — skip the field entirely when the user has none |

Then assemble ONE JSON object containing the answered fields (fields where the user
accepted the default may be omitted — `init-config.mjs` spreads DEFAULTS underneath,
init-config.mjs:56-60) and pipe it:

```bash
printf '%s' '<answers-json>' | "$SKILL_ROOT/scripts/arch-timelapse.sh" init --stdin-json
```

Required surrounding prose in SKILL.md:

- **Validation sits with the interviewer**: `init-config.mjs` accepts any JSON object
  and writes it through without value validation — constrain answers to the enumerated
  values **before piping** (a typo'd level or collapse mode surfaces later as `run`'s
  exit-3 preflight, B3 §3). The JSON root must be a plain object; anything else is
  rejected with exit 2 (init-config.mjs:37-41).
- **`run` never re-asks** (I4's second half): every question above persists to
  `.arch-timelapse.yaml`; `run` honors the file and asks nothing. Re-running `init` is
  the only way answers change (and its `.gitignore` append is idempotent,
  init-config.mjs:66-75).
- **Why there is no dedup question**: unlike the sibling skill, change detection here
  is exact hash equality — there is no threshold to tune and no dedup toggle to offer
  (B1 spec §3: "Dedup threshold does not exist in this skill", B1-c4-extractor.md:276-277).
  The design addendum's dedup/threshold questions (`:150-152`) belong to the frontend
  lane's A4.
- All remaining config fields are deliberate defaults documented in
  `references/config-schema.md`, not questions — I4's field+default half.

### 2.4 references/config-schema.md — complete field table

One table covering every field, preserving B1's existing rows and semantics
(config-schema.md on b1-s2 + B2 §3 + B3 §3). Full field set (24):

`system_name`, `levels`, `component_roots`, `exclude`, `import_aliases`,
`extra_externals`, `source_extensions`, `max_file_bytes`, `output_dir` (B1 §3);
`render.width`, `render.height`, `render.margin`, `render.max_scale`, `render.theme`
(B2 §3); `collapse_mode`, `fps`, `max_hold_ms`, `max_commits`, `history_mode`,
`prefilter`, `annotate`, `speedthrough_frame_ms`, `video.gif_width`, `video.crf`
(B3 §3). Columns: field, type, default, asked-at-init?. Asked-at-init is `yes` for
exactly `system_name`, `levels`, `collapse_mode`, `fps`, `max_hold_ms`; `optional
hint` for `extra_externals`; `no` everywhere else.

Required semantics kept/added:

- The null-sentinel paragraph stays, verbatim forms `component_roots: null` and
  `import_aliases: null` = "auto-derive at extract time" (component_roots → existing
  dirs among `app`, `src/app`, `lib`, `src/lib`, `convex`; import_aliases → tsconfig
  `compilerOptions.paths` single-target entries, strict-JSON parse, fallback
  `{"@/": "./"}`) — load-config.mjs:10-33. Also note `system_name: null` in a
  hand-written config means detect-at-extract, while `init` always writes a concrete
  value (init-config.mjs:59).
- `extra_externals` entry shape `{id, name, deps, env_prefixes, files, label}`.
- The "Reserved field names" section is RETIRED (those fields are implemented as of
  B3); the phrase "reserved for later" must no longer appear. The sentence that change
  detection is hash equality (no dedup threshold) stays.
- `history_mode`: `first-parent` is the sole supported v1 value; any other ⇒ `run`
  exit 3 (B3 §3).

### 2.5 references/workflow.md — per-stage walkthrough (NEW)

Numbered stages in the sibling's workflow.md idiom: 0 bootstrap
(`npm ci && npx playwright install chromium`); 1 init — the interview (cross-reference
SKILL.md §), init flags `--out <path>` / `--stdin-json`; 2 extract (single-tree
`model.json` + `hashes.json`, read-only guarantee); 3 render (single model → `.mmd` +
fixed-canvas PNG per level; `.mmd` written before any browser work); 4 run — plan
(one `git log --first-parent` spawn) → prefilter → `git archive` temp-tree checkout →
extract → per-level hash compare vs last KEPT (I3 analogue) → render kept levels →
annotate (stitch-time, Chromium composite) → stitch per level → `index.html`;
5 `stitch-only` — re-annotate/re-stitch an existing complete run under CURRENT config
(the free pacing-tuning lever: change `collapse_mode`/`fps`/`max_hold_ms` via `init`,
then `stitch-only` — no re-walk); 6 `clean`; resume behavior; the output layout tree.
The stage-4 prose must include the string `git archive` and state that the first plan
commit is always the baseline (kept for every level) and that duplicate commits
collapse into the preceding kept frame.

### 2.6 references/troubleshooting.md — failures and their fixes (NEW)

Sibling's failure→fix table idiom. Required entries:

1. **Preflight exit 3 table** — not a git repo / zero commits; lock held (`--force`
   after checking the named pid); explicit `--run-id` with changed config or plan
   (remedy `--fresh`); unknown `collapse_mode`; `history_mode` other than
   `first-parent` (all B3 §2.2/§3).
2. **Exit 4 — completed with errors** — the run finished and videos exist, but ≥1
   commit recorded an `error` decision or a render/stitch failure; inspect
   `frames.json` error entries and `index.html`'s error list; re-runs are resumable.
3. **Chromium missing** — diagrams degrade to placeholder PNGs and annotation is
   skipped for the run with one stderr line; fix: `npx playwright install chromium`
   (verbatim); `cost.json` records `annotate` = `skipped-chromium-missing` (verbatim;
   B2 §2.7, B3 §2.7).
4. **ffmpeg missing** — models, hashes, `.mmd` files and `frames.json` all complete;
   only stitch fails (exit 4); install ffmpeg and `stitch-only` (B3 edge cases).
5. **Determinism scope + the mermaid pin** — mermaid is pinned exactly `11.16.0` with
   `handDrawnSeed` fixed (verbatim strings; default seed 0 is random per render — the
   probe fact, B2:193): never bump mermaid casually; always `npm ci` from the
   committed lockfile; template changes bump `template_version`. Pixel identity is
   same-machine only; model/hash/`.mmd` determinism is the cross-run guarantee.
6. **Unicode filenames across machines (NFD/NFC)** — from B1's hostile review
   (token-ledger.md:29): component ids and names derive from file paths; macOS
   filesystems report decomposed unicode (NFD) while Linux checkouts typically carry
   precomposed (NFC), so a repo with non-ASCII source filenames can produce different
   `model.json` bytes and different level hashes on different machines. The I1
   guarantee is same machine + same checkout. Remedies: run the whole timelapse on one
   machine (re-runs and `stitch-only` included); prefer ASCII filenames in
   `component_roots`; see `git config core.precomposeunicode` for macOS checkouts.
   Must contain the verbatim strings `NFD`, `NFC`, and `same machine`.
7. **Read-only story restated** — extraction runs no installs and **no lifecycle
   scripts** (verbatim), never executes target-repo code, and touches the target only
   through read-only git commands; there is **no trust flag** (verbatim) because
   nothing needs trusting — contrast with the sibling's `--i-trust-this-repo`
   (B3:91-96).
8. **Diagram too dense / text too small** — `component_roots` is the node-count lever;
   `render.width`/`render.height` the canvas lever (B1 risk 1, B2 risk 3).
9. **A level's video is missing** — level absent from the model or every frame failed
   (`no_frames` status in the stitch summary, B3 §2.8); check `frames.json`.

## 3. Config/schema changes

**B4 adds zero config fields.** It completes documentation for all 24 (§2.4) and ships
the questions. Consolidated asked-at-init view (the I4 closure this item delivers):

| field | type | default | asked-at-init? |
|---|---|---|---|
| `system_name` | string | detected (pkg name → dir basename) | yes (Q1) |
| `levels` | string list | `[context, container, component]` | yes (Q2) |
| `collapse_mode` | string | `badge` | yes (Q3) |
| `fps` | number | `1` | yes (Q4) |
| `max_hold_ms` | int | `3500` | yes (Q5) |
| `extra_externals` | rule list | `[]` | optional hint (Q6) |
| all 18 remaining fields | — | per B1/B2/B3 §3 tables | no (documented defaults) |

## Slices

### Slice 1 (only slice) — docs-only PR: SKILL.md + three references

Environment for all acceptance checks (zsh: export these; tools probed this run —
jq 1.6, node v26.0.0, git 2.54.0, yaml npm package 2.9.0 via the committed lockfile;
**no `yq` on this machine** — YAML assertions go through node + the scripts' own
`yaml` dependency; all YAML byte-format greps below were probe-verified against
yaml 2.9.0 output this run):

```
export REPO=<executor worktree root>
export SKILL="$REPO/architecture-evolution-timelapse"
export SCRATCH=/private/tmp/claude-501/-Users-rajdholakia-Documents-claude-skills/46feeefb-6ad0-4df2-84af-241f07b3493f/scratchpad
export BASE=<commit hash of the B3 branch HEAD this slice stacked on>
```

No live demo repo is touched by any check below (scratch fixtures only), so the
porcelain-snapshot rule does not apply to this slice.

1. **Docs-only diff**:
   `bash -c 'git -C "$REPO" diff --name-only "$BASE"..HEAD | sort | diff - <(printf "%s\n" architecture-evolution-timelapse/SKILL.md architecture-evolution-timelapse/references/config-schema.md architecture-evolution-timelapse/references/troubleshooting.md architecture-evolution-timelapse/references/workflow.md)'`
   → empty output, exit 0.
2. **Bootstrap precondition** (needed for the node+yaml asserts):
   `bash -c 'cd "$SKILL/scripts" && npm ci --silent && node -p "require(\"./node_modules/yaml/package.json\").version" | grep -E "^2\."'`
   → prints the yaml 2.x version, exit 0.
3. **Interview pipe, levels subset + non-defaults** (probe-verified end to end this
   run on the b1-s2 code):
   `bash -c 'set -euo pipefail; F="$SCRATCH/b4-init-a"; rm -rf "$F"; mkdir -p "$F"; cd "$F"; git init -q .; printf "%s" "{\"system_name\":\"demo-app\",\"levels\":[\"context\",\"container\"],\"collapse_mode\":\"drop\",\"fps\":2,\"max_hold_ms\":2000,\"extra_externals\":[{\"id\":\"stripe\",\"name\":\"Stripe\",\"deps\":[\"stripe\"],\"label\":\"processes payments via\"}]}" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json | jq -e .ok'`
   → prints `true`, exit 0.
4. **Written YAML matches the answers** (single literal command; paths expand at the
   shell):
   `cd "$SKILL/scripts" && node -e "const y=require('yaml'),f=require('fs'),a=require('assert');const c=y.parse(f.readFileSync('$SCRATCH/b4-init-a/.arch-timelapse.yaml','utf8'));a.deepStrictEqual(c.levels,['context','container']);a.strictEqual(c.collapse_mode,'drop');a.strictEqual(c.fps,2);a.strictEqual(c.max_hold_ms,2000);a.strictEqual(c.component_roots,null);a.strictEqual(c.import_aliases,null);a.strictEqual(c.extra_externals[0].id,'stripe');console.log('YAML-OK')"`
   → prints `YAML-OK`, exit 0. Raw-byte form (yaml 2.9.0 block list, probed):
   `grep -c '^  - context$' "$SCRATCH/b4-init-a/.arch-timelapse.yaml"` → `1`, and
   `bash -c '! grep -qE "^  - component$" "$SCRATCH/b4-init-a/.arch-timelapse.yaml"'`
   → exit 0 (the un-chosen level is absent).
5. **Defaults-accepted path** (`{}` pipe = user accepted every default):
   `bash -c 'set -euo pipefail; F="$SCRATCH/b4-init-b"; rm -rf "$F"; mkdir -p "$F"; cd "$F"; git init -q .; printf "%s" "{}" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json > /dev/null; grep -c "^system_name: b4-init-b$" .arch-timelapse.yaml'`
   → prints `1` (dir-basename detection, init-config.mjs:10-21,59). Then B3's
   interview defaults persisted by init (B3 §2.1/§3 — B3-dependent lines):
   `grep -c '^collapse_mode: badge$' "$SCRATCH/b4-init-b/.arch-timelapse.yaml"` → `1`;
   `grep -c '^fps: 1$' "$SCRATCH/b4-init-b/.arch-timelapse.yaml"` → `1`;
   `grep -c '^max_hold_ms: 3500$' "$SCRATCH/b4-init-b/.arch-timelapse.yaml"` → `1`;
   `grep -cE '^  - (context|container|component)$' "$SCRATCH/b4-init-b/.arch-timelapse.yaml"` → `3`.
6. **Idempotent re-init** (re-ask flow never duplicates the ignore line):
   `bash -c 'cd "$SCRATCH/b4-init-b" && printf "%s" "{}" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json > /dev/null && grep -c "^\.arch-timelapse/$" .gitignore'`
   → prints `1` (init-config.mjs:66-75, probed).
7. **Malformed payload refused with the documented remedy path**:
   `bash -c 'cd "$SCRATCH/b4-init-b" && printf "%s" "[]" | "$SKILL/scripts/arch-timelapse.sh" init --stdin-json 2> "$SCRATCH/b4-err.txt"; [ $? -eq 2 ] && grep -qF "root must be a JSON object" "$SCRATCH/b4-err.txt"'`
   → exit 0 (verbatim stderr from init-config.mjs:38, probed).
8. **SKILL.md content greps** (every string mandated in §2.2/§2.3):
   `grep -c '^## The init interview' "$SKILL/SKILL.md"` → `1`;
   `bash -c '[ "$(grep -c "Ask the user" "$SKILL/SKILL.md")" -ge 5 ]'` → exit 0 (the
   five mandatory questions, tool-agnostic phrasing);
   `grep -qF 'never re-asks' "$SKILL/SKILL.md"` → exit 0;
   `grep -qF 'init | extract | render | run | stitch-only | clean' "$SKILL/SKILL.md"` → exit 0;
   ``grep -qF -- '`0` success, `2` usage error, `3` preflight failure, `4` completed with errors' "$SKILL/SKILL.md"`` → exit 0;
   `grep -qF 'git archive' "$SKILL/SKILL.md"` → exit 0;
   `grep -qF 'no lifecycle scripts' "$SKILL/SKILL.md"` → exit 0;
   `grep -qF '11.16.0' "$SKILL/SKILL.md"` → exit 0;
   `grep -qF 'before piping' "$SKILL/SKILL.md"` → exit 0;
   `grep -qF 'code-level' "$SKILL/SKILL.md"` → exit 0;
   ``bash -c 'for f in system_name levels collapse_mode fps max_hold_ms extra_externals; do grep -q "\`$f\`" "$SKILL/SKILL.md" || { echo "MISSING $f"; exit 1; }; done; echo OK'`` → prints `OK`;
   `grep -c '^name: architecture-evolution-timelapse$' "$SKILL/SKILL.md"` → `1`
   (frontmatter intact);
   `bash -c 'head -5 "$SKILL/SKILL.md" | grep -qi "static analysis"'` → exit 0.
9. **config-schema.md completeness**:
   `bash -c 'for f in system_name levels component_roots exclude import_aliases extra_externals source_extensions max_file_bytes output_dir collapse_mode fps max_hold_ms max_commits history_mode prefilter annotate speedthrough_frame_ms video.gif_width video.crf render.width render.height render.margin render.max_scale render.theme; do grep -q -- "$f" "$SKILL/references/config-schema.md" || { echo "MISSING $f"; exit 1; }; done; echo ALL-FIELDS-OK'`
   → prints `ALL-FIELDS-OK`;
   `grep -qF 'component_roots: null' "$SKILL/references/config-schema.md"` → exit 0;
   `grep -qF 'import_aliases: null' "$SKILL/references/config-schema.md"` → exit 0;
   `bash -c '! grep -qi "reserved for later" "$SKILL/references/config-schema.md"'` → exit 0
   (the B1 reserved-names section is retired);
   `grep -qF 'hash equality' "$SKILL/references/config-schema.md"` → exit 0;
   ``bash -c 'for f in system_name levels collapse_mode fps max_hold_ms; do grep -E "^\| .?\`?$f\`?" "$SKILL/references/config-schema.md" | grep -q "yes" || { echo "NOT-ASKED $f"; exit 1; }; done; echo ASKED-OK'``
   → prints `ASKED-OK` (asked-at-init column agrees with §3).
10. **workflow.md**:
    `test -f "$SKILL/references/workflow.md"` → exit 0;
    `grep -qF 'git archive' "$SKILL/references/workflow.md"` → exit 0;
    `grep -qF 'stitch-only' "$SKILL/references/workflow.md"` → exit 0;
    `grep -qF -- '--stdin-json' "$SKILL/references/workflow.md"` → exit 0;
    `grep -qF 'npx playwright install chromium' "$SKILL/references/workflow.md"` → exit 0;
    `bash -c '[ "$(grep -cE "^## " "$SKILL/references/workflow.md")" -ge 5 ]'` → exit 0.
11. **troubleshooting.md**:
    `test -f "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'NFD' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'NFC' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'same machine' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'handDrawnSeed' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF '11.16.0' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'npx playwright install chromium' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'skipped-chromium-missing' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'no trust flag' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'no lifecycle scripts' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF -- '--fresh' "$SKILL/references/troubleshooting.md"` → exit 0;
    `grep -qF 'frames.json' "$SKILL/references/troubleshooting.md"` → exit 0.
12. **References all linked from SKILL.md**:
    `bash -c 'for r in config-schema.md workflow.md troubleshooting.md; do grep -q "references/$r" "$SKILL/SKILL.md" || { echo "UNLINKED $r"; exit 1; }; done; echo LINKS-OK'`
    → prints `LINKS-OK`.

## Edge cases

Docs item — the edge cases are documentation-coverage obligations plus interview
edges; each maps to an acceptance check:

- **Empty history** — troubleshooting's exit-3 table names the zero-commits preflight
  refusal (check 11's exit-3 table entry; B3 §2.2).
- **Single commit / first frame** — workflow.md states the first plan commit is always
  the baseline, kept for every level; a one-commit repo yields single-frame videos
  (§2.5; B3 edge cases).
- **All-duplicates run** — SKILL.md/workflow explain collapse: one kept frame per
  level, badge `×N commits`, hold growth capped at `max_hold_ms` (§2.2 item 1, §2.5).
- **Resume mid-run** — SKILL.md Resume section: auto-resume, `--run-id` mismatch
  refusal, `--fresh` remedy (§2.2 item 12; troubleshooting check 11 `--fresh`).
- **Missing binary (Chromium / ffmpeg)** — troubleshooting entries 3 and 4 with the
  verbatim install remedy (check 11).
- **User accepts every default** — the pipe degenerates to `{}` and still writes a
  complete config (check 5); the interview must present defaults so this is one
  keystroke per question.
- **User picks a levels subset** — only those levels are extracted/rendered/stitched
  on `run` (B3 §2.2 `--levels` default = config); the un-chosen level never appears in
  the YAML list (check 4).
- **Malformed answers JSON** — exit 2 with the verbatim root-object message; the agent
  re-prompts rather than writing a broken config (check 7).
- **Typo'd enum values** — init writes them through (no value validation,
  init-config.mjs:56-60); SKILL.md pins validation on the interviewer and names `run`'s
  exit-3 preflight as the backstop (§2.3; B3 §3 unknown `collapse_mode` ⇒ exit 3).
- **Re-interview over an existing config** — re-running `init` overwrites the YAML
  wholesale and appends nothing new to `.gitignore` (check 6).
- **Non-ASCII filenames / cross-machine runs** — the NFD/NFC note (§2.6 entry 6,
  check 11).

## Open choices

1. **`extra_externals` question form** — chosen: one optional free-form hint question,
   field omitted entirely when the user has none (keeps the interview at 5 required
   questions; the shape is documented for when it fires). Alternative a DELTA may
   pick: a structured sub-interview (id → name → deps → label per service); heavier,
   and `extra_externals` remains editable YAML either way.
2. **Frontmatter description** — chosen: keep B1's description essentially as-is (it
   already covers triggers, C4 scope, and the read-only story; check 8 requires only
   `name` unchanged + "static analysis" retained). Alternative: extend it with
   collapse-mode vocabulary for richer skill-matching; risk is trigger-phrase drift
   for no user value.
3. **Where the interview lives** — chosen: a dedicated SKILL.md section (`## The init
   interview`), matching the sibling's everything-in-SKILL.md idiom, with workflow.md
   cross-referencing it. Alternative: a separate `references/interview.md`; rejected —
   the interview is the invocation path, not reference material, and I4 wants it in
   the agent's first read.

## Risks

1. **Predecessor drift** — B3 is spec-frozen but unmerged while this spec is written
   one-ahead: if B3 lands with different flag names, config keys, or artifact names,
   SKILL.md/references would document a phantom CLI. Mitigation: executor reconciles
   §2.2/§2.4-2.6 against the landed B3 branch before writing, records deltas in
   Execution notes; checks 5's `collapse_mode: badge`/`fps: 1`/`max_hold_ms: 3500`
   lines are the canary (they fail if B3's DEFAULTS differ).
2. **Doc/code contradiction risk in a docs-only PR** — no code changes are allowed, so
   any B1-b2/B3 behavior the docs must describe but the code does not exhibit becomes
   a B5-blocking bug report, not a B4 fix. Mitigation: every functional claim in the
   acceptance is exercised against the real `init` pipe (checks 3-7), the one code
   path B4's docs own.
3. **yaml formatting coupling** — checks 4-6's raw-byte greps assume yaml 2.9.0's
   block-list output (probed). A future lockfile bump could reformat and break greps
   without any real regression; the node parse-assert (check 4) is the authoritative
   twin, so a formatting-only failure is diagnosable in seconds. Accepted.
