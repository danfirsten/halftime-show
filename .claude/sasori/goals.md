# Goals

A goal is the small way to use Sasori: one outcome in one project, planned into a handful of issues, shown to Dan before anything starts, built, and then finished. When it's done, Sasori stops. Launch and blitz still plan everything in scope; a goal plans only what Dan named.

```
goal spoor: export runs as CSV
goal video-editor: trim handles on the timeline
```

The project is a board slug or a repo (`danfirsten/spoor`). A repo that isn't on the board yet becomes a project with `scope: goal` (below), after the kit PR if it has no kit (conductor, "New repos").

## What happens

1. **Plan.** `blitz` with the goal as its scope, in that one repo (blitz, "A goal"). At most six issues. Existing open issues that already do part of the goal join it instead of being duplicated. A goal that needs more than six is split: this goal is the first slice, and the plan names the next slices as goals Dan can give later. Nothing is planned that the goal didn't ask for.
2. **Write it down.** One goal issue in the repo, titled `Goal: <Dan's words>`, labelled `sasori:goal`. Its body is Dan's sentence (verbatim, under Outcome), the plan (`blitz/references/wave-plan.md`, the per-project block), and every decision taken by default. The planned issues are its sub-issues. They're labelled as blitz always labels them, so they're readable on GitHub before Dan says go.
3. **The plan gate** (`gates.md`). Until Dan answers, none of the goal's sub-issues start, in any project, whatever their labels: a sub-issue of a `sasori:goal` issue without the approval line never starts. The project's stage is `held` at `plan` unless another goal is building there. The summary in chat is the plan itself, short enough to judge without opening anything:
   ```
   Goal: export runs as CSV · spoor · 4 issues · about 2 h
    #81  S  Export endpoint for one run          touches src/api/runs.ts
    #82  S  Stream large runs                    touches src/api/export.ts · after #81
    #83  M  Download button on the run page  ui  touches src/app/runs/[id]/page.tsx · after #81
    #84  S  Export the filtered list         ui  touches src/app/runs/page.tsx · after #83
   Decided by default: CSV only, not XLSX (adding XLSX later: one adapter)
   Next goals, if you want them: scheduled exports
   Say go spoor, or tell me what to change.
   ```
4. **Answers.** `go <slug>` stamps the goal issue's body with `<!-- sasori:approved gate=plan date=<YYYY-MM-DD> -->` and starts it. A change ("drop #84", "do #83 first", "XLSX too") is made by blitz on the same goal issue and its sub-issues (dropped issues closed as not planned, with a comment), and the gate fires again on the new plan. `cancel goal <slug>` closes the goal issue and its open sub-issues as not planned and puts the project back to `idle`. Silence is never a go.
5. **Build.** The conductor runs it as usual (tracks, the review gate, the train), but in a goal-scoped project it starts only the open goal's sub-issues. The **open goal** is the oldest open `sasori:goal` issue in the repo that carries the approval line.
6. **Finish.** When every sub-issue is closed, none has a revert pending, and the base is green at its head: the conductor closes the goal issue (`completed`) with a comment holding the summary, sets the project's `goal.state` to `done` and its stage to `idle`, and tells Dan in the summary shape below. If another approved goal is waiting in that project, it becomes the open goal and starts in the same pulse. Otherwise, if nothing anywhere still needs the heartbeat, it switches it off (conductor, "Going idle").

```
Goal done: export runs as CSV · spoor · 4 merged · main green
Merged      #81 #82 #83 #84
Decided     CSV only, not XLSX
Needs you   nothing
Next goals  scheduled exports
I've gone idle. Give me a goal, or say go, to start again.
```

## Scope

A project's `scope` on the board is `goal` or `all`.

- `goal`: only the open goal's sub-issues start. With no open goal, nothing starts in that project, even issues labelled `ready-for-agent`. Projects that Dan first named in a `goal` get this.
- `all`: everything planned and ready starts, as before. Launches get this, and so does a project Dan blitzes (`blitz <project>`), since asking for all of it is the point.

Dan can switch either way by saying `scope <slug> goal` or `scope <slug> all`.

One goal per project is open at a time. A second `goal` for the same project is planned and gated as usual, and on `go` waits behind the open one: it starts the moment the first one finishes. Goals in different projects run side by side.
