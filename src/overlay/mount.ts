import { h, render } from 'preact';
import type { Show, ShowId } from '../shows/types';
import { placeholderShows } from '../shows/placeholder';
import { OverlayView, type OverlayActions, type OverlayState } from './Overlay';
import { edgeStep } from './edge';
import { registerFonts } from './fonts';
import { coverBox, mountParent } from './placement';
import { overlayCss } from './styles';

export interface OverlayOptions {
  /** A show was picked, by key, by click or by the menu's countdown. #wire saves it as the last show used. */
  onPick?(show: ShowId): void;
  /** "Not an ad" was pressed. Without a handler the overlay just closes. */
  onNotAd?(): void;
  /** The last show used: the menu counts down and starts it. Leave it out before the first break ever. */
  lastShow?: ShowId | null;
  /** Ad time dodged so far, in seconds, for the scoreboard. Never blank: 0:00 until there is some. */
  dodged?: { today: number; week: number };
  /** The four shows. Placeholders until each show lands. */
  shows?: Show[];
}

export interface OverlayHandle {
  /** The host element, `<halftime-show-root id="halftime-show-overlay">`. */
  readonly host: HTMLElement;
  /** A break has started. `seconds` is its length, or null when it isn't known. Opening twice only updates. */
  open(seconds: number | null): void;
  /** The time left in the break, or null if it is no longer known. */
  update(secondsLeft: number | null): void;
  /** The show is back: the clip closes, then the back note shows for 4 s. */
  close(): void;
  /** New scoreboard totals, in seconds. */
  setDodged(dodged: { today: number; week: number }): void;
  /** Takes the overlay off the page entirely. */
  destroy(): void;
}

export const HOST_TAG = 'halftime-show-root';
export const HOST_ID = 'halftime-show-overlay';

// The host's own box, set inline with !important so no page stylesheet can move, hide or restyle it.
const HOST_STYLE: [string, string][] = [
  ['all', 'initial'],
  ['position', 'absolute'],
  ['display', 'block'],
  ['margin', '0'],
  ['padding', '0'],
  ['border', '0'],
  ['transform', 'none'],
  ['z-index', '2147483647'],
  ['pointer-events', 'none'],
  ['overflow', 'hidden'],
];

// Pointer events from the overlay stop at its host, so a click on the menu never pauses or seeks the player below.
const CONTAINED = ['click', 'dblclick', 'auxclick', 'contextmenu', 'pointerdown', 'pointerup', 'pointermove', 'mousedown', 'mouseup', 'mousemove', 'touchstart', 'touchend', 'touchmove', 'wheel'];
const KEYS = ['keydown', 'keyup', 'keypress'];
const CLOSE_BACKSTOP_MS = 6000;

function deepActive(doc: Document): HTMLElement | null {
  let el: Element | null = doc.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el instanceof HTMLElement ? el : null;
}

/**
 * Mounts the halftime overlay over a video. The host is a Shadow DOM inside the full-screen element when there is one
 * (and moves when that changes), otherwise beside the video, and it covers the video's box exactly.
 */
