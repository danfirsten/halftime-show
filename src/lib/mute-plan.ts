/** Per tab (or, in the page fallback, per video element): whether the viewer had already muted it when a break
 *  started. */
export type MuteMemory<K = number> = Map<K, boolean>;

/**
 * What to do with a tab's sound (or a video element's) at the start or end of a break.
 * A tab or player the viewer muted themselves stays muted after the break.
 */
export function mutePlan<K>(
  memory: MuteMemory<K>,
  key: K,
  event: 'start' | 'end',
  mutedNow: boolean,
): { setMuted?: boolean } {
  if (event === 'start') {
    if (!memory.has(key)) memory.set(key, mutedNow);
    return mutedNow ? {} : { setMuted: true };
  }
  const wasMuted = memory.get(key) ?? false;
  memory.delete(key);
  return wasMuted ? {} : { setMuted: false };
}
