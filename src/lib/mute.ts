import { mutePlan, type MuteMemory } from './mute-plan';

const memory: MuteMemory = new Map();

export async function muteTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  const plan = mutePlan(memory, tabId, 'start', tab.mutedInfo?.muted ?? false);
  if (plan.setMuted !== undefined) await browser.tabs.update(tabId, { muted: plan.setMuted });
}

export async function unmuteTab(tabId: number): Promise<void> {
  const tab = await browser.tabs.get(tabId);
  const plan = mutePlan(memory, tabId, 'end', tab.mutedInfo?.muted ?? false);
  if (plan.setMuted !== undefined) await browser.tabs.update(tabId, { muted: plan.setMuted });
}
