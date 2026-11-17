# Gates

Sasori decides how to build on its own. What it builds towards is Dan's: the vision and the design. So a launch stops twice, once for each, and nothing after a gate starts until Dan says `go`. A `goal` stops once, at its plan (`goals.md`), because Dan asked for something small and should see exactly what it will be. Everything else stays automatic, merges included.

| Gate | Fires | The document | What Dan is shown |
|---|---|---|---|
| `vision` | After launch Phase 1, before any design, repo or issue | `docs/product-brief.md` | What it is in one sentence, who it's for, the user stories, the MVP and what's out, pricing and the success metric, every default taken |
| `design` | After launch Phase 2, before architecture | `docs/design.md`, and a rendered style page | The feel in words and references, type, colour and spacing, the motion language and the one orchestrated moment, wireframes, sample screens |
| `plan` | After a `goal` is planned, before any of its issues start | The goal issue (`sasori:goal`) and its sub-issues | The issues one line each with what they touch and their order, every default taken, the next goals if it was split (`goals.md`) |

Keys, accounts, money, anything public and contacting real people are still Dan's as well (`quality-bar.md`, "Keyless by default"), but they never stop the work: they go on needs-you as before.

## Firing a gate

1. Push the document where Dan can read it: before the repo exists, to this repo under `launches/<slug>/` on the branch `sasori/launch-<slug>`; after, to the product's repo. For `plan`, the document is the goal issue, already on GitHub; the `needsyou` id is `<slug>__gate__goal-<n>`, and the approval line goes in the goal issue's body.
2. For `design`, also make the **style page**: one self-contained HTML file beside `design.md` (`style.html`) that uses the tokens for real: the type scale, the palette in light and dark, buttons and form states, the landing page's first screen and the core screen with sample data, an empty state, and every motion token and the orchestrated moment running on a loop with a replay button and a reduced-motion toggle. Dan should feel it, not read about it. Publish it as an Artifact when this session has the Artifact tool, and link the file otherwise.
3. Board: a `needsyou` doc `<slug>__gate__<vision|design>` with `kind: gate`, `title` ("Plainly: the vision is ready for you"), `why` (two or three lines: the pitch, and the one or two calls most worth his eye), `link`, `state: open`; and the project's `stage` set to `held`, with `heldAt` naming the gate.
4. Tell Dan, in this session's reply: a short summary he can judge without opening anything (for `vision`: the one sentence, the stories as a list, what's out; for `design`: the feel in a line, the bold move, the motion in a line), the link, and "say `go <slug>` or tell me what to change".
5. End the turn. Nothing for that project starts while it's held. Other projects carry on.

## Answering one

Dan answers in any Sasori session, or by editing the document himself.

- **`go <slug>`**: add the approval line at the top of the document, `<!-- sasori:approved gate=<vision|design> date=<YYYY-MM-DD> -->`, push it, mark the `needsyou` doc done, put the stage back, and carry on from the step after the gate.
- **A change** ("make it for coaches, not climbers", "warmer, less corporate"): rewrite the document to match, with the date in "Defaults taken" where it overrides one, and fire the same gate again on the new version. Never take a change as a `go`.
- **Silence** is never a `go`. A gate doesn't time out.

## After approval: the documents are binding

- **blitz** traces every feature issue to a user story (`Serves: S3` in its Plan section). Functionality no story names isn't planned by default: it goes to Dan as a question, and the issue waits for his answer.
- **Tracks** read `docs/product-brief.md` with the issue, and park rather than build something that contradicts it.
- **The review gate** blocks a PR that contradicts the brief, or adds user-facing functionality no story names. **Design review** already judges every `ui` PR against `docs/design.md`.

## Changing the vision later

Say `rethink <slug>` (or ask for a change to either document) and the gate fires again: the conductor stops starting new work for that project, Sasori rewrites the document, and on `go` it re-triages every open issue the change touches (rewritten, closed or added, with blitz) before anything new starts. Running tracks finish to a ready PR, and the train keeps merging them.

A document Dan edits himself on GitHub counts as approved: he wrote it. The conductor sees the change on its next pulse, holds new starts for that project, and re-triages the same way.

Existing repos without a product brief (Spoor) aren't gated until Dan says `rethink` for them.
