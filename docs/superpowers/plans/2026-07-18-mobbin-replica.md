# mobbin-replica Skill Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Author a new lean skill `mobbin-replica/` that turns a folder of app screenshots into a working, pixel-perfect web replica — functional build first, then a smoke test and a per-screen pixel-refinement loop — packaged as `dist/mobbin-replica.skill`.

**Architecture:** A single lean phased skill in the claude-skills house style (Goal → Where to start → Contracts → "your judgment"). The only executable artifact is `scripts/pixel-diff.mjs` (pixelmatch + pngjs), which scores a replica screenshot against a reference and writes a heatmap. One material reference ships device-profile lookup data. No procedure-walkthrough docs (per the lean-skill-style house rule).

**Tech Stack:** Markdown SKILL.md; Node ESM script using `pixelmatch` + `pngjs`; `zip` via `scripts/build.sh` for packaging.

## Global Constraints

- Skill lives at repo root as `mobbin-replica/` containing `SKILL.md` (required for `build.sh` to package it).
- Lean skill style (memory `feedback-lean-skill-style`): SKILL.md = Goal → Where to start → Contracts → explicit "your judgment" note. Description frontmatter = triggering conditions only, never a workflow summary. Ship material references only (schemas, tables, the script); NO procedure/checklist/phase-walkthrough docs.
- Locked design decisions (from `docs/superpowers/specs/2026-07-18-mobbin-replica-design.md`), which SKILL.md contracts must encode verbatim:
  - Target: web-rendered replica in any web stack, rendered inside a fixed device frame at the screenshot's exact CSS viewport. Default stack when unspecified: Next.js App Router + Tailwind.
  - Assets: hybrid — photos/illustrations cropped from screenshots into `public/assets/`; icons/logos rebuilt from an icon library.
  - Done bar: pixelmatch diff ≤ 3% differing pixels (configurable), THEN a design-critique subagent must return APPROVE on a side-by-side. Hard cap 8 rounds/screen; on cap-out keep best round, mark `needs-attention`, continue.
  - Output: a NEW git-initialized directory; all skill workspace files under `.replica/` inside it.
  - State: `.replica/state.json` with per-screen status `pending | built | smoke-passed | in-loop | passed | needs-attention`; resumable.
  - Fail-closed: if capture tooling is unavailable or the diff script errors, STOP and tell the user — never fabricate a score.
  - Human gate: user approves `.replica/inventory.md` before any scaffolding.
  - Out of scope v1: interactions, animations, native mobile, multi-agent parallelism.
- `pixel-diff.mjs` runs from the generated app's directory so it resolves `pixelmatch`/`pngjs` from that app's `node_modules`; if they're missing it prints an actionable install hint and exits non-zero.

---

### Task 1: `pixel-diff.mjs` — score a replica PNG against a reference + write a heatmap

**Files:**
- Create: `mobbin-replica/scripts/pixel-diff.mjs`
- Verify (throwaway): `$CLAUDE_JOB_DIR/tmp/pixdiff-check/` (generated PNGs + ephemeral deps; not committed)

**Interfaces:**
- Produces (CLI contract other steps/SKILL.md rely on):
  `node pixel-diff.mjs --reference <ref.png> --actual <actual.png> --out <diff.png> [--threshold 0.1] [--mask x,y,w,h ...]`
  - Resizes/crops both images to the common min width and min height (top-left origin) so mismatched dimensions still score.
  - Prints ONE JSON line to stdout: `{"diffPixels":N,"totalPixels":M,"pct":P,"width":W,"height":H,"out":"<diff.png>","pass":bool,"passThreshold":T}` where `pct = 100*diffPixels/totalPixels`, and `pass` reflects `pct <= (--pass-threshold, default 3)`.
  - `--threshold` is pixelmatch's per-pixel color sensitivity (0–1); `--pass-threshold` is the screen-level percent gate. Masked rectangles are excluded from both `diffPixels` and `totalPixels`.
  - Writes the heatmap PNG to `--out`. Exit 0 on success (regardless of pass/fail), exit 2 on bad args / missing deps / unreadable input.

