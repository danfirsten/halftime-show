// The scorer: pure functions that turn snapshots of a page's ad signals into "is this an ad break?".
// Nothing here reads the page; observe.ts does that. Nothing here knows about Hulu; src/sites/ does.

/** One signal read from the page at one moment. */
export interface Reading {
  id: string;
  /** Signals in the same group come from the same piece of the player, so they don't count as agreeing. */
  group: string;
  weight: number;
  on: boolean;
}

export interface Snapshot {
  /** Milliseconds, from any steady clock. */
  at: number;
  readings: Reading[];
  /** What the page's own countdown says is left, or null when there isn't one to read. */
  secondsLeft: number | null;
  /** The video is waiting for data. Nothing on the page can be trusted to settle while it is. */
  stalled: boolean;
}

/** Thresholds and holds. Each site sets its own (src/sites/). */
export interface Tuning {
  /** A break can start once confidence reaches this. */
  startAt: number;
  /** A break can end once confidence falls below this. */
  endAt: number;
  /** The hold when two or more groups agree: on the way in, or all clear on the way out. */
  quickMs: number;
  /** The hold when only one group says so. Longer than any flicker. */
  holdMs: number;
  /** A stall freezes the verdict for this long at most. */
  stallLimitMs: number;
}

export interface Verdict {
  inBreak: boolean;
  /** 0 to 1: the share of the site's signal weight that says "ad" right now. */
  confidence: number;
  secondsLeft: number | null;
}

export interface DetectorState {
  inBreak: boolean;
  /** When the readings first called for a change that hasn't happened yet. */
  pendingSince: number | null;
  /** The most groups that agreed during this break. */
  peakGroups: number;
  /** The last countdown read, and when (re-anchored while stalled, so a stall doesn't eat the time). */
  countdown: { seconds: number; at: number } | null;
  stalledSince: number | null;
}

export type Change = 'start' | 'end' | null;

export function initialState(): DetectorState {
  return { inBreak: false, pendingSince: null, peakGroups: 0, countdown: null, stalledSince: null };
}

export function confidence(readings: Reading[]): number {
  let total = 0;
  let on = 0;
  for (const r of readings) {
    total += r.weight;
    if (r.on) on += r.weight;
  }
  return total > 0 ? on / total : 0;
}

/** How many separate groups have at least one signal on. */
export function agreeingGroups(readings: Reading[]): number {
  return new Set(readings.filter((r) => r.on).map((r) => r.group)).size;
}

/**
 * One step of the detector. A break starts when confidence holds at `startAt` or more, and ends when it holds
 * below `endAt`. The hold is short when separate parts of the player agree, and long when only one does, so a
 * flicker in one part never toggles the verdict.
 */
export function step(
  prev: DetectorState,
  snap: Snapshot,
  tuning: Tuning,
): { state: DetectorState; verdict: Verdict; change: Change } {
  const state: DetectorState = { ...prev };
  const conf = confidence(snap.readings);
  const groups = agreeingGroups(snap.readings);
  let change: Change = null;

  if (snap.stalled) state.stalledSince ??= snap.at;
  else state.stalledSince = null;
  const frozen = state.stalledSince !== null && snap.at - state.stalledSince < tuning.stallLimitMs;

  if (frozen) {
    state.pendingSince = null;
    if (state.countdown) state.countdown = { ...state.countdown, at: snap.at };
  } else {
    if (snap.secondsLeft !== null) state.countdown = { seconds: snap.secondsLeft, at: snap.at };
    const wantsChange = state.inBreak ? conf < tuning.endAt : conf >= tuning.startAt;
    if (!wantsChange) {
      state.pendingSince = null;
    } else {
      state.pendingSince ??= snap.at;
      const quick = state.inBreak ? groups === 0 && state.peakGroups >= 2 : groups >= 2;
      if (snap.at - state.pendingSince >= (quick ? tuning.quickMs : tuning.holdMs)) {
        state.inBreak = !state.inBreak;
        state.pendingSince = null;
        state.peakGroups = 0;
        if (!state.inBreak) state.countdown = null;
        change = state.inBreak ? 'start' : 'end';
      }
    }
    if (state.inBreak) state.peakGroups = Math.max(state.peakGroups, groups);
  }

  return { state, verdict: { inBreak: state.inBreak, confidence: conf, secondsLeft: secondsLeft(state, snap.at) }, change };
}

function secondsLeft(state: DetectorState, at: number): number | null {
  if (!state.inBreak || !state.countdown) return null;
  return Math.max(0, state.countdown.seconds - (at - state.countdown.at) / 1000);
}

/** Reads the last clock in a piece of text: "0:25", "1:02:03", "Ad 1 of 2 · 0:25". Null when there is none. */
export function parseClock(text: string): number | null {
  const matches = text.match(/\d+(?::\d{2}){1,2}/g);
  if (!matches) return null;
  const parts = matches[matches.length - 1]!.split(':').map(Number);
  return parts.reduce((sum, n) => sum * 60 + n, 0);
}
