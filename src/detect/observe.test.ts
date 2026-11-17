// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { observe, type BreakEvent } from './observe';
import { hulu } from '../sites/hulu';

const SHOW = `<div class="Player"><video id="content-video-player"></video><div class="Timeline"><div class="Timeline__playhead"></div></div></div>`;
const AD = `<div class="Player"><video id="content-video-player"></video>
  <div class="AdUnitView__adBar"><span>Ad</span><span class="AdUnitView__adBar__timer">0:30</span></div>
  <div class="Timeline"><div class="Timeline__playhead Timeline__playhead--ad"></div></div></div>`;

afterEach(() => {
  vi.useRealTimers();
});

describe('observe', () => {
  it('emits break:start with the time left and break:end, from page changes alone', async () => {
    vi.useFakeTimers();
    let clock = 0;
    document.body.innerHTML = SHOW;
    const events: BreakEvent[] = [];
    const detector = observe(document, hulu, (e) => events.push(e), { now: () => clock });

    async function wait(ms: number) {
      for (let i = 0; i < ms; i += 10) {
        clock += 10;
        await vi.advanceTimersByTimeAsync(10);
      }
    }

    await wait(500);
    expect(events).toEqual([]);
    document.body.innerHTML = AD;
    await wait(400);
    expect(events.map((e) => e.type)).toEqual(['break:start']);
    expect(events[0]!.secondsLeft).toBeGreaterThan(29);
    expect(detector.verdict().inBreak).toBe(true);

    document.body.innerHTML = SHOW;
    await wait(400);
    expect(events.map((e) => [e.type, e.secondsLeft])).toEqual([['break:start', events[0]!.secondsLeft], ['break:end', null]]);

    const debug = detector.debug();
    expect(debug.history).toHaveLength(2);
    expect(debug.readings.find((r) => r.id === 'adPlayhead')?.on).toBe(false);

    detector.stop();
    document.body.innerHTML = AD;
    await wait(2000);
    expect(events).toHaveLength(2);
  });
});
