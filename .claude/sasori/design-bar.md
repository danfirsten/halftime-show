# The design bar

Dan doesn't want products that look generated. Every product Sasori ships should look like someone with taste spent weeks on it, and be ready for real users on day one. This file defines what that means in checks a machine can run and a rubric a reviewer applies. It sits beside `quality-bar.md`: a `ui` ticket must pass both.

Sources it builds on, vendored into every project: Anthropic's `frontend-design` skill (`.claude/skills/frontend-design/`) and Vercel's Web Interface Guidelines (`.claude/sasori/web-interface-guidelines.md`).

## 1. Every product gets a design direction before any UI is built

Wave 0 of every launch includes a design direction ticket (opus), following `frontend-design`'s plan, review, build and critique process. It produces `docs/design.md` and the token file, and every later `ui` ticket builds from them:

- **The subject, audience and primary job**, in one paragraph each. Distinctive choices come from the subject's own world: its materials, instruments, documents and vocabulary.
- **One bold move.** The single memorable element (a type treatment, a signature interaction, an illustration style, a layout idea). Everything else stays quiet.
- **Colour**: 4 to 6 named tokens with light and dark values, neutrals tinted toward the accent, semantic colours (success, warning, danger) separate from the accent. Contrast checked: AA (4.5:1 text, 3:1 large text and UI) in both themes.
- **Type**: one or two families chosen for this product (never the default you'd use anywhere; Geist and Inter now read as defaults), a modular scale (about 1.2 to 1.25), weights and tracking per step, line length under 80 characters.
- **Space, radius, elevation**: a 4 px base scale, radii by role (not one radius for everything), at most two shadow levels.
- **Motion**: named tokens for durations and easings (for example `--motion-quick: 150ms`, `--motion-base: 200ms`, `--ease-out: cubic-bezier(0.2, 0, 0, 1)`); 150 to 250 ms ease-out for responses to a person's action; at most one orchestrated moment, named with its route, selector, trigger and length; what each animated thing does with reduced motion on (opacity or colour instead of movement); and the **interactions list**: every hover, focus or click response worth watching (route, selector, action, a label). The list and the moment go into `.sasori/qa.json` (`interactions` and `motion.moment`), so the QA run films them.
- **Voice**: three words for the tone, and five example strings (a button, an empty state, an error, a success toast, a confirmation).
- **The brand kit**: a wordmark (SVG), favicon set, `apple-icon`, an Open Graph image template, and the theme colour.
- **Reference wireframes** (ASCII is fine) for the landing page, the core screen, and one empty state.

The direction is reviewed against the generic defaults below before any code. If a part of it would fit any similar product, it's revised.

## 2. The generic defaults to avoid

Each is legitimate when the brief calls for it. Absent a reason, it's a tell. The design review flags these:

- Inter, Arial, system-ui or Geist as the only face; one highlighted word in a headline; all-caps eyebrow labels over every heading; decorative numbering (01, 02, 03) on content that isn't a sequence.
- Purple-to-blue or rainbow gradients as decoration; warm cream with terracotta; near-black with one neon accent; untinted grey neutrals.
- The SaaS card kit: everything in identical rounded cards with the same soft shadow, cards inside cards, icon tiles above every heading, a "big number, small label" hero by default.
- Fade-and-slide-up on every section, hover lift on every card, bounce or elastic easing, `transition: all`.
- Emoji as section markers or icons; stock 3D blobs; lorem ipsum; invented testimonials, logos, user counts or ratings.
- Template chrome: middle-dot meta strings everywhere, a "→" on every link, mono fonts for ordinary labels.

## 3. Checks that run on every PR (the QA workflow)

`sasori-qa.yml` builds the app, seeds it, and runs `.claude/sasori/qa/shoot.mjs` against the routes in `.sasori/qa.json` and the files in `.sasori/qa.d/` (merged in name order): on a PR, only the routes its changes can affect when `routeFiles` maps every changed file to a route (a shared file shoots them all), and nothing at all when it changes only docs and agent instructions; on main, every route. Any of these fails CI:

| Check | Fails when |
|---|---|
| Horizontal overflow | `scrollWidth > innerWidth` at 390, 768 or 1440 px, light or dark |
| Accessibility | axe-core reports any `serious` or `critical` violation (WCAG 2.1 A and AA, contrast included) |
| Console | any error logged during load |
| Broken assets | any image or font request fails |
| Clipped text | an element with text whose content overflows its box without a scroll container |
| Focus | a focusable element has no visible focus style (`outline` or `box-shadow` change on focus) |
| Metadata (landing and public routes) | no `<title>`, description, Open Graph image, favicon, or `lang` |
| Motion: duration | a transition or animation over 400 ms that isn't the declared moment (over 250 ms is a warning) |
| Motion: `transition all` | any element transitions `all` |
| Motion: bounce easing | a `cubic-bezier` with a control point outside 0..1 (bounce, elastic, overshoot) |
| Motion: infinite | an infinite animation not inside a loading state (`aria-busy`, `role="progressbar"` or `"status"`, `.skeleton`, `.spinner`, or `motion.loading`) |
| Motion: entrances | more than two elements fade or slide in as the page loads or scrolls (fade-and-slide-up on every section) |
| Reduced motion | with `prefers-reduced-motion: reduce`, anything still animates transform or position (opacity and colour are fine) |

The motion checks run at the widest width with reduced motion off (and the reduced-motion check with it on). `motion.allow` in `.sasori/qa.json` lists selectors exempt from every motion check but reduced motion (a news ticker the direction chose on purpose); `motion.moment` names the orchestrated moment, which may run longer.

It also takes a screenshot of every route at each width and theme, and films a **frame strip** of every interaction in `.sasori/qa.json` and of the moment, with reduced motion off and on: the page's animation clock is paused, the action performed, and each animation stepped through eight evenly spaced instants. Strips are filmed at the widest width; a target hidden there (a phone-only menu button) fails its strip with a `motion: interaction` row, and the rest of the run carries on. Screenshots and strips go in the PR's QA comment; the design reviewer reads both.

## 4. The design review (blocking)

Part of the review gate for every `ui` PR, done by the `design-review` skill in a fresh context. It reads `docs/design.md`, the screenshots and the diff. **Blocking**:

- A layout that breaks at any width or theme: overlap, overflow, cramped or orphaned elements, misalignment of repeated items.
- Missing states for anything that loads, can be empty, or can fail: loading (skeletons sized to the content), empty (says what will appear and offers the first action), error (says what happened and how to recover).
- Tokens ignored: a hard-coded colour, size or font outside the token file; a component that ignores the type scale; a duration or easing outside the motion tokens.
- Motion that doesn't match the direction: a strip whose timing or easing isn't the direction's, motion with no purpose (it doesn't show cause and effect, continuity or state), more than one orchestrated moment, or a reduced-motion version that still moves or loses the meaning.
- Contrast or focus problems the checks missed; touch targets under 44 px on mobile.
- Copy that's vague, apologetic, inconsistent with the voice, or placeholder.
- Any generic default from section 2 the direction didn't choose on purpose.
- Fake content presented as real.

