# Halftime Show

A browser extension (Manifest V3, WXT, TypeScript strict, Preact) that mutes the Hulu tab during ad breaks and covers the ad with a halftime show, then unmutes and clears it when the show returns. Read `docs/product-brief.md` and, for UI work, `docs/design.md` before changing code.

- **Never block, skip, speed up or hide ads from Hulu**, and never touch Hulu's network traffic. Mute the tab and cover the picture only.
- **Mute the tab, restore what was there.** A tab the viewer had muted stays muted after a break (`src/lib/mute-plan.ts`).
- **Everything Hulu-specific lives in `src/sites/hulu.ts`**, tested against recorded snapshots. More sites are one file each.
- **No network calls, no analytics, no accounts, no remote code.** Permissions stay `tabs`, `storage` and `*.hulu.com`. Data ships in the extension; any question bank or word list carries its licence and credit.
- **The overlay lives in a Shadow DOM** and mounts into the full-screen element when there is one. It never uses `Esc` (that leaves full screen) and stops keys reaching the player while open.
- **Not affiliated with Hulu.** Copy never implies a partnership.
- Cloud sessions can't sign in to Hulu: test against the stand-in player page and the snapshots; the real check is Dan watching an episode.
- Design: Dan's ink and paper system (tokens in `src/styles/tokens.css`, Hoop in `assets/hoop.svg`). The rest of that system is in Dan's private repo; don't copy more of it into this public repo.
- There is no `src/lib/services/`: the extension has no external services; the Sasori block below says otherwise for web apps.
- Writing style for UI copy and docs: plain words, British English, no em dashes.
- Checks: `npm run typecheck && npm run lint && npm test && npm run e2e`.

<!-- sasori -->
## Sasori

This repo is built by the Sasori factory. Read `.claude/sasori/quality-bar.md`, `.claude/sasori/design-bar.md` and `.claude/sasori/protocol.md` before changing code. In a cloud session, `.claude/sasori/cloud.md` says how GitHub is reached (REST through `gh api`, or the GitHub MCP; GraphQL and `gh pr`/`gh issue` don't work).

- A prompt starting `SASORI TRACK` means: use the `track` skill and finish the issue without stopping to ask.
- Reviews before merge come from the `review-gate` skill, and for UI work the `design-review` skill, each run as a fresh subagent. Merges come only from the conductor's merge train (`.claude/sasori/merge-train.sh`).
- UI work follows `docs/design.md` and the `frontend-design` skill.
- Project settings (checks, base, hot files, merge method) are in `.sasori/config.json`; QA routes in `.sasori/qa.json`, plus one file per issue in `.sasori/qa.d/` (add a file there; don't edit `qa.json`). Tickets are GitHub issues.
- Every external service works keyless through `src/lib/services/` (`.claude/sasori/stack.md`). Never wait on a key; record it with a `needs-you` comment.
- This repo's own conventions in this file, `AGENTS.md` and the PR template win over Sasori's defaults.
