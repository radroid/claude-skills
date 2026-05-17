# Mobbin research patterns

How to query the Mobbin MCP server effectively. Per the official docs (`docs.mobbin.com/mcp`), the interaction model is **natural language** — you "ask Claude to search Mobbin directly" with prompts like *"Search Mobbin for onboarding screens from banking apps"*; Claude routes your request through whatever tools the MCP server exposes and inlines image responses. The user-facing surface is plain English over 600k+ shipped app screens, with curated pattern annotations and app metadata in the response.

Don't try to construct synthetic tool-call payloads — Mobbin's docs don't enumerate the underlying tool schema, and your job is to phrase the *query* well, not to call a specific tool. The patterns below are about *how to ask*, not *what to call*.

## Setup (one-time, per machine)

```bash
claude mcp add mobbin --transport http https://api.mobbin.com/mcp
```

Browser OAuth on first use. Requires a paid Mobbin plan.

If the MCP isn't configured, this skill's value collapses — see `SKILL.md` § "When NOT to use".

## Three query shapes that work

### 1. Archetype + vertical

Most reliable. Pin the *kind* of screen and the *kind* of app.

- *"Show me 5 paywalls from personal finance apps that emphasize annual-plan discounts"*
- *"Onboarding screens from habit-tracker apps that gate notification permissions"*
- *"Dashboard layouts from B2B SaaS analytics tools with dense data tables"*
- *"Empty-state designs for transaction lists in neobanks"*

### 2. Pattern comparison

Use when you have two competing approaches to choose between.

- *"Compare KYC onboarding flows in Revolut, N26, and Wise — what's different about each, and which has the fewest steps?"*
- *"Contrast pull-to-refresh animations in Twitter/X, Bluesky, and Mastodon"*
- *"How do Notion, Linear, and Height handle the 'no projects yet' empty state on first login?"*

Comparison queries are gold for the refinement loop — they surface trade-offs the single-archetype query hides.

### 3. Named-app deep dive

Use sparingly, only when the user explicitly references an app.

- *"Walk me through the full checkout flow in Uber Eats"*
- *"How does Duolingo structure its lesson-complete celebration screen?"*

Named-app queries return less inspiration breadth than archetype queries — they answer "how does X do it" not "how is this generally done well." Reach for them when the user has a North Star app, not as a default.

## Anti-patterns

| Query | Why it fails |
|---|---|
| *"Best paywall designs"* | Too vague. Returns generic. Pair with a vertical: *"best paywall designs from finance apps"*. |
| *"Show me a paywall"* | Singular, no scoping. Mobbin returns one near-arbitrary result. Always ask for 3–5 examples. |
| *"Design my paywall"* | This is a synthesis request, not a research query. Mobbin returns design references, not bespoke designs. The synthesis happens in the HTML step. |
| 10 queries in one iter | Burns the value. 2–4 focused queries per iter beats 10 wide ones. |

## How many queries per iter

| Iter purpose | Query count |
|---|---|
| First refinement on a new screen | 3–4 (archetype + comparison + one pattern probe) |
| Subsequent refinement (revise round) | 1–2 — target what the critique specifically called out |
| Comparative research across multiple shipped apps | 1 comparison query is enough |

## Persisting the research

Every Mobbin response goes into `docs/research/design/<screen>.md` as a **dated append-only section**:

```markdown
## 2026-05-17 — iter 003 — paywall research

### Query: "Show me 5 paywalls from personal finance apps that emphasize annual-plan discounts"

**Patterns observed:**

- **Bundled-value framing (Revolut Premium):** lists 6 features above the price; price reveal is below the fold. Anchor: monthly equivalent ($7.99/mo billed annually).
- **Comparison table (YNAB):** monthly vs annual side by side, with savings $ called out as a tag on the annual column.
- **Soft rejection (Mint):** dismiss button is text-only, lower-contrast than the upgrade CTA but not hidden.

**Apps referenced:** Revolut, YNAB, Mint, Monarch, Copilot.

**Worth borrowing for our app:**
- The savings-tag pattern from YNAB (we have a 2-tier price; the tag is high-leverage)
- Annual-equivalent monthly anchor framing

**Explicitly NOT borrowing:**
- Mint's full-screen modal — our screen-design-loop platform is "mobile" and modal paywalls kill in-app discoverability per the comparison
```

The Class A design-critique sub-agent reads this doc when judging the rendered mockup. If you skip the persistence step, you lose the critique signal — there's nothing to grade the HTML against.

## When Mobbin returns nothing useful

- Re-query with a broader vertical (drop "personal finance", try just "finance")
- Re-query with the platform flipped (you asked for mobile, try desktop — often the desktop pattern translates)
- After two failed re-queries, log to `logs/blocks.md` and mark the screen `blocked` per `references/per-iteration-checklist.md` step 2

## Privacy / scope note

Mobbin queries do NOT carry the user's app context. You're asking the public Mobbin index for inspiration; you're not uploading the user's PRD or HTML. Treat Mobbin as a search engine, not a collaborator.
