# The default stack

`launch` uses this unless the idea clearly needs something else (a mobile-first product, a CLI, an ML pipeline), and records the choice in the product brief. Boring, popular, well-documented, free tiers, and every piece runs locally with no account. Change this file to change every future launch.

## Web product (the default)

| Layer | Choice | Keyless fallback |
|---|---|---|
| Language | TypeScript, `strict: true` | |
| Framework | Next.js, App Router, server actions and route handlers | |
| UI | Tailwind CSS v4 (CSS-first `@theme` tokens) and shadcn/ui restyled from `docs/design.md`, never its defaults; Motion for the few animations; Phosphor or Tabler icons (Lucide reads as stock shadcn) | |
| Database | Postgres through Drizzle ORM and drizzle-kit migrations | PGlite in-process for dev, tests and CI |
| Auth | Better Auth: email and password plus GitHub and Google OAuth | Email and password only; OAuth buttons hidden until their keys exist |
| Payments | Stripe Checkout and the customer portal, webhooks verified | A fake billing adapter that grants the plan instantly, shown with a "test mode" banner |
| Email | Resend through React Email templates | Writes emails to the console and to `.data/outbox/` |
| File storage | S3 API (Cloudflare R2 by default) | Local disk under `.data/uploads/` |
| Background work | Route handlers on a schedule (Vercel Cron), with an `jobs` table for retries | The same handlers, triggered by a dev script |
| AI features | Anthropic TypeScript SDK, the current models, prompt caching on | A deterministic fake that returns fixture responses |
| Analytics | PostHog | No-op client |
| Errors | Sentry | Console |
| Unit and integration tests | Vitest, with PGlite for anything touching the database | |
| End-to-end tests | Playwright against `next build && next start`, seeded database | |
| CI | `.sasori/config.json` `checks` (install, typecheck, lint, unit, build, e2e): the conductor's train runs them in a session, and `ci.yml` is dispatch-only, so no Actions minutes | |
| Deploy | Vercel, preview per PR and production from main | CI builds and e2e-tests the production build; the deploy job skips itself when `VERCEL_TOKEN` is absent |
| Hosted Postgres | Supabase free tier, created through Dan's Supabase connector (or Neon) | PGlite |
| Design checks | `.claude/sasori/qa/shoot.mjs` (screenshots, axe-core, overflow, focus, metadata) in `sasori-qa.yml`; Lighthouse CI budgets in the hardening wave | |
| Security checks | `sasori-security.yml`: gitleaks for secrets, the package manager's audit for dependencies (CodeQL and secret scanning aren't available on private personal repos) | |

## The adapter rule

Every external service is a module in `src/lib/services/<name>.ts` that exports one interface and picks the implementation from the environment:

```ts
export const email: EmailService = env.RESEND_API_KEY ? resendEmail(env.RESEND_API_KEY) : outboxEmail();
```

- `src/env.ts` validates every variable with zod and marks each optional with the fallback it uses.
- `.env.example` lists every variable with a comment: what it's for, where to get it, and what happens without it.
- The app's footer shows "keyless mode: <services>" in non-production builds while any fallback is active, so it's never confused for the real thing.
- Tests use the fakes. The real adapters get contract tests against documented request and response shapes.

## Repo layout

```
src/app/            routes, layouts, server actions
src/components/     UI, with shadcn/ui under ui/
src/lib/            domain logic, no framework imports
src/lib/services/   the adapters above
src/db/             schema.ts, migrations/, seed.ts
e2e/                Playwright specs and fixtures
.sasori/         config.json (checks, workflows, hot files, the dependency audit's level and advisory directories), `ci` ("sessions": no Actions, the conductor's train runs CI and merges on `sasori/*` statuses; "actions"), qa.json (routes to photograph, `routeFiles` mapping routes to their own files so a PR shoots only what it can affect, interactions to film, motion rules)
```

Hot files, one ticket at a time: `src/db/schema.ts`, `src/env.ts`, `package.json` and the lockfile, `src/app/layout.tsx`, the navigation component, `e2e/fixtures.ts`. Prefer a pattern that turns a hot file into an append-only registry (a folder of modules plus an index) when several tickets need it.

## Other shapes

| Product | Stack |
|---|---|
| Mobile-first | Expo (React Native) with Expo Router, the same backend as a Next.js API, EAS builds (keyless: Expo Go and local builds) |
| API or developer tool | Hono on Node, OpenAPI from zod schemas, the same Postgres and Drizzle layer, a TypeScript SDK generated from the spec |
| CLI | TypeScript with commander, bundled with tsup, published only when Dan says so |
| Browser extension | WXT with React |
| Data or ML heavy | Python 3.12 with uv, FastAPI, Postgres, pytest; the web front end stays Next.js |
