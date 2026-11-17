<!-- sasori:approved gate=design date=2026-11-17 -->
# Halftime Show: design direction

Built in Dan's ink and paper design and motion system. Its tokens are in `src/styles/tokens.css` and Hoop's drawing in `assets/hoop.svg`; the rest of the system lives in Dan's own repository. Where the system already decides something (black and white, Geist and Geist Mono, pills, the four curves, marks, the cast, the voice), Halftime Show follows it exactly, and Dan's system wins over the factory's design-bar defaults. This file only adds what an overlay on top of someone else's video player needs. `docs/design/style.html` shows it running; `docs/design/banner.html` is the README header.

## Subject, audience, job

- **Subject:** the gap in the middle of a broadcast. In sport it's half-time: the scoreboard stays up, the clock runs down, and something is put on to fill the gap until play starts again. On television it's the old intermission card and "we'll be right back". The materials are a scoreboard, a game clock, a curtain, a card held up in front of the picture, a pencil puzzle on the sofa arm.
- **Audience:** Dan first, then anyone on an ad-supported plan watching in Chrome, Edge, Arc, Brave or Firefox. Mostly at night, lights low, often full screen on a laptop at arm's length or a browser on a TV across the room. They are leaning back. Their hands may be on a keyboard, a trackpad, or nowhere at all. They did not come to use an app; they came to watch something, and this is the bit in the middle.
- **Primary job:** in the half second after an ad starts, take the sound away and put something better over the picture; keep the time left in view the whole way; and when the show comes back, get out of the way so cleanly that the first line of dialogue is heard. Everything else (the games, the scoreboard, the settings) serves that.

## The one bold move: the edge is the clock

The halftime show opens over the ad as a card in the system's clip, and **its own edge is the break's clock**. A 2 px line runs all the way round the card's rounded edge, 10 px in from the video's border, and it drains clockwise from the top-left corner as the break runs down. When the line is gone, the show is back.

