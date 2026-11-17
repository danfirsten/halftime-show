import { describe, expect, it } from 'vitest';
import { edgeInset, edgeOffset, edgeRect, edgeStep } from './edge';

describe('the edge clock', () => {
  it('runs 6 to 12 px in from the border, with the 20 px media radius', () => {
    expect(edgeInset(400)).toBe(6);
    expect(edgeInset(1100)).toBeCloseTo(9.9);
    expect(edgeInset(3000)).toBe(12);
    expect(edgeRect(1920, 1080)).toEqual({ x: 12, y: 12, width: 1896, height: 1056, rx: 20 });
    expect(edgeRect(30, 20).rx).toBeLessThanOrEqual(4);
  });

  it('is full at the start, drains from the top-left as time goes, and is gone at the end', () => {
    expect(edgeOffset(100, 100)).toBe(-0);
    expect(edgeOffset(75, 100)).toBe(-250);
    expect(edgeOffset(0, 100)).toBe(-1000);
    expect(edgeOffset(130, 100)).toBe(-0);
    expect(edgeOffset(10, 0)).toBe(0);
  });

  it('moves every second, or once every 5 s with reduced motion', () => {
    expect(edgeStep(60, 59, false)).toBe(59);
    expect(edgeStep(60, 59, true)).toBe(60);
    expect(edgeStep(60, 56, true)).toBe(60);
    expect(edgeStep(60, 55, true)).toBe(55);
    expect(edgeStep(3, 0, true)).toBe(0);
    expect(edgeStep(null, 42, true)).toBe(42);
    expect(edgeStep(20, 40, true)).toBe(40);
  });
});