- [ ] **Step 1: Write the script**

```javascript
#!/usr/bin/env node
// pixel-diff.mjs — score a replica screenshot against a reference and emit a heatmap.
// Runs from the generated replica app dir so pixelmatch/pngjs resolve from its node_modules.
import { readFileSync, writeFileSync } from 'node:fs';

function parseArgs(argv) {
  const a = { threshold: 0.1, passThreshold: 3, masks: [] };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--reference') { a.reference = v; i++; }
    else if (k === '--actual') { a.actual = v; i++; }
    else if (k === '--out') { a.out = v; i++; }
    else if (k === '--threshold') { a.threshold = Number(v); i++; }
    else if (k === '--pass-threshold') { a.passThreshold = Number(v); i++; }
    else if (k === '--mask') { const [x, y, w, h] = v.split(',').map(Number); a.masks.push({ x, y, w, h }); i++; }
  }
  return a;
}

function die(msg) { console.error(msg); process.exit(2); }

const args = parseArgs(process.argv.slice(2));
if (!args.reference || !args.actual || !args.out) {
  die('usage: node pixel-diff.mjs --reference <ref.png> --actual <actual.png> --out <diff.png> [--threshold 0.1] [--pass-threshold 3] [--mask x,y,w,h ...]');
}

let pixelmatch, PNG;
try {
  pixelmatch = (await import('pixelmatch')).default;
  ({ PNG } = await import('pngjs'));
} catch {
  die('missing deps: run `npm i -D pixelmatch pngjs` in the replica app, then run this from that app dir.');
}

let ref, act;
try { ref = PNG.sync.read(readFileSync(args.reference)); }
catch (e) { die(`cannot read --reference: ${e.message}`); }
try { act = PNG.sync.read(readFileSync(args.actual)); }
catch (e) { die(`cannot read --actual: ${e.message}`); }

const width = Math.min(ref.width, act.width);
const height = Math.min(ref.height, act.height);

// Crop both to the common top-left region so mismatched sizes still diff.
function crop(src, w, h) {
  if (src.width === w && src.height === h) return src;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const si = (src.width * y + x) << 2;
      const di = (w * y + x) << 2;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}
const a = crop(ref, width, height);
const b = crop(act, width, height);

const diff = new PNG({ width, height });
const rawDiff = pixelmatch(a.data, b.data, diff.data, width, height, { threshold: args.threshold, includeAA: false });

// Apply masks: zero out masked pixels in the heatmap and exclude them from counts.
let masked = 0;
const inMask = (x, y) => args.masks.some(m => x >= m.x && x < m.x + m.w && y >= m.y && y < m.y + m.h);
let diffPixels = rawDiff;
if (args.masks.length) {
  diffPixels = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (width * y + x) << 2;
      if (inMask(x, y)) {
        masked++;
        diff.data[idx] = 0; diff.data[idx + 1] = 0; diff.data[idx + 2] = 0; diff.data[idx + 3] = 255;
        continue;
      }
      // pixelmatch marks changed pixels red-ish; count non-background as diff.
      if (diff.data[idx] === 255 && diff.data[idx + 1] < 128 && diff.data[idx + 2] < 128) diffPixels++;
    }
  }
}

const totalPixels = width * height - masked;
const pct = totalPixels === 0 ? 0 : (100 * diffPixels) / totalPixels;
writeFileSync(args.out, PNG.sync.write(diff));

const result = {
  diffPixels, totalPixels,
  pct: Number(pct.toFixed(3)),
  width, height,
  out: args.out,
  pass: pct <= args.passThreshold,
  passThreshold: args.passThreshold,
};
console.log(JSON.stringify(result));
```

- [ ] **Step 2: Prove the percentage math end-to-end**

Run (creates two 100×100 PNGs where exactly 25% of pixels differ — a 50×50 red square on white — then scores them):

