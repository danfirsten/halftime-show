// The content script's side of a break: what the detector says, what the viewer says, and the order things happen
// in (docs/design.md, "The orchestrated moment"): sound goes first, then the picture, both ways.

export interface BreakControlDeps {
  /** Ask the background to mute the tab. Resolves once it is muted. */
  mute(): Promise<unknown>;
  /** Ask the background to put the sound back. Resolves with whether the tab is still muted (the viewer had muted it). */
  unmute(notAd: boolean): Promise<boolean>;
  /** Cover the video. `seconds` is the break's time left, or null when it isn't known. */
  open(seconds: number | null): void;
  /** Take the cover away. */
  close(how: { notAd: boolean; soundOn: boolean }): void;
}

export interface BreakControl {
  /** The detector saw a break start or end. This also ends any override: the next clear change wins. */
  detected(event: { type: 'break:start' | 'break:end'; secondsLeft: number | null }): void;
  /** The shortcut or the popup button: "this is an ad" when no break is on, "this isn't an ad" during one. */
  toggle(): void;
  /** The overlay's "Not an ad". */
  notAd(): void;
  /** Whether a break is on, as the viewer sees it. */
  inBreak(): boolean;
  /** Settles once every mute, open, unmute and close asked for so far has happened. */
  idle(): Promise<void>;
}

export function createBreakControl(deps: BreakControlDeps): BreakControl {
  let detected = false;
  let override: 'ad' | 'not-ad' | null = null;
  let shown = false;
  let queue: Promise<void> = Promise.resolve();

  function apply(seconds: number | null, notAd: boolean) {
    const want = override === 'ad' ? true : override === 'not-ad' ? false : detected;
    if (want === shown) return;
    shown = want;
    queue = queue.then(async () => {
      if (want) {
        // The cover still goes up if muting failed: hiding the ad is better than nothing.
        await deps.mute().catch(() => undefined);
        deps.open(seconds);
      } else {
        const stillMuted = await deps.unmute(notAd).catch(() => false);
        deps.close({ notAd, soundOn: !stillMuted });
      }
    });
  }

  return {
    detected(event) {
      detected = event.type === 'break:start';
      override = null;
      apply(event.secondsLeft, false);
    },
    toggle() {
      override = shown ? 'not-ad' : 'ad';
      apply(null, shown);
    },
    notAd() {
      if (!shown) return;
      override = 'not-ad';
      apply(null, true);
    },
    inBreak: () => shown,
    idle: () => queue,
  };
}