- You can read it from across the room without reading anything: a full edge is a long break, a sliver is "put the drink down".
- It needs no colour and no extra element. It is the frame the halftime show already lives in, made to tell the time, like the shot clock built into the backboard.
- **When the break's length isn't known** (the player didn't show a countdown and no signal gave a duration), the edge is drawn as a dotted line that doesn't drain, and the time left reads `Ad break`. Dotted means "we don't know yet" here as it does across ink and paper (the dotted ring is the "held" mark).
- It is a progress bar, so it has `role="progressbar"` with `aria-valuenow` in seconds, and the same time is always written as text in the scoreboard. The edge never carries meaning on its own.

Everything else stays quiet: black, Geist, generous space, one thing in the middle of the screen.

### The scoreboard

In the top-right corner of every halftime show, the same three numbers in Geist Mono with tabular figures:

```
1:42  left in this break
Dodged today 14:30
This week 1:52:10
```

The time left is the largest number on the screen after the show itself. "Dodged" counts ad seconds that played while the tab was muted and covered, so it is a real measure of what happened, never an estimate. It is kept in `chrome.storage.local`, by local date, and never leaves the browser.

### Hoop

Hoop (the ring, `characters/hoop.svg`) is the cast member for tools that watch, and Halftime Show watches the player. Hoop appears in four places only:
- **The toolbar icon.** Eyes open while watching for breaks; filled ink (the inverse) during a break; eyes as closed lines while paused; a dotted ring when off for this site.
- **Hoop's catch**, the third halftime show, where Hoop is the player.
- **The popup's empty state**, watching an empty screen.
- **The banner**, on the sofa.

Hoop's move is looking through itself like a lens, so in Hoop's catch a dot is caught by falling **through** the ring, not by bumping into it. Hoop is always the opposite of what is under it: paper outline and paper eyes on the ink overlay.

## Colour

- **Black and white only**, from the system's theme roles (`--bg`, `--surface`, `--fg`, `--soft`, `--muted`, `--rule`, `--fill`, `--inv-bg`, `--inv-fg`). Components never name a palette value. No accent, no state colours.
- **The overlay is always ink**, whatever the system theme. It sits over a dark video, usually at night, often in a dark room. A paper card opening over a film would be a flash of light in someone's face and would look like the picture had broken. Ink matches the letterbox bars and the player's own chrome, so the clip opening reads as the picture changing, not as a light coming on. It is set with the system's `.dark` section class on the overlay's root inside its Shadow DOM, so no setting can turn it to paper.
- **The overlay is fully opaque.** It exists so you don't have to watch the ad; a see-through scrim would defeat that. The ad still plays underneath and counts, as the brief requires.
- **The popup and the options page follow the browser** (`data-theme="auto"`): they are browser chrome, opened in daylight as often as at night, and should match the toolbar they drop from.
- **State without colour,** using the system's rules:

| State | How it shows |
|---|---|
| A break is on (popup) | The system's live disc, breathing, in the status pill: `In a break, 1:42 left` |
| Watching, no break | A still solid disc: `Watching for ad breaks` |
| Paused | A ring: `Paused until 22:40` |
| Off for this site | A dotted ring: `Off on hulu.com` |
| Time left unknown | The edge as a dotted line, `Ad break` in place of the time |
| Detection looks out of date | An outlined banner with plain words (below) |
| Five letters: right letter, right place | Tile filled `--inv-bg` with `--inv-fg` letter |
| Five letters: right letter, wrong place | 1 px `--fg` outline and a ring mark in the tile's corner |
| Five letters: not in the word | No outline, letter in `--muted` |
| Trivia: your answer, right | Pill turns solid, `Right` beside it |
| Trivia: your answer, wrong | Pill outline turns dashed, `Not this one` beside it, the right answer turns solid |

Contrast on the overlay: `--fg` (#F2F2EE) on ink is 17.4:1; `--muted` (#8F8F8A) on ink is 6.2:1; the edge clock (`--fg`, 2 px) over its track (`--rule`, #262626) is a UI element at 17.4:1 against the background. The popup's paper theme uses mute (#5E5E5A) on paper at 6.3:1.

## Type

Geist and Geist Mono, from the system (Dan's choice, so it stays even though the factory's design bar calls Geist a default). Bundled in the extension as WOFF2 from Fontsource and declared inside the overlay's Shadow DOM, so nothing is fetched at run time (the brief's "no network calls of its own"). Tabular figures (`.num`) for every time, score and count.

The overlay has no fixed size, so its type is set in **container query units** on the overlay root (`container-type: size`), clamped so it stays legible in a small window and doesn't shout in full screen on a TV:

| Step | Overlay size | Weight, tracking, line-height | Use |
|---|---|---|---|
| Show | `clamp(28px, 7cqi, 96px)` | 500, −0.05em, 0.95 | Five letters tiles, Hoop's catch score |
| Title | `clamp(20px, 3.4cqi, 48px)` | 500, −0.035em, 1.1 | A trivia question, the menu's choices |
| Body | `clamp(14px, 1.7cqi, 22px)` | 400, 0, 1.45 | Answers, notes, the menu's one-line descriptions |
| Clock | `clamp(18px, 2.8cqi, 40px)` | Geist Mono 500, 0, 1 | Time left |
| Label | `clamp(11px, 1.15cqi, 15px)` | Geist Mono 400, +0.04em, sentence case | Dodged today, keys, streak, credits |

The popup and options page use the system's fixed steps: H2 at 22 px / 500 / −0.03em, body 14 px / 1.45, labels mono 11 px. Labels are sentence case everywhere (`data-surface="app"`): this is a tool, and capitals read as shouting from a sofa too. Nothing is ever below 11 px, even in the smallest window.

Wordmark: `halftime show`, lowercase, Geist 500 at −0.05em, after Hoop drawn at the cap height.

## Space, radius, elevation

- **Space:** the system's 4 px steps: 4, 8, 12, 16, 24, 32, 48, 64. The overlay's padding is `clamp(16px, 3.2cqi, 48px)`, so content never touches the edge clock.
- **Radius by role:**
  - 20 px (media) for the edge clock's corners, and the radius the clip starts from (32 px) and ends square: the overlay itself is a picture laid exactly over a picture, so it has no radius;
  - 24 px (card) for the popup's sections when they have a border;
  - 12 px (chip) for Five letters tiles, key caps, the menu's choices and fields;
  - 999 px for buttons, pills, the show tabs and the back note.
- **Elevation:** flat. Nothing in the overlay has a shadow, because it is the top layer already. Only the back note floats over the show, with the system's one `--shadow`, and the popup has none (the browser draws its own).
- **Sizes the overlay is checked at** (container width of the video element):
  - **Small, under 560 px** (a narrow window or the browser's mini player): the scoreboard shrinks to the time left only, the show tabs collapse to a `1 2 3 4` key row, Five letters drops its on-screen keyboard, the menu is a list.
  - **Medium, 560 to 1099 px:** everything, in the layout in the wireframes.
  - **Large, 1100 px and up** (full screen): the same layout, type at its clamp maximums, and the pointer hides after 3 s still.
- **Touch and pointer targets** are at least 44 px at every size; the show's own controls are keyboard-first, because the hands are usually on a keyboard if anywhere.

## Motion

The system's curves at app speed. Every value below is a token in `src/overlay/tokens.css`, which imports the system's.

| Token | Value | Use |
|---|---|---|
| `--ease-out` | `cubic-bezier(.23,1,.32,1)` | fades, hovers, the back note |
| `--ease-expo` | `cubic-bezier(.16,1,.3,1)` | the show settling inside the clip, a new tile row |
| `--ease-inout` | `cubic-bezier(.77,0,.175,1)` | the clip, opening and closing |
| `--ease-drawer` | `cubic-bezier(.32,.72,0,1)` | the options page's sections, the popup's pause menu |
| `--dur-quick` | 150 ms | press, hover, focus, a tile filling |
| `--dur-base` | 220 ms | something new appearing: a show starting, a trivia answer, the back note |
| `--dur-slow` | 320 ms | the pause menu in the popup |
| `--dur-open` | 700 ms | the clip opening (the moment) |
| `--dur-settle` | 900 ms | the show inside settling from 1.08× (the moment) |
| `--dur-close` | 480 ms | the clip closing (the moment) |
| `--dur-hold` | 4 s | how long the back note stays |

### The orchestrated moment: the clip opens over the ad, and closes back to the show

- **Surface:** the overlay on the stand-in player page (`test/stand-in/player.html`, and on hulu.com in Dan's real check).
- **Selector:** `halftime-show-root` (the Shadow DOM host) `>>> .hs`.
- **Trigger (open):** the detector's score crosses the break threshold, or Dan presses `Alt+Shift+A` with no break on.
- **Trigger (close):** the detector's score falls back under the threshold after its hold, or the edge clock reaches zero and the player's ad UI has gone, or Dan presses `Alt+Shift+A` during a break ("this isn't an ad").
- **Open, 900 ms in all:**
  1. **0 ms:** the tab is muted. Sound goes first, before any pixel changes, so not a syllable of the ad is heard.
  2. **0 to 700 ms:** the overlay opens with the system's clip, `clip-path: inset(15% round 32px)` to `inset(0)`, on `--ease-inout`. It ends square, not at the system's `round 20px`, because rounded corners on a cover would leave four slivers of the ad showing; the 20 px radius lives on the edge clock instead. Its opacity goes 0 to 1 over the first 220 ms on `--ease-out`, so the ad is never seen whole.
  3. **0 to 900 ms:** at the same time the content inside settles from `scale(1.08)` to `scale(1)` on `--ease-expo`. (The editorial clip settles from 1.15×; text at 1.15× over a TV picture swims, so the app version is smaller.)
  4. **700 ms:** the edge clock is drawn at full (it doesn't draw in) and starts draining.
- **Close, 480 ms plus the note:**
  1. **0 ms:** the tab is unmuted to whatever it was before the break (a tab that was muted already stays muted). Sound goes first again, so the first line of the show is heard.
  2. **0 to 480 ms:** the clip runs backwards, `inset(0)` to `inset(15% round 32px)`, on `--ease-inout`, while opacity goes 1 to 0 over the last 220 ms. Any game pauses itself before the first frame of the close.
  3. **480 ms:** the back note fades in (`--dur-base`, `--ease-out`), stays for `--dur-hold`, and fades out.
- **Reduced motion:** the mute and unmute are unchanged. The overlay fades in over 150 ms and out over 150 ms, with no clip and no settle. The back note appears and goes with the same fade.

### Everything else

| Thing | Motion | Reduced motion |
|---|---|---|
| The edge clock | The 2 px line shortens clockwise, updated every second with a 1 s linear step (a clock, so linear is right) | The line jumps once every 5 s with no transition; the time in the scoreboard carries the detail |
| The break-start menu's countdown | `Starts in 3`, `2`, `1`: the number swaps in place with a 150 ms fade | The same: it is opacity only |
| A show starting from the menu | The menu fades out and the show fades in place, `--dur-base`. No slide | Unchanged (opacity only) |
| Switching show with 1 to 4 | Crossfade in place, `--dur-base` | Unchanged |
| Five letters: a guess is marked | Each tile turns, left to right, 60 ms apart: the fill or outline fades in over `--dur-quick`. No flip, no shake | All five tiles change at once |
| Five letters: a word that isn't in the list | The row's outline goes dashed for 1.2 s with `Not in the word list` under it. No shake | Unchanged |
| Trivia: an answer | Your pill fills or dashes over `--dur-quick`; the next question fades in after 1.2 s | Unchanged |
| Hoop's catch | The game runs at the display's frame rate; Hoop glides to the pointer or arrow keys with a short `--ease-out` follow | The game stays playable: dots still fall (it is the game, not decoration) but the follow easing is off and Hoop's blink is off. Dan can pick another show |
| Something to look at | Marks are added a few at a time across the whole break, so it completes as the break ends | Marks arrive in batches every 5 s, each batch fading in over `--dur-base`. Nothing moves |
| The live disc in the popup | Breathes in opacity, 1.6 s, while a break is on. The only loop in the product, inside `role="status"` | Holds still; the words carry the state |
| Press, anywhere | Scale to 0.97, `--dur-quick` | No scale; the pressed state shows by fill |
| Popup pause menu | Opens as a drawer, `--dur-slow`, `--ease-drawer` | Fades in |

No fade-and-slide entrances anywhere, no bounce, no `transition: all`. Nothing loops except the live disc and the halftime shows themselves while a break is on.

### Interactions list (filmed by QA)

QA loads the built extension in Playwright against the stand-in player and drives its fake ad breaks (`?break=at:2s,for:30s`).

| Surface | Selector | Action | Label |
|---|---|---|---|
| Stand-in player | `.hs` | fake break starts | The clip opens over the ad (the moment, open) |
| Stand-in player | `.hs` | fake break ends | The clip closes back to the show (the moment, close) |
| Stand-in player | `.hs-back` | fake break ends | The back note appears and goes |
| Stand-in player | `.hs-menu [data-show="trivia"]` | click | Choose Quick trivia from the menu |
| Stand-in player | `.hs-menu` | key `1` | Choose Five letters with a key |
| Stand-in player | `.hs-tabs button:nth-child(3)` | click | Switch to Hoop's catch mid-break |
| Stand-in player | `.hs-words` | type `CRANE` and Enter | A guess is marked |
| Stand-in player | `.hs-words` | type `ZZZZZ` and Enter | Not in the word list |
| Stand-in player | `.hs-trivia .hs-answer:first-child` | click | Answer a trivia question |
| Stand-in player | `.hs-catch` | arrow keys | Hoop moves |
| Stand-in player | `.hs-notad` | click | Mark as not an ad: the clip closes, sound comes back |
| Stand-in player | `.hs-edge` | wait 3 s | The edge clock drains |
| Stand-in player, 480 px window | `.hs` | fake break starts | Small size layout |
| Stand-in player, full screen | `.hs` | fake break starts | Full-screen layout |
| `popup.html` | `.pp-show [data-show="look"]` | click | Choose the default halftime show |
| `popup.html` | `.pp-mark` | click | This is an ad |
| `popup.html` | `.pp-pause` | click | The pause menu opens |
| `options.html` | `.op-reset` | click | Reset the scoreboard asks first |

## Layout of the overlay

- **Layering:** the overlay's Shadow DOM host is appended inside the player's own container (the element the player sends full screen), not to `<body>`, so it stays on top in full screen. It covers the video's box exactly and follows it with a `ResizeObserver`.
- **Four zones,** the same at every size: the wordmark top left, the scoreboard top right, the show in the middle, the show tabs bottom left, and `Not an ad` bottom right.
- **Keys while the overlay is open:** `1` to `4` pick a show (and `Tab` moves focus as usual). The overlay stops key events from reaching the player while it is open, so typing a guess never seeks or pauses the ad underneath. It never uses `Esc`, because `Esc` leaves full screen.
- **Alignment:** the show sits centred in the middle zone (it is a stage, seen from across a room); every label, the scoreboard and the tabs are aligned to the padding edge.

## Voice

Plain, brief, a bit of half-time warmth. Three words: **calm, plain, courtside**. It talks like the person on the sofa next to you, not like an app: short sentences, no exclamation marks, no cheering. Every number is real and from this browser. It never calls Hulu a partner; the site is named only as a site, for example `On for hulu.com`, and the options page says "Halftime Show is not made by or affiliated with Hulu."

| Kind | String |
|---|---|
| Button | `Play Five letters` · `Not an ad` · `This is an ad` · `Pause for an hour` |
| Menu heading | "Ad break. 1:42 left. Pick a halftime show." |
| Menu countdown | "Five letters starts in 3." (the last one used) |
| Back note | "Back. Sound on." with, below it, "1:42 of ads dodged." |
| Five letters, solved | "Got it in 4. Streak 3 this episode." |
| Five letters, out of time | "Out of time. It was PAUSE. Streak back to 0." (in the back note) |
| Hoop's catch, paused | "Paused at 23 when the show came back. It carries on next break." |
| Empty state (popup, no breaks yet) | "No ad breaks yet. Start an episode and the first one opens here." |
| First run (the first menu) | "First break. The tab is muted and the ad is underneath. Pick something for the next 1:42." |
| Error | "Can't mute this tab. Firefox needs the Tabs permission: open Options and press Allow." |
| Detection out of date | "No breaks spotted in the last 3 episodes. Detection may be out of date. Press Alt+Shift+A at the next ad, and report it on GitHub." |
| Success | "Marked as an ad. Tab muted." · "Marked as not an ad. Sound on." |
| Confirmation | "Reset ad time dodged for today and this week? High scores stay." |
| Privacy line | "Collects nothing. Makes no network calls. The code is public." |

The four shows are named in plain words, the same everywhere (menu, tabs, popup, options): **Five letters**, **Quick trivia**, **Hoop's catch**, **Something to look at**.

## Brand kit

- **Wordmark:** `halftime show` in Geist 500, −0.05em, lowercase, with Hoop before it at the cap height. On the overlay it is 60% opacity: present, not loud.
- **Toolbar icon** (16, 32, 48, 128 px, SVG source plus PNG): Hoop, in the four states above. Drawn in ink on a transparent ground with a paper version for dark toolbars, chosen by `theme_icons` in Firefox and by `matchMedia` in Chrome's action API.
- **Store and README art:** the banner (`banner.html`); store screenshots are real captures from the stand-in player, labelled "Stand-in player", never a mock of the real site.
- **Theme colour:** `#0B0B0B`.

## Wireframes

### 1. The break-start menu (the moment has just opened)

```
╭──────────────────────────────────────────────────────────────────────────╮
│ ○ halftime show                                       1:42  left in break │
│                                                     Dodged today 14:30    │
│                                                     This week 1:52:10     │
│                                                                          │
│        Ad break. 1:42 left. Pick a halftime show.                        │
│                                                                          │
│        ┌──────────────────────────────────────────────────────┐          │
│        │ 1  ▢▢▢▢▢  Five letters        Last time, starts in 3 │ ◀ inverted│
│        └──────────────────────────────────────────────────────┘          │
│          2  ?      Quick trivia        Three questions                    │
│          3  ○      Hoop's catch        Best 41                            │
│          4  ≋      Something to look at   A drawing for this break        │
│                                                                          │
│                                                     ( Not an ad  ⌥⇧A )   │
╰──────────────────────────────────────────────────────────────────────────╯
  ↑ the rounded border here is the edge clock: full, about to drain
```

### 2. Five letters

```
╭─────────────────────────────────────────────────────────────────────╮
│ ○ halftime show                                  1:18  left in break │
│                                                Dodged today 14:54    │
│                                                This week 1:52:34     │
│                 ┌───┐┌───┐┌───┐┌───┐┌───┐                           │
│                 │ C ││ R ││ A°││ N ││▓E▓│   ▓ = right place          │
│                 └───┘└───┘└───┘└───┘└───┘   ° = in the word          │
│                 │ S°││ H ││ A°││ D ││▓E▓│                            │
│                 │ P ││ _ ││   ││   ││   │   ← typing                 │
│                 │   ││   ││   ││   ││   │                            │
│              Q W E R T Y U I O P   A S D F G H J K L   Z X C V B N M│
│              Streak 2 this episode                                  │
│ (1 Five letters) (2 Trivia) (3 Hoop) (4 Look)        ( Not an ad )  │
╰─────────────────────────────────────────────────────────────────────╯
```

The edge has drained to about three quarters: the top edge and right side are gone from the top-left corner round to the right.

### 3. Quick trivia

```
╭─────────────────────────────────────────────────────────────────────╮
│ ○ halftime show                                  0:58  left in break │
│                                                ...                  │
│        Question 2 of 3                                              │
│        How long is half-time in a Premier League football match?    │
│                                                                     │
│        ( 1  10 minutes )                                            │
│        (▓2  15 minutes▓)  Right                                     │
│        ( 3  20 minutes )                                            │
│                                                                     │
│        Questions from Open Trivia Database, CC BY-SA 4.0            │
│ (1)(2)(3)(4)                                         ( Not an ad )  │
╰─────────────────────────────────────────────────────────────────────╯
```

### 4. Hoop's catch

```
╭─────────────────────────────────────────────────────────────────────╮
│ ○ halftime show    23   best 41    ○ ○ ●     0:41  left in break    │
│                                                                     │
│              •                        •                             │
│                         •                                           │
│                                              •                      │
│                   •                                                 │
│                                                                     │
│                         ╭───╮                                       │
│                         │• •│  ← Hoop; a dot falling through the    │
│                         ╰───╯    ring is caught                     │
│ ──────────────────────────────────────────────────── (ground rule)  │
│ (1)(2)(3)(4)  ← → or move the pointer               ( Not an ad )   │
╰─────────────────────────────────────────────────────────────────────╯
```

Three misses end a round (`○ ○ ●`, filled as they're used). The high score is saved in `storage.local`.

### 5. Something to look at

```
╭─────────────────────────────────────────────────────────────────────╮
│ ○ halftime show                                  0:33  left in break │
│                                                                     │
│     ~~~~~~~~~~~~~~~~~~~~                                            │
│   ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~        a field of short ink strokes │
│  ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~     following a flow, drawing in │
│   ~~~~~~~~~~~~~~~~~~~~~~~~~~           across the break; it is      │
│        ~~~~~~~~~~                      finished when the break is   │
│                                                                     │
│ (1)(2)(3)(4)    Drawing 61 of 100              ( Not an ad )        │
╰─────────────────────────────────────────────────────────────────────╯
```

No words over the drawing except the label. Each break gets a new seed, from the date and the break's start time.

### 6. Small window (under 560 px wide)

```
╭─────────────────────────────────╮
│ ○              1:42 left        │
│                                 │
│   ┌─┐┌─┐┌─┐┌─┐┌─┐               │
│   │C││R││A││N││E│               │
│   │S││ ││ ││ ││ │               │
│                                 │
│ 1 2 3 4                ( Not ad)│
╰─────────────────────────────────╯
```

### 7. The back note (the show has resumed)

```
┌────────────────────────────────────────────────────────────────────┐
│                                                                    │
│              (the show, playing, sound on)                         │
│                                                                    │
│                                                                    │
│  ╭───────────────────────────────╮                                 │
│  │ ○ Back. Sound on.             │  ← dark pill, 78%, blur,        │
│  │   1:42 of ads dodged.         │    bottom left, 4 s             │
│  ╰───────────────────────────────╯                                 │
└────────────────────────────────────────────────────────────────────┘
```

### 8. The toolbar popup (360 px, follows the browser's theme)

```
┌────────────────────────────────────┐
│ ○ halftime show          [ On  ●]  │
│                                    │
│ (● In a break, 1:42 left)          │
│                                    │
│ Halftime show                      │
│ [Five letters][Quick trivia]       │
│ [Hoop's catch][Something to look at]│
│ Start with   (•) the menu  ( ) the  │
│              last show straight away│
│                                    │
│ Ad time dodged                     │
│ Today       14:30                  │
│ This week   1:52:10                │
│                                    │
│ ( This isn't an ad )  ( Pause ▾ )  │
│                                    │
│ Shortcuts                          │
│ Alt+Shift+A   Ad / not an ad       │
│ Alt+Shift+H   Pause or resume      │
│ 1 to 4        Pick a show          │
│                                    │
│ Collects nothing. Makes no network │
│ calls. Code on GitHub ↗   Options  │
└────────────────────────────────────┘
```

The mark button reads `This is an ad` when no break is on and `This isn't an ad` during one. On any other site the popup shows only the wordmark, `Halftime Show works on hulu.com.` and the privacy line.

### 9. Empty and first run

Popup, before the first break:

```
┌────────────────────────────────────┐
│ ○ halftime show          [ On  ●]  │
│                                    │
│          ╭───╮                     │
│          │• •│   Hoop, watching    │
│          ╰───╯                     │
│ No ad breaks yet. Start an episode │
│ and the first one opens here.      │
│                                    │
│ ( This is an ad )                  │
│ Use it if an ad plays and nothing  │
│ happens.                           │
└────────────────────────────────────┘
```

The first menu ever adds one line above the choices: "First break. The tab is muted and the ad is underneath. Pick something for the next 1:42." The scoreboard reads `Dodged today 0:00`, never blank.

### 10. Options page (one column, 640 px max)

```
halftime show

Halftime show
  Start a break with   (•) the menu   ( ) the last show used
  Default show         [ Five letters ▾ ]

Sites
  hulu.com             [ On ● ]

Scoreboard
  Today 14:30   This week 1:52:10       ( Reset scoreboard )

Shortcuts
  Alt+Shift+A  Ad / not an ad    Change shortcuts in your browser ↗

Privacy
  Halftime Show collects nothing and makes no network calls. Settings
  and scores stay in this browser. It is not made by or affiliated
  with Hulu.

Credits
  Questions from Open Trivia Database, CC BY-SA 4.0 ↗
  Word list ...  Code on GitHub ↗ (MIT)
```

## Checked against the generic defaults

- **Near-black, Geist and mono labels** are on the design bar's list of tells, but here they are Dan's own system, chosen on purpose. Labels are sentence case, and there is no accent colour at all, not even one neon for "correct".
- **No green and yellow word game.** The obvious move for a five-letter game is the coloured tiles everyone knows. Here state is fill, outline and a ring mark, which also works for colour-blind players and in both themes.
- **No card kit.** The overlay is one surface; the menu is a list with one inverted row; the shows sit straight on ink. The only floating thing is the back note.
- **No numbered decoration.** The 1 to 4 beside each show are the real keys that pick it, and "Question 2 of 3" is a real sequence.
- **No big-number hero.** The largest number is the time left, which is the one number the job needs.
- **One moment (the clip, open and close), one loop (the live disc).** The halftime shows move because they are games and a drawing, and only while a break is on.
- **Nothing in it would fit any other product:** the edge clock exists because a break has a length, the ink overlay because it sits over a film at night, and Hoop because the tool watches the player.