```bash
D="$CLAUDE_JOB_DIR/tmp/pixdiff-check"; rm -rf "$D"; mkdir -p "$D"; cd "$D"
npm init -y >/dev/null 2>&1
npm i -D pixelmatch pngjs >/dev/null 2>&1
node -e '
const {PNG}=require("pngjs");const {writeFileSync}=require("fs");
function mk(f,paint){const p=new PNG({width:100,height:100});for(let y=0;y<100;y++)for(let x=0;x<100;x++){const i=(100*y+x)<<2;let[r,g,b]=[255,255,255];if(paint&&x<50&&y<50){r=255;g=0;b=0;}p.data[i]=r;p.data[i+1]=g;p.data[i+2]=b;p.data[i+3]=255;}writeFileSync(f,PNG.sync.write(p));}
mk("ref.png",false);mk("act.png",true);
'
node "$OLDPWD/mobbin-replica/scripts/pixel-diff.mjs" --reference ref.png --actual act.png --out diff.png
```

Expected: a single JSON line with `"pct":25` (± a fraction), `"pass":false` (25 > 3), `"width":100`, `"height":100`, and `diff.png` written. Exit 0.

- [ ] **Step 3: Prove the fail-closed paths**

Run:

```bash
cd "$CLAUDE_JOB_DIR/tmp/pixdiff-check"
node "$OLDPWD/mobbin-replica/scripts/pixel-diff.mjs" --reference ref.png ; echo "exit=$?"
node "$OLDPWD/mobbin-replica/scripts/pixel-diff.mjs" --reference nope.png --actual act.png --out d.png ; echo "exit=$?"
```

Expected: first prints the usage line and `exit=2`; second prints `cannot read --reference: ...` and `exit=2`.

- [ ] **Step 4: Commit**

```bash
cd "$OLDPWD"
git add mobbin-replica/scripts/pixel-diff.mjs
git commit -m "mobbin-replica: pixel-diff.mjs — pixelmatch scorer + heatmap"
```

---

### Task 2: `device-profiles.md` — material viewport lookup reference

**Files:**
- Create: `mobbin-replica/references/device-profiles.md`

**Interfaces:**
- Consumes: nothing.
- Produces: a lookup table SKILL.md points to for mapping a screenshot's pixel dimensions → CSS viewport + device scale factor, so capture and rendering use identical geometry.

- [ ] **Step 1: Write the reference**

Content is a table (material data, not procedure) covering the common Mobbin export sizes plus a fallback rule. Include at minimum:

```markdown
# Device profiles — screenshot dimensions → render geometry

Map a screenshot's pixel dimensions to the CSS viewport the replica route renders
at, and the device scale factor (DPR) the capture runs at. Render at CSS size,
capture at DPR so replica pixels match the reference's pixel dimensions.

| Screenshot px (W×H) | Device | CSS viewport (W×H) | DPR | Notes |
|---|---|---|---|---|
| 1170×2532 | iPhone 12/13/14 | 390×844 | 3 | Most common Mobbin iOS export |
| 1179×2556 | iPhone 14/15/16 Pro | 393×852 | 3 | Dynamic Island |
| 1284×2778 | iPhone Pro Max (older) | 428×926 | 3 | |
| 1290×2796 | iPhone 15/16 Pro Max | 430×932 | 3 | |
| 1080×2340 | Android (common) | 360×780 | 3 | Pixel-class |
| 1440×3120 | Android (QHD) | 411×891 | 3.5 | |
| 750×1334 | iPhone SE/8 | 375×667 | 2 | |
| 1920×1080 | Desktop (landscape) | 1280×720 | 1.5 | Web screenshot; scale to taste |

**Fallback (dimensions not in the table):** assume DPR 3 for phone-shaped images
(aspect > 1.7 portrait); CSS viewport = round(W/DPR) × round(H/DPR). For desktop
(landscape, W ≥ 1440), use DPR 1–2 and render at native/2. Record the chosen
profile per screen in `.replica/state.json` so capture and render stay in lockstep.

**Taller-than-viewport screens:** the CSS viewport height above is the device
frame; scrollable screens are captured full-page and diffed at full height against
the full reference image.

**OS chrome:** status bar / home indicator are cropped from references by default
(`statusBar: "crop"`); set `"replicate"` to render static OS chrome instead.
```

