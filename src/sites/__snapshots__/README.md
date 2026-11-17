# Detection snapshots

Copies of a player's page that `snapshots.test.ts` reads, each with the verdict the detector should reach.

| File | What it is |
|---|---|
| `fixture-*.html` | The stand-in player (`fixture/`), saved by the capture tool: `npm run build && node e2e/make-snapshots.mjs` |
| `hulu-reconstructed-*.html` | Not captures: rebuilt by hand from the selectors in `src/sites/hulu.ts`, until real ones exist |

To add a real Hulu page: open the extension's options page with `#capture` on the end of its address, play an
episode in another tab, and press "Save a detection snapshot" during an ad and again during the show. Read the file
before sharing it (scripts, links, images, form fields and account text are taken out), add it here as
`hulu-<date>-ad.html` or `hulu-<date>-show.html`, and add a line for it in `snapshots.test.ts`.
