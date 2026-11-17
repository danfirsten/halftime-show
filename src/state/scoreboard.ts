// Ad time dodged: seconds per local day in storage.local, the last 14 days kept. Only the background writes it.

export const SCOREBOARD_KEY = 'scoreboard';
/** Days kept, today included. */
export const DAYS_KEPT = 14;
/** "This week" is today and the six days before it. */
export const WEEK_DAYS = 7;

/** Seconds dodged per local day, keyed `YYYY-MM-DD`. */
export type Scoreboard = Record<string, number>;

export interface Dodged {
  today: number;
  week: number;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The local date, `YYYY-MM-DD`. */
export function dayKey(when: Date): string {
  const m = String(when.getMonth() + 1).padStart(2, '0');
  const d = String(when.getDate()).padStart(2, '0');
  return `${when.getFullYear()}-${m}-${d}`;
}

function daysBefore(when: Date, days: number): string {
  return dayKey(new Date(when.getFullYear(), when.getMonth(), when.getDate() - days));
}

/** Whatever was stored, as a scoreboard: anything that isn't a date and a count of seconds is dropped. */
export function readScoreboard(value: unknown): Scoreboard {
  const board: Scoreboard = {};
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return board;
  for (const [day, seconds] of Object.entries(value)) {
    if (DAY.test(day) && typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0) board[day] = seconds;
  }
  return board;
}

/** Adds a break's seconds to the day it ended on, and drops days older than the last 14. */
export function addDodged(board: Scoreboard, seconds: number, when: Date): Scoreboard {
  const add = Number.isFinite(seconds) ? Math.max(0, Math.round(seconds)) : 0;
  const today = dayKey(when);
  const oldest = daysBefore(when, DAYS_KEPT - 1);
  const next: Scoreboard = {};
  for (const [day, value] of Object.entries(board)) if (day >= oldest && day <= today) next[day] = value;
  if (add > 0) next[today] = (next[today] ?? 0) + add;
  return next;
}

/** Today's total and the last seven days' total, today included. */
export function dodgedTotals(board: Scoreboard, when: Date): Dodged {
  const today = dayKey(when);
  const weekStart = daysBefore(when, WEEK_DAYS - 1);
  let week = 0;
  for (const [day, value] of Object.entries(board)) if (day >= weekStart && day <= today) week += value;
  return { today: board[today] ?? 0, week };
}

export async function loadScoreboard(): Promise<Scoreboard> {
  const stored = await browser.storage.local.get(SCOREBOARD_KEY);
  return readScoreboard(stored[SCOREBOARD_KEY]);
}

let writing: Promise<unknown> = Promise.resolve();

/** Adds a break's ad time to today. Writes one at a time, so two breaks ending together both count. */
export function recordDodged(seconds: number, when: Date = new Date()): Promise<void> {
  const next = writing.then(async () => {
    const board = addDodged(await loadScoreboard(), seconds, when);
    await browser.storage.local.set({ [SCOREBOARD_KEY]: board });
  });
  writing = next.catch(() => undefined);
  return next;
}

/** Milliseconds from `when` until just after the next local midnight, when "today" becomes a new day. */
export function untilTomorrow(when: Date): number {
  const midnight = new Date(when.getFullYear(), when.getMonth(), when.getDate() + 1).getTime();
  return Math.max(1000, midnight - when.getTime() + 1000);
}

/** Calls `onTotals` with today's and this week's totals now, whenever they change, and again just after midnight
 *  (a popup or an overlay left open overnight moves on to the new day). Returns a function that stops. */
export function watchDodged(onTotals: (dodged: Dodged) => void, now: () => Date = () => new Date()): () => void {
  let stopped = false;
  let board: Scoreboard = {};
  let midnight: ReturnType<typeof setTimeout> | undefined;
  const emit = (next: Scoreboard) => {
    if (stopped) return;
    board = next;
    onTotals(dodgedTotals(board, now()));
  };
  const rollOver = () => {
    midnight = setTimeout(() => {
      emit(board);
      rollOver();
    }, untilTomorrow(now()));
  };
  rollOver();
  loadScoreboard().then(emit, () => emit({}));
  const listener = (changes: Record<string, { newValue?: unknown }>, area: string) => {
    if (area === 'local' && SCOREBOARD_KEY in changes) emit(readScoreboard(changes[SCOREBOARD_KEY]?.newValue));
  };
  browser.storage.onChanged.addListener(listener);
  return () => {
    stopped = true;
    clearTimeout(midnight);
    browser.storage.onChanged.removeListener(listener);
  };
}

/** Clears all the ad time dodged. Writes in line with `recordDodged`, so a break ending now isn't lost to a half-done reset. */
export function resetDodged(): Promise<void> {
  const next = writing.then(() => browser.storage.local.remove(SCOREBOARD_KEY));
  writing = next.catch(() => undefined);
  return next;
}