- [ ] **Step 2: Commit**

```bash
git add mobbin-replica/references/device-profiles.md
git commit -m "mobbin-replica: device-profiles reference (viewport lookup)"
```

---

### Task 3: `SKILL.md` — the lean skill body

**Files:**
- Create: `mobbin-replica/SKILL.md`

**Interfaces:**
- Consumes: `scripts/pixel-diff.mjs` (Task 1), `references/device-profiles.md` (Task 2).
- Produces: the loadable skill. Frontmatter `name: mobbin-replica`; `description` = triggering conditions only.

- [ ] **Step 1: Write SKILL.md**

Structure (lean house style — no phase-walkthrough prose):

1. **Frontmatter** — `name: mobbin-replica`; `description` listing trigger conditions ONLY: user provides Mobbin/app screenshots and wants a pixel-perfect replica built in a given stack; phrases like "replicate this app", "rebuild this UI from screenshots", "pixel-perfect clone", "copy this app's design", "/mobbin-replica". No workflow summary in the description.

2. **Goal (what done looks like):** a new git-initialized web app in the given stack whose every screen, rendered at the screenshot's exact viewport, matches its reference at ≤ 3% pixel diff AND passes a side-by-side design-critique APPROVE; interactions deferred and catalogued; a `.replica/report.md` summarizing per-screen diff %, rounds used, and known gaps. State the two mandated phases plainly: **first a functional app that builds and boots, then smoke test → pixel loop.**

3. **Where to start:** point at the screenshots directory the user provides; read every image; build `.replica/inventory.md` (screen slug, one-line purpose, nav guesses) and `.replica/style-tokens.md` (sampled palette, spacing/radius scale, identified font + the substitute actually used — iOS system stack for iOS apps, else nearest Google Font, always recorded as a known gap). Assign each screen a device profile from `references/device-profiles.md`. **Human gate: user approves `.replica/inventory.md` before scaffolding.**

4. **Contracts (the hard rules other runs depend on):**
   - **State file** `.replica/state.json` schema: `{ phase, stack, threshold, statusBar, screens: { <slug>: { status, profile, route, rounds, bestPct, maskRects } } }`; status ∈ `pending | built | smoke-passed | in-loop | passed | needs-attention`. Resume from it.
   - **Asset rule:** hybrid — crop photos/illustrations from screenshots into `public/assets/` (macOS `sips` or ImageMagick `convert`); rebuild icons/logos from the stack's icon library. Reproduce visible screen text verbatim in a shared mock-data module so content matches during diffing.
   - **Smoke gate (must pass before any pixel work):** production build succeeds; dev server boots; every route returns 200 with zero console errors; index route links all screens. Fix-forward on failure — the pixel loop never starts on a broken app.
   - **Pixel loop per screen:** capture the route headlessly at its profile's CSS viewport + DPR (chrome-devtools MCP; Playwright CLI fallback) → `node scripts/pixel-diff.mjs --reference <ref> --actual <shot> --out .replica/diffs/<slug>/round-N.png --pass-threshold 3` → if not `pass`, read the heatmap, make targeted changes, re-run. Once numeric-`pass`, a design-critique subagent compares reference vs replica side-by-side and returns **APPROVE** or **REVISE**; REVISE re-enters the loop and counts toward the cap. **Hard cap 8 rounds/screen** → keep best round, mark `needs-attention`, continue.
   - **Fail-closed:** capture tooling unavailable OR `pixel-diff.mjs` exits non-zero → STOP and tell the user which tool to enable; never fabricate a score or mark a screen `passed` without a real number + APPROVE.
   - **Report:** `.replica/report.md` — per-screen table (rounds, final diff %, verdict, known gaps: font substitutes + cropped-asset inventory), a deferred-interactions list, and a note that cropped branding/content make this a design study, not a shippable product.

