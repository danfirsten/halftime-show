import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { MAX_MISSES, RAMP_SECONDS, REDUCED_SLOWDOWN, aim, catchHalfWidth, createGame, difficulty, dotSpeed, restart, ringRadius, ringY, spawnGap, step, type Game } from './game';

const W = 800;
const H = 400;
/** The dot at index i, which the test knows is there. */
function dot(g: Game, i = 0) {
  const d = g.dots[i];
  if (!d) throw new Error(`no dot ${i}`);
  return d;
}

const calm = { reduced: false, rng: () => 0.5 };

/** A game with no dot due, Hoop at the middle, and one dot x (0 to 1 across) just above the ring. */
function withDot(x: number, v = 200): Game {
  const g = createGame(W, H);
  g.spawnIn = 99;
  g.dots.push({ x, y: ringY(W, H) - 4, v, caught: false, gone: false });
  return g;
}

describe('catching', () => {
  it('catches a dot that falls through the ring', () => {
    const g = withDot(0.5);
    step(g, 0.05, calm);
    expect(g.score).toBe(1);
    expect(dot(g).caught).toBe(true);
    expect(g.misses).toBe(0);
  });

  it('does not catch a dot that falls beside the ring, and counts it as a miss at the bottom', () => {
    const g = withDot(0.5 + (catchHalfWidth(W, H) + 20) / W);
    step(g, 0.05, calm);
    expect(g.score).toBe(0);
    for (let i = 0; i < 100; i++) step(g, 0.05, calm);
    expect(g.misses).toBe(1);
    expect(g.dots).toEqual([]);
  });

  it('counts a dot only once, however long it takes to leave', () => {
    const g = withDot(0.5);
    for (let i = 0; i < 200; i++) step(g, 0.05, calm);
    expect(g.score).toBe(1);
    expect(g.misses).toBe(0);
  });

  it('catches at the edge of the ring and not just outside it', () => {
    const half = catchHalfWidth(W, H);
    const inside = withDot(0.5 + (half - 2) / W);
    const outside = withDot(0.5 + (half + 2) / W);
    step(inside, 0.05, calm);
    step(outside, 0.05, calm);
    expect([inside.score, outside.score]).toEqual([1, 0]);
  });

  it('catches by falling through even in one long step', () => {
    const g = withDot(0.5, 5000);
    step(g, 0.05, calm);
    expect(g.score).toBe(1);
  });
});

describe('a round', () => {
  it('ends on the third miss, stops spawning and stops scoring', () => {
    const g = createGame(W, H);
    g.spawnIn = 99;
    for (let i = 0; i < MAX_MISSES; i++) g.dots.push({ x: 0.05, y: H + 11, v: 100, caught: false, gone: false });
    g.hx = g.tx = 0.95;
    step(g, 0.016, calm);
    expect(g.misses).toBe(MAX_MISSES);
    expect(g.status).toBe('over');
    const dots = g.dots.length;
    g.spawnIn = 0;
    g.dots.push({ x: 0.95, y: ringY(W, H) - 1, v: 400, caught: false, gone: false });
    step(g, 0.05, calm);
    expect(g.score).toBe(0);
    expect(g.dots.length).toBe(dots + 1);
  });

  it('removes dots that fall away after the round is over', () => {
    const g = withDot(0.1);
    g.status = 'over';
    for (let i = 0; i < 200; i++) step(g, 0.05, calm);
    expect(g.dots).toEqual([]);
    expect(g.misses).toBe(0);
  });

  it('starts again clean, on the same stage', () => {
    const g = withDot(0.5);
    step(g, 0.05, calm);
    restart(g);
    expect(g).toMatchObject({ w: W, h: H, score: 0, misses: 0, status: 'play', time: 0, dots: [] });
  });

  it('drops a dot within its first second', () => {
    const g = createGame(W, H);
    step(g, 0.5, calm);
    expect(g.dots.length).toBe(1);
  });

  it('keeps every dot on the stage', () => {
    for (const r of [0, 0.999]) {
      const g = createGame(W, H);
      step(g, 0.5, { reduced: false, rng: () => r });
      expect(dot(g).x).toBeGreaterThanOrEqual(0.05);
      expect(dot(g).x).toBeLessThanOrEqual(0.95);
    }
  });
});

