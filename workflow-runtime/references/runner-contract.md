# Runner contract — the harness Workflow runner

The authoritative, copy-paste-tested reference for the harness **Workflow runner**. Every
other loop skill targets this surface. Everything below is empirically pinned — if a
capability isn't listed here, assume it does not exist. Do not invent.

> **The #1 thing authors get wrong:** there is **NO import**. A workflow script is
> self-contained — no filesystem, no `require`, no `import`. A `workflow-runtime`
> "library" **cannot be loaded at runtime.** The canon ships as a **copy-paste preamble**
> (helpers + schema consts inlined at the top of every script), plus this doc. Design for
> paste-in, never for import. See [The no-import model](#the-no-import-model).

---

## Built-in globals

These are provided by the runner as globals in the script scope. **Do not re-implement them** —
they already exist. Signatures:

| Global | Signature | What it does |
| --- | --- | --- |
| `agent` | `agent(prompt, opts?) -> Promise<string \| object>` | Runs one agent. No `schema` → returns final **text (string)**. With `opts.schema` → returns a **validated object**. Returns **`null`** if the user skips it or it dies after retries — always `.filter(Boolean)` results. |
| `parallel` | `parallel(thunks[]) -> Promise<any[]>` | **BARRIER.** Runs all thunks, waits for all. A throwing thunk **resolves to `null`** (never rejects the batch). |
| `pipeline` | `pipeline(items, ...stages) -> Promise<any[]>` | **Per-item, NO barrier between stages.** Each item flows through the stages independently. A throwing stage **drops that item to `null`**. |
| `phase` | `phase(title)` | Marks a phase boundary (progress/structure). |
| `log` | `log(msg)` | Emits a log line. |
| `args` | `args` | Inbound arguments object. **May be `undefined`** — guard it. |
| `budget` | `budget` → `{ total, spent(), remaining() }` | Token/run budget accounting. `spent()` and `remaining()` are calls. |
| `workflow` | `workflow(nameOrRef, args)` | Invokes another workflow. **One level of nesting only** (see constraints). |

### `agent` options

```js
agent(prompt, {
  label,                 // human-readable tag for this call
  phase,                 // phase grouping
  schema,                // JSON Schema → return is a validated object; agent retries on mismatch
  model,                 // model selector
  isolation: 'worktree', // run the agent in an isolated worktree
  agentType,             // agent type/profile
})
```

### Limits (pinned)

- **Concurrency cap:** `min(16, cores - 2)` agents in flight at once.
- **Lifetime agent cap:** `1000` agent calls per run.
- **Per-call item cap:** `4096` items max per `parallel()` / `pipeline()` call.

---

## Hard constraints

Each violates → **throws at parse/run time** or **fails validation**. The one-line "why" is the
mechanism, not a style preference.

| Constraint | Why |
| --- | --- |
| **`meta` MUST be the first statement: `export const meta = { ... }`, a PURE LITERAL** (no vars, calls, or spreads). Required keys: `name`, `description`. It is a `const` object literal, **not** a function call — `meta({...})` will not run. | The runner reads `meta` statically before executing the body; anything non-literal can't be read without running code. |
| **Plain JavaScript, NOT TypeScript.** No type annotations, interfaces, or generics. | The parser is JS-only — TS syntax fails to parse. |
| **No clock, no RNG.** The current-time and random built-ins are **unavailable** — calling them throws. | They would make a **resume** non-deterministic. Vary by `index`/`label` instead; stamp timestamps **after** the workflow returns, or pass them in via `args`. |
| **No filesystem, no Node.js, no `require`/`import`.** Scripts are fully self-contained. | The runtime is a sandboxed JS scope, not Node. There is no module loader — hence the copy-paste-preamble model. |
| **Schemas are JSON Schema.** Validation happens at the tool layer; the agent retries on mismatch. | Validation is enforced outside your code — you supply the shape, the harness enforces it. |
| **`args` may arrive `undefined`.** Inline constants are the safe fallback. | The workflow can be invoked without args; reading `args.x` blind throws. |
| **Body is `async`; `await` directly.** | The runner wraps the body in an async function — top-level `await` is expected. |
| **`workflow()` nesting is ONE level only.** Calling `workflow()` inside a child throws. | The runner permits a single nesting depth to keep resume tractable. |
| **DEFAULT to `pipeline()` over a `parallel()` barrier** unless a stage genuinely needs ALL prior results. | A barrier blocks the whole batch on the slowest item; `pipeline()` keeps items flowing independently. |

---

## The no-import model

This is the load-bearing design decision. Internalize it before writing anything.

- A workflow script **cannot import a shared library at runtime.** No filesystem, no module
  loader, no `require`/`import`. Whatever helpers and schemas a script needs must **physically
  exist inside that script.**
- Therefore the reusable canon is distributed as a **copy-paste preamble**: a block of helper
  functions and schema constants you paste at the **top of every script**, below `meta`.
- A `workflow-runtime` package you `import` **does not and cannot work.** If you find yourself
  writing `import { ... }` or `require('workflow-runtime')`, stop — that script will not run.

Mental model: **the script is the unit of distribution, not the module.** Reuse = paste, not link.

---

## Minimal correct skeleton

Copy this shape. `meta` first as a pure-literal `export const`; preamble (schemas + helpers)
inlined; async body that defaults to `pipeline()` and guards `args`.

```js
export const meta = {
  name: "example-workflow",
  description: "One-line statement of what this run produces.",
};

// ---- COPY-PASTE PREAMBLE (schemas + helpers inlined; NOT imported) ----
// Canonical verdict grammar — see assets/preamble.js for the full canon.
const REVIEW_SCHEMA = {
  type: "object",
  required: ["verdict", "notes"],
  properties: {
    verdict: { type: "string", enum: ["APPROVE", "REVISE", "BLOCK"] },
    notes: { type: "string" },
  },
  additionalProperties: false,
};

// Vary by index/label — never by clock or RNG.
function tag(label, index) {
  return `${label}-${index}`;
}
// ---- END PREAMBLE ----

// Body is async; await directly. args may be undefined — fall back to inline constants.
const items = (args && args.items) || ["alpha", "beta", "gamma"];

phase("draft + review");

// DEFAULT to pipeline(): per-item, no barrier between stages.
// Stage callback receives (prevResult, originalItem, index).
const results = await pipeline(
  items,
  (item, _orig, i) => agent(`Draft a slice for: ${item}`, { label: tag("draft", i) }),
  (draft, orig, i) =>
    agent(`Review this draft for "${orig}":\n\n${draft}`, {
      label: tag("review", i),
      schema: REVIEW_SCHEMA, // → returns a validated object; harness retries on mismatch
    }),
);

// agent() returns null on skip/death — always filter.
const reviewed = results.filter(Boolean);

log(`reviewed ${reviewed.length}/${items.length} items; budget left ${budget.remaining()}`);
```

Use a `parallel()` barrier **only** when a step genuinely needs all prior results before any
can proceed:

```js
phase("fan-out then aggregate");

const drafts = (await parallel(
  items.map((item, i) => () => agent(`Draft: ${item}`, { label: tag("draft", i) })),
)).filter(Boolean); // a throwing thunk resolves to null

// Aggregation needs ALL drafts → barrier is justified here.
const summary = await agent(`Synthesize these drafts:\n\n${drafts.join("\n---\n")}`, {
  label: "synthesize",
});
```

---

## Common traps

| Trap | Symptom | Fix |
| --- | --- | --- |
| **TypeScript in "plain JS"** — `: string`, `interface`, `<T>`, `as` casts. | Fails to parse before the body runs. | Strip all type syntax. Plain JS only. |
| **Reading the clock / calling RNG** inside the script. | Throws on the call — would break resume. | Vary by `index`/`label`; stamp times after return or pass via `args`. |
| **`args` assumed defined** — `args.items.map(...)`. | Throws when invoked without args. | `const items = (args && args.items) || [...inline default...]`. |
| **`parallel()` barrier where `pipeline()` fits** — fanning out independent per-item work through a barrier. | Whole batch blocks on the slowest item; wasted wall-clock. | Default to `pipeline()`; reserve `parallel()` for "needs ALL prior results." |
| **Not filtering `null`s** — treating `agent()`/`parallel()`/`pipeline()` output as all-truthy. | Downstream chokes on `null` from skips, retries-exhausted, or throwing thunks/stages. | `.filter(Boolean)` every results array. |
| **`meta` as a call or not first** — `meta({...})`, vars/calls/spreads, or code before it. | Static read of `meta` fails → run rejected. | `export const meta = { name, description }` as the literal first statement. |
| **`import` / `require` / fs access** — pulling in a "library". | No module loader; throws. | Inline the helpers/schemas as a copy-paste preamble. |
| **Nested `workflow()`** — calling `workflow()` from within a child workflow. | Throws — one level of nesting only. | Flatten: orchestrate child workflows from the top level. |

---

## Deployment context

This shapes how the skill frames its output — it does not change the contract above.

- **Primary target:** the runner is invoked from **interactive Claude Code sessions**
  (xhigh effort + ultracode), looped via `ScheduleWakeup` (`/loop`). Design for the
  looped interactive session.
- **Headless:** it also runs headlessly under a **scoped** `--allowedTools "Workflow"`
  allowlist (verified) — **no permission-bypass needed.** This is a secondary mode, not the
  target.
