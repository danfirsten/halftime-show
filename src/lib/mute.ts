import { mutePlan, type MuteMemory } from './mute-plan';
import { sessionRecord, type SessionRecord } from './session-record';

// The one way the extension changes a tab's sound, two ways round:
// - The tab mute, where the browser lets an extension mute a tab (Chrome, Firefox). The background does it.
//   Whether the viewer had muted the tab is kept in storage.session, so a viewer-muted tab stays muted even if the
//   service worker was stopped during the break.
// - Otherwise (Safari), the page's own video: the content script mutes each video element for the break and puts
//   it back as the viewer had it (createPageMuter below). Which one is checked at run time, never assumed.

let remembered: SessionRecord<boolean> | undefined;
const memoryOf = () => (remembered ??= sessionRecord<boolean>('muteMemory', (v): v is boolean => typeof v === 'boolean'));

/** Whether the tab is muted now, or null where the browser can't say (it has no tab mute: Safari). */
async function mutedNow(tabId: number): Promise<boolean | null> {
  const tab = await browser.tabs.get(tabId);
  return typeof tab.mutedInfo?.muted === 'boolean' ? tab.mutedInfo.muted : null;
}

/** Whether this browser can mute the tab from the extension. Where it can't, the page mutes its video instead. */
export async function canMuteTab(tabId: number): Promise<boolean> {
  return (await mutedNow(tabId)) !== null;
}

async function apply(tabId: number, event: 'start' | 'end', muted: boolean): Promise<boolean> {
  const record = memoryOf();
  const memory: MuteMemory = new Map();
  const before = await record.get(tabId);
  if (before !== undefined) memory.set(tabId, before);
  const plan = mutePlan(memory, tabId, event, muted);
  const after = memory.get(tabId);
  if (after === undefined) await record.delete(tabId);
  else if (after !== before) await record.set(tabId, after);
  if (plan.setMuted === undefined) return muted;
  await browser.tabs.update(tabId, { muted: plan.setMuted });
  return plan.setMuted;
}

/** A break started: mute the tab, remembering whether the viewer had muted it. Returns whether it is muted now.
 *  A browser with no tab mute is left alone (false): the page mutes its video. */
export async function muteTab(tabId: number): Promise<boolean> {
  const muted = await mutedNow(tabId);
  if (muted === null) return false;
  return apply(tabId, 'start', muted);
}

/** The break ended: put the sound back as the viewer had it. A tab with no break on is left alone. Returns whether
 *  it is muted now. */
export async function unmuteTab(tabId: number): Promise<boolean> {
  const muted = await mutedNow(tabId);
  if (muted === null) return false;
  if ((await memoryOf().get(tabId)) === undefined) return muted;
  return apply(tabId, 'end', muted);
}

/** The tab was closed: forget it. */
export async function forgetTab(tabId: number): Promise<void> {
  await memoryOf().delete(tabId);
}

export interface PageMuter {
  /** A break started on a browser with no tab mute: mute every video on the page, and any that appears or is
   *  unmuted by the player, until `end`. Calling it again during the break changes nothing. */
  start(): void;
  /** The break ended: give each video back the mute and volume the viewer had. Returns whether the player is still
   *  muted (the viewer had muted it), or null if no break was on. */
  end(): boolean | null;
}

const MEDIA = 'video, audio';
const MEDIA_EVENTS = ['volumechange', 'loadstart', 'play', 'playing'];

/** The content script's fallback: mutes the page's video elements, never the ad's timing or picture. */
export function createPageMuter(doc: Document = document): PageMuter {
  const memory: MuteMemory<HTMLMediaElement> = new Map();
  const volumes = new Map<HTMLMediaElement, number>();
  let observer: MutationObserver | null = null;

  // Mutes one element, keeping what the viewer had the first time it is seen this break. Run again whenever the
  // player touches it, so a player that unmutes itself mid break is muted again at once.
  function hold(media: HTMLMediaElement) {
    if (!memory.has(media)) volumes.set(media, media.volume);
    if (mutePlan(memory, media, 'start', media.muted).setMuted) media.muted = true;
  }
  const sweep = () => doc.querySelectorAll<HTMLMediaElement>(MEDIA).forEach(hold);
  const onMedia = (event: Event) => {
    const target = event.target as Partial<HTMLMediaElement> | null;
    if (target && typeof target.muted === 'boolean' && typeof target.volume === 'number') hold(target as HTMLMediaElement);
  };

  return {
    start() {
      if (observer) return;
      for (const type of MEDIA_EVENTS) doc.addEventListener(type, onMedia, true);
      observer = new MutationObserver(sweep);
      observer.observe(doc.documentElement, { childList: true, subtree: true });
      sweep();
    },
    end() {
      if (!observer) return null;
      observer.disconnect();
      observer = null;
      for (const type of MEDIA_EVENTS) doc.removeEventListener(type, onMedia, true);
      const kept: HTMLMediaElement[] = [];
      for (const media of [...memory.keys()]) {
        const volume = volumes.get(media);
        if (volume !== undefined && media.volume !== volume) media.volume = volume;
        if (mutePlan(memory, media, 'end', media.muted).setMuted === false) media.muted = false;
        if (media.isConnected) kept.push(media);
      }
      volumes.clear();
      return kept.length > 0 && kept.every((media) => media.muted);
    },
  };
}
