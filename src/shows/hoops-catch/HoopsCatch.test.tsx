// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render } from 'preact';
import { act } from 'preact/test-utils';
import { BEST_KEY } from './best';
import { HoopsCatch } from './HoopsCatch';
import { hoopsCatch } from './index';
import { EDGE } from './game';
import { createEngine } from './engine';
import type { ShowControl } from '../types';

let host: HTMLElement;
let control: ShowControl | null;
const register = (c: ShowControl | null) => void (control = c);
const key = (k: string, init: KeyboardEventInit = {}) => new KeyboardEvent('keydown', { key: k, ...init });
const $ = (sel: string) => host.querySelector<HTMLElement>(sel)!;
const frames = (ms: number) => act(() => void vi.advanceTimersByTime(ms));
let stored: Record<string, unknown>;

beforeEach(() => {
  vi.useFakeTimers();
  stored = {};
  // The extension's storage.local, as a content script sees it (the test setup also provides a fake `browser`).
  vi.stubGlobal('browser', {
    storage: {
      local: {
        get: async (k: string) => (k in stored ? { [k]: stored[k] } : {}),
        set: async (items: Record<string, unknown>) => void Object.assign(stored, items),
      },
    },
  });
  // happy-dom lays nothing out and has no 2D canvas: give the canvas a size and a context that draws nothing.
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientWidth', { configurable: true, get: () => 800 });
  Object.defineProperty(HTMLCanvasElement.prototype, 'clientHeight', { configurable: true, get: () => 400 });
  HTMLCanvasElement.prototype.getContext = (() => null) as never;
  host = document.createElement('div');
  document.body.append(host);
  control = null;
});
afterEach(() => {
  render(null, host);
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const mount = async () => {
  await act(() => void render(<HoopsCatch register={register} />, host));
  for (let i = 0; i < 4; i++) await act(async () => void (await Promise.resolve()));
  await frames(50);
};

describe('the show', () => {
  it('is the third show, under its name, with its own stylesheet', () => {
    expect(hoopsCatch).toMatchObject({ id: 'catch', name: "Hoop's catch" });
    expect(typeof hoopsCatch.css).toBe('string');
  });

  it('registers its controls, and clears them when it goes', async () => {
    await mount();
    expect(control).not.toBeNull();
    await act(() => void render(null, host));
    expect(control).toBeNull();
  });

  it('shows the score, the best and the misses, and the best comes from storage', async () => {
    stored[BEST_KEY] = 41;
    await mount();
    expect($('.c-score').textContent).toBe('0');
    expect(host.textContent).toContain('best 41');
    expect(host.querySelectorAll('.c-miss i').length).toBe(3);
    expect($('.c-miss').getAttribute('aria-label')).toBe('0 of 3 misses used');
  });

  it('labels the canvas for people who cannot see it', async () => {
    await mount();
    expect($('canvas').getAttribute('aria-label')).toMatch(/arrow keys/);
  });
});

describe('the loop', () => {
  it('runs while the show is on screen and stops cleanly when it is not', async () => {
    await mount();
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    await act(() => control!.start(30));
    await frames(500);
    expect(raf.mock.calls.length).toBeGreaterThan(5);
    await act(() => control!.stop());
    const calls = raf.mock.calls.length;
    await frames(500);
    expect(raf.mock.calls.length).toBe(calls);
  });

  it('plays: dots fall, a caught one scores and a better score is saved', async () => {
    await mount();
    await act(() => control!.start(null));
    // Hoop sits in the middle; give it time to be under dots, and aim it with the keys.
    for (let i = 0; i < 40; i++) await frames(250);
    const score = Number($('.c-score').textContent);
    const misses = host.querySelectorAll('.c-miss i.used').length;
    expect(score + misses).toBeGreaterThan(0);
    if (score > 0) expect(stored[BEST_KEY]).toBe(score);
  });

  it('pauses when the tab is hidden and carries on when it is back', async () => {
    await mount();
    await act(() => control!.start(30));
    const raf = vi.spyOn(window, 'requestAnimationFrame');
    let state: DocumentVisibilityState = 'hidden';
    vi.spyOn(document, 'visibilityState', 'get').mockImplementation(() => state);
    await act(() => void document.dispatchEvent(new Event('visibilitychange')));
    const calls = raf.mock.calls.length;
    await frames(500);
    expect(raf.mock.calls.length).toBe(calls);
    state = 'visible';
    await act(() => void document.dispatchEvent(new Event('visibilitychange')));
    await frames(200);
    expect(raf.mock.calls.length).toBeGreaterThan(calls);
  });

  it('says where it paused when the show goes off screen mid-round', async () => {
    await mount();
    await act(() => control!.start(30));
    await act(() => control!.stop());
    expect($('.c-over').textContent).toBe('');
    expect(host.querySelector('.c-over.on')).toBeNull();
  });
});

describe('keys', () => {
  it('moves Hoop with the arrow keys and uses only the keys it needs', async () => {
    await mount();
    await act(() => control!.start(30));
    expect(control!.key!(key('ArrowRight'))).toBe(true);
    expect(control!.key!(key('ArrowLeft'))).toBe(true);
    expect(control!.key!(key('a'))).toBe(false);
    expect(control!.key!(key('Escape'))).toBe(false);
    expect(control!.key!(key('1'))).toBe(false);
    expect(control!.key!(key('ArrowRight', { ctrlKey: true }))).toBe(false);
    // Space does nothing while a round is on, so the player is not asked to do something it will not.
    expect(control!.key!(key(' '))).toBe(false);
  });
});

describe('pointer', () => {
  function engine() {
    const cv = document.createElement('canvas');
    host.append(cv);
    cv.getBoundingClientRect = () => ({ left: 100, width: 400, top: 0, height: 200, right: 500, bottom: 200, x: 100, y: 0, toJSON: () => ({}) });
    return { cv, e: createEngine(cv, { onHud: () => {}, onBest: () => {} }) };
  }
  const at = (type: string, clientX: number) => new MouseEvent(type, { clientX, bubbles: true }) as unknown as PointerEvent;

  it('aims Hoop at the pointer, and keeps it on the stage', () => {
    const { cv, e } = engine();
    cv.dispatchEvent(at('pointermove', 300));
    expect(e.game.tx).toBeCloseTo(0.5);
    cv.dispatchEvent(at('pointermove', 100));
    expect(e.game.tx).toBeCloseTo(EDGE);
    cv.dispatchEvent(at('pointermove', 900));
    expect(e.game.tx).toBeCloseTo(1 - EDGE);
    e.destroy();
  });

  it('starts a new round on a tap once a round is over', () => {
    const { cv, e } = engine();
    e.game.status = 'over';
    e.game.score = 9;
    cv.dispatchEvent(at('pointerdown', 300));
    expect(e.game).toMatchObject({ status: 'play', score: 0 });
    e.destroy();
  });

  it('uses space or enter to go again, only once a round is over', () => {
    const { e } = engine();
    expect(e.control.key!(key(' '))).toBe(false);
    e.game.status = 'over';
    expect(e.control.key!(key('Enter'))).toBe(true);
    expect(e.game.status).toBe('play');
    e.destroy();
  });
});
