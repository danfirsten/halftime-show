import { initialState, step, type DetectorState, type Reading, type Verdict } from './score';
import { findVideo, readSnapshot, type ReadMemory } from './read';
import type { SiteProfile } from '../sites/types';

export interface BreakEvent {
  type: 'break:start' | 'break:end';
  /** At the start, the break's time left when the page shows it; null when it doesn't, and always at the end. */
  secondsLeft: number | null;
  confidence: number;
  at: number;
}

/** What the detector saw last, for a debug panel or a test. */
export interface DetectorDebug {
  verdict: Verdict;
  readings: Reading[];
  history: BreakEvent[];
}

export interface Detector {
  verdict(): Verdict;
  /** The debug hook: the last verdict, the signals behind it and the last few events. */
  debug(): DetectorDebug;
  stop(): void;
}

export interface ObserveOptions {
  /** Mutations are gathered for this long before the page is read. */
  debounceMs?: number;
  /** While a change is pending or the video is stalled, the page is read again this often. */
  tickMs?: number;
  now?: () => number;
}

const VIDEO_EVENTS = ['loadstart', 'loadedmetadata', 'durationchange', 'emptied', 'playing', 'waiting', 'stalled', 'pause', 'ended'];
const HISTORY = 20;

/**
 * Watches a page for ad breaks: a debounced MutationObserver plus the video's own events feed the scorer, and
 * `onEvent` hears `break:start` and `break:end`. Reads only; never touches the video or the page.
 */
export function observe(doc: Document, site: SiteProfile, onEvent: (event: BreakEvent) => void, options: ObserveOptions = {}): Detector {
  const debounceMs = options.debounceMs ?? 50;
  const tickMs = options.tickMs ?? 100;
  const now = options.now ?? (() => performance.now());
  const view = doc.defaultView ?? globalThis;

  let state: DetectorState = initialState();
  let verdict: Verdict = { inBreak: false, confidence: 0, secondsLeft: null };
  let readings: Reading[] = [];
  const history: BreakEvent[] = [];
  const memory: ReadMemory = { longestDuration: 0 };
  const watched: HTMLVideoElement[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let stopped = false;

  function schedule(delay: number) {
    if (timer !== null || stopped) return;
    timer = view.setTimeout(() => {
      timer = null;
      evaluate();
    }, delay);
  }

  function watchVideo() {
    const video = findVideo(doc, site);
    if (!video || watched.includes(video)) return;
    watched.push(video);
    for (const type of VIDEO_EVENTS) video.addEventListener(type, onVideoEvent);
  }

  function onVideoEvent() {
    schedule(0);
  }

  function evaluate() {
    if (stopped) return;
    watchVideo();
    const snap = readSnapshot(doc, site, now(), memory);
    const result = step(state, snap, site.tuning);
    state = result.state;
    verdict = result.verdict;
    readings = snap.readings;
    if (result.change) {
      const event: BreakEvent = {
        type: result.change === 'start' ? 'break:start' : 'break:end',
        secondsLeft: result.change === 'start' ? verdict.secondsLeft : null,
        confidence: verdict.confidence,
        at: snap.at,
      };
      history.push(event);
      if (history.length > HISTORY) history.shift();
      onEvent(event);
    }
    if (state.pendingSince !== null || state.stalledSince !== null) schedule(tickMs);
  }

  const mutations = new MutationObserver(() => schedule(debounceMs));
  mutations.observe(doc.documentElement, { subtree: true, childList: true, attributes: true, characterData: true });
  evaluate();

  return {
    verdict: () => verdict,
    debug: () => ({ verdict, readings, history: [...history] }),
    stop() {
      stopped = true;
      mutations.disconnect();
      for (const video of watched) for (const type of VIDEO_EVENTS) video.removeEventListener(type, onVideoEvent);
      if (timer !== null) view.clearTimeout(timer);
      timer = null;
    },
  };
}
