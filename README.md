![Halftime Show: Hoop on the sofa at night, the TV's sound cut off and a small game on screen](docs/assets/banner.png)

# Halftime Show

A browser extension for watching Hulu in Chrome or Firefox, with Safari on the way. When an ad break starts, it mutes the Hulu tab and puts a halftime show on top: a five-letter word game, quick trivia, a small game with Hoop, or something calm to look at, with a clock that runs round the edge. When the show comes back, it clears the overlay and turns the sound back on.

It never blocks, skips or speeds up ads. The ad still plays underneath; you just don't have to hear or watch it.

**Status:** being built. Nothing to install yet.

## What it does

- Notices ad breaks on hulu.com from several signals at once, and mutes only that tab. If you had muted the tab yourself, it stays muted after the break.
- Covers the ad with a halftime show sized to the break, in a window or full screen.
- Puts the sound and picture back the moment the show returns.
- Lets you correct it with a shortcut (`Alt+Shift+A`, "this is an ad / this isn't") when it guesses wrong.
- Keeps a scoreboard of the ad time you've dodged today and this week.

## Privacy

No accounts, no analytics, no network calls of its own. It asks for three permissions only: `tabs` (to mute the tab), `storage` (your settings and high scores, on your machine) and access to `hulu.com`. Everything it needs ships inside it.

## Development

```bash
npm install
npm run dev          # Chrome with the extension loaded; npm run dev:firefox for Firefox
npm test             # unit tests
npm run e2e          # builds, then loads the extension in Chromium
npm run build        # .output/chrome-mv3; npm run build:firefox for Firefox, npm run build:safari for Safari
```

When Hulu changes its player, detection is fixed in one file, `src/sites/hulu.ts`, with tests against recorded page snapshots. See `docs/product-brief.md` for how it works and `docs/design.md` for the design.

## Safari

Safari runs extensions only inside a Mac app, so on a Mac you build that app yourself. Safari can't mute a tab from an extension, so there Halftime Show mutes the Hulu player's video instead, and puts your volume and mute back after the break.

You need a Mac with Safari 16.4 or later (macOS Monterey or newer) and Xcode (from the App Store; open it once after installing).

```bash
npm install
bash scripts/safari-app.sh   # builds the Safari version, wraps it in an app in safari/, builds and opens the app
```

Then, in Safari:

1. Settings, Advanced: tick "Show features for web developers" (on older Safari, "Show Develop menu in menu bar").
2. Develop, Developer Settings: tick "Allow unsigned extensions" (on older Safari it is in the Develop menu itself). Safari turns this off each time it quits, so tick it again after a restart.
3. Settings, Extensions: turn on Halftime Show.
4. Open hulu.com, click the Halftime Show button by the address bar, and allow it on hulu.com ("Always Allow on This Website").

Run the script again after changing the code. Putting it on the App Store needs a paid Apple Developer Program membership; that's a separate step.

## Not affiliated with Hulu

Halftime Show is an independent open-source project. It isn't made, endorsed or supported by Hulu. Hulu is a trademark of its owner.

## Credits

- Quick trivia's questions are a curated subset of the [Open Trivia Database](https://opentdb.com), shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). The file keeps its own licence and a note of what was changed: [src/shows/trivia/QUESTIONS-LICENSE.md](src/shows/trivia/QUESTIONS-LICENSE.md). The show prints the credit under every question. They ship inside the extension; nothing is fetched while you watch.
- Five letters uses word lists from [SCOWL](http://wordlist.aspell.net/) (Spell Checker Oriented Word Lists) by Kevin Atkinson, with its sources, mostly public domain. The licence text ships with the extension in `src/shows/five-letters/SCOWL-COPYRIGHT.txt`. SCOWL's licence allows copying, modifying and redistributing the lists for any purpose, so long as that notice stays with them. The lists reach this repo through the [`wordlist-english`](https://github.com/jacksonrayhamilton/wordlist-english) package (MIT), and `src/shows/five-letters/build-words.mjs` rebuilds the shipped list from it. The words are bundled in the extension; nothing is fetched.

## Licence

MIT. See [LICENSE](LICENSE), except the question bank above, which stays under CC BY-SA 4.0.
