# The quality bar

Nobody reviews an Sasori PR before it merges. So "done" is defined here, checked by code where possible, and checked by an independent reviewer where code can't. Every gate below is required. None is skipped to hit a pace.

## A ticket is done when

1. **Every acceptance criterion has a test that fails without the change.** The PR body has an `## Acceptance` table: criterion, the test that proves it, and where it ran. A criterion that can't be tested automatically (a visual judgement, a real payment) says so, with the evidence used instead: a Playwright screenshot, a test-mode run.
2. **The repo's checks pass locally**: the commands in `.sasori/config.json` `checks` (typically typecheck, lint, unit tests, build).
3. **CI is green at the PR head**: `CI`, `Security` and, for anything people see, `QA`. No CI run counts as red.
4. **The review gate approved the head commit**, including a design review for `ui` work (`design-bar.md`). A fresh-context reviewer (the `review-gate` skill), never the session that wrote the code, read the diff against the ticket and found nothing blocking. Its verdict comment names the head SHA.
5. **Nothing was weakened to get green**: no added `skip`, `only`, `todo`, `xfail`, retries, `@ts-ignore`, `eslint-disable`, `any` casts that hide a type error, lowered coverage thresholds, or loosened assertions. If the ticket genuinely needs one, the reviewer must agree in its verdict.
6. **The merge train merged it**, which means it was up to date with the base (or touched no file that moved) and green at the moment it merged.

## The default branch is always green

The conductor runs the merge train on every pulse, and the train runs CI on the base after every merge (`cloud.md`, "Session CI").

- The train halts the moment the base is red. Nothing else merges until it's green.
- The conductor fixes a red base first, before starting or merging anything else: a revert PR of the merge that broke it (fast-tracked, since reverting to a known-green tree is safe), then a fix ticket for the original work with the failure log attached.
- Flaky tests are bugs. One re-run to confirm a flake, then a ticket to fix the test. Never quarantine silently.

## What the reviewer looks for (blocking)

- A criterion with no test, or a test that doesn't test what it says.
- Behaviour outside the ticket's scope, or a change to a contract (API, schema, env var, persisted data) the ticket didn't call for.
- Anything that contradicts the approved product brief, or user-facing functionality none of its user stories names (`gates.md`).
- Security: unvalidated input at a trust boundary, authz missing on a route or query, secrets in code or logs, SQL or HTML injection, SSRF, open redirects, missing CSRF on cookie-auth mutations, webhooks without signature checks.
- Data: a migration that can't run on a non-empty table, or loses data, or has no down path when the stack supports one.
- Correctness bugs: a realistic input that produces a wrong result or a crash.
- Anything from point 5 above.
- A quieter dependency audit (`.sasori/config.json` `audit`: a directory made advisory, a higher `level`, an `ignore` id) without a reason in the PR: each one is a vulnerability nobody fixes. Fine when the findings are build tooling a framework lists as production and only a major upgrade fixes, and the PR says so.

Not blocking (logged in the verdict, fixed only if cheap): naming, style the linter doesn't enforce, small duplication, a better abstraction.

## Budgets

| Budget | Limit | Then |
|---|---|---|
| Red CI cycles caused by the diff | 3 | Park the ticket with the failure and your best diagnosis |
| Review-gate rounds | 3 | Park with the unresolved findings |
| Ticket size | ~400 changed lines excluding tests, lockfiles, generated code and migrations' boilerplate | Split it into stacked PRs, each meeting this bar on its own |

## Keyless by default

No ticket waits on an API key. Every external service sits behind an adapter with a fake that's used when its env var is missing, so the app runs, tests pass and CI is green with zero secrets. The real adapter is written and unit-tested against recorded or documented responses. The key goes in `.env.example` and the needs-you ledger. See `stack.md`.
