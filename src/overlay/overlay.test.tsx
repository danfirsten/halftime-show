// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { useEffect } from 'preact/hooks';
import { act } from 'preact/test-utils';
import { mountOverlay, HOST_ID, HOST_TAG, type OverlayHandle } from './index';
import { placeholderShows } from '../shows/placeholder';
import type { Show, ShowControl, ShowId, ShowProps } from '../shows/types';
import { NOTE_FADE_MS, NOTE_HOLD_MS } from './Overlay';
import { hostTokens } from './styles';

let player: HTMLElement;
let video: HTMLVideoElement;
let overlay: OverlayHandle | null = null;

beforeEach(() => {
  document.body.innerHTML = '<div id="player"><video></video></div><button id="outside">Play</button>';
  player = document.getElementById('player')!;
  video = player.querySelector('video')!;
});
afterEach(() => {
  overlay?.destroy();
  overlay = null;
  vi.useRealTimers();
});

const $ = <T extends Element = HTMLElement>(sel: string) => overlay!.host.shadowRoot!.querySelector<T>(sel);
const $$ = (sel: string) => [...overlay!.host.shadowRoot!.querySelectorAll<HTMLElement>(sel)];
// Preact renders and runs effects asynchronously; act() flushes them, so each step is seen as a person would see it.
const run = (fn: () => void) => act(fn);
const mount = (opts?: Parameters<typeof mountOverlay>[1]) => run(() => void (overlay = mountOverlay(video, opts)));
const open = (n: number | null) => run(() => overlay!.open(n));
const update = (n: number | null) => run(() => overlay!.update(n));
const close = () => run(() => overlay!.close());
const tick = (ms: number) => run(() => void vi.advanceTimersByTime(ms));
const click = (sel: string) => run(() => $<HTMLButtonElement>(sel)!.click());
const key = (k: string, target: EventTarget = document.body) => {
  const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, composed: true });
  run(() => void target.dispatchEvent(e));
  return e;
};
const endClose = () => run(() => void $('.hs')!.dispatchEvent(new AnimationEvent('animationend', { animationName: 'hs-clip-close', bubbles: true })));

/** Shows that record what the overlay asked of them. */
function spyShows(log: string[]): Show[] {
  return placeholderShows.map((s) => {
    function Spy({ register }: ShowProps) {
      useEffect(() => {
        const c: ShowControl = {
          start: (n) => log.push(`${s.id} start ${n}`),
          stop: () => log.push(`${s.id} stop`),
          key: (e) => {
            if (s.id !== 'trivia' || e.key !== '2') return false;
            log.push('trivia key 2');
            return true;
          },
        };
        register(c);
        return () => register(null);
      }, [register]);
      return <p class="spy">{s.name}</p>;
    }
    return { ...s, Component: Spy };
  });
}

describe('the host', () => {
  it('is one Shadow DOM host beside the video, and adds nothing else to the page', () => {
    const before = document.documentElement.outerHTML;
    mount();
    const host = document.getElementById(HOST_ID)!;
    expect(host.tagName.toLowerCase()).toBe(HOST_TAG);
    expect(host.parentElement).toBe(player);
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot!.querySelectorAll('style').length).toBe(1);
    // Remove the host and the page is exactly as it was: no styles, no attributes, nothing in <head>.
    expect(document.documentElement.outerHTML.replace(host.outerHTML, '')).toBe(before);
    expect(document.querySelectorAll('style, link').length).toBe(0);
  });

  it('pins its own box with inline !important styles so page CSS cannot move or hide it', () => {
    mount();
    const s = overlay!.host.style;
    for (const p of ['position', 'display', 'z-index', 'pointer-events']) expect(s.getPropertyPriority(p)).toBe('important');
    expect(s.getPropertyValue('position')).toBe('absolute');
  });

  it('mounts inside the full-screen element when it holds the video, and moves back when full screen ends', () => {
    const wrap = document.createElement('div');
    document.body.append(wrap);
    wrap.append(player);
    mount();
    expect(overlay!.host.parentElement).toBe(player);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => wrap });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(overlay!.host.parentElement).toBe(wrap);
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
    document.dispatchEvent(new Event('fullscreenchange'));
    expect(overlay!.host.parentElement).toBe(player);
  });

  it('destroy takes it off the page', () => {
    mount();
    overlay!.destroy();
    expect(document.getElementById(HOST_ID)).toBeNull();
    overlay = null;
  });
});

