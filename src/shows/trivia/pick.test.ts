import { describe, expect, it } from 'vitest';
import bank from './questions.json';
import { MOST_QUESTIONS, hasTimeFor, markSeen, pickQuestions, questionCount, type BankRow } from './pick';

const rows = bank as BankRow[];
const small: BankRow[] = Array.from({ length: 7 }, (_, i) => [`q${i}`, `Question ${i}?`, `right ${i}`, ['a', 'b', 'c']]);
function seeded(seed: number) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

describe('the question bank', () => {
  it('has at least 500 questions, each with an id, a question, one right answer and three different wrong ones', () => {
    expect(rows.length).toBeGreaterThanOrEqual(500);
    expect(new Set(rows.map((r) => r[0])).size).toBe(rows.length);
    for (const [id, question, right, wrong] of rows) {
      expect(id).toMatch(/^[gft]\d{3}$/);
      expect(question.length).toBeGreaterThan(10);
      expect(wrong).toHaveLength(3);
      expect(new Set([right, ...wrong]).size).toBe(4);
    }
  });
  it('has no question about Hulu, and no HTML left in the text', () => {
    const all = JSON.stringify(rows);
    expect(all).not.toMatch(/hulu/i);
    expect(all).not.toMatch(/&(quot|amp|#\d+|\w+);/);
  });
});

describe('how many questions fit', () => {
  it('is three for a long break or an unknown one, and fewer for a short one, never fewer than one', () => {
    expect(questionCount(null)).toBe(MOST_QUESTIONS);
    expect(questionCount(102)).toBe(3);
    expect(questionCount(36)).toBe(3);
    expect(questionCount(30)).toBe(2);
    expect(questionCount(15)).toBe(1);
    expect(questionCount(3)).toBe(1);
    expect(questionCount(0)).toBe(1);
  });
  it('stops asking when too little time is left', () => {
    expect(hasTimeFor(null)).toBe(true);
    expect(hasTimeFor(40)).toBe(true);
    expect(hasTimeFor(4)).toBe(false);
  });
});

describe('picking', () => {
  it('picks the count asked, each with four answers and the right one marked', () => {
    const asks = pickQuestions(rows, [], 3, seeded(1));
    expect(asks).toHaveLength(3);
    for (const a of asks) {
      expect(a.answers).toHaveLength(4);
      const row = rows.find((r) => r[0] === a.id)!;
      expect(a.answers[a.right]).toBe(row[2]);
    }
  });
  it('never picks a question already seen while enough unseen ones are left', () => {
    const seen = small.slice(0, 4).map((r) => r[0]);
    for (let seed = 1; seed < 30; seed++) {
      const ids = pickQuestions(small, seen, 3, seeded(seed)).map((a) => a.id);
      expect(ids.sort()).toEqual(['q4', 'q5', 'q6']);
    }
  });
  it('brings the longest-ago seen ones back only when the unseen run out', () => {
    const seen = ['q3', 'q0', 'q1', 'q2', 'q5', 'q6'];
    const ids = pickQuestions(small, seen, 3, seeded(2)).map((a) => a.id);
    expect(ids).toContain('q4');
    expect(ids).toContain('q3');
    expect(ids).toContain('q0');
  });
  it('gives no repeats across the whole bank: 238 breaks of three use every question once', () => {
    let seen: string[] = [];
    const used = new Set<string>();
    const random = seeded(7);
    for (let b = 0; b < Math.floor(rows.length / 3); b++) {
      for (const a of pickQuestions(rows, seen, 3, random)) {
        expect(used.has(a.id)).toBe(false);
        used.add(a.id);
        seen = markSeen(seen, a.id, rows.length);
      }
    }
  });
  it('shuffles the answers', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed < 40; seed++) positions.add(pickQuestions(small, [], 1, seeded(seed))[0]!.right);
    expect(positions.size).toBeGreaterThan(1);
  });
});

describe('markSeen', () => {
  it('puts an id last, once, and keeps the list no longer than the bank', () => {
    expect(markSeen(['a', 'b', 'c'], 'a', 10)).toEqual(['b', 'c', 'a']);
    expect(markSeen(['a', 'b', 'c'], 'd', 3)).toEqual(['b', 'c', 'd']);
  });
});
