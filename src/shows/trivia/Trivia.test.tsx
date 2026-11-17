// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import type { ShowControl } from '../types';
import { shows } from '..';
import { Trivia } from './Trivia';
import { NEXT_MS } from './pick';
import { SEEN_KEY, loadSeen } from './seen';

let root: HTMLElement;
let control: ShowControl | null = null;
const register = (c: ShowControl | null) => void (control = c);
const $ = (sel: string) => root.querySelector<HTMLElement>(sel);
const $$ = (sel: string) => [...root.querySelectorAll<HTMLElement>(sel)];
const flush = () => act(async () => void (await Promise.resolve()));
const startShow = async (n: number | null) => {
  await act(() => void render(<Trivia register={register} />, root));
  await act(() => void control!.start(n));
  await flush();
};
const press = (key: string, extra: KeyboardEventInit = {}) => {
  let used = false;
  act(() => void (used = control!.key!(new KeyboardEvent('keydown', { key, ...extra }))));
  return used;
};
const wait = (ms: number) => act(() => void vi.advanceTimersByTime(ms));

beforeEach(() => {
  vi.useFakeTimers();
  root = document.createElement('div');
  document.body.append(root);
});
afterEach(() => {
  render(null, root);
  root.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('its stylesheet', () => {
  const css = readFileSync('src/shows/trivia/trivia.css', 'utf8');
  it('takes colour, type and motion from the tokens, with no raw colours or timings', () => {
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    expect(css).not.toMatch(/transition:\s*all/);
    expect(css).not.toMatch(/\b\d+m?s\b/);
  });
});

describe('Quick trivia', () => {
  it('is the second show, named the same everywhere', () => {
    expect(shows.map((s) => s.id)).toEqual(['words', 'trivia', 'catch', 'look']);
    expect(shows[1]).toMatchObject({ name: 'Quick trivia', line: 'Three questions' });
    expect(typeof shows[1]!.css).toBe('string');
  });

  it('asks a question with four answers lettered A to D, in words, with the credit', async () => {
    await startShow(102);
    expect($('.t-n')!.textContent).toBe('Question 1 of 3');
    expect($('.t-q')!.textContent!.length).toBeGreaterThan(10);
    const answers = $$('.hs-answer');
    expect(answers).toHaveLength(4);
    expect(answers.map((a) => a.querySelector('.k')!.textContent)).toEqual(['A', 'B', 'C', 'D']);
    for (const a of answers) expect(a.textContent!.replace(/^[A-D]/, '').length).toBeGreaterThan(0);
    expect($('.t-c')!.textContent).toBe('Questions from Open Trivia Database, CC BY-SA 4.0');
  });

  it('answers by key, marks right or wrong in words, then moves on after the pause', async () => {
    await startShow(102);
    expect(press('b')).toBe(true);
    const marked = $$('.hs-answer').filter((a) => a.dataset.s);
    expect(marked.length === 1 || marked.length === 2).toBe(true);
    expect($$('.hs-answer').filter((a) => a.dataset.s === 'right')).toHaveLength(1);
    expect($$('.t-say').map((s) => s.textContent).join('')).toMatch(/^(Right|Not this one)$/);
    expect(press('c')).toBe(true); // a second answer to the same question is swallowed, not counted
    await wait(NEXT_MS);
    expect($('.t-n')!.textContent).toBe('Question 2 of 3');
    expect($$('.hs-answer').every((a) => !a.dataset.s)).toBe(true);
  });

  it('answers by click, and ends after three with the score', async () => {
    await startShow(102);
    for (let i = 0; i < 3; i++) {
      await act(() => void $$('.hs-answer')[0]!.click());
      await wait(NEXT_MS);
    }
    expect($('.t-n')!.textContent).toBe('Done');
    expect($('.t-q')!.textContent).toMatch(/^\d of 3 right\. Three more next break\.$/);
  });

  it('uses A to D only, and leaves other keys and shortcuts alone', async () => {
    await startShow(102);
    expect(press('e')).toBe(false);
    expect(press('1')).toBe(false);
    expect(press('Enter')).toBe(false);
    expect(press('a', { ctrlKey: true })).toBe(false);
    expect($$('.hs-answer').every((a) => !a.dataset.s)).toBe(true);
    expect(press('D')).toBe(true);
  });

  it('fits a short break: two questions in 30 s, one in 15 s', async () => {
    await startShow(30);
    expect($('.t-n')!.textContent).toBe('Question 1 of 2');
    render(null, root);
    await startShow(15);
    expect($('.t-n')!.textContent).toBe('Question 1 of 1');
    press('a');
    await wait(NEXT_MS);
    expect($('.t-q')!.textContent).toMatch(/of 1 right/);
  });

  it('stops asking when the break runs low, and ends tidily', async () => {
    await startShow(40);
    press('a');
    await wait(NEXT_MS);
    expect($('.t-n')!.textContent).toBe('Question 2 of 3');
    await wait(30_000);
    press('a');
    await wait(NEXT_MS);
    expect($('.t-n')!.textContent).toBe('Done');
    expect($('.t-q')!.textContent).toMatch(/^\d of 2 right/);
  });

  it('stop() clears its timer, and a later start carries on at the same question', async () => {
    await startShow(102);
    const first = $('.t-q')!.textContent;
    press('a');
    act(() => control!.stop());
    await wait(NEXT_MS * 3);
    expect($('.t-n')!.textContent).toBe('Question 1 of 3');
    await act(() => void control!.start(60));
    await wait(NEXT_MS);
    expect($('.t-n')!.textContent).toBe('Question 2 of 3');
    expect($('.t-q')!.textContent).not.toBe(first);
  });

  it('remembers what it has asked, and the next break asks different ones', async () => {
    const store: Record<string, unknown> = {};
    vi.stubGlobal('browser', {
      storage: {
        local: {
          get: async (k: string) => ({ [k]: store[k] }),
          set: async (v: Record<string, unknown>) => void Object.assign(store, v),
        },
      },
    });
    await startShow(102);
    const firstQuestion = $('.t-q')!.textContent;
    for (let i = 0; i < 3; i++) {
      press('a');
      await wait(NEXT_MS);
      await flush();
    }
    expect((store[SEEN_KEY] as string[]).length).toBe(3);
    expect(await loadSeen()).toEqual(store[SEEN_KEY]);
    render(null, root);
    await startShow(102);
    expect((store[SEEN_KEY] as string[]).length).toBe(4);
    expect(new Set(store[SEEN_KEY] as string[]).size).toBe(4);
    expect($('.t-q')!.textContent).not.toBe(firstQuestion);
  });

  it('unmounting clears the controls and the timer', async () => {
    await startShow(102);
    press('a');
    await act(() => void render(null, root));
    expect(control).toBeNull();
    await wait(NEXT_MS * 2);
  });
});
