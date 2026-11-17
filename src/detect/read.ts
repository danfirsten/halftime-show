import { parseClock, type Reading, type Snapshot } from './score';
import type { SignalSpec, SiteProfile } from '../sites/types';

/** Set by the capture tool on elements that weren't rendered, so a saved snapshot still knows. */
export const HIDDEN_MARK = 'data-ht-hidden';
/** Set by the capture tool on the video: its duration and whether it was stalled. */
export const DURATION_MARK = 'data-ht-duration';
export const STALLED_MARK = 'data-ht-stalled';

/** What the detector remembers between reads: the longest video duration it has seen. */
export interface ReadMemory {
  longestDuration: number;
}

export function findVideo(root: ParentNode, site: SiteProfile): HTMLVideoElement | null {
  for (const selector of site.videoSelectors) {
    const el = root.querySelector(selector);
    if (el && el.tagName === 'VIDEO') return el as HTMLVideoElement;
  }
  return null;
}

/** Shown means rendered: no hidden attribute, display or visibility on it or an ancestor. */
export function isShown(el: Element): boolean {
  const view = el.ownerDocument.defaultView;
  for (let node: Element | null = el; node; node = node.parentElement) {
    if (node.hasAttribute('hidden') || node.hasAttribute(HIDDEN_MARK)) return false;
    const style = view?.getComputedStyle(node);
    if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  }
  return true;
}

function matches(spec: SignalSpec, el: Element): boolean {
  if (!spec.evenHidden && !isShown(el)) return false;
  if (spec.text && !spec.text.test(el.textContent ?? '')) return false;
  if (spec.attr && !spec.attr.pattern.test(el.getAttribute(spec.attr.name) ?? '')) return false;
  return true;
}

function firstMatch(root: ParentNode, spec: SignalSpec): Element | null {
  for (const selector of spec.selectors) {
    for (const el of root.querySelectorAll(selector)) if (matches(spec, el)) return el;
  }
  return null;
}

/** A video's duration, live or as the capture tool recorded it. NaN when unknown. */
export function videoDuration(video: HTMLVideoElement | null): number {
  if (!video) return NaN;
  const marked = video.getAttribute(DURATION_MARK);
  if (marked !== null) return Number(marked);
  return Number.isFinite(video.duration) ? video.duration : NaN;
}

/** Playing but waiting for data (HAVE_FUTURE_DATA not reached), live or as recorded. */
export function videoStalled(video: HTMLVideoElement | null): boolean {
  if (!video) return false;
  if (video.hasAttribute(STALLED_MARK)) return true;
  return video.isConnected && !video.paused && !video.ended && video.readyState > 0 && video.readyState < 3;
}

/** Reads every signal the site defines from the page (or a saved snapshot of it). */
export function readSnapshot(root: ParentNode, site: SiteProfile, at: number, memory?: ReadMemory): Snapshot {
  let secondsLeft: number | null = null;
  const readings: Reading[] = site.signals.map((spec) => {
    const el = firstMatch(root, spec);
    if (el && spec.countdown) secondsLeft = parseClock(el.textContent ?? '');
    return { id: spec.id, group: spec.group, weight: spec.weight, on: el !== null };
  });

  const video = findVideo(root, site);
  const drop = site.durationDrop;
  if (drop) {
    const duration = videoDuration(video);
    const longest = Math.max(memory?.longestDuration ?? 0, Number.isFinite(duration) ? duration : 0);
    if (memory) memory.longestDuration = longest;
    const on = longest >= drop.fromSeconds && duration > 0 && duration <= drop.toSeconds;
    readings.push({ id: drop.id, group: drop.group, weight: drop.weight, on });
  }

  return { at, readings, secondsLeft, stalled: videoStalled(video) };
}
