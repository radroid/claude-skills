# Phase 4 + 5 — PRD synthesis discipline

How to turn the grill output into a written PRD, and how to self-review it before the user gate.

## Phase 4 — Fill the template

### Pick the right template

`assets/templates/PRD-{persona_lane}.md` — chosen by Phase 2 lane decision.

If a `secondary_lane` is set, you can:

- **Inline** secondary-lane sections (e.g. a "Technical sketch" appendix on a Designer PRD)
- Or **defer** them with a `> TODO:` and surface in Phase 5 review

Inline only when the grill produced enough material; defer otherwise. Don't pad with assumptions.

### Fill rules

1. **Quote the user wherever you can.** Especially in the Vibe lane, where their voice *is* the PRD. Use `> blockquote` formatting around verbatim user phrasing — readers can tell at a glance what's the user's own words vs. your synthesis.

2. **Bullets, not prose.** In-scope, out-of-scope, references, blockers — all bullets. Prose is for the narrative sections (Problem, Why now, Approach).

3. **Every TBD becomes a `> TODO:` block.** Searchable. The Phase 5 self-review and the user gate both lean on these.

4. **External references included verbatim** + one-line annotation each. Format:
   ```markdown
   - [Tool/site name](URL) — <one-line annotation: why it's referenced>
   ```

5. **No silent inventions.** Anything you decided that the user didn't explicitly say goes in the **Decisions made under uncertainty** appendix. Format:
   ```markdown
   ### Decisions made under uncertainty
   - **<Decision>** — Rationale: <why you defaulted this way>. To confirm: <what the user should verify>.
   ```

6. **Write to `docs/PRD.md`.** Create `docs/` if missing. If updating an existing PRD (from Phase 1 branch), preserve the prior structure and append/update — don't restructure unless asked.

### Voice in synthesis

- Technical PRD voice: precise, terse, table-heavy, no flourishes
- Designer PRD voice: scene-setting, action verbs, sensory language welcome
- Vibe PRD voice: heavily quoted, narrative, evocative, OK to leave deliberate ambiguity

In all three, **your editorial voice is invisible.** The PRD reads like the user's document, not yours.

### Tables to fill (Technical)

When filling the Technical template, prefer tables for:

- Data entities (Entity | Fields | Cardinality | Source of truth)
- API operations (Verb | Noun | Input | Output | Auth)
- States and transitions (State | Trigger | Next state)
- In-scope / out-of-scope (Capability | Reason)

Tables compress info and make `> TODO:` markers easy to spot.

### Tables to fill (Designer)

- States (State | What's shown | What the user can do)
- References (Reference | URL | What's right about it)
- Surfaces & breakpoints (Surface | Behavior | Notes)
- Voice samples (Context | Sample copy)

### Tables to fill (Vibe)

- Do / Don't (Do | Don't)
- References (Reference | One-line)
- Sacred details (Detail | Why it matters)

## Phase 5 — Self-review

After writing the PRD and before surfacing to the user. Read it with fresh eyes. Fix issues inline — don't write a separate review doc.

### Checklist

Run through these in order:

1. **Placeholder scan.** Grep for `> TODO:`, `TBD`, `???`, `<...>` placeholder syntax. Count them. If >5, that's a sign the grill ended too early — flag in the user-gate message.

2. **Internal consistency.** Does the architecture / approach match the feature descriptions? Do any sections contradict each other? (Common contradiction: in-scope says "real-time updates", success metric says "weekly digest". Resolve.)

3. **Scope check.** Is the v1 scope actually shippable in a reasonable cycle? If the in-scope list reads like 6 months of work, surface that — the user might want to split v1 into v1a / v1b.

4. **Voice fidelity (Vibe lane critical).** Open the verbatim quotes section. Do they sound like the user? If not, you over-edited — restore the original phrasing.

5. **Coverage of the exit checklist.** Re-read the persona's question bank exit checklist. Anything checked but actually thin in the PRD? Mark with `> TODO:` and ask the user to confirm in Phase 5 surface.

6. **External references intact.** Every link the user shared is in the PRD verbatim. Every annotation is one line, not a paragraph.

7. **Appendix populated.** "Decisions made under uncertainty" exists and lists every defaulted choice. Better to have 10 entries than 0 — the appendix is *protection* against silent invention.

### Fix or flag

- **Fix inline** — placeholder cleanup, voice restoration, link formatting, table formatting.
- **Flag to user** — every contradiction you couldn't resolve, every `> TODO:` you couldn't fill, scope concerns.

## Phase 5 — User gate

After self-review, surface the PRD to the user with **exactly three things**:

```markdown
Wrote `docs/PRD.md` ({N} lines, {persona_lane} lane).

Three things to verify before we hand this off:
1. **{top ambiguity from appendix}** — I defaulted to {X}; confirm or correct?
2. **{top ambiguity from appendix}** — same.
3. **Anything missing that you expected to see?**

Take a look at the file and tell me what to change, or say "looks good" to ship it.
```

If the user has zero ambiguities (very rare), ask:
1. The biggest scope risk you noticed in self-review.
2. The voice/tone fidelity (especially in Vibe / Designer lanes).
3. Anything missing.

### HARD GATE

**Do not** invoke any downstream skill, write `.loop/state.json`, or claim success until the user signs off. Even a one-word "good" or "ship it" counts as sign-off — but you must wait for it. Silently finishing here is the failure mode this gate exists to prevent.

If the user requests changes:
- Make them inline in `docs/PRD.md`.
- Re-run a *targeted* self-review on the changed sections only.
- Re-surface with the changes summarised.

## What NOT to do during synthesis

- Don't invent capabilities or constraints the user didn't mention. The appendix is the right place for any defaulted decision.
- Don't restructure an existing PRD you're updating. Layer additions; preserve the existing shape.
- Don't write a PRD section that's longer than the user's input for it. If the user said one sentence about it, the PRD section is one paragraph max.
- Don't include the question bank in the PRD. The grill questions are tooling, not deliverable.
- Don't include a meta-section about the PRD itself ("This PRD was generated by..."). The PRD is the PRD; the process is in the skill, not the output.
- Don't link to the question bank, this skill, or the synthesis doc from inside the PRD. PRD readers don't need that level of toolchain context.
