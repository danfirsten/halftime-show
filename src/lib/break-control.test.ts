import { describe, expect, it } from 'vitest';
import { createBreakControl } from './break-control';

function setup(opts: { viewerMuted?: boolean; muteFails?: boolean } = {}) {
  const log: string[] = [];
  const control = createBreakControl({
    async mute() {
      await Promise.resolve();
      if (opts.muteFails) throw new Error('no worker');
      log.push('mute');
    },
    async unmute(notAd) {
      await Promise.resolve();
      log.push(notAd ? 'unmute(not ad)' : 'unmute');
      return opts.viewerMuted === true;
    },
    open: (s) => log.push(`open(${s})`),
    close: (how) => log.push(`close(${how.notAd ? 'not ad' : 'ad'}, ${how.soundOn ? 'sound on' : 'still muted'})`),
  });
  return { control, log };
}

const start = (secondsLeft: number | null = 30) => ({ type: 'break:start' as const, secondsLeft });
const end = { type: 'break:end' as const, secondsLeft: null };

describe('break control', () => {
  it('mutes before it opens, and unmutes before it closes', async () => {
    const { control, log } = setup();
    control.detected(start(42));
    expect(control.inBreak()).toBe(true);
    await control.idle();
    control.detected(end);
    await control.idle();
    expect(log).toEqual(['mute', 'open(42)', 'unmute', 'close(ad, sound on)']);
  });

  it('keeps steps in order when a break ends before its start has finished', async () => {
    const { control, log } = setup();
    control.detected(start());
    control.detected(end);
    await control.idle();
    expect(log).toEqual(['mute', 'open(30)', 'unmute', 'close(ad, sound on)']);
  });

  it('tells the overlay when the viewer had muted the tab', async () => {
    const { control, log } = setup({ viewerMuted: true });
    control.detected(start());
    control.detected(end);
    await control.idle();
    expect(log.at(-1)).toBe('close(ad, still muted)');
  });

  it('still covers the ad if muting failed', async () => {
    const { control, log } = setup({ muteFails: true });
    control.detected(start(5));
    await control.idle();
    expect(log).toEqual(['open(5)']);
  });

  it('ignores a repeated event', async () => {
    const { control, log } = setup();
    control.detected(start());
    control.detected(start());
    await control.idle();
    expect(log).toEqual(['mute', 'open(30)']);
  });

  describe('the override', () => {
    it('"this is an ad" opens a break the detector missed, of unknown length', async () => {
      const { control, log } = setup();
      control.toggle();
      await control.idle();
      expect(control.inBreak()).toBe(true);
      expect(log).toEqual(['mute', 'open(null)']);
    });

    it('"this isn\'t an ad" closes a detected break and claims no ad time', async () => {
      const { control, log } = setup();
      control.detected(start());
      control.toggle();
      await control.idle();
      expect(control.inBreak()).toBe(false);
      expect(log).toEqual(['mute', 'open(30)', 'unmute(not ad)', 'close(not ad, sound on)']);
    });

    it("the overlay's Not an ad does the same, and does nothing with no break on", async () => {
      const { control, log } = setup();
      control.notAd();
      control.detected(start());
      control.notAd();
      await control.idle();
      expect(log).toEqual(['mute', 'open(30)', 'unmute(not ad)', 'close(not ad, sound on)']);
    });

    it('holds until the detector next changes its mind, then the detector wins', async () => {
      const { control, log } = setup();
      control.detected(start());
      control.toggle(); // not an ad
      await control.idle();
      log.length = 0;
      // The detector still sees the same break: nothing reopens. Its end is the next clear change.
      control.detected(end);
      await control.idle();
      expect(log).toEqual([]);
      // The next break opens as usual.
      control.detected(start(20));
      await control.idle();
      expect(log).toEqual(['mute', 'open(20)']);
    });

    it('a forced break holds until the detector sees one, which then ends it as usual', async () => {
      const { control, log } = setup();
      control.toggle(); // this is an ad
      control.detected(start(12)); // the detector catches up: no second open
      await control.idle();
      expect(log).toEqual(['mute', 'open(null)']);
      control.detected(end);
      await control.idle();
      expect(log).toEqual(['mute', 'open(null)', 'unmute', 'close(ad, sound on)']);
    });

    it('toggles back and forth', async () => {
      const { control, log } = setup();
      control.toggle();
      control.toggle();
      control.toggle();
      await control.idle();
      expect(control.inBreak()).toBe(true);
      expect(log).toEqual(['mute', 'open(null)', 'unmute(not ad)', 'close(not ad, sound on)', 'mute', 'open(null)']);
    });
  });
});
