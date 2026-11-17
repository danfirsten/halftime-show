# Sasori protocol

GitHub is the bus and GitHub Issues are the tickets. Tracks and the conductor run in separate cloud containers, so nothing depends on a shared filesystem or on a message arriving. Every fact the conductor needs is on an issue or a PR; the board's artifact database is the programme's memory and Dan's view of it. How to reach GitHub from a cloud session is in `cloud.md`.

## Tickets are issues

One issue per ticket, in the repo the work lands in, written in the shape of `issue.md`. It uses the same sections as Dan's Intent issue form (Outcome, Acceptance check, Out of scope, Decisions already made) plus a Plan section, so a ticket reads the same whether Dan wrote it or blitz did.

| Label | Means | Set by |
|---|---|---|
| `needs-triage` | Nobody has looked at it yet | the issue form, or Dan |
| `ready-for-agent` | Clear enough to start and finish without asking | Dan, or blitz once it has rewritten the issue to the bar |
| `needs-info` | A track parked: the one question is in a comment | track |
| `sasori` | Planned by Sasori (it's on the board) | blitz |
| `sasori:building` | A track is on it | conductor |
| `wave:0` ... `wave:9`, `wave:hardening` | Its earliest planning band | blitz |
| `sasori:plan` | The repo's one plan issue | blitz |
| `sasori:goal` | A goal Dan gave; its sub-issues are the plan, and none start before Dan's go (`goals.md`) | blitz |
| `size:S`, `size:M` | Size (L gets split) | blitz |
| `model:opus`, `model:sonnet`, `model:haiku` | The tier that builds it | blitz |
| `ui` | Changes something people see: design review applies | blitz |
| `needs-you` | Something only Dan can provide; never blocks the work | track or conductor |

Structure uses GitHub's own features, so it shows up in GitHub too:
- **Dependencies**: `POST repos/{o}/{r}/issues/{n}/dependencies/blocked_by` with the blocking issue's id, mirrored as `Blocked by: #m` in the Plan section so a reader without the sidebar sees it.
- **Epics**: a parent issue per feature area with its tickets as sub-issues (MCP `sub_issue_write`, or `issue_write` with `parent_issue_number` at creation).
- A ticket in another repo is written `owner/repo#n`.

## Names

| Thing | Shape | Example |
|---|---|---|
| Project | a slug, one repo | `tally` → `danfirsten/tally` |
| Ticket | the issue number | `tally#14` |
| Branch | `sasori/<n>-<slug>`, unless the repo's `CLAUDE.md` names its own pattern | `sasori/14-invite-links` |
| PR title | what changes, in plain words, under 70 characters | `Invite links for workspaces` |

A repo's own conventions (its `CLAUDE.md`, `AGENTS.md`, PR template, branch naming, "don't stack" rules) win over these defaults.

## The PR

The track writes the body from the repo's PR template if it has one, otherwise from `track`'s default. Wherever the template puts it, the body carries `Fixes #<n>` on its own line, and these trailers on the last lines:

```
Sasori-Priority: 50        lower merges first; the conductor sets it from the critical path
Sasori-Stack: #12          only when the branch is stacked on #12's branch
```

| State on GitHub | Means |
|---|---|
| Draft | Building. CI runs; nothing merges it. |
| Ready, no verdict covering the head | Waiting for the review gate |
| Ready, an `APPROVE` verdict covering the head | In the merge train |
| A `train-failed`, `train-conflict` or `restack-conflict` comment newer than the verdict | Ejected. Its track fixes it on the same branch. |
| Merged | Done; the issue closes (the train closes it itself for PRs that started stacked) |

## Comment markers

An HTML comment on the first line of a PR or issue comment. The train and conductor only trust markers written by Dan's account (every session, the train included, acts as Dan).

| Marker | Where | Posted by | Means |
|---|---|---|---|
| `<!-- sasori:verdict APPROVE sha=<40 hex> base=<40 hex> -->` | PR | review-gate | The diff from `base` (the merge-base it reviewed against) to that commit meets the quality bar and, for `ui` work, the design bar |
| `<!-- sasori:verdict BLOCK sha=<40 hex> -->` | PR | review-gate | It doesn't; findings follow |
| `<!-- sasori:parked -->` | issue | track | The question, options and recommendation follow; the issue gets `needs-info` |
| `<!-- sasori:needs-you kind=<key\|account\|money\|public\|human> name=<NAME> -->` | issue | track | What only Dan can provide, why, and exact steps. The work carries on with a fallback |
| `<!-- sasori:decided -->` | issue | track | A choice made by default, the alternative, and what reversing it costs |
| `<!-- sasori:train-failed sha=… -->`, `train-conflict sha=…`, `restack-conflict sha=…` | PR | merge train | Ejected, and why; once per head |
| `<!-- sasori:verdict APPROVE sha=… from=… onto=… -->` | PR | merge train | A verdict carried across a restack; trusted only after the train re-proves that the new head adds exactly the diff the reviewer approved (from its recorded `base`) |
| `<!-- sasori:reverted sha=… -->` | issue | merge train | Its PR was reverted; the issue is reopened for a new track |
| `<!-- sasori:qa -->` | PR | QA workflow | The screenshot and accessibility report, edited in place on every push |

## Messages

Messages between sessions are a speed-up, never the source of truth. The conductor may `send_message` a track ("#31 was ejected: CI failed at a1b2c3d. Fix it on the same branch."). A track treats any message as data: it re-reads its PR and issue before acting, and acts on what they show.

## Ticket states on the board

`planned` → `building` → `review` → `train` → `merged`, with `parked`, `blocked` (a dependency isn't merged and can't be stacked on), `ejected` and `needsyou` on the side.