**Advisory** (in the verdict, fixed if cheap): taste calls, spacing refinements, a better empty-state illustration.

## 5. Launch-ready (the hardening wave checks all of these)

| Area | Ready means |
|---|---|
| First run | A new user reaches the product's first useful result in under a minute, with seeded or sample data, and an empty dashboard that says what to do first |
| Metadata | Per-route titles and descriptions, `opengraph-image` per public route, favicon set, `manifest`, canonical URLs, `sitemap.ts`, `robots.ts`, JSON-LD on the landing page |
| Performance | LCP under 2.5 s, CLS under 0.1, INP under 200 ms on the landing page and core screen (Lighthouse CI budgets); images through `next/image`, fonts through `next/font` |
| Accessibility | Zero serious axe violations, keyboard-only walkthrough of the core loop works, reduced motion respected |
| Trust | Terms, privacy and (if non-essential cookies) a cookie notice, marked "draft for review" until Dan has read them; a real contact address field in `LAUNCH.md` for Dan to fill |
| Operations | `/api/health`, error tracking wired (Sentry or console fallback), rate limiting on auth and public write endpoints, security headers and CSP, backups documented |
| Analytics | Product events for the core loop (PostHog or the no-op fallback), and the success metric from the brief instrumented |
| Go to market | A landing page that sells the core job in its first screen, pricing, a waitlist or sign-up, a Stripe test-mode checkout, and the launch kit's outreach drafts |
