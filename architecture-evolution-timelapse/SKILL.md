---
name: architecture-evolution-timelapse
description: Builds C4 architecture-evolution timelapses of a codebase across git history by extracting a deterministic C1/C2/C3 model per commit and rendering change-aware diagram videos. Use when the user wants an architecture evolution timelapse, C4 diagram history, system/container/component evolution video, or invokes architecture-evolution-timelapse. Pure static analysis — works on read-only JS/TS repos with no install, dev server, or secrets.
---

# Architecture Evolution Timelapse

## What this skill does

Extracts a deterministic C4 architecture model (C1 context, C2 container, C3
component — never code-level) from a checked-out tree via pure static analysis,
emitting canonical `model.json` plus a sha256 hash per level, then renders each
level to fixed-template Mermaid source and a fixed-canvas PNG via the local
mermaid bundle inside Playwright Chromium. Same tree + same config produce
byte-identical model, byte-identical `.mmd`, and (same machine) pixel-identical
PNGs. Later stages walk git history and stitch per-level change-aware videos;
this version ships `init`, `extract`, and `render`.

## Two-repo model

1. **Skill scripts** — `$SKILL_ROOT/scripts/` (or path from loaded skill). Bootstrap once:

```bash
cd "$SKILL_ROOT/scripts" && npm ci && npx playwright install chromium
```

Extraction needs no browser, no ffmpeg, no network, and no installs in the
target repo; only `render` uses the Chromium installed above (and degrades to
placeholder frames without it).

1. **Target app repo** — `cd` into the repo under analysis. `.arch-timelapse.yaml`
   and `.arch-timelapse/` live here only. `extract` also runs config-less against
   a read-only tree (defaults + a stderr notice) with `--out` pointed elsewhere.

## Quick start

```bash
cd /path/to/my-app

# 1. Create config (agent pipes answers as JSON; defaults need no input)
printf '{"system_name":"my-app"}' | "$SKILL_ROOT/scripts/arch-timelapse.sh" init --stdin-json

# 2. Extract the model for the current tree
"$SKILL_ROOT/scripts/arch-timelapse.sh" extract

# Output: .arch-timelapse/model/model.json + hashes.json (one stdout JSON line)

# 3. Render each level to Mermaid source + a fixed-canvas PNG
"$SKILL_ROOT/scripts/arch-timelapse.sh" render

# Output: .arch-timelapse/model/<level>.mmd + <level>.png (one stdout JSON line)
```

## CLI

```bash
arch-timelapse.sh init | extract | render
```

`extract` flags: `--tree <dir>` (default cwd), `--out <dir>` (default
`<tree>/.arch-timelapse/model`), `--config <path>`, `--levels a,b,c`.

`render` flags: `--model <path>` (default `<cwd>/.arch-timelapse/model/model.json`),
`--out <dir>` (default: the directory containing `--model`), `--levels a,b,c`
(default: every level present in the model), `--config <path>`. Render failures
degrade to placeholder frames (still exit `0`); missing Chromium falls back to
ffmpeg placeholder frames with a stderr pointer to `npx playwright install
chromium`.

Exit codes: `0` success, `2` usage error, `3` preflight failure, `4` (`render`
only) at least one level produced no PNG at all.

Reserved subcommands for later stages: `run`, `stitch-only`, `clean`.

## References

- [references/config-schema.md](references/config-schema.md) — `.arch-timelapse.yaml` fields
