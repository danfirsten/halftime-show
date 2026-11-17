// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { fiveLetters } from './index';
import { STORAGE_KEY, EPISODE_MS, load, pickAnswer, type Record5 } from './state';
import { ANSWERS } from './words';
import { NEXT_WORD_AFTER_MS } from './FiveLetters';
import type { ShowControl } from '../types';

let root: HTMLElement;
let control: ShowControl | null;
const Show = fiveLetters.Component;

const rec = (over: Partial<Record5>): Record5 => ({ game: null, streak: 0, lastPlayed: Date.now(), recent: [], ...over });
const seed = (r: Record5) => fakeBrowser.storage.local.set({ [STORAGE_KEY]: r });
const realSetTimeout = globalThis.setTimeout;
const flush = () => act(async () => void (await new Promise((r) => realSetTimeout(r, 0))));
const mount = async () => {
  await act(() => void render(<Show register={(c) => (control = c)} />, root));
  await flush();
};
const start = (n: number | null = 90) => act(() => control!.start(n));
const key = (k: string) => act(() => void control!.key!(new KeyboardEvent('keydown', { key: k })));
const type = async (w: string) => {
  for (const c of w) await key(c);
};
const guess = async (w: string) => {
  await type(w);
  await key('Enter');
};
const rows = () => [...root.querySelectorAll('.w-row')];
const marks = (i: number) => [...rows()[i]!.querySelectorAll('.w-tile')].map((t) => t.getAttribute('data-s'));
const saved = async () => (await fakeBrowser.storage.local.get(STORAGE_KEY))[STORAGE_KEY] as Record5;

beforeEach(async () => {
  fakeBrowser.reset();
  await fakeBrowser.storage.local.clear();
  root = document.createElement('div');
  document.body.append(root);
  control = null;
});
afterEach(async () => {
  vi.useRealTimers();
  await act(() => control?.stop());
  await flush();
  render(null, root);
  root.remove();
  await flush(); // let the save a closing show makes land before the next test resets storage
});

describe('Five letters', () => {
  it('plays six guesses: marks a guess, shows the keys, and says it in words', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    await guess('crane');
    expect(marks(0)).toEqual(['hit', 'near', 'near', 'no', 'near']);
    expect(root.querySelector('[data-k="c"]')!.getAttribute('data-s')).toBe('hit');
    expect(root.querySelector('.w-sr')!.textContent).toContain('C right place. R in the word, wrong place.');
    expect(rows()[0]!.getAttribute('aria-label')).toContain('N not in the word');
    expect(rows()).toHaveLength(6);
  });

  it('takes backspace, ignores keys with a modifier and keys it does not use', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    await type('cx');
    await key('Backspace');
    expect(rows()[0]!.textContent).toBe('c');
    expect(control!.key!(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true }))).toBe(false);
    expect(control!.key!(new KeyboardEvent('keydown', { key: 'Tab' }))).toBe(false);
    expect(control!.key!(new KeyboardEvent('keydown', { key: 'a' }))).toBe(true);
  });

  it('takes the on-screen keys too', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    for (const k of ['c', 'r', 'a', 'n', 'e']) await act(() => root.querySelector<HTMLButtonElement>(`[data-k="${k}"]`)!.click());
    await act(() => root.querySelector<HTMLButtonElement>('[data-k="enter"]')!.click());
    expect(marks(0)![0]).toBe('hit');
  });

  it('says "Not in the word list" for a made-up word, outlines the row for 1.2 s, and spends no guess', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    await guess('zzzzz');
    expect(root.querySelector('.w-msg')!.textContent).toBe('Not in the word list.');
    expect(root.querySelector('.is-bad')).not.toBeNull();
    expect(rows()[0]!.textContent).toBe('zzzzz');
    await act(() => void vi.advanceTimersByTime(1250));
    expect(root.querySelector('.is-bad')).toBeNull();
    expect((await saved()).game!.guesses).toEqual([]);
  });

  it('asks for five letters', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    await guess('cra');
    expect(root.querySelector('.w-msg')!.textContent).toBe('Five letters, please.');
  });

  it('a win adds to the streak and the next word comes by itself when there is time', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await seed(rec({ streak: 2, game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start(120);
    await guess('cedar');
    expect(root.querySelector('.w-msg')!.textContent).toBe('Got it in 1. Streak 3 this episode.');
    expect((await saved()).streak).toBe(3);
    await act(() => void vi.advanceTimersByTime(NEXT_WORD_AFTER_MS + 10));
    expect(marks(0)).toEqual([null, null, null, null, null]);
    expect((await saved()).game!.guesses).toEqual([]);
  });

  it('a loss on the sixth guess says the word and resets the streak', async () => {
    await seed(rec({ streak: 4, game: { answer: 'cedar', guesses: ['crane', 'crane', 'crane', 'crane', 'crane'], typing: '', done: false } }));
    await mount();
    await start();
    await guess('crane');
    expect(root.querySelector('.w-msg')!.textContent).toBe('It was CEDAR. Streak back to 0.');
    expect((await saved()).streak).toBe(0);
  });

  it('when the break is nearly over the next word waits for the next break', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start(20);
    await guess('cedar');
    await act(() => void vi.advanceTimersByTime(NEXT_WORD_AFTER_MS + 10));
    expect(root.querySelector('.w-msg')!.textContent).toContain('waits for the next break');
    expect(marks(0)![0]).toBe('hit');
    await act(() => control!.stop());
    await start(60);
    expect(marks(0)).toEqual([null, null, null, null, null]);
  });

  it('pauses mid-game when the break ends and picks up at the next one, with what was typed', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    await start();
    await guess('crane');
    await type('ce');
    await act(() => control!.stop());
    const s = await saved();
    expect(s.game).toMatchObject({ answer: 'cedar', guesses: ['crane'], typing: 'ce', done: false });
    // A fresh mount, as in the next break.
    render(null, root);
    await mount();
    await start();
    expect(marks(0)![0]).toBe('hit');
    expect(rows()[1]!.textContent).toBe('ce');
    expect(root.querySelector('.w-msg')!.textContent).toBe('Picked up where you left off.');
  });

  it('keys do nothing while the show is not on screen', async () => {
    await seed(rec({ game: { answer: 'cedar', guesses: [], typing: '', done: false } }));
    await mount();
    expect(control!.key!(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });

  it('starts a first game with nothing saved, and a damaged record reads as a fresh start', async () => {
    await fakeBrowser.storage.local.set({ [STORAGE_KEY]: { game: { answer: 'no', guesses: 7 }, streak: 'x' } });
    await mount();
    await start();
    expect(rows()).toHaveLength(6);
    expect((await saved()).game!.answer).toMatch(/^[a-z]{5}$/);
  });
});

describe('the streak and the answers', () => {
  it('the streak lasts an episode, then starts again', async () => {
    await seed(rec({ streak: 5, lastPlayed: 1000 }));
    expect((await load(1000 + EPISODE_MS - 1)).streak).toBe(5);
    expect((await load(1000 + EPISODE_MS + 1)).streak).toBe(0);
  });
  it('does not draw a recent answer again', () => {
    const recent = ANSWERS.slice(0, ANSWERS.length - 1);
    expect(pickAnswer(ANSWERS, recent, () => 0)).toBe(ANSWERS[ANSWERS.length - 1]);
    expect(pickAnswer(ANSWERS, ANSWERS, () => 0)).toBe(ANSWERS[0]);
  });
});
