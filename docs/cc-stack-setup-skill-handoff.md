# Handoff: turn `bun run setup` into a `cc-stack-setup` skill

**Audience:** an agent (or human) working in `~/Documents/claude-skills` who's going to add a new skill that does what this repo's onboarding CLI does today.

**Source repo:** `~/Documents/1-startups/Create➕Club/Random Projects/cc-stack`
**Target repo:** `~/Documents/claude-skills` — siblings to `auto-loop-bootstrap`, `idea-to-loop`, etc.

---

## 1. What the CLI does today

Two entrypoints, both `@clack/prompts`-driven TypeScript scripts run under Bun:

| Script | Purpose |
|---|---|
| `scripts/setup.ts` | Dev provisioning: Convex cloud dev, Clerk dev instance, VAPID keypair, optional PostHog dev environment. Writes `.env.local`. |
| `scripts/setup-prod.ts` | Prod provisioning: Clerk prod, Convex prod (`bunx convex deploy`), PostHog prod+preview environments, Cloudflare Worker secrets via `wrangler secret bulk`. Writes `.env.production` and pushes secrets to the Worker. |

Both are **idempotent**. They read existing values from `.env.local` / `.env.production` and skip any phase whose required keys are already set. Flags:

- `--force` — overwrite even if already set.
- `--only=<phase>` — run a subset. Dev phases: `convex,clerk,vapid,posthog`. (Prod has its own list.)

Per-integration logic is split into `scripts/lib/*.ts` (1648 LOC total):

```
scripts/lib/
├── clerk.ts        Clerk Backend API client. Derives JWT issuer from publishable key,
│                    creates the `convex` JWT template, manages allowed origins.
├── clipboard.ts    Reads system clipboard (pbpaste / xclip / wl-paste).
├── cloudflare.ts   wrangler whoami, wrangler secret bulk, name/URL probing.
├── convex.ts       Wraps `bunx convex dev --once`, `convex env set`, `convex deploy`.
├── env.ts          Read / write / merge .env files. Preserves ordering + comments.
├── exec.ts         Spawning with stdio inheritance for interactive child processes.
├── http.ts         Tiny fetch wrapper with JSON + error handling.
├── open.ts         Cross-platform `open <url>` with confirm prompt.
├── posthog.ts      PostHog API client. Org lookup, project list/create,
│                    Environments-within-Project (`ensureEnvironment`).
├── prompts.ts      Clack wrappers — header, info, success, fail, exitOnCancel.
└── vapid.ts        web-push generateVAPIDKeys() wrapper.
```

**Read this in order before designing the skill:** `setup.ts`, `setup-prod.ts`, `lib/clerk.ts`, `lib/posthog.ts`, `lib/convex.ts`, `lib/cloudflare.ts`, `SETUP.md`. Together they tell you exactly which env vars exist, where each one comes from, and which cross-wirings are non-obvious.

## 2. Env var schema (the contract the skill must produce)

These are the canonical names the rest of the stack expects. Anything the skill writes must match these exactly — the app reads them by name.

### `.env.local` (dev)

| Variable | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_CONVEX_URL` | Written by `convex dev` | Don't set manually. |
| `CONVEX_DEPLOYMENT` | Written by `convex dev` | Don't set manually. |
| `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` | Clerk dashboard `.env` block | `pk_test_…` |
| `CLERK_SECRET_KEY` | Clerk dashboard `.env` block | `sk_test_…` |
| `CLERK_JWT_ISSUER_DOMAIN` | **Derived** from publishable key | `https://<frontend-api>.clerk.accounts.dev` — extracted by base64-decoding the second segment of the publishable key. See `lib/clerk.ts` `getJwtIssuerDomain()`. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | `web-push generateVAPIDKeys()` | |
| `VAPID_PRIVATE_KEY` | `web-push generateVAPIDKeys()` | Never commit. |
| `VAPID_SUBJECT` | User-provided email | Must start with `mailto:` — CLI prepends if missing. |
| `NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN` | PostHog Environments API (or project token fallback) | Optional in dev. |
| `NEXT_PUBLIC_POSTHOG_HOST` | `https://us.i.posthog.com` or `https://eu.i.posthog.com` | |
| `NEXT_PUBLIC_POSTHOG_FORCE_ENABLE` | `1` | Required because PostHog init is gated on `NODE_ENV === "production"`. |
| `NEXT_PUBLIC_POSTHOG_ENVIRONMENT` | `development` / `preview` / `production` | Used as super-property. |

