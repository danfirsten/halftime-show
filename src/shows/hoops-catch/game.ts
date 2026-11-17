// The rules of Hoop's catch, with no browser in them: a step function over plain numbers, so it is easy to test.
// A dot is caught when it falls through the ring (Hoop's own move, docs/design.md), not when it bumps it.

export const MAX_MISSES = 3;
/** Seconds of play for the difficulty to reach its top. Each round starts easy again. */
export const RAMP_SECONDS = 75;
/** With reduced motion the dots fall and arrive slower. The game is still the game. */
export const REDUCED_SLOWDOWN = 0.6;

export interface Dot {
  /** Across the stage, 0 to 1. */
  x: number;
  /** Down from the top, in pixels. */
  y: number;
  /** Pixels per second. */
  v: number;
  caught: boolean;
  /** Fell past the bottom: counted as a miss, and removed. */
  gone: boolean;
}

export interface Game {
  w: number;
  h: number;
  dots: Dot[];
  /** Hoop's place across the stage (0 to 1), and where it is heading. */
  hx: number;
  tx: number;
  score: number;
  misses: number;
  status: 'play' | 'over';
  /** Seconds until the next dot. */
  spawnIn: number;
  /** Seconds played this round. */
  time: number;
  /** Seconds left of Hoop's blink after a catch. */
  blink: number;
}

export interface StepOptions {
  reduced: boolean;
  /** 0 to 1, like Math.random. */
  rng(): number;
}

export const EDGE = 0.04;

export function createGame(w = 0, h = 0): Game {
  return { w, h, dots: [], hx: 0.5, tx: 0.5, score: 0, misses: 0, status: 'play', spawnIn: 0.4, time: 0, blink: 0 };
}

/** A fresh round on the same stage. */
export function restart(g: Game): void {
  Object.assign(g, createGame(g.w, g.h));
}

/** 0 at the start of a round, easing up to 1 at RAMP_SECONDS and staying there. */
export function difficulty(time: number): number {
  const t = Math.min(1, Math.max(0, time / RAMP_SECONDS));
  return t * t * (3 - 2 * t);
}

export function ringRadius(w: number, h: number): number {
  return Math.max(12, Math.min(w, h) * 0.075);
}

/** Where Hoop's middle sits, near the bottom. */
export function ringY(w: number, h: number): number {
  return h - ringRadius(w, h) * 1.9;
}

/** How far across a dot can be from Hoop's middle and still fall through the ring. */
export function catchHalfWidth(w: number, h: number): number {
  return ringRadius(w, h) * 0.78;
}

/** Aim Hoop at a place across the stage (0 to 1). */
export function aim(g: Game, x: number): void {
  g.tx = Math.min(1 - EDGE, Math.max(EDGE, x));
}

export function dotSpeed(g: Game, reduced: boolean): number {
  return g.h * (0.24 + 0.22 * difficulty(g.time)) * (reduced ? REDUCED_SLOWDOWN : 1);
}

export function spawnGap(g: Game, reduced: boolean): number {
  return (1.25 - 0.6 * difficulty(g.time)) / (reduced ? REDUCED_SLOWDOWN : 1);
}

/** Moves the game on by dt seconds. */
export function step(g: Game, dt: number, { reduced, rng }: StepOptions): void {
  if (g.w <= 0 || g.h <= 0) return;
  const hy = ringY(g.w, g.h);
  const half = catchHalfWidth(g.w, g.h);
  const R = ringRadius(g.w, g.h);

  if (g.status === 'play') {
    g.time += dt;
    g.spawnIn -= dt;
    if (g.spawnIn <= 0) {
      g.dots.push({ x: 0.06 + rng() * 0.88, y: -8, v: dotSpeed(g, reduced), caught: false, gone: false });
      g.spawnIn = spawnGap(g, reduced);
    }
  }

  // Hoop glides to where it is aimed; with reduced motion it is simply there.
  g.hx += (g.tx - g.hx) * (reduced ? 1 : 1 - Math.pow(0.0004, dt));
  const hx = g.hx * g.w;

  for (const d of g.dots) {
    const before = d.y;
    d.y += d.v * dt;
    if (g.status === 'play' && !d.caught && before < hy && d.y >= hy && Math.abs(d.x * g.w - hx) < half) {
      d.caught = true;
      g.score += 1;
      g.blink = reduced ? 0 : 0.14;
    } else if (!d.caught && !d.gone && d.y > g.h + 10) {
      d.gone = true;
      if (g.status === 'play') {
        g.misses += 1;
        if (g.misses >= MAX_MISSES) g.status = 'over';
      }
    }
  }
  g.dots = g.dots.filter((d) => !d.gone && !(d.caught && d.y > hy + R * 1.2));
  g.blink = Math.max(0, g.blink - dt);
}
