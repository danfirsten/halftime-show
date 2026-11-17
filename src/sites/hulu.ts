import type { SiteProfile } from './types';

/*
 * Everything Hulu-specific about spotting an ad break. If detection breaks when Hulu changes its player, this is
 * the file to fix: change a selector, run `npm test`, and add a snapshot of the new page to __snapshots__/.
 *
 * Halftime Show is not made by or affiliated with Hulu. Nothing here blocks, skips or speeds up an ad: the
 * detector only reads the page.
 *
 * Where the Hulu selectors come from. We can't sign in to Hulu from the build, so these come from open-source
 * extensions that read Hulu's live player, checked on 17 November 2026. We use their selectors only; several of
 * those projects skip or speed up ads, which this one never does.
 *   [A] roszhan2684/SilentAd, content.js, isHuluAd(): ".AdUnitView__adBar__timer", ".AdUnitView__adBar" and
 *       ".Timeline__playhead--ad", "confirmed from live Hulu DOM inspection during ad playback".
 *       Repo last pushed 1 October 2026. https://github.com/roszhan2684/SilentAd
 *   [B] aritropaul/adblocky, src/entrypoints/hulu.content.ts: ".AdUnitView__adBarContainer", "visible during
 *       ads", "real selectors from live DOM (2026-03-28)"; ads are stitched into the one stream (SSAI) on
 *       "#content-video-player". Repo last pushed 16 November 2026. https://github.com/aritropaul/adblocky
 *   [C] ishsharm0/stream-ad-skipper, hulu/content.js: reads ".AdUnitView__adBar__timer" text as m:ss for the
 *       time left; notes Hulu plays ads in the same MSE/DASH stream as the show. Repo last pushed 11 May 2026.
 *       https://github.com/ishsharm0/stream-ad-skipper
 *
 * What is confirmed and what is a guess, until Dan captures a real page ("Save a detection snapshot"):
 *   - ad bar (.AdUnitView__adBar, .AdUnitView__adBarContainer): confirmed by [A] and [B].
 *   - countdown (.AdUnitView__adBar__timer, m:ss): confirmed by [A] and [C].
 *   - ad playhead on the timeline (.Timeline__playhead--ad): one source, [A].
 *   - the "Ad" label text inside the ad bar: a guess.
 *   - video source and duration changes: likely silent on Hulu, since [B] and [C] say the ad is stitched into
 *     the show's own stream. Kept for the stand-in player and in case Hulu plays some ads separately.
 *
 * The stand-in player's markers (fixture/README.md, "The markup contract") sit beside the real ones, so the
 * same profile runs on both.
 */
export const hulu: SiteProfile = {
  id: 'hulu',
  videoSelectors: ['#content-video-player', '[data-fixture="video"]', 'video'],
  signals: [
    {
      id: 'adBar',
      group: 'adBar',
      weight: 0.15,
      selectors: ['.AdUnitView__adBarContainer', '.AdUnitView__adBar', '[data-fixture="ad-ui"]'],
    },
    {
      id: 'adLabel',
      group: 'adBar',
      weight: 0.1,
      selectors: ['.AdUnitView__adBar *', '[data-fixture="ad-label"]'],
      text: /^\s*ad\s*$/i,
    },
    {
      id: 'countdown',
      group: 'adBar',
      weight: 0.15,
      selectors: ['.AdUnitView__adBar__timer', '[data-fixture="ad-countdown"]'],
      text: /\d:\d\d/,
      countdown: true,
    },
    {
      id: 'adProgress',
      group: 'adBar',
      weight: 0.1,
      selectors: ['[data-fixture="ad-progress"]'],
    },
    {
      id: 'adPlayhead',
      group: 'timeline',
      weight: 0.15,
      selectors: ['.Timeline__playhead--ad'],
    },
    {
      id: 'videoSource',
      group: 'player',
      weight: 0.15,
      selectors: ['[data-fixture="video"]'],
      attr: { name: 'src', pattern: /(^|\/)ad\.webm$/ },
      evenHidden: true,
    },
    {
      id: 'playerState',
      group: 'player',
      weight: 0.1,
      selectors: ['[data-fixture="player"][data-state="ad"]'],
      evenHidden: true,
    },
  ],
  // A guess for Hulu (see above): an episode's video swapped for one a few minutes long.
  durationDrop: { id: 'videoDuration', group: 'player', weight: 0.1, fromSeconds: 600, toSeconds: 180 },
  tuning: { startAt: 0.25, endAt: 0.12, quickMs: 200, holdMs: 1200, stallLimitMs: 15000 },
};
