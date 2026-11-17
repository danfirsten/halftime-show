# Stand-in player

A local page that behaves enough like Hulu's web player to build and test against without an account. It is not
Hulu, not affiliated with Hulu, and holds no Hulu code or footage. The two clips are generated, silent and
plain (`ffmpeg`, a flat colour; the content clip says "SHOW").

Served by `npm start` at `/fixture/player.html`. Dev and test builds ship it; release builds do not (see below).

## Timeline

Seconds are counted from when the page loads. Query params:

| Param | Effect |
|---|---|
| `breaks=10:30,60:90` | `start:length` pairs. An ad break runs from `start` for `length` seconds. |
| `unknownLength=1` | The ad countdown is hidden, so the break's length can't be read from the page. |
| `flicker=1` | During a break the markers go dark for 400 ms every 3 s, and one 600 ms false flash of the markers happens at 5 s outside any break. |
| `fullscreen=1` | The first click or key press puts `#player` in full screen (browsers need a gesture). |

The control strip under the player has "Start a break now" (30 s), "End the break" and "Full screen". It sits outside
`#player`, so the detector never sees it. `window.fixtureState` holds `{ inBreak, markersVisible, elapsed, src }`
for tests.

## The markup contract

This is the one place the detector's expectations are written down. `src/sites/hulu.ts` (issue #3) reads these
and its real selectors for Hulu sit beside them; if one changes, change both and the tests.

| Signal | Content | Ad break |
|---|---|---|
| Ad label | `[data-fixture="ad-label"]` inside `[data-fixture="ad-ui"]` (hidden) | `ad-ui` visible, label text `Ad` |
| Ad countdown | hidden | `[data-fixture="ad-countdown"]` text like `0:25`, counting down; hidden when `unknownLength=1` |
| Ad progress bar | hidden | `[data-fixture="ad-progress"]`, `role="progressbar"`, `aria-valuenow` 0 to 100, filling |
| Video source | `<video data-fixture="video">` with `src` ending `content.webm` | `src` ends `ad.webm` |
| Player state | `#player[data-state="content"]` | `#player[data-state="ad"]` |

The video is the only `<video>`; it is muted by the page itself so that tab mute is what tests observe through
`tab.audible` and the extension's own state, not through the clip.

## Build flag

`wxt.config.ts` adds the match `*://localhost/fixture/*` to the content script, and copies `fixture/` into the
output, unless `HALFTIME_RELEASE=1`. Anything that makes a release (`npm run zip`, the store upload) must set it.
`e2e/release-manifest.test.mjs` builds with it and checks the manifest matches `*.hulu.com` only.