describe('open, update and close', () => {
  it('opens ink, with the clip, the edge clock full and the time in the scoreboard', () => {
    mount({ dodged: { today: 870, week: 6730 } });
    expect($('.hs')).toBeNull();
    open(102);
    expect($('.hs-root')!.classList.contains('dark')).toBe(true);
    expect($('.hs')!.classList.contains('is-open')).toBe(true);
    expect($('.hs-t')!.textContent).toBe('1:42');
    expect($('.hs-tl')!.textContent).toBe('left in this break');
    expect($$('.hs-d').map((d) => d.textContent)).toEqual(['Dodged today 14:30', 'This week 1:52:10']);
    const edge = $('.hs-edge')!;
    expect(edge.getAttribute('role')).toBe('progressbar');
    expect(edge.getAttribute('aria-valuenow')).toBe('102');
    expect(edge.getAttribute('aria-valuemax')).toBe('102');
    expect($('.e-run')!.style.strokeDashoffset).toBe('0');
  });

  it('drains the edge clockwise as the break runs, and writes the time left', () => {
    mount();
    open(100);
    update(75);
    expect($('.e-run')!.style.strokeDashoffset).toBe('-250');
    expect($('.hs-t')!.textContent).toBe('1:15');
    expect($('.hs-edge')!.getAttribute('aria-valuenow')).toBe('75');
    update(0);
    expect($('.e-run')!.style.strokeDashoffset).toBe('-1000');
  });

  it('draws a dotted edge that does not drain, and reads "Ad break", when the length is unknown', () => {
    mount();
    open(null);
    expect($('.e-dots')).not.toBeNull();
    expect($('.e-run')).toBeNull();
    expect($('.hs-t')!.textContent).toBe('Ad break');
    expect($('.hs-tl')).toBeNull();
    expect($('.hs-edge')!.hasAttribute('aria-valuenow')).toBe(false);
    expect($('.m-head')!.textContent).toBe('Ad break. Pick a halftime show.');
    // A length that turns up later starts the drain from there.
    update(40);
    expect($('.e-run')).not.toBeNull();
    expect($('.hs-t')!.textContent).toBe('0:40');
  });

  it('closes with the clip, then shows the back note for 4 s', () => {
    vi.useFakeTimers();
    mount();
    open(30);
    tick(12000);
    close();
    expect($('.hs')!.classList.contains('is-closing')).toBe(true);
    expect($('.hs-back')).toBeNull();
    endClose();
    expect($('.hs')).toBeNull();
    const note = $('.hs-back')!;
    expect(note.textContent).toBe('Back. Sound on.0:12 of ads dodged.');
    expect(note.parentElement!.getAttribute('role')).toBe('status');
    tick(20);
    expect($('.hs-back')!.classList.contains('on')).toBe(true);
    tick(NOTE_FADE_MS + NOTE_HOLD_MS);
    expect($('.hs-back')!.classList.contains('on')).toBe(false);
    tick(NOTE_FADE_MS);
    expect($('.hs-back')).toBeNull();
  });

  it('after Not an ad, the note says so and claims no ad time dodged', () => {
    vi.useFakeTimers();
    mount();
    open(30);
    tick(9000);
    click('.hs-notad');
    endClose();
    expect($('.hs-back')!.textContent).toBe('Marked as not an ad. Sound on.');
  });

  it('never says "Sound on." for a tab the viewer had muted', () => {
    mount();
    open(30);
    run(() => overlay!.close({ soundOn: false }));
    endClose();
    expect($('.hs-back b')!.textContent).toBe('Back. The tab stays muted, as you had it.');
    open(30);
    run(() => overlay!.close({ notAd: true, soundOn: false }));
    endClose();
    expect($('.hs-back')!.textContent).toBe('Marked as not an ad.');
  });

  it('leaves out the dodged line when no ad time passed', () => {
    mount();
    open(30);
    close();
    endClose();
    expect($('.hs-back')!.textContent).toBe('Back. Sound on.');
  });

  it('finishes closing even if the animation never ends (a hidden tab)', () => {
    vi.useFakeTimers();
    mount();
    open(30);
    close();
    tick(6000);
    expect($('.hs')).toBeNull();
  });

  it('ignores close when shut and open twice, and opens fresh for the next break', () => {
    mount({ lastShow: 'words' });
    close();
    open(60);
    open(50);
    expect($('.hs-t')!.textContent).toBe('0:50');
    close();
    endClose();
    open(20);
    expect($('.hs')!.classList.contains('is-open')).toBe(true);
    expect($('.hs-back')).toBeNull();
    expect($('[data-pane="menu"]')).not.toBeNull();
  });
});

