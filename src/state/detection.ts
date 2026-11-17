// How long the viewer has watched Hulu without a break being spotted, so the popup and options page can say when
// detection may be out of date (Hulu changed its player). Seconds only: no titles, no times of day, nothing about what was watched.

export const DETECTION_KEY = 'detection';
/** About three episodes. */
export const STALE_AFTER_SECONDS = 3 * 60 * 60;

export interface Detection {
  /** Seconds of watching, outside breaks, since the last break was spotted (or since the start). */
  watched: number;
}

export function readDetection(value: unknown): Detection {
  const watched = typeof value === 'object' && value !== null ? (value as { watched?: unknown }).watched : undefined;
  return { watched: typeof watched === 'number' && Number.isFinite(watched) && watched > 0 ? Math.round(watched) : 0 };
}

export function isStale(detection: Detection): boolean {
  return detection.watched >= STALE_AFTER_SECONDS;
}

let writing: Promise<unknown> = Promise.resolve();

function update(change: (d: Detection) => Detection): Promise<void> {
  const next = writing.then(async () => {
    const current = readDetection((await browser.storage.local.get(DETECTION_KEY))[DETECTION_KEY]);
    const after = change(current);
    if (after.watched !== current.watched) await browser.storage.local.set({ [DETECTION_KEY]: after });
  });
  writing = next.catch(() => undefined);
  return next;
}

/** Watching went on for this long with no break. Capped, so the number can't grow without end. */
export function recordWatched(seconds: number): Promise<void> {
  const add = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  return add === 0 ? Promise.resolve() : update((d) => ({ watched: Math.min(d.watched + add, STALE_AFTER_SECONDS * 2) }));
}

/** A break was spotted: detection works. */
export function recordBreakSeen(): Promise<void> {
  return update(() => ({ watched: 0 }));
}

/** Calls `onDetection` now and whenever it changes. Returns a function that stops. */
export function watchDetection(onDetection: (detection: Detection) => void): () => void {
  let stopped = false;
  browser.storage.local.get(DETECTION_KEY).then(
    (s) => !stopped && onDetection(readDetection(s[DETECTION_KEY])),
    () => undefined,
  );
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && DETECTION_KEY in changes) onDetection(readDetection(changes[DETECTION_KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    stopped = true;
    browser.storage.onChanged.removeListener(listener);
  };
}

/** Counts playing time between ticks. Call `tick(playing)` every so often; the time since the last tick is counted when `playing`. */
export function createWatchClock(now: () => number, record: (seconds: number) => void): { tick(playing: boolean): void } {
  let last = now();
  return {
    tick(playing) {
      const at = now();
      const seconds = (at - last) / 1000;
      last = at;
      // A long gap means the tab was asleep or the laptop shut: that wasn't watching.
      if (playing && seconds > 0 && seconds <= 120) record(seconds);
    },
  };
}
