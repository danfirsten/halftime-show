import { mutePlan, type MuteMemory } from './mute-plan';
import { sessionRecord } from './session-record';

// The one way the extension changes a tab's sound: the tab mute (Chrome, Firefox). Safari's fallback, the video
// element, arrives in #21. Whether the viewer had muted the tab is kept in storage.session, so a viewer-muted tab
// stays muted even if the service worker was stopped during the break.

const remembered = sessionRecord<boolean>('muteMemory', (v): v is boolean => typeof v === 'boolean');

async function mutedNow(tabId: number): Promise<boolean> {
  const tab = await browser.tabs.get(tabId);
  return tab.mutedInfo?.muted ?? false;
}

async function apply(tabId: number, event: 'start' | 'end', muted: boolean): Promise<boolean> {
  const memory: MuteMemory = new Map();
  const before = await remembered.get(tabId);
  if (before !== undefined) memory.set(tabId, before);
  const plan = mutePlan(memory, tabId, event, muted);
  const after = memory.get(tabId);
  if (after === undefined) await remembered.delete(tabId);
  else if (after !== before) await remembered.set(tabId, after);
  if (plan.setMuted === undefined) return muted;
  await browser.tabs.update(tabId, { muted: plan.setMuted });
  return plan.setMuted;
}

/** A break started: mute the tab, remembering whether the viewer had muted it. Returns whether it is muted now. */
export async function muteTab(tabId: number): Promise<boolean> {
  return apply(tabId, 'start', await mutedNow(tabId));
}

/** The break ended: put the sound back as the viewer had it. A tab with no break on is left alone. Returns whether
 *  it is muted now. */
export async function unmuteTab(tabId: number): Promise<boolean> {
  const muted = await mutedNow(tabId);
  if ((await remembered.get(tabId)) === undefined) return muted;
  return apply(tabId, 'end', muted);
}

/** The tab was closed: forget it. */
export async function forgetTab(tabId: number): Promise<void> {
  await remembered.delete(tabId);
}