describe('difficulty', () => {
  it('eases up through a round and stops at the top', () => {
    const levels = [0, 15, 30, 45, 60, RAMP_SECONDS, RAMP_SECONDS * 4].map(difficulty);
    expect(levels[0]).toBe(0);
    for (let i = 1; i < levels.length; i++) expect(levels[i] ?? 0).toBeGreaterThanOrEqual(levels[i - 1] ?? 0);
    expect(levels[levels.length - 1]).toBe(1);
    expect(difficulty(-5)).toBe(0);
  });

  it('makes dots fall faster and arrive closer together', () => {
    const early = createGame(W, H);
    const late = createGame(W, H);
    late.time = RAMP_SECONDS;
    expect(dotSpeed(late, false)).toBeGreaterThan(dotSpeed(early, false));
    expect(spawnGap(late, false)).toBeLessThan(spawnGap(early, false));
    expect(spawnGap(late, false)).toBeGreaterThan(0.3);
  });

  it('is slower with reduced motion, but dots still fall', () => {
    const g = createGame(W, H);
    expect(dotSpeed(g, true)).toBeCloseTo(dotSpeed(g, false) * REDUCED_SLOWDOWN);
    expect(spawnGap(g, true)).toBeGreaterThan(spawnGap(g, false));
    step(g, 0.5, { reduced: true, rng: () => 0.5 });
    step(g, 0.5, { reduced: true, rng: () => 0.5 });
    expect(dot(g).y).toBeGreaterThan(0);
  });

  it('counts time only while the round is on', () => {
    const g = createGame(W, H);
    g.status = 'over';
    step(g, 1, calm);
    expect(g.time).toBe(0);
  });
});

describe('Hoop', () => {
  it('keeps to the stage when aimed past its edge', () => {
    const g = createGame(W, H);
    aim(g, -3);
    expect(g.tx).toBeGreaterThan(0);
    aim(g, 7);
    expect(g.tx).toBeLessThan(1);
  });

  it('glides to where it is aimed, and with reduced motion is there at once', () => {
    const a = createGame(W, H);
    const b = createGame(W, H);
    a.spawnIn = b.spawnIn = 99;
    aim(a, 0.9);
    aim(b, 0.9);
    step(a, 0.016, calm);
    step(b, 0.016, { reduced: true, rng: () => 0.5 });
    expect(a.hx).toBeGreaterThan(0.5);
    expect(a.hx).toBeLessThan(0.9);
    expect(b.hx).toBeCloseTo(0.9);
  });

  it('blinks on a catch, but not with reduced motion', () => {
    const a = withDot(0.5);
    const b = withDot(0.5);
    step(a, 0.05, calm);
    step(b, 0.05, { reduced: true, rng: () => 0.5 });
    expect(a.blink).toBeGreaterThan(0);
    expect(b.blink).toBe(0);
  });

  it('has a ring that scales with a small stage', () => {
    expect(ringRadius(200, 100)).toBe(12);
    expect(ringRadius(1600, 900)).toBeGreaterThan(ringRadius(800, 400));
  });

  it('does nothing before the stage has a size', () => {
    const g = createGame();
    step(g, 1, calm);
    expect(g.dots).toEqual([]);
  });
});

describe('the stylesheet', () => {
  it('names no colour, size of motion or font: tokens only', () => {
    const css = readFileSync('src/shows/hoops-catch/hoops-catch.css', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/);
    expect(css).not.toMatch(/\btransition:[^;]*\ball\b/);
    expect(css).not.toMatch(/\d+ms\b/);
  });
});
