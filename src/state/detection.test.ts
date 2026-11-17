import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DETECTION_KEY, STALE_AFTER_SECONDS, createWatchClock, isStale, readDetection, recordBreakSeen, recordWatched } from './detection';

const load = async () => readDetection((await fakeBrowser.storage.local.get(DETECTION_KEY))[DETECTION_KEY]);

describe('detection record', () => {
  beforeEach(() => fakeBrowser.reset());

  it('reads anything odd as nothing watched', () => {
    expect(readDetection(undefined)).toEqual({ watched: 0 });
    expect(readDetection({ watched: -4 })).toEqual({ watched: 0 });
    expect(readDetection({ watched: 'long' })).toEqual({ watched: 0 });
  });

  it('is out of date after about three episodes without a break, and a break clears it', async () => {
    await recordWatched(STALE_AFTER_SECONDS - 60);
    expect(isStale(await load())).toBe(false);
    await recordWatched(60);
    expect(isStale(await load())).toBe(true);
    await recordBreakSeen();
    expect(await load()).toEqual({ watched: 0 });
  });

  it('adds up watching done together in two tabs', async () => {
    await Promise.all([recordWatched(30), recordWatched(30)]);
    expect((await load()).watched).toBe(60);
  });

  it('never grows without end', async () => {
    await recordWatched(STALE_AFTER_SECONDS * 5);
    expect((await load()).watched).toBe(STALE_AFTER_SECONDS * 2);
  });
});

describe('the watch clock', () => {
  it('counts only the time the video was playing, and not a gap from a sleeping laptop', () => {
    let t = 0;
    const counted: number[] = [];
    const clock = createWatchClock(() => t, (s) => counted.push(s));
    t = 30_000;
    clock.tick(true);
    t = 60_000;
    clock.tick(false);
    t = 90_000;
    clock.tick(true);
    t = 90_000 + 3 * 3600_000;
    clock.tick(true);
    expect(counted).toEqual([30, 30]);
  });
});
