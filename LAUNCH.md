# Launching Halftime Show

How to install Halftime Show on your own machine today, what to do if it misses an ad break, and, if you want, how to put it in the stores. Publishing is your choice; nothing here happens unless you do it.

You need Node 20 or later and this repository on your machine.

## 1. Build it

```bash
npm ci
npm run zip
```

`npm run zip` makes the release builds, the ones with no test page in them:

| What | Where | For |
|---|---|---|
| Chrome, Edge, Arc, Brave | `.output/chrome-mv3/` (folder) and `.output/halftime-show-<version>-chrome.zip` | loading unpacked, or the Chrome Web Store |
| Firefox | `.output/firefox-mv3/` (folder) and `.output/halftime-show-<version>-firefox.zip` | loading in Firefox, or Firefox Add-ons |
| Firefox's source copy | `.output/halftime-show-<version>-sources.zip` | Firefox Add-ons asks for it, since the code is bundled |

Use these, not `npm run build`: a plain build also carries the stand-in player used for testing.

## 2. Install it

### Chrome (and Edge, Arc, Brave)

1. Open `chrome://extensions` (in Edge, `edge://extensions`).
2. Turn on **Developer mode** (top right).
3. Press **Load unpacked** and choose the `.output/chrome-mv3` folder.
4. Pin Halftime Show from the puzzle-piece menu, so its button is by the address bar.

It stays installed across restarts. After pulling new code, run `npm run zip` again and press the reload arrow on its card in `chrome://extensions`.

### Firefox

Firefox 140 or later.

1. Open `about:debugging#/runtime/this-firefox`.
2. Press **Load Temporary Add-on…** and choose `.output/firefox-mv3/manifest.json`.
3. Open hulu.com. If the Halftime Show button in the extensions menu asks for access, allow it on hulu.com (or in `about:addons`, Halftime Show, Permissions, turn on access to hulu.com).

A temporary add-on goes when Firefox quits. To keep it installed, sign it for yourself, free: upload the Firefox zip to Firefox Add-ons as **On your own** (step 5), download the signed `.xpi` it gives back, and open that in Firefox.

### Safari

On a Mac with Safari 16.4 or later and Xcode:

```bash
npm ci
bash scripts/safari-app.sh
```

It makes the Safari build, wraps it in a Mac app in `safari/` and opens it. Then, in Safari:

1. Settings, Advanced: tick **Show features for web developers** (on older Safari, "Show Develop menu in menu bar").
2. Develop, Developer Settings: tick **Allow unsigned extensions**. Safari turns this off each time it quits, so tick it again after a restart.
3. Settings, Extensions: turn on Halftime Show.
4. Open hulu.com, press the Halftime Show button by the address bar and choose **Always Allow on This Website**.

Safari can't mute a tab from an extension, so there Halftime Show mutes the Hulu player itself and puts your volume back after the break.

## 3. Check it on a real episode

The cloud sessions that built this can't sign in to Hulu, so this check is yours. Watch one episode on the ad-supported plan and look for:

- The tab mutes within about a second of each ad starting, and the halftime show covers the ad.
- The sound and picture come back within about a second of the show returning, with a short "Back. Sound on." note.
- Nothing mutes during the show itself.
- In full screen, the halftime show covers the screen and Esc still leaves full screen.
- If you mute the tab yourself before a break, it stays muted afterwards.

Firefox: the same check once there. The automated tests run in Chromium only, because Playwright can't load an extension into Firefox, so Firefox is checked by hand.

## 4. If it misses a break

Hulu changes its player now and then. When Halftime Show misses an ad, or covers something that isn't one:

1. Press **Alt+Shift+A** (or the button in the toolbar popup) to say "this is an ad" or "this isn't". That fixes the moment.
2. Save a detection snapshot, ideally while the ad is on screen:
   - Keep the episode open in its tab.
   - Open Halftime Show's options (the popup's **Options** link), add `#capture` to the end of the address and press Enter.
   - Press **Save a detection snapshot**. A file named `halftime-snapshot-<date>.html` goes to your downloads.
3. Open an issue on GitHub with the snapshot attached, and say what happened ("missed the ad at 12:40", "muted during the show").

The snapshot is a copy of the player's part of the page only. Scripts, links, images, form fields and anything that looks like your name, profile or email are taken out before it is saved. Open it in a text editor first if you want to check; nothing is sent anywhere unless you attach it.

The fix goes in one file, `src/sites/hulu.ts`, with a test against the snapshot in `src/sites/__snapshots__/`.

## 5. Putting it in the stores (your choice)

None of this is needed to use it yourself. Each store reviews the add-on before it goes live.

Words you can use in both listings:

- **Name:** Halftime Show
- **Summary:** Mutes the ad break and puts something better on top.
- **Single purpose:** During a Hulu ad break, mutes the tab and covers the ad with a small game or something to look at, then gives the sound and picture back when the show returns. It never blocks, skips or speeds up ads.
- **Permissions:** `tabs`, to mute and unmute the tab. `storage`, to keep settings and scores in the browser. Access to hulu.com, to notice ad breaks and cover them.
- **Data:** none collected, none sent. No accounts, no analytics, no remote code.
- **Not affiliated with Hulu:** say so in the description, and use your own screenshots of the halftime show, not Hulu's artwork or logo.

### Chrome Web Store

- **Cost:** a one-off $5 developer registration fee.
1. Sign up at the Chrome Web Store Developer Dashboard (chrome.google.com/webstore/devconsole) and pay the fee.
2. **New item**, upload `halftime-show-<version>-chrome.zip`.
3. Fill in the listing: description, at least one 1280 by 800 screenshot, the category (Entertainment works).
4. Privacy practices: the single purpose and permission reasons above; "No, I am not using remote code"; tick that you collect no user data. For the privacy policy link, the Privacy section of the README on GitHub will do.
5. Submit for review. Reviews usually take a few days.

### Firefox Add-ons

- **Cost:** free.
1. Sign in at addons.mozilla.org/developers with a Firefox account.
2. **Submit a New Add-on**. Choose **On this site** for a public listing, or **On your own** to get a signed file for yourself only.
3. Upload `halftime-show-<version>-firefox.zip`.
4. When asked for source code, upload `halftime-show-<version>-sources.zip` and give these build steps: "Node 20 or later. `npm ci`, then `npm run zip`. The add-on is `.output/firefox-mv3/`."
5. The add-on already says it collects no data (in its manifest), so the data question is answered.
6. Submit. Signing for "On your own" is usually minutes; a public listing is reviewed first.

The Firefox add-on ID is `halftime-show@danfirsten.github.io`. Keep it: Firefox Add-ons knows the add-on by it.

### Safari (App Store)

Needs the Apple Developer Program, $99 a year. Open the project `scripts/safari-app.sh` made in Xcode, set your team under Signing, then Product, Archive, and upload from the Organizer to App Store Connect. Without the programme, the local app from step 2 works on your own Mac.

### Each new version

Raise `version` in `package.json`, run `npm run zip`, and upload the new zips the same way.
