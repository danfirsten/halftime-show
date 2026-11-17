// The maths of Something to look at, apart from the canvas so it can be tested: a seeded random source, the flow
// field the marks follow, and how many marks should be on the page for a given point in the break.

/** How many marks a finished drawing holds. */
export const MARKS = 1400;
/** With no known break length the drawing takes this long to finish, at a steady pace. */
export const UNKNOWN_SECONDS = 120;
/** With reduced motion, marks arrive in a batch this often. */
export const BATCH_SECONDS = 5;
/** A drawing left for less than this long (another show was picked, then this one again) carries on, not restarts. */
export const KEEP_MS = 60_000;

/** A small seeded random source (mulberry32): the same seed always draws the same picture. */
export function rng(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface Mark {
  /** Points of one line, in canvas pixels. */
  points: [number, number][];
  alpha: number;
  width: number;
}

function field(seed: number, w: number, h: number, x: number, y: number): number {
  const s = (seed % 1000) / 160;
  const nx = x / w;
  const ny = y / h;
  return Math.sin(nx * 3.2 + s) * 1.7 + Math.cos(ny * 4.1 - s * 0.7) * 1.4 + Math.sin((nx - ny) * 6.3 + s * 1.3) * 0.5;
}

/** Mark number `i` of the drawing with this seed, or null when that mark falls outside the picture. The same
 *  (seed, i) always gives the same mark, so a resize redraws the same drawing. */
export function markAt(seed: number, i: number, w: number, h: number): Mark | null {
  const r = rng(seed * 7919 + i);
  const x0 = r() * w;
  const y0 = r() * h;
  // Centred a little above the middle and kept off the bottom row, where the tabs and the note sit.
  const d = Math.hypot((x0 - w / 2) / (w * 0.46), (y0 - h * 0.46) / (h * 0.42));
  if (d > 1 || r() > 1.05 - d * 0.9) return null;
  const alpha = 0.24 + r() * 0.5;
  const hair = Math.max(0.8, w / 1100);
  const width = r() < 0.12 ? hair * 1.75 : hair;
  const steps = 10 + Math.floor(r() * 16);
  const st = Math.max(2, w / 260);
  const points: [number, number][] = [[x0, y0]];
  let x = x0;
  let y = y0;
  for (let k = 0; k < steps; k++) {
    const a = field(seed, w, h, x, y);
    x += Math.cos(a) * st;
    y += Math.sin(a) * st;
    points.push([x, y]);
  }
  return { points, alpha, width };
}

/** Paces the drawing. Progress runs from 0 to 1 while the show is on screen; each `start` re-aims it so it lands
 *  at 1 as the break does. Unknown length: a steady pace that never rushes. */
export class Pace {
  progress = 0;
  private rate = 1 / UNKNOWN_SECONDS;
  private last: number | null = null;
  private ran = 0;
  private batchP = 0;
  private batchAt = 0;

  start(now: number, secondsLeft: number | null): void {
    this.tick(now);
    this.last = now;
    this.rate = secondsLeft === null ? 1 / UNKNOWN_SECONDS : (1 - this.progress) / Math.max(1, secondsLeft);
  }

  stop(now: number): void {
    this.tick(now);
    this.last = null;
  }

  /** Move to `now` (milliseconds). */
  tick(now: number): void {
    if (this.last === null) return;
    const dt = Math.max(0, now - this.last) / 1000;
    this.last = now;
    this.ran += dt;
    this.progress = Math.min(1, this.progress + dt * this.rate);
    // Reduced motion: the picture only changes every BATCH_SECONDS, and once more when it is finished.
    if (this.ran - this.batchAt >= BATCH_SECONDS || (this.progress >= 1 && this.batchP < 1)) {
      this.batchAt = this.ran;
      this.batchP = this.progress;
    }
  }

  /** How many marks to show now: a continuous count, or with `reduced` the count as of the last batch. */
  count(reduced: boolean): number {
    return Math.floor((reduced ? this.batchP : this.progress) * MARKS);
  }
}

/** The drawing kept between two visits of this show inside one break. */
let kept: { seed: number; pace: Pace; at: number } | null = null;

/** A drawing for this visit: the one just left if it was left a moment ago, else a new seed. */
export function takeDrawing(now: number, newSeed: () => number = () => Math.floor(Math.random() * 1e6)): { seed: number; pace: Pace } {
  if (kept && now - kept.at < KEEP_MS && kept.pace.progress < 1) return { seed: kept.seed, pace: kept.pace };
  return { seed: newSeed(), pace: new Pace() };
}

export function keepDrawing(now: number, seed: number, pace: Pace): void {
  kept = { seed, pace, at: now };
}
