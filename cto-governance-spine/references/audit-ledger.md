# The single global audit ledger

Governance owns **one** append-only ledger for the whole fleet:
**`fleet/ledger.jsonl`** — one `AUDIT_LEDGER_ENTRY` (the workflow-runtime canon
schema) per gate outcome, newline-delimited JSON, **never rewritten**. This is the
single source of audit truth for everything the autonomous CTO does.

## Why global, not per-app (the §5 boundary, resolved)

The §5 critique flagged that both the registry's per-app state and governance's
ledger could hold "what happened." The line, locked at build time:

- **`fleet/ledger.jsonl` (governance)** — the *audit history*: every verdict,
  every gate decision, every approval, across every app, in one append-only
  stream. One place to answer "what has the CTO done, and was each step gated?"
- **`fleet/apps/<id>/state.json` (registry)** — *hot operational state only*
  (lease, open-incident count, last-known-good, drift). **No audit history.** A
  reconstruction of state is the current value; a reconstruction of the ledger is
  the whole story.

Per-app ledgers were rejected: they give no single cross-fleet audit view and
blur the registry/governance line. One global stream means outlier/regression
analysis (by `loop-supervisor`, read-only) and any external auditor read one file.

## The entry

`governanceLedgerEntry(decision, ctx)` builds an entry conforming to
`AUDIT_LEDGER_ENTRY_SCHEMA`:

- `role: "auditor"` — the gate audits a candidate action.
- `verdict` — `verdictForGate(gate_decision)` (`proceed→APPROVE`, `hold→REVISE`,
  `escalate→BLOCK`).
- `gate_decision` — the raw `proceed | hold | escalate`.
- `issues` — `[]` on proceed; one `non_blocking` note on hold; one `blocking`
  note on escalate (the deciding reason).
- `tests_added: 0` — governance authors no tests; that attestation belongs to the
  quality gates.
- `human_approval` — passed through from the candidate (`null` until a human signs
  off; the prod-deploy gate is fail-closed on this).
- `cost` / `ts` — stamped by the **caller** (a Workflow script has no clock; the
  gate itself is ~0-token deterministic code).

## Append discipline

- **Append, never rewrite.** A ledger you can edit is not an audit trail. Add a
  correcting entry; never mutate a past one.
- **Every gate outcome is logged** — proceed, hold, AND escalate. A gate that
  produced no ledger line is indistinguishable from a gate that never ran; silence
  is not proof of safety (the same discipline the steward enforces on itself).
- **A silently-failing ledger falsifies every "auditable" claim.** Treat a failed
  ledger append as a hard error, not a warning — if the story can't be written,
  the action shouldn't proceed.

## Concurrency (the global-write seam the per-app lease does NOT cover)

The D2 lease serializes writes to one app's `state.json`; it does **not** serialize
writes to this ONE global file. Many app-sessions run concurrently (the lease is
per-app, the ledger is fleet-wide), so concurrent appends are the normal case, not
the exception. The contract that keeps the stream from tearing:

- **One atomic append per entry.** Write each entry as a single
  `O_APPEND` write of one newline-terminated line (POSIX guarantees atomicity for
  an `O_APPEND` write up to `PIPE_BUF`). Keep an entry under that bound — these
  records are small (no transcripts; `cost`/`ts`/verdict/one issue note). An entry
  that would exceed it must be trimmed, never split across writes.
- **Never read-modify-write the file.** Appending is the only mutation; there is no
  "load, push, save" path that two sessions could interleave into a lost write.
- **If a host can't guarantee atomic append** (a non-POSIX FS, an oversized entry),
  serialize through a single fleet-level ledger writer or a short-held advisory
  lock — do NOT fall back to unsynchronized appends. This is the v1 contract;
  promote to a real broker (an append service / KV log) if cross-session contention
  ever shows torn lines. Same posture as the registry's lease-churn upgrade note:
  take the heavier mechanism only when contention bites, but never weaken the
  atomicity guarantee in the meantime.

## Who reads it

- `loop-supervisor` (read-only) — outlier/regression analysis, KPIs ("gates since
  last escalate", auto-approve rate by tier). It INFORMS; it never edits the
  ledger or blocks on it.
- The steward (`orchestrated-delivery`) — consumes the structured entries instead
  of scraping transcripts.
- A human / external auditor — the one file that answers "what did it do?"
