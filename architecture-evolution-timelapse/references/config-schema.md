# `.arch-timelapse.yaml` schema

Committed in the **target app repo** (not the skills repo). Every field has a
default; a missing config file is not an error — `extract` runs with defaults
and prints a stderr notice (read-only targets).

| field | type | default | asked-at-init? |
|-------|------|---------|----------------|
| `system_name` | string | root `package.json` name, else dir basename | yes (accepted via `--stdin-json`) |
| `levels` | string list | `[context, container, component]` | yes |
| `component_roots` | string list | auto: existing among `app`, `src/app`, `lib`, `src/lib`, `convex` | no (documented) |
| `exclude` | glob list | `node_modules/**`, `.git/**`, `**/_generated/**`, `**/*.test.*`, `**/*.spec.*`, `**/__tests__/**`, `.next/**`, `dist/**`, `build/**`, `coverage/**`, `.arch-timelapse/**` | no |
| `import_aliases` | map | `null` → derive from tsconfig `compilerOptions.paths` entries of the single-target `X/* → [Y/*]` form (parse as strict JSON; on parse failure fall back), fallback `{"@/": "./"}` | no |
| `extra_externals` | rule list | `[]` | no |
| `source_extensions` | string list | `ts, tsx, js, jsx, mjs, cjs, mts, cts` | no |
| `max_file_bytes` | int | `1048576` | no |
| `output_dir` | string | `.arch-timelapse` | no |

In the written YAML, `component_roots: null` and `import_aliases: null` mean
"auto-derive at extract time" per the defaults above.

`extra_externals` entries have the shape
`{id, name, deps, env_prefixes, files, label}` and append to the built-in
external-system rule table.

## Reserved field names

Reserved for later stages (do not repurpose): `collapse_mode`, `fps`,
`max_hold_ms`, `max_commits`, `history_mode`. There is no dedup threshold in
this skill — change detection is hash equality, not pixel diff.
