/** One row of questions.json: [id, question, right answer, three wrong answers]. */
export type BankRow = [id: string, question: string, right: string, wrong: [string, string, string]];

/** A question as shown: the answers in a shuffled order, and where the right one landed. */
export interface Ask {
  id: string;
  question: string;
  answers: string[];
  right: number;
}

/** Roughly how long a person needs for one question: reading it, answering, and the pause after. */
export const SECONDS_PER_QUESTION = 12;
export const MOST_QUESTIONS = 3;
/** The pause after an answer, before the next question. */
export const NEXT_MS = 1200;

/**
 * How many questions fit the break. Three when it is long enough or its length isn't known; fewer when it is
 * short, never fewer than one.
 */
export function questionCount(breakSeconds: number | null): number {
  if (breakSeconds === null || !Number.isFinite(breakSeconds)) return MOST_QUESTIONS;
  const fit = Math.floor(breakSeconds / SECONDS_PER_QUESTION);
  return Math.min(MOST_QUESTIONS, Math.max(1, fit));
}

/** Whether another question still fits after an answer, given the seconds left (null: not known). */
export function hasTimeFor(secondsLeft: number | null): boolean {
  return secondsLeft === null || secondsLeft >= SECONDS_PER_QUESTION * 0.75;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  // Sort by a random key each (Schwartzian), which is a fair shuffle when the keys are distinct.
  return items
    .map((item) => ({ item, key: random() }))
    .sort((a, b) => a.key - b.key)
    .map((x) => x.item);
}

/**
 * Pick `count` questions the viewer hasn't seen. `seen` runs oldest first. Only when fewer than `count` unseen ones
 * are left do the longest-ago seen ones come back, so nothing repeats until the whole bank has been used.
 */
export function pickQuestions(bank: readonly BankRow[], seen: readonly string[], count: number, random: () => number = Math.random): Ask[] {
  const seenSet = new Set(seen);
  const fresh = shuffle(bank.filter(([id]) => !seenSet.has(id)), random);
  let chosen = fresh.slice(0, count);
  if (chosen.length < count) {
    const order = new Map(seen.map((id, i) => [id, i]));
    const older = bank.filter(([id]) => seenSet.has(id)).sort((a, b) => (order.get(a[0]) ?? 0) - (order.get(b[0]) ?? 0));
    chosen = [...chosen, ...older.slice(0, count - chosen.length)];
  }
  return chosen.map(([id, question, right, wrong]) => {
    const answers = shuffle([right, ...wrong], random);
    return { id, question, answers, right: answers.indexOf(right) };
  });
}

/** Add an id as the newest seen one, and keep the list no longer than the bank. */
export function markSeen(seen: readonly string[], id: string, bankSize: number): string[] {
  const next = [...seen.filter((s) => s !== id), id];
  return next.length > bankSize ? next.slice(next.length - bankSize) : next;
}
