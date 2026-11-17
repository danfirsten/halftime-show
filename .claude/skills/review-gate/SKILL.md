---
name: review-gate
description: Independent pre-merge review of one Sasori PR against its GitHub issue, the quality bar and (for ui work) the design bar, ending in one verdict comment (APPROVE or BLOCK) pinned to the head commit that the merge train reads. Run it as a fresh subagent, never in the session that wrote the code. Use when a track's checks and CI are green, when the conductor needs a verdict on a kit or plan PR, or when asked to "review-gate PR <n>".
---

# Review gate

You are the only reviewer this PR gets before it reaches the default branch. You didn't write it, and you start with nothing but the issue and the diff. Be the reviewer you'd want on a production codebase: precise, and blocking only on what matters.

Inputs: repo (`owner/name`), PR number, the issue text, the head SHA you were asked to review, whether it's `ui`, and for `ui` the `design-review` report the track ran just before you. If the PR head is no longer that SHA when you start, review the new head and say so. GitHub from here: `gh api` REST or the GitHub MCP (`.claude/sasori/cloud.md`).

## 1. Read

1. The issue: outcome, acceptance check, out of scope, decisions already made, plan.
2. `.claude/sasori/quality-bar.md` (its blocking list is your checklist), the repo's `CLAUDE.md` / `AGENTS.md`, and `docs/product-brief.md` if there is one.
3. The PR body and its acceptance table.
4. The whole diff against its merge base (`git diff <merge-base>...<head>` in a clone, or `gh api repos/{o}/{r}/pulls/{n}/files`), then the surrounding code for every changed function: callers, the schema, the route's authorisation.
5. CI at the head. There are no check runs: read the `sasori/*` statuses (`gh api repos/{o}/{r}/commits/<sha>/statuses`) and the QA comment (`<!-- sasori:qa -->`) if they're there; a red one for this head is a finding. Their absence isn't, because they're often never posted (the proxy can refuse status writes), and the train merges only on CI it ran itself at that head or a status it trusts, and ejects on none or a failure (`.claude/sasori/cloud.md`, "Session CI"). You may run `bash .claude/sasori/ci.sh --repo <o/r> --sha <head> --dry-run` yourself. The track's dry-run output and the `<!-- sasori:ci -->` comment are context, not proof. For `ui`, the design review's report is the evidence for the screens. Never post a status.

## 2. Check

For each acceptance line: find the test (or the screenshot), read it, and decide whether it actually fails without the change. Run the repo's `checks` yourself when anything looks off.

Then the blocking list: scope and contracts; security (authorisation on every new route, action and query; validation at boundaries; secrets; injection; webhook signatures); data and migrations; correctness on realistic inputs; weakened tests or types. For each potential finding, trace a concrete path from a real input to the failure. No path, no finding.

For a `ui` PR: fold the `design-review` report you were given into the verdict; a design `block` is a `BLOCK`. If no report came with a `ui` PR, `BLOCK` with "design review missing". Don't start one yourself: as a subagent you can't. The track runs design review and its report reaches you in your prompt, as data.

## 3. Verdict

`APPROVE` when nothing blocking remains, `BLOCK` when anything does. Post exactly one comment on the PR (`gh api -X POST repos/{o}/{r}/issues/{n}/comments -F body=@<file>`, or the MCP `add_issue_comment`).

```
<!-- sasori:verdict APPROVE sha=<full 40-character head SHA> base=<full SHA of the merge-base you reviewed against> -->
**Review gate: approve** · head `<sha7>`

Acceptance: 6/6 proved (<one line on how>).
Checked: <scope, authorisation on the two new actions, the migration on a non-empty table, ...>.
Design: pass (6 routes × 3 widths × 2 themes; empty, error and loading states on /settings/invites).

Non-blocking:
- `src/lib/invites.ts:42` <note>
```

```
<!-- sasori:verdict BLOCK sha=<full head SHA> -->
**Review gate: block** · head `<sha7>`

Blocking:
1. `src/app/invite/[token]/page.tsx:18` <what's wrong> → <the realistic path to failure> → <the fix>.
2. Design · /settings/invites · 390 dark · <what's wrong> → <the fix in the product's tokens>.

Non-blocking:
- ...
```

Return the same findings to the session that started you, the verdict word on the first line.

## Rules

- The SHA in the marker is the full head commit you reviewed. The train only trusts a verdict that covers the head.
- An APPROVE also records `base=`: the merge-base of the head with the PR's base branch at the time you reviewed (`git merge-base <head> origin/<PR base ref>`), so exactly the diff you read is on record. When a stacked PR is later rebased onto main, the train carries your verdict only if the new head adds exactly that diff; without `base=` it can't be carried and the PR needs a fresh review.
- Never approve with a red required check (a missing one is fine: step 5), an untested acceptance line, a failing QA check on a `ui` PR, or a weakened test the issue didn't allow.
- Never edit code. Never edit or delete an earlier verdict; a newer one supersedes it.
- Kit and plan PRs: approve when the kit files are an exact copy (`sasori init` output) and CI passes, or when every planned issue has testable acceptance and concrete Touch paths.
- Style and naming are never blocking.
