/** Per tab: whether the viewer had already muted it when a break started. */
export type MuteMemory = Map<number, boolean>;

/**
 * What to do with a tab's sound at the start or end of a break.
 * A tab the viewer muted themselves stays muted after the break.
 */
export function mutePlan(
  memory: MuteMemory,
  tabId: number,
  event: 'start' | 'end',
  mutedNow: boolean,
): { setMuted?: boolean } {
  if (event === 'start') {
    if (!memory.has(tabId)) memory.set(tabId, mutedNow);
    return mutedNow ? {} : { setMuted: true };
  }
  const wasMuted = memory.get(tabId) ?? false;
  memory.delete(tabId);
  return wasMuted ? {} : { setMuted: false };
}
