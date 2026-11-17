import type { Tuning } from '../detect/score';

/** One thing on the page that suggests an ad is playing. */
export interface SignalSpec {
  id: string;
  /** Which part of the player it comes from. Signals in different groups agreeing is what makes a quick start. */
  group: string;
  weight: number;
  /** The signal is on when any of these matches a shown element (and `text` or `attr` match, if given). */
  selectors: string[];
  /** The element's text must match. */
  text?: RegExp;
  /** An attribute of the element must match, for example a video's src. */
  attr?: { name: string; pattern: RegExp };
  /** The element's text is the break's countdown: it gives secondsLeft. */
  countdown?: boolean;
  /** Count the element even when it is hidden (for state the page keeps on a hidden element). */
  evenHidden?: boolean;
}

/** Everything one streaming site's detection needs. One file per site in src/sites/. */
export interface SiteProfile {
  id: string;
  /** Where the video lives. The first match is the video the detector watches. */
  videoSelectors: string[];
  signals: SignalSpec[];
  /**
   * A video whose duration drops from at least `fromSeconds` (an episode) to at most `toSeconds` is taken as
   * an ad. Off when the site has no such signal.
   */
  durationDrop?: { id: string; group: string; weight: number; fromSeconds: number; toSeconds: number };
  tuning: Tuning;
}
