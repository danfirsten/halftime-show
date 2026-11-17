import { describe, expect, it } from 'vitest';
import { agreeingGroups, confidence, initialState, parseClock, step, type Change, type Reading, type Tuning, type Verdict } from './score';

const tuning: Tuning = { startAt: 0.25, endAt: 0.12, quickMs: 200, holdMs: 1200, stallLimitMs: 15000 };

// Three parts of a player: the ad bar (two signals), the timeline and the video.
type Frame = { bar?: boolean; timeline?: boolean; video?: boolean; left?: number | null; stalled?: boolean };
function readings(f: Frame): Reading[] {
  return [
    { id: 'adBar', group: 'adBar', weight: 0.2, on: !!f.bar },
    { id: 'countdown', group: 'adBar', weight: 0.2, on: !!f.bar && f.left != null },
    { id: 'playhead', group: 'timeline', weight: 0.3, on: !!f.timeline },
    { id: 'video', group: 'video', weight: 0.3, on: !!f.video },
  ];
}
const AD: Frame = { bar: true, timeline: true, video: true, left: 30 };
const SHOW: Frame = {};

/** Runs frames every `every` ms for `ms` each. Returns the changes with their times, and the last verdict. */
function run(script: Array<[Frame, number]>, every = 50) {
  let state = initialState();
  let at = 0;
  let verdict: Verdict = { inBreak: false, confidence: 0, secondsLeft: null };
  const changes: Array<{ change: Change; at: number }> = [];
  for (const [frame, ms] of script) {
    for (let t = 0; t < ms; t += every, at += every) {
      const out = step(state, { at, readings: readings(frame), secondsLeft: frame.bar ? (frame.left ?? null) : null, stalled: !!frame.stalled }, tuning);
      state = out.state;
      verdict = out.verdict;
      if (out.change) changes.push({ change: out.change, at });
    }
  }
  return { changes, verdict, state };
}

describe('confidence and agreement', () => {
  it('is the share of weight that is on, and counts groups not signals', () => {
    const r = readings({ bar: true, left: 10 });
    expect(confidence(r)).toBeCloseTo(0.4);
    expect(agreeingGroups(r)).toBe(1);
    expect(agreeingGroups(readings(AD))).toBe(3);
    expect(confidence([])).toBe(0);
  });
});

describe('step', () => {
  it('starts quickly when separate parts of the player agree', () => {
    const { changes, verdict } = run([[SHOW, 1000], [AD, 1000]]);
    expect(changes).toEqual([{ change: 'start', at: 1200 }]);
    expect(verdict.inBreak).toBe(true);
    expect(verdict.confidence).toBe(1);
  });

  it('ends quickly when every signal clears', () => {
    const { changes, verdict } = run([[AD, 2000], [SHOW, 1000]]);
    expect(changes.map((c) => c.change)).toEqual(['start', 'end']);
    expect(changes[1]!.at).toBe(2200);
    expect(verdict).toEqual({ inBreak: false, confidence: 0, secondsLeft: null });
  });

  it('never starts on a flash under a second from one part of the player', () => {
    const { changes } = run([[SHOW, 1000], [{ bar: true, left: 1 }, 600], [SHOW, 2000], [{ bar: true, left: 1 }, 900], [SHOW, 1000]]);
    expect(changes).toEqual([]);
  });

  it('still starts on one part alone when it holds past the long hold', () => {
    const { changes } = run([[{ bar: true, left: 20 }, 2000]]);
    expect(changes).toEqual([{ change: 'start', at: 1200 }]);
  });

  it('never ends on a dropout under a second while another part still says ad', () => {
    const dark: Frame = { video: true };
    const { changes } = run([[AD, 1000], [dark, 400], [AD, 2600], [dark, 400], [AD, 1000]]);
    expect(changes.map((c) => c.change)).toEqual(['start']);
  });

  it('never ends on a dropout under a second when the break was seen by one part only', () => {
    const bar: Frame = { bar: true, left: 20 };
    const { changes } = run([[bar, 2000], [SHOW, 900], [bar, 2000]]);
    expect(changes.map((c) => c.change)).toEqual(['start']);
  });

  it('tells back-to-back breaks apart', () => {
    const { changes } = run([[AD, 3000], [SHOW, 1000], [AD, 3000], [SHOW, 1000]]);
    expect(changes.map((c) => c.change)).toEqual(['start', 'end', 'start', 'end']);
  });

  it('reads the time left, counts it down between readings, and drops it at the end', () => {
    const { verdict } = run([[AD, 1000]]);
    expect(verdict.secondsLeft).toBe(30);
    const later = run([[AD, 1000], [{ ...AD, bar: false }, 500]]);
    expect(later.verdict.inBreak).toBe(true);
    expect(later.verdict.secondsLeft).toBeCloseTo(29.5, 1);
  });

  it('gives null time left when the length is unknown', () => {
    const { changes, verdict } = run([[{ ...AD, left: null }, 1000]]);
    expect(changes.map((c) => c.change)).toEqual(['start']);
    expect(verdict.secondsLeft).toBeNull();
  });

  it('holds still through a stalled player, then carries on', () => {
    // The page drops every marker while the video waits for data: no end, and the clock doesn't run.
    const stalled: Frame = { stalled: true };
    const held = run([[AD, 1000], [stalled, 5000]]);
    expect(held.changes.map((c) => c.change)).toEqual(['start']);
    expect(held.verdict.inBreak).toBe(true);
    expect(held.verdict.secondsLeft).toBe(30);
    // Once the video plays again the markers are read as usual.
    const after = run([[AD, 1000], [stalled, 5000], [SHOW, 1000]]);
    expect(after.changes.map((c) => c.change)).toEqual(['start', 'end']);
    // A stall in the show never starts a break, whatever the page shows.
    expect(run([[SHOW, 500], [{ ...AD, stalled: true }, 3000]]).changes).toEqual([]);
  });

  it('stops trusting a stall that goes on too long', () => {
    const { changes } = run([[AD, 1000], [{ stalled: true }, 17000]]);
    expect(changes.map((c) => c.change)).toEqual(['start', 'end']);
  });
});

describe('parseClock', () => {
  it('reads the last clock in the text', () => {
    expect(parseClock('0:25')).toBe(25);
    expect(parseClock('1:02:03')).toBe(3723);
    expect(parseClock('Ad 1 of 2 · 1:30')).toBe(90);
    expect(parseClock('Ad')).toBeNull();
  });
});