describe('the menu and the shows', () => {
  it('lists the four shows with keys 1 to 4 and the first-break line before any pick', () => {
    mount();
    open(102);
    expect($$('.m-row').map((b) => b.dataset.show)).toEqual(['words', 'trivia', 'catch', 'look']);
    expect($$('.m-row .k').map((k) => k.textContent)).toEqual(['1', '2', '3', '4']);
    expect($$('.m-row .n').map((k) => k.textContent)).toEqual(['Five letters', 'Quick trivia', "Hoop's catch", 'Something to look at']);
    expect($('.m-head')!.textContent).toBe('Ad break. 1:42 left. Pick a halftime show.');
    expect($('.m-first')!.textContent).toBe('First break. The tab is muted and the ad is underneath. Pick something for the next 1:42.');
  });

  it('defaults to the last show used and starts it after counting down from 3', () => {
    vi.useFakeTimers();
    const log: string[] = [];
    const picks: ShowId[] = [];
    mount({ lastShow: 'catch', shows: spyShows(log), onPick: (s) => picks.push(s) });
    open(90);
    expect($('.m-first')).toBeNull();
    expect($('.m-row.is-default')!.dataset.show).toBe('catch');
    expect($('.m-row.is-default .d')!.textContent).toBe('Last time, starts in 3');
    tick(1000);
    expect($('.m-row.is-default .d')!.textContent).toBe('Last time, starts in 2');
    update(88);
    tick(1000);
    tick(1000);
    expect($('[data-pane="catch"] .spy')!.textContent).toBe("Hoop's catch");
    expect(picks).toEqual(['catch']);
    expect(log).toEqual(['catch start 88']);
  });

  it('waits on the first break: no countdown before any show has been picked', () => {
    vi.useFakeTimers();
    mount();
    open(90);
    tick(10000);
    expect($('[data-pane="menu"]')).not.toBeNull();
  });

  it('picks with 1 to 4 or a click, stops the old show and starts the new one in the slot', () => {
    const log: string[] = [];
    const picks: ShowId[] = [];
    mount({ shows: spyShows(log), onPick: (s) => picks.push(s) });
    open(60);
    expect(key('1').defaultPrevented).toBe(true);
    expect($('.hs-tabs [aria-selected="true"]')!.dataset.show).toBe('words');
    update(50);
    click('.hs-tabs [data-show="look"]');
    expect($('[data-pane="look"]')).not.toBeNull();
    key('2');
    expect(log).toEqual(['words start 60', 'words stop', 'look start 50', 'look stop', 'trivia start 50']);
    expect(picks).toEqual(['words', 'look', 'trivia']);
  });

  it('gives a running show each key first, so a show can use the number keys itself', () => {
    const log: string[] = [];
    mount({ shows: spyShows(log), lastShow: 'trivia' });
    open(60);
    key('2');
    key('2');
    expect(log).toEqual(['trivia start 60', 'trivia key 2']);
  });

  it('stops the running show before the first frame of the close', () => {
    const log: string[] = [];
    mount({ shows: spyShows(log) });
    open(60);
    key('4');
    close();
    expect(log).toEqual(['look start 60', 'look stop']);
  });

  it('places a placeholder show in the slot until the real ones land', () => {
    mount({ shows: placeholderShows });
    open(60);
    key('2');
    expect($('.ph-name')!.textContent).toBe('Quick trivia');
    expect($('.ph')!.dataset.running).toBe('true');
  });
});

