import type { SessionRecord } from './session-record';

// The background's side of a break, per tab: mute at the start, put the sound back at the end, and count the ad
// time dodged. Steps for one tab run one at a time, so a quick start and end can't cross.

export interface BreakKeeperDeps {
  /** src/lib/mute.ts. Each resolves with whether the tab is muted afterwards. */
  mute(tabId: number): Promise<boolean>;
  unmute(tabId: number): Promise<boolean>;
  /** When each tab's break started (ms). Kept in storage.session so a stopped worker doesn't lose it. */
  starts: SessionRecord<number>;
  record(seconds: number): Promise<void>;
  now(): number;
}

export interface BreakKeeper {
  /** A break is on. `fresh`: it is a new break, so its clock starts now even if an old start was left behind (a page
   *  that reloaded while the worker was stopped never said its break ended). Without it (a reconnect mid break), the
   *  first start is kept. */
  start(tabId: number, how?: { fresh?: boolean }): Promise<boolean>;
  /** Ends the tab's break if one is on. `notAd`: the viewer said it wasn't an ad, so nothing is counted. */
  end(tabId: number, how?: { notAd?: boolean }): Promise<boolean>;
}

export function createBreakKeeper(deps: BreakKeeperDeps): BreakKeeper {
  const chains = new Map<number, Promise<unknown>>();

  function serial<T>(tabId: number, step: () => Promise<T>): Promise<T> {
    const next = (chains.get(tabId) ?? Promise.resolve()).then(step);
    const settled = next.catch(() => undefined);
    chains.set(tabId, settled);
    void settled.then(() => {
      if (chains.get(tabId) === settled) chains.delete(tabId);
    });
    return next;
  }

  return {
    start(tabId, how = {}) {
      return serial(tabId, async () => {
        if (how.fresh || (await deps.starts.get(tabId)) === undefined) await deps.starts.set(tabId, deps.now());
        return deps.mute(tabId);
      });
    },
    end(tabId, how = {}) {
      return serial(tabId, async () => {
        const startedAt = await deps.starts.get(tabId);
        await deps.starts.delete(tabId);
        try {
          // Sound first; the count can wait a moment.
          return await deps.unmute(tabId);
        } finally {
          if (startedAt !== undefined && !how.notAd) {
            const seconds = Math.round((deps.now() - startedAt) / 1000);
            if (seconds > 0) await deps.record(seconds).catch(() => undefined);
          }
        }
      });
    },
  };
}
