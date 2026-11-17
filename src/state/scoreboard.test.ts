import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { DAYS_KEPT, SCOREBOARD_KEY, addDodged, dayKey, dodgedTotals, loadScoreboard, readScoreboard, recordDodged, watchDodged, type Dodged } from './scoreboard';

const at = (y: number, m: number, d: number, h = 12) => new Date(y, m - 1, d, h);

describe('scoreboard maths', () => {
  it('keys days by local date', () => {
    expect(dayKey(at(2026, 11, 7, 0))).toBe('2026-11-07');
    expect(dayKey(at(2026, 1, 31, 23))).toBe('2026-01-31');
  });

  it("adds a break's seconds to today, rounded", () => {
    let board = addDodged({}, 90.4, at(2026, 11, 17));
    board = addDodged(board, 30, at(2026, 11, 17));
    expect(board).toEqual({ '2026-11-17': 120 });
  });

  it('keeps the last 14 days and drops older ones', () => {
    const board = { '2026-11-03': 10, '2026-11-04': 20, '2026-11-16': 30 };
    const next = addDodged(board, 5, at(2026, 11, 17));
    expect(Object.keys(next).sort()).toEqual(['2026-11-04', '2026-11-16', '2026-11-17']);
    expect(Object.keys(next)).toHaveLength(3);
    expect(DAYS_KEPT).toBe(14);
  });

  it('crosses months and years', () => {
    const next = addDodged({ '2025-12-18': 1, '2025-12-19': 2 }, 3, at(2026, 1, 1));
    expect(next).toEqual({ '2025-12-19': 2, '2026-01-01': 3 });
  });

  it('counts today, and this week as today and the six days before', () => {
    const board = { '2026-11-10': 100, '2026-11-11': 7, '2026-11-16': 30, '2026-11-17': 60 };
    expect(dodgedTotals(board, at(2026, 11, 17))).toEqual({ today: 60, week: 97 });
    expect(dodgedTotals(board, at(2026, 11, 18))).toEqual({ today: 0, week: 90 });
    expect(dodgedTotals({}, at(2026, 11, 17))).toEqual({ today: 0, week: 0 });
  });

  it('ignores days after today (a clock put back)', () => {
    expect(dodgedTotals({ '2026-11-18': 50, '2026-11-17': 5 }, at(2026, 11, 17))).toEqual({ today: 5, week: 5 });
  });

  it('reads only dates with a count of seconds from storage', () => {
    expect(readScoreboard({ '2026-11-17': 5, nope: 3, '2026-11-16': -1, '2026-11-15': 'x', '2026-11-14': NaN })).toEqual({ '2026-11-17': 5 });
    expect(readScoreboard(null)).toEqual({});
    expect(readScoreboard([1])).toEqual({});
  });
});

describe('scoreboard storage', () => {
  beforeEach(() => fakeBrowser.reset());

  it('records into storage.local and two breaks ending together both count', async () => {
    await Promise.all([recordDodged(30, at(2026, 11, 17)), recordDodged(45, at(2026, 11, 17))]);
    expect(await loadScoreboard()).toEqual({ '2026-11-17': 75 });
    expect((await fakeBrowser.storage.local.get(SCOREBOARD_KEY))[SCOREBOARD_KEY]).toEqual({ '2026-11-17': 75 });
  });

  it('tells the watcher the totals now and when they change', async () => {
    const seen: Dodged[] = [];
    const stop = watchDodged((d) => seen.push(d), () => at(2026, 11, 17));
    await new Promise((r) => setTimeout(r, 0));
    await recordDodged(20, at(2026, 11, 17));
    await new Promise((r) => setTimeout(r, 0));
    stop();
    await recordDodged(20, at(2026, 11, 17));
    await new Promise((r) => setTimeout(r, 0));
    expect(seen).toEqual([
      { today: 0, week: 0 },
      { today: 20, week: 20 },
    ]);
  });
});
