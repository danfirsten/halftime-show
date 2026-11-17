import { describe, expect, it } from 'vitest';
import { BATCH_SECONDS, MARKS, Pace, UNKNOWN_SECONDS, keepDrawing, markAt, rng, takeDrawing } from './draw';

describe('the drawing', () => {
  it('is the same for the same seed and different for another', () => {
    const a = Array.from({ length: 50 }, (_, i) => markAt(7, i, 800, 450));
    expect(Array.from({ length: 50 }, (_, i) => markAt(7, i, 800, 450))).toEqual(a);
    expect(Array.from({ length: 50 }, (_, i) => markAt(8, i, 800, 450))).not.toEqual(a);
    expect(rng(1)()).toBe(rng(1)());
  });
  it('keeps every mark near the picture', () => {
    for (let i = 0; i < 300; i++) {
      const m = markAt(3, i, 800, 450);
      if (m) expect(m.points[0]![0]).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('timing', () => {
  it('completes as a known break ends', () => {
    const p = new Pace();
    p.start(0, 40);
    p.tick(20_000);
    expect(p.progress).toBeCloseTo(0.5, 2);
    p.tick(40_000);
    expect(p.progress).toBe(1);
    expect(p.count(false)).toBe(MARKS);
  });
  it('re-aims when the time left is given again', () => {
    const p = new Pace();
    p.start(0, 100);
    p.stop(50_000);
    p.start(60_000, 10);
    p.tick(65_000);
    expect(p.progress).toBeCloseTo(0.75, 2);
    p.tick(70_000);
    expect(p.progress).toBe(1);
  });
  it('builds at a steady pace when the length is unknown, and holds when stopped', () => {
    const p = new Pace();
    p.start(0, null);
    p.tick(UNKNOWN_SECONDS * 250);
    expect(p.progress).toBeCloseTo(0.25, 2);
    p.stop(UNKNOWN_SECONDS * 500);
    const at = p.progress;
    p.tick(UNKNOWN_SECONDS * 900);
    expect(p.progress).toBe(at);
  });
  it('with reduced motion changes in batches, and finishes in one', () => {
    const p = new Pace();
    p.start(0, 40);
    p.tick(2_000);
    expect(p.count(true)).toBe(0);
    p.tick(BATCH_SECONDS * 1000);
    expect(p.count(true)).toBe(Math.floor((BATCH_SECONDS / 40) * MARKS));
    p.tick(6_000);
    const held = p.count(true);
    p.tick(7_000);
    expect(p.count(true)).toBe(held);
    p.tick(40_000);
    expect(p.count(true)).toBe(MARKS);
  });
  it('carries a drawing across a quick switch of show, and starts afresh after a long while', () => {
    const first = takeDrawing(0, () => 11);
    first.pace.start(0, 40);
    first.pace.stop(10_000);
    keepDrawing(10_000, first.seed, first.pace);
    expect(takeDrawing(20_000, () => 99).seed).toBe(11);
    expect(takeDrawing(200_000, () => 99).seed).toBe(99);
  });
});
