// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { hulu } from './hulu';
import { readSnapshot } from '../detect/read';
import { initialState, step, type DetectorState, type Verdict } from '../detect/score';

function load(name: string): Document {
  return new DOMParser().parseFromString(readFileSync(`src/sites/__snapshots__/${name}.html`, 'utf8'), 'text/html');
}

/** Reads each snapshot every 50 ms for the time given, in order, and returns the verdict at the end. */
function verdictAfter(...script: Array<[string, number]>): Verdict & { starts: number; ends: number } {
  let state: DetectorState = initialState();
  let verdict: Verdict = { inBreak: false, confidence: 0, secondsLeft: null };
  let at = 0;
  let starts = 0;
  let ends = 0;
  for (const [name, ms] of script) {
    const doc = load(name);
    const memory = { longestDuration: 0 };
    for (let t = 0; t < ms; t += 50, at += 50) {
      const out = step(state, readSnapshot(doc, hulu, at, memory), hulu.tuning);
      state = out.state;
      verdict = out.verdict;
      if (out.change === 'start') starts++;
      if (out.change === 'end') ends++;
    }
  }
  return { ...verdict, starts, ends };
}

describe('the stand-in player', () => {
  it('in the show: no break', () => {
    expect(verdictAfter(['fixture-show', 3000])).toMatchObject({ inBreak: false, confidence: 0, starts: 0 });
  });

  it('in an ad: a break within 300 ms, with the countdown as time left', () => {
    expect(verdictAfter(['fixture-show', 1000], ['fixture-ad', 300])).toMatchObject({ inBreak: true, secondsLeft: 19 });
  });

  it('in an ad of unknown length: a break with no time left', () => {
    expect(verdictAfter(['fixture-ad-unknown-length', 300])).toMatchObject({ inBreak: true, secondsLeft: null });
  });

  it('between, with the markers blinked off: still the break, and no quick start from the show', () => {
    expect(verdictAfter(['fixture-ad', 1000], ['fixture-between', 3000])).toMatchObject({ inBreak: true, ends: 0 });
    // Only the video says ad, so a start waits for the long hold.
    expect(verdictAfter(['fixture-show', 1000], ['fixture-between', 900])).toMatchObject({ inBreak: false, starts: 0 });
  });

  it('a false flash of the ad markers for under a second: no break', () => {
    expect(verdictAfter(['fixture-show', 1000], ['fixture-flash', 900], ['fixture-show', 1000])).toMatchObject({ starts: 0 });
  });

  it('back from the ad to the show: the break ends within 300 ms', () => {
    expect(verdictAfter(['fixture-ad', 1000], ['fixture-show', 300])).toMatchObject({ inBreak: false, starts: 1, ends: 1 });
  });
});

describe('Hulu, rebuilt from public selectors (not a capture)', () => {
  it('reads the ad bar, countdown and ad playhead as a break', () => {
    expect(verdictAfter(['hulu-reconstructed-show', 1000], ['hulu-reconstructed-ad', 300])).toMatchObject({ inBreak: true, secondsLeft: 88 });
  });

  it('reads the show as no break', () => {
    expect(verdictAfter(['hulu-reconstructed-show', 3000])).toMatchObject({ inBreak: false, starts: 0 });
  });

  it('ends the break when the ad bar and ad playhead go', () => {
    expect(verdictAfter(['hulu-reconstructed-ad', 1000], ['hulu-reconstructed-show', 300])).toMatchObject({ inBreak: false, ends: 1 });
  });
});