5. **Your judgment:** the model chooses stack scaffolding, component decomposition, how to translate a heatmap hot-region into a concrete CSS change, when a screen is a reused component vs unique, and mask rectangles for genuinely dynamic regions. The skill fixes the goal, the gates, and the state/verdict grammar — not the route to them.

- [ ] **Step 2: Sanity-check frontmatter parses and paths resolve**

Run:

```bash
head -5 mobbin-replica/SKILL.md
test -f mobbin-replica/scripts/pixel-diff.mjs && test -f mobbin-replica/references/device-profiles.md && echo "refs OK"
```

Expected: frontmatter shows `name: mobbin-replica` and a triggers-only description; `refs OK`.

- [ ] **Step 3: Commit**

```bash
git add mobbin-replica/SKILL.md
git commit -m "mobbin-replica: SKILL.md (lean: goal/start/contracts/judgment)"
```

---

### Task 4: Register in README + package the `.skill` artifact

**Files:**
- Modify: `README.md` (add a table row for `mobbin-replica`)
- Create (build output): `dist/mobbin-replica.skill`

**Interfaces:**
- Consumes: the completed `mobbin-replica/` dir.
- Produces: repo-registered, packaged skill.

- [ ] **Step 1: Add the README table row**

Add one row to the Skills table (match existing bolded-lead format, one sentence of purpose):

```markdown
| [`mobbin-replica`](./mobbin-replica/) | **Screenshots → pixel-perfect web replica.** Takes a folder of app screenshots (e.g. Mobbin exports) and builds a working replica in a given web stack: first a functional app (one route per screen at the screenshot's exact viewport, hybrid cropped-photo/rebuilt-icon assets, shared mock data), then a smoke test and a per-screen pixel loop that scores each route against its reference with `pixel-diff.mjs` (pixelmatch heatmap) and gates on ≤3% diff **plus** a side-by-side design-critique APPROVE (hard cap 8 rounds). Fail-closed on missing capture tooling; interactions deferred and catalogued in `.replica/report.md`. |
```

- [ ] **Step 2: Build the artifact**

Run:

```bash
./scripts/build.sh
```

Expected: output includes `built mobbin-replica.skill (...)`; `dist/mobbin-replica.skill` exists.

- [ ] **Step 3: Verify the package contents**

Run:

```bash
unzip -l dist/mobbin-replica.skill | grep -E 'SKILL.md|pixel-diff.mjs|device-profiles.md'
```

Expected: all three paths listed under `mobbin-replica/`.

- [ ] **Step 4: Commit**

```bash
git add README.md dist/mobbin-replica.skill
git commit -m "mobbin-replica: register in README + package dist artifact"
```

---

## Self-Review

**Spec coverage:** P0 intake → Task 3 §3 (inventory/style-tokens/profiles) + human gate. P1 build → Task 3 §4 (asset rule, mock data, routes). P2 smoke → Task 3 §4 smoke gate. P3 pixel loop → Task 1 (scorer) + Task 3 §4 loop contract (numeric gate + APPROVE + cap 8). P4 report → Task 3 §4 report contract. Device/viewport mapping → Task 2. Packaging/registration → Task 4. Fail-closed + state schema → Task 3 §4. No gaps.

**Placeholder scan:** script is complete code; SKILL.md content is specified as concrete contract text; README row is literal. No TBD/TODO.

**Type/name consistency:** CLI flags (`--reference`/`--actual`/`--out`/`--threshold`/`--pass-threshold`/`--mask`) and the JSON result keys (`diffPixels`/`totalPixels`/`pct`/`pass`/`passThreshold`) are identical between Task 1's contract, Step 1 code, and Task 3's loop invocation. State statuses (`pending|built|smoke-passed|in-loop|passed|needs-attention`) match between Global Constraints and Task 3 §4.
