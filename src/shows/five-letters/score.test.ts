import { describe, expect, it } from 'vitest';
import { describeGuess, keyMarks, scoreGuess } from './score';
import { ANSWERS, VALID } from './words';

describe('scoreGuess', () => {
  it('marks right place, wrong place and absent', () => {
    expect(scoreGuess('crane', 'cedar')).toEqual(['hit', 'near', 'near', 'no', 'near']);
  });
  it('only marks a repeated letter as often as the answer has it', () => {
    // One E in "crane", and it is placed: the other Es are absent. One E in "abide", not placed: only the first is near.
    expect(scoreGuess('geese', 'crane')).toEqual(['no', 'no', 'no', 'no', 'hit']);
    expect(scoreGuess('speed', 'abide')).toEqual(['no', 'no', 'near', 'no', 'near']);
  });
  it('gives a hit its letter before a nearer wrong-place guess can use it', () => {
    expect(scoreGuess('llama', 'hello')).toEqual(['near', 'near', 'no', 'no', 'no']);
    expect(scoreGuess('hello', 'hello')).toEqual(['hit', 'hit', 'hit', 'hit', 'hit']);
  });
});

describe('describeGuess and keyMarks', () => {
  it('says each letter in words', () => {
    expect(describeGuess(1, 'crane', scoreGuess('crane', 'cedar'))).toBe(
      'Guess 1, crane. C right place. R in the word, wrong place. A in the word, wrong place. N not in the word. E in the word, wrong place.',
    );
  });
  it('keeps the best mark for each letter', () => {
    const m = keyMarks([
      { guess: 'speed', marks: ['no', 'no', 'near', 'no', 'no'] },
      { guess: 'eager', marks: ['hit', 'no', 'no', 'no', 'no'] },
    ]);
    expect(m.get('e')).toBe('hit');
    expect(m.get('s')).toBe('no');
  });
});

describe('the word list', () => {
  it('is five lowercase letters a word, and every answer can be guessed', () => {
    expect(ANSWERS.length).toBeGreaterThan(500);
    for (const w of ANSWERS) {
      expect(w).toMatch(/^[a-z]{5}$/);
      expect(VALID.has(w)).toBe(true);
    }
    expect(VALID.size).toBeGreaterThan(ANSWERS.length);
  });
});
