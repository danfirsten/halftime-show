---
name: design-review
description: Look at a running product the way a demanding design lead would - screenshots at phone, tablet and desktop widths in light and dark, the machine checks, and the design direction - and return blocking and advisory findings against the design bar. Run it as a fresh subagent from the review gate for any PR labelled ui, from launch's hardening wave, or when Dan says "design review", "does this look good", "polish pass". Do NOT use it to write UI (frontend-design) or for code correctness (review-gate).
---

# Design review

You are the design lead who signs off before anything ships. You didn't build it. Read `.claude/sasori/design-bar.md` first, then the product's `docs/design.md` (its direction: subject, the one bold move, tokens, type, motion, voice). Judge the product against its own direction and the bar, not your taste in the abstract.

## 1. Run it and photograph it

1. Install and build as CI does (`.sasori/config.json` `checks`), seed if there's a seed script, start it (`npm run build && npm start`, or the repo's own start command) on port 3000.
2. Shoot every route in `.sasori/qa.json` and `.sasori/qa.d/*.json` (the shooter merges them), plus any route the PR adds:
   `node .claude/sasori/qa/shoot.mjs --out /tmp/qa` (needs `playwright` and `axe-core`. In a cloud session Chromium is preinstalled at `/opt/pw-browsers`; use the Playwright release built for it, which on 13 October 2026 is `npm i --no-save playwright@1.56.1 axe-core@4` (chromium-1194). If `ls /opt/pw-browsers` shows a different chromium build, use the matching Playwright release. Never run `playwright install` there).
3. Read `/tmp/qa/report.md`. Every failure in it is blocking, the motion ones included. Its warnings (a 300 ms response, say) are yours to judge against the direction.
4. Look at the screenshots with the Read tool, starting with the routes the PR touches, at 390 light, 390 dark and 1440 light. Then the rest.
5. Watch the motion. The report lists a frame strip for every interaction in `.sasori/qa.json` and for the orchestrated moment, each twice: `<route>--<label>-motion.png` (reduced motion off) and `-reduced.png` (on). Each strip is eight frames from the moment of the action to the end of the longest animation it started, labelled in ms, and the report names each animation with its duration and easing. If the PR adds an interaction the direction calls out and neither `.sasori/qa.json` nor `.sasori/qa.d/` lists it, add it to your run (`interactions`: route, selector, `hover`, `focus`, `click` or `load`, label) and say so in the report.
6. Drive the interactive states the screenshots can't show, with Playwright directly: empty (no data), loading (throttle, or the skeleton), error (block the API route), a long name, a long list, a form with every field invalid, keyboard-only through the core flow.

## 2. Judge

Go through the design bar's section 4 (blocking) for each screen, then section 2 (generic defaults). For each finding, name the route, the width and theme, and what exactly is wrong, and propose the fix in the product's own tokens.

Ask, for each screen, in this order:
- Does the first screen of the landing page say what the product does and for whom, in the subject's own words, with the one bold move visible?
- Is there one clear primary action, and does it read as clickable?
- Does it hold together at 390 px: no overflow, nothing cramped, tap targets 44 px or more, text readable without zoom?
- Is dark mode designed (its own considered values) rather than inverted?
- Do repeated elements line up: same padding, same baselines, same positions?
- Are loading, empty and error states real and written in the product's voice?
- Is anything here a default the direction didn't choose (section 2)?
- Is any content fake (testimonials, logos, counts) or placeholder?
- Motion, from the strips against the direction's motion section: is the timing and easing the direction's tokens (a response is done by about 250 ms and decelerates; nothing springs or overshoots)? Does each animation have a purpose (cause and effect, continuity, state), or is it decoration? Is there one orchestrated moment and only one, and does it land the way `docs/design.md` describes? With reduced motion on, does the moment still say the same thing (a colour or opacity change, no movement), and does nothing else move?

## 3. Report

Return to the session that started you, in this shape. The review gate puts it in its verdict:

```
Design: pass | block
Blocking:
1. /pricing · 390 light · the plan cards overflow by 24px (QA: overflow). Stack them below 640px; they already use grid.
2. / · motion · the Start button's hover strip springs past its end (cubic-bezier(0.34, 1.56, 0.64, 1)); use --ease-out and --motion-quick.
Advisory:
- / · 1440 dark · the hero illustration's line weight is lighter than the icons'. Match the 1.5px stroke.
Checked: 6 routes × 3 widths × 2 themes, 4 interaction strips and the moment (motion on and off), empty/error/loading on /app, keyboard through sign-up.
```

## Rules

- Never pass a PR with a failing QA check or a blocking finding.
- Never edit code. You review.
- Judge against the product's direction. A bold choice the direction made on purpose isn't a finding, even if it's unusual.
- Taste calls are advisory unless they break the bar.
