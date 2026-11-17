# Issue template

Every Sasori ticket is a GitHub issue in this shape. The first four sections are Dan's Intent issue form, so issues he files by hand and issues blitz writes read the same. The Plan section is what a track needs to start without asking. The whole body is pasted into the track's prompt.

```markdown
### Outcome
A workspace owner can share a link that lets anyone with it join as a member, so teams onboard without email invites.

### Acceptance check
1. An owner can create, copy and revoke an invite link on the workspace settings page.
2. A signed-in user opening a valid link joins as a member and lands on the workspace.
3. A signed-out user is sent to sign up, then joins after signing up.
4. A revoked or expired (7 days) link shows "This invite has expired" and joins nobody.
5. Members and non-members can't create or revoke links (403 from the action).
6. The settings panel and the expired page meet the design bar at 390, 768 and 1440 wide, light and dark.

### Out of scope
Email invites. Changes to auth configuration or the members table's shape.

### Decisions already made
- Links expire after 7 days (default, reversible: one constant and a test).
- Links are multi-use.

### Plan
Serves: S4 (an owner can bring their team in without email)
Approach: an `invites` table (token hash, workspace, expiry, revokedAt); server actions under `src/app/(app)/w/[slug]/settings/invites/`. The token is 32 random bytes and only its SHA-256 is stored. Ruled out: signed JWT links, because revocation needs a lookup anyway.
Touch: src/db/schema.ts (append invites), src/db/migrations/, src/app/(app)/w/[slug]/settings/invites/, src/app/invite/[token]/, src/lib/invites.ts, e2e/invites.spec.ts
Hot files: src/db/schema.ts
Blocked by: #9 (workspaces)
Stack on: #9 if it isn't merged when this starts
Wave: 2 · Size: M · Model: sonnet · UI: yes
Keys: none (works keyless)
Test plan: unit for token and expiry logic · integration for the actions with PGlite · e2e for checks 2 to 4 · QA screenshots for 6
```

Rules:
- Every acceptance line is something a test, a run or a screenshot can show. Rewrite it until it is.
- A `UI: yes` ticket always has a design acceptance line, and the label `ui`.
- `Serves` names the product brief's user story the ticket delivers. A ticket in a repo with an approved brief (`.claude/sasori/gates.md`) always has one; foundation and hardening tickets say `Serves: foundation` or `Serves: hardening`.
- `Touch` comes from reading the code (for a new repo, from the architecture in the product brief): concrete paths, not areas.
- `Model`: `opus` for foundation, data model, auth, payments, concurrency, design direction and anything security-sensitive; `sonnet` for features, UI and tests; `haiku` for docs, copy and mechanical changes.
- `Decisions already made` holds every choice taken by default. Each is reversible, and the board lists it so Dan can override it.
- `Keys` names any secret the real behaviour needs and confirms the keyless fallback.
- No secrets, tokens or customer data in an issue.