export function mountOverlay(video: HTMLElement, options: OverlayOptions = {}): OverlayHandle {
  const doc = video.ownerDocument;
  const win = doc.defaultView ?? window;
  const shows = options.shows ?? placeholderShows;
  registerFonts(doc);

  const host = doc.createElement(HOST_TAG);
  host.id = HOST_ID;
  for (const [k, v] of HOST_STYLE) host.style.setProperty(k, v, 'important');
  const shadow = host.attachShadow({ mode: 'open' });
  const style = doc.createElement('style');
  style.textContent = overlayCss(shows);
  const root = doc.createElement('div');
  root.style.display = 'contents';
  shadow.append(style, root);
  for (const type of CONTAINED) host.addEventListener(type, (e) => e.stopPropagation());

  const reducedQuery = win.matchMedia?.('(prefers-reduced-motion: reduce)');
  let state: OverlayState = {
    phase: 'closed',
    openId: 0,
    total: null,
    left: null,
    edgeLeft: null,
    width: 0,
    height: 0,
    dodged: options.dodged ?? { today: 0, week: 0 },
    lastShow: options.lastShow ?? null,
    note: null,
  };
  let openedAt = 0;
  let returnFocus: HTMLElement | null = null;
  let destroyed = false;

  const actions: OverlayActions = {
    pick(id) {
      state = { ...state, lastShow: id };
      options.onPick?.(id);
    },
    notAd() {
      if (options.onNotAd) options.onNotAd();
      else handle.close();
    },
    closed() {
      if (state.phase !== 'closing') return;
      set({ phase: 'closed' });
    },
    noteDone() {
      set({ note: null });
    },
    keys: { current: null },
  };

  function paint() {
    if (!destroyed) render(h(OverlayView, { state, shows, actions }), root);
  }
  function set(patch: Partial<OverlayState>) {
    state = { ...state, ...patch };
    paint();
  }

  // Keys: while open, nothing reaches the player. Esc is never used and always passes, because it leaves full screen.
  function guard(e: Event) {
    const k = e as KeyboardEvent;
    if (k.key === 'Escape' || k.key === 'Esc') return;
    e.stopImmediatePropagation();
    if (e.type === 'keydown') actions.keys.current?.(k);
  }
  function guardOn() {
    for (const t of KEYS) win.addEventListener(t, guard, true);
  }
  function guardOff() {
    for (const t of KEYS) win.removeEventListener(t, guard, true);
  }

  function place() {
    if (destroyed) return;
    const parent = mountParent(video, doc.fullscreenElement);
    if (host.parentNode !== parent) {
      const hadFocus = shadow.activeElement !== null;
      parent.appendChild(host);
      if (hadFocus) focusCover();
    }
    const box = coverBox(video, host);
    host.style.setProperty('left', `${box.left}px`, 'important');
    host.style.setProperty('top', `${box.top}px`, 'important');
    host.style.setProperty('width', `${box.width}px`, 'important');
    host.style.setProperty('height', `${box.height}px`, 'important');
    if (box.width !== state.width || box.height !== state.height) set({ width: box.width, height: box.height });
  }
  function focusCover() {
    shadow.querySelector<HTMLElement>('.hs')?.focus({ preventScroll: true });
  }

  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(() => place()) : null;
  resize?.observe(video);
  const onFull = () => place();
  doc.addEventListener('fullscreenchange', onFull);
  doc.addEventListener('webkitfullscreenchange', onFull);
  win.addEventListener('resize', onFull);
  // A video can move without changing size (the page above it reflows); check its place while a break is on.
  let follow: ReturnType<typeof setInterval> | undefined;

  const handle: OverlayHandle = {
    host,
    open(seconds) {
      if (destroyed) return;
      if (state.phase === 'open') {
        handle.update(seconds);
        return;
      }
      const total = seconds === null || !Number.isFinite(seconds) ? null : Math.max(0, Math.round(seconds));
      const active = deepActive(doc);
      returnFocus = active && !host.contains(active) && active !== host ? active : null;
      openedAt = Date.now();
      guardOn();
      clearInterval(follow);
      follow = setInterval(place, 500);
      place();
      set({ phase: 'open', openId: state.openId + 1, total, left: total, edgeLeft: total, note: null });
      focusCover();
    },
    update(secondsLeft) {
      if (destroyed || state.phase !== 'open') return;
      if (secondsLeft === null || !Number.isFinite(secondsLeft)) {
        set({ total: null, left: null, edgeLeft: null });
        return;
      }
      const left = Math.max(0, Math.round(secondsLeft));
      const total = state.total === null || left > state.total ? left : state.total;
      const edgeLeft = state.total === null ? left : edgeStep(state.edgeLeft, left, !!reducedQuery?.matches);
      if (left === state.left && total === state.total && edgeLeft === state.edgeLeft) return;
      set({ total, left, edgeLeft });
    },
    close() {
      if (destroyed || state.phase !== 'open') return;
      guardOff();
      clearInterval(follow);
      const hadFocus = shadow.activeElement !== null;
      const seconds = Math.max(0, Math.round((Date.now() - openedAt) / 1000));
      set({ phase: 'closing', note: { id: state.openId, seconds } });
      // The clip's animationend ends the close; this is the backstop for a page that never runs it (a hidden tab).
      const id = state.openId;
      setTimeout(() => {
        if (state.phase === 'closing' && state.openId === id) actions.closed();
      }, CLOSE_BACKSTOP_MS);
      // Focus goes back to where it was before the break, so the player's own keys work again.
      if (hadFocus) {
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        else (shadow.activeElement as HTMLElement | null)?.blur();
      }
      returnFocus = null;
    },
    setDodged(dodged) {
      set({ dodged });
    },
    destroy() {
      if (destroyed) return;
      guardOff();
      clearInterval(follow);
      resize?.disconnect();
      doc.removeEventListener('fullscreenchange', onFull);
      doc.removeEventListener('webkitfullscreenchange', onFull);
      win.removeEventListener('resize', onFull);
      render(null, root);
      destroyed = true;
      host.remove();
    },
  };

  place();
  paint();
  return handle;
}
