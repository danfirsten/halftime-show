<!-- sasori:approved gate=vision date=2026-11-17 -->
# Halftime Show: product brief

A free, open-source browser extension (Chrome, Firefox and, from #21, Safari) for people who watch Hulu in a browser: when an ad break starts it mutes the Hulu tab and puts something better on top, and when the break ends it takes that away and turns the sound back on.

## Who it's for

Dan first, and anyone on Hulu's ad-supported plan who watches in Chrome, Edge, Arc, Brave or Firefox. Today they reach for the volume key every few minutes, miss the moment the show comes back, or sit through the same ad again. Existing tools either block or skip ads (which breaks Hulu's terms and gets broken by Hulu), are closed source, or are years out of date.

## What it does and doesn't do

- **Does:** notices an ad break, mutes only the Hulu tab, covers the ad with a "halftime show" (something to look at, play or do), and when the show resumes, removes the cover and unmutes, so you're back without touching anything.
- **Doesn't:** block, skip, speed up or hide ads from Hulu, or touch Hulu's network traffic. The ad still plays and counts; you just don't have to hear or watch it. That keeps it on the right side of Hulu's terms and makes it far less likely to break when Hulu changes things.
- **Mutes the tab, not the computer.** A browser extension can mute its own tab cleanly (Chrome's `tabs.update({ muted })`, Firefox the same). Muting the whole computer isn't possible from an extension, and would also silence music or a call. Tab mute is the better behaviour.

## User stories

| # | As a | I can | So that |
|---|---|---|---|
| S1 | viewer | have the Hulu tab muted the moment an ad break starts | I never hear ads |
| S2 | viewer | see a halftime show over the ad, sized to the break | the break is something I'd choose |
| S3 | viewer | have the sound and picture come back by themselves the moment the show resumes | I don't miss the first line |
| S4 | viewer | see how long the break has left | I know whether to start something |
| S5 | viewer | press a key to say "this is an ad" or "this isn't" when detection is wrong | one bad guess never ruins a show |
| S6 | viewer | turn it off for a tab or pause it, and choose my halftime show | it fits how I watch |
| S7 | viewer | have it work in full screen | it doesn't fall apart on the TV-sized view |
| S8 | contributor | fix detection when Hulu changes its player by editing one small, tested file | the project survives Hulu's updates |
| S9 | viewer | trust it | it collects nothing, has no account, makes no network calls of its own, and its code is public |

## Halftime shows (Dan, 17 Nov)

- **One-break word game:** guess a five-letter word before the ad ends; the streak carries across the episode. Word list shipped in the extension.
- **Quick trivia:** three quick questions per break (film, TV, general knowledge) from an openly licensed question bank shipped in the extension, credited.
- **Hoop's mini game:** a tiny ink arcade game starring Hoop from ink and paper (for example catching falling dots), high score saved, pausing itself when the show returns.
- **Something to look at:** a calm generative ink-and-paper drawing that builds over the break (contours, a field of marks).
- **The ad scoreboard:** ad time dodged today and this week, and time left in the break, in a corner of every halftime show.

## Core loop

1. You watch an episode on hulu.com in your browser.
2. An ad break starts: within about half a second the tab mutes, and the halftime show fades in over the video with the break's time left.
3. You play, look or do something for the length of the break.
4. The show resumes: the halftime show clears, the sound comes back, and a small "back" note shows for a moment. You never touched the remote.

## How it notices an ad (the hard part)

Hulu doesn't announce ads to the page, and its player changes. So detection is built to be resilient and easy to fix:
- **Several signals, scored together:** Hulu's own ad UI on screen (the "Ad" label and countdown, the ad progress bar), the ad's remaining time, and changes to the video element (a switch of source or duration at a break). A break starts when enough signals agree and ends when they clear, with a short hold so it doesn't flicker.
- **All Hulu-specific knowledge lives in one file** (`src/sites/hulu.ts`: selectors and text patterns), with tests against recorded page snapshots, so a contributor can fix a break in minutes.
- **A manual override** (a keyboard shortcut and a toolbar button) for when it's wrong, and a quiet "detection looks out of date" note if it stops seeing breaks.
- **Built for more sites later** (Peacock, Paramount+, Max, YouTube): each would be one more file in `src/sites/`. Only Hulu ships in v1.

The cloud sessions that build it can't sign in to Hulu, so the build uses a local stand-in page that behaves like Hulu's player, plus recorded snapshots. The real check is Dan watching one episode with it installed.

## MVP

| # | Feature | Stories | Why it's in the MVP |
|---|---|---|---|
| 1 | Extension shell for Chrome and Firefox (Manifest V3), installable unpacked | all | the product |
| 2 | Hulu ad detector with scored signals and one site file, tested against snapshots | S1, S3, S8 | the core |
| 3 | Mute and unmute the tab, restoring whatever the mute state was before | S1, S3 | the core |
| 4 | The halftime overlay: covers the video, works in full screen, time left, fades out when the show is back | S2, S4, S7 | the core |
| 5 | The halftime shows, Dan's pick: **a one-break word game**, **quick trivia**, **Hoop's mini game** and **something to look at** (a generative ink drawing), with **the ad scoreboard** (ad time dodged today and this week) always in a corner. A menu at the start of a break picks one, defaulting to the last used; the default is set in settings | S2, S4 | the reason to like it |
| 6 | Manual "ad / not an ad" shortcut and toolbar button | S5 | resilience |
| 7 | Settings popup: on or off per site, choose the halftime show, shortcut list | S6 | control |
| 8 | Privacy: no network calls, no analytics, no accounts, and a page that says so | S9 | trust, open source |

Out of the MVP: other streaming sites (one file each, later); a store listing (Dan's, below); syncing settings across devices; anything that skips or blocks ads.

## Market, in one minute

- [Interhulude](https://github.com/Timothee/Interhulude): open source (MIT), mutes and masks Hulu ads, but old; it relied on player APIs Hulu removed.
- [No Hulu Ads / Hulu Ad Skipper](https://chrome.google.com/webstore/detail/hulu-ad-skipper-ad-blocke/pgpdfnkeeppfohmophlpcfmciioeenig?hl=en): closed source; mute and fast-forward, and its support page reports Hulu detecting and breaking it.
- [Hulu Ad Blocker - EZ](https://chromewebstore.google.com/detail/deaplpcnddnenmnbcgmhcbelbeeiioem/): rewrites the stream to remove ads; closed source, and against Hulu's terms.
- Gists and bookmarklets that mute during ads ([one](https://gist.github.com/jonnypetraglia/8aedfa7cc89b12f43ce5928aca1855f8)): years old.

Nothing current is open source, mute-only and pleasant. The halftime show is the part nobody does.

## Pricing

Free and open source (MIT). No paid plan.

## Success metric

On Dan's own watching: across a week, every ad break muted within a second and unmuted within a second of the show returning, with no false mutes during the show. Then GitHub stars and store installs once it's public.

## First users

Dan. Then, once Dan publishes it: r/Hulu and r/cordcutters threads about Hulu ads, Product Hunt, and Hacker News (Show HN), as an open-source, terms-friendly alternative.

## Design

Dan's ink and paper design and motion system (tokens in `src/styles/tokens.css`): black and white, Geist, pills, the clip, marks and the cast. The overlay is the one moment: the halftime show opens over the ad with the system's clip. See `docs/design.md`: the edge is the clock.

## Safari (Dan, 17 Nov)

Safari runs the same WebExtension, with two differences (built in #21):
- **Muting:** Safari's support for muting a tab from an extension isn't confirmed, so muting goes through one adapter (`src/lib/mute.ts`): the tab mute where the browser supports it (Chrome, Firefox), and otherwise muting the page's video element from the content script, restoring the viewer's own volume and mute after the break. Either way a tab or player the viewer muted stays muted.
- **Manifest:** Manifest V3, as for Chrome and Firefox. Safari 16.4 or later: Manifest V3 needs 15.4, and the overlay's container queries and `color-mix` need 16.2. WXT builds Manifest V2 for Safari unless told otherwise, so `build:safari` passes `--mv3`.
- **Packaging:** Safari runs extensions only inside a Mac app. `npm run build:safari` makes the Safari build here, and a script run on Dan's Mac (`scripts/safari-app.sh`, using Apple's `xcrun safari-web-extension-converter` and Xcode) wraps it into an app he can run locally with Safari's "Allow Unsigned Extensions". Shipping on the App Store needs the Apple Developer Program (Dan's call).

## Architecture

- **Stack:** a WebExtension (Manifest V3) in TypeScript strict, built with [WXT](https://wxt.dev) (Vite underneath) into Chrome, Firefox and Safari builds from one codebase. Safari's build is Manifest V3 too (`npm run build:safari`, WXT's `--mv3`), the same shape as Chrome's. UI in Preact. Vitest for logic; Playwright loads the built extension in Chromium for end-to-end tests.
- **Entry points** (`entrypoints/`):
  - `background.ts`, the service worker: mutes and unmutes the tab through `src/lib/mute.ts` (`tabs.update({ muted })`, or in Safari it tells the content script to mute the page's video), remembering whether the user had it muted already so it never unmutes something they muted; owns the keyboard commands; keeps the scoreboard totals.
  - `hulu.content.ts`, the content script on `*.hulu.com`: runs the detector and mounts the overlay. Mounts into the player's full-screen element when there is one, so it works in full screen.
  - `popup/`: the toolbar popup (on or off for this site, today's scoreboard, the default halftime show, a link to options).
  - `options/`: settings (default show, per-site switch, shortcuts, a "detection looks out of date" note, privacy statement).
  - `fixture/` (development and tests only): a stand-in player page that behaves like Hulu's player with scripted ad breaks, so detection and the overlay can be tested without a Hulu account.
- **Modules** (`src/`):
  - `detect/`: the scored detector. Pure functions over a snapshot of signals, so it's unit-tested; `detect/observe.ts` feeds it from the page (a `MutationObserver` plus the video element's events), debounced.
  - `sites/hulu.ts`: everything Hulu-specific (selectors, text patterns, weights), with tests against recorded DOM snapshots in `src/sites/__snapshots__/`. More sites later are one file each.
  - `overlay/`: the Shadow DOM host, the edge clock, the break-start menu, the back note, the scoreboard corner.
  - `shows/`: one folder per halftime show (`five-letters`, `trivia`, `hoops-catch`, `look`), each a Preact component with the same small interface (`start(breakSeconds)`, `stop()`), plus its data (word list, question bank with its licence and credit).
  - `state/`: settings and per-show state in `storage.local`, typed.
  - `styles/tokens.css`: the ink and paper tokens.
- **Messages:** content script to background: `break:start`, `break:end`, `override`. Background to content: `command:override`, `settings:changed`.
- **Data model** (`storage.local`, no server): `settings` (enabled per site, default show, last show), `scoreboard` (seconds dodged per day, last 14 days), `shows.<name>` (streak, high score, last puzzle).
- **Permissions:** `tabs` (mute only), `storage`, host access to `*://*.hulu.com/*`. Nothing else. No remote code, no network calls of its own.
- **Roles:** one user, the person running the browser. Nothing to authorise.
- **External services:** none. The trivia bank and word list ship inside the extension.
- **Jobs:** none. Store packaging is `npm run zip` (Chrome and Firefox zips); Safari's is a Mac app made on Dan's Mac by `scripts/safari-app.sh`. Publishing to the stores is Dan's.

## Defaults taken

| Question | Default | Reversing it costs |
|---|---|---|
| Block or skip ads? | Never: mute and cover only | a policy change, not code |
| Mute the computer or the tab? | The Hulu tab | an extension can't mute the system |
| Browsers | Chrome and Chromium browsers, Firefox and Safari (Dan, 17 Nov) | n/a |
| Sites | Hulu only in v1, built for more | one file per site |
| Licence | MIT | one file |
| Repo visibility | already public (Dan made it so) | n/a |
| Store listings | Dan's call later (Chrome Web Store needs a one-off $5 developer account; Firefox Add-ons is free) | none until then |
| Data | none collected, none sent | n/a |
