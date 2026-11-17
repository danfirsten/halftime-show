/** How one letter of a guess scored: `hit` right letter, right place; `near` in the word, wrong place; `no` not there. */
export type Mark = 'hit' | 'near' | 'no';

/** Scores a guess against the answer, both five lowercase letters. A repeated letter is only marked as often as the
 *  answer has it: hits first, then the left-over letters from the left. */
export function scoreGuess(guess: string, answer: string): Mark[] {
  const marks: Mark[] = Array.from({ length: guess.length }, () => 'no');
  const spare = new Map<string, number>();
  const g = [...guess];
  const a = [...answer];
  g.forEach((c, i) => {
    const want = a[i] ?? '';
    if (c === want) marks[i] = 'hit';
    else spare.set(want, (spare.get(want) ?? 0) + 1);
  });
  g.forEach((c, i) => {
    const left = spare.get(c) ?? 0;
    if (marks[i] !== 'hit' && left > 0) {
      marks[i] = 'near';
      spare.set(c, left - 1);
    }
  });
  return marks;
}

const SAY: Record<Mark, string> = { hit: 'right place', near: 'in the word, wrong place', no: 'not in the word' };

/** A guess in words, for a screen reader: "Guess 2, crane. C not in the word. R right place. ..." */
export function describeGuess(n: number, guess: string, marks: Mark[]): string {
  return `Guess ${n}, ${guess}. ${[...guess].map((c, i) => `${c.toUpperCase()} ${SAY[marks[i] ?? 'no']}`).join('. ')}.`;
}

/** The best mark each letter has had so far, for the on-screen keys (hit beats near beats no). */
export function keyMarks(rows: { guess: string; marks: Mark[] }[]): Map<string, Mark> {
  const rank: Record<Mark, number> = { no: 0, near: 1, hit: 2 };
  const best = new Map<string, Mark>();
  for (const { guess, marks } of rows) {
    [...guess].forEach((c, i) => {
      const mark = marks[i] ?? 'no';
      const had = best.get(c);
      if (!had || rank[mark] > rank[had]) best.set(c, mark);
    });
  }
  return best;
}