### Convex dev env (mirrored via `bunx convex env set`)

- `CLERK_JWT_ISSUER_DOMAIN` (same value as in `.env.local`)
- `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`

### `.env.production` (prod) — superset of dev with these additions / changes:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` swaps to `pk_live_…`, `CLERK_SECRET_KEY` to `sk_live_…`
- `CONVEX_DEPLOY_KEY` (paste from Convex dashboard; **never** push to Worker secrets — it's a deploy-time key only)
- `NEXT_PUBLIC_POSTHOG_ENVIRONMENT=production`

### Cloudflare Worker secrets (pushed via `wrangler secret bulk`)

Everything in `.env.production` **except** `CONVEX_DEPLOY_KEY`.

## 3. Non-obvious cross-wirings the skill must replicate

These are the parts a naive "ask for keys, write file" skill will get wrong.

1. **Convex chicken-and-egg.** `convex/auth.config.ts` references `CLERK_JWT_ISSUER_DOMAIN`. On a brand-new deployment that env var isn't set, so the *first* `bunx convex dev --once --configure new` push fails the validator. The CLI handles this by:
   - Running `convex dev --once` with `allowFail` first (the deployment itself is provisioned even though the push fails).
   - Reading the newly-written `NEXT_PUBLIC_CONVEX_URL` from `.env.local`.
   - Seeding a placeholder `CLERK_JWT_ISSUER_DOMAIN=https://placeholder.clerk.accounts.dev` via `convex env set`.
   - Retrying `convex dev --once` (no `--configure` flag) — this time it pushes cleanly.
   - Later, the real issuer overwrites the placeholder during the Clerk phase.

2. **Clerk JWT template name must be exactly `convex`.** Convex's auth bridge expects this template name; rename it and auth silently breaks. `lib/clerk.ts` `ensureConvexJwtTemplate()` is idempotent and uses this exact name. Don't parametrize it.

3. **Clerk JWT issuer derivation is offline.** Don't call Clerk's API for it. The publishable key is `pk_<env>_<base64-of-frontend-api-url>$`. Decode the middle segment, strip the trailing `$`, prepend `https://`. (See `lib/clerk.ts`.)

4. **PostHog Environments fallback.** PostHog's Environments-within-a-Project feature must be enabled at the org level. If it's not, `ensureEnvironment` returns null and the CLI falls back to the project-level `api_token`. The skill should handle both paths and *warn* the user when falling back so they can flip Environments on later.

5. **PostHog ingest is reverse-proxied.** The app sets `api_host: "/ingest"` and rewrites in `next.config.ts` route to the real host. The token still has to come from the real environment, but the host in `.env*` is informational — actual requests go via the proxy. Don't try to "fix" this by setting `api_host` to the real host.

6. **Wrangler secret bulk excludes the Convex deploy key.** `CONVEX_DEPLOY_KEY` is for the build/deploy step, not the Worker runtime. Including it in `wrangler secret bulk` leaks it into the Worker for no reason. The CLI explicitly filters it out.

7. **Cloudflare Worker URL must be allow-listed in Clerk.** After the Worker is deployed (or the URL is known), the skill should call Clerk's Backend API to add `https://<worker>.<subdomain>.workers.dev` to allowed origins. `lib/clerk.ts` already has helpers for this.

## 4. Recommended skill shape

Match the conventions of sibling skills in `claude-skills/`. Each one has:

```
<skill-name>/
├── SKILL.md          # frontmatter + workflow
├── assets/           # templates, snippets the skill writes
└── references/       # deep-dive markdown the skill links to but doesn't auto-load
```

### Frontmatter (matches the format in `auto-loop-bootstrap/SKILL.md`)

```yaml
---
name: cc-stack-setup
description: Provision a cc-stack app (Next 16 + Convex + Clerk + Tailwind v4 + PostHog + VAPID Web Push, deployed on Cloudflare Workers via OpenNext). Wires Clerk's `convex` JWT template, handles Convex auth.config.ts chicken-and-egg, generates VAPID keys, optionally creates PostHog environments, and pushes Worker secrets. Idempotent. Use when the user says "set up cc-stack", "wire up Convex + Clerk for this app", "configure my .env.local for cc-stack", or is in a fresh clone of a cc-stack-shaped repo and needs onboarding. Two modes: dev (writes .env.local, runs convex dev) and prod (writes .env.production, runs convex deploy, pushes wrangler secrets).
---
```

### Two approaches — pick one

**A. Thin wrapper around the existing CLI** *(recommended for first pass).*

The skill drives `bun run setup` / `bun run setup:prod` via `Bash`, but handles the *conversational* parts itself before shelling out:

- Detects whether this is a cc-stack repo (look for `convex/auth.config.ts` + `next.config.ts` + the right deps in `package.json`).
- Walks the user through getting a Clerk dashboard tab open, talks through what to copy.
- Reads the `.env` block back via `AskUserQuestion` instead of the CLI's clipboard read.
- Calls `bun run setup --only=clerk` etc. for the deterministic writes.
- Reads back `.env.local` to verify and report what landed.

**Pros:** All the failure-mode handling (chicken-and-egg, Environments fallback, JWT template idempotency) is already in `scripts/lib/`. Skill stays small. Bug fixes in the CLI flow through.

**Cons:** Skill is useless in a repo where the CLI doesn't exist (e.g., a partial clone, or a user wanting to apply the pattern to a similar-but-not-identical app).

**B. Full replacement — skill does it all without shelling to the CLI.**

The skill calls `bunx convex dev --once`, `bunx convex env set`, Clerk's Backend API (via `WebFetch` or `Bash` + `curl`), PostHog's API, `web-push generate-vapid-keys`, and `bunx wrangler secret bulk` directly. Reads/writes `.env.local` via `Read`/`Edit`.

**Pros:** Works on any cc-stack-shaped repo even without `scripts/`. Can adapt mid-flow (e.g., "I already have a Clerk app, here's the dashboard URL").

**Cons:** Has to re-implement everything in `scripts/lib/`. Secrets flow through model context (the existing CLI keeps them local). Harder to keep in sync as the stack evolves.

**My recommendation:** ship A first. Once it's solid, consider B for the "I want this pattern on a different repo" case.

### Suggested workflow (Phase structure, matching `auto-loop-bootstrap` style)

1. **Detect mode.** Check for `convex/auth.config.ts`, `package.json` has `@clerk/nextjs` + `convex`, `scripts/setup.ts` exists. Decide dev vs prod (does `.env.local` exist already?).
2. **Pre-flight.** Verify `bun`, `bunx convex --version`, and (for prod) `bunx wrangler whoami`. Offer to install/login if missing.
3. **Convex phase.** Run `bun run setup --only=convex` if the CLI exists; otherwise spawn `bunx convex dev --once --configure new` and handle the auth.config.ts retry yourself.
4. **Clerk phase.** Open dashboard URL, wait for user to paste `.env` block via `AskUserQuestion`, write keys, derive issuer, run `bun run setup --only=clerk` to do the Backend API wiring.
5. **VAPID phase.** `bun run setup --only=vapid` (no user interaction needed beyond an email).
6. **PostHog phase.** Ask whether to enable in dev (default no). If yes, walk through personal API key acquisition + region pick + project pick.
7. **Prod handoff** (only in prod mode). Same shape but with prod dashboard URLs and Cloudflare secret bulk push at the end.
8. **Verify.** Read `.env.local`, confirm all required keys present, show user the next steps (two terminals: `bunx convex dev` + `bun run dev`).

## 5. Things the skill should NOT do

- **Don't add a second auth provider.** This stack is Clerk-only.
- **Don't bake secrets into `wrangler.jsonc`** — always use `wrangler secret put` or `secret bulk`.
- **Don't commit `.env.local` or `.env.production`.** `.gitignore` covers `.env*` — the skill should never `git add` an env file.
- **Don't rename the Clerk JWT template.** It must be exactly `convex`.
- **Don't initialize PostHog in dev without setting `NEXT_PUBLIC_POSTHOG_FORCE_ENABLE=1`** — the init guard in `instrumentation-client.ts` is `NODE_ENV === "production"` OR that flag.
- **Don't write `middleware.ts`.** This is Next 16; Clerk runs from `proxy.ts` at the root.
- **No emojis** in any file the skill writes — `CLAUDE.md` forbids them project-wide.

## 6. Open questions for the skill author

- **Should the skill bootstrap a cc-stack-shaped repo from scratch**, or only configure an existing one? If yes, it overlaps with `idea-to-loop` — probably out of scope; recommend the user run `bunx degit` or clone cc-stack first.
- **Should the prod phase be a separate skill?** They share a lot of code but the prod phase has higher-blast-radius operations (Worker secrets, prod Clerk instance promotion). Splitting reduces the chance the skill accidentally runs prod when the user wanted dev.
- **How should the skill handle a user who's halfway through?** The CLI's idempotency is at the env-var level — if `NEXT_PUBLIC_CONVEX_URL` is set, Convex phase is skipped. Skill should mirror that (read `.env.local` first, decide per phase).
- **Telemetry?** Probably no — secrets are flowing through this skill, so any telemetry has to be paranoid about PII.

## 7. Pointers — files to read before writing the skill

In `cc-stack/`:

- `scripts/setup.ts` — orchestration for dev
- `scripts/setup-prod.ts` — orchestration for prod
- `scripts/lib/clerk.ts` — JWT template, issuer derivation, allowed origins
- `scripts/lib/convex.ts` — `convex dev --once` wrapping, env-set
- `scripts/lib/posthog.ts` — Environments-within-Project handling
- `scripts/lib/cloudflare.ts` — `wrangler secret bulk` flow
- `SETUP.md` — user-facing flow this skill must reproduce
- `AGENTS.md` — stack rules; the skill itself must obey them
- `convex/auth.config.ts` — why the chicken-and-egg exists
- `proxy.ts` — the Next 16 middleware replacement (skill must not touch this)

In `claude-skills/`:

- `auto-loop-bootstrap/SKILL.md` — closest pattern: bootstraps an existing repo, runs phases, idempotent
- `idea-to-loop/SKILL.md` — has a tech-stack provisioning step the skill author may want to read for prior art
- `README.md` — fits the new skill into the existing pipeline diagram

## 8. Minimum viable scope for the first cut

If you want to ship something thin and useful in one pass, do just this:

1. Skill named `cc-stack-setup`, mode A (thin wrapper).
2. Dev only. Skip prod entirely for v1.
3. Workflow: detect → pre-flight → drive `bun run setup` phase-by-phase, with the skill doing the conversational hand-offs (open dashboard, paste keys back via `AskUserQuestion`) and the CLI doing the writes.
4. Don't try to handle PostHog at all in v1 — it's optional and adds the most surface area.

Phases 2 and 3 (Convex + Clerk + VAPID) cover 90% of the "I just cloned this, what do I do" path.

---

**Last updated:** 2026-05-26. If `scripts/setup.ts` has materially changed since then, re-read it before relying on this doc.