describe('keys and focus', () => {
  it('stops keys reaching the player while open, never takes Esc, and lets them through again after', () => {
    const seen: string[] = [];
    document.addEventListener('keydown', (e) => seen.push(e.key));
    player.addEventListener('keydown', (e) => seen.push(`player ${e.key}`));
    mount();
    open(60);
    key(' ', player);
    key('k');
    key('ArrowRight', $('.hs')!);
    key('Escape');
    expect(seen).toEqual(['Escape']);
    close();
    key('k');
    expect(seen).toEqual(['Escape', 'k']);
  });

  it('keeps pointer events inside the overlay, so a click on it never reaches the player', () => {
    const clicks: string[] = [];
    player.addEventListener('click', () => clicks.push('player'));
    mount();
    open(60);
    click('.m-row');
    expect(clicks).toEqual([]);
  });

  it('takes focus on open and gives it back on close', () => {
    const outside = document.getElementById('outside')!;
    outside.focus();
    mount();
    open(60);
    expect(overlay!.host.shadowRoot!.activeElement).toBe($('.hs'));
    close();
    expect(document.activeElement).toBe(outside);
  });

  it('calls onNotAd from the Not an ad button, and closes by itself without one', () => {
    let notAd = 0;
    mount({ onNotAd: () => notAd++ });
    open(60);
    click('.hs-notad');
    expect(notAd).toBe(1);
    overlay!.destroy();
    mount();
    open(60);
    click('.hs-notad');
    expect($('.hs')!.classList.contains('is-closing')).toBe(true);
  });
});

describe('copy and styles', () => {
  it('reads the system tokens onto the shadow host, so nothing is set on the page root', () => {
    const t = hostTokens(readFileSync('src/styles/tokens.css', 'utf8'));
    expect(t).not.toMatch(/:root/);
    expect(t).toMatch(/:host \{/);
    expect(t).toMatch(/\.dark \{|\.dark,|\n\.dark/);
  });

  const files = ['src/overlay/overlay.css', 'src/overlay/tokens.css', 'src/shows/placeholder/placeholder.css'];
  for (const f of files) {
    it(`${f} names no colour and never transitions all`, () => {
      const css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(css).not.toMatch(/\brgba?\(|\bhsla?\(/);
      expect(css).not.toMatch(/:\s*(white|black|red|blue|green|gray|grey)\b/);
      expect(css).not.toMatch(/transition:\s*all/);
    });
  }

  it('uses the motion of the moment from docs/design.md', () => {
    const t = readFileSync('src/overlay/tokens.css', 'utf8');
    expect(t).toMatch(/--dur-open: 700ms/);
    expect(t).toMatch(/--dur-settle: 900ms/);
    expect(t).toMatch(/--dur-close: 480ms/);
    expect(t).toMatch(/--dur-hold: 4s/);
    expect(t).toMatch(/--clip-from: inset\(15% round 32px\)/);
    expect(t).toMatch(/--settle-from: scale\(1\.08\)/);
    const css = readFileSync('src/overlay/overlay.css', 'utf8');
    expect(css).toMatch(/\.hs\.is-open \{ animation: hs-clip-open var\(--dur-open\) var\(--ease-inout\)/);
    // Reduced motion: a 150 ms fade, no clip and no settle.
    const reduced = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reduced).toMatch(/\.hs\.is-open \{ animation: hs-fade-in var\(--dur-reduced\)/);
    expect(reduced).toMatch(/\.hs\.is-open \.hs-in \{ animation: none; \}/);
    expect(reduced).toMatch(/\.hs\.is-closing \{ animation: hs-fade-out var\(--dur-reduced\)/);
  });

  it('writes plain British copy with no em dashes and no mention of the site', () => {
    mount({ lastShow: 'words' });
    open(60);
    const text = overlay!.host.shadowRoot!.textContent!;
    expect(text).not.toMatch(/—/);
    expect(text).not.toMatch(/hulu/i);
    const sources = ['src/overlay/Overlay.tsx', 'src/shows/placeholder/index.tsx'].map((f) => readFileSync(f, 'utf8')).join('\n');
    expect(sources).not.toMatch(/—/);
  });
});
