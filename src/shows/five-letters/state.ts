import { browser } from 'wxt/browser';

/** Five letters keeps its own small record in `storage.local`, under its own key. */
export const STORAGE_KEY = 'halftime.fiveLetters';
export const MAX_ROWS = 6;
/** The last this many answers are not drawn again. */
export const RECENT = 200;
/** A streak counts for one episode: if nothing was played for this long, it starts again from 0. */
export const EPISODE_MS = 4 * 60 * 60 * 1000;

export interface Saved {
  /** The word being guessed, and the guesses so far (all lowercase). */
  answer: string;
  guesses: string[];
  /** What was typed in the open row when the game paused. */
  typing: string;
  /** The game has been won or lost. The next break starts a new word. */
  done: boolean;
}

export interface Record5 {
  game: Saved | null;
  streak: number;
  /** When a guess was last made (ms). */
  lastPlayed: number;
  /** Recent answers, oldest first. */
  recent: string[];
}

export const EMPTY: Record5 = { game: null, streak: 0, lastPlayed: 0, recent: [] };

function clean(v: unknown): Record5 {
  const r = (v ?? {}) as Partial<Record5>;
  const g = r.game;
  const game =
    g && typeof g.answer === 'string' && /^[a-z]{5}$/.test(g.answer) && Array.isArray(g.guesses)
      ? {
          answer: g.answer,
          guesses: g.guesses.filter((w): w is string => typeof w === 'string' && /^[a-z]{5}$/.test(w)).slice(0, MAX_ROWS),
          typing: typeof g.typing === 'string' ? g.typing.replace(/[^a-z]/g, '').slice(0, 5) : '',
          done: g.done === true,
        }
      : null;
  return {
    game,
    streak: typeof r.streak === 'number' && r.streak > 0 ? Math.floor(r.streak) : 0,
    lastPlayed: typeof r.lastPlayed === 'number' ? r.lastPlayed : 0,
    recent: Array.isArray(r.recent) ? r.recent.filter((w): w is string => typeof w === 'string').slice(-RECENT) : [],
  };
}

/** Reads the record. Anything missing or damaged reads as a fresh start; where there is no extension storage (the
 *  stand-in page outside the extension) it quietly keeps nothing. */
export async function load(now = Date.now()): Promise<Record5> {
  try {
    const got = await browser.storage.local.get(STORAGE_KEY);
    const r = clean(got[STORAGE_KEY]);
    return now - r.lastPlayed > EPISODE_MS ? { ...r, streak: 0 } : r;
  } catch {
    return { ...EMPTY };
  }
}

export async function save(r: Record5): Promise<void> {
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: r });
  } catch {
    // Nothing to keep it in: the game still plays, it just won't carry over to the next break.
  }
}

/** Picks a word that hasn't come up lately. `random` is injectable for tests. */
export function pickAnswer(answers: readonly string[], recent: readonly string[], random: () => number = Math.random): string {
  const seen = new Set(recent);
  const fresh = answers.filter((w) => !seen.has(w));
  const pool = fresh.length > 0 ? fresh : answers;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))] ?? '';
}
